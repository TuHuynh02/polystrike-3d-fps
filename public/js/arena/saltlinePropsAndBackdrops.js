import * as THREE from '../three.js';
import {
  createBombsiteDecalAtlasTexture,
  getBombsiteDecalUVRect,
  getSaltlineDecalUVRect
} from './proceduralTextures.js';

const ACTIVE_DUTY_DEFUSE_MAPS = new Set(['de_dust2', 'de_mirage', 'de_inferno', 'de_nuke']);

/**
 * Creates shared architectural accent PBR materials for CS:GO maps:
 * dark rubber gaskets / overhead cables, weathered timber pallets, and cedar utility poles —
 * all registered in `game.arenaMaterials` for zero-leak map disposal.
 */
export function createSaltlineBackdropMaterials(game) {
  const rubberFenderMat = new THREE.MeshStandardMaterial({
    color: 0x16191e,
    roughness: 0.88,
    metalness: 0.06
  });
  const palletTimberMat = new THREE.MeshStandardMaterial({
    color: 0x674e36,
    roughness: 0.84,
    metalness: 0.04
  });
  const dustCedarWoodMat = new THREE.MeshStandardMaterial({
    color: 0x5c4028,
    roughness: 0.88,
    metalness: 0.03
  });

  const all = [rubberFenderMat, palletTimberMat, dustCedarWoodMat];
  for (let i = 0; i < all.length; i++) {
    game.arenaMaterials.add(all[i]);
  }

  return {
    rubberFenderMat,
    palletTimberMat,
    dustCedarWoodMat
  };
}

/**
 * Builds an indexed trapezoidal prism BufferGeometry (extruded along local Y in [-0.5, +0.5],
 * base width along X = bottomSpan, top width along X = topSpan, thickness along Z in [-0.5, +0.5])
 * with crisp flat-shaded normals, UV0, and world-metric UV1 for corrugated steel ribs, pitched roof caps,
 * stone copings, and tapered concrete barriers.
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
    { idx: [3, 2, 6, 7], uSpan: (bottomSpanX + topSpanX) * 0.5, vSpan: heightY },
    { idx: [1, 0, 4, 5], uSpan: (bottomSpanX + topSpanX) * 0.5, vSpan: heightY },
    { idx: [2, 1, 5, 6], uSpan: (bottomDepthZ + topDepthZ) * 0.5, vSpan: heightY },
    { idx: [0, 3, 7, 4], uSpan: (bottomDepthZ + topDepthZ) * 0.5, vSpan: heightY },
    { idx: [7, 6, 5, 4], uSpan: topSpanX, vSpan: topDepthZ },
    { idx: [0, 1, 2, 3], uSpan: bottomSpanX, vSpan: bottomDepthZ }
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
 * Adds authentic Moroccan CS2 courtyard overhead street-level dressing for `de_dust2` and `de_mirage`:
 * perimeter parapet rooftop TV antennas, close-in wooden utility poles (`halfSize + 3.2m`),
 * and sagging black overhead catenary powerlines crossing the sunlit courtyard sky (`1` LineSegments draw call).
 * Distant skyline townhouses & minarets are provided cleanly by `skyAtmosphere.js`.
 */
