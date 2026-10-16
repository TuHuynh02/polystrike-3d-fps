import * as THREE from '../vendor/three/three.module.js';
import {
  DEFAULT_MAP_ID,
  MATCH_CONFIG,
  WEAPONS,
  WEAPON_ORDER,
  getEffectiveFireRateMs,
  getMapConfig,
  stepGrenade
} from '../shared/constants.js';
import { FIXED_DT, createMovementState } from '../shared/movement.js';
import { BTN, commandTimeMs, isFireIntervalOk, isValidMoveAck, stepCommand } from '../shared/netcode.js';
import { computeSpreadAmount, createShotState, planShot, resetShotState } from '../shared/spread.js';
import { ClientPrediction, INPUT_BATCH_INTERVAL_MS } from './prediction.js';
import { SnapshotInterpolator } from './snapshotBuffer.js';
import { buildSkyAndAtmosphere, buildArena } from './arenaBuilder.js';
import { createWeaponMesh, setWeaponAdsCulling } from './weaponModels.js';
import {
  createPlayerNameSprite,
  createRemotePlayerMesh,
  animateHumanoidRig,
  disposeObject3D
} from './humanoidRig.js';
import { TacticalMinimap } from './minimap.js';
import { sfx } from './audio.js';
import {
  PerfOverlay,
  QUALITY,
  applyMetalnessCap,
  detectInitialTier,
  isPerfOverlayRequested,
  loadQualityChoice,
  resolveTier,
  saveQualityChoice
} from './quality.js';
import { getAssetManager } from './assets.js';
import { applyPbrToSlots, revertPbrSlots, surfaceSetsForMap } from './surfaceMaterials.js';
import { CRATE_MODEL_NAMES } from './arenaProps.js';
import { applyWeaponAssetOverride, isWeaponOverrideEnabled, measureWeaponGroup } from './weaponAssetOverrides.js';

function shadowTypeFor(kind) {
  if (kind === 'pcfsoft') return THREE.PCFSoftShadowMap;
  if (kind === 'pcf') return THREE.PCFShadowMap;
  return THREE.BasicShadowMap;
}

export class Game3D {
  constructor(container, callbacks) {
    this.container = container;
    this.callbacks = callbacks;
    this.sfx = callbacks?.sfx || sfx;
    this._audioListenerState = { x: 0, y: 0, z: 0, yaw: 0 };

    // Graphics quality tier (Thấp / Vừa / Cao, see quality.js): stored choice, else auto-detected from the GPU string
    this.qualityChoice = callbacks?.qualityChoice || loadQualityChoice();
    this.detectedTier = callbacks?.detectedTier || detectInitialTier();
    this.tier = resolveTier(this.qualityChoice, this.detectedTier);
    this.quality = QUALITY[this.tier];
    // Real glTF/PBR texture loading only happens when served over http(s) (never in the headless Node tests)
    this.assetsEnabled =
      callbacks?.enableAssets ?? /^https?:$/.test(String(globalThis.window?.location?.protocol || ''));
    this.assets = callbacks?.assets || getAssetManager();
    this._pbrToken = 0;
    this.pbrSlots = [];
    this.propBatchers = [];

    // Three.js core scene & fog
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x070d19);
    this.scene.fog = new THREE.FogExp2(0x091224, 0.0052);

    this.camera = new THREE.PerspectiveCamera(
      68,
      window.innerWidth / window.innerHeight,
      0.04,
      360
    );
    this.scene.add(this.camera);

    this.renderer = new THREE.WebGLRenderer({
      antialias: Boolean(this.quality.antialias) && window.devicePixelRatio <= 1.5,
      powerPreference: 'high-performance'
    });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.maxPixelRatio = Math.min(window.devicePixelRatio || 1, this.quality.maxPixelRatio);
    this.currentPixelRatio = this.maxPixelRatio;
    this.renderer.setPixelRatio(this.currentPixelRatio);
    this.renderer.shadowMap.enabled = this.quality.shadowMapSize > 0;
    this.renderer.shadowMap.type = shadowTypeFor(this.quality.shadowType);
    this.renderer.shadowMap.autoUpdate = false;
    this.camera.far = this.quality.cameraFar;
    this.camera.updateProjectionMatrix();
    this.assets.setMaxAnisotropy?.(this.renderer.capabilities?.getMaxAnisotropy?.() || 1);
    this.perfOverlay = isPerfOverlayRequested() ? new PerfOverlay() : null;
    if (this.perfOverlay) globalThis.__game3d = this; // ?perf=1 only: handle for console measurements
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.18;
    this.container.appendChild(this.renderer.domElement);

    // Pre-allocated math objects to avoid GC allocations in requestAnimationFrame
    this.raycaster = new THREE.Raycaster();
    this.tmpVec3A = new THREE.Vector3();
    this.tmpVec3B = new THREE.Vector3();
    this.tmpVec3C = new THREE.Vector3();
    this.tmpVec3D = new THREE.Vector3();
    this.tmpEuler = new THREE.Euler(0, 0, 0, 'YXZ');
    this.tmpQuat = new THREE.Quaternion();
    this.upVec = new THREE.Vector3(0, 0, 1);
    this.screenCenter = new THREE.Vector2(0, 0);
    this.rayPoint = new THREE.Vector2(0, 0);

    // Shared geometries & materials for zero-leak particle/decal pooling
    this.sharedSparkGeo = new THREE.BoxGeometry(0.055, 0.055, 0.055);
    this.sharedHitOrbGeo = new THREE.SphereGeometry(0.11, 8, 8);
    this.sharedShellGeo = new THREE.CylinderGeometry(0.011, 0.011, 0.046, 6);
    this.sharedShellGeo.rotateZ(Math.PI / 2);
    this.sharedShellMat = new THREE.MeshStandardMaterial({
      color: 0xfacc15,
      metalness: 0.85,
      roughness: 0.25,
      emissive: 0xca8a04,
      emissiveIntensity: 0.15
    });
    this.sharedDecalGeo = new THREE.CircleGeometry(0.11, 10);
    this.sharedDecalMat = new THREE.MeshBasicMaterial({
      color: 0x050811,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2
    });
    this.sharedGrenadeBodyGeo = new THREE.SphereGeometry(0.11, 10, 10);
    this.sharedGrenadeBandGeo = new THREE.CylinderGeometry(0.116, 0.116, 0.044, 10);
    this.sharedGrenadeCapGeo = new THREE.CylinderGeometry(0.045, 0.055, 0.068, 8);
    this.sharedGrenadeRingGeo = new THREE.TorusGeometry(0.036, 0.008, 6, 12);
    this.sharedGrenadeBodyMat = new THREE.MeshStandardMaterial({
      color: 0x365314,
      roughness: 0.42,
      metalness: 0.68
    });
    this.sharedGrenadeBandMat = new THREE.MeshBasicMaterial({
      color: 0xf97316
    });
    this.sharedGrenadeCapMat = new THREE.MeshStandardMaterial({
      color: 0x94a3b8,
      roughness: 0.3,
      metalness: 0.85
    });
    this.sharedExplosionSphereGeo = new THREE.SphereGeometry(1, 14, 12);
    this.sharedShockwaveRingGeo = new THREE.RingGeometry(0.58, 1.0, 28);
    this.sharedShockwaveTorusGeo = new THREE.TorusGeometry(0.85, 0.08, 8, 24);

    // Active map configuration & world collections
    this.currentMapId = DEFAULT_MAP_ID;
    this.currentMapConfig = getMapConfig(DEFAULT_MAP_ID);
    this.currentObstacles = this.currentMapConfig.obstacles;
    this.arenaHalfSize = this.currentMapConfig.arenaHalfSize || MATCH_CONFIG.ARENA_HALF_SIZE;

    this.worldMeshes = [];
    this.arenaDecorMeshes = [];
    this.arenaGeometries = new Set();
    this.arenaMaterials = new Set();
    this.arenaTextures = new Set();
    this.skyObjects = [];
    this.hitboxMeshes = [];
    this.rayTargets = [];
    this.remotePlayers = new Map(); // id -> RemotePlayerObject
    // Server-timestamped snapshot buffers of the remote players; they are drawn at (server time - INTERP_DELAY_MS)
    this.snapshots = new SnapshotInterpolator();
    this._remoteSample = {};
    this._remoteScratch = [];
    this.pickupMeshes = new Map();  // pickupId -> { group, crossGroup, ringMesh, padMat }
    this.droppedWeaponMeshes = new Map(); // dropId -> { group, gunSpinGroup, ringMat }
    this.activeGrenadeMeshes = new Map(); // grenadeId -> active 3D projectile state
    this.nearbyDrop = null;
    this.activeEffects = [];        // Tracers, spark bursts, explosions, floating damage numbers
    this.activeShells = [];         // Ejected 3D brass shell casings
    this.bulletDecals = [];         // Pooled ring buffer of surface bullet holes (max 36)
    this.maxBulletDecals = this.quality.maxBulletDecals;
    this.citadelRings = [];
    this.ambientParticles = null;

