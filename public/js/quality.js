// Graphics quality tiers (Thấp / Vừa / Cao): presets, GPU auto-detection, persisted user choice and the ?perf=1 overlay.
// Pure module (no three.js import) so it can be unit-tested headlessly.

export const TIER_ORDER = ['low', 'medium', 'high'];
export const QUALITY_STORAGE_KEY = 'polystrike.quality';
export const QUALITY_CHOICES = ['auto', ...TIER_ORDER];

/**
 * Every numeric field is a "cost knob": it never decreases from low -> medium -> high (tests enforce this).
 *  - maxPixelRatio / minPixelRatio: render scale ceiling and the floor the adaptive downgrade in Game3D.animate may reach
 *  - antialias (0/1): MSAA, only applied when the WebGL context is created (needs a page reload to change)
 *  - shadowMapSize: 0 = shadows off. shadowType: 'basic' | 'pcf' | 'pcfsoft' (three shadow filter)
 *  - anisotropy: requested anisotropic filtering (clamped to the GPU maximum)
 *  - textureMaxSize: PBR textures are downscaled to at most this edge length before upload
 *  - pbrMapLevel: 1 = diffuse only (+ constant roughness), 2 = + normal map, 3 = + ARM (AO/Roughness/Metalness) map
 *  - envMapSize: width of the procedural sky env map (0 = none, no PMREM at all)
 *  - cameraFar: far plane (kept at 360 on every tier: the sky dome has a 310 radius and must never be clipped)
 *  - maxBulletDecals / particleScale / ambientParticles: effect budgets
 *  - maxShotEffects: size of the pre-built tracer + spark pool (shots beyond it recycle the oldest tracer: no per-shot allocation)
 *  - dynamicLights: number of transient point lights that are PERMANENTLY in the scene (0 = none, 1 = local muzzle light,
 *    2 = + one shared explosion flash). The light count never changes during a match, so the shaders never recompile on a shot
 *  - cylinderSegments / capsuleSegments: tessellation of the instanced decor (triangle budget)
 *  - glbProps (0/1): glTF props (crate toppers) instead of procedural boxes
 *  - mergeWorldMeshes (boolean, a SAVING flag so it is not part of the monotonic cost knobs): Low draws the obstacles as one
 *    merged mesh per material (the per-obstacle meshes stay as invisible raycast targets)
 */
export const QUALITY = {
  low: {
    id: 'low',
    label: 'Thấp',
    maxPixelRatio: 1,
    minPixelRatio: 0.6,
    antialias: 0,
    shadowMapSize: 0,
    shadowType: 'basic',
    anisotropy: 1,
    textureMaxSize: 512,
    pbrMapLevel: 1,
    envMapSize: 0,
    cameraFar: 360,
    maxBulletDecals: 12,
    maxShotEffects: 10,
    dynamicLights: 0,
    particleScale: 0.45,
    ambientParticles: 0,
    cylinderSegments: 8,
    capsuleSegments: 4,
    glbProps: 0,
    mergeWorldMeshes: true
  },
  medium: {
    id: 'medium',
    label: 'Vừa',
    maxPixelRatio: 1.15,
    minPixelRatio: 0.75,
    antialias: 1,
    shadowMapSize: 1024,
    shadowType: 'pcf',
    anisotropy: 4,
    textureMaxSize: 1024,
    pbrMapLevel: 2,
    envMapSize: 256,
    cameraFar: 360,
    maxBulletDecals: 24,
    maxShotEffects: 16,
    dynamicLights: 1,
    particleScale: 0.75,
    ambientParticles: 120,
    cylinderSegments: 12,
    capsuleSegments: 6,
    glbProps: 1,
    mergeWorldMeshes: false
  },
  high: {
    id: 'high',
    label: 'Cao',
    maxPixelRatio: 1.35,
    minPixelRatio: 0.85,
    antialias: 1,
    shadowMapSize: 2048,
    shadowType: 'pcfsoft',
    anisotropy: 8,
    textureMaxSize: 2048,
    pbrMapLevel: 3,
    envMapSize: 512,
    cameraFar: 360,
    maxBulletDecals: 36,
    maxShotEffects: 24,
    dynamicLights: 2,
    particleScale: 1,
    ambientParticles: 220,
    cylinderSegments: 14,
    capsuleSegments: 8,
    glbProps: 1,
    mergeWorldMeshes: false
  }
};

