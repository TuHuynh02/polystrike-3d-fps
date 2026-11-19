// Authentic CS2 Dust II Moroccan sandstone/stucco architecture builders, stacked plank crates,
// lower stone/concrete dado plinths, teal-green louvered shutters, street props, and MIT wall decals
// for `desert_outpost`.
// All geometry is batched through `archMeshBatches` (merged into 1 draw call per material),
// `decorBatches` (InstancedMesh), and 3 merged decal draw calls, tracked cleanly for 100% disposal
// in `disposeMapResources()`.

import * as THREE from '../three.js';
import { ASSET_BASE } from '../assets.js';
import {
  applyMetricBoxUV1,
  applyVerticalPlankBoxUV1,
  attachWorldMacroGrime,
  registerPbrSlot,
  resolveTint,
  uvOffsetFor
} from '../surfaceMaterials.js';
import { applyBoxWorldUVs, createObstacleTexture } from './proceduralTextures.js';
import { createTrapezoidPrismGeometry } from './saltlinePropsAndBackdrops.js';

/** Remaps dark raw desert obstacle hexes into warm sunlit Moroccan stone & timber fallback tones. */
export function remapDesertObstacleColor(hexColor, type = 'wall') {
  if (type === 'container') {
    const c = new THREE.Color(hexColor ?? 0xd97706);
    const hsl = { h: 0, s: 0, l: 0 };
    c.getHSL(hsl);
    if (hsl.h >= 0.47 && hsl.h <= 0.66) return 0x2b6da8;
    if (hexColor === 0x92400e) return 0xb88c5a;
    return 0xcfa879;
  }
  if (type === 'crate') {
    return 0xba9364;
  }
  switch (hexColor) {
    case 0x451a03:
      return 0xdfd2bc;
    case 0x78350f:
      return 0xcbb99d;
    case 0x92400e:
      return 0xc6b397;
    case 0xb45309:
      return 0xc99c62;
    case 0xd97706:
      return 0xc8a472;
    case 0xf59e0b:
      return 0xd4b282;
    default:
      return hexColor ?? 0xcbb99d;
  }
}

/** Applies planar world-metric UVs (`uv` + `uv1`) based on each triangle's dominant normal axis. */
export function applyPlanarMetricUVs(geo, tile = 2.5, offset = [0, 0]) {
  const pos = geo?.attributes?.position;
  const nor = geo?.attributes?.normal;
  if (!pos || !nor) return false;
  const uv0 = new Float32Array(pos.count * 2);
  const uv1 = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const nx = Math.abs(nor.getX(i));
    const ny = Math.abs(nor.getY(i));
    const nz = Math.abs(nor.getZ(i));
    let u = x;
    let v = y;
    if (nx >= ny && nx >= nz) {
      u = z;
      v = y;
    } else if (ny >= nx && ny >= nz) {
      u = x;
      v = z;
    }
    uv0[i * 2] = u / 3.2 + offset[0];
    uv0[i * 2 + 1] = v / 3.2 + offset[1];
    uv1[i * 2] = u / tile + offset[0];
    uv1[i * 2 + 1] = v / tile + offset[1];
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv0, 2));
  geo.setAttribute('uv1', new THREE.BufferAttribute(uv1, 2));
  return true;
}

/**
 * Builds a carved Moroccan horseshoe/pointed sandstone arch spandrel geometry centered at X=0, Y=0 (ground), Z=0
 * using `THREE.ExtrudeGeometry`, keeping walkway & jump clearance strictly open under `[archSpringY .. archApexY]`.
 */
export function createMoroccanArchGeometry({
  outerW = 7.0,
  outerH = 5.6,
  innerW = 4.54,
  archSpringY = 3.25,
  archApexY = 4.95,
  depth = 1.94,
  curveSegments = 12,
  bevel = true,
  tile = 2.5,
  baseYOverride = null
} = {}) {
  const hw = outerW * 0.5;
  const ihw = innerW * 0.5;
  const shape = new THREE.Shape();

  const baseY = baseYOverride !== null ? baseYOverride : Math.max(0, archSpringY - 0.35);
  shape.moveTo(-hw, baseY);
  shape.lineTo(-hw, outerH);
  shape.lineTo(hw, outerH);
  shape.lineTo(hw, baseY);
  shape.lineTo(ihw, baseY);
  shape.lineTo(ihw, archSpringY);

  // Smooth Moroccan pointed-horseshoe inner arch curve peaking at (0, archApexY)
  const shoulderY = archSpringY + (archApexY - archSpringY) * 0.62;
  shape.quadraticCurveTo(ihw * 0.92, shoulderY, 0, archApexY);
  shape.quadraticCurveTo(-ihw * 0.92, shoulderY, -ihw, archSpringY);
  shape.lineTo(-ihw, baseY);
  shape.closePath();

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: bevel,
    bevelThickness: bevel ? 0.04 : 0,
    bevelSize: bevel ? 0.04 : 0,
    bevelSegments: bevel ? 2 : 1,
    curveSegments
  });
  geo.translate(0, 0, -depth * 0.5);
  geo.computeVertexNormals();
  applyPlanarMetricUVs(geo, tile, [0, 0]);
  return geo;
}

/**
 * Creates Moroccan CS2 Dust II architectural materials: sunlit stucco, carved sandstone, weathered stone/concrete
 * lower dado (`concrete_block_wall`), sidewalk curbs, weathered crate timber, chunky dark iron L-brackets,
 * teal-green louvered shutters, blue-green corrugated shop roll-up doors, outdoor AC cabinets, and market awnings.
 */
export function createDustArchitectureMaterials(game, plan, highDetail = true) {
  const makeTexturedMat = (fallbackHex, role, roughness, metalness, grimeRole = null) => {
    const spec = plan[role] || plan.wall;
    const mat = new THREE.MeshStandardMaterial({
      map: createObstacleTexture(game, fallbackHex, role === 'crate' ? 'crate' : 'wall'),
      roughness,
      metalness
    });
    if (grimeRole) {
      attachWorldMacroGrime(mat, { mapId: 'desert_outpost', role: grimeRole, enabled: highDetail });
    }
    game.arenaMaterials.add(mat);
    registerPbrSlot(game, mat, spec, resolveTint(spec, fallbackHex, role, 'desert_outpost'));
    return mat;
  };

  const sandstoneMat = makeTexturedMat(0xcbb99d, 'platform', 0.88, 0.02, 'platform');
  const stuccoMat = makeTexturedMat(0xdfd2bc, 'wall', 0.92, 0.02, 'wall');
  const stoneDadoMat = makeTexturedMat(0x7c7569, 'dado', 0.94, 0.02, 'dado');
  const timberDoorMat = makeTexturedMat(0xba9364, 'crate', 0.84, 0.04, null);

  const sandstoneTrimMat = new THREE.MeshStandardMaterial({
    map: createObstacleTexture(game, 0xd4c3a4, 'wall'),
    color: 0xdccbb0,
    roughness: 0.88,
    metalness: 0.02
  });
  const concreteCurbMat = new THREE.MeshStandardMaterial({
    map: createObstacleTexture(game, 0x9b9487, 'wall'),
    color: 0xa7a093,
    roughness: 0.93,
    metalness: 0.02
  });
  const cedarBeamMat = new THREE.MeshStandardMaterial({
    color: 0x523721,
    roughness: 0.88,
    metalness: 0.03
  });
  const crateIronBracketMat = new THREE.MeshStandardMaterial({
    color: 0x2b2622,
    roughness: 0.62,
    metalness: 0.55
  });
  const forgedIronMat = new THREE.MeshStandardMaterial({
    color: 0x24201c,
    roughness: 0.58,
    metalness: 0.48
  });
  const tealShutterMat = new THREE.MeshStandardMaterial({
    color: 0x2d6a54,
    roughness: 0.86,
    metalness: 0.03
  });
  const shopDoorBlueGreenMat = new THREE.MeshStandardMaterial({
    color: 0x365a62,
    roughness: 0.58,
    metalness: 0.42
  });
  const acUnitWhiteMat = new THREE.MeshStandardMaterial({
    color: 0xe3dfd5,
    roughness: 0.56,
    metalness: 0.22
  });
  const recessDarkMat = new THREE.MeshStandardMaterial({
    color: 0x16120e,
    roughness: 0.96,
    metalness: 0.0
  });
  const sandDriftMat = new THREE.MeshStandardMaterial({
    color: 0xd4bc91,
    roughness: 0.95,
    metalness: 0.0
  });
  const canopyTerracottaMat = new THREE.MeshStandardMaterial({
    color: 0xb65e3c,
    roughness: 0.88,
    metalness: 0.0
  });
  const canopyCreamMat = new THREE.MeshStandardMaterial({
    color: 0xe2cfb0,
    roughness: 0.88,
    metalness: 0.0
  });
  const domeCopperMat = new THREE.MeshStandardMaterial({
    color: 0x677968,
    roughness: 0.72,
    metalness: 0.16
  });

  for (const m of [
    sandstoneTrimMat,
    concreteCurbMat,
    cedarBeamMat,
    crateIronBracketMat,
    forgedIronMat,
    tealShutterMat,
    shopDoorBlueGreenMat,
    acUnitWhiteMat,
    recessDarkMat,
    sandDriftMat,
    canopyTerracottaMat,
    canopyCreamMat,
    domeCopperMat
  ]) {
    game.arenaMaterials.add(m);
  }

  return {
    sandstoneMat,
    sandstoneTrimMat,
    concreteCurbMat,
    stuccoMat,
    stoneDadoMat,
    timberDoorMat,
    cedarBeamMat,
    crateIronBracketMat,
    forgedIronMat,
    tealShutterMat,
    shopDoorBlueGreenMat,
    acUnitWhiteMat,
    recessDarkMat,
    sandDriftMat,
    canopyTerracottaMat,
    canopyCreamMat,
    domeCopperMat
  };
}

function isMidDoubleDoorWall(obs) {
  return Math.abs(Math.abs(obs.z) - 22) < 0.5 && Math.abs(Math.abs(obs.x) - 7) < 0.5;
}

/** Pushes a vertical-plank UV box (rotates horizontal wood texture 90deg on side faces) into `archMeshBatches`. */
function pushVerticalPlankBox(ctx, mat, role, x, y, z, w, h, d, rx = 0, ry = 0, rz = 0) {
  const geo = new THREE.BoxGeometry(w, h, d);
  const tile = (ctx.plan?.[role] || ctx.plan?.crate || { tile: 1.6 }).tile;
  applyVerticalPlankBoxUV1(geo, w, h, d, tile, uvOffsetFor(x, y, z));
  applyBoxWorldUVs(geo, w, h, d, 2.2);
  ctx.pushArchMesh(mat, geo, x, y, z, rx, ry, rz);
}

/**
 * Adds a CS2 Moroccan recessed dark-interior window with vertical wrought-iron bars, carved stone sill/lintel,
 * and weathered teal-green (`#2d6a54`) wooden louvered shutters hinged slightly outward.
 */
