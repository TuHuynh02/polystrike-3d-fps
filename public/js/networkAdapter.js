// Hybrid Network Adapter for POLYSTRIKE 3D
// 1. Connects to real Socket.IO server when hosted on Node.js (localhost / Render / Railway / ?server=URL)
// 2. Automatically uses WebRTC Peer-to-Peer Room Networking (via PeerJS) on static GitHub Pages
//    so multiple real players joining the same Room Code (#PUB001 or #CODE / ?room=CODE)
//    immediately see each other, shoot each other, and play together with zero backend setup!

import { MATCH_CONFIG, getMapConfig } from '../shared/constants.js';
import { RoomManager, sanitizeRoomCode, generateRoomCode } from '../server/roomManager.js';

const PEER_ROOM_PREFIX = 'polystrike3d-v2-room-';

class PeerRoomSocketAdapter {
  constructor() {
    this.id = `p2p_${Math.random().toString(36).slice(2, 10)}`;
    this.clientHandlers = new Map();
    this.currentRoomCode = null;
    this.role = null; // 'host' | 'client'
    this.peer = null;
    this.hostConn = null;
    this.clientConns = new Map(); // peerId -> DataConnection (used when role === 'host')
    this.pingCallbacks = new Map();
    this.lastSavedPayload = null;

    // Authoritative RoomManager instance (active when this browser is the Room Host)
    const ioMock = {
      to: (roomCode) => ({
        emit: (event, data) => {
          if (this.role === 'host' && this.currentRoomCode === roomCode) {
            this._triggerClient(event, data);
            this._broadcastToClients(event, data);
          }
        }
      })
    };

    this.roomManager = new RoomManager(ioMock);
    this.roomManager.createRoom('PUB001', true, MATCH_CONFIG.DEFAULT_BOTS);
  }

  on(event, handler) {
    if (!this.clientHandlers.has(event)) {
      this.clientHandlers.set(event, []);
    }
    this.clientHandlers.get(event).push(handler);
  }

  _triggerClient(event, data) {
    const handlers = this.clientHandlers.get(event);
    if (!handlers) return;
    for (const fn of handlers) {
      try {
        fn(data);
      } catch (err) {
        console.error(`[PeerRoomSocketAdapter] Error in handler for ${event}:`, err);
      }
    }
  }

  _broadcastToClients(event, data, excludePeerId = null) {
    if (this.clientConns.size === 0) return;
    const packet = { type: 'event', event, data };
    for (const [peerId, conn] of this.clientConns.entries()) {
      if (peerId === excludePeerId) continue;
      if (conn.open) {
        try {
          conn.send(packet);
        } catch {
          // Ignore transient send error on closing channel
        }
      }
    }
  }

  _cleanupNetwork() {
    if (this.hostConn) {
      try {
        this.hostConn.close();
      } catch {}
      this.hostConn = null;
    }
    for (const conn of this.clientConns.values()) {
      try {
        conn.close();
      } catch {}
    }
    this.clientConns.clear();
    if (this.peer) {
      try {
        this.peer.destroy();
      } catch {}
      this.peer = null;
    }
    if (this.currentRoomCode && this.role === 'host') {
      this.roomManager.removePlayer(this.id);
    }
    this.role = null;
  }

  _resolveTargetRoomCode(payload = {}) {
    const explicit = sanitizeRoomCode(payload.roomCode || '');
    if (explicit) return explicit;
    if (payload.isPublic === false) {
      return generateRoomCode(this.roomManager.rooms);
    }
    return 'PUB001';
  }

