// First-Person (1P) Tactical Arms & Gloved Hands Rig for CS2 GLB Viewmodels.
// Replaces the low-detail baked ArmL/ArmR/HandL/HandR nodes inside ak47.glb, awp.glb, and knife.glb
// with verified CC-BY 4.0 external PBR tactical arms (fps_arms_rifle.glb & fps_arms_pistol.glb,
// charcoal buttoned combat sleeves + stitched matte black & dotted-suede tactical gloves).
// All geometries, materials, and WebP PBR textures are strictly shared/cached (0.00 GPU leaks,
// 0 per-frame heap allocations, and full headless Node compatibility with a clean procedural fallback).

import * as THREE from '../three.js';
import { getAssetManager } from '../assets.js';
import { weaponTextureSets } from './cs2WeaponTextures.js';
import { createLoftedTubeGeometry } from './weaponMaterials.js';
import { roundedBox } from './roundedBox.js';

export const FPS_ARMS_RIFLE_PATH = 'models/arms/fps_arms_rifle.glb';
export const FPS_ARMS_PISTOL_PATH = 'models/arms/fps_arms_pistol.glb';
export const FPS_ARMS_RIGGED_PATH = 'models/arms/fps_arms_rigged.glb';
export const FPS_ARMS_MODEL_PATHS = Object.freeze([
  FPS_ARMS_RIFLE_PATH,
  FPS_ARMS_PISTOL_PATH,
  FPS_ARMS_RIGGED_PATH
]);

// Fallback anchor coordinates extracted directly from fps_arms_rifle.glb / fps_arms_pistol.glb
const DEFAULT_ANCHORS = Object.freeze({
  rifle: Object.freeze({
    leftGrip: Object.freeze([0.0013, 0.1361, -0.5677]),
    rightGrip: Object.freeze([0.0, 0.0962, -0.1321])
  }),
  pistol: Object.freeze({
    leftGrip: Object.freeze([-0.11, 0.0974, -0.1342]),
    rightGrip: Object.freeze([0.0, 0.0962, -0.1321])
  })
});

/**
 * Per-weapon 1P arm alignment presets in weapon-local meters (origin = trigger/receiver space, -Z forward, +Y up).
 * Each arm is re-pivoted around its GLB grip anchor (`LeftGripFrame` / `RightGripFrame`) before scaling (~0.56 -> 1:1 human meters),
 * so `leftPos`/`rightPos` sit directly on the handguard/forend and pistol-grip/knife-handle contact centers.
 */
