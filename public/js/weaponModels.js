// High-Detail Gunsmith 3D Weapon Mesh Builder & First-Person Tactical Viewmodel Rig
// Multi-part cylindrical barrels, Picatinny rails, ventilated handguards, curved magazines, optics & gloved arms

import * as THREE from '../vendor/three/three.module.js';
import { WEAPONS } from '../shared/constants.js';

const WEAPON_TEX_CACHE = new Map();

/**
 * Creates cached procedural PBR materials for brushed gunmetal, parkerized steel, stippled polymer, and AK wood.
 */
export function createProceduralMaterial(type = 'gunmetal', baseHex = 0x1e293b, extraParams = {}) {
  const key = `${type}_${baseHex}`;
  let tex = WEAPON_TEX_CACHE.get(key);

  if (!tex && typeof document !== 'undefined') {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');

    const col = new THREE.Color(baseHex);
    ctx.fillStyle = `#${col.getHexString()}`;
    ctx.fillRect(0, 0, 128, 128);

    if (type === 'gunmetal' || type === 'steel') {
      // Fine longitudinal brushed steel grain + micro oil wear
      for (let y = 0; y < 128; y += 2) {
        ctx.fillStyle = y % 4 === 0 ? 'rgba(255,255,255,0.035)' : 'rgba(0,0,0,0.045)';
        ctx.fillRect(0, y, 128, 1);
      }
    } else if (type === 'polymer') {
      // Stippled tactical polymer micro-pebble texture
      for (let y = 0; y < 128; y += 3) {
        for (let x = 0; x < 128; x += 3) {
          const n = (x * 19 + y * 37) % 16;
          ctx.fillStyle = n > 8 ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.055)';
          ctx.fillRect(x, y, 2, 2);
        }
      }
    } else if (type === 'wood') {
      // Laminated Russian birch/bakelite wood grain for AK furniture
      const darkWood = col.clone().multiplyScalar(0.72);
      ctx.fillStyle = `#${darkWood.getHexString()}`;
      for (let y = 0; y < 128; y += 6) {
        ctx.fillRect(0, y, 128, 2 + (y % 3));
      }
    }

    tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    WEAPON_TEX_CACHE.set(key, tex);
  }

  const presets = {
    gunmetal: { roughness: 0.30, metalness: 0.84 },
    steel: { roughness: 0.24, metalness: 0.88 },
    polymer: { roughness: 0.62, metalness: 0.18 },
    wood: { roughness: 0.46, metalness: 0.08 }
  }[type] || { roughness: 0.4, metalness: 0.5 };

  return new THREE.MeshStandardMaterial({
    color: baseHex,
    map: tex || null,
    roughness: extraParams.roughness ?? presets.roughness,
    metalness: extraParams.metalness ?? presets.metalness,
    ...extraParams
  });
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

  // Contoured Stippled Pistol Grip Core + Beavertail Backstrap + Flared Magwell Base
  const gripCore = new THREE.Mesh(new THREE.CapsuleGeometry(0.026, 0.115, 8, 12), gripMat);
  gripCore.scale.set(0.95, 1, 1.38);
  gripCore.rotation.x = -0.28;
  gripCore.position.set(0, -0.068, 0.012);

  const gripBase = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.032, 0.018, 10), metalMat);
  gripBase.scale.set(0.95, 1, 1.42);
  gripBase.position.set(0, -0.135, 0.032);
  gripBase.rotation.x = -0.28;

  // Rounded Trigger Guard Loop + Curved Trigger Blade
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

  gripGroup.add(gripCore, gripBase, guardLoop, triggerBlade);
  return gripGroup;
}

function buildCurvedMagazine(segments, width, depth, segHeight, curveStepRad, bodyMat, ribMat, floorMat) {
  const magGroup = new THREE.Group();
  let curY = 0;
  let curZ = 0;
  let curAngle = 0.08;

  for (let i = 0; i < segments; i++) {
    const seg = new THREE.Mesh(new THREE.BoxGeometry(width, segHeight, depth), bodyMat);
    seg.position.set(0, curY, curZ);
    seg.rotation.x = curAngle;
    magGroup.add(seg);

    // Side reinforcement stamping ribs
    const rib = new THREE.Mesh(new THREE.BoxGeometry(width + 0.005, segHeight * 0.25, depth * 0.78), ribMat);
    rib.position.set(0, curY, curZ);
    rib.rotation.x = curAngle;
    magGroup.add(rib);

    curY -= Math.cos(curAngle) * (segHeight * 0.88);
    curZ -= Math.sin(curAngle) * (segHeight * 0.88);
    curAngle += curveStepRad;
  }

  // Flared Floorplate with Ranger Pull Loop
  const floorPlate = new THREE.Mesh(new THREE.BoxGeometry(width + 0.010, 0.022, depth + 0.014), floorMat);
  floorPlate.position.set(0, curY + 0.012, curZ);
  floorPlate.rotation.x = curAngle;
  magGroup.add(floorPlate);

  return magGroup;
}

