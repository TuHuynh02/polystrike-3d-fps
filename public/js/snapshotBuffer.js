// Snapshot interpolation for REMOTE entities (other players). Pure module: no DOM, no Three.js.
//
//   ServerClock          maps the local clock to (estimated) server time from the `t` stamped on every stateUpdate
//   SnapshotBuffer       the last ~1 s of server snapshots of ONE entity + sampling (interpolate / snap / extrapolate)
//   SnapshotInterpolator ServerClock + one SnapshotBuffer per entity: the object Game3D talks to
//
// Remote entities are drawn at   renderTime = estimatedServerNow - INTERP_DELAY_MS   (INTERP_DELAY_MS lives in
// shared/config.js and is ALSO the allowance of the server's lag-compensation rewind, shared/lagCompensation.js).
//
// ---------------------------------------------------------------------------------------------------------------------
// Clock model (ServerClock)
//   Every accepted stateUpdate gives one sample  o = serverT - localReceiveTime  =  clockOffset - (one-way delay + jitter).
//   Jitter and queueing only ever ADD delay, so the best estimate of the offset is made of the samples with the LOWEST
//   delay: o_best = the 10th-percentile-lowest-delay sample of a sliding window of the last CLOCK_WINDOW (64, ~2.5 s)
//   samples. A latency spike (one or a few late packets) therefore cannot move the clock at all; a persistent change of
//   the path delay is followed once it has filled ~90 % of the window.
//   o_best is the offset to the server clock as seen through the FASTEST path, i.e. local + o_best = trueServerNow - minOwd.
//   The one-way latency is added back:  minOwd = min(last RTT_WINDOW client-measured round trips) / 2  (setRttMs), so
//   serverNow = local + o_best + minOwd approximates the TRUE server time. This is what makes the render time line up
//   with the server's rewind (rewind = rtt/2 + INTERP_DELAY_MS, measured from the moment the shot reaches the server).
//   Until a RTT is known minOwd = 0 (the render then simply lags by an extra one-way delay, which is safe).
//   The offset used for rendering slews towards that target by at most CLOCK_SLEW_RATE (5 %) of elapsed local time, so
//   the render clock runs at 0.95x .. 1.05x speed while it converges and can NEVER go backwards; renderTime() is
//   additionally clamped to its previous value. A jump of more than CLOCK_RESYNC_MS (1 s) is treated as a hard re-sync
//   (server restart / clock step) and applied at once (the only case where the clock may move backwards in value).
// ---------------------------------------------------------------------------------------------------------------------

import { INTERP_DELAY_MS } from '../shared/config.js';

/** Snapshot history kept per entity (ms of server time). */
export const SNAPSHOT_HISTORY_MS = 1000;
/** Starved sampling (render time beyond the newest snapshot) extrapolates by velocity for at most this long, then holds. */
export const MAX_EXTRAPOLATION_MS = 100;
/** Consecutive snapshots further apart than this (metres, 3D) are a teleport: no interpolation across them. */
export const TELEPORT_SNAP_DISTANCE = 12;
/** A snapshot/envelope older than the newest one by more than this is an epoch change (e.g. new server), not reordering. */
export const SNAPSHOT_EPOCH_RESET_MS = 5000;

/** Sliding window of clock samples (~2.5 s at 25 Hz). */
export const CLOCK_WINDOW = 64;
/** The offset is taken from the sample at this fraction of the window when ordered by increasing delay (0 = fastest). */
export const CLOCK_DELAY_PERCENTILE = 0.1;
/** Max speed (fraction of elapsed local time) at which the render clock is slewed towards a new offset estimate. */
export const CLOCK_SLEW_RATE = 0.05;
/** Offset error above which the clock is re-synchronised instantly instead of slewed. */
export const CLOCK_RESYNC_MS = 1000;
/** Number of client-measured round trips kept; their minimum gives the one-way latency compensation. */
export const RTT_WINDOW = 6;
/** Upper bound of the one-way latency compensation (ms). */
export const MAX_OWD_MS = 250;

const TAU = Math.PI * 2;

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const num = (v, fallback = 0) => (isNum(v) ? v : fallback);

/** Wraps an angle to [-PI, PI). */
export function wrapAngle(a) {
  let r = (a + Math.PI) % TAU;
  if (r < 0) r += TAU;
  return r - Math.PI;
}

/** Shortest-arc interpolation between two angles (result wrapped to [-PI, PI)). */
export function lerpAngle(a, b, k) {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  else if (d < -Math.PI) d += TAU;
  return wrapAngle(a + d * k);
}

