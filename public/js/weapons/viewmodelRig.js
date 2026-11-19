import * as THREE from '../three.js';
import { WEAPONS } from '../shared.js';
import {
  WEAPON_MAT_CACHE,
  createChamferedBlockGeometry,
  createLoftedTubeGeometry,
  createProceduralMaterial,
  getWatchDialTexture
} from './weaponMaterials.js';
import { roundedBox } from './roundedBox.js';
import { buildAssaultRifleGeometry } from './assaultRifleModels.js';
import { buildHeavyTacticalGeometry } from './heavyTacticalModels.js';
import { buildSidearmMeleeGeometry } from './sidearmMeleeModels.js';

let MUZZLE_STAR_TEX = null;
let MUZZLE_PLUME_TEX = null;
let MUZZLE_BRAKE_TEX = null;

function getMuzzleStarburstTexture() {
  if (!MUZZLE_STAR_TEX && typeof document !== 'undefined') {
    const size = 256;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, size, size);

    const cx = size * 0.5;
    const cy = size * 0.5;
    const coreGrad = ctx.createRadialGradient(cx, cy, 2, cx, cy, 120);
    coreGrad.addColorStop(0.0, 'rgba(255, 255, 255, 1.0)');
    coreGrad.addColorStop(0.16, 'rgba(255, 244, 190, 0.94)');
    coreGrad.addColorStop(0.42, 'rgba(255, 178, 64, 0.48)');
    coreGrad.addColorStop(0.75, 'rgba(255, 96, 18, 0.10)');
    coreGrad.addColorStop(1.0, 'rgba(0, 0, 0, 0.0)');
    ctx.fillStyle = coreGrad;
    ctx.fillRect(0, 0, size, size);

    // 8 feathered spiky muzzle starburst flame rays
    const rays = 8;
    for (let i = 0; i < rays; i++) {
      const ang = (i / rays) * Math.PI * 2 + (i % 2 === 0 ? 0.04 : -0.06);
      const rayLen = i % 2 === 0 ? 122 : 94;
      const halfSpread = i % 2 === 0 ? 0.16 : 0.11;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(ang);
      const rGrad = ctx.createLinearGradient(0, 0, rayLen, 0);
      rGrad.addColorStop(0.0, 'rgba(255, 255, 240, 0.96)');
      rGrad.addColorStop(0.32, 'rgba(255, 206, 95, 0.72)');
      rGrad.addColorStop(0.74, 'rgba(255, 118, 24, 0.22)');
      rGrad.addColorStop(1.0, 'rgba(0, 0, 0, 0.0)');
      ctx.fillStyle = rGrad;
      ctx.beginPath();
      ctx.moveTo(0, -14 * halfSpread * 5);
      ctx.lineTo(rayLen, 0);
      ctx.lineTo(0, 14 * halfSpread * 5);
      ctx.lineTo(-10, 0);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    MUZZLE_STAR_TEX = new THREE.CanvasTexture(canvas);
    MUZZLE_STAR_TEX.colorSpace = THREE.SRGBColorSpace;
    MUZZLE_STAR_TEX.userData = { shared: true };
  }
  return MUZZLE_STAR_TEX;
}

function getMuzzlePlumeTexture() {
  if (!MUZZLE_PLUME_TEX && typeof document !== 'undefined') {
    const w = 256;
    const h = 128;
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, w, h);

    // Longitudinal jet expanding from left throat (x=14) forward toward +X (x=248)
    const grad = ctx.createLinearGradient(12, 64, 248, 64);
    grad.addColorStop(0.0, 'rgba(255, 255, 255, 0.98)');
    grad.addColorStop(0.18, 'rgba(255, 240, 165, 0.88)');
    grad.addColorStop(0.52, 'rgba(255, 162, 48, 0.44)');
    grad.addColorStop(0.84, 'rgba(255, 88, 16, 0.12)');
    grad.addColorStop(1.0, 'rgba(0, 0, 0, 0.0)');
    ctx.fillStyle = grad;

    ctx.beginPath();
    ctx.moveTo(8, 64);
    ctx.lineTo(36, 46);
    ctx.lineTo(118, 22);
    ctx.lineTo(246, 60);
    ctx.lineTo(205, 64);
    ctx.lineTo(246, 68);
    ctx.lineTo(118, 106);
    ctx.lineTo(36, 82);
    ctx.closePath();
    ctx.fill();

    // White-hot inner supersonic shock diamond core
    const hotGrad = ctx.createRadialGradient(44, 64, 2, 74, 64, 72);
    hotGrad.addColorStop(0.0, 'rgba(255, 255, 255, 1.0)');
    hotGrad.addColorStop(0.45, 'rgba(255, 238, 175, 0.72)');
    hotGrad.addColorStop(1.0, 'rgba(0, 0, 0, 0.0)');
    ctx.fillStyle = hotGrad;
    ctx.beginPath();
    ctx.ellipse(68, 64, 58, 18, 0, 0, Math.PI * 2);
    ctx.fill();

    MUZZLE_PLUME_TEX = new THREE.CanvasTexture(canvas);
    MUZZLE_PLUME_TEX.colorSpace = THREE.SRGBColorSpace;
    MUZZLE_PLUME_TEX.userData = { shared: true };
  }
  return MUZZLE_PLUME_TEX;
}

