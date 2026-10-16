// Headless network-impairment harness (virtual clock, seeded PRNG, no sockets, no timers).
//
// It drives the REAL server loop (`RoomManager.tick()` with a virtual Date.now), pushes every `stateUpdate` through a simulated
// link (one-way latency, jitter, loss / burst loss, reordering), and feeds the delivered payloads to a REAL headless
// `Game3D` (`syncPlayersState` + `updateRemotePlayers`, i.e. SnapshotInterpolator + rig placement) that renders at 60 fps.
//
// What is simulated (and what is not): link delay/jitter/loss are synthetic. Two transport models:
//   'udp' - a lost packet is gone, packets can be reordered by jitter (what the task statement describes)
//   'tcp' - what a WebSocket really is: a lost packet is retransmitted after an RTO and everything behind it waits
//           (head-of-line blocking => stall, then a burst of old snapshots); delivery is in order.
// Not simulated: real Wi-Fi, real CPU/GPU frame times (frames are perfectly regular 60 fps), browser timers.
//
// All profile numbers are ONE-WAY, so RTT = 2x.

import { createTestGame3D } from './headless-game3d.mjs';
import { RoomManager } from '../../server/roomManager.js';
import { INTERP_DELAY_MS } from '../../shared/config.js';
import { resolveShotRewindMs, rewindRoomPlayersForShot, restoreRewoundPlayers } from '../../shared/lagCompensation.js';

export const TICK_MS = 40;
export const FRAME_MS = 1000 / 60;
const SERVER_EPOCH = 1_700_000_000_000; // server clock (ms) at t = 0
const CLIENT_OFFSET = 987_654.321;      // client performance.now() = server time - SERVER_EPOCH + CLIENT_OFFSET (unsynchronised)
const MAX_SPEED = 14.5;                  // m/s: sqrt(slide 11.2^2 + jump 8^2) = 13.8, the fastest legal 3D motion; pop threshold

/** Network profiles (one-way ms). `burst` = consecutive packets lost per loss event, `loss` = long-run loss fraction. */
export const PROFILES = {
  lan: { oneWay: 20, jitter: 0, loss: 0, burst: 1 },
  good: { oneWay: 60, jitter: 10, loss: 0, burst: 1 },
  typical: { oneWay: 100, jitter: 30, loss: 0.02, burst: 1 },
  bad: { oneWay: 180, jitter: 60, loss: 0.05, burst: 3 },
  awful: { oneWay: 250, jitter: 100, loss: 0.08, burst: 1 }
};
/** Extra, more realistic office profile (RTT 80 ms, mild jitter/loss). */
export const EXTRA_PROFILES = {
  wifi80: { oneWay: 40, jitter: 15, loss: 0.01, burst: 1 }
};

export function makeRng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function percentile(values, p) {
  if (!values.length) return 0;
  const s = Float64Array.from(values).sort();
  return s[Math.min(s.length - 1, Math.max(0, Math.floor(p * (s.length - 1))))];
}

/** One direction of a link. `send(sentAt, bytes)` returns the arrival time or null when the packet is lost. */
export class SimLink {
  constructor(profile, mode, rng) {
    this.p = profile;
    this.mode = mode;
    this.rng = rng;
    this.burstLeft = 0;
    this.lastArrival = -Infinity;
    this.rto = Math.max(200, 3 * profile.oneWay);
  }

  delay() {
    const { oneWay, jitter } = this.p;
    return Math.max(1, oneWay + (this.rng() * 2 - 1) * jitter);
  }

  isLost() {
    const { loss, burst } = this.p;
    if (!(loss > 0)) return false;
    if (this.burstLeft > 0) {
      this.burstLeft--;
      return true;
    }
    if (this.rng() < loss / burst) {
      this.burstLeft = burst - 1;
      return true;
    }
    return false;
  }

  send(sentAt) {
    const lost = this.isLost();
    if (this.mode === 'udp') {
      return lost ? null : sentAt + this.delay();
    }
    let arrival = sentAt + this.delay() + (lost ? this.rto : 0);
    if (arrival < this.lastArrival) arrival = this.lastArrival; // in-order delivery: head-of-line blocking
    this.lastArrival = arrival;
    return arrival;
  }
}

