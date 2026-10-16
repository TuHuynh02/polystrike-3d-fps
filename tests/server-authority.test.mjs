/**
 * Server-authority tests: the server must not trust movement, aim, hit zones, loadout, weapon choice
 * or host-only actions claimed by a client. Each block first proves the exploit is rejected, then
 * proves the legitimate behaviour still works.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getMapConfig, hasLineOfSight, WEAPONS } from '../shared/constants.js';
import {
  MOVE_BUDGET_CAP_XZ,
  MOVE_MAX_SPEED,
  RoomManager
} from '../server/roomManager.js';

const MAP_ID = 'cyber_citadel';

function createHarness() {
  const emitted = [];
  const io = {
    to: (code) => ({
      emit: (event, payload) => emitted.push({ code, event, payload }),
      volatile: { emit: (event, payload) => emitted.push({ code, event, payload }) }
    })
  };
  const rm = new RoomManager(io);
  clearInterval(rm.tickInterval); // tests drive the room explicitly
  rm.tickInterval = null;
  return { rm, emitted };
}

function join(rm, id, roomCode = 'AUTH01', extra = {}) {
  const res = rm.addHumanPlayer({ id }, { name: id, roomCode, mode: 'private', botCount: 0, mapId: MAP_ID, ...extra });
  assert.ok(!res.error, `join failed: ${res.error}`);
  res.player.invulnerableUntil = 0;
  return res;
}

// Server-side placement (like a spawn): movement packets are speed limited, setup must not be.
function place(player, x, y, z) {
  player.x = x;
  player.y = y;
  player.z = z;
  player.moveBudgetXZ = undefined;
  player.moveBudgetUp = undefined;
  player.moveBudgetDown = undefined;
  player.lastPosAt = undefined;
  player.positionHistory = []; // teleport: lag-comp history must not keep the old spot
}

function normalize(x, y, z) {
  const len = Math.hypot(x, y, z);
  return { x: x / len, y: y / len, z: z / len };
}

/** Finds an open-ground pair (shooter, target) `gap` metres apart along +X that either can or cannot see each other. */
function findPair(gap, wantLos) {
  const obstacles = getMapConfig(MAP_ID).obstacles;
  for (let z = -40; z <= 40; z += 2) {
    for (let x = -50; x + gap <= 50; x += 2) {
      const eye = { x, y: 1.62, z };
      const heads = [1.76, 1.35, 0.78].map((y) => ({ x: x + gap, y, z }));
      const sees = heads.map((h) => hasLineOfSight(eye, h, obstacles));
      if (wantLos && sees.every(Boolean)) return { a: { x, z }, b: { x: x + gap, z } };
      if (!wantLos && sees.every((v) => !v)) return { a: { x, z }, b: { x: x + gap, z } };
    }
  }
  throw new Error(`no ${wantLos ? 'clear' : 'blocked'} pair found on ${MAP_ID}`);
}

function duel(rm, gap = 40, wantLos = true) {
  const { room, player: shooter } = join(rm, 'shooter');
  const { player: target } = join(rm, 'target');
  const pair = findPair(gap, wantLos);
  const reset = () => {
    place(shooter, pair.a.x, 0, pair.a.z);
    place(target, pair.b.x, 0, pair.b.z);
    target.hp = 100;
    target.alive = true;
    target.invulnerableUntil = 0;
    shooter.invulnerableUntil = 0;
    shooter.lastShotAt = 0;
    shooter.weapon = 'rifle';
    shooter.ammo = 30;
    shooter.ammoByWeapon.rifle = 30;
    shooter.reloadingUntil = 0;
    shooter.lean = 0;
    shooter.crouching = false;
    shooter.prone = false;
    shooter.yaw = 0;
  };
  reset();
  const eye = () => ({ x: shooter.x, y: shooter.y + 1.62, z: shooter.z });
  // Fires at an aim point `aimY` metres above the target's feet (+ optional lateral miss in Z)
  const fireAt = (aimY, extra = {}, lateral = 0) => {
    const e = eye();
    const dir = normalize(target.x - e.x, aimY - e.y, target.z + lateral - e.z);
    rm.handleShoot(room, shooter, { weapon: 'rifle', origin: e, dir, targetId: target.id, ...extra });
    return 100 - target.hp;
  };
  return { room, shooter, target, reset, eye, fireAt };
}

