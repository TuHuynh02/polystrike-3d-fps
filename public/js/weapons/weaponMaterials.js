import * as THREE from '../three.js';
import { roundedBox } from './roundedBox.js';

const WEAPON_TEX_CACHE = new Map();
const WEAPON_GEO_CACHE = new Map();
export const WEAPON_MAT_CACHE = new Map();
let WATCH_DIAL_TEX = null;
let ROLLMARK_MAT = null;

function hash2d(x, y, seed = 1337) {
  let n = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed, 1442695041);
  n = (n ^ (n >>> 13)) >>> 0;
  n = Math.imul(n, 1274126177) >>> 0;
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
}

/**
 * Creates cached 512x512 procedural PBR materials (neutral/tonal detail modulation diffuse + crisp bump relief)
 * for Saltline ordnance finishes: manganese phosphate gunmetal, brushed CNC stainless steel,
 * glass-filled diamond-stippled polymer, oiled Russian walnut, ripstop softshell, Cordura nylon, and goatskin leather.
 */
export function createProceduralMaterial(type = 'gunmetal', baseHex = 0x1e293b, extraParams = {}) {
  const texVariant = type === 'wood' ? `wood_${baseHex}` : type;
  const matCacheKey = `${type}_${baseHex}_${extraParams.roughness ?? ''}_${extraParams.metalness ?? ''}_${extraParams.bumpScale ?? ''}_${extraParams.envMapIntensity ?? ''}_${extraParams.flatShading ?? ''}_${extraParams.side ?? ''}`;
  const cachedMat = WEAPON_MAT_CACHE.get(matCacheKey);
  if (cachedMat) {
    return cachedMat;
  }

  let texPair = WEAPON_TEX_CACHE.get(texVariant);

  if (!texPair && typeof document !== 'undefined') {
    const size = 512;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');

    const bumpCanvas = document.createElement('canvas');
    bumpCanvas.width = size;
    bumpCanvas.height = size;
    const bCtx = bumpCanvas.getContext('2d');

    // Keep diffuse texture in bright modulation range so MeshStandardMaterial.color is never crushed dark
    ctx.fillStyle = type === 'wood' ? '#d9b596' : '#ebebee';
    ctx.fillRect(0, 0, size, size);

    bCtx.fillStyle = '#808080';
    bCtx.fillRect(0, 0, size, size);

    if (type === 'gunmetal' || type === 'steel' || type === 'metal') {
      // Fine brushed CNC toolpath streaks + parkerized micro-crystalline grain
      const isBrightSteel = type === 'steel';
      for (let y = 0; y < size; y += 2) {
        const h = hash2d(y, 3, 41);
        const alpha = isBrightSteel ? (0.025 + h * 0.055) : (0.02 + h * 0.045);
        const light = h > 0.48;
        ctx.fillStyle = light ? `rgba(255,255,255,${alpha.toFixed(3)})` : `rgba(24,32,42,${alpha.toFixed(3)})`;
        ctx.fillRect(0, y, size, 1);

        const bVal = light ? Math.round(134 + h * 26) : Math.round(104 + h * 22);
        bCtx.fillStyle = `rgb(${bVal},${bVal},${bVal})`;
        bCtx.fillRect(0, y, size, 1);
      }
      // Broken anisotropic CNC brushing dashes so striations don't look flat
      for (let i = 0; i < 1400; i++) {
        const rx = Math.floor(hash2d(i, 7, 91) * size);
        const ry = Math.floor(hash2d(i, 13, 91) * size);
        const len = 14 + Math.floor(hash2d(i, 19, 91) * 46);
        const bright = hash2d(i, 23, 91) > 0.45;
        ctx.fillStyle = bright ? 'rgba(255,255,255,0.048)' : 'rgba(15,20,28,0.055)';
        ctx.fillRect(rx, ry, len, 1);
        bCtx.fillStyle = bright ? '#969696' : '#6c6c6c';
        bCtx.fillRect(rx, ry, len, 1);
      }
      // Parkerized micro-crystalline speckle
      for (let i = 0; i < 2200; i++) {
        const rx = Math.floor(hash2d(i, 31, 203) * size);
        const ry = Math.floor(hash2d(i, 37, 203) * size);
        const sz = (i % 3) + 1;
        ctx.fillStyle = i % 2 === 0 ? 'rgba(255,255,255,0.028)' : 'rgba(12,16,24,0.042)';
        ctx.fillRect(rx, ry, sz, sz);
        bCtx.fillStyle = i % 2 === 0 ? '#8c8c8c' : '#737373';
        bCtx.fillRect(rx, ry, sz, sz);
      }
    } else if (type === 'polymer' || type === 'grip') {
      // Tactical diamond stippling & glass-filled nylon micro-grain
      const cell = type === 'grip' ? 6 : 8;
      for (let y = 0; y < size; y += cell) {
        for (let x = 0; x < size; x += cell) {
          const offset = ((y / cell) & 1) * (cell * 0.5);
          const cx = (x + offset) % size;
          const n = hash2d(x, y, 509);
          // Recessed stipple valley
          ctx.fillStyle = `rgba(18,22,28,${(0.065 + n * 0.045).toFixed(3)})`;
          ctx.fillRect(cx, y, cell - 1, cell - 1);
          bCtx.fillStyle = '#565656';
          bCtx.fillRect(cx, y, cell - 1, cell - 1);
          // Raised diamond pyramid peak
          const inner = Math.max(2, Math.floor(cell * 0.55));
          ctx.fillStyle = n > 0.42 ? 'rgba(255,255,255,0.062)' : 'rgba(225,232,240,0.038)';
          ctx.fillRect(cx + 1, y + 1, inner, inner);
          bCtx.fillStyle = n > 0.5 ? '#b8b8b8' : '#a4a4a4';
          bCtx.fillRect(cx + 1, y + 1, inner, inner);
        }
      }
      // Subtle molded fiber fleck
      for (let i = 0; i < 1200; i++) {
        const rx = Math.floor(hash2d(i, 5, 701) * size);
        const ry = Math.floor(hash2d(i, 11, 701) * size);
        ctx.fillStyle = i % 2 === 0 ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.045)';
        ctx.fillRect(rx, ry, 2, 2);
      }
    } else if (type === 'bdu' || type === 'cordura') {
      // Authentic ripstop nylon/softshell weave with heavier reinforcing cross-grid every 16px
      const step = type === 'cordura' ? 4 : 5;
      for (let y = 0; y < size; y += step) {
        const isRipstop = y % 16 < step;
        ctx.fillStyle = isRipstop ? 'rgba(255,255,255,0.075)' : 'rgba(255,255,255,0.035)';
        ctx.fillRect(0, y, size, isRipstop ? 2 : 1);
        bCtx.fillStyle = isRipstop ? '#a6a6a6' : '#929292';
        bCtx.fillRect(0, y, size, isRipstop ? 2 : 1);
      }
      for (let x = 0; x < size; x += step) {
        const isRipstop = x % 16 < step;
        ctx.fillStyle = isRipstop ? 'rgba(15,20,28,0.115)' : 'rgba(15,20,28,0.055)';
        ctx.fillRect(x, 0, isRipstop ? 2 : 1, size);
        bCtx.fillStyle = isRipstop ? '#5c5c5c' : '#6e6e6e';
        bCtx.fillRect(x, 0, isRipstop ? 2 : 1, size);
      }
      // Subtle woven slub variation
      for (let i = 0; i < 900; i++) {
        const rx = Math.floor(hash2d(i, 17, 313) * size);
        const ry = Math.floor(hash2d(i, 29, 313) * size);
        ctx.fillStyle = i % 2 === 0 ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.04)';
        ctx.fillRect(rx, ry, 6, 2);
      }
    } else if (type === 'leather') {
      // Organic goatskin tactical glove pebble grain + subtle flex creases
      for (let y = 0; y < size; y += 4) {
        for (let x = 0; x < size; x += 4) {
          const grain = hash2d(x, y, 823);
          const jx = Math.floor(hash2d(x, y, 829) * 2);
          const jy = Math.floor(hash2d(x, y, 839) * 2);
          ctx.fillStyle = grain > 0.45 ? 'rgba(255,255,255,0.052)' : 'rgba(12,14,18,0.075)';
          ctx.fillRect(x + jx, y + jy, 3, 3);
          bCtx.fillStyle = grain > 0.45 ? '#9e9e9e' : '#606060';
          bCtx.fillRect(x + jx, y + jy, 3, 3);
        }
      }
      for (let c = 0; c < 18; c++) {
        const cy = Math.floor(hash2d(c, 1, 907) * size);
        ctx.strokeStyle = 'rgba(10,12,16,0.08)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, cy);
        for (let x = 32; x <= size; x += 32) {
          ctx.lineTo(x, cy + Math.sin(x * 0.025 + c) * 6);
        }
        ctx.stroke();
      }
    } else if (type === 'wood') {
      // Rich oiled Russian walnut / military laminated stock with flowing sinusoidal wood-ring fibers & pores
      const col = new THREE.Color(baseHex);
      const heartwood = col.clone().lerp(new THREE.Color(0xffffff), 0.72);
      const darkRing = col.clone().multiplyScalar(1.35).lerp(new THREE.Color(0x5a341d), 0.55);
      const warmFigure = new THREE.Color(0xf6dfc6);

      ctx.fillStyle = `#${heartwood.getHexString()}`;
      ctx.fillRect(0, 0, size, size);

      // Flowing sinusoidal growth-ring bands
      for (let band = 0; band < 44; band++) {
        const baseY = (band / 44) * size;
        const amp = 6 + hash2d(band, 3, 613) * 14;
        const freq = 0.012 + hash2d(band, 9, 613) * 0.012;
        const phase = hash2d(band, 15, 613) * Math.PI * 2;
        const isDark = band % 2 === 0;

        ctx.strokeStyle = isDark
          ? `rgba(${Math.round(darkRing.r * 255)},${Math.round(darkRing.g * 255)},${Math.round(darkRing.b * 255)},0.34)`
          : `rgba(${Math.round(warmFigure.r * 255)},${Math.round(warmFigure.g * 255)},${Math.round(warmFigure.b * 255)},0.24)`;
        ctx.lineWidth = 2 + hash2d(band, 21, 613) * 4.5;
        ctx.beginPath();
        ctx.moveTo(0, baseY);
        for (let x = 16; x <= size; x += 16) {
          const yOff = Math.sin(x * freq + phase) * amp + Math.cos(x * freq * 2.1 - phase) * (amp * 0.3);
          ctx.lineTo(x, baseY + yOff);
        }
        ctx.stroke();

        bCtx.strokeStyle = isDark ? '#686868' : '#969696';
        bCtx.lineWidth = 1.5;
        bCtx.beginPath();
        bCtx.moveTo(0, baseY);
        for (let x = 16; x <= size; x += 16) {
          const yOff = Math.sin(x * freq + phase) * amp + Math.cos(x * freq * 2.1 - phase) * (amp * 0.3);
          bCtx.lineTo(x, baseY + yOff);
        }
        bCtx.stroke();
      }
      // Longitudinal dark walnut vessel pores
      for (let i = 0; i < 1600; i++) {
        const rx = Math.floor(hash2d(i, 41, 641) * size);
        const ry = Math.floor(hash2d(i, 43, 641) * size);
        const plen = 6 + Math.floor(hash2d(i, 47, 641) * 18);
        ctx.fillStyle = 'rgba(42,20,8,0.22)';
        ctx.fillRect(rx, ry, plen, 1);
        bCtx.fillStyle = '#5a5a5a';
        bCtx.fillRect(rx, ry, plen, 1);
      }
    } else if (type === 'carbon') {
      // 2x2 twill carbon weave
      for (let y = 0; y < size; y += 6) {
        for (let x = 0; x < size; x += 6) {
          const diag = (Math.floor(x / 6) + Math.floor(y / 6)) % 2 === 0;
          ctx.fillStyle = diag ? 'rgba(255,255,255,0.08)' : 'rgba(12,16,24,0.16)';
          ctx.fillRect(x, y, 5, 5);
          bCtx.fillStyle = diag ? '#a6a6a6' : '#585858';
          bCtx.fillRect(x, y, 5, 5);
        }
      }
    }

    const map = new THREE.CanvasTexture(canvas);
    map.wrapS = THREE.RepeatWrapping;
    map.wrapT = THREE.RepeatWrapping;
    map.colorSpace = THREE.SRGBColorSpace;
    map.anisotropy = 4;
    map.userData = { shared: true };

    const bumpMap = new THREE.CanvasTexture(bumpCanvas);
    bumpMap.wrapS = THREE.RepeatWrapping;
    bumpMap.wrapT = THREE.RepeatWrapping;
    bumpMap.anisotropy = 4;
    bumpMap.userData = { shared: true };

    texPair = { map, bumpMap };
    WEAPON_TEX_CACHE.set(texVariant, texPair);
  }

  const presets = {
    gunmetal: { roughness: 0.34, metalness: 0.86, bumpScale: 0.0085, envMapIntensity: 1.65 },
    steel: { roughness: 0.22, metalness: 0.92, bumpScale: 0.007, envMapIntensity: 1.65 },
    metal: { roughness: 0.28, metalness: 0.88, bumpScale: 0.008, envMapIntensity: 1.65 },
    polymer: { roughness: 0.60, metalness: 0.12, bumpScale: 0.016, envMapIntensity: 1.05 },
    grip: { roughness: 0.66, metalness: 0.08, bumpScale: 0.020, envMapIntensity: 0.95 },
    bdu: { roughness: 0.84, metalness: 0.04, bumpScale: 0.018, envMapIntensity: 0.85 },
    cordura: { roughness: 0.74, metalness: 0.06, bumpScale: 0.020, envMapIntensity: 0.92 },
    leather: { roughness: 0.48, metalness: 0.10, bumpScale: 0.014, envMapIntensity: 1.08 },
    wood: { roughness: 0.38, metalness: 0.05, bumpScale: 0.015, envMapIntensity: 1.15 },
    carbon: { roughness: 0.30, metalness: 0.44, bumpScale: 0.014, envMapIntensity: 1.30 }
  }[type] || { roughness: 0.42, metalness: 0.5, bumpScale: 0.010, envMapIntensity: 1.0 };

  const mat = new THREE.MeshStandardMaterial({
    color: baseHex,
    map: texPair ? texPair.map : null,
    bumpMap: texPair ? texPair.bumpMap : null,
    bumpScale: extraParams.bumpScale ?? presets.bumpScale,
    roughness: extraParams.roughness ?? presets.roughness,
    metalness: extraParams.metalness ?? presets.metalness,
    envMapIntensity: extraParams.envMapIntensity ?? presets.envMapIntensity,
    flatShading: false,
    ...extraParams
  });
  mat.userData = { ...(mat.userData || {}), shared: true };
  WEAPON_MAT_CACHE.set(matCacheKey, mat);
  return mat;
}

