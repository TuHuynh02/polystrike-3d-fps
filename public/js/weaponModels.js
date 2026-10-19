// High-Detail Gunsmith 3D Weapon Mesh Builder & First-Person Tactical Viewmodel Rig
// Multi-part contoured receivers, Picatinny rails, ventilated handguards, curved magazines, optics & gloved arms

import * as THREE from '../vendor/three/three.module.js';
import { WEAPONS } from '../shared/constants.js';

const WEAPON_TEX_CACHE = new Map();
let WATCH_DIAL_TEX = null;

/**
 * Creates cached 256x256 procedural PBR materials (diffuse + bump relief) for brushed gunmetal,
 * parkerized steel, stippled polymer, laminated AK wood, and 3K carbon fiber.
 */
export function createProceduralMaterial(type = 'gunmetal', baseHex = 0x1e293b, extraParams = {}) {
  const key = `${type}_${baseHex}`;
  let texPair = WEAPON_TEX_CACHE.get(key);

  if (!texPair && typeof document !== 'undefined') {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');

    const bumpCanvas = document.createElement('canvas');
    bumpCanvas.width = 256;
    bumpCanvas.height = 256;
    const bCtx = bumpCanvas.getContext('2d');

    const col = new THREE.Color(baseHex);
    ctx.fillStyle = `#${col.getHexString()}`;
    ctx.fillRect(0, 0, 256, 256);

    bCtx.fillStyle = '#808080';
    bCtx.fillRect(0, 0, 256, 256);

    if (type === 'gunmetal' || type === 'steel' || type === 'metal') {
      // Fine longitudinal CNC-machined brushed steel grain + micro oil sheen
      for (let y = 0; y < 256; y += 2) {
        const isLight = y % 4 === 0;
        ctx.fillStyle = isLight ? 'rgba(255,255,255,0.038)' : 'rgba(0,0,0,0.048)';
        ctx.fillRect(0, y, 256, 1);
        bCtx.fillStyle = isLight ? '#909090' : '#707070';
        bCtx.fillRect(0, y, 256, 1);
      }
      // Subtle metallic wear mottling
      for (let i = 0; i < 400; i++) {
        const rx = (i * 53 + 17) % 256;
        const ry = (i * 89 + 11) % 256;
        ctx.fillStyle = i % 2 === 0 ? 'rgba(255,255,255,0.025)' : 'rgba(0,0,0,0.035)';
        ctx.fillRect(rx, ry, 6, 2);
      }
    } else if (type === 'polymer' || type === 'grip') {
      // Custom laser-stippled tactical polymer micro-pebble & diamond grip texture
      for (let y = 0; y < 256; y += 4) {
        for (let x = 0; x < 256; x += 4) {
          const n = (x * 19 + y * 37) % 16;
          ctx.fillStyle = n > 8 ? 'rgba(255,255,255,0.035)' : 'rgba(0,0,0,0.065)';
          ctx.fillRect(x, y, 3, 3);
          bCtx.fillStyle = n > 8 ? '#a4a4a4' : '#585858';
          bCtx.fillRect(x, y, 3, 3);
        }
      }
    } else if (type === 'bdu' || type === 'cordura') {
      // Ripstop BDU cloth crosshatch & 1000D Cordura ballistic nylon weave
      const step = type === 'cordura' ? 4 : 6;
      for (let y = 0; y < 256; y += step) {
        ctx.fillStyle = 'rgba(255,255,255,0.03)';
        ctx.fillRect(0, y, 256, 1);
        bCtx.fillStyle = '#929292';
        bCtx.fillRect(0, y, 256, 1);
      }
      for (let x = 0; x < 256; x += step) {
        ctx.fillStyle = 'rgba(0,0,0,0.045)';
        ctx.fillRect(x, 0, 1, 256);
        bCtx.fillStyle = '#6e6e6e';
        bCtx.fillRect(x, 0, 1, 256);
      }
    } else if (type === 'leather') {
      // Supple tactical goatskin/synthetic suede glove grain
      for (let y = 0; y < 256; y += 3) {
        for (let x = 0; x < 256; x += 3) {
          const grain = (x * 29 + y * 43 + ((x ^ y) & 7)) % 17;
          ctx.fillStyle = grain > 9 ? 'rgba(255,255,255,0.025)' : 'rgba(0,0,0,0.045)';
          ctx.fillRect(x, y, 2, 2);
          bCtx.fillStyle = grain > 9 ? '#949494' : '#6c6c6c';
          bCtx.fillRect(x, y, 2, 2);
        }
      }
    } else if (type === 'wood') {
      // Laminated Russian birch / amber shellac wood grain for AK furniture
      const darkWood = col.clone().multiplyScalar(0.68);
      const warmWood = col.clone().multiplyScalar(1.14);
      ctx.fillStyle = `#${darkWood.getHexString()}`;
      for (let y = 0; y < 256; y += 6) {
        const h = 2 + (y % 3);
        ctx.fillRect(0, y, 256, h);
        bCtx.fillStyle = '#626262';
        bCtx.fillRect(0, y, 256, h);
      }
      ctx.fillStyle = `#${warmWood.getHexString()}`;
      for (let y = 3; y < 256; y += 12) {
        ctx.fillRect(0, y, 256, 2);
        bCtx.fillStyle = '#989898';
        bCtx.fillRect(0, y, 256, 2);
      }
    } else if (type === 'carbon') {
      // 3K Diagonal Twill Carbon-Fiber Weave for Tactical Knuckle Guards
      for (let y = 0; y < 256; y += 4) {
        for (let x = 0; x < 256; x += 4) {
          const diag = ((x + y) / 4) % 2 === 0;
          ctx.fillStyle = diag ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.12)';
          ctx.fillRect(x, y, 3, 3);
          bCtx.fillStyle = diag ? '#a8a8a8' : '#545454';
          bCtx.fillRect(x, y, 3, 3);
        }
      }
    }

    const map = new THREE.CanvasTexture(canvas);
    map.wrapS = THREE.RepeatWrapping;
    map.wrapT = THREE.RepeatWrapping;
    map.userData = { shared: true };

    const bumpMap = new THREE.CanvasTexture(bumpCanvas);
    bumpMap.wrapS = THREE.RepeatWrapping;
    bumpMap.wrapT = THREE.RepeatWrapping;
    bumpMap.userData = { shared: true };

    texPair = { map, bumpMap };
    WEAPON_TEX_CACHE.set(key, texPair);
  }

  const presets = {
    gunmetal: { roughness: 0.28, metalness: 0.85, bumpScale: 0.008 },
    steel: { roughness: 0.22, metalness: 0.90, bumpScale: 0.007 },
    metal: { roughness: 0.25, metalness: 0.88, bumpScale: 0.007 },
    polymer: { roughness: 0.60, metalness: 0.16, bumpScale: 0.015 },
    grip: { roughness: 0.66, metalness: 0.12, bumpScale: 0.018 },
    bdu: { roughness: 0.78, metalness: 0.06, bumpScale: 0.014 },
    cordura: { roughness: 0.68, metalness: 0.10, bumpScale: 0.016 },
    leather: { roughness: 0.46, metalness: 0.18, bumpScale: 0.012 },
    wood: { roughness: 0.38, metalness: 0.08, bumpScale: 0.012 },
    carbon: { roughness: 0.26, metalness: 0.62, bumpScale: 0.014 }
  }[type] || { roughness: 0.4, metalness: 0.5, bumpScale: 0.010 };

  return new THREE.MeshStandardMaterial({
    color: baseHex,
    map: texPair ? texPair.map : null,
    bumpMap: texPair ? texPair.bumpMap : null,
    bumpScale: extraParams.bumpScale ?? presets.bumpScale,
    roughness: extraParams.roughness ?? presets.roughness,
    metalness: extraParams.metalness ?? presets.metalness,
    ...extraParams
  });
}

function getWatchDialTexture() {
  if (!WATCH_DIAL_TEX && typeof document !== 'undefined') {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#090d16';
    ctx.fillRect(0, 0, 128, 128);

    // Outer tactical azimuth bezel ticks
    ctx.strokeStyle = 'rgba(229, 160, 36, 0.85)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(64, 64, 54, 0, Math.PI * 2);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(56, 189, 248, 0.55)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(64, 64, 42, 0.4, Math.PI * 1.6);
    ctx.stroke();

    ctx.fillStyle = '#e5a024';
    ctx.font = 'bold 24px Consolas, monospace';
    ctx.textAlign = 'center';
    ctx.fillText('09:45', 64, 66);
    ctx.fillStyle = '#38bdf8';
    ctx.font = 'bold 12px Consolas, monospace';
    ctx.fillText('BPM 78', 64, 86);

    WATCH_DIAL_TEX = new THREE.CanvasTexture(canvas);
    WATCH_DIAL_TEX.userData = { shared: true };
  }
  return WATCH_DIAL_TEX;
}

// ==================== SHARED GUNSMITH SUB-ASSEMBLY BUILDERS ====================

function buildPicatinnyRail(length, yPos, zCenter, mat, toothCount = 12) {
  const railGroup = new THREE.Group();
  const base = new THREE.Mesh(new THREE.BoxGeometry(0.034, 0.010, length), mat);
  base.position.set(0, yPos, zCenter);
  railGroup.add(base);

  const toothSpan = length * 0.92;
  const toothLen = (toothSpan / toothCount) * 0.55;
  const toothGeo = new THREE.BoxGeometry(0.042, 0.008, toothLen);
  for (let i = 0; i < toothCount; i++) {
    const tz = zCenter - toothSpan / 2 + (i / Math.max(1, toothCount - 1)) * toothSpan;
    const tooth = new THREE.Mesh(toothGeo, mat);
    tooth.position.set(0, yPos + 0.008, tz);
    railGroup.add(tooth);
  }
  return railGroup;
}

function buildErgonomicGripAndTrigger(yPos, zPos, gripMat, metalMat, boreMat) {
  const gripGroup = new THREE.Group();
  gripGroup.position.set(0, yPos, zPos);

  // Contoured Stippled Pistol Grip Core + Beavertail Backstrap + Finger Grooves + Flared Magwell Base
  const gripCore = new THREE.Mesh(new THREE.CapsuleGeometry(0.026, 0.115, 8, 12), gripMat);
  gripCore.scale.set(0.95, 1, 1.38);
  gripCore.rotation.x = -0.28;
  gripCore.position.set(0, -0.068, 0.012);

  const beavertail = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.024, 0.045, 8), gripMat);
  beavertail.rotation.x = -0.55;
  beavertail.position.set(0, -0.014, 0.028);

  const gripBase = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.033, 0.018, 10), metalMat);
  gripBase.scale.set(0.95, 1, 1.42);
  gripBase.position.set(0, -0.135, 0.032);
  gripBase.rotation.x = -0.28;

  // Ambidextrous Fire Selector Switch on Receiver Side (sized to sit flush on both pistol & rifle frames)
  const selectorPin = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.056, 8), metalMat);
  selectorPin.rotation.z = Math.PI / 2;
  selectorPin.position.set(0, 0.012, -0.008);
  const selectorLever = new THREE.Mesh(new THREE.BoxGeometry(0.060, 0.007, 0.024), boreMat);
  selectorLever.position.set(0, 0.012, -0.015);
  selectorLever.rotation.x = 0.25;

  // Rounded Trigger Guard Loop + Curved Match Trigger Blade
  const guardLoop = new THREE.Mesh(
    new THREE.TorusGeometry(0.036, 0.0055, 8, 14, Math.PI * 1.15),
    metalMat
  );
  guardLoop.rotation.y = Math.PI / 2;
  guardLoop.rotation.x = Math.PI * 0.92;
  guardLoop.position.set(0, -0.022, -0.048);

  const triggerBlade = new THREE.Mesh(
    new THREE.TorusGeometry(0.016, 0.004, 6, 10, Math.PI * 0.65),
    boreMat
  );
  triggerBlade.rotation.y = Math.PI / 2;
  triggerBlade.rotation.x = Math.PI * 0.65;
  triggerBlade.position.set(0, -0.014, -0.042);

  gripGroup.add(gripCore, beavertail, gripBase, selectorPin, selectorLever, guardLoop, triggerBlade);
  return gripGroup;
}

function buildCurvedMagazine(segments, width, depth, segHeight, curveStepRad, bodyMat, ribMat, floorMat) {
  const magGroup = new THREE.Group();
  let curY = 0;
  let curZ = 0;
  let curAngle = 0.08;

  for (let i = 0; i < segments; i++) {
    // Contoured rounded-edge magazine segment
    const seg = new THREE.Mesh(new THREE.BoxGeometry(width, segHeight, depth), bodyMat);
    seg.position.set(0, curY, curZ);
    seg.rotation.x = curAngle;
    magGroup.add(seg);

    // Side reinforcement stamping ribs
    const rib = new THREE.Mesh(new THREE.BoxGeometry(width + 0.006, segHeight * 0.26, depth * 0.78), ribMat);
    rib.position.set(0, curY, curZ);
    rib.rotation.x = curAngle;
    magGroup.add(rib);

    curY -= Math.cos(curAngle) * (segHeight * 0.88);
    curZ -= Math.sin(curAngle) * (segHeight * 0.88);
    curAngle += curveStepRad;
  }

  // Flared Floorplate with Magpul Ranger Pull Loop
  const floorPlate = new THREE.Mesh(new THREE.BoxGeometry(width + 0.010, 0.022, depth + 0.014), floorMat);
  floorPlate.position.set(0, curY + 0.012, curZ);
  floorPlate.rotation.x = curAngle;
  const pullLoop = new THREE.Mesh(new THREE.TorusGeometry(0.018, 0.0045, 6, 12, Math.PI), floorMat);
  pullLoop.rotation.y = Math.PI / 2;
  pullLoop.rotation.z = Math.PI + curAngle;
  pullLoop.position.set(0, curY + 0.002, curZ);
  magGroup.add(floorPlate, pullLoop);

  return magGroup;
}