function buildDetailedOptic(type, yPos, zPos, darkMetal, gunMetal, accentMat, glassMat, reticleMat) {
  const opticGroup = new THREE.Group();
  opticGroup.position.set(0, yPos, zPos);

  if (type === 'reflex') {
    // Kobra / Aimpoint Open Reflex Red-Dot Housing with Riser Clamp & Coated Lens
    const riserMount = new THREE.Mesh(new THREE.BoxGeometry(0.044, 0.016, 0.088), darkMetal);
    const clampBolt = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.052, 8), gunMetal);
    clampBolt.rotation.z = Math.PI / 2;
    clampBolt.position.set(0, 0.002, 0.015);

    const emitterDeck = new THREE.Mesh(new THREE.BoxGeometry(0.048, 0.012, 0.094), gunMetal);
    emitterDeck.position.set(0, 0.012, 0);

    const windageDial = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.014, 10), darkMetal);
    windageDial.rotation.z = Math.PI / 2;
    windageDial.position.set(0.026, 0.012, -0.018);

    const archFrame = new THREE.Mesh(
      new THREE.CylinderGeometry(0.027, 0.027, 0.032, 14, 1, true, -Math.PI * 0.52, Math.PI * 1.04),
      darkMetal
    );
    archFrame.rotation.x = Math.PI / 2;
    archFrame.scale.set(1.0, 1.0, 0.88);
    archFrame.position.set(0, 0.035, -0.022);

    const reflexLens = new THREE.Mesh(new THREE.CircleGeometry(0.023, 14), glassMat);
    reflexLens.position.set(0, 0.034, -0.022);
    reflexLens.rotation.x = -0.08;

    const redDot = new THREE.Mesh(new THREE.SphereGeometry(0.0038, 8, 8), reticleMat);
    redDot.position.set(0, 0.034, -0.018);

    opticGroup.add(riserMount, clampBolt, emitterDeck, windageDial, archFrame, reflexLens, redDot);
  } else if (type === 'holo') {
    // EOTech EXPS3 Holographic Weapon Sight
    const baseMount = new THREE.Mesh(new THREE.BoxGeometry(0.052, 0.018, 0.105), gunMetal);
    const batteryCyl = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.050, 10), darkMetal);
    batteryCyl.rotation.z = Math.PI / 2;
    batteryCyl.position.set(0, 0.012, -0.032);

    // Outer protective aluminum hood arch
    const hoodLeft = new THREE.Mesh(new THREE.BoxGeometry(0.009, 0.052, 0.068), darkMetal);
    hoodLeft.position.set(-0.026, 0.034, 0.005);
    const hoodRight = new THREE.Mesh(new THREE.BoxGeometry(0.009, 0.052, 0.068), darkMetal);
    hoodRight.position.set(0.026, 0.034, 0.005);
    const hoodTop = new THREE.Mesh(
      new THREE.CylinderGeometry(0.030, 0.030, 0.068, 12, 1, false, -Math.PI * 0.5, Math.PI),
      darkMetal
    );
    hoodTop.rotation.x = Math.PI / 2;
    hoodTop.scale.set(1.0, 1.0, 0.42);
    hoodTop.position.set(0, 0.056, 0.005);

    const lens = new THREE.Mesh(new THREE.PlaneGeometry(0.044, 0.038), glassMat);
    lens.position.set(0, 0.035, 0.005);
    const holoRing = new THREE.Mesh(new THREE.RingGeometry(0.009, 0.012, 16), reticleMat);
    holoRing.position.set(0, 0.035, 0.002);
    const holoDot = new THREE.Mesh(new THREE.SphereGeometry(0.0035, 8, 8), reticleMat);
    holoDot.position.set(0, 0.035, 0.002);

    opticGroup.add(baseMount, batteryCyl, hoodLeft, hoodRight, hoodTop, lens, holoRing, holoDot);
  } else if (type === 'acog') {
    // Trijicon ACOG 4x32 Combat Optical Gunsight with Top Fiber-Optic Tube
    const mountBase = new THREE.Mesh(new THREE.BoxGeometry(0.044, 0.022, 0.11), darkMetal);
    const mainPrism = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.085, 12), gunMetal);
    mainPrism.rotation.x = Math.PI / 2;
    mainPrism.position.set(0, 0.032, 0);

    const objBell = new THREE.Mesh(new THREE.CylinderGeometry(0.030, 0.022, 0.058, 14), darkMetal);
    objBell.rotation.x = Math.PI / 2;
    objBell.position.set(0, 0.032, -0.068);

    const ocularBell = new THREE.Mesh(new THREE.CylinderGeometry(0.021, 0.026, 0.052, 14), darkMetal);
    ocularBell.rotation.x = Math.PI / 2;
    ocularBell.position.set(0, 0.032, 0.065);

    const fiberTube = new THREE.Mesh(new THREE.CapsuleGeometry(0.0055, 0.072, 6, 8), reticleMat);
    fiberTube.rotation.x = Math.PI / 2;
    fiberTube.position.set(0, 0.058, -0.015);

    const turretTop = new THREE.Mesh(new THREE.CylinderGeometry(0.010, 0.010, 0.018, 10), darkMetal);
    turretTop.position.set(0, 0.056, 0.022);
    const lensRear = new THREE.Mesh(new THREE.CircleGeometry(0.022, 14), glassMat);
    lensRear.position.set(0, 0.032, 0.092);
    const chevronReticle = new THREE.Mesh(new THREE.ConeGeometry(0.006, 0.010, 3), reticleMat);
    chevronReticle.position.set(0, 0.032, 0.088);

    opticGroup.add(mountBase, mainPrism, objBell, ocularBell, fiberTube, turretTop, lensRear, chevronReticle);
  }
  return opticGroup;
}

/**
 * Builds the detailed 3D gunsmith geometry for a given weapon ID.
 */
