import * as THREE from '../vendor/three/three.module.js';
import {
  DEFAULT_MAP_ID,
  MATCH_CONFIG,
  WEAPONS,
  WEAPON_ORDER,
  getMapConfig
} from '../shared/constants.js';
import { buildSkyAndAtmosphere, buildArena } from './arenaBuilder.js';
import { createWeaponMesh } from './weaponModels.js';
import {
  createPlayerNameSprite,
  createRemotePlayerMesh,
  animateHumanoidRig
} from './humanoidRig.js';
import { TacticalMinimap } from './minimap.js';

export class Game3D {
  constructor(container, callbacks) {
    this.container = container;
    this.callbacks = callbacks;

    // Three.js core scene & fog
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x070d19);
    this.scene.fog = new THREE.FogExp2(0x091224, 0.0052);

    this.camera = new THREE.PerspectiveCamera(
      68,
      window.innerWidth / window.innerHeight,
      0.08,
      420
    );
    this.scene.add(this.camera);

    this.renderer = new THREE.WebGLRenderer({
      antialias: window.devicePixelRatio <= 1.5,
      powerPreference: 'high-performance'
    });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.maxPixelRatio = Math.min(window.devicePixelRatio || 1, 1.35);
    this.currentPixelRatio = this.maxPixelRatio;
    this.renderer.setPixelRatio(this.currentPixelRatio);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.shadowMap.autoUpdate = false;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.22;
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
    this.pickupMeshes = new Map();  // pickupId -> { group, crossGroup, ringMesh, padMat }
    this.droppedWeaponMeshes = new Map(); // dropId -> { group, gunSpinGroup, ringMat }
    this.nearbyDrop = null;
    this.activeEffects = [];        // Tracers, spark bursts, floating damage numbers
    this.activeShells = [];         // Ejected 3D brass shell casings
    this.bulletDecals = [];         // Pooled ring buffer of surface bullet holes (max 36)
    this.maxBulletDecals = 36;
    this.citadelRings = [];
    this.ambientParticles = null;

    // Local player state & tactical movement physics
    this.inMatch = false;
    this.isPointerLocked = false;
    this.localId = null;
    this.alive = true;
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
    this.lastMoveSentAt = 0;
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
    this.hemiLight = new THREE.HemisphereLight(0x93c5fd, 0x0f172a, 1.08);
    this.hemiLight.position.set(0, 75, 0);
    this.scene.add(this.hemiLight);

    // Primary warm directional sunlight with static baked shadow map covering the arena
    this.dirLight = new THREE.DirectionalLight(0xfff7ed, 1.55);
    this.dirLight.position.set(56, 86, 46);
    this.dirLight.castShadow = true;
    this.dirLight.shadow.mapSize.width = 1024;
    this.dirLight.shadow.mapSize.height = 1024;
    this.dirLight.shadow.camera.near = 5;
    this.dirLight.shadow.camera.far = 230;
    const d = 68;
    this.dirLight.shadow.camera.left = -d;
    this.dirLight.shadow.camera.right = d;
    this.dirLight.shadow.camera.top = d;
    this.dirLight.shadow.camera.bottom = -d;
    this.dirLight.shadow.bias = -0.0005;
    this.scene.add(this.dirLight);

    // Cool rim light from opposite angle for 3D depth & metallic specular highlights
    this.rimLight = new THREE.DirectionalLight(0x38bdf8, 0.72);
    this.rimLight.position.set(-58, 52, -52);
    this.scene.add(this.rimLight);

    // Central Citadel energy core point light
    this.citadelLight = new THREE.PointLight(0x38bdf8, 2.8, 42, 1.4);
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

    this.clearPickups();
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

    const theme = mapCfg.theme || {};
    this.scene.background = new THREE.Color(theme.fogColor || 0x091224);
    this.scene.fog = new THREE.FogExp2(theme.fogColor || 0x091224, (theme.fogDensity || 0.005) * 0.82);

    const accentHex = theme.accentHex || 0x38bdf8;