  _joinAsLocalHost(targetCode, payload) {
    this.role = 'host';
    this.currentRoomCode = targetCode;

    // Ensure the room exists with the exact targetCode
    const joinPayload = {
      ...payload,
      roomCode: targetCode,
      isPublic: payload.isPublic !== false
    };

    const result = this.roomManager.addHumanPlayer({ id: this.id }, joinPayload);
    if (result.error) {
      this._triggerClient('joinError', { message: result.error });
      return;
    }

    const { room, player } = result;
    this.currentRoomCode = room.code;
    const timeRemaining = Math.max(0, Math.ceil((room.matchEndsAt - Date.now()) / 1000));
    const mapCfg = getMapConfig(room.mapId);

    this._triggerClient('roomJoined', {
      playerId: player.id,
      roomCode: room.code,
      isPublic: room.isPublic,
      mapId: room.mapId,
      mapName: mapCfg.name,
      botCount: room.desiredBots,
      killLimit: MATCH_CONFIG.KILL_LIMIT,
      timeRemaining,
      player: {
        id: player.id,
        name: player.name,
        color: player.color,
        x: player.x,
        y: player.y,
        z: player.z,
        yaw: player.yaw,
        pitch: player.pitch,
        weapon: player.weapon,
        loadout: player.loadout,
        hp: player.hp,
        ammo: player.ammo,
        reserveAmmo: player.reserveAmmo,
        ammoByWeapon: player.ammoByWeapon,
        reserveAmmoByWeapon: player.reserveAmmoByWeapon,
        invulnerable: true,
        invulnerableUntil: player.invulnerableUntil,
        spawnProtectionMs: MATCH_CONFIG.SPAWN_PROTECTION_MS
      },
      players: this.roomManager.serializePlayers(room),
      pickups: room.pickups,
      droppedWeapons: room.droppedWeapons || []
    });
  }

  _setupHostIncomingConnection(conn) {
    const remoteId = conn.peer;

    conn.on('open', () => {
      this.clientConns.set(remoteId, conn);
    });

    conn.on('data', (msg) => {
      if (!msg || typeof msg !== 'object') return;

      if (msg.type === 'pingCheck') {
        if (conn.open) {
          conn.send({ type: 'pongCheck', id: msg.id, sentAt: msg.sentAt });
        }
        return;
      }

      if (msg.type !== 'emit') return;
      const { event, payload } = msg;

      if (event === 'joinRoom') {
        this.roomManager.removePlayer(remoteId);
        const joinPayload = {
          ...payload,
          roomCode: this.currentRoomCode
        };
        const result = this.roomManager.addHumanPlayer({ id: remoteId }, joinPayload);
        if (result.error) {
          conn.send({ type: 'event', event: 'joinError', data: { message: result.error } });
          return;
        }

        const { room, player } = result;
        const timeRemaining = Math.max(0, Math.ceil((room.matchEndsAt - Date.now()) / 1000));
        const mapCfg = getMapConfig(room.mapId);

        conn.send({
          type: 'event',
          event: 'roomJoined',
          data: {
            playerId: player.id,
            roomCode: room.code,
            isPublic: room.isPublic,
            mapId: room.mapId,
            mapName: mapCfg.name,
            botCount: room.desiredBots,
            killLimit: MATCH_CONFIG.KILL_LIMIT,
            timeRemaining,
            player: {
              id: player.id,
              name: player.name,
              color: player.color,
              x: player.x,
              y: player.y,
              z: player.z,
              yaw: player.yaw,
              pitch: player.pitch,
              weapon: player.weapon,
              loadout: player.loadout,
              hp: player.hp,
              ammo: player.ammo,
              reserveAmmo: player.reserveAmmo,
              ammoByWeapon: player.ammoByWeapon,
              reserveAmmoByWeapon: player.reserveAmmoByWeapon,
              invulnerable: true,
              invulnerableUntil: player.invulnerableUntil,
              spawnProtectionMs: MATCH_CONFIG.SPAWN_PROTECTION_MS
            },
            players: this.roomManager.serializePlayers(room),
            pickups: room.pickups,
            droppedWeapons: room.droppedWeapons || []
          }
        });

        const joinedNotice = { id: player.id, name: player.name, color: player.color };
        this._triggerClient('playerJoined', joinedNotice);
        this._broadcastToClients('playerJoined', joinedNotice, remoteId);
        return;
      }

      const room = this.roomManager.rooms.get(this.currentRoomCode);
      if (!room) return;
      const player = room.players.get(remoteId);
      if (!player) return;

      if (event === 'playerMove') {
        this.roomManager.handlePlayerMove(room, player, payload);
      } else if (event === 'shoot') {
        this.roomManager.handleShoot(room, player, payload);
      } else if (event === 'reload') {
        this.roomManager.handleReload(room, player, payload?.weapon);
      } else if (event === 'pickupWeapon') {
        this.roomManager.handlePickupWeapon(room, player, payload);
      } else if (event === 'updateLoadout') {
        const loadout = this.roomManager.handleUpdateLoadout(room, player, payload);
        if (loadout && conn.open) {
          conn.send({
            type: 'event',
            event: 'loadoutUpdated',
            data: {
              loadout,
              weapon: player.weapon,
              ammo: player.ammo,
              reserveAmmo: player.reserveAmmo,
              ammoByWeapon: player.ammoByWeapon,
              reserveAmmoByWeapon: player.reserveAmmoByWeapon,
              alive: player.alive
            }
          });
        }
      } else if (event === 'setBots') {
        const count = Math.max(0, Math.min(MATCH_CONFIG.MAX_BOTS, Math.floor(Number(payload?.botCount) || 0)));
        room.desiredBots = count;
        this.roomManager.syncRoomBots(room);
        const botsData = {
          botCount: room.desiredBots,
          players: this.roomManager.serializePlayers(room)
        };
        this._triggerClient('botsUpdated', botsData);
        this._broadcastToClients('botsUpdated', botsData);
      } else if (event === 'changeMap') {
        this.roomManager.changeRoomMap(room, payload?.mapId);
      } else if (event === 'leaveRoom') {
        this.roomManager.removePlayer(remoteId);
        this.clientConns.delete(remoteId);
      }
    });

    const handleDisconnect = () => {
      this.clientConns.delete(remoteId);
      this.roomManager.removePlayer(remoteId);
    };

    conn.on('close', handleDisconnect);
    conn.on('error', handleDisconnect);
  }

