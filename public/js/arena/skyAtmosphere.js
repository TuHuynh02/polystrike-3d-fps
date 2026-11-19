// Lighting/atmosphere contrast & horizon fog adapted in part from StarKnightt/counter-strike-in-browser (MIT License, Copyright (c) 2026 StarKnightt)
import * as THREE from '../three.js';

/**
 * Single source of truth for per-map sunlit FPS atmospheric palettes, directional sun angles,
 * hemisphere/rim fill, and distance exponential fog across all 8 arenas.
 */
const MAP_ATMOSPHERE_PRESETS = {
  cargo_dock: {
    zenith: '#173d6b',
    mid: '#5c8ab8',
    horizon: '#dfd0b8',
    ground: '#253545',
    sunColor: '#fff4d6',
    cloudColor: '#faf6ee',
    cloudShadow: '#6d85a2',
    cloudDensity: 0.48,
    sunPos: [64, 52, 38],
    dirColor: 0xfff3de,
    dirIntensity: 4.1,
    hemiSky: 0x8ec5fc,
    hemiGround: 0x36332f,
    hemiIntensity: 0.52,
    rimColor: 0x93c5fd,
    rimIntensity: 0.28,
    citadelColor: 0xe5a024,
    citadelIntensity: 1.85,
    envIntensity: 0.50,
    fogHex: 0x8ea3b8,
    fogDensity: 0.0021,
    waterDeep: 0x0b2538,
    waterShallow: 0x164a66,
    mountainHex: 0x4b647d,
    skylineTint: 0xcbd7e4,
    dustHex: 0xf4ebd8
  },
  cyber_citadel: {
    zenith: '#1a4a85',
    mid: '#5d96ce',
    horizon: '#d8e7f4',
    ground: '#2b3440',
    sunColor: '#fff9ea',
    cloudColor: '#ffffff',
    cloudShadow: '#7b94af',
    cloudDensity: 0.44,
    sunPos: [64, 52, 38],
    dirColor: 0xfff8ed,
    dirIntensity: 3.9,
    hemiSky: 0x8ec5fc,
    hemiGround: 0x36332f,
    hemiIntensity: 0.54,
    rimColor: 0x93c5fd,
    rimIntensity: 0.32,
    citadelColor: 0xe5a024,
    citadelIntensity: 1.9,
    envIntensity: 0.50,
    fogHex: 0x9eb8cf,
    fogDensity: 0.0019,
    waterDeep: 0x0e2a40,
    waterShallow: 0x1b4e6e,
    mountainHex: 0x526b84,
    skylineTint: 0xd0dce8,
    dustHex: 0xeaf2fa
  },
  crossfire_plus: {
    zenith: '#1d4d82',
    mid: '#6498c8',
    horizon: '#dbe6f0',
    ground: '#2f3842',
    sunColor: '#fff6e3',
    cloudColor: '#fcfdff',
    cloudShadow: '#7c92a8',
    cloudDensity: 0.42,
    sunPos: [64, 52, 38],
    dirColor: 0xfff6e8,
    dirIntensity: 3.9,
    hemiSky: 0x8ec5fc,
    hemiGround: 0x36332f,
    hemiIntensity: 0.54,
    rimColor: 0x93c5fd,
    rimIntensity: 0.32,
    citadelColor: 0xf97316,
    citadelIntensity: 1.85,
    envIntensity: 0.50,
    fogHex: 0x9eb8cf,
    fogDensity: 0.0020,
    waterDeep: 0x0f2a3f,
    waterShallow: 0x1d4d68,
    mountainHex: 0x556c82,
    skylineTint: 0xd2dbe3,
    dustHex: 0xe8eff5
  },
  desert_outpost: {
    zenith: '#3b73b9',
    mid: '#7baad8',
    horizon: '#ede2ce',
    skyTop: '#3b73b9',
    skyMid: '#7baad8',
    skyHorizon: '#ede2ce',
    ground: '#a8916c',
    sunColor: '#ffe6c8',
    sunIntensity: 5.2,
    cloudColor: '#fffdf7',
    cloudShadow: '#9cb4cc',
    cloudDensity: 0.22,
    sunPos: [78, 80, 62],
    dirColor: 0xffe6c8,
    dirIntensity: 5.2,
    hemiSky: 0x8aa6cf,
    hemiGround: 0x7c7464,
    hemiIntensity: 0.48,
    rimColor: 0x9dbbe0,
    rimIntensity: 0.14,
    citadelColor: 0xf59e0b,
    citadelIntensity: 0.65,
    envIntensity: 0.38,
    fogHex: 0xdfd4be,
    fogDensity: 0.0042,
    bgColor: 0xc5d6e6,
    waterDeep: 0x1b3446,
    waterShallow: 0x2c5266,
    mountainHex: 0x9c8b78,
    skylineTint: 0xe6d6bc,
    dustHex: 0xf2e4cc
  },
  killhouse_cqb: {
    zenith: '#214870',
    mid: '#6e92b4',
    horizon: '#dcd0be',
    ground: '#38342e',
    sunColor: '#fff0d8',
    cloudColor: '#f7f3eb',
    cloudShadow: '#828b94',
    cloudDensity: 0.36,
    sunPos: [64, 52, 38],
    dirColor: 0xfff2dc,
    dirIntensity: 3.9,
    hemiSky: 0x94c2ea,
    hemiGround: 0x3b3630,
    hemiIntensity: 0.54,
    rimColor: 0xa5b9cc,
    rimIntensity: 0.32,
    citadelColor: 0xf59e0b,
    citadelIntensity: 1.9,
    envIntensity: 0.50,
    fogHex: 0xaeb6bf,
    fogDensity: 0.0021,
    waterDeep: 0x112b3d,
    waterShallow: 0x204d66,
    mountainHex: 0x626e78,
    skylineTint: 0xd4d6d8,
    dustHex: 0xf0e6d6
  },
  fy_iceworld: {
    zenith: '#14427a',
    mid: '#4e8ec8',
    horizon: '#dcf0ff',
    ground: '#2b4259',
    sunColor: '#ffffff',
    cloudColor: '#f8fcff',
    cloudShadow: '#7ba2c7',
    cloudDensity: 0.42,
    sunPos: [64, 52, 38],
    dirColor: 0xf8fbff,
    dirIntensity: 3.9,
    hemiSky: 0x9ad0ff,
    hemiGround: 0x324558,
    hemiIntensity: 0.56,
    rimColor: 0xbae6fd,
    rimIntensity: 0.34,
    citadelColor: 0x38bdf8,
    citadelIntensity: 1.8,
    envIntensity: 0.52,
    fogHex: 0xa6cbe8,
    fogDensity: 0.0020,
    waterDeep: 0x0b2a42,
    waterShallow: 0x1c5980,
    mountainHex: 0x6c8ca8,
    skylineTint: 0xdcebf7,
    dustHex: 0xe6f5ff
  },
  neon_lab: {
    zenith: '#0a142a',
    mid: '#1b2c4e',
    horizon: '#6b4d5a',
    ground: '#101828',
    sunColor: '#ffd4a3',
    cloudColor: '#9fb4d1',
    cloudShadow: '#283652',
    cloudDensity: 0.46,
    sunPos: [64, 42, 38],
    dirColor: 0xffdfc0,
    dirIntensity: 3.25,
    hemiSky: 0x7094d6,
    hemiGround: 0x222634,
    hemiIntensity: 0.56,
    rimColor: 0x7dd3fc,
    rimIntensity: 0.46,
    citadelColor: 0x38bdf8,
    citadelIntensity: 2.4,
    envIntensity: 0.68,
    fogHex: 0x162238,
    fogDensity: 0.0025,
    waterDeep: 0x081729,
    waterShallow: 0x13304d,
    mountainHex: 0x1b2740,
    skylineTint: 0x8aa0bc,
    dustHex: 0xcbe4ff
  },
  arena_duel: {
    zenith: '#0c152b',
    mid: '#203052',
    horizon: '#7a5258',
    ground: '#121828',
    sunColor: '#ffd19c',
    cloudColor: '#a8b7ce',
    cloudShadow: '#2b3650',
    cloudDensity: 0.44,
    sunPos: [64, 44, 38],
    dirColor: 0xffe2c4,
    dirIntensity: 3.3,
    hemiSky: 0x789ad8,
    hemiGround: 0x252433,
    hemiIntensity: 0.56,
    rimColor: 0x93c5fd,
    rimIntensity: 0.45,
    citadelColor: 0xf43f5e,
    citadelIntensity: 2.25,
    envIntensity: 0.68,
    fogHex: 0x162238,
    fogDensity: 0.0024,
    waterDeep: 0x091729,
    waterShallow: 0x15314d,
    mountainHex: 0x212942,
    skylineTint: 0x94a3b8,
    dustHex: 0xfde2d4
  }
};