export function buildDetailedWeaponModel(weaponId = 'rifle') {
  const group = new THREE.Group();

  const darkMetal = createProceduralMaterial('gunmetal', 0x11161d, {
    roughness: 0.32,
    metalness: 0.82
  });
  const gunMetal = createProceduralMaterial('steel', 0x2c3540, {
    roughness: 0.26,
    metalness: 0.86
  });
  const polymerMat = createProceduralMaterial('polymer', 0x1b2028, {
    roughness: 0.64,
    metalness: 0.16
  });
  const fdePolymerMat = createProceduralMaterial('polymer', 0x8b7355, {
    roughness: 0.56,
    metalness: 0.22
  });
  const fdeAnodizedMat = createProceduralMaterial('gunmetal', 0xa38760, {
    roughness: 0.34,
    metalness: 0.72
  });
  const akWoodMat = createProceduralMaterial('wood', 0x6e3219, {
    roughness: 0.48,
    metalness: 0.10
  });
  const oliveChassisMat = createProceduralMaterial('polymer', 0x3b4938, {
    roughness: 0.54,
    metalness: 0.22
  });
  const chromeMetal = createProceduralMaterial('steel', 0xcbd5e1, {
    roughness: 0.18,
    metalness: 0.94
  });
  const brassMat = new THREE.MeshStandardMaterial({
    color: 0xeab308,
    roughness: 0.24,
    metalness: 0.88
  });
  const boreHoleMat = new THREE.MeshBasicMaterial({ color: 0x030508 });

  const accentColor = WEAPONS[weaponId]?.color || 0xe5a024;
  const accentMat = new THREE.MeshStandardMaterial({
    color: accentColor,
    roughness: 0.34,
    metalness: 0.68
  });
  const reticleMat = new THREE.MeshBasicMaterial({ color: 0x22c55e });
  const redReticleMat = new THREE.MeshBasicMaterial({ color: 0xef4444 });
  const glassMat = new THREE.MeshBasicMaterial({
    color: 0x38bdf8,
    transparent: true,
    opacity: 0.32,
    side: THREE.DoubleSide
  });

  let magMesh = null;
  let boltMesh = null;
  let muzzleZ = -0.78;

  if (weaponId === 'rifle') {
    // ==================== VANDAL-AK (AKM / AK-103 CUSTOM TACTICAL) ====================
    // Stamped Steel Lower Receiver + Ribbed Rounded Dust Cover
    const lowerReceiver = new THREE.Mesh(new THREE.BoxGeometry(0.076, 0.068, 0.38), darkMetal);
    lowerReceiver.position.set(0, -0.015, 0.02);

    const dustCover = new THREE.Mesh(
      new THREE.CylinderGeometry(0.039, 0.042, 0.34, 12, 1, false, -Math.PI * 0.5, Math.PI),
      gunMetal
    );
    dustCover.rotation.x = Math.PI / 2;
    dustCover.position.set(0, 0.018, 0.04);

    // Rear Sight Block & Tangent Leaf Sight
    const trunnionBlock = new THREE.Mesh(new THREE.BoxGeometry(0.072, 0.072, 0.09), darkMetal);
    trunnionBlock.position.set(0, 0.016, -0.16);
    const tangentLeaf = new THREE.Mesh(new THREE.BoxGeometry(0.036, 0.018, 0.085), chromeMetal);
    tangentLeaf.position.set(0, 0.056, -0.155);

    // Contoured Laminated Wood / Bakelite Lower Handguard & Upper Gas Tube Cover
    const lowerHandguard = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.040, 0.25, 12), akWoodMat);
    lowerHandguard.rotation.x = Math.PI / 2;
    lowerHandguard.scale.set(0.95, 1.08, 1);
    lowerHandguard.position.set(0, -0.008, -0.33);

    const upperGasCover = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.21, 10), akWoodMat);
    upperGasCover.rotation.x = Math.PI / 2;
    upperGasCover.position.set(0, 0.036, -0.32);

    // 45-Degree AK Gas Block & Exposed Steel Gas Tube
    const gasTube = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.28, 10), gunMetal);
    gasTube.rotation.x = Math.PI / 2;
    gasTube.position.set(0, 0.036, -0.36);

    const gasBlock = new THREE.Mesh(new THREE.CylinderGeometry(0.020, 0.022, 0.068, 10), darkMetal);
    gasBlock.rotation.x = 0.65;
    gasBlock.position.set(0, 0.022, -0.50);

    // Stepped Cold-Hammer-Forged Barrel + Underbarrel Cleaning Rod + Triangular Front Sight Tower
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.019, 0.48, 14), darkMetal);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.005, -0.56);

    const cleaningRod = new THREE.Mesh(new THREE.CylinderGeometry(0.0045, 0.0045, 0.34, 8), chromeMetal);
    cleaningRod.rotation.x = Math.PI / 2;
    cleaningRod.position.set(0, -0.015, -0.60);

    const frontSightTower = new THREE.Mesh(new THREE.BoxGeometry(0.024, 0.072, 0.038), darkMetal);
    frontSightTower.position.set(0, 0.034, -0.73);
    const sightHoodRing = new THREE.Mesh(new THREE.TorusGeometry(0.018, 0.0035, 8, 14, Math.PI), darkMetal);
    sightHoodRing.position.set(0, 0.062, -0.73);

    // AK-103 Multi-Port Muzzle Brake + Hollow Dark Bore
    const muzzleBrake = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.021, 0.085, 12), gunMetal);
    muzzleBrake.rotation.x = Math.PI / 2;
    muzzleBrake.position.set(0, 0.005, -0.82);
    const muzzleBore = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.015, 10), boreHoleMat);
    muzzleBore.rotation.x = Math.PI / 2;
    muzzleBore.position.set(0, 0.005, -0.86);

    // Contoured Wooden/Polymer Buttstock with Cheek Slope & Ribbed Steel Buttplate
    const stockTopStrut = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.032, 0.28, 10), akWoodMat);
    stockTopStrut.rotation.x = Math.PI / 2 - 0.08;
    stockTopStrut.scale.set(0.85, 1.35, 1);
    stockTopStrut.position.set(0, -0.012, 0.34);

    const stockBelly = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.028, 0.27, 10), akWoodMat);
    stockBelly.rotation.x = Math.PI / 2 + 0.14;
    stockBelly.position.set(0, -0.042, 0.34);

    const buttPlate = new THREE.Mesh(new THREE.BoxGeometry(0.062, 0.128, 0.024), darkMetal);
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
    const handleKnob = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.010, 0.038, 8), darkMetal);
    handleKnob.rotation.z = Math.PI / 2;
    handleKnob.position.set(0.056, 0.004, -0.045);
    boltMesh.add(carrierPlate, handleKnob);
    boltMesh.position.set(0, 0.026, -0.02);
    boltMesh.userData.baseZ = -0.02;

    // Dovetail Side-Mount Picatinny Rail + Kobra Red-Dot Reflex Sight
    const topRail = buildPicatinnyRail(0.18, 0.062, 0.02, gunMetal, 7);
    const kobraSight = buildDetailedOptic('reflex', 0.068, 0.02, darkMetal, gunMetal, accentMat, glassMat, redReticleMat);

    group.add(
      lowerReceiver,
      dustCover,
      trunnionBlock,
      tangentLeaf,
      lowerHandguard,
      upperGasCover,
      gasTube,
      gasBlock,
      barrel,
      cleaningRod,
      frontSightTower,
      sightHoodRing,
      muzzleBrake,
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
    // Forged AR-15 Upper & Lower Receivers with Magwell Flare & Brass Deflector
    const upperReceiver = new THREE.Mesh(new THREE.CylinderGeometry(0.044, 0.046, 0.28, 8), darkMetal);
    upperReceiver.rotation.x = Math.PI / 2;
    upperReceiver.scale.set(0.95, 1.05, 1);
    upperReceiver.position.set(0, 0.028, 0.01);

    const lowerReceiver = new THREE.Mesh(new THREE.BoxGeometry(0.074, 0.068, 0.26), gunMetal);
    lowerReceiver.position.set(0, -0.028, 0.02);

    const magwellFlare = new THREE.Mesh(new THREE.BoxGeometry(0.082, 0.032, 0.115), darkMetal);
    magwellFlare.position.set(0, -0.058, -0.06);

    // Octagonal M-LOK Free-Float Handguard with Cooling Slots & Full-Length Top Picatinny Rail
    const handguardTube = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.042, 0.36, 8), gunMetal);
    handguardTube.rotation.x = Math.PI / 2;
    handguardTube.rotation.z = Math.PI / 8;
    handguardTube.position.set(0, 0.024, -0.31);

    // Ventilated M-LOK Slot Cutouts on Sides
    for (let s = 0; s < 4; s++) {
      const slotZ = -0.18 - s * 0.075;
      const slotBar = new THREE.Mesh(new THREE.BoxGeometry(0.088, 0.014, 0.048), boreHoleMat);
      slotBar.position.set(0, 0.024, slotZ);
      group.add(slotBar);
    }

    const fullTopRail = buildPicatinnyRail(0.62, 0.068, -0.16, darkMetal, 18);

    // Top-Mounted AN/PEQ-15 Tactical Laser Box near Front of Handguard
    const peqBox = new THREE.Mesh(new THREE.BoxGeometry(0.062, 0.028, 0.095), fdePolymerMat);
    peqBox.position.set(0, 0.088, -0.39);
    const peqLens = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.014, 8), reticleMat);
    peqLens.rotation.x = Math.PI / 2;
    peqLens.position.set(-0.016, 0.088, -0.44);

    // Angled Magpul AFG Foregrip under Handguard
    const afgGrip = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.026, 0.12, 8), polymerMat);
    afgGrip.rotation.x = Math.PI / 2 - 0.38;
    afgGrip.position.set(0, -0.032, -0.33);

    // Barrel Step + SureFire SOCOM Cylindrical Suppressor with Knurled Collar & Bore Hole
    const barrelStub = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.14, 12), darkMetal);
    barrelStub.rotation.x = Math.PI / 2;
    barrelStub.position.set(0, 0.024, -0.53);

    const suppressorCollar = new THREE.Mesh(new THREE.CylinderGeometry(0.030, 0.030, 0.045, 14), fdeAnodizedMat);
    suppressorCollar.rotation.x = Math.PI / 2;
    suppressorCollar.position.set(0, 0.024, -0.60);

    const suppressorBody = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.24, 16), darkMetal);
    suppressorBody.rotation.x = Math.PI / 2;
    suppressorBody.position.set(0, 0.024, -0.74);

    const suppressorBore = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.013, 0.012, 10), boreHoleMat);
    suppressorBore.rotation.x = Math.PI / 2;
    suppressorBore.position.set(0, 0.024, -0.86);

    // Buffer Tube + Castle Nut + SOPMOD Crane Adjustable Buttstock
    const bufferTube = new THREE.Mesh(new THREE.CylinderGeometry(0.021, 0.021, 0.26, 12), darkMetal);
    bufferTube.rotation.x = Math.PI / 2;
    bufferTube.position.set(0, 0.024, 0.28);

    const craneCheekWeld = new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.036, 0.21, 12), polymerMat);
    craneCheekWeld.rotation.x = Math.PI / 2;
    craneCheekWeld.scale.set(1.18, 0.92, 1);
    craneCheekWeld.position.set(0, 0.022, 0.34);

    const stockStrut = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.022, 0.20, 8), polymerMat);
    stockStrut.rotation.x = 0.58;
    stockStrut.position.set(0, -0.028, 0.35);

    const rubberButtPad = new THREE.Mesh(new THREE.BoxGeometry(0.068, 0.132, 0.026), darkMetal);
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

    const holoSight = buildDetailedOptic('holo', 0.074, 0.02, darkMetal, fdeAnodizedMat, accentMat, glassMat, reticleMat);

    group.add(
      upperReceiver,
      lowerReceiver,
      magwellFlare,
      handguardTube,
      fullTopRail,
      peqBox,
      peqLens,
      afgGrip,
      barrelStub,
      suppressorCollar,
      suppressorBody,
      suppressorBore,
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
    // Iconic Monolithic Extruded FDE Aluminum Upper Receiver
    const monoUpper = new THREE.Mesh(new THREE.BoxGeometry(0.086, 0.096, 0.64), fdeAnodizedMat);
    monoUpper.position.set(0, 0.032, -0.12);
    const upperChamfer = new THREE.Mesh(new THREE.CylinderGeometry(0.044, 0.044, 0.64, 6), fdeAnodizedMat);
    upperChamfer.rotation.x = Math.PI / 2;
    upperChamfer.position.set(0, 0.068, -0.12);

    const lowerPolymer = new THREE.Mesh(new THREE.BoxGeometry(0.078, 0.068, 0.34), polymerMat);
    lowerPolymer.position.set(0, -0.032, 0.01);

    const topRail = buildPicatinnyRail(0.62, 0.092, -0.12, darkMetal, 18);
    const sideRailL = buildPicatinnyRail(0.22, 0.028, -0.32, darkMetal, 6);
    sideRailL.rotation.z = Math.PI / 2;
    sideRailL.position.set(-0.046, 0.028, 0);
    const sideRailR = buildPicatinnyRail(0.22, 0.028, -0.32, darkMetal, 6);
    sideRailR.rotation.z = -Math.PI / 2;
    sideRailR.position.set(0.046, 0.028, 0);

    // Heavy 7.62mm Free-Float Barrel + Folding Gas Block Sight + AAC 3-Prong Flash Hider
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.019, 0.021, 0.36, 14), darkMetal);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.022, -0.58);

    const gasBlockSight = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.026, 0.055, 10), gunMetal);
    gasBlockSight.rotation.x = Math.PI / 2;
    gasBlockSight.position.set(0, 0.032, -0.47);

    const flashHider = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.022, 0.088, 12), gunMetal);
    flashHider.rotation.x = Math.PI / 2;
    flashHider.position.set(0, 0.022, -0.78);
    const muzzleBore = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.015, 10), boreHoleMat);
    muzzleBore.rotation.x = Math.PI / 2;
    muzzleBore.position.set(0, 0.022, -0.822);

    // Vertical Stubby TangoDown Foregrip
    const vertGrip = new THREE.Mesh(new THREE.CapsuleGeometry(0.022, 0.085, 8, 12), fdePolymerMat);
    vertGrip.position.set(0, -0.068, -0.34);

    // Iconic FN Ugg-Boot Folding/Telescoping Buttstock with Adjustable Cheekpiece & Hinge Pin
    const stockHinge = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.115, 10), darkMetal);
    stockHinge.position.set(0, 0.018, 0.21);
    const stockBody = new THREE.Mesh(new THREE.BoxGeometry(0.072, 0.118, 0.26), fdePolymerMat);
    stockBody.position.set(0, 0.005, 0.35);
    const cheekRiser = new THREE.Mesh(
      new THREE.CylinderGeometry(0.039, 0.039, 0.22, 12, 1, false, -Math.PI * 0.5, Math.PI),
      fdePolymerMat
    );
    cheekRiser.rotation.x = Math.PI / 2;
    cheekRiser.position.set(0, 0.068, 0.34);
    const buttPad = new THREE.Mesh(new THREE.BoxGeometry(0.076, 0.142, 0.034), darkMetal);
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
    magMesh.add(magBox, magRib1, magRib2, magPullBase);
    magMesh.position.set(0, -0.135, -0.085);
    magMesh.rotation.x = 0.03;
    magMesh.userData.basePos = magMesh.position.clone();

    // Forward Reciprocating Charging Handle & Bolt Carrier
    boltMesh = new THREE.Group();
    const bcgPlate = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.034, 0.12), chromeMetal);
    bcgPlate.position.set(0.042, 0, 0.04);
    const chHandle = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.055, 8), darkMetal);
    chHandle.rotation.z = Math.PI / 2;
    chHandle.position.set(-0.056, 0.018, -0.18);
    boltMesh.add(bcgPlate, chHandle);
    boltMesh.position.set(0, 0.038, -0.05);
    boltMesh.userData.baseZ = -0.05;

    // Trijicon ACOG 4x32 Scope
    const acogSight = buildDetailedOptic('acog', 0.098, -0.03, darkMetal, fdeAnodizedMat, accentMat, glassMat, redReticleMat);

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
    const upperRailReceiver = new THREE.Mesh(new THREE.BoxGeometry(0.078, 0.068, 0.42), darkMetal);
    upperRailReceiver.position.set(0, 0.042, -0.05);
    const topRail = buildPicatinnyRail(0.40, 0.080, -0.05, gunMetal, 12);

    // Iconic Angled Kriss Super-V Delayed-Blowback Lower Housing + Integrated Knuckle Guard
    const superVHousing = new THREE.Mesh(new THREE.BoxGeometry(0.074, 0.175, 0.135), fdePolymerMat);
    superVHousing.position.set(0, -0.048, -0.18);
    superVHousing.rotation.x = 0.22;

    const handBridge = new THREE.Mesh(new THREE.BoxGeometry(0.056, 0.028, 0.18), polymerMat);
    handBridge.position.set(0, -0.105, -0.05);
    handBridge.rotation.x = 0.14;

    const gripCore = new THREE.Mesh(new THREE.CapsuleGeometry(0.026, 0.12, 8, 12), polymerMat);
    gripCore.scale.set(0.95, 1, 1.35);
    gripCore.position.set(0, -0.048, 0.055);
    gripCore.rotation.x = -0.18;

    // Short Shrouded Barrel + Linear Compensator + Bore
    const barrelShroud = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.22, 12), gunMetal);
    barrelShroud.rotation.x = Math.PI / 2;
    barrelShroud.position.set(0, 0.022, -0.32);
    const muzzleBore = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.013, 0.012, 10), boreHoleMat);
    muzzleBore.rotation.x = Math.PI / 2;
    muzzleBore.position.set(0, 0.022, -0.43);

    // Skeletal Side-Folding Buttstock (Top & Bottom Struts + Buttpad)
    const stockStrutTop = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.24, 8), polymerMat);
    stockStrutTop.rotation.x = Math.PI / 2;
    stockStrutTop.position.set(0, 0.042, 0.27);
    const stockStrutBot = new THREE.Mesh(new THREE.CylinderGeometry(0.010, 0.010, 0.25, 8), polymerMat);
    stockStrutBot.rotation.x = Math.PI / 2 + 0.18;
    stockStrutBot.position.set(0, 0.012, 0.27);
    const stockButt = new THREE.Mesh(new THREE.BoxGeometry(0.054, 0.115, 0.024), darkMetal);
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

    const holoSight = buildDetailedOptic('holo', 0.084, -0.04, darkMetal, gunMetal, accentMat, glassMat, reticleMat);

    group.add(
      upperRailReceiver,
      topRail,
      superVHousing,
      handBridge,
      gripCore,
      barrelShroud,
      muzzleBore,
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
    const receiverBox = new THREE.Mesh(new THREE.BoxGeometry(0.112, 0.118, 0.52), darkMetal);
    receiverBox.position.set(0, 0.015, -0.04);

    // Rounded Top Feed Tray Cover with Integral Picatinny Rail
    const feedCover = new THREE.Mesh(
      new THREE.CylinderGeometry(0.054, 0.054, 0.34, 12, 1, false, -Math.PI * 0.5, Math.PI),
      gunMetal
    );
    feedCover.rotation.x = Math.PI / 2;
    feedCover.scale.set(1, 0.65, 1);
    feedCover.position.set(0, 0.074, 0.01);
    const feedRail = buildPicatinnyRail(0.30, 0.110, 0.01, darkMetal, 9);

    // Perforated Upper Barrel Heatshield & Lower Gas Cylinder Handguard
    const heatshield = new THREE.Mesh(
      new THREE.CylinderGeometry(0.046, 0.046, 0.36, 12, 1, false, -Math.PI * 0.55, Math.PI * 1.1),
      gunMetal
    );
    heatshield.rotation.x = Math.PI / 2;
    heatshield.position.set(0, 0.032, -0.46);

    const lowerForend = new THREE.Mesh(new THREE.BoxGeometry(0.086, 0.068, 0.38), polymerMat);
    lowerForend.position.set(0, -0.018, -0.45);

    // Heavy Quick-Change Barrel + Carry Handle + Folded Bipod Legs + Birdcage Compensator
    const heavyBarrel = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.025, 0.52, 14), darkMetal);
    heavyBarrel.rotation.x = Math.PI / 2;
    heavyBarrel.position.set(0, 0.032, -0.66);

    const carryHandle = new THREE.Mesh(new THREE.CapsuleGeometry(0.014, 0.085, 6, 8), polymerMat);
    carryHandle.rotation.z = Math.PI / 2;
    carryHandle.position.set(0.065, 0.095, -0.28);

    const gasCylinder = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.44, 10), gunMetal);
    gasCylinder.rotation.x = Math.PI / 2;
    gasCylinder.position.set(0, -0.012, -0.62);

    const muzzleComp = new THREE.Mesh(new THREE.CylinderGeometry(0.030, 0.026, 0.085, 12), gunMetal);
    muzzleComp.rotation.x = Math.PI / 2;
    muzzleComp.position.set(0, 0.032, -0.92);
    const muzzleBore = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.015, 10), boreHoleMat);
    muzzleBore.rotation.x = Math.PI / 2;
    muzzleBore.position.set(0, 0.032, -0.96);

    const bipodL = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.34, 8), chromeMetal);
    bipodL.rotation.x = Math.PI / 2;
    bipodL.position.set(-0.048, -0.048, -0.52);
    const bipodR = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.34, 8), chromeMetal);
    bipodR.rotation.x = Math.PI / 2;
    bipodR.position.set(0.048, -0.048, -0.52);

    // Para Dual-Rod Collapsible Buttstock + Hinged Shoulder Rest
    const rodTop = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.28, 10), gunMetal);
    rodTop.rotation.x = Math.PI / 2;
    rodTop.position.set(0, 0.038, 0.34);
    const rodBot = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.28, 10), gunMetal);
    rodBot.rotation.x = Math.PI / 2;
    rodBot.position.set(0, -0.028, 0.34);
    const stockBlock = new THREE.Mesh(new THREE.BoxGeometry(0.072, 0.132, 0.055), polymerMat);
    stockBlock.position.set(0, 0.004, 0.47);

    const gripAsm = buildErgonomicGripAndTrigger(-0.052, 0.12, polymerMat, darkMetal, chromeMetal);

    // 100-Round Olive Box Drum Magazine + Visible Brass 5.56mm Linked Cartridge Belt!
    magMesh = new THREE.Group();
    const drumBox = new THREE.Mesh(new THREE.BoxGeometry(0.155, 0.19, 0.155), oliveChassisMat);
    const drumBevel = new THREE.Mesh(new THREE.CylinderGeometry(0.076, 0.076, 0.155, 12), oliveChassisMat);
    drumBevel.rotation.x = Math.PI / 2;
    drumBevel.position.set(0, -0.065, 0);
    magMesh.add(drumBox, drumBevel);

    // Individual Brass Cartridges on Disintegrating Link Belt feeding up into feed tray
    for (let c = 0; c < 6; c++) {
      const cart = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.009, 0.068, 8), brassMat);
      cart.rotation.x = Math.PI / 2;
      cart.position.set(-0.075 + c * 0.012, 0.105 + c * 0.018, 0.01);
      const link = new THREE.Mesh(new THREE.CylinderGeometry(0.0095, 0.0095, 0.022, 8), darkMetal);
      link.rotation.x = Math.PI / 2;
      link.position.set(-0.075 + c * 0.012, 0.105 + c * 0.018, 0.015);
      magMesh.add(cart, link);
    }
    magMesh.position.set(0, -0.145, -0.13);
    magMesh.userData.basePos = magMesh.position.clone();

    boltMesh = new THREE.Mesh(new THREE.BoxGeometry(0.125, 0.032, 0.12), chromeMetal);
    boltMesh.position.set(0.022, 0.036, -0.06);
    boltMesh.userData.baseZ = -0.06;

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
      boltMesh
    );
    muzzleZ = -0.98;
  } else if (weaponId === 'shotgun') {
    // ==================== BUCKSHOT-8 (BENELLI M4 / MOSSBERG 590 TACTICAL COMBAT SHOTGUN) ====================
    // Contoured Shotgun Receiver with Rounded Top Crown & Top Picatinny Rail
    const receiverLow = new THREE.Mesh(new THREE.BoxGeometry(0.082, 0.088, 0.44), darkMetal);
    receiverLow.position.set(0, 0.005, -0.02);
    const receiverCrown = new THREE.Mesh(
      new THREE.CylinderGeometry(0.041, 0.041, 0.44, 12, 1, false, -Math.PI * 0.5, Math.PI),
      darkMetal
    );
    receiverCrown.rotation.x = Math.PI / 2;
    receiverCrown.scale.set(1, 0.65, 1);
    receiverCrown.position.set(0, 0.048, -0.02);

    const topRail = buildPicatinnyRail(0.26, 0.078, -0.01, gunMetal, 8);

    // Heavy 18.5" Cylindrical Barrel + Perforated Steel Heatshield + Full-Length Underbarrel Mag Tube
    const barrelTop = new THREE.Mesh(new THREE.CylinderGeometry(0.021, 0.022, 0.62, 16), gunMetal);
    barrelTop.rotation.x = Math.PI / 2;
    barrelTop.position.set(0, 0.042, -0.50);

    const heatshield = new THREE.Mesh(
      new THREE.CylinderGeometry(0.026, 0.026, 0.42, 12, 1, false, -Math.PI * 0.6, Math.PI * 1.2),
      darkMetal
    );
    heatshield.rotation.x = Math.PI / 2;
    heatshield.position.set(0, 0.046, -0.42);

    const magTube = new THREE.Mesh(new THREE.CylinderGeometry(0.019, 0.019, 0.58, 14), gunMetal);
    magTube.rotation.x = Math.PI / 2;
    magTube.position.set(0, -0.008, -0.48);

    const barrelClamp = new THREE.Mesh(new THREE.BoxGeometry(0.046, 0.082, 0.038), darkMetal);
    barrelClamp.position.set(0, 0.016, -0.68);

    // Breacher Standoff Muzzle Choke with Bore Hole
    const breacherChoke = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.023, 0.068, 12), gunMetal);
    breacherChoke.rotation.x = Math.PI / 2;
    breacherChoke.position.set(0, 0.042, -0.82);
    const muzzleBore = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.015, 12), boreHoleMat);
    muzzleBore.rotation.x = Math.PI / 2;
    muzzleBore.position.set(0, 0.042, -0.852);

    // Ghost-Ring Rear Sight + Winged Front Sight Post
    const ghostRing = new THREE.Mesh(new THREE.TorusGeometry(0.016, 0.004, 8, 14), darkMetal);
    ghostRing.position.set(0, 0.095, 0.14);
    const frontSightPost = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.036, 0.024), darkMetal);
    frontSightPost.position.set(0, 0.075, -0.76);
    const frontFiberDot = new THREE.Mesh(new THREE.SphereGeometry(0.005, 8, 8), reticleMat);
    frontFiberDot.position.set(0, 0.088, -0.75);

    // Sliding Cylindrical Ribbed Corncob Pump Forend (`boltMesh` so it pumps on each shot!)
    boltMesh = new THREE.Group();
    const pumpCore = new THREE.Mesh(new THREE.CylinderGeometry(0.034, 0.034, 0.25, 14), polymerMat);
    pumpCore.rotation.x = Math.PI / 2;
    boltMesh.add(pumpCore);
    for (let r = 0; r < 6; r++) {
      const ribRing = new THREE.Mesh(new THREE.TorusGeometry(0.035, 0.004, 6, 14), darkMetal);
      ribRing.position.set(0, 0, -0.10 + r * 0.04);
      boltMesh.add(ribRing);
    }
    const actionBar = new THREE.Mesh(new THREE.BoxGeometry(0.056, 0.016, 0.34), chromeMetal);
    actionBar.position.set(0, 0.018, 0.10);
    boltMesh.add(actionBar);
    boltMesh.position.set(0, -0.012, -0.37);
    boltMesh.userData.baseZ = -0.37;

    // Side Saddle Shell Holder (`magMesh`) with 6 Detailed 12-Gauge Buckshot Shells (Crimson Hull + High Brass)
    magMesh = new THREE.Group();
    const saddlePlate = new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.074, 0.24), darkMetal);
    saddlePlate.position.set(0.046, 0.012, -0.02);
    magMesh.add(saddlePlate);
    const shellHullMat = new THREE.MeshStandardMaterial({ color: 0xb91c1c, roughness: 0.42, metalness: 0.15 });
    for (let s = 0; s < 5; s++) {
      const sz = -0.10 + s * 0.042;
      const shellHull = new THREE.Mesh(new THREE.CylinderGeometry(0.0105, 0.0105, 0.058, 10), shellHullMat);
      shellHull.position.set(0.056, 0.006, sz);
      const shellBrass = new THREE.Mesh(new THREE.CylinderGeometry(0.0112, 0.0112, 0.022, 10), brassMat);
      shellBrass.position.set(0.056, 0.034, sz);
      magMesh.add(shellHull, shellBrass);
    }
    magMesh.position.set(0, -0.005, 0.01);
    magMesh.userData.basePos = magMesh.position.clone();

    // Tactical Collapsible Pistol-Grip Shotgun Stock
    const stockTube = new THREE.Mesh(new THREE.CylinderGeometry(0.020, 0.020, 0.28, 12), darkMetal);
    stockTube.rotation.x = Math.PI / 2 - 0.10;
    stockTube.position.set(0, 0.002, 0.32);
    const stockComb = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.036, 0.22, 10), polymerMat);
    stockComb.rotation.x = Math.PI / 2 - 0.08;
    stockComb.scale.set(0.85, 1.35, 1);
    stockComb.position.set(0, -0.015, 0.36);
    const recoilPad = new THREE.Mesh(new THREE.BoxGeometry(0.064, 0.135, 0.030), darkMetal);
    recoilPad.position.set(0, -0.022, 0.47);

    const gripAsm = buildErgonomicGripAndTrigger(-0.042, 0.16, polymerMat, darkMetal, chromeMetal);

    group.add(
      receiverLow,
      receiverCrown,
      topRail,
      barrelTop,
      heatshield,
      magTube,
      barrelClamp,
      breacherChoke,
      muzzleBore,
      ghostRing,
      frontSightPost,
      frontFiberDot,
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
    const chassisForend = new THREE.Mesh(new THREE.BoxGeometry(0.082, 0.092, 0.68), oliveChassisMat);
    chassisForend.position.set(0, -0.008, -0.08);
    const chassisBevel = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.042, 0.68, 8), oliveChassisMat);
    chassisBevel.rotation.x = Math.PI / 2;
    chassisBevel.scale.set(0.98, 0.55, 1);
    chassisBevel.position.set(0, -0.048, -0.08);

    const steelAction = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.036, 0.34, 12), darkMetal);
    steelAction.rotation.x = Math.PI / 2;
    steelAction.position.set(0, 0.042, 0.02);

    // Thumbhole Buttstock + Adjustable Cheekpiece + Monopod Rear Spike
    const stockRear = new THREE.Mesh(new THREE.BoxGeometry(0.076, 0.118, 0.32), oliveChassisMat);
    stockRear.position.set(0, -0.012, 0.42);
    const thumbholeBridge = new THREE.Mesh(new THREE.BoxGeometry(0.068, 0.032, 0.14), oliveChassisMat);
    thumbholeBridge.position.set(0, -0.086, 0.25);
    const cheekRest = new THREE.Mesh(
      new THREE.CylinderGeometry(0.038, 0.038, 0.21, 12, 1, false, -Math.PI * 0.5, Math.PI),
      polymerMat
    );
    cheekRest.rotation.x = Math.PI / 2;
    cheekRest.position.set(0, 0.056, 0.39);
    const buttSpacer = new THREE.Mesh(new THREE.BoxGeometry(0.078, 0.138, 0.036), darkMetal);
    buttSpacer.position.set(0, -0.015, 0.59);
    const rearMonopod = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.013, 0.095, 10), gunMetal);
    rearMonopod.position.set(0, -0.092, 0.51);
    const monopodFoot = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.020, 0.018, 10), darkMetal);
    monopodFoot.position.set(0, -0.142, 0.51);

    const gripAsm = buildErgonomicGripAndTrigger(-0.046, 0.18, oliveChassisMat, darkMetal, chromeMetal);

    // Free-Floating Heavy Fluted .338 Match Barrel + Longitudinal Fluting Channels + Dual-Chamber Arrowhead Muzzle Brake + Bore
    const heavyBarrel = new THREE.Mesh(new THREE.CylinderGeometry(0.019, 0.026, 0.86, 16), gunMetal);
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
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.010, 0.010, 0.29, 8), gunMetal);
      leg.rotation.x = Math.PI / 2;
      leg.position.set(side * 0.044, -0.058, -0.52);
      const spring = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.09, 8), chromeMetal);
      spring.rotation.x = Math.PI / 2;
      spring.position.set(side * 0.044, -0.058, -0.46);
      group.add(leg, spring);
    }

    // Schmidt & Bender PM II 5-25x56 High-Power Telescopic Scope with Dual Rings, Sunshade & 3 Knurled Turrets
    const scopeRail = buildPicatinnyRail(0.28, 0.080, -0.04, darkMetal, 9);
    const ringFront = new THREE.Mesh(new THREE.TorusGeometry(0.030, 0.008, 8, 16), darkMetal);
    ringFront.position.set(0, 0.135, -0.14);
    const ringRear = new THREE.Mesh(new THREE.TorusGeometry(0.030, 0.008, 8, 16), darkMetal);
    ringRear.position.set(0, 0.135, 0.03);
    const mountBridge = new THREE.Mesh(new THREE.BoxGeometry(0.042, 0.042, 0.22), darkMetal);
    mountBridge.position.set(0, 0.098, -0.055);

    const scopeTube = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.38, 16), darkMetal);
    scopeTube.rotation.x = Math.PI / 2;
    scopeTube.position.set(0, 0.135, -0.06);

    const objectiveBell = new THREE.Mesh(new THREE.CylinderGeometry(0.044, 0.026, 0.15, 18), darkMetal);
    objectiveBell.rotation.x = Math.PI / 2;
    objectiveBell.position.set(0, 0.135, -0.29);

    const objSunshade = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.065, 18, 1, true), gunMetal);
    objSunshade.rotation.x = Math.PI / 2;
    objSunshade.position.set(0, 0.135, -0.38);

    const ocularBell = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.036, 0.11, 16), darkMetal);
    ocularBell.rotation.x = Math.PI / 2;
    ocularBell.position.set(0, 0.135, 0.14);

    const lensFront = new THREE.Mesh(new THREE.CircleGeometry(0.041, 16), glassMat);
    lensFront.position.set(0, 0.135, -0.36);
    const lensRear = new THREE.Mesh(new THREE.CircleGeometry(0.033, 16), glassMat);
    lensRear.position.set(0, 0.135, 0.196);

    const elevTurret = new THREE.Mesh(new THREE.CylinderGeometry(0.017, 0.017, 0.034, 12), gunMetal);
    elevTurret.position.set(0, 0.172, -0.05);
    const windTurret = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.030, 12), gunMetal);
    windTurret.rotation.z = Math.PI / 2;
    windTurret.position.set(0.036, 0.135, -0.05);
    const parallaxTurret = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.028, 12), gunMetal);
    parallaxTurret.rotation.z = Math.PI / 2;
    parallaxTurret.position.set(-0.035, 0.135, -0.05);

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
    const boltBody = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.16, 10), chromeMetal);
    boltBody.rotation.x = Math.PI / 2;
    boltBody.position.set(0.018, 0, 0);
    const boltStem = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.058, 8), gunMetal);
    boltStem.rotation.z = Math.PI / 2 + 0.35;
    boltStem.position.set(0.044, -0.01, 0.04);
    const boltKnob = new THREE.Mesh(new THREE.SphereGeometry(0.018, 10, 10), darkMetal);
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
      group.add(groove);
    }

    // Chamfered Anodized Retention Finger Ring at Pommel
    const fingerRing = new THREE.Mesh(new THREE.TorusGeometry(0.028, 0.0075, 10, 20), accentMat);
    fingerRing.rotation.y = Math.PI / 2;
    fingerRing.position.set(0, -0.128, -0.052);

    const bolsterGuard = new THREE.Mesh(new THREE.BoxGeometry(0.038, 0.024, 0.072), gunMetal);
    bolsterGuard.position.set(0, 0.036, -0.098);

    // Multi-Segment Curved Hawkbill Claw Blade with Fuller Groove & Razor Bevel Edge
    const bladeSegs = 5;
    let by = 0.048;
    let bz = -0.115;
    let bAngle = -0.22;
    for (let b = 0; b < bladeSegs; b++) {
      const segW = 0.042 * (1 - b * 0.14);
      const segLen = 0.048;
      const spine = new THREE.Mesh(new THREE.BoxGeometry(0.010, segW, segLen), darkMetal);
      spine.position.set(0, by, bz);
      spine.rotation.x = bAngle;

      const bevelEdge = new THREE.Mesh(new THREE.BoxGeometry(0.006, segW * 0.45, segLen + 0.004), chromeMetal);
      bevelEdge.position.set(0, by - segW * 0.35, bz - 0.004);
      bevelEdge.rotation.x = bAngle;

      group.add(spine, bevelEdge);
      by += Math.sin(-bAngle) * segLen * 0.86;
      bz -= Math.cos(-bAngle) * segLen * 0.86;
      bAngle -= 0.16;
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
    const lightBody = new THREE.Mesh(new THREE.BoxGeometry(0.048, 0.032, 0.095), darkMetal);
    lightBody.position.set(0, -0.046, -0.115);
    const lightBezel = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.018, 0.028, 12), gunMetal);
    lightBezel.rotation.x = Math.PI / 2;
    lightBezel.position.set(0, -0.046, -0.172);
    const lightLens = new THREE.Mesh(new THREE.CircleGeometry(0.014, 12), reticleMat);
    lightLens.position.set(0, -0.046, -0.187);

    // Precision Cylindrical Barrel + Threaded Tip + Dark Bore Hole
    const barrelLen = isDeagle ? 0.24 : 0.21;
    const barrel = new THREE.Mesh(
      new THREE.CylinderGeometry(isDeagle ? 0.017 : 0.013, isDeagle ? 0.017 : 0.013, barrelLen, 12),
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
      new THREE.CylinderGeometry(isDeagle ? 0.039 : 0.033, isDeagle ? 0.039 : 0.033, slideLen, 8),
      slideMat
    );
    slideCrown.rotation.x = Math.PI / 2;
    slideCrown.scale.set(1, 0.45, 1);
    slideCrown.position.set(0, isDeagle ? 0.028 : 0.024, 0);

    const ejectionPort = new THREE.Mesh(new THREE.BoxGeometry(0.072, 0.026, 0.068), isDeagle ? darkMetal : chromeMetal);
    ejectionPort.position.set(0.005, 0.014, 0.01);

    // Rear Slide Cocking Serration Ribs
    for (let s = 0; s < 5; s++) {
      const rib = new THREE.Mesh(
        new THREE.BoxGeometry((isDeagle ? 0.081 : 0.069), 0.038, 0.006),
        darkMetal
      );
      rib.position.set(0, 0.004, 0.075 + s * 0.014);
      boltMesh.add(rib);
    }

    // Glock 18C Fire Selector Switch on Rear Left of Slide
    if (isGlock) {
      const selector = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.012, 8), accentMat);
      selector.rotation.z = Math.PI / 2;
      selector.position.set(-0.036, 0.008, 0.11);
      boltMesh.add(selector);
    }

    const rearSight = new THREE.Mesh(new THREE.BoxGeometry(0.044, 0.018, 0.020), darkMetal);
    rearSight.position.set(0, isDeagle ? 0.048 : 0.042, slideLen * 0.42);
    const rearDots = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.008, 0.022), reticleMat);
    rearDots.position.set(0, isDeagle ? 0.050 : 0.044, slideLen * 0.42);

    const frontSight = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.018, 0.022), darkMetal);
    frontSight.position.set(0, isDeagle ? 0.048 : 0.042, -slideLen * 0.43);
    const frontDot = new THREE.Mesh(new THREE.SphereGeometry(0.0045, 8, 8), reticleMat);
    frontDot.position.set(0, isDeagle ? 0.051 : 0.045, -slideLen * 0.42);

    boltMesh.add(slideLower, slideCrown, ejectionPort, rearSight, rearDots, frontSight, frontDot);
    boltMesh.position.set(0, 0.024, -0.03);
    boltMesh.userData.baseZ = -0.03;

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

  return group;
}