function getMuzzleBrakeJetTexture() {
  if (!MUZZLE_BRAKE_TEX && typeof document !== 'undefined') {
    const w = 256;
    const h = 128;
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, w, h);

    // Symmetric twin radial muzzle-brake side gas jets radiating from center (128, 64)
    const centerGlow = ctx.createRadialGradient(128, 64, 2, 128, 64, 118);
    centerGlow.addColorStop(0.0, 'rgba(255, 255, 255, 0.98)');
    centerGlow.addColorStop(0.24, 'rgba(255, 226, 138, 0.76)');
    centerGlow.addColorStop(0.58, 'rgba(255, 138, 34, 0.28)');
    centerGlow.addColorStop(1.0, 'rgba(0, 0, 0, 0.0)');
    ctx.fillStyle = centerGlow;
    ctx.beginPath();
    ctx.ellipse(128, 64, 120, 44, 0, 0, Math.PI * 2);
    ctx.fill();

    for (const dir of [-1, 1]) {
      const jGrad = ctx.createLinearGradient(128, 64, 128 + dir * 124, 64);
      jGrad.addColorStop(0.0, 'rgba(255, 255, 240, 0.94)');
      jGrad.addColorStop(0.35, 'rgba(255, 188, 66, 0.62)');
      jGrad.addColorStop(0.80, 'rgba(255, 96, 16, 0.16)');
      jGrad.addColorStop(1.0, 'rgba(0, 0, 0, 0.0)');
      ctx.fillStyle = jGrad;
      ctx.beginPath();
      ctx.moveTo(128, 54);
      ctx.lineTo(128 + dir * 70, 32);
      ctx.lineTo(128 + dir * 124, 64);
      ctx.lineTo(128 + dir * 70, 96);
      ctx.lineTo(128, 74);
      ctx.closePath();
      ctx.fill();
    }

    MUZZLE_BRAKE_TEX = new THREE.CanvasTexture(canvas);
    MUZZLE_BRAKE_TEX.colorSpace = THREE.SRGBColorSpace;
    MUZZLE_BRAKE_TEX.userData = { shared: true };
  }
  return MUZZLE_BRAKE_TEX;
}

function getSharedWeaponMat(key, factoryFn) {
  let mat = WEAPON_MAT_CACHE.get(key);
  if (!mat) {
    mat = factoryFn();
    mat.userData = { ...(mat.userData || {}), shared: true };
    WEAPON_MAT_CACHE.set(key, mat);
  }
  return mat;
}