export const FPS_ARMS_WEAPON_PRESETS = Object.freeze({
  rifle: Object.freeze({
    modelPath: FPS_ARMS_RIFLE_PATH,
    anchorKind: 'rifle',
    useLeftArm: true,
    useRightArm: true,
    leftScale: 0.56,
    leftPos: Object.freeze([-0.004, -0.025, -0.268]),
    leftRot: Object.freeze([0.14, 0.08, -0.34]),
    rightScale: 0.56,
    rightPos: Object.freeze([0.002, -0.059, 0.082]),
    rightRot: Object.freeze([0.06, -0.04, 0.12]),
    reloadMagPos: Object.freeze([-0.016, -0.068, -0.116]),
    reloadMagRot: Object.freeze([-0.26, 0.16, -0.12]),
    reloadBoltPos: Object.freeze([0.024, 0.012, -0.045]),
    reloadBoltRot: Object.freeze([-0.18, -0.14, -0.22])
  }),
  m4a1: Object.freeze({
    modelPath: FPS_ARMS_RIFLE_PATH,
    anchorKind: 'rifle',
    useLeftArm: true,
    useRightArm: true,
    leftScale: 0.56,
    leftPos: Object.freeze([-0.004, -0.025, -0.268]),
    leftRot: Object.freeze([0.14, 0.08, -0.34]),
    rightScale: 0.56,
    rightPos: Object.freeze([0.002, -0.059, 0.082]),
    rightRot: Object.freeze([0.06, -0.04, 0.12]),
    reloadMagPos: Object.freeze([-0.016, -0.068, -0.116]),
    reloadMagRot: Object.freeze([-0.26, 0.16, -0.12]),
    reloadBoltPos: Object.freeze([0.024, 0.012, -0.045]),
    reloadBoltRot: Object.freeze([-0.18, -0.14, -0.22])
  }),
  scar: Object.freeze({
    modelPath: FPS_ARMS_RIFLE_PATH,
    anchorKind: 'rifle',
    useLeftArm: true,
    useRightArm: true,
    leftScale: 0.56,
    leftPos: Object.freeze([-0.004, -0.025, -0.268]),
    leftRot: Object.freeze([0.14, 0.08, -0.34]),
    rightScale: 0.56,
    rightPos: Object.freeze([0.002, -0.059, 0.082]),
    rightRot: Object.freeze([0.06, -0.04, 0.12]),
    reloadMagPos: Object.freeze([-0.016, -0.068, -0.116]),
    reloadMagRot: Object.freeze([-0.26, 0.16, -0.12]),
    reloadBoltPos: Object.freeze([0.024, 0.012, -0.045]),
    reloadBoltRot: Object.freeze([-0.18, -0.14, -0.22])
  }),
  smg: Object.freeze({
    modelPath: FPS_ARMS_RIFLE_PATH,
    anchorKind: 'rifle',
    useLeftArm: true,
    useRightArm: true,
    leftScale: 0.54,
    leftPos: Object.freeze([-0.004, -0.024, -0.224]),
    leftRot: Object.freeze([0.14, 0.08, -0.36]),
    rightScale: 0.54,
    rightPos: Object.freeze([0.002, -0.056, 0.070]),
    rightRot: Object.freeze([0.06, -0.04, 0.12]),
    reloadMagPos: Object.freeze([-0.014, -0.082, -0.098]),
    reloadMagRot: Object.freeze([-0.32, 0.14, -0.10]),
    reloadBoltPos: Object.freeze([0.022, 0.012, -0.036]),
    reloadBoltRot: Object.freeze([-0.16, -0.14, -0.22])
  }),
  shotgun: Object.freeze({
    modelPath: FPS_ARMS_RIFLE_PATH,
    anchorKind: 'rifle',
    useLeftArm: true,
    useRightArm: true,
    leftScale: 0.56,
    leftPos: Object.freeze([-0.004, -0.025, -0.268]),
    leftRot: Object.freeze([0.14, 0.08, -0.34]),
    rightScale: 0.56,
    rightPos: Object.freeze([0.002, -0.059, 0.082]),
    rightRot: Object.freeze([0.06, -0.04, 0.12]),
    reloadMagPos: Object.freeze([-0.014, -0.082, -0.115]),
    reloadMagRot: Object.freeze([-0.28, 0.12, -0.12]),
    reloadBoltPos: Object.freeze([0.022, 0.012, -0.045]),
    reloadBoltRot: Object.freeze([-0.16, -0.14, -0.20])
  }),
  lmg: Object.freeze({
    modelPath: FPS_ARMS_RIFLE_PATH,
    anchorKind: 'rifle',
    useLeftArm: true,
    useRightArm: true,
    leftScale: 0.57,
    leftPos: Object.freeze([-0.004, -0.026, -0.270]),
    leftRot: Object.freeze([0.14, 0.08, -0.34]),
    rightScale: 0.57,
    rightPos: Object.freeze([0.002, -0.060, 0.082]),
    rightRot: Object.freeze([0.06, -0.04, 0.12]),
    reloadMagPos: Object.freeze([-0.014, -0.088, -0.118]),
    reloadMagRot: Object.freeze([-0.34, 0.14, -0.10]),
    reloadBoltPos: Object.freeze([0.024, 0.012, -0.045]),
    reloadBoltRot: Object.freeze([-0.18, -0.14, -0.22])
  }),
  sniper: Object.freeze({
    modelPath: FPS_ARMS_RIFLE_PATH,
    anchorKind: 'rifle',
    useLeftArm: true,
    useRightArm: true,
    leftScale: 0.56,
    leftPos: Object.freeze([-0.004, -0.025, -0.352]),
    leftRot: Object.freeze([0.14, 0.07, -0.32]),
    rightScale: 0.56,
    rightPos: Object.freeze([0.002, -0.069, 0.090]),
    rightRot: Object.freeze([0.06, -0.04, 0.12]),
    reloadMagPos: Object.freeze([-0.014, -0.084, -0.100]),
    reloadMagRot: Object.freeze([-0.30, 0.14, -0.10]),
    reloadBoltPos: Object.freeze([0.040, 0.018, 0.085]),
    reloadBoltRot: Object.freeze([-0.16, -0.12, -0.18])
  }),
  dmr: Object.freeze({
    modelPath: FPS_ARMS_RIFLE_PATH,
    anchorKind: 'rifle',
    useLeftArm: true,
    useRightArm: true,
    leftScale: 0.56,
    leftPos: Object.freeze([-0.004, -0.025, -0.352]),
    leftRot: Object.freeze([0.14, 0.07, -0.32]),
    rightScale: 0.56,
    rightPos: Object.freeze([0.002, -0.069, 0.090]),
    rightRot: Object.freeze([0.06, -0.04, 0.12]),
    reloadMagPos: Object.freeze([-0.014, -0.084, -0.100]),
    reloadMagRot: Object.freeze([-0.30, 0.14, -0.10]),
    reloadBoltPos: Object.freeze([0.040, 0.018, 0.085]),
    reloadBoltRot: Object.freeze([-0.16, -0.12, -0.18])
  }),
  knife: Object.freeze({
    modelPath: FPS_ARMS_RIGGED_PATH,
    anchorKind: 'rigged_knife',
    useRiggedKnifeFist: true,
    useLeftArm: false,
    useRightArm: true,
    // Right tactical gloved hand posed via fps_arms_rigged.glb R_point1..3 / R_thumb2..3 into a closed 5-finger knife grip
    rightScale: 0.56,
    rightPos: Object.freeze([0.008, 0.004, 0.014]),
    rightRot: Object.freeze([0.10, 0.36, 0.24]),
    // Knife seated flush between steel crossguard (above thumb/index) and pommel (below pinky), broad blade face visible
    knifeLocalPos: Object.freeze([0.001, -0.005, 0.003]),
    knifeLocalRot: Object.freeze([1.36, -0.18, -0.62]),
    reloadMagPos: Object.freeze([0.0, 0.0, 0.0]),
    reloadMagRot: Object.freeze([0.0, 0.0, 0.0]),
    reloadBoltPos: Object.freeze([0.0, 0.0, 0.0]),
    reloadBoltRot: Object.freeze([0.0, 0.0, 0.0])
  })
});

export function getFpsArmsPreset(weaponId) {
  return FPS_ARMS_WEAPON_PRESETS[weaponId] || FPS_ARMS_WEAPON_PRESETS.rifle;
}

const BAKED_ARM_NODE_RE = /^(Hand|Arm)[RL]?$/i;

/**
 * Strips all baked first-person arm/hand meshes (`ArmL`, `ArmR`, `HandL`, `HandR`) from a cloned CS2 weapon scene.
 */
export function stripBakedCs2Arms(root) {
  if (!root?.traverse) return 0;
  const toRemove = [];
  root.traverse((obj) => {
    if (BAKED_ARM_NODE_RE.test(String(obj.name || ''))) {
      obj.visible = false;
      toRemove.push(obj);
    }
  });
  for (let i = 0; i < toRemove.length; i++) {
    toRemove[i].parent?.remove(toRemove[i]);
  }
  return toRemove.length;
}

// ---------------------------------------------------------------- Shared GLB arm caches (0 leaks)
const FPS_ARMS_MAT_CACHE = new Map();
const FPS_ARMS_ENV_MATERIALS = new Set();
const BAKED_KNIFE_ARM_GEO_CACHE = new Map();
const PROCEDURAL_ARMS_GEO_CACHE = new Map();
const PROCEDURAL_ARMS_MAT_CACHE = new Map();

// Calibrated local finger-bone curls applied ONCE to fps_arms_rigged.glb to close all 5 fingers
// tightly around the knife handle (eliminating the trigger-finger C-hook on static rifle hands).
const KNIFE_FIST_BONE_CURLS = Object.freeze({
  R_point1_031: Object.freeze([0.16, 1.32, -0.14]),
  R_point2_032: Object.freeze([-0.08, -0.58, 0.08]),
  R_point3_033: Object.freeze([0.0, 0.25, 0.0]),
  R_thumb2_028: Object.freeze([-0.20, 0.14, 0.0]),
  R_thumb3_029: Object.freeze([-0.20, 0.14, 0.0])
});

function markTextureShared(tex, isColor = false) {
  if (!tex) return;
  tex.userData = { ...(tex.userData || {}), shared: true, isFpsArmsTex: true };
  if (isColor && tex.colorSpace !== THREE.SRGBColorSpace) {
    tex.colorSpace = THREE.SRGBColorSpace;
  }
  if (typeof tex.anisotropy === 'number' && tex.anisotropy < 4) {
    tex.anisotropy = 4;
  }
}

