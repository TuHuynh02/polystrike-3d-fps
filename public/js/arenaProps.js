// glTF props for the arena (visual only: collision boxes in shared/maps.js are never touched).
// Kenney crate models are placed ONLY when their bounding box fits the target AABB within a tolerance; otherwise the
// caller keeps the procedural box. Placements are batched into InstancedMeshes (one draw call per sub-mesh).
// Poly Haven 1K photogrammetry glTF props are loaded asynchronously ONLY in browser WebGL on Medium/High tiers.

import * as THREE from '../vendor/three/three.module.js';
import { ASSET_BASE, getAssetManager } from './assets.js';
import { isSoftwareWebGLRenderer } from './arena/shadowFilter.js';

export const CRATE_MODEL_NAMES = ['crate-wide', 'crate-medium', 'crate-small'];
export const POLYHAVEN_PROP_IDS = [
  'covered_car',
  'old_military_crate',
  'Barrel_02',
  'concrete_road_barrier_02',
  'cement_bag',
  'ammo_box'
];
export const DEFAULT_FIT_TOLERANCE = 1.6; // max(scale)/min(scale) allowed before the model would look squashed
export const PROP_OVERRIDES_STORAGE_KEY = 'polystrike.glbProps';

/**
 * Explicit opt-in gate for external glTF prop overrides (`?glbProps=1` or `localStorage.getItem('polystrike.glbProps') === '1'`).
 * Default gameplay returns false across all tiers so Kenney cartoon `.glb` crates never overwrite Saltline 3D cargo props.
 */
