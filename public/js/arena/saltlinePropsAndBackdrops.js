import * as THREE from '../three.js';
import {
  createBombsiteDecalAtlasTexture,
  createSaltlineDecalAtlasTexture,
  getBombsiteDecalUVRect,
  getSaltlineDecalUVRect
} from './proceduralTextures.js';

/**
 * Creates shared PBR materials for Saltline harbor vessels, shipping container valleys, pallet timber,
 * molded ordnance cases, concrete copings, dock fenders, and beacons — registered in `game.arenaMaterials`
 * for zero-leak map disposal.
 */
export function createSaltlineBackdropMaterials(game) {
  const shipHullNavyMat = new THREE.MeshStandardMaterial({
    color: 0x162538,
    roughness: 0.44,
    metalness: 0.64,
    envMapIntensity: 1.28
  });
  const shipAntifoulRedMat = new THREE.MeshStandardMaterial({
    color: 0x7a2620,
    roughness: 0.56,
    metalness: 0.36,
    envMapIntensity: 1.05
  });
  const shipBridgeWhiteMat = new THREE.MeshStandardMaterial({
    color: 0xd6dfe8,
    roughness: 0.46,
    metalness: 0.22,
    envMapIntensity: 1.08
  });
  const shipWindowDarkMat = new THREE.MeshStandardMaterial({
    color: 0x091320,
    roughness: 0.12,
    metalness: 0.90,
    envMapIntensity: 1.55
  });
  const cortenRustMat = new THREE.MeshStandardMaterial({
    color: 0x913d25,
    roughness: 0.46,
    metalness: 0.50,
    envMapIntensity: 1.18
  });
  const nordkapBlueMat = new THREE.MeshStandardMaterial({
    color: 0x1e537b,
    roughness: 0.42,
    metalness: 0.52,
    envMapIntensity: 1.22
  });
  const cortenValleyMat = new THREE.MeshStandardMaterial({
    color: 0x562314,
    roughness: 0.54,
    metalness: 0.46,
    envMapIntensity: 1.0
  });
  const nordkapValleyMat = new THREE.MeshStandardMaterial({
    color: 0x12334d,
    roughness: 0.50,
    metalness: 0.48,
    envMapIntensity: 1.0
  });
  const tarpOliveMat = new THREE.MeshStandardMaterial({
    color: 0x3c4b3d,
    roughness: 0.78,
    metalness: 0.06
  });
  const rubberFenderMat = new THREE.MeshStandardMaterial({
    color: 0x11151b,
    roughness: 0.88,
    metalness: 0.06
  });
  const containerValleyMat = new THREE.MeshStandardMaterial({
    color: 0x2f3a48,
    roughness: 0.56,
    metalness: 0.46
  });
  const palletTimberMat = new THREE.MeshStandardMaterial({
    color: 0x674e36,
    roughness: 0.84,
    metalness: 0.04
  });
  const pelicanPolymerMat = new THREE.MeshStandardMaterial({
    color: 0x222932,
    roughness: 0.56,
    metalness: 0.16
  });
  const concretePlinthMat = new THREE.MeshStandardMaterial({
    color: 0x525b67,
    roughness: 0.82,
    metalness: 0.06
  });
  const beaconRedEmissiveMat = new THREE.MeshBasicMaterial({
    color: 0xff3b30
  });
  const floodlightLensMat = new THREE.MeshBasicMaterial({
    color: 0xfff5d8
  });
  const dustStuccoWarmMat = new THREE.MeshStandardMaterial({
    color: 0xe8d5b3,
    roughness: 0.90,
    metalness: 0.02
  });
  const dustStuccoOchreMat = new THREE.MeshStandardMaterial({
    color: 0xd5b07e,
    roughness: 0.90,
    metalness: 0.02
  });
  const dustStuccoTerracottaMat = new THREE.MeshStandardMaterial({
    color: 0xc68a63,
    roughness: 0.89,
    metalness: 0.02
  });
  const dustSandstoneTrimMat = new THREE.MeshStandardMaterial({
    color: 0xc8ac82,
    roughness: 0.88,
    metalness: 0.02
  });
  const dustCedarWoodMat = new THREE.MeshStandardMaterial({
    color: 0x5c4028,
    roughness: 0.88,
    metalness: 0.03
  });
  const dustMarketCanopyMat = new THREE.MeshStandardMaterial({
    color: 0xb95f3c,
    roughness: 0.88,
    metalness: 0.0
  });
  const dustMarketClothMat = new THREE.MeshStandardMaterial({
    color: 0xe4cfa6,
    roughness: 0.88,
    metalness: 0.0
  });
  const dustMesaRockMat = new THREE.MeshStandardMaterial({
    color: 0xb99064,
    roughness: 0.94,
    metalness: 0.0
  });
  const dustDomeTealMat = new THREE.MeshStandardMaterial({
    color: 0x5e7d73,
    roughness: 0.76,
    metalness: 0.12
  });

  const all = [
    shipHullNavyMat,
    shipAntifoulRedMat,
    shipBridgeWhiteMat,
    shipWindowDarkMat,
    cortenRustMat,
    nordkapBlueMat,
    cortenValleyMat,
    nordkapValleyMat,
    tarpOliveMat,
    rubberFenderMat,
    containerValleyMat,
    palletTimberMat,
    pelicanPolymerMat,
    concretePlinthMat,
    beaconRedEmissiveMat,
    floodlightLensMat,
    dustStuccoWarmMat,
    dustStuccoOchreMat,
    dustStuccoTerracottaMat,
    dustSandstoneTrimMat,
    dustCedarWoodMat,
    dustMarketCanopyMat,
    dustMarketClothMat,
    dustMesaRockMat,
    dustDomeTealMat
  ];
  for (let i = 0; i < all.length; i++) {
    game.arenaMaterials.add(all[i]);
  }

  return {
    shipHullNavyMat,
    shipAntifoulRedMat,
    shipBridgeWhiteMat,
    shipWindowDarkMat,
    cortenRustMat,
    nordkapBlueMat,
    cortenValleyMat,
    nordkapValleyMat,
    tarpOliveMat,
    rubberFenderMat,
    containerValleyMat,
    palletTimberMat,
    pelicanPolymerMat,
    concretePlinthMat,
    beaconRedEmissiveMat,
    floodlightLensMat,
    dustStuccoWarmMat,
    dustStuccoOchreMat,
    dustStuccoTerracottaMat,
    dustSandstoneTrimMat,
    dustCedarWoodMat,
    dustMarketCanopyMat,
    dustMarketClothMat,
    dustMesaRockMat,
    dustDomeTealMat
  };
}

/**
 * Builds an indexed trapezoidal prism BufferGeometry (extruded along local Y in [-0.5, +0.5],
 * base width along X = bottomSpan, top width along X = topSpan, thickness along Z in [-0.5, +0.5])
 * with crisp flat-shaded normals, UV0, and world-metric UV1 for corrugated steel ribs & tapered Jersey barriers.
 */
