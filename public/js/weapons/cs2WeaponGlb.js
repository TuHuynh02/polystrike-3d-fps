// Loads and dresses PBR GLB weapons across 1P Viewmodel, Lobby 02 Gunsmith, Lobby 03 Operator, 3P Bots & Dropped Weapons:
//   - models/fp/*.glb (FP_K=2 -> 0.5x real meters, -Z forward, +Y up, FPRig skinned arms + Gun_<id>)
//   - models/weapons/optics.glb (HoloOptic, MicroOptic)
//   - models/weapons/gsh18.glb (1x 1P / 0.5x world, paired with CPU-baked fps_arms_rigged.glb reload_gsh18_empty t=0)
//   - models/cs2/knife.glb + knife_right_fist_v3 (preserved untouched)

import * as THREE from '../three.js';
import { getAssetManager } from '../assets.js';
import { weaponTextureSets, makeCs2MuzzleFlashTexture } from './cs2WeaponTextures.js';
import {
  FPS_ARMS_RIFLE_PATH,
  attachFpsArmsToViewmodel,
  getFpsArmsPreset,
  refreshFpsArmsEnvMap,
  resetFpsArmsPose,
  stripBakedCs2Arms
} from './fpsArmsRig.js';

const OPTICS_GLB_PATH = 'models/weapons/optics.glb';

export const CS2_WEAPON_SPECS = {
  rifle: {
    model: 'models/fp/ak47.glb',
    variantSkin: 'fp_ak47',
    isFpRig: true,
    boreZ: 0.0405,
    gripR: [-0.0007, -0.095, -0.172],
    optic: { name: 'MicroOptic', pos: [0, 0.0992, -0.4378], minY: -0.070, scale: 0.62 },
    pose: {
      hip: { pos: [0.086, -0.078, -0.185], rot: [0.015, 0.075, 0.03] },
      ads: { pos: [0, -0.0510, -0.115], rot: [0, 0, 0] },
      vmFov: { hip: 66, ads: 54 }
    }
  },
  m4a1: {
    model: 'models/fp/m4a1.glb',
    variantSkin: 'fp_m4a1',
    isFpRig: true,
    boreZ: 0.1101,
    gripR: [0, 0.012, 0.295],
    hideRearIron: true,
    suppressorPos: [0, 0.1101, -0.84],
    optic: { name: 'HoloOptic', pos: [0, 0.1786, 0.06], minY: -0.092, scale: 1.0 },
    pose: {
      hip: { pos: [0.086, -0.078, -0.185], rot: [0.015, 0.075, 0.03] },
      ads: { pos: [0, -0.0803, -0.115], rot: [0, 0, 0] },
      vmFov: { hip: 66, ads: 54 }
    }
  },
  scar: {
    model: 'models/fp/scarl.glb',
    variantSkin: 'fp_scarl',
    isFpRig: true,
    boreZ: 0.0906,
    gripR: [0, -0.025, 0.262],
    optic: { name: 'HoloOptic', pos: [0, 0.2079, -0.058], minY: -0.092, scale: 1.0 },
    pose: {
      hip: { pos: [0.088, -0.080, -0.190], rot: [0.015, 0.075, 0.03] },
      ads: { pos: [0, -0.1047, -0.115], rot: [0, 0, 0] },
      vmFov: { hip: 66, ads: 54 }
    }
  },
  smg: {
    model: 'models/fp/mp5a5.glb',
    variantSkin: 'fp_mp5a5',
    isFpRig: true,
    boreZ: 0.0988,
    gripR: [0, 0.02, 0.11],
    optic: { name: 'MicroOptic', pos: [0, 0.2286, -0.21], minY: -0.070, scale: 0.62 },
    pose: {
      hip: { pos: [0.086, -0.074, -0.195], rot: [0.015, 0.075, 0.03] },
      ads: { pos: [0, -0.0866, -0.125], rot: [0, 0, 0] },
      vmFov: { hip: 66, ads: 54 }
    }
  },
  shotgun: {
    model: 'models/fp/shotgun.glb',
    variantSkin: 'fp_shotgun',
    isFpRig: true,
    boreZ: 0.1277,
    gripR: [0.0385, 0.052, 0.505],
    pose: {
      hip: { pos: [0.088, -0.080, -0.190], rot: [0.015, 0.075, 0.03] },
      ads: { pos: [0, -0.016, -0.130], rot: [0, 0, 0] },
      vmFov: { hip: 66, ads: 54 }
    }
  },
  sniper: {
    model: 'models/fp/awm.glb',
    variantSkin: 'fp_awm',
    isFpRig: true,
    boreZ: 0.0484,
    gripR: [0, -0.05, 0.575],
    pose: {
      hip: { pos: [0.095, -0.085, -0.215], rot: [0.015, 0.085, 0.03] },
      ads: { pos: [0, -0.0754, -0.145], rot: [0, 0, 0] },
      vmFov: { hip: 66, ads: 54 }
    }
  },
  lmg: {
    model: 'models/fp/ak47.glb',
    variantSkin: 'lmg_rpk',
    isFpRig: true,
    isRpkConversion: true,
    boreZ: 0.0405,
    gripR: [-0.0007, -0.095, -0.172],
    optic: { name: 'HoloOptic', pos: [0, 0.0992, -0.4378], minY: -0.092, scale: 1.0 },
    pose: {
      hip: { pos: [0.092, -0.084, -0.198], rot: [0.015, 0.075, 0.03] },
      ads: { pos: [0, -0.0753, -0.118], rot: [0, 0, 0] },
      vmFov: { hip: 66, ads: 54 }
    }
  },
  pistol: {
    model: 'models/fp/p226.glb',
    variantSkin: 'fp_p226',
    isFpRig: true,
    boreZ: 0.0979,
    gripR: [0, 0.06, 0.16],
    pose: {
      hip: { pos: [0.078, -0.068, -0.220], rot: [0.02, 0.06, 0.02] },
      ads: { pos: [0, -0.013, -0.165], rot: [0, 0, 0] },
      vmFov: { hip: 66, ads: 54 }
    }
  },
  deagle: {
    model: 'models/fp/m1911.glb',
    variantSkin: 'deagle_nickel',
    isFpRig: true,
    boreZ: 0.092,
    gripR: [-0.0002, 0.045, 0.165],
    pose: {
      hip: { pos: [0.082, -0.070, -0.220], rot: [0.02, 0.065, 0.02] },
      ads: { pos: [0, -0.016, -0.165], rot: [0, 0, 0] },
      vmFov: { hip: 66, ads: 54 }
    }
  },
  glock: {
    model: 'models/weapons/gsh18.glb',
    variantSkin: 'gsh18',
    isGsh18: true,
    boreZ: 0.1067,
    gripR: [0, -0.0401, 0.2258],
    optic: { name: 'MicroOptic', pos: [0, 0.1527, 0.2925], minY: -0.070, scale: 0.55 },
    pose: {
      hip: { pos: [0.140, -0.125, -0.440], rot: [0.02, 0.06, 0.02] },
      ads: { pos: [0, -0.0845, -0.360], rot: [0, 0, 0] },
      vmFov: { hip: 66, ads: 54 }
    }
  },
  dmr: {
    model: 'models/fp/awm.glb',
    variantSkin: 'dmr_slate',
    isFpRig: true,
    boreZ: 0.0484,
    gripR: [0, -0.05, 0.575],
    pose: {
      hip: { pos: [0.095, -0.085, -0.215], rot: [0.015, 0.085, 0.03] },
      ads: { pos: [0, -0.0754, -0.145], rot: [0, 0, 0] },
      vmFov: { hip: 66, ads: 54 }
    }
  },
  knife: {
    model: 'models/cs2/knife.glb',
    variantSkin: 'knife_tactical',
    isKnife: true,
    pose: {
      hip: { pos: [0.155, -0.060, -0.340], rot: [0.10, 1.32, -0.06] },
      ads: { pos: [0.155, -0.060, -0.340], rot: [0.10, 1.32, -0.06] },
      vmFov: { hip: 66, ads: 66 }
    }
  }
};

