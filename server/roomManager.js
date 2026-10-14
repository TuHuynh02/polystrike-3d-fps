import {
  DEFAULT_MAP_ID,
  MAPS,
  MATCH_CONFIG,
  PLAYER_COLORS,
  WEAPONS,
  getMapConfig,
  hasLineOfSight,
  isPointClearOfObstacles
} from '../shared/constants.js';
import { createBotEntity, updateRoomBots } from './botAI.js';

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

    // 25Hz simulation and state broadcast loop
    this.tickInterval = setInterval(() => this.tick(), 40);
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

  createRoom(code, isPublic = true, desiredBots = MATCH_CONFIG.DEFAULT_BOTS, mapId = DEFAULT_MAP_ID) {
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
      desiredBots: Math.max(0, Math.min(MATCH_CONFIG.MAX_BOTS, Number(desiredBots) || 0)),
      players: new Map(),
      pickups: this.createPickupsForMap(cleanMapId),
      recentSpawns: []
    };

    this.rooms.set(roomCode, room);
    this.syncRoomBots(room);
    return room;
  }

  findOrCreatePublicRoom(desiredBots = MATCH_CONFIG.DEFAULT_BOTS, preferredMapId = null) {
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
    return this.createRoom(defaultCode, true, desiredBots, cleanMapId || DEFAULT_MAP_ID);
  }

  getOrCreateRoomByCode(rawCode, isPublic = false, desiredBots = MATCH_CONFIG.DEFAULT_BOTS, mapId = DEFAULT_MAP_ID) {
    const code = sanitizeRoomCode(rawCode);
    if (code && this.rooms.has(code)) {
      return this.rooms.get(code);
    }
    return this.createRoom(code || generateRoomCode(this.rooms), isPublic, desiredBots, mapId);
  }

  getHumanCount(room) {
    let count = 0;
    for (const p of room.players.values()) {
      if (!p.isBot) count++;
    }
    return count;
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
    const jitterX = Number((baseSp.x + Math.cos(jitterAngle) * jitterRadius).toFixed(2));
    const jitterZ = Number((baseSp.z + Math.sin(jitterAngle) * jitterRadius).toFixed(2));

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
            const tx = Number((cand.x + Math.cos(ang) * rad).toFixed(2));
            const tz = Number((cand.z + Math.sin(ang) * rad).toFixed(2));
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

  syncRoomBots(room) {
    const humans = [];
    const bots = [];
    for (const p of room.players.values()) {
      if (p.isBot) bots.push(p);
      else humans.push(p);
    }

    // If no humans remain in the room, do not keep bots running
    if (humans.length === 0) {
      for (const b of bots) {
        room.players.delete(b.id);
      }
      return;
    }

    const mapCfg = getMapConfig(room.mapId);
    const maxAllowedBots = Math.max(0, MATCH_CONFIG.MAX_PLAYERS - humans.length);
    const targetBotCount = Math.min(room.desiredBots, maxAllowedBots);

    // Add bots if needed
    while (bots.length < targetBotCount) {
      const idx = bots.length;
      const sp = this.pickSafeSpawnPoint(room);
      const bot = createBotEntity(idx, sp, mapCfg);
      room.players.set(bot.id, bot);
      bots.push(bot);
    }

    // Remove excess bots if needed
    while (bots.length > targetBotCount) {
      const removed = bots.pop();
      if (removed) {
        room.players.delete(removed.id);
      }
    }
  }

  addHumanPlayer(socket, { name, roomCode, mode, botCount, weapon, loadout, mapId }) {
    const cleanName = sanitizeName(name);
    const requestedCode = sanitizeRoomCode(roomCode);
    const cleanLoadout = sanitizeLoadout(loadout, weapon);
    const initialWeapon = WEAPONS[weapon] ? weapon : cleanLoadout.primary;
    const cleanMapId = sanitizeMapId(mapId);
    const hasBotPref = typeof botCount === 'number' && !Number.isNaN(botCount);
    const desiredBots = hasBotPref
      ? Math.max(0, Math.min(MATCH_CONFIG.MAX_BOTS, Math.floor(botCount)))
      : MATCH_CONFIG.DEFAULT_BOTS;

    let room;
    if (requestedCode) {
      room = this.getOrCreateRoomByCode(requestedCode, mode === 'public', desiredBots, cleanMapId);
    } else if (mode === 'private') {
      room = this.createRoom(generateRoomCode(this.rooms), false, desiredBots, cleanMapId);
    } else {
      room = this.findOrCreatePublicRoom(desiredBots, cleanMapId);
    }

    // Check human capacity
    if (this.getHumanCount(room) >= MATCH_CONFIG.MAX_PLAYERS) {
      return { error: 'Phòng này đã đủ 12 người chơi thật! Vui lòng tạo phòng mới hoặc vào phòng chung.' };
    }

    // Update bot count & map if this player is the first human in the room
    if (this.getHumanCount(room) === 0) {
      if (hasBotPref) {
        room.desiredBots = desiredBots;
      }
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
      isBot: false,
      color: PLAYER_COLORS[colorIdx],
      x: spawn.x,
      y: spawn.y || 0,
      z: spawn.z,
      yaw: spawn.yaw || 0,
      pitch: 0,
      crouching: false,
      loadout: cleanLoadout,
      weapon: initialWeapon,
      ammoByWeapon: createInitialAmmoMap(),
      ammo: weaponCfg.magSize,
      hp: MATCH_CONFIG.MAX_HP,
      alive: true,
      kills: 0,
      deaths: 0,
      streak: 0,
      lastShotAt: 0,
      reloadingUntil: 0,
      reloadStartedAt: 0,
      reloadWeapon: null,
      nextShellAt: 0,
      respawnAt: 0,
      invulnerableUntil: now + protectionMs,
      lastDeathX: null,
      lastDeathZ: null
    };

    room.players.set(socket.id, player);
    this.syncRoomBots(room);

    return { room, player };
  }

  handleUpdateLoadout(room, player, payload = {}) {
    if (!room || !player || player.isBot) return null;
    const nextLoadout = sanitizeLoadout(payload, player.loadout?.primary || 'rifle');
    player.loadout = nextLoadout;

    if (!player.ammoByWeapon) {
      player.ammoByWeapon = createInitialAmmoMap();
    } else {
      player.ammoByWeapon[nextLoadout.primary] = WEAPONS[nextLoadout.primary].magSize;
      player.ammoByWeapon[nextLoadout.secondary] = WEAPONS[nextLoadout.secondary].magSize;
      player.ammoByWeapon.knife = 1;
    }

    if (!player.alive) {
      player.weapon = nextLoadout.primary;
      player.ammo = WEAPONS[nextLoadout.primary].magSize;
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
    }

    return player.loadout;
  }

  changeRoomMap(room, rawMapId) {
    if (!room) return;
    const nextMapId = sanitizeMapId(rawMapId);
    if (room.mapId === nextMapId) return;

    room.mapId = nextMapId;
    room.pickups = this.createPickupsForMap(nextMapId);
    room.recentSpawns = [];

    // Mark all players not yet placed so sequential respawn assigns distinct safe points
    for (const p of room.players.values()) {
      p.alive = false;
    }

    // Respawn all players and bots on the new map's spawn points
    const mapCfg = getMapConfig(nextMapId);
    for (const p of room.players.values()) {
      if (p.isBot) {
        p.waypointIdx = Math.floor(Math.random() * mapCfg.botWaypoints.length);
      }
      this.respawnPlayer(room, p);
    }

    this.io.to(room.code).emit('mapChanged', {
      mapId: room.mapId,
      mapName: mapCfg.name,
      pickups: room.pickups,
      players: this.serializePlayers(room)
    });
  }

  removePlayer(socketId) {
    for (const [code, room] of this.rooms.entries()) {
      if (room.players.has(socketId)) {
        const leaving = room.players.get(socketId);
        room.players.delete(socketId);
        this.io.to(code).emit('playerLeft', {
          playerId: socketId,
          name: leaving?.name || 'Player'
        });

        this.syncRoomBots(room);

        if (this.getHumanCount(room) === 0) {
          this.rooms.delete(code);
        }
        return;
      }
    }
  }

  syncPlayerReloadState(player, now = Date.now()) {
    if (!player || !player.reloadingUntil) return;

    const wId = player.reloadWeapon || player.weapon;
    const cfg = WEAPONS[wId] || WEAPONS.rifle;

    if (cfg.shellByShell) {
      // Advance shell-by-shell insertion for shotgun
      const shellMs = cfg.shellReloadMs || 390;
      while (player.nextShellAt > 0 && now >= player.nextShellAt - 45) {
        const cur = player.ammoByWeapon?.[wId] ?? player.ammo;
        const nextAmmo = Math.min(cfg.magSize, cur + 1);
        if (player.ammoByWeapon) {
          player.ammoByWeapon[wId] = nextAmmo;
        }
        if (player.weapon === wId) {
          player.ammo = nextAmmo;
        }
        if (nextAmmo >= cfg.magSize) {
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
      // Magazine reload completes when timer finishes (with 120ms network jitter tolerance)
      if (now >= player.reloadingUntil - 120) {
        player.reloadingUntil = 0;
        player.reloadWeapon = null;
        if (player.ammoByWeapon) {
          player.ammoByWeapon[wId] = cfg.magSize;
        }
        if (player.weapon === wId) {
          player.ammo = cfg.magSize;
        }
      }
    }
  }

  handlePlayerMove(room, player, payload) {
    if (!room || !player || !player.alive || room.state !== 'PLAYING') return;

    const now = Date.now();
    this.syncPlayerReloadState(player, now);

    const mapCfg = getMapConfig(room.mapId);
    const limit = (mapCfg.arenaHalfSize || MATCH_CONFIG.ARENA_HALF_SIZE) - 0.4;
    if (typeof payload.x === 'number' && Number.isFinite(payload.x)) {
      player.x = Math.max(-limit, Math.min(limit, payload.x));
    }
    if (typeof payload.y === 'number' && Number.isFinite(payload.y)) {
      player.y = Math.max(-2, Math.min(18, payload.y));
    }
    if (typeof payload.z === 'number' && Number.isFinite(payload.z)) {
      player.z = Math.max(-limit, Math.min(limit, payload.z));
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
    if (typeof payload.weapon === 'string' && WEAPONS[payload.weapon] && payload.weapon !== player.weapon) {
      // Cancel incomplete reload without granting free full magazine
      player.weapon = payload.weapon;
      player.reloadingUntil = 0;
      player.reloadWeapon = null;
      player.nextShellAt = 0;
      player.ammo = player.ammoByWeapon[payload.weapon] ?? WEAPONS[payload.weapon].magSize;
    }
  }

  handleReload(room, player, weaponId) {
    if (!room || !player || !player.alive || room.state !== 'PLAYING') return;
    const wId = WEAPONS[weaponId] ? weaponId : player.weapon;
    const cfg = WEAPONS[wId];
    if (!cfg || cfg.isMelee || cfg.infiniteAmmo) return;
    const now = Date.now();

    this.syncPlayerReloadState(player, now);
    if (player.reloadingUntil > now) return;

    const currentAmmo = player.ammoByWeapon?.[wId] ?? player.ammo;
    if (currentAmmo >= cfg.magSize) return;

    player.reloadStartedAt = now;
    player.reloadWeapon = wId;

    if (cfg.shellByShell) {
      const missing = Math.max(1, cfg.magSize - currentAmmo);
      const startDelay = cfg.shellReloadStartMs || 240;
      const shellMs = cfg.shellReloadMs || 390;
      player.nextShellAt = now + startDelay + shellMs;
      player.reloadingUntil = now + startDelay + missing * shellMs;
    } else {
      const reloadDuration = currentAmmo > 0 ? (cfg.tacticalReloadMs || cfg.reloadMs) : cfg.reloadMs;
      player.nextShellAt = 0;
      player.reloadingUntil = now + reloadDuration;
    }
  }

  handleShoot(room, shooter, payload) {
    if (!room || !shooter || !shooter.alive || room.state !== 'PLAYING') return;

    const now = Date.now();
    this.syncPlayerReloadState(shooter, now);

    const weaponId = WEAPONS[payload?.weapon] ? payload.weapon : shooter.weapon;
    const weaponCfg = WEAPONS[weaponId];
    if (weaponId !== shooter.weapon) {
      shooter.weapon = weaponId;
      shooter.reloadingUntil = 0;
      shooter.reloadWeapon = null;
      shooter.nextShellAt = 0;
      shooter.ammo = shooter.ammoByWeapon?.[weaponId] ?? weaponCfg.magSize;
    }

    // Rate limit check (allow 18% network jitter tolerance)
    if (now - shooter.lastShotAt < weaponCfg.fireRateMs * 0.82) {
      return;
    }

    if (!weaponCfg.isMelee && !weaponCfg.infiniteAmmo) {
      // Handle active reload state
      if (shooter.reloadingUntil > now) {
        if (weaponCfg.shellByShell && shooter.ammo > 0) {
          // Interrupt shotgun shell-by-shell reload to fire immediately with loaded shells
          shooter.reloadingUntil = 0;
          shooter.reloadWeapon = null;
          shooter.nextShellAt = 0;
        } else {
          return;
        }
      }

      if (shooter.ammo <= 0) {
        this.handleReload(room, shooter, weaponId);
        return;
      }

      shooter.ammo = Math.max(0, shooter.ammo - 1);
      if (shooter.ammoByWeapon) {
        shooter.ammoByWeapon[weaponId] = shooter.ammo;
      }
    } else {
      shooter.ammo = 1;
    }

    shooter.lastShotAt = now;

    const origin = payload?.origin && typeof payload.origin.x === 'number'
      ? payload.origin
      : { x: shooter.x, y: shooter.y + 1.5, z: shooter.z };

    const dir = payload?.dir && typeof payload.dir.x === 'number'
      ? payload.dir
      : {
          x: -Math.sin(shooter.yaw) * Math.cos(shooter.pitch),
          y: Math.sin(shooter.pitch),
          z: -Math.cos(shooter.yaw) * Math.cos(shooter.pitch)
        };

    // Broadcast visual/audio shot event to everyone in the room
    this.io.to(room.code).emit('shotFired', {
      shooterId: shooter.id,
      weapon: weaponId,
      origin,
      dir,
      hitPoint: payload?.hitPoint || null
    });

    // Support both single hit (`targetId`) and multi-pellet hits (`hits: [{ targetId, isHeadshot }]`)
    const hitClaims = Array.isArray(payload?.hits)
      ? payload.hits.slice(0, weaponCfg.pellets)
      : payload?.targetId
        ? [{ targetId: payload.targetId, isHeadshot: Boolean(payload.isHeadshot) }]
        : [];

    if (hitClaims.length === 0) return;

    const mapCfg = getMapConfig(room.mapId);
    const obstacles = mapCfg.obstacles;

    // Aggregate damage per target across pellets
    const damageMap = new Map();
    const blockedShieldTargets = new Set();
    for (const claim of hitClaims) {
      if (!claim || !claim.targetId || claim.targetId === shooter.id) continue;
      const target = room.players.get(claim.targetId);
      if (!target || !target.alive) continue;

      // Block damage if target has active 1.5s spawn protection
      if (target.invulnerableUntil && now < target.invulnerableUntil) {
        blockedShieldTargets.add(target.id);
        continue;
      }

      const dist = Math.hypot(target.x - shooter.x, target.y - shooter.y, target.z - shooter.z);
      const maxRange = weaponCfg.isMelee ? weaponCfg.range * 1.45 : weaponCfg.range * 1.15;
      if (dist > maxRange) continue;

      // Verify line of sight against active map obstacles (supports crouch/slide eye height and peek tolerance)
      const eyeH = shooter.crouching ? 1.0 : 1.55;
      const shooterEye = { x: shooter.x, y: shooter.y + eyeH, z: shooter.z };
      const targetPoint = { x: target.x, y: target.y + (claim.isHeadshot ? 1.55 : 1.05), z: target.z };
      let losOk = hasLineOfSight(shooterEye, targetPoint, obstacles);
      if (!losOk && payload?.origin && typeof payload.origin.x === 'number') {
        const originOffset = Math.hypot(
          payload.origin.x - shooter.x,
          payload.origin.y - (shooter.y + eyeH),
          payload.origin.z - shooter.z
        );
        if (originOffset <= 1.35) {
          losOk = hasLineOfSight(payload.origin, targetPoint, obstacles);
        }
      }
      if (!losOk && dist > 4.0) {
        continue;
      }

      // Apply distance falloff for shotgun beyond 16m so close-range combat is punchy and balanced
      let falloffMult = 1.0;
      if (weaponId === 'shotgun' && dist > 16) {
        falloffMult = Math.max(0.42, 1 - (dist - 16) / 50);
      }

      const pelletDmg = Math.max(
        1,
        Math.round(weaponCfg.damage * falloffMult * (claim.isHeadshot ? weaponCfg.headshotMult : 1))
      );
      const prev = damageMap.get(target.id) || { totalDamage: 0, anyHeadshot: false };
      prev.totalDamage += pelletDmg;
      prev.anyHeadshot = prev.anyHeadshot || Boolean(claim.isHeadshot);
      damageMap.set(target.id, prev);
    }

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

  handlePlayerKilled(room, killer, victim, weaponId, isHeadshot) {
    victim.alive = false;
    victim.hp = 0;
    victim.deaths += 1;
    victim.streak = 0;
    victim.reloadingUntil = 0;
    victim.reloadWeapon = null;
    victim.nextShellAt = 0;
    victim.invulnerableUntil = 0;
    victim.lastDeathX = victim.x;
    victim.lastDeathZ = victim.z;
    victim.respawnAt = Date.now() + MATCH_CONFIG.RESPAWN_DELAY_MS;

    if (killer && killer.id !== victim.id) {
      killer.kills += 1;
      killer.streak += 1;
    }

    this.io.to(room.code).emit('killEvent', {
      killerId: killer ? killer.id : null,
      killerName: killer ? killer.name : 'Arena',
      killerColor: killer ? killer.color : 0xffffff,
      victimId: victim.id,
      victimName: victim.name,
      victimColor: victim.color,
      weapon: WEAPONS[weaponId]?.name || weaponId.toUpperCase(),
      weaponId,
      isHeadshot: Boolean(isHeadshot),
      killerStreak: killer ? killer.streak : 0
    });

    // Check win condition (20 kills)
    if (killer && killer.kills >= MATCH_CONFIG.KILL_LIMIT && room.state === 'PLAYING') {
      this.endMatch(room, killer);
    }
  }

  respawnPlayer(room, player) {
    const now = Date.now();
    const protectionMs = MATCH_CONFIG.SPAWN_PROTECTION_MS || 1500;
    const sp = this.pickSafeSpawnPoint(room, player.id);
    if (!player.isBot && player.loadout?.primary && WEAPONS[player.loadout.primary]) {
      player.weapon = player.loadout.primary;
    }
    const wCfg = WEAPONS[player.weapon] || WEAPONS.rifle;
    player.x = sp.x;
    player.y = sp.y || 0;
    player.z = sp.z;
    player.yaw = sp.yaw || 0;
    player.pitch = 0;
    player.hp = MATCH_CONFIG.MAX_HP;
    player.alive = true;
    player.reloadingUntil = 0;
    player.reloadWeapon = null;
    player.nextShellAt = 0;
    player.respawnAt = 0;
    player.invulnerableUntil = now + protectionMs;
    player.ammo = wCfg.magSize;
    if (player.ammoByWeapon) {
      player.ammoByWeapon = createInitialAmmoMap();
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
      invulnerable: true,
      invulnerableUntil: player.invulnerableUntil,
      spawnProtectionMs: protectionMs
    });
  }

  updateHealthPacks(room, now) {
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

      // Check if any injured alive player/bot walks over the health pack
      for (const player of room.players.values()) {
        if (!player.alive || player.hp >= MATCH_CONFIG.MAX_HP) continue;
        const dist = Math.hypot(player.x - pack.x, player.z - pack.z);
        if (dist <= 1.85 && Math.abs(player.y - pack.y) <= 1.85) {
          pack.active = false;
          pack.respawnAt = now + MATCH_CONFIG.HEALTH_PACK_RESPAWN_MS;
          player.hp = Math.min(MATCH_CONFIG.MAX_HP, player.hp + MATCH_CONFIG.HEALTH_PACK_HEAL);

          this.io.to(room.code).emit('pickupState', {
            pickupId: pack.id,
            active: false,
            pickerId: player.id,
            newHp: player.hp
          });
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
        isBot: p.isBot,
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

    // Reset all player/bot scores and respawn
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
      players: this.serializePlayers(room)
    });
  }

  serializePlayers(room) {
    const now = Date.now();
    const list = [];
    for (const p of room.players.values()) {
      const invulnerable = Boolean(p.alive && p.invulnerableUntil && now < p.invulnerableUntil);
      list.push({
        id: p.id,
        name: p.name,
        isBot: p.isBot,
        color: p.color,
        x: Number(p.x.toFixed(2)),
        y: Number(p.y.toFixed(2)),
        z: Number(p.z.toFixed(2)),
        yaw: Number(p.yaw.toFixed(3)),
        pitch: Number(p.pitch.toFixed(3)),
        crouching: p.crouching,
        weapon: p.weapon,
        hp: p.hp,
        alive: p.alive,
        invulnerable,
        invulnerableUntil: invulnerable ? p.invulnerableUntil : 0,
        kills: p.kills,
        deaths: p.deaths,
        streak: p.streak
      });
    }
    return list;
  }

  tick() {
    const now = Date.now();
    const dt = Math.min(0.1, (now - this.lastTickAt) / 1000);
    this.lastTickAt = now;

    for (const room of this.rooms.values()) {
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
        if (!p.isBot) {
          if (!p.alive && now >= p.respawnAt) {
            this.respawnPlayer(room, p);
          } else if (p.alive && p.reloadingUntil) {
            this.syncPlayerReloadState(p, now);
          }
        }
      }

      // Update Bot AI movement & shooting
      updateRoomBots(room, dt, now, {
        onRespawnPlayer: (bot) => this.respawnPlayer(room, bot),
        onBotShoot: (bot, shotPayload) => this.handleShoot(room, bot, shotPayload)
      });

      // Update Health Pack pickups & respawns
      this.updateHealthPacks(room, now);

      // Broadcast compact state snapshot
      this.io.to(room.code).emit('stateUpdate', {
        timeRemaining,
        players: this.serializePlayers(room)
      });
    }
  }

  getPublicRoomsSummary() {
    const list = [];
    for (const room of this.rooms.values()) {
      const humans = this.getHumanCount(room);
      const total = room.players.size;
      const mapCfg = getMapConfig(room.mapId);
      list.push({
        code: room.code,
        isPublic: room.isPublic,
        mapId: room.mapId,
        mapName: mapCfg.name,
        humans,
        bots: total - humans,
        total,
        maxPlayers: MATCH_CONFIG.MAX_PLAYERS,
        state: room.state,
        timeRemaining: Math.max(0, Math.ceil((room.matchEndsAt - Date.now()) / 1000))
      });
    }
    return list;
  }
}
