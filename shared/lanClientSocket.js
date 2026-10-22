// The client end of the LAN protocol (shared/lanProtocol.js): a tiny Socket.IO-client look-alike.
//
// The game client only uses `on`, `once`, `emit` (with optional ack), `connected` and the `volatile` flag trick, so this class is a
// drop-in replacement for the Socket.IO socket when the game runs against an in-browser LAN host. The transport (a WebRTC
// data-channel pair, or a postMessage link for the host's own player) is attached from outside with `attach()` / `open()`.

import { BTN } from './netcode.js';
import { CH_REL, CH_UNREL, decodeFrame, encodeAck, encodeEmit, splitAck } from './lanProtocol.js';

function batchHasFire(payload) {
  const cmds = payload?.cmds;
  if (!Array.isArray(cmds)) return false;
  for (let i = 0; i < cmds.length; i++) {
    if ((cmds[i].btn & BTN.FIRE) !== 0) return true;
  }
  return false;
}

export class LanClientSocket {
  constructor({ id = '' } = {}) {
    this.id = id;
    this.connected = false;
    this.disconnected = true;
    this._listeners = new Map(); // event -> Set(fn)
    this._pendingAcks = new Map(); // ackId -> fn
    this._nextAck = 1;
    this._send = null; // (channel, text) => void
    this._volatileNext = false;
  }

  /** Sets the function that carries one frame to the host. */
  attach(send) {
    this._send = send;
  }

  on(event, fn) {
    let set = this._listeners.get(event);
    if (!set) this._listeners.set(event, (set = new Set()));
    set.add(fn);
    return this;
  }

  once(event, fn) {
    const wrapper = (...args) => {
      this.off(event, wrapper);
      fn(...args);
    };
    wrapper.original = fn;
    return this.on(event, wrapper);
  }

  off(event, fn) {
    const set = this._listeners.get(event);
    if (!set) return this;
    for (const l of set) {
      if (l === fn || l.original === fn) set.delete(l);
    }
    return this;
  }

  /** Socket.IO's `socket.volatile` marks the NEXT emit as droppable and returns the socket itself; same here. */
  get volatile() {
    this._volatileNext = true;
    return this;
  }

  emit(event, ...rest) {
    const { args, ack } = splitAck(rest);
    // Input batches repeat their unacknowledged commands, so only a batch carrying a shot has to arrive reliably.
    const channel = this._volatileNext || (event === 'inputBatch' && !batchHasFire(args[0])) ? CH_UNREL : CH_REL;
    this._volatileNext = false;
    if (!this.connected || !this._send) return this;
    let ackId = 0;
    if (ack) {
      ackId = this._nextAck++;
      this._pendingAcks.set(ackId, ack);
      if (this._pendingAcks.size > 256) this._pendingAcks.delete(this._pendingAcks.keys().next().value);
    }
    this._send(channel, encodeEmit(event, args, ackId));
    return this;
  }

  /** One frame arrived from the host. */
  receive(text) {
    const frame = decodeFrame(text);
    if (!frame) return;
    if (frame.kind === 'ack') {
      const fn = this._pendingAcks.get(frame.ackId);
      if (fn) {
        this._pendingAcks.delete(frame.ackId);
        fn(...frame.args);
      }
      return;
    }
    const reply = frame.ackId
      ? (...answer) => {
        if (this.connected && this._send) this._send(CH_REL, encodeAck(frame.ackId, answer));
      }
      : null;
    this._fire(frame.event, reply ? [...frame.args, reply] : frame.args);
  }

  /** Transport is ready: behaves like Socket.IO's `connect`. */
  open() {
    if (this.connected) return;
    this.connected = true;
    this.disconnected = false;
    this._fire('connect', []);
  }

  /** Transport is gone: behaves like Socket.IO's `disconnect`. */
  close(reason = 'transport close') {
    if (!this.connected) return;
    this.connected = false;
    this.disconnected = true;
    this._pendingAcks.clear();
    this._fire('disconnect', [reason]);
  }

  /** Could not establish the transport at all: behaves like `connect_error`. */
  fail(error) {
    this._fire('connect_error', [error instanceof Error ? error : new Error(String(error))]);
  }

  /** socket.disconnect(): the owner of the transport is told through `onDisconnectRequest`. */
  disconnect() {
    this.close('io client disconnect');
    this.onDisconnectRequest?.();
    return this;
  }

  _fire(event, args) {
    const set = this._listeners.get(event);
    if (!set) return;
    for (const fn of Array.from(set)) {
      try {
        fn(...args);
      } catch (err) {
        console.error(`[lan] listener for "${ event }" threw:`, err);
      }
    }
  }
}
