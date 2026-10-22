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

export class CombatSystemMethods {
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
    const rewindAt = Number.isFinite(cmd.recvAt) && cmd.recvAt <= now && now - cmd.recvAt <= LAG_COMP_MAX_REWIND_MS
      ? cmd.recvAt
      : now;
    return this.resolveShot(room, shooter, { weaponId, origin: plan.origin, dirs: plan.dirs, now, rewindAt });
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
    if (
      Math.abs(live.x - candidate.x) < 1e-4 &&
      Math.abs(live.y - candidate.y) < 1e-4 &&
      Math.abs(live.z - candidate.z) < 1e-4 &&
      Boolean(live.crouch) === Boolean(candidate.crouching || candidate.crouch) &&
      Boolean(live.prone) === Boolean(candidate.prone)
    ) {
      return null;
    }
    if (!this._livePoseScratch) {
      this._livePoseScratch = {
        alive: true,
        x: 0,
        y: 0,
        z: 0,
        yaw: 0,
        pitch: 0,
        lean: 0,
        crouching: false,
        crouch: false,
        prone: false,
        sliding: false,
        isSliding: false
      };
    }
    const scratch = this._livePoseScratch;
    scratch.x = live.x;
    scratch.y = live.y;
    scratch.z = live.z;
    scratch.yaw = candidate.yaw;
    scratch.pitch = candidate.pitch;
    scratch.lean = candidate.lean;
    scratch.crouching = Boolean(live.crouch);
    scratch.crouch = Boolean(live.crouch);
    scratch.prone = Boolean(live.prone);
    scratch.sliding = candidate.sliding;
    scratch.isSliding = candidate.isSliding;
    return raycastPlayerHitbox(origin, dir, scratch, maxRange, PART_PADDING);
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
    const rewindRef = Number.isFinite(shot.rewindAt) ? shot.rewindAt : now; // arrival time of the shot's command
    const savedStates = rewindRoomPlayersForShot(room, shooter.id, rewindMs, rewindRef);

    const hits = [];
    const barrelHits = [];
    const activeBarrels = Array.isArray(room.barrels) ? room.barrels : [];
    let firstEnd = null;
    const canWallbang =
      !weaponCfg.isMelee &&
      (weaponCfg.category === 'AR' ||
        weaponCfg.category === 'LMG' ||
        weaponCfg.category === 'SNIPER' ||
        weaponId === 'deagle');
    const MAX_WALLBANG_THICKNESS = 0.72;

