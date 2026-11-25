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
import { updateSkySwifts } from '../arena/skyAtmosphere.js';
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

export const LOBBY_CAMERA_PRESETS = {
  // Compact Wingman/Retake 6-map camera framing (halfSize 30..38m).
  // Verified clear of all obstacle AABBs and strictly inside perimeter walls (<= halfSize - 6.5m)
  // so overview, gunsmith, and operator showcase cameras never clip outside the arena.
  de_dust2: {
    harbor: { pos: [-16.0, 11.4, 21.0], amp: [3.2, 0.55, 2.6], freq: [0.12, 0.19, 0.10], look: [4.5, 3.2, -3.5], lookAmp: [2.2, 0.30, 1.8], lookFreq: [0.08, 0.15, 0.11] },
    weapon: { pos: [-10.0, 5.2, 13.0], amp: [0.65, 0.12, 0.55], freq: [0.15, 0.22, 0.13], look: [8.0, 3.6, -4.5] },
    operator: { pos: [-10.0, 4.1, 13.5], amp: [0.70, 0.10, 0.60], freq: [0.14, 0.20, 0.12], look: [9.0, 3.0, -5.0] }
  },
  de_mirage: {
    harbor: { pos: [-14.0, 11.8, 20.0], amp: [3.2, 0.55, 2.6], freq: [0.11, 0.18, 0.10], look: [12.0, 3.2, 0.5], lookAmp: [2.4, 0.30, 2.0], lookFreq: [0.08, 0.14, 0.11] },
    weapon: { pos: [-12.5, 5.2, -3.0], amp: [0.65, 0.12, 0.55], freq: [0.15, 0.21, 0.13], look: [14.5, 3.4, 2.0] },
    operator: { pos: [-12.5, 4.0, -2.5], amp: [0.70, 0.10, 0.60], freq: [0.14, 0.20, 0.12], look: [15.0, 3.0, 2.5] }
  },
  de_inferno: {
    harbor: { pos: [-12.0, 11.2, 19.5], amp: [3.0, 0.50, 2.4], freq: [0.12, 0.19, 0.10], look: [1.0, 2.4, -3.5], lookAmp: [2.0, 0.26, 1.8], lookFreq: [0.09, 0.15, 0.11] },
    weapon: { pos: [-9.0, 5.2, 1.5], amp: [0.60, 0.12, 0.55], freq: [0.15, 0.22, 0.13], look: [3.5, 2.4, -5.0] },
    operator: { pos: [-9.0, 4.0, 2.0], amp: [0.65, 0.10, 0.60], freq: [0.14, 0.20, 0.12], look: [4.0, 2.2, -5.5] }
  },
  de_nuke: {
    harbor: { pos: [-19.5, 12.6, 21.5], amp: [3.2, 0.60, 2.6], freq: [0.11, 0.18, 0.10], look: [6.0, 3.6, -1.0], lookAmp: [2.4, 0.32, 2.0], lookFreq: [0.08, 0.14, 0.11] },
    weapon: { pos: [-11.5, 5.4, -2.5], amp: [0.65, 0.12, 0.55], freq: [0.15, 0.22, 0.13], look: [10.5, 3.6, 0.5] },
    operator: { pos: [-11.5, 4.1, -2.0], amp: [0.70, 0.10, 0.60], freq: [0.14, 0.20, 0.12], look: [11.0, 3.0, 0.5] }
  },
  fy_iceworld: {
    harbor: { pos: [-17.5, 11.2, 17.5], amp: [2.8, 0.50, 2.4], freq: [0.12, 0.19, 0.11], look: [0.5, 2.6, -0.5], lookAmp: [1.8, 0.25, 1.8], lookFreq: [0.09, 0.15, 0.11] },
    weapon: { pos: [-16.0, 5.4, 16.0], amp: [0.60, 0.11, 0.55], freq: [0.15, 0.22, 0.13], look: [2.5, 2.8, -2.5] },
    operator: { pos: [-15.8, 4.2, 16.2], amp: [0.65, 0.10, 0.60], freq: [0.14, 0.20, 0.12], look: [3.0, 2.5, -3.0] }
  },
  aim_map: {
    harbor: { pos: [-14.5, 10.2, 16.5], amp: [2.8, 0.48, 2.4], freq: [0.13, 0.20, 0.11], look: [0.5, 2.4, -0.5], lookAmp: [1.8, 0.24, 1.6], lookFreq: [0.09, 0.15, 0.11] },
    weapon: { pos: [-11.5, 5.0, 8.0], amp: [0.55, 0.11, 0.50], freq: [0.15, 0.22, 0.13], look: [4.5, 2.4, -3.5] },
    operator: { pos: [-11.5, 3.9, 8.5], amp: [0.60, 0.10, 0.55], freq: [0.14, 0.20, 0.12], look: [5.0, 2.2, -4.0] }
  }
};

