// Adapted from StarKnightt/counter-strike-in-browser (MIT License, Copyright (c) 2026 StarKnightt)
// Loads and dresses Blender-modeled MIT CS2 GLB weapons (ak47.glb, awp.glb, knife.glb) for:
//   1) 1P viewmodels (with stitched gloved hands, ripstop sleeves, oiled walnut wood, blued steel COLOR_0 edge wear, coated AWP scope glass)
//   2) World-space weapons stripped of 1P hands/arms (Lobby 02 BAN SUNG workbench vise showcase & 3P tactical bots)

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

export const CS2_WEAPON_SPECS = {
  rifle: {
    model: 'models/cs2/ak47.glb',
    variantSkin: 'ak_classic',
    pose: {
      hip: { pos: [0.255, -0.148, -0.355], rot: [0.02, 0.03, 0.03] },
      ads: { pos: [0, -0.07064, -0.12], rot: [0.03266, 0, 0] },
      vmFov: { hip: 66, ads: 54 }
    }
  },
  m4a1: {
    model: 'models/cs2/ak47.glb',
    variantSkin: 'm4_obsidian',
    pose: {
      hip: { pos: [0.252, -0.148, -0.355], rot: [0.02, 0.03, 0.03] },
      ads: { pos: [0, -0.07064, -0.12], rot: [0.03266, 0, 0] },
      vmFov: { hip: 66, ads: 54 }
    }
  },
  scar: {
    model: 'models/cs2/ak47.glb',
    variantSkin: 'scar_fde',
    pose: {
      hip: { pos: [0.258, -0.148, -0.36], rot: [0.02, 0.03, 0.03] },
      ads: { pos: [0, -0.07064, -0.12], rot: [0.03266, 0, 0] },
      vmFov: { hip: 66, ads: 54 }
    }
  },
  smg: {
    model: 'models/cs2/ak47.glb',
    variantSkin: 'smg_obsidian',
    compactScaleZ: 0.84,
    pose: {
      hip: { pos: [0.245, -0.150, -0.335], rot: [0.02, 0.035, 0.03] },
      ads: { pos: [0, -0.07064, -0.12], rot: [0.03266, 0, 0] },
      vmFov: { hip: 66, ads: 54 }
    }
  },
  shotgun: {
    model: 'models/cs2/ak47.glb',
    variantSkin: 'shotgun_gunmetal',
    pose: {
      hip: { pos: [0.255, -0.150, -0.355], rot: [0.02, 0.03, 0.03] },
      ads: { pos: [0, -0.07064, -0.12], rot: [0.03266, 0, 0] },
      vmFov: { hip: 66, ads: 54 }
    }
  },
  lmg: {
    model: 'models/cs2/ak47.glb',
    variantSkin: 'lmg_gunmetal',
    pose: {
      hip: { pos: [0.260, -0.155, -0.365], rot: [0.02, 0.03, 0.03] },
      ads: { pos: [0, -0.07064, -0.12], rot: [0.03266, 0, 0] },
      vmFov: { hip: 66, ads: 54 }
    }
  },
  sniper: {
    model: 'models/cs2/awp.glb',
    variantSkin: 'awp_olive',
    pose: {
      hip: { pos: [0.24, -0.165, -0.41], rot: [0.03, 0.10, 0.03] },
      ads: { pos: [0, -0.088, -0.16], rot: [0, 0, 0] },
      vmFov: { hip: 66, ads: 54 }
    }
  },
  dmr: {
    model: 'models/cs2/awp.glb',
    variantSkin: 'dmr_slate',
    pose: {
      hip: { pos: [0.24, -0.165, -0.40], rot: [0.03, 0.09, 0.03] },
      ads: { pos: [0, -0.088, -0.16], rot: [0, 0, 0] },
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

// ---------------------------------------------------------------- COLOR_0 edge-wear shader injection
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

const BARE_STEEL = [0.256, 0.268, 0.282];

function dressSingleMaterial(m, tex, envMap, variantSkin) {
  m.vertexColors = false;
  const n = String(m.name || '');

  if (/^glove_palm/.test(n)) {
    applyTexSet(m, tex?.leather, { color: [1, 1, 1], roughness: 1, metalness: 0 });
  } else if (/^glove/.test(n)) {
    applyTexSet(m, tex?.fabric, { color: [1, 1, 1], roughness: 1, metalness: 0 });
  } else if (/^sleeve/.test(n)) {
    applyTexSet(m, tex?.ripstop, { color: [1, 1, 1], roughness: 1, metalness: 0 });
  } else if (/^gun_rubber/.test(n)) {
    applyTexSet(m, tex?.speckle, { color: [0.012, 0.012, 0.012], roughness: 0.85, metalness: 0, normalScale: 0.6 });
  } else if (/^scope_glass/.test(n)) {
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
  } else if (/^knife_blade/.test(n)) {
    applyTexSet(m, tex?.knifeBlade || tex?.steel, { color: [0.38, 0.39, 0.41], roughness: 0.24, metalness: 1.0 });
    bindEnvStrength(m, envMap, 0.95);
  } else if (/^knife_edge/.test(n)) {
    m.color?.setRGB?.(0.80, 0.81, 0.84);
    m.roughness = 0.08;
    m.metalness = 1.0;
    bindEnvStrength(m, envMap, 1.65);
  } else if (/^knife_handle/.test(n)) {
    applyTexSet(m, tex?.speckle, { color: [0.030, 0.030, 0.033], roughness: 0.70, metalness: 0, normalScale: 0.7 });
  } else if (/^brass/.test(n)) {
    bindEnvStrength(m, envMap, 1.4);
  } else if (/^awp_green/.test(n)) {
    if (variantSkin === 'dmr_slate') {
      applyTexSet(m, tex?.polymer, { color: [0.045, 0.052, 0.062], roughness: 0.74, metalness: 0.04, normalScale: 0.32 });
      addEdgeWear(m, [0.022, 0.026, 0.032], 0.55, 0.42);
    } else {
      applyTexSet(m, tex?.polymer, { color: [0.105, 0.135, 0.075], roughness: 0.75, metalness: 0, normalScale: 0.3 });
      addEdgeWear(m, [0.030, 0.036, 0.024], 0.55, 0.42);
    }
  } else if (/^gun_wood/.test(n)) {
    if (variantSkin === 'm4_obsidian') {
      applyTexSet(m, tex?.polymer, { color: [0.020, 0.022, 0.026], roughness: 0.76, metalness: 0.04, normalScale: 0.35 });
      addEdgeWear(m, [0.055, 0.060, 0.068], 0.50, 0.42);
    } else if (variantSkin === 'scar_fde') {
      applyTexSet(m, tex?.polymer, { color: [0.235, 0.172, 0.105], roughness: 0.72, metalness: 0.04, normalScale: 0.35 });
      addEdgeWear(m, [0.10, 0.078, 0.052], 0.55, 0.42);
    } else if (variantSkin === 'smg_obsidian') {
      applyTexSet(m, tex?.polymer, { color: [0.016, 0.018, 0.022], roughness: 0.74, metalness: 0.05, normalScale: 0.38 });
      addEdgeWear(m, [0.052, 0.058, 0.066], 0.52, 0.44);
    } else if (variantSkin === 'shotgun_gunmetal') {
      applyTexSet(m, tex?.wood, { color: [0.58, 0.52, 0.46], roughness: 1.0, metalness: 0 });
    } else if (variantSkin === 'lmg_gunmetal') {
      applyTexSet(m, tex?.polymer, { color: [0.052, 0.062, 0.044], roughness: 0.76, metalness: 0.04, normalScale: 0.36 });
      addEdgeWear(m, [0.024, 0.028, 0.020], 0.55, 0.42);
    } else {
      applyTexSet(m, tex?.wood, { color: [1, 1, 1], roughness: 1.0, metalness: 0 });
    }
  } else if (/^gun_bakelite/.test(n)) {
    if (variantSkin === 'm4_obsidian') {
      applyTexSet(m, tex?.speckle, { color: [0.014, 0.015, 0.018], roughness: 0.80, metalness: 0.02, normalScale: 0.55 });
    } else if (variantSkin === 'scar_fde') {
      applyTexSet(m, tex?.speckle, { color: [0.065, 0.050, 0.036], roughness: 0.78, metalness: 0.02, normalScale: 0.5 });
    } else if (variantSkin === 'smg_obsidian') {
      applyTexSet(m, tex?.speckle, { color: [0.020, 0.022, 0.025], roughness: 0.76, metalness: 0.04, normalScale: 0.55 });
    } else if (variantSkin === 'shotgun_gunmetal') {
      applyTexSet(m, tex?.speckle, { color: [0.018, 0.019, 0.021], roughness: 0.80, metalness: 0.02, normalScale: 0.55 });
    } else if (variantSkin === 'lmg_gunmetal') {
      applyTexSet(m, tex?.speckle, { color: [0.016, 0.018, 0.016], roughness: 0.80, metalness: 0.02, normalScale: 0.55 });
    } else {
      applyTexSet(m, tex?.bakelite, { color: [1, 1, 1], roughness: 0.30, metalness: 0 });
    }
  } else if (/^gun_steel_light/.test(n)) {
    if (variantSkin === 'm4_obsidian') {
      applyTexSet(m, tex?.steel, { color: [0.014, 0.016, 0.020], roughness: 0.46, metalness: 0.88 });
      addEdgeWear(m, [0.15, 0.16, 0.18], 0.50);
      bindEnvStrength(m, envMap, 0.95);
    } else if (variantSkin === 'scar_fde') {
      applyTexSet(m, tex?.steel, { color: [0.165, 0.125, 0.078], roughness: 0.48, metalness: 0.55 });
      addEdgeWear(m, [0.26, 0.24, 0.20], 0.55);
      bindEnvStrength(m, envMap, 0.92);
    } else if (variantSkin === 'smg_obsidian') {
      applyTexSet(m, tex?.steel, { color: [0.026, 0.029, 0.034], roughness: 0.44, metalness: 0.88 });
      addEdgeWear(m, [0.19, 0.20, 0.22], 0.55);
      bindEnvStrength(m, envMap, 0.98);
    } else if (variantSkin === 'shotgun_gunmetal') {
      applyTexSet(m, tex?.steel, { color: [0.038, 0.041, 0.046], roughness: 0.46, metalness: 0.90 });
      addEdgeWear(m, [0.24, 0.25, 0.26], 0.65);
      bindEnvStrength(m, envMap, 1.02);
    } else if (variantSkin === 'lmg_gunmetal') {
      applyTexSet(m, tex?.steel, { color: [0.032, 0.035, 0.040], roughness: 0.48, metalness: 0.90 });
      addEdgeWear(m, [0.24, 0.25, 0.26], 0.62);
      bindEnvStrength(m, envMap, 1.0);
    } else {
      applyTexSet(m, tex?.steel, { color: [0.024, 0.027, 0.031], roughness: 0.50, metalness: 0.90 });
      addEdgeWear(m, [0.16, 0.17, 0.18], 0.42);
      bindEnvStrength(m, envMap, 0.95);
    }
  } else if (/^gun_steel/.test(n)) {
    if (variantSkin === 'm4_obsidian') {
      applyTexSet(m, tex?.steel, { color: [0.0085, 0.0095, 0.012], roughness: 0.44, metalness: 0.90 });
      addEdgeWear(m, [0.20, 0.21, 0.23], 0.85);
      bindEnvStrength(m, envMap, 1.0);
    } else if (variantSkin === 'scar_fde') {
      applyTexSet(m, tex?.steel, { color: [0.014, 0.015, 0.017], roughness: 0.46, metalness: 0.88 });
      addEdgeWear(m, [0.24, 0.24, 0.25], 0.95);
      bindEnvStrength(m, envMap, 0.98);
    } else if (variantSkin === 'smg_obsidian') {
      applyTexSet(m, tex?.steel, { color: [0.010, 0.011, 0.014], roughness: 0.43, metalness: 0.90 });
      addEdgeWear(m, [0.24, 0.25, 0.27], 0.90);
      bindEnvStrength(m, envMap, 1.0);
    } else if (variantSkin === 'shotgun_gunmetal') {
      applyTexSet(m, tex?.steel, { color: [0.024, 0.027, 0.031], roughness: 0.44, metalness: 0.92 });
      addEdgeWear(m, [0.28, 0.29, 0.31], 1.05);
      bindEnvStrength(m, envMap, 1.05);
    } else if (variantSkin === 'lmg_gunmetal') {
      applyTexSet(m, tex?.steel, { color: [0.019, 0.022, 0.026], roughness: 0.45, metalness: 0.90 });
      addEdgeWear(m, [0.27, 0.28, 0.30], 1.0);
      bindEnvStrength(m, envMap, 1.02);
    } else {
      applyTexSet(m, tex?.steel, { color: [0.011, 0.0123, 0.016], roughness: 0.45, metalness: 0.90 });
      addEdgeWear(m, BARE_STEEL, 1.0);
      bindEnvStrength(m, envMap, 1.0);
    }
  } else if (/^gun_black/.test(n)) {
    const col = variantSkin === 'm4_obsidian'
      ? [0.0050, 0.0055, 0.0065]
      : variantSkin === 'shotgun_gunmetal'
        ? [0.010, 0.011, 0.013]
        : [0.0056, 0.0060, 0.0070];
    const wearCol = variantSkin === 'shotgun_gunmetal' ? [0.21, 0.22, 0.23] : [0.19, 0.19, 0.20];
    applyTexSet(m, tex?.steel, { color: col, roughness: 0.48, metalness: 0.85 });
    addEdgeWear(m, wearCol, 0.7);
    bindEnvStrength(m, envMap, 0.90);
  }

  m.userData = { ...(m.userData || {}), shared: true, isCs2WeaponMat: true, variantSkin };
  m.needsUpdate = true;
}

/**
 * Applies procedural PBR textures, COLOR_0 edge-wear shader, and explicit metallic envMap bindings
 * across every mesh in `root` using cached per-variant dressed materials (zero duplicate shader compiles).
 */
export function dressCs2WeaponMaterials(root, envMap = null, variantSkin = 'ak_classic') {
  if (!root) return root;
  const tex = weaponTextureSets();
  const skinKey = String(variantSkin || 'ak_classic');

  const resolveDressedMat = (origMat) => {
    if (!origMat) return origMat;
    const matName = String(origMat.name || '');
    if (matName) {
      const cacheKey = `${skinKey}:${matName}`;
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
      dressSingleMaterial(cloned, tex, envMap, skinKey);
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

/** Updates explicit envMap binding on every metallic / scope-glass material in `root` (or all cached CS2 materials). */
export function refreshCs2WeaponEnvMap(root, envMap = null) {
  const applyMat = (m) => {
    if (!m || !(m.userData?.cs2EnvIntensity > 0)) return;
    const nextEnv = envMap || null;
    if (m.envMap !== nextEnv) {
      m.envMap = nextEnv;
      if (nextEnv) {
        m.envMapIntensity = m.userData.cs2EnvIntensity;
      }
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

/** Updates explicit envMap on all cached CS2 metallic/scope-glass materials globally (1P + showcase + bots). */
export function refreshAllCs2WeaponEnvMaps(envMap = null) {
  const nextEnv = envMap || null;
  for (const m of CS2_ENV_MATERIALS) {
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
  refreshFpsArmsEnvMap(nextEnv);
}

function markSharedGlbTemplate(scene) {
  if (!scene || scene.userData?.__cs2WeaponSharedMarked) return;
  scene.traverse((obj) => {
    if (obj.geometry) {
      obj.geometry.userData = { ...(obj.geometry.userData || {}), shared: true };
      if (!obj.geometry.boundingSphere) obj.geometry.computeBoundingSphere();
    }
  });
  scene.userData = { ...(scene.userData || {}), __cs2WeaponSharedMarked: true };
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

function attachCs2MuzzleFlash(root, muzzleNode, isFirstPerson = true) {
  if (!muzzleNode) return null;
  const flashGroup = new THREE.Group();
  flashGroup.name = 'cs2MuzzleFlash';
  flashGroup.position.copy(muzzleNode.position);
  flashGroup.position.z -= 0.016;
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

  const parent = muzzleNode.parent || root;
  parent.add(flashGroup);
  return { flashGroup, sprite };
}

function applyCompactSmgProportions(nodes, scaleZ, includeHands) {
  const akNode = nodes.AK47;
  if (akNode) {
    akNode.scale.set(0.95, 0.95, scaleZ);
  }
  const magNode = nodes.Mag;
  if (magNode) {
    magNode.scale.set(0.92, 0.94, scaleZ);
  }
  if (nodes.Muzzle) {
    nodes.Muzzle.position.z *= scaleZ;
  }
  if (includeHands) {
    // Shift support hand & forearm back onto the shorter SMG handguard without distorting glove anatomy
    const shiftZ = 0.046;
    if (nodes.HandL) nodes.HandL.position.z += shiftZ;
    if (nodes.ArmL) nodes.ArmL.position.z += shiftZ;
  }
}

/**
 * Loads and dresses a first-person CS2 GLB viewmodel for `weaponId`.
 * Returns null cleanly for sidearms (`pistol`, `deagle`, `glock`) or non-WebGL headless environments.
 */
export async function loadCs2ViewmodelGlb(weaponId, assets = null, envMap = null, opts = {}) {
  const spec = getCs2WeaponSpec(weaponId);
  if (!spec) return null;
  if (!opts.bypassBrowserGuard && !canUseCs2WeaponGlb()) return null;

  const assetMgr = assets || getAssetManager();
  if (!assetMgr || typeof assetMgr.loadAssetGltf !== 'function') return null;

  const armsPreset = getFpsArmsPreset(weaponId);
  const armsPath = armsPreset.modelPath || FPS_ARMS_RIFLE_PATH;
  const [gltf, armsGltf] = await Promise.all([
    assetMgr.loadAssetGltf(spec.model),
    opts.armsGltf !== undefined
      ? Promise.resolve(opts.armsGltf)
      : assetMgr.loadAssetGltf(armsPath).catch(() => null)
  ]);
  if (!gltf?.scene) return null;
  markSharedGlbTemplate(gltf.scene);

  const root = new THREE.Group();
  root.name = `cs2_vm_${weaponId}`;
  const modelScene = gltf.scene.clone(true);
  root.add(modelScene);

  // Completely strip baked low-detail 1P arms/hands (ArmL/ArmR/HandL/HandR) before dressing materials
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

  if (spec.compactScaleZ) {
    applyCompactSmgProportions(nodes, spec.compactScaleZ, false);
  }

  // Re-pivot Mag around its own center so reload drops/tilts cleanly in local space
  if (nodes.Mag) {
    nodes.Mag = rePivotNodeToCenter(nodes.Mag);
  }

  // Isolate Knife node inside a handle-centered upright spin pivot seated cleanly in RightArm's grip
  let knifeSpinPivot = null;
  if (spec.isKnife && nodes.Knife && nodes.Knife.parent) {
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
    // Center knife handle (z in [0.004..0.080], midpoint 0.042) right inside the gloved palm
    kNode.position.set(0, 0, -0.042);
    alignGroup.add(kNode);
    pivot.add(alignGroup);
    knifeSpinPivot = pivot;
  }

  // Mount verified CC-BY 4.0 external PBR tactical arms & gloved hands (with headless procedural fallback)
  const fpsArms = await attachFpsArmsToViewmodel(weaponId, modelScene, assetMgr, envMap, {
    armsGltf: armsGltf || null
  });

  const flash = spec.isKnife ? null : attachCs2MuzzleFlash(modelScene, nodes.Muzzle, true);

  const magNode = nodes.Mag || null;
  const boltNode = nodes.bolt_knob || null;
  const handLNode = fpsArms?.armLGroup || null;
  const armLNode = null;

  root.userData = {
    isCs2Glb: true,
    weaponId,
    variantSkin: spec.variantSkin,
    cs2Pose: spec.pose,
    nodes,
    fpsArms,
    armLGroup: fpsArms?.armLGroup || null,
    armRGroup: fpsArms?.armRGroup || null,
    magNode,
    magHomePos: magNode ? magNode.position.clone() : null,
    magHomeRot: magNode ? magNode.rotation.clone() : null,
    boltNode,
    boltHomePos: boltNode ? boltNode.position.clone() : null,
    handLNode,
    handLHomePos: fpsArms?.armLHomePos || null,
    handLHomeRot: fpsArms?.armLHomeRot || null,
    armLNode,
    armLHomePos: null,
    knifeNode: knifeSpinPivot,
    knifeHomePos: knifeSpinPivot ? knifeSpinPivot.position.clone() : null,
    knifeHomeRot: knifeSpinPivot ? knifeSpinPivot.rotation.clone() : null,
    activeWeaponMesh: knifeSpinPivot,
    knifePivotBasePos: knifeSpinPivot ? knifeSpinPivot.position.clone() : null,
    muzzleNode: nodes.Muzzle || null,
    ejectNode: nodes.Eject || null,
    flashMesh: flash?.flashGroup || null,
    flashSprite: flash?.sprite || null,
    _boundEnvMap: envMap || null
  };

  return root;
}

/**
 * Creates a world-space CS2 GLB weapon stripped of 1P hands/arms (`HandR`, `ArmR`, `HandL`, `ArmL`)
 * for Lobby 02 BAN SUNG Gunsmith workbench showcase and 3P tactical bots (`cs2-bots-glb`).
 * Barrel/blade points along -Z with +Y up and origin at the trigger/grip in real meters.
 */
export async function createCs2WorldWeaponMesh(weaponId, assets = null, envMap = null, opts = {}) {
  const spec = getCs2WeaponSpec(weaponId);
  if (!spec) return null;
  if (!opts.bypassBrowserGuard && !canUseCs2WeaponGlb()) return null;

  const assetMgr = assets || getAssetManager();
  if (!assetMgr || typeof assetMgr.loadAssetGltf !== 'function') return null;

  const gltf = await assetMgr.loadAssetGltf(spec.model);
  if (!gltf?.scene) return null;
  markSharedGlbTemplate(gltf.scene);

  const root = new THREE.Group();
  root.name = `cs2_world_${weaponId}`;
  const modelScene = gltf.scene.clone(true);

  const nodes = {};
  const toRemove = [];
  modelScene.traverse((obj) => {
    if (obj.name) nodes[obj.name] = obj;
    if (/^(Hand|Arm)[RL]?$/i.test(String(obj.name || ''))) {
      obj.visible = false;
      toRemove.push(obj);
    }
  });
  for (let i = 0; i < toRemove.length; i++) {
    toRemove[i].parent?.remove(toRemove[i]);
  }

  const castShadow = Boolean(opts.castShadow);
  const receiveShadow = Boolean(opts.receiveShadow);
  modelScene.traverse((obj) => {
    if (obj.isMesh) {
      obj.castShadow = castShadow;
      obj.receiveShadow = receiveShadow;
      obj.frustumCulled = false;
    }
  });

  dressCs2WeaponMaterials(modelScene, envMap, spec.variantSkin);

  if (spec.compactScaleZ) {
    applyCompactSmgProportions(nodes, spec.compactScaleZ, false);
  }

  root.add(modelScene);

  const flash = spec.isKnife ? null : attachCs2MuzzleFlash(modelScene, nodes.Muzzle, false);

  root.userData = {
    isCs2Glb: true,
    isCs2WorldWeapon: true,
    weaponId,
    variantSkin: spec.variantSkin,
    muzzleNode: nodes.Muzzle || null,
    ejectNode: nodes.Eject || null,
    flashMesh: flash?.flashGroup || null,
    flashSprite: flash?.sprite || null,
    _boundEnvMap: envMap || null
  };

  return root;
}

/** Resets all animated CS2 GLB viewmodel sub-nodes (mag, bolt, support hand/arm, knife pivot) to rest poses. */
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

