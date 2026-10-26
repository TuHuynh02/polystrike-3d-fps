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

import { INTERP_DELAY_MS, INTERP_DELAY_MIN_MS, INTERP_DELAY_MAX_MS, MAX_LAG_COMP_REWIND_MS } from '../shared/config.js';

/** Snapshot history kept per entity (ms of server time). */
export const SNAPSHOT_HISTORY_MS = 1000;
/**
 * Starved sampling (render time beyond the newest snapshot) extrapolates with a DAMPED velocity for at most this long, then
 * holds: displacement = v * TAU * (1 - exp(-e / TAU)), so the entity decelerates instead of running on at full speed in a
 * direction it may already have left (and never overshoots by more than v * TAU).
 */
export const MAX_EXTRAPOLATION_MS = 250;
export const EXTRAPOLATION_TAU_MS = 120;
/** Rate (1/s) of the critically damped spring that blends a rendered pose back onto the real path after starvation. */
export const CATCHUP_OMEGA = 10;
/** A jump of the raw path smaller than this (m) is not worth a correction offset. */
export const CATCHUP_MIN_JUMP = 0.02;
/** Largest EXTRA speed (m/s) the catch-up may add on top of the real motion: big offsets are paid back more slowly. */
export const CATCHUP_MAX_EXTRA_SPEED = 9;
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

/**
 * In-place 3-way Dutch National Flag quickselect returning the k-th smallest element (0 <= k < n)
 * of arr[0..n-1] in O(n) average time (and single-pass O(n) on all-equal arrays) with zero closure allocations.
 */