    try {
      for (let p = 0; p < dirs.length; p++) {
        const dir = normalizeDir(dirs[p]);
        if (!dir) continue;

        // Nearest obstacle along this ray + single-edge wallbang thickness check
        let wallDist = Infinity;
        let secondWallDist = Infinity;
        let firstWallThickness = Infinity;
        for (let i = 0; i < obstacles.length; i++) {
          const seg = raySegmentAABB(origin, dir, maxRange, obstacles[i]);
          if (seg !== null) {
            if (seg.tEnter < wallDist) {
              secondWallDist = wallDist;
              wallDist = seg.tEnter;
              firstWallThickness = seg.thickness;
            } else if (seg.tEnter < secondWallDist) {
              secondWallDist = seg.tEnter;
            }
          }
        }

        const solidWallDist =
          canWallbang && firstWallThickness <= MAX_WALLBANG_THICKNESS
            ? secondWallDist
            : wallDist;

        // Check active explosive barrels along this ray
        let bestBarrel = null;
        let barrelDist = Infinity;
        const barrelReach = Math.min(maxRange, wallDist);
        const brlBox = this._brlBoxScratch || (this._brlBoxScratch = { minX: 0, maxX: 0, minY: 0, maxY: 0, minZ: 0, maxZ: 0 });
        for (let i = 0; i < activeBarrels.length; i++) {
          const brl = activeBarrels[i];
          if (!brl || !brl.active) continue;
          const by = brl.y || 0;
          brlBox.minX = brl.x - 0.52;
          brlBox.maxX = brl.x + 0.52;
          brlBox.minY = by;
          brlBox.maxY = by + 1.25;
          brlBox.minZ = brl.z - 0.52;
          brlBox.maxZ = brl.z + 0.52;
          const bt = rayIntersectsAABB(origin, dir, barrelReach, brlBox);
          if (bt !== null && bt < barrelDist) {
            barrelDist = bt;
            bestBarrel = brl;
          }
        }

        // Nearest player part in front of solid obstacle limit and barrel
        const reach = Math.min(maxRange, solidWallDist, barrelDist);
        let bestTarget = null;
        let bestHit = null;
        for (const candidate of room.players.values()) {
          if (!candidate || !candidate.alive || candidate.id === shooter.id) continue;
          if (room.gameMode === 'tdm' && shooter.team && candidate.team === shooter.team) continue;
          const hit = this.raycastPlayerPoses(origin, dir, candidate, reach, savedStates);
          if (hit && (!bestHit || hit.distance < bestHit.distance)) {
            bestTarget = candidate;
            bestHit = hit;
          }
        }

        if (bestHit) {
          const isWallbangHit = bestHit.distance > wallDist;
          hits.push({
            pellet: p,
            targetId: bestTarget.id,
            zone: bestHit.zone,
            distance: bestHit.distance,
            point: bestHit.hitPoint,
            wallbang: isWallbangHit
          });
        } else if (bestBarrel && barrelDist <= barrelReach) {
          barrelHits.push({
            barrel: bestBarrel,
            distance: barrelDist
          });
        }
        if (p === 0) {
          if (bestHit) firstEnd = bestHit.hitPoint;
          else if (bestBarrel && barrelDist <= barrelReach) {
            firstEnd = { x: origin.x + dir.x * barrelDist, y: origin.y + dir.y * barrelDist, z: origin.z + dir.z * barrelDist };
          } else if (wallDist <= maxRange) {
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
      hitPoint: roundVec(firstEnd, 1000),
      isPlayerHit: hits.length > 0
    };
    if (dirs.length > 1) shotEvent.dirs = dirs.map((d) => roundVec(d, 10000));
    const shotTarget = this.io.to(room.code);
    const shotEmitTarget = process.env.SV_RELIABLE ? shotTarget : (shotTarget.volatile || shotTarget);
    shotEmitTarget.emit('shotFired', shotEvent);

    const dmgBoostMult = (shooter.damageBoostUntil && now < shooter.damageBoostUntil)
      ? (MATCH_CONFIG.DAMAGE_BOOST_MULT || 1.35)
      : 1.0;

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
      const wallbangMult = hit.wallbang ? 0.55 : 1.0;
      const pelletDmg = Math.max(1, Math.round(weaponCfg.damage * falloffMult * hitZoneMult * dmgBoostMult * wallbangMult));
      const prev = damageMap.get(target.id) || { totalDamage: 0, anyHeadshot: false, anyWallbang: false };
      prev.totalDamage += pelletDmg;
      prev.anyHeadshot = prev.anyHeadshot || hit.zone === 'head';
      prev.anyWallbang = prev.anyWallbang || Boolean(hit.wallbang);
      damageMap.set(target.id, prev);
    }

    this.applyShotDamage(room, shooter, weaponId, damageMap, blockedShieldTargets, now);

    if (barrelHits.length > 0) {
      const barrelDmgMap = new Map();
      for (const bh of barrelHits) {
        if (!bh.barrel || !bh.barrel.active) continue;
        const falloffMult = computeDistanceFalloff(weaponCfg, bh.distance);
        const pelletDmg = Math.max(1, Math.round(weaponCfg.damage * falloffMult * dmgBoostMult));
        barrelDmgMap.set(bh.barrel, (barrelDmgMap.get(bh.barrel) || 0) + pelletDmg);
      }
      for (const [brl, totalBrlDmg] of barrelDmgMap.entries()) {
        this.damageBarrel(room, brl, totalBrlDmg, shooter, now);
      }
    }

    return { origin, dirs, hitPoint: firstEnd, hits, damage: damageMap };
  }

  applyDamageWithArmor(target, rawDamage) {
    const total = Math.max(0, Math.round(Number(rawDamage) || 0));
    const curArmor = Math.max(0, Number(target.armor) || 0);
    const absorbed = Math.min(curArmor, total);
    const hpLoss = total - absorbed;
    target.armor = curArmor - absorbed;
    target.hp = Math.max(0, (Number(target.hp) || 0) - hpLoss);
    const armorBroken = curArmor > 0 && target.armor === 0;
    return { total, absorbed, hpLoss, armorBroken };
  }

  /** Spawn-protection notices, HP/Armor loss, `damageDealt` and kills for the per-target damage of one shot. */
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

      const dmgRes = this.applyDamageWithArmor(target, info.totalDamage);

      this.io.to(room.code).emit('damageDealt', {
        targetId: target.id,
        attackerId: shooter.id,
        attackerPos: { x: shooter.x, y: shooter.y, z: shooter.z },
        damage: info.totalDamage,
        armorDamage: dmgRes.absorbed,
        hpDamage: dmgRes.hpLoss,
        armorBroken: dmgRes.armorBroken,
        hp: target.hp,
        armor: target.armor || 0,
        isHeadshot: info.anyHeadshot,
        isWallbang: Boolean(info.anyWallbang)
      });

      if (target.hp <= 0) {
        this.handlePlayerKilled(room, shooter, target, weaponId, info.anyHeadshot, Boolean(info.anyWallbang));
      } else {
        this.sendSelfState(target, now, true);
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

  handlePlayerKilled(room, killer, victim, weaponId, isHeadshot, isWallbang = false) {
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

    const now = Date.now();
    const victimPrevStreak = victim.streak || 0;
    victim.alive = false;
    victim.hp = 0;
    victim.armor = 0;
    victim.speedBoostUntil = 0;
    victim.damageBoostUntil = 0;
    victim.multiKillCount = 0;
    victim.lastKillAt = 0;
    victim.isAiming = false;
    victim.deaths += 1;
    victim.streak = 0;
    victim.reloadingUntil = 0;
    victim.reloadWeapon = null;
    victim.nextShellAt = 0;
    victim.invulnerableUntil = 0;
    victim.lastDeathX = victim.x;
    victim.lastDeathZ = victim.z;
    victim.respawnAt = now + MATCH_CONFIG.RESPAWN_DELAY_MS;

    const isTdm = room.gameMode === 'tdm';
    let adrenalineHeal = 0;
    const streakEvents = [];
    if (killer && killer.id !== victim.id && (!isTdm || !killer.team || killer.team !== victim.team)) {
      killer.kills += 1;
      killer.streak += 1;
      const multiWindow = MATCH_CONFIG.MULTI_KILL_WINDOW_MS || 4000;
      if (killer.lastKillAt && (now - killer.lastKillAt) <= multiWindow) {
        killer.multiKillCount = (killer.multiKillCount || 1) + 1;
      } else {
        killer.multiKillCount = 1;
      }
      killer.lastKillAt = now;

      if (isTdm && (killer.team === 'alpha' || killer.team === 'bravo')) {
        if (!room.teamScores) room.teamScores = { alpha: 0, bravo: 0 };
        room.teamScores[killer.team] = (room.teamScores[killer.team] || 0) + 1;
      }
      if (killer.alive) {
        const prevHp = Number(killer.hp) || 0;
        const maxHp = MATCH_CONFIG.MAX_HP || 100;
        const healAmount = MATCH_CONFIG.KILL_ADRENALINE_HEAL || KILL_ADRENALINE_HEAL || 25;
        killer.hp = Math.min(maxHp, prevHp + healAmount);
        adrenalineHeal = killer.hp - prevHp;
      }

      const maxArmor = MATCH_CONFIG.MAX_ARMOR || 50;
      if (killer.multiKillCount === 2) {
        streakEvents.push({
          type: 'multikill',
          badge: 'DOUBLE KILL',
          subtitle: `${killer.name} hạ 2 mục tiêu liên tiếp!`,
          rewardText: ''
        });
      } else if (killer.multiKillCount === 3) {
        streakEvents.push({
          type: 'multikill',
          badge: 'TRIPLE KILL',
          subtitle: `${killer.name} càn quét 3 mục tiêu liên tiếp!`,
          rewardText: ''
        });
      } else if (killer.multiKillCount >= 4) {
        streakEvents.push({
          type: 'multikill',
          badge: 'QUADRA KILL',
          subtitle: `${killer.name} hủy diệt ${killer.multiKillCount} mục tiêu liên tiếp!`,
          rewardText: ''
        });
      }

      if (killer.streak === 3) {
        if (killer.alive) {
          killer.armor = Math.min(maxArmor, (killer.armor || 0) + 25);
        }
        streakEvents.push({
          type: 'streak',
          badge: 'KILLING SPREE',
          subtitle: `${killer.name} đạt chuỗi 3 mạng!`,
          rewardText: '+25 GIÁP KEVLAR'
        });
      } else if (killer.streak === 5) {
        if (killer.alive) {
          killer.grenades = Math.min(2, (killer.grenades || 0) + 1);
          const wCfg = WEAPONS[killer.weapon] || WEAPONS.rifle;
          if (!wCfg.isMelee && !wCfg.infiniteAmmo) {
            killer.ammo = wCfg.magSize;
            if (killer.ammoByWeapon) killer.ammoByWeapon[killer.weapon] = wCfg.magSize;
          }
        }
        streakEvents.push({
          type: 'streak',
          badge: 'RAMPAGE',
          subtitle: `${killer.name} đạt chuỗi 5 mạng!`,
          rewardText: '+1 LỰU ĐẠN & ĐẦY BĂNG ĐẠN'
        });
      } else if (killer.streak === 7) {
        if (killer.alive) {
          killer.speedBoostUntil = Math.max(killer.speedBoostUntil || 0, now + 8000);
        }
        streakEvents.push({
          type: 'streak',
          badge: 'DOMINATING',
          subtitle: `${killer.name} thống trị đấu trường (7 mạng)!`,
          rewardText: 'TĂNG TỐC 8 GIÂY'
        });
      } else if (killer.streak >= 10 && (killer.streak === 10 || killer.streak % 5 === 0)) {
        if (killer.alive) {
          killer.armor = maxArmor;
          killer.damageBoostUntil = Math.max(killer.damageBoostUntil || 0, now + 8000);
        }
        streakEvents.push({
          type: 'streak',
          badge: 'UNSTOPPABLE',
          subtitle: `${killer.name} bất khả chiến bại (${killer.streak} mạng)!`,
          rewardText: 'CUỒNG NỘ SÁT THƯƠNG + ĐẦY GIÁP'
        });
      }

      if (victimPrevStreak >= 3) {
        if (killer.alive) {
          killer.armor = Math.min(maxArmor, (killer.armor || 0) + 25);
        }
        streakEvents.push({
          type: 'shutdown',
          badge: 'SHUTDOWN',
          subtitle: `${killer.name} chấm dứt chuỗi ${victimPrevStreak} mạng của ${victim.name}!`,
          rewardText: '+25 GIÁP THƯỞNG'
        });
      }
    }

    const isGrenadeKill = weaponId === 'grenade';
    const isBarrelKill = weaponId === 'barrel';
    const resolvedWeaponName = isGrenadeKill
      ? 'FRAG GRENADE'
      : isBarrelKill
        ? 'EXPLOSIVE BARREL'
        : (WEAPONS[weaponId]?.name || String(weaponId || 'rifle').toUpperCase());

    this.io.to(room.code).emit('killEvent', {
      killerId: killer ? killer.id : null,
      killerName: killer ? killer.name : 'Arena',
      killerColor: killer ? killer.color : 0xffffff,
      killerTeam: killer ? (killer.team || null) : null,
      victimId: victim.id,
      victimName: victim.name,
      victimColor: victim.color,
      victimTeam: victim.team || null,
      weapon: isGrenadeKill ? 'grenade' : isBarrelKill ? 'barrel' : resolvedWeaponName,
      weaponName: resolvedWeaponName,
      weaponId,
      isHeadshot: Boolean(isHeadshot),
      isWallbang: Boolean(isWallbang),
      killerStreak: killer ? killer.streak : 0,
      killerMultiKill: killer ? (killer.multiKillCount || 1) : 0,
      killerHp: killer ? killer.hp : 0,
      killerArmor: killer ? (killer.armor || 0) : 0,
      newKillerHp: killer ? killer.hp : 0,
      adrenalineHeal,
      healedHp: adrenalineHeal,
      healAmount: adrenalineHeal > 0 ? adrenalineHeal : (KILL_ADRENALINE_HEAL || 25),
      teamScores: isTdm ? { ...(room.teamScores || { alpha: 0, bravo: 0 }) } : undefined,
      droppedWeapon
    });

    for (const se of streakEvents) {
      this.io.to(room.code).emit('streakEvent', {
        playerId: killer.id,
        playerName: killer.name,
        playerColor: killer.color,
        streak: killer.streak,
        multiKill: killer.multiKillCount || 1,
        label: se.badge,
        ...se
      });
    }

    if (victim) {
      this.sendSelfState(victim, now, true);
    }
    if (killer && killer.id !== victim.id && (adrenalineHeal > 0 || streakEvents.length > 0)) {
      this.sendSelfState(killer, now, true);
    }

    // Check win condition (TDM: 30 team kills; FFA: 20 individual kills)
    if (room.state === 'PLAYING' && killer && killer.id !== victim.id) {
      if (isTdm) {
        const tdmLimit = room.killLimit || MATCH_CONFIG.TDM_KILL_LIMIT || 30;
        const teamKills = killer.team ? (room.teamScores?.[killer.team] || 0) : 0;
        if (teamKills >= tdmLimit) {
          this.endMatch(room, killer, killer.team);
        }
      } else if (killer.kills >= (room.killLimit || MATCH_CONFIG.KILL_LIMIT || 20)) {
        this.endMatch(room, killer);
      }
    }
  }
}
