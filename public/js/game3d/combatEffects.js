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
  rayIntersectsAABB,
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

let _sharedBulletDecalTex = null;
let _sharedSmokeTex = null;
let _sharedTracerBoltGeo = null;

function getSharedBulletDecalTex() {
  if (!_sharedBulletDecalTex && typeof document !== 'undefined') {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');

    ctx.clearRect(0, 0, 128, 128);

    // Outer scorched soot & concrete powder halo
    const outerGrad = ctx.createRadialGradient(64, 64, 8, 64, 64, 60);
    outerGrad.addColorStop(0.0, 'rgba(6, 7, 10, 0.92)');
    outerGrad.addColorStop(0.28, 'rgba(18, 16, 14, 0.68)');
    outerGrad.addColorStop(0.62, 'rgba(28, 25, 22, 0.28)');
    outerGrad.addColorStop(1.0, 'rgba(0, 0, 0, 0.0)');
    ctx.fillStyle = outerGrad;
    ctx.beginPath();
    ctx.arc(64, 64, 60, 0, Math.PI * 2);
    ctx.fill();

    // Jagged radial concrete/metal fracture cracks
    const crackAngles = [0.22, 1.08, 1.96, 2.84, 3.71, 4.62, 5.48];
    for (let i = 0; i < crackAngles.length; i++) {
      const baseAng = crackAngles[i];
      const len1 = 16 + (i % 3) * 5;
      const len2 = 30 + ((i * 7) % 18);
      const jitter1 = (i % 2 === 0 ? 0.16 : -0.15);
      const jitter2 = (i % 2 === 0 ? -0.14 : 0.18);
      const x1 = 64 + Math.cos(baseAng) * 9;
      const y1 = 64 + Math.sin(baseAng) * 9;
      const x2 = 64 + Math.cos(baseAng + jitter1) * len1;
      const y2 = 64 + Math.sin(baseAng + jitter1) * len1;
      const x3 = 64 + Math.cos(baseAng + jitter2) * len2;
      const y3 = 64 + Math.sin(baseAng + jitter2) * len2;

      ctx.strokeStyle = 'rgba(205, 198, 186, 0.34)';
      ctx.lineWidth = 2.6;
      ctx.beginPath();
      ctx.moveTo(x1 + 1, y1 + 1);
      ctx.lineTo(x2 + 1, y2 + 1);
      ctx.lineTo(x3 + 1, y3 + 1);
      ctx.stroke();

      ctx.strokeStyle = 'rgba(8, 10, 14, 0.88)';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.lineTo(x3, y3);
      ctx.stroke();
    }

    // Chipped concrete inner ring
    ctx.strokeStyle = 'rgba(175, 168, 155, 0.42)';
    ctx.lineWidth = 2.0;
    ctx.beginPath();
    ctx.arc(64, 64, 15, 0, Math.PI * 2);
    ctx.stroke();

    // Deep charred core impact crater
    const coreGrad = ctx.createRadialGradient(64, 64, 2, 64, 64, 14);
    coreGrad.addColorStop(0.0, 'rgba(2, 3, 5, 0.99)');
    coreGrad.addColorStop(0.65, 'rgba(10, 11, 14, 0.94)');
    coreGrad.addColorStop(1.0, 'rgba(20, 18, 16, 0.0)');
    ctx.fillStyle = coreGrad;
    ctx.beginPath();
    ctx.arc(64, 64, 14, 0, Math.PI * 2);
    ctx.fill();

    _sharedBulletDecalTex = new THREE.CanvasTexture(canvas);
    if (THREE.SRGBColorSpace) _sharedBulletDecalTex.colorSpace = THREE.SRGBColorSpace;
    _sharedBulletDecalTex.userData = { shared: true };
  }
  return _sharedBulletDecalTex;
}

export function getSharedSmokeTex() {
  if (!_sharedSmokeTex && typeof document !== 'undefined') {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, 128, 128);

    const lobes = [
      { x: 64, y: 64, r: 54, a0: 0.56, a1: 0.24 },
      { x: 50, y: 54, r: 36, a0: 0.44, a1: 0.16 },
      { x: 78, y: 56, r: 34, a0: 0.40, a1: 0.14 },
      { x: 56, y: 76, r: 35, a0: 0.40, a1: 0.14 },
      { x: 74, y: 74, r: 32, a0: 0.36, a1: 0.12 }
    ];
    for (let i = 0; i < lobes.length; i++) {
      const l = lobes[i];
      const grad = ctx.createRadialGradient(l.x, l.y, 4, l.x, l.y, l.r);
      grad.addColorStop(0.0, `rgba(255, 255, 255, ${l.a0})`);
      grad.addColorStop(0.55, `rgba(232, 232, 232, ${l.a1})`);
      grad.addColorStop(1.0, 'rgba(210, 210, 210, 0.0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(l.x, l.y, l.r, 0, Math.PI * 2);
      ctx.fill();
    }

    _sharedSmokeTex = new THREE.CanvasTexture(canvas);
    if (THREE.SRGBColorSpace) _sharedSmokeTex.colorSpace = THREE.SRGBColorSpace;
    _sharedSmokeTex.userData = { shared: true };
  }
  return _sharedSmokeTex;
}

function getSharedTracerBoltGeo() {
  if (!_sharedTracerBoltGeo) {
    _sharedTracerBoltGeo = new THREE.CylinderGeometry(0.013, 0.0045, 1.0, 6);
    _sharedTracerBoltGeo.rotateX(Math.PI * 0.5);
    _sharedTracerBoltGeo.computeBoundingSphere();
    _sharedTracerBoltGeo.userData = { shared: true };
  }
  return _sharedTracerBoltGeo;
}

export class CombatEffectsMethods {
  _resolveShellFloorY(x, y, z) {
    let highest = 0;
    const obsList = this.currentObstacles;
    if (Array.isArray(obsList)) {
      for (let i = 0; i < obsList.length; i++) {
        const obs = obsList[i];
        const topY = obs.y + obs.h * 0.5;
        if (topY > highest && topY <= y + 0.05) {
          if (Math.abs(x - obs.x) <= obs.w * 0.5 && Math.abs(z - obs.z) <= obs.d * 0.5) {
            highest = topY;
          }
        }
      }
    }
    return highest + 0.025;
  }

  spawnShellCasing() {
    if (!this.shellPool) this.shellPool = [];
    const entry = this.shellPool.pop();
    const shell = entry ? entry.mesh : new THREE.Mesh(this.sharedShellGeo, this.sharedShellMat);
    this.tmpVec3A.set(0.24, -0.14, -0.35);
    this.tmpVec3A.applyQuaternion(this.camera.quaternion);
    shell.position.copy(this.camera.position).add(this.tmpVec3A);
    const floorY = this._resolveShellFloorY(shell.position.x, shell.position.y, shell.position.z);

    this.tmpVec3B.set(
      1.6 + Math.random() * 1.1,
      1.4 + Math.random() * 0.9,
      -0.4 + (Math.random() - 0.5) * 0.8
    );
    this.tmpVec3B.applyQuaternion(this.camera.quaternion);
    this.tmpVec3B.add(this.velocity);

    this.scene.add(shell);
    if (entry) {
      entry.vx = this.tmpVec3B.x;
      entry.vy = this.tmpVec3B.y;
      entry.vz = this.tmpVec3B.z;
      entry.rx = (Math.random() - 0.5) * 22;
      entry.ry = (Math.random() - 0.5) * 22;
      entry.rz = (Math.random() - 0.5) * 22;
      entry.floorY = floorY;
      entry.createdAt = performance.now();
      entry.duration = 650;
      this.activeShells.push(entry);
    } else {
      this.activeShells.push({
        mesh: shell,
        vx: this.tmpVec3B.x,
        vy: this.tmpVec3B.y,
        vz: this.tmpVec3B.z,
        rx: (Math.random() - 0.5) * 22,
        ry: (Math.random() - 0.5) * 22,
        rz: (Math.random() - 0.5) * 22,
        floorY,
        createdAt: performance.now(),
        duration: 650
      });
    }
  }