export class ServerClock {
  constructor(opts = {}) {
    this.windowSize = opts.windowSize || CLOCK_WINDOW;
    this.percentile = isNum(opts.percentile) ? opts.percentile : CLOCK_DELAY_PERCENTILE;
    this.slewRate = isNum(opts.slewRate) ? opts.slewRate : CLOCK_SLEW_RATE;
    this.resyncMs = isNum(opts.resyncMs) ? opts.resyncMs : CLOCK_RESYNC_MS;
    this.epochResetMs = isNum(opts.epochResetMs) ? opts.epochResetMs : SNAPSHOT_EPOCH_RESET_MS;
    this.reset();
  }

  reset() {
    this.samples = [];          // ring buffer of o = serverT - localReceive
    this._ringHead = 0;
    this._scratch = [];
    this.newestServerT = -Infinity;
    this.bestOffsetMs = 0;      // low-delay estimate of (serverT - local) before the one-way compensation
    this.owdMs = 0;
    this._rtts = [];
    this.targetMs = 0;          // bestOffsetMs + owdMs
    this.offsetMs = 0;          // slewed offset actually used: serverNow = local + offsetMs
    this.initialised = false;
    this._advancedAt = null;
    this._lastServerNow = -Infinity;
    this.resyncCount = 0;
    this.epochResets = this.epochResets || 0;
  }

  /**
   * Feeds one stateUpdate stamp. Duplicates / reordered envelopes (serverT not newer than the newest seen) are ignored
   * (returns false). `localMs` is the local receive time (performance.now()).
   */
  observe(serverT, localMs) {
    if (!isNum(serverT) || !isNum(localMs)) return false;
    if (serverT <= this.newestServerT) {
      if (this.newestServerT - serverT <= this.epochResetMs) return false;
      // far in the past: a different server epoch (server restart) - start over, but keep the measured latency
      const rtts = this._rtts;
      this.reset();
      this._rtts = rtts;
      this.epochResets++;
      this._recomputeOwd();
    }
    this.newestServerT = serverT;

    const o = serverT - localMs;
    if (this.samples.length < this.windowSize) {
      this.samples.push(o);
    } else {
      this.samples[this._ringHead] = o;
      this._ringHead = (this._ringHead + 1) % this.windowSize;
    }
    this._retarget();
    if (!this.initialised) {
      this.offsetMs = this.targetMs;
      this._advancedAt = localMs;
      this.initialised = true;
    }
    return true;
  }

  /** Feeds one client-measured round-trip time (ms); the minimum of the last RTT_WINDOW gives the one-way compensation. */
  setRttMs(rttMs) {
    if (!isNum(rttMs) || rttMs < 0) return;
    this._rtts.push(rttMs);
    if (this._rtts.length > RTT_WINDOW) this._rtts.shift();
    this._recomputeOwd();
    this._retarget();
  }

  _recomputeOwd() {
    let min = Infinity;
    for (let i = 0; i < this._rtts.length; i++) if (this._rtts[i] < min) min = this._rtts[i];
    this.owdMs = min === Infinity ? 0 : Math.max(0, Math.min(MAX_OWD_MS, min / 2));
  }

  _retarget() {
    const n = this.samples.length;
    if (n === 0) return;
    const s = this._scratch;
    s.length = n;
    for (let i = 0; i < n; i++) s[i] = this.samples[i];
    s.sort((a, b) => b - a); // largest o first = smallest delay first
    const idx = Math.min(n - 1, Math.max(0, Math.floor(this.percentile * (n - 1))));
    this.bestOffsetMs = s[idx];
    this.targetMs = this.bestOffsetMs + this.owdMs;
  }

  _advance(localMs) {
    if (!this.initialised) return;
    if (this._advancedAt === null) this._advancedAt = localMs;
    const dt = localMs - this._advancedAt;
    if (!(dt > 0)) return;
    this._advancedAt = localMs;
    const diff = this.targetMs - this.offsetMs;
    if (Math.abs(diff) > this.resyncMs) {
      this.offsetMs = this.targetMs;
      this._lastServerNow = -Infinity; // hard re-sync: allowed to jump
      this.resyncCount++;
      return;
    }
    const maxStep = this.slewRate * dt;
    this.offsetMs += Math.max(-maxStep, Math.min(maxStep, diff));
  }