/** Pre-computed 1 ms trajectory of a moving player (strafing, sprinting, stopping, jumping, crouching, sliding). */
export function buildTrajectory(seed, durationMs, arena = 50) {
  const rng = makeRng(seed);
  const n = durationMs + 1;
  const T = { x: new Float64Array(n), y: new Float64Array(n), z: new Float64Array(n), vx: new Float64Array(n), vy: new Float64Array(n), vz: new Float64Array(n), yaw: new Float64Array(n), crouch: new Uint8Array(n) };
  let x = (rng() * 2 - 1) * arena * 0.6;
  let z = (rng() * 2 - 1) * arena * 0.6;
  let y = 0;
  let vy = 0;
  let heading = rng() * Math.PI * 2;
  let speed = 0;
  let crouch = 0;
  let yaw = heading;
  let phaseEnd = 0;
  let strafeFlip = 0;
  let strafeSign = 1;
  let slideEnd = 0;
  let slideStart = 0;
  for (let i = 0; i < n; i++) {
    if (i >= phaseEnd) {
      const r = rng();
      phaseEnd = i + 400 + Math.floor(rng() * 1400);
      crouch = 0;
      if (r < 0.14) speed = 0;                              // stop
      else if (r < 0.34) speed = 6.2;                       // walk
      else if (r < 0.58) speed = 8.6;                       // sprint
      else if (r < 0.74) { speed = 6.2; strafeFlip = i + 300; } // strafe left/right
      else if (r < 0.86) { speed = 3.4; crouch = 1; }       // crouch walk
      else { speed = 11.2; slideStart = i; slideEnd = i + 660; } // slide
      if (rng() < 0.6) heading = rng() * Math.PI * 2;
      if (y === 0 && rng() < 0.3) vy = 8;                   // jump
    }
    if (strafeFlip && i >= strafeFlip) {
      strafeSign = -strafeSign;
      strafeFlip = i + 300 + Math.floor(rng() * 200);
      if (i >= phaseEnd) strafeFlip = 0;
    }
    let sp = speed;
    if (slideEnd && i < slideEnd) sp = 11.2 + (4.5 - 11.2) * ((i - slideStart) / 660);
    const h = heading + (strafeFlip ? strafeSign * Math.PI / 2 : 0);
    const vx = Math.sin(h) * sp;
    const vz = Math.cos(h) * sp;
    x += vx / 1000;
    z += vz / 1000;
    if (x > arena || x < -arena) { heading = -heading; x = Math.max(-arena, Math.min(arena, x)); }
    if (z > arena || z < -arena) { heading = Math.PI - heading; z = Math.max(-arena, Math.min(arena, z)); }
    if (y > 0 || vy > 0) {
      vy -= 22 / 1000;
      y += vy / 1000;
      if (y <= 0) { y = 0; vy = 0; }
    }
    yaw += (rng() - 0.5) * 0.02;
    T.x[i] = x; T.y[i] = y; T.z[i] = z; T.vx[i] = vx; T.vy[i] = vy; T.vz[i] = vz; T.yaw[i] = yaw; T.crouch[i] = crouch;
  }
  return {
    at(tMs, out = {}) {
      const f = Math.max(0, Math.min(n - 1.001, tMs));
      const i = Math.floor(f);
      const k = f - i;
      out.x = T.x[i] + (T.x[i + 1] - T.x[i]) * k;
      out.y = T.y[i] + (T.y[i + 1] - T.y[i]) * k;
      out.z = T.z[i] + (T.z[i + 1] - T.z[i]) * k;
      out.vx = T.vx[i]; out.vy = T.vy[i]; out.vz = T.vz[i]; out.yaw = T.yaw[i]; out.crouch = T.crouch[i] === 1;
      return out;
    }
  };
}

function withClock(clock, fn) {
  const real = Date.now;
  Date.now = () => clock.now;
  try { return fn(); } finally { Date.now = real; }
}

/**
 * Runs one scenario. Returns metrics (see the return statement). `opts`:
 *   profile {oneWay,jitter,loss,burst}, mode 'tcp'|'udp', remotes (default 5), durationMs (30000), warmupMs (5000), seed,
 *   serverStalls (true: ~every 6 s the server loop stalls 160-300 ms; ticks resume afterwards), onFrame(ctx)
 */
