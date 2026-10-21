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

import { SceneWorldMethods } from './game3d/sceneWorld.js';
import { GrenadeMethods } from './game3d/grenades.js';
import { WeaponsAndShowcaseMethods } from './game3d/weaponsAndShowcase.js';
import { RemotePlayersMethods } from './game3d/remotePlayers.js';
import { CombatEffectsMethods } from './game3d/combatEffects.js';
import { PhysicsAndNetcodeMethods } from './game3d/physicsAndNetcode.js';
import { LoopAndInputMethods } from './game3d/loopAndInput.js';

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
}

for (const Mixin of [
  SceneWorldMethods,
  GrenadeMethods,
  WeaponsAndShowcaseMethods,
  RemotePlayersMethods,
  CombatEffectsMethods,
  PhysicsAndNetcodeMethods,
  LoopAndInputMethods
]) {
  const descs = Object.getOwnPropertyDescriptors(Mixin.prototype);
  delete descs.constructor;
  Object.defineProperties(Game3D.prototype, descs);
}