function addTealShutteredWindow(ctx, { cx, cy, cz, alongX, faceSign, width = 1.12, height = 1.52 }) {
  const { highDetail, dustMats, addDecorBox } = ctx;
  const shutterW = width * 0.48;
  const shutterH = height * 0.94;
  const hingeAngle = 0.34; // ~20 deg outward swing so shutters catch raking sun & cast crisp wall shadows

  if (alongX) {
    const fz = cz;
    // Carved stone frame (lintel, jambs, protruding sill) & deep dark recessed interior
    addDecorBox(cx, cy, fz + faceSign * 0.035, width + 0.24, height + 0.22, 0.08, dustMats.sandstoneTrimMat, true);
    addDecorBox(cx, cy, fz + faceSign * 0.068, width, height, 0.045, dustMats.recessDarkMat, false);
    addDecorBox(cx, cy + height * 0.5 + 0.11, fz + faceSign * 0.10, width + 0.34, 0.14, 0.20, dustMats.sandstoneTrimMat, true);
    addDecorBox(cx, cy - height * 0.5 - 0.09, fz + faceSign * 0.13, width + 0.38, 0.13, 0.26, dustMats.sandstoneTrimMat, true);

    // Vertical wrought-iron security bars inside window recess
    const barCount = highDetail ? 4 : 2;
    for (let b = 0; b < barCount; b++) {
      const bx = cx - width * 0.36 + (b / Math.max(1, barCount - 1)) * (width * 0.72);
      addDecorBox(bx, cy, fz + faceSign * 0.095, 0.032, height - 0.04, 0.032, dustMats.forgedIronMat, true);
    }
    if (highDetail) {
      addDecorBox(cx, cy, fz + faceSign * 0.098, width - 0.04, 0.03, 0.032, dustMats.forgedIronMat, true);
    }

    // Flanked weathered teal-green wooden louvered shutters hinged slightly outward
    for (const side of [-1, 1]) {
      const hingeX = cx + side * (width * 0.5 + 0.05);
      const yaw = side * faceSign * -hingeAngle;
      const sx = hingeX + side * (shutterW * 0.5) * Math.cos(hingeAngle);
      const sz = fz + faceSign * (0.09 + (shutterW * 0.5) * Math.sin(hingeAngle));
      addDecorBox(sx, cy, sz, shutterW, shutterH, 0.042, dustMats.tealShutterMat, true, 0, yaw, 0);
      if (highDetail) {
        // Raised shutter stiles & 4 louvered slats for authentic slatted depth
        const slatCount = 4;
        for (let s = 0; s < slatCount; s++) {
          const sy = cy - shutterH * 0.36 + (s / (slatCount - 1)) * (shutterH * 0.72);
          const lx = sx + Math.sin(yaw) * faceSign * 0.014;
          const lz = sz + Math.cos(yaw) * faceSign * 0.018;
          addDecorBox(lx, sy, lz, shutterW * 0.80, 0.065, 0.022, dustMats.recessDarkMat, false, faceSign * 0.25, yaw, 0);
        }
        addDecorBox(hingeX, cy + shutterH * 0.32, fz + faceSign * 0.095, 0.14, 0.04, 0.03, dustMats.forgedIronMat, false);
        addDecorBox(hingeX, cy - shutterH * 0.32, fz + faceSign * 0.095, 0.14, 0.04, 0.03, dustMats.forgedIronMat, false);
      }
    }
  } else {
    const fx = cx;
    addDecorBox(fx + faceSign * 0.035, cy, cz, 0.08, height + 0.22, width + 0.24, dustMats.sandstoneTrimMat, true);
    addDecorBox(fx + faceSign * 0.068, cy, cz, 0.045, height, width, dustMats.recessDarkMat, false);
    addDecorBox(fx + faceSign * 0.10, cy + height * 0.5 + 0.11, cz, 0.20, 0.14, width + 0.34, dustMats.sandstoneTrimMat, true);
    addDecorBox(fx + faceSign * 0.13, cy - height * 0.5 - 0.09, cz, 0.26, 0.13, width + 0.38, dustMats.sandstoneTrimMat, true);

    const barCount = highDetail ? 4 : 2;
    for (let b = 0; b < barCount; b++) {
      const bz = cz - width * 0.36 + (b / Math.max(1, barCount - 1)) * (width * 0.72);
      addDecorBox(fx + faceSign * 0.095, cy, bz, 0.032, height - 0.04, 0.032, dustMats.forgedIronMat, true);
    }
    if (highDetail) {
      addDecorBox(fx + faceSign * 0.098, cy, cz, 0.032, 0.03, width - 0.04, dustMats.forgedIronMat, true);
    }

    for (const side of [-1, 1]) {
      const hingeZ = cz + side * (width * 0.5 + 0.05);
      const yaw = side * faceSign * hingeAngle;
      const sz = hingeZ + side * (shutterW * 0.5) * Math.cos(hingeAngle);
      const sx = fx + faceSign * (0.09 + (shutterW * 0.5) * Math.sin(hingeAngle));
      addDecorBox(sx, cy, sz, 0.042, shutterH, shutterW, dustMats.tealShutterMat, true, 0, yaw, 0);
      if (highDetail) {
        const slatCount = 4;
        for (let s = 0; s < slatCount; s++) {
          const sy = cy - shutterH * 0.36 + (s / (slatCount - 1)) * (shutterH * 0.72);
          const lx = sx + Math.cos(yaw) * faceSign * 0.018;
          const lz = sz - Math.sin(yaw) * faceSign * 0.014;
          addDecorBox(lx, sy, lz, 0.022, 0.065, shutterW * 0.80, dustMats.recessDarkMat, false, 0, yaw, -faceSign * 0.25);
        }
        addDecorBox(fx + faceSign * 0.095, cy + shutterH * 0.32, hingeZ, 0.03, 0.04, 0.14, dustMats.forgedIronMat, false);
        addDecorBox(fx + faceSign * 0.095, cy - shutterH * 0.32, hingeZ, 0.03, 0.04, 0.14, dustMats.forgedIronMat, false);
      }
    }
  }
}

/**
 * Adds a wall-mounted white outdoor AC condenser unit with dark circular fan grille, horizontal louver side,
 * and twin dark-steel wall support brackets (always mounted above head height `y >= 2.65m`).
 */
function addOutdoorAcUnit(ctx, { cx, cy, cz, alongX, faceSign }) {
  const { highDetail, dustMats, addDecorBox, addDecorCyl } = ctx;
  if (!highDetail) return;

  const w = 0.84;
  const h = 0.56;
  const d = 0.34;
  if (alongX) {
    const unitZ = cz + faceSign * (d * 0.5 + 0.05);
    // Steel L-support brackets anchored into plaster
    for (const bxOff of [-0.30, 0.30]) {
      addDecorBox(cx + bxOff, cy - h * 0.5 - 0.03, cz + faceSign * (d * 0.5 + 0.03), 0.05, 0.05, d + 0.08, dustMats.forgedIronMat, true);
      addDecorBox(cx + bxOff, cy - h * 0.5 - 0.16, cz + faceSign * 0.04, 0.05, 0.30, 0.05, dustMats.forgedIronMat, true);
    }
    // White enameled sheet-metal condenser cabinet & top cover plate
    addDecorBox(cx, cy, unitZ, w, h, d, dustMats.acUnitWhiteMat, true);
    addDecorBox(cx, cy + h * 0.5 + 0.015, unitZ, w + 0.03, 0.03, d + 0.03, dustMats.forgedIronMat, false);
    // Dark recessed circular fan grille + guard crosshair on front face
    const frontZ = unitZ + faceSign * (d * 0.5 + 0.008);
    addDecorCyl(cx - 0.12, cy, frontZ, 0.21, 0.03, dustMats.recessDarkMat, 'z', false);
    addDecorBox(cx - 0.12, cy, frontZ + faceSign * 0.016, 0.42, 0.025, 0.015, dustMats.forgedIronMat, false);
    addDecorBox(cx - 0.12, cy, frontZ + faceSign * 0.016, 0.025, 0.42, 0.015, dustMats.forgedIronMat, false);
    // Side intake louver grille & insulated coolant conduit
    addDecorBox(cx + 0.25, cy, frontZ, 0.18, 0.36, 0.018, dustMats.forgedIronMat, false);
    addDecorCyl(cx + w * 0.5 + 0.04, cy - 0.22, cz + faceSign * 0.07, 0.025, 0.52, dustMats.forgedIronMat, 'y', false);
  } else {
    const unitX = cx + faceSign * (d * 0.5 + 0.05);
    for (const bzOff of [-0.30, 0.30]) {
      addDecorBox(cx + faceSign * (d * 0.5 + 0.03), cy - h * 0.5 - 0.03, cz + bzOff, d + 0.08, 0.05, 0.05, dustMats.forgedIronMat, true);
      addDecorBox(cx + faceSign * 0.04, cy - h * 0.5 - 0.16, cz + bzOff, 0.05, 0.30, 0.05, dustMats.forgedIronMat, true);
    }
    addDecorBox(unitX, cy, cz, d, h, w, dustMats.acUnitWhiteMat, true);
    addDecorBox(unitX, cy + h * 0.5 + 0.015, cz, d + 0.03, 0.03, w + 0.03, dustMats.forgedIronMat, false);
    const frontX = unitX + faceSign * (d * 0.5 + 0.008);
    addDecorCyl(frontX, cy, cz - 0.12, 0.21, 0.03, dustMats.recessDarkMat, 'x', false);
    addDecorBox(frontX + faceSign * 0.016, cy, cz - 0.12, 0.015, 0.025, 0.42, dustMats.forgedIronMat, false);
    addDecorBox(frontX + faceSign * 0.016, cy, cz - 0.12, 0.015, 0.42, 0.025, dustMats.forgedIronMat, false);
    addDecorBox(frontX, cy, cz + 0.25, 0.018, 0.36, 0.18, dustMats.forgedIronMat, false);
    addDecorCyl(cx + faceSign * 0.07, cy - 0.22, cz + w * 0.5 + 0.04, 0.025, 0.52, dustMats.forgedIronMat, 'y', false);
  }
}

/**
 * Adds a leaning weathered wooden ladder resting naturally against a courtyard or perimeter wall (`sk_awp.jpg`).
 */
function addLeaningWoodenLadder(ctx, { wx, wz, alongX, faceSign, baseY = 0, topY = 3.5 }) {
  const { highDetail, dustMats, addDecorBox } = ctx;
  if (!highDetail) return;

  const ladderH = Math.max(2.2, topY - baseY);
  const footOut = 0.68;
  const topOut = 0.09;
  const leanDx = footOut - topOut;
  const railLen = Math.hypot(ladderH, leanDx);
  const tilt = Math.atan2(leanDx, ladderH);
  const railSpan = 0.54;
  const rungCount = Math.max(6, Math.round(ladderH / 0.42));
  const midY = baseY + ladderH * 0.5;
  const midOut = (footOut + topOut) * 0.5;

  if (alongX) {
    // Wall runs along X, ladder leans out along faceSign * +Z
    const rx = -faceSign * tilt;
    for (const s of [-1, 1]) {
      addDecorBox(wx + s * (railSpan * 0.5), midY, wz + faceSign * midOut, 0.068, railLen, 0.052, dustMats.cedarBeamMat, true, rx, 0, 0);
    }
    for (let r = 1; r <= rungCount; r++) {
      const t = r / (rungCount + 1);
      const ry = baseY + t * ladderH;
      const out = footOut + (topOut - footOut) * t;
      addDecorBox(wx, ry, wz + faceSign * out, railSpan + 0.04, 0.042, 0.042, dustMats.cedarBeamMat, true);
    }
  } else {
    // Wall runs along Z, ladder leans out along faceSign * +X
    const rz = faceSign * tilt;
    for (const s of [-1, 1]) {
      addDecorBox(wx + faceSign * midOut, midY, wz + s * (railSpan * 0.5), 0.052, railLen, 0.068, dustMats.cedarBeamMat, true, 0, 0, rz);
    }
    for (let r = 1; r <= rungCount; r++) {
      const t = r / (rungCount + 1);
      const ry = baseY + t * ladderH;
      const out = footOut + (topOut - footOut) * t;
      addDecorBox(wx + faceSign * out, ry, wz, 0.042, 0.042, railSpan + 0.04, dustMats.cedarBeamMat, true);
    }
  }
}

/**
 * Adds an arched blue-green corrugated steel shop roll-up door (`#365a62`) set inside a recessed carved stone arch
 * (`sk_awp.jpg` right foreground), merging the arch ring into `archMeshBatches` for minimal draw calls.
 */
