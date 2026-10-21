import * as THREE from '../three.js';

/**
 * Generates a procedural equirectangular IBL environment map so all PBR metallic & rough surfaces
 * (weapons, scopes, helmets, steel containers, chrome trim) reflect realistic sky, sun corona, and ground bounce.
 */
export function createProceduralEnvironmentMap(game, theme = {}) {
  if (typeof document === 'undefined') return null;
  // Quality tier: the 512x256 design is drawn at envMapSize x envMapSize/2 (cheaper to upload / filter on medium)
  const envSize = Math.max(64, Math.min(512, game?.quality?.envMapSize || 512));
  const canvas = document.createElement('canvas');
  canvas.width = envSize;
  canvas.height = envSize / 2;
  const ctx = canvas.getContext('2d');
  ctx.scale?.(envSize / 512, envSize / 512);

  const isDesert = theme.floorBase === '#27170c';
  const isLab = theme.floorBase === '#0b0f1e';

  // Vertical sky-to-ground equirectangular gradient
  const grad = ctx.createLinearGradient(0, 0, 0, 256);
  if (isDesert) {
    grad.addColorStop(0.0, '#1e293b');
    grad.addColorStop(0.28, '#475569');
    grad.addColorStop(0.46, '#d97706');
    grad.addColorStop(0.50, '#fde68a');
    grad.addColorStop(0.54, '#78350f');
    grad.addColorStop(0.75, '#451a03');
    grad.addColorStop(1.0, '#27170c');
  } else if (isLab) {
    grad.addColorStop(0.0, '#0f172a');
    grad.addColorStop(0.30, '#1e293b');
    grad.addColorStop(0.48, '#38bdf8');
    grad.addColorStop(0.50, '#e0f2fe');
    grad.addColorStop(0.54, '#1e293b');
    grad.addColorStop(0.75, '#111827');
    grad.addColorStop(1.0, '#090d16');
  } else {
    grad.addColorStop(0.0, '#17253b');
    grad.addColorStop(0.28, '#334e68');
    grad.addColorStop(0.46, '#64829e');
    grad.addColorStop(0.50, '#fef3c7');
    grad.addColorStop(0.54, '#334155');
    grad.addColorStop(0.75, '#1e293b');
    grad.addColorStop(1.0, '#111827');
  }
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 512, 256);

  // Bright solar specular lobe for crisp metallic highlights on gunmetal & chrome
  const sunGlow = ctx.createRadialGradient(140, 96, 4, 140, 96, 95);
  sunGlow.addColorStop(0.0, 'rgba(255, 253, 240, 1.0)');
  sunGlow.addColorStop(0.22, 'rgba(254, 240, 138, 0.72)');
  sunGlow.addColorStop(0.55, 'rgba(245, 158, 11, 0.24)');
  sunGlow.addColorStop(1.0, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = sunGlow;
  ctx.fillRect(0, 0, 512, 200);

  // Secondary cool sky bounce lobe opposite the sun
  const coolBounce = ctx.createRadialGradient(396, 84, 10, 396, 84, 110);
  coolBounce.addColorStop(0.0, 'rgba(186, 230, 253, 0.45)');
  coolBounce.addColorStop(0.6, 'rgba(56, 189, 248, 0.14)');
  coolBounce.addColorStop(1.0, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = coolBounce;
  ctx.fillRect(256, 0, 256, 180);

  // Subtle architectural horizon variation for realistic fresnel reflections
  ctx.fillStyle = 'rgba(15, 23, 42, 0.35)';
  for (let x = 0; x < 512; x += 24) {
    const h = 8 + ((x * 17) % 18);
    ctx.fillRect(x, 128 - h, 18, h);
  }

  const envTex = new THREE.CanvasTexture(canvas);
  envTex.mapping = THREE.EquirectangularReflectionMapping;
  game.arenaTextures.add(envTex);
  return envTex;
}

/**
 * Creates a procedural industrial/military building facade texture for perimeter skyline structures.
 */
function createSkylineFacadeTexture(game, isDesert = false) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = isDesert ? '#2b2118' : '#18202c';
  ctx.fillRect(0, 0, 256, 256);

  // Concrete cladding horizontal & vertical panel seams
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.48)';
  ctx.lineWidth = 2;
  for (let y = 0; y <= 256; y += 32) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(256, y);
    ctx.stroke();
  }
  for (let x = 0; x <= 256; x += 32) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, 256);
    ctx.stroke();
  }

  // Industrial window bays & mechanical ventilation louvers
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const wx = col * 32 + 5;
      const wy = row * 32 + 7;
      const seed = (row * 31 + col * 17) % 19;
      if (row % 3 === 0) {
        // Louvered mechanical vent row
        ctx.fillStyle = 'rgba(10, 14, 20, 0.85)';
        ctx.fillRect(wx, wy + 2, 22, 14);
        ctx.fillStyle = 'rgba(148, 163, 184, 0.22)';
        ctx.fillRect(wx + 2, wy + 5, 18, 2);
        ctx.fillRect(wx + 2, wy + 10, 18, 2);
      } else if (seed === 0 || seed === 5) {
        // Warm tungsten illuminated control room window
        ctx.fillStyle = 'rgba(229, 160, 36, 0.52)';
        ctx.fillRect(wx, wy, 22, 16);
        ctx.fillStyle = 'rgba(254, 243, 199, 0.35)';
        ctx.fillRect(wx + 3, wy + 3, 16, 10);
      } else if (seed === 2 || seed === 11) {
        // Cool daylight/monitor lit bay
        ctx.fillStyle = 'rgba(125, 211, 252, 0.28)';
        ctx.fillRect(wx, wy, 22, 16);
      } else {
        // Dark recessed armored glass bay
        ctx.fillStyle = 'rgba(9, 13, 20, 0.78)';
        ctx.fillRect(wx, wy, 22, 16);
        ctx.fillStyle = 'rgba(148, 163, 184, 0.10)';
        ctx.fillRect(wx + 2, wy + 2, 8, 12);
      }
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1, 2);
  game.arenaTextures.add(tex);
  return tex;
}

