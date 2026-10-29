// Socket hardening helpers: crash-proof handlers, per-socket token-bucket rate
// limiting, payload sanity checks and CORS/origin allow-list parsing.
// Pure module (no Socket.IO import) so it can be unit tested in isolation.

/** Per-event budgets: `rate` tokens per second, `burst` bucket capacity. */
export const RATE_LIMITS = Object.freeze({
  inputBatch: { rate: 40, burst: 60 }, // client sends ~30 input batches/s (see public/js/prediction.js); shots ride on it (FIRE bit)
  reload: { rate: 5, burst: 8 },
  throwGrenade: { rate: 4, burst: 6 },
  pickupWeapon: { rate: 5, burst: 8 },
  requestRespawn: { rate: 5, burst: 8 },
  updateLoadout: { rate: 2, burst: 5 },
  changeMap: { rate: 1, burst: 3 },
  joinRoom: { rate: 2, burst: 4 },
  switchTeam: { rate: 2, burst: 4 },
  setTeamReady: { rate: 2, burst: 4 },
  startTeamMatch: { rate: 1, burst: 3 },
  leaveRoom: { rate: 2, burst: 4 },
  pingCheck: { rate: 5, burst: 10 },
  default: { rate: 20, burst: 30 }
});

export const ABUSE_DROP_LIMIT = 500; // dropped events ...
export const ABUSE_WINDOW_MS = 10_000; // ... within this window => disconnect

/**
 * Wrap a socket event handler so that it can never throw into the event loop.
 * Errors are logged with the event name and swallowed.
 */
export function safeHandler(name, fn, logger = console) {
  return function safeWrapped(...args) {
    try {
      const result = fn.apply(this, args);
      if (result && typeof result.then === 'function') {
        result.then(undefined, (err) => {
          logger.error(`[socket] unhandled rejection in "${name}":`, err);
        });
      }
      return result;
    } catch (err) {
      logger.error(`[socket] error in "${name}":`, err);
      return undefined;
    }
  };
}

/** True for plain `{}`-like objects (not null, arrays, strings, numbers, Buffers). */
export function isPlainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/**
 * Normalise a payload for events that expect an object.
 * `undefined` becomes `{}` (matches the old `payload = {}` default);
 * anything that is not a plain object is rejected.
 */
export function sanitizeObjectPayload(payload) {
  if (payload === undefined) return { ok: true, payload: {} };
  if (isPlainObject(payload)) return { ok: true, payload };
  return { ok: false, payload: undefined };
}

/**
 * Per-socket rate limiter. `allow(event)` consumes a token; returns false when
 * the event must be silently dropped. `shouldDisconnect()` flips to true after
 * sustained abuse.
 */
export function createRateLimiter({
  limits = RATE_LIMITS,
  now = () => Date.now(),
  abuseDropLimit = ABUSE_DROP_LIMIT,
  abuseWindowMs = ABUSE_WINDOW_MS
} = {}) {
  const buckets = new Map();
  let totalDrops = 0;
  let windowDrops = 0;
  let windowStart = now();
  let abusive = false;

  function bucketFor(event, t) {
    let bucket = buckets.get(event);
    if (!bucket) {
      const cfg = limits[event] || limits.default;
      bucket = { cfg, tokens: cfg.burst, last: t };
      buckets.set(event, bucket);
    }
    return bucket;
  }

  function recordDrop(t) {
    totalDrops += 1;
    if (t - windowStart > abuseWindowMs) {
      windowStart = t;
      windowDrops = 0;
    }
    windowDrops += 1;
    if (windowDrops > abuseDropLimit) abusive = true;
  }

  return {
    allow(event) {
      const t = now();
      const bucket = bucketFor(event, t);
      const elapsed = Math.max(0, t - bucket.last) / 1000;
      bucket.last = t;
      bucket.tokens = Math.min(bucket.cfg.burst, bucket.tokens + elapsed * bucket.cfg.rate);
      if (bucket.tokens >= 1) {
        bucket.tokens -= 1;
        return true;
      }
      recordDrop(t);
      return false;
    },
    /** Count a rejected (malformed) payload towards the abuse budget. */
    recordInvalid() {
      recordDrop(now());
    },
    shouldDisconnect() {
      return abusive;
    },
    get drops() {
      return totalDrops;
    }
  };
}

/**
 * Register `socket.on(event, ...)` with rate limiting, payload sanity and crash
 * protection. `limiter` comes from createRateLimiter(); one per socket.
 *
 * options.expectObject (default true): first argument must be a plain object
 * (undefined is coerced to {}). Set false for events with scalar/ack args.
 */
