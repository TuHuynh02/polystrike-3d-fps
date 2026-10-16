// Asset loader: cached glTF models + PBR texture sets with progress, tier-aware downscaling and a HARD fallback.
// Every public loader resolves to null (and console.warn()s once per asset) instead of throwing, so the game can
// always keep its procedural visuals. GLTFLoader is imported lazily (browser import map: three/addons/ ->
// /vendor/three-examples/) so headless Node tests never need it.

import * as THREE from '../vendor/three/three.module.js';

export const ASSET_BASE = new URL('../assets/', import.meta.url).href;
export const MODEL_DIR = 'models/kenney-blaster-kit/';
export const TEXTURE_DIR = 'textures/';

const warned = new Set();
function warnOnce(key, message, err) {
  if (warned.has(key)) return;
  warned.add(key);
  console.warn(`[assets] ${message}${err ? `: ${err?.message || err}` : ''}`);
}
/** Test helper: forget which warnings were already printed. */
export function resetAssetWarnings() {
  warned.clear();
}

export function modelUrl(name) {
  return `${ASSET_BASE}${MODEL_DIR}${name}.glb`;
}

export function textureUrl(setId, kind) {
  // kind: diff | nor_gl | arm
  return `${ASSET_BASE}${TEXTURE_DIR}${setId}/${setId}_${kind}_1k.jpg`;
}

function defaultLoadImage(url) {
  return new Promise((resolve, reject) => {
    if (typeof Image === 'undefined') {
      reject(new Error('Image is not available in this environment'));
      return;
    }
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`failed to load ${url}`));
    img.src = url;
  });
}

function downscaleSource(img, maxSize) {
  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;
  if (!w || !h || Math.max(w, h) <= maxSize || typeof document === 'undefined') return img;
  const k = maxSize / Math.max(w, h);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(w * k));
  canvas.height = Math.max(1, Math.round(h * k));
  const ctx = canvas.getContext('2d');
  if (!ctx) return img;
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas;
}

export class AssetManager {
  /**
   * @param {object} [opts]
   * @param {(url:string)=>Promise<any>} [opts.loadImage]  image decoder (tests inject one)
   * @param {()=>Promise<any>} [opts.importGltfLoader]     returns the GLTFLoader class (tests inject a failing one)
   */
  constructor(opts = {}) {
    this.loadImage = opts.loadImage || defaultLoadImage;
    this.importGltfLoader =
      opts.importGltfLoader || (async () => (await import('three/addons/loaders/GLTFLoader.js')).GLTFLoader);
    this.models = new Map(); // name -> Promise<gltf|null>
    this.loadedModels = new Map(); // name -> gltf (resolved ok)
    this.textures = new Map(); // key -> Promise<THREE.Texture|null>
    this.loadedTextures = new Map(); // key -> THREE.Texture
    this._loaderPromise = null;
    this.maxAnisotropy = 1;
  }

  setMaxAnisotropy(n) {
    this.maxAnisotropy = Math.max(1, Number(n) || 1);
  }

  // ---------------------------------------------------------------- models
  async _getLoader() {
    if (!this._loaderPromise) {
      this._loaderPromise = this.importGltfLoader().then((Cls) => new Cls());
    }
    return this._loaderPromise;
  }

  /** Loads (once) and caches `<name>.glb`. Resolves to the glTF result or null. Never throws. */
  loadModel(name) {
    if (this.models.has(name)) return this.models.get(name);
    const url = modelUrl(name);
    const p = (async () => {
      try {
        const loader = await this._getLoader();
        const gltf = await loader.loadAsync(url);
        if (!gltf?.scene) throw new Error('empty glTF scene');
        this.loadedModels.set(name, gltf);
        return gltf;
      } catch (err) {
        warnOnce(`model:${name}`, `model "${name}" unavailable, using procedural fallback`, err);
        return null;
      }
    })();
    this.models.set(name, p);
    return p;
  }

  /** Deep clone that SHARES geometry/materials/textures with the cached original (cheap instancing). */
  cloneModel(name) {
    const gltf = this.loadedModels.get(name);
    if (!gltf) return null;
    const clone = gltf.scene.clone(true);
    clone.userData.assetName = name;
    return clone;
  }

