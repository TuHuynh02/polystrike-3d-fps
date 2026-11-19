import * as THREE from '../three.js';
import { QUALITY } from '../quality.js';
import {
  applyMetricBoxUV1,
  applyMetricPlaneUV1,
  applySaltlineWallWeatheringShader,
  applySaltlineWetFloorShader,
  attachWorldMacroGrime,
  getSurfacePlan,
  registerPbrSlot,
  resolveTint,
  uvOffsetFor
} from '../surfaceMaterials.js';
import { PropBatcher, placeMapPolyhavenProps } from '../arenaProps.js';
import {
  buildDustArchitectureAccents,
  buildDustMitDecals,
  buildDustMoroccanWall,
  buildDustSandstonePillar,
  buildDustSandstoneStep,
  buildDustTerracePlatform,
  buildDustTimberCrate,
  createDustArchitectureMaterials,
  remapDesertObstacleColor
} from './dustArchitecture.js';
import {
  applyBoxWorldUVs,
  createFloorBumpTexture,
  createGridTexture,
  createObstacleBumpTexture,
  createObstacleTexture
} from './proceduralTextures.js';
import {
  buildBombsiteRouteDecals,
  buildSaltlineArenaDecals,
  buildSaltlineCargoShip,
  buildSaltlineGantryCrane,
  buildSaltlinePerimeterProps,
  createSaltlineBackdropMaterials,
  createTrapezoidPrismGeometry
} from './saltlinePropsAndBackdrops.js';

export function buildMapLandmarks(
  game,
  mapId,
  halfSize,
  addDecorBox,
  addDecorCyl,
  darkSteelMat,
  gunmetalFrameMat,
  brushedChromeMat,
  hazardMat,
  trimAccentMat,
  trimSecondaryMat,
  saltlineCtx = null
) {
  const highDetail = (game?.quality?.envMapSize ?? 512) > 0;
  if (mapId === 'cargo_dock') {
    if (saltlineCtx) {
      for (const sideSign of [-1, 1]) {
        buildSaltlineGantryCrane({
          gx: sideSign * 38,
          sideSign,
          highDetail,
          registerInstanced: saltlineCtx.registerInstancedItem,
          unitBoxGeo: saltlineCtx.unitBoxGeo,
          unitCylGeo: saltlineCtx.unitCylGeo,
          mats: saltlineCtx.mats,
          darkSteelMat,
          gunmetalFrameMat,
          brushedChromeMat,
          hazardMat,
          trimAccentMat,
          trimSecondaryMat
        });
      }
      buildSaltlineCargoShip({
        cx: halfSize + 15.5,
        cz: -4,
        alongZ: true,
        scale: 1.0,
        highDetail,
        registerBox: addDecorBox,
        registerCyl: addDecorCyl,
        mats: saltlineCtx.mats,
        darkSteelMat,
        gunmetalFrameMat,
        brushedChromeMat,
        hazardMat
      });
      if (highDetail) {
        buildSaltlineCargoShip({
          cx: -(halfSize + 17.5),
          cz: 10,
          alongZ: true,
          scale: 0.78,
          highDetail: false,
          registerBox: addDecorBox,
          registerCyl: addDecorCyl,
          mats: saltlineCtx.mats,
          darkSteelMat,
          gunmetalFrameMat,
          brushedChromeMat,
          hazardMat
        });
      }
    } else {
      for (const sideSign of [-1, 1]) {
        const gx = sideSign * 38;
        for (const lz of [-8.6, 8.6]) {
          addDecorBox(gx - 6.6, 11.5, lz, 1.1, 21.0, 1.1, hazardMat, true);
          addDecorBox(gx + 6.6, 11.5, lz, 1.1, 21.0, 1.1, hazardMat, true);
        }
      }
    }
  } else if (mapId === 'desert_outpost') {
    // Dust II landmarks (Moroccan bastion towers, arches, quadrant pergolas) are built by dustArchitecture.js
    return;
  } else if (mapId === 'neon_lab') {
    const accelTorusGeo = new THREE.TorusGeometry(10.5, 0.55, 14, 48);
    game.arenaGeometries.add(accelTorusGeo);
    const accelRing = new THREE.Mesh(accelTorusGeo, gunmetalFrameMat);
    accelRing.rotation.x = Math.PI / 2;
    accelRing.position.set(0, 13.5, 0);
    game.scene.add(accelRing);
    game.arenaDecorMeshes.push(accelRing);

    const coreTorusGeo = new THREE.TorusGeometry(9.8, 0.18, 10, 48);
    game.arenaGeometries.add(coreTorusGeo);
    const coreRing = new THREE.Mesh(coreTorusGeo, trimAccentMat);
    coreRing.rotation.x = Math.PI / 2;
    coreRing.position.set(0, 13.5, 0);
    game.scene.add(coreRing);
    game.arenaDecorMeshes.push(coreRing);
    game.citadelRings.push(coreRing);

    for (let c = 0; c < 8; c++) {
      const ang = (c / 8) * Math.PI * 2;
      const rx = Math.cos(ang) * 10.5;
      const rz = Math.sin(ang) * 10.5;
      const coil = addDecorBox(rx, 13.5, rz, 1.8, 1.8, 1.8, c % 2 === 0 ? trimAccentMat : trimSecondaryMat);
      coil.rotation.y = -ang;
    }

    addDecorCyl(0, 22, 0, 0.35, 32, gunmetalFrameMat, 'y');
  } else {
    addDecorCyl(0, 18, 0, 0.32, 26, gunmetalFrameMat, 'y');

    const archDist = Math.min(24, Math.max(15, Math.round(halfSize * 0.45)));
    for (const dirSign of [-1, 1]) {
      addDecorBox(0, 6.8, dirSign * archDist, 14.5, 1.1, 1.6, darkSteelMat, true);
      addDecorBox(0, 7.45, dirSign * archDist, 14.8, 0.24, 1.8, trimAccentMat);
      addDecorCyl(-6.2, 4.9, dirSign * archDist, 0.65, 3.8, gunmetalFrameMat, 'y');
      addDecorCyl(6.2, 4.9, dirSign * archDist, 0.65, 3.8, gunmetalFrameMat, 'y');
    }

    if (saltlineCtx && highDetail) {
      buildSaltlineCargoShip({
        cx: halfSize + 16.5,
        cz: 0,
        alongZ: true,
        scale: 0.86,
        highDetail: false,
        registerBox: addDecorBox,
        registerCyl: addDecorCyl,
        mats: saltlineCtx.mats,
        darkSteelMat,
        gunmetalFrameMat,
        brushedChromeMat,
        hazardMat
      });
    }
  }
}

/**
 * Bakes the world matrices of many indexed meshes into ONE BufferGeometry (position, normal, uv, uv1, index).
 * Used to batch multi-part sculpted Saltline obstacle hulls into one draw call per material while preserving
 * world-metric PBR `uv1` coordinates.
 */
export function mergeMeshGeometries(meshes) {
  let vCount = 0;
  let iCount = 0;
  for (const m of meshes) {
    vCount += m.geometry.attributes.position.count;
    iCount += m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count;
  }
  const hasUv1 = meshes.every((m) => m.geometry.attributes.uv1);
  const pos = new Float32Array(vCount * 3);
  const nor = new Float32Array(vCount * 3);
  const uv = new Float32Array(vCount * 2);
  const uv1 = hasUv1 ? new Float32Array(vCount * 2) : null;
  const idx = new Uint32Array(iCount);
  const v = new THREE.Vector3();
  const normalMatrix = new THREE.Matrix3();
  let vo = 0;
  let io = 0;
  for (const m of meshes) {
    m.updateMatrix();
    normalMatrix.getNormalMatrix(m.matrix);
    const g = m.geometry;
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i).applyMatrix4(m.matrix);
      pos.set([v.x, v.y, v.z], (vo + i) * 3);
      v.fromBufferAttribute(g.attributes.normal, i).applyMatrix3(normalMatrix).normalize();
      nor.set([v.x, v.y, v.z], (vo + i) * 3);
      uv.set([g.attributes.uv.getX(i), g.attributes.uv.getY(i)], (vo + i) * 2);
      if (uv1) uv1.set([g.attributes.uv1.getX(i), g.attributes.uv1.getY(i)], (vo + i) * 2);
    }
    if (g.index) {
      for (let i = 0; i < g.index.count; i++) idx[io++] = g.index.getX(i) + vo;
    } else {
      for (let i = 0; i < p.count; i++) idx[io++] = vo + i;
    }
    vo += p.count;
  }
  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  merged.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  merged.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  if (uv1) merged.setAttribute('uv1', new THREE.BufferAttribute(uv1, 2));
  merged.setIndex(new THREE.BufferAttribute(idx, 1));
  merged.computeBoundingSphere();
  merged.computeBoundingBox();
  return merged;
}

function liftTintHex(hex, lift = 0.06) {
  const c = typeof hex === 'number' ? hex : 0x94a3b8;
  const clampedLift = Math.max(0, Math.min(0.08, Number(lift) || 0));
  const r = (c >> 16) & 0xff;
  const g = (c >> 8) & 0xff;
  const b = c & 0xff;
  const lr = Math.min(255, Math.round(r + (255 - r) * clampedLift));
  const lg = Math.min(255, Math.round(g + (255 - g) * clampedLift));
  const lb = Math.min(255, Math.round(b + (255 - b) * clampedLift));
  return (lr << 16) | (lg << 8) | lb;
}

function createGroundContactAOTexture(game) {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, 128, 128);

  const stops = [
    [0.0, 'rgba(4, 7, 12, 0.54)'],
    [0.36, 'rgba(4, 7, 12, 0.28)'],
    [0.72, 'rgba(4, 7, 12, 0.09)'],
    [1.0, 'rgba(4, 7, 12, 0.0)']
  ];
  const applyStops = (grad) => {
    for (let i = 0; i < stops.length; i++) {
      grad.addColorStop(stops[i][0], stops[i][1]);
    }
    return grad;
  };

  // Solid darkened interior footprint (for palletized crates / containers / columns)
  ctx.fillStyle = stops[0][1];
  ctx.fillRect(32, 32, 64, 64);

  // 4 outward linear falloff edges (32px skirt border on all sides)
  ctx.fillStyle = applyStops(ctx.createLinearGradient(0, 32, 0, 0));
  ctx.fillRect(32, 0, 64, 32);
  ctx.fillStyle = applyStops(ctx.createLinearGradient(0, 96, 0, 128));
  ctx.fillRect(32, 96, 64, 32);
  ctx.fillStyle = applyStops(ctx.createLinearGradient(32, 0, 0, 0));
  ctx.fillRect(0, 32, 32, 64);
  ctx.fillStyle = applyStops(ctx.createLinearGradient(96, 0, 128, 0));
  ctx.fillRect(96, 32, 32, 64);

  // 4 smooth rounded radial corners confined to each 32x32 corner quadrant
  for (const [cx, cy, rx, ry] of [
    [32, 32, 0, 0],
    [96, 32, 96, 0],
    [32, 96, 0, 96],
    [96, 96, 96, 96]
  ]) {
    ctx.fillStyle = applyStops(ctx.createRadialGradient(cx, cy, 0, cx, cy, 32));
    ctx.fillRect(rx, ry, 32, 32);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  game.arenaTextures?.add(tex);
  return tex;
}