const DRESSED_MAT_CACHE = new Map();
const CS2_ENV_MATERIALS = new Set();
const SHARED_ATTACHMENT_GEO_CACHE = new Map();
const SHARED_ATTACHMENT_MAT_CACHE = new Map();

let skeletonUtilsPromise = null;
async function getSkeletonUtils() {
  if (!skeletonUtilsPromise) {
    skeletonUtilsPromise = import('three/addons/utils/SkeletonUtils.js').catch(() => null);
  }
  return skeletonUtilsPromise;
}

export function canUseCs2WeaponGlb() {
  return (
    typeof window !== 'undefined' &&
    typeof document !== 'undefined' &&
    typeof WebGL2RenderingContext !== 'undefined'
  );
}

export function getCs2WeaponSpec(weaponId) {
  return CS2_WEAPON_SPECS[weaponId] || null;
}

export function isCs2WeaponSupported(weaponId) {
  return Boolean(CS2_WEAPON_SPECS[weaponId]);
}

/** Disposes per-clone SkinnedMesh skeletons cleanly while leaving shared geometries/materials/textures untouched. */
export function disposeCs2WeaponSkeletons(root) {
  if (!root?.traverse) return;
  root.traverse((obj) => {
    if (obj.isSkinnedMesh && obj.skeleton && typeof obj.skeleton.dispose === 'function') {
      obj.skeleton.dispose();
    }
  });
}

// ---------------------------------------------------------------- Texture / Resource Sharing
const TEX_SLOTS = ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap'];

function markMaterialTexturesShared(mat, ensureSrgbMap = false) {
  if (!mat) return;
  for (let i = 0; i < TEX_SLOTS.length; i++) {
    const slot = TEX_SLOTS[i];
    const tex = mat[slot];
    if (tex) {
      tex.userData = { ...(tex.userData || {}), shared: true, isCs2WeaponTex: true };
      if (ensureSrgbMap && (slot === 'map' || slot === 'emissiveMap') && tex.colorSpace !== THREE.SRGBColorSpace) {
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.needsUpdate = true;
      }
    }
  }
}

function markSharedGlbTemplate(scene) {
  if (!scene || scene.userData?.__cs2WeaponSharedMarked) return;
  scene.traverse((obj) => {
    if (obj.geometry) {
      obj.geometry.userData = { ...(obj.geometry.userData || {}), shared: true };
      if (!obj.geometry.boundingSphere) obj.geometry.computeBoundingSphere();
    }
    if (obj.material) {
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      for (let i = 0; i < mats.length; i++) {
        const m = mats[i];
        if (!m) continue;
        m.userData = { ...(m.userData || {}), shared: true };
        markMaterialTexturesShared(m);
      }
    }
  });
  scene.userData = { ...(scene.userData || {}), __cs2WeaponSharedMarked: true };
}

