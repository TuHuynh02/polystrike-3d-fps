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

export class RemotePlayersMethods {
  setTeamState(gameMode = 'ffa', localTeam = null) {
    this.gameMode = gameMode === 'tdm' ? 'tdm' : 'ffa';
    this.localTeam = this.gameMode === 'tdm' ? (localTeam || null) : null;
    for (const rp of this.remotePlayers.values()) {
      const isTeammate = Boolean(this.gameMode === 'tdm' && this.localTeam && rp.team && rp.team === this.localTeam);
      if (rp.isTeammate !== isTeammate) {
        rp.isTeammate = isTeammate;
        rp.setTeamOutline?.(isTeammate);
      }
    }
    this.rebuildHitboxList();
  }

  createRemotePlayerMesh(playerData = {}, options = {}) {
    const isTeammate = options.isTeammate !== undefined
      ? Boolean(options.isTeammate)
      : Boolean(this.gameMode === 'tdm' && this.localTeam && playerData.team && playerData.team === this.localTeam);
    const rp = createRemotePlayerMesh(playerData, {
      scene: this.scene,
      defaultColor: this.lobbyOperatorColor || 0x38bdf8,
      isTeammate,
      ...options
    });
    if (rp?.group) {
      applyMetalnessCap(rp.group, this.quality?.envMapSize === 0 ? 0.35 : null);
      rp.group.traverse((obj) => {
        if (obj.isMesh) {
          if (obj.geometry && !obj.geometry.boundingSphere) {
            obj.geometry.computeBoundingSphere();
          }
          obj.frustumCulled = true;
        }
      });
    }
    return rp;
  }

  rebuildHitboxList() {
    this.hitboxMeshes.length = 0;
    for (const rp of this.remotePlayers.values()) {
      if (!rp.alive) continue;
      if (this.gameMode === 'tdm' && this.localTeam && rp.team && rp.team === this.localTeam) {
        continue;
      }
      if (rp.hitboxParts && rp.hitboxParts.length > 0) {
        for (let i = 0; i < rp.hitboxParts.length; i++) {
          this.hitboxMeshes.push(rp.hitboxParts[i]);
        }
      } else {
        this.hitboxMeshes.push(rp.headMesh, rp.torsoMesh, rp.leftLeg, rp.rightLeg);
      }
    }
    this.rayTargets.length = 0;
    for (let i = 0; i < this.worldMeshes.length; i++) {
      this.rayTargets.push(this.worldMeshes[i]);
    }
    for (let i = 0; i < this.hitboxMeshes.length; i++) {
      this.rayTargets.push(this.hitboxMeshes[i]);
    }
    if (this.barrelMeshes) {
      for (const b of this.barrelMeshes.values()) {
        if (b.active && b.hitboxMesh) {
          b.group.updateMatrixWorld(true);
          this.rayTargets.push(b.hitboxMesh);
        }
      }
    }
  }

  disposeRemotePlayer(rp) {
    this.scene.remove(rp.group);
    disposeObject3D(rp.group);
  }

  clearAllRemotePlayers() {
    for (const rp of this.remotePlayers.values()) {
      this.disposeRemotePlayer(rp);
    }
    this.remotePlayers.clear();
    this.snapshots.clear();
    this.rebuildHitboxList();
  }

  /** Feeds the client-measured round-trip time (ms) to the render clock (adds the one-way latency back, see snapshotBuffer.js). */
  setNetworkRtt(rttMs) {
    this.netStats.rttMs = rttMs;
    this.snapshots.setRttMs(rttMs);
  }

  /** Two lines for the ?perf=1 overlay: RTT, jitter estimate, applied/target buffer delay, snapshot spacing, starvation. */
  getNetOverlayText() {
    const ns = this.netStats;
    const j = this.snapshots.jitter;
    return `net rtt ${Math.round(ns.rttMs)}ms  jitter(p95) ${Math.round(j.jitterMs)}ms  buffer ${this.getInterpDelayMs()}ms (target ${Math.round(j.targetMs)})
` +
      `snapshots every ${Math.round(j.intervalMs)}ms  starved ${ns.starveEvents}x / ${Math.round(ns.starvedMs)}ms`;
  }