  _ensureBulletDecalMaterial() {
    if (this._decalTexApplied) return;
    this._decalTexApplied = true;
    const mat = this.sharedDecalMat;
    if (!mat) return;
    const tex = getSharedBulletDecalTex();
    if (tex) {
      mat.map = tex;
      mat.color.setHex(0xffffff);
      mat.opacity = 0.94;
      mat.transparent = true;
      mat.depthWrite = false;
      mat.polygonOffset = true;
      mat.polygonOffsetFactor = -2;
      mat.polygonOffsetUnits = -3;
      mat.needsUpdate = true;
    }
  }

  spawnBulletDecal(point, normal, scale = 1) {
    if (!normal || typeof normal !== 'object' || typeof normal.x !== 'number') return;
    this._ensureBulletDecalMaterial();
    let decalMesh;
    if (this.bulletDecals.length >= this.maxBulletDecals) {
      decalMesh = this.bulletDecals.shift();
    } else {
      decalMesh = new THREE.Mesh(this.sharedDecalGeo, this.sharedDecalMat);
      decalMesh.renderOrder = 2;
      this.scene.add(decalMesh);
    }

    decalMesh.position.set(
      point.x + normal.x * 0.015,
      point.y + normal.y * 0.015,
      point.z + normal.z * 0.015
    );
    this.tmpVec3C.set(normal.x, normal.y, normal.z);
    if (this.tmpVec3C.lengthSq() > 1e-6) {
      this.tmpVec3C.normalize();
    } else {
      this.tmpVec3C.set(0, 1, 0);
    }
    this.tmpQuat.setFromUnitVectors(this.upVec, this.tmpVec3C);
    decalMesh.quaternion.copy(this.tmpQuat);
    decalMesh.rotateZ(Math.random() * Math.PI * 2);
    decalMesh.scale.setScalar(scale * (0.88 + Math.random() * 0.36));
    this.bulletDecals.push(decalMesh);
  }

  _recycleExplosionEffect(fx) {
    if (!fx) return;
    this.scene.remove(fx.coreSphere);
    this.scene.remove(fx.fireballSphere);
    this.scene.remove(fx.blastWaveSphere);
    this.scene.remove(fx.shockwaveRing);
    this.scene.remove(fx.torusRing);
    if (fx.flashLight && fx.flashLight === this.explosionLight) {
      fx.flashLight.intensity = 0;
    } else if (fx.flashLight) {
      this.scene.remove(fx.flashLight);
    }
    if (fx.particles) {
      if (!this.sparkMeshPool) this.sparkMeshPool = [];
      if (!this.tracerParticlePool) this.tracerParticlePool = [];
      for (let p = 0; p < fx.particles.length; p++) {
        const pt = fx.particles[p];
        const pm = pt.mesh;
        if (pm) {
          this.scene.remove(pm);
          if (this.sparkMeshPool.length < 192) {
            this.sparkMeshPool.push(pm);
          }
          pt.mesh = null;
        }
        if (this.tracerParticlePool.length < 192) {
          this.tracerParticlePool.push(pt);
        }
      }
      fx.particles.length = 0;
    }
    if (Array.isArray(fx.smokeClouds)) {
      if (!this.smokeSpritePool) this.smokeSpritePool = [];
      if (!this.smokeMatPool) this.smokeMatPool = [];
      if (!this.smokeCloudPool) this.smokeCloudPool = [];
      for (let s = 0; s < fx.smokeClouds.length; s++) {
        const sc = fx.smokeClouds[s];
        if (sc.sprite) {
          this.scene.remove(sc.sprite);
          if (this.smokeSpritePool.length < 96) {
            this.smokeSpritePool.push(sc.sprite);
          }
          sc.sprite = null;
        }
        if (sc.mat) {
          if (this.smokeMatPool.length < 96) {
            this.smokeMatPool.push(sc.mat);
          } else {
            sc.mat.dispose();
          }
          sc.mat = null;
        }
        if (this.smokeCloudPool.length < 96) {
          this.smokeCloudPool.push(sc);
        }
      }
      fx.smokeClouds.length = 0;
    }
    if (!this.explosionPool) this.explosionPool = [];
    if (this.explosionPool.length < 8) {
      this.explosionPool.push(fx);
    } else {
      fx.coreMat?.dispose();
      fx.fireballMat?.dispose();
      fx.blastWaveMat?.dispose();
      fx.shockwaveMat?.dispose();
      fx.torusMat?.dispose();
      fx.sparkMat?.dispose();
    }
  }

  _recycleTracerEffect(fx) {
    if (!fx) return;
    if (fx.line) {
      this.scene.remove(fx.line);
      if (!this.tracerLinePool) this.tracerLinePool = [];
      if (this.tracerLinePool.length < 32) {
        this.tracerLinePool.push(fx.line);
      } else {
        fx.geo?.dispose();
        fx.mat?.dispose();
      }
    }
    if (fx.boltMesh) {
      this.scene.remove(fx.boltMesh);
      if (!this.tracerBoltPool) this.tracerBoltPool = [];
      if (this.tracerBoltPool.length < 32) {
        this.tracerBoltPool.push(fx.boltMesh);
      }
    }
    if (fx.boltMat) {
      if (!this.tracerBoltMatPool) this.tracerBoltMatPool = [];
      if (this.tracerBoltMatPool.length < 32) {
        this.tracerBoltMatPool.push(fx.boltMat);
      } else {
        fx.boltMat.dispose();
      }
    }
    if (fx.spark) {
      this.scene.remove(fx.spark);
      if (this.sparkMeshPool && this.sparkMeshPool.length < 192) {
        this.sparkMeshPool.push(fx.spark);
      }
    }
    if (Array.isArray(fx.particles)) {
      if (!this.tracerParticlePool) this.tracerParticlePool = [];
      for (let p = 0; p < fx.particles.length; p++) {
        const pt = fx.particles[p];
        const pm = pt.mesh;
        if (pm) {
          this.scene.remove(pm);
          if (this.sparkMeshPool && this.sparkMeshPool.length < 192) {
            this.sparkMeshPool.push(pm);
          }
          pt.mesh = null;
        }
        if (this.tracerParticlePool.length < 192) {
          this.tracerParticlePool.push(pt);
        }
      }
      fx.particles.length = 0;
    }
    if (Array.isArray(fx.smokePuffs)) {
      if (!this.smokeSpritePool) this.smokeSpritePool = [];
      if (!this.smokeMatPool) this.smokeMatPool = [];
      if (!this.smokePuffPool) this.smokePuffPool = [];
      for (let s = 0; s < fx.smokePuffs.length; s++) {
        const sp = fx.smokePuffs[s];
        if (sp.sprite) {
          this.scene.remove(sp.sprite);
          if (this.smokeSpritePool.length < 96) {
            this.smokeSpritePool.push(sp.sprite);
          }
          sp.sprite = null;
        }
        if (sp.mat) {
          if (this.smokeMatPool.length < 96) {
            this.smokeMatPool.push(sp.mat);
          } else {
            sp.mat.dispose();
          }
          sp.mat = null;
        }
        if (this.smokePuffPool.length < 96) {
          this.smokePuffPool.push(sp);
        }
      }
      fx.smokePuffs.length = 0;
    }
    if (fx.sparkMat) {
      if (!this.sparkMatPool) this.sparkMatPool = [];
      if (this.sparkMatPool.length < 64) {
        this.sparkMatPool.push(fx.sparkMat);
      } else {
        fx.sparkMat.dispose();
      }
    }
    if (fx.armorSparkMat) {
      if (!this.sparkMatPool) this.sparkMatPool = [];
      if (this.sparkMatPool.length < 64) {
        this.sparkMatPool.push(fx.armorSparkMat);
      } else {
        fx.armorSparkMat.dispose();
      }
    }
    fx.line = null;
    fx.boltMesh = null;
    fx.boltMat = null;
    fx.spark = null;
    fx.geo = null;
    fx.mat = null;
    fx.sparkMat = null;
    fx.armorSparkMat = null;
    if (!this.tracerEffectPool) this.tracerEffectPool = [];
    if (this.tracerEffectPool.length < 32) {
      this.tracerEffectPool.push(fx);
    }
  }

