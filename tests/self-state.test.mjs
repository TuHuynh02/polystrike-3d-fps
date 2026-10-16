/**
 * Step 3 (T1): Owner-only `selfState` reconciliation + `shotRejected` ammo/effect rollback.
 *
 * Covers:
 *  1. Server emits owner-only `shotRejected { ss, reason }` for `ammo`, `rate`, `reload`, `weapon`, `seq`, and `dead`,
 *     and `Game3D.applyShotRejected` refunds predicted ammo (once per `ss`), removes the tracer for `ss`, and cancels
 *     any auto-reload triggered by the rejected shot.
 *  2. `Game3D.applySelfState` overwrites ammo/reserve/reload/HP/grenades when no unacked FIRE commands remain, and
 *     preserves in-flight FIRE deductions (`serverAmmo - inFlight`) while shots are still in flight.
 *  3. `selfState` and `shotRejected` never leak to other players or room broadcasts, and `stateUpdate` (`serializePlayers`)
 *     does not expose owner-only fields (`lastShotSeq`, `ammoByWeapon`, `reserveAmmoByWeapon`, `reloading`).
 *  4. Shotgun shell-by-shell reload (`shellByShell`) stays synchronized between server and client across shell insertions
 *     and fire interruption.
 *  5. Death and respawn reset `alive`, `hp`, `ammo`, `reserveAmmo`, `reloading`, `shotSeq`, and `predictedShots` cleanly.
 *  6. 10% random `inputBatch` packet-loss simulation converges client and server ammo/reserveAmmo to identical values.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createTestGame3D } from './helpers/headless-game3d.mjs';
import { MATCH_CONFIG, WEAPONS } from '../shared/constants.js';
import { FIXED_DT } from '../shared/movement.js';
import { BTN, buildInputCommand, commandTimeMs } from '../shared/netcode.js';
import { RoomManager, SHOT_REJECT } from '../server/roomManager.js';

const MAP_ID = 'cyber_citadel';
const STEP_MS = 1000 / 60;

function createServerHarness() {
  const emitted = [];
  const io = {
    to(target) {
      return {
        emit(event, payload) {
          emitted.push({ to: target, event, payload, volatile: false });
        },
        volatile: {
          emit(event, payload) {
            emitted.push({ to: target, event, payload, volatile: true });
          }
        }
      };
    }
  };
  const rm = new RoomManager(io);
  rm.stop();
  return { rm, emitted };
}

function createTwoPlayerRoom(roomCode = 'SELF01') {
  const { rm, emitted } = createServerHarness();
  const joinA = rm.addHumanPlayer(
    { id: 'p1' },
    { name: 'Alice', roomCode, mode: 'private', botCount: 0, mapId: MAP_ID, weapon: 'rifle' }
  );
  assert.ok(!joinA.error, `joinA failed: ${joinA.error}`);

  const joinB = rm.addHumanPlayer(
    { id: 'p2' },
    { name: 'Bob', roomCode, mode: 'private', botCount: 0, mapId: MAP_ID, weapon: 'rifle' }
  );
  assert.ok(!joinB.error, `joinB failed: ${joinB.error}`);

  const room = joinA.room;
  const p1 = joinA.player;
  const p2 = joinB.player;
  for (const p of [p1, p2]) {
    p.invulnerableUntil = 0;
  }
  emitted.length = 0;
  return { rm, room, p1, p2, emitted };
}

function sendCmd(rm, room, player, seq, opts = {}, now = 10_000 + Math.round(seq * STEP_MS)) {
  const cmd = buildInputCommand(seq, {
    yaw: opts.yaw ?? player.yaw ?? 0,
    pitch: opts.pitch ?? player.pitch ?? 0,
    weapon: opts.weapon ?? player.weapon ?? 'rifle',
    fire: Boolean(opts.fire),
    shotSeq: opts.ss ?? 0
  });
  player.moveCredit = 1;
  rm.handleInputBatch(room, player, { e: player.moveEpoch, cmds: [cmd] }, now);
  rm.processPlayerInputs(room, player, now);
}

async function setupClientForPlayer(player, callbacks = {}) {
  const game = await createTestGame3D(callbacks);
  game.localId = player.id;
  game.inMatch = true;
  game.alive = true;
  game.isPointerLocked = true;
  game.resetNetcode(player.moveEpoch);
  game.setSpreadSeed(player.spreadSeed);
  game.spawnLocalPlayer({
    id: player.id,
    x: player.x,
    y: player.y,
    z: player.z,
    yaw: player.yaw || 0,
    pitch: player.pitch || 0,
    weapon: player.weapon || 'rifle',
    spreadSeed: player.spreadSeed,
    loadout: player.loadout
  });
  game.physTracked.x = game.position.x;
  game.physTracked.y = game.position.y;
  game.physTracked.z = game.position.z;
  game.equipUntil = 0;
  return game;
}

describe('Step 3 (T1) — Owner-only selfState & shotRejected', () => {
  describe('1. Server shotRejected reasons & client rollback', () => {
    it('emits shotRejected for ammo, rate, reload, weapon, seq, and dead only to the shooter', () => {
      const { rm, room, p1, p2, emitted } = createTwoPlayerRoom('REJ001');

      // (a) `seq`: duplicate / non-increasing ss
      p1.lastShotSeq = 5;
      sendCmd(rm, room, p1, 1, { fire: true, weapon: 'rifle', ss: 5 }, 10_100);
      let rej = emitted.find((e) => e.event === 'shotRejected');
      assert.ok(rej, 'expected shotRejected for duplicate ss');
      assert.equal(rej.to, p1.id);
      assert.deepEqual(rej.payload, { ss: 5, reason: SHOT_REJECT.SEQ });
      assert.equal(emitted.some((e) => e.to === p2.id && e.event === 'shotRejected'), false);
      emitted.length = 0;

      // (b) `weapon`: command carries weapon not in player's loadout (e.g. 'sniper' when primary is 'rifle')
      sendCmd(rm, room, p1, 2, { fire: true, weapon: 'sniper', ss: 6 }, 10_200);
      rej = emitted.find((e) => e.event === 'shotRejected');
      assert.ok(rej, 'expected shotRejected for weapon not in loadout');
      assert.deepEqual(rej.payload, { ss: 6, reason: SHOT_REJECT.WEAPON });
      emitted.length = 0;

      // (c) `rate`: two rifle shots 1 tick (~16.67ms) apart (rifle fireRate is 95ms)
      sendCmd(rm, room, p1, 3, { fire: true, weapon: 'rifle', ss: 7 }, 11_000);
      assert.equal(emitted.some((e) => e.event === 'shotRejected'), false, 'first shot at seq=3 should succeed');
      emitted.length = 0;

      sendCmd(rm, room, p1, 4, { fire: true, weapon: 'rifle', ss: 8 }, 11_017);
      rej = emitted.find((e) => e.event === 'shotRejected');
      assert.ok(rej, 'expected shotRejected for firing faster than fireRate');
      assert.deepEqual(rej.payload, { ss: 8, reason: SHOT_REJECT.RATE });
      emitted.length = 0;

      // (d) `reload`: while magazine weapon is reloading (advance seq to 12 so fireRate is satisfied)
      for (let s = 5; s <= 11; s++) {
        sendCmd(rm, room, p1, s, { fire: false, weapon: 'rifle' }, 11_000 + s * 17);
      }
      p1.ammo = 10;
      p1.ammoByWeapon.rifle = 10;
      p1.reserveAmmo = 60;
      p1.reserveAmmoByWeapon.rifle = 60;
      const reloadStartMs = 12_000;
      rm.handleReload(room, p1, 'rifle', reloadStartMs);
      emitted.length = 0;

      sendCmd(rm, room, p1, 12, { fire: true, weapon: 'rifle', ss: 9 }, reloadStartMs + 50);
      rej = emitted.find((e) => e.event === 'shotRejected');
      assert.ok(rej, 'expected shotRejected while rifle is reloading');
      assert.deepEqual(rej.payload, { ss: 9, reason: SHOT_REJECT.RELOAD });
      emitted.length = 0;

      // Finish reload, then test (e) `ammo`: 0 ammo in mag and 0 reserve
      p1.reloadingUntil = 0;
      p1.reloadWeapon = null;
      p1.nextShellAt = 0;
      p1.ammo = 0;
      p1.ammoByWeapon.rifle = 0;
      p1.reserveAmmo = 0;
      p1.reserveAmmoByWeapon.rifle = 0;

      sendCmd(rm, room, p1, 13, { fire: true, weapon: 'rifle', ss: 10 }, 15_000);
      rej = emitted.find((e) => e.event === 'shotRejected');
      assert.ok(rej, 'expected shotRejected when out of ammo');
      assert.deepEqual(rej.payload, { ss: 10, reason: SHOT_REJECT.AMMO });
      emitted.length = 0;

      // (f) `dead`: queued FIRE command drained while player is dead
      p1.alive = false;
      p1.hp = 0;
      sendCmd(rm, room, p1, 14, { fire: true, weapon: 'rifle', ss: 11 }, 15_100);
      rej = emitted.find((e) => e.event === 'shotRejected');
      assert.ok(rej, 'expected shotRejected with reason=dead when dead player has queued FIRE cmd');
      assert.deepEqual(rej.payload, { ss: 11, reason: SHOT_REJECT.DEAD });
    });

    it('Game3D.applyShotRejected refunds ammo once per ss, removes tracer, and cancels false auto-reload', async () => {
      const { p1 } = createTwoPlayerRoom('REJ002');
      let reloadCancelled = 0;
      const game = await setupClientForPlayer(p1, {
        onReloadCancel: () => {
          reloadCancelled += 1;
        }
      });

      // Set rifle to 1 round left so the next predicted shot empties the mag and triggers auto-reload
      game.ammoByWeapon.rifle = 1;
      game.reserveAmmoByWeapon.rifle = 30;
      game.lastShotAt = -10_000;

      game.attemptShoot();
      game.advanceFixedPhysics(FIXED_DT);

      assert.equal(game.shotSeq, 1);
      assert.equal(game.ammoByWeapon.rifle, 0, 'predicted shot should deduct 1 round');
      assert.ok(game.reloadingUntil > 0, 'emptying mag with reserve should start predicted auto-reload');

      const tracerBefore = game.activeEffects.filter((fx) => fx.ss === 1);
      assert.ok(tracerBefore.length >= 1, 'predicted shot should spawn tracer tagged with ss=1');

      // Apply shotRejected for ss=1
      const applied = game.applyShotRejected({ ss: 1, reason: 'rate' });
      assert.equal(applied, true);
      assert.equal(game.ammoByWeapon.rifle, 1, 'rejected shot should refund the 1 predicted bullet');
      assert.equal(game.reloadingUntil, 0, 'auto-reload triggered by the rejected shot should be cancelled');
      assert.equal(reloadCancelled, 1);
      assert.equal(
        game.activeEffects.some((fx) => fx.ss === 1),
        false,
        'tracer for rejected ss=1 should be removed immediately'
      );

      // Duplicate shotRejected for the same ss must not double-refund
      const appliedDuplicate = game.applyShotRejected({ ss: 1, reason: 'rate' });
      assert.equal(appliedDuplicate, false);
      assert.equal(game.ammoByWeapon.rifle, 1);
    });
  });

  describe('2. selfState reconciliation (settled vs. in-flight shots)', () => {
    it('preserves predicted deduction while FIRE is in flight, then snaps to server state once settled', async () => {
      const { p1 } = createTwoPlayerRoom('REC001');
      const game = await setupClientForPlayer(p1);

      // Fire shot #1 at step 1
      game.lastShotAt = -10_000;
      game.attemptShoot();
      game.advanceFixedPhysics(FIXED_DT);
      assert.equal(game.shotSeq, 1);
      assert.equal(game.ammoByWeapon.rifle, 29);

      // Advance 6 fixed steps (~100ms >= 95ms rifle fireRate) and fire shot #2
      for (let i = 0; i < 6; i++) {
        game.advanceFixedPhysics(FIXED_DT);
      }
      game.lastShotAt = -10_000;
      game.attemptShoot();
      game.advanceFixedPhysics(FIXED_DT);
      assert.equal(game.shotSeq, 2);
      assert.equal(game.ammoByWeapon.rifle, 28);

      // Server has only processed ss=1 so far (ammo=29 on server); ss=2 is still in flight
      game.applySelfState(
        {
          seq: 1,
          lastShotSeq: 1,
          hp: 88,
          alive: true,
          weapon: 'rifle',
          ammo: 29,
          reserveAmmo: 90,
          ammoByWeapon: { rifle: 29 },
          reserveAmmoByWeapon: { rifle: 90 },
          reloading: null,
          grenades: 1
        },
        performance.now()
      );

      assert.equal(
        game.ammoByWeapon.rifle,
        28,
        'while ss=2 is still in flight, client should keep 1 in-flight round deducted (29 - 1 = 28)'
      );
      assert.equal(game.hp, 88);
      assert.equal(game.grenades, 1);

      // Now server processes ss=2 and sends updated selfState
      game.applySelfState(
        {
          seq: 8,
          lastShotSeq: 2,
          hp: 88,
          alive: true,
          weapon: 'rifle',
          ammo: 28,
          reserveAmmo: 90,
          ammoByWeapon: { rifle: 28 },
          reserveAmmoByWeapon: { rifle: 90 },
          reloading: null,
          grenades: 1
        },
        performance.now()
      );

      assert.equal(game.predictedShots.length, 0, 'all settled shots should be pruned');
      assert.equal(game.ammoByWeapon.rifle, 28);
    });
  });

  describe('3. Owner-only isolation & broadcast stateUpdate hygiene', () => {
    it('never sends selfState or shotRejected to other players and omits owner-only fields from serializePlayers', () => {
      const { rm, room, p1, p2, emitted } = createTwoPlayerRoom('ISO001');

      // Valid shot from p1 -> triggers sendSelfState(p1)
      sendCmd(rm, room, p1, 1, { fire: true, weapon: 'rifle', ss: 1 }, 10_100);
      // Invalid rate shot from p1 -> triggers emitShotRejected(p1)
      sendCmd(rm, room, p1, 2, { fire: true, weapon: 'rifle', ss: 2 }, 10_116);

      const selfStateEvents = emitted.filter((e) => e.event === 'selfState');
      const rejectEvents = emitted.filter((e) => e.event === 'shotRejected');

      assert.ok(selfStateEvents.length >= 1, 'should emit selfState to shooter');
      assert.ok(rejectEvents.length >= 1, 'should emit shotRejected to shooter');

      for (const ev of [...selfStateEvents, ...rejectEvents]) {
        assert.equal(ev.to, p1.id, `${ev.event} must only be sent to owner (${p1.id}), got ${ev.to}`);
        assert.notEqual(ev.to, p2.id);
        assert.notEqual(ev.to, room.code);
      }

      const serialized = rm.serializePlayers(room);
      for (const sp of serialized) {
        assert.equal('lastShotSeq' in sp, false, 'serializePlayers must not expose lastShotSeq');
        assert.equal('ammoByWeapon' in sp, false, 'serializePlayers must not expose ammoByWeapon');
        assert.equal('reserveAmmoByWeapon' in sp, false, 'serializePlayers must not expose reserveAmmoByWeapon');
        assert.equal('reloading' in sp, false, 'serializePlayers must not expose reloading object');
        assert.equal(typeof sp.ammo, 'number');
        assert.equal(typeof sp.reserveAmmo, 'number');
        assert.equal(typeof sp.grenades, 'number');
      }
    });
  });

  describe('4. Shotgun shell-by-shell reload synchronization', () => {
    it('synchronizes shell-by-shell reload progress and fire interruption via selfState', async () => {
      const { rm, emitted } = createServerHarness();
      const joinRes = rm.addHumanPlayer(
        { id: 'p_sg' },
        {
          name: 'Buckshot',
          roomCode: 'SHG001',
          mode: 'private',
          botCount: 0,
          mapId: MAP_ID,
          weapon: 'shotgun',
          loadout: { primary: 'shotgun', secondary: 'pistol', melee: 'knife' }
        }
      );
      const { room, player: p1 } = joinRes;
      p1.invulnerableUntil = 0;

      const game = await setupClientForPlayer(p1);

      // Set p1 to 3/6 shells in tube and 16 in reserve
      p1.weapon = 'shotgun';
      p1.ammoByWeapon.shotgun = 3;
      p1.ammo = 3;
      p1.reserveAmmoByWeapon.shotgun = 16;
      p1.reserveAmmo = 16;

      let now = 20_000;
      emitted.length = 0;
      rm.handleReload(room, p1, 'shotgun', now);

      const initialSelf = emitted.filter((e) => e.event === 'selfState' && e.to === p1.id).pop();
      assert.ok(initialSelf, 'handleReload should emit selfState');
      assert.equal(initialSelf.payload.reloading?.weapon, 'shotgun');
      assert.ok(initialSelf.payload.reloading?.remainingMs > 0);
      game.applySelfState(initialSelf.payload, now);
      assert.ok(game.reloadingUntil > now);
      assert.equal(game.reloadMode, 'shell');

      // Advance past startDelay + 1 shell insertion
      emitted.length = 0;
      const startDelay = WEAPONS.shotgun.shellReloadStartMs || 240;
      const shellMs = WEAPONS.shotgun.shellReloadMs || 390;
      now += startDelay + shellMs + 10;
      rm.syncPlayerReloadState(p1, now);
      const afterOneShell = emitted.filter((e) => e.event === 'selfState' && e.to === p1.id).pop();
      assert.ok(afterOneShell, 'shell insertion should emit selfState');
      assert.equal(afterOneShell.payload.ammoByWeapon.shotgun, 4);
      assert.equal(afterOneShell.payload.reserveAmmoByWeapon.shotgun, 15);
      assert.ok(afterOneShell.payload.reloading, 'still reloading remaining 2 shells');

      game.applySelfState(afterOneShell.payload, now);
      assert.equal(game.ammoByWeapon.shotgun, 4);
      assert.equal(game.reserveAmmoByWeapon.shotgun, 15);

      // Interrupt shell reload by firing shotgun at seq=1
      emitted.length = 0;
      sendCmd(rm, room, p1, 1, { fire: true, weapon: 'shotgun', ss: 1 }, now + 50);
      const afterInterruptFire = emitted.filter((e) => e.event === 'selfState' && e.to === p1.id).pop();
      assert.ok(afterInterruptFire, 'firing during shell reload should emit updated selfState');
      assert.equal(afterInterruptFire.payload.reloading, null, 'shell reload should be cancelled by firing');
      assert.equal(afterInterruptFire.payload.ammoByWeapon.shotgun, 3);

      game.applySelfState(afterInterruptFire.payload, now + 50);
      assert.equal(game.reloadingUntil, 0);
      assert.equal(game.ammoByWeapon.shotgun, 3);
    });
  });

  describe('5. Death and respawn reset', () => {
    it('resets alive, hp, ammo, reserveAmmo, reloading, and predictedShots across death and respawn', async () => {
      const { rm, room, p1, p2, emitted } = createTwoPlayerRoom('DR0001');
      const game = await setupClientForPlayer(p1);

      // Drain some ammo and start reload on p1
      p1.ammo = 12;
      p1.ammoByWeapon.rifle = 12;
      p1.reserveAmmo = 30;
      p1.reserveAmmoByWeapon.rifle = 30;
      rm.handleReload(room, p1, 'rifle', 30_000);
      emitted.length = 0;

      // Kill p1
      rm.handlePlayerKilled(room, p2, p1, 'rifle', true);

      const deathSelf = emitted.filter((e) => e.event === 'selfState' && e.to === p1.id).pop();
      assert.ok(deathSelf, 'handlePlayerKilled should emit selfState to victim');
      assert.equal(deathSelf.payload.alive, false);
      assert.equal(deathSelf.payload.hp, 0);

      game.applySelfState(deathSelf.payload, 30_100);
      assert.equal(game.alive, false);
      assert.equal(game.hp, 0);
      assert.equal(game.reloadingUntil, 0);
      assert.equal(game.predictedShots.length, 0);

      // Respawn p1
      emitted.length = 0;
      rm.respawnPlayer(room, p1);
      const respawnSelf = emitted.filter((e) => e.event === 'selfState' && e.to === p1.id).pop();
      assert.ok(respawnSelf, 'respawnPlayer should emit fresh selfState');
      assert.equal(respawnSelf.payload.alive, true);
      assert.equal(respawnSelf.payload.hp, MATCH_CONFIG.MAX_HP);
      assert.equal(respawnSelf.payload.ammoByWeapon.rifle, WEAPONS.rifle.magSize);
      assert.equal(respawnSelf.payload.reserveAmmoByWeapon.rifle, WEAPONS.rifle.reserveAmmo);
      assert.equal(respawnSelf.payload.reloading, null);

      game.spawnLocalPlayer({
        id: p1.id,
        x: p1.x,
        y: p1.y,
        z: p1.z,
        yaw: p1.yaw,
        pitch: p1.pitch,
        weapon: p1.weapon
      });
      game.applySelfState(respawnSelf.payload, 33_500);
      assert.equal(game.alive, true);
      assert.equal(game.hp, MATCH_CONFIG.MAX_HP);
      assert.equal(game.ammoByWeapon.rifle, WEAPONS.rifle.magSize);
      assert.equal(game.reserveAmmoByWeapon.rifle, WEAPONS.rifle.reserveAmmo);
    });
  });

  describe('6. 10% random inputBatch packet loss convergence', () => {
    it('converges client and server ammo/reserveAmmo to the exact same values after 10% inputBatch loss', async () => {
      const { rm, room, p1, emitted } = createTwoPlayerRoom('LOSS01');

      // Deterministic PRNG for reproducible 10% packet drop simulation
      let rngState = 0x9e3779b9;
      const nextRand = () => {
        rngState = (Math.imul(rngState, 1664525) + 1013904223) >>> 0;
        return rngState / 0x100000000;
      };

      const reloadRequests = [];
      const game = await setupClientForPlayer(p1, {
        onReloadStart: (weapon) => {
          reloadRequests.push(weapon);
        }
      });

      let now = 50_000;
      let totalBatches = 0;
      let droppedBatches = 0;

      // Simulate 180 ticks (3 seconds) of bursts + reload under 10% inputBatch packet loss
      for (let tick = 1; tick <= 180; tick++) {
        now += STEP_MS;

        // Fire periodically during ticks 1..90 and 130..155 (every 7 ticks >= 95ms rifle interval)
        if ((tick <= 90 && tick % 7 === 0) || (tick >= 130 && tick <= 155 && tick % 8 === 0)) {
          game.lastShotAt = -10_000;
          game.attemptShoot();
        }
        // Trigger manual reload at tick 95
        if (tick === 95) {
          game.startReload();
        }

        game.advanceFixedPhysics(FIXED_DT);

        // Forward any reload event requested by client
        while (reloadRequests.length > 0) {
          const wId = reloadRequests.shift();
          rm.handleReload(room, p1, wId, now);
        }

        // Send inputBatch with 10% random packet loss
        const batch = game.prediction.buildBatch();
        if (batch && batch.cmds.length > 0) {
          totalBatches += 1;
          const drop = nextRand() < 0.1;
          if (drop) {
            droppedBatches += 1;
          } else {
            rm.handleInputBatch(room, p1, batch, now);
          }
        }

        p1.moveCredit = 1;
        rm.syncPlayerReloadState(p1, now);
        rm.processPlayerInputs(room, p1, now);

        // Deliver server moveAck, shotRejected, and selfState to client
        for (const ev of emitted) {
          if (ev.to !== p1.id) continue;
          if (ev.event === 'moveAck') {
            game.applyMoveAck(ev.payload);
          } else if (ev.event === 'shotRejected') {
            game.applyShotRejected(ev.payload);
          } else if (ev.event === 'selfState') {
            game.applySelfState(ev.payload, now);
          }
        }
        emitted.length = 0;
      }

      // Let final commands & any active reload settle with reliable delivery
      for (let settle = 1; settle <= 30; settle++) {
        now += 100;
        game.advanceFixedPhysics(FIXED_DT);
        const batch = game.prediction.buildBatch();
        if (batch && batch.cmds.length > 0) {
          rm.handleInputBatch(room, p1, batch, now);
        }
        p1.moveCredit = 1;
        rm.syncPlayerReloadState(p1, now);
        rm.processPlayerInputs(room, p1, now);
        rm.sendSelfState(p1, now, true);

        for (const ev of emitted) {
          if (ev.to !== p1.id) continue;
          if (ev.event === 'moveAck') {
            game.applyMoveAck(ev.payload);
          } else if (ev.event === 'shotRejected') {
            game.applyShotRejected(ev.payload);
          } else if (ev.event === 'selfState') {
            game.applySelfState(ev.payload, now);
          }
        }
        emitted.length = 0;
      }

      assert.ok(droppedBatches > 0, `expected ~10% dropped batches out of ${totalBatches}, got ${droppedBatches}`);
      assert.equal(
        game.ammoByWeapon.rifle,
        p1.ammoByWeapon.rifle,
        `client rifle ammo (${game.ammoByWeapon.rifle}) must converge to server rifle ammo (${p1.ammoByWeapon.rifle})`
      );
      assert.equal(
        game.reserveAmmoByWeapon.rifle,
        p1.reserveAmmoByWeapon.rifle,
        `client rifle reserve (${game.reserveAmmoByWeapon.rifle}) must converge to server rifle reserve (${p1.reserveAmmoByWeapon.rifle})`
      );
    });
  });
});
