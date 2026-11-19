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
  'dirt_floor',
  'beige_wall_001',
  'sandstone_blocks_04',
  'cobblestone_pavement',
  'weathered_brown_planks',
  'corrugated_iron_02'
];

const PBR_UV_CHANNEL = 1; // geometry attribute `uv1`; textures use texture.channel = 1 so procedural `uv` (channel 0) stays intact

// role specs: set, tile (metres per texture repeat), tint (hex or 'obs' = derived from the obstacle colour),
// rough/metal = constants used when the ARM map is NOT loaded, normalScale
const S = (set, tile, tint, rough, metal, normalScale = 1.25) => ({ set, tile, tint, rough, metal, normalScale });

export const SURFACE_PLANS = {
  cyber_citadel: {
    floor: S('concrete_floor_worn_001', 4, 0x9aa4b6, 0.88, 0.04, 1.35),
    wall: S('concrete_block_wall', 2.5, 0xb2bcc9, 0.9, 0.03, 1.40),
    platform: S('metal_plate', 2, 0x98a4b8, 0.54, 0.46, 1.26),
    container: S('corrugated_iron_02', 2, 'obs', 0.48, 0.48, 1.35),
    crate: S('metal_plate', 1.6, 'obs', 0.58, 0.38, 1.24),
    pillar: S('concrete_block_wall', 2.5, 0xa8b2c2, 0.88, 0.05, 1.32),
    step: S('metal_plate', 1.6, 0x8e9bb0, 0.48, 0.52, 1.26)
  },
  cargo_dock: {
    floor: S('concrete_floor_worn_001', 4, 0x9aa3ae, 0.9, 0.03, 1.36),
    wall: S('concrete_block_wall', 2.5, 0xb2b8be, 0.9, 0.03, 1.40),
    platform: S('rusty_metal_02', 2, 0x9c9188, 0.58, 0.42, 1.26),
    container: S('corrugated_iron_02', 2, 'obs', 0.48, 0.46, 1.36),
    crate: S('metal_plate', 1.6, 'obs', 0.56, 0.38, 1.24),
    pillar: S('concrete_block_wall', 2.5, 0xa8aeb4, 0.88, 0.05, 1.32),
    step: S('metal_plate', 1.6, 0x9099a6, 0.48, 0.52, 1.26)
  },
  desert_outpost: {
    floor: S('cobblestone_pavement', 4.2, 0xd8c8ae, 0.90, 0.02, 1.32),
    wall: S('beige_wall_001', 3.0, 0xdfd2bc, 0.92, 0.02, 1.45),
    platform: S('sandstone_blocks_04', 2.5, 0xcbb99d, 0.88, 0.02, 1.30),
    container: S('corrugated_iron_02', 2.0, 'obs', 0.50, 0.44, 1.35),
    crate: S('weathered_brown_planks', 1.6, 0xba9364, 0.84, 0.04, 1.32),
    pillar: S('sandstone_blocks_04', 2.5, 0xcbb99d, 0.88, 0.02, 1.30),
    step: S('sandstone_blocks_04', 2.0, 0xcbb99d, 0.88, 0.02, 1.28),
    dado: S('concrete_block_wall', 2.2, 0x8c8578, 0.94, 0.02, 1.40)
  },
  neon_lab: {
    floor: S('concrete_floor_worn_001', 4, 0x8a90aa, 0.8, 0.12, 1.34),
    wall: S('metal_plate', 2.2, 0x9a94c0, 0.5, 0.5, 1.36),
    platform: S('metal_plate', 2, 0x9c98c6, 0.46, 0.55, 1.28),
    container: S('metal_plate', 2, 'obs', 0.46, 0.52, 1.36),
    crate: S('metal_plate', 1.6, 'obs', 0.55, 0.44, 1.24),
    pillar: S('metal_plate', 2, 0x9692be, 0.46, 0.55, 1.30),
    step: S('metal_plate', 1.6, 0x8b88b4, 0.46, 0.55, 1.24)
  },
  crossfire_plus: {
    floor: S('concrete_floor_worn_001', 3.5, 0x97a1b0, 0.88, 0.04, 1.35),
    wall: S('concrete_block_wall', 2.2, 0xb0b8c5, 0.88, 0.04, 1.40),
    platform: S('metal_plate', 2, 0x9ca7b8, 0.52, 0.48, 1.26),
    container: S('corrugated_iron_02', 2, 'obs', 0.48, 0.46, 1.35),
    crate: S('metal_plate', 1.6, 'obs', 0.56, 0.40, 1.24),
    pillar: S('concrete_block_wall', 2.2, 0xb6aa9c, 0.85, 0.06, 1.32),
    step: S('metal_plate', 1.6, 0x8e9aab, 0.50, 0.50, 1.24)
  },
  fy_iceworld: {
    floor: S('concrete_floor_worn_001', 3.5, 0xb0cbe0, 0.78, 0.10, 1.32),
    wall: S('concrete_block_wall', 2.2, 0xc2dced, 0.82, 0.08, 1.38),
    platform: S('metal_plate', 2, 0xa2c2da, 0.5, 0.48, 1.26),
    container: S('metal_plate', 2, 'obs', 0.5, 0.5, 1.35),
    crate: S('metal_plate', 1.6, 'obs', 0.55, 0.45, 1.24),
    pillar: S('concrete_block_wall', 2.2, 0xc4e3f6, 0.8, 0.1, 1.32),
    step: S('metal_plate', 1.6, 0x98bad4, 0.5, 0.5, 1.24)
  },
  killhouse_cqb: {
    floor: S('concrete_floor_worn_001', 3.5, 0x9e9b97, 0.9, 0.03, 1.35),
    wall: S('red_brick', 2.2, 0xba9f84, 0.88, 0.03, 1.42),
    platform: S('rusty_metal_02', 2, 0xa29384, 0.58, 0.42, 1.26),
    container: S('corrugated_iron_02', 2, 'obs', 0.50, 0.45, 1.35),
    crate: S('metal_plate', 1.6, 'obs', 0.58, 0.36, 1.24),
    pillar: S('concrete_block_wall', 2.2, 0xb2a89d, 0.88, 0.04, 1.32),
    step: S('metal_plate', 1.6, 0x928e88, 0.52, 0.48, 1.24)
  },
  arena_duel: {
    floor: S('concrete_floor_worn_001', 3.5, 0x988ca6, 0.84, 0.08, 1.34),
    wall: S('metal_plate', 2.2, 0xa894b8, 0.52, 0.48, 1.36),
    platform: S('metal_plate', 2, 0xae98c0, 0.48, 0.52, 1.28),
    container: S('metal_plate', 2, 'obs', 0.48, 0.50, 1.35),
    crate: S('metal_plate', 1.6, 'obs', 0.56, 0.44, 1.24),
    pillar: S('concrete_block_wall', 2.2, 0xb4a0c4, 0.82, 0.08, 1.32),
    step: S('metal_plate', 1.6, 0x9886aa, 0.48, 0.52, 1.24)
  }
};

