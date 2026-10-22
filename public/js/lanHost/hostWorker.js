// Web Worker that runs the game server of an in-browser LAN room (server/lan/hostCore.js).
// A worker is not throttled when the host's tab is in the background, so the simulation keeps its 50 Hz tick even if the host
// switches windows; the main thread (hostSession.js) only relays frames between the WebRTC data channels and this worker.
import { createHostCore } from '../../server/lan/hostCore.js';

const core = createHostCore({
  send: (peerId, channel, text) => postMessage({ t: 'send', peerId, channel, text })
});

self.onmessage = (event) => {
  const m = event.data;
  if (!m || typeof m !== 'object') return;
  switch (m.t) {
    case 'open': core.peerOpen(m.peerId); break;
    case 'msg': core.peerMessage(m.peerId, m.text); break;
    case 'close': core.peerClose(m.peerId); break;
    case 'stop': core.stop(); self.close(); break;
    default: break;
  }
};

// Messages sent before this point could be lost (module evaluation is asynchronous): the host waits for 'ready'.
postMessage({ t: 'ready' });