    // Local player state & tactical movement physics
    this.inMatch = false;
    this.isPointerLocked = false;
    this.localId = null;
    this.alive = true;
    this.grenades = 1;
    this.grenadeThrowUntil = 0;
    this.lastGrenadeThrowAt = -2000;
    this._lastExplodedGrenadeId = null;
    this._lastExplodedAt = 0;
    this.position = new THREE.Vector3(0, 0.1, 0);
    this.velocity = new THREE.Vector3(0, 0, 0);
    this.yaw = 0;
    this.pitch = 0;
    this.cameraRoll = 0;
    this.onGround = false;
    this.wasOnGround = false;
    this.lastGroundedAt = 0;
    this.jumpQueuedUntil = 0;
    this.crouching = false;
    this.prone = false;
    this.currentLean = 0;
    this.taggedUntil = 0;
    this.prevMoveRight = 0;
    this.prevMoveForward = 0;
    this.isSprinting = false;
    this.isSliding = false;
    this.slideUntil = 0;
    this.slideCooldownUntil = 0;
    this.slideDir = new THREE.Vector3(0, 0, 0);
    this.currentEyeHeight = 1.62;
    this.landingDip = 0;
    this.landingDipVel = 0;
    this.nextFootstepAt = 0;
    this.sensitivity = 1.0;

    // Fixed-timestep movement (shared/movement.js): the simulation advances in FIXED_DT steps, rendering interpolates
    this.moveState = createMovementState();
    this.physicsAccumulator = 0;
    this.simTimeMs = 0; // simulation clock (ms) of the last simulated command: derived from its seq (commandTimeMs)
    this.physPrev = { x: 0, y: 0.1, z: 0, stepOffsetY: 0 }; // previous fixed-step pose used for render interpolation
    this.physTracked = { x: 0, y: 0.1, z: 0 }; // pose after the last fixed step (detects external teleports/respawns)
    this.physAlpha = 1;

    // Input-command netcode (shared/netcode.js + prediction.js): each fixed step builds ONE command that is both
    // simulated locally and sent to the server (`inputBatch`); the server's `moveAck` is reconciled in applyMoveAck
    this.prediction = new ClientPrediction();
    this.cmdFields = {
      moveForward: 0,
      moveRight: 0,
      yaw: 0,
      pitch: 0,
      lean: 0,
      weapon: '',
      wantsCrouch: false,
      wantsProne: false,
      wantsSprint: false,
      wantsJump: false,
      isAiming: false,
      isAdsHeld: false
    };
    this.cmdScratchInput = {};
    this.lastInputBatchAt = 0;

    // Shots are part of the command stream: attemptShoot only queues a fire intent, the next eligible fixed-step command
    // carries the FIRE bit + shot sequence `ss`, and the SERVER computes spread and hits. The seed (owner-only, from
    // `roomJoined` / `selfSeed`) and `shotState` (bloom / spray advanced by fire commands in sim time) let this client draw the
    // tracer along exactly the rays the server will use (shared/spread.js planShot).
    this.spreadSeed = 0;
    this.shotSeq = 0; // `ss` of the last fire command (strictly increasing, reset with the netcode on join)
    this.shotState = createShotState();
    this.pendingFire = null; // { weapon, ammoConsumed, autoReloaded } waiting for a command slot
    this.predictedShots = []; // [{ ss, seq, weapon, ammoConsumed, autoReloaded, refunded }]
    this._refundedShotSeqs = new Set();
    this.lastShotRejected = null;
    this.hp = MATCH_CONFIG.MAX_HP || 100;
    this.lastFireCmdTimeMs = -Infinity; // sim time of the last fire command (same fire-rate rule as the server)
    this.lastShotPlan = null; // { seq, ss, origin, dirs, spreadAmount } of the last predicted shot

    // Weapon, 3-Slot Loadout, Finite Reserve Ammo, Reload & Gunshot mechanics state
    this.loadout = {
      primary: 'rifle',
      secondary: 'pistol',
      melee: 'knife'
    };
    this.currentWeapon = 'rifle';
    this.ammoByWeapon = {};
    this.reserveAmmoByWeapon = {};
    for (const wId of WEAPON_ORDER) {
      this.ammoByWeapon[wId] = WEAPONS[wId].magSize;
      this.reserveAmmoByWeapon[wId] = WEAPONS[wId].infiniteAmmo ? 0 : (WEAPONS[wId].reserveAmmo ?? WEAPONS[wId].magSize * 3);
    }
    this.lastShotAt = -1000;
    this.reloadingUntil = 0;
    this.reloadStartedAt = 0;
    this.reloadDuration = 1600;
    this.reloadMode = 'empty'; // 'tactical' | 'empty' | 'shell'
    this.nextShellAt = 0;
    this.pumpCycleUntil = 0;
    this.pumpCycleDuration = 460;
    this.meleeSwingUntil = 0;
    this.equipUntil = 0;
    this.equipDuration = 220;
    this.isMouseDown = false;
    this.isRightMouseDown = false;
    this.adsPressedAt = 0;
    this.adsToggleActive = false;
    this.isAiming = false;

    // Crosshair-Only Recoil & Spread state (Zero Camera Shake when shooting)
    this.currentBloom = 0;
    this.effectiveSpread = WEAPONS.rifle.spread;
    this.recoilShotIndex = 0;
    this.recoilOffset = 0;
    this.boltKickOffset = 0;
    this.crosshairRecoilKick = 0;
    this.accumulatedRecoilPitch = 0;
    this.accumulatedRecoilYaw = 0;
    this.punchPitch = 0;
    this.punchRoll = 0;
    this.flinchPitch = 0;
    this.flinchRoll = 0;
    this.weaponBobTime = 0;
    this.swayX = 0;
    this.swayY = 0;

    // Input keys
    this.keys = {
      KeyW: false,
      KeyS: false,
      KeyA: false,
      KeyD: false,
      KeyQ: false,
      KeyE: false,
      KeyZ: false,
      Space: false,
      ShiftLeft: false,
      ShiftRight: false,
      KeyC: false,
      ControlLeft: false
    };

    // FPS tracking
    this.frameCount = 0;
    this.lastFpsUpdate = performance.now();
    this.currentFps = 60;
    this.lastFrameTime = performance.now();
    this.lastHudMoveUpdateAt = 0;

    // Top-left Tactical Mini Map / Radar
    this.minimap = new TacticalMinimap();

    // Build 3D environment, weapon viewmodels & lobby 3D humanoid operator showcase
    this.setupLights();
    this.loadMap(DEFAULT_MAP_ID);
    this.setupViewmodelWeapons();
    this.setupLobbyShowcase();
    this.bindEvents();

