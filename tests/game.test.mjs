/**
 * Comprehensive Automated Test Suite for POLYSTRIKE 3D FPS Arena
 *
 * Covers:
 * 1. Room Creation, Matchmaking, Sanitization, Capacity, Map Switching & Bot Sync
 * 2. WebSocket / Socket.IO Live Event Flow, Sequence Ordering, Quantization & Lag Comp
 * 3. Player & Bot State Fields, 3D Humanoid Rig, Hitbox Proxies & Game3D Remote Visibility/Lifecycle Sync
 * 4. Weapon Shooting (all 11 weapons), Client-to-Server 3D Raycast Hit Detection, Bot Damage/Kill/Respawn,
 *    Spawn Protection, Kill Adrenaline, Dropped Weapons, Frag Grenades, Bot AI & 20-Kill Win Condition
 * 5. Health Pack Pickups (Move-Triggered, Elevation/Radius Bounds, Bot Seeking, Healing Cap, 15s Cooldown & Client 3D Sync)
 * 6. Map/Terrain Collision, AABB Raycasting, Entity Physics, Anti-Z-Fighting/Flickering Invariants & Game3D PointerLock/ADS
 * 7. UI / DOM Elements, Decluttered Text & CSS Invariants, Tactical Minimap Projection & 3D Spatial Audio
 */

import { register } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import http from 'node:http';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { WebSocket } from 'ws';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

// Register custom ESM resolve & load hooks so browser modules in `public/js/` that import
// `../vendor/three/three.module.js`, `../shared/*`, or `../server/*` resolve cleanly in Node,
// and `THREE.WebGLRenderer` uses a deterministic headless implementation.
const rootUrl = pathToFileURL(ROOT_DIR + '/').href;
const loaderCode = `
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

export async function resolve(specifier, context, nextResolve) {
  if (specifier === '../vendor/three/three.module.js' || specifier === './vendor/three/three.module.js') {
    return nextResolve(new URL('node_modules/three/build/three.module.js', ${JSON.stringify(rootUrl)}).href, context);
  }
  if (context.parentURL && context.parentURL.includes('/public/js/')) {
    if (specifier.startsWith('../shared/')) {
      const rel = specifier.slice('../'.length);
      return nextResolve(new URL(rel, ${JSON.stringify(rootUrl)}).href, context);
    }
    if (specifier.startsWith('../server/')) {
      const rel = specifier.slice('../'.length);
      return nextResolve(new URL(rel, ${JSON.stringify(rootUrl)}).href, context);
    }
  }
  return nextResolve(specifier, context);
}

export async function load(url, context, nextLoad) {
  if (url.endsWith('node_modules/three/build/three.module.js')) {
    const filePath = fileURLToPath(url);
    const src = fs.readFileSync(filePath, 'utf8');
    const patched = src.replace(
      'WebGLRenderer,',
      '_HeadlessWebGLRenderer as WebGLRenderer,'
    ) + '\\nconst _HeadlessWebGLRenderer = globalThis.__HeadlessWebGLRenderer || WebGLRenderer;\\n';
    return {
      format: 'module',
      shortCircuit: true,
      source: patched,
    };
  }
  return nextLoad(url, context);
}
`;
register(`data:text/javascript,${encodeURIComponent(loaderCode)}`);

// Setup lightweight DOM / Window / Canvas / WebGLRenderer mocks for headless Node testing of 3D & UI modules
function createMockCanvasContext() {
  const noop = () => {};
  return {
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    font: '',
    textAlign: 'left',
    textBaseline: 'alphabetic',
    shadowColor: '',
    shadowBlur: 0,
    globalAlpha: 1,
    fillRect: noop,
    clearRect: noop,
    strokeRect: noop,
    beginPath: noop,
    closePath: noop,
    moveTo: noop,
    lineTo: noop,
    arc: noop,
    ellipse: noop,
    fill: noop,
    stroke: noop,
    save: noop,
    restore: noop,
    translate: noop,
    rotate: noop,
    scale: noop,
    drawImage: noop,
    fillText: noop,
    strokeText: noop,
    measureText: (text) => ({ width: String(text).length * 8 }),
    createLinearGradient: () => ({ addColorStop: noop }),
    createRadialGradient: () => ({ addColorStop: noop }),
    putImageData: noop,
    getImageData: () => ({ data: new Uint8ClampedArray(4) }),
  };
}

function createMockCanvas(width = 256, height = 256) {
  const ctx = createMockCanvasContext();
  const canvas = {
    width,
    height,
    style: {},
    getContext: () => ctx,
    toDataURL: () => 'data:image/png;base64,',
    addEventListener: () => {},
    removeEventListener: () => {},
    requestPointerLock: () => {
      if (globalThis.document) {
        globalThis.document.pointerLockElement = canvas;
        globalThis.document.dispatchEvent({ type: 'pointerlockchange' });
      }
    },
  };
  return canvas;
}

const windowListeners = new Map();
const documentListeners = new Map();
const mockDomElements = new Map();

globalThis.window = {
  innerWidth: 1280,
  innerHeight: 720,
  devicePixelRatio: 1,
  location: { search: '' },
  addEventListener(type, fn) {
    if (!windowListeners.has(type)) windowListeners.set(type, []);
    windowListeners.get(type).push(fn);
  },
  removeEventListener(type, fn) {
    const arr = windowListeners.get(type);
    if (!arr) return;
    const idx = arr.indexOf(fn);
    if (idx !== -1) arr.splice(idx, 1);
  },
  dispatchEvent(evt) {
    const arr = windowListeners.get(evt.type) || [];
    for (const fn of arr) fn(evt);
  },
};

globalThis.document = {
  pointerLockElement: null,
  activeElement: { tagName: 'BODY' },
  createElement(tag) {
    if (tag === 'canvas') return createMockCanvas();
    return {
      tagName: String(tag).toUpperCase(),
      textContent: '',
      style: {},
      children: [],
      appendChild(child) {
        this.children.push(child);
        return child;
      },
      setAttribute: () => {},
    };
  },
  getElementById(id) {
    if (!mockDomElements.has(id)) {
      if (id === 'minimap-canvas') {
        mockDomElements.set(id, createMockCanvas(184, 184));
      } else {
        mockDomElements.set(id, {
          id,
          textContent: '',
          style: {},
          children: [],
          appendChild(child) {
            this.children.push(child);
            return child;
          },
        });
      }
    }
    return mockDomElements.get(id);
  },
  addEventListener(type, fn) {
    if (!documentListeners.has(type)) documentListeners.set(type, []);
    documentListeners.get(type).push(fn);
  },
  dispatchEvent(evt) {
    const arr = documentListeners.get(evt.type) || [];
    for (const fn of arr) fn(evt);
  },
  exitPointerLock() {
    this.pointerLockElement = null;
    this.dispatchEvent({ type: 'pointerlockchange' });
  },
};

globalThis.requestAnimationFrame = () => 0;
globalThis.cancelAnimationFrame = () => {};

globalThis.__HeadlessWebGLRenderer = class HeadlessWebGLRenderer {
  constructor(params = {}) {
    this.params = params;
    this.domElement = createMockCanvas(1280, 720);
    this.shadowMap = {
      enabled: false,
      type: 0,
      autoUpdate: false,
      needsUpdate: false,
    };
    this.capabilities = {
      getMaxAnisotropy: () => 8,
    };
    this.toneMapping = 0;
    this.toneMappingExposure = 1.0;
    this.width = 1280;
    this.height = 720;
    this.pixelRatio = 1;
    this.renderCount = 0;
  }
  setSize(w, h) {
    this.width = w;
    this.height = h;
    this.domElement.width = w;
    this.domElement.height = h;
  }
  setPixelRatio(r) {
    this.pixelRatio = r;
  }
  render(scene, camera) {
    this.renderCount++;
    this.lastScene = scene;
    this.lastCamera = camera;
  }
  dispose() {
    this.disposed = true;
  }
};

// Import shared, server, and client modules
const THREE = await import('three');
const constants = await import('../shared/constants.js');
const lagCompMod = await import('../shared/lagCompensation.js');
const roomManagerMod = await import('../server/roomManager.js');
const botAIMod = await import('../server/botAI.js');

const arenaBuilderMod = await import('../public/js/arenaBuilder.js');
const humanoidRigMod = await import('../public/js/humanoidRig.js');
const weaponModelsMod = await import('../public/js/weaponModels.js');
const minimapMod = await import('../public/js/minimap.js');
const audioMod = await import('../public/js/audio.js');
const game3dMod = await import('../public/js/game3d.js');

const {
  MATCH_CONFIG,
  WEAPONS,
  PRIMARY_WEAPONS,
  SECONDARY_WEAPONS,
  MELEE_WEAPONS,
  DEFAULT_LOADOUT,
  WEAPON_ORDER,
  MAPS,
  MAP_ORDER,
  DEFAULT_MAP_ID,
  getMapConfig,
  computeDistanceFalloff,
  getEffectiveFireRateMs,
  isPointClearOfObstacles,
  rayIntersectsAABB,
  hasLineOfSight,
} = constants;

const {
  LAG_COMP_HISTORY_MS,
  LAG_COMP_MAX_REWIND_MS,
  KILL_ADRENALINE_HEAL,
  recordPlayerSnapshot,
  getRewoundPlayerPosition,
  resolveShotRewindMs,
  rewindRoomPlayersForShot,
  restoreRewoundPlayers,
  raycastPlayerHitbox,
} = lagCompMod;

const {
  RoomManager,
  sanitizeName,
  sanitizeRoomCode,
  sanitizeMapId,
  sanitizeLoadout,
  generateRoomCode,
} = roomManagerMod;

const { resolveEntityPhysics, createBotEntity, updateRoomBots } = botAIMod;
const { buildArena, buildSkyAndAtmosphere, createProceduralEnvironmentMap } = arenaBuilderMod;
const { createRemotePlayerMesh, animateHumanoidRig, createPlayerNameSprite, disposeObject3D } = humanoidRigMod;
const { createWeaponMesh, setWeaponAdsCulling } = weaponModelsMod;
const { TacticalMinimap } = minimapMod;
const { SoundEffects } = audioMod;
const { Game3D } = game3dMod;

// Helper to create a mock Socket.IO environment for deterministic RoomManager testing
function createMockIO() {
  const emitted = [];
  const roomEmitted = [];
  const io = {
    emitted,
    roomEmitted,
    to(roomId) {
      const target = {
        emit(event, payload) {
          roomEmitted.push({ roomId, event, payload });
        },
      };
      target.volatile = target;
      return target;
    },
    emit(event, payload) {
      emitted.push({ event, payload });
    },
  };
  return io;
}

function createTestRoomManager() {
  const io = createMockIO();
  const rm = new RoomManager(io);
  // Stop background interval during deterministic tests; we invoke rm.tick() explicitly
  if (rm.tickInterval) {
    clearInterval(rm.tickInterval);
    rm.tickInterval = null;
  }
  return { rm, io };
}

// Server-side teleport for test setup: playerMove is speed-limited, so tests that need a player at a
// specific spot place it directly (like a spawn would) and reset the movement budgets.
function placeServerSide(player, x, y, z) {
  player.x = x;
  player.y = y;
  player.z = z;
  player.moveBudgetXZ = undefined;
  player.moveBudgetUp = undefined;
  player.moveBudgetDown = undefined;
  player.lastPosAt = undefined;
  player.positionHistory = []; // teleport: lag-comp history must not keep the old spot
}

function createTestGame3D(callbacks = {}) {
  windowListeners.clear();
  documentListeners.clear();
  globalThis.document.pointerLockElement = null;
  const container = globalThis.document.createElement('div');
  const game = new Game3D(container, callbacks);
  return game;
}