export function buildDetailedWeaponModel(weaponId = 'rifle') {
  const group = new THREE.Group();

  // Authentic Saltline Military / Industrial Ordnance Finishes — Zero Neon WEAPONS[id].color Materials!
  const darkMetal = createProceduralMaterial('gunmetal', 0x1b2028, {
    roughness: 0.34,
    metalness: 0.86
  });
  const gunMetal = createProceduralMaterial('steel', 0x343d4b, {
    roughness: 0.28,
    metalness: 0.88
  });
  const polymerMat = createProceduralMaterial('polymer', 0x22272f, {
    roughness: 0.62,
    metalness: 0.10
  });
  const fdePolymerMat = createProceduralMaterial('polymer', 0x9c8264, {
    roughness: 0.56,
    metalness: 0.12
  });
  const fdeAnodizedMat = createProceduralMaterial('gunmetal', 0x8e7657, {
    roughness: 0.32,
    metalness: 0.74
  });
  const akWoodMat = createProceduralMaterial('wood', 0x7c4524, {
    roughness: 0.38,
    metalness: 0.05
  });
  const oliveChassisMat = createProceduralMaterial('polymer', 0x4d5845, {
    roughness: 0.54,
    metalness: 0.14
  });
  const chromeMetal = createProceduralMaterial('steel', 0x9aa6b5, {
    roughness: 0.20,
    metalness: 0.92
  });
  const brassMat = getSharedWeaponMat('shared_brass', () => new THREE.MeshStandardMaterial({
    color: 0xc59b43,
    roughness: 0.24,
    metalness: 0.88
  }));
  const copperMat = getSharedWeaponMat('shared_copper', () => new THREE.MeshStandardMaterial({
    color: 0xa66134,
    roughness: 0.28,
    metalness: 0.84
  }));
  const boreHoleMat = getSharedWeaponMat('shared_boreHole', () => new THREE.MeshBasicMaterial({ color: 0x030508 }));

  const redReticleMat = getSharedWeaponMat('shared_reticle_red', () => new THREE.MeshBasicMaterial({
    color: 0xff2a2a,
    side: THREE.DoubleSide
  }));
  const glassMat = getSharedWeaponMat('shared_optic_glass', () => new THREE.MeshStandardMaterial({
    color: 0x22d3ee,
    emissive: 0x083344,
    emissiveIntensity: 0.35,
    roughness: 0.08,
    metalness: 0.25,
    transparent: true,
    opacity: 0.14,
    depthWrite: false,
    envMapIntensity: 1.8,
    side: THREE.DoubleSide
  }));

  const mats = {
    darkMetal,
    gunMetal,
    polymerMat,
    fdePolymerMat,
    fdeAnodizedMat,
    akWoodMat,
    oliveChassisMat,
    chromeMetal,
    brassMat,
    copperMat,
    boreHoleMat,
    redReticleMat,
    glassMat
  };

  let builtParts;
  if (weaponId === 'rifle' || weaponId === 'm4a1' || weaponId === 'scar') {
    builtParts = buildAssaultRifleGeometry(weaponId, group, mats);
  } else if (weaponId === 'smg' || weaponId === 'lmg' || weaponId === 'shotgun' || weaponId === 'sniper') {
    builtParts = buildHeavyTacticalGeometry(weaponId, group, mats);
  } else {
    builtParts = buildSidearmMeleeGeometry(weaponId, group, mats);
  }

  const { magMesh, boltMesh, activeOptic, opticCenterY, opticCenterZ, muzzleZ } = builtParts;

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
 * Builds sculpted, anatomically tapered first-person Saltline storm-shell forearms, natural cuff folds,
 * field chrono-watch, and continuous articulated goatskin/suede tactical gloves naturally gripping each weapon.
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

  // Saltline Maritime Charcoal-Slate Ripstop Softshell & Matte Tactical Nomex / Clarino Operator Gloves
  const bduSleeveMat = createProceduralMaterial('bdu', 0x202731, {
    roughness: 0.84,
    metalness: 0.04
  });
  const sleevePanelMat = createProceduralMaterial('cordura', 0x171d25, {
    roughness: 0.78,
    metalness: 0.06
  });
  const corduraCuffMat = createProceduralMaterial('cordura', 0x12161d, {
    roughness: 0.80,
    metalness: 0.07
  });
  const gloveLeatherMat = createProceduralMaterial('leather', 0x181c23, {
    roughness: 0.82,
    metalness: 0.04,
    bumpScale: 0.022,
    envMapIntensity: 0.72
  });
  const glovePalmSuedeMat = createProceduralMaterial('grip', 0x232932, {
    roughness: 0.86,
    metalness: 0.04,
    bumpScale: 0.022,
    envMapIntensity: 0.68
  });
  const carbonKnuckleMat = createProceduralMaterial('carbon', 0x1e242c, {
    roughness: 0.56,
    metalness: 0.14,
    bumpScale: 0.018,
    envMapIntensity: 0.85
  });
  const cuffAccentMat = getSharedWeaponMat('shared_vm_cuff_amber', () => new THREE.MeshStandardMaterial({
    color: 0x4b4234,
    roughness: 0.42,
    metalness: 0.72
  }));
  const watchDialMat = getSharedWeaponMat('shared_vm_watch_dial', () => new THREE.MeshBasicMaterial({
    map: getWatchDialTexture(),
    color: 0xffffff
  }));
  const darkTitaniumMat = getSharedWeaponMat('shared_vm_dark_titanium', () => new THREE.MeshStandardMaterial({
    color: 0x171d25,
    roughness: 0.28,
    metalness: 0.86
  }));

  const isKnife = resolvedWeaponId === 'knife';
  let activeWeaponMesh = null;
  if (isKnife) {
    // Isolate Karambit meshes into a retention-ring pivot (y = -0.126, z = -0.050) so KeyF spins ONLY the knife
    const ringPivotX = 0;
    const ringPivotY = -0.126;
    const ringPivotZ = -0.050;
    const knifePivot = new THREE.Group();
    knifePivot.name = 'karambitSpinPivot';
    knifePivot.position.set(ringPivotX, ringPivotY, ringPivotZ);
    const knifeOffsetGroup = new THREE.Group();
    knifeOffsetGroup.position.set(-ringPivotX, -ringPivotY, -ringPivotZ);
    const initialWeaponChildren = [...group.children];
    for (let i = 0; i < initialWeaponChildren.length; i++) {
      knifeOffsetGroup.add(initialWeaponChildren[i]);
    }
    knifePivot.add(knifeOffsetGroup);
    group.add(knifePivot);
    activeWeaponMesh = knifePivot;
  }
  const isPistol = WEAPONS[resolvedWeaponId]?.slot === 2;
  const isSmg = resolvedWeaponId === 'smg';
  const isShotgun = resolvedWeaponId === 'shotgun';
  const isSniper = resolvedWeaponId === 'sniper';
  const isM4a1 = resolvedWeaponId === 'm4a1';
  const isScar = resolvedWeaponId === 'scar';
  const isLmg = resolvedWeaponId === 'lmg';

  let rHandZ = 0.115;
  let rHandY = -0.102;
  if (isKnife) {
    rHandZ = -0.068;
    rHandY = -0.044;
  } else if (isPistol) {
    rHandZ = 0.082;
    rHandY = -0.086;
  } else if (isSniper) {
    rHandZ = 0.192;
    rHandY = -0.094;
  } else if (isShotgun) {
    rHandZ = 0.155;
    rHandY = -0.092;
  } else if (isM4a1) {
    rHandZ = 0.106;
    rHandY = -0.098;
  } else if (isScar) {
    rHandZ = 0.116;
    rHandY = -0.098;
  } else if (isLmg) {
    rHandZ = 0.116;
    rHandY = -0.106;
  } else if (isSmg) {
    rHandZ = 0.056;
    rHandY = -0.096;
  }

  const rDeltaZ = rHandZ - 0.115;
  const rDeltaY = rHandY - (-0.102);

  // ==================== RIGHT TRIGGER HAND & ANATOMICAL LOFTED SOFTSHELL FOREARM ====================
  const rightHandGroup = new THREE.Group();
  rightHandGroup.position.set(0.012, rHandY, rHandZ);

  // Sculpted Metacarpal Hand Body (carpal wrist bridge -> broad metacarpal palm -> tapered knuckle line)
  const rightPalm = new THREE.Mesh(
    createLoftedTubeGeometry(
      [
        { x: 0.010, y: -0.015, z: 0.058, rx: 0.031, ry: 0.025 },
        { x: 0.008, y: -0.012, z: 0.042, rx: 0.032, ry: 0.025 },
        { x: 0.003, y: 0.002, z: 0.012, rx: 0.035, ry: 0.024 },
        { x: -0.002, y: 0.008, z: -0.018, rx: 0.034, ry: 0.021 },
        { x: -0.004, y: 0.004, z: -0.034, rx: 0.028, ry: 0.016 }
      ],
      14,
      true
    ),
    gloveLeatherMat
  );

  // Inner Clarino Suede Palm Pad
  const rightPalmPad = new THREE.Mesh(
    createLoftedTubeGeometry(
      [
        { x: -0.010, y: -0.012, z: 0.022, rx: 0.022, ry: 0.014 },
        { x: -0.012, y: -0.008, z: -0.006, rx: 0.025, ry: 0.014 },
        { x: -0.012, y: -0.006, z: -0.026, rx: 0.021, ry: 0.012 }
      ],
      10,
      true
    ),
    glovePalmSuedeMat
  );

  // Molded Low-Profile Matte-Charcoal Knuckle Armor Bridge + 4 Sculpted Knuckle Pods
  const rightKnuckleArmor = new THREE.Mesh(
    createChamferedBlockGeometry(0.064, 0.016, 0.026, 0.010, 0.005, 0.008, 0.004),
    carbonKnuckleMat
  );
  rightKnuckleArmor.position.set(0.002, 0.022, -0.014);
  rightKnuckleArmor.rotation.z = -0.14;
  for (let k = 0; k < 4; k++) {
    const pod = new THREE.Mesh(roundedBox(0.013, 0.011, 0.015, 0.003, 1), carbonKnuckleMat);
    pod.position.set(0.005, 0.025 - k * 0.003, -0.024 + k * 0.006);
    rightHandGroup.add(pod);
  }

  // Continuous 4-Station Lofted Thumb Wrapping Grip Beavertail & Safety Selector
  const rightThumb = new THREE.Mesh(
    createLoftedTubeGeometry(
      [
        { x: -0.014, y: 0.006, z: 0.014, rx: 0.015, ry: 0.014 },
        { x: -0.028, y: 0.016, z: -0.004, rx: 0.0125, ry: 0.012 },
        { x: -0.032, y: 0.020, z: -0.024, rx: 0.0105, ry: 0.010 },
        { x: -0.024, y: 0.018, z: -0.040, rx: 0.0085, ry: 0.008 }
      ],
      10,
      true
    ),
    gloveLeatherMat
  );

  // 4 Continuous Multi-Phalanx Lofted Fingers Wrapping Naturally Around Trigger & Front Grip Swell
  for (let f = 0; f < 4; f++) {
    const isTriggerFinger = f === 0 && !isKnife;
    const fy = 0.002 - f * 0.0175;
    const fingerStations = isTriggerFinger
      ? [
          { x: 0.012, y: fy + 0.006, z: -0.026, rx: 0.0095, ry: 0.0095 },
          { x: 0.004, y: fy + 0.004, z: -0.052, rx: 0.0086, ry: 0.0086 },
          { x: -0.008, y: fy + 0.002, z: -0.068, rx: 0.0078, ry: 0.0078 },
          { x: -0.020, y: fy + 0.002, z: -0.062, rx: 0.0068, ry: 0.0068 }
        ]
      : [
          { x: 0.010, y: fy, z: -0.024 + f * 0.004, rx: 0.0095, ry: 0.0092 },
          { x: -0.006, y: fy - 0.002, z: -0.042 + f * 0.005, rx: 0.0088, ry: 0.0085 },
          { x: -0.024, y: fy - 0.002, z: -0.036 + f * 0.006, rx: 0.0078, ry: 0.0076 },
          { x: -0.030, y: fy + 0.001, z: -0.018 + f * 0.006, rx: 0.0068, ry: 0.0066 }
        ];
    const fingerMesh = new THREE.Mesh(createLoftedTubeGeometry(fingerStations, 10, true), gloveLeatherMat);
    const tprPad = new THREE.Mesh(roundedBox(0.014, 0.006, 0.008, 0.002, 1), carbonKnuckleMat);
    tprPad.position.set(0.002, fy + 0.005, isTriggerFinger ? -0.046 : (-0.036 + f * 0.004));
    rightHandGroup.add(fingerMesh, tprPad);
  }
  rightHandGroup.add(rightPalm, rightPalmPad, rightKnuckleArmor, rightThumb);

  // Sculpted Multi-Ring Right Storm-Slate Softshell Forearm with Closed Gauntlet Wrist Bridge & Cuff Folds
  const rightForearmSleeve = new THREE.Mesh(
    createLoftedTubeGeometry(
      [
        { x: 0.016, y: -0.112 + rDeltaY, z: 0.132 + rDeltaZ, rx: 0.035, ry: 0.029 },
        { x: 0.022, y: -0.124 + rDeltaY, z: 0.168 + rDeltaZ, rx: 0.045, ry: 0.039 },
        { x: 0.028, y: -0.132 + rDeltaY, z: 0.196 + rDeltaZ, rx: 0.042, ry: 0.037 },
        { x: 0.038, y: -0.146 + rDeltaY, z: 0.245 + rDeltaZ, rx: 0.048, ry: 0.044 },
        { x: 0.054, y: -0.168 + rDeltaY, z: 0.335 + rDeltaZ, rx: 0.053, ry: 0.049 },
        { x: 0.072, y: -0.194 + rDeltaY, z: 0.445 + rDeltaZ, rx: 0.057, ry: 0.053 }
      ],
      16,
      true
    ),
    bduSleeveMat
  );

  const rightCuffBand = new THREE.Mesh(
    createLoftedTubeGeometry(
      [
        { x: 0.017, y: -0.114 + rDeltaY, z: 0.136 + rDeltaZ, rx: 0.038, ry: 0.032 },
        { x: 0.023, y: -0.125 + rDeltaY, z: 0.176 + rDeltaZ, rx: 0.046, ry: 0.040 }
      ],
      14,
      true
    ),
    corduraCuffMat
  );

  const rightCuffStrap = new THREE.Mesh(roundedBox(0.034, 0.006, 0.016, 0.0018, 1), corduraCuffMat);
  rightCuffStrap.rotation.x = 0.22;
  rightCuffStrap.rotation.z = -0.22;
  rightCuffStrap.position.set(0.019, -0.086 + rDeltaY, 0.162 + rDeltaZ);

  const rightCuffKeeper = new THREE.Mesh(roundedBox(0.008, 0.004, 0.011, 0.0012, 1), cuffAccentMat);
  rightCuffKeeper.rotation.x = 0.22;
  rightCuffKeeper.rotation.z = -0.22;
  rightCuffKeeper.position.set(0.032, -0.089 + rDeltaY, 0.162 + rDeltaZ);

  const rightForearmPanel = new THREE.Mesh(
    createLoftedTubeGeometry(
      [
        { x: 0.036, y: -0.156 + rDeltaY, z: 0.215 + rDeltaZ, rx: 0.045, ry: 0.024 },
        { x: 0.054, y: -0.180 + rDeltaY, z: 0.325 + rDeltaZ, rx: 0.050, ry: 0.026 },
        { x: 0.068, y: -0.200 + rDeltaY, z: 0.415 + rDeltaZ, rx: 0.053, ry: 0.028 }
      ],
      12,
      true
    ),
    sleevePanelMat
  );

  group.add(rightHandGroup, rightForearmSleeve, rightCuffBand, rightCuffStrap, rightCuffKeeper, rightForearmPanel);

  // ==================== LEFT SUPPORT HAND, FIELD WATCH & ANATOMICAL SOFTSHELL FOREARM ====================
  let lHandX = -0.024;
  let lHandY = -0.046;
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
    lHandX = -0.020;
    lHandY = -0.102;
    lHandZ = -0.185;
  } else if (isScar) {
    lHandX = -0.022;
    lHandY = -0.076;
    lHandZ = -0.335;
  } else if (isLmg) {
    lHandX = -0.026;
    lHandY = -0.052;
    lHandZ = -0.44;
  } else if (isShotgun) {
    lHandX = -0.022;
    lHandY = -0.038;
    lHandZ = -0.36;
  } else if (isSniper) {
    lHandX = -0.024;
    lHandY = -0.044;
    lHandZ = -0.32;
  }

  const lDeltaX = lHandX - (-0.024);
  const lDeltaY = lHandY - (-0.046);
  const lDeltaZ = lHandZ - (-0.33);

  const leftHandGroup = new THREE.Group();
  leftHandGroup.position.set(lHandX, lHandY, lHandZ);

  // Sculpted Left Metacarpal Support Palm Cradling Handguard / Grip Frame + Carpal Wrist Bridge
  const leftPalm = new THREE.Mesh(
    createLoftedTubeGeometry(
      [
        { x: -0.017, y: -0.022, z: 0.062, rx: 0.031, ry: 0.024 },
        { x: -0.014, y: -0.018, z: 0.046, rx: 0.032, ry: 0.025 },
        { x: -0.006, y: -0.008, z: 0.014, rx: 0.035, ry: 0.023 },
        { x: 0.000, y: -0.004, z: -0.020, rx: 0.034, ry: 0.020 },
        { x: 0.004, y: -0.002, z: -0.042, rx: 0.028, ry: 0.016 }
      ],
      14,
      true
    ),
    gloveLeatherMat
  );

  const leftPalmPad = new THREE.Mesh(
    createLoftedTubeGeometry(
      [
        { x: 0.008, y: 0.004, z: 0.018, rx: 0.022, ry: 0.012 },
        { x: 0.012, y: 0.006, z: -0.010, rx: 0.024, ry: 0.012 },
        { x: 0.012, y: 0.006, z: -0.034, rx: 0.020, ry: 0.010 }
      ],
      10,
      true
    ),
    glovePalmSuedeMat
  );

  const leftKnuckleArmor = new THREE.Mesh(
    createChamferedBlockGeometry(0.064, 0.015, 0.026, 0.010, 0.005, 0.008, 0.004),
    carbonKnuckleMat
  );
  leftKnuckleArmor.position.set(-0.008, -0.020, -0.008);
  leftKnuckleArmor.rotation.z = 0.24;
  for (let k = 0; k < 4; k++) {
    const pod = new THREE.Mesh(roundedBox(0.013, 0.011, 0.014, 0.003, 1), carbonKnuckleMat);
    pod.position.set(-0.010, -0.022, -0.032 + k * 0.018);
    leftHandGroup.add(pod);
  }

  // Continuous 4-Station Lofted Support Thumb Resting Along Left Handguard / Frame Side Rail
  // (Kept strictly below optic sightline and tucked cleanly against left rail!)
  const leftThumb = new THREE.Mesh(
    createLoftedTubeGeometry(
      [
        { x: -0.016, y: 0.002, z: 0.018, rx: 0.015, ry: 0.014 },
        { x: -0.020, y: 0.018, z: -0.004, rx: 0.0125, ry: 0.012 },
        { x: -0.018, y: 0.030, z: -0.028, rx: 0.0105, ry: 0.010 },
        { x: -0.014, y: 0.034, z: -0.050, rx: 0.0085, ry: 0.008 }
      ],
      10,
      true
    ),
    gloveLeatherMat
  );

  // 4 Continuous Multi-Station Lofted Support Fingers Curling Around Right Side of Handguard / Grip
  for (let f = 0; f < 4; f++) {
    const fz = -0.040 + f * 0.021;
    const supportFinger = new THREE.Mesh(
      createLoftedTubeGeometry(
        [
          { x: 0.004, y: -0.016, z: fz, rx: 0.0095, ry: 0.0092 },
          { x: 0.024, y: -0.014, z: fz, rx: 0.0088, ry: 0.0086 },
          { x: 0.038, y: 0.000, z: fz, rx: 0.0080, ry: 0.0078 },
          { x: 0.036, y: 0.018, z: fz, rx: 0.0068, ry: 0.0068 }
        ],
        10,
        true
      ),
      gloveLeatherMat
    );
    const tprPad = new THREE.Mesh(roundedBox(0.014, 0.006, 0.008, 0.002, 1), carbonKnuckleMat);
    tprPad.position.set(0.020, -0.018, fz);
    leftHandGroup.add(supportFinger, tprPad);
  }
  leftHandGroup.add(leftPalm, leftPalmPad, leftKnuckleArmor, leftThumb);

  // Low-Profile Titanium Field Chrono-Watch Seated Flush into Left Wrist Strap
  const watchCase = new THREE.Mesh(new THREE.CylinderGeometry(0.0185, 0.0195, 0.0085, 22), darkTitaniumMat);
  watchCase.position.set(-0.032 + lDeltaX, -0.043 + lDeltaY, -0.278 + lDeltaZ);
  watchCase.rotation.set(0.14, 0.06, -0.30);
  const watchBezelRing = new THREE.Mesh(new THREE.TorusGeometry(0.0178, 0.0020, 8, 22), carbonKnuckleMat);
  watchBezelRing.position.set(-0.031 + lDeltaX, -0.041 + lDeltaY, -0.278 + lDeltaZ);
  watchBezelRing.rotation.set(Math.PI / 2 + 0.14, 0.06, -0.30);
  const watchFace = new THREE.Mesh(new THREE.CylinderGeometry(0.0155, 0.0155, 0.0096, 22), watchDialMat);
  watchFace.position.copy(watchCase.position);
  watchFace.rotation.copy(watchCase.rotation);

  const leftWristStrap = new THREE.Mesh(
    createLoftedTubeGeometry(
      [
        { x: -0.036 + lDeltaX, y: -0.067 + lDeltaY, z: -0.296 + lDeltaZ, rx: 0.036, ry: 0.030 },
        { x: -0.043 + lDeltaX, y: -0.075 + lDeltaY, z: -0.258 + lDeltaZ, rx: 0.042, ry: 0.036 }
      ],
      14,
      true
    ),
    corduraCuffMat
  );

  // Sculpted Multi-Ring Left Charcoal-Slate Softshell Forearm with Closed Cuff Caps & Seam Reinforcement
  const leftForearmSleeve = new THREE.Mesh(
    createLoftedTubeGeometry(
      [
        { x: -0.045 + lDeltaX, y: -0.078 + lDeltaY, z: -0.266 + lDeltaZ, rx: 0.044, ry: 0.038 },
        { x: -0.056 + lDeltaX, y: -0.090 + lDeltaY, z: -0.232 + lDeltaZ, rx: 0.047, ry: 0.041 },
        { x: -0.068 + lDeltaX, y: -0.102 + lDeltaY, z: -0.195 + lDeltaZ, rx: 0.044, ry: 0.039 },
        { x: -0.086 + lDeltaX, y: -0.120 + lDeltaY, z: -0.135 + lDeltaZ, rx: 0.050, ry: 0.045 },
        { x: -0.112 + lDeltaX, y: -0.148 + lDeltaY, z: -0.040 + lDeltaZ, rx: 0.055, ry: 0.050 },
        { x: -0.142 + lDeltaX, y: -0.180 + lDeltaY, z: 0.075 + lDeltaZ, rx: 0.059, ry: 0.054 }
      ],
      16,
      true
    ),
    bduSleeveMat
  );

  const leftForearmPanel = new THREE.Mesh(
    createLoftedTubeGeometry(
      [
        { x: -0.074 + lDeltaX, y: -0.116 + lDeltaY, z: -0.180 + lDeltaZ, rx: 0.046, ry: 0.025 },
        { x: -0.108 + lDeltaX, y: -0.152 + lDeltaY, z: -0.060 + lDeltaZ, rx: 0.052, ry: 0.028 },
        { x: -0.134 + lDeltaX, y: -0.178 + lDeltaY, z: 0.040 + lDeltaZ, rx: 0.055, ry: 0.030 }
      ],
      12,
      true
    ),
    sleevePanelMat
  );

  const leftCuffStrap = new THREE.Mesh(roundedBox(0.034, 0.006, 0.016, 0.0018, 1), corduraCuffMat);
  leftCuffStrap.rotation.x = 0.25;
  leftCuffStrap.rotation.z = 0.34;
  leftCuffStrap.position.set(-0.042 + lDeltaX, -0.045 + lDeltaY, -0.255 + lDeltaZ);

  const leftCuffKeeper = new THREE.Mesh(roundedBox(0.008, 0.004, 0.011, 0.0012, 1), cuffAccentMat);
  leftCuffKeeper.rotation.x = 0.25;
  leftCuffKeeper.rotation.z = 0.34;
  leftCuffKeeper.position.set(-0.055 + lDeltaX, -0.050 + lDeltaY, -0.255 + lDeltaZ);

  group.add(
    leftHandGroup,
    watchCase,
    watchBezelRing,
    watchFace,
    leftWristStrap,
    leftForearmSleeve,
    leftForearmPanel,
    leftCuffStrap,
    leftCuffKeeper
  );

  // Layered Feathered Procedural Starburst 3D Muzzle Flash (AdditiveBlending, White-Hot Core + Gas Jets)
  const flashGroup = new THREE.Group();
  const flashMat = getSharedWeaponMat('shared_vm_flash_amber', () => new THREE.MeshBasicMaterial({
    color: 0xffd570,
    map: getMuzzleStarburstTexture(),
    transparent: true,
    opacity: 0.96,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
    side: THREE.DoubleSide
  }));
  const flashCoreMat = getSharedWeaponMat('shared_vm_flash_core', () => new THREE.MeshBasicMaterial({
    color: 0xffffff,
    map: getMuzzleStarburstTexture(),
    transparent: true,
    opacity: 0.98,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
    side: THREE.DoubleSide
  }));
  const flashJetMat = getSharedWeaponMat('shared_vm_flash_jet', () => new THREE.MeshBasicMaterial({
    color: 0xffb84d,
    map: getMuzzlePlumeTexture(),
    transparent: true,
    opacity: 0.92,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
    side: THREE.DoubleSide
  }));
  const flashBrakeMat = getSharedWeaponMat('shared_vm_flash_brake', () => new THREE.MeshBasicMaterial({
    color: 0xffc864,
    map: getMuzzleBrakeJetTexture(),
    transparent: true,
    opacity: 0.90,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
    side: THREE.DoubleSide
  }));

  let starDiskGeo = FP_WEAPON_GEO_CACHE.get('shared_vm_flash_star_disk');
  let frontBurstGeo = FP_WEAPON_GEO_CACHE.get('shared_vm_flash_front_burst');
  let plumePlaneGeo = FP_WEAPON_GEO_CACHE.get('shared_vm_flash_plume_plane');
  let finPlaneGeo = FP_WEAPON_GEO_CACHE.get('shared_vm_flash_fin_plane');
  if (!starDiskGeo) {
    starDiskGeo = new THREE.PlaneGeometry(0.115, 0.115);
    starDiskGeo.userData = { shared: true };
    frontBurstGeo = new THREE.PlaneGeometry(0.24, 0.24);
    frontBurstGeo.userData = { shared: true };
    plumePlaneGeo = new THREE.PlaneGeometry(0.32, 0.115);
    plumePlaneGeo.userData = { shared: true };
    finPlaneGeo = new THREE.PlaneGeometry(0.25, 0.085);
    finPlaneGeo.userData = { shared: true };
    FP_WEAPON_GEO_CACHE.set('shared_vm_flash_star_disk', starDiskGeo);
    FP_WEAPON_GEO_CACHE.set('shared_vm_flash_front_burst', frontBurstGeo);
    FP_WEAPON_GEO_CACHE.set('shared_vm_flash_plume_plane', plumePlaneGeo);
    FP_WEAPON_GEO_CACHE.set('shared_vm_flash_fin_plane', finPlaneGeo);
  }

  const starDisk = new THREE.Mesh(starDiskGeo, flashCoreMat);
  starDisk.position.z = -0.01;
  starDisk.userData.isMuzzleFlash = true;

  const frontBurst = new THREE.Mesh(frontBurstGeo, flashMat);
  frontBurst.position.z = -0.018;
  frontBurst.userData.isMuzzleFlash = true;

  const forwardJetH = new THREE.Mesh(plumePlaneGeo, flashJetMat);
  forwardJetH.rotation.y = Math.PI / 2;
  forwardJetH.position.z = -0.145;
  forwardJetH.userData.isMuzzleFlash = true;

  const forwardJetV = new THREE.Mesh(plumePlaneGeo, flashJetMat);
  forwardJetV.rotation.y = Math.PI / 2;
  forwardJetV.rotation.x = Math.PI / 2;
  forwardJetV.position.z = -0.145;
  forwardJetV.userData.isMuzzleFlash = true;

  flashGroup.add(starDisk, frontBurst, forwardJetH, forwardJetV);

  for (let fin = 0; fin < 3; fin++) {
    const finPlane = new THREE.Mesh(finPlaneGeo, flashBrakeMat);
    finPlane.rotation.z = (fin / 3) * Math.PI;
    finPlane.position.z = -0.012;
    finPlane.userData.isMuzzleFlash = true;
    flashGroup.add(finPlane);
  }
  flashGroup.position.set(0, 0.020, resolvedMuzzleZ);
  flashGroup.visible = false;
  flashGroup.userData.isMuzzleFlash = true;
  group.add(flashGroup);

  let barrelHeatMesh = null;
  let barrelHeatMat = null;
  if (!isKnife) {
    let barrelHeatGeo = FP_WEAPON_GEO_CACHE.get('shared_vm_barrel_heat_geo');
    if (!barrelHeatGeo) {
      barrelHeatGeo = new THREE.CylinderGeometry(0.0135, 0.0145, 0.085, 10, 1, true);
      barrelHeatGeo.userData = { shared: true };
      FP_WEAPON_GEO_CACHE.set('shared_vm_barrel_heat_geo', barrelHeatGeo);
    }
    barrelHeatMat = new THREE.MeshBasicMaterial({
      color: 0xf97316,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      toneMapped: false
    });
    barrelHeatMesh = new THREE.Mesh(barrelHeatGeo, barrelHeatMat);
    barrelHeatMesh.rotation.x = Math.PI / 2;
    barrelHeatMesh.position.set(0, 0.012, resolvedMuzzleZ + 0.055);
    barrelHeatMesh.visible = false;
    group.add(barrelHeatMesh);
  }

  const opticGroup = group.userData.opticGroup || null;
  const opticLens = group.userData.opticLens || null;
  const opticReticle = group.userData.opticReticle || null;

  batchStaticViewmodelScope(rightHandGroup, `${resolvedWeaponId}:rh`, null);
  batchStaticViewmodelScope(leftHandGroup, `${resolvedWeaponId}:lh`, null);
  if (activeWeaponMesh) {
    batchStaticViewmodelScope(activeWeaponMesh, `${resolvedWeaponId}:weapon`, null);
  }
  if (resolvedMagMesh && !resolvedMagMesh.isMesh) {
    batchStaticViewmodelScope(resolvedMagMesh, `${resolvedWeaponId}:mag`, null);
  }
  if (resolvedBoltMesh && !resolvedBoltMesh.isMesh) {
    batchStaticViewmodelScope(
      resolvedBoltMesh,
      `${resolvedWeaponId}:bolt`,
      new Set([opticGroup, opticLens, opticReticle].filter(Boolean))
    );
  }
  if (opticGroup && !opticGroup.isMesh) {
    batchStaticViewmodelScope(
      opticGroup,
      `${resolvedWeaponId}:optic`,
      new Set([opticLens, opticReticle].filter(Boolean)),
      true
    );
  }
  batchStaticViewmodelScope(
    group,
    `${resolvedWeaponId}:body`,
    new Set(
      [
        activeWeaponMesh,
        resolvedMagMesh,
        resolvedBoltMesh,
        rightHandGroup,
        leftHandGroup,
        flashGroup,
        barrelHeatMesh,
        opticGroup,
        opticLens,
        opticReticle
      ].filter(Boolean)
    )
  );

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

  group.userData.activeWeaponMesh = activeWeaponMesh;
  group.userData.knifePivotBasePos = activeWeaponMesh ? activeWeaponMesh.position.clone() : null;
  group.userData.flashMesh = flashGroup;
  group.userData.barrelHeatMesh = barrelHeatMesh;
  group.userData.barrelHeatMat = barrelHeatMat;
  group.userData.magMesh = resolvedMagMesh;
  group.userData.boltMesh = resolvedBoltMesh;
  group.userData.rightHandGroup = rightHandGroup;
  group.userData.leftHandGroup = leftHandGroup;
  return group;
}