  _connectToExistingRoomHost(targetCode, payload) {
    const hostPeerId = `${PEER_ROOM_PREFIX}${targetCode}`;
    const clientPeer = new window.Peer({ debug: 0 });
    this.peer = clientPeer;
    let connected = false;

    const fallbackTimer = setTimeout(() => {
      if (!connected) {
        // Stale signaling entry or unreachable NAT — start local authoritative host for this room
        try {
          clientPeer.destroy();
        } catch {}
        this.peer = null;
        this._joinAsLocalHost(targetCode, payload);
      }
    }, 4500);

    clientPeer.on('open', (myPeerId) => {
      this.id = myPeerId;
      const conn = clientPeer.connect(hostPeerId, { reliable: true });
      this.hostConn = conn;

      conn.on('open', () => {
        connected = true;
        clearTimeout(fallbackTimer);
        this.role = 'client';
        this.currentRoomCode = targetCode;
        conn.send({
          type: 'emit',
          event: 'joinRoom',
          payload: {
            ...payload,
            roomCode: targetCode
          }
        });
      });

      conn.on('data', (msg) => {
        if (!msg || typeof msg !== 'object') return;
        if (msg.type === 'event') {
          this._triggerClient(msg.event, msg.data);
        } else if (msg.type === 'pongCheck') {
          const cb = this.pingCallbacks.get(msg.id);
          if (cb) {
            this.pingCallbacks.delete(msg.id);
            cb(msg.sentAt);
          }
        }
      });

      conn.on('close', () => {
        if (this.role === 'client' && this.currentRoomCode === targetCode) {
          // Host left the room — seamlessly promote/rejoin after a short random backoff
          const savedCode = this.currentRoomCode;
          const savedPayload = this.lastSavedPayload || payload;
          this._cleanupNetwork();
          setTimeout(() => {
            this.emit('joinRoom', { ...savedPayload, roomCode: savedCode });
          }, 250 + Math.floor(Math.random() * 450));
        }
      });
    });

    clientPeer.on('error', () => {
      if (!connected) {
        clearTimeout(fallbackTimer);
        this._joinAsLocalHost(targetCode, payload);
      }
    });
  }

