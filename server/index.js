import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { Server as SocketIOServer } from 'socket.io';
import { RoomManager } from './roomManager.js';
import { attachGameSocketHandlers } from './socketHandlers.js';
import { LanSignaling } from './lanSignaling.js';
import { LAN_MODE, TICK_HZ } from './room/sanitizers.js';
import { normalizeLanUrl } from '../shared/lanUrl.js';
import {
  parseCorsOrigins,
  createCorsOriginCheck,
  createAllowRequest
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
// The game server core is isomorphic: an in-browser LAN host (public/js/lanHost) imports it. The Node entry point stays private.
app.get('/server/index.js', (_req, res) => res.sendStatus(404));
app.use('/server', express.static(path.join(ROOT_DIR, 'server'), { maxAge: '1h' }));
app.use('/vendor/three', express.static(path.join(ROOT_DIR, 'node_modules/three/build')));
// GLTFLoader & friends (examples/jsm). The import map in index.html maps `three` to /vendor/three/three.module.js
// (same URL as the game's own import, so there is ONE three.js instance) and `three/addons/` to this folder.
app.use('/vendor/three-examples', express.static(path.join(ROOT_DIR, 'node_modules/three/examples/jsm'), { maxAge: '7d' }));

const roomManager = new RoomManager(io);

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

// Rendezvous for in-browser LAN rooms (a player's browser hosts the game; only the WebRTC handshake passes through here)
const lanSignaling = new LanSignaling();

// REST endpoint for active rooms summary (public online rooms + active LAN rooms)
app.get('/api/rooms', (_req, res) => {
  res.json({
    rooms: [
      ...roomManager.getPublicRoomsSummary(),
      ...lanSignaling.getLanRoomsSummary()
    ]
  });
});

// Fallback to index.html for any room query route
app.get('*', (_req, res) => {
  res.sendFile(path.join(ROOT_DIR, 'public/index.html'));
});

io.on('connection', (socket) => {
  attachGameSocketHandlers({ socket, roomManager, lanSignaling });
  lanSignaling.attach(socket);
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