/** Numeric keys that must be monotonic non-decreasing across TIER_ORDER. */
export const COST_KNOBS = Object.keys(QUALITY.low).filter((k) => typeof QUALITY.low[k] === 'number');

export function isTier(value) {
  return TIER_ORDER.includes(value);
}

export function isQualityChoice(value) {
  return QUALITY_CHOICES.includes(value);
}

export function getPreset(tierOrChoice, fallbackTier = 'medium') {
  if (isTier(tierOrChoice)) return QUALITY[tierOrChoice];
  return QUALITY[isTier(fallbackTier) ? fallbackTier : 'medium'];
}

/** True when the PBR map `kind` ('diffuse' | 'normal' | 'arm') is used by the preset. */
export function presetUsesMap(preset, kind) {
  const level = preset?.pbrMapLevel || 1;
  if (kind === 'diffuse') return level >= 1;
  if (kind === 'normal') return level >= 2;
  if (kind === 'arm') return level >= 3;
  return false;
}

function shiftTier(tier, delta) {
  const idx = Math.max(0, Math.min(TIER_ORDER.length - 1, TIER_ORDER.indexOf(tier) + delta));
  return TIER_ORDER[idx];
}

/**
 * Maps the WebGL UNMASKED_RENDERER string (+ logical core count) to a tier.
 *  software (SwiftShader / llvmpipe / Mesa / Microsoft Basic) -> low
 *  NVIDIA GeForce|RTX|GTX|Quadro, Radeon RX|Pro, Apple M*|Apple GPU, Intel Arc -> high (Arc -> medium)
 *  Intel (UHD / HD / Iris) -> low;  AMD "Radeon(TM) Graphics" / Vega (integrated) -> medium
 *  unknown/empty -> medium.  hardwareConcurrency <= 4 drops one tier (never below low).
 */
export function detectTier(rendererString = '', hardwareConcurrency = 0) {
  const r = String(rendererString || '').toLowerCase();
  let tier;
  if (/swiftshader|llvmpipe|softpipe|mesa|microsoft basic|software|basic render/.test(r)) {
    tier = 'low';
  } else if (/nvidia|geforce|rtx|gtx|quadro/.test(r)) {
    tier = 'high';
  } else if (/radeon\s*(rx|pro)|\brx\s?\d{3,4}|radeon\s*vii/.test(r)) {
    tier = 'high';
  } else if (/apple\s*(m\d|gpu)/.test(r)) {
    tier = 'high';
  } else if (/intel/.test(r)) {
    tier = /\barc\b/.test(r) ? 'medium' : 'low';
  } else if (/radeon|\bamd\b|vega|\bati\b/.test(r)) {
    tier = 'medium';
  } else {
    tier = 'medium';
  }
  const cores = Number(hardwareConcurrency) || 0;
  if (cores > 0 && cores <= 4) tier = shiftTier(tier, -1);
  return tier;
}

/** Reads the unmasked renderer string through a throw-away WebGL context (empty string when unavailable). */
export function probeRendererString() {
  try {
    if (typeof document === 'undefined') return '';
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext?.('webgl2') || canvas.getContext?.('webgl') || null;
    if (!gl || typeof gl.getExtension !== 'function') return '';
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const value = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return String(value || '');
  } catch {
    return '';
  }
}

export function detectInitialTier() {
  const cores = typeof navigator !== 'undefined' ? navigator.hardwareConcurrency || 0 : 0;
  return detectTier(probeRendererString(), cores);
}