export function getWatchDialTexture() {
  if (!WATCH_DIAL_TEX && typeof document !== 'undefined') {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#070b10';
    ctx.fillRect(0, 0, 128, 128);

    ctx.strokeStyle = 'rgba(212, 148, 42, 0.82)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(64, 64, 55, 0, Math.PI * 2);
    ctx.stroke();

    for (let t = 0; t < 12; t++) {
      const a = (t / 12) * Math.PI * 2;
      ctx.strokeStyle = t % 3 === 0 ? '#e2e8f0' : 'rgba(148, 163, 184, 0.50)';
      ctx.lineWidth = t % 3 === 0 ? 2.2 : 1.2;
      ctx.beginPath();
      ctx.moveTo(64 + Math.cos(a) * 47, 64 + Math.sin(a) * 47);
      ctx.lineTo(64 + Math.cos(a) * 53, 64 + Math.sin(a) * 53);
      ctx.stroke();
    }

    ctx.fillStyle = '#94a3b8';
    ctx.font = 'bold 9px Consolas, monospace';
    ctx.textAlign = 'center';
    ctx.fillText('SALTLINE', 64, 41);
    ctx.fillStyle = '#f1f5f9';
    ctx.font = 'bold 22px Consolas, monospace';
    ctx.fillText('09:45', 64, 67);
    ctx.fillStyle = '#d4942a';
    ctx.font = 'bold 10px Consolas, monospace';
    ctx.fillText('B04 // 042', 64, 86);

    WATCH_DIAL_TEX = new THREE.CanvasTexture(canvas);
    WATCH_DIAL_TEX.userData = { shared: true };
  }
  return WATCH_DIAL_TEX;
}

