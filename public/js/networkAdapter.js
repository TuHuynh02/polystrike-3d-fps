// Network client for POLYSTRIKE 3D
// The game is played ONLY through the dedicated Node.js / Socket.IO server (Render.com).
// The client connects to the same origin, or to ?server=URL / window.POLYSTRIKE_SERVER_URL.
// If the Socket.IO client library is missing the returned promise rejects with
// SERVER_UNREACHABLE_MESSAGE; connection drops after startup surface through the
// socket's own `connect_error` / `disconnect` events (handled in main.js).

import { BTN } from '../shared/netcode.js';

export const SERVER_UNREACHABLE_MESSAGE = 'Không kết nối được máy chủ';

function batchHasFire(payload) {
  const cmds = payload?.cmds;
  if (!Array.isArray(cmds)) return false;
  for (let i = 0; i < cmds.length; i++) {
    if ((cmds[i].btn & BTN.FIRE) !== 0) return true;
  }
  return false;
}
const KEEP_ALIVE_INTERVAL_MS = 240_000; // Render free tier sleeps after ~15 min idle

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
      ? window.io(customServer, { transports: ['websocket', 'polling'], upgrade: true })
      : window.io({ transports: ['websocket', 'polling'], upgrade: true });
  } catch {
    throw new Error(SERVER_UNREACHABLE_MESSAGE);
  }

  const origEmit = rawSocket.emit.bind(rawSocket);
  rawSocket.emit = (event, payload, ack) => {
    // Input batches are volatile: a late batch is useless (newer ones repeat the unacked commands anyway) - except a batch
    // that carries a shot (FIRE bit): the shot only exists inside the command stream, so it must not be dropped
    if (event === 'inputBatch' && rawSocket.volatile && !batchHasFire(payload)) {
      rawSocket.volatile.emit('inputBatch', payload);
      return;
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