export function quickselectAsc(arr, n, k) {
  let left = 0;
  let right = n - 1;
  while (left < right) {
    const pivot = arr[(left + right) >> 1];
    let lt = left;
    let i = left;
    let gt = right;
    while (i <= gt) {
      const v = arr[i];
      if (v < pivot) {
        arr[i] = arr[lt];
        arr[lt] = v;
        lt++;
        i++;
      } else if (v > pivot) {
        arr[i] = arr[gt];
        arr[gt] = v;
        gt--;
      } else {
        i++;
      }
    }
    if (k < lt) {
      right = lt - 1;
    } else if (k > gt) {
      left = gt + 1;
    } else {
      return pivot;
    }
  }
  return arr[k];
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
    // largest o first = smallest delay first -> index idx descending equals index (n - 1 - idx) ascending
    const idx = Math.min(n - 1, Math.max(0, Math.floor(this.percentile * (n - 1))));
    this.bestOffsetMs = quickselectAsc(s, n, n - 1 - idx);
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

function writeEntity(out, raw, t) {
  out.t = t;
  out.x = num(raw.x);
  out.y = num(raw.y);
  out.z = num(raw.z);
  out.yaw = num(raw.yaw);
  out.pitch = num(raw.pitch);
  out.lean = num(raw.lean);
  out.crouching = Boolean(raw.crouching ?? raw.crouch);
  out.prone = Boolean(raw.prone);
  out.sliding = Boolean(raw.sliding ?? raw.isSliding);
  out.vx = num(raw.vx);
  out.vy = num(raw.vy);
  out.vz = num(raw.vz);
  out.alive = raw.alive === undefined ? true : Boolean(raw.alive);
  out.weapon = raw.weapon === undefined ? null : raw.weapon;
  out.armor = num(raw.armor);
  out.speedBoostMs = num(raw.speedBoostMs);
  out.damageBoostMs = num(raw.damageBoostMs);
  // true => do not interpolate between the previous snapshot and this one (first / teleport / alive flip)
  out.discontinuity = false;
  out.smoothed = false;
  return out;
}

function copyEntity(raw, t) {
  return writeEntity({}, raw, t);
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
  out.sliding = Boolean(s.sliding);
  out.alive = s.alive;
  out.weapon = s.weapon;
  out.armor = s.armor || 0;
  out.speedBoostMs = s.speedBoostMs || 0;
  out.damageBoostMs = s.damageBoostMs || 0;
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
    this.extrapolationTauMs = isNum(opts.extrapolationTauMs) ? opts.extrapolationTauMs : EXTRAPOLATION_TAU_MS;
    this.epochResetMs = isNum(opts.epochResetMs) ? opts.epochResetMs : SNAPSHOT_EPOCH_RESET_MS;
    this.snaps = [];
    this._pool = [];
  }

  get length() {
    return this.snaps.length;
  }

  get newestT() {
    return this.snaps.length ? this.snaps[this.snaps.length - 1].t : -Infinity;
  }

  clear() {
    for (let i = 0; i < this.snaps.length; i++) {
      this._pool.push(this.snaps[i]);
    }
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
      this.clear(); // different server epoch
      last = null;
    }
    const s = this._pool.length > 0 ? writeEntity(this._pool.pop(), raw, t) : copyEntity(raw, t);
    if (last) {
      const dist = Math.hypot(s.x - last.x, s.y - last.y, s.z - last.z);
      s.discontinuity = dist > this.teleportDistance || s.alive !== last.alive || raw.snap === true;
      // Smooth single-tick command starvation / bunching (e.g. 0-cmd tick followed by 4-cmd catch-up tick when a
      // 33ms inputBatch arrives just after a 40ms server tick while the remote player is moving steadily).
      if (snaps.length >= 2 && !s.discontinuity && !last.discontinuity) {
        const prev = snaps[snaps.length - 2];
        if (prev.alive && last.alive && s.alive) {
          const dt1 = last.t - prev.t;
          const dt2 = s.t - last.t;
          if (dt1 > 0 && dt1 <= 65 && dt2 > 0 && dt2 <= 65) {
            const speedLast = Math.hypot(last.vx, last.vz);
            const speedS = Math.hypot(s.vx, s.vz);
            if (speedLast > 0.5 && speedS > 0.5 && Math.hypot(s.vx - last.vx, s.vz - last.vz) < 0.8) {
              const d1 = Math.hypot(last.x - prev.x, last.z - prev.z);
              const d2 = Math.hypot(s.x - last.x, s.z - last.z);
              if (
                (d1 < 1e-3 && d2 > 0.04) ||
                (d2 > 2.2 * Math.max(d1, 1e-4) && d2 > 0.06 && Math.hypot(last.vx - prev.vx, last.vz - prev.vz) < 0.5)
              ) {
                const frac = dt1 / (dt1 + dt2);
                const midX = prev.x + (s.x - prev.x) * frac;
                const midZ = prev.z + (s.z - prev.z) * frac;
                if (Math.hypot(last.x - midX, last.z - midZ) < 0.55) {
                  last.x = midX;
                  last.z = midZ;
                  last.y = prev.y + (s.y - prev.y) * frac;
                  last.smoothed = true;
                }
              }
            }
          }
        }
      }
    } else {
      s.discontinuity = true;
    }
    snaps.push(s);

    // Keep ~historyMs; the newest snapshot at/below the cutoff stays as the anchor of the oldest interval
    const cutoff = s.t - this.historyMs;
    let dropCount = 0;
    while (snaps.length - dropCount > 2 && snaps[dropCount + 1].t <= cutoff) {
      this._pool.push(snaps[dropCount]);
      dropCount++;
    }
    if (dropCount > 0) {
      snaps.copyWithin(0, dropCount);
      snaps.length -= dropCount;
    }
    return true;
  }

  /**
   * Samples the entity at server time `renderT` into `out` (allocated when omitted); null when the buffer is empty.
   *  - before the oldest snapshot: holds it
   *  - between two snapshots: linear interpolation (shortest-arc for yaw); a discontinuity (teleport > 12 m, alive flip,
   *    first snapshot) is NOT interpolated: the earlier snapshot is held until the later one is reached, then it is taken
   *    (a snap, never a streak). Discrete flags (crouching, prone, alive, weapon) come from the earlier snapshot.
   *  - beyond the newest snapshot (starved): damped velocity extrapolation for at most maxExtrapolationMs, then hold.
   * `out.vx/vy/vz` is the interpolated motion (segment slope) used for animation speed; `out.extrapolated` marks starvation.
   */
  sample(renderT, out = {}) {
    const snaps = this.snaps;
    const n = snaps.length;
    if (n === 0 || !isNum(renderT)) return null;
    out.extrapolated = false;
    out.snapped = false;
    out.smoothed = false;

    const first = snaps[0];
    if (renderT <= first.t) {
      return fillOut(out, first, 0, 0, 0);
    }

    const last = snaps[n - 1];
    if (renderT >= last.t) {
      const over = renderT - last.t;
      fillOut(out, last, last.vx, last.vy, last.vz);
      if (over > 0 && last.alive) {
        const e = Math.min(over, this.maxExtrapolationMs);
        const tau = this.extrapolationTauMs;
        // damped dead reckoning: integral of v * exp(-t / tau)
        const k = tau > 0 ? tau * (1 - Math.exp(-e / tau)) / 1000 : e / 1000;
        out.x = last.x + last.vx * k;
        out.z = last.z + last.vz * k;
        if (last.vy > 0) out.y = last.y + last.vy * k; // never sink through the floor while falling
        out.extrapolated = true;
        if (over > this.maxExtrapolationMs) {
          out.vx = 0;
          out.vy = 0;
          out.vz = 0;
        } else if (tau > 0) {
          const d = Math.exp(-e / tau);
          out.vx = last.vx * d;
          out.vy = last.vy * d;
          out.vz = last.vz * d;
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
    out.smoothed = Boolean(a.smoothed || b.smoothed);
    return out;
  }
}


// ---------------------------------------------------------------------------------------------------------------------
// Adaptive jitter buffer
//
// The viewer draws remote entities at   renderTime = estimatedTrueServerNow - delay.   A snapshot stamped T reaches the
// viewer at about  T + owd + lateness  (owd = one-way latency of the fastest path, lateness = extra queueing / jitter /
// retransmission delay >= 0). To have the snapshot that BRACKETS the render time already on hand (no extrapolation):
//
//        delay  >=  owd  +  snapshotInterval  +  lateness
//
// A fixed delay (the old INTERP_DELAY_MS = 100 ms) therefore starves permanently whenever owd + interval > 100 ms
// (RTT > ~120 ms) and has no jitter margin at all above RTT ~ 40 ms. The adaptive delay is
//
//        target = clamp(owd + K * interval + lateness_p95 + MARGIN,  MIN, min(MAX, serverRewindCap - owd))
//
// `owd` is what the clock has actually applied (clock.offsetMs - clock.bestOffsetMs), so `delay` is exactly
// serverNow - renderTime and the value the client reports to the server for lag compensation
// (rewind = rttMs / 2 + delay, shared/lagCompensation.js) is consistent with what is on screen.
// Raising is quick (up to UP_RATE of elapsed local time), lowering needs a sustained surplus and is slow (DOWN_RATE);
// the render time additionally never decreases by construction.
// ---------------------------------------------------------------------------------------------------------------------

export const JITTER_WINDOW = 128;          // lateness samples (~5 s at 25 Hz)
export const JITTER_QUANTILE = 0.95;
export const DELAY_K_INTERVALS = 1.0;      // snapshot intervals of look-ahead (bracketing snapshot)
export const DELAY_MARGIN_MS = 8;
export const DELAY_RAISE_DEADBAND_MS = 4;  // raise the target only when the raw estimate exceeds it by this much ...
export const DELAY_RAISE_HEADROOM_MS = 6;  // ... and then aim this far above the raw estimate (no creeping micro-raises)
export const DELAY_SHRINK_DEADBAND_MS = 25;
export const DELAY_SHRINK_HOLD_MS = 3000;  // surplus must persist this long before the delay is reduced
export const DELAY_UP_RATE = 0.25;         // max change speed (ms of delay per ms of local time) when growing ...
export const DELAY_DOWN_RATE = 0.05;       // ... and when shrinking
export const DELAY_MIN_SAMPLES = 8;

export class JitterBuffer {
  constructor(opts = {}) {
    this.minMs = isNum(opts.minDelayMs) ? opts.minDelayMs : INTERP_DELAY_MIN_MS;
    this.maxMs = isNum(opts.maxDelayMs) ? opts.maxDelayMs : INTERP_DELAY_MAX_MS;
    this.rewindCapMs = isNum(opts.rewindCapMs) ? opts.rewindCapMs : MAX_LAG_COMP_REWIND_MS;
    this.k = isNum(opts.k) ? opts.k : DELAY_K_INTERVALS;
    this.marginMs = isNum(opts.marginMs) ? opts.marginMs : DELAY_MARGIN_MS;
    this.quantile = isNum(opts.jitterQuantile) ? opts.jitterQuantile : JITTER_QUANTILE;
    this.initialMs = isNum(opts.initialDelayMs) ? opts.initialDelayMs : INTERP_DELAY_MS;
    this.reset();
  }

  reset() {
    this.late = [];            // ring of lateness samples
    this._lateHead = 0;
    this.intervals = [];       // ring of recent snapshot spacings
    this._intHead = 0;
    this._lastT = null;
    this._scratch = [];
    this.intervalMs = 40;
    this.jitterMs = 0;         // lateness quantile
    this.rawMs = this.initialMs;
    this.targetMs = this.initialMs;
    this.currentMs = this.initialMs;
    this.initialised = false;
    this._advancedAt = null;
    this._shrinkSince = null;
    this.samples = 0;
    this.raises = 0;
    this.shrinks = 0;
  }

  /** One accepted envelope: server stamp and its lateness (ms, >= 0) relative to the fastest path. */
  observe(serverT, lateness) {
    if (this._lastT !== null && serverT > this._lastT) {
      const d = serverT - this._lastT;
      if (this.intervals.length < 16) this.intervals.push(d);
      else {
        this.intervals[this._intHead] = d;
        this._intHead = (this._intHead + 1) % 16;
      }
      const s = this._scratch;
      const n = this.intervals.length;
      s.length = n;
      for (let i = 0; i < n; i++) s[i] = this.intervals[i];
      this.intervalMs = Math.max(10, Math.min(200, quickselectAsc(s, n, n >> 1)));
    }
    this._lastT = serverT;
    const l = Math.max(0, lateness);
    if (this.late.length < JITTER_WINDOW) this.late.push(l);
    else {
      this.late[this._lateHead] = l;
      this._lateHead = (this._lateHead + 1) % JITTER_WINDOW;
    }
    this.samples++;
  }

  _jitterQuantile() {
    const n = this.late.length;
    if (n === 0) return 0;
    const s = this._scratch;
    s.length = n;
    for (let i = 0; i < n; i++) s[i] = this.late[i];
    const idx = Math.min(n - 1, Math.floor(this.quantile * (n - 1)));
    return quickselectAsc(s, n, idx);
  }

  /** Upper bound of the delay: what the server can still rewind (rewind = rtt / 2 + delay) and the report limit. */
  maxFor(owdMs) {
    return Math.max(this.minMs, Math.min(this.maxMs, this.rewindCapMs - owdMs));
  }

  /** Recomputes the (hysteretic) target for the current one-way latency; call once per accepted envelope. */
  retarget(owdMs, localMs) {
    if (this.samples < DELAY_MIN_SAMPLES) return;
    this.jitterMs = this._jitterQuantile();
    const raw = owdMs + this.k * this.intervalMs + this.jitterMs + this.marginMs;
    const max = this.maxFor(owdMs);
    this.rawMs = Math.max(this.minMs, Math.min(max, raw));
    if (!this.initialised) {
      this.targetMs = this.rawMs;
      this.currentMs = this.rawMs;
      this._advancedAt = localMs;
      this.initialised = true;
      return;
    }
    if (this.rawMs > this.targetMs + DELAY_RAISE_DEADBAND_MS) {
      this.targetMs = Math.min(max, this.rawMs + DELAY_RAISE_HEADROOM_MS);
      this._shrinkSince = null;
      this.raises++;
    } else if (this.rawMs < this.targetMs - DELAY_SHRINK_DEADBAND_MS) {
      if (this._shrinkSince === null) this._shrinkSince = localMs;
      else if (localMs - this._shrinkSince >= DELAY_SHRINK_HOLD_MS) {
        this.targetMs = Math.max(this.minMs, this.rawMs + DELAY_RAISE_HEADROOM_MS);
        this._shrinkSince = null;
        this.shrinks++;
      }
    } else {
      this._shrinkSince = null;
    }
    if (this.targetMs > max) this.targetMs = max; // cap fell (owd rose)
  }

  /** Moves the applied delay towards the target at a bounded speed; returns it. */
  advance(localMs) {
    if (!this.initialised) return this.currentMs;
    if (this._advancedAt === null) this._advancedAt = localMs;
    const dt = localMs - this._advancedAt;
    if (dt > 0) {
      this._advancedAt = localMs;
      const diff = this.targetMs - this.currentMs;
      const step = (diff > 0 ? DELAY_UP_RATE : DELAY_DOWN_RATE) * dt;
      this.currentMs += Math.max(-step, Math.min(step, diff));
    }
    return this.currentMs;
  }
}

export class SnapshotInterpolator {
  constructor(opts = {}) {
    // A caller-supplied interpDelayMs pins the delay (tests / diagnostics); otherwise it is adaptive.
    this.fixedDelay = isNum(opts.interpDelayMs);
    this.interpDelayMs = this.fixedDelay ? opts.interpDelayMs : INTERP_DELAY_MS;
    this.opts = opts;
    this.clock = new ServerClock(opts);
    this.jitter = new JitterBuffer(opts);
    this.buffers = new Map(); // entity id -> SnapshotBuffer
    this._bufferPool = [];    // recycled SnapshotBuffer instances
    this.visual = new Map();  // entity id -> catch-up state (see sample)
    this._lastRenderT = -Infinity;
    this.catchupOmega = isNum(opts.catchupOmega) ? opts.catchupOmega : CATCHUP_OMEGA;
  }

  has(id) {
    return this.buffers.has(id);
  }

  get size() {
    return this.buffers.size;
  }

  /** The delay (ms) the render time currently lags behind the estimated true server time (= what the server must rewind). */
  get delayMs() {
    return this.fixedDelay ? this.interpDelayMs : this.jitter.currentMs;
  }

  setRttMs(rttMs) {
    this.clock.setRttMs(rttMs);
  }

  /**
   * Applies the server's `roomJoined.net` ({ interpMinMs, interpInitialMs }): the delay floor / start value follow the server
   * tick rate (LAN mode runs 50 Hz). Before the first adaptive estimate the live delay is moved to the new start value.
   */
  configure(net) {
    if (!net || this.fixedDelay) return;
    const jb = this.jitter;
    if (isNum(net.interpMinMs) && net.interpMinMs > 0) jb.minMs = Math.min(net.interpMinMs, jb.maxMs);
    if (isNum(net.interpInitialMs) && net.interpInitialMs > 0) jb.initialMs = Math.max(jb.minMs, Math.min(net.interpInitialMs, jb.maxMs));
    if (!jb.initialised) jb.rawMs = jb.targetMs = jb.currentMs = jb.initialMs;
  }

  /** True when an envelope stamped `serverT` would be accepted (newer than the newest seen, or a new server epoch). */
  acceptsEnvelope(serverT) {
    if (!isNum(serverT)) return false;
    const newest = this.clock.newestServerT;
    return serverT > newest || newest - serverT > this.clock.epochResetMs;
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
    if (this.clock.epochResets !== epochs) {
      for (const buf of this.buffers.values()) {
        buf.clear();
        this._bufferPool.push(buf);
      }
      this.buffers.clear(); // server restart: old snapshots are meaningless
      this.visual.clear();
      this.jitter.reset();
      this._lastRenderT = -Infinity;
    }
    if (!this.fixedDelay) {
      const clock = this.clock;
      this.jitter.observe(serverT, clock.bestOffsetMs - (serverT - localMs));
      this.jitter.retarget(Math.max(0, clock.offsetMs - clock.bestOffsetMs), localMs);
    }
    for (let i = 0; i < entities.length; i++) {
      const e = entities[i];
      if (!e || e.id === undefined || e.id === skipId) continue;
      let buf = this.buffers.get(e.id);
      if (!buf) {
        buf = this._bufferPool.pop() || new SnapshotBuffer(this.opts);
        this.buffers.set(e.id, buf);
      }
      buf.push(e, serverT);
    }
    return true;
  }

  /** Estimated server time shown on screen at local time `localMs` (NaN before the first snapshot); never decreases. */
  renderTime(localMs) {
    const s = this.clock.serverNow(localMs); // already monotone
    if (!isNum(s)) return NaN;
    const delay = this.fixedDelay ? this.interpDelayMs : this.jitter.advance(localMs);
    let r = s - delay;
    if (r < this._lastRenderT) r = this._lastRenderT; // the displayed timeline never runs backwards
    this._lastRenderT = r;
    return r;
  }

  /**
   * Samples one entity. On top of SnapshotBuffer.sample a critically damped catch-up is applied: whenever the raw path
   * jumps while starving or recovering from starvation (extrapolation ended / base snapshot changed), the jump is turned
   * into an offset that decays smoothly (CATCHUP_OMEGA), so a late snapshot slides the entity onto the real path instead
   * of teleporting it. Teleports (> TELEPORT_SNAP_DISTANCE, alive flips, `snap`) still snap and clear the offset.
   */
  sample(id, renderT, out = {}) {
    const buf = this.buffers.get(id);
    if (!buf) return null;
    const r = buf.sample(renderT, out);
    if (!r) return null;
    let st = this.visual.get(id);
    if (!st) {
      st = { has: false, rx: 0, ry: 0, rz: 0, rvx: 0, rvy: 0, rvz: 0, rt: 0, extrap: false, ox: 0, oy: 0, oz: 0, ovx: 0, ovy: 0, ovz: 0, outT: NaN };
      this.visual.set(id, st);
    }
    const rawX = out.x, rawY = out.y, rawZ = out.z;
    const rawVx = out.vx, rawVy = out.vy, rawVz = out.vz;
    if (st.has && renderT === st.outT) {
      // same render time sampled again (diagnostics, second pass): idempotent
      out.x = rawX + st.ox; out.y = rawY + st.oy; out.z = rawZ + st.oz;
      out.vx = rawVx + st.ovx; out.vy = rawVy + st.ovy; out.vz = rawVz + st.ovz;
      return out;
    }
    const wasExtrap = st.extrap;
    if (st.has) {
      const dtMs = renderT - st.rt;
      if (dtMs > 0) {
        const dt = dtMs / 1000;
        // peak speed of a critically damped slide of size x0 is w * x0 / e: slow the rate down for big offsets
        const mag = Math.hypot(st.ox, st.oy, st.oz);
        const w = mag > 0 ? Math.max(1.5, Math.min(this.catchupOmega, (CATCHUP_MAX_EXTRA_SPEED * Math.E) / mag)) : this.catchupOmega;
        const e = Math.exp(-w * dt);
        let t = st.ovx + w * st.ox;
        st.ox = (st.ox + t * dt) * e;
        st.ovx = (st.ovx - w * t * dt) * e;
        t = st.ovy + w * st.oy;
        st.oy = (st.oy + t * dt) * e;
        st.ovy = (st.ovy - w * t * dt) * e;
        t = st.ovz + w * st.oz;
        st.oz = (st.oz + t * dt) * e;
        st.ovz = (st.ovz - w * t * dt) * e;
        if (out.snapped) {
          st.ox = st.oy = st.oz = st.ovx = st.ovy = st.ovz = 0;
        } else if (wasExtrap || out.extrapolated || out.smoothed) {
          const jx = rawX - (st.rx + st.rvx * dt);
          const jy = rawY - (st.ry + st.rvy * dt);
          const jz = rawZ - (st.rz + st.rvz * dt);
          const jm = Math.hypot(jx, jy, jz);
          if (jm > TELEPORT_SNAP_DISTANCE) {
            st.ox = st.oy = st.oz = st.ovx = st.ovy = st.ovz = 0;
          } else if (jm > CATCHUP_MIN_JUMP) {
            st.ox -= jx;
            st.oy -= jy;
            st.oz -= jz;
          }
        }
      }
    }
    st.has = true;
    st.rx = rawX; st.ry = rawY; st.rz = rawZ;
    st.rvx = rawVx; st.rvy = rawVy; st.rvz = rawVz;
    st.rt = renderT;
    st.outT = renderT;
    st.extrap = Boolean(out.extrapolated);
    out.x = rawX + st.ox;
    out.y = rawY + st.oy;
    out.z = rawZ + st.oz;
    out.vx = rawVx + st.ovx;
    out.vy = rawVy + st.ovy;
    out.vz = rawVz + st.ovz;
    return out;
  }

  /** Forget the history of one entity (respawn: no streak from the death position). */
  reset(id) {
    const buf = this.buffers.get(id);
    if (buf) buf.clear();
    this.visual.delete(id);
  }

  /** Drops the entity's buffer (entity left the match). */
  remove(id) {
    const buf = this.buffers.get(id);
    if (buf) {
      buf.clear();
      this._bufferPool.push(buf);
      this.buffers.delete(id);
    }
    this.visual.delete(id);
  }

  clear() {
    for (const buf of this.buffers.values()) {
      buf.clear();
      this._bufferPool.push(buf);
    }
    this.buffers.clear();
    this.visual.clear();
    this.jitter.reset();
    this._lastRenderT = -Infinity;
    const rtts = this.clock._rtts; // the latency measurements stay valid across matches
    this.clock.reset();
    this.clock._rtts = rtts;
    this.clock._recomputeOwd();
  }
}