export function buildDustCourtyardBackdrop({
  game = null,
  halfSize = 38,
  highDetail = true,
  registerInstanced,
  unitBoxGeo,
  unitCylGeo,
  mats,
  darkSteelMat = null,
  variant = 'dust2'
}) {
  const addBox = (x, y, z, w, h, d, mat, rx = 0, ry = 0, rz = 0, castShadow = false) =>
    registerInstanced(unitBoxGeo, mat, x, y, z, w, h, d, rx, ry, rz, castShadow);
  const addCyl = (x, y, z, r, len, mat, rx = 0, ry = 0, rz = 0, castShadow = false) =>
    registerInstanced(unitCylGeo, mat, x, y, z, r * 2, len, r * 2, rx, ry, rz, castShadow);
  const antennaMat = darkSteelMat || mats.dustCedarWoodMat;
  const isMirage = variant === 'mirage';

  const addRooftopTvAntenna = (ax, baseY, az, yaw = 0) => {
    const cosY = Math.cos(yaw);
    const sinY = Math.sin(yaw);
    addCyl(ax, baseY + 1.35, az, 0.032, 2.7, antennaMat, 0, 0, 0, false);
    addBox(ax, baseY + 2.45, az, 1.75, 0.04, 0.04, antennaMat, 0, yaw, 0.08, false);
    for (let e = 0; e < 4; e++) {
      const along = -0.72 + (e / 3) * 1.44;
      const elemLen = 1.05 - e * 0.15;
      const ex = ax + cosY * along;
      const ez = az - sinY * along;
      const ey = baseY + 2.45 + along * 0.08;
      addBox(ex, ey, ez, 0.032, 0.032, elemLen, antennaMat, 0, yaw, 0, false);
    }
  };

  // 1. Perimeter parapet rooftop TV antennas silhouetted against sky (Medium/High)
  if (highDetail) {
    const aOff = Math.round(halfSize * 0.54);
    const parapetAntennas = [
      [-aOff, 12.6, -halfSize - 0.2, 0.4],
      [aOff * 0.85, 12.6, -halfSize - 0.2, 1.1],
      [-aOff * 0.85, 12.6, halfSize + 0.2, 2.2],
      [aOff, 12.6, halfSize + 0.2, 0.7],
      [-halfSize - 0.2, 12.6, -aOff * 0.72, 1.6],
      [halfSize + 0.2, 12.6, aOff * 0.72, 2.8]
    ];
    for (let a = 0; a < parapetAntennas.length; a++) {
      const [ax, ay, az, ayaw] = parapetAntennas[a];
      addRooftopTvAntenna(ax, ay, az, ayaw);
    }
  }

  // 2. Wooden Utility Poles + Sagging Overhead Catenary Wires (Medium/High)
  if (highDetail && game?.scene) {
    const poleDist = halfSize + 3.2;
    const poleSpan = Math.round(halfSize * 0.62);
    const poleCoords = [];
    for (const s of [-1, 1]) {
      for (const off of [-poleSpan, 0, poleSpan]) {
        poleCoords.push([off, s * poleDist, 0]);
        poleCoords.push([s * poleDist, off, Math.PI * 0.5]);
      }
    }
    for (let p = 0; p < poleCoords.length; p++) {
      const [px, pz, pyaw] = poleCoords[p];
      addCyl(px, 6.2, pz, 0.13, 12.4, mats.dustCedarWoodMat);
      addBox(px, 11.8, pz, 1.95, 0.15, 0.17, mats.dustCedarWoodMat, 0, pyaw, 0);
      addBox(px, 11.1, pz, 1.40, 0.13, 0.15, mats.dustCedarWoodMat, 0, pyaw, 0);
    }

    const segsPerSpan = 10;
    const lineVerts = [];
    const pushWireSpan = (ax, ay, az, bx, by, bz, sag = 1.25) => {
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
        [-poleSpan, 0],
        [0, poleSpan]
      ]) {
        for (const wireOff of [-0.68, 0.68]) {
          pushWireSpan(a, 11.85, s * poleDist + wireOff, b, 11.85, s * poleDist + wireOff, 1.05);
          pushWireSpan(s * poleDist + wireOff, 11.85, a, s * poleDist + wireOff, 11.85, b, 1.05);
        }
      }
    }

    // Crisp black CS2 overhead power wires crossing the sunlit courtyard sky
    const cA = Math.round(halfSize * 0.42);
    const cB = Math.round(halfSize * 0.30);
    const cC = Math.round(halfSize * 0.62);
    const skyCrossings = [
      [-halfSize, 12.2, -cA, halfSize, 12.0, -cB, 1.95],
      [-halfSize, 11.85, -cA, halfSize, 11.65, -cB, 2.15],
      [-halfSize, 12.1, cB, halfSize, 12.3, cA, 1.95],
      [-halfSize, 11.75, cB, halfSize, 11.95, cA, 2.15],
      [-cB, 12.5, -halfSize, -cB * 0.72, 12.3, halfSize, 2.1],
      [cB * 0.72, 12.3, -halfSize, cB, 12.5, halfSize, 2.1],
      [-halfSize, 12.6, -cC, -cC, 12.5, -halfSize, 1.25],
      [halfSize, 12.6, -cC, cC, 12.5, -halfSize, 1.25],
      [-halfSize, 12.6, cC, -cC, 12.5, halfSize, 1.25],
      [halfSize, 12.6, cC, cC, 12.5, halfSize, 1.25]
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
    wireMesh.name = isMirage ? 'mirageUtilityWires' : 'dustUtilityWires';
    wireMesh.frustumCulled = false;
    wireMesh.updateMatrix();
    wireMesh.matrixAutoUpdate = false;
    game.scene.add(wireMesh);
    game.arenaDecorMeshes?.push(wireMesh);
  }
}

/**
 * Generates a map-authentic 512x512 CS:GO 4-quadrant tactical decal atlas (zero maritime harbor text).
 * Returns null cleanly when `document` is unavailable in raw headless Node.
 */
