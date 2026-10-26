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

  let registeredOnSignaling = false;
  let leaveSent = false;

  function emitLeaveIfRegistered() {
    if (leaveSent || !registeredOnSignaling) return;
    leaveSent = true;
    signalSocket.emit?.('lanLeave', { role: 'guest', code, peerId: client.id || undefined });
  }

  function cleanup(notifyServer = true) {
    clearTimeout(timer);
    signalSocket.off?.('lanSignal', onSignal);
    signalSocket.off?.('lanHostGone', onHostGone);
    signalSocket.off?.('connect', join);
    try { pc?.close(); } catch { /* already closed */ }
    if (notifyServer) emitLeaveIfRegistered();
  }

  function fail(reason, notifyServer = true) {
    if (finished) return;
    finished = true;
    cleanup(notifyServer);
    client.fail(new Error(reason));
  }

  function lose() {
    if (client.connected) {
      finished = true;
      cleanup(true);
      client.close('transport close');
    } else {
      fail('failed', true);
    }
  }

  function onHostGone() {
    registeredOnSignaling = false;
    if (client.connected) {
      finished = true;
      cleanup(false);
      client.close('host gone');
    } else {
      fail('no_host', false);
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
  const join = () => {
    if (finished) return;
    signalSocket.emit('lanGuestJoin', { code }, (reply) => {
      if (finished) {
        if (reply?.ok) {
          signalSocket.emit?.('lanLeave', { role: 'guest', code, peerId: reply.peerId });
        }
        return;
      }
      if (!reply?.ok) {
        fail(reply?.error === 'room_full' ? 'room_full' : 'no_host', false);
      } else {
        registeredOnSignaling = true;
        client.id = reply.peerId;
      }
    });
  };
  if (signalSocket.connected) join();
  else signalSocket.once('connect', join);
  timer = setTimeout(() => fail('timeout', true), CONNECT_TIMEOUT_MS);

  let stopped = false;
  const stop = () => {
    if (stopped) return;
    stopped = true;
    finished = true;
    registeredOnSignaling = true;
    cleanup(true);
  };
  client.onDisconnectRequest = stop;
  return { socket: client, stop };
}