// ============================================================================
// 1. ROOM CREATION, JOINING, SANITIZATION, CAPACITY & BOT/MAP MANAGEMENT
// ============================================================================
describe('1. Room Creation, Joining, Sanitization & Bot/Map Synchronization', () => {
  it('sanitizes player names, room codes, map IDs, and loadouts against invalid/XSS input', () => {
    assert.match(sanitizeName(''), /^Striker_\d{3}$/);
    assert.match(sanitizeName('   '), /^Striker_\d{3}$/);
    assert.equal(sanitizeName(null), 'Striker');
    assert.equal(sanitizeName(undefined), 'Striker');
    assert.equal(sanitizeName('<script>alert("xss")</script>'), 'scriptalert(xss)');
    assert.equal(sanitizeName('A'.repeat(40)).length, 16);
    assert.equal(sanitizeName('  Ghost_99  '), 'Ghost_99');

    assert.equal(sanitizeRoomCode('abc123'), 'ABC123');
    assert.equal(sanitizeRoomCode('  x9-!@#z  '), 'X9Z');
    assert.equal(sanitizeRoomCode('1234567890'), '123456');
    assert.equal(sanitizeRoomCode(null), '');

    assert.equal(sanitizeMapId('cargo_dock'), 'cargo_dock');
    assert.equal(sanitizeMapId('invalid_map'), DEFAULT_MAP_ID);
    assert.equal(sanitizeMapId(null), DEFAULT_MAP_ID);

    const loadout = sanitizeLoadout({ primary: 'sniper', secondary: 'deagle' });
    assert.deepEqual(loadout, { primary: 'sniper', secondary: 'deagle', melee: 'knife' });

    // Invalid slot assignments fallback to rifle / pistol
    const badLoadout = sanitizeLoadout({ primary: 'pistol', secondary: 'sniper' });
    assert.deepEqual(badLoadout, { primary: 'rifle', secondary: 'pistol', melee: 'knife' });

    const code = generateRoomCode(new Map());
    assert.match(code, /^[A-Z0-9]{6}$/);
  });

  it('creates private rooms with unique 6-character codes and allows joining by code', () => {
    const { rm } = createTestRoomManager();
    const createRes = rm.addHumanPlayer(
      { id: 'host_1' },
      { name: 'HostPlayer', mode: 'private', botCount: 3, mapId: 'cargo_dock', weapon: 'm4a1' }
    );

    assert.ok(!createRes.error);
    const { room, player: hostPlayer } = createRes;
    assert.equal(room.isPublic, false);
    assert.equal(room.mapId, 'cargo_dock');
    assert.equal(room.desiredBots, 3);
    assert.match(room.code, /^[A-Z0-9]{6}$/);
    assert.equal(hostPlayer.id, 'host_1');
    assert.equal(hostPlayer.weapon, 'm4a1');

    // Second player joins by lowercase/untrimmed code
    const joinRes = rm.addHumanPlayer(
      { id: 'guest_1' },
      { name: 'GuestPlayer', roomCode: ` ${room.code.toLowerCase()} `, mode: 'private' }
    );
    assert.ok(!joinRes.error);
    assert.equal(joinRes.room.code, room.code);
    assert.ok(room.players.has('guest_1'));
    assert.equal(rm.getHumanCount(room), 2);
  });

  it('enforces MATCH_CONFIG.MAX_PLAYERS capacity and dynamically trims bots as humans join', () => {
    const { rm } = createTestRoomManager();
    const { room } = rm.addHumanPlayer(
      { id: 'h1' },
      { name: 'Host', mode: 'private', botCount: MATCH_CONFIG.MAX_BOTS, mapId: DEFAULT_MAP_ID }
    );

    // 1 human + 8 bots = 9 total players initially
    assert.equal(room.players.size, 1 + MATCH_CONFIG.MAX_BOTS);

    // Join humans up to MATCH_CONFIG.MAX_PLAYERS (12 humans, 0 bots)
    for (let i = 2; i <= MATCH_CONFIG.MAX_PLAYERS; i++) {
      const res = rm.addHumanPlayer(
        { id: `h${i}` },
        { name: `Human${i}`, roomCode: room.code, mode: 'private' }
      );
      assert.ok(!res.error);
      assert.ok(
        room.players.size <= MATCH_CONFIG.MAX_PLAYERS,
        'Total players in room must never exceed MATCH_CONFIG.MAX_PLAYERS'
      );
    }

    assert.equal(rm.getHumanCount(room), MATCH_CONFIG.MAX_PLAYERS);
    const botsRemaining = Array.from(room.players.values()).filter((p) => p.isBot).length;
    assert.equal(botsRemaining, 0, 'All bots should be trimmed when room reaches max human capacity');

    // 13th human should be rejected with error
    const overflowRes = rm.addHumanPlayer(
      { id: 'h_overflow' },
      { name: 'OverflowHuman', roomCode: room.code, mode: 'private' }
    );
    assert.ok(overflowRes.error, 'Joining a full room must return an error');
  });

  it('auto-matchmakes public rooms by map and overflows into a new public room when full', () => {
    const { rm } = createTestRoomManager();
    const { room: room1 } = rm.addHumanPlayer(
      { id: 'pub_1' },
      { name: 'Pub1', mode: 'public', botCount: 2, mapId: 'neon_lab' }
    );
    assert.equal(room1.isPublic, true);
    assert.equal(room1.mapId, 'neon_lab');

    // Fill room1 with humans up to MATCH_CONFIG.MAX_PLAYERS
    for (let i = 2; i <= MATCH_CONFIG.MAX_PLAYERS; i++) {
      const { room } = rm.addHumanPlayer(
        { id: `pub_${i}` },
        { name: `Pub${i}`, mode: 'public', mapId: 'neon_lab' }
      );
      assert.equal(room.code, room1.code);
    }

    // Next public join on neon_lab must create a new public room
    const { room: room2 } = rm.addHumanPlayer(
      { id: 'pub_next' },
      { name: 'PubNext', mode: 'public', botCount: 4, mapId: 'neon_lab' }
    );
    assert.notEqual(room2.code, room1.code);
    assert.equal(room2.isPublic, true);
    assert.equal(room2.mapId, 'neon_lab');
  });

  it('handles bot count updates, map switching, and automatic empty room cleanup', () => {
    const { rm, io } = createTestRoomManager();
    const { room } = rm.addHumanPlayer(
      { id: 'p1' },
      { name: 'One', mode: 'private', botCount: 2, mapId: 'cyber_citadel' }
    );
    rm.addHumanPlayer({ id: 'p2' }, { name: 'Two', roomCode: room.code });

    // Update bot count to 0
    room.desiredBots = 0;
    rm.syncRoomBots(room);
    assert.equal(Array.from(room.players.values()).filter((p) => p.isBot).length, 0);

    // Update bot count to 6
    room.desiredBots = 6;
    rm.syncRoomBots(room);
    assert.equal(Array.from(room.players.values()).filter((p) => p.isBot).length, 6);

    // Switch map to desert_outpost
    rm.changeRoomMap(room, 'desert_outpost');
    assert.equal(room.mapId, 'desert_outpost');
    const mapEvt = io.roomEmitted.find((e) => e.event === 'mapChanged');
    assert.ok(mapEvt, 'Expected mapChanged broadcast');
    assert.equal(mapEvt.payload.mapId, 'desert_outpost');

    // Remove p1 -> room still has p2
    rm.removePlayer('p1');
    assert.ok(rm.rooms.has(room.code));

    // Remove last human p2 -> room is deleted automatically
    rm.removePlayer('p2');
    assert.equal(rm.rooms.has(room.code), false);
  });
});

