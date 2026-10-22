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
    this.damageBoostUntil = 0;
    this.lastShotAt = -1000;
    this.reloadingUntil = 0;
    this.nextShellAt = 0;
    this.pumpCycleUntil = 0;
    this.isRightMouseDown = false;
    this.adsToggleActive = false;
    this.isAiming = false;
    this.isSprinting = false;
    for (const wId of WEAPON_ORDER) {
      setWeaponAdsCulling(this.viewmodelMeshes[wId], false);
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
    if (this.isMouseDown && activeCfg?.automatic && this.isPointerLocked && !this.pendingFire) {
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
        if (pending.weapon !== this.currentWeapon || !this.alive) {
          if (pending.ammoConsumed) {
            const wCfg = WEAPONS[pending.weapon];
            const maxMag = wCfg ? wCfg.magSize : 30;
            this.ammoByWeapon[pending.weapon] = Math.min(maxMag, (this.ammoByWeapon[pending.weapon] ?? 0) + 1);
          }
          this.pendingFire = null; // switched weapons / died before the shot could leave
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
        this.callbacks.onSlide?.();
      }
      if (res.jumpPadTriggered) this.callbacks.onJumpPad?.(res.jumpPadTriggered);
      else if (res.jumped) this.callbacks.onJump?.();
      if (res.landed) {
        this.landingDipVel = -2.2 * res.impact;
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
    }

    // Automatic firing when holding mouse down with automatic weapon
    if (this.isMouseDown && cfg.automatic && this.isPointerLocked) {
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

    // Update First-Person Weapon Viewmodel Animation
    this.recoilOffset = Math.max(0, this.recoilOffset - dt * 0.85);
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
    const targetVmX = isAimingSteady
      ? adsPos.x
      : (isTacSlidePose ? 0.135 : this.isSprinting ? 0.17 : 0.24) + this.currentLean * 0.03 + slideRumbleX;
    const targetVmY = (isReloading
      ? -0.27
      : isAimingSteady
        ? adsPos.y
        : isTacSlidePose
          ? -0.172 + slideRumbleY
          : -0.21) + equipDropY + this.landingDip * (isAimingSteady ? 0 : 0.45);
    const targetVmZ = isAimingSteady ? adsPos.z : isTacSlidePose ? -0.355 : -0.40;

    const bobAmp = isAimingSteady ? 0 : this.isSprinting ? 1.35 : 0.95;
    const bobX = Math.cos(this.weaponBobTime * 0.5) * 0.012 * bobAmp;
    const bobY = Math.abs(Math.sin(this.weaponBobTime)) * 0.014 * bobAmp;
    const swayScale = isAimingSteady ? 0 : 1.0;
    const recoilZScale = isAimingSteady ? 0.12 : 1.0;

    const vmPosBlend = 1 - Math.exp(-(isAimingSteady ? 32 : 18) * dt);
    const vmRotBlend = 1 - Math.exp(-(isAimingSteady ? 32 : 16) * dt);
    this.viewmodelRig.position.x += (targetVmX + bobX + this.swayX * swayScale - this.viewmodelRig.position.x) * vmPosBlend;
    this.viewmodelRig.position.y += (targetVmY - bobY + this.swayY * swayScale - this.viewmodelRig.position.y) * vmPosBlend;
    this.viewmodelRig.position.z += (targetVmZ + this.recoilOffset * recoilZScale - this.viewmodelRig.position.z) * Math.min(1, dt * 28);

    const distToAds = Math.hypot(
      this.viewmodelRig.position.x - adsPos.x,
      this.viewmodelRig.position.y - adsPos.y,
      this.viewmodelRig.position.z - adsPos.z
    );
    const isThroughScopeView = isAimingSteady && !isSniperScoped && distToAds < 0.085;
    setWeaponAdsCulling(activeVm, isThroughScopeView);

    let targetRotX = isAimingSteady ? 0 : this.recoilOffset * 1.15 + (this.swayRotX || 0);
    let targetRotY = 0;
    let targetRotZ = isAimingSteady ? 0 : -this.cameraRoll * 0.85 - (this.swayRotY || 0) * 0.35;
    if (!isAimingSteady) targetRotY += (this.swayRotY || 0);

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
}