export function getMapAtmospherePreset(mapId, theme = {}) {
  if (mapId && MAP_ATMOSPHERE_PRESETS[mapId]) {
    return MAP_ATMOSPHERE_PRESETS[mapId];
  }
  if (theme.floorBase === '#27170c') return MAP_ATMOSPHERE_PRESETS.desert_outpost;
  if (theme.floorBase === '#0b0f1e') return MAP_ATMOSPHERE_PRESETS.neon_lab;
  return MAP_ATMOSPHERE_PRESETS.cargo_dock;
}

export function getMapEnvironmentIntensity(mapId, theme = {}) {
  const preset = getMapAtmospherePreset(mapId, theme);
  return preset.envIntensity ?? 0.50;
}

function sunUvFromPos(sunPos) {
  const len = Math.hypot(sunPos[0], sunPos[1], sunPos[2]) || 1;
  const sx = sunPos[0] / len;
  const sy = sunPos[1] / len;
  const sz = sunPos[2] / len;
  const u = Math.atan2(sz, sx) / (Math.PI * 2) + 0.5;
  const v = Math.asin(Math.max(-1, Math.min(1, sy))) / Math.PI + 0.5;
  return { x: u * 512, y: (1 - v) * 256, sx, sy, sz };
}

/**
 * Generates a procedural equirectangular IBL environment map matched to the active map's sunlit sky,
 * directional solar specular lobe, and crisp horizon bounce so PBR gunmetal, optics, water & damp tarmac gleam.
 */