  emit(event, payload = {}, ack = null) {
    if (event === 'pingCheck') {
      if (this.role === 'client' && this.hostConn?.open) {
        const pingId = Math.random().toString(36).slice(2, 9);
        this.pingCallbacks.set(pingId, ack);
        this.hostConn.send({ type: 'pingCheck', id: pingId, sentAt: payload });
      } else if (typeof ack === 'function') {
        setTimeout(() => ack(payload), 2);
      }
      return;
    }

    if (event === 'joinRoom') {
      this._cleanupNetwork();
      const targetCode = this._resolveTargetRoomCode(payload);
      this.lastSavedPayload = { ...payload, roomCode: targetCode };

      if (typeof window.Peer !== 'function') {
        this._joinAsLocalHost(targetCode, payload);
        return;
      }

      const hostPeerId = `${PEER_ROOM_PREFIX}${targetCode}`;
      const candidateHostPeer = new window.Peer(hostPeerId, { debug: 0 });
      this.peer = candidateHostPeer;
      let resolved = false;

      candidateHostPeer.on('open', () => {
        if (resolved) return;
        resolved = true;
        this.id = `host_${targetCode}`;
        this._joinAsLocalHost(targetCode, payload);
      });

      candidateHostPeer.on('connection', (conn) => {
        this._setupHostIncomingConnection(conn);
      });

      candidateHostPeer.on('error', (err) => {
        if (resolved) return;
        resolved = true;
        try {
          candidateHostPeer.destroy();
        } catch {}
        this.peer = null;

        if (err && err.type === 'unavailable-id') {
          // Room #targetCode is ALREADY hosted by another player! Connect to them via WebRTC P2P:
          this._connectToExistingRoomHost(targetCode, payload);
        } else {
          this._joinAsLocalHost(targetCode, payload);
        }
      });
      return;
    }

    if (event === 'leaveRoom') {
      if (this.role === 'client' && this.hostConn?.open) {
        try {
          this.hostConn.send({ type: 'emit', event: 'leaveRoom', payload: {} });
        } catch {}
      }
      this._cleanupNetwork();
      this.currentRoomCode = null;
      return;
    }

    if (!this.currentRoomCode) return;

    // If connected as a WebRTC Client to another player's Host, forward action over DataChannel
    if (this.role === 'client') {
      if (this.hostConn?.open) {
        this.hostConn.send({ type: 'emit', event, payload });
      }
      return;
    }

    // Otherwise we are the Authoritative Room Host
    const room = this.roomManager.rooms.get(this.currentRoomCode);
    if (!room) return;
    const player = room.players.get(this.id);

    if (event === 'playerMove' && player) {
      this.roomManager.handlePlayerMove(room, player, payload);
    } else if (event === 'shoot' && player) {
      this.roomManager.handleShoot(room, player, payload);
    } else if (event === 'reload' && player) {
      this.roomManager.handleReload(room, player, payload?.weapon);
    } else if (event === 'pickupWeapon' && player) {
      this.roomManager.handlePickupWeapon(room, player, payload);
    } else if (event === 'updateLoadout' && player) {
      const loadout = this.roomManager.handleUpdateLoadout(room, player, payload);
      if (loadout) {
        this._triggerClient('loadoutUpdated', {
          loadout,
          weapon: player.weapon,
          ammo: player.ammo,
          reserveAmmo: player.reserveAmmo,
          ammoByWeapon: player.ammoByWeapon,
          reserveAmmoByWeapon: player.reserveAmmoByWeapon,
          alive: player.alive
        });
      }
    } else if (event === 'setBots') {
      const count = Math.max(0, Math.min(MATCH_CONFIG.MAX_BOTS, Math.floor(Number(payload?.botCount) || 0)));
      room.desiredBots = count;
      this.roomManager.syncRoomBots(room);
      const botsData = {
        botCount: room.desiredBots,
        players: this.roomManager.serializePlayers(room)
      };
      this._triggerClient('botsUpdated', botsData);
      this._broadcastToClients('botsUpdated', botsData);
    } else if (event === 'changeMap') {
      this.roomManager.changeRoomMap(room, payload?.mapId);
    }
  }

  getActiveRooms() {
    return this.roomManager.getPublicRoomsSummary();
  }
}

export async function createNetworkClient() {
  const params = new URLSearchParams(window.location.search);
  const customServer = params.get('server') || window.POLYSTRIKE_SERVER_URL || '';

  // 1. Check if a live Node.js Socket.IO backend is serving /api/rooms
  if (typeof window.io === 'function') {
    try {
      const apiUrl = customServer ? `${customServer.replace(/\/$/, '')}/api/rooms` : './api/rooms';
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 1500);
      const res = await fetch(apiUrl, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (res.ok && res.headers.get('content-type')?.includes('application/json')) {
        const socket = customServer ? window.io(customServer) : window.io();
        return {
          mode: 'online-server',
          socket,
          fetchRooms: async () => {
            const r = await fetch(apiUrl);
            const data = await r.json();
            return data.rooms || [];
          }
        };
      }
    } catch {
      // Static host (e.g., GitHub Pages) detected — use WebRTC PeerRoomSocketAdapter
    }
  }

  // 2. Serverless WebRTC P2P Room Networking (GitHub Pages mode)
  const peerSocket = new PeerRoomSocketAdapter();
  return {
    mode: 'online-p2p',
    socket: peerSocket,
    fetchRooms: async () => peerSocket.getActiveRooms()
  };
}