export function isPropOverrideEnabled(
  search = typeof window !== 'undefined' ? window.location?.search || '' : '',
  storage = typeof localStorage !== 'undefined' ? localStorage : null
) {
  try {
    const params = new URLSearchParams(search || '');
    const q = params.get('glbProps');
    if (q === '1' || q === 'true') return true;
    if (q === '0' || q === 'false') return false;
  } catch {
    // ignore malformed query strings
  }
  try {
    return storage?.getItem?.(PROP_OVERRIDES_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

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

/** Browser WebGL + tier gate so Node headless tests and Low tier never fetch or spawn Poly Haven glTFs. */
export function canLoadBrowserPolyhavenProps(game = null) {
  if (
    typeof window === 'undefined' ||
    typeof document === 'undefined' ||
    typeof WebGL2RenderingContext === 'undefined'
  ) {
    return false;
  }
  if (!game) return true;
  return Boolean(
    game.renderer?.isWebGLRenderer &&
      !game.renderer.__fakeGL &&
      game.assetsEnabled !== false &&
      (game.quality?.envMapSize ?? 512) > 0
  );
}

function downscaleTextureInPlace(tex, maxTextureSize) {
  if (!tex || !(maxTextureSize > 0) || maxTextureSize >= 1024 || typeof document === 'undefined') return false;
  const img = tex.image;
  if (!img) return false;
  const w = img.naturalWidth || img.width || 0;
  const h = img.naturalHeight || img.height || 0;
  if (!w || !h || (w <= maxTextureSize && h <= maxTextureSize)) return false;
  try {
    const scale = maxTextureSize / Math.max(w, h);
    const nw = Math.max(1, Math.round(w * scale));
    const nh = Math.max(1, Math.round(h * scale));
    const canvas = document.createElement('canvas');
    canvas.width = nw;
    canvas.height = nh;
    const ctx = canvas.getContext?.('2d');
    if (!ctx || typeof ctx.drawImage !== 'function') return false;
    ctx.drawImage(img, 0, 0, nw, nh);
    if (typeof img.close === 'function') {
      try {
        img.close();
      } catch {
        /* ignore ImageBitmap close errors */
      }
    }
    tex.image = canvas;
    tex.needsUpdate = true;
    return true;
  } catch {
    return false;
  }
}

/** Applies anisotropic filtering, shared-cache tagging, and optional VRAM downscaling onto a cached Poly Haven glTF scene. */
export function preparePolyhavenGltf(
  gltf,
  anisotropy = 4,
  maxAnisotropy = 8,
  { maxTextureSize = 1024 } = {}
) {
  if (!gltf?.scene) return;
  const clamped = Math.max(1, Math.min(Number(anisotropy) || 4, Number(maxAnisotropy) || 8));
  const targetMaxTex = Math.max(64, Number(maxTextureSize) || 1024);
  const prepKey = `${clamped}|${targetMaxTex}`;
  if (gltf.userData?.__polyhavenPrepared === prepKey) return;

  const seenTextures = new Set();
  gltf.scene.traverse((o) => {
    if (!o.isMesh) return;
    if (o.geometry) {
      o.geometry.userData = { ...(o.geometry.userData || {}), shared: true };
    }
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of mats) {
      if (!m) continue;
      m.userData = { ...(m.userData || {}), shared: true };
      if ('envMapIntensity' in m) m.envMapIntensity = 0.9;
      for (const tex of [m.map, m.normalMap, m.roughnessMap, m.metalnessMap, m.aoMap, m.emissiveMap, m.bumpMap]) {
        if (!tex || seenTextures.has(tex)) continue;
        seenTextures.add(tex);
        tex.userData = { ...(tex.userData || {}), shared: true };
        tex.anisotropy = clamped;
        if (targetMaxTex < 1024) {
          downscaleTextureInPlace(tex, targetMaxTex);
        }
        tex.needsUpdate = true;
      }
      if (m.map && 'colorSpace' in m.map && THREE.SRGBColorSpace) {
        m.map.colorSpace = THREE.SRGBColorSpace;
      }
    }
  });
  gltf.userData = { ...(gltf.userData || {}), __polyhavenPrepared: prepKey };
}

/**
 * Loads (and caches via AssetManager) a Poly Haven 1K `.gltf` prop under `public/assets/models/polyhaven/<id>/`.
 * Safely resolves to `null` in Node / non-WebGL2 environments or on asset errors.
 */
export async function loadPolyhavenProp(id, assets = null, { anisotropy = 4, maxTextureSize = 1024 } = {}) {
  if (!canLoadBrowserPolyhavenProps(null)) return null;
  const mgr = assets || getAssetManager();
  if (!mgr) return null;
  const relPath = `models/polyhaven/${id}/${id}_1k.gltf`;
  try {
    let gltf = null;
    if (typeof mgr.loadAssetGltf === 'function') {
      gltf = await mgr.loadAssetGltf(relPath);
    } else if (typeof mgr._getLoader === 'function') {
      const cacheKey = `gltf:${relPath}`;
      if (mgr.models?.has(cacheKey)) {
        gltf = await mgr.models.get(cacheKey);
      } else {
        const p = (async () => {
          try {
            const loader = await mgr._getLoader();
            const res = await loader.loadAsync(`${ASSET_BASE}${relPath}`);
            if (!res?.scene) return null;
            mgr.loadedModels?.set(cacheKey, res);
            return res;
          } catch {
            return null;
          }
        })();
        mgr.models?.set(cacheKey, p);
        gltf = await p;
      }
    }
    if (!gltf?.scene) return null;
    preparePolyhavenGltf(gltf, anisotropy, mgr.maxAnisotropy || 8, { maxTextureSize });
    return gltf;
  } catch {
    return null;
  }
}

/** Computes exact world-space bounding box of `root` (optionally filtered to matching sub-meshes). */
export function getFilteredModelBounds(root, filter = null) {
  if (!root) return null;
  root.updateMatrixWorld(true);
  const box = new THREE.Box3();
  const subBox = new THREE.Box3();
  root.traverse((o) => {
    if (!o.isMesh || !o.geometry) return;
    if (filter && !filter(o)) return;
    if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
    if (!o.geometry.boundingBox) return;
    subBox.copy(o.geometry.boundingBox).applyMatrix4(o.matrixWorld);
    box.union(subBox);
  });
  return box.isEmpty() ? null : box;
}

/**
 * Clones a Poly Haven glTF scene inside a wrapper `THREE.Group` grounded flush at `groundY` (`-minY * scale`),
 * sharing geometry/materials/textures cleanly with the AssetManager cache (safe for `disposeMapResources()`).
 */
export function clonePolyhavenProp(
  gltf,
  {
    x = 0,
    groundY = 0,
    z = 0,
    scale = 1,
    yaw = 0,
    castShadow = false,
    receiveShadow = true,
    anisotropy = 4,
    maxTextureSize = 1024
  } = {}
) {
  if (!gltf?.scene) return null;
  preparePolyhavenGltf(gltf, anisotropy, 8, { maxTextureSize });
  const bounds = getModelBounds(gltf.scene);
  if (!bounds) return null;
  const center = bounds.getCenter(new THREE.Vector3());
  const minY = bounds.min.y;

  const clone = gltf.scene.clone(true);
  clone.scale.setScalar(scale);
  clone.position.set(-center.x * scale, -minY * scale, -center.z * scale);
  clone.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = Boolean(castShadow);
    o.receiveShadow = Boolean(receiveShadow);
  });

  const wrapper = new THREE.Group();
  wrapper.position.set(x, groundY, z);
  wrapper.rotation.y = yaw;
  wrapper.add(clone);
  wrapper.userData.sharedWithAssetCache = true;
  return wrapper;
}

