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
  analyzeDust2Landmarks,
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
import { createCsgoMapBuilder } from './csgoMapArchitecture.js';
import {
  applyBoxWorldUVs,
  createFloorBumpTexture,
  createGridTexture,
  createObstacleBumpTexture,
  createObstacleTexture
} from './proceduralTextures.js';
import {
  buildBombsiteRouteDecals,
  buildCsgoWorldDecals,
  buildDustCourtyardBackdrop,
  createSaltlineBackdropMaterials,
  createTrapezoidPrismGeometry
} from './saltlinePropsAndBackdrops.js';

const ARID_SURFACE_MAPS = new Set(['de_dust2', 'de_mirage', 'de_inferno']);

function resolveArenaMapId(rawId) {
  if (rawId === 'de_dust2' || rawId === 'de_mirage' || rawId === 'de_inferno' || rawId === 'de_nuke' || rawId === 'fy_iceworld' || rawId === 'aim_map') {
    return rawId;
  }
  return 'de_dust2';
}

/**
 * Legacy barrel export hook retained for `arenaBuilder.js` compatibility.
 * All bespoke CS:GO architectural landmarks are dispatched directly inside `buildArena()`
 * via `dustArchitecture.js` (`de_dust2`) and `csgoMapArchitecture.js` (`de_mirage`, `de_inferno`,
 * `de_nuke`, `fy_iceworld`, `aim_map`).
 */
export function buildMapLandmarks() {
  // Bespoke CS:GO landmarks are constructed per-map in `dustArchitecture.js` & `csgoMapArchitecture.js`.
}

/**
 * Bakes the world matrices of many indexed meshes into ONE BufferGeometry (position, normal, uv, uv1, index).
 * Used to batch multi-part sculpted CS2 architectural hulls into one draw call per material while preserving
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
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext?.('2d');
  if (!ctx) return null;
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

  ctx.fillStyle = stops[0][1];
  ctx.fillRect(32, 32, 64, 64);

  ctx.fillStyle = applyStops(ctx.createLinearGradient(0, 32, 0, 0));
  ctx.fillRect(32, 0, 64, 32);
  ctx.fillStyle = applyStops(ctx.createLinearGradient(0, 96, 0, 128));
  ctx.fillRect(32, 96, 64, 32);
  ctx.fillStyle = applyStops(ctx.createLinearGradient(32, 0, 0, 0));
  ctx.fillRect(0, 32, 32, 64);
  ctx.fillStyle = applyStops(ctx.createLinearGradient(96, 0, 128, 0));
  ctx.fillRect(96, 32, 32, 64);

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

function createSandbagTexture(game) {
  if (typeof document === 'undefined') return null;
  const sandbagCanvas = document.createElement('canvas');
  sandbagCanvas.width = 128;
  sandbagCanvas.height = 128;
  const sbCtx = sandbagCanvas.getContext?.('2d');
  if (!sbCtx) return null;
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
  game.arenaTextures?.add(sandbagTex);
  return sandbagTex;
}

/**
 * Builds ONE single merged BufferGeometry + MeshBasicMaterial placing soft grounded AO skirts
 * (~0.60m outward fade at y = 0.007, renderOrder = 0) around every ground-level container, wall,
 * crate, pillar, and platform column. Registered in arenaGeometries/arenaMaterials/arenaTextures.
 */
