// Shared WebRTC settings for the in-browser LAN host and its guests.

// No STUN/TURN on purpose: a LAN room is only meant for machines on the same local network, and with no ICE servers the game
// traffic can never leave it. (Chrome hides local IPs behind mDNS names; machines on one LAN resolve them.)
export const RTC_CONFIG = Object.freeze({ iceServers: [] });

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
