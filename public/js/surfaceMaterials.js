// PBR surface layer for the arena: which Poly Haven set each theme/role uses, WORLD-SPACE (metre) UVs on a second UV
// channel, and tier-aware application of the maps onto the existing procedural materials.
//
// The procedural canvas materials built by arenaBuilder stay the fallback: the PBR maps are applied in place AFTER the
// textures load (and reverted if a texture fails / the tier changes), so the arena is never textureless or blocked.

import * as THREE from '../vendor/three/three.module.js';
import { presetUsesMap } from './quality.js';

/** Poly Haven sets shipped in /assets/textures (all CC0). */
export const TEXTURE_SET_IDS = [
  'concrete_floor_worn_001',
  'concrete_block_wall',
  'rusty_metal_02',
  'metal_plate',
  'red_brick',
  'dirt_floor'
];

const PBR_UV_CHANNEL = 1; // geometry attribute `uv1`; textures use texture.channel = 1 so procedural `uv` (channel 0) stays intact

// role specs: set, tile (metres per texture repeat), tint (hex or 'obs' = derived from the obstacle colour),
// rough/metal = constants used when the ARM map is NOT loaded, normalScale
const S = (set, tile, tint, rough, metal, normalScale = 1.0) => ({ set, tile, tint, rough, metal, normalScale });

export const SURFACE_PLANS = {
  cyber_citadel: {
    floor: S('concrete_floor_worn_001', 4, 0x8c96aa, 0.88, 0.04),
    wall: S('concrete_block_wall', 2.5, 0x9aa4b6, 0.9, 0.03),
    platform: S('metal_plate', 2, 0x8d99ae, 0.55, 0.45),
    container: S('metal_plate', 2, 'obs', 0.5, 0.5),
    crate: S('metal_plate', 1.6, 'obs', 0.6, 0.4),
    pillar: S('concrete_block_wall', 2.5, 0x8d97a8, 0.88, 0.05),
    step: S('metal_plate', 1.6, 0x7e8aa0, 0.5, 0.5)
  },
  cargo_dock: {
    floor: S('concrete_floor_worn_001', 4, 0x939ba6, 0.9, 0.03),
    wall: S('concrete_block_wall', 2.5, 0xa2a8ae, 0.9, 0.03),
    platform: S('rusty_metal_02', 2, 0x9a8f86, 0.6, 0.4),
    container: S('rusty_metal_02', 2, 'obs', 0.55, 0.45),
    crate: S('rusty_metal_02', 1.6, 'obs', 0.62, 0.35),
    pillar: S('concrete_block_wall', 2.5, 0x9da3a9, 0.88, 0.05),
    step: S('metal_plate', 1.6, 0x838b96, 0.5, 0.5)
  },
  desert_outpost: {
    floor: S('dirt_floor', 5, 0xb59f84, 0.95, 0.0),
    wall: S('red_brick', 2, 0xc2a995, 0.88, 0.02),
    platform: S('metal_plate', 2, 0xa8977f, 0.58, 0.4),
    container: S('rusty_metal_02', 2, 'obs', 0.55, 0.45),
    crate: S('metal_plate', 1.6, 'obs', 0.6, 0.4),
    pillar: S('concrete_block_wall', 2.5, 0xb3a591, 0.88, 0.04),
    step: S('rusty_metal_02', 1.6, 0xa09283, 0.55, 0.45)
  },
  neon_lab: {
    floor: S('concrete_floor_worn_001', 4, 0x7a809c, 0.8, 0.12),
    wall: S('metal_plate', 2.2, 0x8a84b4, 0.5, 0.5),
    platform: S('metal_plate', 2, 0x8d88b8, 0.46, 0.55),
    container: S('metal_plate', 2, 'obs', 0.46, 0.55),
    crate: S('metal_plate', 1.6, 'obs', 0.55, 0.45),
    pillar: S('metal_plate', 2, 0x8782b0, 0.46, 0.55),
    step: S('metal_plate', 1.6, 0x7b78a6, 0.46, 0.55)
  }
};

export function getSurfacePlan(mapId) {
  return SURFACE_PLANS[mapId] || SURFACE_PLANS.cyber_citadel;
}

/** Distinct texture sets one map needs (what preload / upgrade actually fetch). */
export function surfaceSetsForMap(mapId) {
  return [...new Set(Object.values(getSurfacePlan(mapId)).map((spec) => spec.set))];
}

/** Colour multiplier for a textured surface: keeps the obstacle's hue but lifts it so albedo x tint is not mud. */
export function tintFromObstacleColor(hex, role = 'container') {
  const c = new THREE.Color(hex);
  const hsl = { h: 0, s: 0, l: 0 };
  c.getHSL(hsl);
  const lift = role === 'crate' ? 0.55 : 0.6;
  c.setHSL(hsl.h, Math.min(hsl.s, 0.5), lift);
  return c.getHex();
}

export function resolveTint(spec, obstacleColor, role) {
  return spec.tint === 'obs' ? tintFromObstacleColor(obstacleColor ?? 0x888888, role) : spec.tint;
}

// ------------------------------------------------------------------ world-space UVs (metres)

/** Deterministic per-position texture offset so neighbouring boxes do not show the same crop. */
export function uvOffsetFor(x = 0, y = 0, z = 0) {
  const f = (n) => Math.abs((Math.sin(n) * 43758.5453) % 1);
  return [f(x * 12.9898 + z * 78.233), f(y * 37.719 + x * 4.1414 + z * 1.337)];
}