export function getSaltlineRollmarkMaterial() {
  if (ROLLMARK_MAT) return ROLLMARK_MAT;
  let tex = null;
  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#151a22';
    ctx.fillRect(0, 0, 256, 64);
    ctx.strokeStyle = 'rgba(203, 213, 225, 0.42)';
    ctx.lineWidth = 2;
    ctx.strokeRect(4, 4, 248, 56);
    ctx.fillStyle = 'rgba(212, 148, 42, 0.88)';
    ctx.fillRect(10, 10, 5, 44);
    ctx.fillStyle = 'rgba(241, 245, 249, 0.86)';
    ctx.font = 'bold 16px Consolas, monospace';
    ctx.fillText('SALTLINE ORD // B-04', 22, 29);
    ctx.fillStyle = 'rgba(148, 163, 184, 0.82)';
    ctx.font = 'bold 12px Consolas, monospace';
    ctx.fillText('SN 04-8821 • NATO SPEC', 22, 48);
    tex = new THREE.CanvasTexture(canvas);
    tex.userData = { shared: true };
  }
  ROLLMARK_MAT = new THREE.MeshStandardMaterial({
    color: 0xdbe4ee,
    map: tex,
    roughness: 0.36,
    metalness: 0.78,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -2
  });
  ROLLMARK_MAT.userData = { shared: true };
  WEAPON_MAT_CACHE.set('shared_saltline_rollmark', ROLLMARK_MAT);
  return ROLLMARK_MAT;
}

// ==================== CNC GUNSMITH & ANATOMICAL LOFT GEOMETRY GENERATORS ====================

/**
 * Extrudes an 8-sided chamfered billet receiver / pistol slide profile along Z in [-length/2, +length/2]
 * with crisp flat-shaded CNC bevel normals so receivers catch realistic specular edge highlights.
 */