export class LoopAndInputMethods {
  animate(now) {
    requestAnimationFrame(this.animate);

    const dt = Math.max(0, Math.min(0.1, (now - this.lastFrameTime) / 1000));
    this.lastFrameTime = now;

    // Progressive smoothness watchdog (1s rolling windows):
    // 1) Shed half-res N8AO (<52 FPS x2s), 2) Shed SMAA (<48 FPS x2s), 3) Bypass PostFX (<30 FPS x2s)
    // BEFORE degrading pixelRatio.
    const aoWatchActive = Boolean(this.inMatch && this.quality?.aoEnabled && this.postProcess?.aoEnabled);
    const smaaWatchActive = Boolean(this.inMatch && this.postProcess?.enabled && this.postProcess?.smaaEnabled);
    const postBypassWatchActive = Boolean(this.inMatch && this.postProcess?.enabled);
    if (aoWatchActive || smaaWatchActive || postBypassWatchActive) {
      if (typeof this._aoWatchdogLastAt !== 'number' || now - this._aoWatchdogLastAt > 15000) {
        this._aoWatchdogLastAt = now;
        this._aoWatchdogFrames = 1;
      } else {
        this._aoWatchdogFrames = (this._aoWatchdogFrames || 0) + 1;
        const aoElapsed = now - this._aoWatchdogLastAt;
        if (aoElapsed >= 1000) {
          const aoFps = Math.round((this._aoWatchdogFrames * 1000) / aoElapsed);
          this._aoWatchdogFrames = 0;
          this._aoWatchdogLastAt = now;
          const threshold = aoWatchActive ? 52 : smaaWatchActive ? 48 : 30;
          if (aoFps < threshold) {
            this._aoWatchdogLowStreak = (this._aoWatchdogLowStreak || 0) + 1;
            if (this._aoWatchdogLowStreak >= 2) {
              this._aoWatchdogLowStreak = 0;
              if (aoWatchActive) {
                this.postProcess?.setAOEnabled?.(false, { fromWatchdog: true });
              } else if (smaaWatchActive) {
                this.postProcess?.setSMAAEnabled?.(false, { fromWatchdog: true });
              } else if (postBypassWatchActive) {
                this.postProcess?.setPostEnabled?.(false, { fromWatchdog: true });
              }
              this.lowFpsStreak = 0;
              this.lastPixelRatioChangeAt = now;
            }
          } else {
            this._aoWatchdogLowStreak = 0;
          }
        }
      }
    } else {
      this._aoWatchdogFrames = 0;
      this._aoWatchdogLastAt = null;
      this._aoWatchdogLowStreak = 0;
    }

    this.frameCount++;
    if (now - this.lastFpsUpdate >= 500) {
      this.currentFps = Math.round((this.frameCount * 1000) / (now - this.lastFpsUpdate));
      this.frameCount = 0;
      this.lastFpsUpdate = now;
      this.callbacks.onFpsUpdate?.(this.currentFps);

      // Avoid up/down WebGL backbuffer reallocation oscillation during gameplay (which stalls the GPU for 100-300ms):
      // only step down after sustained low FPS (>= 2s streak) with a cooldown, and only after AO/SMAA/severe-PostFX shedding.
      const holdPixelRatioForWatchdog = Boolean(
        (this.quality?.aoEnabled && this.postProcess?.aoEnabled) ||
          (this.postProcess?.enabled && this.postProcess?.smaaEnabled) ||
          (this.postProcess?.enabled && this.currentFps < 30)
      );
      if (this.inMatch && !holdPixelRatioForWatchdog && this.currentFps < 38 && this.currentPixelRatio > this.quality.minPixelRatio) {
        this.lowFpsStreak = (this.lowFpsStreak || 0) + 1;
        const lastChangeAt = this.lastPixelRatioChangeAt ?? -10000;
        if (this.lowFpsStreak >= 4 && now - lastChangeAt >= 2000) {
          this.lowFpsStreak = 0;
          this.lastPixelRatioChangeAt = now;
          this.currentPixelRatio = Math.max(this.quality.minPixelRatio, Number((this.currentPixelRatio - 0.15).toFixed(2)));
          this.renderer.setPixelRatio(this.currentPixelRatio);
          this.postProcess?.setSize?.(window.innerWidth, window.innerHeight, this.currentPixelRatio);
        }
      } else {
        this.lowFpsStreak = 0;
      }
    }

    if (!this.inMatch) {
      const tSec = now * 0.001;
      const half = this.arenaHalfSize || 38;
      const safeBound = Math.max(8, half - 6.5);
      const camMode = this.lobbyCameraMode || 'harbor';
      const mapId = this.currentMapConfig?.id || this.currentMapId || DEFAULT_MAP_ID;
      const mapPresets = LOBBY_CAMERA_PRESETS[mapId] || LOBBY_CAMERA_PRESETS.de_dust2;
      const preset = mapPresets[camMode] || mapPresets.harbor;

      if (!this._lobbyCamPos) {
        this._lobbyCamPos = new THREE.Vector3(preset.pos[0], preset.pos[1], preset.pos[2]);
        this._lobbyLookTarget = new THREE.Vector3(preset.look[0], preset.look[1], preset.look[2]);
        this._lobbyDesiredPos = new THREE.Vector3();
        this._lobbyDesiredLook = new THREE.Vector3();
      }

      const rawX = preset.pos[0] + Math.sin(tSec * preset.freq[0]) * preset.amp[0];
      const rawY = preset.pos[1] + Math.sin(tSec * preset.freq[1]) * preset.amp[1];
      const rawZ = preset.pos[2] + Math.cos(tSec * preset.freq[2]) * preset.amp[2];
      this._lobbyDesiredPos.set(
        Math.max(-safeBound, Math.min(safeBound, rawX)),
        rawY,
        Math.max(-safeBound, Math.min(safeBound, rawZ))
      );

      if (preset.lookAmp && preset.lookFreq) {
        this._lobbyDesiredLook.set(
          preset.look[0] + Math.sin(tSec * preset.lookFreq[0]) * preset.lookAmp[0],
          preset.look[1] + Math.sin(tSec * preset.lookFreq[1]) * preset.lookAmp[1],
          preset.look[2] + Math.cos(tSec * preset.lookFreq[2]) * preset.lookAmp[2]
        );
      } else {
        this._lobbyDesiredLook.set(preset.look[0], preset.look[1], preset.look[2]);
      }

      const dampAlpha = !this._lobbyCamInitialized || dt <= 0 ? 1 : 1 - Math.exp(-dt * 4.6);
      this._lobbyCamInitialized = true;
      this._lobbyCamPos.lerp(this._lobbyDesiredPos, dampAlpha);
      this._lobbyLookTarget.lerp(this._lobbyDesiredLook, dampAlpha);

      this.camera.position.copy(this._lobbyCamPos);
      this.camera.lookAt(this._lobbyLookTarget);
      if (camMode === 'harbor') {
        this.camera.rotation.z += Math.sin(tSec * 0.21) * 0.004;
      }
      this.viewmodelRig.visible = false;

      if (this.lobbyShowcaseGroup && this.lobbyOperator) {
        const vw = Math.max(1, window.innerWidth || 1280);
        const vh = Math.max(1, window.innerHeight || 720);
        const aspect = this.camera.aspect || vw / vh;
        const railRight = Math.min(vw * 0.42, 384);
        const ndcCenterX = (((railRight + vw) * 0.5) / vw) * 2 - 1;
        const halfTan = Math.tan(THREE.MathUtils.degToRad((this.camera.fov || 68) * 0.5));

        if (camMode === 'harbor') {
          this.lobbyShowcaseGroup.visible = false;
        } else if (camMode === 'weapon') {
          const d = aspect < 1.35 ? 1.45 : 1.28;
          const worldX = ndcCenterX * halfTan * aspect * d;
          this.lobbyShowcaseGroup.visible = true;
          this.lobbyShowcaseGroup.position.set(worldX, -0.02, -d);
          this.lobbyOperator.group.visible = false;
          if (this.lobbyPedestalGroup) this.lobbyPedestalGroup.visible = false;
          if (this.lobbyWeaponInspectGroup) this.lobbyWeaponInspectGroup.visible = true;

          if (this.lobbyAutoRotate) {
            this.lobbyOperatorYaw += dt * 0.34;
          }
          if (this.lobbyWeaponInspectSpin) {
            const shotElapsed = now - (this.lobbyTestShotAt || 0);
            const kick = shotElapsed >= 0 && shotElapsed <= 160 ? (1 - shotElapsed / 160) : 0;
            this.lobbyWeaponInspectSpin.rotation.y = Math.PI * 0.5 + this.lobbyOperatorYaw;
            this.lobbyWeaponInspectSpin.rotation.z = kick * 0.075;
            this.lobbyWeaponInspectSpin.position.x = -kick * 0.022;
            const inspectWep = this.lobbyWeaponInspectMesh?.userData?.weaponMesh;
            if (inspectWep?.userData?.flashMesh) {
              inspectWep.userData.flashMesh.visible = shotElapsed >= 0 && shotElapsed <= 65;
            }
          }
        } else {
          const d = aspect < 1.35 ? 3.15 : 2.88;
          const worldX = ndcCenterX * halfTan * aspect * d;
          this.lobbyShowcaseGroup.visible = true;
          this.lobbyShowcaseGroup.position.set(worldX, -0.94, -d);
          this.lobbyOperator.group.visible = true;
          if (this.lobbyPedestalGroup) this.lobbyPedestalGroup.visible = true;
          if (this.lobbyWeaponInspectGroup) this.lobbyWeaponInspectGroup.visible = false;

          if (this.lobbyAutoRotate) {
            this.lobbyOperatorYaw += dt * 0.14;
          }
          this.lobbyOperator.group.rotation.y = Math.PI + this.lobbyOperatorYaw;
          this.lobbyOperator.crouching = Boolean(this.lobbyCrouching);
          const isTestFiring = (now - (this.lobbyTestShotAt || 0)) <= 450;
          const prevSoldierTime = this.lobbyOperator._soldierMixer ? this.lobbyOperator._soldierMixer.time : null;
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
          if (this.lobbyOperator._soldierMixer && dt > 0 && this.lobbyOperator._soldierMixer.time === prevSoldierTime) {
            if (typeof this.lobbyOperator.updateSoldierGlbAnimation === 'function') {
              this.lobbyOperator.updateSoldierGlbAnimation(
                dt,
                Boolean(this.lobbyWalkDemo),
                this.lobbyWalkDemo ? 0.18 : 0,
                Boolean(this.lobbyCrouching),
                false
              );
            } else {
              const acts = this.lobbyOperator._soldierActions;
              if (acts?.Idle && acts?.Walk && this.lobbyWalkDemo) {
                acts.Walk.enabled = true;
                acts.Walk.setEffectiveWeight?.(1);
                acts.Idle.setEffectiveWeight?.(0);
              } else if (acts?.Idle) {
                acts.Idle.enabled = true;
                acts.Idle.setEffectiveWeight?.(1);
                acts.Walk?.setEffectiveWeight?.(0);
                acts.Run?.setEffectiveWeight?.(0);
              }
              this.lobbyOperator._soldierMixer.update(dt);
            }
          }
          if (this.lobbyPosterPose && !this.lobbyWalkDemo && !this.lobbyCrouching && !isTestFiring) {
            this.lobbyOperator._wasPosterPosed = true;
          }
          if (this.lobbyWalkDemo && now >= (this.nextLobbyFootstepAt || 0)) {
            this.nextLobbyFootstepAt = now + (this.lobbyCrouching ? 560 : 460);
            this.callbacks?.onFootstep?.(false, Boolean(this.lobbyCrouching));
          }
        }
      }
    } else {
      if (this.lobbyShowcaseGroup) {
        this.lobbyShowcaseGroup.visible = false;
      }
      this._lobbyCamInitialized = false;
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
    if (this.harborWaterUniform) {
      this.harborWaterUniform.value = now * 0.001;
    }
    if (this.skyTimeUniform) {
      this.skyTimeUniform.value = now * 0.001;
    }
    if (this.skySwifts) {
      updateSkySwifts(this, now * 0.001);
    }

    this.updateRemotePlayers(dt, now);

    // Texel-snapped directional shadow camera following the player (in-match) or lobby focus (in-lobby)
    if (this.renderer.shadowMap.enabled && this.dirLight) {
      const focusX = this.inMatch ? (this.position?.x || 0) : (this._lobbyLookTarget?.x || 0);
      const focusZ = this.inMatch ? (this.position?.z || 0) : (this._lobbyLookTarget?.z || 0);
      this.updateDirectionalShadowAnchor?.(focusX, focusZ);
    }

    // Saltline High-Tier Throttled Dynamic Shadows (30Hz exclusively on Cao / high; 0Hz static/off on Thấp & Vừa)
    if (this.inMatch && this.quality.dynamicShadowHz > 0 && this.renderer.shadowMap.enabled) {
      let hasVisibleCasters = false;
      for (const rp of this.remotePlayers.values()) {
        if (rp.group?.visible) {
          hasVisibleCasters = true;
          break;
        }
      }
      if (hasVisibleCasters) {
        const shadowIntervalMs = 1000 / this.quality.dynamicShadowHz;
        if (now - (this._lastDynamicShadowAt ?? -1000) >= shadowIntervalMs || now < (this._lastDynamicShadowAt ?? -1000)) {
          this._lastDynamicShadowAt = now;
          this._hadDynamicShadowCasters = true;
          this.renderer.shadowMap.needsUpdate = true;
        }
      } else if (this._hadDynamicShadowCasters) {
        this._hadDynamicShadowCasters = false;
        this.renderer.shadowMap.needsUpdate = true;
      }
    }

    // Update top-left Tactical Mini Map / Radar when in match (~30Hz throttle, zero wrapper allocation)
    if (this.inMatch && this.minimap && (now - this.minimap.lastRenderAt >= 33 || now < this.minimap.lastRenderAt)) {
      this.minimap.update(this, now);
    }

    for (const item of this.pickupMeshes.values()) {
      if (item.crossGroup) {
        item.crossGroup.rotation.y = 0;
        item.crossGroup.position.y = 0.04;
      }
    }
    for (let j = 0; j < this.jumpPadMeshes.length; j++) {
      const jp = this.jumpPadMeshes[j];
      const phase1 = ((now * 0.0012 + j * 0.25) % 1);
      const phase2 = ((now * 0.0012 + j * 0.25 + 0.5) % 1);
      if (jp.ring1) {
        jp.ring1.position.y = 0.08 + phase1 * 0.20;
        jp.ringMat1.opacity = (1 - phase1) * 0.11;
        jp.ring1.scale.setScalar(0.92 + phase1 * 0.14);
      }
      if (jp.ring2) {
        jp.ring2.position.y = 0.08 + phase2 * 0.20;
        jp.ringMat2.opacity = (1 - phase2) * 0.11;
        jp.ring2.scale.setScalar(0.92 + phase2 * 0.14);
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
        const floorY = typeof sh.floorY === 'number' ? sh.floorY : 0.025;
        if (sh.mesh.position.y <= floorY && sh.vy < 0) {
          sh.mesh.position.y = floorY;
          sh.vy = Math.abs(sh.vy) * 0.36;
          sh.vx *= 0.62;
          sh.vz *= 0.62;
          sh.rx *= 0.55;
          sh.rz *= 0.55;
        }
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

          if (Array.isArray(fx.smokeClouds)) {
            const cloudGrow = 1 - Math.pow(1 - progress, 2);
            const cloudAlpha = Math.min(1, progress * 6) * Math.pow(Math.max(0, 1 - progress), 1.35);
            for (let s = 0; s < fx.smokeClouds.length; s++) {
              const sc = fx.smokeClouds[s];
              const dragF = Math.max(0, 1 - (sc.drag || 2.6) * dt);
              sc.vx *= dragF;
              sc.vz *= dragF;
              sc.vy *= Math.max(0, 1 - 1.5 * dt);
              if (sc.sprite) {
                sc.sprite.position.x += sc.vx * dt;
                sc.sprite.position.y += (sc.vy + 0.9) * dt;
                sc.sprite.position.z += sc.vz * dt;
                const scl = sc.startScale + (sc.endScale - sc.startScale) * cloudGrow;
                sc.sprite.scale.setScalar(scl);
              }
              if (sc.mat) {
                sc.mat.rotation += (sc.rotSpeed || 0) * dt;
                sc.mat.opacity = sc.maxOpacity * cloudAlpha;
              }
            }
          }
        } else {
          const lineDur = fx.lineDuration || fx.duration;
          const lineAlive = elapsed < lineDur;
          const lineAlpha = lineAlive ? Math.max(0, 1 - elapsed / lineDur) : 0;

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
            const segLen = headDist - tailDist;
            const segVisible = lineAlive && segLen > 0.015;
            if (fx.line) {
              fx.line.visible = segVisible;
            }
            if (fx.boltMesh) {
              fx.boltMesh.visible = segVisible;
              if (segVisible) {
                fx.boltMesh.position.set(
                  (arr[0] + arr[3]) * 0.5,
                  (arr[1] + arr[4]) * 0.5,
                  (arr[2] + arr[5]) * 0.5
                );
                fx.boltMesh.scale.set(1, 1, Math.max(0.01, segLen));
              }
            }
          } else {
            if (fx.line) fx.line.visible = lineAlive;
            if (fx.boltMesh) fx.boltMesh.visible = lineAlive;
          }

          if (fx.mat) fx.mat.opacity = Math.min(1, lineAlpha * 1.25);
          if (fx.boltMat) fx.boltMat.opacity = Math.min(1, lineAlpha * 1.35);
          if (fx.sparkMat) fx.sparkMat.opacity = lineAlpha;
          if (fx.spark) fx.spark.visible = lineAlive;
          if (fx.armorSparkMat) fx.armorSparkMat.opacity = lineAlpha;

          if (fx.particles) {
            for (let p = 0; p < fx.particles.length; p++) {
              const pt = fx.particles[p];
              if (!pt.mesh) continue;
              pt.mesh.visible = lineAlive;
              if (!lineAlive) continue;
              pt.vy -= 14.0 * dt;
              pt.mesh.position.x += pt.vx * dt;
              pt.mesh.position.y += pt.vy * dt;
              pt.mesh.position.z += pt.vz * dt;
            }
          }

          if (Array.isArray(fx.smokePuffs)) {
            const puffGrow = 1 - Math.pow(1 - progress, 2);
            const puffAlpha = Math.min(1, progress * 5) * (1 - progress);
            for (let s = 0; s < fx.smokePuffs.length; s++) {
              const sp = fx.smokePuffs[s];
              const dragF = Math.max(0, 1 - (sp.drag || 4.2) * dt);
              sp.vx *= dragF;
              sp.vz *= dragF;
              sp.vy *= Math.max(0, 1 - 2.2 * dt);
              if (sp.sprite) {
                sp.sprite.position.x += sp.vx * dt;
                sp.sprite.position.y += (sp.vy + 0.35) * dt;
                sp.sprite.position.z += sp.vz * dt;
                const sc = sp.startScale + (sp.endScale - sp.startScale) * puffGrow;
                sp.sprite.scale.setScalar(sc);
              }
              if (sp.mat) {
                sp.mat.opacity = sp.maxOpacity * puffAlpha;
              }
            }
          }
        }
      }
    }

