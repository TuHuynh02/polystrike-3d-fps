// Production 3D Arena Environment, Realistic Procedural PBR Textures, Sky Dome & Landmarks
// Weathered concrete tarmac, corrugated ISO shipping containers, military ordnance crates, and industrial skyline

import * as THREE from '../vendor/three/three.module.js';

export function buildSkyAndAtmosphere(game, theme = {}, halfSize = 60) {
  // 1. High-Resolution Atmospheric Sky Dome with Cloud Layers, Sun Corona & Distant Horizon Ridge
  const skyCanvas = document.createElement('canvas');
  skyCanvas.width = 1024;
  skyCanvas.height = 512;
  const ctx = skyCanvas.getContext('2d');

  const isDesert = theme.floorBase === '#27170c';
  const isLab = theme.floorBase === '#0b0f1e';

  const grad = ctx.createLinearGradient(0, 0, 0, 512);
  if (isDesert) {
    grad.addColorStop(0.0, '#0f172a');
    grad.addColorStop(0.38, '#1e293b');
    grad.addColorStop(0.68, '#78350f');
    grad.addColorStop(0.86, '#b45309');
    grad.addColorStop(1.0, '#291509');
  } else if (isLab) {
    grad.addColorStop(0.0, '#050811');
    grad.addColorStop(0.42, '#0f172a');
    grad.addColorStop(0.75, '#1e293b');
    grad.addColorStop(0.90, '#334155');
    grad.addColorStop(1.0, '#0b0f1e');
  } else {
    grad.addColorStop(0.0, '#09101d');
    grad.addColorStop(0.36, '#16243b');
    grad.addColorStop(0.68, '#2b4263');
    grad.addColorStop(0.85, '#526882');
    grad.addColorStop(1.0, '#111827');
  }
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 1024, 512);

  // Layered atmospheric stratus / cumulus clouds across mid-horizon
  for (let c = 0; c < 18; c++) {
    const cx = ((c * 137) % 1024);
    const cy = 220 + ((c * 43) % 120);
    const rx = 90 + (c % 4) * 45;
    const ry = 22 + (c % 3) * 12;
    const cloudGrad = ctx.createRadialGradient(cx, cy, 4, cx, cy, rx);
    cloudGrad.addColorStop(0, isDesert ? 'rgba(251, 191, 36, 0.14)' : 'rgba(226, 232, 240, 0.13)');
    cloudGrad.addColorStop(0.6, isDesert ? 'rgba(180, 83, 9, 0.06)' : 'rgba(148, 163, 184, 0.05)');
    cloudGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = cloudGrad;
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // Subtle high-altitude stars in upper zenith
  for (let i = 0; i < 160; i++) {
    const sx = ((i * 97 + 13) % 1024);
    const sy = ((i * 53 + 7) % 190);
    const r = i % 7 === 0 ? 1.3 : 0.8;
    ctx.fillStyle = 'rgba(241, 245, 249, 0.48)';
    ctx.beginPath();
    ctx.arc(sx, sy, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // Warm Atmospheric Sun Disc & Mie Scattering Halo
  const sunX = 280;
  const sunY = 285;
  const sunHalo = ctx.createRadialGradient(sunX, sunY, 6, sunX, sunY, 110);
  sunHalo.addColorStop(0.0, 'rgba(255, 251, 235, 0.96)');
  sunHalo.addColorStop(0.18, 'rgba(253, 224, 71, 0.52)');
  sunHalo.addColorStop(0.48, 'rgba(245, 158, 11, 0.18)');
  sunHalo.addColorStop(1.0, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = sunHalo;
  ctx.beginPath();
  ctx.arc(sunX, sunY, 110, 0, Math.PI * 2);
  ctx.fill();

  // Distant Mountain Range Silhouette along Horizon
  ctx.fillStyle = 'rgba(9, 13, 20, 0.72)';
  ctx.beginPath();
  ctx.moveTo(0, 435);
  for (let x = 0; x <= 1024; x += 32) {
    const mh = 392 + Math.sin(x * 0.018) * 18 + Math.cos(x * 0.045) * 11;
    ctx.lineTo(x, mh);
  }
  ctx.lineTo(1024, 512);
  ctx.lineTo(0, 512);
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

  // 2. Industrial / Military Perimeter Compounds & Radio Masts around Arena
  const towerMat = new THREE.MeshStandardMaterial({
    color: 0x161b22,
    roughness: 0.76,
    metalness: 0.28
  });
  const towerTrimMat = new THREE.MeshStandardMaterial({
    color: 0x242c37,
    roughness: 0.62,
    metalness: 0.42
  });
  const warmLightStripMat = new THREE.MeshBasicMaterial({ color: 0xe5a024 });
  const beaconRedMat = new THREE.MeshBasicMaterial({ color: 0xef4444 });
  game.arenaMaterials.add(towerMat);
  game.arenaMaterials.add(towerTrimMat);
  game.arenaMaterials.add(warmLightStripMat);
  game.arenaMaterials.add(beaconRedMat);

  const sharedSkyBoxGeo = new THREE.BoxGeometry(1, 1, 1);
  const sharedSpireGeo = new THREE.CylinderGeometry(0.16, 0.48, 1, 6);
  game.arenaGeometries.add(sharedSkyBoxGeo);
  game.arenaGeometries.add(sharedSpireGeo);

  const towerCount = 28;
  const ringRadius = halfSize + 25;
  for (let i = 0; i < towerCount; i++) {
    const angle = (i / towerCount) * Math.PI * 2;
    const dist = ringRadius + (i % 3) * 14;
    const tx = Math.cos(angle) * dist;
    const tz = Math.sin(angle) * dist;
    const th = 24 + ((i * 11) % 34);
    const tw = 10 + (i % 4) * 3.4;

    // Lower concrete industrial warehouse base
    const baseTier = new THREE.Mesh(sharedSkyBoxGeo, towerTrimMat);
    baseTier.scale.set(tw * 1.26, th * 0.40, tw * 1.26);
    baseTier.position.set(tx, (th * 0.40) / 2 - 2, tz);
    game.scene.add(baseTier);
    game.arenaDecorMeshes.push(baseTier);

    // Main concrete/steel structure shaft
    const tower = new THREE.Mesh(sharedSkyBoxGeo, towerMat);
    tower.scale.set(tw, th, tw);
    tower.position.set(tx, th / 2 - 2, tz);
    game.scene.add(tower);
    game.arenaDecorMeshes.push(tower);

    // Subtle warm industrial security light band near roofline
    const crown = new THREE.Mesh(sharedSkyBoxGeo, warmLightStripMat);
    crown.scale.set(tw + 0.25, 0.35, tw + 0.25);
    crown.position.set(tx, th - 3.6, tz);
    game.scene.add(crown);
    game.arenaDecorMeshes.push(crown);

    // Rooftop comms mast & red aviation warning beacon on every 2nd structure
    if (i % 2 === 0) {
      const spireH = 9 + (i % 3) * 4;
      const spire = new THREE.Mesh(sharedSpireGeo, towerTrimMat);
      spire.scale.set(1, spireH, 1);
      spire.position.set(tx, th - 2 + spireH / 2, tz);
      game.scene.add(spire);
      game.arenaDecorMeshes.push(spire);

      const beacon = new THREE.Mesh(sharedSkyBoxGeo, beaconRedMat);
      beacon.scale.set(0.75, 0.75, 0.75);
      beacon.position.set(tx, th - 2 + spireH, tz);
      game.scene.add(beacon);
      game.arenaDecorMeshes.push(beacon);
    }
  }

  // 3. Subtle Sunlit Atmospheric Dust Motes inside Arena
  const pCount = 220;
  const span = halfSize * 1.85;
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

export function createGridTexture(game, theme = {}, halfSize = 60) {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 1024;
  const ctx = canvas.getContext('2d');

  const isDesert = theme.floorBase === '#27170c';
  const baseHex = isDesert ? '#3d3024' : '#262b33';
  const altHex = isDesert ? '#47382a' : '#2d333d';

  ctx.fillStyle = baseHex;
  ctx.fillRect(0, 0, 1024, 1024);

  // Alternating poured concrete / asphalt tarmac slabs
  ctx.fillStyle = altHex;
  ctx.fillRect(6, 6, 500, 500);
  ctx.fillRect(518, 518, 500, 500);

  // High-frequency mineral aggregate speckle & weathered tarmac variation
  for (let i = 0; i < 3600; i++) {
    const rx = (i * 73 + 19) % 1024;
    const ry = (i * 127 + 31) % 1024;
    const sz = (i % 3) + 2;
    ctx.fillStyle = i % 2 === 0 ? 'rgba(255, 255, 255, 0.045)' : 'rgba(0, 0, 0, 0.065)';
    ctx.fillRect(rx, ry, sz, sz);
  }

  // Subtle weathered tire/oil smudge patches
  for (let w = 0; w < 10; w++) {
    const wx = ((w * 193 + 80) % 900) + 60;
    const wy = ((w * 251 + 60) % 900) + 60;
    const wGrad = ctx.createRadialGradient(wx, wy, 8, wx, wy, 90);
    wGrad.addColorStop(0, 'rgba(0, 0, 0, 0.14)');
    wGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = wGrad;
    ctx.fillRect(wx - 90, wy - 90, 180, 180);
  }

  // Poured Concrete Expansion Joint Seams (Dark Bitumen Sealant + Bevel Highlight)
  ctx.strokeStyle = 'rgba(10, 12, 16, 0.82)';
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

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
  ctx.lineWidth = 2;
  for (let i = 0; i <= 1024; i += 256) {
    ctx.beginPath();
    ctx.moveTo(i + 4, 0);
    ctx.lineTo(i + 4, 1024);
    ctx.moveTo(0, i + 4);
    ctx.lineTo(1024, i + 4);
    ctx.stroke();
  }

  // Faded Tactical Ochre/Yellow Painted Tarmac Safety Markings at slab intersections
  ctx.fillStyle = 'rgba(229, 160, 36, 0.42)';
  ctx.fillRect(496, 508, 32, 8);
  ctx.fillRect(508, 496, 8, 32);

  // Corner steel drainage grate / tie-down plates
  ctx.fillStyle = 'rgba(15, 20, 28, 0.65)';
  for (const bx of [32, 480, 544, 992]) {
    for (const by of [32, 480, 544, 992]) {
      ctx.fillRect(bx - 6, by - 6, 12, 12);
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
  for (let i = 0; i < 2400; i++) {
    const rx = (i * 59 + 11) % 512;
    const ry = (i * 97 + 23) % 512;
    ctx.fillStyle = i % 2 === 0 ? '#969696' : '#686868';
    ctx.fillRect(rx, ry, 2, 2);
  }

  // Recessed concrete slab expansion joints
  ctx.strokeStyle = '#242424';
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

  // Map obstacle colors into grounded military concrete, weathered shipping containers, and timber ordnance crates
  const base = new THREE.Color(hexColor);
  const hsl = { h: 0, s: 0, l: 0 };
  base.getHSL(hsl);
  if (type === 'wall' || type === 'platform') {
    base.setHSL(hsl.h, Math.min(hsl.s, 0.14), Math.max(0.25, Math.min(0.40, hsl.l * 1.12)));
  } else if (type === 'container') {
    // Shift neon pink/magenta/purple hues into industrial Corten rust-red or navy steel
    let containerH = hsl.h;
    if (containerH > 0.72 && containerH < 0.96) {
      containerH = 0.04; // Corten rust-red
    }
    base.setHSL(containerH, Math.min(hsl.s, 0.42), Math.max(0.22, Math.min(0.38, hsl.l)));
  } else if (type === 'crate') {
    // Authentic military timber / olive-wood palette for wooden ordnance crates
    const timberPalette = [0x6b4c35, 0x4a5238, 0x5a422e, 0x785c3c];
    const numericHex = typeof hexColor === 'number' ? hexColor : parseInt(String(hexColor).replace('#', ''), 16) || 0;
    base.setHex(timberPalette[Math.abs(numericHex) % timberPalette.length]);
  }

  ctx.fillStyle = `#${base.getHexString()}`;
  ctx.fillRect(0, 0, 512, 512);

  // Subtle surface grain & ambient occlusion gradient
  for (let i = 0; i < 1400; i++) {
    const rx = (i * 67 + 13) % 512;
    const ry = (i * 109 + 29) % 512;
    ctx.fillStyle = i % 2 === 0 ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.045)';
    ctx.fillRect(rx, ry, 3, 3);
  }

  const vGrad = ctx.createLinearGradient(0, 0, 0, 512);
  vGrad.addColorStop(0.0, 'rgba(255, 255, 255, 0.10)');
  vGrad.addColorStop(0.65, 'rgba(0, 0, 0, 0.0)');
  vGrad.addColorStop(1.0, 'rgba(0, 0, 0, 0.36)');
  ctx.fillStyle = vGrad;
  ctx.fillRect(0, 0, 512, 512);

  if (type === 'container') {
    // Deep Corrugated Steel Shipping Container Ribs
    for (let x = 0; x < 512; x += 24) {
      ctx.fillStyle = x % 48 === 0 ? 'rgba(0, 0, 0, 0.34)' : 'rgba(255, 255, 255, 0.12)';
      ctx.fillRect(x, 26, 11, 460);
      ctx.fillStyle = 'rgba(0, 0, 0, 0.16)';
      ctx.fillRect(x + 11, 26, 3, 460);
    }

    // Subtle Corten Steel Weathering & Rain Streaks
    for (let w = 0; w < 14; w++) {
      const wx = ((w * 89 + 24) % 460) + 26;
      ctx.fillStyle = w % 2 === 0 ? 'rgba(68, 32, 16, 0.14)' : 'rgba(15, 20, 28, 0.16)';
      ctx.fillRect(wx, 28, 8, 120 + (w % 4) * 70);
    }

    // Heavy Welded Outer ISO Steel Frame
    ctx.strokeStyle = 'rgba(17, 24, 39, 0.88)';
    ctx.lineWidth = 28;
    ctx.strokeRect(0, 0, 512, 512);

    // Stenciled Military Logistics Identification Plate
    ctx.fillStyle = 'rgba(15, 20, 28, 0.76)';
    ctx.fillRect(42, 208, 428, 76);
    ctx.strokeStyle = 'rgba(226, 232, 240, 0.35)';
    ctx.lineWidth = 2;
    ctx.strokeRect(42, 208, 428, 76);

    ctx.fillStyle = 'rgba(241, 245, 249, 0.88)';
    ctx.font = '800 28px "Chakra Petch", "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('NATO // LOG-CARGO 40HC', 256, 246);
    ctx.font = '700 15px Consolas, monospace';
    ctx.fillStyle = 'rgba(229, 160, 36, 0.88)';
    ctx.fillText('MAX GROSS 30,480 KG  •  TARE 3,800 KG', 256, 270);

    // Bottom Forklift Pockets & Rust/Scuff Wear
    ctx.fillStyle = 'rgba(12, 15, 20, 0.85)';
    ctx.fillRect(140, 482, 68, 22);
    ctx.fillRect(304, 482, 68, 22);
  } else if (type === 'crate') {
    // Horizontal Wood Grain Fiber Streaks & Timber Knots
    for (let g = 0; g < 160; g++) {
      const gx = (g * 53 + 17) % 440 + 36;
      const gy = (g * 29 + 39) % 430 + 40;
      const glen = 28 + (g % 5) * 18;
      ctx.fillStyle = g % 3 === 0 ? 'rgba(25, 16, 8, 0.18)' : 'rgba(255, 235, 205, 0.06)';
      ctx.fillRect(gx, gy, Math.min(glen, 472 - gx), 2);
    }

    // Military Timber Ordnance Supply Crate with Bolted Steel Framing
    ctx.strokeStyle = 'rgba(20, 24, 30, 0.90)';
    ctx.lineWidth = 34;
    ctx.strokeRect(16, 16, 480, 480);

    // Horizontal Plank Slats
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.44)';
    ctx.lineWidth = 4;
    for (let y = 72; y < 448; y += 54) {
      ctx.beginPath();
      ctx.moveTo(42, y);
      ctx.lineTo(470, y);
      ctx.stroke();
    }

    // Diagonal Timber Cross-Braces with Dark Edge Outline
    ctx.strokeStyle = 'rgba(18, 12, 8, 0.45)';
    ctx.lineWidth = 30;
    ctx.beginPath();
    ctx.moveTo(58, 58);
    ctx.lineTo(454, 454);
    ctx.moveTo(454, 58);
    ctx.lineTo(58, 454);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(255, 240, 215, 0.14)';
    ctx.lineWidth = 22;
    ctx.beginPath();
    ctx.moveTo(58, 58);
    ctx.lineTo(454, 454);
    ctx.moveTo(454, 58);
    ctx.lineTo(58, 454);
    ctx.stroke();

    // Central Stenciled Military Ammunition Plate
    ctx.fillStyle = 'rgba(15, 19, 25, 0.90)';
    ctx.fillRect(126, 204, 260, 104);
    ctx.strokeStyle = 'rgba(229, 160, 36, 0.78)';
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
        ctx.fillRect(cx - 8, cy - 8, 16, 16);
      }
    }
  } else if (type === 'pillar') {
    // Structural Concrete & Steel H-Beam Column with Hazard Base
    ctx.strokeStyle = 'rgba(15, 23, 42, 0.85)';
    ctx.lineWidth = 22;
    ctx.strokeRect(12, 12, 488, 488);

    ctx.fillStyle = 'rgba(30, 36, 46, 0.65)';
    ctx.fillRect(54, 36, 404, 440);

    // Vertical Steel Flange Seams & Rivets
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.45)';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(176, 24);
    ctx.lineTo(176, 488);
    ctx.moveTo(336, 24);
    ctx.lineTo(336, 488);
    ctx.stroke();

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
  } else {
    // Poured Reinforced Concrete Blast Wall / Bremer Wall with Formwork Seams & Tie-Rod Holes
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
    ctx.lineWidth = 8;
    ctx.strokeRect(4, 4, 504, 504);

    ctx.strokeStyle = 'rgba(0, 0, 0, 0.45)';
    ctx.lineWidth = 5;
    ctx.strokeRect(20, 20, 472, 472);

    ctx.beginPath();
    ctx.moveTo(20, 256);
    ctx.lineTo(492, 256);
    ctx.moveTo(256, 20);
    ctx.lineTo(256, 492);
    ctx.stroke();

    // Concrete Formwork Tie-Rod Recesses
    ctx.fillStyle = 'rgba(10, 14, 20, 0.72)';
    for (const tx of [84, 196, 316, 428]) {
      for (const ty of [84, 196, 316, 428]) {
        ctx.beginPath();
        ctx.arc(tx, ty, 6, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Faded Ochre Caution Curb Markers at bottom
    ctx.fillStyle = 'rgba(229, 160, 36, 0.58)';
    for (let wx = 36; wx < 476; wx += 52) {
      ctx.fillRect(wx, 458, 28, 14);
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

  // Subtle surface grain
  for (let i = 0; i < 900; i++) {
    const rx = (i * 43 + 7) % 256;
    const ry = (i * 71 + 19) % 256;
    ctx.fillStyle = i % 2 === 0 ? '#929292' : '#6e6e6e';
    ctx.fillRect(rx, ry, 2, 2);
  }

  if (type === 'container') {
    for (let x = 0; x < 256; x += 12) {
      ctx.fillStyle = x % 24 === 0 ? '#282828' : '#d8d8d8';
      ctx.fillRect(x, 12, 6, 232);
    }
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 14;
    ctx.strokeRect(0, 0, 256, 256);
  } else if (type === 'crate') {
    ctx.strokeStyle = '#e0e0e0';
    ctx.lineWidth = 18;
    ctx.strokeRect(8, 8, 240, 240);
    ctx.fillStyle = '#484848';
    ctx.fillRect(28, 28, 200, 200);
    ctx.strokeStyle = '#222222';
    ctx.lineWidth = 3;
    for (let y = 36; y < 224; y += 27) {
      ctx.beginPath();
      ctx.moveTo(24, y);
      ctx.lineTo(232, y);
      ctx.stroke();
    }
    ctx.strokeStyle = '#c8c8c8';
    ctx.lineWidth = 12;
    ctx.beginPath();
    ctx.moveTo(32, 32);
    ctx.lineTo(224, 224);
    ctx.moveTo(224, 32);
    ctx.lineTo(32, 224);
    ctx.stroke();
  } else {
    ctx.strokeStyle = '#d0d0d0';
    ctx.lineWidth = 6;
    ctx.strokeRect(4, 4, 248, 248);
    ctx.strokeStyle = '#282828';
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

    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.65, 4.2, 10), darkSteelMat);
    game.arenaGeometries.add(mast.geometry);
    dishGroup.add(mast);

    const dishGeo = new THREE.ConeGeometry(4.2, 1.8, 16, 1, true);
    game.arenaGeometries.add(dishGeo);
    const dishMesh = new THREE.Mesh(dishGeo, brushedChromeMat);
    dishMesh.rotation.x = Math.PI * 0.68;
    dishMesh.position.set(0, 1.6, 0.6);
    dishGroup.add(dishMesh);

    const emitter = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.6, 2.6), trimAccentMat);
    game.arenaGeometries.add(emitter.geometry);
    emitter.position.set(0, 2.2, 1.4);
    dishGroup.add(emitter);

    const wingL = new THREE.Mesh(new THREE.BoxGeometry(6.5, 0.18, 2.4), trimSecondaryMat);
    const wingR = new THREE.Mesh(new THREE.BoxGeometry(6.5, 0.18, 2.4), trimSecondaryMat);
    game.arenaGeometries.add(wingL.geometry);
    game.arenaGeometries.add(wingR.geometry);
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
            addDecorBox(qx + px, 4.6, qz + pz, 0.35, 4.4, 0.35, darkSteelMat);
          }
        }
        addDecorBox(qx, 6.9, qz, 11.4, 0.45, 11.4, gunmetalFrameMat, true);
        addDecorBox(qx, 7.2, qz, 11.6, 0.14, 11.6, trimAccentMat);
      }
    }
  } else if (mapId === 'neon_lab') {
    const accelTorusGeo = new THREE.TorusGeometry(10.5, 0.55, 12, 48);
    game.arenaGeometries.add(accelTorusGeo);
    const accelRing = new THREE.Mesh(accelTorusGeo, gunmetalFrameMat);
    accelRing.rotation.x = Math.PI / 2;
    accelRing.position.set(0, 13.5, 0);
    game.scene.add(accelRing);
    game.arenaDecorMeshes.push(accelRing);

    const coreTorusGeo = new THREE.TorusGeometry(9.8, 0.18, 8, 48);
    game.arenaGeometries.add(coreTorusGeo);
    const coreRing = new THREE.Mesh(coreTorusGeo, trimAccentMat);
    coreRing.rotation.x = Math.PI / 2;
    coreRing.position.set(0, 13.5, 0);
    game.scene.add(coreRing);
    game.arenaDecorMeshes.push(coreRing);

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
      addDecorBox(-6.2, 4.9, dirSign * archDist, 1.2, 3.8, 1.6, gunmetalFrameMat);
      addDecorBox(6.2, 4.9, dirSign * archDist, 1.2, 3.8, 1.6, gunmetalFrameMat);
    }
  }
}

