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
import { createProceduralEnvironmentMap, buildSkyAndAtmosphere, buildArena } from '../arenaBuilder.js';
import {
  applyDustHdriSky,
  getMapAtmospherePreset,
  getMapEnvironmentIntensity
} from '../arena/skyAtmosphere.js';
import { installStablePCF, isSoftwareWebGLRenderer } from '../arena/shadowFilter.js';
import { WEAPON_MAT_CACHE, createWeaponMesh, setWeaponAdsCulling } from '../weaponModels.js';
import {
  RIG_MAT_CACHE,
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
import {
  applyPbrToSlots,
  applySaltlineWallWeatheringShader,
  applySaltlineWetFloorShader,
  getSurfacePlan,
  revertPbrSlots,
  surfaceSetsForMap
} from '../surfaceMaterials.js';
import { CRATE_MODEL_NAMES, isPropOverrideEnabled } from '../arenaProps.js';
import { applyWeaponAssetOverride, isWeaponOverrideEnabled, measureWeaponGroup } from '../weaponAssetOverrides.js';

export function shadowTypeFor(kind) {
  if (kind === 'pcfsoft') return THREE.PCFSoftShadowMap;
  if (kind === 'pcf') return THREE.PCFShadowMap;
  return THREE.BasicShadowMap;
}

export const DEATH_BODY_MAX_MS = 1500;

// Preload hero 3P tactical operator, its Mixamo clip donor, and primary rifle at boot; secondary weapons load lazily on demand
const CS2_GLB_PRELOAD_PATHS = [
  'models/characters/tactical_operator.glb',
  'models/characters/Soldier.glb',
  'models/cs2/ak47.glb'
];

export class SceneWorldMethods {
  _getEffectiveShadowMapSize(q = this.quality) {
    const base = q?.shadowMapSize || 0;
    if (base <= 0) return 0;
    return isSoftwareWebGLRenderer(this.renderer) ? Math.min(base, 1024) : base;
  }

  _getEffectiveMaxPixelRatio(q = this.quality) {
    const dpr = (typeof window !== 'undefined' ? window.devicePixelRatio : 1) || 1;
    const base = Math.min(dpr, q?.maxPixelRatio || 1);
    return isSoftwareWebGLRenderer(this.renderer) ? Math.min(base, 1.0) : base;
  }

  _getEffectiveTextureTier(q = this.quality) {
    if (!q || !isSoftwareWebGLRenderer(this.renderer)) return q;
    const capped = Math.min(q.textureMaxSize || 1024, 512);
    return capped === q.textureMaxSize ? q : { ...q, textureMaxSize: capped };
  }

  _getShadowExtent(q = this.quality) {
    const mapSize = this._getEffectiveShadowMapSize(q);
    if (mapSize >= 2048) return 40;
    if (mapSize > 0) return 34;
    return (this.arenaHalfSize || 60) + 4;
  }

  _configureDirectionalShadowFrustum(atmo) {
    if (!this.dirLight) return;
    const sunPos = atmo?.sunPos || [78, 80, 62];
    if (!this._shadowSunDir) {
      this._shadowSunDir = new THREE.Vector3();
      this._shadowLightQ = new THREE.Quaternion();
      this._shadowLightQInv = new THREE.Quaternion();
      this._shadowSnapTarget = new THREE.Vector3();
      this._shadowAnchorMat = new THREE.Matrix4();
      this._shadowAnchorOrigin = new THREE.Vector3();
      this._shadowAnchorUp = new THREE.Vector3(0, 1, 0);
    }
    this._shadowSunDir.set(sunPos[0], sunPos[1], sunPos[2]).normalize();
    this._shadowAnchorMat.lookAt(this._shadowSunDir, this._shadowAnchorOrigin, this._shadowAnchorUp);
    this._shadowLightQ.setFromRotationMatrix(this._shadowAnchorMat);
    this._shadowLightQInv.copy(this._shadowLightQ).invert();

    const extent = this._getShadowExtent(this.quality);
    this._shadowExtent = extent;
    this._shadowDistance = 125;
    this._shadowLastTexelX = NaN;
    this._shadowLastTexelY = NaN;

    const cam = this.dirLight.shadow.camera;
    cam.left = -extent;
    cam.right = extent;
    cam.top = extent;
    cam.bottom = -extent;
    cam.near = 20;
    cam.far = 240;
    cam.updateProjectionMatrix();

    this.dirLight.shadow.bias = -0.00008;
    this.dirLight.shadow.normalBias = 0.018;
    this.dirLight.shadow.radius = 1.8;
    this.dirLight.target.position.set(0, 0, 0);
    this.dirLight.position.copy(this._shadowSunDir).multiplyScalar(this._shadowDistance);
    this.dirLight.target.updateMatrixWorld();
    this.dirLight.updateMatrixWorld();
  }

  /**
   * Snaps the directional shadow frustum to shadow-map texel increments in light space around (focusX, focusZ),
   * delivering ~2x sharper shadows with zero strafe shimmer and triggering a shadow pass only when the snapped
   * texel grid coordinate actually changes. Keeps light-space Z = 0 so static shadow depths never crawl.
   * Zero per-frame heap allocations.
   */
  updateDirectionalShadowAnchor(focusX = 0, focusZ = 0, { force = false } = {}) {
    if (!this.dirLight || !this.renderer?.shadowMap?.enabled) return false;
    const mapSize = this.dirLight.shadow.mapSize?.width || this.quality?.shadowMapSize || 0;
    if (mapSize <= 1) return false;
    if (!this._shadowLightQInv || !this._shadowSnapTarget || !this._shadowSunDir) return false;

    const extent = this._shadowExtent || this._getShadowExtent(this.quality);
    const texel = (extent * 2) / mapSize;
    const t = this._shadowSnapTarget;
    t.set(Number(focusX) || 0, 0, Number(focusZ) || 0).applyQuaternion(this._shadowLightQInv);
    const qx = Math.round(t.x / texel);
    const qy = Math.round(t.y / texel);

    if (!force && qx === this._shadowLastTexelX && qy === this._shadowLastTexelY) {
      return false;
    }

    this._shadowLastTexelX = qx;
    this._shadowLastTexelY = qy;

    t.set(qx * texel, qy * texel, 0).applyQuaternion(this._shadowLightQ);
    this.dirLight.target.position.copy(t);
    this.dirLight.position.copy(this._shadowSunDir).multiplyScalar(this._shadowDistance || 125).add(t);
    this.dirLight.target.updateMatrixWorld();
    this.dirLight.updateMatrixWorld();
    this.renderer.shadowMap.needsUpdate = true;
    return true;
  }

  setupLights() {
    // Patch Three.js r170 PCF getShadow() with stable 4-tap Vogel disk + receiver-plane depth bias
    // before any lit material compiles (real hardware WebGL browsers only; skip software rasterizers).
    const isRealWebGL = Boolean(
      this.renderer?.isWebGLRenderer &&
        !this.renderer.__fakeGL &&
        typeof window !== 'undefined' &&
        typeof WebGL2RenderingContext !== 'undefined'
    );
    if (isRealWebGL) {
      const isSoftwareGl = isSoftwareWebGLRenderer(this.renderer);
      if (!isSoftwareGl) {
        installStablePCF({ taps: 4, maxSlope: 3.0, extent: 40, depthRange: 220 });
      } else {
        // Runtime-only VRAM cap on software rasterizers without mutating QUALITY presets
        this.maxPixelRatio = this._getEffectiveMaxPixelRatio(this.quality);
        this.currentPixelRatio = Math.min(this.currentPixelRatio || this.maxPixelRatio, this.maxPixelRatio);
        this.renderer.setPixelRatio?.(this.currentPixelRatio);
      }
      if (!this._webglContextLostBound && typeof this.renderer.domElement?.addEventListener === 'function') {
        this._webglContextLostBound = true;
        this.renderer.domElement.addEventListener('webglcontextlost', (e) => {
          e?.preventDefault?.();
          console.warn('[webgl] context lost');
        });
        this.renderer.domElement.addEventListener('webglcontextrestored', () => {
          console.warn('[webgl] context restored');
          if (this.renderer?.shadowMap) {
            this.renderer.shadowMap.needsUpdate = true;
          }
        });
      }
    }

    this.hemiLight = new THREE.HemisphereLight(0x8aa6cf, 0x7c7464, 0.48);
    this.hemiLight.position.set(0, 75, 0);
    this.hemiLight.layers.enable(1);
    this.scene.add(this.hemiLight);

    // Primary high-contrast raking directional sunlight (11:1 sun-to-shadow ratio on Dust II)
    const effShadowSize = this._getEffectiveShadowMapSize(this.quality);
    this.dirLight = new THREE.DirectionalLight(0xffe6c8, 5.2);
    this.dirLight.position.set(78, 80, 62);
    this.dirLight.castShadow = effShadowSize > 0;
    this.dirLight.shadow.mapSize.width = effShadowSize || 1;
    this.dirLight.shadow.mapSize.height = effShadowSize || 1;
    this.dirLight.layers.enable(1);
    this.scene.add(this.dirLight, this.dirLight.target);
    this._configureDirectionalShadowFrustum({ sunPos: [78, 80, 62] });

    // Subtle cool opposite rim light for silhouette edge separation without flattening key shadows
    this.rimLight = new THREE.DirectionalLight(0x9dbbe0, 0.14);
    this.rimLight.position.set(-58, 44, -46);
    this.rimLight.layers.enable(1);
    this.scene.add(this.rimLight);

    // Central tactical command point light
    this.citadelLight = new THREE.PointLight(0xe5a024, 1.85, 52, 1.3);
    this.citadelLight.position.set(0, 8.5, 0);
    this.citadelLight.layers.enable(1);
    this.scene.add(this.citadelLight);

    // Permanent pooled grenade explosion point light (keeps NUM_POINT_LIGHTS constant to avoid PBR shader recompilation)
    this.explosionLight = new THREE.PointLight(0xf97316, 0, 26, 1.5);
    this.explosionLight.position.set(0, -100, 0);
    this.explosionLight.layers.enable(1);
    this.scene.add(this.explosionLight);
  }

  syncViewmodelLayers() {
    const isRealWebGL = Boolean(
      this.renderer?.isWebGLRenderer &&
        !this.renderer.__fakeGL &&
        typeof window !== 'undefined'
    );

    if (!isRealWebGL) {
      this.camera?.layers?.set?.(0);
      this.viewmodelRig?.traverse?.((obj) => obj.layers?.set?.(0));
      this.viewmodelKeyLight?.layers?.set?.(0);
      this.viewmodelRimLight?.layers?.set?.(0);
      this.viewmodelFillLight?.layers?.set?.(0);
      this.muzzleLight?.layers?.set?.(0);
      return;
    }

    this.camera?.layers?.set?.(0);
    this.vmCamera?.layers?.set?.(1);

    if (this.viewmodelRig) {
      this.viewmodelRig.traverse((obj) => {
        obj.layers?.set?.(1);
      });
    }
    this.viewmodelKeyLight?.layers?.set?.(1);
    this.viewmodelRimLight?.layers?.set?.(1);
    this.viewmodelFillLight?.layers?.set?.(1);
    this.muzzleLight?.layers?.set?.(1);

    for (const light of [
      this.hemiLight,
      this.dirLight,
      this.rimLight,
      this.citadelLight,
      this.explosionLight
    ]) {
      light?.layers?.enable?.(1);
    }
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
    if (Array.isArray(fx.smokeClouds)) {
      if (!this.smokeSpritePool) this.smokeSpritePool = [];
      if (!this.smokeMatPool) this.smokeMatPool = [];
      if (!this.smokeCloudPool) this.smokeCloudPool = [];
      for (let s = 0; s < fx.smokeClouds.length; s++) {
        const sc = fx.smokeClouds[s];
        if (sc.sprite) {
          this.scene.remove(sc.sprite);
          if (this.smokeSpritePool.length < 96) this.smokeSpritePool.push(sc.sprite);
        }
        if (sc.mat) {
          if (this.smokeMatPool.length < 96) this.smokeMatPool.push(sc.mat);
          else sc.mat.dispose?.();
        }
        sc.sprite = null;
        sc.mat = null;
        if (this.smokeCloudPool.length < 96) this.smokeCloudPool.push(sc);
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
        if (obj.material.map && !obj.material.map.userData?.shared) {
          obj.material.map.dispose();
        }
        obj.material.dispose();
      }
    }
    this._skyHdriToken = (this._skyHdriToken || 0) + 1;
    if (this._hdriEnvTarget) {
      this._hdriEnvTarget.dispose?.();
      this._hdriEnvTarget = null;
    }
    this._hdriEnvSource = null;
    this.skyObjects.length = 0;
    this.skyDome = null;
    this.ambientParticles = null;
    this.skySwifts = null;
    this.skySwiftsData = null;
    this.saltlineHarborWater = null;
    this.saltlineArenaDecals = null;
    this.activeEnvMap = null;
    this.scene.environment = null;
    this.harborWaterUniform = null;
    this.skyTimeUniform = null;
    this.wallWeatherMats = [];

    for (const mat of this.arenaMaterials) {
      mat.dispose();
    }
    this.arenaMaterials.clear();

    for (const tex of this.arenaTextures) {
      if (!tex?.userData?.shared) {
        tex.dispose();
      }
    }
    this.arenaTextures.clear();

    this._clearTransientMatchEntities();

    this._pbrToken++;
    this.pbrSlots = [];
    this.propBatchers = [];

    this.clearPickups();
    this.clearJumpPads();
    this.clearBarrels();
    this.clearGrenades();
  }

  _clearTransientMatchEntities() {
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
  }

  /**
   * Resets transient match state (pickups, barrels, grenades, decals, shells, effects, shadow anchor)
   * when entering a match on the already-loaded lobby map without tearing down arena meshes, PBR maps,
   * Poly Haven props, decals, or PMREM cubemaps.
   */
  resetMatchMapState() {
    this._clearTransientMatchEntities();
    this.clearPickups();
    this.clearBarrels();
    this.clearGrenades();
    this.clearDroppedWeapons?.();
    this._lobbyCamInitialized = false;

    const mapCfg = this.currentMapConfig || getMapConfig(this.currentMapId);
    const expectedJumpPads = mapCfg?.jumpPads || [];
    if (expectedJumpPads.length > 0 && (!this.jumpPadMeshes || this.jumpPadMeshes.length !== expectedJumpPads.length)) {
      this.buildJumpPads(expectedJumpPads);
    }
    this.rebuildHitboxList?.();
    if (mapCfg) {
      this.minimap?.setMap?.(mapCfg);
    }
    if (this.dirLight) {
      const focusX = this.position?.x || 0;
      const focusZ = this.position?.z || 0;
      this.updateDirectionalShadowAnchor(focusX, focusZ, { force: true });
    }
    if (this.renderer?.shadowMap) {
      this.renderer.shadowMap.needsUpdate = true;
    }
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
    this.floorMat = null;
    this.needsMapRebuild = false;
    this._lobbyCamInitialized = false;

    const theme = mapCfg.theme || {};
    const atmo = getMapAtmospherePreset(mapCfg.id, theme);
    this.scene.background = new THREE.Color(atmo.bgColor ?? atmo.fogHex);
    this.scene.fog = new THREE.FogExp2(atmo.fogHex, atmo.fogDensity);

    if (this.renderer) {
      this.renderer.toneMapping = THREE.AgXToneMapping ?? THREE.ACESFilmicToneMapping;
      this.renderer.toneMappingExposure = 1.08;
    }

    if (this.citadelLight) {
      this.citadelLight.color.setHex(atmo.citadelColor);
      this.citadelLight.intensity = atmo.citadelIntensity;
      this.citadelLight.layers.enable(1);
    }
    if (this.rimLight) {
      this.rimLight.color.setHex(atmo.rimColor);
      this.rimLight.intensity = atmo.rimIntensity;
      this.rimLight.layers.enable(1);
    }
    if (this.hemiLight) {
      this.hemiLight.color.setHex(atmo.hemiSky);
      this.hemiLight.groundColor.setHex(atmo.hemiGround);
      this.hemiLight.intensity = atmo.hemiIntensity;
      this.hemiLight.layers.enable(1);
    }
    if (this.dirLight) {
      this.dirLight.color.setHex(atmo.dirColor);
      this.dirLight.intensity = atmo.dirIntensity;
      this.dirLight.layers.enable(1);
      this._configureDirectionalShadowFrustum(atmo);
      const focusX = this.inMatch ? (this.position?.x || 0) : 0;
      const focusZ = this.inMatch ? (this.position?.z || 0) : 0;
      this.updateDirectionalShadowAnchor(focusX, focusZ, { force: true });
    }
    this.explosionLight?.layers?.enable?.(1);

    this.buildSkyAndAtmosphere(theme, this.arenaHalfSize);
    this.buildArena(mapCfg);
    if (this.floorMat && this.currentMapId === 'desert_outpost') {
      const effWet = this._effectiveWetFloorStrength(this.quality);
      if (this.floorMat.userData?.wetFloorStrength !== effWet) {
        applySaltlineWetFloorShader(this.floorMat, effWet);
      }
    }
    applyMetalnessCap(this.arenaMaterials, this.quality?.envMapSize === 0 ? 0.35 : null);
    this.buildJumpPads(mapCfg.jumpPads || []);
    this.rebuildHitboxList();
    this.minimap?.setMap(mapCfg);
    this.renderer.shadowMap.needsUpdate = true;
    if (this.assetsEnabled) this.upgradeArenaMaterials();
  }

  /** Loads (cached) Poly Haven maps for the current map and applies them in place; procedural materials are the fallback. */
  async upgradeArenaMaterials() {
    const token = ++this._pbrToken;
    const effTier = this._getEffectiveTextureTier(this.quality);
    const result = await applyPbrToSlots(this, this.assets, effTier, () => token !== this._pbrToken);
    if (token === this._pbrToken) this.callbacks?.onArenaMaterialsUpgraded?.(result);
    return result;
  }

  /** Preloads glTF props (opt-in only), hero CS2 GLBs, HDRI sky (Medium/High), and map PBR texture sets without blocking boot. */
  async preloadAssets(onProgress = this.callbacks?.onAssetProgress) {
    if (!this.assetsEnabled) return 0;
    const allowGlbProps = Boolean(this.quality.glbProps && isPropOverrideEnabled());
    const effTier = this._getEffectiveTextureTier(this.quality);
    const extraJobs = [];
    if (typeof this.assets?.loadAssetGltf === 'function') {
      for (let i = 0; i < CS2_GLB_PRELOAD_PATHS.length; i++) {
        extraJobs.push(this.assets.loadAssetGltf(CS2_GLB_PRELOAD_PATHS[i]).catch(() => null));
      }
    }
    if ((this.quality?.envMapSize ?? 0) > 0 && typeof this.assets?.loadHdri === 'function') {
      extraJobs.push(this.assets.loadHdri('hdri/kloofendal_48d_partly_cloudy_puresky_1k.hdr').catch(() => null));
    }
    const [failures] = await Promise.all([
      this.assets.preload({
        models: allowGlbProps ? CRATE_MODEL_NAMES.slice(0, 1) : [],
        textureSets: surfaceSetsForMap(this.currentMapId),
        tier: effTier,
        onProgress
      }),
      ...extraJobs
    ]);
    const havePropModel = allowGlbProps && this.assets.loadedModels.has('crate-wide');
    if (havePropModel && !this.inMatch) this.loadMap(this.currentMapId);
    else this.upgradeArenaMaterials();
    return failures;
  }

  /**
   * Saltline-inspired GPU shader pre-compilation stage: warms arena PBR/wet-floor + all first-person weapon/hand materials
   * while the player is still in the interactive Lobby, eliminating first-match / first-weapon-switch shader compile hitches.
   * Restores scene & viewmodel visibility synchronously right after kicking off `compileAsync`/`compile` so background
   * parallel compilation never renders stacked viewmodels or overwrites live weapon/match transitions.
   */
  async prewarmShaders(onProgress = null) {
    onProgress?.(0.15);
    if (!this.renderer?.isWebGLRenderer) {
      onProgress?.(1);
      return true;
    }

    await new Promise((r) => setTimeout(r, 8));
    onProgress?.(0.4);

    const prevRigVisible = Boolean(this.viewmodelRig?.visible);
    const savedVmVis = [];
    if (this.viewmodelRig && this.viewmodelMeshes) {
      this.viewmodelRig.visible = true;
      for (const [wId, vm] of Object.entries(this.viewmodelMeshes)) {
        if (!vm) continue;
        savedVmVis.push([wId, vm.visible]);
        vm.visible = true;
      }
    }

    let compilePromise = null;
    try {
      const canVmPrewarm = Boolean(
        this.viewmodelRig &&
          this.vmCamera &&
          typeof this.renderer.getContext === 'function' &&
          !this.renderer.__fakeGL
      );
      if (canVmPrewarm) {
        this.syncViewmodelLayers?.();
      }
      if (typeof this.renderer.compileAsync === 'function') {
        const mainCompile = this.renderer.compileAsync(this.scene, this.camera);
        compilePromise = canVmPrewarm
          ? Promise.all([mainCompile, this.renderer.compileAsync(this.viewmodelRig, this.vmCamera, this.scene)])
          : mainCompile;
      } else if (typeof this.renderer.compile === 'function') {
        this.renderer.compile(this.scene, this.camera);
        if (canVmPrewarm) {
          this.renderer.compile(this.viewmodelRig, this.vmCamera, this.scene);
        }
      }
    } catch {
      // Ignore shader prewarm fallback issues on constrained WebGL drivers
    } finally {
      for (let i = 0; i < savedVmVis.length; i++) {
        const [wId, vis] = savedVmVis[i];
        if (this.viewmodelMeshes[wId]) {
          this.viewmodelMeshes[wId].visible = vis;
        }
      }
      if (this.viewmodelRig) {
        this.viewmodelRig.visible = prevRigVisible;
      }
    }

    if (compilePromise) {
      try {
        await compilePromise;
      } catch {
        // Ignore async parallel shader poll issues on constrained WebGL drivers
      }
    }

    onProgress?.(1);
    return true;
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

    this.maxPixelRatio = this._getEffectiveMaxPixelRatio(q);
    this.currentPixelRatio = this.maxPixelRatio;
    this.renderer.setPixelRatio(this.currentPixelRatio);
    this.lowFpsStreak = 0;
    this.lastPixelRatioChangeAt = -10000;
    this._aoWatchdogFrames = 0;
    this._aoWatchdogLastAt = null;
    this._aoWatchdogLowStreak = 0;
    this.postProcess?.applyQuality?.(q);

    const effShadowSize = this._getEffectiveShadowMapSize(q);
    const shadowsOn = effShadowSize > 0;
    const typeChanged = this.renderer.shadowMap.type !== shadowTypeFor(q.shadowType);
    const enabledChanged = this.renderer.shadowMap.enabled !== shadowsOn;
    this.renderer.shadowMap.enabled = shadowsOn;
    this.renderer.shadowMap.type = shadowTypeFor(q.shadowType);
    if (this.dirLight) {
      this.dirLight.castShadow = shadowsOn;
      const size = effShadowSize || 1;
      if (this.dirLight.shadow.mapSize.width !== size) {
        this.dirLight.shadow.map?.dispose?.();
        this.dirLight.shadow.map = null;
        this.dirLight.shadow.mapSize.set(size, size);
      }
      const atmo = getMapAtmospherePreset(this.currentMapId, this.currentMapConfig?.theme || {});
      this._configureDirectionalShadowFrustum(atmo);
      if (shadowsOn) {
        const focusX = this.inMatch ? (this.position?.x || 0) : (this._lobbyLookTarget?.x || 0);
        const focusZ = this.inMatch ? (this.position?.z || 0) : (this._lobbyLookTarget?.z || 0);
        this.updateDirectionalShadowAnchor(focusX, focusZ, { force: true });
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
    applyMetalnessCap(RIG_MAT_CACHE, cap);
    applyMetalnessCap(WEAPON_MAT_CACHE, cap);
    applyMetalnessCap(this.arenaMaterials, cap);
    applyMetalnessCap(this.camera, cap);
    applyMetalnessCap(this.lobbyShowcaseGroup, cap);
    for (const rp of this.remotePlayers.values()) applyMetalnessCap(rp.group, cap);
    if (this.saltlineHarborWater) this.saltlineHarborWater.visible = q.envMapSize > 0;
    if (this.saltlineArenaDecals) this.saltlineArenaDecals.visible = q.envMapSize > 0;
    if (this.skySwifts) this.skySwifts.visible = q.envMapSize > 0;
    this.syncRemotePlayerShadowCasting?.();
    this._lastDynamicShadowAt = -1000;
    this._hadDynamicShadowCasters = false;
    if (this.floorMat) {
      const effWet = this._effectiveWetFloorStrength(q);
      applySaltlineWetFloorShader(this.floorMat, effWet);
      if (Array.isArray(this.wallWeatherMats)) {
        const wallStrength = effWet > 0 ? Math.min(1, effWet * 1.15) : 0;
        for (let i = 0; i < this.wallWeatherMats.length; i++) {
          applySaltlineWallWeatheringShader(this.wallWeatherMats[i], wallStrength);
        }
      }
    }

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
        if (q.envMapSize === 0) {
          this._skyHdriToken = (this._skyHdriToken || 0) + 1;
          this.scene.environment = null;
          if (typeof this.refreshCs2WeaponEnvMaps === 'function') {
            this.refreshCs2WeaponEnvMaps(null);
          } else if (typeof this.refreshCs2WeaponEnvMap === 'function') {
            this.refreshCs2WeaponEnvMap(null);
          }
        } else if (!this.scene.environment) {
          this.activeEnvMap =
            this.activeEnvMap || createProceduralEnvironmentMap(this, this.currentMapConfig?.theme || {});
          this.scene.environment = this.activeEnvMap;
          if ('environmentIntensity' in this.scene) {
            this.scene.environmentIntensity = getMapEnvironmentIntensity(
              this.currentMapId,
              this.currentMapConfig?.theme || {}
            );
          }
          if (typeof this.refreshCs2WeaponEnvMaps === 'function') {
            this.refreshCs2WeaponEnvMaps(this.activeEnvMap);
          } else if (typeof this.refreshCs2WeaponEnvMap === 'function') {
            this.refreshCs2WeaponEnvMap(this.activeEnvMap);
          }
          void applyDustHdriSky(this, this.skyDome, this.currentMapId);
        }
        revertPbrSlots(this);
        applyMetalnessCap(this.arenaMaterials, cap);
        if (this.assetsEnabled) this.upgradeArenaMaterials();
      }
    }
    this.syncViewmodelLayers?.();
    const info = { choice, tier: this.tier, preset: q, rebuilt, pendingMapRebuild: Boolean(this.needsMapRebuild) };
    this.callbacks?.onQualityChanged?.(info);
    return info;
  }

  _effectiveWetFloorStrength(q = this.quality) {
    const baseWet = q?.wetFloorStrength || 0;
    if (baseWet <= 0) return 0;
    const plan = getSurfacePlan(this.currentMapId);
    const isArid = this.currentMapId === 'desert_outpost' || plan.floor?.set === 'dirt_floor';
    return isArid ? baseWet * 0.28 : baseWet;
  }

  buildSkyAndAtmosphere(theme = {}, halfSize = 60) {
    buildSkyAndAtmosphere(this, theme, halfSize);
  }

  buildArena(mapCfg = this.currentMapConfig) {
    buildArena(this, mapCfg);
  }

  syncPickups(pickupsData = []) {
    if (!pickupsData || pickupsData.length === 0) {
      if (this.pickupMeshes.size > 0) this.clearPickups();
      return;
    }
    if (this.pickupMeshes.size > 0) {
      const firstId = pickupsData[0].id;
      const existing = this.pickupMeshes.get(firstId);
      if (
        this.pickupMeshes.size !== pickupsData.length ||
        !existing ||
        Math.abs(existing.x - pickupsData[0].x) > 0.5 ||
        Math.abs(existing.z - pickupsData[0].z) > 0.5
      ) {
        this.clearPickups();
      }
    }
    for (let i = 0; i < pickupsData.length; i++) {
      const p = pickupsData[i];
      let item = this.pickupMeshes.get(p.id);
      if (!item) {
        const pType = p.type || 'health';
        const pColors = pType === 'armor'
          ? { main: 0x38bdf8, emissive: 0x0284c7 }
          : pType === 'speed'
            ? { main: 0xf59e0b, emissive: 0xd97706 }
            : pType === 'damage'
              ? { main: 0xec4899, emissive: 0xdb2777 }
              : { main: 0x22c55e, emissive: 0x16a34a };
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
    const isDustMap = this.currentMapId === 'desert_outpost';
    for (const jp of jumpPads) {
      const group = new THREE.Group();
      group.position.set(jp.x || 0, jp.y || 0, jp.z || 0);

      const discGeo = new THREE.CylinderGeometry(1.18, 1.32, 0.16, 20);
      const discMat = new THREE.MeshStandardMaterial(
        isDustMap
          ? {
              color: 0x3b3328,
              emissive: 0xb87324,
              emissiveIntensity: 0.36,
              metalness: 0.55,
              roughness: 0.58
            }
          : {
              color: 0x083344,
              emissive: 0x06b6d4,
              emissiveIntensity: 0.85,
              metalness: 0.65,
              roughness: 0.2
            }
      );
      const discMesh = new THREE.Mesh(discGeo, discMat);
      discMesh.position.y = 0.08;
      group.add(discMesh);

      const ringGeo = new THREE.RingGeometry(0.68, 0.96, 24);
      const ringMat1 = new THREE.MeshBasicMaterial({
        color: isDustMap ? 0xe5a024 : 0x38bdf8,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: isDustMap ? 0.55 : 0.8,
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
    if (!barrelsData || barrelsData.length === 0) {
      if (this.barrelMeshes.size > 0) {
        this.clearBarrels();
        this.rebuildHitboxList();
      }
      return;
    }
    let changed = false;
    if (
      this.barrelMeshes.size > 0 &&
      (this.barrelMeshes.size !== barrelsData.length || !this.barrelMeshes.has(barrelsData[0]?.id))
    ) {
      this.clearBarrels();
      changed = true;
    }
    for (let i = 0; i < barrelsData.length; i++) {
      const b = barrelsData[i];
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
    const existingCount = this.droppedWeaponMeshes.size;
    if ((!drops || drops.length === 0) && existingCount === 0) return;
    if (drops && drops.length === existingCount) {
      let allMatch = true;
      for (let i = 0; i < drops.length; i++) {
        const id = drops[i]?.id;
        if (!id || !this.droppedWeaponMeshes.has(id)) {
          allMatch = false;
          break;
        }
      }
      if (allMatch) return;
    }
    if (!this._seenDropIds) {
      this._seenDropIds = new Set();
    }
    const seen = this._seenDropIds;
    seen.clear();
    let addedAny = false;
    for (let i = 0; i < drops.length; i++) {
      const d = drops[i];
      if (!d || !d.id) continue;
      seen.add(d.id);
      if (!this.droppedWeaponMeshes.has(d.id)) {
        this.addDroppedWeapon(d);
        addedAny = true;
      }
    }
    if (!addedAny && seen.size === existingCount) return;
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
