import {
  BOT_WEAPON_POOL,
  MATCH_CONFIG,
  PLAYER_COLORS,
  WEAPONS,
  WEAPON_ORDER,
  collideCapsuleVsBoxes,
  getMapConfig,
  hasLineOfSight
} from '../shared/constants.js';

const BOT_NAMES = [
  '[BOT] Viper',
  '[BOT] Ghost',
  '[BOT] Reaper',
  '[BOT] Nova',
  '[BOT] Titan',
  '[BOT] Cypher',
  '[BOT] Blaze',
  '[BOT] Frost'
];

const _botEye = { x: 0, y: 0, z: 0 };
const _otherEye = { x: 0, y: 0, z: 0 };

/**
 * Resolves 3D circle-vs-AABB horizontal collision and floor height for Server Bots
 */
export function resolveEntityPhysics(entity, radius = 0.45, mapCfg = null) {
  const cfg = mapCfg || getMapConfig();
  // Shared player-vs-obstacle collision primitive (bots step up 0.55m and are 1.7m tall)
  const groundY = collideCapsuleVsBoxes(entity, cfg.obstacles, radius, 1.7, 0.55, 0);

  // Smoothly settle onto groundY
  if (entity.y < groundY) {
    entity.y = groundY;
  } else if (entity.y > groundY) {
    entity.y = Math.max(groundY, entity.y - 0.35);
  }

  // Keep inside active map arena bounds
  const limit = (cfg.arenaHalfSize || MATCH_CONFIG.ARENA_HALF_SIZE) - 1.2;
  entity.x = Math.max(-limit, Math.min(limit, entity.x));
  entity.z = Math.max(-limit, Math.min(limit, entity.z));
}

export function createBotEntity(index, spawnPoint, mapCfg = null) {
  const cfg = mapCfg || getMapConfig();
  const waypoints = cfg.botWaypoints;
  const pool = BOT_WEAPON_POOL || WEAPON_ORDER.filter((w) => !WEAPONS[w]?.isMelee);
  const weaponId = pool[index % pool.length];
  const weapon = WEAPONS[weaponId];
  const primaryId = weapon.slot === 1 ? weaponId : 'rifle';
  const now = Date.now();
  return {
    id: `bot_${ index + 1 }_${ Math.random().toString(36).slice(2, 6) }`,
    name: BOT_NAMES[index % BOT_NAMES.length],
    isBot: true,
    color: PLAYER_COLORS[(index + 3) % PLAYER_COLORS.length],
    x: spawnPoint.x,
    y: spawnPoint.y || 0,
    z: spawnPoint.z,
    vx: 0,
    vy: 0,
    vz: 0,
    yaw: spawnPoint.yaw || 0,
    pitch: 0,
    crouching: false,
    prone: false,
    lean: 0,
    loadout: {
      primary: primaryId,
      secondary: 'pistol',
      melee: 'knife'
    },
    weapon: weaponId,
    ammo: weapon.magSize,
    reserveAmmo: weapon.reserveAmmo ?? weapon.magSize * 3,
    ammoByWeapon: {
      [primaryId]: WEAPONS[primaryId].magSize,
      [weaponId]: weapon.magSize,
      pistol: WEAPONS.pistol.magSize,
      knife: 1
    },
    reserveAmmoByWeapon: {
      [primaryId]: WEAPONS[primaryId].reserveAmmo ?? WEAPONS[primaryId].magSize * 3,
      [weaponId]: weapon.reserveAmmo ?? weapon.magSize * 3,
      pistol: WEAPONS.pistol.reserveAmmo ?? 36,
      knife: 0
    },
    grenades: 1,
    hp: MATCH_CONFIG.MAX_HP,
    alive: true,
    kills: 0,
    deaths: 0,
    streak: 0,
    lastShotAt: 0,
    lastGrenadeAt: 0,
    reloadingUntil: 0,
    respawnAt: 0,
    invulnerableUntil: now + (MATCH_CONFIG.SPAWN_PROTECTION_MS || 1500),
    lastDeathX: null,
    lastDeathZ: null,
    // AI internal state
    waypointIdx: Math.floor(Math.random() * waypoints.length),
    strafeDir: Math.random() < 0.5 ? 1 : -1,
    nextDecisionAt: 0,
    targetId: null
  };
}

/**
 * Updates all bots in a room for one tick (dt in seconds)
 */
