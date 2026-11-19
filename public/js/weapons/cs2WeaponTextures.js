// Adapted from StarKnightt/counter-strike-in-browser (MIT License, Copyright (c) 2026 StarKnightt)
// Procedural tiling PBR canvas texture sets for MIT CS2 GLB weapons (gloves, ripstop sleeves, oiled walnut wood,
// marbled bakelite, blued steel with packed wear-noise mask, speckled polymer, coated AWP scope lens, brushed knife blade).

import * as THREE from '../three.js';

function canCreateCanvasTextures() {
  if (typeof document === 'undefined' || typeof document.createElement !== 'function') return false;
  try {
    const probe = document.createElement('canvas');
    const ctx = probe?.getContext?.('2d');
    return Boolean(ctx && typeof ctx.createImageData === 'function' && typeof ctx.putImageData === 'function');
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------- tiling value noise
function hash2(ix, iy, seed) {
  let h = (ix * 374761393 + iy * 668265263 + seed * 1442695041) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Tiling value noise; `periodY` (default = period) lets a field be stretched along one axis and still tile. */
function vnoise(x, y, period, seed, periodY = period) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const x0 = ((ix % period) + period) % period;
  const x1 = (x0 + 1) % period;
  const y0 = ((iy % periodY) + periodY) % periodY;
  const y1 = (y0 + 1) % periodY;
  const a = hash2(x0, y0, seed);
  const b = hash2(x1, y0, seed);
  const c = hash2(x0, y1, seed);
  const d = hash2(x1, y1, seed);
  const top = a + (b - a) * sx;
  const bot = c + (d - c) * sx;
  return top + (bot - top) * sy;
}

/** Tiling fBm in tile coordinates u,v in [0,1). baseCells must be an integer. */
function fbm(u, v, baseCells, oct, seed, gain = 0.5) {
  let amp = 1;
  let sum = 0;
  let norm = 0;
  let cells = baseCells;
  for (let i = 0; i < oct; i++) {
    sum += amp * vnoise(u * cells, v * cells, cells, seed + i * 17);
    norm += amp;
    amp *= gain;
    cells *= 2;
  }
  return sum / norm;
}

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const sstep = (a, b, x) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

/** Linear -> sRGB transfer LUT so authored linear albedos multiply cleanly. */
const SRGB_LUT = new Float32Array(4097);
for (let i = 0; i <= 4096; i++) {
  const c = i / 4096;
  SRGB_LUT[i] = c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
}
const lin2srgb = (c) => SRGB_LUT[c >= 1 ? 4096 : c <= 0 ? 0 : (c * 4096) | 0];

/** Distance to the nearest tile-periodic line at spacing `sp` (in tile units). */
const lineDist = (x, sp) => {
  const f = x / sp - Math.floor(x / sp);
  return Math.abs(f - 0.5) * sp;
};

// ---------------------------------------------------------------- raster helpers
function field(size, fn) {
  const h = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      h[y * size + x] = fn(x / size, y / size);
    }
  }
  return h;
}

function lowField(size, low, fn) {
  const g = new Float32Array(low * low);
  for (let y = 0; y < low; y++) {
    for (let x = 0; x < low; x++) {
      g[y * low + x] = fn(x / low, y / low);
    }
  }
  const out = new Float32Array(size * size);
  const s = low / size;
  const i0 = new Int32Array(size);
  const i1 = new Int32Array(size);
  const tt = new Float32Array(size);
  for (let x = 0; x < size; x++) {
    const f = x * s;
    const k = Math.floor(f);
    const t = f - k;
    i0[x] = k;
    i1[x] = (k + 1) % low;
    tt[x] = t * t * (3 - 2 * t);
  }
  for (let y = 0; y < size; y++) {
    const r0 = i0[y] * low;
    const r1 = i1[y] * low;
    const ty = tt[y];
    const r = y * size;
    for (let x = 0; x < size; x++) {
      const x0 = i0[x];
      const x1 = i1[x];
      const tx = tt[x];
      const a = g[r0 + x0] + (g[r0 + x1] - g[r0 + x0]) * tx;
      const b = g[r1 + x0] + (g[r1 + x1] - g[r1 + x0]) * tx;
      out[r + x] = a + (b - a) * ty;
    }
  }
  return out;
}