/** Batches grounded Poly Haven glTF placements into minimal `InstancedMesh` draw calls per sub-mesh. */
export class PolyhavenInstancedBatcher {
  constructor(modelRoot, { filter = null, name = 'polyhaven' } = {}) {
    this.root = modelRoot;
    this.filter = filter;
    this.name = name;
    this.bounds = getFilteredModelBounds(modelRoot, filter);
    this.placements = [];
  }

  groundAt(x, groundY, z, { scale = 1, yaw = 0 } = {}) {
    if (!this.bounds) return false;
    const cx = (this.bounds.min.x + this.bounds.max.x) * 0.5;
    const cz = (this.bounds.min.z + this.bounds.max.z) * 0.5;
    const minY = this.bounds.min.y;
    const m = new THREE.Matrix4()
      .makeTranslation(x, groundY, z)
      .multiply(new THREE.Matrix4().makeRotationY(yaw))
      .multiply(new THREE.Matrix4().makeScale(scale, scale, scale))
      .multiply(new THREE.Matrix4().makeTranslation(-cx, -minY, -cz));
    this.placements.push(m);
    return true;
  }

  flush(game, { castShadow = false, receiveShadow = true } = {}) {
    const out = [];
    if (!this.placements.length || !this.root || !game?.scene) return out;
    this.root.updateMatrixWorld(true);
    const tmp = new THREE.Matrix4();
    this.root.traverse((o) => {
      if (!o.isMesh || !o.geometry) return;
      if (this.filter && !this.filter(o)) return;
      const inst = new THREE.InstancedMesh(o.geometry, o.material, this.placements.length);
      for (let i = 0; i < this.placements.length; i++) {
        tmp.multiplyMatrices(this.placements[i], o.matrixWorld);
        inst.setMatrixAt(i, tmp);
      }
      inst.instanceMatrix.needsUpdate = true;
      inst.castShadow = Boolean(castShadow);
      inst.receiveShadow = Boolean(receiveShadow);
      inst.frustumCulled = false;
      inst.userData.sharedWithAssetCache = true;
      inst.name = `polyhaven_${this.name}`;
      inst.updateMatrix();
      inst.matrixAutoUpdate = false;
      game.scene.add(inst);
      game.arenaDecorMeshes.push(inst);
      out.push(inst);
    });
    return out;
  }
}

const PROP_MAP_ALIASES = {
  desert_outpost: 'de_dust2',
  arena_duel: 'aim_map'
};