function buildDetailedOptic(type, yPos, zPos, darkMetal, gunMetal, accentMat, glassMat, reticleMat) {
  const opticGroup = new THREE.Group();
  opticGroup.position.set(0, yPos, zPos);

  const hoodMetal = darkMetal.clone();
  hoodMetal.side = THREE.DoubleSide;

  const baseColorHex = reticleMat?.color ? reticleMat.color.getHex() : 0xef4444;
  const reticleMainMat = new THREE.MeshBasicMaterial({
    color: baseColorHex,
    transparent: true,
    opacity: 0.96,
    depthWrite: false,
    side: THREE.DoubleSide
  });
  const reticleHaloMat = new THREE.MeshBasicMaterial({
    color: baseColorHex,
    transparent: true,
    opacity: 0.32,
    depthWrite: false,
    side: THREE.DoubleSide
  });
  const reticleCoreMat = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.95,
    depthWrite: false,
    side: THREE.DoubleSide
  });

  // Compact under-optic Picatinny rail saddle & upper receiver crown visible at bottom of ADS sight picture
  const railSaddle = new THREE.Mesh(new THREE.BoxGeometry(0.038, 0.010, 0.096), darkMetal);
  railSaddle.position.set(0, -0.005, 0);
  const receiverCrown = new THREE.Mesh(new THREE.BoxGeometry(0.064, 0.024, 0.110), gunMetal);
  receiverCrown.position.set(0, -0.022, 0);
  opticGroup.add(railSaddle, receiverCrown);

  const reticleGroup = new THREE.Group();
  reticleGroup.position.set(0, 0.038, type === 'reflex' ? -0.0055 : 0.0045);

  if (type === 'reflex') {
    // Kobra / Aimpoint Open Reflex Red-Dot Housing with Wide Clear Lens & Slim Hood
    const riserMount = new THREE.Mesh(new THREE.BoxGeometry(0.044, 0.010, 0.072), darkMetal);
    riserMount.position.set(0, 0.002, -0.004);
    const clampBolt = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.050, 8), gunMetal);
    clampBolt.rotation.z = Math.PI / 2;
    clampBolt.position.set(0, 0.002, 0.008);

    const emitterDeck = new THREE.Mesh(new THREE.BoxGeometry(0.054, 0.007, 0.064), gunMetal);
    emitterDeck.position.set(0, 0.010, -0.004);

    const windageDial = new THREE.Mesh(new THREE.CylinderGeometry(0.0065, 0.0065, 0.010, 10), darkMetal);
    windageDial.rotation.z = Math.PI / 2;
    windageDial.position.set(0.029, 0.010, -0.014);

    // Slim side protective pillars & wide-aperture top reflex arch (depth 14mm so zero tunnel vision)
    const pillarL = new THREE.Mesh(new THREE.BoxGeometry(0.0038, 0.028, 0.014), hoodMetal);
    pillarL.position.set(-0.0295, 0.026, -0.006);
    const pillarR = new THREE.Mesh(new THREE.BoxGeometry(0.0038, 0.028, 0.014), hoodMetal);
    pillarR.position.set(0.0295, 0.026, -0.006);

    const archFrame = new THREE.Mesh(
      new THREE.CylinderGeometry(0.030, 0.030, 0.014, 24, 1, true, -Math.PI * 0.52, Math.PI * 1.04),
      hoodMetal
    );
    archFrame.rotation.x = -Math.PI / 2;
    archFrame.scale.set(1.02, 1.0, 0.92);
    archFrame.position.set(0, 0.038, -0.006);

    const reflexLens = new THREE.Mesh(new THREE.CircleGeometry(0.028, 28), glassMat);
    reflexLens.scale.set(1.05, 0.96, 1);
    reflexLens.position.set(0, 0.038, -0.006);
    reflexLens.renderOrder = 10;
    reflexLens.userData.isOpticLens = true;

    const redDotHalo = new THREE.Mesh(new THREE.CircleGeometry(0.0024, 20), reticleHaloMat);
    const redDot = new THREE.Mesh(new THREE.CircleGeometry(0.0013, 20), reticleMainMat);
    const redDotCore = new THREE.Mesh(new THREE.CircleGeometry(0.00065, 16), reticleCoreMat);
    redDotHalo.renderOrder = 11;
    redDot.renderOrder = 12;
    redDotCore.renderOrder = 13;
    for (const part of [redDotHalo, redDot, redDotCore]) {
      part.userData.isOpticReticle = true;
    }
    reticleGroup.add(redDotHalo, redDot, redDotCore);

    opticGroup.add(riserMount, clampBolt, emitterDeck, windageDial, pillarL, pillarR, archFrame, reflexLens, reticleGroup);
    opticGroup.userData = {
      opticType: 'reddot',
      centerOffset: new THREE.Vector3(0, 0.038, -0.006),
      reticleGroup,
      lensMesh: reflexLens
    };
  } else {
    // EOTech EXPS3 Holographic Weapon Sight — Slim 20mm Hood Depth & Wide Clear Rectangular Window
    const baseMount = new THREE.Mesh(new THREE.BoxGeometry(0.056, 0.010, 0.074), gunMetal);
    baseMount.position.set(0, 0.002, 0.002);
    const batteryCyl = new THREE.Mesh(new THREE.CylinderGeometry(0.0065, 0.0065, 0.052, 10), darkMetal);
    batteryCyl.rotation.z = Math.PI / 2;
    batteryCyl.position.set(0, 0.007, -0.026);

    const hoodBase = new THREE.Mesh(new THREE.BoxGeometry(0.062, 0.004, 0.020), darkMetal);
    hoodBase.position.set(0, 0.013, 0.004);

    // Slim aluminum protective hood frame (wide 58mm x 45mm sight window centered at y = 0.038)
    const hoodLeft = new THREE.Mesh(new THREE.BoxGeometry(0.0042, 0.048, 0.020), hoodMetal);
    hoodLeft.position.set(-0.031, 0.038, 0.004);
    const hoodRight = new THREE.Mesh(new THREE.BoxGeometry(0.0042, 0.048, 0.020), hoodMetal);
    hoodRight.position.set(0.031, 0.038, 0.004);
    const hoodTopBar = new THREE.Mesh(new THREE.BoxGeometry(0.066, 0.0042, 0.020), hoodMetal);
    hoodTopBar.position.set(0, 0.062, 0.004);

    const hoodTopArch = new THREE.Mesh(
      new THREE.CylinderGeometry(0.032, 0.032, 0.020, 20, 1, true, -Math.PI * 0.5, Math.PI),
      hoodMetal
    );
    hoodTopArch.rotation.x = -Math.PI / 2;
    hoodTopArch.scale.set(1.0, 1.0, 0.24);
    hoodTopArch.position.set(0, 0.058, 0.004);

    const lens = new THREE.Mesh(new THREE.PlaneGeometry(0.058, 0.045), glassMat);
    lens.position.set(0, 0.038, 0.004);
    lens.renderOrder = 10;
    lens.userData.isOpticLens = true;

    const holoRingHalo = new THREE.Mesh(new THREE.RingGeometry(0.0078, 0.0098, 36), reticleHaloMat);
    const holoRing = new THREE.Mesh(new THREE.RingGeometry(0.0083, 0.0092, 36), reticleMainMat);
    const holoDotHalo = new THREE.Mesh(new THREE.CircleGeometry(0.0018, 16), reticleHaloMat);
    const holoDot = new THREE.Mesh(new THREE.CircleGeometry(0.0010, 16), reticleMainMat);
    const holoDotCore = new THREE.Mesh(new THREE.CircleGeometry(0.0005, 12), reticleCoreMat);
    const tickTop = new THREE.Mesh(new THREE.PlaneGeometry(0.0009, 0.0032), reticleMainMat);
    tickTop.position.set(0, 0.0104, 0);
    const tickBot = new THREE.Mesh(new THREE.PlaneGeometry(0.0009, 0.0032), reticleMainMat);
    tickBot.position.set(0, -0.0104, 0);
    const tickLeft = new THREE.Mesh(new THREE.PlaneGeometry(0.0032, 0.0009), reticleMainMat);
    tickLeft.position.set(-0.0104, 0, 0);
    const tickRight = new THREE.Mesh(new THREE.PlaneGeometry(0.0032, 0.0009), reticleMainMat);
    tickRight.position.set(0.0104, 0, 0);

    holoRingHalo.renderOrder = 11;
    holoDotHalo.renderOrder = 11;
    holoRing.renderOrder = 12;
    holoDot.renderOrder = 12;
    tickTop.renderOrder = 12;
    tickBot.renderOrder = 12;
    tickLeft.renderOrder = 12;
    tickRight.renderOrder = 12;
    holoDotCore.renderOrder = 13;

    for (const part of [holoRingHalo, holoRing, holoDotHalo, holoDot, holoDotCore, tickTop, tickBot, tickLeft, tickRight]) {
      part.userData.isOpticReticle = true;
    }
    reticleGroup.add(holoRingHalo, holoRing, holoDotHalo, holoDot, holoDotCore, tickTop, tickBot, tickLeft, tickRight);

    opticGroup.add(baseMount, batteryCyl, hoodBase, hoodLeft, hoodRight, hoodTopBar, hoodTopArch, lens, reticleGroup);
    opticGroup.userData = {
      opticType: 'holo',
      centerOffset: new THREE.Vector3(0, 0.038, 0.004),
      reticleGroup,
      lensMesh: lens
    };
  }

  opticGroup.traverse((child) => {
    child.userData.isOpticAssembly = true;
  });
  return opticGroup;
}

/**
 * Builds the detailed 3D gunsmith geometry for a given weapon ID.
 */
