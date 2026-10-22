/**
 * Deterministic movement / physics module tests (shared/movement.js + shared/physics.js collision primitives)
 * and the drift-corrected server tick scheduler.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { MATCH_CONFIG, getMapConfig } from '../shared/constants.js';
import {
  FIXED_DT,
  PLAYER_STEP_UP,
  createMovementState,
  stepPlayerMovement
} from '../shared/movement.js';
import {
  GRENADE_FLOOR_Y,
  GRENADE_RADIUS,
  collideCapsuleVsBoxes,
  findGroundY,
  isPointInsideInflatedBoxes,
  stepGrenade
} from '../shared/physics.js';
import { RoomManager } from '../server/roomManager.js';

const FLAT_MAP = { obstacles: [], arenaHalfSize: 60 };

function makeInput(over = {}) {
  return {
    moveForward: 0,
    moveRight: 0,
    yaw: 0,
    wantsCrouch: false,
    wantsSprint: false,
    wantsJump: false,
    inputEnabled: true,
    isAiming: false,
    isAdsHeld: false,
    weaponMoveMult: 1,
    ...over
  };
}

/** Runs N fixed steps with a constant input and returns the state; nowMs advances by exactly FIXED_DT per step. */
function runSteps(state, input, steps, mapCfg, startMs = 1000) {
  let nowMs = startMs;
  const events = [];
  for (let i = 0; i < steps; i++) {
    nowMs += FIXED_DT * 1000;
    events.push(stepPlayerMovement(state, input, FIXED_DT, mapCfg, nowMs));
  }
  return { state, events, nowMs };
}

/**
 * Accumulator harness identical in structure to Game3D.advanceFixedPhysics: real frame time is accumulated
 * (clamped to 0.1 s, max 6 steps per frame) and consumed in whole FIXED_DT steps. Input is sampled once per frame.
 */
function simulateFrames(fps, seconds, inputAt, mapCfg, init = { y: 0, onGround: true }) {
  const state = createMovementState(init);
  const frames = Math.round(seconds * fps);
  const traj = [];
  let acc = 0;
  let nowMs = 1000;
  for (let f = 0; f < frames; f++) {
    const input = inputAt(f / fps);
    acc += Math.min(0.1, 1 / fps);
    let steps = 0;
    while (acc >= FIXED_DT - 1e-9 && steps < 6) {
      acc -= FIXED_DT;
      steps++;
      nowMs += FIXED_DT * 1000;
      stepPlayerMovement(state, input, FIXED_DT, mapCfg, nowMs);
      traj.push({ x: state.x, y: state.y, z: state.z, vx: state.vx, vz: state.vz });
    }
  }
  return { state, traj };
}

