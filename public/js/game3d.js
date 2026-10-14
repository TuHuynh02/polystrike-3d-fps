import * as THREE from '../vendor/three/three.module.js';
import {
  DEFAULT_MAP_ID,
  MATCH_CONFIG,
  WEAPONS,
  WEAPON_ORDER,
  getMapConfig
} from '../shared/constants.js';

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

    // Weapon, 3-Slot Loadout, Reload & Gunshot mechanics state
    this.loadout = {
      primary: 'rifle',
      secondary: 'pistol',
      melee: 'knife'
    };
    this.currentWeapon = 'rifle';
    this.ammoByWeapon = {};
    for (const wId of WEAPON_ORDER) {
      this.ammoByWeapon[wId] = WEAPONS[wId].magSize;
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

    // Recoil Pattern, Bloom & Camera Punch state
    this.currentBloom = 0;
    this.effectiveSpread = WEAPONS.rifle.spread;
    this.recoilShotIndex = 0;
    this.recoilOffset = 0;
    this.boltKickOffset = 0;
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

    // Build 3D environment & weapon viewmodels
    this.setupLights();
    this.loadMap(DEFAULT_MAP_ID);
    this.setupViewmodelWeapons();
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
    this.renderer.shadowMap.needsUpdate = true;
  }

  buildSkyAndAtmosphere(theme = {}, halfSize = 60) {
    // 1. High-Resolution Procedural Sky Dome with Horizon Nebula, Planet/Moon & Stars
    const skyCanvas = document.createElement('canvas');
    skyCanvas.width = 1024;
    skyCanvas.height = 512;
    const ctx = skyCanvas.getContext('2d');

    const grad = ctx.createLinearGradient(0, 0, 0, 512);
    grad.addColorStop(0.0, theme.skyTop || '#020617');
    grad.addColorStop(0.45, theme.skyMid || '#0b1736');
    grad.addColorStop(0.84, theme.skyHorizon || '#1e3a8a');
    grad.addColorStop(1.0, theme.floorBase || '#091224');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 1024, 512);

    // Subtle atmospheric nebula clouds in mid-sky
    for (let c = 0; c < 6; c++) {
      const cx = 100 + c * 165;
      const cy = 180 + (c % 2) * 55;
      const nebGrad = ctx.createRadialGradient(cx, cy, 10, cx, cy, 140);
      nebGrad.addColorStop(0, theme.gridStroke || 'rgba(56, 189, 248, 0.16)');
      nebGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = nebGrad;
      ctx.fillRect(cx - 140, cy - 140, 280, 280);
    }

    // Starfield in upper sky hemisphere
    for (let i = 0; i < 340; i++) {
      const sx = Math.random() * 1024;
      const sy = Math.random() * 310;
      const r = Math.random() < 0.16 ? 1.8 : 0.95;
      ctx.fillStyle = Math.random() < 0.35
        ? (theme.gridStroke || 'rgba(56, 189, 248, 0.9)')
        : 'rgba(248, 250, 252, 0.8)';
      ctx.beginPath();
      ctx.arc(sx, sy, r, 0, Math.PI * 2);
      ctx.fill();
    }

    // Glowing low-orbit sci-fi sun / moon disc on the horizon
    const sunGrad = ctx.createRadialGradient(260, 315, 8, 260, 315, 72);
    sunGrad.addColorStop(0, 'rgba(255, 255, 255, 0.92)');
    sunGrad.addColorStop(0.32, theme.gridStroke || 'rgba(56, 189, 248, 0.55)');
    sunGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = sunGrad;
    ctx.beginPath();
    ctx.arc(260, 315, 72, 0, Math.PI * 2);
    ctx.fill();

    // Glowing horizon laser grid band
    ctx.strokeStyle = theme.gridStroke || 'rgba(56, 189, 248, 0.35)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, 422);
    ctx.lineTo(1024, 422);
    ctx.stroke();

    const skyTex = new THREE.CanvasTexture(skyCanvas);
    const skyGeo = new THREE.SphereGeometry(310, 32, 20);
    const skyMat = new THREE.MeshBasicMaterial({
      map: skyTex,
      side: THREE.BackSide,
      fog: false
    });
    const skyDome = new THREE.Mesh(skyGeo, skyMat);
    this.scene.add(skyDome);
    this.skyObjects.push(skyDome);

    // 2. Multi-Tiered Architectural Megacity / Industrial Skyline around Arena
    const towerMat = new THREE.MeshStandardMaterial({
      color: 0x091122,
      roughness: 0.65,
      metalness: 0.45
    });
    const towerTrimMat = new THREE.MeshStandardMaterial({
      color: 0x16243d,
      roughness: 0.45,
      metalness: 0.65
    });
    const neonStripMat = new THREE.MeshBasicMaterial({ color: theme.accentHex || 0x38bdf8 });
    const amberStripMat = new THREE.MeshBasicMaterial({ color: theme.secondaryHex || 0xf59e0b });
    this.arenaMaterials.add(towerMat);
    this.arenaMaterials.add(towerTrimMat);
    this.arenaMaterials.add(neonStripMat);
    this.arenaMaterials.add(amberStripMat);

    const sharedSkyBoxGeo = new THREE.BoxGeometry(1, 1, 1);
    const sharedSpireGeo = new THREE.CylinderGeometry(0.18, 0.55, 1, 6);
    this.arenaGeometries.add(sharedSkyBoxGeo);
    this.arenaGeometries.add(sharedSpireGeo);

    const towerCount = 32;
    const ringRadius = halfSize + 24;
    for (let i = 0; i < towerCount; i++) {
      const angle = (i / towerCount) * Math.PI * 2;
      const dist = ringRadius + (i % 3) * 14;
      const tx = Math.cos(angle) * dist;
      const tz = Math.sin(angle) * dist;
      const th = 32 + ((i * 11) % 44);
      const tw = 9 + (i % 4) * 3.2;
      const activeNeonMat = i % 3 === 0 ? amberStripMat : neonStripMat;

      // Lower fortress base tier
      const baseTier = new THREE.Mesh(sharedSkyBoxGeo, towerTrimMat);
      baseTier.scale.set(tw * 1.28, th * 0.42, tw * 1.28);
      baseTier.position.set(tx, (th * 0.42) / 2 - 2, tz);
      this.scene.add(baseTier);
      this.arenaDecorMeshes.push(baseTier);

      // Main stepped skyscraper shaft
      const tower = new THREE.Mesh(sharedSkyBoxGeo, towerMat);
      tower.scale.set(tw, th, tw);
      tower.position.set(tx, th / 2 - 2, tz);
      this.scene.add(tower);
      this.arenaDecorMeshes.push(tower);

      // Upper crown collar + dual neon horizon bands
      const crown = new THREE.Mesh(sharedSkyBoxGeo, activeNeonMat);
      crown.scale.set(tw + 0.45, 0.9, tw + 0.45);
      crown.position.set(tx, th - 4.2, tz);
      this.scene.add(crown);
      this.arenaDecorMeshes.push(crown);

      const midBand = new THREE.Mesh(sharedSkyBoxGeo, activeNeonMat);
      midBand.scale.set(tw + 0.3, 0.5, tw + 0.3);
      midBand.position.set(tx, th * 0.58, tz);
      this.scene.add(midBand);
      this.arenaDecorMeshes.push(midBand);

      // Vertical neon architectural fin on front face
      const vFin = new THREE.Mesh(sharedSkyBoxGeo, activeNeonMat);
      vFin.scale.set(0.65, th * 0.72, tw + 0.35);
      vFin.position.set(tx, th * 0.48, tz);
      this.scene.add(vFin);
      this.arenaDecorMeshes.push(vFin);

      // Rooftop comms antenna spire & beacon on every 2nd skyscraper
      if (i % 2 === 0) {
        const spireH = 10 + (i % 3) * 4;
        const spire = new THREE.Mesh(sharedSpireGeo, towerTrimMat);
        spire.scale.set(1, spireH, 1);
        spire.position.set(tx, th - 2 + spireH / 2, tz);
        this.scene.add(spire);
        this.arenaDecorMeshes.push(spire);

        const beacon = new THREE.Mesh(sharedSkyBoxGeo, activeNeonMat);
        beacon.scale.set(1.1, 1.1, 1.1);
        beacon.position.set(tx, th - 2 + spireH, tz);
        this.scene.add(beacon);
        this.arenaDecorMeshes.push(beacon);
      }
    }

    // 3. Floating Atmospheric Dust & Energy Motes inside Arena
    const pCount = 280;
    const span = halfSize * 1.9;
    const positions = new Float32Array(pCount * 3);
    for (let i = 0; i < pCount; i++) {
      positions[i * 3] = (Math.random() - 0.5) * span;
      positions[i * 3 + 1] = 0.8 + Math.random() * 16;
      positions[i * 3 + 2] = (Math.random() - 0.5) * span;
    }
    const pGeo = new THREE.BufferGeometry();
    pGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const pMat = new THREE.PointsMaterial({
      color: theme.accentHex || 0x38bdf8,
      size: 0.2,
      transparent: true,
      opacity: 0.52,
      depthWrite: false
    });
    this.ambientParticles = new THREE.Points(pGeo, pMat);
    this.scene.add(this.ambientParticles);
    this.skyObjects.push(this.ambientParticles);
  }

  createGridTexture(theme = {}, halfSize = 60) {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 1024;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = theme.floorBase || '#0f172a';
    ctx.fillRect(0, 0, 1024, 1024);

    // Alternating industrial composite deck plates with beveled seams
    ctx.fillStyle = theme.floorAlt || '#131e36';
    ctx.fillRect(8, 8, 496, 496);
    ctx.fillRect(520, 520, 496, 496);

    // Subtle diagonal anti-slip tread lines inside tiles
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.032)';
    ctx.lineWidth = 3;
    for (let d = -1024; d < 1024; d += 32) {
      ctx.beginPath();
      ctx.moveTo(d, 0);
      ctx.lineTo(d + 1024, 1024);
      ctx.stroke();
    }

    // Sub-grid architectural panel lines
    ctx.strokeStyle = 'rgba(15, 23, 42, 0.9)';
    ctx.lineWidth = 4;
    for (let i = 0; i <= 1024; i += 128) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i, 1024);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, i);
      ctx.lineTo(1024, i);
      ctx.stroke();
    }

    // Highlighted metallic expansion joint border
    ctx.strokeStyle = theme.gridStroke || 'rgba(56, 189, 248, 0.34)';
    ctx.lineWidth = 6;
    ctx.strokeRect(4, 4, 1016, 1016);
    ctx.strokeRect(512, 4, 508, 508);

    // Corner tie-down bolts & tactical yellow/cyan intersection markers
    ctx.fillStyle = 'rgba(245, 158, 11, 0.65)';
    ctx.fillRect(500, 500, 24, 24);
    ctx.fillStyle = 'rgba(148, 163, 184, 0.45)';
    for (const bx of [28, 488, 540, 996]) {
      for (const by of [28, 488, 540, 996]) {
        ctx.fillRect(bx - 5, by - 5, 10, 10);
      }
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    const maxAniso = this.renderer.capabilities.getMaxAnisotropy?.() || 4;
    tex.anisotropy = Math.min(8, maxAniso);
    const repeats = Math.round(halfSize / 2);
    tex.repeat.set(repeats, repeats);
    this.arenaTextures.add(tex);
    return tex;
  }

  createFloorBumpTexture(halfSize = 60) {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#808080';
    ctx.fillRect(0, 0, 512, 512);

    // Recessed panel seams
    ctx.strokeStyle = '#262626';
    ctx.lineWidth = 4;
    for (let i = 0; i <= 512; i += 64) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i, 512);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, i);
      ctx.lineTo(512, i);
      ctx.stroke();
    }

    // Raised anti-slip diamond plate ribs
    ctx.strokeStyle = '#b8b8b8';
    ctx.lineWidth = 2;
    for (let y = 8; y < 512; y += 16) {
      for (let x = 8; x < 512; x += 16) {
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + 6, y + 6);
        ctx.stroke();
      }
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    const repeats = Math.round(halfSize / 2);
    tex.repeat.set(repeats, repeats);
    this.arenaTextures.add(tex);
    return tex;
  }

  createObstacleTexture(hexColor, type = 'wall') {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');

    const base = new THREE.Color(hexColor);
    ctx.fillStyle = `#${ base.getHexString() }`;
    ctx.fillRect(0, 0, 512, 512);

    // Subtle vertical metallic gradient for realistic ambient occlusion
    const vGrad = ctx.createLinearGradient(0, 0, 0, 512);
    vGrad.addColorStop(0.0, 'rgba(255, 255, 255, 0.12)');
    vGrad.addColorStop(0.5, 'rgba(0, 0, 0, 0.0)');
    vGrad.addColorStop(1.0, 'rgba(0, 0, 0, 0.28)');
    ctx.fillStyle = vGrad;
    ctx.fillRect(0, 0, 512, 512);

    if (type === 'container') {
      // Deep corrugated shipping container vertical ribs
      for (let x = 0; x < 512; x += 24) {
        ctx.fillStyle = x % 48 === 0 ? 'rgba(0, 0, 0, 0.32)' : 'rgba(255, 255, 255, 0.14)';
        ctx.fillRect(x, 22, 12, 468);
      }
      // Heavy structural steel perimeter frame
      ctx.strokeStyle = 'rgba(15, 23, 42, 0.85)';
      ctx.lineWidth = 28;
      ctx.strokeRect(0, 0, 512, 512);

      // Industrial stencil stripe & cargo serial markings
      ctx.fillStyle = 'rgba(15, 23, 42, 0.55)';
      ctx.fillRect(36, 212, 440, 74);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
      ctx.lineWidth = 3;
      ctx.strokeRect(36, 212, 440, 74);

      ctx.fillStyle = 'rgba(248, 250, 252, 0.88)';
      ctx.font = '900 32px Segoe UI, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('POLY-CARGO // HVY-08', 256, 260);

      // Caution hazard chevrons along bottom rail
      ctx.fillStyle = 'rgba(250, 204, 21, 0.75)';
      for (let hx = 40; hx < 460; hx += 36) {
        ctx.fillRect(hx, 468, 18, 14);
      }
    } else if (type === 'crate') {
      // Heavy tactical supply crate outer frame
      ctx.strokeStyle = 'rgba(15, 23, 42, 0.86)';
      ctx.lineWidth = 36;
      ctx.strokeRect(18, 18, 476, 476);

      // Recessed inner armor panel
      ctx.fillStyle = 'rgba(0, 0, 0, 0.28)';
      ctx.fillRect(64, 64, 384, 384);

      // Structural X-bracing with highlight bevel
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.26)';
      ctx.lineWidth = 22;
      ctx.beginPath();
      ctx.moveTo(64, 64);
      ctx.lineTo(448, 448);
      ctx.moveTo(448, 64);
      ctx.lineTo(64, 448);
      ctx.stroke();

      // Center stenciled badge plate
      ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
      ctx.fillRect(156, 210, 200, 92);
      ctx.strokeStyle = 'rgba(250, 204, 21, 0.8)';
      ctx.lineWidth = 4;
      ctx.strokeRect(156, 210, 200, 92);
      ctx.fillStyle = '#facc15';
      ctx.font = 'bold 26px Segoe UI, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('TAC-SUPPLY', 256, 265);

      // Corner hex bolts
      ctx.fillStyle = '#e2e8f0';
      [42, 470].forEach((cx) => {
        [42, 470].forEach((cy) => {
          ctx.fillRect(cx - 8, cy - 8, 16, 16);
        });
      });
    } else if (type === 'pillar') {
      // High-tech monolith armor plates & vertical energy conduit channels
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.72)';
      ctx.lineWidth = 10;
      ctx.strokeRect(26, 26, 460, 460);

      ctx.fillStyle = 'rgba(15, 23, 42, 0.6)';
      ctx.fillRect(60, 40, 392, 432);

      // Glowing vertical circuit traces
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.85)';
      ctx.lineWidth = 8;
      ctx.beginPath();
      ctx.moveTo(180, 26);
      ctx.lineTo(180, 486);
      ctx.moveTo(332, 26);
      ctx.lineTo(332, 486);
      ctx.stroke();

      // Horizontal armor ribs
      ctx.fillStyle = 'rgba(255, 255, 255, 0.18)';
      for (let py = 80; py < 460; py += 90) {
        ctx.fillRect(36, py, 440, 14);
      }
    } else {
      // Fortified concrete / composite bunker wall & platform paneling
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
      ctx.lineWidth = 12;
      ctx.strokeRect(6, 6, 500, 500);

      ctx.strokeStyle = 'rgba(0, 0, 0, 0.45)';
      ctx.lineWidth = 8;
      ctx.strokeRect(28, 28, 456, 456);

      // Interlocking architectural panel seams
      ctx.beginPath();
      ctx.moveTo(28, 256);
      ctx.lineTo(484, 256);
      ctx.moveTo(256, 28);
      ctx.lineTo(256, 484);
      ctx.stroke();

      // Hazard warning stripe along lower base
      ctx.fillStyle = 'rgba(245, 158, 11, 0.55)';
      for (let wx = 36; wx < 476; wx += 48) {
        ctx.fillRect(wx, 452, 24, 18);
      }
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    const maxAniso = this.renderer.capabilities.getMaxAnisotropy?.() || 4;
    tex.anisotropy = Math.min(8, maxAniso);
    this.arenaTextures.add(tex);
    return tex;
  }

  createObstacleBumpTexture(type = 'wall') {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#808080';
    ctx.fillRect(0, 0, 256, 256);

    if (type === 'container') {
      for (let x = 0; x < 256; x += 12) {
        ctx.fillStyle = x % 24 === 0 ? '#303030' : '#d0d0d0';
        ctx.fillRect(x, 10, 6, 236);
      }
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 14;
      ctx.strokeRect(0, 0, 256, 256);
    } else if (type === 'crate') {
      ctx.strokeStyle = '#e0e0e0';
      ctx.lineWidth = 18;
      ctx.strokeRect(8, 8, 240, 240);
      ctx.fillStyle = '#404040';
      ctx.fillRect(32, 32, 192, 192);
      ctx.strokeStyle = '#c8c8c8';
      ctx.lineWidth = 12;
      ctx.beginPath();
      ctx.moveTo(32, 32);
      ctx.lineTo(224, 224);
      ctx.moveTo(224, 32);
      ctx.lineTo(32, 224);
      ctx.stroke();
    } else {
      ctx.strokeStyle = '#d8d8d8';
      ctx.lineWidth = 8;
      ctx.strokeRect(6, 6, 244, 244);
      ctx.strokeStyle = '#282828';
      ctx.lineWidth = 4;
      ctx.strokeRect(16, 16, 224, 224);
      ctx.beginPath();
      ctx.moveTo(16, 128);
      ctx.lineTo(240, 128);
      ctx.moveTo(128, 16);
      ctx.lineTo(128, 240);
      ctx.stroke();
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    this.arenaTextures.add(tex);
    return tex;
  }

  buildArena(mapCfg) {
    const halfSize = mapCfg.arenaHalfSize || 60;
    const span = halfSize * 2;
    const theme = mapCfg.theme || {};

    // Ground Floor (120x120m to 128x128m) with high-res anisotropic diffuse & bump relief
    const floorGeo = new THREE.PlaneGeometry(span, span);
    const floorMat = new THREE.MeshStandardMaterial({
      map: this.createGridTexture(theme, halfSize),
      bumpMap: this.createFloorBumpTexture(halfSize),
      bumpScale: 0.04,
      roughness: 0.62,
      metalness: 0.32
    });
    this.arenaMaterials.add(floorMat);
    const floorMesh = new THREE.Mesh(floorGeo, floorMat);
    floorMesh.rotation.x = -Math.PI / 2;
    floorMesh.receiveShadow = true;
    this.scene.add(floorMesh);
    this.worldMeshes.push(floorMesh);

    const bumpCache = new Map();
    const getBump = (type = 'wall') => {
      if (!bumpCache.has(type)) {
        bumpCache.set(type, this.createObstacleBumpTexture(type));
      }
      return bumpCache.get(type);
    };

    const matCache = new Map();
    const getMat = (colorHex, type = 'wall') => {
      const key = `${ colorHex }_${ type }`;
      if (!matCache.has(key)) {
        const isMetal = type === 'container' || type === 'pillar';
        const m = new THREE.MeshStandardMaterial({
          map: this.createObstacleTexture(colorHex, type),
          bumpMap: getBump(type),
          bumpScale: isMetal ? 0.05 : 0.035,
          roughness: isMetal ? 0.36 : 0.54,
          metalness: isMetal ? 0.62 : 0.26
        });
        this.arenaMaterials.add(m);
        matCache.set(key, m);
      }
      return matCache.get(key);
    };

    // Shared architectural structural materials & unit geometries for multi-part 3D prefabs
    const darkSteelMat = new THREE.MeshStandardMaterial({
      color: 0x0f172a,
      roughness: 0.35,
      metalness: 0.78
    });
    const gunmetalFrameMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.42,
      metalness: 0.68
    });
    const brushedChromeMat = new THREE.MeshStandardMaterial({
      color: 0x94a3b8,
      roughness: 0.24,
      metalness: 0.88
    });
    const hazardMat = new THREE.MeshStandardMaterial({
      color: 0xf59e0b,
      roughness: 0.4,
      metalness: 0.35,
      emissive: 0xd97706,
      emissiveIntensity: 0.2
    });
    const trimAccentMat = new THREE.MeshBasicMaterial({ color: theme.accentHex || 0x38bdf8 });
    const trimSecondaryMat = new THREE.MeshBasicMaterial({ color: theme.secondaryHex || 0xf59e0b });

    this.arenaMaterials.add(darkSteelMat);
    this.arenaMaterials.add(gunmetalFrameMat);
    this.arenaMaterials.add(brushedChromeMat);
    this.arenaMaterials.add(hazardMat);
    this.arenaMaterials.add(trimAccentMat);
    this.arenaMaterials.add(trimSecondaryMat);

    // Reusable unit geometries (tracked in arenaGeometries so disposeMapResources frees them once)
    const unitBoxGeo = new THREE.BoxGeometry(1, 1, 1);
    const unitCylGeo = new THREE.CylinderGeometry(0.5, 0.5, 1, 10);
    const unitOctGeo = new THREE.OctahedronGeometry(0.55, 0);
    this.arenaGeometries.add(unitBoxGeo);
    this.arenaGeometries.add(unitCylGeo);
    this.arenaGeometries.add(unitOctGeo);

    // Batch all static decorative boxes & cylinders into THREE.InstancedMesh by (geometry, material)
    // to collapse ~1,500 separate draw calls into ~8 instanced draw calls for locked 60 FPS on any GPU
    const decorBatches = new Map();
    const registerInstancedItem = (geo, mat, x, y, z, sx, sy, sz, rx = 0, ry = 0, rz = 0, castShadow = false) => {
      let groupMap = decorBatches.get(geo);
      if (!groupMap) {
        groupMap = new Map();
        decorBatches.set(geo, groupMap);
      }
      let batch = groupMap.get(mat);
      if (!batch) {
        batch = { items: [], castShadow: false };
        groupMap.set(mat, batch);
      }
      if (castShadow) batch.castShadow = true;
      const item = {
        x,
        y,
        z,
        sx,
        sy,
        sz,
        rotation: { x: rx, y: ry, z: rz }
      };
      batch.items.push(item);
      return item;
    };

    const addDecorBox = (x, y, z, w, h, d, mat, castShadow = false) =>
      registerInstancedItem(unitBoxGeo, mat, x, y, z, w, h, d, 0, 0, 0, castShadow);

    const addDecorCyl = (x, y, z, radius, len, mat, axis = 'y') => {
      const rx = axis === 'z' ? Math.PI / 2 : 0;
      const rz = axis === 'x' ? Math.PI / 2 : 0;
      return registerInstancedItem(unitCylGeo, mat, x, y, z, radius * 2, len, radius * 2, rx, 0, rz, false);
    };

    // Helper to build a detailed 3D corrugated shipping container assembly
    const buildContainerDetails = (cx, cy, cz, cw, ch, cd, mainMat, isUpperStack = false) => {
      const alongZ = cd >= cw;
      const halfW = cw / 2;
      const halfH = ch / 2;
      const halfD = cd / 2;

      // 1. Heavy steel exoskeleton top & bottom long rails + 4 vertical corner posts
      const railThick = 0.16;
      for (const sy of [-1, 1]) {
        const ry = cy + sy * (halfH - 0.05);
        addDecorBox(cx, ry, cz - halfD, cw + 0.08, railThick, railThick, darkSteelMat);
        addDecorBox(cx, ry, cz + halfD, cw + 0.08, railThick, railThick, darkSteelMat);
        addDecorBox(cx - halfW, ry, cz, railThick, railThick, cd + 0.08, darkSteelMat);
        addDecorBox(cx + halfW, ry, cz, railThick, railThick, cd + 0.08, darkSteelMat);
      }

      // 8 ISO Corner Castings (oversized steel blocks with twist-lock appearance)
      const castSize = 0.34;
      for (const sx of [-1, 1]) {
        for (const sy of [-1, 1]) {
          for (const sz of [-1, 1]) {
            addDecorBox(
              cx + sx * (halfW - 0.04),
              cy + sy * (halfH - 0.04),
              cz + sz * (halfD - 0.04),
              castSize,
              castSize,
              castSize,
              brushedChromeMat
            );
          }
        }
      }

      // 2. Protruding 3D vertical corrugated ribs along the long sides
      const longSpan = alongZ ? cd : cw;
      const ribCount = Math.max(4, Math.floor((longSpan - 1.0) / 0.85));
      for (let r = 0; r < ribCount; r++) {
        const offset = -longSpan / 2 + 0.65 + (r / Math.max(1, ribCount - 1)) * (longSpan - 1.3);
        if (alongZ) {
          addDecorBox(cx - halfW - 0.03, cy, cz + offset, 0.08, ch - 0.36, 0.22, mainMat);
          addDecorBox(cx + halfW + 0.03, cy, cz + offset, 0.08, ch - 0.36, 0.22, mainMat);
        } else {
          addDecorBox(cx + offset, cy, cz - halfD - 0.03, 0.22, ch - 0.36, 0.08, mainMat);
          addDecorBox(cx + offset, cy, cz + halfD + 0.03, 0.22, ch - 0.36, 0.08, mainMat);
        }
      }

      // 3. Double Cargo Doors with 4 Vertical Chrome Locking Rods & Latches on both ends
      for (const endSign of [-1, 1]) {
        if (alongZ) {
          const ez = cz + endSign * (halfD + 0.025);
          // Center door rubber seal seam
          addDecorBox(cx, cy, ez, 0.08, ch - 0.3, 0.06, darkSteelMat);
          // 4 vertical chrome locking bars
          for (const barX of [-cw * 0.28, -cw * 0.11, cw * 0.11, cw * 0.28]) {
            addDecorCyl(cx + barX, cy, ez + endSign * 0.03, 0.032, ch - 0.34, brushedChromeMat, 'y');
            addDecorBox(cx + barX, cy - 0.15, ez + endSign * 0.05, 0.12, 0.08, 0.08, hazardMat);
          }
        } else {
          const ex = cx + endSign * (halfW + 0.025);
          addDecorBox(ex, cy, cz, 0.06, ch - 0.3, 0.08, darkSteelMat);
          for (const barZ of [-cd * 0.28, -cd * 0.11, cd * 0.11, cd * 0.28]) {
            addDecorCyl(ex + endSign * 0.03, cy, cz + barZ, 0.032, ch - 0.34, brushedChromeMat, 'y');
            addDecorBox(ex + endSign * 0.05, cy - 0.15, cz + barZ, 0.08, 0.08, 0.12, hazardMat);
          }
        }
      }

      // 4. Rooftop Industrial Ventilation / Refrigeration Unit & Glowing Beacon Strip
      if (!isUpperStack) {
        addDecorBox(cx, cy + halfH + 0.14, cz, cw * 0.55, 0.26, cd * 0.35, gunmetalFrameMat);
      } else {
        addDecorBox(cx, cy + halfH + 0.06, cz, cw * 0.82, 0.1, cd * 0.82, trimAccentMat);
      }
    };

    const stackColors = [0x0284c7, 0xe11d48, 0xd97706, 0x10b981, 0x6366f1];
    let containerIdx = 0;

    for (const obs of mapCfg.obstacles) {
      const mainMat = getMat(obs.color, obs.type);
      const geo = new THREE.BoxGeometry(obs.w, obs.h, obs.d);
      this.arenaGeometries.add(geo);
      const mesh = new THREE.Mesh(geo, mainMat);
      mesh.position.set(obs.x, obs.y, obs.z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.updateMatrix();
      mesh.matrixAutoUpdate = false;
      this.scene.add(mesh);
      this.worldMeshes.push(mesh);

      const halfW = obs.w / 2;
      const halfH = obs.h / 2;
      const halfD = obs.d / 2;
      const topY = obs.y + halfH;
      const botY = obs.y - halfH;

      if (obs.type === 'container') {
        buildContainerDetails(obs.x, obs.y, obs.z, obs.w, obs.h, obs.d, mainMat, false);

        // Stack a 2nd-story shipping container on ground-level full-size containers
        // to make the arena architecture twice as tall and imposing without changing ground collision!
        if (obs.y < 2.2 && Math.max(obs.w, obs.d) >= 7.5) {
          const upperColor = stackColors[containerIdx % stackColors.length];
          containerIdx++;
          const upperMat = getMat(upperColor, 'container');
          const upperH = 3.1;
          const upperY = topY + upperH / 2 + 0.06;

          const upperCore = addDecorBox(obs.x, upperY, obs.z, obs.w * 0.96, upperH, obs.d * 0.96, upperMat, true);
          // Slight realistic dockyard stacking rotation on every 2nd container
          if (containerIdx % 2 === 0) {
            upperCore.rotation.y = 0.035;
          }
          buildContainerDetails(obs.x, upperY, obs.z, obs.w * 0.96, upperH, obs.d * 0.96, upperMat, true);
        }
      } else if (obs.type === 'crate') {
        // Multi-part 3D Tactical Supply Crate: heavy top & bottom armor collars, 4 corner exo-columns, glowing latch LEDs
        addDecorBox(obs.x, topY - 0.08, obs.z, obs.w + 0.1, 0.18, obs.d + 0.1, darkSteelMat);
        addDecorBox(obs.x, botY + 0.08, obs.z, obs.w + 0.1, 0.18, obs.d + 0.1, darkSteelMat);

        for (const sx of [-1, 1]) {
          for (const sz of [-1, 1]) {
            addDecorBox(
              obs.x + sx * (halfW - 0.04),
              obs.y,
              obs.z + sz * (halfD - 0.04),
              0.22,
              obs.h + 0.04,
              0.22,
              gunmetalFrameMat
            );
          }
        }

        // Top armored lid handles & glowing status LED bar
        addDecorBox(obs.x, topY + 0.05, obs.z, obs.w * 0.68, 0.08, obs.d * 0.68, gunmetalFrameMat);
        addDecorBox(obs.x, obs.y + 0.05, obs.z - halfD - 0.03, obs.w * 0.45, 0.09, 0.04, trimSecondaryMat);
        addDecorBox(obs.x, obs.y + 0.05, obs.z + halfD + 0.03, obs.w * 0.45, 0.09, 0.04, trimSecondaryMat);
      } else if (obs.type === 'pillar') {
        // Multi-part 3D Cyber Monolith Pillar + Towering Upper Energy Spire
        addDecorBox(obs.x, botY + 0.25, obs.z, obs.w + 0.55, 0.5, obs.d + 0.55, darkSteelMat);
        addDecorBox(obs.x, botY + 0.62, obs.z, obs.w + 0.28, 0.28, obs.d + 0.28, gunmetalFrameMat);
        addDecorBox(obs.x, topY - 0.22, obs.z, obs.w + 0.45, 0.44, obs.d + 0.45, darkSteelMat);

        // 4 Vertical Glowing Plasma Conduits & Corner Ribs
        for (const sx of [-1, 1]) {
          for (const sz of [-1, 1]) {
            addDecorBox(
              obs.x + sx * halfW,
              obs.y,
              obs.z + sz * halfD,
              0.28,
              obs.h,
              0.28,
              gunmetalFrameMat
            );
          }
        }
        addDecorBox(obs.x, obs.y, obs.z - halfD - 0.04, 0.22, obs.h * 0.82, 0.08, trimAccentMat);
        addDecorBox(obs.x, obs.y, obs.z + halfD + 0.04, 0.22, obs.h * 0.82, 0.08, trimAccentMat);
        addDecorBox(obs.x - halfW - 0.04, obs.y, obs.z, 0.08, obs.h * 0.82, 0.22, trimAccentMat);
        addDecorBox(obs.x + halfW + 0.04, obs.y, obs.z, 0.08, obs.h * 0.82, 0.22, trimAccentMat);

        // Towering Upper Energy Spire extending 10m into the sky above every pillar
        const spireH = Math.abs(obs.x) < 2 && Math.abs(obs.z) < 2 ? 12.5 : 8.5;
        addDecorBox(obs.x, topY + spireH / 2, obs.z, obs.w * 0.52, spireH, obs.d * 0.52, darkSteelMat, true);
        addDecorBox(obs.x, topY + spireH / 2, obs.z, obs.w * 0.24, spireH + 1.5, obs.d * 0.24, trimAccentMat);
        addDecorBox(obs.x, topY + spireH * 0.45, obs.z, obs.w * 0.88, 0.38, obs.d * 0.88, trimSecondaryMat);
        addDecorBox(obs.x, topY + spireH * 0.82, obs.z, obs.w * 0.72, 0.32, obs.d * 0.72, trimAccentMat);

        if (Math.abs(obs.x) < 2 && Math.abs(obs.z) < 2) {
          for (let r = 0; r < 3; r++) {
            const ringGeo = new THREE.TorusGeometry(2.5 + r * 0.65, 0.09, 10, 28);
            this.arenaGeometries.add(ringGeo);
            const ring = new THREE.Mesh(ringGeo, r % 2 === 0 ? trimAccentMat : trimSecondaryMat);
            ring.position.set(obs.x, topY + 1.2 + r * 2.2, obs.z);
            this.scene.add(ring);
            this.arenaDecorMeshes.push(ring);
            this.citadelRings.push(ring);
          }
        }
      } else if (obs.type === 'platform') {
        // Multi-part Fortified Combat Deck: Steel Girder Fascia, Corner Bastion Bollards & Glowing Edge Trim
        const isCenter = Math.abs(obs.x) < 2 && Math.abs(obs.z) < 2;
        const activeTrim = isCenter ? trimAccentMat : trimSecondaryMat;

        // Overhanging armored top deck rim
        addDecorBox(obs.x, topY - 0.14, obs.z, obs.w + 0.36, 0.28, obs.d + 0.36, darkSteelMat);
        // Glowing neon top & bottom perimeter strips
        addDecorBox(obs.x, topY - 0.04, obs.z, obs.w + 0.42, 0.09, obs.d + 0.42, activeTrim);
        addDecorBox(obs.x, botY + 0.12, obs.z, obs.w + 0.25, 0.22, obs.d + 0.25, gunmetalFrameMat);

        // 4 Corner Bastion Columns with glowing top tactical beacons (below platform deck + 0.55m corner bollards)
        for (const sx of [-1, 1]) {
          for (const sz of [-1, 1]) {
            const bx = obs.x + sx * (halfW - 0.35);
            const bz = obs.z + sz * (halfD - 0.35);
            addDecorBox(bx, obs.y + 0.28, bz, 0.85, obs.h + 0.56, 0.85, darkSteelMat);
            addDecorBox(bx, topY + 0.34, bz, 0.52, 0.18, 0.52, activeTrim);
          }
        }
      } else if (obs.type === 'step') {
        // Industrial Stair Tread Nosing & Side Neon Guide Strips
        addDecorBox(obs.x, topY - 0.03, obs.z, obs.w + 0.04, 0.06, obs.d + 0.04, brushedChromeMat);
      } else if (obs.type === 'wall') {
        const isPerimeter = Math.max(obs.w, obs.d) > 80;
        if (isPerimeter) {
          // Upgrade Perimeter Walls into towering 16m Fortified Megawalls with Buttresses & Energy Barriers
          const alongX = obs.w > obs.d;
          const upperWallH = 6.5;
          const upperWallY = topY + upperWallH / 2;

          // Upper fortified parapet wall
          addDecorBox(obs.x, upperWallY, obs.z, obs.w, upperWallH, obs.d * 1.35, gunmetalFrameMat);
          // Glowing horizontal energy conduit bands at y = 4.5m, 9.0m, and 15.2m
          addDecorBox(obs.x, 4.5, obs.z, obs.w + 0.1, 0.22, obs.d + 0.28, trimAccentMat);
          addDecorBox(obs.x, 9.1, obs.z, obs.w + 0.1, 0.28, obs.d + 0.34, trimSecondaryMat);
          addDecorBox(obs.x, topY + upperWallH - 0.2, obs.z, obs.w + 0.1, 0.32, obs.d + 0.38, trimAccentMat);

          // Heavy structural buttress ribs every 12m along the perimeter wall
          const wallSpan = alongX ? obs.w : obs.d;
          for (let offset = -wallSpan / 2 + 8; offset <= wallSpan / 2 - 8; offset += 12) {
            if (alongX) {
              const inwardSign = obs.z > 0 ? -1 : 1;
              addDecorBox(obs.x + offset, 7.5, obs.z + inwardSign * 0.55, 1.4, 15.0, 1.2, darkSteelMat);
              addDecorBox(obs.x + offset, 12.5, obs.z + inwardSign * 0.9, 0.35, 6.0, 0.35, trimAccentMat);
            } else {
              const inwardSign = obs.x > 0 ? -1 : 1;
              addDecorBox(obs.x + inwardSign * 0.55, 7.5, obs.z + offset, 1.2, 15.0, 1.4, darkSteelMat);
              addDecorBox(obs.x + inwardSign * 0.9, 12.5, obs.z + offset, 0.35, 6.0, 0.35, trimAccentMat);
            }
          }
        } else {
          // Interior Tactical Bunker Wall: Heavy Base Curb, Top Armored Cap, End Pilasters & Waist Strip
          addDecorBox(obs.x, botY + 0.16, obs.z, obs.w + 0.22, 0.32, obs.d + 0.22, darkSteelMat);
          addDecorBox(obs.x, topY - 0.12, obs.z, obs.w + 0.26, 0.26, obs.d + 0.26, darkSteelMat);
          addDecorBox(obs.x, topY + 0.04, obs.z, obs.w * 0.92, 0.08, obs.d * 0.92, brushedChromeMat);
          addDecorBox(obs.x, obs.y + 0.2, obs.z, obs.w + 0.06, 0.12, obs.d + 0.06, trimAccentMat);

          const alongX = obs.w >= obs.d;
          for (const endSign of [-1, 1]) {
            if (alongX) {
              addDecorBox(obs.x + endSign * (halfW - 0.2), obs.y, obs.z, 0.45, obs.h + 0.08, obs.d + 0.28, gunmetalFrameMat);
            } else {
              addDecorBox(obs.x, obs.y, obs.z + endSign * (halfD - 0.2), obs.w + 0.28, obs.h + 0.08, 0.45, gunmetalFrameMat);
            }
          }
        }
      }
    }

    // 4 Giant Corner Perimeter Watchtowers (at +-halfSize, +-halfSize)
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const cx = sx * (halfSize - 0.5);
        const cz = sz * (halfSize - 0.5);
        addDecorBox(cx, 12, cz, 5.5, 24, 5.5, darkSteelMat);
        addDecorBox(cx, 21.5, cz, 7.2, 3.2, 7.2, gunmetalFrameMat);
        addDecorBox(cx, 23.4, cz, 7.6, 0.45, 7.6, trimSecondaryMat);
        addDecorBox(cx, 25.5, cz, 1.4, 4.0, 1.4, trimAccentMat);
      }
    }

    // Map-Specific Heroic Architectural Landmarks (Overhead Cranes, Radar Dishes, Particle Accelerators, Archways)
    this.buildMapLandmarks(
      mapCfg.id,
      halfSize,
      addDecorBox,
      addDecorCyl,
      darkSteelMat,
      gunmetalFrameMat,
      brushedChromeMat,
      hazardMat,
      trimAccentMat,
      trimSecondaryMat
    );

    // Materialize all collected decorative pieces into GPU InstancedMeshes (~8 draw calls instead of ~1,500)
    const dummy = new THREE.Object3D();
    for (const [geo, groupMap] of decorBatches.entries()) {
      for (const [mat, batch] of groupMap.entries()) {
        const count = batch.items.length;
        if (count === 0) continue;
        const instMesh = new THREE.InstancedMesh(geo, mat, count);
        instMesh.castShadow = batch.castShadow;
        instMesh.receiveShadow = batch.castShadow;
        for (let i = 0; i < count; i++) {
          const it = batch.items[i];
          dummy.position.set(it.x, it.y, it.z);
          dummy.rotation.set(it.rotation.x, it.rotation.y, it.rotation.z);
          dummy.scale.set(it.sx, it.sy, it.sz);
          dummy.updateMatrix();
          instMesh.setMatrixAt(i, dummy.matrix);
        }
        instMesh.instanceMatrix.needsUpdate = true;
        instMesh.frustumCulled = false;
        instMesh.updateMatrix();
        instMesh.matrixAutoUpdate = false;
        this.scene.add(instMesh);
        this.arenaDecorMeshes.push(instMesh);
      }
    }

    const ringGeo = new THREE.RingGeometry(7.2, 7.65, 4);
    this.arenaGeometries.add(ringGeo);
    const ringMat = new THREE.MeshBasicMaterial({
      color: theme.accentHex || 0x38bdf8,
      side: THREE.DoubleSide
    });
    this.arenaMaterials.add(ringMat);
    const ringMesh = new THREE.Mesh(ringGeo, ringMat);
    ringMesh.rotation.x = -Math.PI / 2;
    ringMesh.rotation.z = Math.PI / 4;
    ringMesh.position.set(0, 2.43, 0);
    ringMesh.updateMatrix();
    ringMesh.matrixAutoUpdate = false;
    this.scene.add(ringMesh);
    this.arenaDecorMeshes.push(ringMesh);

    this.rebuildHitboxList();
  }

  buildMapLandmarks(
    mapId,
    halfSize,
    addDecorBox,
    addDecorCyl,
    darkSteelMat,
    gunmetalFrameMat,
    brushedChromeMat,
    hazardMat,
    trimAccentMat,
    trimSecondaryMat
  ) {
    if (mapId === 'cargo_dock') {
      // 2 Massive Industrial Port Gantry Cranes spanning West & East Dockyards (23m tall!)
      for (const sideSign of [-1, 1]) {
        const gx = sideSign * 38;
        // 4 Heavy A-frame Gantry Support Legs rooted on the crane platform edges
        for (const lz of [-7.4, 7.4]) {
          addDecorBox(gx - 5.2, 11.5, lz, 1.1, 21.0, 1.1, hazardMat, true);
          addDecorBox(gx + 5.2, 11.5, lz, 1.1, 21.0, 1.1, hazardMat, true);
          // Cross-bracing struts
          addDecorBox(gx, 10.5, lz, 11.2, 0.65, 0.65, darkSteelMat);
          addDecorBox(gx, 16.5, lz, 11.2, 0.65, 0.65, darkSteelMat);
          addDecorBox(gx, 21.5, lz, 12.2, 1.1, 1.3, gunmetalFrameMat);
        }
        // Overhead Horizontal Crane Bridge & Cantilever Boom extending toward center
        const boomX = gx - sideSign * 6.5;
        addDecorBox(boomX, 22.4, 0, 28.0, 1.4, 16.2, darkSteelMat, true);
        addDecorBox(boomX, 23.2, -7.4, 28.5, 0.35, 0.45, trimAccentMat);
        addDecorBox(boomX, 23.2, 7.4, 28.5, 0.35, 0.45, trimAccentMat);

        // Crane Operator Cabin & Hoist Trolley
        const cabX = gx - sideSign * 14.0;
        addDecorBox(cabX, 20.6, 0, 3.8, 2.2, 3.4, gunmetalFrameMat);
        addDecorBox(cabX, 20.4, 0, 4.0, 0.8, 3.6, trimSecondaryMat);

        // Steel Hoist Cables & Suspended Shipping Container high in the air (y = 13.2m)
        addDecorCyl(cabX, 17.2, -2.6, 0.06, 6.2, brushedChromeMat, 'y');
        addDecorCyl(cabX, 17.2, 2.6, 0.06, 6.2, brushedChromeMat, 'y');
        addDecorBox(cabX, 14.8, 0, 3.6, 0.45, 7.6, hazardMat);
        addDecorBox(cabX, 13.0, 0, 3.4, 3.0, 8.2, gunmetalFrameMat, true);
        addDecorBox(cabX, 13.0, 0, 3.55, 0.45, 8.3, trimAccentMat);
      }
    } else if (mapId === 'desert_outpost') {
      // Central Rotating Solar Radar Dish & Communications Array atop Command Tower
      const dishGroup = new THREE.Group();
      dishGroup.position.set(0, 13.8, 0);

      const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.65, 4.2, 10), darkSteelMat);
      this.arenaGeometries.add(mast.geometry);
      dishGroup.add(mast);

      const dishGeo = new THREE.ConeGeometry(4.2, 1.8, 16, 1, true);
      this.arenaGeometries.add(dishGeo);
      const dishMesh = new THREE.Mesh(dishGeo, brushedChromeMat);
      dishMesh.rotation.x = Math.PI * 0.68;
      dishMesh.position.set(0, 1.6, 0.6);
      dishGroup.add(dishMesh);

      const emitter = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.6, 2.6), trimAccentMat);
      this.arenaGeometries.add(emitter.geometry);
      emitter.position.set(0, 2.2, 1.4);
      dishGroup.add(emitter);

      // Dual Solar Panel Wings flanking the radar mast
      const wingL = new THREE.Mesh(new THREE.BoxGeometry(6.5, 0.18, 2.4), trimSecondaryMat);
      const wingR = new THREE.Mesh(new THREE.BoxGeometry(6.5, 0.18, 2.4), trimSecondaryMat);
      this.arenaGeometries.add(wingL.geometry);
      this.arenaGeometries.add(wingR.geometry);
      wingL.position.set(-5.2, 0.8, 0);
      wingR.position.set(5.2, 0.8, 0);
      dishGroup.add(wingL, wingR);

      this.scene.add(dishGroup);
      this.arenaDecorMeshes.push(dishGroup);
      this.citadelRings.push(dishGroup);

      // 4 Quadrant Watchtower Overhead Sun-Shield Canopies (y = 6.8m, well above jump height)
      for (const qx of [-36, 36]) {
        for (const qz of [-34, 34]) {
          for (const px of [-4.6, 4.6]) {
            for (const pz of [-4.6, 4.6]) {
              addDecorBox(qx + px, 4.6, qz + pz, 0.35, 4.4, 0.35, darkSteelMat);
            }
          }
          addDecorBox(qx, 6.9, qz, 11.4, 0.45, 11.4, gunmetalFrameMat, true);
          addDecorBox(qx, 7.2, qz, 11.6, 0.14, 11.6, trimAccentMat);
        }
      }
    } else if (mapId === 'neon_lab') {
      // Giant Suspended Quantum Particle Accelerator Ring hovering above the Lab (y = 13.5m)
      const accelTorusGeo = new THREE.TorusGeometry(10.5, 0.55, 12, 48);
      this.arenaGeometries.add(accelTorusGeo);
      const accelRing = new THREE.Mesh(accelTorusGeo, gunmetalFrameMat);
      accelRing.rotation.x = Math.PI / 2;
      accelRing.position.set(0, 13.5, 0);
      this.scene.add(accelRing);
      this.arenaDecorMeshes.push(accelRing);

      const coreTorusGeo = new THREE.TorusGeometry(9.8, 0.18, 8, 48);
      this.arenaGeometries.add(coreTorusGeo);
      const coreRing = new THREE.Mesh(coreTorusGeo, trimAccentMat);
      coreRing.rotation.x = Math.PI / 2;
      coreRing.position.set(0, 13.5, 0);
      this.scene.add(coreRing);
      this.arenaDecorMeshes.push(coreRing);

      for (let c = 0; c < 8; c++) {
        const ang = (c / 8) * Math.PI * 2;
        const rx = Math.cos(ang) * 10.5;
        const rz = Math.sin(ang) * 10.5;
        const coil = addDecorBox(rx, 13.5, rz, 1.8, 1.8, 1.8, c % 2 === 0 ? trimAccentMat : trimSecondaryMat);
        coil.rotation.y = -ang;
      }

      // Vertical Quantum Plasma Beam shooting from reactor core into the sky
      addDecorCyl(0, 22, 0, 0.55, 32, trimAccentMat, 'y');
    } else {
      // Cyber Citadel: Central Skyward Holographic Energy Beam & 4 Quadrant Archway Gates
      addDecorCyl(0, 22, 0, 0.48, 34, trimAccentMat, 'y');

      // 4 Monumental Cyber Archways spanning the North, South, West, and East avenues
      const archDist = 24;
      for (const dirSign of [-1, 1]) {
        // North & South Archway Crossbeams at z = +-24
        addDecorBox(0, 6.8, dirSign * archDist, 14.5, 1.1, 1.6, darkSteelMat, true);
        addDecorBox(0, 7.45, dirSign * archDist, 14.8, 0.24, 1.8, trimAccentMat);
        addDecorBox(-6.2, 4.9, dirSign * archDist, 1.2, 3.8, 1.6, gunmetalFrameMat);
        addDecorBox(6.2, 4.9, dirSign * archDist, 1.2, 3.8, 1.6, gunmetalFrameMat);
      }
    }
  }

  syncPickups(pickupsData = []) {
    // If map changed and pickup count/IDs differ, clear old pickup meshes first
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

        // Multi-tiered Armored Tech Pedestal Base
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

        // 4 Angled Corner Projector Claws around Pedestal
        const clawGeo = new THREE.BoxGeometry(0.22, 0.38, 0.36);
        for (let c = 0; c < 4; c++) {
          const ang = (c / 4) * Math.PI * 2 + Math.PI / 4;
          const claw = new THREE.Mesh(clawGeo, outerBaseMat);
          claw.position.set(Math.cos(ang) * 1.25, 0.22, Math.sin(ang) * 1.25);
          claw.rotation.y = -ang + Math.PI / 2;
          claw.rotation.x = 0.35;
          group.add(claw);
        }

        // Holographic outer ring + inneremitter ring
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

        // Floating 3D Sculpted Green Cross Health Pack + Outer Octahedron Crystal Cage
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
        item = { group, crossGroup, padMat, holoRing };
        this.pickupMeshes.set(p.id, item);
      }

      item.crossGroup.visible = Boolean(p.active);
      item.holoRing.visible = Boolean(p.active);
      item.padMat.emissiveIntensity = p.active ? 0.55 : 0.05;
    }
  }

  updatePickupSingle(pickupId, active) {
    const item = this.pickupMeshes.get(pickupId);
    if (item) {
      item.crossGroup.visible = Boolean(active);
      item.holoRing.visible = Boolean(active);
      item.padMat.emissiveIntensity = active ? 0.5 : 0.05;
    }
  }

  createWeaponMesh(weaponId, isFirstPerson = false) {
    const group = new THREE.Group();
    const darkMetal = new THREE.MeshStandardMaterial({
      color: 0x0f172a,
      roughness: 0.32,
      metalness: 0.78
    });
    const gunMetal = new THREE.MeshStandardMaterial({
      color: 0x334155,
      roughness: 0.28,
      metalness: 0.85
    });
    const polymerMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.58,
      metalness: 0.32
    });
    const chromeMetal = new THREE.MeshStandardMaterial({
      color: 0xcbd5e1,
      roughness: 0.18,
      metalness: 0.92
    });
    const brassMat = new THREE.MeshStandardMaterial({
      color: 0xfacc15,
      roughness: 0.25,
      metalness: 0.88
    });
    const accentColor = WEAPONS[weaponId]?.color || 0xf59e0b;
    const accentMat = new THREE.MeshStandardMaterial({
      color: accentColor,
      emissive: accentColor,
      emissiveIntensity: 0.42,
      roughness: 0.22,
      metalness: 0.5
    });
    const reticleMat = new THREE.MeshBasicMaterial({ color: 0x22c55e });
    const glassMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.36,
      side: THREE.DoubleSide
    });

    let magMesh = null;
    let boltMesh = null;
    let muzzleZ = -0.75;

    if (weaponId === 'rifle' || weaponId === 'm4a1' || weaponId === 'scar') {
      // ASSAULT RIFLES: VANDAL-AK / PHANTOM-M4 (Suppressed) / SCAR-H 7.62 (Battle Rifle)
      const isM4 = weaponId === 'm4a1';
      const isScar = weaponId === 'scar';
      const upperReceiver = new THREE.Mesh(
        new THREE.BoxGeometry(0.092, isScar ? 0.105 : 0.088, isScar ? 0.52 : 0.48),
        isScar ? accentMat : darkMetal
      );
      upperReceiver.position.set(0, 0.025, 0);
      const lowerReceiver = new THREE.Mesh(new THREE.BoxGeometry(0.084, 0.068, 0.38), polymerMat);
      lowerReceiver.position.set(0, -0.038, 0.02);

      // Side Accent Trim Strips
      const trimStrip = new THREE.Mesh(new THREE.BoxGeometry(0.098, 0.016, 0.38), accentMat);
      trimStrip.position.set(0, 0.032, -0.02);

      // Ventilated M-LOK Handguard + Gas Block
      const handguard = new THREE.Mesh(new THREE.BoxGeometry(0.078, 0.098, 0.35), gunMetal);
      handguard.position.set(0, 0.015, -0.37);
      const gasBlock = new THREE.Mesh(new THREE.BoxGeometry(0.052, 0.065, 0.06), darkMetal);
      gasBlock.position.set(0, 0.038, -0.55);
      const gasTube = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.34, 8), chromeMetal);
      gasTube.rotation.x = Math.PI / 2;
      gasTube.position.set(0, 0.056, -0.37);

      // Top Picatinny Rail Teeth
      const railBase = new THREE.Mesh(new THREE.BoxGeometry(0.048, 0.014, 0.68), gunMetal);
      railBase.position.set(0, 0.074, -0.14);

      // Precision Barrel & Muzzle / Suppressor
      const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.42, 10), chromeMetal);
      barrel.rotation.x = Math.PI / 2;
      barrel.position.set(0, 0.018, -0.58);
      const brake = isM4
        ? new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.24, 12), darkMetal)
        : new THREE.Mesh(new THREE.BoxGeometry(0.046, 0.046, 0.085), accentMat);
      if (isM4) brake.rotation.x = Math.PI / 2;
      brake.position.set(0, 0.018, isM4 ? -0.82 : -0.79);

      // Angled Tactical Foregrip under Handguard
      const foregrip = new THREE.Mesh(new THREE.BoxGeometry(0.048, 0.11, 0.068), polymerMat);
      foregrip.position.set(0, -0.072, -0.35);
      foregrip.rotation.x = isM4 ? 0.05 : 0.28;

      // Buttstock, Cheek Riser & Rubber Pad
      const stock = new THREE.Mesh(new THREE.BoxGeometry(0.074, 0.118, 0.26), isScar ? accentMat : polymerMat);
      stock.position.set(0, -0.008, 0.33);
      const buttPad = new THREE.Mesh(new THREE.BoxGeometry(0.078, 0.132, 0.035), darkMetal);
      buttPad.position.set(0, -0.012, 0.47);
      const grip = new THREE.Mesh(new THREE.BoxGeometry(0.058, 0.16, 0.085), polymerMat);
      grip.position.set(0, -0.115, 0.13);
      grip.rotation.x = -0.26;
      const triggerGuard = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.016, 0.09), darkMetal);
      triggerGuard.position.set(0, -0.082, 0.04);

      // Detachable Magazine (Straight heavy 7.62 mag for SCAR, curved mag for AK/M4)
      magMesh = new THREE.Group();
      const magBody = new THREE.Mesh(
        new THREE.BoxGeometry(0.058, isScar ? 0.21 : 0.24, isScar ? 0.115 : 0.102),
        isScar ? gunMetal : accentMat
      );
      const magPlate = new THREE.Mesh(new THREE.BoxGeometry(0.066, 0.032, 0.115), darkMetal);
      magPlate.position.set(0, -0.12, 0);
      magMesh.add(magBody, magPlate);
      magMesh.position.set(0, -0.15, -0.09);
      magMesh.rotation.x = isScar ? 0.04 : 0.24;
      magMesh.userData.basePos = magMesh.position.clone();

      // Reciprocating Charging Handle / Bolt Carrier
      boltMesh = new THREE.Mesh(new THREE.BoxGeometry(0.115, 0.034, 0.12), chromeMetal);
      boltMesh.position.set(0.018, 0.042, -0.04);
      boltMesh.userData.baseZ = -0.04;

      // Optic Sight (ACOG tube for SCAR, EOTech Holo for AK/M4)
      const sightHood = isScar
        ? new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.028, 0.18, 12), darkMetal)
        : new THREE.Mesh(new THREE.BoxGeometry(0.068, 0.065, 0.12), darkMetal);
      if (isScar) sightHood.rotation.x = Math.PI / 2;
      sightHood.position.set(0, 0.112, -0.02);
      const sightLens = new THREE.Mesh(new THREE.PlaneGeometry(0.052, 0.046), glassMat);
      sightLens.position.set(0, 0.11, -0.02);
      const sightDot = new THREE.Mesh(new THREE.SphereGeometry(0.0075, 8, 8), reticleMat);
      sightDot.position.set(0, 0.11, -0.025);

      group.add(
        upperReceiver,
        lowerReceiver,
        trimStrip,
        handguard,
        gasBlock,
        gasTube,
        railBase,
        barrel,
        brake,
        foregrip,
        stock,
        buttPad,
        grip,
        triggerGuard,
        magMesh,
        boltMesh,
        sightHood,
        sightLens,
        sightDot
      );
      muzzleZ = isM4 ? -0.95 : -0.86;
    } else if (weaponId === 'smg') {
      // VECTOR-KRISS SMG: Futuristic CQB Submachine Gun with Angled Super-V Recoil Frame
      const upperBody = new THREE.Mesh(new THREE.BoxGeometry(0.088, 0.092, 0.42), darkMetal);
      upperBody.position.set(0, 0.028, -0.05);
      const vectorHousing = new THREE.Mesh(new THREE.BoxGeometry(0.082, 0.15, 0.14), accentMat);
      vectorHousing.position.set(0, -0.055, -0.18);
      vectorHousing.rotation.x = 0.18;
      const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.28, 10), gunMetal);
      barrel.rotation.x = Math.PI / 2;
      barrel.position.set(0, 0.015, -0.34);
      const holoSight = new THREE.Mesh(new THREE.BoxGeometry(0.058, 0.055, 0.09), gunMetal);
      holoSight.position.set(0, 0.095, -0.04);
      const sightDot = new THREE.Mesh(new THREE.SphereGeometry(0.007, 8, 8), reticleMat);
      sightDot.position.set(0, 0.098, -0.04);
      const foldingStock = new THREE.Mesh(new THREE.BoxGeometry(0.058, 0.085, 0.24), polymerMat);
      foldingStock.position.set(0, 0.01, 0.26);
      const grip = new THREE.Mesh(new THREE.BoxGeometry(0.056, 0.15, 0.08), polymerMat);
      grip.position.set(0, -0.095, 0.06);
      grip.rotation.x = -0.2;

      magMesh = new THREE.Mesh(new THREE.BoxGeometry(0.048, 0.26, 0.068), gunMetal);
      magMesh.position.set(0, -0.17, -0.19);
      magMesh.rotation.x = 0.22;
      magMesh.userData.basePos = magMesh.position.clone();

      boltMesh = new THREE.Mesh(new THREE.BoxGeometry(0.105, 0.028, 0.09), chromeMetal);
      boltMesh.position.set(0.015, 0.04, -0.1);
      boltMesh.userData.baseZ = -0.1;

      group.add(upperBody, vectorHousing, barrel, holoSight, sightDot, foldingStock, grip, magMesh, boltMesh);
      muzzleZ = -0.52;
    } else if (weaponId === 'lmg') {
      // ODIN-M249: Heavy Squad Automatic Machinegun with 80-Round Drum Box & Dual Barrel Shroud
      const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.125, 0.135, 0.56), darkMetal);
      receiver.position.set(0, 0.02, -0.04);
      const topCover = new THREE.Mesh(new THREE.BoxGeometry(0.115, 0.036, 0.34), accentMat);
      topCover.position.set(0, 0.095, -0.02);
      const shroud = new THREE.Mesh(new THREE.BoxGeometry(0.105, 0.11, 0.42), gunMetal);
      shroud.position.set(0, 0.015, -0.48);
      const heavyBarrel = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.48, 12), chromeMetal);
      heavyBarrel.rotation.x = Math.PI / 2;
      heavyBarrel.position.set(0, 0.028, -0.68);
      const muzzleBrake = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.032, 0.09, 10), accentMat);
      muzzleBrake.rotation.x = Math.PI / 2;
      muzzleBrake.position.set(0, 0.028, -0.92);
      const stock = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.135, 0.28), polymerMat);
      stock.position.set(0, -0.01, 0.36);
      const grip = new THREE.Mesh(new THREE.BoxGeometry(0.064, 0.16, 0.09), polymerMat);
      grip.position.set(0, -0.115, 0.14);
      grip.rotation.x = -0.22;

      // 80-Round Box Drum Magazine
      magMesh = new THREE.Group();
      const boxDrum = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.22, 0.18), accentMat);
      const ammoBelt = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.09, 0.09), brassMat);
      ammoBelt.position.set(0, 0.12, 0);
      magMesh.add(boxDrum, ammoBelt);
      magMesh.position.set(0, -0.16, -0.14);
      magMesh.userData.basePos = magMesh.position.clone();

      boltMesh = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.036, 0.13), chromeMetal);
      boltMesh.position.set(0.025, 0.04, -0.06);
      boltMesh.userData.baseZ = -0.06;

      group.add(receiver, topCover, shroud, heavyBarrel, muzzleBrake, stock, grip, magMesh, boltMesh);
      muzzleZ = -0.96;
    } else if (weaponId === 'shotgun') {
      // BUCKSHOT-8: Heavy Tactical Combat Pump Shotgun with Heatshield & Side Shell Saddle
      const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.112, 0.142, 0.52), darkMetal);
      const barrelTop = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.62, 12), gunMetal);
      barrelTop.rotation.x = Math.PI / 2;
      barrelTop.position.set(0, 0.038, -0.48);

      // Ventilated Top Barrel Heatshield
      const heatshield = new THREE.Mesh(new THREE.BoxGeometry(0.062, 0.028, 0.44), darkMetal);
      heatshield.position.set(0, 0.056, -0.42);
      const magTube = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.56, 10), chromeMetal);
      magTube.rotation.x = Math.PI / 2;
      magTube.position.set(0, -0.012, -0.45);
      const barrelClamp = new THREE.Mesh(new THREE.BoxGeometry(0.058, 0.095, 0.045), accentMat);
      barrelClamp.position.set(0, 0.012, -0.66);
      const breacherChoke = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.028, 0.07, 10), accentMat);
      breacherChoke.rotation.x = Math.PI / 2;
      breacherChoke.position.set(0, 0.038, -0.8);

      // Sliding Ribbed Pump Forend (Acts as boltMesh so it pumps on each shot!)
      boltMesh = new THREE.Group();
      const pumpBody = new THREE.Mesh(new THREE.BoxGeometry(0.098, 0.082, 0.27), accentMat);
      const pumpRail = new THREE.Mesh(new THREE.BoxGeometry(0.072, 0.022, 0.36), chromeMetal);
      pumpRail.position.set(0, 0.02, 0.08);
      boltMesh.add(pumpBody, pumpRail);
      boltMesh.position.set(0, -0.022, -0.37);
      boltMesh.userData.baseZ = -0.37;

      // Side Shell Saddle with 4 Visible 12-Gauge Shells (Acts as magMesh)
      magMesh = new THREE.Group();
      const saddlePlate = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.085, 0.22), gunMetal);
      saddlePlate.position.set(0.058, 0.01, -0.02);
      magMesh.add(saddlePlate);
      for (let s = 0; s < 4; s++) {
        const shellHull = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.068, 8), accentMat);
        shellHull.position.set(0.068, 0.01, -0.09 + s * 0.045);
        const shellBrass = new THREE.Mesh(new THREE.CylinderGeometry(0.0115, 0.0115, 0.022, 8), brassMat);
        shellBrass.position.set(0.068, 0.036, -0.09 + s * 0.045);
        magMesh.add(shellHull, shellBrass);
      }
      magMesh.position.set(0, -0.01, 0.02);
      magMesh.userData.basePos = magMesh.position.clone();

      const stock = new THREE.Mesh(new THREE.BoxGeometry(0.082, 0.125, 0.28), polymerMat);
      stock.position.set(0, -0.015, 0.35);
      const grip = new THREE.Mesh(new THREE.BoxGeometry(0.064, 0.16, 0.09), polymerMat);
      grip.position.set(0, -0.115, 0.17);
      grip.rotation.x = -0.28;

      const rearSight = new THREE.Mesh(new THREE.BoxGeometry(0.072, 0.04, 0.065), accentMat);
      rearSight.position.set(0, 0.09, 0.06);
      const frontPost = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.032, 0.025), reticleMat);
      frontPost.position.set(0, 0.075, -0.74);

      group.add(
        receiver,
        barrelTop,
        heatshield,
        magTube,
        barrelClamp,
        breacherChoke,
        boltMesh,
        magMesh,
        stock,
        grip,
        rearSight,
        frontPost
      );
      muzzleZ = -0.84;
    } else if (weaponId === 'sniper') {
      // AWP-PHANTOM: Anti-Materiel Long-Range Sniper Chassis with Dual-Bell Scope & Folded Bipod
      const chassis = new THREE.Mesh(new THREE.BoxGeometry(0.098, 0.138, 0.72), darkMetal);
      const cheekRest = new THREE.Mesh(new THREE.BoxGeometry(0.084, 0.055, 0.22), accentMat);
      cheekRest.position.set(0, 0.065, 0.38);

      const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.025, 0.84, 12), gunMetal);
      barrel.rotation.x = Math.PI / 2;
      barrel.position.set(0, 0.028, -0.7);
      const muzzleBrake = new THREE.Mesh(new THREE.BoxGeometry(0.064, 0.052, 0.11), accentMat);
      muzzleBrake.position.set(0, 0.028, -1.12);

      // Folded Tactical Bipod Legs under Forend
      const bipodLeft = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.28, 6), chromeMetal);
      bipodLeft.rotation.x = Math.PI / 2;
      bipodLeft.position.set(-0.042, -0.055, -0.46);
      const bipodRight = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.28, 6), chromeMetal);
      bipodRight.rotation.x = Math.PI / 2;
      bipodRight.position.set(0.042, -0.055, -0.46);

      // High-Power Dual-Bell Telescopic Scope with Turrets & Glowing Objective Lens
      const scopeTube = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, 0.42, 14), darkMetal);
      scopeTube.rotation.x = Math.PI / 2;
      scopeTube.position.set(0, 0.135, -0.09);
      const frontBell = new THREE.Mesh(new THREE.CylinderGeometry(0.048, 0.034, 0.14, 14), accentMat);
      frontBell.rotation.x = Math.PI / 2;
      frontBell.position.set(0, 0.135, -0.28);
      const rearBell = new THREE.Mesh(new THREE.CylinderGeometry(0.034, 0.042, 0.1, 14), accentMat);
      rearBell.rotation.x = Math.PI / 2;
      rearBell.position.set(0, 0.135, 0.11);
      const lensGlass = new THREE.Mesh(new THREE.CircleGeometry(0.038, 12), glassMat);
      lensGlass.position.set(0, 0.135, 0.162);
      const turretTop = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.035, 8), chromeMetal);
      turretTop.position.set(0, 0.172, -0.07);
      const scopeMount = new THREE.Mesh(new THREE.BoxGeometry(0.056, 0.055, 0.22), gunMetal);
      scopeMount.position.set(0, 0.085, -0.09);

      // Detachable Heavy Box Magazine & Bolt Handle
      magMesh = new THREE.Mesh(new THREE.BoxGeometry(0.066, 0.175, 0.145), gunMetal);
      magMesh.position.set(0, -0.12, -0.08);
      magMesh.userData.basePos = magMesh.position.clone();

      boltMesh = new THREE.Group();
      const boltCarrier = new THREE.Mesh(new THREE.BoxGeometry(0.105, 0.032, 0.14), chromeMetal);
      const boltKnob = new THREE.Mesh(new THREE.SphereGeometry(0.022, 8, 8), darkMetal);
      boltKnob.position.set(0.068, -0.01, 0.02);
      boltMesh.add(boltCarrier, boltKnob);
      boltMesh.position.set(0.02, 0.038, 0.06);
      boltMesh.userData.baseZ = 0.06;

      const stock = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.13, 0.3), polymerMat);
      stock.position.set(0, -0.01, 0.44);
      const grip = new THREE.Mesh(new THREE.BoxGeometry(0.058, 0.155, 0.085), polymerMat);
      grip.position.set(0, -0.115, 0.16);
      grip.rotation.x = -0.24;

      group.add(
        chassis,
        cheekRest,
        barrel,
        muzzleBrake,
        bipodLeft,
        bipodRight,
        scopeTube,
        frontBell,
        rearBell,
        lensGlass,
        turretTop,
        scopeMount,
        magMesh,
        boltMesh,
        stock,
        grip
      );
      muzzleZ = -1.18;
    } else if (weaponId === 'knife') {
      // KARAMBIT-X: Curved Cyber Plasma-Edged Tactical Combat Knife with Finger Ring
      const handle = new THREE.Mesh(new THREE.BoxGeometry(0.042, 0.16, 0.065), darkMetal);
      handle.position.set(0, -0.04, -0.08);
      handle.rotation.x = 0.25;
      const fingerRing = new THREE.Mesh(new THREE.TorusGeometry(0.028, 0.008, 8, 16), accentMat);
      fingerRing.rotation.y = Math.PI / 2;
      fingerRing.position.set(0, -0.13, -0.05);
      const guard = new THREE.Mesh(new THREE.BoxGeometry(0.052, 0.028, 0.095), gunMetal);
      guard.position.set(0, 0.04, -0.1);
      const bladeSpine = new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.065, 0.24), chromeMetal);
      bladeSpine.position.set(0, 0.09, -0.22);
      bladeSpine.rotation.x = -0.35;
      const plasmaEdge = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.018, 0.25), accentMat);
      plasmaEdge.position.set(0, 0.065, -0.23);
      plasmaEdge.rotation.x = -0.35;
      group.add(handle, fingerRing, guard, bladeSpine, plasmaEdge);
      muzzleZ = -0.35;
    } else {
      // SECONDARY PISTOLS: PULSE-P9 / SHERIFF .50 (Deagle) / FRENZY-G18 (Auto Glock)
      const isDeagle = weaponId === 'deagle';
      const isGlock = weaponId === 'glock';
      const slideLen = isDeagle ? 0.39 : 0.33;
      const frame = new THREE.Mesh(new THREE.BoxGeometry(0.072, 0.058, slideLen - 0.02), polymerMat);
      frame.position.set(0, -0.02, -0.03);

      // Underbarrel Tactical Flashlight / Laser Sight Module
      const laserBox = new THREE.Mesh(new THREE.BoxGeometry(0.058, 0.042, 0.11), gunMetal);
      laserBox.position.set(0, -0.052, -0.12);
      const laserLens = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.02, 8), reticleMat);
      laserLens.rotation.x = Math.PI / 2;
      laserLens.position.set(0, -0.052, -0.178);

      // Reciprocating Two-Tone Top Slide with Front/Rear Sight Posts
      boltMesh = new THREE.Group();
      const slideBody = new THREE.Mesh(
        new THREE.BoxGeometry(isDeagle ? 0.088 : 0.078, isDeagle ? 0.086 : 0.072, slideLen),
        isDeagle ? chromeMetal : accentMat
      );
      const ejectionPort = new THREE.Mesh(new THREE.BoxGeometry(0.082, 0.035, 0.075), chromeMetal);
      ejectionPort.position.set(0.002, 0.015, 0.01);
      const rearDot = new THREE.Mesh(new THREE.BoxGeometry(0.048, 0.024, 0.022), reticleMat);
      rearDot.position.set(0, 0.045, 0.13);
      const frontDot = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.022, 0.02), reticleMat);
      frontDot.position.set(0, 0.045, -0.14);
      boltMesh.add(slideBody, ejectionPort, rearDot, frontDot);
      boltMesh.position.set(0, 0.028, -0.03);
      boltMesh.userData.baseZ = -0.03;

      const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.15, 10), chromeMetal);
      barrel.rotation.x = Math.PI / 2;
      barrel.position.set(0, 0.028, -0.22);

      const grip = new THREE.Mesh(new THREE.BoxGeometry(0.066, 0.175, 0.092), darkMetal);
      grip.position.set(0, -0.105, 0.08);
      grip.rotation.x = -0.22;
      const triggerGuard = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.014, 0.08), polymerMat);
      triggerGuard.position.set(0, -0.068, 0.01);

      magMesh = new THREE.Group();
      const pMagBody = new THREE.Mesh(
        new THREE.BoxGeometry(0.054, isGlock ? 0.25 : 0.17, 0.076),
        gunMetal
      );
      const pMagBase = new THREE.Mesh(new THREE.BoxGeometry(0.068, 0.026, 0.092), accentMat);
      pMagBase.position.set(0, isGlock ? -0.13 : -0.088, 0);
      magMesh.add(pMagBody, pMagBase);
      magMesh.position.set(0, -0.115, 0.08);
      magMesh.rotation.x = -0.22;
      magMesh.userData.basePos = magMesh.position.clone();

      group.add(frame, laserBox, laserLens, boltMesh, barrel, grip, triggerGuard, magMesh);
      muzzleZ = isDeagle ? -0.35 : -0.31;
    }

    if (isFirstPerson) {
      // Scale first-person viewmodel by 1.14x so weapons feel weighty, closer, and detailed
      group.scale.setScalar(1.14);

      // First-Person Armored Cyber-Gloves, Knuckle Plates, Forearm Sleeves & Tactical Wrist Watch
      const sleeveMat = new THREE.MeshStandardMaterial({
        color: 0x1e293b,
        roughness: 0.52,
        metalness: 0.35
      });
      const gloveMat = new THREE.MeshStandardMaterial({
        color: 0x0f172a,
        roughness: 0.36,
        metalness: 0.55
      });
      const cuffMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8 });

      // Right trigger hand, knuckle armor & forearm
      const rightHand = new THREE.Mesh(new THREE.BoxGeometry(0.082, 0.088, 0.12), gloveMat);
      rightHand.position.set(0.012, -0.11, 0.12);
      const rightKnuckle = new THREE.Mesh(new THREE.BoxGeometry(0.088, 0.032, 0.075), gunMetal);
      rightKnuckle.position.set(0.014, -0.082, 0.105);
      const rightArm = new THREE.Mesh(new THREE.BoxGeometry(0.094, 0.096, 0.38), sleeveMat);
      rightArm.position.set(0.065, -0.175, 0.33);
      rightArm.rotation.x = 0.22;
      rightArm.rotation.y = -0.15;
      group.add(rightHand, rightKnuckle, rightArm);

      // Left support hand, holographic wrist tac-watch & forearm
      const isOneHanded = WEAPONS[weaponId]?.slot === 2 || WEAPONS[weaponId]?.slot === 3;
      if (!isOneHanded) {
        const leftHand = new THREE.Mesh(new THREE.BoxGeometry(0.086, 0.084, 0.135), gloveMat);
        leftHand.position.set(-0.02, -0.058, -0.33);
        const leftKnuckle = new THREE.Mesh(new THREE.BoxGeometry(0.092, 0.028, 0.085), gunMetal);
        leftKnuckle.position.set(-0.022, -0.038, -0.33);
        const leftCuff = new THREE.Mesh(new THREE.BoxGeometry(0.094, 0.09, 0.024), cuffMat);
        leftCuff.position.set(-0.062, -0.092, -0.22);
        const tacWatch = new THREE.Mesh(new THREE.BoxGeometry(0.042, 0.018, 0.048), reticleMat);
        tacWatch.position.set(-0.045, -0.046, -0.22);
        const leftArm = new THREE.Mesh(new THREE.BoxGeometry(0.092, 0.092, 0.44), sleeveMat);
        leftArm.position.set(-0.165, -0.165, -0.05);
        leftArm.rotation.y = 0.42;
        leftArm.rotation.x = 0.25;
        group.add(leftHand, leftKnuckle, leftCuff, tacWatch, leftArm);
      }

      // Multi-fin 3D Muzzle Flash at barrel tip
      const flashGroup = new THREE.Group();
      const flashMat = new THREE.MeshBasicMaterial({
        color: 0xfef08a,
        transparent: true,
        opacity: 0.94,
        side: THREE.DoubleSide
      });
      const coreCone = new THREE.Mesh(new THREE.ConeGeometry(0.082, 0.28, 6), flashMat);
      coreCone.rotation.x = -Math.PI / 2;
      const crossPlaneA = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.3), flashMat);
      const crossPlaneB = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.3), flashMat);
      crossPlaneA.rotation.y = Math.PI / 4;
      crossPlaneB.rotation.y = -Math.PI / 4;
      flashGroup.add(coreCone, crossPlaneA, crossPlaneB);
      flashGroup.position.set(0, 0.025, muzzleZ);
      flashGroup.visible = false;
      group.add(flashGroup);

      group.userData.flashMesh = flashGroup;
      group.userData.magMesh = magMesh;
      group.userData.boltMesh = boltMesh;
    } else {
      // Slightly larger third-person weapon scale so enemies' held weapons are clearly identifiable
      group.scale.setScalar(1.12);
      const tpFlash = new THREE.Mesh(
        new THREE.SphereGeometry(0.14, 6, 6),
        new THREE.MeshBasicMaterial({ color: 0xfef08a })
      );
      tpFlash.position.set(0, 0.02, muzzleZ);
      tpFlash.visible = false;
      group.add(tpFlash);
      group.userData.flashMesh = tpFlash;
    }

    return group;
  }

  setupViewmodelWeapons() {
    this.viewmodelRig = new THREE.Group();
    this.camera.add(this.viewmodelRig);

    // Dedicated soft key light attached to camera so first-person weapon & metallic rails
    // always catch crisp specular highlights regardless of room shadow angle
    this.viewmodelKeyLight = new THREE.PointLight(0xe0f2fe, 0.72, 2.5, 1.5);
    this.viewmodelKeyLight.position.set(0.22, 0.28, -0.25);
    this.camera.add(this.viewmodelKeyLight);

    // Dynamic Muzzle Flash PointLight attached to viewmodel rig
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
    this.accumulatedRecoilPitch = 0;
    this.accumulatedRecoilYaw = 0;

    const cfg = WEAPONS[weaponId];
    this.equipDuration = cfg.equipMs || 220;
    this.equipUntil = performance.now() + this.equipDuration;

    for (const wId of WEAPON_ORDER) {
      const vm = this.viewmodelMeshes[wId];
      if (vm) {
        vm.visible = wId === weaponId;
        // Reset any reload magazine or bolt displacement on previous weapon
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
    this.callbacks.onWeaponChanged?.(weaponId, this.ammoByWeapon[weaponId], cfg.magSize);
  }

  startReload() {
    if (!this.inMatch || !this.alive) return;
    const cfg = WEAPONS[this.currentWeapon];
    if (!cfg || cfg.isMelee || cfg.infiniteAmmo) return;
    const now = performance.now();
    if (this.reloadingUntil > now) return;

    const currentAmmo = this.ammoByWeapon[this.currentWeapon];
    if (currentAmmo >= cfg.magSize) return;

    this.isAiming = false;
    this.isSprinting = false;
    this.reloadStartedAt = now;

    if (cfg.shellByShell) {
      // Shotgun shell-by-shell reload (interruptible by shooting!)
      const missing = Math.max(1, cfg.magSize - currentAmmo);
      const startDelay = cfg.shellReloadStartMs || 240;
      const shellMs = cfg.shellReloadMs || 390;
      this.reloadMode = 'shell';
      this.reloadDuration = startDelay + missing * shellMs;
      this.nextShellAt = now + startDelay + shellMs;
      this.reloadingUntil = now + this.reloadDuration;
    } else {
      // Tactical reload (faster when round is chambered) vs Dry/Empty reload (full bolt rack)
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
      cfg.magSize
    );
  }

  createPlayerNameSprite(name) {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 72;
    const ctx = canvas.getContext('2d');

    const texture = new THREE.CanvasTexture(canvas);
    const material = new THREE.SpriteMaterial({ map: texture, depthTest: false });
    const sprite = new THREE.Sprite(material);
    sprite.scale.set(2.25, 0.64, 1);
    sprite.position.set(0, 2.46, 0);
    sprite.renderOrder = 10;

    const updateLabel = (hp) => {
      ctx.clearRect(0, 0, 256, 72);

      // Sleek tactical HUD pill
      ctx.fillStyle = 'rgba(9, 13, 22, 0.86)';
      ctx.fillRect(22, 6, 212, 56);
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.55)';
      ctx.lineWidth = 2;
      ctx.strokeRect(22, 6, 212, 56);

      // Name text
      ctx.font = 'bold 21px Segoe UI, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#f8fafc';
      ctx.fillText(name.slice(0, 15), 128, 30);

      // HP Bar Track
      ctx.fillStyle = 'rgba(0, 0, 0, 0.82)';
      ctx.fillRect(38, 41, 180, 11);

      // HP Bar Fill
      const pct = Math.max(0, Math.min(1, hp / 100));
      ctx.fillStyle = pct > 0.5 ? '#22c55e' : pct > 0.25 ? '#f59e0b' : '#ef4444';
      ctx.fillRect(38, 41, Math.round(180 * pct), 11);

      texture.needsUpdate = true;
    };

    updateLabel(100);
    return { sprite, canvas, texture, material, updateLabel };
  }

  createRemotePlayerMesh(playerData) {
    const group = new THREE.Group();
    const pColor = playerData.color || 0x38bdf8;
    const mainMat = new THREE.MeshStandardMaterial({
      color: pColor,
      roughness: 0.34,
      metalness: 0.35
    });
    const darkMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.5,
      metalness: 0.45
    });
    const armorMat = new THREE.MeshStandardMaterial({
      color: 0x0f172a,
      roughness: 0.28,
      metalness: 0.75
    });
    const chromeMat = new THREE.MeshStandardMaterial({
      color: 0x94a3b8,
      roughness: 0.22,
      metalness: 0.88
    });
    const visorMat = new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      emissive: pColor,
      emissiveIntensity: 0.9,
      roughness: 0.15
    });

    // 1. Torso Core (Body Hitbox)
    const torsoGeo = new THREE.BoxGeometry(0.7, 0.82, 0.42);
    const torsoMesh = new THREE.Mesh(torsoGeo, mainMat);
    torsoMesh.position.y = 1.08;
    torsoMesh.castShadow = true;
    torsoMesh.userData = { playerId: playerData.id, isHeadshot: false };
    group.add(torsoMesh);

    // Sculpted Exo-Armor Chest Rig, Arc Core, Collar & Utility Belt
    const chestPlate = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.46, 0.48), armorMat);
    chestPlate.position.set(0, 1.2, 0);
    const absPlate = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.24, 0.45), darkMat);
    absPlate.position.set(0, 0.86, 0);
    const neckGuard = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.24, 0.14, 10), armorMat);
    neckGuard.position.set(0, 1.5, 0);
    const coreBadge = new THREE.Mesh(new THREE.OctahedronGeometry(0.11, 0), visorMat);
    coreBadge.position.set(0, 1.22, -0.22);

    // Tactical Waist Belt & Side Ammo Pouches
    const utilityBelt = new THREE.Mesh(new THREE.BoxGeometry(0.74, 0.11, 0.46), armorMat);
    utilityBelt.position.set(0, 0.72, 0);
    const pouchL = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.16, 0.18), darkMat);
    pouchL.position.set(-0.39, 0.73, -0.05);
    const pouchR = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.16, 0.18), darkMat);
    pouchR.position.set(0.39, 0.73, -0.05);

    // Twin-Thruster Cyber Jetpack on Back
    const backpack = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.54, 0.24), armorMat);
    backpack.position.set(0, 1.15, 0.28);
    const thrusterGeo = new THREE.CylinderGeometry(0.065, 0.085, 0.44, 8);
    const thrusterL = new THREE.Mesh(thrusterGeo, chromeMat);
    thrusterL.position.set(-0.18, 1.14, 0.34);
    const thrusterR = new THREE.Mesh(thrusterGeo, chromeMat);
    thrusterR.position.set(0.18, 1.14, 0.34);
    const nozzleGlowL = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.05, 8), visorMat);
    nozzleGlowL.position.set(-0.18, 0.91, 0.34);
    const nozzleGlowR = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.05, 8), visorMat);
    nozzleGlowR.position.set(0.18, 0.91, 0.34);
    group.add(
      chestPlate,
      absPlate,
      neckGuard,
      coreBadge,
      utilityBelt,
      pouchL,
      pouchR,
      backpack,
      thrusterL,
      thrusterR,
      nozzleGlowL,
      nozzleGlowR
    );

    // Layered Angled Shoulder Pauldrons
    const leftShoulder = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.26, 0.38), armorMat);
    leftShoulder.position.set(-0.46, 1.35, 0);
    leftShoulder.rotation.z = 0.18;
    const leftShoulderTrim = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.06, 0.4), visorMat);
    leftShoulderTrim.position.set(-0.47, 1.44, 0);
    leftShoulderTrim.rotation.z = 0.18;

    const rightShoulder = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.26, 0.38), armorMat);
    rightShoulder.position.set(0.46, 1.35, 0);
    rightShoulder.rotation.z = -0.18;
    const rightShoulderTrim = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.06, 0.4), visorMat);
    rightShoulderTrim.position.set(0.47, 1.44, 0);
    rightShoulderTrim.rotation.z = -0.18;
    group.add(leftShoulder, leftShoulderTrim, rightShoulder, rightShoulderTrim);

    // 2. Sculpted Tactical Helmet & Wrap-Around Glowing Visor (Headshot Hitbox)
    const headGeo = new THREE.BoxGeometry(0.46, 0.46, 0.46);
    const headMesh = new THREE.Mesh(headGeo, mainMat);
    headMesh.position.y = 1.76;
    headMesh.castShadow = true;
    headMesh.userData = { playerId: playerData.id, isHeadshot: true };
    group.add(headMesh);

    const helmetDome = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.16, 0.52), armorMat);
    helmetDome.position.set(0, 1.96, 0.01);
    const helmetCrest = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.08, 0.46), visorMat);
    helmetCrest.position.set(0, 2.04, 0);
    const visorMesh = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.16, 0.1), visorMat);
    visorMesh.position.set(0, 1.78, -0.21);
    const chinGuard = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.12, 0.26), armorMat);
    chinGuard.position.set(0, 1.6, -0.14);
    const earPodL = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.52, 8), chromeMat);
    earPodL.rotation.z = Math.PI / 2;
    earPodL.position.set(0, 1.76, 0.02);
    group.add(helmetDome, helmetCrest, visorMesh, chinGuard, earPodL);

    // 3. Articulated Dual Arms + Weapon Holder Pivot
    const armPivot = new THREE.Group();
    armPivot.position.set(0, 1.34, 0);
    const rightArm = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.22, 0.58), darkMat);
    rightArm.position.set(0.43, -0.05, -0.19);
    const rightGauntlet = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.24, 0.24), armorMat);
    rightGauntlet.position.set(0.43, -0.05, -0.34);

    const leftArm = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.2, 0.54), darkMat);
    leftArm.position.set(-0.34, -0.06, -0.23);
    leftArm.rotation.y = -0.38;

    const gunHolder = new THREE.Group();
    gunHolder.position.set(0.42, -0.02, -0.46);
    const gunMesh = this.createWeaponMesh(playerData.weapon || 'rifle', false);
    gunHolder.add(gunMesh);

    armPivot.add(rightArm, rightGauntlet, leftArm, gunHolder);
    group.add(armPivot);

    // 4. Hip-Pivoted Articulated Legs with 3D Knee Guards & Heavy Combat Boots (Body Hitbox)
    // Translating legGeo downward by -0.35 so rotating leftLeg.rotation.x pivots naturally from the hip!
    const legGeo = new THREE.BoxGeometry(0.26, 0.7, 0.28);
    legGeo.translate(0, -0.35, 0);

    const buildLegArmor = (legMesh) => {
      const kneePad = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.16, 0.1), armorMat);
      kneePad.position.set(0, -0.34, -0.14);
      const kneeGlow = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.05, 0.12), visorMat);
      kneeGlow.position.set(0, -0.34, -0.14);
      const shinGuard = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.26, 0.31), armorMat);
      shinGuard.position.set(0, -0.52, -0.01);
      const combatBoot = new THREE.Mesh(new THREE.BoxGeometry(0.29, 0.14, 0.38), armorMat);
      combatBoot.position.set(0, -0.64, -0.04);
      legMesh.add(kneePad, kneeGlow, shinGuard, combatBoot);
    };

    const leftLeg = new THREE.Mesh(legGeo, darkMat);
    leftLeg.position.set(-0.19, 0.7, 0);
    leftLeg.castShadow = true;
    leftLeg.userData = { playerId: playerData.id, isHeadshot: false };
    buildLegArmor(leftLeg);

    const rightLeg = new THREE.Mesh(legGeo.clone(), darkMat);
    rightLeg.position.set(0.19, 0.7, 0);
    rightLeg.castShadow = true;
    rightLeg.userData = { playerId: playerData.id, isHeadshot: false };
    buildLegArmor(rightLeg);

    group.add(leftLeg, rightLeg);

    // Floating Name & Health Bar Sprite
    const labelInfo = this.createPlayerNameSprite(playerData.name);
    group.add(labelInfo.sprite);

    this.scene.add(group);

    return {
      id: playerData.id,
      name: playerData.name,
      group,
      torsoMesh,
      headMesh,
      leftLeg,
      rightLeg,
      armPivot,
      gunHolder,
      gunMesh,
      currentWeapon: playerData.weapon || 'rifle',
      labelInfo,
      targetPos: new THREE.Vector3(playerData.x, playerData.y, playerData.z),
      targetYaw: playerData.yaw || 0,
      targetPitch: playerData.pitch || 0,
      crouching: Boolean(playerData.crouching),
      hp: playerData.hp ?? 100,
      alive: Boolean(playerData.alive),
      walkPhase: 0,
      lastShotFlashAt: 0
    };
  }

  rebuildHitboxList() {
    this.hitboxMeshes.length = 0;
    for (const rp of this.remotePlayers.values()) {
      if (!rp.alive) continue;
      this.hitboxMeshes.push(rp.headMesh, rp.torsoMesh, rp.leftLeg, rp.rightLeg);
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
    rp.labelInfo.texture.dispose();
    rp.labelInfo.material.dispose();
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
    const seenIds = new Set();
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
        this.remotePlayers.set(p.id, rp);
        hitboxesDirty = true;
      }

      const nowAlive = Boolean(p.alive);
      if (rp.alive !== nowAlive) {
        hitboxesDirty = true;
        if (nowAlive) {
          // Snap immediately to spawn point upon respawn
          rp.group.position.set(p.x, p.y, p.z);
          rp.group.rotation.y = p.yaw || 0;
        }
      } else if (Math.hypot(p.x - rp.group.position.x, p.z - rp.group.position.z) > 15) {
        rp.group.position.set(p.x, p.y, p.z);
      }

      rp.targetPos.set(p.x, p.y, p.z);
      rp.targetYaw = p.yaw || 0;
      rp.targetPitch = p.pitch || 0;
      rp.crouching = Boolean(p.crouching);
      rp.alive = nowAlive;
      rp.group.visible = nowAlive;

      // Update held weapon model if remote player changed weapons
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
        rp.labelInfo.updateLabel(p.hp);
      }
    }

    // Remove disconnected players/bots
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
    this.slideUntil = 0;
    this.currentBloom = 0;
    this.accumulatedRecoilPitch = 0;
    this.accumulatedRecoilYaw = 0;
    this.recoilShotIndex = 0;
    this.punchPitch = 0;
    this.punchRoll = 0;
    this.flinchPitch = 0;
    this.flinchRoll = 0;
    this.meleeSwingUntil = 0;
    for (const wId of WEAPON_ORDER) {
      this.ammoByWeapon[wId] = WEAPONS[wId].magSize;
    }
    if (data.loadout) {
      this.setLoadout(data.loadout, data.weapon || data.loadout.primary);
    } else if (data.weapon && WEAPONS[data.weapon]) {
      this.switchWeapon(data.weapon);
    }
    const wCfg = WEAPONS[this.currentWeapon] || WEAPONS.rifle;
    this.callbacks.onWeaponChanged?.(this.currentWeapon, wCfg.magSize, wCfg.magSize);
  }

  spawnShellCasing() {
    const shell = new THREE.Mesh(this.sharedShellGeo, this.sharedShellMat);
    // Calculate world position of weapon ejection port (right of camera)
    this.tmpVec3A.set(0.24, -0.14, -0.35);
    this.tmpVec3A.applyQuaternion(this.camera.quaternion);
    shell.position.copy(this.camera.position).add(this.tmpVec3A);

    // Eject velocity to the right + slightly up + player velocity
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
    const start = new THREE.Vector3(origin.x, origin.y, origin.z);
    const end = new THREE.Vector3(hitPoint.x, hitPoint.y, hitPoint.z);

    const geo = new THREE.BufferGeometry().setFromPoints([start, end]);
    const mat = new THREE.LineBasicMaterial({
      color: colorHex,
      transparent: true,
      opacity: 0.95
    });
    const line = new THREE.Line(geo, mat);
    this.scene.add(line);

    // Impact glow orb (uses shared geometry)
    const sparkColor = isPlayerHit ? 0xef4444 : colorHex;
    const sparkMat = new THREE.MeshBasicMaterial({
      color: sparkColor,
      transparent: true,
      opacity: 1
    });
    const spark = new THREE.Mesh(this.sharedHitOrbGeo, sparkMat);
    spark.position.copy(end);
    spark.scale.setScalar(isPlayerHit ? 1.45 : 0.95);
    this.scene.add(spark);

    // Spawn 3D ricochet/hit spark particles using sharedSparkGeo
    const particles = [];
    const pCount = isPlayerHit ? 5 : 3;
    for (let i = 0; i < pCount; i++) {
      const pMesh = new THREE.Mesh(this.sharedSparkGeo, sparkMat);
      pMesh.position.copy(end);
      const nx = hitNormal ? hitNormal.x : 0;
      const ny = hitNormal ? hitNormal.y : 1;
      const nz = hitNormal ? hitNormal.z : 0;
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
      // Subtle visual recoil on remote player's gun arm
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
    const text = isHeadshot ? `🎯 -${ damage }` : `-${ damage }`;
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
    const scale = Math.min(1.5, damage / 35);
    this.flinchPitch = Math.min(0.06, this.flinchPitch + 0.024 * scale);
    this.flinchRoll = (Math.random() < 0.5 ? -1 : 1) * 0.032 * scale;
  }

  computeEffectiveSpread(cfg) {
    const firstShotMult = this.recoilShotIndex === 0 && this.currentBloom < 0.0015
      ? (cfg.firstShotSpreadMult || 0.35)
      : 1.0;
    const base = (this.isAiming ? cfg.adsSpread : cfg.spread) * firstShotMult;
    const horizSpeed = Math.hypot(this.velocity.x, this.velocity.z);
    const speedRatio = Math.min(1.35, horizSpeed / MATCH_CONFIG.WALK_SPEED);
    const movePenalty = speedRatio * (cfg.moveSpread || 0.012) * (this.isAiming ? 0.45 : 1.0);
    const airPenalty = !this.onGround ? (cfg.airSpread || 0.03) : 0;
    const stanceMult = (this.crouching || this.isSliding) ? (cfg.crouchSpreadMult || 0.65) : 1.0;

    return (base + this.currentBloom + movePenalty + airPenalty) * stanceMult;
  }

  attemptShoot() {
    if (!this.inMatch || !this.alive || !this.isPointerLocked) return;

    const now = performance.now();
    const cfg = WEAPONS[this.currentWeapon];

    if (this.equipUntil > now) return;
    if (now - this.lastShotAt < cfg.fireRateMs) return;

    const isMelee = Boolean(cfg.isMelee || cfg.infiniteAmmo);
    const currentAmmo = this.ammoByWeapon[this.currentWeapon];

    // If reloading: allow interrupting shell-by-shell shotgun reload if at least 1 shell is loaded!
    if (this.reloadingUntil > now) {
      if (cfg.shellByShell && currentAmmo > 0) {
        this.reloadingUntil = 0;
        this.nextShellAt = 0;
        this.callbacks.onReloadCancel?.(this.currentWeapon, currentAmmo, cfg.magSize);
      } else {
        return;
      }
    }

    if (!isMelee && currentAmmo <= 0) {
      this.callbacks.onDryFire?.();
      this.startReload();
      return;
    }

    // Cancel sprint if firing a firearm
    if (!isMelee) {
      this.isSprinting = false;
    }
    this.lastShotAt = now;
    if (isMelee) {
      this.meleeSwingUntil = now + 320;
    } else {
      this.ammoByWeapon[this.currentWeapon] = currentAmmo - 1;
      this.callbacks.onWeaponChanged?.(
        this.currentWeapon,
        this.ammoByWeapon[this.currentWeapon],
        cfg.magSize
      );
    }

    // 1. Compute effective spread & Raycast BEFORE applying this shot's recoil kick
    // so the bullet lands accurately where the crosshair is aimed at trigger pull!
    const spreadAmount = isMelee ? 0 : this.computeEffectiveSpread(cfg);

    this.rebuildHitboxList();
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
        // Shotgun structured pellet ring pattern (center pellet + 7 radial ring pellets)
        if (p === 0) {
          dir.x += (Math.random() - 0.5) * spreadAmount * 0.32;
          dir.y += (Math.random() - 0.5) * spreadAmount * 0.32;
          dir.z += (Math.random() - 0.5) * spreadAmount * 0.32;
        } else {
          const angle = ((p - 1) / (cfg.pellets - 1)) * Math.PI * 2 + (Math.random() - 0.5) * 0.28;
          const radius = spreadAmount * (0.62 + Math.random() * 0.42);
          dir.x += Math.cos(angle) * radius;
          dir.y += Math.sin(angle) * radius;
          dir.z += (Math.random() - 0.5) * spreadAmount * 0.45;
        }
      } else if (!isMelee) {
        // Rifle / Sniper / Pistol cone spread
        dir.x += (Math.random() - 0.5) * spreadAmount * 2;
        dir.y += (Math.random() - 0.5) * spreadAmount * 2;
        dir.z += (Math.random() - 0.5) * spreadAmount * 2;
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
        // Render tracer from gun barrel world position
        const barrelStart = {
          x: eyeOrigin.x + dir.x * 0.55,
          y: eyeOrigin.y - 0.13 + dir.y * 0.55,
          z: eyeOrigin.z + dir.z * 0.55
        };
        this.spawnTracerEffect(barrelStart, endPoint, cfg.color, isPlayerHit, hitNormal);
      }
    }

    // Forward direction vector before recoil
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
      this.punchRoll = (Math.random() < 0.5 ? -1 : 1) * 0.025;
      return;
    }

    // 2. Increase dynamic bloom & Apply Progressive 2D Recoil Pattern + Camera Punch
    this.currentBloom = Math.min(
      cfg.bloomMax || 0.038,
      this.currentBloom + (cfg.bloomPerShot || 0.0045) * (this.isAiming ? 0.52 : 1.0)
    );

    const adsScale = this.isAiming ? 0.52 : 1.0;
    const crouchScale = (this.crouching || this.isSliding) ? 0.75 : 1.0;
    const shotIdx = this.recoilShotIndex;
    this.recoilShotIndex = Math.min(30, this.recoilShotIndex + 1);

    // Progressive vertical climb on early/mid spray shots, capped at recoilMaxPitch
    const climbFactor = 1 + Math.min(shotIdx, 10) * (cfg.recoilClimbMult || 0.12);
    const maxAccumPitch = cfg.recoilMaxPitch || 0.16;
    const rawPitchKick = cfg.recoilPitch * climbFactor * adsScale * crouchScale;
    const pitchKick = this.accumulatedRecoilPitch >= maxAccumPitch
      ? rawPitchKick * 0.22
      : rawPitchKick;

    // Deterministic horizontal spray curve + slight micro-jitter
    const pattern = cfg.recoilPattern || [0];
    const patternBias = pattern[shotIdx % pattern.length] || 0;
    const yawBase = cfg.recoilYaw || 0.0068;
    const yawKick = (patternBias * yawBase * 1.35 + (Math.random() - 0.5) * yawBase * 0.65) * adsScale * crouchScale;

    this.pitch = Math.min(Math.PI / 2 - 0.05, this.pitch + pitchKick);
    this.yaw += yawKick;
    this.accumulatedRecoilPitch = Math.min(maxAccumPitch * 1.15, this.accumulatedRecoilPitch + pitchKick * 0.85);
    this.accumulatedRecoilYaw += yawKick * 0.82;

    // Sharp camera punch spring that recovers quickly for snappy gunfeel
    this.punchPitch = Math.min(0.065, this.punchPitch + rawPitchKick * 0.46);
    this.punchRoll = (patternBias * 0.012) + (Math.random() - 0.5) * 0.014;

    // Viewmodel kickback & reciprocating bolt/pump animation
    this.recoilOffset = Math.min(0.22, this.recoilOffset + (cfg.visualKick || 0.09));
    this.boltKickOffset = 1.0;
    if (this.currentWeapon === 'shotgun' || this.currentWeapon === 'sniper') {
      this.pumpCycleDuration = cfg.pumpActionMs || cfg.boltActionMs || 500;
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

    // Eject 3D spinning brass shell casing
    this.spawnShellCasing();

    if (this.ammoByWeapon[this.currentWeapon] === 0) {
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
    this.slideUntil = now + (MATCH_CONFIG.SLIDE_DURATION_MS || 620);
    this.slideCooldownUntil = now + (MATCH_CONFIG.SLIDE_COOLDOWN_MS || 900);

    // Lock slide direction along current horizontal velocity vector
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
      if (cfg.shellByShell && this.reloadMode === 'shell') {
        if (this.nextShellAt > 0 && now >= this.nextShellAt) {
          const nextAmmo = Math.min(cfg.magSize, this.ammoByWeapon[this.currentWeapon] + 1);
          this.ammoByWeapon[this.currentWeapon] = nextAmmo;
          const isFull = nextAmmo >= cfg.magSize;

          // Subtle physical bump on each shell inserted into the tube
          this.punchPitch = Math.min(0.03, this.punchPitch + 0.01);
          this.recoilOffset = Math.max(this.recoilOffset, 0.042);
          this.callbacks.onShellInserted?.(this.currentWeapon, nextAmmo, cfg.magSize, isFull);

          if (isFull) {
            this.reloadingUntil = 0;
            this.nextShellAt = 0;
            this.pumpCycleDuration = 340;
            this.pumpCycleUntil = now + 340;
            this.callbacks.onReloadComplete?.(this.currentWeapon, cfg.magSize);
          } else {
            this.nextShellAt += cfg.shellReloadMs || 390;
          }
        }
        if (this.reloadingUntil && now >= this.reloadingUntil) {
          this.reloadingUntil = 0;
          this.nextShellAt = 0;
          this.ammoByWeapon[this.currentWeapon] = cfg.magSize;
          this.callbacks.onReloadComplete?.(this.currentWeapon, cfg.magSize);
        }
      } else if (now >= this.reloadingUntil) {
        this.reloadingUntil = 0;
        this.ammoByWeapon[this.currentWeapon] = cfg.magSize;
        const activeVm = this.viewmodelMeshes[this.currentWeapon];
        if (activeVm?.userData?.magMesh && activeVm.userData.magMesh.userData.basePos) {
          activeVm.userData.magMesh.position.copy(activeVm.userData.magMesh.userData.basePos);
        }
        if (activeVm?.userData?.boltMesh && typeof activeVm.userData.boltMesh.userData.baseZ === 'number') {
          activeVm.userData.boltMesh.position.z = activeVm.userData.boltMesh.userData.baseZ;
        }
        // Subtle bolt-forward camera snap when reload completes
        this.punchPitch = Math.max(-0.02, this.punchPitch - 0.009);
        this.callbacks.onReloadComplete?.(this.currentWeapon, cfg.magSize);
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

    // Check slide expiration
    if (this.isSliding && (now >= this.slideUntil || !this.onGround)) {
      this.isSliding = false;
    }

    const wantsCrouch = this.keys.KeyC || this.keys.ControlLeft;
    const wantsSprint = (this.keys.ShiftLeft || this.keys.ShiftRight) &&
      moveForward > 0 &&
      !this.isAiming &&
      !wantsCrouch &&
      !this.isSliding &&
      this.reloadingUntil <= now &&
      now - this.lastShotAt > 160;

    // Trigger Tactical Power Slide if pressing Crouch while sprinting fast
    if (wantsCrouch && !this.crouching && !this.isSliding && this.onGround) {
      this.tryTriggerSlide(now);
    }
    const slideDur = MATCH_CONFIG.SLIDE_DURATION_MS || 620;
    if (!wantsCrouch && this.isSliding && now - (this.slideUntil - slideDur) > 220) {
      this.isSliding = false;
    }

    this.crouching = wantsCrouch || this.isSliding;
    this.isSprinting = wantsSprint && !this.crouching;

    // Smooth eye height interpolation + landing spring compression
    const targetEye = this.isSliding ? 0.78 : this.crouching ? 1.04 : 1.62;
    this.currentEyeHeight += (targetEye - this.currentEyeHeight) * Math.min(1, dt * 14);

    // Update landing dip spring
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
      : this.crouching
        ? MATCH_CONFIG.CROUCH_SPEED
        : this.isAiming
          ? MATCH_CONFIG.ADS_SPEED
          : this.isSprinting
            ? MATCH_CONFIG.SPRINT_SPEED
            : MATCH_CONFIG.WALK_SPEED;
    const targetSpeed = baseTargetSpeed * (this.isSliding ? 1.0 : weaponMoveMult);

    if (this.isSliding) {
      // Decay slide speed smoothly with slide friction
      const slideFriction = MATCH_CONFIG.SLIDE_FRICTION || 2.6;
      this.velocity.x *= Math.max(0, 1 - slideFriction * dt);
      this.velocity.z *= Math.max(0, 1 - slideFriction * dt);
      // Allow subtle steering during slide
      this.velocity.x += wishDirX * 4.8 * dt;
      this.velocity.z += wishDirZ * 4.8 * dt;
    } else if (this.onGround) {
      if (wishLen > 0.001) {
        const wishVx = wishDirX * targetSpeed;
        const wishVz = wishDirZ * targetSpeed;
        const dvX = wishVx - this.velocity.x;
        const dvZ = wishVz - this.velocity.z;
        const dvLen = Math.hypot(dvX, dvZ);
        if (dvLen > 0.0001) {
          const maxStep = (MATCH_CONFIG.GROUND_ACCEL || 52.0) * dt;
          const scale = Math.min(1, maxStep / dvLen);
          this.velocity.x += dvX * scale;
          this.velocity.z += dvZ * scale;
        }
      } else {
        const friction = MATCH_CONFIG.GROUND_FRICTION || 11.0;
        const drop = Math.max(0, 1 - friction * dt);
        this.velocity.x *= drop;
        this.velocity.z *= drop;
        if (Math.hypot(this.velocity.x, this.velocity.z) < 0.06) {
          this.velocity.x = 0;
          this.velocity.z = 0;
        }
      }
    } else {
      // Air control & momentum preservation
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
      const bobRate = this.isSprinting ? 12.2 : this.crouching ? 6.4 : 9.2;
      this.weaponBobTime += dt * bobRate;

      // Procedural footstep audio timing synced to slower tactical movement speed
      if (now >= this.nextFootstepAt && !this.crouching) {
        this.nextFootstepAt = now + (this.isSprinting ? 335 : 460);
        this.callbacks.onFootstep?.(this.isSprinting);
      }
    } else {
      this.weaponBobTime = 0;
    }

    // Jump with Coyote Time (120ms) & Jump Buffering (120ms)
    if (this.keys.Space && this.isPointerLocked) {
      this.jumpQueuedUntil = now + (MATCH_CONFIG.JUMP_BUFFER_MS || 120);
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

    // Gravity
    this.velocity.y -= (MATCH_CONFIG.GRAVITY || 22.0) * dt;

    const preFallVy = this.velocity.y;
    this.wasOnGround = this.onGround;

    // Integrate horizontal & vertical with AABB collision + stair step-up against active map obstacles
    this.position.x += this.velocity.x * dt;
    this.position.z += this.velocity.z * dt;
    this.position.y += this.velocity.y * dt;

    const radius = MATCH_CONFIG.PLAYER_RADIUS;
    const playerHeight = this.isSliding
      ? (MATCH_CONFIG.PLAYER_SLIDE_HEIGHT || 0.9)
      : this.crouching
        ? MATCH_CONFIG.PLAYER_CROUCH_HEIGHT
        : MATCH_CONFIG.PLAYER_HEIGHT;
    let highestFloor = 0;
    const obstacles = this.currentObstacles;

    for (let i = 0; i < obstacles.length; i++) {
      const box = obstacles[i];
      const halfW = box.w / 2;
      const halfH = box.h / 2;
      const halfD = box.d / 2;

      const minX = box.x - halfW;
      const maxX = box.x + halfW;
      const minZ = box.z - halfD;
      const maxZ = box.z + halfD;
      const topY = box.y + halfH;
      const bottomY = box.y - halfH;

      const closestX = Math.max(minX, Math.min(this.position.x, maxX));
      const closestZ = Math.max(minZ, Math.min(this.position.z, maxZ));
      const dx = this.position.x - closestX;
      const dz = this.position.z - closestZ;
      const distSq = dx * dx + dz * dz;

      if (distSq < radius * radius) {
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

    // Settle on floor & detect landing impact
    if (this.position.y <= highestFloor + 0.025 && this.velocity.y <= 0) {
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

    // Clamp active map arena bounds
    const limit = (this.arenaHalfSize || MATCH_CONFIG.ARENA_HALF_SIZE) - 0.6;
    this.position.x = Math.max(-limit, Math.min(limit, this.position.x));
    this.position.z = Math.max(-limit, Math.min(limit, this.position.z));

    // Smooth Recoil Auto-Recovery & Spray Index Reset
    const recDelay = cfg.recoilRecoveryDelayMs || (cfg.fireRateMs + 45);
    if (now - this.lastShotAt > recDelay) {
      const recSpeed = (cfg.recoilRecovery || 8.0) * dt;
      const pitchStep = Math.min(this.accumulatedRecoilPitch, this.accumulatedRecoilPitch * recSpeed);
      this.pitch = Math.max(-Math.PI / 2 + 0.05, this.pitch - pitchStep);
      this.accumulatedRecoilPitch = Math.max(0, this.accumulatedRecoilPitch - pitchStep);

      const yawStep = this.accumulatedRecoilYaw * Math.min(1, recSpeed);
      this.yaw -= yawStep;
      this.accumulatedRecoilYaw -= yawStep;

      if (this.accumulatedRecoilPitch < 0.002) {
        this.recoilShotIndex = 0;
      } else if (now - this.lastShotAt > recDelay * 1.8) {
        this.recoilShotIndex = Math.max(0, this.recoilShotIndex - dt * 18);
      }
    }

    this.currentBloom = Math.max(0, this.currentBloom - (cfg.bloomDecay || 0.1) * dt);
    this.effectiveSpread = this.computeEffectiveSpread(cfg);
    this.callbacks.onSpreadUpdate?.(this.effectiveSpread, this.isAiming, this.isSprinting);

    // Decay camera punch & damage flinch springs
    const springDecay = Math.max(0, 1 - dt * 18);
    this.punchPitch *= springDecay;
    this.punchRoll *= springDecay;
    this.flinchPitch *= Math.max(0, 1 - dt * 12);
    this.flinchRoll *= Math.max(0, 1 - dt * 12);

    // Camera Strafe Roll & Slide Tilt
    const targetRoll = this.isSliding
      ? 0.055
      : -moveRight * (this.isSprinting ? 0.026 : 0.016);
    this.cameraRoll += (targetRoll - this.cameraRoll) * Math.min(1, dt * 12);

    // Update camera transform
    this.camera.position.set(
      this.position.x,
      this.position.y + this.currentEyeHeight + this.landingDip,
      this.position.z
    );
    this.tmpEuler.set(
      Math.max(-Math.PI / 2 + 0.04, Math.min(Math.PI / 2 - 0.04, this.pitch + this.punchPitch + this.flinchPitch)),
      this.yaw,
      this.cameraRoll + this.punchRoll + this.flinchRoll,
      'YXZ'
    );
    this.camera.quaternion.setFromEuler(this.tmpEuler);

    // Smooth Dynamic FOV (tighter base 68° FOV so world structures & enemies appear larger)
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
    this.recoilOffset = Math.max(0, this.recoilOffset - dt * 0.72);
    this.boltKickOffset = Math.max(0, this.boltKickOffset - dt * 7.8);
    this.swayX *= 0.85;
    this.swayY *= 0.85;

    const isReloading = this.reloadingUntil > now;
    const isEquipping = this.equipUntil > now;
    const isSniperScoped = this.isAiming && this.currentWeapon === 'sniper';
    this.viewmodelRig.visible = !isSniperScoped;

    const equipProgress = isEquipping ? 1 - (this.equipUntil - now) / this.equipDuration : 1;
    const equipDropY = isEquipping ? (1 - equipProgress) * -0.26 : 0;

    const targetVmX = this.isAiming ? 0.0 : this.isSprinting ? 0.17 : 0.24;
    const targetVmY = (isReloading ? -0.27 : this.isAiming ? -0.165 : -0.21) + equipDropY + this.landingDip * 0.45;
    const targetVmZ = this.isAiming ? -0.33 : -0.40;

    const bobAmp = this.isAiming ? 0.22 : this.isSprinting ? 1.35 : 0.95;
    const bobX = Math.cos(this.weaponBobTime * 0.5) * 0.012 * bobAmp;
    const bobY = Math.abs(Math.sin(this.weaponBobTime)) * 0.014 * bobAmp;

    this.viewmodelRig.position.x += (targetVmX + bobX + this.swayX - this.viewmodelRig.position.x) * 0.28;
    this.viewmodelRig.position.y += (targetVmY - bobY + this.swayY - this.viewmodelRig.position.y) * 0.28;
    this.viewmodelRig.position.z = targetVmZ + this.recoilOffset;

    let targetRotX = this.recoilOffset * 1.45;
    let targetRotY = 0;
    let targetRotZ = -this.cameraRoll * 1.2;

    const activeVm = this.viewmodelMeshes[this.currentWeapon];
    const magMesh = activeVm?.userData?.magMesh;
    const boltMesh = activeVm?.userData?.boltMesh;

    if (isReloading) {
      const reloadPct = Math.max(0, Math.min(1, 1 - (this.reloadingUntil - now) / this.reloadDuration));

      if (this.reloadMode === 'shell') {
        // Shotgun shell-by-shell tilt & rhythmic shell insertion pulse
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
        // Tactical reload: 2-stage mag swap (out -> lock in)
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
        // Dry / Empty 3-stage reload: Mag out (0-45%), Mag lock-in (45-74%), Bolt Rack (74-96%)
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
          // Stage 3: Pull charging handle / slide back and release
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

    // Shotgun pump-action / Sniper bolt-action cycling between shots
    if (!isReloading && boltMesh && typeof boltMesh.userData.baseZ === 'number') {
      if (this.pumpCycleUntil > now) {
        const cyclePct = 1 - (this.pumpCycleUntil - now) / this.pumpCycleDuration;
        // Delay 22% after shot, then pump back & forward smoothly
        const pumpPhase = cyclePct > 0.22 ? Math.sin(((cyclePct - 0.22) / 0.78) * Math.PI) : 0;
        boltMesh.position.z = boltMesh.userData.baseZ + pumpPhase * 0.115;
        targetRotX -= pumpPhase * 0.09;
        targetRotZ += pumpPhase * (this.currentWeapon === 'sniper' ? -0.18 : 0.12);
      } else {
        boltMesh.position.z = boltMesh.userData.baseZ + this.boltKickOffset * 0.085;
      }
    }

    // Melee Karambit slash arc animation
    if (this.meleeSwingUntil > now) {
      const swingPct = 1 - (this.meleeSwingUntil - now) / 320;
      const slashArc = Math.sin(swingPct * Math.PI);
      targetRotX -= slashArc * 0.55;
      targetRotY += slashArc * 0.85;
      targetRotZ += slashArc * 0.65;
      this.viewmodelRig.position.z -= slashArc * 0.16;
    }

    this.viewmodelRig.rotation.x += (targetRotX - this.viewmodelRig.rotation.x) * 0.25;
    this.viewmodelRig.rotation.y += (targetRotY - this.viewmodelRig.rotation.y) * 0.25;
    this.viewmodelRig.rotation.z += (targetRotZ - this.viewmodelRig.rotation.z) * 0.25;

    // Hide muzzle flash & dynamic light after 50ms
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
          : this.isSprinting
            ? 'SPRINT'
            : this.crouching
              ? 'CROUCH'
              : 'WALK';
      this.callbacks.onMovementHudUpdate?.(stance, horizSpeed);
    }

    // Send position update to server at ~25Hz
    if (now - this.lastMoveSentAt >= 38) {
      this.lastMoveSentAt = now;
      this.callbacks.onMoveUpdate?.({
        x: this.position.x,
        y: this.position.y,
        z: this.position.z,
        yaw: this.yaw,
        pitch: this.pitch,
        crouching: this.crouching,
        weapon: this.currentWeapon
      });
    }
  }

  animate(now) {
    requestAnimationFrame(this.animate);

    const dt = Math.min(0.1, (now - this.lastFrameTime) / 1000);
    this.lastFrameTime = now;

    // FPS Counter & Adaptive Resolution Scaling for low-end laptops
    this.frameCount++;
    if (now - this.lastFpsUpdate >= 500) {
      this.currentFps = Math.round((this.frameCount * 1000) / (now - this.lastFpsUpdate));
      this.frameCount = 0;
      this.lastFpsUpdate = now;
      this.callbacks.onFpsUpdate?.(this.currentFps);

      if (this.inMatch && this.currentFps < 46 && this.currentPixelRatio > 0.9) {
        this.currentPixelRatio = Math.max(0.85, Number((this.currentPixelRatio - 0.2).toFixed(2)));
        this.renderer.setPixelRatio(this.currentPixelRatio);
      } else if (this.inMatch && this.currentFps >= 58 && this.currentPixelRatio < this.maxPixelRatio) {
        this.currentPixelRatio = Math.min(this.maxPixelRatio, Number((this.currentPixelRatio + 0.1).toFixed(2)));
        this.renderer.setPixelRatio(this.currentPixelRatio);
      }
    }

    if (!this.inMatch) {
      // Closer, dramatic low-angle orbit camera over the 3D Arena while in Lobby
      const angle = now * 0.00022;
      const orbitR = (this.arenaHalfSize || 60) * 0.56;
      this.camera.position.set(Math.cos(angle) * orbitR, 16.5, Math.sin(angle) * orbitR);
      this.camera.lookAt(0, 3.2, 0);
      this.viewmodelRig.visible = false;
    } else {
      this.updateLocalPhysics(dt);
    }

    // Animate Central Citadel rotating energy rings, radar arrays & atmospheric particles
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

    // Interpolate Remote Players & Bots smoothly with shortest-angle yaw interpolation
    const lerpFactor = Math.min(1, dt * 18);
    for (const rp of this.remotePlayers.values()) {
      if (!rp.alive) continue;

      const dx = rp.targetPos.x - rp.group.position.x;
      const dz = rp.targetPos.z - rp.group.position.z;
      const moveSpeed = Math.hypot(dx, dz);

      rp.group.position.lerp(rp.targetPos, lerpFactor);

      let yawDiff = rp.targetYaw - rp.group.rotation.y;
      while (yawDiff > Math.PI) yawDiff -= Math.PI * 2;
      while (yawDiff < -Math.PI) yawDiff += Math.PI * 2;
      rp.group.rotation.y += yawDiff * lerpFactor;

      rp.armPivot.rotation.x += (rp.targetPitch - rp.armPivot.rotation.x) * 0.35;
      rp.group.scale.y = rp.crouching ? 0.74 : 1.0;

      // Hide third-person muzzle flash after 55ms
      if (rp.gunMesh?.userData?.flashMesh && now - rp.lastShotFlashAt > 55) {
        rp.gunMesh.userData.flashMesh.visible = false;
      }

      // Animate legs when walking
      if (moveSpeed > 0.03) {
        rp.walkPhase += dt * 12;
        rp.leftLeg.rotation.x = Math.sin(rp.walkPhase) * 0.58;
        rp.rightLeg.rotation.x = -Math.sin(rp.walkPhase) * 0.58;
      } else {
        rp.leftLeg.rotation.x *= 0.8;
        rp.rightLeg.rotation.x *= 0.8;
      }
    }

    // Rotate & bob 3D Health Packs
    for (const item of this.pickupMeshes.values()) {
      if (item.crossGroup.visible) {
        item.crossGroup.rotation.y = now * 0.0024;
        item.crossGroup.position.y = 1.12 + Math.sin(now * 0.004) * 0.15;
      }
    }

    // Update ejected 3D brass shell casings
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

    // Update & clean up bullet tracers, ricochet sparks, & 3D damage popups
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
          if (fx.particles) {
            for (let p = 0; p < fx.particles.length; p++) {
              this.scene.remove(fx.particles[p].mesh);
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
    });

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

      // Smart recoil compensation: if player pulls mouse down while gun is kicked up,
      // absorb that downward pull from accumulatedRecoilPitch so recovery doesn't dip below original aim
      if (dy < 0 && this.accumulatedRecoilPitch > 0) {
        this.accumulatedRecoilPitch = Math.max(0, this.accumulatedRecoilPitch + dy);
      }

      this.swayX = Math.max(-0.045, Math.min(0.045, -e.movementX * 0.00055));
      this.swayY = Math.max(-0.045, Math.min(0.045, e.movementY * 0.00055));
    });

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
    });

    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) {
        this.isMouseDown = false;
      } else if (e.button === 2) {
        this.isAiming = false;
        this.callbacks.onAimChange?.(false, this.currentWeapon);
      }
    });

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
    });

    window.addEventListener('keydown', (e) => {
      if (e.code in this.keys) {
        this.keys[e.code] = true;
      }

      if (!this.inMatch) return;

      if (e.code === 'Digit1') this.switchSlot(1);
      else if (e.code === 'Digit2') this.switchSlot(2);
      else if (e.code === 'Digit3') this.switchSlot(3);
      else if (e.code === 'KeyB') {
        e.preventDefault();
        this.callbacks.onLoadoutToggle?.();
      }
      else if (e.code === 'KeyR') this.startReload();
      else if (e.code === 'KeyL') this.callbacks.onCopyLinkShortcut?.();
      else if (e.code === 'Tab') {
        e.preventDefault();
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
