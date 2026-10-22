// In-memory LAN room for tests: the real game server (RoomManager + socket handlers) behind a LanHub, with LanClientSocket peers
// connected by microtask-deferred links (like a real transport: never re-entrant).
import { createHostCore } from '../../server/lan/hostCore.js';
import { LanClientSocket } from '../../shared/lanClientSocket.js';

export function createLanHarness() {
  const routes = new Map(); // peerId -> (channel, text) => void
  const sent = []; // every frame the host sent: { peerId, channel, text }
  const core = createHostCore({
    send: (peerId, channel, text) => {
      sent.push({ peerId, channel, text });
      routes.get(peerId)?.(channel, text);
    }
  });

  function addPeer(peerId) {
    const client = new LanClientSocket({ id: peerId });
    routes.set(peerId, (_channel, text) => queueMicrotask(() => client.receive(text)));
    client.attach((_channel, text) => queueMicrotask(() => core.peerMessage(peerId, text)));
    core.peerOpen(peerId);
    client.open();
    client.dropLink = () => {
      routes.delete(peerId);
      client.close('transport close');
      core.peerClose(peerId);
    };
    return client;
  }

  return { core, addPeer, sent, stop: () => core.stop() };
}

/** Resolves with the first payload of `event` (rejects after `ms`). */
export function waitForEvent(socket, event, ms = 1500) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout waiting for ${event}`)), ms);
    socket.once(event, (payload) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });
}