  spawnTracerEffect(origin, hitPoint, colorHex = 0xfef08a, isPlayerHit = false, hitNormal = null, ss = 0) {
    this.tmpVec3A.set(origin.x, origin.y, origin.z);
    this.tmpVec3B.set(hitPoint.x, hitPoint.y, hitPoint.z);

    const dx = this.tmpVec3B.x - this.tmpVec3A.x;
    const dy = this.tmpVec3B.y - this.tmpVec3A.y;
    const dz = this.tmpVec3B.z - this.tmpVec3A.z;
    const totalDist = Math.hypot(dx, dy, dz);
    const invDist = totalDist > 1e-5 ? 1 / totalDist : 0;
    const ux = dx * invDist;
    const uy = dy * invDist;
    const uz = totalDist > 1e-5 ? dz * invDist : -1;

    // Short projectile bolt length ("1 tia nhỏ thôi") instead of a full static beam
    const boltLen = Math.min(totalDist, Math.max(0.32, Math.min(1.55, totalDist * 0.22)));
    const headInitX = this.tmpVec3A.x + ux * boltLen;
    const headInitY = this.tmpVec3A.y + uy * boltLen;
    const headInitZ = this.tmpVec3A.z + uz * boltLen;

    // Cap concurrent shot effects to the quality tier's maxShotEffects budget during multi-player firefights
    const maxShotEffects = this.quality?.maxShotEffects || 20;
    let activeTracers = 0;
    let oldestTracerIdx = -1;
    for (let i = 0; i < this.activeEffects.length; i++) {
      if (this.activeEffects[i].type === 'tracer') {
        activeTracers++;
        if (oldestTracerIdx === -1) oldestTracerIdx = i;
      }
    }
    if (activeTracers >= maxShotEffects && oldestTracerIdx !== -1) {
      const oldest = this.activeEffects.splice(oldestTracerIdx, 1)[0];
      this._recycleTracerEffect(oldest);
    }

    if (!this.tracerLinePool) this.tracerLinePool = [];
    let line = this.tracerLinePool.pop();
    let geo;
    let mat;
    if (line) {
      geo = line.geometry;
      mat = line.material;
      const posAttr = geo.attributes.position;
      const arr = posAttr.array;
      arr[0] = this.tmpVec3A.x;
      arr[1] = this.tmpVec3A.y;
      arr[2] = this.tmpVec3A.z;
      arr[3] = headInitX;
      arr[4] = headInitY;
      arr[5] = headInitZ;
      posAttr.needsUpdate = true;
      mat.color.setHex(colorHex);
      mat.opacity = 0.98;
      line.visible = true;
    } else {
      geo = new THREE.BufferGeometry();
      const positions = new Float32Array([
        this.tmpVec3A.x, this.tmpVec3A.y, this.tmpVec3A.z,
        headInitX, headInitY, headInitZ
      ]);
      geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      mat = new THREE.LineBasicMaterial({
        color: colorHex,
        transparent: true,
        opacity: 0.98,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false
      });
      line = new THREE.Line(geo, mat);
      line.frustumCulled = false;
    }
    this.scene.add(line);

    // 3D Volumetric HDR glowing tracer bolt (aligned with line segment, updated smoothly in loopAndInput)
    if (!this.tracerBoltPool) this.tracerBoltPool = [];
    if (!this.tracerBoltMatPool) this.tracerBoltMatPool = [];
    const boltColor = isPlayerHit ? 0xffd166 : (colorHex || 0xffe08a);
    let boltMat = this.tracerBoltMatPool.pop();
    if (boltMat) {
      boltMat.color.setHex(boltColor);
      boltMat.opacity = 0.95;
    } else {
      boltMat = new THREE.MeshBasicMaterial({
        color: boltColor,
        transparent: true,
        opacity: 0.95,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false
      });
    }
    const boltGeo = getSharedTracerBoltGeo();
    let boltMesh = this.tracerBoltPool.pop();
    if (boltMesh) {
      boltMesh.geometry = boltGeo;
      boltMesh.material = boltMat;
    } else {
      boltMesh = new THREE.Mesh(boltGeo, boltMat);
      boltMesh.frustumCulled = false;
    }
    boltMesh.position.set(
      (this.tmpVec3A.x + headInitX) * 0.5,
      (this.tmpVec3A.y + headInitY) * 0.5,
      (this.tmpVec3A.z + headInitZ) * 0.5
    );
    this.tmpVec3C.set(ux, uy, uz);
    boltMesh.quaternion.setFromUnitVectors(this.upVec, this.tmpVec3C);
    boltMesh.scale.set(1, 1, Math.max(0.01, boltLen));
    boltMesh.visible = boltLen > 0.015;
    this.scene.add(boltMesh);

    const sparkColor = isPlayerHit ? 0xef4444 : 0xffe08a;
    if (!this.sparkMatPool) this.sparkMatPool = [];
    const sparkMat = this.sparkMatPool.pop() || new THREE.MeshBasicMaterial({
      color: sparkColor,
      transparent: true,
      opacity: 1,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false
    });
    sparkMat.color.setHex(sparkColor);
    sparkMat.opacity = 1;
    sparkMat.blending = THREE.AdditiveBlending;
    sparkMat.depthWrite = false;
    sparkMat.toneMapped = false;

    if (!this.sparkMeshPool) this.sparkMeshPool = [];
    const spark = this.sparkMeshPool.pop() || new THREE.Mesh(this.sharedHitOrbGeo, sparkMat);
    spark.geometry = this.sharedHitOrbGeo;
    spark.material = sparkMat;
    spark.position.copy(this.tmpVec3B);
    spark.scale.setScalar(isPlayerHit ? 1.35 : 0.90);
    spark.visible = true;
    this.scene.add(spark);

    if (!this.tracerEffectPool) this.tracerEffectPool = [];
    if (!this.tracerParticlePool) this.tracerParticlePool = [];
    const fx = this.tracerEffectPool.pop() || {
      type: 'tracer',
      ss: 0,
      line: null,
      boltMesh: null,
      boltMat: null,
      spark: null,
      particles: [],
      smokePuffs: [],
      geo: null,
      mat: null,
      sparkMat: null,
      armorSparkMat: null,
      ox: 0,
      oy: 0,
      oz: 0,
      hx: 0,
      hy: 0,
      hz: 0,
      ux: 0,
      uy: 0,
      uz: -1,
      totalDist: 0,
      boltLen: 0.8,
      travelMs: 55,
      lineDuration: 145,
      isPlayerHit: false,
      createdAt: 0,
      duration: 145
    };
    const particles = fx.particles;
    particles.length = 0;
    const smokePuffs = fx.smokePuffs || (fx.smokePuffs = []);
    smokePuffs.length = 0;

    const hasNormal = Boolean(hitNormal && typeof hitNormal === 'object' && typeof hitNormal.x === 'number');
    const nx = hasNormal ? hitNormal.x : -ux * 0.6;
    const ny = hasNormal ? hitNormal.y : Math.max(0.35, -uy * 0.6);
    const nz = hasNormal ? hitNormal.z : -uz * 0.6;

    const pScale = this.quality?.particleScale ?? 1;
    const pCount = isPlayerHit ? Math.max(3, Math.round(5 * pScale)) : Math.max(2, Math.round(5 * pScale));
    let armorSparkMat = null;
    if (isPlayerHit) {
      armorSparkMat = this.sparkMatPool.pop() || new THREE.MeshBasicMaterial({
        color: 0x38bdf8,
        transparent: true,
        opacity: 1,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false
      });
      armorSparkMat.color.setHex(0x38bdf8);
      armorSparkMat.opacity = 1;
      armorSparkMat.blending = THREE.AdditiveBlending;
      armorSparkMat.depthWrite = false;
      armorSparkMat.toneMapped = false;
    }

    for (let i = 0; i < pCount; i++) {
      const useArmorMat = isPlayerHit && i >= pCount - 2;
      const pMat = useArmorMat ? armorSparkMat : sparkMat;
      const pMesh = this.sparkMeshPool.pop() || new THREE.Mesh(this.sharedSparkGeo, pMat);
      pMesh.geometry = this.sharedSparkGeo;
      pMesh.material = pMat;
      pMesh.scale.setScalar(useArmorMat ? 1.15 : isPlayerHit ? 1.2 : 0.85 + Math.random() * 0.35);
      pMesh.position.copy(this.tmpVec3B);
      pMesh.visible = true;
      const pt = this.tracerParticlePool.pop() || { mesh: null, vx: 0, vy: 0, vz: 0 };
      pt.mesh = pMesh;
      pt.vx = nx * 3.6 + (Math.random() - 0.5) * 5.2;
      pt.vy = ny * 3.6 + Math.random() * 4.2;
      pt.vz = nz * 3.6 + (Math.random() - 0.5) * 5.2;
      particles.push(pt);
      this.scene.add(pMesh);
    }

    if (!isPlayerHit && hasNormal) {
      this.spawnBulletDecal(hitPoint, hitNormal);
    }

    // Pooled soft radial concrete dust / crimson mist puff sprites on surface or player impacts
    const smokeTex = getSharedSmokeTex();
    const smokeCount = (hasNormal || isPlayerHit) ? Math.max(1, Math.round((isPlayerHit ? 2 : 3) * pScale)) : 0;
    if (smokeCount > 0 && smokeTex) {
      if (!this.smokeSpritePool) this.smokeSpritePool = [];
      if (!this.smokeMatPool) this.smokeMatPool = [];
      if (!this.smokePuffPool) this.smokePuffPool = [];
      const smokeHex = isPlayerHit ? 0x991b1b : 0xbcb5aa;
      for (let s = 0; s < smokeCount; s++) {
        let sMat = this.smokeMatPool.pop();
        if (sMat) {
          sMat.map = smokeTex;
          sMat.color.setHex(smokeHex);
          sMat.opacity = 0;
        } else {
          sMat = new THREE.SpriteMaterial({
            map: smokeTex,
            color: smokeHex,
            transparent: true,
            opacity: 0,
            depthWrite: false
          });
        }
        sMat.rotation = Math.random() * Math.PI * 2;
        const sprite = this.smokeSpritePool.pop() || new THREE.Sprite(sMat);
        sprite.material = sMat;
        const startScale = isPlayerHit ? 0.24 : 0.22 + Math.random() * 0.08;
        sprite.scale.setScalar(startScale);
        sprite.position.set(
          this.tmpVec3B.x + nx * 0.06 + (Math.random() - 0.5) * 0.08,
          this.tmpVec3B.y + ny * 0.06 + (Math.random() - 0.5) * 0.06,
          this.tmpVec3B.z + nz * 0.06 + (Math.random() - 0.5) * 0.08
        );
        sprite.visible = true;
        this.scene.add(sprite);

        const sp = this.smokePuffPool.pop() || {
          sprite: null,
          mat: null,
          vx: 0,
          vy: 0,
          vz: 0,
          drag: 4.2,
          startScale: 0.22,
          endScale: 0.85,
          maxOpacity: 0.36
        };
        sp.sprite = sprite;
        sp.mat = sMat;
        sp.vx = nx * 1.45 + (Math.random() - 0.5) * 1.1;
        sp.vy = ny * 1.15 + 0.35 + Math.random() * 0.55;
        sp.vz = nz * 1.45 + (Math.random() - 0.5) * 1.1;
        sp.drag = 4.4;
        sp.startScale = startScale;
        sp.endScale = isPlayerHit ? 0.68 : 0.78 + Math.random() * 0.24;
        sp.maxOpacity = isPlayerHit ? 0.42 : 0.38;
        smokePuffs.push(sp);
      }
    }

    const bulletSpeed = 195; // m/s fast visual tracer bolt velocity
    const travelMs = Math.max(26, Math.min(115, (totalDist / bulletSpeed) * 1000));
    const lineDuration = Math.max(120, Math.round(travelMs + 55));

    fx.type = 'tracer';
    fx.ss = ss;
    fx.line = line;
    fx.boltMesh = boltMesh;
    fx.boltMat = boltMat;
    fx.spark = spark;
    fx.geo = geo;
    fx.mat = mat;
    fx.sparkMat = sparkMat;
    fx.armorSparkMat = armorSparkMat;
    fx.ox = this.tmpVec3A.x;
    fx.oy = this.tmpVec3A.y;
    fx.oz = this.tmpVec3A.z;
    fx.hx = this.tmpVec3B.x;
    fx.hy = this.tmpVec3B.y;
    fx.hz = this.tmpVec3B.z;
    fx.ux = ux;
    fx.uy = uy;
    fx.uz = uz;
    fx.totalDist = totalDist;
    fx.boltLen = boltLen;
    fx.travelMs = travelMs;
    fx.lineDuration = lineDuration;
    fx.isPlayerHit = Boolean(isPlayerHit);
    fx.createdAt = performance.now();
    fx.duration = smokeCount > 0 ? 450 : lineDuration;
    this.activeEffects.push(fx);
  }