function addArchedShopRollupDoor(ctx, { cx, cz, alongX, faceSign, width = 2.35, height = 2.15, archGeo = null }) {
  const { highDetail, dustMats, pushArchMesh, addDecorBox } = ctx;
  const shutterH = height - 0.14;
  const archApexY = height + 0.62;
  const tympanumH = archApexY - height;

  if (alongX) {
    const fz = cz;
    if (archGeo) {
      pushArchMesh(dustMats.sandstoneMat, archGeo.clone(), cx, 0, fz + faceSign * 0.11, 0, 0, 0);
    }
    // Deep recessed dark arched tympanum + wooden lintel beam
    addDecorBox(cx, height + tympanumH * 0.44, fz + faceSign * 0.05, width * 0.94, tympanumH * 0.92, 0.06, dustMats.recessDarkMat, false);
    addDecorBox(cx, height - 0.05, fz + faceSign * 0.18, width + 0.52, 0.16, 0.24, dustMats.cedarBeamMat, true);

    // Blue-green corrugated steel roll-up shutter door panel + horizontal corrugated slats + lock rail
    addDecorBox(cx, shutterH * 0.5, fz + faceSign * 0.06, width, shutterH, 0.06, dustMats.shopDoorBlueGreenMat, true);
    if (highDetail) {
      const slats = 7;
      for (let s = 0; s < slats; s++) {
        const sy = 0.18 + (s / (slats - 1)) * (shutterH - 0.30);
        addDecorBox(cx, sy, fz + faceSign * 0.098, width - 0.08, 0.075, 0.026, dustMats.shopDoorBlueGreenMat, true);
      }
      addDecorBox(cx, 0.09, fz + faceSign * 0.105, width + 0.04, 0.08, 0.04, dustMats.forgedIronMat, true);
      addDecorBox(cx - 0.35, 0.45, fz + faceSign * 0.118, 0.20, 0.045, 0.045, dustMats.forgedIronMat, false);
      addDecorBox(cx + 0.35, 0.45, fz + faceSign * 0.118, 0.20, 0.045, 0.045, dustMats.forgedIronMat, false);
    }
  } else {
    const fx = cx;
    if (archGeo) {
      pushArchMesh(dustMats.sandstoneMat, archGeo.clone(), fx + faceSign * 0.11, 0, cz, 0, Math.PI * 0.5, 0);
    }
    addDecorBox(fx + faceSign * 0.05, height + tympanumH * 0.44, cz, 0.06, tympanumH * 0.92, width * 0.94, dustMats.recessDarkMat, false);
    addDecorBox(fx + faceSign * 0.18, height - 0.05, cz, 0.24, 0.16, width + 0.52, dustMats.cedarBeamMat, true);

    addDecorBox(fx + faceSign * 0.06, shutterH * 0.5, cz, 0.06, shutterH, width, dustMats.shopDoorBlueGreenMat, true);
    if (highDetail) {
      const slats = 7;
      for (let s = 0; s < slats; s++) {
        const sy = 0.18 + (s / (slats - 1)) * (shutterH - 0.30);
        addDecorBox(fx + faceSign * 0.098, sy, cz, 0.026, 0.075, width - 0.08, dustMats.shopDoorBlueGreenMat, true);
      }
      addDecorBox(fx + faceSign * 0.105, 0.09, cz, 0.04, 0.08, width + 0.04, dustMats.forgedIronMat, true);
      addDecorBox(fx + faceSign * 0.118, 0.45, cz - 0.35, 0.045, 0.045, 0.20, dustMats.forgedIronMat, false);
      addDecorBox(fx + faceSign * 0.118, 0.45, cz + 0.35, 0.045, 0.045, 0.20, dustMats.forgedIronMat, false);
    }
  }
}

/** Builds a Moroccan stucco + bold stone/concrete dado plinth (`0..1.15m`) + sidewalk curb wall (no steel H-beams). */
export function buildDustMoroccanWall(ctx, obs, mainMat) {
  const {
    halfSize,
    highDetail,
    dustMats,
    pushArchBox,
    pushArchFrustum,
    addDecorBox,
    addDecorSandbag
  } = ctx;
  const { x: cx, y: cy, z: cz, w: cw, h: ch, d: cd } = obs;
  const halfW = cw * 0.5;
  const halfH = ch * 0.5;
  const halfD = cd * 0.5;
  const topY = cy + halfH;
  const botY = cy - halfH;
  const isPerimeter = Math.max(cw, cd) > 80 || Math.max(cw, cd) >= halfSize * 1.8;

  if (isPerimeter) {
    const alongX = cw > cd;
    const upperH = highDetail ? 4.2 : 3.2;
    const upperY = topY + upperH * 0.5;
    const inward = alongX ? (cz > 0 ? -1 : 1) : cx > 0 ? -1 : 1;
    const dadoH = 1.15;

    // Lower stucco collision wall + upper Moroccan parapet extension
    pushArchBox(mainMat, 'wall', cx, cy, cz, cw, ch, cd);
    pushArchBox(dustMats.stuccoMat, 'wall', cx, upperY, cz, cw, upperH, cd);

    // Bold weathered stone/concrete lower dado plinth (`0..1.15m`) + dado cap rail + concrete sidewalk curb + mid frieze + top cornice
    if (alongX) {
      pushArchBox(dustMats.stoneDadoMat, 'dado', cx, dadoH * 0.5, cz + inward * 0.57, cw - 2.0, dadoH, 0.14);
      pushArchBox(dustMats.sandstoneMat, 'platform', cx, dadoH + 0.04, cz + inward * 0.59, cw - 1.9, 0.08, 0.18);
      pushArchBox(dustMats.concreteCurbMat, 'wall', cx, 0.075, cz + inward * 0.78, cw - 2.2, 0.15, 0.56);
      pushArchBox(dustMats.sandstoneMat, 'platform', cx, 4.6, cz + inward * 0.56, cw - 1.5, 0.24, 0.14);
      pushArchBox(dustMats.sandstoneMat, 'platform', cx, topY + upperH + 0.14, cz, cw + 0.3, 0.28, cd + 0.34);
    } else {
      pushArchBox(dustMats.stoneDadoMat, 'dado', cx + inward * 0.57, dadoH * 0.5, cz, 0.14, dadoH, cd - 2.0);
      pushArchBox(dustMats.sandstoneMat, 'platform', cx + inward * 0.59, dadoH + 0.04, cz, 0.18, 0.08, cd - 1.9);
      pushArchBox(dustMats.concreteCurbMat, 'wall', cx + inward * 0.78, 0.075, cz, 0.56, 0.15, cd - 2.2);
      pushArchBox(dustMats.sandstoneMat, 'platform', cx + inward * 0.56, 4.6, cz, 0.14, 0.24, cd - 1.5);
      pushArchBox(dustMats.sandstoneMat, 'platform', cx, topY + upperH + 0.14, cz, cw + 0.34, 0.28, cd + 0.3);
    }

    // Stepped Moroccan crenellated battlements + protruding cedar roof vigas beams (`castShadow = true`)
    const wallSpan = alongX ? cw : cd;
    const merlonStep = highDetail ? 5.0 : 10.0;
    const merlonY = topY + upperH + 0.60;
    for (let off = -wallSpan * 0.5 + 5; off <= wallSpan * 0.5 - 5; off += merlonStep) {
      if (alongX) {
        addDecorBox(cx + off, merlonY, cz, 2.2, 0.65, cd + 0.22, dustMats.sandstoneTrimMat, true);
        addDecorBox(cx + off, topY + upperH - 0.52, cz + inward * 0.68, 0.18, 0.18, 0.52, dustMats.cedarBeamMat, true);
        if (highDetail) {
          addDecorBox(cx + off, 8.45, cz + inward * 0.66, 0.18, 0.18, 0.48, dustMats.cedarBeamMat, true);
        }
      } else {
        addDecorBox(cx, merlonY, cz + off, cw + 0.22, 0.65, 2.2, dustMats.sandstoneTrimMat, true);
        addDecorBox(cx + inward * 0.68, topY + upperH - 0.52, cz + off, 0.52, 0.18, 0.18, dustMats.cedarBeamMat, true);
        if (highDetail) {
          addDecorBox(cx + inward * 0.66, 8.45, cz + off, 0.48, 0.18, 0.18, dustMats.cedarBeamMat, true);
        }
      }
    }

    // Elevated teal-green louvered shuttered & iron-barred Moroccan windows along perimeter frieze + AC units
    const nicheStep = highDetail ? 14 : 28;
    let idx = 0;
    for (let off = -wallSpan * 0.5 + 11; off <= wallSpan * 0.5 - 11; off += nicheStep) {
      idx++;
      if (alongX) {
        const innerZ = cz + inward * halfD;
        addTealShutteredWindow(ctx, { cx: cx + off, cy: 6.45, cz: innerZ, alongX: true, faceSign: inward, width: 1.18, height: 1.72 });
        if (highDetail && idx % 2 === 0 && Math.abs(off) < 46) {
          addOutdoorAcUnit(ctx, { cx: cx + off + 3.4, cy: 5.75, cz: innerZ, alongX: true, faceSign: inward });
        }
      } else {
        const innerX = cx + inward * halfW;
        addTealShutteredWindow(ctx, { cx: innerX, cy: 6.45, cz: cz + off, alongX: false, faceSign: inward, width: 1.18, height: 1.72 });
        if (highDetail && idx % 2 === 1 && Math.abs(off) < 46) {
          addOutdoorAcUnit(ctx, { cx: innerX, cy: 5.75, cz: cz + off + 3.4, alongX: false, faceSign: inward });
        }
      }
    }
    return;
  }

  const alongX = cw >= cd;
  if (ch < 2.2) {
    // Low Moroccan stone-dado & plaster garden parapet wall + concrete curb
    const lowDadoH = Math.min(0.62, ch * 0.45);
    pushArchBox(dustMats.concreteCurbMat, 'wall', cx, botY + 0.06, cz, cw + 0.20, 0.12, cd + 0.20);
    pushArchBox(dustMats.stoneDadoMat, 'dado', cx, botY + lowDadoH * 0.5, cz, cw + 0.08, lowDadoH, cd + 0.08);
    pushArchBox(mainMat, 'wall', cx, botY + lowDadoH + Math.max(0.2, ch - lowDadoH - 0.16) * 0.5, cz, cw, Math.max(0.2, ch - lowDadoH - 0.16), cd);
    pushArchFrustum(dustMats.sandstoneMat, 'platform', cx, topY - 0.08, cz, cw + 0.16, 0.16, cd + 0.16, cw + 0.04, cd + 0.04);
    return;
  }

  // Interior Moroccan stucco walls with bold weathered stone/concrete dado plinth (`0..1.15m`) + sidewalk curb
  const dadoH = Math.min(1.15, ch * 0.38);
  const copingH = 0.18;
  const shaftH = Math.max(0.4, ch - dadoH - copingH);

  // Special landmark: CS2 Mid Double Doors heavy timber + forged iron strap cladding (`z = ±22`)
  if (isMidDoubleDoorWall(obs)) {
    const gapSign = cx >= 0 ? -1 : 1; // points toward x = 0 sniper gap
    const doorW = 3.25;
    const doorX = cx + gapSign * (halfW - doorW * 0.5);
    const doorH = ch - 0.14;
    const doorCy = botY + doorH * 0.5;

    // Outer stucco half gets bold stone dado (`0..1.15m`) + curb while timber doors reach cleanly to floor
    const stuccoW = Math.max(1.0, cw - doorW);
    const stuccoX = cx - gapSign * (doorW * 0.5);
    pushArchBox(dustMats.concreteCurbMat, 'wall', stuccoX, botY + 0.065, cz, stuccoW + 0.04, 0.13, cd + 0.26);
    pushArchBox(dustMats.stoneDadoMat, 'dado', stuccoX, botY + dadoH * 0.5, cz, stuccoW + 0.04, dadoH, cd + 0.08);
    pushArchBox(dustMats.sandstoneMat, 'platform', stuccoX, botY + dadoH + 0.035, cz, stuccoW + 0.06, 0.07, cd + 0.14);
    pushArchBox(mainMat, 'wall', stuccoX, botY + dadoH + shaftH * 0.5, cz, stuccoW, shaftH, cd);
    // Core behind double doors
    pushArchBox(mainMat, 'wall', doorX, cy, cz, doorW, ch - copingH, cd);
    pushArchFrustum(dustMats.sandstoneMat, 'platform', cx, topY - copingH * 0.5, cz, cw, copingH, cd + 0.22, cw, cd + 0.08);

    for (const faceZ of [-1, 1]) {
      const fz = cz + faceZ * (halfD + 0.022);
      pushVerticalPlankBox(ctx, dustMats.timberDoorMat, 'crate', doorX, doorCy, fz, doorW, doorH, 0.045);
      // Forged iron door frame stiles & central meeting astragal
      addDecorBox(doorX, topY - 0.12, fz + faceZ * 0.02, doorW + 0.06, 0.14, 0.035, dustMats.forgedIronMat, true);
      addDecorBox(doorX + gapSign * (doorW * 0.5 - 0.07), doorCy, fz + faceZ * 0.02, 0.14, doorH, 0.04, dustMats.forgedIronMat, true);
      addDecorBox(doorX - gapSign * (doorW * 0.5 - 0.07), doorCy, fz + faceZ * 0.02, 0.14, doorH, 0.04, dustMats.forgedIronMat, true);
      // Diagonal timber cross brace + 3 forged iron strap hinges
      addDecorBox(
        doorX,
        doorCy,
        fz + faceZ * 0.024,
        doorW * 0.84,
        0.13,
        0.025,
        dustMats.cedarBeamMat,
        true,
        0,
        0,
        gapSign * 0.68
      );
      for (const hy of [-0.95, 0.05, 1.05]) {
        addDecorBox(
          doorX - gapSign * 0.36,
          doorCy + hy,
          fz + faceZ * 0.028,
          doorW * 0.62,
          0.09,
          0.024,
          dustMats.forgedIronMat,
          true
        );
      }
    }
    // Protruding cedar roof vigas over outer stucco wing (`castShadow = true`)
    if (highDetail) {
      const outerX = cx - gapSign * (halfW * 0.45);
      for (const vxOff of [-1.4, 0.0, 1.4]) {
        addDecorBox(outerX + vxOff, topY - 0.34, cz, 0.17, 0.17, cd + 0.48, dustMats.cedarBeamMat, true);
      }
    }
    return;
  }

  const dadoW = alongX ? cw + 0.02 : cw + 0.08;
  const dadoD = alongX ? cd + 0.08 : cd + 0.02;
  const capW = alongX ? cw + 0.04 : cw + 0.14;
  const capD = alongX ? cd + 0.14 : cd + 0.04;
  const curbW = alongX ? cw + 0.08 : cw + 0.28;
  const curbD = alongX ? cd + 0.28 : cd + 0.08;
  const copingW = alongX ? cw : cw + 0.22;
  const copingD = alongX ? cd + 0.22 : cd;
  const copingTopW = alongX ? cw : cw + 0.08;
  const copingTopD = alongX ? cd + 0.08 : cd;

  // Grounded concrete curb + bold stone/concrete lower dado (`0..1.15m`) + molded cap ledge + plaster shaft + coping
  pushArchBox(dustMats.concreteCurbMat, 'wall', cx, botY + 0.065, cz, curbW, 0.13, curbD);
  pushArchBox(dustMats.stoneDadoMat, 'dado', cx, botY + dadoH * 0.5, cz, dadoW, dadoH, dadoD);
  pushArchBox(dustMats.sandstoneMat, 'platform', cx, botY + dadoH + 0.035, cz, capW, 0.07, capD);
  pushArchBox(mainMat, 'wall', cx, botY + dadoH + shaftH * 0.5, cz, cw, shaftH, cd);
  pushArchFrustum(
    dustMats.sandstoneMat,
    'platform',
    cx,
    topY - copingH * 0.5,
    cz,
    copingW,
    copingH,
    copingD,
    copingTopW,
    copingTopD
  );

  // Protruding cedar roof vigas (`castShadow = true`) throwing crisp CS2 diagonal shadows onto plaster
  const wallSpan = alongX ? cw : cd;
  if (highDetail && wallSpan >= 4.0) {
    const beamCount = Math.max(2, Math.floor(wallSpan / 2.1));
    for (let b = 0; b < beamCount; b++) {
      const off = -wallSpan * 0.40 + (b / Math.max(1, beamCount - 1)) * (wallSpan * 0.80);
      if (alongX) {
        addDecorBox(cx + off, topY - 0.32, cz, 0.17, 0.17, cd + 0.48, dustMats.cedarBeamMat, true);
      } else {
        addDecorBox(cx, topY - 0.32, cz + off, cw + 0.48, 0.17, 0.17, dustMats.cedarBeamMat, true);
      }
    }
  }

  // Teal-green louvered shuttered & iron-barred windows in upper stucco zone (clear of center A/B decals & shop doors)
  if (wallSpan >= 6.0 && ch >= 3.0) {
    const winY = Math.min(topY - 0.80, botY + dadoH + 0.90);
    const winH = Math.min(1.16, Math.max(0.86, topY - (botY + dadoH) - 0.72));
    const isTunnelWall = !alongX && Math.abs(Math.abs(cx) - 18) < 0.5 && Math.abs(Math.abs(cz) - 9) < 0.5;
    const isSniperShield = alongX && Math.abs(cx) < 0.5 && Math.abs(Math.abs(cz) - 28) < 0.5;
    const inwardSign = alongX ? (cz >= 0 ? -1 : 1) : cx >= 0 ? -1 : 1;

    if (isSniperShield) {
      // Rear face gets a central teal-shuttered window while front Mid-facing bay stays clear for ladder + poster
      addTealShutteredWindow(ctx, {
        cx,
        cy: winY,
        cz: cz - inwardSign * halfD,
        alongX: true,
        faceSign: -inwardSign,
        width: 1.02,
        height: winH
      });
    } else if (isTunnelWall) {
      // Near-arch end gets twin-face teal-shuttered windows while outer end stays clear for shop door & ladder
      const archSideSign = cz >= 0 ? -1 : 1;
      const winZ = cz + archSideSign * 2.8;
      for (const fSign of highDetail ? [inwardSign, -inwardSign] : [inwardSign]) {
        addTealShutteredWindow(ctx, {
          cx: cx + fSign * halfW,
          cy: winY,
          cz: winZ,
          alongX: false,
          faceSign: fSign,
          width: 0.98,
          height: winH
        });
      }
    } else {
      const winOffsets = highDetail ? [-wallSpan * 0.28, wallSpan * 0.28] : [wallSpan * 0.28];
      for (let wIdx = 0; wIdx < winOffsets.length; wIdx++) {
        const nOff = winOffsets[wIdx];
        if (alongX) {
          addTealShutteredWindow(ctx, {
            cx: cx + nOff,
            cy: winY,
            cz: cz + inwardSign * halfD,
            alongX: true,
            faceSign: inwardSign,
            width: 0.94,
            height: winH
          });
        } else {
          addTealShutteredWindow(ctx, {
            cx: cx + inwardSign * halfW,
            cy: winY,
            cz: cz + nOff,
            alongX: false,
            faceSign: inwardSign,
            width: 0.94,
            height: winH
          });
        }
      }
    }
  }

  // Sandbag positions tucked against Mid sniper shields & Long-A / B-Car wall curbs
  if (wallSpan >= 6.2 && ch <= 3.3) {
    const bagCount = highDetail ? 4 : 2;
    for (let b = 0; b < bagCount; b++) {
      const boff = -((bagCount - 1) * 0.5) * 1.1 + b * 1.1;
      const jitter = (b % 2 === 0 ? 1 : -1) * 0.04;
      if (alongX) {
        addDecorSandbag(cx + boff, botY + 0.18, cz + halfD + 0.24, true, 0.84, jitter);
      } else {
        addDecorSandbag(cx + halfW + 0.24, botY + 0.18, cz + boff, false, 0.84, jitter);
      }
    }
  }
}

