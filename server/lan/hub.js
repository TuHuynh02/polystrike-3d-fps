// A Socket.IO-shaped server hub for the in-browser LAN host.
//
// The game server (RoomManager + attachGameSocketHandlers) only needs a small slice of Socket.IO: `io.to(room).emit`,
// `io.to(room).volatile`, and per-socket on / emit / join / leave / to / disconnect. This hub provides exactly that on top
// of an abstract transport `send(peerId, channel, text)`, so the unchanged game server can run in a browser (Web Worker) and
// talk to peers over WebRTC data channels. It has no browser or Node API dependencies (tests drive it in Node).

import { CH_REL, CH_UNREL, decodeFrame, encodeAck, encodeEmit, splitAck } from '../../shared/lanProtocol.js';

const ACK_TIMEOUT_MS = 30_000;

class LanServerSocket {
  constructor(hub, id) {
    this.hub = hub;
    this.id = id;
    this.disconnected = false;
    this.handlers = new Map(); // event -> [fn]
    this.pendingAcks = new Map(); // ackId -> { fn, timer }
    this._nextAck = 1;
  }

  on(event, fn) {
    let list = this.handlers.get(event);
    if (!list) this.handlers.set(event, (list = []));
    list.push(fn);
    return this;
  }

  /** socket.emit(event, ...args, [ack]) -> this peer, reliable channel. */
  emit(event, ...rest) {
    this._send(CH_REL, event, rest);
    return this;
  }

  /** socket.volatile.emit(...) -> this peer, unreliable channel. */
  get volatile() {
    return { emit: (event, ...rest) => this._send(CH_UNREL, event, rest) };
  }

  join(room) {
    this.hub._join(this.id, room);
  }

  leave(room) {
    this.hub._leave(this.id, room);
  }

  /** socket.to(room): everyone in the room except this socket. */
  to(room) {
    return this.hub._target(room, this.id);
  }

  disconnect() {
    this.hub.disconnect(this.id, 'server namespace disconnect');
    return this;
  }

  _send(channel, event, rest) {
    if (this.disconnected) return;
    const { args, ack } = splitAck(rest);
    let ackId = 0;
    if (ack) {
      ackId = this._nextAck++;
      const timer = setTimeout(() => this.pendingAcks.delete(ackId), ACK_TIMEOUT_MS);
      this.pendingAcks.set(ackId, { fn: ack, timer });
    }
    this.hub.send(this.id, channel, encodeEmit(event, args, ackId));
  }

  _dispatch(event, args, ackId) {
    const list = this.handlers.get(event);
    if (!list) return;
    // The ack callback is appended only when the peer asked for one (`pingCheck`, ...), like Socket.IO does.
    const callArgs = ackId
      ? [...args, (...reply) => { if (!this.disconnected) this.hub.send(this.id, CH_REL, encodeAck(ackId, reply)); }]
      : args;
    for (const fn of list.slice()) fn(...callArgs);
  }

  _resolveAck(ackId, args) {
    const pending = this.pendingAcks.get(ackId);
    if (!pending) return;
    clearTimeout(pending.timer);
    this.pendingAcks.delete(ackId);
    pending.fn(...args);
  }
}

export class LanHub {
  /**
   * @param {{ send: (peerId: string, channel: 'rel'|'unrel', text: string) => void,
   *           onConnection?: (socket: LanServerSocket) => void,
   *           onPeerGone?: (peerId: string) => void }} options
   */
  constructor({ send, onConnection = null, onPeerGone = null } = {}) {
    this.send = send;
    this.onConnection = onConnection;
    this.onPeerGone = onPeerGone;
    this.sockets = new Map(); // peerId -> LanServerSocket
    this.rooms = new Map(); // room -> Set(peerId)
    // Same shape RoomManager uses: io.to(room).emit(...) / io.to(room).volatile.emit(...)
    this.io = { to: (room) => this._target(room, null) };
  }

  /** A peer's transport opened: create its socket (auto-joined to the room named after its id, like Socket.IO). */
  connect(peerId) {
    if (this.sockets.has(peerId)) return this.sockets.get(peerId);
    const socket = new LanServerSocket(this, peerId);
    this.sockets.set(peerId, socket);
    this._join(peerId, peerId);
    this.onConnection?.(socket);
    return socket;
  }

  /** One text frame arrived from a peer. Malformed frames are ignored. */
  receive(peerId, text) {
    const socket = this.sockets.get(peerId);
    if (!socket || socket.disconnected) return;
    const frame = decodeFrame(text);
    if (!frame) return;
    if (frame.kind === 'ack') socket._resolveAck(frame.ackId, frame.args);
    else socket._dispatch(frame.event, frame.args, frame.ackId);
  }

  /** The peer's transport closed (or the server dropped it): run the socket's `disconnect` handlers and forget it. */
  disconnect(peerId, reason = 'transport close') {
    const socket = this.sockets.get(peerId);
    if (!socket || socket.disconnected) return;
    socket.disconnected = true;
    try {
      const list = socket.handlers.get('disconnect') || [];
      for (const fn of list.slice()) fn(reason);
    } finally {
      for (const pending of socket.pendingAcks.values()) clearTimeout(pending.timer);
      socket.pendingAcks.clear();
      for (const [room, members] of this.rooms) {
        members.delete(peerId);
        if (members.size === 0) this.rooms.delete(room);
      }
      this.sockets.delete(peerId);
      this.onPeerGone?.(peerId);
    }
  }

  _join(peerId, room) {
    let members = this.rooms.get(room);
    if (!members) this.rooms.set(room, (members = new Set()));
    members.add(peerId);
  }

  _leave(peerId, room) {
    const members = this.rooms.get(room);
    if (!members) return;
    members.delete(peerId);
    if (members.size === 0) this.rooms.delete(room);
  }

  /** Broadcast target for a room, optionally excluding one peer. A frame is serialised once for all recipients. */
  _target(room, exceptPeerId) {
    const broadcast = (channel, event, rest) => {
      const members = this.rooms.get(room);
      if (!members || members.size === 0) return;
      const { args } = splitAck(rest); // broadcasts carry no acknowledgement
      const text = encodeEmit(event, args);
      for (const peerId of Array.from(members)) {
        if (peerId === exceptPeerId) continue;
        const socket = this.sockets.get(peerId);
        if (socket && !socket.disconnected) this.send(peerId, channel, text);
      }
    };
    return {
      emit: (event, ...rest) => broadcast(CH_REL, event, rest),
      get volatile() {
        return { emit: (event, ...rest) => broadcast(CH_UNREL, event, rest) };
      }
    };
  }
}
