/**
 * LAN mode (tick rate + interpolation floor) and the hot/cold split of `stateUpdate` player entries.
 *
 *  1. LAN_MODE / TICK_HZ choose the tick rate (clamped to 20..50 Hz) and NET_CONFIG derives the client's delay floor from it;
 *     the default stays 25 Hz / 70 ms / 100 ms.
 *  2. SnapshotInterpolator.configure(net) lets the jitter buffer follow a faster tick (otherwise 50 Hz would sit on the 70 ms floor).
 *  3. serializePlayers(room, now, { refresh }) only carries the cold block after a change, and in refresh snapshots.
 *  4. PlayerStateCache rebuilds complete player objects on the client from hot-only entries.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import './helpers/headless-game3d.mjs'; // registers the module resolution the client modules need
import { RoomManager } from '../server/roomManager.js';
import { NET_CONFIG, TICK_INTERVAL_MS } from '../server/room/sanitizers.js';
import { COLD_KEYS, COLD_REPEAT_MS, PlayerStateCache, isColdEntry } from '../shared/playerDelta.js';
import { INTERP_DELAY_MIN_MS, INTERP_DELAY_MS } from '../shared/config.js';
import { buildLanCreateUrl, normalizeLanUrl, parseCreateParams } from '../shared/lanUrl.js';

const { SnapshotInterpolator } = await import('../public/js/snapshotBuffer.js');

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// One child process evaluates all cases (each import gets its own module instance via a query string; the module reads
// LAN_MODE / TICK_HZ / argv at import time), so the suite does not pay for a process per case.
function sanitizersCases(cases) {
  const script = `
    const cases = JSON.parse(process.env.CASES);
    const out = [];
    for (let i = 0; i < cases.length; i++) {
      delete process.env.LAN_MODE;
      delete process.env.TICK_HZ;
      Object.assign(process.env, cases[i].env);
      process.argv = [process.argv[0], ...cases[i].args];
      const m = await import('./server/room/sanitizers.js?case=' + i);
      out.push({ lan: m.LAN_MODE, hz: m.TICK_HZ, ms: m.TICK_INTERVAL_MS, net: m.NET_CONFIG });
    }
    console.log(JSON.stringify(out));`;
  const out = execFileSync(process.execPath, ['--input-type=module', '-e', script], {
    cwd: ROOT_DIR,
    env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, CASES: JSON.stringify(cases) },
    encoding: 'utf8'
  });
  return JSON.parse(out);
}

function createServerHarness() {
  const emitted = [];
  const record = (target, volatile) => ({ emit: (event, payload) => emitted.push({ to: target, event, payload, volatile }) });
  const io = {
    to: (target) => ({ ...record(target, false), volatile: record(target, true) }),
    emit: () => {},
    sockets: { sockets: new Map() }
  };
  const rm = new RoomManager(io);
  rm.stop();
  return { rm, emitted };
}

describe('LAN mode: tick rate and client delay floor', () => {
  const [plain, lanEnv, lanFlag, tooFast, tooSlow, thirty] = sanitizersCases([
    { env: {}, args: [] },
    { env: { LAN_MODE: '1' }, args: [] },
    { env: {}, args: ['--lan'] },
    { env: { TICK_HZ: '60' }, args: [] },
    { env: { LAN_MODE: '1', TICK_HZ: '5' }, args: [] },
    { env: { TICK_HZ: '30' }, args: [] }
  ]);

  it('defaults to 25 Hz with the shared 70 ms floor / 100 ms start value', () => {
    assert.deepEqual({ lan: plain.lan, hz: plain.hz, ms: plain.ms }, { lan: false, hz: 25, ms: 40 });
    assert.equal(plain.net.interpMinMs, INTERP_DELAY_MIN_MS);
    assert.equal(plain.net.interpInitialMs, INTERP_DELAY_MS);
  });

  it('LAN_MODE=1 and --lan run 50 Hz and lower the floor; TICK_HZ overrides and is clamped to 20..50', () => {
    assert.deepEqual({ lan: lanEnv.lan, hz: lanEnv.hz, ms: lanEnv.ms }, { lan: true, hz: 50, ms: 20 });
    assert.ok(lanEnv.net.interpMinMs < INTERP_DELAY_MIN_MS && lanEnv.net.interpMinMs >= lanEnv.ms, `floor ${lanEnv.net.interpMinMs}`);
    assert.ok(lanEnv.net.interpInitialMs < INTERP_DELAY_MS && lanEnv.net.interpInitialMs >= lanEnv.net.interpMinMs);
    assert.equal(lanFlag.hz, 50);
    assert.equal(tooFast.hz, 50, 'above 50 Hz the lag-compensation history ring would be too short');
    assert.equal(tooSlow.hz, 20);
    assert.equal(thirty.ms, 33);
  });

  it('roomJoined carries NET_CONFIG of the running server', () => {
    assert.equal(NET_CONFIG.tickMs, TICK_INTERVAL_MS);
  });
});

describe('SnapshotInterpolator.configure(net)', () => {
  function feed(interp, intervalMs, count = 200) {
    const t0 = 5_000_000;
    const offset = 777_000;
    for (let k = 0; k < count; k++) {
      const T = t0 + k * intervalMs;
      const at = T + offset + 2;
      interp.pushState(T, at, [{ id: 'e', x: k * 0.1, y: 0, z: 0, alive: true }]);
      interp.renderTime(at);
    }
  }

  it('a 50 Hz stream settles below the old 70 ms floor once configured, and stays above the new floor', () => {
    const plain = new SnapshotInterpolator();
    feed(plain, 20);
    assert.ok(plain.delayMs >= INTERP_DELAY_MIN_MS - 1e-6, `unconfigured delay ${plain.delayMs}`);

    const lan = new SnapshotInterpolator();
    lan.configure({ interpMinMs: 35, interpInitialMs: 50 });
    assert.equal(lan.delayMs, 50, 'start value before the first adaptive estimate');
    feed(lan, 20);
    assert.ok(lan.delayMs >= 35 - 1e-6 && lan.delayMs < INTERP_DELAY_MIN_MS, `configured delay ${lan.delayMs}`);
  });

  it('ignores junk and does not touch a pinned delay', () => {
    const a = new SnapshotInterpolator();
    a.configure(undefined);
    a.configure({ interpMinMs: 'x', interpInitialMs: -3 });
    assert.equal(a.delayMs, INTERP_DELAY_MS);
    const pinned = new SnapshotInterpolator({ interpDelayMs: 120 });
    pinned.configure({ interpMinMs: 35, interpInitialMs: 50 });
    assert.equal(pinned.delayMs, 120);
  });
});

describe('stateUpdate hot/cold split', () => {
  function twoPlayerRoom() {
    const { rm, emitted } = createServerHarness();
    const a = rm.addHumanPlayer({ id: 'hot_a' }, { name: 'Alpha', mode: 'private', mapId: 'cyber_citadel' });
    rm.addHumanPlayer({ id: 'hot_b' }, { name: 'Bravo', roomCode: a.room.code, mode: 'private' });
    return { rm, emitted, room: a.room, player: a.player };
  }

  it('full serialization is unchanged: every entry carries the cold block', () => {
    const { rm, room } = twoPlayerRoom();
    for (const e of rm.serializePlayers(room)) {
      assert.ok(isColdEntry(e));
      for (const k of COLD_KEYS) assert.ok(k in e, `missing ${k}`);
    }
  });

  it('cold block follows changes (repeated for COLD_REPEAT_MS) and refresh snapshots only', () => {
    const { rm, room, player } = twoPlayerRoom();
    player.invulnerableUntil = 0; // spawn protection ending is a (legitimate) change; keep it out of this scenario
    const now = Date.now();
    const get = (t, refresh = false) => rm.serializePlayers(room, t, { refresh }).find((e) => e.id === player.id);

    assert.ok(isColdEntry(get(now)), 'first sight of a player sends the cold block');
    assert.ok(isColdEntry(get(now + COLD_REPEAT_MS - 1)), 'repeated while inside the window (volatile packets can be lost)');
    const hot = get(now + COLD_REPEAT_MS + 1);
    assert.equal(isColdEntry(hot), false, 'then hot fields only');
    for (const k of ['id', 'x', 'y', 'z', 'vx', 'vy', 'vz', 'yaw', 'pitch', 'hp', 'alive', 'weapon', 'crouching', 'prone', 'sliding', 'lean']) {
      assert.ok(k in hot, `hot entry missing ${k}`);
    }
    for (const k of ['name', 'color', 'kills', 'ammo', 'team']) assert.equal(k in hot, false, `${k} must not be in a hot entry`);

    const t = now + 5000;
    assert.equal(isColdEntry(get(t)), false);
    player.ammo -= 1;
    player.reserveAmmo -= 1;
    assert.equal(isColdEntry(get(t + 1)), false, 'ammo changes with every shot and is not a trigger (selfState carries it)');
    player.kills = 3;
    assert.ok(isColdEntry(get(t + 2)), 'a kill makes the scoreboard fields go out again');
    assert.equal(isColdEntry(get(t + 2 + COLD_REPEAT_MS + 5)), false);
    assert.ok(isColdEntry(get(t + 2 + COLD_REPEAT_MS + 10, true)), 'refresh snapshot carries everything');
    assert.ok(get(t + 3, true).ammo !== undefined);
  });

  it('boost countdown is not a change, starting or ending a boost is', () => {
    const { rm, room, player } = twoPlayerRoom();
    player.invulnerableUntil = 0;
    const now = Date.now();
    const get = (t) => rm.serializePlayers(room, t, { refresh: false }).find((e) => e.id === player.id);
    get(now);
    player.speedBoostUntil = now + 10_000;
    const t1 = now + COLD_REPEAT_MS + 50;
    const started = get(t1);
    assert.ok(isColdEntry(started) && started.speedBoostMs === 10_000 - (t1 - now));
    assert.equal(isColdEntry(get(t1 + COLD_REPEAT_MS + 50)), false, 'a running countdown does not resend');
    const ended = get(now + 10_001);
    assert.ok(isColdEntry(ended) && !('speedBoostMs' in ended), 'expiry is sent as an absent field');
  });

  it('stateUpdate: pickups / droppedWeapons only in refresh snapshots, hot entries much smaller', () => {
    const { rm, emitted, room } = twoPlayerRoom();
    rm.tick(0.04);
    rm.tick(0.04);
    const states = emitted.filter((e) => e.event === 'stateUpdate' && e.to === room.code).map((e) => e.payload);
    assert.ok(states.length >= 2);
    assert.ok(Array.isArray(states[0].pickups) && Array.isArray(states[0].droppedWeapons), 'first snapshot of a room is a refresh');
    assert.equal(states[1].pickups, undefined);
    assert.equal(states[1].droppedWeapons, undefined);
    assert.equal(states[1].seq, states[0].seq + 1);
    assert.ok(JSON.stringify(states[1]).length < JSON.stringify(states[0]).length * 0.7, 'in-between snapshot is clearly smaller');
  });
});

describe('PlayerStateCache (client)', () => {
  const full = (over = {}) => ({
    id: 'p1', name: 'Alpha', color: 1, team: null, ready: true, x: 1, y: 0, z: 2, vx: 0, vy: 0, vz: 0, yaw: 0, pitch: 0,
    crouching: false, prone: false, sliding: false, lean: 0, weapon: 'rifle', ammo: 30, reserveAmmo: 90, grenades: 1, hp: 100,
    alive: true, invulnerable: false, invulnerableUntil: 0, kills: 2, deaths: 1, streak: 0, ...over
  });

  it('hot-only entries update position but keep the cached cold fields', () => {
    const cache = new PlayerStateCache();
    cache.merge([full()]);
    const [p] = cache.merge([{ id: 'p1', x: 5, y: 0, z: 6, vx: 1, vy: 0, vz: 0, yaw: 1, pitch: 0, crouching: false, prone: false, sliding: false, lean: 0, weapon: 'rifle', hp: 80, alive: true }]);
    assert.equal(p.x, 5);
    assert.equal(p.hp, 80);
    assert.equal(p.name, 'Alpha');
    assert.equal(p.kills, 2);
    assert.equal(p.ammo, 30);
  });

  it('a cold block replaces the cold fields, including dropping optional ones that are no longer present', () => {
    const cache = new PlayerStateCache();
    cache.merge([full({ armor: 50, speedBoostMs: 4000 })]);
    const [p] = cache.merge([full({ kills: 3 })]);
    assert.equal(p.kills, 3);
    assert.equal('armor' in p, false);
    assert.equal('speedBoostMs' in p, false);
  });

  it('drops players that left, ignores junk, always returns a fresh array', () => {
    const cache = new PlayerStateCache();
    const a = cache.merge([full(), full({ id: 'p2', name: 'Bravo' })]);
    assert.equal(a.length, 2);
    const b = cache.merge([{ id: 'p2', x: 9 }, null, { x: 1 }]);
    assert.notEqual(a, b);
    assert.deepEqual(b.map((p) => p.id), ['p2']);
    assert.equal(b[0].name, 'Bravo');
    assert.equal(cache.byId.has('p1'), false);
    assert.deepEqual(cache.merge(undefined), []);
  });

  it('LanHub._target broadcasts directly over room Set without calling Array.from', async () => {
    const { LanHub } = await import('../server/lan/hub.js');
    const sent = [];
    const hub = new LanHub({
      send: (peerId, channel, text) => sent.push({ peerId, channel, text })
    });
    const s1 = hub.connect('peer1');
    const s2 = hub.connect('peer2');
    s1.join('ROOM1');
    s2.join('ROOM1');

    const origArrayFrom = Array.from;
    let arrayFromCalls = 0;
    Array.from = function (...args) {
      arrayFromCalls++;
      return origArrayFrom.apply(this, args);
    };
    try {
      hub.io.to('ROOM1').volatile.emit('stateUpdate', { t: 100 });
      s1.to('ROOM1').emit('remoteShot', { id: 'peer1' });
    } finally {
      Array.from = origArrayFrom;
    }
    assert.equal(arrayFromCalls, 0, 'LanHub broadcast should iterate Set directly without Array.from');
    assert.equal(sent.length, 3);
  });
});

describe('private rooms on the LAN server', () => {
  it('normalizeLanUrl accepts hosts / http(s) URLs and reduces them to an origin', () => {
    assert.equal(normalizeLanUrl('192.168.2.161:3000'), 'http://192.168.2.161:3000');
    assert.equal(normalizeLanUrl(' http://pc-office:3000/some/path?x=1 '), 'http://pc-office:3000');
    assert.equal(normalizeLanUrl('https://lan.example.com/'), 'https://lan.example.com');
    for (const bad of ['', '   ', null, undefined, 42, 'javascript:alert(1)', 'ftp://host', 'file:///etc/passwd', 'http://', 'a'.repeat(300)]) {
      assert.equal(normalizeLanUrl(bad), '', `rejects ${String(bad).slice(0, 20)}`);
    }
  });

  it('buildLanCreateUrl and parseCreateParams round-trip and sanitise', () => {
    const url = buildLanCreateUrl('http://192.168.2.161:3000', { name: '<b>Tu"</b>', mapId: 'cyber_citadel', gameMode: 'tdm' });
    assert.ok(url.startsWith('http://192.168.2.161:3000/?create=private'));
    const parsed = parseCreateParams(new URL(url).search);
    assert.deepEqual(parsed, { name: 'bTu/b', mapId: 'cyber_citadel', gameMode: 'tdm' });
    assert.equal(parseCreateParams('?room=ABC123'), null, 'an ordinary invite link is not a create request');
    assert.equal(parseCreateParams('?create=public'), null);
    assert.deepEqual(parseCreateParams('?create=private&map=../../x&mode=weird&name=' + 'n'.repeat(40)), { name: 'n'.repeat(16), mapId: '', gameMode: 'ffa' });
  });

  it('GET /api/config reports LAN_SERVER_URL (normalised) and null when unset', async () => {
    const run = async (env, port) => {
      const child = spawn(process.execPath, ['server/index.js'], { cwd: ROOT_DIR, env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, PORT: String(port), ...env }, stdio: 'ignore' });
      try {
        for (let i = 0; i < 50; i++) {
          try {
            return await (await fetch(`http://127.0.0.1:${ port }/api/config`)).json();
          } catch {
            await new Promise((r) => setTimeout(r, 100));
          }
        }
        throw new Error('server did not start');
      } finally {
        child.kill();
      }
    };
    assert.deepEqual(await run({ LAN_SERVER_URL: '192.168.2.161:3000' }, 3961), { lanUrl: 'http://192.168.2.161:3000' });
    assert.deepEqual(await run({ LAN_SERVER_URL: 'javascript:alert(1)' }, 3962), { lanUrl: null });
  });
});