describe('shared/movement.js - fixed timestep & determinism', () => {
  it('exposes FIXED_DT = 1/60 and a clean initial state', () => {
    assert.equal(FIXED_DT, 1 / 60);
    const s = createMovementState();
    assert.equal(s.onGround, false);
    assert.equal(s.isSliding, false);
    assert.equal(s.stepOffsetY, 0);
  });

  it('is deterministic: identical inputs produce bit-identical states', () => {
    const mapCfg = getMapConfig('cyber_citadel');
    const run = () => {
      const s = createMovementState({ x: 0, y: 0, z: 10, onGround: true });
      let seed = 12345;
      const rnd = () => {
        seed = (seed * 1664525 + 1013904223) >>> 0;
        return seed / 0x100000000;
      };
      let nowMs = 5000;
      const log = [];
      for (let i = 0; i < 900; i++) {
        nowMs += FIXED_DT * 1000;
        const input = makeInput({
          moveForward: rnd() < 0.7 ? 1 : rnd() < 0.5 ? -1 : 0,
          moveRight: rnd() < 0.3 ? 1 : rnd() < 0.3 ? -1 : 0,
          yaw: (i / 60) * 0.9,
          wantsCrouch: rnd() < 0.1,
          wantsSprint: rnd() < 0.5,
          wantsJump: rnd() < 0.05
        });
        const res = stepPlayerMovement(s, input, FIXED_DT, mapCfg, nowMs);
        log.push(JSON.stringify([s, res]));
      }
      return log;
    };
    assert.deepEqual(run(), run());
  });

  it('does not read any wall clock: results depend only on nowMs', () => {
    const realNow = Date.now;
    const realPerf = performance.now;
    let reads = 0;
    Date.now = () => { reads++; return realNow(); };
    performance.now = () => { reads++; return realPerf.call(performance); };
    try {
      const s = createMovementState({ y: 0, onGround: true });
      runSteps(s, makeInput({ moveForward: 1, wantsJump: true }), 120, FLAT_MAP);
    } finally {
      Date.now = realNow;
      performance.now = realPerf;
    }
    assert.equal(reads, 0, 'stepPlayerMovement must never call Date.now()/performance.now()');
  });

  it('is frame-rate independent through an accumulator (30 / 60 / 144 fps: hold W, jump at 1s, crouch-slide at 2s)', () => {
    const inputAt = (t) => makeInput({
      moveForward: 1,
      wantsJump: t >= 1.0 - 1e-9 && t < 1.1 - 1e-9,
      wantsCrouch: t >= 2.0 - 1e-9
    });
    const runs = [30, 60, 144].map((fps) => simulateFrames(fps, 3, inputAt, FLAT_MAP));

    for (const r of runs) {
      assert.ok(r.traj.length >= 179 && r.traj.length <= 181, `expected ~180 fixed steps, got ${r.traj.length}`);
    }
    // Compare the pose after exactly the same number of fixed steps (the trajectory index)
    const idx = Math.min(...runs.map((r) => r.traj.length)) - 1;
    const ref = runs[1].traj[idx];
    for (const r of runs) {
      const p = r.traj[idx];
      assert.ok(Math.abs(p.z - ref.z) < 0.3, `z differs: ${p.z} vs ${ref.z}`);
      assert.ok(Math.abs(p.x - ref.x) < 1e-9, `x must stay 0: ${p.x}`);
      assert.ok(Math.abs(p.y - ref.y) < 0.05, `y differs: ${p.y} vs ${ref.y}`);
    }
    // The player must really have travelled, jumped and slid
    assert.ok(ref.z < -12, `expected >12m of forward travel in 3s, got ${ref.z}`);
    assert.ok(runs[1].traj.some((p) => p.y > 1.0), 'player should have jumped');
    // Frame times that are exact multiples of FIXED_DT (60 fps) vs half-rate (30 fps) land on identical step indices
    const a = runs[0].traj[idx];
    const b = runs[1].traj[idx];
    assert.ok(Math.abs(a.z - b.z) < 1e-6 && Math.abs(a.y - b.y) < 1e-6, '30fps and 60fps must match exactly');
  });

  it('client-style (copy in/out each step) and server-style (plain state) usage produce identical results', () => {
    const mapCfg = getMapConfig('cargo_dock');
    const script = (i) => makeInput({
      moveForward: 1,
      moveRight: i % 90 < 30 ? 1 : 0,
      yaw: Math.sin(i / 50),
      wantsSprint: i % 200 < 120,
      wantsJump: i % 77 === 0,
      wantsCrouch: i % 250 > 200
    });

    // "Server" usage: one plain movement state driven directly
    const serverState = createMovementState({ x: 5, y: 0, z: 5, onGround: true });
    // "Client" usage: authoritative fields live in a Game3D-like object and are synced in/out every step
    const game = {
      position: { x: 5, y: 0, z: 5 },
      velocity: { x: 0, y: 0, z: 0 },
      onGround: true, wasOnGround: false, lastGroundedAt: -Infinity, jumpQueuedUntil: 0,
      isSliding: false, slideUntil: 0, slideCooldownUntil: 0, slideDir: { x: 0, z: 0 },
      crouching: false, prone: false, isSprinting: false, stepOffsetY: 0
    };
    const ms = createMovementState();

    let nowMs = 2000;
    for (let i = 0; i < 1200; i++) {
      nowMs += FIXED_DT * 1000;
      const input = script(i);
      stepPlayerMovement(serverState, input, FIXED_DT, mapCfg, nowMs);

      ms.x = game.position.x; ms.y = game.position.y; ms.z = game.position.z;
      ms.vx = game.velocity.x; ms.vy = game.velocity.y; ms.vz = game.velocity.z;
      ms.onGround = game.onGround; ms.wasOnGround = game.wasOnGround;
      ms.lastGroundedAt = game.lastGroundedAt; ms.jumpQueuedUntil = game.jumpQueuedUntil;
      ms.isSliding = game.isSliding; ms.slideUntil = game.slideUntil; ms.slideCooldownUntil = game.slideCooldownUntil;
      ms.slideDirX = game.slideDir.x; ms.slideDirZ = game.slideDir.z;
      ms.crouching = game.crouching; ms.prone = game.prone; ms.isSprinting = game.isSprinting;
      ms.stepOffsetY = game.stepOffsetY;
      stepPlayerMovement(ms, input, FIXED_DT, mapCfg, nowMs);
      game.position = { x: ms.x, y: ms.y, z: ms.z };
      game.velocity = { x: ms.vx, y: ms.vy, z: ms.vz };
      game.onGround = ms.onGround; game.wasOnGround = ms.wasOnGround;
      game.lastGroundedAt = ms.lastGroundedAt; game.jumpQueuedUntil = ms.jumpQueuedUntil;
      game.isSliding = ms.isSliding; game.slideUntil = ms.slideUntil; game.slideCooldownUntil = ms.slideCooldownUntil;
      game.slideDir = { x: ms.slideDirX, z: ms.slideDirZ };
      game.crouching = ms.crouching; game.prone = ms.prone; game.isSprinting = ms.isSprinting;
      game.stepOffsetY = ms.stepOffsetY;

      assert.equal(game.position.x, serverState.x);
      assert.equal(game.position.y, serverState.y);
      assert.equal(game.position.z, serverState.z);
      assert.equal(game.velocity.x, serverState.vx);
      assert.equal(game.velocity.z, serverState.vz);
    }
  });
});