export function guardedOn(socket, limiter, event, handler, { expectObject = true, logger = console } = {}) {
  const safe = safeHandler(event, handler, logger);
  const disconnectAbusive = (reason) => {
    if (socket.disconnected) return;
    logger.warn(`[socket] disconnecting ${socket.id} for ${reason} (last event "${event}")`);
    try {
      socket.disconnect(true);
    } catch (err) {
      logger.error('[socket] disconnect failed:', err);
    }
  };
  socket.on(event, (...args) => {
    if (limiter.shouldDisconnect()) {
      disconnectAbusive('sustained abuse');
      return;
    }
    if (!limiter.allow(event)) {
      if (limiter.shouldDisconnect()) {
        disconnectAbusive('sustained flooding');
      }
      return;
    }
    if (expectObject) {
      const checked = sanitizeObjectPayload(args[0]);
      if (!checked.ok) {
        limiter.recordInvalid();
        if (limiter.shouldDisconnect()) {
          disconnectAbusive('malformed payload flood');
        }
        return;
      }
      args[0] = checked.payload;
    }
    safe(...args);
  });
}

/**
 * Parse CORS_ORIGINS ("https://a.example, https://b.example") into a clean list.
 * Trailing slashes are stripped; "*" is honoured as an explicit wildcard.
 */
export function parseCorsOrigins(raw) {
  if (typeof raw !== 'string') return [];
  return raw
    .split(',')
    .map((s) => s.trim().replace(/\/+$/, ''))
    .filter(Boolean);
}

/**
 * Build the Socket.IO `cors.origin` callback (cors package contract): allowed
 * origins are reflected; everything else receives no CORS headers, so browsers
 * on other origins cannot read polling responses. Same-origin page loads never
 * need CORS headers, so the default (empty list) is "same-origin only".
 */
export function createCorsOriginCheck(allowList) {
  const wildcard = allowList.includes('*');
  const set = new Set(allowList);
  return (origin, cb) => {
    if (!origin) return cb(null, false);
    cb(null, wildcard || set.has(origin) ? origin : false);
  };
}

/**
 * Socket.IO/engine.io `allowRequest` hook. CORS headers do not gate WebSocket
 * upgrades, so enforce the same policy on the handshake: requests carrying an
 * Origin header must be same-host or allow-listed. Requests without an Origin
 * (non-browser clients, same-origin polling GETs) pass.
 */
export function createAllowRequest(allowList) {
  const wildcard = allowList.includes('*');
  const set = new Set(allowList);
  return (req, cb) => {
    const origin = req.headers?.origin;
    if (!origin || wildcard || set.has(origin)) return cb(null, true);
    let originHost = '';
    try {
      originHost = new URL(origin).host;
    } catch {
      return cb('Origin not allowed', false);
    }
    const host = String(req.headers?.['x-forwarded-host'] || req.headers?.host || '')
      .split(',')[0]
      .trim();
    if (host && originHost === host) return cb(null, true);
    return cb('Origin not allowed', false);
  };
}

/**
 * Prevents Socket.IO's `socket.volatile.emit(...)` from falsely dropping packets
 * when multiple events (`moveAck`, `selfState`, `shotFired`, `stateUpdate`) are emitted
 * synchronously in the same server tick.
 *
 * By default, Socket.IO (`Client.writeToEngine`) drops volatile packets whenever
 * `!conn.transport.writable`. In Engine.IO's WebSocket transport, `writable` is set to
 * `false` immediately upon the FIRST `ws.send()` in a tick and only resets to `true`
 * in the asynchronous `ws.send` completion callback — after `RoomManager.tick()` has
 * already finished. Emitting `moveAck` or `selfState` first in `tick()` would therefore
 * cause `io.to(roomCode).volatile.emit('stateUpdate', ...)` in the same tick to be
 * silently discarded even when the WebSocket has zero backpressure.
 *
 * This wrapper preserves genuine backpressure protection (dropping volatile packets when
 * `conn.writeBuffer.length >= 6` or `ws.bufferedAmount >= 32768`), while queueing
 * same-tick volatile packets into Engine.IO's `writeBuffer` when the socket is simply
 * mid-flush from an earlier packet in the same tick.
 */
export function installSmartVolatile(socket) {
  const client = socket?.client;
  if (!client || client._smartVolatileInstalled || typeof client.writeToEngine !== 'function') {
    return;
  }
  client._smartVolatileInstalled = true;
  const origWriteToEngine = client.writeToEngine.bind(client);
  client.writeToEngine = function smartWriteToEngine(encodedPackets, opts) {
    if (opts && opts.volatile) {
      const conn = this.conn;
      const transport = conn?.transport;
      if (conn && transport && !transport.writable) {
        const writeBufLen = Array.isArray(conn.writeBuffer) ? conn.writeBuffer.length : 0;
        const wsBuffered = transport.socket?.bufferedAmount ?? 0;
        if (writeBufLen < 6 && wsBuffered < 32768) {
          return origWriteToEngine(encodedPackets, { ...opts, volatile: false });
        }
      }
    }
    return origWriteToEngine(encodedPackets, opts);
  };
}