    const isRealWebGL = Boolean(
      this.renderer?.isWebGLRenderer &&
        !this.renderer.__fakeGL &&
        typeof window !== 'undefined'
    );

    if (!isRealWebGL) {
      this.renderer.render(this.scene, this.camera);
    } else {
      if (this.camera.layers.mask !== 1) this.camera.layers.set(0);
      if (
        this.viewmodelRig &&
        (this.viewmodelRig.layers.mask !== 2 ||
          (this.viewmodelRimLight && this.viewmodelRimLight.layers.mask !== 2) ||
          (this.viewmodelFillLight && this.viewmodelFillLight.layers.mask !== 2))
      ) {
        this.syncViewmodelLayers?.();
      }

      const usedPost = Boolean(this.postProcess?.render?.());
      if (!usedPost) {
        this.renderer.autoClear = true;
        this.renderer.render(this.scene, this.camera);
      }

      if (this.inMatch && this.viewmodelRig?.visible && this.vmCamera) {
        this.scene.updateMatrixWorld();
        this.camera.updateMatrixWorld();

        const activeVm =
          this.viewmodelWeapons?.[this.currentWeapon] ||
          this.viewmodelMeshes?.[this.currentWeapon];
        const isCs2Vm = Boolean(
          activeVm?.userData?.isCs2Glb ||
            activeVm?.userData?.cs2GlbActive ||
            this.cs2Viewmodels?.[this.currentWeapon]?.visible
        );
        const targetVmFov = isCs2Vm
          ? (this.isAiming ? 54 : 66)
          : (this.isAiming ? 46 : 54);
        if (Math.abs(this.vmCamera.fov - targetVmFov) > 0.05) {
          this.vmCamera.fov = dt > 0
            ? this.vmCamera.fov + (targetVmFov - this.vmCamera.fov) * Math.min(1, dt * 22)
            : targetVmFov;
          this.vmCamera.updateProjectionMatrix();
        } else if (this.vmCamera.fov !== targetVmFov) {
          this.vmCamera.fov = targetVmFov;
          this.vmCamera.updateProjectionMatrix();
        }

        this.camera.matrixWorld.decompose(this.vmCamera.position, this.vmCamera.quaternion, this.tmpVec3A);
        this.vmCamera.layers.set(1);

        const prevFog = this.scene.fog;
        const prevBackground = this.scene.background;
        this.scene.fog = null;
        this.scene.background = null;
        this.renderer.autoClear = false;
        try {
          this.renderer.clearDepth();
          this.renderer.render(this.scene, this.vmCamera);
        } finally {
          this.renderer.autoClear = true;
          this.scene.fog = prevFog;
          this.scene.background = prevBackground;
        }
      }
    }
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
          try {
            this.renderer.domElement.requestPointerLock?.()?.catch?.(() => {});
          } catch {
            // Ignore pointer lock rejection outside user activation
          }
        });
      }
    } catch {
      try {
        this.renderer.domElement.requestPointerLock?.()?.catch?.(() => {});
      } catch {
        // Ignore pointer lock errors
      }
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
      const w = Math.max(1, window.innerWidth);
      const h = Math.max(1, window.innerHeight);
      const aspect = w / h;
      this.camera.aspect = aspect;
      this.camera.updateProjectionMatrix();
      if (this.vmCamera) {
        this.vmCamera.aspect = aspect;
        this.vmCamera.updateProjectionMatrix();
      }
      this.renderer.setSize(w, h);
      this.postProcess?.setSize?.(w, h, this.currentPixelRatio);
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
      if (dy < 0) {
        let cancelRem = -dy;
        if (this.pendingRecoilPitch > 0) {
          const cutPending = Math.min(this.pendingRecoilPitch, cancelRem);
          this.pendingRecoilPitch -= cutPending;
          cancelRem -= cutPending;
        }
        if (cancelRem > 0 && this.accumulatedRecoilPitch > 0) {
          this.accumulatedRecoilPitch = Math.max(0, this.accumulatedRecoilPitch - cancelRem);
        }
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
      if (this.vmSprings) {
        this.vmSprings.swX.v = Math.max(-2.5, Math.min(2.5, this.vmSprings.swX.v - mx * 0.0042));
        this.vmSprings.swY.v = Math.max(-2.5, Math.min(2.5, this.vmSprings.swY.v + my * 0.0038));
      }
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
        if (!this.alive) return;
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
      else if (e.code === 'KeyM' && this.gameMode === 'tdm') {
        this.callbacks.onTeamSwitchShortcut?.();
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
      else if (e.code === 'KeyF' && this.alive) {
        if (this.nearbyDrop) {
          this.callbacks.onPickupWeapon?.(this.nearbyDrop.id);
        } else {
          this.triggerWeaponInspect?.();
        }
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