export async function runScenario(opts) {
  const profile = opts.profile;
  const mode = opts.mode || 'tcp';
  const remotes = opts.remotes ?? 5;
  const durationMs = opts.durationMs ?? 30000;
  const warmupMs = opts.warmupMs ?? 5000;
  const seed = opts.seed ?? 7;
  const rng = makeRng(seed * 7919 + 13);
  const down = new SimLink(profile, mode, makeRng(seed * 31 + 1));   // server -> client (stateUpdate)
  const upRng = makeRng(seed * 131 + 5);
  const pingDown = new SimLink(profile, 'udp', makeRng(seed * 17 + 9)); // RTT legs of pingCheck / latencyProbe (no loss modelling)
  const pingProfile = { ...profile, loss: 0 };
  const pingLegA = new SimLink(pingProfile, 'udp', makeRng(seed * 41 + 3));
  const pingLegB = new SimLink(pingProfile, 'udp', makeRng(seed * 43 + 4));
  void pingDown;

  // --- server -------------------------------------------------------------------------------------------------------
  const emitted = [];
  const io = {
    to: (target) => ({
      emit: (event, payload) => emitted.push({ target, event, payload }),
      volatile: { emit: (event, payload) => emitted.push({ target, event, payload, volatile: true }) }
    })
  };
  const rm = new RoomManager(io);
  rm.stop();
  const clock = { now: SERVER_EPOCH };
  const trajs = [];
  const ids = [];
  const players = [];
  let room;
  let viewer;
  withClock(clock, () => {
    const res = rm.addHumanPlayer({ id: 'viewer' }, { name: 'viewer', roomCode: 'IMPAIR', mode: 'private', mapId: 'cyber_citadel' });
    room = res.room;
    viewer = res.player;
    viewer.invulnerableUntil = 0;
    for (let i = 0; i < remotes; i++) {
      const id = `r${i}`;
      const r = rm.addHumanPlayer({ id }, { name: id, roomCode: 'IMPAIR', mode: 'private', mapId: 'cyber_citadel' });
      r.player.invulnerableUntil = 0;
      ids.push(id);
      players.push(r.player);
      trajs.push(buildTrajectory(seed * 1000 + i + 1, durationMs + 2000));
    }
  });
  const tmp = {};
  const applyTraj = (tMs) => {
    for (let i = 0; i < players.length; i++) {
      const s = trajs[i].at(tMs, tmp);
      const p = players[i];
      p.x = s.x; p.y = s.y; p.z = s.z; p.vx = s.vx; p.vy = s.vy; p.vz = s.vz; p.yaw = s.yaw; p.pitch = 0;
      p.crouching = s.crouch; p.prone = false; p.lean = 0;
      p.lastMoveAt = SERVER_EPOCH + tMs; // the server zeroes velocities of players that have not moved for 120 ms
      p._mx = p.x; p._my = p.y; p._mz = p.z; // not a "teleport" for processPlayerInputs (which would reset velocity)
    }
  };
  viewer.x = 0; viewer.y = 0; viewer.z = 0;

  // --- client -------------------------------------------------------------------------------------------------------
  const game = await createTestGame3D();
  game.localId = 'viewer';
  game.inMatch = false; // keeps footstep audio out of the headless run
  opts.setupGame?.(game);
  const toLocal = (t) => t + CLIENT_OFFSET;
  const toServer = (L) => L - CLIENT_OFFSET + SERVER_EPOCH;

  // --- event loop ---------------------------------------------------------------------------------------------------
  const inbox = []; // { at (t ms), payload, bytes }
  const shots = []; // { rxAt, fireT, rendered:{id->[x,y,z]}, reportedDelay }
  const frameDtSec = FRAME_MS / 1000;
  const tickMs = opts.tickMs ?? TICK_MS;
  let nextTick = tickMs;
  let nextFrame = FRAME_MS;
  let nextPing = 500;
  let nextProbe = 700;
  let nextShot = warmupMs + 120;
  let stallUntil = -1;
  let nextStall = 4000 + rng() * 4000;
  const pingAcks = []; // { at, rtt }
  const probeAcks = [];
  let emittedSeen = 0;
  let bytes = 0;
  let bytesPackets = 0;
  let packetsSent = 0;
  let packetsLost = 0;
  let packetsDelivered = 0;
  const tickDurations = [];

  const err = []; const errPerEntity = new Map();
  const lagSamples = [];
  const popSizes = [];
  let starvedFrames = 0;
  let totalFrames = 0;
  let starveRun = new Map();
  let maxStarveMs = 0;
  let staleMax = 0;
  const lastPos = new Map();
  const newestT = new Map();
  const parityErr = [];
  const delaySamples = [];
  const sOut = {};

  const reportedDelay = () => (typeof game.getInterpDelayMs === 'function' ? game.getInterpDelayMs() : INTERP_DELAY_MS);

  const pump = (tNow) => {
    // everything due at or before tNow, in time order: server ticks, packet arrivals, pings, shots, frames
    for (;;) {
      let tNext = Infinity;
      let kind = '';
      const cands = [
        [nextTick, 'tick'], [nextFrame, 'frame'], [nextPing, 'ping'], [nextProbe, 'probe'], [nextShot, 'shot'],
        [inbox.length ? inbox[0].at : Infinity, 'rx'],
        [pingAcks.length ? pingAcks[0].at : Infinity, 'pingAck'],
        [probeAcks.length ? probeAcks[0].at : Infinity, 'probeAck'],
        [shots.length ? shots[0].rxAt : Infinity, 'shotRx']
      ];
      for (const c of cands) if (c[0] < tNext) { tNext = c[0]; kind = c[1]; }
      if (tNext > tNow) return;

      if (kind === 'tick') {
        const t = nextTick;
        if (opts.serverStalls && t >= nextStall) {
          stallUntil = nextStall + 160 + rng() * 140;
          nextStall = stallUntil + 4000 + rng() * 4000;
        }
        if (!(stallUntil >= 0 && t < stallUntil)) {
          clock.now = SERVER_EPOCH + t;
          applyTraj(t);
          const w0 = process.hrtime.bigint();
          withClock(clock, () => rm.tick());
          tickDurations.push(Number(process.hrtime.bigint() - w0) / 1e6);
          for (; emittedSeen < emitted.length; emittedSeen++) {
            const e = emitted[emittedSeen];
            if (e.event !== 'stateUpdate') continue;
            const json = JSON.stringify(e.payload);
            packetsSent++;
            bytes += json.length;
            bytesPackets++;
            const arr = down.send(t);
            if (arr === null) { packetsLost++; continue; }
            inbox.push({ at: arr, json, sentT: t });
          }
          emitted.length = 0; emittedSeen = 0;
          inbox.sort((a, b) => a.at - b.at);
        }
        nextTick += tickMs;
      } else if (kind === 'rx') {
        const m = inbox.shift();
        // experiment: "latest only" - of snapshots released together by a stalled link keep just the newest
        if (opts.dropStale && inbox.length && inbox[0].at - m.at < 0.5) continue;
        const payload = JSON.parse(m.json);
        packetsDelivered++;
        const L = toLocal(m.at);
        game.syncPlayersState(payload.players, payload.t, L);
        for (const p of payload.players) newestT.set(p.id, Math.max(newestT.get(p.id) ?? -Infinity, payload.t));
      } else if (kind === 'ping') {
        const a = pingLegA.send(nextPing);
        const b = a === null ? null : pingLegB.send(a);
        if (b !== null) pingAcks.push({ at: b, rtt: b - nextPing });
        pingAcks.sort((p, q) => p.at - q.at);
        nextPing += 2500;
      } else if (kind === 'pingAck') {
        const a = pingAcks.shift();
        game.setNetworkRtt?.(Math.round(a.rtt));
      } else if (kind === 'probe') {
        const a = pingLegA.send(nextProbe);
        const b = a === null ? null : pingLegB.send(a);
        if (b !== null) probeAcks.push({ at: b, rtt: b - nextProbe });
        probeAcks.sort((p, q) => p.at - q.at);
        nextProbe += 2000;
      } else if (kind === 'probeAck') {
        const a = probeAcks.shift();
        withClock({ now: SERVER_EPOCH + a.at }, () => rm.recordRtt(viewer, a.rtt));
        if (typeof rm.noteInterpDelay === 'function') rm.noteInterpDelay(viewer, reportedDelay(), SERVER_EPOCH + a.at);
      } else if (kind === 'frame') {
        const t = nextFrame;
        const L = toLocal(t);
        game.updateRemotePlayers(frameDtSec, L);
        const renderT = game.snapshots.renderTime(L);
        const trueS = toServer(L);
        if (t > warmupMs && Number.isFinite(renderT)) {
          totalFrames++;
          lagSamples.push(trueS - renderT);
          delaySamples.push(reportedDelay());
          for (let i = 0; i < ids.length; i++) {
            const rp = game.remotePlayers.get(ids[i]);
            if (!rp) continue;
            const truth = trajs[i].at(renderT - SERVER_EPOCH, tmp);
            const pos = rp.group.position;
            const e = Math.hypot(pos.x - truth.x, pos.y - truth.y, pos.z - truth.z);
            err.push(e);
            const s = game.snapshots.sample(ids[i], renderT, sOut);
            const starved = Boolean(s && s.extrapolated);
            if (starved) {
              starvedFrames++;
              const run = (starveRun.get(ids[i]) || 0) + FRAME_MS;
              starveRun.set(ids[i], run);
              if (run > maxStarveMs) maxStarveMs = run;
            } else starveRun.set(ids[i], 0);
            const lp = lastPos.get(ids[i]);
            if (lp) {
              const d = Math.hypot(pos.x - lp[0], pos.y - lp[1], pos.z - lp[2]);
              if (d > MAX_SPEED * frameDtSec + 0.02) popSizes.push(d);
            }
            const nt = newestT.get(ids[i]);
            if (nt !== undefined) staleMax = Math.max(staleMax, trueS - nt);
          }
        }
        for (let i = 0; i < ids.length; i++) {
          const rp = game.remotePlayers.get(ids[i]);
          if (rp) lastPos.set(ids[i], [rp.group.position.x, rp.group.position.y, rp.group.position.z]);
        }
        opts.onFrame?.({ t, L, renderT, game });
        nextFrame += FRAME_MS;
      } else if (kind === 'shot') {
        // the viewer fires: remember what it renders now; the server evaluates the shot one uplink-latency later
        const rendered = {};
        for (let i = 0; i < ids.length; i++) {
          const rp = game.remotePlayers.get(ids[i]);
          if (rp) rendered[ids[i]] = [rp.group.position.x, rp.group.position.y, rp.group.position.z];
        }
        const up = Math.max(1, profile.oneWay + (upRng() * 2 - 1) * profile.jitter);
        shots.push({ rxAt: nextShot + up, rendered, delay: reportedDelay() });
        nextShot += 250;
      } else if (kind === 'shotRx') {
        const sh = shots.shift();
        if (Number.isFinite(sh.rxAt) && sh.rxAt < durationMs) {
          const nowS = SERVER_EPOCH + sh.rxAt;
          clock.now = nowS;
          withClock(clock, () => {
            if (typeof rm.noteInterpDelay === 'function') rm.noteInterpDelay(viewer, sh.delay, nowS);
            const rewind = resolveShotRewindMs(viewer, {}, nowS);
            const saved = rewindRoomPlayersForShot(room, 'viewer', rewind, nowS);
            for (let i = 0; i < ids.length; i++) {
              const r = sh.rendered[ids[i]];
              if (!r) continue;
              const p = players[i];
              parityErr.push(Math.hypot(p.x - r[0], p.y - r[1], p.z - r[2]));
            }
            restoreRewoundPlayers(saved);
          });
        }
      }
    }
  };

  // run
  const step = 1000;
  for (let t = step; t <= durationMs; t += step) pump(t);
  pump(durationMs);

  const rms = Math.sqrt(err.reduce((a, v) => a + v * v, 0) / Math.max(1, err.length));
  const secs = (durationMs) / 1000;
  const result = {
    rmsErr: rms,
    p95Err: percentile(err, 0.95),
    maxErr: err.reduce((m, v) => Math.max(m, v), 0),
    pops: popSizes.length,
    maxPop: popSizes.reduce((m, v) => Math.max(m, v), 0),
    starvedMs: (starvedFrames * FRAME_MS) / Math.max(1, ids.length), // per entity
    starvedPct: (100 * starvedFrames) / Math.max(1, err.length),
    maxStarveMs,
    staleMaxMs: staleMax,
    meanLagMs: lagSamples.reduce((a, v) => a + v, 0) / Math.max(1, lagSamples.length),
    meanDelayMs: delaySamples.reduce((a, v) => a + v, 0) / Math.max(1, delaySamples.length),
    parityMean: parityErr.reduce((a, v) => a + v, 0) / Math.max(1, parityErr.length),
    parityP95: percentile(parityErr, 0.95),
    bytesPerSec: bytes / secs,
    packetsSent,
    packetsLost,
    packetsDelivered,
    tickMsP95: percentile(tickDurations, 0.95),
    tickMsMax: tickDurations.reduce((m, v) => Math.max(m, v), 0),
    frames: totalFrames
  };
  void errPerEntity;
  game.clearAllRemotePlayers?.();
  return result;
}

export function fmt(r) {
  const f = (v, d = 3) => Number(v).toFixed(d);
  return `rms=${f(r.rmsErr)}m p95=${f(r.p95Err)}m max=${f(r.maxErr, 2)}m pops=${r.pops} (max ${f(r.maxPop, 2)}m) starved=${f(r.starvedPct, 1)}% ` +
    `maxStarve=${f(r.maxStarveMs, 0)}ms lag=${f(r.meanLagMs, 0)}ms parity(mean/p95)=${f(r.parityMean)}/${f(r.parityP95)}m B/s=${f(r.bytesPerSec, 0)} ` +
    `lost=${r.packetsLost}/${r.packetsSent}`;
}