export function buildDetailedWeaponModel(weaponId = 'rifle') {
  const group = new THREE.Group();

  const darkMetal = createProceduralMaterial('gunmetal', 0x11161d, {
    roughness: 0.28,
    metalness: 0.85
  });
  const gunMetal = createProceduralMaterial('steel', 0x2c3540, {
    roughness: 0.24,
    metalness: 0.88
  });
  const polymerMat = createProceduralMaterial('polymer', 0x1b2028, {
    roughness: 0.60,
    metalness: 0.16
  });
  const fdePolymerMat = createProceduralMaterial('polymer', 0x8b7355, {
    roughness: 0.54,
    metalness: 0.20
  });
  const fdeAnodizedMat = createProceduralMaterial('gunmetal', 0xa38760, {
    roughness: 0.30,
    metalness: 0.76
  });
  const akWoodMat = createProceduralMaterial('wood', 0x6e3219, {
    roughness: 0.38,
    metalness: 0.10
  });
  const oliveChassisMat = createProceduralMaterial('polymer', 0x3b4938, {
    roughness: 0.50,
    metalness: 0.22
  });
  const chromeMetal = createProceduralMaterial('steel', 0xcbd5e1, {
    roughness: 0.16,
    metalness: 0.94
  });
  const brassMat = new THREE.MeshStandardMaterial({
    color: 0xeab308,
    roughness: 0.22,
    metalness: 0.90
  });
  const copperMat = new THREE.MeshStandardMaterial({
    color: 0xd97706,
    roughness: 0.26,
    metalness: 0.88
  });
  const boreHoleMat = new THREE.MeshBasicMaterial({ color: 0x030508 });

  const accentColor = WEAPONS[weaponId]?.color || 0xe5a024;
  const accentMat = new THREE.MeshStandardMaterial({
    color: accentColor,
    roughness: 0.32,
    metalness: 0.72
  });
  const reticleMat = new THREE.MeshBasicMaterial({ color: 0x22c55e, side: THREE.DoubleSide });
  const redReticleMat = new THREE.MeshBasicMaterial({ color: 0xef4444, side: THREE.DoubleSide });
  const glassMat = new THREE.MeshBasicMaterial({
    color: 0x38bdf8,
    transparent: true,
    opacity: 0.075,
    depthWrite: false,
    side: THREE.DoubleSide
  });

  let magMesh = null;
  let boltMesh = null;
  let activeOptic = null;
  let opticCenterY = 0.106;
  let opticCenterZ = 0.02;
  let muzzleZ = -0.78;

  if (weaponId === 'rifle') {
    // ==================== VANDAL-AK (AKM / AK-103 CUSTOM TACTICAL) ====================
    // Stamped Steel Lower Receiver + Magwell Dimples + Ribbed Rounded Dust Cover
    const lowerReceiver = new THREE.Mesh(new THREE.BoxGeometry(0.074, 0.068, 0.38), darkMetal);
    lowerReceiver.position.set(0, -0.015, 0.02);

    // Stamped receiver side bevels & AK safety selector lever
    const akSelector = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.024, 0.15), gunMetal);
    akSelector.position.set(0.040, -0.006, 0.04);
    akSelector.rotation.x = -0.12;

    const sideMountBracket = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.078, 0.11), gunMetal);
    sideMountBracket.position.set(-0.041, 0.022, 0.02);

    const dustCover = new THREE.Mesh(
      new THREE.CylinderGeometry(0.039, 0.042, 0.34, 16, 1, false, -Math.PI * 0.5, Math.PI),
      gunMetal
    );
    dustCover.rotation.x = Math.PI / 2;
    dustCover.position.set(0, 0.018, 0.04);

    // Rear Sight Block & Tangent Leaf Sight
    const trunnionBlock = new THREE.Mesh(new THREE.BoxGeometry(0.072, 0.072, 0.09), darkMetal);
    trunnionBlock.position.set(0, 0.016, -0.16);
    const tangentLeaf = new THREE.Mesh(new THREE.BoxGeometry(0.036, 0.018, 0.085), chromeMetal);
    tangentLeaf.position.set(0, 0.056, -0.155);

    // Contoured Laminated Wood / Bakelite Lower Handguard with Palm Swells & Upper Gas Tube Cover
    const lowerHandguard = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.040, 0.25, 16), akWoodMat);
    lowerHandguard.rotation.x = Math.PI / 2;
    lowerHandguard.scale.set(0.96, 1.08, 1);
    lowerHandguard.position.set(0, -0.008, -0.33);

    const palmSwell = new THREE.Mesh(new THREE.SphereGeometry(0.042, 12, 10), akWoodMat);
    palmSwell.scale.set(1.06, 0.68, 2.2);
    palmSwell.position.set(0, -0.012, -0.32);

    const handguardRetainer = new THREE.Mesh(new THREE.CylinderGeometry(0.041, 0.041, 0.024, 12), darkMetal);
    handguardRetainer.rotation.x = Math.PI / 2;
    handguardRetainer.position.set(0, 0.006, -0.46);

    const upperGasCover = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.21, 12), akWoodMat);
    upperGasCover.rotation.x = Math.PI / 2;
    upperGasCover.position.set(0, 0.036, -0.32);

    // 45-Degree AK Gas Block & Exposed Steel Gas Tube
    const gasTube = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.28, 12), gunMetal);
    gasTube.rotation.x = Math.PI / 2;
    gasTube.position.set(0, 0.036, -0.36);

    const gasBlock = new THREE.Mesh(new THREE.CylinderGeometry(0.020, 0.022, 0.068, 12), darkMetal);
    gasBlock.rotation.x = 0.65;
    gasBlock.position.set(0, 0.022, -0.50);

    // Stepped Cold-Hammer-Forged Barrel + Underbarrel Cleaning Rod + Triangular Front Sight Tower
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.019, 0.48, 16), darkMetal);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.005, -0.56);

    const cleaningRod = new THREE.Mesh(new THREE.CylinderGeometry(0.0045, 0.0045, 0.34, 8), chromeMetal);
    cleaningRod.rotation.x = Math.PI / 2;
    cleaningRod.position.set(0, -0.015, -0.60);

    const frontSightTower = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.064, 0.038), darkMetal);
    frontSightTower.position.set(0, 0.028, -0.73);
    const sightHoodRing = new THREE.Mesh(new THREE.TorusGeometry(0.016, 0.0032, 8, 16, Math.PI), darkMetal);
    sightHoodRing.position.set(0, 0.054, -0.73);

    // AK-103 Multi-Port Muzzle Brake + Expansion Ports + Hollow Dark Bore
    const muzzleBrake = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.021, 0.088, 14), gunMetal);
    muzzleBrake.rotation.x = Math.PI / 2;
    muzzleBrake.position.set(0, 0.005, -0.82);
    const brakePort = new THREE.Mesh(new THREE.BoxGeometry(0.046, 0.014, 0.032), boreHoleMat);
    brakePort.position.set(0, 0.008, -0.82);
    const muzzleBore = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.015, 10), boreHoleMat);
    muzzleBore.rotation.x = Math.PI / 2;
    muzzleBore.position.set(0, 0.005, -0.862);

    // Contoured Wooden Buttstock with Cheek Slope & Ribbed Steel Buttplate
    const stockTopStrut = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.032, 0.28, 14), akWoodMat);
    stockTopStrut.rotation.x = Math.PI / 2 - 0.08;
    stockTopStrut.scale.set(0.85, 1.35, 1);
    stockTopStrut.position.set(0, -0.012, 0.34);

    const stockBelly = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.028, 0.27, 14), akWoodMat);
    stockBelly.rotation.x = Math.PI / 2 + 0.14;
    stockBelly.position.set(0, -0.042, 0.34);

    const buttPlate = new THREE.Mesh(new THREE.CapsuleGeometry(0.028, 0.076, 8, 12), darkMetal);
    buttPlate.scale.set(1.0, 1, 0.48);
    buttPlate.position.set(0, -0.024, 0.48);

    const gripAsm = buildErgonomicGripAndTrigger(-0.045, 0.13, akWoodMat, darkMetal, chromeMetal);

    // 30-Round Curved Bakelite/Steel Ribbed Banana Magazine
    magMesh = buildCurvedMagazine(5, 0.052, 0.096, 0.058, 0.12, akWoodMat, darkMetal, gunMetal);
    magMesh.position.set(0, -0.072, -0.08);
    magMesh.userData.basePos = magMesh.position.clone();

    // Reciprocating Polished Bolt Carrier & Curved Charging Handle Knob
    boltMesh = new THREE.Group();
    const carrierPlate = new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.032, 0.13), chromeMetal);
    carrierPlate.position.set(0.036, 0, 0);
    const handleKnob = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.010, 0.038, 10), darkMetal);
    handleKnob.rotation.z = Math.PI / 2;
    handleKnob.position.set(0.056, 0.004, -0.045);
    boltMesh.add(carrierPlate, handleKnob);
    boltMesh.position.set(0, 0.026, -0.02);
    boltMesh.userData.baseZ = -0.02;

    // Dovetail Side-Mount Picatinny Rail + Kobra Red-Dot Reflex Sight
    const topRail = buildPicatinnyRail(0.18, 0.062, 0.02, gunMetal, 7);
    const kobraSight = buildDetailedOptic('reflex', 0.068, 0.02, darkMetal, gunMetal, accentMat, glassMat, redReticleMat);
    activeOptic = kobraSight;
    opticCenterY = 0.068 + 0.038;
    opticCenterZ = 0.02;

    group.add(
      lowerReceiver,
      akSelector,
      sideMountBracket,
      dustCover,
      trunnionBlock,
      tangentLeaf,
      lowerHandguard,
      palmSwell,
      handguardRetainer,
      upperGasCover,
      gasTube,
      gasBlock,
      barrel,
      cleaningRod,
      frontSightTower,
      sightHoodRing,
      muzzleBrake,
      brakePort,
      muzzleBore,
      stockTopStrut,
      stockBelly,
      buttPlate,
      gripAsm,
      magMesh,
      boltMesh,
      topRail,
      kobraSight
    );
    muzzleZ = -0.88;
  } else if (weaponId === 'm4a1') {
    // ==================== PHANTOM-M4 (MK18 MOD 1 SUPPRESSED CARBINE) ====================
    // Forged AR-15 Upper & Lower Receivers with Forward Assist, Brass Deflector & Magwell Flare
    const upperReceiver = new THREE.Mesh(new THREE.CylinderGeometry(0.044, 0.046, 0.28, 12), darkMetal);
    upperReceiver.rotation.x = Math.PI / 2;
    upperReceiver.scale.set(0.95, 1.05, 1);
    upperReceiver.position.set(0, 0.028, 0.01);

    const forwardAssist = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.011, 0.048, 8), gunMetal);
    forwardAssist.rotation.x = Math.PI / 2;
    forwardAssist.rotation.y = 0.22;
    forwardAssist.position.set(0.038, 0.024, 0.11);

    const brassDeflector = new THREE.Mesh(new THREE.ConeGeometry(0.016, 0.028, 6), darkMetal);
    brassDeflector.rotation.z = -Math.PI / 2;
    brassDeflector.position.set(0.042, 0.028, 0.055);

    const lowerReceiver = new THREE.Mesh(new THREE.BoxGeometry(0.072, 0.068, 0.26), gunMetal);
    lowerReceiver.position.set(0, -0.028, 0.02);

    const magwellFlare = new THREE.Mesh(new THREE.BoxGeometry(0.082, 0.032, 0.115), darkMetal);
    magwellFlare.position.set(0, -0.058, -0.06);

    // Octagonal M-LOK Free-Float Handguard with Barrel Nut Collar & Cooling Slots
    const barrelNut = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.052, 12), fdeAnodizedMat);
    barrelNut.rotation.x = Math.PI / 2;
    barrelNut.position.set(0, 0.024, -0.15);

    const handguardTube = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.042, 0.36, 8), gunMetal);
    handguardTube.rotation.x = Math.PI / 2;
    handguardTube.rotation.z = Math.PI / 8;
    handguardTube.position.set(0, 0.024, -0.31);

    for (let s = 0; s < 4; s++) {
      const slotZ = -0.18 - s * 0.075;
      const slotBar = new THREE.Mesh(new THREE.BoxGeometry(0.088, 0.014, 0.048), boreHoleMat);
      slotBar.position.set(0, 0.024, slotZ);
      group.add(slotBar);
    }

    const fullTopRail = buildPicatinnyRail(0.62, 0.068, -0.16, darkMetal, 18);

    // Side-Offset AN/PEQ-15 Tactical Laser Box near Front of Handguard (clear of Holo sightline)
    const peqBox = new THREE.Mesh(new THREE.BoxGeometry(0.046, 0.022, 0.092), fdePolymerMat);
    peqBox.position.set(0.024, 0.074, -0.39);
    const peqLens = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.014, 8), reticleMat);
    peqLens.rotation.x = Math.PI / 2;
    peqLens.position.set(0.028, 0.074, -0.44);

    // Angled Magpul AFG Foregrip under Handguard
    const afgGrip = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.026, 0.12, 10), polymerMat);
    afgGrip.rotation.x = Math.PI / 2 - 0.38;
    afgGrip.position.set(0, -0.032, -0.33);

    // Barrel Step + SureFire SOCOM Cylindrical Suppressor with Knurled Locking Collar, Welded Seam Rings & Bore Hole
    const barrelStub = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.14, 14), darkMetal);
    barrelStub.rotation.x = Math.PI / 2;
    barrelStub.position.set(0, 0.024, -0.53);

    const suppressorCollar = new THREE.Mesh(new THREE.CylinderGeometry(0.030, 0.030, 0.045, 16), fdeAnodizedMat);
    suppressorCollar.rotation.x = Math.PI / 2;
    suppressorCollar.position.set(0, 0.024, -0.60);

    const suppressorBody = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.24, 18), darkMetal);
    suppressorBody.rotation.x = Math.PI / 2;
    suppressorBody.position.set(0, 0.024, -0.74);

    for (const rZ of [-0.66, -0.74, -0.82]) {
      const seam = new THREE.Mesh(new THREE.TorusGeometry(0.0282, 0.0018, 6, 16), gunMetal);
      seam.position.set(0, 0.024, rZ);
      group.add(seam);
    }

    const suppressorBore = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.013, 0.012, 10), boreHoleMat);
    suppressorBore.rotation.x = Math.PI / 2;
    suppressorBore.position.set(0, 0.024, -0.86);

    // Buffer Tube + Castle Nut + SOPMOD Crane Adjustable Buttstock
    const castleNut = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.024, 12), gunMetal);
    castleNut.rotation.x = Math.PI / 2;
    castleNut.position.set(0, 0.024, 0.16);

    const bufferTube = new THREE.Mesh(new THREE.CylinderGeometry(0.021, 0.021, 0.26, 14), darkMetal);
    bufferTube.rotation.x = Math.PI / 2;
    bufferTube.position.set(0, 0.024, 0.28);

    const craneCheekWeld = new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.036, 0.21, 14), polymerMat);
    craneCheekWeld.rotation.x = Math.PI / 2;
    craneCheekWeld.scale.set(1.18, 0.92, 1);
    craneCheekWeld.position.set(0, 0.022, 0.34);

    const stockStrut = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.022, 0.20, 10), polymerMat);
    stockStrut.rotation.x = 0.58;
    stockStrut.position.set(0, -0.028, 0.35);

    const rubberButtPad = new THREE.Mesh(new THREE.CapsuleGeometry(0.030, 0.078, 8, 12), darkMetal);
    rubberButtPad.scale.set(1.05, 1, 0.45);
    rubberButtPad.position.set(0, -0.008, 0.45);

    const gripAsm = buildErgonomicGripAndTrigger(-0.042, 0.11, polymerMat, darkMetal, chromeMetal);

    // Windowed PMAG 30-Round Polymer Magazine
    magMesh = buildCurvedMagazine(4, 0.050, 0.092, 0.058, 0.07, polymerMat, gunMetal, fdePolymerMat);
    const pmagWindow = new THREE.Mesh(new THREE.BoxGeometry(0.054, 0.085, 0.024), brassMat);
    pmagWindow.position.set(0, -0.06, -0.01);
    magMesh.add(pmagWindow);
    magMesh.position.set(0, -0.072, -0.06);
    magMesh.userData.basePos = magMesh.position.clone();

    // Ejection Port Bolt Carrier & T-Charging Handle
    boltMesh = new THREE.Group();
    const bcgCover = new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.028, 0.105), chromeMetal);
    bcgCover.position.set(0.038, 0, 0);
    const tHandle = new THREE.Mesh(new THREE.BoxGeometry(0.066, 0.016, 0.028), darkMetal);
    tHandle.position.set(0, 0.022, 0.16);
    boltMesh.add(bcgCover, tHandle);
    boltMesh.position.set(0, 0.028, -0.02);
    boltMesh.userData.baseZ = -0.02;

    const holoSight = buildDetailedOptic('holo', 0.074, 0.02, darkMetal, fdeAnodizedMat, accentMat, glassMat, redReticleMat);
    activeOptic = holoSight;
    opticCenterY = 0.074 + 0.038;
    opticCenterZ = 0.02;

    group.add(
      upperReceiver,
      forwardAssist,
      brassDeflector,
      lowerReceiver,
      magwellFlare,
      barrelNut,
      handguardTube,
      fullTopRail,
      peqBox,
      peqLens,
      afgGrip,
      barrelStub,
      suppressorCollar,
      suppressorBody,
      suppressorBore,
      castleNut,
      bufferTube,
      craneCheekWeld,
      stockStrut,
      rubberButtPad,
      gripAsm,
      magMesh,
      boltMesh,
      holoSight
    );
    muzzleZ = -0.89;
  } else if (weaponId === 'scar') {
    // ==================== SCAR-H 7.62 (FN MK17 HEAVY BATTLE RIFLE) ====================
    // Iconic Monolithic Extruded FDE Aluminum Upper Receiver with Chamfered Crown & Side Scallops
    const monoUpper = new THREE.Mesh(new THREE.BoxGeometry(0.084, 0.094, 0.64), fdeAnodizedMat);
    monoUpper.position.set(0, 0.032, -0.12);
    const upperChamfer = new THREE.Mesh(new THREE.CylinderGeometry(0.044, 0.044, 0.64, 8), fdeAnodizedMat);
    upperChamfer.rotation.x = Math.PI / 2;
    upperChamfer.scale.set(0.96, 1, 0.42);
    upperChamfer.position.set(0, 0.068, -0.12);

    // Machined receiver lightening grooves
    for (const side of [-1, 1]) {
      const groove = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.018, 0.46), gunMetal);
      groove.position.set(side * 0.042, 0.042, -0.12);
      group.add(groove);
    }

    const lowerPolymer = new THREE.Mesh(new THREE.BoxGeometry(0.076, 0.068, 0.34), polymerMat);
    lowerPolymer.position.set(0, -0.032, 0.01);

    const topRail = buildPicatinnyRail(0.62, 0.092, -0.12, darkMetal, 18);
    const sideRailL = buildPicatinnyRail(0.22, 0.028, -0.32, darkMetal, 6);
    sideRailL.rotation.z = Math.PI / 2;
    sideRailL.position.set(-0.046, 0.028, 0);
    const sideRailR = buildPicatinnyRail(0.22, 0.028, -0.32, darkMetal, 6);
    sideRailR.rotation.z = -Math.PI / 2;
    sideRailR.position.set(0.046, 0.028, 0);

    // Heavy 7.62mm Free-Float Barrel + Folding Gas Block Sight + AAC 3-Prong Flash Hider
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.019, 0.021, 0.36, 16), darkMetal);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.022, -0.58);

    const gasBlockSight = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.026, 0.055, 12), gunMetal);
    gasBlockSight.rotation.x = Math.PI / 2;
    gasBlockSight.position.set(0, 0.032, -0.47);

    const flashHider = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.022, 0.088, 14), gunMetal);
    flashHider.rotation.x = Math.PI / 2;
    flashHider.position.set(0, 0.022, -0.78);
    const muzzleBore = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.015, 10), boreHoleMat);
    muzzleBore.rotation.x = Math.PI / 2;
    muzzleBore.position.set(0, 0.022, -0.822);

    // Vertical Stubby TangoDown Foregrip
    const vertGrip = new THREE.Mesh(new THREE.CapsuleGeometry(0.022, 0.085, 8, 12), fdePolymerMat);
    vertGrip.position.set(0, -0.068, -0.34);

    // Iconic FN Ugg-Boot Folding/Telescoping Buttstock with Contoured Cheekpiece & Rubber Pad
    const stockHinge = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.115, 12), darkMetal);
    stockHinge.position.set(0, 0.018, 0.21);
    const stockBody = new THREE.Mesh(new THREE.BoxGeometry(0.068, 0.116, 0.26), fdePolymerMat);
    stockBody.position.set(0, 0.005, 0.35);
    const cheekRiser = new THREE.Mesh(
      new THREE.CylinderGeometry(0.036, 0.036, 0.22, 14, 1, false, -Math.PI * 0.5, Math.PI),
      fdePolymerMat
    );
    cheekRiser.rotation.x = Math.PI / 2;
    cheekRiser.position.set(0, 0.048, 0.34);
    const buttPad = new THREE.Mesh(new THREE.CapsuleGeometry(0.032, 0.082, 8, 12), darkMetal);
    buttPad.scale.set(1.05, 1, 0.48);
    buttPad.position.set(0, -0.008, 0.49);

    const gripAsm = buildErgonomicGripAndTrigger(-0.042, 0.12, fdePolymerMat, darkMetal, chromeMetal);

    // Straight Heavy 20-Round 7.62x51mm NATO Steel Box Magazine with FDE Mag-Pull Floorplate
    magMesh = new THREE.Group();
    const magBox = new THREE.Mesh(new THREE.BoxGeometry(0.056, 0.195, 0.118), fdeAnodizedMat);
    const magRib1 = new THREE.Mesh(new THREE.BoxGeometry(0.060, 0.16, 0.018), gunMetal);
    magRib1.position.set(0, 0, -0.025);
    const magRib2 = new THREE.Mesh(new THREE.BoxGeometry(0.060, 0.16, 0.018), gunMetal);
    magRib2.position.set(0, 0, 0.025);
    const magPullBase = new THREE.Mesh(new THREE.BoxGeometry(0.064, 0.032, 0.124), darkMetal);
    magPullBase.position.set(0, -0.105, 0);
    const magLoop = new THREE.Mesh(new THREE.TorusGeometry(0.022, 0.005, 6, 12, Math.PI), darkMetal);
    magLoop.rotation.y = Math.PI / 2;
    magLoop.rotation.z = Math.PI;
    magLoop.position.set(0, -0.12, 0);
    magMesh.add(magBox, magRib1, magRib2, magPullBase, magLoop);
    magMesh.position.set(0, -0.135, -0.085);
    magMesh.rotation.x = 0.03;
    magMesh.userData.basePos = magMesh.position.clone();

    // Forward Reciprocating Charging Handle & Bolt Carrier
    boltMesh = new THREE.Group();
    const bcgPlate = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.034, 0.12), chromeMetal);
    bcgPlate.position.set(0.042, 0, 0.04);
    const chHandle = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.055, 10), darkMetal);
    chHandle.rotation.z = Math.PI / 2;
    chHandle.position.set(-0.056, 0.018, -0.18);
    boltMesh.add(bcgPlate, chHandle);
    boltMesh.position.set(0, 0.038, -0.05);
    boltMesh.userData.baseZ = -0.05;

    // EOTech Holographic Combat Sight on Monolithic Top Rail
    const acogSight = buildDetailedOptic('holo', 0.098, 0.01, darkMetal, fdeAnodizedMat, accentMat, glassMat, redReticleMat);
    activeOptic = acogSight;
    opticCenterY = 0.098 + 0.038;
    opticCenterZ = 0.01;

    group.add(
      monoUpper,
      upperChamfer,
      lowerPolymer,
      topRail,
      sideRailL,
      sideRailR,
      barrel,
      gasBlockSight,
      flashHider,
      muzzleBore,
      vertGrip,
      stockHinge,
      stockBody,
      cheekRiser,
      buttPad,
      gripAsm,
      magMesh,
      boltMesh,
      acogSight
    );
    muzzleZ = -0.84;
  } else if (weaponId === 'smg') {
    // ==================== VECTOR-KRISS .45 ACP CQB SUBMACHINE GUN ====================
    const upperRailReceiver = new THREE.Mesh(new THREE.BoxGeometry(0.076, 0.068, 0.42), darkMetal);
    upperRailReceiver.position.set(0, 0.042, -0.05);
    const topRail = buildPicatinnyRail(0.40, 0.080, -0.05, gunMetal, 12);

    // Iconic Angled Kriss Super-V Delayed-Blowback Lower Housing + Side Relief Channels + Knuckle Guard
    const superVHousing = new THREE.Mesh(new THREE.BoxGeometry(0.072, 0.175, 0.135), fdePolymerMat);
    superVHousing.position.set(0, -0.048, -0.18);
    superVHousing.rotation.x = 0.22;

    const superVRecess = new THREE.Mesh(new THREE.BoxGeometry(0.078, 0.095, 0.052), polymerMat);
    superVRecess.position.set(0, -0.045, -0.18);
    superVRecess.rotation.x = 0.22;

    const handBridge = new THREE.Mesh(new THREE.BoxGeometry(0.056, 0.028, 0.18), polymerMat);
    handBridge.position.set(0, -0.105, -0.05);
    handBridge.rotation.x = 0.14;

    const gripCore = new THREE.Mesh(new THREE.CapsuleGeometry(0.026, 0.12, 8, 12), polymerMat);
    gripCore.scale.set(0.95, 1, 1.35);
    gripCore.position.set(0, -0.048, 0.055);
    gripCore.rotation.x = -0.18;

    // Short Shrouded Barrel + Fluted Linear Compensator + Bore
    const barrelShroud = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.22, 14), gunMetal);
    barrelShroud.rotation.x = Math.PI / 2;
    barrelShroud.position.set(0, 0.022, -0.32);
    const muzzleBore = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.013, 0.012, 10), boreHoleMat);
    muzzleBore.rotation.x = Math.PI / 2;
    muzzleBore.position.set(0, 0.022, -0.43);

    // Skeletal Side-Folding Buttstock (Hinge Knuckle + Top/Bottom Struts + Contoured Buttpad)
    const stockHinge = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.068, 10), darkMetal);
    stockHinge.position.set(0, 0.028, 0.16);
    const stockStrutTop = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.24, 10), polymerMat);
    stockStrutTop.rotation.x = Math.PI / 2;
    stockStrutTop.position.set(0, 0.042, 0.27);
    const stockStrutBot = new THREE.Mesh(new THREE.CylinderGeometry(0.010, 0.010, 0.25, 10), polymerMat);
    stockStrutBot.rotation.x = Math.PI / 2 + 0.18;
    stockStrutBot.position.set(0, 0.012, 0.27);
    const stockButt = new THREE.Mesh(new THREE.CapsuleGeometry(0.024, 0.068, 8, 12), darkMetal);
    stockButt.scale.set(1.0, 1, 0.45);
    stockButt.position.set(0, 0.016, 0.39);

    // Extended 33-Round Angled .45 ACP Kriss ExMag2
    magMesh = new THREE.Group();
    const magStick = new THREE.Mesh(new THREE.BoxGeometry(0.044, 0.26, 0.062), polymerMat);
    const magExtension = new THREE.Mesh(new THREE.BoxGeometry(0.052, 0.075, 0.072), fdePolymerMat);
    magExtension.position.set(0, -0.10, 0);
    magMesh.add(magStick, magExtension);
    magMesh.position.set(0, -0.175, -0.205);
    magMesh.rotation.x = 0.22;
    magMesh.userData.basePos = magMesh.position.clone();

    boltMesh = new THREE.Mesh(new THREE.BoxGeometry(0.095, 0.026, 0.085), chromeMetal);
    boltMesh.position.set(0.012, 0.042, -0.10);
    boltMesh.userData.baseZ = -0.10;

    const holoSight = buildDetailedOptic('holo', 0.086, -0.02, darkMetal, gunMetal, accentMat, glassMat, redReticleMat);
    activeOptic = holoSight;
    opticCenterY = 0.086 + 0.038;
    opticCenterZ = -0.02;

    group.add(
      upperRailReceiver,
      topRail,
      superVHousing,
      superVRecess,
      handBridge,
      gripCore,
      barrelShroud,
      muzzleBore,
      stockHinge,
      stockStrutTop,
      stockStrutBot,
      stockButt,
      magMesh,
      boltMesh,
      holoSight
    );
    muzzleZ = -0.46;
  } else if (weaponId === 'lmg') {
    // ==================== ODIN-M249 (M249 SAW PARA SQUAD AUTOMATIC WEAPON) ====================
    const receiverBox = new THREE.Mesh(new THREE.BoxGeometry(0.110, 0.116, 0.52), darkMetal);
    receiverBox.position.set(0, 0.015, -0.04);

    // Stamped receiver side reinforcement ribs
    for (const side of [-1, 1]) {
      const rib = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.028, 0.44), gunMetal);
      rib.position.set(side * 0.056, 0.015, -0.04);
      group.add(rib);
    }

    // Rounded Top Feed Tray Cover with Integral Picatinny Rail
    const feedCover = new THREE.Mesh(
      new THREE.CylinderGeometry(0.054, 0.054, 0.34, 14, 1, false, -Math.PI * 0.5, Math.PI),
      gunMetal
    );
    feedCover.rotation.x = Math.PI / 2;
    feedCover.scale.set(1, 1, 0.65);
    feedCover.position.set(0, 0.074, 0.01);
    const feedRail = buildPicatinnyRail(0.30, 0.110, 0.01, darkMetal, 9);

    // Perforated Upper Barrel Heatshield & Contoured Lower Gas Cylinder Handguard
    const heatshield = new THREE.Mesh(
      new THREE.CylinderGeometry(0.046, 0.046, 0.36, 14, 1, false, -Math.PI * 0.55, Math.PI * 1.1),
      gunMetal
    );
    heatshield.rotation.x = Math.PI / 2;
    heatshield.position.set(0, 0.032, -0.46);

    const lowerForend = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.046, 0.38, 10), polymerMat);
    lowerForend.rotation.x = Math.PI / 2;
    lowerForend.scale.set(1.05, 0.82, 1);
    lowerForend.position.set(0, -0.018, -0.45);

    // Heavy Quick-Change Barrel + Carry Handle + Folded Bipod Legs + Birdcage Compensator
    const heavyBarrel = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.025, 0.52, 16), darkMetal);
    heavyBarrel.rotation.x = Math.PI / 2;
    heavyBarrel.position.set(0, 0.032, -0.66);

    const carryHandle = new THREE.Mesh(new THREE.CapsuleGeometry(0.014, 0.085, 6, 8), polymerMat);
    carryHandle.rotation.z = Math.PI / 2;
    carryHandle.position.set(0.065, 0.095, -0.28);

    const gasCylinder = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.44, 12), gunMetal);
    gasCylinder.rotation.x = Math.PI / 2;
    gasCylinder.position.set(0, -0.012, -0.62);

    const muzzleComp = new THREE.Mesh(new THREE.CylinderGeometry(0.030, 0.026, 0.085, 14), gunMetal);
    muzzleComp.rotation.x = Math.PI / 2;
    muzzleComp.position.set(0, 0.032, -0.92);
    const muzzleBore = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.015, 10), boreHoleMat);
    muzzleBore.rotation.x = Math.PI / 2;
    muzzleBore.position.set(0, 0.032, -0.96);

    const bipodL = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.34, 10), chromeMetal);
    bipodL.rotation.x = Math.PI / 2;
    bipodL.position.set(-0.048, -0.048, -0.52);
    const bipodR = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.34, 10), chromeMetal);
    bipodR.rotation.x = Math.PI / 2;
    bipodR.position.set(0.048, -0.048, -0.52);

    // Para Dual-Rod Collapsible Buttstock + Contoured Shoulder Rest
    const rodTop = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.28, 10), gunMetal);
    rodTop.rotation.x = Math.PI / 2;
    rodTop.position.set(0, 0.038, 0.34);
    const rodBot = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.28, 10), gunMetal);
    rodBot.rotation.x = Math.PI / 2;
    rodBot.position.set(0, -0.028, 0.34);
    const stockBlock = new THREE.Mesh(new THREE.CapsuleGeometry(0.032, 0.075, 8, 12), polymerMat);
    stockBlock.scale.set(1.05, 1, 0.65);
    stockBlock.position.set(0, 0.004, 0.47);

    const gripAsm = buildErgonomicGripAndTrigger(-0.052, 0.12, polymerMat, darkMetal, chromeMetal);

    // 100-Round Olive Box Drum Magazine + Visible Brass 5.56mm Linked Cartridge Belt with Copper Bullet Tips!
    magMesh = new THREE.Group();
    const drumBox = new THREE.Mesh(new THREE.BoxGeometry(0.152, 0.185, 0.152), oliveChassisMat);
    const drumBevel = new THREE.Mesh(new THREE.CylinderGeometry(0.076, 0.076, 0.152, 14), oliveChassisMat);
    drumBevel.rotation.x = Math.PI / 2;
    drumBevel.position.set(0, -0.065, 0);
    magMesh.add(drumBox, drumBevel);

    // Individual Brass Cartridges + Copper FMJ Bullet Tips on Disintegrating Link Belt
    for (let c = 0; c < 6; c++) {
      const cx = -0.075 + c * 0.012;
      const cy = 0.105 + c * 0.018;
      const cart = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.009, 0.052, 8), brassMat);
      cart.rotation.x = Math.PI / 2;
      cart.position.set(cx, cy, 0.018);
      const bulletTip = new THREE.Mesh(new THREE.ConeGeometry(0.0078, 0.024, 8), copperMat);
      bulletTip.rotation.x = -Math.PI / 2;
      bulletTip.position.set(cx, cy, -0.018);
      const link = new THREE.Mesh(new THREE.CylinderGeometry(0.0098, 0.0098, 0.022, 8), darkMetal);
      link.rotation.x = Math.PI / 2;
      link.position.set(cx, cy, 0.016);
      magMesh.add(cart, bulletTip, link);
    }
    magMesh.position.set(0, -0.145, -0.13);
    magMesh.userData.basePos = magMesh.position.clone();

    boltMesh = new THREE.Mesh(new THREE.BoxGeometry(0.125, 0.032, 0.12), chromeMetal);
    boltMesh.position.set(0.022, 0.036, -0.06);
    boltMesh.userData.baseZ = -0.06;

    const lmgHoloSight = buildDetailedOptic('holo', 0.114, 0.01, darkMetal, gunMetal, accentMat, glassMat, redReticleMat);
    activeOptic = lmgHoloSight;
    opticCenterY = 0.114 + 0.038;
    opticCenterZ = 0.01;

    group.add(
      receiverBox,
      feedCover,
      feedRail,
      heatshield,
      lowerForend,
      heavyBarrel,
      carryHandle,
      gasCylinder,
      muzzleComp,
      muzzleBore,
      bipodL,
      bipodR,
      rodTop,
      rodBot,
      stockBlock,
      gripAsm,
      magMesh,
      boltMesh,
      lmgHoloSight
    );
    muzzleZ = -0.98;
  } else if (weaponId === 'shotgun') {
    // ==================== BUCKSHOT-8 (BENELLI M4 / MOSSBERG 590 TACTICAL COMBAT SHOTGUN) ====================
    // Contoured Shotgun Receiver with Rounded Top Crown & Top Picatinny Rail
    const receiverLow = new THREE.Mesh(new THREE.BoxGeometry(0.080, 0.086, 0.44), darkMetal);
    receiverLow.position.set(0, 0.005, -0.02);
    const receiverCrown = new THREE.Mesh(
      new THREE.CylinderGeometry(0.041, 0.041, 0.44, 14, 1, false, -Math.PI * 0.5, Math.PI),
      darkMetal
    );
    receiverCrown.rotation.x = Math.PI / 2;
    receiverCrown.scale.set(1, 1, 0.65);
    receiverCrown.position.set(0, 0.048, -0.02);

    const topRail = buildPicatinnyRail(0.26, 0.078, -0.01, gunMetal, 8);

    // Heavy 18.5" Cylindrical Barrel + Perforated Steel Heatshield + Full-Length Underbarrel Mag Tube
    const barrelTop = new THREE.Mesh(new THREE.CylinderGeometry(0.021, 0.022, 0.62, 18), gunMetal);
    barrelTop.rotation.x = Math.PI / 2;
    barrelTop.position.set(0, 0.042, -0.50);

    const heatshield = new THREE.Mesh(
      new THREE.CylinderGeometry(0.026, 0.026, 0.42, 14, 1, false, -Math.PI * 0.6, Math.PI * 1.2),
      darkMetal
    );
    heatshield.rotation.x = Math.PI / 2;
    heatshield.position.set(0, 0.046, -0.42);

    const magTube = new THREE.Mesh(new THREE.CylinderGeometry(0.019, 0.019, 0.58, 16), gunMetal);
    magTube.rotation.x = Math.PI / 2;
    magTube.position.set(0, -0.008, -0.48);

    const magCap = new THREE.Mesh(new THREE.CylinderGeometry(0.021, 0.021, 0.032, 14), darkMetal);
    magCap.rotation.x = Math.PI / 2;
    magCap.position.set(0, -0.008, -0.78);

    const barrelClamp = new THREE.Mesh(new THREE.BoxGeometry(0.046, 0.082, 0.038), darkMetal);
    barrelClamp.position.set(0, 0.016, -0.68);

    // Breacher Standoff Muzzle Choke with Bore Hole
    const breacherChoke = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.023, 0.068, 14), gunMetal);
    breacherChoke.rotation.x = Math.PI / 2;
    breacherChoke.position.set(0, 0.042, -0.82);
    const muzzleBore = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.015, 12), boreHoleMat);
    muzzleBore.rotation.x = Math.PI / 2;
    muzzleBore.position.set(0, 0.042, -0.852);

    // Low-Profile Winged Front Sight Post + Top-Rail Red-Dot Reflex Sight
    const frontSightPost = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.032, 0.024), darkMetal);
    frontSightPost.position.set(0, 0.068, -0.76);
    const frontFiberDot = new THREE.Mesh(new THREE.SphereGeometry(0.0045, 8, 8), reticleMat);
    frontFiberDot.position.set(0, 0.080, -0.75);

    const shotgunReflex = buildDetailedOptic('reflex', 0.082, 0.01, darkMetal, gunMetal, accentMat, glassMat, redReticleMat);
    activeOptic = shotgunReflex;
    opticCenterY = 0.082 + 0.038;
    opticCenterZ = 0.01;

    // Sliding Cylindrical Ribbed Corncob Pump Forend (`boltMesh` so it pumps on each shot!)
    boltMesh = new THREE.Group();
    const pumpCore = new THREE.Mesh(new THREE.CylinderGeometry(0.034, 0.034, 0.25, 16), polymerMat);
    pumpCore.rotation.x = Math.PI / 2;
    boltMesh.add(pumpCore);
    for (let r = 0; r < 6; r++) {
      const ribRing = new THREE.Mesh(new THREE.TorusGeometry(0.035, 0.004, 6, 16), darkMetal);
      ribRing.position.set(0, 0, -0.10 + r * 0.04);
      boltMesh.add(ribRing);
    }
    const actionBar = new THREE.Mesh(new THREE.BoxGeometry(0.056, 0.016, 0.34), chromeMetal);
    actionBar.position.set(0, 0.018, 0.10);
    boltMesh.add(actionBar);
    boltMesh.position.set(0, -0.012, -0.37);
    boltMesh.userData.baseZ = -0.37;

    // Side Saddle Shell Holder (`magMesh`) with 5 Detailed 12-Gauge Buckshot Shells (Crimson Hull + High Brass)
    magMesh = new THREE.Group();
    const saddlePlate = new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.074, 0.24), darkMetal);
    saddlePlate.position.set(0.046, 0.012, -0.02);
    magMesh.add(saddlePlate);
    const shellHullMat = new THREE.MeshStandardMaterial({ color: 0xb91c1c, roughness: 0.38, metalness: 0.15 });
    for (let s = 0; s < 5; s++) {
      const sz = -0.10 + s * 0.042;
      const shellHull = new THREE.Mesh(new THREE.CylinderGeometry(0.0105, 0.0105, 0.058, 12), shellHullMat);
      shellHull.position.set(0.056, 0.006, sz);
      const shellBrass = new THREE.Mesh(new THREE.CylinderGeometry(0.0112, 0.0112, 0.022, 12), brassMat);
      shellBrass.position.set(0.056, 0.034, sz);
      magMesh.add(shellHull, shellBrass);
    }
    magMesh.position.set(0, -0.005, 0.01);
    magMesh.userData.basePos = magMesh.position.clone();

    // Tactical Collapsible Pistol-Grip Shotgun Stock
    const stockTube = new THREE.Mesh(new THREE.CylinderGeometry(0.020, 0.020, 0.28, 12), darkMetal);
    stockTube.rotation.x = Math.PI / 2 - 0.10;
    stockTube.position.set(0, 0.002, 0.32);
    const stockComb = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.036, 0.22, 12), polymerMat);
    stockComb.rotation.x = Math.PI / 2 - 0.08;
    stockComb.scale.set(0.85, 1.35, 1);
    stockComb.position.set(0, -0.015, 0.36);
    const recoilPad = new THREE.Mesh(new THREE.CapsuleGeometry(0.028, 0.078, 8, 12), darkMetal);
    recoilPad.scale.set(1.0, 1, 0.48);
    recoilPad.position.set(0, -0.022, 0.47);

    const gripAsm = buildErgonomicGripAndTrigger(-0.042, 0.16, polymerMat, darkMetal, chromeMetal);

    group.add(
      receiverLow,
      receiverCrown,
      topRail,
      barrelTop,
      heatshield,
      magTube,
      magCap,
      barrelClamp,
      breacherChoke,
      muzzleBore,
      frontSightPost,
      frontFiberDot,
      shotgunReflex,
      boltMesh,
      magMesh,
      stockTube,
      stockComb,
      recoilPad,
      gripAsm
    );
    muzzleZ = -0.88;
  } else if (weaponId === 'sniper') {
    // ==================== AWP-PHANTOM (ACCURACY INTERNATIONAL AWSM .338 LAPUA MAGNUM) ====================
    // Iconic Olive-Drab Polymer Thumbhole Chassis + Machined Steel Action Receiver
    const chassisForend = new THREE.Mesh(new THREE.BoxGeometry(0.080, 0.090, 0.68), oliveChassisMat);
    chassisForend.position.set(0, -0.008, -0.08);
    const chassisBevel = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.042, 0.68, 10), oliveChassisMat);
    chassisBevel.rotation.x = Math.PI / 2;
    chassisBevel.scale.set(0.98, 1, 0.55);
    chassisBevel.position.set(0, -0.048, -0.08);

    const steelAction = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.036, 0.34, 14), darkMetal);
    steelAction.rotation.x = Math.PI / 2;
    steelAction.position.set(0, 0.042, 0.02);

    // Thumbhole Buttstock + Adjustable Cheekpiece + Monopod Rear Spike
    const stockRear = new THREE.Mesh(new THREE.BoxGeometry(0.074, 0.116, 0.32), oliveChassisMat);
    stockRear.position.set(0, -0.012, 0.42);
    const thumbholeBridge = new THREE.Mesh(new THREE.BoxGeometry(0.068, 0.032, 0.14), oliveChassisMat);
    thumbholeBridge.position.set(0, -0.086, 0.25);
    const cheekRest = new THREE.Mesh(
      new THREE.CylinderGeometry(0.038, 0.038, 0.21, 14, 1, false, -Math.PI * 0.5, Math.PI),
      polymerMat
    );
    cheekRest.rotation.x = Math.PI / 2;
    cheekRest.position.set(0, 0.056, 0.39);
    const buttSpacer = new THREE.Mesh(new THREE.CapsuleGeometry(0.032, 0.082, 8, 12), darkMetal);
    buttSpacer.scale.set(1.05, 1, 0.52);
    buttSpacer.position.set(0, -0.015, 0.59);
    const rearMonopod = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.013, 0.095, 10), gunMetal);
    rearMonopod.position.set(0, -0.092, 0.51);
    const monopodFoot = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.020, 0.018, 10), darkMetal);
    monopodFoot.position.set(0, -0.142, 0.51);

    const gripAsm = buildErgonomicGripAndTrigger(-0.046, 0.18, oliveChassisMat, darkMetal, chromeMetal);

    // Free-Floating Heavy Fluted .338 Match Barrel + Dual-Chamber Arrowhead Muzzle Brake + Bore
    const heavyBarrel = new THREE.Mesh(new THREE.CylinderGeometry(0.019, 0.026, 0.86, 18), gunMetal);
    heavyBarrel.rotation.x = Math.PI / 2;
    heavyBarrel.position.set(0, 0.042, -0.72);

    const fluteL = new THREE.Mesh(new THREE.BoxGeometry(0.005, 0.007, 0.66), darkMetal);
    fluteL.position.set(-0.021, 0.042, -0.70);
    const fluteR = new THREE.Mesh(new THREE.BoxGeometry(0.005, 0.007, 0.66), darkMetal);
    fluteR.position.set(0.021, 0.042, -0.70);
    const fluteTop = new THREE.Mesh(new THREE.BoxGeometry(0.007, 0.005, 0.66), darkMetal);
    fluteTop.position.set(0, 0.063, -0.70);

    const muzzleBrake = new THREE.Mesh(new THREE.BoxGeometry(0.068, 0.048, 0.115), darkMetal);
    muzzleBrake.position.set(0, 0.042, -1.16);
    const brakeBaffle1 = new THREE.Mesh(new THREE.BoxGeometry(0.072, 0.028, 0.022), boreHoleMat);
    brakeBaffle1.position.set(0, 0.042, -1.14);
    const brakeBaffle2 = new THREE.Mesh(new THREE.BoxGeometry(0.072, 0.028, 0.022), boreHoleMat);
    brakeBaffle2.position.set(0, 0.042, -1.18);
    const muzzleBore = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.018, 10), boreHoleMat);
    muzzleBore.rotation.x = Math.PI / 2;
    muzzleBore.position.set(0, 0.042, -1.218);

    // Folding Parker-Hale Tactical Bipod under Forend
    const bipodMount = new THREE.Mesh(new THREE.BoxGeometry(0.062, 0.038, 0.055), darkMetal);
    bipodMount.position.set(0, -0.052, -0.40);
    for (const side of [-1, 1]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.010, 0.010, 0.29, 10), gunMetal);
      leg.rotation.x = Math.PI / 2;
      leg.position.set(side * 0.044, -0.058, -0.52);
      const spring = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.09, 10), chromeMetal);
      spring.rotation.x = Math.PI / 2;
      spring.position.set(side * 0.044, -0.058, -0.46);
      group.add(leg, spring);
    }

    // Schmidt & Bender PM II 5-25x56 High-Power Telescopic Scope with Dual Rings, Sunshade & 3 Knurled Turrets
    const scopeRail = buildPicatinnyRail(0.28, 0.080, -0.04, darkMetal, 9);
    const ringFront = new THREE.Mesh(new THREE.TorusGeometry(0.030, 0.008, 8, 18), darkMetal);
    ringFront.position.set(0, 0.135, -0.14);
    const ringRear = new THREE.Mesh(new THREE.TorusGeometry(0.030, 0.008, 8, 18), darkMetal);
    ringRear.position.set(0, 0.135, 0.03);
    const mountBridge = new THREE.Mesh(new THREE.BoxGeometry(0.042, 0.042, 0.22), darkMetal);
    mountBridge.position.set(0, 0.098, -0.055);

    const scopeTube = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.38, 18), darkMetal);
    scopeTube.rotation.x = Math.PI / 2;
    scopeTube.position.set(0, 0.135, -0.06);

    const objectiveBell = new THREE.Mesh(new THREE.CylinderGeometry(0.044, 0.026, 0.15, 20), darkMetal);
    objectiveBell.rotation.x = Math.PI / 2;
    objectiveBell.position.set(0, 0.135, -0.29);

    const objSunshade = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.065, 20, 1, true), gunMetal);
    objSunshade.rotation.x = Math.PI / 2;
    objSunshade.position.set(0, 0.135, -0.38);

    const ocularBell = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.036, 0.11, 18), darkMetal);
    ocularBell.rotation.x = Math.PI / 2;
    ocularBell.position.set(0, 0.135, 0.14);

    const coatedScopeLensMat = new THREE.MeshStandardMaterial({
      color: 0x0ea5e9,
      emissive: 0x0284c7,
      emissiveIntensity: 0.22,
      roughness: 0.08,
      metalness: 0.92,
      side: THREE.DoubleSide
    });
    const lensFront = new THREE.Mesh(new THREE.CircleGeometry(0.041, 18), coatedScopeLensMat);
    lensFront.position.set(0, 0.135, -0.36);
    const lensRear = new THREE.Mesh(new THREE.CircleGeometry(0.033, 18), coatedScopeLensMat);
    lensRear.position.set(0, 0.135, 0.196);

    const elevTurret = new THREE.Mesh(new THREE.CylinderGeometry(0.017, 0.017, 0.034, 14), gunMetal);
    elevTurret.position.set(0, 0.172, -0.05);
    const windTurret = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.030, 14), gunMetal);
    windTurret.rotation.z = Math.PI / 2;
    windTurret.position.set(0.036, 0.135, -0.05);
    const parallaxTurret = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.028, 14), gunMetal);
    parallaxTurret.rotation.z = Math.PI / 2;
    parallaxTurret.position.set(-0.035, 0.135, -0.05);

    opticCenterY = 0.135;
    opticCenterZ = 0.04;

    // 5-Round Detachable Steel Box Magazine (`magMesh`)
    magMesh = new THREE.Group();
    const sMagBody = new THREE.Mesh(new THREE.BoxGeometry(0.058, 0.155, 0.145), gunMetal);
    const sMagBase = new THREE.Mesh(new THREE.BoxGeometry(0.064, 0.024, 0.152), darkMetal);
    sMagBase.position.set(0, -0.082, 0);
    magMesh.add(sMagBody, sMagBase);
    magMesh.position.set(0, -0.105, -0.06);
    magMesh.userData.basePos = magMesh.position.clone();

    // Fluted Bolt Carrier & Bent Tactical Bolt Handle (`boltMesh`)
    boltMesh = new THREE.Group();
    const boltBody = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.16, 12), chromeMetal);
    boltBody.rotation.x = Math.PI / 2;
    boltBody.position.set(0.018, 0, 0);
    const boltStem = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.058, 8), gunMetal);
    boltStem.rotation.z = Math.PI / 2 + 0.35;
    boltStem.position.set(0.044, -0.01, 0.04);
    const boltKnob = new THREE.Mesh(new THREE.SphereGeometry(0.018, 12, 10), darkMetal);
    boltKnob.position.set(0.068, -0.022, 0.04);
    boltMesh.add(boltBody, boltStem, boltKnob);
    boltMesh.position.set(0, 0.042, 0.04);
    boltMesh.userData.baseZ = 0.04;

    group.add(
      chassisForend,
      chassisBevel,
      steelAction,
      stockRear,
      thumbholeBridge,
      cheekRest,
      buttSpacer,
      rearMonopod,
      monopodFoot,
      gripAsm,
      heavyBarrel,
      fluteL,
      fluteR,
      fluteTop,
      muzzleBrake,
      brakeBaffle1,
      brakeBaffle2,
      muzzleBore,
      bipodMount,
      scopeRail,
      ringFront,
      ringRear,
      mountBridge,
      scopeTube,
      objectiveBell,
      objSunshade,
      ocularBell,
      lensFront,
      lensRear,
      elevTurret,
      windTurret,
      parallaxTurret,
      magMesh,
      boltMesh
    );
    muzzleZ = -1.24;
  } else if (weaponId === 'knife') {
    // ==================== KARAMBIT-X (CUSTOM CURVED TACTICAL COMBAT KARAMBIT) ====================
    // Ergonomic Contoured G10 Grip Scales with Finger Grooves & Torx Screws
    const handleCore = new THREE.Mesh(new THREE.CapsuleGeometry(0.019, 0.115, 8, 12), polymerMat);
    handleCore.scale.set(0.75, 1, 1.38);
    handleCore.position.set(0, -0.035, -0.08);
    handleCore.rotation.x = 0.24;

    for (let g = 0; g < 3; g++) {
      const groove = new THREE.Mesh(new THREE.TorusGeometry(0.021, 0.004, 6, 12), darkMetal);
      groove.position.set(0, -0.01 - g * 0.032, -0.075 + g * 0.008);
      groove.rotation.x = Math.PI / 2 + 0.24;
      const screw = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.032, 8), chromeMetal);
      screw.rotation.z = Math.PI / 2;
      screw.position.set(0, -0.01 - g * 0.032, -0.075 + g * 0.008);
      group.add(groove, screw);
    }

    // Chamfered Anodized Retention Finger Ring at Pommel
    const fingerRing = new THREE.Mesh(new THREE.TorusGeometry(0.028, 0.0075, 12, 24), accentMat);
    fingerRing.rotation.y = Math.PI / 2;
    fingerRing.position.set(0, -0.128, -0.052);

    const bolsterGuard = new THREE.Mesh(new THREE.CylinderGeometry(0.020, 0.022, 0.072, 10), gunMetal);
    bolsterGuard.rotation.x = Math.PI / 2;
    bolsterGuard.scale.set(0.88, 1, 0.58);
    bolsterGuard.position.set(0, 0.036, -0.098);

    // Multi-Segment Curved Hawkbill Claw Blade with Fuller Groove & Razor Bevel Edge
    const bladeSegs = 6;
    let by = 0.048;
    let bz = -0.115;
    let bAngle = -0.20;
    for (let b = 0; b < bladeSegs; b++) {
      const segW = 0.042 * (1 - b * 0.13);
      const segLen = 0.042;
      const spine = new THREE.Mesh(new THREE.BoxGeometry(0.009, segW, segLen), darkMetal);
      spine.position.set(0, by, bz);
      spine.rotation.x = bAngle;

      const bevelEdge = new THREE.Mesh(new THREE.BoxGeometry(0.005, segW * 0.48, segLen + 0.004), chromeMetal);
      bevelEdge.position.set(0, by - segW * 0.35, bz - 0.004);
      bevelEdge.rotation.x = bAngle;

      group.add(spine, bevelEdge);
      by += Math.sin(-bAngle) * segLen * 0.86;
      bz -= Math.cos(-bAngle) * segLen * 0.86;
      bAngle -= 0.15;
    }

    group.add(handleCore, fingerRing, bolsterGuard);
    muzzleZ = -0.34;
  } else {
    // ==================== SECONDARY PISTOLS: PULSE-P9 (USP-T) / SHERIFF .50 (DEAGLE) / FRENZY-G18 ====================
    const isDeagle = weaponId === 'deagle';
    const isGlock = weaponId === 'glock';
    const slideLen = isDeagle ? 0.38 : 0.31;

    // Polymer/Steel Lower Frame with Dust Cover & Picatinny Accessory Rail
    const frame = new THREE.Mesh(
      new THREE.BoxGeometry(isDeagle ? 0.068 : 0.060, 0.046, slideLen - 0.02),
      isDeagle ? darkMetal : polymerMat
    );
    frame.position.set(0, -0.016, -0.03);

    const gripAsm = buildErgonomicGripAndTrigger(-0.036, 0.075, polymerMat, darkMetal, chromeMetal);

    // Underbarrel SureFire X300 Weapon Light / Tactical Laser Module
    const lightBody = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.095, 10), darkMetal);
    lightBody.rotation.x = Math.PI / 2;
    lightBody.scale.set(1.05, 0.78, 1);
    lightBody.position.set(0, -0.046, -0.115);
    const lightBezel = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.018, 0.028, 14), gunMetal);
    lightBezel.rotation.x = Math.PI / 2;
    lightBezel.position.set(0, -0.046, -0.172);
    const lightLens = new THREE.Mesh(new THREE.CircleGeometry(0.014, 14), reticleMat);
    lightLens.position.set(0, -0.046, -0.187);

    // Precision Cylindrical Barrel + Threaded Tip + Dark Bore Hole
    const barrelLen = isDeagle ? 0.24 : 0.21;
    const barrel = new THREE.Mesh(
      new THREE.CylinderGeometry(isDeagle ? 0.017 : 0.013, isDeagle ? 0.017 : 0.013, barrelLen, 14),
      isDeagle ? chromeMetal : darkMetal
    );
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.028, -0.14);
    const muzzleBore = new THREE.Mesh(
      new THREE.CylinderGeometry(isDeagle ? 0.012 : 0.009, isDeagle ? 0.012 : 0.009, 0.012, 10),
      boreHoleMat
    );
    muzzleBore.rotation.x = Math.PI / 2;
    muzzleBore.position.set(0, 0.028, isDeagle ? -0.258 : -0.242);

    // Reciprocating Top Slide (`boltMesh`) with Beveled Crown, Cocking Serrations, Ejection Port & 3-Dot Night Sights
    boltMesh = new THREE.Group();
    const slideMat = isDeagle ? chromeMetal : gunMetal;
    const slideLower = new THREE.Mesh(
      new THREE.BoxGeometry(isDeagle ? 0.078 : 0.066, isDeagle ? 0.056 : 0.048, slideLen),
      slideMat
    );
    const slideCrown = new THREE.Mesh(
      new THREE.CylinderGeometry(isDeagle ? 0.039 : 0.033, isDeagle ? 0.039 : 0.033, slideLen, 12),
      slideMat
    );
    slideCrown.rotation.x = Math.PI / 2;
    slideCrown.scale.set(1, 1, 0.42);
    slideCrown.position.set(0, isDeagle ? 0.028 : 0.024, 0);

    const ejectionPort = new THREE.Mesh(new THREE.BoxGeometry(0.072, 0.026, 0.068), isDeagle ? darkMetal : chromeMetal);
    ejectionPort.position.set(0.005, 0.014, 0.01);

    // Rear Slide Cocking Serration Ribs
    for (let s = 0; s < 5; s++) {
      const rib = new THREE.Mesh(
        new THREE.BoxGeometry(isDeagle ? 0.081 : 0.069, 0.038, 0.006),
        darkMetal
      );
      rib.position.set(0, 0.004, 0.075 + s * 0.014);
      boltMesh.add(rib);
    }

    // Glock 18C Fire Selector Switch on Rear Left of Slide
    if (isGlock) {
      const selector = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.012, 10), accentMat);
      selector.rotation.z = Math.PI / 2;
      selector.position.set(-0.036, 0.008, 0.11);
      boltMesh.add(selector);
    }

    const frontSight = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.016, 0.020), darkMetal);
    frontSight.position.set(0, isDeagle ? 0.044 : 0.038, -slideLen * 0.43);
    const frontDot = new THREE.Mesh(new THREE.SphereGeometry(0.004, 8, 8), reticleMat);
    frontDot.position.set(0, isDeagle ? 0.048 : 0.042, -slideLen * 0.42);

    boltMesh.add(slideLower, slideCrown, ejectionPort, frontSight, frontDot);
    boltMesh.position.set(0, 0.024, -0.03);
    boltMesh.userData.baseZ = -0.03;

    // Compact Micro Red-Dot Reflex Sight (RMR / DeltaPoint) mounted directly onto Rear Slide (`boltMesh`)
    const pistolOpticBaseY = isDeagle ? 0.070 : 0.062;
    const pistolRmr = buildDetailedOptic(
      'reflex',
      pistolOpticBaseY - 0.024,
      0.07,
      darkMetal,
      gunMetal,
      accentMat,
      glassMat,
      redReticleMat
    );
    pistolRmr.scale.setScalar(0.86);
    boltMesh.add(pistolRmr);
    activeOptic = pistolRmr;
    opticCenterY = pistolOpticBaseY + 0.038 * 0.86;
    opticCenterZ = 0.04;

    // Detachable Magazine (`magMesh` — Extended 33-Round Mag for Glock 18, Heavy Mag for Deagle/P9)
    magMesh = new THREE.Group();
    const pMagH = isGlock ? 0.25 : 0.16;
    const pMagBody = new THREE.Mesh(new THREE.BoxGeometry(0.046, pMagH, 0.068), gunMetal);
    const pMagBase = new THREE.Mesh(new THREE.BoxGeometry(0.058, 0.024, 0.082), darkMetal);
    pMagBase.position.set(0, -pMagH * 0.52, 0);
    magMesh.add(pMagBody, pMagBase);
    magMesh.position.set(0, -0.11, 0.085);
    magMesh.rotation.x = -0.28;
    magMesh.userData.basePos = magMesh.position.clone();

    group.add(frame, gripAsm, lightBody, lightBezel, lightLens, barrel, muzzleBore, boltMesh, magMesh);
    muzzleZ = isDeagle ? -0.28 : -0.26;
  }

  group.group = group;
  group.magMesh = magMesh;
  group.boltMesh = boltMesh;
  group.muzzleZ = muzzleZ;
  group.userData.weaponId = weaponId;
  group.userData.magMesh = magMesh;
  group.userData.boltMesh = boltMesh;
  group.userData.muzzleZ = muzzleZ;
  group.userData.opticType = activeOptic?.userData?.opticType || WEAPONS[weaponId]?.opticType || 'none';
  group.userData.opticCenter = { x: 0, y: opticCenterY, z: opticCenterZ };
  group.userData.opticReticle = activeOptic?.userData?.reticleGroup || null;
  group.userData.opticLens = activeOptic?.userData?.lensMesh || null;
  group.userData.opticGroup = activeOptic || null;

  return group;
}