export function createChamferedBlockGeometry(
  width,
  height,
  length,
  topChamferX = width * 0.22,
  topChamferY = height * 0.24,
  botChamferX = width * 0.14,
  botChamferY = height * 0.16
) {
  const hw = width * 0.5;
  const hh = height * 0.5;
  const hz = length * 0.5;
  const tcx = Math.min(hw * 0.48, topChamferX);
  const tcy = Math.min(hh * 0.48, topChamferY);
  const bcx = Math.min(hw * 0.48, botChamferX);
  const bcy = Math.min(hh * 0.48, botChamferY);

  // 8-point octagonal cross-section in XY (CCW)
  const ring = [
    [-hw + bcx, -hh],
    [hw - bcx, -hh],
    [hw, -hh + bcy],
    [hw, hh - tcy],
    [hw - tcx, hh],
    [-hw + tcx, hh],
    [-hw, hh - tcy],
    [-hw, -hh + bcy]
  ];

  // 8 side quads + front cap (6 tris) + back cap (6 tris)
  const sideVerts = 8 * 4;
  const capVerts = 8 * 2;
  const totalVerts = sideVerts + capVerts;
  const pos = new Float32Array(totalVerts * 3);
  const nor = new Float32Array(totalVerts * 3);
  const uv = new Float32Array(totalVerts * 2);
  const indices = new Uint16Array(8 * 6 + 6 * 3 * 2);

  let vo = 0;
  let io = 0;
  for (let i = 0; i < 8; i++) {
    const [x0, y0] = ring[i];
    const [x1, y1] = ring[(i + 1) % 8];
    const dx = x1 - x0;
    const dy = y1 - y0;
    const len = Math.hypot(dx, dy) || 1;
    const nx = dy / len;
    const ny = -dx / len;

    const pts = [
      [x0, y0, hz, 0, 0],
      [x1, y1, hz, 1, 0],
      [x1, y1, -hz, 1, 1],
      [x0, y0, -hz, 0, 1]
    ];
    for (let k = 0; k < 4; k++) {
      const p = pts[k];
      pos[(vo + k) * 3] = p[0];
      pos[(vo + k) * 3 + 1] = p[1];
      pos[(vo + k) * 3 + 2] = p[2];
      nor[(vo + k) * 3] = nx;
      nor[(vo + k) * 3 + 1] = ny;
      nor[(vo + k) * 3 + 2] = 0;
      uv[(vo + k) * 2] = p[3];
      uv[(vo + k) * 2 + 1] = p[4];
    }
    indices[io++] = vo;
    indices[io++] = vo + 2;
    indices[io++] = vo + 1;
    indices[io++] = vo;
    indices[io++] = vo + 3;
    indices[io++] = vo + 2;
    vo += 4;
  }

  // Front cap (+hz, normal +Z) & Back cap (-hz, normal -Z)
  for (const zSign of [1, -1]) {
    const base = vo;
    for (let i = 0; i < 8; i++) {
      const [rx, ry] = ring[i];
      pos[(vo + i) * 3] = rx;
      pos[(vo + i) * 3 + 1] = ry;
      pos[(vo + i) * 3 + 2] = zSign * hz;
      nor[(vo + i) * 3] = 0;
      nor[(vo + i) * 3 + 1] = 0;
      nor[(vo + i) * 3 + 2] = zSign;
      uv[(vo + i) * 2] = rx / width + 0.5;
      uv[(vo + i) * 2 + 1] = ry / height + 0.5;
    }
    for (let t = 1; t < 7; t++) {
      if (zSign > 0) {
        indices[io++] = base;
        indices[io++] = base + t;
        indices[io++] = base + t + 1;
      } else {
        indices[io++] = base;
        indices[io++] = base + t + 1;
        indices[io++] = base + t;
      }
    }
    vo += 8;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setIndex(new THREE.BufferAttribute(indices, 1));
  geo.computeBoundingBox();
  geo.computeBoundingSphere();
  return geo;
}

/**
 * Builds an open-slot CNC octagonal M-LOK / ventilated free-float handguard Group centered at (0,0,0) along Z,
 * with real physical open ventilation slots so the inner barrel, gas block, and gas tube are visibly nested inside!
 */
export function buildPerforatedOctagonalHandguard(
  outerRadius,
  length,
  slotBays = 4,
  mat,
  collarMat = mat
) {
  const hgGroup = new THREE.Group();
  const facetW = outerRadius * 0.76;
  const wallT = Math.max(0.0042, outerRadius * 0.13);
  const rMid = outerRadius - wallT * 0.5;

  // Rear barrel-nut clamp collar & front muzzle ring frame the ventilated octagonal cage
  const rearRingLen = Math.min(0.042, length * 0.14);
  const frontRingLen = Math.min(0.024, length * 0.09);

  for (let f = 0; f < 8; f++) {
    const ang = (f / 8) * Math.PI * 2;
    const fx = Math.sin(ang) * rMid;
    const fy = Math.cos(ang) * rMid;

    // Continuous longitudinal corner/cardinal rails on Top(0), Bottom(4), Left(6), Right(2);
    // Diagonal 45-deg M-LOK facets (1, 3, 5, 7) are bridged with open cooling windows!
    const isDiagonalVent = f % 2 === 1;
    if (!isDiagonalVent) {
      const strip = new THREE.Mesh(roundedBox(facetW * 0.86, wallT, length, 0.0016, 1), mat);
      strip.position.set(fx, fy, 0);
      strip.rotation.z = -ang;
      hgGroup.add(strip);
    } else {
      // Rear & front end segments + intermediate M-LOK bridge ribs (leaving open M-LOK slots between!)
      const rearSeg = new THREE.Mesh(roundedBox(facetW * 0.94, wallT, rearRingLen, 0.0014, 1), collarMat);
      rearSeg.position.set(fx, fy, length * 0.5 - rearRingLen * 0.5);
      rearSeg.rotation.z = -ang;
      const frontSeg = new THREE.Mesh(roundedBox(facetW * 0.94, wallT, frontRingLen, 0.0014, 1), mat);
      frontSeg.position.set(fx, fy, -length * 0.5 + frontRingLen * 0.5);
      frontSeg.rotation.z = -ang;
      hgGroup.add(rearSeg, frontSeg);

      const innerSpan = length - rearRingLen - frontRingLen;
      const bridgeCount = Math.max(1, slotBays - 1);
      const bridgeLen = Math.max(0.012, (innerSpan / slotBays) * 0.28);
      for (let b = 1; b <= bridgeCount; b++) {
        const bz = length * 0.5 - rearRingLen - (b / slotBays) * innerSpan;
        const bridge = new THREE.Mesh(roundedBox(facetW * 0.92, wallT, bridgeLen, 0.0012, 1), mat);
        bridge.position.set(fx, fy, bz);
        bridge.rotation.z = -ang;
        hgGroup.add(bridge);
      }
    }
  }
  return hgGroup;
}

/**
 * Builds a LatheGeometry barrel / suppressor / muzzle-device profile aligned along local -Z
 * from an array of `[zOffset, radius]` stations!
 */
export function createSteppedBarrelGeometry(stations, radialSegments = 20) {
  const pts = stations.map(([z, r]) => new THREE.Vector2(Math.max(0.0001, r), z));
  const geo = new THREE.LatheGeometry(pts, radialSegments);
  // LatheGeometry revolves around +Y; rotate +90deg around X so lathe Y maps onto local +Z (so negative z stations point forward -Z!)
  geo.rotateX(Math.PI * 0.5);
  geo.computeVertexNormals();
  geo.computeBoundingBox();
  geo.computeBoundingSphere();
  return geo;
}

/**
 * Builds a smooth, anatomically tapered & curved multi-ring elliptical tube BufferGeometry
 * from an array of stations `{ x, y, z, rx, ry, rotZ?, rotX? }` with capped ends.
 * Eliminates detached boxy cylinders/cubes on 1P sleeves, fingers, pistol grips, and stocks!
 */
export function createLoftedTubeGeometry(stations, radialSegments = 12, capEnds = true) {
  const ringCount = stations.length;
  const stride = radialSegments + 1;
  const bodyVerts = ringCount * stride;
  const capVerts = capEnds ? (radialSegments + 1) * 2 : 0;
  const totalVerts = bodyVerts + capVerts;
  const bodyTris = (ringCount - 1) * radialSegments * 2;
  const capTris = capEnds ? radialSegments * 2 : 0;

  const pos = new Float32Array(totalVerts * 3);
  const uv = new Float32Array(totalVerts * 2);
  const indices = new Uint16Array((bodyTris + capTris) * 3);

  const cCenter = new THREE.Vector3();
  const prevCenter = new THREE.Vector3();
  const nextCenter = new THREE.Vector3();
  const tangent = new THREE.Vector3();
  const worldUp = new THREE.Vector3(0, 1, 0);
  const fallbackUp = new THREE.Vector3(1, 0, 0);
  const binormal = new THREE.Vector3();
  const normalVec = new THREE.Vector3();
  const pt = new THREE.Vector3();

  const ringFrames = [];
  for (let i = 0; i < ringCount; i++) {
    const s = stations[i];
    cCenter.set(s.x, s.y, s.z);
    if (i === 0) {
      nextCenter.set(stations[1].x, stations[1].y, stations[1].z);
      tangent.subVectors(nextCenter, cCenter).normalize();
    } else if (i === ringCount - 1) {
      prevCenter.set(stations[i - 1].x, stations[i - 1].y, stations[i - 1].z);
      tangent.subVectors(cCenter, prevCenter).normalize();
    } else {
      prevCenter.set(stations[i - 1].x, stations[i - 1].y, stations[i - 1].z);
      nextCenter.set(stations[i + 1].x, stations[i + 1].y, stations[i + 1].z);
      tangent.subVectors(nextCenter, prevCenter).normalize();
    }
    const refUp = Math.abs(tangent.dot(worldUp)) > 0.92 ? fallbackUp : worldUp;
    binormal.crossVectors(tangent, refUp).normalize();
    normalVec.crossVectors(binormal, tangent).normalize();
    if (s.twist) {
      const ct = Math.cos(s.twist);
      const st = Math.sin(s.twist);
      const bx = binormal.x * ct + normalVec.x * st;
      const by = binormal.y * ct + normalVec.y * st;
      const bz = binormal.z * ct + normalVec.z * st;
      normalVec.set(
        normalVec.x * ct - binormal.x * st,
        normalVec.y * ct - binormal.y * st,
        normalVec.z * ct - binormal.z * st
      );
      binormal.set(bx, by, bz);
    }
    ringFrames.push({
      center: cCenter.clone(),
      tangent: tangent.clone(),
      binormal: binormal.clone(),
      normal: normalVec.clone(),
      rx: s.rx,
      ry: s.ry
    });
  }

  for (let i = 0; i < ringCount; i++) {
    const f = ringFrames[i];
    const vCoord = i / Math.max(1, ringCount - 1);
    for (let j = 0; j <= radialSegments; j++) {
      const uCoord = j / radialSegments;
      const ang = uCoord * Math.PI * 2;
      const ca = Math.cos(ang);
      const sa = Math.sin(ang);
      pt.copy(f.center)
        .addScaledVector(f.binormal, ca * f.rx)
        .addScaledVector(f.normal, sa * f.ry);
      const idx = i * stride + j;
      pos[idx * 3] = pt.x;
      pos[idx * 3 + 1] = pt.y;
      pos[idx * 3 + 2] = pt.z;
      uv[idx * 2] = uCoord;
      uv[idx * 2 + 1] = vCoord;
    }
  }

  let io = 0;
  for (let i = 0; i < ringCount - 1; i++) {
    for (let j = 0; j < radialSegments; j++) {
      const a = i * stride + j;
      const b = (i + 1) * stride + j;
      const c = (i + 1) * stride + j + 1;
      const d = i * stride + j + 1;
      indices[io++] = a;
      indices[io++] = c;
      indices[io++] = d;
      indices[io++] = a;
      indices[io++] = b;
      indices[io++] = c;
    }
  }

  if (capEnds) {
    // Start cap (ring 0)
    const startCenterIdx = bodyVerts;
    const f0 = ringFrames[0];
    pos[startCenterIdx * 3] = f0.center.x;
    pos[startCenterIdx * 3 + 1] = f0.center.y;
    pos[startCenterIdx * 3 + 2] = f0.center.z;
    uv[startCenterIdx * 2] = 0.5;
    uv[startCenterIdx * 2 + 1] = 0.5;
    for (let j = 0; j < radialSegments; j++) {
      const rIdx = startCenterIdx + 1 + j;
      const src = j;
      pos[rIdx * 3] = pos[src * 3];
      pos[rIdx * 3 + 1] = pos[src * 3 + 1];
      pos[rIdx * 3 + 2] = pos[src * 3 + 2];
      uv[rIdx * 2] = 0.5;
      uv[rIdx * 2 + 1] = 0.5;
      const nextRIdx = startCenterIdx + 1 + ((j + 1) % radialSegments);
      indices[io++] = startCenterIdx;
      indices[io++] = rIdx;
      indices[io++] = nextRIdx;
    }

    // End cap (ring ringCount - 1)
    const endCenterIdx = bodyVerts + radialSegments + 1;
    const fN = ringFrames[ringCount - 1];
    pos[endCenterIdx * 3] = fN.center.x;
    pos[endCenterIdx * 3 + 1] = fN.center.y;
    pos[endCenterIdx * 3 + 2] = fN.center.z;
    uv[endCenterIdx * 2] = 0.5;
    uv[endCenterIdx * 2 + 1] = 0.5;
    const lastRingBase = (ringCount - 1) * stride;
    for (let j = 0; j < radialSegments; j++) {
      const rIdx = endCenterIdx + 1 + j;
      const src = lastRingBase + j;
      pos[rIdx * 3] = pos[src * 3];
      pos[rIdx * 3 + 1] = pos[src * 3 + 1];
      pos[rIdx * 3 + 2] = pos[src * 3 + 2];
      uv[rIdx * 2] = 0.5;
      uv[rIdx * 2 + 1] = 0.5;
      const nextRIdx = endCenterIdx + 1 + ((j + 1) % radialSegments);
      indices[io++] = endCenterIdx;
      indices[io++] = nextRIdx;
      indices[io++] = rIdx;
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setIndex(new THREE.BufferAttribute(indices, 1));
  geo.computeVertexNormals();
  geo.computeBoundingBox();
  geo.computeBoundingSphere();
  return geo;
}

/**
 * Builds a low-profile folded backup iron sight (MBUS Pro / KAC Micro style) sitting flush on a Picatinny rail
 * well below the ADS optic window.
 */
export function buildFoldingIronSight(yPos, zPos, darkMetal, gunMetal) {
  const g = new THREE.Group();
  g.position.set(0, yPos, zPos);
  const clamp = new THREE.Mesh(roundedBox(0.036, 0.008, 0.026, 0.0018, 1), darkMetal);
  const foldedArm = new THREE.Mesh(roundedBox(0.024, 0.007, 0.040, 0.0016, 1), gunMetal);
  foldedArm.position.set(0, 0.006, 0.008);
  const pivotPin = new THREE.Mesh(new THREE.CylinderGeometry(0.0038, 0.0038, 0.040, 12), gunMetal);
  pivotPin.rotation.z = Math.PI * 0.5;
  pivotPin.position.set(0, 0.003, -0.006);
  g.add(clamp, foldedArm, pivotPin);
  return g;
}

// ==================== SHARED GUNSMITH SUB-ASSEMBLY BUILDERS ====================

export function buildTacticalWeaponLight(xPos, yPos, zPos, darkMetal, gunMetal, chromeMetal) {
  const wmlGroup = new THREE.Group();
  wmlGroup.position.set(xPos, yPos, zPos);

  const offsetMount = new THREE.Mesh(roundedBox(0.018, 0.014, 0.046, 0.002, 1), darkMetal);
  offsetMount.position.set(xPos > 0 ? -0.011 : 0.011, 0, 0.010);

  const clampScrew = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.008, 12), gunMetal);
  clampScrew.rotation.z = Math.PI / 2;
  clampScrew.position.set(xPos > 0 ? 0.011 : -0.011, 0.003, 0.012);

  // CNC lathe SureFire Scout M600DF stepped body + scalloped heat-fin bezel + tailcap shroud
  const scoutGeo = createSteppedBarrelGeometry(
    [
      [0.056, 0.0105],
      [0.038, 0.0112],
      [-0.034, 0.0112],
      [-0.042, 0.0138],
      [-0.068, 0.0148],
      [-0.070, 0.0128]
    ],
    16
  );
  const bodyMesh = new THREE.Mesh(scoutGeo, darkMetal);

  const bezelCollar = new THREE.Mesh(new THREE.CylinderGeometry(0.0152, 0.0148, 0.016, 8), gunMetal);
  bezelCollar.rotation.x = Math.PI / 2;
  bezelCollar.position.set(0, 0, -0.056);

  const emitterLens = new THREE.Mesh(new THREE.CircleGeometry(0.0124, 16), chromeMetal);
  emitterLens.rotation.y = Math.PI;
  emitterLens.position.set(0, 0, -0.0705);

  wmlGroup.add(offsetMount, clampScrew, bodyMesh, bezelCollar, emitterLens);
  return wmlGroup;
}

export function buildPicatinnyRail(length, yPos, zCenter, mat, toothCount = 12) {
  const railGroup = new THREE.Group();
  const base = new THREE.Mesh(createChamferedBlockGeometry(0.034, 0.009, length, 0.004, 0.003, 0.003, 0.002), mat);
  base.position.set(0, yPos, zCenter);
  railGroup.add(base);

  const toothSpan = length * 0.92;
  const toothLen = (toothSpan / toothCount) * 0.54;
  const toothGeo = roundedBox(0.040, 0.0065, toothLen, 0.0014, 1);
  for (let i = 0; i < toothCount; i++) {
    const tz = zCenter - toothSpan / 2 + (i / Math.max(1, toothCount - 1)) * toothSpan;
    const tooth = new THREE.Mesh(toothGeo, mat);
    tooth.position.set(0, yPos + 0.007, tz);
    railGroup.add(tooth);
  }
  return railGroup;
}

/**
 * Sculpted Magpul MOE-K2 / BCM Gunfighter swept ergonomic pistol grip (lofted anatomical palm swell + high beavertail
 * + undercut winter trigger guard + skeletonized flat-curve match trigger + ambidextrous 45-deg selector).
 */
export function buildErgonomicGripAndTrigger(yPos, zPos, gripMat, metalMat, boreMat) {
  const gripGroup = new THREE.Group();
  gripGroup.position.set(0, yPos, zPos);

  const gripStations = [
    { x: 0, y: 0.004, z: 0.006, rx: 0.020, ry: 0.030 },
    { x: 0, y: -0.026, z: 0.008, rx: 0.022, ry: 0.033 },
    { x: 0, y: -0.064, z: 0.017, rx: 0.025, ry: 0.036 },
    { x: 0, y: -0.104, z: 0.027, rx: 0.024, ry: 0.035 },
    { x: 0, y: -0.132, z: 0.034, rx: 0.026, ry: 0.038 }
  ];
  const gripCore = new THREE.Mesh(createLoftedTubeGeometry(gripStations, 14, true), gripMat);

  const beavertail = new THREE.Mesh(
    createLoftedTubeGeometry(
      [
        { x: 0, y: 0.010, z: 0.034, rx: 0.015, ry: 0.012 },
        { x: 0, y: -0.016, z: 0.024, rx: 0.020, ry: 0.018 },
        { x: 0, y: -0.040, z: 0.016, rx: 0.022, ry: 0.022 }
      ],
      10,
      true
    ),
    gripMat
  );

  const gripFloorplate = new THREE.Mesh(roundedBox(0.052, 0.012, 0.076, 0.003, 1), metalMat);
  gripFloorplate.position.set(0, -0.136, 0.034);
  gripFloorplate.rotation.x = -0.24;

  // Compact ambidextrous safety selector (kept rear of receiver rollmark zone)
  const selectorPin = new THREE.Mesh(new THREE.CylinderGeometry(0.0052, 0.0052, 0.054, 12), metalMat);
  selectorPin.rotation.z = Math.PI / 2;
  selectorPin.position.set(0, 0.016, 0.004);
  const selectorLever = new THREE.Mesh(roundedBox(0.058, 0.0065, 0.022, 0.0015, 1), metalMat);
  selectorLever.position.set(0, 0.016, -0.003);
  selectorLever.rotation.x = 0.32;

  // Enlarged winter trigger guard bow + curved skeletonized match trigger
  const guardBottom = new THREE.Mesh(roundedBox(0.014, 0.006, 0.068, 0.002, 1), metalMat);
  guardBottom.position.set(0, -0.044, -0.046);
  guardBottom.rotation.x = -0.08;
  const guardFront = new THREE.Mesh(roundedBox(0.014, 0.034, 0.007, 0.002, 1), metalMat);
  guardFront.position.set(0, -0.028, -0.078);
  guardFront.rotation.x = -0.26;

  const triggerBlade = new THREE.Mesh(
    new THREE.TorusGeometry(0.017, 0.0036, 8, 14, Math.PI * 0.62),
    boreMat
  );
  triggerBlade.rotation.y = Math.PI / 2;
  triggerBlade.rotation.x = Math.PI * 0.66;
  triggerBlade.position.set(0, -0.015, -0.042);

  gripGroup.add(gripCore, beavertail, gripFloorplate, selectorPin, selectorLever, guardBottom, guardFront, triggerBlade);
  return gripGroup;
}

export function getCachedExtrudeGeometry(cacheKey, buildFn) {
  let geo = WEAPON_GEO_CACHE.get(cacheKey);
  if (!geo) {
    geo = buildFn();
    geo.computeBoundingBox();
    geo.computeBoundingSphere();
    geo.userData = { ...(geo.userData || {}), shared: true };
    WEAPON_GEO_CACHE.set(cacheKey, geo);
  }
  return geo;
}

export function buildCurvedMagazine(segments, width, depth, segHeight, curveStepRad, bodyMat, ribMat, floorMat) {
  const magGroup = new THREE.Group();
  const steps = 8;
  const arcLen = segments * segHeight * 0.88;
  const startAngle = 0.06;
  const totalBend = Math.max(0.05, (segments - 1) * curveStepRad);

  const spine = [];
  let curY = segHeight * 0.42;
  let curZ = 0;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const theta = startAngle + totalBend * t;
    if (i > 0) {
      const ds = arcLen / steps;
      const midTheta = startAngle + totalBend * ((i - 0.5) / steps);
      curY -= Math.cos(midTheta) * ds;
      curZ -= Math.sin(midTheta) * ds;
    }
    spine.push({ y: curY, z: curZ, theta });
  }

  const bevelSize = 0.0028;
  const bevelThickness = 0.0028;
  const bodyGeoKey = `curved_mag_${segments}_${width}_${depth}_${segHeight}_${curveStepRad}`;
  const bodyGeo = getCachedExtrudeGeometry(bodyGeoKey, () => {
    const halfD = Math.max(0.01, depth * 0.5 - bevelSize);
    const extrudeWidth = Math.max(0.008, width - bevelThickness * 2);
    const shape = new THREE.Shape();

    // Trace front wall top -> bottom (shapeX = -z so rotateY(+PI/2) maps back to local Z)
    for (let i = 0; i <= steps; i++) {
      const s = spine[i];
      const fz = s.z - Math.cos(s.theta) * halfD;
      const fy = s.y + Math.sin(s.theta) * halfD;
      const sx = -fz;
      if (i === 0) shape.moveTo(sx, fy);
      else shape.lineTo(sx, fy);
    }
    // Trace rear wall bottom -> top
    for (let i = steps; i >= 0; i--) {
      const s = spine[i];
      const rz = s.z + Math.cos(s.theta) * halfD;
      const ry = s.y - Math.sin(s.theta) * halfD;
      shape.lineTo(-rz, ry);
    }
    shape.closePath();

    const geo = new THREE.ExtrudeGeometry(shape, {
      depth: extrudeWidth,
      bevelEnabled: true,
      bevelThickness,
      bevelSize,
      bevelSegments: 2,
      curveSegments: 1
    });
    geo.translate(0, 0, -extrudeWidth * 0.5);
    geo.rotateY(Math.PI * 0.5);
    const uvAttr = geo.attributes.uv;
    if (uvAttr) {
      for (let i = 0; i < uvAttr.count; i++) {
        uvAttr.setXY(i, uvAttr.getX(i) * 4.5, uvAttr.getY(i) * 4.5);
      }
    }
    geo.computeVertexNormals();
    return geo;
  });

  const bodyMesh = new THREE.Mesh(bodyGeo, bodyMat);
  magGroup.add(bodyMesh);

  // Clean horizontal reinforcement ribs along the curve (batched by scope batcher into 1 mesh)
  const ribIndices = [2, 4, 6];
  for (let r = 0; r < ribIndices.length; r++) {
    const s = spine[ribIndices[r]];
    const rib = new THREE.Mesh(roundedBox(width + 0.0038, segHeight * 0.19, depth * 0.86, 0.0016, 1), ribMat);
    rib.position.set(0, s.y, s.z);
    rib.rotation.x = s.theta;
    magGroup.add(rib);
  }

  const endS = spine[steps];
  const floorPlate = new THREE.Mesh(roundedBox(width + 0.008, 0.018, depth + 0.011, 0.003, 1), floorMat);
  floorPlate.position.set(0, endS.y - Math.cos(endS.theta) * 0.003, endS.z - Math.sin(endS.theta) * 0.003);
  floorPlate.rotation.x = endS.theta;

  const pullLoop = new THREE.Mesh(new THREE.TorusGeometry(0.015, 0.0038, 6, 12, Math.PI), floorMat);
  pullLoop.rotation.y = Math.PI / 2;
  pullLoop.rotation.z = Math.PI + endS.theta;
  pullLoop.position.set(0, endS.y - Math.cos(endS.theta) * 0.012, endS.z - Math.sin(endS.theta) * 0.012);
  magGroup.add(floorPlate, pullLoop);

  return magGroup;
}