function getSharedDressedArmMaterial(origMat, envMap) {
  if (!origMat) return origMat;
  const rawName = String(origMat.name || '');
  const isSleeve = /sleeve/i.test(rawName);
  const slotKey = isSleeve ? 'sleeve' : 'glove';

  const cached = FPS_ARMS_MAT_CACHE.get(slotKey);
  if (cached) {
    if (envMap !== undefined && cached.envMap !== envMap) {
      cached.envMap = envMap || null;
      if (envMap) cached.envMapIntensity = cached.userData.cs2EnvIntensity;
      cached.needsUpdate = true;
    }
    return cached;
  }

  // Share the GLB's embedded WebP PBR maps directly without cloning textures
  markTextureShared(origMat.map, true);
  markTextureShared(origMat.normalMap, false);
  markTextureShared(origMat.roughnessMap, false);
  markTextureShared(origMat.metalnessMap, false);
  markTextureShared(origMat.aoMap, false);

  const envIntensity = isSleeve ? 0.56 : 0.78;
  const mat = new THREE.MeshStandardMaterial({
    name: `cs2_fps_arms_${slotKey}`,
    map: origMat.map || null,
    normalMap: origMat.normalMap || null,
    roughnessMap: origMat.roughnessMap || null,
    metalnessMap: origMat.metalnessMap || null,
    aoMap: origMat.aoMap || null,
    aoMapIntensity: isSleeve ? 0.68 : 0.74,
    // Gentle linear lift so dark tactical charcoal cloth & stitched suede palms remain crisp in daylight & shadow
    color: isSleeve ? new THREE.Color().setRGB(1.32, 1.32, 1.28) : new THREE.Color().setRGB(1.24, 1.22, 1.18),
    roughness: isSleeve ? 0.96 : 0.92,
    metalness: isSleeve ? 0.16 : 0.22,
    normalScale: new THREE.Vector2(isSleeve ? 1.05 : 1.15, isSleeve ? 1.05 : 1.15),
    envMap: envMap || null,
    envMapIntensity: envIntensity
  });
  mat.userData = {
    shared: true,
    isFpsArmsMat: true,
    isCs2WeaponMat: true,
    cs2EnvIntensity: envIntensity
  };
  FPS_ARMS_MAT_CACHE.set(slotKey, mat);
  FPS_ARMS_ENV_MATERIALS.add(mat);
  return mat;
}

export function refreshFpsArmsEnvMap(envMap = null) {
  const nextEnv = envMap || null;
  for (const m of FPS_ARMS_ENV_MATERIALS) {
    if (!m || !(m.userData?.cs2EnvIntensity > 0)) continue;
    if (m.envMap !== nextEnv) {
      m.envMap = nextEnv;
      if (nextEnv) {
        m.envMapIntensity = m.userData.cs2EnvIntensity;
      }
      m.needsUpdate = true;
    } else if (nextEnv && m.envMapIntensity !== m.userData.cs2EnvIntensity) {
      m.envMapIntensity = m.userData.cs2EnvIntensity;
    }
  }
}

function prepareExternalArmsTemplate(scene, anchorKind = 'rifle') {
  if (!scene) return null;
  if (scene.userData?.__fpsArmsPrepared) {
    return scene.userData.__fpsArmsPrepared;
  }

  scene.updateMatrixWorld(true);
  const byName = {};
  scene.traverse((obj) => {
    if (obj.name) byName[obj.name] = obj;
    if (obj.geometry) {
      obj.geometry.userData = { ...(obj.geometry.userData || {}), shared: true };
      if (!obj.geometry.boundingBox) obj.geometry.computeBoundingBox();
      if (!obj.geometry.boundingSphere) obj.geometry.computeBoundingSphere();
    }
  });

  const defaults = DEFAULT_ANCHORS[anchorKind] || DEFAULT_ANCHORS.rifle;
  const readAnchor = (nodeName, fallbackArr) => {
    const node = byName[nodeName];
    if (node) {
      return new THREE.Vector3().setFromMatrixPosition(node.matrixWorld);
    }
    return new THREE.Vector3(fallbackArr[0], fallbackArr[1], fallbackArr[2]);
  };

  const prepared = {
    leftArmNode: byName.LeftArm || null,
    rightArmNode: byName.RightArm || null,
    leftGripAnchor: readAnchor('LeftGripFrame', defaults.leftGrip),
    rightGripAnchor: readAnchor('RightGripFrame', defaults.rightGrip)
  };
  scene.userData = { ...(scene.userData || {}), __fpsArmsPrepared: prepared };
  return prepared;
}

function buildSingleExternalArmPivot(armName, sourceArmNode, gripAnchor, envMap) {
  if (!sourceArmNode) return null;
  const pivot = new THREE.Group();
  pivot.name = armName;

  const inner = new THREE.Group();
  inner.name = `${armName}_offset`;
  inner.position.set(-gripAnchor.x, -gripAnchor.y, -gripAnchor.z);

  const cloned = sourceArmNode.clone(true);
  cloned.traverse((obj) => {
    if (!obj.isMesh) return;
    obj.frustumCulled = false;
    obj.castShadow = false;
    obj.receiveShadow = false;
    if (obj.geometry) {
      obj.geometry.userData = { ...(obj.geometry.userData || {}), shared: true };
    }
    if (Array.isArray(obj.material)) {
      obj.material = obj.material.map((m) => getSharedDressedArmMaterial(m, envMap));
    } else if (obj.material) {
      obj.material = getSharedDressedArmMaterial(obj.material, envMap);
    }
  });

  inner.add(cloned);
  pivot.add(inner);
  return pivot;
}

/**
 * Poses `fps_arms_rigged.glb` right-hand index & thumb bones (`R_point1..3`, `R_thumb2..3`) into a tight
 * closed 5-finger tactical knife grip ONCE and CPU-bakes ONLY the right-arm triangles into a cached static
 * BufferGeometry centered on `RightGripFrame` in `-Z` forward space (0 runtime SkinnedMesh cost, 0 shader
 * program additions, 0 GPU leaks, and full texture/material sharing with `FPS_ARMS_MAT_CACHE`).
 */