/**
 * Toggles visibility of non-optic weapon/hand meshes during True 3D Through-Scope ADS
 * so rear stocks, receivers, rails, and arms never bloat or clip the camera near plane.
 */
export function setWeaponAdsCulling(vm, isCulled) {
  const culledList = vm?.userData?.adsCulledMeshes;
  if (!culledList) return;
  const nextCulled = Boolean(isCulled);
  if (vm.userData.isAdsCulled === nextCulled) return;
  vm.userData.isAdsCulled = nextCulled;
  const showMesh = !nextCulled;
  for (let i = 0; i < culledList.length; i++) {
    culledList[i].visible = showMesh;
  }
}

/**
 * Attaches realistic first-person tactical sleeves, forearm wraps, Garmin GPS watch, Mechanix gloves, and 3D muzzle flash.
 * Supports both `buildFirstPersonViewmodel('rifle')` and `buildFirstPersonViewmodel(group, weaponId, magMesh, boltMesh, muzzleZ)`.
 */
export function buildFirstPersonViewmodel(groupOrWeaponId = 'rifle', weaponId, magMesh, boltMesh, muzzleZ) {
  let group = groupOrWeaponId;
  let resolvedWeaponId = weaponId;
  let resolvedMagMesh = magMesh;
  let resolvedBoltMesh = boltMesh;
  let resolvedMuzzleZ = muzzleZ;

  if (typeof groupOrWeaponId === 'string' || !groupOrWeaponId || !groupOrWeaponId.isObject3D) {
    resolvedWeaponId = typeof groupOrWeaponId === 'string' ? groupOrWeaponId : (weaponId || 'rifle');
    const built = buildDetailedWeaponModel(resolvedWeaponId);
    group = built.group || built;
    resolvedMagMesh = built.magMesh;
    resolvedBoltMesh = built.boltMesh;
    resolvedMuzzleZ = built.muzzleZ;
  } else {
    resolvedWeaponId = resolvedWeaponId || group.userData?.weaponId || 'rifle';
    resolvedMagMesh = resolvedMagMesh ?? group.magMesh ?? group.userData?.magMesh ?? null;
    resolvedBoltMesh = resolvedBoltMesh ?? group.boltMesh ?? group.userData?.boltMesh ?? null;
    resolvedMuzzleZ = resolvedMuzzleZ ?? group.muzzleZ ?? group.userData?.muzzleZ ?? -0.5;
  }

  const vmScale = 1.14;
  group.scale.setScalar(vmScale);

  const isPistolWeapon = WEAPONS[resolvedWeaponId]?.slot === 2;
  const eyeReliefZ = isPistolWeapon ? 0.096 : 0.105;
  const opticCenter = group.userData?.opticCenter || { x: 0, y: 0.106, z: 0.02 };
  group.userData.adsPosition = {
    x: 0.0,
    y: -Number((opticCenter.y * vmScale).toFixed(4)),
    z: -Number((eyeReliefZ + opticCenter.z * vmScale).toFixed(4))
  };

  const bduSleeveMat = createProceduralMaterial('bdu', 0x262e36, {
    roughness: 0.78,
    metalness: 0.06
  });
  const corduraCuffMat = createProceduralMaterial('cordura', 0x5c5346, {
    roughness: 0.68,
    metalness: 0.10
  });
  const gloveLeatherMat = createProceduralMaterial('leather', 0x171a1f, {
    roughness: 0.46,
    metalness: 0.18
  });
  const carbonKnuckleMat = createProceduralMaterial('carbon', 0x242c36, {
    roughness: 0.24,
    metalness: 0.65
  });
  const skinMat = new THREE.MeshStandardMaterial({
    color: 0xd6a586,
    roughness: 0.56,
    metalness: 0.04
  });
  const watchDialMat = new THREE.MeshBasicMaterial({
    map: getWatchDialTexture(),
    color: 0xffffff
  });
  const darkMetal = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.28, metalness: 0.84 });

  // Determine weapon-specific grip coordinates for right trigger hand & left support hand
  const isKnife = resolvedWeaponId === 'knife';
  const isPistol = WEAPONS[resolvedWeaponId]?.slot === 2;
  const isSmg = resolvedWeaponId === 'smg';
  const isShotgun = resolvedWeaponId === 'shotgun';
  const isSniper = resolvedWeaponId === 'sniper';
  const isM4a1 = resolvedWeaponId === 'm4a1';
  const isScar = resolvedWeaponId === 'scar';
  const isLmg = resolvedWeaponId === 'lmg';

  let rHandZ = 0.115;
  let rHandY = -0.105;
  if (isKnife) {
    rHandZ = -0.068;
    rHandY = -0.045;
  } else if (isPistol) {
    rHandZ = 0.082;
    rHandY = -0.088;
  } else if (isSniper) {
    rHandZ = 0.195;
    rHandY = -0.095;
  } else if (isShotgun) {
    rHandZ = 0.155;
    rHandY = -0.095;
  } else if (isM4a1) {
    rHandZ = 0.105;
    rHandY = -0.102;
  } else if (isScar) {
    rHandZ = 0.115;
    rHandY = -0.102;
  } else if (isLmg) {
    rHandZ = 0.115;
    rHandY = -0.112;
  } else if (isSmg) {
    rHandZ = 0.068;
    rHandY = -0.102;
  }

  const rDeltaZ = rHandZ - 0.115;
  const rDeltaY = rHandY - (-0.105);

  // ==================== RIGHT TRIGGER HAND & TAPERED FOREARM ====================
  const rightHandGroup = new THREE.Group();
  rightHandGroup.position.set(0.012, rHandY, rHandZ);

  const rightPalm = new THREE.Mesh(new THREE.CapsuleGeometry(0.033, 0.048, 8, 12), gloveLeatherMat);
  rightPalm.rotation.x = Math.PI / 2.2;
  const rightKnuckleBridge = new THREE.Mesh(new THREE.CapsuleGeometry(0.015, 0.056, 8, 12), carbonKnuckleMat);
  rightKnuckleBridge.rotation.z = Math.PI / 2;
  rightKnuckleBridge.position.set(0.004, 0.025, -0.012);

  // Articulated 2-Segment Thumb wrapping around left side of pistol/knife grip
  const rightThumb = new THREE.Mesh(new THREE.CapsuleGeometry(0.012, 0.032, 6, 8), gloveLeatherMat);
  rightThumb.position.set(-0.032, 0.01, -0.018);
  rightThumb.rotation.set(0.45, 0.35, 0.55);
  const rightThumbTip = new THREE.Mesh(new THREE.CapsuleGeometry(0.010, 0.022, 6, 8), gloveLeatherMat);
  rightThumbTip.position.set(-0.024, 0.018, -0.036);
  rightThumbTip.rotation.set(0.15, 0.65, 0.35);

  // 4 Articulated 2-Phalanx Fingers (Index finger extended onto trigger, 3 fingers curled around grip)
  for (let f = 0; f < 4; f++) {
    const isTriggerFinger = f === 0 && !isKnife;
    const fy = -0.008 - f * 0.018;
    const fz = -0.034 + (isTriggerFinger ? -0.018 : 0);
    const proximal = new THREE.Mesh(new THREE.CapsuleGeometry(0.0095, 0.028, 6, 8), gloveLeatherMat);
    proximal.position.set(-0.010, fy, fz);
    proximal.rotation.z = Math.PI / 2;
    proximal.rotation.y = isTriggerFinger ? -0.35 : 0.08;

    const distal = new THREE.Mesh(new THREE.CapsuleGeometry(0.0082, 0.022, 6, 8), carbonKnuckleMat);
    distal.position.set(-0.026, fy, fz + (isTriggerFinger ? -0.006 : 0.012));
    distal.rotation.z = Math.PI / 2;
    distal.rotation.y = isTriggerFinger ? -0.65 : 0.72;
    rightHandGroup.add(proximal, distal);
  }
  rightHandGroup.add(rightPalm, rightKnuckleBridge, rightThumb, rightThumbTip);

  // Under Euler 'XYZ' with rx = Math.PI/2 + 0.22, negative rz angles the front wrist (-local Y) inward toward x = 0.012
  const rightWristSkin = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.039, 0.05, 14), skinMat);
  rightWristSkin.rotation.x = Math.PI / 2 + 0.22;
  rightWristSkin.rotation.z = -0.22;
  rightWristSkin.position.set(0.018, -0.118 + rDeltaY, 0.142 + rDeltaZ);

  const rightCuffRoll = new THREE.Mesh(new THREE.TorusGeometry(0.044, 0.011, 8, 18), corduraCuffMat);
  rightCuffRoll.position.set(0.023, -0.126 + rDeltaY, 0.162 + rDeltaZ);
  rightCuffRoll.rotation.y = 0.22;

  const rightForearm = new THREE.Mesh(new THREE.CapsuleGeometry(0.046, 0.28, 10, 16), bduSleeveMat);
  rightForearm.rotation.x = Math.PI / 2 + 0.22;
  rightForearm.rotation.z = -0.22;
  rightForearm.position.set(0.052, -0.158 + rDeltaY, 0.285 + rDeltaZ);

  group.add(rightHandGroup, rightWristSkin, rightCuffRoll, rightForearm);

  // ==================== LEFT SUPPORT HAND (C-CLAMP / TWO-HAND PISTOL / CQB GUARD), GARMIN GPS WATCH & FOREARM ====================
  let lHandX = -0.022;
  let lHandY = -0.055;
  let lHandZ = -0.33;
  if (isKnife) {
    lHandX = -0.095;
    lHandY = -0.082;
    lHandZ = -0.055;
  } else if (isPistol) {
    lHandX = -0.018;
    lHandY = -0.088;
    lHandZ = 0.055;
  } else if (isSmg) {
    lHandX = -0.018;
    lHandY = -0.105;
    lHandZ = -0.185;
  } else if (isScar) {
    lHandX = -0.020;
    lHandY = -0.082;
    lHandZ = -0.34;
  } else if (isLmg) {
    lHandX = -0.024;
    lHandY = -0.055;
    lHandZ = -0.44;
  } else if (isShotgun) {
    lHandX = -0.020;
    lHandY = -0.042;
    lHandZ = -0.35;
  } else if (isSniper) {
    lHandX = -0.022;
    lHandY = -0.048;
    lHandZ = -0.31;
  }

  const lDeltaX = lHandX - (-0.022);
  const lDeltaY = lHandY - (-0.055);
  const lDeltaZ = lHandZ - (-0.33);

  const leftHandGroup = new THREE.Group();
  leftHandGroup.position.set(lHandX, lHandY, lHandZ);

  const leftPalm = new THREE.Mesh(new THREE.CapsuleGeometry(0.033, 0.052, 8, 12), gloveLeatherMat);
  leftPalm.rotation.x = Math.PI / 2;
  const leftKnuckleBridge = new THREE.Mesh(new THREE.CapsuleGeometry(0.015, 0.058, 8, 12), carbonKnuckleMat);
  leftKnuckleBridge.rotation.z = Math.PI / 2;
  leftKnuckleBridge.position.set(-0.005, 0.022, 0);

  const leftThumb = new THREE.Mesh(new THREE.CapsuleGeometry(0.012, 0.046, 6, 8), gloveLeatherMat);
  leftThumb.position.set(-0.018, 0.032, -0.02);
  leftThumb.rotation.set(0.2, -0.4, -0.8);

  for (let f = 0; f < 4; f++) {
    const fz = -0.042 + f * 0.022;
    const fingerProx = new THREE.Mesh(new THREE.CapsuleGeometry(0.0095, 0.030, 6, 8), gloveLeatherMat);
    fingerProx.position.set(0.012, -0.018, fz);
    fingerProx.rotation.z = Math.PI / 2.3;

    const fingerDist = new THREE.Mesh(new THREE.CapsuleGeometry(0.0082, 0.022, 6, 8), carbonKnuckleMat);
    fingerDist.position.set(0.026, -0.006, fz);
    fingerDist.rotation.z = Math.PI / 4.2;
    leftHandGroup.add(fingerProx, fingerDist);
  }
  leftHandGroup.add(leftPalm, leftKnuckleBridge, leftThumb);

  // Tactical Wrist Chrono-Watch with Illuminated OLED Telemetry Dial seated on inner-top left wrist
  const watchCase = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.014, 16), darkMetal);
  watchCase.position.set(-0.034 + lDeltaX, -0.052 + lDeltaY, -0.285 + lDeltaZ);
  watchCase.rotation.z = -0.32;
  const watchFace = new THREE.Mesh(new THREE.CylinderGeometry(0.020, 0.020, 0.016, 16), watchDialMat);
  watchFace.position.copy(watchCase.position);
  watchFace.rotation.copy(watchCase.rotation);
  const leftWristStrap = new THREE.Mesh(new THREE.TorusGeometry(0.044, 0.0085, 8, 18), corduraCuffMat);
  leftWristStrap.position.set(-0.038 + lDeltaX, -0.082 + lDeltaY, -0.288 + lDeltaZ);
  leftWristStrap.rotation.y = -0.36;

  // Under Euler 'XYZ' with rx = Math.PI/2 + 0.25, positive rz (+0.36) angles the front wrist (-local Y) inward to leftHandGroup
  const leftForearm = new THREE.Mesh(new THREE.CapsuleGeometry(0.046, 0.32, 10, 16), bduSleeveMat);
  leftForearm.rotation.x = Math.PI / 2 + 0.25;
  leftForearm.rotation.z = 0.36;
  leftForearm.position.set(-0.086 + lDeltaX, -0.118 + lDeltaY, -0.165 + lDeltaZ);

  const leftCuffWrap = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.049, 0.14, 14), corduraCuffMat);
  leftCuffWrap.rotation.x = Math.PI / 2 + 0.25;
  leftCuffWrap.rotation.z = 0.36;
  leftCuffWrap.position.set(-0.054 + lDeltaX, -0.097 + lDeltaY, -0.247 + lDeltaZ);

  group.add(leftHandGroup, watchCase, watchFace, leftWristStrap, leftForearm, leftCuffWrap);

  // Multi-Fin 3D Muzzle Flash at Barrel Tip
  const flashGroup = new THREE.Group();
  const flashMat = new THREE.MeshBasicMaterial({
    color: 0xfef08a,
    transparent: true,
    opacity: 0.94,
    side: THREE.DoubleSide
  });
  const coreCone = new THREE.Mesh(new THREE.ConeGeometry(0.065, 0.24, 8), flashMat);
  coreCone.rotation.x = -Math.PI / 2;
  coreCone.userData.isMuzzleFlash = true;
  const crossPlaneA = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.22), flashMat);
  const crossPlaneB = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.22), flashMat);
  crossPlaneA.rotation.y = Math.PI / 4;
  crossPlaneB.rotation.y = -Math.PI / 4;
  crossPlaneA.userData.isMuzzleFlash = true;
  crossPlaneB.userData.isMuzzleFlash = true;
  flashGroup.add(coreCone, crossPlaneA, crossPlaneB);
  flashGroup.position.set(0, 0.020, resolvedMuzzleZ);
  flashGroup.visible = false;
  flashGroup.userData.isMuzzleFlash = true;
  group.add(flashGroup);

  if (group.userData.opticLens) {
    const adsCulledMeshes = [];
    group.traverse((node) => {
      if (node.isMesh && !node.userData?.isOpticAssembly && !node.userData?.isMuzzleFlash) {
        adsCulledMeshes.push(node);
      }
    });
    group.userData.adsCulledMeshes = adsCulledMeshes;
    group.userData.isAdsCulled = false;
  }

  group.userData.flashMesh = flashGroup;
  group.userData.magMesh = resolvedMagMesh;
  group.userData.boltMesh = resolvedBoltMesh;
  group.userData.rightHandGroup = rightHandGroup;
  group.userData.leftHandGroup = leftHandGroup;
  return group;
}