    if (this.citadelLight) {
      this.citadelLight.color.setHex(accentHex);
    }
    if (this.rimLight) {
      this.rimLight.color.setHex(accentHex);
    }
    if (this.dirLight) {
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
          opacity: 0.72
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
      opacity: 0.85
    });
    const ringMesh = new THREE.Mesh(ringGeo, ringMat);
    ringMesh.rotation.x = -Math.PI / 2;
    ringMesh.position.y = 0.03;
    group.add(ringMesh);

    const gunSpinGroup = new THREE.Group();
    gunSpinGroup.position.y = 0.36;
    const gunMesh = this.createWeaponMesh(drop.weapon, false);
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
        obj.geometry?.dispose();
        if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose());
        else obj.material?.dispose();
      }
    });
    this.droppedWeaponMeshes.delete(dropId);
    if (this.nearbyDrop && this.nearbyDrop.id === dropId) {
      this.nearbyDrop = null;
      this.callbacks.onNearbyWeaponChange?.(null, 0);
    }
  }

  createWeaponMesh(weaponId, isFirstPerson = false) {
    return createWeaponMesh(weaponId, isFirstPerson);
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

    this.lobbyKeyLight = new THREE.PointLight(0xffffff, 2.1, 6.5, 1.2);
    this.lobbyKeyLight.position.set(1.25, 2.25, 1.5);
    this.lobbyShowcaseGroup.add(this.lobbyKeyLight);

    this.lobbyRimLight = new THREE.PointLight(0x38bdf8, 1.8, 6.0, 1.2);
    this.lobbyRimLight.position.set(-1.35, 1.85, -0.95);
    this.lobbyShowcaseGroup.add(this.lobbyRimLight);

    this.lobbyFillLight = new THREE.PointLight(0xf59e0b, 0.9, 5.5, 1.5);
    this.lobbyFillLight.position.set(0.1, 0.65, 1.6);
    this.lobbyShowcaseGroup.add(this.lobbyFillLight);

    const pedGroup = new THREE.Group();
    const baseRingMat = new THREE.MeshStandardMaterial({
      color: 0x0f172a,
      roughness: 0.25,
      metalness: 0.85
    });
    const chromeRimMat = new THREE.MeshStandardMaterial({
      color: 0x64748b,
      roughness: 0.2,
      metalness: 0.9
    });
    this.lobbyPedestalGlowMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.85
    });
    this.lobbyHoloConeMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.09,
      depthWrite: false
    });

    const outerDeck = new THREE.Mesh(new THREE.CylinderGeometry(0.68, 0.78, 0.07, 16), baseRingMat);
    outerDeck.position.y = -0.035;
    const innerPad = new THREE.Mesh(new THREE.CylinderGeometry(0.54, 0.58, 0.08, 24), chromeRimMat);
    innerPad.position.y = -0.025;
    this.lobbyHoloRingOuter = new THREE.Mesh(new THREE.RingGeometry(0.58, 0.65, 32), this.lobbyPedestalGlowMat);
    this.lobbyHoloRingOuter.rotation.x = -Math.PI / 2;
    this.lobbyHoloRingOuter.position.y = 0.018;
    this.lobbyHoloRingInner = new THREE.Mesh(new THREE.RingGeometry(0.36, 0.40, 24), this.lobbyPedestalGlowMat);
    this.lobbyHoloRingInner.rotation.x = -Math.PI / 2;
    this.lobbyHoloRingInner.position.y = 0.02;
    const holoField = new THREE.Mesh(new THREE.CylinderGeometry(0.58, 0.54, 0.48, 24, 1, true), this.lobbyHoloConeMat);
    holoField.position.y = 0.24;

    pedGroup.add(outerDeck, innerPad, this.lobbyHoloRingOuter, this.lobbyHoloRingInner, holoField);
    this.lobbyShowcaseGroup.add(pedGroup);

    this.lobbyOperatorColor = 0x38bdf8;
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
      op.gunMesh.traverse((obj) => {
        if (obj.isMesh) obj.geometry?.dispose();
      });
      op.gunMesh = this.createWeaponMesh(weaponId, false);
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
    this.isSprinting = false;
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

  createRemotePlayerMesh(playerData, options = {}) {
    return createRemotePlayerMesh(playerData, {
      scene: this.scene,
      defaultColor: this.lobbyOperatorColor || 0x38bdf8,
      ...options
    });
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
    rp.group.traverse((obj) => {
      if (obj.isMesh) {
        obj.geometry?.dispose();
      }
    });
  }

  clearAllRemotePlayers() {
    for (const rp of this.remotePlayers.values()) {
      this.disposeRemotePlayer(rp);
    }
    this.remotePlayers.clear();
    this.rebuildHitboxList();
  }

  syncPlayersState(playersArray = []) {
    const now = performance.now();
    if (!this._seenPlayerIds) {
      this._seenPlayerIds = new Set();
    }
    const seenIds = this._seenPlayerIds;
    seenIds.clear();
    let hitboxesDirty = false;

    for (const p of playersArray) {
      if (p.id === this.localId) {
        this.alive = Boolean(p.alive);
        continue;
      }

      seenIds.add(p.id);
      let rp = this.remotePlayers.get(p.id);
      if (!rp) {
        rp = this.createRemotePlayerMesh(p);
        rp.group.position.set(p.x, p.y, p.z);
        rp.group.rotation.y = p.yaw || 0;
        rp.serverPos = new THREE.Vector3(p.x, p.y, p.z);
        rp.velocity = new THREE.Vector3(0, 0, 0);
        rp.lastSyncAt = now;
        rp.smoothedSpeed = 0;
        this.remotePlayers.set(p.id, rp);
        hitboxesDirty = true;
      }

      if (!rp.serverPos) rp.serverPos = new THREE.Vector3(p.x, p.y, p.z);
      if (!rp.velocity) rp.velocity = new THREE.Vector3(0, 0, 0);

      const nowAlive = Boolean(p.alive);
      const snapDist = Math.hypot(p.x - rp.group.position.x, p.z - rp.group.position.z);
      if (rp.alive !== nowAlive) {
        hitboxesDirty = true;
        if (nowAlive) {
          rp.group.position.set(p.x, p.y, p.z);
          rp.group.rotation.y = p.yaw || 0;
          rp.serverPos.set(p.x, p.y, p.z);
          rp.velocity.set(0, 0, 0);
          rp.smoothedSpeed = 0;
        }
      } else if (snapDist > 12) {
        rp.group.position.set(p.x, p.y, p.z);
        rp.serverPos.set(p.x, p.y, p.z);
        rp.velocity.set(0, 0, 0);
      } else {
        const dtSync = rp.lastSyncAt ? (now - rp.lastSyncAt) / 1000 : 0;
        if (typeof p.vx === 'number' && typeof p.vz === 'number') {
          rp.velocity.set(p.vx, p.vy || 0, p.vz);
        } else if (dtSync > 0.012 && dtSync < 0.35) {
          const maxV = (MATCH_CONFIG.SLIDE_INITIAL_SPEED || 11.2) * 1.25;
          const instVx = Math.max(-maxV, Math.min(maxV, (p.x - rp.serverPos.x) / dtSync));
          const instVy = Math.max(-25, Math.min(20, (p.y - rp.serverPos.y) / dtSync));
          const instVz = Math.max(-maxV, Math.min(maxV, (p.z - rp.serverPos.z) / dtSync));
          rp.velocity.x = rp.velocity.x * 0.35 + instVx * 0.65;
          rp.velocity.y = rp.velocity.y * 0.35 + instVy * 0.65;
          rp.velocity.z = rp.velocity.z * 0.35 + instVz * 0.65;
          if (Math.hypot(p.x - rp.serverPos.x, p.z - rp.serverPos.z) < 0.008) {
            rp.velocity.set(0, 0, 0);
          }
        }
        rp.serverPos.set(p.x, p.y, p.z);
      }

      rp.lastSyncAt = now;
      rp.targetPos.set(p.x, p.y, p.z);
      rp.targetYaw = p.yaw || 0;
      rp.targetPitch = p.pitch || 0;
      rp.crouching = Boolean(p.crouching);
      rp.prone = Boolean(p.prone);
      rp.lean = Number(p.lean || 0);
      rp.alive = nowAlive;
      rp.group.visible = nowAlive;

      if (p.weapon && WEAPONS[p.weapon] && p.weapon !== rp.currentWeapon) {
        rp.currentWeapon = p.weapon;
        rp.gunHolder.remove(rp.gunMesh);
        rp.gunMesh.traverse((obj) => {
          if (obj.isMesh) obj.geometry?.dispose();
        });
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
        hitboxesDirty = true;
      }
    }

    if (hitboxesDirty) {
      this.rebuildHitboxList();
    }
  }

  spawnLocalPlayer(data) {
    this.position.set(data.x, data.y || 0.1, data.z);
    this.velocity.set(0, 0, 0);
    this.yaw = data.yaw || 0;
    this.pitch = 0;
    this.cameraRoll = 0;
    this.alive = true;
    this.lastShotAt = -1000;
    this.reloadingUntil = 0;
    this.nextShellAt = 0;
    this.pumpCycleUntil = 0;
    this.isAiming = false;
    this.isSprinting = false;
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
    this.meleeSwingUntil = 0;
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

  spawnTracerEffect(origin, hitPoint, colorHex = 0xfef08a, isPlayerHit = false, hitNormal = null) {
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

  triggerRemoteShotEffect(shooterId, weaponId, origin, hitPoint) {
    const rp = this.remotePlayers.get(shooterId);
    if (rp && rp.alive) {
      rp.lastShotFlashAt = performance.now();
      if (rp.gunMesh?.userData?.flashMesh) {
        rp.gunMesh.userData.flashMesh.visible = true;
      }
      rp.armPivot.rotation.x += 0.14;
    }

    const wColor = WEAPONS[weaponId]?.color || 0xfef08a;
    this.spawnTracerEffect(origin, hitPoint, wColor, false, null);
  }

  spawnDamagePopup(targetId, damage, isHeadshot = false) {
    const rp = this.remotePlayers.get(targetId);
    if (!rp) return;

    const canvas = document.createElement('canvas');
    canvas.width = 160;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');

    ctx.font = isHeadshot ? '900 34px Segoe UI, sans-serif' : '800 28px Segoe UI, sans-serif';
    ctx.textAlign = 'center';
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.9)';
    ctx.lineWidth = 5;
    const text = isHeadshot ? `🎯 -${damage}` : `-${damage}`;
    ctx.strokeText(text, 80, 44);
    ctx.fillStyle = isHeadshot ? '#facc15' : '#f8fafc';
    ctx.fillText(text, 80, 44);

    const tex = new THREE.CanvasTexture(canvas);
    const mat = new THREE.SpriteMaterial({
      map: tex,
      transparent: true,
      depthTest: false
    });
    const sprite = new THREE.Sprite(mat);
    sprite.position.set(
      rp.group.position.x + (Math.random() - 0.5) * 0.45,
      rp.group.position.y + (isHeadshot ? 2.15 : 1.55),
      rp.group.position.z + (Math.random() - 0.5) * 0.45
    );
    sprite.scale.set(isHeadshot ? 1.45 : 1.1, isHeadshot ? 0.58 : 0.44, 1);
    sprite.renderOrder = 15;
    this.scene.add(sprite);

    this.activeEffects.push({
      type: 'popup',
      sprite,
      tex,
      mat,
      vy: 1.65,
      createdAt: performance.now(),
      duration: 620
    });
  }

  applyDamageFlinch(damage = 20) {
    const scale = Math.min(1.2, damage / 40);
    this.flinchPitch = Math.min(0.025, this.flinchPitch + 0.01 * scale);
    this.flinchRoll = (Math.random() < 0.5 ? -1 : 1) * 0.012 * scale;
  }

  computeEffectiveSpread(cfg) {
    const horizSpeed = Math.hypot(this.velocity.x, this.velocity.z);
    const isStationary = horizSpeed < 0.85 && this.onGround;

    // Laser-tight accuracy when stationary / crouched / prone
    const firstShotMult = this.recoilShotIndex === 0 && this.currentBloom < 0.0015 && isStationary
      ? (cfg.firstShotSpreadMult || 0.15)
      : 1.0;
    const base = (this.isAiming ? cfg.adsSpread : cfg.spread) * firstShotMult;
    const stanceMult = this.prone
      ? (cfg.proneSpreadMult || 0.35)
      : (this.crouching && !this.isSliding)
        ? (cfg.crouchSpreadMult || 0.55)
        : 1.0;

    // Heavy run-and-gun penalty: moving or jumping causes severe spread expansion & bullet deviation
    const speedRatio = Math.min(1.65, horizSpeed / MATCH_CONFIG.WALK_SPEED);
    const movePenalty = speedRatio > 0.12
      ? Math.pow(speedRatio, 1.12) * (cfg.moveSpread || 0.095) * (this.isAiming ? 0.85 : 1.0)
      : 0;
    const airPenalty = !this.onGround ? (cfg.airSpread || 0.135) : 0;

    return (base + this.currentBloom) * stanceMult + movePenalty + airPenalty;
  }

  attemptShoot() {
    if (!this.inMatch || !this.alive || !this.isPointerLocked) return;

    const now = performance.now();
    const cfg = WEAPONS[this.currentWeapon];

    if (this.equipUntil > now) return;
    if (now - this.lastShotAt < cfg.fireRateMs) return;

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

    const horizSpeed = Math.hypot(this.velocity.x, this.velocity.z);
    const isMovingWhileShooting = horizSpeed > 0.95 || !this.onGround;
    const spreadAmount = isMelee ? 0 : this.computeEffectiveSpread(cfg);

    if (this.rayTargets.length === 0) {
      this.rebuildHitboxList();
    }
    const hits = [];
    let primaryHitPoint = null;

    const eyeOrigin = {
      x: this.camera.position.x,
      y: this.camera.position.y,
      z: this.camera.position.z
    };

    for (let p = 0; p < cfg.pellets; p++) {
      this.raycaster.setFromCamera(this.screenCenter, this.camera);
      const dir = this.raycaster.ray.direction;

      if (cfg.pellets > 1) {
        // Shotgun pellet ring pattern (widens heavily if running)
        if (p === 0 && !isMovingWhileShooting) {
          dir.x += (Math.random() - 0.5) * spreadAmount * 0.25;
          dir.y += (Math.random() - 0.5) * spreadAmount * 0.25;
          dir.z += (Math.random() - 0.5) * spreadAmount * 0.25;
        } else {
          const angle = ((p) / cfg.pellets) * Math.PI * 2 + (Math.random() - 0.5) * 0.35;
          const radius = spreadAmount * (0.58 + Math.random() * 0.45);
          dir.x += Math.cos(angle) * radius;
          dir.y += Math.sin(angle) * radius;
          dir.z += (Math.random() - 0.5) * spreadAmount * 0.48;
        }
      } else if (!isMelee) {
        if (isMovingWhileShooting) {
          // Moving / running while shooting: strong outer-cone radial bullet deviation off-center!
          const angle = Math.random() * Math.PI * 2;
          const radius = spreadAmount * (0.42 + Math.random() * 0.68);
          dir.x += Math.cos(angle) * radius;
          dir.y += Math.sin(angle) * radius;
          dir.z += (Math.random() - 0.5) * spreadAmount * 0.85;
        } else {
          // Stationary / crouched: tight, easy-to-control center group
          dir.x += (Math.random() - 0.5) * spreadAmount * 1.4;
          dir.y += (Math.random() - 0.5) * spreadAmount * 1.4;
          dir.z += (Math.random() - 0.5) * spreadAmount * 1.4;
        }
      }
      dir.normalize();

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

        const ud = firstHit.object.userData;
        if (ud && ud.playerId) {
          isPlayerHit = true;
          hits.push({
            targetId: ud.playerId,
            isHeadshot: Boolean(ud.isHeadshot)
          });
        }
      }

      if (p === 0) {
        primaryHitPoint = endPoint;
      }

      if (!isMelee || isPlayerHit) {
        const barrelStart = {
          x: eyeOrigin.x + dir.x * 0.55,
          y: eyeOrigin.y - 0.13 + dir.y * 0.55,
          z: eyeOrigin.z + dir.z * 0.55
        };
        this.spawnTracerEffect(barrelStart, endPoint, cfg.color, isPlayerHit, hitNormal);
      }
    }

    this.raycaster.setFromCamera(this.screenCenter, this.camera);
    const forward = this.raycaster.ray.direction;

    this.callbacks.onShoot?.({
      weapon: this.currentWeapon,
      origin: eyeOrigin,
      dir: { x: forward.x, y: forward.y, z: forward.z },
      hits,
      hitPoint: primaryHitPoint
    });

    if (isMelee) {
      return;
    }

    // Crosshair-only recoil & dynamic bloom (ZERO camera pitch/yaw/roll shake!)
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
      const s = 0.85 + Math.random() * 0.35;
      activeVm.userData.flashMesh.scale.set(s, s, s);
    }
    this.muzzleLight.color.setHex(cfg.color || 0xfef08a);
    this.muzzleLight.intensity = 3.2;

    this.spawnShellCasing();

    if (this.ammoByWeapon[this.currentWeapon] === 0 && (this.reserveAmmoByWeapon[this.currentWeapon] ?? 0) > 0) {
      this.startReload();
    }
  }

  tryTriggerSlide(now) {
    if (!this.onGround || this.isSliding) return false;
    if (now < this.slideCooldownUntil) return false;

    const horizSpeed = Math.hypot(this.velocity.x, this.velocity.z);
    const minSlideSpeed = MATCH_CONFIG.SLIDE_MIN_SPEED || MATCH_CONFIG.SPRINT_SPEED * 0.82;
    if (horizSpeed < minSlideSpeed) return false;

    this.isSliding = true;
    this.isSprinting = false;
    this.prone = false;
    this.slideUntil = now + (MATCH_CONFIG.SLIDE_DURATION_MS || 620);
    this.slideCooldownUntil = now + (MATCH_CONFIG.SLIDE_COOLDOWN_MS || 900);

    this.slideDir.set(this.velocity.x / horizSpeed, 0, this.velocity.z / horizSpeed);
    const burstSpeed = MATCH_CONFIG.SLIDE_INITIAL_SPEED || 10.4;
    this.velocity.x = this.slideDir.x * burstSpeed;
    this.velocity.z = this.slideDir.z * burstSpeed;

    this.callbacks.onSlide?.();
    return true;
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

    // Movement input axes
    let moveForward = 0;
    let moveRight = 0;
    if (this.isPointerLocked) {
      if (this.keys.KeyW) moveForward += 1;
      if (this.keys.KeyS) moveForward -= 1;
      if (this.keys.KeyD) moveRight += 1;
      if (this.keys.KeyA) moveRight -= 1;
    }

    if (this.isSliding && (now >= this.slideUntil || !this.onGround)) {
      this.isSliding = false;
    }

    const wantsCrouch = this.keys.KeyC || this.keys.ControlLeft;
    if (wantsCrouch && this.prone) {
      this.prone = false;
    }
    const wantsSprint = (this.keys.ShiftLeft || this.keys.ShiftRight) &&
      moveForward > 0 &&
      !this.isAiming &&
      !wantsCrouch &&
      !this.isSliding &&
      this.reloadingUntil <= now &&
      now - this.lastShotAt > 120;

    if (wantsSprint && this.prone) {
      this.prone = false;
    }

    if (wantsCrouch && !this.crouching && !this.isSliding && this.onGround) {
      this.tryTriggerSlide(now);
    }
    const slideDur = MATCH_CONFIG.SLIDE_DURATION_MS || 620;
    if (!wantsCrouch && this.isSliding && now - (this.slideUntil - slideDur) > 220) {
      this.isSliding = false;
    }

    this.crouching = (wantsCrouch || this.isSliding) && !this.prone;
    this.isSprinting = wantsSprint && !this.crouching && !this.prone;

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

    // Compute wish direction on XZ plane
    const forwardX = -Math.sin(this.yaw);
    const forwardZ = -Math.cos(this.yaw);
    const rightX = Math.cos(this.yaw);
    const rightZ = -Math.sin(this.yaw);

    let wishDirX = forwardX * moveForward + rightX * moveRight;
    let wishDirZ = forwardZ * moveForward + rightZ * moveRight;
    const wishLen = Math.hypot(wishDirX, wishDirZ);
    if (wishLen > 0.001) {
      wishDirX /= wishLen;
      wishDirZ /= wishLen;
    }

    const weaponMoveMult = cfg.moveSpeedMult || 1.0;
    const baseTargetSpeed = this.isSliding
      ? MATCH_CONFIG.SLIDE_INITIAL_SPEED
      : this.prone
        ? (MATCH_CONFIG.PRONE_SPEED || 2.0)
        : this.crouching
          ? MATCH_CONFIG.CROUCH_SPEED
          : this.isAiming
            ? MATCH_CONFIG.ADS_SPEED
            : this.isSprinting
              ? MATCH_CONFIG.SPRINT_SPEED
              : MATCH_CONFIG.WALK_SPEED;
    const targetSpeed = baseTargetSpeed * (this.isSliding ? 1.0 : weaponMoveMult);

    if (this.isSliding) {
      const slideFriction = MATCH_CONFIG.SLIDE_FRICTION || 2.6;
      this.velocity.x *= Math.max(0, 1 - slideFriction * dt);
      this.velocity.z *= Math.max(0, 1 - slideFriction * dt);
      this.velocity.x += wishDirX * 4.8 * dt;
      this.velocity.z += wishDirZ * 4.8 * dt;
    } else if (this.onGround) {
      if (wishLen > 0.001) {
        const wishVx = wishDirX * targetSpeed;
        const wishVz = wishDirZ * targetSpeed;
        const dotVel = this.velocity.x * wishDirX + this.velocity.z * wishDirZ;
        const counterStrafeBoost = dotVel < -0.2 ? 2.35 : 1.0;
        const dvX = wishVx - this.velocity.x;
        const dvZ = wishVz - this.velocity.z;
        const dvLen = Math.hypot(dvX, dvZ);
        if (dvLen > 0.0001) {
          const maxStep = (MATCH_CONFIG.GROUND_ACCEL || 56.0) * counterStrafeBoost * dt;
          const scale = Math.min(1, maxStep / dvLen);
          this.velocity.x += dvX * scale;
          this.velocity.z += dvZ * scale;
        }
      } else {
        const friction = MATCH_CONFIG.GROUND_FRICTION || 13.5;
        const drop = Math.max(0, 1 - friction * dt);
        this.velocity.x *= drop;
        this.velocity.z *= drop;
        if (Math.hypot(this.velocity.x, this.velocity.z) < 0.08) {
          this.velocity.x = 0;
          this.velocity.z = 0;
        }
      }
    } else {
      const airDrag = Math.max(0, 1 - 0.35 * dt);
      this.velocity.x *= airDrag;
      this.velocity.z *= airDrag;

      if (wishLen > 0.001) {
        const currentProj = this.velocity.x * wishDirX + this.velocity.z * wishDirZ;
        const addSpeed = targetSpeed - currentProj;
        if (addSpeed > 0) {
          const accelStep = Math.min(addSpeed, (MATCH_CONFIG.AIR_ACCEL || 16.0) * dt);
          this.velocity.x += wishDirX * accelStep;
          this.velocity.z += wishDirZ * accelStep;
        }

        const maxAirSpeed = MATCH_CONFIG.SLIDE_INITIAL_SPEED * 1.05;
        const curHoriz = Math.hypot(this.velocity.x, this.velocity.z);
        if (curHoriz > maxAirSpeed) {
          this.velocity.x = (this.velocity.x / curHoriz) * maxAirSpeed;
          this.velocity.z = (this.velocity.z / curHoriz) * maxAirSpeed;
        }
      }
    }

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

    // Jump with Coyote Time & Jump Buffering
    if (this.keys.Space && this.isPointerLocked) {
      if (this.prone) {
        this.prone = false;
      } else {
        this.jumpQueuedUntil = now + (MATCH_CONFIG.JUMP_BUFFER_MS || 120);
      }
    }

    const canCoyoteJump = this.onGround || (now - this.lastGroundedAt <= (MATCH_CONFIG.COYOTE_TIME_MS || 120));
    if (now <= this.jumpQueuedUntil && canCoyoteJump && this.velocity.y <= 0.5 && this.isPointerLocked) {
      this.velocity.y = MATCH_CONFIG.JUMP_FORCE || 8.0;
      if (this.isSliding) {
        this.isSliding = false;
        this.velocity.x *= 1.04;
        this.velocity.z *= 1.04;
      }
      this.onGround = false;
      this.lastGroundedAt = 0;
      this.jumpQueuedUntil = 0;
      this.callbacks.onJump?.();
    }

    this.velocity.y -= (MATCH_CONFIG.GRAVITY || 22.0) * dt;

    const preFallVy = this.velocity.y;
    const prevFootY = this.position.y;
    this.wasOnGround = this.onGround;

    // Integrate horizontal & vertical with AABB collision against active map obstacles
    this.position.x += this.velocity.x * dt;
    this.position.z += this.velocity.z * dt;
    this.position.y += this.velocity.y * dt;

    const radius = MATCH_CONFIG.PLAYER_RADIUS;
    const radiusSq = radius * radius;
    const playerHeight = this.prone
      ? (MATCH_CONFIG.PLAYER_PRONE_HEIGHT || 0.58)
      : this.isSliding
        ? (MATCH_CONFIG.PLAYER_SLIDE_HEIGHT || 0.9)
        : this.crouching
          ? MATCH_CONFIG.PLAYER_CROUCH_HEIGHT
          : MATCH_CONFIG.PLAYER_HEIGHT;
    let highestFloor = 0;
    const obstacles = this.currentObstacles;

    for (let i = 0; i < obstacles.length; i++) {
      const box = obstacles[i];
      const minX = box.minX !== undefined ? box.minX : box.x - box.w * 0.5;
      const maxX = box.maxX !== undefined ? box.maxX : box.x + box.w * 0.5;
      if (this.position.x + radius <= minX || this.position.x - radius >= maxX) continue;

      const minZ = box.minZ !== undefined ? box.minZ : box.z - box.d * 0.5;
      const maxZ = box.maxZ !== undefined ? box.maxZ : box.z + box.d * 0.5;
      if (this.position.z + radius <= minZ || this.position.z - radius >= maxZ) continue;

      const topY = box.maxY !== undefined ? box.maxY : box.y + box.h * 0.5;
      const bottomY = box.minY !== undefined ? box.minY : box.y - box.h * 0.5;

      const closestX = this.position.x < minX ? minX : this.position.x > maxX ? maxX : this.position.x;
      const closestZ = this.position.z < minZ ? minZ : this.position.z > maxZ ? maxZ : this.position.z;
      const dx = this.position.x - closestX;
      const dz = this.position.z - closestZ;
      const distSq = dx * dx + dz * dz;

      if (distSq < radiusSq) {
        if (this.position.y + 0.52 >= topY && this.velocity.y <= 2.2) {
          if (topY > highestFloor) {
            highestFloor = topY;
          }
        } else if (this.position.y < topY && this.position.y + playerHeight > bottomY) {
          if (this.velocity.y > 0 && this.position.y + playerHeight - this.velocity.y * dt <= bottomY + 0.15) {
            this.position.y = bottomY - playerHeight;
            this.velocity.y = 0;
          } else {
            const dist = Math.sqrt(distSq);
            if (dist > 0.0001) {
              const overlap = radius - dist;
              this.position.x += (dx / dist) * overlap;
              this.position.z += (dz / dist) * overlap;
            } else {
              const penLeft = Math.abs(this.position.x - minX);
              const penRight = Math.abs(maxX - this.position.x);
              const penFront = Math.abs(this.position.z - minZ);
              const penBack = Math.abs(maxZ - this.position.z);
              const minPen = Math.min(penLeft, penRight, penFront, penBack);
              if (minPen === penLeft) this.position.x = minX - radius;
              else if (minPen === penRight) this.position.x = maxX + radius;
              else if (minPen === penFront) this.position.z = minZ - radius;
              else this.position.z = maxZ + radius;
            }
          }
        }
      }
    }

    if (this.position.y <= highestFloor + 0.025 && this.velocity.y <= 0) {
      if (this.wasOnGround && highestFloor > prevFootY + 0.03 && highestFloor - prevFootY <= 0.56) {
        this.stepOffsetY = Math.max(-0.48, (this.stepOffsetY || 0) + (prevFootY - highestFloor));
      }
      this.position.y = highestFloor;
      this.velocity.y = 0;
      this.onGround = true;
      this.lastGroundedAt = now;

      if (!this.wasOnGround && preFallVy < -3.2) {
        const impact = Math.min(1.5, Math.abs(preFallVy) / 10.5);
        this.landingDipVel = -2.2 * impact;
        this.callbacks.onLand?.(impact);
      }
    } else {
      this.onGround = false;
    }

    this.stepOffsetY = (this.stepOffsetY || 0) * Math.exp(-18 * dt);
    if (Math.abs(this.stepOffsetY) < 0.002) this.stepOffsetY = 0;

    const limit = (this.arenaHalfSize || MATCH_CONFIG.ARENA_HALF_SIZE) - 0.6;
    this.position.x = Math.max(-limit, Math.min(limit, this.position.x));
    this.position.z = Math.max(-limit, Math.min(limit, this.position.z));

    // Decay crosshair recoil kick & reset spray index smoothly without touching camera pitch/yaw!
    const recDelay = cfg.recoilRecoveryDelayMs || (cfg.fireRateMs + 35);
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
    this.camera.position.set(
      this.position.x + rightX * leanOffset,
      this.position.y + this.currentEyeHeight + this.landingDip + leanDropY + (this.stepOffsetY || 0),
      this.position.z + rightZ * leanOffset
    );
    this.tmpEuler.set(
      Math.max(-Math.PI / 2 + 0.04, Math.min(Math.PI / 2 - 0.04, this.pitch + this.flinchPitch)),
      this.yaw,
      this.cameraRoll + this.flinchRoll,
      'YXZ'
    );
    this.camera.quaternion.setFromEuler(this.tmpEuler);

    // Smooth Dynamic FOV
    const targetFov = this.isAiming
      ? cfg.zoomFov
      : this.isSliding
        ? 77
        : this.isSprinting
          ? 74
          : 68;
    if (Math.abs(this.camera.fov - targetFov) > 0.08) {
      this.camera.fov += (targetFov - this.camera.fov) * Math.min(1, dt * 15);
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

    const equipProgress = isEquipping ? 1 - (this.equipUntil - now) / this.equipDuration : 1;
    const equipDropY = isEquipping ? (1 - equipProgress) * -0.26 : 0;

    const targetVmX = (this.isAiming ? 0.0 : this.isSprinting ? 0.17 : 0.24) + this.currentLean * 0.03;
    const targetVmY = (isReloading ? -0.27 : this.isAiming ? -0.165 : -0.21) + equipDropY + this.landingDip * 0.45;
    const targetVmZ = this.isAiming ? -0.33 : -0.40;

    const bobAmp = this.isAiming ? 0.22 : this.isSprinting ? 1.35 : 0.95;
    const bobX = Math.cos(this.weaponBobTime * 0.5) * 0.012 * bobAmp;
    const bobY = Math.abs(Math.sin(this.weaponBobTime)) * 0.014 * bobAmp;

    const vmPosBlend = 1 - Math.exp(-18 * dt);
    const vmRotBlend = 1 - Math.exp(-16 * dt);
    this.viewmodelRig.position.x += (targetVmX + bobX + this.swayX - this.viewmodelRig.position.x) * vmPosBlend;
    this.viewmodelRig.position.y += (targetVmY - bobY + this.swayY - this.viewmodelRig.position.y) * vmPosBlend;
    this.viewmodelRig.position.z += (targetVmZ + this.recoilOffset - this.viewmodelRig.position.z) * Math.min(1, dt * 28);

    let targetRotX = this.recoilOffset * 1.15;
    let targetRotY = 0;
    let targetRotZ = -this.cameraRoll * 0.85;

    const activeVm = this.viewmodelMeshes[this.currentWeapon];
    const magMesh = activeVm?.userData?.magMesh;
    const boltMesh = activeVm?.userData?.boltMesh;

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
        boltMesh.position.z = boltMesh.userData.baseZ + pumpPhase * 0.115;
        targetRotX -= pumpPhase * 0.09;
        targetRotZ += pumpPhase * (this.currentWeapon === 'sniper' ? -0.18 : 0.12);
      } else {
        boltMesh.position.z = boltMesh.userData.baseZ + this.boltKickOffset * 0.085;
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

    // Send quantized, delta-filtered position & velocity update at ~30Hz (33ms)
    if (now - this.lastMoveSentAt >= 33) {
      const qx = Math.round(this.position.x * 100) / 100;
      const qy = Math.round(this.position.y * 100) / 100;
      const qz = Math.round(this.position.z * 100) / 100;
      const qvx = Math.round(this.velocity.x * 100) / 100;
      const qvy = Math.round(this.velocity.y * 100) / 100;
      const qvz = Math.round(this.velocity.z * 100) / 100;
      const qyaw = Math.round(this.yaw * 1000) / 1000;
      const qpitch = Math.round(this.pitch * 1000) / 1000;
      const qlean = Math.round(this.currentLean * 100) / 100;

      const prev = this._lastSentMove;
      const hasChanged = !prev ||
        Math.abs(qx - prev.x) >= 0.01 ||
        Math.abs(qy - prev.y) >= 0.01 ||
        Math.abs(qz - prev.z) >= 0.01 ||
        Math.abs(qvx - prev.vx) >= 0.05 ||
        Math.abs(qvz - prev.vz) >= 0.05 ||
        Math.abs(qyaw - prev.yaw) >= 0.003 ||
        Math.abs(qpitch - prev.pitch) >= 0.003 ||
        this.crouching !== prev.crouching ||
        this.prone !== prev.prone ||
        Math.abs(qlean - prev.lean) >= 0.02 ||
        this.currentWeapon !== prev.weapon;

      if (hasChanged || now - this.lastMoveSentAt >= 420) {
        this.lastMoveSentAt = now;
        this.moveSeq = (this.moveSeq || 0) + 1;
        const movePayload = {
          seq: this.moveSeq,
          x: qx,
          y: qy,
          z: qz,
          vx: qvx,
          vy: qvy,
          vz: qvz,
          yaw: qyaw,
          pitch: qpitch,
          crouching: this.crouching,
          prone: this.prone,
          lean: qlean,
          weapon: this.currentWeapon
        };
        this._lastSentMove = movePayload;
        this.callbacks.onMoveUpdate?.(movePayload);
      }
    }
  }

  animateHumanoidRig(rp, dt, now, isMoving, moveSpeed = 0) {
    animateHumanoidRig(rp, dt, now, isMoving, moveSpeed);
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
      if (this.inMatch && this.currentFps < 38 && this.currentPixelRatio > 0.85) {
        this.lowFpsStreak = (this.lowFpsStreak || 0) + 1;
        if (this.lowFpsStreak >= 3) {
          this.lowFpsStreak = 0;
          this.currentPixelRatio = Math.max(0.85, Number((this.currentPixelRatio - 0.15).toFixed(2)));
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

    const posLerp = 1 - Math.exp(-20 * dt);
    const rotLerp = 1 - Math.exp(-22 * dt);
    const speedBlend = 1 - Math.exp(-15 * dt);
    const arenaLim = (this.arenaHalfSize || MATCH_CONFIG.ARENA_HALF_SIZE) - 0.6;

    for (const rp of this.remotePlayers.values()) {
      if (!rp.alive) continue;

      const sinceSync = rp.lastSyncAt ? Math.min(0.095, Math.max(0, (now - rp.lastSyncAt) / 1000)) : 0;
      if (rp.serverPos && rp.velocity) {
        rp.targetPos.x = Math.max(-arenaLim, Math.min(arenaLim, rp.serverPos.x + rp.velocity.x * sinceSync));
        rp.targetPos.y = Math.max(0, rp.serverPos.y);
        rp.targetPos.z = Math.max(-arenaLim, Math.min(arenaLim, rp.serverPos.z + rp.velocity.z * sinceSync));
      }

      const prevX = rp.group.position.x;
      const prevZ = rp.group.position.z;
      rp.group.position.lerp(rp.targetPos, posLerp);

      let yawDiff = rp.targetYaw - rp.group.rotation.y;
      while (yawDiff > Math.PI) yawDiff -= Math.PI * 2;
      while (yawDiff < -Math.PI) yawDiff += Math.PI * 2;
      rp.group.rotation.y += yawDiff * rotLerp;

      const velSpeed = rp.velocity ? Math.hypot(rp.velocity.x, rp.velocity.z) : 0;
      const frameSpeed = dt > 0.001 ? Math.hypot(rp.group.position.x - prevX, rp.group.position.z - prevZ) / dt : 0;
      const rawSpeed = (!rp.lastSyncAt || now - rp.lastSyncAt < 180)
        ? Math.max(velSpeed, frameSpeed * 0.85)
        : 0;
      rp.smoothedSpeed = (rp.smoothedSpeed || 0) + (rawSpeed - (rp.smoothedSpeed || 0)) * speedBlend;
      if (rp.smoothedSpeed < 0.05) rp.smoothedSpeed = 0;

      const isMoving = rp.smoothedSpeed > 0.35;
      const rigMoveSpeed = rp.smoothedSpeed * 0.032;
      this.animateHumanoidRig(rp, dt, now, isMoving, rigMoveSpeed);
    }

    // Update top-left Tactical Mini Map / Radar when in match
    if (this.inMatch && this.minimap) {
      this.minimap.update({
        localPos: this.position,
        localYaw: this.yaw,
        localAlive: this.alive,
        remotePlayers: this.remotePlayers,
        pickups: this.pickupMeshes,
        droppedWeapons: this.droppedWeaponMeshes,
        now
      });
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
          this.scene.remove(fx.sprite);
          fx.tex.dispose();
          fx.mat.dispose();
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
        const alpha = 1 - elapsed / fx.duration;
        if (fx.type === 'popup') {
          fx.sprite.position.y += fx.vy * dt;
          fx.mat.opacity = alpha;
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
  }

  requestPointerLock() {
    this.renderer.domElement.requestPointerLock?.();
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
      if (!this.isPointerLocked) {
        this.isMouseDown = false;
        this.isAiming = false;
        this.isSprinting = false;
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
        const wCfg = WEAPONS[this.currentWeapon];
        if (!wCfg?.isMelee && this.reloadingUntil <= performance.now()) {
          this.isAiming = true;
          this.isSprinting = false;
          this.callbacks.onAimChange?.(this.isAiming, this.currentWeapon);
        }
      }
    }, { passive: true });

    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) {
        this.isMouseDown = false;
      } else if (e.button === 2) {
        this.isAiming = false;
        this.callbacks.onAimChange?.(false, this.currentWeapon);
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

    window.addEventListener('keydown', (e) => {
      if (e.code in this.keys) {
        this.keys[e.code] = true;
      }

      if (!this.inMatch) return;

      if (e.code === 'Tab' || e.code === 'KeyB' || e.code === 'KeyF') {
        e.preventDefault();
      }
      if (e.repeat) return;

      if (e.code === 'Digit1') this.switchSlot(1);
      else if (e.code === 'Digit2') this.switchSlot(2);
      else if (e.code === 'Digit3') this.switchSlot(3);
      else if (e.code === 'KeyB') {
        this.callbacks.onLoadoutToggle?.();
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
    });

    window.addEventListener('keyup', (e) => {
      if (e.code in this.keys) {
        this.keys[e.code] = false;
      }
      if (e.code === 'Tab') {
        e.preventDefault();
        this.callbacks.onScoreboardToggle?.(false);
      }
    });
  }
}
