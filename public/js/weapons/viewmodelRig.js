import * as THREE from '../three.js';
import { WEAPONS } from '../shared.js';
import { WEAPON_MAT_CACHE, createProceduralMaterial, getWatchDialTexture } from './weaponMaterials.js';
import { buildAssaultRifleGeometry } from './assaultRifleModels.js';
import { buildHeavyTacticalGeometry } from './heavyTacticalModels.js';
import { buildSidearmMeleeGeometry } from './sidearmMeleeModels.js';

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
  const brassMat = getSharedWeaponMat('shared_brass', () => new THREE.MeshStandardMaterial({
    color: 0xeab308,
    roughness: 0.22,
    metalness: 0.90
  }));
  const copperMat = getSharedWeaponMat('shared_copper', () => new THREE.MeshStandardMaterial({
    color: 0xd97706,
    roughness: 0.26,
    metalness: 0.88
  }));
  const boreHoleMat = getSharedWeaponMat('shared_boreHole', () => new THREE.MeshBasicMaterial({ color: 0x030508 }));

  const accentColor = WEAPONS[weaponId]?.color || 0xe5a024;
  const accentMat = getSharedWeaponMat(`shared_accent_${accentColor}`, () => new THREE.MeshStandardMaterial({
    color: accentColor,
    roughness: 0.32,
    metalness: 0.72
  }));
  const reticleMat = getSharedWeaponMat('shared_reticle_green', () => new THREE.MeshBasicMaterial({ color: 0x22c55e, side: THREE.DoubleSide }));
  const redReticleMat = getSharedWeaponMat('shared_reticle_red', () => new THREE.MeshBasicMaterial({ color: 0xef4444, side: THREE.DoubleSide }));
  const glassMat = getSharedWeaponMat('shared_optic_glass', () => new THREE.MeshBasicMaterial({
    color: 0x38bdf8,
    transparent: true,
    opacity: 0.075,
    depthWrite: false,
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
    accentMat,
    reticleMat,
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
    color: 0xf6c8a8,
    emissive: 0x3d2416,
    emissiveIntensity: 0.14,
    roughness: 0.44,
    metalness: 0.02
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

  const rightPalm = new THREE.Mesh(new THREE.CapsuleGeometry(0.033, 0.048, 10, 16), gloveLeatherMat);
  rightPalm.rotation.x = Math.PI / 2.2;
  const rightKnuckleBridge = new THREE.Mesh(new THREE.CapsuleGeometry(0.015, 0.056, 10, 16), carbonKnuckleMat);
  rightKnuckleBridge.rotation.z = Math.PI / 2;
  rightKnuckleBridge.position.set(0.004, 0.025, -0.012);

  // Articulated 2-Segment Thumb wrapping around left side of pistol/knife grip (fingerless tactical glove exposing warm human skin)
  const rightThumb = new THREE.Mesh(new THREE.CapsuleGeometry(0.012, 0.032, 8, 12), gloveLeatherMat);
  rightThumb.position.set(-0.032, 0.01, -0.018);
  rightThumb.rotation.set(0.45, 0.35, 0.55);
  const rightThumbTip = new THREE.Mesh(new THREE.CapsuleGeometry(0.010, 0.022, 8, 12), skinMat);
  rightThumbTip.position.set(-0.024, 0.018, -0.036);
  rightThumbTip.rotation.set(0.15, 0.65, 0.35);

  // 4 Articulated 2-Phalanx Fingers (Index finger extended onto trigger, 3 fingers curled around grip with exposed fingertips)
  for (let f = 0; f < 4; f++) {
    const isTriggerFinger = f === 0 && !isKnife;
    const fy = -0.008 - f * 0.018;
    const fz = -0.034 + (isTriggerFinger ? -0.018 : 0);
    const proximal = new THREE.Mesh(new THREE.CapsuleGeometry(0.0095, 0.028, 8, 12), gloveLeatherMat);
    proximal.position.set(-0.010, fy, fz);
    proximal.rotation.z = Math.PI / 2;
    proximal.rotation.y = isTriggerFinger ? -0.35 : 0.08;

    const distal = new THREE.Mesh(new THREE.CapsuleGeometry(0.0082, 0.022, 8, 12), skinMat);
    distal.position.set(-0.026, fy, fz + (isTriggerFinger ? -0.006 : 0.012));
    distal.rotation.z = Math.PI / 2;
    distal.rotation.y = isTriggerFinger ? -0.65 : 0.72;
    rightHandGroup.add(proximal, distal);
  }
  rightHandGroup.add(rightPalm, rightKnuckleBridge, rightThumb, rightThumbTip);

  // Under Euler 'XYZ' with rx = Math.PI/2 + 0.22, negative rz angles the front wrist (-local Y) inward toward x = 0.012
  const rightWristSkin = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.039, 0.05, 18), skinMat);
  rightWristSkin.rotation.x = Math.PI / 2 + 0.22;
  rightWristSkin.rotation.z = -0.22;
  rightWristSkin.position.set(0.018, -0.118 + rDeltaY, 0.142 + rDeltaZ);

  const rightCuffRoll = new THREE.Mesh(new THREE.TorusGeometry(0.044, 0.011, 10, 22), corduraCuffMat);
  rightCuffRoll.position.set(0.023, -0.126 + rDeltaY, 0.162 + rDeltaZ);
  rightCuffRoll.rotation.y = 0.22;

  const rightForearm = new THREE.Mesh(new THREE.CapsuleGeometry(0.046, 0.28, 12, 20), bduSleeveMat);
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

  const leftPalm = new THREE.Mesh(new THREE.CapsuleGeometry(0.033, 0.052, 10, 16), gloveLeatherMat);
  leftPalm.rotation.x = Math.PI / 2;
  const leftKnuckleBridge = new THREE.Mesh(new THREE.CapsuleGeometry(0.015, 0.058, 10, 16), carbonKnuckleMat);
  leftKnuckleBridge.rotation.z = Math.PI / 2;
  leftKnuckleBridge.position.set(-0.005, 0.022, 0);

  const leftThumb = new THREE.Mesh(new THREE.CapsuleGeometry(0.012, 0.046, 8, 12), skinMat);
  leftThumb.position.set(-0.018, 0.032, -0.02);
  leftThumb.rotation.set(0.2, -0.4, -0.8);

  for (let f = 0; f < 4; f++) {
    const fz = -0.042 + f * 0.022;
    const fingerProx = new THREE.Mesh(new THREE.CapsuleGeometry(0.0095, 0.030, 8, 12), gloveLeatherMat);
    fingerProx.position.set(0.012, -0.018, fz);
    fingerProx.rotation.z = Math.PI / 2.3;

    const fingerDist = new THREE.Mesh(new THREE.CapsuleGeometry(0.0082, 0.022, 8, 12), skinMat);
    fingerDist.position.set(0.026, -0.006, fz);
    fingerDist.rotation.z = Math.PI / 4.2;
    leftHandGroup.add(fingerProx, fingerDist);
  }
  const leftWristSkin = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.038, 0.046, 16), skinMat);
  leftWristSkin.position.set(-0.010, -0.016, 0.042);
  leftWristSkin.rotation.x = Math.PI / 2 + 0.22;
  leftWristSkin.rotation.z = 0.34;
  leftHandGroup.add(leftPalm, leftKnuckleBridge, leftThumb, leftWristSkin);

  // Tactical Wrist Chrono-Watch with Illuminated OLED Telemetry Dial seated on inner-top left wrist
  const watchCase = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.014, 22), darkMetal);
  watchCase.position.set(-0.034 + lDeltaX, -0.052 + lDeltaY, -0.285 + lDeltaZ);
  watchCase.rotation.z = -0.32;
  const watchFace = new THREE.Mesh(new THREE.CylinderGeometry(0.020, 0.020, 0.016, 22), watchDialMat);
  watchFace.position.copy(watchCase.position);
  watchFace.rotation.copy(watchCase.rotation);
  const leftWristStrap = new THREE.Mesh(new THREE.TorusGeometry(0.044, 0.0085, 10, 22), corduraCuffMat);
  leftWristStrap.position.set(-0.038 + lDeltaX, -0.082 + lDeltaY, -0.288 + lDeltaZ);
  leftWristStrap.rotation.y = -0.36;

  // Under Euler 'XYZ' with rx = Math.PI/2 + 0.25, positive rz (+0.36) angles the front wrist (-local Y) inward to leftHandGroup
  const leftForearm = new THREE.Mesh(new THREE.CapsuleGeometry(0.046, 0.32, 12, 20), bduSleeveMat);
  leftForearm.rotation.x = Math.PI / 2 + 0.25;
  leftForearm.rotation.z = 0.36;
  leftForearm.position.set(-0.086 + lDeltaX, -0.118 + lDeltaY, -0.165 + lDeltaZ);

  const leftCuffWrap = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.049, 0.14, 18), corduraCuffMat);
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