export function createTrapezoidPrismGeometry(
  bottomSpanX = 1.0,
  heightY = 1.0,
  bottomDepthZ = 1.0,
  topSpanX = 0.62,
  topDepthZ = 1.0,
  tile = 2.0,
  uvOffset = [0, 0]
) {
  const bx = bottomSpanX * 0.5;
  const bz = bottomDepthZ * 0.5;
  const tx = topSpanX * 0.5;
  const tz = topDepthZ * 0.5;
  const hy = heightY * 0.5;

  // 8 corner vertices of a symmetric frustum/trapezoid:
  // Bottom (-hy): 0=(-bx,-hy,-bz), 1=(bx,-hy,-bz), 2=(bx,-hy,bz), 3=(-bx,-hy,bz)
  // Top (+hy):    4=(-tx,hy,-tz),  5=(tx,hy,-tz),  6=(tx,hy,tz),  7=(-tx,hy,tz)
  const c = [
    [-bx, -hy, -bz],
    [bx, -hy, -bz],
    [bx, -hy, bz],
    [-bx, -hy, bz],
    [-tx, hy, -tz],
    [tx, hy, -tz],
    [tx, hy, tz],
    [-tx, hy, tz]
  ];

  // 6 quad faces (CCW winding from outside): +Z, -Z, +X, -X, +Y, -Y
  const faces = [
    { idx: [3, 2, 6, 7], uSpan: (bottomSpanX + topSpanX) * 0.5, vSpan: heightY }, // +Z
    { idx: [1, 0, 4, 5], uSpan: (bottomSpanX + topSpanX) * 0.5, vSpan: heightY }, // -Z
    { idx: [2, 1, 5, 6], uSpan: (bottomDepthZ + topDepthZ) * 0.5, vSpan: heightY }, // +X
    { idx: [0, 3, 7, 4], uSpan: (bottomDepthZ + topDepthZ) * 0.5, vSpan: heightY }, // -X
    { idx: [7, 6, 5, 4], uSpan: topSpanX, vSpan: topDepthZ }, // +Y
    { idx: [0, 1, 2, 3], uSpan: bottomSpanX, vSpan: bottomDepthZ } // -Y
  ];

  const pos = new Float32Array(24 * 3);
  const nor = new Float32Array(24 * 3);
  const uv = new Float32Array(24 * 2);
  const uv1 = new Float32Array(24 * 2);
  const indices = new Uint16Array(36);

  const vA = new THREE.Vector3();
  const vB = new THREE.Vector3();
  const vC = new THREE.Vector3();
  const e1 = new THREE.Vector3();
  const e2 = new THREE.Vector3();
  const n = new THREE.Vector3();
  const quadUvs = [
    [0, 0],
    [1, 0],
    [1, 1],
    [0, 1]
  ];

  for (let f = 0; f < 6; f++) {
    const { idx, uSpan, vSpan } = faces[f];
    vA.fromArray(c[idx[0]]);
    vB.fromArray(c[idx[1]]);
    vC.fromArray(c[idx[2]]);
    e1.subVectors(vB, vA);
    e2.subVectors(vC, vA);
    n.crossVectors(e1, e2).normalize();

    const baseV = f * 4;
    const uRep = Math.max(0.25, uSpan / 3.2);
    const vRep = Math.max(0.25, vSpan / 3.2);
    for (let k = 0; k < 4; k++) {
      const p = c[idx[k]];
      const vi = (baseV + k) * 3;
      const ui = (baseV + k) * 2;
      pos[vi] = p[0];
      pos[vi + 1] = p[1];
      pos[vi + 2] = p[2];
      nor[vi] = n.x;
      nor[vi + 1] = n.y;
      nor[vi + 2] = n.z;
      const [qu, qv] = quadUvs[k];
      uv[ui] = qu * uRep;
      uv[ui + 1] = qv * vRep;
      uv1[ui] = (qu * uSpan) / tile + uvOffset[0];
      uv1[ui + 1] = (qv * vSpan) / tile + uvOffset[1];
    }

    const ii = f * 6;
    indices[ii] = baseV;
    indices[ii + 1] = baseV + 1;
    indices[ii + 2] = baseV + 2;
    indices[ii + 3] = baseV;
    indices[ii + 4] = baseV + 2;
    indices[ii + 5] = baseV + 3;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setAttribute('uv1', new THREE.BufferAttribute(uv1, 2));
  geo.setIndex(new THREE.BufferAttribute(indices, 1));
  return geo;
}

/**
 * Builds a moored ocean-going Saltline container feeder vessel outside the harbor sea-wall using instanced primitives,
 * complete with raked bow flare, bulbous waterline boot-top, hatch coamings, cell-guide container bays, and multi-tier bridge.
 */
export function buildSaltlineCargoShip({
  cx,
  cz,
  alongZ = true,
  scale = 1.0,
  highDetail = true,
  registerBox,
  registerCyl,
  mats,
  darkSteelMat,
  gunmetalFrameMat,
  brushedChromeMat,
  hazardMat
}) {
  const shipLen = 98 * scale;
  const shipBeam = 18.8 * scale;
  const hullH = 11.4 * scale;
  const waterY = -1.45;
  const deckY = waterY + hullH;

  const placePart = (mat, alongOffset, crossOffset, y, len, h, wid) => {
    if (alongZ) {
      registerBox(cx + crossOffset, y, cz + alongOffset, wid, h, len, mat);
    } else {
      registerBox(cx + alongOffset, y, cz + crossOffset, len, h, wid, mat);
    }
  };

  // Anti-fouling red lower boot-top, stepped midship hull & tapered bow/stern sections
  placePart(mats.shipAntifoulRedMat, -shipLen * 0.02, 0, waterY + 1.5 * scale, shipLen * 0.88, 3.0 * scale, shipBeam * 0.94);
  placePart(mats.shipHullNavyMat, -shipLen * 0.03, 0, waterY + 2.8 * scale + hullH * 0.42, shipLen * 0.84, hullH * 0.84, shipBeam);
  // Stepped raked bow flare + forecastle deck + bow mast
  placePart(mats.shipHullNavyMat, shipLen * 0.42, 0, waterY + 3.2 * scale + hullH * 0.42, shipLen * 0.14, hullH * 0.82, shipBeam * 0.72);
  placePart(mats.shipHullNavyMat, shipLen * 0.49, 0, deckY + 0.6 * scale, shipLen * 0.08, 4.2 * scale, shipBeam * 0.44);
  placePart(mats.shipHullNavyMat, shipLen * 0.44, 0, deckY + 1.5 * scale, shipLen * 0.16, 2.8 * scale, shipBeam * 0.82);
  // Stern transom step
  placePart(mats.shipHullNavyMat, -shipLen * 0.46, 0, waterY + 3.6 * scale + hullH * 0.36, shipLen * 0.10, hullH * 0.72, shipBeam * 0.80);

  // Main weather deck & gunwale coaming rails
  placePart(darkSteelMat, -shipLen * 0.01, 0, deckY + 0.25 * scale, shipLen * 0.92, 0.55 * scale, shipBeam * 1.01);
  placePart(mats.shipBridgeWhiteMat, -shipLen * 0.02, -shipBeam * 0.505, waterY + 3.1 * scale, shipLen * 0.82, 0.28 * scale, 0.12);
  placePart(mats.shipBridgeWhiteMat, -shipLen * 0.02, shipBeam * 0.505, waterY + 3.1 * scale, shipLen * 0.82, 0.28 * scale, 0.12);

  // Forward forecastle mast & navigation light
  const bowMastX = alongZ ? cx : cx + shipLen * 0.47;
  const bowMastZ = alongZ ? cz + shipLen * 0.47 : cz;
  registerCyl(bowMastX, deckY + 5.6 * scale, bowMastZ, 0.18 * scale, 6.2 * scale, brushedChromeMat, 'y');

  // Multi-deck white aft bridge superstructure
  const aftPos = -shipLen * 0.31;
  const tier1H = 5.4 * scale;
  const tier2H = 4.8 * scale;
  const tier3H = 4.2 * scale;
  const bridgeCabH = 3.4 * scale;

  placePart(mats.shipBridgeWhiteMat, aftPos, 0, deckY + tier1H * 0.5, 13.5 * scale, tier1H, shipBeam * 0.88);
  placePart(mats.shipBridgeWhiteMat, aftPos - 0.4 * scale, 0, deckY + tier1H + tier2H * 0.5, 11.4 * scale, tier2H, shipBeam * 0.80);
  placePart(mats.shipBridgeWhiteMat, aftPos - 0.6 * scale, 0, deckY + tier1H + tier2H + tier3H * 0.5, 9.6 * scale, tier3H, shipBeam * 0.74);

  // Exterior bridge deck walkways / lifeboat davit wings
  if (highDetail) {
    placePart(darkSteelMat, aftPos - 0.4 * scale, 0, deckY + tier1H + 0.14 * scale, 12.2 * scale, 0.22 * scale, shipBeam * 0.94);
    placePart(darkSteelMat, aftPos - 0.6 * scale, 0, deckY + tier1H + tier2H + 0.14 * scale, 10.4 * scale, 0.22 * scale, shipBeam * 0.86);
    placePart(hazardMat, aftPos - 1.2 * scale, -shipBeam * 0.47, deckY + tier1H + 1.4 * scale, 5.8 * scale, 1.35 * scale, 1.8 * scale);
    placePart(hazardMat, aftPos - 1.2 * scale, shipBeam * 0.47, deckY + tier1H + 1.4 * scale, 5.8 * scale, 1.35 * scale, 1.8 * scale);
  }

  // Wide cantilevered navigation bridge wings
  const navY = deckY + tier1H + tier2H + tier3H + bridgeCabH * 0.5;
  placePart(mats.shipBridgeWhiteMat, aftPos + 0.4 * scale, 0, navY, 8.2 * scale, bridgeCabH, shipBeam * 1.18);
  placePart(mats.shipWindowDarkMat, aftPos + 4.15 * scale, 0, navY + 0.25 * scale, 0.45 * scale, bridgeCabH * 0.46, shipBeam * 1.12);
  placePart(darkSteelMat, aftPos + 0.4 * scale, 0, navY + bridgeCabH * 0.5 + 0.22 * scale, 8.6 * scale, 0.36 * scale, shipBeam * 1.20);

  // Aft exhaust funnel casing & twin exhaust stacks
  const funnelY = deckY + tier1H + tier2H + 4.6 * scale;
  placePart(mats.cortenRustMat, aftPos - 5.2 * scale, 0, funnelY, 4.4 * scale, 7.6 * scale, 5.2 * scale);
  placePart(darkSteelMat, aftPos - 5.2 * scale, 0, funnelY + 3.9 * scale, 4.7 * scale, 1.1 * scale, 5.5 * scale);

  // Radar mast & compact navigation warning beacon atop navigation bridge
  const mastBaseY = navY + bridgeCabH * 0.5;
  const mastX = alongZ ? cx : cx + aftPos;
  const mastZ = alongZ ? cz + aftPos : cz;
  registerCyl(mastX, mastBaseY + 3.8 * scale, mastZ, 0.26 * scale, 7.6 * scale, brushedChromeMat, 'y');
  placePart(gunmetalFrameMat, aftPos, 0, mastBaseY + 5.2 * scale, 0.5 * scale, 0.35 * scale, 5.6 * scale);
  registerCyl(mastX, mastBaseY + 7.64 * scale, mastZ, 0.15 * scale, 0.14 * scale, darkSteelMat, 'y');
  registerCyl(mastX, mastBaseY + 7.82 * scale, mastZ, 0.12 * scale, 0.24 * scale, mats.beaconRedEmissiveMat, 'y');

  // NORDKAP LINE multi-tier ISO deck container stacks + cell-guide lashing bridges forward of bridge
  const stackBays = highDetail ? [-0.11, 0.07, 0.25] : [0.02, 0.22];
  const stackCols = highDetail ? [-0.28, 0, 0.28] : [-0.22, 0.22];
  const cH = 2.9 * scale;
  const cLen = 12.6 * scale;
  const cWid = 4.4 * scale;
  const palette = [mats.cortenRustMat, mats.nordkapBlueMat, mats.tarpOliveMat, gunmetalFrameMat];

  for (let b = 0; b < stackBays.length; b++) {
    const bayAlong = shipLen * stackBays[b];
    placePart(darkSteelMat, bayAlong, 0, deckY + 0.85 * scale, cLen * 1.03, 0.75 * scale, shipBeam * 0.88);
    const tiers = highDetail ? 3 - (b === 2 ? 1 : 0) : 2;
    for (let col = 0; col < stackCols.length; col++) {
      const bayCross = shipBeam * stackCols[col];
      for (let t = 0; t < tiers; t++) {
        const mat = palette[(b * 3 + col * 2 + t) % palette.length];
        const cy = deckY + 1.15 * scale + (t + 0.5) * cH;
        placePart(mat, bayAlong, bayCross, cy, cLen, cH - 0.10, cWid);
        if (highDetail) {
          placePart(darkSteelMat, bayAlong, bayCross, cy + cH * 0.46, cLen + 0.14, 0.14 * scale, cWid + 0.14);
        }
      }
    }
  }
}

/**
 * Builds an industrial ship-to-shore / dockyard portal gantry crane with rail bogies, lattice cross-bracing,
 * machinery house, apex tie-rods, operator trolley cab, 4 hoist cables, spreader, and suspended ISO container.
 */
export function buildSaltlineGantryCrane({
  gx,
  sideSign,
  highDetail = true,
  registerInstanced,
  unitBoxGeo,
  unitCylGeo,
  mats,
  darkSteelMat,
  gunmetalFrameMat,
  brushedChromeMat,
  hazardMat,
  trimAccentMat,
  trimSecondaryMat
}) {
  const addBox = (x, y, z, w, h, d, mat, castShadow = false, rx = 0, ry = 0, rz = 0) =>
    registerInstanced(unitBoxGeo, mat, x, y, z, w, h, d, rx, ry, rz, castShadow);
  const addCyl = (x, y, z, r, len, mat, rx = 0, ry = 0, rz = 0) =>
    registerInstanced(unitCylGeo, mat, x, y, z, r * 2, len, r * 2, rx, ry, rz, false);

  // Steel crane rail tracks embedded on tarmac outside walkable crane deck
  for (const lxOff of [-6.6, 6.6]) {
    addBox(gx + lxOff, 0.04, 0, 0.24, 0.08, 26.0, gunmetalFrameMat);
  }

  // Portal legs & rail bogies (placed at z = ±8.8 outside walkable 12x16m crane deck)
  for (const lz of [-8.8, 8.8]) {
    for (const lxOff of [-6.6, 6.6]) {
      const lx = gx + lxOff;
      addBox(lx, 0.55, lz, 2.4, 1.1, 2.0, darkSteelMat);
      addBox(lx, 0.32, lz + (lz > 0 ? 1.12 : -1.12), 1.5, 0.44, 0.32, hazardMat);
      addBox(lx, 11.6, lz, 1.12, 21.2, 1.12, mats.nordkapBlueMat, true);
      addBox(lx, 2.2, lz, 1.20, 1.6, 1.20, hazardMat);
    }

    // Horizontal portal tie beams
    addBox(gx, 6.2, lz, 14.2, 0.58, 0.62, darkSteelMat);
    addBox(gx, 11.8, lz, 14.2, 0.65, 0.68, darkSteelMat);
    addBox(gx, 17.2, lz, 14.2, 0.65, 0.68, darkSteelMat);
    addBox(gx, 21.8, lz, 15.0, 1.18, 1.35, gunmetalFrameMat);

    // Diagonal X-lattice truss bracing between portal legs on Medium/High
    if (highDetail) {
      addBox(gx, 9.0, lz, 13.8, 0.26, 0.28, gunmetalFrameMat, false, 0, 0, 0.38);
      addBox(gx, 9.0, lz, 13.8, 0.26, 0.28, gunmetalFrameMat, false, 0, 0, -0.38);
      addBox(gx, 14.5, lz, 13.8, 0.26, 0.28, gunmetalFrameMat, false, 0, 0, 0.38);
      addBox(gx, 14.5, lz, 13.8, 0.26, 0.28, gunmetalFrameMat, false, 0, 0, -0.38);
    }
  }

  // Twin cantilevered main boom girders + maintenance catwalk
  const boomX = gx - sideSign * 7.2;
  addBox(boomX, 22.8, -8.8, 31.0, 1.45, 1.15, darkSteelMat, true);
  addBox(boomX, 22.8, 8.8, 31.0, 1.45, 1.15, darkSteelMat, true);
  for (let bxOff = -13; bxOff <= 13; bxOff += 6.5) {
    addBox(boomX + bxOff, 22.8, 0, 0.72, 0.95, 16.6, gunmetalFrameMat);
  }
  addBox(boomX, 23.65, -8.8, 31.4, 0.24, 0.34, trimAccentMat);
  addBox(boomX, 23.65, 8.8, 31.4, 0.24, 0.34, trimAccentMat);

  // Upper A-frame apex pylon & tension forestay/backstay rods + Machinery House
  const apexY = 29.4;
  addBox(gx, 25.8, -8.8, 0.92, 6.8, 0.92, mats.nordkapBlueMat);
  addBox(gx, 25.8, 8.8, 0.92, 6.8, 0.92, mats.nordkapBlueMat);
  addBox(gx, apexY, 0, 1.2, 0.85, 18.6, gunmetalFrameMat);
  addBox(gx + sideSign * 3.4, 24.9, 0, 6.4, 3.2, 8.8, gunmetalFrameMat);
  addBox(gx + sideSign * 3.4, 26.65, 0, 6.8, 0.28, 9.2, darkSteelMat);

  if (highDetail) {
    for (const lz of [-8.8, 8.8]) {
      addCyl(gx - sideSign * 9.5, 26.2, lz, 0.08, 19.8, brushedChromeMat, 0, 0, sideSign * 1.24);
      addCyl(gx + sideSign * 4.2, 26.2, lz, 0.08, 10.2, brushedChromeMat, 0, 0, -sideSign * 0.96);
    }
  }

  // Compact 0.24m navigation light housings on apex & boom tip
  addCyl(gx, apexY + 0.56, 0, 0.14, 0.26, darkSteelMat);
  addCyl(gx, apexY + 0.80, 0, 0.12, 0.24, mats.beaconRedEmissiveMat);
  addCyl(boomX - sideSign * 15.2, 23.72, 0, 0.14, 0.24, darkSteelMat);
  addCyl(boomX - sideSign * 15.2, 23.95, 0, 0.11, 0.22, mats.beaconRedEmissiveMat);

  // Underslung trolley carriage, glazed operator cab, 4 wire hoist cables, yellow spreader & suspended container
  const cabX = gx - sideSign * 14.0;
  addBox(cabX, 21.8, 0, 4.2, 0.75, 18.2, darkSteelMat);
  addBox(cabX, 20.3, 0, 3.6, 2.1, 3.4, gunmetalFrameMat);
  addBox(cabX - sideSign * 0.4, 19.9, 0, 2.8, 1.1, 3.55, mats.shipWindowDarkMat);
  addBox(cabX, 19.25, 0, 3.8, 0.22, 3.6, trimSecondaryMat);

  for (const cxOff of [-1.2, 1.2]) {
    for (const czOff of [-2.8, 2.8]) {
      addCyl(cabX + cxOff, 17.2, czOff, 0.045, 5.4, brushedChromeMat);
    }
  }

  // Yellow ISO twist-lock spreader beam + suspended Nordkap/Corten 40ft container with corner castings & frame
  addBox(cabX, 14.75, 0, 3.5, 0.48, 8.0, hazardMat);
  const contMat = sideSign < 0 ? mats.cortenRustMat : mats.nordkapBlueMat;
  const contValleyMat = sideSign < 0 ? mats.cortenValleyMat : mats.nordkapValleyMat;
  addBox(cabX, 12.95, 0, 3.24, 2.86, 8.24, contValleyMat, true);
  const suspRibs = highDetail ? 10 : 6;
  for (let r = 0; r < suspRibs; r++) {
    const rzOff = -3.7 + (r / (suspRibs - 1)) * 7.4;
    addBox(cabX, 12.95, rzOff, 3.42, 2.72, 0.42, contMat, false);
  }
  addBox(cabX, 14.42, 0, 3.50, 0.18, 8.50, darkSteelMat);
  addBox(cabX, 11.48, 0, 3.50, 0.18, 8.50, darkSteelMat);
}

function createFloodlightBeamTexture(game) {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, 64, 128);
  const grad = ctx.createLinearGradient(0, 0, 0, 128);
  grad.addColorStop(0.0, 'rgba(255, 244, 214, 0.85)');
  grad.addColorStop(0.18, 'rgba(255, 236, 188, 0.45)');
  grad.addColorStop(0.58, 'rgba(255, 224, 165, 0.14)');
  grad.addColorStop(1.0, 'rgba(255, 220, 160, 0.0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 64, 128);

  const tex = new THREE.CanvasTexture(canvas);
  if ('colorSpace' in tex && THREE.SRGBColorSpace) {
    tex.colorSpace = THREE.SRGBColorSpace;
  }
  game?.arenaTextures?.add(tex);
  return tex;
}

/**
 * Builds subtle additive volumetric floodlight beam cones under the 4 corner port floodlight masts,
 * batched into 1 single BufferGeometry + MeshBasicMaterial draw call (omitted on Low tier).
 */
export function buildSaltlineFloodlightCones(game, halfSize) {
  if (!game || (game?.quality?.envMapSize ?? 512) === 0) return null;

  const coneLen = 14.0;
  const proto = new THREE.CylinderGeometry(0.86, 3.45, coneLen, 14, 1, true);
  proto.translate(0, -coneLen * 0.5, 0);

  const pAttr = proto.attributes.position;
  const uAttr = proto.attributes.uv;
  const protoIdx = proto.index;
  const vPerCone = pAttr.count;
  const iPerCone = protoIdx ? protoIdx.count : vPerCone;

  const positions = new Float32Array(4 * vPerCone * 3);
  const uvs = new Float32Array(4 * vPerCone * 2);
  const indices = new Uint16Array(4 * iPerCone);

  const downVec = new THREE.Vector3(0, -1, 0);
  const dirVec = new THREE.Vector3();
  const quat = new THREE.Quaternion();
  const mat4 = new THREE.Matrix4();
  const posVec = new THREE.Vector3();
  const scaleOne = new THREE.Vector3(1, 1, 1);

  let coneIdx = 0;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const fx = sx * (halfSize - 2.2);
      const fz = sz * (halfSize - 5.6);
      const yaw = Math.atan2(-fx, -fz);
      const cosTilt = Math.cos(0.32);
      const sinTilt = Math.sin(0.32);
      dirVec.set(Math.sin(yaw) * cosTilt, -sinTilt, Math.cos(yaw) * cosTilt).normalize();
      quat.setFromUnitVectors(downVec, dirVec);
      posVec.set(fx + Math.sin(yaw) * 0.20, 11.62, fz + Math.cos(yaw) * 0.20);
      mat4.compose(posVec, quat, scaleOne);

      const vOff = coneIdx * vPerCone;
      for (let i = 0; i < vPerCone; i++) {
        posVec.fromBufferAttribute(pAttr, i).applyMatrix4(mat4);
        const vi = (vOff + i) * 3;
        positions[vi] = posVec.x;
        positions[vi + 1] = posVec.y;
        positions[vi + 2] = posVec.z;
        const ui = (vOff + i) * 2;
        uvs[ui] = uAttr.getX(i);
        uvs[ui + 1] = uAttr.getY(i);
      }

      const iOff = coneIdx * iPerCone;
      if (protoIdx) {
        for (let i = 0; i < iPerCone; i++) {
          indices[iOff + i] = protoIdx.getX(i) + vOff;
        }
      } else {
        for (let i = 0; i < vPerCone; i++) {
          indices[iOff + i] = vOff + i;
        }
      }
      coneIdx++;
    }
  }

  proto.dispose();

  const beamGeo = new THREE.BufferGeometry();
  beamGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  beamGeo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  beamGeo.setIndex(new THREE.BufferAttribute(indices, 1));
  beamGeo.computeBoundingSphere();
  game.arenaGeometries?.add(beamGeo);

  const beamTex = createFloodlightBeamTexture(game);
  const beamMat = new THREE.MeshBasicMaterial({
    map: beamTex,
    color: 0xffe8c2,
    transparent: true,
    opacity: 0.13,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide
  });
  game.arenaMaterials?.add(beamMat);

  const beamMesh = new THREE.Mesh(beamGeo, beamMat);
  beamMesh.name = 'saltlineFloodlightCones';
  beamMesh.renderOrder = 3;
  beamMesh.castShadow = false;
  beamMesh.receiveShadow = false;
  beamMesh.frustumCulled = false;
  beamMesh.updateMatrix();
  beamMesh.matrixAutoUpdate = false;
  game.scene?.add(beamMesh);
  game.arenaDecorMeshes?.push(beamMesh);
  return beamMesh;
}