export const MAP_POLYHAVEN_PLACEMENTS = {
  de_dust2: {
    covered_car: [
      // Iconic Dust II Long-A & B-Car landmarks tucked flush against outer walls (clear of spawns & corridors)
      { x: 36.2, y: 0, z: 6.8, scale: 0.96, yaw: 0.06 },
      { x: -36.2, y: 0, z: -6.8, scale: 0.96, yaw: Math.PI - 0.06 }
    ],
    concrete_road_barrier_02: [
      // Jersey barriers flanking North & South Mid Sniper Shields
      { x: -3.65, y: 0, z: -23.4, scale: 0.96, yaw: 0.10 },
      { x: 3.65, y: 0, z: 23.4, scale: 0.96, yaw: Math.PI + 0.10 }
    ],
    Barrel_02: [
      // Tucked flush against Mid Door outer flanks & A-Goose / B-Site platform corners
      { x: -10.1, y: 0, z: -17.2, scale: 1.0, yaw: 0.4 },
      { x: 10.1, y: 0, z: 17.2, scale: 1.0, yaw: 2.1 },
      { x: 28.4, y: 2.4, z: -26.4, scale: 0.98, yaw: 0.5 },
      { x: -28.4, y: 2.4, z: -26.4, scale: 0.98, yaw: 2.4 }
    ],
    old_military_crate_a: [
      // Closed ordnance crates crowning Mid crates & A-Goose cover crate
      { x: -9.5, y: 2.0, z: -10.5, scale: 1.2, yaw: 0.25 },
      { x: 9.5, y: 2.0, z: 10.5, scale: 1.2, yaw: -0.35 },
      { x: 22.0, y: 3.7, z: -20.0, scale: 1.15, yaw: 0.12 }
    ],
    old_military_crate_b: [
      // Open cloth-lined military crate on SW B-Car platform crate
      { x: -22.0, y: 3.7, z: 20.0, scale: 1.15, yaw: 3.0 }
    ],
    cement_bag: [
      // Stacked cement bags on A-Goose, B-Site, and Short A Catwalk ledges
      { x: 20.8, y: 2.4, z: -26.2, scale: 1.15, yaw: 0.2 },
      { x: -20.8, y: 2.4, z: -26.2, scale: 1.15, yaw: -0.25 },
      { x: -5.2, y: 2.4, z: 0.0, scale: 1.1, yaw: 1.48 },
      { x: 5.2, y: 2.4, z: 0.0, scale: 1.1, yaw: -1.48 }
    ],
    ammo_box: [
      { x: -4.4, y: 3.6, z: 4.4, scale: 1.4, yaw: 0.15 },
      { x: 4.4, y: 3.6, z: -4.4, scale: 1.4, yaw: -0.2 }
    ]
  },
  de_mirage: {
    concrete_road_barrier_02: [
      // Concrete roadblocks flanking CT Spawn & T-Mid cover walls
      { x: -7.4, y: 0, z: -23.5, scale: 0.96, yaw: 0.08 },
      { x: -7.8, y: 0, z: 24.5, scale: 0.96, yaw: Math.PI - 0.10 }
    ],
    Barrel_02: [
      // Tucked beside CT Ticket Booth, A-Ramp outer wall & Mid Box
      { x: 16.3, y: 0, z: -24.6, scale: 1.0, yaw: 0.6 },
      { x: 16.3, y: 0, z: -23.8, scale: 0.96, yaw: 2.1 },
      { x: 19.6, y: 0, z: 25.8, scale: 1.0, yaw: 1.3 },
      { x: -18.2, y: 0, z: 4.4, scale: 1.0, yaw: 2.8 }
    ],
    old_military_crate_a: [
      // Ordnance crates crowning A-Site Triple Box, Firebox & Mid Box
      { x: 14.5, y: 2.7, z: -4.5, scale: 1.2, yaw: 0.2 },
      { x: 22.0, y: 2.2, z: -11.5, scale: 1.2, yaw: -0.4 },
      { x: -16.5, y: 2.2, z: 3.5, scale: 1.25, yaw: 0.6 }
    ],
    old_military_crate_b: [
      // Open cloth-lined military crate on A-Site Default Box
      { x: 17.5, y: 1.8, z: 2.5, scale: 1.15, yaw: 2.5 }
    ],
    cement_bag: [
      // Cement bags on Palace Balcony, A-Stairs, Mid Window & Short Catwalk corners
      { x: 30.8, y: 2.4, z: 10.2, scale: 1.15, yaw: 0.3 },
      { x: -3.8, y: 2.4, z: -7.5, scale: 1.15, yaw: 1.4 },
      { x: -27.2, y: 2.4, z: -18.8, scale: 1.15, yaw: -0.2 },
      { x: -29.8, y: 2.4, z: 10.2, scale: 1.15, yaw: 0.5 }
    ],
    ammo_box: [
      { x: 11.4, y: 1.1, z: -22.5, scale: 1.4, yaw: 0.4 },
      { x: 16.7, y: 1.5, z: -4.5, scale: 1.4, yaw: -0.6 }
    ]
  },
  de_inferno: {
    covered_car: [
      // Iconic Inferno Banana Car parked cleanly beside Banana Car cover without overlapping chassis AABB
      { x: -6.85, y: 0, z: 14.4, scale: 0.95, yaw: 0.05 }
    ],
    Barrel_02: [
      // Tuscan utility/wine barrels flanking New Box, First Oranges, Church Archway & Half-Wall
      { x: -13.3, y: 0, z: -8.2, scale: 1.0, yaw: 0.3 },
      { x: -13.3, y: 0, z: -7.4, scale: 0.96, yaw: 1.9 },
      { x: 13.7, y: 0, z: -8.0, scale: 1.0, yaw: 0.8 },
      { x: 9.4, y: 0, z: -17.2, scale: 1.0, yaw: 2.2 },
      { x: 5.2, y: 0, z: 12.6, scale: 0.98, yaw: 1.4 }
    ],
    cement_bag: [
      // Stacked sandbag/cement sacks at Banana Sandbags & B-Site Coffins / Church Cloister
      { x: -12.2, y: 0, z: 18.2, scale: 1.2, yaw: 0.15 },
      { x: -12.2, y: 0.20, z: 18.2, scale: 1.15, yaw: -0.10 },
      { x: -25.4, y: 2.2, z: -24.0, scale: 1.15, yaw: 0.25 },
      { x: 25.4, y: 2.2, z: -24.0, scale: 1.15, yaw: -0.3 }
    ],
    old_military_crate_a: [
      // Ordnance crates crowning B-Site New Box & First Oranges
      { x: -11.5, y: 2.4, z: -7.5, scale: 1.2, yaw: 0.22 },
      { x: 12.0, y: 2.3, z: -7.5, scale: 1.2, yaw: -0.30 }
    ],
    ammo_box: [
      { x: -17.8, y: 3.4, z: -17.8, scale: 1.4, yaw: 0.5 },
      { x: 11.5, y: 1.36, z: 19.5, scale: 1.4, yaw: -0.15 }
    ]
  },
  de_nuke: {
    concrete_road_barrier_02: [
      // Industrial Cedar Creek security barriers in Outside Yard & CT Hell
      { x: -17.5, y: 0, z: 7.0, scale: 1.0, yaw: 0.08 },
      { x: -14.8, y: 0, z: -20.5, scale: 0.98, yaw: 0.05 },
      { x: 14.8, y: 0, z: -22.0, scale: 0.98, yaw: Math.PI - 0.06 }
    ],
    Barrel_02: [
      // Industrial steel facility drums beside Outside Red Container, Blue Box, Main Garage & A Reactor
      { x: -19.8, y: 0, z: 5.4, scale: 1.04, yaw: 0.4 },
      { x: -19.8, y: 0, z: 4.6, scale: 1.0, yaw: 2.1 },
      { x: -9.3, y: 0, z: 15.2, scale: 1.02, yaw: 1.1 },
      { x: -3.9, y: 0, z: -11.2, scale: 1.02, yaw: 2.7 },
      { x: 13.3, y: 0, z: -7.2, scale: 1.02, yaw: 0.9 }
    ],
    old_military_crate_a: [
      // Equipment crates atop Outside Blue Box, Secret Deck crate & Heaven Catwalk rear
      { x: -11.5, y: 2.4, z: 14.5, scale: 1.25, yaw: 0.18 },
      { x: -22.5, y: 3.6, z: -16.5, scale: 1.15, yaw: -0.12 },
      { x: 29.2, y: 2.4, z: 8.5, scale: 1.2, yaw: 1.48 }
    ],
    old_military_crate_b: [
      // Open supply crate on A-Site Hut rear corner
      { x: 15.2, y: 2.4, z: 21.8, scale: 1.15, yaw: 2.6 }
    ],
    ammo_box: [
      { x: 23.1, y: 3.6, z: -5.5, scale: 1.4, yaw: 1.57 },
      { x: 23.1, y: 3.6, z: 5.5, scale: 1.4, yaw: -1.57 }
    ]
  },
  fy_iceworld: {
    old_military_crate_a: [
      // Symmetric alpine ordnance crates atop the 4 corner supply boost boxes
      { x: -18.5, y: 2.0, z: -18.5, scale: 1.2, yaw: 0.35 },
      { x: 18.5, y: 2.0, z: -18.5, scale: 1.2, yaw: -0.35 },
      { x: -18.5, y: 2.0, z: 18.5, scale: 1.2, yaw: -0.35 },
      { x: 18.5, y: 2.0, z: 18.5, scale: 1.2, yaw: 0.35 }
    ],
    ammo_box: [
      // Symmetric arctic ammo boxes crowning the 4 frost divider walls
      { x: 0, y: 1.9, z: -14.5, scale: 1.45, yaw: 0.1 },
      { x: 0, y: 1.9, z: 14.5, scale: 1.45, yaw: Math.PI + 0.1 },
      { x: -14.5, y: 1.9, z: 0, scale: 1.45, yaw: Math.PI * 0.5 },
      { x: 14.5, y: 1.9, z: 0, scale: 1.45, yaw: -Math.PI * 0.5 }
    ],
    Barrel_02: [
      // Expedition fuel drums tucked into outer corners of the 4 snow-stone decks
      { x: -4.2, y: 2.0, z: -23.8, scale: 0.96, yaw: 0.5 },
      { x: 4.2, y: 2.0, z: 23.8, scale: 0.96, yaw: 2.1 },
      { x: -23.8, y: 2.0, z: 4.2, scale: 0.96, yaw: 1.2 },
      { x: 23.8, y: 2.0, z: -4.2, scale: 0.96, yaw: 2.8 }
    ]
  },
  aim_map: {
    old_military_crate_a: [
      // Symmetric tactical rifle-range ordnance crates crowning the 4 boost pairs
      { x: -13.5, y: 2.0, z: -8.0, scale: 1.2, yaw: 0.25 },
      { x: 13.5, y: 2.0, z: -8.0, scale: 1.2, yaw: -0.25 },
      { x: -13.5, y: 2.0, z: 8.0, scale: 1.2, yaw: -0.25 },
      { x: 13.5, y: 2.0, z: 8.0, scale: 1.2, yaw: 0.25 }
    ],
    old_military_crate_b: [
      // Open supply crates on outer corners of West & East AWP elevated decks
      { x: -23.2, y: 2.0, z: -4.0, scale: 1.12, yaw: 1.55 },
      { x: 23.2, y: 2.0, z: 4.0, scale: 1.12, yaw: -1.55 }
    ],
    ammo_box: [
      // Symmetric ammo boxes tucked onto outer ends of head-glitch rifle crates
      { x: -5.6, y: 1.32, z: -17.5, scale: 1.35, yaw: 0.15 },
      { x: 5.6, y: 1.32, z: -17.5, scale: 1.35, yaw: -0.15 },
      { x: -5.6, y: 1.32, z: 17.5, scale: 1.35, yaw: -0.15 },
      { x: 5.6, y: 1.32, z: 17.5, scale: 1.35, yaw: 0.15 }
    ],
    Barrel_02: [
      // Range drums tucked cleanly outside the 4 AWP flank containers
      { x: -19.6, y: 0, z: -18.0, scale: 0.98, yaw: 0.4 },
      { x: 19.6, y: 0, z: -18.0, scale: 0.98, yaw: 2.3 },
      { x: -19.6, y: 0, z: 18.0, scale: 0.98, yaw: 1.5 },
      { x: 19.6, y: 0, z: 18.0, scale: 0.98, yaw: 2.9 }
    ]
  }
};