function getStorage(storage) {
  if (storage) return storage;
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

/** Stored choice: 'auto' | 'low' | 'medium' | 'high'. Any storage failure or junk value -> 'auto'. */
export function loadQualityChoice(storage) {
  try {
    const store = getStorage(storage);
    const raw = store?.getItem(QUALITY_STORAGE_KEY);
    return isQualityChoice(raw) ? raw : 'auto';
  } catch {
    return 'auto';
  }
}

/** Persists the choice; returns false (never throws) when storage is unavailable. */
export function saveQualityChoice(choice, storage) {
  if (!isQualityChoice(choice)) return false;
  try {
    const store = getStorage(storage);
    if (!store) return false;
    store.setItem(QUALITY_STORAGE_KEY, choice);
    return true;
  } catch {
    return false;
  }
}

export function resolveTier(choice, detectedTier = 'medium') {
  return isTier(choice) ? choice : isTier(detectedTier) ? detectedTier : 'medium';
}

/** `?perf=1` (or `?perf`) turns the measurement overlay on. */
export function isPerfOverlayRequested(search) {
  try {
    const s = search ?? (typeof window !== 'undefined' ? window.location?.search : '') ?? '';
    const v = new URLSearchParams(s).get('perf');
    return v !== null && v !== '0' && v !== 'false';
  } catch {
    return false;
  }
}

/** Small fixed overlay: FPS + renderer.info (draw calls, triangles, textures, geometries) + tier + pixel ratio. */
export class PerfOverlay {
  constructor(parent = typeof document !== 'undefined' ? document.body : null) {
    this.el = null;
    this.lastUpdate = 0;
    this.frames = 0;
    this.fps = 0;
    if (!parent || typeof document === 'undefined') return;
    const el = document.createElement('pre');
    el.id = 'perf-overlay';
    if (el.style) {
      el.style.cssText =
        'position:fixed;right:8px;bottom:8px;margin:0;padding:6px 9px;z-index:99999;pointer-events:none;' +
        'font:11px/1.35 ui-monospace,Consolas,monospace;color:#a7f3d0;background:rgba(2,6,23,0.78);' +
        'border:1px solid rgba(167,243,208,0.35);border-radius:4px;white-space:pre';
    }
    parent.appendChild?.(el);
    this.el = el;
  }

  /** Call right after renderer.render(): renderer.info.render is reset on the next render call. */
  update(now, renderer, extra = {}) {
    this.frames++;
    if (now - this.lastUpdate < 500) return;
    this.fps = Math.round((this.frames * 1000) / Math.max(1, now - this.lastUpdate));
    this.frames = 0;
    this.lastUpdate = now;
    const info = renderer?.info;
    const text =
      `FPS ${this.fps}   tier ${extra.tier ?? '?'}   pr ${extra.pixelRatio ?? '?'}\n` +
      `calls ${info?.render?.calls ?? '?'}   tris ${info?.render?.triangles ?? '?'}\n` +
      `textures ${info?.memory?.textures ?? '?'}   geometries ${info?.memory?.geometries ?? '?'}` +
      (extra.net ? `
${extra.net}` : '');
    this.text = text;
    if (this.el) this.el.textContent = text;
  }

  dispose() {
    this.el?.remove?.();
    this.el = null;
  }
}

/**
 * Low tier has no environment map, so very metallic PBR materials would render almost black. Caps (cap < 1) or
 * restores (cap = null) `metalness` under `root`; the original value is remembered on material.userData.
 */
export function applyMetalnessCap(root, cap = null) {
  root?.traverse?.((o) => {
    const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
    for (const m of mats) {
      if (typeof m.metalness !== 'number') continue;
      if (m.userData.__metal0 === undefined) m.userData.__metal0 = m.metalness;
      const next = cap === null ? m.userData.__metal0 : Math.min(m.userData.__metal0, cap);
      if (m.metalness !== next) {
        m.metalness = next;
        m.needsUpdate = true;
      }
    }
  });
}