  /** The delay (ms) remote players are drawn behind the true server time; reported to the server for lag compensation. */
  getInterpDelayMs() {
    return Math.max(0, Math.min(INTERP_DELAY_MAX_MS, Math.round(this.snapshots.delayMs)));
  }

  /**
   * A remote player was killed (killEvent): it stops being shootable at once (as on the server) but its body stays drawn
   * until the interpolated timeline reaches the snapshot of its death (see updateRemotePlayers).
   */
  markRemoteDead(id, now = performance.now()) {
    const rp = this.remotePlayers.get(id);
    if (!rp) return false;
    if (rp.alive) rp.deadSince = now;
    rp.alive = false;
    this.rebuildHitboxList();
    return true;
  }

  /** Respawn of a remote player: drop its snapshot history and show it at the spawn point (no streak from the death spot). */
  resetRemoteInterpolation(id, x, y, z, yaw = 0) {
    this.snapshots.reset(id);
    const rp = this.remotePlayers.get(id);
    if (rp?.group) {
      rp.group.position.set(x, y, z);
      rp.group.rotation.y = yaw;
      if (rp.alive) rp.group.visible = true;
    }
    if (rp) {
      rp.smoothedSpeed = 0;
      rp.velocity?.set(0, 0, 0);
    }
  }

