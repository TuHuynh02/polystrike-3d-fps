/**
 * Input-command netcode: client-side prediction + server reconciliation.
 *
 *  - server side (no sockets): RoomManager.handleInputBatch / processPlayerInputs with a fully controlled virtual clock
 *  - client side: the real Game3D (headless, tests/helpers/headless-game3d.mjs) wired to a RoomManager through a simulated
 *    network with latency and packet loss
 *  - one live test against the real server/index.js over a WebSocket
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { WebSocket } from 'ws';

// Installs the ESM hooks + DOM mocks needed to load public/js/*.js in Node (must come before the dynamic imports below)
import { createTestGame3D } from './helpers/headless-game3d.mjs';

import { MATCH_CONFIG, WEAPONS, getMapConfig } from '../shared/constants.js';
import { FIXED_DT } from '../shared/movement.js';
import {
  BTN,
  buildInputCommand,
  commandTimeMs,
  createMoveAck,
  sanitizeInputCommand,
  stepCommand
} from '../shared/netcode.js';
import {
  INPUT_CREDIT_CAP_S,
  INPUT_GAP_WAIT_MS,
  INPUT_QUEUE_MAX,
  RoomManager
} from '../server/roomManager.js';
import { RATE_LIMITS } from '../server/socketGuard.js';

const { RECONCILE_EPSILON, CORRECTION_DECAY_RATE } = await import('../public/js/prediction.js');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');
const MAP_ID = 'cyber_citadel';
const MAP_CFG = getMapConfig(MAP_ID);
const STEP_MS = 1000 / 60;

// ---------------------------------------------------------------------------------------------------------------------
// Server-side helpers
// ---------------------------------------------------------------------------------------------------------------------

function createServer(onEmit = null) {
  const emitted = [];
  const record = (to, event, payload, volatile) => {
    const entry = { to, event, payload, volatile };
    emitted.push(entry);
    onEmit?.(entry);
  };
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

function join(rm, id, roomCode = 'NET001') {
  const res = rm.addHumanPlayer({ id }, { name: id, roomCode, mode: 'private', mapId: MAP_ID });
  assert.ok(!res.error, `join failed: ${res.error}`);
  res.player.invulnerableUntil = 0;
  return res;
}

/** Server-side teleport (spawn-like): new movement epoch, credit clock restarted at `now`. */
function teleport(rm, player, x, y, z, now) {
  player.x = x;
  player.y = y;
  player.z = z;
  rm.resetPlayerMovement(player, now);
}

/** Builds a wire command the way the client does. */
function cmd(seq, over = {}) {
  return buildInputCommand(seq, {
    moveForward: 0,
    moveRight: 0,
    yaw: 0,
    pitch: 0,
    lean: 0,
    weapon: 'rifle',
    wantsCrouch: false,
    wantsProne: false,
    wantsSprint: false,
    wantsJump: false,
    isAiming: false,
    isAdsHeld: false,
    ...over
  });
}

/** Deterministic pseudo-random input script exercising walking, strafing, sprinting, sliding, jumping and prone. */
function makeScript(count, startSeq = 1, weapon = 'rifle') {
  let seed = 987654321;
  const rnd = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 0x100000000;
  };
  const cmds = [];
  let forward = 1;
  let right = 0;
  let sprint = false;
  let crouch = false;
  let prone = false;
  for (let i = 0; i < count; i++) {
    if (i % 25 === 0) {
      forward = rnd() < 0.75 ? 1 : rnd() < 0.5 ? -1 : 0;
      right = rnd() < 0.3 ? 1 : rnd() < 0.3 ? -1 : 0;
      sprint = rnd() < 0.5;
      crouch = rnd() < 0.15;
      prone = !crouch && rnd() < 0.1;
    }
    cmds.push(cmd(startSeq + i, {
      moveForward: forward,
      moveRight: right,
      yaw: Math.sin(i / 37) * 1.4 + i * 0.0013,
      pitch: Math.sin(i / 90) * 0.3,
      lean: i % 120 < 30 ? 0.5 : 0,
      weapon,
      wantsSprint: sprint,
      wantsCrouch: crouch,
      wantsProne: prone,
      wantsJump: rnd() < 0.03,
      isAiming: i % 200 > 150
    }));
  }
  return cmds;
}

/** Advances the local reference simulation (plain MovementState) through `cmds` with the shared step function. */
function simulateLocally(startState, cmds) {
  const state = structuredClone(startState);
  const scratch = {};
  for (const c of cmds) stepCommand(state, c, MAP_CFG, scratch);
  return state;
}

function sendBatch(rm, room, player, cmds, now, epoch = player.moveEpoch) {
  return rm.handleInputBatch(room, player, { e: epoch, cmds }, now);
}

/** Sends `cmds` in batches of at most 32 (the per-batch cap) at the same instant. */
function sendBurst(rm, room, player, cmds, now) {
  let accepted = 0;
  for (let i = 0; i < cmds.length; i += 32) {
    accepted += sendBatch(rm, room, player, cmds.slice(i, i + 32), now).accepted;
  }
  return accepted;
}

