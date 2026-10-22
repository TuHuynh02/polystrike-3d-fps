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