function buildBakedRiggedKnifeRightArm(riggedScene, envMap) {
  if (!riggedScene) return null;

  let skinnedMesh = null;
  let rightGripNode = null;
  const bonesByName = new Map();
  riggedScene.traverse((obj) => {
    if (obj.name === 'FullReloadArmsAuditMesh' && obj.isSkinnedMesh) {
      skinnedMesh = obj;
    } else if (!skinnedMesh && obj.isSkinnedMesh && obj.skeleton) {
      skinnedMesh = obj;
    }
    if (obj.name === 'RightGripFrame') {
      rightGripNode = obj;
    }
    if (obj.isBone && obj.name) {
      bonesByName.set(obj.name, obj);
    }
  });
  if (!skinnedMesh?.skeleton || !skinnedMesh.geometry) return null;

  const cacheKey = `${riggedScene.uuid || 'rigged'}:knife_right_fist_v1`;
  let bakedGeo = BAKED_KNIFE_ARM_GEO_CACHE.get(cacheKey);

  if (!bakedGeo) {
    const skeleton = skinnedMesh.skeleton;
    const bones = skeleton.bones;
    const boneInverses = skeleton.boneInverses;

    // Identify all bones belonging to the right arm subtree (`R_arm_024` and descendants)
    const rightBoneIndices = new Set();
    for (let bi = 0; bi < bones.length; bi++) {
      let cur = bones[bi];
      while (cur) {
        if (cur.name === 'R_arm_024' || /^R_/i.test(cur.name || '')) {
          rightBoneIndices.add(bi);
          break;
        }
        cur = cur.parent;
      }
    }
    if (rightBoneIndices.size === 0) return null;

    // Save original bone rotations, apply closed-fist knife curls, update world & skinning matrices
    const savedQuats = [];
    const deltaEuler = new THREE.Euler();
    const deltaQuat = new THREE.Quaternion();
    for (const [bName, eulerArr] of Object.entries(KNIFE_FIST_BONE_CURLS)) {
      const bone = bonesByName.get(bName);
      if (!bone) continue;
      savedQuats.push([bone, bone.quaternion.clone()]);
      deltaEuler.set(eulerArr[0], eulerArr[1], eulerArr[2], 'XYZ');
      deltaQuat.setFromEuler(deltaEuler);
      bone.quaternion.multiply(deltaQuat);
    }

    try {
      riggedScene.updateMatrixWorld(true);
      skeleton.update();

      const srcGeo = skinnedMesh.geometry;
      const posAttr = srcGeo.attributes.position;
      const normAttr = srcGeo.attributes.normal;
      const uvAttr = srcGeo.attributes.uv;
      const skinIdxAttr = srcGeo.attributes.skinIndex;
      const skinWtAttr = srcGeo.attributes.skinWeight;
      if (!posAttr || !skinIdxAttr || !skinWtAttr) return null;

      // Precompute combined world-space skinning matrices for every bone:
      // M_skin[j] = boneWorld[j] * boneInverse[j] * bindMatrix
      const bindMat = skinnedMesh.bindMatrix;
      const meshWorld = skinnedMesh.matrixWorld;
      const worldToGrip = new THREE.Matrix4();
      const gripPos = rightGripNode
        ? new THREE.Vector3().setFromMatrixPosition(rightGripNode.matrixWorld)
        : new THREE.Vector3(0, 0.0962, 0.1321);
      // Flip +Z forward rigged space 180 deg around Y to match fps_arms_rifle.glb (-Z forward)
      const flipY = new THREE.Matrix4().makeRotationY(Math.PI);
      const transNegGrip = new THREE.Matrix4().makeTranslation(-gripPos.x, -gripPos.y, -gripPos.z);
      worldToGrip.multiplyMatrices(flipY, transNegGrip);

      const skinMats = new Array(bones.length);
      for (let bi = 0; bi < bones.length; bi++) {
        const m = new THREE.Matrix4();
        m.multiplyMatrices(bones[bi].matrixWorld, boneInverses[bi]);
        m.multiply(bindMat);
        // Move directly into RightGripFrame-centered -Z forward space
        m.premultiply(worldToGrip);
        skinMats[bi] = m;
      }

      // Filter triangles to ONLY right-arm vertices (dropping the entire left arm)
      const isRightVert = new Uint8Array(posAttr.count);
      for (let v = 0; v < posAttr.count; v++) {
        const j0 = skinIdxAttr.getX(v);
        const w0 = skinWtAttr.getX(v);
        const j1 = skinIdxAttr.getY(v);
        const w1 = skinWtAttr.getY(v);
        const j2 = skinIdxAttr.getZ(v);
        const w2 = skinWtAttr.getZ(v);
        const j3 = skinIdxAttr.getW(v);
        const w3 = skinWtAttr.getW(v);
        let rightWeight = 0;
        if (rightBoneIndices.has(j0)) rightWeight += w0;
        if (rightBoneIndices.has(j1)) rightWeight += w1;
        if (rightBoneIndices.has(j2)) rightWeight += w2;
        if (rightBoneIndices.has(j3)) rightWeight += w3;
        if (rightWeight >= 0.5) isRightVert[v] = 1;
      }

      const srcIndex = srcGeo.index;
      const triCount = srcIndex ? Math.floor(srcIndex.count / 3) : Math.floor(posAttr.count / 3);
      const remap = new Int32Array(posAttr.count).fill(-1);
      const keptVerts = [];
      const keptIndices = [];

      for (let t = 0; t < triCount; t++) {
        const a = srcIndex ? srcIndex.getX(t * 3) : t * 3;
        const b = srcIndex ? srcIndex.getX(t * 3 + 1) : t * 3 + 1;
        const c = srcIndex ? srcIndex.getX(t * 3 + 2) : t * 3 + 2;
        if (!isRightVert[a] || !isRightVert[b] || !isRightVert[c]) continue;
        for (const vi of [a, b, c]) {
          let nv = remap[vi];
          if (nv === -1) {
            nv = keptVerts.length;
            remap[vi] = nv;
            keptVerts.push(vi);
          }
          keptIndices.push(nv);
        }
      }
      if (keptVerts.length === 0 || keptIndices.length === 0) return null;

      const outPos = new Float32Array(keptVerts.length * 3);
      const outNorm = new Float32Array(keptVerts.length * 3);
      const outUv = new Float32Array(keptVerts.length * 2);

      const pSrc = new THREE.Vector3();
      const nSrc = new THREE.Vector3();
      const pAcc = new THREE.Vector3();
      const nAcc = new THREE.Vector3();
      const pTmp = new THREE.Vector3();
      const nTmp = new THREE.Vector3();

      for (let ni = 0; ni < keptVerts.length; ni++) {
        const vi = keptVerts[ni];
        pSrc.fromBufferAttribute(posAttr, vi);
        if (normAttr) nSrc.fromBufferAttribute(normAttr, vi);
        else nSrc.set(0, 1, 0);

        const j0 = skinIdxAttr.getX(vi);
        const j1 = skinIdxAttr.getY(vi);
        const j2 = skinIdxAttr.getZ(vi);
        const j3 = skinIdxAttr.getW(vi);
        const w0 = skinWtAttr.getX(vi);
        const w1 = skinWtAttr.getY(vi);
        const w2 = skinWtAttr.getZ(vi);
        const w3 = skinWtAttr.getW(vi);
        const wSum = w0 + w1 + w2 + w3;
        const invW = wSum > 1e-6 ? 1 / wSum : 1;

        pAcc.set(0, 0, 0);
        nAcc.set(0, 0, 0);

        if (w0 > 0 && skinMats[j0]) {
          const w = w0 * invW;
          pAcc.addScaledVector(pTmp.copy(pSrc).applyMatrix4(skinMats[j0]), w);
          nAcc.addScaledVector(nTmp.copy(nSrc).transformDirection(skinMats[j0]), w);
        }
        if (w1 > 0 && skinMats[j1]) {
          const w = w1 * invW;
          pAcc.addScaledVector(pTmp.copy(pSrc).applyMatrix4(skinMats[j1]), w);
          nAcc.addScaledVector(nTmp.copy(nSrc).transformDirection(skinMats[j1]), w);
        }
        if (w2 > 0 && skinMats[j2]) {
          const w = w2 * invW;
          pAcc.addScaledVector(pTmp.copy(pSrc).applyMatrix4(skinMats[j2]), w);
          nAcc.addScaledVector(nTmp.copy(nSrc).transformDirection(skinMats[j2]), w);
        }
        if (w3 > 0 && skinMats[j3]) {
          const w = w3 * invW;
          pAcc.addScaledVector(pTmp.copy(pSrc).applyMatrix4(skinMats[j3]), w);
          nAcc.addScaledVector(nTmp.copy(nSrc).transformDirection(skinMats[j3]), w);
        }

        if (nAcc.lengthSq() > 1e-10) nAcc.normalize();
        else nAcc.set(0, 1, 0);

        outPos[ni * 3] = pAcc.x;
        outPos[ni * 3 + 1] = pAcc.y;
        outPos[ni * 3 + 2] = pAcc.z;
        outNorm[ni * 3] = nAcc.x;
        outNorm[ni * 3 + 1] = nAcc.y;
        outNorm[ni * 3 + 2] = nAcc.z;
        if (uvAttr) {
          outUv[ni * 2] = uvAttr.getX(vi);
          outUv[ni * 2 + 1] = uvAttr.getY(vi);
        }
      }

      // Discard unused meshWorld reference cleanly
      void meshWorld;

      bakedGeo = new THREE.BufferGeometry();
      bakedGeo.setAttribute('position', new THREE.BufferAttribute(outPos, 3));
      bakedGeo.setAttribute('normal', new THREE.BufferAttribute(outNorm, 3));
      bakedGeo.setAttribute('uv', new THREE.BufferAttribute(outUv, 2));
      bakedGeo.setIndex(
        keptVerts.length > 65535
          ? new THREE.Uint32BufferAttribute(keptIndices, 1)
          : new THREE.Uint16BufferAttribute(keptIndices, 1)
      );
      bakedGeo.computeBoundingBox();
      bakedGeo.computeBoundingSphere();
      bakedGeo.userData = { shared: true, isFpsArmsGeo: true, isBakedKnifeFist: true };
      BAKED_KNIFE_ARM_GEO_CACHE.set(cacheKey, bakedGeo);
    } finally {
      // Restore template bone rotations immediately so the cached GLB template stays pristine
      for (let i = 0; i < savedQuats.length; i++) {
        savedQuats[i][0].quaternion.copy(savedQuats[i][1]);
      }
      riggedScene.updateMatrixWorld(true);
      skeleton.update();
    }
  }

  const origMat = Array.isArray(skinnedMesh.material) ? skinnedMesh.material[0] : skinnedMesh.material;
  const sharedMat = getSharedDressedArmMaterial(origMat, envMap);

  const pivot = new THREE.Group();
  pivot.name = 'FpsArmR';
  const bakedMesh = new THREE.Mesh(bakedGeo, sharedMat);
  bakedMesh.name = 'RightKnifeArmBakedMesh';
  bakedMesh.frustumCulled = false;
  bakedMesh.castShadow = false;
  bakedMesh.receiveShadow = false;
  pivot.add(bakedMesh);
  return pivot;
}