const _mergePos = new THREE.Vector3();
const _mergeNorm = new THREE.Vector3();
const _mergeNormMat = new THREE.Matrix3();
const _vmIdentMat4 = new THREE.Matrix4();
const FP_WEAPON_GEO_CACHE = new Map();

function batchStaticViewmodelScope(scopeRoot, scopeKey, skipSet, forceOpticTag = false) {
  if (!scopeRoot || !scopeRoot.children || scopeRoot.children.length === 0) return;

  const byBucket = new Map();
  const subGroups = [];

  const walk = (parentObj, parentRelMat) => {
    for (let i = 0; i < parentObj.children.length; i++) {
      const child = parentObj.children[i];
      if (skipSet && skipSet.has(child)) continue;
      if (child.userData?.isMuzzleFlash) continue;
      child.updateMatrix();
      const relMat = parentRelMat.clone().multiply(child.matrix);
      if (child.isMesh && child.geometry && child.material && !Array.isArray(child.material)) {
        const isOptic = forceOpticTag || Boolean(child.userData?.isOpticAssembly);
        const bKey = `${child.material.uuid}:${isOptic ? 1 : 0}`;
        let bucket = byBucket.get(bKey);
        if (!bucket) {
          bucket = { material: child.material, isOptic, meshes: [], entries: [] };
          byBucket.set(bKey, bucket);
        }
        bucket.meshes.push(child);
        bucket.entries.push({ geometry: child.geometry, matrix: relMat });
      }
      if (child.children && child.children.length > 0) {
        walk(child, relMat);
        if (!child.isMesh) subGroups.push(child);
      }
    }
  };

  walk(scopeRoot, _vmIdentMat4);

  const geosToDispose = new Set();
  for (const [bKey, bucket] of byBucket.entries()) {
    if (bucket.entries.length < 2) continue;
    const cacheKey = `${scopeKey}:${bKey}:${bucket.entries.length}`;
    let mergedGeo = FP_WEAPON_GEO_CACHE.get(cacheKey);
    if (!mergedGeo) {
      mergedGeo = mergeTransformedGeometries(bucket.entries);
      FP_WEAPON_GEO_CACHE.set(cacheKey, mergedGeo);
    }
    for (let i = 0; i < bucket.meshes.length; i++) {
      const m = bucket.meshes[i];
      if (m.geometry && !m.geometry.userData?.shared) {
        geosToDispose.add(m.geometry);
      }
      if (m.parent) m.parent.remove(m);
    }
    const mergedMesh = new THREE.Mesh(mergedGeo, bucket.material);
    if (bucket.isOptic) {
      mergedMesh.userData.isOpticAssembly = true;
    }
    scopeRoot.add(mergedMesh);
  }

  for (const g of geosToDispose) {
    g.dispose();
  }
  for (let i = subGroups.length - 1; i >= 0; i--) {
    const sg = subGroups[i];
    if (sg.children.length === 0 && sg.parent) {
      sg.parent.remove(sg);
    }
  }
}