export function createProceduralEnvironmentMap(game, theme = {}) {
  if (typeof document === 'undefined') return null;
  const preset = getMapAtmospherePreset(game?.currentMapId, theme);
  const envSize = Math.max(64, Math.min(512, game?.quality?.envMapSize || 512));
  const canvas = document.createElement('canvas');
  canvas.width = envSize;
  canvas.height = envSize / 2;
  const ctx = canvas.getContext('2d');
  ctx.scale?.(envSize / 512, envSize / 512);

  // Vertical sky-to-ground equirectangular gradient matched to map sky & ground bounce
  const isDesert = game?.currentMapId === 'desert_outpost' || theme.floorBase === '#27170c';
  const grad = ctx.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0.0, preset.zenith);
  grad.addColorStop(0.28, preset.mid);
  grad.addColorStop(0.47, preset.horizon);
  grad.addColorStop(0.50, preset.sunColor);
  grad.addColorStop(0.54, preset.mountainHex ? `#${preset.mountainHex.toString(16).padStart(6, '0')}` : '#334155');
  grad.addColorStop(0.75, preset.ground);
  grad.addColorStop(1.0, isDesert ? '#6d5840' : '#0f141c');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 512, 256);

  // High-contrast solar specular lobe aligned with the scene directional sun
  const sunUv = sunUvFromPos(preset.sunPos);
  const sunGlow = ctx.createRadialGradient(sunUv.x, sunUv.y, 2, sunUv.x, sunUv.y, 96);
  sunGlow.addColorStop(0.0, 'rgba(255, 255, 250, 1.0)');
  sunGlow.addColorStop(0.14, 'rgba(255, 244, 204, 0.94)');
  sunGlow.addColorStop(0.42, 'rgba(253, 212, 138, 0.36)');
  sunGlow.addColorStop(1.0, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = sunGlow;
  ctx.fillRect(0, 0, 512, 210);

  // Crisp atmospheric horizon bounce band for clean Fresnel sheen on weapons and wet concrete
  const horizonBand = ctx.createLinearGradient(0, 112, 0, 146);
  horizonBand.addColorStop(0.0, 'rgba(255, 255, 255, 0.0)');
  horizonBand.addColorStop(0.5, preset.horizon);
  horizonBand.addColorStop(1.0, 'rgba(15, 23, 42, 0.0)');
  ctx.globalAlpha = 0.42;
  ctx.fillStyle = horizonBand;
  ctx.fillRect(0, 112, 512, 34);
  ctx.globalAlpha = 1.0;

  // Secondary cool sky bounce lobe opposite the sun for crisp gunmetal rim reflections
  const oppX = (sunUv.x + 256) % 512;
  const coolBounce = ctx.createRadialGradient(oppX, 82, 8, oppX, 82, 116);
  coolBounce.addColorStop(0.0, 'rgba(206, 232, 255, 0.52)');
  coolBounce.addColorStop(0.56, 'rgba(96, 165, 250, 0.22)');
  coolBounce.addColorStop(1.0, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = coolBounce;
  ctx.fillRect(0, 0, 512, 192);

  // Subtle industrial silhouette breaks along the equator for realistic metallic reflections
  ctx.fillStyle = 'rgba(15, 23, 42, 0.32)';
  for (let x = 0; x < 512; x += 24) {
    const h = 7 + ((x * 17) % 16);
    ctx.fillRect(x, 128 - h, 18, h);
  }

  const rawEnvTex = new THREE.CanvasTexture(canvas);
  rawEnvTex.mapping = THREE.EquirectangularReflectionMapping;
  if ('colorSpace' in rawEnvTex && THREE.SRGBColorSpace) {
    rawEnvTex.colorSpace = THREE.SRGBColorSpace;
  }

  const renderer = game?.renderer;
  const canPmrem = Boolean(
    renderer?.isWebGLRenderer &&
      !renderer.__fakeGL &&
      typeof THREE.PMREMGenerator === 'function' &&
      (renderer.extensions?.has?.('EXT_color_buffer_float') ||
        renderer.extensions?.has?.('EXT_color_buffer_half_float') ||
        (!renderer.capabilities?.isWebGL2 && renderer.extensions?.has?.('WEBGL_color_buffer_float')))
  );
  if (canPmrem) {
    try {
      const pmrem = new THREE.PMREMGenerator(renderer);
      pmrem.compileEquirectangularShader?.();
      const envRT = pmrem.fromEquirectangular(rawEnvTex);
      pmrem.dispose();
      rawEnvTex.dispose();
      game.arenaTextures.add(envRT);
      return envRT.texture;
    } catch {
      // Fallback to raw equirectangular texture if PMREM fails
    }
  }

  game.arenaTextures.add(rawEnvTex);
  return rawEnvTex;
}

function createHarborWaterBumpTexture(game) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#808080';
  ctx.fillRect(0, 0, 256, 256);

  // Multi-directional harbor chop & wind ripples (tileable sinusoidal interference)
  for (let y = 0; y < 256; y += 2) {
    const v = (y / 256) * Math.PI * 2;
    for (let x = 0; x < 256; x += 2) {
      const u = (x / 256) * Math.PI * 2;
      const w1 = Math.sin(u * 4 + v * 2);
      const w2 = Math.cos(u * 3 - v * 5 + 1.1);
      const w3 = Math.sin(u * 9 + v * 7 - 0.6) * 0.5;
      const val = Math.max(0, Math.min(255, Math.round(128 + (w1 * 0.42 + w2 * 0.36 + w3 * 0.22) * 76)));
      ctx.fillStyle = `rgb(${val},${val},${val})`;
      ctx.fillRect(x, y, 2, 2);
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(30, 30);
  game.arenaTextures.add(tex);
  return tex;
}

/**
 * Builds North-Sea / coastal harbor water surrounding the arena sea-wall on Medium/High tiers.
 * Uses a single 8-triangle hollow ring BufferGeometry (24 indices, 1 draw call) with Fresnel sky reflection,
 * directional solar glitter path, and animated quay-wall foam.
 */
export function buildSaltlineHarborWater(game, theme = {}, halfSize = 60) {
  const isDesert = theme.floorBase === '#27170c';
  const envEnabled = (game?.quality?.envMapSize ?? 512) > 0;
  if (isDesert || !envEnabled) {
    game.harborWaterUniform = null;
    return null;
  }

  const preset = getMapAtmospherePreset(game?.currentMapId, theme);
  const inner = halfSize + 0.8;
  const outer = 296;
  const waterY = -1.45;

  // 4 quads forming a hollow ring [outer..-inner, inner..outer] around the playable quay
  const quads = [
    [-outer, -outer, outer, -inner],
    [-outer, inner, outer, outer],
    [-outer, -inner, -inner, inner],
    [inner, -inner, outer, inner]
  ];

  const positions = new Float32Array(quads.length * 4 * 3);
  const normals = new Float32Array(quads.length * 4 * 3);
  const uvs = new Float32Array(quads.length * 4 * 2);
  const indices = [];
  const uvScale = 1 / 18;

  for (let q = 0; q < quads.length; q++) {
    const [x0, z0, x1, z1] = quads[q];
    const baseV = q * 4;
    const corners = [
      [x0, z0],
      [x0, z1],
      [x1, z1],
      [x1, z0]
    ];
    for (let c = 0; c < 4; c++) {
      const [cx, cz] = corners[c];
      const vi = (baseV + c) * 3;
      const ui = (baseV + c) * 2;
      positions[vi] = cx;
      positions[vi + 1] = waterY;
      positions[vi + 2] = cz;
      normals[vi] = 0;
      normals[vi + 1] = 1;
      normals[vi + 2] = 0;
      uvs[ui] = cx * uvScale;
      uvs[ui + 1] = cz * uvScale;
    }
    indices.push(baseV, baseV + 1, baseV + 2, baseV, baseV + 2, baseV + 3);
  }

  const waterGeo = new THREE.BufferGeometry();
  waterGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  waterGeo.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  waterGeo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  waterGeo.setIndex(indices);
  game.arenaGeometries.add(waterGeo);

  const waterBump = createHarborWaterBumpTexture(game);
  const uSeaTime = { value: 0 };
  const sunDirVec = new THREE.Vector3(preset.sunPos[0], preset.sunPos[1], preset.sunPos[2]).normalize();
  const deepCol = new THREE.Color(preset.waterDeep);
  const shallowCol = new THREE.Color(preset.waterShallow);
  const skyHorizCol = new THREE.Color(preset.horizon);
  const sunTintCol = new THREE.Color(preset.sunColor);

  const waterMat = new THREE.MeshStandardMaterial({
    color: preset.waterDeep,
    roughness: 0.11,
    metalness: 0.72,
    bumpMap: waterBump,
    bumpScale: 0.18,
    envMapIntensity: 1.55
  });

  waterMat.customProgramCacheKey = () => 'saltline-harbor-water-v2';
  waterMat.onBeforeCompile = (shader) => {
    shader.uniforms.uSaltlineSeaTime = uSeaTime;
    shader.uniforms.uSaltlineInnerQuay = { value: inner };
    shader.uniforms.uSaltlineSunDir = { value: sunDirVec };
    shader.uniforms.uSaltlineWaterDeep = { value: deepCol };
    shader.uniforms.uSaltlineWaterShallow = { value: shallowCol };
    shader.uniforms.uSaltlineSkyColor = { value: skyHorizCol };
    shader.uniforms.uSaltlineSunColor = { value: sunTintCol };

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
varying vec3 vSaltlineSeaWorldPos;`
      )
      .replace(
        '#include <worldpos_vertex>',
        `#include <worldpos_vertex>
vec4 slSeaWp = vec4(transformed, 1.0);
#ifdef USE_INSTANCING
  slSeaWp = instanceMatrix * slSeaWp;
#endif
slSeaWp = modelMatrix * slSeaWp;
vSaltlineSeaWorldPos = slSeaWp.xyz;`
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
uniform float uSaltlineSeaTime;
uniform float uSaltlineInnerQuay;
uniform vec3 uSaltlineSunDir;
uniform vec3 uSaltlineWaterDeep;
uniform vec3 uSaltlineWaterShallow;
uniform vec3 uSaltlineSkyColor;
uniform vec3 uSaltlineSunColor;
varying vec3 vSaltlineSeaWorldPos;`
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
float slWaveA = sin(vSaltlineSeaWorldPos.x * 0.36 + uSaltlineSeaTime * 1.45 + vSaltlineSeaWorldPos.z * 0.21);
float slWaveB = cos(vSaltlineSeaWorldPos.z * 0.44 - uSaltlineSeaTime * 1.15 - vSaltlineSeaWorldPos.x * 0.24);
float slWaveC = sin((vSaltlineSeaWorldPos.x - vSaltlineSeaWorldPos.z) * 0.68 + uSaltlineSeaTime * 2.1);
float slChop = clamp(0.5 + 0.5 * (slWaveA * 0.45 + slWaveB * 0.35 + slWaveC * 0.20), 0.0, 1.0);
float slQuayDist = max(abs(vSaltlineSeaWorldPos.x), abs(vSaltlineSeaWorldPos.z)) - uSaltlineInnerQuay;
float slNearQuay = 1.0 - smoothstep(0.0, 5.2, slQuayDist);
float slFoamBand = (1.0 - smoothstep(0.0, 2.8, slQuayDist)) * smoothstep(0.36, 0.84, slChop + 0.14 * sin(slQuayDist * 2.2 - uSaltlineSeaTime * 2.6));
vec3 slBaseSea = mix(uSaltlineWaterDeep, uSaltlineWaterShallow, slNearQuay * 0.65 + slChop * 0.32);
diffuseColor.rgb = mix(slBaseSea, vec3(0.76, 0.84, 0.88), slFoamBand * 0.48);
roughnessFactor = clamp(mix(0.05, 0.22, slChop) + slFoamBand * 0.42, 0.04, 0.72);`
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
vec3 slViewDir = normalize(cameraPosition - vSaltlineSeaWorldPos);
float slSlopeX = cos(vSaltlineSeaWorldPos.x * 0.42 + uSaltlineSeaTime * 1.6) * 0.08 + cos((vSaltlineSeaWorldPos.x + vSaltlineSeaWorldPos.z) * 0.9 - uSaltlineSeaTime * 2.3) * 0.045;
float slSlopeZ = sin(vSaltlineSeaWorldPos.z * 0.46 - uSaltlineSeaTime * 1.3) * 0.08 + sin((vSaltlineSeaWorldPos.z - vSaltlineSeaWorldPos.x) * 0.95 + uSaltlineSeaTime * 2.0) * 0.045;
vec3 slWaveNorm = normalize(vec3(slSlopeX, 1.0, slSlopeZ));
float slFresnel = pow(1.0 - max(dot(slViewDir, slWaveNorm), 0.0), 4.0);
vec3 slRefl = reflect(-slViewDir, slWaveNorm);
float slSunSpec = pow(max(dot(slRefl, normalize(uSaltlineSunDir)), 0.0), 160.0);
float slSunPath = pow(max(dot(slRefl, normalize(uSaltlineSunDir)), 0.0), 22.0) * 0.16;
totalEmissiveRadiance += uSaltlineSkyColor * slFresnel * 0.22 + uSaltlineSunColor * (slSunSpec * 1.35 + slSunPath);`
      );
  };

  game.arenaMaterials.add(waterMat);
  const waterMesh = new THREE.Mesh(waterGeo, waterMat);
  waterMesh.name = 'saltlineHarborWater';
  waterMesh.receiveShadow = false;
  waterMesh.castShadow = false;
  waterMesh.frustumCulled = false;
  waterMesh.updateMatrix();
  waterMesh.matrixAutoUpdate = false;
  game.scene.add(waterMesh);
  game.skyObjects.push(waterMesh);
  game.saltlineHarborWater = waterMesh;
  game.harborWaterUniform = uSeaTime;
  return waterMesh;
}

function createSkylineFacadeTexture(game, isDesert = false) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');

  if (isDesert) {
    ctx.fillStyle = '#dfd0b4';
    ctx.fillRect(0, 0, 256, 256);

    ctx.strokeStyle = 'rgba(116, 94, 68, 0.22)';
    ctx.lineWidth = 2;
    for (let y = 0; y <= 256; y += 32) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(256, y);
      ctx.stroke();
    }
    for (let x = 0; x <= 256; x += 32) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, 256);
      ctx.stroke();
    }

    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        const wx = col * 32 + 6;
        const wy = row * 32 + 7;
        const seed = (row * 31 + col * 17) % 19;
        if (row % 3 === 0) {
          ctx.fillStyle = 'rgba(78, 59, 41, 0.72)';
          ctx.fillRect(wx, wy + 2, 20, 14);
          ctx.fillStyle = 'rgba(222, 202, 170, 0.35)';
          ctx.fillRect(wx + 2, wy + 5, 16, 2);
          ctx.fillRect(wx + 2, wy + 10, 16, 2);
        } else if (seed === 2 || seed === 11) {
          ctx.fillStyle = 'rgba(130, 152, 174, 0.42)';
          ctx.fillRect(wx + 2, wy + 1, 16, 15);
        } else {
          ctx.fillStyle = 'rgba(68, 50, 35, 0.75)';
          ctx.fillRect(wx + 1, wy, 18, 16);
          ctx.fillStyle = 'rgba(235, 221, 196, 0.45)';
          ctx.fillRect(wx - 1, wy + 16, 22, 3);
        }
      }
    }
  } else {
    ctx.fillStyle = '#222c38';
    ctx.fillRect(0, 0, 256, 256);

    ctx.strokeStyle = 'rgba(0, 0, 0, 0.42)';
    ctx.lineWidth = 2;
    for (let y = 0; y <= 256; y += 32) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(256, y);
      ctx.stroke();
    }
    for (let x = 0; x <= 256; x += 32) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, 256);
      ctx.stroke();
    }

    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        const wx = col * 32 + 5;
        const wy = row * 32 + 7;
        const seed = (row * 31 + col * 17) % 19;
        if (row % 3 === 0) {
          ctx.fillStyle = 'rgba(10, 14, 20, 0.78)';
          ctx.fillRect(wx, wy + 2, 22, 14);
          ctx.fillStyle = 'rgba(148, 163, 184, 0.22)';
          ctx.fillRect(wx + 2, wy + 5, 18, 2);
          ctx.fillRect(wx + 2, wy + 10, 18, 2);
        } else if (seed === 0 || seed === 5) {
          ctx.fillStyle = 'rgba(229, 160, 36, 0.45)';
          ctx.fillRect(wx, wy, 22, 16);
          ctx.fillStyle = 'rgba(254, 243, 199, 0.30)';
          ctx.fillRect(wx + 3, wy + 3, 16, 10);
        } else if (seed === 2 || seed === 11) {
          ctx.fillStyle = 'rgba(125, 211, 252, 0.24)';
          ctx.fillRect(wx, wy, 22, 16);
        } else {
          ctx.fillStyle = 'rgba(12, 18, 26, 0.72)';
          ctx.fillRect(wx, wy, 22, 16);
          ctx.fillStyle = 'rgba(148, 163, 184, 0.12)';
          ctx.fillRect(wx + 2, wy + 2, 8, 12);
        }
      }
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1, 2);
  game.arenaTextures.add(tex);
  return tex;
}