describe('shared/movement.js - ground, air, jump and slide behaviour', () => {
  it('accelerates to walk speed on the ground and sprints faster (weapon multiplier applies)', () => {
    const walk = runSteps(createMovementState({ y: 0, onGround: true }), makeInput({ moveForward: 1 }), 60, FLAT_MAP).state;
    assert.ok(Math.abs(Math.hypot(walk.vx, walk.vz) - MATCH_CONFIG.WALK_SPEED) < 1e-6);

    const sprint = runSteps(createMovementState({ y: 0, onGround: true }), makeInput({ moveForward: 1, wantsSprint: true }), 60, FLAT_MAP).state;
    assert.ok(Math.abs(Math.hypot(sprint.vx, sprint.vz) - MATCH_CONFIG.SPRINT_SPEED) < 1e-6);
    assert.equal(sprint.isSprinting, true);

    const heavy = runSteps(createMovementState({ y: 0, onGround: true }), makeInput({ moveForward: 1, weaponMoveMult: 0.8 }), 60, FLAT_MAP).state;
    assert.ok(Math.abs(Math.hypot(heavy.vx, heavy.vz) - MATCH_CONFIG.WALK_SPEED * 0.8) < 1e-6);
  });

  it('applies ground friction to a stopped player and clamps tiny speeds to zero', () => {
    const s = createMovementState({ y: 0, onGround: true, vx: 5 });
    runSteps(s, makeInput(), 120, FLAT_MAP);
    assert.equal(s.vx, 0);
    assert.equal(s.vz, 0);
  });

  it('counter-strafing decelerates faster than plain friction', () => {
    const counter = createMovementState({ y: 0, onGround: true, vz: -6 });
    runSteps(counter, makeInput({ moveForward: -1 }), 3, FLAT_MAP);
    const coast = createMovementState({ y: 0, onGround: true, vz: -6 });
    runSteps(coast, makeInput(), 3, FLAT_MAP);
    assert.ok(Math.abs(counter.vz) < Math.abs(coast.vz));
  });

  it('jump height matches the analytic v^2/2g within tolerance and the player lands back on the ground', () => {
    const s = createMovementState({ y: 0, onGround: true });
    let nowMs = 1000;
    let maxY = 0;
    let jumped = 0;
    let landed = null;
    for (let i = 0; i < 120; i++) {
      nowMs += FIXED_DT * 1000;
      const res = stepPlayerMovement(s, makeInput({ wantsJump: i === 0 }), FIXED_DT, FLAT_MAP, nowMs);
      if (res.jumped) jumped++;
      if (res.landed) landed = res;
      maxY = Math.max(maxY, s.y);
    }
    const analytic = (MATCH_CONFIG.JUMP_FORCE ** 2) / (2 * MATCH_CONFIG.GRAVITY);
    assert.equal(jumped, 1);
    assert.ok(Math.abs(maxY - analytic) < 0.1, `jump apex ${maxY} vs analytic ${analytic}`);
    assert.equal(s.onGround, true);
    assert.equal(s.y, 0);
    assert.ok(landed && landed.landed && landed.impact > 0.5, 'landing event with an impact value');
  });

  it('supports coyote time and jump buffering', () => {
    // Buffered: press jump 3 steps before touching the ground
    const buf = createMovementState({ y: 0.3, vy: -6, onGround: false });
    let nowMs = 1000;
    let jumpedAt = -1;
    for (let i = 0; i < 20; i++) {
      nowMs += FIXED_DT * 1000;
      const r = stepPlayerMovement(buf, makeInput({ wantsJump: i === 0 }), FIXED_DT, FLAT_MAP, nowMs);
      if (r.jumped && jumpedAt < 0) jumpedAt = i;
    }
    assert.ok(jumpedAt > 0, 'buffered jump should fire after landing');

    // Coyote: walk off... simulate by marking grounded recently then pressing jump while airborne
    const coy = createMovementState({ y: 2, vy: 0, onGround: false, lastGroundedAt: 1000 - 60 });
    const r = stepPlayerMovement(coy, makeInput({ wantsJump: true }), FIXED_DT, FLAT_MAP, 1000);
    assert.equal(r.jumped, true, 'jump within the coyote window');
    const late = createMovementState({ y: 2, vy: 0, onGround: false, lastGroundedAt: 1000 - 400 });
    const r2 = stepPlayerMovement(late, makeInput({ wantsJump: true }), FIXED_DT, FLAT_MAP, 1000);
    assert.equal(r2.jumped, false, 'no jump after the coyote window');
  });

  it('slide: starts above the minimum speed, bursts to SLIDE_INITIAL_SPEED, decays by SLIDE_FRICTION and ends', () => {
    const s = createMovementState({ y: 0, onGround: true, vz: -8.0 });
    let nowMs = 1000;
    const speeds = [];
    let startedAt = -1;
    for (let i = 0; i < 60; i++) {
      nowMs += FIXED_DT * 1000;
      const r = stepPlayerMovement(s, makeInput({ wantsCrouch: true }), FIXED_DT, FLAT_MAP, nowMs);
      if (r.slideStarted) startedAt = i;
      speeds.push({ sliding: s.isSliding, speed: Math.hypot(s.vx, s.vz) });
    }
    assert.equal(startedAt, 0);
    // First sliding step: burst then one friction application
    const k = 1 - MATCH_CONFIG.SLIDE_FRICTION * FIXED_DT;
    assert.ok(Math.abs(speeds[0].speed - MATCH_CONFIG.SLIDE_INITIAL_SPEED * k) < 1e-9);
    for (let i = 1; i < 20; i++) {
      assert.ok(speeds[i].sliding);
      assert.ok(Math.abs(speeds[i].speed - MATCH_CONFIG.SLIDE_INITIAL_SPEED * k ** (i + 1)) < 1e-9, `step ${i}`);
      assert.ok(speeds[i].speed < speeds[i - 1].speed, 'slide speed must strictly decay');
    }
    // Slide lasts SLIDE_DURATION_MS (660ms = 40 steps) then falls back to crouching
    assert.equal(speeds[30].sliding, true);
    assert.equal(speeds[45].sliding, false);
    assert.equal(s.crouching, true);
  });

  it('slide needs SLIDE_MIN_SPEED and respects the cooldown', () => {
    const slow = createMovementState({ y: 0, onGround: true, vz: -2 });
    const r = runSteps(slow, makeInput({ wantsCrouch: true }), 2, FLAT_MAP);
    assert.equal(r.events.some((e) => e.slideStarted), false);

    const s = createMovementState({ y: 0, onGround: true, vz: -8 });
    let nowMs = 1000;
    let starts = 0;
    for (let i = 0; i < 70; i++) {
      nowMs += FIXED_DT * 1000;
      // Re-press crouch every 10 steps and keep the speed up so only the cooldown can gate the slide
      const press = i % 20 < 10;
      if (!press) s.crouching = false;
      s.vz = Math.min(s.vz, -8);
      if (stepPlayerMovement(s, makeInput({ wantsCrouch: press }), FIXED_DT, FLAT_MAP, nowMs).slideStarted) starts++;
    }
    assert.ok(starts >= 1 && starts <= 3, `cooldown should limit slides, got ${starts}`);
  });

  it('jumping out of a slide keeps momentum (x1.04) and clears the slide', () => {
    const s = createMovementState({ y: 0, onGround: true, vz: -8 });
    let nowMs = 1000;
    for (let i = 0; i < 5; i++) {
      nowMs += FIXED_DT * 1000;
      stepPlayerMovement(s, makeInput({ wantsCrouch: true }), FIXED_DT, FLAT_MAP, nowMs);
    }
    assert.equal(s.isSliding, true);
    nowMs += FIXED_DT * 1000;
    const r = stepPlayerMovement(s, makeInput({ wantsCrouch: true, wantsJump: true }), FIXED_DT, FLAT_MAP, nowMs);
    assert.equal(r.jumped, true);
    assert.equal(s.isSliding, false);
    assert.equal(s.onGround, false);
    assert.ok(s.vy > 7);
  });

  it('supports omnidirectional sprint, Neon directional whip-slide into wishDir, and instant slide-cancel', () => {
    // 1. Omnidirectional sprint (sideways strafe sprint reaches SPRINT_SPEED)
    const strafeSprint = runSteps(
      createMovementState({ y: 0, onGround: true }),
      makeInput({ moveRight: 1, wantsSprint: true }),
      60,
      FLAT_MAP
    ).state;
    assert.equal(strafeSprint.isSprinting, true);
    assert.ok(Math.abs(Math.hypot(strafeSprint.vx, strafeSprint.vz) - MATCH_CONFIG.SPRINT_SPEED) < 1e-6);

    // 2. Directional whip-slide: running forward (-Z) then pressing crouch + right (+X) whips slide into +X
    const whip = createMovementState({ y: 0, onGround: true, vz: -8.5 });
    let nowMs = 1000;
    nowMs += FIXED_DT * 1000;
    const r = stepPlayerMovement(
      whip,
      makeInput({ moveRight: 1, wantsCrouch: true, yaw: 0 }),
      FIXED_DT,
      FLAT_MAP,
      nowMs
    );
    assert.equal(r.slideStarted, true);
    assert.equal(whip.isSliding, true);
    assert.ok(whip.vx > 9.0, `expected sideways whip-slide burst on +X, got vx=${whip.vx}`);
    assert.ok(Math.abs(whip.vz) < 1e-6, `expected forward velocity redirected into wishDir, got vz=${whip.vz}`);

    // 3. Mid-slide cancel when wantsCrouch is released after initial knee-drop (~167ms into 680ms slide)
    for (let i = 0; i < 10; i++) {
      nowMs += FIXED_DT * 1000;
      stepPlayerMovement(whip, makeInput({ moveRight: 1, wantsCrouch: true, yaw: 0 }), FIXED_DT, FLAT_MAP, nowMs);
    }
    assert.equal(whip.isSliding, true);
    nowMs += FIXED_DT * 1000;
    stepPlayerMovement(whip, makeInput({ moveForward: 1, wantsSprint: true, wantsCrouch: false }), FIXED_DT, FLAT_MAP, nowMs);
    assert.equal(whip.isSliding, false);
    assert.equal(whip.crouching, false);
  });

  it('ADS toggle is cancelled by sprinting and reported through aimCancelled', () => {
    const s = createMovementState({ y: 0, onGround: true });
    const r = stepPlayerMovement(s, makeInput({ moveForward: 1, wantsSprint: true, isAiming: true, isAdsHeld: false }), FIXED_DT, FLAT_MAP, 1000);
    assert.equal(r.aimCancelled, true);
    assert.equal(s.isSprinting, true);
    const held = createMovementState({ y: 0, onGround: true });
    const r2 = stepPlayerMovement(held, makeInput({ moveForward: 1, wantsSprint: true, isAiming: true, isAdsHeld: true }), FIXED_DT, FLAT_MAP, 1000);
    assert.equal(r2.aimCancelled, false);
    assert.equal(held.isSprinting, false);
  });

  it('clamps the player inside the arena', () => {
    const s = createMovementState({ x: 0, y: 0, z: 0, onGround: true });
    runSteps(s, makeInput({ moveForward: 1, wantsSprint: true }), 60 * 15, { obstacles: [], arenaHalfSize: 20 });
    assert.ok(s.z >= -(20 - 0.6) - 1e-9);
    assert.ok(Math.abs(s.z + 19.4) < 1e-6);
  });
});

