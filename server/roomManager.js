import { randomBytes } from 'node:crypto';
import {
  DEFAULT_MAP_ID,
  MAPS,
  MATCH_CONFIG,
  PLAYER_COLORS,
  WEAPONS,
  computeDistanceFalloff,
  getEffectiveFireRateMs,
  getMapConfig,
  hasLineOfSight,
  isPointClearOfObstacles,
  isPointInsideInflatedBoxes,
  rayIntersectsAABB,
  stepGrenade
} from '../shared/constants.js';
import {
  KILL_ADRENALINE_HEAL,
  raycastPlayerHitbox,
  recordPlayerSnapshot,
  recordRoomSnapshots,
  resolveShotRewindMs,
  restoreRewoundPlayers,
  rewindRoomPlayersForShot
} from '../shared/lagCompensation.js';
import { PART_PADDING } from '../shared/hitboxes.js';
import { FIXED_DT, createMovementState } from '../shared/movement.js';
import {
  BTN,
  MAX_SHOT_SEQ_GAP,
  commandTimeMs,
  createMoveAck,
  isFireIntervalOk,
  movementStateFromAck,
  sanitizeInputCommand,
  stepCommand
} from '../shared/netcode.js';
import { computeShotOrigin, createShotState, planShot, resetShotState } from '../shared/spread.js';

const TICK_INTERVAL_MS = 40; // 25Hz server simulation / state broadcast

// ---- Input-command netcode (client-side prediction + server reconciliation) ----
// A command always costs exactly FIXED_DT of simulated player time. The server only simulates as much player time as
// real time has passed (time-credit bucket), so neither a burst of commands nor a fast client clock can speed-hack.
export const INPUT_QUEUE_MAX = 64; // queued, not yet simulated commands per player
export const INPUT_BATCH_MAX_CMDS = 32; // commands read from one `inputBatch`
export const INPUT_CREDIT_CAP_S = 0.25; // largest real-time credit a player may bank (= max catch-up burst)
export const INPUT_GAP_WAIT_MS = 100; // wait this long for a missing seq (reordering / lost batch) before skipping it
export const INPUT_SEQ_AHEAD_MAX = 3600; // reject seqs further than this (1 minute) beyond the last processed one
export const STALE_EPOCH_ACK_INTERVAL_MS = 100; // throttle of the resync ack sent in reply to stale-epoch batches

function round1(val) {
  return Number.isFinite(val) ? (Math.round(val * 10) / 10) + 0 : 0;
}

function round2(val) {
  return Number.isFinite(val) ? (Math.round(val * 100) / 100) + 0 : 0;
}

export function sanitizeName(raw) {
  if (typeof raw !== 'string') return 'Striker';
  const cleaned = raw
    .replace(/[<>&"'`]/g, '')
    .trim()
    .slice(0, 16);
  return cleaned || `Striker_${ Math.floor(100 + Math.random() * 900) }`;
}

export function sanitizeRoomCode(raw) {
  if (typeof raw !== 'string') return '';
  return raw
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 6);
}

export function sanitizeMapId(raw) {
  if (typeof raw === 'string' && MAPS[raw]) {
    return raw;
  }
  return DEFAULT_MAP_ID;
}

export function createInitialAmmoMap() {
  const map = {};
  for (const [id, cfg] of Object.entries(WEAPONS)) {
    map[id] = cfg.magSize;
  }
  return map;
}

export function createInitialReserveAmmoMap() {
  const map = {};
  for (const [id, cfg] of Object.entries(WEAPONS)) {
    map[id] = cfg.infiniteAmmo ? 0 : (cfg.reserveAmmo ?? cfg.magSize * 3);
  }
  return map;
}

export function sanitizeLoadout(raw = {}, fallbackPrimary = 'rifle') {
  const reqPrimary = raw?.primary || fallbackPrimary;
  const reqSecondary = raw?.secondary || 'pistol';
  const primary = WEAPONS[reqPrimary]?.slot === 1 ? reqPrimary : 'rifle';
  const secondary = WEAPONS[reqSecondary]?.slot === 2 ? reqSecondary : 'pistol';
  return {
    primary,
    secondary,
    melee: 'knife'
  };
}

// ---- Server-side movement / shot validation limits (client is never trusted for these) ----
// Movement uses a "distance budget" that refills with server time, so neither one big teleport
// nor a flood of small packets can move a player faster than MOVE_MAX_SPEED on average.
export const MOVE_MAX_SPEED = (MATCH_CONFIG.SLIDE_INITIAL_SPEED || 11.2) * 1.25; // m/s horizontal
export const MOVE_BUDGET_CAP_XZ = MOVE_MAX_SPEED * 1.2 + 1.5;
export const MOVE_UP_SPEED = (MATCH_CONFIG.JUMP_FORCE || 8) * 1.5; // m/s upward (jump, step-up)
export const MOVE_DOWN_SPEED = 35; // m/s downward (terminal fall speed is clamped to 30)
export const MOVE_BUDGET_CAP_UP = MOVE_UP_SPEED * 0.6 + 1.0; // ~8 m: jump apex is ~1.5 m, so a big climb needs real time
export const MOVE_BUDGET_CAP_DOWN = MOVE_DOWN_SPEED * 1.2 + 1.5;
export const MOVE_CORRECTION_INTERVAL_MS = 250;

/** Reason codes of `player.lastShotReject = { ss, reason }` (a fire command the server did not simulate). */
export const SHOT_REJECT = Object.freeze({
  SEQ: 'seq', // `ss` not strictly increasing, or an implausible jump
  WEAPON: 'weapon', // command weapon is not the equipped / allowed one
  RATE: 'rate', // fired faster than the weapon allows (measured in command sim time)
  RELOAD: 'reload', // reloading
  AMMO: 'ammo', // empty magazine
  DEAD: 'dead', // shooter is dead
  STATE: 'state' // match not running
});

/** Interval (ms) of periodic owner-only `selfState` reconciliation (~8.3 Hz). */
export const SELF_STATE_INTERVAL_MS = 120;

function randomSpreadSeed() {
  return randomBytes(4).readUInt32BE(0);
}

const roundTo = (v, k) => Math.round(v * k) / k;

const mapCeilingCache = new WeakMap();

function getMapCeilingY(mapCfg) {
  if (!mapCfg) return 4;
  let ceiling = mapCeilingCache.get(mapCfg);
  if (ceiling === undefined) {
    let top = 0;
    for (const box of mapCfg.obstacles || []) {
      const t = box.maxY !== undefined ? box.maxY : box.y + box.h * 0.5;
      if (t > top) top = t;
    }
    ceiling = top + 2.0; // standing on the tallest surface + jump apex headroom
    mapCeilingCache.set(mapCfg, ceiling);
  }
  return ceiling;
}

function isFiniteVec(v) {
  return Boolean(v) && Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z);
}

function normalizeDir(v) {
  if (!isFiniteVec(v)) return null;
  const len = Math.hypot(v.x, v.y, v.z);
  if (!(len > 1e-6)) return null;
  return { x: v.x / len, y: v.y / len, z: v.z / len };
}

export function generateRoomCode(existingRooms) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  for (let attempt = 0; attempt < 50; attempt++) {
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += chars[Math.floor(Math.random() * chars.length)];
    }
    if (!existingRooms.has(code)) return code;
  }
  return `RM${ Date.now().toString(36).toUpperCase().slice(-4) }`;
}

export class RoomManager {
  constructor(io) {
    this.io = io;
    this.rooms = new Map();
    this.lastTickAt = Date.now();
    this.latencyProbes = new Map(); // socketId -> interval timer of the server-side RTT probe

    // 25Hz simulation and state broadcast loop: drift-corrected self-scheduling timer (see startTickLoop)
    this._tickTimer = null;
    this._tickStopped = true;
    this.startTickLoop();
  }

  /**
   * `tickInterval` is the handle of the pending tick timer. It is always a real (unref'd) Timeout, so
   * `clearInterval(rm.tickInterval)` / `clearTimeout(rm.tickInterval)` stop the loop (the next slot is only scheduled
   * from inside the timer callback), and assigning `null` stops it too. `rm.stop()` is the explicit API.
   */
  get tickInterval() {
    return this._tickTimer;
  }

  set tickInterval(timer) {
    if (timer === null || timer === undefined) {
      this.stopTickLoop();
      return;
    }
    this._tickTimer = timer;
  }

  /**
   * Starts the drift-corrected simulation loop. Instead of `setInterval` (which accumulates drift and bursts
   * catch-up ticks after a stall), every run targets the next absolute slot `slotAt0 + n * TICK_INTERVAL_MS`
   * measured with performance.now(); slots that were already missed during a long tick/GC pause are skipped.
   * The timer is unref'd so it never keeps the process alive.
   */
  startTickLoop() {
    this.stopTickLoop();
    this._tickStopped = false;
    this._nextTickSlotAt = performance.now() + TICK_INTERVAL_MS;
    this._scheduleNextTick();
    return this._tickTimer;
  }

  stopTickLoop() {
    this._tickStopped = true;
    if (this._tickTimer) {
      clearTimeout(this._tickTimer);
      this._tickTimer = null;
    }
  }

  stop() {
    this.stopTickLoop();
  }

  _scheduleNextTick() {
    if (this._tickStopped) return;
    const nowPerf = performance.now();
    const delay = Math.max(0, this._nextTickSlotAt - nowPerf);
    const timer = setTimeout(() => this._onTickSlot(), delay);
    if (typeof timer.unref === 'function') timer.unref();
    this._tickTimer = timer;
  }

  _onTickSlot() {
    this._tickTimer = null;
    if (this._tickStopped) return;
    try {
      this.tick();
    } finally {
      // Advance to the next absolute slot strictly in the future, skipping any slots missed while ticking
      const afterPerf = performance.now();
      let nextSlot = this._nextTickSlotAt + TICK_INTERVAL_MS;
      if (nextSlot <= afterPerf) {
        const missed = Math.floor((afterPerf - nextSlot) / TICK_INTERVAL_MS) + 1;
        nextSlot += missed * TICK_INTERVAL_MS;
      }
      this._nextTickSlotAt = nextSlot;
      this._scheduleNextTick();
    }
  }

  /**
   * Feeds one server-measured round-trip sample into `player.rttMs` (exponential moving average,
   * clamped to 0..MAX_RTT_MS). Client-reported ping/latency values are never used for lag compensation.
   */
  recordRtt(player, rttMs) {
    if (!player || typeof rttMs !== 'number' || !Number.isFinite(rttMs)) return null;
    const maxRtt = MATCH_CONFIG.MAX_RTT_MS || 1000;
    const sample = Math.max(0, Math.min(maxRtt, rttMs));
    const alpha = MATCH_CONFIG.LATENCY_EMA_ALPHA || 0.3;
    const prev = player.rttMs;
    player.rttMs = (typeof prev === 'number' && Number.isFinite(prev) && player.rttSamples > 0)
      ? Math.max(0, Math.min(maxRtt, prev + (sample - prev) * alpha))
      : sample;
    player.rttSamples = (player.rttSamples || 0) + 1;
    return player.rttMs;
  }

  /**
   * Starts (or restarts) the periodic server -> client latency probe for a human player.
   * Emits `latencyProbe(serverTime, ack)`; the client replies by calling the ack, and the RTT is measured
   * with the server's own monotonic clock. The timer is cleared by `stopLatencyProbe` / `removePlayer`.
   */
  startLatencyProbe(socket, player) {
    if (!socket || !player || typeof socket.emit !== 'function') return null;
    this.stopLatencyProbe(socket.id);

    const intervalMs = MATCH_CONFIG.LATENCY_PROBE_INTERVAL_MS || 2000;
    const sendProbe = () => {
      if (socket.disconnected) {
        this.stopLatencyProbe(socket.id);
        return;
      }
      const sentAt = performance.now();
      socket.emit('latencyProbe', Date.now(), () => {
        this.recordRtt(player, performance.now() - sentAt);
      });
    };

    const timer = setInterval(sendProbe, intervalMs);
    if (typeof timer.unref === 'function') timer.unref();
    this.latencyProbes.set(socket.id, timer);
    sendProbe();
    return timer;
  }

  stopLatencyProbe(socketId) {
    const timer = this.latencyProbes.get(socketId);
    if (timer) {
      clearInterval(timer);
      this.latencyProbes.delete(socketId);
    }
  }

  /**
   * Ends a player's spawn protection early (fired a shot / threw a grenade / dealt damage) and tells the room.
   */
  endSpawnProtection(room, player, now = Date.now()) {
    if (!player || !(player.invulnerableUntil > now)) return false;
    player.invulnerableUntil = 0;
    if (room?.code) {
      this.io.to(room.code).emit('spawnProtectionEnded', { playerId: player.id });
    }
    return true;
  }

  createPickupsForMap(mapId) {
    const mapCfg = getMapConfig(mapId);
    return mapCfg.healthPacks.map((p) => ({
      id: p.id,
      x: p.x,
      y: p.y,
      z: p.z,
      active: true,
      respawnAt: 0
    }));
  }

