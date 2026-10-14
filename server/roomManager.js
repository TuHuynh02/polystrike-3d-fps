import {
  DEFAULT_MAP_ID,
  MAPS,
  MATCH_CONFIG,
  PLAYER_COLORS,
  WEAPONS,
  computeDistanceFalloff,
  getMapConfig,
  hasLineOfSight,
  isPointClearOfObstacles
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
      droppedWeapons: [],
      grenades: [],
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
      recordPlayerSnapshot(bot);
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
      vx: 0,
      vy: 0,
      vz: 0,
      lastMoveAt: now,
      lastMoveSeq: 0,
      yaw: spawn.yaw || 0,
      pitch: 0,
      crouching: false,
      prone: false,
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
      lastDeathZ: null
    };

    recordPlayerSnapshot(player, now);
    room.players.set(socket.id, player);
    this.syncRoomBots(room);
    recordRoomSnapshots(room, now);

    return { room, player };
  }

  handleUpdateLoadout(room, player, payload = {}) {
    if (!room || !player || player.isBot) return null;
    const nextLoadout = sanitizeLoadout(payload, player.loadout?.primary || 'rifle');
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
      droppedWeapons: room.droppedWeapons,
      activeGrenades: room.grenades,
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
  }

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
    if (typeof payload.lean === 'number' && Number.isFinite(payload.lean)) {
      player.lean = Math.max(-1, Math.min(1, payload.lean));
    }
    if (typeof payload.weapon === 'string' && WEAPONS[payload.weapon] && payload.weapon !== player.weapon) {
      // Cancel incomplete reload without granting free full magazine
      player.weapon = payload.weapon;
      player.reloadingUntil = 0;
      player.reloadWeapon = null;
      player.nextShellAt = 0;
      player.ammo = player.ammoByWeapon?.[payload.weapon] ?? WEAPONS[payload.weapon].magSize;
      player.reserveAmmo = player.reserveAmmoByWeapon?.[payload.weapon] ?? (WEAPONS[payload.weapon].reserveAmmo ?? 0);
    }

    const snapTs = typeof payload.timestamp === 'number' && Number.isFinite(payload.timestamp)
      ? payload.timestamp
      : now;
    recordPlayerSnapshot(player, snapTs);
  }

  handleReload(room, player, weaponId) {
    if (!room || !player || !player.alive || room.state !== 'PLAYING') return;
    const wId = WEAPONS[weaponId] ? weaponId : player.weapon;
    const cfg = WEAPONS[wId];
    if (!cfg || cfg.isMelee || cfg.infiniteAmmo) return;
    const now = Date.now();

    this.syncPlayerReloadState(player, now);
    if (player.reloadingUntil > now) return;

    const currentAmmo = player.ammoByWeapon?.[wId] ?? player.ammo ?? 0;
    const currentReserve = player.reserveAmmoByWeapon?.[wId] ?? (player.weapon === wId ? player.reserveAmmo : cfg.reserveAmmo) ?? 0;
    if (currentAmmo >= cfg.magSize || currentReserve <= 0) return;

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
      shooter.reserveAmmo = shooter.reserveAmmoByWeapon?.[weaponId] ?? (weaponCfg.reserveAmmo ?? 0);
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
        const curRes = shooter.reserveAmmoByWeapon?.[weaponId] ?? shooter.reserveAmmo ?? 0;
        if (curRes > 0) {
          this.handleReload(room, shooter, weaponId);
        }
        return;
      }

      shooter.ammo = Math.max(0, shooter.ammo - 1);
      if (shooter.ammoByWeapon) {
        shooter.ammoByWeapon[weaponId] = shooter.ammo;
      }
      shooter.reserveAmmo = shooter.reserveAmmoByWeapon?.[weaponId] ?? shooter.reserveAmmo ?? 0;
    } else {
      shooter.ammo = 1;
      shooter.reserveAmmo = 0;
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

    const mapCfg = getMapConfig(room.mapId);
    const obstacles = mapCfg.obstacles;
    const maxRange = weaponCfg.isMelee ? weaponCfg.range * 1.45 : weaponCfg.range * 1.15;

    // Rewind enemy hitboxes for lag compensation (clamped to max 250ms) and guarantee restoration
    const rewindMs = resolveShotRewindMs(shooter, payload, now);
    const savedStates = rewindRoomPlayersForShot(room, shooter.id, rewindMs, now);

    const damageMap = new Map();
    const blockedShieldTargets = new Set();

    try {
      // Support single hit (`targetId`), multi-pellet hits (`hits: [...]`), or server-side raycast when no hit claims array is given
      let hitClaims = Array.isArray(payload?.hits)
        ? payload.hits.slice(0, weaponCfg.pellets)
        : payload?.targetId
          ? [{
              targetId: payload.targetId,
              isHeadshot: Boolean(payload.isHeadshot),
              isLegshot: Boolean(payload.isLegshot)
            }]
          : [];

      if (
        hitClaims.length === 0 &&
        !shooter.isBot &&
        payload?.dir &&
        typeof payload.dir.x === 'number' &&
        (rewindMs > 0 || (!Array.isArray(payload?.hits) && payload?.targetId === undefined))
      ) {
        let bestTarget = null;
        let bestHit = null;
        for (const candidate of room.players.values()) {
          if (!candidate || !candidate.alive || candidate.id === shooter.id) continue;
          const hit = raycastPlayerHitbox(origin, dir, candidate, maxRange, 0.25);
          if (hit && (!bestHit || hit.distance < bestHit.distance)) {
            bestTarget = candidate;
            bestHit = hit;
          }
        }
        if (bestTarget && bestHit) {
          hitClaims = [{
            targetId: bestTarget.id,
            isHeadshot: Boolean(payload?.isHeadshot ?? bestHit.isHeadshot),
            isLegshot: Boolean(payload?.isLegshot ?? bestHit.isLegshot)
          }];
        }
      }

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
        if (dist > maxRange) continue;

        // If explicit ray direction is provided, verify target's (rewound) hitbox is within spread/hitbox cone of the ray
        if (
          !shooter.isBot &&
          !weaponCfg.isMelee &&
          payload?.dir &&
          typeof payload.dir.x === 'number'
        ) {
          const rayPad = Math.max(1.35, dist * (weaponCfg.pellets > 1 ? 0.28 : 0.18));
          let rayHit = raycastPlayerHitbox(origin, dir, target, maxRange, rayPad);
          if (!rayHit && (target.crouching || target.crouch || target.prone) && Math.abs(dir.y || 0) < 0.08) {
            rayHit = raycastPlayerHitbox(
              origin,
              dir,
              { ...target, crouching: false, crouch: false, prone: false },
              maxRange,
              rayPad
            );
          }
          if (!rayHit) continue;
        }

        // Verify line of sight against active map obstacles (supports prone/crouch/slide eye height and Q/E lean peek tolerance)
        const eyeH = shooter.prone ? 0.46 : shooter.crouching ? 1.0 : 1.55;
        const leanVal = (shooter.lean || 0) * (MATCH_CONFIG.LEAN_OFFSET || 0.42);
        const rightX = Math.cos(shooter.yaw || 0);
        const rightZ = -Math.sin(shooter.yaw || 0);
        const shooterEye = {
          x: shooter.x + rightX * leanVal,
          y: shooter.y + eyeH,
          z: shooter.z + rightZ * leanVal
        };
        const targetEyeH = target.prone ? 0.46 : target.crouching ? 1.0 : 1.55;
        const targetPoint = {
          x: target.x,
          y: target.y + (claim.isHeadshot ? targetEyeH : target.prone ? 0.32 : 1.05),
          z: target.z
        };
        let losOk = hasLineOfSight(shooterEye, targetPoint, obstacles);
        if (!losOk && payload?.origin && typeof payload.origin.x === 'number') {
          const originOffset = Math.hypot(
            payload.origin.x - shooter.x,
            payload.origin.y - (shooter.y + eyeH),
            payload.origin.z - shooter.z
          );
          if (originOffset <= 1.65) {
            losOk = hasLineOfSight(payload.origin, targetPoint, obstacles);
          }
        }
        if (!losOk && dist > 4.0) {
          continue;
        }

        // Apply per-weapon distance damage falloff (SMGs & Shotguns drop sharply at mid/long range while ARs/Snipers hold power)
        const falloffMult = computeDistanceFalloff(weaponCfg, dist);

        const hitZoneMult = claim.isHeadshot
          ? weaponCfg.headshotMult
          : claim.isLegshot
            ? 0.78
            : 1.0;

        const pelletDmg = Math.max(
          1,
          Math.round(weaponCfg.damage * falloffMult * hitZoneMult)
        );
        const prev = damageMap.get(target.id) || { totalDamage: 0, anyHeadshot: false };
        prev.totalDamage += pelletDmg;
        prev.anyHeadshot = prev.anyHeadshot || Boolean(claim.isHeadshot);
        damageMap.set(target.id, prev);
      }
    } finally {
      restoreRewoundPlayers(savedStates);
    }

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
      x: Number((dropData.x || 0).toFixed(2)),
      y: Number((dropData.y || 0).toFixed(2)),
      z: Number((dropData.z || 0).toFixed(2)),
      yaw: Number((dropData.yaw || 0).toFixed(2)),
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
      for (let j = 0; j < obstacles.length; j++) {
        const box = obstacles[j];
        const minX = (box.minX !== undefined ? box.minX : box.x - box.w * 0.5) - radius;
        const maxX = (box.maxX !== undefined ? box.maxX : box.x + box.w * 0.5) + radius;
        const minY = (box.minY !== undefined ? box.minY : box.y - box.h * 0.5) - radius;
        const maxY = (box.maxY !== undefined ? box.maxY : box.y + box.h * 0.5) + radius;
        const minZ = (box.minZ !== undefined ? box.minZ : box.z - box.d * 0.5) - radius;
        const maxZ = (box.maxZ !== undefined ? box.maxZ : box.z + box.d * 0.5) + radius;
        if (
          startX >= minX && startX <= maxX &&
          startY >= minY && startY <= maxY &&
          startZ >= minZ && startZ <= maxZ
        ) {
          blockedAtStart = true;
          break;
        }
      }
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
      x: Number(startX.toFixed(2)),
      y: Number(startY.toFixed(2)),
      z: Number(startZ.toFixed(2)),
      vx: Number(vx.toFixed(2)),
      vy: Number(vy.toFixed(2)),
      vz: Number(vz.toFixed(2)),
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
    const obstacles = mapCfg.obstacles || [];
    const arenaLimit = (mapCfg.arenaHalfSize || MATCH_CONFIG.ARENA_HALF_SIZE) - 0.25;
    const gravity = MATCH_CONFIG.GRAVITY || 22.0;
    const restitution = 0.45;
    const floorY = 0.18;
    const radius = 0.18;

    const totalDt = Math.min(3.0, Math.max(0, Number(dt) || 0));
    const steps = Math.max(1, Math.min(60, Math.ceil(totalDt / 0.02)));
    const stepDt = totalDt / steps;

    const remaining = [];
    const toDetonate = [];

    for (let i = 0; i < room.grenades.length; i++) {
      const g = room.grenades[i];
      if (!g) continue;

      for (let s = 0; s < steps; s++) {
        const prevX = g.x;
        const prevY = g.y;
        const prevZ = g.z;
        g.vy -= gravity * stepDt;
        g.x += g.vx * stepDt;
        g.y += g.vy * stepDt;
        g.z += g.vz * stepDt;

        // Arena outer wall bounce
        if (g.x > arenaLimit) {
          g.x = arenaLimit;
          g.vx = -Math.abs(g.vx) * restitution;
          g.vz *= 0.85;
        } else if (g.x < -arenaLimit) {
          g.x = -arenaLimit;
          g.vx = Math.abs(g.vx) * restitution;
          g.vz *= 0.85;
        }

        if (g.z > arenaLimit) {
          g.z = arenaLimit;
          g.vz = -Math.abs(g.vz) * restitution;
          g.vx *= 0.85;
        } else if (g.z < -arenaLimit) {
          g.z = -arenaLimit;
          g.vz = Math.abs(g.vz) * restitution;
          g.vx *= 0.85;
        }

        // Obstacle AABB bounce with damping (restitution ~0.45)
        for (let j = 0; j < obstacles.length; j++) {
          const box = obstacles[j];
          const minX = (box.minX !== undefined ? box.minX : box.x - box.w * 0.5) - radius;
          const maxX = (box.maxX !== undefined ? box.maxX : box.x + box.w * 0.5) + radius;
          if (g.x < minX || g.x > maxX) continue;

          const minZ = (box.minZ !== undefined ? box.minZ : box.z - box.d * 0.5) - radius;
          const maxZ = (box.maxZ !== undefined ? box.maxZ : box.z + box.d * 0.5) + radius;
          if (g.z < minZ || g.z > maxZ) continue;

          const minY = (box.minY !== undefined ? box.minY : box.y - box.h * 0.5) - radius;
          const maxY = (box.maxY !== undefined ? box.maxY : box.y + box.h * 0.5) + radius;
          if (g.y < minY || g.y > maxY) continue;

          const wasHorizInside =
            prevX > minX + 0.02 && prevX < maxX - 0.02 &&
            prevZ > minZ + 0.02 && prevZ < maxZ - 0.02;

          if (wasHorizInside && prevY >= maxY - 0.06 && g.vy <= 0) {
            g.y = maxY;
            if (g.vy < -1.1) {
              g.vy = -g.vy * restitution;
              g.vx *= 0.78;
              g.vz *= 0.78;
            } else {
              g.vy = 0;
              const topFriction = Math.max(0, 1 - 5.5 * stepDt);
              g.vx *= topFriction;
              g.vz *= topFriction;
            }
          } else if (wasHorizInside && prevY <= minY + 0.06 && g.vy > 0) {
            g.y = minY;
            g.vy = -Math.abs(g.vy) * restitution;
          } else if (prevX <= minX + 0.03 && g.vx > 0) {
            g.x = minX;
            g.vx = -Math.abs(g.vx) * restitution;
            g.vz *= 0.82;
          } else if (prevX >= maxX - 0.03 && g.vx < 0) {
            g.x = maxX;
            g.vx = Math.abs(g.vx) * restitution;
            g.vz *= 0.82;
          } else if (prevZ <= minZ + 0.03 && g.vz > 0) {
            g.z = minZ;
            g.vz = -Math.abs(g.vz) * restitution;
            g.vx *= 0.82;
          } else if (prevZ >= maxZ - 0.03 && g.vz < 0) {
            g.z = maxZ;
            g.vz = Math.abs(g.vz) * restitution;
            g.vx *= 0.82;
          } else {
            const penLeft = Math.abs(g.x - minX);
            const penRight = Math.abs(maxX - g.x);
            const penFront = Math.abs(g.z - minZ);
            const penBack = Math.abs(maxZ - g.z);
            const minPen = Math.min(penLeft, penRight, penFront, penBack);

            if (minPen === penLeft) {
              g.x = minX;
              g.vx = -Math.abs(g.vx) * restitution;
              g.vz *= 0.82;
            } else if (minPen === penRight) {
              g.x = maxX;
              g.vx = Math.abs(g.vx) * restitution;
              g.vz *= 0.82;
            } else if (minPen === penFront) {
              g.z = minZ;
              g.vz = -Math.abs(g.vz) * restitution;
              g.vx *= 0.82;
            } else {
              g.z = maxZ;
              g.vz = Math.abs(g.vz) * restitution;
              g.vx *= 0.82;
            }
          }
        }

        // Floor bounce (y = 0.18) & rolling friction
        if (g.y <= floorY) {
          g.y = floorY;
          if (g.vy < -1.1) {
            g.vy = -g.vy * restitution;
            g.vx *= 0.78;
            g.vz *= 0.78;
          } else {
            g.vy = 0;
            const groundFriction = Math.max(0, 1 - 6.5 * stepDt);
            g.vx *= groundFriction;
            g.vz *= groundFriction;
            if (Math.hypot(g.vx, g.vz) < 0.08) {
              g.vx = 0;
              g.vz = 0;
            }
          }
        }
      }

      g.x = Number(g.x.toFixed(2));
      g.y = Number(g.y.toFixed(2));
      g.z = Number(g.z.toFixed(2));
      g.vx = Number(g.vx.toFixed(2));
      g.vy = Number(g.vy.toFixed(2));
      g.vz = Number(g.vz.toFixed(2));

      const prevFuse = typeof g.fuseRemaining === 'number' ? g.fuseRemaining : 2.2;
      const nextFuseByDt = prevFuse - totalDt;
      const nextFuseByClock = typeof g.explodeAt === 'number' ? (g.explodeAt - now) / 1000 : nextFuseByDt;
      const fuseRem = Math.min(nextFuseByDt, nextFuseByClock);
      g.fuseRemaining = Number(Math.max(0, fuseRem).toFixed(2));

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

    // Check win condition (20 kills)
    if (killer && killer.kills >= MATCH_CONFIG.KILL_LIMIT && room.state === 'PLAYING') {
      this.endMatch(room, killer);
    }
  }

  respawnPlayer(room, player) {
    const now = Date.now();
    const protectionMs = MATCH_CONFIG.SPAWN_PROTECTION_MS || 1500;
    const sp = this.pickSafeSpawnPoint(room, player.id);
    if (!player.isBot) {
      const basePrimary = player.savedLoadoutPrimary || player.loadout?.primary || 'rifle';
      if (player.loadout && WEAPONS[basePrimary]?.slot === 1) {
        player.loadout.primary = basePrimary;
      }
      if (player.loadout?.primary && WEAPONS[player.loadout.primary]) {
        player.weapon = player.loadout.primary;
      }
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
    player.positionHistory = [];
    recordPlayerSnapshot(player, now);

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
      droppedWeapons: room.droppedWeapons,
      activeGrenades: room.grenades,
      players: this.serializePlayers(room)
    });
  }

  serializePlayers(room) {
    const now = Date.now();
    const list = [];
    for (const p of room.players.values()) {
      if (!p.alive || (!p.isBot && p.lastMoveAt && now - p.lastMoveAt > 120)) {
        p.vx = 0;
        p.vy = 0;
        p.vz = 0;
      }
      const invulnerable = Boolean(p.alive && p.invulnerableUntil && now < p.invulnerableUntil);
      list.push({
        id: p.id,
        name: p.name,
        isBot: p.isBot,
        color: p.color,
        x: Math.round(p.x * 100) / 100,
        y: Math.round(p.y * 100) / 100,
        z: Math.round(p.z * 100) / 100,
        vx: Math.round((p.vx || 0) * 100) / 100,
        vy: Math.round((p.vy || 0) * 100) / 100,
        vz: Math.round((p.vz || 0) * 100) / 100,
        yaw: Math.round(p.yaw * 1000) / 1000,
        pitch: Math.round(p.pitch * 1000) / 1000,
        crouching: Boolean(p.crouching),
        prone: Boolean(p.prone),
        lean: Math.round((p.lean || 0) * 100) / 100,
        weapon: p.weapon,
        ammo: p.ammo,
        reserveAmmo: p.reserveAmmo ?? 0,
        grenades: p.grenades ?? 1,
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

  tick(customDt = null) {
    const now = Date.now();
    const dt = typeof customDt === 'number' && Number.isFinite(customDt) && customDt > 0
      ? customDt
      : Math.min(0.1, (now - this.lastTickAt) / 1000);
    this.lastTickAt = now;

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
        if (!p.isBot) {
          if (!p.alive && now >= p.respawnAt) {
            this.respawnPlayer(room, p);
          } else if (p.alive && p.reloadingUntil) {
            this.syncPlayerReloadState(p, now);
          }
        }
      }

      if (!room._botCallbacks) {
        room._botCallbacks = {
          onRespawnPlayer: (bot) => this.respawnPlayer(room, bot),
          onBotShoot: (bot, shotPayload) => this.handleShoot(room, bot, shotPayload)
        };
      }

      // Update Bot AI movement & shooting
      updateRoomBots(room, dt, now, room._botCallbacks);

      // Record lag compensation position snapshots for all alive players/bots
      recordRoomSnapshots(room, now);

      // Update active Frag Grenades physics & 2.2s fuse detonation
      this.updateGrenades(room, dt, now);

      // Update Health Pack pickups & 5s Dropped Weapons expiration
      this.updateHealthPacks(room, now);
      this.updateDroppedWeapons(room, now);

      // Broadcast compact state snapshot (use volatile on Socket.IO to prevent TCP bufferbloat)
      room.stateSeq = ((room.stateSeq || 0) + 1) | 0;
      const roomTarget = this.io.to(room.code);
      const emitter = roomTarget.volatile || roomTarget;
      emitter.emit('stateUpdate', {
        seq: room.stateSeq,
        timeRemaining,
        droppedWeapons: room.droppedWeapons,
        activeGrenades: room.grenades,
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
