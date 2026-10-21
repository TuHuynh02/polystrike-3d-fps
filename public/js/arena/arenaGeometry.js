import * as THREE from '../three.js';
import { QUALITY } from '../quality.js';
import {
  applyMetricBoxUV1,
  applyMetricPlaneUV1,
  getSurfacePlan,
  registerPbrSlot,
  resolveTint,
  uvOffsetFor
} from '../surfaceMaterials.js';
import { PropBatcher } from '../arenaProps.js';
import { buildSkyAndAtmosphere } from './skyAtmosphere.js';
import {
  applyBoxWorldUVs,
  createFloorBumpTexture,
  createGridTexture,
  createObstacleBumpTexture,
  createObstacleTexture
} from './proceduralTextures.js';

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
  trimSecondaryMat
) {
  if (mapId === 'cargo_dock') {
    // 2 Massive Industrial Port Gantry Cranes spanning West & East Dockyards
    for (const sideSign of [-1, 1]) {
      const gx = sideSign * 38;
      for (const lz of [-7.4, 7.4]) {
        addDecorBox(gx - 5.2, 11.5, lz, 1.1, 21.0, 1.1, hazardMat, true);
        addDecorBox(gx + 5.2, 11.5, lz, 1.1, 21.0, 1.1, hazardMat, true);
        addDecorBox(gx, 10.5, lz, 11.2, 0.65, 0.65, darkSteelMat);
        addDecorBox(gx, 16.5, lz, 11.2, 0.65, 0.65, darkSteelMat);
        addDecorBox(gx, 21.5, lz, 12.2, 1.1, 1.3, gunmetalFrameMat);
      }
      const boomX = gx - sideSign * 6.5;
      addDecorBox(boomX, 22.4, 0, 28.0, 1.4, 16.2, darkSteelMat, true);
      addDecorBox(boomX, 23.2, -7.4, 28.5, 0.35, 0.45, trimAccentMat);
      addDecorBox(boomX, 23.2, 7.4, 28.5, 0.35, 0.45, trimAccentMat);

      const cabX = gx - sideSign * 14.0;
      addDecorBox(cabX, 20.6, 0, 3.8, 2.2, 3.4, gunmetalFrameMat);
      addDecorBox(cabX, 20.4, 0, 4.0, 0.8, 3.6, trimSecondaryMat);

      addDecorCyl(cabX, 17.2, -2.6, 0.06, 6.2, brushedChromeMat, 'y');
      addDecorCyl(cabX, 17.2, 2.6, 0.06, 6.2, brushedChromeMat, 'y');
      addDecorBox(cabX, 14.8, 0, 3.6, 0.45, 7.6, hazardMat);
      addDecorBox(cabX, 13.0, 0, 3.4, 3.0, 8.2, gunmetalFrameMat, true);
      addDecorBox(cabX, 13.0, 0, 3.55, 0.45, 8.3, trimAccentMat);
    }
  } else if (mapId === 'desert_outpost') {
    const dishGroup = new THREE.Group();
    dishGroup.position.set(0, 13.8, 0);

    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.65, 4.2, 12), darkSteelMat);
    game.arenaGeometries.add(mast.geometry);
    dishGroup.add(mast);

    const dishGeo = new THREE.ConeGeometry(4.2, 1.8, 20, 1, true);
    game.arenaGeometries.add(dishGeo);
    const dishMesh = new THREE.Mesh(dishGeo, brushedChromeMat);
    dishMesh.rotation.x = Math.PI * 0.68;
    dishMesh.position.set(0, 1.6, 0.6);
    dishGroup.add(dishMesh);

    const emitter = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.35, 2.6, 10), trimAccentMat);
    game.arenaGeometries.add(emitter.geometry);
    emitter.rotation.x = Math.PI / 2;
    emitter.position.set(0, 2.2, 1.4);
    dishGroup.add(emitter);

    const wingGeo = new THREE.BoxGeometry(6.5, 0.18, 2.4);
    game.arenaGeometries.add(wingGeo);
    const wingL = new THREE.Mesh(wingGeo, trimSecondaryMat);
    const wingR = new THREE.Mesh(wingGeo, trimSecondaryMat);
    wingL.position.set(-5.2, 0.8, 0);
    wingR.position.set(5.2, 0.8, 0);
    dishGroup.add(wingL, wingR);

    game.scene.add(dishGroup);
    game.arenaDecorMeshes.push(dishGroup);
    game.citadelRings.push(dishGroup);

    for (const qx of [-36, 36]) {
      for (const qz of [-34, 34]) {
        for (const px of [-4.6, 4.6]) {
          for (const pz of [-4.6, 4.6]) {
            addDecorCyl(qx + px, 4.6, qz + pz, 0.22, 4.4, darkSteelMat, 'y');
          }
        }
        addDecorBox(qx, 6.9, qz, 11.4, 0.45, 11.4, gunmetalFrameMat, true);
        addDecorBox(qx, 7.2, qz, 11.6, 0.14, 11.6, trimAccentMat);
      }
    }
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

    const archDist = 24;
    for (const dirSign of [-1, 1]) {
      addDecorBox(0, 6.8, dirSign * archDist, 14.5, 1.1, 1.6, darkSteelMat, true);
      addDecorBox(0, 7.45, dirSign * archDist, 14.8, 0.24, 1.8, trimAccentMat);
      addDecorCyl(-6.2, 4.9, dirSign * archDist, 0.65, 3.8, gunmetalFrameMat, 'y');
      addDecorCyl(6.2, 4.9, dirSign * archDist, 0.65, 3.8, gunmetalFrameMat, 'y');
    }
  }
}