function buildRoundedWindowPoints(halfW, botY, topY, cornerR, archTop = false) {
  const pts = [];
  if (archTop) {
    pts.push([-halfW, botY + 0.004]);
    pts.push([-halfW + 0.004, botY]);
    pts.push([halfW - 0.004, botY]);
    pts.push([halfW, botY + 0.004]);
    const segs = 14;
    for (let i = 0; i <= segs; i++) {
      const a = (i / segs) * Math.PI;
      pts.push([Math.cos(a) * halfW, Math.sin(a) * topY]);
    }
    return pts;
  }
  const r = Math.min(cornerR, halfW * 0.45, (topY - botY) * 0.4);
  const corners = [
    { cx: halfW - r, cy: botY + r, a0: -Math.PI * 0.5, a1: 0 },
    { cx: halfW - r, cy: topY - r, a0: 0, a1: Math.PI * 0.5 },
    { cx: -halfW + r, cy: topY - r, a0: Math.PI * 0.5, a1: Math.PI },
    { cx: -halfW + r, cy: botY + r, a0: Math.PI, a1: Math.PI * 1.5 }
  ];
  for (const c of corners) {
    for (let s = 0; s <= 4; s++) {
      const a = c.a0 + ((c.a1 - c.a0) * s) / 4;
      pts.push([c.cx + Math.cos(a) * r, c.cy + Math.sin(a) * r]);
    }
  }
  return pts;
}