function requiredPropIdsForSpec(spec) {
  if (!spec) return [];
  const ids = [];
  if (spec.covered_car?.length) ids.push('covered_car');
  if (spec.concrete_road_barrier_02?.length) ids.push('concrete_road_barrier_02');
  if (spec.Barrel_02?.length) ids.push('Barrel_02');
  if (spec.old_military_crate_a?.length || spec.old_military_crate_b?.length) ids.push('old_military_crate');
  if (spec.cement_bag?.length) ids.push('cement_bag');
  if (spec.ammo_box?.length) ids.push('ammo_box');
  return ids;
}

/**
 * Asynchronously loads and places curated Poly Haven 1K glTF props across all 6 CS:GO Wingman/Retake maps
 * strictly in browser WebGL on Medium/High tiers, with software-WebGL 512px caps and map-switch staleness guards.
 */
export async function placeMapPolyhavenProps(game, mapCfg, buildSeq) {
  if (!canLoadBrowserPolyhavenProps(game)) return [];
  const rawMapId = mapCfg?.id;
  const canonicalMapId = typeof rawMapId === 'string' ? (PROP_MAP_ALIASES[rawMapId] || rawMapId) : null;
  const spec = canonicalMapId ? MAP_POLYHAVEN_PLACEMENTS[canonicalMapId] : null;
  if (!spec) return [];

  const ids = requiredPropIdsForSpec(spec);
  if (!ids.length) return [];

  const anisotropy = game?.quality?.anisotropy || 4;
  const castShadow = (game?.quality?.shadowMapSize || 0) > 0;
  const maxTextureSize = isSoftwareWebGLRenderer(game?.renderer) ? 512 : 1024;

  const loaded = new Map();
  await Promise.all(
    ids.map(async (id) => {
      const gltf = await loadPolyhavenProp(id, game.assets, { anisotropy, maxTextureSize });
      if (gltf?.scene) loaded.set(id, gltf);
    })
  );

  // Abort cleanly if the user switched maps, changed quality, or disposed arena resources mid-fetch
  if (
    game._arenaBuildSeq !== buildSeq ||
    game.currentMapId !== rawMapId ||
    !game.worldMeshes?.length ||
    !canLoadBrowserPolyhavenProps(game)
  ) {
    return [];
  }

  const placedMeshes = [];

  const spawnBatch = (id, list, { filter = null, name = id, shadow = castShadow } = {}) => {
    const gltf = loaded.get(id);
    if (!gltf?.scene || !list?.length) return;
    const batch = new PolyhavenInstancedBatcher(gltf.scene, { filter, name });
    for (let i = 0; i < list.length; i++) {
      const p = list[i];
      batch.groundAt(p.x, p.y, p.z, { scale: p.scale, yaw: p.yaw });
    }
    placedMeshes.push(...batch.flush(game, { castShadow: shadow, receiveShadow: true }));
  };

  spawnBatch('covered_car', spec.covered_car, { shadow: castShadow });
  spawnBatch('concrete_road_barrier_02', spec.concrete_road_barrier_02, { shadow: castShadow });
  spawnBatch('Barrel_02', spec.Barrel_02, { shadow: false });
  spawnBatch('old_military_crate', spec.old_military_crate_a, {
    filter: (o) => o.name.endsWith('_a'),
    name: 'old_military_crate_closed',
    shadow: false
  });
  spawnBatch('old_military_crate', spec.old_military_crate_b, {
    filter: (o) => o.name.endsWith('_b'),
    name: 'old_military_crate_open',
    shadow: false
  });
  spawnBatch('cement_bag', spec.cement_bag, { shadow: false });
  spawnBatch('ammo_box', spec.ammo_box, { shadow: false });

  if (placedMeshes.length && game.renderer?.shadowMap) {
    game.renderer.shadowMap.needsUpdate = true;
  }
  return placedMeshes;
}