/**
 * Attaches realistic first-person tactical sleeves, forearm wraps, GPS watch, Mechanix gloves, and 3D muzzle flash.
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

  group.scale.setScalar(1.14);

  const bduSleeveMat = createProceduralMaterial('polymer', 0x262e36, {
    roughness: 0.76,
    metalness: 0.08
  });
  const corduraCuffMat = createProceduralMaterial('polymer', 0x5c5346, {
    roughness: 0.68,
    metalness: 0.14
  });
  const gloveLeatherMat = createProceduralMaterial('polymer', 0x171a1f, {
    roughness: 0.52,
    metalness: 0.22
  });
  const carbonKnuckleMat = createProceduralMaterial('gunmetal', 0x28303b, {
    roughness: 0.28,
    metalness: 0.65
  });
  const skinMat = new THREE.MeshStandardMaterial({
    color: 0xd4a383,
    roughness: 0.60,
    metalness: 0.04
  });
  const watchDialMat = new THREE.MeshBasicMaterial({ color: 0xe5a024 });
  const darkMetal = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.3, metalness: 0.8 });

  // Determine weapon-specific grip coordinates for right trigger hand & left support hand
  const isKnife = resolvedWeaponId === 'knife';
  const isPistol = WEAPONS[resolvedWeaponId]?.slot === 2;
  const isSmg = resolvedWeaponId === 'smg';
  const isShotgun = resolvedWeaponId === 'shotgun';
  const isSniper = resolvedWeaponId === 'sniper';
  const isFamas = resolvedWeaponId === 'famas';

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
  } else if (isFamas) {
    rHandZ = 0.025;
    rHandY = -0.095;
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
  const rightKnuckleBridge = new THREE.Mesh(new THREE.CapsuleGeometry(0.015, 0.056, 6, 10), carbonKnuckleMat);
  rightKnuckleBridge.rotation.z = Math.PI / 2;
  rightKnuckleBridge.position.set(0.004, 0.025, -0.012);

  // Articulated Thumb wrapping around left side of pistol/knife grip
  const rightThumb = new THREE.Mesh(new THREE.CapsuleGeometry(0.012, 0.044, 6, 8), gloveLeatherMat);
  rightThumb.position.set(-0.032, 0.01, -0.018);
  rightThumb.rotation.set(0.45, 0.35, 0.55);

  // 4 Articulated Fingers (Index finger extended onto trigger, 3 fingers wrapped around grip)
  for (let f = 0; f < 4; f++) {
    const finger = new THREE.Mesh(new THREE.CapsuleGeometry(0.0095, 0.044, 6, 8), gloveLeatherMat);
    finger.position.set(-0.014, -0.008 - f * 0.018, -0.036 + (f === 0 && !isKnife ? -0.018 : 0));
    finger.rotation.z = Math.PI / 2;
    finger.rotation.y = f === 0 && !isKnife ? -0.35 : 0.1;
    rightHandGroup.add(finger);
  }
  rightHandGroup.add(rightPalm, rightKnuckleBridge, rightThumb);

  const rightWristSkin = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.039, 0.05, 12), skinMat);
  rightWristSkin.rotation.x = Math.PI / 2 + 0.22;
  rightWristSkin.rotation.z = 0.16;
  rightWristSkin.position.set(0.024, -0.122 + rDeltaY, 0.16 + rDeltaZ);

  const rightCuffRoll = new THREE.Mesh(new THREE.TorusGeometry(0.044, 0.010, 8, 16), corduraCuffMat);
  rightCuffRoll.position.set(0.032, -0.132 + rDeltaY, 0.185 + rDeltaZ);
  rightCuffRoll.rotation.y = -0.15;

  const rightForearm = new THREE.Mesh(new THREE.CapsuleGeometry(0.045, 0.28, 10, 14), bduSleeveMat);
  rightForearm.rotation.x = Math.PI / 2 + 0.22;
  rightForearm.rotation.z = 0.16;
  rightForearm.position.set(0.062, -0.172 + rDeltaY, 0.31 + rDeltaZ);

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
  } else if (isFamas) {
    lHandX = -0.020;
    lHandY = -0.052;
    lHandZ = -0.22;
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
  const leftKnuckleBridge = new THREE.Mesh(new THREE.CapsuleGeometry(0.015, 0.058, 6, 10), carbonKnuckleMat);
  leftKnuckleBridge.rotation.z = Math.PI / 2;
  leftKnuckleBridge.position.set(-0.005, 0.022, 0);

  const leftThumb = new THREE.Mesh(new THREE.CapsuleGeometry(0.012, 0.046, 6, 8), gloveLeatherMat);
  leftThumb.position.set(-0.018, 0.032, -0.02);
  leftThumb.rotation.set(0.2, -0.4, -0.8);

  for (let f = 0; f < 4; f++) {
    const finger = new THREE.Mesh(new THREE.CapsuleGeometry(0.0095, 0.046, 6, 8), gloveLeatherMat);
    finger.position.set(0.016, -0.018, -0.042 + f * 0.022);
    finger.rotation.z = Math.PI / 2.3;
    leftHandGroup.add(finger);
  }
  leftHandGroup.add(leftPalm, leftKnuckleBridge, leftThumb);

  // Tactical Wrist Chrono-Watch with Amber Military Telemetry Dial
  const watchCase = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, 0.014, 14), darkMetal);
  watchCase.position.set(-0.054 + lDeltaX, -0.048 + lDeltaY, -0.22 + lDeltaZ);
  watchCase.rotation.z = 0.35;
  const watchFace = new THREE.Mesh(new THREE.CylinderGeometry(0.019, 0.019, 0.016, 14), watchDialMat);
  watchFace.position.copy(watchCase.position);
  watchFace.rotation.copy(watchCase.rotation);
  const leftWristStrap = new THREE.Mesh(new THREE.TorusGeometry(0.044, 0.008, 8, 16), corduraCuffMat);
  leftWristStrap.position.set(-0.064 + lDeltaX, -0.078 + lDeltaY, -0.22 + lDeltaZ);
  leftWristStrap.rotation.y = 0.42;

  const leftForearm = new THREE.Mesh(new THREE.CapsuleGeometry(0.045, 0.32, 10, 14), bduSleeveMat);
  leftForearm.rotation.x = Math.PI / 2 + 0.25;
  leftForearm.rotation.z = -0.42;
  leftForearm.position.set(-0.16 + lDeltaX, -0.162 + lDeltaY, -0.055 + lDeltaZ);

  const leftCuffWrap = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.048, 0.14, 12), corduraCuffMat);
  leftCuffWrap.rotation.x = Math.PI / 2 + 0.25;
  leftCuffWrap.rotation.z = -0.42;
  leftCuffWrap.position.set(-0.115 + lDeltaX, -0.125 + lDeltaY, -0.135 + lDeltaZ);

  group.add(leftHandGroup, watchCase, watchFace, leftWristStrap, leftForearm, leftCuffWrap);

  // Multi-Fin 3D Muzzle Flash at Barrel Tip
  const flashGroup = new THREE.Group();
  const flashMat = new THREE.MeshBasicMaterial({
    color: 0xfef08a,
    transparent: true,
    opacity: 0.94,
    side: THREE.DoubleSide
  });
  const coreCone = new THREE.Mesh(new THREE.ConeGeometry(0.082, 0.28, 6), flashMat);
  coreCone.rotation.x = -Math.PI / 2;
  const crossPlaneA = new THREE.Mesh(new THREE.PlaneGeometry(0.30, 0.30), flashMat);
  const crossPlaneB = new THREE.Mesh(new THREE.PlaneGeometry(0.30, 0.30), flashMat);
  crossPlaneA.rotation.y = Math.PI / 4;
  crossPlaneB.rotation.y = -Math.PI / 4;
  flashGroup.add(coreCone, crossPlaneA, crossPlaneB);
  flashGroup.position.set(0, 0.025, resolvedMuzzleZ);
  flashGroup.visible = false;
  group.add(flashGroup);

  group.userData.flashMesh = flashGroup;
  group.userData.magMesh = resolvedMagMesh;
  group.userData.boltMesh = resolvedBoltMesh;
  group.userData.rightHandGroup = rightHandGroup;
  group.userData.leftHandGroup = leftHandGroup;
  return group;
}

export function createWeaponMesh(weaponId, isFirstPerson = false) {
  const { group, magMesh, boltMesh, muzzleZ } = buildDetailedWeaponModel(weaponId);

  if (isFirstPerson) {
    return buildFirstPersonViewmodel(group, weaponId, magMesh, boltMesh, muzzleZ);
  }

  // Third-person world model scale & muzzle flash
  group.scale.setScalar(1.12);
  const tpFlash = new THREE.Mesh(
    new THREE.SphereGeometry(0.14, 6, 6),
    new THREE.MeshBasicMaterial({ color: 0xfef08a })
  );
  tpFlash.position.set(0, 0.02, muzzleZ);
  tpFlash.visible = false;
  group.add(tpFlash);
  group.userData.flashMesh = tpFlash;
  group.userData.magMesh = magMesh;
  group.userData.boltMesh = boltMesh;

  return group;
}
