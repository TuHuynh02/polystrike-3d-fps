// Network client for POLYSTRIKE 3D
// The game is played ONLY through the dedicated Node.js / Socket.IO server (Render.com).
// The client connects to the same origin, or to ?server=URL / window.POLYSTRIKE_SERVER_URL.
// If the Socket.IO client library is missing the returned promise rejects with
// SERVER_UNREACHABLE_MESSAGE; connection drops after startup surface through the
// socket's own `connect_error` / `disconnect` events (handled in main.js).

import { BTN } from '../shared/netcode.js';

export const SERVER_UNREACHABLE_MESSAGE = 'Không kết nối được máy chủ';

/**
 * A dropped connection in the middle of a match used to be silent: the socket reconnects under a NEW id that is in no room,
 * so no stateUpdate ever arrives again and every opponent stays frozen where they were last seen. This watches the socket:
 * a disconnect while `isInMatch()` marks the match as lost; the next `connect` calls `onLost()` once (so the UI can say so)
 * and then `rejoin()` (clear stale remote players, join the same room again). Returns the state object.
 */
export function installRejoinOnReconnect(socket, { isInMatch, onLost, onReconnected, rejoin }) {
  const state = { lost: false, rejoins: 0 };
  socket.on?.('disconnect', () => {
    if (!isInMatch()) return;
    state.lost = true;
    onLost?.();
  });
  socket.on?.('connect', () => {
    if (!state.lost) return;
    state.lost = false;
    state.rejoins++;
    rejoin();
    onReconnected?.();
  });
  return state;
}

function batchHasFire(payload) {
  const cmds = payload?.cmds;
  if (!Array.isArray(cmds)) return false;
  for (let i = 0; i < cmds.length; i++) {
    if ((cmds[i].btn & BTN.FIRE) !== 0) return true;
  }
  return false;
}
const KEEP_ALIVE_INTERVAL_MS = 240_000; // Render free tier sleeps after ~15 min idle

// Transport policy. A pure WebSocket is tried first: Socket.IO's default (polling first, upgrade later) can leave a client
// on HTTP long-polling for a long time - every packet then costs a request/response, batches queue up behind each other and
// remote players stutter. Polling is only the FALLBACK, enabled when the very first connection attempt fails (a proxy
// that blocks WebSocket); once connected it still upgrades to WebSocket.
export const TRANSPORTS_FIRST = Object.freeze(['websocket']);
export const TRANSPORTS_FALLBACK = Object.freeze(['polling', 'websocket']);

/** Builds the Socket.IO client options (a fresh, mutable copy: socket.io-client keeps and later edits it). */
export function buildSocketOptions() {
  return { transports: [...TRANSPORTS_FIRST], upgrade: true };
}

/**
 * After a failed first connection attempt (never connected yet) switch the manager to long-polling + upgrade for the
 * following attempts. Returns an object whose `fellBack` flag tells whether it happened.
 */
export function installTransportFallback(socket) {
  const state = { fellBack: false, everConnected: false };
  socket.on?.('connect', () => {
    state.everConnected = true;
  });
  socket.on?.('connect_error', () => {
    if (state.everConnected || state.fellBack) return;
    const opts = socket.io?.opts;
    if (!opts) return;
    opts.transports = [...TRANSPORTS_FALLBACK];
    state.fellBack = true;
  });
  return state;
}

export async function createNetworkClient() {
  const params = new URLSearchParams(window.location.search);
  const customServer = (params.get('server') || window.POLYSTRIKE_SERVER_URL || '').replace(/\/$/, '');

  if (typeof window.io !== 'function') {
    throw new Error(SERVER_UNREACHABLE_MESSAGE);
  }

  const apiUrl = customServer ? `${customServer}/api/rooms` : './api/rooms';
  const healthUrl = customServer ? `${customServer}/healthz` : './healthz';

  let rawSocket;
  try {
    rawSocket = customServer
      ? window.io(customServer, buildSocketOptions())
      : window.io(buildSocketOptions());
    installTransportFallback(rawSocket);
  } catch {
    throw new Error(SERVER_UNREACHABLE_MESSAGE);
  }

  const origEmit = rawSocket.emit.bind(rawSocket);
  rawSocket.emit = (event, payload, ack) => {
    // Input batches are volatile: a late batch is useless (newer ones repeat the unacked commands anyway) - except a batch
    // that carries a shot (FIRE bit): the shot only exists inside the command stream, so it must not be dropped
    // NOTE: Socket.IO's `socket.volatile` getter sets the flag and returns the SAME socket, so calling `.emit` on it would
    // re-enter this wrapper forever (stack overflow, nothing ever sent). Set the flag, then call the ORIGINAL emit.
    if (event === 'inputBatch' && !batchHasFire(payload)) {
      void rawSocket.volatile;
    }
    return origEmit(event, payload, ack);
  };

  // Keep Render.com HTTP router awake every 4 minutes while a player has the game open
  setInterval(() => {
    fetch(healthUrl, { cache: 'no-store' }).catch(() => {});
  }, KEEP_ALIVE_INTERVAL_MS);

  return {
    mode: 'online-server',
    socket: rawSocket,
    fetchRooms: async () => {
      const r = await fetch(apiUrl);
      if (!r.ok) throw new Error(SERVER_UNREACHABLE_MESSAGE);
      const data = await r.json();
      return data.rooms || [];
    }
  };
}
