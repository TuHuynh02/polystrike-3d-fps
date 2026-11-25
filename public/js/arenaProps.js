// glTF props for the arena (visual only: collision boxes in shared/maps.js are never touched).
// Kenney crate models are placed ONLY when their bounding box fits the target AABB within a tolerance; otherwise the
// caller keeps the procedural box. Placements are batched into InstancedMeshes (one draw call per sub-mesh).
// Poly Haven 1K photogrammetry glTF props are loaded asynchronously ONLY in browser WebGL on Medium/High tiers.

import * as THREE from '../vendor/three/three.module.js';
import { ASSET_BASE, getAssetManager } from './assets.js';
import { isSoftwareWebGLRenderer } from './arena/shadowFilter.js';

export const CRATE_MODEL_NAMES = ['crate-wide', 'crate-medium', 'crate-small'];
export const POLYHAVEN_LEGACY_PROP_IDS = [
  'covered_car',
  'old_military_crate',
  'Barrel_02',
  'concrete_road_barrier_02',
  'cement_bag',
  'ammo_box'
];
export const POLYHAVEN_GLB_PROP_IDS = [
  'Barrel_01',
  'barrel_03',
  'exterior_aircon_unit',
  'street_lamp_01',
  'metal_trash_can',
  'trashbag',
  'water_manhole_cover',
  'wooden_crate_02',
  'cardboard_box_01',
  'portable_generator',
  'propane_tank',
  'metal_jerrycan_green',
  'utility_box_01',
  'utility_box_02',
  'security_light',
  'modular_industrial_pipes_01',
  'old_tyre',
  'rusted_wheel_rim_01'
];
export const POLYHAVEN_PROP_IDS = [
  ...POLYHAVEN_LEGACY_PROP_IDS,
  ...POLYHAVEN_GLB_PROP_IDS
];
const POLYHAVEN_GLB_PROP_SET = new Set(POLYHAVEN_GLB_PROP_IDS);
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

