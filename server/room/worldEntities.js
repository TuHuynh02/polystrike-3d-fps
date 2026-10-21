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

export class WorldEntitiesMethods {
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

    const serverEyeX = player.x + rightX * leanVal;
    const serverEyeY = Math.max(0.22, (player.y || 0) + eyeH);
    const serverEyeZ = player.z + rightZ * leanVal;
    let eyeX = serverEyeX;
    let eyeY = serverEyeY;
    let eyeZ = serverEyeZ;

    const mapCfg = getMapConfig(room.mapId);
    const obstacles = mapCfg.obstacles || [];

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
      const clientOriginY = Math.max(0.22, payload.origin.y);
      if (
        originDist <= 1.8 &&
        Number.isFinite(originDist) &&
        hasLineOfSight(
          { x: serverEyeX, y: serverEyeY, z: serverEyeZ },
          { x: payload.origin.x, y: clientOriginY, z: payload.origin.z },
          obstacles
        )
      ) {
        eyeX = payload.origin.x;
        eyeY = clientOriginY;
        eyeZ = payload.origin.z;
      }
    }

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

    const isOvercooked = Boolean(payload?.overcooked);
    const throwSpeed = isOvercooked ? 0 : (MATCH_CONFIG.GRENADE_THROW_SPEED || 19.5);
    const upwardArc = isOvercooked ? 0 : (MATCH_CONFIG.GRENADE_UPWARD_ARC || 4.2);
    const vx = isOvercooked ? 0 : (dirX * throwSpeed + (player.vx || 0) * 0.25);
    const vy = isOvercooked ? 0 : (dirY * throwSpeed + upwardArc);
    const vz = isOvercooked ? 0 : (dirZ * throwSpeed + (player.vz || 0) * 0.25);
    const defaultFuseMs = MATCH_CONFIG.GRENADE_DEFAULT_THROW_FUSE_MS || 2200;
    const maxFuseMs = MATCH_CONFIG.GRENADE_FUSE_MS || 3000;
    const rawFuseMs = typeof payload?.fuseMs === 'number' && Number.isFinite(payload.fuseMs)
      ? Math.round(payload.fuseMs)
      : defaultFuseMs;
    const fuseMs = isOvercooked ? 60 : Math.max(80, Math.min(maxFuseMs, rawFuseMs));
    const fuseSec = round2(fuseMs / 1000);

    const grenade = {
      id: `gren_${now}_${Math.random().toString(36).slice(2, 7)}`,
      ownerId: player.id,
      ownerName: player.name,
      ownerTeam: player.team || null,
      x: round2(startX),
      y: round2(startY),
      z: round2(startZ),
      vx: round2(vx),
      vy: round2(vy),
      vz: round2(vz),
      createdAt: now,
      explodeAt: now + fuseMs,
      fuseRemaining: fuseSec
    };

    room.grenades.push(grenade);

    this.io.to(room.code).emit('grenadeThrown', {
      ...grenade,
      grenade,
      playerId: player.id,
      grenades: player.grenades
    });

    if (isOvercooked) {
      this.detonateGrenade(room, grenade, now);
    }

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
    const ownerTeam = grenade.ownerTeam || attacker?.team || null;
    const blastOrigin = {
      x: grenade.x,
      y: Math.max(0.35, grenade.y + 0.25),
      z: grenade.z
    };

    // Evaluate enemy targets first, then owner if standing inside blast radius (no friendly fire on teammates in TDM)
    const candidates = [];
    for (const p of room.players.values()) {
      if (!p || !p.alive) continue;
      if (p.id !== grenade.ownerId) {
        if (room.gameMode === 'tdm' && ownerTeam && p.team === ownerTeam) continue;
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

      const dmgRes = this.applyDamageWithArmor(target, damage);

      this.io.to(room.code).emit('damageDealt', {
        targetId: target.id,
        attackerId: grenade.ownerId,
        attackerPos: { x: grenade.x, y: grenade.y, z: grenade.z },
        damage,
        armorDamage: dmgRes.absorbed,
        hpDamage: dmgRes.hpLoss,
        armorBroken: dmgRes.armorBroken,
        hp: target.hp,
        armor: target.armor || 0,
        isHeadshot: false,
        weapon: 'grenade',
        weaponName: 'FRAG GRENADE'
      });

      if (target.hp <= 0) {
        this.handlePlayerKilled(room, attacker, target, 'grenade', false);
      } else {
        this.sendSelfState(target, now, true);
      }
    }

    // Grenade blast also detonates nearby active explosive barrels
    if (Array.isArray(room.barrels)) {
      for (const barrel of room.barrels) {
        if (!barrel || !barrel.active) continue;
        const bDist = Math.hypot(barrel.x - grenade.x, (barrel.y || 0) - grenade.y, barrel.z - grenade.z);
        if (bDist <= outerRadius) {
          this.detonateBarrel(room, barrel, attacker, now);
        }
      }
    }
  }

  damageBarrel(room, barrel, amount, attacker = null, now = Date.now(), visited = new Set()) {
    if (!room || !barrel || !barrel.active || room.state !== 'PLAYING') return false;
    const dmg = Math.max(1, Math.round(Number(amount) || 0));
    barrel.hp = Math.max(0, (Number(barrel.hp) || 0) - dmg);
    if (barrel.hp <= 0) {
      this.detonateBarrel(room, barrel, attacker, now, visited);
      return true;
    }
    this.io.to(room.code).emit('barrelState', {
      id: barrel.id,
      barrelId: barrel.id,
      active: true,
      hp: barrel.hp,
      maxHp: barrel.maxHp || MATCH_CONFIG.BARREL_MAX_HP || 60
    });
    return false;
  }

  detonateBarrel(room, barrel, attacker = null, now = Date.now(), visited = new Set()) {
    if (!room || !barrel || !barrel.active || visited.has(barrel.id)) return;
    visited.add(barrel.id);
    barrel.active = false;
    barrel.hp = 0;
    barrel.respawnAt = now + (MATCH_CONFIG.BARREL_RESPAWN_MS || 25000);

    const attackerId = attacker ? attacker.id : null;
    const ownerTeam = attacker?.team || null;

    this.io.to(room.code).emit('barrelExploded', {
      id: barrel.id,
      barrelId: barrel.id,
      x: barrel.x,
      y: barrel.y || 0,
      z: barrel.z,
      attackerId,
      respawnAt: barrel.respawnAt
    });

    if (room.state !== 'PLAYING') return;

    const maxDamage = MATCH_CONFIG.BARREL_MAX_DAMAGE || 85;
    const innerRadius = 2.0;
    const outerRadius = MATCH_CONFIG.BARREL_EXPLOSION_RADIUS || 6.5;
    const mapCfg = getMapConfig(room.mapId);
    const obstacles = mapCfg.obstacles || [];
    const blastOrigin = {
      x: barrel.x,
      y: (barrel.y || 0) + 0.75,
      z: barrel.z
    };

    const candidates = [];
    for (const p of room.players.values()) {
      if (!p || !p.alive) continue;
      if (p.id !== attackerId) {
        if (room.gameMode === 'tdm' && ownerTeam && p.team === ownerTeam) continue;
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

      const clampedY = Math.max(target.y || 0, Math.min((target.y || 0) + 1.5, blastOrigin.y));
      const dist = Math.hypot(target.x - barrel.x, clampedY - blastOrigin.y, target.z - barrel.z);
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
      if (!hasLineOfSight(blastOrigin, targetTorso, obstacles) && !hasLineOfSight(blastOrigin, targetHead, obstacles)) {
        continue;
      }

      if (target.invulnerableUntil && now < target.invulnerableUntil) {
        this.io.to(room.code).emit('spawnProtectedHit', {
          targetId: target.id,
          attackerId,
          remainingMs: Math.max(0, target.invulnerableUntil - now)
        });
        continue;
      }

      let damage = maxDamage;
      if (dist > innerRadius) {
        const t = (dist - innerRadius) / (outerRadius - innerRadius);
        damage = Math.max(1, Math.round(maxDamage * (1 - t)));
      }

      const dmgRes = this.applyDamageWithArmor(target, damage);

      this.io.to(room.code).emit('damageDealt', {
        targetId: target.id,
        attackerId,
        attackerPos: { x: barrel.x, y: barrel.y || 0, z: barrel.z },
        damage,
        armorDamage: dmgRes.absorbed,
        hpDamage: dmgRes.hpLoss,
        armorBroken: dmgRes.armorBroken,
        hp: target.hp,
        armor: target.armor || 0,
        isHeadshot: false,
        weapon: 'barrel',
        weaponName: 'EXPLOSIVE BARREL'
      });

      if (target.hp <= 0) {
        this.handlePlayerKilled(room, attacker, target, 'barrel', false);
      } else {
        this.sendSelfState(target, now, true);
      }
    }

    // Chain reaction to nearby active barrels within outerRadius
    if (Array.isArray(room.barrels)) {
      for (const other of room.barrels) {
        if (!other || !other.active || other.id === barrel.id || visited.has(other.id)) continue;
        const bDist = Math.hypot(other.x - barrel.x, (other.y || 0) - (barrel.y || 0), other.z - barrel.z);
        if (bDist <= outerRadius) {
          this.detonateBarrel(room, other, attacker, now, visited);
        }
      }
    }
  }

  updateBarrels(room, now = Date.now()) {
    if (!room || !Array.isArray(room.barrels)) return;
    const maxHp = MATCH_CONFIG.BARREL_MAX_HP || 60;
    for (const barrel of room.barrels) {
      if (!barrel.active && now >= barrel.respawnAt) {
        barrel.active = true;
        barrel.hp = maxHp;
        this.io.to(room.code).emit('barrelState', {
          barrelId: barrel.id,
          active: true,
          hp: barrel.hp,
          maxHp
        });
      }
    }
  }

  updateHealthPacks(room, now) {
    if (!room || !Array.isArray(room.pickups)) return;
    const maxHp = MATCH_CONFIG.MAX_HP || 100;
    const maxArmor = MATCH_CONFIG.MAX_ARMOR || 50;
    for (const pack of room.pickups) {
      const pType = pack.type || 'health';
      if (!pack.active) {
        if (now >= pack.respawnAt) {
          pack.active = true;
          this.io.to(room.code).emit('pickupState', {
            pickupId: pack.id,
            type: pType,
            active: true
          });
        }
        continue;
      }

      // Check if any eligible alive player walks over the pickup
      for (const player of room.players.values()) {
        if (!player.alive) continue;
        if (pType === 'health' && player.hp >= maxHp) continue;
        if (pType === 'armor' && (player.armor || 0) >= maxArmor) continue;

        const dist = Math.hypot(player.x - pack.x, player.z - pack.z);
        if (dist <= 2.35 && Math.abs((player.y || 0) - (pack.y || 0)) <= 2.4) {
          pack.active = false;
          if (pType === 'health') {
            pack.respawnAt = now + (MATCH_CONFIG.HEALTH_PACK_RESPAWN_MS || 15000);
            player.hp = Math.min(maxHp, player.hp + (MATCH_CONFIG.HEALTH_PACK_HEAL || 50));
          } else if (pType === 'armor') {
            pack.respawnAt = now + (MATCH_CONFIG.POWERUP_RESPAWN_MS || 20000);
            player.armor = Math.min(maxArmor, (player.armor || 0) + (MATCH_CONFIG.ARMOR_PACK_VALUE || 50));
          } else if (pType === 'speed') {
            pack.respawnAt = now + (MATCH_CONFIG.POWERUP_RESPAWN_MS || 20000);
            player.speedBoostUntil = now + (MATCH_CONFIG.SPEED_BOOST_DURATION_MS || 10000);
          } else if (pType === 'damage') {
            pack.respawnAt = now + (MATCH_CONFIG.POWERUP_RESPAWN_MS || 20000);
            player.damageBoostUntil = now + (MATCH_CONFIG.DAMAGE_BOOST_DURATION_MS || 10000);
          } else {
            pack.respawnAt = now + (MATCH_CONFIG.POWERUP_RESPAWN_MS || 20000);
          }

          this.io.to(room.code).emit('pickupState', {
            pickupId: pack.id,
            type: pType,
            active: false,
            pickerId: player.id,
            pickerName: player.name,
            newHp: player.hp,
            newArmor: player.armor || 0,
            speedBoostMs: player.speedBoostUntil > now ? Math.round(player.speedBoostUntil - now) : 0,
            damageBoostMs: player.damageBoostUntil > now ? Math.round(player.damageBoostUntil - now) : 0
          });
          this.sendSelfState(player, now, true);
          break;
        }
      }
    }
  }
}
