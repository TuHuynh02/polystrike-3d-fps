// Shared WebRTC settings for the in-browser LAN host and its guests.

// Lightweight STUN fallback (no TURN relay, so media/game traffic stays P2P) lets peers discover their interface IP when
// mDNS (.local) is blocked by Windows/AP firewall or when players are on different subnets / VLANs of the same LAN.
export const STUN_URLS = Object.freeze([
  'stun:stun.l.google.com:19302',
  'stun:stun1.l.google.com:19302'
]);

export const RTC_CONFIG = Object.freeze({
  iceServers: Object.freeze([
    Object.freeze({ urls: STUN_URLS })
  ])
});

export const REL_CHANNEL = { label: 'rel', options: { ordered: true } };
export const UNREL_CHANNEL = { label: 'unrel', options: { ordered: false, maxRetransmits: 0 } };

/** An unreliable frame is dropped instead of queued when the channel is backed up (a late snapshot is worse than none). */
export const UNREL_MAX_BUFFERED_BYTES = 64 * 1024;

export const CONNECT_TIMEOUT_MS = 12_000;

/** Sends one frame on a data channel, honouring open state and (for the unreliable channel) back-pressure. */
export function sendOnChannel(dc, text, droppable) {
  if (!dc || dc.readyState !== 'open') return false;
  if (droppable && dc.bufferedAmount > UNREL_MAX_BUFFERED_BYTES) return false;
  try {
    dc.send(text);
    return true;
  } catch {
    return false;
  }
}

/** ICE candidates can arrive before the remote description is set; they are queued until it is. */
export function createCandidateQueue(pc) {
  const pending = [];
  let ready = false;
  return {
    async add(candidate) {
      if (ready) {
        try { await pc.addIceCandidate(candidate); } catch { /* stale candidate */ }
      } else {
        pending.push(candidate);
      }
    },
    async markReady() {
      ready = true;
      while (pending.length) {
        try { await pc.addIceCandidate(pending.shift()); } catch { /* stale candidate */ }
      }
    }
  };
}