describe('shared/movement.js - collision against map obstacles', () => {
  const wall = { minX: -10, maxX: 10, minY: 0, maxY: 4, minZ: -5, maxZ: -4 };

  it('cannot walk through a wall (stops one player radius away)', () => {
    const s = createMovementState({ x: 0, y: 0, z: 0, onGround: true });
    runSteps(s, makeInput({ moveForward: 1, wantsSprint: true }), 60 * 4, { obstacles: [wall], arenaHalfSize: 60 });
    assert.ok(s.z >= -4 + MATCH_CONFIG.PLAYER_RADIUS - 1e-6, `z=${s.z} penetrated the wall`);
    assert.ok(s.z < -3.4, 'player should be pressed against the wall');
    assert.equal(s.y, 0);
  });

  it('cannot walk through a wall at any approach angle or with a large dt', () => {
    const longWall = { minX: -58, maxX: 58, minY: 0, maxY: 4, minZ: -5, maxZ: -4 };
    for (const yaw of [0.3, -0.7, 1.1]) {
      const s = createMovementState({ x: 0, y: 0, z: 0, onGround: true });
      runSteps(s, makeInput({ moveForward: 1, moveRight: 0.5, yaw: yaw * 0.2, wantsSprint: true }), 60 * 5, { obstacles: [longWall], arenaHalfSize: 60 });
      assert.ok(s.z >= -4 + MATCH_CONFIG.PLAYER_RADIUS - 1e-6, `z=${s.z}`);
    }
  });

  it('steps up onto a 0.5m ledge and stands on it', () => {
    const ledge = { minX: -10, maxX: 10, minY: 0, maxY: 0.5, minZ: -40, maxZ: -3 };
    const s = createMovementState({ x: 0, y: 0, z: 0, onGround: true });
    runSteps(s, makeInput({ moveForward: 1 }), 60 * 2, { obstacles: [ledge], arenaHalfSize: 60 });
    assert.equal(s.y, 0.5);
    assert.equal(s.onGround, true);
    assert.ok(s.z < -3, 'player is on top of the ledge');
    assert.ok(0.5 <= PLAYER_STEP_UP);
  });

  it('is blocked by a 0.7m ledge (above the 0.52m step height)', () => {
    const ledge = { minX: -10, maxX: 10, minY: 0, maxY: 0.7, minZ: -40, maxZ: -3 };
    const s = createMovementState({ x: 0, y: 0, z: 0, onGround: true });
    runSteps(s, makeInput({ moveForward: 1 }), 60 * 2, { obstacles: [ledge], arenaHalfSize: 60 });
    assert.equal(s.y, 0);
    assert.ok(s.z >= -3 + MATCH_CONFIG.PLAYER_RADIUS - 1e-6);
  });

  it('lands on and stands on a platform', () => {
    const platform = { minX: -3, maxX: 3, minY: 0, maxY: 1.0, minZ: -3, maxZ: 3 };
    const s = createMovementState({ x: 0, y: 3, z: 0, onGround: false });
    const { events } = runSteps(s, makeInput(), 90, { obstacles: [platform], arenaHalfSize: 60 });
    assert.equal(s.y, 1.0);
    assert.equal(s.onGround, true);
    assert.equal(s.vy, 0);
    assert.ok(events.some((e) => e.landed), 'landing event fired');
  });

  it('bumps the head on a low ceiling (cannot jump through it) and falls back down', () => {
    const ceiling = { minX: -5, maxX: 5, minY: 2.0, maxY: 3.0, minZ: -5, maxZ: 5 };
    const s = createMovementState({ x: 0, y: 0, z: 0, onGround: true });
    let nowMs = 1000;
    let maxY = 0;
    for (let i = 0; i < 90; i++) {
      nowMs += FIXED_DT * 1000;
      stepPlayerMovement(s, makeInput({ wantsJump: i === 0 }), FIXED_DT, { obstacles: [ceiling], arenaHalfSize: 60 }, nowMs);
      maxY = Math.max(maxY, s.y);
      assert.ok(s.y + MATCH_CONFIG.PLAYER_HEIGHT <= 2.0 + 1e-9 || s.y > 2.9, `head went through the ceiling (y=${s.y})`);
    }
    assert.ok(maxY > 0.1 && maxY <= 2.0 - MATCH_CONFIG.PLAYER_HEIGHT + 1e-9, `apex ${maxY} should be limited by the ceiling`);
    assert.equal(s.y, 0);
    assert.equal(s.onGround, true);
  });

  it('emits a smoothed step offset when stepping up a ledge', () => {
    const ledge = { minX: -10, maxX: 10, minY: 0, maxY: 0.4, minZ: -40, maxZ: -3 };
    const s = createMovementState({ x: 0, y: 0, z: 0, onGround: true });
    let nowMs = 1000;
    let sawOffset = false;
    for (let i = 0; i < 120; i++) {
      nowMs += FIXED_DT * 1000;
      stepPlayerMovement(s, makeInput({ moveForward: 1 }), FIXED_DT, { obstacles: [ledge], arenaHalfSize: 60 }, nowMs);
      if (s.stepOffsetY < -0.05) sawOffset = true;
    }
    assert.ok(sawOffset, 'camera step offset should dip when stepping up');
    assert.equal(s.stepOffsetY, 0, 'and decay back to zero');
  });
});