/** Builds carved Moroccan sandstone obelisks / courtyard pillars (zero sci-fi radar dishes). */
export function buildDustSandstonePillar(ctx, obs, mainMat) {
  const { highDetail, dustMats, pushArchBox, pushArchFrustum, addDecorBox } = ctx;
  const { x: cx, y: cy, z: cz, w: cw, h: ch, d: cd } = obs;
  const halfH = ch * 0.5;
  const topY = cy + halfH;
  const botY = cy - halfH;
  const dadoH = Math.min(1.05, ch * 0.25);

  pushArchFrustum(dustMats.stoneDadoMat, 'dado', cx, botY + dadoH * 0.5, cz, cw + 0.42, dadoH, cd + 0.42, cw + 0.10, cd + 0.10);
  pushArchBox(mainMat, 'pillar', cx, botY + dadoH + Math.max(0.4, ch - dadoH - 0.44) * 0.5, cz, cw - 0.06, Math.max(0.4, ch - dadoH - 0.44), cd - 0.06);
  pushArchFrustum(dustMats.sandstoneMat, 'pillar', cx, topY - 0.22, cz, cw + 0.06, 0.44, cd + 0.06, cw + 0.34, cd + 0.34);

  // Dark cedar trim band & recessed Moroccan blind-arch niche panels
  addDecorBox(cx, topY - 0.52, cz, cw + 0.08, 0.16, cd + 0.08, dustMats.cedarBeamMat, true);
  if (highDetail) {
    addDecorBox(cx, cy + 0.25, cz, cw + 0.04, ch * 0.44, cd * 0.48, dustMats.recessDarkMat, false);
    addDecorBox(cx, cy + 0.25, cz, cw * 0.48, ch * 0.44, cd + 0.04, dustMats.recessDarkMat, false);
  }

  // Carved sandstone stepped pyramidion / courtyard minaret cap above topY
  pushArchBox(dustMats.sandstoneMat, 'pillar', cx, topY + 0.32, cz, cw * 0.78, 0.64, cd * 0.78);
  pushArchFrustum(dustMats.sandstoneMat, 'pillar', cx, topY + 1.04, cz, cw * 0.62, 0.80, cd * 0.62, cw * 0.16, cd * 0.16);
}

