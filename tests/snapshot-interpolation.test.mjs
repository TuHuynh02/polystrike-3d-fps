/**
 * Snapshot interpolation of REMOTE players (step 6):
 *  - the server stamps every stateUpdate with its clock (`t`)
 *  - public/js/snapshotBuffer.js (pure): per-entity buffer, interpolation / snap / extrapolation, server-clock model
 *  - the client render time (estimated server time - adaptive delay) matches the server's lag-compensation rewind
 *    (the client reports its current delay, see tests/network-impairment.test.mjs for the impairment profiles)
 *  - the real Game3D (headless) draws the remote rig at the interpolated position
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// Installs the ESM hooks + DOM mocks needed to load public/js/*.js in Node (must come before the dynamic imports below)
import { createTestGame3D, loadGame3D } from './helpers/headless-game3d.mjs';

import { INTERP_DELAY_MS, MATCH_CONFIG } from '../shared/config.js';
import {
  LAG_COMP_HISTORY_MS,
  LAG_COMP_MAX_REWIND_MS,
  resolveShotRewindMs,
  restoreRewoundPlayers,
  rewindRoomPlayersForShot
} from '../shared/lagCompensation.js';
import { RoomManager } from '../server/roomManager.js';

const {
  MAX_EXTRAPOLATION_MS,
  SNAPSHOT_HISTORY_MS,
  TELEPORT_SNAP_DISTANCE,
  ServerClock,
  SnapshotBuffer,
  SnapshotInterpolator,
  lerpAngle
} = await import('../public/js/snapshotBuffer.js');

const TICK_MS = 40; // 25 Hz
const MAP_ID = 'cyber_citadel';

/** Seeded PRNG (mulberry32) so jitter tests are reproducible. */
function makeRng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Absolute shortest angular distance between two angles. */
function angDist(a, b) {
  const TAU = Math.PI * 2;
  let d = (a - b) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return Math.abs(d);
}

function snap(t, x, over = {}) {
  return { t, x, y: 0, z: 0, yaw: 0, pitch: 0, lean: 0, crouching: false, prone: false, vx: 0, vy: 0, vz: 0, alive: true, weapon: 'rifle', ...over };
}

function createServer() {
  const emitted = [];
  const record = (to, event, payload, volatile) => emitted.push({ to, event, payload, volatile });
  const io = {
    to: (target) => ({
      emit: (event, payload) => record(target, event, payload, false),
      volatile: { emit: (event, payload) => record(target, event, payload, true) }
    })
  };
  const rm = new RoomManager(io);
  rm.stop(); // tests drive ticks explicitly
  return { rm, emitted };
}

function join(rm, id, roomCode) {
  const res = rm.addHumanPlayer({ id }, { name: id, roomCode, mode: 'private', mapId: MAP_ID });
  assert.ok(!res.error, `join failed: ${res.error}`);
  res.player.invulnerableUntil = 0;
  return res;
}

/** Runs `fn` with Date.now() driven by `clock.now`. */
function withClock(clock, fn) {
  const real = Date.now;
  Date.now = () => clock.now;
  try {
    return fn();
  } finally {
    Date.now = real;
  }
}

// ---------------------------------------------------------------------------------------------------------------------
describe('(a) server: stateUpdate carries a server timestamp `t`', () => {
  it('t (ms) is identical for every room/player of one tick, strictly increases across ticks and keeps seq', () => {
    const { rm, emitted } = createServer();
    const base = Date.now();
    const clock = { now: base };
    withClock(clock, () => {
      const r1 = join(rm, 'a1', 'SNAP01');
      const r2 = join(rm, 'b1', 'SNAP02');
      join(rm, 'a2', 'SNAP01');
      const states = () => emitted.filter((e) => e.event === 'stateUpdate');

      clock.now = base + 40;
      rm.tick();
      const tick1 = states().splice(0);
      assert.equal(tick1.length, 2, 'one stateUpdate per active room');
      assert.equal(tick1[0].payload.t, tick1[1].payload.t, 'same stamp for all rooms of the tick');
      assert.equal(tick1[0].payload.t, base + 40, 'stamp is the tick Date.now()');
      assert.ok(tick1.every((e) => e.volatile === true));
      for (const e of tick1) {
        assert.equal(typeof e.payload.seq, 'number');
        assert.ok(Array.isArray(e.payload.players));
        assert.ok(!('t' in e.payload.players[0]), 'players are not stamped individually');
      }
      emitted.length = 0;

      clock.now = base + 80;
      rm.tick();
      const t2 = states()[0].payload.t;
      assert.equal(t2, base + 80);
      assert.ok(t2 > tick1[0].payload.t);
      emitted.length = 0;

      // Two ticks within the same millisecond and a clock stepping backwards still produce strictly increasing stamps
      rm.tick();
      const t3 = states()[0].payload.t;
      emitted.length = 0;
      clock.now = base + 70;
      rm.tick();
      const t4 = states()[0].payload.t;
      assert.ok(t3 > t2, 'same-millisecond tick: stamp +1');
      assert.ok(t4 > t3, 'backwards clock step: stamp still increases');
      assert.ok(r1.room.stateSeq > 0 && r2.room.stateSeq > 0);
    });
  });
});

