import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  RATE_LIMITS,
  safeHandler,
  isPlainObject,
  sanitizeObjectPayload,
  createRateLimiter,
  guardedOn,
  parseCorsOrigins,
  createCorsOriginCheck,
  createAllowRequest
} from '../server/socketGuard.js';

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const silent = { error() {}, warn() {}, log() {} };

function fakeClock(start = 1_000_000) {
  let t = start;
  const now = () => t;
  now.advance = (ms) => {
    t += ms;
  };
  return now;
}

function fakeSocket() {
  const handlers = new Map();
  return {
    id: 'sock-1',
    disconnected: false,
    on(event, fn) {
      handlers.set(event, fn);
    },
    disconnect() {
      this.disconnected = true;
    },
    fire(event, ...args) {
      return handlers.get(event)?.(...args);
    }
  };
}

describe('socketGuard: safeHandler', () => {
  it('swallows sync errors, logs the event name and never rethrows', () => {
    const logged = [];
    const wrapped = safeHandler('shoot', () => {
      throw new Error('boom');
    }, { error: (...a) => logged.push(a) });
    assert.doesNotThrow(() => wrapped({}));
    assert.equal(logged.length, 1);
    assert.match(String(logged[0][0]), /shoot/);
    assert.equal(logged[0][1].message, 'boom');
  });

  it('swallows async rejections and passes arguments / return values through', async () => {
    const logged = [];
    const logger = { error: (...a) => logged.push(a) };
    const rejecting = safeHandler('reload', async () => {
      throw new Error('late');
    }, logger);
    rejecting();
    await new Promise((r) => setImmediate(r));
    assert.equal(logged.length, 1);
    assert.match(String(logged[0][0]), /reload/);

    const ok = safeHandler('x', (a, b) => a + b, logger);
    assert.equal(ok(2, 3), 5);
  });
});

describe('socketGuard: payload sanity', () => {
  it('accepts plain objects, coerces undefined to {}, rejects everything else', () => {
    assert.equal(isPlainObject({}), true);
    assert.equal(isPlainObject(Object.create(null)), true);
    for (const bad of [null, [], 'str', 42, true, () => {}, Buffer.from('x'), new Map()]) {
      assert.equal(isPlainObject(bad), false);
      assert.equal(sanitizeObjectPayload(bad).ok, false);
    }
    assert.deepEqual(sanitizeObjectPayload(undefined), { ok: true, payload: {} });
    const obj = { a: 1 };
    assert.equal(sanitizeObjectPayload(obj).payload, obj);
  });

  it('guardedOn drops malformed payloads before the handler and keeps valid ones working', () => {
    const socket = fakeSocket();
    const limiter = createRateLimiter();
    const seen = [];
    guardedOn(socket, limiter, 'inputBatch', (p) => seen.push(p), { logger: silent });
    socket.fire('inputBatch', null);
    socket.fire('inputBatch', [1, 2]);
    socket.fire('inputBatch', 'hello');
    socket.fire('inputBatch', undefined);
    socket.fire('inputBatch', { x: 1 });
    assert.deepEqual(seen, [{}, { x: 1 }]);
    assert.equal(limiter.drops, 3, 'malformed payloads count towards the abuse budget');
  });

  it('guardedOn with expectObject:false passes scalar args and acks through', () => {
    const socket = fakeSocket();
    const limiter = createRateLimiter();
    let echoed = null;
    guardedOn(socket, limiter, 'pingCheck', (t, ack) => ack(t), { expectObject: false, logger: silent });
    socket.fire('pingCheck', 123, (v) => {
      echoed = v;
    });
    assert.equal(echoed, 123);
  });

  it('guardedOn never lets a throwing handler escape', () => {
    const socket = fakeSocket();
    guardedOn(socket, createRateLimiter(), 'inputBatch', () => {
      throw new Error('handler bug');
    }, { logger: silent });
    assert.doesNotThrow(() => socket.fire('inputBatch', {}));
  });
});