/** Builds solid Moroccan sandstone terrace platforms matching the solid AABB collider with bold `0..1.15m` stone dado. */
export function buildDustTerracePlatform(ctx, obs, mainMat) {
  const { highDetail, dustMats, pushArchBox, addDecorBox } = ctx;
  const { x: cx, y: cy, z: cz, w: cw, h: ch, d: cd } = obs;
  const halfW = cw * 0.5;
  const halfH = ch * 0.5;
  const halfD = cd * 0.5;
  const topY = cy + halfH;
  const botY = cy - halfH;

  const deckThick = 0.28;
  const dadoH = Math.min(1.15, Math.max(0.55, ch * 0.48));
  const bodyH = Math.max(0.25, ch - deckThick - dadoH);

  // Concrete base curb + bold stone/concrete lower dado (`0..1.15m`) + stucco masonry upper + sandstone deck slab flush with topY
  pushArchBox(dustMats.concreteCurbMat, 'wall', cx, botY + 0.065, cz, cw + 0.28, 0.13, cd + 0.28);
  pushArchBox(dustMats.stoneDadoMat, 'dado', cx, botY + dadoH * 0.5, cz, cw + 0.08, dadoH, cd + 0.08);
  pushArchBox(dustMats.sandstoneMat, 'platform', cx, botY + dadoH + 0.035, cz, cw + 0.14, 0.07, cd + 0.14);
  pushArchBox(dustMats.stuccoMat, 'wall', cx, botY + dadoH + bodyH * 0.5, cz, cw - 0.10, bodyH, cd - 0.10);
  pushArchBox(mainMat, 'platform', cx, topY - deckThick * 0.5, cz, cw, deckThick, cd);

  // Molded sandstone cornice lip around top deck perimeter (`castShadow = true`)
  addDecorBox(cx, topY - 0.14, cz - halfD, cw + 0.18, 0.24, 0.18, dustMats.sandstoneTrimMat, true);
  addDecorBox(cx, topY - 0.14, cz + halfD, cw + 0.18, 0.24, 0.18, dustMats.sandstoneTrimMat, true);
  addDecorBox(cx - halfW, topY - 0.14, cz, 0.18, 0.24, cd + 0.18, dustMats.sandstoneTrimMat, true);
  addDecorBox(cx + halfW, topY - 0.14, cz, 0.18, 0.24, cd + 0.18, dustMats.sandstoneTrimMat, true);

  // Corner masonry pilasters + recessed arched colonnade shadow panels
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      addDecorBox(cx + sx * (halfW - 0.22), cy, cz + sz * (halfD - 0.22), 0.56, ch - 0.04, 0.56, dustMats.sandstoneTrimMat, true);
    }
  }
  if (highDetail) {
    const panelY = botY + dadoH + bodyH * 0.5;
    for (const side of [-1, 1]) {
      addDecorBox(cx, panelY, cz + side * (halfD - 0.03), Math.max(2.0, cw - 2.4), Math.max(0.32, bodyH * 0.62), 0.06, dustMats.recessDarkMat, false);
      addDecorBox(cx + side * (halfW - 0.03), panelY, cz, 0.06, Math.max(0.32, bodyH * 0.62), Math.max(2.0, cd - 2.4), dustMats.recessDarkMat, false);
    }
  }
}

/** Builds solid carved Moroccan sandstone masonry stair steps with crisp shadow-casting treads & stone risers. */
export function buildDustSandstoneStep(ctx, obs, mainMat) {
  const { dustMats, pushArchBox, addDecorBox } = ctx;
  const { x: cx, y: cy, z: cz, w: cw, h: ch, d: cd } = obs;
  const topY = cy + ch * 0.5;
  const treadH = Math.min(0.14, ch * 0.45);
  const riserH = Math.max(0.05, ch - treadH);

  // Solid weathered stone riser body + overhanging carved sandstone tread slab (`castShadow = true`)
  pushArchBox(dustMats.stoneDadoMat, 'dado', cx, cy - treadH * 0.5, cz, cw - 0.05, riserH, cd - 0.05);
  pushArchBox(mainMat, 'step', cx, topY - treadH * 0.5, cz, cw, treadH, cd);
  if (cw >= cd) {
    addDecorBox(cx, topY - 0.03, cz - cd * 0.5, cw + 0.05, 0.065, 0.09, dustMats.sandstoneTrimMat, true);
    addDecorBox(cx, topY - 0.03, cz + cd * 0.5, cw + 0.05, 0.065, 0.09, dustMats.sandstoneTrimMat, true);
  } else {
    addDecorBox(cx - cw * 0.5, topY - 0.03, cz, 0.09, 0.065, cd + 0.05, dustMats.sandstoneTrimMat, true);
    addDecorBox(cx + cw * 0.5, topY - 0.03, cz, 0.09, 0.065, cd + 0.05, dustMats.sandstoneTrimMat, true);
  }
}

/**
 * Adds chunky dark iron corner L-brackets (`#2b2622`, metalness 0.55, roughness 0.62) wrapping all 8 corners
 * of a CS2 Dust II wooden bombsite crate (`sk_shot1.jpg`).
 */
function addCrateIronCornerLBrackets(ctx, cx, botY, topY, cz, cw, cd, highDetail) {
  const { dustMats, addDecorBox } = ctx;
  const halfW = cw * 0.5;
  const halfD = cd * 0.5;
  const h = topY - botY;
  const arm = Math.min(0.22, cw * 0.16, cd * 0.16, h * 0.18);
  const band = Math.min(0.11, arm * 0.62);
  const thick = 0.028;

  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      for (const sy of [-1, 1]) {
        const yEdge = sy > 0 ? topY : botY;
        const xCorner = cx + sx * (halfW + 0.008);
        const zCorner = cz + sz * (halfD + 0.008);

        if (!highDetail) {
          // Compact single-block corner iron cap on Low tier to keep low < high triangle budget
          addDecorBox(
            cx + sx * (halfW - arm * 0.35),
            yEdge - sy * (arm * 0.35),
            cz + sz * (halfD - arm * 0.35),
            arm * 0.85,
            arm * 0.85,
            arm * 0.85,
            dustMats.crateIronBracketMat,
            true
          );
          continue;
        }

        // Chunky 3-arm dark iron L-bracket wrapping X, Y, and Z corner edges (matches `sk_shot1.jpg`)
        // 1. Horizontal arm along X on ±Z face
        addDecorBox(
          cx + sx * (halfW - arm * 0.5 + 0.012),
          yEdge - sy * (band * 0.5 - 0.004),
          zCorner,
          arm + 0.012,
          band,
          thick,
          dustMats.crateIronBracketMat,
          true
        );
        // 2. Horizontal arm along Z on ±X face
        addDecorBox(
          xCorner,
          yEdge - sy * (band * 0.5 - 0.004),
          cz + sz * (halfD - arm * 0.5 + 0.012),
          thick,
          band,
          arm + 0.012,
          dustMats.crateIronBracketMat,
          true
        );
        // 3. Vertical corner clasp + top/bottom corner cap lip
        addDecorBox(
          cx + sx * (halfW - band * 0.5 + 0.012),
          yEdge - sy * (arm * 0.5 - 0.004),
          cz + sz * (halfD - band * 0.5 + 0.012),
          band + 0.018,
          arm,
          band + 0.018,
          dustMats.crateIronBracketMat,
          true
        );
      }
    }
  }
}

/**
 * Builds iconic CS2 Dust II stacked vertical-plank wooden bombsite crates (`weathered_brown_planks`)
 * framed by recessed top timber rims and chunky dark iron corner L-brackets (`sk_shot1.jpg`).
 */
export function buildDustTimberCrate(ctx, obs, mainMat) {
  const { highDetail, dustMats, saltlineMats, addDecorBox } = ctx;
  const { x: cx, y: cy, z: cz, w: cw, h: ch, d: cd } = obs;
  const halfW = cw * 0.5;
  const halfH = ch * 0.5;
  const halfD = cd * 0.5;
  const topY = cy + halfH;
  const botY = cy - halfH;

  // Low narrow crouch barricades (h <= 1.38 or narrow thickness): vertical plank bunker board + iron L-brackets
  if (cw < 0.9 || cd < 0.9) {
    pushVerticalPlankBox(ctx, mainMat, 'crate', cx, cy, cz, cw - 0.03, ch - 0.04, cd - 0.03);
    addDecorBox(cx, topY - 0.05, cz, cw + 0.02, 0.10, cd + 0.02, dustMats.cedarBeamMat, true);
    addDecorBox(cx, botY + 0.05, cz, cw + 0.02, 0.10, cd + 0.02, dustMats.cedarBeamMat, true);
    addCrateIronCornerLBrackets(ctx, cx, botY, topY, cz, cw, cd, highDetail);
    return;
  }

  // Standard Dust II stacked vertical-plank wooden bombsite crate (`sk_shot1.jpg`)
  const skidH = 0.08;
  for (const rxOff of [-0.36, 0.36]) {
    addDecorBox(cx + cw * rxOff, botY + skidH * 0.5, cz, Math.min(0.16, cw * 0.14), skidH, cd * 0.94, saltlineMats.palletTimberMat, true);
  }

  const crateBotY = botY + skidH;
  const crateH = Math.max(0.35, ch - skidH);
  const topRecess = 0.065;
  const coreH = Math.max(0.26, crateH - topRecess);
  const coreCy = crateBotY + coreH * 0.5;

  // Recessed vertical-plank inner wooden core (top sits `topRecess` below outer top rim -> genuine recessed top tray!)
  pushVerticalPlankBox(ctx, mainMat, 'crate', cx, coreCy, cz, cw - 0.10, coreH, cd - 0.10);

  // Outer perimeter timber frame rails (top 4 rails sit flush at `topY` creating recessed top frame!)
  const frameT = Math.min(0.115, cw * 0.085, cd * 0.085);
  const topRailY = topY - frameT * 0.5;
  const botRailY = crateBotY + frameT * 0.5;
  for (const fy of [botRailY, topRailY]) {
    pushVerticalPlankBox(ctx, mainMat, 'crate', cx, fy, cz - halfD + frameT * 0.5, cw, frameT, frameT);
    pushVerticalPlankBox(ctx, mainMat, 'crate', cx, fy, cz + halfD - frameT * 0.5, cw, frameT, frameT);
    pushVerticalPlankBox(ctx, mainMat, 'crate', cx - halfW + frameT * 0.5, fy, cz, frameT, frameT, Math.max(0.16, cd - frameT * 2));
    pushVerticalPlankBox(ctx, mainMat, 'crate', cx + halfW - frameT * 0.5, fy, cz, frameT, frameT, Math.max(0.16, cd - frameT * 2));
  }

  // 4 Outer vertical corner timber stiles
  const stileH = Math.max(0.16, crateH - frameT * 2);
  const stileCy = crateBotY + crateH * 0.5;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      pushVerticalPlankBox(
        ctx,
        mainMat,
        'crate',
        cx + sx * (halfW - frameT * 0.5),
        stileCy,
        cz + sz * (halfD - frameT * 0.5),
        frameT,
        stileH,
        frameT
      );
    }
  }

  // Subtle recessed dark interior top-lid shadow batten + stacked mid-batten on tall bombsite crates (`ch >= 1.75`)
  if (highDetail) {
    addDecorBox(cx, topY - topRecess + 0.008, cz, Math.max(0.2, cw - frameT * 2.1), 0.016, 0.06, dustMats.cedarBeamMat, false);
    if (ch >= 1.75) {
      const midY = crateBotY + crateH * 0.5;
      addDecorBox(cx, midY, cz - halfD + 0.032, cw - frameT * 1.8, 0.07, 0.035, dustMats.cedarBeamMat, true);
      addDecorBox(cx, midY, cz + halfD - 0.032, cw - frameT * 1.8, 0.07, 0.035, dustMats.cedarBeamMat, true);
      addDecorBox(cx - halfW + 0.032, midY, cz, 0.035, 0.07, cd - frameT * 1.8, dustMats.cedarBeamMat, true);
      addDecorBox(cx + halfW - 0.032, midY, cz, 0.035, 0.07, cd - frameT * 1.8, dustMats.cedarBeamMat, true);
    }
  }

  // Iconic CS2 chunky dark iron corner L-brackets at all 8 corners (`#2b2622`, metalness 0.55, roughness 0.62)
  addCrateIronCornerLBrackets(ctx, cx, crateBotY, topY, cz, cw, cd, highDetail);
}

/**
 * Adds Dust II Moroccan architectural shells & authentic CS2 street-level craftsmanship:
 * - Sculpted `ExtrudeGeometry` archways over Mid Doors / B-Tunnel / Short-A
 * - Arched blue-green corrugated steel shop roll-up doors (`#365a62`)
 * - Wall-mounted outdoor AC condenser units & leaning weathered wooden ladders
 * - Moroccan corner bastion watchtowers, quadrant cedar market canopies (`castShadow = true`),
 *   and sloped perimeter sand drifts.
 */