export function getSurfacePlan(mapId) {
  return SURFACE_PLANS[mapId] || SURFACE_PLANS.cyber_citadel;
}

/** Distinct texture sets one map needs (what preload / upgrade actually fetch). */
export function surfaceSetsForMap(mapId) {
  return [...new Set(Object.values(getSurfacePlan(mapId)).map((spec) => spec.set))];
}

/**
 * Colour multiplier for a textured surface: maps arcade obstacle hues into rich, grounded
 * maritime/military painted steel and ordnance tones (deep navy, oxide crimson, forest olive,
 * slate steel, coyote tan) calibrated for multiplicative PBR albedo maps.
 */
export function tintFromObstacleColor(hex, role = 'container', mapId = null) {
  const c = new THREE.Color(hex);
  const hsl = { h: 0, s: 0, l: 0 };
  c.getHSL(hsl);
  const isCrate = role === 'crate';
  const isDesertColor = hex === 0x451a03 || hex === 0x78350f || hex === 0x92400e;

  if (mapId === 'desert_outpost' || isDesertColor) {
    const srgbHsl = { h: 0, s: 0, l: 0 };
    c.getHSL(srgbHsl, THREE.SRGBColorSpace);
    if (srgbHsl.h >= 0.47 && srgbHsl.h <= 0.66) {
      // Iconic Dust II Long-A blue container
      return 0x2b6da8;
    }
    if (hex === 0x451a03) return 0xdfd2bc;
    if (hex === 0x78350f) return 0xcbb99d;
    if (hex === 0x92400e) return isCrate ? 0xba9364 : 0xc6b397;
    if (srgbHsl.l < 0.20) {
      // Sunlit Moroccan limestone / stucco
      return 0xdfd2bc;
    }
    if (srgbHsl.l < 0.29) {
      // Warm carved sandstone
      return 0xcbb99d;
    }
    if (srgbHsl.l < 0.35) {
      // Aged Moroccan timber / sun-baked sandstone
      return isCrate ? 0xba9364 : 0xc6b397;
    }
    if (srgbHsl.h > 0.035 && srgbHsl.h <= 0.16) {
      return isCrate ? 0xba9364 : 0xc6985e;
    }
    return 0xcbb99d;
  }

  if (hsl.s < 0.18) {
    // Slate steel / neutral industrial grey
    c.setHSL(0.58, 0.16, isCrate ? 0.56 : 0.58);
    return c.getHex();
  }

  let h = hsl.h;
  let s = hsl.s;
  let l = isCrate ? 0.54 : 0.55;

  if (h >= 0.86 || h <= 0.035) {
    // Crimson / rose -> Corten oxide crimson
    h = 0.018;
    s = isCrate ? 0.52 : 0.62;
    l = isCrate ? 0.50 : 0.52;
  } else if (h > 0.035 && h <= 0.16) {
    // Amber / orange / brown -> coyote tan (crates) or weathered maritime ochre (containers)
    h = isCrate ? 0.092 : 0.075;
    s = isCrate ? 0.40 : 0.58;
    l = isCrate ? 0.57 : 0.56;
  } else if (h > 0.16 && h < 0.47) {
    // Emerald / green -> military forest olive
    h = 0.265;
    s = isCrate ? 0.36 : 0.42;
    l = isCrate ? 0.51 : 0.53;
  } else if (h >= 0.47 && h <= 0.66) {
    // Cyan / sky / blue -> deep maritime navy steel
    h = 0.585;
    s = isCrate ? 0.46 : 0.62;
    l = isCrate ? 0.54 : 0.56;
  } else {
    // Indigo / purple -> muted tactical plum/slate
    s = Math.min(s, 0.46);
    l = isCrate ? 0.52 : 0.54;
  }

  c.setHSL(h, s, l);
  return c.getHex();
}

