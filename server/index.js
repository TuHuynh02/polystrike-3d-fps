import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { Server as SocketIOServer } from 'socket.io';
import { MATCH_CONFIG, getMapConfig } from '../shared/constants.js';
import { RoomManager } from './roomManager.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

const app = express();
const server = http.createServer(app);

// Disable Nagle's algorithm (TCP_NODELAY) on all sockets for immediate 30Hz FPS packet delivery
server.on('connection', (tcpSocket) => {
  tcpSocket.setNoDelay(true);
});

const io = new SocketIOServer(server, {
  cors: {
    origin: '*'
  },
  transports: ['websocket', 'polling'],
  perMessageDeflate: false,
  httpCompression: false,
  pingInterval: 10000,
  pingTimeout: 8000
});

// Serve static assets
app.use(express.static(path.join(ROOT_DIR, 'public')));
app.use('/shared', express.static(path.join(ROOT_DIR, 'shared')));
app.use('/server', express.static(path.join(ROOT_DIR, 'server')));
app.use('/vendor/three', express.static(path.join(ROOT_DIR, 'node_modules/three/build')));

const roomManager = new RoomManager(io);

// Render.com Health Check Endpoint
app.get('/healthz', (_req, res) => {
  res.status(200).json({ status: 'ok', uptime: Math.floor(process.uptime()) });
});

// REST endpoint for active rooms summary
app.get('/api/rooms', (_req, res) => {
  res.json({
    rooms: roomManager.getPublicRoomsSummary()
  });
});

// Fallback to index.html for any room query route
app.get('*', (_req, res) => {
  res.sendFile(path.join(ROOT_DIR, 'public/index.html'));
});

io.on('connection', (socket) => {
  let currentRoomCode = null;

  socket.on('joinRoom', (payload = {}) => {
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

      const timeRemaining = Math.max(0, Math.ceil((room.matchEndsAt - Date.now()) / 1000));
      const mapCfg = getMapConfig(room.mapId);

      socket.emit('roomJoined', {
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
          grenades: player.grenades ?? 1,
          invulnerable: true,
          invulnerableUntil: player.invulnerableUntil,
          spawnProtectionMs: MATCH_CONFIG.SPAWN_PROTECTION_MS
        },
        players: roomManager.serializePlayers(room),
        pickups: room.pickups,
        droppedWeapons: room.droppedWeapons || [],
        activeGrenades: room.grenades || []
      });

      socket.to(room.code).emit('playerJoined', {
        id: player.id,
        name: player.name,
        color: player.color
      });
    } catch (err) {
      console.error('Error in joinRoom:', err);
      socket.emit('joinError', { message: 'Không thể tham gia phòng chơi. Vui lòng thử lại.' });
    }
  });

  socket.on('playerMove', (payload = {}) => {
    if (!currentRoomCode) return;
    const room = roomManager.rooms.get(currentRoomCode);
    if (!room) return;
    const player = room.players.get(socket.id);
    if (!player) return;
    roomManager.handlePlayerMove(room, player, payload);
  });

  socket.on('shoot', (payload = {}) => {
    if (!currentRoomCode) return;
    const room = roomManager.rooms.get(currentRoomCode);
    if (!room) return;
    const player = room.players.get(socket.id);
    if (!player) return;
    roomManager.handleShoot(room, player, payload);
  });

  socket.on('throwGrenade', (payload = {}) => {
    if (!currentRoomCode) return;
    const room = roomManager.rooms.get(currentRoomCode);
    if (!room) return;
    const player = room.players.get(socket.id);
    if (!player) return;
    roomManager.handleThrowGrenade(room, player, payload);
  });

  socket.on('reload', (payload = {}) => {
    if (!currentRoomCode) return;
    const room = roomManager.rooms.get(currentRoomCode);
    if (!room) return;
    const player = room.players.get(socket.id);
    if (!player) return;
    roomManager.handleReload(room, player, payload?.weapon);
  });

  socket.on('pickupWeapon', (payload = {}) => {
    if (!currentRoomCode) return;
    const room = roomManager.rooms.get(currentRoomCode);
    if (!room) return;
    const player = room.players.get(socket.id);
    if (!player) return;
    roomManager.handlePickupWeapon(room, player, payload);
  });

  socket.on('updateLoadout', (payload = {}) => {
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

  socket.on('setBots', (payload = {}) => {
    if (!currentRoomCode) return;
    const room = roomManager.rooms.get(currentRoomCode);
    if (!room) return;
    const count = Math.max(0, Math.min(MATCH_CONFIG.MAX_BOTS, Math.floor(Number(payload?.botCount) || 0)));
    room.desiredBots = count;
    roomManager.syncRoomBots(room);
    io.to(room.code).emit('botsUpdated', {
      botCount: room.desiredBots,
      players: roomManager.serializePlayers(room)
    });
  });

  socket.on('changeMap', (payload = {}) => {
    if (!currentRoomCode) return;
    const room = roomManager.rooms.get(currentRoomCode);
    if (!room) return;
    roomManager.changeRoomMap(room, payload?.mapId);
  });

  socket.on('pingCheck', (clientSentAt, ack) => {
    if (typeof ack === 'function') {
      ack(clientSentAt);
    }
  });

  socket.on('leaveRoom', () => {
    if (currentRoomCode) {
      socket.leave(currentRoomCode);
      roomManager.removePlayer(socket.id);
      currentRoomCode = null;
    }
  });

  socket.on('disconnect', () => {
    if (currentRoomCode) {
      roomManager.removePlayer(socket.id);
      currentRoomCode = null;
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`\n==================================================`);
  console.log(`🎯 POLYSTRIKE 3D FPS Server running at:`);
  console.log(`   👉 http://localhost:${ PORT }`);
  console.log(`==================================================\n`);
});
