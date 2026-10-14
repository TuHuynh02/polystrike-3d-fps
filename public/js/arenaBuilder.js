// 3D Arena Environment, Procedural Textures, Sky Dome, and Architectural Landmark Builder

import * as THREE from '../vendor/three/three.module.js';

export function buildSkyAndAtmosphere(game, theme = {}, halfSize = 60) {
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
  game.scene.add(skyDome);
  game.skyObjects.push(skyDome);

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
  game.arenaMaterials.add(towerMat);
  game.arenaMaterials.add(towerTrimMat);
  game.arenaMaterials.add(neonStripMat);
  game.arenaMaterials.add(amberStripMat);

  const sharedSkyBoxGeo = new THREE.BoxGeometry(1, 1, 1);
  const sharedSpireGeo = new THREE.CylinderGeometry(0.18, 0.55, 1, 6);
  game.arenaGeometries.add(sharedSkyBoxGeo);
  game.arenaGeometries.add(sharedSpireGeo);

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
    game.scene.add(baseTier);
    game.arenaDecorMeshes.push(baseTier);

    // Main stepped skyscraper shaft
    const tower = new THREE.Mesh(sharedSkyBoxGeo, towerMat);
    tower.scale.set(tw, th, tw);
    tower.position.set(tx, th / 2 - 2, tz);
    game.scene.add(tower);
    game.arenaDecorMeshes.push(tower);

    // Upper crown collar + dual neon horizon bands
    const crown = new THREE.Mesh(sharedSkyBoxGeo, activeNeonMat);
    crown.scale.set(tw + 0.45, 0.9, tw + 0.45);
    crown.position.set(tx, th - 4.2, tz);
    game.scene.add(crown);
    game.arenaDecorMeshes.push(crown);

    const midBand = new THREE.Mesh(sharedSkyBoxGeo, activeNeonMat);
    midBand.scale.set(tw + 0.3, 0.5, tw + 0.3);
    midBand.position.set(tx, th * 0.58, tz);
    game.scene.add(midBand);
    game.arenaDecorMeshes.push(midBand);

    // Vertical neon architectural fin on front face
    const vFin = new THREE.Mesh(sharedSkyBoxGeo, activeNeonMat);
    vFin.scale.set(0.65, th * 0.72, tw + 0.35);
    vFin.position.set(tx, th * 0.48, tz);
    game.scene.add(vFin);
    game.arenaDecorMeshes.push(vFin);

    // Rooftop comms antenna spire & beacon on every 2nd skyscraper
    if (i % 2 === 0) {
      const spireH = 10 + (i % 3) * 4;
      const spire = new THREE.Mesh(sharedSpireGeo, towerTrimMat);
      spire.scale.set(1, spireH, 1);
      spire.position.set(tx, th - 2 + spireH / 2, tz);
      game.scene.add(spire);
      game.arenaDecorMeshes.push(spire);

      const beacon = new THREE.Mesh(sharedSkyBoxGeo, activeNeonMat);
      beacon.scale.set(1.1, 1.1, 1.1);
      beacon.position.set(tx, th - 2 + spireH, tz);
      game.scene.add(beacon);
      game.arenaDecorMeshes.push(beacon);
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
  game.ambientParticles = new THREE.Points(pGeo, pMat);
  game.scene.add(game.ambientParticles);
  game.skyObjects.push(game.ambientParticles);
}

export function createGridTexture(game, theme = {}, halfSize = 60) {
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
  game.arenaTextures.add(tex);
  return tex;
}

export function createObstacleTexture(game, hexColor, type = 'wall') {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');

  const base = new THREE.Color(hexColor);
  ctx.fillStyle = `#${base.getHexString()}`;
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
    ctx.strokeStyle = 'rgba(15, 23, 42, 0.85)';
    ctx.lineWidth = 28;
    ctx.strokeRect(0, 0, 512, 512);

    ctx.fillStyle = 'rgba(15, 23, 42, 0.55)';
    ctx.fillRect(36, 212, 440, 74);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
    ctx.lineWidth = 3;
    ctx.strokeRect(36, 212, 440, 74);

    ctx.fillStyle = 'rgba(248, 250, 252, 0.88)';
    ctx.font = '900 32px Segoe UI, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('POLY-CARGO // HVY-08', 256, 260);

    ctx.fillStyle = 'rgba(250, 204, 21, 0.75)';
    for (let hx = 40; hx < 460; hx += 36) {
      ctx.fillRect(hx, 468, 18, 14);
    }
  } else if (type === 'crate') {
    ctx.strokeStyle = 'rgba(15, 23, 42, 0.86)';
    ctx.lineWidth = 36;
    ctx.strokeRect(18, 18, 476, 476);

    ctx.fillStyle = 'rgba(0, 0, 0, 0.28)';
    ctx.fillRect(64, 64, 384, 384);

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.26)';
    ctx.lineWidth = 22;
    ctx.beginPath();
    ctx.moveTo(64, 64);
    ctx.lineTo(448, 448);
    ctx.moveTo(448, 64);
    ctx.lineTo(64, 448);
    ctx.stroke();

    ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
    ctx.fillRect(156, 210, 200, 92);
    ctx.strokeStyle = 'rgba(250, 204, 21, 0.8)';
    ctx.lineWidth = 4;
    ctx.strokeRect(156, 210, 200, 92);
    ctx.fillStyle = '#facc15';
    ctx.font = 'bold 26px Segoe UI, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('TAC-SUPPLY', 256, 265);

    ctx.fillStyle = '#e2e8f0';
    [42, 470].forEach((cx) => {
      [42, 470].forEach((cy) => {
        ctx.fillRect(cx - 8, cy - 8, 16, 16);
      });
    });
  } else if (type === 'pillar') {
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.72)';
    ctx.lineWidth = 10;
    ctx.strokeRect(26, 26, 460, 460);

    ctx.fillStyle = 'rgba(15, 23, 42, 0.6)';
    ctx.fillRect(60, 40, 392, 432);

    ctx.strokeStyle = 'rgba(56, 189, 248, 0.85)';
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.moveTo(180, 26);
    ctx.lineTo(180, 486);
    ctx.moveTo(332, 26);
    ctx.lineTo(332, 486);
    ctx.stroke();

    ctx.fillStyle = 'rgba(255, 255, 255, 0.18)';
    for (let py = 80; py < 460; py += 90) {
      ctx.fillRect(36, py, 440, 14);
    }
  } else {
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.lineWidth = 12;
    ctx.strokeRect(6, 6, 500, 500);

    ctx.strokeStyle = 'rgba(0, 0, 0, 0.45)';
    ctx.lineWidth = 8;
    ctx.strokeRect(28, 28, 456, 456);

    ctx.beginPath();
    ctx.moveTo(28, 256);
    ctx.lineTo(484, 256);
    ctx.moveTo(256, 28);
    ctx.lineTo(256, 484);
    ctx.stroke();

    ctx.fillStyle = 'rgba(245, 158, 11, 0.55)';
    for (let wx = 36; wx < 476; wx += 48) {
      ctx.fillRect(wx, 452, 24, 18);
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
    // 2 Massive Industrial Port Gantry Cranes spanning West & East Dockyards (23m tall!)
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

    addDecorCyl(0, 22, 0, 0.55, 32, trimAccentMat, 'y');
  } else {
    addDecorCyl(0, 22, 0, 0.48, 34, trimAccentMat, 'y');

    const archDist = 24;
    for (const dirSign of [-1, 1]) {
      addDecorBox(0, 6.8, dirSign * archDist, 14.5, 1.1, 1.6, darkSteelMat, true);
      addDecorBox(0, 7.45, dirSign * archDist, 14.8, 0.24, 1.8, trimAccentMat);
      addDecorBox(-6.2, 4.9, dirSign * archDist, 1.2, 3.8, 1.6, gunmetalFrameMat);
      addDecorBox(6.2, 4.9, dirSign * archDist, 1.2, 3.8, 1.6, gunmetalFrameMat);
    }
  }
}