export function resolveTint(spec, obstacleColor, role, mapId = null) {
  return spec.tint === 'obs' ? tintFromObstacleColor(obstacleColor ?? 0x888888, role, mapId) : spec.tint;
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

/**
 * Rotates `uv1` by 90 degrees on the 4 vertical faces (+X, -X, +Z, -Z) so horizontal wood-plank PBR sets
 * (e.g. `weathered_brown_planks`) render as crisp vertical crate cladding while +Y/-Y stay aligned along width/depth.
 */
export function applyVerticalPlankBoxUV1(geo, w, h, d, tile = 1.6, offset = [0, 0]) {
  const uv = geo?.attributes?.uv;
  if (!uv || uv.count < 24) return false;
  const spans = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  const out = new Float32Array(uv.count * 2);
  for (let f = 0; f < 6; f++) {
    const isVerticalFace = f === 0 || f === 1 || f === 4 || f === 5;
    for (let i = 0; i < 4; i++) {
      const idx = f * 4 + i;
      if (isVerticalFace) {
        out[idx * 2] = (uv.getY(idx) * spans[f][1]) / tile + offset[1];
        out[idx * 2 + 1] = (uv.getX(idx) * spans[f][0]) / tile + offset[0];
      } else {
        out[idx * 2] = (uv.getX(idx) * spans[f][0]) / tile + offset[0];
        out[idx * 2 + 1] = (uv.getY(idx) * spans[f][1]) / tile + offset[1];
      }
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

const SALTLINE_WET_PROGRAM_KEY = () => 'saltline_wet_v1';
const SALTLINE_WALL_PROGRAM_KEY = () => 'saltline_wall_weather_v1';

const MACRO_GRIME_MAPS = new Set(['desert_outpost', 'cargo_dock']);
const MACRO_GRIME_ROLES = new Set(['wall', 'floor', 'pillar', 'platform', 'dado']);

let _macroGrimeLoadPromise = null;
let _applyWorldMacroGrimeFn = null;

function loadMacroGrimeModule() {
  if (!_macroGrimeLoadPromise) {
    _macroGrimeLoadPromise = import('./arena/macroGrime.js')
      .then((mod) => {
        _applyWorldMacroGrimeFn = typeof mod?.applyWorldMacroGrime === 'function' ? mod.applyWorldMacroGrime : null;
        return _applyWorldMacroGrimeFn;
      })
      .catch(() => null);
  }
  return _macroGrimeLoadPromise;
}

// Kick off non-blocking preload so subsequent synchronous `buildArena()` calls can hook immediately.
void loadMacroGrimeModule();

export function isMacroGrimeEligible(mapId, role) {
  return MACRO_GRIME_MAPS.has(mapId) && MACRO_GRIME_ROLES.has(role);
}

function defaultMacroGrimeParams(mapId, role) {
  if (mapId === 'desert_outpost') {
    if (role === 'floor') return { scale: 0.048, strength: 0.24, dustTop: 0.32, drips: 0 };
    if (role === 'wall' || role === 'dado') return { scale: 0.056, strength: 0.26, dustTop: 0.65, drips: 0.60 };
    return { scale: 0.058, strength: 0.22, dustTop: 0.68, drips: 0.45 };
  }
  if (role === 'floor') return { scale: 0.046, strength: 0.20, dustTop: 0, drips: 0 };
  return { scale: 0.054, strength: 0.22, dustTop: 0.12, drips: 0.45 };
}

function invokeWorldMacroGrime(material, spec) {
  if (!material || !spec?.enabled || !_applyWorldMacroGrimeFn) return false;
  material.userData = material.userData || {};
  if (material.userData._hasMacroGrimeHook && material.userData._hasWorldMacroGrime) return true;
  try {
    _applyWorldMacroGrimeFn(material, {
      scale: spec.scale,
      strength: spec.strength,
      dustTop: spec.dustTop,
      drips: spec.drips
    });
    const attached = Boolean(material.userData._hasWorldMacroGrime);
    material.userData._hasMacroGrimeHook = attached;
    return attached;
  } catch {
    return false;
  }
}

/**
 * Hooks world-space macro grime (`./arena/macroGrime.js` if present, safe no-op fallback otherwise) onto
 * `wall`, `floor`, `pillar`, `platform` (and `dado`) materials on `desert_outpost` and `cargo_dock`.
 * Always call AFTER `applySaltlineWetFloorShader` / `applySaltlineWallWeatheringShader` so shader hooks chain cleanly.
 */
export function attachWorldMacroGrime(
  material,
  { mapId = null, role = null, scale, strength, dustTop, drips, enabled = true } = {}
) {
  if (!material || !isMacroGrimeEligible(mapId, role)) return material;
  const defaults = defaultMacroGrimeParams(mapId, role);
  const spec = {
    mapId,
    role,
    scale: Number.isFinite(scale) ? scale : defaults.scale,
    strength: Number.isFinite(strength) ? strength : defaults.strength,
    dustTop: Number.isFinite(dustTop) ? dustTop : defaults.dustTop,
    drips: Number.isFinite(drips) ? drips : defaults.drips,
    enabled: Boolean(enabled)
  };
  material.userData = material.userData || {};
  material.userData._macroGrimeSpec = spec;
  if (spec.enabled) {
    invokeWorldMacroGrime(material, spec);
  }
  return material;
}

/**
 * Attaches Saltline-inspired damp tarmac / shallow puddle PBR roughness, 6m tar-joint & shore-halo modulation
 * in world-space XZ coordinates (zero extra draw calls, works on both procedural and Poly Haven PBR floors).
 */
export function applySaltlineWetFloorShader(material, strength = 0) {
  if (!material) return material;
  const clamped = Math.max(0, Math.min(1, Number(strength) || 0));
  material.userData = material.userData || {};
  material.userData.wetFloorStrength = clamped;

  if (clamped <= 0.001) {
    if (material.userData._hasSaltlineWetHook || material.userData._hasMacroGrimeHook || material.userData._hasWorldMacroGrime) {
      material.onBeforeCompile = () => {};
      delete material.customProgramCacheKey;
      if (material.userData._wetUniform) {
        material.userData._wetUniform.value = 0;
      }
      material.envMapIntensity = 1.0;
      material.needsUpdate = true;
    }
    material.userData._hasSaltlineWetHook = false;
    material.userData._hasMacroGrimeHook = false;
    material.userData._hasWorldMacroGrime = false;
    material.userData._macroGrimeCompileFn = null;
    return material;
  }

  material.envMapIntensity = 1.0 + clamped * 1.15;
  if (!material.userData._wetUniform) {
    material.userData._wetUniform = { value: clamped };
  } else {
    material.userData._wetUniform.value = clamped;
  }

  if (material.userData._hasSaltlineWetHook) {
    return material;
  }

  material.userData._hasSaltlineWetHook = true;
  material.customProgramCacheKey = SALTLINE_WET_PROGRAM_KEY;
  material.onBeforeCompile = (shader) => {
    const uWet = material.userData._wetUniform || (material.userData._wetUniform = { value: clamped });
    uWet.value = material.userData.wetFloorStrength ?? clamped;
    shader.uniforms.uSaltlineWetStrength = uWet;

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        '#include <common>\nvarying vec3 vSaltlineWorldPos;'
      )
      .replace(
        '#include <worldpos_vertex>',
        '#include <worldpos_vertex>\nvSaltlineWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;'
      );

    const colorIdx = shader.fragmentShader.indexOf('#include <color_fragment>');
    const roughIdx = shader.fragmentShader.indexOf('#include <roughnessmap_fragment>');
    const declareInRoughFirst = roughIdx !== -1 && (colorIdx === -1 || roughIdx < colorIdx);
    const maskDecl = 'float slWetMask = slWetPuddleMask(vSaltlineWorldPos.xz) * uSaltlineWetStrength;';
    const colorBlock = `
float slTarSeam = slTarJointMask(vSaltlineWorldPos.xz) * uSaltlineWetStrength;
float slMacroPatch = slMacroAsphalt(vSaltlineWorldPos.xz);
float slMicroSparkle = (slHash21(floor(vSaltlineWorldPos.xz * 28.0)) - 0.5) * 0.075;
vec3 slMineralShift = mix(vec3(0.96, 0.98, 1.02), vec3(1.03, 1.00, 0.96), clamp(slMacroPatch * 3.0 + 0.5, 0.0, 1.0));
diffuseColor.rgb *= slMineralShift * (1.0 + slMacroPatch * 0.85 + slMicroSparkle) * mix(1.0, 0.86, slWetMask) * mix(1.0, 0.82, slTarSeam);`;
    const roughBlock = `
float slMacroRough = slMacroAsphalt(vSaltlineWorldPos.xz * 1.17 + vec2(6.4, -3.7)) * 0.14;
float slMicroAggregate = (slValueNoise(vSaltlineWorldPos.xz * 9.5) - 0.5) * 0.08 * (1.0 - slWetMask);
float slDrySparkle = (slHash21(floor(vSaltlineWorldPos.xz * 34.0)) - 0.5) * 0.07 * (1.0 - slWetMask);
float slPuddleCore = smoothstep(0.46, 0.84, slWetMask);
float slDryRough = clamp(roughnessFactor + slMacroRough + slMicroAggregate + slDrySparkle, 0.30, 1.0);
roughnessFactor = clamp(mix(slDryRough, 0.07, clamp(slWetMask * 0.88 + slPuddleCore * 0.12, 0.0, 1.0)), 0.07, 1.0);`;

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
uniform float uSaltlineWetStrength;
varying vec3 vSaltlineWorldPos;
float slHash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float slValueNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = slHash21(i);
  float b = slHash21(i + vec2(1.0, 0.0));
  float c = slHash21(i + vec2(0.0, 1.0));
  float d = slHash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
float slMacroAsphalt(vec2 xz) {
  float mLarge = slValueNoise(xz * 0.036 + vec2(2.3, 9.1));
  float mMid = slValueNoise(xz * 0.115 - vec2(7.4, 3.8));
  float mFine = slValueNoise(xz * 0.36 + vec2(13.2, 5.7));
  return (mLarge * 0.52 + mMid * 0.31 + mFine * 0.17 - 0.5) * 0.28;
}
float slTarJointMask(vec2 xz) {
  float wobble = (slValueNoise(xz * 0.42) - 0.5) * 0.045;
  vec2 cell = abs(fract((xz + wobble) / 6.0 + 0.5) - 0.5) * 6.0;
  float seamDist = min(cell.x, cell.y);
  return 1.0 - smoothstep(0.018, 0.068, seamDist);
}
float slWetPuddleMask(vec2 xz) {
  float n1 = slValueNoise(xz * 0.078);
  float n2 = slValueNoise(xz * 0.22 + vec2(11.7, 5.3));
  float n3 = slValueNoise(xz * 0.58 - vec2(4.2, 19.1));
  float grain = slValueNoise(xz * 2.4 + vec2(3.1, 8.9));
  float jointSeep = slTarJointMask(xz) * 0.15;
  float fbm = n1 * 0.54 + n2 * 0.29 + n3 * 0.13 + grain * 0.04 + jointSeep;
  float dampHalo = smoothstep(0.41, 0.60, fbm) * 0.42;
  float puddleCore = smoothstep(0.54, 0.76, fbm);
  return clamp(max(dampHalo, puddleCore), 0.0, 1.0);
}`
      )
      .replace(
        '#include <color_fragment>',
        declareInRoughFirst
          ? `#include <color_fragment>${colorBlock}`
          : `#include <color_fragment>\n${maskDecl}${colorBlock}`
      )
      .replace(
        '#include <roughnessmap_fragment>',
        declareInRoughFirst
          ? `#include <roughnessmap_fragment>\n${maskDecl}${roughBlock}`
          : `#include <roughnessmap_fragment>${roughBlock}`
      );
  };
  material.needsUpdate = true;
  return material;
}

/**
 * Attaches Saltline world-space vertical rain-streak, macro grime, and ground-splash dampening
 * onto vertical obstacle materials (walls, containers, pillars, platforms) with zero extra draw calls.
 */
export function applySaltlineWallWeatheringShader(material, strength = 0) {
  if (!material) return material;
  const clamped = Math.max(0, Math.min(1, Number(strength) || 0));
  material.userData = material.userData || {};
  material.userData.wallWeatherStrength = clamped;

  if (clamped <= 0.001) {
    if (material.userData._hasSaltlineWallHook || material.userData._hasMacroGrimeHook || material.userData._hasWorldMacroGrime) {
      material.onBeforeCompile = () => {};
      delete material.customProgramCacheKey;
      if (material.userData._wallWeatherUniform) {
        material.userData._wallWeatherUniform.value = 0;
      }
      material.needsUpdate = true;
    }
    material.userData._hasSaltlineWallHook = false;
    material.userData._hasMacroGrimeHook = false;
    material.userData._hasWorldMacroGrime = false;
    material.userData._macroGrimeCompileFn = null;
    return material;
  }

  if (!material.userData._wallWeatherUniform) {
    material.userData._wallWeatherUniform = { value: clamped };
  } else {
    material.userData._wallWeatherUniform.value = clamped;
  }

  if (material.userData._hasSaltlineWallHook) {
    return material;
  }

  material.userData._hasSaltlineWallHook = true;
  material.customProgramCacheKey = SALTLINE_WALL_PROGRAM_KEY;
  material.onBeforeCompile = (shader) => {
    const uWeather = material.userData._wallWeatherUniform || (material.userData._wallWeatherUniform = { value: clamped });
    uWeather.value = material.userData.wallWeatherStrength ?? clamped;
    shader.uniforms.uSaltlineWallWeather = uWeather;

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        '#include <common>\nvarying vec3 vSlWallWorldPos;'
      )
      .replace(
        '#include <worldpos_vertex>',
        '#include <worldpos_vertex>\nvSlWallWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;'
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
uniform float uSaltlineWallWeather;
varying vec3 vSlWallWorldPos;
float slWallHash(vec2 p) {
  p = fract(p * vec2(127.1, 311.7));
  p += dot(p, p + 34.23);
  return fract(p.x * p.y);
}
float slWallNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(slWallHash(i), slWallHash(i + vec2(1.0, 0.0)), f.x),
    mix(slWallHash(i + vec2(0.0, 1.0)), slWallHash(i + vec2(1.0, 1.0)), f.x),
    f.y
  );
}`
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
float slSplashBand = smoothstep(1.25, 0.0, max(0.0, vSlWallWorldPos.y)) * uSaltlineWallWeather;
float slBaseCreviceAO = smoothstep(0.42, 0.0, max(0.0, vSlWallWorldPos.y)) * uSaltlineWallWeather;
float slStreakCoord = vSlWallWorldPos.x + vSlWallWorldPos.z;
float slStreakBroad = slWallNoise(vec2(slStreakCoord * 2.1, vSlWallWorldPos.y * 0.24));
float slStreakFine = slWallNoise(vec2(slStreakCoord * 6.4 + 3.7, vSlWallWorldPos.y * 0.11));
float slRainDrip = smoothstep(0.24, 0.85, slStreakBroad * 0.58 + slStreakFine * 0.42);
float slMacroGrime = (slWallNoise(vSlWallWorldPos.xz * 0.16 + vSlWallWorldPos.y * 0.09) - 0.5) * 0.14 * uSaltlineWallWeather;
diffuseColor.rgb *= (1.0 + slMacroGrime) * mix(1.0, 0.66, clamp(slSplashBand * 0.76 + slBaseCreviceAO * 0.24, 0.0, 1.0)) * mix(1.0, 0.82, slRainDrip * uSaltlineWallWeather * 0.68);`
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
float slSplashRough = smoothstep(1.15, 0.0, max(0.0, vSlWallWorldPos.y)) * uSaltlineWallWeather;
float slDripRough = slWallNoise(vec2((vSlWallWorldPos.x + vSlWallWorldPos.z) * 2.1, vSlWallWorldPos.y * 0.24)) * uSaltlineWallWeather;
roughnessFactor = clamp(mix(roughnessFactor, 0.20, clamp(slSplashRough * 0.62 + slDripRough * 0.16, 0.0, 0.85)), 0.12, 1.0);`
      );
  };
  material.needsUpdate = true;
  return material;
}

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
  const cap = game?.quality?.envMapSize === 0 ? 0.35 : null;
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
    if (cap !== null && o.metalness > cap) {
      m.userData = m.userData || {};
      m.userData._origMetalness = o.metalness;
      m.metalness = cap;
    } else {
      m.metalness = o.metalness;
      if (m.userData) delete m.userData._origMetalness;
    }
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
    const noEnv = !preset.envMapSize;
    await Promise.all([
      ...ids.map(async (id) => loaded.set(id, await assets.loadTextureSet(id, preset))),
      !noEnv ? loadMacroGrimeModule() : Promise.resolve(null)
    ]);
    if (isStale()) return result;
    result.sets = ids.filter((id) => loaded.get(id));
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
      if (!noEnv && m.userData?._macroGrimeSpec?.enabled && !m.userData._hasMacroGrimeHook) {
        invokeWorldMacroGrime(m, m.userData._macroGrimeSpec);
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
      assets.disposeTexturesNotMatching(preset, [...result.sets, 'decals']);
    }
  } catch (err) {
    console.warn('[surface] PBR upgrade failed, procedural materials kept:', err?.message || err);
    revertPbrSlots(game);
  }
  return result;
}