  getAudioListenerState() {
    if (!this._audioListenerState) {
      this._audioListenerState = { x: 0, y: 0, z: 0, yaw: 0 };
    }
    this._audioListenerState.x = this.position.x;
    this._audioListenerState.y = this.position.y;
    this._audioListenerState.z = this.position.z;
    this._audioListenerState.yaw = this.yaw;
    return this._audioListenerState;
  }

  triggerRemoteShotEffect(shooterId, weaponId, origin, hitPoint, isPlayerHit = false) {
    this.spawnShotVisual(shooterId, weaponId, origin, hitPoint, isPlayerHit);
  }

  spawnShotVisual(shooterId, weaponId, origin, hitPoint, isPlayerHit = false) {
    if (shooterId && typeof shooterId === 'object') {
      if ('x' in shooterId && 'z' in shooterId && !('shooterId' in shooterId) && !('origin' in shooterId)) {
        const resolvedWep = typeof origin === 'string' ? origin : 'rifle';
        return this.spawnShotVisual(null, resolvedWep, shooterId, weaponId, Boolean(hitPoint));
      }
      const payload = shooterId;
      return this.spawnShotVisual(
        payload.shooterId,
        payload.weapon || payload.weaponId || 'rifle',
        payload.origin,
        payload.hitPoint,
        Boolean(payload.isPlayerHit)
      );
    }
    if (typeof shooterId === 'string' && weaponId && typeof weaponId === 'object' && 'x' in weaponId) {
      return this.spawnShotVisual(null, shooterId, weaponId, origin, Boolean(hitPoint));
    }

    const rp = this.remotePlayers.get(shooterId);
    if (rp && rp.alive) {
      rp.lastShotFlashAt = performance.now();
      if (rp.gunMesh?.userData?.flashMesh) {
        rp.gunMesh.userData.flashMesh.visible = true;
      }
      rp.armPivot.rotation.x += 0.14;
      rp.armPivot.updateMatrix();
    }

    const resolvedWeapon = weaponId || rp?.currentWeapon || 'rifle';
    const shotOrigin = origin || (rp ? rp.group.position : null);
    if ((!shooterId || shooterId !== this.localId) && shotOrigin) {
      sfx.playSpatialGunshot(resolvedWeapon, this.getAudioListenerState(), shotOrigin);
      const isTeammateShooter = Boolean(this.gameMode === 'tdm' && this.localTeam && rp?.team && rp.team === this.localTeam);
      if (!isTeammateShooter) {
        this.minimap?.recordGunfireBlip?.(
          shooterId || 'enemy',
          shotOrigin.x,
          shotOrigin.z,
          resolvedWeapon,
          performance.now()
        );
      }
    }

    if (shotOrigin && hitPoint) {
      const wColor = WEAPONS[resolvedWeapon]?.color || 0xfef08a;
      this.spawnTracerEffect(shotOrigin, hitPoint, wColor, Boolean(isPlayerHit), null);
    }
  }