export function buildDetailedOptic(type, yPos, zPos, darkMetal, gunMetal, _unusedAccentMat, glassMat, reticleMat) {
  const opticGroup = new THREE.Group();
  opticGroup.position.set(0, yPos, zPos);

  let hoodMetal = WEAPON_MAT_CACHE.get('optic_hoodMetal');
  if (!hoodMetal) {
    hoodMetal = darkMetal.clone();
    hoodMetal.side = THREE.DoubleSide;
    hoodMetal.userData = { ...(hoodMetal.userData || {}), shared: true };
    WEAPON_MAT_CACHE.set('optic_hoodMetal', hoodMetal);
  }

  const baseColorHex = reticleMat?.color ? reticleMat.color.getHex() : 0xff2a2a;
  let reticleMainMat = WEAPON_MAT_CACHE.get(`optic_reticleMain_${baseColorHex}`);
  if (!reticleMainMat) {
    reticleMainMat = new THREE.MeshBasicMaterial({
      color: baseColorHex,
      transparent: true,
      opacity: 0.98,
      depthWrite: false,
      toneMapped: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide
    });
    reticleMainMat.userData = { shared: true };
    WEAPON_MAT_CACHE.set(`optic_reticleMain_${baseColorHex}`, reticleMainMat);
  }
  let reticleHaloMat = WEAPON_MAT_CACHE.get(`optic_reticleHalo_${baseColorHex}`);
  if (!reticleHaloMat) {
    reticleHaloMat = new THREE.MeshBasicMaterial({
      color: baseColorHex,
      transparent: true,
      opacity: 0.44,
      depthWrite: false,
      toneMapped: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide
    });
    reticleHaloMat.userData = { shared: true };
    WEAPON_MAT_CACHE.set(`optic_reticleHalo_${baseColorHex}`, reticleHaloMat);
  }
  let reticleCoreMat = WEAPON_MAT_CACHE.get('optic_reticleCore');
  if (!reticleCoreMat) {
    reticleCoreMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.96,
      depthWrite: false,
      toneMapped: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide
    });
    reticleCoreMat.userData = { shared: true };
    WEAPON_MAT_CACHE.set('optic_reticleCore', reticleCoreMat);
  }

  // Under-optic Picatinny rail saddle & chamfered upper receiver crown visible at bottom of ADS sight picture
  const railSaddle = new THREE.Mesh(roundedBox(0.038, 0.010, 0.094, 0.002, 1), darkMetal);
  railSaddle.position.set(0, -0.005, 0);
  const receiverCrown = new THREE.Mesh(
    createChamferedBlockGeometry(0.062, 0.022, 0.106, 0.012, 0.006, 0.006, 0.004),
    gunMetal
  );
  receiverCrown.position.set(0, -0.021, 0);
  opticGroup.add(railSaddle, receiverCrown);

  const reticleGroup = new THREE.Group();
  reticleGroup.position.set(0, 0.038, type === 'reflex' ? -0.0055 : 0.0045);

  if (type === 'reflex') {
    // Saltline HX-2 CNC-Chamfered Open Reflex Sight (solid extruded hood, recessed lens rim, windage/elevation turrets)
    const riserMount = new THREE.Mesh(
      createChamferedBlockGeometry(0.048, 0.010, 0.074, 0.006, 0.003, 0.004, 0.002),
      darkMetal
    );
    riserMount.position.set(0, 0.002, -0.002);
    const qdThrowLever = new THREE.Mesh(roundedBox(0.006, 0.008, 0.036, 0.0018, 1), gunMetal);
    qdThrowLever.position.set(-0.026, 0.002, 0.0);
    const clampBolt = new THREE.Mesh(new THREE.CylinderGeometry(0.0048, 0.0048, 0.054, 14), gunMetal);
    clampBolt.rotation.z = Math.PI / 2;
    clampBolt.position.set(0, 0.002, 0.010);

    const emitterDeck = new THREE.Mesh(
      createChamferedBlockGeometry(0.062, 0.009, 0.070, 0.008, 0.002, 0.005, 0.002),
      gunMetal
    );
    emitterDeck.position.set(0, 0.010, -0.002);

    // Recessed diode emitter housing & elevation turret on rear deck (kept below y = 0.0185, well clear of window center 0.038)
    const diodePod = new THREE.Mesh(
      createChamferedBlockGeometry(0.018, 0.005, 0.016, 0.003, 0.0015, 0.002, 0.001),
      darkMetal
    );
    diodePod.position.set(0, 0.0155, 0.014);
    const elevTurret = new THREE.Mesh(new THREE.CylinderGeometry(0.0062, 0.0068, 0.0045, 14), darkMetal);
    elevTurret.position.set(0.018, 0.0155, 0.016);
    const windageTurret = new THREE.Mesh(new THREE.CylinderGeometry(0.0062, 0.0068, 0.007, 14), gunMetal);
    windageTurret.rotation.z = Math.PI / 2;
    windageTurret.position.set(0.033, 0.011, 0.004);

    // Tactile brightness pads & knurled side battery housing
    const btnPlus = new THREE.Mesh(roundedBox(0.0035, 0.0055, 0.010, 0.001, 1), darkMetal);
    btnPlus.position.set(-0.032, 0.010, -0.016);
    const btnMinus = new THREE.Mesh(roundedBox(0.0035, 0.0055, 0.010, 0.001, 1), darkMetal);
    btnMinus.position.set(-0.032, 0.010, 0.002);
    const batteryCap = new THREE.Mesh(new THREE.CylinderGeometry(0.0076, 0.0076, 0.010, 14), darkMetal);
    batteryCap.rotation.z = Math.PI / 2;
    batteryCap.position.set(0.032, 0.010, -0.014);

    // Beefy chamfered extruded aluminum arch housing with clear wide-aperture lens cutout
    const reflexShroudGeo = getCachedExtrudeGeometry('optic_reflex_shroud_v2', () => {
      const outer = buildRoundedWindowPoints(0.034, -0.0245, 0.0305, 0.006, true);
      const inner = buildRoundedWindowPoints(0.0272, -0.0195, 0.0235, 0.005, true);
      const shape = new THREE.Shape();
      outer.forEach(([px, py], idx) => (idx === 0 ? shape.moveTo(px, py) : shape.lineTo(px, py)));
      shape.closePath();
      const hole = new THREE.Path();
      for (let i = inner.length - 1; i >= 0; i--) {
        const [px, py] = inner[i];
        if (i === inner.length - 1) hole.moveTo(px, py);
        else hole.lineTo(px, py);
      }
      hole.closePath();
      shape.holes.push(hole);
      const geo = new THREE.ExtrudeGeometry(shape, {
        depth: 0.018,
        bevelEnabled: true,
        bevelThickness: 0.0016,
        bevelSize: 0.0014,
        bevelSegments: 2,
        curveSegments: 1
      });
      geo.translate(0, 0, -0.009);
      geo.computeVertexNormals();
      return geo;
    });
    const reflexShroud = new THREE.Mesh(reflexShroudGeo, hoodMetal);
    reflexShroud.position.set(0, 0.038, -0.006);

    // Recessed inner lens rim collar inside shroud
    const reflexInnerRimGeo = getCachedExtrudeGeometry('optic_reflex_rim_v2', () => {
      const outer = buildRoundedWindowPoints(0.0298, -0.0215, 0.0260, 0.004, true);
      const inner = buildRoundedWindowPoints(0.0266, -0.0188, 0.0228, 0.004, true);
      const shape = new THREE.Shape();
      outer.forEach(([px, py], idx) => (idx === 0 ? shape.moveTo(px, py) : shape.lineTo(px, py)));
      shape.closePath();
      const hole = new THREE.Path();
      for (let i = inner.length - 1; i >= 0; i--) {
        const [px, py] = inner[i];
        if (i === inner.length - 1) hole.moveTo(px, py);
        else hole.lineTo(px, py);
      }
      hole.closePath();
      shape.holes.push(hole);
      const geo = new THREE.ExtrudeGeometry(shape, {
        depth: 0.010,
        bevelEnabled: false,
        curveSegments: 1
      });
      geo.translate(0, 0, -0.005);
      geo.computeVertexNormals();
      return geo;
    });
    const reflexInnerRim = new THREE.Mesh(reflexInnerRimGeo, gunMetal);
    reflexInnerRim.position.set(0, 0.038, -0.006);

    const topSunVisor = new THREE.Mesh(roundedBox(0.030, 0.0032, 0.023, 0.001, 1), hoodMetal);
    topSunVisor.position.set(0, 0.0695, -0.006);

    const reflexLens = new THREE.Mesh(new THREE.CircleGeometry(0.0265, 28), glassMat);
    reflexLens.scale.set(1.02, 0.88, 1);
    reflexLens.position.set(0, 0.038, -0.006);
    reflexLens.renderOrder = 10;
    reflexLens.userData.isOpticLens = true;

    const redDotHalo = new THREE.Mesh(new THREE.CircleGeometry(0.0018, 20), reticleHaloMat);
    const redDot = new THREE.Mesh(new THREE.CircleGeometry(0.00085, 20), reticleMainMat);
    const redDotCore = new THREE.Mesh(new THREE.CircleGeometry(0.00038, 16), reticleCoreMat);
    redDotHalo.renderOrder = 11;
    redDot.renderOrder = 12;
    redDotCore.renderOrder = 13;
    for (const part of [redDotHalo, redDot, redDotCore]) {
      part.userData.isOpticReticle = true;
    }
    reticleGroup.add(redDotHalo, redDot, redDotCore);

    opticGroup.add(
      riserMount,
      qdThrowLever,
      clampBolt,
      emitterDeck,
      diodePod,
      elevTurret,
      windageTurret,
      btnPlus,
      btnMinus,
      batteryCap,
      reflexShroud,
      reflexInnerRim,
      topSunVisor,
      reflexLens,
      reticleGroup
    );
    opticGroup.userData = {
      opticType: 'reddot',
      centerOffset: new THREE.Vector3(0, 0.038, -0.006),
      reticleGroup,
      lensMesh: reflexLens
    };
  } else {
    // EOTech EXPS3 Holographic Sight — Solid Chamfered Aluminum Shroud, Inner Glass Cage, Turrets, CR123 Cap & QD Lever
    const baseMount = new THREE.Mesh(
      createChamferedBlockGeometry(0.058, 0.010, 0.076, 0.008, 0.003, 0.005, 0.002),
      gunMetal
    );
    baseMount.position.set(0, 0.002, 0.002);
    const qdCamLever = new THREE.Mesh(roundedBox(0.0065, 0.0085, 0.038, 0.0016, 1), darkMetal);
    qdCamLever.position.set(-0.031, 0.002, 0.004);

    // Transverse CR123 battery tube & tethered knurled cap
    const batteryCyl = new THREE.Mesh(new THREE.CylinderGeometry(0.0072, 0.0072, 0.058, 16), darkMetal);
    batteryCyl.rotation.z = Math.PI / 2;
    batteryCyl.position.set(0, 0.008, -0.025);
    const tetherCap = new THREE.Mesh(new THREE.CylinderGeometry(0.0082, 0.0082, 0.009, 14), gunMetal);
    tetherCap.rotation.z = Math.PI / 2;
    tetherCap.position.set(0.030, 0.008, -0.025);

    // Rear brightness / NV control deck (below y = 0.017)
    const controlDeck = new THREE.Mesh(
      createChamferedBlockGeometry(0.054, 0.008, 0.022, 0.006, 0.002, 0.004, 0.002),
      darkMetal
    );
    controlDeck.position.set(0, 0.010, 0.026);

    // Outer extruded CNC protective aluminum shroud (beveled solid walls around unobstructed rectangular aperture)
    const holoShroudGeo = getCachedExtrudeGeometry('optic_holo_shroud_v2', () => {
      const outer = buildRoundedWindowPoints(0.0345, -0.0245, 0.0265, 0.0085, false);
      const inner = buildRoundedWindowPoints(0.0270, -0.0195, 0.0205, 0.0055, false);
      const shape = new THREE.Shape();
      outer.forEach(([px, py], idx) => (idx === 0 ? shape.moveTo(px, py) : shape.lineTo(px, py)));
      shape.closePath();
      const hole = new THREE.Path();
      for (let i = inner.length - 1; i >= 0; i--) {
        const [px, py] = inner[i];
        if (i === inner.length - 1) hole.moveTo(px, py);
        else hole.lineTo(px, py);
      }
      hole.closePath();
      shape.holes.push(hole);
      const geo = new THREE.ExtrudeGeometry(shape, {
        depth: 0.028,
        bevelEnabled: true,
        bevelThickness: 0.0018,
        bevelSize: 0.0015,
        bevelSegments: 2,
        curveSegments: 1
      });
      geo.translate(0, 0, -0.014);
      geo.computeVertexNormals();
      return geo;
    });
    const holoShroud = new THREE.Mesh(holoShroudGeo, hoodMetal);
    holoShroud.position.set(0, 0.038, 0.004);

    // Inner recessed optical glass bezel frame
    const holoInnerFrameGeo = getCachedExtrudeGeometry('optic_holo_inner_v2', () => {
      const outer = buildRoundedWindowPoints(0.0305, -0.0215, 0.0232, 0.006, false);
      const inner = buildRoundedWindowPoints(0.0258, -0.0185, 0.0195, 0.0045, false);
      const shape = new THREE.Shape();
      outer.forEach(([px, py], idx) => (idx === 0 ? shape.moveTo(px, py) : shape.lineTo(px, py)));
      shape.closePath();
      const hole = new THREE.Path();
      for (let i = inner.length - 1; i >= 0; i--) {
        const [px, py] = inner[i];
        if (i === inner.length - 1) hole.moveTo(px, py);
        else hole.lineTo(px, py);
      }
      hole.closePath();
      shape.holes.push(hole);
      const geo = new THREE.ExtrudeGeometry(shape, {
        depth: 0.018,
        bevelEnabled: false,
        curveSegments: 1
      });
      geo.translate(0, 0, -0.009);
      geo.computeVertexNormals();
      return geo;
    });
    const holoInnerFrame = new THREE.Mesh(holoInnerFrameGeo, gunMetal);
    holoInnerFrame.position.set(0, 0.038, 0.004);

    // Side-mounted recessed Windage & Elevation turret dials on right side of shroud
    const windDial = new THREE.Mesh(new THREE.CylinderGeometry(0.0052, 0.0052, 0.006, 12), gunMetal);
    windDial.rotation.z = Math.PI / 2;
    windDial.position.set(0.0365, 0.026, -0.002);
    const elevDial = new THREE.Mesh(new THREE.CylinderGeometry(0.0052, 0.0052, 0.006, 12), gunMetal);
    elevDial.rotation.z = Math.PI / 2;
    elevDial.position.set(0.0365, 0.026, 0.011);

    const lens = new THREE.Mesh(new THREE.PlaneGeometry(0.052, 0.039), glassMat);
    lens.position.set(0, 0.038, 0.004);
    lens.renderOrder = 10;
    lens.userData.isOpticLens = true;

    // Bright glowing 65-MOA Holographic ring + crosshair ticks + center dot
    const holoRingHalo = new THREE.Mesh(new THREE.RingGeometry(0.0074, 0.0102, 36), reticleHaloMat);
    const holoRing = new THREE.Mesh(new THREE.RingGeometry(0.0083, 0.0092, 36), reticleMainMat);
    const holoDotHalo = new THREE.Mesh(new THREE.CircleGeometry(0.0014, 16), reticleHaloMat);
    const holoDot = new THREE.Mesh(new THREE.CircleGeometry(0.00058, 16), reticleMainMat);
    const holoDotCore = new THREE.Mesh(new THREE.CircleGeometry(0.00028, 12), reticleCoreMat);
    const tickTop = new THREE.Mesh(new THREE.PlaneGeometry(0.00075, 0.0028), reticleMainMat);
    tickTop.position.set(0, 0.0104, 0);
    const tickBot = new THREE.Mesh(new THREE.PlaneGeometry(0.00075, 0.0028), reticleMainMat);
    tickBot.position.set(0, -0.0104, 0);
    const tickLeft = new THREE.Mesh(new THREE.PlaneGeometry(0.0028, 0.00075), reticleMainMat);
    tickLeft.position.set(-0.0104, 0, 0);
    const tickRight = new THREE.Mesh(new THREE.PlaneGeometry(0.0028, 0.00075), reticleMainMat);
    tickRight.position.set(0.0104, 0, 0);

    holoRingHalo.renderOrder = 11;
    holoDotHalo.renderOrder = 11;
    holoRing.renderOrder = 12;
    holoDot.renderOrder = 12;
    tickTop.renderOrder = 12;
    tickBot.renderOrder = 12;
    tickLeft.renderOrder = 12;
    tickRight.renderOrder = 12;
    holoDotCore.renderOrder = 13;

    for (const part of [holoRingHalo, holoRing, holoDotHalo, holoDot, holoDotCore, tickTop, tickBot, tickLeft, tickRight]) {
      part.userData.isOpticReticle = true;
    }
    reticleGroup.add(holoRingHalo, holoRing, holoDotHalo, holoDot, holoDotCore, tickTop, tickBot, tickLeft, tickRight);

    opticGroup.add(
      baseMount,
      qdCamLever,
      batteryCyl,
      tetherCap,
      controlDeck,
      holoShroud,
      holoInnerFrame,
      windDial,
      elevDial,
      lens,
      reticleGroup
    );
    opticGroup.userData = {
      opticType: 'holo',
      centerOffset: new THREE.Vector3(0, 0.038, 0.004),
      reticleGroup,
      lensMesh: lens
    };
  }

  opticGroup.traverse((child) => {
    child.userData.isOpticAssembly = true;
  });
  return opticGroup;
}