describe('shared/physics.js - collision primitives', () => {
  it('collideCapsuleVsBoxes pushes out of walls and reports floor height', () => {
    const body = { x: -0.2, y: 0, z: 0, vy: 0 };
    const wall = { minX: 0, maxX: 2, minY: 0, maxY: 3, minZ: -2, maxZ: 2 };
    const floor = collideCapsuleVsBoxes(body, [wall], 0.45, 1.75, 0.52, 0);
    assert.equal(floor, 0);
    assert.ok(Math.abs(body.x - -0.45) < 1e-9, `x=${body.x}`);

    const crate = { minX: -1, maxX: 1, minY: 0, maxY: 0.4, minZ: -1, maxZ: 1 };
    const b2 = { x: 0, y: 0.3, z: 0, vy: 0 };
    assert.equal(collideCapsuleVsBoxes(b2, [crate], 0.45, 1.75, 0.52, 0), 0.4);
  });

  it('findGroundY returns the walkable top under a circle', () => {
    const crate = { minX: -1, maxX: 1, minY: 0, maxY: 0.4, minZ: -1, maxZ: 1 };
    const tall = { minX: 5, maxX: 6, minY: 0, maxY: 3, minZ: -1, maxZ: 1 };
    assert.equal(findGroundY(0, 0, 0, 0.45, [crate, tall]), 0.4);
    assert.equal(findGroundY(5.5, 0, 0, 0.45, [crate, tall]), 0, 'too tall to step onto');
    assert.equal(findGroundY(5.5, 2.6, 0, 0.45, [crate, tall]), 3);
    assert.equal(findGroundY(20, 0, 0, 0.45, [crate, tall]), 0);
  });

  it('isPointInsideInflatedBoxes honours the inflation radius', () => {
    const box = { minX: 0, maxX: 2, minY: 0, maxY: 2, minZ: 0, maxZ: 2 };
    assert.equal(isPointInsideInflatedBoxes(1, 1, 1, 0.18, [box]), true);
    assert.equal(isPointInsideInflatedBoxes(2.1, 1, 1, 0.18, [box]), true);
    assert.equal(isPointInsideInflatedBoxes(2.2, 1, 1, 0.18, [box]), false);
    assert.equal(isPointInsideInflatedBoxes(1, 1, 1, 0.18, []), false);
  });
});