/**
 * Builds an authentic Moroccan Dust II Courtyard Skyline outside the perimeter walls:
 * stepped warm stucco courtyard buildings, domed towers/minarets, elevated desert market canvas canopies,
 * wooden utility poles with sagging catenary wires, and warm distant sandstone mesas.
 */
export function buildDustCourtyardBackdrop({
  game = null,
  halfSize,
  highDetail = true,
  registerInstanced,
  unitBoxGeo,
  unitCylGeo,
  mats,
  darkSteelMat = null
}) {
  const addBox = (x, y, z, w, h, d, mat, rx = 0, ry = 0, rz = 0, castShadow = false) =>
    registerInstanced(unitBoxGeo, mat, x, y, z, w, h, d, rx, ry, rz, castShadow);
  const addCyl = (x, y, z, r, len, mat, rx = 0, ry = 0, rz = 0, castShadow = false) =>
    registerInstanced(unitCylGeo, mat, x, y, z, r * 2, len, r * 2, rx, ry, rz, castShadow);
  const antennaMat = darkSteelMat || mats.dustCedarWoodMat;

  const addRooftopTvAntenna = (ax, baseY, az, yaw = 0) => {
    const cosY = Math.cos(yaw);
    const sinY = Math.sin(yaw);
    // Vertical mast + slightly angled Yagi boom + 4 cross-dipole elements
    addCyl(ax, baseY + 1.45, az, 0.032, 2.9, antennaMat, 0, 0, 0, false);
    addBox(ax, baseY + 2.62, az, 1.85, 0.04, 0.04, antennaMat, 0, yaw, 0.08, false);
    for (let e = 0; e < 4; e++) {
      const along = -0.78 + (e / 3) * 1.56;
      const elemLen = 1.12 - e * 0.16;
      const ex = ax + cosY * along;
      const ez = az - sinY * along;
      const ey = baseY + 2.62 + along * 0.08;
      addBox(ex, ey, ez, 0.032, 0.032, elemLen, antennaMat, 0, yaw, 0, false);
    }
  };

  const stuccoPalette = [mats.dustStuccoWarmMat, mats.dustStuccoOchreMat, mats.dustStuccoTerracottaMat];
  const buildingCount = highDetail ? 24 : 12;

  // 1. Moroccan Courtyard Townhouses & Stepped Rooftop Terraces ringing the 62m walls
  for (let i = 0; i < buildingCount; i++) {
    const angle = (i / buildingCount) * Math.PI * 2 + 0.08;
    const cosA = Math.cos(angle);
    const sinA = Math.sin(angle);
    const sqDist = halfSize / Math.max(Math.abs(cosA), Math.abs(sinA));
    const dist = sqDist + 10.5 + (i % 3) * 5.2;
    const bx = cosA * dist;
    const bz = sinA * dist;
    const yaw = -angle + Math.PI * 0.5;
    const mainMat = stuccoPalette[i % stuccoPalette.length];

    const bw = 11.5 + (i % 4) * 2.8;
    const bd = 9.5 + (i % 3) * 2.2;
    const bh = 13.5 + (i % 5) * 2.6;

    addBox(bx, bh * 0.5 - 1, bz, bw, bh, bd, mainMat, 0, yaw, 0);
    addBox(bx, bh - 0.85, bz, bw + 0.45, 0.36, bd + 0.45, mats.dustSandstoneTrimMat, 0, yaw, 0);

    if (highDetail) {
      // Stepped rooftop penthouse room + parapet coping + dark shuttered facade windows
      const upperW = bw * 0.58;
      const upperD = bd * 0.54;
      const upperH = 3.6 + (i % 2) * 1.4;
      addBox(bx, bh - 1 + upperH * 0.5, bz, upperW, upperH, upperD, stuccoPalette[(i + 1) % stuccoPalette.length], 0, yaw, 0);
      addBox(bx, bh - 1 + upperH + 0.14, bz, upperW + 0.3, 0.28, upperD + 0.3, mats.dustSandstoneTrimMat, 0, yaw, 0);

      // Rooftop Yagi TV antennas silhouetted above courtyard townhouses
      if (i % 3 === 0) {
        addRooftopTvAntenna(bx + cosA * 1.2, bh - 1 + upperH + 0.28, bz + sinA * 1.2, yaw + 0.35);
      }

      // Recessed dark window openings & weathered teal shutter accents facing inward toward the courtyard
      const inwardX = -cosA;
      const inwardZ = -sinA;
      for (const hFrac of [0.56, 0.78]) {
        const wy = bh * hFrac - 1;
        addBox(
          bx + inwardX * (bd * 0.49),
          wy,
          bz + inwardZ * (bd * 0.49),
          1.35,
          1.85,
          0.22,
          i % 2 === 0 ? mats.dustDomeTealMat : mats.dustCedarWoodMat,
          0,
          yaw,
          0
        );
      }

      // Desert market canvas canopies along elevated courtyard terraces on inner buildings
      if (i % 2 === 0) {
        const canopyMat = i % 4 === 0 ? mats.dustMarketCanopyMat : mats.dustMarketClothMat;
        const cx = bx + inwardX * (bd * 0.5 + 1.35);
        const cz = bz + inwardZ * (bd * 0.5 + 1.35);
        const cy = Math.min(11.6, bh - 3.0);
        addBox(cx, cy, cz, bw * 0.72, 0.08, 2.8, canopyMat, 0.24, yaw, 0);
        addBox(cx, cy - 0.55, cz, 0.12, 1.3, 0.12, mats.dustCedarWoodMat, 0, yaw, 0);
      }
    }
  }

  // 1b. Perimeter parapet rooftop TV antennas clearly silhouetted against Dust II sky (`Medium/High`)
  if (highDetail) {
    const parapetAntennas = [
      [-32, 13.5, -halfSize - 0.2, 0.4],
      [28, 13.5, -halfSize - 0.2, 1.1],
      [-28, 13.5, halfSize + 0.2, 2.2],
      [32, 13.5, halfSize + 0.2, 0.7],
      [-halfSize - 0.2, 13.5, -24, 1.6],
      [halfSize + 0.2, 13.5, 24, 2.8]
    ];
    for (let a = 0; a < parapetAntennas.length; a++) {
      const [ax, ay, az, ayaw] = parapetAntennas[a];
      addRooftopTvAntenna(ax, ay, az, ayaw);
    }
  }

  // 2. Domed Moroccan Mosque Towers & Minaret Silhouettes
  let domeGeo = null;
  if (game?.arenaGeometries) {
    domeGeo = new THREE.SphereGeometry(0.5, highDetail ? 14 : 8, highDetail ? 9 : 6, 0, Math.PI * 2, 0, Math.PI * 0.55);
    game.arenaGeometries.add(domeGeo);
  }
  const minaretCount = highDetail ? 6 : 4;
  for (let m = 0; m < minaretCount; m++) {
    const ang = (m / minaretCount) * Math.PI * 2 + 0.42;
    const cosA = Math.cos(ang);
    const sinA = Math.sin(ang);
    const sqDist = halfSize / Math.max(Math.abs(cosA), Math.abs(sinA));
    const dist = sqDist + 18 + (m % 2) * 8;
    const mx = cosA * dist;
    const mz = sinA * dist;
    const towerW = 4.6 + (m % 2) * 0.8;
    const towerH = 24 + (m % 3) * 4.5;

    addBox(mx, towerH * 0.5 - 1, mz, towerW, towerH, towerW, mats.dustStuccoWarmMat, 0, -ang, 0);
    addBox(mx, towerH - 2.6, mz, towerW * 1.24, 0.65, towerW * 1.24, mats.dustSandstoneTrimMat, 0, -ang, 0);
    addBox(mx, towerH + 0.5, mz, towerW * 0.72, 3.2, towerW * 0.72, mats.dustStuccoOchreMat, 0, -ang, 0);
    if (domeGeo) {
      const domeMat = m % 2 === 0 ? mats.dustDomeTealMat : mats.dustSandstoneTrimMat;
      registerInstanced(domeGeo, domeMat, mx, towerH + 2.0, mz, towerW * 0.76, towerW * 0.68, towerW * 0.76, 0, 0, 0, false);
    }
    if (highDetail) {
      addCyl(mx, towerH + 4.3, mz, 0.12, 2.2, mats.dustCedarWoodMat);
    }
  }

  // 3. Wooden Utility Poles + Sagging Catenary Wires along outer Dust II street perimeter (`Medium/High`)
  if (highDetail && game?.scene) {
    const poleDist = halfSize + 3.6;
    const poleCoords = [];
    for (const s of [-1, 1]) {
      for (const off of [-36, 0, 36]) {
        poleCoords.push([off, s * poleDist, 0]);
        poleCoords.push([s * poleDist, off, Math.PI * 0.5]);
      }
    }
    for (let p = 0; p < poleCoords.length; p++) {
      const [px, pz, pyaw] = poleCoords[p];
      addCyl(px, 6.4, pz, 0.14, 12.8, mats.dustCedarWoodMat);
      addBox(px, 12.1, pz, 2.1, 0.16, 0.18, mats.dustCedarWoodMat, 0, pyaw, 0);
      addBox(px, 11.4, pz, 1.5, 0.14, 0.16, mats.dustCedarWoodMat, 0, pyaw, 0);
    }

    // Build all sagging catenary powerline spans (perimeter + crisp overhead courtyard sky crossings) into 1 draw call
    const segsPerSpan = 10;
    const lineVerts = [];
    const pushWireSpan = (ax, ay, az, bx, by, bz, sag = 1.35) => {
      for (let s = 0; s < segsPerSpan; s++) {
        const t0 = s / segsPerSpan;
        const t1 = (s + 1) / segsPerSpan;
        const y0 = ay + (by - ay) * t0 - sag * 4 * t0 * (1 - t0);
        const y1 = ay + (by - ay) * t1 - sag * 4 * t1 * (1 - t1);
        lineVerts.push(ax + (bx - ax) * t0, y0, az + (bz - az) * t0);
        lineVerts.push(ax + (bx - ax) * t1, y1, az + (bz - az) * t1);
      }
    };

    for (const s of [-1, 1]) {
      for (const [a, b] of [
        [-36, 0],
        [0, 36]
      ]) {
        for (const wireOff of [-0.75, 0.75]) {
          pushWireSpan(a, 12.15, s * poleDist + wireOff, b, 12.15, s * poleDist + wireOff, 1.25);
          pushWireSpan(s * poleDist + wireOff, 12.15, a, s * poleDist + wireOff, 12.15, b, 1.25);
        }
      }
    }

    // Iconic CS2 Dust II crisp black overhead power wires crossing the sky directly above the courtyard (`sk_shot1.jpg` / `sk_awp.jpg`)
    const skyCrossings = [
      // East-West courtyard sky spans above Mid Doors, Short-A, B-Tunnels
      [-halfSize, 12.7, -24, halfSize, 12.5, -18, 2.45],
      [-halfSize, 12.3, -24, halfSize, 12.1, -18, 2.70],
      [-halfSize, 12.6, 18, halfSize, 12.8, 24, 2.45],
      [-halfSize, 12.2, 18, halfSize, 12.4, 24, 2.70],
      // North-South courtyard sky spans crossing over Mid & A/B lanes
      [-20, 13.0, -halfSize, -15, 12.8, halfSize, 2.65],
      [15, 12.8, -halfSize, 20, 13.0, halfSize, 2.65],
      // Diagonal corner-to-mid feeder wires framing Dust II rooftop silhouette
      [-halfSize, 13.2, -40, -34, 13.1, -halfSize, 1.45],
      [halfSize, 13.2, -40, 34, 13.1, -halfSize, 1.45],
      [-halfSize, 13.2, 40, -34, 13.1, halfSize, 1.45],
      [halfSize, 13.2, 40, 34, 13.1, halfSize, 1.45],
      // Perimeter wall-to-townhouse overhead tie wires
      [-36, 12.6, -halfSize, -36, 13.6, -(halfSize + 11.5), 0.75],
      [36, 12.6, -halfSize, 36, 13.6, -(halfSize + 11.5), 0.75],
      [-36, 12.6, halfSize, -36, 13.6, halfSize + 11.5, 0.75],
      [36, 12.6, halfSize, 36, 13.6, halfSize + 11.5, 0.75]
    ];
    for (let w = 0; w < skyCrossings.length; w++) {
      const [ax, ay, az, bx, by, bz, sag] = skyCrossings[w];
      pushWireSpan(ax, ay, az, bx, by, bz, sag);
    }

    const wireGeo = new THREE.BufferGeometry();
    wireGeo.setAttribute('position', new THREE.Float32BufferAttribute(lineVerts, 3));
    wireGeo.computeBoundingSphere();
    game.arenaGeometries?.add(wireGeo);

    const wireMat = new THREE.LineBasicMaterial({ color: 0x161310 });
    game.arenaMaterials?.add(wireMat);

    const wireMesh = new THREE.LineSegments(wireGeo, wireMat);
    wireMesh.name = 'dustUtilityWires';
    wireMesh.frustumCulled = false;
    wireMesh.updateMatrix();
    wireMesh.matrixAutoUpdate = false;
    game.scene.add(wireMesh);
    game.arenaDecorMeshes?.push(wireMesh);
  }

  // 4. Warm Distant Sandstone Mesas & Desert Ridges beyond courtyard skyline (`Medium/High`)
  if (highDetail) {
    const mesaCount = 12;
    for (let k = 0; k < mesaCount; k++) {
      const ang = (k / mesaCount) * Math.PI * 2 + 0.16;
      const dist = halfSize + 72 + (k % 3) * 16;
      const mx = Math.cos(ang) * dist;
      const mz = Math.sin(ang) * dist;
      const mw = 32 + (k % 3) * 12;
      const mh = 18 + (k % 4) * 5;
      const md = 22 + (k % 2) * 8;
      addBox(mx, mh * 0.5 - 4, mz, mw, mh, md, mats.dustMesaRockMat, 0, -ang, 0);
      addBox(mx, mh - 2, mz, mw * 0.68, mh * 0.35, md * 0.68, mats.dustStuccoOchreMat, 0, -ang + 0.12, 0);
    }
  }
}

