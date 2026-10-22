// Per-socket event wiring of the game server. Shared by the Node server (Socket.IO sockets, server/index.js) and by the
// in-browser LAN host (public/js/lanHost, where the "sockets" are WebRTC peers), so both run exactly the same game protocol.
// `socket` needs: id, on, emit, join, leave, to(room).emit, disconnect, disconnected.
import { MATCH_CONFIG, getMapConfig } from '../shared/constants.js';
import { NET_CONFIG } from './room/sanitizers.js';
import {
  safeHandler,
  guardedOn,
  createRateLimiter,
  installSmartVolatile
} from './socketGuard.js';

const HOST_ONLY_MESSAGE = 'Chỉ chủ phòng mới có thể đổi map.';

export function attachGameSocketHandlers({ socket, roomManager }) {
  installSmartVolatile(socket);
  let currentRoomCode = null;

  // Every event handler below is crash-proof (try/catch), rate limited per
  // socket and, unless noted, requires a plain-object payload.
  const limiter = createRateLimiter();
  const on = (event, handler, options) => guardedOn(socket, limiter, event, handler, options);

  on('joinRoom', (payload) => {
    try {
      // Leave previous room if any
      if (currentRoomCode) {
        socket.leave(currentRoomCode);
        roomManager.removePlayer(socket.id);
        currentRoomCode = null;
      }

      const result = roomManager.addHumanPlayer(socket, payload);
      if (result.error) {
        socket.emit('joinError', { message: result.error });
        return;
      }

      const { room, player } = result;
      currentRoomCode = room.code;
      socket.join(room.code);
      roomManager.startLatencyProbe(socket, player); // server-measured RTT for lag compensation (stopped in removePlayer)

      const timeRemaining = room.state === 'WAITING'
        ? MATCH_CONFIG.MATCH_DURATION_SEC
        : Math.max(0, Math.ceil((room.matchEndsAt - Date.now()) / 1000));
      const mapCfg = getMapConfig(room.mapId);

      socket.emit('roomJoined', {
        playerId: player.id,
        roomCode: room.code,
        isPublic: room.isPublic,
        gameMode: room.gameMode || 'ffa',
        state: room.state,
        hostId: room.hostId,
        teamScores: room.teamScores || { alpha: 0, bravo: 0 },
        mapId: room.mapId,
        mapName: mapCfg.name,
        killLimit: room.killLimit || (room.gameMode === 'tdm' ? (MATCH_CONFIG.TDM_KILL_LIMIT || 30) : MATCH_CONFIG.KILL_LIMIT),
        timeRemaining,
        net: NET_CONFIG,
        player: {
          id: player.id,
          name: player.name,
          color: player.color,
          team: player.team || null,
          ready: Boolean(player.ready),
          x: player.x,
          y: player.y,
          z: player.z,
          yaw: player.yaw,
          pitch: player.pitch,
          weapon: player.weapon,
          loadout: player.loadout,
          hp: player.hp,
          armor: player.armor || 0,
          ammo: player.ammo,
          reserveAmmo: player.reserveAmmo,
          ammoByWeapon: player.ammoByWeapon,
          reserveAmmoByWeapon: player.reserveAmmoByWeapon,
          grenades: player.grenades ?? 1,
          moveEpoch: player.moveEpoch,
          // Secret 32-bit seed of this player's deterministic weapon spread: owner-only (this event goes to this socket alone)
          spreadSeed: player.spreadSeed,
          invulnerable: true,
          invulnerableUntil: player.invulnerableUntil,
          spawnProtectionMs: MATCH_CONFIG.SPAWN_PROTECTION_MS
        },
        players: roomManager.serializePlayers(room),
        pickups: room.pickups,
        barrels: room.barrels || [],
        droppedWeapons: room.droppedWeapons || [],
        activeGrenades: room.grenades || []
      });

      socket.to(room.code).emit('playerJoined', {
        id: player.id,
        name: player.name,
        color: player.color,
        team: player.team || null
      });

      if (room.gameMode === 'tdm') {
        roomManager.broadcastTeamLobby(room);
      }
    } catch (err) {
      if (currentRoomCode) {
        try {
          socket.leave(currentRoomCode);
          roomManager.removePlayer(socket.id);
        } catch {
          // ignore rollback error
        }
        currentRoomCode = null;
      }
      console.error('Error in joinRoom:', err);
      socket.emit('joinError', { message: 'Không thể tham gia phòng chơi. Vui lòng thử lại.' });
    }
  });

  // Client input commands (client-side prediction): { e: moveEpoch, cmds: [{ seq, mf, mr, yaw, pitch, lean, btn, w, ss? }] }.
  // Positions are never accepted from clients; commands are queued here and simulated on the server tick. A command with the
  // FIRE bit (btn & 64) and a shot sequence `ss` is a shot, resolved entirely on the server.
  on('inputBatch', (payload) => {
    if (!currentRoomCode) return;
    const room = roomManager.rooms.get(currentRoomCode);
    if (!room) return;
    const player = room.players.get(socket.id);
    if (!player) return;
    roomManager.handleInputBatch(room, player, payload);
  });

  // There is deliberately NO `shoot` event: a shot is the FIRE bit (+ `ss`) of an input command inside `inputBatch`. The server
  // computes direction, spread and hits itself (RoomManager.processFireCommand -> resolveShot).

  on('throwGrenade', (payload) => {
    if (!currentRoomCode) return;
    const room = roomManager.rooms.get(currentRoomCode);
    if (!room) return;
    const player = room.players.get(socket.id);
    if (!player) return;
    roomManager.handleThrowGrenade(room, player, payload);
  });

  on('reload', (payload) => {
    if (!currentRoomCode) return;
    const room = roomManager.rooms.get(currentRoomCode);
    if (!room) return;
    const player = room.players.get(socket.id);
    if (!player) return;
    roomManager.handleReload(room, player, payload?.weapon);
  });

  on('pickupWeapon', (payload) => {
    if (!currentRoomCode) return;
    const room = roomManager.rooms.get(currentRoomCode);
    if (!room) return;
    const player = room.players.get(socket.id);
    if (!player) return;
    roomManager.handlePickupWeapon(room, player, payload);
  });

  on('updateLoadout', (payload) => {
    if (!currentRoomCode) return;
    const room = roomManager.rooms.get(currentRoomCode);
    if (!room) return;
    const player = room.players.get(socket.id);
    if (!player) return;
    const loadout = roomManager.handleUpdateLoadout(room, player, payload);
    if (loadout) {
      socket.emit('loadoutUpdated', {
        loadout,
        weapon: player.weapon,
        ammo: player.ammo,
        reserveAmmo: player.reserveAmmo,
        ammoByWeapon: player.ammoByWeapon,
        reserveAmmoByWeapon: player.reserveAmmoByWeapon,
        alive: player.alive
      });
    }
  });

  on('changeMap', (payload) => {
    if (!currentRoomCode) return;
    const room = roomManager.rooms.get(currentRoomCode);
    if (!room) return;
    const player = room.players.get(socket.id);
    if (!player) return;
    const result = roomManager.handleChangeMap(room, player, payload);
    if (!result.ok) {
      socket.emit('actionDenied', { action: 'changeMap', reason: result.error, message: HOST_ONLY_MESSAGE });
    }
  });

  on('switchTeam', (payload) => {
    if (!currentRoomCode) return;
    const room = roomManager.rooms.get(currentRoomCode);
    if (!room) return;
    const player = room.players.get(socket.id);
    if (!player) return;
    const result = roomManager.handleSwitchTeam(room, player, payload || {});
    if (!result.ok) {
      socket.emit('actionDenied', { action: 'switchTeam', reason: result.error, message: result.message || result.error });
    }
  }, { expectObject: false });

  on('setTeamReady', (payload) => {
    if (!currentRoomCode) return;
    const room = roomManager.rooms.get(currentRoomCode);
    if (!room) return;
    const player = room.players.get(socket.id);
    if (!player) return;
    const result = roomManager.handleSetTeamReady(room, player, payload || {});
    if (!result.ok) {
      socket.emit('actionDenied', { action: 'setTeamReady', reason: result.error, message: result.message || result.error });
    }
  }, { expectObject: false });

  on('startTeamMatch', () => {
    if (!currentRoomCode) return;
    const room = roomManager.rooms.get(currentRoomCode);
    if (!room) return;
    const player = room.players.get(socket.id);
    if (!player) return;
    const result = roomManager.handleStartTeamMatch(room, player);
    if (!result.ok) {
      socket.emit('actionDenied', {
        action: 'startTeamMatch',
        reason: result.error,
        message: result.message || (result.error === 'not_host' ? HOST_ONLY_MESSAGE : 'Cần ít nhất 1 người ở mỗi phe để bắt đầu trận đấu.')
      });
    }
  }, { expectObject: false });

  on('pingCheck', (clientSentAt, ack) => {
    if (typeof ack === 'function') {
      ack(clientSentAt);
    }
  }, { expectObject: false });

  on('leaveRoom', () => {
    if (currentRoomCode) {
      socket.leave(currentRoomCode);
      roomManager.removePlayer(socket.id);
      currentRoomCode = null;
    }
  }, { expectObject: false });

  // Cleanup must always run (even for a flood-disconnected socket), so it is
  // crash-proofed but intentionally not rate limited.
  socket.on('disconnect', safeHandler('disconnect', () => {
    if (currentRoomCode) {
      roomManager.removePlayer(socket.id);
      currentRoomCode = null;
    }
  }));
}
