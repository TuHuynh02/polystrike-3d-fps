// Production 3D Arena Environment, Realistic Procedural PBR Textures, IBL Environment Map, Sky Dome & Landmarks
// Weathered concrete tarmac, corrugated ISO shipping containers, military ordnance supply depots, and industrial horizon

import * as THREE from '../vendor/three/three.module.js';
import { QUALITY } from './quality.js';
import {
  applyMetricBoxUV1,
  applyMetricPlaneUV1,
  getSurfacePlan,
  registerPbrSlot,
  resolveTint,
  uvOffsetFor
} from './surfaceMaterials.js';
import { PropBatcher } from './arenaProps.js';

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

export function createGridTexture(game, theme = {}, halfSize = 60) {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 1024;
  const ctx = canvas.getContext('2d');

  const isDesert = theme.floorBase === '#27170c';
  const isLab = theme.floorBase === '#0b0f1e';
  const baseHex = isDesert ? '#423427' : isLab ? '#1e2430' : '#282e37';
  const altHex = isDesert ? '#4a3b2c' : isLab ? '#232a38' : '#2f3640';

  ctx.fillStyle = baseHex;
  ctx.fillRect(0, 0, 1024, 1024);

  // Alternating poured concrete / asphalt tarmac slabs
  ctx.fillStyle = altHex;
  ctx.fillRect(6, 6, 500, 500);
  ctx.fillRect(518, 518, 500, 500);

  // Sub-slab subtle tone variation
  ctx.fillStyle = isDesert ? 'rgba(255, 235, 200, 0.03)' : 'rgba(255, 255, 255, 0.022)';
  ctx.fillRect(256, 6, 250, 250);
  ctx.fillRect(6, 518, 250, 250);

  // High-frequency mineral aggregate speckle & weathered tarmac micro-texture
  for (let i = 0; i < 4800; i++) {
    const rx = (i * 73 + 19) % 1024;
    const ry = (i * 127 + 31) % 1024;
    const sz = (i % 3) + 1.5;
    ctx.fillStyle = i % 2 === 0 ? 'rgba(255, 255, 255, 0.048)' : 'rgba(0, 0, 0, 0.068)';
    ctx.fillRect(rx, ry, sz, sz);
  }

  // Organic weathered tire/oil smudge & moisture patches
  for (let w = 0; w < 14; w++) {
    const wx = ((w * 193 + 80) % 900) + 60;
    const wy = ((w * 251 + 60) % 900) + 60;
    const rad = 65 + (w % 4) * 28;
    const wGrad = ctx.createRadialGradient(wx, wy, 6, wx, wy, rad);
    wGrad.addColorStop(0, isDesert ? 'rgba(52, 34, 18, 0.18)' : 'rgba(8, 11, 16, 0.16)');
    wGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = wGrad;
    ctx.fillRect(wx - rad, wy - rad, rad * 2, rad * 2);
  }

  // Realistic hairline concrete stress cracks
  ctx.strokeStyle = 'rgba(12, 15, 20, 0.45)';
  ctx.lineWidth = 1.5;
  for (let c = 0; c < 8; c++) {
    let cx = ((c * 179 + 90) % 860) + 80;
    let cy = ((c * 233 + 110) % 860) + 80;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    for (let s = 0; s < 6; s++) {
      cx += ((c + s) % 2 === 0 ? 14 : -11) + s * 3;
      cy += ((c * s) % 3 === 0 ? 16 : -12);
      ctx.lineTo(cx, cy);
    }
    ctx.stroke();
  }

  // Poured Concrete Expansion Joint Seams (Dark Bitumen Sealant + Bevel Highlight)
  ctx.strokeStyle = 'rgba(10, 12, 16, 0.84)';
  ctx.lineWidth = 5;
  for (let i = 0; i <= 1024; i += 256) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i, 1024);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, i);
    ctx.lineTo(1024, i);
    ctx.stroke();
  }

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.065)';
  ctx.lineWidth = 2;
  for (let i = 0; i <= 1024; i += 256) {
    ctx.beginPath();
    ctx.moveTo(i + 4, 0);
    ctx.lineTo(i + 4, 1024);
    ctx.moveTo(0, i + 4);
    ctx.lineTo(1024, i + 4);
    ctx.stroke();
  }

  // Faded Tactical Ochre/Yellow Painted Tarmac Alignment Markings at slab intersections
  ctx.fillStyle = 'rgba(229, 160, 36, 0.38)';
  ctx.fillRect(496, 508, 32, 8);
  ctx.fillRect(508, 496, 8, 32);

  // Detailed Cast-Iron Storm Drainage Grates at slab corners
  for (const bx of [32, 480, 544, 992]) {
    for (const by of [32, 480, 544, 992]) {
      ctx.fillStyle = 'rgba(15, 20, 28, 0.78)';
      ctx.fillRect(bx - 8, by - 8, 16, 16);
      ctx.fillStyle = 'rgba(148, 163, 184, 0.25)';
      for (let slot = -5; slot <= 5; slot += 4) {
        ctx.fillRect(bx - 6, by + slot, 12, 1.5);
      }
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  const maxAniso = game.renderer.capabilities.getMaxAnisotropy?.() || 4;
  tex.anisotropy = Math.min(8, maxAniso);
  const repeats = Math.round(halfSize / 2);
  tex.repeat.set(repeats, repeats);
  game.arenaTextures.add(tex);
  return tex;
}

export function createFloorBumpTexture(game, halfSize = 60) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#808080';
  ctx.fillRect(0, 0, 512, 512);

  // Micro-aggregate concrete grain relief
  for (let i = 0; i < 3200; i++) {
    const rx = (i * 59 + 11) % 512;
    const ry = (i * 97 + 23) % 512;
    ctx.fillStyle = i % 2 === 0 ? '#9c9c9c' : '#646464';
    ctx.fillRect(rx, ry, 2, 2);
  }

  // Subtle surface wear patches for roughness variation
  for (let w = 0; w < 8; w++) {
    const wx = ((w * 97 + 40) % 440) + 36;
    const wy = ((w * 127 + 30) % 440) + 36;
    const g = ctx.createRadialGradient(wx, wy, 4, wx, wy, 44);
    g.addColorStop(0, '#585858');
    g.addColorStop(1, 'rgba(128,128,128,0)');
    ctx.fillStyle = g;
    ctx.fillRect(wx - 44, wy - 44, 88, 88);
  }

  // Recessed concrete slab expansion joints
  ctx.strokeStyle = '#202020';
  ctx.lineWidth = 4;
  for (let i = 0; i <= 512; i += 128) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i, 512);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, i);
    ctx.lineTo(512, i);
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  const repeats = Math.round(halfSize / 2);
  tex.repeat.set(repeats, repeats);
  game.arenaTextures.add(tex);
  return tex;
}