/**
 * Places perimeter electrical transformer cabinets, quay mooring bollards, rubber dock fenders,
 * mobile floodlight generator towers, and exterior dock cargo stacks (or Moroccan Dust II backdrop on `desert_outpost`).
 */
export function buildSaltlinePerimeterProps({
  game = null,
  mapId,
  halfSize,
  isDesert,
  highDetail = true,
  registerInstanced,
  unitBoxGeo,
  unitCylGeo,
  mats,
  darkSteelMat,
  gunmetalFrameMat,
  brushedChromeMat,
  hazardMat,
  trimAccentMat
}) {
  if (isDesert || mapId === 'desert_outpost') {
    buildDustCourtyardBackdrop({
      game,
      halfSize,
      highDetail,
      registerInstanced,
      unitBoxGeo,
      unitCylGeo,
      mats,
      darkSteelMat
    });
    void trimAccentMat;
    return;
  }

  const addBox = (x, y, z, w, h, d, mat, castShadow = false, rx = 0, ry = 0, rz = 0) =>
    registerInstanced(unitBoxGeo, mat, x, y, z, w, h, d, rx, ry, rz, castShadow);
  const addCyl = (x, y, z, r, len, mat, rx = 0, ry = 0, rz = 0) =>
    registerInstanced(unitCylGeo, mat, x, y, z, r * 2, len, r * 2, rx, ry, rz, false);

  const wallInward = halfSize - 1.18;

  // 1. Perimeter Electrical Switchgear & Transformer Cabinets (flush against perimeter wall bays, out of lanes)
  const bayOffsets = [-halfSize * 0.55, 0, halfSize * 0.55];
  for (let i = 0; i < bayOffsets.length; i++) {
    const off = bayOffsets[i];
    for (const side of [-1, 1]) {
      const ex = side * wallInward;
      const inward = -side;
      addBox(ex + inward * 0.20, 0.10, off, 0.62, 0.20, 1.56, mats.concretePlinthMat);
      addBox(ex + inward * 0.22, 1.22, off, 0.48, 2.08, 1.38, gunmetalFrameMat);
      addBox(ex + inward * 0.24, 2.30, off, 0.56, 0.12, 1.48, darkSteelMat);
      addBox(ex + inward * 0.47, 1.42, off - 0.30, 0.04, 1.45, 0.52, darkSteelMat);
      addBox(ex + inward * 0.47, 1.42, off + 0.30, 0.04, 1.45, 0.52, darkSteelMat);
      addBox(ex + inward * 0.49, 1.62, off - 0.30, 0.03, 0.24, 0.24, hazardMat);
      addCyl(ex + inward * 0.18, 3.68, off - 0.42, 0.055, 2.8, brushedChromeMat);
      if (highDetail) {
        addCyl(ex + inward * 0.18, 3.68, off + 0.42, 0.045, 2.8, darkSteelMat);
      }
    }
  }

  // 2. Corner Mobile Port Floodlight Masts aiming warm stadium beams inward
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const fx = sx * (halfSize - 2.2);
      const fz = sz * (halfSize - 5.6);
      addBox(fx, 0.14, fz, 1.35, 0.28, 1.75, darkSteelMat);
      addBox(fx, 0.72, fz, 1.16, 1.12, 1.54, gunmetalFrameMat);
      addBox(fx, 0.82, fz, 1.20, 0.16, 1.58, hazardMat);
      addBox(fx, 1.32, fz, 1.24, 0.12, 1.62, darkSteelMat);
      addCyl(fx, 6.25, fz, 0.11, 10.2, brushedChromeMat);
      const yaw = Math.atan2(-fx, -fz);
      addBox(fx, 11.35, fz, 2.2, 0.18, 0.22, darkSteelMat, false, 0, yaw, 0);
      for (const lxOff of [-0.72, 0, 0.72]) {
        const px = fx + Math.cos(yaw) * lxOff;
        const pz = fz - Math.sin(yaw) * lxOff;
        addBox(px, 11.68, pz, 0.56, 0.42, 0.36, gunmetalFrameMat, false, 0.32, yaw, 0);
        addBox(
          px + Math.sin(yaw) * 0.16,
          11.64,
          pz + Math.cos(yaw) * 0.16,
          0.48,
          0.32,
          0.06,
          mats.floodlightLensMat,
          false,
          0.32,
          yaw,
          0
        );
      }
    }
  }

  // 3. Coastal / Harbor Quay Bollards & Cylindrical Rubber Dock Fenders along outer sea-wall apron
  if (!isDesert) {
    const step = highDetail ? 16 : 28;
    for (let p = -halfSize + 12; p <= halfSize - 12; p += step) {
      for (const side of [-1, 1]) {
        const outerZ = side * (halfSize + 1.15);
        addBox(p, 0.45, outerZ, 1.4, 2.6, 0.48, mats.rubberFenderMat);
        addBox(p + 3.2, 8.62, side * halfSize, 0.96, 0.18, 0.74, darkSteelMat);
        addCyl(p + 2.96, 8.94, side * halfSize, 0.14, 0.54, darkSteelMat);
        addCyl(p + 3.44, 8.94, side * halfSize, 0.14, 0.54, darkSteelMat);
      }
    }
  }

  // 4. Tarped Maritime Pallet Stacks perched on non-walkable exterior dock cargo platforms (highDetail)
  if (highDetail && mapId === 'cargo_dock') {
    for (const sx of [-1, 1]) {
      for (const pz of [-28, 28]) {
        const px = sx * (halfSize + 2.6);
        const py = 5.4;
        addBox(px, py - 0.25, pz, 3.6, 0.38, 4.4, darkSteelMat);
        addBox(px, py + 0.06, pz, 2.45, 0.16, 2.85, mats.palletTimberMat);
        addBox(px, py + 0.94, pz, 2.25, 1.55, 2.65, mats.tarpOliveMat);
        addBox(px, py + 0.95, pz - 0.65, 2.31, 1.58, 0.08, darkSteelMat);
        addBox(px, py + 0.95, pz + 0.65, 2.31, 1.58, 0.08, darkSteelMat);
      }
    }
  }

  if (game && highDetail) {
    buildSaltlineFloodlightCones(game, halfSize);
  }

  void trimAccentMat;
}

