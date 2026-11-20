// Authentic CS2 Dust II (`de_dust2`) Moroccan sandstone/stucco architecture builders, stacked plank crates,
// lower stone/concrete dado plinths, teal-green louvered shutters, street props, and MIT wall decals.
// All geometry is batched through `archMeshBatches` (merged into 1 draw call per material),
// `decorBatches` (InstancedMesh), and 3 merged decal draw calls, tracked cleanly for 100% disposal
// in `disposeMapResources()`.

import * as THREE from '../three.js';
import { ASSET_BASE } from '../assets.js';
import {
  applyVerticalPlankBoxUV1,
  attachWorldMacroGrime,
  registerPbrSlot,
  resolveTint,
  uvOffsetFor
} from '../surfaceMaterials.js';
import { applyBoxWorldUVs, createObstacleTexture } from './proceduralTextures.js';
import { createTrapezoidPrismGeometry } from './saltlinePropsAndBackdrops.js';

/** Remaps raw desert obstacle hexes into warm sunlit Moroccan stone & timber fallback tones. */
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

  const baseY = baseYOverride !== null ? baseYOverride : Math.max(2.65, archSpringY - 0.35);
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
export function createDustArchitectureMaterials(game, plan, highDetail = true, mapId = 'de_dust2') {
  const hasDom = typeof document !== 'undefined';
  const makeTexturedMat = (fallbackHex, role, roughness, metalness, grimeRole = null) => {
    const spec = plan[role] || plan.wall;
    const mat = new THREE.MeshStandardMaterial({
      map: hasDom ? createObstacleTexture(game, fallbackHex, role === 'crate' ? 'crate' : 'wall') : null,
      roughness,
      metalness
    });
    if (grimeRole) {
      attachWorldMacroGrime(mat, { mapId, role: grimeRole, enabled: highDetail });
    }
    game.arenaMaterials.add(mat);
    registerPbrSlot(game, mat, spec, resolveTint(spec, fallbackHex, role, mapId));
    return mat;
  };

  const sandstoneMat = makeTexturedMat(0xcbb99d, 'platform', 0.88, 0.02, 'platform');
  const stuccoMat = makeTexturedMat(0xdfd2bc, 'wall', 0.92, 0.02, 'wall');
  const stoneDadoMat = makeTexturedMat(0x7c7569, 'dado', 0.94, 0.02, 'dado');
  const timberDoorMat = makeTexturedMat(0xba9364, 'crate', 0.84, 0.04, null);

  const sandstoneTrimMat = new THREE.MeshStandardMaterial({
    map: hasDom ? createObstacleTexture(game, 0xd4c3a4, 'wall') : null,
    color: 0xdccbb0,
    roughness: 0.88,
    metalness: 0.02
  });
  const concreteCurbMat = new THREE.MeshStandardMaterial({
    map: hasDom ? createObstacleTexture(game, 0x9b9487, 'wall') : null,
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

/**
 * Analyzes `mapCfg` obstacles, callouts, and spawns once at arena build time so Mid Double Doors,
 * B-Tunnel/Short-A gateways, elevated canopy terraces, and street props align to `de_dust2`
 * (`halfSize: 38`) with guaranteed headroom >= 2.6m and zero spawn/walkway obstruction.
 */
export function analyzeDust2Landmarks(mapCfg = {}, halfSize = 38) {
  const obstacles = mapCfg.obstacles || [];
  const callouts = mapCfg.callouts || [];
  const allSpawns = [
    ...(mapCfg.spawnPoints || []),
    ...(mapCfg.teamSpawns?.alpha || []),
    ...(mapCfg.teamSpawns?.bravo || [])
  ];

  const isPerimeter = (o) => Math.max(o.w, o.d) > 80 || Math.max(o.w, o.d) >= halfSize * 1.8;

  const isClearOfSpawns = (x, z, pad = 2.2) => {
    for (let i = 0; i < allSpawns.length; i++) {
      if (Math.hypot(x - allSpawns[i].x, z - allSpawns[i].z) < pad) return false;
    }
    return true;
  };

  const isClearOfObstacles = (x, z, hx, hz, ignoreObs = null) => {
    for (let i = 0; i < obstacles.length; i++) {
      const o = obstacles[i];
      if (o === ignoreObs) continue;
      if (o.y - o.h * 0.5 > 2.4) continue;
      if (Math.abs(x - o.x) < o.w * 0.5 + hx && Math.abs(z - o.z) < o.d * 0.5 + hz) {
        return false;
      }
    }
    return true;
  };

  // Detect collinear pairs of interior walls separated by an open doorway/archway gap (2.2m..9.5m)
  const interiorWalls = obstacles.filter((o) => o.type === 'wall' && !isPerimeter(o) && o.h >= 2.5);
  const midDoorMap = new Map();
  const archSpans = [];
  const pairedSet = new Set();

  const midCallouts = callouts.filter((c) => {
    const id = String(c.id || '').toLowerCase();
    return id.includes('door') || id.includes('mid');
  });
  const distToMidCallout = (x, z) => {
    let best = Math.hypot(x, z);
    for (let i = 0; i < midCallouts.length; i++) {
      best = Math.min(best, Math.hypot(x - midCallouts[i].x, z - midCallouts[i].z));
    }
    return best;
  };

  for (let i = 0; i < interiorWalls.length; i++) {
    const a = interiorWalls[i];
    if (pairedSet.has(a)) continue;
    const aAlongX = a.w >= a.d;
    for (let j = i + 1; j < interiorWalls.length; j++) {
      const b = interiorWalls[j];
      if (pairedSet.has(b)) continue;
      const bAlongX = b.w >= b.d;
      if (aAlongX !== bAlongX) continue;
      if (Math.abs(a.h - b.h) > 0.8) continue;

      if (aAlongX) {
        if (Math.abs(a.z - b.z) > 0.65 || Math.abs(a.d - b.d) > 0.65) continue;
        const left = a.x < b.x ? a : b;
        const right = a.x < b.x ? b : a;
        const gap = right.x - right.w * 0.5 - (left.x + left.w * 0.5);
        if (gap < 2.2 || gap > 9.5) continue;
        const centerX = (left.x + left.w * 0.5 + (right.x - right.w * 0.5)) * 0.5;
        const centerZ = (left.z + right.z) * 0.5;
        const isMidDoor = gap <= 5.4 && distToMidCallout(centerX, centerZ) <= 18;
        archSpans.push({
          alongX: true,
          cx: centerX,
          cz: centerZ,
          gapW: gap,
          wallH: Math.min(left.h, right.h),
          depth: Math.max(left.d, right.d),
          isMidDoor,
          left,
          right
        });
        if (isMidDoor) {
          midDoorMap.set(left, { alongX: true, gapSign: 1 });
          midDoorMap.set(right, { alongX: true, gapSign: -1 });
        }
        pairedSet.add(a);
        pairedSet.add(b);
        break;
      } else {
        if (Math.abs(a.x - b.x) > 0.65 || Math.abs(a.w - b.w) > 0.65) continue;
        const north = a.z < b.z ? a : b;
        const south = a.z < b.z ? b : a;
        const gap = south.z - south.d * 0.5 - (north.z + north.d * 0.5);
        if (gap < 2.2 || gap > 9.5) continue;
        const centerX = (north.x + south.x) * 0.5;
        const centerZ = (north.z + north.d * 0.5 + (south.z - south.d * 0.5)) * 0.5;
        const isMidDoor = gap <= 5.4 && distToMidCallout(centerX, centerZ) <= 14;
        archSpans.push({
          alongX: false,
          cx: centerX,
          cz: centerZ,
          gapW: gap,
          wallH: Math.min(north.h, south.h),
          depth: Math.max(north.w, south.w),
          isMidDoor,
          north,
          south
        });
        if (isMidDoor) {
          midDoorMap.set(north, { alongX: false, gapSign: 1 });
          midDoorMap.set(south, { alongX: false, gapSign: -1 });
        }
        pairedSet.add(a);
        pairedSet.add(b);
        break;
      }
    }
  }

  return {
    midDoorMap,
    archSpans,
    isPerimeter,
    isClearOfSpawns,
    isClearOfObstacles,
    allSpawns
  };
}

/** Pushes a vertical-plank UV box (rotates horizontal wood texture 90deg on side faces) into `archMeshBatches`. */
export function pushVerticalPlankBox(ctx, mat, role, x, y, z, w, h, d, rx = 0, ry = 0, rz = 0) {
  const geo = new THREE.BoxGeometry(w, h, d);
  const tile = (ctx.plan?.[role] || ctx.plan?.crate || { tile: 1.6 }).tile;
  applyVerticalPlankBoxUV1(geo, w, h, d, tile, uvOffsetFor(x, y, z));
  applyBoxWorldUVs(geo, w, h, d, 2.2);
  ctx.pushArchMesh(mat, geo, x, y, z, rx, ry, rz);
}

/**
 * Adds a CS2 Moroccan recessed dark-interior window with vertical wrought-iron bars, carved stone sill/lintel,
 * and weathered teal-green (or custom shutterMat) wooden louvered shutters hinged slightly outward.
 */
export function addTealShutteredWindow(
  ctx,
  { cx, cy, cz, alongX, faceSign, width = 1.12, height = 1.52, shutterMat = null, trimMat = null }
) {
  const { highDetail, dustMats, addDecorBox } = ctx;
  const sMat = shutterMat || dustMats.tealShutterMat;
  const tMat = trimMat || dustMats.sandstoneTrimMat;
  const shutterW = width * 0.48;
  const shutterH = height * 0.94;
  const hingeAngle = 0.34;

  if (alongX) {
    const fz = cz;
    addDecorBox(cx, cy, fz + faceSign * 0.035, width + 0.24, height + 0.22, 0.08, tMat, true);
    addDecorBox(cx, cy, fz + faceSign * 0.068, width, height, 0.045, dustMats.recessDarkMat, false);
    addDecorBox(cx, cy + height * 0.5 + 0.11, fz + faceSign * 0.10, width + 0.34, 0.14, 0.20, tMat, true);
    addDecorBox(cx, cy - height * 0.5 - 0.09, fz + faceSign * 0.13, width + 0.38, 0.13, 0.26, tMat, true);

    const barCount = highDetail ? 4 : 2;
    for (let b = 0; b < barCount; b++) {
      const bx = cx - width * 0.36 + (b / Math.max(1, barCount - 1)) * (width * 0.72);
      addDecorBox(bx, cy, fz + faceSign * 0.095, 0.032, height - 0.04, 0.032, dustMats.forgedIronMat, true);
    }
    if (highDetail) {
      addDecorBox(cx, cy, fz + faceSign * 0.098, width - 0.04, 0.03, 0.032, dustMats.forgedIronMat, true);
    }

    for (const side of [-1, 1]) {
      const hingeX = cx + side * (width * 0.5 + 0.05);
      const yaw = side * faceSign * -hingeAngle;
      const sx = hingeX + side * (shutterW * 0.5) * Math.cos(hingeAngle);
      const sz = fz + faceSign * (0.09 + (shutterW * 0.5) * Math.sin(hingeAngle));
      addDecorBox(sx, cy, sz, shutterW, shutterH, 0.042, sMat, true, 0, yaw, 0);
      if (highDetail) {
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
    addDecorBox(fx + faceSign * 0.035, cy, cz, 0.08, height + 0.22, width + 0.24, tMat, true);
    addDecorBox(fx + faceSign * 0.068, cy, cz, 0.045, height, width, dustMats.recessDarkMat, false);
    addDecorBox(fx + faceSign * 0.10, cy + height * 0.5 + 0.11, cz, 0.20, 0.14, width + 0.34, tMat, true);
    addDecorBox(fx + faceSign * 0.13, cy - height * 0.5 - 0.09, cz, 0.26, 0.13, width + 0.38, tMat, true);

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
      addDecorBox(sx, cy, sz, 0.042, shutterH, shutterW, sMat, true, 0, yaw, 0);
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
    for (const bxOff of [-0.30, 0.30]) {
      addDecorBox(cx + bxOff, cy - h * 0.5 - 0.03, cz + faceSign * (d * 0.5 + 0.03), 0.05, 0.05, d + 0.08, dustMats.forgedIronMat, true);
      addDecorBox(cx + bxOff, cy - h * 0.5 - 0.16, cz + faceSign * 0.04, 0.05, 0.30, 0.05, dustMats.forgedIronMat, true);
    }
    addDecorBox(cx, cy, unitZ, w, h, d, dustMats.acUnitWhiteMat, true);
    addDecorBox(cx, cy + h * 0.5 + 0.015, unitZ, w + 0.03, 0.03, d + 0.03, dustMats.forgedIronMat, false);
    const frontZ = unitZ + faceSign * (d * 0.5 + 0.008);
    addDecorCyl(cx - 0.12, cy, frontZ, 0.21, 0.03, dustMats.recessDarkMat, 'z', false);
    addDecorBox(cx - 0.12, cy, frontZ + faceSign * 0.016, 0.42, 0.025, 0.015, dustMats.forgedIronMat, false);
    addDecorBox(cx - 0.12, cy, frontZ + faceSign * 0.016, 0.025, 0.42, 0.015, dustMats.forgedIronMat, false);
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

/** Adds a leaning weathered wooden ladder resting against an unobstructed courtyard or perimeter wall. */
function addLeaningWoodenLadder(ctx, { wx, wz, alongX, faceSign, baseY = 0, topY = 3.5 }) {
  const { highDetail, dustMats, addDecorBox } = ctx;
  if (!highDetail) return;

  const ladderH = Math.max(2.2, topY - baseY);
  const footOut = 0.64;
  const topOut = 0.09;
  const leanDx = footOut - topOut;
  const railLen = Math.hypot(ladderH, leanDx);
  const tilt = Math.atan2(leanDx, ladderH);
  const railSpan = 0.52;
  const rungCount = Math.max(6, Math.round(ladderH / 0.42));
  const midY = baseY + ladderH * 0.5;
  const midOut = (footOut + topOut) * 0.5;

  if (alongX) {
    const rx = -faceSign * tilt;
    for (const s of [-1, 1]) {
      addDecorBox(wx + s * (railSpan * 0.5), midY, wz + faceSign * midOut, 0.066, railLen, 0.050, dustMats.cedarBeamMat, true, rx, 0, 0);
    }
    for (let r = 1; r <= rungCount; r++) {
      const t = r / (rungCount + 1);
      const ry = baseY + t * ladderH;
      const out = footOut + (topOut - footOut) * t;
      addDecorBox(wx, ry, wz + faceSign * out, railSpan + 0.04, 0.042, 0.042, dustMats.cedarBeamMat, true);
    }
  } else {
    const rz = faceSign * tilt;
    for (const s of [-1, 1]) {
      addDecorBox(wx + faceSign * midOut, midY, wz + s * (railSpan * 0.5), 0.050, railLen, 0.066, dustMats.cedarBeamMat, true, 0, 0, rz);
    }
    for (let r = 1; r <= rungCount; r++) {
      const t = r / (rungCount + 1);
      const ry = baseY + t * ladderH;
      const out = footOut + (topOut - footOut) * t;
      addDecorBox(wx + faceSign * out, ry, wz, 0.042, 0.042, railSpan + 0.04, dustMats.cedarBeamMat, true);
    }
  }
}

/** Adds an arched blue-green corrugated steel shop roll-up door set inside a recessed carved stone arch. */
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
    addDecorBox(cx, height + tympanumH * 0.44, fz + faceSign * 0.05, width * 0.94, tympanumH * 0.92, 0.06, dustMats.recessDarkMat, false);
    addDecorBox(cx, height - 0.05, fz + faceSign * 0.18, width + 0.52, 0.16, 0.24, dustMats.cedarBeamMat, true);
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

/** Builds a Moroccan stucco + bold stone/concrete dado plinth (`0..1.15m`) + sidewalk curb wall. */
export function buildDustMoroccanWall(ctx, obs, mainMat) {
  const {
    halfSize,
    highDetail,
    dustMats,
    dustLandmarks,
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
    const upperH = highDetail ? 3.8 : 2.8;
    const upperY = topY + upperH * 0.5;
    const inward = alongX ? (cz > 0 ? -1 : 1) : cx > 0 ? -1 : 1;
    const dadoH = 1.15;

    pushArchBox(mainMat, 'wall', cx, cy, cz, cw, ch, cd);
    pushArchBox(dustMats.stuccoMat, 'wall', cx, upperY, cz, cw, upperH, cd);

    if (alongX) {
      pushArchBox(dustMats.stoneDadoMat, 'dado', cx, dadoH * 0.5, cz + inward * 0.57, cw - 1.6, dadoH, 0.14);
      pushArchBox(dustMats.sandstoneMat, 'platform', cx, dadoH + 0.04, cz + inward * 0.59, cw - 1.5, 0.08, 0.18);
      pushArchBox(dustMats.concreteCurbMat, 'wall', cx, 0.075, cz + inward * 0.74, cw - 1.8, 0.15, 0.48);
      pushArchBox(dustMats.sandstoneMat, 'platform', cx, 4.4, cz + inward * 0.56, cw - 1.4, 0.24, 0.14);
      pushArchBox(dustMats.sandstoneMat, 'platform', cx, topY + upperH + 0.14, cz, cw + 0.28, 0.28, cd + 0.32);
    } else {
      pushArchBox(dustMats.stoneDadoMat, 'dado', cx + inward * 0.57, dadoH * 0.5, cz, 0.14, dadoH, cd - 1.6);
      pushArchBox(dustMats.sandstoneMat, 'platform', cx + inward * 0.59, dadoH + 0.04, cz, 0.18, 0.08, cd - 1.5);
      pushArchBox(dustMats.concreteCurbMat, 'wall', cx + inward * 0.74, 0.075, cz, 0.48, 0.15, cd - 1.8);
      pushArchBox(dustMats.sandstoneMat, 'platform', cx + inward * 0.56, 4.4, cz, 0.14, 0.24, cd - 1.4);
      pushArchBox(dustMats.sandstoneMat, 'platform', cx, topY + upperH + 0.14, cz, cw + 0.32, 0.28, cd + 0.28);
    }

    const wallSpan = alongX ? cw : cd;
    const merlonStep = highDetail ? 4.6 : 9.2;
    const merlonY = topY + upperH + 0.58;
    for (let off = -wallSpan * 0.5 + 4.5; off <= wallSpan * 0.5 - 4.5; off += merlonStep) {
      if (alongX) {
        addDecorBox(cx + off, merlonY, cz, 2.0, 0.62, cd + 0.22, dustMats.sandstoneTrimMat, true);
        addDecorBox(cx + off, topY + upperH - 0.50, cz + inward * 0.66, 0.17, 0.17, 0.48, dustMats.cedarBeamMat, true);
        if (highDetail) {
          addDecorBox(cx + off, 7.95, cz + inward * 0.64, 0.17, 0.17, 0.44, dustMats.cedarBeamMat, true);
        }
      } else {
        addDecorBox(cx, merlonY, cz + off, cw + 0.22, 0.62, 2.0, dustMats.sandstoneTrimMat, true);
        addDecorBox(cx + inward * 0.66, topY + upperH - 0.50, cz + off, 0.48, 0.17, 0.17, dustMats.cedarBeamMat, true);
        if (highDetail) {
          addDecorBox(cx + inward * 0.64, 7.95, cz + off, 0.44, 0.17, 0.17, dustMats.cedarBeamMat, true);
        }
      }
    }

    const nicheStep = highDetail ? 12 : 24;
    const acBound = Math.max(12, halfSize - 10);
    let idx = 0;
    for (let off = -wallSpan * 0.5 + 9; off <= wallSpan * 0.5 - 9; off += nicheStep) {
      idx++;
      if (alongX) {
        const innerZ = cz + inward * halfD;
        addTealShutteredWindow(ctx, { cx: cx + off, cy: 6.15, cz: innerZ, alongX: true, faceSign: inward, width: 1.14, height: 1.62 });
        if (highDetail && idx % 2 === 0 && Math.abs(off) < acBound) {
          addOutdoorAcUnit(ctx, { cx: cx + off + 3.0, cy: 5.55, cz: innerZ, alongX: true, faceSign: inward });
        }
      } else {
        const innerX = cx + inward * halfW;
        addTealShutteredWindow(ctx, { cx: innerX, cy: 6.15, cz: cz + off, alongX: false, faceSign: inward, width: 1.14, height: 1.62 });
        if (highDetail && idx % 2 === 1 && Math.abs(off) < acBound) {
          addOutdoorAcUnit(ctx, { cx: innerX, cy: 5.55, cz: cz + off + 3.0, alongX: false, faceSign: inward });
        }
      }
    }
    return;
  }

  const alongX = cw >= cd;
  if (ch < 2.2) {
    const lowDadoH = Math.min(0.62, ch * 0.45);
    pushArchBox(dustMats.concreteCurbMat, 'wall', cx, botY + 0.06, cz, cw + 0.18, 0.12, cd + 0.18);
    pushArchBox(dustMats.stoneDadoMat, 'dado', cx, botY + lowDadoH * 0.5, cz, cw + 0.08, lowDadoH, cd + 0.08);
    pushArchBox(
      mainMat,
      'wall',
      cx,
      botY + lowDadoH + Math.max(0.2, ch - lowDadoH - 0.16) * 0.5,
      cz,
      cw,
      Math.max(0.2, ch - lowDadoH - 0.16),
      cd
    );
    pushArchFrustum(dustMats.sandstoneMat, 'platform', cx, topY - 0.08, cz, cw + 0.16, 0.16, cd + 0.16, cw + 0.04, cd + 0.04);
    return;
  }

  const dadoH = Math.min(1.15, ch * 0.38);
  const copingH = 0.18;
  const shaftH = Math.max(0.4, ch - dadoH - copingH);

  // Special landmark: CS2 Mid Double Doors heavy timber + forged iron strap cladding
  const doorInfo = dustLandmarks?.midDoorMap?.get(obs);
  if (doorInfo) {
    const gapSign = doorInfo.gapSign;
    const span = doorInfo.alongX ? cw : cd;
    const doorLen = Math.min(3.1, span * 0.46);
    const doorH = ch - 0.14;
    const doorCy = botY + doorH * 0.5;
    const stuccoLen = Math.max(0.8, span - doorLen);

    if (doorInfo.alongX) {
      const doorX = cx + gapSign * (halfW - doorLen * 0.5);
      const stuccoX = cx - gapSign * (doorLen * 0.5);
      pushArchBox(dustMats.concreteCurbMat, 'wall', stuccoX, botY + 0.065, cz, stuccoLen + 0.04, 0.13, cd + 0.24);
      pushArchBox(dustMats.stoneDadoMat, 'dado', stuccoX, botY + dadoH * 0.5, cz, stuccoLen + 0.04, dadoH, cd + 0.08);
      pushArchBox(dustMats.sandstoneMat, 'platform', stuccoX, botY + dadoH + 0.035, cz, stuccoLen + 0.06, 0.07, cd + 0.14);
      pushArchBox(mainMat, 'wall', stuccoX, botY + dadoH + shaftH * 0.5, cz, stuccoLen, shaftH, cd);
      pushArchBox(mainMat, 'wall', doorX, cy, cz, doorLen, ch - copingH, cd);
      pushArchFrustum(dustMats.sandstoneMat, 'platform', cx, topY - copingH * 0.5, cz, cw, copingH, cd + 0.22, cw, cd + 0.08);

      for (const faceZ of [-1, 1]) {
        const fz = cz + faceZ * (halfD + 0.022);
        pushVerticalPlankBox(ctx, dustMats.timberDoorMat, 'crate', doorX, doorCy, fz, doorLen, doorH, 0.045);
        addDecorBox(doorX, topY - 0.12, fz + faceZ * 0.02, doorLen + 0.06, 0.14, 0.035, dustMats.forgedIronMat, true);
        addDecorBox(doorX + gapSign * (doorLen * 0.5 - 0.07), doorCy, fz + faceZ * 0.02, 0.14, doorH, 0.04, dustMats.forgedIronMat, true);
        addDecorBox(doorX - gapSign * (doorLen * 0.5 - 0.07), doorCy, fz + faceZ * 0.02, 0.14, doorH, 0.04, dustMats.forgedIronMat, true);
        addDecorBox(doorX, doorCy, fz + faceZ * 0.024, doorLen * 0.82, 0.12, 0.025, dustMats.cedarBeamMat, true, 0, 0, gapSign * 0.65);
        for (const hy of [-0.90, 0.05, 1.00]) {
          if (Math.abs(hy) < doorH * 0.42) {
            addDecorBox(doorX - gapSign * (doorLen * 0.11), doorCy + hy, fz + faceZ * 0.028, doorLen * 0.62, 0.085, 0.024, dustMats.forgedIronMat, true);
          }
        }
      }
      if (highDetail && stuccoLen >= 2.2) {
        const outerX = cx - gapSign * (halfW * 0.45);
        for (const vxOff of [-1.0, 0.0, 1.0]) {
          addDecorBox(outerX + vxOff, topY - 0.32, cz, 0.16, 0.16, cd + 0.44, dustMats.cedarBeamMat, true);
        }
      }
    } else {
      const doorZ = cz + gapSign * (halfD - doorLen * 0.5);
      const stuccoZ = cz - gapSign * (doorLen * 0.5);
      pushArchBox(dustMats.concreteCurbMat, 'wall', cx, botY + 0.065, stuccoZ, cw + 0.24, 0.13, stuccoLen + 0.04);
      pushArchBox(dustMats.stoneDadoMat, 'dado', cx, botY + dadoH * 0.5, stuccoZ, cw + 0.08, dadoH, stuccoLen + 0.04);
      pushArchBox(dustMats.sandstoneMat, 'platform', cx, botY + dadoH + 0.035, stuccoZ, cw + 0.14, 0.07, stuccoLen + 0.06);
      pushArchBox(mainMat, 'wall', cx, botY + dadoH + shaftH * 0.5, stuccoZ, cw, shaftH, stuccoLen);
      pushArchBox(mainMat, 'wall', cx, cy, doorZ, cw, ch - copingH, doorLen);
      pushArchFrustum(dustMats.sandstoneMat, 'platform', cx, topY - copingH * 0.5, cz, cw + 0.22, copingH, cd, cw + 0.08, cd);

      for (const faceX of [-1, 1]) {
        const fx = cx + faceX * (halfW + 0.022);
        pushVerticalPlankBox(ctx, dustMats.timberDoorMat, 'crate', fx, doorCy, doorZ, 0.045, doorH, doorLen);
        addDecorBox(fx + faceX * 0.02, topY - 0.12, doorZ, 0.035, 0.14, doorLen + 0.06, dustMats.forgedIronMat, true);
        addDecorBox(fx + faceX * 0.02, doorCy, doorZ + gapSign * (doorLen * 0.5 - 0.07), 0.04, doorH, 0.14, dustMats.forgedIronMat, true);
        addDecorBox(fx + faceX * 0.02, doorCy, doorZ - gapSign * (doorLen * 0.5 - 0.07), 0.04, doorH, 0.14, dustMats.forgedIronMat, true);
        for (const hy of [-0.90, 0.05, 1.00]) {
          if (Math.abs(hy) < doorH * 0.42) {
            addDecorBox(fx + faceX * 0.028, doorCy + hy, doorZ - gapSign * (doorLen * 0.11), 0.024, 0.085, doorLen * 0.62, dustMats.forgedIronMat, true);
          }
        }
      }
    }
    return;
  }

  const dadoW = alongX ? cw + 0.02 : cw + 0.08;
  const dadoD = alongX ? cd + 0.08 : cd + 0.02;
  const capW = alongX ? cw + 0.04 : cw + 0.14;
  const capD = alongX ? cd + 0.14 : cd + 0.04;
  const curbW = alongX ? cw + 0.08 : cw + 0.24;
  const curbD = alongX ? cd + 0.24 : cd + 0.08;
  const copingW = alongX ? cw : cw + 0.20;
  const copingD = alongX ? cd + 0.20 : cd;
  const copingTopW = alongX ? cw : cw + 0.08;
  const copingTopD = alongX ? cd + 0.08 : cd;

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

  const wallSpan = alongX ? cw : cd;
  if (highDetail && wallSpan >= 3.6) {
    const beamCount = Math.max(2, Math.floor(wallSpan / 2.0));
    for (let b = 0; b < beamCount; b++) {
      const off = -wallSpan * 0.40 + (b / Math.max(1, beamCount - 1)) * (wallSpan * 0.80);
      if (alongX) {
        addDecorBox(cx + off, topY - 0.30, cz, 0.16, 0.16, cd + 0.44, dustMats.cedarBeamMat, true);
      } else {
        addDecorBox(cx, topY - 0.30, cz + off, cw + 0.44, 0.16, 0.16, dustMats.cedarBeamMat, true);
      }
    }
  }

  // Teal-green louvered shuttered & iron-barred windows in upper stucco zone
  if (wallSpan >= 5.2 && ch >= 2.8) {
    const winY = Math.min(topY - 0.74, botY + dadoH + 0.88);
    const winH = Math.min(1.12, Math.max(0.82, topY - (botY + dadoH) - 0.68));
    const inwardSign = alongX ? (cz >= 0 ? -1 : 1) : cx >= 0 ? -1 : 1;
    const winOffsets = highDetail && wallSpan >= 7.0 ? [-wallSpan * 0.28, wallSpan * 0.28] : [wallSpan * 0.24];

    for (let wIdx = 0; wIdx < winOffsets.length; wIdx++) {
      const nOff = winOffsets[wIdx];
      if (alongX) {
        addTealShutteredWindow(ctx, {
          cx: cx + nOff,
          cy: winY,
          cz: cz + inwardSign * halfD,
          alongX: true,
          faceSign: inwardSign,
          width: 0.92,
          height: winH
        });
      } else {
        addTealShutteredWindow(ctx, {
          cx: cx + inwardSign * halfW,
          cy: winY,
          cz: cz + nOff,
          alongX: false,
          faceSign: inwardSign,
          width: 0.92,
          height: winH
        });
      }
    }
  }

  // Sandbag positions tucked against long cover walls (only if clear of spawns)
  if (wallSpan >= 5.8 && ch <= 3.4) {
    const bagX = alongX ? cx : cx + halfW + 0.22;
    const bagZ = alongX ? cz + halfD + 0.22 : cz;
    if (!dustLandmarks || dustLandmarks.isClearOfSpawns(bagX, bagZ, 2.2)) {
      const bagCount = highDetail ? 3 : 2;
      for (let b = 0; b < bagCount; b++) {
        const boff = -((bagCount - 1) * 0.5) * 1.05 + b * 1.05;
        const jitter = (b % 2 === 0 ? 1 : -1) * 0.04;
        if (alongX) {
          addDecorSandbag(cx + boff, botY + 0.18, cz + halfD + 0.22, true, 0.82, jitter);
        } else {
          addDecorSandbag(cx + halfW + 0.22, botY + 0.18, cz + boff, false, 0.82, jitter);
        }
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

  pushArchFrustum(dustMats.stoneDadoMat, 'dado', cx, botY + dadoH * 0.5, cz, cw + 0.36, dadoH, cd + 0.36, cw + 0.10, cd + 0.10);
  pushArchBox(
    mainMat,
    'pillar',
    cx,
    botY + dadoH + Math.max(0.4, ch - dadoH - 0.44) * 0.5,
    cz,
    cw - 0.06,
    Math.max(0.4, ch - dadoH - 0.44),
    cd - 0.06
  );
  pushArchFrustum(dustMats.sandstoneMat, 'pillar', cx, topY - 0.22, cz, cw + 0.06, 0.44, cd + 0.06, cw + 0.30, cd + 0.30);

  addDecorBox(cx, topY - 0.50, cz, cw + 0.08, 0.16, cd + 0.08, dustMats.cedarBeamMat, true);
  if (highDetail) {
    addDecorBox(cx, cy + 0.22, cz, cw + 0.04, ch * 0.44, cd * 0.48, dustMats.recessDarkMat, false);
    addDecorBox(cx, cy + 0.22, cz, cw * 0.48, ch * 0.44, cd + 0.04, dustMats.recessDarkMat, false);
  }

  pushArchBox(dustMats.sandstoneMat, 'pillar', cx, topY + 0.28, cz, cw * 0.78, 0.56, cd * 0.78);
  pushArchFrustum(dustMats.sandstoneMat, 'pillar', cx, topY + 0.92, cz, cw * 0.62, 0.72, cd * 0.62, cw * 0.16, cd * 0.16);
}

/** Builds solid Moroccan sandstone terrace platforms matching the solid AABB collider with bold stone dado. */
export function buildDustTerracePlatform(ctx, obs, mainMat) {
  const { highDetail, dustMats, pushArchBox, addDecorBox } = ctx;
  const { x: cx, y: cy, z: cz, w: cw, h: ch, d: cd } = obs;
  const halfW = cw * 0.5;
  const halfH = ch * 0.5;
  const halfD = cd * 0.5;
  const topY = cy + halfH;
  const botY = cy - halfH;

  const deckThick = 0.26;
  const dadoH = Math.min(1.12, Math.max(0.50, ch * 0.48));
  const bodyH = Math.max(0.22, ch - deckThick - dadoH);

  pushArchBox(dustMats.concreteCurbMat, 'wall', cx, botY + 0.065, cz, cw + 0.24, 0.13, cd + 0.24);
  pushArchBox(dustMats.stoneDadoMat, 'dado', cx, botY + dadoH * 0.5, cz, cw + 0.08, dadoH, cd + 0.08);
  pushArchBox(dustMats.sandstoneMat, 'platform', cx, botY + dadoH + 0.035, cz, cw + 0.12, 0.07, cd + 0.12);
  pushArchBox(dustMats.stuccoMat, 'wall', cx, botY + dadoH + bodyH * 0.5, cz, cw - 0.10, bodyH, cd - 0.10);
  pushArchBox(mainMat, 'platform', cx, topY - deckThick * 0.5, cz, cw, deckThick, cd);

  addDecorBox(cx, topY - 0.13, cz - halfD, cw + 0.16, 0.22, 0.16, dustMats.sandstoneTrimMat, true);
  addDecorBox(cx, topY - 0.13, cz + halfD, cw + 0.16, 0.22, 0.16, dustMats.sandstoneTrimMat, true);
  addDecorBox(cx - halfW, topY - 0.13, cz, 0.16, 0.22, cd + 0.16, dustMats.sandstoneTrimMat, true);
  addDecorBox(cx + halfW, topY - 0.13, cz, 0.16, 0.22, cd + 0.16, dustMats.sandstoneTrimMat, true);

  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      addDecorBox(cx + sx * (halfW - 0.22), cy, cz + sz * (halfD - 0.22), 0.52, ch - 0.04, 0.52, dustMats.sandstoneTrimMat, true);
    }
  }
  if (highDetail) {
    const panelY = botY + dadoH + bodyH * 0.5;
    for (const side of [-1, 1]) {
      if (cw >= 3.2) {
        addDecorBox(cx, panelY, cz + side * (halfD - 0.03), Math.max(1.4, cw - 2.0), Math.max(0.28, bodyH * 0.62), 0.06, dustMats.recessDarkMat, false);
      }
      if (cd >= 3.2) {
        addDecorBox(cx + side * (halfW - 0.03), panelY, cz, 0.06, Math.max(0.28, bodyH * 0.62), Math.max(1.4, cd - 2.0), dustMats.recessDarkMat, false);
      }
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
 * of a CS2 wooden bombsite / ordnance crate.
 */
export function addCrateIronCornerLBrackets(ctx, cx, botY, topY, cz, cw, cd, highDetail, ironMat = null) {
  const { dustMats, addDecorBox } = ctx;
  const bracketMat = ironMat || dustMats?.crateIronBracketMat || ctx.darkSteelMat;
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
          addDecorBox(
            cx + sx * (halfW - arm * 0.35),
            yEdge - sy * (arm * 0.35),
            cz + sz * (halfD - arm * 0.35),
            arm * 0.85,
            arm * 0.85,
            arm * 0.85,
            bracketMat,
            true
          );
          continue;
        }

        addDecorBox(
          cx + sx * (halfW - arm * 0.5 + 0.012),
          yEdge - sy * (band * 0.5 - 0.004),
          zCorner,
          arm + 0.012,
          band,
          thick,
          bracketMat,
          true
        );
        addDecorBox(
          xCorner,
          yEdge - sy * (band * 0.5 - 0.004),
          cz + sz * (halfD - arm * 0.5 + 0.012),
          thick,
          band,
          arm + 0.012,
          bracketMat,
          true
        );
        addDecorBox(
          cx + sx * (halfW - band * 0.5 + 0.012),
          yEdge - sy * (arm * 0.5 - 0.004),
          cz + sz * (halfD - band * 0.5 + 0.012),
          band + 0.018,
          arm,
          band + 0.018,
          bracketMat,
          true
        );
      }
    }
  }
}

/**
 * Builds iconic CS2 stacked vertical-plank wooden bombsite crates (`weathered_brown_planks`)
 * framed by recessed top timber rims and chunky dark iron corner L-brackets.
 */
export function buildDustTimberCrate(ctx, obs, mainMat) {
  const { highDetail, dustMats, saltlineMats, addDecorBox } = ctx;
  const cedarMat = dustMats?.cedarBeamMat || saltlineMats.palletTimberMat;
  const ironMat = dustMats?.crateIronBracketMat || ctx.darkSteelMat;
  const { x: cx, y: cy, z: cz, w: cw, h: ch, d: cd } = obs;
  const halfW = cw * 0.5;
  const halfH = ch * 0.5;
  const halfD = cd * 0.5;
  const topY = cy + halfH;
  const botY = cy - halfH;

  if (cw < 0.9 || cd < 0.9) {
    pushVerticalPlankBox(ctx, mainMat, 'crate', cx, cy, cz, cw - 0.03, ch - 0.04, cd - 0.03);
    addDecorBox(cx, topY - 0.05, cz, cw + 0.02, 0.10, cd + 0.02, cedarMat, true);
    addDecorBox(cx, botY + 0.05, cz, cw + 0.02, 0.10, cd + 0.02, cedarMat, true);
    addCrateIronCornerLBrackets(ctx, cx, botY, topY, cz, cw, cd, highDetail, ironMat);
    return;
  }

  const skidH = 0.08;
  for (const rxOff of [-0.36, 0.36]) {
    addDecorBox(cx + cw * rxOff, botY + skidH * 0.5, cz, Math.min(0.16, cw * 0.14), skidH, cd * 0.94, saltlineMats.palletTimberMat, true);
  }

  const crateBotY = botY + skidH;
  const crateH = Math.max(0.35, ch - skidH);
  const topRecess = 0.065;
  const coreH = Math.max(0.26, crateH - topRecess);
  const coreCy = crateBotY + coreH * 0.5;

  pushVerticalPlankBox(ctx, mainMat, 'crate', cx, coreCy, cz, cw - 0.10, coreH, cd - 0.10);

  const frameT = Math.min(0.115, cw * 0.085, cd * 0.085);
  const topRailY = topY - frameT * 0.5;
  const botRailY = crateBotY + frameT * 0.5;
  for (const fy of [botRailY, topRailY]) {
    pushVerticalPlankBox(ctx, mainMat, 'crate', cx, fy, cz - halfD + frameT * 0.5, cw, frameT, frameT);
    pushVerticalPlankBox(ctx, mainMat, 'crate', cx, fy, cz + halfD - frameT * 0.5, cw, frameT, frameT);
    pushVerticalPlankBox(ctx, mainMat, 'crate', cx - halfW + frameT * 0.5, fy, cz, frameT, frameT, Math.max(0.16, cd - frameT * 2));
    pushVerticalPlankBox(ctx, mainMat, 'crate', cx + halfW - frameT * 0.5, fy, cz, frameT, frameT, Math.max(0.16, cd - frameT * 2));
  }

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

  if (highDetail) {
    addDecorBox(cx, topY - topRecess + 0.008, cz, Math.max(0.2, cw - frameT * 2.1), 0.016, 0.06, cedarMat, false);
    if (ch >= 1.75) {
      const midY = crateBotY + crateH * 0.5;
      addDecorBox(cx, midY, cz - halfD + 0.032, cw - frameT * 1.8, 0.07, 0.035, cedarMat, true);
      addDecorBox(cx, midY, cz + halfD - 0.032, cw - frameT * 1.8, 0.07, 0.035, cedarMat, true);
      addDecorBox(cx - halfW + 0.032, midY, cz, 0.035, 0.07, cd - frameT * 1.8, cedarMat, true);
      addDecorBox(cx + halfW - 0.032, midY, cz, 0.035, 0.07, cd - frameT * 1.8, cedarMat, true);
    }
  }

  addCrateIronCornerLBrackets(ctx, cx, crateBotY, topY, cz, cw, cd, highDetail, ironMat);
}

/**
 * Adds Dust II Moroccan architectural shells & authentic CS2 street-level craftsmanship scaled cleanly
 * for compact `de_dust2` (`halfSize: 38`):
 * - Sculpted `ExtrudeGeometry` archways over Mid Double Doors & B-Tunnel / Short-A gateways (headroom >= 2.6m!)
 * - Arched blue-green corrugated steel shop roll-up doors (`#365a62`)
 * - Wall-mounted outdoor AC condenser units & leaning wooden ladders
 * - Exterior corner Moroccan bastion watchtowers (zero playable-floor intrusion!)
 * - Elevated A-Site / B-Site cedar pergola market canopies (`castShadow = true`)
 * - Sloped perimeter sand drifts clear of spawns.
 */
export function buildDustArchitectureAccents(ctx) {
  const {
    game,
    mapCfg,
    halfSize,
    highDetail,
    dustMats,
    dustLandmarks,
    pushArchMesh,
    pushArchBox,
    addDecorBox,
    addDecorCyl
  } = ctx;

  // 1. Sculpted Moroccan Sandstone Archways (ExtrudeGeometry) ABOVE walkway clearance (strictly >= 2.65m headroom!)
  const archSpans = dustLandmarks?.archSpans || [];
  for (let i = 0; i < archSpans.length; i++) {
    const sp = archSpans[i];
    const innerW = sp.gapW + 0.06;
    const outerW = sp.gapW + 2.2;
    const springY = Math.max(2.85, sp.wallH - 0.10);
    const apexY = springY + Math.min(2.0, Math.max(1.05, sp.gapW * 0.28));
    const outerH = apexY + 0.72;
    const archDepth = sp.depth + 0.14;

    const archGeo = createMoroccanArchGeometry({
      outerW,
      outerH,
      innerW,
      archSpringY: springY,
      archApexY: apexY,
      depth: archDepth,
      curveSegments: highDetail ? 12 : 6,
      bevel: highDetail,
      tile: 2.5,
      baseYOverride: Math.max(2.65, springY - 0.28)
    });

    if (sp.alongX) {
      pushArchMesh(dustMats.sandstoneMat, archGeo, sp.cx, 0, sp.cz, 0, 0, 0);
      pushArchBox(dustMats.sandstoneMat, 'platform', sp.cx, outerH + 0.13, sp.cz, outerW + 0.34, 0.24, archDepth + 0.22);
      if (highDetail) {
        const vigaCount = Math.max(3, Math.min(5, Math.floor(outerW / 1.8)));
        for (let v = 0; v < vigaCount; v++) {
          const vx = sp.cx - outerW * 0.36 + (v / Math.max(1, vigaCount - 1)) * (outerW * 0.72);
          addDecorBox(vx, outerH - 0.26, sp.cz, 0.16, 0.16, archDepth + 0.44, dustMats.cedarBeamMat, true);
        }
      }
    } else {
      pushArchMesh(dustMats.sandstoneMat, archGeo, sp.cx, 0, sp.cz, 0, Math.PI * 0.5, 0);
      pushArchBox(dustMats.sandstoneMat, 'platform', sp.cx, outerH + 0.13, sp.cz, archDepth + 0.22, 0.24, outerW + 0.34);
      if (highDetail) {
        const vigaCount = Math.max(3, Math.min(5, Math.floor(outerW / 1.8)));
        for (let v = 0; v < vigaCount; v++) {
          const vz = sp.cz - outerW * 0.36 + (v / Math.max(1, vigaCount - 1)) * (outerW * 0.72);
          addDecorBox(sp.cx, outerH - 0.26, vz, archDepth + 0.44, 0.16, 0.16, dustMats.cedarBeamMat, true);
        }
      }
    }
  }

  // 2. Arched Blue-Green Corrugated Steel Shop Roll-Up Doors flush on unobstructed perimeter wall bays
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
  const shopOff = Math.round(halfSize * 0.42);
  const shopCandidates = [
    { cx: -shopOff, cz: -halfSize + 0.5, alongX: true, faceSign: 1 },
    { cx: shopOff, cz: -halfSize + 0.5, alongX: true, faceSign: 1 },
    { cx: -shopOff, cz: halfSize - 0.5, alongX: true, faceSign: -1 },
    { cx: shopOff, cz: halfSize - 0.5, alongX: true, faceSign: -1 },
    { cx: -halfSize + 0.5, cz: -shopOff, alongX: false, faceSign: 1 },
    { cx: halfSize - 0.5, cz: shopOff, alongX: false, faceSign: -1 }
  ];
  const shopLimit = highDetail ? shopCandidates.length : 3;
  let placedShops = 0;
  for (let i = 0; i < shopCandidates.length && placedShops < shopLimit; i++) {
    const sc = shopCandidates[i];
    const checkX = sc.alongX ? sc.cx : sc.cx + sc.faceSign * 1.1;
    const checkZ = sc.alongX ? sc.cz + sc.faceSign * 1.1 : sc.cz;
    const clearObs = !dustLandmarks || dustLandmarks.isClearOfObstacles(checkX, checkZ, 1.5, 1.5);
    const clearSp = !dustLandmarks || dustLandmarks.isClearOfSpawns(checkX, checkZ, 2.0);
    if (clearObs && clearSp) {
      addArchedShopRollupDoor(ctx, { ...sc, width: 2.35, height: 2.15, archGeo: shopArchGeo });
      placedShops++;
    }
  }
  shopArchGeo.dispose();

  // 3. Wall-Mounted AC Units, Leaning Wooden Ladders & Perimeter Market Awnings (Medium/High)
  if (highDetail) {
    const obstacles = mapCfg?.obstacles || [];
    let acCount = 0;
    let ladderCount = 0;
    for (let i = 0; i < obstacles.length; i++) {
      const obs = obstacles[i];
      if (obs.type !== 'wall' || dustLandmarks?.isPerimeter(obs) || obs.h < 2.8) continue;
      if (dustLandmarks?.midDoorMap?.has(obs)) continue;
      const alongX = obs.w >= obs.d;
      const span = alongX ? obs.w : obs.d;
      if (span < 4.5) continue;

      if (acCount < 4) {
        const faceSign = alongX ? (obs.z >= 0 ? -1 : 1) : obs.x >= 0 ? -1 : 1;
        const ax = alongX ? obs.x - span * 0.28 : obs.x + faceSign * (obs.w * 0.5);
        const az = alongX ? obs.z + faceSign * (obs.d * 0.5) : obs.z - span * 0.28;
        const ay = Math.max(2.68, obs.y + obs.h * 0.5 - 0.62);
        addOutdoorAcUnit(ctx, { cx: ax, cy: ay, cz: az, alongX, faceSign });
        acCount++;
      }
      if (ladderCount < 4 && span >= 5.0) {
        const faceSign = alongX ? (obs.z >= 0 ? -1 : 1) : obs.x >= 0 ? -1 : 1;
        const lx = alongX ? obs.x + span * 0.30 : obs.x + faceSign * (obs.w * 0.5);
        const lz = alongX ? obs.z + faceSign * (obs.d * 0.5) : obs.z + span * 0.30;
        const footX = alongX ? lx : lx + faceSign * 0.7;
        const footZ = alongX ? lz + faceSign * 0.7 : lz;
        if (
          (!dustLandmarks || dustLandmarks.isClearOfSpawns(footX, footZ, 2.0)) &&
          (!dustLandmarks || dustLandmarks.isClearOfObstacles(footX, footZ, 0.5, 0.5, obs))
        ) {
          addLeaningWoodenLadder(ctx, { wx: lx, wz: lz, alongX, faceSign, baseY: 0, topY: Math.min(3.5, obs.h - 0.1) });
          ladderCount++;
        }
      }
    }

    // Perimeter wooden market awning overhangs (headroom >= 3.0m, wall-bracketed so zero walkway post obstruction!)
    const awningOff = Math.round(halfSize * 0.58);
    for (const side of [-1, 1]) {
      const fz = side * (halfSize - 0.5);
      const inward = -side;
      const ax = side * awningOff;
      addDecorBox(ax, 3.25, fz + inward * 1.55, 5.4, 0.14, 0.14, dustMats.cedarBeamMat, true);
      addDecorBox(ax - 2.5, 2.95, fz + inward * 0.78, 0.12, 0.12, 1.56, dustMats.cedarBeamMat, true, inward * 0.35, 0, 0);
      addDecorBox(ax + 2.5, 2.95, fz + inward * 0.78, 0.12, 0.12, 1.56, dustMats.cedarBeamMat, true, inward * 0.35, 0, 0);
      addDecorBox(ax, 3.38, fz + inward * 0.85, 5.3, 0.06, 1.65, dustMats.canopyTerracottaMat, true, inward * 0.18, 0, 0);
    }
  }

  // 4. 4 Moroccan Sandstone & Stucco Corner Bastion Watchtowers seated cleanly outside playable corners
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const bx = sx * (halfSize + 1.6);
      const bz = sz * (halfSize + 1.6);
      pushArchBox(dustMats.stoneDadoMat, 'dado', bx, 0.575, bz, 5.4, 1.15, 5.4);
      pushArchBox(dustMats.stuccoMat, 'wall', bx, 10.6, bz, 5.0, 18.9, 5.0);
      pushArchBox(dustMats.sandstoneMat, 'platform', bx, 13.8, bz, 5.3, 0.32, 5.3);
      pushArchBox(dustMats.sandstoneMat, 'platform', bx, 19.6, bz, 5.8, 0.62, 5.8);
      pushArchBox(dustMats.sandstoneMat, 'platform', bx, 20.5, bz, 5.2, 1.15, 5.2);
      addDecorBox(bx, 18.0, bz, 5.5, 0.22, 5.5, dustMats.cedarBeamMat, true);
      if (highDetail) {
        addDecorCyl(bx, 21.6, bz, 1.75, 1.35, dustMats.domeCopperMat, 'y', true);
        addDecorCyl(bx, 22.7, bz, 0.11, 1.15, dustMats.forgedIronMat, 'y', true);
      }
    }
  }

  // 5. Elevated Cedar Pergola Market Canopies over all 4 outer site platforms (headroom >= 3.3m above deck!)
  const obstacles = mapCfg?.obstacles || [];
  let canopyCount = 0;
  for (let i = 0; i < obstacles.length && canopyCount < 4; i++) {
    const o = obstacles[i];
    if (o.type !== 'platform') continue;
    if (Math.hypot(o.x, o.z) < 10) continue; // Keep central Xbox/Catwalk sky clear
    if (o.w < 6.5 || o.d < 6.5) continue;
    const deckY = o.y + o.h * 0.5;
    const roofY = deckY + 3.8;
    const pxSpan = o.w * 0.5 - 0.30;
    const pzSpan = o.d * 0.5 - 0.30;
    for (const px of [-pxSpan, pxSpan]) {
      for (const pz of [-pzSpan, pzSpan]) {
        addDecorBox(o.x + px, deckY + 1.9, o.z + pz, 0.28, 3.8, 0.28, dustMats.sandstoneTrimMat, true);
      }
    }
    addDecorBox(o.x, roofY - 0.08, o.z - pzSpan, o.w - 0.2, 0.22, 0.22, dustMats.cedarBeamMat, true);
    addDecorBox(o.x, roofY - 0.08, o.z + pzSpan, o.w - 0.2, 0.22, 0.22, dustMats.cedarBeamMat, true);
    addDecorBox(o.x - pxSpan, roofY - 0.08, o.z, 0.22, 0.22, o.d - 0.2, dustMats.cedarBeamMat, true);
    addDecorBox(o.x + pxSpan, roofY - 0.08, o.z, 0.22, 0.22, o.d - 0.2, dustMats.cedarBeamMat, true);
    if (highDetail) {
      const strips = Math.max(3, Math.floor((o.w - 0.8) / 1.8));
      const stripW = (o.w - 0.8) / strips - 0.14;
      for (let s = 0; s < strips; s++) {
        const sx = o.x - (o.w - 0.8) * 0.5 + ((s + 0.5) / strips) * (o.w - 0.8);
        const mat = s % 2 === 0 ? dustMats.canopyTerracottaMat : dustMats.canopyCreamMat;
        addDecorBox(sx, roofY + 0.05, o.z, stripW, 0.07, o.d - 0.6, mat, true);
      }
    } else {
      addDecorBox(o.x, roofY + 0.05, o.z, o.w - 0.7, 0.07, o.d - 0.7, dustMats.canopyCreamMat, false);
    }
    canopyCount++;
  }

  // 6. Gentle Windblown Desert Sand Drifts tucked strictly against perimeter corners clear of spawns
  const pushDrift = (x, y, z, bw, h, bd, tw, td, ry = 0) => {
    const geo = createTrapezoidPrismGeometry(bw, h, bd, tw, td, 2.0, uvOffsetFor(x, y, z));
    pushArchMesh(dustMats.sandDriftMat, geo, x, y, z, 0, ry, 0);
  };

  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const dx = sx * (halfSize - 1.9);
      const dz = sz * (halfSize - 1.9);
      if (!dustLandmarks || dustLandmarks.isClearOfSpawns(dx, dz, 2.6)) {
        pushDrift(dx, 0.13, dz, 3.2, 0.26, 3.2, 0.5, 0.5, 0);
      }
    }
  }
  if (highDetail) {
    const driftOff = Math.round(halfSize * 0.52);
    for (const side of [-1, 1]) {
      for (const off of [-driftOff, driftOff]) {
        if (!dustLandmarks || dustLandmarks.isClearOfSpawns(off, side * (halfSize - 0.8), 2.4)) {
          pushDrift(off, 0.09, side * (halfSize - 0.85), 5.6, 0.18, 1.0, 4.4, 0.18, 0);
        }
        if (!dustLandmarks || dustLandmarks.isClearOfSpawns(side * (halfSize - 0.8), off, 2.4)) {
          pushDrift(side * (halfSize - 0.85), 0.09, off, 1.0, 0.18, 5.6, 0.18, 4.4, 0);
        }
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
 * Pure geometry builder for Dust II MIT decal planes (`grime`, `posters`, `graffiti`) dynamically bound
 * to actual `mapCfg.obstacles` faces and clear courtyard ground spots (`halfSize: 38`) so UV rects,
 * flush wall placement, and zero-burial guarantees hold headlessly in Node and in WebGL.
 */
export function buildDustMitDecalGeometries(mapCfg = {}, halfSize = 38, highDetail = true) {
  const grimeQuads = [];
  const posterQuads = [];
  const graffitiQuads = [];

  const obstacles = mapCfg.obstacles || [];
  const landmarks = analyzeDust2Landmarks(mapCfg, halfSize);

  const isFaceClear = (hostObs, cx, cy, cz, nx, nz, width, height) => {
    const halfX = Math.abs(nz) > 0.5 ? width * 0.5 + 0.08 : 0.22;
    const halfZ = Math.abs(nx) > 0.5 ? width * 0.5 + 0.08 : 0.22;
    const halfY = height * 0.5 + 0.08;
    const testX = cx + nx * 0.16;
    const testZ = cz + nz * 0.16;
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
    return true;
  };

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

  let posterIdx = 0;
  let graffitiIdx = 0;

  for (let i = 0; i < obstacles.length; i++) {
    const obs = obstacles[i];
    const isPerimeter = Math.max(obs.w, obs.d) > 80 || Math.max(obs.w, obs.d) >= halfSize * 1.8;

    if (obs.type === 'wall' && isPerimeter) {
      const alongX = obs.w > obs.d;
      const inward = alongX ? (obs.z > 0 ? -1 : 1) : obs.x > 0 ? -1 : 1;
      const span = alongX ? obs.w : obs.d;
      const facePos = alongX ? obs.z + inward * (obs.d * 0.5 + 0.018) : obs.x + inward * (obs.w * 0.5 + 0.018);
      const dadoFacePos = alongX ? obs.z + inward * (obs.d * 0.5 + 0.14 + 0.016) : obs.x + inward * (obs.w * 0.5 + 0.14 + 0.016);

      const streakStep = highDetail ? 9 : 18;
      for (let off = -span * 0.5 + 8; off <= span * 0.5 - 8; off += streakStep) {
        if (alongX) {
          pushVertical(grimeQuads, obs.x + off, 7.15, facePos, 0, inward, 2.0, 1.45, 0);
          pushVertical(grimeQuads, obs.x + off, 3.65, facePos, 0, inward, 1.9, 1.25, 0);
        } else {
          pushVertical(grimeQuads, facePos, 7.15, obs.z + off, inward, 0, 2.0, 1.45, 0);
          pushVertical(grimeQuads, facePos, 3.65, obs.z + off, inward, 0, 1.9, 1.25, 0);
        }
      }
      for (let off = -span * 0.5 + 14; off <= span * 0.5 - 14; off += 20) {
        if (alongX) {
          pushVertical(grimeQuads, obs.x + off, 0.56, dadoFacePos, 0, inward, 2.4, 0.86, 1);
        } else {
          pushVertical(grimeQuads, dadoFacePos, 0.56, obs.z + off, inward, 0, 2.4, 0.86, 1);
        }
      }

      // Mount Moroccan mosaic medallions, tea plaques & street plates cleanly on perimeter walls
      const shopOff = Math.round(halfSize * 0.42);
      for (const pOff of [-shopOff, shopOff]) {
        const px = alongX ? obs.x + pOff : facePos;
        const pz = alongX ? facePos : obs.z + pOff;
        const nx = alongX ? 0 : inward;
        const nz = alongX ? inward : 0;
        const q = posterIdx % 4 === 0 ? 3 : posterIdx % 4 === 1 ? 1 : 0;
        if (isFaceClear(obs, px, 3.45, pz, nx, nz, 0.96, 0.96)) {
          pushVertical(posterQuads, px, 3.45, pz, nx, nz, 0.92, 0.92, q);
          posterIdx++;
        }
      }
      continue;
    }

    if (obs.type === 'wall' && obs.h >= 2.2) {
      const alongX = obs.w >= obs.d;
      const span = alongX ? obs.w : obs.d;
      const topY = obs.y + obs.h * 0.5;
      const botY = obs.y - obs.h * 0.5;
      const doorInfo = landmarks.midDoorMap.get(obs);

      for (const fSign of [-1, 1]) {
        if (alongX) {
          const fz = obs.z + fSign * (obs.d * 0.5 + 0.018);
          const streakOffsets = doorInfo
            ? [-doorInfo.gapSign * (obs.w * 0.24)]
            : span >= 6.5
              ? [-span * 0.30, 0, span * 0.30]
              : [0];
          for (const sOff of streakOffsets) {
            pushVertical(grimeQuads, obs.x + sOff, topY - 0.82, fz, 0, fSign, 1.8, 1.25, 0);
          }
          if (!doorInfo && span >= 4.5) {
            pushVertical(grimeQuads, obs.x + fSign * 0.8, botY + 1.75, fz, 0, fSign, 1.0, 1.0, 2);
          }
        } else {
          const fx = obs.x + fSign * (obs.w * 0.5 + 0.018);
          const streakOffsets = doorInfo
            ? [-doorInfo.gapSign * (obs.d * 0.24)]
            : span >= 6.5
              ? [-span * 0.30, 0, span * 0.30]
              : [0];
          for (const sOff of streakOffsets) {
            pushVertical(grimeQuads, fx, topY - 0.82, obs.z + sOff, fSign, 0, 1.8, 1.25, 0);
          }
          if (!doorInfo && span >= 4.5) {
            pushVertical(grimeQuads, fx, botY + 1.75, obs.z + fSign * 0.8, fSign, 0, 1.0, 1.0, 2);
          }
        }
      }

      // Interior wall posters & tactical spraypaint graffiti (strictly above 1.15m stone dado)
      if (!doorInfo && span >= 3.6 && obs.h >= 2.6) {
        const inwardSign = alongX ? (obs.z >= 0 ? -1 : 1) : obs.x >= 0 ? -1 : 1;
        const decalY = Math.min(topY - 0.72, Math.max(botY + 1.82, obs.y + 0.15));
        if (posterIdx < 16) {
          const px = alongX ? obs.x : obs.x + inwardSign * (obs.w * 0.5 + 0.018);
          const pz = alongX ? obs.z + inwardSign * (obs.d * 0.5 + 0.018) : obs.z;
          const nx = alongX ? 0 : inwardSign;
          const nz = alongX ? inwardSign : 0;
          if (isFaceClear(obs, px, decalY, pz, nx, nz, 1.12, 1.12)) {
            pushVertical(posterQuads, px, decalY, pz, nx, nz, 1.08, 1.08, posterIdx % 4);
            posterIdx++;
          }
        }
        if (graffitiIdx < 8 && span >= 4.4) {
          const gx = alongX ? obs.x : obs.x - inwardSign * (obs.w * 0.5 + 0.018);
          const gz = alongX ? obs.z - inwardSign * (obs.d * 0.5 + 0.018) : obs.z;
          const nx = alongX ? 0 : -inwardSign;
          const nz = alongX ? -inwardSign : 0;
          if (isFaceClear(obs, gx, decalY, gz, nx, nz, 1.25, 1.10)) {
            pushVertical(graffitiQuads, gx, decalY, gz, nx, nz, 1.20, 1.05, graffitiIdx % 4);
            graffitiIdx++;
          }
        }
      }
      continue;
    }

    if (obs.type === 'step' && obs.h >= 0.9 && highDetail) {
      const wideAlongX = obs.w >= obs.d;
      const topY = obs.y + obs.h * 0.5;
      const stainH = Math.min(0.90, obs.h - 0.14);
      if (wideAlongX) {
        for (const sx of [-1, 1]) {
          pushVertical(grimeQuads, obs.x + sx * (obs.w * 0.5 + 0.018), topY - stainH * 0.5 - 0.06, obs.z, sx, 0, Math.min(0.88, obs.d), stainH, 0);
        }
      } else {
        for (const sz of [-1, 1]) {
          pushVertical(grimeQuads, obs.x, topY - stainH * 0.5 - 0.06, obs.z + sz * (obs.d * 0.5 + 0.018), 0, sz, Math.min(0.88, obs.w), stainH, 0);
        }
      }
    }
  }

  // Subtle courtyard cobblestone soot/dirt patches verified clear of obstacles
  const spotD = Math.round(halfSize * 0.34);
  const candidateSpots = [
    [-spotD * 0.65, -spotD * 0.45, 2.2, 0.3],
    [spotD * 0.65, spotD * 0.45, 2.2, 1.9],
    [-spotD, -spotD, 2.4, 0.7],
    [spotD, spotD, 2.4, 2.4],
    [0.0, -spotD * 1.15, 2.3, 1.1],
    [0.0, spotD * 1.15, 2.3, 0.4]
  ];
  for (let i = 0; i < candidateSpots.length; i++) {
    const [fx, fz, sz, yaw] = candidateSpots[i];
    if (landmarks.isClearOfObstacles(fx, fz, sz * 0.55, sz * 0.55)) {
      pushFloor(grimeQuads, fx, 0.0085, fz, sz, sz, yaw, 3);
    }
  }

  return {
    grimeGeo: buildMergedDecalBufferGeometry(grimeQuads),
    posterGeo: buildMergedDecalBufferGeometry(posterQuads),
    graffitiGeo: buildMergedDecalBufferGeometry(graffitiQuads)
  };
}

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
 * `game.assets.loadTexture(...)` strictly in browser WebGL on Medium/High tiers for `de_dust2` and `de_mirage`,
 * merges each atlas into 1 draw call, and tracks every geometry/material/texture for 100% disposal.
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

  const expectedMapId = mapCfg?.id || 'de_dust2';
  const preset = game.quality || {};
  const maxSize = Math.min(DUST_DECAL_CANVAS_MAX_DIM, preset.textureMaxSize || DUST_DECAL_CANVAS_MAX_DIM);
  const anisotropy = Math.max(1, Math.min(preset.anisotropy || 4, game.assets.maxAnisotropy || 8));
  const opts = { maxSize, srgb: true, anisotropy };

  const [grimeBase, posterBase, graffitiBase] = await Promise.all([
    game.assets.loadTexture(`${ASSET_BASE}textures/decals/grime.png`, opts).catch(() => null),
    game.assets.loadTexture(`${ASSET_BASE}textures/decals/posters.png`, opts).catch(() => null),
    game.assets.loadTexture(`${ASSET_BASE}textures/decals/graffiti.png`, opts).catch(() => null)
  ]);

  const activeMapId = game.currentMapId || game.currentMapConfig?.id || mapCfg?.id;
  if (
    game._arenaBuildSeq !== buildSeq ||
    activeMapId !== expectedMapId ||
    (activeMapId !== 'de_dust2' && activeMapId !== 'de_mirage') ||
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
