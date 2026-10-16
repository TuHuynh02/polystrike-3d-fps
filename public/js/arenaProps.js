// glTF props for the arena (visual only: collision boxes in shared/maps.js are never touched).
// Kenney crate models are placed ONLY when their bounding box fits the target AABB within a tolerance; otherwise the
// caller keeps the procedural box. Placements are batched into InstancedMeshes (one draw call per sub-mesh).

import * as THREE from '../vendor/three/three.module.js';

export const CRATE_MODEL_NAMES = ['crate-wide', 'crate-medium', 'crate-small'];
export const DEFAULT_FIT_TOLERANCE = 1.6; // max(scale)/min(scale) allowed before the model would look squashed

/**
 * Non-uniform fit of a model box `size` {x,y,z} into an AABB {w,h,d}. Tries yaw 0 and 90 degrees.
 * @returns {{ok:boolean, rotY:number, scale:{x:number,y:number,z:number}, anisotropy:number}}
 */
export function fitBoxToAabb(size, aabb, { tolerance = DEFAULT_FIT_TOLERANCE, allowRotate = true } = {}) {
  const evalYaw = (swap) => {
    const mx = swap ? size.z : size.x;
    const mz = swap ? size.x : size.z;
    if (mx <= 1e-6 || size.y <= 1e-6 || mz <= 1e-6) return { ok: false, anisotropy: Infinity };
    const scale = { x: aabb.w / mx, y: aabb.h / size.y, z: aabb.d / mz };
    const hi = Math.max(scale.x, scale.y, scale.z);
    const lo = Math.min(scale.x, scale.y, scale.z);
    return { scale, anisotropy: lo > 0 ? hi / lo : Infinity, rotY: swap ? Math.PI / 2 : 0 };
  };
  const a = evalYaw(false);
  const b = allowRotate ? evalYaw(true) : { anisotropy: Infinity };
  const best = b.anisotropy < a.anisotropy ? b : a;
  if (!best.scale) return { ok: false, rotY: 0, scale: { x: 1, y: 1, z: 1 }, anisotropy: Infinity };
  return { ok: best.anisotropy <= tolerance, rotY: best.rotY, scale: best.scale, anisotropy: best.anisotropy };
}

/**
 * Uniform "contain" fit (no distortion): the largest uniform scale that keeps the (yaw 0 or 90) model inside `maxAabb`.
 * Rejected when that scale would be below `minScale` (too small to read) .
 */
export function fitContainUniform(size, maxAabb, { minScale = 0.6, allowRotate = true } = {}) {
  const evalYaw = (swap) => {
    const mx = swap ? size.z : size.x;
    const mz = swap ? size.x : size.z;
    if (mx <= 1e-6 || size.y <= 1e-6 || mz <= 1e-6) return { s: 0, rotY: 0 };
    return { s: Math.min(maxAabb.w / mx, maxAabb.h / size.y, maxAabb.d / mz), rotY: swap ? Math.PI / 2 : 0 };
  };
  const a = evalYaw(false);
  const b = allowRotate ? evalYaw(true) : { s: 0, rotY: 0 };
  const best = b.s > a.s ? b : a;
  return { ok: best.s >= minScale, rotY: best.rotY, scale: { x: best.s, y: best.s, z: best.s }, anisotropy: 1 };
}

/** Bounding box of a loaded model root (cached on userData). Returns null for empty models. */
export function getModelBounds(root) {
  if (!root) return null;
  if (root.userData.__bounds) return root.userData.__bounds;
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  if (box.isEmpty()) return null;
  root.userData.__bounds = box;
  return box;
}

/**
 * Collects placements of one cached model and flushes them as InstancedMeshes.
 * Usage: const b = new PropBatcher(gltfScene); if (b.tryAdd(aabbCenter, aabb)) ...; b.flush(game).
 */
export class PropBatcher {
  constructor(modelRoot, name = 'prop') {
    this.root = modelRoot;
    this.name = name;
    this.placements = []; // THREE.Matrix4 (model-root space -> world)
    this.bounds = getModelBounds(modelRoot);
    this.fitted = []; // { center, aabb, fit } for tests/diagnostics
  }

  /**
   * @param {{x:number,y:number,z:number}} center AABB centre (world)
   * @param {{w:number,h:number,d:number}} aabb target size
   */
  tryAdd(center, aabb, opts) {
    if (!this.bounds) return null;
    const size = this.bounds.getSize(new THREE.Vector3());
    const fit = fitBoxToAabb(size, aabb, opts);
    if (!fit.ok) return null;
    const mCenter = this.bounds.getCenter(new THREE.Vector3());
    // world = T(center) * R(yaw) * S(scale) * T(-modelCenter)
    const m = new THREE.Matrix4()
      .makeTranslation(center.x, center.y, center.z)
      .multiply(new THREE.Matrix4().makeRotationY(fit.rotY))
      .multiply(new THREE.Matrix4().makeScale(fit.scale.x, fit.scale.y, fit.scale.z))
      .multiply(new THREE.Matrix4().makeTranslation(-mCenter.x, -mCenter.y, -mCenter.z));
    this.placements.push(m);
    this.fitted.push({ center, aabb, fit });
    return fit;
  }

  /**
   * Places the model undistorted (uniform scale) inside `maxAabb`, its bottom resting at `bottomY` and centred on x/z.
   * Returns the fit or null when the model would have to be smaller than `minScale`.
   */
  tryAddContained(centerXZ, bottomY, maxAabb, opts) {
    if (!this.bounds) return null;
    const size = this.bounds.getSize(new THREE.Vector3());
    const fit = fitContainUniform(size, maxAabb, opts);
    if (!fit.ok) return null;
    const mCenter = this.bounds.getCenter(new THREE.Vector3());
    const halfH = (size.y * fit.scale.y) / 2;
    const m = new THREE.Matrix4()
      .makeTranslation(centerXZ.x, bottomY + halfH, centerXZ.z)
      .multiply(new THREE.Matrix4().makeRotationY(fit.rotY))
      .multiply(new THREE.Matrix4().makeScale(fit.scale.x, fit.scale.y, fit.scale.z))
      .multiply(new THREE.Matrix4().makeTranslation(-mCenter.x, -mCenter.y, -mCenter.z));
    this.placements.push(m);
    this.fitted.push({ center: { x: centerXZ.x, y: bottomY + halfH, z: centerXZ.z }, aabb: maxAabb, fit, contained: true });
    return fit;
  }

  /** Builds one InstancedMesh per sub-mesh of the model (shares geometry + material with the cached original). */
  flush(game, castShadow = false) {
    const out = [];
    if (!this.placements.length) return out;
    this.root.updateMatrixWorld(true);
    const tmp = new THREE.Matrix4();
    this.root.traverse((o) => {
      if (!o.isMesh) return;
      const inst = new THREE.InstancedMesh(o.geometry, o.material, this.placements.length);
      for (let i = 0; i < this.placements.length; i++) {
        tmp.multiplyMatrices(this.placements[i], o.matrixWorld);
        inst.setMatrixAt(i, tmp);
      }
      inst.instanceMatrix.needsUpdate = true;
      inst.castShadow = castShadow;
      inst.receiveShadow = true;
      inst.frustumCulled = false;
      inst.userData.sharedWithAssetCache = true; // geometry/material belong to AssetManager: do not dispose on map change
      inst.updateMatrix();
      inst.matrixAutoUpdate = false;
      game.scene.add(inst);
      game.arenaDecorMeshes.push(inst);
      out.push(inst);
    });
    return out;
  }
}
