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

import { guardedOn, createRateLimiter } from './socketGuard.js';
import { sanitizeRoomCode } from './room/sanitizers.js';

const MAX_SIGNAL_CHARS = 20_000; // a full SDP is ~2-6 KB
const MAX_GUESTS_PER_HOST = 12;
const SIGNAL_TYPES = new Set(['offer', 'answer', 'candidate']);

export const LAN_SIGNAL_LIMITS = Object.freeze({
  lanHostOpen: { rate: 1, burst: 3 },
  lanGuestJoin: { rate: 2, burst: 4 },
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
    this.guests = new Map(); // peerId -> { socket, code }
    this.roleOf = new Map(); // socket.id -> { role: 'host', code } | { role: 'guest', peerId }
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
      this.hosts.set(code, socket);
      this.roleOf.set(socket.id, { role: 'host', code });
      return reply({ ok: true });
    }, { expectObject: true });

    on('lanGuestJoin', (payload, ack) => {
      const reply = typeof ack === 'function' ? ack : () => {};
      const code = sanitizeRoomCode(payload?.code);
      const host = this.hosts.get(code);
      if (!host) return reply({ ok: false, error: 'no_host' });
      if (this.roleOf.has(socket.id)) return reply({ ok: false, error: 'already_registered' });
      let guestsOfHost = 0;
      for (const g of this.guests.values()) if (g.code === code) guestsOfHost++;
      if (guestsOfHost >= MAX_GUESTS_PER_HOST) return reply({ ok: false, error: 'room_full' });
      const peerId = newPeerId(this.guests);
      this.guests.set(peerId, { socket, code });
      this.roleOf.set(socket.id, { role: 'guest', peerId });
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

    socket.on('disconnect', () => this.remove(socket));
  }

  /** A socket left: a host takes its guests' rendezvous with it, a guest just disappears. */
  remove(socket) {
    const role = this.roleOf.get(socket.id);
    if (!role) return;
    this.roleOf.delete(socket.id);
    if (role.role === 'host') {
      this.hosts.delete(role.code);
      for (const [peerId, guest] of Array.from(this.guests)) {
        if (guest.code !== role.code) continue;
        this.guests.delete(peerId);
        this.roleOf.delete(guest.socket.id);
        guest.socket.emit('lanHostGone', {});
      }
    } else {
      const guest = this.guests.get(role.peerId);
      this.guests.delete(role.peerId);
      if (guest) this.hosts.get(guest.code)?.emit('lanPeerGone', { peerId: role.peerId });
    }
  }
}
