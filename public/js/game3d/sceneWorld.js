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

export class SceneWorldMethods {
  setupLights() {
    this.hemiLight = new THREE.HemisphereLight(0xdbeafe, 0x566578, 1.3);
    this.hemiLight.position.set(0, 75, 0);
    this.scene.add(this.hemiLight);

    // Primary warm directional sunlight with static baked shadow map covering the arena
    this.dirLight = new THREE.DirectionalLight(0xfff7eb, 2.6);
    this.dirLight.position.set(56, 86, 46);
    this.dirLight.castShadow = this.quality.shadowMapSize > 0;
    this.dirLight.shadow.mapSize.width = this.quality.shadowMapSize || 1;
    this.dirLight.shadow.mapSize.height = this.quality.shadowMapSize || 1;
    this.dirLight.shadow.camera.near = 5;
    this.dirLight.shadow.camera.far = 230;
    const d = 68;
    this.dirLight.shadow.camera.left = -d;
    this.dirLight.shadow.camera.right = d;
    this.dirLight.shadow.camera.top = d;
    this.dirLight.shadow.camera.bottom = -d;
    this.dirLight.shadow.bias = -0.00035;
    this.dirLight.shadow.normalBias = 0.024;
    this.scene.add(this.dirLight);

    // Cool steel rim light from opposite angle for smooth 3D wrap-around shading & specular highlights
    this.rimLight = new THREE.DirectionalLight(0x93c5fd, 1.38);
    this.rimLight.position.set(-58, 52, -52);
    this.scene.add(this.rimLight);

    // Central tactical command point light
    this.citadelLight = new THREE.PointLight(0xe5a024, 2.85, 52, 1.3);
    this.citadelLight.position.set(0, 8.5, 0);
    this.scene.add(this.citadelLight);

    // Permanent pooled grenade explosion point light (keeps NUM_POINT_LIGHTS constant to avoid PBR shader recompilation)
    this.explosionLight = new THREE.PointLight(0xf97316, 0, 26, 1.5);
    this.explosionLight.position.set(0, -100, 0);
    this.scene.add(this.explosionLight);
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
      for (let p = 0; p < fx.particles.length; p++) {
        const pt = fx.particles[p];
        const pm = pt.mesh;
        this.scene.remove(pm);
        if (this.sparkMeshPool && this.sparkMeshPool.length < 64) {
          this.sparkMeshPool.push(pm);
        }
        if (this.tracerParticlePool && this.tracerParticlePool.length < 64) {
          this.tracerParticlePool.push(pt);
        }
      }
      fx.particles.length = 0;
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

  disposeMapResources() {
    for (const m of this.worldMeshes) {
      this.scene.remove(m);
      m.geometry?.dispose();
    }
    this.worldMeshes.length = 0;

    for (const m of this.arenaDecorMeshes) {
      this.scene.remove(m);
      if (m.isInstancedMesh) {
        m.dispose?.();
      } else {
        m.geometry?.dispose();
      }
    }
    this.arenaDecorMeshes.length = 0;
    this.citadelRings.length = 0;

    for (const geo of this.arenaGeometries) {
      geo.dispose();
    }
    this.arenaGeometries.clear();

    for (const obj of this.skyObjects) {
      this.scene.remove(obj);
      obj.geometry?.dispose();
      if (obj.material) {
        if (obj.material.map) obj.material.map.dispose();
        obj.material.dispose();
      }
    }
    this.skyObjects.length = 0;
    this.ambientParticles = null;

    for (const mat of this.arenaMaterials) {
      mat.dispose();
    }
    this.arenaMaterials.clear();

    for (const tex of this.arenaTextures) {
      tex.dispose();
    }
    this.arenaTextures.clear();

    // Clear transient map-bound decals, shells, and effects on map switch
    if (Array.isArray(this.bulletDecals)) {
      for (let i = 0; i < this.bulletDecals.length; i++) {
        this.scene.remove(this.bulletDecals[i]);
      }
      this.bulletDecals.length = 0;
    }
    if (Array.isArray(this.activeShells)) {
      for (let i = 0; i < this.activeShells.length; i++) {
        const sh = this.activeShells[i];
        this.scene.remove(sh.mesh);
        if (this.shellMeshPool && this.shellMeshPool.length < 32) {
          this.shellMeshPool.push(sh.mesh);
        }
        if (this.shellPool && this.shellPool.length < 32) {
          this.shellPool.push(sh);
        }
      }
      this.activeShells.length = 0;
    }
    if (Array.isArray(this.activeEffects)) {
      for (let i = this.activeEffects.length - 1; i >= 0; i--) {
        const fx = this.activeEffects[i];
        if (fx.type === 'popup') {
          fx.sprite.visible = false;
          if (!this.damagePopupPool) this.damagePopupPool = [];
          this.damagePopupPool.push(fx);
        } else if (fx.type === 'explosion') {
          this._recycleExplosionEffect(fx);
        } else {
          this._recycleTracerEffect(fx);
        }
      }
      this.activeEffects.length = 0;
    }
    if (this.explosionLight) {
      this.explosionLight.intensity = 0;
    }

    this._pbrToken++;
    this.pbrSlots = [];
    this.propBatchers = [];

    this.clearPickups();
    this.clearJumpPads();
    this.clearBarrels();
    this.clearGrenades();
  }

  clearPickups() {
    for (const item of this.pickupMeshes.values()) {
      this.scene.remove(item.group);
      item.group.traverse((obj) => {
        if (obj.isMesh) {
          obj.geometry?.dispose();
          obj.material?.dispose();
        }
      });
    }
    this.pickupMeshes.clear();
  }

  loadMap(mapId = DEFAULT_MAP_ID) {
    const mapCfg = getMapConfig(mapId);
    this.currentMapId = mapCfg.id;
    this.currentMapConfig = mapCfg;
    this.currentObstacles = mapCfg.obstacles;
    this.arenaHalfSize = mapCfg.arenaHalfSize || MATCH_CONFIG.ARENA_HALF_SIZE;

    this.disposeMapResources();
    this.needsMapRebuild = false;

    const theme = mapCfg.theme || {};
    const isDesert = theme.floorBase === '#27170c';
    const fogHex = isDesert ? 0x453528 : 0x1e2c3e;
    this.scene.background = new THREE.Color(fogHex);
    this.scene.fog = new THREE.FogExp2(fogHex, (theme.fogDensity || 0.004) * 0.42);

    if (this.citadelLight) {
      this.citadelLight.color.setHex(isDesert ? 0xf59e0b : 0xe5a024);
      this.citadelLight.intensity = 2.85;
    }
    if (this.rimLight) {
      this.rimLight.color.setHex(isDesert ? 0xe2b887 : 0x93c5fd);
      this.rimLight.intensity = 1.38;
    }
    if (this.hemiLight) {
      this.hemiLight.color.setHex(isDesert ? 0xfff3c4 : 0xdbeafe);
      this.hemiLight.groundColor.setHex(isDesert ? 0x7c654d : 0x566578);
      this.hemiLight.intensity = 1.88;
    }
    if (this.dirLight) {
      this.dirLight.color.setHex(isDesert ? 0xfff0d4 : 0xfff7eb);
      this.dirLight.intensity = 2.25;
      const d = this.arenaHalfSize + 6;
      this.dirLight.shadow.camera.left = -d;
      this.dirLight.shadow.camera.right = d;
      this.dirLight.shadow.camera.top = d;
      this.dirLight.shadow.camera.bottom = -d;
      this.dirLight.shadow.camera.updateProjectionMatrix();
    }

    this.buildSkyAndAtmosphere(theme, this.arenaHalfSize);
    this.buildArena(mapCfg);
    this.buildJumpPads(mapCfg.jumpPads || []);
    this.rebuildHitboxList();
    this.minimap?.setMap(mapCfg);
    this.renderer.shadowMap.needsUpdate = true;
    if (this.assetsEnabled) this.upgradeArenaMaterials();
  }

  /** Loads (cached) Poly Haven maps for the current map and applies them in place; procedural materials are the fallback. */
  async upgradeArenaMaterials() {
    const token = ++this._pbrToken;
    const result = await applyPbrToSlots(this, this.assets, this.quality, () => token !== this._pbrToken);
    if (token === this._pbrToken) this.callbacks?.onArenaMaterialsUpgraded?.(result);
    return result;
  }

  /** Preloads glTF props + the texture sets of the current map; rebuilds the idle lobby map once props are ready. */
  async preloadAssets(onProgress = this.callbacks?.onAssetProgress) {
    if (!this.assetsEnabled) return 0;
    const failures = await this.assets.preload({
      models: this.quality.glbProps ? CRATE_MODEL_NAMES.slice(0, 1) : [],
      textureSets: surfaceSetsForMap(this.currentMapId),
      tier: this.quality,
      onProgress
    });
    const havePropModel = this.quality.glbProps && this.assets.loadedModels.has('crate-wide');
    if (havePropModel && !this.inMatch) this.loadMap(this.currentMapId);
    else this.upgradeArenaMaterials();
    return failures;
  }

  /**
   * Applies a quality choice ('auto' | 'low' | 'medium' | 'high'). Renderer settings, shadows, camera far, decal limits and
   * PBR maps update immediately; geometry detail / glTF props / env-map need a map rebuild (done right away in the lobby,
   * otherwise at the next map load). MSAA (antialias) only changes when the page is reloaded.
   */
  applyQuality(choice = 'auto', { persist = true } = {}) {
    this.qualityChoice = choice;
    if (persist) saveQualityChoice(choice);
    const prevTier = this.tier;
    this.tier = resolveTier(choice, this.detectedTier);
    this.quality = QUALITY[this.tier];
    const q = this.quality;

    this.maxPixelRatio = Math.min(window.devicePixelRatio || 1, q.maxPixelRatio);
    this.currentPixelRatio = this.maxPixelRatio;
    this.renderer.setPixelRatio(this.currentPixelRatio);
    this.lowFpsStreak = 0;

    const shadowsOn = q.shadowMapSize > 0;
    const typeChanged = this.renderer.shadowMap.type !== shadowTypeFor(q.shadowType);
    const enabledChanged = this.renderer.shadowMap.enabled !== shadowsOn;
    this.renderer.shadowMap.enabled = shadowsOn;
    this.renderer.shadowMap.type = shadowTypeFor(q.shadowType);
    if (this.dirLight) {
      this.dirLight.castShadow = shadowsOn;
      const size = q.shadowMapSize || 1;
      if (this.dirLight.shadow.mapSize.width !== size) {
        this.dirLight.shadow.map?.dispose?.();
        this.dirLight.shadow.map = null;
        this.dirLight.shadow.mapSize.set(size, size);
      }
    }
    this.renderer.shadowMap.needsUpdate = true;
    this.camera.far = q.cameraFar;
    this.camera.updateProjectionMatrix();

    this.maxBulletDecals = q.maxBulletDecals;
    while (this.bulletDecals.length > this.maxBulletDecals) {
      const d = this.bulletDecals.shift();
      this.scene.remove(d);
    }
    if (this.ambientParticles) this.ambientParticles.visible = q.ambientParticles > 0;

    const cap = q.envMapSize === 0 ? 0.35 : null;
    applyMetalnessCap(this.camera, cap);
    applyMetalnessCap(this.lobbyShowcaseGroup, cap);
    for (const rp of this.remotePlayers.values()) applyMetalnessCap(rp.group, cap);

    if (typeChanged || enabledChanged) {
      this.scene.traverse((o) => {
        const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
        for (const m of mats) m.needsUpdate = true;
      });
    }

    let rebuilt = false;
    if (prevTier !== this.tier || this.needsMapRebuild) {
      if (!this.inMatch) {
        this.needsMapRebuild = false;
        this.loadMap(this.currentMapId);
        rebuilt = true;
      } else {
        this.needsMapRebuild = true;
        revertPbrSlots(this);
        if (this.assetsEnabled) this.upgradeArenaMaterials();
      }
    }
    const info = { choice, tier: this.tier, preset: q, rebuilt, pendingMapRebuild: Boolean(this.needsMapRebuild) };
    this.callbacks?.onQualityChanged?.(info);
    return info;
  }

  buildSkyAndAtmosphere(theme = {}, halfSize = 60) {
    buildSkyAndAtmosphere(this, theme, halfSize);
  }

  buildArena(mapCfg = this.currentMapConfig) {
    buildArena(this, mapCfg);
  }

  syncPickups(pickupsData = []) {
    if (pickupsData.length > 0 && this.pickupMeshes.size > 0) {
      const firstId = pickupsData[0].id;
      const existing = this.pickupMeshes.get(firstId);
      if (!existing || Math.hypot(existing.group.position.x - pickupsData[0].x, existing.group.position.z - pickupsData[0].z) > 0.5) {
        this.clearPickups();
      }
    }
    for (const p of pickupsData) {
      let item = this.pickupMeshes.get(p.id);
      const pType = p.type || 'health';
      const pColors = pType === 'armor'
        ? { main: 0x38bdf8, emissive: 0x0284c7 }
        : pType === 'speed'
          ? { main: 0xf59e0b, emissive: 0xd97706 }
          : pType === 'damage'
            ? { main: 0xec4899, emissive: 0xdb2777 }
            : { main: 0x22c55e, emissive: 0x16a34a };
      if (!item) {
        const group = new THREE.Group();
        group.position.set(p.x, p.y, p.z);

        const outerBaseGeo = new THREE.CylinderGeometry(1.38, 1.52, 0.14, 8);
        const outerBaseMat = new THREE.MeshStandardMaterial({
          color: 0x1e293b,
          metalness: 0.75,
          roughness: 0.35
        });
        const outerBase = new THREE.Mesh(outerBaseGeo, outerBaseMat);
        outerBase.position.y = 0.07;
        group.add(outerBase);

        const padGeo = new THREE.CylinderGeometry(1.05, 1.18, 0.18, 16);
        const padMat = new THREE.MeshStandardMaterial({
          color: 0x0f172a,
          emissive: pColors.emissive,
          emissiveIntensity: 0.55,
          metalness: 0.6,
          roughness: 0.25
        });
        const padMesh = new THREE.Mesh(padGeo, padMat);
        padMesh.position.y = 0.12;
        group.add(padMesh);

        const clawGeo = new THREE.BoxGeometry(0.22, 0.38, 0.36);
        for (let c = 0; c < 4; c++) {
          const ang = (c / 4) * Math.PI * 2 + Math.PI / 4;
          const claw = new THREE.Mesh(clawGeo, outerBaseMat);
          claw.position.set(Math.cos(ang) * 1.25, 0.22, Math.sin(ang) * 1.25);
          claw.rotation.y = -ang + Math.PI / 2;
          claw.rotation.x = 0.35;
          group.add(claw);
        }

        const holoRingGeo = new THREE.RingGeometry(0.78, 1.08, 24);
        const holoRingMat = new THREE.MeshBasicMaterial({
          color: pColors.main,
          side: THREE.DoubleSide,
          transparent: true,
          opacity: 0.72,
          depthWrite: false,
          polygonOffset: true,
          polygonOffsetFactor: -2,
          polygonOffsetUnits: -2
        });
        const holoRing = new THREE.Mesh(holoRingGeo, holoRingMat);
        holoRing.rotation.x = -Math.PI / 2;
        holoRing.position.y = 0.23;
        group.add(holoRing);

        const crossGroup = new THREE.Group();
        const barMat = new THREE.MeshStandardMaterial({
          color: pColors.main,
          emissive: pColors.emissive,
          emissiveIntensity: 0.8,
          roughness: 0.2,
          metalness: 0.3
        });
        const trimMat = new THREE.MeshStandardMaterial({
          color: 0xf8fafc,
          metalness: 0.85,
          roughness: 0.2
        });
        const vBar = new THREE.Mesh(new THREE.BoxGeometry(0.38, 1.12, 0.38), barMat);
        const hBar = new THREE.Mesh(new THREE.BoxGeometry(1.12, 0.38, 0.38), barMat);
        const dBar = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.38, 0.92), barMat);
        const coreCrystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.36, 0), trimMat);
        const orbitRing = new THREE.Mesh(
          new THREE.TorusGeometry(0.72, 0.035, 8, 24),
          holoRingMat
        );
        crossGroup.add(vBar, hBar, dBar, coreCrystal, orbitRing);
        crossGroup.position.y = 1.25;
        group.add(crossGroup);