describe('shared/physics.js - stepGrenade', () => {
  const grenadeMap = (obstacles = []) => ({ obstacles, arenaHalfSize: 60 });
  const mk = (over = {}) => ({ x: 0, y: 1.5, z: 0, vx: 0, vy: 0, vz: 0, ...over });

  it('is deterministic', () => {
    const mapCfg = getMapConfig('cyber_citadel');
    const a = mk({ z: -16, vx: 3, vy: 6, vz: -19.5 });
    const b = { ...a };
    for (let i = 0; i < 100; i++) {
      const ia = stepGrenade(a, 0.04, mapCfg);
      const ib = stepGrenade(b, 0.04, mapCfg);
      assert.equal(ia, ib);
    }
    assert.deepEqual(a, b);
  });

  it('sub-steps: one large dt equals the same time split in 20 ms slices', () => {
    const mapCfg = grenadeMap();
    const whole = mk({ vx: 5, vy: 8, vz: -6 });
    const parts = { ...whole };
    stepGrenade(whole, 0.1, mapCfg);
    for (let i = 0; i < 5; i++) stepGrenade(parts, 0.02, mapCfg);
    for (const k of ['x', 'y', 'z', 'vx', 'vy', 'vz']) {
      assert.ok(Math.abs(whole[k] - parts[k]) < 1e-9, `${k}: ${whole[k]} vs ${parts[k]}`);
    }
  });

  it('bounces off the floor with restitution and damping, then rolls to a stop', () => {
    const g = mk({ y: 3, vx: 2 });
    let maxImpact = 0;
    let bounced = false;
    for (let i = 0; i < 400; i++) {
      const impact = stepGrenade(g, 1 / 60, grenadeMap());
      maxImpact = Math.max(maxImpact, impact);
      if (impact > 1 && g.vy > 0) bounced = true;
      assert.ok(g.y >= GRENADE_FLOOR_Y - 1e-9);
    }
    assert.ok(bounced, 'grenade should bounce upward after hitting the floor');
    assert.ok(maxImpact > 5, `first impact ${maxImpact}`);
    assert.equal(g.vy, 0);
    assert.equal(g.vx, 0, 'rolling friction stops it eventually');
    assert.equal(g.y, GRENADE_FLOOR_Y);
  });

  it('bounces off a wall (reflects and damps the normal velocity)', () => {
    const wall = { minX: -10, maxX: 10, minY: 0, maxY: 6, minZ: -6, maxZ: -5 };
    const g = mk({ y: 2, z: -2, vz: -19.5, vy: 0 });
    let hit = false;
    for (let i = 0; i < 60; i++) {
      const impact = stepGrenade(g, 0.04, grenadeMap([wall]));
      assert.ok(g.z >= -5 - GRENADE_RADIUS - 1e-9 + -1e-9 || g.vz > 0 || impact > 0, 'must not tunnel through the wall');
      if (impact > 10) {
        hit = true;
        assert.ok(g.vz > 0, 'velocity reflected away from the wall');
        assert.ok(Math.abs(g.vz) < 19.5 * 0.5, 'and damped by restitution');
        break;
      }
    }
    assert.ok(hit);
    assert.ok(g.z > -5 - GRENADE_RADIUS - 1e-9);
  });

  it('lands and rests on top of a crate', () => {
    const crate = { minX: -1, maxX: 1, minY: 0, maxY: 1, minZ: -1, maxZ: 1 };
    const g = mk({ x: 0, y: 4, z: 0 });
    for (let i = 0; i < 300; i++) stepGrenade(g, 1 / 60, grenadeMap([crate]));
    assert.ok(Math.abs(g.y - (1 + GRENADE_RADIUS)) < 1e-9, `y=${g.y}`);
    assert.equal(g.vy, 0);
  });

  it('bounces off the arena boundary', () => {
    const g = mk({ x: 59, y: 1, vx: 30 });
    stepGrenade(g, 0.1, { obstacles: [], arenaHalfSize: 60 });
    assert.ok(g.x <= 60 - 0.25 + 1e-9);
    assert.ok(g.vx < 0);
  });
});

