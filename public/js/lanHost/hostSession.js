// The host side of an in-browser LAN room.
//
//   [host's game UI] <-LanClientSocket-> [Web Worker: RoomManager + LanHub] <-frames-> [WebRTC data channels] <-> guests
//
// The host's own player is just another peer ('host') of the hub, linked through postMessage; every guest is a peer linked
// through a pair of RTCDataChannels. Render only relays the SDP/ICE handshake (server/lanSignaling.js).

import { CH_UNREL, LanClientSocket } from '../shared.js';
import {
  CONNECT_TIMEOUT_MS,
  REL_CHANNEL,
  RTC_CONFIG,
  UNREL_CHANNEL,
  createCandidateQueue,
  sendOnChannel
} from './rtc.js';

export const HOST_PEER_ID = 'host';
const WORKER_READY_TIMEOUT_MS = 8000;
const SIGNALING_TIMEOUT_MS = 8000;

/** Starts the game server core: in a Web Worker when possible, otherwise on the main thread. */
async function startCore(onSend) {
  if (typeof Worker === 'function') {
    try {
      const worker = new Worker(new URL('./hostWorker.js', import.meta.url), { type: 'module' });
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('worker timeout')), WORKER_READY_TIMEOUT_MS);
        worker.onerror = (e) => { clearTimeout(timer); reject(new Error(e.message || 'worker error')); };
        worker.onmessage = (e) => {
          if (e.data?.t === 'ready') { clearTimeout(timer); resolve(); }
        };
      });
      worker.onerror = null;
      worker.onmessage = (e) => {
        const m = e.data;
        if (m?.t === 'send') {
          onSend(m.peerId, m.channel, m.text);
        } else if (m?.t === 'sendMany' && Array.isArray(m.peerIds)) {
          const { peerIds, channel, text } = m;
          for (let i = 0; i < peerIds.length; i++) {
            onSend(peerIds[i], channel, text);
          }
        }
      };
      return {
        kind: 'worker',
        peerOpen: (peerId) => worker.postMessage({ t: 'open', peerId }),
        peerMessage: (peerId, text) => worker.postMessage({ t: 'msg', peerId, text }),
        peerClose: (peerId) => worker.postMessage({ t: 'close', peerId }),
        stop: () => { worker.postMessage({ t: 'stop' }); setTimeout(() => worker.terminate(), 200); }
      };
    } catch (err) {
      console.warn('[lan] worker unavailable, hosting on the main thread:', err);
    }
  }
  const { createHostCore } = await import('../../server/lan/hostCore.js');
  const core = createHostCore({
    send: onSend,
    sendMany: (peerIds, channel, text) => {
      for (let i = 0; i < peerIds.length; i++) {
        onSend(peerIds[i], channel, text);
      }
    }
  });
  return {
    kind: 'main-thread',
    peerOpen: core.peerOpen,
    peerMessage: core.peerMessage,
    peerClose: core.peerClose,
    stop: core.stop
  };
}

/**
 * @param {{ signalSocket: any, code: string, mapId?: string, gameMode?: string, onStatus?: (e: object) => void }} options
 * @returns {Promise<{ socket: LanClientSocket, code: string, peerCount: () => number, stop: () => void, kind: string }>}
 */
