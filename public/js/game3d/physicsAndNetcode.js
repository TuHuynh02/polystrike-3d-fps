import * as THREE from '../three.js';
import {
  BTN,
  DEFAULT_MAP_ID,
  FIXED_DT,
  INTERP_DELAY_MAX_MS,
  MATCH_CONFIG,
  WEAPONS,
  WEAPON_ORDER,
  commandTimeMs,
  computeSpreadAmount,
  createMovementState,
  createShotState,
  getEffectiveFireRateMs,
  getMapConfig,
  hasLineOfSight,
  isFireIntervalOk,
  isPointInsideInflatedBoxes,
  isValidMoveAck,
  planShot,
  resetShotState,
  stepCommand,
  stepGrenade
} from '../shared.js';
import { ClientPrediction, INPUT_BATCH_INTERVAL_MS } from '../prediction.js';
import { SnapshotInterpolator } from '../snapshotBuffer.js';
import { buildSkyAndAtmosphere, buildArena } from '../arenaBuilder.js';
import { createWeaponMesh, setWeaponAdsCulling } from '../weaponModels.js';
import {
  createRemotePlayerMesh,
  animateHumanoidRig,
  disposeObject3D,
  getCachedGeo
} from '../humanoidRig.js';
import { TacticalMinimap } from '../minimap.js';
import { sfx } from '../audio.js';
import {
  PerfOverlay,
  QUALITY,
  applyMetalnessCap,
  detectInitialTier,
  isPerfOverlayRequested,
  loadQualityChoice,
  resolveTier,
  saveQualityChoice
} from '../quality.js';
import { getAssetManager } from '../assets.js';
import { applyPbrToSlots, revertPbrSlots, surfaceSetsForMap } from '../surfaceMaterials.js';
import { CRATE_MODEL_NAMES } from '../arenaProps.js';
import { applyWeaponAssetOverride, isWeaponOverrideEnabled, measureWeaponGroup } from '../weaponAssetOverrides.js';
import { refreshCs2WeaponEnvMap, resetCs2ViewmodelParts } from '../weapons/cs2WeaponGlb.js';
import { resetFpsArmsPose, updateFpsArmsReloadPose } from '../weapons/fpsArmsRig.js';

