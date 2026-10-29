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
  getCachedGeo,
  poseOperatorCryzenPoster
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

export class LoopAndInputMethods {
  animate(now) {
    requestAnimationFrame(this.animate);

    const dt = Math.min(0.1, (now - this.lastFrameTime) / 1000);
    this.lastFrameTime = now;

    this.frameCount++;
    if (now - this.lastFpsUpdate >= 500) {
      this.currentFps = Math.round((this.frameCount * 1000) / (now - this.lastFpsUpdate));
      this.frameCount = 0;
      this.lastFpsUpdate = now;
      this.callbacks.onFpsUpdate?.(this.currentFps);

      // Avoid up/down WebGL backbuffer reallocation oscillation during gameplay (which stalls the GPU for 100-300ms):
      // only step down after sustained low FPS (>= 2s streak) with a cooldown, and never step back up mid-match.
      if (this.inMatch && this.currentFps < 38 && this.currentPixelRatio > this.quality.minPixelRatio) {
        this.lowFpsStreak = (this.lowFpsStreak || 0) + 1;
        const lastChangeAt = this.lastPixelRatioChangeAt ?? -10000;
        if (this.lowFpsStreak >= 4 && now - lastChangeAt >= 2000) {
          this.lowFpsStreak = 0;
          this.lastPixelRatioChangeAt = now;
          this.currentPixelRatio = Math.max(this.quality.minPixelRatio, Number((this.currentPixelRatio - 0.15).toFixed(2)));
          this.renderer.setPixelRatio(this.currentPixelRatio);
        }
      } else {
        this.lowFpsStreak = 0;
      }
    }

    if (!this.inMatch) {
      const angle = now * 0.00022;
      const orbitR = (this.arenaHalfSize || 60) * 0.56;
      this.camera.position.set(Math.cos(angle) * orbitR, 16.5, Math.sin(angle) * orbitR);
      this.camera.lookAt(0, 3.2, 0);
      this.viewmodelRig.visible = false;

      if (this.lobbyShowcaseGroup && this.lobbyOperator) {
        this.lobbyShowcaseGroup.visible = true;
        if (this.lobbyAutoRotate) {
          this.lobbyOperatorYaw += dt * 0.38;
        }
        this.lobbyOperator.group.rotation.y = Math.PI + this.lobbyOperatorYaw;
        this.lobbyOperator.crouching = Boolean(this.lobbyCrouching);
        const isTestFiring = (now - (this.lobbyTestShotAt || 0)) <= 450;
        if (this.lobbyPosterPose && !this.lobbyWalkDemo && !this.lobbyCrouching && !isTestFiring) {
          poseOperatorCryzenPoster(this.lobbyOperator, this.lobbyOperator.currentWeapon || 'rifle', now);
        } else {
          if (this.lobbyOperator._wasPosterPosed) {
            this.lobbyOperator._posedWeapon = null;
            this.lobbyOperator._wasPosterPosed = false;
          }
          this.animateHumanoidRig(
            this.lobbyOperator,
            dt,
            now,
            Boolean(this.lobbyWalkDemo),
            this.lobbyWalkDemo ? 0.18 : 0
          );
        }
        if (this.lobbyPosterPose && !this.lobbyWalkDemo && !this.lobbyCrouching && !isTestFiring) {
          this.lobbyOperator._wasPosterPosed = true;
        }
        if (this.lobbyWalkDemo && now >= (this.nextLobbyFootstepAt || 0)) {
          this.nextLobbyFootstepAt = now + (this.lobbyCrouching ? 560 : 460);
          this.callbacks?.onFootstep?.(false, Boolean(this.lobbyCrouching));
        }
        if (this.lobbyHoloRingOuter) this.lobbyHoloRingOuter.rotation.z = now * 0.0012;
        if (this.lobbyHoloRingInner) this.lobbyHoloRingInner.rotation.z = -now * 0.0018;
      }
    } else {
      if (this.lobbyShowcaseGroup) {
        this.lobbyShowcaseGroup.visible = false;
      }
      this.advanceFixedPhysics(dt);
      this.updateLocalPhysics(dt);
    }

    for (let i = 0; i < this.citadelRings.length; i++) {
      const ring = this.citadelRings[i];
      if (ring.isMesh) {
        ring.rotation.x = now * 0.0012 * (i % 2 === 0 ? 1 : -1);
      }
      ring.rotation.y = now * 0.0016 * (i % 2 === 0 ? 1 : -1);
    }
    if (this.ambientParticles) {
      this.ambientParticles.rotation.y = now * 0.00008;
    }

    this.updateRemotePlayers(dt, now);

    // Update top-left Tactical Mini Map / Radar when in match (~30Hz throttle, zero wrapper allocation)
    if (this.inMatch && this.minimap && (now - this.minimap.lastRenderAt >= 33 || now < this.minimap.lastRenderAt)) {
      this.minimap.update(this, now);
    }

    for (const item of this.pickupMeshes.values()) {
      if (item.crossGroup.visible) {
        item.crossGroup.rotation.y = now * 0.0024;
        item.crossGroup.position.y = 1.12 + Math.sin(now * 0.004) * 0.15;
      }
    }
    for (let j = 0; j < this.jumpPadMeshes.length; j++) {
      const jp = this.jumpPadMeshes[j];
      const phase1 = ((now * 0.0015 + j * 0.25) % 1);
      const phase2 = ((now * 0.0015 + j * 0.25 + 0.5) % 1);
      if (jp.ring1) {
        jp.ring1.position.y = 0.2 + phase1 * 0.85;
        jp.ringMat1.opacity = (1 - phase1) * 0.85;
        jp.ring1.scale.setScalar(0.85 + phase1 * 0.35);
      }
      if (jp.ring2) {
        jp.ring2.position.y = 0.2 + phase2 * 0.85;
        jp.ringMat2.opacity = (1 - phase2) * 0.85;
        jp.ring2.scale.setScalar(0.85 + phase2 * 0.35);
      }
    }

    const pickupRadius = MATCH_CONFIG.DROPPED_WEAPON_PICKUP_RADIUS || 2.8;
    let closestDrop = null;
    let closestDist = pickupRadius;
    let closestRemSec = 0;

    for (const [dropId, item] of this.droppedWeaponMeshes.entries()) {
      const remMs = item.localExpiresAt - now;
      if (remMs <= 0) {
        this.removeDroppedWeapon(dropId);
        continue;
      }
      item.gunSpinGroup.rotation.y = now * 0.0032;
      item.gunSpinGroup.position.y = 0.36 + Math.sin(now * 0.006) * 0.07;
      if (remMs < 1500) {
        const blink = Math.sin(now * 0.032) > 0 ? 0.92 : 0.25;
        item.ringMat.opacity = blink;
        item.gunSpinGroup.visible = blink > 0.5;
      }

      if (this.inMatch && this.alive) {
        const dist = Math.hypot(item.x - this.position.x, item.z - this.position.z);
        const dy = Math.abs((item.y || 0) - this.position.y);
        if (dist <= closestDist && dy <= 2.2) {
          closestDist = dist;
          closestDrop = item;
          closestRemSec = Math.max(0.1, remMs / 1000);
        }
      }
    }

    if (closestDrop) {
      const remTenths = Math.round(closestRemSec * 10);
      if (this.nearbyDrop?.id !== closestDrop.id || this._lastNearbyTenths !== remTenths) {
        this.nearbyDrop = closestDrop;
        this._lastNearbyTenths = remTenths;
        this.callbacks.onNearbyWeaponChange?.(closestDrop, closestRemSec);
      }
    } else if (this.nearbyDrop) {
      this.nearbyDrop = null;
      this._lastNearbyTenths = -1;
      this.callbacks.onNearbyWeaponChange?.(null, 0);
    }

    const gMapCfg = this._movementMapCfg || (this._movementMapCfg = { obstacles: [], arenaHalfSize: MATCH_CONFIG.ARENA_HALF_SIZE });
    gMapCfg.obstacles = this.currentObstacles || [];
    gMapCfg.arenaHalfSize = this.arenaHalfSize || MATCH_CONFIG.ARENA_HALF_SIZE;

    for (const [gId, item] of this.activeGrenadeMeshes.entries()) {
      if (now - item.createdAt > 3500) {
        this.removeGrenadeMesh(gId);
        continue;
      }

      // Client extrapolation uses the exact same shared, sub-stepped integrator as the server (updateGrenades)
      const bouncedImpact = stepGrenade(item, dt, gMapCfg);

      if (this.inMatch && bouncedImpact > 1.3 && now - (item.lastBounceSoundAt || 0) > 110) {
        item.lastBounceSoundAt = now;
        this.sfx?.playGrenadeBounce?.(this.getAudioListenerState(), item);
      }

      item.fuseRemaining = Math.max(0, item.fuseRemaining - dt);
      item.group.position.set(item.x, item.y, item.z);

      const speed = Math.hypot(item.vx, item.vy, item.vz);
      item.bodyGroup.rotation.x += dt * (4.0 + speed * 0.85);
      item.bodyGroup.rotation.z += dt * (3.2 + speed * 0.65);

      const blinkFreq = item.fuseRemaining < 0.7 ? 0.045 : 0.018;
      const blinkOn = Math.sin(now * blinkFreq) > 0;
      item.fuseMat.color.setHex(blinkOn ? 0xff3b30 : 0xfef08a);
      item.fuseBeacon.scale.setScalar(blinkOn ? 0.54 : 0.32);
      item.glowRing.rotation.z = now * 0.006;

      if (item.trailPositions && item.trailGeo) {
        const arr = item.trailPositions;
        for (let t = arr.length - 3; t >= 3; t -= 3) {
          arr[t] = arr[t - 3];
          arr[t + 1] = arr[t - 2];
          arr[t + 2] = arr[t - 1];
        }
        arr[0] = item.x;
        arr[1] = item.y;
        arr[2] = item.z;
        item.trailGeo.attributes.position.needsUpdate = true;
      }
    }

    for (let i = this.activeShells.length - 1; i >= 0; i--) {
      const sh = this.activeShells[i];
      const elapsed = now - sh.createdAt;
      if (elapsed >= sh.duration) {
        this.scene.remove(sh.mesh);
        this.activeShells.splice(i, 1);
        if (!this.shellPool) this.shellPool = [];
        if (this.shellPool.length < 24) {
          this.shellPool.push(sh);
        }
      } else {
        sh.vy -= 18.0 * dt;
        sh.mesh.position.x += sh.vx * dt;
        sh.mesh.position.y += sh.vy * dt;
        sh.mesh.position.z += sh.vz * dt;
        sh.mesh.rotation.x += sh.rx * dt;
        sh.mesh.rotation.y += sh.ry * dt;
        sh.mesh.rotation.z += sh.rz * dt;
      }
    }

    for (let i = this.activeEffects.length - 1; i >= 0; i--) {
      const fx = this.activeEffects[i];
      const elapsed = now - fx.createdAt;
      if (elapsed >= fx.duration) {
        if (fx.type === 'popup') {
          fx.sprite.visible = false;
          if (!this.damagePopupPool) this.damagePopupPool = [];
          this.damagePopupPool.push(fx);
        } else if (fx.type === 'explosion') {
          this._recycleExplosionEffect(fx);
        } else {
          this._recycleTracerEffect(fx);
        }
        this.activeEffects.splice(i, 1);
      } else {
        const progress = elapsed / fx.duration;
        const alpha = 1 - progress;
        if (fx.type === 'popup') {
          fx.sprite.position.y += fx.vy * dt;
          fx.mat.opacity = alpha;
        } else if (fx.type === 'explosion') {
          const easeOut = 1 - Math.pow(1 - progress, 2.4);
          fx.coreSphere.scale.setScalar(0.45 + easeOut * 2.2);
          fx.coreMat.opacity = Math.max(0, 1 - progress * 1.65);

          fx.fireballSphere.scale.setScalar(0.75 + easeOut * 3.1);
          fx.fireballMat.opacity = alpha * 0.88;

          fx.blastWaveSphere.scale.setScalar(1.0 + easeOut * (fx.maxRadius - 1.0));
          fx.blastWaveMat.opacity = alpha * 0.42;

          fx.shockwaveRing.scale.setScalar(0.6 + easeOut * (fx.maxRadius * 0.96));
          fx.shockwaveMat.opacity = alpha * 0.92;

          fx.torusRing.scale.setScalar(0.5 + easeOut * (fx.maxRadius * 0.72));
          fx.torusMat.opacity = alpha * 0.82;

          if (fx.flashLight) {
            fx.flashLight.intensity = this.quality.dynamicLights >= 2 ? 8.5 * alpha * alpha : 0;
          }

          if (fx.particles) {
            fx.sparkMat.opacity = alpha;
            for (let p = 0; p < fx.particles.length; p++) {
              const pt = fx.particles[p];
              pt.vy -= 18.0 * dt;
              pt.mesh.position.x += pt.vx * dt;
              pt.mesh.position.y += pt.vy * dt;
              pt.mesh.position.z += pt.vz * dt;
              if (pt.mesh.position.y < 0.08) {
                pt.mesh.position.y = 0.08;
                pt.vy = Math.abs(pt.vy) * 0.35;
              }
            }
          }
        } else {
          if (fx.geo && fx.totalDist > 0) {
            const travelProg = fx.travelMs > 0 ? Math.min(1, elapsed / fx.travelMs) : 1;
            const headDist = Math.min(fx.totalDist, fx.boltLen + travelProg * fx.totalDist);
            const tailDist = Math.min(fx.totalDist, Math.max(0, headDist - fx.boltLen));
            const posAttr = fx.geo.attributes.position;
            const arr = posAttr.array;
            arr[0] = fx.ox + fx.ux * tailDist;
            arr[1] = fx.oy + fx.uy * tailDist;
            arr[2] = fx.oz + fx.uz * tailDist;
            arr[3] = fx.ox + fx.ux * headDist;
            arr[4] = fx.oy + fx.uy * headDist;
            arr[5] = fx.oz + fx.uz * headDist;
            posAttr.needsUpdate = true;
            if (fx.line) {
              fx.line.visible = (headDist - tailDist) > 0.015;
            }
          }
          fx.mat.opacity = Math.min(1, alpha * 1.25);
          fx.sparkMat.opacity = alpha;
          if (fx.particles) {
            for (let p = 0; p < fx.particles.length; p++) {
              const pt = fx.particles[p];
              pt.vy -= 14.0 * dt;
              pt.mesh.position.x += pt.vx * dt;
              pt.mesh.position.y += pt.vy * dt;
              pt.mesh.position.z += pt.vz * dt;
            }
          }
        }
      }
    }

    this.renderer.render(this.scene, this.camera);
    this.perfOverlay?.update(now, this.renderer, { tier: this.tier, pixelRatio: this.currentPixelRatio, net: this.getNetOverlayText() });
  }