function assertStateEqual(actual, expected, label = 'state') {
  for (const key of ['x', 'y', 'z', 'vx', 'vy', 'vz', 'onGround', 'isSliding', 'crouching', 'prone']) {
    assert.equal(actual[key], expected[key], `${label}.${key}: ${actual[key]} !== ${expected[key]}`);
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// (a) parity
// ---------------------------------------------------------------------------------------------------------------------

describe('input commands: server simulation parity', () => {
  it('ends at exactly the same state as a local stepCommand loop over the same inputs', () => {
    const { rm, emitted } = createServer();
    const { room, player } = join(rm, 'parity');
    const T0 = Date.now();
    teleport(rm, player, -30, 0.1, 20, T0);
    const start = structuredClone(player.moveState);

    const script = makeScript(420);
    const expected = simulateLocally(start, script);

    // A 60 Hz client against a 25 Hz server: commands trickle in with real time, batches are 33 ms apart
    let t = T0;
    let delivered = 0;
    for (let tick = 0; tick < 400 && player.lastProcessedSeq < script.length; tick++) {
      t += 40;
      const produced = Math.min(script.length, Math.floor((t - T0) / STEP_MS));
      if (produced > delivered) {
        sendBatch(rm, room, player, script.slice(Math.max(0, delivered - 3), produced), t);
        delivered = produced;
      }
      rm.processPlayerInputs(room, player, t);
    }

    assert.equal(player.lastProcessedSeq, script.length, 'every command was simulated');
    assertStateEqual(player.moveState, expected, 'server');
    // The legacy fields everything else reads are mirrored from the authoritative state
    assert.equal(player.x, expected.x);
    assert.equal(player.y, expected.y);
    assert.equal(player.z, expected.z);
    assert.equal(player.vx, expected.vx);
    assert.equal(player.crouching, expected.crouching);
    assert.equal(player.prone, expected.prone);
    assert.equal(player.yaw, script[script.length - 1].yaw);
    assert.equal(player.pitch, script[script.length - 1].pitch);
    assert.equal(player.isAiming, (script[script.length - 1].btn & BTN.AIM) !== 0);

    // The player really moved, jumped around and the lag-comp history was stamped with the server clock
    assert.ok(Math.hypot(player.x - start.x, player.z - start.z) > 5);
    assert.ok(player.positionHistory.length > 0);
    assert.ok(player.positionHistory.every((s) => s.timestamp >= T0 && s.timestamp <= t));

    // The owner got the final authoritative state
    const lastAck = emitted.filter((e) => e.event === 'moveAck').pop().payload;
    assert.deepEqual(lastAck, createMoveAck(expected, script.length, player.moveEpoch));
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// (b) speed hack / time credit, duplicates, order, garbage
// ---------------------------------------------------------------------------------------------------------------------

describe('input commands: anti-speedhack time credit', () => {
  it('a 10 s burst in one instant only advances the banked time credit', () => {
    const { rm } = createServer();
    const { room, player } = join(rm, 'burst');
    const T0 = Date.now();
    teleport(rm, player, -30, 0.1, 20, T0);
    const burst = Array.from({ length: 600 }, (_, i) => cmd(i + 1, { moveForward: 1, wantsSprint: true }));

    const accepted = sendBurst(rm, room, player, burst, T0 + 40);
    assert.ok(accepted <= INPUT_QUEUE_MAX, `queue bounded: accepted ${accepted}`);
    rm.processPlayerInputs(room, player, T0 + 40);
    assert.ok(player.lastProcessedSeq <= 3, `40 ms of real time buys <= 3 commands, got ${player.lastProcessedSeq}`);
    assert.ok(Math.hypot(player.x + 30, player.z - 20) < 0.5);

    // Keep flooding for one real second: simulated time must track real time, not the 10 s that was sent
    let t = T0 + 40;
    for (let i = 0; i < 25; i++) {
      t += 40;
      sendBurst(rm, room, player, burst, t);
      rm.processPlayerInputs(room, player, t);
    }
    const elapsed = (t - T0) / 1000;
    assert.ok(player.lastProcessedSeq <= Math.floor(elapsed * 60) + 1, `${player.lastProcessedSeq} cmds in ${elapsed}s`);
    assert.ok(player.lastProcessedSeq >= Math.floor(elapsed * 60) - 5, 'a legitimate rate is still served in full');
    const travelled = Math.hypot(player.x + 30, player.z - 20);
    assert.ok(travelled <= WEAPONS.rifle.moveSpeedMult * 8.5 * elapsed + 0.5, `travelled ${travelled} m in ${elapsed}s`);
    const honest = simulateLocally(createMoveStateAt(-30, 0.1, 20), burst.slice(0, player.lastProcessedSeq));
    assert.equal(player.x, honest.x);
    assert.equal(player.z, honest.z);
  });

  it('banks at most INPUT_CREDIT_CAP_S after a long idle period', () => {
    const { rm } = createServer();
    const { room, player } = join(rm, 'idle');
    const T0 = Date.now();
    teleport(rm, player, -30, 0.1, 20, T0);

    rm.processPlayerInputs(room, player, T0 + 10_000); // 10 s of silence
    const burst = Array.from({ length: 600 }, (_, i) => cmd(i + 1, { moveForward: 1 }));
    sendBurst(rm, room, player, burst, T0 + 10_000);
    rm.processPlayerInputs(room, player, T0 + 10_000);

    const max = Math.round(INPUT_CREDIT_CAP_S / FIXED_DT);
    assert.ok(player.lastProcessedSeq <= max + 1 && player.lastProcessedSeq >= max - 1,
      `expected ~${max} commands, got ${player.lastProcessedSeq}`);
  });

  it('ignores claimed time / dt fields: a command always costs exactly FIXED_DT', () => {
    const { rm } = createServer();
    const { room, player } = join(rm, 'dtclaim');
    const T0 = Date.now();
    teleport(rm, player, -30, 0.1, 20, T0);
    const cheat = Array.from({ length: 30 }, (_, i) => ({ ...cmd(i + 1, { moveForward: 1 }), dt: 1, t: 1e9, dtMs: 5000 }));
    sendBatch(rm, room, player, cheat, T0 + 100);
    rm.processPlayerInputs(room, player, T0 + 100);
    const honest = simulateLocally(createMoveStateAt(-30, 0.1, 20), cheat.slice(0, player.lastProcessedSeq).map((c) => sanitizeInputCommand(c)));
    assert.equal(player.z, honest.z);
    assert.ok(player.lastProcessedSeq <= 7);
  });

  it('drops duplicate, replayed, old and malformed commands; reorders out-of-order ones', () => {
    const { rm, emitted } = createServer();
    const { room, player } = join(rm, 'order');
    const T0 = Date.now();
    teleport(rm, player, -30, 0.1, 20, T0);
    const script = makeScript(40);
    let t = T0;

    // 1..5 delivered twice in the same batch (duplicates inside a batch) and processed
    sendBatch(rm, room, player, [...script.slice(0, 5), ...script.slice(0, 5)], t += 100);
    assert.equal(player.cmdQueue.length, 5, 'duplicates inside a batch are ignored');
    rm.processPlayerInputs(room, player, t);
    assert.equal(player.lastProcessedSeq, 5);
    const after5 = structuredClone(player.moveState);

    // Replaying old seqs changes nothing
    const accepted = sendBatch(rm, room, player, script.slice(0, 5), t += 100).accepted;
    assert.equal(accepted, 0);
    rm.processPlayerInputs(room, player, t);
    assert.equal(player.lastProcessedSeq, 5);
    assertStateEqual(player.moveState, after5, 'after replay of old commands');

    // Out of order inside one batch: processed strictly by seq
    sendBatch(rm, room, player, [script[7], script[5], script[6]], t += 100);
    rm.processPlayerInputs(room, player, t);
    assert.equal(player.lastProcessedSeq, 8);
    assertStateEqual(player.moveState, simulateLocally(createMoveStateAt(-30, 0.1, 20), script.slice(0, 8)), 'reordered');

    // Malformed commands are rejected without side effects
    const bad = [
      { ...script[8], seq: 1.5 },
      { ...script[8], seq: -3 },
      { ...script[8], seq: '9' },
      { ...script[8], mf: Infinity },
      { ...script[8], yaw: NaN },
      { ...script[8], pitch: 'up' },
      { ...script[8], btn: 'x' },
      { ...script[8], seq: 9 + 100_000 },
      null,
      'cmd',
      42
    ];
    assert.equal(sendBatch(rm, room, player, bad, t += 100).accepted, 0);
    // Out-of-range values are clamped, not trusted
    sendBatch(rm, room, player, [{ ...script[8], mf: 50, mr: -50, pitch: 99, lean: 7 }], t += 100);
    rm.processPlayerInputs(room, player, t);
    assert.equal(player.lastProcessedSeq, 9);
    assert.ok(player.pitch <= Math.PI / 2 && player.lean === 1);

    // Non-array / non-object batches are harmless
    assert.equal(rm.handleInputBatch(room, player, { e: player.moveEpoch, cmds: 'nope' }, t).accepted, 0);
    assert.equal(rm.handleInputBatch(room, player, null, t).accepted, 0);

    assert.equal(emitted.filter((e) => e.event === 'positionCorrection').length, 0);
  });

  it('waits briefly for a missing seq, then skips the hole; the late command is dropped as old', () => {
    const { rm } = createServer();
    const { room, player } = join(rm, 'gap');
    const T0 = Date.now();
    teleport(rm, player, -30, 0.1, 20, T0);
    const script = makeScript(30);
    let t = T0 + 100;
    sendBatch(rm, room, player, script.slice(0, 3), t);
    rm.processPlayerInputs(room, player, t);
    assert.equal(player.lastProcessedSeq, 3);

    t += 60;
    sendBatch(rm, room, player, [script[5]], t); // seq 6, seq 4 and 5 missing
    rm.processPlayerInputs(room, player, t);
    assert.equal(player.lastProcessedSeq, 3, 'held back while the hole may still be filled');
    t += INPUT_GAP_WAIT_MS + 10;
    rm.processPlayerInputs(room, player, t);
    assert.equal(player.lastProcessedSeq, 6, 'hole skipped after the grace period');
    assert.equal(sendBatch(rm, room, player, [script[3]], t).accepted, 0, 'late seq 4 is old');
  });
});

function createMoveStateAt(x, y, z) {
  // Same construction path as RoomManager.resetPlayerMovement (round trip through the ack encoding)
  const { rm } = createServer();
  const { player } = join(rm, 'ref');
  teleport(rm, player, x, y, z, Date.now());
  return structuredClone(player.moveState);
}

// ---------------------------------------------------------------------------------------------------------------------
// (c) collision / gravity, (d) no teleport
// ---------------------------------------------------------------------------------------------------------------------

describe('input commands: world rules are enforced by the server', () => {
  it('cannot walk through a wall (3.2 m high wall face at z = -23.25)', () => {
    const { rm } = createServer();
    const { room, player } = join(rm, 'wall');
    const T0 = Date.now();
    teleport(rm, player, -10, 0.1, -15, T0);
    // yaw = 0 faces -Z: sprint into the wall for 6 s of real time
    const run = Array.from({ length: 360 }, (_, i) => cmd(i + 1, { moveForward: 1, wantsSprint: true, yaw: 0 }));
    let t = T0;
    for (let i = 0; i < 160 && player.lastProcessedSeq < run.length; i++) {
      t += 40;
      sendBatch(rm, room, player, run.slice(player.lastProcessedSeq, player.lastProcessedSeq + 8), t);
      rm.processPlayerInputs(room, player, t);
    }
    assert.ok(player.lastProcessedSeq >= 300);
    assert.ok(player.z < -22, `reached the wall (z = ${player.z})`);
    assert.ok(player.z >= -23.25 + 0.45 - 1e-6, `stopped by the wall, z = ${player.z}`);
    assert.ok(player.y < 0.6, 'did not climb it');
  });

  it('cannot fly: holding jump for 10 s stays within the jump arc and returns to the ground', () => {
    const { rm } = createServer();
    const { room, player } = join(rm, 'fly');
    const T0 = Date.now();
    teleport(rm, player, -40, 0.1, 40, T0);
    let t = T0;
    let maxY = 0;
    for (let i = 0; i < 250; i++) {
      t += 40;
      const from = player.lastProcessedSeq;
      sendBatch(rm, room, player, Array.from({ length: 4 }, (_, k) => cmd(from + 1 + k, { wantsJump: true })), t);
      rm.processPlayerInputs(room, player, t);
      maxY = Math.max(maxY, player.y);
    }
    const apex = (MATCH_CONFIG.JUMP_FORCE ** 2) / (2 * MATCH_CONFIG.GRAVITY);
    assert.ok(maxY <= apex + 0.3, `max height ${maxY} vs apex ${apex}`);
    assert.ok(maxY > 0.5, 'jumping works');
  });

  it('commands carry no position: smuggled x/y/z/vx/dt fields are ignored', () => {
    const { rm } = createServer();
    const { room, player } = join(rm, 'tele');
    const T0 = Date.now();
    teleport(rm, player, -30, 0.1, 20, T0);
    const honestCmds = Array.from({ length: 20 }, (_, i) => cmd(i + 1, { moveForward: 1 }));
    const tampered = honestCmds.map((c) => ({ ...c, x: 500, y: 99, z: -500, vx: 80, vy: 80, vz: 80, pos: { x: 1, y: 2, z: 3 } }));
    assert.deepEqual(Object.keys(sanitizeInputCommand(tampered[0])).sort(), ['btn', 'lean', 'mf', 'mr', 'pitch', 'seq', 'w', 'yaw']);

    rm.handleInputBatch(room, player, { e: player.moveEpoch, cmds: tampered, x: 400, y: 50, z: 400 }, T0 + 200);
    rm.processPlayerInputs(room, player, T0 + 200);
    rm.processPlayerInputs(room, player, T0 + 400);
    assert.equal(player.lastProcessedSeq, 20);
    assertStateEqual(player.moveState, simulateLocally(createMoveStateAt(-30, 0.1, 20), honestCmds), 'tampered batch');
    assert.ok(Math.abs(player.x + 30) < 1 && Math.abs(player.z - 20) < 5);
  });

  it('the playerMove socket event is gone: no handler, no rate-limit entry; inputBatch is guarded', () => {
    const indexSrc = fs.readFileSync(path.join(ROOT_DIR, 'server/socketHandlers.js'), 'utf8');
    assert.ok(!/on\(\s*'playerMove'/.test(indexSrc), 'server/socketHandlers.js must not register playerMove');
    assert.match(indexSrc, /on\(\s*'inputBatch'/);
    assert.equal(RATE_LIMITS.playerMove, undefined);
    assert.deepEqual(RATE_LIMITS.inputBatch, { rate: 40, burst: 60 });
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// (g) dead players, (h) weapons, (i) ack routing, stale epoch
// ---------------------------------------------------------------------------------------------------------------------

describe('input commands: player state rules', () => {
  it('a dead player gets their commands acknowledged without moving', () => {
    const { rm, emitted } = createServer();
    const { room, player } = join(rm, 'dead');
    const T0 = Date.now();
    teleport(rm, player, -30, 0.1, 20, T0);
    player.alive = false;
    player.hp = 0;
    const before = structuredClone(player.moveState);
    sendBatch(rm, room, player, Array.from({ length: 10 }, (_, i) => cmd(i + 1, { moveForward: 1, wantsJump: true })), T0 + 400);
    emitted.length = 0;
    const simulated = rm.processPlayerInputs(room, player, T0 + 400);
    assert.equal(simulated, 0);
    assert.equal(player.lastProcessedSeq, 10, 'acked');
    assertStateEqual(player.moveState, before, 'dead');
    assert.equal(player.x, before.x);
    const acks = emitted.filter((e) => e.event === 'moveAck');
    assert.equal(acks.length, 1);
    assert.equal(acks[0].payload.seq, 10);
    assert.equal(acks[0].payload.x, before.x);
    assert.equal(player.cmdQueue.length, 0);
  });

  it('switches weapons only to loadout weapons, via command; movement speed follows the server-known weapon', () => {
    const { rm } = createServer();
    const { room, player } = join(rm, 'wep');
    const T0 = Date.now();
    teleport(rm, player, -30, 0.1, 20, T0);
    assert.deepEqual([player.loadout.primary, player.loadout.secondary], ['rifle', 'pistol']);
    let t = T0;
    let seq = 0;
    const play = (weapon, n = 3) => {
      t += 100;
      sendBatch(rm, room, player, Array.from({ length: n }, () => cmd(++seq, { weapon })), t);
      rm.processPlayerInputs(room, player, t);
    };

    play('pistol');
    assert.equal(player.weapon, 'pistol', 'secondary is allowed');
    player.ammoByWeapon.pistol = 5;
    play('sniper'); // not in the loadout
    assert.equal(player.weapon, 'pistol');
    play('definitely_not_a_weapon');
    assert.equal(player.weapon, 'pistol');
    play('knife');
    assert.equal(player.weapon, 'knife', 'melee is allowed');
    assert.equal(player.ammo, 1, 'ammo state follows the weapon switch');
    play('rifle');
    assert.equal(player.weapon, 'rifle');
    player.reloadingUntil = Date.now() + 5000;
    play('pistol');
    assert.equal(player.reloadingUntil, 0, 'switching cancels an unfinished reload');
    assert.equal(player.ammo, 5);

    // A command naming a forbidden weapon is simulated with the weapon the server knows (rifle/pistol multiplier)
    const mult = (id) => WEAPONS[id].moveSpeedMult || 1;
    const fresh = join(rm, 'wep2', 'NET002');
    teleport(rm, fresh.player, -30, 0.1, 20, T0);
    sendBatch(rm, fresh.room, fresh.player, Array.from({ length: 12 }, (_, i) => cmd(i + 1, { moveForward: 1, weapon: 'sniper' })), T0 + 500);
    rm.processPlayerInputs(fresh.room, fresh.player, T0 + 500);
    const expected = simulateLocally(createMoveStateAt(-30, 0.1, 20), Array.from({ length: 12 }, (_, i) => cmd(i + 1, { moveForward: 1, weapon: fresh.player.weapon })));
    assert.equal(fresh.player.z, expected.z);
    assert.notEqual(mult('sniper'), mult(fresh.player.weapon), 'sanity: the multipliers differ, so the test is meaningful');
  });

  it('moveAck goes only to the owner socket-id room, never to the match room', () => {
    const { rm, emitted } = createServer();
    const a = join(rm, 'sock-A', 'NET003');
    const b = join(rm, 'sock-B', 'NET003');
    const T0 = Date.now();
    teleport(rm, a.player, -30, 0.1, 20, T0);
    teleport(rm, b.player, 30, 0.1, -20, T0);
    emitted.length = 0;

    sendBatch(rm, a.room, a.player, [cmd(1, { moveForward: 1 }), cmd(2, { moveForward: 1 })], T0 + 100);
    sendBatch(rm, b.room, b.player, [cmd(1, { moveRight: 1 })], T0 + 100);
    rm.tick(0.04);
    rm.processPlayerInputs(a.room, a.player, T0 + 140);
    rm.processPlayerInputs(b.room, b.player, T0 + 140);
    rm.respawnPlayer(a.room, a.player); // epoch change ack

    const acks = emitted.filter((e) => e.event === 'moveAck');
    assert.ok(acks.length >= 3);
    for (const ack of acks) {
      assert.ok(ack.to === 'sock-A' || ack.to === 'sock-B', `ack routed to ${ack.to}`);
      assert.notEqual(ack.to, 'NET003', 'never broadcast to the match room');
    }
    assert.ok(acks.filter((e) => e.to === 'sock-A').every((e) => e.payload.x !== undefined));
    assert.ok(acks.some((e) => e.to === 'sock-B' && e.volatile), 'regular acks are volatile');
    assert.ok(acks.some((e) => e.to === 'sock-A' && !e.volatile && e.payload.epoch === a.player.moveEpoch), 'epoch acks are reliable');
    // Nothing movement-related leaks into room broadcasts besides the normal state
    assert.equal(emitted.filter((e) => e.to === 'NET003' && e.event === 'moveAck').length, 0);
  });

  it('commands tagged with a stale epoch are discarded after a respawn / teleport and answered with a resync ack', () => {
    const { rm, emitted } = createServer();
    const { room, player } = join(rm, 'epoch');
    const T0 = Date.now();
    teleport(rm, player, -30, 0.1, 20, T0);
    const oldEpoch = player.moveEpoch;
    sendBatch(rm, room, player, makeScript(10), T0 + 200);
    rm.processPlayerInputs(room, player, T0 + 200);
    assert.equal(player.lastProcessedSeq, 10);
    sendBatch(rm, room, player, makeScript(5, 11), T0 + 210); // queued, not simulated yet (no credit)
    assert.ok(player.cmdQueue.length > 0);

    player.alive = false;
    rm.respawnPlayer(room, player);
    assert.equal(player.moveEpoch, oldEpoch + 1);
    assert.equal(player.cmdQueue.length, 0, 'queued commands of the old epoch are void');
    const spawn = { x: player.x, y: player.y, z: player.z };
    emitted.length = 0;

    const res = sendBatch(rm, room, player, makeScript(8, 16), T0 + 400, oldEpoch);
    assert.equal(res.stale, true);
    assert.equal(res.accepted, 0);
    rm.processPlayerInputs(room, player, T0 + 450);
    assert.deepEqual({ x: player.x, y: player.y, z: player.z }, spawn, 'stale commands did not move the player');
    const resync = emitted.filter((e) => e.event === 'moveAck');
    assert.equal(resync.length, 1);
    assert.equal(resync[0].payload.epoch, player.moveEpoch);
    // Throttled: a flood of stale batches does not become an ack flood
    for (let i = 0; i < 20; i++) sendBatch(rm, room, player, makeScript(1, 30 + i), T0 + 450 + i, oldEpoch);
    assert.ok(emitted.filter((e) => e.event === 'moveAck').length <= 2);

    // New epoch commands are accepted even though the client's seqs skipped ahead
    const ok = sendBatch(rm, room, player, makeScript(6, 40), T0 + 700);
    assert.equal(ok.accepted, 6);
    rm.processPlayerInputs(room, player, T0 + 700);
    assert.equal(player.lastProcessedSeq, 45);
  });

  it('treats any other server-side write to player.x/y/z as a teleport (new epoch, resync ack)', () => {
    const { rm, emitted } = createServer();
    const { room, player } = join(rm, 'ext');
    const T0 = Date.now();
    teleport(rm, player, -30, 0.1, 20, T0);
    const epoch = player.moveEpoch;
    player.x = 12.5; // e.g. a future server feature / test setup moves the player directly
    emitted.length = 0;
    rm.processPlayerInputs(room, player, T0 + 40);
    assert.equal(player.moveEpoch, epoch + 1);
    assert.equal(player.moveState.x, 12.5);
    assert.ok(emitted.some((e) => e.event === 'moveAck' && e.payload.epoch === epoch + 1));
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// Headless client <-> RoomManager simulation (real Game3D)
// ---------------------------------------------------------------------------------------------------------------------

async function createNetSim({ latencyMs = 50, dropBatch = () => false, start = { x: -30, y: 0.1, z: 40 } } = {}) {
  const realPerfNow = performance.now;
  const toClient = [];
  const toServer = [];
  let serverNow = 0;
  let batchCount = 0;
  const wire = (obj) => JSON.parse(JSON.stringify(obj)); // everything crosses the "network" as JSON

  const server = createServer((entry) => {
    if (entry.event === 'moveAck' && entry.to === 'sim-player') {
      toClient.push({ at: serverNow + latencyMs, ack: wire(entry.payload) });
    }
  });
  const { rm } = server;
  const { room, player } = join(rm, 'sim-player', 'SIM001');

  const base = Date.now();
  serverNow = base;
  let clockMs = base;
  performance.now = () => clockMs - base + 50_000;
  player.lastCreditAt = base;

  const game = await createTestGame3D({
    onInputBatch: (batch) => {
      batchCount += 1;
      if (dropBatch(batchCount)) return;
      toServer.push({ at: clockMs + latencyMs, batch: wire(batch) });
    }
  });
  game.inMatch = true;
  game.alive = true;
  game.isPointerLocked = true;
  game.localId = player.id;
  if (game.currentMapConfig?.id !== room.mapId) game.loadMap(room.mapId);
  // Known open ground, facing -Z (the server's random spawn point could sit next to a wall)
  teleport(rm, player, start.x, start.y, start.z, base);
  player.yaw = 0;
  game.resetNetcode(player.moveEpoch);
  game.spawnLocalPlayer({ x: player.x, y: player.y, z: player.z, yaw: 0, weapon: player.weapon, loadout: player.loadout });
  game.equipUntil = 0;

  const processed = [];
  const origApply = rm.applyInputCommand.bind(rm);
  rm.applyInputCommand = (p, c, m) => {
    processed.push(c.seq);
    return origApply(p, c, m);
  };

  let nextServerTick = base + 40;
  const staleBatches = { count: 0 };
  const cameraTrace = [];

  const sim = {
    rm, room, player, game, server, processed, cameraTrace, staleBatches,
    get now() { return clockMs; },
    frame() {
      clockMs += STEP_MS;
      // deliveries
      toServer.sort((a, b) => a.at - b.at);
      while (toServer.length && toServer[0].at <= clockMs) {
        const m = toServer.shift();
        serverNow = m.at;
        const r = rm.handleInputBatch(room, player, m.batch, m.at);
        if (r.stale) staleBatches.count += 1;
      }
      while (nextServerTick <= clockMs) {
        serverNow = nextServerTick;
        rm.processPlayerInputs(room, player, nextServerTick);
        nextServerTick += 40;
      }
      serverNow = clockMs;
      toClient.sort((a, b) => a.at - b.at);
      while (toClient.length && toClient[0].at <= clockMs) {
        game.applyMoveAck(toClient.shift().ack);
      }
      game.advanceFixedPhysics(STEP_MS / 1000);
      game.updateLocalPhysics(STEP_MS / 1000);
      cameraTrace.push({ x: game.camera.position.x, y: game.camera.position.y, z: game.camera.position.z });
    },
    run(frames) {
      for (let i = 0; i < frames; i++) sim.frame();
    },
    /** Mirrors what main.js does on `playerRespawned`. */
    deliverRespawn() {
      game.spawnLocalPlayer({
        x: player.x, y: player.y, z: player.z, yaw: player.yaw, weapon: player.weapon, loadout: player.loadout
      });
    },
    dispose() {
      performance.now = realPerfNow;
    }
  };
  return sim;
}

describe('client prediction + reconciliation (headless Game3D <-> RoomManager, 50 ms one-way latency)', () => {
  it('stays in sync without any correction while nothing interferes', async () => {
    const sim = await createNetSim();
    try {
      const { game, player } = sim;
      game.keys.KeyW = true;
      sim.run(60);
      game.keys.KeyD = true;
      game.keys.Space = true;
      sim.run(10);
      game.keys.Space = false;
      sim.run(90);
      game.keys.ShiftLeft = true;
      sim.run(60);

      assert.ok(game.prediction.stats.acks > 20);
      assert.equal(game.prediction.stats.replays, 0, 'prediction == server, so no reconciliation was ever needed');
      assert.ok(game.prediction.stats.lastError < RECONCILE_EPSILON);
      assert.ok(player.lastProcessedSeq > 150);
      assert.ok(game.prediction.pending.length < 20, 'acked commands are dropped from the history');
      assert.ok(Math.hypot(game.position.x - player.x, game.position.z - player.z) < 3, 'client leads the server by the in-flight commands only');
      // The old per-frame position packet is gone from the client API
      assert.equal(typeof game.callbacks.onMoveUpdate, 'undefined');
    } finally {
      sim.dispose();
    }
  });

  it('server-side correction: replays the unacked commands, converges, and the camera never jumps', async () => {
    const sim = await createNetSim();
    try {
      const { game, player } = sim;
      game.keys.KeyW = true;
      sim.run(120);
      assert.equal(game.prediction.stats.replays, 0);
      assert.ok(game.position.z < 40 - 8, 'walked -Z along open ground');

      // The server pushes the player 1 m sideways (no epoch change: a plain authoritative correction)
      player.moveState.x += 1;
      player.x = player.moveState.x;
      sim.rm._markMoveSynced(player);

      const traceStart = sim.cameraTrace.length;
      sim.run(45);
      const trace = sim.cameraTrace.slice(traceStart - 1);
      const dt = STEP_MS / 1000;
      const smoothingStep = 1 * (1 - Math.exp(-CORRECTION_DECAY_RATE * dt));
      let maxStepX = 0;
      let totalX = 0;
      for (let i = 1; i < trace.length; i++) {
        const dx = trace[i].x - trace[i - 1].x;
        maxStepX = Math.max(maxStepX, Math.abs(dx));
        totalX += dx;
      }
      assert.ok(game.prediction.stats.replays >= 1, 'a replay happened');
      assert.ok(game.prediction.stats.replays <= 2, `converged after ${game.prediction.stats.replays} replays`);
      assert.equal(game.prediction.stats.hardSnaps, 0);
      // Movement is along -Z (yaw 0), so every X change of the camera is the correction: smooth, never the full 1 m
      assert.ok(maxStepX <= smoothingStep + 1e-3, `camera X step ${maxStepX} > smoothing step ${smoothingStep}`);
      assert.ok(Math.abs(totalX - 1) < 0.05, `the camera follows the 1 m correction (${totalX})`);

      // Settle: stop and let every ack arrive
      game.keys.KeyW = false;
      sim.run(40);
      const err = Math.hypot(game.position.x - player.x, game.position.y - player.y, game.position.z - player.z);
      assert.ok(err < RECONCILE_EPSILON, `client converged to the server state, error ${err}`);
      assert.ok(Math.abs(game.prediction.offset.x) < 1e-3 && Math.abs(game.prediction.offset.z) < 1e-3, 'visual offset decayed');
    } finally {
      sim.dispose();
    }
  });

  it('a huge correction (> 2 m) hard-snaps instead of smoothing', async () => {
    const sim = await createNetSim();
    try {
      const { game, player } = sim;
      sim.run(30);
      player.moveState.x += 6;
      player.x = player.moveState.x;
      sim.rm._markMoveSynced(player);
      sim.run(15);
      assert.equal(game.prediction.stats.hardSnaps, 1);
      assert.equal(game.prediction.offset.x, 0);
      assert.ok(Math.abs(game.position.x - player.x) < RECONCILE_EPSILON);
    } finally {
      sim.dispose();
    }
  });

  it('respawn bumps the epoch: stale commands are dropped, the client snaps and clears its history', async () => {
    const sim = await createNetSim();
    try {
      const { game, player, rm, room } = sim;
      game.keys.KeyW = true;
      sim.run(90);
      const oldEpoch = player.moveEpoch;
      assert.equal(game.prediction.epoch, oldEpoch);

      player.alive = false;
      rm.respawnPlayer(room, player);
      sim.deliverRespawn(); // playerRespawned broadcast (same instant as the ack, before it arrives)
      const spawn = { x: player.x, y: player.y, z: player.z };
      assert.equal(player.moveEpoch, oldEpoch + 1);

      // Until the ack arrives (50 ms) the client keeps sending old-epoch batches: the server drops them
      sim.run(12);
      assert.ok(sim.staleBatches.count >= 1, 'old-epoch batches were rejected');
      sim.run(30);
      assert.equal(game.prediction.epoch, oldEpoch + 1, 'client adopted the new epoch from the ack');
      assert.equal(game.prediction.stats.epochSnaps, 1);
      assert.ok(game.prediction.pending.length < 30);

      // Keep playing in the new epoch; client and server agree again and nothing was applied from the stale epoch
      sim.run(60);
      assert.equal(game.prediction.stats.replays, 0);
      const dist = Math.hypot(player.x - spawn.x, player.z - spawn.z);
      assert.ok(dist > 1, 'new-epoch commands move the player');
      assert.ok(Math.hypot(game.position.x - player.x, game.position.z - player.z) < 3);
    } finally {
      sim.dispose();
    }
  });

  it('Wi-Fi LAN burst packet loss (4 consecutive batches dropped) & PointerLock mouse spike filtering prevent rubberbanding and aim flicks', async () => {
    const sim = await createNetSim({ dropBatch: (n) => (n % 6) >= 1 && (n % 6) <= 4 });
    try {
      const { game, player, processed } = sim;
      game.requestPointerLock();
      game.yaw = 0;
      game.pitch = 0;

      // 1. Initial PointerLock recenter jump (>120px) must be ignored completely
      globalThis.window.dispatchEvent({ type: 'mousemove', movementX: 480, movementY: -320 });
      assert.equal(game.yaw, 0, 'Initial PointerLock cursor-recenter jump must not flick yaw');
      assert.equal(game.pitch, 0, 'Initial PointerLock cursor-recenter jump must not flick pitch');

      // 2. Normal mouse movements establish moving average, then a sudden 600px OS spike is clamped smoothly
      for (let i = 0; i < 5; i++) {
        globalThis.window.dispatchEvent({ type: 'mousemove', movementX: 10, movementY: 0 });
      }
      const yawBeforeSpike = game.yaw;
      globalThis.window.dispatchEvent({ type: 'mousemove', movementX: 600, movementY: 0 });
      const spikeDeltaYaw = Math.abs(game.yaw - yawBeforeSpike);
      assert.ok(spikeDeltaYaw < 0.25, `Extreme 600px mouse spike must be clamped (<0.25 rad, got ${spikeDeltaYaw})`);

      // 3. Run, jump, and sprint across 4-batch burst packet drops: zero sequence gaps and zero backward teleports
      game.keys.KeyW = true;
      game.keys.ShiftLeft = true;
      sim.run(50);
      game.keys.Space = true;
      sim.run(6);
      game.keys.Space = false;
      sim.run(70);
      game.keys.KeyW = false;
      game.keys.ShiftLeft = false;
      sim.run(60);

      assert.ok(processed.length > 150);
      for (let i = 1; i < processed.length; i++) {
        assert.equal(processed[i], processed[i - 1] + 1, `server skipped from ${processed[i - 1]} to ${processed[i]}`);
      }
      assert.equal(game.prediction.stats.replays, 0, 'burst packet loss recovered via INPUT_REDUNDANCY with 0 replays');
      assert.equal(game.prediction.stats.hardSnaps, 0, 'zero backward hard-snaps');
      assert.ok(Math.hypot(game.position.x - player.x, game.position.z - player.z) < RECONCILE_EPSILON);
    } finally {
      sim.dispose();
    }
  });

  it('packet loss: with every other batch dropped, redundancy still delivers every command in order', async () => {
    const sim = await createNetSim({ dropBatch: (n) => n % 2 === 0 });
    try {
      const { game, player, processed } = sim;
      game.keys.KeyW = true;
      sim.run(40);
      game.keys.KeyD = true;
      sim.run(40);
      game.keys.Space = true;
      sim.run(6);
      game.keys.Space = false;
      game.keys.KeyD = false;
      sim.run(60);
      game.keys.KeyW = false;
      sim.run(60);

      assert.ok(processed.length > 200);
      for (let i = 1; i < processed.length; i++) {
        assert.equal(processed[i], processed[i - 1] + 1, `server skipped from ${processed[i - 1]} to ${processed[i]}`);
      }
      assert.equal(game.prediction.stats.replays, 0, 'identical simulation => no reconciliation needed');
      assert.ok(game.prediction.nextSeq - player.lastProcessedSeq <= 12, 'server keeps up with the client');
      const err = Math.hypot(game.position.x - player.x, game.position.z - player.z);
      assert.ok(err < RECONCILE_EPSILON, `idle client and server agree (${err})`);
    } finally {
      sim.dispose();
    }
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// Live: real server/index.js + WebSocket
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
        if (m[1] !== '' && event === 'latencyProbe') ws.send(`43${m[1]}${JSON.stringify([payload])}`); // answer the RTT probe
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

describe('live server: inputBatch -> moveAck over a real Socket.IO connection', () => {
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
        // not up yet
      }
      if (exited || Date.now() > deadline) throw new Error('server did not start');
      await new Promise((r) => setTimeout(r, 100));
    }
  });

  after(() => {
    if (child && !exited) child.kill();
  });

  it('simulates commands on the server tick and acks them to the sender only; positions are never accepted', async () => {
    const a = await connectClient(port);
    const b = await connectClient(port);
    try {
      a.emit('joinRoom', { name: 'AckA', mode: 'private', mapId: MAP_ID });
      const joinedA = await a.waitFor('roomJoined');
      assert.ok(Number.isInteger(joinedA.player.moveEpoch));
      b.emit('joinRoom', { name: 'AckB', roomCode: joinedA.roomCode, mode: 'private', mapId: MAP_ID });
      await b.waitFor('roomJoined');

      const epoch = joinedA.player.moveEpoch;
      const start = { x: joinedA.player.x, z: joinedA.player.z };
      let seq = 0;
      // ~1.2 s of forward input at 60 cmds/s, 2 commands per ~33 ms batch, with the old position fields smuggled in
      for (let i = 0; i < 36; i++) {
        const cmds = [cmd(++seq, { moveForward: 1, yaw: joinedA.player.yaw }), cmd(++seq, { moveForward: 1, yaw: joinedA.player.yaw })]
          .map((c) => ({ ...c, x: 9999, y: 9999, z: 9999 }));
        a.emit('inputBatch', { e: epoch, cmds, x: 9999, y: 9999, z: 9999 });
        await new Promise((r) => setTimeout(r, 33));
      }
      await new Promise((r) => setTimeout(r, 250));

      const acks = a.log.filter((m) => m.event === 'moveAck').map((m) => m.payload);
      assert.ok(acks.length >= 10, `received ${acks.length} acks`);
      const aStates = a.log.filter((m) => m.event === 'stateUpdate');
      assert.ok(aStates.length >= acks.length, `moving player A also receives stateUpdate on ticks with moveAck (${aStates.length} >= ${acks.length})`);
      for (let i = 1; i < acks.length; i++) assert.ok(acks[i].seq >= acks[i - 1].seq);
      const last = acks[acks.length - 1];
      assert.equal(last.epoch, epoch);
      assert.ok(last.seq >= 40, `server simulated ${last.seq} commands`);
      assert.ok(Math.hypot(last.x - start.x, last.z - start.z) > 1, 'the player moved');
      assert.ok(Math.abs(last.x) < 70 && Math.abs(last.z) < 70 && last.y < 3, 'smuggled positions were ignored');
      assert.equal(a.log.filter((m) => m.event === 'positionCorrection').length, 0);

      assert.equal(b.log.filter((m) => m.event === 'moveAck').length, 0, 'other players never see someone else\'s ack');
      const state = b.log.filter((m) => m.event === 'stateUpdate').pop()?.payload;
      const me = state?.players.find((p) => p.id === joinedA.playerId);
      assert.ok(me, 'the other player sees A in stateUpdate');
      assert.ok(Math.abs(me.x - last.x) < 4 && Math.abs(me.z - last.z) < 4, 'remote view follows the server-simulated position');

      // A flood of garbage does not break anything
      a.emit('inputBatch', { e: epoch, cmds: Array.from({ length: 500 }, () => ({ seq: 'x' })) });
      a.emit('inputBatch', 'not an object');
      await new Promise((r) => setTimeout(r, 120));
      assert.equal(exited, false);
      assert.equal((await fetch(`http://127.0.0.1:${port}/healthz`)).status, 200);
    } finally {
      a.close();
      b.close();
    }
  });
});