// ============================================================================
// 2. WEBSOCKET / SOCKET.IO SYNC, SERIALIZATION, LAG COMP
// ============================================================================
describe('2. State Synchronization, Sequence Ordering, Quantization, Lag Comp & Live Server', () => {
  it('validates handlePlayerMove boundaries, posture flags, sequence rejection, and NaN/Infinity safety', () => {
    const { rm } = createTestRoomManager();
    const { room, player } = rm.addHumanPlayer(
      { id: 'mover' },
      { name: 'Mover', mode: 'private', botCount: 0, mapId: 'cyber_citadel' }
    );

    placeServerSide(player, 10, 2.5, -15);

    // Valid move with sequence 1
    rm.handlePlayerMove(room, player, {
      x: 10.1234,
      y: 2.5,
      z: -15.6789,
      vx: 3.2,
      vy: 0.5,
      vz: -1.1,
      yaw: 1.25,
      pitch: 0.45,
      crouching: true,
      prone: true, // prone overrides crouching to false
      isAiming: true,
      lean: 5, // clamps to 1
      weapon: 'pistol', // secondary slot is part of the default loadout
      seq: 1,
    });

    assert.equal(player.x, 10.1234);
    assert.equal(player.y, 2.5);
    assert.equal(player.z, -15.6789);
    assert.equal(player.crouching, false, 'Prone should force crouching to false');
    assert.equal(player.prone, true);
    assert.equal(player.isAiming, true);
    assert.equal(player.lean, 1);
    assert.equal(player.weapon, 'pistol');
    assert.equal(player.lastMoveSeq, 1);

    // Out-of-order / duplicate sequence packet (seq <= 1) must be ignored
    rm.handlePlayerMove(room, player, {
      x: -30,
      y: 0,
      z: -30,
      seq: 1,
    });
    assert.equal(player.x, 10.1234, 'Duplicate seq packet must be rejected');

    // Out-of-bounds coordinates and pitch must be clamped on seq 2
    const arenaLimit = getMapConfig('cyber_citadel').arenaHalfSize - 0.4;
    placeServerSide(player, arenaLimit - 0.5, 0, -(arenaLimit - 0.5));
    rm.handlePlayerMove(room, player, {
      x: arenaLimit + 3,
      y: -50,
      z: -(arenaLimit + 3),
      pitch: 10,
      crouching: true,
      prone: false,
      lean: -10,
      seq: 2,
    });
    assert.equal(player.x, arenaLimit);
    assert.equal(player.y, -2);
    assert.equal(player.z, -arenaLimit);
    assert.ok(Math.abs(player.pitch - Math.PI / 2) < 1e-6);
    assert.equal(player.crouching, true);
    assert.equal(player.prone, false);
    assert.equal(player.lean, -1);
    assert.equal(player.lastMoveSeq, 2);

    // Non-finite values (NaN, Infinity) must not corrupt player coordinates
    rm.handlePlayerMove(room, player, {
      x: NaN,
      y: Infinity,
      z: -Infinity,
      vx: NaN,
      yaw: NaN,
      pitch: NaN,
      seq: 3,
    });
    assert.ok(Number.isFinite(player.x));
    assert.ok(Number.isFinite(player.y));
    assert.ok(Number.isFinite(player.z));
    assert.ok(Number.isFinite(player.vx));
    assert.ok(Number.isFinite(player.yaw));
    assert.ok(Number.isFinite(player.pitch));
  });

  it('serializes players and grenades with compact quantization and broadcasts full stateUpdate on tick', () => {
    const { rm, io } = createTestRoomManager();
    const { room, player } = rm.addHumanPlayer(
      { id: 'ser_1' },
      { name: 'SerialTester', mode: 'private', botCount: 1, mapId: 'cyber_citadel' }
    );
    player.lastMoveAt = Date.now();
    player.x = 12.34567;
    player.z = -8.99123;
    player.vx = 4.567;

    const serialized = rm.serializePlayers(room);
    assert.equal(serialized.length, 2); // 1 human + 1 bot

    const sp = serialized.find((p) => p.id === 'ser_1');
    assert.ok(sp);
    assert.equal(sp.x, 12.35);
    assert.equal(sp.z, -8.99);
    assert.equal(sp.vx, 4.6);

    const requiredFields = [
      'id', 'name', 'isBot', 'color', 'x', 'y', 'z', 'vx', 'vy', 'vz',
      'yaw', 'pitch', 'crouching', 'prone', 'lean', 'weapon', 'ammo',
      'reserveAmmo', 'grenades', 'hp', 'alive', 'invulnerable',
      'invulnerableUntil', 'kills', 'deaths', 'streak',
    ];
    for (const field of requiredFields) {
      assert.ok(field in sp, `Serialized player missing required field: ${field}`);
    }

    // Grenade quantization & non-finite safety
    room.grenades = [{
      id: 'g_1',
      ownerId: player.id,
      x: 3.14159,
      y: NaN,
      z: -0.0001,
      vx: Infinity,
      vy: -4.556,
      vz: 1.234,
      fuseRemaining: 1.876,
      explodeAt: Date.now() + 2000,
    }];
    const sg = rm.serializeGrenades(room)[0];
    assert.equal(sg.x, 3.14);
    assert.equal(sg.y, 0);
    assert.ok(Object.is(sg.z, 0));
    assert.equal(sg.vx, 0);
    assert.equal(sg.vy, -4.56);
    assert.equal(sg.fuseRemaining, 1.88);

    // Tick emits stateUpdate with seq, timeRemaining, pickups, droppedWeapons, activeGrenades, and players
    rm.tick(0.04);
    const stateEvt = io.roomEmitted.find((e) => e.event === 'stateUpdate' && e.roomId === room.code);
    assert.ok(stateEvt, 'Expected stateUpdate broadcast on rm.tick()');
    assert.equal(typeof stateEvt.payload.seq, 'number');
    assert.equal(typeof stateEvt.payload.timeRemaining, 'number');
    assert.ok(Array.isArray(stateEvt.payload.pickups), 'stateUpdate must include pickups array');
    assert.ok(Array.isArray(stateEvt.payload.droppedWeapons), 'stateUpdate must include droppedWeapons array');
    assert.ok(Array.isArray(stateEvt.payload.activeGrenades), 'stateUpdate must include activeGrenades array');
    assert.ok(Array.isArray(stateEvt.payload.players), 'stateUpdate must include players array');
  });

  it('rewinds and restores player hitboxes accurately with lagCompensation helpers', () => {
    const { rm } = createTestRoomManager();
    const { room, player: p1 } = rm.addHumanPlayer(
      { id: 'p1' },
      { name: 'Shooter', mode: 'private', botCount: 0 }
    );
    const { player: p2 } = rm.addHumanPlayer(
      { id: 'p2' },
      { name: 'Target', roomCode: room.code }
    );

    const baseNow = Date.now();
    p2.positionHistory = [];
    p2.x = 10; p2.y = 0; p2.z = -10; p2.crouching = true;
    recordPlayerSnapshot(p2, baseNow - 200);

    p2.x = 30; p2.y = 0; p2.z = -10; p2.crouching = false;
    recordPlayerSnapshot(p2, baseNow);

    // Midpoint interpolation at -100ms -> x should be 20
    const mid = getRewoundPlayerPosition(p2, baseNow - 100, baseNow);
    assert.ok(Math.abs(mid.x - 20) < 0.05);

    // resolveShotRewindMs ignores client-supplied rewind/ping/timestamp fields and uses the server-measured
    // shooter.rttMs: rewind = clamp(rttMs/2 + INTERP_DELAY_MS (100ms), 0, LAG_COMP_MAX_REWIND_MS (200ms))
    p1.rttMs = 0;
    assert.equal(resolveShotRewindMs(p1, { rewindMs: 900, pingMs: 900, shotTimestamp: baseNow - 100 }, baseNow), 100);
    p1.rttMs = 80;
    assert.equal(resolveShotRewindMs(p1, { rewindMs: 900, pingMs: 5, shotTimestamp: baseNow - 5000 }, baseNow), 140);
    p1.rttMs = 1000;
    assert.equal(resolveShotRewindMs(p1, {}, baseNow), LAG_COMP_MAX_REWIND_MS);

    // Rewind room players by 200ms and restore
    const saved = rewindRoomPlayersForShot(room, p1.id, 200, baseNow);
    assert.ok(Math.abs(p2.x - 10) < 0.5);
    assert.equal(p2.crouching, true);

    restoreRewoundPlayers(saved);
    assert.equal(p2.x, 30);
    assert.equal(p2.crouching, false);
  });

  it('serves /healthz, /api/rooms, and handles real WebSocket Socket.IO event flow between clients', async () => {
    const express = (await import('express')).default;
    const { Server } = await import('socket.io');
    const app = express();
    const server = http.createServer(app);
    const io = new Server(server, {
      transports: ['websocket', 'polling'],
      perMessageDeflate: false,
      httpCompression: false,
    });
    const rm = new RoomManager(io);
    if (rm.tickInterval) {
      clearInterval(rm.tickInterval);
      rm.tickInterval = null;
    }

    app.get('/healthz', (_req, res) => {
      res.status(200).json({ status: 'ok', rooms: rm.rooms.size });
    });
    app.get('/api/rooms', (_req, res) => {
      res.status(200).json({ rooms: rm.getPublicRoomsSummary() });
    });

    // Wire real Socket.IO event handlers matching server/index.js
    io.on('connection', (socket) => {
      let currentRoomCode = null;
      socket.on('joinRoom', (payload = {}) => {
        if (currentRoomCode) {
          socket.leave(currentRoomCode);
          rm.removePlayer(socket.id);
          currentRoomCode = null;
        }
        const result = rm.addHumanPlayer(socket, payload);
        if (result.error) {
          socket.emit('joinError', { message: result.error });
          return;
        }
        const { room, player } = result;
        currentRoomCode = room.code;
        socket.join(room.code);
        const mapCfg = getMapConfig(room.mapId);
        socket.emit('roomJoined', {
          playerId: player.id,
          roomCode: room.code,
          isPublic: room.isPublic,
          mapId: room.mapId,
          mapName: mapCfg.name,
          botCount: room.desiredBots,
          player: { id: player.id, name: player.name, hp: player.hp, weapon: player.weapon },
          players: rm.serializePlayers(room),
          pickups: room.pickups,
        });
        socket.to(room.code).emit('playerJoined', { id: player.id, name: player.name });
      });

      socket.on('playerMove', (payload = {}) => {
        const room = rm.rooms.get(currentRoomCode);
        const player = room?.players.get(socket.id);
        if (room && player) rm.handlePlayerMove(room, player, payload);
      });

      socket.on('inputBatch', (payload = {}) => {
        const room = rm.rooms.get(currentRoomCode);
        const player = room?.players.get(socket.id);
        if (room && player) rm.handleInputBatch(room, player, payload);
      });

      socket.on('setBots', (payload = {}) => {
        const room = rm.rooms.get(currentRoomCode);
        if (!room) return;
        room.desiredBots = Math.max(0, Math.min(MATCH_CONFIG.MAX_BOTS, Math.floor(Number(payload?.botCount) || 0)));
        rm.syncRoomBots(room);
        io.to(room.code).emit('botsUpdated', {
          botCount: room.desiredBots,
          players: rm.serializePlayers(room),
        });
      });

      socket.on('changeMap', (payload = {}) => {
        const room = rm.rooms.get(currentRoomCode);
        if (room) rm.changeRoomMap(room, payload?.mapId);
      });

      socket.on('pingCheck', (clientSentAt, ack) => {
        if (typeof ack === 'function') ack(clientSentAt);
      });

      socket.on('disconnect', () => {
        if (currentRoomCode) rm.removePlayer(socket.id);
      });
    });

    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address();

    // Minimal Engine.IO v4 / Socket.IO v4 WebSocket client helper using `ws`
    function connectSocketIOClient() {
      return new Promise((resolve, reject) => {
        const ws = new WebSocket(`ws://127.0.0.1:${port}/socket.io/?EIO=4&transport=websocket`);
        const events = new Map();
        const acks = new Map();
        let connected = false;

        ws.on('message', (raw) => {
          const text = String(raw);
          if (text.startsWith('0{')) {
            // Engine.IO open -> send Socket.IO connect ('40')
            ws.send('40');
          } else if (text.startsWith('2')) {
            // Engine.IO ping -> pong
            ws.send('3');
          } else if (text.startsWith('40')) {
            connected = true;
            resolve({
              ws,
              emit(event, payload) {
                ws.send(`42${JSON.stringify([event, payload])}`);
              },
              emitWithAck(id, event, payload) {
                return new Promise((resAck) => {
                  acks.set(String(id), resAck);
                  ws.send(`42${id}${JSON.stringify([event, payload])}`);
                });
              },
              waitFor(event, timeoutMs = 2000) {
                if (events.has(event) && events.get(event).length > 0) {
                  return Promise.resolve(events.get(event).shift());
                }
                return new Promise((resEvt, rejEvt) => {
                  const timer = setTimeout(() => rejEvt(new Error(`Timeout waiting for ${event}`)), timeoutMs);
                  const check = (data) => {
                    clearTimeout(timer);
                    resEvt(data);
                  };
                  if (!events.has(`_wait_${event}`)) events.set(`_wait_${event}`, []);
                  events.get(`_wait_${event}`).push(check);
                });
              },
              close() {
                ws.close();
              },
            });
          } else if (text.startsWith('42')) {
            const arr = JSON.parse(text.slice(2));
            const [evtName, evtData] = arr;
            const waiters = events.get(`_wait_${evtName}`);
            if (waiters && waiters.length > 0) {
              waiters.shift()(evtData);
            } else {
              if (!events.has(evtName)) events.set(evtName, []);
              events.get(evtName).push(evtData);
            }
          } else if (text.startsWith('43')) {
            const match = text.match(/^43(\d+)\[(.*)\]$/s);
            if (match) {
              const [, ackId, body] = match;
              const cb = acks.get(ackId);
              if (cb) {
                acks.delete(ackId);
                cb(JSON.parse(`[${body}]`)[0]);
              }
            }
          }
        });
        ws.on('error', (err) => {
          if (!connected) reject(err);
        });
      });
    }

    let clientA = null;
    let clientB = null;
    try {
      const healthRes = await fetch(`http://127.0.0.1:${port}/healthz`);
      assert.equal(healthRes.status, 200);
      assert.equal((await healthRes.json()).status, 'ok');

      clientA = await connectSocketIOClient();
      clientB = await connectSocketIOClient();

      // Client A joins a public room with 2 bots on cyber_citadel
      clientA.emit('joinRoom', { name: 'AlphaWS', mode: 'public', botCount: 2, mapId: 'cyber_citadel', weapon: 'm4a1' });
      const joinedA = await clientA.waitFor('roomJoined');
      assert.equal(joinedA.mapId, 'cyber_citadel');
      assert.equal(joinedA.isPublic, true);
      assert.equal(joinedA.botCount, 2);

      // Verify /api/rooms reflects the live room
      const roomsRes = await fetch(`http://127.0.0.1:${port}/api/rooms`);
      const roomsJson = await roomsRes.json();
      assert.equal(roomsJson.rooms.length, 1);
      assert.equal(roomsJson.rooms[0].code, joinedA.roomCode);

      // Client B joins Client A's room by code -> Client A receives playerJoined
      const playerJoinedPromise = clientA.waitFor('playerJoined');
      clientB.emit('joinRoom', { name: 'BravoWS', roomCode: joinedA.roomCode, mode: 'private' });
      const joinedB = await clientB.waitFor('roomJoined');
      const playerJoinedNotice = await playerJoinedPromise;
      assert.equal(joinedB.roomCode, joinedA.roomCode);
      assert.equal(playerJoinedNotice.id, joinedB.playerId);
      assert.equal(playerJoinedNotice.name, 'BravoWS');

      // Test pingCheck acknowledgement over live WebSocket
      const ackTs = await clientA.emitWithAck(7, 'pingCheck', 987654);
      assert.equal(ackTs, 987654);

      // Position both players in clear sight and test live WebSocket inputBatch FIRE command -> shotFired & damageDealt
      const room = rm.rooms.get(joinedA.roomCode);
      const pA = room.players.get(joinedA.playerId);
      const pB = room.players.get(joinedB.playerId);
      pA.invulnerableUntil = 0;
      pB.invulnerableUntil = 0;
      placeServerSide(pA, 0, 0, -16);
      placeServerSide(pB, 0, 0, -22);
      rm.resetPlayerMovement(pA, Date.now());
      rm.resetPlayerMovement(pB, Date.now());
      pA.moveCredit = 1;
      recordPlayerSnapshot(pB, Date.now());

      const shotFiredPromise = clientB.waitFor('shotFired');
      const damagePromise = clientB.waitFor('damageDealt');
      clientA.emit('inputBatch', {
        e: pA.moveEpoch,
        cmds: [{ seq: 1, mf: 0, mr: 0, yaw: 0, pitch: 0, lean: 0, btn: 16 | 64, w: 'm4a1', ss: 1 }],
      });
      await new Promise((r) => setTimeout(r, 25));
      rm.processPlayerInputs(room, pA, Date.now());

      const shotEvt = await shotFiredPromise;
      const dmgEvt = await damagePromise;
      assert.equal(shotEvt.shooterId, joinedA.playerId);
      assert.equal(dmgEvt.targetId, joinedB.playerId);
      assert.equal(dmgEvt.isHeadshot, true);
      assert.ok(dmgEvt.damage > 50);

      // Test live stateUpdate broadcast over WebSocket
      // stateUpdate is sent as a Socket.IO *volatile* event, which is dropped whenever the socket is mid-write
      // (e.g. right after shotFired/damageDealt). Tick a few times so the test does not depend on that timing.
      const stateUpdatePromise = clientB.waitFor('stateUpdate');
      const tickRetry = setInterval(() => rm.tick(0.04), 40);
      let stateSnap;
      try {
        stateSnap = await stateUpdatePromise;
      } finally {
        clearInterval(tickRetry);
      }
      assert.ok(Array.isArray(stateSnap.players));
      assert.ok(Array.isArray(stateSnap.pickups));
    } finally {
      clientA?.close();
      clientB?.close();
      io.close();
      await new Promise((resolve) => server.close(resolve));
    }
  });
});

