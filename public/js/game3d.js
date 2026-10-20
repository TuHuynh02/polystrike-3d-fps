import * as THREE from '../vendor/three/three.module.js';
import {
  DEFAULT_MAP_ID,
  MATCH_CONFIG,
  WEAPONS,
  WEAPON_ORDER,
  getEffectiveFireRateMs,
  getMapConfig,
  hasLineOfSight,
  isPointInsideInflatedBoxes,
  stepGrenade
} from '../shared/constants.js';
import { INTERP_DELAY_MAX_MS } from '../shared/config.js';
import { FIXED_DT, createMovementState } from '../shared/movement.js';
import { BTN, commandTimeMs, isFireIntervalOk, isValidMoveAck, stepCommand } from '../shared/netcode.js';
import { computeSpreadAmount, createShotState, planShot, resetShotState } from '../shared/spread.js';
import { ClientPrediction, INPUT_BATCH_INTERVAL_MS } from './prediction.js';
import { SnapshotInterpolator } from './snapshotBuffer.js';
import { buildSkyAndAtmosphere, buildArena } from './arenaBuilder.js';
import { createWeaponMesh, setWeaponAdsCulling } from './weaponModels.js';
import {
  createRemotePlayerMesh,
  animateHumanoidRig,
  disposeObject3D,
  getCachedGeo
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

/** A killed remote player's body stays drawn at most this long (ms) while the interpolated timeline catches up. */
const DEATH_BODY_MAX_MS = 1500;

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
    this.sharedSparkGeo = new THREE.SphereGeometry(0.034, 8, 8);
    this.sharedHitOrbGeo = new THREE.SphereGeometry(0.11, 14, 12);
    this.sharedShellGeo = new THREE.CylinderGeometry(0.011, 0.011, 0.046, 12);
    this.sharedShellGeo.rotateZ(Math.PI / 2);
    this.sharedShellMat = new THREE.MeshStandardMaterial({
      color: 0xfacc15,
      metalness: 0.85,
      roughness: 0.25,
      emissive: 0xca8a04,
      emissiveIntensity: 0.15
    });
    this.sharedDecalGeo = new THREE.CircleGeometry(0.11, 16);
    this.sharedDecalMat = new THREE.MeshBasicMaterial({
      color: 0x050811,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2
    });
    this.sharedGrenadeBodyGeo = new THREE.SphereGeometry(0.11, 16, 14);
    this.sharedGrenadeBandGeo = new THREE.CylinderGeometry(0.116, 0.116, 0.044, 16);
    this.sharedGrenadeCapGeo = new THREE.CylinderGeometry(0.045, 0.055, 0.068, 12);
    this.sharedGrenadeRingGeo = new THREE.TorusGeometry(0.036, 0.008, 10, 18);
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
    this.sharedExplosionSphereGeo = new THREE.SphereGeometry(1, 20, 16);
    this.sharedShockwaveRingGeo = new THREE.RingGeometry(0.58, 1.0, 36);
    this.sharedShockwaveTorusGeo = new THREE.TorusGeometry(0.85, 0.08, 12, 32);

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
    // Server-timestamped snapshot buffers of the remote players; they are drawn at (server time - adaptive interpolation delay)
    this.snapshots = new SnapshotInterpolator();
    this.netStats = { starvedMs: 0, starveEvents: 0, starving: false, rttMs: 0 };
    this._remoteSample = {};
    this._remoteScratch = [];
    this.pickupMeshes = new Map();  // pickupId -> { group, crossGroup, ringMesh, padMat }
    this.jumpPadMeshes = [];        // Jump pad groups & animated rings
    this.barrelMeshes = new Map();  // barrelId -> { group, bodyGroup, hitboxMesh, padMat, active }
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
    this.gameMode = 'ffa';
    this.localTeam = null;
    this.alive = true;
    this.armor = 0;
    this.speedBoostUntil = 0;
    this.damageBoostUntil = 0;
    this.grenades = 1;
    this.grenadeThrowUntil = 0;
    this.lastGrenadeThrowAt = -2000;
    this.isCookingGrenade = false;
    this.grenadeCookStartAt = 0;
    this.grenadeCookMaxMs = MATCH_CONFIG.GRENADE_FUSE_MS || 3000;
    this._grenadeSimScratch = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0 };
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
    this.pendingRecoilPitch = 0;
    this.pendingRecoilYaw = 0;
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

    // Build 3D environment, weapon viewmodels, grenade trajectory preview & lobby 3D humanoid operator showcase
    this.setupLights();
    this.loadMap(DEFAULT_MAP_ID);
    this.setupViewmodelWeapons();
    this.setupGrenadePreview();
    this.setupLobbyShowcase();
    this.bindEvents();

    // Start render loop
    this.animate = this.animate.bind(this);
    requestAnimationFrame(this.animate);
  }

  setupLights() {
    this.hemiLight = new THREE.HemisphereLight(0xc4ddf7, 0x222933, 1.18);
    this.hemiLight.position.set(0, 75, 0);
    this.scene.add(this.hemiLight);

    // Primary warm directional sunlight with static baked shadow map covering the arena
    this.dirLight = new THREE.DirectionalLight(0xfff3e0, 1.56);
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
    this.rimLight = new THREE.DirectionalLight(0x7aa2c4, 0.92);
    this.rimLight.position.set(-58, 52, -52);
    this.scene.add(this.rimLight);

    // Central tactical command point light
    this.citadelLight = new THREE.PointLight(0xe5a024, 2.2, 42, 1.4);
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

        this.scene.add(group);
        item = { group, crossGroup, padMat, holoRing, type: pType, x: p.x, y: p.y, z: p.z, active: Boolean(p.active) };
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
    for (const b of barrelsData) {
      let item = this.barrelMeshes.get(b.id);
      if (!item) {
        const group = new THREE.Group();
        group.position.set(b.x || 0, b.y || 0, b.z || 0);

        const padGeo = new THREE.CylinderGeometry(0.68, 0.76, 0.08, 16);
        const padMat = new THREE.MeshStandardMaterial({
          color: 0x1e293b,
          emissive: 0xef4444,
          emissiveIntensity: 0.55,
          roughness: 0.4,
          metalness: 0.6
        });
        const padMesh = new THREE.Mesh(padGeo, padMat);
        padMesh.position.y = 0.04;
        group.add(padMesh);

        const bodyGroup = new THREE.Group();
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
          x: b.x || 0,
          y: b.y || 0,
          z: b.z || 0,
          hp: b.hp ?? (MATCH_CONFIG.BARREL_MAX_HP || 60),
          active: Boolean(b.active !== false)
        };
        this.barrelMeshes.set(b.id, item);
      } else {
        item.x = b.x || 0;
        item.y = b.y || 0;
        item.z = b.z || 0;
        item.group.position.set(item.x, item.y, item.z);
        if (typeof b.hp === 'number') item.hp = b.hp;
      }

      const isActive = Boolean(b.active !== false);
      item.active = isActive;
      item.bodyGroup.visible = isActive;
      item.padMat.emissiveIntensity = isActive ? 0.55 : 0.06;
    }
    this.rebuildHitboxList();
  }

  updateBarrelSingle(data) {
    if (!data || !data.id) return;
    const item = this.barrelMeshes.get(data.id);
    if (!item) return;
    if (typeof data.hp === 'number') item.hp = data.hp;
    if (typeof data.active === 'boolean') {
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
    this.muzzleLight.position.set(0.24, -0.16, -1.30);
    this.camera.add(this.muzzleLight);

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
    this.cancelGrenadeCooking();
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
    this.pendingRecoilPitch = 0;
    this.pendingRecoilYaw = 0;

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

    this.cancelGrenadeCooking();
    this.isAiming = false;
    this.adsToggleActive = false;
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
            const cacheKey = `wep_${p.weapon}_${gunPartIdx++}`;
            const cachedGeo = getCachedGeo(cacheKey, () => o.geometry);
            if (cachedGeo !== o.geometry) {
              o.geometry.dispose();
              o.geometry = cachedGeo;
            }
            if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere();
            o.frustumCulled = true;
          }
        });
        rp.gunHolder.add(rp.gunMesh);
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

  spawnShellCasing() {
    if (!this.shellPool) this.shellPool = [];
    const entry = this.shellPool.pop();
    const shell = entry ? entry.mesh : new THREE.Mesh(this.sharedShellGeo, this.sharedShellMat);
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
    if (entry) {
      entry.vx = this.tmpVec3B.x;
      entry.vy = this.tmpVec3B.y;
      entry.vz = this.tmpVec3B.z;
      entry.rx = (Math.random() - 0.5) * 22;
      entry.ry = (Math.random() - 0.5) * 22;
      entry.rz = (Math.random() - 0.5) * 22;
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
        createdAt: performance.now(),
        duration: 650
      });
    }
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
    if (fx.spark) {
      this.scene.remove(fx.spark);
      if (this.sparkMeshPool && this.sparkMeshPool.length < 64) {
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
          if (this.sparkMeshPool && this.sparkMeshPool.length < 64) {
            this.sparkMeshPool.push(pm);
          }
          pt.mesh = null;
        }
        if (this.tracerParticlePool.length < 160) {
          this.tracerParticlePool.push(pt);
        }
      }
      fx.particles.length = 0;
    }
    if (fx.sparkMat) {
      if (!this.sparkMatPool) this.sparkMatPool = [];
      if (this.sparkMatPool.length < 32) {
        this.sparkMatPool.push(fx.sparkMat);
      } else {
        fx.sparkMat.dispose();
      }
    }
    fx.line = null;
    fx.spark = null;
    fx.geo = null;
    fx.mat = null;
    fx.sparkMat = null;
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
        opacity: 0.98
      });
      line = new THREE.Line(geo, mat);
      line.frustumCulled = false;
    }
    this.scene.add(line);

    const sparkColor = isPlayerHit ? 0xef4444 : colorHex;
    if (!this.sparkMatPool) this.sparkMatPool = [];
    const sparkMat = this.sparkMatPool.pop() || new THREE.MeshBasicMaterial({
      color: sparkColor,
      transparent: true,
      opacity: 1
    });
    sparkMat.color.setHex(sparkColor);
    sparkMat.opacity = 1;
    if (!this.sparkMeshPool) this.sparkMeshPool = [];
    const spark = this.sparkMeshPool.pop() || new THREE.Mesh(this.sharedHitOrbGeo, sparkMat);
    spark.geometry = this.sharedHitOrbGeo;
    spark.material = sparkMat;
    spark.position.copy(this.tmpVec3B);
    spark.scale.setScalar(isPlayerHit ? 1.45 : 0.95);
    this.scene.add(spark);

    if (!this.tracerEffectPool) this.tracerEffectPool = [];
    if (!this.tracerParticlePool) this.tracerParticlePool = [];
    const fx = this.tracerEffectPool.pop() || {
      type: 'tracer',
      ss: 0,
      line: null,
      spark: null,
      particles: [],
      geo: null,
      mat: null,
      sparkMat: null,
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
      isPlayerHit: false,
      createdAt: 0,
      duration: 145
    };
    const particles = fx.particles;
    particles.length = 0;

    const pCount = isPlayerHit ? 5 : 3;
    const nx = hitNormal ? hitNormal.x : -ux * 0.6;
    const ny = hitNormal ? hitNormal.y : Math.max(0.35, -uy * 0.6);
    const nz = hitNormal ? hitNormal.z : -uz * 0.6;
    for (let i = 0; i < pCount; i++) {
      const pMesh = this.sparkMeshPool.pop() || new THREE.Mesh(this.sharedSparkGeo, sparkMat);
      pMesh.geometry = this.sharedSparkGeo;
      pMesh.material = sparkMat;
      pMesh.scale.setScalar(isPlayerHit ? 1.25 : 0.95);
      pMesh.position.copy(this.tmpVec3B);
      const pt = this.tracerParticlePool.pop() || { mesh: null, vx: 0, vy: 0, vz: 0 };
      pt.mesh = pMesh;
      pt.vx = nx * 3.2 + (Math.random() - 0.5) * 5.0;
      pt.vy = ny * 3.2 + Math.random() * 3.8;
      pt.vz = nz * 3.2 + (Math.random() - 0.5) * 5.0;
      particles.push(pt);
      this.scene.add(pMesh);
    }

    if (!isPlayerHit && hitNormal) {
      this.spawnBulletDecal(hitPoint, hitNormal);
    }

    const bulletSpeed = 195; // m/s fast visual tracer bolt velocity
    const travelMs = Math.max(26, Math.min(115, (totalDist / bulletSpeed) * 1000));

    fx.type = 'tracer';
    fx.ss = ss;
    fx.line = line;
    fx.spark = spark;
    fx.geo = geo;
    fx.mat = mat;
    fx.sparkMat = sparkMat;
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
    fx.isPlayerHit = Boolean(isPlayerHit);
    fx.createdAt = performance.now();
    fx.duration = Math.max(120, Math.round(travelMs + 55));
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
          ? `🛡️ VỠ -${roundedDamage}`
          : isHeadshot
            ? `🎯 -${roundedDamage}`
            : armorHit
              ? `🛡️ -${roundedDamage}`
              : isKill
                ? `💀 -${roundedDamage}`
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
    const runRecoilPenalty = (isMovingWhileShooting && !isLowPosture) ? 1.22 : 1.0;
    const postureMult =
      (this.isAiming ? 0.65 : 1.0) *
      (this.prone ? 0.48 : (this.crouching && !this.isSliding) ? 0.70 : 1.0) *
      runRecoilPenalty;
    const chKick = (cfg.crosshairKick || 0.018) * postureMult;
    this.crosshairRecoilKick = Math.min(0.11, this.crosshairRecoilKick + chKick);

    const patternArr = cfg.recoilPattern;
    const patIdx = Math.max(0, Math.min((patternArr?.length || 1) - 1, Math.floor(this.recoilShotIndex) - 1));
    const patDir = patternArr ? patternArr[patIdx] : ((Math.floor(this.recoilShotIndex) % 2 === 0) ? 1 : -1);
    const climbFactor = 1 + Math.min(8, Math.max(0, this.recoilShotIndex - 1)) * (cfg.recoilClimbMult || 0.08);
    const maxRecPitch = cfg.recoilMaxPitch || 0.095;
    const rawKickPitch = (cfg.recoilPitch || 0.011) * climbFactor * postureMult;
    const availPitch = Math.max(0, maxRecPitch - (this.accumulatedRecoilPitch + (this.pendingRecoilPitch || 0)));
    const kickPitch = Math.min(availPitch, rawKickPitch);
    const kickYaw = (cfg.recoilYaw || 0.004) * patDir * postureMult;
    this.pendingRecoilPitch = (this.pendingRecoilPitch || 0) + kickPitch;
    this.pendingRecoilYaw = (this.pendingRecoilYaw || 0) + kickYaw;
    this.punchPitch = Math.min(0.018, (this.punchPitch || 0) + kickPitch * 0.42);
    this.punchRoll = patDir * Math.min(0.008, Math.abs(kickYaw) * 0.65);

    // 3D weapon viewmodel kickback & reciprocating bolt/pump animation
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
    this.muzzleLight.intensity = this.quality.dynamicLights >= 1 ? 3.2 : 0;

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
    const eyeOrigin = plan.origin;
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
        endPoint = {
          x: firstHit.point.x,
          y: firstHit.point.y,
          z: firstHit.point.z
        };
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
    const recDelay = cfg.recoilRecoveryDelayMs || (effectiveFireRateMs + 35);
    const stanceRecBoost = this.prone ? 1.35 : (this.crouching && !this.isSliding) ? 1.18 : 1.0;
    this.crosshairRecoilKick = Math.max(0, this.crosshairRecoilKick - dt * (cfg.recoilRecovery || 14.0) * stanceRecBoost * 0.018);

    if (this.pendingRecoilPitch || this.pendingRecoilYaw) {
      const kickStep = Math.min(1, dt * 36);
      const dp = this.pendingRecoilPitch * kickStep;
      const dy = this.pendingRecoilYaw * kickStep;
      this.pendingRecoilPitch -= dp;
      this.pendingRecoilYaw -= dy;
      if (Math.abs(this.pendingRecoilPitch) < 1e-5) this.pendingRecoilPitch = 0;
      if (Math.abs(this.pendingRecoilYaw) < 1e-5) this.pendingRecoilYaw = 0;
      const prevPitch = this.pitch;
      this.pitch = Math.max(-Math.PI / 2 + 0.05, Math.min(Math.PI / 2 - 0.05, this.pitch + dp));
      this.accumulatedRecoilPitch += (this.pitch - prevPitch);
      this.yaw += dy;
      this.accumulatedRecoilYaw += dy;
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
    const isStanceSteady = Boolean(this.onGround && (this.prone || (this.crouching && !this.isSliding)));
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

    // Camera Strafe Roll, Slide Tilt & Tactical Q/E Lean Roll
    const leanRoll = -this.currentLean * (MATCH_CONFIG.LEAN_ROLL_ANGLE || 0.145);
    const targetRoll = (this.isSliding
      ? 0.055
      : -moveRight * (this.isSprinting ? 0.026 : 0.016)) + leanRoll;
    this.cameraRoll += (targetRoll - this.cameraRoll) * Math.min(1, dt * 14);

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

    // Smooth Dynamic FOV (+0.25x / 1.25x zoomFov 54.4 for Holo & Red-Dot optics, 26 for Sniper)
    const targetFov = this.isAiming
      ? cfg.zoomFov
      : this.isSliding
        ? 77
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
      this.animateHumanoidRig(rp, dt, now, isMoving, rigMoveSpeed);

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
        for (const [rpId, rp] of this.remotePlayers.entries()) {
          if (!rp || !rp.alive || !rp.group) continue;
          const rx = this.minimap.clampBlipCoord(this.minimap.worldToCanvasX(rp.group.position.x), 4);
          const ry = this.minimap.clampBlipCoord(this.minimap.worldToCanvasY(rp.group.position.z), 4);
          const isTeammate = Boolean(this.gameMode === 'tdm' && this.localTeam && rp.team && rp.team === this.localTeam);
          if (isTeammate) {
            mCtx.fillStyle = '#38bdf8';
            mCtx.strokeStyle = '#090d16';
            mCtx.lineWidth = 1.1;
            mCtx.beginPath();
            mCtx.arc(rx, ry, 3.4, 0, Math.PI * 2);
            mCtx.fill();
            mCtx.stroke();
            continue;
          }
          const distToMe = Math.hypot(rp.group.position.x - this.position.x, rp.group.position.z - this.position.z);
          const isStealthStance = Boolean(rp.prone || rp.crouching || rp.crouch);
          const hasGunfireBlip = Boolean(this.minimap.gunfireBlips?.has(rpId));
          const blipAlpha = hasGunfireBlip
            ? 1.0
            : (isStealthStance && distToMe > 24)
              ? 0.28
              : 0.92;
          mCtx.fillStyle = blipAlpha >= 0.9 ? '#ef4444' : `rgba(239, 68, 68, ${blipAlpha})`;
          mCtx.strokeStyle = '#090d16';
          mCtx.lineWidth = 1.1;
          mCtx.beginPath();
          mCtx.arc(rx, ry, hasGunfireBlip ? 3.6 : 3.1, 0, Math.PI * 2);
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
        this.cancelGrenadeCooking();
        setWeaponAdsCulling(this.viewmodelMeshes[this.currentWeapon], false);
        this.callbacks.onAimChange?.(false, this.currentWeapon);
      }
      this.callbacks.onPointerLockChange?.(this.isPointerLocked);
    });

    window.addEventListener('mousemove', (e) => {
      if (!this.isPointerLocked || !this.inMatch || !this.alive) return;
      const aimScale = this.isAiming && this.currentWeapon === 'sniper' ? 0.36 : this.isAiming ? 0.78 : 1.0;
      const sens = 0.0021 * this.sensitivity * aimScale;
      const dx = -e.movementX * sens;
      const dy = -e.movementY * sens;
      this.yaw += dx;
      this.pitch = Math.max(-Math.PI / 2 + 0.05, Math.min(Math.PI / 2 - 0.05, this.pitch + dy));
      if (dy < 0 && this.accumulatedRecoilPitch > 0) {
        this.accumulatedRecoilPitch = Math.max(0, this.accumulatedRecoilPitch + dy);
      }

      this.swayX = Math.max(-0.045, Math.min(0.045, -e.movementX * 0.00055));
      this.swayY = Math.max(-0.045, Math.min(0.045, e.movementY * 0.00055));
      if (dx * this.accumulatedRecoilYaw < 0) {
        const prevSign = Math.sign(this.accumulatedRecoilYaw);
        this.accumulatedRecoilYaw += dx;
        if (Math.sign(this.accumulatedRecoilYaw) !== prevSign) {
          this.accumulatedRecoilYaw = 0;
        }
      }
      this.swayRotY = Math.max(-0.085, Math.min(0.085, (this.swayRotY || 0) - e.movementX * 0.00075));
      this.swayRotX = Math.max(-0.065, Math.min(0.065, (this.swayRotX || 0) - e.movementY * 0.00065));
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
        this.startGrenadeCooking();
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