// ---------------------------------------------------------------- Headless / offline sculpted tactical fallback
function getCachedFallbackGeo(key, factoryFn) {
  let geo = PROCEDURAL_ARMS_GEO_CACHE.get(key);
  if (!geo) {
    geo = factoryFn();
    geo.userData = { ...(geo.userData || {}), shared: true };
    if (!geo.boundingBox) geo.computeBoundingBox();
    if (!geo.boundingSphere) geo.computeBoundingSphere();
    PROCEDURAL_ARMS_GEO_CACHE.set(key, geo);
  }
  return geo;
}

function getFallbackArmMaterials(envMap) {
  if (PROCEDURAL_ARMS_MAT_CACHE.size > 0) {
    const sleeveMat = PROCEDURAL_ARMS_MAT_CACHE.get('sleeve');
    const gloveMat = PROCEDURAL_ARMS_MAT_CACHE.get('glove');
    const palmMat = PROCEDURAL_ARMS_MAT_CACHE.get('palm');
    const cuffMat = PROCEDURAL_ARMS_MAT_CACHE.get('cuff');
    const knuckleMat = PROCEDURAL_ARMS_MAT_CACHE.get('knuckle');
    return { sleeveMat, gloveMat, palmMat, cuffMat, knuckleMat };
  }

  const tex = weaponTextureSets();
  const makeMat = (key, opts) => {
    const m = new THREE.MeshStandardMaterial({
      ...opts,
      envMap: envMap || null
    });
    m.userData = {
      shared: true,
      isFpsArmsMat: true,
      isCs2WeaponMat: true,
      cs2EnvIntensity: opts.envMapIntensity ?? 0.65
    };
    PROCEDURAL_ARMS_MAT_CACHE.set(key, m);
    FPS_ARMS_ENV_MATERIALS.add(m);
    return m;
  };

  const sleeveMat = makeMat('sleeve', {
    color: 0x3b4238,
    map: tex?.ripstop?.map || null,
    normalMap: tex?.ripstop?.normalMap || null,
    roughnessMap: tex?.ripstop?.roughnessMap || null,
    roughness: 0.90,
    metalness: 0.04,
    envMapIntensity: 0.55
  });
  const cuffMat = makeMat('cuff', {
    color: 0x1e2228,
    map: tex?.fabric?.map || null,
    normalMap: tex?.fabric?.normalMap || null,
    roughness: 0.86,
    metalness: 0.06,
    envMapIntensity: 0.60
  });
  const gloveMat = makeMat('glove', {
    color: 0x22262c,
    map: tex?.fabric?.map || null,
    normalMap: tex?.fabric?.normalMap || null,
    roughnessMap: tex?.fabric?.roughnessMap || null,
    roughness: 0.84,
    metalness: 0.05,
    envMapIntensity: 0.72
  });
  const palmMat = makeMat('palm', {
    color: 0x4b4238,
    map: tex?.leather?.map || null,
    normalMap: tex?.leather?.normalMap || null,
    roughnessMap: tex?.leather?.roughnessMap || null,
    roughness: 0.76,
    metalness: 0.04,
    envMapIntensity: 0.68
  });
  const knuckleMat = makeMat('knuckle', {
    color: 0x181c22,
    roughness: 0.52,
    metalness: 0.18,
    envMapIntensity: 0.82
  });

  return { sleeveMat, gloveMat, palmMat, cuffMat, knuckleMat };
}