const _mergePos = new THREE.Vector3();
const _mergeNorm = new THREE.Vector3();
const _mergeNormMat = new THREE.Matrix3();

export function mergeTransformedGeometries(entries) {
  let totalVerts = 0;
  let totalIndices = 0;
  for (let i = 0; i < entries.length; i++) {
    const geo = entries[i].geometry;
    const pos = geo?.attributes?.position;
    if (!pos) continue;
    totalVerts += pos.count;
    totalIndices += geo.index ? geo.index.count : pos.count;
  }

  const positions = new Float32Array(totalVerts * 3);
  const normals = new Float32Array(totalVerts * 3);
  const uvs = new Float32Array(totalVerts * 2);
  const indices = totalVerts > 65535 ? new Uint32Array(totalIndices) : new Uint16Array(totalIndices);

  let vertOffset = 0;
  let idxOffset = 0;

  for (let i = 0; i < entries.length; i++) {
    const { geometry: geo, matrix } = entries[i];
    const posAttr = geo?.attributes?.position;
    if (!posAttr) continue;
    const normAttr = geo.attributes.normal;
    const uvAttr = geo.attributes.uv;
    const vCount = posAttr.count;

    _mergeNormMat.getNormalMatrix(matrix);

    for (let v = 0; v < vCount; v++) {
      _mergePos.fromBufferAttribute(posAttr, v).applyMatrix4(matrix);
      const pBase = (vertOffset + v) * 3;
      positions[pBase] = _mergePos.x;
      positions[pBase + 1] = _mergePos.y;
      positions[pBase + 2] = _mergePos.z;

      if (normAttr) {
        _mergeNorm.fromBufferAttribute(normAttr, v).applyMatrix3(_mergeNormMat).normalize();
        normals[pBase] = _mergeNorm.x;
        normals[pBase + 1] = _mergeNorm.y;
        normals[pBase + 2] = _mergeNorm.z;
      } else {
        normals[pBase + 1] = 1;
      }

      if (uvAttr) {
        const uBase = (vertOffset + v) * 2;
        uvs[uBase] = uvAttr.getX(v);
        uvs[uBase + 1] = uvAttr.getY(v);
      }
    }

    if (geo.index) {
      const idxArray = geo.index.array;
      const iCount = geo.index.count;
      for (let k = 0; k < iCount; k++) {
        indices[idxOffset + k] = idxArray[k] + vertOffset;
      }
      idxOffset += iCount;
    } else {
      for (let k = 0; k < vCount; k++) {
        indices[idxOffset + k] = vertOffset + k;
      }
      idxOffset += vCount;
    }

    vertOffset += vCount;
  }

  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  merged.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  merged.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  merged.setIndex(new THREE.BufferAttribute(indices, 1));
  merged.computeBoundingBox();
  merged.computeBoundingSphere();
  merged.userData = { shared: true };
  return merged;
}

