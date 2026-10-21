import * as THREE from '../three.js';

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
    flatShading: false,
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
export function buildPicatinnyRail(length, yPos, zCenter, mat, toothCount = 12) {
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

export function buildErgonomicGripAndTrigger(yPos, zPos, gripMat, metalMat, boreMat) {
  const gripGroup = new THREE.Group();
  gripGroup.position.set(0, yPos, zPos);

  // Contoured Stippled Pistol Grip Core + Beavertail Backstrap + Finger Grooves + Flared Magwell Base
  const gripCore = new THREE.Mesh(new THREE.CapsuleGeometry(0.026, 0.115, 10, 18), gripMat);
  gripCore.scale.set(0.95, 1, 1.38);
  gripCore.rotation.x = -0.28;
  gripCore.position.set(0, -0.068, 0.012);

  const beavertail = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.024, 0.045, 14), gripMat);
  beavertail.rotation.x = -0.55;
  beavertail.position.set(0, -0.014, 0.028);

  const gripBase = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.033, 0.018, 16), metalMat);
  gripBase.scale.set(0.95, 1, 1.42);
  gripBase.position.set(0, -0.135, 0.032);
  gripBase.rotation.x = -0.28;

  // Ambidextrous Fire Selector Switch on Receiver Side (sized to sit flush on both pistol & rifle frames)
  const selectorPin = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.056, 12), metalMat);
  selectorPin.rotation.z = Math.PI / 2;
  selectorPin.position.set(0, 0.012, -0.008);
  const selectorLever = new THREE.Mesh(new THREE.BoxGeometry(0.060, 0.007, 0.024), boreMat);
  selectorLever.position.set(0, 0.012, -0.015);
  selectorLever.rotation.x = 0.25;

  // Rounded Trigger Guard Loop + Curved Match Trigger Blade
  const guardLoop = new THREE.Mesh(
    new THREE.TorusGeometry(0.036, 0.0055, 10, 20, Math.PI * 1.15),
    metalMat
  );
  guardLoop.rotation.y = Math.PI / 2;
  guardLoop.rotation.x = Math.PI * 0.92;
  guardLoop.position.set(0, -0.022, -0.048);

  const triggerBlade = new THREE.Mesh(
    new THREE.TorusGeometry(0.016, 0.004, 8, 14, Math.PI * 0.65),
    boreMat
  );
  triggerBlade.rotation.y = Math.PI / 2;
  triggerBlade.rotation.x = Math.PI * 0.65;
  triggerBlade.position.set(0, -0.014, -0.042);

  gripGroup.add(gripCore, beavertail, gripBase, selectorPin, selectorLever, guardLoop, triggerBlade);
  return gripGroup;
}

export function buildCurvedMagazine(segments, width, depth, segHeight, curveStepRad, bodyMat, ribMat, floorMat) {
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

export function buildDetailedOptic(type, yPos, zPos, darkMetal, gunMetal, accentMat, glassMat, reticleMat) {
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

    const redDotHalo = new THREE.Mesh(new THREE.CircleGeometry(0.0011, 20), reticleHaloMat);
    const redDot = new THREE.Mesh(new THREE.CircleGeometry(0.0006, 20), reticleMainMat);
    const redDotCore = new THREE.Mesh(new THREE.CircleGeometry(0.00028, 16), reticleCoreMat);
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

    const holoRingHalo = new THREE.Mesh(new THREE.RingGeometry(0.0070, 0.0084, 36), reticleHaloMat);
    const holoRing = new THREE.Mesh(new THREE.RingGeometry(0.0074, 0.0080, 36), reticleMainMat);
    const holoDotHalo = new THREE.Mesh(new THREE.CircleGeometry(0.00085, 16), reticleHaloMat);
    const holoDot = new THREE.Mesh(new THREE.CircleGeometry(0.00046, 16), reticleMainMat);
    const holoDotCore = new THREE.Mesh(new THREE.CircleGeometry(0.00022, 12), reticleCoreMat);
    const tickTop = new THREE.Mesh(new THREE.PlaneGeometry(0.0006, 0.0024), reticleMainMat);
    tickTop.position.set(0, 0.0092, 0);
    const tickBot = new THREE.Mesh(new THREE.PlaneGeometry(0.0006, 0.0024), reticleMainMat);
    tickBot.position.set(0, -0.0092, 0);
    const tickLeft = new THREE.Mesh(new THREE.PlaneGeometry(0.0024, 0.0006), reticleMainMat);
    tickLeft.position.set(-0.0092, 0, 0);
    const tickRight = new THREE.Mesh(new THREE.PlaneGeometry(0.0024, 0.0006), reticleMainMat);
    tickRight.position.set(0.0092, 0, 0);

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

export { getWatchDialTexture };
