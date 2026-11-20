// Lighting/atmosphere contrast & horizon fog adapted in part from StarKnightt/counter-strike-in-browser (MIT License, Copyright (c) 2026 StarKnightt)
import * as THREE from '../three.js';

/**
 * Single source of truth for per-map photoreal CS2 daylight/overcast atmospheric palettes,
 * directional sun angles, hemisphere/rim fill, and distance exponential fog across all 6 CS:GO maps.
 */
const MAP_ATMOSPHERE_PRESETS = {
  de_dust2: {
    zenith: '#3b73b9',
    mid: '#7baad8',
    horizon: '#ede2ce',
    ground: '#a8916c',
    sunColor: '#ffe6c8',
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
    fogDensity: 0.0040,
    bgColor: 0xc5d6e6,
    mountainHex: 0x9c8b78,
    skylineTint: 0xe6d6bc,
    dustHex: 0xefe4cf,
    dustSize: 0.11,
    dustOpacity: 0.15
  },
  de_mirage: {
    zenith: '#2c62ab',
    mid: '#72a3d4',
    horizon: '#f3d9b4',
    ground: '#b08f64',
    sunColor: '#ffdfb0',
    cloudColor: '#fff8ea',
    cloudShadow: '#a39f9a',
    cloudDensity: 0.18,
    sunPos: [-74, 62, 58],
    dirColor: 0xffdeb3,
    dirIntensity: 5.0,
    hemiSky: 0x92b4db,
    hemiGround: 0x867054,
    hemiIntensity: 0.48,
    rimColor: 0xa6c4e2,
    rimIntensity: 0.16,
    citadelColor: 0xf59e0b,
    citadelIntensity: 0.72,
    envIntensity: 0.40,
    fogHex: 0xe4cfa8,
    fogDensity: 0.0038,
    bgColor: 0xd0d8e0,
    mountainHex: 0xa68c70,
    skylineTint: 0xedd6b4,
    dustHex: 0xefe4cf,
    dustSize: 0.11,
    dustOpacity: 0.15
  },
  de_inferno: {
    zenith: '#2560a8',
    mid: '#6ba4dc',
    horizon: '#efe3cf',
    ground: '#8f7d65',
    sunColor: '#ffebd0',
    cloudColor: '#fffdf9',
    cloudShadow: '#8ea8c4',
    cloudDensity: 0.32,
    sunPos: [68, 72, -52],
    dirColor: 0xffebd2,
    dirIntensity: 4.8,
    hemiSky: 0x8fc0ee,
    hemiGround: 0x706250,
    hemiIntensity: 0.50,
    rimColor: 0x9ec7ec,
    rimIntensity: 0.18,
    citadelColor: 0xea8c38,
    citadelIntensity: 0.75,
    envIntensity: 0.42,
    fogHex: 0xdcd2c0,
    fogDensity: 0.0034,
    bgColor: 0xc2d5e8,
    mountainHex: 0x6f7c66,
    skylineTint: 0xe6d2b8,
    dustHex: 0xefe4cf,
    dustSize: 0.11,
    dustOpacity: 0.15
  },
  de_nuke: {
    zenith: '#466789',
    mid: '#7b99b4',
    horizon: '#cfd9e3',
    ground: '#687480',
    sunColor: '#f4f7fc',
    cloudColor: '#eef3f8',
    cloudShadow: '#74889c',
    cloudDensity: 0.58,
    sunPos: [56, 68, 48],
    dirColor: 0xf0f5fc,
    dirIntensity: 4.1,
    hemiSky: 0xa2bdd8,
    hemiGround: 0x6f7b88,
    hemiIntensity: 0.76,
    rimColor: 0x9fc2e6,
    rimIntensity: 0.24,
    citadelColor: 0x94b8dc,
    citadelIntensity: 0.70,
    envIntensity: 0.50,
    fogHex: 0xbac7d4,
    fogDensity: 0.0032,
    bgColor: 0xb8c8d8,
    mountainHex: 0x566876,
    skylineTint: 0xcbd4de,
    dustHex: 0xdce6f0,
    dustSize: 0.06,
    dustOpacity: 0.04
  },
  fy_iceworld: {
    zenith: '#1e5aa4',
    mid: '#62a2dc',
    horizon: '#e4f2fc',
    ground: '#b4cae0',
    sunColor: '#ffffff',
    cloudColor: '#ffffff',
    cloudShadow: '#8bb0d2',
    cloudDensity: 0.26,
    sunPos: [-54, 70, 56],
    dirColor: 0xf8fbff,
    dirIntensity: 4.6,
    hemiSky: 0xa4d4ff,
    hemiGround: 0xb8cde0,
    hemiIntensity: 0.85,
    rimColor: 0xc2e6ff,
    rimIntensity: 0.22,
    citadelColor: 0x93c5fd,
    citadelIntensity: 0.60,
    envIntensity: 0.56,
    fogHex: 0xd4e5f2,
    fogDensity: 0.0033,
    bgColor: 0xc6dff2,
    mountainHex: 0x99afc2,
    skylineTint: 0xe6f0f8,
    dustHex: 0xf1f7ff,
    dustSize: 0.14,
    dustOpacity: 0.24
  },
  aim_map: {
    zenith: '#2c64a8',
    mid: '#6fa4d6',
    horizon: '#dfe7ee',
    ground: '#86847e',
    sunColor: '#fff6e8',
    cloudColor: '#fafcff',
    cloudShadow: '#879cb2',
    cloudDensity: 0.34,
    sunPos: [-52, 74, 48],
    dirColor: 0xfff5e6,
    dirIntensity: 4.5,
    hemiSky: 0x9bc4ec,
    hemiGround: 0x86847e,
    hemiIntensity: 0.74,
    rimColor: 0xa8c8e8,
    rimIntensity: 0.20,
    citadelColor: 0xd99b4e,
    citadelIntensity: 0.65,
    envIntensity: 0.52,
    fogHex: 0xcbd5df,
    fogDensity: 0.0028,
    bgColor: 0xc4d4e4,
    mountainHex: 0x6c7a88,
    skylineTint: 0xd8dce0,
    dustHex: 0xeef2f6,
    dustSize: 0.06,
    dustOpacity: 0.04
  }
};

const ATMOSPHERE_MAP_ALIASES = {
  desert_outpost: 'de_dust2',
  arena_duel: 'aim_map'
};

function resolveAtmosphereMapId(mapId) {
  if (typeof mapId !== 'string') return 'de_dust2';
  const canonical = ATMOSPHERE_MAP_ALIASES[mapId] || mapId;
  return MAP_ATMOSPHERE_PRESETS[canonical] ? canonical : 'de_dust2';
}

export function getMapAtmospherePreset(mapId, _theme = {}) {
  return MAP_ATMOSPHERE_PRESETS[resolveAtmosphereMapId(mapId)];
}