function stripStaticMorphTargets(obj) {
  if (!obj) return;
  if (obj.geometry?.morphAttributes && Object.keys(obj.geometry.morphAttributes).length) {
    obj.geometry.morphAttributes = {};
    obj.geometry.morphTargetsRelative = false;
  }
  delete obj.morphTargetInfluences;
  delete obj.morphTargetDictionary;
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
      stripStaticMorphTargets(o);
      const inst = new THREE.InstancedMesh(o.geometry, o.material, this.placements.length);
      stripStaticMorphTargets(inst);
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
    stripStaticMorphTargets(o);
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
 * Loads (and caches via AssetManager) a Poly Haven glTF/GLB prop:
 * - New WebP `.glb` props in `POLYHAVEN_GLB_PROP_IDS` load from `public/assets/models/polyhaven_glb/<id>.glb`.
 * - Legacy 1K `.gltf` props (`covered_car`, `old_military_crate`, `Barrel_02`, `concrete_road_barrier_02`, `cement_bag`, `ammo_box`)
 *   load from `public/assets/models/polyhaven/<id>/<id>_1k.gltf`.
 * Safely resolves to `null` in Node / non-WebGL2 environments or on asset errors.
 */
export async function loadPolyhavenProp(id, assets = null, { anisotropy = 4, maxTextureSize = 1024 } = {}) {
  if (!canLoadBrowserPolyhavenProps(null)) return null;
  const mgr = assets || getAssetManager();
  if (!mgr) return null;
  const relPath = POLYHAVEN_GLB_PROP_SET.has(id)
    ? `models/polyhaven_glb/${id}.glb`
    : `models/polyhaven/${id}/${id}_1k.gltf`;
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

/** Batches grounded Poly Haven glTF/GLB placements into minimal `InstancedMesh` draw calls per sub-mesh. */
export class PolyhavenInstancedBatcher {
  constructor(modelRoot, { filter = null, name = 'polyhaven' } = {}) {
    this.root = modelRoot;
    this.filter = filter;
    this.name = name;
    this.bounds = getFilteredModelBounds(modelRoot, filter);
    this.placements = [];
  }

  groundAt(x, groundY, z, { scale = 1, yaw = 0, pitch = 0, roll = 0, wallMounted = false } = {}) {
    if (!this.bounds) return false;
    const cx = (this.bounds.min.x + this.bounds.max.x) * 0.5;
    const cy = (this.bounds.min.y + this.bounds.max.y) * 0.5;
    const cz = (this.bounds.min.z + this.bounds.max.z) * 0.5;
    const minY = this.bounds.min.y;

    if (!pitch && !roll) {
      const m = new THREE.Matrix4()
        .makeTranslation(x, groundY, z)
        .multiply(new THREE.Matrix4().makeRotationY(yaw))
        .multiply(new THREE.Matrix4().makeScale(scale, scale, scale))
        .multiply(new THREE.Matrix4().makeTranslation(-cx, -minY, -cz));
      this.placements.push(m);
      return true;
    }

    const rotScale = new THREE.Matrix4()
      .makeRotationFromEuler(new THREE.Euler(pitch, yaw, roll, 'YXZ'))
      .multiply(new THREE.Matrix4().makeScale(scale, scale, scale))
      .multiply(new THREE.Matrix4().makeTranslation(-cx, -cy, -cz));

    const corner = new THREE.Vector3();
    let rotMinY = Infinity;
    const xs = [this.bounds.min.x, this.bounds.max.x];
    const ys = [this.bounds.min.y, this.bounds.max.y];
    const zs = [this.bounds.min.z, this.bounds.max.z];
    for (let ix = 0; ix < 2; ix++) {
      for (let iy = 0; iy < 2; iy++) {
        for (let iz = 0; iz < 2; iz++) {
          corner.set(xs[ix], ys[iy], zs[iz]).applyMatrix4(rotScale);
          if (corner.y < rotMinY) rotMinY = corner.y;
        }
      }
    }

    const baseOffsetY = wallMounted ? 0 : -rotMinY;
    const m = new THREE.Matrix4()
      .makeTranslation(x, groundY + baseOffsetY, z)
      .multiply(rotScale);
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
      stripStaticMorphTargets(o);
      const inst = new THREE.InstancedMesh(o.geometry, o.material, this.placements.length);
      stripStaticMorphTargets(inst);
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
    ],
    exterior_aircon_unit: [
      // Wall-mounted AC condenser units on Mid/Short-A/B-Tunnel archway & Long perimeter stucco walls
      { x: 13.30, y: 2.60, z: -7.0, scale: 1.0, yaw: -Math.PI / 2, wallMounted: true },
      { x: 15.70, y: 2.60, z: 7.0, scale: 1.0, yaw: Math.PI / 2, wallMounted: true },
      { x: -13.30, y: 2.60, z: 7.0, scale: 1.0, yaw: Math.PI / 2, wallMounted: true },
      { x: -15.70, y: 2.60, z: -7.0, scale: 1.0, yaw: -Math.PI / 2, wallMounted: true },
      { x: 37.80, y: 3.20, z: -22.5, scale: 1.0, yaw: -Math.PI / 2, wallMounted: true },
      { x: 37.80, y: 3.20, z: 22.5, scale: 1.0, yaw: -Math.PI / 2, wallMounted: true },
      { x: -37.80, y: 3.20, z: -22.5, scale: 1.0, yaw: Math.PI / 2, wallMounted: true }
    ],
    street_lamp_01: [
      // Moroccan street lamps framing Long A & West B-Tunnel perimeter walls (clear of spawns)
      { x: 37.4, y: 0, z: -7.5, scale: 1.0, yaw: -Math.PI / 2 },
      { x: 37.4, y: 0, z: 19.5, scale: 1.0, yaw: -Math.PI / 2 },
      { x: -37.4, y: 0, z: -20.5, scale: 1.0, yaw: Math.PI / 2 },
      { x: -37.4, y: 0, z: 7.5, scale: 1.0, yaw: Math.PI / 2 }
    ],
    water_manhole_cover: [
      // Flush street utility covers on Mid & Long A / B-Tunnel roads
      { x: 0, y: -0.01, z: -20.0, scale: 1.05, yaw: 0.2 },
      { x: 0, y: -0.01, z: 20.0, scale: 1.05, yaw: 1.1 },
      { x: 19.5, y: -0.01, z: -6.0, scale: 1.05, yaw: 0.5 },
      { x: -19.5, y: -0.01, z: 6.0, scale: 1.05, yaw: -0.4 }
    ],
    metal_trash_can: [
      // Street bins tucked flush in Mid Double Door outer alcoves
      { x: -8.3, y: 0, z: -18.3, scale: 0.96, yaw: Math.PI },
      { x: 8.3, y: 0, z: 18.3, scale: 0.96, yaw: 0 }
    ],
    trashbag: [
      { x: -7.3, y: 0, z: -18.35, scale: 1.0, yaw: 0.6 },
      { x: 7.3, y: 0, z: 18.35, scale: 1.0, yaw: 2.3 }
    ],
    wooden_crate_02: [
      { x: -16.1, y: 0, z: 10.4, scale: 1.0, yaw: 0.08 },
      { x: 16.1, y: 0, z: -10.4, scale: 1.0, yaw: -0.08 }
    ],
    cardboard_box_01: [
      { x: -16.0, y: 0, z: 9.2, scale: 1.05, yaw: 0.35 },
      { x: 16.0, y: 0, z: -9.2, scale: 1.05, yaw: -0.30 },
      { x: 2.2, y: 0, z: -24.7, scale: 1.05, yaw: 0.2 },
      { x: -2.2, y: 0, z: 24.7, scale: 1.05, yaw: -0.25 }
    ],
    utility_box_01: [
      { x: 15.73, y: 0, z: -4.5, scale: 1.0, yaw: Math.PI / 2 },
      { x: -15.73, y: 0, z: 4.5, scale: 1.0, yaw: -Math.PI / 2 },
      { x: -1.8, y: 0, z: 22.47, scale: 1.0, yaw: Math.PI }
    ],
    old_tyre: [
      // Leaning & flat tyres beside Long-A & B-Car vehicles
      { x: 35.1, y: 0, z: 3.8, scale: 1.0, yaw: 0.4, pitch: 0.25 },
      { x: 35.4, y: 0, z: 9.7, scale: 1.0, yaw: 1.1, pitch: Math.PI / 2 },
      { x: -35.1, y: 0, z: -3.8, scale: 1.0, yaw: 2.7, pitch: 0.25 },
      { x: -35.4, y: 0, z: -9.7, scale: 1.0, yaw: 0.8, pitch: Math.PI / 2 }
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
    ],
    exterior_aircon_unit: [
      // Wall-mounted AC units on Connector, Jungle & Palace exterior walls
      { x: 4.70, y: 2.65, z: 10.5, scale: 1.0, yaw: Math.PI / 2, wallMounted: true },
      { x: -5.70, y: 2.65, z: 10.5, scale: 1.0, yaw: -Math.PI / 2, wallMounted: true },
      { x: -7.30, y: 2.65, z: -13.5, scale: 1.0, yaw: Math.PI / 2, wallMounted: true },
      { x: 37.80, y: 3.20, z: 14.5, scale: 1.0, yaw: -Math.PI / 2, wallMounted: true }
    ],
    security_light: [
      // Floodlights on Palace, Ticket Booth & CT facades
      { x: 37.78, y: 3.4, z: 10.5, scale: 1.0, yaw: -Math.PI / 2, wallMounted: true },
      { x: 37.78, y: 3.4, z: 18.5, scale: 1.0, yaw: -Math.PI / 2, wallMounted: true },
      { x: 12.00, y: 2.45, z: -20.8, scale: 1.0, yaw: -Math.PI / 2, wallMounted: true },
      { x: -3.50, y: 2.65, z: -24.62, scale: 1.0, yaw: Math.PI, wallMounted: true },
      { x: 14.00, y: 3.4, z: -37.78, scale: 1.0, yaw: 0, wallMounted: true }
    ],
    street_lamp_01: [
      { x: -37.4, y: 0, z: -13.5, scale: 1.0, yaw: Math.PI / 2 },
      { x: -37.4, y: 0, z: 14.5, scale: 1.0, yaw: Math.PI / 2 },
      { x: 37.4, y: 0, z: -13.5, scale: 1.0, yaw: -Math.PI / 2 },
      { x: 37.4, y: 0, z: 7.5, scale: 1.0, yaw: -Math.PI / 2 }
    ],
    water_manhole_cover: [
      { x: -12.5, y: -0.01, z: -1.5, scale: 1.05, yaw: 0.3 },
      { x: -0.5, y: -0.01, z: 16.8, scale: 1.05, yaw: 1.2 },
      { x: 12.5, y: -0.01, z: 4.5, scale: 1.05, yaw: 0.7 },
      { x: 21.0, y: -0.01, z: -17.5, scale: 1.05, yaw: -0.4 }
    ],
    utility_box_02: [
      { x: 16.03, y: 0, z: -21.5, scale: 1.0, yaw: Math.PI / 2 },
      { x: 16.77, y: 0, z: 22.0, scale: 1.0, yaw: -Math.PI / 2 },
      { x: -9.73, y: 0, z: -13.5, scale: 1.0, yaw: -Math.PI / 2 }
    ],
    metal_trash_can: [
      { x: 5.08, y: 0, z: 21.0, scale: 0.96, yaw: -Math.PI / 2 },
      { x: -14.2, y: 0, z: 23.2, scale: 0.96, yaw: Math.PI }
    ],
    trashbag: [
      { x: 5.15, y: 0, z: 19.8, scale: 1.0, yaw: 0.4 },
      { x: -13.1, y: 0, z: 23.25, scale: 1.0, yaw: 1.9 }
    ],
    wooden_crate_02: [
      { x: 4.9, y: 0, z: 13.5, scale: 1.0, yaw: 0.05 },
      { x: 29.8, y: 2.4, z: 18.8, scale: 1.0, yaw: 1.57 }
    ],
    cardboard_box_01: [
      { x: 4.85, y: 0, z: 12.2, scale: 1.05, yaw: 0.3 },
      { x: 28.5, y: 2.4, z: 18.9, scale: 1.05, yaw: 0.4 }
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
      { x: -12.2, y: 0.22, z: 18.2, scale: 1.15, yaw: -0.10 },
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
    ],
    barrel_03: [
      // Authentic weathered Tuscan wine barrels clustered cleanly in Banana & B-Site Church Cloister
      { x: -15.8, y: 0, z: 9.0, scale: 1.0, yaw: 0.3 },
      { x: -14.7, y: 0, z: 9.0, scale: 0.98, yaw: 1.4 },
      { x: -15.25, y: 0, z: 9.95, scale: 1.02, yaw: 2.5 },
      { x: 14.3, y: 0, z: 9.0, scale: 1.0, yaw: 0.8 },
      { x: 15.4, y: 0, z: 9.0, scale: 0.98, yaw: 2.1 },
      { x: 25.4, y: 2.2, z: -18.5, scale: 1.0, yaw: 0.5 },
      { x: 25.4, y: 2.2, z: -19.5, scale: 0.98, yaw: 1.8 },
      { x: 24.4, y: 2.2, z: -19.0, scale: 1.02, yaw: 2.9 },
      { x: 7.3, y: 0, z: -16.1, scale: 1.0, yaw: 0.4 },
      { x: 8.3, y: 0, z: -16.1, scale: 0.96, yaw: 1.7 }
    ],
    street_lamp_01: [
      // Tuscan wrought-iron street lamps framing alleys & Banana entrances
      { x: -35.4, y: 0, z: -9.5, scale: 1.0, yaw: Math.PI / 2 },
      { x: 35.4, y: 0, z: -9.5, scale: 1.0, yaw: -Math.PI / 2 },
      { x: -18.5, y: 0, z: 7.5, scale: 1.0, yaw: Math.PI / 2 },
      { x: 18.5, y: 0, z: 7.5, scale: 1.0, yaw: -Math.PI / 2 }
    ],
    water_manhole_cover: [
      { x: 0, y: -0.01, z: -13.0, scale: 1.05, yaw: 0.1 },
      { x: 0, y: -0.01, z: 3.5, scale: 1.05, yaw: 0.9 },
      { x: 4.5, y: -0.01, z: 18.0, scale: 1.05, yaw: -0.3 },
      { x: -15.5, y: -0.01, z: -5.5, scale: 1.05, yaw: 0.5 }
    ],
    wooden_crate_02: [
      { x: -7.5, y: 0, z: -18.85, scale: 1.0, yaw: 1.57 },
      { x: 2.0, y: 0, z: 22.3, scale: 1.0, yaw: 1.57 }
    ],
    cardboard_box_01: [
      { x: -6.2, y: 0, z: -18.8, scale: 1.05, yaw: 0.3 },
      { x: 0.8, y: 0, z: 22.3, scale: 1.05, yaw: -0.2 }
    ],
    metal_trash_can: [
      { x: -9.5, y: 0, z: 6.05, scale: 0.96, yaw: Math.PI },
      { x: 9.5, y: 0, z: 6.05, scale: 0.96, yaw: Math.PI }
    ],
    trashbag: [
      { x: -8.5, y: 0, z: 6.1, scale: 1.0, yaw: 0.5 },
      { x: 8.5, y: 0, z: 6.1, scale: 1.0, yaw: 2.2 }
    ],
    exterior_aircon_unit: [
      { x: -12.5, y: 2.65, z: 8.70, scale: 1.0, yaw: 0, wallMounted: true },
      { x: 12.5, y: 2.65, z: 6.30, scale: 1.0, yaw: Math.PI, wallMounted: true },
      { x: -35.80, y: 3.20, z: 4.5, scale: 1.0, yaw: Math.PI / 2, wallMounted: true },
      { x: 35.80, y: 3.20, z: 4.5, scale: 1.0, yaw: -Math.PI / 2, wallMounted: true }
    ],
    old_tyre: [
      // Flanking Banana Car without overlapping car chassis or covered_car
      { x: -8.25, y: 0, z: 12.8, scale: 1.0, yaw: 0.4, pitch: 0.25 },
      { x: -8.20, y: 0, z: 15.9, scale: 1.0, yaw: 1.2, pitch: Math.PI / 2 },
      { x: -2.85, y: 0, z: 13.4, scale: 1.0, yaw: -0.3, pitch: 0.25 }
    ],
    rusted_wheel_rim_01: [
      { x: -8.35, y: 0, z: 14.4, scale: 1.05, yaw: 0.2, pitch: 0.30 },
      { x: -2.85, y: 0, z: 15.6, scale: 1.05, yaw: 0.9, pitch: Math.PI / 2 }
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
    ],
    portable_generator: [
      // Industrial backup generators in Outside Yard, Garage & Heaven Catwalk
      { x: -15.1, y: 0, z: -1.2, scale: 1.0, yaw: 1.57 },
      { x: -12.5, y: 0, z: -18.9, scale: 1.0, yaw: 0.15 },
      { x: 29.2, y: 2.4, z: -9.5, scale: 1.0, yaw: -1.57 }
    ],
    propane_tank: [
      { x: -15.3, y: 0, z: -0.25, scale: 1.05, yaw: 0.4 },
      { x: -15.3, y: 0, z: 0.25, scale: 1.05, yaw: 1.9 },
      { x: -13.6, y: 0, z: 15.1, scale: 1.05, yaw: 0.8 },
      { x: -13.6, y: 0, z: 15.6, scale: 1.05, yaw: 2.4 }
    ],
    metal_jerrycan_green: [
      { x: -14.5, y: 0, z: -1.65, scale: 1.05, yaw: 0.4 },
      { x: -11.7, y: 0, z: -19.0, scale: 1.05, yaw: -0.3 },
      { x: 15.4, y: 2.4, z: 16.2, scale: 1.05, yaw: 0.8 }
    ],
    utility_box_01: [
      { x: -4.27, y: 0, z: -7.2, scale: 1.0, yaw: Math.PI / 2 },
      { x: -2.0, y: 0, z: 22.37, scale: 1.0, yaw: Math.PI }
    ],
    utility_box_02: [
      { x: 9.5, y: 0, z: -23.13, scale: 1.0, yaw: Math.PI },
      { x: -37.77, y: 0, z: 8.0, scale: 1.0, yaw: Math.PI / 2 }
    ],
    security_light: [
      { x: -4.28, y: 3.1, z: -3.6, scale: 1.0, yaw: Math.PI / 2, wallMounted: true },
      { x: -4.28, y: 3.1, z: 3.6, scale: 1.0, yaw: Math.PI / 2, wallMounted: true },
      { x: 37.78, y: 3.4, z: -5.0, scale: 1.0, yaw: -Math.PI / 2, wallMounted: true },
      { x: 37.78, y: 3.4, z: 5.0, scale: 1.0, yaw: -Math.PI / 2, wallMounted: true },
      { x: -37.78, y: 3.4, z: -8.0, scale: 1.0, yaw: Math.PI / 2, wallMounted: true }
    ],
    modular_industrial_pipes_01: [
      // Heavy nuclear-plant pipe runs mounted cleanly along Garage, Red Container, CT Hell & Warehouse walls
      { x: -6.67, y: 1.0, z: -7.2, scale: 1.0, yaw: -Math.PI / 2, wallMounted: true },
      { x: -4.33, y: 1.0, z: 7.2, scale: 1.0, yaw: Math.PI / 2, wallMounted: true },
      { x: -19.37, y: 0.9, z: 2.0, scale: 1.0, yaw: -Math.PI / 2, wallMounted: true },
      { x: 9.5, y: 1.0, z: -20.93, scale: 1.0, yaw: 0, wallMounted: true },
      { x: -37.83, y: 1.2, z: 2.0, scale: 1.0, yaw: Math.PI / 2, wallMounted: true },
      { x: -37.83, y: 1.2, z: -18.0, scale: 1.0, yaw: Math.PI / 2, wallMounted: true }
    ],
    Barrel_01: [
      { x: -18.2, y: 0, z: -2.8, scale: 1.0, yaw: 0.5 },
      { x: -17.4, y: 0, z: -2.8, scale: 0.98, yaw: 1.9 },
      { x: 7.8, y: 0, z: -7.8, scale: 1.0, yaw: 0.3 },
      { x: 7.8, y: 0, z: -7.0, scale: 0.98, yaw: 2.1 },
      { x: 7.8, y: 0, z: 7.8, scale: 1.0, yaw: 1.2 }
    ],
    old_tyre: [
      { x: -19.7, y: 0, z: 0.4, scale: 1.0, yaw: 0.3, pitch: 0.25 },
      { x: -19.65, y: 0, z: 1.6, scale: 1.0, yaw: 0.9, pitch: Math.PI / 2 },
      { x: -9.4, y: 0, z: 13.6, scale: 1.0, yaw: 1.4, pitch: 0.25 }
    ],
    water_manhole_cover: [
      { x: -17.5, y: -0.01, z: -11.5, scale: 1.05, yaw: 0.1 },
      { x: -5.5, y: -0.01, z: 0.0, scale: 1.05, yaw: 0.8 },
      { x: 2.5, y: -0.01, z: -14.0, scale: 1.05, yaw: -0.3 },
      { x: 2.5, y: -0.01, z: 12.0, scale: 1.05, yaw: 0.4 }
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
    ],
    portable_generator: [
      // Symmetric arctic expedition generators tucked against outer perimeter walls (clear of spawns & mid lanes)
      { x: -31.3, y: 0, z: -2.8, scale: 1.0, yaw: Math.PI / 2 },
      { x: 31.3, y: 0, z: 2.8, scale: 1.0, yaw: -Math.PI / 2 },
      { x: -16.5, y: 0, z: -31.3, scale: 1.0, yaw: 0 },
      { x: 16.5, y: 0, z: 31.3, scale: 1.0, yaw: Math.PI }
    ],
    metal_jerrycan_green: [
      { x: -31.4, y: 0, z: -1.8, scale: 1.05, yaw: 0.4 },
      { x: 31.4, y: 0, z: 1.8, scale: 1.05, yaw: 2.7 },
      { x: -15.5, y: 0, z: -31.4, scale: 1.05, yaw: 0.2 },
      { x: 15.5, y: 0, z: 31.4, scale: 1.05, yaw: -2.9 }
    ],
    propane_tank: [
      { x: -31.4, y: 0, z: 2.8, scale: 1.05, yaw: 0.3 },
      { x: 31.4, y: 0, z: -2.8, scale: 1.05, yaw: 2.2 },
      { x: 16.5, y: 0, z: -31.4, scale: 1.05, yaw: 1.1 },
      { x: -16.5, y: 0, z: 31.4, scale: 1.05, yaw: -1.7 }
    ],
    wooden_crate_02: [
      // Expedition crates tucked on outer edges of the 4 snow-stone decks
      { x: 3.4, y: 2.0, z: -23.6, scale: 1.0, yaw: 1.57 },
      { x: -3.4, y: 2.0, z: 23.6, scale: 1.0, yaw: 1.57 },
      { x: -23.6, y: 2.0, z: -3.4, scale: 1.0, yaw: 0 },
      { x: 23.6, y: 2.0, z: 3.4, scale: 1.0, yaw: 0 }
    ],
    Barrel_01: [
      { x: -31.3, y: 0, z: 3.6, scale: 1.0, yaw: 0.5 },
      { x: 31.3, y: 0, z: -3.6, scale: 1.0, yaw: 2.4 },
      { x: 17.3, y: 0, z: -31.3, scale: 1.0, yaw: 1.4 },
      { x: -17.3, y: 0, z: 31.3, scale: 1.0, yaw: -1.2 }
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
    ],
    wooden_crate_02: [
      // Symmetric range crates on outer ends of West & East AWP elevated decks
      { x: -23.4, y: 2.0, z: 3.8, scale: 1.0, yaw: 0.06 },
      { x: 23.4, y: 2.0, z: -3.8, scale: 1.0, yaw: -0.06 }
    ],
    cardboard_box_01: [
      { x: -23.4, y: 2.0, z: 2.5, scale: 1.05, yaw: 0.35 },
      { x: 23.4, y: 2.0, z: -2.5, scale: 1.05, yaw: -0.35 }
    ],
    metal_jerrycan_green: [
      { x: -19.6, y: 0, z: -19.2, scale: 1.05, yaw: 0.3 },
      { x: 19.6, y: 0, z: -19.2, scale: 1.05, yaw: -0.3 },
      { x: -19.6, y: 0, z: 19.2, scale: 1.05, yaw: 2.8 },
      { x: 19.6, y: 0, z: 19.2, scale: 1.05, yaw: -2.8 }
    ],
    old_tyre: [
      { x: -19.6, y: 0, z: -16.6, scale: 1.0, yaw: 0.4, pitch: 0.25 },
      { x: 19.6, y: 0, z: -16.6, scale: 1.0, yaw: -0.4, pitch: 0.25 },
      { x: -19.6, y: 0, z: 16.6, scale: 1.0, yaw: 2.7, pitch: 0.25 },
      { x: 19.6, y: 0, z: 16.6, scale: 1.0, yaw: -2.7, pitch: 0.25 }
    ],
    utility_box_01: [
      { x: -29.77, y: 0, z: -2.5, scale: 1.0, yaw: Math.PI / 2 },
      { x: -29.77, y: 0, z: 2.5, scale: 1.0, yaw: Math.PI / 2 },
      { x: 29.77, y: 0, z: -2.5, scale: 1.0, yaw: -Math.PI / 2 },
      { x: 29.77, y: 0, z: 2.5, scale: 1.0, yaw: -Math.PI / 2 }
    ],
    security_light: [
      { x: -29.78, y: 3.2, z: -4.0, scale: 1.0, yaw: Math.PI / 2, wallMounted: true },
      { x: -29.78, y: 3.2, z: 4.0, scale: 1.0, yaw: Math.PI / 2, wallMounted: true },
      { x: 29.78, y: 3.2, z: -4.0, scale: 1.0, yaw: -Math.PI / 2, wallMounted: true },
      { x: 29.78, y: 3.2, z: 4.0, scale: 1.0, yaw: -Math.PI / 2, wallMounted: true }
    ]
  }
};

const hasMeshToken = (o, token) =>
  String(o?.name || '').includes(token) || String(o?.parent?.name || '').includes(token);

const POLYHAVEN_BATCH_SPECS = [
  { specKey: 'covered_car', modelId: 'covered_car', castsShadow: true },
  { specKey: 'concrete_road_barrier_02', modelId: 'concrete_road_barrier_02', castsShadow: true },
  { specKey: 'Barrel_02', modelId: 'Barrel_02', castsShadow: true },
  { specKey: 'Barrel_01', modelId: 'Barrel_01', castsShadow: true },
  { specKey: 'barrel_03', modelId: 'barrel_03', castsShadow: true },
  {
    specKey: 'old_military_crate_a',
    modelId: 'old_military_crate',
    filter: (o) => o.name.endsWith('_a'),
    name: 'old_military_crate_closed',
    castsShadow: true
  },
  {
    specKey: 'old_military_crate_b',
    modelId: 'old_military_crate',
    filter: (o) => o.name.endsWith('_b'),
    name: 'old_military_crate_open',
    castsShadow: true
  },
  { specKey: 'wooden_crate_02', modelId: 'wooden_crate_02', castsShadow: true },
  { specKey: 'street_lamp_01', modelId: 'street_lamp_01', castsShadow: true },
  {
    specKey: 'metal_trash_can',
    modelId: 'metal_trash_can',
    filter: (o) => !hasMeshToken(o, 'rust'),
    name: 'metal_trash_can',
    castsShadow: true
  },
  { specKey: 'portable_generator', modelId: 'portable_generator', castsShadow: true },
  { specKey: 'propane_tank', modelId: 'propane_tank', castsShadow: true },
  {
    specKey: 'exterior_aircon_unit',
    modelId: 'exterior_aircon_unit',
    filter: (o) => !hasMeshToken(o, 'rusted'),
    name: 'exterior_aircon_unit',
    castsShadow: true
  },
  { specKey: 'utility_box_01', modelId: 'utility_box_01', castsShadow: true },
  { specKey: 'utility_box_02', modelId: 'utility_box_02', castsShadow: true },
  { specKey: 'modular_industrial_pipes_01', modelId: 'modular_industrial_pipes_01', castsShadow: true },
  { specKey: 'water_manhole_cover', modelId: 'water_manhole_cover', castsShadow: false },
  { specKey: 'cement_bag', modelId: 'cement_bag', castsShadow: false },
  { specKey: 'ammo_box', modelId: 'ammo_box', castsShadow: false },
  { specKey: 'trashbag', modelId: 'trashbag', castsShadow: false },
  { specKey: 'cardboard_box_01', modelId: 'cardboard_box_01', castsShadow: false },
  { specKey: 'old_tyre', modelId: 'old_tyre', castsShadow: false },
  { specKey: 'rusted_wheel_rim_01', modelId: 'rusted_wheel_rim_01', castsShadow: false },
  { specKey: 'metal_jerrycan_green', modelId: 'metal_jerrycan_green', castsShadow: false },
  { specKey: 'security_light', modelId: 'security_light', castsShadow: false }
];

function requiredPropIdsForSpec(spec) {
  if (!spec) return [];
  const ids = new Set();
  for (let i = 0; i < POLYHAVEN_BATCH_SPECS.length; i++) {
    const entry = POLYHAVEN_BATCH_SPECS[i];
    if (spec[entry.specKey]?.length) {
      ids.add(entry.modelId);
    }
  }
  return Array.from(ids);
}

/**
 * Asynchronously loads and places curated Poly Haven glTF/GLB props across all 6 CS:GO Wingman/Retake maps
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
      batch.groundAt(p.x, p.y, p.z, {
        scale: p.scale,
        yaw: p.yaw,
        pitch: p.pitch,
        roll: p.roll,
        wallMounted: p.wallMounted
      });
    }
    placedMeshes.push(...batch.flush(game, { castShadow: shadow, receiveShadow: true }));
  };

  for (let i = 0; i < POLYHAVEN_BATCH_SPECS.length; i++) {
    const entry = POLYHAVEN_BATCH_SPECS[i];
    spawnBatch(entry.modelId, spec[entry.specKey], {
      filter: entry.filter || null,
      name: entry.name || entry.specKey,
      shadow: entry.castsShadow ? castShadow : false
    });
  }

  if (placedMeshes.length && game.renderer?.shadowMap) {
    game.renderer.shadowMap.needsUpdate = true;
  }
  return placedMeshes;
}