  _damagePopupTexCache = new Map();
  damagePopupPool = [];

  spawnDamagePopup(targetId, damage, isHeadshot = false, opts = {}) {
    const rp = this.remotePlayers.get(targetId);
    if (!rp) return;

    // Trigger a crisp 3D physical hit-react flinch on the enemy's upper body
    if (rp.upperBodyGroup) {
      rp.upperBodyGroup.rotation.x = isHeadshot ? -0.18 : -0.11;
    }

    if (!this._damagePopupTexCache) {
      this._damagePopupTexCache = new Map();
    }
    if (!this.damagePopupPool) {
      this.damagePopupPool = [];
    }

    const roundedDamage = Math.round(Number(damage) || 0);
    const armorBroken = Boolean(opts?.armorBroken);
    const armorHit = !armorBroken && Number(opts?.armorDamage) > 0;
    const isKill = Boolean(opts?.isKill);
    const styleTag = armorBroken ? 'ab' : isHeadshot ? 'hs' : armorHit ? 'ar' : isKill ? 'kl' : 'nm';
    const cacheKey = `${roundedDamage}_${styleTag}`;

    let tex = this._damagePopupTexCache.get(cacheKey);
    if (!tex) {
      const canvas = typeof document !== 'undefined' && typeof document.createElement === 'function'
        ? document.createElement('canvas')
        : { width: 192, height: 64, getContext: () => null };
      canvas.width = 192;
      canvas.height = 64;
      const ctx = canvas.getContext?.('2d');
      if (ctx) {
        ctx.font = (isHeadshot || armorBroken || isKill) ? '900 33px Segoe UI, sans-serif' : '800 28px Segoe UI, sans-serif';
        ctx.textAlign = 'center';
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.92)';
        ctx.lineWidth = 5;
        const text = armorBroken
          ? `BRK -${roundedDamage}`
          : isHeadshot
            ? `HS -${roundedDamage}`
            : armorHit
              ? `ARM -${roundedDamage}`
              : isKill
                ? `KIA -${roundedDamage}`
                : `-${roundedDamage}`;
        ctx.strokeText(text, 96, 44);
        ctx.fillStyle = armorBroken
          ? '#38bdf8'
          : isHeadshot
            ? '#facc15'
            : armorHit
              ? '#67e8f9'
              : isKill
                ? '#f87171'
                : '#f8fafc';
        ctx.fillText(text, 96, 44);
      }
      tex = new THREE.CanvasTexture(canvas);
      if (this._damagePopupTexCache.size >= 64) {
        const oldestKey = this._damagePopupTexCache.keys().next().value;
        if (oldestKey !== undefined) {
          this._damagePopupTexCache.get(oldestKey)?.dispose();
          this._damagePopupTexCache.delete(oldestKey);
        }
      }
      this._damagePopupTexCache.set(cacheKey, tex);
    }

    let pooled = this.damagePopupPool.pop();
    let sprite;
    let mat;
    if (pooled) {
      sprite = pooled.sprite;
      mat = pooled.mat;
      const hadMap = Boolean(mat.map);
      mat.map = tex;
      if (!hadMap) {
        mat.needsUpdate = true;
      }
      mat.opacity = 1;
      sprite.visible = true;
      if (!sprite.parent) {
        this.scene.add(sprite);
      }
    } else {
      mat = new THREE.SpriteMaterial({
        map: tex,
        transparent: true,
        depthTest: false
      });
      sprite = new THREE.Sprite(mat);
      sprite.renderOrder = 15;
      this.scene.add(sprite);
      pooled = {
        type: 'popup',
        sprite,
        mat,
        tex,
        vy: 1.75,
        createdAt: 0,
        duration: 680
      };
    }

    const now = performance.now();
    const stackStep = (rp._lastPopupAt && now - rp._lastPopupAt < 280) ? ((rp._popupStack = ((rp._popupStack || 0) + 1) % 4)) : (rp._popupStack = 0);
    rp._lastPopupAt = now;
    const spreadX = ((stackStep % 2 === 0 ? 1 : -1) * (0.14 + stackStep * 0.06)) + (Math.random() - 0.5) * 0.16;

    const isBig = isHeadshot || armorBroken || isKill;
    sprite.position.set(
      rp.group.position.x + spreadX,
      rp.group.position.y + (isHeadshot ? 2.15 : 1.58) + stackStep * 0.12,
      rp.group.position.z + (Math.random() - 0.5) * 0.25
    );
    sprite.scale.set(isBig ? 1.52 : 1.15, isBig ? 0.60 : 0.46, 1);