describe('Movement is validated on the server', () => {
  it('rejects a 100 m teleport / fly-hack and tells the client to snap back', () => {
    const { rm, emitted } = createHarness();
    const { room, player } = join(rm, 'mover');
    place(player, 0, 0, 0);

    rm.handlePlayerMove(room, player, { x: 100, y: 17, z: 100, seq: 1 });

    assert.equal(player.x, 0);
    assert.equal(player.y, 0);
    assert.equal(player.z, 0);
    const corr = emitted.find((e) => e.event === 'positionCorrection');
    assert.ok(corr, 'positionCorrection must be emitted');
    assert.equal(corr.payload.playerId, player.id);
    assert.equal(corr.payload.x, 0);
  });

  it('accepts normal walking at game speed', () => {
    const { rm } = createHarness();
    const { room, player } = join(rm, 'walker');
    place(player, 0, 0, 0);
    // 6.2 m/s walk, 25 Hz packets, ~2 s of movement, packets spread over real server time
    for (let i = 1; i <= 50; i++) {
      player.lastPosAt = Date.now() - 40; // pretend 40 ms passed since the previous packet
      rm.handlePlayerMove(room, player, { x: i * 0.25, y: 0, z: 0, seq: i });
    }
    assert.ok(Math.abs(player.x - 12.5) < 1e-9, `walker should reach 12.5 m, got ${player.x}`);
  });

  it('does not let a packet flood outrun the speed limit', () => {
    const { rm } = createHarness();
    const { room, player } = join(rm, 'flooder');
    place(player, 0, 0, 0);
    // 400 packets back to back, each asking for 0.5 m (would be 200 m if unlimited)
    for (let i = 1; i <= 400; i++) {
      rm.handlePlayerMove(room, player, { x: Math.min(54, i * 0.5), y: 0, z: 0, seq: i });
    }
    assert.ok(
      player.x <= MOVE_BUDGET_CAP_XZ + MOVE_MAX_SPEED * 0.5 + 1e-6,
      `flood moved ${player.x.toFixed(1)} m in ~0 s, cap is ${MOVE_BUDGET_CAP_XZ.toFixed(1)} m`
    );
  });

  it('refills the movement budget with server time (a lagging client can catch up)', () => {
    const { rm } = createHarness();
    const { room, player } = join(rm, 'lagger');
    place(player, 0, 0, 0);
    rm.handlePlayerMove(room, player, { x: 18, y: 0, z: 0, seq: 1 }); // drains the starting budget
    rm.handlePlayerMove(room, player, { x: 30, y: 0, z: 0, seq: 2 }); // too far right now
    assert.ok(player.x <= 18.0001);

    player.lastPosAt = Date.now() - 1000; // one second later on the server clock
    rm.handlePlayerMove(room, player, { x: 30, y: 0, z: 0, seq: 3 });
    assert.equal(player.x, 30);
  });

  it('limits upward speed but still allows falling', () => {
    const { rm } = createHarness();
    const { room, player } = join(rm, 'climber');
    place(player, 0, 0, 0);
    rm.handlePlayerMove(room, player, { x: 0, y: 12, z: 0, seq: 1 });
    assert.equal(player.y, 0, 'instant +12 m climb must be rejected');

    place(player, 0, 10, 0);
    rm.handlePlayerMove(room, player, { x: 0, y: 0, z: 0, seq: 2 });
    assert.equal(player.y, 0, 'falling 10 m is fine');
  });

  it('still applies yaw/pitch/stance from a packet whose position was rejected', () => {
    const { rm } = createHarness();
    const { room, player } = join(rm, 'turner');
    place(player, 0, 0, 0);
    rm.handlePlayerMove(room, player, { x: 90, y: 0, z: 0, yaw: 1.5, crouching: true, seq: 1 });
    assert.equal(player.x, 0);
    assert.equal(player.yaw, 1.5);
    assert.equal(player.crouching, true);
  });

  it('restarts the movement budget after a server respawn', () => {
    const { rm } = createHarness();
    const { room, player } = join(rm, 'respawner');
    place(player, 0, 0, 0);
    rm.handlePlayerMove(room, player, { x: 18, y: 0, z: 0, seq: 1 });
    rm.respawnPlayer(room, player);
    assert.equal(player.moveBudgetXZ, undefined);
    assert.equal(player.lastPosAt, undefined);
  });
});

