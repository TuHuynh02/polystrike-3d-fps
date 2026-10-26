// WebRTC signaling for "LAN rooms" (a player's browser hosts the game, see server/lan and public/js/lanHost).
//
// The public server never sees game traffic: it only introduces a host and its guests and relays their SDP / ICE messages. Once
// the data channels are open, the game flows directly between the browsers on the local network.
//
//   host   -> lanHostOpen { code }           -> ack { ok } | { ok: false, error }
//   guest  -> lanGuestJoin { code }          -> ack { ok, peerId } | { ok: false, error: 'no_host' }
//   host   <- lanPeer { peerId }             (a guest wants to join: the host starts the WebRTC offer)
//   either -> lanSignal { to, data }  =>  other end <- lanSignal { from, data }     (to = peerId, or 'host' from a guest)
//   guests <- lanHostGone {}  /  host <- lanPeerGone { peerId }

import { DEFAULT_MAP_ID, MATCH_CONFIG, getMapConfig } from '../shared/constants.js';
import { guardedOn, createRateLimiter } from './socketGuard.js';
import { sanitizeGameMode, sanitizeMapId, sanitizeRoomCode } from './room/sanitizers.js';

const MAX_SIGNAL_CHARS = 20_000; // a full SDP is ~2-6 KB
const MAX_GUESTS_PER_HOST = 12;
const SIGNAL_TYPES = new Set(['offer', 'answer', 'candidate']);

export const LAN_SIGNAL_LIMITS = Object.freeze({
  lanHostOpen: { rate: 1, burst: 3 },
  lanHostUpdate: { rate: 5, burst: 10 },
  lanGuestJoin: { rate: 2, burst: 4 },
  lanCheck: { rate: 10, burst: 20 },
  lanLeave: { rate: 5, burst: 10 },
  lanSignal: { rate: 40, burst: 80 } // an ICE exchange sends a burst of candidates
});

function newPeerId(taken) {
  const chars = 'abcdefghjkmnpqrstuvwxyz23456789';
  for (let attempt = 0; attempt < 20; attempt++) {
    let id = 'g';
    for (let i = 0; i < 7; i++) id += chars[Math.floor(Math.random() * chars.length)];
    if (!taken.has(id)) return id;
  }
  return `g${ Date.now().toString(36) }`;
}

export class LanSignaling {
  constructor() {
    this.hosts = new Map(); // code -> host socket
    this.hostMeta = new Map(); // code -> { code, mapId, mapName, gameMode, humans, maxPlayers, state }
    this.guests = new Map(); // peerId -> { socket, code }
    this.roleOf = new Map(); // socket.id -> { role: 'host', code } | { role: 'guest', peerId }
  }

  /** Whether a 6-character code is currently registered as a LAN host room. */
  hasHost(rawCode) {
    const code = sanitizeRoomCode(rawCode);
    return code.length === 6 && this.hosts.has(code);
  }

  _countGuests(code) {
    let count = 0;
    for (const g of this.guests.values()) {
      if (g.code === code) count++;
    }
    return count;
  }

  /** Summary of active LAN rooms for /api/rooms so same-network players see them in the lobby room list with [LAN]. */
  getLanRoomsSummary() {
    const list = [];
    for (const [code] of this.hosts.entries()) {
      const meta = this.hostMeta.get(code);
      const mapId = sanitizeMapId(meta?.mapId || DEFAULT_MAP_ID);
      const mapCfg = getMapConfig(mapId);
      const gameMode = sanitizeGameMode(meta?.gameMode || 'ffa');
      const guests = this._countGuests(code);
      const humans = Math.min(
        MATCH_CONFIG.MAX_PLAYERS,
        Math.max(1, Number.isFinite(meta?.explicitHumans) ? meta.explicitHumans : (1 + guests))
      );
      list.push({
        code,
        isPublic: true,
        isLan: true,
        lan: true,
        mapId,
        mapName: mapCfg.name,
        gameMode,
        humans,
        total: humans,
        maxPlayers: meta?.maxPlayers || MATCH_CONFIG.MAX_PLAYERS,
        state: meta?.state || (gameMode === 'tdm' ? 'WAITING' : 'PLAYING'),
        timeRemaining: MATCH_CONFIG.MATCH_DURATION_SEC
      });
    }
    return list;
  }

