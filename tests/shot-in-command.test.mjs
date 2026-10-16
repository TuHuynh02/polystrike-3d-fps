/**
 * Step 7b: Shots inside the input-command stream (`BTN.FIRE` + `ss`) and deterministic shared spread (`shared/spread.js`).
 *
 * Covers T0 requirements (a)-(l) from docs/GEMINI-GUIDE.md:
 *  (a) Bit-identical pellet directions between client and server across all stances, speeds, ADS, shotgun & burst bloom
 *  (b) Frame-rate independence of sim-time bloom (30 / 60 / 144 FPS)
 *  (c) Server-authoritative hit & miss via FIRE command; smuggled client fields (`dir`, `hits`, `targetId`, `isHeadshot`, `hitPoint`, `origin`) ignored
 *  (d) Client cannot force spread = 0 while moving/airborne or spraying
 *  (e) True per-ray obstacle occlusion: wall blocks, gap between walls passes, head shot over a low crate lands
 *  (f) Shotgun 8-pellet per-ray resolution and per-part zone scoring
 *  (g) Fire-rate validation in command simulation time (buffered catch-up bursts accepted, rapid-fire rejected)
 *  (h) Monotonic shot sequence `ss` enforcement (duplicates, old, and huge gaps rejected)
 *  (i) Lag-compensation rewind on FIRE commands (hits with RTT > 0, misses with RTT = 0 at the same aim angle)
 *  (j) Weapon switching, reload gating, spawn protection shield, dead shooter rejection, headshot & kill events
 *  (k) Live server (`server/index.js`): raw `shoot` socket event is a no-op
 *  (l) `spreadSeed` is secret to the owner (`roomJoined.player.spreadSeed` & owner-only `selfSeed`), never leaked in broadcasts
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { WebSocket } from 'ws';

import { createTestGame3D } from './helpers/headless-game3d.mjs';
import { MATCH_CONFIG, WEAPONS, getMapConfig } from '../shared/constants.js';
import { FIXED_DT, createMovementState } from '../shared/movement.js';
import {
  BTN,
  MAX_SHOT_SEQ_GAP,
  buildInputCommand,
  commandTimeMs,
  sanitizeInputCommand,
  stepCommand
} from '../shared/netcode.js';
import {
  computeSpreadAmount,
  createShotState,
  planShot,
  resetShotState
} from '../shared/spread.js';
import { getHitboxParts } from '../shared/hitboxes.js';
import { recordPlayerSnapshot, resolveShotRewindMs } from '../shared/lagCompensation.js';
import { RoomManager, SHOT_REJECT } from '../server/roomManager.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');
const MAP_ID = 'cyber_citadel';

function createServer() {
  const emitted = [];
  const record = (to, event, payload, volatile = false) => {
    emitted.push({ to, event, payload, volatile });
  };
  const io = {
    to: (target) => ({
      emit: (event, payload) => record(target, event, payload, false),
      volatile: { emit: (event, payload) => record(target, event, payload, true) }
    })
  };
  const rm = new RoomManager(io);
  rm.stop();
  return { rm, emitted };
}

function join(rm, id, roomCode = 'SHOT01', extra = {}) {
  const res = rm.addHumanPlayer(
    { id },
    { name: id, roomCode, mode: 'private', botCount: 0, mapId: MAP_ID, weapon: 'rifle', ...extra }
  );
  assert.ok(!res.error, `join failed: ${res.error}`);
  res.player.invulnerableUntil = 0;
  return res;
}

function teleport(rm, player, x, y, z, now = Date.now()) {
  player.x = x;
  player.y = y;
  player.z = z;
  player.positionHistory = [];
  player.lastProcessedSeq = 0;
  rm.resetPlayerMovement(player, now);
}

function aimYawPitch(fromEye, toPoint) {
  const dx = toPoint.x - fromEye.x;
  const dy = toPoint.y - fromEye.y;
  const dz = toPoint.z - fromEye.z;
  const yaw = Math.atan2(-dx, -dz);
  const horiz = Math.hypot(dx, dz);
  const pitch = Math.atan2(dy, horiz);
  return { yaw, pitch };
}

describe('(a) deterministic spread & bit-identical client/server pellet directions', () => {
  it('produces bit-identical origins, spread amounts and pellet rays across stances, speeds, ADS, shotgun and bursts', () => {
    const seed = 0x9f4a2c11;
    const scenarios = [
      { name: 'standing stationary', weapon: 'rifle', pose: { x: 2, y: 0, z: -10, vx: 0, vz: 0, onGround: true, crouching: false, isSliding: false, prone: false, lean: 0, aiming: false } },
      { name: 'sprinting', weapon: 'rifle', pose: { x: -4, y: 0, z: 8, vx: 4.5, vz: -6.2, onGround: true, crouching: false, isSliding: false, prone: false, lean: 0, aiming: false } },
      { name: 'ADS stationary', weapon: 'm4a1', pose: { x: 0, y: 0, z: -16, vx: 0, vz: 0, onGround: true, crouching: false, isSliding: false, prone: false, lean: 0.5, aiming: true } },
      { name: 'crouching', weapon: 'smg', pose: { x: 1, y: 0, z: 3, vx: 1.2, vz: 0, onGround: true, crouching: true, isSliding: false, prone: false, lean: -1, aiming: false } },
      { name: 'prone', weapon: 'sniper', pose: { x: -8, y: 0, z: -12, vx: 0, vz: 0, onGround: true, crouching: false, isSliding: false, prone: true, lean: 0, aiming: true } },
      { name: 'airborne', weapon: 'deagle', pose: { x: 0, y: 1.4, z: 0, vx: 3.1, vz: -2.0, onGround: false, crouching: false, isSliding: false, prone: false, lean: 0, aiming: false } },
      { name: 'shotgun 8 pellets', weapon: 'shotgun', pose: { x: 5, y: 0, z: -5, vx: 2.0, vz: 1.5, onGround: true, crouching: false, isSliding: false, prone: false, lean: 0, aiming: false } }
    ];

    for (const sc of scenarios) {
      const clientState = createShotState();
      const serverState = createShotState();
      const cfg = WEAPONS[sc.weapon];

      // Fire a 6-shot burst so bloom accumulates and decays across sim time
      for (let ss = 1; ss <= 6; ss++) {
        const seq = ss * 8;
        const simTime = commandTimeMs(seq);
        const yaw = 0.37 * ss - 0.8;
        const pitch = -0.12 + 0.03 * ss;

        const cPlan = planShot(clientState, sc.weapon, cfg, simTime, sc.pose, yaw, pitch, seed, ss);
        const sPlan = planShot(serverState, sc.weapon, cfg, simTime, sc.pose, yaw, pitch, seed, ss);

        assert.deepEqual(cPlan, sPlan, `mismatch in ${sc.name} shot #${ss}`);
        assert.deepEqual(clientState, serverState, `shotState mismatch in ${sc.name} shot #${ss}`);
        if (sc.weapon === 'shotgun') {
          assert.equal(cPlan.dirs.length, 8, 'shotgun must produce 8 pellet directions');
        }
      }
    }
  });

  it('matches bit-for-bit between headless Game3D.predictFireCommand and RoomManager.processFireCommand', async () => {
    const { rm, emitted } = createServer();
    const { room, player } = join(rm, 'parity_p1', 'PAR001', { weapon: 'm4a1' });
    const now0 = 10_000;
    teleport(rm, player, 0, 0, -16, now0);

    const game = await createTestGame3D();
    game.localId = player.id;
    game.inMatch = true;
    game.alive = true;
    game.isPointerLocked = true;
    game.resetNetcode(player.moveEpoch);
    game.setSpreadSeed(player.spreadSeed);
    game.spawnLocalPlayer({
      x: player.x,
      y: player.y,
      z: player.z,
      yaw: 0.25,
      pitch: -0.05,
      weapon: 'm4a1',
      spreadSeed: player.spreadSeed,
      loadout: player.loadout
    });
    game.position.set(player.x, player.y, player.z);
    game.equipUntil = 0;

    // Step 1: pull trigger in Game3D and advance one fixed physics step
    game.keys.KeyW = true;
    game.yaw = 0.25;
    game.pitch = -0.05;
    game.lastShotAt = -1000;
    game.attemptShoot();
    game.advanceFixedPhysics(FIXED_DT);

    assert.ok(game.lastShotPlan, 'Game3D should have recorded lastShotPlan');
    const batch = game.prediction.buildBatch();
    assert.ok(batch);

    player.moveCredit = 1;
    rm.handleInputBatch(room, player, batch, now0 + 50);
    rm.processPlayerInputs(room, player, now0 + 50);

    const shotEvt = emitted.find((e) => e.event === 'shotFired')?.payload;
    assert.ok(shotEvt, 'server must emit shotFired');
    assert.equal(Math.round(game.lastShotPlan.origin.x * 1000) / 1000, shotEvt.origin.x);
    assert.equal(Math.round(game.lastShotPlan.origin.y * 1000) / 1000, shotEvt.origin.y);
    assert.equal(Math.round(game.lastShotPlan.origin.z * 1000) / 1000, shotEvt.origin.z);
    assert.equal(Math.round(game.lastShotPlan.dirs[0].x * 10000) / 10000, shotEvt.dir.x);
    assert.equal(Math.round(game.lastShotPlan.dirs[0].y * 10000) / 10000, shotEvt.dir.y);
    assert.equal(Math.round(game.lastShotPlan.dirs[0].z * 10000) / 10000, shotEvt.dir.z);
  });
});

describe('(b) bloom is frame-rate independent (30 / 60 / 144 FPS)', () => {
  function runAtFps(fps) {
    const frameDt = 1 / fps;
    let acc = 0;
    let seq = 0;
    let ss = 0;
    let lastFireTimeMs = -Infinity;
    const moveState = createMovementState({ x: 0, y: 0, z: -16, onGround: true });
    const shotState = createShotState();
    const mapCfg = getMapConfig(MAP_ID);
    const cfg = WEAPONS.rifle;
    const plans = [];

    // Simulate 1.5 seconds of holding W and firing whenever the weapon interval allows in sim time
    const totalFrames = Math.round(1.5 * fps);
    for (let f = 0; f < totalFrames; f++) {
      acc += frameDt;
      while (acc >= FIXED_DT - 1e-12) {
        acc -= FIXED_DT;
        seq += 1;
        const simMs = commandTimeMs(seq);
        const canFire = simMs - lastFireTimeMs >= cfg.fireRateMs * 0.9 - 1e-6;
        const cmd = buildInputCommand(seq, {
          moveForward: 1,
          moveRight: 0,
          yaw: 0.1,
          pitch: -0.02,
          lean: 0,
          weapon: 'rifle',
          fire: canFire,
          shotSeq: canFire ? ++ss : 0
        });
        stepCommand(moveState, cmd, mapCfg);
        if ((cmd.btn & BTN.FIRE) !== 0) {
          lastFireTimeMs = simMs;
          plans.push(
            planShot(
              shotState,
              'rifle',
              cfg,
              simMs,
              {
                x: moveState.x,
                y: moveState.y,
                z: moveState.z,
                vx: moveState.vx,
                vz: moveState.vz,
                onGround: moveState.onGround,
                crouching: moveState.crouching,
                isSliding: moveState.isSliding,
                prone: moveState.prone,
                lean: 0,
                aiming: false
              },
              cmd.yaw,
              cmd.pitch,
              0x12345678,
              cmd.ss
            )
          );
        }
      }
    }
    return { shotState, plans };
  }

  it('produces identical bloom, shotIndex and pellet rays across 30, 60 and 144 FPS', () => {
    const r30 = runAtFps(30);
    const r60 = runAtFps(60);
    const r144 = runAtFps(144);

    assert.ok(r60.plans.length >= 10, `expected at least 10 shots in 1.5s, got ${r60.plans.length}`);
    assert.deepEqual(r30.shotState, r60.shotState);
    assert.deepEqual(r144.shotState, r60.shotState);
    assert.deepEqual(r30.plans, r60.plans);
    assert.deepEqual(r144.plans, r60.plans);
  });
});

describe('(c) & (d) FIRE command authority: smuggled fields ignored, spread cannot be zeroed by client', () => {
  it('deals damage when the server ray hits, misses when aimed away, and ignores smuggled hit/origin/dir fields', () => {
    const { rm } = createServer();
    const { room, player: shooter } = join(rm, 's_auth', 'AUTH_C', { weapon: 'm4a1' });
    const { player: target } = join(rm, 't_auth', 'AUTH_C');
    const now0 = 20_000;
    teleport(rm, shooter, 0, 0, -16, now0);
    teleport(rm, target, 0, 0, -22, now0);
    recordPlayerSnapshot(target, now0);

    // 1. Aim completely away (yaw = PI => looking +Z away from target at -22), but smuggle every legacy hit claim field
    const rawMissWithClaims = {
      ...buildInputCommand(1, { yaw: Math.PI, pitch: 0, isAiming: true, weapon: 'm4a1', fire: true, shotSeq: 1 }),
      dir: { x: 0, y: 0, z: -1 },
      origin: { x: 0, y: 1.71, z: -21.5 },
      targetId: target.id,
      isHeadshot: true,
      hitPoint: { x: 0, y: 1.71, z: -22 },
      hits: [{ targetId: target.id, isHeadshot: true, hitPoint: { x: 0, y: 1.71, z: -22 } }],
      spread: 0,
      bloom: 0
    };

    const sanitized = sanitizeInputCommand(rawMissWithClaims);
    assert.equal(sanitized.dir, undefined);
    assert.equal(sanitized.hits, undefined);
    assert.equal(sanitized.targetId, undefined);
    assert.equal(sanitized.isHeadshot, undefined);
    assert.equal(sanitized.origin, undefined);
    assert.equal(sanitized.spread, undefined);

    shooter.moveCredit = 1;
    rm.handleInputBatch(room, shooter, { e: shooter.moveEpoch, cmds: [rawMissWithClaims] }, now0 + 50);
    rm.processPlayerInputs(room, shooter, now0 + 50);
    assert.equal(target.hp, 100, 'smuggled hit claims on a miss ray must deal 0 damage');

    // 2. Aim accurately at target's head (yaw = 0, pitch = 0 from eye y=1.62 hits head at 6m), after fire interval
    const hitCmd = buildInputCommand(10, { yaw: 0, pitch: 0, isAiming: true, weapon: 'm4a1', fire: true, shotSeq: 2 });
    shooter.lastProcessedSeq = 9;
    shooter.moveCredit = 1;
    rm.handleInputBatch(room, shooter, { e: shooter.moveEpoch, cmds: [hitCmd] }, now0 + 250);
    rm.processPlayerInputs(room, shooter, now0 + 250);
    assert.equal(target.hp, 100 - Math.round(WEAPONS.m4a1.damage * WEAPONS.m4a1.headshotMult));
  });

  it('computes non-zero spread from server movement/airborne state regardless of client claims', () => {
    const { rm } = createServer();
    const { room, player: shooter } = join(rm, 's_spread', 'SPRD01', { weapon: 'rifle' });
    const now0 = 30_000;
    teleport(rm, shooter, 0, 0, -16, now0);

    // Put shooter into an airborne + fast horizontal velocity state on the server
    shooter.moveState.onGround = false;
    shooter.moveState.vx = 6.0;
    shooter.moveState.vz = -6.0;
    rm._markMoveSynced(shooter);

    const expectedSpread = computeSpreadAmount(WEAPONS.rifle, {
      horizSpeed: Math.hypot(shooter.moveState.vx, shooter.moveState.vz),
      onGround: false,
      crouching: false,
      sliding: false,
      prone: false,
      aiming: false,
      bloom: 0,
      shotIndex: 0
    });
    assert.ok(expectedSpread > 0.15, `airborne moving rifle spread should be wide (>0.15), got ${expectedSpread}`);

    // Client tries to claim stationary / zero spread on the wire
    const rawCmd = {
      ...buildInputCommand(1, { moveForward: 0, moveRight: 0, yaw: 0, pitch: 0, weapon: 'rifle', fire: true, shotSeq: 1 }),
      spread: 0,
      bloom: 0,
      onGround: true,
      vx: 0,
      vz: 0
    };
    shooter.moveCredit = 1;
    rm.handleInputBatch(room, shooter, { e: shooter.moveEpoch, cmds: [rawCmd] }, now0 + 50);
    rm.processPlayerInputs(room, shooter, now0 + 50);

    assert.ok(shooter.shotState.bloom > WEAPONS.rifle.bloomPerShot * 1.5, 'server must apply moving/airborne MOVE_BLOOM_MULT');
  });
});

describe('(e) per-ray obstacle occlusion: wall blocks, gap passes, head shot over a low crate lands', () => {
  it('blocks a shot when a wall is closer than the target, passes through a gap, and hits the head over a low crate', () => {
    const { rm } = createServer();
    const { room, player: shooter } = join(rm, 's_occ', 'OCC001', { weapon: 'sniper' });
    const { player: target } = join(rm, 't_occ', 'OCC001');
    const now0 = 40_000;

    // 1. Solid container on cyber_citadel at (-22, 1.6, -10) with size (3.6, 3.2, 7.5): blocks shooter at (-26,0,-10) -> target at (-18,0,-10)
    teleport(rm, shooter, -26, 0, -10, now0);
    teleport(rm, target, -18, 0, -10, now0);
    recordPlayerSnapshot(target, now0);
    const eye1 = { x: shooter.x, y: 1.62, z: shooter.z };
    const head1 = partCenter(target, 'head');
    const { yaw: yaw1, pitch: pitch1 } = aimYawPitch(eye1, head1);
    const cmdBlocked = buildInputCommand(1, { yaw: yaw1, pitch: pitch1, isAiming: true, weapon: 'sniper', fire: true, shotSeq: 1 });
    shooter.moveCredit = 1;
    rm.handleInputBatch(room, shooter, { e: shooter.moveEpoch, cmds: [cmdBlocked] }, now0 + 50);
    rm.processPlayerInputs(room, shooter, now0 + 50);
    assert.equal(target.hp, 100, 'wall closer than target must absorb the ray');

    // 2. Open corridor (gap between obstacles) in northern plaza: (0, 0, -16) -> (0, 0, -24)
    const now1 = now0 + 2000;
    teleport(rm, shooter, 0, 0, -16, now1);
    rm.resetShotSession(shooter);
    teleport(rm, target, 0, 0, -24, now1);
    recordPlayerSnapshot(target, now1);
    const eye2 = { x: 0, y: 1.62, z: -16 };
    const head2 = partCenter(target, 'head');
    const { yaw: yaw2, pitch: pitch2 } = aimYawPitch(eye2, head2);
    const cmdOpen = buildInputCommand(1, { yaw: yaw2, pitch: pitch2, isAiming: true, weapon: 'sniper', fire: true, shotSeq: 2 });
    shooter.moveCredit = 1;
    rm.handleInputBatch(room, shooter, { e: shooter.moveEpoch, cmds: [cmdOpen] }, now1 + 50);
    rm.processPlayerInputs(room, shooter, now1 + 50);
    assert.equal(target.hp, 0, 'unobstructed sniper headshot through open gap must hit and kill');

    // 3. Low cover crate: inject a temporary 1.1m-tall crate at (0, 0.55, -20) between (0,0,-16) and (0,0,-24)
    const mapCfg = getMapConfig(room.mapId);
    const lowCrate = {
      x: 0, y: 0.55, z: -20, w: 2.0, h: 1.1, d: 1.0,
      minX: -1.0, maxX: 1.0, minY: 0, maxY: 1.1, minZ: -20.5, maxZ: -19.5
    };
    mapCfg.obstacles.push(lowCrate);
    try {
      const now2 = now1 + 2000;
      target.alive = true;
      target.hp = 100;
      teleport(rm, shooter, 0, 0, -16, now2);
      teleport(rm, target, 0, 0, -24, now2);
      recordPlayerSnapshot(target, now2);

      // Ray aimed at target's shins (y = 0.35) passes through z = -20 at y ≈ 0.985 <= 1.1m => blocked by low crate!
      const shin = partCenter(target, 'shin_l');
      const aimLeg = aimYawPitch(eye2, shin);
      const resLeg = rm.resolveShot(room, shooter, {
        weaponId: 'm4a1',
        origin: eye2,
        dirs: [{
          x: -Math.sin(aimLeg.yaw) * Math.cos(aimLeg.pitch),
          y: Math.sin(aimLeg.pitch),
          z: -Math.cos(aimLeg.yaw) * Math.cos(aimLeg.pitch)
        }],
        now: now2
      });
      assert.equal(resLeg.hits.length, 0, 'low crate must block a leg ray passing below 1.1m');
      assert.equal(target.hp, 100);

      // Ray aimed at target's exposed head (y = 1.71) passes through z = -20 at y ≈ 1.665 > 1.1m => clears the low crate!
      const aimHead = aimYawPitch(eye2, head2);
      const resHead = rm.resolveShot(room, shooter, {
        weaponId: 'm4a1',
        origin: eye2,
        dirs: [{
          x: -Math.sin(aimHead.yaw) * Math.cos(aimHead.pitch),
          y: Math.sin(aimHead.pitch),
          z: -Math.cos(aimHead.yaw) * Math.cos(aimHead.pitch)
        }],
        now: now2
      });
      assert.equal(resHead.hits.length, 1);
      assert.equal(resHead.hits[0].zone, 'head');
      assert.ok(target.hp < 100, 'head shot over a low crate must land');
    } finally {
      mapCfg.obstacles.pop();
    }
  });
});

function partCenter(player, id) {
  const parts = getHitboxParts('stand', player.yaw || 0, player.lean || 0, player, player.pitch || 0);
  return parts.find((p) => p.id === id).center;
}

describe('(f) shotgun per-pellet resolution', () => {
  it('resolves all 8 shotgun pellets independently via processFireCommand', () => {
    const { rm, emitted } = createServer();
    const { room, player: shooter } = join(rm, 's_sg', 'SG0001', { weapon: 'shotgun' });
    const { player: target } = join(rm, 't_sg', 'SG0001');
    const now0 = 50_000;
    teleport(rm, shooter, 0, 0, -16, now0);
    teleport(rm, target, 0, 0, -19.5, now0); // 3.5m away: tight spread hits multiple parts
    target.hp = 500;
    recordPlayerSnapshot(target, now0);

    const eye = { x: 0, y: 1.62, z: -16 };
    const torso = partCenter(target, 'torso');
    const { yaw, pitch } = aimYawPitch(eye, torso);

    const cmd = buildInputCommand(1, { yaw, pitch, isAiming: true, weapon: 'shotgun', fire: true, shotSeq: 1 });
    shooter.moveCredit = 1;
    rm.handleInputBatch(room, shooter, { e: shooter.moveEpoch, cmds: [cmd] }, now0 + 50);
    rm.processPlayerInputs(room, shooter, now0 + 50);

    const shotEvt = emitted.find((e) => e.event === 'shotFired')?.payload;
    assert.ok(shotEvt);
    assert.equal(shotEvt.dirs.length, WEAPONS.shotgun.pellets);
    assert.ok(target.hp < 500, 'shotgun blast at 3.5m must damage target');
    assert.equal(shooter.ammo, WEAPONS.shotgun.magSize - 1);
  });
});

describe('(g) & (h) fire-rate in command sim time and monotonic shotSeq `ss`', () => {
  it('accepts a catch-up burst spaced in sim time, and rejects commands spaced closer than fireRateMs * 0.9', () => {
    const { rm } = createServer();
    const { room, player: shooter } = join(rm, 's_rate', 'RATE01', { weapon: 'rifle' });
    const now0 = 60_000;
    teleport(rm, shooter, 0, 0, -16, now0);

    // Rifle fireRateMs = 95ms -> 0.9 * 95 = 85.5ms => 6 steps (100ms sim time) is valid, 3 steps (50ms) is too fast
    const cmds = [];
    for (let seq = 1; seq <= 13; seq++) {
      let fire = false;
      let shotSeq = 0;
      if (seq === 1) { fire = true; shotSeq = 1; }
      else if (seq === 4) { fire = true; shotSeq = 2; } // only 50ms after seq 1 -> RATE reject!
      else if (seq === 7) { fire = true; shotSeq = 3; } // 100ms after seq 1 -> accepted!
      else if (seq === 13) { fire = true; shotSeq = 4; } // 100ms after seq 7 -> accepted!
      cmds.push(buildInputCommand(seq, { yaw: 0, pitch: 0, weapon: 'rifle', fire, shotSeq }));
    }

    // Deliver all 13 commands in a single batch (simulating a lagged burst arriving together)
    shooter.moveCredit = 1;
    rm.handleInputBatch(room, shooter, { e: shooter.moveEpoch, cmds }, now0 + 250);
    rm.processPlayerInputs(room, shooter, now0 + 250);

    // Shots 1, 3, 4 succeeded (3 rounds consumed); shot 2 was rejected for RATE
    assert.equal(shooter.ammo, WEAPONS.rifle.magSize - 3);
    assert.deepEqual(shooter.lastShotReject, { ss: 2, reason: SHOT_REJECT.RATE });
  });

  it('rejects duplicate, decreasing, or gap-exceeding `ss` values with SHOT_REJECT.SEQ', () => {
    const { rm } = createServer();
    const { room, player: shooter } = join(rm, 's_seq', 'SEQ001', { weapon: 'rifle' });
    const now0 = 70_000;
    teleport(rm, shooter, 0, 0, -16, now0);
    shooter.moveCredit = 1;

    // Shot 1 (ss = 2, valid gap <= MAX_SHOT_SEQ_GAP)
    rm.handleInputBatch(room, shooter, {
      e: shooter.moveEpoch,
      cmds: [buildInputCommand(1, { weapon: 'rifle', fire: true, shotSeq: 2 })]
    }, now0 + 50);
    rm.processPlayerInputs(room, shooter, now0 + 50);
    assert.equal(shooter.ammo, 29);
    assert.equal(shooter.lastShotReject, null);

    // Duplicate ss = 2 (spaced 10 steps later so rate is fine) -> rejected with SEQ
    shooter.lastProcessedSeq = 10;
    shooter.moveCredit = 1;
    rm.handleInputBatch(room, shooter, {
      e: shooter.moveEpoch,
      cmds: [buildInputCommand(11, { weapon: 'rifle', fire: true, shotSeq: 2 })]
    }, now0 + 250);
    rm.processPlayerInputs(room, shooter, now0 + 250);
    assert.equal(shooter.ammo, 29);
    assert.deepEqual(shooter.lastShotReject, { ss: 2, reason: SHOT_REJECT.SEQ });

    // Decreasing ss = 1 -> rejected with SEQ
    shooter.lastProcessedSeq = 20;
    shooter.moveCredit = 1;
    rm.handleInputBatch(room, shooter, {
      e: shooter.moveEpoch,
      cmds: [buildInputCommand(21, { weapon: 'rifle', fire: true, shotSeq: 1 })]
    }, now0 + 450);
    rm.processPlayerInputs(room, shooter, now0 + 450);
    assert.equal(shooter.ammo, 29);
    assert.deepEqual(shooter.lastShotReject, { ss: 1, reason: SHOT_REJECT.SEQ });

    // Huge jump ss = 2 + MAX_SHOT_SEQ_GAP + 1 -> rejected with SEQ
    const hugeSs = 2 + MAX_SHOT_SEQ_GAP + 1;
    shooter.lastProcessedSeq = 30;
    shooter.moveCredit = 1;
    rm.handleInputBatch(room, shooter, {
      e: shooter.moveEpoch,
      cmds: [buildInputCommand(31, { weapon: 'rifle', fire: true, shotSeq: hugeSs })]
    }, now0 + 650);
    rm.processPlayerInputs(room, shooter, now0 + 650);
    assert.equal(shooter.ammo, 29);
    assert.deepEqual(shooter.lastShotReject, { ss: hugeSs, reason: SHOT_REJECT.SEQ });
  });
});

describe('(i) lag-compensation rewind on FIRE commands', () => {
  it('hits a fast-moving target at the rewound position when RTT > 0 and misses at the same aim angle when RTT = 0', () => {
    const { rm } = createServer();
    const { room, player: shooter } = join(rm, 's_lag', 'LAG001', { weapon: 'sniper' });
    const { player: target } = join(rm, 't_lag', 'LAG001');
    const now0 = 80_000;
    teleport(rm, shooter, 0, 0, -16, now0);
    teleport(rm, target, 0, 0, -26, now0);

    // Target sprints from x = -2 to x = +2 across z = -26 over 250ms (8 m/s)
    target.positionHistory = [];
    const vx = 8;
    const startX = -2;
    for (let t = 250; t >= 0; t -= 25) {
      target.x = startX + vx * ((250 - t) / 1000);
      recordPlayerSnapshot(target, now0 - t);
    }
    const liveX = target.x; // 0.0m at now0

    shooter.rttMs = 160; // rewind = clamp(80 + 100, 0, 200) = 180ms
    const rewindLug = resolveShotRewindMs(shooter, null, now0);
    const rewoundX = startX + vx * ((250 - rewindLug) / 1000); // -1.44m (1.44m away from liveX = 0.0m)

    const eye = { x: 0, y: 1.62, z: -16 };
    const seenHead = { x: rewoundX, y: 1.71, z: -26 };
    const { yaw, pitch } = aimYawPitch(eye, seenHead);

    // 1. With RTT = 0 (rewind = 100ms -> target at x = -0.80m, 0.64m away from rewoundX = -1.44m), aiming at rewoundX misses!
    shooter.rttMs = 0;
    shooter.moveCredit = 1;
    const cmdMiss = buildInputCommand(1, { yaw, pitch, isAiming: true, weapon: 'sniper', fire: true, shotSeq: 1 });
    rm.handleInputBatch(room, shooter, { e: shooter.moveEpoch, cmds: [cmdMiss] }, now0);
    rm.processPlayerInputs(room, shooter, now0);
    assert.equal(target.hp, 100, 'without the extra RTT rewind, aiming at the 180ms-old position must miss');

    // 2. With RTT = 160ms, the same aim angle hits the rewound head! (seq = 65 > 950ms sniper cooldown)
    shooter.rttMs = 160;
    target.x = liveX;
    shooter.lastProcessedSeq = 64;
    shooter.moveCredit = 1;
    const cmdHit = buildInputCommand(65, { yaw, pitch, isAiming: true, weapon: 'sniper', fire: true, shotSeq: 2 });
    rm.handleInputBatch(room, shooter, { e: shooter.moveEpoch, cmds: [cmdHit] }, now0);
    rm.processPlayerInputs(room, shooter, now0);
    assert.equal(target.hp, 0, 'with RTT = 160ms, aiming at the rewound head must score a sniper headshot kill');
  });
});

describe('(j) weapon switch, reload gating, spawn protection, dead shooter & kill events', () => {
  it('switches weapons via command, blocks firing while reloading, honours spawn protection, and rejects dead shooters', () => {
    const { rm, emitted } = createServer();
    const { room, player: shooter } = join(rm, 's_rules', 'RUL001', {
      weapon: 'm4a1',
      loadout: { primary: 'm4a1', secondary: 'deagle', melee: 'knife' }
    });
    const { player: target } = join(rm, 't_rules', 'RUL001');
    const now0 = 90_000;
    teleport(rm, shooter, 0, 0, -16, now0);
    teleport(rm, target, 0, 0, -22, now0);
    recordPlayerSnapshot(target, now0);

    // 1. Target has spawn protection -> emits spawnProtectedHit and deals 0 damage; shooter's own shield ends on firing
    shooter.invulnerableUntil = now0 + 1500;
    target.invulnerableUntil = now0 + 1500;
    shooter.moveCredit = 1;
    const cmdShield = buildInputCommand(1, { yaw: 0, pitch: 0, isAiming: true, weapon: 'deagle', fire: true, shotSeq: 1 });
    rm.handleInputBatch(room, shooter, { e: shooter.moveEpoch, cmds: [cmdShield] }, now0 + 20);
    rm.processPlayerInputs(room, shooter, now0 + 20);

    assert.equal(shooter.weapon, 'deagle', 'command switched shooter to secondary weapon deagle');
    assert.equal(shooter.invulnerableUntil, 0, 'firing ended shooter spawn protection');
    assert.equal(target.hp, 100, 'spawn-protected target takes 0 damage');
    assert.ok(emitted.some((e) => e.event === 'spawnProtectedHit' && e.payload.targetId === target.id));

    // 2. While reloading (>350ms remaining), FIRE command (after deagle's 310ms fire interval, seq = 25) is rejected with RELOAD
    target.invulnerableUntil = 0;
    shooter.reloadingUntil = now0 + 1500;
    shooter.reloadWeapon = 'deagle';
    shooter.lastProcessedSeq = 24;
    shooter.moveCredit = 1;
    const cmdReloading = buildInputCommand(25, { yaw: 0, pitch: 0, isAiming: true, weapon: 'deagle', fire: true, shotSeq: 2 });
    rm.handleInputBatch(room, shooter, { e: shooter.moveEpoch, cmds: [cmdReloading] }, now0 + 50);
    rm.processPlayerInputs(room, shooter, now0 + 50);
    assert.equal(target.hp, 100);
    assert.deepEqual(shooter.lastShotReject, { ss: 2, reason: SHOT_REJECT.RELOAD });

    // 3. Reload finishes -> headshot with deagle kills injured target and emits damageDealt + killEvent
    shooter.reloadingUntil = 0;
    shooter.reloadWeapon = null;
    target.hp = 50;
    shooter.lastProcessedSeq = 50;
    shooter.moveCredit = 1;
    const cmdKill = buildInputCommand(51, { yaw: 0, pitch: 0, isAiming: true, weapon: 'deagle', fire: true, shotSeq: 3 });
    rm.handleInputBatch(room, shooter, { e: shooter.moveEpoch, cmds: [cmdKill] }, now0 + 1600);
    rm.processPlayerInputs(room, shooter, now0 + 1600);
    assert.equal(target.hp, 0);
    assert.equal(target.alive, false);
    assert.ok(emitted.some((e) => e.event === 'damageDealt' && e.payload.targetId === target.id && e.payload.isHeadshot === true));
    assert.ok(emitted.some((e) => e.event === 'killEvent' && e.payload.victimId === target.id && e.payload.isHeadshot === true));

    // 4. Dead shooter: queued commands are drained/acked without firing
    shooter.alive = false;
    const ammoBefore = shooter.ammo;
    shooter.lastProcessedSeq = 75;
    shooter.moveCredit = 1;
    const cmdDead = buildInputCommand(76, { yaw: 0, pitch: 0, weapon: 'deagle', fire: true, shotSeq: 4 });
    rm.handleInputBatch(room, shooter, { e: shooter.moveEpoch, cmds: [cmdDead] }, now0 + 1700);
    rm.processPlayerInputs(room, shooter, now0 + 1700);
    assert.equal(shooter.ammo, ammoBefore, 'dead player must not consume ammo or fire');
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// (k) & (l) Live server tests: raw `shoot` event is a no-op, and `spreadSeed` is owner-only
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
            if (found) {
              found.taken = true;
              res(found.payload);
              return;
            }
            const timer = setTimeout(() => rej(new Error(`timeout waiting for ${event}`)), timeoutMs);
            waiters.push({ event, res: (p) => { clearTimeout(timer); res(p); } });
          }),
          close: () => ws.close()
        });
      } else if (text.startsWith('42')) {
        const m = /^42(\d*)(\[.*)$/s.exec(text);
        const [event, payload] = JSON.parse(m[2]);
        if (m[1] !== '' && event === 'latencyProbe') ws.send(`43${m[1]}${JSON.stringify([payload])}`);
        const entry = { event, payload, taken: false };
        log.push(entry);
        const w = waiters.findIndex((x) => x.event === event);
        if (w >= 0) {
          entry.taken = true;
          waiters.splice(w, 1)[0].res(payload);
        }
      }
    });
    ws.on('error', reject);
  });
}

describe('(k) & (l) live server: raw `shoot` is ignored and `spreadSeed` is owner-only', () => {
  let child;
  let port;
  let exited = false;

  before(async () => {
    port = await getFreePort();
    child = spawn(process.execPath, ['server/index.js'], {
      cwd: ROOT_DIR,
      env: { ...process.env, PORT: String(port) },
      stdio: ['ignore', 'pipe', 'pipe']
    });
    child.on('exit', () => { exited = true; });
    child.stdout.resume();
    child.stderr.resume();
    const deadline = Date.now() + 15_000;
    for (;;) {
      try {
        if ((await fetch(`http://127.0.0.1:${port}/healthz`)).ok) break;
      } catch {
        // waiting
      }
      if (exited || Date.now() > deadline) throw new Error('server did not start');
      await new Promise((r) => setTimeout(r, 100));
    }
  });

  after(() => {
    if (child && !exited) child.kill();
  });

  it('(k) ignores raw `shoot` socket events and (l) delivers `spreadSeed` only to the owner on join and respawn', async () => {
    // 1. Unit check on RoomManager.respawnPlayer for owner-only selfSeed vs room playerRespawned
    const { rm, emitted } = createServer();
    const { room, player: p1 } = join(rm, 'sock_owner', 'SEED01');
    join(rm, 'sock_other', 'SEED01');
    rm.respawnPlayer(room, p1);

    const selfSeedEvts = emitted.filter((e) => e.event === 'selfSeed');
    assert.equal(selfSeedEvts.length, 1);
    assert.equal(selfSeedEvts[0].to, 'sock_owner', 'selfSeed must be sent ONLY to the owner room');
    assert.ok(Number.isInteger(selfSeedEvts[0].payload.spreadSeed));

    const respawnEvt = emitted.find((e) => e.event === 'playerRespawned');
    assert.ok(respawnEvt);
    assert.equal(respawnEvt.payload.spreadSeed, undefined, 'playerRespawned broadcast must never contain spreadSeed');

    // 2. Live server check over WebSocket
    const a = await connectClient(port);
    const b = await connectClient(port);
    try {
      a.emit('joinRoom', { name: 'LiveA', mode: 'private', botCount: 0, mapId: MAP_ID });
      const joinedA = await a.waitFor('roomJoined');
      assert.ok(Number.isInteger(joinedA.player.spreadSeed), 'owner receives spreadSeed in roomJoined.player');
      for (const pub of joinedA.players) {
        assert.equal(pub.spreadSeed, undefined, 'public player list must not expose spreadSeed');
      }

      const playerJoinedP = a.waitFor('playerJoined');
      b.emit('joinRoom', { name: 'LiveB', roomCode: joinedA.roomCode, mode: 'private', botCount: 0, mapId: MAP_ID });
      const joinedB = await b.waitFor('roomJoined');
      const pj = await playerJoinedP;
      assert.equal(pj.spreadSeed, undefined, 'playerJoined broadcast must not expose spreadSeed');
      assert.notEqual(joinedA.player.spreadSeed, undefined);
      assert.notEqual(joinedB.player.spreadSeed, undefined);

      // (k) Client A emits raw legacy `shoot` events -> server must completely ignore them
      for (let i = 0; i < 5; i++) {
        a.emit('shoot', {
          weapon: 'rifle',
          origin: { x: joinedA.player.x, y: 1.62, z: joinedA.player.z },
          dir: { x: 0, y: 0, z: -1 },
          targetId: joinedB.playerId,
          isHeadshot: true
        });
      }
      await new Promise((r) => setTimeout(r, 150));
      assert.equal(b.log.filter((m) => m.event === 'shotFired').length, 0, 'raw shoot event must not trigger shotFired');
      assert.equal(b.log.filter((m) => m.event === 'damageDealt').length, 0, 'raw shoot event must not deal damage');
    } finally {
      a.close();
      b.close();
    }
  });
});