describe('Shots must lie on the shooter\'s aim ray', () => {
  it('baseline: an accurate shot with clear line of sight hurts the target', () => {
    const { rm } = createHarness();
    const { fireAt } = duel(rm);
    assert.ok(fireAt(1.0) > 0);
  });

  it('ignores a shot with no aim direction (previously a hit from anywhere in line of sight)', () => {
    const { rm } = createHarness();
    const { shooter, target, room, eye } = duel(rm);
    rm.handleShoot(room, shooter, { weapon: 'rifle', origin: eye(), targetId: target.id, isHeadshot: true });
    assert.equal(target.hp, 100);
    assert.equal(shooter.ammo, 30, 'invalid shots must not even consume ammo');
  });

  it('ignores a shot with a zero / NaN direction', () => {
    const { rm } = createHarness();
    const { shooter, target, room, eye } = duel(rm);
    rm.handleShoot(room, shooter, { weapon: 'rifle', origin: eye(), dir: { x: 0, y: 0, z: 0 }, targetId: target.id });
    rm.handleShoot(room, shooter, { weapon: 'rifle', origin: eye(), dir: { x: NaN, y: 0, z: 1 }, targetId: target.id });
    assert.equal(target.hp, 100);
  });

  it('rejects a claimed hit when the aim ray points away from the target', () => {
    const { rm } = createHarness();
    const { shooter, target, room, eye } = duel(rm);
    rm.handleShoot(room, shooter, {
      weapon: 'rifle',
      origin: eye(),
      dir: { x: -1, y: 0, z: 0 },
      targetId: target.id,
      isHeadshot: true
    });
    assert.equal(target.hp, 100);
  });

  it('rejects a hit claimed 4 m off the target at 40 m (old tolerance was >= 1.45 m radius + cone)', () => {
    const { rm } = createHarness();
    const { fireAt } = duel(rm, 40);
    assert.equal(fireAt(1.0, { isHeadshot: true }, 4), 0);
  });

  it('rejects melee hit claims that are not on the aim ray (melee used to skip the check)', () => {
    const { rm } = createHarness();
    const { room, shooter, target } = duel(rm, 2.5);
    shooter.weapon = 'knife';
    // Face the opposite way but claim a stab
    rm.handleShoot(room, shooter, {
      weapon: 'knife',
      origin: { x: shooter.x, y: 1.62, z: shooter.z },
      dir: { x: -1, y: 0, z: 0 },
      targetId: target.id
    });
    assert.equal(target.hp, 100);
  });

  it('does not damage a target behind a wall even with an accurate ray', () => {
    const { rm } = createHarness();
    const { fireAt } = duel(rm, 12, false);
    assert.equal(fireAt(1.0), 0);
  });

  it('replaces a spoofed muzzle origin with the server-side eye position in the broadcast', () => {
    const { rm, emitted } = createHarness();
    const { room, shooter, target } = duel(rm);
    rm.handleShoot(room, shooter, {
      weapon: 'rifle',
      origin: { x: target.x - 1, y: 1.6, z: target.z }, // 39 m ahead of the shooter, next to the target
      dir: normalize(1, 0, 0),
      targetId: target.id
    });
    const shot = emitted.find((e) => e.event === 'shotFired');
    assert.ok(shot);
    assert.ok(Math.abs(shot.payload.origin.x - shooter.x) < 0.01, 'origin must be the shooter\'s server eye');
  });

  it('takes the headshot flag from the server hitbox, not from the client', () => {
    const { rm } = createHarness();
    const { reset, fireAt } = duel(rm, 20);

    const body = fireAt(1.0);
    reset();
    const legPlain = fireAt(0.3, { isHeadshot: false });
    reset();
    const faked = fireAt(0.3, { isHeadshot: true }); // aimed at the legs, claims a headshot
    reset();
    const real = fireAt(1.68, { isHeadshot: false }); // actually aimed at the head, even without the flag

    assert.ok(body > 0);
    // The server decides the zone from its own part hit: a ray at the shins is a leg hit (0.78x), never a headshot.
    assert.equal(faked, legPlain, 'client isHeadshot flag has zero effect on server damage');
    assert.equal(faked, Math.round(body * 0.78), 'a headshot claim on a leg ray must be paid as a leg hit');
    assert.ok(faked < body, 'a headshot claim must never raise the damage of a leg/body ray');
    assert.ok(real > body, `genuine headshot (${real}) must outdamage a body shot (${body})`);
  });

  it('server-side raycast still scores a hit when the client sends no hit claims', () => {
    const { rm } = createHarness();
    const { room, shooter, target, eye, reset } = duel(rm);
    reset();
    const e = eye();
    rm.handleShoot(room, shooter, { weapon: 'rifle', origin: e, dir: normalize(target.x - e.x, 1.0 - e.y, target.z - e.z) });
    assert.ok(target.hp < 100);
  });
});