function sepField(size, cols, rows, fn) {
  const cA = new Float32Array(size);
  const cB = new Float32Array(size);
  const rA = new Float32Array(size);
  const rB = new Float32Array(size);
  for (let i = 0; i < size; i++) {
    const [a, b] = cols(i / size);
    cA[i] = a;
    cB[i] = b;
    const [c, d] = rows(i / size);
    rA[i] = c;
    rB[i] = d;
  }
  const out = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    const ra = rA[y];
    const rb = rB[y];
    const r = y * size;
    for (let x = 0; x < size; x++) {
      out[r + x] = fn(cA[x], cB[x], ra, rb);
    }
  }
  return out;
}

function compose(size, fill, { srgb = false, repeat = 1, aniso = 8 } = {}) {
  if (!canCreateCanvasTextures()) return null;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size);
  const d = img.data;
  const out = [0, 0, 0];
  for (let i = 0, n = size * size; i < n; i++) {
    fill(i, out);
    d[i * 4] = 255 * clamp01(out[0]);
    d[i * 4 + 1] = 255 * clamp01(out[1]);
    d[i * 4 + 2] = 255 * clamp01(out[2]);
    d[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.anisotropy = aniso;
  t.userData = { shared: true, isCs2WeaponTex: true };
  return t;
}

function normalFromHeight(h, size, strength, repeat = 1) {
  if (!canCreateCanvasTextures()) return null;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size);
  const d = img.data;
  for (let y = 0; y < size; y++) {
    const r = y * size;
    const ru = (y === 0 ? size - 1 : y - 1) * size;
    const rd = (y === size - 1 ? 0 : y + 1) * size;
    for (let x = 0; x < size; x++) {
      const xl = x === 0 ? size - 1 : x - 1;
      const xr = x === size - 1 ? 0 : x + 1;
      const nx = -(h[r + xr] - h[r + xl]) * strength;
      const ny = (h[rd + x] - h[ru + x]) * strength;
      const il = 127.5 / Math.sqrt(nx * nx + ny * ny + 1);
      const i = (r + x) * 4;
      d[i] = 127.5 + nx * il;
      d[i + 1] = 127.5 + ny * il;
      d[i + 2] = 127.5 + il;
      d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.NoColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.anisotropy = 8;
  t.userData = { shared: true, isCs2WeaponTex: true };
  return t;
}

function mixFields(size, terms, bias = 0) {
  const out = new Float32Array(size * size).fill(bias);
  for (const [w, f] of terms) {
    for (let i = 0; i < out.length; i++) out[i] += w * f[i];
  }
  return out;
}

// ---------------------------------------------------------------- glove: stretch-nylon knit
export function makeGloveFabric(size = 512) {
  if (!canCreateCanvasTextures()) return null;
  const W = 56;
  const C = 80;
  const knit = sepField(
    size,
    (u) => [0.5 + 0.5 * Math.cos(u * Math.PI * 2 * W), Math.floor(u * W + 0.5) & 1],
    (v) => [0.5 + 0.5 * Math.cos(v * Math.PI * 2 * C), 0.5 - 0.5 * Math.cos(v * Math.PI * 2 * C)],
    (wale, odd, even, shifted) => wale * (0.55 + 0.45 * (odd ? shifted : even))
  );
  const fuzz = lowField(
    size,
    256,
    (u, v) =>
      0.22 * (vnoise(u * 44, v * 44, 44, 19) - 0.5) +
      0.26 * (vnoise(u * 112, v * 28, 112, 15, 28) - 0.5)
  );
  const wear = lowField(size, 64, (u, v) => sstep(0.46, 0.80, fbm(u, v, 3, 3, 17, 0.55)));
  const h = mixFields(size, [[0.55, knit], [1.0, fuzz], [-0.06, wear]]);
  const map = compose(
    size,
    (i, o) => {
      const k = knit[i] - 0.5;
      const f = fuzz[i];
      const w = wear[i];
      const l = (1 + 0.16 * k + f) * (1 + 0.28 * w);
      o[0] = lin2srgb((0.0232 + 0.0035 * w) * l * (1 + 0.12 * f));
      o[1] = lin2srgb((0.0252 + 0.0030 * w) * l);
      o[2] = lin2srgb((0.0273 + 0.0015 * w) * l * (1 - 0.10 * f));
    },
    { srgb: true }
  );
  const roughnessMap = compose(size, (i, o) => {
    o[0] = 0;
    o[1] = 0.80 + 0.07 * (knit[i] - 0.5) + 0.15 * fuzz[i] - 0.06 * wear[i];
    o[2] = 0;
  });
  return { map, normalMap: normalFromHeight(h, size, 4.0), roughnessMap, normalScale: 0.35 };
}

// ---------------------------------------------------------------- glove: synthetic-leather (Amara) palm
export function makeGloveLeather(size = 256) {
  if (!canCreateCanvasTextures()) return null;
  const cells = lowField(
    size,
    256,
    (u, v) => 0.6 * vnoise(u * 40, v * 40, 40, 21) + 0.4 * vnoise(u * 80, v * 80, 80, 23)
  );
  const pebble = cells.map((c) => sstep(0.32, 0.68, c));
  const micro = lowField(size, 256, (u, v) => vnoise(u * 112, v * 112, 112, 25));
  const dark = lowField(size, 64, (u, v) => sstep(0.50, 0.80, fbm(u, v, 3, 3, 27, 0.55)));
  const h = mixFields(size, [[0.7, pebble], [0.2, micro], [-0.1, dark]]);
  const map = compose(
    size,
    (i, o) => {
      const p = pebble[i] - 0.5;
      const m = micro[i] - 0.5;
      const d = dark[i];
      const l = (1 + 0.12 * p + 0.08 * m) * (1 - 0.28 * d);
      o[0] = lin2srgb(0.0481 * l);
      o[1] = lin2srgb(0.0369 * l);
      o[2] = lin2srgb(0.0343 * l);
    },
    { srgb: true }
  );
  const roughnessMap = compose(size, (i, o) => {
    o[0] = 0;
    o[1] = 0.55 + 0.06 * (pebble[i] - 0.5) + 0.03 * (micro[i] - 0.5) - 0.08 * dark[i];
    o[2] = 0;
  });
  return { map, normalMap: normalFromHeight(h, size, 3.0), roughnessMap, normalScale: 0.5 };
}

// ---------------------------------------------------------------- sleeve: rip-stop
export function makeRipstop(size = 512) {
  if (!canCreateCanvasTextures()) return null;
  const gl = (t) => {
    const d = lineDist(t, 1 / 12);
    return Math.exp(-(d * d) / (0.0035 * 0.0035));
  };
  const weave = sepField(
    size,
    (u) => [gl(u), Math.sin(u * Math.PI * 2 * 128)],
    (v) => [gl(v), Math.sin(v * Math.PI * 2 * 128)],
    (gu, su, gv, sv) => 0.12 * Math.max(gu, gv) + 0.08 * su * sv
  );
  const fibre = lowField(size, 256, (u, v) => vnoise(u * 128, v * 128, 128, 51));
  const mottle = lowField(size, 64, (u, v) => fbm(u, v, 4, 3, 53));
  const h = mixFields(size, [[1.0, weave], [0.14, fibre], [0.10, mottle]]);
  const map = compose(
    size,
    (i, o) => {
      const l = 1 + 0.20 * (mottle[i] - 0.5) + 0.12 * (fibre[i] - 0.5) + 0.6 * weave[i];
      o[0] = lin2srgb(0.0712 * l);
      o[1] = lin2srgb(0.0775 * l);
      o[2] = lin2srgb(0.0653 * l);
    },
    { srgb: true }
  );
  const roughnessMap = compose(size, (i, o) => {
    o[0] = 0;
    o[1] = 0.90 + 0.25 * weave[i] + 0.02 * (fibre[i] - 0.5);
    o[2] = 0;
  });
  return { map, normalMap: normalFromHeight(h, size, 2.5), roughnessMap, normalScale: 0.5 };
}

// ---------------------------------------------------------------- AK oiled walnut laminate wood
export function makeWood(size = 512) {
  if (!canCreateCanvasTextures()) return null;
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const streaks = [];
  for (let i = 0; i < 80; i++) {
    streaks.push({
      y: rnd(),
      w: (0.5 + rnd() * 1.6) / size,
      a: 0.18 + rnd() * 0.45,
      f: 1 + Math.floor(rnd() * 3),
      ph: rnd() * 6.28
    });
  }
  const grain = field(size, (u, v) => {
    let g = 0;
    for (const s of streaks) {
      const yy = s.y + Math.sin(u * Math.PI * 2 * s.f + s.ph) * 0.006;
      let dy = v - yy;
      dy -= Math.round(dy);
      if (Math.abs(dy) > s.w * 4) continue;
      g += s.a * Math.exp(-(dy * dy) / (s.w * s.w * 2.5));
    }
    return Math.min(1, g);
  });
  const band = field(size, (u, v) => 0.5 + 0.5 * Math.sin(v * Math.PI * 2 * 5 + Math.sin(u * Math.PI * 2) * 1.2));
  const fine = field(size, (u, v) => fbm(u, v * 8, 4, 3, 61));
  const map = compose(
    size,
    (i, o) => {
      const t = clamp01(0.58 + band[i] * 0.20 - grain[i] * 0.48 + (fine[i] - 0.5) * 0.20);
      const r = 0.16 + 0.37 * t;
      const g = 0.09 + 0.225 * t;
      const b = 0.05 + 0.125 * t;
      const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      o[0] = r * 0.92 + l * 0.08;
      o[1] = g * 0.92 + l * 0.08;
      o[2] = b * 0.92 + l * 0.08;
    },
    { srgb: true, repeat: 1.5 }
  );
  const h = mixFields(size, [[-0.6, grain], [0.1, band], [0.3, fine]], -0.15);
  const roughnessMap = compose(
    size,
    (i, o) => {
      o[0] = 0;
      o[1] = 0.44 + 0.14 * grain[i] + 0.06 * (fine[i] - 0.5);
      o[2] = 0;
    },
    { repeat: 1.5 }
  );
  return { map, normalMap: normalFromHeight(h, size, 2.2, 1.5), roughnessMap, normalScale: 0.6 };
}

// ---------------------------------------------------------------- bakelite grip
export function makeBakelite(size = 256) {
  if (!canCreateCanvasTextures()) return null;
  const map = compose(
    size,
    (i, o) => {
      const u = (i % size) / size;
      const v = Math.floor(i / size) / size;
      const n = fbm(u, v * 3, 3, 4, 71);
      const s = Math.pow(0.5 + 0.5 * Math.sin(n * 18 + v * 6), 3);
      const t = 0.35 + 0.35 * n + 0.3 * s;
      o[0] = 0.26 + 0.16 * t;
      o[1] = 0.14 + 0.10 * t;
      o[2] = 0.105 + 0.075 * t;
    },
    { srgb: true, repeat: 2 }
  );
  return { map };
}

// ---------------------------------------------------------------- steel: blued finish, directional scratches, wear mask
function scratchField(size, n, seed, along = 0.85, jit = 0.18, lenMin = 0.05, lenMax = 0.30) {
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const lines = [];
  for (let i = 0; i < n; i++) {
    const a = (rnd() < along ? 0 : Math.PI * 0.5) + (rnd() - 0.5) * 2 * jit;
    lines.push({
      x: rnd(),
      y: rnd(),
      ca: Math.cos(a),
      sa: Math.sin(a),
      l: lenMin + rnd() * (lenMax - lenMin),
      w: (0.4 + rnd() * 0.5) / size,
      k: 0.4 + rnd() * 0.6
    });
  }
  return field(size, (u, v) => {
    let s = 0;
    for (const L of lines) {
      let dx = u - L.x;
      let dy = v - L.y;
      dx -= Math.round(dx);
      dy -= Math.round(dy);
      if (Math.abs(dx) > L.l * 0.5 && Math.abs(dy) > L.l * 0.5) continue;
      const al = dx * L.ca + dy * L.sa;
      if (Math.abs(al) > L.l * 0.5) continue;
      const perp = -dx * L.sa + dy * L.ca;
      if (Math.abs(perp) > L.w * 3) continue;
      s = Math.max(
        s,
        L.k * Math.exp(-(perp * perp) / (L.w * L.w * 2)) * (0.6 + 0.4 * Math.cos((al / L.l) * Math.PI))
      );
    }
    return clamp01(s);
  });
}

export function makeSteel(size = 256) {
  if (!canCreateCanvasTextures()) return null;
  const scratch = scratchField(size, 140, 99);
  const tone = field(size, (u, v) => fbm(u, v, 3, 3, 71, 0.5));
  const grain = field(size, (u, v) => fbm(u, v, 128, 1, 91));
  const wearNoise = field(size, (u, v) => clamp01((fbm(u, v, 10, 3, 81, 0.6) - 0.25) * 1.8));
  const map = compose(
    size,
    (i, o) => {
      const l = 0.96 + 0.08 * tone[i] + 0.05 * scratch[i] + 0.02 * (grain[i] - 0.5);
      o[0] = o[1] = o[2] = l;
    },
    { srgb: true }
  );
  const roughnessMap = compose(size, (i, o) => {
    o[0] = wearNoise[i];
    o[1] = 0.96 + 0.08 * (tone[i] - 0.5) + 0.04 * (grain[i] - 0.5) - 0.28 * scratch[i];
    o[2] = 1;
  });
  const h = mixFields(size, [[-0.30, scratch], [0.04, grain]], -0.02);
  return { map, roughnessMap, normalMap: normalFromHeight(h, size, 1.6), normalScale: 0.35 };
}

// ---------------------------------------------------------------- knife blade: brushed stainless steel
export function makeKnifeBlade(size = 256) {
  if (!canCreateCanvasTextures()) return null;
  const brush = scratchField(size, 200, 147, 0.96, 0.04, 0.14, 0.48);
  const micro = field(size, (u, v) => vnoise(u * 12, v * 160, 12, 151, 160));
  const tone = field(size, (u, v) => fbm(u, v, 4, 2, 157, 0.5));
  const map = compose(
    size,
    (i, o) => {
      const l = 0.94 + 0.06 * tone[i] + 0.06 * brush[i] + 0.04 * (micro[i] - 0.5);
      o[0] = l;
      o[1] = l;
      o[2] = clamp01(l * 1.015);
    },
    { srgb: true }
  );
  const roughnessMap = compose(size, (i, o) => {
    o[0] = 0.5;
    o[1] = 0.92 + 0.12 * (micro[i] - 0.5) - 0.22 * brush[i];
    o[2] = 1;
  });
  const h = mixFields(size, [[-0.18, brush], [0.08, micro]]);
  return { map, roughnessMap, normalMap: normalFromHeight(h, size, 1.1), normalScale: 0.24 };
}

// ---------------------------------------------------------------- polymer speckle (rubber, knife handle)
export function makeSpeckle(size = 256) {
  if (!canCreateCanvasTextures()) return null;
  const h = field(size, (u, v) => fbm(u, v, 64, 2, 101, 0.6) * 0.45 + fbm(u, v, 128, 1, 103) * 0.55);
  const map = compose(size, (i, o) => {
    const u = (i % size) / size;
    const v = Math.floor(i / size) / size;
    const n = 0.88 + 0.24 * fbm(u, v, 6, 3, 111);
    o[0] = o[1] = o[2] = n;
  });
  return { normalMap: normalFromHeight(h, size, 2.2), map, normalScale: 0.4 };
}

// ---------------------------------------------------------------- AWP polymer chassis
export function makePolymer(size = 256) {
  if (!canCreateCanvasTextures()) return null;
  const cells = field(size, (u, v) => fbm(u, v, 96, 1, 121));
  const speck = cells.map((c) => sstep(0.46, 0.54, c));
  const fine = field(size, (u, v) => fbm(u, v, 192, 1, 123));
  const mottle = field(size, (u, v) => fbm(u, v, 5, 3, 125));
  const wearNoise = field(size, (u, v) => clamp01((fbm(u, v, 9, 3, 127, 0.6) - 0.25) * 1.8));
  const map = compose(
    size,
    (i, o) => {
      const l = 0.94 + 0.12 * speck[i] + 0.06 * (mottle[i] - 0.5) + 0.02 * (fine[i] - 0.5);
      o[0] = o[1] = o[2] = l;
    },
    { srgb: true }
  );
  const roughnessMap = compose(size, (i, o) => {
    o[0] = wearNoise[i];
    o[1] = 1.0 - 0.07 * speck[i] - 0.03 * fine[i];
    o[2] = 0;
  });
  const h = mixFields(size, [[0.7, cells], [0.3, fine]]);
  return { map, roughnessMap, normalMap: normalFromHeight(h, size, 2.6), normalScale: 0.3 };
}

// ---------------------------------------------------------------- scope lens
export function makeLens(size = 128) {
  if (!canCreateCanvasTextures()) return null;
  const map = compose(
    size,
    (i, o) => {
      const u = (i % size) / size - 0.5;
      const v = Math.floor(i / size) / size - 0.5;
      const r = Math.hypot(u, v) * 2;
      const t = sstep(0.0, 1.0, r);
      const rim = sstep(0.86, 0.94, r) * (1 - sstep(0.97, 1.0, r));
      o[0] = 0.02 + 0.10 * t + 0.45 * rim;
      o[1] = 0.05 + 0.15 * t + 0.45 * rim;
      o[2] = 0.09 + 0.20 * t + 0.42 * rim;
    },
    { srgb: true, aniso: 4 }
  );
  const emissiveMap = compose(
    size,
    (i, o) => {
      const u = (i % size) / size;
      const v = Math.floor(i / size) / size;
      const g = (cx, cy, ax, ay, ang) => {
        const c = Math.cos(ang);
        const s = Math.sin(ang);
        const dx = u - cx;
        const dy = v - cy;
        const x = (dx * c + dy * s) / ax;
        const y = (-dx * s + dy * c) / ay;
        return Math.exp(-(x * x + y * y) * 2.2);
      };
      const hi = g(0.36, 0.66, 0.17, 0.085, -0.6) + 0.45 * g(0.63, 0.36, 0.06, 0.035, -0.6);
      const ring = 0.12 * Math.exp(-((Math.hypot(u - 0.5, v - 0.5) * 2 - 0.62) ** 2) / 0.004);
      const e = clamp01(hi + ring);
      o[0] = e * 0.95;
      o[1] = e;
      o[2] = e;
    },
    { srgb: true, aniso: 4 }
  );
  if (map) map.wrapS = map.wrapT = THREE.ClampToEdgeWrapping;
  if (emissiveMap) emissiveMap.wrapS = emissiveMap.wrapT = THREE.ClampToEdgeWrapping;
  return { map, emissiveMap };
}

// ---------------------------------------------------------------- lightweight camera-space muzzle flash sprite
let _flashTex = null;
export function makeCs2MuzzleFlashTexture(size = 128) {
  if (_flashTex) return _flashTex;
  if (!canCreateCanvasTextures()) return null;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  if (!ctx || typeof ctx.createRadialGradient !== 'function') return null;
  ctx.clearRect(0, 0, size, size);
  const cx = size * 0.5;
  const cy = size * 0.5;

  const core = ctx.createRadialGradient(cx, cy, 1, cx, cy, size * 0.48);
  core.addColorStop(0.0, 'rgba(255, 255, 250, 1.0)');
  core.addColorStop(0.18, 'rgba(255, 240, 185, 0.92)');
  core.addColorStop(0.45, 'rgba(255, 175, 68, 0.45)');
  core.addColorStop(0.76, 'rgba(255, 102, 22, 0.10)');
  core.addColorStop(1.0, 'rgba(0, 0, 0, 0.0)');
  ctx.fillStyle = core;
  ctx.fillRect(0, 0, size, size);

  const rays = 7;
  for (let i = 0; i < rays; i++) {
    const ang = (i / rays) * Math.PI * 2 + (i % 2 === 0 ? 0.11 : -0.07);
    const len = size * (i % 2 === 0 ? 0.47 : 0.36);
    const halfW = size * (i % 2 === 0 ? 0.09 : 0.065);
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(ang);
    const g = ctx.createLinearGradient(0, 0, len, 0);
    g.addColorStop(0.0, 'rgba(255, 252, 232, 0.95)');
    g.addColorStop(0.35, 'rgba(255, 200, 88, 0.65)');
    g.addColorStop(0.75, 'rgba(255, 118, 24, 0.18)');
    g.addColorStop(1.0, 'rgba(0, 0, 0, 0.0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(0, -halfW);
    ctx.lineTo(len, 0);
    ctx.lineTo(0, halfW);
    ctx.lineTo(-size * 0.04, 0);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  _flashTex = new THREE.CanvasTexture(c);
  _flashTex.colorSpace = THREE.SRGBColorSpace;
  _flashTex.wrapS = _flashTex.wrapT = THREE.ClampToEdgeWrapping;
  _flashTex.userData = { shared: true, isCs2WeaponTex: true };
  return _flashTex;
}

/** Lazily built, shared across all CS2 GLB weapons. Returns null cleanly when canvas 2D is unavailable. */
let _sets = null;
export function weaponTextureSets() {
  if (_sets) return _sets;
  if (!canCreateCanvasTextures()) return null;
  const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
  _sets = {
    fabric: makeGloveFabric(512),
    leather: makeGloveLeather(256),
    ripstop: makeRipstop(512),
    wood: makeWood(512),
    bakelite: makeBakelite(256),
    steel: makeSteel(256),
    speckle: makeSpeckle(256),
    polymer: makePolymer(256),
    lens: makeLens(128),
    knifeBlade: makeKnifeBlade(256)
  };
  _sets.ms = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0;
  return _sets;
}