  /**
   * Applies one player list. `serverTimeMs` (the `t` of a `stateUpdate`) marks it as a timestamped snapshot: the remote
   * players' pose is then buffered and drawn by interpolation (updateRemotePlayers). Without it (join /
   * playerLeft re-syncs of an older list) only the entity set and the discrete state (alive, weapon, hp, ...) are applied.
   * `localNowMs` is the local receive time (defaults to performance.now()).
   */
  syncPlayersState(playersArray = [], serverTimeMs = undefined, localNowMs = undefined) {
    const now = typeof localNowMs === 'number' ? localNowMs : performance.now();
    const stamped = typeof serverTimeMs === 'number' && Number.isFinite(serverTimeMs);
    // A duplicate / reordered older envelope must not touch anything (alive, hp, weapon would flap back to old values)
    if (stamped && !this.snapshots.acceptsEnvelope(serverTimeMs)) return;
    if (!this._seenPlayerIds) {
      this._seenPlayerIds = new Set();
    }
    const seenIds = this._seenPlayerIds;
    seenIds.clear();
    let hitboxesDirty = false;
    this._remoteScratch.length = 0;

    for (let i = 0; i < playersArray.length; i++) {
      const p = playersArray[i];
      if (p && p.id === this.localId && p.team !== undefined && p.team !== this.localTeam) {
        this.localTeam = p.team || null;
        hitboxesDirty = true;
        break;
      }
    }

    for (const p of playersArray) {
      if (p.id === this.localId) {
        this.alive = Boolean(p.alive);
        if (!this.alive) this.cancelGrenadeCooking();
        if (typeof p.armor === 'number') this.armor = Math.max(0, Math.min(MATCH_CONFIG.MAX_ARMOR || 50, Math.round(p.armor)));
        if (typeof p.speedBoostMs === 'number') this.speedBoostUntil = p.speedBoostMs > 0 ? now + p.speedBoostMs : 0;
        if (typeof p.damageBoostMs === 'number') this.damageBoostUntil = p.damageBoostMs > 0 ? now + p.damageBoostMs : 0;
        if (typeof p.grenades === 'number') {
          const isThrowInFlight = p.grenades > this.grenades && (now - this.lastGrenadeThrowAt) < 400;
          if (!isThrowInFlight) {
            this.setGrenadeCount(p.grenades);
          }
        }
        continue;
      }

      seenIds.add(p.id);
      let rp = this.remotePlayers.get(p.id);
      if (!rp) {
        rp = this.createRemotePlayerMesh(p);
        rp.group.position.set(p.x, p.y, p.z);
        rp.group.rotation.y = p.yaw || 0;
        rp.velocity = new THREE.Vector3(0, 0, 0); // interpolated motion (animation only)
        rp.smoothedSpeed = 0;
        rp.group.visible = Boolean(p.alive);
        this.remotePlayers.set(p.id, rp);
        hitboxesDirty = true;
      }

      if (rp.group && rp.group.parent !== this.scene) {
        this.scene.add(rp.group);
      }
      if (!rp.velocity) rp.velocity = new THREE.Vector3(0, 0, 0);

      if (p.team !== undefined) {
        rp.team = p.team || null;
      }
      const isTeammate = Boolean(this.gameMode === 'tdm' && this.localTeam && rp.team && rp.team === this.localTeam);
      if (rp.isTeammate !== isTeammate) {
        rp.isTeammate = isTeammate;
        rp.setTeamOutline?.(isTeammate);
        hitboxesDirty = true;
      }

      const nowAlive = Boolean(p.alive);
      if (rp.alive !== nowAlive) {
        hitboxesDirty = true;
        if (nowAlive) {
          // (Re)spawn: forget the old snapshots and appear at the spawn point (no streak from the death position)
          this.snapshots.reset(p.id);
          rp.group.position.set(p.x, p.y, p.z);
          rp.group.rotation.y = p.yaw || 0;
          rp.velocity.set(0, 0, 0);
          rp.smoothedSpeed = 0;
        }
      }

      rp.name = p.name || rp.name;
      if (stamped) {
        // Pose (position, yaw/pitch/lean, crouch/prone/sliding) comes from the snapshot buffer in updateRemotePlayers
        this._remoteScratch.push(p);
      } else {
        rp.targetYaw = p.yaw || 0;
        rp.targetPitch = p.pitch || 0;
        rp.crouching = Boolean(p.crouching || p.crouch);
        rp.crouch = rp.crouching;
        rp.prone = Boolean(p.prone);
        rp.sliding = Boolean(p.sliding || p.isSliding);
        rp.lean = Number(p.lean || 0);
      }
      if (rp.alive && !nowAlive) rp.deadSince = now;
      rp.alive = nowAlive;
      // Revival shows the body at once; a death does NOT hide it here: updateRemotePlayers keeps the body drawn until the
      // interpolated timeline (render time = server time - delay) reaches the snapshot where the player died
      if (nowAlive) rp.group.visible = true;

      if (p.weapon && WEAPONS[p.weapon] && p.weapon !== rp.currentWeapon) {
        rp.currentWeapon = p.weapon;
        rp.gunHolder.remove(rp.gunMesh);
        disposeObject3D(rp.gunMesh);
        rp.gunMesh = this.createWeaponMesh(p.weapon, false);
        let gunPartIdx = 0;
        rp.gunMesh.traverse((o) => {
          if (o.isMesh && o.geometry) {
            if (!o.geometry.userData?.shared) {
              const cacheKey = `wep_${p.weapon}_${gunPartIdx++}`;
              const cachedGeo = getCachedGeo(cacheKey, () => o.geometry);
              if (cachedGeo !== o.geometry) {
                o.geometry.dispose();
                o.geometry = cachedGeo;
              }
            }
            if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere();
            o.frustumCulled = true;
          }
        });
        rp.gunHolder.add(rp.gunMesh);
        rp.poseForWeapon?.(p.weapon);
      }

      if (rp.hp !== p.hp) {
        rp.hp = p.hp;
      }
    }

    for (const [id, rp] of this.remotePlayers.entries()) {
      if (!seenIds.has(id)) {
        this.disposeRemotePlayer(rp);
        this.remotePlayers.delete(id);
        this.snapshots.remove(id);
        hitboxesDirty = true;
      }
    }

    if (stamped && this._remoteScratch.length > 0) {
      this.snapshots.pushState(serverTimeMs, now, this._remoteScratch, this.localId);
    }
    this._remoteScratch.length = 0;

    if (hitboxesDirty) {
      this.rebuildHitboxList();
    }
  }