describe('Loadout and weapon choice are enforced', () => {
  it('does not refill ammo or swap gear when updateLoadout is spammed mid-life', () => {
    const { rm } = createHarness();
    const { room, player } = join(rm, 'refiller');
    player.invulnerableUntil = 0;
    player.ammo = 1;
    player.ammoByWeapon.rifle = 1;
    player.reserveAmmo = 0;
    player.reserveAmmoByWeapon.rifle = 0;

    const result = rm.handleUpdateLoadout(room, player, { primary: 'm4a1', secondary: 'pistol' });

    assert.equal(player.ammo, 1);
    assert.equal(player.reserveAmmo, 0);
    assert.equal(player.loadout.primary, 'rifle', 'live loadout must not change mid-life');
    assert.equal(player.weapon, 'rifle');
    assert.equal(result.pending.primary, 'm4a1', 'the request is remembered for the next respawn');
  });

  it('applies the pending loadout on the next respawn', () => {
    const { rm } = createHarness();
    const { room, player } = join(rm, 'swapper');
    player.invulnerableUntil = 0;
    rm.handleUpdateLoadout(room, player, { primary: 'm4a1', secondary: 'pistol' });
    rm.respawnPlayer(room, player);
    assert.equal(player.loadout.primary, 'm4a1');
    assert.equal(player.weapon, 'm4a1');
    assert.equal(player.pendingLoadout, null);
  });

  it('applies immediately while dead or inside spawn protection', () => {
    const { rm } = createHarness();
    const { room, player } = join(rm, 'fresh');
    player.invulnerableUntil = Date.now() + 1000;
    rm.handleUpdateLoadout(room, player, { primary: 'smg', secondary: 'pistol' });
    assert.equal(player.loadout.primary, 'smg');

    player.invulnerableUntil = 0;
    player.alive = false;
    rm.handleUpdateLoadout(room, player, { primary: 'lmg', secondary: 'pistol' });
    assert.equal(player.loadout.primary, 'lmg');
  });

  it('ignores a move packet that claims a weapon outside the loadout', () => {
    const { rm } = createHarness();
    const { room, player } = join(rm, 'cheater');
    place(player, 0, 0, 0);
    rm.handlePlayerMove(room, player, { x: 0, y: 0, z: 0, weapon: 'sniper', seq: 1 });
    assert.equal(player.weapon, 'rifle');
    rm.handlePlayerMove(room, player, { x: 0, y: 0, z: 0, weapon: 'pistol', seq: 2 });
    assert.equal(player.weapon, 'pistol', 'secondary is allowed');
    rm.handlePlayerMove(room, player, { x: 0, y: 0, z: 0, weapon: 'knife', seq: 3 });
    assert.equal(player.weapon, 'knife', 'melee is allowed');
  });

  it('fires the equipped weapon when a shot claims a weapon outside the loadout', () => {
    const { rm, emitted } = createHarness();
    const { room, shooter, eye, target } = duel(rm);
    rm.handleShoot(room, shooter, {
      weapon: 'sniper',
      origin: eye(),
      dir: normalize(target.x - shooter.x, 1.0 - eye().y, target.z - shooter.z),
      targetId: target.id
    });
    const shot = emitted.find((e) => e.event === 'shotFired');
    assert.equal(shot.payload.weapon, 'rifle');
    assert.equal(shooter.weapon, 'rifle');
  });

  it('does not let a reload packet touch a non-loadout weapon', () => {
    const { rm } = createHarness();
    const { room, player } = join(rm, 'reloader');
    player.ammoByWeapon.sniper = 0;
    rm.handleReload(room, player, 'sniper');
    assert.equal(player.reloadWeapon, null);
    assert.ok(WEAPONS.sniper, 'sniper exists but is not in this loadout');
  });

  it('bots keep working with any pool weapon', () => {
    const { rm } = createHarness();
    const { player } = join(rm, 'h');
    const bot = { isBot: true, loadout: { primary: 'scar', secondary: 'pistol', melee: 'knife' } };
    assert.equal(rm.isWeaponAllowed(bot, 'sniper'), true);
    assert.equal(rm.isWeaponAllowed(player, 'sniper'), false);
  });
});