export async function startLanHost({ signalSocket, code, mapId, gameMode, onStatus }) {
  const routes = new Map(); // peerId -> (channel, text) => void
  const peers = new Map(); // peerId -> peer record
  const client = new LanClientSocket({ id: HOST_PEER_ID });

  const core = await startCore((peerId, channel, text) => routes.get(peerId)?.(channel, text));

  // The host's own player.
  routes.set(HOST_PEER_ID, (_channel, text) => client.receive(text));
  client.attach((_channel, text) => core.peerMessage(HOST_PEER_ID, text));
  core.peerOpen(HOST_PEER_ID);

  const openPayload = { code };
  if (mapId) openPayload.mapId = mapId;
  if (gameMode) openPayload.gameMode = gameMode;

  const ack = await new Promise((resolve) => {
    const timer = setTimeout(() => resolve({ ok: false, error: 'signaling_timeout' }), SIGNALING_TIMEOUT_MS);
    signalSocket.emit('lanHostOpen', openPayload, (reply) => { clearTimeout(timer); resolve(reply); });
  });
  if (!ack?.ok) {
    core.stop();
    throw new Error(ack?.error || 'signaling_failed');
  }

  function drop(peerId) {
    const peer = peers.get(peerId);
    if (!peer || peer.closed) return;
    peer.closed = true;
    clearTimeout(peer.timer);
    peers.delete(peerId);
    routes.delete(peerId);
    try { peer.pc.close(); } catch { /* already closed */ }
    if (peer.opened) core.peerClose(peerId);
    onStatus?.({ type: 'peer-left', peerId, peers: peers.size });
  }

  async function connectGuest(peerId) {
    if (peers.has(peerId)) return;
    const pc = new RTCPeerConnection(RTC_CONFIG);
    const rel = pc.createDataChannel(REL_CHANNEL.label, REL_CHANNEL.options);
    const unrel = pc.createDataChannel(UNREL_CHANNEL.label, UNREL_CHANNEL.options);
    const queue = createCandidateQueue(pc);
    const peer = { pc, opened: false, closed: false, timer: null };
    peers.set(peerId, peer);
    const signal = (data) => signalSocket.emit('lanSignal', { to: peerId, data });

    peer.onSignal = async (data) => {
      if (data.type === 'answer' && typeof data.sdp === 'string') {
        await pc.setRemoteDescription({ type: 'answer', sdp: data.sdp });
        await queue.markReady();
      } else if (data.type === 'candidate' && data.candidate) {
        await queue.add(data.candidate);
      }
    };
    pc.onicecandidate = (e) => { if (e.candidate) signal({ type: 'candidate', candidate: e.candidate.toJSON() }); };

    const maybeOpen = () => {
      if (peer.opened || peer.closed || rel.readyState !== 'open' || unrel.readyState !== 'open') return;
      peer.opened = true;
      clearTimeout(peer.timer);
      routes.set(peerId, (channel, text) => sendOnChannel(channel === CH_UNREL ? unrel : rel, text, channel === CH_UNREL));
      core.peerOpen(peerId);
      onStatus?.({ type: 'peer-open', peerId, peers: peers.size });
    };
    for (const dc of [rel, unrel]) {
      dc.onopen = maybeOpen;
      dc.onclose = () => drop(peerId);
      dc.onmessage = (e) => { if (typeof e.data === 'string' && peer.opened) core.peerMessage(peerId, e.data); };
    }
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed' || pc.connectionState === 'closed') drop(peerId);
    };
    peer.timer = setTimeout(() => { if (!peer.opened) drop(peerId); }, CONNECT_TIMEOUT_MS);

    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      signal({ type: 'offer', sdp: offer.sdp });
    } catch (err) {
      console.warn('[lan] offer failed:', err);
      drop(peerId);
    }
  }

  const onLanPeer = ({ peerId } = {}) => { if (typeof peerId === 'string') connectGuest(peerId); };
  const onLanPeerGone = ({ peerId } = {}) => drop(peerId);
  const onLanSignal = ({ from, data } = {}) => {
    const peer = peers.get(from);
    if (peer && data) peer.onSignal(data).catch((err) => console.warn('[lan] signal failed:', err));
  };
  // The signaling socket dropping does not end the room (data channels are direct), but new guests cannot join any more.
  const onSignalDisconnect = () => onStatus?.({ type: 'signaling-lost' });
  const onBeforeUnload = (e) => {
    if (peers.size > 0) {
      e.preventDefault?.();
      e.returnValue = '';
      return '';
    }
  };

  signalSocket.on('lanPeer', onLanPeer);
  signalSocket.on('lanPeerGone', onLanPeerGone);
  signalSocket.on('lanSignal', onLanSignal);
  signalSocket.on('disconnect', onSignalDisconnect);
  if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
    window.addEventListener('beforeunload', onBeforeUnload);
  }

  let stopped = false;
  function stop() {
    if (stopped) return;
    stopped = true;
    signalSocket.off?.('lanPeer', onLanPeer);
    signalSocket.off?.('lanPeerGone', onLanPeerGone);
    signalSocket.off?.('lanSignal', onLanSignal);
    signalSocket.off?.('disconnect', onSignalDisconnect);
    if (typeof window !== 'undefined' && typeof window.removeEventListener === 'function') {
      window.removeEventListener('beforeunload', onBeforeUnload);
    }
    for (const peerId of Array.from(peers.keys())) drop(peerId);
    signalSocket.emit?.('lanLeave', { role: 'host', code });
    core.stop();
  }
  client.onDisconnectRequest = stop;
  client.open();

  return { socket: client, code, kind: core.kind, peerCount: () => peers.size, hasGuests: () => peers.size > 0, stop };
}