/**
 * Bakes the world matrices of many indexed box meshes into ONE geometry (position, normal, uv, uv1, index).
 * Used by the Low tier to turn ~120 obstacle draw calls into one per material.
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

export function buildArena(game, mapCfg = game?.currentMapConfig || {}) {
  const halfSize = mapCfg.arenaHalfSize || game?.arenaHalfSize || 60;
  const span = halfSize * 2;
  const theme = mapCfg.theme || {};
  const preset = game?.quality || QUALITY.medium;
  const plan = getSurfacePlan(mapCfg.id);
  game.pbrSlots = [];

  // Ground Floor with high-res anisotropic weathered concrete/tarmac diffuse, bump & roughness relief
  const floorGeo = new THREE.PlaneGeometry(span, span);
  const floorBumpTex = createFloorBumpTexture(game, halfSize);
  const floorMat = new THREE.MeshStandardMaterial({
    map: createGridTexture(game, theme, halfSize),
    bumpMap: floorBumpTex,
    roughnessMap: floorBumpTex,
    bumpScale: 0.048,
    roughness: 0.82,
    metalness: 0.14,
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 1
  });
  game.arenaMaterials.add(floorMat);
  applyMetricPlaneUV1(floorGeo, span, span, plan.floor.tile);
  game.arenaGeometries.add(floorGeo);
  registerPbrSlot(game, floorMat, plan.floor, resolveTint(plan.floor, null, 'floor'));
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

  const matCache = new Map();
  const getMat = (colorHex, type = 'wall') => {
    const key = `${colorHex}_${type}`;
    if (!matCache.has(key)) {
      const isMetal = type === 'container' || type === 'pillar' || type === 'step';
      const isPlatform = type === 'platform';
      const isWoodCrate = type === 'crate';
      const bumpTex = getBump(type);
      const m = new THREE.MeshStandardMaterial({
        map: createObstacleTexture(game, colorHex, type),
        bumpMap: bumpTex,
        roughnessMap: bumpTex,
        bumpScale: isMetal ? 0.058 : isPlatform ? 0.045 : 0.042,
        roughness: isMetal ? 0.42 : isPlatform ? 0.62 : isWoodCrate ? 0.68 : 0.76,
        metalness: isMetal ? 0.66 : isPlatform ? 0.34 : isWoodCrate ? 0.16 : 0.14
      });
      game.arenaMaterials.add(m);
      const spec = plan[type] || plan.wall;
      registerPbrSlot(game, m, spec, resolveTint(spec, colorHex, type));
      matCache.set(key, m);
    }
    return matCache.get(key);
  };

  const darkSteelMat = new THREE.MeshStandardMaterial({
    color: 0x161b22,
    roughness: 0.38,
    metalness: 0.82,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1
  });
  const gunmetalFrameMat = new THREE.MeshStandardMaterial({
    color: 0x262f3d,
    roughness: 0.44,
    metalness: 0.68,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1
  });
  const brushedChromeMat = new THREE.MeshStandardMaterial({
    color: 0x94a3b8,
    roughness: 0.24,
    metalness: 0.90,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1
  });
  const hazardMat = new THREE.MeshStandardMaterial({
    color: 0xd97706,
    roughness: 0.46,
    metalness: 0.34,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1
  });
  const barrelOliveMat = new THREE.MeshStandardMaterial({
    color: 0x3b4d38,
    roughness: 0.42,
    metalness: 0.58
  });

  const sandbagCanvas = document.createElement('canvas');
  sandbagCanvas.width = 128;
  sandbagCanvas.height = 128;
  const sbCtx = sandbagCanvas.getContext('2d');
  sbCtx.fillStyle = '#867658';
  sbCtx.fillRect(0, 0, 128, 128);
  for (let y = 0; y < 128; y += 4) {
    sbCtx.fillStyle = y % 8 === 0 ? 'rgba(255,248,225,0.09)' : 'rgba(20,16,10,0.14)';
    sbCtx.fillRect(0, y, 128, 2);
  }
  for (let x = 0; x < 128; x += 4) {
    sbCtx.fillStyle = x % 8 === 0 ? 'rgba(255,248,225,0.07)' : 'rgba(20,16,10,0.11)';
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
    color: 0x948466,
    roughness: 0.88,
    metalness: 0.04
  });
  const trimAccentMat = new THREE.MeshStandardMaterial({
    color: 0xe5a024,
    emissive: 0xe5a024,
    emissiveIntensity: 0.35,
    roughness: 0.35,
    metalness: 0.5
  });
  const trimSecondaryMat = new THREE.MeshStandardMaterial({
    color: theme.secondaryHex || 0x38bdf8,
    emissive: theme.secondaryHex || 0x38bdf8,
    emissiveIntensity: 0.25,
    roughness: 0.4,
    metalness: 0.5
  });

  game.arenaMaterials.add(darkSteelMat);
  game.arenaMaterials.add(gunmetalFrameMat);
  game.arenaMaterials.add(brushedChromeMat);
  game.arenaMaterials.add(hazardMat);
  game.arenaMaterials.add(barrelOliveMat);
  game.arenaMaterials.add(sandbagMat);
  game.arenaMaterials.add(trimAccentMat);
  game.arenaMaterials.add(trimSecondaryMat);

  const unitBoxGeo = new THREE.BoxGeometry(1, 1, 1);
  const unitCylGeo = new THREE.CylinderGeometry(0.5, 0.5, 1, preset.cylinderSegments);
  const unitOctGeo = new THREE.OctahedronGeometry(0.55, 0);
  const unitSandbagGeo = new THREE.CapsuleGeometry(0.22, 0.58, preset.capsuleSegments, preset.capsuleSegments + 4);
  game.arenaGeometries.add(unitBoxGeo);
  game.arenaGeometries.add(unitCylGeo);
  game.arenaGeometries.add(unitOctGeo);
  game.arenaGeometries.add(unitSandbagGeo);

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
    const item = {
      x,
      y,
      z,
      sx,
      sy,
      sz,
      rotation: { x: rx, y: ry, z: rz }
    };
    batch.items.push(item);
    return item;
  };

  const addDecorBox = (x, y, z, w, h, d, mat, castShadow = false) =>
    registerInstancedItem(unitBoxGeo, mat, x, y, z, w, h, d, 0, 0, 0, castShadow);

  const addDecorCyl = (x, y, z, radius, len, mat, axis = 'y', castShadow = false) => {
    const rx = axis === 'z' ? Math.PI / 2 : 0;
    const rz = axis === 'x' ? Math.PI / 2 : 0;
    return registerInstancedItem(unitCylGeo, mat, x, y, z, radius * 2, len, radius * 2, rx, 0, rz, castShadow);
  };

  const addDecorSandbag = (x, y, z, alongX = true, scale = 1.0, yawJitter = 0) => {
    if (alongX) {
      return registerInstancedItem(unitSandbagGeo, sandbagMat, x, y, z, 0.78 * scale, 1.05 * scale, 1.15 * scale, 0, yawJitter, Math.PI / 2, true);
    }
    return registerInstancedItem(unitSandbagGeo, sandbagMat, x, y, z, 1.15 * scale, 1.05 * scale, 0.78 * scale, Math.PI / 2, yawJitter, 0, true);
  };

  // Helper to place a realistic 3D 55-Gallon Cylindrical Military Fuel Drum with Rolling Hoops & Bung Caps
  const addMilitaryFuelDrum = (x, botY, z, mat = barrelOliveMat) => {
    const drumH = 0.92;
    const drumR = 0.29;
    const cy = botY + drumH / 2;
    addDecorCyl(x, cy, z, drumR, drumH, mat, 'y', true);
    addDecorCyl(x, cy - 0.16, z, drumR + 0.016, 0.045, darkSteelMat, 'y');
    addDecorCyl(x, cy + 0.16, z, drumR + 0.016, 0.045, darkSteelMat, 'y');
    addDecorCyl(x, botY + drumH + 0.01, z, drumR + 0.012, 0.028, darkSteelMat, 'y');
    addDecorCyl(x + 0.12, botY + drumH + 0.03, z - 0.08, 0.036, 0.032, brushedChromeMat, 'y');
  };

  const buildContainerDetails = (cx, cy, cz, cw, ch, cd, mainMat, isUpperStack = false) => {
    const alongZ = cd >= cw;
    const halfW = cw / 2;
    const halfH = ch / 2;
    const halfD = cd / 2;

    const railThick = 0.16;
    for (const sy of [-1, 1]) {
      const ry = cy + sy * (halfH - 0.04);
      addDecorBox(cx, ry, cz - halfD - 0.02, cw + 0.08, railThick, railThick, darkSteelMat);
      addDecorBox(cx, ry, cz + halfD + 0.02, cw + 0.08, railThick, railThick, darkSteelMat);
      addDecorBox(cx - halfW - 0.02, ry, cz, railThick, railThick, cd + 0.08, darkSteelMat);
      addDecorBox(cx + halfW + 0.02, ry, cz, railThick, railThick, cd + 0.08, darkSteelMat);
    }

    const castSize = 0.34;
    for (const sx of [-1, 1]) {
      for (const sy of [-1, 1]) {
        for (const sz of [-1, 1]) {
          addDecorBox(
            cx + sx * (halfW - 0.02),
            cy + sy * (halfH - 0.02),
            cz + sz * (halfD - 0.02),
            castSize,
            castSize,
            castSize,
            brushedChromeMat
          );
        }
      }
    }

    // 3D Cylindrical-Profile Corrugated Steel Side Ribs
    const longSpan = alongZ ? cd : cw;
    const ribCount = Math.max(4, Math.floor((longSpan - 1.0) / 0.78));
    for (let r = 0; r < ribCount; r++) {
      const offset = -longSpan / 2 + 0.65 + (r / Math.max(1, ribCount - 1)) * (longSpan - 1.3);
      if (alongZ) {
        addDecorCyl(cx - halfW - 0.035, cy, cz + offset, 0.085, ch - 0.36, mainMat, 'y');
        addDecorCyl(cx + halfW + 0.035, cy, cz + offset, 0.085, ch - 0.36, mainMat, 'y');
      } else {
        addDecorCyl(cx + offset, cy, cz - halfD - 0.035, 0.085, ch - 0.36, mainMat, 'y');
        addDecorCyl(cx + offset, cy, cz + halfD + 0.035, 0.085, ch - 0.36, mainMat, 'y');
      }
    }

    // Cargo Double-Door End Hardware (Rubber Center Seal + 4 Galvanized Locking Bars + Cam Latches)
    for (const endSign of [-1, 1]) {
      if (alongZ) {
        const ez = cz + endSign * (halfD + 0.035);
        addDecorBox(cx, cy, ez, 0.08, ch - 0.3, 0.05, darkSteelMat);
        for (const barX of [-cw * 0.28, -cw * 0.11, cw * 0.11, cw * 0.28]) {
          addDecorCyl(cx + barX, cy, ez + endSign * 0.03, 0.034, ch - 0.34, brushedChromeMat, 'y');
          addDecorBox(cx + barX, cy - 0.15, ez + endSign * 0.05, 0.12, 0.08, 0.08, hazardMat);
        }
      } else {
        const ex = cx + endSign * (halfW + 0.035);
        addDecorBox(ex, cy, cz, 0.05, ch - 0.3, 0.08, darkSteelMat);
        for (const barZ of [-cd * 0.28, -cd * 0.11, cd * 0.11, cd * 0.28]) {
          addDecorCyl(ex + endSign * 0.03, cy, cz + barZ, 0.034, ch - 0.34, brushedChromeMat, 'y');
          addDecorBox(ex + endSign * 0.05, cy - 0.15, cz + barZ, 0.08, 0.08, 0.12, hazardMat);
        }
      }
    }

    if (!isUpperStack) {
      addDecorBox(cx, cy + halfH + 0.14, cz, cw * 0.55, 0.24, cd * 0.35, gunmetalFrameMat);
    }
  };

  // Authentic Military & Maritime Container Palette (Rust Red, Navy Blue, Olive Drab, Ochre Tan, Slate)
  const stackColors = [0x2b4c65, 0x7c2d12, 0x3f4d3b, 0x92400e, 0x334155];
  let containerIdx = 0;
  let crateIdx = 0;

  // glTF crate props (Low tier: none). Only models whose bounding box fits the target AABB within tolerance are used;
  // everything else keeps the procedural box, so a missing/squashed model can never change the look badly.
  const crateGltf = preset.glbProps ? game.assets?.loadedModels?.get('crate-wide') : null;
  const crateObstacleBatch = crateGltf ? new PropBatcher(crateGltf.scene, 'crate-obstacle') : null;
  const crateTopperBatch = crateGltf ? new PropBatcher(crateGltf.scene, 'crate-topper') : null;
  game.propBatchers = [crateObstacleBatch, crateTopperBatch].filter(Boolean);

  for (const obs of mapCfg.obstacles) {
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
    const mesh = new THREE.Mesh(geo, mainMat);
    mesh.position.set(obs.x, obs.y, obs.z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.updateMatrix();
    mesh.matrixAutoUpdate = false;
    game.scene.add(mesh);
    game.worldMeshes.push(mesh);

    const halfW = obs.w / 2;
    const halfH = obs.h / 2;
    const halfD = obs.d / 2;
    const topY = obs.y + halfH;
    const botY = obs.y - halfH;

    if (obs.type === 'container') {
      buildContainerDetails(obs.x, obs.y, obs.z, obs.w, obs.h, obs.d, mainMat, false);

      if (obs.y < 2.2 && Math.max(obs.w, obs.d) >= 7.5) {
        const upperColor = stackColors[containerIdx % stackColors.length];
        containerIdx++;
        const upperMat = getMat(upperColor, 'container');
        const upperH = 3.1;
        const upperY = topY + upperH / 2 + 0.06;

        const upperCore = addDecorBox(obs.x, upperY, obs.z, obs.w * 0.96, upperH, obs.d * 0.96, upperMat, true);
        if (containerIdx % 2 === 0) {
          upperCore.rotation.y = 0.035;
        }
        buildContainerDetails(obs.x, upperY, obs.z, obs.w * 0.96, upperH, obs.d * 0.96, upperMat, true);
      }
    } else if (obs.type === 'crate' && crateObstacleBatch?.tryAdd(
      { x: obs.x, y: obs.y, z: obs.z },
      { w: obs.w, h: obs.h, d: obs.d }
    )) {
      // Kenney crate model fits this AABB: it replaces the box visual (the collision box and the raycast mesh stay)
      mesh.visible = false;
      crateIdx++;
    } else if (obs.type === 'crate') {
      crateIdx++;
      // Contoured Military Ordnance Case: Top Overhang Lid, Pallet Base, Rounded Corner Bumpers & Steel Latches
      addDecorBox(obs.x, topY - 0.10, obs.z, obs.w + 0.12, 0.14, obs.d + 0.12, darkSteelMat);
      addDecorBox(obs.x, botY + 0.09, obs.z, obs.w + 0.14, 0.14, obs.d + 0.14, darkSteelMat);

      // Rounded Cylindrical Corner Bumpers (breaks up sharp 90-degree box edges)
      for (const sx of [-1, 1]) {
        for (const sz of [-1, 1]) {
          addDecorCyl(
            obs.x + sx * (halfW + 0.02),
            obs.y,
            obs.z + sz * (halfD + 0.02),
            0.13,
            obs.h - 0.02,
            gunmetalFrameMat,
            'y'
          );
        }
      }

      // Molded Top Reinforcement Lid & Tie-Down Bars
      addDecorBox(obs.x, topY + 0.045, obs.z, obs.w * 0.76, 0.07, obs.d * 0.76, gunmetalFrameMat);
      addDecorCyl(obs.x, topY + 0.095, obs.z - obs.d * 0.22, 0.04, obs.w * 0.72, darkSteelMat, 'x');
      addDecorCyl(obs.x, topY + 0.095, obs.z + obs.d * 0.22, 0.04, obs.w * 0.72, darkSteelMat, 'x');

      // Side Latch Clasps & Caution Plates
      addDecorBox(obs.x, obs.y + 0.05, obs.z - halfD - 0.04, obs.w * 0.42, 0.10, 0.04, hazardMat);
      addDecorBox(obs.x, obs.y + 0.05, obs.z + halfD + 0.04, obs.w * 0.42, 0.10, 0.04, hazardMat);

      // On wide supply crates, stack cylindrical 55-gallon military fuel drums or tactical hardcases on top
      if (obs.w >= 2.1 && obs.d >= 2.0 && obs.h >= 1.8) {
        if (crateIdx % 2 === 0) {
          addMilitaryFuelDrum(obs.x - 0.42, topY + 0.08, obs.z - 0.18, barrelOliveMat);
          addMilitaryFuelDrum(obs.x + 0.36, topY + 0.08, obs.z + 0.22, gunmetalFrameMat);
        } else {
          // Molded Pelican Tactical Weapons Case on top of supply pallet (glTF crate when it fits, else procedural boxes)
          const topperFit = crateTopperBatch?.tryAddContained(
            { x: obs.x, z: obs.z },
            topY + 0.08,
            { w: obs.w * 0.7, h: 0.5, d: obs.d * 0.6 }
          );
          if (!topperFit) {
            addDecorBox(obs.x, topY + 0.26, obs.z, obs.w * 0.58, 0.36, obs.d * 0.48, barrelOliveMat, true);
            addDecorBox(obs.x, topY + 0.47, obs.z, obs.w * 0.60, 0.05, obs.d * 0.50, darkSteelMat);
          }
        }
      }
    } else if (obs.type === 'pillar') {
      // Heavy Stepped Concrete & Steel Column Base + Cylindrical Corner Flanges
      addDecorBox(obs.x, botY + 0.25, obs.z, obs.w + 0.58, 0.46, obs.d + 0.58, darkSteelMat);
      addDecorBox(obs.x, botY + 0.64, obs.z, obs.w + 0.32, 0.28, obs.d + 0.32, gunmetalFrameMat);
      addDecorBox(obs.x, topY - 0.25, obs.z, obs.w + 0.46, 0.44, obs.d + 0.46, darkSteelMat);

      for (const sx of [-1, 1]) {
        for (const sz of [-1, 1]) {
          addDecorCyl(
            obs.x + sx * (halfW + 0.03),
            obs.y,
            obs.z + sz * (halfD + 0.03),
            0.18,
            obs.h - 0.04,
            gunmetalFrameMat,
            'y'
          );
        }
      }

      const isCenterPillar = Math.abs(obs.x) < 2 && Math.abs(obs.z) < 2;
      const spireH = isCenterPillar ? 10.5 : 7.5;
      addDecorCyl(obs.x, topY + spireH / 2, obs.z, obs.w * 0.28, spireH, darkSteelMat, 'y', true);
      addDecorBox(obs.x, topY + spireH * 0.45, obs.z, obs.w * 0.88, 0.38, obs.d * 0.88, gunmetalFrameMat);
      addDecorBox(obs.x, topY + spireH * 0.82, obs.z, obs.w * 0.72, 0.32, obs.d * 0.72, trimAccentMat);

      // Replace floating arcade torus rings with a realistic rotating Military Radar Scanner & Comms Array
      if (isCenterPillar) {
        const radarGroup = new THREE.Group();
        radarGroup.position.set(obs.x, topY + 3.2, obs.z);

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
    } else if (obs.type === 'platform') {
      // Overhanging Structural Steel Deck Cornice + Base Plinth (recessed below topY so walkable deck never z-fights)
      addDecorBox(obs.x, topY - 0.20, obs.z, obs.w + 0.36, 0.24, obs.d + 0.36, darkSteelMat);
      addDecorBox(obs.x, topY - 0.055, obs.z, obs.w + 0.42, 0.07, obs.d + 0.42, hazardMat);
      addDecorBox(obs.x, botY + 0.15, obs.z, obs.w + 0.28, 0.24, obs.d + 0.28, gunmetalFrameMat);

      // Corner Cylindrical & Box Bastion Columns
      for (const sx of [-1, 1]) {
        for (const sz of [-1, 1]) {
          const bx = obs.x + sx * (halfW - 0.35);
          const bz = obs.z + sz * (halfD - 0.35);
          addDecorBox(bx, obs.y + 0.26, bz, 0.88, obs.h + 0.48, 0.88, darkSteelMat);
          addDecorCyl(bx, topY + 0.38, bz, 0.32, 0.24, gunmetalFrameMat, 'y');
        }
      }

      // Intermediate Side Structural Steel Support Columns along long spans
      for (const sideSign of [-1, 1]) {
        if (obs.w >= 12) {
          for (const ox of [-obs.w * 0.26, obs.w * 0.26]) {
            addDecorCyl(obs.x + ox, obs.y, obs.z + sideSign * (halfD + 0.08), 0.16, obs.h - 0.15, gunmetalFrameMat, 'y');
          }
        }
        if (obs.d >= 12) {
          for (const oz of [-obs.d * 0.26, obs.d * 0.26]) {
            addDecorCyl(obs.x + sideSign * (halfW + 0.08), obs.y, obs.z + oz, 0.16, obs.h - 0.15, gunmetalFrameMat, 'y');
          }
        }
      }
    } else if (obs.type === 'step') {
      // Industrial Stair Tread Bullnose Cylinders & Side Stringer Plates
      const alongZ = obs.w >= obs.d;
      if (alongZ) {
        addDecorCyl(obs.x, topY - 0.035, obs.z - halfD - 0.025, 0.03, obs.w - 0.02, brushedChromeMat, 'x');
        addDecorCyl(obs.x, topY - 0.035, obs.z + halfD + 0.025, 0.03, obs.w - 0.02, brushedChromeMat, 'x');
        addDecorBox(obs.x - halfW - 0.04, obs.y, obs.z, 0.07, Math.max(0.1, obs.h - 0.03), Math.max(0.2, obs.d - 0.04), darkSteelMat);
        addDecorBox(obs.x + halfW + 0.04, obs.y, obs.z, 0.07, Math.max(0.1, obs.h - 0.03), Math.max(0.2, obs.d - 0.04), darkSteelMat);
      } else {
        addDecorCyl(obs.x - halfW - 0.025, topY - 0.035, obs.z, 0.03, obs.d - 0.02, brushedChromeMat, 'z');
        addDecorCyl(obs.x + halfW + 0.025, topY - 0.035, obs.z, 0.03, obs.d - 0.02, brushedChromeMat, 'z');
        addDecorBox(obs.x, obs.y, obs.z - halfD - 0.04, Math.max(0.2, obs.w - 0.04), Math.max(0.1, obs.h - 0.03), 0.07, darkSteelMat);
        addDecorBox(obs.x, obs.y, obs.z + halfD + 0.04, Math.max(0.2, obs.w - 0.04), Math.max(0.1, obs.h - 0.03), 0.07, darkSteelMat);
      }
    } else if (obs.type === 'wall') {
      const isPerimeter = Math.max(obs.w, obs.d) > 80;
      if (isPerimeter) {
        const alongX = obs.w > obs.d;
        const upperWallH = 6.5;
        const upperWallY = topY + upperWallH / 2;

        addDecorBox(obs.x, upperWallY, obs.z, obs.w, upperWallH, obs.d * 1.35, gunmetalFrameMat);
        addDecorBox(obs.x, 4.5, obs.z, obs.w + 0.1, 0.24, obs.d + 0.28, darkSteelMat);
        addDecorBox(obs.x, 9.1, obs.z, obs.w + 0.1, 0.26, obs.d + 0.34, hazardMat);
        addDecorBox(obs.x, topY + upperWallH - 0.2, obs.z, obs.w + 0.1, 0.32, obs.d + 0.38, darkSteelMat);

        const wallSpan = alongX ? obs.w : obs.d;
        for (let offset = -wallSpan / 2 + 8; offset <= wallSpan / 2 - 8; offset += 12) {
          if (alongX) {
            const inwardSign = obs.z > 0 ? -1 : 1;
            addDecorBox(obs.x + offset, 7.52, obs.z + inwardSign * 0.55, 1.4, 14.9, 1.2, darkSteelMat);
            addDecorBox(obs.x + offset, 13.5, obs.z + inwardSign * 0.9, 0.65, 0.45, 0.45, trimAccentMat);
          } else {
            const inwardSign = obs.x > 0 ? -1 : 1;
            addDecorBox(obs.x + inwardSign * 0.55, 7.52, obs.z + offset, 1.2, 14.9, 1.4, darkSteelMat);
            addDecorBox(obs.x + inwardSign * 0.9, 13.5, obs.z + offset, 0.45, 0.45, 0.65, trimAccentMat);
          }
        }
      } else {
        // Interior Precast Reinforced Concrete Bremer / Jersey Blast Wall
        // Flared stepped concrete base plinth + overhanging top coping cap (recessed from botY & topY)
        addDecorBox(obs.x, botY + 0.18, obs.z, obs.w + 0.32, 0.32, obs.d + 0.32, darkSteelMat);
        addDecorBox(obs.x, botY + 0.44, obs.z, obs.w + 0.18, 0.18, obs.d + 0.18, gunmetalFrameMat);
        addDecorBox(obs.x, topY - 0.15, obs.z, obs.w + 0.28, 0.24, obs.d + 0.28, darkSteelMat);
        addDecorCyl(obs.x, topY + 0.06, obs.z, 0.12, obs.w >= obs.d ? obs.w * 0.92 : obs.d * 0.92, gunmetalFrameMat, obs.w >= obs.d ? 'x' : 'z');

        const alongX = obs.w >= obs.d;
        const wallSpan = alongX ? obs.w : obs.d;
        // End-cap steel H-beam frames + intermediate concrete buttress pilasters
        const pilasterCount = Math.max(2, Math.floor(wallSpan / 2.6) + 1);
        for (let p = 0; p < pilasterCount; p++) {
          const t = pilasterCount === 1 ? 0 : -0.46 + (p / (pilasterCount - 1)) * 0.92;
          const posOff = t * wallSpan;
          if (alongX) {
            addDecorBox(obs.x + posOff, obs.y, obs.z, 0.34, Math.max(0.2, obs.h - 0.04), obs.d + 0.24, gunmetalFrameMat);
          } else {
            addDecorBox(obs.x, obs.y, obs.z + posOff, obs.w + 0.24, Math.max(0.2, obs.h - 0.04), 0.34, gunmetalFrameMat);
          }
        }

        // Rounded Woven-Burlap Sandbag Emplacements stacked snug against base plinth of cover walls
        const bagSpan = Math.max(obs.w, obs.d);
        if (bagSpan >= 5.5) {
          const bagCount = Math.min(5, Math.floor(bagSpan / 1.4));
          for (let b = 0; b < bagCount; b++) {
            const boff = -((bagCount - 1) * 0.5) * 1.12 + b * 1.12;
            const jitter = (b % 2 === 0 ? 1 : -1) * 0.05;
            if (alongX) {
              addDecorSandbag(obs.x + boff, botY + 0.18, obs.z + halfD + 0.18, true, 0.86, jitter);
              addDecorSandbag(obs.x + boff * 0.86, botY + 0.46, obs.z + halfD + 0.15, true, 0.80, -jitter);
              if (b < 3) {
                addDecorSandbag(obs.x + (b - 1) * 1.05, topY - 0.04, obs.z, true, 0.62, jitter * 0.8);
              }
            } else {
              addDecorSandbag(obs.x + halfW + 0.18, botY + 0.18, obs.z + boff, false, 0.86, jitter);
              addDecorSandbag(obs.x + halfW + 0.15, botY + 0.46, obs.z + boff * 0.86, false, 0.80, -jitter);
              if (b < 3) {
                addDecorSandbag(obs.x, topY - 0.04, obs.z + (b - 1) * 1.05, false, 0.62, jitter * 0.8);
              }
            }
          }
        }
      }
    }
  }

  // Corner Guard Watchtowers & Stadium Floodlight Banks
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const cx = sx * (halfSize - 0.5);
      const cz = sz * (halfSize - 0.5);
      addDecorBox(cx, 12, cz, 5.5, 24, 5.5, darkSteelMat);
      addDecorBox(cx, 21.5, cz, 7.2, 3.2, 7.2, gunmetalFrameMat);
      addDecorBox(cx, 23.4, cz, 7.6, 0.45, 7.6, hazardMat);
      addDecorBox(cx, 25.5, cz, 2.2, 1.8, 2.2, trimAccentMat);
    }
  }

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
    trimSecondaryMat
  );

  const dummy = new THREE.Object3D();
  for (const [geo, groupMap] of decorBatches.entries()) {
    for (const [mat, batch] of groupMap.entries()) {
      const count = batch.items.length;
      if (count === 0) continue;
      const instMesh = new THREE.InstancedMesh(geo, mat, count);
      instMesh.castShadow = batch.castShadow;
      instMesh.receiveShadow = batch.castShadow;
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

  // Low tier: draw the obstacles as ONE merged mesh per material. The original per-obstacle meshes stay in
  // game.worldMeshes (raycast / hit-decal targets are unchanged; three's Raycaster ignores `visible`) but are not rendered.
  game.mergedWorldMeshes = [];
  if (preset.mergeWorldMeshes) {
    const byMat = new Map();
    for (const m of game.worldMeshes.slice(1)) {
      if (!m.visible) continue;
      if (!byMat.has(m.material)) byMat.set(m.material, []);
      byMat.get(m.material).push(m);
    }
    for (const [mat, list] of byMat) {
      const merged = new THREE.Mesh(mergeMeshGeometries(list), mat);
      merged.castShadow = false;
      merged.receiveShadow = false;
      merged.matrixAutoUpdate = false;
      game.scene.add(merged);
      game.arenaDecorMeshes.push(merged);
      game.mergedWorldMeshes.push(merged);
      for (const m of list) m.visible = false;
    }
  }

  game.rebuildHitboxList?.();
}