export function getMapEnvironmentIntensity(mapId, theme = {}) {
  const preset = getMapAtmospherePreset(mapId, theme);
  return preset.envIntensity ?? 0.42;
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
 * Generates a procedural equirectangular IBL environment map matched to the active CS:GO map's
 * sky, directional solar specular lobe, and crisp horizon bounce so PBR gunmetal & optics gleam.
 */
export function createProceduralEnvironmentMap(game, theme = {}) {
  if (typeof document === 'undefined') return null;
  const canonicalMapId = resolveAtmosphereMapId(game?.currentMapId);
  const preset = getMapAtmospherePreset(canonicalMapId, theme);
  const envSize = Math.max(64, Math.min(512, game?.quality?.envMapSize || 512));
  const canvas = document.createElement('canvas');
  canvas.width = envSize;
  canvas.height = envSize / 2;
  const ctx = canvas.getContext('2d');
  ctx.scale?.(envSize / 512, envSize / 512);

  let nadirHex = '#303842';
  if (canonicalMapId === 'de_dust2' || canonicalMapId === 'de_mirage') {
    nadirHex = '#6d5840';
  } else if (canonicalMapId === 'de_inferno') {
    nadirHex = '#5a4c3e';
  } else if (canonicalMapId === 'fy_iceworld') {
    nadirHex = '#7b94ac';
  }

  // Vertical sky-to-ground equirectangular gradient matched to map sky & ground bounce
  const grad = ctx.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0.0, preset.zenith);
  grad.addColorStop(0.28, preset.mid);
  grad.addColorStop(0.47, preset.horizon);
  grad.addColorStop(0.50, preset.sunColor);
  grad.addColorStop(0.54, preset.mountainHex ? `#${preset.mountainHex.toString(16).padStart(6, '0')}` : '#556575');
  grad.addColorStop(0.75, preset.ground);
  grad.addColorStop(1.0, nadirHex);
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

  // Crisp atmospheric horizon bounce band for clean Fresnel sheen on weapons and stonework
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

  // Subtle architectural silhouette breaks along the equator for realistic metallic reflections
  ctx.fillStyle = 'rgba(28, 34, 42, 0.26)';
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

function createSkylineFacadeTexture(game, style = 'moroccan') {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext?.('2d');
  if (!ctx) return null;

  if (style === 'moroccan') {
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
          ctx.fillStyle = 'rgba(84, 126, 128, 0.54)';
          ctx.fillRect(wx + 2, wy + 1, 16, 15);
        } else {
          ctx.fillStyle = 'rgba(68, 50, 35, 0.75)';
          ctx.fillRect(wx + 1, wy, 18, 16);
          ctx.fillStyle = 'rgba(235, 221, 196, 0.45)';
          ctx.fillRect(wx - 1, wy + 16, 22, 3);
        }
      }
    }
  } else if (style === 'tuscan') {
    ctx.fillStyle = '#e2cbb0';
    ctx.fillRect(0, 0, 256, 256);

    // Subtle Tuscan stone stringcourses
    ctx.strokeStyle = 'rgba(138, 96, 68, 0.24)';
    ctx.lineWidth = 2;
    for (let y = 0; y <= 256; y += 32) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(256, y);
      ctx.stroke();
    }

    // Mediterranean louvered wooden & olive-green shutters
    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        const wx = col * 32 + 6;
        const wy = row * 32 + 6;
        const seed = (row * 23 + col * 13) % 11;
        ctx.fillStyle = 'rgba(54, 42, 32, 0.78)';
        ctx.fillRect(wx + 3, wy, 14, 18);
        ctx.fillStyle = seed % 2 === 0 ? 'rgba(72, 96, 62, 0.72)' : 'rgba(116, 78, 48, 0.74)';
        ctx.fillRect(wx, wy, 4, 18);
        ctx.fillRect(wx + 16, wy, 4, 18);
        ctx.fillStyle = 'rgba(232, 214, 188, 0.65)';
        ctx.fillRect(wx - 1, wy + 18, 22, 3);
      }
    }
  } else {
    // Daylight industrial precast concrete & steel factory cladding (Nuke & aim_map)
    ctx.fillStyle = '#adb8c4';
    ctx.fillRect(0, 0, 256, 256);

    ctx.strokeStyle = 'rgba(52, 64, 78, 0.28)';
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
        const wx = col * 32 + 4;
        const wy = row * 32 + 8;
        if (row % 2 === 0) {
          ctx.fillStyle = 'rgba(46, 62, 78, 0.72)';
          ctx.fillRect(wx, wy, 24, 12);
          ctx.fillStyle = 'rgba(182, 206, 226, 0.28)';
          ctx.fillRect(wx + 2, wy + 2, 10, 8);
        } else {
          ctx.fillStyle = 'rgba(84, 96, 108, 0.32)';
          ctx.fillRect(wx + 2, wy + 2, 20, 10);
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
 * Builds a single-draw-call 3D low-poly distant mountain/hill silhouette ring around the perimeter
 * using aerial-perspective tinting tailored per CS:GO map.
 */
function buildDistantMountainRing(game, preset, canonicalMapId = 'de_dust2') {
  const segs = 72;
  const radiusInner = 236;
  const radiusOuter = 268;
  const baseY = -6;
  const vCount = segs * 2;
  const positions = new Float32Array(vCount * 3);
  const colors = new Float32Array(vCount * 3);
  const indices = [];

  const isAlpine = canonicalMapId === 'fy_iceworld';
  const isTuscan = canonicalMapId === 'de_inferno';
  const isNuke = canonicalMapId === 'de_nuke';
  const isAim = canonicalMapId === 'aim_map';

  const baseColor = new THREE.Color(preset.mountainHex);
  const horizColor = new THREE.Color(preset.horizon);
  const snowColor = new THREE.Color(0xd8e6f2);
  const peakColor = isAlpine
    ? baseColor.clone().lerp(snowColor, 0.46).lerp(horizColor, 0.36)
    : baseColor.clone().lerp(horizColor, 0.28);
  const footColor = baseColor.clone().lerp(horizColor, isAlpine ? 0.68 : 0.64);

  for (let i = 0; i < segs; i++) {
    const t = (i / segs) * Math.PI * 2;
    const cosA = Math.cos(t);
    const sinA = Math.sin(t);

    let ridge;
    if (isAlpine) {
      ridge =
        20.0 +
        Math.sin(t * 3 + 0.3) * 7.5 +
        Math.cos(t * 7 - 0.8) * 4.8 +
        Math.sin(t * 11 + 0.5) * 2.2;
    } else if (isTuscan) {
      ridge = 14.5 + Math.sin(t * 3 + 0.6) * 5.2 + Math.cos(t * 6 - 0.9) * 3.1;
    } else if (isNuke) {
      ridge = 17.5 + Math.sin(t * 4 + 0.2) * 6.4 + Math.cos(t * 11 - 0.4) * 3.4;
    } else if (isAim) {
      ridge = 9.5 + Math.sin(t * 3 + 1.1) * 3.2 + Math.cos(t * 7 - 0.5) * 1.8;
    } else {
      // Dust II & Mirage desert mesas / Atlas foothills
      ridge =
        16.0 +
        Math.sin(t * 3 + 0.4) * 7.0 +
        Math.cos(t * 7 - 1.1) * 4.4 +
        Math.sin(t * 13 + 0.8) * 2.0;
    }

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
const HDRI_SKY_MAPS = new Set(['de_dust2', 'de_mirage', 'de_inferno', 'aim_map']);

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

  const canonicalMapId = resolveAtmosphereMapId(mapId);
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
      game.scene.environmentIntensity = getMapEnvironmentIntensity(canonicalMapId, game?.currentMapConfig?.theme || {});
    }
    if (typeof game.refreshCs2WeaponEnvMaps === 'function') {
      game.refreshCs2WeaponEnvMaps(envRT.texture);
    } else if (typeof game.refreshCs2WeaponEnvMap === 'function') {
      game.refreshCs2WeaponEnvMap(envRT.texture);
    }
  }

  if (skyDome && skyDome.parent === game.scene && HDRI_SKY_MAPS.has(canonicalMapId)) {
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

const SKY_SWIFTS_MAPS = new Set(['de_dust2', 'de_mirage', 'de_inferno']);
const SKY_SWIFTS_SPECS = [
  { cx: -6, cz: -4, r: 22, y: 36.5, ampY: 1.6, speed: 0.27, phase: 0.2, dir: 1 },
  { cx: 8, cz: 5, r: 28, y: 39.0, ampY: 1.9, speed: 0.23, phase: 1.5, dir: -1 },
  { cx: -10, cz: 9, r: 25, y: 41.5, ampY: 1.5, speed: 0.31, phase: 2.7, dir: 1 },
  { cx: 5, cz: -12, r: 32, y: 43.8, ampY: 2.0, speed: 0.21, phase: 3.9, dir: 1 },
  { cx: 12, cz: -2, r: 24, y: 45.5, ampY: 1.4, speed: 0.29, phase: 4.8, dir: -1 },
  { cx: -4, cz: -8, r: 35, y: 47.2, ampY: 1.8, speed: 0.19, phase: 5.4, dir: 1 },
  { cx: 2, cz: 6, r: 30, y: 48.6, ampY: 1.4, speed: 0.25, phase: 0.9, dir: -1 }
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
 * Builds 7 high-altitude circling sky swifts (`THREE.Points`, 1 draw call) on Medium/High
 * sunlit CS:GO maps (`de_dust2`, `de_mirage`, `de_inferno`), registered in `game.skyObjects` for zero-leak disposal.
 */
export function buildSkySwifts(game, mapId = game?.currentMapId, halfSize = 38) {
  const canonicalMapId = resolveAtmosphereMapId(mapId);
  const envEnabled = (game?.quality?.envMapSize ?? 512) > 0;
  if (!envEnabled || !SKY_SWIFTS_MAPS.has(canonicalMapId)) {
    game.skySwifts = null;
    game.skySwiftsData = null;
    return null;
  }

  const count = SKY_SWIFTS_SPECS.length;
  const scaleR = Math.max(0.70, Math.min(1.15, halfSize / 38));
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
    size: 1.45,
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

/**
 * Generates a soft 64x64 radial-gradient alpha sprite texture for ambient air motes / snow,
 * registering it in `game.arenaTextures` and returning `null` safely in headless Node.
 */
export function createSoftParticleTexture(game) {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext?.('2d');
  if (!ctx) return null;

  ctx.clearRect?.(0, 0, 64, 64);
  const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0.0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.35, 'rgba(255,255,255,0.45)');
  grad.addColorStop(1.0, 'rgba(255,255,255,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 64, 64);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  game?.arenaTextures?.add?.(tex);
  return tex;
}

function getAmbientParticleConfig(canonicalMapId, preset = {}) {
  if (canonicalMapId === 'fy_iceworld') {
    return { color: 0xf1f7ff, size: 0.14, opacity: 0.24 };
  }
  if (canonicalMapId === 'de_nuke' || canonicalMapId === 'aim_map') {
    return { color: preset.dustHex || 0xe2e8f0, size: 0.06, opacity: 0.04 };
  }
  return { color: 0xefe4cf, size: 0.11, opacity: 0.15 };
}

function sampleAlpineRidgeHeight(u, v, phaseOffset = 0) {
  const envU = Math.pow(Math.max(0, 1 - u * u), 1.18);
  const envV = Math.pow(Math.max(0, 1 - v * v), 1.32);
  const lobeA = 0.92 * Math.exp(-Math.pow((u + 0.24) / 0.48, 2));
  const lobeB = 0.78 * Math.exp(-Math.pow((u - 0.28) / 0.45, 2));
  const saddle = 0.16 * Math.exp(-Math.pow(u / 0.58, 2));
  const crag =
    0.08 * Math.sin(u * 5.2 + v * 2.4 + phaseOffset) +
    0.05 * Math.cos(u * 8.1 - v * 3.9 + phaseOffset * 1.7);
  return Math.max(0, envU * envV * (Math.max(lobeA, lobeB) + saddle + crag));
}

/**
 * Builds a multi-segment faceted alpine mountain ridge geometry (`x,z in [-0.5, 0.5]`, `y in [0, 1]`)
 * with undulating multi-summit ridgelines and gentle glacial slopes (replacing sharp 6-sided cone pyramids).
 */
export function createAlpineRidgeGeometry(phaseOffset = 0, { snowMantle = false } = {}) {
  const segsX = 16;
  const segsZ = 8;
  const cols = segsX + 1;
  const rows = segsZ + 1;
  const positions = new Float32Array(cols * rows * 3);
  const rawHeights = new Float32Array(cols * rows);
  let maxH = 0;

  for (let iz = 0; iz < rows; iz++) {
    const v = (iz / segsZ) * 2 - 1;
    for (let ix = 0; ix < cols; ix++) {
      const u = (ix / segsX) * 2 - 1;
      const idx = iz * cols + ix;
      const h = sampleAlpineRidgeHeight(u, v, phaseOffset);
      rawHeights[idx] = h;
      if (h > maxH) maxH = h;
    }
  }

  const normScale = maxH > 1e-4 ? 1 / maxH : 1;
  for (let iz = 0; iz < rows; iz++) {
    const v = (iz / segsZ) * 2 - 1;
    for (let ix = 0; ix < cols; ix++) {
      const u = (ix / segsX) * 2 - 1;
      const idx = iz * cols + ix;
      let y = rawHeights[idx] * normScale;
      if (snowMantle) {
        const snowLevel = y + 0.08 * Math.sin(u * 4.4 + phaseOffset) + 0.07 * v;
        const t = Math.max(0, Math.min(1, (snowLevel - 0.36) / 0.22));
        const smooth = t * t * (3 - 2 * t);
        y = y + smooth * 0.026 - (1 - smooth) * 0.045;
        if (Math.abs(u) >= 0.999 || Math.abs(v) >= 0.999) y = 0;
      }
      positions[idx * 3] = u * 0.5;
      positions[idx * 3 + 1] = Math.max(0, y);
      positions[idx * 3 + 2] = v * 0.5;
    }
  }

  const indices = [];
  for (let iz = 0; iz < segsZ; iz++) {
    for (let ix = 0; ix < segsX; ix++) {
      const a = iz * cols + ix;
      const b = a + 1;
      const c = a + cols;
      const d = c + 1;
      if ((ix + iz) % 2 === 0) {
        indices.push(a, c, b, b, c, d);
      } else {
        indices.push(a, c, d, a, d, b);
      }
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  geo.computeBoundingBox();
  geo.computeBoundingSphere();
  return geo;
}

function createConiferBoughGeometry() {
  const segs = 8;
  const geo = new THREE.CylinderGeometry(0.10, 0.50, 1.0, segs, 2, false);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const r = Math.hypot(x, z);
    if (r > 0.02) {
      const ang = Math.atan2(z, x);
      const tipJitter = 1.0 + 0.12 * Math.sin(ang * 3.0 + y * 2.1) + 0.07 * Math.cos(ang * 5.0);
      const flare = y < -0.15 ? 1.06 : y > 0.15 ? 0.85 : 1.12;
      pos.setX(i, x * tipJitter * flare);
      pos.setZ(i, z * tipJitter * flare);
    }
  }
  geo.computeVertexNormals();
  geo.computeBoundingBox();
  geo.computeBoundingSphere();
  return geo;
}

function createEarthenBermGeometry() {
  const segsX = 8;
  const segsZ = 4;
  const cols = segsX + 1;
  const rows = segsZ + 1;
  const positions = new Float32Array(cols * rows * 3);

  for (let iz = 0; iz < rows; iz++) {
    const v = (iz / segsZ) * 2 - 1;
    const absV = Math.abs(v);
    const cross = absV >= 0.999 ? 0 : absV <= 0.36 ? 1.0 : Math.max(0, (1.0 - absV) / 0.64);
    for (let ix = 0; ix < cols; ix++) {
      const u = (ix / segsX) * 2 - 1;
      const absU = Math.abs(u);
      const endTaper = absU >= 0.999 ? 0 : absU <= 0.65 ? 1.0 : Math.max(0, (1.0 - absU) / 0.35);
      const ridgeWave =
        0.88 +
        0.10 * Math.sin(u * 3.4 + 0.6) +
        0.05 * Math.cos(u * 6.2 - v * 2.1);
      const y = Math.min(1.0, Math.max(0, cross * endTaper * ridgeWave));
      const idx = iz * cols + ix;
      positions[idx * 3] = u * 0.5;
      positions[idx * 3 + 1] = y;
      positions[idx * 3 + 2] = v * 0.5;
    }
  }

  const indices = [];
  for (let iz = 0; iz < segsZ; iz++) {
    for (let ix = 0; ix < segsX; ix++) {
      const a = iz * cols + ix;
      const b = a + 1;
      const c = a + cols;
      const d = c + 1;
      if ((ix + iz) % 2 === 0) {
        indices.push(a, c, b, b, c, d);
      } else {
        indices.push(a, c, d, a, d, b);
      }
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  geo.computeBoundingBox();
  geo.computeBoundingSphere();
  return geo;
}

function createShedRoofGeometry() {
  const positions = new Float32Array([
    -0.5, 0, -0.5,
    -0.5, 0, 0.5,
    -0.5, 1, 0,
    0.5, 0, -0.5,
    0.5, 0, 0.5,
    0.5, 1, 0
  ]);
  const indices = [
    0, 1, 2,
    3, 5, 4,
    0, 2, 5, 0, 5, 3,
    1, 4, 5, 1, 5, 2,
    0, 3, 4, 0, 4, 1
  ];
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  geo.computeBoundingBox();
  geo.computeBoundingSphere();
  return geo;
}

/**
 * Builds distinct, lightweight instanced perimeter skyline backdrops tailored to each of the 6 CS:GO maps.
 * Every geometry, material, texture, and InstancedMesh is tracked in `game.arenaGeometries`,
 * `game.arenaMaterials`, `game.arenaTextures`, and `game.arenaDecorMeshes` for 100% zero-leak disposal.
 */
function buildCsgoPerimeterSkyline(game, canonicalMapId, preset, halfSize) {
  const cylSegs = Math.min(14, Math.max(8, game?.quality?.cylinderSegments || 12));
  const perimeterBatches = new Map();

  const registerGeo = (geo) => {
    game.arenaGeometries.add(geo);
    return geo;
  };
  const registerMat = (mat) => {
    game.arenaMaterials.add(mat);
    return mat;
  };
  const addMesh = (geo, mat, x, y, z, sx, sy, sz, rx = 0, ry = 0, rz = 0) => {
    let byMat = perimeterBatches.get(geo);
    if (!byMat) perimeterBatches.set(geo, (byMat = new Map()));
    let items = byMat.get(mat);
    if (!items) byMat.set(mat, (items = []));
    items.push([x, y, z, sx, sy, sz, rx, ry, rz]);
  };

  if (canonicalMapId === 'de_dust2' || canonicalMapId === 'de_mirage') {
    const isMirage = canonicalMapId === 'de_mirage';
    const facadeTex = createSkylineFacadeTexture(game, 'moroccan');
    const stuccoMat = registerMat(
      new THREE.MeshStandardMaterial({
        map: facadeTex,
        color: preset.skylineTint,
        roughness: 0.88,
        metalness: 0.03
      })
    );
    const trimMat = registerMat(
      new THREE.MeshStandardMaterial({
        color: isMirage ? 0xd8bd92 : 0xcab28e,
        roughness: 0.85,
        metalness: 0.04
      })
    );
    const domeMat = registerMat(
      new THREE.MeshStandardMaterial({
        color: isMirage ? 0xc8955c : 0xb48a5c,
        roughness: 0.80,
        metalness: 0.05
      })
    );
    const finialMat = registerMat(
      new THREE.MeshStandardMaterial({
        color: 0x8a6d42,
        roughness: 0.52,
        metalness: 0.36
      })
    );

    const boxGeo = registerGeo(new THREE.BoxGeometry(1, 1, 1));
    const domeGeo = registerGeo(new THREE.SphereGeometry(0.5, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.55));
    const spireGeo = registerGeo(new THREE.CylinderGeometry(0.08, 0.42, 1, 8));

    const count = 24;
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2;
      const cosA = Math.cos(angle);
      const sinA = Math.sin(angle);
      const cheb = Math.max(Math.abs(cosA), Math.abs(sinA));
      const dist = (halfSize + 18 + (i % 3) * 10) / cheb;
      const tx = cosA * dist;
      const tz = sinA * dist;
      const yaw = -angle + Math.PI / 2;
      const arch = i % 4;

      if (arch === 0) {
        const bw = 16 + (i % 3) * 3;
        const bd = 12 + (i % 2) * 3;
        const bh = (isMirage ? 15 : 13) + (i % 3) * 3;
        addMesh(boxGeo, stuccoMat, tx, bh * 0.5 - 2, tz, bw, bh, bd, 0, yaw, 0);
        addMesh(boxGeo, trimMat, tx, bh - 1.5, tz, bw + 0.6, 1.0, bd + 0.6, 0, yaw, 0);
        addMesh(boxGeo, trimMat, tx - cosA * 2.2, bh + 0.6, tz - sinA * 2.2, bw * 0.35, 3.2, bd * 0.35, 0, yaw, 0);
      } else if (arch === 1) {
        // Domed Moroccan mosque / Mirage palace pavilion
        const tw = (isMirage ? 14 : 12) + (i % 2) * 2.5;
        const th = (isMirage ? 20 : 18) + (i % 3) * 3.5;
        addMesh(boxGeo, stuccoMat, tx, th * 0.5 - 2, tz, tw, th, tw, 0, yaw, 0);
        addMesh(boxGeo, trimMat, tx, th - 1.4, tz, tw * 1.08, 1.2, tw * 1.08, 0, yaw, 0);
        addMesh(domeGeo, domeMat, tx, th - 1.0, tz, tw * 0.72, tw * 0.54, tw * 0.72);
        addMesh(spireGeo, finialMat, tx, th - 1.0 + tw * 0.34, tz, 0.45, 2.4, 0.45);
      } else if (arch === 2) {
        // Slender Moroccan minaret with balcony collar, lantern dome & finial
        const th = (isMirage ? 27 : 25) + ((i * 5) % 10);
        const tw = 5.2 + (i % 2) * 0.8;
        addMesh(boxGeo, trimMat, tx, th * 0.18 - 2, tz, tw * 1.55, th * 0.36, tw * 1.55, 0, yaw, 0);
        addMesh(boxGeo, stuccoMat, tx, th * 0.5 - 2, tz, tw, th, tw, 0, yaw, 0);
        addMesh(boxGeo, trimMat, tx, th - 4.8, tz, tw * 1.38, 1.1, tw * 1.38, 0, yaw, 0);
        addMesh(domeGeo, domeMat, tx, th - 2.0, tz, tw * 0.82, tw * 0.76, tw * 0.82);
        addMesh(spireGeo, finialMat, tx, th - 0.3 + tw * 0.4, tz, 0.4, 2.8, 0.4);
      } else {
        const th = 16 + ((i * 5) % 10);
        const tw = 11 + (i % 3) * 2.2;
        addMesh(boxGeo, stuccoMat, tx, th * 0.5 - 2, tz, tw, th, tw * 1.1, 0, yaw, 0);
        addMesh(boxGeo, domeMat, tx, th - 1.55, tz, tw + 0.5, 0.9, tw * 1.1 + 0.5, 0, yaw, 0);
      }
    }
  } else if (canonicalMapId === 'de_inferno') {
    const facadeTex = createSkylineFacadeTexture(game, 'tuscan');
    const villaMat = registerMat(
      new THREE.MeshStandardMaterial({
        map: facadeTex,
        color: preset.skylineTint,
        roughness: 0.88,
        metalness: 0.03
      })
    );
    const terracottaMat = registerMat(
      new THREE.MeshStandardMaterial({
        color: 0xb45638,
        roughness: 0.82,
        metalness: 0.04
      })
    );
    const stoneTrimMat = registerMat(
      new THREE.MeshStandardMaterial({
        color: 0xcabaa0,
        roughness: 0.86,
        metalness: 0.04
      })
    );
    const belfryVoidMat = registerMat(
      new THREE.MeshStandardMaterial({
        color: 0x3b312a,
        roughness: 0.92,
        metalness: 0.02
      })
    );
    const cypressMat = registerMat(
      new THREE.MeshStandardMaterial({
        color: 0x324c30,
        roughness: 0.90,
        metalness: 0.02
      })
    );
    const trunkMat = registerMat(
      new THREE.MeshStandardMaterial({
        color: 0x5a4636,
        roughness: 0.92,
        metalness: 0.02
      })
    );

    const boxGeo = registerGeo(new THREE.BoxGeometry(1, 1, 1));
    const roofPyrGeo = registerGeo(new THREE.ConeGeometry(0.74, 1, 4));
    const cypressGeo = registerGeo(new THREE.ConeGeometry(0.5, 1, 6));
    const trunkGeo = registerGeo(new THREE.CylinderGeometry(0.35, 0.45, 1, 6));

    // Signature Italian Tuscan Campanile Bell Tower overlooking Church & B-Site
    const bellAngle = -Math.PI * 0.42;
    const bellDist = halfSize + 24;
    const bx = Math.cos(bellAngle) * bellDist;
    const bz = Math.sin(bellAngle) * bellDist;
    const bYaw = -bellAngle + Math.PI / 2;
    addMesh(boxGeo, villaMat, bx, 13.0, bz, 6.6, 30.0, 6.6, 0, bYaw, 0);
    addMesh(boxGeo, stoneTrimMat, bx, 28.4, bz, 7.6, 1.0, 7.6, 0, bYaw, 0);
    addMesh(boxGeo, belfryVoidMat, bx, 31.2, bz, 4.6, 4.6, 4.6, 0, bYaw, 0);
    for (const sx of [-2.4, 2.4]) {
      for (const sz of [-2.4, 2.4]) {
        const px = bx + sx * Math.cos(bYaw) - sz * Math.sin(bYaw);
        const pz = bz + sx * Math.sin(bYaw) + sz * Math.cos(bYaw);
        addMesh(boxGeo, stoneTrimMat, px, 31.2, pz, 1.35, 4.8, 1.35, 0, bYaw, 0);
      }
    }
    addMesh(boxGeo, stoneTrimMat, bx, 33.9, bz, 7.8, 0.8, 7.8, 0, bYaw, 0);
    addMesh(roofPyrGeo, terracottaMat, bx, 37.8, bz, 8.2, 7.2, 8.2, 0, bYaw + Math.PI / 4, 0);

    const count = 24;
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2;
      if (Math.abs(Math.atan2(Math.sin(angle - bellAngle), Math.cos(angle - bellAngle))) < 0.16) continue;
      const cosA = Math.cos(angle);
      const sinA = Math.sin(angle);
      const cheb = Math.max(Math.abs(cosA), Math.abs(sinA));
      const dist = (halfSize + 17 + (i % 3) * 9) / cheb;
      const tx = cosA * dist;
      const tz = sinA * dist;
      const yaw = -angle + Math.PI / 2;
      const arch = i % 3;

      if (arch === 0 || arch === 1) {
        // Tuscan stucco villa with pitched terracotta tiled roof
        const vw = 12 + (i % 3) * 2.8;
        const vd = 10 + (i % 2) * 2.4;
        const vh = 11 + (i % 3) * 2.8;
        const roofH = 3.6 + (i % 2) * 1.1;
        addMesh(boxGeo, villaMat, tx, vh * 0.5 - 2, tz, vw, vh, vd, 0, yaw, 0);
        addMesh(boxGeo, stoneTrimMat, tx, vh - 1.75, tz, vw + 0.5, 0.55, vd + 0.5, 0, yaw, 0);
        addMesh(roofPyrGeo, terracottaMat, tx, vh - 1.5 + roofH * 0.5, tz, vw * 1.06, roofH, vd * 1.06, 0, yaw + Math.PI / 4, 0);
      } else {
        // Tuscan cypress tree cluster
        const perpX = -sinA;
        const perpZ = cosA;
        for (let t = -1; t <= 1; t++) {
          const cx = tx + perpX * (t * 4.2) + cosA * ((t + 1) * 1.6);
          const cz = tz + perpZ * (t * 4.2) + sinA * ((t + 1) * 1.6);
          const ch = 12.5 + ((i + t + 3) % 3) * 2.4;
          const cr = 2.4 + ((i + t + 3) % 2) * 0.5;
          addMesh(trunkGeo, trunkMat, cx, 0.4, cz, 0.7, 4.6, 0.7);
          addMesh(cypressGeo, cypressMat, cx, 2.2 + ch * 0.5, cz, cr, ch, cr);
        }
      }
    }
  } else if (canonicalMapId === 'de_nuke') {
    const facadeTex = createSkylineFacadeTexture(game, 'industrial');
    const facilityMat = registerMat(
      new THREE.MeshStandardMaterial({
        map: facadeTex,
        color: preset.skylineTint,
        roughness: 0.76,
        metalness: 0.16
      })
    );
    const coolingMat = registerMat(
      new THREE.MeshStandardMaterial({
        color: 0xaeb8c2,
        roughness: 0.86,
        metalness: 0.06
      })
    );
    const steelDarkMat = registerMat(
      new THREE.MeshStandardMaterial({
        color: 0x46525e,
        roughness: 0.54,
        metalness: 0.48
      })
    );
    const stackRedMat = registerMat(
      new THREE.MeshStandardMaterial({
        color: 0xb8382c,
        roughness: 0.58,
        metalness: 0.18
      })
    );
    const stackWhiteMat = registerMat(
      new THREE.MeshStandardMaterial({
        color: 0xdce2e8,
        roughness: 0.62,
        metalness: 0.14
      })
    );
    const pineMat = registerMat(
      new THREE.MeshStandardMaterial({
        color: 0x2b4234,
        roughness: 0.92,
        metalness: 0.02
      })
    );

    const boxGeo = registerGeo(new THREE.BoxGeometry(1, 1, 1));
    const cylGeo = registerGeo(new THREE.CylinderGeometry(0.5, 0.5, 1, cylSegs));
    const coolingLowerGeo = registerGeo(new THREE.CylinderGeometry(0.36, 0.50, 1, 16));
    const coolingUpperGeo = registerGeo(new THREE.CylinderGeometry(0.41, 0.36, 1, 16));
    const pineGeo = registerGeo(new THREE.ConeGeometry(0.5, 1, 6));

    // Twin iconic Cedar Creek hyperbolic nuclear cooling towers
    const towerPlacements = [
      { x: -24, z: -(halfSize + 44), h: 46, w: 29 },
      { x: 14, z: -(halfSize + 48), h: 42, w: 26 }
    ];
    for (const ct of towerPlacements) {
      const lowerH = ct.h * 0.68;
      const upperH = ct.h * 0.32;
      addMesh(coolingLowerGeo, coolingMat, ct.x, lowerH * 0.5 - 2, ct.z, ct.w, lowerH, ct.w);
      addMesh(coolingUpperGeo, coolingMat, ct.x, lowerH - 2 + upperH * 0.5, ct.z, ct.w, upperH, ct.w);
      addMesh(cylGeo, steelDarkMat, ct.x, ct.h - 2.3, ct.z, ct.w * 0.84, 0.9, ct.w * 0.84);
      addMesh(cylGeo, steelDarkMat, ct.x, 0.6, ct.z, ct.w * 1.03, 1.4, ct.w * 1.03);
    }

    // Twin red-and-white striped industrial exhaust stacks
    const stackSpecs = [
      { x: halfSize + 28, z: -20, h: 38, d: 3.4 },
      { x: -(halfSize + 30), z: -16, h: 34, d: 3.0 }
    ];
    for (const st of stackSpecs) {
      const segs = 6;
      const segH = st.h / segs;
      for (let s = 0; s < segs; s++) {
        const taper = 1 - (s / segs) * 0.28;
        addMesh(
          cylGeo,
          s % 2 === 0 ? stackWhiteMat : stackRedMat,
          st.x,
          s * segH + segH * 0.5 - 2,
          st.z,
          st.d * taper,
          segH + 0.05,
          st.d * taper
        );
      }
    }

    // Surrounding Cedar Creek turbine halls & northern pine ridge
    const count = 24;
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2;
      const cosA = Math.cos(angle);
      const sinA = Math.sin(angle);
      const cheb = Math.max(Math.abs(cosA), Math.abs(sinA));
      const dist = (halfSize + 20 + (i % 3) * 10) / cheb;
      const tx = cosA * dist;
      const tz = sinA * dist;
      const yaw = -angle + Math.PI / 2;

      if (i % 3 === 0) {
        // Precast concrete turbine hall / warehouse
        const hw = 18 + (i % 2) * 5;
        const hd = 12 + (i % 3) * 2;
        const hh = 13 + (i % 2) * 4;
        addMesh(boxGeo, facilityMat, tx, hh * 0.5 - 2, tz, hw, hh, hd, 0, yaw, 0);
        addMesh(boxGeo, steelDarkMat, tx, hh - 1.5, tz, hw + 0.6, 1.0, hd + 0.6, 0, yaw, 0);
        addMesh(cylGeo, steelDarkMat, tx, hh + 0.8, tz, 3.2, 3.6, 3.2);
      } else {
        // Tiered northern pine trees
        const perpX = -sinA;
        const perpZ = cosA;
        for (let p = -1; p <= 1; p++) {
          const px = tx + perpX * (p * 5.2);
          const pz = tz + perpZ * (p * 5.2);
          const ph = 14 + ((i + p + 3) % 3) * 3.2;
          const pw = 6.2 + ((i + p + 3) % 2) * 1.4;
          addMesh(pineGeo, pineMat, px, ph * 0.36 - 1.5, pz, pw, ph * 0.72, pw);
          addMesh(pineGeo, pineMat, px, ph * 0.72 - 1.5, pz, pw * 0.72, ph * 0.58, pw * 0.72);
        }
      }
    }
  } else if (canonicalMapId === 'fy_iceworld') {
    const graniteMat = registerMat(
      new THREE.MeshStandardMaterial({
        color: 0x99afc2,
        roughness: 0.90,
        metalness: 0.02,
        fog: true
      })
    );
    const snowSlopeMat = registerMat(
      new THREE.MeshStandardMaterial({
        color: 0xdce9f4,
        roughness: 0.86,
        metalness: 0.02,
        fog: true
      })
    );
    const ridgeMistMat = registerMat(
      new THREE.MeshStandardMaterial({
        color: 0xb6cade,
        roughness: 0.94,
        metalness: 0.02,
        fog: true
      })
    );
    const spruceMat = registerMat(
      new THREE.MeshStandardMaterial({
        color: 0x2d4440,
        roughness: 0.92,
        metalness: 0.02,
        flatShading: true,
        fog: true
      })
    );
    const frostedSpruceMat = registerMat(
      new THREE.MeshStandardMaterial({
        color: 0x465f5b,
        roughness: 0.90,
        metalness: 0.02,
        flatShading: true,
        fog: true
      })
    );
    const trunkMat = registerMat(
      new THREE.MeshStandardMaterial({
        color: 0x3b322b,
        roughness: 0.94,
        metalness: 0.02,
        fog: true
      })
    );

    const ridgeGeo = registerGeo(createAlpineRidgeGeometry(0.0));
    const snowSlopeGeo = registerGeo(createAlpineRidgeGeometry(0.0, { snowMantle: true }));
    const mistRidgeGeo = registerGeo(createAlpineRidgeGeometry(1.9));
    const boughGeo = registerGeo(createConiferBoughGeometry());
    const trunkGeo = registerGeo(new THREE.CylinderGeometry(0.18, 0.28, 1.0, 7));

    const count = 16;
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2;
      const cosA = Math.cos(angle);
      const sinA = Math.sin(angle);
      const cheb = Math.max(Math.abs(cosA), Math.abs(sinA));
      const yaw = -angle + Math.PI / 2 + ((i % 3) - 1) * 0.14;

      // Broad smooth distant alpine granite massif + draped snowfields (strictly outside halfSize + ridgeW * 0.5 + 24)
      const ridgeW = 48 + (i % 4) * 5;
      const ridgeD = ridgeW * 0.56;
      const ridgeH = 16 + ((i * 5) % 7);
      const dist = (halfSize + ridgeW * 0.5 + 24 + (i % 3) * 8) / cheb;
      const tx = cosA * dist;
      const tz = sinA * dist;

      addMesh(ridgeGeo, graniteMat, tx, -2.5, tz, ridgeW, ridgeH, ridgeD, 0, yaw, 0);
      addMesh(snowSlopeGeo, snowSlopeMat, tx, -2.5, tz, ridgeW, ridgeH, ridgeD, 0, yaw, 0);

      // Secondary misty distant ridge range staggered between foreground massifs for soft horizon depth
      if (i % 2 === 0 || i % 3 === 1) {
        const mistAngle = angle + Math.PI / count;
        const mCos = Math.cos(mistAngle);
        const mSin = Math.sin(mistAngle);
        const mCheb = Math.max(Math.abs(mCos), Math.abs(mSin));
        const mistW = 60 + (i % 3) * 7;
        const mistD = mistW * 0.54;
        const mistH = 22 + ((i * 3) % 7);
        const mDist = (halfSize + mistW * 0.5 + 34 + (i % 2) * 10) / mCheb;
        const mYaw = -mistAngle + Math.PI / 2;
        addMesh(mistRidgeGeo, ridgeMistMat, mCos * mDist, -2.8, mSin * mDist, mistW, mistH, mistD, 0, mYaw, 0);
      }

      // Stepped-tier dark boreal conifers (zero bright white cone hats)
      if (i % 2 === 0) {
        const treeDist = (halfSize + 10 + (i % 3) * 2.5) / cheb;
        const sx = cosA * treeDist;
        const sz = sinA * treeDist;
        const th = 14.5 + (i % 3) * 2.2;
        const baseW = 4.6 + (i % 2) * 0.6;
        addMesh(trunkGeo, trunkMat, sx, th * 0.22 - 1.5, sz, 0.85, th * 0.44, 0.85);
        addMesh(boughGeo, spruceMat, sx, th * 0.36 - 1.5, sz, baseW, th * 0.34, baseW, 0, yaw, 0);
        addMesh(boughGeo, spruceMat, sx, th * 0.56 - 1.5, sz, baseW * 0.78, th * 0.30, baseW * 0.78, 0, yaw + 0.42, 0);
        addMesh(boughGeo, frostedSpruceMat, sx, th * 0.74 - 1.5, sz, baseW * 0.56, th * 0.26, baseW * 0.56, 0, yaw + 0.84, 0);
        addMesh(boughGeo, frostedSpruceMat, sx, th * 0.90 - 1.5, sz, baseW * 0.34, th * 0.20, baseW * 0.34, 0, yaw + 1.26, 0);
      }
    }
  } else {
    // aim_map: Clean CS2 industrial training range — sheds, weathered earthen berm ridges & steel range towers
    const facadeTex = createSkylineFacadeTexture(game, 'industrial');
    const warehouseMat = registerMat(
      new THREE.MeshStandardMaterial({
        map: facadeTex,
        color: preset.skylineTint,
        roughness: 0.82,
        metalness: 0.12
      })
    );
    const brickMat = registerMat(
      new THREE.MeshStandardMaterial({
        color: 0xa26050,
        roughness: 0.88,
        metalness: 0.04
      })
    );
    const roofMat = registerMat(
      new THREE.MeshStandardMaterial({
        color: 0x5c6874,
        roughness: 0.56,
        metalness: 0.38
      })
    );
    const steelMat = registerMat(
      new THREE.MeshStandardMaterial({
        color: 0x46515d,
        roughness: 0.52,
        metalness: 0.48
      })
    );
    const bermMat = registerMat(
      new THREE.MeshStandardMaterial({
        color: 0x6f776d,
        roughness: 0.96,
        metalness: 0.01,
        flatShading: true,
        fog: true
      })
    );

    const boxGeo = registerGeo(new THREE.BoxGeometry(1, 1, 1));
    const cylGeo = registerGeo(new THREE.CylinderGeometry(0.5, 0.5, 1, cylSegs));
    const bermGeo = registerGeo(createEarthenBermGeometry());
    const shedRoofGeo = registerGeo(createShedRoofGeometry());

    const count = 20;
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2;
      const cosA = Math.cos(angle);
      const sinA = Math.sin(angle);
      const cheb = Math.max(Math.abs(cosA), Math.abs(sinA));
      const dist = (halfSize + 19 + (i % 3) * 8) / cheb;
      const tx = cosA * dist;
      const tz = sinA * dist;
      const yaw = -angle + Math.PI / 2;
      const arch = i % 4;

      if (arch === 0 || arch === 2) {
        // Low-profile distant industrial training range shed with pitched corrugated roof
        const ww = 16 + (i % 3) * 4;
        const wd = 11 + (i % 2) * 3;
        const wh = 12.5 + (i % 3) * 2.2;
        const roofH = 2.6 + (i % 2) * 0.7;
        addMesh(boxGeo, arch === 0 ? warehouseMat : brickMat, tx, wh * 0.5 - 2, tz, ww, wh, wd, 0, yaw, 0);
        addMesh(boxGeo, roofMat, tx, wh - 1.9, tz, ww + 0.7, 0.36, wd + 0.7, 0, yaw, 0);
        addMesh(shedRoofGeo, roofMat, tx, wh - 1.72, tz, ww + 0.6, roofH, wd + 0.6, 0, yaw, 0);
      } else if (arch === 1) {
        // Weathered trapezoidal earthen firing-range berm ridge pushed into fog (zero smooth spheres)
        const bermW = 36 + (i % 3) * 6;
        const bermD = 16 + (i % 2) * 3;
        const bermH = 13.5 + (i % 2) * 3.5;
        const bDist = (halfSize + bermW * 0.5 + 18 + (i % 2) * 10) / cheb;
        const bx = cosA * bDist;
        const bz = sinA * bDist;
        addMesh(bermGeo, bermMat, bx, -2.2, bz, bermW, bermH, bermD, 0, yaw, 0);
      } else {
        // Steel range observation / water tower on outer corners
        const th = 18.5 + (i % 2) * 3.5;
        const legSpan = 2.0;
        const legCos = Math.cos(yaw);
        const legSin = Math.sin(yaw);
        for (const lx of [-legSpan, legSpan]) {
          for (const lz of [-legSpan, legSpan]) {
            const px = tx + lx * legCos + lz * legSin;
            const pz = tz - lx * legSin + lz * legCos;
            addMesh(boxGeo, steelMat, px, th * 0.40 - 2, pz, 0.38, th * 0.80, 0.38, 0, yaw, 0);
          }
        }
        const deckTopY = th * 0.78 - 1.78;
        addMesh(boxGeo, roofMat, tx, deckTopY - 0.225, tz, 5.4, 0.45, 5.4, 0, yaw, 0);
        addMesh(cylGeo, warehouseMat, tx, deckTopY + 2.2, tz, 5.6, 4.4, 5.6);
        addMesh(cylGeo, roofMat, tx, deckTopY + 4.55, tz, 6.0, 0.55, 6.0);
        addMesh(cylGeo, steelMat, tx, deckTopY + 5.75, tz, 0.28, 2.2, 0.28);
      }
    }
  }

  const dummy = new THREE.Object3D();
  for (const [geo, byMat] of perimeterBatches) {
    for (const [mat, items] of byMat) {
      const inst = new THREE.InstancedMesh(geo, mat, items.length);
      inst.name = `csgoSkyline_${canonicalMapId}`;
      for (let k = 0; k < items.length; k++) {
        const [x, y, z, sx, sy, sz, rx, ry, rz] = items[k];
        dummy.position.set(x, y, z);
        dummy.rotation.set(rx, ry, rz);
        dummy.scale.set(sx, sy, sz);
        dummy.updateMatrix();
        inst.setMatrixAt(k, dummy.matrix);
      }
      inst.instanceMatrix.needsUpdate = true;
      inst.frustumCulled = false;
      inst.updateMatrix();
      inst.matrixAutoUpdate = false;
      game.scene.add(inst);
      game.arenaDecorMeshes.push(inst);
    }
  }
}

export function buildSkyAndAtmosphere(game, theme = {}, halfSize = 38) {
  const canonicalMapId = resolveAtmosphereMapId(game?.currentMapId);
  const preset = getMapAtmospherePreset(canonicalMapId, theme);
  const envEnabled = (game?.quality?.envMapSize ?? 512) > 0;

  // Ensure obsolete harbor ocean water references remain cleanly cleared
  game.saltlineHarborWater = null;
  game.harborWaterUniform = null;

  // 0. Bind Synchronous Procedural IBL Environment Map for Frame 0 & Headless Node Tests
  const envMap = envEnabled ? createProceduralEnvironmentMap(game, theme) : null;
  game.activeEnvMap = envMap;
  if (envMap) {
    game.scene.environment = envMap;
    if ('environmentIntensity' in game.scene) {
      game.scene.environmentIntensity = getMapEnvironmentIntensity(canonicalMapId, theme);
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
  void applyDustHdriSky(game, skyDome, canonicalMapId);

  // Distant 3D mountain/hill silhouette ring (Medium/High tiers; omitted on Low for triangle savings)
  if (envEnabled) {
    buildDistantMountainRing(game, preset, canonicalMapId);
  }

  // 2. Map-specific batched CS:GO perimeter skyline backdrops (0.00 leak disposal via arenaGeometries/Materials/DecorMeshes)
  buildCsgoPerimeterSkyline(game, canonicalMapId, preset, halfSize);

  // 3. Subtle Sunlit Atmospheric Dust Motes / Soft Snow inside Arena (exact vertex count preserved for tests)
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
    const softTex = createSoftParticleTexture(game);
    const particleCfg = getAmbientParticleConfig(canonicalMapId, preset);
    const pMat = new THREE.PointsMaterial({
      color: particleCfg.color,
      map: softTex,
      size: particleCfg.size,
      transparent: true,
      opacity: particleCfg.opacity,
      alphaTest: 0.01,
      depthWrite: false,
      sizeAttenuation: true
    });
    game.ambientParticles = new THREE.Points(pGeo, pMat);
    game.scene.add(game.ambientParticles);
    game.skyObjects.push(game.ambientParticles);
  }

  // 4. High-Altitude Circling Sky Swifts (Medium & High sunlit arenas: de_dust2, de_mirage, de_inferno)
  buildSkySwifts(game, canonicalMapId, halfSize);
}