// ============================================================================
// 3. PLAYER & BOT 3D HUMANOID RIG, HITBOX PROXIES & VISIBILITY SYNCHRONIZATION
// ============================================================================
describe('3. Player & Bot 3D Humanoid Rig, Hitboxes & Visibility Synchronization', () => {
  it('constructs 3D remote player meshes with head/body/leg hitbox proxies, frustum safety, and grounded boots', () => {
    const scene = new THREE.Scene();
    const rp = createRemotePlayerMesh(
      { id: 'p_rig', name: 'RigTester', color: 0x38bdf8, weapon: 'rifle', x: 5, y: 0, z: -5 },
      { scene }
    );

    assert.ok(rp.group instanceof THREE.Group);
    assert.ok(rp.pelvisGroup instanceof THREE.Group);
    assert.ok(rp.headGroup instanceof THREE.Group);
    assert.equal(scene.children.includes(rp.group), true);
    assert.ok(Array.isArray(rp.hitboxParts) && rp.hitboxParts.length >= 7);

    const zones = new Set(rp.hitboxParts.map((h) => h.userData.zone));
    assert.ok(zones.has('head'), 'Humanoid rig must include head hitbox proxy');
    assert.ok(zones.has('body'), 'Humanoid rig must include body hitbox proxy');
    assert.ok(zones.has('leg'), 'Humanoid rig must include leg hitbox proxies');

    // Verify every hitbox proxy has precomputed boundingBox & boundingSphere for fast raycasting
    for (const proxy of rp.hitboxParts) {
      if (proxy.userData.isHitboxProxy) {
        assert.ok(proxy.geometry.boundingBox, 'Hitbox proxy must have precomputed boundingBox');
        assert.ok(proxy.geometry.boundingSphere, 'Hitbox proxy must have precomputed boundingSphere');
      }
    }

    // Verify standing pelvis height (y = 0.80) places combat boot soles flush on ground (y ≈ 0)
    assert.ok(Math.abs(rp.pelvisGroup.position.y - 0.80) < 0.02, 'Standing pelvis height must align boots with ground');

    // Animate walking, crouching, prone, and leaning postures
    rp.crouching = true;
    animateHumanoidRig(rp, 0.05, 1000, true, 5.0);
    const crouchHipY = rp.pelvisGroup.position.y;

    rp.crouching = false;
    rp.prone = true;
    rp.lean = 1;
    for (let i = 0; i < 15; i++) {
      animateHumanoidRig(rp, 0.05, 1050 + i * 50, true, 2.0);
    }
    assert.ok(rp.pelvisGroup.position.y < crouchHipY, 'Prone hip height must be lower than crouch hip height');

    // Nameplate sprite
    const label = createPlayerNameSprite('STRIKER');
    assert.ok(label.sprite instanceof THREE.Sprite);
    label.updateLabel(45);

    assert.doesNotThrow(() => disposeObject3D(rp.group));
  });

  it('synchronizes remote players and bots in Game3D: visibility toggling on death/respawn, hitbox registration, weapon swap, and disposal', () => {
    const game = createTestGame3D();
    game.localId = 'local_me';
    game.inMatch = true;

    const initialSnapshot = [
      {
        id: 'local_me',
        name: 'LocalHero',
        isBot: false,
        x: 0, y: 0, z: 0,
        yaw: 0, pitch: 0,
        weapon: 'rifle',
        hp: 100,
        alive: true,
        grenades: 1,
      },
      {
        id: 'remote_human',
        name: 'EnemyHuman',
        isBot: false,
        color: 0xef4444,
        x: 10, y: 0, z: -12,
        vx: 2, vy: 0, vz: -1,
        yaw: 1.1, pitch: 0.1,
        crouching: true,
        prone: false,
        lean: -1,
        weapon: 'smg',
        hp: 85,
        alive: true,
      },
      {
        id: 'bot_alpha',
        name: 'BOT_Alpha',
        isBot: true,
        color: 0xf97316,
        x: -14, y: 0, z: -20,
        vx: 0, vy: 0, vz: 3,
        yaw: -0.5, pitch: 0,
        crouching: false,
        prone: false,
        lean: 0,
        weapon: 'shotgun',
        hp: 100,
        alive: true,
      },
    ];

    game.syncPlayersState(initialSnapshot);

    // Local player is not added to remotePlayers
    assert.equal(game.remotePlayers.has('local_me'), false);
    assert.equal(game.remotePlayers.size, 2);

    const rpHuman = game.remotePlayers.get('remote_human');
    const rpBot = game.remotePlayers.get('bot_alpha');
    assert.ok(rpHuman && rpBot);
    assert.equal(rpHuman.isBot, false);
    assert.equal(rpBot.isBot, true);
    assert.equal(rpHuman.group.visible, true);
    assert.equal(rpBot.group.visible, true);
    assert.equal(game.scene.children.includes(rpHuman.group), true);
    assert.equal(game.scene.children.includes(rpBot.group), true);
    assert.equal(rpHuman.currentWeapon, 'smg');
    assert.equal(rpBot.currentWeapon, 'shotgun');

    // Both alive remote entities must have their hitbox proxies in game.hitboxMeshes
    const hitboxOwnerIds = new Set(game.hitboxMeshes.map((m) => m.userData.playerId));
    assert.equal(hitboxOwnerIds.has('remote_human'), true);
    assert.equal(hitboxOwnerIds.has('bot_alpha'), true);

    // Bot dies (`alive: false`) and human switches weapon to 'sniper'
    initialSnapshot[1].weapon = 'sniper';
    initialSnapshot[2].alive = false;
    initialSnapshot[2].hp = 0;
    game.syncPlayersState(initialSnapshot);

    assert.equal(rpHuman.currentWeapon, 'sniper', 'Remote player weapon mesh must update on weapon change');
    assert.equal(rpBot.alive, false);
    assert.equal(rpBot.group.visible, false, 'Dead bot 3D model must be hidden immediately');
    const hitboxOwnersAfterBotDeath = new Set(game.hitboxMeshes.map((m) => m.userData.playerId));
    assert.equal(
      hitboxOwnersAfterBotDeath.has('bot_alpha'),
      false,
      'Dead bot hitbox proxies must be removed from active raycast targets'
    );
    assert.equal(hitboxOwnersAfterBotDeath.has('remote_human'), true);

    // Bot respawns at new spawn point (`alive: true`, `hp: 100`)
    initialSnapshot[2].alive = true;
    initialSnapshot[2].hp = 100;
    initialSnapshot[2].x = 24;
    initialSnapshot[2].z = 18;
    game.syncPlayersState(initialSnapshot);

    assert.equal(rpBot.alive, true);
    assert.equal(rpBot.group.visible, true, 'Respawned bot 3D model must become visible again');
    assert.equal(rpBot.group.position.x, 24, 'Respawned bot position must snap to respawn point');
    assert.equal(rpBot.group.position.z, 18);
    const hitboxOwnersAfterRespawn = new Set(game.hitboxMeshes.map((m) => m.userData.playerId));
    assert.equal(hitboxOwnersAfterRespawn.has('bot_alpha'), true, 'Respawned bot hitboxes must be restored');

    // Remote human disconnects (omitted from snapshot) -> mesh disposed and removed from scene
    game.syncPlayersState([initialSnapshot[0], initialSnapshot[2]]);
    assert.equal(game.remotePlayers.has('remote_human'), false);
    assert.equal(game.scene.children.includes(rpHuman.group), false);
  });
});