// ---------------------------------------------------------------- COLOR_0 edge-wear shader injection (knife.glb)
function addEdgeWear(m, wearColor, amount, wearRough = 0.28) {
  m.customProgramCacheKey = () => 'cs2-edge-wear';
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uWearColor = { value: new THREE.Color(wearColor[0], wearColor[1], wearColor[2]) };
    shader.uniforms.uWearAmt = { value: amount };
    shader.uniforms.uWearRough = { value: wearRough };
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        '#include <common>\n#if !defined( USE_COLOR_ALPHA ) && !defined( USE_COLOR )\nattribute vec4 color;\n#endif\nvarying float vWear;'
      )
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWear = color.r;');
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        '#include <common>\nvarying float vWear;\nuniform vec3 uWearColor;\nuniform float uWearAmt;\nuniform float uWearRough;'
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
        #ifdef USE_ROUGHNESSMAP
          float wearN = texture2D( roughnessMap, vRoughnessMapUv ).r;
        #else
          float wearN = 0.5;
        #endif
        float wear = smoothstep( 0.50, 0.95, vWear * uWearAmt * ( 0.25 + 1.5 * wearN ) );
        diffuseColor.rgb = mix( diffuseColor.rgb, uWearColor, wear );
        roughnessFactor = mix( roughnessFactor, uWearRough, wear );`
      );
  };
}

function applyTexSet(m, set, { color, roughness = 1, metalness, normalScale } = {}) {
  if (set?.map) m.map = set.map;
  if (set?.normalMap) {
    m.normalMap = set.normalMap;
    const ns = normalScale ?? set.normalScale ?? 1;
    if (m.normalScale?.set) m.normalScale.set(ns, ns);
  }
  if (set?.roughnessMap) m.roughnessMap = set.roughnessMap;
  if (color && m.color?.setRGB) m.color.setRGB(color[0], color[1], color[2]);
  m.roughness = roughness;
  if (metalness !== undefined) m.metalness = metalness;
  m.needsUpdate = true;
}

function bindEnvStrength(m, envMap, intensity) {
  m.userData = { ...(m.userData || {}), cs2EnvIntensity: intensity };
  CS2_ENV_MATERIALS.add(m);
  if (envMap) {
    m.envMap = envMap;
    m.envMapIntensity = intensity;
  } else if (envMap === null) {
    m.envMap = null;
  }
}

function dressSingleMaterial(m, tex, envMap, variantSkin) {
  markMaterialTexturesShared(m);
  const n = String(m.name || '');

  // Preserve knife.glb exact legacy dressing
  if (/^knife_blade/.test(n)) {
    m.vertexColors = false;
    applyTexSet(m, tex?.knifeBlade || tex?.steel, { color: [0.38, 0.39, 0.41], roughness: 0.24, metalness: 1.0 });
    bindEnvStrength(m, envMap, 0.95);
  } else if (/^knife_edge/.test(n)) {
    m.vertexColors = false;
    m.color?.setRGB?.(0.80, 0.81, 0.84);
    m.roughness = 0.08;
    m.metalness = 1.0;
    bindEnvStrength(m, envMap, 1.65);
  } else if (/^knife_handle/.test(n)) {
    m.vertexColors = false;
    applyTexSet(m, tex?.speckle, { color: [0.030, 0.030, 0.033], roughness: 0.70, metalness: 0, normalScale: 0.7 });
  } else if (/^glove_palm/.test(n)) {
    m.vertexColors = false;
    applyTexSet(m, tex?.leather, { color: [1, 1, 1], roughness: 1, metalness: 0 });
  } else if (/^glove/.test(n)) {
    m.vertexColors = false;
    applyTexSet(m, tex?.fabric, { color: [1, 1, 1], roughness: 1, metalness: 0 });
  } else if (/^sleeve/.test(n)) {
    m.vertexColors = false;
    applyTexSet(m, tex?.ripstop, { color: [1, 1, 1], roughness: 1, metalness: 0 });
  } else if (/^scope_glass/.test(n)) {
    m.vertexColors = false;
    if (tex?.lens?.map) m.map = tex.lens.map;
    if (tex?.lens?.emissiveMap) m.emissiveMap = tex.lens.emissiveMap;
    m.emissive?.setRGB?.(1, 1, 1);
    m.emissiveIntensity = 1.15;
    m.color?.setRGB?.(1, 1, 1);
    m.roughness = 0.05;
    m.metalness = 0.90;
    m.transparent = false;
    m.opacity = 1;
    bindEnvStrength(m, envMap, 2.6);
  } else if (/^arms$/i.test(n)) {
    // Rich dark tactical slate/charcoal fabric & leather preserving sibling arms_basecolor.webp + arms_normal.webp
    markMaterialTexturesShared(m, true);
    m.color?.setRGB?.(0.95, 0.95, 0.93);
    m.roughness = 0.88;
    m.metalness = 0.08;
    bindEnvStrength(m, envMap, 0.48);
  } else if (n === 'glass_lambert1') {
    // AWM integrated scope lens glass polish
    if (tex?.lens?.map) m.map = tex.lens.map;
    if (tex?.lens?.emissiveMap) m.emissiveMap = tex.lens.emissiveMap;
    m.color?.setRGB?.(0.08, 0.22, 0.28);
    m.emissive?.setRGB?.(0.03, 0.14, 0.18);
    m.emissiveIntensity = 0.62;
    m.roughness = 0.04;
    m.metalness = 0.92;
    m.transparent = false;
    m.opacity = 1;
    bindEnvStrength(m, envMap, 2.2);
  } else if (variantSkin === 'lmg_rpk' && /^(AK47LaminatedWoodPBR|AK47BakeliteMagazine|AK47ButtpadRubber)$/.test(n)) {
    // RPK-74M conversion: convert wood/bakelite/buttpad mats to dark matte charcoal-olive polymer
    m.map = tex?.polymer?.map || null;
    m.normalMap = tex?.polymer?.normalMap || null;
    m.roughnessMap = tex?.polymer?.roughnessMap || null;
    m.metalnessMap = null;
    if (m.normalScale?.set) m.normalScale.set(0.42, 0.42);
    m.color?.setRGB?.(0.068, 0.082, 0.058);
    m.roughness = 0.84;
    m.metalness = 0.06;
    bindEnvStrength(m, envMap, 0.46);
  } else if (variantSkin === 'lmg_rpk' && /^AK47(PhosphateSteel|BluedReceiverSteel)$/.test(n)) {
    m.color?.setRGB?.(0.84, 0.86, 0.88);
    m.metalness = Math.max(m.metalness ?? 0.72, 0.78);
    bindEnvStrength(m, envMap, 1.05);
  } else if (variantSkin === 'deagle_nickel' && (n === 'set1' || n === 'set2')) {
    // Heavy .50 brushed stainless steel / satin nickel finish (physically bounded <= 1.0 albedo, distinct from SIG P226)
    const isSlide = n === 'set1';
    m.color?.setRGB?.(isSlide ? 0.94 : 0.78, isSlide ? 0.95 : 0.80, isSlide ? 0.98 : 0.83);
    m.metalness = isSlide ? 0.92 : 0.84;
    m.roughness = isSlide ? 0.22 : 0.30;
    bindEnvStrength(m, envMap, isSlide ? 1.35 : 1.15);
  } else if (variantSkin === 'dmr_slate' && /^lambert/.test(n)) {
    m.color?.setRGB?.(0.62, 0.68, 0.76);
    bindEnvStrength(m, envMap, 0.90);
  } else if (/^awp_green/.test(n)) {
    m.vertexColors = false;
    applyTexSet(m, tex?.polymer, { color: [0.105, 0.135, 0.075], roughness: 0.75, metalness: 0, normalScale: 0.3 });
    addEdgeWear(m, [0.030, 0.036, 0.024], 0.55, 0.42);
  } else if (m.isMeshStandardMaterial) {
    // Authored fp/*.glb, optics.glb, gsh18.glb PBR materials: keep authored maps/colors, bind HDRI env cleanly
    const metal = m.metalness ?? 0;
    const envStrength = metal >= 0.45 ? 1.05 : 0.68;
    bindEnvStrength(m, envMap, envStrength);
  }

  m.userData = { ...(m.userData || {}), shared: true, isCs2WeaponMat: true, variantSkin };
  m.needsUpdate = true;
}

/**
 * Applies material calibration, RPK-74 / Deagle Nickel finishes, and explicit metallic envMap bindings
 * across every mesh in `root` using cached per-variant dressed materials (zero duplicate shader compiles).
 */
export function dressCs2WeaponMaterials(root, envMap = null, variantSkin = 'fp_ak47') {
  if (!root) return root;
  const tex = weaponTextureSets();
  const skinKey = String(variantSkin || 'fp_ak47');

  const resolveDressedMat = (origMat) => {
    if (!origMat) return origMat;
    const matName = String(origMat.name || '');
    if (matName) {
      const effectiveSkin = /^arms$/i.test(matName) ? 'fp_shared_arms' : skinKey;
      const cacheKey = `${effectiveSkin}:${matName}`;
      const cached = DRESSED_MAT_CACHE.get(cacheKey);
      if (cached) {
        if (cached.userData?.cs2EnvIntensity > 0 && envMap !== undefined && cached.envMap !== envMap) {
          cached.envMap = envMap;
          if (envMap) cached.envMapIntensity = cached.userData.cs2EnvIntensity;
          cached.needsUpdate = true;
        }
        return cached;
      }
      const cloned = origMat.clone();
      cloned.name = matName;
      dressSingleMaterial(cloned, tex, envMap, effectiveSkin);
      DRESSED_MAT_CACHE.set(cacheKey, cloned);
      return cloned;
    }
    const cloned = origMat.clone();
    dressSingleMaterial(cloned, tex, envMap, skinKey);
    return cloned;
  };

  root.traverse((obj) => {
    if (!obj.isMesh) return;
    if (obj.geometry) {
      obj.geometry.userData = { ...(obj.geometry.userData || {}), shared: true };
    }
    if (Array.isArray(obj.material)) {
      obj.material = obj.material.map(resolveDressedMat);
    } else if (obj.material) {
      obj.material = resolveDressedMat(obj.material);
    }
  });
  return root;
}

/** Updates explicit envMap binding on every metallic / scope-glass material in `root`. */
export function refreshCs2WeaponEnvMap(root, envMap = null) {
  const applyMat = (m) => {
    if (!m || !(m.userData?.cs2EnvIntensity > 0)) return;
    const nextEnv = envMap || null;
    if (m.envMap !== nextEnv) {
      m.envMap = nextEnv;
      if (nextEnv) m.envMapIntensity = m.userData.cs2EnvIntensity;
      m.needsUpdate = true;
    } else if (nextEnv && m.envMapIntensity !== m.userData.cs2EnvIntensity) {
      m.envMapIntensity = m.userData.cs2EnvIntensity;
    }
  };

  if (root?.traverse) {
    root.traverse((obj) => {
      if (!obj.isMesh || !obj.material) return;
      if (Array.isArray(obj.material)) {
        for (let i = 0; i < obj.material.length; i++) applyMat(obj.material[i]);
      } else {
        applyMat(obj.material);
      }
    });
  }
  refreshFpsArmsEnvMap(envMap);
  return root;
}

/** Updates explicit envMap on all cached CS2 metallic/scope-glass materials globally. */
export function refreshAllCs2WeaponEnvMaps(envMap = null) {
  const nextEnv = envMap || null;
  for (const m of CS2_ENV_MATERIALS) {
    if (!m || !(m.userData?.cs2EnvIntensity > 0)) continue;
    if (m.envMap !== nextEnv) {
      m.envMap = nextEnv;
      if (nextEnv) m.envMapIntensity = m.userData.cs2EnvIntensity;
      m.needsUpdate = true;
    } else if (nextEnv && m.envMapIntensity !== m.userData.cs2EnvIntensity) {
      m.envMapIntensity = m.userData.cs2EnvIntensity;
    }
  }
  refreshFpsArmsEnvMap(nextEnv);
}

// ---------------------------------------------------------------- Shared Custom Attachments (0 leaks)
function getSharedGeo(key, factory) {
  let g = SHARED_ATTACHMENT_GEO_CACHE.get(key);
  if (!g) {
    g = factory();
    g.userData = { ...(g.userData || {}), shared: true };
    if (!g.boundingBox) g.computeBoundingBox();
    if (!g.boundingSphere) g.computeBoundingSphere();
    SHARED_ATTACHMENT_GEO_CACHE.set(key, g);
  }
  return g;
}

function getSharedMat(key, factory, envMap = null) {
  let m = SHARED_ATTACHMENT_MAT_CACHE.get(key);
  if (!m) {
    m = factory();
    m.userData = { ...(m.userData || {}), shared: true, isCs2WeaponMat: true };
    if (m.userData.cs2EnvIntensity > 0) {
      CS2_ENV_MATERIALS.add(m);
    }
    SHARED_ATTACHMENT_MAT_CACHE.set(key, m);
  }
  if (m.userData?.cs2EnvIntensity > 0 && envMap !== undefined && m.envMap !== envMap) {
    m.envMap = envMap || null;
    if (envMap) m.envMapIntensity = m.userData.cs2EnvIntensity;
    m.needsUpdate = true;
  }
  return m;
}

function getAttachmentMaterials(envMap) {
  const tex = weaponTextureSets();
  const parkSteel = getSharedMat(
    'att_parkerized_steel',
    () => {
      const m = new THREE.MeshStandardMaterial({
        name: 'cs2_att_parkerized_steel',
        color: 0x25282e,
        map: tex?.steel?.map || null,
        roughnessMap: tex?.steel?.roughnessMap || null,
        normalMap: tex?.steel?.normalMap || null,
        roughness: 0.42,
        metalness: 0.86,
        envMap: envMap || null,
        envMapIntensity: 1.05
      });
      m.userData.cs2EnvIntensity = 1.05;
      return m;
    },
    envMap
  );
  const darkAnodized = getSharedMat(
    'att_dark_anodized',
    () => {
      const m = new THREE.MeshStandardMaterial({
        name: 'cs2_att_dark_anodized',
        color: 0x1a1d22,
        map: tex?.polymer?.map || null,
        roughnessMap: tex?.polymer?.roughnessMap || null,
        normalMap: tex?.polymer?.normalMap || null,
        roughness: 0.62,
        metalness: 0.58,
        envMap: envMap || null,
        envMapIntensity: 0.85
      });
      m.userData.cs2EnvIntensity = 0.85;
      return m;
    },
    envMap
  );
  const rubberMat = getSharedMat(
    'att_rubber',
    () =>
      new THREE.MeshStandardMaterial({
        name: 'cs2_att_rubber',
        color: 0x16181b,
        map: tex?.speckle?.map || null,
        normalMap: tex?.speckle?.normalMap || null,
        roughness: 0.88,
        metalness: 0.05
      }),
    envMap
  );
  const reticleDot = getSharedMat('att_reticle_dot', () => {
    const m = new THREE.MeshBasicMaterial({
      name: 'cs2_att_reticle_dot',
      color: 0xff3b2f,
      transparent: true,
      opacity: 0.92,
      depthWrite: false,
      toneMapped: false
    });
    return m;
  });
  return { parkSteel, darkAnodized, rubberMat, reticleDot };
}

function buildM4A1Suppressor(muzzlePos, envMap, castShadow, receiveShadow) {
  const { darkAnodized, parkSteel } = getAttachmentMaterials(envMap);
  const group = new THREE.Group();
  group.name = 'M4A1Suppressor';
  group.position.set(muzzlePos[0], muzzlePos[1], muzzlePos[2]);

  const bodyGeo = getSharedGeo('supp_body', () => {
    const g = new THREE.CylinderGeometry(0.036, 0.036, 0.33, 18);
    g.rotateX(Math.PI * 0.5);
    return g;
  });
  const collarGeo = getSharedGeo('supp_collar', () => {
    const g = new THREE.CylinderGeometry(0.041, 0.038, 0.052, 18);
    g.rotateX(Math.PI * 0.5);
    return g;
  });
  const crownGeo = getSharedGeo('supp_crown', () => {
    const g = new THREE.CylinderGeometry(0.031, 0.036, 0.018, 18);
    g.rotateX(Math.PI * 0.5);
    return g;
  });
  const boreGeo = getSharedGeo('supp_bore', () => {
    const g = new THREE.CylinderGeometry(0.014, 0.014, 0.008, 12);
    g.rotateX(Math.PI * 0.5);
    return g;
  });

  const body = new THREE.Mesh(bodyGeo, darkAnodized);
  body.position.z = -0.175;
  const collar = new THREE.Mesh(collarGeo, parkSteel);
  collar.position.z = -0.022;
  const crown = new THREE.Mesh(crownGeo, parkSteel);
  crown.position.z = -0.348;
  const bore = new THREE.Mesh(boreGeo, darkAnodized);
  bore.position.z = -0.355;

  const tip = new THREE.Object3D();
  tip.name = 'SuppressorMuzzleTip';
  tip.position.set(0, 0, -0.360);

  group.add(collar, body, crown, bore, tip);
  group.traverse((c) => {
    if (c.isMesh) {
      c.castShadow = castShadow;
      c.receiveShadow = receiveShadow;
      c.frustumCulled = false;
    }
  });
  return { group, tip };
}

function buildRpkDrumAndAttachments(kParent, gunNode, envMap, castShadow, receiveShadow) {
  const { parkSteel, darkAnodized, rubberMat } = getAttachmentMaterials(envMap);

  // 1) Replace curved MagazineGeometry inside Magazine node with 75-rd steel drum so reload animates it!
  const magNode = gunNode?.getObjectByName?.('Magazine');
  if (magNode) {
    magNode.traverse((c) => {
      if (c !== magNode && c.isMesh) {
        c.visible = false;
      }
    });
    removeNodesByPattern(magNode, /^MagazineGeometry$/i);
    const invGunScale = gunNode?.scale?.x ? 1 / gunNode.scale.x : 1 / 1.2575;
    const drumGroup = new THREE.Group();
    drumGroup.name = 'RpkDrumMagazine';
    drumGroup.scale.setScalar(invGunScale);
    // Offset cleanly under AK receiver (Magazine is [0, -0.0025, -0.4993] in K-space; Hand_L is at z=-0.781)
    drumGroup.position.set(0, -0.155, -0.024);
    drumGroup.rotation.x = 0.09;

    const drumGeo = getSharedGeo('rpk_drum_body', () => {
      const g = new THREE.CylinderGeometry(0.130, 0.130, 0.084, 24);
      g.rotateX(Math.PI * 0.5);
      return g;
    });
    const rimGeo = getSharedGeo('rpk_drum_rim', () => {
      const g = new THREE.CylinderGeometry(0.135, 0.135, 0.012, 24);
      g.rotateX(Math.PI * 0.5);
      return g;
    });
    const hubGeo = getSharedGeo('rpk_drum_hub', () => {
      const g = new THREE.CylinderGeometry(0.036, 0.042, 0.098, 16);
      g.rotateX(Math.PI * 0.5);
      return g;
    });
    const towerGeo = getSharedGeo('rpk_drum_tower', () => new THREE.BoxGeometry(0.052, 0.145, 0.082));

    const drum = new THREE.Mesh(drumGeo, parkSteel);
    const rimF = new THREE.Mesh(rimGeo, darkAnodized);
    rimF.position.z = -0.036;
    const rimB = new THREE.Mesh(rimGeo, darkAnodized);
    rimB.position.z = 0.036;
    const hub = new THREE.Mesh(hubGeo, darkAnodized);
    const tower = new THREE.Mesh(towerGeo, parkSteel);
    tower.position.set(0, 0.125, 0.004);

    drumGroup.add(drum, rimF, rimB, hub, tower);
    drumGroup.traverse((c) => {
      if (c.isMesh) {
        c.castShadow = castShadow;
        c.receiveShadow = receiveShadow;
        c.frustumCulled = false;
      }
    });
    magNode.add(drumGroup);
  }

  // 2) Heavy extended RPK barrel at MuzzleDeviceTip [0, 0.0067, -1.427] K-space
  const barrelGroup = new THREE.Group();
  barrelGroup.name = 'RpkHeavyBarrel';
  barrelGroup.position.set(0, 0.0067, -1.427);

  const bTubeGeo = getSharedGeo('rpk_barrel_tube', () => {
    const g = new THREE.CylinderGeometry(0.020, 0.023, 0.25, 16);
    g.rotateX(Math.PI * 0.5);
    return g;
  });
  const bCollarGeo = getSharedGeo('rpk_barrel_collar', () => {
    const g = new THREE.CylinderGeometry(0.028, 0.026, 0.045, 16);
    g.rotateX(Math.PI * 0.5);
    return g;
  });
  const bFlashGeo = getSharedGeo('rpk_barrel_flash', () => {
    const g = new THREE.CylinderGeometry(0.024, 0.021, 0.068, 16);
    g.rotateX(Math.PI * 0.5);
    return g;
  });

  const bCollar = new THREE.Mesh(bCollarGeo, darkAnodized);
  bCollar.position.z = -0.020;
  const bTube = new THREE.Mesh(bTubeGeo, parkSteel);
  bTube.position.z = -0.145;
  const bFlash = new THREE.Mesh(bFlashGeo, darkAnodized);
  bFlash.position.z = -0.295;
  const rpkTip = new THREE.Object3D();
  rpkTip.name = 'RpkMuzzleTip';
  rpkTip.position.set(0, 0, -0.335);

  barrelGroup.add(bCollar, bTube, bFlash, rpkTip);
  barrelGroup.traverse((c) => {
    if (c.isMesh) {
      c.castShadow = castShadow;
      c.receiveShadow = receiveShadow;
      c.frustumCulled = false;
    }
  });
  kParent.add(barrelGroup);

  // 3) Folded twin steel bipod legs under barrel (z = [-1.50, -1.16] K-space, well ahead of Hand_L at z=-0.78)
  const bipodGroup = new THREE.Group();
  bipodGroup.name = 'RpkFoldedBipod';
  bipodGroup.position.set(0, -0.036, -1.32);

  const yokeGeo = getSharedGeo('rpk_bipod_yoke', () => new THREE.BoxGeometry(0.084, 0.034, 0.048));
  const legGeo = getSharedGeo('rpk_bipod_leg', () => {
    const g = new THREE.CylinderGeometry(0.011, 0.011, 0.34, 12);
    g.rotateX(Math.PI * 0.5);
    return g;
  });
  const footGeo = getSharedGeo('rpk_bipod_foot', () => {
    const g = new THREE.CylinderGeometry(0.016, 0.015, 0.046, 12);
    g.rotateX(Math.PI * 0.5);
    return g;
  });

  const yoke = new THREE.Mesh(yokeGeo, darkAnodized);
  yoke.position.set(0, 0.016, -0.14);
  bipodGroup.add(yoke);
  for (const side of [-1, 1]) {
    const leg = new THREE.Mesh(legGeo, parkSteel);
    leg.position.set(side * 0.034, 0, 0);
    const foot = new THREE.Mesh(footGeo, rubberMat);
    foot.position.set(side * 0.034, -0.002, 0.165);
    bipodGroup.add(leg, foot);
  }
  bipodGroup.traverse((c) => {
    if (c.isMesh) {
      c.castShadow = castShadow;
      c.receiveShadow = receiveShadow;
      c.frustumCulled = false;
    }
  });
  kParent.add(bipodGroup);

  return { rpkTip };
}

function attachOpticFromGlb(parent, opticsGltf, opticSpec, envMap, castShadow, receiveShadow, isFirstPerson) {
  if (!parent || !opticsGltf?.scene || !opticSpec) return null;
  markSharedGlbTemplate(opticsGltf.scene);
  const srcOptic = opticsGltf.scene.getObjectByName(opticSpec.name);
  if (!srcOptic) return null;

  const opticClone = srcOptic.clone(true);
  const s = opticSpec.scale ?? 1.0;
  opticClone.scale.setScalar(s);
  opticClone.position.set(opticSpec.pos[0], opticSpec.pos[1] - opticSpec.minY * s, opticSpec.pos[2]);

  dressCs2WeaponMaterials(opticClone, envMap, 'optics');

  // Add subtle crisp glowing red-dot reticle in 1P viewmodel optic centerline
  if (isFirstPerson) {
    const { reticleDot } = getAttachmentMaterials(envMap);
    const dotGeo = getSharedGeo('optic_reticle_dot', () => new THREE.CircleGeometry(0.0026, 12));
    const dot = new THREE.Mesh(dotGeo, reticleDot);
    dot.name = 'Cs2OpticReticleDot';
    dot.position.set(0, 0, 0);
    opticClone.add(dot);
  }

  opticClone.traverse((c) => {
    if (c.isMesh) {
      c.castShadow = castShadow;
      c.receiveShadow = receiveShadow;
      c.frustumCulled = false;
    }
  });
  parent.add(opticClone);
  return opticClone;
}

function removeNodesByPattern(root, re) {
  if (!root?.traverse) return;
  const toRemove = [];
  root.traverse((obj) => {
    if (obj !== root && re.test(String(obj.name || ''))) {
      obj.visible = false;
      toRemove.push(obj);
    }
  });
  for (let i = 0; i < toRemove.length; i++) {
    toRemove[i].parent?.remove(toRemove[i]);
  }
}

function attachCs2MuzzleFlash(root, muzzleNode, isFirstPerson = true) {
  if (!root || !muzzleNode) return null;
  root.updateMatrixWorld(true);
  const worldPos = muzzleNode.getWorldPosition(new THREE.Vector3());
  const localPos = root.worldToLocal(worldPos);

  const flashGroup = new THREE.Group();
  flashGroup.name = 'cs2MuzzleFlash';
  flashGroup.position.set(localPos.x, localPos.y, localPos.z - 0.016);
  flashGroup.visible = false;
  flashGroup.userData = { isMuzzleFlash: true };

  const tex = makeCs2MuzzleFlashTexture(128);
  const mat = new THREE.SpriteMaterial({
    map: tex || null,
    color: 0xffe0a6,
    transparent: true,
    opacity: 0.96,
    blending: THREE.AdditiveBlending,
    depthTest: !isFirstPerson,
    depthWrite: false,
    toneMapped: false
  });
  mat.userData = { shared: false, isMuzzleFlash: true };
  const sprite = new THREE.Sprite(mat);
  sprite.name = 'cs2MuzzleFlashSprite';
  sprite.scale.setScalar(isFirstPerson ? 0.21 : 0.28);
  sprite.frustumCulled = false;
  sprite.userData = { isMuzzleFlash: true };
  flashGroup.add(sprite);

  root.add(flashGroup);
  return { flashGroup, sprite };
}

function rePivotNodeToCenter(node) {
  if (!node || node.position.lengthSq() > 1e-10) return node;
  const bb = new THREE.Box3();
  if (node.isMesh && node.geometry) {
    if (!node.geometry.boundingBox) node.geometry.computeBoundingBox();
    bb.copy(node.geometry.boundingBox);
    if (bb.isEmpty() || !node.parent) return node;
    const ctr = bb.getCenter(new THREE.Vector3());
    const pivot = new THREE.Group();
    pivot.name = node.name;
    pivot.position.copy(ctr);
    const parent = node.parent;
    parent.add(pivot);
    node.position.sub(ctr);
    pivot.add(node);
    return pivot;
  }
  if (!node.children.length) return node;
  for (let i = 0; i < node.children.length; i++) {
    const c = node.children[i];
    if (!c.isMesh || !c.geometry) continue;
    c.updateMatrix();
    if (!c.geometry.boundingBox) c.geometry.computeBoundingBox();
    bb.union(new THREE.Box3().copy(c.geometry.boundingBox).applyMatrix4(c.matrix));
  }
  if (bb.isEmpty()) return node;
  const ctr = bb.getCenter(new THREE.Vector3());
  node.position.copy(ctr);
  for (let i = 0; i < node.children.length; i++) {
    node.children[i].position.sub(ctr);
  }
  return node;
}

// Gentle local curls on shotgun.glb left support hand (Bone_L005..022) so all 5 digits wrap cleanly around the pump forend
const SHOTGUN_LEFT_HAND_CURLS = Object.freeze({
  Bone_L005: [0.0, 0.0, 0.40],
  Bone_L006: [0.0, 0.0, 0.42],
  Bone_L009: [0.0, 0.0, 0.30],
  Bone_L010: [0.0, 0.0, 0.32],
  Bone_L013: [0.0, 0.0, 0.28],
  Bone_L014: [0.0, 0.0, 0.28],
  Bone_L017: [0.0, 0.0, 0.25],
  Bone_L018: [0.0, 0.0, 0.25],
  Bone_L020: [0.35, 0.0, 0.20],
  Bone_L021: [0.22, 0.0, 0.14],
  Bone_L022: [0.15, 0.0, 0.10]
});

// Gentle local curls on ak47.glb (AK-47 & RPK-74) so left fingertips tuck neatly into the handguard instead of peeking above the gas tube
const AK47_LEFT_HAND_CURLS = Object.freeze({
  Bone_L005: [0.0, 0.0, 0.22],
  Bone_L006: [0.0, 0.0, 0.26],
  Bone_L009: [0.0, 0.0, 0.36],
  Bone_L010: [0.0, 0.0, 0.44],
  Bone_L011: [0.0, 0.0, 0.32],
  Bone_L013: [0.0, 0.0, 0.36],
  Bone_L014: [0.0, 0.0, 0.44],
  Bone_L015: [0.0, 0.0, 0.32],
  Bone_L017: [0.0, 0.0, 0.34],
  Bone_L018: [0.0, 0.0, 0.40],
  Bone_L019: [0.0, 0.0, 0.28]
});

function applyLeftHandBoneCurls(modelScene, curlMap) {
  if (!modelScene || !curlMap) return;
  const e = new THREE.Euler();
  const q = new THREE.Quaternion();
  for (const [boneName, rot] of Object.entries(curlMap)) {
    const bone = modelScene.getObjectByName(boneName);
    if (bone) {
      q.setFromEuler(e.set(rot[0], rot[1], rot[2], 'XYZ'));
      bone.quaternion.multiply(q);
    }
  }
}

/**
 * Loads and dresses a first-person PBR GLB viewmodel for `weaponId` (supports ALL 11 weapons).
 * Returns null cleanly in non-WebGL headless environments unless `opts.bypassBrowserGuard` is set.
 */
export async function loadCs2ViewmodelGlb(weaponId, assets = null, envMap = null, opts = {}) {
  const spec = getCs2WeaponSpec(weaponId);
  if (!spec) return null;
  if (!opts.bypassBrowserGuard && !canUseCs2WeaponGlb()) return null;

  const assetMgr = assets || getAssetManager();
  if (!assetMgr || typeof assetMgr.loadAssetGltf !== 'function') return null;

  const needsOptics = Boolean(spec.optic);
  const needsExternalArms = Boolean(spec.isKnife || spec.isGsh18);
  const armsPreset = getFpsArmsPreset(weaponId);
  const armsPath = armsPreset.modelPath || FPS_ARMS_RIFLE_PATH;

  const [gltf, opticsGltf, armsGltf, skelUtils] = await Promise.all([
    assetMgr.loadAssetGltf(spec.model),
    needsOptics
      ? (opts.opticsGltf !== undefined ? Promise.resolve(opts.opticsGltf) : assetMgr.loadAssetGltf(OPTICS_GLB_PATH).catch(() => null))
      : Promise.resolve(null),
    needsExternalArms
      ? (opts.armsGltf !== undefined ? Promise.resolve(opts.armsGltf) : assetMgr.loadAssetGltf(armsPath).catch(() => null))
      : Promise.resolve(null),
    spec.isFpRig ? getSkeletonUtils() : Promise.resolve(null)
  ]);
  if (!gltf?.scene) return null;
  markSharedGlbTemplate(gltf.scene);

  const root = new THREE.Group();
  root.name = `cs2_vm_${weaponId}`;

  const modelScene = spec.isFpRig && skelUtils?.clone
    ? skelUtils.clone(gltf.scene)
    : gltf.scene.clone(true);
  root.add(modelScene);

  // Preserve knife.glb exact legacy pipeline (strip baked arms, isolate Knife pivot, attach knife_right_fist_v3)
  if (spec.isKnife) {
    stripBakedCs2Arms(modelScene);
    const nodes = {};
    modelScene.traverse((obj) => {
      if (obj.name) nodes[obj.name] = obj;
      if (obj.isMesh) {
        obj.frustumCulled = false;
        obj.castShadow = false;
        obj.receiveShadow = false;
      }
    });
    dressCs2WeaponMaterials(modelScene, envMap, spec.variantSkin);

    let knifeSpinPivot = null;
    if (nodes.Knife && nodes.Knife.parent) {
      const kNode = nodes.Knife;
      const pivot = new THREE.Group();
      pivot.name = 'cs2KnifeSpinPivot';
      const kPos = armsPreset.knifeLocalPos || [0, 0, 0];
      const kRot = armsPreset.knifeLocalRot || [0.8229, -0.5797, -0.8415];
      pivot.position.set(kPos[0], kPos[1], kPos[2]);

      const alignGroup = new THREE.Group();
      alignGroup.name = 'cs2KnifeGripAlign';
      alignGroup.rotation.set(kRot[0], kRot[1], kRot[2]);

      kNode.parent.add(pivot);
      kNode.position.set(0, 0, -0.042);
      alignGroup.add(kNode);
      pivot.add(alignGroup);
      knifeSpinPivot = pivot;
    }

    const fpsArms = await attachFpsArmsToViewmodel(weaponId, modelScene, assetMgr, envMap, {
      armsGltf: armsGltf || null
    });

    root.userData = {
      isCs2Glb: true,
      weaponId,
      variantSkin: spec.variantSkin,
      cs2Pose: spec.pose,
      nodes,
      fpsArms,
      armLGroup: fpsArms?.armLGroup || null,
      armRGroup: fpsArms?.armRGroup || null,
      magNode: null,
      magHomePos: null,
      magHomeRot: null,
      boltNode: null,
      boltHomePos: null,
      pumpNode: null,
      pumpHomePos: null,
      handLNode: fpsArms?.armLGroup || null,
      handLHomePos: fpsArms?.armLHomePos || null,
      handLHomeRot: fpsArms?.armLHomeRot || null,
      armLNode: null,
      armLHomePos: null,
      knifeNode: knifeSpinPivot,
      knifeHomePos: knifeSpinPivot ? knifeSpinPivot.position.clone() : null,
      knifeHomeRot: knifeSpinPivot ? knifeSpinPivot.rotation.clone() : null,
      activeWeaponMesh: knifeSpinPivot,
      knifePivotBasePos: knifeSpinPivot ? knifeSpinPivot.position.clone() : null,
      muzzleNode: null,
      ejectNode: null,
      flashMesh: null,
      flashSprite: null,
      _boundEnvMap: envMap || null
    };
    return root;
  }

  // Keep native Blender horizontal handguard rest poses on fp/*.glb (no grip_vgrip);
  // curl M870 shotgun support fingers & thumb gently around pump forend and tuck AK-47/RPK-74 fingertips onto handguard once on load.
  if (weaponId === 'shotgun') {
    applyLeftHandBoneCurls(modelScene, SHOTGUN_LEFT_HAND_CURLS);
  } else if (weaponId === 'rifle' || weaponId === 'lmg') {
    applyLeftHandBoneCurls(modelScene, AK47_LEFT_HAND_CURLS);
  }

  // Scale FP_K=2 models by 0.5 -> real meters; keep gsh18 at 1x scale; center bore.y=0 and gripR.z=0
  const fpScale = spec.isGsh18 ? 1.0 : 0.5;
  modelScene.scale.setScalar(fpScale);
  modelScene.position.set(0, -fpScale * (spec.boreZ || 0), -fpScale * (spec.gripR?.[2] || 0));

  removeNodesByPattern(modelScene, /^(SpareMagazine|SpareMagazineGeometry|SpareMagazineGrip)$/i);
  if (spec.isFpRig && (weaponId === 'rifle' || weaponId === 'lmg')) {
    removeNodesByPattern(modelScene, /^(Suppressor|SuppressorTip)$/i);
  }
  if (spec.hideRearIron) {
    removeNodesByPattern(modelScene, /^(RearIronSight|RearIronGeometry)$/i);
  }

  const nodes = {};
  modelScene.traverse((obj) => {
    if (obj.name) nodes[obj.name] = obj;
    if (obj.isMesh || obj.isSkinnedMesh) {
      obj.frustumCulled = false;
      obj.castShadow = false;
      obj.receiveShadow = false;
    }
  });

  dressCs2WeaponMaterials(modelScene, envMap, spec.variantSkin);

  // Per-weapon attachments in K-space (children of modelScene or Gun_<id>)
  const kAttachRoot = modelScene.children[0] || modelScene;
  let customMuzzleTip = null;
  if (spec.suppressorPos) {
    const supp = buildM4A1Suppressor(spec.suppressorPos, envMap, false, false);
    kAttachRoot.add(supp.group);
    customMuzzleTip = supp.tip;
  }
  if (spec.isRpkConversion) {
    const gunNode = kAttachRoot.children.find((c) => /^Gun_/i.test(c.name || '')) || nodes.Gun_ak47;
    const rpk = buildRpkDrumAndAttachments(kAttachRoot, gunNode, envMap, false, false);
    customMuzzleTip = rpk.rpkTip;
  }
  if (spec.optic && opticsGltf?.scene) {
    if (spec.isGsh18 && nodes.ChargingHandle) {
      // Mount MicroOptic on gsh18 slide (ChargingHandle has local offset [0.075, 0.085, -0.05])
      const slideOpticSpec = {
        ...spec.optic,
        pos: [
          spec.optic.pos[0] - 0.075,
          spec.optic.pos[1] - 0.085,
          spec.optic.pos[2] + 0.05
        ]
      };
      attachOpticFromGlb(nodes.ChargingHandle, opticsGltf, slideOpticSpec, envMap, false, false, true);
    } else {
      attachOpticFromGlb(kAttachRoot, opticsGltf, spec.optic, envMap, false, false, true);
    }
  }

  // Pair gsh18 1P with CPU-baked 2-hand pistol grip from fps_arms_rigged.glb reload_gsh18_empty t=0
  let fpsArms = null;
  if (spec.isGsh18) {
    fpsArms = await attachFpsArmsToViewmodel(weaponId, modelScene, assetMgr, envMap, {
      armsGltf: armsGltf || null
    });
  }

  const rawMuzzle = customMuzzleTip || nodes.MuzzleSocket || nodes.MuzzleDeviceTip || nodes.Muzzle || null;
  const flash = attachCs2MuzzleFlash(root, rawMuzzle, true);

  const magNode = nodes.Magazine || nodes.Mag || null;
  if (magNode && magNode.position.lengthSq() < 1e-10) {
    nodes.Magazine = rePivotNodeToCenter(magNode);
  }
  const boltNode = nodes.ChargingHandle || nodes.bolt_knob || null;
  const pumpNode = nodes.Pump || null;
  const ikLeftNode = spec.isFpRig ? (nodes.IK_Hand_Cntrl_L || null) : null;
  const forearmLNode = spec.isFpRig ? (nodes.Forearm_L || null) : null;

  const gunRootScale = spec.isRpkConversion || weaponId === 'rifle' ? 1 / 1.2575 : 1.0;

  root.userData = {
    isCs2Glb: true,
    isFpRig: Boolean(spec.isFpRig),
    weaponId,
    variantSkin: spec.variantSkin,
    cs2Pose: spec.pose,
    nodes,
    fpsArms,
    armLGroup: fpsArms?.armLGroup || null,
    armRGroup: fpsArms?.armRGroup || null,
    magNode: nodes.Magazine || nodes.Mag || null,
    magHomePos: (nodes.Magazine || nodes.Mag)?.position.clone() || null,
    magHomeRot: (nodes.Magazine || nodes.Mag)?.rotation.clone() || null,
    boltNode,
    boltHomePos: boltNode ? boltNode.position.clone() : null,
    pumpNode,
    pumpHomePos: pumpNode ? pumpNode.position.clone() : null,
    ikLeftNode,
    ikLeftHomePos: ikLeftNode ? ikLeftNode.position.clone() : null,
    ikLeftHomeRot: ikLeftNode ? ikLeftNode.rotation.clone() : null,
    forearmLNode,
    forearmLHomeRot: forearmLNode ? forearmLNode.rotation.clone() : null,
    reloadAnimScale: (spec.isGsh18 ? 0.55 : 1.0) * gunRootScale,
    handLNode: fpsArms?.armLGroup || null,
    handLHomePos: fpsArms?.armLHomePos || null,
    handLHomeRot: fpsArms?.armLHomeRot || null,
    armLNode: null,
    armLHomePos: null,
    knifeNode: null,
    knifeHomePos: null,
    knifeHomeRot: null,
    activeWeaponMesh: null,
    knifePivotBasePos: null,
    muzzleNode: rawMuzzle,
    ejectNode: nodes.EjectionPort || nodes.Eject || null,
    flashMesh: flash?.flashGroup || null,
    flashSprite: flash?.sprite || null,
    _boundEnvMap: envMap || null
  };

  return root;
}

/**
 * Creates a normalized world-space PBR GLB weapon stripped of all 1P arms/hands for ALL 11 weapons:
 *   - Local origin (0, 0, 0) = firing grip center (`0.5 * GripR` on fp/*.glb, `0.5 * PrimaryGripSocket` on gsh18)
 *   - Real-world meters, muzzle pointing -Z, +Y up
 *   - Used by Lobby 02 Gunsmith Bench, Lobby 03 Operator, 3P Bots & Dropped Weapons
 */
export async function createCs2WorldWeaponMesh(weaponId, assets = null, envMap = null, opts = {}) {
  const spec = getCs2WeaponSpec(weaponId);
  if (!spec) return null;
  if (!opts.bypassBrowserGuard && !canUseCs2WeaponGlb()) return null;

  const assetMgr = assets || getAssetManager();
  if (!assetMgr || typeof assetMgr.loadAssetGltf !== 'function') return null;

  const needsOptics = Boolean(spec.optic);
  const [gltf, opticsGltf] = await Promise.all([
    assetMgr.loadAssetGltf(spec.model),
    needsOptics
      ? (opts.opticsGltf !== undefined ? Promise.resolve(opts.opticsGltf) : assetMgr.loadAssetGltf(OPTICS_GLB_PATH).catch(() => null))
      : Promise.resolve(null)
  ]);
  if (!gltf?.scene) return null;
  markSharedGlbTemplate(gltf.scene);

  const castShadow = Boolean(opts.castShadow);
  const receiveShadow = Boolean(opts.receiveShadow);

  const root = new THREE.Group();
  root.name = `cs2_world_${weaponId}`;

  // Knife: keep legacy models/cs2/knife.glb world weapon intact
  if (spec.isKnife) {
    const modelScene = gltf.scene.clone(true);
    stripBakedCs2Arms(modelScene);
    const nodes = {};
    modelScene.traverse((obj) => {
      if (obj.name) nodes[obj.name] = obj;
      if (obj.isMesh) {
        obj.castShadow = castShadow;
        obj.receiveShadow = receiveShadow;
        obj.frustumCulled = false;
      }
    });
    dressCs2WeaponMaterials(modelScene, envMap, spec.variantSkin);
    root.add(modelScene);
    root.userData = {
      isCs2Glb: true,
      isCs2WorldWeapon: true,
      weaponId,
      variantSkin: spec.variantSkin,
      muzzleNode: null,
      ejectNode: null,
      flashMesh: null,
      flashSprite: null,
      _boundEnvMap: envMap || null
    };
    return root;
  }

  // World scale 0.5 -> real meters for both FP_K=2 models and 2x-authored gsh18
  const worldScale = 0.5;
  const kGroup = new THREE.Group();
  kGroup.name = `cs2_world_k_${weaponId}`;
  kGroup.scale.setScalar(worldScale);

  const grip = spec.gripR || [0, 0, 0];
  kGroup.position.set(-worldScale * grip[0], -worldScale * grip[1], -worldScale * grip[2]);

  let gunClone = null;
  if (spec.isFpRig) {
    let srcGun = null;
    gltf.scene.traverse((obj) => {
      if (!srcGun && /^Gun_/i.test(String(obj.name || ''))) {
        srcGun = obj;
      }
    });
    gunClone = srcGun ? srcGun.clone(true) : gltf.scene.clone(true);
    if (!srcGun) stripBakedCs2Arms(gunClone);
  } else {
    gunClone = gltf.scene.clone(true);
  }

  removeNodesByPattern(gunClone, /^(SpareMagazine|SpareMagazineGeometry|SpareMagazineGrip)$/i);
  if (spec.isFpRig && (weaponId === 'rifle' || weaponId === 'lmg')) {
    removeNodesByPattern(gunClone, /^(Suppressor|SuppressorTip)$/i);
  }
  if (spec.hideRearIron) {
    removeNodesByPattern(gunClone, /^(RearIronSight|RearIronGeometry)$/i);
  }

  kGroup.add(gunClone);

  const nodes = {};
  gunClone.traverse((obj) => {
    if (obj.name) nodes[obj.name] = obj;
    if (obj.isMesh) {
      obj.castShadow = castShadow;
      obj.receiveShadow = receiveShadow;
      obj.frustumCulled = false;
    }
  });

  dressCs2WeaponMaterials(gunClone, envMap, spec.variantSkin);

  let customMuzzleTip = null;
  if (spec.suppressorPos) {
    const supp = buildM4A1Suppressor(spec.suppressorPos, envMap, castShadow, receiveShadow);
    kGroup.add(supp.group);
    customMuzzleTip = supp.tip;
  }
  if (spec.isRpkConversion) {
    const rpk = buildRpkDrumAndAttachments(kGroup, gunClone, envMap, castShadow, receiveShadow);
    customMuzzleTip = rpk.rpkTip;
  }
  if (spec.optic && opticsGltf?.scene) {
    attachOpticFromGlb(kGroup, opticsGltf, spec.optic, envMap, castShadow, receiveShadow, false);
  }

  root.add(kGroup);

  const rawMuzzle = customMuzzleTip || nodes.MuzzleSocket || nodes.MuzzleDeviceTip || nodes.Muzzle || null;
  const flash = attachCs2MuzzleFlash(root, rawMuzzle, false);

  root.userData = {
    isCs2Glb: true,
    isCs2WorldWeapon: true,
    weaponId,
    variantSkin: spec.variantSkin,
    muzzleNode: rawMuzzle,
    ejectNode: nodes.EjectionPort || nodes.Eject || null,
    flashMesh: flash?.flashGroup || null,
    flashSprite: flash?.sprite || null,
    _boundEnvMap: envMap || null
  };

  return root;
}

/** Resets all animated CS2 GLB viewmodel sub-nodes (mag, bolt, pump, FPRig IK/forearm, support hand/arm, knife pivot) to rest poses. */
export function resetCs2ViewmodelParts(vm) {
  const ud = vm?.userData;
  if (!ud || !ud.isCs2Glb) return;
  if (ud.magNode && ud.magHomePos) {
    ud.magNode.position.copy(ud.magHomePos);
    if (ud.magHomeRot) ud.magNode.rotation.copy(ud.magHomeRot);
    else ud.magNode.rotation.set(0, 0, 0);
    ud.magNode.visible = true;
  }
  if (ud.boltNode && ud.boltHomePos) {
    ud.boltNode.position.copy(ud.boltHomePos);
  }
  if (ud.pumpNode && ud.pumpHomePos) {
    ud.pumpNode.position.copy(ud.pumpHomePos);
  }
  if (ud.ikLeftNode) {
    if (ud.ikLeftHomePos) ud.ikLeftNode.position.copy(ud.ikLeftHomePos);
    if (ud.ikLeftHomeRot) ud.ikLeftNode.rotation.copy(ud.ikLeftHomeRot);
  }
  if (ud.forearmLNode && ud.forearmLHomeRot) {
    ud.forearmLNode.rotation.copy(ud.forearmLHomeRot);
  }
  if (ud.fpsArms) {
    resetFpsArmsPose(ud);
  } else {
    if (ud.handLNode && ud.handLHomePos) {
      ud.handLNode.position.copy(ud.handLHomePos);
      if (ud.handLHomeRot) ud.handLNode.rotation.copy(ud.handLHomeRot);
    }
    if (ud.armLNode && ud.armLHomePos) {
      ud.armLNode.position.copy(ud.armLHomePos);
    }
  }
  if (ud.knifeNode && ud.knifeHomePos) {
    ud.knifeNode.position.copy(ud.knifeHomePos);
    if (ud.knifeHomeRot) ud.knifeNode.rotation.copy(ud.knifeHomeRot);
    else ud.knifeNode.rotation.set(0, 0, 0);
  }
}