export function updateRoomBots(room, dt, now, callbacks) {
  const mapCfg = getMapConfig(room.mapId);
  const waypoints = mapCfg.botWaypoints;
  const obstacles = mapCfg.obstacles;

  for (const bot of room.players.values()) {
    if (!bot.isBot) continue;

    if (!bot.alive) {
      bot.vx = 0;
      bot.vy = 0;
      bot.vz = 0;
      if (now >= bot.respawnAt) {
        callbacks.onRespawnPlayer(bot);
      }
      continue;
    }

    const weaponCfg = WEAPONS[bot.weapon] || WEAPONS.rifle;

    // Complete reload if finished (deducting from reserveAmmo)
    if (bot.reloadingUntil && now >= bot.reloadingUntil) {
      bot.reloadingUntil = 0;
      bot.reloadWeapon = null;
      bot.nextShellAt = 0;
      const curMag = bot.ammo ?? 0;
      const curRes = (bot.reserveAmmo ?? 0) > 0 ? bot.reserveAmmo : (weaponCfg.reserveAmmo ?? weaponCfg.magSize);
      const needed = Math.max(0, weaponCfg.magSize - curMag);
      const loaded = Math.min(needed, curRes);
      bot.ammo = curMag + loaded;
      bot.reserveAmmo = Math.max(weaponCfg.magSize, curRes - loaded);
      if (bot.ammoByWeapon) bot.ammoByWeapon[bot.weapon] = bot.ammo;
      if (bot.reserveAmmoByWeapon) bot.reserveAmmoByWeapon[bot.weapon] = bot.reserveAmmo;
    }

    // Periodic AI decision update
    if (now >= bot.nextDecisionAt) {
      bot.nextDecisionAt = now + 450 + Math.random() * 350;
      if (Math.random() < 0.35) {
        bot.strafeDir *= -1;
      }

      // Find nearest visible enemy (skipping players with active spawn invulnerability)
      let bestTarget = null;
      let bestDist = weaponCfg.range * 0.9;
      _botEye.x = bot.x;
      _botEye.y = bot.y + 1.5;
      _botEye.z = bot.z;

      for (const other of room.players.values()) {
        if (other.id === bot.id || !other.alive) continue;
        if (other.invulnerableUntil && now < other.invulnerableUntil) continue;
        const dx = other.x - bot.x;
        const dy = other.y - bot.y;
        const dz = other.z - bot.z;
        const dist = Math.hypot(dx, dy, dz);
        // Reject candidates farther than current best visible target BEFORE running raycast LOS
        if (dist >= bestDist) continue;

        _otherEye.x = other.x;
        _otherEye.y = other.y + (other.prone ? 0.38 : other.crouching ? 0.88 : 1.35);
        _otherEye.z = other.z;
        let hasLos = hasLineOfSight(_botEye, _otherEye, obstacles);
        if (!hasLos) {
          _otherEye.y = other.y + (other.prone ? 0.55 : other.crouching ? 1.15 : 1.68);
          hasLos = hasLineOfSight(_botEye, _otherEye, obstacles);
        }
        if (hasLos) {
          bestDist = dist;
          bestTarget = other;
        }
      }
      bot.targetId = bestTarget ? bestTarget.id : null;
    }

    // Determine navigation waypoint (prefer active reachable health pack if low HP)
    if (bot.waypointIdx >= waypoints.length) {
      bot.waypointIdx = 0;
    }
    let goal = waypoints[bot.waypointIdx] || waypoints[0];
    let isSeekingHealthPack = false;
    if (bot.hp < 65 && Array.isArray(room.pickups)) {
      let nearestPack = null;
      let nearestDist = Infinity;
      for (const pack of room.pickups) {
        if (!pack || !pack.active) continue;
        if (Math.abs((pack.y || 0) - (bot.y || 0)) > 1.8) continue;
        const d = Math.hypot(pack.x - bot.x, pack.z - bot.z);
        if (d < nearestDist) {
          nearestDist = d;
          nearestPack = pack;
        }
      }
      if (nearestPack) {
        goal = nearestPack;
        isSeekingHealthPack = true;
      }
    }

    const rawTarget = bot.targetId ? room.players.get(bot.targetId) : null;
    const target = rawTarget && rawTarget.alive && !(rawTarget.invulnerableUntil && now < rawTarget.invulnerableUntil)
      ? rawTarget
      : null;
    const moveSpeed = (MATCH_CONFIG.BOT_MOVE_SPEED || 4.8) * (weaponCfg.moveSpeedMult || 1.0);

    // Start reload whenever magazine is empty
    if (bot.ammo <= 0 && !bot.reloadingUntil) {
      if ((bot.reserveAmmo ?? 0) <= 0) {
        bot.reserveAmmo = weaponCfg.reserveAmmo ?? weaponCfg.magSize;
        if (bot.reserveAmmoByWeapon) bot.reserveAmmoByWeapon[bot.weapon] = bot.reserveAmmo;
      }
      bot.reloadingUntil = now + weaponCfg.reloadMs;
    }

    if (target) {
      // Face target
      const targetAimH = target.prone ? 0.38 : target.crouching ? 0.85 : 1.2;
      const dx = target.x - bot.x;
      const dy = (target.y + targetAimH) - (bot.y + 1.45);
      const dz = target.z - bot.z;
      const horizDist = Math.hypot(dx, dz) || 0.001;

      bot.yaw = Math.atan2(-dx, -dz);
      bot.pitch = Math.max(-0.8, Math.min(0.8, Math.atan2(dy, horizDist)));

      // Move toward target if far, or strafe if within ideal combat distance
      const idealDist = bot.weapon === 'shotgun' ? 8 : bot.weapon === 'sniper' ? 28 : 16;
      const forwardFactor = horizDist > idealDist + 3 ? 0.85 : horizDist < idealDist - 4 ? -0.6 : 0.1;
      const dirX = dx / horizDist;
      const dirZ = dz / horizDist;
      const perpX = -dirZ * bot.strafeDir;
      const perpZ = dirX * bot.strafeDir;

      const prevX = bot.x;
      const prevZ = bot.z;
      bot.x += (dirX * forwardFactor + perpX * 0.72) * moveSpeed * dt;
      bot.z += (dirZ * forwardFactor + perpZ * 0.72) * moveSpeed * dt;
      resolveEntityPhysics(bot, 0.45, mapCfg);

      if (dt > 0.001) {
        bot.vx = (bot.x - prevX) / dt;
        bot.vz = (bot.z - prevZ) / dt;
      }

      if (Math.hypot(bot.x - prevX, bot.z - prevZ) < 0.012) {
        bot.strafeDir *= -1;
      }

      // Attempt to fire at target
      if (
        !bot.reloadingUntil &&
        bot.ammo > 0 &&
        now - bot.lastShotAt >= Math.max(weaponCfg.fireRateMs * 1.65, 230)
      ) {
        _botEye.x = bot.x;
        _botEye.y = bot.y + 1.5;
        _botEye.z = bot.z;
        _otherEye.x = target.x;
        _otherEye.y = target.y + (target.prone ? 0.38 : target.crouching ? 0.85 : 1.25);
        _otherEye.z = target.z;
        let canSeeTarget = hasLineOfSight(_botEye, _otherEye, obstacles);
        if (!canSeeTarget) {
          _otherEye.y = target.y + (target.prone ? 0.55 : target.crouching ? 1.15 : 1.65);
          canSeeTarget = hasLineOfSight(_botEye, _otherEye, obstacles);
        }

        if (canSeeTarget) {
          const botEye = { x: _botEye.x, y: _botEye.y, z: _botEye.z };
          const prevLastShotAt = bot.lastShotAt;

          // Distance-based accuracy so bots feel fair and exciting
          const dist3D = Math.hypot(dx, dy, dz);
          const baseHitChance = bot.weapon === 'sniper' ? 0.55 : bot.weapon === 'shotgun' ? 0.72 : 0.48;
          const distPenalty = Math.min(0.32, (dist3D / 75) * 0.28);
          const didHit = Math.random() < Math.max(0.18, baseHitChance - distPenalty);
          const isHeadshot = didHit && Math.random() < 0.16;

          const normDir = {
            x: dx / (dist3D || 1),
            y: dy / (dist3D || 1),
            z: dz / (dist3D || 1)
          };

          const hitY = target.y + (
            isHeadshot
              ? (target.prone ? 0.52 : target.crouching ? 1.15 : 1.55)
              : (target.prone ? 0.35 : target.crouching ? 0.82 : 1.05)
          );

          callbacks.onBotShoot(
            bot,
            {
              weapon: bot.weapon,
              origin: botEye,
              dir: normDir,
              targetId: didHit ? target.id : null,
              isHeadshot,
              hitPoint: didHit
                ? {
                    x: target.x,
                    y: hitY,
                    z: target.z
                  }
                : {
                    x: target.x + (Math.random() - 0.5) * 2.2,
                    y: Math.max(0.2, hitY + (Math.random() - 0.5) * 1.4),
                    z: target.z + (Math.random() - 0.5) * 2.2
                  }
            },
            now
          );

          // Fallback if a custom callback did not update lastShotAt/ammo via RoomManager.handleShoot
          if (bot.lastShotAt === prevLastShotAt) {
            bot.lastShotAt = now;
            bot.ammo = Math.max(0, (bot.ammo ?? 1) - 1);
            if (bot.ammoByWeapon) bot.ammoByWeapon[bot.weapon] = bot.ammo;
          }
        }
      }
    } else {
      // Patrol between waypoints or move directly onto an active health pack
      const dx = goal.x - bot.x;
      const dz = goal.z - bot.z;
      const dist = Math.hypot(dx, dz);
      const arriveRadius = isSeekingHealthPack ? 0.45 : 2.2;

      if (dist < arriveRadius) {
        bot.vx = 0;
        bot.vz = 0;
        if (!isSeekingHealthPack) {
          bot.waypointIdx = (bot.waypointIdx + 1 + Math.floor(Math.random() * 3)) % waypoints.length;
        }
      } else {
        const dirX = dx / dist;
        const dirZ = dz / dist;
        bot.yaw = Math.atan2(-dirX, -dirZ);
        bot.pitch = 0;

        const prevX = bot.x;
        const prevZ = bot.z;
        bot.x += dirX * moveSpeed * dt;
        bot.z += dirZ * moveSpeed * dt;
        resolveEntityPhysics(bot, 0.45, mapCfg);

        if (dt > 0.001) {
          bot.vx = (bot.x - prevX) / dt;
          bot.vz = (bot.z - prevZ) / dt;
        }

        // Pick another waypoint if blocked by wall
        if (Math.hypot(bot.x - prevX, bot.z - prevZ) < 0.015) {
          bot.waypointIdx = Math.floor(Math.random() * waypoints.length);
        }
      }
    }
  }
}