  animateHumanoidRig(rp, dt, now, isMoving, moveSpeed = 0) {
    animateHumanoidRig(rp, dt, now, isMoving, moveSpeed);
  }

  /**
   * Draws every remote player from its snapshot buffer at renderTime = estimated server time -
   * the adaptive interpolation delay: linear interpolation between the two bracketing server snapshots, snap on teleport /
   * respawn / alive flip, damped extrapolation (<= 250 ms) + smooth catch-up when starved. Animation speed (walk cycle, footsteps) is derived from
   * the interpolated motion. `now` is the frame time (performance.now() timebase).
   */
  updateRemotePlayers(dt, now) {
    const speedBlend = 1 - Math.exp(-15 * dt);
    const renderT = this.snapshots.renderTime(now);
    const out = this._remoteSample;
    let starving = false;
    const frameIdx = (this._remoteAnimFrame = ((this._remoteAnimFrame || 0) + 1) | 0);
    const camPos = this.position || this.camera?.position || null;
    const camYaw = this.yaw || 0;
    const camFwdX = -Math.sin(camYaw);
    const camFwdZ = -Math.cos(camYaw);

    for (const [id, rp] of this.remotePlayers.entries()) {
      // A killed player stays drawn until the interpolated timeline reaches its death snapshot (no vanishing 100+ ms
      // before the body arrives at the place it died); hitboxes are gone from the kill on (server rules).
      if (!rp.alive && !rp.group.visible) continue;
      if (!rp.velocity) rp.velocity = new THREE.Vector3(0, 0, 0);

      let rawSpeed = 0;
      const s = this.snapshots.sample(id, renderT, out);
      if (!rp.alive && (!s || !s.alive || now - (rp.deadSince ?? now) > DEATH_BODY_MAX_MS)) {
        rp.group.visible = false;
        continue;
      }
      if (s) {
        rp.group.position.set(s.x, s.y, s.z);
        rp.group.rotation.y = s.yaw;
        rp.targetYaw = s.yaw;
        rp.targetPitch = s.pitch;
        rp.lean = s.lean;
        rp.crouching = s.crouching;
        rp.crouch = s.crouching;
        rp.prone = s.prone;
        rp.sliding = Boolean(s.sliding);
        rp.velocity.set(s.vx, s.vy, s.vz);
        rawSpeed = Math.hypot(s.vx, s.vz);
        rp.extrapolated = Boolean(s.extrapolated);
        if (s.extrapolated) starving = true;
      } else {
        rp.velocity.set(0, 0, 0);
      }

      rp.smoothedSpeed = (rp.smoothedSpeed || 0) + (rawSpeed - (rp.smoothedSpeed || 0)) * speedBlend;
      if (rp.smoothedSpeed < 0.05) rp.smoothedSpeed = 0;

      const isMoving = rp.smoothedSpeed > 0.35;
      const rigMoveSpeed = rp.smoothedSpeed * 0.032;

      const targetProne = rp.prone ? 1 : 0;
      const targetSlide = (!rp.prone && (rp.sliding || rp.isSliding)) ? 1 : 0;
      const targetCrouch = (!rp.prone && (rp.crouch || rp.crouching || rp.sliding || rp.isSliding)) ? 1 : 0;
      const targetLean = Math.max(-1, Math.min(1, Number(rp.lean || 0)));
      const aimPitch = rp.targetPitch || 0;
      const targetTorsoPitch = -targetCrouch * 0.18 - targetProne * 1.05 + aimPitch * 0.25;
      const targetHeadPitch = targetCrouch * 0.16 + targetProne * 0.92 + aimPitch * 0.45;
      const flashMesh = rp.gunMesh?.userData?.flashMesh;
      const recentlyFired =
        Boolean(flashMesh?.visible) ||
        (rp.lastShotFlashAt > 0 && now - rp.lastShotFlashAt <= 120);
      const postureSettled =
        !recentlyFired &&
        Math.abs((rp.proneBlend || 0) - targetProne) < 0.01 &&
        Math.abs((rp.slideBlend || 0) - targetSlide) < 0.01 &&
        Math.abs((rp.crouchBlend || 0) - targetCrouch) < 0.01 &&
        Math.abs((rp.leanBlend || 0) - targetLean) < 0.01 &&
        rp._posedWeapon === (rp.currentWeapon || 'rifle') &&
        Math.abs((rp.upperBodyGroup?.rotation?.x || 0) - targetTorsoPitch) < 0.025 &&
        Math.abs((rp.headGroup?.rotation?.x || 0) - targetHeadPitch) < 0.015;

      if (rp._cullSalt === undefined) {
        rp._cullSalt = (this._nextCullSalt = ((this._nextCullSalt || 0) + 1) & 15);
      }

      let shouldAnimate = true;
      if (postureSettled && camPos) {
        const dx = rp.group.position.x - camPos.x;
        const dz = rp.group.position.z - camPos.z;
        const distSq = dx * dx + dz * dz;
        const proj = dx * camFwdX + dz * camFwdZ;
        // Behind camera (> 6m and dot < -0.25): skip when stationary, or run every 4th frame when moving
        if (distSq > 36 && proj < 0 && (proj * proj) > 0.0625 * distSq) {
          shouldAnimate = isMoving && ((frameIdx + rp._cullSalt) & 3) === 0;
        } else if (distSq > 1444) {
          // Far away (> 38m): run at half animation rate (every 2nd frame)
          shouldAnimate = ((frameIdx + rp._cullSalt) & 1) === 0;
        }
      }

      if (shouldAnimate) {
        const animDt = dt + (rp._skippedAnimDt || 0);
        rp._skippedAnimDt = 0;
        rp._lastAnimPitch = aimPitch;
        this.animateHumanoidRig(rp, animDt, now, isMoving, rigMoveSpeed);
      } else {
        rp._skippedAnimDt = (rp._skippedAnimDt || 0) + dt;
        if (flashMesh && flashMesh.visible && now - (rp.lastShotFlashAt || 0) > 55) {
          flashMesh.visible = false;
        }
      }

      const isGrounded = rp.onGround !== false && Math.abs(rp.velocity.y) < 0.85;
      const isRemoteCrouching = Boolean(rp.crouch || rp.crouching);
      if (this.inMatch && isMoving && rp.smoothedSpeed > 0.55 && isGrounded && !rp.prone && !rp.sliding) {
        const isRemoteSprinting = !isRemoteCrouching && Boolean(
          rp.sprinting ||
          rp.isSprinting ||
          rp.smoothedSpeed > (MATCH_CONFIG.WALK_SPEED || 5.0) * 1.1
        );
        const stepCadenceMs = isRemoteCrouching ? 560 : isRemoteSprinting ? 310 : 430;
        if (rp.nextFootstepAt && rp.nextFootstepAt - now > stepCadenceMs) {
          rp.nextFootstepAt = now + stepCadenceMs;
        }
        if (!rp.nextFootstepAt || now >= rp.nextFootstepAt) {
          rp.nextFootstepAt = now + stepCadenceMs;
          sfx.playSpatialFootstep(this.getAudioListenerState(), rp.group.position, isRemoteSprinting, isRemoteCrouching);
        }
      }
    }

    // Network health counters for the ?perf=1 overlay: time spent with the render ahead of the newest snapshot
    const ns = this.netStats;
    if (starving) {
      ns.starvedMs += dt * 1000;
      if (!ns.starving) ns.starveEvents++;
    }
    ns.starving = starving;
  }
}