export function mergeTransformedGeometries(entries) {
  let totalVerts = 0;
  let totalIndices = 0;
  let hasColors = false;
  let hasSurfaceParams = false;
  for (let i = 0; i < entries.length; i++) {
    const geo = entries[i].geometry;
    const pos = geo?.attributes?.position;
    if (!pos) continue;
    if (entries[i].color || geo.attributes.color) hasColors = true;
    if (entries[i].surfaceParams || geo.attributes.aRigSurface) hasSurfaceParams = true;
    totalVerts += pos.count;
    totalIndices += geo.index ? geo.index.count : pos.count;
  }

  const positions = new Float32Array(totalVerts * 3);
  const normals = new Float32Array(totalVerts * 3);
  const uvs = new Float32Array(totalVerts * 2);
  const colors = hasColors ? new Float32Array(totalVerts * 3) : null;
  const surfaceParams = hasSurfaceParams ? new Float32Array(totalVerts * 2) : null;
  const indices = totalVerts > 65535 ? new Uint32Array(totalIndices) : new Uint16Array(totalIndices);

  let vertOffset = 0;
  let idxOffset = 0;

  for (let i = 0; i < entries.length; i++) {
    const { geometry: geo, matrix, color, bakeAO, surfaceParams: entrySurf } = entries[i];
    const posAttr = geo?.attributes?.position;
    if (!posAttr) continue;
    const normAttr = geo.attributes.normal;
    const uvAttr = geo.attributes.uv;
    const colorAttr = geo.attributes.color;
    const surfAttr = geo.attributes.aRigSurface;
    const vCount = posAttr.count;
    const cr = color ? color.r : 1;
    const cg = color ? color.g : 1;
    const cb = color ? color.b : 1;
    const sr = entrySurf ? entrySurf[0] : 0.78;
    const sm = entrySurf ? entrySurf[1] : 0.14;

    _mergeNormMat.getNormalMatrix(matrix);

    for (let v = 0; v < vCount; v++) {
      _mergePos.fromBufferAttribute(posAttr, v).applyMatrix4(matrix);
      const pBase = (vertOffset + v) * 3;
      positions[pBase] = _mergePos.x;
      positions[pBase + 1] = _mergePos.y;
      positions[pBase + 2] = _mergePos.z;

      let ny = 1;
      if (normAttr) {
        _mergeNorm.fromBufferAttribute(normAttr, v).applyMatrix3(_mergeNormMat).normalize();
        normals[pBase] = _mergeNorm.x;
        normals[pBase + 1] = _mergeNorm.y;
        normals[pBase + 2] = _mergeNorm.z;
        ny = _mergeNorm.y;
      } else {
        normals[pBase + 1] = 1;
      }

      if (uvAttr) {
        const uBase = (vertOffset + v) * 2;
        uvs[uBase] = uvAttr.getX(v);
        uvs[uBase + 1] = uvAttr.getY(v);
      }

      if (surfaceParams) {
        const sBase = (vertOffset + v) * 2;
        if (surfAttr) {
          surfaceParams[sBase] = surfAttr.getX(v);
          surfaceParams[sBase + 1] = surfAttr.getY(v);
        } else {
          surfaceParams[sBase] = sr;
          surfaceParams[sBase + 1] = sm;
        }
      }

      if (colors) {
        const ao = bakeAO ? (0.82 + 0.18 * (ny * 0.5 + 0.5)) : 1.0;
        if (colorAttr) {
          colors[pBase] = colorAttr.getX(v) * cr * ao;
          colors[pBase + 1] = colorAttr.getY(v) * cg * ao;
          colors[pBase + 2] = colorAttr.getZ(v) * cb * ao;
        } else {
          colors[pBase] = cr * ao;
          colors[pBase + 1] = cg * ao;
          colors[pBase + 2] = cb * ao;
        }
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
  if (colors) {
    merged.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  }
  if (surfaceParams) {
    merged.setAttribute('aRigSurface', new THREE.BufferAttribute(surfaceParams, 2));
  }
  merged.setIndex(new THREE.BufferAttribute(indices, 1));
  merged.computeBoundingBox();
  merged.computeBoundingSphere();
  merged.userData = { shared: true };
  return merged;
}

export const TP_WEAPON_TEMPLATE_CACHE = new Map();
let TP_FLASH_GEO = null;
let TP_FLASH_MAT = null;

export function getThirdPersonWeaponTemplate(weaponId = 'rifle') {
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