/**
 * Merges all world-space Saltline industrial stencils, container markings, and floor loading-zone chevrons
 * into ONE single BufferGeometry + MeshStandardMaterial (1 draw call total across the entire map).
 */
export function buildSaltlineArenaDecals(game, mapCfg, halfSize) {
  if ((game?.quality?.envMapSize ?? 512) === 0) return null;

  const quads = [];
  const pushVerticalQuad = (cx, cy, cz, nx, nz, width, height, quadrant) => {
    const rx = -nz;
    const rz = nx;
    const hw = width * 0.5;
    const hh = height * 0.5;
    const [u0, v0, u1, v1] = getSaltlineDecalUVRect(quadrant);
    quads.push({
      verts: [
        [cx - rx * hw, cy - hh, cz - rz * hw, u0, v0],
        [cx + rx * hw, cy - hh, cz + rz * hw, u1, v0],
        [cx + rx * hw, cy + hh, cz + rz * hw, u1, v1],
        [cx - rx * hw, cy + hh, cz - rz * hw, u0, v1]
      ],
      normal: [nx, 0, nz]
    });
  };

  const pushFloorQuad = (cx, y, cz, width, depth, yawQuarterTurns, quadrant) => {
    const hw = width * 0.5;
    const hd = depth * 0.5;
    const [u0, v0, u1, v1] = getSaltlineDecalUVRect(quadrant);
    const local = [
      [-hw, -hd, u0, v0],
      [hw, -hd, u1, v0],
      [hw, hd, u1, v1],
      [-hw, hd, u0, v1]
    ];
    const ang = (yawQuarterTurns % 4) * (Math.PI * 0.5);
    const ca = Math.cos(ang);
    const sa = Math.sin(ang);
    const order = [3, 2, 1, 0];
    const verts = order.map((idx) => {
      const [lx, lz, u, v] = local[idx];
      return [cx + lx * ca - lz * sa, y, cz + lx * sa + lz * ca, u, v];
    });
    quads.push({ verts, normal: [0, 1, 0] });
  };

  const obstacles = mapCfg?.obstacles || [];
  let wallStencilCount = 0;
  let containerStencilCount = 0;
  let floorChevronCount = 0;

  const isFloorRectBlocked = (cx, cz, halfX, halfZ) => {
    for (let j = 0; j < obstacles.length; j++) {
      const o = obstacles[j];
      if (o.y - o.h * 0.5 > 0.28) continue;
      if (
        Math.abs(cx - o.x) < o.w * 0.5 + halfX + 0.14 &&
        Math.abs(cz - o.z) < o.d * 0.5 + halfZ + 0.14
      ) {
        return true;
      }
    }
    return false;
  };

  const isVerticalFaceBlocked = (hostObs, cx, cy, cz, nx, nz, width, height) => {
    const halfX = Math.abs(nz) > 0.5 ? width * 0.5 + 0.04 : 0.24;
    const halfZ = Math.abs(nx) > 0.5 ? width * 0.5 + 0.04 : 0.24;
    const halfY = height * 0.5 + 0.04;
    const testX = cx + nx * 0.18;
    const testZ = cz + nz * 0.18;
    for (let j = 0; j < obstacles.length; j++) {
      const o = obstacles[j];
      if (o === hostObs) continue;
      if (
        Math.abs(testX - o.x) < o.w * 0.5 + halfX &&
        Math.abs(cy - o.y) < o.h * 0.5 + halfY &&
        Math.abs(testZ - o.z) < o.d * 0.5 + halfZ
      ) {
        return true;
      }
    }
    return false;
  };

  const isDesertMap = mapCfg?.id === 'desert_outpost';

  for (let i = 0; i < obstacles.length; i++) {
    const obs = obstacles[i];
    const isPerimeter = Math.max(obs.w, obs.d) > 80 || Math.max(obs.w, obs.d) >= halfSize * 1.8;
    if (isPerimeter) continue;

    if (!isDesertMap && obs.type === 'wall' && obs.h >= 2.2 && wallStencilCount < 18) {
      const alongX = obs.w >= obs.d;
      const span = alongX ? obs.w : obs.d;
      if (span >= 4.2) {
        const quadIdx = wallStencilCount % 2 === 0 ? 3 : 0;
        const w = quadIdx === 3 ? 1.55 : 1.15;
        const h = quadIdx === 3 ? 1.42 : 1.15;
        const cy = obs.y + 0.12;
        if (alongX) {
          const prefSign = obs.z >= 0 ? -1 : 1;
          for (const faceSign of [prefSign, -prefSign]) {
            const fz = obs.z + faceSign * (obs.d * 0.5 + 0.008);
            if (!isVerticalFaceBlocked(obs, obs.x, cy, fz, 0, faceSign, w, h)) {
              pushVerticalQuad(obs.x, cy, fz, 0, faceSign, w, h, quadIdx);
              wallStencilCount++;
              break;
            }
          }
        } else {
          const prefSign = obs.x >= 0 ? -1 : 1;
          for (const faceSign of [prefSign, -prefSign]) {
            const fx = obs.x + faceSign * (obs.w * 0.5 + 0.008);
            if (!isVerticalFaceBlocked(obs, fx, cy, obs.z, faceSign, 0, w, h)) {
              pushVerticalQuad(fx, cy, obs.z, faceSign, 0, w, h, quadIdx);
              wallStencilCount++;
              break;
            }
          }
        }
      }
    } else if (obs.type === 'container' && obs.h >= 2.2 && containerStencilCount < 16) {
      const alongZ = obs.d >= obs.w;
      const cy = obs.y + 0.25;
      if (alongZ && obs.d >= 6.0) {
        const faceSign = obs.x >= 0 ? -1 : 1;
        // Sits 4mm flush on the 3D welded steel placard backing plate (outer face at halfW + 0.042)
        const fx = obs.x + faceSign * (obs.w * 0.5 + 0.046);
        const fz = obs.z + 1.4;
        if (!isVerticalFaceBlocked(obs, fx, cy, fz, faceSign, 0, 1.35, 1.05)) {
          pushVerticalQuad(fx, cy, fz, faceSign, 0, 1.35, 1.05, 1);
          containerStencilCount++;
        }
      } else if (!alongZ && obs.w >= 6.0) {
        const faceSign = obs.z >= 0 ? -1 : 1;
        const fx = obs.x + 1.4;
        const fz = obs.z + faceSign * (obs.d * 0.5 + 0.046);
        if (!isVerticalFaceBlocked(obs, fx, cy, fz, 0, faceSign, 1.35, 1.05)) {
          pushVerticalQuad(fx, cy, fz, 0, faceSign, 1.35, 1.05, 1);
          containerStencilCount++;
        }
      }
    } else if (!isDesertMap && obs.type === 'platform' && obs.y - obs.h * 0.5 <= 0.15 && floorChevronCount < 8) {
      const prefZ = obs.z >= 0 ? -1 : 1;
      const prefX = obs.x >= 0 ? -1 : 1;
      const candidates = [
        [obs.x, obs.z + prefZ * (obs.d * 0.5 + 1.35), prefZ > 0 ? 0 : 2, 1.6, 0.775],
        [obs.x, obs.z - prefZ * (obs.d * 0.5 + 1.35), -prefZ > 0 ? 0 : 2, 1.6, 0.775],
        [obs.x + prefX * (obs.w * 0.5 + 1.35), obs.z, prefX > 0 ? 3 : 1, 0.775, 1.6],
        [obs.x - prefX * (obs.w * 0.5 + 1.35), obs.z, -prefX > 0 ? 3 : 1, 0.775, 1.6]
      ];
      for (const [cx, cz, rot, hx, hz] of candidates) {
        if (Math.abs(cx) < halfSize - 4 && Math.abs(cz) < halfSize - 4 && !isFloorRectBlocked(cx, cz, hx, hz)) {
          pushFloorQuad(cx, 0.008, cz, 3.2, 1.55, rot, 2);
          floorChevronCount++;
          break;
        }
      }
    }
  }

  if (!isDesertMap) {
    for (const [baseX, baseZ, rot] of [
      [0, -Math.min(halfSize - 8, 28), 0],
      [0, Math.min(halfSize - 8, 28), 2],
      [-Math.min(halfSize - 8, 28), 0, 1],
      [Math.min(halfSize - 8, 28), 0, 3]
    ]) {
      const halfX = rot % 2 === 0 ? 1.5 : 0.725;
      const halfZ = rot % 2 === 0 ? 0.725 : 1.5;
      for (const shift of [0, -3.5, 3.5]) {
        const fx = rot % 2 === 0 ? baseX : baseX + Math.sign(baseX || 1) * shift;
        const fz = rot % 2 === 0 ? baseZ + Math.sign(baseZ || 1) * shift : baseZ;
        if (Math.abs(fx) < halfSize - 3.5 && Math.abs(fz) < halfSize - 3.5 && !isFloorRectBlocked(fx, fz, halfX, halfZ)) {
          pushFloorQuad(fx, 0.008, fz, 3.0, 1.45, rot, 2);
          break;
        }
      }
    }
  }

  if (quads.length === 0) return null;

  const vCount = quads.length * 4;
  const positions = new Float32Array(vCount * 3);
  const normals = new Float32Array(vCount * 3);
  const uvs = new Float32Array(vCount * 2);
  const indices = new Uint16Array(quads.length * 6);

  for (let q = 0; q < quads.length; q++) {
    const { verts, normal } = quads[q];
    const baseV = q * 4;
    for (let c = 0; c < 4; c++) {
      const [vx, vy, vz, u, v] = verts[c];
      const vi = (baseV + c) * 3;
      const ui = (baseV + c) * 2;
      positions[vi] = vx;
      positions[vi + 1] = vy;
      positions[vi + 2] = vz;
      normals[vi] = normal[0];
      normals[vi + 1] = normal[1];
      normals[vi + 2] = normal[2];
      uvs[ui] = u;
      uvs[ui + 1] = v;
    }
    const ii = q * 6;
    indices[ii] = baseV;
    indices[ii + 1] = baseV + 1;
    indices[ii + 2] = baseV + 2;
    indices[ii + 3] = baseV;
    indices[ii + 4] = baseV + 2;
    indices[ii + 5] = baseV + 3;
  }

  const decalGeo = new THREE.BufferGeometry();
  decalGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  decalGeo.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  decalGeo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  decalGeo.setIndex(new THREE.BufferAttribute(indices, 1));
  decalGeo.computeBoundingSphere();
  game.arenaGeometries.add(decalGeo);

  const decalTex = createSaltlineDecalAtlasTexture(game);
  const decalMat = new THREE.MeshStandardMaterial({
    map: decalTex,
    transparent: true,
    alphaTest: 0.06,
    depthWrite: false,
    roughness: 0.68,
    metalness: 0.12,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1
  });
  game.arenaMaterials.add(decalMat);

  const decalMesh = new THREE.Mesh(decalGeo, decalMat);
  decalMesh.name = 'saltlineArenaDecals';
  decalMesh.renderOrder = 1;
  decalMesh.castShadow = false;
  decalMesh.receiveShadow = true;
  decalMesh.frustumCulled = false;
  decalMesh.updateMatrix();
  decalMesh.matrixAutoUpdate = false;
  game.scene.add(decalMesh);
  game.arenaDecorMeshes.push(decalMesh);
  game.saltlineArenaDecals = decalMesh;
  return decalMesh;
}