/**
 * Clean anatomically proportioned sculpted fallback arms (tucked thumb, diagonal bottom-left/bottom-right forearm
 * sweeps, Velcro cuff, molded knuckle armor) used ONLY if external GLB loading is unavailable (e.g. headless Node).
 */
export function buildProceduralFallbackFpsArms(weaponId = 'rifle', presetOverride = null, envMap = null) {
  const preset = presetOverride || getFpsArmsPreset(weaponId);
  const { sleeveMat, gloveMat, palmMat, cuffMat, knuckleMat } = getFallbackArmMaterials(envMap);

  const armsRoot = new THREE.Group();
  armsRoot.name = 'cs2FpsArmsRig';

  let armLGroup = null;
  let armRGroup = null;

  if (preset.useLeftArm) {
    armLGroup = new THREE.Group();
    armLGroup.name = 'FpsArmL';

    const leftForearmGeo = getCachedFallbackGeo('fallback_arm_l_sleeve', () =>
      createLoftedTubeGeometry(
        [
          { x: -0.042, y: -0.022, z: 0.056, rx: 0.032, ry: 0.027 },
          { x: -0.068, y: -0.058, z: 0.115, rx: 0.040, ry: 0.035 },
          { x: -0.105, y: -0.125, z: 0.195, rx: 0.046, ry: 0.041 },
          { x: -0.155, y: -0.235, z: 0.295, rx: 0.052, ry: 0.047 },
          { x: -0.215, y: -0.375, z: 0.395, rx: 0.058, ry: 0.053 }
        ],
        14,
        true
      )
    );
    const leftCuffGeo = getCachedFallbackGeo('fallback_arm_l_cuff', () =>
      createLoftedTubeGeometry(
        [
          { x: -0.036, y: -0.018, z: 0.046, rx: 0.035, ry: 0.029 },
          { x: -0.052, y: -0.036, z: 0.082, rx: 0.041, ry: 0.036 }
        ],
        14,
        true
      )
    );
    const leftPalmGeo = getCachedFallbackGeo('fallback_arm_l_palm', () =>
      createLoftedTubeGeometry(
        [
          { x: -0.034, y: -0.016, z: 0.048, rx: 0.029, ry: 0.022 },
          { x: -0.012, y: -0.024, z: 0.016, rx: 0.034, ry: 0.020 },
          { x: 0.002, y: -0.026, z: -0.018, rx: 0.033, ry: 0.018 },
          { x: 0.008, y: -0.020, z: -0.044, rx: 0.025, ry: 0.014 }
        ],
        12,
        true
      )
    );
    const leftPalmPadGeo = getCachedFallbackGeo('fallback_arm_l_pad', () =>
      roundedBox(0.044, 0.014, 0.056, 0.004, 1)
    );
    // Thumb tightly tucked along the left side of the handguard (strictly <= y=+0.012, NEVER sticking up!)
    const leftThumbGeo = getCachedFallbackGeo('fallback_arm_l_thumb', () =>
      createLoftedTubeGeometry(
        [
          { x: -0.026, y: -0.014, z: 0.020, rx: 0.012, ry: 0.011 },
          { x: -0.029, y: -0.003, z: -0.004, rx: 0.0105, ry: 0.010 },
          { x: -0.026, y: 0.005, z: -0.028, rx: 0.0092, ry: 0.009 },
          { x: -0.021, y: 0.007, z: -0.046, rx: 0.0078, ry: 0.0075 }
        ],
        10,
        true
      )
    );
    const leftKnuckleGeo = getCachedFallbackGeo('fallback_arm_l_knuckle', () =>
      roundedBox(0.018, 0.012, 0.062, 0.004, 1)
    );

    const sleeve = new THREE.Mesh(leftForearmGeo, sleeveMat);
    const cuff = new THREE.Mesh(leftCuffGeo, cuffMat);
    const palm = new THREE.Mesh(leftPalmGeo, gloveMat);
    const pad = new THREE.Mesh(leftPalmPadGeo, palmMat);
    pad.position.set(0.0, -0.018, -0.008);
    const thumb = new THREE.Mesh(leftThumbGeo, gloveMat);
    const knuckle = new THREE.Mesh(leftKnuckleGeo, knuckleMat);
    knuckle.position.set(0.024, -0.024, -0.012);
    armLGroup.add(sleeve, cuff, palm, pad, thumb, knuckle);

    for (let f = 0; f < 4; f++) {
      const fz = -0.038 + f * 0.019;
      const fGeo = getCachedFallbackGeo(`fallback_arm_l_f${f}`, () =>
        createLoftedTubeGeometry(
          [
            { x: 0.008, y: -0.026, z: fz, rx: 0.0088, ry: 0.0084 },
            { x: 0.026, y: -0.020, z: fz, rx: 0.0082, ry: 0.0078 },
            { x: 0.032, y: -0.004, z: fz, rx: 0.0074, ry: 0.0072 },
            { x: 0.027, y: 0.011, z: fz, rx: 0.0064, ry: 0.0064 }
          ],
          8,
          true
        )
      );
      armLGroup.add(new THREE.Mesh(fGeo, gloveMat));
    }

    armLGroup.position.set(preset.leftPos[0], preset.leftPos[1], preset.leftPos[2]);
    armLGroup.rotation.set(preset.leftRot[0], preset.leftRot[1], preset.leftRot[2]);
    armsRoot.add(armLGroup);
  }

  if (preset.useRightArm) {
    armRGroup = new THREE.Group();
    armRGroup.name = 'FpsArmR';

    const rightForearmGeo = getCachedFallbackGeo('fallback_arm_r_sleeve', () =>
      createLoftedTubeGeometry(
        [
          { x: 0.028, y: -0.010, z: 0.070, rx: 0.033, ry: 0.028 },
          { x: 0.056, y: -0.048, z: 0.150, rx: 0.042, ry: 0.037 },
          { x: 0.092, y: -0.118, z: 0.255, rx: 0.048, ry: 0.044 },
          { x: 0.132, y: -0.235, z: 0.390, rx: 0.056, ry: 0.052 }
        ],
        14,
        true
      )
    );
    const rightCuffGeo = getCachedFallbackGeo('fallback_arm_r_cuff', () =>
      createLoftedTubeGeometry(
        [
          { x: 0.024, y: -0.008, z: 0.058, rx: 0.035, ry: 0.030 },
          { x: 0.040, y: -0.024, z: 0.098, rx: 0.042, ry: 0.036 }
        ],
        14,
        true
      )
    );
    const rightPalmGeo = getCachedFallbackGeo('fallback_arm_r_palm', () =>
      createLoftedTubeGeometry(
        [
          { x: 0.022, y: -0.008, z: 0.058, rx: 0.029, ry: 0.023 },
          { x: 0.012, y: -0.006, z: 0.018, rx: 0.032, ry: 0.022 },
          { x: 0.004, y: -0.002, z: -0.020, rx: 0.030, ry: 0.019 },
          { x: -0.002, y: 0.0, z: -0.038, rx: 0.024, ry: 0.015 }
        ],
        12,
        true
      )
    );
    const rightThumbGeo = getCachedFallbackGeo('fallback_arm_r_thumb', () =>
      createLoftedTubeGeometry(
        [
          { x: -0.010, y: 0.004, z: 0.018, rx: 0.012, ry: 0.011 },
          { x: -0.024, y: 0.012, z: -0.004, rx: 0.010, ry: 0.0095 },
          { x: -0.022, y: 0.014, z: -0.028, rx: 0.0085, ry: 0.008 }
        ],
        8,
        true
      )
    );
    const rightKnuckleGeo = getCachedFallbackGeo('fallback_arm_r_knuckle', () =>
      roundedBox(0.018, 0.058, 0.020, 0.004, 1)
    );

    const sleeve = new THREE.Mesh(rightForearmGeo, sleeveMat);
    const cuff = new THREE.Mesh(rightCuffGeo, cuffMat);
    const palm = new THREE.Mesh(rightPalmGeo, gloveMat);
    const thumb = new THREE.Mesh(rightThumbGeo, gloveMat);
    const knuckle = new THREE.Mesh(rightKnuckleGeo, knuckleMat);
    knuckle.position.set(0.024, -0.012, -0.016);
    armRGroup.add(sleeve, cuff, palm, thumb, knuckle);

    for (let f = 0; f < 4; f++) {
      const fy = 0.012 - f * 0.017;
      const isTrigger = f === 0 && weaponId !== 'knife';
      const fGeo = getCachedFallbackGeo(`fallback_arm_r_f${f}_${isTrigger ? 't' : 'g'}`, () =>
        createLoftedTubeGeometry(
          isTrigger
            ? [
                { x: 0.016, y: fy + 0.004, z: -0.022, rx: 0.0088, ry: 0.0085 },
                { x: 0.012, y: fy + 0.006, z: -0.054, rx: 0.0080, ry: 0.0078 },
                { x: -0.002, y: fy + 0.005, z: -0.074, rx: 0.0070, ry: 0.0068 }
              ]
            : [
                { x: 0.016, y: fy, z: -0.020, rx: 0.0088, ry: 0.0085 },
                { x: -0.002, y: fy - 0.002, z: -0.038, rx: 0.0080, ry: 0.0078 },
                { x: -0.020, y: fy - 0.002, z: -0.026, rx: 0.0070, ry: 0.0068 }
              ],
          8,
          true
        )
      );
      armRGroup.add(new THREE.Mesh(fGeo, gloveMat));
    }

    armRGroup.position.set(preset.rightPos[0], preset.rightPos[1], preset.rightPos[2]);
    armRGroup.rotation.set(preset.rightRot[0], preset.rightRot[1], preset.rightRot[2]);
    armsRoot.add(armRGroup);
  }

  armsRoot.traverse((obj) => {
    if (obj.isMesh) {
      obj.frustumCulled = false;
      obj.castShadow = false;
      obj.receiveShadow = false;
    }
  });

  return {
    armsRoot,
    armLGroup,
    armRGroup,
    armLHomePos: armLGroup ? armLGroup.position.clone() : null,
    armLHomeRot: armLGroup ? armLGroup.rotation.clone() : null,
    armRHomePos: armRGroup ? armRGroup.position.clone() : null,
    armRHomeRot: armRGroup ? armRGroup.rotation.clone() : null,
    preset,
    source: 'procedural'
  };
}