  /** Estimated TRUE server time (ms) at local time `localMs`; never decreases between calls (except hard re-sync). NaN until the first stamp. */
  serverNow(localMs) {
    if (!this.initialised || !isNum(localMs)) return NaN;
    this._advance(localMs);
    let v = localMs + this.offsetMs;
    if (v < this._lastServerNow) v = this._lastServerNow;
    this._lastServerNow = v;
    return v;
  }
}

function copyEntity(raw, t) {
  return {
    t,
    x: num(raw.x),
    y: num(raw.y),
    z: num(raw.z),
    yaw: num(raw.yaw),
    pitch: num(raw.pitch),
    lean: num(raw.lean),
    crouching: Boolean(raw.crouching ?? raw.crouch),
    prone: Boolean(raw.prone),
    vx: num(raw.vx),
    vy: num(raw.vy),
    vz: num(raw.vz),
    alive: raw.alive === undefined ? true : Boolean(raw.alive),
    weapon: raw.weapon === undefined ? null : raw.weapon,
    // true => do not interpolate between the previous snapshot and this one (first / teleport / alive flip)
    discontinuity: false
  };
}

function fillOut(out, s, vx, vy, vz) {
  out.x = s.x;
  out.y = s.y;
  out.z = s.z;
  out.yaw = s.yaw;
  out.pitch = s.pitch;
  out.lean = s.lean;
  out.crouching = s.crouching;
  out.prone = s.prone;
  out.alive = s.alive;
  out.weapon = s.weapon;
  out.vx = vx;
  out.vy = vy;
  out.vz = vz;
  return out;
}

export class SnapshotBuffer {
  constructor(opts = {}) {
    this.historyMs = isNum(opts.historyMs) ? opts.historyMs : SNAPSHOT_HISTORY_MS;
    this.teleportDistance = isNum(opts.teleportDistance) ? opts.teleportDistance : TELEPORT_SNAP_DISTANCE;
    this.maxExtrapolationMs = isNum(opts.maxExtrapolationMs) ? opts.maxExtrapolationMs : MAX_EXTRAPOLATION_MS;
    this.epochResetMs = isNum(opts.epochResetMs) ? opts.epochResetMs : SNAPSHOT_EPOCH_RESET_MS;
    this.snaps = [];
  }

  get length() {
    return this.snaps.length;
  }

  get newestT() {
    return this.snaps.length ? this.snaps[this.snaps.length - 1].t : -Infinity;
  }

  clear() {
    this.snaps.length = 0;
  }

  /**
   * Adds a snapshot `{ t, x, y, z, yaw, pitch, lean, crouching, prone, vx, vy, vz, alive, weapon }` (t = server ms,
   * or the explicit second argument).
   * Returns false (and stores nothing) for duplicates and snapshots older than the newest. `seq` is deliberately not
   * used (it wraps); ordering is by `t`.
   */
  push(raw, t = raw && raw.t) {
    if (!raw || !isNum(t)) return false;
    const snaps = this.snaps;
    let last = snaps.length ? snaps[snaps.length - 1] : null;
    if (last && t <= last.t) {
      if (last.t - t <= this.epochResetMs) return false;
      snaps.length = 0; // different server epoch
      last = null;
    }
    const s = copyEntity(raw, t);
    if (last) {
      const dist = Math.hypot(s.x - last.x, s.y - last.y, s.z - last.z);
      s.discontinuity = dist > this.teleportDistance || s.alive !== last.alive || raw.snap === true;
    } else {
      s.discontinuity = true;
    }
    snaps.push(s);

    // Keep ~historyMs; the newest snapshot at/below the cutoff stays as the anchor of the oldest interval
    const cutoff = s.t - this.historyMs;
    while (snaps.length > 2 && snaps[1].t <= cutoff) snaps.shift();
    return true;
  }