  get mouseSensitivity() {
    return this.sensitivity;
  }

  set mouseSensitivity(val) {
    const clean = Number(val);
    if (Number.isFinite(clean)) {
      this.sensitivity = clean;
    }
  }

  requestPointerLock() {
    try {
      const lockPromise = this.renderer.domElement.requestPointerLock?.({ unadjustedMovement: true });
      if (lockPromise && typeof lockPromise.catch === 'function') {
        lockPromise.catch(() => {
          this.renderer.domElement.requestPointerLock?.();
        });
      }
    } catch {
      this.renderer.domElement.requestPointerLock?.();
    }
    if (typeof navigator !== 'undefined' && navigator.keyboard && typeof navigator.keyboard.lock === 'function') {
      try {
        navigator.keyboard.lock([
          'KeyW',
          'KeyA',
          'KeyS',
          'KeyD',
          'KeyR',
          'KeyQ',
          'KeyE',
          'KeyF',
          'KeyG',
          'KeyC',
          'ControlLeft',
          'ShiftLeft',
          'Space',
          'Tab',
          'Escape'
        ])?.catch?.(() => {});
      } catch {
        // Ignore unsupported Keyboard Lock API errors
      }
    }
  }

  exitPointerLock() {
    if (document.pointerLockElement) {
      document.exitPointerLock?.();
    }
  }