describe('Only the room host may change map or bot count', () => {
  it('makes the first human the host, and the second a normal player', () => {
    const { rm } = createHarness();
    const a = join(rm, 'host');
    const b = join(rm, 'guest');
    assert.equal(a.room.hostId, 'host');
    assert.ok(rm.isRoomHost(a.room, 'host'));
    assert.ok(!rm.isRoomHost(a.room, 'guest'));
    assert.equal(b.room, a.room);
  });

  it('rejects setBots / changeMap from a non-host and leaves the room untouched', () => {
    const { rm, emitted } = createHarness();
    const { room } = join(rm, 'host');
    const { player: guest } = join(rm, 'guest');
    const botsBefore = room.desiredBots;
    const mapBefore = room.mapId;

    const bots = rm.handleSetBots(room, guest, { botCount: 8 });
    const map = rm.handleChangeMap(room, guest, { mapId: 'neon_lab' });

    assert.deepEqual([bots.ok, bots.error], [false, 'not_host']);
    assert.deepEqual([map.ok, map.error], [false, 'not_host']);
    assert.equal(room.desiredBots, botsBefore);
    assert.equal(room.mapId, mapBefore);
    assert.ok(!emitted.some((e) => e.event === 'mapChanged'));
  });

  it('lets the host change bots and map', () => {
    const { rm, emitted } = createHarness();
    const { room, player: host } = join(rm, 'host');
    join(rm, 'guest');

    const bots = rm.handleSetBots(room, host, { botCount: 3 });
    assert.equal(bots.ok, true);
    assert.equal(room.desiredBots, 3);
    assert.equal(Array.from(room.players.values()).filter((p) => p.isBot).length, 3);

    const map = rm.handleChangeMap(room, host, { mapId: 'neon_lab' });
    assert.equal(map.ok, true);
    assert.equal(room.mapId, 'neon_lab');
    assert.ok(emitted.some((e) => e.event === 'mapChanged'));
  });

  it('hands host to the next human when the host leaves', () => {
    const { rm, emitted } = createHarness();
    const { room } = join(rm, 'host');
    const { player: guest } = join(rm, 'guest');

    rm.removePlayer('host');

    assert.equal(room.hostId, 'guest');
    const changed = emitted.find((e) => e.event === 'hostChanged');
    assert.ok(changed);
    assert.equal(changed.payload.hostId, 'guest');
    assert.equal(rm.handleSetBots(room, guest, { botCount: 1 }).ok, true);
  });

  it('never makes a bot the host', () => {
    const { rm } = createHarness();
    const { room } = join(rm, 'host', 'AUTH02', { botCount: 4 });
    join(rm, 'guest', 'AUTH02', { botCount: 4 });
    assert.ok(Array.from(room.players.values()).some((p) => p.isBot), 'room has bots');
    rm.removePlayer('host');
    assert.equal(room.hostId, 'guest');
    assert.equal(room.players.get(room.hostId).isBot, false);
  });
});
