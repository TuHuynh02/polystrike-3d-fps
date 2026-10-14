import {
  BOT_WEAPON_POOL,
  MATCH_CONFIG,
  PLAYER_COLORS,
  WEAPONS,
  WEAPON_ORDER,
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

/**
 * Resolves 3D circle-vs-AABB horizontal collision and floor height for Server Bots
 */
export function resolveEntityPhysics(entity, radius = 0.45, mapCfg = null) {
  const cfg = mapCfg || getMapConfig();
  const obstacles = cfg.obstacles;
  let groundY = 0;

  for (let i = 0; i < obstacles.length; i++) {
    const box = obstacles[i];
    const halfW = box.w / 2;
    const halfH = box.h / 2;
    const halfD = box.d / 2;

    const minX = box.x - halfW;
    const maxX = box.x + halfW;
    const minZ = box.z - halfD;
    const maxZ = box.z + halfD;
    const topY = box.y + halfH;
    const bottomY = box.y - halfH;

    // Check if entity is horizontally within or touching box
    const closestX = Math.max(minX, Math.min(entity.x, maxX));
    const closestZ = Math.max(minZ, Math.min(entity.z, maxZ));
    const dx = entity.x - closestX;
    const dz = entity.z - closestZ;
    const distSq = dx * dx + dz * dz;

    if (distSq < radius * radius) {
      // Can step up onto this surface if topY is at most 0.55m above current foot y
      if (entity.y + 0.55 >= topY && bottomY <= entity.y + 1.6) {
        if (topY > groundY) {
          groundY = topY;
        }
      } else if (entity.y < topY && entity.y + 1.7 > bottomY) {
        // Push horizontally out of obstacle
        const dist = Math.sqrt(distSq);
        if (dist > 0.0001) {
          const overlap = radius - dist;
          entity.x += (dx / dist) * overlap;
          entity.z += (dz / dist) * overlap;
        } else {
          entity.x += radius;
        }
      }
    }
  }

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
    hp: MATCH_CONFIG.MAX_HP,
    alive: true,
    kills: 0,
    deaths: 0,
    streak: 0,
    lastShotAt: 0,
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
  const allPlayers = Array.from(room.players.values());
  const mapCfg = getMapConfig(room.mapId);
  const waypoints = mapCfg.botWaypoints;
  const obstacles = mapCfg.obstacles;

  for (const bot of allPlayers) {
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
      const curMag = bot.ammo ?? 0;
      const curRes = bot.reserveAmmo ?? weaponCfg.reserveAmmo ?? weaponCfg.magSize;
      const needed = Math.max(0, weaponCfg.magSize - curMag);
      const loaded = Math.min(needed, curRes);
      bot.ammo = curMag + loaded;
      bot.reserveAmmo = Math.max(0, curRes - loaded);
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
      let bestDist = Infinity;
      const botEye = { x: bot.x, y: bot.y + 1.5, z: bot.z };

      for (const other of allPlayers) {
        if (other.id === bot.id || !other.alive) continue;
        if (other.invulnerableUntil && now < other.invulnerableUntil) continue;
        const dx = other.x - bot.x;
        const dy = other.y - bot.y;
        const dz = other.z - bot.z;
        const dist = Math.hypot(dx, dy, dz);
        if (dist > weaponCfg.range * 0.9) continue;

        const otherEye = { x: other.x, y: other.y + 1.35, z: other.z };
        if (hasLineOfSight(botEye, otherEye, obstacles)) {
          if (dist < bestDist) {
            bestDist = dist;
            bestTarget = other;
          }
        }
      }
      bot.targetId = bestTarget ? bestTarget.id : null;
    }

    // Determine navigation waypoint (prefer active health pack if low HP)
    if (bot.waypointIdx >= waypoints.length) {
      bot.waypointIdx = 0;
    }
    let goal = waypoints[bot.waypointIdx] || waypoints[0];
    if (bot.hp < 65) {
      let nearestPack = null;
      let nearestDist = Infinity;
      for (const pack of room.pickups) {
        if (!pack.active) continue;
        const d = Math.hypot(pack.x - bot.x, pack.z - bot.z);
        if (d < nearestDist) {
          nearestDist = d;
          nearestPack = pack;
        }
      }
      if (nearestPack) {
        goal = nearestPack;
      }
    }

    const rawTarget = bot.targetId ? room.players.get(bot.targetId) : null;
    const target = rawTarget && rawTarget.alive && !(rawTarget.invulnerableUntil && now < rawTarget.invulnerableUntil)
      ? rawTarget
      : null;
    const moveSpeed = (MATCH_CONFIG.BOT_MOVE_SPEED || 4.8) * (weaponCfg.moveSpeedMult || 1.0);

    if (target) {
      // Face target
      const dx = target.x - bot.x;
      const dy = (target.y + 1.2) - (bot.y + 1.45);
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
      if (bot.ammo <= 0 && !bot.reloadingUntil) {
        if ((bot.reserveAmmo ?? 0) > 0) {
          bot.reloadingUntil = now + weaponCfg.reloadMs;
        }
      } else if (
        !bot.reloadingUntil &&
        bot.ammo > 0 &&
        now - bot.lastShotAt >= Math.max(weaponCfg.fireRateMs * 1.65, 230)
      ) {
        const botEye = { x: bot.x, y: bot.y + 1.5, z: bot.z };
        const targetChest = { x: target.x, y: target.y + 1.25, z: target.z };

        if (hasLineOfSight(botEye, targetChest, obstacles)) {
          bot.lastShotAt = now;
          bot.ammo = Math.max(0, bot.ammo - 1);
          if (bot.ammoByWeapon) bot.ammoByWeapon[bot.weapon] = bot.ammo;

          // Distance-based accuracy so bots feel fair and exciting
          const dist3D = Math.hypot(dx, dy, dz);
          const baseHitChance = bot.weapon === 'sniper' ? 0.52 : bot.weapon === 'shotgun' ? 0.68 : 0.42;
          const distPenalty = Math.min(0.32, (dist3D / 75) * 0.28);
          const didHit = Math.random() < Math.max(0.14, baseHitChance - distPenalty);
          const isHeadshot = didHit && Math.random() < 0.16;

          const normDir = {
            x: dx / (dist3D || 1),
            y: dy / (dist3D || 1),
            z: dz / (dist3D || 1)
          };

          callbacks.onBotShoot(bot, {
            weapon: bot.weapon,
            origin: botEye,
            dir: normDir,
            targetId: didHit ? target.id : null,
            isHeadshot,
            hitPoint: didHit
              ? {
                  x: target.x,
                  y: target.y + (isHeadshot ? 1.55 : 1.05),
                  z: target.z
                }
              : {
                  x: target.x + (Math.random() - 0.5) * 2.2,
                  y: Math.max(0.2, target.y + 1.0 + (Math.random() - 0.5) * 1.4),
                  z: target.z + (Math.random() - 0.5) * 2.2
                }
          });
        }
      }
    } else {
      // Patrol between waypoints
      const dx = goal.x - bot.x;
      const dz = goal.z - bot.z;
      const dist = Math.hypot(dx, dz);

      if (dist < 2.2) {
        bot.vx = 0;
        bot.vz = 0;
        bot.waypointIdx = (bot.waypointIdx + 1 + Math.floor(Math.random() * 3)) % waypoints.length;
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
