import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { Server as SocketIOServer } from 'socket.io';
import { MATCH_CONFIG, getMapConfig } from '../shared/constants.js';
import { RoomManager } from './roomManager.js';
import { LAN_MODE, NET_CONFIG, TICK_HZ } from './room/sanitizers.js';
import { normalizeLanUrl } from '../shared/lanUrl.js';
import {
  safeHandler,
  guardedOn,
  createRateLimiter,
  parseCorsOrigins,
  createCorsOriginCheck,
  createAllowRequest,
  installSmartVolatile
} from './socketGuard.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

const app = express();
const server = http.createServer(app);

// Disable Nagle's algorithm (TCP_NODELAY) on all sockets for immediate 30Hz FPS packet delivery
server.on('connection', (tcpSocket) => {
  tcpSocket.setNoDelay(true);
});

// CORS_ORIGINS: comma-separated list of extra browser origins allowed to connect
// (e.g. "https://my-frontend.example.com" for the ?server=<this-url> flow).
// When unset/empty only same-origin pages (served by this server) can connect.
// Use "*" to explicitly allow every origin. Applies to polling CORS headers and
// to the WebSocket handshake Origin check (non-browser clients w/o Origin pass).
const CORS_ORIGINS = parseCorsOrigins(process.env.CORS_ORIGINS);

const PING_INTERVAL_MS = 10000;
const PING_TIMEOUT_MS = 8000;

const io = new SocketIOServer(server, {
  cors: {
    origin: createCorsOriginCheck(CORS_ORIGINS)
  },
  allowRequest: createAllowRequest(CORS_ORIGINS),
  maxHttpBufferSize: 100_000,
  transports: ['websocket', 'polling'],
  perMessageDeflate: false,
  httpCompression: false,
  // Heartbeat: the server pings every 10 s and drops a socket 8 s after an unanswered ping, i.e. a silent link may be dead for
  // up to 18 s before the player is removed. Shorter values turn an ordinary Wi-Fi hiccup / roaming gap (several seconds) into
  // a disconnect -> new socket id -> player removed and re-created ("teleport"/ghost storms); longer ones would leave a
  // frozen ghost body of a really dead client in the room for even longer. 10 s / 8 s is also well below the idle timeouts of
  // Render's proxy. (The client now re-joins the room by itself after a reconnect, see networkAdapter.installRejoinOnReconnect.)
  pingInterval: PING_INTERVAL_MS,
  pingTimeout: PING_TIMEOUT_MS
});

// Serve static assets
// glTF models + PBR textures are large and never change under the same URL: cache them for a week and make sure .glb
// has the right content type even if the installed `mime` database predates glTF.
const staticAssetOptions = {
  maxAge: '7d',
  setHeaders(res, filePath) {
    if (filePath.endsWith('.glb')) res.setHeader('Content-Type', 'model/gltf-binary');
    else if (filePath.endsWith('.gltf')) res.setHeader('Content-Type', 'model/gltf+json');
  }
};
app.use('/assets', express.static(path.join(ROOT_DIR, 'public', 'assets'), staticAssetOptions));
app.use(express.static(path.join(ROOT_DIR, 'public')));
app.use('/shared', express.static(path.join(ROOT_DIR, 'shared')));
app.use('/vendor/three', express.static(path.join(ROOT_DIR, 'node_modules/three/build')));
// GLTFLoader & friends (examples/jsm). The import map in index.html maps `three` to /vendor/three/three.module.js
// (same URL as the game's own import, so there is ONE three.js instance) and `three/addons/` to this folder.
app.use('/vendor/three-examples', express.static(path.join(ROOT_DIR, 'node_modules/three/examples/jsm'), { maxAge: '7d' }));

const roomManager = new RoomManager(io);
const HOST_ONLY_MESSAGE = 'Chỉ chủ phòng mới có thể đổi map.';

// Render.com Health Check Endpoint
app.get('/healthz', (_req, res) => {
  res.status(200).json({ status: 'ok', uptime: Math.floor(process.uptime()) });
});

// Server health for load tests / debugging: tick duration + lateness, snapshot size. Counts and timings only.
app.get('/api/netstats', (_req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json(roomManager.getNetStats());
});

// LAN_SERVER_URL (e.g. "http://192.168.2.161:3000"): the office LAN server that "create private room" sends players to when
// this server is the public one (Render). Unset = private rooms are created on this very server.
const LAN_SERVER_URL = normalizeLanUrl(process.env.LAN_SERVER_URL);
app.get('/api/config', (_req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({ lanUrl: LAN_SERVER_URL || null });
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
});

const PORT = process.env.PORT || 3000;
// Non-loopback IPv4 addresses of this machine: the URLs teammates on the same LAN/Wi-Fi can open to play without Render.
function lanAddresses() {
  const out = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const ni of list || []) {
      if (ni.family === 'IPv4' && !ni.internal) out.push(ni.address);
    }
  }
  return out;
}

server.listen(PORT, () => {
  console.log(`\n==================================================`);
  console.log(`🎯 POLYSTRIKE 3D FPS Server running at:`);
  console.log(`   👉 http://localhost:${ PORT }`);
  for (const ip of lanAddresses()) console.log(`   🏢 LAN: http://${ ip }:${ PORT }`);
  console.log(`   ⚙️  Tick rate: ${ TICK_HZ } Hz${ LAN_MODE ? ' (LAN mode)' : '' }`);
  console.log(`==================================================\n`);
});