    // Start render loop
    this.animate = this.animate.bind(this);
    requestAnimationFrame(this.animate);
  }

  setupLights() {
    this.hemiLight = new THREE.HemisphereLight(0xb8d4f2, 0x1a1e24, 1.05);
    this.hemiLight.position.set(0, 75, 0);
    this.scene.add(this.hemiLight);

    // Primary warm directional sunlight with static baked shadow map covering the arena
    this.dirLight = new THREE.DirectionalLight(0xfff1dc, 1.68);
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
    this.dirLight.shadow.bias = -0.0004;
    this.dirLight.shadow.normalBias = 0.02;
    this.scene.add(this.dirLight);

    // Cool steel rim light from opposite angle for 3D depth & metallic specular highlights
    this.rimLight = new THREE.DirectionalLight(0x6488a8, 0.78);
    this.rimLight.position.set(-58, 52, -52);
    this.scene.add(this.rimLight);

    // Central tactical command point light
    this.citadelLight = new THREE.PointLight(0xe5a024, 2.2, 42, 1.4);
    this.citadelLight.position.set(0, 8.5, 0);
    this.scene.add(this.citadelLight);
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

    this._pbrToken++;
    this.pbrSlots = [];
    this.propBatchers = [];

    this.clearPickups();
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
    const fogHex = isDesert ? 0x241a12 : 0x0b1018;
    this.scene.background = new THREE.Color(fogHex);
    this.scene.fog = new THREE.FogExp2(fogHex, (theme.fogDensity || 0.005) * 0.72);

    if (this.citadelLight) {
      this.citadelLight.color.setHex(isDesert ? 0xf59e0b : 0xe5a024);
    }
    if (this.rimLight) {
      this.rimLight.color.setHex(isDesert ? 0xc29b70 : 0x6488a8);
    }
    if (this.hemiLight) {
      this.hemiLight.color.setHex(isDesert ? 0xfde68a : 0xb8d4f2);
      this.hemiLight.groundColor.setHex(isDesert ? 0x291d14 : 0x1a1e24);
    }
    if (this.dirLight) {
      this.dirLight.color.setHex(isDesert ? 0xffe8c2 : 0xfff1dc);
      const d = this.arenaHalfSize + 6;
      this.dirLight.shadow.camera.left = -d;
      this.dirLight.shadow.camera.right = d;
      this.dirLight.shadow.camera.top = d;
      this.dirLight.shadow.camera.bottom = -d;
      this.dirLight.shadow.camera.updateProjectionMatrix();
    }

    this.buildSkyAndAtmosphere(theme, this.arenaHalfSize);
    this.buildArena(mapCfg);
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
          emissive: 0x10b981,
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
          color: 0x22c55e,
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
          color: 0x22c55e,
          emissive: 0x16a34a,
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

        this.scene.add(group);
        item = { group, crossGroup, padMat, holoRing, x: p.x, y: p.y, z: p.z, active: Boolean(p.active) };
        this.pickupMeshes.set(p.id, item);
      } else {
        item.x = p.x;
        item.y = p.y;
        item.z = p.z;
        item.group.position.set(p.x, p.y, p.z);
      }

      item.active = Boolean(p.active);
      item.crossGroup.visible = Boolean(p.active);
      item.holoRing.visible = Boolean(p.active);
      item.padMat.emissiveIntensity = p.active ? 0.55 : 0.05;
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

  clearDroppedWeapons() {
    for (const item of this.droppedWeaponMeshes.values()) {
      this.scene.remove(item.group);
      item.group.traverse((obj) => {
        if (obj.isMesh) {
          obj.geometry?.dispose();
          if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose());
          else obj.material?.dispose();
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
    const seen = new Set();
    for (const d of drops) {
      seen.add(d.id);
      if (!this.droppedWeaponMeshes.has(d.id)) {
        this.addDroppedWeapon(d);
      }
    }
    for (const id of Array.from(this.droppedWeaponMeshes.keys())) {
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

  setGrenadeCount(count) {
    const next = Math.max(0, Number(count ?? 0));
    if (this.grenades !== next) {
      this.grenades = next;
      this.callbacks.onGrenadeChanged?.(this.grenades);
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

  attemptThrowGrenade() {
    if (!this.inMatch || !this.alive) return false;
    const now = performance.now();
    if (now - this.lastGrenadeThrowAt < 250) return false;
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
    if (this.grenades > 0 && this.isPointerLocked) {
      this.triggerLocalGrenadeThrow(payload);
    }
    this.callbacks.onThrowGrenade?.(payload);
    return true;
  }

  clearGrenades() {
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

    const coreMat = new THREE.MeshBasicMaterial({
      color: 0xfef08a,
      transparent: true,
      opacity: 1.0,
      depthWrite: false
    });
    const coreSphere = new THREE.Mesh(this.sharedExplosionSphereGeo, coreMat);
    coreSphere.position.set(ex, ey + 0.18, ez);
    coreSphere.scale.setScalar(0.45);
    this.scene.add(coreSphere);

    const fireballMat = new THREE.MeshBasicMaterial({
      color: 0xf97316,
      transparent: true,
      opacity: 0.92,
      depthWrite: false
    });
    const fireballSphere = new THREE.Mesh(this.sharedExplosionSphereGeo, fireballMat);
    fireballSphere.position.set(ex, ey + 0.22, ez);
    fireballSphere.scale.setScalar(0.75);
    this.scene.add(fireballSphere);

    const blastWaveMat = new THREE.MeshBasicMaterial({
      color: 0xef4444,
      transparent: true,
      opacity: 0.42,
      wireframe: true,
      depthWrite: false
    });
    const blastWaveSphere = new THREE.Mesh(this.sharedExplosionSphereGeo, blastWaveMat);
    blastWaveSphere.position.set(ex, ey + 0.2, ez);
    blastWaveSphere.scale.setScalar(1.0);
    this.scene.add(blastWaveSphere);

    const shockwaveMat = new THREE.MeshBasicMaterial({
      color: 0xfb923c,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.95,
      depthWrite: false
    });
    const shockwaveRing = new THREE.Mesh(this.sharedShockwaveRingGeo, shockwaveMat);
    shockwaveRing.rotation.x = -Math.PI / 2;
    shockwaveRing.position.set(ex, Math.max(0.05, ey - 0.08), ez);
    shockwaveRing.scale.setScalar(0.6);
    this.scene.add(shockwaveRing);

    const torusMat = new THREE.MeshBasicMaterial({
      color: 0xfacc15,
      transparent: true,
      opacity: 0.88,
      depthWrite: false
    });
    const torusRing = new THREE.Mesh(this.sharedShockwaveTorusGeo, torusMat);
    torusRing.rotation.x = Math.PI / 2 + (Math.random() - 0.5) * 0.35;
    torusRing.rotation.y = (Math.random() - 0.5) * 0.35;
    torusRing.position.set(ex, ey + 0.28, ez);
    torusRing.scale.setScalar(0.5);
    this.scene.add(torusRing);

    const flashLight = new THREE.PointLight(0xf97316, 8.5, 26, 1.5);
    flashLight.position.set(ex, ey + 0.6, ez);
    this.scene.add(flashLight);

    if (!this.sparkMeshPool) this.sparkMeshPool = [];
    const sparkMat = new THREE.MeshBasicMaterial({
      color: 0xfde047,
      transparent: true,
      opacity: 1.0
    });
    const particles = [];
    const pCount = Math.max(4, Math.round(18 * this.quality.particleScale));
    for (let i = 0; i < pCount; i++) {
      const pMesh = this.sparkMeshPool.pop() || new THREE.Mesh(this.sharedSparkGeo, sparkMat);
      pMesh.geometry = this.sharedSparkGeo;
      pMesh.material = sparkMat;
      pMesh.scale.setScalar(1.6 + Math.random() * 1.4);
      pMesh.position.set(ex, ey + 0.2, ez);
      const angle = (i / pCount) * Math.PI * 2 + (Math.random() - 0.5) * 0.35;
      const hSpeed = 4.5 + Math.random() * 9.5;
      particles.push({
        mesh: pMesh,
        vx: Math.cos(angle) * hSpeed,
        vy: 3.8 + Math.random() * 8.5,
        vz: Math.sin(angle) * hSpeed
      });
      this.scene.add(pMesh);
    }

    if (ey <= 1.2) {
      this.spawnBulletDecal({ x: ex, y: 0.01, z: ez }, { x: 0, y: 1, z: 0 });
    }

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

  createWeaponMesh(weaponId, isFirstPerson = false) {
    const mesh = createWeaponMesh(weaponId, isFirstPerson);
    if (this.quality?.envMapSize === 0) applyMetalnessCap(mesh, 0.35); // Low: no env map, keep metals from going black
    return mesh;
  }

  /**
   * World-space weapon (dropped pickups + lobby showcase). Procedural body first; when the opt-in glTF override
   * (weaponAssetOverrides.js, ?glbWeapons=1) is enabled and loads, its visual replaces the body (contracts are untouched).
   */
  createShowcaseWeaponMesh(weaponId) {
    const mesh = this.createWeaponMesh(weaponId, false);
    if (this.assetsEnabled && isWeaponOverrideEnabled()) {
      const procBox = measureWeaponGroup(mesh);
      applyWeaponAssetOverride(mesh, weaponId, this.assets, procBox);
    }
    return mesh;
  }

  setupViewmodelWeapons() {
    this.viewmodelRig = new THREE.Group();
    this.camera.add(this.viewmodelRig);

    this.viewmodelKeyLight = new THREE.PointLight(0xe0f2fe, 0.72, 2.5, 1.5);
    this.viewmodelKeyLight.position.set(0.22, 0.28, -0.25);
    this.camera.add(this.viewmodelKeyLight);

    this.muzzleLight = new THREE.PointLight(0xfef08a, 0, 10, 2);
    this.muzzleLight.position.set(0, 0.05, -0.9);
    this.viewmodelRig.add(this.muzzleLight);

    this.viewmodelMeshes = {};
    for (const wId of WEAPON_ORDER) {
      const mesh = this.createWeaponMesh(wId, true);
      mesh.visible = wId === this.currentWeapon;
      this.viewmodelRig.add(mesh);
      this.viewmodelMeshes[wId] = mesh;
    }
    this.viewmodelRig.position.set(0.24, -0.21, -0.40);
  }

  setupLobbyShowcase() {
    this.lobbyShowcaseGroup = new THREE.Group();
    this.lobbyShowcaseGroup.position.set(0, -0.96, -2.62);
    this.camera.add(this.lobbyShowcaseGroup);

    this.lobbyKeyLight = new THREE.PointLight(0xfff4e0, 2.35, 7.0, 1.2);
    this.lobbyKeyLight.position.set(1.3, 2.3, 1.55);
    this.lobbyShowcaseGroup.add(this.lobbyKeyLight);

    this.lobbyRimLight = new THREE.PointLight(0xe5a024, 1.65, 6.2, 1.2);
    this.lobbyRimLight.position.set(-1.35, 1.85, -0.95);
    this.lobbyShowcaseGroup.add(this.lobbyRimLight);

    this.lobbyFillLight = new THREE.PointLight(0x94a3b8, 1.05, 5.8, 1.4);
    this.lobbyFillLight.position.set(0.15, 0.72, 1.65);
    this.lobbyShowcaseGroup.add(this.lobbyFillLight);

    const pedGroup = new THREE.Group();
    const baseRingMat = new THREE.MeshStandardMaterial({
      color: 0x16191e,
      roughness: 0.42,
      metalness: 0.82
    });
    const chromeRimMat = new THREE.MeshStandardMaterial({
      color: 0x2c333d,
      roughness: 0.34,
      metalness: 0.88
    });
    this.lobbyPedestalGlowMat = new THREE.MeshBasicMaterial({
      color: 0xe5a024,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.78
    });
    this.lobbyHoloConeMat = new THREE.MeshBasicMaterial({
      color: 0xe5a024,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.045,
      depthWrite: false
    });

    const outerDeck = new THREE.Mesh(new THREE.CylinderGeometry(0.70, 0.80, 0.075, 24), baseRingMat);
    outerDeck.position.y = -0.038;
    const innerPad = new THREE.Mesh(new THREE.CylinderGeometry(0.56, 0.60, 0.082, 24), chromeRimMat);
    innerPad.position.y = -0.026;
    this.lobbyHoloRingOuter = new THREE.Mesh(new THREE.RingGeometry(0.60, 0.65, 32), this.lobbyPedestalGlowMat);
    this.lobbyHoloRingOuter.rotation.x = -Math.PI / 2;
    this.lobbyHoloRingOuter.position.y = 0.017;
    this.lobbyHoloRingInner = new THREE.Mesh(new THREE.RingGeometry(0.38, 0.41, 24), this.lobbyPedestalGlowMat);
    this.lobbyHoloRingInner.rotation.x = -Math.PI / 2;
    this.lobbyHoloRingInner.position.y = 0.019;
    const holoField = new THREE.Mesh(new THREE.CylinderGeometry(0.58, 0.55, 0.36, 24, 1, true), this.lobbyHoloConeMat);
    holoField.position.y = 0.18;

    pedGroup.add(outerDeck, innerPad, this.lobbyHoloRingOuter, this.lobbyHoloRingInner, holoField);
    this.lobbyShowcaseGroup.add(pedGroup);

    this.lobbyOperatorColor = 0xe5a024;
    this.lobbyOperator = this.createRemotePlayerMesh(
      {
        id: 'lobby_showcase',
        name: 'STRIKER',
        color: this.lobbyOperatorColor,
        weapon: this.currentWeapon || 'rifle',
        x: 0,
        y: 0,
        z: 0
      },
      { isShowcase: true }
    );
    this.lobbyShowcaseGroup.add(this.lobbyOperator.group);

    this.lobbyOperatorYaw = -0.32;
    this.lobbyAutoRotate = true;
    this.lobbyCrouching = false;
    this.lobbyWalkDemo = false;
    this.lobbyTestShotAt = 0;
  }

  setLobbyWeapon(weaponId) {
    if (!WEAPONS[weaponId] || !this.lobbyOperator) return;
    const op = this.lobbyOperator;
    if (op.currentWeapon !== weaponId) {
      op.currentWeapon = weaponId;
      op.gunHolder.remove(op.gunMesh);
      disposeObject3D(op.gunMesh);
      op.gunMesh = this.createShowcaseWeaponMesh(weaponId);
      op.gunHolder.add(op.gunMesh);
    }
    op.armPivot.rotation.x = -0.22;
    this.callbacks.onWeaponSwitchSound?.();
  }

  setLobbyOperatorColor(colorHex) {
    this.lobbyOperatorColor = colorHex;
    if (this.lobbyOperator?.setOperatorColor) {
      this.lobbyOperator.setOperatorColor(colorHex);
    }
    if (this.lobbyRimLight) this.lobbyRimLight.color.setHex(colorHex);
    if (this.lobbyPedestalGlowMat) this.lobbyPedestalGlowMat.color.setHex(colorHex);
    if (this.lobbyHoloConeMat) this.lobbyHoloConeMat.color.setHex(colorHex);
  }

  toggleLobbyCrouch(forceState = null) {
    this.lobbyCrouching = forceState !== null ? Boolean(forceState) : !this.lobbyCrouching;
    if (this.lobbyOperator) {
      this.lobbyOperator.crouching = this.lobbyCrouching;
    }
    return this.lobbyCrouching;
  }

  toggleLobbyWalk(forceState = null) {
    this.lobbyWalkDemo = forceState !== null ? Boolean(forceState) : !this.lobbyWalkDemo;
    return this.lobbyWalkDemo;
  }

  triggerLobbyTestFire() {
    if (!this.lobbyOperator) return;
    const now = performance.now();
    this.lobbyTestShotAt = now;
    this.lobbyOperator.lastShotFlashAt = now;
    if (this.lobbyOperator.gunMesh?.userData?.flashMesh) {
      this.lobbyOperator.gunMesh.userData.flashMesh.visible = true;
    }
    this.lobbyOperator.armPivot.rotation.x = 0.22;
    if (this.lobbyOperator.upperBodyGroup) {
      this.lobbyOperator.upperBodyGroup.rotation.x = -0.09;
    }
  }

  rotateLobbyOperator(deltaYaw) {
    this.lobbyOperatorYaw += deltaYaw;
  }

  setLoadout(loadout = {}, activeWeapon = null) {
    if (loadout.primary && WEAPONS[loadout.primary]?.slot === 1) {
      this.loadout.primary = loadout.primary;
    }
    if (loadout.secondary && WEAPONS[loadout.secondary]?.slot === 2) {
      this.loadout.secondary = loadout.secondary;
    }
    if (loadout.melee && WEAPONS[loadout.melee]?.slot === 3) {
      this.loadout.melee = loadout.melee;
    }
    if (activeWeapon && WEAPONS[activeWeapon]) {
      this.switchWeapon(activeWeapon);
    }
  }

  switchSlot(slotNumber) {
    if (slotNumber === 1) this.switchWeapon(this.loadout.primary);
    else if (slotNumber === 2) this.switchWeapon(this.loadout.secondary);
    else if (slotNumber === 3) this.switchWeapon(this.loadout.melee);
  }

  switchWeapon(weaponId) {
    if (!WEAPONS[weaponId]) return;
    if (this.currentWeapon === weaponId && this.equipUntil === 0) return;

    const prevWeapon = this.currentWeapon;
    this.currentWeapon = weaponId;
    this.reloadingUntil = 0;
    this.nextShellAt = 0;
    this.pumpCycleUntil = 0;
    this.isAiming = false;
    this.adsToggleActive = false;
    this.currentBloom = 0;
    this.recoilShotIndex = 0;
    this.crosshairRecoilKick = 0;
    this.accumulatedRecoilPitch = 0;
    this.accumulatedRecoilYaw = 0;

    const cfg = WEAPONS[weaponId];
    this.equipDuration = cfg.equipMs || 220;
    this.equipUntil = performance.now() + this.equipDuration;

    for (const wId of WEAPON_ORDER) {
      const vm = this.viewmodelMeshes[wId];
      if (vm) {
        vm.visible = wId === weaponId;
        setWeaponAdsCulling(vm, false);
        if (vm.userData?.magMesh && vm.userData.magMesh.userData.basePos) {
          vm.userData.magMesh.position.copy(vm.userData.magMesh.userData.basePos);
        }
        if (vm.userData?.boltMesh && typeof vm.userData.boltMesh.userData.baseZ === 'number') {
          vm.userData.boltMesh.position.z = vm.userData.boltMesh.userData.baseZ;
        }
      }
    }

    if (prevWeapon !== weaponId) {
      this.callbacks.onWeaponSwitchSound?.();
    }
    this.callbacks.onAimChange?.(false, weaponId);
    this.callbacks.onWeaponChanged?.(
      weaponId,
      this.ammoByWeapon[weaponId],
      this.reserveAmmoByWeapon[weaponId] ?? cfg.reserveAmmo ?? cfg.magSize
    );
  }

  applySwappedWeapon(data) {
    if (!data || !data.weapon || !WEAPONS[data.weapon]) return;
    const wId = data.weapon;
    const cfg = WEAPONS[wId];
    this.loadout.primary = wId;
    this.ammoByWeapon[wId] = typeof data.ammo === 'number' ? data.ammo : cfg.magSize;
    this.reserveAmmoByWeapon[wId] = typeof data.reserveAmmo === 'number' ? data.reserveAmmo : (cfg.reserveAmmo ?? 0);
    this.currentWeapon = '';
    this.switchWeapon(wId);
  }

  startReload() {
    if (!this.inMatch || !this.alive) return;
    const cfg = WEAPONS[this.currentWeapon];
    if (!cfg || cfg.isMelee || cfg.infiniteAmmo) return;
    const now = performance.now();
    if (this.reloadingUntil > now) return;

    const currentAmmo = this.ammoByWeapon[this.currentWeapon];
    const reserveAmmo = this.reserveAmmoByWeapon[this.currentWeapon] ?? 0;
    if (currentAmmo >= cfg.magSize || reserveAmmo <= 0) return;

    this.isAiming = false;
    this.adsToggleActive = false;
    this.isSprinting = false;
    setWeaponAdsCulling(this.viewmodelMeshes[this.currentWeapon], false);
    this.reloadStartedAt = now;

    if (cfg.shellByShell) {
      const missing = Math.max(1, Math.min(cfg.magSize - currentAmmo, reserveAmmo));
      const startDelay = cfg.shellReloadStartMs || 240;
      const shellMs = cfg.shellReloadMs || 390;
      this.reloadMode = 'shell';
      this.reloadDuration = startDelay + missing * shellMs;
      this.nextShellAt = now + startDelay + shellMs;
      this.reloadingUntil = now + this.reloadDuration;
    } else {
      const isTactical = currentAmmo > 0;
      this.reloadMode = isTactical ? 'tactical' : 'empty';
      this.reloadDuration = isTactical ? (cfg.tacticalReloadMs || cfg.reloadMs) : cfg.reloadMs;
      this.nextShellAt = 0;
      this.reloadingUntil = now + this.reloadDuration;
    }

    this.callbacks.onAimChange?.(false, this.currentWeapon);
    this.callbacks.onReloadStart?.(
      this.currentWeapon,
      this.reloadDuration,
      this.reloadMode,
      currentAmmo,
      reserveAmmo
    );
  }

  createPlayerNameSprite(name) {
    return createPlayerNameSprite(name);
  }

  createRemotePlayerMesh(playerData = {}, options = {}) {
    const rp = createRemotePlayerMesh(playerData, {
      scene: this.scene,
      defaultColor: this.lobbyOperatorColor || 0x38bdf8,
      ...options
    });
    if (!options.isShowcase && !rp.labelInfo) {
      if (typeof document !== 'undefined') {
        const labelInfo = createPlayerNameSprite(playerData.name || 'OPERATOR');
        if (labelInfo?.sprite) {
          labelInfo.material.transparent = true;
          labelInfo.material.depthTest = false;
          labelInfo.material.depthWrite = false;
          if (typeof playerData.hp === 'number') {
            labelInfo.updateLabel(playerData.hp);
          }
          rp.labelInfo = labelInfo;
          rp.group.add(labelInfo.sprite);
        }
      } else {
        const material = new THREE.SpriteMaterial({
          transparent: true,
          depthTest: false,
          depthWrite: false
        });
        const sprite = new THREE.Sprite(material);
        sprite.scale.set(2.3, 0.65, 1);
        sprite.position.set(0, 2.36, 0);
        sprite.renderOrder = 10;
        rp.labelInfo = {
          sprite,
          canvas: null,
          texture: { dispose() {} },
          material,
          updateLabel() {}
        };
        rp.group.add(sprite);
      }
    }
    if (rp?.group) {
      rp.group.traverse((obj) => {
        if (obj.isMesh || obj.isSprite) {
          obj.frustumCulled = false;
        }
      });
    }
    return rp;
  }

  rebuildHitboxList() {
    this.hitboxMeshes.length = 0;
    for (const rp of this.remotePlayers.values()) {
      if (!rp.alive) continue;
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
  }

  disposeRemotePlayer(rp) {
    this.scene.remove(rp.group);
    if (rp.labelInfo) {
      rp.labelInfo.texture.dispose();
      rp.labelInfo.material.dispose();
    }
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
    this.snapshots.setRttMs(rttMs);
  }

  /** Respawn of a remote player: drop its snapshot history and show it at the spawn point (no streak from the death spot). */
  resetRemoteInterpolation(id, x, y, z, yaw = 0) {
    this.snapshots.reset(id);
    const rp = this.remotePlayers.get(id);
    if (rp?.group) {
      rp.group.position.set(x, y, z);
      rp.group.rotation.y = yaw;
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
    if (!this._seenPlayerIds) {
      this._seenPlayerIds = new Set();
    }
    const seenIds = this._seenPlayerIds;
    seenIds.clear();
    let hitboxesDirty = false;
    this._remoteScratch.length = 0;

    for (const p of playersArray) {
      if (p.id === this.localId) {
        this.alive = Boolean(p.alive);
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
        this.remotePlayers.set(p.id, rp);
        hitboxesDirty = true;
      }

      if (rp.group && rp.group.parent !== this.scene) {
        this.scene.add(rp.group);
      }
      if (!rp.velocity) rp.velocity = new THREE.Vector3(0, 0, 0);

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
        // Pose (position, yaw/pitch/lean, crouch/prone) comes from the snapshot buffer in updateRemotePlayers
        this._remoteScratch.push(p);
      } else {
        rp.targetYaw = p.yaw || 0;
        rp.targetPitch = p.pitch || 0;
        rp.crouching = Boolean(p.crouching || p.crouch);
        rp.crouch = rp.crouching;
        rp.prone = Boolean(p.prone);
        rp.lean = Number(p.lean || 0);
      }
      rp.alive = nowAlive;
      rp.group.visible = nowAlive;
      if (rp.labelInfo?.sprite) {
        rp.labelInfo.sprite.visible = nowAlive;
      }

      if (p.weapon && WEAPONS[p.weapon] && p.weapon !== rp.currentWeapon) {
        rp.currentWeapon = p.weapon;
        rp.gunHolder.remove(rp.gunMesh);
        disposeObject3D(rp.gunMesh);
        rp.gunMesh = this.createWeaponMesh(p.weapon, false);
        rp.gunHolder.add(rp.gunMesh);
      }

      if (rp.hp !== p.hp) {
        rp.hp = p.hp;
        rp.labelInfo?.updateLabel(p.hp);
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
    this.crouching = false;
    this.prone = false;
    this.currentLean = 0;
    this.slideUntil = 0;
    this.currentBloom = 0;
    this.crosshairRecoilKick = 0;
    this.accumulatedRecoilPitch = 0;
    this.accumulatedRecoilYaw = 0;
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

  spawnShellCasing() {
    const shell = new THREE.Mesh(this.sharedShellGeo, this.sharedShellMat);
    this.tmpVec3A.set(0.24, -0.14, -0.35);
    this.tmpVec3A.applyQuaternion(this.camera.quaternion);
    shell.position.copy(this.camera.position).add(this.tmpVec3A);

    this.tmpVec3B.set(
      1.6 + Math.random() * 1.1,
      1.4 + Math.random() * 0.9,
      -0.4 + (Math.random() - 0.5) * 0.8
    );
    this.tmpVec3B.applyQuaternion(this.camera.quaternion);
    this.tmpVec3B.add(this.velocity);

    this.scene.add(shell);
    this.activeShells.push({
      mesh: shell,
      vx: this.tmpVec3B.x,
      vy: this.tmpVec3B.y,
      vz: this.tmpVec3B.z,
      rx: (Math.random() - 0.5) * 22,
      ry: (Math.random() - 0.5) * 22,
      rz: (Math.random() - 0.5) * 22,
      createdAt: performance.now(),
      duration: 650
    });
  }

  spawnBulletDecal(point, normal) {
    if (!normal) return;
    let decalMesh;
    if (this.bulletDecals.length >= this.maxBulletDecals) {
      decalMesh = this.bulletDecals.shift();
    } else {
      decalMesh = new THREE.Mesh(this.sharedDecalGeo, this.sharedDecalMat);
      this.scene.add(decalMesh);
    }

    decalMesh.position.set(
      point.x + normal.x * 0.015,
      point.y + normal.y * 0.015,
      point.z + normal.z * 0.015
    );
    this.tmpQuat.setFromUnitVectors(this.upVec, normal);
    decalMesh.quaternion.copy(this.tmpQuat);
    this.bulletDecals.push(decalMesh);
  }

  spawnTracerEffect(origin, hitPoint, colorHex = 0xfef08a, isPlayerHit = false, hitNormal = null, ss = 0) {
    this.tmpVec3A.set(origin.x, origin.y, origin.z);
    this.tmpVec3B.set(hitPoint.x, hitPoint.y, hitPoint.z);

    const geo = new THREE.BufferGeometry().setFromPoints([this.tmpVec3A, this.tmpVec3B]);
    const mat = new THREE.LineBasicMaterial({
      color: colorHex,
      transparent: true,
      opacity: 0.95
    });
    const line = new THREE.Line(geo, mat);
    this.scene.add(line);

    const sparkColor = isPlayerHit ? 0xef4444 : colorHex;
    const sparkMat = new THREE.MeshBasicMaterial({
      color: sparkColor,
      transparent: true,
      opacity: 1
    });
    if (!this.sparkMeshPool) this.sparkMeshPool = [];
    const spark = this.sparkMeshPool.pop() || new THREE.Mesh(this.sharedHitOrbGeo, sparkMat);
    spark.geometry = this.sharedHitOrbGeo;
    spark.material = sparkMat;
    spark.position.copy(this.tmpVec3B);
    spark.scale.setScalar(isPlayerHit ? 1.45 : 0.95);
    this.scene.add(spark);

    const particles = [];
    const pCount = isPlayerHit ? 5 : 3;
    const nx = hitNormal ? hitNormal.x : 0;
    const ny = hitNormal ? hitNormal.y : 1;
    const nz = hitNormal ? hitNormal.z : 0;
    for (let i = 0; i < pCount; i++) {
      const pMesh = this.sparkMeshPool.pop() || new THREE.Mesh(this.sharedSparkGeo, sparkMat);
      pMesh.geometry = this.sharedSparkGeo;
      pMesh.material = sparkMat;
      pMesh.scale.setScalar(1);
      pMesh.position.copy(this.tmpVec3B);
      particles.push({
        mesh: pMesh,
        vx: nx * 3.5 + (Math.random() - 0.5) * 5.5,
        vy: ny * 3.5 + Math.random() * 4.2,
        vz: nz * 3.5 + (Math.random() - 0.5) * 5.5
      });
      this.scene.add(pMesh);
    }

    if (!isPlayerHit && hitNormal) {
      this.spawnBulletDecal(hitPoint, hitNormal);
    }

    this.activeEffects.push({
      type: 'tracer',
      ss,
      line,
      spark,
      particles,
      geo,
      mat,
      sparkMat,
      createdAt: performance.now(),
      duration: 145
    });
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

  triggerRemoteShotEffect(shooterId, weaponId, origin, hitPoint) {
    this.spawnShotVisual(shooterId, weaponId, origin, hitPoint);
  }

  spawnShotVisual(shooterId, weaponId, origin, hitPoint) {
    if (shooterId && typeof shooterId === 'object') {
      if ('x' in shooterId && 'z' in shooterId && !('shooterId' in shooterId) && !('origin' in shooterId)) {
        const resolvedWep = typeof origin === 'string' ? origin : 'rifle';
        return this.spawnShotVisual(null, resolvedWep, shooterId, weaponId);
      }
      const payload = shooterId;
      return this.spawnShotVisual(
        payload.shooterId,
        payload.weapon || payload.weaponId || 'rifle',
        payload.origin,
        payload.hitPoint
      );
    }
    if (typeof shooterId === 'string' && weaponId && typeof weaponId === 'object' && 'x' in weaponId) {
      return this.spawnShotVisual(null, shooterId, weaponId, origin);
    }

    const rp = this.remotePlayers.get(shooterId);
    if (rp && rp.alive) {
      rp.lastShotFlashAt = performance.now();
      if (rp.gunMesh?.userData?.flashMesh) {
        rp.gunMesh.userData.flashMesh.visible = true;
      }
      rp.armPivot.rotation.x += 0.14;
    }

    const resolvedWeapon = weaponId || rp?.currentWeapon || 'rifle';
    const shotOrigin = origin || (rp ? rp.group.position : null);
    if ((!shooterId || shooterId !== this.localId) && shotOrigin) {
      sfx.playSpatialGunshot(resolvedWeapon, this.getAudioListenerState(), shotOrigin);
    }

    if (shotOrigin && hitPoint) {
      const wColor = WEAPONS[resolvedWeapon]?.color || 0xfef08a;
      this.spawnTracerEffect(shotOrigin, hitPoint, wColor, false, null);
    }
  }

  _damagePopupTexCache = new Map();
  damagePopupPool = [];

  spawnDamagePopup(targetId, damage, isHeadshot = false) {
    const rp = this.remotePlayers.get(targetId);
    if (!rp) return;

    if (!this._damagePopupTexCache) {
      this._damagePopupTexCache = new Map();
    }
    if (!this.damagePopupPool) {
      this.damagePopupPool = [];
    }

    const roundedDamage = Math.round(Number(damage) || 0);
    const cacheKey = `${roundedDamage}_${isHeadshot ? 1 : 0}`;

    let tex = this._damagePopupTexCache.get(cacheKey);
    if (!tex) {
      const canvas = typeof document !== 'undefined' && typeof document.createElement === 'function'
        ? document.createElement('canvas')
        : { width: 160, height: 64, getContext: () => null };
      canvas.width = 160;
      canvas.height = 64;
      const ctx = canvas.getContext?.('2d');
      if (ctx) {
        ctx.font = isHeadshot ? '900 34px Segoe UI, sans-serif' : '800 28px Segoe UI, sans-serif';
        ctx.textAlign = 'center';
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.9)';
        ctx.lineWidth = 5;
        const text = isHeadshot ? `🎯 -${roundedDamage}` : `-${roundedDamage}`;
        ctx.strokeText(text, 80, 44);
        ctx.fillStyle = isHeadshot ? '#facc15' : '#f8fafc';
        ctx.fillText(text, 80, 44);
      }
      tex = new THREE.CanvasTexture(canvas);
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
        vy: 1.65,
        createdAt: 0,
        duration: 650
      };
    }

    sprite.position.set(
      rp.group.position.x + (Math.random() - 0.5) * 0.45,
      rp.group.position.y + (isHeadshot ? 2.15 : 1.55),
      rp.group.position.z + (Math.random() - 0.5) * 0.45
    );
    sprite.scale.set(isHeadshot ? 1.45 : 1.1, isHeadshot ? 0.58 : 0.44, 1);

    pooled.type = 'popup';
    pooled.sprite = sprite;
    pooled.mat = mat;
    pooled.tex = tex;
    pooled.vy = 1.65;
    pooled.createdAt = performance.now();
    pooled.duration = 650;
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

  applyDamageFlinch(damage = 20) {
    const scale = Math.min(1.2, damage / 40);
    this.flinchPitch = Math.min(0.025, this.flinchPitch + 0.01 * scale);
    this.flinchRoll = (Math.random() < 0.5 ? -1 : 1) * 0.012 * scale;
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
      this.callbacks.onDryFire?.();
      if (reserveAmmo > 0) {
        this.startReload();
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
      autoReloaded: false
    };
    this.pendingFire = pendingShot;
    this.callbacks.onLocalShot?.({ weapon: this.currentWeapon, isAiming: this.isAiming });

    if (isMelee) {
      return;
    }

    const horizSpeed = Math.hypot(this.velocity.x, this.velocity.z);
    const isMovingWhileShooting = horizSpeed > 0.95 || !this.onGround;

    // Crosshair-only recoil & dynamic bloom HUD (ZERO camera pitch/yaw/roll shake!). The damage spread does NOT read this.
    const moveBloomMult = isMovingWhileShooting ? 1.85 : 1.0;
    this.currentBloom = Math.min(
      (cfg.bloomMax || 0.018) * moveBloomMult,
      this.currentBloom + (cfg.bloomPerShot || 0.002) * (this.isAiming ? 0.5 : 1.0) * moveBloomMult
    );

    this.recoilShotIndex = Math.min(30, this.recoilShotIndex + 1);
    const chKick = (cfg.crosshairKick || 0.018) * (this.isAiming ? 0.65 : 1.0) * (this.prone ? 0.65 : this.crouching ? 0.8 : 1.0);
    this.crosshairRecoilKick = Math.min(0.11, this.crosshairRecoilKick + chKick);

    // Gentle 3D weapon viewmodel kickback & reciprocating bolt/pump animation (camera stays 100% steady)
    this.recoilOffset = Math.min(0.16, this.recoilOffset + (cfg.visualKick || 0.055));
    this.boltKickOffset = 1.0;
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
    this.muzzleLight.intensity = 3.2;

    this.spawnShellCasing();

    if (this.ammoByWeapon[this.currentWeapon] === 0 && (this.reserveAmmoByWeapon[this.currentWeapon] ?? 0) > 0) {
      pendingShot.autoReloaded = true;
      this.startReload();
    }
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

    if (this.rayTargets.length === 0) {
      this.rebuildHitboxList();
    }
    for (const rp of this.remotePlayers.values()) {
      if (rp.alive && rp.group) {
        rp.group.updateMatrixWorld(true);
      }
    }

    const eyeOrigin = plan.origin;
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
        endPoint = {
          x: firstHit.point.x,
          y: firstHit.point.y,
          z: firstHit.point.z
        };
        hitNormal = firstHit.face ? firstHit.face.normal : null;
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
      this.reloadingUntil <= now &&
      now - this.lastShotAt > 120;
    f.wantsJump = Boolean(this.keys.Space) && this.isPointerLocked; // jumps are neither queued nor consumed while input is disabled
    f.isAdsHeld = this.isRightMouseDown;
    f.weapon = this.currentWeapon;

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
            commandTimeMs(this.prediction.nextSeq + 1),
            this.lastFireCmdTimeMs,
            getEffectiveFireRateMs(WEAPONS[this.currentWeapon], this.isAiming)
          )
        ) {
          f.fire = true;
          f.shotSeq = this.shotSeq + 1;
        }
      }

      const cmd = this.prediction.buildCommand(f);
      this.syncMoveStateIn();
      this.simTimeMs = commandTimeMs(cmd.seq);
      const res = stepCommand(this.moveState, cmd, mapCfg, this.cmdScratchInput);
      this.syncMoveStateOut();
      this.prediction.record(cmd, this.moveState);

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
      if (res.slideStarted) this.callbacks.onSlide?.();
      if (res.jumped) this.callbacks.onJump?.();
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
          if (fx.line) this.scene.remove(fx.line);
          if (fx.spark) {
            this.scene.remove(fx.spark);
            this.sparkMeshPool?.push(fx.spark);
          }
          if (Array.isArray(fx.particles)) {
            for (const p of fx.particles) {
              this.scene.remove(p.mesh);
              this.sparkMeshPool?.push(p.mesh);
            }
          }
          fx.geo?.dispose();
          fx.mat?.dispose();
          fx.sparkMat?.dispose();
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
    if (typeof state.alive === 'boolean') {
      this.alive = state.alive;
      if (!this.alive) {
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
    this.currentLean += (targetLean - this.currentLean) * Math.min(1, dt * 14);
    if (Math.abs(this.currentLean) < 0.005) this.currentLean = 0;

    // Smooth eye height interpolation
    const targetEye = this.prone
      ? 0.52
      : this.isSliding
        ? 0.78
        : this.crouching
          ? 1.04
          : 1.62;
    this.currentEyeHeight += (targetEye - this.currentEyeHeight) * Math.min(1, dt * 13);

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

      if (now >= this.nextFootstepAt && !this.crouching && !this.prone) {
        this.nextFootstepAt = now + (this.isSprinting ? 335 : 460);
        this.callbacks.onFootstep?.(this.isSprinting);
      }
    } else {
      this.weaponBobTime = 0;
    }

    // Decay crosshair recoil kick & reset spray index smoothly without touching camera pitch/yaw!
    const effectiveFireRateMs = getEffectiveFireRateMs(cfg, this.isAiming);
    const recDelay = cfg.recoilRecoveryDelayMs || (effectiveFireRateMs + 35);
    this.crosshairRecoilKick = Math.max(0, this.crosshairRecoilKick - dt * (cfg.recoilRecovery || 14.0) * 0.018);
    if (now - this.lastShotAt > recDelay) {
      this.recoilShotIndex = Math.max(0, this.recoilShotIndex - dt * 28);
      if (this.recoilShotIndex < 0.2) this.recoilShotIndex = 0;
    }

    this.currentBloom = Math.max(0, this.currentBloom - (cfg.bloomDecay || 0.14) * dt);
    this.effectiveSpread = this.computeEffectiveSpread(cfg);
    const isMoving = horizSpeed > 0.65 || !this.onGround;
    this.callbacks.onSpreadUpdate?.(
      this.effectiveSpread,
      this.isAiming,
      isMoving,
      this.crosshairRecoilKick
    );

    // Decay damage flinch springs (punchPitch and punchRoll remain 0 when shooting)
    this.punchPitch = 0;
    this.punchRoll = 0;
    this.flinchPitch *= Math.max(0, 1 - dt * 14);
    this.flinchRoll *= Math.max(0, 1 - dt * 14);

    // Camera Strafe Roll, Slide Tilt & Tactical Q/E Lean Roll
    const leanRoll = -this.currentLean * (MATCH_CONFIG.LEAN_ROLL_ANGLE || 0.145);
    const targetRoll = (this.isSliding
      ? 0.055
      : -moveRight * (this.isSprinting ? 0.026 : 0.016)) + leanRoll;
    this.cameraRoll += (targetRoll - this.cameraRoll) * Math.min(1, dt * 14);

    const leanOffset = this.currentLean * (MATCH_CONFIG.LEAN_OFFSET || 0.42);
    const leanDropY = Math.abs(this.currentLean) * -0.055;

    // Update camera transform (no shooting recoil shake!)
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
      Math.max(-Math.PI / 2 + 0.04, Math.min(Math.PI / 2 - 0.04, this.pitch + this.flinchPitch)),
      this.yaw,
      this.cameraRoll + this.flinchRoll,
      'YXZ'
    );
    this.camera.quaternion.setFromEuler(this.tmpEuler);

    // Smooth Dynamic FOV (+0.25x / 1.25x zoomFov 54.4 for Holo & Red-Dot optics, 26 for Sniper)
    const targetFov = this.isAiming
      ? cfg.zoomFov
      : this.isSliding
        ? 77
        : this.isSprinting
          ? 74
          : 68;
    if (Math.abs(this.camera.fov - targetFov) > 0.05) {
      this.camera.fov += (targetFov - this.camera.fov) * Math.min(1, dt * 16);
      this.camera.updateProjectionMatrix();
    }

    // Update First-Person Weapon Viewmodel Animation
    this.recoilOffset = Math.max(0, this.recoilOffset - dt * 0.85);
    this.boltKickOffset = Math.max(0, this.boltKickOffset - dt * 8.5);
    const swayDecay = Math.exp(-10 * dt);
    this.swayX *= swayDecay;
    this.swayY *= swayDecay;

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
    const targetVmX = isAimingSteady
      ? adsPos.x
      : (this.isSprinting ? 0.17 : 0.24) + this.currentLean * 0.03;
    const targetVmY = (isReloading
      ? -0.27
      : isAimingSteady
        ? adsPos.y
        : -0.21) + equipDropY + this.landingDip * (isAimingSteady ? 0 : 0.45);
    const targetVmZ = isAimingSteady ? adsPos.z : -0.40;

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

    let targetRotX = isAimingSteady ? 0 : this.recoilOffset * 1.15;
    let targetRotY = 0;
    let targetRotZ = isAimingSteady ? 0 : -this.cameraRoll * 0.85;

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
    } else if (this.isSliding) {
      targetRotZ = 0.38;
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

    if (this.grenadeThrowUntil > now) {
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
    // Commands are produced every fixed step, so no separate keep-alive is needed while alive.
    if (now - this.lastInputBatchAt >= INPUT_BATCH_INTERVAL_MS) {
      const batch = this.prediction.buildBatch();
      if (batch) {
        this.lastInputBatchAt = now;
        this.callbacks.onInputBatch?.(batch);
      }
    }
  }

  animateHumanoidRig(rp, dt, now, isMoving, moveSpeed = 0) {
    animateHumanoidRig(rp, dt, now, isMoving, moveSpeed);
  }

  /**
   * Draws every remote player from its snapshot buffer at renderTime = estimated server time -
   * INTERP_DELAY_MS: linear interpolation between the two bracketing server snapshots, snap on teleport / respawn /
   * alive flip, <= 100 ms velocity extrapolation when starved. Animation speed (walk cycle, footsteps) is derived from
   * the interpolated motion. `now` is the frame time (performance.now() timebase).
   */
  updateRemotePlayers(dt, now) {
    const speedBlend = 1 - Math.exp(-15 * dt);
    const renderT = this.snapshots.renderTime(now);
    const out = this._remoteSample;

    for (const [id, rp] of this.remotePlayers.entries()) {
      if (!rp.alive) continue;
      if (!rp.velocity) rp.velocity = new THREE.Vector3(0, 0, 0);

      let rawSpeed = 0;
      const s = this.snapshots.sample(id, renderT, out);
      if (s) {
        rp.group.position.set(s.x, s.y, s.z);
        rp.group.rotation.y = s.yaw;
        rp.targetYaw = s.yaw;
        rp.targetPitch = s.pitch;
        rp.lean = s.lean;
        rp.crouching = s.crouching;
        rp.crouch = s.crouching;
        rp.prone = s.prone;
        rp.velocity.set(s.vx, s.vy, s.vz);
        rawSpeed = Math.hypot(s.vx, s.vz);
      } else {
        rp.velocity.set(0, 0, 0);
      }

      rp.smoothedSpeed = (rp.smoothedSpeed || 0) + (rawSpeed - (rp.smoothedSpeed || 0)) * speedBlend;
      if (rp.smoothedSpeed < 0.05) rp.smoothedSpeed = 0;

      const isMoving = rp.smoothedSpeed > 0.35;
      const rigMoveSpeed = rp.smoothedSpeed * 0.032;
      this.animateHumanoidRig(rp, dt, now, isMoving, rigMoveSpeed);

      const isGrounded = rp.onGround !== false && Math.abs(rp.velocity.y) < 0.85;
      if (this.inMatch && isMoving && rp.smoothedSpeed > 0.65 && isGrounded && !rp.crouch && !rp.crouching && !rp.prone) {
        const isRemoteSprinting = Boolean(
          rp.sprinting ||
          rp.isSprinting ||
          rp.smoothedSpeed > (MATCH_CONFIG.WALK_SPEED || 6.2) * 1.1
        );
        const stepCadenceMs = isRemoteSprinting ? 320 : 430;
        if (rp.nextFootstepAt && rp.nextFootstepAt - now > stepCadenceMs) {
          rp.nextFootstepAt = now + stepCadenceMs;
        }
        if (!rp.nextFootstepAt || now >= rp.nextFootstepAt) {
          rp.nextFootstepAt = now + stepCadenceMs;
          sfx.playSpatialFootstep(this.getAudioListenerState(), rp.group.position, isRemoteSprinting);
        }
      }
    }
  }

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

      // Avoid up/down WebGL backbuffer reallocation oscillation during gameplay (which stalls the GPU for 100-300ms)
      if (this.inMatch && this.currentFps < 38 && this.currentPixelRatio > this.quality.minPixelRatio) {
        this.lowFpsStreak = (this.lowFpsStreak || 0) + 1;
        if (this.lowFpsStreak >= 3) {
          this.lowFpsStreak = 0;
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
        this.animateHumanoidRig(
          this.lobbyOperator,
          dt,
          now,
          Boolean(this.lobbyWalkDemo),
          this.lobbyWalkDemo ? 0.18 : 0
        );
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

    // Update top-left Tactical Mini Map / Radar when in match
    if (this.inMatch && this.minimap) {
      const prevRenderAt = this.minimap.lastRenderAt;
      this.minimap.update({
        localPos: this.position,
        localYaw: this.yaw,
        localAlive: this.alive,
        remotePlayers: this.remotePlayers,
        pickups: this.pickupMeshes,
        droppedWeapons: this.droppedWeaponMeshes,
        now
      });
      if (this.minimap.ctx && this.minimap.lastRenderAt !== prevRenderAt) {
        const mCtx = this.minimap.ctx;
        for (const rp of this.remotePlayers.values()) {
          if (!rp || !rp.alive || !rp.group) continue;
          const rx = this.minimap.clampBlipCoord(this.minimap.worldToCanvasX(rp.group.position.x), 4);
          const ry = this.minimap.clampBlipCoord(this.minimap.worldToCanvasY(rp.group.position.z), 4);
          mCtx.fillStyle = '#ef4444';
          mCtx.strokeStyle = '#090d16';
          mCtx.lineWidth = 1.1;
          mCtx.beginPath();
          mCtx.arc(rx, ry, 3.2, 0, Math.PI * 2);
          mCtx.fill();
          mCtx.stroke();
        }
      }
    }

    for (const item of this.pickupMeshes.values()) {
      if (item.crossGroup.visible) {
        item.crossGroup.rotation.y = now * 0.0024;
        item.crossGroup.position.y = 1.12 + Math.sin(now * 0.004) * 0.15;
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
          this.scene.remove(fx.coreSphere);
          this.scene.remove(fx.fireballSphere);
          this.scene.remove(fx.blastWaveSphere);
          this.scene.remove(fx.shockwaveRing);
          this.scene.remove(fx.torusRing);
          this.scene.remove(fx.flashLight);
          if (fx.particles) {
            for (let p = 0; p < fx.particles.length; p++) {
              const pm = fx.particles[p].mesh;
              this.scene.remove(pm);
              if (this.sparkMeshPool && this.sparkMeshPool.length < 64) {
                this.sparkMeshPool.push(pm);
              }
            }
          }
          fx.coreMat.dispose();
          fx.fireballMat.dispose();
          fx.blastWaveMat.dispose();
          fx.shockwaveMat.dispose();
          fx.torusMat.dispose();
          fx.sparkMat.dispose();
        } else {
          this.scene.remove(fx.line);
          this.scene.remove(fx.spark);
          if (this.sparkMeshPool && this.sparkMeshPool.length < 64) {
            this.sparkMeshPool.push(fx.spark);
          }
          if (fx.particles) {
            for (let p = 0; p < fx.particles.length; p++) {
              const pm = fx.particles[p].mesh;
              this.scene.remove(pm);
              if (this.sparkMeshPool && this.sparkMeshPool.length < 64) {
                this.sparkMeshPool.push(pm);
              }
            }
          }
          fx.geo.dispose();
          fx.mat.dispose();
          fx.sparkMat.dispose();
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

          fx.flashLight.intensity = 8.5 * alpha * alpha;

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
          fx.mat.opacity = alpha;
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
    this.perfOverlay?.update(now, this.renderer, { tier: this.tier, pixelRatio: this.currentPixelRatio });
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
    this.renderer.domElement.requestPointerLock?.();
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
        setWeaponAdsCulling(this.viewmodelMeshes[this.currentWeapon], false);
        this.callbacks.onAimChange?.(false, this.currentWeapon);
      }
      this.callbacks.onPointerLockChange?.(this.isPointerLocked);
    });

    window.addEventListener('mousemove', (e) => {
      if (!this.isPointerLocked || !this.inMatch || !this.alive) return;
      const aimScale = this.isAiming && this.currentWeapon === 'sniper' ? 0.32 : this.isAiming ? 0.62 : 1.0;
      const sens = 0.0021 * this.sensitivity * aimScale;
      const dx = -e.movementX * sens;
      const dy = -e.movementY * sens;
      this.yaw += dx;
      this.pitch = Math.max(-Math.PI / 2 + 0.05, Math.min(Math.PI / 2 - 0.05, this.pitch + dy));

      this.swayX = Math.max(-0.045, Math.min(0.045, -e.movementX * 0.00055));
      this.swayY = Math.max(-0.045, Math.min(0.045, e.movementY * 0.00055));
    }, { passive: true });

    window.addEventListener('mousedown', (e) => {
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
      else if (e.code === 'KeyB') {
        this.callbacks.onLoadoutToggle?.();
      }
      else if (e.code === 'KeyG' && this.alive) {
        this.attemptThrowGrenade();
      }
      else if (e.code === 'KeyZ' && this.alive && this.onGround) {
        this.prone = !this.prone;
        if (this.prone) {
          this.isSprinting = false;
          this.isSliding = false;
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
      if (e.code === 'Tab') {
        e.preventDefault();
        this.callbacks.onScoreboardToggle?.(false);
      }
    }, { capture: true });
  }
}