// ============================================================================
// 4. WEAPON SHOOTING, HIT DETECTION, BOT AI, KILL/RESPAWN, GRENADES & WIN
// ============================================================================
describe('4. Weapon Shooting, Hit Detection, Bot AI, Kill/Respawn, Grenades & Match Win', () => {
  it('validates all 11 weapons across 3 slots, ADS fire rate slowdown, and distance falloff curves', () => {
    assert.equal(WEAPON_ORDER.length, 11);
    assert.equal(PRIMARY_WEAPONS.length, 7);
    assert.equal(SECONDARY_WEAPONS.length, 3);
    assert.equal(MELEE_WEAPONS.length, 1);

    for (const id of WEAPON_ORDER) {
      const w = WEAPONS[id];
      assert.ok(w, `Missing weapon definition for ${id}`);
      assert.ok(w.damage > 0);
      assert.ok(w.fireRateMs > 0);
      assert.ok(w.range > 0);
      assert.ok(w.pellets >= 1);
      if (!w.isMelee && w.opticType !== 'sniper') {
        assert.ok(getEffectiveFireRateMs(w, true) > getEffectiveFireRateMs(w, false));
      }
    }

    // Distance falloff check: SMG drops sharply at 36m while AR holds damage
    assert.equal(computeDistanceFalloff(WEAPONS.smg, 5), 1.0);
    assert.equal(computeDistanceFalloff(WEAPONS.smg, 100), WEAPONS.smg.minFalloffMult);
    assert.ok(computeDistanceFalloff(WEAPONS.rifle, 36) > computeDistanceFalloff(WEAPONS.smg, 36));
  });

  it('registers headshots, bodyshots, legshots, enforces fire rate & ammo, and blocks shots through walls', () => {
    const { rm } = createTestRoomManager();
    const { room, player: shooter } = rm.addHumanPlayer(
      { id: 'shooter' },
      { name: 'Shooter', mode: 'private', botCount: 0, mapId: 'cyber_citadel', weapon: 'm4a1' }
    );
    const { player: target } = rm.addHumanPlayer(
      { id: 'target' },
      { name: 'Target', roomCode: room.code }
    );

    shooter.invulnerableUntil = 0;
    target.invulnerableUntil = 0;

    // Place both in the unobstructed northern plaza (x = 0, z = -16 to z = -24, 8m apart)
    placeServerSide(shooter, 0, 0, -16);
    placeServerSide(target, 0, 0, -24);
    target.yaw = 0;
    recordPlayerSnapshot(target, Date.now());

    shooter.weapon = 'm4a1';
    shooter.ammo = 30;
    shooter.ammoByWeapon.m4a1 = 30;
    shooter.lastShotAt = 0;

    // Server eye is always (0, 1.62, -16); client `origin` / `isHeadshot` / `isLegshot` claims are ignored.
    const aimFromServerEye = (tx, ty, tz) => {
      const dx = tx - 0;
      const dy = ty - 1.62;
      const dz = tz - (-16);
      const len = Math.hypot(dx, dy, dz);
      return { x: dx / len, y: dy / len, z: dz / len };
    };

    // 1. Headshot test (aimed at head box y = 1.71; M4A1: 29 * 2.7 = 78 DMG even if client claims isHeadshot: false)
    target.hp = 100;
    rm.handleShoot(room, shooter, {
      weapon: 'm4a1',
      origin: { x: 99, y: 99, z: 99 }, // spoofed origin ignored
      dir: aimFromServerEye(0, 1.71, -24),
      targetId: target.id,
      isHeadshot: false,
    });
    assert.equal(target.hp, 100 - Math.round(WEAPONS.m4a1.damage * WEAPONS.m4a1.headshotMult));
    assert.equal(shooter.ammo, 29);

    // 2. Immediate rapid-fire before cooldown must be rejected
    const hpAfterFirstShot = target.hp;
    rm.handleShoot(room, shooter, {
      weapon: 'm4a1',
      dir: aimFromServerEye(0, 1.20, -24),
      targetId: target.id,
      isHeadshot: false,
    });
    assert.equal(target.hp, hpAfterFirstShot, 'Shot before fireRateMs cooldown must be ignored');

    // 3. Bodyshot test (aimed at torso box y = 1.20: 29 DMG even if client claims isHeadshot: true)
    shooter.lastShotAt = 0;
    target.hp = 100;
    rm.handleShoot(room, shooter, {
      weapon: 'm4a1',
      origin: { x: 0, y: 1.71, z: -16 }, // spoofed origin at head height must not turn a torso ray into a headshot
      dir: aimFromServerEye(0, 1.20, -24),
      targetId: target.id,
      isHeadshot: true,
      isLegshot: false,
    });
    assert.equal(target.hp, 100 - WEAPONS.m4a1.damage);

    // 4. Legshot test (aimed at left shin (-0.145, 0.40, -24): 0.78x multiplier even if client claims isHeadshot: true)
    shooter.lastShotAt = 0;
    target.hp = 100;
    rm.handleShoot(room, shooter, {
      weapon: 'm4a1',
      dir: aimFromServerEye(-0.145, 0.40, -24),
      targetId: target.id,
      isHeadshot: true,
      isLegshot: false,
    });
    assert.equal(target.hp, 100 - Math.round(WEAPONS.m4a1.damage * 0.78));

    // 5. Obstacle occlusion: place shooter and target on opposite sides of container at (-22, 1.6, -10)
    shooter.lastShotAt = 0;
    target.hp = 100;
    placeServerSide(shooter, -26, 0, -10);
    placeServerSide(target, -18, 0, -10);
    recordPlayerSnapshot(target, Date.now());
    rm.handleShoot(room, shooter, {
      weapon: 'sniper',
      dir: { x: 1, y: 0, z: 0 },
      targetId: target.id,
      isHeadshot: true,
    });
    assert.equal(target.hp, 100, 'Shot blocked by solid container obstacle must deal 0 damage');
  });

  it('damages, kills, drops weapon from, and respawns a Bot via client 3D raycast (Game3D.attemptShoot) -> Server RoomManager', () => {
    const { rm, io } = createTestRoomManager();
    const { room, player: human } = rm.addHumanPlayer(
      { id: 'human_1' },
      { name: 'BotHunter', mode: 'private', botCount: 1, mapId: 'cyber_citadel', weapon: 'm4a1' }
    );
    const bot = Array.from(room.players.values()).find((p) => p.isBot);
    assert.ok(bot, 'Room should contain a bot');

    human.invulnerableUntil = 0;
    bot.invulnerableUntil = 0;
    bot.weapon = 'scar';
    bot.loadout.primary = 'scar';
    bot.ammo = 20;
    bot.ammoByWeapon.scar = 20;

    // Position human at (0, 0, -16) looking North (-Z) at bot at (0, 0, -22) in open plaza
    const now0 = Date.now();
    placeServerSide(human, 0, 0, -16);
    human.yaw = 0;
    human.pitch = 0;
    rm.resetPlayerMovement(human, now0);
    placeServerSide(bot, 0, 0, -22);
    bot.yaw = Math.PI;
    recordPlayerSnapshot(bot, now0);

    const localShots = [];
    const game = createTestGame3D({
      onLocalShot: (shot) => localShots.push(shot),
    });
    game.localId = human.id;
    game.inMatch = true;
    game.alive = true;
    game.isPointerLocked = true;
    game.resetNetcode(human.moveEpoch);
    game.setSpreadSeed(human.spreadSeed);
    game.spawnLocalPlayer({
      x: human.x,
      y: human.y,
      z: human.z,
      yaw: 0,
      weapon: 'm4a1',
      spreadSeed: human.spreadSeed,
      loadout: { primary: 'm4a1', secondary: 'pistol', melee: 'knife' },
    });
    game.equipUntil = 0;

    // Sync players into Game3D so bot's 3D humanoid rig & hitbox proxies are built in the scene
    game.syncPlayersState(rm.serializePlayers(room));
    const rpBot = game.remotePlayers.get(bot.id);
    assert.ok(rpBot);
    rpBot.group.updateMatrixWorld(true);

    // Helper: advance fixed physics until the queued shot leaves in an input command, then deliver the batch to the server
    let simNow = now0;
    const stepAndFlushFire = (preSteps = 0) => {
      for (let i = 0; i < preSteps; i++) {
        game.advanceFixedPhysics(1 / 60);
      }
      game.lastShotAt = -1000;
      game.attemptShoot();
      for (let i = 0; i < 8 && game.pendingFire; i++) {
        game.advanceFixedPhysics(1 / 60);
      }
      const batch = game.prediction.buildBatch();
      assert.ok(batch, 'Game3D should build an inputBatch carrying the FIRE command');
      const fireCmd = [...batch.cmds].reverse().find((c) => (c.btn & 64) !== 0);
      assert.ok(fireCmd, 'inputBatch must contain a command with BTN.FIRE');
      simNow += 150;
      human.moveCredit = 1;
      recordPlayerSnapshot(bot, simNow);
      rm.handleInputBatch(room, human, batch, simNow);
      rm.processPlayerInputs(room, human, simNow);
      return fireCmd;
    };

    // 1. Aim at bot's head box (pitch = 0 from standing eye y = 1.62 hits head [1.47..1.95] at 6m) and fire M4A1
    game.onGround = true;
    game.isAiming = true;
    game.velocity.set(0, 0, 0);
    game.pitch = 0;
    game.yaw = 0;

    const fireCmd1 = stepAndFlushFire(0);
    assert.equal(localShots.length, 1, 'Game3D.attemptShoot should trigger local shot feedback');
    assert.equal(fireCmd1.ss, 1);
    assert.equal(bot.hp, 100 - Math.round(WEAPONS.m4a1.damage * WEAPONS.m4a1.headshotMult)); // 100 - 78 = 22 HP
    assert.equal(bot.alive, true);

    // 2. Aim at bot's torso center (y = 1.21 at 6m from eye y = 1.62 => pitch ≈ -0.068) to finish off the bot
    game.pitch = Math.atan2(1.21 - 1.62, 6);
    game.yaw = 0;
    human.hp = 80; // Injure human to verify +25 HP Kill Adrenaline on bot kill

    const fireCmd2 = stepAndFlushFire(10);
    assert.equal(localShots.length, 2);
    assert.equal(fireCmd2.ss, 2);
    assert.equal(bot.hp, 0, 'Second shot must reduce bot HP to 0');
    assert.equal(bot.alive, false, 'Bot must be marked dead at 0 HP');
    assert.equal(bot.deaths, 1, 'Bot death counter must increment');
    assert.equal(human.kills, 1, 'Human kill counter must increment on bot kill');
    assert.equal(human.hp, 100, 'Killing a bot must grant +25 HP Kill Adrenaline (capped at 100)');
    assert.ok(bot.respawnAt > Date.now(), 'Dead bot must have a scheduled respawnAt timestamp');

    // Bot must drop its primary weapon ('scar') at death location
    assert.equal(room.droppedWeapons.length, 1);
    assert.equal(room.droppedWeapons[0].weapon, 'scar');

    const killEvt = io.roomEmitted.find((e) => e.event === 'killEvent' && e.payload.victimId === bot.id);
    assert.ok(killEvt, 'Server must broadcast killEvent when bot is killed');

    // Sync dead bot state to Game3D -> bot 3D mesh becomes invisible & un-raycastable
    game.syncPlayersState(rm.serializePlayers(room));
    assert.equal(rpBot.group.visible, false);

    // Advance past bot's 3s respawn delay and run updateRoomBots -> bot respawns with full HP & spawn protection
    const respawnNow = bot.respawnAt + 20;
    updateRoomBots(room, 0.04, respawnNow, {
      onRespawnPlayer: (b) => rm.respawnPlayer(room, b),
      onBotShoot: () => {},
    });
    assert.equal(bot.alive, true, 'Bot must respawn after respawnAt delay');
    assert.equal(bot.hp, MATCH_CONFIG.MAX_HP, 'Respawned bot must have 100 HP');
    assert.ok(bot.invulnerableUntil > Date.now(), 'Respawned bot must receive spawn protection shield');
  });

  it('enforces 1.5s spawn protection shield and emits spawnProtectedHit', () => {
    const { rm, io } = createTestRoomManager();
    const { room, player: attacker } = rm.addHumanPlayer(
      { id: 's1' },
      { name: 'Attacker', mode: 'private', botCount: 0 }
    );
    const { player: defender } = rm.addHumanPlayer(
      { id: 's2' },
      { name: 'Defender', roomCode: room.code }
    );

    assert.ok(defender.invulnerableUntil > Date.now());
    attacker.invulnerableUntil = 0;
    attacker.x = 0; attacker.y = 0; attacker.z = -16;
    defender.x = 0; defender.y = 0; defender.z = -24;
    recordPlayerSnapshot(defender, Date.now());
    attacker.lastShotAt = 0;

    rm.handleShoot(room, attacker, {
      weapon: 'sniper',
      origin: { x: 0, y: 1.5, z: -16 },
      dir: { x: 0, y: 0, z: -1 },
      targetId: defender.id,
      isHeadshot: true,
    });

    assert.equal(defender.hp, 100, 'Spawn-protected defender must take 0 damage');
    const spHit = io.roomEmitted.find((e) => e.event === 'spawnProtectedHit' && e.payload.targetId === 's2');
    assert.ok(spHit, 'Expected spawnProtectedHit event when hitting protected player');
  });

  it('handles reload, Kill Adrenaline (+25 HP cap 100), dropped weapon [F] swap, and 3s respawn', () => {
    const { rm, io } = createTestRoomManager();
    const { room, player: killer } = rm.addHumanPlayer(
      { id: 'killer' },
      { name: 'Killer', mode: 'private', botCount: 0 }
    );
    const { player: victim } = rm.addHumanPlayer(
      { id: 'victim' },
      { name: 'Victim', roomCode: room.code, weapon: 'lmg', loadout: { primary: 'lmg', secondary: 'pistol', melee: 'knife' } }
    );

    killer.invulnerableUntil = 0;
    victim.invulnerableUntil = 0;

    // Test reload mechanics
    killer.weapon = 'sniper';
    killer.ammo = 1;
    killer.ammoByWeapon.sniper = 1;
    killer.reserveAmmo = 10;
    killer.reserveAmmoByWeapon.sniper = 10;
    rm.handleReload(room, killer, 'sniper');
    assert.ok(killer.reloadingUntil > Date.now());
    rm.syncPlayerReloadState(killer, killer.reloadingUntil + 10);
    assert.equal(killer.ammo, WEAPONS.sniper.magSize);
    assert.equal(killer.reserveAmmo, 10 - (WEAPONS.sniper.magSize - 1));

    // Damage killer to 85 HP to test +25 HP Kill Adrenaline cap at 100
    killer.hp = 85;
    killer.x = 0; killer.y = 0; killer.z = -16;
    victim.x = 0; victim.y = 0; victim.z = -22;
    victim.ammo = 55;
    victim.ammoByWeapon.lmg = 55;
    recordPlayerSnapshot(victim, Date.now());
    killer.lastShotAt = 0;

    rm.handleShoot(room, killer, {
      weapon: 'sniper',
      origin: { x: 0, y: 1.5, z: -16 },
      dir: { x: 0, y: 0, z: -1 },
      targetId: victim.id,
      isHeadshot: true,
    });

    assert.equal(victim.alive, false);
    assert.equal(victim.hp, 0);
    assert.equal(victim.deaths, 1);
    assert.equal(killer.kills, 1);
    assert.equal(killer.streak, 1);
    assert.equal(killer.hp, 100, 'Kill Adrenaline (+25 HP) should heal killer and cap at 100 HP');

    // Victim died with primary weapon 'lmg', so a dropped weapon spawns at victim's death location
    assert.equal(room.droppedWeapons.length, 1);
    assert.equal(room.droppedWeapons[0].weapon, 'lmg');
    assert.equal(room.droppedWeapons[0].ammo, 55);

    // Move killer within pickup radius and swap primary weapon with [F]
    killer.x = victim.x;
    killer.z = victim.z + 1.0;
    const swapEvt = rm.handlePickupWeapon(room, killer);
    assert.ok(swapEvt, 'Expected weapon swap to succeed');
    assert.equal(killer.weapon, 'lmg');
    assert.equal(killer.ammo, 55);

    // Advance victim respawn timer and run tick() -> victim respawns with full HP & spawn protection
    victim.respawnAt = Date.now() - 10;
    rm.tick(0.04);
    assert.equal(victim.alive, true);
    assert.equal(victim.hp, MATCH_CONFIG.MAX_HP);
    assert.ok(victim.invulnerableUntil > Date.now());
    const respawnEvt = io.roomEmitted.find((e) => e.event === 'playerRespawned' && e.payload.playerId === 'victim');
    assert.ok(respawnEvt, 'Expected playerRespawned event after 3s respawn delay');
  });

  it('simulates frag grenade physics, wall bouncing, fuse detonation, and LOS-checked AOE damage', () => {
    const { rm, io } = createTestRoomManager();
    const { room, player: grenadier } = rm.addHumanPlayer(
      { id: 'grenadier' },
      { name: 'Grenadier', mode: 'private', botCount: 0 }
    );
    const { player: target } = rm.addHumanPlayer(
      { id: 'blast_target' },
      { name: 'BlastTarget', roomCode: room.code }
    );

    grenadier.invulnerableUntil = 0;
    target.invulnerableUntil = 0;
    grenadier.x = 0; grenadier.y = 0; grenadier.z = -16;
    target.x = 0; target.y = 0; target.z = -24;

    assert.equal(grenadier.grenades, 1);
    const gren = rm.handleThrowGrenade(room, grenadier, {
      origin: { x: 0, y: 1.5, z: -16.5 },
      dir: { x: 0, y: 0.1, z: -1 },
    });
    assert.ok(gren);
    assert.equal(grenadier.grenades, 0);
    assert.equal(room.grenades.length, 1);

    // Position settled grenade 1m from target in open plaza and detonate
    gren.x = 0;
    gren.y = 0.2;
    gren.z = -23.0;
    gren.vx = 0;
    gren.vy = 0;
    gren.vz = 0;
    gren.explodeAt = Date.now() - 1;

    rm.updateGrenades(room, 0.04, Date.now());
    assert.equal(room.grenades.length, 0, 'Exploded grenade should be removed');
    assert.equal(target.hp, 100 - 95, 'Target within 2.2m inner blast radius should take 95 damage');
    const expEvt = io.roomEmitted.find((e) => e.event === 'grenadeExploded');
    assert.ok(expEvt, 'Expected grenadeExploded event');
  });

  it('runs bot AI targeting, movement, obstacle collision, shooting, and reloading', () => {
    const { rm } = createTestRoomManager();
    const { room, player: human } = rm.addHumanPlayer(
      { id: 'human_target' },
      { name: 'Human', mode: 'private', botCount: 1, mapId: 'cyber_citadel' }
    );
    const bot = Array.from(room.players.values()).find((p) => p.isBot);
    assert.ok(bot);

    human.invulnerableUntil = 0;
    bot.invulnerableUntil = 0;

    // Place bot and human in clear view of each other in the northern plaza
    bot.x = 0; bot.y = 0; bot.z = -16;
    human.x = 0; human.y = 0; human.z = -26;
    bot.weapon = 'rifle';
    bot.ammo = 30;
    bot.lastShotAt = 0;
    bot.nextDecisionAt = 0;

    let botFired = false;
    const now = Date.now();
    updateRoomBots(room, 0.05, now, {
      onRespawnPlayer: (b) => rm.respawnPlayer(room, b),
      onBotShoot: (b, payload, tickNow) => {
        botFired = true;
        rm.handleShoot(room, b, payload, tickNow);
      },
    });

    assert.equal(botFired, true, 'Bot should acquire target and fire when LOS is clear');

    // Verify bot auto-reloads when magazine hits 0 (move human out of LOS so bot doesn't immediately fire on reload completion)
    human.alive = false;
    bot.ammo = 0;
    bot.reserveAmmo = 60;
    bot.reloadingUntil = 0;
    updateRoomBots(room, 0.05, now + 1000, {
      onRespawnPlayer: () => {},
      onBotShoot: () => {},
    });
    assert.ok(bot.reloadingUntil > now + 1000, 'Bot should start reload timer when ammo is 0');
    updateRoomBots(room, 0.05, bot.reloadingUntil + 10, {
      onRespawnPlayer: () => {},
      onBotShoot: () => {},
    });
    assert.equal(bot.ammo, WEAPONS[bot.weapon].magSize, 'Bot should complete reload after reloadMs');
    assert.equal(bot.reserveAmmo, 60 - WEAPONS[bot.weapon].magSize, 'Bot reload must deduct from reserveAmmo');
  });

  it('handles combat edge cases: self-damage prevention, dead shooter rejection, shotgun shell reload interrupt, and expired drops', () => {
    const { rm } = createTestRoomManager();
    const { room, player: p1 } = rm.addHumanPlayer(
      { id: 'edge_1' },
      { name: 'Edge1', mode: 'private', botCount: 0 }
    );
    const { player: p2 } = rm.addHumanPlayer(
      { id: 'edge_2' },
      { name: 'Edge2', roomCode: room.code }
    );
    p1.invulnerableUntil = 0;
    p2.invulnerableUntil = 0;

    // 1. Self-damage claim must be ignored
    p1.hp = 100;
    p1.lastShotAt = 0;
    rm.handleShoot(room, p1, {
      weapon: 'sniper',
      origin: { x: p1.x, y: p1.y + 1.5, z: p1.z },
      dir: { x: 0, y: 0, z: -1 },
      targetId: p1.id,
      isHeadshot: true,
    });
    assert.equal(p1.hp, 100, 'Player must not be able to shoot themselves');

    // 2. Dead player cannot move, shoot, reload, throw grenade, or pick up weapons
    p1.alive = false;
    const oldX = p1.x;
    rm.handlePlayerMove(room, p1, { x: oldX + 10, seq: 99 });
    assert.equal(p1.x, oldX, 'Dead player move must be ignored');
    assert.equal(rm.handleThrowGrenade(room, p1, {}), null, 'Dead player grenade throw must return null');
    assert.equal(rm.handlePickupWeapon(room, p1, {}), null, 'Dead player weapon pickup must return null');

    // 3. Shotgun shell-by-shell reload & firing interruption
    p1.alive = true;
    p1.weapon = 'shotgun';
    p1.ammo = 2;
    p1.ammoByWeapon.shotgun = 2;
    p1.reserveAmmo = 12;
    p1.reserveAmmoByWeapon.shotgun = 12;
    rm.handleReload(room, p1, 'shotgun');
    assert.ok(p1.reloadingUntil > Date.now(), 'Shotgun should enter shell-by-shell reload');
    // Advance 1 shell interval
    rm.syncPlayerReloadState(p1, p1.nextShellAt + 5);
    assert.equal(p1.ammo, 3, 'Shotgun should insert 1 shell into tube');
    assert.equal(p1.reserveAmmo, 11, 'Shotgun shell insertion should deduct 1 shell from reserve');
    // Firing mid-reload with loaded shells interrupts reload and fires immediately
    p1.lastShotAt = 0;
    rm.handleShoot(room, p1, {
      weapon: 'shotgun',
      origin: { x: p1.x, y: 1.5, z: p1.z },
      dir: { x: 0, y: 0, z: -1 },
      hits: [],
    });
    assert.equal(p1.reloadingUntil, 0, 'Firing shotgun mid-reload must cancel remaining reload timer');
    assert.equal(p1.ammo, 2, 'Firing shotgun mid-reload must consume 1 loaded shell');

    // 4. Expired dropped weapon cannot be picked up and is pruned on updateDroppedWeapons
    const drop = rm.spawnDroppedWeapon(room, {
      weapon: 'scar',
      ammo: 20,
      reserveAmmo: 60,
      x: p1.x,
      y: p1.y,
      z: p1.z,
    });
    drop.expiresAt = Date.now() - 10;
    assert.equal(rm.handlePickupWeapon(room, p1), null, 'Expired dropped weapon must not be picked up');
    assert.equal(room.droppedWeapons.length, 0, 'Expired dropped weapon must be pruned');
  });

  it('triggers matchEnded when a player reaches KILL_LIMIT (20) and restarts match after intermission', () => {
    const { rm, io } = createTestRoomManager();
    const { room, player: champ } = rm.addHumanPlayer(
      { id: 'champ' },
      { name: 'Champ', mode: 'private', botCount: 0 }
    );
    const { player: fodder } = rm.addHumanPlayer(
      { id: 'fodder' },
      { name: 'Fodder', roomCode: room.code }
    );

    champ.invulnerableUntil = 0;
    fodder.invulnerableUntil = 0;
    champ.kills = MATCH_CONFIG.KILL_LIMIT - 1; // 19 kills
    champ.x = 0; champ.y = 0; champ.z = -16;
    fodder.x = 0; fodder.y = 0; fodder.z = -22;
    fodder.hp = 10;
    recordPlayerSnapshot(fodder, Date.now());
    champ.lastShotAt = 0;

    rm.handleShoot(room, champ, {
      weapon: 'sniper',
      origin: { x: 0, y: 1.5, z: -16 },
      dir: { x: 0, y: 0, z: -1 },
      targetId: fodder.id,
      isHeadshot: true,
    });

    assert.equal(champ.kills, MATCH_CONFIG.KILL_LIMIT);
    assert.equal(room.state, 'ENDED');
    const matchEndEvt = io.roomEmitted.find((e) => e.event === 'matchEnded');
    assert.ok(matchEndEvt, 'Expected matchEnded event at 20 kills');
    assert.equal(matchEndEvt.payload.winner.id, 'champ');

    // Advance past intermission and tick -> starts new match and resets kills
    room.nextMatchAt = Date.now() - 10;
    rm.tick(0.04);
    assert.equal(room.state, 'PLAYING');
    assert.equal(champ.kills, 0);
  });
});