function createCsgoDecalAtlasTexture(game, mapId) {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext?.('2d');
  if (!ctx) return null;
  ctx.clearRect(0, 0, 512, 512);

  if (mapId === 'de_nuke') {
    // Q0: High-voltage nuclear plant yellow-black hazard diamond
    ctx.fillStyle = 'rgba(18, 22, 28, 0.72)';
    ctx.fillRect(22, 20, 212, 212);
    ctx.strokeStyle = 'rgba(234, 179, 8, 0.90)';
    ctx.lineWidth = 3;
    ctx.strokeRect(22, 20, 212, 212);
    ctx.save();
    ctx.translate(128, 102);
    ctx.beginPath();
    ctx.moveTo(0, -56);
    ctx.lineTo(56, 0);
    ctx.lineTo(0, 56);
    ctx.lineTo(-56, 0);
    ctx.closePath();
    ctx.fillStyle = 'rgba(234, 179, 8, 0.95)';
    ctx.fill();
    ctx.lineWidth = 5;
    ctx.strokeStyle = 'rgba(15, 18, 22, 0.96)';
    ctx.stroke();
    ctx.fillStyle = 'rgba(15, 18, 22, 0.96)';
    ctx.beginPath();
    ctx.arc(0, 0, 14, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = 'rgba(234, 179, 8, 0.95)';
    ctx.font = '800 15px "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('CEDAR CREEK // REACTOR', 128, 204);

    // Q1: Container / Reactor Sector ID Stencil
    ctx.fillStyle = 'rgba(16, 20, 26, 0.84)';
    ctx.fillRect(274, 46, 218, 164);
    ctx.strokeStyle = 'rgba(226, 232, 240, 0.78)';
    ctx.lineWidth = 3;
    ctx.strokeRect(274, 46, 218, 164);
    ctx.fillStyle = 'rgba(234, 179, 8, 0.95)';
    ctx.fillRect(284, 56, 198, 28);
    ctx.fillStyle = '#111827';
    ctx.font = '800 15px "Segoe UI", sans-serif';
    ctx.fillText('CEDAR CREEK POWER', 383, 75);
    ctx.fillStyle = 'rgba(241, 245, 249, 0.95)';
    ctx.font = '800 32px "Segoe UI", sans-serif';
    ctx.fillText('SECTOR A', 383, 126);
    ctx.font = '700 13px Consolas, monospace';
    ctx.fillStyle = 'rgba(203, 213, 225, 0.90)';
    ctx.fillText('SILO UNIT 01 // RESTRICTED', 383, 162);

    // Q2: Bold Yellow-Black Diagonal Hazard Chevron Strip
    ctx.fillStyle = 'rgba(16, 18, 22, 0.92)';
    ctx.fillRect(16, 288, 224, 112);
    ctx.fillStyle = 'rgba(234, 179, 8, 0.95)';
    for (let sx = 18; sx <= 190; sx += 36) {
      ctx.beginPath();
      ctx.moveTo(sx, 400);
      ctx.lineTo(sx + 18, 400);
      ctx.lineTo(sx + 50, 288);
      ctx.lineTo(sx + 32, 288);
      ctx.closePath();
      ctx.fill();
    }
    ctx.strokeStyle = 'rgba(234, 179, 8, 0.90)';
    ctx.lineWidth = 3;
    ctx.strokeRect(16, 288, 224, 112);
    ctx.fillStyle = 'rgba(16, 18, 22, 0.82)';
    ctx.fillRect(16, 408, 224, 34);
    ctx.fillStyle = 'rgba(248, 250, 252, 0.94)';
    ctx.font = '800 16px "Segoe UI", sans-serif';
    ctx.fillText('HAZARD // KEEP CLEAR', 128, 431);

    // Q3: Reactor Containment Unit Number
    ctx.fillStyle = 'rgba(18, 22, 28, 0.50)';
    ctx.fillRect(278, 284, 212, 196);
    ctx.strokeStyle = 'rgba(226, 232, 240, 0.82)';
    ctx.lineWidth = 4;
    ctx.strokeRect(278, 284, 212, 196);
    ctx.fillStyle = 'rgba(226, 232, 240, 0.90)';
    ctx.font = '800 16px Consolas, monospace';
    ctx.fillText('CONTAINMENT BAY', 384, 318);
    ctx.fillStyle = 'rgba(234, 179, 8, 0.96)';
    ctx.font = '800 68px "Segoe UI", sans-serif';
    ctx.fillText('N-01', 384, 396);
    ctx.fillStyle = 'rgba(203, 213, 225, 0.86)';
    ctx.font = '700 14px Consolas, monospace';
    ctx.fillText('AUTHORIZED PERSONNEL ONLY', 384, 442);
  } else if (mapId === 'aim_map') {
    // Crisp CS2 rifle training yard painted lane lines, distance markers & lane numbers
    ctx.textAlign = 'center';
    // Q0: Lane 01 target board stencil
    ctx.strokeStyle = 'rgba(245, 243, 235, 0.88)';
    ctx.lineWidth = 4;
    ctx.strokeRect(28, 32, 200, 192);
    ctx.fillStyle = 'rgba(217, 119, 6, 0.92)';
    ctx.fillRect(36, 40, 184, 34);
    ctx.fillStyle = '#18181b';
    ctx.font = '800 18px "Segoe UI", sans-serif';
    ctx.fillText('RANGE // 1V1', 128, 63);
    ctx.fillStyle = 'rgba(245, 243, 235, 0.92)';
    ctx.font = '800 64px "Segoe UI", sans-serif';
    ctx.fillText('01', 128, 154);
    ctx.font = '700 14px Consolas, monospace';
    ctx.fillText('AIM TRAINING YARD', 128, 196);

    // Q1: Range distance stencil
    ctx.strokeStyle = 'rgba(245, 243, 235, 0.84)';
    ctx.lineWidth = 4;
    ctx.strokeRect(284, 32, 200, 192);
    ctx.fillStyle = 'rgba(220, 38, 38, 0.88)';
    ctx.fillRect(292, 40, 184, 34);
    ctx.fillStyle = '#fafaf9';
    ctx.font = '800 18px "Segoe UI", sans-serif';
    ctx.fillText('REDLINE // LIVE', 384, 63);
    ctx.fillStyle = 'rgba(245, 243, 235, 0.92)';
    ctx.font = '800 58px "Segoe UI", sans-serif';
    ctx.fillText('25M', 384, 152);
    ctx.font = '700 14px Consolas, monospace';
    ctx.fillText('HEAD-LEVEL LINE', 384, 196);

    // Q2: Crisp painted firing-lane boundary strip (white + redline accent)
    ctx.fillStyle = 'rgba(244, 241, 232, 0.90)';
    ctx.fillRect(16, 336, 224, 22);
    ctx.fillStyle = 'rgba(205, 58, 42, 0.88)';
    ctx.fillRect(16, 368, 224, 12);
    ctx.fillStyle = 'rgba(244, 241, 232, 0.84)';
    for (let tx = 24; tx < 228; tx += 36) {
      ctx.fillRect(tx, 392, 22, 8);
    }

    // Q3: Center engagement line & tick marks
    ctx.fillStyle = 'rgba(244, 241, 232, 0.86)';
    ctx.fillRect(272, 348, 224, 18);
    ctx.fillStyle = 'rgba(217, 119, 6, 0.88)';
    ctx.fillRect(272, 376, 224, 10);
    ctx.fillStyle = 'rgba(244, 241, 232, 0.88)';
    ctx.font = '800 22px Consolas, monospace';
    ctx.fillText('MID LANE', 384, 332);
  } else if (mapId === 'fy_iceworld') {
    // Crisp frosted slate-blue arctic floor & monolith markings (zero neon!)
    ctx.textAlign = 'center';
    ctx.strokeStyle = 'rgba(226, 238, 248, 0.80)';
    ctx.lineWidth = 4;
    ctx.strokeRect(30, 34, 196, 188);
    ctx.fillStyle = 'rgba(59, 95, 128, 0.72)';
    ctx.fillRect(38, 42, 180, 32);
    ctx.fillStyle = '#f1f5f9';
    ctx.font = '800 16px "Segoe UI", sans-serif';
    ctx.fillText('ARCTIC OUTPOST', 128, 63);
    ctx.font = '800 56px "Segoe UI", sans-serif';
    ctx.fillText('FY', 128, 150);
    ctx.font = '700 14px Consolas, monospace';
    ctx.fillText('SECTOR 01 // ICE', 128, 194);

    ctx.strokeStyle = 'rgba(226, 238, 248, 0.75)';
    ctx.strokeRect(286, 34, 196, 188);
    ctx.fillStyle = 'rgba(226, 238, 248, 0.84)';
    ctx.font = '800 44px "Segoe UI", sans-serif';
    ctx.fillText('ICE', 384, 140);

    // Q2: Frosted lane line
    ctx.fillStyle = 'rgba(226, 238, 248, 0.65)';
    ctx.fillRect(20, 344, 216, 18);
    ctx.fillStyle = 'rgba(71, 108, 140, 0.65)';
    ctx.fillRect(20, 370, 216, 10);

    // Q3: Frost station stencil
    ctx.strokeStyle = 'rgba(226, 238, 248, 0.72)';
    ctx.strokeRect(284, 290, 200, 184);
    ctx.fillStyle = 'rgba(226, 238, 248, 0.82)';
    ctx.font = '800 48px "Segoe UI", sans-serif';
    ctx.fillText('04', 384, 396);
  } else {
    // Warm weathered Mediterranean/CS2 stencils for de_dust2, de_mirage, de_inferno
    ctx.textAlign = 'center';
    // Q0: Subtle weathered painted site plaque
    ctx.strokeStyle = 'rgba(64, 52, 40, 0.68)';
    ctx.lineWidth = 4;
    ctx.strokeRect(32, 34, 192, 188);
    ctx.fillStyle = 'rgba(156, 62, 42, 0.76)';
    ctx.font = '800 58px "Segoe UI", sans-serif';
    ctx.fillText(mapId === 'de_inferno' ? 'B' : 'A', 128, 146);
    ctx.fillStyle = 'rgba(62, 50, 38, 0.72)';
    ctx.font = '700 14px Consolas, monospace';
    ctx.fillText(mapId === 'de_inferno' ? 'VIA BANANA' : 'SECTOR 02', 128, 192);

    // Q1: Weathered freight container stencil
    ctx.fillStyle = 'rgba(20, 25, 30, 0.78)';
    ctx.fillRect(274, 48, 216, 160);
    ctx.strokeStyle = 'rgba(235, 228, 214, 0.68)';
    ctx.lineWidth = 3;
    ctx.strokeRect(274, 48, 216, 160);
    ctx.fillStyle = 'rgba(235, 228, 214, 0.90)';
    ctx.font = '800 28px "Segoe UI", sans-serif';
    ctx.fillText('CARGO 40', 382, 114);
    ctx.font = '700 14px Consolas, monospace';
    ctx.fillStyle = 'rgba(218, 164, 62, 0.90)';
    ctx.fillText('MAX GROSS 30,480 KG', 382, 154);

    // Q2: Subtle chalk / stone-courtyard ground lane bar
    ctx.fillStyle = 'rgba(235, 224, 200, 0.56)';
    ctx.fillRect(22, 344, 212, 18);
    ctx.fillStyle = 'rgba(166, 76, 46, 0.58)';
    ctx.fillRect(22, 370, 212, 10);

    // Q3: Weathered Mediterranean street number stencil
    ctx.strokeStyle = 'rgba(72, 58, 44, 0.64)';
    ctx.lineWidth = 4;
    ctx.strokeRect(284, 288, 200, 184);
    ctx.fillStyle = 'rgba(72, 58, 44, 0.76)';
    ctx.font = '800 62px "Segoe UI", sans-serif';
    ctx.fillText(mapId === 'de_mirage' ? 'M-1' : mapId === 'de_inferno' ? '14' : 'D-2', 384, 396);
  }

  const tex = new THREE.CanvasTexture(canvas);
  if ('colorSpace' in tex && THREE.SRGBColorSpace) {
    tex.colorSpace = THREE.SRGBColorSpace;
  }
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  game.arenaTextures?.add(tex);
  return tex;
}

/**
 * Merges map-authentic CS:GO wall stencils, container placards, and painted floor lane markings
 * into ONE single BufferGeometry + MeshStandardMaterial draw call (`renderOrder = 1`, omitted on Low tier).
 * Every quad vertex is collision-checked against obstacles so `buriedVerts === 0` across all 6 CS:GO maps.
 */
export function buildCsgoWorldDecals(game, mapCfg, halfSize) {
  if (!game || !mapCfg || (game?.quality?.envMapSize ?? 512) === 0) {
    if (game) game.saltlineArenaDecals = null;
    return null;
  }

  const mapId = mapCfg.id || 'de_dust2';
  const obstacles = mapCfg.obstacles || [];
  const quads = [];

  const isPointBuriedInObstacles = (x, y, z, pad = 0.04) => {
    for (let j = 0; j < obstacles.length; j++) {
      const ob = obstacles[j];
      if (ob.shape === 'cylinder') continue;
      const hw = ob.w * 0.5 - 0.01 + pad;
      const hd = ob.d * 0.5 - 0.01 + pad;
      const minY = ob.y - ob.h * 0.5 - 0.005;
      const maxY = ob.y + ob.h * 0.5 - 0.01 + pad;
      if (x > ob.x - hw && x < ob.x + hw && z > ob.z - hd && z < ob.z + hd && y > minY && y < maxY) {
        return true;
      }
    }
    return false;
  };

  const isQuadClear = (verts, hostObs = null) => {
    for (let i = 0; i < verts.length; i++) {
      const [vx, vy, vz] = verts[i];
      if (Math.abs(vx) >= halfSize - 0.8 || Math.abs(vz) >= halfSize - 0.8) return false;
      for (let j = 0; j < obstacles.length; j++) {
        const ob = obstacles[j];
        if (ob === hostObs || ob.shape === 'cylinder') continue;
        const hw = ob.w * 0.5 + 0.06;
        const hd = ob.d * 0.5 + 0.06;
        const minY = ob.y - ob.h * 0.5 - 0.01;
        const maxY = ob.y + ob.h * 0.5 + 0.06;
        if (vx > ob.x - hw && vx < ob.x + hw && vz > ob.z - hd && vz < ob.z + hd && vy > minY && vy < maxY) {
          return false;
        }
      }
    }
    return true;
  };

  const tryPushVerticalQuad = (hostObs, cx, cy, cz, nx, nz, width, height, quadrant) => {
    const rx = -nz;
    const rz = nx;
    const hw = width * 0.5;
    const hh = height * 0.5;
    const [u0, v0, u1, v1] = getSaltlineDecalUVRect(quadrant);
    const verts = [
      [cx - rx * hw, cy - hh, cz - rz * hw, u0, v0],
      [cx + rx * hw, cy - hh, cz + rz * hw, u1, v0],
      [cx + rx * hw, cy + hh, cz + rz * hw, u1, v1],
      [cx - rx * hw, cy + hh, cz - rz * hw, u0, v1]
    ];
    if (!isQuadClear(verts, hostObs)) return false;
    quads.push({ verts, normal: [nx, 0, nz] });
    return true;
  };

  const isFloorRectBlocked = (cx, cz, halfX, halfZ) => {
    if (Math.abs(cx) + halfX >= halfSize - 2.0 || Math.abs(cz) + halfZ >= halfSize - 2.0) return true;
    for (let j = 0; j < obstacles.length; j++) {
      const o = obstacles[j];
      if (o.y - o.h * 0.5 > 0.28) continue;
      if (
        Math.abs(cx - o.x) < o.w * 0.5 + halfX + 0.24 &&
        Math.abs(cz - o.z) < o.d * 0.5 + halfZ + 0.24
      ) {
        return true;
      }
    }
    return false;
  };

  const tryPushFloorQuad = (cx, y, cz, width, depth, yawQuarterTurns, quadrant) => {
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
    for (let i = 0; i < verts.length; i++) {
      if (isPointBuriedInObstacles(verts[i][0], verts[i][1], verts[i][2], 0.08)) return false;
    }
    quads.push({ verts, normal: [0, 1, 0] });
    return true;
  };

  const isIndustrialStencils = mapId === 'de_nuke' || mapId === 'aim_map';
  let wallStencilCount = 0;
  let containerStencilCount = 0;
  let floorMarkCount = 0;

  for (let i = 0; i < obstacles.length; i++) {
    const obs = obstacles[i];
    const isPerimeter = Math.max(obs.w, obs.d) > 80 || Math.max(obs.w, obs.d) >= halfSize * 1.8;
    if (isPerimeter) continue;

    if (obs.type === 'container' && obs.h >= 2.2 && containerStencilCount < 12) {
      const alongZ = obs.d >= obs.w;
      const cy = obs.y + 0.25;
      if (alongZ && obs.d >= 5.0) {
        const faceSign = obs.x >= 0 ? -1 : 1;
        const fx = obs.x + faceSign * (obs.w * 0.5 + 0.048);
        const fz = obs.z + Math.min(1.2, obs.d * 0.16);
        if (tryPushVerticalQuad(obs, fx, cy, fz, faceSign, 0, 1.32, 1.02, 1)) {
          containerStencilCount++;
        }
      } else if (!alongZ && obs.w >= 5.0) {
        const faceSign = obs.z >= 0 ? -1 : 1;
        const fx = obs.x + Math.min(1.2, obs.w * 0.16);
        const fz = obs.z + faceSign * (obs.d * 0.5 + 0.048);
        if (tryPushVerticalQuad(obs, fx, cy, fz, 0, faceSign, 1.32, 1.02, 1)) {
          containerStencilCount++;
        }
      }
    } else if (isIndustrialStencils && obs.type === 'wall' && obs.h >= 2.2 && wallStencilCount < 10) {
      const alongX = obs.w >= obs.d;
      const span = alongX ? obs.w : obs.d;
      if (span >= 4.0) {
        const quadIdx = wallStencilCount % 2 === 0 ? 3 : 0;
        const w = quadIdx === 3 ? 1.42 : 1.12;
        const h = quadIdx === 3 ? 1.30 : 1.12;
        const cy = Math.min(obs.y + obs.h * 0.5 - h * 0.5 - 0.25, obs.y + 0.15);
        if (alongX) {
          const prefSign = obs.z >= 0 ? -1 : 1;
          for (const faceSign of [prefSign, -prefSign]) {
            const fz = obs.z + faceSign * (obs.d * 0.5 + 0.022);
            if (tryPushVerticalQuad(obs, obs.x, cy, fz, 0, faceSign, w, h, quadIdx)) {
              wallStencilCount++;
              break;
            }
          }
        } else {
          const prefSign = obs.x >= 0 ? -1 : 1;
          for (const faceSign of [prefSign, -prefSign]) {
            const fx = obs.x + faceSign * (obs.w * 0.5 + 0.022);
            if (tryPushVerticalQuad(obs, fx, cy, obs.z, faceSign, 0, w, h, quadIdx)) {
              wallStencilCount++;
              break;
            }
          }
        }
      }
    }
  }

  // Painted floor lane lines / hazard zone bars (tailored per CS:GO map)
  const floorAnchorDist = Math.max(8, Math.round(halfSize * 0.56));
  const floorCandidates =
    mapId === 'aim_map'
      ? [
          // Clean CS2 rifle duel firing lines & lane stripes on both halves + center lanes
          [-10, -floorAnchorDist, 0, 3.6, 1.15, 2],
          [10, -floorAnchorDist, 0, 3.6, 1.15, 2],
          [-10, floorAnchorDist, 2, 3.6, 1.15, 2],
          [10, floorAnchorDist, 2, 3.6, 1.15, 2],
          [-14, 0, 1, 3.2, 1.10, 3],
          [14, 0, 3, 3.2, 1.10, 3],
          [0, -10, 0, 3.0, 1.05, 2],
          [0, 10, 2, 3.0, 1.05, 2]
        ]
      : mapId === 'de_nuke'
        ? [
            [0, -floorAnchorDist, 0, 3.0, 1.4, 2],
            [0, floorAnchorDist, 2, 3.0, 1.4, 2],
            [-floorAnchorDist, 0, 1, 3.0, 1.4, 2],
            [floorAnchorDist, 0, 3, 3.0, 1.4, 2]
          ]
        : [
            [0, -floorAnchorDist, 0, 2.6, 1.05, 2],
            [0, floorAnchorDist, 2, 2.6, 1.05, 2],
            [-floorAnchorDist, 0, 1, 2.6, 1.05, 2],
            [floorAnchorDist, 0, 3, 2.6, 1.05, 2]
          ];

  for (let i = 0; i < floorCandidates.length; i++) {
    const [baseX, baseZ, rot, len, wid, quadIdx] = floorCandidates[i];
    const halfX = rot % 2 === 0 ? len * 0.5 : wid * 0.5;
    const halfZ = rot % 2 === 0 ? wid * 0.5 : len * 0.5;
    for (const shift of [0, -3.2, 3.2, -6.0, 6.0]) {
      const fx = rot % 2 === 0 ? baseX + shift : baseX;
      const fz = rot % 2 === 0 ? baseZ : baseZ + shift;
      if (!isFloorRectBlocked(fx, fz, halfX, halfZ)) {
        if (tryPushFloorQuad(fx, 0.0085, fz, len, wid, rot, quadIdx)) {
          floorMarkCount++;
          break;
        }
      }
    }
  }

  // Fallback unobstructed spawn-lane ground tick if an unusual layout blocked all primary slots
  if (quads.length === 0) {
    const spawns = mapCfg.spawnPoints || [];
    for (let s = 0; s < spawns.length; s++) {
      const sp = spawns[s];
      if (!isFloorRectBlocked(sp.x, sp.z, 1.1, 0.55)) {
        if (tryPushFloorQuad(sp.x, 0.0085, sp.z, 2.0, 0.9, 0, 2)) break;
      }
    }
  }

  void floorMarkCount;
  if (quads.length === 0) {
    game.saltlineArenaDecals = null;
    return null;
  }

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

  const decalTex = createCsgoDecalAtlasTexture(game, mapId);
  const decalMat = new THREE.MeshStandardMaterial({
    map: decalTex,
    transparent: true,
    alphaTest: 0.06,
    depthWrite: false,
    roughness: 0.72,
    metalness: 0.08,
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
 * for the 4 Active Duty defuse maps (`de_dust2`, `de_mirage`, `de_inferno`, `de_nuke`), merged into
 * ONE single BufferGeometry + MeshStandardMaterial draw call (`depthWrite: false`, `polygonOffset`,
 * `y >= 0.0085`, 100% obstacle/staircase collision-checked).
 */
export function buildBombsiteRouteDecals(game, mapCfg, halfSize) {
  if (!game || !mapCfg || typeof document === 'undefined') {
    if (game) game.saltlineBombsiteDecals = null;
    return null;
  }
  const mapId = mapCfg.id || '';
  if (!ACTIVE_DUTY_DEFUSE_MAPS.has(mapId)) {
    game.saltlineBombsiteDecals = null;
    return null;
  }

  const obstacles = mapCfg.obstacles || [];
  const jumpPads = mapCfg.jumpPads || [];
  const barrels = mapCfg.barrels || [];
  const callouts = mapCfg.callouts || [];

  const findCallout = (patterns) => {
    for (let p = 0; p < patterns.length; p++) {
      const hit = callouts.find((c) => String(c.id || '').toLowerCase().includes(patterns[p]));
      if (hit) return { x: hit.x, z: hit.z };
    }
    return null;
  };

  let siteA = findCallout(['a_site', 'a_goose', 'a_main', 'a_ramp', 'reactor', 'triple', 'tetris']);
  let siteB = findCallout(['b_site', 'fountain', 'b_plat', 'oranges', 'coffins', 'b_tunnel', 'secret']);
  if (!siteA && !siteB) {
    siteA = { x: halfSize * 0.52, z: -halfSize * 0.42 };
    siteB = { x: -halfSize * 0.52, z: halfSize * 0.42 };
  }

  const quads = [];
  const placedFloor = [];
  const placedWall = [];

  const pushOrientedFloorQuad = (cx, y, cz, lenAlongFwd, widthSide, dirX, dirZ, quadrant) => {
    const dLen = Math.hypot(dirX, dirZ) || 1;
    const fx = dirX / dLen;
    const fz = dirZ / dLen;
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
    if (Math.abs(cx) + hx >= halfSize - 2.0 || Math.abs(cz) + hz >= halfSize - 2.0) return false;
    for (let i = 0; i < obstacles.length; i++) {
      const o = obstacles[i];
      if (o.y - o.h * 0.5 > 0.35) continue;
      if (Math.abs(cx - o.x) < o.w * 0.5 + hx + 0.32 && Math.abs(cz - o.z) < o.d * 0.5 + hz + 0.32) {
        return false;
      }
    }
    for (let i = 0; i < jumpPads.length; i++) {
      if (Math.hypot(cx - jumpPads[i].x, cz - jumpPads[i].z) < 2.4 + Math.max(hx, hz)) return false;
    }
    for (let i = 0; i < barrels.length; i++) {
      if (Math.hypot(cx - barrels[i].x, cz - barrels[i].z) < 2.0 + Math.max(hx, hz)) return false;
    }
    for (let i = 0; i < placedFloor.length; i++) {
      const p = placedFloor[i];
      if (Math.abs(cx - p.cx) < p.hx + hx + 0.65 && Math.abs(cz - p.cz) < p.hz + hz + 0.65) return false;
    }
    return true;
  };

  const findPlatformForPoint = (px, pz) => {
    for (let i = 0; i < obstacles.length; i++) {
      const o = obstacles[i];
      if (o.type !== 'platform') continue;
      if (Math.abs(px - o.x) <= o.w * 0.5 + 1.2 && Math.abs(pz - o.z) <= o.d * 0.5 + 1.2) {
        return o;
      }
    }
    return null;
  };

  const isPlatformRectClear = (plat, cx, cz, hx, hz) => {
    const topY = plat.y + plat.h * 0.5;
    if (
      Math.abs(cx - plat.x) + hx > plat.w * 0.5 - 0.65 ||
      Math.abs(cz - plat.z) + hz > plat.d * 0.5 - 0.65
    ) {
      return false;
    }
    for (let i = 0; i < obstacles.length; i++) {
      const o = obstacles[i];
      if (o === plat) continue;
      const minY = o.y - o.h * 0.5;
      const maxY = o.y + o.h * 0.5;
      if (maxY < topY - 0.08 || minY > topY + 1.6) continue;
      if (Math.abs(cx - o.x) < o.w * 0.5 + hx + 0.36 && Math.abs(cz - o.z) < o.d * 0.5 + hz + 0.36) {
        return false;
      }
    }
    for (let i = 0; i < placedFloor.length; i++) {
      const p = placedFloor[i];
      if (Math.abs(cx - p.cx) < p.hx + hx + 0.55 && Math.abs(cz - p.cz) < p.hz + hz + 0.55) return false;
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
      if (Math.hypot(cx - pw.cx, cz - pw.cz) < pw.hw + width * 0.5 + 0.55 && Math.abs(cy - pw.cy) < 1.5) {
        return false;
      }
    }
    return true;
  };

  const tryPlaceSiteBadge = (site, quadrant) => {
    if (!site) return;
    const plat = findPlatformForPoint(site.x, site.z);
    const dirX = site.x >= 0 ? -1 : 1;
    if (plat) {
      const topY = plat.y + plat.h * 0.5;
      const offs = [
        [0, 0],
        [0, 2.0],
        [0, -2.0],
        [2.0, 0],
        [-2.0, 0],
        [1.8, 1.8],
        [-1.8, -1.8]
      ];
      for (let i = 0; i < offs.length; i++) {
        const cx = plat.x + offs[i][0];
        const cz = plat.z + offs[i][1];
        if (isPlatformRectClear(plat, cx, cz, 0.95, 0.95)) {
          pushOrientedFloorQuad(cx, topY + 0.009, cz, 1.85, 1.85, 0, site.z >= 0 ? -1 : 1, quadrant);
          return;
        }
      }
    }
    const gOffs = [
      [0, 0],
      [dirX * 3.5, 0],
      [0, site.z >= 0 ? -3.5 : 3.5],
      [dirX * 6.0, 0],
      [0, site.z >= 0 ? -6.0 : 6.0],
      [dirX * 4.5, site.z >= 0 ? -4.5 : 4.5],
      [-dirX * 4.0, 0]
    ];
    for (let i = 0; i < gOffs.length; i++) {
      const cx = site.x + gOffs[i][0];
      const cz = site.z + gOffs[i][1];
      if (isGroundRectClear(cx, cz, 1.15, 1.15)) {
        pushOrientedFloorQuad(cx, 0.009, cz, 2.1, 2.1, 0, -1, quadrant);
        return;
      }
    }
  };

  if (siteA) tryPlaceSiteBadge(siteA, 0);
  if (siteB) tryPlaceSiteBadge(siteB, 1);

  const tryPlaceArrow = (baseX, baseZ, target, quadrant) => {
    if (!target) return false;
    const dx = target.x - baseX;
    const dz = target.z - baseZ;
    let fx = 0;
    let fz = 0;
    if (Math.abs(dx) >= Math.abs(dz)) {
      fx = dx >= 0 ? 1 : -1;
    } else {
      fz = dz >= 0 ? 1 : -1;
    }
    const len = 2.6;
    const wid = 1.3;
    const hx = Math.abs(fx) * (len * 0.5) + Math.abs(fz) * (wid * 0.5);
    const hz = Math.abs(fz) * (len * 0.5) + Math.abs(fx) * (wid * 0.5);

    const shifts = [
      [0, 0],
      [0, 2.6],
      [0, -2.6],
      [2.6, 0],
      [-2.6, 0],
      [4.0, 4.0],
      [-4.0, -4.0]
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

  // Compact Wingman/Retake approach arrows toward active site(s)
  const laneZ = Math.max(8, Math.round(halfSize * 0.64));
  const laneX = Math.max(7, Math.round(halfSize * 0.42));
  const sideX = Math.max(10, Math.round(halfSize * 0.60));

  if (siteA) {
    tryPlaceArrow(8, -laneZ, siteA, 2);
    tryPlaceArrow(8, laneZ, siteA, 2);
    tryPlaceArrow(laneX, -10, siteA, 2);
    tryPlaceArrow(sideX, 0, siteA, 2);
  }
  if (siteB) {
    tryPlaceArrow(-8, -laneZ, siteB, 3);
    tryPlaceArrow(-8, laneZ, siteB, 3);
    tryPlaceArrow(-laneX, 10, siteB, 3);
    tryPlaceArrow(-sideX, 0, siteB, 3);
  }

  // Painted A / B wall markers on clear interior walls approaching each site
  let wallA = 0;
  let wallB = 0;
  for (let i = 0; i < obstacles.length; i++) {
    const obs = obstacles[i];
    if (obs.type !== 'wall' || obs.h < 2.2) continue;
    const isPerimeter = Math.max(obs.w, obs.d) > 80 || Math.max(obs.w, obs.d) >= halfSize * 1.8;
    if (isPerimeter) continue;

    let isA = null;
    if (siteA && siteB) {
      const dA = Math.hypot(obs.x - siteA.x, obs.z - siteA.z);
      const dB = Math.hypot(obs.x - siteB.x, obs.z - siteB.z);
      isA = dA <= dB;
    } else if (siteA) {
      isA = true;
    } else if (siteB) {
      isA = false;
    }
    if (isA === null) continue;
    if (isA && wallA >= 3) continue;
    if (!isA && wallB >= 3) continue;

    const alongX = obs.w >= obs.d;
    const span = alongX ? obs.w : obs.d;
    if (span < 2.4) continue;

    const botY = obs.y - obs.h * 0.5;
    const w = 1.15;
    const h = 1.15;
    const cy = Math.min(obs.y + obs.h * 0.5 - h * 0.5 - 0.25, Math.max(botY + h * 0.5 + 0.55, botY + obs.h * 0.58));
    const quadrant = isA ? 0 : 1;

    if (alongX) {
      const faceSign = obs.z >= 0 ? -1 : 1;
      const fz = obs.z + faceSign * (obs.d * 0.5 + 0.018);
      if (isVerticalFaceClear(obs, obs.x, cy, fz, 0, faceSign, w, h)) {
        pushVerticalQuad(obs.x, cy, fz, 0, faceSign, w, h, quadrant);
        if (isA) wallA++;
        else wallB++;
      }
    } else {
      const faceSign = obs.x >= 0 ? -1 : 1;
      const fx = obs.x + faceSign * (obs.w * 0.5 + 0.018);
      if (isVerticalFaceClear(obs, fx, cy, obs.z, faceSign, 0, w, h)) {
        pushVerticalQuad(fx, cy, obs.z, faceSign, 0, w, h, quadrant);
        if (isA) wallA++;
        else wallB++;
      }
    }
  }

  if (quads.length === 0) {
    game.saltlineBombsiteDecals = null;
    return null;
  }

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
