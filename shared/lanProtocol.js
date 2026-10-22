// Wire format of the in-browser LAN host (WebRTC data channels, or an in-memory loopback for the host's own player).
//
// It carries the same events as the Socket.IO game protocol, one JSON text frame per message:
//   event:  { "e": "<event>", "p": [arg, ...], "a": <ackId> }     (a = optional acknowledgement id)
//   ack:    { "r": <ackId>,   "p": [arg, ...] }
// Two logical channels: 'rel' (ordered, reliable) and 'unrel' (unordered, no retransmits) - the latter replaces Socket.IO's
// `volatile` for the 25-50 Hz stateUpdate stream and for input batches without a shot.

export const CH_REL = 'rel';
export const CH_UNREL = 'unrel';

/** Same cap as the Node server's maxHttpBufferSize (100 KB); anything larger is dropped. */
export const MAX_FRAME_CHARS = 100_000;
export const MAX_FRAME_ARGS = 4;
export const MAX_EVENT_NAME_LENGTH = 64;

export function encodeEmit(event, args = [], ackId = 0) {
  const frame = { e: event, p: args };
  if (ackId) frame.a = ackId;
  return JSON.stringify(frame);
}

export function encodeAck(ackId, args = []) {
  return JSON.stringify({ r: ackId, p: args });
}

/**
 * Parses and validates one frame. Returns { kind: 'emit', event, args, ackId } | { kind: 'ack', ackId, args } | null.
 * Never throws: malformed or oversized input from a peer simply yields null.
 */
export function decodeFrame(text) {
  if (typeof text !== 'string' || text.length === 0 || text.length > MAX_FRAME_CHARS) return null;
  let frame;
  try {
    frame = JSON.parse(text);
  } catch {
    return null;
  }
  if (frame === null || typeof frame !== 'object' || !Array.isArray(frame.p) || frame.p.length > MAX_FRAME_ARGS) return null;
  if (typeof frame.e === 'string') {
    if (frame.e.length === 0 || frame.e.length > MAX_EVENT_NAME_LENGTH) return null;
    return { kind: 'emit', event: frame.e, args: frame.p, ackId: Number.isInteger(frame.a) && frame.a > 0 ? frame.a : 0 };
  }
  if (Number.isInteger(frame.r) && frame.r > 0) {
    return { kind: 'ack', ackId: frame.r, args: frame.p };
  }
  return null;
}

/** Splits trailing function (ack callback) off an `emit(event, ...args, [ack])` argument list. */
export function splitAck(args) {
  const last = args[args.length - 1];
  if (typeof last === 'function') return { args: args.slice(0, -1), ack: last };
  return { args, ack: null };
}
