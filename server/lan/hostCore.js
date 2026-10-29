// The complete game server for one in-browser LAN room: RoomManager + the shared socket handlers on top of a LanHub.
// Transport-agnostic: the owner feeds it peer events and gets frames to send back through `send`.
//   - in the browser it runs inside a Web Worker (public/js/lanHost/hostWorker.js), so a host who switches tabs does not throttle
//     the simulation, and
//   - in Node tests it is used directly.

import { RoomManager } from '../roomManager.js';
import { attachGameSocketHandlers } from '../socketHandlers.js';
import { LanHub } from './hub.js';

export function createHostCore({ send, sendMany = null }) {
  const hub = new LanHub({ send, sendMany });
  const roomManager = new RoomManager(hub.io);
  hub.onConnection = (socket) => attachGameSocketHandlers({ socket, roomManager });
  return {
    hub,
    roomManager,
    peerOpen: (peerId) => hub.connect(peerId),
    peerMessage: (peerId, text) => hub.receive(peerId, text),
    peerClose: (peerId) => hub.disconnect(peerId, 'transport close'),
    stop() {
      for (const peerId of Array.from(hub.sockets.keys())) hub.disconnect(peerId, 'server shutting down');
      roomManager.stop();
    }
  };
}