export function buildArena(game, mapCfg) {
  const halfSize = mapCfg.arenaHalfSize || 60;
  const span = halfSize * 2;
  const theme = mapCfg.theme || {};

  // Ground Floor with high-res anisotropic diffuse & bump relief
  const floorGeo = new THREE.PlaneGeometry(span, span);
  const floorMat = new THREE.MeshStandardMaterial({
    map: createGridTexture(game, theme, halfSize),
    bumpMap: createFloorBumpTexture(game, halfSize),
    bumpScale: 0.04,
    roughness: 0.62,
    metalness: 0.32
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
      const m = new THREE.MeshStandardMaterial({
        map: createObstacleTexture(game, colorHex, type),
        bumpMap: getBump(type),
        bumpScale: isMetal ? 0.05 : 0.035,
        roughness: isMetal ? 0.36 : 0.54,
        metalness: isMetal ? 0.62 : 0.26
      });
      game.arenaMaterials.add(m);
      matCache.set(key, m);
    }
    return matCache.get(key);
  };

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

  game.arenaMaterials.add(darkSteelMat);
  game.arenaMaterials.add(gunmetalFrameMat);
  game.arenaMaterials.add(brushedChromeMat);
  game.arenaMaterials.add(hazardMat);
  game.arenaMaterials.add(trimAccentMat);
  game.arenaMaterials.add(trimSecondaryMat);

  const unitBoxGeo = new THREE.BoxGeometry(1, 1, 1);
  const unitCylGeo = new THREE.CylinderGeometry(0.5, 0.5, 1, 10);
  const unitOctGeo = new THREE.OctahedronGeometry(0.55, 0);
  game.arenaGeometries.add(unitBoxGeo);
  game.arenaGeometries.add(unitCylGeo);
  game.arenaGeometries.add(unitOctGeo);

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
    } else {
      addDecorBox(cx, cy + halfH + 0.06, cz, cw * 0.82, 0.1, cd * 0.82, trimAccentMat);
    }
  };

  const stackColors = [0x0284c7, 0xe11d48, 0xd97706, 0x10b981, 0x6366f1];
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
      addDecorBox(obs.x, obs.y + 0.05, obs.z - halfD - 0.03, obs.w * 0.45, 0.09, 0.04, trimSecondaryMat);
      addDecorBox(obs.x, obs.y + 0.05, obs.z + halfD + 0.03, obs.w * 0.45, 0.09, 0.04, trimSecondaryMat);
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
      addDecorBox(obs.x, obs.y, obs.z - halfD - 0.04, 0.22, obs.h * 0.82, 0.08, trimAccentMat);
      addDecorBox(obs.x, obs.y, obs.z + halfD + 0.04, 0.22, obs.h * 0.82, 0.08, trimAccentMat);
      addDecorBox(obs.x - halfW - 0.04, obs.y, obs.z, 0.08, obs.h * 0.82, 0.22, trimAccentMat);
      addDecorBox(obs.x + halfW + 0.04, obs.y, obs.z, 0.08, obs.h * 0.82, 0.22, trimAccentMat);

      const spireH = Math.abs(obs.x) < 2 && Math.abs(obs.z) < 2 ? 12.5 : 8.5;
      addDecorBox(obs.x, topY + spireH / 2, obs.z, obs.w * 0.52, spireH, obs.d * 0.52, darkSteelMat, true);
      addDecorBox(obs.x, topY + spireH / 2, obs.z, obs.w * 0.24, spireH + 1.5, obs.d * 0.24, trimAccentMat);
      addDecorBox(obs.x, topY + spireH * 0.45, obs.z, obs.w * 0.88, 0.38, obs.d * 0.88, trimSecondaryMat);
      addDecorBox(obs.x, topY + spireH * 0.82, obs.z, obs.w * 0.72, 0.32, obs.d * 0.72, trimAccentMat);

      if (Math.abs(obs.x) < 2 && Math.abs(obs.z) < 2) {
        for (let r = 0; r < 3; r++) {
          const ringGeo = new THREE.TorusGeometry(2.5 + r * 0.65, 0.09, 10, 28);
          game.arenaGeometries.add(ringGeo);
          const ring = new THREE.Mesh(ringGeo, r % 2 === 0 ? trimAccentMat : trimSecondaryMat);
          ring.position.set(obs.x, topY + 1.2 + r * 2.2, obs.z);
          game.scene.add(ring);
          game.arenaDecorMeshes.push(ring);
          game.citadelRings.push(ring);
        }
      }
    } else if (obs.type === 'platform') {
      const isCenter = Math.abs(obs.x) < 2 && Math.abs(obs.z) < 2;
      const activeTrim = isCenter ? trimAccentMat : trimSecondaryMat;

      addDecorBox(obs.x, topY - 0.14, obs.z, obs.w + 0.36, 0.28, obs.d + 0.36, darkSteelMat);
      addDecorBox(obs.x, topY - 0.04, obs.z, obs.w + 0.42, 0.09, obs.d + 0.42, activeTrim);
      addDecorBox(obs.x, botY + 0.12, obs.z, obs.w + 0.25, 0.22, obs.d + 0.25, gunmetalFrameMat);

      for (const sx of [-1, 1]) {
        for (const sz of [-1, 1]) {
          const bx = obs.x + sx * (halfW - 0.35);
          const bz = obs.z + sz * (halfD - 0.35);
          addDecorBox(bx, obs.y + 0.28, bz, 0.85, obs.h + 0.56, 0.85, darkSteelMat);
          addDecorBox(bx, topY + 0.34, bz, 0.52, 0.18, 0.52, activeTrim);
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
        addDecorBox(obs.x, 4.5, obs.z, obs.w + 0.1, 0.22, obs.d + 0.28, trimAccentMat);
        addDecorBox(obs.x, 9.1, obs.z, obs.w + 0.1, 0.28, obs.d + 0.34, trimSecondaryMat);
        addDecorBox(obs.x, topY + upperWallH - 0.2, obs.z, obs.w + 0.1, 0.32, obs.d + 0.38, trimAccentMat);

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

  const ringGeo = new THREE.RingGeometry(7.2, 7.65, 4);
  game.arenaGeometries.add(ringGeo);
  const ringMat = new THREE.MeshBasicMaterial({
    color: theme.accentHex || 0x38bdf8,
    side: THREE.DoubleSide
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

  game.rebuildHitboxList();
}