  bindEvents() {
    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    }, { passive: true });

    document.addEventListener('pointerlockchange', () => {
      this.isPointerLocked = document.pointerLockElement === this.renderer.domElement;
      if (this.isPointerLocked) {
        this._pointerLockedAt = performance.now();
        this._skipFirstMouseJump = true;
        this._avgMouseDelta = 0;
      }
      if (this.isPointerLocked) {
        if (typeof navigator !== 'undefined' && navigator.keyboard && typeof navigator.keyboard.lock === 'function') {
          try {
            navigator.keyboard.lock([
              'KeyW',
              'KeyA',
              'KeyS',
              'KeyD',
              'KeyR',
              'KeyQ',
              'KeyE',
              'KeyF',
              'KeyG',
              'KeyC',
              'ControlLeft',
              'ShiftLeft',
              'Space',
              'Tab',
              'Escape'
            ])?.catch?.(() => {});
          } catch {
            // Ignore unsupported Keyboard Lock API errors
          }
        }
      } else {
        this.isMouseDown = false;
        this.isRightMouseDown = false;
        this.adsToggleActive = false;
        this.isAiming = false;
        this.isSprinting = false;
        this._slideTapActive = false;
        this.cancelGrenadeCooking();
        setWeaponAdsCulling(this.viewmodelMeshes[this.currentWeapon], false);
        this.callbacks.onAimChange?.(false, this.currentWeapon);
      }
      this.callbacks.onPointerLockChange?.(this.isPointerLocked);
    });

    window.addEventListener('mousemove', (e) => {
      if (!this.isPointerLocked || !this.inMatch || !this.alive) return;
      const rawMx = Number(e.movementX);
      const rawMy = Number(e.movementY);
      if (!Number.isFinite(rawMx) || !Number.isFinite(rawMy)) return;
      if (rawMx === 0 && rawMy === 0) return;

      const absMx = Math.abs(rawMx);
      const absMy = Math.abs(rawMy);
      const mag = Math.hypot(rawMx, rawMy);

      // Guard against Chromium Pointer Lock initial cursor-recenter jump (> 120px on the first event after lock)
      if (this._skipFirstMouseJump) {
        this._skipFirstMouseJump = false;
        if (absMx > 120 || absMy > 120) {
          return;
        }
      }

      // Guard against OS/browser cursor-recenter spikes during high-polling-rate bursts or frame hitches:
      // if a single event jumps > 240px AND exceeds 6x the recent moving average delta, clamp it smoothly.
      let mx = rawMx;
      let my = rawMy;
      const avg = this._avgMouseDelta || 12;
      if ((absMx > 240 || absMy > 240) && mag > Math.max(240, avg * 6)) {
        const cap = Math.max(80, avg * 2.5);
        const scale = cap / mag;
        mx *= scale;
        my *= scale;
      }
      this._avgMouseDelta = avg * 0.8 + Math.min(180, Math.hypot(mx, my)) * 0.2;
      const aimScale = this.isAiming && this.currentWeapon === 'sniper' ? 0.36 : this.isAiming ? 0.78 : 1.0;
      const sens = 0.0021 * this.sensitivity * aimScale;
      const dx = -mx * sens;
      const dy = -my * sens;
      this.yaw += dx;
      this.pitch = Math.max(-Math.PI / 2 + 0.05, Math.min(Math.PI / 2 - 0.05, this.pitch + dy));
      if (dy < 0 && this.accumulatedRecoilPitch > 0) {
        this.accumulatedRecoilPitch = Math.max(0, this.accumulatedRecoilPitch + dy);
      } else if (dy > 0 && this.accumulatedRecoilPitch > 0) {
        this.accumulatedRecoilPitch = Math.max(0, this.accumulatedRecoilPitch - dy * 0.65);
      }

      this.swayX = Math.max(-0.045, Math.min(0.045, -mx * 0.00055));
      this.swayY = Math.max(-0.045, Math.min(0.045, my * 0.00055));
      if (dx * this.accumulatedRecoilYaw > 0 && Math.abs(dx) > 1e-5) {
        this.accumulatedRecoilYaw *= Math.max(0, 1 - Math.abs(dx) * 16);
        if (Math.abs(this.accumulatedRecoilYaw) < 1e-4) {
          this.accumulatedRecoilYaw = 0;
        }
      } else if (dx * this.accumulatedRecoilYaw < 0) {
        const prevSign = Math.sign(this.accumulatedRecoilYaw);
        this.accumulatedRecoilYaw += dx;
        if (Math.sign(this.accumulatedRecoilYaw) !== prevSign) {
          this.accumulatedRecoilYaw = 0;
        }
      }
      this.swayRotY = Math.max(-0.085, Math.min(0.085, (this.swayRotY || 0) - mx * 0.00075));
      this.swayRotX = Math.max(-0.065, Math.min(0.065, (this.swayRotX || 0) - my * 0.00065));
    }, { passive: true });

    window.addEventListener('mousedown', (e) => {
      this.sfx?.ensureContext?.();
      if (!this.inMatch) return;
      if (!this.isPointerLocked) {
        if (e.target === this.renderer.domElement) {
          this.requestPointerLock();
        }
        return;
      }

      if (e.button === 0) {
        this.isMouseDown = true;
        this.attemptShoot();
      } else if (e.button === 2) {
        const now = performance.now();
        const wCfg = WEAPONS[this.currentWeapon];
        this.isRightMouseDown = true;
        this.adsPressedAt = now;
        if (this.alive && !wCfg?.isMelee && this.reloadingUntil <= now) {
          if (this.isAiming && this.adsToggleActive) {
            this.isAiming = false;
            this.adsToggleActive = false;
            setWeaponAdsCulling(this.viewmodelMeshes[this.currentWeapon], false);
            this.callbacks.onAimChange?.(false, this.currentWeapon);
          } else {
            this.isAiming = true;
            this.isSprinting = false;
            this.callbacks.onAimChange?.(true, this.currentWeapon);
          }
        }
      }
    }, { passive: true });

    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) {
        this.isMouseDown = false;
      } else if (e.button === 2) {
        this.isRightMouseDown = false;
        const heldMs = performance.now() - (this.adsPressedAt || 0);
        if (this.isAiming) {
          if (heldMs < 220 && !this.adsToggleActive) {
            this.adsToggleActive = true;
          } else {
            this.isAiming = false;
            this.adsToggleActive = false;
            setWeaponAdsCulling(this.viewmodelMeshes[this.currentWeapon], false);
            this.callbacks.onAimChange?.(false, this.currentWeapon);
          }
        }
      }
    }, { passive: true });

    window.addEventListener('contextmenu', (e) => {
      if (this.inMatch) e.preventDefault();
    });

    window.addEventListener('wheel', (e) => {
      if (!this.inMatch || !this.isPointerLocked || !this.alive) return;
      const slotWeapons = [this.loadout.primary, this.loadout.secondary, this.loadout.melee];
      const idx = Math.max(0, slotWeapons.indexOf(this.currentWeapon));
      const nextIdx = (idx + (e.deltaY > 0 ? 1 : -1) + slotWeapons.length) % slotWeapons.length;
      this.switchWeapon(slotWeapons[nextIdx]);
      this.callbacks.onAimChange?.(false, this.currentWeapon);
    }, { passive: true });

    const protectedActionKeys = new Set([
      'KeyW',
      'KeyA',
      'KeyS',
      'KeyD',
      'KeyR',
      'KeyF',
      'KeyG',
      'KeyQ',
      'KeyE',
      'KeyC',
      'KeyZ',
      'KeyX',
      'KeyB',
      'KeyL',
      'KeyT',
      'KeyN',
      'Tab',
      'Space',
      'ControlLeft',
      'ControlRight',
      'ShiftLeft',
      'ShiftRight'
    ]);

    window.addEventListener('keydown', (e) => {
      this.sfx?.ensureContext?.();
      const activeTag = document.activeElement?.tagName;
      if (
        !this.isPointerLocked &&
        (activeTag === 'INPUT' || activeTag === 'TEXTAREA' || activeTag === 'SELECT')
      ) {
        return;
      }

      if (e.code in this.keys) {
        this.keys[e.code] = true;
      } else if (e.code === 'ControlRight') {
        this.keys.ControlLeft = true;
      }

      if (this.inMatch || this.isPointerLocked) {
        if (
          e.code === 'F5' ||
          ((e.ctrlKey || e.metaKey || e.altKey) && protectedActionKeys.has(e.code))
        ) {
          e.preventDefault();
          e.stopPropagation();
        }
      }

      if (!this.inMatch) return;

      if (e.code === 'Tab' || e.code === 'KeyB' || e.code === 'KeyF' || e.code === 'KeyG') {
        e.preventDefault();
      }
      if (e.repeat) return;

      if (e.code === 'Digit1') this.switchSlot(1);
      else if (e.code === 'Digit2') this.switchSlot(2);
      else if (e.code === 'Digit3') this.switchSlot(3);
      else if ((e.code === 'KeyC' || e.code === 'ControlLeft' || e.code === 'ControlRight') && this.alive) {
        if (this.isSliding) {
          // CoD Slide-Cancel: tapping Crouch again mid-slide immediately cancels the slide latch
          this._slideTapActive = false;
          this.keys.KeyC = false;
          this.keys.ControlLeft = false;
        } else if (
          this.onGround &&
          !this.crouching &&
          !this.prone &&
          commandTimeMs((this.prediction?.nextSeq || 0) + 1) >= (this.slideCooldownUntil || 0) &&
          Math.hypot(this.velocity.x, this.velocity.z) >= (MATCH_CONFIG.SLIDE_MIN_SPEED || 3.6)
        ) {
          // Tap-to-Slide: a single tap commits to the full slide and auto-stands/sprints when the slide ends
          this._slideTapActive = true;
        }
      }
      else if ((e.code === 'Space' || e.code === 'ShiftLeft' || e.code === 'ShiftRight') && this.isSliding) {
        // Pressing Jump or Sprint mid-slide cancels the tap-slide crouch latch (Slide-Cancel / Bunny-Hop)
        this._slideTapActive = false;
        this.keys.KeyC = false;
        this.keys.ControlLeft = false;
      }
      else if (e.code === 'KeyB') {
        this.callbacks.onLoadoutToggle?.();
      }
      else if (e.code === 'KeyG' && this.alive) {
        this.startGrenadeCooking();
      }
      else if (e.code === 'KeyZ' && this.alive && this.onGround) {
        this.prone = !this.prone;
        if (this.prone) {
          this.isSprinting = false;
          this.isSliding = false;
          this._slideTapActive = false;
          this.crouching = false;
        }
      }
      else if (e.code === 'KeyF' && this.alive && this.nearbyDrop) {
        this.callbacks.onPickupWeapon?.(this.nearbyDrop.id);
      }
      else if (e.code === 'KeyR') this.startReload();
      else if (e.code === 'KeyL') this.callbacks.onCopyLinkShortcut?.();
      else if (e.code === 'Tab') {
        this.callbacks.onScoreboardToggle?.(true);
      }
    }, { capture: true });

    window.addEventListener('keyup', (e) => {
      if (e.code in this.keys) {
        this.keys[e.code] = false;
      } else if (e.code === 'ControlRight') {
        this.keys.ControlLeft = false;
      }
      if (e.code === 'KeyG' && this.isCookingGrenade) {
        e.preventDefault();
        this.releaseGrenadeCooking();
      }
      if (e.code === 'Tab') {
        e.preventDefault();
        this.callbacks.onScoreboardToggle?.(false);
      }
    }, { capture: true });
  }
}