/**
 * Writes the `uv1` attribute of a BoxGeometry so one UV unit == one texture repeat of `tile` metres on every face
 * (texel density is identical on a 1.5 m crate and a 130 m perimeter wall). BoxGeometry face order:
 * +X, -X (d x h), +Y, -Y (w x d), +Z, -Z (w x h).
 */
export function applyMetricBoxUV1(geo, w, h, d, tile = 2, offset = [0, 0]) {
  const uv = geo?.attributes?.uv;
  if (!uv || uv.count < 24) return false;
  const spans = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  const out = new Float32Array(uv.count * 2);
  for (let f = 0; f < 6; f++) {
    for (let i = 0; i < 4; i++) {
      const idx = f * 4 + i;
      out[idx * 2] = (uv.getX(idx) * spans[f][0]) / tile + offset[0];
      out[idx * 2 + 1] = (uv.getY(idx) * spans[f][1]) / tile + offset[1];
    }
  }
  geo.setAttribute('uv1', new THREE.BufferAttribute(out, 2));
  return true;
}

/** Same for a PlaneGeometry (width x height in metres). */
export function applyMetricPlaneUV1(geo, width, height, tile = 4) {
  const uv = geo?.attributes?.uv;
  if (!uv) return false;
  const out = new Float32Array(uv.count * 2);
  for (let i = 0; i < uv.count; i++) {
    out[i * 2] = (uv.getX(i) * width) / tile;
    out[i * 2 + 1] = (uv.getY(i) * height) / tile;
  }
  geo.setAttribute('uv1', new THREE.BufferAttribute(out, 2));
  return true;
}

// ------------------------------------------------------------------ slots (material <-> PBR role)

/** Remembers a procedural material and the PBR role that may later replace its maps. */
export function registerPbrSlot(game, material, spec, tint) {
  if (!game.pbrSlots) game.pbrSlots = [];
  game.pbrSlots.push({
    material,
    spec,
    tint,
    applied: false,
    orig: {
      map: material.map,
      bumpMap: material.bumpMap,
      roughnessMap: material.roughnessMap,
      roughness: material.roughness,
      metalness: material.metalness,
      bumpScale: material.bumpScale,
      color: material.color.getHex()
    }
  });
}

export function revertPbrSlots(game) {
  for (const slot of game.pbrSlots || []) {
    const m = slot.material;
    const o = slot.orig;
    m.map = o.map;
    m.bumpMap = o.bumpMap;
    m.roughnessMap = o.roughnessMap;
    m.normalMap = null;
    m.aoMap = null;
    m.metalnessMap = null;
    m.roughness = o.roughness;
    m.metalness = o.metalness;
    m.bumpScale = o.bumpScale;
    m.color.setHex(o.color);
    m.needsUpdate = true;
    slot.applied = false;
  }
}

/**
 * Loads the texture sets required by the registered slots for `preset` and applies them in place.
 * Resolves to { applied, skipped, sets } and never throws. If `isStale()` turns true (map reloaded meanwhile) nothing is touched.
 */
export async function applyPbrToSlots(game, assets, preset, isStale = () => false) {
  const slots = game.pbrSlots || [];
  const result = { applied: 0, skipped: 0, sets: [] };
  if (!slots.length || !assets) return result;
  try {
    const ids = [...new Set(slots.map((s) => s.spec.set))];
    const loaded = new Map();
    await Promise.all(ids.map(async (id) => loaded.set(id, await assets.loadTextureSet(id, preset))));
    if (isStale()) return result;
    result.sets = ids.filter((id) => loaded.get(id));
    const noEnv = !preset.envMapSize;
    for (const slot of slots) {
      const ts = loaded.get(slot.spec.set);
      const m = slot.material;
      if (!ts) {
        result.skipped++;
        continue;
      }
      for (const t of [ts.diffuse, ts.normal, ts.arm]) {
        if (t) t.channel = PBR_UV_CHANNEL;
      }
      m.map = ts.diffuse;
      m.bumpMap = null;
      m.color.setHex(slot.tint);
      m.normalMap = presetUsesMap(preset, 'normal') ? ts.normal : null;
      if (m.normalMap) m.normalScale.set(slot.spec.normalScale, slot.spec.normalScale);
      if (presetUsesMap(preset, 'arm') && ts.arm) {
        // glTF ORM convention: R = AO, G = roughness, B = metalness
        m.aoMap = ts.arm;
        m.aoMapIntensity = 0.9;
        m.roughnessMap = ts.arm;
        m.metalnessMap = ts.arm;
        m.roughness = 1;
        m.metalness = 1;
      } else {
        m.aoMap = null;
        m.metalnessMap = null;
        m.roughnessMap = null;
        m.roughness = slot.spec.rough;
        // without an environment map (Low) strongly metallic surfaces would render almost black
        m.metalness = noEnv ? Math.min(slot.spec.metal, 0.25) : slot.spec.metal;
      }
      m.needsUpdate = true;
      slot.applied = true;
      result.applied++;
      // the procedural canvas maps are no longer sampled: free their GPU copies (they re-upload automatically on revert)
      for (const old of [slot.orig.map, slot.orig.bumpMap, slot.orig.roughnessMap]) {
        if (old && old !== m.map && old !== m.roughnessMap) old.dispose?.();
      }
    }
    if (typeof assets.disposeTexturesNotMatching === 'function') {
      assets.disposeTexturesNotMatching(preset, result.sets);
    }
  } catch (err) {
    console.warn('[surface] PBR upgrade failed, procedural materials kept:', err?.message || err);
    revertPbrSlots(game);
  }
  return result;
}