describe('socketGuard: rate limiter', () => {
  it('documents the per-event budget table', () => {
    assert.deepEqual(RATE_LIMITS.inputBatch, { rate: 40, burst: 60 });
    assert.equal(RATE_LIMITS.playerMove, undefined, 'the client-authoritative playerMove event no longer exists');
    assert.equal(RATE_LIMITS.shoot, undefined, 'the client-authoritative shoot event no longer exists (shots ride on inputBatch)');
    assert.equal(RATE_LIMITS.reload.rate, 5);
    assert.equal(RATE_LIMITS.throwGrenade.rate, 4);
    assert.equal(RATE_LIMITS.pickupWeapon.rate, 5);
    assert.equal(RATE_LIMITS.updateLoadout.rate, 2);
    assert.equal(RATE_LIMITS.setBots, undefined, 'the bot-count event was removed together with the bots');
    assert.equal(RATE_LIMITS.changeMap.rate, 1);
    assert.equal(RATE_LIMITS.joinRoom.rate, 2);
    assert.equal(RATE_LIMITS.pingCheck.rate, 5);
    assert.equal(RATE_LIMITS.default.rate, 20);
  });

  it('allows normal 30Hz movement and 10 shots/s indefinitely', () => {
    const now = fakeClock();
    const limiter = createRateLimiter({ now });
    for (let i = 0; i < 30 * 20; i += 1) {
      assert.equal(limiter.allow('inputBatch'), true, `inputBatch ${i}`);
      if (i % 10 === 0) assert.equal(limiter.allow('reload'), true, `reload ${i}`);
      now.advance(1000 / 30);
    }
    assert.equal(limiter.drops, 0);
    assert.equal(limiter.shouldDisconnect(), false);
  });

  it('drops a burst beyond capacity, then recovers as tokens refill', () => {
    const now = fakeClock();
    const limiter = createRateLimiter({ now });
    let allowed = 0;
    for (let i = 0; i < 100; i += 1) if (limiter.allow('inputBatch')) allowed += 1;
    assert.equal(allowed, 60, 'burst capacity of inputBatch');
    assert.equal(limiter.drops, 40);
    now.advance(1000);
    allowed = 0;
    for (let i = 0; i < 100; i += 1) if (limiter.allow('inputBatch')) allowed += 1;
    assert.equal(allowed, 40, 'one second refills `rate` tokens');
  });

  it('budgets are independent per event', () => {
    const limiter = createRateLimiter({ now: fakeClock() });
    for (let i = 0; i < 50; i += 1) limiter.allow('pickupWeapon');
    assert.equal(limiter.allow('inputBatch'), true);
    assert.equal(limiter.allow('changeMap'), true);
  });

  it('unknown events use the default budget', () => {
    const limiter = createRateLimiter({ now: fakeClock() });
    let allowed = 0;
    for (let i = 0; i < 100; i += 1) if (limiter.allow('whatever')) allowed += 1;
    assert.equal(allowed, RATE_LIMITS.default.burst);
  });

  it('flags and disconnects a socket after >500 drops within the 10s window', () => {
    const now = fakeClock();
    const socket = fakeSocket();
    const limiter = createRateLimiter({ now });
    let handled = 0;
    guardedOn(socket, limiter, 'inputBatch', () => {
      handled += 1;
    }, { logger: silent });
    for (let i = 0; i < 700; i += 1) socket.fire('inputBatch', {});
    assert.equal(socket.disconnected, true);
    assert.ok(handled <= 60 + 1, `only the burst reaches the handler (got ${handled})`);
    const before = handled;
    socket.fire('inputBatch', {});
    assert.equal(handled, before, 'flagged sockets are ignored');
  });

  it('does not disconnect when drops are spread across windows', () => {
    const now = fakeClock();
    const limiter = createRateLimiter({ now });
    for (let round = 0; round < 6; round += 1) {
      for (let i = 0; i < 200; i += 1) limiter.allow('inputBatch');
      now.advance(11_000);
    }
    assert.equal(limiter.shouldDisconnect(), false);
  });
});

describe('socketGuard: CORS / origin policy', () => {
  it('parses CORS_ORIGINS', () => {
    assert.deepEqual(parseCorsOrigins(undefined), []);
    assert.deepEqual(parseCorsOrigins(''), []);
    assert.deepEqual(parseCorsOrigins(' https://a.example/ , https://b.example,,'), [
      'https://a.example',
      'https://b.example'
    ]);
  });

  it('cors origin callback reflects only allow-listed origins', () => {
    const check = createCorsOriginCheck(['https://a.example']);
    const run = (origin) => {
      let out;
      check(origin, (_e, v) => {
        out = v;
      });
      return out;
    };
    assert.equal(run('https://a.example'), 'https://a.example');
    assert.equal(run('https://evil.example'), false);
    assert.equal(run(undefined), false);
    const none = createCorsOriginCheck([]);
    none('https://a.example', (_e, v) => assert.equal(v, false));
  });

  it('allowRequest: same-host and no-Origin pass, foreign origins are rejected unless listed', () => {
    const run = (allow, headers) => {
      let ok;
      createAllowRequest(allow)({ headers }, (_msg, success) => {
        ok = success;
      });
      return ok;
    };
    assert.equal(run([], { host: 'game.example' }), true, 'no Origin');
    assert.equal(run([], { host: 'game.example', origin: 'https://game.example' }), true, 'same host');
    assert.equal(run([], { host: 'game.example', origin: 'https://evil.example' }), false);
    assert.equal(run(['https://evil.example'], { host: 'game.example', origin: 'https://evil.example' }), true);
    assert.equal(run(['*'], { host: 'game.example', origin: 'https://x.example' }), true);
    assert.equal(run([], { host: 'game.example', origin: 'not a url' }), false);
  });
});