    pooled.type = 'popup';
    pooled.sprite = sprite;
    pooled.mat = mat;
    pooled.tex = tex;
    pooled.vy = isBig ? 1.85 : 1.65;
    pooled.createdAt = now;
    pooled.duration = isBig ? 740 : 650;
    this.activeEffects.push(pooled);
  }

  clearDamagePopups() {
    if (!this.damagePopupPool) {
      this.damagePopupPool = [];
    }
    if (!this.activeEffects) return;
    for (let i = this.activeEffects.length - 1; i >= 0; i--) {
      const fx = this.activeEffects[i];
      if (fx.type === 'popup') {
        fx.sprite.visible = false;
        this.damagePopupPool.push(fx);
        this.activeEffects.splice(i, 1);
      }
    }
  }

  applyDamageFlinch(_damage = 20) {
    // Disabled per user request: getting shot (including headshots) never shakes or flinches the camera.
    this.flinchPitch = 0;
    this.flinchRoll = 0;
  }

  /**
   * Crosshair (HUD) spread ONLY: uses the frame-decaying `currentBloom` and the visual spray index. The spread that decides
   * where bullets go is computed by the shared deterministic planShot() on the fire command (sim-time bloom), never from this.
   */
  computeEffectiveSpread(cfg) {
    return computeSpreadAmount(cfg, {
      horizSpeed: Math.hypot(this.velocity.x, this.velocity.z),
      onGround: this.onGround,
      crouching: this.crouching,
      sliding: this.isSliding,
      prone: this.prone,
      aiming: this.isAiming,
      bloom: this.currentBloom,
      shotIndex: this.recoilShotIndex
    });
  }

  /**
   * Trigger pull. Everything the player SEES at once stays immediate (cooldown, ammo, muzzle flash, kick, bloom HUD, sound),
   * but the shot itself is only queued as a fire intent: the next eligible fixed-step command carries the FIRE bit + shot
   * sequence (advanceFixedPhysics) and the server computes spread and hits. The tracer is drawn when that command is built
   * (predictFireCommand), along the exact rays the server will use. No `shoot` socket event exists any more.
   */
  attemptShoot() {
    if (!this.inMatch || !this.alive || !this.isPointerLocked) return;
    if (this.pendingFire) return; // the previous trigger pull has not left with a command yet (a step or two)

    const now = performance.now();
    const cfg = WEAPONS[this.currentWeapon];

    if (this.equipUntil > now) return;
    const effectiveFireRateMs = getEffectiveFireRateMs(cfg, this.isAiming);
    if (now - this.lastShotAt < effectiveFireRateMs) return;

    const isMelee = Boolean(cfg.isMelee || cfg.infiniteAmmo);
    const currentAmmo = this.ammoByWeapon[this.currentWeapon];
    const reserveAmmo = this.reserveAmmoByWeapon[this.currentWeapon] ?? 0;

    // If reloading: allow interrupting shell-by-shell shotgun reload if at least 1 shell is loaded
    if (this.reloadingUntil > now) {
      if (cfg.shellByShell && currentAmmo > 0) {
        this.reloadingUntil = 0;
        this.nextShellAt = 0;
        this.callbacks.onReloadCancel?.(this.currentWeapon, currentAmmo, reserveAmmo);
      } else {
        return;
      }
    }

    if (!isMelee && currentAmmo <= 0) {
      if (reserveAmmo > 0) {
        this.startReload();
      } else if (now - (this._lastDryFireAt || 0) > 220) {
        this._lastDryFireAt = now;
        this.vmSpringImpulse?.('bump', 0.42);
      }
      return;
    }

    if (!isMelee) {
      this.isSprinting = false;
    }
    this.lastShotAt = now;
    if (isMelee) {
      this.meleeSwingUntil = now + 280;
    } else {
      this.ammoByWeapon[this.currentWeapon] = currentAmmo - 1;
      this.callbacks.onWeaponChanged?.(
        this.currentWeapon,
        this.ammoByWeapon[this.currentWeapon],
        reserveAmmo
      );
    }

    // Queue the shot for the next eligible command; local sound only (no network event)
    const pendingShot = {
      weapon: this.currentWeapon,
      ammoConsumed: !isMelee,
      autoReloaded: false,
      recoilDrainedPitch: 0,
      recoilDrainedYaw: 0
    };
    this.pendingFire = pendingShot;
    this.callbacks.onLocalShot?.({ weapon: this.currentWeapon, isAiming: this.isAiming, remainingAmmo: isMelee ? Infinity : this.ammoByWeapon[this.currentWeapon], magSize: cfg.magSize || 1 });

    if (isMelee) {
      return;
    }

    const horizSpeed = Math.hypot(this.velocity.x, this.velocity.z);
    const isMovingWhileShooting = horizSpeed > 0.95 || !this.onGround;
    const isLowPosture = Boolean(this.onGround && (this.prone || (this.crouching && !this.isSliding)));

    // Dynamic bloom HUD & Tactical FPS (PUBG/CS/Valorant) stance-controlled recoil climb
    const moveBloomMult = isMovingWhileShooting ? (isLowPosture ? 1.15 : 1.85) : 1.0;
    const stanceBloomMult = this.prone ? 0.55 : (this.crouching && !this.isSliding) ? 0.75 : 1.0;
    this.currentBloom = Math.min(
      (cfg.bloomMax || 0.018) * moveBloomMult,
      this.currentBloom + (cfg.bloomPerShot || 0.002) * (this.isAiming ? 0.5 : 1.0) * stanceBloomMult * moveBloomMult
    );

    this.recoilShotIndex = Math.min(30, this.recoilShotIndex + 1);
    const runRecoilPenalty = (isMovingWhileShooting && !isLowPosture) ? 1.28 : 1.0;
    const postureMult =
      (this.isAiming ? 0.82 : 1.0) *
      (this.prone ? 0.55 : (this.crouching && !this.isSliding) ? 0.78 : 1.0) *
      runRecoilPenalty;
    const chKick = (cfg.crosshairKick || 0.020) * postureMult;
    this.crosshairRecoilKick = Math.min(0.14, this.crosshairRecoilKick + chKick);

    const patternArr = cfg.recoilPattern;
    const shotZeroIdx = Math.max(0, Math.floor(this.recoilShotIndex) - 1);
    let patIdx = shotZeroIdx;
    if (patternArr && patternArr.length > 0 && shotZeroIdx >= patternArr.length) {
      const loopStart = Math.floor(patternArr.length / 2);
      const loopLen = Math.max(1, patternArr.length - loopStart);
      patIdx = loopStart + ((shotZeroIdx - loopStart) % loopLen);
    }
    const patDir = (patternArr && patternArr.length > 0)
      ? patternArr[patIdx]
      : ((shotZeroIdx % 2 === 0) ? 1 : -1);

    // Valorant-style 3-stage recoil curve:
    // 1) Crisp initial vertical kick with tight horizontal alignment for 1-2 tap bursts
    // 2) Steep progressive vertical climb across shots 3-9
    // 3) Sustained spray ceiling with amplified left-right horizontal sway oscillation
    const climbFactor = 1 + Math.min(9, shotZeroIdx) * (cfg.recoilClimbMult || 0.15);
    const maxRecPitch = cfg.recoilMaxPitch || 0.16;
    const rawKickPitch = (cfg.recoilPitch || 0.014) * climbFactor * postureMult;
    const availPitch = Math.max(0, maxRecPitch - (this.accumulatedRecoilPitch + (this.pendingRecoilPitch || 0)));
    const kickPitch = Math.min(availPitch, rawKickPitch);

    const yawSprayMult = shotZeroIdx < 2
      ? 0.78
      : 1 + Math.min(7, shotZeroIdx - 1) * 0.15 + (availPitch < rawKickPitch * 0.5 ? 0.22 : 0);
    const kickYaw = (cfg.recoilYaw || 0.005) * patDir * yawSprayMult * postureMult;
    this.pendingRecoilPitch = (this.pendingRecoilPitch || 0) + kickPitch;
    this.pendingRecoilYaw = (this.pendingRecoilYaw || 0) + kickYaw;
    this.punchPitch = Math.min(0.026, (this.punchPitch || 0) + (kickPitch > 0 ? kickPitch : rawKickPitch * 0.35) * 0.52);
    this.punchRoll = Math.sign(patDir || 1) * Math.min(0.012, Math.abs(kickYaw) * 0.85);

    // 3D weapon viewmodel kickback, Saltline second-order spring impulse & reciprocating bolt/pump animation
    const kickScale = cfg.visualKick || 0.062;
    this.recoilOffset = Math.min(0.19, this.recoilOffset + kickScale * 0.48);
    this.boltKickOffset = 1.0;
    this.barrelHeat = Math.min(1, (this.barrelHeat || 0) + ((cfg.magSize || 30) >= 20 ? 0.13 : 0.24));
    if (this.vmSpringImpulse) {
      const heavyMult = this.currentWeapon === 'sniper' || this.currentWeapon === 'shotgun' ? 1.45 : 1.0;
      this.vmSpringImpulse('kZ', (0.72 + kickScale * 6.5) * heavyMult);
      this.vmSpringImpulse('kP', (0.58 + kickScale * 5.2) * heavyMult);
      this.vmSpringImpulse('kY', (patDir || 1) * (0.22 + Math.abs(kickYaw) * 18));
      this.vmSpringImpulse('kR', (patDir || 1) * (0.34 + kickScale * 2.8));
    }
    if (this.currentWeapon === 'shotgun' || this.currentWeapon === 'sniper') {
      this.pumpCycleDuration = cfg.pumpActionMs || cfg.boltActionMs || 420;
      this.pumpCycleUntil = now + this.pumpCycleDuration;
    }

    // Show 3D muzzle flash + dynamic Muzzle PointLight
    const activeVm = this.viewmodelMeshes[this.currentWeapon];
    if (activeVm?.userData?.flashMesh) {
      activeVm.userData.flashMesh.visible = true;
      activeVm.userData.flashMesh.rotation.z = Math.random() * Math.PI * 2;
      const s = this.isAiming ? (0.32 + Math.random() * 0.08) : (0.85 + Math.random() * 0.35);
      activeVm.userData.flashMesh.scale.set(s, s, s);
    }
    this.muzzleLight.color.setHex(cfg.color || 0xfef08a);
    this.muzzleLight.intensity = this.quality.dynamicLights >= 1 ? 3.2 : 0;

    this.spawnShellCasing();

    if (this.ammoByWeapon[this.currentWeapon] === 0 && (this.reserveAmmoByWeapon[this.currentWeapon] ?? 0) > 0) {
      pendingShot.autoReloaded = true;
      this.startReload();
    }
  }

  _raycastWorldObstacles(origin, dir, maxDist, outNormal) {
    const obsList = this.currentObstacles;
    let bestT = maxDist;
    let bestObs = null;
    if (Array.isArray(obsList)) {
      for (let i = 0; i < obsList.length; i++) {
        const obs = obsList[i];
        const t = rayIntersectsAABB(origin, dir, bestT, obs);
        if (t !== null && t < bestT) {
          bestT = t;
          bestObs = obs;
        }
      }
    }
    let hitFloor = false;
    if (dir.y < -1e-5 && origin.y > 0) {
      const tFloor = -origin.y / dir.y;
      if (tFloor > 0 && tFloor < bestT) {
        const fx = origin.x + dir.x * tFloor;
        const fz = origin.z + dir.z * tFloor;
        const half = this.arenaHalfSize || MATCH_CONFIG.ARENA_HALF_SIZE || 60;
        if (Math.abs(fx) <= half && Math.abs(fz) <= half) {
          bestT = tFloor;
          bestObs = null;
          hitFloor = true;
        }
      }
    }
    if (hitFloor) {
      outNormal.x = 0;
      outNormal.y = 1;
      outNormal.z = 0;
      return bestT;
    }
    if (!bestObs) return null;

    const hx = origin.x + dir.x * bestT;
    const hy = origin.y + dir.y * bestT;
    const hz = origin.z + dir.z * bestT;
    const minX = bestObs.minX !== undefined ? bestObs.minX : bestObs.x - bestObs.w * 0.5;
    const maxX = bestObs.maxX !== undefined ? bestObs.maxX : bestObs.x + bestObs.w * 0.5;
    const minY = bestObs.minY !== undefined ? bestObs.minY : bestObs.y - bestObs.h * 0.5;
    const maxY = bestObs.maxY !== undefined ? bestObs.maxY : bestObs.y + bestObs.h * 0.5;
    const minZ = bestObs.minZ !== undefined ? bestObs.minZ : bestObs.z - bestObs.d * 0.5;
    const maxZ = bestObs.maxZ !== undefined ? bestObs.maxZ : bestObs.z + bestObs.d * 0.5;
    const dMinX = Math.abs(hx - minX);
    const dMaxX = Math.abs(hx - maxX);
    const dMinY = Math.abs(hy - minY);
    const dMaxY = Math.abs(hy - maxY);
    const dMinZ = Math.abs(hz - minZ);
    const dMaxZ = Math.abs(hz - maxZ);
    let minD = dMinX;
    outNormal.x = -1; outNormal.y = 0; outNormal.z = 0;
    if (dMaxX < minD) { minD = dMaxX; outNormal.x = 1; outNormal.y = 0; outNormal.z = 0; }
    if (dMinY < minD) { minD = dMinY; outNormal.x = 0; outNormal.y = -1; outNormal.z = 0; }
    if (dMaxY < minD) { minD = dMaxY; outNormal.x = 0; outNormal.y = 1; outNormal.z = 0; }
    if (dMinZ < minD) { minD = dMinZ; outNormal.x = 0; outNormal.y = 0; outNormal.z = -1; }
    if (dMaxZ < minD) { outNormal.x = 0; outNormal.y = 0; outNormal.z = 1; }
    return bestT;
  }

  /**
   * Local prediction of a fire command (called right after the command was simulated): advances the shared deterministic shot
   * state and ray-casts the SAME pellet rays the server will compute (same planShot, same seed / `ss` / pose / yaw / pitch)
   * against the local world + hitbox proxies, spawning the tracers / impact effects. The damage ray has no camera noise: it is
   * exactly the command's yaw / pitch (flinch, punch and recoil accumulators never enter it).
   */
  predictFireCommand(cmd, res) {
    const cfg = WEAPONS[cmd.w];
    if (!cfg) return null;
    const isMelee = Boolean(cfg.isMelee || cfg.infiniteAmmo);
    const ms = this.moveState;
    const plan = planShot(
      this.shotState,
      cmd.w,
      cfg,
      commandTimeMs(cmd.seq),
      {
        x: ms.x,
        y: ms.y,
        z: ms.z,
        vx: ms.vx,
        vz: ms.vz,
        onGround: ms.onGround,
        crouching: ms.crouching,
        isSliding: ms.isSliding,
        prone: ms.prone,
        lean: cmd.lean,
        aiming: (cmd.btn & BTN.AIM) !== 0 && !res?.aimCancelled
      },
      cmd.yaw,
      cmd.pitch,
      this.spreadSeed,
      cmd.ss
    );
    this.lastShotPlan = { seq: cmd.seq, ss: cmd.ss, origin: plan.origin, dirs: plan.dirs, spreadAmount: plan.spreadAmount };

    const eyeOrigin = plan.origin;
    const useAnalyticWorld = Array.isArray(this.currentObstacles) && this.currentObstacles.length > 0;
    if (!useAnalyticWorld) {
      if (this.rayTargets.length === 0) {
        this.rebuildHitboxList();
      }
      const maxPlayerDistSq = (cfg.range + 2.5) * (cfg.range + 2.5);
      for (const rp of this.remotePlayers.values()) {
        if (rp.alive && rp.group) {
          const dx = rp.group.position.x - eyeOrigin.x;
          const dy = (rp.group.position.y + 0.9) - eyeOrigin.y;
          const dz = rp.group.position.z - eyeOrigin.z;
          if (dx * dx + dy * dy + dz * dz <= maxPlayerDistSq) {
            rp.group.updateMatrixWorld(true);
          }
        }
      }
      for (let p = 0; p < plan.dirs.length; p++) {
        const dir = plan.dirs[p];
        this.raycaster.ray.origin.set(eyeOrigin.x, eyeOrigin.y, eyeOrigin.z);
        this.raycaster.ray.direction.set(dir.x, dir.y, dir.z);
        this.raycaster.near = 0;
        this.raycaster.far = cfg.range;
        const intersections = this.raycaster.intersectObjects(this.rayTargets, false);

        let endPoint = {
          x: eyeOrigin.x + dir.x * cfg.range,
          y: eyeOrigin.y + dir.y * cfg.range,
          z: eyeOrigin.z + dir.z * cfg.range
        };
        let isPlayerHit = false;
        let hitNormal = null;

        if (intersections.length > 0) {
          const firstHit = intersections[0];
          endPoint = { x: firstHit.point.x, y: firstHit.point.y, z: firstHit.point.z };
          if (firstHit.face) {
            const wn = (this._tmpHitNormal || (this._tmpHitNormal = new THREE.Vector3()))
              .copy(firstHit.face.normal)
              .transformDirection(firstHit.object.matrixWorld);
            hitNormal = { x: wn.x, y: wn.y, z: wn.z };
          }
          isPlayerHit = Boolean(firstHit.object.userData?.playerId);
        }

        if (!isMelee || isPlayerHit) {
          const barrelStart = {
            x: eyeOrigin.x + dir.x * 0.55,
            y: eyeOrigin.y - 0.13 + dir.y * 0.55,
            z: eyeOrigin.z + dir.z * 0.55
          };
          this.spawnTracerEffect(barrelStart, endPoint, cfg.color, isPlayerHit, hitNormal, cmd.ss);
        }
      }
      return plan;
    }

    const candidates = this._candidateRayTargets || (this._candidateRayTargets = []);
    const worldNormal = this._tmpWorldNormal || (this._tmpWorldNormal = { x: 0, y: 1, z: 0 });
    const updatedRps = this._updatedCandidateRps || (this._updatedCandidateRps = new Set());
    updatedRps.clear();

    for (let p = 0; p < plan.dirs.length; p++) {
      const dir = plan.dirs[p];
      const worldDist = this._raycastWorldObstacles(eyeOrigin, dir, cfg.range, worldNormal);
      const searchLimit = worldDist !== null ? worldDist : cfg.range;

      candidates.length = 0;
      if (this.remotePlayers) {
        for (const rp of this.remotePlayers.values()) {
          if (!rp.alive || !rp.group) continue;
          if (this.gameMode === 'tdm' && this.localTeam && rp.team && rp.team === this.localTeam) continue;
          const dx = rp.group.position.x - eyeOrigin.x;
          const dy = (rp.group.position.y + 0.95) - eyeOrigin.y;
          const dz = rp.group.position.z - eyeOrigin.z;
          const proj = dx * dir.x + dy * dir.y + dz * dir.z;
          const clampedProj = proj < 0 ? 0 : (proj > searchLimit ? searchLimit : proj);
          const px = dx - dir.x * clampedProj;
          const py = dy - dir.y * clampedProj;
          const pz = dz - dir.z * clampedProj;
          if (px * px + py * py + pz * pz <= 3.24) {
            if (!updatedRps.has(rp)) {
              updatedRps.add(rp);
              rp.group.updateMatrixWorld(true);
            }
            if (rp.hitboxParts && rp.hitboxParts.length > 0) {
              for (let h = 0; h < rp.hitboxParts.length; h++) candidates.push(rp.hitboxParts[h]);
            } else {
              if (rp.headMesh) candidates.push(rp.headMesh);
              if (rp.torsoMesh) candidates.push(rp.torsoMesh);
              if (rp.leftLeg) candidates.push(rp.leftLeg);
              if (rp.rightLeg) candidates.push(rp.rightLeg);
            }
          }
        }
      }
      if (this.barrelMeshes) {
        for (const b of this.barrelMeshes.values()) {
          if (!b.active || !b.hitboxMesh) continue;
          const dx = (b.group?.position?.x ?? b.x ?? 0) - eyeOrigin.x;
          const dy = ((b.group?.position?.y ?? b.y ?? 0) + 0.65) - eyeOrigin.y;
          const dz = (b.group?.position?.z ?? b.z ?? 0) - eyeOrigin.z;
          const proj = dx * dir.x + dy * dir.y + dz * dir.z;
          const clampedProj = proj < 0 ? 0 : (proj > searchLimit ? searchLimit : proj);
          const px = dx - dir.x * clampedProj;
          const py = dy - dir.y * clampedProj;
          const pz = dz - dir.z * clampedProj;
          if (px * px + py * py + pz * pz <= 1.44) {
            if (!updatedRps.has(b)) {
              updatedRps.add(b);
              b.group?.updateMatrixWorld(true);
            }
            candidates.push(b.hitboxMesh);
          }
        }
      }

      let entityHit = null;
      if (candidates.length > 0) {
        this.raycaster.ray.origin.set(eyeOrigin.x, eyeOrigin.y, eyeOrigin.z);
        this.raycaster.ray.direction.set(dir.x, dir.y, dir.z);
        this.raycaster.near = 0;
        this.raycaster.far = searchLimit;
        const hits = this.raycaster.intersectObjects(candidates, false);
        if (hits.length > 0) entityHit = hits[0];
      }

      let endPoint;
      let isPlayerHit = false;
      let hitNormal = null;

      if (entityHit && entityHit.distance <= searchLimit) {
        endPoint = { x: entityHit.point.x, y: entityHit.point.y, z: entityHit.point.z };
        if (entityHit.face) {
          const wn = (this._tmpHitNormal || (this._tmpHitNormal = new THREE.Vector3()))
            .copy(entityHit.face.normal)
            .transformDirection(entityHit.object.matrixWorld);
          hitNormal = { x: wn.x, y: wn.y, z: wn.z };
        }
        isPlayerHit = Boolean(entityHit.object.userData?.playerId);
      } else if (worldDist !== null) {
        endPoint = {
          x: eyeOrigin.x + dir.x * worldDist,
          y: eyeOrigin.y + dir.y * worldDist,
          z: eyeOrigin.z + dir.z * worldDist
        };
        hitNormal = { x: worldNormal.x, y: worldNormal.y, z: worldNormal.z };
      } else {
        endPoint = {
          x: eyeOrigin.x + dir.x * cfg.range,
          y: eyeOrigin.y + dir.y * cfg.range,
          z: eyeOrigin.z + dir.z * cfg.range
        };
      }

      if (!isMelee || isPlayerHit) {
        const barrelStart = {
          x: eyeOrigin.x + dir.x * 0.55,
          y: eyeOrigin.y - 0.13 + dir.y * 0.55,
          z: eyeOrigin.z + dir.z * 0.55
        };
        this.spawnTracerEffect(barrelStart, endPoint, cfg.color, isPlayerHit, hitNormal, cmd.ss);
      }
    }
    return plan;
  }
}