  createRoom(code, isPublic = true, mapId = DEFAULT_MAP_ID) {
    const roomCode = code || generateRoomCode(this.rooms);
    const cleanMapId = sanitizeMapId(mapId);
    const now = Date.now();

    const room = {
      code: roomCode,
      isPublic,
      mapId: cleanMapId,
      state: 'PLAYING', // 'PLAYING' | 'ENDED'
      matchStartedAt: now,
      matchEndsAt: now + MATCH_CONFIG.MATCH_DURATION_SEC * 1000,
      nextMatchAt: 0,
      players: new Map(),
      pickups: this.createPickupsForMap(cleanMapId),
      droppedWeapons: [],
      grenades: [],
      recentSpawns: [],
      hostId: null // first player in the room; only the host may change the map
    };

    this.rooms.set(roomCode, room);
    return room;
  }

  findOrCreatePublicRoom(preferredMapId = null) {
    const cleanMapId = preferredMapId ? sanitizeMapId(preferredMapId) : null;

    // First look for an open public room matching the requested map
    for (const room of this.rooms.values()) {
      if (!room.isPublic) continue;
      if (cleanMapId && room.mapId !== cleanMapId) continue;
      const humanCount = this.getHumanCount(room);
      if (humanCount < MATCH_CONFIG.MAX_PLAYERS) {
        return room;
      }
    }

    // Create a public room for this map
    const defaultCode = !this.rooms.has('PUB001') ? 'PUB001' : generateRoomCode(this.rooms);
    return this.createRoom(defaultCode, true, cleanMapId || DEFAULT_MAP_ID);
  }

  getOrCreateRoomByCode(rawCode, isPublic = false, mapId = DEFAULT_MAP_ID) {
    const code = sanitizeRoomCode(rawCode);
    if (code && this.rooms.has(code)) {
      return this.rooms.get(code);
    }
    return this.createRoom(code || generateRoomCode(this.rooms), isPublic, mapId);
  }

  getHumanCount(room) {
    return room.players.size;
  }

  pickSafeSpawnPoint(room, excludeId = null) {
    const now = Date.now();
    const mapCfg = getMapConfig(room?.mapId);
    const spawnPoints = mapCfg.spawnPoints || [];
    const obstacles = mapCfg.obstacles || [];
    const arenaHalf = (mapCfg.arenaHalfSize || MATCH_CONFIG.ARENA_HALF_SIZE) - 2.0;
    const minClearance = MATCH_CONFIG.SPAWN_MIN_CLEARANCE || 6.0;
    const densityRadius = MATCH_CONFIG.SPAWN_DENSITY_RADIUS || 36.0;
    const recentWindowMs = MATCH_CONFIG.SPAWN_RECENT_COOLDOWN_MS || 4500;

    if (!Array.isArray(room.recentSpawns)) {
      room.recentSpawns = [];
    }
    // Prune expired recent spawn records
    room.recentSpawns = room.recentSpawns.filter((s) => now - s.at < recentWindowMs);

    const aliveOthers = [];
    for (const other of room.players.values()) {
      if (other.id === excludeId || !other.alive) continue;
      aliveOthers.push(other);
    }

    const respawningPlayer = excludeId ? room.players.get(excludeId) : null;
    const lastDeathX = respawningPlayer?.lastDeathX;
    const lastDeathZ = respawningPlayer?.lastDeathZ;
    const hasDeathPos = Number.isFinite(lastDeathX) && Number.isFinite(lastDeathZ);

    // Evaluate each candidate spawn point:
    // 1) Never overlap other players or recently used spawn points (hard clearance check)
    // 2) Prioritize areas with the lowest player density (chỗ ít người nhất)
    // 3) Avoid enemy line of sight (LOS)
    // 4) Maximize minimum distance from nearest enemy within low-density zones
    const scoredCandidates = [];
    for (let i = 0; i < spawnPoints.length; i++) {
      const sp = spawnPoints[i];
      let minDist = Infinity;
      let closeCount = 0;   // Players within 18m (immediate danger zone)
      let zoneCount = 0;    // Players within densityRadius (36m local sector population)
      let crowdingLoad = 0; // Smooth kernel density score
      let losCount = 0;     // Enemies with direct unobstructed sightline
      let minLosDist = Infinity;

      const spEye = { x: sp.x, y: (sp.y || 0.1) + 1.5, z: sp.z };

      for (let j = 0; j < aliveOthers.length; j++) {
        const other = aliveOthers[j];
        const d = Math.hypot(other.x - sp.x, other.z - sp.z);
        if (d < minDist) minDist = d;
        if (d < 18.0) closeCount++;
        if (d < densityRadius) zoneCount++;
        if (d < 48.0) {
          const weight = 1 - d / 48.0;
          crowdingLoad += weight * weight;
        }
        if (d < 65.0) {
          const otherEye = { x: other.x, y: (other.y || 0) + 1.5, z: other.z };
          if (hasLineOfSight(spEye, otherEye, obstacles)) {
            losCount++;
            if (d < minLosDist) minLosDist = d;
          }
        }
      }

      let minRecentDist = Infinity;
      let recentUseCount = 0;
      for (let k = 0; k < room.recentSpawns.length; k++) {
        const rec = room.recentSpawns[k];
        const rd = Math.hypot(rec.x - sp.x, rec.z - sp.z);
        const baseRd = Math.hypot((rec.baseX ?? rec.x) - sp.x, (rec.baseZ ?? rec.z) - sp.z);
        const effDist = Math.min(rd, baseRd);
        if (effDist < minRecentDist) minRecentDist = effDist;
        if (effDist < minClearance) recentUseCount++;
      }

      const isOccupiedByPlayer = minDist < minClearance;
      const isRecentlyUsed = minRecentDist < 4.5;

      let score = 0;
      if (isOccupiedByPlayer) {
        // Strictly reject occupied spawn points when any free point exists
        score -= 100000 - Math.min(minDist, minClearance) * 500;
      } else if (isRecentlyUsed) {
        // Strongly penalize spawn points used within the last few seconds
        score -= 25000 - Math.min(minRecentDist, 4.5) * 300;
      }

      // Lowest player density priority (chỗ ít người nhất)
      score -= closeCount * 160;
      score -= zoneCount * 75;
      score -= crowdingLoad * 120;

      // Line-of-sight safety
      score -= losCount * 80;
      if (minLosDist < 32.0) {
        score -= (32.0 - minLosDist) * 2.5;
      }

      // Recent usage cooldown penalty
      score -= recentUseCount * 95;

      // Avoid respawning right where the player just died
      if (hasDeathPos) {
        const deathDist = Math.hypot(sp.x - lastDeathX, sp.z - lastDeathZ);
        if (deathDist < 15.0) {
          score -= (15.0 - deathDist) * 4.5;
        }
      }

      // Distance bonus from the nearest enemy (capped so density remains dominant)
      const effectiveMinDist = minDist === Infinity ? 60.0 : Math.min(minDist, 56.0);
      score += effectiveMinDist * 1.65;

      // Small tie-breaking variation for empty zones
      score += Math.random() * 2.2;

      scoredCandidates.push({ sp, score, minDist, minRecentDist, zoneCount, closeCount });
    }

    scoredCandidates.sort((a, b) => b.score - a.score);
    const bestCandidate = scoredCandidates[0] || {
      sp: { x: 0, y: 0.1, z: -50, yaw: Math.PI }
    };
    const baseSp = bestCandidate.sp;

    // Compute a safe final coordinate (with subtle jitter or non-overlap ring offset if crowded)
    let finalX = baseSp.x;
    let finalZ = baseSp.z;
    const footY = baseSp.y || 0.1;

    const isPositionSafeAndUnstacked = (cx, cz, minSep = 3.2) => {
      if (Math.abs(cx) > arenaHalf || Math.abs(cz) > arenaHalf) return false;
      if (!isPointClearOfObstacles(cx, cz, 0.85, obstacles, footY)) return false;
      for (let j = 0; j < aliveOthers.length; j++) {
        if (Math.hypot(aliveOthers[j].x - cx, aliveOthers[j].z - cz) < minSep) {
          return false;
        }
      }
      for (let k = 0; k < room.recentSpawns.length; k++) {
        const rec = room.recentSpawns[k];
        if (now - rec.at < 1500 && Math.hypot(rec.x - cx, rec.z - cz) < 2.4) {
          return false;
        }
      }
      return true;
    };

    // Apply small safe jitter if clear, or search ring offsets if base point is crowded
    const jitterAngle = Math.random() * Math.PI * 2;
    const jitterRadius = 0.35 + Math.random() * 0.55;
    const jitterX = round2(baseSp.x + Math.cos(jitterAngle) * jitterRadius);
    const jitterZ = round2(baseSp.z + Math.sin(jitterAngle) * jitterRadius);

    if (isPositionSafeAndUnstacked(jitterX, jitterZ, minClearance * 0.75)) {
      finalX = jitterX;
      finalZ = jitterZ;
    } else if (!isPositionSafeAndUnstacked(finalX, finalZ, 2.8)) {
      // Search radial rings around top candidates to guarantee zero overlap even in extreme crowding
      let foundSafe = false;
      const radii = [2.6, 4.2, 6.0, 8.0];
      for (let cIdx = 0; cIdx < Math.min(6, scoredCandidates.length) && !foundSafe; cIdx++) {
        const cand = scoredCandidates[cIdx].sp;
        for (let r = 0; r < radii.length && !foundSafe; r++) {
          const rad = radii[r];
          for (let step = 0; step < 8; step++) {
            const ang = (step * Math.PI) / 4 + (cIdx * 0.35);
            const tx = round2(cand.x + Math.cos(ang) * rad);
            const tz = round2(cand.z + Math.sin(ang) * rad);
            if (isPositionSafeAndUnstacked(tx, tz, 2.5)) {
              finalX = tx;
              finalZ = tz;
              foundSafe = true;
              break;
            }
          }
        }
      }
    }

    const chosen = {
      x: finalX,
      y: footY,
      z: finalZ,
      yaw: baseSp.yaw ?? Math.atan2(finalX, finalZ)
    };

    room.recentSpawns.push({
      x: chosen.x,
      z: chosen.z,
      baseX: baseSp.x,
      baseZ: baseSp.z,
      playerId: excludeId || null,
      at: now
    });
    if (room.recentSpawns.length > 32) {
      room.recentSpawns.shift();
    }

    return chosen;
  }

  addHumanPlayer(socket, { name, roomCode, mode, weapon, loadout, mapId }) {
    const cleanName = sanitizeName(name);
    const requestedCode = sanitizeRoomCode(roomCode);
    const cleanLoadout = sanitizeLoadout(loadout, weapon);
    const initialWeapon = WEAPONS[weapon] ? weapon : cleanLoadout.primary;
    const cleanMapId = sanitizeMapId(mapId);

    let room;
    if (requestedCode) {
      room = this.getOrCreateRoomByCode(requestedCode, mode === 'public', cleanMapId);
    } else if (mode === 'private') {
      room = this.createRoom(generateRoomCode(this.rooms), false, cleanMapId);
    } else {
      room = this.findOrCreatePublicRoom(cleanMapId);
    }

    // Check human capacity
    if (this.getHumanCount(room) >= MATCH_CONFIG.MAX_PLAYERS) {
      return { error: 'Phòng này đã đủ 12 người chơi thật! Vui lòng tạo phòng mới hoặc vào phòng chung.' };
    }

    // Update the map if this player is the first human in the room
    if (this.getHumanCount(room) === 0) {
      if (mapId && MAPS[mapId] && room.mapId !== mapId) {
        room.mapId = mapId;
        room.pickups = this.createPickupsForMap(mapId);
      }
    }

    const now = Date.now();
    const protectionMs = MATCH_CONFIG.SPAWN_PROTECTION_MS || 1500;
    const spawn = this.pickSafeSpawnPoint(room, socket.id);
    const colorIdx = room.players.size % PLAYER_COLORS.length;
    const weaponCfg = WEAPONS[initialWeapon];

    const player = {
      id: socket.id,
      name: cleanName,
      color: PLAYER_COLORS[colorIdx],
      x: spawn.x,
      y: spawn.y || 0,
      z: spawn.z,
      vx: 0,
      vy: 0,
      vz: 0,
      lastMoveAt: now,
      lastMoveSeq: 0,
      yaw: spawn.yaw || 0,
      pitch: 0,
      crouching: false,
      prone: false,
      isAiming: false,
      lean: 0,
      loadout: cleanLoadout,
      savedLoadoutPrimary: cleanLoadout.primary,
      weapon: initialWeapon,
      ammoByWeapon: createInitialAmmoMap(),
      reserveAmmoByWeapon: createInitialReserveAmmoMap(),
      ammo: weaponCfg.magSize,
      reserveAmmo: weaponCfg.infiniteAmmo ? 0 : (weaponCfg.reserveAmmo ?? weaponCfg.magSize * 3),
      grenades: 1,
      hp: MATCH_CONFIG.MAX_HP,
      alive: true,
      kills: 0,
      deaths: 0,
      streak: 0,
      lastShotAt: 0,
      lastGrenadeAt: 0,
      reloadingUntil: 0,
      reloadStartedAt: 0,
      reloadWeapon: null,
      nextShellAt: 0,
      respawnAt: 0,
      invulnerableUntil: now + protectionMs,
      lastDeathX: null,
      lastDeathZ: null,
      // Shots in the command stream (see processFireCommand): `ss` bookkeeping + the owner-only spread seed
      lastShotSeq: 0,
      lastFireCmdTimeMs: -Infinity,
      lastShotReject: null,
      spreadSeed: 0,
      shotState: createShotState(),
      _staticMeta: {
        id: socket.id,
        name: cleanName,
        color: PLAYER_COLORS[colorIdx]
      }
    };

    // Input-command netcode state (epoch 1 = the spawn); `moveEpoch` is sent to the client in `roomJoined`
    player.moveEpoch = 0;
    player.lastProcessedSeq = 0;
    this.resetPlayerMovement(player, now);
    this.resetShotSession(player);
    recordPlayerSnapshot(player, now);
    room.players.set(socket.id, player);
    this.ensureRoomHost(room);
    recordRoomSnapshots(room, now);

    return { room, player };
  }