// ============================================================================
// 5. HEALTH PACK PICKUP, HEALING CAP, BOT SEEKING & CLIENT 3D SYNC
// ============================================================================
describe('5. Health Pack Pickups, Healing Cap, Elevation Bounds, Bot Seeking & Cooldown Respawn', () => {
  it('heals damaged players via handlePlayerMove, enforces horizontal/vertical bounds, and respawns after 15s', () => {
    const { rm, io } = createTestRoomManager();
    const { room, player } = rm.addHumanPlayer(
      { id: 'medic' },
      { name: 'Medic', mode: 'private', botCount: 0, mapId: 'cyber_citadel' }
    );
    const pack = room.pickups[0];

    assert.ok(pack, 'Room should have health packs initialized');
    assert.equal(pack.active, true);

    // 1. Move player directly onto health pack at full HP (100) -> should NOT pick up
    placeServerSide(player, pack.x, pack.y || 0, pack.z);
    player.hp = 100;
    rm.handlePlayerMove(room, player, { x: pack.x, y: pack.y, z: pack.z, seq: 1 });
    assert.equal(pack.active, true, 'Full HP player must not consume health pack');

    // 2. Dead player on health pack -> should NOT pick up
    player.hp = 40;
    player.alive = false;
    rm.updateHealthPacks(room, 1000);
    assert.equal(pack.active, true, 'Dead player must not consume health pack');

    // 3. Alive damaged player outside horizontal radius (dist = 2.6m > 2.35m) -> should NOT pick up
    player.alive = true;
    player.hp = 50;
    rm.handlePlayerMove(room, player, { x: pack.x + 2.6, y: pack.y, z: pack.z, seq: 2 });
    assert.equal(pack.active, true, 'Player outside 2.35m pickup radius must not consume health pack');

    // 4. Alive damaged player high above pack (dy = 3.0m > 2.4m) -> should NOT pick up
    rm.handlePlayerMove(room, player, { x: pack.x, y: (pack.y || 0) + 3.0, z: pack.z, seq: 3 });
    assert.equal(pack.active, true, 'Player >2.4m vertically above health pack must not consume it');

    // 5. Alive damaged player walks within pickup radius (dist = 1.8m <= 2.35m) via handlePlayerMove -> heals +50 HP (capped at 100)
    player.hp = 65;
    rm.handlePlayerMove(room, player, { x: pack.x + 1.8, y: pack.y, z: pack.z, seq: 4 });
    assert.equal(player.hp, 100, 'Walking onto health pack via handlePlayerMove must heal player to 100 HP');
    assert.equal(pack.active, false, 'Consumed health pack must become inactive');

    const pickupOffEvt = io.roomEmitted.find(
      (e) => e.event === 'pickupState' && e.payload.pickupId === pack.id && e.payload.active === false
    );
    assert.ok(pickupOffEvt, 'Expected pickupState(active=false) event');
    assert.equal(pickupOffEvt.payload.pickerId, player.id);
    assert.equal(pickupOffEvt.payload.newHp, 100);

    // 6. Before 15s elapsed -> pack stays inactive
    const pickedRespawnAt = pack.respawnAt;
    rm.updateHealthPacks(room, pickedRespawnAt - 1);
    assert.equal(pack.active, false);

    // 7. At 15s elapsed -> pack respawns and broadcasts pickupState(active=true)
    rm.updateHealthPacks(room, pickedRespawnAt);
    assert.equal(pack.active, true);
    const pickupOnEvt = io.roomEmitted.find(
      (e) => e.event === 'pickupState' && e.payload.pickupId === pack.id && e.payload.active === true
    );
    assert.ok(pickupOnEvt, 'Expected pickupState(active=true) event on respawn');
  });

  it('allows injured bots (hp < 65) to seek and consume active health packs and syncs 3D pickup meshes in Game3D', () => {
    const { rm } = createTestRoomManager();
    const { room, player: human } = rm.addHumanPlayer(
      { id: 'h_obs' },
      { name: 'Observer', mode: 'private', botCount: 1, mapId: 'cyber_citadel' }
    );
    human.alive = false; // Hide human so bot focuses on navigation/healing
    const bot = Array.from(room.players.values()).find((p) => p.isBot);
    const pack = room.pickups[0];

    // Place injured bot (hp = 40) 1.2m away from active health pack
    bot.hp = 40;
    bot.x = pack.x + 1.2;
    bot.y = pack.y || 0;
    bot.z = pack.z;
    bot.targetId = null;

    // Step bot AI & room health pack check
    const now = Date.now();
    updateRoomBots(room, 0.1, now, {
      onRespawnPlayer: () => {},
      onBotShoot: () => {},
    });
    rm.updateHealthPacks(room, now);

    assert.equal(bot.hp, 90, 'Injured bot should consume nearby health pack and heal +50 HP (40 -> 90)');
    assert.equal(pack.active, false, 'Health pack consumed by bot should enter cooldown');

    // Verify client-side Game3D 3D pickup mesh creation and visibility toggling
    const game = createTestGame3D();
    game.syncPickups(room.pickups);
    assert.equal(game.pickupMeshes.size, room.pickups.length);

    const meshItem = game.pickupMeshes.get(pack.id);
    assert.ok(meshItem);
    assert.equal(meshItem.active, false);
    assert.equal(meshItem.crossGroup.visible, false, 'Inactive health pack 3D cross must be hidden');
    assert.equal(meshItem.holoRing.visible, false, 'Inactive health pack holo ring must be hidden');
    assert.ok(meshItem.padMat.emissiveIntensity <= 0.06, 'Inactive health pack pad emissive must dim');

    // Respawn health pack on client via updatePickupSingle(pack.id, true)
    game.updatePickupSingle(pack.id, true);
    assert.equal(meshItem.active, true);
    assert.equal(meshItem.crossGroup.visible, true, 'Respawned health pack 3D cross must be visible');
    assert.equal(meshItem.holoRing.visible, true, 'Respawned health pack holo ring must be visible');
    assert.ok(meshItem.padMat.emissiveIntensity >= 0.5, 'Respawned health pack pad emissive must brighten');
  });
});