  /** Registers the signaling events on one connected Socket.IO socket. */
  attach(socket) {
    const limiter = createRateLimiter({ limits: { ...LAN_SIGNAL_LIMITS, default: { rate: 20, burst: 30 } } });
    const on = (event, handler, options) => guardedOn(socket, limiter, event, handler, options);

    on('lanHostOpen', (payload, ack) => {
      const reply = typeof ack === 'function' ? ack : () => {};
      const code = sanitizeRoomCode(payload?.code);
      if (code.length !== 6) return reply({ ok: false, error: 'bad_code' });
      if (this.roleOf.has(socket.id)) return reply({ ok: false, error: 'already_registered' });
      if (this.hosts.has(code)) return reply({ ok: false, error: 'code_in_use' });
      const mapId = sanitizeMapId(payload?.mapId || DEFAULT_MAP_ID);
      const mapCfg = getMapConfig(mapId);
      const gameMode = sanitizeGameMode(payload?.gameMode || 'ffa');
      const meta = {
        code,
        isLan: true,
        lan: true,
        mapId,
        mapName: mapCfg.name,
        gameMode,
        humans: 1,
        total: 1,
        explicitHumans: undefined,
        maxPlayers: MATCH_CONFIG.MAX_PLAYERS,
        state: gameMode === 'tdm' ? 'WAITING' : 'PLAYING'
      };
      this.hosts.set(code, socket);
      this.hostMeta.set(code, meta);
      socket.lanMeta = meta;
      this.roleOf.set(socket.id, { role: 'host', code });
      return reply({ ok: true });
    }, { expectObject: true });

    on('lanHostUpdate', (payload) => {
      const role = this.roleOf.get(socket.id);
      if (!role || role.role !== 'host') return;
      const meta = this.hostMeta.get(role.code);
      if (!meta) return;
      if (payload?.mapId) {
        meta.mapId = sanitizeMapId(payload.mapId);
        meta.mapName = getMapConfig(meta.mapId).name;
      }
      if (payload?.gameMode) {
        meta.gameMode = sanitizeGameMode(payload.gameMode);
      }
      if (typeof payload?.state === 'string' && ['WAITING', 'PLAYING', 'ENDED'].includes(payload.state)) {
        meta.state = payload.state;
      }
      if (Number.isFinite(payload?.humans) && payload.humans >= 1) {
        meta.explicitHumans = Math.min(MATCH_CONFIG.MAX_PLAYERS, Math.max(1, Math.floor(payload.humans)));
        meta.humans = meta.explicitHumans;
        meta.total = meta.explicitHumans;
      }
    }, { expectObject: true });

    on('lanCheck', (payload, ack) => {
      const reply = typeof ack === 'function' ? ack : () => {};
      const code = sanitizeRoomCode(payload?.code);
      if (code.length !== 6 || !this.hosts.has(code)) {
        return reply({ ok: true, isLan: false });
      }
      const meta = this.hostMeta.get(code);
      return reply({
        ok: true,
        isLan: true,
        code,
        roomCode: code,
        mapId: meta?.mapId || DEFAULT_MAP_ID,
        gameMode: meta?.gameMode || 'ffa'
      });
    }, { expectObject: true });

    on('lanGuestJoin', (payload, ack) => {
      const reply = typeof ack === 'function' ? ack : () => {};
      const code = sanitizeRoomCode(payload?.code);
      const host = this.hosts.get(code);
      if (!host) return reply({ ok: false, error: 'no_host' });
      if (this.roleOf.has(socket.id)) return reply({ ok: false, error: 'already_registered' });
      const guestsOfHost = this._countGuests(code);
      if (guestsOfHost >= MAX_GUESTS_PER_HOST) return reply({ ok: false, error: 'room_full' });
      const peerId = newPeerId(this.guests);
      this.guests.set(peerId, { socket, code });
      this.roleOf.set(socket.id, { role: 'guest', peerId });
      const meta = this.hostMeta.get(code);
      if (meta) {
        meta.explicitHumans = undefined;
        meta.humans = Math.min(MATCH_CONFIG.MAX_PLAYERS, 1 + guestsOfHost + 1);
        meta.total = meta.humans;
      }
      host.emit('lanPeer', { peerId });
      return reply({ ok: true, peerId });
    }, { expectObject: true });

    on('lanSignal', (payload) => {
      const role = this.roleOf.get(socket.id);
      if (!role || typeof payload?.to !== 'string') return;
      const data = payload.data;
      if (data === null || typeof data !== 'object' || !SIGNAL_TYPES.has(data.type)) return;
      if (JSON.stringify(data).length > MAX_SIGNAL_CHARS) return;
      if (role.role === 'host') {
        const guest = this.guests.get(payload.to);
        if (!guest || guest.code !== role.code) return; // a host can only reach its own guests
        guest.socket.emit('lanSignal', { from: 'host', data });
      } else if (payload.to === 'host') {
        const guest = this.guests.get(role.peerId);
        this.hosts.get(guest?.code)?.emit('lanSignal', { from: role.peerId, data });
      }
    });

    on('lanLeave', (payload) => {
      if (payload && typeof payload === 'object') {
        const current = this.roleOf.get(socket.id);
        if (!current) return;
        if (payload.role && current.role !== payload.role) return;
        if (payload.code && current.role === 'host' && current.code !== sanitizeRoomCode(payload.code)) return;
        if (payload.peerId && current.role === 'guest' && current.peerId !== payload.peerId) return;
      }
      this.remove(socket);
    }, { expectObject: false });

    socket.on('disconnect', () => this.remove(socket));
  }

  /** A socket left: a host takes its guests' rendezvous with it, a guest just disappears. */
  remove(socket) {
    const role = this.roleOf.get(socket.id);
    if (!role) return;
    this.roleOf.delete(socket.id);
    if (role.role === 'host') {
      this.hosts.delete(role.code);
      this.hostMeta.delete(role.code);
      for (const [peerId, guest] of Array.from(this.guests)) {
        if (guest.code !== role.code) continue;
        this.guests.delete(peerId);
        this.roleOf.delete(guest.socket.id);
        guest.socket.emit('lanHostGone', {});
      }
    } else {
      const guest = this.guests.get(role.peerId);
      this.guests.delete(role.peerId);
      if (guest) {
        const meta = this.hostMeta.get(guest.code);
        if (meta) {
          meta.explicitHumans = undefined;
          meta.humans = Math.min(MATCH_CONFIG.MAX_PLAYERS, Math.max(1, 1 + this._countGuests(guest.code)));
          meta.total = meta.humans;
        }
        this.hosts.get(guest.code)?.emit('lanPeerGone', { peerId: role.peerId });
      }
    }
  }
}