/**
 * Loads the verified external CC-BY 4.0 FPS arms GLB (`fps_arms_rifle.glb`) via AssetManager
 * and mounts independently calibrated `LeftArm` & `RightArm` pivots onto `modelScene`.
 * Falls back cleanly to `buildProceduralFallbackFpsArms` if GLB loading is unavailable.
 */
export async function attachFpsArmsToViewmodel(weaponId, modelScene, assets = null, envMap = null, opts = {}) {
  const preset = getFpsArmsPreset(weaponId);
  const assetMgr = assets || getAssetManager();

  let gltf = opts.armsGltf || null;
  if (opts.armsGltf === undefined && assetMgr && typeof assetMgr.loadAssetGltf === 'function') {
    try {
      gltf = await assetMgr.loadAssetGltf(preset.modelPath || FPS_ARMS_RIFLE_PATH);
    } catch {
      gltf = null;
    }
  }

  let rig = null;
  if (gltf?.scene && preset.useRiggedKnifeFist) {
    const armRGroup = buildBakedRiggedKnifeRightArm(gltf.scene, envMap);
    if (armRGroup) {
      const armsRoot = new THREE.Group();
      armsRoot.name = 'cs2FpsArmsRig';
      armRGroup.scale.setScalar(preset.rightScale);
      armRGroup.position.set(preset.rightPos[0], preset.rightPos[1], preset.rightPos[2]);
      armRGroup.rotation.set(preset.rightRot[0], preset.rightRot[1], preset.rightRot[2]);
      armsRoot.add(armRGroup);
      rig = {
        armsRoot,
        armLGroup: null,
        armRGroup,
        armLHomePos: null,
        armLHomeRot: null,
        armRHomePos: armRGroup.position.clone(),
        armRHomeRot: armRGroup.rotation.clone(),
        preset,
        source: 'glb'
      };
    }
  } else if (gltf?.scene) {
    const prepared = prepareExternalArmsTemplate(gltf.scene, preset.anchorKind);
    if (prepared && (prepared.leftArmNode || prepared.rightArmNode)) {
      const armsRoot = new THREE.Group();
      armsRoot.name = 'cs2FpsArmsRig';

      let armLGroup = null;
      let armRGroup = null;

      if (preset.useLeftArm && prepared.leftArmNode) {
        armLGroup = buildSingleExternalArmPivot('FpsArmL', prepared.leftArmNode, prepared.leftGripAnchor, envMap);
        if (armLGroup) {
          armLGroup.scale.setScalar(preset.leftScale);
          armLGroup.position.set(preset.leftPos[0], preset.leftPos[1], preset.leftPos[2]);
          armLGroup.rotation.set(preset.leftRot[0], preset.leftRot[1], preset.leftRot[2]);
          armsRoot.add(armLGroup);
        }
      }

      if (preset.useRightArm && prepared.rightArmNode) {
        armRGroup = buildSingleExternalArmPivot('FpsArmR', prepared.rightArmNode, prepared.rightGripAnchor, envMap);
        if (armRGroup) {
          armRGroup.scale.setScalar(preset.rightScale);
          armRGroup.position.set(preset.rightPos[0], preset.rightPos[1], preset.rightPos[2]);
          armRGroup.rotation.set(preset.rightRot[0], preset.rightRot[1], preset.rightRot[2]);
          armsRoot.add(armRGroup);
        }
      }

      if (armLGroup || armRGroup) {
        rig = {
          armsRoot,
          armLGroup,
          armRGroup,
          armLHomePos: armLGroup ? armLGroup.position.clone() : null,
          armLHomeRot: armLGroup ? armLGroup.rotation.clone() : null,
          armRHomePos: armRGroup ? armRGroup.position.clone() : null,
          armRHomeRot: armRGroup ? armRGroup.rotation.clone() : null,
          preset,
          source: 'glb'
        };
      }
    }
  }

  if (!rig) {
    rig = buildProceduralFallbackFpsArms(weaponId, preset, envMap);
  }

  if (modelScene && rig?.armsRoot) {
    modelScene.add(rig.armsRoot);
  }
  return rig;
}