export function buildDustArchitectureAccents(ctx) {
  const {
    game,
    halfSize,
    highDetail,
    dustMats,
    pushArchMesh,
    pushArchBox,
    addDecorBox,
    addDecorCyl
  } = ctx;

  // 1. Sculpted Moroccan Sandstone Archways (ExtrudeGeometry) ABOVE walkway clearance
  const midArchGeo = createMoroccanArchGeometry({
    outerW: 7.0,
    outerH: 5.65,
    innerW: 4.54,
    archSpringY: 3.22,
    archApexY: 4.92,
    depth: 1.94,
    curveSegments: highDetail ? 12 : 6,
    bevel: highDetail,
    tile: 2.5
  });
  const tunnelArchGeo = createMoroccanArchGeometry({
    outerW: 10.4,
    outerH: 6.55,
    innerW: 8.04,
    archSpringY: 3.55,
    archApexY: 5.85,
    depth: 2.34,
    curveSegments: highDetail ? 12 : 6,
    bevel: highDetail,
    tile: 2.5
  });

  // North & South Mid Double Doors Arches (z = ±22)
  for (const sz of [-1, 1]) {
    const az = sz * 22;
    pushArchMesh(dustMats.sandstoneMat, midArchGeo.clone(), 0, 0, az, 0, 0, 0);
    pushArchBox(dustMats.sandstoneMat, 'platform', 0, 5.78, az, 7.36, 0.24, 2.18);
    if (highDetail) {
      for (const vx of [-2.4, -0.8, 0.8, 2.4]) {
        addDecorBox(vx, 5.36, az, 0.17, 0.17, 2.42, dustMats.cedarBeamMat, true);
      }
    }
  }
  midArchGeo.dispose();

  // West B-Tunnel Entrance Arch (x = -18) & East Short-A Archway (x = +18)
  for (const sx of [-1, 1]) {
    const ax = sx * 18;
    pushArchMesh(dustMats.sandstoneMat, tunnelArchGeo.clone(), ax, 0, 0, 0, Math.PI * 0.5, 0);
    pushArchBox(dustMats.sandstoneMat, 'platform', ax, 6.68, 0, 2.58, 0.26, 10.76);
    if (highDetail) {
      for (const vz of [-3.6, -1.2, 1.2, 3.6]) {
        addDecorBox(ax, 6.24, vz, 2.82, 0.17, 0.17, dustMats.cedarBeamMat, true);
      }
    }
  }
  tunnelArchGeo.dispose();

  // 2. Arched Blue-Green Corrugated Steel Shop Roll-Up Doors (`#365a62`) inside carved recessed stone arches
  const shopArchGeo = createMoroccanArchGeometry({
    outerW: 2.95,
    outerH: 3.05,
    innerW: 2.35,
    archSpringY: 2.02,
    archApexY: 2.74,
    depth: 0.22,
    curveSegments: highDetail ? 10 : 5,
    bevel: highDetail,
    tile: 2.2,
    baseYOverride: 0
  });
  const shopDoorPlacements = [
    // Perimeter street facades (clear of spawns at ±54 and cars at ±59.4, ±14)
    { cx: -24, cz: -halfSize, alongX: true, faceSign: 1 },
    { cx: 24, cz: -halfSize, alongX: true, faceSign: 1 },
    { cx: -24, cz: halfSize, alongX: true, faceSign: -1 },
    { cx: 24, cz: halfSize, alongX: true, faceSign: -1 },
    { cx: -halfSize, cz: -34, alongX: false, faceSign: 1 },
    { cx: halfSize, cz: 34, alongX: false, faceSign: -1 },
    // Courtyard-facing B-Tunnel & Short-A archway flanks (outer end of ±18, ±9 walls — clear of windows & A/B decals!)
    { cx: 16.9, cz: -11.9, alongX: false, faceSign: -1 },
    { cx: -16.9, cz: 11.9, alongX: false, faceSign: 1 }
  ];
  const shopLoopEnd = highDetail ? shopDoorPlacements.length : 4;
  for (let i = 0; i < shopLoopEnd; i++) {
    addArchedShopRollupDoor(ctx, { ...shopDoorPlacements[i], width: 2.35, height: 2.15, archGeo: shopArchGeo });
  }
  shopArchGeo.dispose();

  // 3. Wall-Mounted Outdoor AC Condenser Units & Leaning Weathered Wooden Ladders (`Medium/High`)
  if (highDetail) {
    // Interior courtyard AC units mounted cleanly above head height (`y >= 2.52m`, clear of windows & decals!)
    const acPlacements = [
      { cx: -10.2, cy: 2.56, cz: -21.1, alongX: true, faceSign: 1 },
      { cx: 10.2, cy: 2.56, cz: 21.1, alongX: true, faceSign: -1 },
      { cx: -19.1, cy: 2.74, cz: -12.0, alongX: false, faceSign: -1 },
      { cx: 19.1, cy: 2.74, cz: 12.0, alongX: false, faceSign: 1 },
      { cx: 48.2, cy: 2.52, cz: -14.9, alongX: true, faceSign: -1 },
      { cx: -48.2, cy: 2.52, cz: 14.9, alongX: true, faceSign: 1 }
    ];
    for (let i = 0; i < acPlacements.length; i++) {
      addOutdoorAcUnit(ctx, acPlacements[i]);
    }

    // Leaning weathered wooden ladders resting naturally against courtyard & perimeter walls (clear of windows/lanes/spawns)
    const ladderPlacements = [
      { wx: 2.2, wz: -27.0, alongX: true, faceSign: 1, baseY: 0, topY: 3.15 },
      { wx: -2.2, wz: 27.0, alongX: true, faceSign: -1, baseY: 0, topY: 3.15 },
      { wx: -16.9, wz: -12.4, alongX: false, faceSign: 1, baseY: 0, topY: 3.55 },
      { wx: 16.9, wz: 12.4, alongX: false, faceSign: -1, baseY: 0, topY: 3.55 },
      { wx: halfSize, wz: -28.0, alongX: false, faceSign: -1, baseY: 0, topY: 4.35 },
      { wx: -halfSize, wz: 28.0, alongX: false, faceSign: 1, baseY: 0, topY: 4.35 }
    ];
    for (let i = 0; i < ladderPlacements.length; i++) {
      addLeaningWoodenLadder(ctx, ladderPlacements[i]);
    }

    // Perimeter wooden street-side market awning frames (like `sk_awp.jpg` left foreground!)
    for (const side of [-1, 1]) {
      const fz = side * halfSize;
      const inward = -side;
      const ax = side * 38;
      // Two cedar posts + sloped wooden lean-to beam + market shade cloth (`castShadow = true`)
      addDecorBox(ax - 3.0, 1.55, fz + inward * 1.65, 0.14, 3.1, 0.14, dustMats.cedarBeamMat, true);
      addDecorBox(ax + 3.0, 1.55, fz + inward * 1.65, 0.14, 3.1, 0.14, dustMats.cedarBeamMat, true);
      addDecorBox(ax, 3.10, fz + inward * 1.65, 6.2, 0.14, 0.14, dustMats.cedarBeamMat, true);
      addDecorBox(ax, 3.24, fz + inward * 0.90, 6.1, 0.06, 1.75, dustMats.canopyTerracottaMat, true, inward * 0.18, 0, 0);
    }
  }

  // 4. 4 Moroccan Sandstone & Stucco Corner Bastion Watchtowers (replaces steel Saltline towers)
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const bx = sx * (halfSize - 0.2);
      const bz = sz * (halfSize - 0.2);
      pushArchBox(dustMats.stoneDadoMat, 'dado', bx, 0.575, bz, 6.0, 1.15, 6.0);
      pushArchBox(dustMats.stuccoMat, 'wall', bx, 11.075, bz, 5.6, 19.85, 5.6);
      pushArchBox(dustMats.sandstoneMat, 'platform', bx, 14.5, bz, 5.9, 0.34, 5.9);
      pushArchBox(dustMats.sandstoneMat, 'platform', bx, 20.6, bz, 6.4, 0.65, 6.4);
      pushArchBox(dustMats.sandstoneMat, 'platform', bx, 21.5, bz, 5.8, 1.2, 5.8);
      addDecorBox(bx, 18.8, bz, 6.1, 0.22, 6.1, dustMats.cedarBeamMat, true);
      if (highDetail) {
        addDecorCyl(bx, 22.7, bz, 1.95, 1.4, dustMats.domeCopperMat, 'y', true);
        addDecorCyl(bx, 23.8, bz, 0.12, 1.2, dustMats.forgedIronMat, 'y', true);
      }
    }
  }

  // 5. 4 Quadrant Dust II Cedar Pergola Market Canopies over A-Goose / B-Site / B-Window / A-Ramp (`castShadow = true`)
  for (const qx of [-36, 36]) {
    for (const qz of [-34, 34]) {
      for (const px of [-5.65, 5.65]) {
        for (const pz of [-5.65, 5.65]) {
          addDecorBox(qx + px, 3.45, qz + pz, 0.36, 6.9, 0.36, dustMats.sandstoneTrimMat, true);
        }
      }
      // Cedar pergola tie beams & striped market shade cloth roof (casts rich courtyard shadows!)
      addDecorBox(qx, 6.82, qz - 5.65, 11.7, 0.26, 0.26, dustMats.cedarBeamMat, true);
      addDecorBox(qx, 6.82, qz + 5.65, 11.7, 0.26, 0.26, dustMats.cedarBeamMat, true);
      addDecorBox(qx - 5.65, 6.82, qz, 0.26, 0.26, 11.7, dustMats.cedarBeamMat, true);
      addDecorBox(qx + 5.65, 6.82, qz, 0.26, 0.26, 11.7, dustMats.cedarBeamMat, true);
      if (highDetail) {
        for (let s = -2; s <= 2; s++) {
          const mat = (s + 2) % 2 === 0 ? dustMats.canopyTerracottaMat : dustMats.canopyCreamMat;
          addDecorBox(qx + s * 2.2, 6.96, qz, 2.05, 0.08, 11.1, mat, true);
        }
      } else {
        addDecorBox(qx, 6.96, qz, 11.1, 0.08, 11.1, dustMats.canopyCreamMat, false);
      }
    }
  }

  // 6. Gentle Windblown Desert Sand Drifts tucked into perimeter wall corners & edges
  const pushDrift = (x, y, z, bw, h, bd, tw, td, ry = 0) => {
    const geo = createTrapezoidPrismGeometry(bw, h, bd, tw, td, 2.0, uvOffsetFor(x, y, z));
    pushArchMesh(dustMats.sandDriftMat, geo, x, y, z, 0, ry, 0);
  };

  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      pushDrift(sx * (halfSize - 2.6), 0.16, sz * (halfSize - 2.6), 5.2, 0.32, 5.2, 0.6, 0.6, 0);
    }
  }
  if (highDetail) {
    for (const side of [-1, 1]) {
      for (const off of [-34, 34]) {
        pushDrift(off, 0.10, side * (halfSize - 0.85), 8.5, 0.20, 1.3, 6.8, 0.2, 0);
        pushDrift(side * (halfSize - 0.85), 0.10, off, 1.3, 0.20, 8.5, 0.2, 6.8, 0);
      }
    }
  }

  void game;
}

// ------------------------------------------------------------------ Real MIT CS2 Decal Atlases (grime, posters, graffiti)

/**
 * Returns `[u0, v0, u1, v1]` for a 2x2 quadrant (`0`=top-left, `1`=top-right, `2`=bottom-left, `3`=bottom-right)
 * with inset padding to prevent mipmap bleed across quadrants (Three.js `flipY = true`: v=1 is image top).
 */
export function getDustMitDecalUVRect(quadrant = 0, pad = 0.016) {
  const q = ((Number(quadrant) | 0) % 4 + 4) % 4;
  const col = q % 2;
  const rowFromTop = Math.floor(q / 2);
  const u0 = col * 0.5 + pad;
  const u1 = (col + 1) * 0.5 - pad;
  const v0 = (1 - rowFromTop) * 0.5 + pad;
  const v1 = (2 - rowFromTop) * 0.5 - pad;
  return [u0, v0, u1, v1];
}

function buildMergedDecalBufferGeometry(quads) {
  if (!quads.length) return null;
  const vCount = quads.length * 4;
  const positions = new Float32Array(vCount * 3);
  const normals = new Float32Array(vCount * 3);
  const uvs = new Float32Array(vCount * 2);
  const indices = new Uint32Array(quads.length * 6);

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

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geo.setIndex(new THREE.BufferAttribute(indices, 1));
  geo.computeBoundingSphere();
  return geo;
}