  /**
   * Keeps `room.hostId` pointing at a live human (the earliest one still in the room).
   * Returns true when the host changed.
   */
  ensureRoomHost(room) {
    if (!room) return false;
    const current = room.hostId ? room.players.get(room.hostId) : null;
    if (current) return false;
    let next = null;
    for (const p of room.players.values()) {
      next = p.id;
      break;
    }
    const changed = next !== room.hostId;
    room.hostId = next;
    return changed && next !== null;
  }

  /**
   * Starts a fresh shooting session for a human (join, respawn, new match): a new random 32-bit `spreadSeed` and a clean
   * bloom / spray state. The seed is secret to its owner and is delivered ONLY to that socket (`roomJoined.player` and the
   * owner-only `selfSeed` event), never in a room broadcast. `lastShotSeq` is deliberately kept: the client's `ss` counter
   * keeps counting across lives (it is reset together with the player object on join).
   */
  resetShotSession(player) {
    if (!player) return null;
    player.spreadSeed = randomSpreadSeed();
    player.shotState = player.shotState ? resetShotState(player.shotState) : createShotState();
    player.lastFireCmdTimeMs = -Infinity;
    return player.spreadSeed;
  }

  isRoomHost(room, playerId) {
    return Boolean(room && playerId && room.hostId === playerId);
  }

  /** Host-only: switch the room's map (emits `mapChanged` itself). Returns { ok, error? }. */
  handleChangeMap(room, player, payload = {}) {
    if (!room || !player) return { ok: false, error: 'invalid' };
    if (!this.isRoomHost(room, player.id)) return { ok: false, error: 'not_host' };
    this.changeRoomMap(room, payload?.mapId);
    return { ok: true };
  }

  /**
   * A player may only use weapons from their server-side loadout (primary / secondary / melee).
   */
  isWeaponAllowed(player, weaponId) {
    if (!WEAPONS[weaponId]) return false;
    if (!player) return true;
    const lo = player.loadout;
    return weaponId === lo?.primary || weaponId === lo?.secondary || weaponId === (lo?.melee || 'knife');
  }

  handleUpdateLoadout(room, player, payload = {}) {
    if (!room || !player) return null;
    const nextLoadout = sanitizeLoadout(payload, player.loadout?.primary || 'rifle');

    // Changing loadout mid-life used to refill ammo and unlock any weapon for free. Now a live player
    // can only swap while dead or inside the spawn-protection window; otherwise it applies on respawn.
    const now = Date.now();
    const canApplyNow = !player.alive || (player.invulnerableUntil && now < player.invulnerableUntil);
    if (!canApplyNow) {
      player.pendingLoadout = nextLoadout;
      player.savedLoadoutPrimary = nextLoadout.primary;
      return { ...player.loadout, pending: nextLoadout };
    }

    player.pendingLoadout = null;
    player.loadout = nextLoadout;
    player.savedLoadoutPrimary = nextLoadout.primary;

    if (!player.ammoByWeapon) {
      player.ammoByWeapon = createInitialAmmoMap();
    } else {
      player.ammoByWeapon[nextLoadout.primary] = WEAPONS[nextLoadout.primary].magSize;
      player.ammoByWeapon[nextLoadout.secondary] = WEAPONS[nextLoadout.secondary].magSize;
      player.ammoByWeapon.knife = 1;
    }

    if (!player.reserveAmmoByWeapon) {
      player.reserveAmmoByWeapon = createInitialReserveAmmoMap();
    } else {
      player.reserveAmmoByWeapon[nextLoadout.primary] = WEAPONS[nextLoadout.primary].reserveAmmo ?? 90;
      player.reserveAmmoByWeapon[nextLoadout.secondary] = WEAPONS[nextLoadout.secondary].reserveAmmo ?? 36;
      player.reserveAmmoByWeapon.knife = 0;
    }

    if (!player.alive) {
      player.weapon = nextLoadout.primary;
      player.ammo = WEAPONS[nextLoadout.primary].magSize;
      player.reserveAmmo = WEAPONS[nextLoadout.primary].reserveAmmo ?? 90;
    } else {
      const curSlot = WEAPONS[player.weapon]?.slot || 1;
      if (curSlot === 1) {
        player.weapon = nextLoadout.primary;
      } else if (curSlot === 2) {
        player.weapon = nextLoadout.secondary;
      }
      player.reloadingUntil = 0;
      player.reloadWeapon = null;
      player.nextShellAt = 0;
      player.ammo = player.ammoByWeapon[player.weapon] ?? WEAPONS[player.weapon].magSize;
      player.reserveAmmo = player.reserveAmmoByWeapon[player.weapon] ?? (WEAPONS[player.weapon].reserveAmmo ?? 0);
    }

    return player.loadout;
  }

  changeRoomMap(room, rawMapId) {
    if (!room) return;
    const nextMapId = sanitizeMapId(rawMapId);
    if (room.mapId === nextMapId) return;

    room.mapId = nextMapId;
    room.pickups = this.createPickupsForMap(nextMapId);
    room.droppedWeapons = [];
    room.grenades = [];
    room.recentSpawns = [];

    // Mark all players not yet placed so sequential respawn assigns distinct safe points
    for (const p of room.players.values()) {
      p.alive = false;
    }

    // Respawn all players on the new map's spawn points
    const mapCfg = getMapConfig(nextMapId);
    for (const p of room.players.values()) {
      this.respawnPlayer(room, p);
    }

    this.io.to(room.code).emit('mapChanged', {
      mapId: room.mapId,
      mapName: mapCfg.name,
      pickups: room.pickups,
      droppedWeapons: room.droppedWeapons,
      activeGrenades: this.serializeGrenades(room),
      players: this.serializePlayers(room)
    });
  }

  removePlayer(socketId) {
    this.stopLatencyProbe(socketId);
    for (const [code, room] of this.rooms.entries()) {
      if (room.players.has(socketId)) {
        const leaving = room.players.get(socketId);
        room.players.delete(socketId);
        this.io.to(code).emit('playerLeft', {
          playerId: socketId,
          name: leaving?.name || 'Player'
        });

        if (this.getHumanCount(room) === 0) {
          this.rooms.delete(code);
        } else if (this.ensureRoomHost(room)) {
          const host = room.players.get(room.hostId);
          this.io.to(code).emit('hostChanged', { hostId: room.hostId, name: host?.name || 'Player' });
        }
        return;
      }
    }
  }

  syncPlayerReloadState(player, now = Date.now(), emitIfChanged = true) {
    if (!player || !player.reloadingUntil) return;

    const wId = player.reloadWeapon || player.weapon;
    const cfg = WEAPONS[wId] || WEAPONS.rifle;
    const prevAmmo = player.ammoByWeapon?.[wId] ?? player.ammo ?? 0;
    const prevReloading = player.reloadingUntil;

    if (cfg.shellByShell) {
      // Advance shell-by-shell insertion for shotgun, consuming from reserveAmmo
      const shellMs = cfg.shellReloadMs || 390;
      while (player.nextShellAt > 0 && now >= player.nextShellAt - 45) {
        const cur = player.ammoByWeapon?.[wId] ?? player.ammo ?? 0;
        const curRes = player.reserveAmmoByWeapon?.[wId] ?? (player.weapon === wId ? player.reserveAmmo : cfg.reserveAmmo) ?? 0;
        if (curRes <= 0 || cur >= cfg.magSize) {
          player.reloadingUntil = 0;
          player.reloadWeapon = null;
          player.nextShellAt = 0;
          break;
        }
        const nextAmmo = Math.min(cfg.magSize, cur + 1);
        const nextRes = Math.max(0, curRes - (nextAmmo - cur));
        if (player.ammoByWeapon) {
          player.ammoByWeapon[wId] = nextAmmo;
        }
        if (player.reserveAmmoByWeapon) {
          player.reserveAmmoByWeapon[wId] = nextRes;
        }
        if (player.weapon === wId) {
          player.ammo = nextAmmo;
          player.reserveAmmo = nextRes;
        }
        if (nextAmmo >= cfg.magSize || nextRes <= 0) {
          player.reloadingUntil = 0;
          player.reloadWeapon = null;
          player.nextShellAt = 0;
          break;
        }
        player.nextShellAt += shellMs;
      }

      if (player.reloadingUntil && now >= player.reloadingUntil) {
        player.reloadingUntil = 0;
        player.reloadWeapon = null;
        player.nextShellAt = 0;
      }
    } else {
      // Magazine reload completes when timer finishes (with 120ms network jitter tolerance), consuming from reserveAmmo
      if (now >= player.reloadingUntil - 120) {
        player.reloadingUntil = 0;
        player.reloadWeapon = null;
        const curAmmo = player.ammoByWeapon?.[wId] ?? player.ammo ?? 0;
        const curRes = player.reserveAmmoByWeapon?.[wId] ?? (player.weapon === wId ? player.reserveAmmo : cfg.reserveAmmo) ?? 0;
        const needed = Math.max(0, cfg.magSize - curAmmo);
        const added = Math.min(needed, Math.max(0, curRes));
        const nextAmmo = curAmmo + added;
        const nextRes = Math.max(0, curRes - added);
        if (player.ammoByWeapon) {
          player.ammoByWeapon[wId] = nextAmmo;
        }
        if (player.reserveAmmoByWeapon) {
          player.reserveAmmoByWeapon[wId] = nextRes;
        }
        if (player.weapon === wId) {
          player.ammo = nextAmmo;
          player.reserveAmmo = nextRes;
        }
      }
    }

    const postAmmo = player.ammoByWeapon?.[wId] ?? player.ammo ?? 0;
    if (emitIfChanged && (postAmmo !== prevAmmo || player.reloadingUntil !== prevReloading)) {
      this.sendSelfState(player, now, true);
    }
  }

  /**
   * LEGACY (internal compatibility API, no longer wired to any socket event): the client-authoritative position path
   * of the old `playerMove` packet. Live movement now goes through input commands (`handleInputBatch` +
   * `processPlayerInputs`); this and `handlePlayerMove` are kept only because the unit tests drive them directly.
   *
   * Validates the position claimed by a move packet against per-player distance budgets that refill
   * with server time (horizontal MOVE_MAX_SPEED, upward MOVE_UP_SPEED, downward MOVE_DOWN_SPEED).
   * Accepted: position is applied (clamped to arena/map ceiling). Rejected: position is kept and the
   * client is told to snap back via `positionCorrection` (rate limited).
   * Returns true when the claimed position (if any) was accepted.
   */
  applyMovePosition(room, player, payload, mapCfg, now) {
    const hasX = typeof payload.x === 'number' && Number.isFinite(payload.x);
    const hasY = typeof payload.y === 'number' && Number.isFinite(payload.y);
    const hasZ = typeof payload.z === 'number' && Number.isFinite(payload.z);
    if (!hasX && !hasY && !hasZ) return true;

    const limit = (mapCfg.arenaHalfSize || MATCH_CONFIG.ARENA_HALF_SIZE) - 0.4;
    const ceiling = getMapCeilingY(mapCfg);
    const nx = hasX ? Math.max(-limit, Math.min(limit, payload.x)) : player.x;
    const ny = hasY ? Math.max(-2, Math.min(ceiling, payload.y)) : player.y;
    const nz = hasZ ? Math.max(-limit, Math.min(limit, payload.z)) : player.z;

    const elapsed = player.lastPosAt === undefined
      ? 0
      : Math.max(0, Math.min(1.5, (now - player.lastPosAt) / 1000));
    player.lastPosAt = now;
    player.moveBudgetXZ = Math.min(MOVE_BUDGET_CAP_XZ, (player.moveBudgetXZ ?? MOVE_BUDGET_CAP_XZ) + MOVE_MAX_SPEED * elapsed);
    player.moveBudgetUp = Math.min(MOVE_BUDGET_CAP_UP, (player.moveBudgetUp ?? MOVE_BUDGET_CAP_UP) + MOVE_UP_SPEED * elapsed);
    player.moveBudgetDown = Math.min(MOVE_BUDGET_CAP_DOWN, (player.moveBudgetDown ?? MOVE_BUDGET_CAP_DOWN) + MOVE_DOWN_SPEED * elapsed);

    const distXZ = Math.hypot(nx - player.x, nz - player.z);
    const dy = ny - player.y;
    const withinXZ = distXZ <= player.moveBudgetXZ;
    const withinY = dy >= 0 ? dy <= player.moveBudgetUp : -dy <= player.moveBudgetDown;

    if (withinXZ && withinY) {
      player.moveBudgetXZ -= distXZ;
      if (dy >= 0) player.moveBudgetUp -= dy;
      else player.moveBudgetDown += dy;
      player.x = nx;
      player.y = ny;
      player.z = nz;
      return true;
    }

    if (now - (player.lastCorrectionAt || 0) >= MOVE_CORRECTION_INTERVAL_MS) {
      player.lastCorrectionAt = now;
      this.io.to(room.code).emit('positionCorrection', {
        playerId: player.id,
        x: round2(player.x),
        y: round2(player.y),
        z: round2(player.z)
      });
    }
    return false;
  }

