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
  raySegmentAABB,
  stepGrenade
} from '../../shared/constants.js';
import {
  KILL_ADRENALINE_HEAL,
  LAG_COMP_MAX_REWIND_MS,
  raycastPlayerHitbox,
  recordPlayerSnapshot,
  recordRoomSnapshots,
  resolveShotRewindMs,
  applyReportedInterpDelay,
  restoreRewoundPlayers,
  rewindRoomPlayersForShot
} from '../../shared/lagCompensation.js';
import { PART_PADDING } from '../../shared/hitboxes.js';
import { FIXED_DT, createMovementState } from '../../shared/movement.js';
import {
  BTN,
  MAX_SHOT_SEQ_GAP,
  commandTimeMs,
  createMoveAck,
  isFireIntervalOk,
  movementStateFromAck,
  sanitizeInputCommand,
  stepCommand
} from '../../shared/netcode.js';
import { computeShotOrigin, createShotState, planShot, resetShotState } from '../../shared/spread.js';
import {
  INPUT_BATCH_MAX_CMDS,
  INPUT_CREDIT_CAP_S,
  INPUT_GAP_WAIT_MS,
  INPUT_QUEUE_MAX,
  INPUT_SEQ_AHEAD_MAX,
  MOVE_BUDGET_CAP_DOWN,
  MOVE_BUDGET_CAP_UP,
  MOVE_BUDGET_CAP_XZ,
  MOVE_CORRECTION_INTERVAL_MS,
  MOVE_DOWN_SPEED,
  MOVE_MAX_SPEED,
  MOVE_UP_SPEED,
  SELF_STATE_INTERVAL_MS,
  SHOT_REJECT,
  STALE_EPOCH_ACK_INTERVAL_MS,
  TICK_INTERVAL_MS,
  createInitialAmmoMap,
  createInitialReserveAmmoMap,
  generateRoomCode,
  getMapCeilingY,
  isFiniteVec,
  normalizeDir,
  randomSpreadSeed,
  round1,
  round2,
  roundTo,
  sanitizeGameMode,
  sanitizeLoadout,
  sanitizeMapId,
  sanitizeName,
  sanitizeRoomCode,
  sanitizeTeam
} from './sanitizers.js';

export class SpawningMethods {
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
    const list = [];
    for (const p of mapCfg.healthPacks || []) {
      list.push({
        id: p.id,
        type: 'health',
        x: p.x,
        y: p.y || 0,
        z: p.z,
        active: true,
        respawnAt: 0
      });
    }
    for (const p of mapCfg.powerups || []) {
      list.push({
        id: p.id,
        type: p.type || 'armor',
        x: p.x,
        y: p.y || 0,
        z: p.z,
        active: true,
        respawnAt: 0
      });
    }
    return list;
  }

  createBarrelsForMap(mapId) {
    const mapCfg = getMapConfig(mapId);
    const maxHp = MATCH_CONFIG.BARREL_MAX_HP || 60;
    return (mapCfg.barrels || []).map((b) => ({
      id: b.id,
      x: b.x,
      y: b.y || 0,
      z: b.z,
      hp: maxHp,
      maxHp,
      active: true,
      respawnAt: 0
    }));
  }

  pickSafeSpawnPoint(room, excludeId = null, forcedTeam = null) {
    const now = Date.now();
    const mapCfg = getMapConfig(room?.mapId);
    const respawningPlayer = excludeId ? room?.players?.get(excludeId) : null;
    const isTdm = room?.gameMode === 'tdm';
    const teamKey = isTdm ? (sanitizeTeam(forcedTeam || respawningPlayer?.team) || 'alpha') : null;
    const teamSpawnList = isTdm && teamKey && Array.isArray(mapCfg.teamSpawns?.[teamKey]) && mapCfg.teamSpawns[teamKey].length > 0
      ? mapCfg.teamSpawns[teamKey]
      : null;
    const spawnPoints = teamSpawnList || mapCfg.spawnPoints || [];
    const obstacles = mapCfg.obstacles || [];
    const arenaHalf = (mapCfg.arenaHalfSize || MATCH_CONFIG.ARENA_HALF_SIZE) - 2.0;
    const minClearance = teamSpawnList ? 3.5 : (MATCH_CONFIG.SPAWN_MIN_CLEARANCE || 6.0);
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

    const lastDeathX = respawningPlayer?.lastDeathX;
    const lastDeathZ = respawningPlayer?.lastDeathZ;
    const hasDeathPos = !teamSpawnList && Number.isFinite(lastDeathX) && Number.isFinite(lastDeathZ);

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
        const isEnemy = !isTdm || !other.team || other.team !== teamKey;
        if (isEnemy) {
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
      const isRecentlyUsed = minRecentDist < (teamSpawnList ? 2.8 : 4.5);

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

      // Distance bonus from the nearest player (capped so density remains dominant)
      const effectiveMinDist = minDist === Infinity ? 60.0 : Math.min(minDist, 56.0);
      score += effectiveMinDist * 1.65;

      // Small tie-breaking variation for empty zones
      score += Math.random() * 2.2;

      scoredCandidates.push({ sp, score, minDist, minRecentDist, zoneCount, closeCount });
    }

    scoredCandidates.sort((a, b) => b.score - a.score);
    const bestCandidate = scoredCandidates[0] || {
      sp: { x: 0, y: 0.1, z: teamKey === 'bravo' ? 50 : -50, yaw: teamKey === 'bravo' ? 0 : Math.PI }
    };
    const baseSp = bestCandidate.sp;

    // Compute a safe final coordinate (with subtle jitter or non-overlap ring offset if crowded)
    let finalX = baseSp.x;
    let finalZ = baseSp.z;
    const footY = baseSp.y || 0.1;

    const isPositionSafeAndUnstacked = (cx, cz, minSep = 3.2) => {
      if (Math.abs(cx) > arenaHalf || Math.abs(cz) > arenaHalf) return false;
      if (teamSpawnList && Math.abs(cz - baseSp.z) > 4.2) return false;
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
      yaw: baseSp.yaw ?? (teamKey === 'alpha' ? Math.PI : teamKey === 'bravo' ? 0 : Math.atan2(finalX, finalZ))
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

  respawnPlayer(room, player) {
    const now = Date.now();
    const protectionMs = MATCH_CONFIG.SPAWN_PROTECTION_MS || 1500;
    const sp = this.pickSafeSpawnPoint(room, player.id, player.team);
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
    player.sliding = false;
    player.isSliding = false;
    player.isAiming = false;
    player.lean = 0;
    player.hp = MATCH_CONFIG.MAX_HP;
    player.armor = 0;
    player.speedBoostUntil = 0;
    player.damageBoostUntil = 0;
    player.multiKillCount = 0;
    player.lastKillAt = 0;
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
      team: player.team || null,
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
}