describe('RoomManager drift-corrected tick scheduler', () => {
  const mockIo = { to: () => ({ emit() {}, volatile: { emit() {} } }), emit() {} };

  it('ticks on absolute 40ms slots, never keeps the process alive, and stops via clearInterval / stop()', async () => {
    const rm = new RoomManager(mockIo);
    try {
      assert.ok(rm.tickInterval, 'tickInterval handle exists');
      assert.equal(typeof rm.tickInterval.unref, 'function');
      assert.equal(rm.tickInterval.hasRef(), false, 'timer must be unref()ed');

      const stamps = [];
      rm.tick = () => { stamps.push(performance.now()); };
      await new Promise((r) => setTimeout(r, 520));
      assert.ok(stamps.length >= 9 && stamps.length <= 14, `expected ~12 ticks in 520ms, got ${stamps.length}`);
      const span = stamps[stamps.length - 1] - stamps[0];
      const meanGap = span / (stamps.length - 1);
      assert.ok(Math.abs(meanGap - 40) < 6, `mean tick gap ${meanGap}ms should be ~40ms (no drift)`);

      clearInterval(rm.tickInterval);
      rm.tickInterval = null;
      const n = stamps.length;
      await new Promise((r) => setTimeout(r, 150));
      assert.equal(stamps.length, n, 'clearInterval(rm.tickInterval) stops the loop');

      rm.startTickLoop();
      await new Promise((r) => setTimeout(r, 120));
      assert.ok(stamps.length > n, 'startTickLoop restarts');
      rm.stop();
      const m = stamps.length;
      await new Promise((r) => setTimeout(r, 120));
      assert.equal(stamps.length, m, 'rm.stop() stops the loop');
    } finally {
      rm.stop();
    }
  });

  it('skips missed slots after a stall instead of bursting catch-up ticks', async () => {
    const rm = new RoomManager(mockIo);
    try {
      const stamps = [];
      let stalled = false;
      rm.tick = () => {
        stamps.push(performance.now());
        if (!stalled && stamps.length === 3) {
          stalled = true;
          const until = performance.now() + 210; // ~5 slots blocked
          while (performance.now() < until) { /* busy wait */ }
        }
      };
      await new Promise((r) => setTimeout(r, 700));
      assert.ok(stalled);
      const stallIdx = 2;
      const gaps = [];
      for (let i = stallIdx + 1; i < stamps.length; i++) gaps.push(stamps[i] - stamps[i - 1]);
      // First tick after the stall comes right at the next free slot; there must be no rapid-fire burst afterwards
      for (let i = 1; i < gaps.length; i++) {
        assert.ok(gaps[i] > 25, `burst detected: gap ${gaps[i]}ms after stall`);
      }
    } finally {
      rm.stop();
    }
  });
});