function cs2Smoothstep(a, b, x) {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

export function shadowTypeFor(kind) {
  if (kind === 'pcfsoft') return THREE.PCFSoftShadowMap;
  if (kind === 'pcf') return THREE.PCFShadowMap;
  return THREE.BasicShadowMap;
}

export const DEATH_BODY_MAX_MS = 1500;

export class PhysicsAndNetcodeMethods {
  spawnLocalPlayer(data) {
    this.position.set(data.x, data.y || 0.1, data.z);
    this.velocity.set(0, 0, 0);
    // Same starting state the server gives a freshly (re)spawned player (RoomManager.resetPlayerMovement)
    this.onGround = true;
    this.wasOnGround = true;
    this.lastGroundedAt = commandTimeMs(this.prediction.lastAckedSeq);
    this.jumpQueuedUntil = 0;
    this.slideUntil = 0;
    this.slideCooldownUntil = 0;
    this.stepOffsetY = 0;
    this.yaw = data.yaw || 0;
    this.pitch = 0;
    this.cameraRoll = 0;
    this.alive = true;
    this.armor = 0;
    this.speedBoostUntil = 0;
    this.taggedUntil = 0;
    this.damageBoostUntil = 0;
    this.lastShotAt = -1000;
    this.reloadingUntil = 0;
    this.nextShellAt = 0;
    this.pumpCycleUntil = 0;
    this.isMouseDown = false;
    this.isRightMouseDown = false;
    this.adsToggleActive = false;
    this.isAiming = false;
    this.isSprinting = false;
    this.barrelHeat = 0;
    this.inspectUntil = 0;
    if (this.vmSprings) {
      for (const s of Object.values(this.vmSprings)) {
        if (s && typeof s === 'object') {
          s.x = 0;
          s.v = 0;
        }
      }
    }
    for (const wId of WEAPON_ORDER) {
      const vm = this.viewmodelMeshes[wId];
      setWeaponAdsCulling(vm, false);
      if (vm?.userData?.isCs2Glb) {
        resetCs2ViewmodelParts(vm);
      }
      if (vm?.userData?.activeWeaponMesh) {
        vm.userData.activeWeaponMesh.rotation.set(0, 0, 0);
        if (vm.userData.knifePivotBasePos) {
          vm.userData.activeWeaponMesh.position.copy(vm.userData.knifePivotBasePos);
        }
      }
      if (vm?.userData?.barrelHeatMesh && vm?.userData?.barrelHeatMat) {
        vm.userData.barrelHeatMat.opacity = 0;
        vm.userData.barrelHeatMesh.visible = false;
      }
    }
    this.isSliding = false;
    this._slideTapActive = false;
    this.crouching = false;
    this.prone = false;
    this.currentLean = 0;
    this.slideUntil = 0;
    this.currentBloom = 0;
    this.crosshairRecoilKick = 0;
    this.accumulatedRecoilPitch = 0;
    this.accumulatedRecoilYaw = 0;
    this.pendingRecoilPitch = 0;
    this.pendingRecoilYaw = 0;
    this.recoilShotIndex = 0;
    this.punchPitch = 0;
    this.punchRoll = 0;
    this.flinchPitch = 0;
    this.flinchRoll = 0;
    // New life: the server restarted this player's shot session (fresh bloom, fire-rate clock, new seed)
    this.pendingFire = null;
    this.predictedShots.length = 0;
    this._refundedShotSeqs.clear();
    this.lastShotRejected = null;
    this.hp = typeof data.hp === 'number' ? data.hp : (MATCH_CONFIG.MAX_HP || 100);
    resetShotState(this.shotState);
    this.lastFireCmdTimeMs = -Infinity;
    if (Number.isInteger(data.spreadSeed)) this.setSpreadSeed(data.spreadSeed);
    this.meleeSwingUntil = 0;
    this.grenadeThrowUntil = 0;
    this.cancelGrenadeCooking();
    this.grenades = typeof data.grenades === 'number' ? data.grenades : 1;
    this.callbacks.onGrenadeChanged?.(this.grenades);
    for (const wId of WEAPON_ORDER) {
      this.ammoByWeapon[wId] = data.ammoByWeapon?.[wId] ?? WEAPONS[wId].magSize;
      this.reserveAmmoByWeapon[wId] = data.reserveAmmoByWeapon?.[wId] ?? (WEAPONS[wId].reserveAmmo ?? WEAPONS[wId].magSize * 3);
    }
    if (data.loadout) {
      this.setLoadout(data.loadout, data.weapon || data.loadout.primary);
    } else if (data.weapon && WEAPONS[data.weapon]) {
      this.switchWeapon(data.weapon);
    }
    const wCfg = WEAPONS[this.currentWeapon] || WEAPONS.rifle;
    this.callbacks.onAimChange?.(false, this.currentWeapon);
    this.callbacks.onWeaponChanged?.(
      this.currentWeapon,
      this.ammoByWeapon[this.currentWeapon] ?? wCfg.magSize,
      this.reserveAmmoByWeapon[this.currentWeapon] ?? wCfg.reserveAmmo ?? wCfg.magSize
    );
  }

  /**
   * Copies the authoritative Game3D movement fields into the shared movement state (so external writes such as
   * respawn teleports, prone toggles or key handlers that clear isSliding/isSprinting are always honoured).
   */
  syncMoveStateIn() {
    const ms = this.moveState;
    ms.x = this.position.x;
    ms.y = this.position.y;
    ms.z = this.position.z;
    ms.vx = this.velocity.x;
    ms.vy = this.velocity.y;
    ms.vz = this.velocity.z;
    ms.onGround = this.onGround;
    ms.wasOnGround = this.wasOnGround;
    ms.lastGroundedAt = this.lastGroundedAt;
    ms.jumpQueuedUntil = this.jumpQueuedUntil;
    ms.isSliding = this.isSliding;
    ms.slideUntil = this.slideUntil;
    ms.slideCooldownUntil = this.slideCooldownUntil;
    ms.slideDirX = this.slideDir.x;
    ms.slideDirZ = this.slideDir.z;
    ms.crouching = this.crouching;
    ms.prone = this.prone;
    this.isSprinting = Boolean(this.isSprinting);
    ms.isSprinting = this.isSprinting;
    ms.stepOffsetY = this.stepOffsetY || 0;
  }

  syncMoveStateOut() {
    const ms = this.moveState;
    this.position.set(ms.x, ms.y, ms.z);
    this.velocity.set(ms.vx, ms.vy, ms.vz);
    this.onGround = ms.onGround;
    this.wasOnGround = ms.wasOnGround;
    this.lastGroundedAt = ms.lastGroundedAt;
    this.jumpQueuedUntil = ms.jumpQueuedUntil;
    this.isSliding = ms.isSliding;
    this.slideUntil = ms.slideUntil;
    this.slideCooldownUntil = ms.slideCooldownUntil;
    this.slideDir.set(ms.slideDirX, 0, ms.slideDirZ);
    this.crouching = ms.crouching;
    this.prone = ms.prone;
    this.isSprinting = ms.isSprinting;
    this.stepOffsetY = ms.stepOffsetY;
  }

  /**
   * Runs the shared movement module for the elapsed real frame time using a fixed timestep (FIXED_DT):
   * frame time is accumulated (clamped to 0.1s, max 6 steps per frame) and consumed in whole steps; the
   * leftover fraction becomes `physAlpha` for render interpolation between the previous and current step pose.
   */
  advanceFixedPhysics(frameDt) {
    if (!this.inMatch || !this.alive) {
      this.physicsAccumulator = 0;
      this.physAlpha = 1;
      return;
    }

    // A respawn / external teleport moved the player since the last step: do not interpolate across it
    const tracked = this.physTracked;
    if (
      Math.abs(this.position.x - tracked.x) > 1e-5 ||
      Math.abs(this.position.y - tracked.y) > 1e-5 ||
      Math.abs(this.position.z - tracked.z) > 1e-5
    ) {
      this.physPrev.x = this.position.x;
      this.physPrev.y = this.position.y;
      this.physPrev.z = this.position.z;
      this.physPrev.stepOffsetY = this.stepOffsetY || 0;
      tracked.x = this.position.x;
      tracked.y = this.position.y;
      tracked.z = this.position.z;
      this.physicsAccumulator = 0;
    }

    this.physicsAccumulator += Math.min(0.1, Math.max(0, frameDt));

    const now = performance.now();
    const activeCfg = WEAPONS[this.currentWeapon];
    const canShootWhileReloading = Boolean(
      activeCfg?.shellByShell && (this.ammoByWeapon[this.currentWeapon] ?? 0) > 0
    );
    if (
      this.isMouseDown &&
      activeCfg?.automatic &&
      this.isPointerLocked &&
      !this.pendingFire &&
      (this.reloadingUntil <= now || canShootWhileReloading)
    ) {
      this.attemptShoot();
    }
    const f = this.cmdFields;
    f.moveForward = 0;
    f.moveRight = 0;
    if (this.isPointerLocked) {
      if (this.keys.KeyW) f.moveForward += 1;
      if (this.keys.KeyS) f.moveForward -= 1;
      if (this.keys.KeyD) f.moveRight += 1;
      if (this.keys.KeyA) f.moveRight -= 1;
    }
    f.wantsCrouch = Boolean(this.keys.KeyC || this.keys.ControlLeft);
    f.wantsSprint = Boolean(this.keys.ShiftLeft || this.keys.ShiftRight) &&
      now - this.lastShotAt > 110;
    f.wantsJump = Boolean(this.keys.Space) && this.isPointerLocked; // jumps are neither queued nor consumed while input is disabled
    f.isAdsHeld = this.isRightMouseDown;
    f.weapon = this.currentWeapon;
    f.speedBoost = Boolean(this.speedBoostUntil && now < this.speedBoostUntil);
    f.tagged = Boolean(this.taggedUntil && now < this.taggedUntil);

    const mapCfg = this.getMovementMapCfg();

    let steps = 0;
    while (this.physicsAccumulator >= FIXED_DT && steps < 6) {
      this.physicsAccumulator -= FIXED_DT;
      steps++;

      this.physPrev.x = this.position.x;
      this.physPrev.y = this.position.y;
      this.physPrev.z = this.position.z;
      this.physPrev.stepOffsetY = this.stepOffsetY || 0;

      // One input command per fixed step: simulated here with the exact code the server runs, then sent in `inputBatch`
      const nextSimMs = commandTimeMs(this.prediction.nextSeq + 1);
      if (this._slideTapActive && this.isSliding && nextSimMs >= this.slideUntil) {
        this._slideTapActive = false;
      }
      f.wantsCrouch = Boolean(
        this.keys.KeyC ||
        this.keys.ControlLeft ||
        (this._slideTapActive && (this.isSliding || !this.crouching))
      );
      f.yaw = this.yaw;
      f.pitch = this.pitch;
      f.lean = this.currentLean;
      f.wantsProne = this.prone;
      f.isAiming = this.isAiming;

      // A queued trigger pull goes out on the first step whose sim time satisfies the weapon's fire interval - the very rule
      // the server applies to the command (isFireIntervalOk), so a legitimate client is never rejected for rate.
      f.fire = false;
      f.shotSeq = 0;
      const pending = this.pendingFire;
      if (pending) {
        const blockedByReload =
          !pending.autoReloaded &&
          this.reloadingUntil > now &&
          !(WEAPONS[this.currentWeapon]?.shellByShell && (this.ammoByWeapon[this.currentWeapon] ?? 0) > 0);
        if (pending.weapon !== this.currentWeapon || !this.alive || blockedByReload) {
          if (pending.ammoConsumed) {
            const wCfg = WEAPONS[pending.weapon];
            const maxMag = wCfg ? wCfg.magSize : 30;
            this.ammoByWeapon[pending.weapon] = Math.min(maxMag, (this.ammoByWeapon[pending.weapon] ?? 0) + 1);
          }
          this.pendingFire = null; // switched weapons / died / reloading before the shot could leave
        } else if (
          isFireIntervalOk(
            nextSimMs,
            this.lastFireCmdTimeMs,
            getEffectiveFireRateMs(WEAPONS[this.currentWeapon], this.isAiming)
          )
        ) {
          f.fire = true;
          f.shotSeq = this.shotSeq + 1;
          if (pending.recoilDrainedPitch || pending.recoilDrainedYaw) {
            f.pitch = Math.max(-Math.PI / 2 + 0.05, Math.min(Math.PI / 2 - 0.05, this.pitch - (pending.recoilDrainedPitch || 0)));
            f.yaw = this.yaw - (pending.recoilDrainedYaw || 0);
          }
        }
      }

      const cmd = this.prediction.buildCommand(f);
      this.syncMoveStateIn();
      this.simTimeMs = commandTimeMs(cmd.seq);
      const res = stepCommand(this.moveState, cmd, mapCfg, this.cmdScratchInput);
      this.syncMoveStateOut();
      this.prediction.record(cmd, this.moveState);
      if (!this.isSliding) {
        this._slideTapActive = false;
      }

      if ((cmd.btn & BTN.FIRE) !== 0) {
        this.shotSeq = cmd.ss;
        this.lastFireCmdTimeMs = commandTimeMs(cmd.seq);
        this.predictedShots.push({
          ss: cmd.ss,
          seq: cmd.seq,
          weapon: cmd.w,
          ammoConsumed: Boolean(pending?.ammoConsumed ?? (!WEAPONS[cmd.w]?.isMelee && !WEAPONS[cmd.w]?.infiniteAmmo)),
          autoReloaded: Boolean(pending?.autoReloaded),
          refunded: false
        });
        if (this.predictedShots.length > 64) {
          this.predictedShots.shift();
        }
        this.pendingFire = null;
        this.predictFireCommand(cmd, res);
      }

      tracked.x = this.position.x;
      tracked.y = this.position.y;
      tracked.z = this.position.z;

      if (res.aimCancelled) {
        this.isAiming = false;
        this.adsToggleActive = false;
        this.callbacks.onAimChange?.(false, this.currentWeapon);
      }
      if (res.slideStarted) {
        this.landingDipVel = Math.min(this.landingDipVel || 0, -1.35);
        this.vmSpringImpulse?.('jY', -0.45);
        this.vmSpringImpulse?.('jP', 0.35);
        this.callbacks.onSlide?.();
      }
      if (res.jumpPadTriggered) {
        this.vmSpringImpulse?.('jY', 0.85);
        this.vmSpringImpulse?.('jP', -0.65);
        this.callbacks.onJumpPad?.(res.jumpPadTriggered);
      } else if (res.jumped) {
        this.vmSpringImpulse?.('jY', 0.48);
        this.vmSpringImpulse?.('jP', -0.38);
        this.callbacks.onJump?.();
      }
      if (res.landed) {
        this.landingDipVel = -2.2 * res.impact;
        this.vmSpringImpulse?.('jY', -0.75 * res.impact);
        this.vmSpringImpulse?.('jP', 0.55 * res.impact);
        this.callbacks.onLand?.(res.impact);
      }
    }
    // Over budget (frame hitch): drop the unsimulated remainder instead of spiralling
    if (this.physicsAccumulator >= FIXED_DT) {
      this.physicsAccumulator %= FIXED_DT;
    }
    this.physAlpha = this.physicsAccumulator / FIXED_DT;
  }

  /** Map description handed to the movement module (shared object, refreshed from the current map). */
  getMovementMapCfg() {
    const mapCfg = this._movementMapCfg || (this._movementMapCfg = { obstacles: [], arenaHalfSize: MATCH_CONFIG.ARENA_HALF_SIZE });
    mapCfg.obstacles = this.currentObstacles || [];
    mapCfg.arenaHalfSize = this.arenaHalfSize || MATCH_CONFIG.ARENA_HALF_SIZE;
    mapCfg.jumpPads = this.currentMapConfig?.jumpPads || [];
    return mapCfg;
  }

  /** Forgets all prediction history (joined a new room); `epoch` is the server's movement epoch when known. */
  resetNetcode(epoch = 0) {
    this.prediction.reset(Number.isFinite(epoch) ? epoch : 0);
    this.lastInputBatchAt = 0;
    // A new server-side player starts with lastShotSeq = 0
    this.shotSeq = 0;
    this.pendingFire = null;
    this.predictedShots.length = 0;
    this._refundedShotSeqs.clear();
    this.lastShotRejected = null;
    resetShotState(this.shotState);
    this.lastFireCmdTimeMs = -Infinity;
  }

  /** Stores the owner-only 32-bit spread seed the server gave this life (`roomJoined.player.spreadSeed` / `selfSeed`). */
  setSpreadSeed(seed) {
    if (Number.isInteger(seed)) this.spreadSeed = seed >>> 0;
  }

  /**
   * Handles an owner-only `shotRejected { ss, reason }` from the server: refunds the predicted round for `ss`,
   * cancels still-visible shot effects (tracer, muzzle flash, auto-reload triggered by an empty mag) and notifies HUD.
   */
  applyShotRejected(data) {
    if (!this.inMatch || !data || typeof data !== 'object') return false;
    const ss = data.ss;
    const reason = typeof data.reason === 'string' ? data.reason : 'unknown';
    if (!Number.isSafeInteger(ss) || ss <= 0) return false;
    if (this._refundedShotSeqs.has(ss)) return false;

    let entry = null;
    for (let i = this.predictedShots.length - 1; i >= 0; i--) {
      if (this.predictedShots[i].ss === ss) {
        entry = this.predictedShots[i];
        break;
      }
    }
    if (entry && entry.refunded) return false;

    this._refundedShotSeqs.add(ss);
    if (this._refundedShotSeqs.size > 128) {
      const first = this._refundedShotSeqs.values().next().value;
      this._refundedShotSeqs.delete(first);
    }
    if (entry) {
      entry.refunded = true;
    }

    const wId = entry?.weapon || (typeof data.weapon === 'string' && WEAPONS[data.weapon] ? data.weapon : this.currentWeapon);
    const cfg = WEAPONS[wId] || WEAPONS.rifle;
    const shouldRefundAmmo = entry ? entry.ammoConsumed : Boolean(!cfg.isMelee && !cfg.infiniteAmmo);

    if (shouldRefundAmmo) {
      const cur = this.ammoByWeapon[wId] ?? 0;
      this.ammoByWeapon[wId] = Math.min(cfg.magSize, cur + 1);
    }

    // If this rejected shot had emptied the magazine and auto-triggered a local reload, cancel that bogus reload
    if (entry?.autoReloaded && this.reloadingUntil > 0 && wId === this.currentWeapon) {
      this.reloadingUntil = 0;
      this.nextShellAt = 0;
      const activeVm = this.viewmodelMeshes?.[wId];
      if (activeVm?.userData?.isCs2Glb) {
        resetCs2ViewmodelParts(activeVm);
      }
      if (activeVm?.userData?.magMesh && activeVm.userData.magMesh.userData.basePos) {
        activeVm.userData.magMesh.position.copy(activeVm.userData.magMesh.userData.basePos);
      }
      if (activeVm?.userData?.boltMesh && typeof activeVm.userData.boltMesh.userData.baseZ === 'number') {
        activeVm.userData.boltMesh.position.z = activeVm.userData.boltMesh.userData.baseZ;
      }
      this.callbacks.onReloadCancel?.(
        wId,
        this.ammoByWeapon[wId],
        this.reserveAmmoByWeapon[wId] ?? cfg.reserveAmmo ?? 0
      );
    }

    // Cancel visual tracer / muzzle flash if still active
    if (Array.isArray(this.activeEffects)) {
      for (let i = this.activeEffects.length - 1; i >= 0; i--) {
        const fx = this.activeEffects[i];
        if (fx.type === 'tracer' && fx.ss === ss) {
          this._recycleTracerEffect(fx);
          this.activeEffects.splice(i, 1);
        }
      }
    }
    if (ss === this.shotSeq) {
      const activeVm = this.viewmodelMeshes?.[this.currentWeapon];
      if (activeVm?.userData?.flashMesh) {
        activeVm.userData.flashMesh.visible = false;
      }
      if (this.muzzleLight) {
        this.muzzleLight.intensity = 0;
      }
      this.pumpCycleUntil = 0;
      this.boltKickOffset = 0;
      this.recoilOffset = 0;
    }

    this.lastShotRejected = { ss, reason, weapon: wId };
    if (wId === this.currentWeapon) {
      this.callbacks.onWeaponChanged?.(
        wId,
        this.ammoByWeapon[wId],
        this.reserveAmmoByWeapon[wId] ?? cfg.reserveAmmo ?? 0
      );
    }
    this.callbacks.onShotRejected?.({
      ss,
      reason,
      weapon: wId,
      ammo: this.ammoByWeapon[wId],
      reserveAmmo: this.reserveAmmoByWeapon[wId] ?? cfg.reserveAmmo ?? 0
    });
    return true;
  }

  applyTagging(durationMs = MATCH_CONFIG.TAGGING_DURATION_MS || 220, localNowMs = undefined) {
    if (!this.inMatch) return;
    const ms = Number(durationMs);
    if (!Number.isFinite(ms) || ms <= 0) return;
    const now = typeof localNowMs === 'number' ? localNowMs : performance.now();
    this.taggedUntil = Math.max(this.taggedUntil || 0, now + ms);
  }

  /**
   * Reconciles owner-only authoritative combat state (`selfState`) from the server:
   * `{ seq?, lastShotSeq, hp, alive?, weapon, ammo, reserveAmmo, ammoByWeapon, reserveAmmoByWeapon, reloading, grenades }`.
   * - If no unacknowledged FIRE commands remain in flight, server ammo / reserve / reload / HP overwrite local values.
   * - If FIRE commands after `lastShotSeq` are still in flight, local ammo keeps the prediction by subtracting the
   *   still-in-flight shots from the server's authoritative count at `lastShotSeq`.
   */
  applySelfState(state, localNowMs = undefined) {
    if (!this.inMatch || !state || typeof state !== 'object') return false;
    const now = typeof localNowMs === 'number' ? localNowMs : performance.now();
    const serverShotSeq = Number.isSafeInteger(state.lastShotSeq) ? state.lastShotSeq : 0;
    const hasServerCmdSeq = Number.isSafeInteger(state.seq);
    const ackedCmdSeq = Math.max(
      hasServerCmdSeq ? state.seq : 0,
      this.prediction?.lastAckedSeq || 0
    );

    // Prune predictedShots that the server has already adjudicated (by shotSeq or by command seq)
    let maxTrackedSs = 0;
    for (let i = this.predictedShots.length - 1; i >= 0; i--) {
      const entry = this.predictedShots[i];
      if (entry.ss > maxTrackedSs) maxTrackedSs = entry.ss;
      const settledByShotSeq = entry.ss <= serverShotSeq;
      const settledByCmdSeq = hasServerCmdSeq && entry.seq > 0 && entry.seq <= ackedCmdSeq;
      if (settledByShotSeq || settledByCmdSeq) {
        this.predictedShots.splice(i, 1);
      }
    }

    if (serverShotSeq > this.shotSeq) {
      this.shotSeq = serverShotSeq;
    }

    // Count still-in-flight (unacknowledged, non-refunded) shots per weapon
    const inFlightByWeapon = {};
    let totalInFlight = 0;
    for (let i = 0; i < this.predictedShots.length; i++) {
      const entry = this.predictedShots[i];
      if (!entry.refunded && entry.ss > serverShotSeq) {
        if (entry.ammoConsumed) {
          inFlightByWeapon[entry.weapon] = (inFlightByWeapon[entry.weapon] || 0) + 1;
        }
        totalInFlight += 1;
      }
    }
    // Fallback for synthetic tests that bumped `this.shotSeq` directly without pushing to `predictedShots`
    const untrackedFloor = Math.max(serverShotSeq, maxTrackedSs);
    if (!hasServerCmdSeq && this.shotSeq > untrackedFloor) {
      for (let ss = untrackedFloor + 1; ss <= this.shotSeq; ss++) {
        if (!this._refundedShotSeqs.has(ss)) {
          const w = this.currentWeapon;
          if (!WEAPONS[w]?.isMelee && !WEAPONS[w]?.infiniteAmmo) {
            inFlightByWeapon[w] = (inFlightByWeapon[w] || 0) + 1;
          }
          totalInFlight += 1;
        }
      }
    }
    if (this.pendingFire) {
      if (this.pendingFire.ammoConsumed) {
        const w = this.pendingFire.weapon;
        inFlightByWeapon[w] = (inFlightByWeapon[w] || 0) + 1;
      }
      totalInFlight += 1;
    }

    // Reconcile HP and alive
    if (typeof state.hp === 'number' && Number.isFinite(state.hp)) {
      this.hp = Math.max(0, Math.min(MATCH_CONFIG.MAX_HP || 100, Math.round(state.hp)));
    }
    if (typeof state.armor === 'number' && Number.isFinite(state.armor)) {
      this.armor = Math.max(0, Math.min(MATCH_CONFIG.MAX_ARMOR || 50, Math.round(state.armor)));
    }
    if (typeof state.speedBoostMs === 'number' && Number.isFinite(state.speedBoostMs)) {
      this.speedBoostUntil = state.speedBoostMs > 0 ? now + state.speedBoostMs : 0;
    }
    if (typeof state.damageBoostMs === 'number' && Number.isFinite(state.damageBoostMs)) {
      this.damageBoostUntil = state.damageBoostMs > 0 ? now + state.damageBoostMs : 0;
    }
    if (typeof state.taggedMs === 'number' && Number.isFinite(state.taggedMs)) {
      this.taggedUntil = state.taggedMs > 0 ? now + state.taggedMs : 0;
    }
    if (typeof state.alive === 'boolean') {
      this.alive = state.alive;
      if (!this.alive) {
        this._slideTapActive = false;
        this.pendingFire = null;
        this.predictedShots.length = 0;
        this.reloadingUntil = 0;
        this.nextShellAt = 0;
      }
    }

    // Reconcile grenades (unless a local throw is in flight)
    if (typeof state.grenades === 'number' && Number.isFinite(state.grenades)) {
      const isThrowInFlight = state.grenades > this.grenades && (now - (this.lastGrenadeThrowAt || 0)) < 400;
      if (!isThrowInFlight) {
        this.setGrenadeCount(state.grenades);
      }
    }

    // Reconcile reserveAmmoByWeapon and ammoByWeapon
    if (state.reserveAmmoByWeapon && typeof state.reserveAmmoByWeapon === 'object') {
      for (const [wId, res] of Object.entries(state.reserveAmmoByWeapon)) {
        if (WEAPONS[wId] && typeof res === 'number' && Number.isFinite(res)) {
          this.reserveAmmoByWeapon[wId] = Math.max(0, Math.round(res));
        }
      }
    }
    if (state.weapon && WEAPONS[state.weapon] && typeof state.reserveAmmo === 'number' && Number.isFinite(state.reserveAmmo)) {
      this.reserveAmmoByWeapon[state.weapon] = Math.max(0, Math.round(state.reserveAmmo));
    }

    if (state.ammoByWeapon && typeof state.ammoByWeapon === 'object') {
      for (const [wId, serverAmmo] of Object.entries(state.ammoByWeapon)) {
        if (WEAPONS[wId] && typeof serverAmmo === 'number' && Number.isFinite(serverAmmo)) {
          const inFlight = inFlightByWeapon[wId] || 0;
          const maxMag = WEAPONS[wId].magSize;
          this.ammoByWeapon[wId] = Math.max(0, Math.min(maxMag, Math.round(serverAmmo) - inFlight));
        }
      }
    }
    if (state.weapon && WEAPONS[state.weapon] && typeof state.ammo === 'number' && Number.isFinite(state.ammo)) {
      const wId = state.weapon;
      const inFlight = inFlightByWeapon[wId] || 0;
      const maxMag = WEAPONS[wId].magSize;
      this.ammoByWeapon[wId] = Math.max(0, Math.min(maxMag, Math.round(state.ammo) - inFlight));
    }

    // Reconcile reload state when no FIRE commands are in flight
    if (totalInFlight === 0) {
      const rel = state.reloading;
      if (rel && typeof rel === 'object' && Number(rel.remainingMs) > 0) {
        const rWep = (typeof rel.weapon === 'string' && WEAPONS[rel.weapon]) ? rel.weapon : this.currentWeapon;
        const rCfg = WEAPONS[rWep] || WEAPONS.rifle;
        const remMs = Math.max(1, Number(rel.remainingMs));
        const wasReloading = this.reloadingUntil > now;
        this.reloadingUntil = now + remMs;
        if (!wasReloading || !this.reloadDuration) {
          this.reloadDuration = Math.max(remMs, rCfg.reloadMs || 1500);
        }
        if (rCfg.shellByShell) {
          this.reloadMode = 'shell';
          const shellMs = rCfg.shellReloadMs || 390;
          const nextShellRem = ((remMs - 1) % shellMs) + 1;
          this.nextShellAt = now + nextShellRem;
        } else if (!this.reloadMode || this.reloadMode === 'shell') {
          this.reloadMode = (this.ammoByWeapon[rWep] ?? 0) > 0 ? 'tactical' : 'empty';
          this.nextShellAt = 0;
        }
      } else if (this.reloadingUntil > 0) {
        // Server says not reloading (reload completed or cancelled)
        this.reloadingUntil = 0;
        this.nextShellAt = 0;
        const wId = this.currentWeapon;
        const activeVm = this.viewmodelMeshes?.[wId];
        if (activeVm?.userData?.isCs2Glb) {
          resetCs2ViewmodelParts(activeVm);
        }
        if (activeVm?.userData?.magMesh && activeVm.userData.magMesh.userData.basePos) {
          activeVm.userData.magMesh.position.copy(activeVm.userData.magMesh.userData.basePos);
        }
        if (activeVm?.userData?.boltMesh && typeof activeVm.userData.boltMesh.userData.baseZ === 'number') {
          activeVm.userData.boltMesh.position.z = activeVm.userData.boltMesh.userData.baseZ;
        }
        const wCfg = WEAPONS[wId] || WEAPONS.rifle;
        this.callbacks.onReloadComplete?.(
          wId,
          this.ammoByWeapon[wId] ?? wCfg.magSize,
          this.reserveAmmoByWeapon[wId] ?? wCfg.reserveAmmo ?? 0
        );
      }
    }

    const curWep = this.currentWeapon;
    const curCfg = WEAPONS[curWep] || WEAPONS.rifle;
    this.callbacks.onWeaponChanged?.(
      curWep,
      this.ammoByWeapon[curWep] ?? curCfg.magSize,
      this.reserveAmmoByWeapon[curWep] ?? curCfg.reserveAmmo ?? 0
    );
    this.callbacks.onSelfState?.({
      hp: this.hp,
      armor: this.armor,
      speedBoostMs: this.speedBoostUntil > now ? Math.max(0, Math.round(this.speedBoostUntil - now)) : 0,
      damageBoostMs: this.damageBoostUntil > now ? Math.max(0, Math.round(this.damageBoostUntil - now)) : 0,
      taggedMs: this.taggedUntil > now ? Math.max(0, Math.round(this.taggedUntil - now)) : 0,
      alive: this.alive,
      weapon: curWep,
      ammo: this.ammoByWeapon[curWep],
      reserveAmmo: this.reserveAmmoByWeapon[curWep],
      reloading: this.reloadingUntil > now
        ? { weapon: curWep, remainingMs: Math.max(0, Math.round(this.reloadingUntil - now)) }
        : null,
      grenades: this.grenades,
      inFlightShots: totalInFlight
    });
    return true;
  }

  /**
   * Server reconciliation for a `moveAck` (sent to us only). Epoch change => snap to the server state. Otherwise the
   * ack is compared with what was predicted for that command; a mismatch replays the unacked commands from the server
   * state. The camera keeps a decaying offset so small corrections are not visible; > RECONCILE_HARD_SNAP is instant.
   * Returns the correction kind: 'ignored' | 'epoch' | 'replay' | 'hardsnap'.
   */
  applyMoveAck(ack) {
    if (!this.inMatch || !isValidMoveAck(ack)) return 'ignored';
    this.syncMoveStateIn();
    const out = this.prediction.onAck(ack, this.getMovementMapCfg(), this.moveState);
    if (out.kind === 'ignored') return out.kind;

    const prevX = this.position.x;
    const prevY = this.position.y;
    const prevZ = this.position.z;
    Object.assign(this.moveState, out.state);
    this.syncMoveStateOut();

    const prev = this.physPrev;
    if (out.kind === 'replay') {
      // The whole interpolation window moves with the head, so the rendered pose only changes through the visual offset
      prev.x += this.position.x - prevX;
      prev.y += this.position.y - prevY;
      prev.z += this.position.z - prevZ;
    } else {
      prev.x = this.position.x;
      prev.y = this.position.y;
      prev.z = this.position.z;
    }
    prev.stepOffsetY = this.stepOffsetY || 0;
    const tracked = this.physTracked;
    tracked.x = this.position.x;
    tracked.y = this.position.y;
    tracked.z = this.position.z;
    return out.kind;
  }

  vmSpringImpulse(key, dv) {
    const s = this.vmSprings?.[key];
    if (s) {
      s.v = Math.max(-9, Math.min(9, s.v + dv));
    }
  }

  stepVmSprings(dt) {
    const bank = this.vmSprings;
    if (!bank) return;
    const list = this._vmSpringList || (this._vmSpringList = [
      bank.kZ, bank.kP, bank.kY, bank.kR, bank.swX, bank.swY, bank.jY, bank.jP, bank.bump
    ]);
    const clampedDt = Math.min(0.05, Math.max(0, dt));
    const steps = Math.min(8, Math.max(1, Math.ceil(clampedDt / 0.008)));
    const h = clampedDt / steps;
    for (let idx = 0; idx < list.length; idx++) {
      const s = list[idx];
      if (!s) continue;
      for (let i = 0; i < steps; i++) {
        const acc = -s.k * s.x - s.d * s.v;
        s.v += acc * h;
        s.x += s.v * h;
      }
      if (Math.abs(s.x) < 1e-5 && Math.abs(s.v) < 1e-5) {
        s.x = 0;
        s.v = 0;
      }
    }
  }

  updateLocalPhysics(dt) {
    if (!this.inMatch || !this.alive) return;

    const now = performance.now();
    const cfg = WEAPONS[this.currentWeapon];

    // Advance shell-by-shell shotgun reload or magazine reload completion
    if (this.reloadingUntil) {
      const wId = this.currentWeapon;
      if (cfg.shellByShell && this.reloadMode === 'shell') {
        if (this.nextShellAt > 0 && now >= this.nextShellAt) {
          const curAmmo = this.ammoByWeapon[wId] ?? 0;
          const resAmmo = this.reserveAmmoByWeapon[wId] ?? 0;
          if (curAmmo < cfg.magSize && resAmmo > 0) {
            this.ammoByWeapon[wId] = curAmmo + 1;
            this.reserveAmmoByWeapon[wId] = resAmmo - 1;
          }
          const nextAmmo = this.ammoByWeapon[wId];
          const nextRes = this.reserveAmmoByWeapon[wId];
          const isFull = nextAmmo >= cfg.magSize || nextRes <= 0;

          this.recoilOffset = Math.max(this.recoilOffset, 0.036);
          this.callbacks.onShellInserted?.(wId, nextAmmo, nextRes, isFull);

          if (isFull) {
            this.reloadingUntil = 0;
            this.nextShellAt = 0;
            this.pumpCycleDuration = 300;
            this.pumpCycleUntil = now + 300;
            this.callbacks.onReloadComplete?.(wId, nextAmmo, nextRes);
          } else {
            this.nextShellAt += cfg.shellReloadMs || 390;
          }
        }
        if (this.reloadingUntil && now >= this.reloadingUntil) {
          this.reloadingUntil = 0;
          this.nextShellAt = 0;
          this.callbacks.onReloadComplete?.(wId, this.ammoByWeapon[wId], this.reserveAmmoByWeapon[wId]);
        }
      } else if (now >= this.reloadingUntil) {
        this.reloadingUntil = 0;
        const curAmmo = this.ammoByWeapon[wId] ?? 0;
        const resAmmo = this.reserveAmmoByWeapon[wId] ?? 0;
        const needed = Math.max(0, cfg.magSize - curAmmo);
        const take = Math.min(needed, resAmmo);
        this.ammoByWeapon[wId] = curAmmo + take;
        this.reserveAmmoByWeapon[wId] = resAmmo - take;

        const activeVm = this.viewmodelMeshes[wId];
        if (activeVm?.userData?.isCs2Glb) {
          resetCs2ViewmodelParts(activeVm);
        }
        if (activeVm?.userData?.magMesh && activeVm.userData.magMesh.userData.basePos) {
          activeVm.userData.magMesh.position.copy(activeVm.userData.magMesh.userData.basePos);
        }
        if (activeVm?.userData?.boltMesh && typeof activeVm.userData.boltMesh.userData.baseZ === 'number') {
          activeVm.userData.boltMesh.position.z = activeVm.userData.boltMesh.userData.baseZ;
        }
        this.callbacks.onReloadComplete?.(wId, this.ammoByWeapon[wId], this.reserveAmmoByWeapon[wId]);
      }
    }

    if (this.equipUntil && now >= this.equipUntil) {
      this.equipUntil = 0;
      if (
        !cfg?.isMelee &&
        !cfg?.infiniteAmmo &&
        (this.ammoByWeapon[this.currentWeapon] ?? 0) <= 0 &&
        (this.reserveAmmoByWeapon[this.currentWeapon] ?? 0) > 0 &&
        !(this.reloadingUntil > now)
      ) {
        this.startReload();
      }
    }

    // Automatic firing when holding mouse down with automatic weapon
    if (
      this.isMouseDown &&
      cfg.automatic &&
      this.isPointerLocked &&
      (this.reloadingUntil <= now || (cfg.shellByShell && (this.ammoByWeapon[this.currentWeapon] ?? 0) > 0))
    ) {
      this.attemptShoot();
    }

    // Movement itself runs in fixed steps (advanceFixedPhysics); this per-frame pass only needs the strafe axis for camera roll
    let moveRight = 0;
    if (this.isPointerLocked) {
      if (this.keys.KeyD) moveRight += 1;
      if (this.keys.KeyA) moveRight -= 1;
    }

    // Tactical Peek / Lean (Q = -1 left, E = +1 right)
    const targetLean = this.isPointerLocked && !this.isSprinting && !this.isSliding
      ? (this.keys.KeyE ? 1 : 0) - (this.keys.KeyQ ? 1 : 0)
      : 0;
    this.currentLean += (targetLean - this.currentLean) * Math.min(1, dt * 18);
    if (Math.abs(this.currentLean) < 0.005) this.currentLean = 0;

    // Smooth eye height interpolation (snappier drop when entering CoD/Neon low slide)
    const targetEye = this.prone
      ? 0.52
      : this.isSliding
        ? 0.78
        : this.crouching
          ? 1.04
          : 1.62;
    this.currentEyeHeight += (targetEye - this.currentEyeHeight) * Math.min(1, dt * (this.isSliding ? 20 : 13));

    this.landingDip += this.landingDipVel * dt;
    this.landingDipVel -= this.landingDip * 140 * dt;
    this.landingDipVel *= Math.max(0, 1 - dt * 14);
    this.landingDip *= Math.max(0, 1 - dt * 8);

    // Camera lateral axis (lean offset)
    const rightX = Math.cos(this.yaw);
    const rightZ = -Math.sin(this.yaw);

    const horizSpeed = Math.hypot(this.velocity.x, this.velocity.z);
    if (this.onGround && horizSpeed > 0.5 && !this.isSliding) {
      const bobRate = this.isSprinting ? 12.2 : this.prone ? 4.8 : this.crouching ? 6.4 : 9.2;
      this.weaponBobTime += dt * bobRate;

      if (now >= this.nextFootstepAt && !this.prone) {
        if (this.crouching) {
          this.nextFootstepAt = now + 560;
          this.callbacks.onFootstep?.(false, true);
        } else {
          this.nextFootstepAt = now + (this.isSprinting ? 335 : 460);
          this.callbacks.onFootstep?.(this.isSprinting, false);
        }
      }
    } else {
      this.weaponBobTime = 0;
    }

    // Apply pending weapon recoil impulse and auto-recover smoothly after firing stops
    const effectiveFireRateMs = getEffectiveFireRateMs(cfg, this.isAiming);
    const recDelay = Math.max(cfg.recoilRecoveryDelayMs || 0, effectiveFireRateMs + 28);
    const stanceRecBoost = this.prone ? 1.30 : this.isSliding ? 1.22 : this.crouching ? 1.15 : 1.0;
    this.crosshairRecoilKick = Math.max(0, this.crosshairRecoilKick - dt * (cfg.recoilRecovery || 14.0) * stanceRecBoost * 0.018);

    if (this.pendingRecoilPitch || this.pendingRecoilYaw) {
      const kickStep = Math.min(1, dt * 42);
      const dp = this.pendingRecoilPitch * kickStep;
      const dy = this.pendingRecoilYaw * kickStep;
      this.pendingRecoilPitch -= dp;
      this.pendingRecoilYaw -= dy;
      if (Math.abs(this.pendingRecoilPitch) < 1e-5) this.pendingRecoilPitch = 0;
      if (Math.abs(this.pendingRecoilYaw) < 1e-5) this.pendingRecoilYaw = 0;
      const prevPitch = this.pitch;
      this.pitch = Math.max(-Math.PI / 2 + 0.05, Math.min(Math.PI / 2 - 0.05, this.pitch + dp));
      const appliedPitch = this.pitch - prevPitch;
      this.accumulatedRecoilPitch += appliedPitch;
      this.yaw += dy;
      this.accumulatedRecoilYaw += dy;
      if (this.pendingFire) {
        this.pendingFire.recoilDrainedPitch = (this.pendingFire.recoilDrainedPitch || 0) + appliedPitch;
        this.pendingFire.recoilDrainedYaw = (this.pendingFire.recoilDrainedYaw || 0) + dy;
      }
    }

    if (now - this.lastShotAt > recDelay) {
      this.recoilShotIndex = Math.max(0, this.recoilShotIndex - dt * 28 * stanceRecBoost);
      if (this.recoilShotIndex < 0.2) this.recoilShotIndex = 0;

      const recFactor = Math.min(1, dt * (cfg.recoilRecovery || 14.0) * stanceRecBoost);
      if (this.accumulatedRecoilPitch > 0) {
        const recoverP = this.accumulatedRecoilPitch * recFactor;
        this.pitch = Math.max(-Math.PI / 2 + 0.05, this.pitch - recoverP);
        this.accumulatedRecoilPitch = Math.max(0, this.accumulatedRecoilPitch - recoverP);
        if (this.accumulatedRecoilPitch < 1e-4) this.accumulatedRecoilPitch = 0;
      }
      if (Math.abs(this.accumulatedRecoilYaw) > 0) {
        const recoverY = this.accumulatedRecoilYaw * recFactor;
        this.yaw -= recoverY;
        this.accumulatedRecoilYaw -= recoverY;
        if (Math.abs(this.accumulatedRecoilYaw) < 1e-4) this.accumulatedRecoilYaw = 0;
      }
    }

    this.currentBloom = Math.max(0, this.currentBloom - (cfg.bloomDecay || 0.14) * dt);
    this.effectiveSpread = this.computeEffectiveSpread(cfg);
    const isMoving = horizSpeed > 0.65 || !this.onGround;
    const isStanceSteady = Boolean(this.onGround && (this.prone || this.crouching || this.isSliding));
    this.callbacks.onSpreadUpdate?.(
      this.effectiveSpread,
      this.isAiming,
      isMoving,
      this.crosshairRecoilKick,
      isStanceSteady
    );

    // Decay subtle shooting view punch (damage flinch stays 0)
    this.punchPitch *= Math.max(0, 1 - dt * 18);
    this.punchRoll *= Math.max(0, 1 - dt * 18);
    if (Math.abs(this.punchPitch) < 1e-4) this.punchPitch = 0;
    if (Math.abs(this.punchRoll) < 1e-4) this.punchRoll = 0;
    this.flinchPitch = 0;
    this.flinchRoll = 0;

    // Camera Strafe Roll, CoD/Neon Dynamic Slide Cant & Tactical Q/E Lean Roll
    const leanRoll = -this.currentLean * (MATCH_CONFIG.LEAN_ROLL_ANGLE || 0.145);
    const slideLateralDot = this.isSliding ? (rightX * this.slideDir.x + rightZ * this.slideDir.z) : 0;
    const slideSpeedRatio = this.isSliding
      ? Math.min(1.2, horizSpeed / (MATCH_CONFIG.SLIDE_INITIAL_SPEED || 10.6))
      : 0;
    const slideRoll = this.isSliding
      ? (0.115 - slideLateralDot * 0.055) * (0.65 + 0.35 * slideSpeedRatio)
      : 0;
    const targetRoll = (this.isSliding
      ? slideRoll
      : -moveRight * (this.isSprinting ? 0.026 : 0.016)) + leanRoll;
    this.cameraRoll += (targetRoll - this.cameraRoll) * Math.min(1, dt * (this.isSliding ? 18 : 14));

    const leanOffset = this.currentLean * (MATCH_CONFIG.LEAN_OFFSET || 0.42);
    const leanDropY = Math.abs(this.currentLean) * -0.055;

    // Update camera transform
    const physA = this.physAlpha;
    const physPrev = this.physPrev;
    const renderX = physPrev.x + (this.position.x - physPrev.x) * physA;
    const renderY = physPrev.y + (this.position.y - physPrev.y) * physA;
    const renderZ = physPrev.z + (this.position.z - physPrev.z) * physA;
    const renderStepOffset = physPrev.stepOffsetY + ((this.stepOffsetY || 0) - physPrev.stepOffsetY) * physA;
    // Visual correction offset: hides server reconciliation corrections, decays to 0 within ~100 ms
    const corr = this.prediction.offset;
    this.camera.position.set(
      renderX + corr.x + rightX * leanOffset,
      renderY + corr.y + this.currentEyeHeight + this.landingDip + leanDropY + renderStepOffset,
      renderZ + corr.z + rightZ * leanOffset
    );
    this.prediction.decayOffset(dt);
    this.tmpEuler.set(
      Math.max(-Math.PI / 2 + 0.04, Math.min(Math.PI / 2 - 0.04, this.pitch + this.punchPitch)),
      this.yaw,
      this.cameraRoll + this.punchRoll,
      'YXZ'
    );
    this.camera.quaternion.setFromEuler(this.tmpEuler);
    this.updateGrenadePreview(now);

    // Smooth Dynamic FOV (+0.25x / 1.25x zoomFov 54.4 for Holo & Red-Dot optics, 26 for Sniper, up to 81.5° rush on CoD/Neon slide burst)
    const targetFov = this.isAiming
      ? cfg.zoomFov
      : this.isSliding
        ? 75.5 + slideSpeedRatio * 6.0
        : this.isSprinting
          ? 74
          : 68;
    if (Math.abs(this.camera.fov - targetFov) > 0.05) {
      this.camera.fov += (targetFov - this.camera.fov) * Math.min(1, dt * 22);
      this.camera.updateProjectionMatrix();
    }

    // Update First-Person Weapon Viewmodel Animation + Saltline Second-Order Spring-Damper Bank
    this.stepVmSprings(dt);
    this.barrelHeat = Math.max(0, (this.barrelHeat || 0) - dt * 0.34);
    this.recoilOffset = Math.max(0, this.recoilOffset - dt * 1.15);
    this.boltKickOffset = Math.max(0, this.boltKickOffset - dt * 8.5);
    const swayDecay = Math.exp(-10 * dt);
    this.swayX *= swayDecay;
    this.swayY *= swayDecay;
    this.swayRotX = (this.swayRotX || 0) * swayDecay;
    this.swayRotY = (this.swayRotY || 0) * swayDecay;

    const isReloading = this.reloadingUntil > now;
    const isEquipping = this.equipUntil > now;
    const isSniperScoped = this.isAiming && this.currentWeapon === 'sniper';
    this.viewmodelRig.visible = !isSniperScoped;

    const activeVm = this.viewmodelMeshes[this.currentWeapon];
    const magMesh = activeVm?.userData?.magMesh;
    const boltMesh = activeVm?.userData?.boltMesh;
    if (activeVm?.userData?.opticReticle) {
      activeVm.userData.opticReticle.visible = true;
    }

    const equipProgress = isEquipping ? 1 - (this.equipUntil - now) / this.equipDuration : 1;
    const equipDropY = isEquipping ? (1 - equipProgress) * -0.26 : 0;

    // Cancel active weapon inspect cleanly on combat, ADS, reload, equip, sprint, slide, or menu
    if ((this.inspectUntil || 0) > now) {
      const firedSinceInspect = (this.lastShotAt ?? -1000) !== (this._inspectShotBaseline ?? -1000)
        || Boolean(this.pendingFire)
        || this.meleeSwingUntil > now;
      if (
        !this.alive ||
        !this.inMatch ||
        this.inMenu ||
        isReloading ||
        this.reloading ||
        isEquipping ||
        this.isAiming ||
        this.isRightMouseDown ||
        this.isSprinting ||
        this.isSliding ||
        this.isCookingGrenade ||
        this.grenadeThrowUntil > now ||
        firedSinceInspect
      ) {
        this.inspectUntil = 0;
      }
    }
    const isInspecting = (this.inspectUntil || 0) > now;
    if (!isInspecting && Math.abs(this.viewmodelRig.rotation.x) > Math.PI) {
      const twoPi = Math.PI * 2;
      this.viewmodelRig.rotation.x = ((((this.viewmodelRig.rotation.x + Math.PI) % twoPi) + twoPi) % twoPi) - Math.PI;
    }

    // Align 3D weapon optic center (Holo / Red-Dot) directly onto screen center (0, 0) during ADS
    const isAimingSteady =
      this.isAiming &&
      !isReloading &&
      !isEquipping &&
      this.grenadeThrowUntil <= now &&
      this.meleeSwingUntil <= now;
    const adsPos = activeVm?.userData?.adsPosition || { x: 0.0, y: -0.1208, z: -0.1278 };
    const isTacSlidePose = this.isSliding && !isAimingSteady && !isReloading;
    const slideRumbleX = isTacSlidePose ? Math.sin(now * 0.048) * 0.0022 * slideSpeedRatio : 0;
    const slideRumbleY = isTacSlidePose ? Math.cos(now * 0.062) * 0.0026 * slideSpeedRatio : 0;
    const idleBreathFactor = (!isAimingSteady && !isReloading && !isInspecting && !this.isSliding && !this.isSprinting && this.onGround)
      ? Math.max(0, 1 - horizSpeed * 0.45)
      : 0;
    const breathSec = now * 0.001;
    if (activeVm?.userData?.isCs2Glb) {
      this._updateCs2ViewmodelPose(
        activeVm,
        dt,
        now,
        cfg,
        isReloading,
        isEquipping,
        equipProgress,
        isInspecting,
        isAimingSteady,
        isTacSlidePose,
        slideLateralDot,
        slideRumbleX,
        slideRumbleY,
        idleBreathFactor,
        breathSec
      );
    } else {
    const breathX = Math.sin(breathSec * 1.35) * 0.0016 * idleBreathFactor;
    const breathY = (Math.sin(breathSec * 2.7) * 0.0020 + Math.cos(breathSec * 1.35) * 0.0009) * idleBreathFactor;
    const breathRotX = Math.sin(breathSec * 2.7 - 0.4) * 0.0036 * idleBreathFactor;
    const breathRotZ = Math.cos(breathSec * 1.35) * 0.0040 * idleBreathFactor;

    let inspectX = 0.205;
    let inspectY = -0.19;
    let inspectZ = -0.335;
    let inspectRotX = 0;
    let inspectRotY = 0.045;
    let inspectRotZ = 0;
    let isKnifeSpinning = false;
    let knifeTargetRotX = 0;
    let knifeTargetRotZ = 0;
    let knifeRingOffY = 0;
    let knifeRingOffZ = 0;
    if (isInspecting) {
      const isKnifeInspect = this.currentWeapon === 'knife';
      const inspectDur = this.inspectDuration || (isKnifeInspect ? 2200 : 2800);
      const ip = Math.max(0, Math.min(1, 1 - (this.inspectUntil - now) / inspectDur));
      if (isKnifeInspect) {
        isKnifeSpinning = true;
        if (ip < 0.14) {
          const u = ip / 0.14;
          const e = u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) * 0.5;
          inspectX = 0.205 + (0.132 - 0.205) * e;
          inspectY = -0.19 + (-0.125 - (-0.19)) * e;
          inspectZ = -0.335 + (-0.295 - (-0.335)) * e;
          inspectRotX = 0.16 * e;
          inspectRotY = 0.045 + (0.18 - 0.045) * e;
          inspectRotZ = -0.14 * e;
          knifeTargetRotX = 0.22 * Math.sin(e * Math.PI * 0.5);
          knifeTargetRotZ = 0.06 * e;
          knifeRingOffY = 0.004 * e;
          knifeRingOffZ = -0.003 * e;
        } else if (ip < 0.78) {
          const u = (ip - 0.14) / 0.64;
          const e = u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) * 0.5;
          inspectX = 0.132 + Math.sin(u * Math.PI) * 0.010;
          inspectY = -0.125 + Math.sin(u * Math.PI * 2) * 0.011;
          inspectZ = -0.295 - Math.sin(u * Math.PI) * 0.010;
          inspectRotX = 0.16 + Math.sin(u * Math.PI * 2) * 0.045;
          inspectRotY = 0.18 + Math.sin(u * Math.PI) * 0.05;
          inspectRotZ = -0.14 + Math.sin(u * Math.PI * 2) * 0.05;
          knifeTargetRotX = 0.22 * (1 - Math.min(1, u * 4)) - e * Math.PI * 4;
          knifeTargetRotZ = 0.06 * (1 - u) + Math.sin(u * Math.PI * 2) * 0.08;
          knifeRingOffY = 0.004 * (1 - u) + Math.sin(u * Math.PI) * 0.012;
          knifeRingOffZ = -0.003 * (1 - u) - Math.sin(u * Math.PI) * 0.008;
        } else {
          const u = (ip - 0.78) / 0.22;
          const e = u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) * 0.5;
          inspectX = 0.132 + (0.205 - 0.132) * e;
          inspectY = -0.125 + (-0.19 - (-0.125)) * e;
          inspectZ = -0.295 + (-0.335 - (-0.295)) * e;
          inspectRotX = 0.16 * (1 - e) - Math.sin(u * Math.PI) * 0.03 * (1 - u);
          inspectRotY = 0.18 + (0.045 - 0.18) * e;
          inspectRotZ = -0.14 * (1 - e);
          knifeTargetRotX = -Math.PI * 4;
          knifeTargetRotZ = 0;
          knifeRingOffY = 0;
          knifeRingOffZ = 0;
        }
      } else {
        if (ip < 0.22) {
          const u = ip / 0.22;
          const e = u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) * 0.5;
          inspectX = 0.205 + (0.055 - 0.205) * e;
          inspectY = -0.19 + (-0.115 - (-0.19)) * e;
          inspectZ = -0.335 + (-0.285 - (-0.335)) * e;
          inspectRotX = 0.16 * e;
          inspectRotY = 0.045 + (0.86 - 0.045) * e;
          inspectRotZ = -0.42 * e;
        } else if (ip < 0.48) {
          const u = (ip - 0.22) / 0.26;
          const e = u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) * 0.5;
          inspectX = 0.055 + 0.015 * e;
          inspectY = -0.115 + Math.sin(u * Math.PI) * 0.009;
          inspectZ = -0.285 - 0.012 * e;
          inspectRotX = 0.16 + 0.06 * e;
          inspectRotY = 0.86 - 0.18 * e;
          inspectRotZ = -0.42 + 0.24 * e;
        } else if (ip < 0.78) {
          const u = (ip - 0.48) / 0.30;
          const e = u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) * 0.5;
          inspectX = 0.070 + (0.105 - 0.070) * e;
          inspectY = -0.115 + (-0.132 - (-0.115)) * e + Math.sin(u * Math.PI) * 0.012;
          inspectZ = -0.297 + (-0.308 - (-0.297)) * e;
          inspectRotX = 0.22 + (0.08 - 0.22) * e;
          inspectRotY = 0.68 + (-0.50 - 0.68) * e;
          inspectRotZ = -0.18 + (0.50 - (-0.18)) * e;
        } else {
          const u = (ip - 0.78) / 0.22;
          const e = u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) * 0.5;
          inspectX = 0.105 + (0.205 - 0.105) * e;
          inspectY = -0.132 + (-0.19 - (-0.132)) * e;
          inspectZ = -0.308 + (-0.335 - (-0.308)) * e;
          inspectRotX = 0.08 * (1 - e);
          inspectRotY = -0.50 + (0.045 - (-0.50)) * e;
          inspectRotZ = 0.50 * (1 - e);
        }
      }
    }

    const sp = this.vmSprings;
    const spHipScale = isAimingSteady ? 0 : 1.0;
    const spAdsZScale = isAimingSteady ? 0.045 : 1.0;
    const springPosX = sp ? (sp.swX.x * 0.022 + sp.kY.x * 0.008) * spHipScale : 0;
    const springPosY = sp ? (sp.swY.x * 0.020 + sp.jY.x * 0.028 - sp.bump.x * 0.016) * spHipScale : 0;
    const springPosZ = sp ? (sp.kZ.x * 0.068 + sp.bump.x * 0.012) * spAdsZScale : 0;

    const targetVmX = isAimingSteady
      ? adsPos.x
      : (isInspecting ? inspectX : isTacSlidePose ? 0.128 : this.isSprinting ? 0.165 : 0.205) + this.currentLean * 0.03 + slideRumbleX + breathX;
    const targetVmY = (isReloading
      ? -0.265
      : isAimingSteady
        ? adsPos.y
        : isInspecting
          ? inspectY
          : isTacSlidePose
            ? -0.162 + slideRumbleY
            : -0.19) + equipDropY + this.landingDip * (isAimingSteady ? 0 : 0.45) + breathY;
    const targetVmZ = isAimingSteady ? adsPos.z : isInspecting ? inspectZ : isTacSlidePose ? -0.315 : -0.335;

    const bobAmp = isAimingSteady ? 0 : isInspecting ? 0.35 : this.isSprinting ? 1.35 : 0.95;
    const bobX = Math.cos(this.weaponBobTime * 0.5) * 0.012 * bobAmp;
    const bobY = Math.abs(Math.sin(this.weaponBobTime)) * 0.014 * bobAmp;
    const swayScale = isAimingSteady ? 0 : 1.0;
    const recoilZScale = isAimingSteady ? 0.08 : 1.0;

    const vmPosBlend = 1 - Math.exp(-(isAimingSteady ? 34 : isInspecting ? 20 : 18) * dt);
    const vmRotBlend = 1 - Math.exp(-(isAimingSteady ? 34 : isInspecting ? 22 : 16) * dt);
    this.viewmodelRig.position.x += (targetVmX + bobX + this.swayX * swayScale + springPosX - this.viewmodelRig.position.x) * vmPosBlend;
    this.viewmodelRig.position.y += (targetVmY - bobY + this.swayY * swayScale + springPosY - this.viewmodelRig.position.y) * vmPosBlend;
    this.viewmodelRig.position.z += (targetVmZ + this.recoilOffset * recoilZScale + springPosZ - this.viewmodelRig.position.z) * Math.min(1, dt * (isAimingSteady ? 34 : 28));

    const distToAds = Math.hypot(
      this.viewmodelRig.position.x - adsPos.x,
      this.viewmodelRig.position.y - adsPos.y,
      this.viewmodelRig.position.z - adsPos.z
    );
    const isThroughScopeView = isAimingSteady && !isSniperScoped && distToAds < 0.085;
    setWeaponAdsCulling(activeVm, isThroughScopeView);

    if (activeVm?.userData?.barrelHeatMesh && activeVm?.userData?.barrelHeatMat) {
      const heatAlpha = isThroughScopeView ? 0 : Math.max(0, ((this.barrelHeat || 0) - 0.18) * 0.58);
      activeVm.userData.barrelHeatMat.opacity = heatAlpha;
      activeVm.userData.barrelHeatMesh.visible = heatAlpha > 0.01;
    }

    const springRotX = (!isAimingSteady && sp) ? (sp.kP.x * 0.115 + sp.jP.x * 0.055 + sp.bump.x * 0.045) : 0;
    const springRotY = (!isAimingSteady && sp) ? (sp.kY.x * 0.065 + sp.swX.x * 0.045) : 0;
    const springRotZ = (!isAimingSteady && sp) ? (sp.kR.x * 0.095 - sp.swX.x * 0.032) : 0;

    let targetRotX = isAimingSteady
      ? 0
      : (isInspecting ? inspectRotX : this.recoilOffset * 0.85) + springRotX + (this.swayRotX || 0) + breathRotX;
    let targetRotY = isAimingSteady
      ? 0
      : (isInspecting ? inspectRotY : 0.045) + springRotY + (this.swayRotY || 0);
    let targetRotZ = isAimingSteady
      ? 0
      : (isInspecting ? inspectRotZ : 0) - this.cameraRoll * 0.85 + springRotZ - (this.swayRotY || 0) * 0.35 + breathRotZ;

    if (isReloading) {
      const reloadPct = Math.max(0, Math.min(1, 1 - (this.reloadingUntil - now) / this.reloadDuration));

      if (this.reloadMode === 'shell') {
        const shellPulse = this.nextShellAt > 0
          ? Math.sin(Math.max(0, 1 - (this.nextShellAt - now) / (cfg.shellReloadMs || 390)) * Math.PI)
          : 0;
        targetRotX = -0.28 + shellPulse * 0.16;
        targetRotZ = 0.55;
        targetRotY = 0.28;
        if (magMesh && magMesh.userData.basePos) {
          magMesh.position.y = magMesh.userData.basePos.y - shellPulse * 0.06;
        }
      } else if (this.reloadMode === 'tactical') {
        targetRotX = -0.32 + Math.sin(reloadPct * Math.PI) * 0.22;
        targetRotZ = 0.44;
        targetRotY = 0.2;
        if (magMesh && magMesh.userData.basePos) {
          const magDip = reloadPct < 0.52
            ? Math.min(1, reloadPct * 2.3)
            : Math.max(0, (1 - reloadPct) * 2.3);
          magMesh.position.y = magMesh.userData.basePos.y - magDip * 0.22;
        }
      } else {
        if (reloadPct < 0.74) {
          const stagePct = reloadPct / 0.74;
          targetRotX = -0.35 + Math.sin(stagePct * Math.PI) * 0.24;
          targetRotZ = 0.48;
          targetRotY = 0.22;
          if (magMesh && magMesh.userData.basePos) {
            const magDip = stagePct < 0.5
              ? Math.min(1, stagePct * 2.4)
              : Math.max(0, (1 - stagePct) * 2.4);
            magMesh.position.y = magMesh.userData.basePos.y - magDip * 0.24;
          }
        } else {
          const boltPct = (reloadPct - 0.74) / 0.26;
          const pull = Math.sin(boltPct * Math.PI);
          targetRotX = -0.18 - pull * 0.14;
          targetRotZ = -0.28 * pull;
          targetRotY = -0.12 * pull;
          if (magMesh && magMesh.userData.basePos) {
            magMesh.position.copy(magMesh.userData.basePos);
          }
          if (boltMesh && typeof boltMesh.userData.baseZ === 'number') {
            boltMesh.position.z = boltMesh.userData.baseZ + pull * 0.11;
          }
        }
      }
    } else if (this.isSprinting) {
      targetRotX = -0.22;
      targetRotY = 0.36;
      targetRotZ = 0.18;
    } else if (this.isSliding && !isAimingSteady) {
      // Call of Duty Tac-Stance / Valorant Neon 40-degree inward canted weapon slide posture
      targetRotX += 0.065;
      targetRotY += 0.165;
      targetRotZ = 0.68 - slideLateralDot * 0.12;
    }

    if (!isReloading && boltMesh && typeof boltMesh.userData.baseZ === 'number') {
      if (this.pumpCycleUntil > now) {
        const cyclePct = 1 - (this.pumpCycleUntil - now) / this.pumpCycleDuration;
        const pumpPhase = cyclePct > 0.22 ? Math.sin(((cyclePct - 0.22) / 0.78) * Math.PI) : 0;
        const pumpRotScale = isAimingSteady ? 0 : 1.0;
        boltMesh.position.z = boltMesh.userData.baseZ + pumpPhase * 0.115 * (isAimingSteady ? 0.35 : 1.0);
        targetRotX -= pumpPhase * 0.09 * pumpRotScale;
        targetRotZ += pumpPhase * (this.currentWeapon === 'sniper' ? -0.18 : 0.12) * pumpRotScale;
      } else {
        const boltKickScale = isAimingSteady ? 0.25 : 1.0;
        boltMesh.position.z = boltMesh.userData.baseZ + this.boltKickOffset * 0.085 * boltKickScale;
      }
    }

    if (this.meleeSwingUntil > now) {
      const swingPct = 1 - (this.meleeSwingUntil - now) / 280;
      const slashArc = Math.sin(swingPct * Math.PI);
      targetRotX -= slashArc * 0.55;
      targetRotY += slashArc * 0.85;
      targetRotZ += slashArc * 0.65;
      this.viewmodelRig.position.z -= slashArc * 0.16;
    }

    if (this.isCookingGrenade) {
      targetRotX += 0.22;
      targetRotZ -= 0.18;
      this.viewmodelRig.position.y -= 0.035;
    } else if (this.grenadeThrowUntil > now) {
      const tossPct = 1 - (this.grenadeThrowUntil - now) / 260;
      const tossArc = Math.sin(tossPct * Math.PI);
      targetRotX += tossArc * 0.42;
      targetRotZ += tossArc * 0.35;
      this.viewmodelRig.position.y -= tossArc * 0.08;
    }

    this.viewmodelRig.rotation.x += (targetRotX - this.viewmodelRig.rotation.x) * vmRotBlend;
    this.viewmodelRig.rotation.y += (targetRotY - this.viewmodelRig.rotation.y) * vmRotBlend;
    this.viewmodelRig.rotation.z += (targetRotZ - this.viewmodelRig.rotation.z) * vmRotBlend;

    const activeWeaponMesh = activeVm?.userData?.activeWeaponMesh;
    if (activeWeaponMesh) {
      if (isKnifeSpinning) {
        const knifeSpinBlend = 1 - Math.exp(-34 * dt);
        activeWeaponMesh.rotation.x += (knifeTargetRotX - activeWeaponMesh.rotation.x) * knifeSpinBlend;
        activeWeaponMesh.rotation.y += (0 - activeWeaponMesh.rotation.y) * vmRotBlend;
        activeWeaponMesh.rotation.z += (knifeTargetRotZ - activeWeaponMesh.rotation.z) * vmRotBlend;
        const basePivotPos = activeVm.userData.knifePivotBasePos;
        if (basePivotPos) {
          activeWeaponMesh.position.x += (basePivotPos.x - activeWeaponMesh.position.x) * vmPosBlend;
          activeWeaponMesh.position.y += (basePivotPos.y + knifeRingOffY - activeWeaponMesh.position.y) * vmPosBlend;
          activeWeaponMesh.position.z += (basePivotPos.z + knifeRingOffZ - activeWeaponMesh.position.z) * vmPosBlend;
        }
      } else {
        if (Math.abs(activeWeaponMesh.rotation.x) > Math.PI) {
          const twoPi = Math.PI * 2;
          activeWeaponMesh.rotation.x = ((((activeWeaponMesh.rotation.x + Math.PI) % twoPi) + twoPi) % twoPi) - Math.PI;
        }
        activeWeaponMesh.rotation.x += (0 - activeWeaponMesh.rotation.x) * vmRotBlend;
        activeWeaponMesh.rotation.y += (0 - activeWeaponMesh.rotation.y) * vmRotBlend;
        activeWeaponMesh.rotation.z += (0 - activeWeaponMesh.rotation.z) * vmRotBlend;
        if (Math.abs(activeWeaponMesh.rotation.x) < 1e-4) activeWeaponMesh.rotation.x = 0;
        if (Math.abs(activeWeaponMesh.rotation.y) < 1e-4) activeWeaponMesh.rotation.y = 0;
        if (Math.abs(activeWeaponMesh.rotation.z) < 1e-4) activeWeaponMesh.rotation.z = 0;
        const basePivotPos = activeVm.userData.knifePivotBasePos;
        if (basePivotPos) {
          activeWeaponMesh.position.x += (basePivotPos.x - activeWeaponMesh.position.x) * vmPosBlend;
          activeWeaponMesh.position.y += (basePivotPos.y - activeWeaponMesh.position.y) * vmPosBlend;
          activeWeaponMesh.position.z += (basePivotPos.z - activeWeaponMesh.position.z) * vmPosBlend;
        }
      }
    }
    }

    if (now - this.lastShotAt > 50) {
      if (activeVm?.userData?.flashMesh) {
        activeVm.userData.flashMesh.visible = false;
      }
      this.muzzleLight.intensity = 0;
    }

    // Emit HUD movement state (stance + speed) at ~15Hz
    if (now - this.lastHudMoveUpdateAt >= 65) {
      this.lastHudMoveUpdateAt = now;
      const stance = !this.onGround
        ? 'AIR'
        : this.isSliding
          ? 'SLIDE'
          : this.prone
            ? 'PRONE'
            : this.isSprinting
              ? 'SPRINT'
              : this.crouching
                ? 'CROUCH'
                : Math.abs(this.currentLean) > 0.25
                  ? 'PEEK'
                  : 'WALK';
      this.callbacks.onMovementHudUpdate?.(stance, horizSpeed);
    }

    // Send the input commands produced since the last batch (+ a few unacked ones as packet-loss redundancy) at ~30 Hz.
    // Subtracting 4 ms prevents 60 Hz 2-frame rAF intervals (~31.5-33.3 ms) from slipping to frame 3 (~50 ms).
    if (now - this.lastInputBatchAt >= INPUT_BATCH_INTERVAL_MS - 4) {
      const batch = this.prediction.buildBatch();
      if (batch) {
        this.lastInputBatchAt = now;
        this.callbacks.onInputBatch?.(batch);
      }
    }
  }

  /**
   * 1P viewmodel pose & procedural animation driver for MIT CS2 GLB weapons (`ak47.glb`, `awp.glb`, `knife.glb`).
   * Zero per-frame allocations; applies exact CS2 hip/ADS poses, crisp recoil kick, figure-8 walk bob,
   * smoothstep reload mag drop (`magNode` + `handLNode`/`armLNode` + `boltNode`), and KeyF inspect
   * (broadside rifle/AWP inspect; isolated `Knife` blade twirl keeping `HandR`/`ArmR` upright).
   */
  _updateCs2ViewmodelPose(
    activeVm,
    dt,
    now,
    cfg,
    isReloading,
    isEquipping,
    equipProgress,
    isInspecting,
    isAimingSteady,
    isTacSlidePose,
    slideLateralDot,
    slideRumbleX,
    slideRumbleY,
    idleBreathFactor,
    breathSec
  ) {
    const ud = activeVm.userData;
    const sceneEnv = this.scene?.environment || null;
    if (ud._boundEnvMap !== sceneEnv) {
      refreshCs2WeaponEnvMap(activeVm, sceneEnv);
      ud._boundEnvMap = sceneEnv;
    }

    const cs2Pose = ud.cs2Pose || {
      hip: { pos: [0.29, -0.14, -0.36], rot: [0.02, 0.02, 0.03] },
      ads: { pos: [0, -0.07064, -0.12], rot: [0.03266, 0, 0] }
    };
    const hipPos = cs2Pose.hip.pos;
    const hipRot = cs2Pose.hip.rot;
    const adsPosArr = cs2Pose.ads?.pos || hipPos;
    const adsRotArr = cs2Pose.ads?.rot || hipRot;
    const isKnifeCs2 = this.currentWeapon === 'knife';
    const useAdsPose = isAimingSteady && !isKnifeCs2;

    const motion = useAdsPose ? 0.25 : 1.0;
    const br = useAdsPose ? 0.12 : (idleBreathFactor > 0 ? idleBreathFactor : 0.25);
    const brY = 0.0015 * Math.sin(breathSec * 1.3) * br;
    const brRX = 0.0025 * Math.sin(breathSec * 1.3 + 0.6) * br;
    const brRZ = 0.0015 * Math.sin(breathSec * 0.9) * br;

    const bobAmp = useAdsPose ? 0.22 : isInspecting ? 0.28 : this.isSprinting ? 1.25 : 0.95;
    const bobX = Math.sin(this.weaponBobTime * 0.5) * 0.0085 * bobAmp;
    const bobY = -(0.5 + 0.5 * Math.cos(this.weaponBobTime)) * 0.0072 * bobAmp;

    const sp = this.vmSprings;
    const spHipScale = useAdsPose ? 0.15 : 1.0;
    const spAdsZScale = useAdsPose ? 0.30 : 1.0;
    const springPosX = sp ? (sp.swX.x * 0.018 + sp.kY.x * 0.007) * spHipScale : 0;
    const springPosY = sp ? (sp.swY.x * 0.016 + sp.jY.x * 0.024 - sp.bump.x * 0.014) * spHipScale : 0;
    const springPosZ = sp ? (sp.kZ.x * 0.056 + sp.bump.x * 0.010) * spAdsZScale : 0;
    const springRotX = sp ? (sp.kP.x * 0.095 + sp.jP.x * 0.045 + sp.bump.x * 0.036) * (useAdsPose ? 0.28 : 1.0) : 0;
    const springRotY = sp ? (sp.kY.x * 0.052 + sp.swX.x * 0.038) * spHipScale : 0;
    const springRotZ = sp ? (sp.kR.x * 0.075 - sp.swX.x * 0.028) * spHipScale : 0;

    let tX = (useAdsPose ? adsPosArr[0] : hipPos[0]) + (useAdsPose ? 0 : this.currentLean * 0.025 + slideRumbleX);
    let tY = (useAdsPose ? adsPosArr[1] : hipPos[1]) + this.landingDip * (useAdsPose ? 0.08 : 0.42) + brY + (useAdsPose ? 0 : slideRumbleY);
    let tZ = useAdsPose ? adsPosArr[2] : hipPos[2];

    let tRotX = (useAdsPose ? adsRotArr[0] : hipRot[0]) + this.recoilOffset * (useAdsPose ? 0.26 : 0.72) + springRotX + (this.swayRotX || 0) * motion + brRX - bobY * (useAdsPose ? 0.5 : 2.2);
    let tRotY = (useAdsPose ? adsRotArr[1] : hipRot[1]) + springRotY + (this.swayRotY || 0) * motion;
    let tRotZ = (useAdsPose ? adsRotArr[2] : hipRot[2]) - this.cameraRoll * (useAdsPose ? 0.22 : 0.80) + springRotZ - (this.swayRotY || 0) * 0.30 * motion + brRZ + bobX * (useAdsPose ? 0.3 : 1.2);

    if (isEquipping) {
      const clampedEq = Math.max(0, Math.min(1, equipProgress));
      const e = 1 - Math.pow(1 - clampedEq, 3);
      tY -= 0.30 * (1 - e);
      tZ += 0.05 * (1 - e);
      tRotX -= 0.72 * (1 - e);
      tRotZ += 0.32 * (1 - e);
    }

    let isKnifeSpinning = false;
    let knifeTargetRotX = 0;
    let knifeTargetRotZ = 0;

    if (isInspecting) {
      const inspectDur = this.inspectDuration || (isKnifeCs2 ? 2200 : 2800);
      const ip = Math.max(0, Math.min(1, 1 - (this.inspectUntil - now) / inspectDur));
      if (isKnifeCs2) {
        isKnifeSpinning = true;
        const liftIn = cs2Smoothstep(0, 0.14, ip);
        const liftOut = 1 - cs2Smoothstep(0.78, 1.0, ip);
        const lift = liftIn * liftOut;
        // Keep HandR & ArmR upright; gently lift hand closer to center while Knife node performs 720-deg twirl
        tX = hipPos[0] - 0.055 * lift;
        tY = hipPos[1] + 0.048 * lift + Math.sin(ip * Math.PI * 2) * 0.006 * lift;
        tZ = hipPos[2] + 0.032 * lift;
        tRotX = hipRot[0] + 0.08 * lift;
        tRotY = hipRot[1] + 0.10 * lift;
        tRotZ = hipRot[2] - 0.08 * lift;
        if (ip < 0.14) {
          const u = ip / 0.14;
          const e = u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) * 0.5;
          knifeTargetRotX = 0.24 * Math.sin(e * Math.PI * 0.5);
          knifeTargetRotZ = 0.05 * e;
        } else if (ip < 0.78) {
          const u = (ip - 0.14) / 0.64;
          const e = u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) * 0.5;
          knifeTargetRotX = 0.24 * (1 - Math.min(1, u * 4)) - e * Math.PI * 4;
          knifeTargetRotZ = 0.05 * (1 - u) + Math.sin(u * Math.PI * 2) * 0.06;
        } else {
          knifeTargetRotX = -Math.PI * 4;
          knifeTargetRotZ = 0;
        }
      } else {
        // Broadside CS2 inspect showing oiled wood / blued steel edge-wear / AWP scope glass
        let dx = 0;
        let dy = 0;
        let dz = 0;
        let drx = 0;
        let dry = 0;
        let drz = 0;
        if (ip < 0.22) {
          const u = ip / 0.22;
          const e = u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) * 0.5;
          dx = -0.145 * e;
          dy = 0.062 * e;
          dz = 0.055 * e;
          drx = 0.16 * e;
          dry = 0.82 * e;
          drz = -0.40 * e;
        } else if (ip < 0.48) {
          const u = (ip - 0.22) / 0.26;
          const e = u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) * 0.5;
          dx = -0.145 + 0.016 * e;
          dy = 0.062 + Math.sin(u * Math.PI) * 0.008;
          dz = 0.055 - 0.012 * e;
          drx = 0.16 + 0.06 * e;
          dry = 0.82 - 0.16 * e;
          drz = -0.40 + 0.22 * e;
        } else if (ip < 0.78) {
          const u = (ip - 0.48) / 0.30;
          const e = u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) * 0.5;
          dx = -0.129 + 0.034 * e;
          dy = 0.062 - 0.016 * e + Math.sin(u * Math.PI) * 0.010;
          dz = 0.043 - 0.010 * e;
          drx = 0.22 - 0.13 * e;
          dry = 0.66 - 1.14 * e;
          drz = -0.18 + 0.64 * e;
        } else {
          const u = (ip - 0.78) / 0.22;
          const e = u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) * 0.5;
          dx = -0.095 * (1 - e);
          dy = 0.046 * (1 - e);
          dz = 0.033 * (1 - e);
          drx = 0.09 * (1 - e);
          dry = -0.48 * (1 - e);
          drz = 0.46 * (1 - e);
        }
        tX = hipPos[0] + dx;
        tY = hipPos[1] + dy;
        tZ = hipPos[2] + dz;
        tRotX = hipRot[0] + drx;
        tRotY = hipRot[1] + dry;
        tRotZ = hipRot[2] + drz;
      }
    }

    const magNode = ud.magNode;
    const handLNode = ud.handLNode;
    const armLNode = ud.armLNode;
    const boltNode = ud.boltNode;
    const pumpNode = ud.pumpNode;
    const ikLeftNode = ud.ikLeftNode;
    const forearmLNode = ud.forearmLNode;
    const animScale = ud.reloadAnimScale || 1.0;

    if (isReloading) {
      const reloadPct = Math.max(0, Math.min(1, 1 - (this.reloadingUntil - now) / (this.reloadDuration || 1600)));
      if (this.reloadMode === 'shell') {
        const shellPulse = this.nextShellAt > 0
          ? Math.sin(Math.max(0, 1 - (this.nextShellAt - now) / (cfg.shellReloadMs || 390)) * Math.PI)
          : 0;
        tRotX += -0.22 + shellPulse * 0.14;
        tRotZ += 0.46;
        tRotY += 0.20;
        tX += 0.025;
        tY -= 0.03;
        if (ud.fpsArms) {
          updateFpsArmsReloadPose(ud, reloadPct, 0, 0, shellPulse, true);
        } else if (ikLeftNode && ud.ikLeftHomePos) {
          ikLeftNode.position.set(
            ud.ikLeftHomePos.x,
            ud.ikLeftHomePos.y - 0.04 * shellPulse,
            ud.ikLeftHomePos.z + 0.05 * shellPulse
          );
          if (forearmLNode && ud.forearmLHomeRot) {
            forearmLNode.rotation.x = ud.forearmLHomeRot.x + 0.10 * shellPulse;
          }
        } else if (handLNode && ud.handLHomePos) {
          handLNode.position.set(
            ud.handLHomePos.x,
            ud.handLHomePos.y - 0.08 * shellPulse,
            ud.handLHomePos.z + 0.08 * shellPulse
          );
          if (armLNode && ud.armLHomePos) {
            armLNode.position.set(
              ud.armLHomePos.x + (handLNode.position.x - ud.handLHomePos.x),
              ud.armLHomePos.y + (handLNode.position.y - ud.handLHomePos.y),
              ud.armLHomePos.z + (handLNode.position.z - ud.handLHomePos.z)
            );
          }
        }
      } else {
        // CS2 smoothstep mag-drop + left-arm reload tracking + charge kick
        const tilt = cs2Smoothstep(0, 0.14, reloadPct) * (1 - cs2Smoothstep(0.86, 1.0, reloadPct));
        tRotZ += 0.36 * tilt;
        tRotX += 0.12 * tilt;
        tRotY += 0.14 * tilt;
        tX -= 0.025 * tilt;
        tY -= 0.015 * tilt;

        const outPhase = cs2Smoothstep(0.16, 0.36, reloadPct);
        const backPhase = cs2Smoothstep(0.50, 0.72, reloadPct);
        const magDrop = outPhase * (1 - backPhase);
        const charge = cs2Smoothstep(0.78, 0.86, reloadPct) * (1 - cs2Smoothstep(0.86, 0.96, reloadPct));

        if (magNode && ud.magHomePos) {
          magNode.position.set(
            ud.magHomePos.x,
            ud.magHomePos.y - 0.26 * animScale * magDrop,
            ud.magHomePos.z + 0.04 * animScale * magDrop
          );
          magNode.rotation.set(-0.45 * magDrop, 0, 0.18 * magDrop);
          magNode.visible = !(reloadPct > 0.36 && reloadPct < 0.50);
        }
        if (ud.fpsArms) {
          updateFpsArmsReloadPose(ud, reloadPct, magDrop, charge, 0, false);
        } else if (ikLeftNode && ud.ikLeftHomePos) {
          const hf = cs2Smoothstep(0.08, 0.20, reloadPct) * (1 - cs2Smoothstep(0.72, 0.85, reloadPct));
          ikLeftNode.position.set(
            ud.ikLeftHomePos.x + 0.02 * hf,
            ud.ikLeftHomePos.y - 0.08 * magDrop - 0.02 * hf,
            ud.ikLeftHomePos.z + 0.08 * hf + 0.02 * magDrop
          );
          if (forearmLNode && ud.forearmLHomeRot) {
            forearmLNode.rotation.x = ud.forearmLHomeRot.x + 0.12 * hf + 0.06 * magDrop;
          }
        } else if (handLNode && ud.handLHomePos) {
          const hf = cs2Smoothstep(0.08, 0.18, reloadPct) * (1 - cs2Smoothstep(0.72, 0.84, reloadPct));
          handLNode.position.set(
            ud.handLHomePos.x,
            ud.handLHomePos.y - 0.26 * magDrop - 0.02 * hf,
            ud.handLHomePos.z - 0.16 * hf + 0.03 * magDrop
          );
          if (ud.handLHomeRot) {
            handLNode.rotation.set(
              ud.handLHomeRot.x - 0.6 * hf,
              ud.handLHomeRot.y,
              ud.handLHomeRot.z
            );
          }
          if (armLNode && ud.armLHomePos) {
            armLNode.position.set(
              ud.armLHomePos.x + (handLNode.position.x - ud.handLHomePos.x),
              ud.armLHomePos.y + (handLNode.position.y - ud.handLHomePos.y),
              ud.armLHomePos.z + (handLNode.position.z - ud.handLHomePos.z)
            );
          }
        }
        tRotX -= 0.105 * charge;
        tZ -= 0.02 * charge;
        if (boltNode && ud.boltHomePos) {
          boltNode.position.z = ud.boltHomePos.z + 0.065 * animScale * charge;
        }
      }
    } else {
      if (magNode && ud.magHomePos) {
        magNode.position.copy(ud.magHomePos);
        if (ud.magHomeRot) magNode.rotation.copy(ud.magHomeRot);
        else magNode.rotation.set(0, 0, 0);
        magNode.visible = true;
      }
      if (ikLeftNode && ud.ikLeftHomePos) {
        ikLeftNode.position.copy(ud.ikLeftHomePos);
        if (ud.ikLeftHomeRot) ikLeftNode.rotation.copy(ud.ikLeftHomeRot);
      }
      if (forearmLNode && ud.forearmLHomeRot) {
        forearmLNode.rotation.copy(ud.forearmLHomeRot);
      }
      if (ud.fpsArms) {
        resetFpsArmsPose(ud);
      } else {
        if (handLNode && ud.handLHomePos) {
          handLNode.position.copy(ud.handLHomePos);
          if (ud.handLHomeRot) handLNode.rotation.copy(ud.handLHomeRot);
        }
        if (armLNode && ud.armLHomePos) {
          armLNode.position.copy(ud.armLHomePos);
        }
      }

      if (!useAdsPose && !isInspecting && this.isSprinting) {
        if (isKnifeCs2) {
          tX -= 0.02;
          tY -= 0.02;
          tRotX -= 0.12;
          tRotY += 0.14;
        } else {
          tX -= 0.04;
          tY -= 0.025;
          tRotX -= 0.22;
          tRotY += 0.34;
          tRotZ += 0.16;
        }
      } else if (isTacSlidePose && !isInspecting && !isKnifeCs2) {
        tX -= 0.065;
        tY += 0.02;
        tZ += 0.02;
        tRotX += 0.06;
        tRotY += 0.15;
        tRotZ += 0.56 - slideLateralDot * 0.12;
      }

      if (this.pumpCycleUntil > now) {
        const cyclePct = Math.max(0, Math.min(1, 1 - (this.pumpCycleUntil - now) / (this.pumpCycleDuration || 460)));
        const tiltA = cs2Smoothstep(0.1, 0.3, cyclePct) * (1 - cs2Smoothstep(0.7, 0.95, cyclePct));
        const boltPull = cs2Smoothstep(0.3, 0.45, cyclePct) * (1 - cs2Smoothstep(0.55, 0.7, cyclePct));
        const boltRotScale = useAdsPose ? 0.15 : 1.0;
        tRotZ += 0.244 * tiltA * boltRotScale;
        tRotX += 0.105 * tiltA * boltRotScale;
        tY -= 0.04 * tiltA * boltRotScale;
        tX += 0.02 * tiltA * boltRotScale;
        if (pumpNode && ud.pumpHomePos) {
          pumpNode.position.z = ud.pumpHomePos.z + 0.12 * animScale * boltPull;
        }
        if (boltNode && ud.boltHomePos) {
          boltNode.position.z = ud.boltHomePos.z + 0.065 * animScale * boltPull;
        }
      } else {
        if (pumpNode && ud.pumpHomePos) {
          pumpNode.position.copy(ud.pumpHomePos);
        }
        if (boltNode && ud.boltHomePos) {
          boltNode.position.z = ud.boltHomePos.z + this.boltKickOffset * 0.045 * animScale * (useAdsPose ? 0.35 : 1.0);
        }
      }
    }

    if (this.meleeSwingUntil > now) {
      const swingPct = Math.max(0, Math.min(1, 1 - (this.meleeSwingUntil - now) / 280));
      const s = Math.sin(swingPct * Math.PI);
      const arc = cs2Smoothstep(0.05, 0.45, swingPct) * (1 - cs2Smoothstep(0.55, 1.0, swingPct));
      tRotZ -= 1.15 * arc;
      tRotY += 0.58 * s;
      tX -= 0.13 * arc;
      tZ -= 0.08 * s;
    }

    if (this.isCookingGrenade) {
      tRotX += 0.20;
      tRotZ -= 0.16;
      tY -= 0.035;
    } else if (this.grenadeThrowUntil > now) {
      const tossPct = Math.max(0, Math.min(1, 1 - (this.grenadeThrowUntil - now) / 260));
      const tossArc = Math.sin(tossPct * Math.PI);
      tRotX += tossArc * 0.38;
      tRotZ += tossArc * 0.32;
      tY -= tossArc * 0.08;
    }

    const swayScale = useAdsPose ? 0.22 : 1.0;
    const recoilZScale = useAdsPose ? 0.30 : 0.85;
    const vmPosBlend = 1 - Math.exp(-(useAdsPose ? 34 : isInspecting ? 20 : 18) * dt);
    const vmRotBlend = 1 - Math.exp(-(useAdsPose ? 34 : isInspecting ? 22 : 16) * dt);

    this.viewmodelRig.position.x += (tX + bobX + this.swayX * swayScale + springPosX - this.viewmodelRig.position.x) * vmPosBlend;
    this.viewmodelRig.position.y += (tY + bobY + this.swayY * swayScale + springPosY - this.viewmodelRig.position.y) * vmPosBlend;
    this.viewmodelRig.position.z += (tZ + this.recoilOffset * recoilZScale + springPosZ - this.viewmodelRig.position.z) * Math.min(1, dt * (useAdsPose ? 34 : 28));

    this.viewmodelRig.rotation.x += (tRotX - this.viewmodelRig.rotation.x) * vmRotBlend;
    this.viewmodelRig.rotation.y += (tRotY - this.viewmodelRig.rotation.y) * vmRotBlend;
    this.viewmodelRig.rotation.z += (tRotZ - this.viewmodelRig.rotation.z) * vmRotBlend;

    const knifeNode = ud.knifeNode;
    if (knifeNode) {
      if (isKnifeSpinning) {
        const knifeSpinBlend = 1 - Math.exp(-34 * dt);
        knifeNode.rotation.x += (knifeTargetRotX - knifeNode.rotation.x) * knifeSpinBlend;
        knifeNode.rotation.y += (0 - knifeNode.rotation.y) * vmRotBlend;
        knifeNode.rotation.z += (knifeTargetRotZ - knifeNode.rotation.z) * vmRotBlend;
      } else {
        if (Math.abs(knifeNode.rotation.x) > Math.PI) {
          const twoPi = Math.PI * 2;
          knifeNode.rotation.x = ((((knifeNode.rotation.x + Math.PI) % twoPi) + twoPi) % twoPi) - Math.PI;
        }
        knifeNode.rotation.x += (0 - knifeNode.rotation.x) * vmRotBlend;
        knifeNode.rotation.y += (0 - knifeNode.rotation.y) * vmRotBlend;
        knifeNode.rotation.z += (0 - knifeNode.rotation.z) * vmRotBlend;
        if (Math.abs(knifeNode.rotation.x) < 1e-4) knifeNode.rotation.x = 0;
        if (Math.abs(knifeNode.rotation.y) < 1e-4) knifeNode.rotation.y = 0;
        if (Math.abs(knifeNode.rotation.z) < 1e-4) knifeNode.rotation.z = 0;
      }
      if (ud.knifeHomePos) {
        knifeNode.position.x += (ud.knifeHomePos.x - knifeNode.position.x) * vmPosBlend;
        knifeNode.position.y += (ud.knifeHomePos.y - knifeNode.position.y) * vmPosBlend;
        knifeNode.position.z += (ud.knifeHomePos.z - knifeNode.position.z) * vmPosBlend;
      }
    }

    if (ud.flashMesh?.visible && ud.flashSprite?.material) {
      ud.flashSprite.material.rotation = ud.flashMesh.rotation.z;
    }
  }
}