export function buildSkyAndAtmosphere(game, theme = {}, halfSize = 60) {
  const isDesert = theme.floorBase === '#27170c';
  const isLab = theme.floorBase === '#0b0f1e';

  // 0. Bind Procedural IBL Environment Map for Realistic PBR Metallic & Roughness Reflections
  // (Quality tiers: envMapSize 0 = Low has no environment map at all)
  const envMap = game?.quality?.envMapSize === 0 ? null : createProceduralEnvironmentMap(game, theme);
  if (envMap) {
    game.scene.environment = envMap;
    if ('environmentIntensity' in game.scene) {
      game.scene.environmentIntensity = 0.76;
    }
  } else {
    game.scene.environment = null;
  }

  // 1. High-Resolution Atmospheric Sky Dome with Volumetric-Style Cloud Layers, Sun Corona & 3-Layer Mountain Ridges
  const skyCanvas = document.createElement('canvas');
  skyCanvas.width = 1024;
  skyCanvas.height = 512;
  const ctx = skyCanvas.getContext('2d');

  const grad = ctx.createLinearGradient(0, 0, 0, 512);
  if (isDesert) {
    grad.addColorStop(0.0, '#0c1322');
    grad.addColorStop(0.18, '#1e293b');
    grad.addColorStop(0.34, '#6b3410');
    grad.addColorStop(0.44, '#b45309');
    grad.addColorStop(0.50, '#d97706');
    grad.addColorStop(0.56, '#451a03');
    grad.addColorStop(1.0, '#291509');
  } else if (isLab) {
    grad.addColorStop(0.0, '#050811');
    grad.addColorStop(0.20, '#0f172a');
    grad.addColorStop(0.38, '#1e293b');
    grad.addColorStop(0.49, '#334155');
    grad.addColorStop(0.55, '#111827');
    grad.addColorStop(1.0, '#0b0f1e');
  } else {
    grad.addColorStop(0.0, '#070d19');
    grad.addColorStop(0.18, '#142238');
    grad.addColorStop(0.34, '#284160');
    grad.addColorStop(0.45, '#526b84');
    grad.addColorStop(0.50, '#7c6f64');
    grad.addColorStop(0.56, '#1e293b');
    grad.addColorStop(1.0, '#111827');
  }
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 1024, 512);

  // Subtle high-altitude zenith stars (upper sky dome y = 4..115)
  for (let i = 0; i < 140; i++) {
    const sx = (i * 97 + 13) % 1024;
    const sy = 4 + ((i * 53 + 7) % 110);
    const r = i % 7 === 0 ? 1.25 : 0.75;
    ctx.fillStyle = `rgba(241, 245, 249, ${0.22 + (i % 5) * 0.07})`;
    ctx.beginPath();
    ctx.arc(sx, sy, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // Warm Atmospheric Sun Disc & Multi-Stage Mie Scattering Corona (~33 deg above horizon equator y=256)
  const sunX = 280;
  const sunY = 162;
  const sunOuter = ctx.createRadialGradient(sunX, sunY, 8, sunX, sunY, 145);
  sunOuter.addColorStop(0.0, 'rgba(255, 252, 235, 0.98)');
  sunOuter.addColorStop(0.14, 'rgba(254, 240, 138, 0.62)');
  sunOuter.addColorStop(0.38, 'rgba(245, 158, 11, 0.24)');
  sunOuter.addColorStop(0.72, 'rgba(217, 119, 6, 0.07)');
  sunOuter.addColorStop(1.0, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = sunOuter;
  ctx.beginPath();
  ctx.arc(sunX, sunY, 145, 0, Math.PI * 2);
  ctx.fill();

  // Layered Cumulus / Stratus Cloud Banks with Lit Upper Rims & Shadowed Bases (y = 105..200 above horizon)
  for (let c = 0; c < 24; c++) {
    const cx = (c * 137 + 40) % 1024;
    const cy = 105 + ((c * 43) % 95);
    const rx = 85 + (c % 5) * 42;
    const ry = 16 + (c % 3) * 10;

    // Upper sunlit cloud rim
    const topGrad = ctx.createRadialGradient(cx - 12, cy - 6, 4, cx, cy, rx);
    topGrad.addColorStop(0, isDesert ? 'rgba(253, 224, 71, 0.18)' : 'rgba(241, 245, 249, 0.16)');
    topGrad.addColorStop(0.55, isDesert ? 'rgba(217, 119, 6, 0.08)' : 'rgba(148, 163, 184, 0.07)');
    topGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = topGrad;
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();

    // Darker cloud underbelly for 3D volume
    const botGrad = ctx.createRadialGradient(cx + 8, cy + 7, 2, cx + 8, cy + 7, rx * 0.78);
    botGrad.addColorStop(0, 'rgba(15, 23, 42, 0.16)');
    botGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = botGrad;
    ctx.beginPath();
    ctx.ellipse(cx + 8, cy + 7, rx * 0.78, ry * 0.72, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // Layer 1: Distant High-Altitude Mountain Range rising above the y=256 horizon & perimeter walls
  ctx.fillStyle = isDesert ? 'rgba(68, 32, 14, 0.56)' : 'rgba(23, 37, 59, 0.58)';
  ctx.beginPath();
  ctx.moveTo(0, 280);
  for (let x = 0; x <= 1024; x += 16) {
    const mh =
      178 +
      Math.sin(x * 0.012 + 0.5) * 22 +
      Math.cos(x * 0.031) * 12 +
      Math.sin(x * 0.075) * 5;
    ctx.lineTo(x, mh);
  }
  ctx.lineTo(1024, 280);
  ctx.closePath();
  ctx.fill();

  // Layer 2: Mid-Distance Craggy Ridge with Subtle Sunward Slope Highlight
  ctx.fillStyle = isDesert ? 'rgba(41, 21, 9, 0.80)' : 'rgba(15, 23, 38, 0.82)';
  ctx.beginPath();
  ctx.moveTo(0, 280);
  for (let x = 0; x <= 1024; x += 12) {
    const mh =
      198 +
      Math.sin(x * 0.018) * 16 +
      Math.cos(x * 0.048 + 1.2) * 10 +
      Math.sin(x * 0.095) * 4;
    ctx.lineTo(x, mh);
  }
  ctx.lineTo(1024, 280);
  ctx.closePath();
  ctx.fill();

  // Layer 3: Foreground Foothills Silhouette along the y=256 horizon equator
  ctx.fillStyle = isDesert ? 'rgba(24, 13, 6, 0.94)' : 'rgba(9, 13, 22, 0.94)';
  ctx.beginPath();
  ctx.moveTo(0, 290);
  for (let x = 0; x <= 1024; x += 16) {
    const mh = 216 + Math.cos(x * 0.022 + 2.1) * 11 + Math.sin(x * 0.06) * 5;
    ctx.lineTo(x, mh);
  }
  ctx.lineTo(1024, 290);
  ctx.closePath();
  ctx.fill();

  const skyTex = new THREE.CanvasTexture(skyCanvas);
  const skyGeo = new THREE.SphereGeometry(310, 32, 20);
  const skyMat = new THREE.MeshBasicMaterial({
    map: skyTex,
    side: THREE.BackSide,
    fog: false
  });
  const skyDome = new THREE.Mesh(skyGeo, skyMat);
  game.scene.add(skyDome);
  game.skyObjects.push(skyDome);

  // 2. Varied Industrial & Military Perimeter Complex (Hangars, Silos, Command Towers, Radar Masts)
  const facadeTex = createSkylineFacadeTexture(game, isDesert);
  const towerMat = new THREE.MeshStandardMaterial({
    map: facadeTex,
    color: 0xdbe4ee,
    roughness: 0.64,
    metalness: 0.34
  });
  const towerTrimMat = new THREE.MeshStandardMaterial({
    color: 0x242c37,
    roughness: 0.54,
    metalness: 0.52
  });
  const siloSteelMat = new THREE.MeshStandardMaterial({
    color: 0x3b4654,
    roughness: 0.38,
    metalness: 0.72
  });
  const warmLightStripMat = new THREE.MeshBasicMaterial({ color: 0xe5a024 });
  const beaconRedMat = new THREE.MeshBasicMaterial({ color: 0xef4444 });
  game.arenaMaterials.add(towerMat);
  game.arenaMaterials.add(towerTrimMat);
  game.arenaMaterials.add(siloSteelMat);
  game.arenaMaterials.add(warmLightStripMat);
  game.arenaMaterials.add(beaconRedMat);

  const sharedSkyBoxGeo = new THREE.BoxGeometry(1, 1, 1);
  const sharedCylGeo = new THREE.CylinderGeometry(0.5, 0.5, 1, game?.quality?.cylinderSegments || 14);
  const sharedDomeGeo = new THREE.SphereGeometry(0.5, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.55);
  const sharedSpireGeo = new THREE.CylinderGeometry(0.12, 0.46, 1, 8);
  game.arenaGeometries.add(sharedSkyBoxGeo);
  game.arenaGeometries.add(sharedCylGeo);
  game.arenaGeometries.add(sharedDomeGeo);
  game.arenaGeometries.add(sharedSpireGeo);

  // Skyline pieces are batched per (geometry, material) into InstancedMeshes: ~150 draw calls -> ~15 (matters on iGPUs)
  const perimeterBatches = new Map();
  const addPerimeterMesh = (geo, mat, x, y, z, sx, sy, sz, rx = 0, ry = 0, rz = 0) => {
    let byMat = perimeterBatches.get(geo);
    if (!byMat) perimeterBatches.set(geo, (byMat = new Map()));
    let items = byMat.get(mat);
    if (!items) byMat.set(mat, (items = []));
    items.push([x, y, z, sx, sy, sz, rx, ry, rz]);
  };

  const towerCount = 28;
  for (let i = 0; i < towerCount; i++) {
    const angle = (i / towerCount) * Math.PI * 2;
    const cosA = Math.cos(angle);
    const sinA = Math.sin(angle);
    // Chebyshev radial distance to the square arena boundary so diagonal corners never clip inside the arena
    const squareBoundaryDist = halfSize / Math.max(Math.abs(cosA), Math.abs(sinA));
    const dist = squareBoundaryDist + 22 + (i % 3) * 14;
    const tx = cosA * dist;
    const tz = sinA * dist;
    const faceYaw = -angle + Math.PI / 2;
    const archetype = i % 4;

    if (archetype === 0) {
      // Archetype A: Wide Vaulted Military Aircraft Hangar / Logistics Warehouse
      const hw = 18 + (i % 3) * 3;
      const hd = 13 + (i % 2) * 3;
      const hh = 14 + (i % 3) * 3;
      addPerimeterMesh(sharedSkyBoxGeo, towerTrimMat, tx, hh / 2 - 2, tz, hw, hh, hd, 0, faceYaw, 0);
      // Vaulted cylindrical barrel roof (under rz=PI/2, local X is vertical arch height, local Z is horizontal roof depth)
      addPerimeterMesh(sharedCylGeo, siloSteelMat, tx, hh - 2, tz, hd * 0.44, hw * 0.98, hd * 0.96, 0, faceYaw, Math.PI / 2);
      // Illuminated hangar clerestory strip
      addPerimeterMesh(sharedSkyBoxGeo, warmLightStripMat, tx, hh - 3.2, tz, hw + 0.25, 0.38, hd + 0.25, 0, faceYaw, 0);
    } else if (archetype === 1) {
      // Archetype B: Cylindrical Petrochemical Storage Silo Pair & Catwalk Bridge
      const siloR = 5.4 + (i % 2) * 1.2;
      const siloH = 22 + (i % 3) * 5;
      const perpX = -sinA * (siloR * 0.68);
      const perpZ = cosA * (siloR * 0.68);

      for (const side of [-1, 1]) {
        const sx = tx + perpX * side;
        const sz = tz + perpZ * side;
        addPerimeterMesh(sharedCylGeo, siloSteelMat, sx, siloH / 2 - 2, sz, siloR, siloH, siloR);
        addPerimeterMesh(sharedDomeGeo, towerTrimMat, sx, siloH - 2, sz, siloR * 0.96, siloR * 0.45, siloR * 0.96);
        addPerimeterMesh(sharedCylGeo, warmLightStripMat, sx, siloH - 4.2, sz, siloR + 0.18, 0.32, siloR + 0.18);
      }
      // Interconnecting overhead catwalk bridge
      addPerimeterMesh(sharedSkyBoxGeo, towerTrimMat, tx, siloH - 3.2, tz, siloR * 1.6, 1.2, 2.2, 0, faceYaw, 0);
    } else if (archetype === 2) {
      // Archetype C: Stepped Command & Radar Control Tower with Geodesic Radome
      const th = 28 + ((i * 11) % 28);
      const tw = 11 + (i % 3) * 2.8;
      // Lower podium
      addPerimeterMesh(sharedSkyBoxGeo, towerTrimMat, tx, th * 0.22 - 2, tz, tw * 1.32, th * 0.44, tw * 1.32, 0, faceYaw, 0);
      // Main windowed shaft
      addPerimeterMesh(sharedSkyBoxGeo, towerMat, tx, th * 0.5 - 2, tz, tw, th, tw, 0, faceYaw, 0);
      // Cantilevered upper observation deck
      addPerimeterMesh(sharedSkyBoxGeo, towerTrimMat, tx, th - 4.2, tz, tw * 1.18, 2.4, tw * 1.18, 0, faceYaw, 0);
      addPerimeterMesh(sharedSkyBoxGeo, warmLightStripMat, tx, th - 4.2, tz, tw * 1.21, 0.42, tw * 1.21, 0, faceYaw, 0);
      // Rooftop spherical radar dome (Radome)
      addPerimeterMesh(sharedDomeGeo, siloSteelMat, tx, th - 2, tz, tw * 0.62, tw * 0.58, tw * 0.62);
    } else {
      // Archetype D: Industrial Power Plant & Tall Comms Mast with Aviation Beacon
      const th = 22 + ((i * 7) % 22);
      const tw = 10 + (i % 4) * 2.5;
      addPerimeterMesh(sharedSkyBoxGeo, towerMat, tx, th / 2 - 2, tz, tw, th, tw * 1.15, 0, faceYaw, 0);
      addPerimeterMesh(sharedSkyBoxGeo, warmLightStripMat, tx, th - 3.6, tz, tw + 0.22, 0.35, tw * 1.15 + 0.22, 0, faceYaw, 0);

      const spireH = 12 + (i % 3) * 5;
      addPerimeterMesh(sharedSpireGeo, siloSteelMat, tx, th - 2 + spireH / 2, tz, 1.1, spireH, 1.1);
      addPerimeterMesh(sharedSkyBoxGeo, towerTrimMat, tx, th - 2 + spireH * 0.55, tz, 3.6, 0.28, 0.28, 0, faceYaw, 0);
      addPerimeterMesh(sharedSkyBoxGeo, beaconRedMat, tx, th - 2 + spireH, tz, 0.75, 0.75, 0.75);
    }
  }

  const perimeterDummy = new THREE.Object3D();
  for (const [geo, byMat] of perimeterBatches) {
    for (const [mat, items] of byMat) {
      const inst = new THREE.InstancedMesh(geo, mat, items.length);
      for (let k = 0; k < items.length; k++) {
        const [x, y, z, sx, sy, sz, rx, ry, rz] = items[k];
        perimeterDummy.position.set(x, y, z);
        perimeterDummy.rotation.set(rx, ry, rz);
        perimeterDummy.scale.set(sx, sy, sz);
        perimeterDummy.updateMatrix();
        inst.setMatrixAt(k, perimeterDummy.matrix);
      }
      inst.instanceMatrix.needsUpdate = true;
      inst.frustumCulled = false;
      inst.updateMatrix();
      inst.matrixAutoUpdate = false;
      game.scene.add(inst);
      game.skyObjects.push(inst);
    }
  }

  // 3. Subtle Sunlit Atmospheric Dust Motes inside Arena
  const pCount = game?.quality ? game.quality.ambientParticles : 220;
  const span = halfSize * 1.85;
  if (pCount > 0) {
  const positions = new Float32Array(pCount * 3);
  for (let i = 0; i < pCount; i++) {
    positions[i * 3] = (Math.random() - 0.5) * span;
    positions[i * 3 + 1] = 0.8 + Math.random() * 14;
    positions[i * 3 + 2] = (Math.random() - 0.5) * span;
  }
  const pGeo = new THREE.BufferGeometry();
  pGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const pMat = new THREE.PointsMaterial({
    color: 0xe2e8f0,
    size: 0.14,
    transparent: true,
    opacity: 0.32,
    depthWrite: false
  });
  game.ambientParticles = new THREE.Points(pGeo, pMat);
  game.scene.add(game.ambientParticles);
  game.skyObjects.push(game.ambientParticles);
  }
}