  /**
   * Samples the entity at server time `renderT` into `out` (allocated when omitted); null when the buffer is empty.
   *  - before the oldest snapshot: holds it
   *  - between two snapshots: linear interpolation (shortest-arc for yaw); a discontinuity (teleport > 12 m, alive flip,
   *    first snapshot) is NOT interpolated: the earlier snapshot is held until the later one is reached, then it is taken
   *    (a snap, never a streak). Discrete flags (crouching, prone, alive, weapon) come from the earlier snapshot.
   *  - beyond the newest snapshot (starved): velocity extrapolation for at most maxExtrapolationMs, then hold.
   * `out.vx/vy/vz` is the interpolated motion (segment slope) used for animation speed; `out.extrapolated` marks starvation.
   */
  sample(renderT, out = {}) {
    const snaps = this.snaps;
    const n = snaps.length;
    if (n === 0 || !isNum(renderT)) return null;
    out.extrapolated = false;
    out.snapped = false;

    const first = snaps[0];
    if (renderT <= first.t) {
      return fillOut(out, first, 0, 0, 0);
    }

    const last = snaps[n - 1];
    if (renderT >= last.t) {
      const over = renderT - last.t;
      fillOut(out, last, last.vx, last.vy, last.vz);
      if (over > 0 && last.alive) {
        const e = Math.min(over, this.maxExtrapolationMs) / 1000;
        out.x = last.x + last.vx * e;
        out.z = last.z + last.vz * e;
        if (last.vy > 0) out.y = last.y + last.vy * e; // never sink through the floor while falling
        out.extrapolated = true;
        if (over > this.maxExtrapolationMs) {
          out.vx = 0;
          out.vy = 0;
          out.vz = 0;
        }
      }
      return out;
    }

    let i = n - 2;
    while (i > 0 && snaps[i].t > renderT) i--;
    const a = snaps[i];
    const b = snaps[i + 1];

    if (b.discontinuity) {
      out.snapped = true;
      return fillOut(out, a, a.vx, a.vy, a.vz);
    }

    const span = b.t - a.t;
    const k = span > 0 ? (renderT - a.t) / span : 1;
    const invSec = span > 0 ? 1000 / span : 0;
    fillOut(
      out,
      a,
      (b.x - a.x) * invSec,
      (b.y - a.y) * invSec,
      (b.z - a.z) * invSec
    );
    out.x = a.x + (b.x - a.x) * k;
    out.y = a.y + (b.y - a.y) * k;
    out.z = a.z + (b.z - a.z) * k;
    out.yaw = lerpAngle(a.yaw, b.yaw, k);
    out.pitch = a.pitch + (b.pitch - a.pitch) * k;
    out.lean = a.lean + (b.lean - a.lean) * k;
    return out;
  }
}

export class SnapshotInterpolator {
  constructor(opts = {}) {
    this.interpDelayMs = isNum(opts.interpDelayMs) ? opts.interpDelayMs : INTERP_DELAY_MS;
    this.opts = opts;
    this.clock = new ServerClock(opts);
    this.buffers = new Map(); // entity id -> SnapshotBuffer
  }

  has(id) {
    return this.buffers.has(id);
  }

  get size() {
    return this.buffers.size;
  }

  setRttMs(rttMs) {
    this.clock.setRttMs(rttMs);
  }

  /**
   * One stateUpdate envelope: `serverT` = its `t`, `localMs` = local receive time, `entities` = player objects (each
   * with an `id`), `skipId` = the local player (not interpolated). Returns false when the envelope is a duplicate / older
   * than the newest one (nothing is stored then).
   */
  pushState(serverT, localMs, entities, skipId = null) {
    if (!Array.isArray(entities)) return false;
    const epochs = this.clock.epochResets;
    if (!this.clock.observe(serverT, localMs)) return false;
    if (this.clock.epochResets !== epochs) this.buffers.clear(); // server restart: old snapshots are meaningless
    for (let i = 0; i < entities.length; i++) {
      const e = entities[i];
      if (!e || e.id === undefined || e.id === skipId) continue;
      let buf = this.buffers.get(e.id);
      if (!buf) {
        buf = new SnapshotBuffer(this.opts);
        this.buffers.set(e.id, buf);
      }
      buf.push(e, serverT);
    }
    return true;
  }

  /** Estimated server time shown on screen at local time `localMs` (NaN before the first snapshot); never decreases. */
  renderTime(localMs) {
    const s = this.clock.serverNow(localMs); // already monotone
    return isNum(s) ? s - this.interpDelayMs : NaN;
  }

  sample(id, renderT, out) {
    const buf = this.buffers.get(id);
    return buf ? buf.sample(renderT, out) : null;
  }

  /** Forget the history of one entity (respawn: no streak from the death position). */
  reset(id) {
    const buf = this.buffers.get(id);
    if (buf) buf.clear();
  }

  /** Drops the entity's buffer (entity left the match). */
  remove(id) {
    this.buffers.delete(id);
  }

  clear() {
    this.buffers.clear();
    const rtts = this.clock._rtts; // the latency measurements stay valid across matches
    this.clock.reset();
    this.clock._rtts = rtts;
    this.clock._recomputeOwd();
  }
}