/**
 * Builds weathered CS:GO-style Bombsite A / B & directional route arrow floor/wall stencil decals
 * along tactical routes, merged into ONE single BufferGeometry + MeshStandardMaterial draw call
 * (`depthWrite: false`, `polygonOffset`, `y >= 0.008`, 100% obstacle/staircase collision-checked).
 */
export function buildBombsiteRouteDecals(game, mapCfg, halfSize) {
  if (!game || !mapCfg) return null;

  const obstacles = mapCfg.obstacles || [];
  const jumpPads = mapCfg.jumpPads || [];
  const barrels = mapCfg.barrels || [];
  const callouts = mapCfg.callouts || [];

  const findCallout = (patterns, fallback) => {
    for (let p = 0; p < patterns.length; p++) {
      const hit = callouts.find((c) => String(c.id || '').toLowerCase().includes(patterns[p]));
      if (hit) return { x: hit.x, z: hit.z };
    }
    return fallback;
  };

  const siteA = findCallout(
    ['a_site', 'a_goose', 'e_crane', 'ne_hookah', 'e_balcony', 'east_arm', 'east_chicane', 'ne_monolith'],
    { x: halfSize * 0.56, z: -halfSize * 0.44 }
  );
  const siteB = findCallout(
    ['b_site', 'b_boathouse', 'w_crane', 'nw_showers', 'w_balcony', 'west_arm', 'west_chicane', 'nw_monolith'],
    { x: -halfSize * 0.56, z: halfSize * 0.44 }
  );

  const quads = [];
  const placedFloor = [];
  const placedWall = [];

  const pushOrientedFloorQuad = (cx, y, cz, lenAlongFwd, widthSide, dirX, dirZ, quadrant) => {
    const dLen = Math.hypot(dirX, dirZ) || 1;
    const fx = dirX / dLen;
    const fz = dirZ / dLen;
    // side = (fz, 0, -fx) ensures fwd x side == +Y (CCW upward normal, +U points along fwd, upright letters)
    const sx = fz;
    const sz = -fx;
    const hl = lenAlongFwd * 0.5;
    const hw = widthSide * 0.5;
    const [u0, v0, u1, v1] = getBombsiteDecalUVRect(quadrant);
    quads.push({
      verts: [
        [cx - fx * hl - sx * hw, y, cz - fz * hl - sz * hw, u0, v0],
        [cx + fx * hl - sx * hw, y, cz + fz * hl - sz * hw, u1, v0],
        [cx + fx * hl + sx * hw, y, cz + fz * hl + sz * hw, u1, v1],
        [cx - fx * hl + sx * hw, y, cz - fz * hl + sz * hw, u0, v1]
      ],
      normal: [0, 1, 0]
    });
    const extX = Math.abs(fx) * hl + Math.abs(sx) * hw;
    const extZ = Math.abs(fz) * hl + Math.abs(sz) * hw;
    placedFloor.push({ cx, cz, hx: extX, hz: extZ });
  };

  const pushVerticalQuad = (cx, cy, cz, nx, nz, width, height, quadrant) => {
    const rx = -nz;
    const rz = nx;
    const hw = width * 0.5;
    const hh = height * 0.5;
    const [u0, v0, u1, v1] = getBombsiteDecalUVRect(quadrant);
    quads.push({
      verts: [
        [cx - rx * hw, cy - hh, cz - rz * hw, u0, v0],
        [cx + rx * hw, cy - hh, cz + rz * hw, u1, v0],
        [cx + rx * hw, cy + hh, cz + rz * hw, u1, v1],
        [cx - rx * hw, cy + hh, cz - rz * hw, u0, v1]
      ],
      normal: [nx, 0, nz]
    });
    placedWall.push({ cx, cy, cz, hw });
  };

  const isGroundRectClear = (cx, cz, hx, hz) => {
    if (Math.abs(cx) + hx >= halfSize - 2.2 || Math.abs(cz) + hz >= halfSize - 2.2) return false;
    for (let i = 0; i < obstacles.length; i++) {
      const o = obstacles[i];
      if (o.y - o.h * 0.5 > 0.35) continue;
      if (Math.abs(cx - o.x) < o.w * 0.5 + hx + 0.35 && Math.abs(cz - o.z) < o.d * 0.5 + hz + 0.35) {
        return false;
      }
    }
    for (let i = 0; i < jumpPads.length; i++) {
      if (Math.hypot(cx - jumpPads[i].x, cz - jumpPads[i].z) < 2.6 + Math.max(hx, hz)) return false;
    }
    for (let i = 0; i < barrels.length; i++) {
      if (Math.hypot(cx - barrels[i].x, cz - barrels[i].z) < 2.1 + Math.max(hx, hz)) return false;
    }
    for (let i = 0; i < placedFloor.length; i++) {
      const p = placedFloor[i];
      if (Math.abs(cx - p.cx) < p.hx + hx + 0.7 && Math.abs(cz - p.cz) < p.hz + hz + 0.7) return false;
    }
    return true;
  };

  const findPlatformForPoint = (px, pz) => {
    for (let i = 0; i < obstacles.length; i++) {
      const o = obstacles[i];
      if (o.type !== 'platform') continue;
      if (Math.abs(px - o.x) <= o.w * 0.5 + 1.0 && Math.abs(pz - o.z) <= o.d * 0.5 + 1.0) {
        return o;
      }
    }
    return null;
  };

  const isPlatformRectClear = (plat, cx, cz, hx, hz) => {
    const topY = plat.y + plat.h * 0.5;
    if (
      Math.abs(cx - plat.x) + hx > plat.w * 0.5 - 0.75 ||
      Math.abs(cz - plat.z) + hz > plat.d * 0.5 - 0.75
    ) {
      return false;
    }
    for (let i = 0; i < obstacles.length; i++) {
      const o = obstacles[i];
      if (o === plat) continue;
      const minY = o.y - o.h * 0.5;
      const maxY = o.y + o.h * 0.5;
      if (maxY < topY - 0.08 || minY > topY + 1.6) continue;
      if (Math.abs(cx - o.x) < o.w * 0.5 + hx + 0.42 && Math.abs(cz - o.z) < o.d * 0.5 + hz + 0.42) {
        return false;
      }
    }
    for (let i = 0; i < placedFloor.length; i++) {
      const p = placedFloor[i];
      if (Math.abs(cx - p.cx) < p.hx + hx + 0.6 && Math.abs(cz - p.cz) < p.hz + hz + 0.6) return false;
    }
    return true;
  };

  const isVerticalFaceClear = (hostObs, cx, cy, cz, nx, nz, width, height) => {
    const halfX = Math.abs(nz) > 0.5 ? width * 0.5 + 0.08 : 0.24;
    const halfZ = Math.abs(nx) > 0.5 ? width * 0.5 + 0.08 : 0.24;
    const halfY = height * 0.5 + 0.08;
    const testX = cx + nx * 0.20;
    const testZ = cz + nz * 0.20;
    for (let j = 0; j < obstacles.length; j++) {
      const o = obstacles[j];
      if (o === hostObs) continue;
      if (
        Math.abs(testX - o.x) < o.w * 0.5 + halfX &&
        Math.abs(cy - o.y) < o.h * 0.5 + halfY &&
        Math.abs(testZ - o.z) < o.d * 0.5 + halfZ
      ) {
        return false;
      }
    }
    for (let j = 0; j < placedWall.length; j++) {
      const pw = placedWall[j];
      if (Math.hypot(cx - pw.cx, cz - pw.cz) < pw.hw + width * 0.5 + 0.6 && Math.abs(cy - pw.cy) < 1.5) {
        return false;
      }
    }
    return true;
  };

  const tryPlaceSiteBadge = (site, quadrant) => {
    const plat = findPlatformForPoint(site.x, site.z);
    const dirX = site.x >= 0 ? -1 : 1;
    const dirZ = 0;
    if (plat) {
      const topY = plat.y + plat.h * 0.5;
      const offs = [
        [0, 0],
        [0, 2.2],
        [0, -2.2],
        [2.4, 0],
        [-2.4, 0],
        [2.2, 2.2],
        [-2.2, -2.2]
      ];
      for (let i = 0; i < offs.length; i++) {
        const cx = plat.x + offs[i][0];
        const cz = plat.z + offs[i][1];
        if (isPlatformRectClear(plat, cx, cz, 1.05, 1.05)) {
          pushOrientedFloorQuad(cx, topY + 0.009, cz, 2.0, 2.0, 0, site.z >= 0 ? -1 : 1, quadrant);
          return;
        }
      }
    }
    // Fallback / ground site floor badge near site entrance
    const gOffs = [
      [0, 0],
      [dirX * 4, 0],
      [0, site.z >= 0 ? -4 : 4],
      [dirX * 7, 0],
      [0, site.z >= 0 ? -8 : 8],
      [dirX * 5, site.z >= 0 ? -5 : 5]
    ];
    for (let i = 0; i < gOffs.length; i++) {
      const cx = site.x + gOffs[i][0];
      const cz = site.z + gOffs[i][1];
      if (isGroundRectClear(cx, cz, 1.25, 1.25)) {
        pushOrientedFloorQuad(cx, 0.009, cz, 2.3, 2.3, 0, -1, quadrant);
        return;
      }
    }
    void dirZ;
  };

  tryPlaceSiteBadge(siteA, 0);
  tryPlaceSiteBadge(siteB, 1);

  const tryPlaceArrow = (baseX, baseZ, target, quadrant) => {
    const dx = target.x - baseX;
    const dz = target.z - baseZ;
    let fx = 0;
    let fz = 0;
    if (Math.abs(dx) >= Math.abs(dz)) {
      fx = dx >= 0 ? 1 : -1;
    } else {
      fz = dz >= 0 ? 1 : -1;
    }
    const len = 3.0;
    const wid = 1.5;
    const hx = Math.abs(fx) * (len * 0.5) + Math.abs(fz) * (wid * 0.5);
    const hz = Math.abs(fz) * (len * 0.5) + Math.abs(fx) * (wid * 0.5);

    const shifts = [
      [0, 0],
      [0, 3.0],
      [0, -3.0],
      [3.0, 0],
      [-3.0, 0],
      [4.5, 4.5],
      [-4.5, -4.5]
    ];
    for (let s = 0; s < shifts.length; s++) {
      const cx = baseX + shifts[s][0];
      const cz = baseZ + shifts[s][1];
      if (isGroundRectClear(cx, cz, hx, hz)) {
        pushOrientedFloorQuad(cx, 0.009, cz, len, wid, fx, fz, quadrant);
        return true;
      }
    }
    return false;
  };

  // Route arrows from North/South approaches and Mid lanes toward A (+X) and B (-X)
  const laneZ = Math.min(halfSize - 10, Math.round(halfSize * 0.72));
  const laneX = Math.min(halfSize - 10, Math.round(halfSize * 0.44));
  const sideX = Math.min(halfSize - 9, Math.round(halfSize * 0.64));

  tryPlaceArrow(10, -laneZ, siteA, 2);
  tryPlaceArrow(10, laneZ, siteA, 2);
  tryPlaceArrow(laneX, -14, siteA, 2);
  tryPlaceArrow(sideX, 0, siteA, 2);

  tryPlaceArrow(-10, -laneZ, siteB, 3);
  tryPlaceArrow(-10, laneZ, siteB, 3);
  tryPlaceArrow(-laneX, 14, siteB, 3);
  tryPlaceArrow(-sideX, 0, siteB, 3);

  // Wall stencil A / B markers on clear interior blast walls near East (+X) and West (-X) tactical routes
  const isDesertMap = mapCfg?.id === 'desert_outpost';
  let wallA = 0;
  let wallB = 0;
  for (let i = 0; i < obstacles.length; i++) {
    const obs = obstacles[i];
    if (obs.type !== 'wall' || obs.h < 2.2) continue;
    const isPerimeter = Math.max(obs.w, obs.d) > 80 || Math.max(obs.w, obs.d) >= halfSize * 1.8;
    if (isPerimeter) continue;
    if (Math.abs(obs.x) < 6) continue;
    if (isDesertMap && Math.abs(Math.abs(obs.z) - 22) < 0.5) continue;

    const isA = obs.x > 0;
    if (isA && wallA >= 3) continue;
    if (!isA && wallB >= 3) continue;

    const alongX = obs.w >= obs.d;
    const span = alongX ? obs.w : obs.d;
    if (span < 2.4) continue;

    // Pick bay clear of pilasters (at ±0.46, and ±0.153 when span >= 7.2) and clear of center saltlineArenaDecals
    const offsetFrac = isDesertMap
      ? (span >= 7.0 ? 0.0 : span < 4.2 ? 0 : null)
      : (span >= 7.6 ? 0.305 : span < 4.2 ? 0 : null);
    if (offsetFrac === null) continue;

    const botY = obs.y - obs.h * 0.5;
    const w = 1.25;
    const h = 1.25;
    const cy = Math.min(obs.y + obs.h * 0.5 - h * 0.5 - 0.25, Math.max(botY + h * 0.5 + 0.45, botY + obs.h * 0.56));
    const quadrant = isA ? 0 : 1;

    if (alongX) {
      const faceSign = obs.z >= 0 ? -1 : 1;
      const cx = obs.x + (obs.x >= 0 ? -1 : 1) * span * offsetFrac;
      const fz = obs.z + faceSign * (obs.d * 0.5 + 0.012);
      if (isVerticalFaceClear(obs, cx, cy, fz, 0, faceSign, w, h)) {
        pushVerticalQuad(cx, cy, fz, 0, faceSign, w, h, quadrant);
        if (isA) wallA++;
        else wallB++;
      }
    } else {
      const faceSign = obs.x >= 0 ? -1 : 1;
      const cz = obs.z + (obs.z >= 0 ? -1 : 1) * span * offsetFrac;
      const fx = obs.x + faceSign * (obs.w * 0.5 + 0.012);
      if (isVerticalFaceClear(obs, fx, cy, cz, faceSign, 0, w, h)) {
        pushVerticalQuad(fx, cy, cz, faceSign, 0, w, h, quadrant);
        if (isA) wallA++;
        else wallB++;
      }
    }
  }

  if (quads.length === 0) return null;

  const vCount = quads.length * 4;
  const positions = new Float32Array(vCount * 3);
  const normals = new Float32Array(vCount * 3);
  const uvs = new Float32Array(vCount * 2);
  const indices = new Uint16Array(quads.length * 6);

  for (let q = 0; q < quads.length; q++) {
    const { verts, normal } = quads[q];
    const baseV = q * 4;
    for (let c = 0; c < 4; c++) {
      const [vx, vy, vz, u, v] = verts[c];
      const vi = (baseV + c) * 3;
      const ui = (baseV + c) * 2;
      positions[vi] = vx;
      positions[vi + 1] = vy;
      positions[vi + 2] = vz;
      normals[vi] = normal[0];
      normals[vi + 1] = normal[1];
      normals[vi + 2] = normal[2];
      uvs[ui] = u;
      uvs[ui + 1] = v;
    }
    const ii = q * 6;
    indices[ii] = baseV;
    indices[ii + 1] = baseV + 1;
    indices[ii + 2] = baseV + 2;
    indices[ii + 3] = baseV;
    indices[ii + 4] = baseV + 2;
    indices[ii + 5] = baseV + 3;
  }

  const decalGeo = new THREE.BufferGeometry();
  decalGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  decalGeo.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  decalGeo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  decalGeo.setIndex(new THREE.BufferAttribute(indices, 1));
  decalGeo.computeBoundingSphere();
  game.arenaGeometries?.add(decalGeo);

  const decalTex = createBombsiteDecalAtlasTexture(game);
  const decalMat = new THREE.MeshStandardMaterial({
    map: decalTex,
    transparent: true,
    alphaTest: 0.05,
    depthWrite: false,
    roughness: 0.78,
    metalness: 0.04,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1
  });
  game.arenaMaterials?.add(decalMat);

  const decalMesh = new THREE.Mesh(decalGeo, decalMat);
  decalMesh.name = 'saltlineBombsiteDecals';
  decalMesh.renderOrder = 1;
  decalMesh.castShadow = false;
  decalMesh.receiveShadow = true;
  decalMesh.frustumCulled = false;
  decalMesh.updateMatrix();
  decalMesh.matrixAutoUpdate = false;
  game.scene?.add(decalMesh);
  game.arenaDecorMeshes?.push(decalMesh);
  game.saltlineBombsiteDecals = decalMesh;
  return decalMesh;
}
