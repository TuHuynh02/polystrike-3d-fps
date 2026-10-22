// Entry point of "Chơi qua LAN": decides at page start whether this page is the HOST (?lanhost=CODE...) or a GUEST (?room=CODE&lan=1)
// of an in-browser LAN room and, if so, swaps the game socket of the network client for the LAN socket. The Socket.IO connection
// to the public server stays open as `signalSocket` (WebRTC handshake only).

import { parseLanGuestParams, parseLanHostParams } from '../shared.js';

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

/**
 * @returns {Promise<null | { role: 'host'|'guest', code: string, name?: string, mapId?: string, gameMode?: string, session?: object, error?: string }>}
 * null = an ordinary page. On failure to start hosting, `error` is set and the network client is left untouched (plain online play).
 */
export async function setupLanMode(netClient, search = window.location.search) {
  const host = parseLanHostParams(search);
  const guest = host ? null : parseLanGuestParams(search);
  if (!host && !guest) return null;

  const signalSocket = netClient.socket;
  const role = host ? 'host' : 'guest';
  const code = (host || guest).code;

  if (netClient.mode !== 'online-server') {
    return { role, code, error: 'signaling_timeout' };
  }

  let session;
  try {
    if (host) {
      // One-shot parameters: a reload must not start hosting again.
      window.history.replaceState(null, '', window.location.pathname || '/');
      const { startLanHost } = await import('./hostSession.js');
      session = await startLanHost({ signalSocket, code });
    } else {
      const { startLanGuest } = await import('./guestSession.js');
      session = startLanGuest({ signalSocket, code });
    }
  } catch (err) {
    return { role, code, name: host?.name, mapId: host?.mapId, gameMode: host?.gameMode, error: err?.message || 'failed' };
  }

  netClient.signalSocket = signalSocket;
  netClient.socket = session.socket;
  netClient.mode = `lan-${ role }`;
  netClient.fetchRooms = async () => []; // no public room list inside a LAN room
  return { role, code, name: host?.name, mapId: host?.mapId, gameMode: host?.gameMode, session };
}