/**
 * Creates a physical atmospheric Rayleigh/Mie sky + animated FBM volumetric cloud layer ShaderMaterial.
 */
function createAtmosphericSkyMaterial(preset) {
  const uTime = { value: 0 };
  const sunDir = new THREE.Vector3(preset.sunPos[0], preset.sunPos[1], preset.sunPos[2]).normalize();

  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    fog: false,
    depthWrite: false,
    uniforms: {
      uTime,
      uSunDir: { value: sunDir },
      uZenithColor: { value: new THREE.Color(preset.zenith) },
      uMidColor: { value: new THREE.Color(preset.mid) },
      uHorizonColor: { value: new THREE.Color(preset.horizon) },
      uGroundColor: { value: new THREE.Color(preset.ground) },
      uSunColor: { value: new THREE.Color(preset.sunColor) },
      uCloudColor: { value: new THREE.Color(preset.cloudColor) },
      uCloudShadowColor: { value: new THREE.Color(preset.cloudShadow) },
      uCloudDensity: { value: preset.cloudDensity }
    },
    vertexShader: /* glsl */ `
      varying vec3 vWorldDir;
      void main() {
        vWorldDir = position;
        vec4 clipPos = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_Position = vec4(clipPos.xy, clipPos.w * 0.99999, clipPos.w);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform vec3 uSunDir;
      uniform vec3 uZenithColor;
      uniform vec3 uMidColor;
      uniform vec3 uHorizonColor;
      uniform vec3 uGroundColor;
      uniform vec3 uSunColor;
      uniform vec3 uCloudColor;
      uniform vec3 uCloudShadowColor;
      uniform float uCloudDensity;
      varying vec3 vWorldDir;

      float skyHash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
      }

      float skyNoise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        float a = skyHash(i);
        float b = skyHash(i + vec2(1.0, 0.0));
        float c = skyHash(i + vec2(0.0, 1.0));
        float d = skyHash(i + vec2(1.0, 1.0));
        return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
      }

      float skyFbm(vec2 p) {
        float v = 0.0;
        float amp = 0.5;
        mat2 rot = mat2(0.80, -0.60, 0.60, 0.80);
        for (int i = 0; i < 4; i++) {
          v += amp * skyNoise(p);
          p = rot * p * 2.04 + vec2(13.7, 7.1);
          amp *= 0.5;
        }
        return v;
      }

      void main() {
        vec3 dir = normalize(vWorldDir);
        float y = dir.y;
        float up = clamp(y, 0.0, 1.0);

        // Rayleigh-style sky dome gradient + warm horizon scatter
        vec3 sky = mix(uZenithColor, uMidColor, smoothstep(0.0, 0.52, 1.0 - up));
        sky = mix(sky, uHorizonColor, pow(1.0 - up, 2.8));

        // Lower hemisphere bounce below the horizon
        float below = smoothstep(0.015, -0.16, y);
        sky = mix(sky, uGroundColor, below);

        // Directional sun disc & Mie atmospheric scattering
        vec3 sunDir = normalize(uSunDir);
        float sunCos = max(dot(dir, sunDir), 0.0);
        float horizonMask = smoothstep(-0.04, 0.04, y);
        float mieWide = pow(sunCos, 6.0) * 0.24 + pow(sunCos, 28.0) * 0.36;
        float sunHalo = pow(sunCos, 140.0) * 0.95;
        float sunDisc = smoothstep(0.9986, 0.99965, sunCos) * 3.4;
        sky += uSunColor * (mieWide + sunHalo + sunDisc) * horizonMask;

        // Animated procedural volumetric cumulus cloud layer
        if (y > 0.008) {
          float proj = 1.0 / (y + 0.14);
          vec2 cloudUv = dir.xz * proj * 1.12 + vec2(uTime * 0.008, uTime * 0.004);
          float n = skyFbm(cloudUv);
          float threshold = clamp(1.0 - uCloudDensity, 0.22, 0.82);
          float cloudMask = smoothstep(threshold, threshold + 0.30, n);
          if (cloudMask > 0.002) {
            float shadowSample = skyFbm(cloudUv + sunDir.xz * 0.075);
            float selfLit = clamp(0.62 + (n - shadowSample) * 1.85 + pow(sunCos, 6.0) * 0.35, 0.0, 1.0);
            vec3 cloudCol = mix(uCloudShadowColor, uCloudColor, selfLit);
            cloudCol += uSunColor * pow(sunCos, 10.0) * 0.28 * (1.0 - cloudMask * 0.45);
            float horizonFade = smoothstep(0.01, 0.17, y);
            sky = mix(sky, cloudCol, cloudMask * horizonFade * 0.86);
          }
        }

        // Subtle 1-LSB screen dither to prevent gradient banding
        float dither = (fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) - 0.5) / 255.0;
        gl_FragColor = vec4(max(vec3(0.0), sky + dither), 1.0);
      }
    `
  });

  return { mat, uTime };
}