export function createObstacleTexture(game, hexColor, type = 'wall') {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');

  // Map obstacle colors into grounded military concrete, weathered shipping containers, steel decks, and timber crates
  const base = new THREE.Color(hexColor);
  const hsl = { h: 0, s: 0, l: 0 };
  base.getHSL(hsl);
  if (type === 'wall' || type === 'platform' || type === 'step') {
    base.setHSL(hsl.h, Math.min(hsl.s, 0.14), Math.max(0.26, Math.min(0.42, hsl.l * 1.12)));
  } else if (type === 'container') {
    let containerH = hsl.h;
    if (containerH > 0.72 && containerH < 0.96) {
      containerH = 0.04; // Corten rust-red
    }
    base.setHSL(containerH, Math.min(hsl.s, 0.44), Math.max(0.22, Math.min(0.38, hsl.l)));
  } else if (type === 'crate') {
    const timberPalette = [0x6b4c35, 0x4a5238, 0x5a422e, 0x785c3c];
    const numericHex = typeof hexColor === 'number' ? hexColor : parseInt(String(hexColor).replace('#', ''), 16) || 0;
    base.setHex(timberPalette[Math.abs(numericHex) % timberPalette.length]);
  }

  ctx.fillStyle = `#${base.getHexString()}`;
  ctx.fillRect(0, 0, 512, 512);

  // High-frequency surface grain
  for (let i = 0; i < 1800; i++) {
    const rx = (i * 67 + 13) % 512;
    const ry = (i * 109 + 29) % 512;
    ctx.fillStyle = i % 2 === 0 ? 'rgba(255,255,255,0.032)' : 'rgba(0,0,0,0.048)';
    ctx.fillRect(rx, ry, 3, 3);
  }

  const vGrad = ctx.createLinearGradient(0, 0, 0, 512);
  vGrad.addColorStop(0.0, 'rgba(255, 255, 255, 0.10)');
  vGrad.addColorStop(0.65, 'rgba(0, 0, 0, 0.0)');
  vGrad.addColorStop(1.0, 'rgba(0, 0, 0, 0.34)');
  ctx.fillStyle = vGrad;
  ctx.fillRect(0, 0, 512, 512);

  if (type === 'container') {
    // Deep Corrugated Steel Shipping Container Ribs with Smooth Cylindrical Shading
    for (let x = 0; x < 512; x += 24) {
      const ribGrad = ctx.createLinearGradient(x, 0, x + 24, 0);
      ribGrad.addColorStop(0.0, 'rgba(0, 0, 0, 0.38)');
      ribGrad.addColorStop(0.35, 'rgba(255, 255, 255, 0.15)');
      ribGrad.addColorStop(0.65, 'rgba(255, 255, 255, 0.04)');
      ribGrad.addColorStop(1.0, 'rgba(0, 0, 0, 0.32)');
      ctx.fillStyle = ribGrad;
      ctx.fillRect(x, 26, 24, 460);
    }

    // Subtle Corten Steel Weathering, Paint Scuffs & Rain Streaks
    for (let w = 0; w < 16; w++) {
      const wx = ((w * 89 + 24) % 460) + 26;
      ctx.fillStyle = w % 2 === 0 ? 'rgba(68, 32, 16, 0.16)' : 'rgba(15, 20, 28, 0.18)';
      ctx.fillRect(wx, 28, 8, 120 + (w % 4) * 70);
    }

    // Heavy Welded Outer ISO Steel Frame
    ctx.strokeStyle = 'rgba(17, 24, 39, 0.90)';
    ctx.lineWidth = 28;
    ctx.strokeRect(0, 0, 512, 512);

    // Stenciled Military Logistics Identification Plate
    ctx.fillStyle = 'rgba(15, 20, 28, 0.80)';
    ctx.fillRect(42, 208, 428, 76);
    ctx.strokeStyle = 'rgba(226, 232, 240, 0.38)';
    ctx.lineWidth = 2;
    ctx.strokeRect(42, 208, 428, 76);

    ctx.fillStyle = 'rgba(241, 245, 249, 0.90)';
    ctx.font = '800 28px "Chakra Petch", "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('NATO // LOG-CARGO 40HC', 256, 246);
    ctx.font = '700 15px Consolas, monospace';
    ctx.fillStyle = 'rgba(229, 160, 36, 0.90)';
    ctx.fillText('MAX GROSS 30,480 KG  •  TARE 3,800 KG', 256, 270);

    // Bottom Forklift Pockets
    ctx.fillStyle = 'rgba(12, 15, 20, 0.88)';
    ctx.fillRect(140, 482, 68, 22);
    ctx.fillRect(304, 482, 68, 22);
  } else if (type === 'crate') {
    // Horizontal Wood Grain Fiber Streaks & Timber Knots
    for (let g = 0; g < 180; g++) {
      const gx = (g * 53 + 17) % 440 + 36;
      const gy = (g * 29 + 39) % 430 + 40;
      const glen = 28 + (g % 5) * 18;
      ctx.fillStyle = g % 3 === 0 ? 'rgba(25, 16, 8, 0.20)' : 'rgba(255, 235, 205, 0.07)';
      ctx.fillRect(gx, gy, Math.min(glen, 472 - gx), 2);
    }

    // Military Timber Ordnance Supply Crate with Recessed Panel & Bolted Steel Framing
    ctx.strokeStyle = 'rgba(20, 24, 30, 0.92)';
    ctx.lineWidth = 34;
    ctx.strokeRect(16, 16, 480, 480);

    // Horizontal Plank Slats
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.46)';
    ctx.lineWidth = 4;
    for (let y = 72; y < 448; y += 54) {
      ctx.beginPath();
      ctx.moveTo(42, y);
      ctx.lineTo(470, y);
      ctx.stroke();
    }

    // Diagonal Timber Cross-Braces with Bevel Highlight
    ctx.strokeStyle = 'rgba(18, 12, 8, 0.48)';
    ctx.lineWidth = 30;
    ctx.beginPath();
    ctx.moveTo(58, 58);
    ctx.lineTo(454, 454);
    ctx.moveTo(454, 58);
    ctx.lineTo(58, 454);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(255, 240, 215, 0.16)';
    ctx.lineWidth = 22;
    ctx.beginPath();
    ctx.moveTo(58, 58);
    ctx.lineTo(454, 454);
    ctx.moveTo(454, 58);
    ctx.lineTo(58, 454);
    ctx.stroke();

    // Central Stenciled Military Ammunition Plate
    ctx.fillStyle = 'rgba(15, 19, 25, 0.92)';
    ctx.fillRect(126, 204, 260, 104);
    ctx.strokeStyle = 'rgba(229, 160, 36, 0.82)';
    ctx.lineWidth = 3;
    ctx.strokeRect(126, 204, 260, 104);

    ctx.fillStyle = '#e5a024';
    ctx.font = '800 24px "Chakra Petch", "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('ORDNANCE SUPPLY', 256, 248);
    ctx.fillStyle = '#cbd5e1';
    ctx.font = '700 15px Consolas, monospace';
    ctx.fillText('CAL 7.62MM NATO // LOT-42', 256, 282);

    // Corner Steel L-Brackets & Rivets
    ctx.fillStyle = '#94a3b8';
    for (const cx of [38, 474]) {
      for (const cy of [38, 474]) {
        ctx.fillRect(cx - 9, cy - 9, 18, 18);
      }
    }
  } else if (type === 'pillar') {
    // Structural Concrete & Steel H-Beam Column with Hazard Base
    ctx.strokeStyle = 'rgba(15, 23, 42, 0.88)';
    ctx.lineWidth = 22;
    ctx.strokeRect(12, 12, 488, 488);

    ctx.fillStyle = 'rgba(30, 36, 46, 0.68)';
    ctx.fillRect(54, 36, 404, 440);

    // Vertical Steel Flange Seams & Rivet Bolts
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.48)';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(176, 24);
    ctx.lineTo(176, 488);
    ctx.moveTo(336, 24);
    ctx.lineTo(336, 488);
    ctx.stroke();

    ctx.fillStyle = 'rgba(203, 213, 225, 0.55)';
    for (let ry = 48; ry < 400; ry += 36) {
      ctx.fillRect(162, ry, 6, 6);
      ctx.fillRect(344, ry, 6, 6);
    }

    // Industrial Yellow/Black Hazard Striping near base
    ctx.fillStyle = '#e5a024';
    ctx.fillRect(36, 412, 440, 48);
    ctx.fillStyle = '#111827';
    for (let hx = 40; hx < 460; hx += 40) {
      ctx.beginPath();
      ctx.moveTo(hx, 412);
      ctx.lineTo(hx + 20, 412);
      ctx.lineTo(hx, 460);
      ctx.lineTo(hx - 20, 460);
      ctx.closePath();
      ctx.fill();
    }
  } else if (type === 'platform') {
    // Reinforced Concrete & Anti-Slip Diamond-Plate Steel Decking (Tiles seamlessly)
    ctx.strokeStyle = 'rgba(15, 20, 28, 0.72)';
    ctx.lineWidth = 6;
    ctx.strokeRect(3, 3, 506, 506);
    ctx.beginPath();
    ctx.moveTo(256, 0);
    ctx.lineTo(256, 512);
    ctx.moveTo(0, 256);
    ctx.lineTo(512, 256);
    ctx.stroke();

    // Inset diamond-plate steel deck panels
    ctx.fillStyle = 'rgba(30, 41, 59, 0.35)';
    ctx.fillRect(24, 24, 208, 208);
    ctx.fillRect(280, 280, 208, 208);

    // Anti-slip diamond tread micro-pattern
    ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
    for (let py = 36; py < 480; py += 16) {
      for (let px = 36; px < 480; px += 16) {
        ctx.fillRect(px, py, 6, 2);
        ctx.fillRect(px + 8, py + 8, 2, 6);
      }
    }

    // Recessed corner bolt heads
    ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
    for (const bx of [18, 238, 274, 494]) {
      for (const by of [18, 238, 274, 494]) {
        ctx.beginPath();
        ctx.arc(bx, by, 4, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  } else if (type === 'step') {
    // Galvanized Industrial Stair Tread with High-Vis Anti-Slip Yellow Nosing
    ctx.fillStyle = 'rgba(15, 23, 42, 0.45)';
    for (let y = 24; y < 488; y += 24) {
      for (let x = 16; x < 496; x += 32) {
        ctx.fillRect(x, y, 18, 8);
      }
    }
    ctx.fillStyle = '#e5a024';
    ctx.fillRect(0, 0, 512, 28);
    ctx.fillRect(0, 484, 512, 28);
    ctx.fillStyle = '#111827';
    for (let hx = 0; hx < 512; hx += 48) {
      ctx.fillRect(hx, 0, 24, 28);
      ctx.fillRect(hx + 24, 484, 24, 28);
    }
  } else {
    // Precast Reinforced Concrete Blast Wall / Bremer Wall with Formwork Seams & Tie-Rod Cones
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.11)';
    ctx.lineWidth = 6;
    ctx.strokeRect(3, 3, 506, 506);

    ctx.strokeStyle = 'rgba(10, 14, 20, 0.58)';
    ctx.lineWidth = 4;
    ctx.strokeRect(16, 16, 480, 480);

    ctx.beginPath();
    ctx.moveTo(16, 256);
    ctx.lineTo(496, 256);
    ctx.moveTo(256, 16);
    ctx.lineTo(256, 496);
    ctx.stroke();

    // Subtle vertical water-runoff weathering streaks from top coping
    for (let w = 0; w < 18; w++) {
      const wx = ((w * 73 + 18) % 470) + 20;
      const wLen = 70 + (w % 5) * 45;
      const streakGrad = ctx.createLinearGradient(0, 16, 0, 16 + wLen);
      streakGrad.addColorStop(0, 'rgba(10, 14, 20, 0.22)');
      streakGrad.addColorStop(1, 'rgba(10, 14, 20, 0)');
      ctx.fillStyle = streakGrad;
      ctx.fillRect(wx, 16, 6 + (w % 3) * 3, wLen);
    }

    // Concrete Formwork Tie-Rod Recess Cones with Metallic Plugs
    for (const tx of [84, 196, 316, 428]) {
      for (const ty of [84, 196, 316, 428]) {
        ctx.fillStyle = 'rgba(10, 14, 20, 0.78)';
        ctx.beginPath();
        ctx.arc(tx, ty, 7, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(148, 163, 184, 0.35)';
        ctx.beginPath();
        ctx.arc(tx - 1, ty - 1, 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Faded Ochre Caution Curb Markers at bottom
    ctx.fillStyle = 'rgba(229, 160, 36, 0.55)';
    for (let wx = 36; wx < 476; wx += 52) {
      ctx.fillRect(wx, 462, 28, 12);
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  const maxAniso = game.renderer.capabilities.getMaxAnisotropy?.() || 4;
  tex.anisotropy = Math.min(8, maxAniso);
  game.arenaTextures.add(tex);
  return tex;
}

export function createObstacleBumpTexture(game, type = 'wall') {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#808080';
  ctx.fillRect(0, 0, 256, 256);

  // Subtle micro-surface grain
  for (let i = 0; i < 1200; i++) {
    const rx = (i * 43 + 7) % 256;
    const ry = (i * 71 + 19) % 256;
    ctx.fillStyle = i % 2 === 0 ? '#969696' : '#6a6a6a';
    ctx.fillRect(rx, ry, 2, 2);
  }

  if (type === 'container') {
    for (let x = 0; x < 256; x += 12) {
      ctx.fillStyle = x % 24 === 0 ? '#242424' : '#dedede';
      ctx.fillRect(x, 12, 6, 232);
    }
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 14;
    ctx.strokeRect(0, 0, 256, 256);
  } else if (type === 'crate') {
    ctx.strokeStyle = '#e4e4e4';
    ctx.lineWidth = 18;
    ctx.strokeRect(8, 8, 240, 240);
    ctx.fillStyle = '#484848';
    ctx.fillRect(28, 28, 200, 200);
    ctx.strokeStyle = '#202020';
    ctx.lineWidth = 3;
    for (let y = 36; y < 224; y += 27) {
      ctx.beginPath();
      ctx.moveTo(24, y);
      ctx.lineTo(232, y);
      ctx.stroke();
    }
    ctx.strokeStyle = '#cccccc';
    ctx.lineWidth = 12;
    ctx.beginPath();
    ctx.moveTo(32, 32);
    ctx.lineTo(224, 224);
    ctx.moveTo(224, 32);
    ctx.lineTo(32, 224);
    ctx.stroke();
  } else if (type === 'platform' || type === 'step') {
    ctx.strokeStyle = '#282828';
    ctx.lineWidth = 4;
    ctx.strokeRect(2, 2, 252, 252);
    ctx.fillStyle = '#b8b8b8';
    for (let y = 12; y < 244; y += 12) {
      for (let x = 12; x < 244; x += 12) {
        ctx.fillRect(x, y, 4, 2);
        ctx.fillRect(x + 5, y + 5, 2, 4);
      }
    }
  } else {
    ctx.strokeStyle = '#d4d4d4';
    ctx.lineWidth = 6;
    ctx.strokeRect(4, 4, 248, 248);
    ctx.strokeStyle = '#242424';
    ctx.lineWidth = 4;
    ctx.strokeRect(12, 12, 232, 232);
    ctx.beginPath();
    ctx.moveTo(12, 128);
    ctx.lineTo(244, 128);
    ctx.moveTo(128, 12);
    ctx.lineTo(128, 244);
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  game.arenaTextures.add(tex);
  return tex;
}

/**
 * Scales BoxGeometry UVs proportionally to world dimensions (w, h, d) so tiled concrete/deck textures
 * maintain crisp, uniform texel density on both 1.5m cover blocks and 120m perimeter walls.
 */
function applyBoxWorldUVs(geo, w, h, d, tileSize = 3.2) {
  const uv = geo.attributes.uv;
  if (!uv || uv.count < 24) return;

  const setFaceUVScale = (faceIndex, uSpan, vSpan) => {
    const uRep = Math.max(0.5, Number((uSpan / tileSize).toFixed(2)));
    const vRep = Math.max(0.5, Number((vSpan / tileSize).toFixed(2)));
    const base = faceIndex * 4;
    for (let i = 0; i < 4; i++) {
      const u0 = uv.getX(base + i);
      const v0 = uv.getY(base + i);
      uv.setXY(base + i, u0 * uRep, v0 * vRep);
    }
  };

  // BoxGeometry face order: 0:+X (d x h), 1:-X (d x h), 2:+Y (w x d), 3:-Y (w x d), 4:+Z (w x h), 5:-Z (w x h)
  setFaceUVScale(0, d, h);
  setFaceUVScale(1, d, h);
  setFaceUVScale(2, w, d);
  setFaceUVScale(3, w, d);
  setFaceUVScale(4, w, h);
  setFaceUVScale(5, w, h);
  uv.needsUpdate = true;
}

export function buildMapLandmarks(
  game,
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
    // 2 Massive Industrial Port Gantry Cranes spanning West & East Dockyards
    for (const sideSign of [-1, 1]) {
      const gx = sideSign * 38;
      for (const lz of [-7.4, 7.4]) {
        addDecorBox(gx - 5.2, 11.5, lz, 1.1, 21.0, 1.1, hazardMat, true);
        addDecorBox(gx + 5.2, 11.5, lz, 1.1, 21.0, 1.1, hazardMat, true);
        addDecorBox(gx, 10.5, lz, 11.2, 0.65, 0.65, darkSteelMat);
        addDecorBox(gx, 16.5, lz, 11.2, 0.65, 0.65, darkSteelMat);
        addDecorBox(gx, 21.5, lz, 12.2, 1.1, 1.3, gunmetalFrameMat);
      }
      const boomX = gx - sideSign * 6.5;
      addDecorBox(boomX, 22.4, 0, 28.0, 1.4, 16.2, darkSteelMat, true);
      addDecorBox(boomX, 23.2, -7.4, 28.5, 0.35, 0.45, trimAccentMat);
      addDecorBox(boomX, 23.2, 7.4, 28.5, 0.35, 0.45, trimAccentMat);

      const cabX = gx - sideSign * 14.0;
      addDecorBox(cabX, 20.6, 0, 3.8, 2.2, 3.4, gunmetalFrameMat);
      addDecorBox(cabX, 20.4, 0, 4.0, 0.8, 3.6, trimSecondaryMat);

      addDecorCyl(cabX, 17.2, -2.6, 0.06, 6.2, brushedChromeMat, 'y');
      addDecorCyl(cabX, 17.2, 2.6, 0.06, 6.2, brushedChromeMat, 'y');
      addDecorBox(cabX, 14.8, 0, 3.6, 0.45, 7.6, hazardMat);
      addDecorBox(cabX, 13.0, 0, 3.4, 3.0, 8.2, gunmetalFrameMat, true);
      addDecorBox(cabX, 13.0, 0, 3.55, 0.45, 8.3, trimAccentMat);
    }
  } else if (mapId === 'desert_outpost') {
    const dishGroup = new THREE.Group();
    dishGroup.position.set(0, 13.8, 0);

    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.65, 4.2, 12), darkSteelMat);
    game.arenaGeometries.add(mast.geometry);
    dishGroup.add(mast);

    const dishGeo = new THREE.ConeGeometry(4.2, 1.8, 20, 1, true);
    game.arenaGeometries.add(dishGeo);
    const dishMesh = new THREE.Mesh(dishGeo, brushedChromeMat);
    dishMesh.rotation.x = Math.PI * 0.68;
    dishMesh.position.set(0, 1.6, 0.6);
    dishGroup.add(dishMesh);

    const emitter = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.35, 2.6, 10), trimAccentMat);
    game.arenaGeometries.add(emitter.geometry);
    emitter.rotation.x = Math.PI / 2;
    emitter.position.set(0, 2.2, 1.4);
    dishGroup.add(emitter);

    const wingGeo = new THREE.BoxGeometry(6.5, 0.18, 2.4);
    game.arenaGeometries.add(wingGeo);
    const wingL = new THREE.Mesh(wingGeo, trimSecondaryMat);
    const wingR = new THREE.Mesh(wingGeo, trimSecondaryMat);
    wingL.position.set(-5.2, 0.8, 0);
    wingR.position.set(5.2, 0.8, 0);
    dishGroup.add(wingL, wingR);

    game.scene.add(dishGroup);
    game.arenaDecorMeshes.push(dishGroup);
    game.citadelRings.push(dishGroup);

    for (const qx of [-36, 36]) {
      for (const qz of [-34, 34]) {
        for (const px of [-4.6, 4.6]) {
          for (const pz of [-4.6, 4.6]) {
            addDecorCyl(qx + px, 4.6, qz + pz, 0.22, 4.4, darkSteelMat, 'y');
          }
        }
        addDecorBox(qx, 6.9, qz, 11.4, 0.45, 11.4, gunmetalFrameMat, true);
        addDecorBox(qx, 7.2, qz, 11.6, 0.14, 11.6, trimAccentMat);
      }
    }
  } else if (mapId === 'neon_lab') {
    const accelTorusGeo = new THREE.TorusGeometry(10.5, 0.55, 14, 48);
    game.arenaGeometries.add(accelTorusGeo);
    const accelRing = new THREE.Mesh(accelTorusGeo, gunmetalFrameMat);
    accelRing.rotation.x = Math.PI / 2;
    accelRing.position.set(0, 13.5, 0);
    game.scene.add(accelRing);
    game.arenaDecorMeshes.push(accelRing);

    const coreTorusGeo = new THREE.TorusGeometry(9.8, 0.18, 10, 48);
    game.arenaGeometries.add(coreTorusGeo);
    const coreRing = new THREE.Mesh(coreTorusGeo, trimAccentMat);
    coreRing.rotation.x = Math.PI / 2;
    coreRing.position.set(0, 13.5, 0);
    game.scene.add(coreRing);
    game.arenaDecorMeshes.push(coreRing);
    game.citadelRings.push(coreRing);

    for (let c = 0; c < 8; c++) {
      const ang = (c / 8) * Math.PI * 2;
      const rx = Math.cos(ang) * 10.5;
      const rz = Math.sin(ang) * 10.5;
      const coil = addDecorBox(rx, 13.5, rz, 1.8, 1.8, 1.8, c % 2 === 0 ? trimAccentMat : trimSecondaryMat);
      coil.rotation.y = -ang;
    }

    addDecorCyl(0, 22, 0, 0.35, 32, gunmetalFrameMat, 'y');
  } else {
    addDecorCyl(0, 18, 0, 0.32, 26, gunmetalFrameMat, 'y');

    const archDist = 24;
    for (const dirSign of [-1, 1]) {
      addDecorBox(0, 6.8, dirSign * archDist, 14.5, 1.1, 1.6, darkSteelMat, true);
      addDecorBox(0, 7.45, dirSign * archDist, 14.8, 0.24, 1.8, trimAccentMat);
      addDecorCyl(-6.2, 4.9, dirSign * archDist, 0.65, 3.8, gunmetalFrameMat, 'y');
      addDecorCyl(6.2, 4.9, dirSign * archDist, 0.65, 3.8, gunmetalFrameMat, 'y');
    }
  }
}

/**
 * Bakes the world matrices of many indexed box meshes into ONE geometry (position, normal, uv, uv1, index).
 * Used by the Low tier to turn ~120 obstacle draw calls into one per material.
 */
export function mergeMeshGeometries(meshes) {
  let vCount = 0;
  let iCount = 0;
  for (const m of meshes) {
    vCount += m.geometry.attributes.position.count;
    iCount += m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count;
  }
  const hasUv1 = meshes.every((m) => m.geometry.attributes.uv1);
  const pos = new Float32Array(vCount * 3);
  const nor = new Float32Array(vCount * 3);
  const uv = new Float32Array(vCount * 2);
  const uv1 = hasUv1 ? new Float32Array(vCount * 2) : null;
  const idx = new Uint32Array(iCount);
  const v = new THREE.Vector3();
  const normalMatrix = new THREE.Matrix3();
  let vo = 0;
  let io = 0;
  for (const m of meshes) {
    m.updateMatrix();
    normalMatrix.getNormalMatrix(m.matrix);
    const g = m.geometry;
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i).applyMatrix4(m.matrix);
      pos.set([v.x, v.y, v.z], (vo + i) * 3);
      v.fromBufferAttribute(g.attributes.normal, i).applyMatrix3(normalMatrix).normalize();
      nor.set([v.x, v.y, v.z], (vo + i) * 3);
      uv.set([g.attributes.uv.getX(i), g.attributes.uv.getY(i)], (vo + i) * 2);
      if (uv1) uv1.set([g.attributes.uv1.getX(i), g.attributes.uv1.getY(i)], (vo + i) * 2);
    }
    if (g.index) {
      for (let i = 0; i < g.index.count; i++) idx[io++] = g.index.getX(i) + vo;
    } else {
      for (let i = 0; i < p.count; i++) idx[io++] = vo + i;
    }
    vo += p.count;
  }
  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  merged.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  merged.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  if (uv1) merged.setAttribute('uv1', new THREE.BufferAttribute(uv1, 2));
  merged.setIndex(new THREE.BufferAttribute(idx, 1));
  merged.computeBoundingSphere();
  merged.computeBoundingBox();
  return merged;
}

export function buildArena(game, mapCfg = game?.currentMapConfig || {}) {
  const halfSize = mapCfg.arenaHalfSize || game?.arenaHalfSize || 60;
  const span = halfSize * 2;
  const theme = mapCfg.theme || {};
  const preset = game?.quality || QUALITY.medium;
  const plan = getSurfacePlan(mapCfg.id);
  game.pbrSlots = [];

  // Ground Floor with high-res anisotropic weathered concrete/tarmac diffuse, bump & roughness relief
  const floorGeo = new THREE.PlaneGeometry(span, span);
  const floorBumpTex = createFloorBumpTexture(game, halfSize);
  const floorMat = new THREE.MeshStandardMaterial({
    map: createGridTexture(game, theme, halfSize),
    bumpMap: floorBumpTex,
    roughnessMap: floorBumpTex,
    bumpScale: 0.048,
    roughness: 0.82,
    metalness: 0.14,
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 1
  });
  game.arenaMaterials.add(floorMat);
  applyMetricPlaneUV1(floorGeo, span, span, plan.floor.tile);
  game.arenaGeometries.add(floorGeo);
  registerPbrSlot(game, floorMat, plan.floor, resolveTint(plan.floor, null, 'floor'));
  const floorMesh = new THREE.Mesh(floorGeo, floorMat);
  floorMesh.rotation.x = -Math.PI / 2;
  floorMesh.receiveShadow = true;
  game.scene.add(floorMesh);
  game.worldMeshes.push(floorMesh);

  const bumpCache = new Map();
  const getBump = (type = 'wall') => {
    if (!bumpCache.has(type)) {
      bumpCache.set(type, createObstacleBumpTexture(game, type));
    }
    return bumpCache.get(type);
  };

  const matCache = new Map();
  const getMat = (colorHex, type = 'wall') => {
    const key = `${colorHex}_${type}`;
    if (!matCache.has(key)) {
      const isMetal = type === 'container' || type === 'pillar' || type === 'step';
      const isPlatform = type === 'platform';
      const isWoodCrate = type === 'crate';
      const bumpTex = getBump(type);
      const m = new THREE.MeshStandardMaterial({
        map: createObstacleTexture(game, colorHex, type),
        bumpMap: bumpTex,
        roughnessMap: bumpTex,
        bumpScale: isMetal ? 0.058 : isPlatform ? 0.045 : 0.042,
        roughness: isMetal ? 0.42 : isPlatform ? 0.62 : isWoodCrate ? 0.68 : 0.76,
        metalness: isMetal ? 0.66 : isPlatform ? 0.34 : isWoodCrate ? 0.16 : 0.14
      });
      game.arenaMaterials.add(m);
      const spec = plan[type] || plan.wall;
      registerPbrSlot(game, m, spec, resolveTint(spec, colorHex, type));
      matCache.set(key, m);
    }
    return matCache.get(key);
  };

  const darkSteelMat = new THREE.MeshStandardMaterial({
    color: 0x161b22,
    roughness: 0.38,
    metalness: 0.82,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1
  });
  const gunmetalFrameMat = new THREE.MeshStandardMaterial({
    color: 0x262f3d,
    roughness: 0.44,
    metalness: 0.68,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1
  });
  const brushedChromeMat = new THREE.MeshStandardMaterial({
    color: 0x94a3b8,
    roughness: 0.24,
    metalness: 0.90,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1
  });
  const hazardMat = new THREE.MeshStandardMaterial({
    color: 0xd97706,
    roughness: 0.46,
    metalness: 0.34,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1
  });
  const barrelOliveMat = new THREE.MeshStandardMaterial({
    color: 0x3b4d38,
    roughness: 0.42,
    metalness: 0.58
  });

  const sandbagCanvas = document.createElement('canvas');
  sandbagCanvas.width = 128;
  sandbagCanvas.height = 128;
  const sbCtx = sandbagCanvas.getContext('2d');
  sbCtx.fillStyle = '#867658';
  sbCtx.fillRect(0, 0, 128, 128);
  for (let y = 0; y < 128; y += 4) {
    sbCtx.fillStyle = y % 8 === 0 ? 'rgba(255,248,225,0.09)' : 'rgba(20,16,10,0.14)';
    sbCtx.fillRect(0, y, 128, 2);
  }
  for (let x = 0; x < 128; x += 4) {
    sbCtx.fillStyle = x % 8 === 0 ? 'rgba(255,248,225,0.07)' : 'rgba(20,16,10,0.11)';
    sbCtx.fillRect(x, 0, 2, 128);
  }
  sbCtx.strokeStyle = 'rgba(38, 30, 18, 0.58)';
  sbCtx.lineWidth = 3;
  sbCtx.beginPath();
  sbCtx.moveTo(0, 64);
  sbCtx.lineTo(128, 64);
  sbCtx.stroke();
  const sandbagTex = new THREE.CanvasTexture(sandbagCanvas);
  sandbagTex.wrapS = THREE.RepeatWrapping;
  sandbagTex.wrapT = THREE.RepeatWrapping;
  game.arenaTextures.add(sandbagTex);

  const sandbagMat = new THREE.MeshStandardMaterial({
    map: sandbagTex,
    bumpMap: sandbagTex,
    bumpScale: 0.032,
    color: 0x948466,
    roughness: 0.88,
    metalness: 0.04
  });
  const trimAccentMat = new THREE.MeshStandardMaterial({
    color: 0xe5a024,
    emissive: 0xe5a024,
    emissiveIntensity: 0.35,
    roughness: 0.35,
    metalness: 0.5
  });
  const trimSecondaryMat = new THREE.MeshStandardMaterial({
    color: theme.secondaryHex || 0x38bdf8,
    emissive: theme.secondaryHex || 0x38bdf8,
    emissiveIntensity: 0.25,
    roughness: 0.4,
    metalness: 0.5
  });

  game.arenaMaterials.add(darkSteelMat);
  game.arenaMaterials.add(gunmetalFrameMat);
  game.arenaMaterials.add(brushedChromeMat);
  game.arenaMaterials.add(hazardMat);
  game.arenaMaterials.add(barrelOliveMat);
  game.arenaMaterials.add(sandbagMat);
  game.arenaMaterials.add(trimAccentMat);
  game.arenaMaterials.add(trimSecondaryMat);

  const unitBoxGeo = new THREE.BoxGeometry(1, 1, 1);
  const unitCylGeo = new THREE.CylinderGeometry(0.5, 0.5, 1, preset.cylinderSegments);
  const unitOctGeo = new THREE.OctahedronGeometry(0.55, 0);
  const unitSandbagGeo = new THREE.CapsuleGeometry(0.22, 0.58, preset.capsuleSegments, preset.capsuleSegments + 4);
  game.arenaGeometries.add(unitBoxGeo);
  game.arenaGeometries.add(unitCylGeo);
  game.arenaGeometries.add(unitOctGeo);
  game.arenaGeometries.add(unitSandbagGeo);

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

  const addDecorCyl = (x, y, z, radius, len, mat, axis = 'y', castShadow = false) => {
    const rx = axis === 'z' ? Math.PI / 2 : 0;
    const rz = axis === 'x' ? Math.PI / 2 : 0;
    return registerInstancedItem(unitCylGeo, mat, x, y, z, radius * 2, len, radius * 2, rx, 0, rz, castShadow);
  };

  const addDecorSandbag = (x, y, z, alongX = true, scale = 1.0, yawJitter = 0) => {
    if (alongX) {
      return registerInstancedItem(unitSandbagGeo, sandbagMat, x, y, z, 0.78 * scale, 1.05 * scale, 1.15 * scale, 0, yawJitter, Math.PI / 2, true);
    }
    return registerInstancedItem(unitSandbagGeo, sandbagMat, x, y, z, 1.15 * scale, 1.05 * scale, 0.78 * scale, Math.PI / 2, yawJitter, 0, true);
  };

  // Helper to place a realistic 3D 55-Gallon Cylindrical Military Fuel Drum with Rolling Hoops & Bung Caps
  const addMilitaryFuelDrum = (x, botY, z, mat = barrelOliveMat) => {
    const drumH = 0.92;
    const drumR = 0.29;
    const cy = botY + drumH / 2;
    addDecorCyl(x, cy, z, drumR, drumH, mat, 'y', true);
    addDecorCyl(x, cy - 0.16, z, drumR + 0.016, 0.045, darkSteelMat, 'y');
    addDecorCyl(x, cy + 0.16, z, drumR + 0.016, 0.045, darkSteelMat, 'y');
    addDecorCyl(x, botY + drumH + 0.01, z, drumR + 0.012, 0.028, darkSteelMat, 'y');
    addDecorCyl(x + 0.12, botY + drumH + 0.03, z - 0.08, 0.036, 0.032, brushedChromeMat, 'y');
  };

  const buildContainerDetails = (cx, cy, cz, cw, ch, cd, mainMat, isUpperStack = false) => {
    const alongZ = cd >= cw;
    const halfW = cw / 2;
    const halfH = ch / 2;
    const halfD = cd / 2;

    const railThick = 0.16;
    for (const sy of [-1, 1]) {
      const ry = cy + sy * (halfH - 0.04);
      addDecorBox(cx, ry, cz - halfD - 0.02, cw + 0.08, railThick, railThick, darkSteelMat);
      addDecorBox(cx, ry, cz + halfD + 0.02, cw + 0.08, railThick, railThick, darkSteelMat);
      addDecorBox(cx - halfW - 0.02, ry, cz, railThick, railThick, cd + 0.08, darkSteelMat);
      addDecorBox(cx + halfW + 0.02, ry, cz, railThick, railThick, cd + 0.08, darkSteelMat);
    }

    const castSize = 0.34;
    for (const sx of [-1, 1]) {
      for (const sy of [-1, 1]) {
        for (const sz of [-1, 1]) {
          addDecorBox(
            cx + sx * (halfW - 0.02),
            cy + sy * (halfH - 0.02),
            cz + sz * (halfD - 0.02),
            castSize,
            castSize,
            castSize,
            brushedChromeMat
          );
        }
      }
    }

    // 3D Cylindrical-Profile Corrugated Steel Side Ribs
    const longSpan = alongZ ? cd : cw;
    const ribCount = Math.max(4, Math.floor((longSpan - 1.0) / 0.78));
    for (let r = 0; r < ribCount; r++) {
      const offset = -longSpan / 2 + 0.65 + (r / Math.max(1, ribCount - 1)) * (longSpan - 1.3);
      if (alongZ) {
        addDecorCyl(cx - halfW - 0.035, cy, cz + offset, 0.085, ch - 0.36, mainMat, 'y');
        addDecorCyl(cx + halfW + 0.035, cy, cz + offset, 0.085, ch - 0.36, mainMat, 'y');
      } else {
        addDecorCyl(cx + offset, cy, cz - halfD - 0.035, 0.085, ch - 0.36, mainMat, 'y');
        addDecorCyl(cx + offset, cy, cz + halfD + 0.035, 0.085, ch - 0.36, mainMat, 'y');
      }
    }

    // Cargo Double-Door End Hardware (Rubber Center Seal + 4 Galvanized Locking Bars + Cam Latches)
    for (const endSign of [-1, 1]) {
      if (alongZ) {
        const ez = cz + endSign * (halfD + 0.035);
        addDecorBox(cx, cy, ez, 0.08, ch - 0.3, 0.05, darkSteelMat);
        for (const barX of [-cw * 0.28, -cw * 0.11, cw * 0.11, cw * 0.28]) {
          addDecorCyl(cx + barX, cy, ez + endSign * 0.03, 0.034, ch - 0.34, brushedChromeMat, 'y');
          addDecorBox(cx + barX, cy - 0.15, ez + endSign * 0.05, 0.12, 0.08, 0.08, hazardMat);
        }
      } else {
        const ex = cx + endSign * (halfW + 0.035);
        addDecorBox(ex, cy, cz, 0.05, ch - 0.3, 0.08, darkSteelMat);
        for (const barZ of [-cd * 0.28, -cd * 0.11, cd * 0.11, cd * 0.28]) {
          addDecorCyl(ex + endSign * 0.03, cy, cz + barZ, 0.034, ch - 0.34, brushedChromeMat, 'y');
          addDecorBox(ex + endSign * 0.05, cy - 0.15, cz + barZ, 0.08, 0.08, 0.12, hazardMat);
        }
      }
    }

    if (!isUpperStack) {
      addDecorBox(cx, cy + halfH + 0.14, cz, cw * 0.55, 0.24, cd * 0.35, gunmetalFrameMat);
    }
  };

  // Authentic Military & Maritime Container Palette (Rust Red, Navy Blue, Olive Drab, Ochre Tan, Slate)
  const stackColors = [0x2b4c65, 0x7c2d12, 0x3f4d3b, 0x92400e, 0x334155];
  let containerIdx = 0;
  let crateIdx = 0;

  // glTF crate props (Low tier: none). Only models whose bounding box fits the target AABB within tolerance are used;
  // everything else keeps the procedural box, so a missing/squashed model can never change the look badly.
  const crateGltf = preset.glbProps ? game.assets?.loadedModels?.get('crate-wide') : null;
  const crateObstacleBatch = crateGltf ? new PropBatcher(crateGltf.scene, 'crate-obstacle') : null;
  const crateTopperBatch = crateGltf ? new PropBatcher(crateGltf.scene, 'crate-topper') : null;
  game.propBatchers = [crateObstacleBatch, crateTopperBatch].filter(Boolean);

  for (const obs of mapCfg.obstacles) {
    const mainMat = getMat(obs.color, obs.type);
    const geo = new THREE.BoxGeometry(obs.w, obs.h, obs.d);
    applyMetricBoxUV1(
      geo,
      obs.w,
      obs.h,
      obs.d,
      (plan[obs.type] || plan.wall).tile,
      uvOffsetFor(obs.x, obs.y, obs.z)
    );
    if (obs.type === 'wall' || obs.type === 'platform') {
      applyBoxWorldUVs(geo, obs.w, obs.h, obs.d, 3.2);
    } else if (obs.type === 'step') {
      applyBoxWorldUVs(geo, obs.w, obs.h, obs.d, 1.6);
    }
    game.arenaGeometries.add(geo);
    const mesh = new THREE.Mesh(geo, mainMat);
    mesh.position.set(obs.x, obs.y, obs.z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.updateMatrix();
    mesh.matrixAutoUpdate = false;
    game.scene.add(mesh);
    game.worldMeshes.push(mesh);

    const halfW = obs.w / 2;
    const halfH = obs.h / 2;
    const halfD = obs.d / 2;
    const topY = obs.y + halfH;
    const botY = obs.y - halfH;

    if (obs.type === 'container') {
      buildContainerDetails(obs.x, obs.y, obs.z, obs.w, obs.h, obs.d, mainMat, false);

      if (obs.y < 2.2 && Math.max(obs.w, obs.d) >= 7.5) {
        const upperColor = stackColors[containerIdx % stackColors.length];
        containerIdx++;
        const upperMat = getMat(upperColor, 'container');
        const upperH = 3.1;
        const upperY = topY + upperH / 2 + 0.06;

        const upperCore = addDecorBox(obs.x, upperY, obs.z, obs.w * 0.96, upperH, obs.d * 0.96, upperMat, true);
        if (containerIdx % 2 === 0) {
          upperCore.rotation.y = 0.035;
        }
        buildContainerDetails(obs.x, upperY, obs.z, obs.w * 0.96, upperH, obs.d * 0.96, upperMat, true);
      }
    } else if (obs.type === 'crate' && crateObstacleBatch?.tryAdd(
      { x: obs.x, y: obs.y, z: obs.z },
      { w: obs.w, h: obs.h, d: obs.d }
    )) {
      // Kenney crate model fits this AABB: it replaces the box visual (the collision box and the raycast mesh stay)
      mesh.visible = false;
      crateIdx++;
    } else if (obs.type === 'crate') {
      crateIdx++;
      // Contoured Military Ordnance Case: Top Overhang Lid, Pallet Base, Rounded Corner Bumpers & Steel Latches
      addDecorBox(obs.x, topY - 0.10, obs.z, obs.w + 0.12, 0.14, obs.d + 0.12, darkSteelMat);
      addDecorBox(obs.x, botY + 0.09, obs.z, obs.w + 0.14, 0.14, obs.d + 0.14, darkSteelMat);

      // Rounded Cylindrical Corner Bumpers (breaks up sharp 90-degree box edges)
      for (const sx of [-1, 1]) {
        for (const sz of [-1, 1]) {
          addDecorCyl(
            obs.x + sx * (halfW + 0.02),
            obs.y,
            obs.z + sz * (halfD + 0.02),
            0.13,
            obs.h - 0.02,
            gunmetalFrameMat,
            'y'
          );
        }
      }

      // Molded Top Reinforcement Lid & Tie-Down Bars
      addDecorBox(obs.x, topY + 0.045, obs.z, obs.w * 0.76, 0.07, obs.d * 0.76, gunmetalFrameMat);
      addDecorCyl(obs.x, topY + 0.095, obs.z - obs.d * 0.22, 0.04, obs.w * 0.72, darkSteelMat, 'x');
      addDecorCyl(obs.x, topY + 0.095, obs.z + obs.d * 0.22, 0.04, obs.w * 0.72, darkSteelMat, 'x');

      // Side Latch Clasps & Caution Plates
      addDecorBox(obs.x, obs.y + 0.05, obs.z - halfD - 0.04, obs.w * 0.42, 0.10, 0.04, hazardMat);
      addDecorBox(obs.x, obs.y + 0.05, obs.z + halfD + 0.04, obs.w * 0.42, 0.10, 0.04, hazardMat);

      // On wide supply crates, stack cylindrical 55-gallon military fuel drums or tactical hardcases on top
      if (obs.w >= 2.1 && obs.d >= 2.0 && obs.h >= 1.8) {
        if (crateIdx % 2 === 0) {
          addMilitaryFuelDrum(obs.x - 0.42, topY + 0.08, obs.z - 0.18, barrelOliveMat);
          addMilitaryFuelDrum(obs.x + 0.36, topY + 0.08, obs.z + 0.22, gunmetalFrameMat);
        } else {
          // Molded Pelican Tactical Weapons Case on top of supply pallet (glTF crate when it fits, else procedural boxes)
          const topperFit = crateTopperBatch?.tryAddContained(
            { x: obs.x, z: obs.z },
            topY + 0.08,
            { w: obs.w * 0.7, h: 0.5, d: obs.d * 0.6 }
          );
          if (!topperFit) {
            addDecorBox(obs.x, topY + 0.26, obs.z, obs.w * 0.58, 0.36, obs.d * 0.48, barrelOliveMat, true);
            addDecorBox(obs.x, topY + 0.47, obs.z, obs.w * 0.60, 0.05, obs.d * 0.50, darkSteelMat);
          }
        }
      }
    } else if (obs.type === 'pillar') {
      // Heavy Stepped Concrete & Steel Column Base + Cylindrical Corner Flanges
      addDecorBox(obs.x, botY + 0.25, obs.z, obs.w + 0.58, 0.46, obs.d + 0.58, darkSteelMat);
      addDecorBox(obs.x, botY + 0.64, obs.z, obs.w + 0.32, 0.28, obs.d + 0.32, gunmetalFrameMat);
      addDecorBox(obs.x, topY - 0.25, obs.z, obs.w + 0.46, 0.44, obs.d + 0.46, darkSteelMat);

      for (const sx of [-1, 1]) {
        for (const sz of [-1, 1]) {
          addDecorCyl(
            obs.x + sx * (halfW + 0.03),
            obs.y,
            obs.z + sz * (halfD + 0.03),
            0.18,
            obs.h - 0.04,
            gunmetalFrameMat,
            'y'
          );
        }
      }

      const isCenterPillar = Math.abs(obs.x) < 2 && Math.abs(obs.z) < 2;
      const spireH = isCenterPillar ? 10.5 : 7.5;
      addDecorCyl(obs.x, topY + spireH / 2, obs.z, obs.w * 0.28, spireH, darkSteelMat, 'y', true);
      addDecorBox(obs.x, topY + spireH * 0.45, obs.z, obs.w * 0.88, 0.38, obs.d * 0.88, gunmetalFrameMat);
      addDecorBox(obs.x, topY + spireH * 0.82, obs.z, obs.w * 0.72, 0.32, obs.d * 0.72, trimAccentMat);

      // Replace floating arcade torus rings with a realistic rotating Military Radar Scanner & Comms Array
      if (isCenterPillar) {
        const radarGroup = new THREE.Group();
        radarGroup.position.set(obs.x, topY + 3.2, obs.z);

        const collarGeo = new THREE.CylinderGeometry(0.95, 1.05, 0.65, 14);
        const crossArmGeo = new THREE.BoxGeometry(4.6, 0.24, 0.32);
        const radarWingGeo = new THREE.BoxGeometry(0.28, 0.72, 2.8);
        const drumDishGeo = new THREE.CylinderGeometry(0.58, 0.58, 0.36, 16);
        game.arenaGeometries.add(collarGeo);
        game.arenaGeometries.add(crossArmGeo);
        game.arenaGeometries.add(radarWingGeo);
        game.arenaGeometries.add(drumDishGeo);

        const collar = new THREE.Mesh(collarGeo, gunmetalFrameMat);
        const crossArm = new THREE.Mesh(crossArmGeo, darkSteelMat);
        const wingL = new THREE.Mesh(radarWingGeo, trimAccentMat);
        wingL.position.set(-2.2, 0.18, 0);
        const wingR = new THREE.Mesh(radarWingGeo, trimAccentMat);
        wingR.position.set(2.2, 0.18, 0);

        const dishA = new THREE.Mesh(drumDishGeo, brushedChromeMat);
        dishA.rotation.x = Math.PI / 2;
        dishA.position.set(0, 0.65, 1.15);
        const dishB = new THREE.Mesh(drumDishGeo, brushedChromeMat);
        dishB.rotation.x = Math.PI / 2;
        dishB.position.set(0, 0.65, -1.15);

        radarGroup.add(collar, crossArm, wingL, wingR, dishA, dishB);
        game.scene.add(radarGroup);
        game.arenaDecorMeshes.push(radarGroup);
        game.citadelRings.push(radarGroup);
      }
    } else if (obs.type === 'platform') {
      // Overhanging Structural Steel Deck Cornice + Base Plinth (recessed below topY so walkable deck never z-fights)
      addDecorBox(obs.x, topY - 0.20, obs.z, obs.w + 0.36, 0.24, obs.d + 0.36, darkSteelMat);
      addDecorBox(obs.x, topY - 0.055, obs.z, obs.w + 0.42, 0.07, obs.d + 0.42, hazardMat);
      addDecorBox(obs.x, botY + 0.15, obs.z, obs.w + 0.28, 0.24, obs.d + 0.28, gunmetalFrameMat);

      // Corner Cylindrical & Box Bastion Columns
      for (const sx of [-1, 1]) {
        for (const sz of [-1, 1]) {
          const bx = obs.x + sx * (halfW - 0.35);
          const bz = obs.z + sz * (halfD - 0.35);
          addDecorBox(bx, obs.y + 0.26, bz, 0.88, obs.h + 0.48, 0.88, darkSteelMat);
          addDecorCyl(bx, topY + 0.38, bz, 0.32, 0.24, gunmetalFrameMat, 'y');
        }
      }

      // Intermediate Side Structural Steel Support Columns along long spans
      for (const sideSign of [-1, 1]) {
        if (obs.w >= 12) {
          for (const ox of [-obs.w * 0.26, obs.w * 0.26]) {
            addDecorCyl(obs.x + ox, obs.y, obs.z + sideSign * (halfD + 0.08), 0.16, obs.h - 0.15, gunmetalFrameMat, 'y');
          }
        }
        if (obs.d >= 12) {
          for (const oz of [-obs.d * 0.26, obs.d * 0.26]) {
            addDecorCyl(obs.x + sideSign * (halfW + 0.08), obs.y, obs.z + oz, 0.16, obs.h - 0.15, gunmetalFrameMat, 'y');
          }
        }
      }
    } else if (obs.type === 'step') {
      // Industrial Stair Tread Bullnose Cylinders & Side Stringer Plates
      const alongZ = obs.w >= obs.d;
      if (alongZ) {
        addDecorCyl(obs.x, topY - 0.035, obs.z - halfD - 0.025, 0.03, obs.w - 0.02, brushedChromeMat, 'x');
        addDecorCyl(obs.x, topY - 0.035, obs.z + halfD + 0.025, 0.03, obs.w - 0.02, brushedChromeMat, 'x');
        addDecorBox(obs.x - halfW - 0.04, obs.y, obs.z, 0.07, Math.max(0.1, obs.h - 0.03), Math.max(0.2, obs.d - 0.04), darkSteelMat);
        addDecorBox(obs.x + halfW + 0.04, obs.y, obs.z, 0.07, Math.max(0.1, obs.h - 0.03), Math.max(0.2, obs.d - 0.04), darkSteelMat);
      } else {
        addDecorCyl(obs.x - halfW - 0.025, topY - 0.035, obs.z, 0.03, obs.d - 0.02, brushedChromeMat, 'z');
        addDecorCyl(obs.x + halfW + 0.025, topY - 0.035, obs.z, 0.03, obs.d - 0.02, brushedChromeMat, 'z');
        addDecorBox(obs.x, obs.y, obs.z - halfD - 0.04, Math.max(0.2, obs.w - 0.04), Math.max(0.1, obs.h - 0.03), 0.07, darkSteelMat);
        addDecorBox(obs.x, obs.y, obs.z + halfD + 0.04, Math.max(0.2, obs.w - 0.04), Math.max(0.1, obs.h - 0.03), 0.07, darkSteelMat);
      }
    } else if (obs.type === 'wall') {
      const isPerimeter = Math.max(obs.w, obs.d) > 80;
      if (isPerimeter) {
        const alongX = obs.w > obs.d;
        const upperWallH = 6.5;
        const upperWallY = topY + upperWallH / 2;

        addDecorBox(obs.x, upperWallY, obs.z, obs.w, upperWallH, obs.d * 1.35, gunmetalFrameMat);
        addDecorBox(obs.x, 4.5, obs.z, obs.w + 0.1, 0.24, obs.d + 0.28, darkSteelMat);
        addDecorBox(obs.x, 9.1, obs.z, obs.w + 0.1, 0.26, obs.d + 0.34, hazardMat);
        addDecorBox(obs.x, topY + upperWallH - 0.2, obs.z, obs.w + 0.1, 0.32, obs.d + 0.38, darkSteelMat);

        const wallSpan = alongX ? obs.w : obs.d;
        for (let offset = -wallSpan / 2 + 8; offset <= wallSpan / 2 - 8; offset += 12) {
          if (alongX) {
            const inwardSign = obs.z > 0 ? -1 : 1;
            addDecorBox(obs.x + offset, 7.52, obs.z + inwardSign * 0.55, 1.4, 14.9, 1.2, darkSteelMat);
            addDecorBox(obs.x + offset, 13.5, obs.z + inwardSign * 0.9, 0.65, 0.45, 0.45, trimAccentMat);
          } else {
            const inwardSign = obs.x > 0 ? -1 : 1;
            addDecorBox(obs.x + inwardSign * 0.55, 7.52, obs.z + offset, 1.2, 14.9, 1.4, darkSteelMat);
            addDecorBox(obs.x + inwardSign * 0.9, 13.5, obs.z + offset, 0.45, 0.45, 0.65, trimAccentMat);
          }
        }
      } else {
        // Interior Precast Reinforced Concrete Bremer / Jersey Blast Wall
        // Flared stepped concrete base plinth + overhanging top coping cap (recessed from botY & topY)
        addDecorBox(obs.x, botY + 0.18, obs.z, obs.w + 0.32, 0.32, obs.d + 0.32, darkSteelMat);
        addDecorBox(obs.x, botY + 0.44, obs.z, obs.w + 0.18, 0.18, obs.d + 0.18, gunmetalFrameMat);
        addDecorBox(obs.x, topY - 0.15, obs.z, obs.w + 0.28, 0.24, obs.d + 0.28, darkSteelMat);
        addDecorCyl(obs.x, topY + 0.06, obs.z, 0.12, obs.w >= obs.d ? obs.w * 0.92 : obs.d * 0.92, gunmetalFrameMat, obs.w >= obs.d ? 'x' : 'z');

        const alongX = obs.w >= obs.d;
        const wallSpan = alongX ? obs.w : obs.d;
        // End-cap steel H-beam frames + intermediate concrete buttress pilasters
        const pilasterCount = Math.max(2, Math.floor(wallSpan / 2.6) + 1);
        for (let p = 0; p < pilasterCount; p++) {
          const t = pilasterCount === 1 ? 0 : -0.46 + (p / (pilasterCount - 1)) * 0.92;
          const posOff = t * wallSpan;
          if (alongX) {
            addDecorBox(obs.x + posOff, obs.y, obs.z, 0.34, Math.max(0.2, obs.h - 0.04), obs.d + 0.24, gunmetalFrameMat);
          } else {
            addDecorBox(obs.x, obs.y, obs.z + posOff, obs.w + 0.24, Math.max(0.2, obs.h - 0.04), 0.34, gunmetalFrameMat);
          }
        }

        // Rounded Woven-Burlap Sandbag Emplacements stacked snug against base plinth of cover walls
        const bagSpan = Math.max(obs.w, obs.d);
        if (bagSpan >= 5.5) {
          const bagCount = Math.min(5, Math.floor(bagSpan / 1.4));
          for (let b = 0; b < bagCount; b++) {
            const boff = -((bagCount - 1) * 0.5) * 1.12 + b * 1.12;
            const jitter = (b % 2 === 0 ? 1 : -1) * 0.05;
            if (alongX) {
              addDecorSandbag(obs.x + boff, botY + 0.18, obs.z + halfD + 0.18, true, 0.86, jitter);
              addDecorSandbag(obs.x + boff * 0.86, botY + 0.46, obs.z + halfD + 0.15, true, 0.80, -jitter);
              if (b < 3) {
                addDecorSandbag(obs.x + (b - 1) * 1.05, topY - 0.04, obs.z, true, 0.62, jitter * 0.8);
              }
            } else {
              addDecorSandbag(obs.x + halfW + 0.18, botY + 0.18, obs.z + boff, false, 0.86, jitter);
              addDecorSandbag(obs.x + halfW + 0.15, botY + 0.46, obs.z + boff * 0.86, false, 0.80, -jitter);
              if (b < 3) {
                addDecorSandbag(obs.x, topY - 0.04, obs.z + (b - 1) * 1.05, false, 0.62, jitter * 0.8);
              }
            }
          }
        }
      }
    }
  }

  // Corner Guard Watchtowers & Stadium Floodlight Banks
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const cx = sx * (halfSize - 0.5);
      const cz = sz * (halfSize - 0.5);
      addDecorBox(cx, 12, cz, 5.5, 24, 5.5, darkSteelMat);
      addDecorBox(cx, 21.5, cz, 7.2, 3.2, 7.2, gunmetalFrameMat);
      addDecorBox(cx, 23.4, cz, 7.6, 0.45, 7.6, hazardMat);
      addDecorBox(cx, 25.5, cz, 2.2, 1.8, 2.2, trimAccentMat);
    }
  }

  buildMapLandmarks(
    game,
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
      game.scene.add(instMesh);
      game.arenaDecorMeshes.push(instMesh);
    }
  }

  for (const batcher of game.propBatchers) batcher.flush(game, true);

  // Low tier: draw the obstacles as ONE merged mesh per material. The original per-obstacle meshes stay in
  // game.worldMeshes (raycast / hit-decal targets are unchanged; three's Raycaster ignores `visible`) but are not rendered.
  game.mergedWorldMeshes = [];
  if (preset.mergeWorldMeshes) {
    const byMat = new Map();
    for (const m of game.worldMeshes.slice(1)) {
      if (!m.visible) continue;
      if (!byMat.has(m.material)) byMat.set(m.material, []);
      byMat.get(m.material).push(m);
    }
    for (const [mat, list] of byMat) {
      const merged = new THREE.Mesh(mergeMeshGeometries(list), mat);
      merged.castShadow = false;
      merged.receiveShadow = false;
      merged.matrixAutoUpdate = false;
      game.scene.add(merged);
      game.arenaDecorMeshes.push(merged);
      game.mergedWorldMeshes.push(merged);
      for (const m of list) m.visible = false;
    }
  }

  game.rebuildHitboxList?.();
}