const TP_WEAPON_TEMPLATE_CACHE = new Map();
let TP_FLASH_GEO = null;
let TP_FLASH_MAT = null;

function getThirdPersonWeaponTemplate(weaponId = 'rifle') {
  let tpl = TP_WEAPON_TEMPLATE_CACHE.get(weaponId);
  if (tpl) return tpl;

  const { group: rawGroup, muzzleZ } = buildDetailedWeaponModel(weaponId);
  rawGroup.updateMatrixWorld(true);

  const byMat = new Map();
  rawGroup.traverse((child) => {
    if (child.isMesh && child.geometry && child.material) {
      let list = byMat.get(child.material);
      if (!list) {
        list = [];
        byMat.set(child.material, list);
      }
      list.push({ geometry: child.geometry, matrix: child.matrixWorld.clone() });
    }
  });

  const batches = [];
  for (const [material, entries] of byMat.entries()) {
    material.userData = { ...(material.userData || {}), shared: true };
    const mergedGeo = mergeTransformedGeometries(entries);
    batches.push({ geometry: mergedGeo, material });
  }

  rawGroup.traverse((child) => {
    if (child.isMesh && child.geometry && !child.geometry.userData?.shared) {
      child.geometry.dispose();
    }
  });

  tpl = { batches, muzzleZ };
  TP_WEAPON_TEMPLATE_CACHE.set(weaponId, tpl);
  return tpl;
}

