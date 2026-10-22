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

export class GrenadeMethods {
  setGrenadeCount(count) {
    const next = Math.max(0, Number(count ?? 0));
    if (this.grenades !== next) {
      this.grenades = next;
      this.callbacks.onGrenadeChanged?.(this.grenades);
    }
  }

  setupGrenadePreview() {
    this.grenadePreviewSteps = 56;
    this._grenadeRawPositions = new Float32Array((this.grenadePreviewSteps + 1) * 3);
    this.grenadePreviewPositions = new Float32Array((this.grenadePreviewSteps + 1) * 3);
    this.grenadePreviewGeo = new THREE.BufferGeometry();
    this.grenadePreviewGeo.setAttribute('position', new THREE.BufferAttribute(this.grenadePreviewPositions, 3));
    this.grenadePreviewMat = new THREE.LineBasicMaterial({
      color: 0xff3b30,
      transparent: true,
      opacity: 0.92,
      depthWrite: false
    });
    this.grenadePreviewLine = new THREE.Line(this.grenadePreviewGeo, this.grenadePreviewMat);
    this.grenadePreviewLine.frustumCulled = false;
    this.grenadePreviewLine.visible = false;
    this.grenadePreviewLine.renderOrder = 18;
    this.scene.add(this.grenadePreviewLine);

    this.grenadePreviewTargetGroup = new THREE.Group();
    this.grenadePreviewTargetGroup.visible = false;
    this.grenadePreviewTargetGroup.renderOrder = 18;

    this.grenadePreviewRingMat = new THREE.MeshBasicMaterial({
      color: 0xff3b30,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2
    });
    const outerRing = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.72, 28), this.grenadePreviewRingMat);
    outerRing.rotation.x = -Math.PI / 2;

    this.grenadePreviewDiscMat = new THREE.MeshBasicMaterial({
      color: 0xf97316,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.24,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1
    });
    const innerDisc = new THREE.Mesh(new THREE.CircleGeometry(0.52, 24), this.grenadePreviewDiscMat);
    innerDisc.rotation.x = -Math.PI / 2;

    this.grenadePreviewTargetGroup.add(outerRing, innerDisc);
    this.scene.add(this.grenadePreviewTargetGroup);

    this.grenadePreviewBeaconMat = new THREE.MeshBasicMaterial({
      color: 0xfef08a,
      transparent: true,
      opacity: 0.95,
      depthWrite: false
    });
    this.grenadePreviewBeacon = new THREE.Mesh(this.sharedHitOrbGeo, this.grenadePreviewBeaconMat);
    this.grenadePreviewBeacon.scale.setScalar(1.35);
    this.grenadePreviewBeacon.visible = false;
    this.grenadePreviewBeacon.renderOrder = 19;
    this.scene.add(this.grenadePreviewBeacon);

    this.grenadePreviewBeadGroup = new THREE.Group();
    this.grenadePreviewBeadGroup.visible = false;
    this.grenadePreviewBeadGroup.renderOrder = 19;
    this.grenadePreviewBeadMat = new THREE.MeshBasicMaterial({
      color: 0xfdba74,
      transparent: true,
      opacity: 0.92,
      depthWrite: false
    });
    this.grenadePreviewBeads = [];
    for (let b = 0; b < 16; b++) {
      const bead = new THREE.Mesh(this.sharedHitOrbGeo, this.grenadePreviewBeadMat);
      bead.frustumCulled = false;
      this.grenadePreviewBeadGroup.add(bead);
      this.grenadePreviewBeads.push(bead);
    }
    this.scene.add(this.grenadePreviewBeadGroup);

    this.grenadePreviewDropPositions = new Float32Array(6);
    this.grenadePreviewDropGeo = new THREE.BufferGeometry();
    this.grenadePreviewDropGeo.setAttribute('position', new THREE.BufferAttribute(this.grenadePreviewDropPositions, 3));
    this.grenadePreviewDropLine = new THREE.Line(this.grenadePreviewDropGeo, this.grenadePreviewMat);
    this.grenadePreviewDropLine.frustumCulled = false;
    this.grenadePreviewDropLine.visible = false;
    this.grenadePreviewDropLine.renderOrder = 18;
    this.scene.add(this.grenadePreviewDropLine);
  }

  startGrenadeCooking() {
    if (!this.inMatch || !this.alive) return false;
    const now = performance.now();
    if (now - this.lastGrenadeThrowAt < 250) return false;
    if (this.grenades <= 0) {
      this.callbacks.onThrowGrenade?.({ empty: true });
      return false;
    }
    if (this.isCookingGrenade) return true;

    if (this.isAiming) {
      this.isAiming = false;
      this.adsToggleActive = false;
      setWeaponAdsCulling(this.viewmodelMeshes[this.currentWeapon], false);
      this.callbacks.onAimChange?.(false, this.currentWeapon);
    }

    this.isCookingGrenade = true;
    this.grenadeCookStartAt = now;
    this.grenadeCookMaxMs = MATCH_CONFIG.GRENADE_FUSE_MS || 3000;
    this.sfx?.playDryFire?.();
    this.updateGrenadePreview(now);
    return true;
  }

  cancelGrenadeCooking() {
    if (!this.isCookingGrenade && !this.grenadePreviewLine?.visible) return;
    this.isCookingGrenade = false;
    this.grenadeCookStartAt = 0;
    if (this.grenadePreviewLine) this.grenadePreviewLine.visible = false;
    if (this.grenadePreviewTargetGroup) this.grenadePreviewTargetGroup.visible = false;
    if (this.grenadePreviewBeacon) this.grenadePreviewBeacon.visible = false;
    if (this.grenadePreviewBeadGroup) this.grenadePreviewBeadGroup.visible = false;
    if (this.grenadePreviewDropLine) this.grenadePreviewDropLine.visible = false;
    this.callbacks.onGrenadeCookUpdate?.(false, 0, (this.grenadeCookMaxMs || 3000) / 1000);
  }

  releaseGrenadeCooking() {
    if (!this.isCookingGrenade) return false;
    const now = performance.now();
    const maxMs = this.grenadeCookMaxMs || (MATCH_CONFIG.GRENADE_FUSE_MS || 3000);
    const elapsed = Math.max(0, now - this.grenadeCookStartAt);
    const remMs = Math.max(80, Math.round(maxMs - elapsed));
    this.cancelGrenadeCooking();
    return this.attemptThrowGrenade({ fuseMs: remMs });
  }

  updateGrenadePreview(now = performance.now()) {
    if (!this.isCookingGrenade) return;
    if (!this.inMatch || !this.alive || this.grenades <= 0) {
      this.cancelGrenadeCooking();
      return;
    }

    const maxMs = this.grenadeCookMaxMs || (MATCH_CONFIG.GRENADE_FUSE_MS || 3000);
    const elapsed = Math.max(0, now - this.grenadeCookStartAt);
    if (elapsed >= maxMs) {
      this.cancelGrenadeCooking();
      this.attemptThrowGrenade({ fuseMs: 60, overcooked: true });
      return;
    }

    const remMs = maxMs - elapsed;
    const remSec = remMs / 1000;
    this.callbacks.onGrenadeCookUpdate?.(true, remSec, maxMs / 1000);

    if (!this.grenadePreviewLine || !this.grenadePreviewPositions) return;

    const yaw = this.yaw;
    const pitch = this.pitch;
    const dirX = -Math.sin(yaw) * Math.cos(pitch);
    const dirY = Math.sin(pitch);
    const dirZ = -Math.cos(yaw) * Math.cos(pitch);

    const eyeX = this.camera.position.x;
    const eyeY = Math.max(0.22, this.camera.position.y);
    const eyeZ = this.camera.position.z;

    const mapCfg = this.getMovementMapCfg();
    const obstacles = mapCfg.obstacles || [];
    const arenaLimit = (mapCfg.arenaHalfSize || MATCH_CONFIG.ARENA_HALF_SIZE) - 0.3;

    let startX = eyeX + dirX * 0.38;
    let startY = Math.max(0.22, eyeY + dirY * 0.22);
    let startZ = eyeZ + dirZ * 0.38;

    let blockedAtStart = !hasLineOfSight(
      { x: eyeX, y: eyeY, z: eyeZ },
      { x: startX, y: startY, z: startZ },
      obstacles
    );
    if (!blockedAtStart) {
      blockedAtStart = isPointInsideInflatedBoxes(startX, startY, startZ, 0.18, obstacles);
    }
    if (blockedAtStart) {
      startX = eyeX;
      startY = eyeY;
      startZ = eyeZ;
    }
    startX = Math.max(-arenaLimit, Math.min(arenaLimit, startX));
    startZ = Math.max(-arenaLimit, Math.min(arenaLimit, startZ));

    const throwSpeed = MATCH_CONFIG.GRENADE_THROW_SPEED || 19.5;
    const upwardArc = MATCH_CONFIG.GRENADE_UPWARD_ARC || 4.2;
    const sim = this._grenadeSimScratch;
    sim.x = startX;
    sim.y = startY;
    sim.z = startZ;
    sim.vx = dirX * throwSpeed + (this.velocity.x || 0) * 0.25;
    sim.vy = dirY * throwSpeed + upwardArc;
    sim.vz = dirZ * throwSpeed + (this.velocity.z || 0) * 0.25;

    const steps = this.grenadePreviewSteps;
    const simDuration = Math.max(0.15, remSec);
    const stepDt = simDuration / steps;
    const posArr = this.grenadePreviewPositions;
    const rawArr = this._grenadeRawPositions || new Float32Array((steps + 1) * 3);
    rawArr[0] = startX;
    rawArr[1] = startY;
    rawArr[2] = startZ;
    let firstImpactIdx = steps;

    // Offset initial visual vertex slightly down-right toward throwing hand so it doesn't block center sight
    const rightX = Math.cos(yaw);
    const rightZ = -Math.sin(yaw);
    posArr[0] = startX + rightX * 0.14;
    posArr[1] = Math.max(0.18, startY - 0.12);
    posArr[2] = startZ + rightZ * 0.14;

    let impactX = null;
    let impactY = null;
    let impactZ = null;

    for (let i = 1; i <= steps; i++) {
      const bounce = stepGrenade(sim, stepDt, mapCfg);
      if (impactX === null && (bounce > 0 || sim.y <= 0.20)) {
        impactX = sim.x;
        impactY = sim.y;
        impactZ = sim.z;
        firstImpactIdx = i;
      }
      const idx = i * 3;
      posArr[idx] = sim.x;
      posArr[idx + 1] = sim.y;
      posArr[idx + 2] = sim.z;
    }

    posArr[0] = startX;
    posArr[1] = startY;
    posArr[2] = startZ;
    for (let i = 0; i <= firstImpactIdx; i++) {
      const idx = i * 3;
      const tArc = firstImpactIdx > 0 ? Math.min(1, i / firstImpactIdx) : 1;
      const handWeight = i < firstImpactIdx ? Math.pow(1 - tArc, 1.35) : 0;
      const handDownWeight = i < firstImpactIdx ? Math.pow(1 - tArc, 1.65) : 0;
      const arcLift = i < firstImpactIdx ? Math.sin(tArc * Math.PI) * 0.08 : 0;
      posArr[idx] += rightX * (0.32 * handWeight) + dirX * (0.12 * handWeight);
      posArr[idx + 1] = Math.max(0.18, posArr[idx + 1] - 0.24 * handDownWeight + arcLift);
      posArr[idx + 2] += rightZ * (0.32 * handWeight) + dirZ * (0.12 * handWeight);
    }
    this.grenadePreviewGeo.attributes.position.needsUpdate = true;
    this.grenadePreviewLine.visible = true;

    const isUrgent = remSec <= 1.1;
    const arcHex = isUrgent ? 0xff1e1e : 0xf97316;
    this.grenadePreviewMat.color.setHex(arcHex);
    this.grenadePreviewRingMat.color.setHex(arcHex);

    const ringX = impactX !== null ? impactX : sim.x;
    const ringY = Math.max(0.03, (impactY !== null ? impactY : sim.y) - 0.15);
    const ringZ = impactZ !== null ? impactZ : sim.z;
    const pulse = 1.0 + Math.sin(now * (isUrgent ? 0.024 : 0.010)) * 0.10;
    this.grenadePreviewTargetGroup.position.set(ringX, ringY, ringZ);
    this.grenadePreviewTargetGroup.scale.setScalar(pulse);
    this.grenadePreviewTargetGroup.visible = true;

    this.grenadePreviewBeacon.position.set(sim.x, sim.y, sim.z);
    this.grenadePreviewBeaconMat.color.setHex(isUrgent ? 0xff3b30 : 0xfef08a);
    this.grenadePreviewBeacon.scale.setScalar(isUrgent ? 1.55 : 1.25);
    this.grenadePreviewBeacon.visible = true;

    const findSupportY = (wx, wy, wz) => {
      let bestY = 0.03;
      for (let k = 0; k < obstacles.length; k++) {
        const b = obstacles[k];
        const minX = b.minX !== undefined ? b.minX : b.x - b.w * 0.5;
        const maxX = b.maxX !== undefined ? b.maxX : b.x + b.w * 0.5;
        if (wx < minX || wx > maxX) continue;
        const minZ = b.minZ !== undefined ? b.minZ : b.z - b.d * 0.5;
        const maxZ = b.maxZ !== undefined ? b.maxZ : b.z + b.d * 0.5;
        if (wz < minZ || wz > maxZ) continue;
        const topY = (b.maxY !== undefined ? b.maxY : b.y + b.h * 0.5) + 0.03;
        if (topY <= wy + 0.35 && topY > bestY) {
          bestY = topY;
        }
      }
      return bestY;
    };

    const ringSupportY = findSupportY(ringX, impactY !== null ? impactY : sim.y, ringZ);
    this.grenadePreviewTargetGroup.position.set(ringX, ringSupportY, ringZ);

    if (this.grenadePreviewBeadGroup && this.grenadePreviewBeads) {
      this.grenadePreviewBeadMat.color.setHex(isUrgent ? 0xff4d4d : 0xfdba74);
      const beadCount = this.grenadePreviewBeads.length;
      const flowPhase = (now * 0.0022) % 1;
      const arcSpan = Math.max(4, firstImpactIdx);
      for (let b = 0; b < beadCount; b++) {
        const u = (b + flowPhase) / beadCount;
        const exactIdx = u * arcSpan;
        const idx0 = Math.min(steps, Math.floor(exactIdx));
        const idx1 = Math.min(steps, idx0 + 1);
        const frac = exactIdx - idx0;
        const i0 = idx0 * 3;
        const i1 = idx1 * 3;
        const bx = posArr[i0] + (posArr[i1] - posArr[i0]) * frac;
        const by = posArr[i0 + 1] + (posArr[i1 + 1] - posArr[i0 + 1]) * frac;
        const bz = posArr[i0 + 2] + (posArr[i1 + 2] - posArr[i0 + 2]) * frac;
        const bead = this.grenadePreviewBeads[b];
        bead.position.set(bx, by, bz);
        const fade = Math.sin(u * Math.PI);
        bead.scale.setScalar(0.38 + fade * 0.48);
      }
      this.grenadePreviewBeadGroup.visible = true;
    }

    if (this.grenadePreviewDropLine && this.grenadePreviewDropPositions) {
      const beaconSupportY = findSupportY(sim.x, sim.y, sim.z);
      if (sim.y - beaconSupportY > 0.22) {
        const dArr = this.grenadePreviewDropPositions;
        dArr[0] = sim.x;
        dArr[1] = sim.y;
        dArr[2] = sim.z;
        dArr[3] = sim.x;
        dArr[4] = beaconSupportY;
        dArr[5] = sim.z;
        this.grenadePreviewDropGeo.attributes.position.needsUpdate = true;
        this.grenadePreviewDropLine.visible = true;
      } else {
        this.grenadePreviewDropLine.visible = false;
      }
    }
  }

  triggerLocalGrenadeThrow(outPayload = null) {
    const now = performance.now();
    this.lastGrenadeThrowAt = now;
    this.grenadeThrowUntil = now + 260;
    this.recoilOffset = Math.max(this.recoilOffset, 0.08);

    const yaw = typeof outPayload?.yaw === 'number' ? outPayload.yaw : this.yaw;
    const pitch = typeof outPayload?.pitch === 'number' ? outPayload.pitch : this.pitch;
    const dir = outPayload?.dir || {
      x: -Math.sin(yaw) * Math.cos(pitch),
      y: Math.sin(pitch),
      z: -Math.cos(yaw) * Math.cos(pitch)
    };
    const origin = outPayload?.origin || {
      x: this.camera.position.x,
      y: this.camera.position.y,
      z: this.camera.position.z
    };
    if (outPayload && typeof outPayload === 'object') {
      outPayload.yaw = yaw;
      outPayload.pitch = pitch;
      outPayload.dir = dir;
      outPayload.origin = origin;
    }
    return { yaw, pitch, origin, dir };
  }

  attemptThrowGrenade(options = {}) {
    if (!this.inMatch || !this.alive) return false;
    const now = performance.now();
    if (now - this.lastGrenadeThrowAt < 250) return false;
    this.cancelGrenadeCooking();
    const yaw = this.yaw;
    const pitch = this.pitch;
    const dir = {
      x: -Math.sin(yaw) * Math.cos(pitch),
      y: Math.sin(pitch),
      z: -Math.cos(yaw) * Math.cos(pitch)
    };
    const origin = {
      x: this.camera.position.x,
      y: this.camera.position.y,
      z: this.camera.position.z
    };
    const payload = { yaw, pitch, origin, dir };
    if (typeof options?.fuseMs === 'number' && Number.isFinite(options.fuseMs)) {
      payload.fuseMs = Math.round(options.fuseMs);
    }
    if (options?.overcooked) {
      payload.overcooked = true;
    }
    if (this.grenades > 0 && this.isPointerLocked) {
      this.triggerLocalGrenadeThrow(payload);
    }
    this.callbacks.onThrowGrenade?.(payload);
    return true;
  }

  clearGrenades() {
    this.cancelGrenadeCooking();
    for (const id of Array.from(this.activeGrenadeMeshes.keys())) {
      this.removeGrenadeMesh(id);
    }
    this.activeGrenadeMeshes.clear();
  }

  removeGrenadeMesh(grenadeId) {
    const item = this.activeGrenadeMeshes.get(grenadeId);
    if (!item) return;
    this.scene.remove(item.group);
    if (item.trailLine) {
      this.scene.remove(item.trailLine);
      item.trailGeo?.dispose();
      item.trailMat?.dispose();
    }
    item.fuseMat?.dispose();
    item.glowRingMat?.dispose();
    this.activeGrenadeMeshes.delete(grenadeId);
  }

  syncGrenades(grenades = []) {
    if (!Array.isArray(grenades)) return;
    if (grenades.length === 0 && this.activeGrenadeMeshes.size === 0) return;
    const now = performance.now();
    if (!this._seenGrenadeIds) {
      this._seenGrenadeIds = new Set();
    }
    const seen = this._seenGrenadeIds;
    seen.clear();

    for (let i = 0; i < grenades.length; i++) {
      const raw = grenades[i];
      const g = raw?.grenade || raw;
      if (!g || !g.id) continue;
      seen.add(g.id);
      const existing = this.activeGrenadeMeshes.get(g.id);
      if (!existing) {
        this.spawnGrenadeProjectile(g);
      } else {
        const sx = Number(g.x ?? existing.x);
        const sy = Number(g.y ?? existing.y);
        const sz = Number(g.z ?? existing.z);
        const errDist = Math.hypot(sx - existing.x, sy - existing.y, sz - existing.z);
        if (errDist > 1.1) {
          existing.x = sx;
          existing.y = sy;
          existing.z = sz;
        } else {
          existing.x += (sx - existing.x) * 0.65;
          existing.y += (sy - existing.y) * 0.65;
          existing.z += (sz - existing.z) * 0.65;
        }
        if (typeof g.vx === 'number') existing.vx = g.vx;
        if (typeof g.vy === 'number') existing.vy = g.vy;
        if (typeof g.vz === 'number') existing.vz = g.vz;
        if (typeof g.fuseRemaining === 'number') existing.fuseRemaining = g.fuseRemaining;
        existing.lastSyncAt = now;
      }
    }

    for (const [id, item] of this.activeGrenadeMeshes.entries()) {
      if (!seen.has(id) && now - item.createdAt > 180) {
        this.removeGrenadeMesh(id);
      }
    }
  }

  onGrenadeThrown(data) {
    return this.spawnGrenadeProjectile(data);
  }

  spawnGrenadeProjectile(rawData) {
    const data = rawData?.grenade || rawData;
    if (!data || !data.id) return null;
    const now = performance.now();
    const existing = this.activeGrenadeMeshes.get(data.id);
    if (existing) {
      existing.x = Number(data.x ?? existing.x);
      existing.y = Number(data.y ?? existing.y);
      existing.z = Number(data.z ?? existing.z);
      if (typeof data.vx === 'number') existing.vx = data.vx;
      if (typeof data.vy === 'number') existing.vy = data.vy;
      if (typeof data.vz === 'number') existing.vz = data.vz;
      if (typeof data.fuseRemaining === 'number') existing.fuseRemaining = data.fuseRemaining;
      existing.lastSyncAt = now;
      return existing;
    }

    const gx = Number(data.x ?? 0);
    const gy = Number(data.y ?? 1.2);
    const gz = Number(data.z ?? 0);
    const vx = Number(data.vx ?? 0);
    const vy = Number(data.vy ?? 0);
    const vz = Number(data.vz ?? 0);

    const group = new THREE.Group();
    group.position.set(gx, gy, gz);

    const bodyGroup = new THREE.Group();
    const bodyMesh = new THREE.Mesh(this.sharedGrenadeBodyGeo, this.sharedGrenadeBodyMat);
    const bandMesh = new THREE.Mesh(this.sharedGrenadeBandGeo, this.sharedGrenadeBandMat);
    const capMesh = new THREE.Mesh(this.sharedGrenadeCapGeo, this.sharedGrenadeCapMat);
    capMesh.position.y = 0.11;
    const pinMesh = new THREE.Mesh(this.sharedGrenadeRingGeo, this.sharedGrenadeCapMat);
    pinMesh.position.set(0.045, 0.125, 0);

    const fuseMat = new THREE.MeshBasicMaterial({
      color: 0xff3b30,
      transparent: true,
      opacity: 0.95
    });
    const fuseBeacon = new THREE.Mesh(this.sharedHitOrbGeo, fuseMat);
    fuseBeacon.scale.setScalar(0.42);
    fuseBeacon.position.y = 0.155;

    bodyGroup.add(bodyMesh, bandMesh, capMesh, pinMesh, fuseBeacon);
    group.add(bodyGroup);

    const glowRingMat = new THREE.MeshBasicMaterial({
      color: 0xf97316,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.55,
      depthWrite: false
    });
    const glowRing = new THREE.Mesh(this.sharedGrenadeRingGeo, glowRingMat);
    glowRing.scale.setScalar(4.2);
    glowRing.rotation.x = -Math.PI / 2;
    group.add(glowRing);

    const trailSteps = 10;
    const trailPositions = new Float32Array(trailSteps * 3);
    for (let i = 0; i < trailSteps; i++) {
      trailPositions[i * 3] = gx;
      trailPositions[i * 3 + 1] = gy;
      trailPositions[i * 3 + 2] = gz;
    }
    const trailGeo = new THREE.BufferGeometry();
    trailGeo.setAttribute('position', new THREE.BufferAttribute(trailPositions, 3));
    const trailMat = new THREE.LineBasicMaterial({
      color: 0xfb923c,
      transparent: true,
      opacity: 0.72
    });
    const trailLine = new THREE.Line(trailGeo, trailMat);

    this.scene.add(group);
    this.scene.add(trailLine);

    const ownerId = data.ownerId || rawData?.playerId || null;
    if (ownerId && ownerId !== this.localId) {
      const rp = this.remotePlayers.get(ownerId);
      if (rp && rp.alive && rp.armPivot) {
        rp.armPivot.rotation.x = -0.55;
      }
    }

    const entry = {
      id: data.id,
      ownerId,
      group,
      bodyGroup,
      fuseBeacon,
      fuseMat,
      glowRing,
      glowRingMat,
      trailLine,
      trailGeo,
      trailMat,
      trailPositions,
      x: gx,
      y: gy,
      z: gz,
      vx,
      vy,
      vz,
      fuseRemaining: Number(data.fuseRemaining ?? ((data.fuseMs || 2200) / 1000)),
      createdAt: now,
      lastSyncAt: now,
      lastBounceSoundAt: 0
    };
    this.activeGrenadeMeshes.set(data.id, entry);
    return entry;
  }

  onGrenadeExploded(data) {
    return this.spawnGrenadeExplosion(data);
  }

  spawnGrenadeExplosion(rawData) {
    const data = rawData?.grenade || rawData;
    if (!data) return;
    const now = performance.now();
    const ex = Number(data.x ?? data.position?.x ?? 0);
    const ey = Number(data.y ?? data.position?.y ?? 0.25);
    const ez = Number(data.z ?? data.position?.z ?? 0);
    const radius = Number(data.radius || 7.5);

    if (now - this._lastExplodedAt < 120) {
      if (
        (data.id && this._lastExplodedGrenadeId === data.id) ||
        (this._lastExplodedPos && Math.hypot(ex - this._lastExplodedPos.x, ey - this._lastExplodedPos.y, ez - this._lastExplodedPos.z) < 0.25)
      ) {
        return;
      }
    }
    this._lastExplodedGrenadeId = data.id || null;
    this._lastExplodedAt = now;
    this._lastExplodedPos = { x: ex, y: ey, z: ez };

    if (data.id) {
      this.removeGrenadeMesh(data.id);
    }

    if (!this.explosionPool) this.explosionPool = [];
    let fxObj = this.explosionPool.pop();
    let coreSphere, coreMat, fireballSphere, fireballMat, blastWaveSphere, blastWaveMat, shockwaveRing, shockwaveMat, torusRing, torusMat, sparkMat, particles;

    if (fxObj) {
      ({
        coreSphere,
        coreMat,
        fireballSphere,
        fireballMat,
        blastWaveSphere,
        blastWaveMat,
        shockwaveRing,
        shockwaveMat,
        torusRing,
        torusMat,
        sparkMat,
        particles
      } = fxObj);
      coreMat.opacity = 1.0;
      fireballMat.opacity = 0.92;
      blastWaveMat.opacity = 0.42;
      shockwaveMat.opacity = 0.95;
      torusMat.opacity = 0.88;
      sparkMat.opacity = 1.0;
      particles.length = 0;
    } else {
      coreMat = new THREE.MeshBasicMaterial({
        color: 0xfef08a,
        transparent: true,
        opacity: 1.0,
        depthWrite: false
      });
      coreSphere = new THREE.Mesh(this.sharedExplosionSphereGeo, coreMat);

      fireballMat = new THREE.MeshBasicMaterial({
        color: 0xf97316,
        transparent: true,
        opacity: 0.92,
        depthWrite: false
      });
      fireballSphere = new THREE.Mesh(this.sharedExplosionSphereGeo, fireballMat);

      blastWaveMat = new THREE.MeshBasicMaterial({
        color: 0xef4444,
        transparent: true,
        opacity: 0.42,
        wireframe: true,
        depthWrite: false
      });
      blastWaveSphere = new THREE.Mesh(this.sharedExplosionSphereGeo, blastWaveMat);

      shockwaveMat = new THREE.MeshBasicMaterial({
        color: 0xfb923c,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.95,
        depthWrite: false
      });
      shockwaveRing = new THREE.Mesh(this.sharedShockwaveRingGeo, shockwaveMat);
      shockwaveRing.rotation.x = -Math.PI / 2;

      torusMat = new THREE.MeshBasicMaterial({
        color: 0xfacc15,
        transparent: true,
        opacity: 0.88,
        depthWrite: false
      });
      torusRing = new THREE.Mesh(this.sharedShockwaveTorusGeo, torusMat);

      sparkMat = new THREE.MeshBasicMaterial({
        color: 0xfde047,
        transparent: true,
        opacity: 1.0
      });
      particles = [];
    }

    coreSphere.position.set(ex, ey + 0.18, ez);
    coreSphere.scale.setScalar(0.45);
    this.scene.add(coreSphere);

    fireballSphere.position.set(ex, ey + 0.22, ez);
    fireballSphere.scale.setScalar(0.75);
    this.scene.add(fireballSphere);

    blastWaveSphere.position.set(ex, ey + 0.2, ez);
    blastWaveSphere.scale.setScalar(1.0);
    this.scene.add(blastWaveSphere);

    shockwaveRing.position.set(ex, Math.max(0.05, ey - 0.08), ez);
    shockwaveRing.scale.setScalar(0.6);
    this.scene.add(shockwaveRing);

    torusRing.rotation.x = Math.PI / 2 + (Math.random() - 0.5) * 0.35;
    torusRing.rotation.y = (Math.random() - 0.5) * 0.35;
    torusRing.position.set(ex, ey + 0.28, ez);
    torusRing.scale.setScalar(0.5);
    this.scene.add(torusRing);

    const flashLight = this.explosionLight;
    if (flashLight) {
      flashLight.position.set(ex, ey + 0.6, ez);
      flashLight.intensity = this.quality.dynamicLights >= 2 ? 8.5 : 0;
    }

    if (!this.sparkMeshPool) this.sparkMeshPool = [];
    if (!this.tracerParticlePool) this.tracerParticlePool = [];
    const pCount = Math.max(4, Math.round(18 * this.quality.particleScale));
    for (let i = 0; i < pCount; i++) {
      const pMesh = this.sparkMeshPool.pop() || new THREE.Mesh(this.sharedSparkGeo, sparkMat);
      pMesh.geometry = this.sharedSparkGeo;
      pMesh.material = sparkMat;
      pMesh.scale.setScalar(1.6 + Math.random() * 1.4);
      pMesh.position.set(ex, ey + 0.2, ez);
      const angle = (i / pCount) * Math.PI * 2 + (Math.random() - 0.5) * 0.35;
      const hSpeed = 4.5 + Math.random() * 9.5;
      let pt = this.tracerParticlePool.pop();
      if (pt) {
        pt.mesh = pMesh;
        pt.vx = Math.cos(angle) * hSpeed;
        pt.vy = 3.8 + Math.random() * 8.5;
        pt.vz = Math.sin(angle) * hSpeed;
      } else {
        pt = {
          mesh: pMesh,
          vx: Math.cos(angle) * hSpeed,
          vy: 3.8 + Math.random() * 8.5,
          vz: Math.sin(angle) * hSpeed
        };
      }
      particles.push(pt);
      this.scene.add(pMesh);
    }

    if (ey <= 1.2) {
      this.spawnBulletDecal({ x: ex, y: 0.01, z: ez }, { x: 0, y: 1, z: 0 });
    }

    if (fxObj) {
      fxObj.flashLight = flashLight;
      fxObj.maxRadius = radius;
      fxObj.createdAt = now;
      fxObj.duration = 540;
      this.activeEffects.push(fxObj);
    } else {
      this.activeEffects.push({
        type: 'explosion',
        coreSphere,
        coreMat,
        fireballSphere,
        fireballMat,
        blastWaveSphere,
        blastWaveMat,
        shockwaveRing,
        shockwaveMat,
        torusRing,
        torusMat,
        flashLight,
        particles,
        sparkMat,
        maxRadius: radius,
        createdAt: now,
        duration: 540
      });
    }
  }
}
