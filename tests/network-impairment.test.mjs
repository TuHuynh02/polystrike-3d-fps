/**
 * Network impairment: how smooth and how consistent are REMOTE players for a viewer on a bad link?
 *
 * tests/helpers/net-impairment.mjs drives the REAL RoomManager.tick() (virtual clock), a simulated link (one-way latency,
 * jitter, loss / burst loss, reordering; 'tcp' = WebSocket-like with head-of-line blocking, 'udp' = drops + reordering) and a
 * REAL headless Game3D (syncPlayersState + updateRemotePlayers + SnapshotInterpolator) rendering at 60 fps.
 * Profile numbers are ONE-WAY milliseconds (RTT = 2x). Simulated: link behaviour only - no real Wi-Fi, no real GPU frame times.
 *
 * Metrics: rms / p95 = 3D distance between the rendered pose and the true server pose AT THE RENDER TIME the viewer displays;
 * pops = frame-to-frame jumps beyond 14.5 m/s * dt + 2 cm (above the fastest legal motion); starved = frames drawn by
 * extrapolation / hold; parity = distance between the pose the shooter saw and the pose the server rewinds to for a shot.
 *
 * BASELINE (commit cbadc5e: fixed 100 ms delay, linear extrapolation <= 100 ms then hold, 200 ms rewind cap), seed 7, 30 s,
 * 5 remote players, tcp / udp:
 *   lan     rms .020 p95 .042 pops 0            starved 0 %                   | same
 *   good    rms .020 p95 .040 pops 1            starved 10.5 %  (owd 60 + 40 ms interval > 100 ms delay)
 *   typical rms .381 p95 .806 pops 258 (4.7 m)  starved 80.7 %  maxStarve 1583 ms | udp: rms .121 p95 .263 pops 285 starved 91 %
 *   bad     rms .678 p95 1.67 pops 586 (4.2 m)  starved 68.5 %                   | udp: rms .565 pops 1076 starved 100 %
 *   awful   rms 1.38 p95 2.94 pops 256 (6.3 m)  starved 81.8 %                   | udp: rms .937 pops 1161 starved 100 %
 *   wifi80  rms .101 p95 .062 pops 24 (2.0 m)   starved 4.3 %                    | udp: rms .022 pops 2
 *   (parity p95 at typical/bad/awful: 1.0 / 2.8 / 3.6 m in tcp mode - the client rendered a pose the server never rewound to)
 * Why: the old delay is INTERP_DELAY_MS = 100 ms behind the TRUE server time, but a snapshot is only available owd + 40 ms
 * after it was stamped, so any one-way latency above 60 ms starves the buffer permanently.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { WebSocket } from 'ws';

import { PROFILES, EXTRA_PROFILES, runScenario, makeRng } from './helpers/net-impairment.mjs';
import { createTestGame3D } from './helpers/headless-game3d.mjs';

import { buildInputCommand } from '../shared/netcode.js';
import {
  INTERP_DELAY_MAX_MS,
  INTERP_DELAY_MIN_MS,
  INTERP_DELAY_MS,
  MAX_LAG_COMP_REWIND_MS
} from '../shared/config.js';
import {
  INTERP_REPORT_SLEW_PER_S,
  LAG_COMP_HISTORY_MS,
  LAG_COMP_MAX_REWIND_MS,
  applyReportedInterpDelay,
  resolveShotRewindMs,
  sanitizeInterpDelayMs
} from '../shared/lagCompensation.js';
import { RoomManager } from '../server/roomManager.js';
import { RollingStats, ServerNetStats } from '../server/netStats.js';

const {
  JitterBuffer,
  MAX_EXTRAPOLATION_MS,
  SnapshotInterpolator,
  TELEPORT_SNAP_DISTANCE,
  DELAY_UP_RATE,
  DELAY_DOWN_RATE
} = await import('../public/js/snapshotBuffer.js');
const {
  TRANSPORTS_FALLBACK,
  TRANSPORTS_FIRST,
  buildSocketOptions,
  installRejoinOnReconnect,
  installTransportFallback
} = await import('../public/js/networkAdapter.js');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');
const TICK_MS = 40;
const MAP_ID = 'cyber_citadel';

// ---------------------------------------------------------------------------------------------------------------------
describe('impairment profiles (real RoomManager -> simulated link -> real headless Game3D), 30 s, 5 remote players', () => {
  const all = { ...PROFILES, ...EXTRA_PROFILES };
  const results = {};

  before(async () => {
    for (const mode of ['tcp', 'udp']) {
      for (const [name, profile] of Object.entries(all)) {
        results[`${mode}/${name}`] = await runScenario({ profile, mode, seed: 7, durationMs: 30000 });
      }
    }
  });

  const R = (mode, name) => results[`${mode}/${name}`];

  for (const mode of ['tcp', 'udp']) {
    it(`[${mode}] LAN (20 ms) and good (60 ms +-10): no pop at all, tight error, no starvation, shots match the screen`, () => {
      for (const name of ['lan', 'good']) {
        const r = R(mode, name);
        assert.equal(r.pops, 0, `${name}: pops ${r.pops}`);
        assert.ok(r.rmsErr < 0.04 && r.p95Err < 0.08, `${name}: rms ${r.rmsErr} p95 ${r.p95Err}`);
        assert.ok(r.starvedPct < 1, `${name}: starved ${r.starvedPct} %`);
        assert.ok(r.parityP95 < 0.15, `${name}: parity p95 ${r.parityP95} m`);
        assert.ok(r.meanLagMs >= INTERP_DELAY_MIN_MS - 1 && r.meanLagMs < 160, `${name}: lag ${r.meanLagMs}`);
      }
    });
  }

  it('[udp] typical office (100 ms +-30, 2 % loss): 0 pops, p95 < 12 cm (baseline: 285 pops, 91 % starved)', () => {
    const r = R('udp', 'typical');
    assert.equal(r.pops, 0);
    assert.ok(r.p95Err < 0.12, `p95 ${r.p95Err}`);
    assert.ok(r.starvedPct < 2, `starved ${r.starvedPct} %`);
    assert.ok(r.maxStarveMs <= 100, `longest starvation ${r.maxStarveMs} ms`);
    assert.ok(r.parityP95 < 0.5, `parity p95 ${r.parityP95}`);
  });

  it('[tcp] typical office with 2 % loss = 300 ms head-of-line stalls: bounded, no teleport (baseline: 258 pops up to 4.7 m)', () => {
    const r = R('tcp', 'typical');
    assert.ok(r.pops <= 45, `pops ${r.pops}`);
    assert.ok(r.maxPop < 0.6, `largest single-frame jump ${r.maxPop} m`);
    assert.ok(r.p95Err < 1.0 && r.rmsErr < 0.45, `rms ${r.rmsErr} p95 ${r.p95Err}`);
    assert.ok(r.starvedPct < 15, `starved ${r.starvedPct} %`);
    assert.ok(r.maxStarveMs <= 450, `longest starvation ${r.maxStarveMs} ms`);
  });

  it('realistic office Wi-Fi (RTT 80 ms, 15 ms jitter, 1 % loss): 0 pops, p95 < 5 cm (udp) / < 30 cm (tcp)', () => {
    assert.equal(R('udp', 'wifi80').pops, 0);
    assert.ok(R('udp', 'wifi80').p95Err < 0.07);
    assert.ok(R('tcp', 'wifi80').pops <= 3);
    assert.ok(R('tcp', 'wifi80').p95Err < 0.3, `tcp p95 ${R('tcp', 'wifi80').p95Err}`);
  });

  it('bad (180 ms +-60, 5 % loss in 3-packet bursts) and awful (250 ms +-100, 8 %): degraded but bounded, never a teleport', () => {
    const badU = R('udp', 'bad');
    assert.ok(badU.rmsErr < 0.45 && badU.p95Err < 0.9, `udp bad rms ${badU.rmsErr} p95 ${badU.p95Err}`); // baseline rms .565, 1076 pops
    assert.ok(badU.parityP95 < 1.2, `udp bad parity ${badU.parityP95}`);
    for (const [mode, name] of [['udp', 'bad'], ['tcp', 'bad'], ['udp', 'awful'], ['tcp', 'awful']]) {
      const r = R(mode, name);
      assert.ok(r.maxPop < 0.8, `${mode}/${name}: largest single-frame jump ${r.maxPop} m`); // baseline: up to 6.3 m
      assert.ok(r.pops <= 120, `${mode}/${name}: pops ${r.pops}`); // baseline: 256 .. 1161
      assert.ok(r.maxErr < 8, `${mode}/${name}: max error ${r.maxErr} m`);
    }
    assert.ok(R('tcp', 'bad').rmsErr < 0.8);
    assert.ok(R('udp', 'awful').rmsErr < 0.9);
  });

  it('the adaptive pipeline beats the old fixed 100 ms / 100 ms-extrapolation behaviour on the same link and seed', async () => {
    const legacy = await runScenario({
      profile: PROFILES.typical,
      mode: 'udp',
      seed: 7,
      durationMs: 30000,
      setupGame: (game) => {
        game.snapshots.fixedDelay = true;
        game.snapshots.interpDelayMs = INTERP_DELAY_MS;
        game.snapshots.opts.maxExtrapolationMs = 100;
        game.snapshots.opts.extrapolationTauMs = 0;
      }
    });
    const adaptive = R('udp', 'typical');
    // (the legacy run still benefits from the new catch-up smoothing, so only the delay + extrapolation differences show here;
    //  the original code produced 285 pops here, see the baseline in the header)
    assert.ok(legacy.starvedPct > 50, `legacy starved ${legacy.starvedPct}`);
    assert.ok(adaptive.starvedPct < 2 && adaptive.pops === 0);
    assert.ok(adaptive.rmsErr < legacy.rmsErr / 5, `rms ${adaptive.rmsErr} vs ${legacy.rmsErr}`);
    assert.ok(adaptive.p95Err < legacy.p95Err / 5);
    assert.ok(adaptive.parityP95 < legacy.parityP95 / 2);
  });

  it('server stalls (160-300 ms without a tick, every ~6 s) cost at most a short, smooth correction', async () => {
    for (const profile of [PROFILES.good, EXTRA_PROFILES.wifi80]) {
      const r = await runScenario({ profile, mode: 'tcp', seed: 3, durationMs: 30000, serverStalls: true });
      assert.ok(r.maxPop < 0.6, `largest jump ${r.maxPop}`);
      assert.ok(r.p95Err < 0.45, `p95 ${r.p95Err}`);
      assert.ok(r.maxStarveMs <= 330, `longest starvation ${r.maxStarveMs}`);
    }
  });

  it('bandwidth: one stateUpdate stream costs ~58 KB/s for 6 players (~101 KB/s for 12) at 25 Hz', () => {
    const r = R('udp', 'lan');
    assert.ok(r.bytesPerSec > 40_000 && r.bytesPerSec < 80_000, `bytes/s ${r.bytesPerSec}`);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
/** Feeds a stamped stream through arrival jitter and renders at 60 fps; returns per-frame render time / delay. */
function simulateStream({ owd, lateness, seconds, rttNoise = 0, interp = new SnapshotInterpolator(), x = (T) => T / 1000 * 6, t0 = 5_000_000, offset = 777_000.5, id = 'e' }) {
  const rng = makeRng(99);
  for (let i = 0; i < 3; i++) interp.setRttMs(2 * owd + rng() * rttNoise);
  const arrivals = [];
  for (let k = 0; k < (seconds * 1000) / TICK_MS + 40; k++) {
    const T = t0 + k * TICK_MS;
    const late = typeof lateness === 'function' ? lateness(k, rng) : lateness;
    arrivals.push({ at: T + offset + owd + late, T });
  }
  arrivals.sort((a, b) => a.at - b.at);
  const frames = [];
  const STEP = 1000 / 60;
  let ai = 0;
  for (let L = t0 + offset + owd; L < t0 + offset + seconds * 1000; L += STEP) {
    while (ai < arrivals.length && arrivals[ai].at <= L) {
      const a = arrivals[ai++];
      interp.pushState(a.T, a.at, [{ id, x: x(a.T), y: 0, z: 0, vx: 6, alive: true }]);
    }
    const r = interp.renderTime(L);
    if (!Number.isFinite(r)) continue;
    const s = interp.sample(id, r, {});
    frames.push({ L, r, delay: interp.delayMs, s: s && { x: s.x, extrapolated: s.extrapolated } });
  }
  return { interp, frames, STEP };
}