/**
 * Pure geometry builder for Dust II MIT decal planes (`grime`, `posters`, `graffiti`) so UV rects,
 * flush wall placement, and zero-burial guarantees can be verified headlessly in Node and rendered in WebGL.
 */
export function buildDustMitDecalGeometries(mapCfg = {}, halfSize = 62, highDetail = true) {
  const grimeQuads = [];
  const posterQuads = [];
  const graffitiQuads = [];

  const pushVertical = (list, cx, cy, cz, nx, nz, width, height, quadrant) => {
    const rx = -nz;
    const rz = nx;
    const hw = width * 0.5;
    const hh = height * 0.5;
    const [u0, v0, u1, v1] = getDustMitDecalUVRect(quadrant);
    list.push({
      verts: [
        [cx - rx * hw, cy - hh, cz - rz * hw, u0, v0],
        [cx + rx * hw, cy - hh, cz + rz * hw, u1, v0],
        [cx + rx * hw, cy + hh, cz + rz * hw, u1, v1],
        [cx - rx * hw, cy + hh, cz - rz * hw, u0, v1]
      ],
      normal: [nx, 0, nz]
    });
  };

  const pushFloor = (list, cx, y, cz, width, depth, yawRad, quadrant) => {
    const hw = width * 0.5;
    const hd = depth * 0.5;
    const [u0, v0, u1, v1] = getDustMitDecalUVRect(quadrant);
    const ca = Math.cos(yawRad);
    const sa = Math.sin(yawRad);
    const pts = [
      [-hw, hd, u0, v1],
      [hw, hd, u1, v1],
      [hw, -hd, u1, v0],
      [-hw, -hd, u0, v0]
    ];
    list.push({
      verts: pts.map(([lx, lz, u, v]) => [cx + lx * ca - lz * sa, y, cz + lx * sa + lz * ca, u, v]),
      normal: [0, 1, 0]
    });
  };

  const obstacles = mapCfg.obstacles || [];

  // 1. Grime runoff streaks (`Q0`), base splash (`Q1`), bullet plaster pits (`Q2`), and courtyard soot (`Q3`)
  for (let i = 0; i < obstacles.length; i++) {
    const obs = obstacles[i];
    const isPerimeter = Math.max(obs.w, obs.d) > 80 || Math.max(obs.w, obs.d) >= halfSize * 1.8;

    if (obs.type === 'wall' && isPerimeter) {
      const alongX = obs.w > obs.d;
      const inward = alongX ? (obs.z > 0 ? -1 : 1) : obs.x > 0 ? -1 : 1;
      const span = alongX ? obs.w : obs.d;
      const facePos = alongX ? obs.z + inward * (obs.d * 0.5 + 0.016) : obs.x + inward * (obs.w * 0.5 + 0.016);
      const dadoFacePos = alongX ? obs.z + inward * (obs.d * 0.5 + 0.14 + 0.014) : obs.x + inward * (obs.w * 0.5 + 0.14 + 0.014);

      // Runoff streaks directly beneath perimeter vigas (`y = 8.45m`) and upper parapet cornice
      const streakStep = highDetail ? 10 : 20;
      for (let off = -span * 0.5 + 10; off <= span * 0.5 - 10; off += streakStep) {
        if (alongX) {
          pushVertical(grimeQuads, obs.x + off, 7.65, facePos, 0, inward, 2.2, 1.55, 0);
          pushVertical(grimeQuads, obs.x + off, 3.85, facePos, 0, inward, 2.1, 1.35, 0);
        } else {
          pushVertical(grimeQuads, facePos, 7.65, obs.z + off, inward, 0, 2.2, 1.55, 0);
          pushVertical(grimeQuads, facePos, 3.85, obs.z + off, inward, 0, 2.1, 1.35, 0);
        }
      }
      // Window-sill runoff streaks beneath perimeter upper windows (`y = 6.45 - 0.86 = 5.59m`)
      for (let off = -span * 0.5 + 11; off <= span * 0.5 - 11; off += 14) {
        if (alongX) {
          pushVertical(grimeQuads, obs.x + off, 4.95, facePos, 0, inward, 1.55, 1.15, 0);
        } else {
          pushVertical(grimeQuads, facePos, 4.95, obs.z + off, inward, 0, 1.55, 1.15, 0);
        }
      }
      // Lower dado base splash along perimeter walls
      for (let off = -span * 0.5 + 16; off <= span * 0.5 - 16; off += 24) {
        if (alongX) {
          pushVertical(grimeQuads, obs.x + off, 0.56, dadoFacePos, 0, inward, 2.6, 0.88, 1);
        } else {
          pushVertical(grimeQuads, dadoFacePos, 0.56, obs.z + off, inward, 0, 2.6, 0.88, 1);
        }
      }
      continue;
    }

    if (obs.type === 'wall' && obs.h >= 2.2) {
      const alongX = obs.w >= obs.d;
      const span = alongX ? obs.w : obs.d;
      const topY = obs.y + obs.h * 0.5;
      const botY = obs.y - obs.h * 0.5;
      const isMidDoor = isMidDoubleDoorWall(obs);

      // Runoff streaks beneath interior parapet coping & vigas (`Q0`) + subtle bullet plaster scars (`Q2`)
      for (const fSign of [-1, 1]) {
        if (alongX) {
          const fz = obs.z + fSign * (obs.d * 0.5 + 0.016);
          const streakOffsets = isMidDoor
            ? [(obs.x >= 0 ? 1 : -1) * (obs.w * 0.24)]
            : span >= 7.0
              ? [-span * 0.30, 0, span * 0.30]
              : [0];
          for (const sOff of streakOffsets) {
            pushVertical(grimeQuads, obs.x + sOff, topY - 0.88, fz, 0, fSign, 1.9, 1.35, 0);
          }
          if (!isMidDoor && span >= 6.0) {
            pushVertical(grimeQuads, obs.x + fSign * 1.1, botY + 1.85, fz, 0, fSign, 1.05, 1.05, 2);
          }
        } else {
          const fx = obs.x + fSign * (obs.w * 0.5 + 0.016);
          const streakOffsets = span >= 7.0 ? [-span * 0.30, 0, span * 0.30] : [0];
          for (const sOff of streakOffsets) {
            pushVertical(grimeQuads, fx, topY - 0.88, obs.z + sOff, fSign, 0, 1.9, 1.35, 0);
          }
          if (span >= 6.0) {
            pushVertical(grimeQuads, fx, botY + 1.85, obs.z + fSign * 1.1, fSign, 0, 1.05, 1.05, 2);
          }
        }
      }
      continue;
    }

    // Stair cheek & riser weathering stains beneath stair edges
    if (obs.type === 'step' && obs.h >= 0.9 && highDetail) {
      const wideAlongX = obs.w >= obs.d;
      const topY = obs.y + obs.h * 0.5;
      const stainH = Math.min(0.95, obs.h - 0.14);
      if (wideAlongX) {
        for (const sx of [-1, 1]) {
          pushVertical(grimeQuads, obs.x + sx * (obs.w * 0.5 + 0.016), topY - stainH * 0.5 - 0.06, obs.z, sx, 0, Math.min(0.92, obs.d), stainH, 0);
        }
      } else {
        for (const sz of [-1, 1]) {
          pushVertical(grimeQuads, obs.x, topY - stainH * 0.5 - 0.06, obs.z + sz * (obs.d * 0.5 + 0.016), 0, sz, Math.min(0.92, obs.w), stainH, 0);
        }
      }
    }
  }

  // Subtle courtyard cobblestone soot/dirt patches (`Q3`) clear of obstacles
  const floorGrimeSpots = [
    [-11.0, -5.5, 2.4, 0.3],
    [11.0, 5.5, 2.4, 1.9],
    [-21.5, -15.0, 2.8, 0.7],
    [21.5, 15.0, 2.8, 2.4],
    [0.0, -17.5, 2.6, 1.1],
    [0.0, 17.5, 2.6, 0.4]
  ];
  for (let i = 0; i < floorGrimeSpots.length; i++) {
    const [fx, fz, sz, yaw] = floorGrimeSpots[i];
    pushFloor(grimeQuads, fx, 0.0085, fz, sz, sz, yaw, 3);
  }

  // 2. Moroccan Mosaic Tiles (`Q0`), Teapot Shop Signs (`Q1`), Torn Weathered Posters (`Q2`), Street Plate "3" (`Q3`)
  // Placed cleanly on unobstructed sunlit plaster walls (`y >= 1.35m` above `1.15m` stone dado!)
  const innerPerim = halfSize - 0.016;
  const posterSpecs = [
    // Green street-number "3" plates mounted cleanly above arched blue-green shop doors (`sk_awp.jpg` right wall!)
    { cx: -24, cy: 3.65, cz: -innerPerim, nx: 0, nz: 1, w: 0.92, h: 0.92, q: 3 },
    { cx: 24, cy: 3.65, cz: innerPerim, nx: 0, nz: -1, w: 0.92, h: 0.92, q: 3 },
    { cx: 10.4, cy: 2.48, cz: -21.084, nx: 0, nz: 1, w: 0.78, h: 0.78, q: 3 },
    { cx: -10.4, cy: 2.48, cz: 21.084, nx: 0, nz: -1, w: 0.78, h: 0.78, q: 3 },
    // Moroccan mosaic star rug/tile medallions (`Q0`) mounted flush on shaded awnings & courtyard stucco walls (`sk_awp.jpg` left!)
    { cx: -38, cy: 2.15, cz: -innerPerim, nx: 0, nz: 1, w: 1.32, h: 1.32, q: 0 },
    { cx: 38, cy: 2.15, cz: innerPerim, nx: 0, nz: -1, w: 1.32, h: 1.32, q: 0 },
    { cx: -19.116, cy: 2.02, cz: -9.0, nx: -1, nz: 0, w: 1.24, h: 1.24, q: 0 },
    { cx: 19.116, cy: 2.02, cz: 9.0, nx: 1, nz: 0, w: 1.24, h: 1.24, q: 0 },
    { cx: -7.6, cy: 2.05, cz: 21.084, nx: 0, nz: -1, w: 1.18, h: 1.18, q: 0 },
    { cx: 7.6, cy: 2.05, cz: -21.084, nx: 0, nz: 1, w: 1.18, h: 1.18, q: 0 },
    // Moroccan tea-house enamel plaques (`Q1`) above/beside arched shop roll-up doors
    { cx: 24, cy: 3.65, cz: -innerPerim, nx: 0, nz: 1, w: 0.94, h: 0.94, q: 1 },
    { cx: -24, cy: 3.65, cz: innerPerim, nx: 0, nz: -1, w: 0.94, h: 0.94, q: 1 },
    { cx: -innerPerim, cy: 3.65, cz: -34, nx: 1, nz: 0, w: 0.94, h: 0.94, q: 1 },
    { cx: innerPerim, cy: 3.65, cz: 34, nx: -1, nz: 0, w: 0.94, h: 0.94, q: 1 },
    // Layered torn weathered street posters (`Q2`) along Mid sniper shields & outer bunker walls
    { cx: 0, cy: 2.02, cz: -26.984, nx: 0, nz: 1, w: 1.10, h: 1.10, q: 2 },
    { cx: 0, cy: 2.02, cz: 26.984, nx: 0, nz: -1, w: 1.10, h: 1.10, q: 2 },
    { cx: -46.0, cy: 2.02, cz: -14.916, nx: 0, nz: -1, w: 1.14, h: 1.14, q: 2 },
    { cx: 46.0, cy: 2.02, cz: 14.916, nx: 0, nz: 1, w: 1.14, h: 1.14, q: 2 }
  ];
  for (let i = 0; i < posterSpecs.length; i++) {
    const p = posterSpecs[i];
    pushVertical(posterQuads, p.cx, p.cy, p.cz, p.nx, p.nz, p.w, p.h, p.q);
  }

  // 3. Tactical / Street Spraypaint Markings (`graffiti.png`: Q0 blue tag, Q1 star/crescent, Q2 sector "7", Q3 symbols)
  const graffitiSpecs = [
    { cx: -8.6, cy: 2.05, cz: -21.084, nx: 0, nz: 1, w: 1.25, h: 1.15, q: 2 },
    { cx: 8.6, cy: 2.05, cz: 21.084, nx: 0, nz: -1, w: 1.25, h: 1.15, q: 2 },
    { cx: -14.916, cy: 2.02, cz: -46.0, nx: -1, nz: 0, w: 1.35, h: 1.15, q: 0 },
    { cx: 14.916, cy: 2.02, cz: 46.0, nx: 1, nz: 0, w: 1.35, h: 1.15, q: 0 },
    { cx: 14.916, cy: 2.02, cz: -46.0, nx: 1, nz: 0, w: 1.20, h: 1.10, q: 1 },
    { cx: -14.916, cy: 2.02, cz: 46.0, nx: -1, nz: 0, w: 1.20, h: 1.10, q: 1 },
    { cx: -46.0, cy: 2.02, cz: 14.916, nx: 0, nz: 1, w: 1.30, h: 1.05, q: 3 },
    { cx: 46.0, cy: 2.02, cz: -14.916, nx: 0, nz: -1, w: 1.30, h: 1.05, q: 3 }
  ];
  for (let i = 0; i < graffitiSpecs.length; i++) {
    const g = graffitiSpecs[i];
    pushVertical(graffitiQuads, g.cx, g.cy, g.cz, g.nx, g.nz, g.w, g.h, g.q);
  }

  return {
    grimeGeo: buildMergedDecalBufferGeometry(grimeQuads),
    posterGeo: buildMergedDecalBufferGeometry(posterQuads),
    graffitiGeo: buildMergedDecalBufferGeometry(graffitiQuads)
  };
}

