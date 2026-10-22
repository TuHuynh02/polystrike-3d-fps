// Helpers for "private rooms live on the office LAN server".
//
// The public site (e.g. on Render, https) is the default. A LAN server (`npm run lan` on an office PC) is configured as
// LAN_SERVER_URL on the public server (/api/config) or typed into the lobby by the host. Creating a private room on the public
// site then navigates to the LAN server, which creates the room (?create=private...) and shows its own LAN share link.
// The target comes only from that configuration, never from a URL parameter, so a crafted link cannot redirect players.

export const CREATE_PARAM = 'create';

/**
 * "192.168.2.161:3000" | "http://pc-office:3000/anything" -> "http://192.168.2.161:3000" (origin only).
 * Returns '' for anything that is not an http(s) URL with a host.
 */
export function normalizeLanUrl(raw) {
  if (typeof raw !== 'string') return '';
  const text = raw.trim();
  if (!text || text.length > 200) return '';
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : `http://${ text }`;
  try {
    const url = new URL(withScheme);
    if ((url.protocol !== 'http:' && url.protocol !== 'https:') || !url.hostname) return '';
    return url.origin;
  } catch {
    return '';
  }
}

function cleanName(raw) {
  return String(raw ?? '').replace(/[<>&"'`]/g, '').trim().slice(0, 16);
}

/** URL on the LAN server that creates a private room with the player's name / map / mode. */
export function buildLanCreateUrl(lanUrl, { name = '', mapId = '', gameMode = 'ffa' } = {}) {
  const url = new URL('/', lanUrl);
  url.searchParams.set(CREATE_PARAM, 'private');
  const n = cleanName(name);
  if (n) url.searchParams.set('name', n);
  if (/^[a-z0-9_]{1,32}$/i.test(mapId)) url.searchParams.set('map', mapId);
  url.searchParams.set('mode', gameMode === 'tdm' ? 'tdm' : 'ffa');
  return url.toString();
}

/** `?create=private&name=&map=&mode=` -> { name, mapId, gameMode } or null when the page was not opened for creating a room. */
export function parseCreateParams(search) {
  let params;
  try {
    params = new URLSearchParams(search || '');
  } catch {
    return null;
  }
  if (params.get(CREATE_PARAM) !== 'private') return null;
  const map = params.get('map') || '';
  return {
    name: cleanName(params.get('name')),
    mapId: /^[a-z0-9_]{1,32}$/i.test(map) ? map : '',
    gameMode: params.get('mode') === 'tdm' ? 'tdm' : 'ffa'
  };
}

// ---- In-browser LAN rooms (a player's browser hosts the game, guests join through WebRTC) ----
// Host page:   /?lanhost=CODE&name=&map=&mode=      (opened by "Chơi qua LAN" + "Tạo phòng riêng")
// Guest link:  /?room=CODE&lan=1                     (the share link of such a room)

export const LAN_HOST_PARAM = 'lanhost';
export const LAN_GUEST_PARAM = 'lan';

const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // same alphabet as the server's generateRoomCode

/** 6-character room code from the same alphabet as server-generated codes (no 0/O/1/I). */
export function generateLanRoomCode(randomBytes = (n) => globalThis.crypto.getRandomValues(new Uint8Array(n))) {
  const bytes = randomBytes(6);
  let code = '';
  for (let i = 0; i < 6; i++) code += ROOM_CODE_ALPHABET[bytes[i] % ROOM_CODE_ALPHABET.length];
  return code;
}

function cleanCode(raw) {
  return String(raw ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
}

export function buildLanHostUrl(origin, { code, name = '', mapId = '', gameMode = 'ffa' } = {}) {
  const url = new URL('/', origin);
  url.searchParams.set(LAN_HOST_PARAM, cleanCode(code));
  const n = cleanName(name);
  if (n) url.searchParams.set('name', n);
  if (/^[a-z0-9_]{1,32}$/i.test(mapId)) url.searchParams.set('map', mapId);
  url.searchParams.set('mode', gameMode === 'tdm' ? 'tdm' : 'ffa');
  return url.toString();
}

/** `?lanhost=CODE&name=&map=&mode=` -> { code, name, mapId, gameMode } or null. */
export function parseLanHostParams(search) {
  let params;
  try {
    params = new URLSearchParams(search || '');
  } catch {
    return null;
  }
  const code = cleanCode(params.get(LAN_HOST_PARAM));
  if (code.length !== 6) return null;
  const map = params.get('map') || '';
  return {
    code,
    name: cleanName(params.get('name')),
    mapId: /^[a-z0-9_]{1,32}$/i.test(map) ? map : '',
    gameMode: params.get('mode') === 'tdm' ? 'tdm' : 'ffa'
  };
}

/** `?room=CODE&lan=1` -> { code } or null. */
export function parseLanGuestParams(search) {
  let params;
  try {
    params = new URLSearchParams(search || '');
  } catch {
    return null;
  }
  if (params.get(LAN_GUEST_PARAM) !== '1') return null;
  const code = cleanCode(params.get('room'));
  return code.length === 6 ? { code } : null;
}