        const isActive = Boolean(p.active);
        crossGroup.visible = isActive;
        holoRing.visible = isActive;
        padMat.emissiveIntensity = isActive ? 0.55 : 0.05;
        this.scene.add(group);
        item = { group, crossGroup, padMat, holoRing, type: pType, x: p.x, y: p.y, z: p.z, active: isActive };
        this.pickupMeshes.set(p.id, item);
      } else {
        if (item.x !== p.x || item.y !== p.y || item.z !== p.z) {
          item.x = p.x;
          item.y = p.y;
          item.z = p.z;
          item.group.position.set(p.x, p.y, p.z);
        }
        const isActive = Boolean(p.active);
        if (item.active !== isActive) {
          item.active = isActive;
          item.crossGroup.visible = isActive;
          item.holoRing.visible = isActive;
          item.padMat.emissiveIntensity = isActive ? 0.55 : 0.05;
        }
      }
    }
  }

  updatePickupSingle(pickupId, active) {
    const item = this.pickupMeshes.get(pickupId);
    if (item) {
      item.active = Boolean(active);
      item.crossGroup.visible = Boolean(active);
      item.holoRing.visible = Boolean(active);
      item.padMat.emissiveIntensity = active ? 0.5 : 0.05;
    }
  }

  clearJumpPads() {
    for (const jp of this.jumpPadMeshes) {
      this.scene.remove(jp.group);
      jp.group.traverse((obj) => {
        if (obj.isMesh) {
          obj.geometry?.dispose();
          obj.material?.dispose();
        }
      });
    }
    this.jumpPadMeshes.length = 0;
  }

  buildJumpPads(jumpPads = []) {
    this.clearJumpPads();
    for (const jp of jumpPads) {
      const group = new THREE.Group();
      group.position.set(jp.x || 0, jp.y || 0, jp.z || 0);

      const discGeo = new THREE.CylinderGeometry(1.18, 1.32, 0.16, 20);
      const discMat = new THREE.MeshStandardMaterial({
        color: 0x083344,
        emissive: 0x06b6d4,
        emissiveIntensity: 0.85,
        metalness: 0.65,
        roughness: 0.2
      });
      const discMesh = new THREE.Mesh(discGeo, discMat);
      discMesh.position.y = 0.08;
      group.add(discMesh);

      const ringGeo = new THREE.RingGeometry(0.68, 0.96, 24);
      const ringMat1 = new THREE.MeshBasicMaterial({
        color: 0x38bdf8,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.8,
        depthWrite: false
      });
      const ring1 = new THREE.Mesh(ringGeo, ringMat1);
      ring1.rotation.x = -Math.PI / 2;
      ring1.position.y = 0.28;
      group.add(ring1);

      this.scene.add(group);
      this.jumpPadMeshes.push({
        id: jp.id,
        group,
        ring1,
        ring2: null,
        ringMat1,
        ringMat2: null,
        x: jp.x || 0,
        y: jp.y || 0,
        z: jp.z || 0
      });
    }
  }

  clearBarrels() {
    for (const item of this.barrelMeshes.values()) {
      this.scene.remove(item.group);
      item.group.traverse((obj) => {
        if (obj.isMesh) {
          obj.geometry?.dispose();
          obj.material?.dispose();
        }
      });
    }
    this.barrelMeshes.clear();
  }

  syncBarrels(barrelsData = []) {
    let changed = false;
    for (const b of barrelsData) {
      let item = this.barrelMeshes.get(b.id);
      const bx = b.x || 0;
      const by = b.y || 0;
      const bz = b.z || 0;
      const isActive = Boolean(b.active !== false);
      if (!item) {
        const group = new THREE.Group();
        group.position.set(bx, by, bz);

        const padGeo = new THREE.CylinderGeometry(0.68, 0.76, 0.08, 16);
        const padMat = new THREE.MeshStandardMaterial({
          color: 0x1e293b,
          emissive: 0xef4444,
          emissiveIntensity: isActive ? 0.55 : 0.06,
          roughness: 0.4,
          metalness: 0.6
        });
        const padMesh = new THREE.Mesh(padGeo, padMat);
        padMesh.position.y = 0.04;
        group.add(padMesh);

        const bodyGroup = new THREE.Group();
        bodyGroup.visible = isActive;
        const barrelGeo = new THREE.CylinderGeometry(0.55, 0.55, 1.35, 16);
        barrelGeo.computeBoundingSphere();
        const barrelMat = new THREE.MeshStandardMaterial({
          color: 0xdc2626,
          emissive: 0x7f1d1d,
          emissiveIntensity: 0.35,
          roughness: 0.38,
          metalness: 0.55
        });
        const hitboxMesh = new THREE.Mesh(barrelGeo, barrelMat);
        hitboxMesh.position.y = 0.675;
        hitboxMesh.userData.barrelId = b.id;
        bodyGroup.add(hitboxMesh);

        const stripeGeo = new THREE.CylinderGeometry(0.565, 0.565, 0.14, 16);
        const stripeMat = new THREE.MeshStandardMaterial({
          color: 0xfacc15,
          emissive: 0xd97706,
          emissiveIntensity: 0.45,
          roughness: 0.3,
          metalness: 0.4
        });
        const stripeLow = new THREE.Mesh(stripeGeo, stripeMat);
        stripeLow.position.y = 0.42;
        const stripeHigh = new THREE.Mesh(stripeGeo.clone(), stripeMat.clone());
        stripeHigh.position.y = 0.93;
        bodyGroup.add(stripeLow, stripeHigh);

        group.add(bodyGroup);
        this.scene.add(group);

        item = {
          id: b.id,
          group,
          bodyGroup,
          hitboxMesh,
          barrelMat,
          padMat,
          x: bx,
          y: by,
          z: bz,
          hp: b.hp ?? (MATCH_CONFIG.BARREL_MAX_HP || 60),
          active: isActive
        };
        this.barrelMeshes.set(b.id, item);
        changed = true;
      } else {
        if (item.x !== bx || item.y !== by || item.z !== bz) {
          item.x = bx;
          item.y = by;
          item.z = bz;
          item.group.position.set(bx, by, bz);
          changed = true;
        }
        if (typeof b.hp === 'number') item.hp = b.hp;
        if (item.active !== isActive) {
          item.active = isActive;
          item.bodyGroup.visible = isActive;
          item.padMat.emissiveIntensity = isActive ? 0.55 : 0.06;
          changed = true;
        }
      }
    }
    if (changed) {
      this.rebuildHitboxList();
    }
  }

  updateBarrelSingle(data) {
    if (!data || !data.id) return;
    const item = this.barrelMeshes.get(data.id);
    if (!item) return;
    if (typeof data.hp === 'number') item.hp = data.hp;
    if (typeof data.active === 'boolean' && item.active !== data.active) {
      item.active = data.active;
      item.bodyGroup.visible = data.active;
      item.padMat.emissiveIntensity = data.active ? 0.55 : 0.06;
      this.rebuildHitboxList();
    }
  }

  onBarrelExploded(data) {
    if (!data) return;
    if (data.id) {
      this.updateBarrelSingle({ id: data.id, hp: 0, active: false });
    }
    this.spawnGrenadeExplosion({
      id: data.id ? `barrel_${data.id}` : undefined,
      x: data.x ?? 0,
      y: (data.y ?? 0) + 0.65,
      z: data.z ?? 0,
      radius: data.radius || (MATCH_CONFIG.BARREL_EXPLOSION_RADIUS || 6.5)
    });
  }

  clearDroppedWeapons() {
    for (const item of this.droppedWeaponMeshes.values()) {
      this.scene.remove(item.group);
      item.group.traverse((obj) => {
        if (obj.isMesh) {
          if (!obj.geometry?.userData?.shared) obj.geometry?.dispose();
          if (Array.isArray(obj.material)) obj.material.forEach((m) => !m.userData?.shared && m.dispose());
          else if (!obj.material?.userData?.shared) obj.material?.dispose();
        }
      });
    }
    this.droppedWeaponMeshes.clear();
    if (this.nearbyDrop) {
      this.nearbyDrop = null;
      this.callbacks.onNearbyWeaponChange?.(null, 0);
    }
  }

  syncDroppedWeapons(drops = []) {
    if ((!drops || drops.length === 0) && this.droppedWeaponMeshes.size === 0) return;
    if (!this._seenDropIds) {
      this._seenDropIds = new Set();
    }
    const seen = this._seenDropIds;
    seen.clear();
    for (let i = 0; i < drops.length; i++) {
      const d = drops[i];
      if (!d || !d.id) continue;
      seen.add(d.id);
      if (!this.droppedWeaponMeshes.has(d.id)) {
        this.addDroppedWeapon(d);
      }
    }
    for (const id of this.droppedWeaponMeshes.keys()) {
      if (!seen.has(id)) {
        this.removeDroppedWeapon(id);
      }
    }
  }

  addDroppedWeapon(drop) {
    if (!drop || !drop.id || !WEAPONS[drop.weapon]) return;
    if (this.droppedWeaponMeshes.has(drop.id)) {
      this.removeDroppedWeapon(drop.id);
    }

    const cfg = WEAPONS[drop.weapon];
    const group = new THREE.Group();
    group.position.set(drop.x || 0, (drop.y || 0) + 0.02, drop.z || 0);

    const ringGeo = new THREE.RingGeometry(0.45, 0.58, 24);
    const ringMat = new THREE.MeshBasicMaterial({
      color: cfg.color || 0x38bdf8,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2
    });
    const ringMesh = new THREE.Mesh(ringGeo, ringMat);
    ringMesh.rotation.x = -Math.PI / 2;
    ringMesh.position.y = 0.03;
    group.add(ringMesh);

    const gunSpinGroup = new THREE.Group();
    gunSpinGroup.position.y = 0.36;
    const gunMesh = this.createShowcaseWeaponMesh(drop.weapon);
    gunMesh.scale.setScalar(1.22);
    gunMesh.rotation.z = 0.32;
    gunSpinGroup.add(gunMesh);
    group.add(gunSpinGroup);

    this.scene.add(group);
    const now = performance.now();
    const ttlMs = MATCH_CONFIG.DROPPED_WEAPON_DESPAWN_MS || 5000;
    this.droppedWeaponMeshes.set(drop.id, {
      id: drop.id,
      weapon: drop.weapon,
      ammo: drop.ammo ?? 0,
      reserveAmmo: drop.reserveAmmo ?? 0,
      x: drop.x || 0,
      y: drop.y || 0,
      z: drop.z || 0,
      group,
      gunSpinGroup,
      ringMat,
      localExpiresAt: now + ttlMs
    });
  }

  removeDroppedWeapon(dropId) {
    const item = this.droppedWeaponMeshes.get(dropId);
    if (!item) return;
    this.scene.remove(item.group);
    item.group.traverse((obj) => {
      if (obj.isMesh) {
        if (!obj.geometry?.userData?.shared) obj.geometry?.dispose();
        if (Array.isArray(obj.material)) obj.material.forEach((m) => !m.userData?.shared && m.dispose());
        else if (!obj.material?.userData?.shared) obj.material?.dispose();
      }
    });
    this.droppedWeaponMeshes.delete(dropId);
    if (this.nearbyDrop && this.nearbyDrop.id === dropId) {
      this.nearbyDrop = null;
      this.callbacks.onNearbyWeaponChange?.(null, 0);
    }
  }
}
