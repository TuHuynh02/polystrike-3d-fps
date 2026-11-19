// Adapted from StarKnightt/counter-strike-in-browser (MIT License, Copyright (c) 2026 StarKnightt)
import * as THREE from '../three.js';

/**
 * World-space macro grime mottling: breaks up repeated PBR texture tiling over ~20m world space
 * on walls, floors, pillars, and platforms while chaining cleanly with existing `onBeforeCompile`
 * hooks (such as Saltline wet-floor and wall-weathering shaders) without clobbering uniforms or cache keys.
 */
let cachedGrimeTex = null;

function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Returns a cached 512x512 seamless multi-scale mottling CanvasTexture (linear data, RepeatWrapping).
 * Returns null safely in non-DOM headless Node environments.
 */
export function getWorldMacroGrimeTexture(size = 512) {
  if (cachedGrimeTex) return cachedGrimeTex;
  if (typeof document === 'undefined') return null;

  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext?.('2d');
  if (!ctx) return null;

  ctx.fillStyle = '#808080';
  ctx.fillRect(0, 0, size, size);

  const rnd = mulberry32(1337);
  const ratio = size / 512;
  const layers = [
    [18, 140 * ratio, 0.10],
    [60, 60 * ratio, 0.08],
    [220, 22 * ratio, 0.06]
  ];
  const wrapOffsets = [
    [0, 0],
    [size, 0],
    [-size, 0],
    [0, size],
    [0, -size],
    [size, size],
    [-size, -size],
    [size, -size],
    [-size, size]
  ];

  for (let l = 0; l < layers.length; l++) {
    const [count, rad, alpha] = layers[l];
    for (let i = 0; i < count; i++) {
      const x = rnd() * size;
      const y = rnd() * size;
      const r = rad * (0.6 + rnd() * 0.8);
      const dark = rnd() < 0.55;
      const tone = dark ? 0 : 255;
      const inner = `rgba(${tone},${tone},${tone},${alpha})`;
      for (let w = 0; w < wrapOffsets.length; w++) {
        const ox = wrapOffsets[w][0];
        const oy = wrapOffsets[w][1];
        const cx = x + ox;
        const cy = y + oy;
        if (cx + r < 0 || cx - r > size || cy + r < 0 || cy - r > size) continue;
        const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
        g.addColorStop(0, inner);
        g.addColorStop(1, 'rgba(128,128,128,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.NoColorSpace;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  cachedGrimeTex = tex;
  return tex;
}

/**
 * Hooks world-space 3-octave macro grime mottling, lower wall dust skirts, upper-wall sun bleaching,
 * vertical runoff variation, and upward-face dust settling onto a MeshStandardMaterial.
 * Chains cleanly after any existing `onBeforeCompile` and `customProgramCacheKey`.
 */
export function applyWorldMacroGrime(
  material,
  { scale = 0.052, strength = 0.24, dustTop = 0.65, drips = 0.55 } = {}
) {
  if (!material || !material.isMeshStandardMaterial) return material;

  const clampedStrength = Math.max(0, Math.min(1, Number(strength) || 0));
  const clampedScale = Math.max(0.005, Number(scale) || 0.052);
  const clampedDust = Math.max(0, Math.min(1, dustTop == null ? 0.65 : Number(dustTop) || 0));
  const clampedDrips = Math.max(0, Math.min(1, drips == null ? 0.55 : Number(drips) || 0));

  material.userData = material.userData || {};
  material.userData.worldMacroGrimeStrength = clampedStrength;
  material.userData.worldMacroGrimeScale = clampedScale;

  // Update uniforms in-place if our wrapper is still the active onBeforeCompile hook
  if (
    material.userData._hasWorldMacroGrime &&
    material.userData._macroGrimeCompileFn &&
    material.onBeforeCompile === material.userData._macroGrimeCompileFn &&
    material.userData._macroGrimeUniforms
  ) {
    material.userData._macroGrimeUniforms.uMacroGrimeStrength.value = clampedStrength;
    material.userData._macroGrimeUniforms.uMacroGrimeScale.value = clampedScale;
    material.userData._macroGrimeUniforms.uMacroGrimeOpts.value.set(clampedDust, clampedDrips);
    return material;
  }

  if (clampedStrength <= 0.001) {
    return material;
  }

  const grimeTex = getWorldMacroGrimeTexture();
  if (!grimeTex) return material;

  const rawPrevCompile = material.onBeforeCompile;
  const hasCustomPrevCompile =
    typeof rawPrevCompile === 'function' && rawPrevCompile !== THREE.Material.prototype.onBeforeCompile;
  const rawPrevCacheKey = material.customProgramCacheKey;
  const hasCustomPrevKey =
    typeof rawPrevCacheKey === 'function' && rawPrevCacheKey !== THREE.Material.prototype.customProgramCacheKey;

  const uMap = { value: grimeTex };
  const uStrength = { value: clampedStrength };
  const uScale = { value: clampedScale };
  const uOpts = { value: new THREE.Vector2(clampedDust, clampedDrips) };
  material.userData._macroGrimeUniforms = {
    uMacroGrimeMap: uMap,
    uMacroGrimeStrength: uStrength,
    uMacroGrimeScale: uScale,
    uMacroGrimeOpts: uOpts
  };
  material.userData._hasWorldMacroGrime = true;

  material.customProgramCacheKey = function macroGrimeProgramCacheKey() {
    const base = hasCustomPrevKey ? String(rawPrevCacheKey.call(this) || '') : '';
    return base ? `${base}|macro_grime_v1` : 'macro_grime_v1';
  };

  const wrappedCompile = function macroGrimeOnBeforeCompile(shader, renderer) {
    if (hasCustomPrevCompile) {
      rawPrevCompile.call(this, shader, renderer);
    }

    uStrength.value = material.userData.worldMacroGrimeStrength ?? clampedStrength;
    uScale.value = material.userData.worldMacroGrimeScale ?? clampedScale;
    shader.uniforms.uMacroGrimeMap = uMap;
    shader.uniforms.uMacroGrimeStrength = uStrength;
    shader.uniforms.uMacroGrimeScale = uScale;
    shader.uniforms.uMacroGrimeOpts = uOpts;

    const vertAnchor = shader.vertexShader.includes('#include <worldpos_vertex>')
      ? '#include <worldpos_vertex>'
      : '#include <begin_vertex>';

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
varying vec3 vMacroGrimePos;
varying vec3 vMacroGrimeNorm;`
      )
      .replace(
        vertAnchor,
        `${vertAnchor}
{
  vec4 mgWp = vec4( ${vertAnchor === '#include <worldpos_vertex>' ? 'transformed' : 'position'}, 1.0 );
  vec3 mgWn = normal;
  #ifdef USE_INSTANCING
    mgWp = instanceMatrix * mgWp;
    mgWn = mat3( instanceMatrix ) * mgWn;
  #endif
  mgWp = modelMatrix * mgWp;
  vMacroGrimePos = mgWp.xyz;
  vMacroGrimeNorm = normalize( mat3( modelMatrix ) * mgWn + vec3( 0.0, 1e-5, 0.0 ) );
}`
      );

    const fragAnchor = shader.fragmentShader.includes('#include <map_fragment>')
      ? '#include <map_fragment>'
      : '#include <color_fragment>';

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
uniform sampler2D uMacroGrimeMap;
uniform float uMacroGrimeStrength;
uniform float uMacroGrimeScale;
uniform vec2 uMacroGrimeOpts;
varying vec3 vMacroGrimePos;
varying vec3 vMacroGrimeNorm;`
      )
      .replace(
        fragAnchor,
        `${fragAnchor}
{
  vec3 mgN = normalize( vMacroGrimeNorm + vec3( 0.0, 1e-5, 0.0 ) );
  float mgUp = abs( mgN.y );
  vec2 mgPH = vMacroGrimePos.xz;
  vec2 mgPV = vec2( vMacroGrimePos.x + vMacroGrimePos.z, vMacroGrimePos.y * 1.55 );
  mat2 mgRot1 = mat2( 0.8, 0.6, -0.6, 0.8 );
  mat2 mgRot2 = mat2( 0.28, 0.96, -0.96, 0.28 );
  float mgGH = texture2D( uMacroGrimeMap, mgPH * uMacroGrimeScale ).r * 0.45
             + texture2D( uMacroGrimeMap, mgRot1 * mgPH * ( uMacroGrimeScale * 2.5 ) + 0.37 ).r * 0.30
             + texture2D( uMacroGrimeMap, mgRot2 * mgPH * ( uMacroGrimeScale * 4.8 ) + 0.71 ).r * 0.25;
  float mgGV = texture2D( uMacroGrimeMap, mgPV * ( uMacroGrimeScale * 1.06 ) ).r * 0.45
             + texture2D( uMacroGrimeMap, mgRot1 * mgPV * ( uMacroGrimeScale * 2.15 ) + 0.61 ).r * 0.30
             + texture2D( uMacroGrimeMap, mgRot2 * mgPV * ( uMacroGrimeScale * 4.4 ) + 0.13 ).r * 0.25;
  float mgG = mix( mgGV, mgGH, step( 0.5, mgUp ) );

  float mgSkirt = 0.0;
  float mgBleach = 0.0;
  float mgDrip = 0.0;
  if ( mgUp < 0.5 ) {
    float mgY = max( 0.0, vMacroGrimePos.y );
    mgSkirt = ( 1.0 - smoothstep( 0.0, 1.15 + 0.65 * ( mgG - 0.5 ), mgY ) ) * 0.14 * uMacroGrimeOpts.y;
    mgBleach = smoothstep( 3.0, 7.0, mgY ) * 0.06;
    float mgStreak = texture2D( uMacroGrimeMap, vec2( ( vMacroGrimePos.x + vMacroGrimePos.z ) * 0.85 + mgN.x * 0.28, mgY * 0.024 ) ).r;
    float mgRuns = smoothstep( 0.56, 0.72, mgStreak );
    float mgZone = smoothstep( 0.48, 0.62, texture2D( uMacroGrimeMap, vec2( vMacroGrimePos.x + vMacroGrimePos.z, mgY ) * 0.075 + 0.23 ).r );
    mgDrip = mgRuns * mgZone * smoothstep( 1.0, 3.0, mgY ) * 0.13 * uMacroGrimeOpts.y;
  }

  diffuseColor.rgb *= mix( 1.0, 0.72 + 0.56 * mgG, clamp( uMacroGrimeStrength * 2.0, 0.0, 1.0 ) ) * ( 1.0 - mgSkirt ) * ( 1.0 - mgDrip );
  diffuseColor.rgb = mix( diffuseColor.rgb, vec3( dot( diffuseColor.rgb, vec3( 0.333 ) ) ) * 1.06 + 0.015, mgBleach );

  float mgDust = smoothstep( 0.72, 0.95, mgN.y ) * ( 0.28 + 0.44 * mgG ) * uMacroGrimeOpts.x;
  vec3 mgSand = vec3( 0.62, 0.54, 0.42 );
  diffuseColor.rgb = mix( diffuseColor.rgb, mix( diffuseColor.rgb, mgSand, 0.42 ), mgDust * 0.45 * uMacroGrimeStrength );
}`
      );
  };

  material.userData._macroGrimeCompileFn = wrappedCompile;
  material.onBeforeCompile = wrappedCompile;
  material.needsUpdate = true;
  return material;
}
