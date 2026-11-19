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

const DUST2_PROP_PLACEMENTS = {
  covered_car: [
    // Iconic Dust II Car landmarks parked safely inside side alcoves (clear of spawns & corridors)
    { x: 59.4, y: 0, z: 14.0, scale: 1.0, yaw: 0.08 },
    { x: -59.4, y: 0, z: -14.0, scale: 1.0, yaw: Math.PI - 0.08 }
  ],
  concrete_road_barrier_02: [
    // Jersey barriers flanking North & South Mid Sniper Shields
    { x: -4.25, y: 0, z: -27.2, scale: 1.0, yaw: 0.08 },
    { x: 4.25, y: 0, z: 27.2, scale: 1.0, yaw: Math.PI + 0.08 }
  ],
  Barrel_02: [
    // Tucked flush against Mid & bombsite corners (clear of explosive barrels)
    { x: -11.2, y: 0, z: -23.3, scale: 1.05, yaw: 0.4 },
    { x: 11.2, y: 0, z: 23.3, scale: 1.05, yaw: 2.1 },
    { x: 40.2, y: 2.4, z: -38.2, scale: 1.0, yaw: 0.3 },
    { x: -40.2, y: 2.4, z: -38.2, scale: 1.0, yaw: 2.5 }
  ],
  old_military_crate_a: [
    // Closed ordnance crates crowning tactical Dust II crates
    { x: -12.0, y: 2.0, z: -14.0, scale: 1.25, yaw: 0.25 },
    { x: 12.0, y: 2.0, z: 14.0, scale: 1.25, yaw: -0.35 },
    { x: 25.0, y: 2.0, z: -20.0, scale: 1.3, yaw: 0.8 }
  ],
  old_military_crate_b: [
    // Open cloth-lined military crate on Catwalk parapet
    { x: 6.1, y: 3.7, z: 6.0, scale: 1.15, yaw: 3.05 }
  ],
  cement_bag: [
    // Stacked cement bags on A-Goose, B-Site, and Catwalk terraces
    { x: 33.8, y: 2.4, z: -37.2, scale: 1.15, yaw: 0.15 },
    { x: -33.8, y: 2.4, z: -37.2, scale: 1.15, yaw: -0.2 },
    { x: -5.6, y: 2.4, z: 4.4, scale: 1.1, yaw: 1.45 },
    { x: 5.6, y: 2.4, z: -4.4, scale: 1.1, yaw: -1.45 }
  ],
  ammo_box: [
    { x: -9.2, y: 1.9, z: 4.1, scale: 1.45, yaw: 0.7 },
    { x: 9.2, y: 1.9, z: -4.1, scale: 1.45, yaw: -0.8 }
  ]
};

const CARGO_DOCK_PROP_PLACEMENTS = {
  concrete_road_barrier_02: [
    { x: -44.2, y: 0, z: -11.5, scale: 1.0, yaw: 0.18 },
    { x: 44.2, y: 0, z: 11.5, scale: 1.0, yaw: Math.PI + 0.18 }
  ],
  Barrel_02: [
    { x: -59.5, y: 0, z: -14.0, scale: 1.06, yaw: 0.5 },
    { x: -59.5, y: 0, z: 14.0, scale: 1.06, yaw: 1.9 },
    { x: 59.5, y: 0, z: -14.0, scale: 1.06, yaw: 2.7 },
    { x: 59.5, y: 0, z: 14.0, scale: 1.06, yaw: 0.9 },
    { x: -24.2, y: 0, z: -44.2, scale: 1.04, yaw: 1.4 },
    { x: 24.2, y: 0, z: 44.2, scale: 1.04, yaw: 2.2 }
  ]
};

/**
 * Asynchronously loads and places Poly Haven 1K glTF props for `desert_outpost` and `cargo_dock`
 * strictly in browser WebGL on Medium/High tiers, with staleness protection across map switches.
 */
export async function placeMapPolyhavenProps(game, mapCfg, buildSeq) {
  if (!canLoadBrowserPolyhavenProps(game)) return [];
  const mapId = mapCfg?.id;
  if (mapId !== 'desert_outpost' && mapId !== 'cargo_dock') return [];

  const isDust = mapId === 'desert_outpost';
  const ids = isDust ? POLYHAVEN_PROP_IDS : ['Barrel_02', 'concrete_road_barrier_02'];
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
    game.currentMapId !== mapId ||
    !game.worldMeshes?.length ||
    !canLoadBrowserPolyhavenProps(game)
  ) {
    return [];
  }

  const placedMeshes = [];
  const spec = isDust ? DUST2_PROP_PLACEMENTS : CARGO_DOCK_PROP_PLACEMENTS;

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

  if (isDust) {
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
  } else {
    spawnBatch('concrete_road_barrier_02', spec.concrete_road_barrier_02, { shadow: castShadow });
    spawnBatch('Barrel_02', spec.Barrel_02, { shadow: false });
  }

  if (placedMeshes.length && game.renderer?.shadowMap) {
    game.renderer.shadowMap.needsUpdate = true;
  }
  return placedMeshes;
}
