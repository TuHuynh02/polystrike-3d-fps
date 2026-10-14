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
    this.hostFastConn = null;
    this.hostFastConnReady = false;
    this.hostFastDc = null; // Native RTCDataChannel { ordered: false, maxRetransmits: 0 }
    this.hostPingDc = null; // Dedicated native RTCDataChannel for zero-queue pingCheck
    this.clientConns = new Map(); // peerId -> reliable DataConnection (used when role === 'host')
    this.clientFastConns = new Map(); // peerId -> fallback fast DataConnection (used when role === 'host')
    this.clientFastDcs = new Map(); // peerId -> native unreliable RTCDataChannel (used when role === 'host')
    this.clientPingDcs = new Map(); // peerId -> native ping RTCDataChannel (used when role === 'host')
    this.pingCallbacks = new Map();
    this.lastSavedPayload = null;

    // Anti-bufferbloat coalescing & sequence tracking
    this.stateSeq = 0;
    this.lastReceivedStateSeq = 0;
    this._pendingStateSnapshot = null;
    this._stateFlushScheduled = false;
    this._pendingMovePayload = null;
    this._moveFlushTimer = null;

    // Pre-allocated emitter to avoid per-tick object allocations in RoomManager loop
    let targetRoomCode = null;
    const roomEmitter = {
      emit: (event, data) => {
        if (this.role === 'host' && this.currentRoomCode === targetRoomCode) {
          if (event === 'stateUpdate' && data) {
            this.stateSeq = (this.stateSeq + 1) | 0;
            data.seq = this.stateSeq;
          }
          this._triggerClient(event, data);
          this._broadcastToClients(event, data);
        }
      }
    };
    const ioMock = {
      to: (roomCode) => {
        targetRoomCode = roomCode;
        return roomEmitter;
      }
    };

    this.roomManager = new RoomManager(ioMock);

    // Enrich serializePlayers so remote clients receive authoritative vx, vy, vz for smooth dead-reckoning
    const origSerializePlayers = this.roomManager.serializePlayers.bind(this.roomManager);
    this.roomManager.serializePlayers = (room) => {
      const now = Date.now();
      const list = origSerializePlayers(room);
      if (!room || !room.players) return list;
      for (let i = 0; i < list.length; i++) {
        const item = list[i];
        const p = room.players.get(item.id);
        if (!p) continue;
        if (!p.isBot && p.lastMoveAt && now - p.lastMoveAt > 120) {
          p.vx = 0;
          p.vy = 0;
          p.vz = 0;
        }
        item.vx = Number((p.vx || 0).toFixed(2));
        item.vy = Number((p.vy || 0).toFixed(2));
        item.vz = Number((p.vz || 0).toFixed(2));
      }
      return list;
    };

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

  _canSendOnRawDc(dc, maxBufferedBytes = 2048) {
    if (!dc || dc.readyState !== 'open') return false;
    if (typeof dc.bufferedAmount === 'number' && dc.bufferedAmount > maxBufferedBytes) {
      return false;
    }
    return true;
  }

  _canSendUnreliable(conn, maxBufferedBytes = 2048) {
    if (!conn || !conn.open) return false;
    // Also check PeerJS internal JS buffer array so hidden queued packets never cause 300ms bufferbloat
    if (Array.isArray(conn._buffer) && conn._buffer.length > 0) {
      return false;
    }
    if (typeof conn.bufferSize === 'number' && conn.bufferSize > 0) {
      return false;
    }
    const dc = conn.dataChannel || conn._dc;
    if (dc && typeof dc.bufferedAmount === 'number' && dc.bufferedAmount > maxBufferedBytes) {
      return false;
    }
    return true;
  }

  _applyMoveWithVelocity(room, player, payload) {
    if (!room || !player || !payload || typeof payload !== 'object') return;
    if (typeof payload.seq === 'number') {
      if (player.lastMoveSeq && payload.seq <= player.lastMoveSeq && (player.lastMoveSeq - payload.seq) < 1000) {
        return; // Drop out-of-order movement packet
      }
      player.lastMoveSeq = payload.seq;
    }
    player.lastMoveAt = Date.now();
    const maxSpeed = (MATCH_CONFIG.SLIDE_INITIAL_SPEED || 11.2) * 1.35;
    if (typeof payload.vx === 'number' && Number.isFinite(payload.vx)) {
      player.vx = Math.max(-maxSpeed, Math.min(maxSpeed, payload.vx));
    }
    if (typeof payload.vy === 'number' && Number.isFinite(payload.vy)) {
      player.vy = Math.max(-30, Math.min(25, payload.vy));
    }
    if (typeof payload.vz === 'number' && Number.isFinite(payload.vz)) {
      player.vz = Math.max(-maxSpeed, Math.min(maxSpeed, payload.vz));
    }
    this.roomManager.handlePlayerMove(room, player, payload);
  }

  _broadcastToClients(event, data, excludePeerId = null) {
    if (this.clientConns.size === 0) return;
    const isEphemeralState = event === 'stateUpdate';

    if (isEphemeralState) {
      // Compact stateUpdate payload: omit droppedWeapons array when empty & unchanged
      const hasDrops = Array.isArray(data?.droppedWeapons) && data.droppedWeapons.length > 0;
      const shouldIncludeDrops = hasDrops || this._hadDroppedWeaponsLastTick;
      this._hadDroppedWeaponsLastTick = hasDrops;

      const statePacket = {
        type: 'event',
        event: 'stateUpdate',
        data: shouldIncludeDrops
          ? data
          : {
              seq: data.seq,
              timeRemaining: data.timeRemaining,
              players: data.players
            }
      };
      let serializedState = null;

      for (const [peerId, conn] of this.clientConns.entries()) {
        if (peerId === excludePeerId) continue;

        // 1. Prefer native WebRTC unreliable DataChannel ({ ordered: false, maxRetransmits: 0 })
        const rawFastDc = this.clientFastDcs.get(peerId);
        if (this._canSendOnRawDc(rawFastDc, 2048)) {
          try {
            if (!serializedState) serializedState = JSON.stringify(statePacket);
            rawFastDc.send(serializedState);
            continue;
          } catch {
            // Fall through to PeerJS channel
          }
        } else if (rawFastDc && rawFastDc.readyState === 'open') {
          // Drop stale stateUpdate when client's native fast channel has >2KB unacked data
          continue;
        }

        // 2. Fallback to PeerJS fastConn / reliable conn with tight 3KB buffer cap
        const fastConn = this.clientFastConns.get(peerId);
        const targetConn = fastConn?.open ? fastConn : conn;
        if (!this._canSendUnreliable(targetConn, 3072)) {
          continue; // Drop stale stateUpdate frame if peer's DataChannel buffer is congested
        }
        try {
          targetConn.send(statePacket);
        } catch {
          // Ignore transient send error
        }
      }
      return;
    }

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
    if (this._moveFlushTimer) {
      clearTimeout(this._moveFlushTimer);
      this._moveFlushTimer = null;
    }
    this._pendingMovePayload = null;
    this._pendingStateSnapshot = null;
    this._stateFlushScheduled = false;
    this.lastReceivedStateSeq = 0;

    if (this.hostPingDc) {
      try {
        this.hostPingDc.close();
      } catch {}
      this.hostPingDc = null;
    }
    if (this.hostFastDc) {
      try {
        this.hostFastDc.close();
      } catch {}
      this.hostFastDc = null;
    }
    if (this.hostFastConn) {
      try {
        this.hostFastConn.close();
      } catch {}
      this.hostFastConn = null;
    }
    this.hostFastConnReady = false;
    if (this.hostConn) {
      try {
        this.hostConn.close();
      } catch {}
      this.hostConn = null;
    }
    for (const dc of this.clientPingDcs.values()) {
      try {
        dc.close();
      } catch {}
    }
    this.clientPingDcs.clear();
    for (const dc of this.clientFastDcs.values()) {
      try {
        dc.close();
      } catch {}
    }
    this.clientFastDcs.clear();
    for (const conn of this.clientFastConns.values()) {
      try {
        conn.close();
      } catch {}
    }
    this.clientFastConns.clear();
    for (const conn of this.clientConns.values()) {
      try {
        conn.close();
      } catch {}
    }
    this.clientConns.clear();
    this.pingCallbacks.clear();
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

    // Remove any unused default rooms so Host only ticks the active room
    for (const code of Array.from(this.roomManager.rooms.keys())) {
      if (code !== targetCode) {
        this.roomManager.rooms.delete(code);
      }
    }

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

  _handleHostIncomingMessage(remoteId, conn, msg) {
    if (typeof msg === 'string') {
      try {
        msg = JSON.parse(msg);
      } catch {
        return;
      }
    }
    if (!msg || typeof msg !== 'object') return;

    // Fast compact movement packet { t: 'm', p: movePayload }
    if (msg.t === 'm' && msg.p) {
      const room = this.roomManager.rooms.get(this.currentRoomCode);
      if (!room) return;
      const player = room.players.get(remoteId);
      if (!player) return;
      this._applyMoveWithVelocity(room, player, msg.p);
      return;
    }

    if (msg.type === 'pingCheck') {
      const pongPacket = { type: 'pongCheck', id: msg.id, sentAt: msg.sentAt };
      const rawPingDc = this.clientPingDcs.get(remoteId) || this.clientFastDcs.get(remoteId);
      if (this._canSendOnRawDc(rawPingDc, 4096)) {
        try {
          rawPingDc.send(JSON.stringify(pongPacket));
          return;
        } catch {}
      }
      if (conn && conn.open && typeof conn.send === 'function') {
        try {
          conn.send(pongPacket);
        } catch {}
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
      this._applyMoveWithVelocity(room, player, payload);
    } else if (event === 'shoot') {
      this.roomManager.handleShoot(room, player, payload);
    } else if (event === 'reload') {
      this.roomManager.handleReload(room, player, payload?.weapon);
    } else if (event === 'pickupWeapon') {
      this.roomManager.handlePickupWeapon(room, player, payload);
    } else if (event === 'updateLoadout') {
      const loadout = this.roomManager.handleUpdateLoadout(room, player, payload);
      const reliableConn = this.clientConns.get(remoteId) || conn;
      if (loadout && reliableConn?.open) {
        reliableConn.send({
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
      this.clientFastConns.delete(remoteId);
      this.clientFastDcs.delete(remoteId);
      this.clientPingDcs.delete(remoteId);
    }
  }

  _bindHostNativeDataChannel(remoteId, conn, dc) {
    if (!dc) return;
    const isPing = dc.label === 'polystrike-ping';
    const isFast = dc.label === 'polystrike-fast';
    if (!isPing && !isFast) return;

    const registerDc = () => {
      if (isPing) {
        this.clientPingDcs.set(remoteId, dc);
      } else {
        this.clientFastDcs.set(remoteId, dc);
      }
    };

    if (dc.readyState === 'open') {
      registerDc();
    } else {
      dc.addEventListener('open', registerDc);
    }

    dc.addEventListener('message', (ev) => {
      this._handleHostIncomingMessage(remoteId, conn, ev.data);
    });

    const cleanup = () => {
      if (isPing && this.clientPingDcs.get(remoteId) === dc) {
        this.clientPingDcs.delete(remoteId);
      }
      if (isFast && this.clientFastDcs.get(remoteId) === dc) {
        this.clientFastDcs.delete(remoteId);
      }
    };
    dc.addEventListener('close', cleanup);
    dc.addEventListener('error', cleanup);
  }

  _attachHostPeerConnectionListeners(remoteId, conn) {
    const pc = conn.peerConnection || conn._pc;
    if (!pc || pc._polystrikeHooked) return;
    pc._polystrikeHooked = true;
    pc.addEventListener('datachannel', (ev) => {
      if (ev && ev.channel) {
        this._bindHostNativeDataChannel(remoteId, conn, ev.channel);
      }
    });
  }

  _setupHostIncomingConnection(conn) {
    const remoteId = conn.peer;
    const isFastChannel = conn.metadata && conn.metadata.channel === 'fast';

    if (isFastChannel) {
      conn.on('open', () => {
        this.clientFastConns.set(remoteId, conn);
      });
      conn.on('data', (msg) => {
        this._handleHostIncomingMessage(remoteId, conn, msg);
      });
      const cleanupFast = () => {
        if (this.clientFastConns.get(remoteId) === conn) {
          this.clientFastConns.delete(remoteId);
        }
      };
      conn.on('close', cleanupFast);
      conn.on('error', cleanupFast);
      return;
    }

    this._attachHostPeerConnectionListeners(remoteId, conn);

    conn.on('open', () => {
      this.clientConns.set(remoteId, conn);
      this._attachHostPeerConnectionListeners(remoteId, conn);
    });

    conn.on('data', (msg) => {
      this._handleHostIncomingMessage(remoteId, conn, msg);
    });

    const handleDisconnect = () => {
      this.clientConns.delete(remoteId);
      const pingDc = this.clientPingDcs.get(remoteId);
      if (pingDc) {
        this.clientPingDcs.delete(remoteId);
        try {
          pingDc.close();
        } catch {}
      }
      const fastDc = this.clientFastDcs.get(remoteId);
      if (fastDc) {
        this.clientFastDcs.delete(remoteId);
        try {
          fastDc.close();
        } catch {}
      }
      const fastConn = this.clientFastConns.get(remoteId);
      if (fastConn) {
        this.clientFastConns.delete(remoteId);
        try {
          fastConn.close();
        } catch {}
      }
      this.roomManager.removePlayer(remoteId);
    };

    conn.on('close', handleDisconnect);
    conn.on('error', handleDisconnect);
  }

  _handleClientIncomingData(msg) {
    if (typeof msg === 'string') {
      try {
        msg = JSON.parse(msg);
      } catch {
        return;
      }
    }
    if (!msg || typeof msg !== 'object') return;
    if (msg.type === 'event') {
      if (msg.event === 'stateUpdate' && msg.data) {
        const seq = msg.data.seq;
        if (typeof seq === 'number') {
          if (this.lastReceivedStateSeq && seq <= this.lastReceivedStateSeq && (this.lastReceivedStateSeq - seq) < 1000) {
            return; // Discard out-of-order stale stateUpdate
          }
          this.lastReceivedStateSeq = seq;
        }
        // Coalesce burst stateUpdate deliveries within the same microtask batch so only the newest snapshot runs
        this._pendingStateSnapshot = msg.data;
        if (!this._stateFlushScheduled) {
          this._stateFlushScheduled = true;
          queueMicrotask(() => {
            this._stateFlushScheduled = false;
            const latest = this._pendingStateSnapshot;
            this._pendingStateSnapshot = null;
            if (latest && this.role === 'client') {
              this._triggerClient('stateUpdate', latest);
            }
          });
        }
        return;
      }
      this._triggerClient(msg.event, msg.data);
    } else if (msg.type === 'pongCheck') {
      const entry = this.pingCallbacks.get(msg.id);
      if (entry) {
        this.pingCallbacks.delete(msg.id);
        if (typeof entry.cb === 'function') {
          entry.cb(msg.sentAt);
        }
      }
    }
  }

  _openClientNativeUnreliableChannels(conn) {
    const pc = conn.peerConnection || conn._pc;
    if (!pc || typeof pc.createDataChannel !== 'function') return;

    try {
      // True UDP-style WebRTC DataChannel: unordered + 0 retransmissions (zero Head-of-Line blocking!)
      const fastDc = pc.createDataChannel('polystrike-fast', {
        ordered: false,
        maxRetransmits: 0
      });
      this.hostFastDc = fastDc;
      fastDc.addEventListener('open', () => {
        this.hostFastConnReady = true;
        this._flushPendingClientMove();
      });
      fastDc.addEventListener('message', (ev) => {
        this._handleClientIncomingData(ev.data);
      });
      const cleanupFastDc = () => {
        if (this.hostFastDc === fastDc) {
          this.hostFastDc = null;
          this.hostFastConnReady = false;
        }
      };
      fastDc.addEventListener('close', cleanupFastDc);
      fastDc.addEventListener('error', cleanupFastDc);
    } catch {}

    try {
      // Dedicated lightweight channel for pingCheck/pongCheck so movement traffic never inflates RTT
      const pingDc = pc.createDataChannel('polystrike-ping', {
        ordered: false,
        maxRetransmits: 0
      });
      this.hostPingDc = pingDc;
      pingDc.addEventListener('message', (ev) => {
        this._handleClientIncomingData(ev.data);
      });
      const cleanupPingDc = () => {
        if (this.hostPingDc === pingDc) {
          this.hostPingDc = null;
        }
      };
      pingDc.addEventListener('close', cleanupPingDc);
      pingDc.addEventListener('error', cleanupPingDc);
    } catch {}
  }

  _flushPendingClientMove() {
    if (this._moveFlushTimer) {
      clearTimeout(this._moveFlushTimer);
      this._moveFlushTimer = null;
    }
    if (this.role !== 'client' || !this._pendingMovePayload) return;

    const payload = this._pendingMovePayload;
    if (this._canSendOnRawDc(this.hostFastDc, 1024)) {
      this._pendingMovePayload = null;
      try {
        this.hostFastDc.send(JSON.stringify({ t: 'm', p: payload }));
        return;
      } catch {}
    }

    const moveConn = (this.hostFastConnReady && this.hostFastConn?.open)
      ? this.hostFastConn
      : this.hostConn;
    if (this._canSendUnreliable(moveConn, 2048)) {
      this._pendingMovePayload = null;
      try {
        moveConn.send({ t: 'm', p: payload });
        return;
      } catch {}
    }

    // Channel buffer still busy — reschedule a single drain check for the latest position
    this._moveFlushTimer = setTimeout(() => {
      this._moveFlushTimer = null;
      this._flushPendingClientMove();
    }, 12);
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
      // Primary reliable JSON DataChannel for room events, combat actions, and state fallback
      const conn = clientPeer.connect(hostPeerId, {
        reliable: true,
        serialization: 'json',
        metadata: { channel: 'reliable' }
      });
      this.hostConn = conn;

      conn.on('open', () => {
        connected = true;
        clearTimeout(fallbackTimer);
        this.role = 'client';
        this.currentRoomCode = targetCode;
        // Stop any local host rooms so the client browser spends 0% CPU on local bot ticks
        this.roomManager.rooms.clear();

        // Open native in-band WebRTC unreliable DataChannels ({ ordered: false, maxRetransmits: 0 })
        // on the SAME RTCPeerConnection for zero-HoL-blocking movement & isolated ping measurement
        this._openClientNativeUnreliableChannels(conn);

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
        this._handleClientIncomingData(msg);
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
      if (this.role === 'client') {
        const now = Date.now();
        if (this.pingCallbacks.size > 8) {
          for (const [k, v] of this.pingCallbacks.entries()) {
            if (now - v.createdAt > 5000) this.pingCallbacks.delete(k);
          }
        }
        const pingId = Math.random().toString(36).slice(2, 9);
        const pingPacket = { type: 'pingCheck', id: pingId, sentAt: payload };

        // 1. Prefer dedicated zero-queue native ping DataChannel
        if (this._canSendOnRawDc(this.hostPingDc, 4096)) {
          this.pingCallbacks.set(pingId, { cb: ack, createdAt: now });
          try {
            this.hostPingDc.send(JSON.stringify(pingPacket));
            return;
          } catch {
            this.pingCallbacks.delete(pingId);
          }
        }

        // 2. Next prefer native fast DataChannel
        if (this._canSendOnRawDc(this.hostFastDc, 4096)) {
          this.pingCallbacks.set(pingId, { cb: ack, createdAt: now });
          try {
            this.hostFastDc.send(JSON.stringify(pingPacket));
            return;
          } catch {
            this.pingCallbacks.delete(pingId);
          }
        }

        // 3. Fallback to PeerJS DataConnection
        const targetConn = (this.hostFastConnReady && this.hostFastConn?.open)
          ? this.hostFastConn
          : this.hostConn;
        if (targetConn?.open) {
          this.pingCallbacks.set(pingId, { cb: ack, createdAt: now });
          try {
            targetConn.send(pingPacket);
          } catch {
            this.pingCallbacks.delete(pingId);
          }
          return;
        }
      }
      if (typeof ack === 'function') {
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
      if (event === 'playerMove') {
        this._pendingMovePayload = payload;
        this._flushPendingClientMove();
        return;
      }

      if (this.hostConn?.open) {
        try {
          this.hostConn.send({ type: 'emit', event, payload });
        } catch {}
      }
      return;
    }

    // Otherwise we are the Authoritative Room Host
    const room = this.roomManager.rooms.get(this.currentRoomCode);
    if (!room) return;
    const player = room.players.get(this.id);

    if (event === 'playerMove' && player) {
      this._applyMoveWithVelocity(room, player, payload);
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
        const rawSocket = customServer
          ? window.io(customServer, { transports: ['websocket', 'polling'] })
          : window.io({ transports: ['websocket', 'polling'] });
        const origEmit = rawSocket.emit.bind(rawSocket);
        rawSocket.emit = (event, payload, ack) => {
          if (event === 'playerMove' && rawSocket.volatile) {
            rawSocket.volatile.emit('playerMove', payload);
            return;
          }
          return origEmit(event, payload, ack);
        };
        return {
          mode: 'online-server',
          socket: rawSocket,
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