function smoothstep01(a, b, x) {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/**
 * Resets 1P tactical arms back to their exact rest grip transforms. Zero allocations.
 */
export function resetFpsArmsPose(ud) {
  const arms = ud?.fpsArms;
  if (!arms) return;
  if (arms.armLGroup && arms.armLHomePos) {
    arms.armLGroup.position.copy(arms.armLHomePos);
    if (arms.armLHomeRot) arms.armLGroup.rotation.copy(arms.armLHomeRot);
  }
  if (arms.armRGroup && arms.armRHomePos) {
    arms.armRGroup.position.copy(arms.armRHomePos);
    if (arms.armRHomeRot) arms.armRGroup.rotation.copy(arms.armRHomeRot);
  }
}

/**
 * Animates the left support arm (`FpsArmL`) through authentic CS2 reload phases:
 *   - Magazine reload: reach magwell -> pull mag down -> insert fresh mag -> rack charging handle -> return to handguard
 *   - Shell reload: dip beneath breech and feed shell smoothly
 * Strictly zero per-frame heap allocations.
 */
export function updateFpsArmsReloadPose(ud, reloadPct, magDrop, charge, shellPulse = 0, isShellMode = false) {
  const arms = ud?.fpsArms;
  if (!arms?.armLGroup || !arms.armLHomePos || !arms.armLHomeRot) return;

  const armL = arms.armLGroup;
  const hp = arms.armLHomePos;
  const hr = arms.armLHomeRot;
  const preset = arms.preset || FPS_ARMS_WEAPON_PRESETS.rifle;

  if (isShellMode) {
    const mp = preset.reloadMagPos;
    const mr = preset.reloadMagRot;
    const s = Math.max(0, Math.min(1, shellPulse));
    armL.position.set(
      hp.x + (mp[0] - hp.x) * (0.65 + 0.35 * s),
      hp.y + (mp[1] - hp.y) * (0.55 + 0.45 * s) - 0.045 * s,
      hp.z + (mp[2] - hp.z) * (0.72 + 0.28 * s)
    );
    armL.rotation.set(
      hr.x + (mr[0] - hr.x) * (0.6 + 0.4 * s),
      hr.y + (mr[1] - hr.y) * (0.6 + 0.4 * s),
      hr.z + (mr[2] - hr.z) * (0.6 + 0.4 * s)
    );
    return;
  }

  // Phase 1-3: Left hand transitions from handguard -> magwell -> tracks mag drop -> seats fresh mag
  const magGripWeight = smoothstep01(0.06, 0.17, reloadPct) * (1 - smoothstep01(0.70, 0.80, reloadPct));
  // Phase 4: Left hand sweeps smoothly to rack the charging handle / bolt before returning to handguard
  const boltReachWeight = smoothstep01(0.73, 0.82, reloadPct) * (1 - smoothstep01(0.89, 0.98, reloadPct));

  const mp = preset.reloadMagPos;
  const mr = preset.reloadMagRot;
  const bp = preset.reloadBoltPos;
  const br = preset.reloadBoltRot;

  const tx =
    hp.x +
    (mp[0] - hp.x) * magGripWeight +
    (bp[0] - hp.x) * boltReachWeight;
  const ty =
    hp.y +
    (mp[1] - hp.y) * magGripWeight -
    0.12 * magDrop +
    (bp[1] - hp.y) * boltReachWeight;
  const tz =
    hp.z +
    (mp[2] - hp.z) * magGripWeight +
    0.035 * magDrop +
    (bp[2] - hp.z) * boltReachWeight +
    0.055 * charge * boltReachWeight;

  const rx =
    hr.x +
    (mr[0] - hr.x) * magGripWeight -
    0.22 * magDrop +
    (br[0] - hr.x) * boltReachWeight;
  const ry =
    hr.y +
    (mr[1] - hr.y) * magGripWeight +
    (br[1] - hr.y) * boltReachWeight;
  const rz =
    hr.z +
    (mr[2] - hr.z) * magGripWeight +
    0.14 * magDrop +
    (br[2] - hr.z) * boltReachWeight;

  armL.position.set(tx, ty, tz);
  armL.rotation.set(rx, ry, rz);
}