/**
 * Builds a single-draw-call 3D low-poly distant mountain silhouette ring around the perimeter
 * using aerial-perspective tinting so the horizon reads with depth and clean parallax.
 */
function buildDistantMountainRing(game, preset) {
  const segs = 72;
  const radiusInner = 248;
  const radiusOuter = 278;
  const baseY = -6;
  const vCount = segs * 2;
  const positions = new Float32Array(vCount * 3);
  const colors = new Float32Array(vCount * 3);
  const indices = [];

  const baseColor = new THREE.Color(preset.mountainHex);
  const horizColor = new THREE.Color(preset.horizon);
  const peakColor = baseColor.clone().lerp(horizColor, 0.28);
  const footColor = baseColor.clone().lerp(horizColor, 0.62);

  for (let i = 0; i < segs; i++) {
    const t = (i / segs) * Math.PI * 2;
    const cosA = Math.cos(t);
    const sinA = Math.sin(t);

    const ridge =
      15.5 +
      Math.sin(t * 3 + 0.4) * 7.2 +
      Math.cos(t * 7 - 1.1) * 4.6 +
      Math.sin(t * 13 + 0.8) * 2.1;
    const r = radiusInner + (i % 2) * (radiusOuter - radiusInner) * 0.45;

    const topIdx = i * 2;
    const botIdx = topIdx + 1;
    positions[topIdx * 3] = cosA * r;
    positions[topIdx * 3 + 1] = ridge;
    positions[topIdx * 3 + 2] = sinA * r;

    positions[botIdx * 3] = cosA * r;
    positions[botIdx * 3 + 1] = baseY;
    positions[botIdx * 3 + 2] = sinA * r;

    colors[topIdx * 3] = peakColor.r;
    colors[topIdx * 3 + 1] = peakColor.g;
    colors[topIdx * 3 + 2] = peakColor.b;

    colors[botIdx * 3] = footColor.r;
    colors[botIdx * 3 + 1] = footColor.g;
    colors[botIdx * 3 + 2] = footColor.b;

    const next = (i + 1) % segs;
    const nTop = next * 2;
    const nBot = nTop + 1;
    indices.push(topIdx, botIdx, nBot, topIdx, nBot, nTop);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.setIndex(indices);

  const mat = new THREE.MeshBasicMaterial({
    vertexColors: true,
    side: THREE.DoubleSide,
    fog: true
  });

  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'distantMountainRing';
  mesh.frustumCulled = false;
  mesh.updateMatrix();
  mesh.matrixAutoUpdate = false;
  game.scene.add(mesh);
  game.skyObjects.push(mesh);
  return mesh;
}

const HDRI_SKY_PATH = 'hdri/kloofendal_48d_partly_cloudy_puresky_1k.hdr';
const HDRI_SKY_MAPS = new Set(['desert_outpost', 'cargo_dock', 'crossfire_plus', 'killhouse_cqb']);
const DUSK_NEON_MAPS = new Set(['neon_lab', 'arena_duel']);

/**
 * Sanitizes raw equirectangular HDRI pixel data in-place (once per cached texture):
 * zeroes non-finite values and soft-knee compresses extreme solar radiance spikes (e.g. 61,408.0)
 * above `knee` down to `<= maxRad` so PMREM metallic reflections stay vivid with zero Bloom blowout.
 */
export function sanitizeHdriRadiance(hdrTex, { knee = 3.0, maxRad = 6.5 } = {}) {
  if (!hdrTex) return null;
  hdrTex.userData = { ...(hdrTex.userData || {}), shared: true };
  if (hdrTex.userData._radianceClamped) return hdrTex;

  const data = hdrTex.image?.data;
  if (data && data.length >= 4) {
    const safeKnee = Math.max(0.5, Number(knee) || 3.0);
    const safeMax = Math.max(safeKnee + 0.5, Number(maxRad) || 6.5);
    const span = safeMax - safeKnee;
    const isHalf = hdrTex.type === THREE.HalfFloatType || data instanceof Uint16Array;
    const fromHalf = THREE.DataUtils?.fromHalfFloat;
    const toHalf = THREE.DataUtils?.toHalfFloat;

    if (isHalf && typeof fromHalf === 'function' && typeof toHalf === 'function') {
      const zeroHalf = toHalf(0);
      const oneHalf = toHalf(1);
      for (let i = 0; i < data.length; i += 4) {
        for (let c = 0; c < 3; c++) {
          const v = fromHalf(data[i + c]);
          if (!Number.isFinite(v) || v <= 0) {
            data[i + c] = zeroHalf;
          } else if (v > safeKnee) {
            const excess = v - safeKnee;
            const comp = Math.min(safeMax, safeKnee + span * (excess / (excess + span)));
            data[i + c] = toHalf(comp);
          }
        }
        const a = fromHalf(data[i + 3]);
        if (!Number.isFinite(a)) data[i + 3] = oneHalf;
      }
    } else if (ArrayBuffer.isView(data) && !(data instanceof Uint8Array || data instanceof Uint8ClampedArray)) {
      for (let i = 0; i < data.length; i += 4) {
        for (let c = 0; c < 3; c++) {
          const v = data[i + c];
          if (!Number.isFinite(v) || v <= 0) {
            data[i + c] = 0;
          } else if (v > safeKnee) {
            const excess = v - safeKnee;
            data[i + c] = Math.min(safeMax, safeKnee + span * (excess / (excess + span)));
          }
        }
        if (!Number.isFinite(data[i + 3])) data[i + 3] = 1;
      }
    }
    hdrTex.needsUpdate = true;
  }

  hdrTex.userData._radianceClamped = true;
  return hdrTex;
}

/**
 * Asynchronously upgrades Medium/High real-WebGL scenes with the Poly Haven 1K equirectangular HDR sky
 * (`kloofendal_48d_partly_cloudy_puresky_1k.hdr`) + PMREM cubemap IBL reflections, cancelling safely on map/tier switch.
 */
export async function applyDustHdriSky(game, skyDome = game?.skyDome, mapId = game?.currentMapId) {
  const isRealWebGL = Boolean(
    typeof window !== 'undefined' &&
      typeof WebGL2RenderingContext !== 'undefined' &&
      game?.renderer?.isWebGLRenderer &&
      !game.renderer.__fakeGL
  );
  const envEnabled = (game?.quality?.envMapSize ?? 512) > 0;
  if (!isRealWebGL || !envEnabled || game?.assetsEnabled === false || typeof game?.assets?.loadHdri !== 'function') {
    return null;
  }

  const token = (game._skyHdriToken = (game._skyHdriToken || 0) + 1);
  let hdrTex = null;
  try {
    hdrTex = await game.assets.loadHdri(HDRI_SKY_PATH);
  } catch {
    return null;
  }
  if (!hdrTex || token !== game._skyHdriToken || (game?.quality?.envMapSize ?? 512) <= 0 || game?.renderer?.disposed) {
    return null;
  }

  // Clamp raw 61,408+ solar radiance spikes once per cached HDRI before PMREM/sky sampling
  sanitizeHdriRadiance(hdrTex, { knee: 3.0, maxRad: 6.5 });

  let pmrem = null;
  let envRT = null;
  if (game._hdriEnvTarget && game._hdriEnvSource === hdrTex) {
    envRT = game._hdriEnvTarget;
  } else {
    try {
      pmrem = new THREE.PMREMGenerator(game.renderer);
      pmrem.compileEquirectangularShader?.();
      envRT = pmrem.fromEquirectangular(hdrTex);
      pmrem.dispose();
      pmrem = null;
    } catch {
      pmrem?.dispose?.();
      envRT?.dispose?.();
      envRT = null;
    }
  }

  if (token !== game._skyHdriToken || (game?.quality?.envMapSize ?? 512) <= 0 || game?.renderer?.disposed) {
    if (envRT && envRT !== game._hdriEnvTarget) {
      envRT.dispose?.();
    }
    return null;
  }

  if (envRT) {
    if (game._hdriEnvTarget && game._hdriEnvTarget !== envRT) {
      game._hdriEnvTarget.dispose?.();
    }
    game._hdriEnvTarget = envRT;
    game._hdriEnvSource = hdrTex;
    game.activeEnvMap = envRT.texture;
    game.scene.environment = envRT.texture;
    if ('environmentIntensity' in game.scene) {
      game.scene.environmentIntensity = getMapEnvironmentIntensity(mapId, game?.currentMapConfig?.theme || {});
    }
    if (typeof game.refreshCs2WeaponEnvMaps === 'function') {
      game.refreshCs2WeaponEnvMaps(envRT.texture);
    } else if (typeof game.refreshCs2WeaponEnvMap === 'function') {
      game.refreshCs2WeaponEnvMap(envRT.texture);
    }
  }

  if (skyDome && skyDome.parent === game.scene && HDRI_SKY_MAPS.has(mapId)) {
    const hdriSkyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      toneMapped: true,
      uniforms: {
        uSkyMap: { value: hdrTex }
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          vec4 clipPos = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          gl_Position = vec4(clipPos.xy, clipPos.w * 0.99999, clipPos.w);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform sampler2D uSkyMap;
        varying vec2 vUv;
        void main() {
          vec3 col = texture2D(uSkyMap, vUv).rgb * 0.90;
          col = col / (1.0 + col * 0.28);
          col = min(col, vec3(1.18));
          gl_FragColor = vec4(col, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }
      `
    });
    const prevMat = skyDome.material;
    skyDome.material = hdriSkyMat;
    prevMat?.dispose?.();
    game.skyTimeUniform = null;
  }

  return hdrTex;
}

const SKY_SWIFTS_MAPS = new Set(['desert_outpost', 'cargo_dock']);
const SKY_SWIFTS_SPECS = [
  { cx: -6, cz: -4, r: 24, y: 39.5, ampY: 1.8, speed: 0.27, phase: 0.2, dir: 1 },
  { cx: 8, cz: 5, r: 31, y: 42.0, ampY: 2.1, speed: 0.23, phase: 1.5, dir: -1 },
  { cx: -10, cz: 9, r: 28, y: 44.5, ampY: 1.6, speed: 0.31, phase: 2.7, dir: 1 },
  { cx: 5, cz: -12, r: 36, y: 46.8, ampY: 2.2, speed: 0.21, phase: 3.9, dir: 1 },
  { cx: 12, cz: -2, r: 26, y: 48.5, ampY: 1.5, speed: 0.29, phase: 4.8, dir: -1 },
  { cx: -4, cz: -8, r: 41, y: 50.2, ampY: 1.9, speed: 0.19, phase: 5.4, dir: 1 },
  { cx: 2, cz: 6, r: 34, y: 51.6, ampY: 1.4, speed: 0.25, phase: 0.9, dir: -1 }
];

function createSkySwiftTexture() {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext?.('2d');
  if (!ctx) return null;

  ctx.clearRect(0, 0, 64, 64);
  ctx.fillStyle = '#24201c';
  // Swept-wing crescent swift silhouette (uses moveTo/lineTo for full headless compatibility)
  ctx.beginPath();
  ctx.moveTo(32, 22);
  ctx.lineTo(44, 24);
  ctx.lineTo(60, 17);
  ctx.lineTo(54, 27);
  ctx.lineTo(41, 33);
  ctx.lineTo(35, 36);
  ctx.lineTo(38, 47);
  ctx.lineTo(32, 41);
  ctx.lineTo(26, 47);
  ctx.lineTo(29, 36);
  ctx.lineTo(23, 33);
  ctx.lineTo(10, 27);
  ctx.lineTo(4, 17);
  ctx.lineTo(20, 24);
  ctx.closePath();
  ctx.fill();

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Builds 7 high-altitude circling sky swifts (`THREE.Points`, 1 draw call, y = 38–52m) on Medium/High
 * daylight maps (`desert_outpost`, `cargo_dock`), registered in `game.skyObjects` for zero-leak disposal.
 */
export function buildSkySwifts(game, mapId = game?.currentMapId, halfSize = 60) {
  const envEnabled = (game?.quality?.envMapSize ?? 512) > 0;
  if (!envEnabled || !SKY_SWIFTS_MAPS.has(mapId)) {
    game.skySwifts = null;
    game.skySwiftsData = null;
    return null;
  }

  const count = SKY_SWIFTS_SPECS.length;
  const scaleR = Math.max(0.75, Math.min(1.25, halfSize / 58));
  const positions = new Float32Array(count * 3);
  const swifts = new Array(count);

  for (let i = 0; i < count; i++) {
    const s = SKY_SWIFTS_SPECS[i];
    const r = s.r * scaleR;
    swifts[i] = {
      cx: s.cx * scaleR,
      cz: s.cz * scaleR,
      r,
      y: s.y,
      ampY: s.ampY,
      speed: s.speed,
      phase: s.phase,
      dir: s.dir
    };
    const a = s.phase;
    positions[i * 3] = swifts[i].cx + Math.cos(a) * r;
    positions[i * 3 + 1] = s.y;
    positions[i * 3 + 2] = swifts[i].cz + Math.sin(a) * r;
  }

  const geo = new THREE.BufferGeometry();
  const posAttr = new THREE.BufferAttribute(positions, 3);
  posAttr.setUsage?.(THREE.DynamicDrawUsage);
  geo.setAttribute('position', posAttr);

  const swiftTex = createSkySwiftTexture();
  const mat = new THREE.PointsMaterial({
    map: swiftTex || null,
    color: swiftTex ? 0xffffff : 0x26221e,
    size: 1.55,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.82,
    alphaTest: 0.08,
    depthWrite: false,
    fog: true
  });

  const points = new THREE.Points(geo, mat);
  points.name = 'skySwifts';
  points.frustumCulled = false;
  game.scene.add(points);
  game.skyObjects.push(points);
  game.skySwifts = points;
  game.skySwiftsData = swifts;
  return points;
}

/** Updates circling sky swifts in-place with zero per-frame allocations. */
export function updateSkySwifts(game, tSec) {
  const points = game?.skySwifts;
  const swifts = game?.skySwiftsData;
  if (!points || !swifts || !points.visible) return;
  const posAttr = points.geometry?.attributes?.position;
  if (!posAttr) return;
  const arr = posAttr.array;
  for (let i = 0; i < swifts.length; i++) {
    const s = swifts[i];
    const ang = s.phase + tSec * s.speed * s.dir;
    const rx = s.r * (1.0 + 0.12 * Math.sin(tSec * 0.17 + s.phase));
    const idx = i * 3;
    arr[idx] = s.cx + Math.cos(ang) * rx;
    arr[idx + 1] = s.y + Math.sin(ang * 1.4 + s.phase) * s.ampY;
    arr[idx + 2] = s.cz + Math.sin(ang) * s.r;
  }
  posAttr.needsUpdate = true;
}

export function buildSkyAndAtmosphere(game, theme = {}, halfSize = 60) {
  const mapId = game?.currentMapId;
  const isDesert = mapId === 'desert_outpost' || theme.floorBase === '#27170c';
  const preset = getMapAtmospherePreset(mapId, theme);
  const envEnabled = (game?.quality?.envMapSize ?? 512) > 0;

  // 0. Bind Synchronous Procedural IBL Environment Map for Frame 0 & Headless Node Tests
  const envMap = envEnabled ? createProceduralEnvironmentMap(game, theme) : null;
  game.activeEnvMap = envMap;
  if (envMap) {
    game.scene.environment = envMap;
    if ('environmentIntensity' in game.scene) {
      game.scene.environmentIntensity = getMapEnvironmentIntensity(mapId, theme);
    }
    if (typeof game.refreshCs2WeaponEnvMaps === 'function') {
      game.refreshCs2WeaponEnvMaps(envMap);
    } else if (typeof game.refreshCs2WeaponEnvMap === 'function') {
      game.refreshCs2WeaponEnvMap(envMap);
    }
  } else {
    game.scene.environment = null;
    if (typeof game.refreshCs2WeaponEnvMaps === 'function') {
      game.refreshCs2WeaponEnvMaps(null);
    } else if (typeof game.refreshCs2WeaponEnvMap === 'function') {
      game.refreshCs2WeaponEnvMap(null);
    }
  }

  // 1. Physical Atmospheric Sky + Animated Volumetric Cloud Layer ShaderMaterial (frame 0 & Low/Node fallback)
  const skySegW = envEnabled ? 48 : 32;
  const skySegH = envEnabled ? 28 : 18;
  const skyGeo = new THREE.SphereGeometry(310, skySegW, skySegH);
  const { mat: skyMat, uTime: skyTimeUniform } = createAtmosphericSkyMaterial(preset);
  const skyDome = new THREE.Mesh(skyGeo, skyMat);
  skyDome.name = 'atmosphericSkyDome';
  skyDome.frustumCulled = false;
  game.scene.add(skyDome);
  game.skyObjects.push(skyDome);
  game.skyDome = skyDome;
  game.skyTimeUniform = skyTimeUniform;

  // Kick off async 1K Poly Haven HDRI Sky + PMREM upgrade on Medium/High real WebGL
  void applyDustHdriSky(game, skyDome, mapId);

  // Distant 3D mountain silhouette ring (Medium/High tiers; omitted on Low for triangle savings)
  if (envEnabled) {
    buildDistantMountainRing(game, preset);
  }

  // 2. Perimeter Complex (Sunlit Moroccan Courtyard Skyline on Dust II; Harbor/Industrial Towers elsewhere)
  const facadeTex = createSkylineFacadeTexture(game, isDesert);
  const towerMat = new THREE.MeshStandardMaterial({
    map: facadeTex,
    color: preset.skylineTint,
    roughness: isDesert ? 0.88 : 0.66,
    metalness: isDesert ? 0.04 : 0.30
  });
  const towerTrimMat = new THREE.MeshStandardMaterial({
    color: isDesert ? 0xcab28e : 0x2a3441,
    roughness: isDesert ? 0.84 : 0.56,
    metalness: isDesert ? 0.05 : 0.48
  });
  const siloSteelMat = new THREE.MeshStandardMaterial({
    color: isDesert ? 0xb48a5c : 0x455364,
    roughness: isDesert ? 0.82 : 0.40,
    metalness: isDesert ? 0.05 : 0.68
  });
  const warmLightStripMat = new THREE.MeshBasicMaterial({ color: 0xe5a024 });
  const beaconRedMat = new THREE.MeshBasicMaterial({ color: 0xff3b30 });
  game.arenaMaterials.add(towerMat);
  game.arenaMaterials.add(towerTrimMat);
  game.arenaMaterials.add(siloSteelMat);
  game.arenaMaterials.add(warmLightStripMat);
  game.arenaMaterials.add(beaconRedMat);

  const sharedSkyBoxGeo = new THREE.BoxGeometry(1, 1, 1);
  const sharedCylGeo = new THREE.CylinderGeometry(0.5, 0.5, 1, game?.quality?.cylinderSegments || 14);
  const sharedDomeGeo = new THREE.SphereGeometry(0.5, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.55);
  const sharedSpireGeo = new THREE.CylinderGeometry(0.12, 0.46, 1, 8);
  game.arenaGeometries.add(sharedSkyBoxGeo);
  game.arenaGeometries.add(sharedCylGeo);
  game.arenaGeometries.add(sharedDomeGeo);
  game.arenaGeometries.add(sharedSpireGeo);

  const perimeterBatches = new Map();
  const addPerimeterMesh = (geo, mat, x, y, z, sx, sy, sz, rx = 0, ry = 0, rz = 0) => {
    let byMat = perimeterBatches.get(geo);
    if (!byMat) perimeterBatches.set(geo, (byMat = new Map()));
    let items = byMat.get(mat);
    if (!items) byMat.set(mat, (items = []));
    items.push([x, y, z, sx, sy, sz, rx, ry, rz]);
  };

  const towerCount = 28;
  for (let i = 0; i < towerCount; i++) {
    const angle = (i / towerCount) * Math.PI * 2;
    const cosA = Math.cos(angle);
    const sinA = Math.sin(angle);
    const squareBoundaryDist = halfSize / Math.max(Math.abs(cosA), Math.abs(sinA));
    const dist = squareBoundaryDist + 22 + (i % 3) * 14;
    const tx = cosA * dist;
    const tz = sinA * dist;
    const faceYaw = -angle + Math.PI / 2;
    const archetype = i % 4;

    if (isDesert) {
      if (archetype === 0) {
        const bw = 18 + (i % 3) * 3;
        const bd = 13 + (i % 2) * 3;
        const bh = 13 + (i % 3) * 3;
        addPerimeterMesh(sharedSkyBoxGeo, towerMat, tx, bh / 2 - 2, tz, bw, bh, bd, 0, faceYaw, 0);
        addPerimeterMesh(sharedSkyBoxGeo, towerTrimMat, tx, bh - 2 + 0.55, tz, bw + 0.6, 1.1, bd + 0.6, 0, faceYaw, 0);
      } else if (archetype === 1) {
        const tw = 12 + (i % 2) * 2.5;
        const th = 19 + (i % 3) * 4;
        addPerimeterMesh(sharedSkyBoxGeo, towerMat, tx, th / 2 - 2, tz, tw, th, tw, 0, faceYaw, 0);
        addPerimeterMesh(sharedSkyBoxGeo, towerTrimMat, tx, th - 2 + 0.6, tz, tw * 1.08, 1.2, tw * 1.08, 0, faceYaw, 0);
        addPerimeterMesh(sharedDomeGeo, siloSteelMat, tx, th - 1.2, tz, tw * 0.68, tw * 0.48, tw * 0.68);
      } else if (archetype === 2) {
        const th = 22 + ((i * 7) % 16);
        const tw = 11 + (i % 3) * 2.4;
        addPerimeterMesh(sharedSkyBoxGeo, towerTrimMat, tx, th * 0.2 - 2, tz, tw * 1.22, th * 0.4, tw * 1.22, 0, faceYaw, 0);
        addPerimeterMesh(sharedSkyBoxGeo, towerMat, tx, th * 0.5 - 2, tz, tw, th, tw, 0, faceYaw, 0);
        addPerimeterMesh(sharedDomeGeo, towerTrimMat, tx, th - 2, tz, tw * 0.66, tw * 0.56, tw * 0.66);
      } else {
        const th = 16 + ((i * 5) % 12);
        const tw = 11 + (i % 4) * 2.2;
        addPerimeterMesh(sharedSkyBoxGeo, towerMat, tx, th / 2 - 2, tz, tw, th, tw * 1.12, 0, faceYaw, 0);
        addPerimeterMesh(sharedSkyBoxGeo, siloSteelMat, tx, th - 2 + 0.45, tz, tw + 0.5, 0.9, tw * 1.12 + 0.5, 0, faceYaw, 0);
      }
      continue;
    }

    if (archetype === 0) {
      const hw = 18 + (i % 3) * 3;
      const hd = 13 + (i % 2) * 3;
      const hh = 14 + (i % 3) * 3;
      addPerimeterMesh(sharedSkyBoxGeo, towerTrimMat, tx, hh / 2 - 2, tz, hw, hh, hd, 0, faceYaw, 0);
      addPerimeterMesh(sharedCylGeo, siloSteelMat, tx, hh - 2, tz, hd * 0.44, hw * 0.98, hd * 0.96, 0, faceYaw, Math.PI / 2);
      addPerimeterMesh(sharedSkyBoxGeo, warmLightStripMat, tx, hh - 3.2, tz, hw + 0.25, 0.34, hd + 0.25, 0, faceYaw, 0);
    } else if (archetype === 1) {
      const siloR = 5.4 + (i % 2) * 1.2;
      const siloH = 22 + (i % 3) * 5;
      const perpX = -sinA * (siloR * 0.68);
      const perpZ = cosA * (siloR * 0.68);

      for (const side of [-1, 1]) {
        const sx = tx + perpX * side;
        const sz = tz + perpZ * side;
        addPerimeterMesh(sharedCylGeo, siloSteelMat, sx, siloH / 2 - 2, sz, siloR, siloH, siloR);
        addPerimeterMesh(sharedDomeGeo, towerTrimMat, sx, siloH - 2, sz, siloR * 0.96, siloR * 0.45, siloR * 0.96);
        addPerimeterMesh(sharedCylGeo, warmLightStripMat, sx, siloH - 4.2, sz, siloR + 0.18, 0.28, siloR + 0.18);
      }
      addPerimeterMesh(sharedSkyBoxGeo, towerTrimMat, tx, siloH - 3.2, tz, siloR * 1.6, 1.2, 2.2, 0, faceYaw, 0);
    } else if (archetype === 2) {
      const th = 28 + ((i * 11) % 28);
      const tw = 11 + (i % 3) * 2.8;
      addPerimeterMesh(sharedSkyBoxGeo, towerTrimMat, tx, th * 0.22 - 2, tz, tw * 1.32, th * 0.44, tw * 1.32, 0, faceYaw, 0);
      addPerimeterMesh(sharedSkyBoxGeo, towerMat, tx, th * 0.5 - 2, tz, tw, th, tw, 0, faceYaw, 0);
      addPerimeterMesh(sharedSkyBoxGeo, towerTrimMat, tx, th - 4.2, tz, tw * 1.18, 2.4, tw * 1.18, 0, faceYaw, 0);
      addPerimeterMesh(sharedSkyBoxGeo, warmLightStripMat, tx, th - 4.2, tz, tw * 1.21, 0.36, tw * 1.21, 0, faceYaw, 0);
      addPerimeterMesh(sharedDomeGeo, siloSteelMat, tx, th - 2, tz, tw * 0.62, tw * 0.58, tw * 0.62);
    } else {
      const th = 22 + ((i * 7) % 22);
      const tw = 10 + (i % 4) * 2.5;
      addPerimeterMesh(sharedSkyBoxGeo, towerMat, tx, th / 2 - 2, tz, tw, th, tw * 1.15, 0, faceYaw, 0);
      addPerimeterMesh(sharedSkyBoxGeo, warmLightStripMat, tx, th - 3.6, tz, tw + 0.22, 0.32, tw * 1.15 + 0.22, 0, faceYaw, 0);

      const spireH = 12 + (i % 3) * 5;
      addPerimeterMesh(sharedSpireGeo, siloSteelMat, tx, th - 2 + spireH / 2, tz, 1.1, spireH, 1.1);
      addPerimeterMesh(sharedSkyBoxGeo, towerTrimMat, tx, th - 2 + spireH * 0.55, tz, 3.6, 0.28, 0.28, 0, faceYaw, 0);
      // Compact 0.22m aviation strobe beacon (replaces oversized cubes)
      addPerimeterMesh(sharedSkyBoxGeo, beaconRedMat, tx, th - 2 + spireH, tz, 0.22, 0.22, 0.22);
    }
  }

  const perimeterDummy = new THREE.Object3D();
  for (const [geo, byMat] of perimeterBatches) {
    for (const [mat, items] of byMat) {
      const inst = new THREE.InstancedMesh(geo, mat, items.length);
      for (let k = 0; k < items.length; k++) {
        const [x, y, z, sx, sy, sz, rx, ry, rz] = items[k];
        perimeterDummy.position.set(x, y, z);
        perimeterDummy.rotation.set(rx, ry, rz);
        perimeterDummy.scale.set(sx, sy, sz);
        perimeterDummy.updateMatrix();
        inst.setMatrixAt(k, perimeterDummy.matrix);
      }
      inst.instanceMatrix.needsUpdate = true;
      inst.frustumCulled = false;
      inst.updateMatrix();
      inst.matrixAutoUpdate = false;
      game.scene.add(inst);
      game.skyObjects.push(inst);
    }
  }

  // 3. Subtle Sunlit Atmospheric Dust Motes inside Arena (exact vertex count preserved for tests)
  const pCount = game?.quality ? game.quality.ambientParticles : 220;
  const span = halfSize * 1.85;
  if (pCount > 0) {
    const positions = new Float32Array(pCount * 3);
    for (let i = 0; i < pCount; i++) {
      positions[i * 3] = (Math.random() - 0.5) * span;
      positions[i * 3 + 1] = 0.8 + Math.random() * 14;
      positions[i * 3 + 2] = (Math.random() - 0.5) * span;
    }
    const pGeo = new THREE.BufferGeometry();
    pGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const pMat = new THREE.PointsMaterial({
      color: preset.dustHex || 0xe2e8f0,
      size: 0.14,
      transparent: true,
      opacity: 0.30,
      depthWrite: false
    });
    game.ambientParticles = new THREE.Points(pGeo, pMat);
    game.scene.add(game.ambientParticles);
    game.skyObjects.push(game.ambientParticles);
  }

  // 4. Coastal Harbor Water Surrounding Arena Sea-Wall (Medium & High tiers on non-desert maps)
  buildSaltlineHarborWater(game, theme, halfSize);

  // 5. High-Altitude Circling Sky Swifts (Medium & High daylight arenas: desert_outpost, cargo_dock)
  buildSkySwifts(game, mapId, halfSize);
}
