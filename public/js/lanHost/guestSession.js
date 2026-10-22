// The guest side of an in-browser LAN room: finds the host through the signaling server, opens the WebRTC data channels and
// exposes them as a Socket.IO-like socket (shared/lanClientSocket.js).

import { CH_UNREL, LanClientSocket } from '../shared.js';
import { CONNECT_TIMEOUT_MS, RTC_CONFIG, createCandidateQueue, sendOnChannel } from './rtc.js';

/**
 * @param {{ signalSocket: any, code: string }} options
 * @returns {{ socket: LanClientSocket, stop: () => void }}
 * The socket emits `connect` once the channels are open, or `connect_error` with an Error whose message is one of
 * 'no_host' | 'room_full' | 'timeout' | 'failed'.
 */
export function startLanGuest({ signalSocket, code }) {
  const client = new LanClientSocket({ id: '' });
  let pc = null;
  let rel = null;
  let unrel = null;
  let queue = null;
  let finished = false;
  let timer = null;

  function cleanup() {
    clearTimeout(timer);
    signalSocket.off('lanSignal', onSignal);
    signalSocket.off('lanHostGone', onHostGone);
    try { pc?.close(); } catch { /* already closed */ }
  }

  function fail(reason) {
    if (finished) return;
    finished = true;
    cleanup();
    client.fail(new Error(reason));
  }

  function lose() {
    if (client.connected) {
      finished = true;
      cleanup();
      client.close('transport close');
    } else {
      fail('failed');
    }
  }

  function onHostGone() {
    if (client.connected) {
      finished = true;
      cleanup();
      client.close('host gone');
    } else {
      fail('no_host');
    }
  }

  function maybeOpen() {
    if (finished || client.connected || !rel || !unrel || rel.readyState !== 'open' || unrel.readyState !== 'open') return;
    clearTimeout(timer);
    client.attach((channel, text) => sendOnChannel(channel === CH_UNREL ? unrel : rel, text, channel === CH_UNREL));
    client.open();
  }

  function wireChannel(dc) {
    dc.onopen = maybeOpen;
    dc.onclose = lose;
    dc.onmessage = (e) => { if (typeof e.data === 'string') client.receive(e.data); };
  }

  async function onSignal({ from, data } = {}) {
    if (from !== 'host' || !data || finished) return;
    try {
      if (data.type === 'offer' && typeof data.sdp === 'string') {
        pc = new RTCPeerConnection(RTC_CONFIG);
        queue = createCandidateQueue(pc);
        pc.onicecandidate = (e) => {
          if (e.candidate) signalSocket.emit('lanSignal', { to: 'host', data: { type: 'candidate', candidate: e.candidate.toJSON() } });
        };
        pc.ondatachannel = (e) => {
          if (e.channel.label === 'rel') rel = e.channel;
          else if (e.channel.label === 'unrel') unrel = e.channel;
          else return;
          wireChannel(e.channel);
          maybeOpen();
        };
        pc.onconnectionstatechange = () => {
          if (pc.connectionState === 'failed') lose();
        };
        await pc.setRemoteDescription({ type: 'offer', sdp: data.sdp });
        await queue.markReady();
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        signalSocket.emit('lanSignal', { to: 'host', data: { type: 'answer', sdp: answer.sdp } });
      } else if (data.type === 'candidate' && data.candidate && queue) {
        await queue.add(data.candidate);
      }
    } catch (err) {
      console.warn('[lan] guest signaling failed:', err);
      fail('failed');
    }
  }

  // Listen before asking to join, so the host's offer cannot be missed.
  signalSocket.on('lanSignal', onSignal);
  signalSocket.on('lanHostGone', onHostGone);
  const join = () => signalSocket.emit('lanGuestJoin', { code }, (reply) => {
    if (!reply?.ok) fail(reply?.error === 'room_full' ? 'room_full' : 'no_host');
    else client.id = reply.peerId;
  });
  if (signalSocket.connected) join();
  else signalSocket.once('connect', join);
  timer = setTimeout(() => fail('timeout'), CONNECT_TIMEOUT_MS);

  const stop = () => { finished = true; cleanup(); };
  client.onDisconnectRequest = stop;
  return { socket: client, stop };
}