export function buildArena(game, mapCfg = game?.currentMapConfig || {}) {
  const halfSize = mapCfg.arenaHalfSize || game?.arenaHalfSize || 60;
  const span = halfSize * 2;
  const theme = mapCfg.theme || {};

  // Ground Floor with high-res anisotropic weathered concrete/tarmac diffuse & bump relief
  const floorGeo = new THREE.PlaneGeometry(span, span);
  const floorMat = new THREE.MeshStandardMaterial({
    map: createGridTexture(game, theme, halfSize),
    bumpMap: createFloorBumpTexture(game, halfSize),
    bumpScale: 0.045,
    roughness: 0.78,
    metalness: 0.14
  });
  game.arenaMaterials.add(floorMat);
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
      const isMetal = type === 'container' || type === 'pillar';
      const isWoodCrate = type === 'crate';
      const m = new THREE.MeshStandardMaterial({
        map: createObstacleTexture(game, colorHex, type),
        bumpMap: getBump(type),
        bumpScale: isMetal ? 0.055 : 0.04,
        roughness: isMetal ? 0.44 : isWoodCrate ? 0.66 : 0.74,
        metalness: isMetal ? 0.62 : isWoodCrate ? 0.16 : 0.14
      });
      game.arenaMaterials.add(m);
      matCache.set(key, m);
    }
    return matCache.get(key);
  };

  const darkSteelMat = new THREE.MeshStandardMaterial({
    color: 0x161b22,
    roughness: 0.42,
    metalness: 0.78
  });
  const gunmetalFrameMat = new THREE.MeshStandardMaterial({
    color: 0x262f3d,
    roughness: 0.48,
    metalness: 0.64
  });
  const brushedChromeMat = new THREE.MeshStandardMaterial({
    color: 0x94a3b8,
    roughness: 0.28,
    metalness: 0.86
  });
  const hazardMat = new THREE.MeshStandardMaterial({
    color: 0xd97706,
    roughness: 0.48,
    metalness: 0.32
  });
  const sandbagCanvas = document.createElement('canvas');
  sandbagCanvas.width = 128;
  sandbagCanvas.height = 128;
  const sbCtx = sandbagCanvas.getContext('2d');
  sbCtx.fillStyle = '#867658';
  sbCtx.fillRect(0, 0, 128, 128);
  for (let y = 0; y < 128; y += 4) {
    sbCtx.fillStyle = y % 8 === 0 ? 'rgba(255,248,225,0.08)' : 'rgba(20,16,10,0.12)';
    sbCtx.fillRect(0, y, 128, 2);
  }
  for (let x = 0; x < 128; x += 4) {
    sbCtx.fillStyle = x % 8 === 0 ? 'rgba(255,248,225,0.06)' : 'rgba(20,16,10,0.10)';
    sbCtx.fillRect(x, 0, 2, 128);
  }
  sbCtx.strokeStyle = 'rgba(38, 30, 18, 0.55)';
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
    color: 0x948466,
    roughness: 0.90,
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
  game.arenaMaterials.add(sandbagMat);
  game.arenaMaterials.add(trimAccentMat);
  game.arenaMaterials.add(trimSecondaryMat);

  const unitBoxGeo = new THREE.BoxGeometry(1, 1, 1);
  const unitCylGeo = new THREE.CylinderGeometry(0.5, 0.5, 1, 10);
  const unitOctGeo = new THREE.OctahedronGeometry(0.55, 0);
  const unitSandbagGeo = new THREE.CapsuleGeometry(0.22, 0.58, 6, 10);
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

  const addDecorCyl = (x, y, z, radius, len, mat, axis = 'y') => {
    const rx = axis === 'z' ? Math.PI / 2 : 0;
    const rz = axis === 'x' ? Math.PI / 2 : 0;
    return registerInstancedItem(unitCylGeo, mat, x, y, z, radius * 2, len, radius * 2, rx, 0, rz, false);
  };

  const addDecorSandbag = (x, y, z, alongX = true, scale = 1.0, yawJitter = 0) => {
    if (alongX) {
      return registerInstancedItem(unitSandbagGeo, sandbagMat, x, y, z, 0.78 * scale, 1.05 * scale, 1.15 * scale, 0, yawJitter, Math.PI / 2, true);
    }
    return registerInstancedItem(unitSandbagGeo, sandbagMat, x, y, z, 1.15 * scale, 1.05 * scale, 0.78 * scale, Math.PI / 2, yawJitter, 0, true);
  };

  const buildContainerDetails = (cx, cy, cz, cw, ch, cd, mainMat, isUpperStack = false) => {
    const alongZ = cd >= cw;
    const halfW = cw / 2;
    const halfH = ch / 2;
    const halfD = cd / 2;

    const railThick = 0.16;
    for (const sy of [-1, 1]) {
      const ry = cy + sy * (halfH - 0.05);
      addDecorBox(cx, ry, cz - halfD, cw + 0.08, railThick, railThick, darkSteelMat);
      addDecorBox(cx, ry, cz + halfD, cw + 0.08, railThick, railThick, darkSteelMat);
      addDecorBox(cx - halfW, ry, cz, railThick, railThick, cd + 0.08, darkSteelMat);
      addDecorBox(cx + halfW, ry, cz, railThick, railThick, cd + 0.08, darkSteelMat);
    }

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

    for (const endSign of [-1, 1]) {
      if (alongZ) {
        const ez = cz + endSign * (halfD + 0.025);
        addDecorBox(cx, cy, ez, 0.08, ch - 0.3, 0.06, darkSteelMat);
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

    if (!isUpperStack) {
      addDecorBox(cx, cy + halfH + 0.14, cz, cw * 0.55, 0.26, cd * 0.35, gunmetalFrameMat);
    }
  };

  // Authentic Military & Maritime Container Palette (Rust Red, Navy Blue, Olive Drab, Ochre Tan, Slate)
  const stackColors = [0x2b4c65, 0x7c2d12, 0x3f4d3b, 0x92400e, 0x334155];
  let containerIdx = 0;

  for (const obs of mapCfg.obstacles) {
    const mainMat = getMat(obs.color, obs.type);
    const geo = new THREE.BoxGeometry(obs.w, obs.h, obs.d);
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
    } else if (obs.type === 'crate') {
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

      addDecorBox(obs.x, topY + 0.05, obs.z, obs.w * 0.68, 0.08, obs.d * 0.68, gunmetalFrameMat);
      addDecorBox(obs.x, obs.y + 0.05, obs.z - halfD - 0.03, obs.w * 0.45, 0.09, 0.04, hazardMat);
      addDecorBox(obs.x, obs.y + 0.05, obs.z + halfD + 0.03, obs.w * 0.45, 0.09, 0.04, hazardMat);
    } else if (obs.type === 'pillar') {
      addDecorBox(obs.x, botY + 0.25, obs.z, obs.w + 0.55, 0.5, obs.d + 0.55, darkSteelMat);
      addDecorBox(obs.x, botY + 0.62, obs.z, obs.w + 0.28, 0.28, obs.d + 0.28, gunmetalFrameMat);
      addDecorBox(obs.x, topY - 0.22, obs.z, obs.w + 0.45, 0.44, obs.d + 0.45, darkSteelMat);

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

      const spireH = Math.abs(obs.x) < 2 && Math.abs(obs.z) < 2 ? 10.5 : 7.5;
      addDecorBox(obs.x, topY + spireH / 2, obs.z, obs.w * 0.52, spireH, obs.d * 0.52, darkSteelMat, true);
      addDecorBox(obs.x, topY + spireH * 0.45, obs.z, obs.w * 0.88, 0.38, obs.d * 0.88, gunmetalFrameMat);
      addDecorBox(obs.x, topY + spireH * 0.82, obs.z, obs.w * 0.72, 0.32, obs.d * 0.72, trimAccentMat);

      if (Math.abs(obs.x) < 2 && Math.abs(obs.z) < 2) {
        for (let r = 0; r < 2; r++) {
          const ringGeo = new THREE.TorusGeometry(2.4 + r * 0.65, 0.08, 10, 28);
          game.arenaGeometries.add(ringGeo);
          const ring = new THREE.Mesh(ringGeo, r % 2 === 0 ? trimAccentMat : gunmetalFrameMat);
          ring.position.set(obs.x, topY + 1.4 + r * 2.2, obs.z);
          game.scene.add(ring);
          game.arenaDecorMeshes.push(ring);
          game.citadelRings.push(ring);
        }
      }
    } else if (obs.type === 'platform') {
      addDecorBox(obs.x, topY - 0.14, obs.z, obs.w + 0.36, 0.28, obs.d + 0.36, darkSteelMat);
      addDecorBox(obs.x, topY - 0.04, obs.z, obs.w + 0.40, 0.08, obs.d + 0.40, hazardMat);
      addDecorBox(obs.x, botY + 0.12, obs.z, obs.w + 0.25, 0.22, obs.d + 0.25, gunmetalFrameMat);

      for (const sx of [-1, 1]) {
        for (const sz of [-1, 1]) {
          const bx = obs.x + sx * (halfW - 0.35);
          const bz = obs.z + sz * (halfD - 0.35);
          addDecorBox(bx, obs.y + 0.28, bz, 0.85, obs.h + 0.56, 0.85, darkSteelMat);
          addDecorBox(bx, topY + 0.34, bz, 0.52, 0.18, 0.52, gunmetalFrameMat);
        }
      }
    } else if (obs.type === 'step') {
      addDecorBox(obs.x, topY - 0.03, obs.z, obs.w + 0.04, 0.06, obs.d + 0.04, brushedChromeMat);
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
            addDecorBox(obs.x + offset, 7.5, obs.z + inwardSign * 0.55, 1.4, 15.0, 1.2, darkSteelMat);
            addDecorBox(obs.x + offset, 13.5, obs.z + inwardSign * 0.9, 0.65, 0.45, 0.45, trimAccentMat);
          } else {
            const inwardSign = obs.x > 0 ? -1 : 1;
            addDecorBox(obs.x + inwardSign * 0.55, 7.5, obs.z + offset, 1.2, 15.0, 1.4, darkSteelMat);
            addDecorBox(obs.x + inwardSign * 0.9, 13.5, obs.z + offset, 0.45, 0.45, 0.65, trimAccentMat);
          }
        }
      } else {
        // Interior Tactical Blast Wall with Concrete Coping & Sandbag Top Emplacement
        addDecorBox(obs.x, botY + 0.16, obs.z, obs.w + 0.22, 0.32, obs.d + 0.22, darkSteelMat);
        addDecorBox(obs.x, topY - 0.12, obs.z, obs.w + 0.26, 0.26, obs.d + 0.26, darkSteelMat);
        addDecorBox(obs.x, topY + 0.04, obs.z, obs.w * 0.92, 0.08, obs.d * 0.92, gunmetalFrameMat);

        const alongX = obs.w >= obs.d;
        for (const endSign of [-1, 1]) {
          if (alongX) {
            addDecorBox(obs.x + endSign * (halfW - 0.2), obs.y, obs.z, 0.45, obs.h + 0.08, obs.d + 0.28, gunmetalFrameMat);
          } else {
            addDecorBox(obs.x, obs.y, obs.z + endSign * (halfD - 0.2), obs.w + 0.28, obs.h + 0.08, 0.45, gunmetalFrameMat);
          }
        }

        // Rounded Woven-Burlap Sandbag Emplacements stacked along base of tactical cover walls
        const bagSpan = Math.max(obs.w, obs.d);
        if (bagSpan >= 5.5) {
          const bagCount = Math.min(5, Math.floor(bagSpan / 1.4));
          for (let b = 0; b < bagCount; b++) {
            const boff = -((bagCount - 1) * 0.5) * 1.12 + b * 1.12;
            const jitter = ((b % 2 === 0 ? 1 : -1) * 0.06);
            if (alongX) {
              addDecorSandbag(obs.x + boff, botY + 0.20, obs.z + halfD + 0.32, true, 1.0, jitter);
              addDecorSandbag(obs.x + boff * 0.86, botY + 0.52, obs.z + halfD + 0.29, true, 0.94, -jitter);
            } else {
              addDecorSandbag(obs.x + halfW + 0.32, botY + 0.20, obs.z + boff, false, 1.0, jitter);
              addDecorSandbag(obs.x + halfW + 0.29, botY + 0.52, obs.z + boff * 0.86, false, 0.94, -jitter);
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

  const ringGeo = new THREE.RingGeometry(7.2, 7.55, 4);
  game.arenaGeometries.add(ringGeo);
  const ringMat = new THREE.MeshBasicMaterial({
    color: 0xe5a024,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.65
  });
  game.arenaMaterials.add(ringMat);
  const ringMesh = new THREE.Mesh(ringGeo, ringMat);
  ringMesh.rotation.x = -Math.PI / 2;
  ringMesh.rotation.z = Math.PI / 4;
  ringMesh.position.set(0, 2.43, 0);
  ringMesh.updateMatrix();
  ringMesh.matrixAutoUpdate = false;
  game.scene.add(ringMesh);
  game.arenaDecorMeshes.push(ringMesh);

  game.rebuildHitboxList?.();
}