export function createWeaponMesh(weaponId, isFirstPerson = false) {
  if (isFirstPerson) {
    const { group, magMesh, boltMesh, muzzleZ } = buildDetailedWeaponModel(weaponId);
    return buildFirstPersonViewmodel(group, weaponId, magMesh, boltMesh, muzzleZ);
  }

  const resolvedId = weaponId || 'rifle';
  const tpl = getThirdPersonWeaponTemplate(resolvedId);
  const group = new THREE.Group();

  for (let i = 0; i < tpl.batches.length; i++) {
    const b = tpl.batches[i];
    const m = new THREE.Mesh(b.geometry, b.material);
    m.castShadow = false;
    m.frustumCulled = true;
    group.add(m);
  }

  if (!TP_FLASH_GEO) {
    TP_FLASH_GEO = new THREE.SphereGeometry(0.14, 8, 8);
    TP_FLASH_GEO.computeBoundingSphere();
    TP_FLASH_GEO.userData = { shared: true };
  }
  if (!TP_FLASH_MAT) {
    TP_FLASH_MAT = new THREE.MeshBasicMaterial({ color: 0xfef08a });
    TP_FLASH_MAT.userData = { shared: true };
  }

  // Third-person world model scale & muzzle flash
  group.scale.setScalar(1.12);
  const tpFlash = new THREE.Mesh(TP_FLASH_GEO, TP_FLASH_MAT);
  tpFlash.position.set(0, 0.02, tpl.muzzleZ);
  tpFlash.visible = false;
  tpFlash.frustumCulled = true;
  group.add(tpFlash);
  group.userData.weaponId = resolvedId;
  group.userData.muzzleZ = tpl.muzzleZ;
  group.userData.flashMesh = tpFlash;
  group.userData.magMesh = null;
  group.userData.boltMesh = null;

  return group;
}