describe('adaptive jitter buffer', () => {
  it('render time never decreases while the delay is raised, lowered and the jitter is wild', () => {
    const { frames } = simulateStream({
      owd: 90,
      seconds: 40,
      lateness: (k, rng) => (k < 300 ? rng() * 10 : k < 600 ? rng() * 120 : rng() * 10) // calm, storm, calm
    });
    let prev = -Infinity;
    for (const f of frames) {
      assert.ok(f.r >= prev, `render time went backwards: ${prev} -> ${f.r}`);
      prev = f.r;
    }
    const delays = frames.map((f) => f.delay);
    assert.ok(Math.max(...delays) - Math.min(...delays) > 40, 'the delay really moved with the jitter');
  });

  it('delay stays inside [MIN, min(MAX, cap - owd)] and starts at INTERP_DELAY_MS', () => {
    assert.equal(new SnapshotInterpolator().delayMs, INTERP_DELAY_MS);
    for (const owd of [10, 60, 120, 250]) {
      const { frames } = simulateStream({ owd, seconds: 20, lateness: (k, rng) => rng() * 150 });
      const hi = Math.max(INTERP_DELAY_MIN_MS, Math.min(INTERP_DELAY_MAX_MS, MAX_LAG_COMP_REWIND_MS - owd));
      // (10 ms slack: the one-way latency the cap is computed from is the clock's applied estimate, not the nominal value)
      for (const f of frames) assert.ok(f.delay >= INTERP_DELAY_MIN_MS - 1e-9 && f.delay <= hi + 10, `owd ${owd}: delay ${f.delay} not in [${INTERP_DELAY_MIN_MS}, ${hi}]`);
    }
    assert.equal(INTERP_DELAY_MIN_MS, 70);
    assert.equal(INTERP_DELAY_MAX_MS, 250);
  });

  it('covers one-way latency + one snapshot interval + jitter: a 60 ms link needs more than the old fixed 100 ms', () => {
    const { frames } = simulateStream({ owd: 60, seconds: 20, lateness: (k, rng) => rng() * 20 });
    const settled = frames.slice(-300).map((f) => f.delay);
    const mean = settled.reduce((a, v) => a + v, 0) / settled.length;
    assert.ok(mean >= 60 + 40 + 10 && mean <= 60 + 40 + 40, `settled delay ${mean}`);
    assert.ok(frames.slice(-300).every((f) => !f.s.extrapolated), 'no starvation once settled');
  });

  it('hysteresis: steady jitter does not make the delay oscillate (no creeping, no ping-pong)', () => {
    const { frames, interp } = simulateStream({ owd: 80, seconds: 60, lateness: (k, rng) => rng() * 24 });
    const tail = frames.filter((f) => f.L - frames[0].L > 15000).map((f) => f.delay);
    assert.ok(Math.max(...tail) - Math.min(...tail) < 12, `delay wobbles by ${Math.max(...tail) - Math.min(...tail)} ms`);
    let reversals = 0;
    for (let i = 2; i < tail.length; i++) {
      const a = tail[i - 1] - tail[i - 2];
      const b = tail[i] - tail[i - 1];
      if (a > 0 && b < 0) reversals++;
    }
    assert.ok(reversals <= 4, `direction reversals: ${reversals}`);
    assert.ok(interp.jitter.shrinks <= 3, `shrinks ${interp.jitter.shrinks}`);
  });

  it('grows quickly but never faster than DELAY_UP_RATE, and shrinks only after a hold and never faster than DELAY_DOWN_RATE', () => {
    const { frames } = simulateStream({
      owd: 50,
      seconds: 60,
      lateness: (k, rng) => (k >= 250 && k < 500 ? 20 + rng() * 150 : rng() * 8) // storm from 10 s to 20 s
    });
    let maxUp = 0;
    let maxDown = 0;
    for (let i = 1; i < frames.length; i++) {
      const slope = (frames[i].delay - frames[i - 1].delay) / (frames[i].L - frames[i - 1].L);
      maxUp = Math.max(maxUp, slope);
      maxDown = Math.min(maxDown, slope);
    }
    assert.ok(maxUp > 0.05 && maxUp <= DELAY_UP_RATE + 1e-6, `max growth ${maxUp}`);
    assert.ok(maxDown < 0 && maxDown >= -DELAY_DOWN_RATE - 1e-6, `max shrink ${maxDown}`);
    const t0 = frames[0].L;
    const peak = Math.max(...frames.map((f) => f.delay));
    const atStormEnd = frames.find((f) => f.L - t0 >= 21000).delay;
    assert.ok(atStormEnd > peak - 15, 'the buffer is NOT dropped right after the storm ends (hold)');
    assert.ok(frames[frames.length - 1].delay < peak - 40, 'but it does come back down later');
  });

  it('JitterBuffer unit: quantile of lateness, median interval, cap shrinks the maximum when the one-way latency rises', () => {
    const jb = new JitterBuffer();
    for (let k = 0; k < 40; k++) {
      jb.observe(1000 + k * 40, k % 20 === 0 ? 100 : 5); // 5 % of snapshots 100 ms late
      jb.retarget(50, k * 40);
    }
    assert.equal(jb.intervalMs, 40);
    assert.ok(jb.jitterMs >= 5 && jb.jitterMs <= 100);
    assert.equal(jb.maxFor(10), INTERP_DELAY_MAX_MS);
    assert.equal(jb.maxFor(300), MAX_LAG_COMP_REWIND_MS - 300);
    assert.equal(jb.maxFor(1000), INTERP_DELAY_MIN_MS);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
describe('starvation: damped extrapolation, critically damped catch-up, no snaps', () => {
  /** An entity running at 8 m/s; snapshots between `stallFrom` and `stallTo` (ms after start) are held back and released at stallTo. */
  function runStall({ stallMs, owd = 40, vx = 8 }) {
    const interp = new SnapshotInterpolator();
    const t0 = 9_000_000;
    const offset = 123_456.25;
    for (let i = 0; i < 3; i++) interp.setRttMs(2 * owd);
    const stallFrom = 6000;
    const stallTo = stallFrom + stallMs;
    const xs = [];
    const STEP = 1000 / 60;
    let nextSnap = 0;
    const queue = [];
    for (let L = t0 + offset; L < t0 + offset + 12000; L += STEP) {
      const el = L - t0 - offset;
      while (nextSnap * TICK_MS + owd <= el) {
        const T = t0 + nextSnap * TICK_MS;
        const arrive = Math.max(nextSnap * TICK_MS + owd, nextSnap * TICK_MS + owd >= stallFrom && nextSnap * TICK_MS + owd < stallTo ? stallTo : 0);
        queue.push({ at: arrive, T, x: (vx * (T - t0)) / 1000 });
        nextSnap++;
      }
      queue.sort((a, b) => a.at - b.at);
      while (queue.length && queue[0].at <= el) {
        const a = queue.shift();
        interp.pushState(a.T, a.at + t0 + offset, [{ id: 'e', x: a.x, y: 0, z: 0, vx, alive: true }]);
      }
      const r = interp.renderTime(L);
      if (!Number.isFinite(r)) continue;
      const s = interp.sample('e', r, {});
      if (s) xs.push({ el, x: s.x, truth: (vx * (r - t0)) / 1000, ex: s.extrapolated });
    }
    return xs;
  }

  it('a 500 ms stall: the entity decelerates, then slides back onto the real path - no step larger than 0.30 m, no backwards motion', () => {
    assert.equal(MAX_EXTRAPOLATION_MS, 250);
    const xs = runStall({ stallMs: 500 });
    let maxStep = 0;
    let minStep = Infinity;
    for (let i = 1; i < xs.length; i++) {
      const d = xs[i].x - xs[i - 1].x;
      maxStep = Math.max(maxStep, d);
      minStep = Math.min(minStep, d);
    }
    assert.ok(maxStep < 0.3, `largest frame step ${maxStep} (nominal ${(8 / 60).toFixed(3)})`);
    assert.ok(minStep > -0.01, `moved backwards by ${minStep}`);
    assert.ok(xs.some((p) => p.ex), 'the stall was really drawn by extrapolation');
    const after = xs.filter((p) => p.el > 8500);
    assert.ok(after.every((p) => Math.abs(p.x - p.truth) < 0.03), 'converged back onto the real path within ~1.5 s of the release');
    const stalled = xs.filter((p) => p.el > 6150 && p.el < 6450);
    const maxErr = Math.max(...stalled.map((p) => Math.abs(p.x - p.truth)));
    assert.ok(maxErr < 3.5, `error while starving ${maxErr} (the entity moved 4 m during the stall)`);
  });

  it('a 1.2 s gap with 9.6 m of displacement (< 12 m) is NOT a teleport: no frame jumps, the entity is caught up smoothly', () => {
    const xs = runStall({ stallMs: 1200 });
    let maxStep = 0;
    for (let i = 1; i < xs.length; i++) maxStep = Math.max(maxStep, xs[i].x - xs[i - 1].x);
    assert.ok(maxStep < 0.36, `largest frame step ${maxStep}`);
  });

  it('a real teleport (> TELEPORT_SNAP_DISTANCE between snapshots) still snaps, without any streak', () => {
    assert.equal(TELEPORT_SNAP_DISTANCE, 12);
    const interp = new SnapshotInterpolator({ interpDelayMs: 100 });
    for (let k = 0; k < 20; k++) {
      const T = 1000 + k * 40;
      interp.pushState(T, T + 50, [{ id: 'e', x: k < 10 ? 0 : 30, y: 0, z: 0, vx: 0, alive: true }]);
    }
    const seen = new Set();
    for (let r = 1000; r <= 1800; r += 5) seen.add(Math.round(interp.sample('e', r, {}).x * 1000) / 1000);
    for (const x of seen) assert.ok(x === 0 || x === 30, `streak position ${x}`);
  });

  it('sampling the same render time twice is idempotent (diagnostics must not disturb the catch-up state)', () => {
    const interp = new SnapshotInterpolator({ interpDelayMs: 100 });
    interp.pushState(1000, 1050, [{ id: 'e', x: 0, y: 0, z: 0, vx: 8, alive: true }]);
    interp.pushState(1040, 1090, [{ id: 'e', x: 0.32, y: 0, z: 0, vx: 8, alive: true }]);
    const a = interp.sample('e', 1200, {});
    const ax = a.x;
    const b = interp.sample('e', 1200, {});
    assert.equal(b.x, ax);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
describe('lag-compensation parity with the adaptive delay (and no way to cheat the rewind)', () => {
  it('the client delay is sanitised: finite, rounded, 0..INTERP_DELAY_MAX_MS; garbage is ignored', () => {
    assert.equal(sanitizeInterpDelayMs(137.6), 138);
    assert.equal(sanitizeInterpDelayMs(-50), 0);
    assert.equal(sanitizeInterpDelayMs(1e9), INTERP_DELAY_MAX_MS);
    for (const bad of [NaN, Infinity, -Infinity, '120', null, undefined, {}, [], true]) assert.equal(sanitizeInterpDelayMs(bad), null);
  });

  it('the accepted delay follows the report at a bounded speed and ignores garbage', () => {
    const p = { id: 'p', rttMs: 40 };
    assert.equal(applyReportedInterpDelay(p, 250, 10_000), INTERP_DELAY_MS, 'first report: no jump');
    const after100ms = applyReportedInterpDelay(p, 250, 10_100);
    assert.ok(Math.abs(after100ms - (INTERP_DELAY_MS + INTERP_REPORT_SLEW_PER_S * 0.1)) < 1e-9, `after 100 ms: ${after100ms}`);
    assert.equal(applyReportedInterpDelay(p, 'abc', 10_200), after100ms, 'garbage keeps the accepted value');
    assert.equal(applyReportedInterpDelay(p, NaN, 10_300), after100ms);
    let v = after100ms;
    for (let t = 10_400; t <= 14_000; t += 100) v = applyReportedInterpDelay(p, 1e9, t);
    assert.equal(v, INTERP_DELAY_MAX_MS, 'a hostile 1e9 settles at the sanitised maximum');
    assert.ok(v <= INTERP_DELAY_MAX_MS);
    // a burst of reports within the same millisecond cannot move it any further
    const frozen = applyReportedInterpDelay(p, 0, 14_000);
    assert.equal(frozen, v);
  });

  it('a cheating client cannot rewind beyond LAG_COMP_MAX_REWIND_MS; only the server-measured RTT and the capped delay count', () => {
    assert.equal(LAG_COMP_MAX_REWIND_MS, MAX_LAG_COMP_REWIND_MS);
    assert.ok(LAG_COMP_HISTORY_MS >= LAG_COMP_MAX_REWIND_MS + TICK_MS + 40, 'history covers the maximum rewind plus a tick and slack');
    const cheater = { id: 'c', rttMs: 20, interpDelayMs: 1e9, pingMs: 5000, latencyMs: 5000 };
    assert.equal(resolveShotRewindMs(cheater, { rewindMs: 9999, interpDelayMs: 9999, d: 9999, rttMs: 9999 }, Date.now()), 20 / 2 + INTERP_DELAY_MAX_MS);
    cheater.rttMs = 2000;
    assert.equal(resolveShotRewindMs(cheater, {}, Date.now()), LAG_COMP_MAX_REWIND_MS);
    // a low-ping cheater claiming the maximum gets less rewind than an honest high-ping player can legitimately have
    assert.ok(10 + INTERP_DELAY_MAX_MS < LAG_COMP_MAX_REWIND_MS);
    // reporting less than the truth only hurts the reporter
    assert.ok(resolveShotRewindMs({ id: 'h', rttMs: 100, interpDelayMs: 0 }) < resolveShotRewindMs({ id: 'h', rttMs: 100 }));
  });

  it('handleInputBatch records `d` (sanitised, slew-limited) and ignores non-numbers; the epoch check does not block it', () => {
    const emitted = [];
    const io = { to: () => ({ emit: (e, p) => emitted.push([e, p]), volatile: { emit: (e, p) => emitted.push([e, p]) } }) };
    const rm = new RoomManager(io);
    rm.stop();
    const { room, player } = rm.addHumanPlayer({ id: 'd1' }, { name: 'd1', roomCode: 'DLY001', mode: 'private', mapId: MAP_ID });
    const now = 50_000;
    rm.handleInputBatch(room, player, { e: player.moveEpoch, cmds: [], d: 200 }, now);
    assert.equal(player.interpDelayMs, INTERP_DELAY_MS, 'first report only seeds the clock');
    rm.handleInputBatch(room, player, { e: player.moveEpoch, cmds: [], d: 200 }, now + 100);
    assert.ok(Math.abs(player.interpDelayMs - (INTERP_DELAY_MS + INTERP_REPORT_SLEW_PER_S * 0.1)) < 1e-9);
    const before = player.interpDelayMs;
    rm.handleInputBatch(room, player, { e: player.moveEpoch, cmds: [], d: 'x' }, now + 200);
    rm.handleInputBatch(room, player, { e: player.moveEpoch - 7, cmds: [], d: 1e9 }, now + 3000); // stale epoch, hostile value
    assert.ok(player.interpDelayMs >= before && player.interpDelayMs <= INTERP_DELAY_MAX_MS);
    rm.handleInputBatch(room, player, { e: player.moveEpoch, cmds: [] }, now + 3100); // old clients send no `d`
    assert.ok(player.interpDelayMs <= INTERP_DELAY_MAX_MS);
  });

  it('a shot is rewound from the moment its command ARRIVED, not from the tick that processes it', () => {
    const io = { to: () => ({ emit() {}, volatile: { emit() {} } }) };
    const rm = new RoomManager(io);
    rm.stop();
    const { room, player: shooter } = rm.addHumanPlayer({ id: 'sh' }, { name: 'sh', roomCode: 'RCV001', mode: 'private', mapId: MAP_ID, weapon: 'rifle' });
    rm.addHumanPlayer({ id: 'tg' }, { name: 'tg', roomCode: 'RCV001', mode: 'private', mapId: MAP_ID });
    shooter.invulnerableUntil = 0;
    const seen = [];
    const original = rm.resolveShot.bind(rm);
    rm.resolveShot = (r, s, shot) => {
      seen.push({ now: shot.now, rewindAt: shot.rewindAt });
      return original(r, s, shot);
    };
    const t0 = 70_000;
    shooter.moveCredit = 1;
    shooter.lastCreditAt = t0;
    const cmd = buildInputCommand(1, { yaw: 0, pitch: 0, isAiming: false, weapon: 'rifle', fire: true, shotSeq: 1 });
    rm.handleInputBatch(room, shooter, { e: shooter.moveEpoch, cmds: [cmd] }, t0);
    rm.processPlayerInputs(room, shooter, t0 + 31); // the next tick picks it up 31 ms later
    assert.equal(seen.length, 1);
    assert.equal(seen[0].now, t0 + 31);
    assert.equal(seen[0].rewindAt, t0, 'rewind reference = arrival time of the command');
  });
});

// ---------------------------------------------------------------------------------------------------------------------
describe('transport and connection robustness', () => {
  it('the first attempt is a pure WebSocket; polling is only the fallback', () => {
    assert.deepEqual([...TRANSPORTS_FIRST], ['websocket']);
    assert.deepEqual([...TRANSPORTS_FALLBACK], ['polling', 'websocket']);
    const a = buildSocketOptions();
    assert.deepEqual(a.transports, ['websocket']);
    assert.equal(a.upgrade, true);
    a.transports.push('polling'); // socket.io-client mutates its copy: must not leak into the next one
    assert.deepEqual(buildSocketOptions().transports, ['websocket']);
  });

  function fakeSocket() {
    const handlers = new Map();
    return {
      io: { opts: { transports: ['websocket'] } },
      on(ev, fn) { if (!handlers.has(ev)) handlers.set(ev, []); handlers.get(ev).push(fn); },
      fire(ev, ...args) { for (const fn of handlers.get(ev) || []) fn(...args); }
    };
  }

  it('falls back to polling+upgrade after the first failed connection, but never once connected (no flapping)', () => {
    const s1 = fakeSocket();
    const st1 = installTransportFallback(s1);
    s1.fire('connect_error', new Error('websocket error'));
    assert.deepEqual(s1.io.opts.transports, ['polling', 'websocket']);
    assert.equal(st1.fellBack, true);

    const s2 = fakeSocket();
    const st2 = installTransportFallback(s2);
    s2.fire('connect');
    s2.fire('connect_error', new Error('later blip'));
    assert.deepEqual(s2.io.opts.transports, ['websocket'], 'a connected client stays on WebSocket');
    assert.equal(st2.fellBack, false);
  });

  it('re-joins the room by itself after a reconnect in the middle of a match (was: silent, opponents frozen)', () => {
    const s = fakeSocket();
    const log = [];
    let inMatch = false;
    const st = installRejoinOnReconnect(s, {
      isInMatch: () => inMatch,
      onLost: () => log.push('lost'),
      rejoin: () => log.push('rejoin'),
      onReconnected: () => log.push('back')
    });
    s.fire('disconnect');            // lobby: nothing to recover
    s.fire('connect');
    assert.deepEqual(log, []);
    inMatch = true;
    s.fire('disconnect');
    s.fire('connect');
    assert.deepEqual(log, ['lost', 'rejoin', 'back']);
    s.fire('connect');               // a second connect event without a loss in between does nothing
    assert.equal(st.rejoins, 1);
  });

  it('Socket.IO heartbeat stays tolerant of Wi-Fi gaps (10 s ping interval + 8 s timeout)', async () => {
    const fs = await import('node:fs');
    const src = fs.readFileSync(path.join(ROOT_DIR, 'server', 'index.js'), 'utf8');
    assert.match(src, /PING_INTERVAL_MS = 10000/);
    assert.match(src, /PING_TIMEOUT_MS = 8000/);
    assert.match(src, /perMessageDeflate: false/);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
describe('"model in one place, opponent somewhere else": root causes', () => {
  async function makeGame() {
    const game = await createTestGame3D();
    game.localId = 'me';
    game.inMatch = false;
    return game;
  }
  const player = (id, over = {}) => ({
    id, name: id.toUpperCase(), color: 0x38bdf8, x: 5, y: 0, z: 5, vx: 0, vy: 0, vz: 0, yaw: 0, pitch: 0, lean: 0,
    crouching: false, prone: false, weapon: 'rifle', hp: 100, alive: true, ...over
  });

  it('an old / duplicate stateUpdate envelope changes nothing (alive, hp and weapon used to flip back to stale values)', async () => {
    const game = await makeGame();
    game.setNetworkRtt(80);
    game.syncPlayersState([player('me'), player('a')], 1000, 0);
    game.syncPlayersState([player('me'), player('a', { weapon: 'smg', hp: 60 })], 1040, 40);
    const rp = game.remotePlayers.get('a');
    assert.equal(rp.currentWeapon, 'smg');
    assert.equal(rp.hp, 60);
    game.syncPlayersState([player('me'), player('a', { weapon: 'rifle', hp: 100, alive: false })], 1000, 80); // late, reordered
    assert.equal(rp.currentWeapon, 'smg');
    assert.equal(rp.hp, 60);
    assert.equal(rp.alive, true);
    game.syncPlayersState([player('me'), player('a', { weapon: 'rifle', hp: 100 })], 1040, 90); // duplicate
    assert.equal(rp.hp, 60);
  });

  it('a killed player stays shootable-off at once but is drawn until the interpolated timeline reaches its death', async () => {
    const game = await makeGame();
    const OFFSET = 424242.125;
    const ONE_WAY = 40;
    const T0 = 3_000_000;
    game.setNetworkRtt(2 * ONE_WAY);
    game.setNetworkRtt(2 * ONE_WAY);
    const STEP = 1000 / 60;
    let nextTick = T0;
    let L = T0 + OFFSET;
    const deathServerT = T0 + 3000;
    const frame = () => {
      while (nextTick + ONE_WAY + OFFSET <= L) {
        const dead = nextTick >= deathServerT;
        game.syncPlayersState(
          [player('me'), player('a', { x: 5 + (nextTick - T0) / 1000, alive: !dead, hp: dead ? 0 : 100 })],
          nextTick,
          nextTick + ONE_WAY + OFFSET
        );
        nextTick += TICK_MS;
      }
      game.updateRemotePlayers(STEP / 1000, L);
      L += STEP;
    };
    // the kill event (reliable) is emitted right before the tick's stateUpdate that first carries alive:false: it arrives with it
    const deathLocal = deathServerT + ONE_WAY + OFFSET;
    while (L < deathLocal - 1) frame();
    const rp = game.remotePlayers.get('a');
    assert.equal(rp.alive, true);
    game.markRemoteDead('a', L);
    assert.equal(rp.alive, false);
    assert.equal(game.hitboxMeshes.some((m) => m.userData.playerId === 'a'), false, 'hitboxes are gone at once (server rules)');
    assert.equal(rp.group.visible, true, 'the body is still drawn right after the kill event');
    frame();
    const delay = game.snapshots.delayMs;
    let hiddenLocal = null;
    for (let i = 0; i < 120 && hiddenLocal === null; i++) {
      frame();
      if (!rp.group.visible) hiddenLocal = L;
    }
    assert.ok(hiddenLocal !== null, 'it is hidden eventually');
    // hidden when render time (= true server time - delay) reaches the death stamp: `delay - one-way` after the snapshot arrived
    const shownFor = hiddenLocal - deathLocal;
    assert.ok(Math.abs(shownFor - (delay - ONE_WAY)) < 60, `body stayed ${shownFor} ms after the kill event (expected ~${delay - ONE_WAY})`);
    assert.ok(shownFor > 30, 'it did NOT vanish at the kill event');
    // it vanished at the place where the interpolated body is (the death spot), not before reaching it
    assert.ok(Math.abs(rp.group.position.x - (5 + 3)) < 0.5, `last drawn at x=${rp.group.position.x}`);
  });

  it('a respawned player is drawn at the spawn point at once and never streaks from the death spot', async () => {
    const game = await makeGame();
    game.setNetworkRtt(80);
    const OFF = 1000.5;
    game.syncPlayersState([player('me'), player('a', { x: 10, alive: false, hp: 0 })], 5000, OFF + 5040);
    game.syncPlayersState([player('me'), player('a', { x: 10, alive: false, hp: 0 })], 5040, OFF + 5080);
    game.resetRemoteInterpolation('a', -40, 0, 30, 0);
    game.remotePlayers.get('a').alive = true;
    game.syncPlayersState([player('me'), player('a', { x: -40, z: 30 })], 5080, OFF + 5120);
    const rp = game.remotePlayers.get('a');
    assert.equal(rp.group.visible, true);
    for (let L = OFF + 5120; L < OFF + 5600; L += 16) {
      game.updateRemotePlayers(0.016, L);
      assert.ok(Math.abs(rp.group.position.x + 40) < 0.5, `streak: x=${rp.group.position.x}`);
    }
  });

  it('RULED OUT: hitbox proxies follow the drawn (interpolated) rig, not a stale pose', async () => {
    const game = await makeGame();
    game.setNetworkRtt(60);
    const OFF = 9.5;
    for (let k = 0; k < 40; k++) {
      game.syncPlayersState([player('me'), player('a', { x: k * 0.3, vx: 7.5 })], 1000 + k * 40, OFF + 1000 + k * 40 + 30);
    }
    for (let L = OFF + 2000; L < OFF + 2400; L += 16.7) game.updateRemotePlayers(0.0167, L);
    const rp = game.remotePlayers.get('a');
    rp.group.updateMatrixWorld(true);
    const parts = game.hitboxMeshes.filter((m) => m.userData.playerId === 'a');
    assert.ok(parts.length >= 5);
    for (const part of parts) {
      const wp = part.getWorldPosition(new (rp.group.position.constructor)());
      assert.ok(Math.hypot(wp.x - rp.group.position.x, wp.z - rp.group.position.z) < 0.8);
    }
  });

  it('no floating name / health bar: no sprite in the rig, no label state, names still in the player data', async () => {
    const game = await makeGame();
    game.syncPlayersState([player('me'), player('a')]);
    const rp = game.remotePlayers.get('a');
    let sprites = 0;
    rp.group.traverse((o) => { if (o.isSprite) sprites++; });
    assert.equal(sprites, 0);
    assert.equal(rp.labelInfo, undefined);
    assert.equal(rp.name, 'A', 'the name stays on the player object for the scoreboard / kill feed');
    assert.equal(typeof game.createPlayerNameSprite, 'undefined');
  });
});

// ---------------------------------------------------------------------------------------------------------------------
describe('server health metrics', () => {
  it('RollingStats: percentile / max over a ring buffer', () => {
    const s = new RollingStats(10);
    for (let i = 1; i <= 25; i++) s.push(i);
    assert.equal(s.count, 10);
    assert.equal(s.max(), 25);
    assert.equal(s.maxEver, 25);
    assert.ok(s.percentile(0.5) >= 20 && s.percentile(0.5) <= 22);
    assert.equal(new RollingStats(4).percentile(0.95), 0);
  });

  it('getNetStats() exposes counts and timings only (no ids, names or positions)', () => {
    const io = { to: () => ({ emit() {}, volatile: { emit() {} } }) };
    const rm = new RoomManager(io);
    rm.stop();
    rm.addHumanPlayer({ id: 'secret-socket-id-123' }, { name: 'SecretName', roomCode: 'NST001', mode: 'private', mapId: MAP_ID });
    for (let i = 0; i < 60; i++) rm.tick();
    rm.netStats.recordTick(0.4, 0.2);
    const stats = rm.getNetStats();
    const text = JSON.stringify(stats);
    assert.ok(!text.includes('secret-socket-id-123') && !text.includes('SecretName') && !text.includes('NST001'));
    assert.equal(stats.players, 1);
    assert.equal(stats.rooms, 1);
    assert.equal(stats.tickIntervalMs, 40);
    assert.ok(stats.snapshotBytes.samples >= 1, 'a snapshot size sample is taken about once per second per room');
    assert.ok(stats.snapshotBytesPerSecPerClient > 0);
    assert.ok(new ServerNetStats().report({}).tickDurationMs.samples === 0);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
function getFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.once('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

function connectClient(port) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/socket.io/?EIO=4&transport=websocket`);
    const log = [];
    const waiters = [];
    ws.on('message', (raw) => {
      const text = String(raw);
      if (text.startsWith('0{')) ws.send('40');
      else if (text === '2') ws.send('3');
      else if (text.startsWith('40')) {
        resolve({
          log,
          emit: (event, payload) => ws.send(`42${JSON.stringify([event, payload])}`),
          waitFor: (event, timeoutMs = 3000) => new Promise((res, rej) => {
            const found = log.find((m) => m.event === event && !m.taken);
            if (found) { found.taken = true; res(found.payload); return; }
            const timer = setTimeout(() => rej(new Error(`timeout waiting for ${event}`)), timeoutMs);
            waiters.push({ event, res: (p) => { clearTimeout(timer); res(p); } });
          }),
          close: () => ws.close()
        });
      } else if (text.startsWith('42')) {
        const m = /^42(\d*)(\[.*)$/s.exec(text);
        const [event, payload] = JSON.parse(m[2]);
        if (m[1] !== '' && event === 'latencyProbe') ws.send(`43${m[1]}${JSON.stringify([payload])}`);
        const entry = { event, payload, taken: false, at: performance.now() };
        log.push(entry);
        const w = waiters.findIndex((x) => x.event === event);
        if (w >= 0) { entry.taken = true; waiters.splice(w, 1)[0].res(payload); }
      }
    });
    ws.on('error', reject);
  });
}

describe('live server: /api/netstats and a hostile interpolation-delay report', () => {
  let child;
  let port;
  let exited = false;

  before(async () => {
    port = await getFreePort();
    child = spawn(process.execPath, ['server/index.js'], { cwd: ROOT_DIR, env: { ...process.env, PORT: String(port) }, stdio: ['ignore', 'pipe', 'pipe'] });
    child.on('exit', () => { exited = true; });
    child.stdout.resume();
    child.stderr.resume();
    const deadline = Date.now() + 15_000;
    for (;;) {
      try {
        if ((await fetch(`http://127.0.0.1:${port}/healthz`)).ok) break;
      } catch { /* not up yet */ }
      if (exited || Date.now() > deadline) throw new Error('server did not start');
      await new Promise((r) => setTimeout(r, 100));
    }
  });

  after(() => {
    if (child && !exited) child.kill();
  });

  it('streams stateUpdate at ~25 Hz with strictly increasing t, survives hostile `d` values and reports tick health', async () => {
    const a = await connectClient(port);
    const b = await connectClient(port);
    try {
      a.emit('joinRoom', { name: 'NetA', mode: 'private', mapId: MAP_ID });
      const joined = await a.waitFor('roomJoined');
      b.emit('joinRoom', { name: 'NetB', roomCode: joined.roomCode, mode: 'private', mapId: MAP_ID });
      await b.waitFor('roomJoined');
      for (const d of [1e9, -5, 'evil', null, 250, NaN]) {
        a.emit('inputBatch', { e: joined.player.moveEpoch, cmds: [], d });
        await new Promise((r) => setTimeout(r, 30));
      }
      await new Promise((r) => setTimeout(r, 1800));
      const states = a.log.filter((m) => m.event === 'stateUpdate');
      assert.ok(states.length >= 35, `received ${states.length} stateUpdates in ~2 s`);
      for (let i = 1; i < states.length; i++) assert.ok(states[i].payload.t > states[i - 1].payload.t, 't strictly increases');
      const gaps = [];
      for (let i = 1; i < states.length; i++) gaps.push(states[i].at - states[i - 1].at);
      gaps.sort((x, y) => x - y);
      assert.ok(gaps[Math.floor(gaps.length * 0.5)] < 55, `median spacing ${gaps[Math.floor(gaps.length * 0.5)]} ms`);

      const stats = await (await fetch(`http://127.0.0.1:${port}/api/netstats`)).json();
      assert.equal(stats.tickIntervalMs, 40);
      assert.ok(stats.players >= 2 && stats.rooms >= 1);
      assert.ok(stats.tickDurationMs.samples > 20 && stats.tickDurationMs.p95 < 20, `tick p95 ${stats.tickDurationMs.p95} ms`);
      assert.ok(stats.snapshotBytes.samples >= 1 && stats.snapshotBytesPerSecPerClient > 1000);
      assert.ok(!JSON.stringify(stats).includes(joined.playerId) && !JSON.stringify(stats).includes('NetA'));
    } finally {
      a.close();
      b.close();
    }
  });
});
