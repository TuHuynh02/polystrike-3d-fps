// Hybrid Network Adapter for POLYSTRIKE 3D
// - Connects to real Socket.IO server when hosted on Node.js (localhost / Render / Railway / ?server=URL)
// - Automatically falls back to an in-browser Authoritative RoomManager + BotAI engine when hosted
//   on static GitHub Pages so the public GitHub Pages link is 100% playable immediately!

import { MATCH_CONFIG, getMapConfig } from '../shared/constants.js';
import { RoomManager } from '../server/roomManager.js';

class LocalSocketAdapter {
  constructor() {
    this.id = 'local_player_1';
    this.clientHandlers = new Map();
    this.currentRoomCode = null;

    // Mock Socket.IO server broadcaster that routes room emissions directly to this client
    const ioMock = {
      to: (roomCode) => ({
        emit: (event, data) => {
          if (this.currentRoomCode === roomCode) {
            this._triggerClient(event, data);
          }
        }
      })
    };

    this.roomManager = new RoomManager(ioMock);
    // Create a default active public room so the lobby room browser is populated
    this.roomManager.createRoom('GH0001', true, MATCH_CONFIG.DEFAULT_BOTS);
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
        console.error(`[LocalSocketAdapter] Error in handler for ${event}:`, err);
      }
    }
  }

  emit(event, payload = {}, ack = null) {
    if (event === 'pingCheck') {
      if (typeof ack === 'function') {
        setTimeout(() => ack(payload), 4);
      }
      return;
    }

    if (event === 'joinRoom') {
      if (this.currentRoomCode) {
        this.roomManager.removePlayer(this.id);
        this.currentRoomCode = null;
      }

      const result = this.roomManager.addHumanPlayer({ id: this.id }, payload);
      if (result.error) {
        setTimeout(() => this._triggerClient('joinError', { message: result.error }), 0);
        return;
      }

      const { room, player } = result;
      this.currentRoomCode = room.code;
      const timeRemaining = Math.max(0, Math.ceil((room.matchEndsAt - Date.now()) / 1000));
      const mapCfg = getMapConfig(room.mapId);

      setTimeout(() => {
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
            invulnerable: true,
            invulnerableUntil: player.invulnerableUntil,
            spawnProtectionMs: MATCH_CONFIG.SPAWN_PROTECTION_MS
          },
          players: this.roomManager.serializePlayers(room),
          pickups: room.pickups
        });
      }, 0);
      return;
    }

    if (!this.currentRoomCode) return;
    const room = this.roomManager.rooms.get(this.currentRoomCode);
    if (!room) return;
    const player = room.players.get(this.id);

    if (event === 'playerMove' && player) {
      this.roomManager.handlePlayerMove(room, player, payload);
    } else if (event === 'shoot' && player) {
      this.roomManager.handleShoot(room, player, payload);
    } else if (event === 'reload' && player) {
      this.roomManager.handleReload(room, player, payload?.weapon);
    } else if (event === 'updateLoadout' && player) {
      const loadout = this.roomManager.handleUpdateLoadout(room, player, payload);
      if (loadout) {
        this._triggerClient('loadoutUpdated', {
          loadout,
          weapon: player.weapon,
          ammo: player.ammo,
          alive: player.alive
        });
      }
    } else if (event === 'setBots') {
      const count = Math.max(0, Math.min(MATCH_CONFIG.MAX_BOTS, Math.floor(Number(payload?.botCount) || 0)));
      room.desiredBots = count;
      this.roomManager.syncRoomBots(room);
      this._triggerClient('botsUpdated', {
        botCount: room.desiredBots,
        players: this.roomManager.serializePlayers(room)
      });
    } else if (event === 'changeMap') {
      this.roomManager.changeRoomMap(room, payload?.mapId);
    } else if (event === 'leaveRoom') {
      this.roomManager.removePlayer(this.id);
      this.currentRoomCode = null;
    }
  }

  getActiveRooms() {
    return this.roomManager.getPublicRoomsSummary();
  }
}

export async function createNetworkClient() {
  const params = new URLSearchParams(window.location.search);
  const customServer = params.get('server') || window.POLYSTRIKE_SERVER_URL || '';

  // Check if a live Node.js backend is serving /api/rooms
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
          mode: 'online',
          socket,
          fetchRooms: async () => {
            const r = await fetch(apiUrl);
            const data = await r.json();
            return data.rooms || [];
          }
        };
      }
    } catch {
      // Static host (e.g., GitHub Pages) detected — fall through to LocalSocketAdapter
    }
  }

  const localSocket = new LocalSocketAdapter();
  return {
    mode: 'standalone',
    socket: localSocket,
    fetchRooms: async () => localSocket.getActiveRooms()
  };
}