// ---------------------------------------------------------------------------
// Integration: spawn the real server/index.js on a free port and talk to it
// over the Engine.IO long-polling protocol with plain fetch (no client lib is
// installed). index.js binds process.env.PORT and cannot report an ephemeral
// port, so we pick a free port first (bind :0, read it, close it).
// ---------------------------------------------------------------------------
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

describe('socketGuard: live server hardening (real server/index.js)', () => {
  let child;
  let base;
  let port;
  let exited = false;
  const ALLOWED = 'https://frontend.example';

  before(async () => {
    port = await getFreePort();
    base = `http://127.0.0.1:${port}`;
    child = spawn(process.execPath, ['server/index.js'], {
      cwd: ROOT_DIR,
      env: { ...process.env, PORT: String(port), CORS_ORIGINS: ALLOWED },
      stdio: ['ignore', 'pipe', 'pipe']
    });
    child.on('exit', () => {
      exited = true;
    });
    child.stdout.resume();
    child.stderr.resume();
    const deadline = Date.now() + 15_000;
    for (;;) {
      try {
        const res = await fetch(`${base}/healthz`);
        if (res.ok) break;
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

  async function openPolling(origin) {
    const headers = origin ? { origin } : {};
    const res = await fetch(`${base}/socket.io/?EIO=4&transport=polling`, { headers });
    const text = await res.text();
    const sid = res.ok ? JSON.parse(text.slice(1)).sid : null;
    return { res, sid, headers };
  }

  async function send(sid, body) {
    return fetch(`${base}/socket.io/?EIO=4&transport=polling&sid=${sid}`, {
      method: 'POST',
      headers: { 'content-type': 'text/plain;charset=UTF-8' },
      body
    });
  }

  async function connectNamespace(sid) {
    assert.equal((await send(sid, '40')).status, 200);
    const res = await fetch(`${base}/socket.io/?EIO=4&transport=polling&sid=${sid}`);
    assert.match(await res.text(), /^40/);
  }

  it('same-origin and header-less clients can handshake; no CORS headers for same-origin', async () => {
    const plain = await openPolling();
    assert.equal(plain.res.status, 200);
    const same = await openPolling(base);
    assert.equal(same.res.status, 200);
    assert.equal(same.res.headers.get('access-control-allow-origin'), null);
  });

  it('rejects a foreign Origin, accepts an allow-listed one with a reflected ACAO header', async () => {
    const evil = await openPolling('https://evil.example');
    assert.equal(evil.res.status, 403);
    const listed = await openPolling(ALLOWED);
    assert.equal(listed.res.status, 200);
    assert.equal(listed.res.headers.get('access-control-allow-origin'), ALLOWED);
  });

  it('survives malformed payloads on every event (server stays up)', async () => {
    const { sid } = await openPolling();
    await connectNamespace(sid);
    const events = ['joinRoom', 'inputBatch', 'shoot', 'throwGrenade', 'reload', 'pickupWeapon', 'updateLoadout', 'changeMap', 'setBots' /* legacy event of old clients: ignored */];
    const bad = ['null', '"str"', '[1,2]', '12345'];
    // Join a real room first so the handler bodies (not just the early returns) are reachable.
    const packets = ['42["joinRoom",{"name":"tester"}]'];
    for (const ev of events) for (const b of bad) packets.push(`42["${ev}",${b}]`);
    packets.push('42["pingCheck"]', '42["leaveRoom",null]');
    const res = await send(sid, packets.join('\x1e'));
    assert.equal(res.status, 200);
    await new Promise((r) => setTimeout(r, 200));
    const health = await fetch(`${base}/healthz`);
    assert.equal(health.status, 200);
    assert.equal(exited, false, 'server process must not crash');
  });

  it('disconnects a socket that floods events, and keeps serving others', async () => {
    const { sid } = await openPolling();
    await connectNamespace(sid);
    const flood = Array.from({ length: 900 }, () => '42["inputBatch",{}]').join('\x1e');
    assert.equal((await send(sid, flood)).status, 200);
    await new Promise((r) => setTimeout(r, 300));
    const poll = await fetch(`${base}/socket.io/?EIO=4&transport=polling&sid=${sid}`);
    const text = await poll.text();
    assert.ok(poll.status === 400 || /41/.test(text), `expected a closed session, got ${poll.status} ${text}`);
    assert.equal((await fetch(`${base}/healthz`)).status, 200);
    assert.equal(exited, false);
  });

  it('enforces maxHttpBufferSize (100 KB) on incoming payloads', async () => {
    const { sid } = await openPolling();
    await connectNamespace(sid);
    const huge = `42["inputBatch",{"pad":"${'a'.repeat(150_000)}"}]`;
    const res = await send(sid, huge);
    assert.notEqual(res.status, 200);
    assert.equal((await fetch(`${base}/healthz`)).status, 200);
  });
});