// ============================================================================
// 6. TERRAIN / MAP COLLISION, AABB RAYCASTING & 3D RENDERING INVARIANTS
// ============================================================================
describe('6. Terrain/Map Collision, AABB Raycasting, Entity Physics & 3D Rendering Invariants', () => {
  it('validates all 4 map configurations, precomputed AABBs, spawn points, and health packs', () => {
    assert.deepEqual(MAP_ORDER, ['cyber_citadel', 'cargo_dock', 'desert_outpost', 'neon_lab']);

    for (const mapId of MAP_ORDER) {
      const cfg = getMapConfig(mapId);
      assert.equal(cfg.id, mapId);
      assert.ok(cfg.obstacles.length > 10, `Map ${mapId} should have obstacles`);
      assert.ok(cfg.spawnPoints.length >= 10, `Map ${mapId} should have at least 10 spawn points`);
      assert.ok(cfg.healthPacks.length >= 4, `Map ${mapId} should have health packs`);

      for (const obs of cfg.obstacles) {
        assert.ok(obs.minX < obs.maxX && obs.minY < obs.maxY && obs.minZ < obs.maxZ);
      }

      // Every spawn point should be clear of obstacles at spawn elevation
      for (const sp of cfg.spawnPoints) {
        const clear = isPointClearOfObstacles(sp.x, sp.z, 0.5, cfg.obstacles, sp.y || 0.1);
        assert.equal(clear, true, `Spawn point (${sp.x}, ${sp.z}) in ${mapId} overlaps an obstacle!`);
      }
    }
  });

  it('computes rayIntersectsAABB, hasLineOfSight, and bot resolveEntityPhysics (step-up & wall pushout)', () => {
    const box = { minX: -2, maxX: 2, minY: 0, maxY: 4, minZ: -2, maxZ: 2 };

    // Direct hit from z = 10 towards -Z (signature: origin, dir, maxDist, box)
    const dHit = rayIntersectsAABB({ x: 0, y: 2, z: 10 }, { x: 0, y: 0, z: -1 }, 100, box);
    assert.equal(dHit, 8);

    // Ray pointing away -> null
    const dAway = rayIntersectsAABB({ x: 0, y: 2, z: 10 }, { x: 0, y: 0, z: 1 }, 100, box);
    assert.equal(dAway, null);

    // Origin inside AABB -> 0
    const dInside = rayIntersectsAABB({ x: 0, y: 2, z: 0 }, { x: 1, y: 0, z: 0 }, 100, box);
    assert.equal(dInside, 0);

    // Line of sight blocked by obstacle vs clear above obstacle
    const customObs = [{ x: 0, y: 1.5, z: 0, w: 4, h: 3, d: 4 }];
    assert.equal(hasLineOfSight({ x: 0, y: 1, z: -10 }, { x: 0, y: 1, z: 10 }, customObs), false);
    assert.equal(hasLineOfSight({ x: 0, y: 5, z: -10 }, { x: 0, y: 5, z: 10 }, customObs), true);

    // Bot entity physics step-up onto a low step (height 0.4m <= 0.55m step height)
    const lowStepMap = {
      arenaHalfSize: 60,
      obstacles: [{ x: 0, y: 0.2, z: 0, w: 4, h: 0.4, d: 4 }],
    };
    const entity = { x: 0, y: 0, z: 0 };
    resolveEntityPhysics(entity, 0.45, lowStepMap);
    assert.equal(entity.y, 0.4, 'Entity should automatically step up onto a 0.4m ledge');
  });

  it('enforces anti-z-fighting polygonOffset, InstancedMesh frustumCulled=false, IBL envMap, and weapon ADS culling across all 4 maps', () => {
    const game = createTestGame3D();

    for (const mapId of MAP_ORDER) {
      game.loadMap(mapId);
      const mapCfg = getMapConfig(mapId);

      assert.equal(game.currentMapId, mapId);
      assert.ok(game.skyObjects.length > 0, `Sky objects should be created for ${mapId}`);
      assert.ok(
        game.scene.environment && game.scene.environment.mapping === THREE.EquirectangularReflectionMapping,
        `Procedural IBL environment map must be bound on scene for ${mapId}`
      );
      assert.equal(
        game.worldMeshes.length,
        1 + mapCfg.obstacles.length,
        `worldMeshes must equal 1 floor + ${mapCfg.obstacles.length} obstacles for ${mapId}`
      );

      // 1. Floor anti-z-fighting invariant: floor mesh must push depth back via polygonOffset (+1, +1)
      const floorMesh = game.worldMeshes[0];
      assert.equal(floorMesh.material.polygonOffset, true, `Floor material in ${mapId} must enable polygonOffset`);
      assert.equal(floorMesh.material.polygonOffsetFactor, 1);
      assert.equal(floorMesh.material.polygonOffsetUnits, 1);

      // 2. Structural trim materials must pull depth forward via polygonOffset (-1, -1) to prevent z-fighting on obstacle edges
      const negOffsetMats = Array.from(game.arenaMaterials).filter(
        (m) => m.polygonOffset === true && m.polygonOffsetFactor < 0
      );
      assert.ok(
        negOffsetMats.length >= 4,
        `Arena ${mapId} must configure negative polygonOffset on structural trim materials`
      );

      // 3. Every InstancedMesh batch in arenaDecorMeshes must disable frustumCulled and matrixAutoUpdate to prevent terrain/decor flickering
      const instancedDecor = game.arenaDecorMeshes.filter((m) => m.isInstancedMesh);
      assert.ok(instancedDecor.length > 0, `Map ${mapId} should batch decor into InstancedMesh objects`);
      for (const inst of instancedDecor) {
        assert.equal(
          inst.frustumCulled,
          false,
          `InstancedMesh in ${mapId} must set frustumCulled=false to prevent off-origin culling flicker`
        );
        assert.equal(inst.matrixAutoUpdate, false);
      }
    }

    // Build all 11 3D weapon models (third-person & first-person viewmodels) and verify ADS culling
    for (const weaponId of WEAPON_ORDER) {
      const tpGroup = createWeaponMesh(weaponId, false);
      assert.ok(tpGroup instanceof THREE.Group);

      const fpGroup = createWeaponMesh(weaponId, true);
      assert.ok(fpGroup instanceof THREE.Group);
      assert.ok(fpGroup.userData.flashMesh instanceof THREE.Object3D);

      setWeaponAdsCulling(fpGroup, true);
      if (fpGroup.userData.adsCulledMeshes) {
        assert.equal(fpGroup.userData.isAdsCulled, true);
      }
      setWeaponAdsCulling(fpGroup, false);
      if (fpGroup.userData.adsCulledMeshes) {
        assert.equal(fpGroup.userData.isAdsCulled, false);
      }
    }
  });

  it('resets ADS, sprinting, mouse state, and weapon ADS culling cleanly when PointerLock is lost mid-action', () => {
    let aimChangedState = null;
    let pointerLockState = null;
    const game = createTestGame3D({
      onAimChange: (isAiming) => {
        aimChangedState = isAiming;
      },
      onPointerLockChange: (locked) => {
        pointerLockState = locked;
      },
    });

    game.inMatch = true;
    game.alive = true;
    game.switchWeapon('rifle');
    game.equipUntil = 0;

    // Acquire PointerLock
    game.requestPointerLock();
    assert.equal(game.isPointerLocked, true);
    assert.equal(pointerLockState, true);

    // Enter ADS + hold mouse + cull weapon body
    game.isMouseDown = true;
    game.isRightMouseDown = true;
    game.adsToggleActive = true;
    game.isAiming = true;
    game.isSprinting = true;
    setWeaponAdsCulling(game.viewmodelMeshes.rifle, true);
    assert.equal(game.viewmodelMeshes.rifle.userData.isAdsCulled, true);

    // Lose PointerLock abruptly -> all active combat/movement latches must reset cleanly
    game.exitPointerLock();
    assert.equal(game.isPointerLocked, false);
    assert.equal(pointerLockState, false);
    assert.equal(game.isMouseDown, false);
    assert.equal(game.isRightMouseDown, false);
    assert.equal(game.adsToggleActive, false);
    assert.equal(game.isAiming, false);
    assert.equal(game.isSprinting, false);
    assert.equal(aimChangedState, false);
    assert.equal(game.viewmodelMeshes.rifle.userData.isAdsCulled, false);
  });

  it('Game3D fixed-timestep movement: frame-rate independent, matches the shared module exactly, interpolates the camera', async () => {
    const movement = await import('../shared/movement.js');
    const { FIXED_DT, createMovementState, stepPlayerMovement } = movement;
    const mapCfg = getMapConfig('cyber_citadel');

    const makeGame = () => {
      const events = { jump: 0, land: 0, slide: 0 };
      const game = createTestGame3D({
        onJump: () => { events.jump++; },
        onLand: () => { events.land++; },
        onSlide: () => { events.slide++; },
      });
      game.inMatch = true;
      game.alive = true;
      game.isPointerLocked = true;
      game.spawnLocalPlayer({ x: 0, y: 0, z: 30, yaw: 0, weapon: 'rifle' });
      game.onGround = true;
      game.simTimeMs = 0; // deterministic simulation clock for the test
      game.equipUntil = 0;
      return { game, events };
    };

    const runGame = (fps) => {
      const { game, events } = makeGame();
      const frames = 3 * fps;
      for (let f = 0; f < frames; f++) {
        const t = f / fps;
        game.keys.KeyW = true;
        game.keys.Space = t >= 1.0 - 1e-9 && t < 1.1 - 1e-9;
        game.keys.ControlLeft = t >= 2.0 - 1e-9;
        game.advanceFixedPhysics(1 / fps);
        // camera is interpolated inside the fixed-step window
        assert.ok(game.physAlpha >= 0 && game.physAlpha <= 1);
      }
      return { game, events };
    };

    const a = runGame(60);
    const b = runGame(144);
    const c = runGame(30);
    for (const other of [b, c]) {
      assert.ok(Math.abs(other.game.position.z - a.game.position.z) < 0.3, `z ${other.game.position.z} vs ${a.game.position.z}`);
      assert.ok(Math.abs(other.game.position.y - a.game.position.y) < 0.05);
    }
    assert.ok(a.game.position.z < 30 - 10, 'player moved forward');
    assert.equal(a.events.jump, 1, 'onJump fired once');
    assert.equal(a.events.land, 1, 'onLand fired once');
    assert.equal(a.events.slide, 1, 'onSlide fired once');

    // Parity: the same input script through the raw shared module (server-style usage) gives identical positions
    const { game: g60 } = makeGame();
    const raw = createMovementState({ x: g60.position.x, y: g60.position.y, z: g60.position.z, onGround: true, lastGroundedAt: g60.lastGroundedAt });
    let nowMs = 0;
    const frames = 180;
    for (let f = 0; f < frames; f++) {
      const t = f / 60;
      nowMs += FIXED_DT * 1000;
      stepPlayerMovement(raw, {
        moveForward: 1, moveRight: 0, yaw: 0,
        wantsCrouch: t >= 2.0 - 1e-9, wantsSprint: false,
        wantsJump: t >= 1.0 - 1e-9 && t < 1.1 - 1e-9,
        inputEnabled: true, isAiming: false, isAdsHeld: false,
        weaponMoveMult: WEAPONS.rifle.moveSpeedMult || 1
      }, FIXED_DT, mapCfg, nowMs);
    }
    assert.equal(a.game.position.x, raw.x);
    assert.equal(a.game.position.y, raw.y);
    assert.equal(a.game.position.z, raw.z);

    // Render interpolation: with half a step of leftover time the camera sits between the previous and current pose
    const { game } = makeGame();
    game.keys.KeyW = true;
    game.advanceFixedPhysics(FIXED_DT * 1.5);
    assert.ok(Math.abs(game.physAlpha - 0.5) < 1e-6, `alpha ${game.physAlpha}`);
    const zPrev = game.physPrev.z;
    const zNow = game.position.z;
    assert.ok(zNow < zPrev, 'one fixed step advanced the player');
    game.updateLocalPhysics(FIXED_DT * 1.5);
    const expectedEyeZ = zPrev + (zNow - zPrev) * 0.5;
    assert.ok(Math.abs(game.camera.position.z - expectedEyeZ) < 1e-6, `camera z ${game.camera.position.z} vs ${expectedEyeZ}`);

    // A frame hitch is clamped to 0.1s => at most 6 fixed steps
    const { game: hitch } = makeGame();
    hitch.keys.KeyW = true;
    const z0 = hitch.position.z;
    hitch.advanceFixedPhysics(5.0);
    const stepsRun = Math.round((hitch.simTimeMs - 0) / (FIXED_DT * 1000));
    assert.ok(stepsRun <= 6, `ran ${stepsRun} steps for a 5s hitch`);
    assert.ok(hitch.position.z <= z0);
  });
});