/**
 * Converts white-matte RGB decal PNGs (`grime.png`, `posters.png`, `graffiti.png` have no alpha channel!)
 * into crisp RGBA `CanvasTexture`s with un-premultiplied edges so decals blend cleanly with fog, sun & shadows.
 */
const DUST_DECAL_CANVAS_MAX_DIM = 512;

function createWhiteKeyedDecalTexture(game, baseTex, mode, anisotropy = 4) {
  const img = baseTex?.image;
  const rawW = img?.naturalWidth || img?.width || 0;
  const rawH = img?.naturalHeight || img?.height || 0;
  if (!rawW || !rawH || typeof document === 'undefined') {
    const cloned = baseTex.clone();
    cloned.wrapS = THREE.ClampToEdgeWrapping;
    cloned.wrapT = THREE.ClampToEdgeWrapping;
    cloned.colorSpace = THREE.SRGBColorSpace;
    cloned.anisotropy = anisotropy;
    cloned.needsUpdate = true;
    game.arenaTextures?.add(cloned);
    return cloned;
  }

  const maxRaw = Math.max(rawW, rawH);
  const scale = maxRaw > DUST_DECAL_CANVAS_MAX_DIM ? DUST_DECAL_CANVAS_MAX_DIM / maxRaw : 1;
  const w = Math.max(1, Math.round(rawW * scale));
  const h = Math.max(1, Math.round(rawH * scale));

  try {
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('no 2d context');
    ctx.drawImage(img, 0, 0, w, h);
    const imgData = ctx.getImageData(0, 0, w, h);
    const d = imgData.data;

    if (mode === 'poster') {
      // Posters have cream interior graphics (~215-225) surrounded by pure white (255) outside margins.
      // Flood-fill from outer border & 2x2 center cross gutter so ONLY exterior white becomes transparent.
      const total = w * h;
      const visited = new Uint8Array(total);
      const queue = new Int32Array(total);
      let qHead = 0;
      let qTail = 0;
      const isBgWhite = (idx) => {
        const o = idx * 4;
        return d[o] >= 242 && d[o + 1] >= 242 && d[o + 2] >= 242;
      };
      const seed = (x, y) => {
        const idx = y * w + x;
        if (!visited[idx] && isBgWhite(idx)) {
          visited[idx] = 1;
          queue[qTail++] = idx;
        }
      };
      const midX = w >> 1;
      const midY = h >> 1;
      for (let x = 0; x < w; x++) {
        seed(x, 0);
        seed(x, h - 1);
        seed(x, midY);
      }
      for (let y = 0; y < h; y++) {
        seed(0, y);
        seed(w - 1, y);
        seed(midX, y);
      }
      while (qHead < qTail) {
        const idx = queue[qHead++];
        const x = idx % w;
        const y = (idx - x) / w;
        if (x > 0) seed(x - 1, y);
        if (x + 1 < w) seed(x + 1, y);
        if (y > 0) seed(x, y - 1);
        if (y + 1 < h) seed(x, y + 1);
      }
      for (let i = 0; i < total; i++) {
        if (visited[i]) {
          d[i * 4 + 3] = 0;
        }
      }
      // Feather 1px fringe pixels directly touching transparent background
      for (let y = 1; y < h - 1; y++) {
        for (let x = 1; x < w - 1; x++) {
          const i = y * w + x;
          if (visited[i]) continue;
          if (visited[i - 1] || visited[i + 1] || visited[i - w] || visited[i + w]) {
            const o = i * 4;
            const minC = Math.min(d[o], d[o + 1], d[o + 2]);
            if (minC > 224) {
              const a = Math.max(0, Math.min(1, (248 - minC) / 24));
              d[o + 3] = Math.round(a * 255);
            }
          }
        }
      }
    } else if (mode === 'graffiti') {
      // Colored spraypaint on white: extract crisp alpha via (1 - min(r,g,b)/255) & un-premultiply matte
      for (let o = 0; o < d.length; o += 4) {
        const r = d[o];
        const g = d[o + 1];
        const b = d[o + 2];
        const minC = Math.min(r, g, b) / 255;
        const a = Math.max(0, Math.min(1, (0.975 - minC) * 1.65));
        if (a <= 0.01) {
          d[o + 3] = 0;
        } else {
          const inv = 1 / Math.max(a, 0.12);
          d[o] = Math.max(0, Math.min(255, Math.round((r - (1 - a) * 255) * inv)));
          d[o + 1] = Math.max(0, Math.min(255, Math.round((g - (1 - a) * 255) * inv)));
          d[o + 2] = Math.max(0, Math.min(255, Math.round((b - (1 - a) * 255) * inv)));
          d[o + 3] = Math.round(a * 255);
        }
      }
    } else {
      // Grime runoff streaks / bullet pits / soot on ~253-255 white matte
      for (let o = 0; o < d.length; o += 4) {
        const r = d[o];
        const g = d[o + 1];
        const b = d[o + 2];
        const lum = (r * 0.299 + g * 0.587 + b * 0.114) / 255;
        const a = Math.max(0, Math.min(1, (0.98 - lum) / 0.62));
        if (a <= 0.01) {
          d[o + 3] = 0;
        } else {
          const inv = 1 / Math.max(a, 0.15);
          d[o] = Math.max(0, Math.min(255, Math.round((r - (1 - a) * 253) * inv)));
          d[o + 1] = Math.max(0, Math.min(255, Math.round((g - (1 - a) * 253) * inv)));
          d[o + 2] = Math.max(0, Math.min(255, Math.round((b - (1 - a) * 253) * inv)));
          d[o + 3] = Math.round(a * 255);
        }
      }
    }

    ctx.putImageData(imgData, 0, 0);
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.ClampToEdgeWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = anisotropy;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.generateMipmaps = true;
    tex.needsUpdate = true;
    game.arenaTextures?.add(tex);
    return tex;
  } catch {
    const cloned = baseTex.clone();
    cloned.wrapS = THREE.ClampToEdgeWrapping;
    cloned.wrapT = THREE.ClampToEdgeWrapping;
    cloned.colorSpace = THREE.SRGBColorSpace;
    cloned.anisotropy = anisotropy;
    cloned.needsUpdate = true;
    game.arenaTextures?.add(cloned);
    return cloned;
  }
}

/**
 * Asynchronously loads the real MIT CS2 decal sheets (`grime.png`, `posters.png`, `graffiti.png`) via
 * `game.assets.loadTexture(...)` strictly in browser WebGL on Medium/High tiers, merges each atlas into 1 draw call,
 * and tracks every geometry/material/texture for 100% disposal in `disposeMapResources()`.
 */
export async function buildDustMitDecals(game, mapCfg, halfSize, buildSeq) {
  if (
    typeof window === 'undefined' ||
    typeof document === 'undefined' ||
    typeof WebGL2RenderingContext === 'undefined' ||
    !game?.renderer?.isWebGLRenderer ||
    game.renderer.__fakeGL ||
    game.assetsEnabled === false ||
    (game.quality?.envMapSize ?? 512) === 0 ||
    typeof game?.assets?.loadTexture !== 'function'
  ) {
    return [];
  }

  const preset = game.quality || {};
  const maxSize = Math.min(DUST_DECAL_CANVAS_MAX_DIM, preset.textureMaxSize || DUST_DECAL_CANVAS_MAX_DIM);
  const anisotropy = Math.max(1, Math.min(preset.anisotropy || 4, game.assets.maxAnisotropy || 8));
  const opts = { maxSize, srgb: true, anisotropy };

  const [grimeBase, posterBase, graffitiBase] = await Promise.all([
    game.assets.loadTexture(`${ASSET_BASE}textures/decals/grime.png`, opts).catch(() => null),
    game.assets.loadTexture(`${ASSET_BASE}textures/decals/posters.png`, opts).catch(() => null),
    game.assets.loadTexture(`${ASSET_BASE}textures/decals/graffiti.png`, opts).catch(() => null)
  ]);

  // Abort cleanly if the player switched maps, changed quality, or disposed arena resources mid-load
  const activeMapId = game.currentMapId || game.currentMapConfig?.id || mapCfg?.id;
  if (
    game._arenaBuildSeq !== buildSeq ||
    activeMapId !== 'desert_outpost' ||
    !game.worldMeshes?.length ||
    (game.quality?.envMapSize ?? 512) === 0
  ) {
    return [];
  }

  const highDetail = (game.quality?.envMapSize ?? 512) > 0;
  const { grimeGeo, posterGeo, graffitiGeo } = buildDustMitDecalGeometries(mapCfg, halfSize, highDetail);
  const created = [];

  const mountLayer = (name, geo, baseTex, mode, { opacity = 1.0, roughness = 0.90 } = {}) => {
    if (!geo || !baseTex) {
      geo?.dispose?.();
      return;
    }
    const tex = createWhiteKeyedDecalTexture(game, baseTex, mode, anisotropy);
    const mat = new THREE.MeshStandardMaterial({
      map: tex,
      transparent: true,
      opacity,
      alphaTest: 0.03,
      depthWrite: false,
      roughness,
      metalness: 0.02,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2
    });
    game.arenaGeometries?.add(geo);
    game.arenaMaterials?.add(mat);

    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = name;
    mesh.renderOrder = 1;
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    mesh.updateMatrix();
    mesh.matrixAutoUpdate = false;
    game.scene?.add(mesh);
    game.arenaDecorMeshes?.push(mesh);
    created.push(mesh);
  };

  mountLayer('dustMitGrimeDecals', grimeGeo, grimeBase, 'grime', { opacity: 0.84, roughness: 0.95 });
  mountLayer('dustMitPosterDecals', posterGeo, posterBase, 'poster', { opacity: 0.96, roughness: 0.84 });
  mountLayer('dustMitGraffitiDecals', graffitiGeo, graffitiBase, 'graffiti', { opacity: 0.86, roughness: 0.90 });

  return created;
}