  /**
   * LEGACY (internal compatibility API): applies a client-claimed position packet. server/index.js no longer has a
   * `playerMove` socket handler, so nothing in production calls this; it only exists for the unit tests that exercise
   * the distance-budget validation directly. Real clients send `inputBatch` commands (see `handleInputBatch`).
   */
  handlePlayerMove(room, player, payload) {
    if (!room || !player || !player.alive || room.state !== 'PLAYING' || !payload) return;

    if (typeof payload.seq === 'number') {
      if (player.lastMoveSeq && payload.seq <= player.lastMoveSeq && (player.lastMoveSeq - payload.seq) < 1000) {
        return; // Drop out-of-order movement packet
      }
      player.lastMoveSeq = payload.seq;
    }

    const now = Date.now();
    player.lastMoveAt = now;
    this.syncPlayerReloadState(player, now);

    const mapCfg = getMapConfig(room.mapId);
    const positionAccepted = this.applyMovePosition(room, player, payload, mapCfg, now);
    const maxSpeed = (MATCH_CONFIG.SLIDE_INITIAL_SPEED || 11.2) * 1.35;
    if (positionAccepted && typeof payload.vx === 'number' && Number.isFinite(payload.vx)) {
      player.vx = Math.max(-maxSpeed, Math.min(maxSpeed, payload.vx));
    }
    if (positionAccepted && typeof payload.vy === 'number' && Number.isFinite(payload.vy)) {
      player.vy = Math.max(-30, Math.min(25, payload.vy));
    }
    if (positionAccepted && typeof payload.vz === 'number' && Number.isFinite(payload.vz)) {
      player.vz = Math.max(-maxSpeed, Math.min(maxSpeed, payload.vz));
    }
    if (typeof payload.yaw === 'number' && Number.isFinite(payload.yaw)) {
      player.yaw = payload.yaw;
    }
    if (typeof payload.pitch === 'number' && Number.isFinite(payload.pitch)) {
      player.pitch = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, payload.pitch));
    }
    if (typeof payload.crouching === 'boolean') {
      player.crouching = payload.crouching;
    }
    if (typeof payload.prone === 'boolean') {
      player.prone = payload.prone;
      if (player.prone) {
        player.crouching = false;
      }
    }
    if (typeof payload.isAiming === 'boolean') {
      player.isAiming = payload.isAiming;
    }
    if (typeof payload.lean === 'number' && Number.isFinite(payload.lean)) {
      player.lean = Math.max(-1, Math.min(1, payload.lean));
    }
    if (
      typeof payload.weapon === 'string' &&
      this.isWeaponAllowed(player, payload.weapon) &&
      payload.weapon !== player.weapon
    ) {
      this.switchPlayerWeapon(player, payload.weapon);
    }
    // Latency is measured by the server (see startLatencyProbe); client-reported pingMs is ignored.
    // History is stamped with the server clock: client clocks must never enter the lag-comp ring buffer.
    recordPlayerSnapshot(player, now);
    this.updateHealthPacks(room, now);
  }

  /** Equips an (already validated) weapon: cancels an incomplete reload without granting a free full magazine. */
  switchPlayerWeapon(player, weaponId) {
    player.weapon = weaponId;
    player.reloadingUntil = 0;
    player.reloadWeapon = null;
    player.nextShellAt = 0;
    player.ammo = player.ammoByWeapon?.[weaponId] ?? WEAPONS[weaponId].magSize;
    player.reserveAmmo = player.reserveAmmoByWeapon?.[weaponId] ?? (WEAPONS[weaponId].reserveAmmo ?? 0);
  }

  // ======================================================================================================
  // Input-command netcode: the server is authoritative for human movement. Clients send input commands (never
  // positions); the server simulates them with the shared movement module and acks the result to the owner.
  // ======================================================================================================

  /**
   * (Re)starts a human's movement timeline at their current `player.x/y/z` (spawn, respawn, map change, new match, or
   * any other server-side teleport): bumps `moveEpoch`, voids queued commands and rebuilds the authoritative
   * MovementState. The caller sends the resync ack (`sendMoveAck(player, true)`) when the owner's socket is ready.
   */
  resetPlayerMovement(player, now = Date.now()) {
    if (!player) return;
    player.moveEpoch = (player.moveEpoch || 0) + 1;
    player.lastProcessedSeq = player.lastProcessedSeq || 0;
    player.cmdQueue = [];
    player.cmdFresh = true; // first command of the new epoch defines the sequence start (the client skipped seqs)
    player.cmdGapSince = null;
    player.moveCredit = 0;
    player.lastCreditAt = now;
    // Round-trip through the ack encoding so the server and the client start from bit-identical states
    const raw = createMovementState({
      x: player.x, y: player.y, z: player.z, vx: 0, vy: 0, vz: 0, onGround: true
    });
    const ack = createMoveAck(raw, player.lastProcessedSeq, player.moveEpoch);
    player.moveState = movementStateFromAck(ack);
    player.x = ack.x;
    player.y = ack.y;
    player.z = ack.z;
    player.vx = 0;
    player.vy = 0;
    player.vz = 0;
    this._markMoveSynced(player);
  }

  _markMoveSynced(player) {
    player._mx = player.x;
    player._my = player.y;
    player._mz = player.z;
  }

  /** Sends the owner (and only the owner: every socket auto-joins a room named by its id) the authoritative state. */
  sendMoveAck(player, reliable = false) {
    if (!player || !player.moveState) return null;
    const ack = createMoveAck(player.moveState, player.lastProcessedSeq || 0, player.moveEpoch);
    const target = this.io.to(player.id);
    (reliable ? target : (target.volatile || target)).emit('moveAck', ack);
    return ack;
  }

  /** Emits an owner-only `shotRejected { ss, reason }` and records `player.lastShotReject`. */
  emitShotRejected(player, ss, reason) {
    if (!player) return null;
    const payload = { ss: Number.isSafeInteger(ss) ? ss : 0, reason };
    player.lastShotReject = payload;
    this.io.to(player.id).emit('shotRejected', payload);
    return payload;
  }

  /** Builds the owner-only `selfState` payload for a human player. */
  buildSelfState(player, now = Date.now()) {
    if (!player) return null;
    this.syncPlayerReloadState(player, now, false);
    const weapon = player.weapon;
    const wCfg = WEAPONS[weapon] || WEAPONS.rifle;
    const ammo = Number.isFinite(player.ammoByWeapon?.[weapon])
      ? player.ammoByWeapon[weapon]
      : (Number.isFinite(player.ammo) ? player.ammo : wCfg.magSize);
    const reserveAmmo = Number.isFinite(player.reserveAmmoByWeapon?.[weapon])
      ? player.reserveAmmoByWeapon[weapon]
      : (Number.isFinite(player.reserveAmmo) ? player.reserveAmmo : (wCfg.reserveAmmo ?? 0));
    const reloading = (player.alive && player.reloadingUntil && player.reloadingUntil > now)
      ? {
          weapon: player.reloadWeapon || weapon,
          remainingMs: Math.max(0, Math.round(player.reloadingUntil - now))
        }
      : null;
    return {
      seq: player.lastProcessedSeq || 0,
      lastShotSeq: player.lastShotSeq || 0,
      hp: Number.isFinite(player.hp) ? player.hp : 0,
      alive: Boolean(player.alive),
      weapon,
      ammo,
      reserveAmmo,
      ammoByWeapon: { ...(player.ammoByWeapon || {}) },
      reserveAmmoByWeapon: { ...(player.reserveAmmoByWeapon || {}) },
      reloading,
      grenades: Number.isFinite(player.grenades) ? player.grenades : 1
    };
  }

  _selfStateSignature(player) {
    if (!player) return '';
    const w = player.weapon;
    const ammo = player.ammoByWeapon?.[w] ?? player.ammo ?? 0;
    const res = player.reserveAmmoByWeapon?.[w] ?? player.reserveAmmo ?? 0;
    const rel = player.alive && player.reloadingUntil ? `${player.reloadWeapon || w}/${player.reloadingUntil | 0}` : '0';
    return `${player.hp}:${player.alive ? 1 : 0}:${w}:${ammo}:${res}:${rel}:${player.grenades ?? 1}`;
  }

  /** Sends the owner-only `selfState` snapshot to `player.id` (never broadcast to the room). */
  sendSelfState(player, now = Date.now(), reliable = false) {
    if (!player) return null;
    const state = this.buildSelfState(player, now);
    if (!state) return null;
    player.lastSelfStateAt = now;
    player._selfStateSig = this._selfStateSignature(player);
    const target = this.io.to(player.id);
    (reliable ? target : (target.volatile || target)).emit('selfState', state);
    return state;
  }

  sendSelfStateIfChanged(player, now = Date.now(), reliable = false) {
    if (!player) return null;
    this.syncPlayerReloadState(player, now, false);
    if (this._selfStateSignature(player) !== player._selfStateSig) {
      return this.sendSelfState(player, now, reliable);
    }
    return null;
  }

  /**
   * Handles an `inputBatch` ({ e: epoch, cmds: [...] }). Commands are validated and queued; they are simulated by
   * `processPlayerInputs` on the next tick. Old / duplicate seqs, malformed numbers and absurd seq jumps are dropped, a
   * batch tagged with a stale epoch (teleport happened) is discarded and answered with a throttled resync ack.
   * Returns { accepted, stale }.
   */
  handleInputBatch(room, player, payload, now = Date.now()) {
    const result = { accepted: 0, stale: false };
    if (!room || !player || !player.moveState || !payload) return result;

    if (payload.e !== player.moveEpoch) {
      result.stale = true;
      if (now - (player.lastStaleAckAt || 0) >= STALE_EPOCH_ACK_INTERVAL_MS) {
        player.lastStaleAckAt = now;
        this.sendMoveAck(player, true);
      }
      return result;
    }

    const cmds = payload.cmds;
    if (!Array.isArray(cmds)) return result;
    const queue = player.cmdQueue;
    const limit = Math.min(cmds.length, INPUT_BATCH_MAX_CMDS);
    for (let i = 0; i < limit; i++) {
      const cmd = sanitizeInputCommand(cmds[i]);
      if (!cmd) continue;
      if (cmd.seq <= player.lastProcessedSeq) continue; // already simulated (redundant resend)
      if (cmd.seq > player.lastProcessedSeq + INPUT_SEQ_AHEAD_MAX) continue;
      if (queue.length >= INPUT_QUEUE_MAX) break; // flood: surplus commands are dropped

      // Sorted insert (almost always an append); duplicates are ignored
      let at = queue.length;
      while (at > 0 && queue[at - 1].seq > cmd.seq) at--;
      if (at > 0 && queue[at - 1].seq === cmd.seq) continue;
      queue.splice(at, 0, cmd);
      result.accepted++;
    }
    return result;
  }

  /**
   * Simulates a human's queued commands in seq order. Every command costs exactly FIXED_DT of the player's time-credit
   * bucket, which refills with real elapsed seconds (capped at INPUT_CREDIT_CAP_S): a client cannot move faster than real
   * time however many commands it sends and whatever time it claims. Dead players only have their queue acknowledged.
   * Afterwards the owner gets a `moveAck`. Returns the number of commands simulated.
   */
  processPlayerInputs(room, player, now = Date.now()) {
    if (!room || !player || !player.moveState) return 0;

    // Anything other than this method moved the player (test setup, new server-side feature): that is a teleport
    if (player.x !== player._mx || player.y !== player._my || player.z !== player._mz) {
      this.resetPlayerMovement(player, now);
      this.sendMoveAck(player, true);
    }

    const credit = Math.max(0, Math.min(1, (now - player.lastCreditAt) / 1000));
    player.lastCreditAt = now;
    player.moveCredit = Math.min(INPUT_CREDIT_CAP_S, player.moveCredit + credit);

    const queue = player.cmdQueue;
    if (queue.length === 0) return 0;

    let simulated = 0;
    let drainedDead = false;
    let shotAccepted = false;
    const mapCfg = getMapConfig(room.mapId);
    this.syncPlayerReloadState(player, now);
    if (!player._selfStateSig) {
      player._selfStateSig = this._selfStateSignature(player);
    }

    while (queue.length > 0) {
      const cmd = queue[0];
      if (cmd.seq <= player.lastProcessedSeq) {
        queue.shift();
        continue;
      }
      if (!player.alive) {
        // Dead: ignore the input, reject any queued fire commands with DEAD, and ack so client pending buffer does not stall
        for (let i = 0; i < queue.length; i++) {
          const deadCmd = queue[i];
          if (deadCmd.seq > player.lastProcessedSeq && (deadCmd.btn & BTN.FIRE) !== 0) {
            if (
              Number.isSafeInteger(deadCmd.ss) &&
              deadCmd.ss > player.lastShotSeq &&
              deadCmd.ss - player.lastShotSeq <= MAX_SHOT_SEQ_GAP
            ) {
              player.lastShotSeq = deadCmd.ss;
            }
            this.emitShotRejected(player, deadCmd.ss, SHOT_REJECT.DEAD);
          }
        }
        player.lastProcessedSeq = queue[queue.length - 1].seq;
        queue.length = 0;
        drainedDead = true;
        break;
      }
      if (!player.cmdFresh && cmd.seq !== player.lastProcessedSeq + 1) {
        // Hole in the sequence: give a late / reordered command a moment to show up, then skip the hole
        if (player.cmdGapSince === null) player.cmdGapSince = now;
        if (now - player.cmdGapSince < INPUT_GAP_WAIT_MS) break;
      }
      if (player.moveCredit < FIXED_DT - 1e-9) break; // out of simulated time: the rest waits for more real time
      player.moveCredit -= FIXED_DT;
      queue.shift();
      this.applyInputCommand(player, cmd, mapCfg);
      player.lastProcessedSeq = cmd.seq;
      player.cmdFresh = false;
      player.cmdGapSince = null;
      simulated++;
      // A shot is part of the command: resolved right after the movement step, from the authoritative pose
      if ((cmd.btn & BTN.FIRE) !== 0) {
        const res = this.processFireCommand(room, player, cmd, now);
        if (res) shotAccepted = true;
      }
    }

    if (simulated > 0) {
      player.lastMoveAt = now;
      // History is stamped with the server clock: client clocks must never enter the lag-comp ring buffer.
      recordPlayerSnapshot(player, now);
    }
    if (simulated > 0 || drainedDead) {
      this.sendMoveAck(player);
    }
    if (shotAccepted) {
      this.sendSelfState(player, now, true);
    } else if (simulated > 0) {
      this.sendSelfStateIfChanged(player, now, true);
    }
    return simulated;
  }

  /** Simulates one validated command and mirrors the result into the fields the rest of the server reads. */
  applyInputCommand(player, cmd, mapCfg) {
    const state = player.moveState;
    if (cmd.w && cmd.w !== player.weapon && this.isWeaponAllowed(player, cmd.w)) {
      this.switchPlayerWeapon(player, cmd.w);
    }
    // Movement speed follows the weapon the server knows about, not whatever the command names
    const stepCmd = cmd.w === player.weapon ? cmd : { ...cmd, w: player.weapon };
    const result = stepCommand(state, stepCmd, mapCfg, this._cmdScratchInput || (this._cmdScratchInput = {}));

    player.x = state.x;
    player.y = state.y;
    player.z = state.z;
    player.vx = state.vx;
    player.vy = state.vy;
    player.vz = state.vz;
    player.crouching = state.crouching;
    player.prone = state.prone;
    player.yaw = cmd.yaw;
    player.pitch = cmd.pitch;
    player.lean = cmd.lean;
    player.isAiming = (cmd.btn & BTN.AIM) !== 0 && !result.aimCancelled;
    this._markMoveSynced(player);
  }

  handleReload(room, player, weaponId, customNow = null, emitSelfState = true) {
    if (!room || !player || !player.alive || room.state !== 'PLAYING') return;
    const wId = this.isWeaponAllowed(player, weaponId) ? weaponId : player.weapon;
    const cfg = WEAPONS[wId];
    if (!cfg || cfg.isMelee || cfg.infiniteAmmo) return;
    const now = typeof customNow === 'number' && Number.isFinite(customNow) ? customNow : Date.now();

    this.syncPlayerReloadState(player, now, emitSelfState);
    if (player.reloadingUntil > now) return;

    const currentAmmo = player.ammoByWeapon?.[wId] ?? player.ammo ?? 0;
    const currentReserve = player.reserveAmmoByWeapon?.[wId] ?? (player.weapon === wId ? player.reserveAmmo : cfg.reserveAmmo) ?? 0;
    if (currentAmmo >= cfg.magSize || currentReserve <= 0) return;

    player.isAiming = false;
    player.reloadStartedAt = now;
    player.reloadWeapon = wId;

    if (cfg.shellByShell) {
      const missing = Math.max(1, Math.min(cfg.magSize - currentAmmo, currentReserve));
      const startDelay = cfg.shellReloadStartMs || 240;
      const shellMs = cfg.shellReloadMs || 390;
      player.nextShellAt = now + startDelay + shellMs;
      player.reloadingUntil = now + startDelay + missing * shellMs;
    } else {
      const reloadDuration = currentAmmo > 0 ? (cfg.tacticalReloadMs || cfg.reloadMs) : cfg.reloadMs;
      player.nextShellAt = 0;
      player.reloadingUntil = now + reloadDuration;
    }

    if (emitSelfState) {
      this.sendSelfState(player, now, true);
    }
  }

  // ======================================================================================================================
  // Shots. A human's shot is part of the input command (BTN.FIRE + `ss`): the SERVER builds the pellet rays from the
  // authoritative pose, the command's yaw / pitch and the deterministic spread (shared/spread.js), then ray-casts them
  // against map obstacles and player part boxes (resolveShot). Nothing about direction, spread, hit lists, hit points or
  // headshot flags is read from the client.
  // ======================================================================================================================

  /**
   * Validates and simulates the FIRE bit of one command. Called by processPlayerInputs right after the movement step of
   * that command, so the pose is the authoritative post-step pose. Rejected commands are not simulated at all; the reason
   * is stored in `player.lastShotReject = { ss, reason }` (SHOT_REJECT codes) and sent to the owner via `shotRejected`.
   * Returns the resolveShot result, or null when the shot was rejected.
   */
  processFireCommand(room, shooter, cmd, now = Date.now()) {
    const ss = cmd.ss;
    const reject = (reason) => {
      this.emitShotRejected(shooter, ss, reason);
      return null;
    };
    if (!room || !shooter || !shooter.moveState) return null;
    if (!shooter.alive) return reject(SHOT_REJECT.DEAD);
    if (room.state !== 'PLAYING') return reject(SHOT_REJECT.STATE);

    // 1. Shot sequence: strictly increasing, no implausible jumps (a hole is only left by lost fire commands)
    if (!Number.isSafeInteger(ss) || ss <= shooter.lastShotSeq || ss - shooter.lastShotSeq > MAX_SHOT_SEQ_GAP) {
      return reject(SHOT_REJECT.SEQ);
    }
    shooter.lastShotSeq = ss;

    this.syncPlayerReloadState(shooter, now);

    // 2. Weapon: the command's weapon must be the allowed, equipped one (applyInputCommand already switched to it if allowed)
    const weaponId = cmd.w;
    if (!weaponId || weaponId !== shooter.weapon || !this.isWeaponAllowed(shooter, weaponId)) {
      return reject(SHOT_REJECT.WEAPON);
    }
    const weaponCfg = WEAPONS[weaponId];

    // 3. Fire rate in COMMAND SIM time: a catch-up burst of correctly spaced buffered commands is fine, commands spaced
    //    faster than the weapon allows are not, whatever the wall clock says.
    const cmdTimeMs = commandTimeMs(cmd.seq);
    const isAiming = Boolean(shooter.isAiming);
    if (!isFireIntervalOk(cmdTimeMs, shooter.lastFireCmdTimeMs, getEffectiveFireRateMs(weaponCfg, isAiming))) {
      return reject(SHOT_REJECT.RATE);
    }

    // 4. Reload (wall-clock sync with the existing tolerance) and ammo
    const ammoReject = this.consumeShotAmmo(room, shooter, weaponId, weaponCfg, now);
    if (ammoReject) return reject(ammoReject);

    shooter.lastFireCmdTimeMs = cmdTimeMs;
    shooter.lastShotAt = now;
    // Firing ends spawn protection
    this.endSpawnProtection(room, shooter, now);

    const st = shooter.moveState;
    const plan = planShot(
      shooter.shotState,
      weaponId,
      weaponCfg,
      cmdTimeMs,
      {
        x: st.x,
        y: st.y,
        z: st.z,
        vx: st.vx,
        vz: st.vz,
        onGround: st.onGround,
        crouching: st.crouching,
        isSliding: st.isSliding,
        prone: st.prone,
        lean: cmd.lean,
        aiming: isAiming
      },
      cmd.yaw,
      cmd.pitch,
      shooter.spreadSeed,
      ss
    );
    return this.resolveShot(room, shooter, { weaponId, origin: plan.origin, dirs: plan.dirs, now });
  }

  /**
   * Reload / magazine rules shared by every shot path. Returns null when a round was consumed (or the weapon needs none),
   * otherwise a SHOT_REJECT code. Active reloads get a 350 ms tolerance for humans (the client may have finished first);
   * firing a shell-by-shell weapon with a loaded shell interrupts the reload.
   */
  consumeShotAmmo(room, shooter, weaponId, weaponCfg, now) {
    if (weaponCfg.isMelee || weaponCfg.infiniteAmmo) {
      shooter.ammo = 1;
      shooter.reserveAmmo = 0;
      return null;
    }

    if (shooter.reloadingUntil > now) {
      if (now >= shooter.reloadingUntil - 350) {
        this.syncPlayerReloadState(shooter, shooter.reloadingUntil, false);
      }
    }
    if (shooter.reloadingUntil > now) {
      if (weaponCfg.shellByShell && shooter.ammo > 0) {
        shooter.reloadingUntil = 0;
        shooter.reloadWeapon = null;
        shooter.nextShellAt = 0;
      } else {
        return SHOT_REJECT.RELOAD;
      }
    }

    if (shooter.ammo <= 0) {
      const curRes = shooter.reserveAmmoByWeapon?.[weaponId] ?? shooter.reserveAmmo ?? 0;
      if (curRes > 0) {
        this.handleReload(room, shooter, weaponId, now, false);
      }
      return SHOT_REJECT.AMMO;
    }

    shooter.ammo = Math.max(0, shooter.ammo - 1);
    if (shooter.ammoByWeapon) {
      shooter.ammoByWeapon[weaponId] = shooter.ammo;
    }
    shooter.reserveAmmo = shooter.reserveAmmoByWeapon?.[weaponId] ?? shooter.reserveAmmo ?? 0;
    return null;
  }

  /**
   * Ray vs one player in exactly two poses: the pose rewound by the shooter's server-measured latency (the target currently
   * holds it) and, when that misses, the live pose (shooters whose view was not, or only barely, behind the server).
   * Only PART_PADDING of tolerance: lag is covered by the rewind, not by fat boxes.
   */
  raycastPlayerPoses(origin, dir, candidate, maxRange, savedStates) {
    const hit = raycastPlayerHitbox(origin, dir, candidate, maxRange, PART_PADDING);
    if (hit || savedStates.length === 0) return hit;
    let live = null;
    for (let i = 0; i < savedStates.length; i++) {
      if (savedStates[i].id === candidate.id) {
        live = savedStates[i];
        break;
      }
    }
    if (!live) return null;
    return raycastPlayerHitbox(
      origin,
      dir,
      {
        alive: true,
        x: live.x,
        y: live.y,
        z: live.z,
        yaw: candidate.yaw,
        pitch: candidate.pitch,
        lean: candidate.lean,
        crouching: Boolean(live.crouch),
        crouch: Boolean(live.crouch),
        prone: Boolean(live.prone),
        sliding: candidate.sliding,
        isSliding: candidate.isSliding
      },
      maxRange,
      PART_PADDING
    );
  }

  /**
   * THE shot resolver for humans (also reachable through the handleShoot test adapter). Every pellet ray is tested against
   * the map obstacles and the players' per-part boxes (rewound by the shooter's server-measured latency); the NEAREST of
   * {obstacle, player part} wins, so a wall or crate in front of a player absorbs the pellet (true hitscan occlusion) and
   * a low crate does not block a ray that passes above it. Damage = weapon damage x distance falloff (ray distance) x zone
   * multiplier of the SERVER part (head = headshotMult, leg = 0.78, body = 1), spawn protection blocks, kills / drops via
   * the usual events. Emits `shotFired` with the server's origin, direction(s) and first hit point.
   *
   * @param {{weaponId:string, origin:{x:number,y:number,z:number}, dirs:Array<{x:number,y:number,z:number}>, now?:number}} shot
   * @returns {{origin, dirs, hitPoint, hits:Array<{pellet:number,targetId:string,zone:string,distance:number,point:object}>,
   *            damage:Map<string,{totalDamage:number,anyHeadshot:boolean}>}|null}
   */
  resolveShot(room, shooter, shot) {
    const weaponId = shot?.weaponId;
    const weaponCfg = WEAPONS[weaponId];
    const origin = shot?.origin;
    const dirs = shot?.dirs;
    if (!room || !shooter || !weaponCfg || !isFiniteVec(origin) || !Array.isArray(dirs) || dirs.length === 0) return null;
    const now = typeof shot.now === 'number' && Number.isFinite(shot.now) ? shot.now : Date.now();

    const obstacles = getMapConfig(room.mapId).obstacles || [];
    const maxRange = weaponCfg.isMelee ? weaponCfg.range * 1.45 : weaponCfg.range * 1.15;

    // Rewind enemy hitboxes: rttMs/2 + interpolation delay (server-measured RTT only, clamped to LAG_COMP_MAX_REWIND_MS)
    const rewindMs = resolveShotRewindMs(shooter, null, now);
    const savedStates = rewindRoomPlayersForShot(room, shooter.id, rewindMs, now);

    const hits = [];
    let firstEnd = null;
    try {
      for (let p = 0; p < dirs.length; p++) {
        const dir = normalizeDir(dirs[p]);
        if (!dir) continue;

        // Nearest obstacle along this ray
        let wallDist = Infinity;
        for (let i = 0; i < obstacles.length; i++) {
          const t = rayIntersectsAABB(origin, dir, maxRange, obstacles[i]);
          if (t !== null && t < wallDist) wallDist = t;
        }

        // Nearest player part in front of that obstacle
        const reach = Math.min(maxRange, wallDist);
        let bestTarget = null;
        let bestHit = null;
        for (const candidate of room.players.values()) {
          if (!candidate || !candidate.alive || candidate.id === shooter.id) continue;
          const hit = this.raycastPlayerPoses(origin, dir, candidate, reach, savedStates);
          if (hit && (!bestHit || hit.distance < bestHit.distance)) {
            bestTarget = candidate;
            bestHit = hit;
          }
        }

        if (bestHit) {
          hits.push({
            pellet: p,
            targetId: bestTarget.id,
            zone: bestHit.zone,
            distance: bestHit.distance,
            point: bestHit.hitPoint
          });
        }
        if (p === 0) {
          if (bestHit) firstEnd = bestHit.hitPoint;
          else if (wallDist <= maxRange) {
            firstEnd = { x: origin.x + dir.x * wallDist, y: origin.y + dir.y * wallDist, z: origin.z + dir.z * wallDist };
          }
        }
      }
    } finally {
      restoreRewoundPlayers(savedStates);
    }

    // Melee swings that hit nothing still show a short stab line at the weapon's reach (like the old client did)
    const dir0 = normalizeDir(dirs[0]);
    if (!firstEnd && weaponCfg.isMelee && dir0) {
      firstEnd = {
        x: origin.x + dir0.x * weaponCfg.range,
        y: origin.y + dir0.y * weaponCfg.range,
        z: origin.z + dir0.z * weaponCfg.range
      };
    }

    const roundVec = (v, k) => (v ? { x: roundTo(v.x, k), y: roundTo(v.y, k), z: roundTo(v.z, k) } : null);
    const shotEvent = {
      shooterId: shooter.id,
      weapon: weaponId,
      origin: roundVec(origin, 1000),
      dir: roundVec(dir0 || dirs[0], 10000),
      hitPoint: roundVec(firstEnd, 1000)
    };
    if (dirs.length > 1) shotEvent.dirs = dirs.map((d) => roundVec(d, 10000));
    this.io.to(room.code).emit('shotFired', shotEvent);

    // Damage per target
    const damageMap = new Map();
    const blockedShieldTargets = new Set();
    for (const hit of hits) {
      const target = room.players.get(hit.targetId);
      if (!target || !target.alive) continue;
      // Block damage if target has active spawn protection
      if (target.invulnerableUntil && now < target.invulnerableUntil) {
        blockedShieldTargets.add(target.id);
        continue;
      }
      const falloffMult = computeDistanceFalloff(weaponCfg, hit.distance);
      const hitZoneMult = hit.zone === 'head' ? weaponCfg.headshotMult : hit.zone === 'leg' ? 0.78 : 1.0;
      const pelletDmg = Math.max(1, Math.round(weaponCfg.damage * falloffMult * hitZoneMult));
      const prev = damageMap.get(target.id) || { totalDamage: 0, anyHeadshot: false };
      prev.totalDamage += pelletDmg;
      prev.anyHeadshot = prev.anyHeadshot || hit.zone === 'head';
      damageMap.set(target.id, prev);
    }

    this.applyShotDamage(room, shooter, weaponId, damageMap, blockedShieldTargets, now);
    return { origin, dirs, hitPoint: firstEnd, hits, damage: damageMap };
  }

  /** Spawn-protection notices, HP loss, `damageDealt` and kills for the per-target damage of one shot. */
  applyShotDamage(room, shooter, weaponId, damageMap, blockedShieldTargets, now) {
    if (damageMap.size === 0 && blockedShieldTargets.size === 0) return;

    for (const protectedTargetId of blockedShieldTargets) {
      const protectedTarget = room.players.get(protectedTargetId);
      if (!protectedTarget) continue;
      this.io.to(room.code).emit('spawnProtectedHit', {
        targetId: protectedTarget.id,
        attackerId: shooter.id,
        remainingMs: Math.max(0, protectedTarget.invulnerableUntil - now)
      });
    }

    for (const [targetId, info] of damageMap.entries()) {
      const target = room.players.get(targetId);
      if (!target || !target.alive) continue;
      if (target.invulnerableUntil && now < target.invulnerableUntil) continue;

      target.hp = Math.max(0, target.hp - info.totalDamage);

      this.io.to(room.code).emit('damageDealt', {
        targetId: target.id,
        attackerId: shooter.id,
        attackerPos: { x: shooter.x, y: shooter.y, z: shooter.z },
        damage: info.totalDamage,
        hp: target.hp,
        isHeadshot: info.anyHeadshot
      });

      if (target.hp <= 0) {
        this.handlePlayerKilled(room, shooter, target, weaponId, info.anyHeadshot);
      }
    }
  }

  /**
   * TEST / LEGACY ADAPTER - NOT a production entry point for humans (there is no `shoot` socket event any more; human shots
   * arrive as FIRE commands and go through processFireCommand). It keeps the old unit-test call shape alive:
   * for a human, `payload.dir` is treated as the exact aim direction with NO spread, the origin is always the server's eye
   * (stance + lean), and the same resolveShot runs. `hits`, `targetId`, `isHeadshot`, `isLegshot`, `hitPoint`, `origin`
   * and every latency / timestamp field of the payload are ignored (`isAiming` only selects the fire interval of the old
   * wall-clock rate limit, 0.82 x interval).
   */
  handleShoot(room, shooter, payload, customNow = null) {
    if (!room || !shooter || !shooter.alive || room.state !== 'PLAYING') return;

    const now = typeof customNow === 'number' && Number.isFinite(customNow) ? customNow : Date.now();
    this.syncPlayerReloadState(shooter, now);

    // Firing (or dealing damage) ends spawn protection
    this.endSpawnProtection(room, shooter, now);

    const aimDir = normalizeDir(payload?.dir);
    if (!aimDir) return;

    // Humans can only fire weapons from their server-side loadout (anything else falls back to the equipped one)
    const weaponId = this.isWeaponAllowed(shooter, payload?.weapon) ? payload.weapon : shooter.weapon;
    const weaponCfg = WEAPONS[weaponId];
    if (weaponId !== shooter.weapon) {
      this.switchPlayerWeapon(shooter, weaponId);
    }

    // (adapter only) the ADS flag selects the fire interval of the old wall-clock rate limit; it has no effect on aim / spread
    if (typeof payload?.isAiming === 'boolean') shooter.isAiming = payload.isAiming;
    const effectiveFireRateMs = getEffectiveFireRateMs(weaponCfg, Boolean(shooter.isAiming));
    if (now - shooter.lastShotAt < effectiveFireRateMs * 0.82) return;
    if (this.consumeShotAmmo(room, shooter, weaponId, weaponCfg, now)) return;
    shooter.lastShotAt = now;

    const origin = computeShotOrigin({
      x: shooter.x,
      y: shooter.y,
      z: shooter.z,
      yaw: shooter.yaw,
      lean: shooter.lean,
      prone: shooter.prone,
      isSliding: shooter.moveState?.isSliding,
      crouching: shooter.crouching
    });
    const dirs = new Array(Math.max(1, weaponCfg.pellets || 1)).fill(aimDir);
    this.resolveShot(room, shooter, { weaponId, origin, dirs, now });
  }

  spawnDroppedWeapon(room, dropData = {}, broadcast = true) {
    if (!room) return null;
    if (!Array.isArray(room.droppedWeapons)) {
      room.droppedWeapons = [];
    }
    const weaponId = WEAPONS[dropData.weapon]?.slot === 1 ? dropData.weapon : 'rifle';
    const wCfg = WEAPONS[weaponId] || WEAPONS.rifle;
    const now = Date.now();
    const despawnMs = MATCH_CONFIG.DROPPED_WEAPON_DESPAWN_MS || 5000;

    const dropItem = {
      id: `drop_${now}_${Math.random().toString(36).slice(2, 7)}`,
      weapon: weaponId,
      weaponName: wCfg.name,
      ammo: Math.max(0, Math.min(wCfg.magSize, Math.floor(Number(dropData.ammo) ?? wCfg.magSize))),
      reserveAmmo: Math.max(0, Math.floor(Number(dropData.reserveAmmo) ?? (wCfg.reserveAmmo ?? 60))),
      x: round2(dropData.x),
      y: round2(dropData.y),
      z: round2(dropData.z),
      yaw: round2(dropData.yaw),
      droppedBy: dropData.droppedBy || 'Striker',
      createdAt: now,
      expiresAt: now + despawnMs
    };

    room.droppedWeapons.push(dropItem);
    // Keep max 20 active drops in room
    if (room.droppedWeapons.length > 20) {
      room.droppedWeapons.shift();
    }

    if (broadcast) {
      this.io.to(room.code).emit('weaponDropped', dropItem);
    }
    return dropItem;
  }

  updateDroppedWeapons(room, now = Date.now()) {
    if (!room || !Array.isArray(room.droppedWeapons) || room.droppedWeapons.length === 0) return;
    const beforeLen = room.droppedWeapons.length;
    room.droppedWeapons = room.droppedWeapons.filter((d) => d && now < d.expiresAt);
    if (room.droppedWeapons.length !== beforeLen) {
      this.io.to(room.code).emit('droppedWeaponsUpdate', {
        droppedWeapons: room.droppedWeapons
      });
    }
  }

  handlePickupWeapon(room, player, payload = {}) {
    if (!room || !player || !player.alive || room.state !== 'PLAYING') return null;
    const now = Date.now();
    this.syncPlayerReloadState(player, now);
    this.updateDroppedWeapons(room, now);

    if (!Array.isArray(room.droppedWeapons) || room.droppedWeapons.length === 0) return null;

    const maxPickupDist = (MATCH_CONFIG.DROPPED_WEAPON_PICKUP_RADIUS || 2.8) + 0.85;
    let bestIdx = -1;
    let bestDist = Infinity;

    for (let i = 0; i < room.droppedWeapons.length; i++) {
      const d = room.droppedWeapons[i];
      if (!d || now >= d.expiresAt) continue;
      const dist = Math.hypot(d.x - player.x, d.z - player.z);
      if (dist > maxPickupDist) continue;
      if (payload?.dropId && d.id === payload.dropId) {
        bestIdx = i;
        bestDist = dist;
        break;
      }
      if (dist < bestDist) {
        bestDist = dist;
        bestIdx = i;
      }
    }

    if (bestIdx === -1) return null;

    const [pickedDrop] = room.droppedWeapons.splice(bestIdx, 1);

    // Determine player's current Slot 1 primary weapon and its exact remaining ammo + reserveAmmo
    const oldPrimary = (player.loadout?.primary && WEAPONS[player.loadout.primary]?.slot === 1)
      ? player.loadout.primary
      : 'rifle';
    const oldCfg = WEAPONS[oldPrimary] || WEAPONS.rifle;
    const oldAmmo = player.ammoByWeapon?.[oldPrimary] ?? (player.weapon === oldPrimary ? player.ammo : oldCfg.magSize);
    const oldReserve = player.reserveAmmoByWeapon?.[oldPrimary] ?? (player.weapon === oldPrimary ? player.reserveAmmo : oldCfg.reserveAmmo) ?? 0;

    // Throw the old primary weapon onto the ground at the player's feet for 5 seconds
    const thrownDrop = this.spawnDroppedWeapon(
      room,
      {
        weapon: oldPrimary,
        ammo: oldAmmo,
        reserveAmmo: oldReserve,
        x: player.x,
        y: player.y || 0,
        z: player.z,
        yaw: player.yaw || 0,
        droppedBy: player.name
      },
      false
    );

    // Equip the picked-up primary weapon into player's Slot 1 and make it active
    if (!player.loadout) {
      player.loadout = { primary: pickedDrop.weapon, secondary: 'pistol', melee: 'knife' };
    } else {
      player.loadout.primary = pickedDrop.weapon;
    }

    if (!player.ammoByWeapon) player.ammoByWeapon = createInitialAmmoMap();
    if (!player.reserveAmmoByWeapon) player.reserveAmmoByWeapon = createInitialReserveAmmoMap();

    player.ammoByWeapon[pickedDrop.weapon] = pickedDrop.ammo;
    player.reserveAmmoByWeapon[pickedDrop.weapon] = pickedDrop.reserveAmmo;
    player.weapon = pickedDrop.weapon;
    player.ammo = pickedDrop.ammo;
    player.reserveAmmo = pickedDrop.reserveAmmo;
    player.reloadingUntil = 0;
    player.reloadWeapon = null;
    player.nextShellAt = 0;

    const swapEvent = {
      playerId: player.id,
      pickedDropId: pickedDrop.id,
      weapon: player.weapon,
      ammo: player.ammo,
      reserveAmmo: player.reserveAmmo,
      loadout: player.loadout,
      thrownDrop,
      droppedWeapons: room.droppedWeapons
    };

    this.io.to(room.code).emit('weaponSwapped', swapEvent);
    return swapEvent;
  }

  handleThrowGrenade(room, player, payload = {}) {
    if (!room || !player || !player.alive || room.state !== 'PLAYING') return null;
    if ((player.grenades ?? 1) <= 0) return null;

    const now = Date.now();
    if (player.lastGrenadeAt && now - player.lastGrenadeAt < 250) return null;

    player.grenades = Math.max(0, (player.grenades ?? 1) - 1);
    player.lastGrenadeAt = now;
    this.endSpawnProtection(room, player, now);

    if (!Array.isArray(room.grenades)) {
      room.grenades = [];
    }

    const eyeH = player.prone ? 0.46 : player.crouching ? 1.0 : 1.55;
    const leanVal = (player.lean || 0) * (MATCH_CONFIG.LEAN_OFFSET || 0.42);
    const yaw = typeof payload?.yaw === 'number' && Number.isFinite(payload.yaw) ? payload.yaw : (player.yaw || 0);
    const pitch = typeof payload?.pitch === 'number' && Number.isFinite(payload.pitch)
      ? Math.max(-Math.PI / 2, Math.min(Math.PI / 2, payload.pitch))
      : (player.pitch || 0);

    const rightX = Math.cos(yaw);
    const rightZ = -Math.sin(yaw);

    let dirX = -Math.sin(yaw) * Math.cos(pitch);
    let dirY = Math.sin(pitch);
    let dirZ = -Math.cos(yaw) * Math.cos(pitch);
    if (
      payload?.dir &&
      typeof payload.dir.x === 'number' &&
      typeof payload.dir.y === 'number' &&
      typeof payload.dir.z === 'number'
    ) {
      const dLen = Math.hypot(payload.dir.x, payload.dir.y, payload.dir.z);
      if (dLen > 0.001 && Number.isFinite(dLen)) {
        dirX = payload.dir.x / dLen;
        dirY = payload.dir.y / dLen;
        dirZ = payload.dir.z / dLen;
      }
    }

    let eyeX = player.x + rightX * leanVal;
    let eyeY = Math.max(0.22, (player.y || 0) + eyeH);
    let eyeZ = player.z + rightZ * leanVal;

    if (
      payload?.origin &&
      typeof payload.origin.x === 'number' &&
      typeof payload.origin.y === 'number' &&
      typeof payload.origin.z === 'number'
    ) {
      const originDist = Math.hypot(
        payload.origin.x - player.x,
        payload.origin.y - ((player.y || 0) + eyeH),
        payload.origin.z - player.z
      );
      if (originDist <= 1.8 && Number.isFinite(originDist)) {
        eyeX = payload.origin.x;
        eyeY = Math.max(0.22, payload.origin.y);
        eyeZ = payload.origin.z;
      }
    }

    const mapCfg = getMapConfig(room.mapId);
    const obstacles = mapCfg.obstacles || [];
    const arenaLimit = (mapCfg.arenaHalfSize || MATCH_CONFIG.ARENA_HALF_SIZE) - 0.3;
    const radius = 0.18;

    let startX = eyeX + dirX * 0.38;
    let startY = Math.max(0.22, eyeY + dirY * 0.22);
    let startZ = eyeZ + dirZ * 0.38;

    // Prevent point-blank throws from spawning inside or through an adjacent obstacle
    let blockedAtStart = !hasLineOfSight(
      { x: eyeX, y: eyeY, z: eyeZ },
      { x: startX, y: startY, z: startZ },
      obstacles
    );
    if (!blockedAtStart) {
      blockedAtStart = isPointInsideInflatedBoxes(startX, startY, startZ, radius, obstacles);
    }
    if (blockedAtStart) {
      startX = eyeX;
      startY = eyeY;
      startZ = eyeZ;
    }

    startX = Math.max(-arenaLimit, Math.min(arenaLimit, startX));
    startZ = Math.max(-arenaLimit, Math.min(arenaLimit, startZ));

    const throwSpeed = 19.5;
    const upwardArc = 4.2;
    const vx = dirX * throwSpeed + (player.vx || 0) * 0.25;
    const vy = dirY * throwSpeed + upwardArc;
    const vz = dirZ * throwSpeed + (player.vz || 0) * 0.25;
    const fuseMs = 2200;

    const grenade = {
      id: `gren_${now}_${Math.random().toString(36).slice(2, 7)}`,
      ownerId: player.id,
      ownerName: player.name,
      x: round2(startX),
      y: round2(startY),
      z: round2(startZ),
      vx: round2(vx),
      vy: round2(vy),
      vz: round2(vz),
      createdAt: now,
      explodeAt: now + fuseMs,
      fuseRemaining: 2.2
    };

    room.grenades.push(grenade);

    this.io.to(room.code).emit('grenadeThrown', {
      ...grenade,
      grenade,
      playerId: player.id,
      grenades: player.grenades
    });

    return grenade;
  }

  updateGrenades(room, dt, now = Date.now()) {
    if (!room || !Array.isArray(room.grenades) || room.grenades.length === 0) return;

    const mapCfg = getMapConfig(room.mapId);
    const totalDt = Math.min(3.0, Math.max(0, Number(dt) || 0));

    const remaining = [];
    const toDetonate = [];

    for (let i = 0; i < room.grenades.length; i++) {
      const g = room.grenades[i];
      if (!g) continue;

      // Shared deterministic integration + bounce (sub-stepped), identical to the client projectile loop
      stepGrenade(g, totalDt, mapCfg);

      g.x = round2(g.x);
      g.y = round2(g.y);
      g.z = round2(g.z);
      g.vx = round2(g.vx);
      g.vy = round2(g.vy);
      g.vz = round2(g.vz);

      const prevFuse = typeof g.fuseRemaining === 'number' && Number.isFinite(g.fuseRemaining) ? g.fuseRemaining : 2.2;
      const nextFuseByDt = prevFuse - totalDt;
      const nextFuseByClock = typeof g.explodeAt === 'number' && Number.isFinite(g.explodeAt) ? (g.explodeAt - now) / 1000 : nextFuseByDt;
      const fuseRem = Math.min(nextFuseByDt, nextFuseByClock);
      g.fuseRemaining = round2(Math.max(0, fuseRem));

      if (fuseRem <= 0 || (typeof g.explodeAt === 'number' && now >= g.explodeAt)) {
        toDetonate.push(g);
      } else {
        remaining.push(g);
      }
    }

    room.grenades = remaining;

    for (let i = 0; i < toDetonate.length; i++) {
      this.detonateGrenade(room, toDetonate[i], now);
    }
  }

  detonateGrenade(room, grenade, now = Date.now()) {
    if (!room || !grenade) return;

    if (Array.isArray(room.grenades) && room.grenades.length > 0) {
      room.grenades = room.grenades.filter((g) => g && g !== grenade && g.id !== grenade.id);
    }

    this.io.to(room.code).emit('grenadeExploded', {
      id: grenade.id,
      x: grenade.x,
      y: grenade.y,
      z: grenade.z,
      ownerId: grenade.ownerId
    });

    if (room.state !== 'PLAYING') return;

    const maxDamage = 95;
    const innerRadius = 2.2;
    const outerRadius = 7.5;
    const mapCfg = getMapConfig(room.mapId);
    const obstacles = mapCfg.obstacles || [];
    const attacker = room.players.get(grenade.ownerId) || null;
    const blastOrigin = {
      x: grenade.x,
      y: Math.max(0.35, grenade.y + 0.25),
      z: grenade.z
    };

    // Evaluate enemy targets first, then owner if standing inside blast radius
    const candidates = [];
    for (const p of room.players.values()) {
      if (!p || !p.alive) continue;
      if (p.id !== grenade.ownerId) {
        candidates.push(p);
      }
    }
    if (attacker && attacker.alive) {
      candidates.push(attacker);
    }

    for (let i = 0; i < candidates.length; i++) {
      if (room.state !== 'PLAYING') break;
      const target = candidates[i];
      if (!target || !target.alive) continue;

      const clampedTargetY = Math.max(target.y || 0, Math.min((target.y || 0) + 1.5, grenade.y));
      const dist = Math.hypot(target.x - grenade.x, clampedTargetY - grenade.y, target.z - grenade.z);
      if (dist > outerRadius) continue;

      const targetTorso = {
        x: target.x,
        y: (target.y || 0) + (target.prone ? 0.35 : target.crouching ? 0.8 : 1.1),
        z: target.z
      };
      const targetHead = {
        x: target.x,
        y: (target.y || 0) + (target.prone ? 0.48 : target.crouching ? 1.0 : 1.55),
        z: target.z
      };

      const losOk =
        hasLineOfSight(blastOrigin, targetTorso, obstacles) ||
        hasLineOfSight(blastOrigin, targetHead, obstacles);
      if (!losOk) continue;

      if (target.invulnerableUntil && now < target.invulnerableUntil) {
        this.io.to(room.code).emit('spawnProtectedHit', {
          targetId: target.id,
          attackerId: grenade.ownerId,
          remainingMs: Math.max(0, target.invulnerableUntil - now)
        });
        continue;
      }

      let damage = maxDamage;
      if (dist > innerRadius) {
        const t = (dist - innerRadius) / (outerRadius - innerRadius);
        damage = Math.max(1, Math.round(maxDamage * (1 - t)));
      }

      target.hp = Math.max(0, target.hp - damage);

      this.io.to(room.code).emit('damageDealt', {
        targetId: target.id,
        attackerId: grenade.ownerId,
        attackerPos: { x: grenade.x, y: grenade.y, z: grenade.z },
        damage,
        hp: target.hp,
        isHeadshot: false,
        weapon: 'grenade',
        weaponName: 'FRAG GRENADE'
      });

      if (target.hp <= 0) {
        this.handlePlayerKilled(room, attacker, target, 'grenade', false);
      }
    }
  }

  handlePlayerKilled(room, killer, victim, weaponId, isHeadshot) {
    // Drop victim's primary weapon with its remaining ammo + reserveAmmo at their death location for 5s
    const victimPrimary = (victim.loadout?.primary && WEAPONS[victim.loadout.primary]?.slot === 1)
      ? victim.loadout.primary
      : (WEAPONS[victim.weapon]?.slot === 1 ? victim.weapon : 'rifle');
    const primaryCfg = WEAPONS[victimPrimary] || WEAPONS.rifle;
    const dropMagAmmo = victim.ammoByWeapon?.[victimPrimary]
      ?? (victim.weapon === victimPrimary ? victim.ammo : primaryCfg.magSize);
    const dropReserveAmmo = victim.reserveAmmoByWeapon?.[victimPrimary]
      ?? (victim.weapon === victimPrimary ? victim.reserveAmmo : primaryCfg.reserveAmmo)
      ?? 0;

    const droppedWeapon = this.spawnDroppedWeapon(room, {
      weapon: victimPrimary,
      ammo: dropMagAmmo,
      reserveAmmo: dropReserveAmmo,
      x: victim.x,
      y: victim.y || 0,
      z: victim.z,
      yaw: victim.yaw || 0,
      droppedBy: victim.name
    });

    victim.alive = false;
    victim.hp = 0;
    victim.isAiming = false;
    victim.deaths += 1;
    victim.streak = 0;
    victim.reloadingUntil = 0;
    victim.reloadWeapon = null;
    victim.nextShellAt = 0;
    victim.invulnerableUntil = 0;
    victim.lastDeathX = victim.x;
    victim.lastDeathZ = victim.z;
    victim.respawnAt = Date.now() + MATCH_CONFIG.RESPAWN_DELAY_MS;

    let adrenalineHeal = 0;
    if (killer && killer.id !== victim.id) {
      killer.kills += 1;
      killer.streak += 1;
      if (killer.alive) {
        const prevHp = Number(killer.hp) || 0;
        const maxHp = MATCH_CONFIG.MAX_HP || 100;
        const healAmount = MATCH_CONFIG.KILL_ADRENALINE_HEAL || KILL_ADRENALINE_HEAL || 25;
        killer.hp = Math.min(maxHp, prevHp + healAmount);
        adrenalineHeal = killer.hp - prevHp;
      }
    }

    const isGrenadeKill = weaponId === 'grenade';
    const resolvedWeaponName = isGrenadeKill
      ? 'FRAG GRENADE'
      : (WEAPONS[weaponId]?.name || String(weaponId || 'rifle').toUpperCase());

      this.io.to(room.code).emit('killEvent', {
        killerId: killer ? killer.id : null,
        killerName: killer ? killer.name : 'Arena',
        killerColor: killer ? killer.color : 0xffffff,
        victimId: victim.id,
        victimName: victim.name,
        victimColor: victim.color,
        weapon: isGrenadeKill ? 'grenade' : resolvedWeaponName,
        weaponName: resolvedWeaponName,
        weaponId,
        isHeadshot: Boolean(isHeadshot),
        killerStreak: killer ? killer.streak : 0,
        killerHp: killer ? killer.hp : 0,
        newKillerHp: killer ? killer.hp : 0,
        adrenalineHeal,
        healedHp: adrenalineHeal,
        healAmount: adrenalineHeal > 0 ? adrenalineHeal : (KILL_ADRENALINE_HEAL || 25),
        droppedWeapon
      });

      if (victim) {
        this.sendSelfState(victim, Date.now(), true);
      }
      if (killer && killer.id !== victim.id && adrenalineHeal > 0) {
        this.sendSelfState(killer, Date.now(), true);
      }

      // Check win condition (20 kills)
      if (killer && killer.kills >= MATCH_CONFIG.KILL_LIMIT && room.state === 'PLAYING') {
        this.endMatch(room, killer);
      }
    }

  respawnPlayer(room, player) {
    const now = Date.now();
    const protectionMs = MATCH_CONFIG.SPAWN_PROTECTION_MS || 1500;
    const sp = this.pickSafeSpawnPoint(room, player.id);
    if (player.pendingLoadout) {
      player.loadout = player.pendingLoadout;
      player.savedLoadoutPrimary = player.pendingLoadout.primary;
      player.pendingLoadout = null;
    }
    const basePrimary = player.savedLoadoutPrimary || player.loadout?.primary || 'rifle';
    if (player.loadout && WEAPONS[basePrimary]?.slot === 1) {
      player.loadout.primary = basePrimary;
    }
    if (player.loadout?.primary && WEAPONS[player.loadout.primary]) {
      player.weapon = player.loadout.primary;
    }
    const wCfg = WEAPONS[player.weapon] || WEAPONS.rifle;
    player.x = sp.x;
    player.y = sp.y || 0;
    player.z = sp.z;
    player.vx = 0;
    player.vy = 0;
    player.vz = 0;
    player.yaw = sp.yaw || 0;
    player.pitch = 0;
    player.crouching = false;
    player.prone = false;
    player.isAiming = false;
    player.lean = 0;
    player.hp = MATCH_CONFIG.MAX_HP;
    player.alive = true;
    player.reloadingUntil = 0;
    player.reloadWeapon = null;
    player.nextShellAt = 0;
    player.respawnAt = 0;
    player.invulnerableUntil = now + protectionMs;
    player.ammoByWeapon = createInitialAmmoMap();
    player.reserveAmmoByWeapon = createInitialReserveAmmoMap();
    player.ammo = wCfg.magSize;
    player.reserveAmmo = wCfg.infiniteAmmo ? 0 : (wCfg.reserveAmmo ?? wCfg.magSize * 3);
    player.grenades = 1;
    player.lastShotReject = null;
    player.positionHistory = [];
    // Server moved the player: restart movement budgets from the new spawn
    player.moveBudgetXZ = undefined;
    player.moveBudgetUp = undefined;
    player.moveBudgetDown = undefined;
    player.lastPosAt = undefined;
    // Server teleported the player: new movement epoch, queued commands of the old one are void
    this.resetPlayerMovement(player, now);
    recordPlayerSnapshot(player, now);

    // New life = new secret spread seed. It goes to the owner ONLY (every socket auto-joins a room named by its id, so
    // `io.to(player.id)` reaches exactly that socket) and BEFORE the `playerRespawned` room broadcast, which stays seed-free.
    const spreadSeed = this.resetShotSession(player);
    if (spreadSeed !== null) {
      this.io.to(player.id).emit('selfSeed', { spreadSeed });
    }

    this.io.to(room.code).emit('playerRespawned', {
      playerId: player.id,
      x: player.x,
      y: player.y,
      z: player.z,
      yaw: player.yaw,
      hp: player.hp,
      weapon: player.weapon,
      loadout: player.loadout || null,
      ammo: player.ammo,
      reserveAmmo: player.reserveAmmo,
      ammoByWeapon: player.ammoByWeapon,
      reserveAmmoByWeapon: player.reserveAmmoByWeapon,
      grenades: player.grenades,
      invulnerable: true,
      invulnerableUntil: player.invulnerableUntil,
      spawnProtectionMs: protectionMs
    });
    this.sendMoveAck(player, true); // owner learns the new epoch + authoritative spawn state
    this.sendSelfState(player, now, true);
  }

  updateHealthPacks(room, now) {
    if (!room || !Array.isArray(room.pickups)) return;
    for (const pack of room.pickups) {
      if (!pack.active) {
        if (now >= pack.respawnAt) {
          pack.active = true;
          this.io.to(room.code).emit('pickupState', {
            pickupId: pack.id,
            active: true
          });
        }
        continue;
      }

      // Check if any injured alive player walks over the health pack
      for (const player of room.players.values()) {
        if (!player.alive || player.hp >= MATCH_CONFIG.MAX_HP) continue;
        const dist = Math.hypot(player.x - pack.x, player.z - pack.z);
        if (dist <= 2.35 && Math.abs((player.y || 0) - (pack.y || 0)) <= 2.4) {
          pack.active = false;
          pack.respawnAt = now + MATCH_CONFIG.HEALTH_PACK_RESPAWN_MS;
          player.hp = Math.min(MATCH_CONFIG.MAX_HP, player.hp + MATCH_CONFIG.HEALTH_PACK_HEAL);

          this.io.to(room.code).emit('pickupState', {
            pickupId: pack.id,
            active: false,
            pickerId: player.id,
            newHp: player.hp
          });
          this.sendSelfState(player, now, true);
          break;
        }
      }
    }
  }

  getLeaderboard(room) {
    return Array.from(room.players.values())
      .map((p) => ({
        id: p.id,
        name: p.name,
        color: p.color,
        kills: p.kills,
        deaths: p.deaths,
        streak: p.streak
      }))
      .sort((a, b) => {
        if (b.kills !== a.kills) return b.kills - a.kills;
        return a.deaths - b.deaths;
      });
  }

  endMatch(room, explicitWinner = null) {
    if (room.state === 'ENDED') return;
    room.state = 'ENDED';
    const now = Date.now();
    room.nextMatchAt = now + MATCH_CONFIG.INTERMISSION_SEC * 1000;

    const leaderboard = this.getLeaderboard(room);
    const winner = explicitWinner
      ? {
          id: explicitWinner.id,
          name: explicitWinner.name,
          kills: explicitWinner.kills,
          deaths: explicitWinner.deaths,
          color: explicitWinner.color
        }
      : leaderboard[0] || { name: 'Draw', kills: 0, deaths: 0 };

    this.io.to(room.code).emit('matchEnded', {
      winner,
      leaderboard,
      nextMatchIn: MATCH_CONFIG.INTERMISSION_SEC
    });
  }

  startNewMatch(room) {
    const now = Date.now();
    room.state = 'PLAYING';
    room.matchStartedAt = now;
    room.matchEndsAt = now + MATCH_CONFIG.MATCH_DURATION_SEC * 1000;
    room.nextMatchAt = 0;
    room.droppedWeapons = [];
    room.grenades = [];
    room.recentSpawns = [];

    // Reset all pickups
    for (const pack of room.pickups) {
      pack.active = true;
      pack.respawnAt = 0;
    }

    // Mark all players not yet placed so sequential respawn assigns non-overlapping points
    for (const p of room.players.values()) {
      p.alive = false;
      p.lastDeathX = null;
      p.lastDeathZ = null;
    }

    // Reset all player scores and respawn
    for (const p of room.players.values()) {
      p.kills = 0;
      p.deaths = 0;
      p.streak = 0;
      this.respawnPlayer(room, p);
    }

    this.io.to(room.code).emit('matchStarted', {
      mapId: room.mapId,
      timeRemaining: MATCH_CONFIG.MATCH_DURATION_SEC,
      killLimit: MATCH_CONFIG.KILL_LIMIT,
      pickups: room.pickups,
      droppedWeapons: room.droppedWeapons,
      activeGrenades: this.serializeGrenades(room),
      players: this.serializePlayers(room)
    });
  }

  serializeGrenades(room) {
    const grenades = room?.grenades;
    if (!Array.isArray(grenades) || grenades.length === 0) return [];
    const list = new Array(grenades.length);
    let idx = 0;
    for (let i = 0; i < grenades.length; i++) {
      const g = grenades[i];
      if (!g) continue;
      list[idx++] = {
        id: g.id,
        ownerId: g.ownerId,
        x: round2(g.x),
        y: round2(g.y),
        z: round2(g.z),
        vx: round2(g.vx),
        vy: round2(g.vy),
        vz: round2(g.vz),
        fuseRemaining: round2(g.fuseRemaining)
      };
    }
    if (idx < list.length) {
      list.length = idx;
    }
    return list;
  }

  serializePlayers(room) {
    if (!room || !room.players) return [];
    const now = Date.now();
    const list = new Array(room.players.size);
    let idx = 0;
    for (const p of room.players.values()) {
      if (!p.alive || (p.lastMoveAt && now - p.lastMoveAt > 120)) {
        p.vx = 0;
        p.vy = 0;
        p.vz = 0;
      }
      let meta = p._staticMeta;
      if (!meta || meta.id !== p.id || meta.name !== p.name || meta.color !== p.color) {
        meta = {
          id: p.id,
          name: p.name,
          color: p.color
        };
        p._staticMeta = meta;
      }
      const invulnerable = Boolean(p.alive && p.invulnerableUntil && now < p.invulnerableUntil);
      list[idx++] = {
        id: meta.id,
        name: meta.name,
        color: meta.color,
        x: round2(p.x),
        y: round2(p.y),
        z: round2(p.z),
        vx: round1(p.vx),
        vy: round1(p.vy),
        vz: round1(p.vz),
        yaw: round2(p.yaw),
        pitch: round2(p.pitch),
        crouching: Boolean(p.crouching),
        prone: Boolean(p.prone),
        lean: round2(p.lean),
        weapon: p.weapon,
        ammo: Number.isFinite(p.ammo) ? p.ammo : 0,
        reserveAmmo: Number.isFinite(p.reserveAmmo) ? p.reserveAmmo : 0,
        grenades: Number.isFinite(p.grenades) ? p.grenades : 1,
        hp: Number.isFinite(p.hp) ? p.hp : 0,
        alive: Boolean(p.alive),
        invulnerable,
        invulnerableUntil: invulnerable ? p.invulnerableUntil : 0,
        kills: p.kills || 0,
        deaths: p.deaths || 0,
        streak: p.streak || 0
      };
    }
    return list;
  }

  tick(customDt = null) {
    const now = Date.now();
    const dt = typeof customDt === 'number' && Number.isFinite(customDt) && customDt > 0
      ? customDt
      : Math.min(0.1, (now - this.lastTickAt) / 1000);
    this.lastTickAt = now;

    // Server timestamp (ms) stamped on every stateUpdate of this tick (same value for all rooms/players in it).
    // Clock choice: Date.now() captured ONCE at the start of the tick - the very same value used as the lag-compensation
    // history timestamp (recordRoomSnapshots(room, now)), so client interpolation time and server rewind time share one
    // epoch. Date.now() can step backwards (NTP), so the stamp is forced strictly increasing across ticks.
    const prevStamp = this._lastStateStampMs;
    const stateStampMs = (typeof prevStamp === 'number' && now <= prevStamp) ? prevStamp + 1 : now;
    this._lastStateStampMs = stateStampMs;

    for (const room of this.rooms.values()) {
      // Skip idle rooms with zero human players to save 100% CPU when no match is active
      if (this.getHumanCount(room) === 0) continue;

      if (room.state === 'ENDED') {
        if (now >= room.nextMatchAt) {
          this.startNewMatch(room);
        }
        continue;
      }

      // Check round time limit
      const timeRemaining = Math.max(0, Math.ceil((room.matchEndsAt - now) / 1000));
      if (timeRemaining <= 0) {
        this.endMatch(room);
        continue;
      }

      // Respawn human players whose 3s respawn delay has elapsed & advance reloads
      for (const p of room.players.values()) {
        if (!p.alive && now >= p.respawnAt) {
          this.respawnPlayer(room, p);
        } else if (p.alive && p.reloadingUntil) {
          this.syncPlayerReloadState(p, now);
        }
        // Authoritative movement: simulate the player's queued input commands (time-credit limited) and ack them
        this.processPlayerInputs(room, p, now);
      }

      // Record lag compensation position snapshots for all alive players
      recordRoomSnapshots(room, now);

      // Update active Frag Grenades physics & 2.2s fuse detonation
      this.updateGrenades(room, dt, now);

      // Update Health Pack pickups & 5s Dropped Weapons expiration
      this.updateHealthPacks(room, now);
      this.updateDroppedWeapons(room, now);

      // Owner-only `selfState` reconciliation: immediate on state change, or periodic (~8.3 Hz)
      for (const p of room.players.values()) {
        if (
          this._selfStateSignature(p) !== p._selfStateSig ||
          now - (p.lastSelfStateAt || 0) >= SELF_STATE_INTERVAL_MS
        ) {
          this.sendSelfState(p, now, false);
        }
      }

      // Broadcast compact state snapshot (use volatile on Socket.IO to prevent TCP bufferbloat)
      room.stateSeq = ((room.stateSeq || 0) + 1) | 0;
      const roomTarget = this.io.to(room.code);
      const emitter = roomTarget.volatile || roomTarget;
      emitter.emit('stateUpdate', {
        seq: room.stateSeq,
        t: stateStampMs,
        timeRemaining,
        pickups: room.pickups,
        droppedWeapons: room.droppedWeapons,
        activeGrenades: this.serializeGrenades(room),
        players: this.serializePlayers(room)
      });
    }
  }

  getPublicRoomsSummary() {
    const list = [];
    for (const room of this.rooms.values()) {
      const humans = this.getHumanCount(room);
      const mapCfg = getMapConfig(room.mapId);
      list.push({
        code: room.code,
        isPublic: room.isPublic,
        mapId: room.mapId,
        mapName: mapCfg.name,
        humans,
        total: humans,
        maxPlayers: MATCH_CONFIG.MAX_PLAYERS,
        state: room.state,
        timeRemaining: Math.max(0, Math.ceil((room.matchEndsAt - Date.now()) / 1000))
      });
    }
    return list;
  }
}
