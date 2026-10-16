/**
 * Combat-rule tests: spawn protection ends when a human fires / throws, lag compensation only trusts the
 * server-measured RTT (never client-reported ping / rewind / timestamps), the RTT is an EMA clamped to 0..1000,
 * the rewind cap is 200ms, and the position history is stamped with the server clock.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { INTERP_DELAY_MS, MATCH_CONFIG } from '../shared/config.js';
import {
  LAG_COMP_INTERP_ALLOWANCE_MS,
  LAG_COMP_MAX_REWIND_MS,
  resolveShotRewindMs
} from '../shared/lagCompensation.js';
import { RoomManager } from '../server/roomManager.js';

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
  clearInterval(rm.tickInterval);
  rm.tickInterval = null;
  return { rm, emitted };
}

function join(rm, id, roomCode = 'COMBAT') {
  const res = rm.addHumanPlayer({ id }, { name: id, roomCode, mode: 'private', mapId: MAP_ID });
  assert.ok(!res.error, `join failed: ${res.error}`);
  return res;
}

function shotPayload(player, extra = {}) {
  return {
    weapon: player.weapon,
    origin: { x: player.x, y: player.y + 1.62, z: player.z },
    dir: { x: 0, y: 0, z: -1 },
    ...extra
  };
}

describe('Spawn protection ends when the player attacks', () => {
  it('removes a human shield on the first shot and tells the room', () => {
    const { rm, emitted } = createHarness();
    const { room, player } = join(rm, 'p1');
    join(rm, 'p2');
    assert.ok(player.invulnerableUntil > Date.now(), 'fresh spawn must be protected');

    rm.handleShoot(room, player, shotPayload(player));

    assert.equal(player.invulnerableUntil, 0);
    const evt = emitted.find((e) => e.event === 'spawnProtectionEnded');
    assert.ok(evt, 'spawnProtectionEnded must be emitted');
    assert.equal(evt.code, room.code);
    assert.deepEqual(evt.payload, { playerId: 'p1' });
  });

  it('removes a human shield when throwing a grenade', () => {
    const { rm, emitted } = createHarness();
    const { room, player } = join(rm, 'p1');
    join(rm, 'p2');
    assert.ok(player.invulnerableUntil > Date.now());

    rm.handleThrowGrenade(room, player, { yaw: 0, pitch: 0 });

    assert.equal(player.invulnerableUntil, 0);
    assert.equal(emitted.filter((e) => e.event === 'spawnProtectionEnded').length, 1);
  });

  it('does not emit anything when there was no shield left to end', () => {
    const { rm, emitted } = createHarness();
    const { room, player } = join(rm, 'p1');
    join(rm, 'p2');
    player.invulnerableUntil = 0;

    rm.handleShoot(room, player, shotPayload(player));

    assert.equal(emitted.filter((e) => e.event === 'spawnProtectionEnded').length, 0);
  });

  it('endSpawnProtection ends an active shield and reports whether it changed anything', () => {
    const { rm } = createHarness();
    const { room, player } = join(rm, 'p1');
    player.invulnerableUntil = Date.now() + 1000;
    assert.equal(rm.endSpawnProtection(room, player), true);
    assert.equal(player.invulnerableUntil, 0);
    assert.equal(rm.endSpawnProtection(room, player), false, 'nothing left to end');
  });
});

describe('Lag compensation uses only server-measured latency', () => {
  it('rewind = clamp(rttMs / 2 + INTERP_DELAY_MS, 0, 200ms)', () => {
    assert.equal(LAG_COMP_MAX_REWIND_MS, 200);
    assert.equal(INTERP_DELAY_MS, 100);
    assert.equal(LAG_COMP_INTERP_ALLOWANCE_MS, INTERP_DELAY_MS);

    const shooter = { id: 's', rttMs: 0 };
    assert.equal(resolveShotRewindMs(shooter, {}, Date.now()), 100);
    shooter.rttMs = 80;
    assert.equal(resolveShotRewindMs(shooter, {}, Date.now()), 140);
    shooter.rttMs = 300;
    assert.equal(resolveShotRewindMs(shooter, {}, Date.now()), 200);
    shooter.rttMs = 1000;
    assert.equal(resolveShotRewindMs(shooter, {}, Date.now()), LAG_COMP_MAX_REWIND_MS);
  });

  it('uses the server-side rttMs when the shooter has not been probed yet (allowance only)', () => {
    assert.equal(resolveShotRewindMs({ id: 's' }, {}, Date.now()), LAG_COMP_INTERP_ALLOWANCE_MS);
  });

  it('ignores every client-supplied latency / timestamp field', () => {
    const now = Date.now();
    const shooter = { id: 's', rttMs: 60, pingMs: 900, latencyMs: 900 };
    const expected = 60 / 2 + LAG_COMP_INTERP_ALLOWANCE_MS;
    const hostile = [
      { rewindMs: 900 },
      { rewindMs: 0 },
      { latencyMs: 900 },
      { pingMs: 900 },
      { rttMs: 900 },
      { shotTimestamp: now - 400 },
      { clientTimestamp: now - 400 },
      { rewindMs: 900, latencyMs: 900, pingMs: 900, rttMs: 900, shotTimestamp: now - 400, clientTimestamp: now - 400 }
    ];
    for (const payload of hostile) {
      assert.equal(resolveShotRewindMs(shooter, payload, now), expected, JSON.stringify(payload));
    }
  });

  it('handleShoot / handlePlayerMove no longer store client pingMs', () => {
    const { rm } = createHarness();
    const { room, player } = join(rm, 'p1');
    join(rm, 'p2');
    player.invulnerableUntil = 0;

    rm.handlePlayerMove(room, player, { x: player.x, y: player.y, z: player.z, yaw: 0, pitch: 0, pingMs: 777 });
    rm.handleShoot(room, player, shotPayload(player, { pingMs: 777, rewindMs: 777 }));

    assert.equal(player.pingMs, undefined);
  });
});

describe('Server-side RTT probe', () => {
  it('keeps rttMs as an exponential moving average', () => {
    const { rm } = createHarness();
    const { player } = join(rm, 'p1');
    const alpha = MATCH_CONFIG.LATENCY_EMA_ALPHA;

    assert.equal(rm.recordRtt(player, 100), 100, 'first sample seeds the average');
    const second = rm.recordRtt(player, 200);
    assert.ok(Math.abs(second - (100 + (200 - 100) * alpha)) < 1e-9);
    assert.equal(player.rttMs, second);
  });

  it('clamps samples to 0..1000ms and ignores garbage', () => {
    const { rm } = createHarness();
    const { player } = join(rm, 'p1');

    assert.equal(rm.recordRtt(player, 50000), 1000);
    assert.equal(rm.recordRtt(player, -50), 1000 + (0 - 1000) * MATCH_CONFIG.LATENCY_EMA_ALPHA);
    assert.ok(player.rttMs >= 0 && player.rttMs <= 1000);
    const before = player.rttMs;
    assert.equal(rm.recordRtt(player, NaN), null);
    assert.equal(rm.recordRtt(player, '40'), null);
    assert.equal(rm.recordRtt(player, Infinity), null);
    assert.equal(player.rttMs, before);
  });

  it('probes the socket, measures RTT from the ack, and stops on removePlayer', async () => {
    const { rm } = createHarness();
    const sent = [];
    const socket = { id: 'p1', disconnected: false, emit: (event, t, cb) => sent.push({ event, t, cb }) };
    const { player } = join(rm, 'p1');
    socket.id = player.id;

    rm.startLatencyProbe(socket, player);
    assert.equal(sent.length, 1, 'first probe is sent immediately');
    assert.equal(sent[0].event, 'latencyProbe');
    assert.equal(typeof sent[0].t, 'number');
    assert.equal(typeof sent[0].cb, 'function');
    assert.ok(rm.latencyProbes.has('p1'));

    await new Promise((r) => setTimeout(r, 30));
    sent[0].cb(sent[0].t);
    assert.ok(player.rttMs >= 20 && player.rttMs < 500, `rtt measured by the server: ${player.rttMs}`);

    // A client cannot lie about RTT through the ack argument
    const measured = player.rttMs;
    sent[0].cb(-5000);
    assert.ok(player.rttMs >= 0 && player.rttMs <= Math.max(measured, 1000));

    rm.removePlayer('p1');
    assert.equal(rm.latencyProbes.has('p1'), false, 'probe timer is cleared on leave/disconnect');
  });

});

describe('Position history uses the server clock', () => {
  it('stamps playerMove snapshots with server time, not payload.timestamp', () => {
    const { rm } = createHarness();
    const { room, player } = join(rm, 'p1');
    join(rm, 'p2');

    const before = Date.now();
    rm.handlePlayerMove(room, player, {
      x: player.x,
      y: player.y,
      z: player.z,
      yaw: 0,
      pitch: 0,
      timestamp: 12345 // client clock (e.g. performance.now()) must never reach the history buffer
    });
    const after = Date.now();

    const history = player.positionHistory;
    const last = history[history.length - 1];
    assert.ok(last.timestamp >= before && last.timestamp <= after, `history ts ${last.timestamp}`);
    assert.ok(history.every((s) => s.timestamp >= before - 5000), 'no client-clock entries in the ring buffer');
  });
});
