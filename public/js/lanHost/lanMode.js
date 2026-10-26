// Entry point of "Chơi qua LAN": decides at page start whether this page is the HOST (?lanhost=CODE...) or a GUEST (?room=CODE&lan=1)
// of an in-browser LAN room and, if so, swaps the game socket of the network client for the LAN socket. The Socket.IO connection
// to the public server stays open as `signalSocket` (WebRTC handshake only).

import { parseLanGuestParams, parseLanHostParams } from '../shared.js';
import { startLanHost } from './hostSession.js';
import { startLanGuest } from './guestSession.js';

/** User-facing text for the error code carried by a LAN socket's `connect_error`. */
export function lanErrorText(code) {
  switch (code) {
    case 'no_host': return 'Phòng LAN không còn nữa: chủ phòng đã thoát hoặc mã phòng sai.';
    case 'room_full': return 'Phòng LAN đã đủ người.';
    case 'timeout': return 'Không nối được LAN sau 12 giây. Hãy chắc chắn bạn đang cùng mạng (Wi-Fi/LAN) với chủ phòng.';
    case 'code_in_use': return 'Mã phòng này đang được dùng. Hãy tạo phòng LAN lại.';
    case 'signaling_timeout': return 'Không liên lạc được máy chủ để bắt tay kết nối LAN. Thử tải lại trang.';
    default: return 'Không thể tạo/nối phòng LAN. Thử tải lại trang hoặc dùng phòng thường.';
  }
}

export const LAN_LOST_MESSAGE = 'Mất kết nối LAN: chủ phòng đã thoát hoặc rớt mạng. Tải lại trang để vào lại.';

function preserveOnlineClient(netClient, signalSocket) {
  if (!netClient.signalSocket) {
    netClient.signalSocket = signalSocket;
  }
  if (!netClient.onlineFetchRooms && typeof netClient.fetchRooms === 'function') {
    netClient.onlineFetchRooms = netClient.fetchRooms;
  }
}

/**
 * Starts a LAN host session in-place (hot-swapping `netClient.socket` without reloading the page).
 */
export async function activateLanHostSession(
  netClient,
  { code, name = '', mapId = '', gameMode = 'ffa', startHostFn = null, isCancelled = null } = {},
  opts = {}
) {
  const signalSocket = netClient?.signalSocket || netClient?.socket;
  if (!signalSocket || (netClient?.mode && netClient.mode !== 'online-server' && !netClient.signalSocket)) {
    throw new Error('signaling_timeout');
  }
  const hostStarter = startHostFn || opts?.startHost || opts?.startHostFn || startLanHost;
  const session = await hostStarter({ signalSocket, code, mapId, gameMode });
  if (typeof isCancelled === 'function' && isCancelled()) {
    try { session?.stop?.(); } catch { /* ignore */ }
    return null;
  }
  preserveOnlineClient(netClient, signalSocket);
  netClient.socket = session.socket;
  netClient.mode = 'lan-host';
  netClient.fetchRooms = typeof session.fetchRooms === 'function' ? session.fetchRooms : async () => [];
  return {
    role: 'host',
    code,
    name,
    mapId,
    gameMode,
    session,
    peerCount: session.peerCount,
    hasGuests: session.hasGuests,
    stop: session.stop
  };
}

/**
 * Starts a LAN guest session in-place (hot-swapping `netClient.socket` without reloading the page).
 */
export async function activateLanGuestSession(
  netClient,
  { code, startGuestFn = null, isCancelled = null } = {},
  opts = {}
) {
  const signalSocket = netClient?.signalSocket || netClient?.socket;
  if (!signalSocket || (netClient?.mode && netClient.mode !== 'online-server' && !netClient.signalSocket)) {
    throw new Error('signaling_timeout');
  }
  const guestStarter = startGuestFn || opts?.startGuest || opts?.startGuestFn || startLanGuest;
  const session = await guestStarter({ signalSocket, code });
  if (typeof isCancelled === 'function' && isCancelled()) {
    try { session?.stop?.(); } catch { /* ignore */ }
    return null;
  }
  preserveOnlineClient(netClient, signalSocket);
  netClient.socket = session.socket;
  netClient.mode = 'lan-guest';
  netClient.fetchRooms = async () => [];
  return {
    role: 'guest',
    code,
    session,
    stop: session.stop
  };
}

/**
 * Stops an active LAN session and restores the online Socket.IO socket + fetchRooms on `netClient`.
 */
export function restoreOnlineSession(netClient, lanInfo = null) {
  try {
    if (typeof lanInfo?.session?.stop === 'function') {
      lanInfo.session.stop();
    } else if (typeof lanInfo?.stop === 'function') {
      lanInfo.stop();
    }
  } catch {
    // ignore cleanup errors
  }
  if (netClient?.signalSocket) {
    netClient.socket = netClient.signalSocket;
    netClient.mode = 'online-server';
    if (typeof netClient.onlineFetchRooms === 'function') {
      netClient.fetchRooms = netClient.onlineFetchRooms;
    }
  }
  return netClient?.socket || null;
}

/**
 * Returns true when this client is hosting a LAN room that currently has other players connected,
 * so `beforeunload` should warn before accidental F5 / tab close.
 */
export function shouldWarnLanHostBeforeUnload(state) {
  if (!state || state.lanInfo?.role !== 'host') return false;
  const peerCount = Number(state.lanInfo?.session?.peerCount?.() ?? state.lanInfo?.peerCount?.()) || 0;
  const hasGuests = Boolean(state.lanInfo?.session?.hasGuests?.() || state.lanInfo?.hasGuests?.());
  const playerCount = Array.isArray(state.latestPlayers) ? state.latestPlayers.length : 0;
  return peerCount > 0 || hasGuests || playerCount > 1;
}

/**
 * @returns {Promise<null | { role: 'host'|'guest', code: string, name?: string, mapId?: string, gameMode?: string, session?: object, error?: string }>}
 * null = an ordinary page. On failure to start hosting, `error` is set and the network client is left untouched (plain online play).
 */
export async function setupLanMode(netClient, search = window.location.search) {
  const host = parseLanHostParams(search);
  const guest = host ? null : parseLanGuestParams(search);
  if (!host && !guest) return null;

  const role = host ? 'host' : 'guest';
  const code = (host || guest).code;

  if (netClient.mode !== 'online-server' && !netClient.signalSocket) {
    return { role, code, error: 'signaling_timeout' };
  }

  try {
    if (host) {
      // One-shot parameters: a reload must not start hosting again.
      window.history.replaceState(null, '', window.location.pathname || '/');
      return await activateLanHostSession(netClient, {
        code,
        name: host.name,
        mapId: host.mapId,
        gameMode: host.gameMode
      });
    }
    return await activateLanGuestSession(netClient, { code });
  } catch (err) {
    return { role, code, name: host?.name, mapId: host?.mapId, gameMode: host?.gameMode, error: err?.message || 'failed' };
  }
}