  /** Tints/limits nothing: just anisotropy + sRGB for every texture of a model (call once after loading). */
  prepareModelTextures(name, anisotropy = 1) {
    const gltf = this.loadedModels.get(name);
    if (!gltf || gltf.userData?.__prepared === anisotropy) return;
    gltf.scene.traverse((o) => {
      if (!o.isMesh) return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) {
        if (m?.map) {
          m.map.colorSpace = THREE.SRGBColorSpace;
          m.map.anisotropy = Math.min(anisotropy, this.maxAnisotropy);
          m.map.needsUpdate = true;
        }
      }
    });
    gltf.userData = { ...(gltf.userData || {}), __prepared: anisotropy };
  }

  /** Preloads models + texture sets, reporting {loaded,total,label}. Resolves to the number of failures. */
  async preload({ models = [], textureSets = [], tier = null, onProgress = null } = {}) {
    const jobs = [];
    for (const name of models) jobs.push({ label: name, run: () => this.loadModel(name) });
    for (const id of textureSets) jobs.push({ label: id, run: () => this.loadTextureSet(id, tier) });
    const total = jobs.length;
    let loaded = 0;
    let failures = 0;
    onProgress?.({ loaded, total, label: '' });
    await Promise.all(
      jobs.map(async (job) => {
        const res = await job.run();
        if (!res) failures++;
        loaded++;
        try {
          onProgress?.({ loaded, total, label: job.label });
        } catch {
          /* progress UI must never break loading */
        }
      })
    );
    return failures;
  }

  // -------------------------------------------------------------- textures
  /**
   * @param {string} url
   * @param {{maxSize?:number, srgb?:boolean, anisotropy?:number}} opts
   */
  loadTexture(url, { maxSize = 1024, srgb = false, anisotropy = 1 } = {}) {
    const key = `${url}|${maxSize}|${srgb ? 's' : 'l'}|${anisotropy}`;
    if (this.textures.has(key)) return this.textures.get(key);
    const p = (async () => {
      try {
        const img = await this.loadImage(url);
        const source = downscaleSource(img, maxSize);
        const tex = new THREE.Texture(source);
        tex.wrapS = THREE.RepeatWrapping;
        tex.wrapT = THREE.RepeatWrapping;
        tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace; // diffuse = sRGB, normal/ARM = linear data
        tex.anisotropy = Math.max(1, Math.min(anisotropy, this.maxAnisotropy));
        tex.minFilter = THREE.LinearMipmapLinearFilter;
        tex.generateMipmaps = true;
        tex.needsUpdate = true;
        this.loadedTextures.set(key, tex);
        return tex;
      } catch (err) {
        warnOnce(`tex:${url}`, `texture "${url.split('/').pop()}" unavailable, using procedural fallback`, err);
        return null;
      }
    })();
    this.textures.set(key, p);
    return p;
  }

  /**
   * Loads the maps a tier needs for a Poly Haven set: always diffuse, +normal (pbrMapLevel>=2), +ARM (>=3).
   * Resolves to { diffuse, normal, arm } (missing maps are null) or null if the diffuse failed.
   */
  async loadTextureSet(setId, preset = null) {
    const level = preset?.pbrMapLevel || 1;
    const opts = { maxSize: preset?.textureMaxSize || 1024, anisotropy: preset?.anisotropy || 1 };
    const [diffuse, normal, arm] = await Promise.all([
      this.loadTexture(textureUrl(setId, 'diff'), { ...opts, srgb: true }),
      level >= 2 ? this.loadTexture(textureUrl(setId, 'nor_gl'), opts) : null,
      level >= 3 ? this.loadTexture(textureUrl(setId, 'arm'), opts) : null
    ]);
    if (!diffuse) return null;
    return { diffuse, normal: normal || null, arm: arm || null };
  }

  /** Frees GPU/CPU memory of cached textures except keys whose URL contains one of `keepSetIds` at the given settings. */
  disposeTexturesNotMatching(preset, keepSetIds = []) {
    const suffixes = [`|${preset?.textureMaxSize || 1024}|`];
    for (const [key, tex] of Array.from(this.loadedTextures.entries())) {
      const keep = suffixes.some((s) => key.includes(s)) && keepSetIds.some((id) => key.includes(`/${id}/`));
      if (!keep) {
        tex.dispose();
        this.loadedTextures.delete(key);
        this.textures.delete(key);
      }
    }
  }

  // ------------------------------------------------------------- disposal
  /** Disposes a cached model (geometry, materials, textures). Clones sharing it become invalid. */
  disposeModel(name) {
    const gltf = this.loadedModels.get(name);
    this.loadedModels.delete(name);
    this.models.delete(name);
    if (gltf) disposeObjectDeep(gltf.scene);
  }

  dispose() {
    for (const name of Array.from(this.loadedModels.keys())) this.disposeModel(name);
    for (const tex of this.loadedTextures.values()) tex.dispose();
    this.loadedTextures.clear();
    this.textures.clear();
    this.models.clear();
  }
}

/** Disposes geometries/materials/textures under `root`. Only call this for objects that OWN their resources. */
export function disposeObjectDeep(root) {
  root?.traverse?.((o) => {
    o.geometry?.dispose?.();
    const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
    for (const m of mats) {
      for (const v of Object.values(m)) {
        if (v && v.isTexture) v.dispose();
      }
      m.dispose?.();
    }
  });
}

/** Removes a clone from its parent WITHOUT disposing the geometry/materials it shares with the cached original. */
export function releaseClone(obj) {
  obj?.parent?.remove(obj);
}

let sharedManager = null;
export function getAssetManager() {
  if (!sharedManager) sharedManager = new AssetManager();
  return sharedManager;
}