/**
 * Builds ONE single merged BufferGeometry + MeshBasicMaterial placing soft grounded AO skirts
 * (~0.65m outward fade at y = 0.007, renderOrder = 0) around every ground-level container, wall,
 * crate, pillar, and platform column. Registered in arenaGeometries/arenaMaterials/arenaTextures.
 */
export function buildGroundContactAO(game, mapCfg = {}, halfSize = 60) {
  const preset = game?.quality || QUALITY.medium;
  const highDetail = (preset.envMapSize ?? 512) > 0;
  const obstacles = mapCfg?.obstacles || [];
  const quads = [];
  const y = 0.007;

  const pushAO9Slice = (cx, cz, w, d, skirtPad = 0.65, includeCenter = true) => {
    const x0 = cx - w * 0.5;
    const x1 = cx + w * 0.5;
    const z0 = cz - d * 0.5;
    const z1 = cz + d * 0.5;

    const ox0 = Math.max(-halfSize, x0 - skirtPad);
    const ox1 = Math.min(halfSize, x1 + skirtPad);
    const oz0 = Math.max(-halfSize, z0 - skirtPad);
    const oz1 = Math.min(halfSize, z1 + skirtPad);

    const ix0 = Math.max(-halfSize, Math.min(halfSize, x0));
    const ix1 = Math.max(-halfSize, Math.min(halfSize, x1));
    const iz0 = Math.max(-halfSize, Math.min(halfSize, z0));
    const iz1 = Math.max(-halfSize, Math.min(halfSize, z1));

    const xs = [ox0, ix0, ix1, ox1];
    const zs = [oz0, iz0, iz1, oz1];
    const us = [0.0, 0.25, 0.75, 1.0];
    const vs = [1.0, 0.75, 0.25, 0.0];

    for (let row = 0; row < 3; row++) {
      const rz0 = zs[row];
      const rz1 = zs[row + 1];
      if (rz1 - rz0 <= 0.01) continue;
      const vTop = vs[row];
      const vBot = vs[row + 1];
      for (let col = 0; col < 3; col++) {
        if (!includeCenter && row === 1 && col === 1) continue;
        const rx0 = xs[col];
        const rx1 = xs[col + 1];
        if (rx1 - rx0 <= 0.01) continue;
        const uLeft = us[col];
        const uRight = us[col + 1];
        quads.push([
          [rx0, y, rz0, uLeft, vTop],
          [rx0, y, rz1, uLeft, vBot],
          [rx1, y, rz1, uRight, vBot],
          [rx1, y, rz0, uRight, vTop]
        ]);
      }
    }
  };

  for (let i = 0; i < obstacles.length; i++) {
    const obs = obstacles[i];
    const botY = obs.y - obs.h * 0.5;
    if (botY > 0.15) continue;

    if (obs.type === 'container') {
      pushAO9Slice(obs.x, obs.z, obs.w, obs.d, 0.65, true);
    } else if (obs.type === 'crate') {
      pushAO9Slice(obs.x, obs.z, obs.w, obs.d, 0.58, true);
    } else if (obs.type === 'pillar') {
      pushAO9Slice(obs.x, obs.z, obs.w + 0.40, obs.d + 0.40, 0.65, true);
    } else if (obs.type === 'platform') {
      const deckThick = Math.min(0.22, obs.h * 0.25);
      const colClearH = Math.max(0.2, obs.h - deckThick);
      if (colClearH >= 0.45) {
        const nx = Math.max(2, Math.round(obs.w / 6.5) + 1);
        const nz = Math.max(2, Math.round(obs.d / 6.5) + 1);
        const xCoords = [];
        const zCoords = [];
        for (let ix = 0; ix < nx; ix++) {
          xCoords.push(obs.x - (obs.w * 0.5 - 0.42) + (ix / (nx - 1)) * (obs.w - 0.84));
        }
        for (let iz = 0; iz < nz; iz++) {
          zCoords.push(obs.z - (obs.d * 0.5 - 0.42) + (iz / (nz - 1)) * (obs.d - 0.84));
        }
        for (let ix = 0; ix < xCoords.length; ix++) {
          for (let iz = 0; iz < zCoords.length; iz++) {
            const isEdge = ix === 0 || ix === xCoords.length - 1 || iz === 0 || iz === zCoords.length - 1;
            if (!isEdge && !highDetail) continue;
            pushAO9Slice(xCoords[ix], zCoords[iz], 0.78, 0.78, 0.52, true);
          }
        }
      } else {
        pushAO9Slice(obs.x, obs.z, obs.w, obs.d, 0.65, false);
      }
    } else if (obs.type === 'wall') {
      const isPerimeter = Math.max(obs.w, obs.d) > 80 || Math.max(obs.w, obs.d) >= halfSize * 1.8;
      if (isPerimeter) {
        pushAO9Slice(obs.x, obs.z, obs.w, obs.d, 0.65, false);
      } else if (obs.h < 2.2) {
        pushAO9Slice(obs.x, obs.z, obs.w, obs.d, 0.58, false);
      } else {
        pushAO9Slice(obs.x, obs.z, obs.w + 0.18, obs.d + 0.18, 0.65, false);
      }
    }
  }

  if (quads.length === 0) return null;

  const vCount = quads.length * 4;
  const positions = new Float32Array(vCount * 3);
  const normals = new Float32Array(vCount * 3);
  const uvs = new Float32Array(vCount * 2);
  const indices = new Uint32Array(quads.length * 6);

  for (let q = 0; q < quads.length; q++) {
    const verts = quads[q];
    const baseV = q * 4;
    for (let c = 0; c < 4; c++) {
      const [vx, vy, vz, u, v] = verts[c];
      const vi = (baseV + c) * 3;
      const ui = (baseV + c) * 2;
      positions[vi] = vx;
      positions[vi + 1] = vy;
      positions[vi + 2] = vz;
      normals[vi] = 0;
      normals[vi + 1] = 1;
      normals[vi + 2] = 0;
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

  const aoGeo = new THREE.BufferGeometry();
  aoGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  aoGeo.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  aoGeo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  aoGeo.setIndex(new THREE.BufferAttribute(indices, 1));
  aoGeo.computeBoundingSphere();
  game.arenaGeometries?.add(aoGeo);

  const aoTex = createGroundContactAOTexture(game);
  const aoMat = new THREE.MeshBasicMaterial({
    map: aoTex,
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1
  });
  game.arenaMaterials?.add(aoMat);

  const aoMesh = new THREE.Mesh(aoGeo, aoMat);
  aoMesh.name = 'saltlineGroundContactAO';
  aoMesh.renderOrder = 0;
  aoMesh.castShadow = false;
  aoMesh.receiveShadow = false;
  aoMesh.frustumCulled = false;
  aoMesh.updateMatrix();
  aoMesh.matrixAutoUpdate = false;
  game.scene?.add(aoMesh);
  game.arenaDecorMeshes?.push(aoMesh);
  return aoMesh;
}

export function buildArena(game, mapCfg = game?.currentMapConfig || {}) {
  const halfSize = mapCfg.arenaHalfSize || game?.arenaHalfSize || 60;
  const span = halfSize * 2;
  const theme = mapCfg.theme || {};
  const preset = game?.quality || QUALITY.medium;
  const highDetail = (preset.envMapSize ?? 512) > 0;
  const plan = getSurfacePlan(mapCfg.id);
  game.pbrSlots = [];
  game._arenaBuildSeq = (game._arenaBuildSeq || 0) + 1;
  const arenaBuildSeq = game._arenaBuildSeq;

  const isDesert = theme.floorBase === '#27170c';
  const isDesertMap = mapCfg.id === 'desert_outpost' || isDesert;

  // Ground Floor with weathered concrete/tarmac diffuse, bump, roughness relief & Saltline wet puddle shader
  const floorGeo = new THREE.PlaneGeometry(span, span);
  const floorBumpTex = createFloorBumpTexture(game, halfSize);
  const floorMat = new THREE.MeshStandardMaterial({
    map: createGridTexture(game, theme, halfSize),
    bumpMap: floorBumpTex,
    roughnessMap: floorBumpTex,
    bumpScale: 0.052,
    roughness: isDesertMap ? 0.90 : 0.78,
    metalness: isDesertMap ? 0.02 : 0.08,
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 1
  });
  game.arenaMaterials.add(floorMat);
  const baseWetStrength = preset.wetFloorStrength || 0;
  const effectiveWetStrength =
    isDesertMap || plan.floor?.set === 'dirt_floor' || plan.floor?.set === 'cobblestone_pavement'
      ? baseWetStrength * 0.28
      : baseWetStrength;
  applySaltlineWetFloorShader(floorMat, effectiveWetStrength);
  attachWorldMacroGrime(floorMat, { mapId: mapCfg.id, role: 'floor', enabled: highDetail });
  game.floorMat = floorMat;
  applyMetricPlaneUV1(floorGeo, span, span, plan.floor.tile);
  game.arenaGeometries.add(floorGeo);
  const floorPbrTint = resolveTint(plan.floor, null, 'floor', mapCfg.id);
  registerPbrSlot(game, floorMat, plan.floor, isDesertMap ? floorPbrTint : liftTintHex(floorPbrTint, 0.06));
  const floorMesh = new THREE.Mesh(floorGeo, floorMat);
  floorMesh.rotation.x = -Math.PI / 2;
  floorMesh.receiveShadow = true;
  game.scene.add(floorMesh);
  game.worldMeshes.push(floorMesh);

  const bumpCache = new Map();
  const getBump = (type = 'wall') => {
    if (!bumpCache.has(type)) {
      bumpCache.set(type, createObstacleBumpTexture(game, type));
    }
    return bumpCache.get(type);
  };

  game.wallWeatherMats = [];
  const matCache = new Map();
  const getMat = (colorHex, type = 'wall') => {
    const effectiveHex = isDesertMap ? remapDesertObstacleColor(colorHex, type) : colorHex;
    const key = `${effectiveHex}_${type}`;
    if (!matCache.has(key)) {
      const isContainer = type === 'container';
      const isMetal = isDesertMap ? isContainer : isContainer || type === 'pillar' || type === 'step';
      const isPlatform = type === 'platform';
      const isWoodCrate = type === 'crate';
      const bumpTex = getBump(type);
      const obsHex = isDesertMap ? effectiveHex || 0xcbb99d : liftTintHex(effectiveHex || 0x64748b, 0.06);
      const m = new THREE.MeshStandardMaterial({
        map: createObstacleTexture(game, obsHex, type),
        bumpMap: bumpTex,
        roughnessMap: bumpTex,
        bumpScale: isMetal ? 0.056 : isPlatform ? 0.045 : 0.042,
        roughness: isMetal
          ? 0.46
          : isDesertMap
            ? isWoodCrate
              ? 0.84
              : type === 'wall'
                ? 0.92
                : 0.88
            : isPlatform
              ? 0.56
              : isWoodCrate
                ? 0.66
                : 0.72,
        metalness: isMetal ? 0.48 : isDesertMap ? (isWoodCrate ? 0.04 : 0.02) : isPlatform ? 0.34 : isWoodCrate ? 0.14 : 0.10
      });
      if (type === 'wall' || type === 'container' || type === 'pillar') {
        const wallStrength = effectiveWetStrength > 0 ? Math.min(1, effectiveWetStrength * 1.15) : 0;
        applySaltlineWallWeatheringShader(m, wallStrength);
        game.wallWeatherMats.push(m);
      }
      attachWorldMacroGrime(m, { mapId: mapCfg.id, role: type, enabled: highDetail });
      game.arenaMaterials.add(m);
      const spec = plan[type] || plan.wall;
      const tintSource = isDesertMap ? (colorHex || 0x64748b) : obsHex;
      const resolvedTint = resolveTint(spec, tintSource, type, mapCfg.id);
      registerPbrSlot(game, m, spec, isDesertMap ? resolvedTint : liftTintHex(resolvedTint, 0.06));
      matCache.set(key, m);
    }
    return matCache.get(key);
  };

  const valleyMatCache = new Map();
  const getContainerValleyMat = (colorHex) => {
    const key = `${colorHex}_valley`;
    if (!valleyMatCache.has(key)) {
      const effectiveHex = isDesertMap ? remapDesertObstacleColor(colorHex, 'container') : colorHex;
      const obsHex = liftTintHex(effectiveHex || 0x4e5d6c, 0.04);
      const procColor = new THREE.Color(obsHex);
      const pHsl = { h: 0, s: 0, l: 0 };
      procColor.getHSL(pHsl);
      procColor.setHSL(pHsl.h, pHsl.s, Math.max(0.14, pHsl.l * 0.58));

      const bumpTex = getBump('container');
      const vm = new THREE.MeshStandardMaterial({
        map: createObstacleTexture(game, procColor.getHex(), 'container'),
        bumpMap: bumpTex,
        roughnessMap: bumpTex,
        bumpScale: 0.048,
        roughness: 0.58,
        metalness: 0.44
      });
      const wallStrength = effectiveWetStrength > 0 ? Math.min(1, effectiveWetStrength * 1.15) : 0;
      applySaltlineWallWeatheringShader(vm, wallStrength);
      game.wallWeatherMats.push(vm);
      game.arenaMaterials.add(vm);

      const tintSource = isDesertMap ? (colorHex || 0x4e5d6c) : obsHex;
      const pbrBase = new THREE.Color(resolveTint(plan.container, tintSource, 'container', mapCfg.id));
      const tHsl = { h: 0, s: 0, l: 0 };
      pbrBase.getHSL(tHsl);
      pbrBase.setHSL(tHsl.h, Math.min(1, tHsl.s * 0.92), Math.max(0.24, tHsl.l * 0.62));
      registerPbrSlot(game, vm, plan.container, pbrBase.getHex());
      valleyMatCache.set(key, vm);
    }
    return valleyMatCache.get(key);
  };

  const darkSteelMat = new THREE.MeshStandardMaterial({
    color: 0x242c38,
    roughness: 0.40,
    metalness: 0.74,
    envMapIntensity: 1.18,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1
  });
  const gunmetalFrameMat = new THREE.MeshStandardMaterial({
    color: 0x3b4859,
    roughness: 0.42,
    metalness: 0.66,
    envMapIntensity: 1.15,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1
  });
  const brushedChromeMat = new THREE.MeshStandardMaterial({
    color: 0xaab9cc,
    roughness: 0.24,
    metalness: 0.88,
    envMapIntensity: 1.28,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1
  });
  const hazardMat = new THREE.MeshStandardMaterial({
    color: 0xd9921e,
    roughness: 0.48,
    metalness: 0.26,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1
  });
  const barrelOliveMat = new THREE.MeshStandardMaterial({
    color: 0x4b5f46,
    roughness: 0.46,
    metalness: 0.50
  });

  const sandbagCanvas = document.createElement('canvas');
  sandbagCanvas.width = 128;
  sandbagCanvas.height = 128;
  const sbCtx = sandbagCanvas.getContext('2d');
  sbCtx.fillStyle = '#847458';
  sbCtx.fillRect(0, 0, 128, 128);
  for (let y = 0; y < 128; y += 4) {
    sbCtx.fillStyle = y % 8 === 0 ? 'rgba(255,248,225,0.08)' : 'rgba(20,16,10,0.14)';
    sbCtx.fillRect(0, y, 128, 2);
  }
  for (let x = 0; x < 128; x += 4) {
    sbCtx.fillStyle = x % 8 === 0 ? 'rgba(255,248,225,0.06)' : 'rgba(20,16,10,0.11)';
    sbCtx.fillRect(x, 0, 2, 128);
  }
  sbCtx.strokeStyle = 'rgba(38, 30, 18, 0.58)';
  sbCtx.lineWidth = 3;
  sbCtx.beginPath();
  sbCtx.moveTo(0, 64);
  sbCtx.lineTo(128, 64);
  sbCtx.stroke();
  const sandbagTex = new THREE.CanvasTexture(sandbagCanvas);
  sandbagTex.wrapS = THREE.RepeatWrapping;
  sandbagTex.wrapT = THREE.RepeatWrapping;
  game.arenaTextures.add(sandbagTex);

  const sandbagMat = new THREE.MeshStandardMaterial({
    map: sandbagTex,
    bumpMap: sandbagTex,
    bumpScale: 0.032,
    color: 0x908064,
    roughness: 0.88,
    metalness: 0.04
  });
  const trimAccentMat = new THREE.MeshStandardMaterial({
    color: 0xd9921e,
    emissive: 0xd9921e,
    emissiveIntensity: 0.28,
    roughness: 0.38,
    metalness: 0.50
  });
  const trimSecondaryMat = new THREE.MeshStandardMaterial({
    color: theme.secondaryHex || 0x38bdf8,
    emissive: theme.secondaryHex || 0x38bdf8,
    emissiveIntensity: 0.22,
    roughness: 0.42,
    metalness: 0.50
  });

  game.arenaMaterials.add(darkSteelMat);
  game.arenaMaterials.add(gunmetalFrameMat);
  game.arenaMaterials.add(brushedChromeMat);
  game.arenaMaterials.add(hazardMat);
  game.arenaMaterials.add(barrelOliveMat);
  game.arenaMaterials.add(sandbagMat);
  game.arenaMaterials.add(trimAccentMat);
  game.arenaMaterials.add(trimSecondaryMat);

  const saltlineMats = createSaltlineBackdropMaterials(game);

  const unitBoxGeo = new THREE.BoxGeometry(1, 1, 1);
  const unitCylGeo = new THREE.CylinderGeometry(0.5, 0.5, 1, preset.cylinderSegments);
  const unitSandbagGeo = new THREE.CapsuleGeometry(0.22, 0.58, preset.capsuleSegments, preset.capsuleSegments + 4);
  game.arenaGeometries.add(unitBoxGeo);
  game.arenaGeometries.add(unitCylGeo);
  game.arenaGeometries.add(unitSandbagGeo);

  // Batching Pipeline 1: Shared secondary hardware via InstancedMesh
  const decorBatches = new Map();
  const registerInstancedItem = (geo, mat, x, y, z, sx, sy, sz, rx = 0, ry = 0, rz = 0, castShadow = false) => {
    let groupMap = decorBatches.get(geo);
    if (!groupMap) {
      groupMap = new Map();
      decorBatches.set(geo, groupMap);
    }
    let batch = groupMap.get(mat);
    if (!batch) {
      batch = { items: [], castShadow: false };
      groupMap.set(mat, batch);
    }
    if (castShadow) batch.castShadow = true;
    const item = { x, y, z, sx, sy, sz, rotation: { x: rx, y: ry, z: rz } };
    batch.items.push(item);
    return item;
  };

  const addDecorBox = (x, y, z, w, h, d, mat, castShadow = false, rx = 0, ry = 0, rz = 0) =>
    registerInstancedItem(unitBoxGeo, mat, x, y, z, w, h, d, rx, ry, rz, castShadow);

  const addDecorCyl = (x, y, z, radius, len, mat, axis = 'y', castShadow = false) => {
    const rx = axis === 'z' ? Math.PI / 2 : 0;
    const rz = axis === 'x' ? Math.PI / 2 : 0;
    return registerInstancedItem(unitCylGeo, mat, x, y, z, radius * 2, len, radius * 2, rx, 0, rz, castShadow);
  };

  const addDecorSandbag = (x, y, z, alongX = true, scale = 1.0, yawJitter = 0) => {
    if (alongX) {
      return registerInstancedItem(
        unitSandbagGeo,
        sandbagMat,
        x,
        y,
        z,
        0.78 * scale,
        1.05 * scale,
        1.15 * scale,
        0,
        yawJitter,
        Math.PI / 2,
        true
      );
    }
    return registerInstancedItem(
      unitSandbagGeo,
      sandbagMat,
      x,
      y,
      z,
      1.15 * scale,
      1.05 * scale,
      0.78 * scale,
      Math.PI / 2,
      yawJitter,
      0,
      true
    );
  };

  // Batching Pipeline 2: World-metric PBR architectural hulls merged into 1 BufferGeometry per primary material
  const archMeshBatches = new Map();
  const pushArchMesh = (mat, geo, x, y, z, rx = 0, ry = 0, rz = 0) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.rotation.set(rx, ry, rz);
    let list = archMeshBatches.get(mat);
    if (!list) {
      list = [];
      archMeshBatches.set(mat, list);
    }
    list.push(m);
  };

  const pushArchBox = (mat, role, x, y, z, w, h, d, rx = 0, ry = 0, rz = 0) => {
    const geo = new THREE.BoxGeometry(w, h, d);
    const tile = (plan[role] || plan.wall).tile;
    applyMetricBoxUV1(geo, w, h, d, tile, uvOffsetFor(x, y, z));
    applyBoxWorldUVs(geo, w, h, d, role === 'step' ? 1.6 : 3.2);
    pushArchMesh(mat, geo, x, y, z, rx, ry, rz);
  };

  const pushArchFrustum = (mat, role, x, y, z, bottomW, h, bottomD, topW, topD, rx = 0, ry = 0, rz = 0) => {
    const tile = (plan[role] || plan.wall).tile;
    const geo = createTrapezoidPrismGeometry(bottomW, h, bottomD, topW, topD, tile, uvOffsetFor(x, y, z));
    pushArchMesh(mat, geo, x, y, z, rx, ry, rz);
  };

  // Helper: Structural Steel H-Column (twin flanges + recessed web)
  const addSteelHColumn = (cx, cy, cz, widthX, heightY, depthZ, alongX = true) => {
    if (alongX) {
      const flThick = Math.max(0.055, depthZ * 0.22);
      addDecorBox(cx, cy, cz - depthZ * 0.5 + flThick * 0.5, widthX, heightY, flThick, darkSteelMat, true);
      addDecorBox(cx, cy, cz + depthZ * 0.5 - flThick * 0.5, widthX, heightY, flThick, darkSteelMat, true);
      addDecorBox(cx, cy, cz, Math.max(0.05, widthX * 0.28), heightY, Math.max(0.04, depthZ - flThick * 1.9), gunmetalFrameMat);
    } else {
      const flThick = Math.max(0.055, widthX * 0.22);
      addDecorBox(cx - widthX * 0.5 + flThick * 0.5, cy, cz, flThick, heightY, depthZ, darkSteelMat, true);
      addDecorBox(cx + widthX * 0.5 - flThick * 0.5, cy, cz, flThick, heightY, depthZ, darkSteelMat, true);
      addDecorBox(cx, cy, cz, Math.max(0.04, widthX - flThick * 1.9), heightY, Math.max(0.05, depthZ * 0.28), gunmetalFrameMat);
    }
  };

  // 1. Sculpted Saltline ISO 20ft / 40ft Corrugated Shipping Container
  const buildSculptedIsoContainer = (obs, mainMat, valleyMat = mainMat) => {
    const { x: cx, y: cy, z: cz, w: cw, h: ch, d: cd } = obs;
    const alongZ = cd >= cw;
    const halfW = cw * 0.5;
    const halfH = ch * 0.5;
    const halfD = cd * 0.5;
    const topY = cy + halfH;
    const botY = cy - halfH;
    const isGround = botY <= 0.15;

    // Recessed darker painted-steel valley core creates natural shaded corrugations between trapezoidal ribs
    pushArchBox(valleyMat, 'container', cx, cy, cz, Math.max(0.4, cw - 0.17), Math.max(0.4, ch - 0.20), Math.max(0.4, cd - 0.17));

    // Welded ISO perimeter structural rails (top & bottom longitudinal side rails + end headers/sills + 4 corner posts)
    const railH = 0.16;
    const railT = 0.15;
    const postS = 0.18;
    for (const sy of [-1, 1]) {
      const ry = cy + sy * (halfH - railH * 0.5);
      if (alongZ) {
        addDecorBox(cx - halfW + railT * 0.5, ry, cz, railT, railH, Math.max(0.2, cd - 0.44), darkSteelMat, true);
        addDecorBox(cx + halfW - railT * 0.5, ry, cz, railT, railH, Math.max(0.2, cd - 0.44), darkSteelMat, true);
        addDecorBox(cx, ry, cz - halfD + railT * 0.5, Math.max(0.2, cw - 0.44), railH, railT, darkSteelMat, true);
        addDecorBox(cx, ry, cz + halfD - railT * 0.5, Math.max(0.2, cw - 0.44), railH, railT, darkSteelMat, true);
      } else {
        addDecorBox(cx, ry, cz - halfD + railT * 0.5, Math.max(0.2, cw - 0.44), railH, railT, darkSteelMat, true);
        addDecorBox(cx, ry, cz + halfD - railT * 0.5, Math.max(0.2, cw - 0.44), railH, railT, darkSteelMat, true);
        addDecorBox(cx - halfW + railT * 0.5, ry, cz, railT, railH, Math.max(0.2, cd - 0.44), darkSteelMat, true);
        addDecorBox(cx + halfW - railT * 0.5, ry, cz, railT, railH, Math.max(0.2, cd - 0.44), darkSteelMat, true);
      }
    }

    // 4 Corner Posts + 8 ISO Corner Castings with dark recessed twist-lock aperture slots
    const castW = 0.26;
    const castH = 0.24;
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const px = cx + sx * (halfW - postS * 0.5);
        const pz = cz + sz * (halfD - postS * 0.5);
        pushArchBox(mainMat, 'container', px, cy, pz, postS, Math.max(0.3, ch - castH * 1.9), postS);

        for (const sy of [-1, 1]) {
          const ccy = cy + sy * (halfH - castH * 0.5);
          const ccx = cx + sx * (halfW - castW * 0.5 + 0.008);
          const ccz = cz + sz * (halfD - castW * 0.5 + 0.008);
          addDecorBox(ccx, ccy, ccz, castW, castH, castW, gunmetalFrameMat);
          // Dark oval/oblong twist-lock apertures on outer X & Z casting faces
          addDecorBox(ccx + sx * (castW * 0.5 + 0.004), ccy, ccz, 0.012, 0.075, 0.115, saltlineMats.rubberFenderMat);
          addDecorBox(ccx, ccy, ccz + sz * (castW * 0.5 + 0.004), 0.115, 0.075, 0.012, saltlineMats.rubberFenderMat);
        }
      }
    }

    // Bottom Forklift Pockets on ground-level containers
    if (isGround) {
      const pocketOffsets = [-0.95, 0.95];
      for (const pOff of pocketOffsets) {
        if (alongZ && cd >= 4.5) {
          for (const sx of [-1, 1]) {
            const fx = cx + sx * (halfW - 0.01);
            addDecorBox(fx, botY + 0.085, cz + pOff, 0.06, 0.12, 0.38, gunmetalFrameMat);
            addDecorBox(fx + sx * 0.025, botY + 0.08, cz + pOff, 0.02, 0.085, 0.30, saltlineMats.rubberFenderMat);
          }
        } else if (!alongZ && cw >= 4.5) {
          for (const sz of [-1, 1]) {
            const fz = cz + sz * (halfD - 0.01);
            addDecorBox(cx + pOff, botY + 0.085, fz, 0.38, 0.12, 0.06, gunmetalFrameMat);
            addDecorBox(cx + pOff, botY + 0.08, fz + sz * 0.025, 0.30, 0.085, 0.02, saltlineMats.rubberFenderMat);
          }
        }
      }
    }

    // True Trapezoidal Corrugated Side Wall Ribs + Roof Corrugation Sheet
    const longSpan = alongZ ? cd : cw;
    const crossSpan = alongZ ? cw : cd;
    const usableSpan = Math.max(1.2, longSpan - 0.64);
    const pitch = highDetail ? 0.54 : 0.86;
    const ribCount = Math.max(4, Math.floor(usableSpan / pitch));
    const ribH = Math.max(0.3, ch - railH * 2.02);
    const ribDepth = 0.085;
    const ribBaseW = Math.min(0.38, (usableSpan / ribCount) * 0.68);
    const ribTopW = ribBaseW * 0.54;

    for (let r = 0; r < ribCount; r++) {
      const alongPos = -usableSpan * 0.5 + ((r + 0.5) / ribCount) * usableSpan;
      for (const sideSign of [-1, 1]) {
        if (alongZ) {
          // Local +Y rotated onto ±X so wide root sits on valley wall and beveled trapezoidal crown sits flush at ±halfW
          const rxCenter = cx + sideSign * (halfW - ribDepth * 0.5);
          pushArchFrustum(
            mainMat,
            'container',
            rxCenter,
            cy,
            cz + alongPos,
            ribH,
            ribDepth,
            ribBaseW,
            ribH,
            ribTopW,
            0,
            0,
            sideSign > 0 ? -Math.PI * 0.5 : Math.PI * 0.5
          );
        } else {
          // Local +Y rotated onto ±Z so wide root sits on valley wall and beveled trapezoidal crown sits flush at ±halfD
          const rzCenter = cz + sideSign * (halfD - ribDepth * 0.5);
          pushArchFrustum(
            mainMat,
            'container',
            cx + alongPos,
            cy,
            rzCenter,
            ribBaseW,
            ribDepth,
            ribH,
            ribTopW,
            ribH,
            sideSign > 0 ? Math.PI * 0.5 : -Math.PI * 0.5,
            0,
            0
          );
        }
      }
    }

    // Walkable Corrugated Roof Deck (recessed base sheet + transverse roof ribs flush with topY)
    pushArchBox(mainMat, 'container', cx, topY - 0.075, cz, Math.max(0.3, cw - 0.28), 0.07, Math.max(0.3, cd - 0.28));
    const roofRibCount = Math.max(4, Math.floor(usableSpan / (highDetail ? 0.72 : 1.15)));
    for (let r = 0; r < roofRibCount; r++) {
      const alongPos = -usableSpan * 0.5 + ((r + 0.5) / roofRibCount) * usableSpan;
      if (alongZ) {
        pushArchBox(mainMat, 'container', cx, topY - 0.022, cz + alongPos, Math.max(0.3, cw - 0.34), 0.044, 0.24);
      } else {
        pushArchBox(mainMat, 'container', cx + alongPos, topY - 0.022, cz, 0.24, 0.044, Math.max(0.3, cd - 0.34));
      }
    }

    // End #1 (Door End facing arena interior) = Recessed Double Cargo Doors + 4 Galvanized Locking Rods + Hinges
    // End #2 (Opposite End) = Recessed Corrugated Front Bulkhead
    const doorEndSign = alongZ ? (cz >= 0 ? -1 : 1) : (cx >= 0 ? -1 : 1);
    const panelH = Math.max(0.3, ch - railH * 2.08);
    const leafSpan = Math.max(0.3, (crossSpan - 0.46) * 0.5 - 0.035);

    for (const endSign of [doorEndSign, -doorEndSign]) {
      const isDoorEnd = endSign === doorEndSign;
      if (alongZ) {
        const doorZ = cz + endSign * (halfD - 0.065);
        if (isDoorEnd) {
          for (const leafSign of [-1, 1]) {
            pushArchBox(mainMat, 'container', cx + leafSign * (leafSpan * 0.5 + 0.03), cy, doorZ, leafSpan, panelH, 0.055);
            // Outer door stile hinge knuckles
            if (highDetail) {
              for (const hyOff of [-0.36, -0.12, 0.12, 0.36]) {
                addDecorBox(
                  cx + leafSign * (halfW - 0.16),
                  cy + hyOff * panelH,
                  doorZ + endSign * 0.038,
                  0.075,
                  0.11,
                  0.045,
                  gunmetalFrameMat
                );
              }
            }
          }
          // Center EPDM rubber weather-seal gasket
          addDecorBox(cx, cy, doorZ + endSign * 0.026, 0.055, panelH + 0.04, 0.03, saltlineMats.rubberFenderMat);
          // 4 Vertical Galvanized Locking Rods + Cam Latches + Keeper Brackets
          for (const barRatio of [-0.30, -0.11, 0.11, 0.30]) {
            const bx = cx + crossSpan * barRatio;
            const rzRod = doorZ + endSign * 0.058;
            addDecorCyl(bx, cy, rzRod, 0.024, panelH + 0.06, brushedChromeMat, 'y');
            addDecorBox(bx + 0.055, cy - panelH * 0.14, rzRod + endSign * 0.018, 0.13, 0.048, 0.042, gunmetalFrameMat);
            if (highDetail) {
              addDecorBox(bx, cy + panelH * 0.34, rzRod, 0.07, 0.05, 0.045, darkSteelMat);
              addDecorBox(bx, cy - panelH * 0.34, rzRod, 0.07, 0.05, 0.045, darkSteelMat);
            }
          }
          // CSC safety data plate on left door leaf
          addDecorBox(cx - leafSpan * 0.48, cy - panelH * 0.26, doorZ + endSign * 0.032, 0.38, 0.24, 0.016, darkSteelMat);
        } else {
          // Corrugated Front Bulkhead End
          const endRibs = highDetail ? 5 : 3;
          const endSpan = Math.max(0.6, crossSpan - 0.50);
          for (let er = 0; er < endRibs; er++) {
            const exOff = -endSpan * 0.5 + ((er + 0.5) / endRibs) * endSpan;
            pushArchBox(mainMat, 'container', cx + exOff, cy, doorZ, (endSpan / endRibs) * 0.64, panelH, 0.08);
          }
        }
      } else {
        const doorX = cx + endSign * (halfW - 0.065);
        if (isDoorEnd) {
          for (const leafSign of [-1, 1]) {
            pushArchBox(mainMat, 'container', doorX, cy, cz + leafSign * (leafSpan * 0.5 + 0.03), 0.055, panelH, leafSpan);
            if (highDetail) {
              for (const hyOff of [-0.36, -0.12, 0.12, 0.36]) {
                addDecorBox(
                  doorX + endSign * 0.038,
                  cy + hyOff * panelH,
                  cz + leafSign * (halfD - 0.16),
                  0.045,
                  0.11,
                  0.075,
                  gunmetalFrameMat
                );
              }
            }
          }
          addDecorBox(doorX + endSign * 0.026, cy, cz, 0.03, panelH + 0.04, 0.055, saltlineMats.rubberFenderMat);
          for (const barRatio of [-0.30, -0.11, 0.11, 0.30]) {
            const bz = cz + crossSpan * barRatio;
            const rxRod = doorX + endSign * 0.058;
            addDecorCyl(rxRod, cy, bz, 0.024, panelH + 0.06, brushedChromeMat, 'y');
            addDecorBox(rxRod + endSign * 0.018, cy - panelH * 0.14, bz + 0.055, 0.042, 0.048, 0.13, gunmetalFrameMat);
            if (highDetail) {
              addDecorBox(rxRod, cy + panelH * 0.34, bz, 0.045, 0.05, 0.07, darkSteelMat);
              addDecorBox(rxRod, cy - panelH * 0.34, bz, 0.045, 0.05, 0.07, darkSteelMat);
            }
          }
          addDecorBox(doorX + endSign * 0.032, cy - panelH * 0.26, cz - leafSpan * 0.48, 0.016, 0.24, 0.38, darkSteelMat);
        } else {
          const endRibs = highDetail ? 5 : 3;
          const endSpan = Math.max(0.6, crossSpan - 0.50);
          for (let er = 0; er < endRibs; er++) {
            const ezOff = -endSpan * 0.5 + ((er + 0.5) / endRibs) * endSpan;
            pushArchBox(mainMat, 'container', doorX, cy, cz + ezOff, 0.08, panelH, (endSpan / endRibs) * 0.64);
          }
        }
      }
    }

    // Side ventilation louvers & flush welded steel placard backing plate for Saltline stencil decals
    if (highDetail) {
      if (alongZ) {
        addDecorBox(cx - halfW + 0.005, topY - 0.42, cz - halfD + 0.78, 0.03, 0.30, 0.26, darkSteelMat);
        addDecorBox(cx + halfW - 0.005, topY - 0.42, cz + halfD - 0.78, 0.03, 0.30, 0.26, darkSteelMat);
        if (ch >= 2.2 && cd >= 6.0) {
          const faceSign = cx >= 0 ? -1 : 1;
          addDecorBox(cx + faceSign * (halfW + 0.022), cy + 0.25, cz + 1.4, 0.04, 1.12, 1.42, darkSteelMat);
        }
      } else {
        addDecorBox(cx - halfW + 0.78, topY - 0.42, cz - halfD + 0.005, 0.26, 0.30, 0.03, darkSteelMat);
        addDecorBox(cx + halfW - 0.78, topY - 0.42, cz + halfD - 0.005, 0.26, 0.30, 0.03, darkSteelMat);
        if (ch >= 2.2 && cw >= 6.0) {
          const faceSign = cz >= 0 ? -1 : 1;
          addDecorBox(cx + 1.4, cy + 0.25, cz + faceSign * (halfD + 0.022), 1.42, 1.12, 0.04, darkSteelMat);
        }
      }
    }
  };

  // 2. Sculpted Saltline Palletized Cargo Crates & Molded Pelican Ordnance Cases
  const buildSculptedCargoCrate = (obs, mainMat) => {
    const { x: cx, y: cy, z: cz, w: cw, h: ch, d: cd } = obs;
    const halfW = cw * 0.5;
    const halfH = ch * 0.5;
    const halfD = cd * 0.5;
    const topY = cy + halfH;
    const botY = cy - halfH;
    const isPelicanCase = cw >= ch * 1.45 || cd >= ch * 1.45 || ch <= 1.38;

    if (isPelicanCase) {
      // Molded Military Pelican / Hardigg Weapons Case on shock-mount skids with fork clearance channels
      const skidH = Math.min(0.11, ch * 0.12);
      const alongX = cw >= cd;
      for (const sOff of [-0.34, 0, 0.34]) {
        if (alongX) {
          addDecorBox(cx + cw * sOff, botY + skidH * 0.5, cz, Math.min(0.24, cw * 0.16), skidH, cd * 0.92, darkSteelMat);
        } else {
          addDecorBox(cx, botY + skidH * 0.5, cz + cd * sOff, cw * 0.92, skidH, Math.min(0.24, cd * 0.16), darkSteelMat);
        }
      }

      const bodyH = ch - skidH;
      const splitY = topY - bodyH * 0.28;
      const tubH = splitY - (botY + skidH) - 0.015;
      const lidH = topY - splitY - 0.015;

      // Recessed dark O-ring gasket seam core
      addDecorBox(cx, botY + skidH + bodyH * 0.5, cz, cw - 0.09, bodyH - 0.04, cd - 0.09, saltlineMats.rubberFenderMat);

      // Lower tub + chamfered upper lid (flush with topY)
      pushArchFrustum(
        mainMat,
        'crate',
        cx,
        botY + skidH + tubH * 0.5,
        cz,
        cw - 0.05,
        tubH,
        cd - 0.05,
        cw,
        cd
      );
      pushArchFrustum(
        mainMat,
        'crate',
        cx,
        splitY + 0.015 + lidH * 0.5,
        cz,
        cw,
        lidH,
        cd,
        cw - 0.08,
        cd - 0.08
      );

      // Molded lid stacking ribs & corner shock bumpers
      const ribCount = highDetail ? 4 : 2;
      for (let r = 0; r < ribCount; r++) {
        const t = -0.32 + (r / Math.max(1, ribCount - 1)) * 0.64;
        if (alongX) {
          addDecorBox(cx + cw * t, topY - 0.012, cz, 0.09, 0.024, cd * 0.82, saltlineMats.pelicanPolymerMat);
        } else {
          addDecorBox(cx, topY - 0.012, cz + cd * t, cw * 0.82, 0.024, 0.09, saltlineMats.pelicanPolymerMat);
        }
      }
      for (const sx of [-1, 1]) {
        for (const sz of [-1, 1]) {
          addDecorBox(
            cx + sx * (halfW - 0.07),
            botY + skidH + bodyH * 0.5,
            cz + sz * (halfD - 0.07),
            0.16,
            bodyH - 0.02,
            0.16,
            darkSteelMat
          );
        }
      }

      // Recessed butterfly throw latches & end fold-down bail handles
      for (const lOff of [-0.26, 0.26]) {
        if (alongX) {
          for (const sz of [-1, 1]) {
            const lz = cz + sz * (halfD + 0.006);
            addDecorBox(cx + cw * lOff, splitY, lz, 0.13, 0.16, 0.022, darkSteelMat);
            addDecorBox(cx + cw * lOff, splitY, lz + sz * 0.01, 0.065, 0.11, 0.016, brushedChromeMat);
          }
        } else {
          for (const sx of [-1, 1]) {
            const lx = cx + sx * (halfW + 0.006);
            addDecorBox(lx, splitY, cz + cd * lOff, 0.022, 0.16, 0.13, darkSteelMat);
            addDecorBox(lx + sx * 0.01, splitY, cz + cd * lOff, 0.016, 0.11, 0.065, brushedChromeMat);
          }
        }
      }
    } else {
      // Heavy Port Cargo Crate on 4-Way Forklift Skid Pallet (visible fork channels underneath!)
      const palletH = 0.16;
      // 3 longitudinal pallet stringer runners + 4 top deck boards (creates open fork channels between runners)
      for (const rxOff of [-0.40, 0, 0.40]) {
        addDecorBox(cx + cw * rxOff, botY + 0.055, cz, Math.min(0.16, cw * 0.12), 0.11, cd * 0.96, saltlineMats.palletTimberMat);
      }
      for (const dzOff of [-0.41, -0.14, 0.14, 0.41]) {
        addDecorBox(cx, botY + 0.135, cz + cd * dzOff, cw * 0.98, 0.045, Math.min(0.22, cd * 0.16), saltlineMats.palletTimberMat);
      }

      // Recessed inner planked crate core + raised outer perimeter stile-and-rail frame
      const crateH = ch - palletH;
      const crateCy = botY + palletH + crateH * 0.5;
      pushArchBox(mainMat, 'crate', cx, crateCy, cz, cw - 0.11, crateH - 0.06, cd - 0.11);

      const frameT = 0.11;
      // Top & bottom crate frame rails (top flush with topY)
      for (const sy of [-1, 1]) {
        const fy = crateCy + sy * (crateH * 0.5 - frameT * 0.5);
        pushArchBox(mainMat, 'crate', cx, fy, cz - halfD + frameT * 0.5, cw, frameT, frameT);
        pushArchBox(mainMat, 'crate', cx, fy, cz + halfD - frameT * 0.5, cw, frameT, frameT);
        pushArchBox(mainMat, 'crate', cx - halfW + frameT * 0.5, fy, cz, frameT, frameT, Math.max(0.2, cd - frameT * 2));
        pushArchBox(mainMat, 'crate', cx + halfW - frameT * 0.5, fy, cz, frameT, frameT, Math.max(0.2, cd - frameT * 2));
      }
      // 4 Vertical corner stiles + 8 bolted dark-steel corner gusset brackets
      for (const sx of [-1, 1]) {
        for (const sz of [-1, 1]) {
          pushArchBox(
            mainMat,
            'crate',
            cx + sx * (halfW - frameT * 0.5),
            crateCy,
            cz + sz * (halfD - frameT * 0.5),
            frameT,
            Math.max(0.2, crateH - frameT * 2),
            frameT
          );
          addDecorBox(
            cx + sx * (halfW - 0.065),
            topY - 0.065,
            cz + sz * (halfD - 0.065),
            0.15,
            0.14,
            0.15,
            darkSteelMat
          );
          addDecorBox(
            cx + sx * (halfW - 0.065),
            botY + palletH + 0.065,
            cz + sz * (halfD - 0.065),
            0.15,
            0.14,
            0.15,
            darkSteelMat
          );
        }
      }

      // Recessed diagonal cross-brace battens on all 4 side bays + 2 tensioned steel packing straps
      if (highDetail) {
        const diagLen = Math.hypot(cw - frameT * 2.1, crateH - frameT * 2.1) * 0.94;
        const diagAngZ = Math.atan2(crateH - frameT * 2.1, cw - frameT * 2.1);
        for (const sz of [-1, 1]) {
          addDecorBox(cx, crateCy, cz + sz * (halfD - 0.038), diagLen, 0.085, 0.035, saltlineMats.palletTimberMat, false, 0, 0, diagAngZ);
        }
        const diagLenZ = Math.hypot(cd - frameT * 2.1, crateH - frameT * 2.1) * 0.94;
        const diagAngX = Math.atan2(crateH - frameT * 2.1, cd - frameT * 2.1);
        for (const sx of [-1, 1]) {
          addDecorBox(cx + sx * (halfW - 0.038), crateCy, cz, 0.035, 0.085, diagLenZ, saltlineMats.palletTimberMat, false, diagAngX, 0, 0);
        }
      }
      for (const bandOff of [-0.26, 0.26]) {
        addDecorBox(cx + cw * bandOff, cy, cz, 0.042, ch + 0.008, cd + 0.014, gunmetalFrameMat);
      }
    }
  };

  // 3. Sculpted Tapered Concrete Jersey Barriers & Armored Board-Formed Port Blast Walls
  const buildSculptedWall = (obs, mainMat) => {
    const { x: cx, y: cy, z: cz, w: cw, h: ch, d: cd } = obs;
    const halfW = cw * 0.5;
    const halfH = ch * 0.5;
    const halfD = cd * 0.5;
    const topY = cy + halfH;
    const botY = cy - halfH;
    const isPerimeter = Math.max(cw, cd) > 80 || Math.max(cw, cd) >= halfSize * 1.8;

    if (isPerimeter) {
      pushArchBox(mainMat, 'wall', cx, cy, cz, cw, ch, cd);
      const alongX = cw > cd;
      const isHarborWaterfront = !alongX && !isDesert && mapCfg.id !== 'neon_lab';
      const upperWallH = 6.5;
      const upperWallY = topY + upperWallH * 0.5;

      if (isHarborWaterfront) {
        addDecorBox(cx, 4.5, cz, cw + 0.14, 0.26, cd + 0.28, darkSteelMat);
        addDecorBox(cx, topY + 0.14, cz, cw + 0.24, 0.28, cd + 0.34, saltlineMats.concretePlinthMat);
        addDecorBox(cx, topY + 0.30, cz, cw + 0.06, 0.07, cd, hazardMat);
        addDecorBox(cx, topY + 1.45, cz, 0.14, 0.12, cd, gunmetalFrameMat);
        addDecorBox(cx, topY + 2.35, cz, 0.16, 0.14, cd, darkSteelMat);
        for (let offset = -cd * 0.5 + 8; offset <= cd * 0.5 - 8; offset += 12) {
          const inwardSign = cx > 0 ? -1 : 1;
          addSteelHColumn(cx + inwardSign * 0.48, 4.4, cz + offset, 0.92, 8.6, 1.12, false);
          addDecorBox(cx, topY + 1.35, cz + offset, 0.26, 2.5, 0.26, gunmetalFrameMat);
        }
      } else {
        addDecorBox(cx, upperWallY, cz, cw, upperWallH, cd * 1.35, gunmetalFrameMat);
        addDecorBox(cx, 4.5, cz, cw + 0.1, 0.24, cd + 0.28, darkSteelMat);
        addDecorBox(cx, 9.1, cz, cw + 0.1, 0.26, cd + 0.34, saltlineMats.concretePlinthMat);
        addDecorBox(cx, topY + upperWallH - 0.2, cz, cw + 0.1, 0.32, cd + 0.38, darkSteelMat);

        const wallSpan = alongX ? cw : cd;
        for (let offset = -wallSpan * 0.5 + 8; offset <= wallSpan * 0.5 - 8; offset += 12) {
          if (alongX) {
            const inwardSign = cz > 0 ? -1 : 1;
            addSteelHColumn(cx + offset, 7.52, cz + inwardSign * 0.55, 1.28, 14.9, 1.08, true);
            addDecorBox(cx + offset, 13.5, cz + inwardSign * 0.9, 0.62, 0.42, 0.42, trimAccentMat);
          } else {
            const inwardSign = cx > 0 ? -1 : 1;
            addSteelHColumn(cx + inwardSign * 0.55, 7.52, cz + offset, 1.08, 14.9, 1.28, false);
            addDecorBox(cx + inwardSign * 0.9, 13.5, cz + offset, 0.42, 0.42, 0.62, trimAccentMat);
          }
        }
      }
      return;
    }

    const alongX = cw >= cd;
    if (ch < 2.2) {
      // True 3-Tier Tapered Concrete Jersey / Port K-Rail Barrier (flared base -> sloped apron -> narrow upper web -> beveled cap)
      const baseH = Math.min(0.24, ch * 0.20);
      const slopeH = Math.min(0.42, ch * 0.34);
      const capH = 0.09;
      const webH = Math.max(0.18, ch - baseH - slopeH - capH);

      const narrowW = alongX ? cw : Math.max(0.42, cd * 0.56);
      const narrowX = alongX ? cw : narrowW;
      const narrowZ = alongX ? Math.max(0.42, cd * 0.56) : cd;

      // Tier 1: Wide flared concrete footer
      pushArchBox(mainMat, 'wall', cx, botY + baseH * 0.5, cz, cw, baseH, cd);
      // Tier 2: 55-deg sloped concrete belly frustum
      pushArchFrustum(mainMat, 'wall', cx, botY + baseH + slopeH * 0.5, cz, cw, slopeH, cd, narrowX, narrowZ);
      // Tier 3: Upper concrete web
      pushArchBox(mainMat, 'wall', cx, botY + baseH + slopeH + webH * 0.5, cz, narrowX, webH, narrowZ);
      // Tier 4: Beveled concrete parapet coping cap (flush with topY)
      pushArchFrustum(
        mainMat,
        'wall',
        cx,
        topY - capH * 0.5,
        cz,
        narrowX + (alongX ? 0 : 0.04),
        capH,
        narrowZ + (alongX ? 0.04 : 0),
        narrowX * (alongX ? 0.99 : 0.82),
        narrowZ * (alongX ? 0.82 : 0.99)
      );

      // Dark recessed forklift / storm drainage scupper slots at base + steel end connection plates + lifting eyes
      const span = alongX ? cw : cd;
      if (span >= 2.2) {
        for (const scOff of [-0.26, 0.26]) {
          if (alongX) {
            addDecorBox(cx + cw * scOff, botY + 0.055, cz, 0.44, 0.095, cd + 0.02, saltlineMats.rubberFenderMat);
          } else {
            addDecorBox(cx, botY + 0.055, cz + cd * scOff, cw + 0.02, 0.095, 0.44, saltlineMats.rubberFenderMat);
          }
        }
      }
      for (const eSign of [-1, 1]) {
        if (alongX) {
          addDecorBox(cx + eSign * (halfW - 0.02), cy - ch * 0.1, cz, 0.05, ch * 0.72, narrowZ * 0.88, darkSteelMat);
          addDecorCyl(cx + eSign * (cw * 0.30), topY + 0.025, cz, 0.045, 0.05, brushedChromeMat, 'y');
        } else {
          addDecorBox(cx, cy - ch * 0.1, cz + eSign * (halfD - 0.02), narrowX * 0.88, ch * 0.72, 0.05, darkSteelMat);
          addDecorCyl(cx, topY + 0.025, cz + eSign * (cd * 0.30), 0.045, 0.05, brushedChromeMat, 'y');
        }
      }
      // Subtle industrial reflector tabs on upper corners
      if (alongX) {
        addDecorBox(cx - halfW + 0.18, topY - 0.14, cz, 0.18, 0.06, narrowZ + 0.02, hazardMat);
        addDecorBox(cx + halfW - 0.18, topY - 0.14, cz, 0.18, 0.06, narrowZ + 0.02, hazardMat);
      } else {
        addDecorBox(cx, topY - 0.14, cz - halfD + 0.18, narrowX + 0.02, 0.06, 0.18, hazardMat);
        addDecorBox(cx, topY - 0.14, cz + halfD - 0.18, narrowX + 0.02, 0.06, 0.18, hazardMat);
      }
    } else {
      // Tall Board-Formed Port Blast Wall with H-Beam Steel Corner Armor & Sloped Drip Coping
      // Main concrete bay sits at exact [cw x cd] so center world stencils sit 100% flush!
      const plinthH = 0.28;
      const copingH = 0.18;
      const shaftH = Math.max(0.4, ch - plinthH - copingH);
      pushArchBox(mainMat, 'wall', cx, botY + plinthH + shaftH * 0.5, cz, cw, shaftH, cd);
      // Stepped concrete base curb
      pushArchFrustum(mainMat, 'wall', cx, botY + plinthH * 0.5, cz, cw + 0.22, plinthH, cd + 0.22, cw + 0.04, cd + 0.04);
      // Sloped precast concrete drip coping cap (flush with topY)
      pushArchFrustum(mainMat, 'wall', cx, topY - copingH * 0.5, cz, cw + 0.18, copingH, cd + 0.18, cw + 0.04, cd + 0.04);
      addDecorBox(cx, topY - copingH - 0.03, cz, cw + 0.08, 0.05, cd + 0.08, darkSteelMat);

      // Even-numbered H-Beam steel vertical pilasters (2 or 4, NEVER at t=0 so center stencil bay stays clear!)
      const wallSpan = alongX ? cw : cd;
      const pilasterCount = wallSpan >= 7.2 ? 4 : 2;
      for (let p = 0; p < pilasterCount; p++) {
        const t = -0.46 + (p / (pilasterCount - 1)) * 0.92;
        const posOff = t * wallSpan;
        if (alongX) {
          addSteelHColumn(cx + posOff, cy, cz, 0.30, ch - 0.06, cd + 0.18, true);
        } else {
          addSteelHColumn(cx, cy, cz + posOff, cw + 0.18, ch - 0.06, 0.30, false);
        }
      }

      // Formwork tie-rod cones on High/Medium
      if (highDetail && wallSpan >= 3.2) {
        for (const tyOff of [-0.28, 0.28]) {
          for (const txOff of [-0.24, 0.24]) {
            if (alongX) {
              addDecorCyl(cx + wallSpan * txOff, cy + ch * tyOff, cz, 0.038, cd + 0.03, darkSteelMat, 'z');
            } else {
              addDecorCyl(cx, cy + ch * tyOff, cz + wallSpan * txOff, 0.038, cw + 0.03, darkSteelMat, 'x');
            }
          }
        }
      }

      // Woven-burlap sandbag emplacements tucked against base plinth of long cover walls
      if (wallSpan >= 5.5) {
        const bagCount = Math.min(5, Math.floor(wallSpan / 1.4));
        for (let b = 0; b < bagCount; b++) {
          const boff = -((bagCount - 1) * 0.5) * 1.12 + b * 1.12;
          const jitter = (b % 2 === 0 ? 1 : -1) * 0.05;
          if (alongX) {
            addDecorSandbag(cx + boff, botY + 0.18, cz + halfD + 0.18, true, 0.86, jitter);
            addDecorSandbag(cx + boff * 0.86, botY + 0.46, cz + halfD + 0.15, true, 0.80, -jitter);
          } else {
            addDecorSandbag(cx + halfW + 0.18, botY + 0.18, cz + boff, false, 0.86, jitter);
            addDecorSandbag(cx + halfW + 0.15, botY + 0.46, cz + boff * 0.86, false, 0.80, -jitter);
          }
        }
      }
    }
  };

  // 4. Sculpted Armored Concrete & H-Beam Structural Pillars
  const buildSculptedPillar = (obs, mainMat) => {
    const { x: cx, y: cy, z: cz, w: cw, h: ch, d: cd } = obs;
    const halfW = cw * 0.5;
    const halfH = ch * 0.5;
    const halfD = cd * 0.5;
    const topY = cy + halfH;
    const botY = cy - halfH;

    // Stepped concrete pedestal plinth + corbelled capital head + recessed concrete core shaft
    pushArchFrustum(mainMat, 'pillar', cx, botY + 0.24, cz, cw + 0.44, 0.48, cd + 0.44, cw + 0.14, cd + 0.14);
    addDecorBox(cx, botY + 0.54, cz, cw + 0.20, 0.14, cd + 0.20, hazardMat);
    pushArchBox(mainMat, 'pillar', cx, cy, cz, cw - 0.10, Math.max(0.4, ch - 0.88), cd - 0.10);
    pushArchFrustum(mainMat, 'pillar', cx, topY - 0.22, cz, cw + 0.08, 0.44, cd + 0.08, cw + 0.34, cd + 0.34);

    // 4 Corner Structural Steel L-Angle Armor Flanges + horizontal tie collars
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const ax = cx + sx * (halfW - 0.04);
        const az = cz + sz * (halfD - 0.04);
        addDecorBox(ax, cy, az, 0.22, ch - 0.46, 0.22, darkSteelMat, true);
      }
    }
    for (const collarRatio of [-0.18, 0.22]) {
      addDecorBox(cx, cy + ch * collarRatio, cz, cw + 0.08, 0.14, cd + 0.08, gunmetalFrameMat);
    }

    const isCenterPillar = Math.abs(cx) < 2 && Math.abs(cz) < 2;
    const spireH = isCenterPillar ? 10.5 : 7.5;
    addDecorCyl(cx, topY + spireH * 0.5, cz, cw * 0.24, spireH, darkSteelMat, 'y', true);
    addDecorBox(cx, topY + spireH * 0.45, cz, cw * 0.82, 0.34, cd * 0.82, gunmetalFrameMat);
    addDecorBox(cx, topY + spireH * 0.82, cz, cw * 0.66, 0.28, cd * 0.66, trimAccentMat);

    if (isCenterPillar) {
      const radarGroup = new THREE.Group();
      radarGroup.position.set(cx, topY + 3.2, cz);

      const collarGeo = new THREE.CylinderGeometry(0.95, 1.05, 0.65, 14);
      const crossArmGeo = new THREE.BoxGeometry(4.6, 0.24, 0.32);
      const radarWingGeo = new THREE.BoxGeometry(0.28, 0.72, 2.8);
      const drumDishGeo = new THREE.CylinderGeometry(0.58, 0.58, 0.36, 16);
      game.arenaGeometries.add(collarGeo);
      game.arenaGeometries.add(crossArmGeo);
      game.arenaGeometries.add(radarWingGeo);
      game.arenaGeometries.add(drumDishGeo);

      const collar = new THREE.Mesh(collarGeo, gunmetalFrameMat);
      const crossArm = new THREE.Mesh(crossArmGeo, darkSteelMat);
      const wingL = new THREE.Mesh(radarWingGeo, trimAccentMat);
      wingL.position.set(-2.2, 0.18, 0);
      const wingR = new THREE.Mesh(radarWingGeo, trimAccentMat);
      wingR.position.set(2.2, 0.18, 0);

      const dishA = new THREE.Mesh(drumDishGeo, brushedChromeMat);
      dishA.rotation.x = Math.PI / 2;
      dishA.position.set(0, 0.65, 1.15);
      const dishB = new THREE.Mesh(drumDishGeo, brushedChromeMat);
      dishB.rotation.x = Math.PI / 2;
      dishB.position.set(0, 0.65, -1.15);

      radarGroup.add(collar, crossArm, wingL, wingR, dishA, dishB);
      game.scene.add(radarGroup);
      game.arenaDecorMeshes.push(radarGroup);
      game.citadelRings.push(radarGroup);
    }
  };

  // 5. Open-Frame Structural Steel I-Beam Gantry / Catwalk Platform (open space underneath!)
  const buildSculptedGantryPlatform = (obs, mainMat) => {
    const { x: cx, y: cy, z: cz, w: cw, h: ch, d: cd } = obs;
    const halfW = cw * 0.5;
    const halfH = ch * 0.5;
    const halfD = cd * 0.5;
    const topY = cy + halfH;
    const botY = cy - halfH;

    // Walkable top checker-plate steel deck slab (flush with topY so player boots stand squarely on metal deck)
    const deckThick = Math.min(0.22, ch * 0.25);
    pushArchBox(mainMat, 'platform', cx, topY - deckThick * 0.5, cz, cw, deckThick, cd);

    // Perimeter C-channel fascia girders + recessed hazard safety kickplate trim
    const girderH = Math.min(0.36, ch * 0.35);
    const girderY = topY - girderH * 0.5 - 0.01;
    addDecorBox(cx, girderY, cz - halfD, cw + 0.16, girderH, 0.22, darkSteelMat, true);
    addDecorBox(cx, girderY, cz + halfD, cw + 0.16, girderH, 0.22, darkSteelMat, true);
    addDecorBox(cx - halfW, girderY, cz, 0.22, girderH, cd + 0.16, darkSteelMat, true);
    addDecorBox(cx + halfW, girderY, cz, 0.22, girderH, cd + 0.16, darkSteelMat, true);

    addDecorBox(cx, topY - 0.04, cz - halfD - 0.06, cw + 0.22, 0.065, 0.06, hazardMat);
    addDecorBox(cx, topY - 0.04, cz + halfD + 0.06, cw + 0.22, 0.065, 0.06, hazardMat);
    addDecorBox(cx - halfW - 0.06, topY - 0.04, cz, 0.06, 0.065, cd + 0.22, hazardMat);
    addDecorBox(cx + halfW + 0.06, topY - 0.04, cz, 0.06, 0.065, cd + 0.22, hazardMat);

    // Open-frame structural steel columns + concrete footing plinths + under-deck I-beam girders + X-bracing
    const colClearH = Math.max(0.2, ch - deckThick);
    if (colClearH >= 0.45) {
      const nx = Math.max(2, Math.round(cw / 6.5) + 1);
      const nz = Math.max(2, Math.round(cd / 6.5) + 1);
      const xCoords = [];
      const zCoords = [];
      for (let ix = 0; ix < nx; ix++) {
        xCoords.push(cx - (halfW - 0.42) + (ix / (nx - 1)) * (cw - 0.84));
      }
      for (let iz = 0; iz < nz; iz++) {
        zCoords.push(cz - (halfD - 0.42) + (iz / (nz - 1)) * (cd - 0.84));
      }

      // Under-deck transverse & longitudinal I-beam joists
      const joistH = Math.min(0.28, colClearH * 0.26);
      const joistY = topY - deckThick - joistH * 0.5;
      for (let ix = 0; ix < xCoords.length; ix++) {
        addDecorBox(xCoords[ix], joistY, cz, 0.20, joistH, cd - 0.36, gunmetalFrameMat);
      }
      for (let iz = 0; iz < zCoords.length; iz++) {
        addDecorBox(cx, joistY, zCoords[iz], cw - 0.36, joistH, 0.20, gunmetalFrameMat);
      }

      // Perimeter & interior H-columns on bolted concrete anchor pads
      const padH = Math.min(0.18, colClearH * 0.16);
      const colH = Math.max(0.15, colClearH - padH);
      const colCy = botY + padH + colH * 0.5;
      for (let ix = 0; ix < xCoords.length; ix++) {
        for (let iz = 0; iz < zCoords.length; iz++) {
          const isEdge = ix === 0 || ix === xCoords.length - 1 || iz === 0 || iz === zCoords.length - 1;
          if (!isEdge && !highDetail) continue;
          const px = xCoords[ix];
          const pz = zCoords[iz];
          addDecorBox(px, botY + padH * 0.5, pz, 0.78, padH, 0.78, saltlineMats.concretePlinthMat);
          addSteelHColumn(px, colCy, pz, 0.42, colH, 0.42, ix % 2 === 0);
        }
      }

      // Diagonal structural steel cross-bracing struts in end bays on Medium/High
      if (highDetail && colH >= 0.9) {
        if (xCoords.length >= 2) {
          const bayW = xCoords[1] - xCoords[0];
          const braceLen = Math.hypot(bayW, colH) * 0.94;
          const braceAng = Math.atan2(colH, bayW);
          for (const zEdge of [zCoords[0], zCoords[zCoords.length - 1]]) {
            const bx = (xCoords[0] + xCoords[1]) * 0.5;
            addDecorBox(bx, colCy, zEdge, braceLen, 0.09, 0.09, gunmetalFrameMat, false, 0, 0, braceAng);
            addDecorBox(bx, colCy, zEdge, braceLen, 0.09, 0.09, gunmetalFrameMat, false, 0, 0, -braceAng);
          }
        }
        if (zCoords.length >= 2) {
          const bayD = zCoords[1] - zCoords[0];
          const braceLen = Math.hypot(bayD, colH) * 0.94;
          const braceAng = Math.atan2(colH, bayD);
          for (const xEdge of [xCoords[0], xCoords[xCoords.length - 1]]) {
            const bz = (zCoords[0] + zCoords[1]) * 0.5;
            addDecorBox(xEdge, colCy, bz, 0.09, 0.09, braceLen, gunmetalFrameMat, false, braceAng, 0, 0);
            addDecorBox(xEdge, colCy, bz, 0.09, 0.09, braceLen, gunmetalFrameMat, false, -braceAng, 0, 0);
          }
        }
      }
    }
  };

  // 6. Open-Stringer Industrial Checker-Plate Steel Staircase Step
  const buildSculptedStairStep = (obs, mainMat) => {
    const { x: cx, y: cy, z: cz, w: cw, h: ch, d: cd } = obs;
    const halfW = cw * 0.5;
    const halfH = ch * 0.5;
    const halfD = cd * 0.5;
    const topY = cy + halfH;
    const botY = cy - halfH;

    // `wideAlongX === true` means stair width runs along X (e.g. 4.8 x h x 1.0), ascending along Z
    const wideAlongX = cw >= cd;
    const treadThick = Math.min(0.085, ch * 0.35);

    // Individual checker-plate steel tread slab at topY (open underneath instead of a solid riser brick!)
    pushArchBox(mainMat, 'step', cx, topY - treadThick * 0.5, cz, cw, treadThick, cd);

    // Perforated kick-riser lip + anti-slip chrome/amber bullnose bars
    const riserDrop = Math.min(0.16, Math.max(0.06, ch - treadThick));
    if (wideAlongX) {
      addDecorBox(cx, topY - treadThick - riserDrop * 0.5, cz, cw - 0.08, riserDrop, Math.max(0.14, cd * 0.24), darkSteelMat);
      addDecorCyl(cx, topY - 0.022, cz - halfD - 0.012, 0.022, cw - 0.02, brushedChromeMat, 'x');
      addDecorCyl(cx, topY - 0.022, cz + halfD + 0.012, 0.022, cw - 0.02, brushedChromeMat, 'x');
      // Stepped side steel C-channel stringer cheeks along ±X ends (open beneath!)
      const stringerH = Math.min(ch, 0.64);
      const stringerCy = topY - stringerH * 0.5;
      for (const sx of [-1, 1]) {
        addDecorBox(cx + sx * (halfW - 0.035), stringerCy, cz, 0.075, stringerH, cd + 0.04, darkSteelMat, true);
        addDecorBox(cx + sx * (halfW - 0.01), stringerCy - stringerH * 0.5 + 0.03, cz, 0.13, 0.05, cd + 0.04, gunmetalFrameMat);
      }
      // Vertical steel support stanchions under upper steps down to floor baseplates
      if (ch >= 1.25) {
        for (const sx of [-1, 1]) {
          const px = cx + sx * (halfW - 0.08);
          addDecorCyl(px, botY + (ch - 0.12) * 0.5, cz, 0.055, ch - 0.12, gunmetalFrameMat, 'y');
          addDecorBox(px, botY + 0.03, cz, 0.22, 0.06, 0.22, darkSteelMat);
        }
      }
    } else {
      addDecorBox(cx, topY - treadThick - riserDrop * 0.5, cz, Math.max(0.14, cw * 0.24), riserDrop, cd - 0.08, darkSteelMat);
      addDecorCyl(cx - halfW - 0.012, topY - 0.022, cz, 0.022, cd - 0.02, brushedChromeMat, 'z');
      addDecorCyl(cx + halfW + 0.012, topY - 0.022, cz, 0.022, cd - 0.02, brushedChromeMat, 'z');
      const stringerH = Math.min(ch, 0.64);
      const stringerCy = topY - stringerH * 0.5;
      for (const sz of [-1, 1]) {
        addDecorBox(cx, stringerCy, cz + sz * (halfD - 0.035), cw + 0.04, stringerH, 0.075, darkSteelMat, true);
        addDecorBox(cx, stringerCy - stringerH * 0.5 + 0.03, cz + sz * (halfD - 0.01), cw + 0.04, 0.05, 0.13, gunmetalFrameMat);
      }
      if (ch >= 1.25) {
        for (const sz of [-1, 1]) {
          const pz = cz + sz * (halfD - 0.08);
          addDecorCyl(cx, botY + (ch - 0.12) * 0.5, pz, 0.055, ch - 0.12, gunmetalFrameMat, 'y');
          addDecorBox(cx, botY + 0.03, pz, 0.22, 0.06, 0.22, darkSteelMat);
        }
      }
    }
  };

  let crateIdx = 0;
  let containerIdx = 0;
  const containerColors = new Set();
  for (let i = 0; i < mapCfg.obstacles.length; i++) {
    const o = mapCfg.obstacles[i];
    if (o.type === 'container') containerColors.add(o.color);
  }
  const monochromeContainers = containerColors.size <= 1;
  const MARITIME_CONTAINER_HUES = [0x1d4e7a, 0x9e3229, 0x465c3e, 0xb56f28, 0x4e5d6c];
  const resolveContainerVisualColor = (obsColor, idx) => {
    if (monochromeContainers) {
      return MARITIME_CONTAINER_HUES[idx % MARITIME_CONTAINER_HUES.length];
    }
    const c = new THREE.Color(obsColor ?? 0x64748b);
    const hsl = { h: 0, s: 0, l: 0 };
    c.getHSL(hsl);
    if (hsl.s < 0.20) {
      return MARITIME_CONTAINER_HUES[idx % MARITIME_CONTAINER_HUES.length];
    }
    return obsColor;
  };

  const crateGltf = preset.glbProps ? game.assets?.loadedModels?.get('crate-wide') : null;
  const crateObstacleBatch = crateGltf ? new PropBatcher(crateGltf.scene, 'crate-obstacle') : null;
  const crateTopperBatch = crateGltf ? new PropBatcher(crateGltf.scene, 'crate-topper') : null;
  game.propBatchers = [crateObstacleBatch, crateTopperBatch].filter(Boolean);

  const dustCtx = isDesertMap
    ? {
        game,
        halfSize,
        highDetail,
        plan,
        dustMats: createDustArchitectureMaterials(game, plan, highDetail),
        saltlineMats,
        pushArchMesh,
        pushArchBox,
        pushArchFrustum,
        addDecorBox,
        addDecorCyl,
        addDecorSandbag
      }
    : null;

  for (const obs of mapCfg.obstacles) {
    const visualColor = obs.type === 'container' ? resolveContainerVisualColor(obs.color, containerIdx++) : obs.color;
    const mainMat = getMat(visualColor, obs.type);
    const geo = new THREE.BoxGeometry(obs.w, obs.h, obs.d);
    applyMetricBoxUV1(
      geo,
      obs.w,
      obs.h,
      obs.d,
      (plan[obs.type] || plan.wall).tile,
      uvOffsetFor(obs.x, obs.y, obs.z)
    );
    if (obs.type === 'wall' || obs.type === 'platform') {
      applyBoxWorldUVs(geo, obs.w, obs.h, obs.d, 3.2);
    } else if (obs.type === 'step') {
      applyBoxWorldUVs(geo, obs.w, obs.h, obs.d, 1.6);
    }
    game.arenaGeometries.add(geo);
    // Keep exact 1:1 invisible proxy mesh in `game.worldMeshes` for raycasting, bullet decals, and shell collisions,
    // while rendering sculpted 3D architecture without solid monolithic brick poke-through!
    const mesh = new THREE.Mesh(geo, mainMat);
    mesh.position.set(obs.x, obs.y, obs.z);
    mesh.visible = false;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.updateMatrix();
    mesh.matrixAutoUpdate = false;
    game.scene.add(mesh);
    game.worldMeshes.push(mesh);

    const topY = obs.y + obs.h * 0.5;

    if (obs.type === 'container') {
      buildSculptedIsoContainer(obs, mainMat, getContainerValleyMat(visualColor));
    } else if (
      obs.type === 'crate' &&
      crateObstacleBatch?.tryAdd({ x: obs.x, y: obs.y, z: obs.z }, { w: obs.w, h: obs.h, d: obs.d })
    ) {
      crateIdx++;
    } else if (obs.type === 'crate') {
      crateIdx++;
      if (dustCtx) {
        buildDustTimberCrate(dustCtx, obs, mainMat);
      } else {
        buildSculptedCargoCrate(obs, mainMat);
      }
      if (obs.w >= 2.1 && obs.d >= 2.0 && obs.h >= 1.8 && crateIdx % 2 === 1) {
        crateTopperBatch?.tryAddContained(
          { x: obs.x, z: obs.z },
          topY + 0.08,
          { w: obs.w * 0.7, h: 0.5, d: obs.d * 0.6 }
        );
      }
    } else if (obs.type === 'pillar') {
      if (dustCtx) buildDustSandstonePillar(dustCtx, obs, mainMat);
      else buildSculptedPillar(obs, mainMat);
    } else if (obs.type === 'platform') {
      if (dustCtx) buildDustTerracePlatform(dustCtx, obs, mainMat);
      else buildSculptedGantryPlatform(obs, mainMat);
    } else if (obs.type === 'step') {
      if (dustCtx) buildDustSandstoneStep(dustCtx, obs, mainMat);
      else buildSculptedStairStep(obs, mainMat);
    } else if (dustCtx) {
      buildDustMoroccanWall(dustCtx, obs, mainMat);
    } else {
      buildSculptedWall(obs, mainMat);
    }
  }

  if (dustCtx) {
    buildDustArchitectureAccents(dustCtx);
  } else {
    // Corner Guard Watchtowers & Harbor Radar Beacons
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const cx = sx * (halfSize - 0.5);
        const cz = sz * (halfSize - 0.5);
        addDecorBox(cx, 12, cz, 5.2, 24, 5.2, darkSteelMat);
        addDecorBox(cx, 21.5, cz, 7.0, 3.0, 7.0, gunmetalFrameMat);
        addDecorBox(cx, 23.3, cz, 7.4, 0.42, 7.4, hazardMat);
        addDecorBox(cx, 25.4, cz, 2.0, 1.6, 2.0, trimAccentMat);
      }
    }
  }

  const saltlineCtx = {
    mats: saltlineMats,
    registerInstancedItem,
    unitBoxGeo,
    unitCylGeo
  };

  buildSaltlinePerimeterProps({
    game,
    mapId: mapCfg.id,
    halfSize,
    isDesert,
    highDetail,
    registerInstanced: registerInstancedItem,
    unitBoxGeo,
    unitCylGeo,
    mats: saltlineMats,
    darkSteelMat,
    gunmetalFrameMat,
    brushedChromeMat,
    hazardMat,
    trimAccentMat
  });

  buildMapLandmarks(
    game,
    mapCfg.id,
    halfSize,
    addDecorBox,
    addDecorCyl,
    darkSteelMat,
    gunmetalFrameMat,
    brushedChromeMat,
    hazardMat,
    trimAccentMat,
    trimSecondaryMat,
    saltlineCtx
  );

  buildGroundContactAO(game, mapCfg, halfSize);
  buildSaltlineArenaDecals(game, mapCfg, halfSize);
  buildBombsiteRouteDecals(game, mapCfg, halfSize);
  if (isDesertMap) {
    void buildDustMitDecals(game, mapCfg, halfSize, arenaBuildSeq);
  }

  const shadowsEnabled = (preset.shadowMapSize ?? 0) > 0 && !preset.mergeWorldMeshes;

  // Flush Pipeline 2: Merged world-metric PBR architectural hulls (1 draw call per primary material!)
  game.mergedWorldMeshes = [];
  for (const [mat, list] of archMeshBatches.entries()) {
    if (!list.length) continue;
    const mergedGeo = mergeMeshGeometries(list);
    for (let i = 0; i < list.length; i++) {
      list[i].geometry.dispose();
    }
    game.arenaGeometries.add(mergedGeo);
    const mergedMesh = new THREE.Mesh(mergedGeo, mat);
    mergedMesh.castShadow = shadowsEnabled;
    mergedMesh.receiveShadow = true;
    mergedMesh.frustumCulled = false;
    mergedMesh.updateMatrix();
    mergedMesh.matrixAutoUpdate = false;
    game.scene.add(mergedMesh);
    game.arenaDecorMeshes.push(mergedMesh);
    game.mergedWorldMeshes.push(mergedMesh);
  }

  // Flush Pipeline 1: Shared secondary structural hardware via InstancedMesh
  const dummy = new THREE.Object3D();
  for (const [geo, groupMap] of decorBatches.entries()) {
    for (const [mat, batch] of groupMap.entries()) {
      const count = batch.items.length;
      if (count === 0) continue;
      const instMesh = new THREE.InstancedMesh(geo, mat, count);
      instMesh.castShadow = batch.castShadow && shadowsEnabled;
      instMesh.receiveShadow = isDesertMap ? shadowsEnabled : batch.castShadow;
      for (let i = 0; i < count; i++) {
        const it = batch.items[i];
        dummy.position.set(it.x, it.y, it.z);
        dummy.rotation.set(it.rotation.x, it.rotation.y, it.rotation.z);
        dummy.scale.set(it.sx, it.sy, it.sz);
        dummy.updateMatrix();
        instMesh.setMatrixAt(i, dummy.matrix);
      }
      instMesh.instanceMatrix.needsUpdate = true;
      instMesh.frustumCulled = false;
      instMesh.updateMatrix();
      instMesh.matrixAutoUpdate = false;
      game.scene.add(instMesh);
      game.arenaDecorMeshes.push(instMesh);
    }
  }

  for (const batcher of game.propBatchers) batcher.flush(game, true);

  placeMapPolyhavenProps(game, mapCfg, arenaBuildSeq);

  game.rebuildHitboxList?.();
}