export function buildGroundContactAO(game, mapCfg = {}, halfSize = 38) {
  const preset = game?.quality || QUALITY.medium;
  const highDetail = (preset.envMapSize ?? 512) > 0;
  const obstacles = mapCfg?.obstacles || [];
  const quads = [];
  const y = 0.007;

  const pushAO9Slice = (cx, cz, w, d, skirtPad = 0.60, includeCenter = true) => {
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
      pushAO9Slice(obs.x, obs.z, obs.w, obs.d, 0.62, true);
    } else if (obs.type === 'crate') {
      pushAO9Slice(obs.x, obs.z, obs.w, obs.d, 0.54, true);
    } else if (obs.type === 'pillar') {
      pushAO9Slice(obs.x, obs.z, obs.w + 0.36, obs.d + 0.36, 0.60, true);
    } else if (obs.type === 'platform') {
      const deckThick = Math.min(0.22, obs.h * 0.25);
      const colClearH = Math.max(0.2, obs.h - deckThick);
      if (colClearH >= 0.45 && mapCfg?.id === 'de_nuke') {
        const nx = Math.max(2, Math.round(obs.w / 5.5) + 1);
        const nz = Math.max(2, Math.round(obs.d / 5.5) + 1);
        for (let ix = 0; ix < nx; ix++) {
          const px = obs.x - (obs.w * 0.5 - 0.38) + (ix / (nx - 1)) * (obs.w - 0.76);
          for (let iz = 0; iz < nz; iz++) {
            const isEdge = ix === 0 || ix === nx - 1 || iz === 0 || iz === nz - 1;
            if (!isEdge && !highDetail) continue;
            const pz = obs.z - (obs.d * 0.5 - 0.38) + (iz / (nz - 1)) * (obs.d - 0.76);
            pushAO9Slice(px, pz, 0.72, 0.72, 0.48, true);
          }
        }
      } else {
        pushAO9Slice(obs.x, obs.z, obs.w, obs.d, 0.60, false);
      }
    } else if (obs.type === 'wall') {
      const isPerimeter = Math.max(obs.w, obs.d) > 80 || Math.max(obs.w, obs.d) >= halfSize * 1.8;
      if (isPerimeter) {
        pushAO9Slice(obs.x, obs.z, obs.w, obs.d, 0.60, false);
      } else if (obs.h < 2.2) {
        pushAO9Slice(obs.x, obs.z, obs.w, obs.d, 0.54, false);
      } else {
        pushAO9Slice(obs.x, obs.z, obs.w + 0.16, obs.d + 0.16, 0.60, false);
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
  const mapId = resolveArenaMapId(mapCfg?.id);
  const halfSize = mapCfg.arenaHalfSize || game?.arenaHalfSize || 38;
  const span = halfSize * 2;
  const theme = mapCfg.theme || {};
  const preset = game?.quality || QUALITY.medium;
  const highDetail = (preset.envMapSize ?? 512) > 0;
  const plan = getSurfacePlan(mapId);
  game.pbrSlots = [];
  game._arenaBuildSeq = (game._arenaBuildSeq || 0) + 1;
  const arenaBuildSeq = game._arenaBuildSeq;

  const isDust2 = mapId === 'de_dust2';
  const isMirage = mapId === 'de_mirage';
  const isArid = ARID_SURFACE_MAPS.has(mapId);
  const hasDom = typeof document !== 'undefined';

  // Ground Floor with weathered concrete/cobble/dirt diffuse, bump, roughness relief & macro grime
  const floorGeo = new THREE.PlaneGeometry(span, span);
  const floorBumpTex = hasDom ? createFloorBumpTexture(game, halfSize) : null;
  const floorMat = new THREE.MeshStandardMaterial({
    map: hasDom ? createGridTexture(game, theme, halfSize) : null,
    bumpMap: floorBumpTex,
    roughnessMap: floorBumpTex,
    bumpScale: 0.048,
    roughness: isArid ? 0.90 : mapId === 'fy_iceworld' ? 0.78 : 0.84,
    metalness: isArid ? 0.02 : 0.05,
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 1
  });
  game.arenaMaterials.add(floorMat);
  const baseWetStrength = preset.wetFloorStrength || 0;
  const effectiveWetStrength = isArid ? baseWetStrength * 0.28 : baseWetStrength;
  applySaltlineWetFloorShader(floorMat, effectiveWetStrength);
  attachWorldMacroGrime(floorMat, { mapId, role: 'floor', enabled: highDetail });
  game.floorMat = floorMat;
  applyMetricPlaneUV1(floorGeo, span, span, plan.floor.tile);
  game.arenaGeometries.add(floorGeo);
  const floorPbrTint = resolveTint(plan.floor, null, 'floor', mapId);
  registerPbrSlot(game, floorMat, plan.floor, isArid ? floorPbrTint : liftTintHex(floorPbrTint, 0.04));
  const floorMesh = new THREE.Mesh(floorGeo, floorMat);
  floorMesh.rotation.x = -Math.PI / 2;
  floorMesh.receiveShadow = true;
  game.scene.add(floorMesh);
  game.worldMeshes.push(floorMesh);

  const bumpCache = new Map();
  const getBump = (type = 'wall') => {
    if (!hasDom) return null;
    if (!bumpCache.has(type)) {
      bumpCache.set(type, createObstacleBumpTexture(game, type));
    }
    return bumpCache.get(type);
  };

  game.wallWeatherMats = [];
  const matCache = new Map();
  const getMat = (colorHex, type = 'wall') => {
    const effectiveHex = isDust2 ? remapDesertObstacleColor(colorHex, type) : colorHex;
    const key = `${effectiveHex}_${type}`;
    if (!matCache.has(key)) {
      const isContainer = type === 'container';
      const isNukeMetal = mapId === 'de_nuke' && (type === 'platform' || type === 'step' || type === 'crate');
      const isMetal = isContainer || isNukeMetal || (mapId === 'aim_map' && type === 'step');
      const isPlatform = type === 'platform';
      const isWoodCrate = type === 'crate' && !isNukeMetal;
      const bumpTex = getBump(type);
      const obsHex = isDust2 ? effectiveHex || 0xcbb99d : liftTintHex(effectiveHex || 0x64748b, 0.04);
      const m = new THREE.MeshStandardMaterial({
        map: hasDom ? createObstacleTexture(game, obsHex, type) : null,
        bumpMap: bumpTex,
        roughnessMap: bumpTex,
        bumpScale: isMetal ? 0.052 : isPlatform ? 0.042 : 0.040,
        roughness: isMetal
          ? 0.46
          : isArid
            ? isWoodCrate
              ? 0.84
              : type === 'wall'
                ? 0.90
                : 0.88
            : isPlatform
              ? 0.74
              : isWoodCrate
                ? 0.82
                : 0.84,
        metalness: isMetal ? 0.48 : isArid ? (isWoodCrate ? 0.04 : 0.02) : isPlatform ? 0.08 : 0.05
      });
      const disableWallWeather = mapId === 'fy_iceworld' || mapId === 'aim_map';
      if (type === 'wall' || type === 'container' || type === 'pillar') {
        const wallStrength = disableWallWeather
          ? 0
          : effectiveWetStrength > 0
            ? Math.min(1, effectiveWetStrength * 1.15)
            : 0;
        applySaltlineWallWeatheringShader(m, wallStrength);
        if (!disableWallWeather) {
          game.wallWeatherMats.push(m);
        }
      }
      attachWorldMacroGrime(m, { mapId, role: type, enabled: highDetail });
      game.arenaMaterials.add(m);
      const spec = plan[type] || plan.wall;
      const tintSource = isDust2 ? colorHex || 0xcbb99d : obsHex;
      const resolvedTint = resolveTint(spec, tintSource, type, mapId);
      registerPbrSlot(game, m, spec, isArid ? resolvedTint : liftTintHex(resolvedTint, 0.04));
      matCache.set(key, m);
    }
    return matCache.get(key);
  };

  const valleyMatCache = new Map();
  const getContainerValleyMat = (colorHex) => {
    const key = `${colorHex}_valley`;
    if (!valleyMatCache.has(key)) {
      const effectiveHex = isDust2 ? remapDesertObstacleColor(colorHex, 'container') : colorHex;
      const obsHex = liftTintHex(effectiveHex || 0x4e5d6c, 0.04);
      const procColor = new THREE.Color(obsHex);
      const pHsl = { h: 0, s: 0, l: 0 };
      procColor.getHSL(pHsl);
      procColor.setHSL(pHsl.h, pHsl.s, Math.max(0.14, pHsl.l * 0.58));

      const bumpTex = getBump('container');
      const vm = new THREE.MeshStandardMaterial({
        map: hasDom ? createObstacleTexture(game, procColor.getHex(), 'container') : null,
        bumpMap: bumpTex,
        roughnessMap: bumpTex,
        bumpScale: 0.046,
        roughness: 0.56,
        metalness: 0.44
      });
      const disableWallWeather = mapId === 'fy_iceworld' || mapId === 'aim_map';
      const wallStrength = disableWallWeather
        ? 0
        : effectiveWetStrength > 0
          ? Math.min(1, effectiveWetStrength * 1.15)
          : 0;
      applySaltlineWallWeatheringShader(vm, wallStrength);
      if (!disableWallWeather) {
        game.wallWeatherMats.push(vm);
      }
      game.arenaMaterials.add(vm);

      const tintSource = isDust2 ? colorHex || 0x4e5d6c : obsHex;
      const pbrBase = new THREE.Color(resolveTint(plan.container, tintSource, 'container', mapId));
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
  const sandbagTex = createSandbagTexture(game);
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
    roughness: 0.42,
    metalness: 0.50
  });
  const trimSecondaryMat = new THREE.MeshStandardMaterial({
    color: theme.secondaryHex || 0x4a6b8a,
    roughness: 0.44,
    metalness: 0.48
  });

  for (const m of [
    darkSteelMat,
    gunmetalFrameMat,
    brushedChromeMat,
    hazardMat,
    barrelOliveMat,
    sandbagMat,
    trimAccentMat,
    trimSecondaryMat
  ]) {
    game.arenaMaterials.add(m);
  }

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

  // Structural Steel H-Column (twin flanges + recessed web) shared by Nuke & aim_map
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

  // Sculpted ISO 20ft / 40ft Corrugated Shipping Container (used by Dust II Long A Blue, Nuke Red/Blue, Mirage Ticket, aim_map)
  const buildSculptedIsoContainer = (obs, mainMat, valleyMat = mainMat) => {
    const { x: cx, y: cy, z: cz, w: cw, h: ch, d: cd } = obs;
    const alongZ = cd >= cw;
    const halfW = cw * 0.5;
    const halfH = ch * 0.5;
    const halfD = cd * 0.5;
    const topY = cy + halfH;
    const botY = cy - halfH;
    const isGround = botY <= 0.15;

    pushArchBox(valleyMat, 'container', cx, cy, cz, Math.max(0.4, cw - 0.17), Math.max(0.4, ch - 0.20), Math.max(0.4, cd - 0.17));

    const railH = 0.16;
    const railT = 0.15;
    const postS = 0.18;
    for (const sy of [-1, 1]) {
      const ry = cy + sy * (halfH - railH * 0.5);
      addDecorBox(cx - halfW + railT * 0.5, ry, cz, railT, railH, Math.max(0.2, cd - 0.44), darkSteelMat, true);
      addDecorBox(cx + halfW - railT * 0.5, ry, cz, railT, railH, Math.max(0.2, cd - 0.44), darkSteelMat, true);
      addDecorBox(cx, ry, cz - halfD + railT * 0.5, Math.max(0.2, cw - 0.44), railH, railT, darkSteelMat, true);
      addDecorBox(cx, ry, cz + halfD - railT * 0.5, Math.max(0.2, cw - 0.44), railH, railT, darkSteelMat, true);
    }

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
          addDecorBox(ccx + sx * (castW * 0.5 + 0.004), ccy, ccz, 0.012, 0.075, 0.115, saltlineMats.rubberFenderMat);
          addDecorBox(ccx, ccy, ccz + sz * (castW * 0.5 + 0.004), 0.115, 0.075, 0.012, saltlineMats.rubberFenderMat);
        }
      }
    }

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

    // Trapezoidal corrugated side wall ribs + walkable roof deck ribs
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
          const rxCenter = cx + sideSign * (halfW - ribDepth * 0.5);
          pushArchFrustum(mainMat, 'container', rxCenter, cy, cz + alongPos, ribH, ribDepth, ribBaseW, ribH, ribTopW, 0, 0, sideSign > 0 ? -Math.PI * 0.5 : Math.PI * 0.5);
        } else {
          const rzCenter = cz + sideSign * (halfD - ribDepth * 0.5);
          pushArchFrustum(mainMat, 'container', cx + alongPos, cy, rzCenter, ribBaseW, ribDepth, ribH, ribTopW, ribH, sideSign > 0 ? Math.PI * 0.5 : -Math.PI * 0.5, 0, 0);
        }
      }
    }

    pushArchBox(mainMat, 'container', cx, topY - 0.075, cz, Math.max(0.3, cw - 0.28), 0.07, Math.max(0.3, cd - 0.28));
    const roofRibCount = Math.max(4, Math.floor(usableSpan / (highDetail ? 0.72 : 1.15)));
    for (let r = 0; r < roofRibCount; r++) {
      const alongPos = -usableSpan * 0.5 + ((r + 0.5) / roofRibCount) * usableSpan;
      if (alongZ) pushArchBox(mainMat, 'container', cx, topY - 0.022, cz + alongPos, Math.max(0.3, cw - 0.34), 0.044, 0.24);
      else pushArchBox(mainMat, 'container', cx + alongPos, topY - 0.022, cz, 0.24, 0.044, Math.max(0.3, cd - 0.34));
    }

    // Recessed Double Cargo Doors + 4 Galvanized Chrome Locking Rods
    const doorEndSign = alongZ ? (cz >= 0 ? -1 : 1) : cx >= 0 ? -1 : 1;
    const panelH = Math.max(0.3, ch - railH * 2.08);
    const leafSpan = Math.max(0.3, (crossSpan - 0.46) * 0.5 - 0.035);

    for (const endSign of [doorEndSign, -doorEndSign]) {
      const isDoorEnd = endSign === doorEndSign;
      if (alongZ) {
        const doorZ = cz + endSign * (halfD - 0.065);
        if (isDoorEnd) {
          for (const leafSign of [-1, 1]) {
            pushArchBox(mainMat, 'container', cx + leafSign * (leafSpan * 0.5 + 0.03), cy, doorZ, leafSpan, panelH, 0.055);
            if (highDetail) {
              for (const hyOff of [-0.36, -0.12, 0.12, 0.36]) {
                addDecorBox(cx + leafSign * (halfW - 0.16), cy + hyOff * panelH, doorZ + endSign * 0.038, 0.075, 0.11, 0.045, gunmetalFrameMat);
              }
            }
          }
          addDecorBox(cx, cy, doorZ + endSign * 0.026, 0.055, panelH + 0.04, 0.03, saltlineMats.rubberFenderMat);
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
          addDecorBox(cx - leafSpan * 0.48, cy - panelH * 0.26, doorZ + endSign * 0.032, 0.38, 0.24, 0.016, darkSteelMat);
        } else {
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
                addDecorBox(doorX + endSign * 0.038, cy + hyOff * panelH, cz + leafSign * (halfD - 0.16), 0.045, 0.11, 0.075, gunmetalFrameMat);
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

    if (highDetail) {
      if (alongZ && ch >= 2.2 && cd >= 5.0) {
        const faceSign = cx >= 0 ? -1 : 1;
        addDecorBox(cx + faceSign * (halfW + 0.022), cy + 0.25, cz + Math.min(1.2, cd * 0.16), 0.04, 1.08, 1.38, darkSteelMat);
      } else if (!alongZ && ch >= 2.2 && cw >= 5.0) {
        const faceSign = cz >= 0 ? -1 : 1;
        addDecorBox(cx + Math.min(1.2, cw * 0.16), cy + 0.25, cz + faceSign * (halfD + 0.022), 1.38, 1.08, 0.04, darkSteelMat);
      }
    }
  };

  // Open-Stringer Industrial Checker-Plate Steel Staircase Step (shared by Nuke & aim_map)
  const buildSculptedStairStep = (obs, mainMat) => {
    const { x: cx, y: cy, z: cz, w: cw, h: ch, d: cd } = obs;
    const halfW = cw * 0.5;
    const halfH = ch * 0.5;
    const halfD = cd * 0.5;
    const topY = cy + halfH;
    const botY = cy - halfH;

    const wideAlongX = cw >= cd;
    const treadThick = Math.min(0.085, ch * 0.35);
    pushArchBox(mainMat, 'step', cx, topY - treadThick * 0.5, cz, cw, treadThick, cd);

    const riserDrop = Math.min(0.16, Math.max(0.06, ch - treadThick));
    if (wideAlongX) {
      addDecorBox(cx, topY - treadThick - riserDrop * 0.5, cz, cw - 0.08, riserDrop, Math.max(0.14, cd * 0.24), darkSteelMat);
      addDecorCyl(cx, topY - 0.022, cz - halfD - 0.012, 0.022, cw - 0.02, brushedChromeMat, 'x');
      addDecorCyl(cx, topY - 0.022, cz + halfD + 0.012, 0.022, cw - 0.02, brushedChromeMat, 'x');
      const stringerH = Math.min(ch, 0.64);
      const stringerCy = topY - stringerH * 0.5;
      for (const sx of [-1, 1]) {
        addDecorBox(cx + sx * (halfW - 0.035), stringerCy, cz, 0.075, stringerH, cd + 0.04, darkSteelMat, true);
        addDecorBox(cx + sx * (halfW - 0.01), stringerCy - stringerH * 0.5 + 0.03, cz, 0.13, 0.05, cd + 0.04, gunmetalFrameMat);
      }
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

  const crateGltf = preset.glbProps ? game.assets?.loadedModels?.get('crate-wide') : null;
  const crateObstacleBatch = crateGltf ? new PropBatcher(crateGltf.scene, 'crate-obstacle') : null;
  const crateTopperBatch = crateGltf ? new PropBatcher(crateGltf.scene, 'crate-topper') : null;
  game.propBatchers = [crateObstacleBatch, crateTopperBatch].filter(Boolean);

  const sharedArchCtx = {
    game,
    mapCfg,
    halfSize,
    highDetail,
    plan,
    saltlineMats,
    darkSteelMat,
    gunmetalFrameMat,
    brushedChromeMat,
    hazardMat,
    registerInstancedItem,
    unitBoxGeo,
    unitCylGeo,
    pushArchMesh,
    pushArchBox,
    pushArchFrustum,
    addDecorBox,
    addDecorCyl,
    addDecorSandbag,
    addSteelHColumn,
    buildSculptedStairStep
  };

  const dustCtx = isDust2
    ? {
        ...sharedArchCtx,
        dustMats: createDustArchitectureMaterials(game, plan, highDetail, 'de_dust2'),
        dustLandmarks: analyzeDust2Landmarks(mapCfg, halfSize)
      }
    : null;

  const csgoBuilder = isDust2 ? null : createCsgoMapBuilder(mapId, sharedArchCtx);

  let crateIdx = 0;
  for (const obs of mapCfg.obstacles || []) {
    const mainMat = getMat(obs.color, obs.type);
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

    // Exact 1:1 invisible proxy mesh in `game.worldMeshes` for raycasting, bullet decals, and shell collisions
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
      if (csgoBuilder?.buildContainer) {
        csgoBuilder.buildContainer(obs, mainMat);
      } else {
        buildSculptedIsoContainer(obs, mainMat, getContainerValleyMat(obs.color));
      }
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
        csgoBuilder.buildCrate(obs, mainMat);
      }
      if (obs.w >= 2.0 && obs.d >= 1.8 && obs.h >= 1.6 && crateIdx % 2 === 1) {
        crateTopperBatch?.tryAddContained(
          { x: obs.x, z: obs.z },
          topY + 0.08,
          { w: obs.w * 0.7, h: 0.5, d: obs.d * 0.6 }
        );
      }
    } else if (obs.type === 'pillar') {
      if (dustCtx) buildDustSandstonePillar(dustCtx, obs, mainMat);
      else csgoBuilder.buildPillar(obs, mainMat);
    } else if (obs.type === 'platform') {
      if (dustCtx) buildDustTerracePlatform(dustCtx, obs, mainMat);
      else csgoBuilder.buildPlatform(obs, mainMat);
    } else if (obs.type === 'step') {
      if (dustCtx) buildDustSandstoneStep(dustCtx, obs, mainMat);
      else csgoBuilder.buildStep(obs, mainMat);
    } else if (dustCtx) {
      buildDustMoroccanWall(dustCtx, obs, mainMat);
    } else {
      csgoBuilder.buildWall(obs, mainMat);
    }
  }

  // Bespoke CS:GO Map Architectural Accents, Arches, Canopies & Overhead Wires
  if (dustCtx) {
    buildDustArchitectureAccents(dustCtx);
    buildDustCourtyardBackdrop({
      game,
      halfSize,
      highDetail,
      registerInstanced: registerInstancedItem,
      unitBoxGeo,
      unitCylGeo,
      mats: saltlineMats,
      darkSteelMat: dustCtx.dustMats.forgedIronMat,
      variant: 'dust2'
    });
  } else if (csgoBuilder?.buildAccents) {
    csgoBuilder.buildAccents();
  }

  buildGroundContactAO(game, mapCfg, halfSize);
  buildCsgoWorldDecals(game, mapCfg, halfSize);
  buildBombsiteRouteDecals(game, mapCfg, halfSize);
  if (isDust2 || isMirage) {
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
      instMesh.receiveShadow = isArid ? shadowsEnabled : batch.castShadow;
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