// ============================================================================
// 7. UI / DOM STRUCTURE, DECLUTTERED TEXT, TACTICAL MINIMAP & 3D SPATIAL AUDIO
// ============================================================================
describe('7. UI Elements, Decluttered Text, Tactical Minimap Rendering & 3D Spatial Audio', () => {
  it('verifies all required lobby, HUD, showcase, hotbar, modal IDs and decluttered UI text/CSS in public/', () => {
    const html = fs.readFileSync(path.join(ROOT_DIR, 'public/index.html'), 'utf8');
    const css = fs.readFileSync(path.join(ROOT_DIR, 'public/css/style.css'), 'utf8');

    const requiredIds = [
      'lobby-screen',
      'player-name',
      'lobby-weapon-grid',
      'lobby-map-grid',
      'lobby-bot-count',
      'operator-color-swatches',
      'btn-showcase-crouch',
      'btn-showcase-walk',
      'btn-showcase-fire',
      'btn-showcase-rotate',
      'btn-quick-play',
      'btn-create-private',
      'room-code-input',
      'btn-join-code',
      'hud-screen',
      'hud-minimap',
      'minimap-canvas',
      'minimap-coords',
      'minimap-map-label',
      'hud-hp-bar',
      'hud-hp-value',
      'spawn-shield-badge',
      'spawn-shield-timer',
      'hud-ammo-current',
      'hud-ammo-mag',
      'hud-weapon-name',
      'hud-weapon-hotbar',
      'hotbar-slot-1',
      'hotbar-slot-2',
      'hotbar-slot-3',
      'hud-grenade-slot',
      'hud-grenade-count',
      'weapon-pickup-prompt',
      'weapon-pickup-text',
      'weapon-pickup-timer',
      'hud-room-code',
      'hud-kills',
      'hud-deaths',
      'hud-streak',
      'kill-feed',
      'crosshair',
      'hitmarker',
      'hud-floating-dmg',
      'damage-overlay',
      'damage-dir-indicator',
      'hud-adrenaline-pop',
      'multikill-banner',
      'optic-scope',
      'sniper-scope',
      'death-overlay',
      'loadout-modal',
      'loadout-primary-grid',
      'loadout-secondary-grid',
      'btn-save-loadout',
      'pause-modal',
      'scoreboard-modal',
      'match-end-modal',
    ];

    for (const id of requiredIds) {
      assert.ok(
        html.includes(`id="${id}"`),
        `public/index.html is missing required UI element id="${id}"`
      );
    }

    // Verify cleaned-up Vietnamese modal headers & removal of old verbose English/Vietnamese bloat headers
    assert.ok(html.includes('KHO VŨ KHÍ'), 'Loadout modal should display concise KHO VŨ KHÍ header');
    assert.ok(html.includes('TẠM DỪNG'), 'Pause modal should display concise TẠM DỪNG header');
    assert.ok(html.includes('BẢNG XẾP HẠNG'), 'Scoreboard modal should display concise BẢNG XẾP HẠNG header');
    assert.ok(!html.includes('GUNSMITH ARMORY // 3-SLOT TACTICAL LOADOUT'), 'Old verbose loadout title must be removed');
    assert.ok(!html.includes('COMBAT TELEMETRY // BẢNG XẾP HẠNG TÁC CHIẾN'), 'Old verbose scoreboard title must be removed');

    // Verify CSS hides 2D HTML holo/red-dot overlay rings so 3D weapon optic reticle is unobstructed
    assert.match(css, /\.optic-holo-ring\s*\{\s*display:\s*none;/);
    assert.match(css, /\.optic-center-dot\s*\{\s*display:\s*none;/);
  });

  it('renders TacticalMinimap across all 4 maps and updates sector coordinates, map label, and 30 FPS throttle', () => {
    const minimap = new TacticalMinimap();
    for (const mapId of MAP_ORDER) {
      minimap.setMap(mapId);
      assert.equal(minimap.mapConfig.id, mapId);
      assert.equal(minimap.mapLabelEl.textContent, getMapConfig(mapId).name);
    }

    // Center of map (0, 0) projects to canvas midpoint (size / 2 = 92)
    assert.equal(minimap.worldToCanvasX(0), minimap.size / 2);
    assert.equal(minimap.worldToCanvasY(0), minimap.size / 2);

    const pickups = new Map([
      ['hp_1', { id: 'hp_1', x: -16, z: -16, active: true }],
    ]);
    const droppedWeapons = new Map([
      ['drop_1', { id: 'drop_1', x: 10, z: 12, weapon: 'rifle' }],
    ]);

    minimap.update(
      {
        inMatch: true,
        position: { x: 5.4, z: -8.2 },
        yaw: 0.75,
        pickups,
        droppedWeapons,
      },
      1000
    );

    assert.equal(minimap.lastRenderAt, 1000);
    assert.match(minimap.coordsEl.textContent, /^[A-F][1-6] \(5, -8\)$/);

    // Frame within 33ms (< 30 FPS interval) should be throttled (lastRenderAt remains 1000)
    minimap.update(
      {
        inMatch: true,
        position: { x: 25, z: 25 },
        yaw: 0,
        pickups,
        droppedWeapons,
      },
      1015
    );
    assert.equal(minimap.lastRenderAt, 1000, 'Minimap redraw within 33ms must be throttled');
  });

  it('computes 3D spatial audio distance attenuation, stereo panning, and muffled filtering', () => {
    const sfx = new SoundEffects();
    const listener = { x: 0, y: 0, z: 0, yaw: 0 }; // Facing -Z

    const left = sfx.computeSpatialParams(listener, { x: -10, y: 0, z: 0 }, 30);
    const right = sfx.computeSpatialParams(listener, { x: 10, y: 0, z: 0 }, 30);
    const behind = sfx.computeSpatialParams(listener, { x: 0, y: 0, z: 10 }, 30);
    const ahead = sfx.computeSpatialParams(listener, { x: 0, y: 0, z: -10 }, 30);
    const outOfRange = sfx.computeSpatialParams(listener, { x: 0, y: 0, z: -50 }, 30);

    assert.ok(left.pan < -0.5, 'Left source must pan left (< -0.5)');
    assert.ok(right.pan > 0.5, 'Right source must pan right (> 0.5)');
    assert.ok(behind.gain < ahead.gain, 'Source behind listener must have rear attenuation');
    assert.equal(outOfRange.outOfRange, true);
    assert.equal(outOfRange.gain, 0);

    // Ensure sound triggers safely no-op in headless Node without throwing
    assert.doesNotThrow(() => {
      sfx.playShot('rifle');
      sfx.playHeadshotDink(true);
      sfx.playGrenadeExplosion(listener, { x: 8, y: 0, z: -8 });
      sfx.playMultiKillTone(3);
      sfx.flushPendingCleanups(true);
    });
  });
});