// ---------------------------------------------------------------------------------------------------------------------
describe('(b) interpolation between two snapshots', () => {
  it('interpolates position / pitch / lean exactly at the right fraction, flags come from the earlier snapshot', () => {
    const buf = new SnapshotBuffer();
    buf.push(snap(1000, 0, { y: 1, z: -2, pitch: -0.2, lean: 0, crouching: true, weapon: 'rifle' }));
    buf.push(snap(1040, 4, { y: 3, z: 6, pitch: 0.6, lean: 1, crouching: false, weapon: 'smg' }));
    for (const k of [0, 0.25, 0.5, 0.8, 1]) {
      const s = buf.sample(1000 + 40 * k);
      assert.ok(Math.abs(s.x - 4 * k) < 1e-9, `x at ${k}`);
      assert.ok(Math.abs(s.y - (1 + 2 * k)) < 1e-9);
      assert.ok(Math.abs(s.z - (-2 + 8 * k)) < 1e-9);
      assert.ok(Math.abs(s.pitch - (-0.2 + 0.8 * k)) < 1e-9);
      assert.ok(Math.abs(s.lean - k) < 1e-9);
      assert.equal(s.extrapolated, false);
      if (k < 1) {
        assert.equal(s.crouching, true, `discrete flag stays on the earlier snapshot until crossed (k=${k})`);
        assert.equal(s.weapon, 'rifle');
      } else {
        assert.equal(s.crouching, false);
        assert.equal(s.weapon, 'smg');
      }
    }
    const mid = buf.sample(1020);
    assert.ok(Math.abs(mid.vx - 100) < 1e-9, 'velocity output is the segment slope (m/s)');
  });

  it('yaw takes the short arc across +-PI', () => {
    const buf = new SnapshotBuffer();
    buf.push(snap(1000, 0, { yaw: 3.0 }));
    buf.push(snap(1040, 0, { yaw: -3.0 }));
    const arc = 2 * Math.PI - 6.0; // 0.2832 rad through +-PI, not 6 rad the long way
    for (const k of [0.1, 0.5, 0.9]) {
      const s = buf.sample(1000 + 40 * k);
      assert.ok(angDist(s.yaw, 3.0 + arc * k) < 1e-9, `yaw at ${k}: ${s.yaw}`);
      assert.ok(angDist(s.yaw, 3.0) < arc + 1e-9, 'never swings through 0');
    }
    buf.push(snap(1080, 0, { yaw: -2.9 }));
    const s2 = buf.sample(1060);
    assert.ok(s2.yaw < -2.9 && s2.yaw > -3.0, 'plain interval inside the same hemisphere');
    assert.ok(angDist(lerpAngle(-3.0, 3.0, 0.5), Math.PI) < 1e-9, 'symmetric case goes through PI');
  });

  it('holds the oldest snapshot before the buffer start and keeps ~1 s of history', () => {
    const buf = new SnapshotBuffer();
    for (let i = 0; i < 100; i++) buf.push(snap(1000 + i * TICK_MS, i));
    const newest = buf.newestT;
    assert.ok(buf.length <= SNAPSHOT_HISTORY_MS / TICK_MS + 2, `history pruned: ${buf.length}`);
    assert.ok(buf.length >= SNAPSHOT_HISTORY_MS / TICK_MS - 1);
    assert.equal(buf.sample(0).x, buf.snaps[0].x);
    assert.ok(Math.abs(buf.sample(newest - 500).x - (99 - 500 / TICK_MS)) < 1e-9);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
describe('(c) out-of-order and duplicate snapshots', () => {
  it('ignores duplicates and snapshots older than the newest; ordering uses t, not seq', () => {
    const buf = new SnapshotBuffer();
    assert.equal(buf.push(snap(1000, 0)), true);
    assert.equal(buf.push(snap(1040, 1)), true);
    assert.equal(buf.push(snap(1080, 2)), true);
    assert.equal(buf.push(snap(1040, 99)), false, 'duplicate / reordered older');
    assert.equal(buf.push(snap(1080, 99)), false, 'duplicate of the newest');
    assert.equal(buf.push(snap(1020, 99)), false, 'older than the newest');
    assert.equal(buf.length, 3);
    assert.equal(buf.sample(1060).x, 1.5, 'unharmed by the rejected packets');
    // seq wrap-around: seq goes back to a small number but t keeps increasing => accepted
    assert.equal(buf.push({ ...snap(1120, 3), seq: 1 }), true);

    const interp = new SnapshotInterpolator();
    assert.equal(interp.pushState(2000, 100, [{ id: 'e', ...snap(0, 0) }]), true);
    assert.equal(interp.pushState(2040, 140, [{ id: 'e', ...snap(0, 1) }]), true);
    assert.equal(interp.pushState(2000, 150, [{ id: 'e', ...snap(0, 50) }]), false, 'old envelope rejected');
    assert.equal(interp.pushState(2040, 151, [{ id: 'e', ...snap(0, 50) }]), false, 'duplicate envelope rejected');
    assert.equal(interp.buffers.get('e').length, 2);
  });

  it('a far-in-the-past stamp is a new server epoch, not reordering', () => {
    const interp = new SnapshotInterpolator();
    interp.setRttMs(100);
    interp.pushState(9_000_000, 1000, [{ id: 'e', ...snap(0, 0) }]);
    interp.pushState(9_000_040, 1040, [{ id: 'e', ...snap(0, 1) }]);
    assert.equal(interp.pushState(1_000_000, 2000, [{ id: 'e', ...snap(0, 7) }]), true);
    assert.equal(interp.buffers.get('e').length, 1);
    assert.equal(interp.clock.owdMs, 50, 'latency knowledge survives the epoch change');
  });
});

// ---------------------------------------------------------------------------------------------------------------------
describe('(d) jittered arrival', () => {
  it('+-30 ms random arrival jitter does not move the rendered path; render time never decreases', () => {
    const rng = makeRng(12345);
    const OFFSET = 1_700_000_123_456.789; // local = server + OFFSET (arbitrary epoch difference)
    const T0 = 5_000_000;
    const SPEED = 6; // m/s along x
    const path = (tServer) => SPEED * (tServer - T0) / 1000;
    const jitter = () => (rng() * 2 - 1) * 30;
    const ONE_WAY = 60;

    const interp = new SnapshotInterpolator();
    const arrivals = [];
    for (let k = 0; k < 200; k++) {
      const T = T0 + k * TICK_MS;
      arrivals.push({ at: T + OFFSET + ONE_WAY + jitter(), T, x: path(T), yaw: 0.5 + k * 0.05 });
    }
    arrivals.sort((p, q) => p.at - q.at);
    assert.ok(arrivals.some((a, i) => i > 0 && a.T < arrivals[i - 1].T), 'the jitter really reorders packets');

    let prevRender = -Infinity;
    let prevX = null;
    let maxPosErr = 0;
    let maxStepErr = 0;
    let frames = 0;
    let extrapolated = 0;
    let rttSeeds = 6;
    for (let i = 0; i < 6; i++) interp.setRttMs(2 * ONE_WAY + jitter() + jitter()); // earlier pingChecks
    const STEP = 1000 / 60;
    for (let L = T0 + OFFSET; L < T0 + OFFSET + 7500; L += STEP) {
      while (arrivals.length && arrivals[0].at <= L) {
        const a = arrivals.shift();
        interp.pushState(a.T, a.at, [{ id: 'e', ...snap(0, a.x, { yaw: a.yaw, vx: SPEED }) }]);
      }
      if (Math.floor((L - T0 - OFFSET) / 2500) >= rttSeeds) {
        rttSeeds++;
        interp.setRttMs(2 * ONE_WAY + jitter() + jitter()); // client-measured round trip
      }
      const r = interp.renderTime(L);
      if (!Number.isFinite(r)) continue;
      assert.ok(r >= prevRender, `render time decreased: ${prevRender} -> ${r}`);
      prevRender = r;
      const s = interp.sample('e', r);
      if (!s) continue;
      frames++;
      if (s.extrapolated) extrapolated++;
      if (L - T0 - OFFSET > 3500) { // after clock warm-up
        const truth = path(L - OFFSET - interp.delayMs); // the adaptive delay currently applied
        maxPosErr = Math.max(maxPosErr, Math.abs(s.x - truth));
        if (prevX !== null) maxStepErr = Math.max(maxStepErr, Math.abs((s.x - prevX) - SPEED * STEP / 1000));
      }
      prevX = s.x;
    }
    assert.ok(frames > 300);
    // Clock error (a few ms at 6 m/s) is all that is left: well under the 0.1 m a single 60 fps frame covers
    assert.ok(maxPosErr < 0.15, `rendered path deviates from the true path by ${maxPosErr.toFixed(3)} m`);
    assert.ok(maxStepErr < 0.02, `frame-to-frame jitter ${maxStepErr.toFixed(4)} m (nominal step ${SPEED * STEP / 1000} m)`);
    assert.ok(extrapolated < frames * 0.5);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
describe('(e) starvation: damped extrapolation <= MAX_EXTRAPOLATION_MS, then hold', () => {
  it('extrapolates with a damped velocity for at most MAX_EXTRAPOLATION_MS and then holds with zero speed', () => {
    assert.equal(MAX_EXTRAPOLATION_MS, 250);
    const buf = new SnapshotBuffer();
    buf.push(snap(1000, 0, { vx: 10 }));
    buf.push(snap(1040, 0.4, { vx: 10 }));
    assert.equal(buf.sample(1040).extrapolated, false);
    const tau = buf.extrapolationTauMs / 1000;
    const disp = (ms) => 10 * tau * (1 - Math.exp(-ms / buf.extrapolationTauMs)); // integral of v * exp(-t / tau)
    const a = buf.sample(1040 + 50);
    assert.ok(Math.abs(a.x - (0.4 + disp(50))) < 1e-9);
    assert.ok(a.x < 0.4 + 10 * 0.05, 'damped: less than undamped dead reckoning');
    assert.equal(a.extrapolated, true);
    assert.ok(a.vx < 10 && a.vx > 0, 'speed decays while starving');
    // monotone and bounded: never overshoots v * tau
    let prev = 0.4;
    for (let over = 10; over <= MAX_EXTRAPOLATION_MS; over += 10) {
      const x = buf.sample(1040 + over).x;
      assert.ok(x >= prev - 1e-12 && x <= 0.4 + 10 * tau + 1e-9);
      prev = x;
    }
    const b = buf.sample(1040 + MAX_EXTRAPOLATION_MS);
    assert.ok(Math.abs(b.x - (0.4 + disp(MAX_EXTRAPOLATION_MS))) < 1e-9);
    for (const over of [MAX_EXTRAPOLATION_MS + 1, 400, 5000]) {
      const c = buf.sample(1040 + over);
      assert.ok(Math.abs(c.x - b.x) < 1e-9, `holds at ${over} ms`);
      assert.equal(c.vx, 0);
    }
    // A new snapshot ends the starvation: positions continue from the real data (corrected, no explosion)
    buf.push(snap(1500, 4.4, { vx: 10 }));
    assert.ok(Math.abs(buf.sample(1500).x - 4.4) < 1e-9);
  });

  it('only rises with positive vy, never sinks, and never extrapolates a dead entity', () => {
    const buf = new SnapshotBuffer();
    buf.push(snap(1000, 0, { y: 2, vy: -8 }));
    assert.equal(buf.sample(1080).y, 2);
    const up = new SnapshotBuffer({ extrapolationTauMs: 0 }); // tau 0 = plain linear dead reckoning
    up.push(snap(1000, 0, { y: 2, vy: 4 }));
    assert.ok(Math.abs(up.sample(1050).y - 2.2) < 1e-9);
    const dead = new SnapshotBuffer();
    dead.push(snap(1000, 3, { vx: 9, alive: false }));
    assert.equal(dead.sample(1090).x, 3);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
describe('(f) teleport / respawn / alive flip snap without a streak', () => {
  it('never produces an in-between pose across a >12 m jump; still interpolates below the threshold', () => {
    assert.equal(TELEPORT_SNAP_DISTANCE, 12);
    const buf = new SnapshotBuffer();
    buf.push(snap(1000, 0));
    buf.push(snap(1040, 20)); // teleport
    buf.push(snap(1080, 20.2));
    const seen = new Set();
    for (let t = 1000; t <= 1080; t += 1) seen.add(buf.sample(t).x);
    for (const x of seen) assert.ok(x === 0 || x >= 20, `streak position ${x}`);
    assert.equal(buf.sample(1039.9).x, 0);
    assert.equal(buf.sample(1040).x, 20);
    assert.ok(Math.abs(buf.sample(1060).x - 20.1) < 1e-9, 'interpolation resumes after the snap');

    const near = new SnapshotBuffer();
    near.push(snap(1000, 0));
    near.push(snap(1040, 11.9));
    assert.ok(Math.abs(near.sample(1020).x - 5.95) < 1e-9);
  });

  it('an alive flip is a step (earlier values until crossed), and reset() forgets the death position', () => {
    const buf = new SnapshotBuffer();
    buf.push(snap(1000, 10, { alive: true }));
    buf.push(snap(1040, 10.1, { alive: false }));
    buf.push(snap(1080, 10.1, { alive: false }));
    buf.push(snap(1120, 11, { alive: true })); // respawn 0.9 m away - short but still a state change
    assert.equal(buf.sample(1020).alive, true);
    assert.equal(buf.sample(1020).x, 10, 'no interpolation into the dead pose');
    assert.equal(buf.sample(1040).alive, false);
    assert.equal(buf.sample(1100).alive, false);
    assert.equal(buf.sample(1119).x, 10.1);
    assert.equal(buf.sample(1120).x, 11);
    assert.equal(buf.sample(1120).alive, true);

    const interp = new SnapshotInterpolator();
    interp.pushState(1000, 0, [{ id: 'r', ...snap(0, -50, { alive: false }) }]);
    interp.pushState(1040, 40, [{ id: 'r', ...snap(0, -50, { alive: false }) }]);
    interp.reset('r'); // playerRespawned
    assert.equal(interp.sample('r', 1020), null);
    interp.pushState(1080, 80, [{ id: 'r', ...snap(0, 30, { alive: true }) }]);
    interp.pushState(1120, 120, [{ id: 'r', ...snap(0, 30.2, { alive: true }) }]);
    for (let t = 1000; t <= 1120; t += 5) {
      assert.ok(interp.sample('r', t).x >= 30, `no streak from the death position at ${t}`);
    }
    interp.remove('r');
    assert.equal(interp.has('r'), false);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
describe('(g) clock offset', () => {
  const OFFSET = 1_700_000_000_000.25;
  const T0 = 20_000_000;

  function feed(clock, kStart, kEnd, delayFn) {
    let last = 0;
    for (let k = kStart; k < kEnd; k++) {
      const T = T0 + k * TICK_MS;
      last = T + OFFSET + delayFn(k);
      clock.observe(T, last);
    }
    return last;
  }

  it('converges to the true server time (one-way latency added back from the RTT) and is monotone while slewing', () => {
    const clock = new ServerClock();
    clock.setRttMs(120);
    // first packet arrives very late (200 ms), then the path settles at 60 ms
    clock.observe(T0, T0 + OFFSET + 200);
    let prev = -Infinity;
    let worstBackwards = 0;
    for (let k = 1; k <= 200; k++) {
      const T = T0 + k * TICK_MS;
      const recv = T + OFFSET + 60;
      clock.observe(T, recv);
      for (let f = 0; f < 3; f++) {
        const L = recv + f * 13.3;
        const now = clock.serverNow(L);
        worstBackwards = Math.min(worstBackwards, now - prev);
        prev = now;
        if (k > 150) assert.ok(Math.abs(now - (L - OFFSET)) < 1, `true server time at k=${k}: err ${now - (L - OFFSET)}`);
      }
    }
    assert.ok(worstBackwards >= 0, 'serverNow never decreases');
    assert.equal(clock.resyncCount, 0, 'slewed, no hard re-sync');
  });

  it('is not moved by a latency spike (late packets) and renders monotone through it', () => {
    const clock = new ServerClock();
    clock.setRttMs(120);
    feed(clock, 0, 100, () => 60);
    const before = clock.serverNow(T0 + 100 * TICK_MS + OFFSET + 60);
    const L0 = T0 + 100 * TICK_MS + OFFSET + 60;
    let prev = before;
    // 6 packets arrive 250 ms late (a burst after a hiccup), then the path is normal again
    for (let k = 100; k < 140; k++) {
      const T = T0 + k * TICK_MS;
      const delay = (k >= 110 && k < 116) ? 60 + 250 : 60;
      clock.observe(T, T + OFFSET + delay);
      const L = T + OFFSET + 60;
      const now = clock.serverNow(L);
      assert.ok(now >= prev, 'monotone through the spike');
      prev = now;
      assert.ok(Math.abs(now - (L - OFFSET)) < 1, `spike must not shift the estimate (k=${k}, err ${now - (L - OFFSET)})`);
    }
    assert.ok(L0 > 0);
  });

  it('follows a persistent latency change by slewing (<= 5 % speed change) without going backwards', () => {
    const clock = new ServerClock();
    clock.setRttMs(120);
    feed(clock, 0, 100, () => 60);
    let prev = clock.serverNow(T0 + 100 * TICK_MS + OFFSET + 60);
    let prevL = T0 + 100 * TICK_MS + OFFSET + 60;
    let maxRate = 0;
    let minRate = Infinity;
    // path delay rises permanently by +40 ms (the server time estimate must retreat by 40 ms, slowly)
    for (let k = 100; k < 400; k++) {
      const T = T0 + k * TICK_MS;
      const recv = T + OFFSET + 100;
      clock.observe(T, recv);
      const now = clock.serverNow(recv);
      const rate = (now - prev) / (recv - prevL);
      maxRate = Math.max(maxRate, rate);
      minRate = Math.min(minRate, rate);
      assert.ok(now >= prev);
      prev = now;
      prevL = recv;
    }
    assert.ok(maxRate <= 1.0501 && minRate >= 0.9499, `rate stays within +-5 %: ${minRate}..${maxRate}`);
    // asymptote: bestOffset moved by -40 ms (RTT not re-measured here), so the estimate has dropped by exactly that
    const L = T0 + 400 * TICK_MS + OFFSET + 100;
    assert.ok(Math.abs(clock.serverNow(L) - (L - OFFSET - 40)) < 1);
  });

  it('a step above CLOCK_RESYNC_MS is re-synchronised instantly (server restart / clock step)', () => {
    const clock = new ServerClock();
    feed(clock, 0, 100, () => 60);
    clock.serverNow(T0 + 100 * TICK_MS + OFFSET);
    // stamps now come from a clock 30 s ahead of the old estimate but still "increasing"
    for (let k = 100; k < 260; k++) {
      const T = T0 + 30_000 + k * TICK_MS;
      clock.observe(T, T0 + k * TICK_MS + OFFSET + 60);
    }
    const L = T0 + 260 * TICK_MS + OFFSET + 60;
    clock.serverNow(L);
    assert.ok(clock.resyncCount >= 1);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
describe('(h) lag-compensation parity: what the shooter sees == what the server rewinds to', () => {
  it('rewind constants: INTERP_DELAY_MS is the single source, history covers the maximum rewind', () => {
    assert.equal(INTERP_DELAY_MS, 100);
    assert.equal(resolveShotRewindMs({ id: 's', rttMs: 120 }), 120 / 2 + INTERP_DELAY_MS, 'no report yet: the start delay');
    assert.equal(resolveShotRewindMs({ id: 's', rttMs: 120, interpDelayMs: 180 }), 120 / 2 + 180, 'reported delay is used');
    assert.equal(new SnapshotInterpolator().interpDelayMs, INTERP_DELAY_MS);
    assert.equal(new SnapshotInterpolator().delayMs, INTERP_DELAY_MS, 'adaptive delay starts at the shared start value');
    assert.ok(LAG_COMP_HISTORY_MS >= LAG_COMP_MAX_REWIND_MS + TICK_MS, 'history window covers the max rewind plus one tick');
    assert.ok(INTERP_DELAY_MS >= 2 * TICK_MS, 'render delay spans >= 2 snapshots');
  });

  it('shooter client render position at fire time == server rewound position (60 ms one-way, 25 Hz, constant speed)', () => {
    const { rm, emitted } = createServer();
    const S0 = Date.now();
    const clock = { now: S0 };
    const OFFSET = 987_654_321.5; // client clock = server clock + OFFSET (unsynchronised clocks)
    const ONE_WAY = 60;
    const SPEED = 7.5; // m/s along +x
    const X0 = -20;
    const pathX = (S) => X0 + SPEED * (S - S0) / 1000;

    withClock(clock, () => {
      const { room, player: shooter } = join(rm, 'shooter', 'PAR001');
      const { player: target } = join(rm, 'target', 'PAR001');
      shooter.rttMs = 2 * ONE_WAY; // server-measured RTT
      target.y = 0;
      target.z = -5;

      const interp = new SnapshotInterpolator();
      const toClient = [];
      const rtts = [2 * ONE_WAY, 2 * ONE_WAY, 2 * ONE_WAY];
      const reportedDelay = () => interp.delayMs; // what the client sends in its inputBatch (`d`)
      for (const r of rtts) interp.setRttMs(r); // client-measured RTT (pingCheck)

      const SIM_MS = 4000;
      let emittedSeen = 0;
      const deliver = (L) => {
        while (toClient.length && toClient[0].at <= L) {
          const m = toClient.shift();
          interp.pushState(m.payload.t, m.at, JSON.parse(JSON.stringify(m.payload.players)), shooter.id);
        }
      };

      // Server ticks every 40 ms while the client renders at 60 fps
      for (let S = S0 + TICK_MS; S <= S0 + SIM_MS; S += TICK_MS) {
        clock.now = S;
        target.x = pathX(S);
        rm.tick();
        const states = emitted.filter((e) => e.event === 'stateUpdate');
        for (; emittedSeen < states.length; emittedSeen++) {
          toClient.push({ at: S + ONE_WAY + OFFSET, payload: states[emittedSeen].payload });
        }
        // 3 client frames (60 fps) ending exactly at this tick's server-equivalent time
        for (let f = 0; f < 3; f++) {
          const L = S + OFFSET - (2 - f) * (TICK_MS / 3);
          deliver(L);
          interp.renderTime(L); // clock keeps running every frame
        }
      }

      // The shooter fires at server-equivalent time Sf; the client frame at that moment renders target X_seen
      const Sf = S0 + SIM_MS;
      const Lf = Sf + OFFSET;
      deliver(Lf);
      const renderT = interp.renderTime(Lf);
      const seen = interp.sample(target.id, renderT);
      assert.ok(seen && !seen.extrapolated, 'enough snapshots to interpolate (not starved) at 60 ms one-way latency');
      // convergence of the clock: renders exactly the (adaptive) delay behind the true server time
      const delay = reportedDelay();
      assert.ok(delay >= 60 + TICK_MS, 'the adaptive delay covers the one-way latency plus a snapshot interval');
      assert.ok(Math.abs(renderT - (Sf - delay)) < 1, `render time ${renderT - Sf} ms vs -${delay}`);

      // The shot reaches the server one-way later; the server keeps ticking meanwhile
      const Srx = Sf + ONE_WAY;
      for (let S = Sf + TICK_MS; S <= Srx; S += TICK_MS) {
        clock.now = S;
        target.x = pathX(S);
        rm.tick();
      }
      clock.now = Srx;
      target.x = pathX(Srx);
      rm.noteInterpDelay(shooter, delay, Srx - 1000); // earlier reports keep the accepted value close ...
      rm.noteInterpDelay(shooter, delay, Srx);        // ... and slew-limited to the final one
      assert.ok(Math.abs(shooter.interpDelayMs - delay) <= 1, `accepted delay ${shooter.interpDelayMs} vs reported ${delay}`);
      const rewindMs = resolveShotRewindMs(shooter, {}, Srx);
      assert.ok(Math.abs(rewindMs - (ONE_WAY + delay)) <= 1);
      const saved = rewindRoomPlayersForShot(room, shooter.id, rewindMs, Srx);
      const rewoundX = target.x;
      restoreRewoundPlayers(saved);

      assert.ok(Math.abs(target.x - pathX(Srx)) < 1e-9, 'live position restored after the rewind');
      assert.ok(
        Math.abs(rewoundX - seen.x) < 0.03,
        `server rewound x=${rewoundX.toFixed(3)} vs shooter's rendered x=${seen.x.toFixed(3)} (diff ${(rewoundX - seen.x).toFixed(4)} m)`
      );
      // and both equal the true path at (fire time - INTERP_DELAY_MS), up to the 0.01 m wire quantisation
      assert.ok(Math.abs(rewoundX - pathX(Sf - delay)) < 0.03 + SPEED * 0.001);
    });
  });
});

// ---------------------------------------------------------------------------------------------------------------------
describe('(i) headless Game3D draws remote players by snapshot interpolation', () => {
  it('rig position / yaw follow the interpolated pose; respawn resets; removal disposes the buffer; hitboxes follow', async () => {
    const { THREE } = await loadGame3D();
    const game = await createTestGame3D();
    game.localId = 'me';
    game.inMatch = false; // keeps footstep audio out of the headless run

    const OFFSET = 424_242.125;
    const ONE_WAY = 40;
    const T0 = 3_000_000;
    const SPEED = 6;
    const pathX = (T) => 10 + SPEED * (T - T0) / 1000;
    const yawAt = (T) => 0.2 + 0.4 * (T - T0) / 1000;

    const players = (T, over = {}) => [
      { id: 'me', name: 'Me', x: 0, y: 0, z: 0, yaw: 0, pitch: 0, alive: true, hp: 100, grenades: 1 },
      {
        id: 'r1', name: 'R1', color: 0xef4444,
        x: pathX(T), y: 0, z: -12, vx: SPEED, vy: 0, vz: 0, yaw: yawAt(T), pitch: 0.1,
        crouching: false, prone: false, lean: 0, weapon: 'rifle', hp: 100, alive: true, ...over
      },
      {
        id: 'b1', name: 'STANDER', color: 0xf97316,
        x: -30, y: 0, z: 25, vx: 0, vy: 0, vz: 0, yaw: 1, pitch: 0,
        crouching: false, prone: false, lean: 0, weapon: 'smg', hp: 100, alive: true
      }
    ];

    game.setNetworkRtt(2 * ONE_WAY);
    game.setNetworkRtt(2 * ONE_WAY);
    const STEP = 1000 / 60;
    let nextTick = T0;
    let L = T0 + OFFSET;
    let lastSync = null;
    const run = (ms, perTick = null, onFrame = null) => {
      const end = L + ms;
      for (; L < end; L += STEP) {
        while (nextTick + ONE_WAY + OFFSET <= L) {
          const list = perTick ? perTick(nextTick) : players(nextTick);
          game.syncPlayersState(list, nextTick, nextTick + ONE_WAY + OFFSET);
          lastSync = nextTick;
          nextTick += TICK_MS;
        }
        game.updateRemotePlayers(STEP / 1000, L);
        onFrame?.();
      }
    };

    run(3000);
    assert.equal(game.remotePlayers.size, 2);
    const rp = game.remotePlayers.get('r1');
    assert.ok(rp);
    assert.ok(lastSync !== null);

    // Position == the true path at (true server time - the adaptive delay) after the clock has converged
    const trueServerNow = L - STEP - OFFSET; // last frame time
    const expectedT = trueServerNow - game.snapshots.delayMs;
    assert.ok(Math.abs(rp.group.position.x - pathX(expectedT)) < 0.06, `x ${rp.group.position.x} vs ${pathX(expectedT)}`);
    assert.ok(Math.abs(rp.group.position.z + 12) < 1e-9);
    assert.ok(angDist(rp.group.rotation.y, yawAt(expectedT)) < 0.03, 'yaw interpolated');
    assert.ok(rp.smoothedSpeed > 4 && rp.smoothedSpeed < 8, `animation speed derived from interpolated motion: ${rp.smoothedSpeed}`);
    assert.ok(rp.group.position.x < pathX(lastSync), 'drawn behind the newest server snapshot (interpolation delay)');
    assert.equal(game.remotePlayers.get('b1').smoothedSpeed, 0, 'standing remote player has no walk animation');
    assert.ok(!('serverPos' in rp), 'dead-reckoning state is gone');

    // Hitbox proxies follow the interpolated rig pose (matrices are updated like attemptShoot does before its raycast)
    rp.group.updateMatrixWorld(true);
    const parts = game.hitboxMeshes.filter((m) => m.userData.playerId === 'r1');
    assert.ok(parts.length > 0);
    const tmp = new THREE.Vector3();
    for (const part of parts) {
      tmp.setFromMatrixPosition(part.matrixWorld);
      assert.ok(Math.abs(tmp.x - rp.group.position.x) < 1.0 && Math.abs(tmp.z - rp.group.position.z) < 1.0, 'hitbox near the drawn rig');
    }

    // Death, then respawn far away. r1 is revived by the `playerRespawned` event (main.js), b1 by the alive flip inside the
    // next stateUpdate: neither may streak from the death position to the spawn point.
    let phase = 'dead';
    const phased = (T) => {
      const list = players(T);
      if (phase === 'dead') {
        list[1].alive = false; list[1].hp = 0;
        list[2].alive = false; list[2].hp = 0;
      } else {
        list[1].x = -40; list[1].z = 30; list[1].vx = 0;
        list[2].x = 35; list[2].z = -20;
      }
      return list;
    };
    run(400, phased);
    const rpBot = game.remotePlayers.get('b1');
    assert.equal(rp.alive, false);
    assert.equal(rp.group.visible, false);
    assert.equal(rpBot.alive, false);
    assert.equal(game.hitboxMeshes.some((m) => m.userData.playerId === 'r1' || m.userData.playerId === 'b1'), false);

    phase = 'alive';
    rp.alive = true; // what the playerRespawned handler does first ...
    game.resetRemoteInterpolation('r1', -40, 0, 30, 0); // ... then this
    game.rebuildHitboxList();
    const xsR1 = [];
    const xsBot = [];
    run(700, phased, () => {
      if (rp.alive) xsR1.push(rp.group.position.x);
      if (rpBot.alive) xsBot.push(rpBot.group.position.x);
    });
    assert.ok(xsR1.length > 30 && xsBot.length > 20, 'both entities were drawn after the respawn');
    assert.ok(xsR1.every((x) => Math.abs(x + 40) < 0.01), `no streak for r1: ${xsR1.slice(0, 4)}`);
    assert.ok(xsBot.every((x) => Math.abs(x - 35) < 0.01), `no streak for b1: ${xsBot.slice(0, 4)}`);
    assert.equal(rp.group.visible, true);
    assert.ok(Math.abs(rp.group.position.z - 30) < 0.01);

    // Removing the entity disposes its buffer
    assert.equal(game.snapshots.has('r1'), true);
    game.syncPlayersState(players(nextTick).filter((p) => p.id !== 'r1'), nextTick, L);
    assert.equal(game.remotePlayers.has('r1'), false);
    assert.equal(game.snapshots.has('r1'), false);
    game.clearAllRemotePlayers();
    assert.equal(game.snapshots.size, 0);
  });

  it('smooths single-tick 0-command starvation + catch-up burst and pools tracer / remote weapon geometries', async () => {
    const buf = new SnapshotBuffer();
    // Simulate a remote player running at 6.2 m/s where tick 1040 had 0 commands processed and tick 1080 had 4 commands
    buf.push(snap(1000, 0.0, { vx: 6.2, vz: 0 }));
    buf.push(snap(1040, 0.0, { vx: 6.2, vz: 0 })); // 0-command starvation tick
    buf.push(snap(1080, 0.496, { vx: 6.2, vz: 0 })); // 4-command catch-up tick
    assert.equal(buf.snaps[1].smoothed, true, 'intermediate starvation tick is smoothed');
    assert.ok(Math.abs(buf.snaps[1].x - 0.248) < 1e-6, 'intermediate snapshot moved to linear midpoint');
    const mid = buf.sample(1020);
    assert.ok(Math.abs(mid.x - 0.124) < 1e-6);
    assert.ok(Math.abs(mid.vx - 6.2) < 0.05, 'segment velocity stays steady instead of dropping to 0');

    const game = await createTestGame3D();
    game.localId = 'me';
    game.syncPlayersState(
      [
        { id: 'me', name: 'Me', x: 0, y: 0, z: 0, alive: true, hp: 100 },
        { id: 'r2', name: 'R2', x: 5, y: 0, z: -8, vx: 0, vy: 0, vz: 0, weapon: 'rifle', alive: true, hp: 100 }
      ],
      2000,
      2000
    );
    const rp2 = game.remotePlayers.get('r2');
    assert.ok(rp2);
    // Weapon swap reuses cached geometries and keeps frustumCulled = true
    game.syncPlayersState(
      [
        { id: 'me', name: 'Me', x: 0, y: 0, z: 0, alive: true, hp: 100 },
        { id: 'r2', name: 'R2', x: 5, y: 0, z: -8, vx: 0, vy: 0, vz: 0, weapon: 'smg', alive: true, hp: 100 }
      ],
      2040,
      2040
    );
    let allSharedAndBounded = true;
    rp2.gunMesh.traverse((o) => {
      if (o.isMesh) {
        if (!o.geometry?.userData?.shared || !o.geometry?.boundingSphere || o.frustumCulled !== true) {
          allSharedAndBounded = false;
        }
      }
    });
    assert.equal(allSharedAndBounded, true, 'swapped remote weapon meshes use cached geometries with bounding spheres');

    // Tracer pooling & cap
    for (let i = 0; i < 30; i++) {
      game.spawnTracerEffect({ x: 0, y: 1.5, z: 0 }, { x: 0, y: 1.5, z: -10 }, 0xfef08a, false, null, i + 1);
    }
    const maxBudget = game.quality?.maxShotEffects || 20;
    const activeTracers = game.activeEffects.filter((fx) => fx.type === 'tracer');
    assert.ok(activeTracers.length <= maxBudget, `active tracers (${activeTracers.length}) capped to <= ${maxBudget}`);
    game._recycleTracerEffect(game.activeEffects.pop());
    assert.equal(game.tracerLinePool?.length, 1, 'recycled tracer lines are pooled for reuse');
  });
});

