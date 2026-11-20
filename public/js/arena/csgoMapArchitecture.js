// Bespoke CS2 / CS:GO batched 3D architecture builders for `de_mirage`, `de_inferno`, `de_nuke`,
// `fy_iceworld`, and `aim_map` (`SPEC-csgo-maps-overhaul.md`).
// Every architectural hull merges into `archMeshBatches` (1 draw call per material) and every
// structural accent / skyline / railing batches into `decorBatches` (`InstancedMesh`), tracked 100%
// in `game.arenaGeometries` / `game.arenaMaterials` / `game.arenaDecorMeshes` for 0.00 GPU leaks.

import * as THREE from '../three.js';
import {
  applyMetricBoxUV1,
  attachWorldMacroGrime,
  registerPbrSlot,
  resolveTint,
  uvOffsetFor
} from '../surfaceMaterials.js';
import {
  applyBoxWorldUVs,
  createObstacleTexture,
  createTerracottaTileTexture,
  createWeatheredConcreteCapTexture,
  createWovenAwningTexture
} from './proceduralTextures.js';
import { buildDustCourtyardBackdrop, createTrapezoidPrismGeometry } from './saltlinePropsAndBackdrops.js';
import {
  addCrateIronCornerLBrackets,
  addTealShutteredWindow,
  applyPlanarMetricUVs,
  buildDustSandstoneStep,
  buildDustTimberCrate,
  createMoroccanArchGeometry
} from './dustArchitecture.js';

function makePlanMaterial(game, plan, mapId, fallbackHex, role, roughness, metalness, highDetail, grimeRole = null) {
  const spec = plan[role] || plan.wall;
  const mat = new THREE.MeshStandardMaterial({
    map: typeof document !== 'undefined' ? createObstacleTexture(game, fallbackHex, role === 'crate' ? 'crate' : 'wall') : null,
    roughness,
    metalness
  });
  if (grimeRole) {
    attachWorldMacroGrime(mat, { mapId, role: grimeRole, enabled: highDetail });
  }
  game.arenaMaterials.add(mat);
  registerPbrSlot(game, mat, spec, resolveTint(spec, fallbackHex, role, mapId));
  return mat;
}

function createSpawnClearanceChecker(mapCfg = {}) {
  const spawns = [
    ...(mapCfg.spawnPoints || []),
    ...(mapCfg.teamSpawns?.alpha || []),
    ...(mapCfg.teamSpawns?.bravo || [])
  ];
  const obstacles = mapCfg.obstacles || [];
  const jumpPads = mapCfg.jumpPads || [];
  const barrels = mapCfg.barrels || [];
  const pickups = [...(mapCfg.healthPacks || []), ...(mapCfg.powerups || [])];

  return {
    isClear(x, z, pad = 1.6) {
      for (let i = 0; i < spawns.length; i++) {
        if (Math.hypot(x - spawns[i].x, z - spawns[i].z) < pad + 0.6) return false;
      }
      for (let i = 0; i < jumpPads.length; i++) {
        if (Math.hypot(x - jumpPads[i].x, z - jumpPads[i].z) < pad + 1.1) return false;
      }
      for (let i = 0; i < barrels.length; i++) {
        if (Math.hypot(x - barrels[i].x, z - barrels[i].z) < pad + 0.8) return false;
      }
      for (let i = 0; i < pickups.length; i++) {
        if (Math.hypot(x - pickups[i].x, z - pickups[i].z) < pad + 0.8) return false;
      }
      for (let i = 0; i < obstacles.length; i++) {
        const o = obstacles[i];
        if (o.y - o.h * 0.5 > 2.2) continue;
        if (Math.abs(x - o.x) < o.w * 0.5 + pad * 0.65 && Math.abs(z - o.z) < o.d * 0.5 + pad * 0.65) {
          return false;
        }
      }
      return true;
    },
    hasAdjacentStairOrBlocker(plat, edgeSide) {
      // Checks whether a stair step or top-mounted wall/crate sits along the requested edge of `plat`
      const topY = plat.y + plat.h * 0.5;
      const hw = plat.w * 0.5;
      const hd = plat.d * 0.5;
      for (let i = 0; i < obstacles.length; i++) {
        const o = obstacles[i];
        if (o === plat) continue;
        const oMaxY = o.y + o.h * 0.5;
        const oMinY = o.y - o.h * 0.5;
        if (oMaxY < topY - 0.55 || oMinY > topY + 2.2) continue;
        if (edgeSide === 'north') {
          if (Math.abs(o.x - plat.x) < hw + 0.6 && Math.abs(o.z - (plat.z - hd)) < o.d * 0.5 + 1.2) return true;
        } else if (edgeSide === 'south') {
          if (Math.abs(o.x - plat.x) < hw + 0.6 && Math.abs(o.z - (plat.z + hd)) < o.d * 0.5 + 1.2) return true;
        } else if (edgeSide === 'west') {
          if (Math.abs(o.z - plat.z) < hd + 0.6 && Math.abs(o.x - (plat.x - hw)) < o.w * 0.5 + 1.2) return true;
        } else if (edgeSide === 'east') {
          if (Math.abs(o.z - plat.z) < hd + 0.6 && Math.abs(o.x - (plat.x + hw)) < o.w * 0.5 + 1.2) return true;
        }
      }
      return false;
    }
  };
}

/**
 * Adds a sleek horizontal top-rail + mid-rail + vertical stanchion handrail along a platform edge,
 * keeping stair approaches and gunshield edges strictly open.
 */
function addPlatformEdgeRailing(ctx, { x0, z0, x1, z1, deckY, height = 0.94, postMat, railMat, midRail = true }) {
  const { addDecorBox } = ctx;
  const dx = x1 - x0;
  const dz = z1 - z0;
  const span = Math.hypot(dx, dz);
  if (span < 1.2) return;
  const alongX = Math.abs(dx) >= Math.abs(dz);
  const cx = (x0 + x1) * 0.5;
  const cz = (z0 + z1) * 0.5;

  if (alongX) {
    addDecorBox(cx, deckY + height, cz, span, 0.065, 0.065, railMat, true);
    if (midRail) {
      addDecorBox(cx, deckY + height * 0.52, cz, span, 0.045, 0.045, postMat, false);
    }
  } else {
    addDecorBox(cx, deckY + height, cz, 0.065, 0.065, span, railMat, true);
    if (midRail) {
      addDecorBox(cx, deckY + height * 0.52, cz, 0.045, 0.045, span, postMat, false);
    }
  }

  const postCount = Math.max(2, Math.round(span / 1.85) + 1);
  for (let p = 0; p < postCount; p++) {
    const t = p / (postCount - 1);
    const px = x0 + dx * t;
    const pz = z0 + dz * t;
    addDecorBox(px, deckY + height * 0.5, pz, 0.06, height, 0.06, postMat, true);
  }
}

/** Creates an indexed round Romanesque/Tuscan arch spandrel geometry (centered X=0, Y=0, Z=0). */
function createRoundArchGeometry({
  outerW = 7.0,
  outerH = 6.0,
  innerW = 4.86,
  archSpringY = 3.45,
  depth = 1.94,
  curveSegments = 12,
  bevel = true,
  tile = 2.4,
  baseYOverride = null
} = {}) {
  const hw = outerW * 0.5;
  const radius = innerW * 0.5;
  const baseY = baseYOverride !== null ? baseYOverride : Math.max(2.65, archSpringY - 0.30);
  const shape = new THREE.Shape();
  shape.moveTo(-hw, baseY);
  shape.lineTo(-hw, outerH);
  shape.lineTo(hw, outerH);
  shape.lineTo(hw, baseY);
  shape.lineTo(radius, baseY);
  shape.lineTo(radius, archSpringY);
  shape.absarc(0, archSpringY, radius, 0, Math.PI, false);
  shape.lineTo(-radius, baseY);
  shape.closePath();

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: bevel,
    bevelThickness: bevel ? 0.035 : 0,
    bevelSize: bevel ? 0.035 : 0,
    bevelSegments: bevel ? 2 : 1,
    curveSegments
  });
  geo.translate(0, 0, -depth * 0.5);
  geo.computeVertexNormals();
  applyPlanarMetricUVs(geo, tile, [0, 0]);
  return geo;
}

/**
 * Recomputes `uv` (channel 0) on a `createTrapezoidPrismGeometry` mesh using each sloped face's
 * actual 3D eave-to-ridge slope length and world span so terracotta tiles render without skew or stretching.
 */
function applyRoofTileMetricUVs(geo, tileSize = 1.6, offset = [0, 0]) {
  const pos = geo?.attributes?.position;
  const uv = geo?.attributes?.uv;
  if (!pos || !uv || pos.count < 24) return geo;

  const [ox, oy] = offset;
  for (let f = 0; f < 6; f++) {
    const base = f * 4;
    if (f < 4) {
      const y0 = pos.getY(base);
      const y2 = pos.getY(base + 2);
      const dy = y2 - y0;
      const dCross = f < 2 ? pos.getZ(base + 2) - pos.getZ(base) : pos.getX(base + 2) - pos.getX(base);
      const slopeLen = Math.max(0.1, Math.hypot(dy, dCross));
      const invH = Math.abs(dy) > 1e-5 ? 1 / dy : 0;
      for (let k = 0; k < 4; k++) {
        const idx = base + k;
        const along = f < 2 ? pos.getX(idx) : pos.getZ(idx);
        const tSlope = (pos.getY(idx) - y0) * invH;
        uv.setXY(idx, along / tileSize + ox, (tSlope * slopeLen) / tileSize + oy);
      }
    } else {
      for (let k = 0; k < 4; k++) {
        const idx = base + k;
        uv.setXY(idx, pos.getX(idx) / tileSize + ox, pos.getZ(idx) / tileSize + oy);
      }
    }
  }
  uv.needsUpdate = true;
  return geo;
}

/**
 * Creates a clean 6-face asymmetric sloped wedge prism (`-Z` front height `hFront`, `+Z` back height `hBack`,
 * bottom flush at `y = 0`) for sculpted vehicle hoods and aerodynamic fascia.
 */
function createWedgePrismGeometry({
  wBottom = 1.0,
  wTop = 0.9,
  hBack = 0.3,
  hFront = 0.12,
  len = 1.0,
  tile = 2.0,
  offset = [0, 0]
} = {}) {
  const bw = wBottom * 0.5;
  const tw = wTop * 0.5;
  const hz = len * 0.5;
  const c = [
    [-bw, 0, -hz],
    [bw, 0, -hz],
    [bw, 0, hz],
    [-bw, 0, hz],
    [-tw, hFront, -hz],
    [tw, hFront, -hz],
    [tw, hBack, hz],
    [-tw, hBack, hz]
  ];
  const faces = [
    [3, 2, 6, 7],
    [1, 0, 4, 5],
    [2, 1, 5, 6],
    [0, 3, 7, 4],
    [7, 6, 5, 4],
    [0, 1, 2, 3]
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
    const idx = faces[f];
    vA.fromArray(c[idx[0]]);
    vB.fromArray(c[idx[1]]);
    vC.fromArray(c[idx[2]]);
    e1.subVectors(vB, vA);
    e2.subVectors(vC, vA);
    n.crossVectors(e1, e2).normalize();
    const baseV = f * 4;
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
      uv[ui] = qu;
      uv[ui + 1] = qv;
      uv1[ui] = p[0] / tile + offset[0];
      uv1[ui + 1] = (p[1] + p[2]) / tile + offset[1];
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

// ============================================================================
// 1. DE_MIRAGE — MOROCCAN PALACE & A-SITE RETAKE (`halfSize: 38`)
// ============================================================================

function createMirageMaterials(game, plan, highDetail) {
  const stuccoMat = makePlanMaterial(game, plan, 'de_mirage', 0xe4cda9, 'wall', 0.90, 0.02, highDetail, 'wall');
  const sandstoneMat = makePlanMaterial(game, plan, 'de_mirage', 0xd4bb94, 'platform', 0.88, 0.02, highDetail, 'platform');
  const stoneDadoMat = makePlanMaterial(game, plan, 'de_mirage', 0xb59b78, 'dado', 0.92, 0.02, highDetail, 'dado');

  const awningTerracottaTex = createWovenAwningTexture(game, 0xb85838, 0xd8b896);
  const awningCreamTex = createWovenAwningTexture(game, 0xe2cfb0, 0xc4ab86);
  const awningOchreTex = createWovenAwningTexture(game, 0xc98944, 0xe4cda4);

  const ochreParapetMat = new THREE.MeshStandardMaterial({ color: 0xd9b382, roughness: 0.90, metalness: 0.02 });
  const sandstoneTrimMat = new THREE.MeshStandardMaterial({ color: 0xdec8a4, roughness: 0.87, metalness: 0.02 });
  const cedarBeamMat = new THREE.MeshStandardMaterial({ color: 0x553620, roughness: 0.86, metalness: 0.03 });
  const shutterWoodMat = new THREE.MeshStandardMaterial({ color: 0x6b472b, roughness: 0.85, metalness: 0.03 });
  const shutterTealMat = new THREE.MeshStandardMaterial({ color: 0x2a6659, roughness: 0.85, metalness: 0.04 });
  const forgedIronMat = new THREE.MeshStandardMaterial({ color: 0x25211d, roughness: 0.56, metalness: 0.52 });
  const crateIronBracketMat = new THREE.MeshStandardMaterial({ color: 0x2b2622, roughness: 0.60, metalness: 0.55 });
  const awningTerracottaMat = new THREE.MeshStandardMaterial({
    map: awningTerracottaTex,
    color: awningTerracottaTex ? 0xffffff : 0xb85838,
    roughness: 0.94,
    metalness: 0.0
  });
  const awningCreamMat = new THREE.MeshStandardMaterial({
    map: awningCreamTex,
    color: awningCreamTex ? 0xffffff : 0xe2cfb0,
    roughness: 0.94,
    metalness: 0.0
  });
  const awningOchreMat = new THREE.MeshStandardMaterial({
    map: awningOchreTex,
    color: awningOchreTex ? 0xffffff : 0xc98944,
    roughness: 0.94,
    metalness: 0.0
  });
  const recessDarkMat = new THREE.MeshStandardMaterial({ color: 0x18130e, roughness: 0.96, metalness: 0.0 });
  const palaceDomeMat = new THREE.MeshStandardMaterial({ color: 0x4f786c, roughness: 0.70, metalness: 0.16 });

  for (const m of [
    ochreParapetMat,
    sandstoneTrimMat,
    cedarBeamMat,
    shutterWoodMat,
    shutterTealMat,
    forgedIronMat,
    crateIronBracketMat,
    awningTerracottaMat,
    awningCreamMat,
    awningOchreMat,
    recessDarkMat,
    palaceDomeMat
  ]) {
    game.arenaMaterials.add(m);
  }

  return {
    stuccoMat,
    sandstoneMat,
    stoneDadoMat,
    ochreParapetMat,
    sandstoneTrimMat,
    cedarBeamMat,
    shutterWoodMat,
    tealShutterMat: shutterTealMat,
    forgedIronMat,
    crateIronBracketMat,
    awningTerracottaMat,
    awningCreamMat,
    awningOchreMat,
    recessDarkMat,
    palaceDomeMat
  };
}

function buildMirageArchitecture(ctx) {
  const { game, mapCfg, halfSize, highDetail, plan, saltlineMats, pushArchMesh, pushArchBox, pushArchFrustum, addDecorBox, addDecorCyl } = ctx;
  const mats = createMirageMaterials(game, plan, highDetail);
  const shutterCtx = { ...ctx, dustMats: mats };

  const buildWall = (obs, mainMat) => {
    const { x: cx, y: cy, z: cz, w: cw, h: ch, d: cd } = obs;
    const halfW = cw * 0.5;
    const halfH = ch * 0.5;
    const halfD = cd * 0.5;
    const topY = cy + halfH;
    const botY = cy - halfH;
    const isPerimeter = Math.max(cw, cd) > 80 || Math.max(cw, cd) >= halfSize * 1.8;

    if (isPerimeter) {
      const alongX = cw > cd;
      const upperH = highDetail ? 4.0 : 3.0;
      const upperY = topY + upperH * 0.5;
      const inward = alongX ? (cz > 0 ? -1 : 1) : cx > 0 ? -1 : 1;
      const dadoH = 1.12;

      pushArchBox(mainMat, 'wall', cx, cy, cz, cw, ch, cd);
      pushArchBox(mats.ochreParapetMat, 'wall', cx, upperY, cz, cw, upperH, cd);

      if (alongX) {
        pushArchBox(mats.stoneDadoMat, 'dado', cx, dadoH * 0.5, cz + inward * 0.56, cw - 1.6, dadoH, 0.14);
        pushArchBox(mats.sandstoneMat, 'platform', cx, dadoH + 0.04, cz + inward * 0.58, cw - 1.5, 0.08, 0.18);
        pushArchBox(mats.sandstoneMat, 'platform', cx, 4.5, cz + inward * 0.56, cw - 1.4, 0.24, 0.14);
        pushArchBox(mats.sandstoneMat, 'platform', cx, topY + upperH + 0.14, cz, cw + 0.30, 0.28, cd + 0.34);
      } else {
        pushArchBox(mats.stoneDadoMat, 'dado', cx + inward * 0.56, dadoH * 0.5, cz, 0.14, dadoH, cd - 1.6);
        pushArchBox(mats.sandstoneMat, 'platform', cx + inward * 0.58, dadoH + 0.04, cz, 0.18, 0.08, cd - 1.5);
        pushArchBox(mats.sandstoneMat, 'platform', cx + inward * 0.56, 4.5, cz, 0.14, 0.24, cd - 1.4);
        pushArchBox(mats.sandstoneMat, 'platform', cx, topY + upperH + 0.14, cz, cw + 0.34, 0.28, cd + 0.30);
      }

      const wallSpan = alongX ? cw : cd;
      const merlonStep = highDetail ? 4.6 : 9.2;
      const merlonY = topY + upperH + 0.60;
      for (let off = -wallSpan * 0.5 + 4.5; off <= wallSpan * 0.5 - 4.5; off += merlonStep) {
        if (alongX) {
          addDecorBox(cx + off, merlonY, cz, 2.0, 0.64, cd + 0.22, mats.sandstoneTrimMat, true);
          addDecorBox(cx + off, topY + upperH - 0.48, cz + inward * 0.66, 0.17, 0.17, 0.48, mats.cedarBeamMat, true);
        } else {
          addDecorBox(cx, merlonY, cz + off, cw + 0.22, 0.64, 2.0, mats.sandstoneTrimMat, true);
          addDecorBox(cx + inward * 0.66, topY + upperH - 0.48, cz + off, 0.48, 0.17, 0.17, mats.cedarBeamMat, true);
        }
      }

      const nicheStep = highDetail ? 12 : 24;
      let idx = 0;
      for (let off = -wallSpan * 0.5 + 9; off <= wallSpan * 0.5 - 9; off += nicheStep) {
        idx++;
        const sMat = idx % 2 === 0 ? mats.shutterWoodMat : mats.tealShutterMat;
        if (alongX) {
          addTealShutteredWindow(shutterCtx, { cx: cx + off, cy: 6.25, cz: cz + inward * halfD, alongX: true, faceSign: inward, width: 1.15, height: 1.65, shutterMat: sMat });
        } else {
          addTealShutteredWindow(shutterCtx, { cx: cx + inward * halfW, cy: 6.25, cz: cz + off, alongX: false, faceSign: inward, width: 1.15, height: 1.65, shutterMat: sMat });
        }
      }
      return;
    }

    // Mid Window elevated cheek walls (`botY >= 2.0` on Snipers' Nest)
    if (botY >= 2.0) {
      pushArchBox(mainMat, 'wall', cx, cy, cz, cw, ch, cd);
      pushArchBox(mats.sandstoneMat, 'platform', cx, topY - 0.08, cz, cw + 0.08, 0.16, cd + 0.14);
      return;
    }

    const alongX = cw >= cd;
    const dadoH = Math.min(1.08, ch * 0.36);
    const copingH = 0.18;
    const shaftH = Math.max(0.35, ch - dadoH - copingH);

    pushArchBox(mats.stoneDadoMat, 'dado', cx, botY + dadoH * 0.5, cz, cw + (alongX ? 0.02 : 0.08), dadoH, cd + (alongX ? 0.08 : 0.02));
    pushArchBox(mats.sandstoneMat, 'platform', cx, botY + dadoH + 0.035, cz, cw + (alongX ? 0.04 : 0.14), 0.07, cd + (alongX ? 0.14 : 0.04));
    pushArchBox(mainMat, 'wall', cx, botY + dadoH + shaftH * 0.5, cz, cw, shaftH, cd);
    pushArchFrustum(
      mats.sandstoneMat,
      'platform',
      cx,
      topY - copingH * 0.5,
      cz,
      cw + (alongX ? 0 : 0.22),
      copingH,
      cd + (alongX ? 0.22 : 0),
      cw + (alongX ? 0 : 0.08),
      cd + (alongX ? 0.08 : 0)
    );

    const wallSpan = alongX ? cw : cd;
    if (highDetail && wallSpan >= 4.0) {
      const beamCount = Math.max(2, Math.floor(wallSpan / 2.0));
      for (let b = 0; b < beamCount; b++) {
        const off = -wallSpan * 0.38 + (b / Math.max(1, beamCount - 1)) * (wallSpan * 0.76);
        if (alongX) {
          addDecorBox(cx + off, topY - 0.30, cz, 0.16, 0.16, cd + 0.44, mats.cedarBeamMat, true);
        } else {
          addDecorBox(cx, topY - 0.30, cz + off, cw + 0.44, 0.16, 0.16, mats.cedarBeamMat, true);
        }
      }
    }

    if (wallSpan >= 5.5 && ch >= 3.0) {
      const inwardSign = alongX ? (cz >= 0 ? -1 : 1) : cx >= 0 ? -1 : 1;
      const winY = Math.min(topY - 0.76, botY + dadoH + 0.92);
      if (alongX) {
        addTealShutteredWindow(shutterCtx, { cx, cy: winY, cz: cz + inwardSign * halfD, alongX: true, faceSign: inwardSign, width: 0.96, height: 1.12, shutterMat: mats.shutterWoodMat });
      } else {
        addTealShutteredWindow(shutterCtx, { cx: cx + inwardSign * halfW, cy: winY, cz, alongX: false, faceSign: inwardSign, width: 0.96, height: 1.12, shutterMat: mats.shutterWoodMat });
      }
    }
  };

  const buildPlatform = (obs, mainMat) => {
    const { x: cx, y: cy, z: cz, w: cw, h: ch, d: cd } = obs;
    const halfW = cw * 0.5;
    const halfH = ch * 0.5;
    const halfD = cd * 0.5;
    const topY = cy + halfH;
    const botY = cy - halfH;
    const deckThick = 0.26;
    const dadoH = Math.min(1.08, Math.max(0.50, ch * 0.46));
    const bodyH = Math.max(0.22, ch - deckThick - dadoH);

    pushArchBox(mats.stoneDadoMat, 'dado', cx, botY + dadoH * 0.5, cz, cw + 0.08, dadoH, cd + 0.08);
    pushArchBox(mats.sandstoneMat, 'platform', cx, botY + dadoH + 0.035, cz, cw + 0.14, 0.07, cd + 0.14);
    pushArchBox(mats.stuccoMat, 'wall', cx, botY + dadoH + bodyH * 0.5, cz, cw - 0.10, bodyH, cd - 0.10);
    pushArchBox(mainMat, 'platform', cx, topY - deckThick * 0.5, cz, cw, deckThick, cd);

    // Molded Palace sandstone cornice lip (trimmed at corners to prevent z-fighting)
    addDecorBox(cx, topY - 0.13, cz - halfD, cw + 0.16, 0.22, 0.16, mats.sandstoneTrimMat, true);
    addDecorBox(cx, topY - 0.13, cz + halfD, cw + 0.16, 0.22, 0.16, mats.sandstoneTrimMat, true);
    addDecorBox(cx - halfW, topY - 0.13, cz, 0.16, 0.22, Math.max(0.2, cd - 0.16), mats.sandstoneTrimMat, true);
    addDecorBox(cx + halfW, topY - 0.13, cz, 0.16, 0.22, Math.max(0.2, cd - 0.16), mats.sandstoneTrimMat, true);

    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        addDecorBox(cx + sx * (halfW - 0.22), cy, cz + sz * (halfD - 0.22), 0.52, ch - 0.04, 0.52, mats.sandstoneTrimMat, true);
      }
    }
    if (highDetail) {
      const panelY = botY + dadoH + bodyH * 0.5;
      for (const side of [-1, 1]) {
        addDecorBox(cx, panelY, cz + side * (halfD - 0.03), Math.max(1.6, cw - 2.2), Math.max(0.28, bodyH * 0.62), 0.06, mats.recessDarkMat, false);
        addDecorBox(cx + side * (halfW - 0.03), panelY, cz, 0.06, Math.max(0.28, bodyH * 0.62), Math.max(1.6, cd - 2.2), mats.recessDarkMat, false);
      }
    }
  };

  const buildPillar = (obs, mainMat) => {
    const { x: cx, y: cy, z: cz, w: cw, h: ch, d: cd } = obs;
    const topY = cy + ch * 0.5;
    const botY = cy - ch * 0.5;
    const baseH = Math.min(0.65, ch * 0.18);

    pushArchFrustum(mats.stoneDadoMat, 'dado', cx, botY + baseH * 0.5, cz, cw + 0.26, baseH, cd + 0.26, cw + 0.06, cd + 0.06);
    pushArchBox(mainMat, 'pillar', cx, botY + baseH + Math.max(0.4, ch - baseH - 0.42) * 0.5, cz, cw - 0.04, Math.max(0.4, ch - baseH - 0.42), cd - 0.04);
    pushArchFrustum(mats.sandstoneMat, 'pillar', cx, topY - 0.21, cz, cw + 0.04, 0.42, cd + 0.04, cw + 0.30, cd + 0.30);
    addDecorBox(cx, topY - 0.48, cz, cw + 0.08, 0.14, cd + 0.08, mats.cedarBeamMat, true);
    if (highDetail) {
      addDecorBox(cx, cy + 0.1, cz, cw + 0.03, ch * 0.44, cd * 0.44, mats.recessDarkMat, false);
      addDecorBox(cx, cy + 0.1, cz, cw * 0.44, ch * 0.44, cd + 0.03, mats.recessDarkMat, false);
    }
  };

  const buildCrate = (obs, mainMat) => {
    buildDustTimberCrate(shutterCtx, obs, mainMat);
  };

  const buildStep = (obs, mainMat) => {
    buildDustSandstoneStep(shutterCtx, obs, mainMat);
  };

  const pushAwningSheet = (mat, x, y, z, w, h, d, rx = 0, ry = 0, rz = 0) => {
    const geo = new THREE.BoxGeometry(w, h, d);
    applyBoxWorldUVs(geo, w, h, d, 1.6);
    applyMetricBoxUV1(geo, w, h, d, 1.6, uvOffsetFor(x, y, z));
    pushArchMesh(mat, geo, x, y, z, rx, ry, rz);
  };

  const buildAccents = () => {
    // 1. Palace Balcony Arched Colonnade & Overhanging Cedar Roof Canopy (`x = 21.8, z = 9.8..19.2`, deck `y = 2.4m`)
    const palaceArchGeo = createMoroccanArchGeometry({
      outerW: 9.6,
      outerH: 6.85,
      innerW: 8.0,
      archSpringY: 5.15,
      archApexY: 6.28,
      depth: 1.38,
      curveSegments: highDetail ? 14 : 7,
      bevel: highDetail,
      tile: 2.4,
      baseYOverride: 4.85
    });
    pushArchMesh(mats.sandstoneMat, palaceArchGeo, 21.8, 0, 14.5, 0, Math.PI * 0.5, 0);
    // Palace Balcony upper parapet frieze & projecting cedar roof overhang beams (`y = 6.55..7.0m`)
    pushArchBox(mats.ochreParapetMat, 'wall', 26.5, 6.85, 14.5, 11.4, 0.65, 11.4);
    pushArchBox(mats.sandstoneMat, 'platform', 26.5, 7.26, 14.5, 11.8, 0.22, 11.8);
    // Wall ledger anchored flush against Palace arch spandrel + front valance bar + sloped rafters + corbel brackets
    addDecorBox(21.12, 6.32, 14.5, 0.18, 0.18, 8.4, mats.cedarBeamMat, true);
    addDecorBox(19.53, 5.90, 14.5, 0.11, 0.11, 8.3, mats.cedarBeamMat, true);
    const beamCount = highDetail ? 6 : 3;
    for (let b = 0; b < beamCount; b++) {
      const bz = 10.4 + (b / Math.max(1, beamCount - 1)) * 8.2;
      addDecorBox(20.8, 6.52, bz, 2.5, 0.16, 0.16, mats.cedarBeamMat, true);
      // Sloped awning support rafter underneath canopy + wall-anchored diagonal corbel bracket
      addDecorBox(20.44, 6.12, bz, 1.96, 0.12, 0.14, mats.cedarBeamMat, true, 0, 0, 0.24);
      addDecorBox(20.76, 5.84, bz, 0.92, 0.11, 0.11, mats.cedarBeamMat, true, 0, 0, -0.68);
    }
    // Draped Palace woven fabric awning resting cleanly atop the cedar rafters (`y = 6.21m`, clear `3.6m+` above 2.4m Palace deck!)
    pushAwningSheet(mats.awningTerracottaMat, 20.42, 6.21, 14.5, 1.88, 0.065, 8.2, 0, 0, 0.24);

    // 2. Iconic Mid Window (Snipers' Nest) Wooden Frame & Overhang (`x = -23.5, z = -11.4`, sill `y = 3.4`, cheeks top `y = 4.6`)
    addDecorBox(-23.5, 4.70, -11.4, 4.2, 0.22, 0.88, mats.cedarBeamMat, true);
    addDecorBox(-25.30, 4.02, -11.4, 0.18, 1.24, 0.82, mats.cedarBeamMat, true);
    addDecorBox(-21.70, 4.02, -11.4, 0.18, 1.24, 0.82, mats.cedarBeamMat, true);
    addDecorBox(-23.5, 3.43, -11.4, 3.68, 0.08, 0.78, mats.cedarBeamMat, true);
    pushArchBox(mats.ochreParapetMat, 'wall', -23.5, 5.25, -11.4, 9.6, 0.95, 0.78);
    pushArchBox(mats.sandstoneMat, 'platform', -23.5, 5.82, -11.4, 9.9, 0.20, 0.96);
    if (highDetail) {
      addDecorBox(-23.5, 5.28, -10.98, 4.5, 0.14, 0.14, mats.cedarBeamMat, true);
      addDecorBox(-23.5, 4.92, -9.96, 4.5, 0.10, 0.10, mats.cedarBeamMat, true);
      for (const rx of [-25.4, -23.5, -21.6]) {
        addDecorBox(rx, 5.10, -10.48, 0.12, 0.12, 1.22, mats.cedarBeamMat, true, 0.28, 0, 0);
        addDecorBox(rx, 4.82, -10.74, 0.11, 0.11, 0.74, mats.cedarBeamMat, true, -0.62, 0, 0);
      }
      pushAwningSheet(mats.awningOchreMat, -23.5, 5.19, -10.47, 4.4, 0.06, 1.25, 0.28, 0, 0);
    }

    // 3. Connector Arched Colonnades (`x = -4.5..3.5, z = 6.9 & 14.1`, gap `6.0m`, headroom >= 3.45m!)
    const connArchGeo = createMoroccanArchGeometry({
      outerW: 8.2,
      outerH: 5.85,
      innerW: 6.04,
      archSpringY: 3.55,
      archApexY: 5.15,
      depth: 1.55,
      curveSegments: highDetail ? 12 : 6,
      bevel: highDetail,
      tile: 2.4,
      baseYOverride: 3.30
    });
    for (const cz of [6.9, 14.1]) {
      pushArchMesh(mats.sandstoneMat, connArchGeo.clone(), -0.5, 0, cz, 0, 0, 0);
      pushArchBox(mats.sandstoneMat, 'platform', -0.5, 5.96, cz, 8.5, 0.22, 1.78);
    }
    connArchGeo.dispose();
    // Overhead Connector market pergola: wall-mounted cedar posts on 3.8m walls + longitudinal side beams + crossbeams + corbels
    for (const wx of [-3.48, 2.48]) {
      addDecorBox(wx, 4.42, 10.5, 0.20, 0.18, 6.6, mats.cedarBeamMat, true);
      for (const pz of [8.4, 10.5, 12.6]) {
        addDecorBox(wx, 4.10, pz, 0.20, 0.76, 0.20, mats.cedarBeamMat, true);
      }
    }
    for (let s = 0; s < 3; s++) {
      const sz = 8.4 + s * 2.1;
      addDecorBox(-0.5, 4.48, sz - 0.56, 6.26, 0.14, 0.14, mats.cedarBeamMat, true);
      addDecorBox(-0.5, 4.45, sz, 6.26, 0.14, 0.14, mats.cedarBeamMat, true);
      addDecorBox(-0.5, 4.41, sz + 0.56, 6.26, 0.14, 0.14, mats.cedarBeamMat, true);
      // Wall-anchored wooden corbel brackets bracing transverse beams onto the Connector walls
      addDecorBox(-3.14, 4.18, sz, 0.86, 0.12, 0.12, mats.cedarBeamMat, true, 0, 0, 0.72);
      addDecorBox(2.14, 4.18, sz, 0.86, 0.12, 0.12, mats.cedarBeamMat, true, 0, 0, -0.72);
      pushAwningSheet(s % 2 === 0 ? mats.awningCreamMat : mats.awningTerracottaMat, -0.5, 4.55, sz, 6.16, 0.06, 1.5, 0.06, 0, 0);
    }

    // 4. A-Ramp Overhead Market Pergola Posts, Corbels, Beams & Shade Cloth (`x = 6.5..18.0, z = 21.5`, headroom >= 3.9m!)
    const rampX = 12.25;
    for (const wx of [7.42, 17.08]) {
      addDecorBox(wx, 4.02, 21.5, 0.20, 0.18, 6.4, mats.cedarBeamMat, true);
      for (const rz of [18.5, 21.5, 24.5]) {
        addDecorBox(wx, 3.84, rz, 0.20, 0.62, 0.20, mats.cedarBeamMat, true);
      }
    }
    for (const rz of [18.5, 21.5, 24.5]) {
      addDecorBox(rampX, 4.15, rz, 10.6, 0.20, 0.20, mats.cedarBeamMat, true);
      addDecorBox(7.78, 3.88, rz, 0.86, 0.12, 0.12, mats.cedarBeamMat, true, 0, 0, 0.72);
      addDecorBox(16.72, 3.88, rz, 0.86, 0.12, 0.12, mats.cedarBeamMat, true, 0, 0, -0.72);
    }
    pushAwningSheet(mats.awningCreamMat, rampX, 4.28, 21.5, 9.6, 0.065, 5.4);

    // 5. CT Ticket Booth Service Awning (`(14.0, 1.5, -22.5)`, faces South toward A-Site)
    addDecorBox(14.0, 2.86, -19.86, 3.56, 0.12, 0.12, mats.cedarBeamMat, true);
    addDecorBox(14.0, 2.58, -18.78, 3.56, 0.09, 0.09, mats.cedarBeamMat, true);
    for (const bx of [12.45, 14.0, 15.55]) {
      addDecorBox(bx, 2.72, -19.32, 0.10, 0.10, 1.18, mats.cedarBeamMat, true, 0.24, 0, 0);
      addDecorBox(bx, 2.48, -19.58, 0.09, 0.09, 0.72, mats.cedarBeamMat, true, -0.62, 0, 0);
    }
    pushAwningSheet(mats.awningOchreMat, 14.0, 2.79, -19.33, 3.5, 0.06, 1.18, 0.24, 0, 0);

    // 6. 4 Outer Palace Corner Bastion Watchtowers seated outside playable bounds (`±(halfSize + 1.6)`)
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const bx = sx * (halfSize + 1.6);
        const bz = sz * (halfSize + 1.6);
        pushArchBox(mats.stoneDadoMat, 'dado', bx, 0.56, bz, 5.4, 1.12, 5.4);
        pushArchBox(mats.ochreParapetMat, 'wall', bx, 10.8, bz, 5.0, 19.4, 5.0);
        pushArchBox(mats.sandstoneMat, 'platform', bx, 14.2, bz, 5.4, 0.34, 5.4);
        pushArchBox(mats.sandstoneMat, 'platform', bx, 20.2, bz, 5.9, 0.65, 5.9);
        addDecorBox(bx, 18.4, bz, 5.5, 0.22, 5.5, mats.cedarBeamMat, true);
        if (highDetail) {
          addDecorCyl(bx, 21.9, bz, 1.85, 1.45, mats.palaceDomeMat, 'y', true);
          addDecorCyl(bx, 23.0, bz, 0.11, 1.2, mats.forgedIronMat, 'y', true);
        }
      }
    }

    // 7. Moroccan Palace Courtyard Skyline & Overhead Cables
    buildDustCourtyardBackdrop({
      game,
      halfSize,
      highDetail,
      registerInstanced: ctx.registerInstancedItem,
      unitBoxGeo: ctx.unitBoxGeo,
      unitCylGeo: ctx.unitCylGeo,
      mats: saltlineMats,
      darkSteelMat: mats.forgedIronMat,
      variant: 'mirage'
    });
  };

  return { buildWall, buildPlatform, buildPillar, buildCrate, buildStep, buildAccents };
}

// ============================================================================
// 2. DE_INFERNO — TUSCAN ITALY B-SITE FOUNTAIN & BANANA (`halfSize: 36`)
// ============================================================================

function createInfernoMaterials(game, plan, highDetail) {
  const stuccoMat = makePlanMaterial(game, plan, 'de_inferno', 0xe2c7a4, 'wall', 0.90, 0.02, highDetail, 'wall');
  const stoneDadoMat = makePlanMaterial(game, plan, 'de_inferno', 0xb8856c, 'dado', 0.90, 0.03, highDetail, 'dado');
  const limestoneMat = makePlanMaterial(game, plan, 'de_inferno', 0xc8b59e, 'platform', 0.88, 0.02, highDetail, 'platform');
  const cobbleCurbMat = makePlanMaterial(game, plan, 'de_inferno', 0xbcb2a4, 'step', 0.88, 0.02, highDetail, null);

  const terracottaTex = createTerracottaTileTexture(game);
  const terracottaRoofMat = new THREE.MeshStandardMaterial({
    map: terracottaTex,
    color: terracottaTex ? 0xffffff : 0xa64b30,
    roughness: 0.86,
    metalness: 0.02
  });
  const terracottaTrimMat = new THREE.MeshStandardMaterial({
    map: terracottaTex,
    color: terracottaTex ? 0xf5e8de : 0xbd603e,
    roughness: 0.88,
    metalness: 0.02
  });
  const tuscanPeachMat = new THREE.MeshStandardMaterial({ color: 0xdcb48a, roughness: 0.90, metalness: 0.02 });
  const fountainStoneMat = new THREE.MeshStandardMaterial({ color: 0xc9c0b2, roughness: 0.84, metalness: 0.03 });
  const fountainWaterMat = new THREE.MeshStandardMaterial({ color: 0x3b8694, roughness: 0.14, metalness: 0.28, envMapIntensity: 1.35 });
  const verdigrisBronzeMat = new THREE.MeshStandardMaterial({ color: 0x4c7062, roughness: 0.56, metalness: 0.48 });
  const wroughtIronMat = new THREE.MeshStandardMaterial({ color: 0x1e2024, roughness: 0.48, metalness: 0.64 });
  const crateIronBracketMat = new THREE.MeshStandardMaterial({ color: 0x26221e, roughness: 0.58, metalness: 0.55 });
  const oliveShutterMat = new THREE.MeshStandardMaterial({ color: 0x3d5c3f, roughness: 0.86, metalness: 0.03 });
  const oakBarrelMat = new THREE.MeshStandardMaterial({ color: 0x6c492d, roughness: 0.84, metalness: 0.03 });
  const cedarBeamMat = new THREE.MeshStandardMaterial({ color: 0x503521, roughness: 0.88, metalness: 0.03 });
  const recessDarkMat = new THREE.MeshStandardMaterial({ color: 0x161210, roughness: 0.96, metalness: 0.0 });
  const bananaCarBodyMat = new THREE.MeshStandardMaterial({ color: 0x4b5f72, roughness: 0.42, metalness: 0.48 });
  const carGlassMat = new THREE.MeshStandardMaterial({ color: 0x16202c, roughness: 0.12, metalness: 0.85, envMapIntensity: 1.35 });
  const carHeadlightMat = new THREE.MeshStandardMaterial({ color: 0xdbe4ee, roughness: 0.18, metalness: 0.32 });
  const carAmberSignalMat = new THREE.MeshStandardMaterial({ color: 0xd9821e, roughness: 0.28, metalness: 0.18 });
  const carTaillightMat = new THREE.MeshStandardMaterial({ color: 0xa82020, roughness: 0.26, metalness: 0.22 });

  for (const m of [
    terracottaRoofMat,
    terracottaTrimMat,
    tuscanPeachMat,
    fountainStoneMat,
    fountainWaterMat,
    verdigrisBronzeMat,
    wroughtIronMat,
    crateIronBracketMat,
    oliveShutterMat,
    oakBarrelMat,
    cedarBeamMat,
    recessDarkMat,
    bananaCarBodyMat,
    carGlassMat,
    carHeadlightMat,
    carAmberSignalMat,
    carTaillightMat
  ]) {
    game.arenaMaterials.add(m);
  }

  return {
    stuccoMat,
    stoneDadoMat,
    limestoneMat,
    cobbleCurbMat,
    terracottaRoofMat,
    terracottaTrimMat,
    tuscanPeachMat,
    fountainStoneMat,
    fountainWaterMat,
    verdigrisBronzeMat,
    wroughtIronMat,
    forgedIronMat: wroughtIronMat,
    crateIronBracketMat,
    oliveShutterMat,
    tealShutterMat: oliveShutterMat,
    oakBarrelMat,
    cedarBeamMat,
    sandstoneTrimMat: fountainStoneMat,
    recessDarkMat,
    bananaCarBodyMat,
    carGlassMat,
    carHeadlightMat,
    carAmberSignalMat,
    carTaillightMat
  };
}

function buildInfernoArchitecture(ctx) {
  const { game, mapCfg, halfSize, highDetail, plan, saltlineMats, pushArchMesh, pushArchBox, pushArchFrustum, addDecorBox, addDecorCyl } = ctx;
  const mats = createInfernoMaterials(game, plan, highDetail);
  const shutterCtx = { ...ctx, dustMats: mats };
  const clearance = createSpawnClearanceChecker(mapCfg);

  const isFountainBasin = (obs) => obs.type === 'platform' && Math.abs(obs.x) < 1.5 && Math.abs(obs.z + 3.0) < 1.5 && obs.h < 1.3;
  const isFountainSpire = (obs) => obs.type === 'pillar' && Math.abs(obs.x) < 1.5 && Math.abs(obs.z + 3.0) < 1.5;

  const pushRoofFrustum = (mat, cx, cy, cz, bottomW, h, bottomD, topW, topD) => {
    const geo = createTrapezoidPrismGeometry(bottomW, h, bottomD, topW, topD, 1.6, uvOffsetFor(cx, cy, cz));
    applyRoofTileMetricUVs(geo, 1.6, uvOffsetFor(cx, cy, cz));
    pushArchMesh(mat, geo, cx, cy, cz, 0, 0, 0);
  };

  const addTerracottaRoofEave = (cx, topY, cz, spanLen, wallDepth, alongX) => {
    const eaveOverhang = 0.62;
    const roofH = 0.68;
    const ridgeW = alongX ? spanLen + 0.32 : wallDepth + eaveOverhang * 2;
    const ridgeD = alongX ? wallDepth + eaveOverhang * 2 : spanLen + 0.32;
    const topW = alongX ? spanLen + 0.10 : Math.max(0.24, wallDepth * 0.25);
    const topD = alongX ? Math.max(0.24, wallDepth * 0.25) : spanLen + 0.10;

    // Pitched terracotta roof prism overhanging both sides of wall with clean metric barrel-tile UVs
    pushRoofFrustum(mats.terracottaRoofMat, cx, topY + roofH * 0.5, cz, ridgeW, roofH, ridgeD, topW, topD);

    // Sculpted terracotta barrel-tile ridge cap & wood fascia rafters
    if (alongX) {
      pushRoofFrustum(mats.terracottaTrimMat, cx, topY + roofH + 0.05, cz, spanLen + 0.34, 0.12, 0.22, spanLen + 0.16, 0.14);
      if (highDetail && spanLen >= 4.0) {
        const rafterCount = Math.min(18, Math.max(3, Math.floor(spanLen / 1.45)));
        for (let r = 0; r < rafterCount; r++) {
          const rx = cx - spanLen * 0.45 + (r / Math.max(1, rafterCount - 1)) * (spanLen * 0.90);
          addDecorBox(rx, topY - 0.06, cz, 0.11, 0.12, ridgeD - 0.14, mats.cedarBeamMat, true);
        }
      }
    } else {
      pushRoofFrustum(mats.terracottaTrimMat, cx, topY + roofH + 0.05, cz, 0.22, 0.12, spanLen + 0.34, 0.14, spanLen + 0.16);
      if (highDetail && spanLen >= 4.0) {
        const rafterCount = Math.min(18, Math.max(3, Math.floor(spanLen / 1.45)));
        for (let r = 0; r < rafterCount; r++) {
          const rz = cz - spanLen * 0.45 + (r / Math.max(1, rafterCount - 1)) * (spanLen * 0.90);
          addDecorBox(cx, topY - 0.06, rz, ridgeW - 0.14, 0.12, 0.11, mats.cedarBeamMat, true);
        }
      }
    }
  };

  const addWroughtIronJulietBalcony = (cx, cy, cz, alongX, faceSign, width = 1.45) => {
    const depth = 0.34;
    if (alongX) {
      const bz = cz + faceSign * (depth * 0.5 + 0.04);
      addDecorBox(cx, cy - 0.46, bz, width + 0.18, 0.10, depth + 0.12, mats.fountainStoneMat, true);
      addDecorBox(cx, cy + 0.18, cz + faceSign * (depth + 0.04), width + 0.10, 0.045, 0.045, mats.wroughtIronMat, true);
      addDecorBox(cx, cy - 0.38, cz + faceSign * (depth + 0.04), width + 0.10, 0.04, 0.04, mats.wroughtIronMat, false);
      const bars = highDetail ? 7 : 4;
      for (let b = 0; b < bars; b++) {
        const bx = cx - width * 0.48 + (b / (bars - 1)) * (width * 0.96);
        addDecorBox(bx, cy - 0.10, cz + faceSign * (depth + 0.04), 0.028, 0.58, 0.028, mats.wroughtIronMat, false);
      }
    } else {
      const bx = cx + faceSign * (depth * 0.5 + 0.04);
      addDecorBox(bx, cy - 0.46, cz, depth + 0.12, 0.10, width + 0.18, mats.fountainStoneMat, true);
      addDecorBox(cx + faceSign * (depth + 0.04), cy + 0.18, cz, 0.045, 0.045, width + 0.10, mats.wroughtIronMat, true);
      addDecorBox(cx + faceSign * (depth + 0.04), cy - 0.38, cz, 0.04, 0.04, width + 0.10, mats.wroughtIronMat, false);
      const bars = highDetail ? 7 : 4;
      for (let b = 0; b < bars; b++) {
        const bz = cz - width * 0.48 + (b / (bars - 1)) * (width * 0.96);
        addDecorBox(cx + faceSign * (depth + 0.04), cy - 0.10, bz, 0.028, 0.58, 0.028, mats.wroughtIronMat, false);
      }
    }
  };

  const buildWall = (obs, mainMat) => {
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
      const dadoH = 1.12;

      pushArchBox(mainMat, 'wall', cx, cy, cz, cw, ch, cd);
      pushArchBox(mats.tuscanPeachMat, 'wall', cx, upperY, cz, cw, upperH, cd);

      // Cobblestone curb border + Tuscan stone/brick dado + stringcourse + overhanging terracotta roof eaves
      // Trim lengths inside corner towers (±(halfSize - 0.5)) so perpendicular perimeter trims never coplanarly overlap
      if (alongX) {
        pushArchBox(mats.stoneDadoMat, 'dado', cx, dadoH * 0.5, cz + inward * 0.56, cw - 3.2, dadoH, 0.14);
        pushArchBox(mats.cobbleCurbMat, 'step', cx, 0.08, cz + inward * 0.78, cw - 3.4, 0.16, 0.52);
        pushArchBox(mats.limestoneMat, 'platform', cx, dadoH + 0.04, cz + inward * 0.58, cw - 3.1, 0.08, 0.18);
        pushArchBox(mats.limestoneMat, 'platform', cx, 4.45, cz + inward * 0.56, cw - 3.0, 0.22, 0.16);
      } else {
        pushArchBox(mats.stoneDadoMat, 'dado', cx + inward * 0.56, dadoH * 0.5, cz, 0.14, dadoH, cd - 3.2);
        pushArchBox(mats.cobbleCurbMat, 'step', cx + inward * 0.78, 0.08, cz, 0.52, 0.16, cd - 3.4);
        pushArchBox(mats.limestoneMat, 'platform', cx + inward * 0.58, dadoH + 0.04, cz, 0.18, 0.08, cd - 3.1);
        pushArchBox(mats.limestoneMat, 'platform', cx + inward * 0.56, 4.45, cz, 0.16, 0.22, cd - 3.0);
      }

      addTerracottaRoofEave(cx, topY + upperH, cz, (alongX ? cw : cd) - 3.0, alongX ? cd : cw, alongX);

      // Olive-green Italian shuttered windows + wrought-iron Juliet balconies
      const wallSpan = alongX ? cw : cd;
      const nicheStep = highDetail ? 12 : 24;
      for (let off = -wallSpan * 0.5 + 9; off <= wallSpan * 0.5 - 9; off += nicheStep) {
        if (alongX) {
          const wz = cz + inward * halfD;
          addTealShutteredWindow(shutterCtx, { cx: cx + off, cy: 6.1, cz: wz, alongX: true, faceSign: inward, width: 1.12, height: 1.62, shutterMat: mats.oliveShutterMat });
          addWroughtIronJulietBalcony(cx + off, 5.42, wz, true, inward, 1.48);
        } else {
          const wx = cx + inward * halfW;
          addTealShutteredWindow(shutterCtx, { cx: wx, cy: 6.1, cz: cz + off, alongX: false, faceSign: inward, width: 1.12, height: 1.62, shutterMat: mats.oliveShutterMat });
          addWroughtIronJulietBalcony(wx, 5.42, cz + off, false, inward, 1.48);
        }
      }
      return;
    }

    const alongX = cw >= cd;
    if (ch < 2.1) {
      // Banana Half-Wall: weathered brick/terracotta plaster + stone curb + terracotta coping cap
      const lowDadoH = Math.min(0.62, ch * 0.44);
      pushArchBox(mats.cobbleCurbMat, 'step', cx, botY + 0.06, cz, cw + 0.16, 0.12, cd + 0.16);
      pushArchBox(mats.stoneDadoMat, 'dado', cx, botY + lowDadoH * 0.5, cz, cw + 0.06, lowDadoH, cd + 0.06);
      pushArchBox(mainMat, 'wall', cx, botY + lowDadoH + Math.max(0.2, ch - lowDadoH - 0.14) * 0.5, cz, cw, Math.max(0.2, ch - lowDadoH - 0.14), cd);
      pushRoofFrustum(mats.terracottaRoofMat, cx, topY - 0.07, cz, cw + 0.14, 0.14, cd + 0.14, cw + 0.02, cd + 0.02);
      return;
    }

    const dadoH = Math.min(1.10, ch * 0.36);
    const copingH = 0.18;
    const shaftH = Math.max(0.4, ch - dadoH - copingH);
    const isChurchWing = alongX && Math.abs(cz + 17.5) < 0.6 && Math.abs(Math.abs(cx) - 5.6) < 0.6;

    pushArchBox(mats.cobbleCurbMat, 'step', cx, botY + 0.07, cz, cw + (alongX ? 0.06 : 0.24), 0.14, cd + (alongX ? 0.24 : 0.06));
    pushArchBox(mats.stoneDadoMat, 'dado', cx, botY + dadoH * 0.5, cz, cw + (alongX ? 0.02 : 0.08), dadoH, cd + (alongX ? 0.08 : 0.02));
    pushArchBox(mats.limestoneMat, 'platform', cx, botY + dadoH + 0.035, cz, cw + (alongX ? 0.04 : 0.14), 0.07, cd + (alongX ? 0.14 : 0.04));
    pushArchBox(mainMat, 'wall', cx, botY + dadoH + shaftH * 0.5, cz, cw, shaftH, cd);
    pushArchFrustum(mats.limestoneMat, 'platform', cx, topY - copingH * 0.5, cz, cw + 0.14, copingH, cd + 0.14, cw + 0.04, cd + 0.04);

    // Pitched terracotta roof eave overhanging tall Tuscan alley/courtyard walls (trim Church wings cleanly at archway spandrel)
    if (ch >= 3.4) {
      if (isChurchWing) {
        const wingSign = cx >= 0 ? 1 : -1;
        addTerracottaRoofEave(cx + wingSign * 0.72, topY, cz, cw - 1.44, cd, true);
      } else {
        addTerracottaRoofEave(cx, topY, cz, alongX ? cw : cd, alongX ? cd : cw, alongX);
      }
    }

    const wallSpan = alongX ? cw : cd;
    if (wallSpan >= 5.5 && ch >= 3.2) {
      const inwardSign = alongX ? (cz >= 0 ? -1 : 1) : cx >= 0 ? -1 : 1;
      const winY = Math.min(topY - 0.80, botY + dadoH + 0.92);
      if (alongX) {
        addTealShutteredWindow(shutterCtx, { cx, cy: winY, cz: cz + inwardSign * halfD, alongX: true, faceSign: inwardSign, width: 0.95, height: 1.15, shutterMat: mats.oliveShutterMat });
      } else {
        addTealShutteredWindow(shutterCtx, { cx: cx + inwardSign * halfW, cy: winY, cz, alongX: false, faceSign: inwardSign, width: 0.95, height: 1.15, shutterMat: mats.oliveShutterMat });
      }
    }
  };

  const buildPlatform = (obs, mainMat) => {
    const { x: cx, y: cy, z: cz, w: cw, h: ch, d: cd } = obs;
    const topY = cy + ch * 0.5;
    const botY = cy - ch * 0.5;

    // Iconic Central B-Site Octagonal Stone Fountain Basin (`(0, 0.475, -3.0, 6.2, 0.95, 6.2)`)
    if (isFountainBasin(obs)) {
      const radius = Math.min(cw, cd) * 0.52;
      const octRot = Math.PI / 8;

      // Grounded cobblestone step apron
      const apronGeo = new THREE.CylinderGeometry(radius + 0.24, radius + 0.34, 0.14, 8);
      applyPlanarMetricUVs(apronGeo, 2.2, [0, 0]);
      pushArchMesh(mats.cobbleCurbMat, apronGeo, cx, botY + 0.07, cz, 0, octRot, 0);

      // Octagonal carved limestone basin outer body
      const basinGeo = new THREE.CylinderGeometry(radius, radius + 0.10, ch - 0.16, 8);
      applyPlanarMetricUVs(basinGeo, 2.2, [0, 0]);
      pushArchMesh(mats.fountainStoneMat, basinGeo, cx, botY + 0.12 + (ch - 0.16) * 0.5, cz, 0, octRot, 0);

      // Molded octagonal overhanging stone coping lip flush at `topY`
      const rimGeo = new THREE.CylinderGeometry(radius + 0.16, radius + 0.04, 0.16, 8);
      applyPlanarMetricUVs(rimGeo, 2.2, [0, 0]);
      pushArchMesh(mats.limestoneMat, rimGeo, cx, topY - 0.08, cz, 0, octRot, 0);

      // Sunlit reflective turquoise shallow water plane tucked cleanly inside the octagonal basin rim
      const waterGeo = new THREE.CylinderGeometry(radius - 0.34, radius - 0.34, 0.06, 8);
      applyPlanarMetricUVs(waterGeo, 2.0, [0, 0]);
      pushArchMesh(mats.fountainWaterMat, waterGeo, cx, topY - 0.015, cz, 0, octRot, 0);

      // Carved stone relief medallions on all 8 octagonal sides (highDetail)
      if (highDetail) {
        for (let f = 0; f < 8; f++) {
          const ang = (f / 8) * Math.PI * 2;
          const fx = cx + Math.cos(ang) * (radius + 0.04);
          const fz = cz + Math.sin(ang) * (radius + 0.04);
          addDecorBox(fx, botY + ch * 0.52, fz, 0.08, ch * 0.44, 1.25, mats.stoneDadoMat, false, 0, -ang, 0);
        }
      }
      return;
    }

    // Standard Tuscan Courtyard / Balcony Terrace Deck (Coffins, Church Cloister, SW/SE Balconies)
    const halfW = cw * 0.5;
    const halfD = cd * 0.5;
    const deckThick = 0.24;
    const dadoH = Math.min(1.05, Math.max(0.48, ch * 0.48));
    const bodyH = Math.max(0.20, ch - deckThick - dadoH);

    pushArchBox(mats.cobbleCurbMat, 'step', cx, botY + 0.065, cz, cw + 0.24, 0.13, cd + 0.24);
    pushArchBox(mats.stoneDadoMat, 'dado', cx, botY + dadoH * 0.5, cz, cw + 0.08, dadoH, cd + 0.08);
    pushArchBox(mats.stuccoMat, 'wall', cx, botY + dadoH + bodyH * 0.5, cz, cw - 0.08, bodyH, cd - 0.08);
    pushArchBox(mainMat, 'platform', cx, topY - deckThick * 0.5, cz, cw, deckThick, cd);

    addDecorBox(cx, topY - 0.12, cz - halfD, cw + 0.16, 0.20, 0.16, mats.fountainStoneMat, true);
    addDecorBox(cx, topY - 0.12, cz + halfD, cw + 0.16, 0.20, 0.16, mats.fountainStoneMat, true);
    addDecorBox(cx - halfW, topY - 0.12, cz, 0.16, 0.20, Math.max(0.2, cd - 0.16), mats.fountainStoneMat, true);
    addDecorBox(cx + halfW, topY - 0.12, cz, 0.16, 0.20, Math.max(0.2, cd - 0.16), mats.fountainStoneMat, true);

    // Wrought-iron Italian balcony railings along open edges (strictly keeping stair approaches open!)
    const inset = 0.14;
    const edges = [
      { key: 'north', x0: cx - halfW + inset, z0: cz - halfD + inset, x1: cx + halfW - inset, z1: cz - halfD + inset },
      { key: 'south', x0: cx - halfW + inset, z0: cz + halfD - inset, x1: cx + halfW - inset, z1: cz + halfD - inset },
      { key: 'west', x0: cx - halfW + inset, z0: cz - halfD + inset, x1: cx - halfW + inset, z1: cz + halfD - inset },
      { key: 'east', x0: cx + halfW - inset, z0: cz - halfD + inset, x1: cx + halfW - inset, z1: cz + halfD - inset }
    ];
    for (let e = 0; e < edges.length; e++) {
      const ed = edges[e];
      if (!clearance.hasAdjacentStairOrBlocker(obs, ed.key)) {
        addPlatformEdgeRailing(ctx, {
          ...ed,
          deckY: topY,
          height: 0.90,
          postMat: mats.wroughtIronMat,
          railMat: mats.wroughtIronMat,
          midRail: highDetail
        });
      }
    }
  };

  const buildPillar = (obs, mainMat) => {
    const { x: cx, y: cy, z: cz, w: cw, h: ch, d: cd } = obs;
    const topY = cy + ch * 0.5;
    const botY = cy - ch * 0.5;

    // Iconic Central B-Site Fountain Tiered Spire & Sculpted Bowls (`(0, 2.25, -3.0, 2.0, 2.6, 2.0)`)
    if (isFountainSpire(obs)) {
      const segs = highDetail ? 12 : 8;
      // Stepped octagonal pedestal base
      const pedBaseGeo = new THREE.CylinderGeometry(0.72, 0.94, 0.48, 8);
      applyPlanarMetricUVs(pedBaseGeo, 1.8, [0, 0]);
      pushArchMesh(mats.fountainStoneMat, pedBaseGeo, cx, botY + 0.24, cz, 0, Math.PI / 8, 0);

      // Fluted lower stone column shaft
      const lowerShaftGeo = new THREE.CylinderGeometry(0.42, 0.52, 0.85, segs);
      applyPlanarMetricUVs(lowerShaftGeo, 1.8, [0, 0]);
      pushArchMesh(mats.fountainStoneMat, lowerShaftGeo, cx, botY + 0.88, cz, 0, 0, 0);

      // Wide sculpted middle limestone catch-bowl + shallow water disc
      const midBowlGeo = new THREE.CylinderGeometry(1.18, 0.54, 0.34, segs);
      applyPlanarMetricUVs(midBowlGeo, 1.8, [0, 0]);
      pushArchMesh(mats.limestoneMat, midBowlGeo, cx, botY + 1.38, cz, 0, 0, 0);
      const midWaterGeo = new THREE.CylinderGeometry(1.02, 1.02, 0.04, segs);
      applyPlanarMetricUVs(midWaterGeo, 1.8, [0, 0]);
      pushArchMesh(mats.fountainWaterMat, midWaterGeo, cx, botY + 1.54, cz, 0, 0, 0);

      // Upper urn shaft + top basin + verdigris bronze spout finial
      const upperShaftGeo = new THREE.CylinderGeometry(0.28, 0.36, 0.62, segs);
      applyPlanarMetricUVs(upperShaftGeo, 1.6, [0, 0]);
      pushArchMesh(mats.fountainStoneMat, upperShaftGeo, cx, botY + 1.86, cz, 0, 0, 0);
      const topBowlGeo = new THREE.CylinderGeometry(0.66, 0.28, 0.26, segs);
      applyPlanarMetricUVs(topBowlGeo, 1.6, [0, 0]);
      pushArchMesh(mats.limestoneMat, topBowlGeo, cx, botY + 2.26, cz, 0, 0, 0);

      addDecorCyl(cx, topY + 0.14, cz, 0.14, 0.42, mats.verdigrisBronzeMat, 'y', true);
      addDecorCyl(cx, topY + 0.40, cz, 0.07, 0.24, mats.verdigrisBronzeMat, 'y', false);
      if (highDetail) {
        // 4 subtle arched water jet accents spilling into middle bowl
        for (let j = 0; j < 4; j++) {
          const ang = (j / 4) * Math.PI * 2 + Math.PI * 0.25;
          addDecorBox(cx + Math.cos(ang) * 0.45, botY + 1.98, cz + Math.sin(ang) * 0.45, 0.035, 0.68, 0.035, mats.fountainWaterMat, false, Math.sin(ang) * 0.42, 0, -Math.cos(ang) * 0.42);
        }
      }
      return;
    }

    // Italian Cloister Brick/Stone Columns
    const baseH = Math.min(0.55, ch * 0.18);
    pushArchFrustum(mats.fountainStoneMat, 'platform', cx, botY + baseH * 0.5, cz, cw + 0.26, baseH, cd + 0.26, cw + 0.06, cd + 0.06);
    pushArchBox(mainMat, 'pillar', cx, botY + baseH + Math.max(0.4, ch - baseH - 0.42) * 0.5, cz, cw - 0.04, Math.max(0.4, ch - baseH - 0.42), cd - 0.04);
    pushArchFrustum(mats.fountainStoneMat, 'platform', cx, topY - 0.21, cz, cw + 0.04, 0.42, cd + 0.04, cw + 0.34, cd + 0.34);
  };

  const buildContainer = (obs) => {
    // Bespoke CS2 Inferno Banana Car European hatchback/sedan (`(-4.5, 0.9, 14.5, 2.4, 1.8, 4.8)`)
    const { x: cx, y: cy, z: cz, w: cw, h: ch, d: cd } = obs;
    const botY = cy - ch * 0.5;
    const alongZ = cd >= cw;
    const len = alongZ ? cd : cw;
    const wid = alongZ ? cw : cd;
    const sLen = len / 4.8;
    const sWid = wid / 2.4;

    const place = (lx, ly, lz, sw, sh, sd, mat, castShadow = true, rx = 0, ry = 0, rz = 0) => {
      if (alongZ) addDecorBox(cx + lx, botY + ly, cz + lz, sw, sh, sd, mat, castShadow, rx, ry, rz);
      else addDecorBox(cx + lz, botY + ly, cz - lx, sd, sh, sw, mat, castShadow, rz, ry, -rx);
    };
    const placeArch = (mat, geo, lx, ly, lz) => {
      const yaw = alongZ ? 0 : Math.PI * 0.5;
      if (alongZ) pushArchMesh(mat, geo, cx + lx, botY + ly, cz + lz, 0, yaw, 0);
      else pushArchMesh(mat, geo, cx + lz, botY + ly, cz - lx, 0, yaw, 0);
    };

    // 1. Undercarriage chassis floorpan & side sill skirts
    place(0, 0.24, 0, wid - 0.54, 0.14, len - 0.44, mats.wroughtIronMat, false);
    for (const sx of [-1, 1]) {
      place(sx * (wid * 0.5 - 0.12), 0.29, 0, 0.14, 0.14, 1.98 * sLen, mats.wroughtIronMat, true);
    }

    // 2. Sculpted lower waist, recessed wheel bays, upper shoulder beltline & rear hatch deck
    place(0, 0.50, 0.70 * sLen, wid - 0.36, 0.36, 2.98 * sLen, mats.bananaCarBodyMat, true);
    place(0, 0.50, 0, wid - 0.20, 0.34, 1.90 * sLen, mats.bananaCarBodyMat, true);
    place(0, 0.84, 0.70 * sLen, wid - 0.20, 0.34, 2.98 * sLen, mats.bananaCarBodyMat, true);
    // Side door seam, protective black rub strip & flush door handles
    place(0, 0.68, 0.24 * sLen, wid - 0.185, 0.62, 0.025, mats.wroughtIronMat, false);
    place(0, 0.63, 0.02 * sLen, wid - 0.175, 0.07, 1.98 * sLen, mats.wroughtIronMat, false);
    for (const sx of [-1, 1]) {
      for (const hz of [-0.02 * sLen, 0.92 * sLen]) {
        place(sx * (wid * 0.5 - 0.09), 0.86, hz, 0.04, 0.04, 0.15, mats.wroughtIronMat, false);
      }
      // Side wing mirrors at A-pillar cowl
      place(sx * (wid * 0.5 - 0.06), 1.04, -0.62 * sLen, 0.16, 0.10, 0.11, mats.wroughtIronMat, true);
    }

    // 3. Sculpted sloped front hood wedge + front apron
    place(0, 0.52, -1.52 * sLen, wid - 0.28, 0.36, 1.48 * sLen, mats.bananaCarBodyMat, true);
    const hoodGeo = createWedgePrismGeometry({
      wBottom: wid - 0.22,
      wTop: wid - 0.34,
      hBack: 0.31,
      hFront: 0.12,
      len: 1.48 * sLen,
      tile: 2.0,
      offset: uvOffsetFor(cx, cy, cz)
    });
    placeArch(mats.bananaCarBodyMat, hoodGeo, 0, 0.70, -1.52 * sLen);
    place(0, 0.89, -1.48 * sLen, 0.84 * sWid, 0.045, 1.12 * sLen, mats.bananaCarBodyMat, false, 0.12, 0, 0);

    // 4. Front fascia: slatted dark radiator grille, recessed twin headlights, outer amber turn signals & bumper
    place(0, 0.39, -2.31 * sLen, wid - 0.14, 0.22, 0.18, mats.wroughtIronMat, true);
    place(0, 0.31, -2.35 * sLen, 1.24 * sWid, 0.09, 0.12, mats.recessDarkMat, false);
    place(0, 0.39, -2.405 * sLen, 0.48, 0.11, 0.02, mats.fountainStoneMat, false);
    place(0, 0.64, -2.25 * sLen, 0.92 * sWid, 0.20, 0.07, mats.recessDarkMat, false);
    for (const sy of [0.57, 0.615, 0.66, 0.705]) {
      place(0, sy, -2.275 * sLen, 0.86 * sWid, 0.018, 0.04, ctx.gunmetalFrameMat, false);
    }
    place(0, 0.64, -2.29 * sLen, 0.08, 0.08, 0.03, ctx.brushedChromeMat, false);
    for (const sx of [-1, 1]) {
      // Recessed headlight housing + twin glass bulbs + outer amber indicator
      place(sx * 0.72 * sWid, 0.65, -2.24 * sLen, 0.38 * sWid, 0.18, 0.08, mats.recessDarkMat, false);
      place(sx * 0.64 * sWid, 0.65, -2.262 * sLen, 0.14 * sWid, 0.13, 0.04, mats.carHeadlightMat, false);
      place(sx * 0.80 * sWid, 0.65, -2.262 * sLen, 0.14 * sWid, 0.13, 0.04, mats.carHeadlightMat, false);
      place(sx * 0.98 * sWid, 0.65, -2.23 * sLen, 0.13 * sWid, 0.14, 0.11, mats.carAmberSignalMat, false);
    }

    // 5. Rear fascia: red taillights, amber indicators, license plate recess, bumper & chrome tailpipe
    place(0, 0.39, 2.29 * sLen, wid - 0.14, 0.22, 0.18, mats.wroughtIronMat, true);
    place(0, 0.62, 2.20 * sLen, 0.56, 0.16, 0.04, mats.recessDarkMat, false);
    place(0, 0.62, 2.22 * sLen, 0.48, 0.11, 0.02, mats.fountainStoneMat, false);
    place(0, 0.72, 2.195 * sLen, 1.24 * sWid, 0.05, 0.04, mats.wroughtIronMat, false);
    for (const sx of [-1, 1]) {
      place(sx * 0.86 * sWid, 0.73, 2.20 * sLen, 0.38 * sWid, 0.15, 0.07, mats.carTaillightMat, false);
      place(sx * 0.92 * sWid, 0.62, 2.20 * sLen, 0.24 * sWid, 0.06, 0.07, mats.carAmberSignalMat, false);
    }
    if (alongZ) {
      addDecorCyl(cx - 0.56 * sWid, botY + 0.25, cz + 2.34 * sLen, 0.045, 0.22, ctx.brushedChromeMat, 'z', false);
    } else {
      addDecorCyl(cx + 2.34 * sLen, botY + 0.25, cz + 0.56 * sWid, 0.045, 0.22, ctx.brushedChromeMat, 'x', false);
    }

    // 6. Tapered greenhouse glass + flush raked A/B/C pillars + sculpted roof + subtle rooftop bar
    const cabGlassGeo = createTrapezoidPrismGeometry(
      wid - 0.38,
      0.52,
      2.66 * sLen,
      wid - 0.66,
      1.54 * sLen,
      2.0,
      uvOffsetFor(cx, cy, cz)
    );
    placeArch(mats.carGlassMat, cabGlassGeo, 0, 1.26, 0.58 * sLen);
    // Solid body-color roof cap sitting squarely on cabin greenhouse
    place(0, 1.555, 0.58 * sLen, wid - 0.62, 0.08, 1.58 * sLen, mats.bananaCarBodyMat, true);
    // Raked A-pillars, vertical B-pillars, and hatchback C-pillars framing glass flush
    for (const sx of [-1, 1]) {
      place(sx * (wid * 0.5 - 0.28), 1.275, -0.47 * sLen, 0.09, 0.785, 0.11, mats.bananaCarBodyMat, true, 0.794, 0, sx * -0.22);
      place(sx * (wid * 0.5 - 0.27), 1.26, 0.44 * sLen, 0.08, 0.54, 0.14, mats.wroughtIronMat, false, 0, 0, sx * -0.24);
      place(sx * (wid * 0.5 - 0.29), 1.275, 1.63 * sLen, 0.11, 0.785, 0.18, mats.bananaCarBodyMat, true, -0.794, 0, sx * -0.22);
      // Subtle matte-black rooftop utility side rail
      place(sx * 0.68 * sWid, 1.615, 0.58 * sLen, 0.055, 0.04, 1.26 * sLen, mats.wroughtIronMat, false);
    }
    for (const rz of [0.20 * sLen, 0.96 * sLen]) {
      place(0, 1.645, rz, 1.44 * sWid, 0.035, 0.06, mats.wroughtIronMat, false);
    }

    // 7. 4 Rubber Tires, Gunmetal/Chrome Rims & Sculpted Wheel-Arch Fenders wrapping each tire
    const wheelR = 0.35;
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const lx = sx * (wid * 0.5 - 0.16);
        const lz = sz * 1.44 * sLen;
        place(sx * (wid * 0.5 - 0.24), 0.44, lz, 0.26, 0.64, 0.88, mats.recessDarkMat, false);
        // Sculpted wheel-arch fender flares wrapping the tire
        place(sx * (wid * 0.5 - 0.11), 0.78, lz, 0.13, 0.09, 0.50, mats.wroughtIronMat, true);
        place(sx * (wid * 0.5 - 0.11), 0.61, lz - 0.35, 0.13, 0.09, 0.40, mats.wroughtIronMat, true, 0.76, 0, 0);
        place(sx * (wid * 0.5 - 0.11), 0.61, lz + 0.35, 0.13, 0.09, 0.40, mats.wroughtIronMat, true, -0.76, 0, 0);

        const wx = alongZ ? cx + lx : cx + lz;
        const wz = alongZ ? cz + lz : cz - lx;
        const axis = alongZ ? 'x' : 'z';
        addDecorCyl(wx, botY + wheelR, wz, wheelR, 0.24, saltlineMats.rubberFenderMat, axis, true);
        addDecorCyl(wx + (alongZ ? sx * 0.02 : 0), botY + wheelR, wz + (alongZ ? 0 : -sx * 0.02), 0.22, 0.255, ctx.gunmetalFrameMat, axis, false);
        addDecorCyl(wx + (alongZ ? sx * 0.03 : 0), botY + wheelR, wz + (alongZ ? 0 : -sx * 0.03), 0.09, 0.265, ctx.brushedChromeMat, axis, false);
      }
    }
  };

  const buildCrate = (obs, mainMat) => {
    buildDustTimberCrate(shutterCtx, obs, mainMat);
  };

  const buildStep = (obs, mainMat) => {
    const { x: cx, y: cy, z: cz, w: cw, h: ch, d: cd } = obs;
    const topY = cy + ch * 0.5;
    const treadH = Math.min(0.12, ch * 0.44);
    pushArchBox(mats.stoneDadoMat, 'dado', cx, cy - treadH * 0.5, cz, cw - 0.04, Math.max(0.05, ch - treadH), cd - 0.04);
    pushArchBox(mainMat, 'step', cx, topY - treadH * 0.5, cz, cw, treadH, cd);
  };

  const addWineBarrel = (bx, bz, baseY = 0) => {
    addDecorCyl(bx, baseY + 0.48, bz, 0.34, 0.96, mats.oakBarrelMat, 'y', true);
    addDecorCyl(bx, baseY + 0.48, bz, 0.365, 0.56, mats.oakBarrelMat, 'y', false);
    for (const hy of [0.16, 0.48, 0.80]) {
      addDecorCyl(bx, baseY + hy, bz, 0.372, 0.045, mats.wroughtIronMat, 'y', false);
    }
  };

  const buildAccents = () => {
    // 1. Church Archway CT-to-B Gateway (`z = -17.5, x = 0`, 4.8m gap, wings `h = 3.6m`, depth `2.04` proud of wing coping)
    const churchArchGeo = createRoundArchGeometry({
      outerW: 7.4,
      outerH: 6.15,
      innerW: 4.86,
      archSpringY: 3.45,
      depth: 2.04,
      curveSegments: highDetail ? 14 : 7,
      bevel: highDetail,
      tile: 2.4,
      baseYOverride: 3.15
    });
    pushArchMesh(mats.stuccoMat, churchArchGeo, 0, 0, -17.5, 0, 0, 0);
    addTerracottaRoofEave(0, 6.15, -17.5, 7.6, 2.04, true);
    if (highDetail) {
      // Wrought-iron Tuscan Church finial atop gable
      addDecorBox(0, 7.25, -17.5, 0.08, 0.85, 0.08, mats.wroughtIronMat, true);
      addDecorBox(0, 7.42, -17.5, 0.46, 0.07, 0.07, mats.wroughtIronMat, true);
    }

    // 2. Arched Italian Cloister Spandrels bridging Garden Cloister pillars `(17.5 & 25.5, 4.1, -16.8)`
    const cloisterArchGeo = createRoundArchGeometry({
      outerW: 9.6,
      outerH: 6.45,
      innerW: 6.42,
      archSpringY: 4.85,
      depth: 1.56,
      curveSegments: highDetail ? 14 : 7,
      bevel: highDetail,
      tile: 2.4,
      baseYOverride: 4.55
    });
    pushArchMesh(mats.stuccoMat, cloisterArchGeo, 21.5, 0, -16.8, 0, 0, 0);
    // Overhanging pitched terracotta cloister roof above Garden deck (`y = 6.45..7.3m`, headroom `>= 4.2m` above 2.2m deck!)
    addTerracottaRoofEave(21.5, 6.45, -20.5, 10.4, 9.2, true);

    // 3. Clustered Italian Wooden Wine Barrels tucked cleanly into courtyard corners (100% clearance-checked!)
    const barrelSpots = [
      [-17.2, 5.6],
      [-18.0, 5.8],
      [17.2, 5.6],
      [18.0, 5.8],
      [-8.8, -15.6],
      [8.8, -15.6],
      [-13.8, 12.2],
      [14.2, 11.8]
    ];
    const maxBarrels = highDetail ? barrelSpots.length : 4;
    let placedBarrels = 0;
    for (let i = 0; i < barrelSpots.length && placedBarrels < maxBarrels; i++) {
      const [bx, bz] = barrelSpots[i];
      if (clearance.isClear(bx, bz, 0.95)) {
        addWineBarrel(bx, bz, 0);
        placedBarrels++;
      }
    }

    // 4. 4 Outer Tuscan Corner Tower Lanterns with pitched terracotta hipped roofs (`skyAtmosphere.js` owns distant villas/campanile/cypresses)
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const bx = sx * (halfSize + 1.5);
        const bz = sz * (halfSize + 1.5);
        addDecorBox(bx, 7.2, bz, 4.4, 14.4, 4.4, mats.tuscanPeachMat, false);
        pushRoofFrustum(mats.terracottaRoofMat, bx, 14.85, bz, 5.2, 0.90, 5.2, 2.8, 2.8);
        if (highDetail) {
          pushRoofFrustum(mats.terracottaRoofMat, bx, 15.65, bz, 2.9, 0.70, 2.9, 0.45, 0.45);
        }
      }
    }
  };

  return { buildWall, buildPlatform, buildPillar, buildContainer, buildCrate, buildStep, buildAccents };
}

// ============================================================================
// 3. DE_NUKE — CEDAR CREEK NUCLEAR PLANT YARD & A-SITE (`halfSize: 38`)
// ============================================================================

function createNukeMaterials(game, plan, highDetail) {
  const concreteWallMat = makePlanMaterial(game, plan, 'de_nuke', 0xc4ccd4, 'wall', 0.88, 0.04, highDetail, 'wall');
  const steelDadoMat = makePlanMaterial(game, plan, 'de_nuke', 0x7d8792, 'dado', 0.60, 0.42, highDetail, 'dado');

  const hasDom = typeof document !== 'undefined';
  const galvanizedSpec = plan.container || { set: 'corrugated_iron_02', tile: 2.0, tint: 0xaab6c4, rough: 0.48, metal: 0.46, normalScale: 1.38 };
  const reactorSpec = plan.platform || { set: 'metal_plate', tile: 2.0, tint: 0xaab6c4, rough: 0.52, metal: 0.46, normalScale: 1.28 };

  const galvanizedCladdingMat = new THREE.MeshStandardMaterial({
    map: hasDom ? createObstacleTexture(game, 0xaab6c4, 'wall') : null,
    roughness: 0.44,
    metalness: 0.48,
    envMapIntensity: 1.18
  });
  attachWorldMacroGrime(galvanizedCladdingMat, { mapId: 'de_nuke', role: 'wall', enabled: highDetail });
  registerPbrSlot(game, galvanizedCladdingMat, galvanizedSpec, 0xaab6c4);

  const reactorSteelMat = new THREE.MeshStandardMaterial({
    map: hasDom ? createObstacleTexture(game, 0xaab6c4, 'platform') : null,
    roughness: 0.40,
    metalness: 0.54,
    envMapIntensity: 1.22
  });
  attachWorldMacroGrime(reactorSteelMat, { mapId: 'de_nuke', role: 'platform', enabled: highDetail });
  registerPbrSlot(game, reactorSteelMat, reactorSpec, 0xaab6c4);

  const reactorAccentBlueMat = new THREE.MeshStandardMaterial({ color: 0x2a5a85, roughness: 0.44, metalness: 0.48 });
  const hazardYellowMat = new THREE.MeshStandardMaterial({ color: 0xeab308, roughness: 0.44, metalness: 0.16 });
  const hazardBlackMat = new THREE.MeshStandardMaterial({ color: 0x16191e, roughness: 0.58, metalness: 0.32 });
  const steelHandrailMat = new THREE.MeshStandardMaterial({ color: 0xd4a017, roughness: 0.42, metalness: 0.44 });

  for (const m of [
    galvanizedCladdingMat,
    reactorSteelMat,
    reactorAccentBlueMat,
    hazardYellowMat,
    hazardBlackMat,
    steelHandrailMat
  ]) {
    game.arenaMaterials.add(m);
  }

  return {
    concreteWallMat,
    steelDadoMat,
    galvanizedCladdingMat,
    reactorSteelMat,
    reactorAccentBlueMat,
    hazardYellowMat,
    hazardBlackMat,
    steelHandrailMat
  };
}

function buildNukeArchitecture(ctx) {
  const {
    game,
    mapCfg,
    halfSize,
    highDetail,
    plan,
    darkSteelMat,
    gunmetalFrameMat,
    brushedChromeMat,
    pushArchMesh,
    pushArchBox,
    pushArchFrustum,
    addDecorBox,
    addDecorCyl,
    addSteelHColumn,
    buildSculptedStairStep
  } = ctx;
  const mats = createNukeMaterials(game, plan, highDetail);
  const clearance = createSpawnClearanceChecker(mapCfg);

  /** Renders bold alternating yellow-black industrial hazard stripes along a horizontal band. */
  const addHazardStripeBand = (cx, cy, cz, span, bandH, thick, alongX) => {
    const segLen = highDetail ? 0.55 : 0.95;
    const segCount = Math.max(2, Math.floor(span / segLen));
    const step = span / segCount;
    for (let s = 0; s < segCount; s++) {
      const off = -span * 0.5 + (s + 0.5) * step;
      const mat = s % 2 === 0 ? mats.hazardYellowMat : mats.hazardBlackMat;
      if (alongX) addDecorBox(cx + off, cy, cz, step * 0.98, bandH, thick, mat, false);
      else addDecorBox(cx, cy, cz + off, thick, bandH, step * 0.98, mat, false);
    }
  };

  const buildWall = (obs, mainMat) => {
    const { x: cx, y: cy, z: cz, w: cw, h: ch, d: cd } = obs;
    const halfW = cw * 0.5;
    const halfH = ch * 0.5;
    const halfD = cd * 0.5;
    const topY = cy + halfH;
    const botY = cy - halfH;
    const isPerimeter = Math.max(cw, cd) > 80 || Math.max(cw, cd) >= halfSize * 1.8;

    if (isPerimeter) {
      const alongX = cw > cd;
      const upperH = highDetail ? 4.4 : 3.2;
      const upperY = topY + upperH * 0.5;
      const inward = alongX ? (cz > 0 ? -1 : 1) : cx > 0 ? -1 : 1;
      const plinthH = 1.35;

      // Heavy concrete factory lower blast wall + galvanized corrugated steel cladding upper bays
      pushArchBox(mainMat, 'wall', cx, cy, cz, cw, ch, cd);
      pushArchBox(mats.galvanizedCladdingMat, 'container', cx, upperY, cz, cw, upperH, cd);

      if (alongX) {
        pushArchBox(mats.concreteWallMat, 'wall', cx, plinthH * 0.5, cz + inward * 0.56, cw - 1.4, plinthH, 0.16);
        addHazardStripeBand(cx, plinthH + 0.12, cz + inward * 0.62, Math.min(cw - 4, 48), 0.22, 0.08, true);
        addDecorBox(cx, topY, cz + inward * 0.58, cw - 1.0, 0.26, 0.24, mats.reactorAccentBlueMat, true);
        addDecorBox(cx, topY + upperH - 0.16, cz, cw + 0.26, 0.34, cd + 0.38, darkSteelMat, true);
      } else {
        pushArchBox(mats.concreteWallMat, 'wall', cx + inward * 0.56, plinthH * 0.5, cz, 0.16, plinthH, cd - 1.4);
        addHazardStripeBand(cx + inward * 0.62, plinthH + 0.12, cz, Math.min(cd - 4, 48), 0.22, 0.08, false);
        addDecorBox(cx + inward * 0.58, topY, cz, 0.24, 0.26, cd - 1.0, mats.reactorAccentBlueMat, true);
        addDecorBox(cx, topY + upperH - 0.16, cz, cw + 0.38, 0.34, cd + 0.26, darkSteelMat, true);
      }

      const wallSpan = alongX ? cw : cd;
      const colStep = highDetail ? 9.5 : 19.0;
      for (let off = -wallSpan * 0.5 + 6; off <= wallSpan * 0.5 - 6; off += colStep) {
        if (alongX) {
          addSteelHColumn(cx + off, (topY + upperH) * 0.5, cz + inward * 0.58, 0.62, topY + upperH, 0.66, true);
        } else {
          addSteelHColumn(cx + inward * 0.58, (topY + upperH) * 0.5, cz + off, 0.66, topY + upperH, 0.62, false);
        }
      }
      return;
    }

    const alongX = cw >= cd;
    // Heaven Catwalk yellow-black gunshield walls (`botY >= 2.0`)
    if (botY >= 2.0) {
      pushArchBox(mats.steelDadoMat, 'dado', cx, cy, cz, cw, ch, cd);
      addDecorBox(cx, topY - 0.06, cz, cw + 0.08, 0.12, cd + 0.08, darkSteelMat, true);
      addHazardStripeBand(cx, botY + 0.18, cz + (alongX ? 0 : 0), alongX ? cw : cd, 0.16, (alongX ? cd : cw) + 0.05, alongX);
      return;
    }

    // Interior Factory Blast Walls & Main Garage Walls
    const plinthH = Math.min(1.05, ch * 0.34);
    const copingH = 0.16;
    const upperH = Math.max(0.3, ch - plinthH - copingH);

    pushArchBox(mats.concreteWallMat, 'wall', cx, botY + plinthH * 0.5, cz, cw + (alongX ? 0.02 : 0.10), plinthH, cd + (alongX ? 0.10 : 0.02));
    pushArchBox(mainMat, 'wall', cx, botY + plinthH + upperH * 0.5, cz, cw, upperH, cd);
    pushArchFrustum(darkSteelMat, 'platform', cx, topY - copingH * 0.5, cz, cw + 0.12, copingH, cd + 0.12, cw + 0.02, cd + 0.02);

    const wallSpan = alongX ? cw : cd;
    addHazardStripeBand(cx, botY + plinthH + 0.10, cz, Math.max(1.2, wallSpan - 0.35), 0.18, (alongX ? cd : cw) + 0.08, alongX);

    // Steel H-column armor at ends of tall industrial walls
    if (ch >= 2.6 && wallSpan >= 3.0) {
      for (const endS of [-1, 1]) {
        if (alongX) addSteelHColumn(cx + endS * (halfW - 0.16), cy, cz, 0.32, ch - 0.04, cd + 0.16, true);
        else addSteelHColumn(cx, cy, cz + endS * (halfD - 0.16), cw + 0.16, ch - 0.04, 0.32, false);
      }
      if (highDetail) {
        // Horizontal steel accent rib matching CS2 Nuke factory walls
        addDecorBox(cx, topY - 0.45, cz, cw + (alongX ? 0.04 : 0.14), 0.16, cd + (alongX ? 0.14 : 0.04), mats.reactorAccentBlueMat, false);
      }
    }
  };

  const buildPillar = (obs) => {
    const { x: cx, y: cy, z: cz, w: cw, h: ch, d: cd } = obs;
    const topY = cy + ch * 0.5;
    const botY = cy - ch * 0.5;
    const radius = Math.min(cw, cd) * 0.48;
    const segs = highDetail ? 20 : 12;

    // Iconic CS2 Nuke A-Site Twin Cylindrical Reactor Silos (`(10.5, 2.3, ±6.5, 4.4, 4.6, 4.4)`)
    // Heavy circular concrete blast plinth
    const plinthGeo = new THREE.CylinderGeometry(radius + 0.14, radius + 0.24, 0.58, segs);
    applyPlanarMetricUVs(plinthGeo, 2.4, [0, 0]);
    pushArchMesh(mats.concreteWallMat, plinthGeo, cx, botY + 0.29, cz, 0, 0, 0);

    // Bold yellow-black segmented hazard collar around base of reactor vessel
    const collarSegs = highDetail ? 12 : 6;
    for (let k = 0; k < collarSegs; k++) {
      const ang = (k / collarSegs) * Math.PI * 2;
      const hx = cx + Math.cos(ang) * (radius + 0.06);
      const hz = cz + Math.sin(ang) * (radius + 0.06);
      addDecorBox(hx, botY + 0.72, hz, 0.14, 0.26, ((Math.PI * 2 * radius) / collarSegs) * 0.92, k % 2 === 0 ? mats.hazardYellowMat : mats.hazardBlackMat, false, 0, -ang, 0);
    }

    // Main galvanized steel cylindrical nuclear reactor containment vessel
    const vesselH = Math.max(1.2, ch - 0.62);
    const vesselGeo = new THREE.CylinderGeometry(radius - 0.04, radius, vesselH, segs);
    applyPlanarMetricUVs(vesselGeo, 2.4, [0, 0]);
    pushArchMesh(mats.reactorSteelMat, vesselGeo, cx, botY + 0.58 + vesselH * 0.5, cz, 0, 0, 0);

    // Horizontal bolted steel stiffening flange rings + industrial blue pressure band
    for (const rFrac of [0.34, 0.66, 0.92]) {
      addDecorCyl(cx, botY + ch * rFrac, cz, radius + 0.07, 0.14, darkSteelMat, 'y', true);
    }
    addDecorCyl(cx, botY + ch * 0.52, cz, radius + 0.02, 0.42, mats.reactorAccentBlueMat, 'y', false);

    // Upper circular catwalk collar & vertical steam conduits
    addDecorCyl(cx, topY - 0.14, cz, radius + 0.28, 0.16, gunmetalFrameMat, 'y', true);
    const pipeCount = highDetail ? 4 : 2;
    for (let p = 0; p < pipeCount; p++) {
      const ang = (p / pipeCount) * Math.PI * 2 + Math.PI * 0.25;
      const px = cx + Math.cos(ang) * (radius + 0.12);
      const pz = cz + Math.sin(ang) * (radius + 0.12);
      addDecorCyl(px, cy, pz, 0.11, ch - 0.4, brushedChromeMat, 'y', true);
      if (highDetail) {
        // Catwalk collar safety handrail stanchions around top perimeter
        const rx = cx + Math.cos(ang) * (radius + 0.24);
        const rz = cz + Math.sin(ang) * (radius + 0.24);
        addDecorCyl(rx, topY + 0.42, rz, 0.035, 0.88, mats.steelHandrailMat, 'y', false);
      }
    }

    // Domed reactor pressure cap & top cylindrical exhaust vent stack
    const domeGeo = new THREE.CylinderGeometry(radius * 0.58, radius * 0.96, 0.68, segs);
    applyPlanarMetricUVs(domeGeo, 2.2, [0, 0]);
    pushArchMesh(mats.galvanizedCladdingMat, domeGeo, cx, topY + 0.34, cz, 0, 0, 0);
    addDecorCyl(cx, topY + 1.05, cz, radius * 0.34, 0.85, darkSteelMat, 'y', true);
    addDecorCyl(cx, topY + 1.52, cz, radius * 0.40, 0.16, mats.hazardYellowMat, 'y', false);
  };

  const buildPlatform = (obs, mainMat) => {
    const { x: cx, y: cy, z: cz, w: cw, h: ch, d: cd } = obs;
    const halfW = cw * 0.5;
    const halfD = cd * 0.5;
    const topY = cy + ch * 0.5;
    const botY = cy - ch * 0.5;

    // Walkable checker-plate industrial steel deck slab
    const deckThick = 0.22;
    pushArchBox(mainMat, 'platform', cx, topY - deckThick * 0.5, cz, cw, deckThick, cd);

    // Perimeter steel C-channel truss girders (trimmed at corners) + bold yellow-black industrial hazard kickplate
    const girderH = 0.34;
    const girderY = topY - girderH * 0.5 - 0.01;
    addDecorBox(cx, girderY, cz - halfD, cw + 0.14, girderH, 0.20, darkSteelMat, true);
    addDecorBox(cx, girderY, cz + halfD, cw + 0.14, girderH, 0.20, darkSteelMat, true);
    addDecorBox(cx - halfW, girderY, cz, 0.20, girderH, Math.max(0.2, cd - 0.20), darkSteelMat, true);
    addDecorBox(cx + halfW, girderY, cz, 0.20, girderH, Math.max(0.2, cd - 0.20), darkSteelMat, true);

    addHazardStripeBand(cx, topY - 0.05, cz - halfD - 0.08, cw, 0.10, 0.05, true);
    addHazardStripeBand(cx, topY - 0.05, cz + halfD + 0.08, cw, 0.10, 0.05, true);
    addHazardStripeBand(cx - halfW - 0.08, topY - 0.05, cz, cd, 0.10, 0.05, false);
    addHazardStripeBand(cx + halfW + 0.08, topY - 0.05, cz, cd, 0.10, 0.05, false);

    // Under-deck steel truss beams, H-columns & diagonal X-bracing (Heaven Catwalk & Silo/Hut/Secret decks)
    const colClearH = Math.max(0.2, ch - deckThick);
    const nx = Math.max(2, Math.round(cw / 5.5) + 1);
    const nz = Math.max(2, Math.round(cd / 5.5) + 1);
    const xCoords = [];
    const zCoords = [];
    for (let ix = 0; ix < nx; ix++) xCoords.push(cx - (halfW - 0.38) + (ix / (nx - 1)) * (cw - 0.76));
    for (let iz = 0; iz < nz; iz++) zCoords.push(cz - (halfD - 0.38) + (iz / (nz - 1)) * (cd - 0.76));

    const joistY = topY - deckThick - 0.14;
    for (let ix = 0; ix < xCoords.length; ix++) addDecorBox(xCoords[ix], joistY, cz, 0.18, 0.26, cd - 0.32, gunmetalFrameMat, false);
    for (let iz = 0; iz < zCoords.length; iz++) addDecorBox(cx, joistY, zCoords[iz], cw - 0.32, 0.26, 0.18, gunmetalFrameMat, false);

    for (let ix = 0; ix < xCoords.length; ix++) {
      for (let iz = 0; iz < zCoords.length; iz++) {
        const isEdge = ix === 0 || ix === xCoords.length - 1 || iz === 0 || iz === zCoords.length - 1;
        if (!isEdge && !highDetail) continue;
        addDecorBox(xCoords[ix], botY + 0.09, zCoords[iz], 0.72, 0.18, 0.72, mats.concreteWallMat, false);
        addSteelHColumn(xCoords[ix], botY + 0.18 + (colClearH - 0.18) * 0.5, zCoords[iz], 0.38, colClearH - 0.18, 0.38, ix % 2 === 0);
      }
    }

    if (highDetail && colClearH >= 1.2 && zCoords.length >= 2) {
      const bayD = zCoords[1] - zCoords[0];
      const colH = colClearH - 0.24;
      const braceLen = Math.hypot(bayD, colH) * 0.92;
      const braceAng = Math.atan2(colH, bayD);
      const colCy = botY + 0.18 + colH * 0.5;
      for (const xEdge of [xCoords[0], xCoords[xCoords.length - 1]]) {
        const bz = (zCoords[0] + zCoords[1]) * 0.5;
        addDecorBox(xEdge, colCy, bz, 0.08, 0.08, braceLen, gunmetalFrameMat, false, braceAng, 0, 0);
        addDecorBox(xEdge, colCy, bz, 0.08, 0.08, braceLen, gunmetalFrameMat, false, -braceAng, 0, 0);
      }
    }

    // Yellow-steel industrial handrails along open edges (automatically clear of stairs & gunshield walls!)
    const inset = 0.14;
    const edges = [
      { key: 'north', x0: cx - halfW + inset, z0: cz - halfD + inset, x1: cx + halfW - inset, z1: cz - halfD + inset },
      { key: 'south', x0: cx - halfW + inset, z0: cz + halfD - inset, x1: cx + halfW - inset, z1: cz + halfD - inset },
      { key: 'west', x0: cx - halfW + inset, z0: cz - halfD + inset, x1: cx - halfW + inset, z1: cz + halfD - inset },
      { key: 'east', x0: cx + halfW - inset, z0: cz - halfD + inset, x1: cx + halfW - inset, z1: cz + halfD - inset }
    ];
    for (let e = 0; e < edges.length; e++) {
      const ed = edges[e];
      if (!clearance.hasAdjacentStairOrBlocker(obs, ed.key)) {
        addPlatformEdgeRailing(ctx, {
          ...ed,
          deckY: topY,
          height: 0.95,
          postMat: darkSteelMat,
          railMat: mats.steelHandrailMat,
          midRail: highDetail
        });
      }
    }
  };

  const buildCrate = (obs, mainMat) => {
    const { x: cx, y: cy, z: cz, w: cw, h: ch, d: cd } = obs;
    const topY = cy + ch * 0.5;
    const botY = cy - ch * 0.5;
    pushArchBox(mainMat, 'crate', cx, cy, cz, cw - 0.06, ch - 0.06, cd - 0.06);
    addDecorBox(cx, topY - 0.05, cz, cw + 0.02, 0.10, cd + 0.02, darkSteelMat, true);
    addDecorBox(cx, botY + 0.05, cz, cw + 0.02, 0.10, cd + 0.02, darkSteelMat, true);
    addCrateIronCornerLBrackets(ctx, cx, botY, topY, cz, cw, cd, highDetail, mats.hazardYellowMat);
  };

  const buildStep = (obs, mainMat) => {
    buildSculptedStairStep(obs, mainMat);
  };

  const buildAccents = () => {
    // 1. Overhead Industrial Steel Portal Lintel spanning Main Garage opening (`x = -5.5, z = 0`, 5.4m gap, headroom >= 3.31m!)
    pushArchBox(mats.galvanizedCladdingMat, 'container', -5.5, 4.56, 0, 2.16, 1.38, 7.40);
    // Horizontal upper steel I-beam flange crown
    addDecorBox(-5.5, 5.33, 0, 2.38, 0.12, 7.62, darkSteelMat, true);
    addDecorBox(-5.5, 5.23, 0, 2.22, 0.10, 7.48, gunmetalFrameMat, false);
    addDecorBox(-5.5, 5.14, 0, 2.34, 0.09, 7.56, darkSteelMat, true);
    // Main lower structural header I-beam spanning portal
    addDecorBox(-5.5, 3.92, 0, 2.38, 0.10, 7.62, darkSteelMat, true);
    addDecorBox(-5.5, 3.82, 0, 2.24, 0.14, 7.50, gunmetalFrameMat, false);
    addDecorBox(-5.5, 3.72, 0, 2.38, 0.10, 7.62, darkSteelMat, true);
    // Hazard-stripe header trim on both West and East portal beam faces
    addHazardStripeBand(-6.715, 3.82, 0, 5.4, 0.18, 0.045, false);
    addHazardStripeBand(-4.285, 3.82, 0, 5.4, 0.18, 0.045, false);

    // Bolted vertical steel jamb flanges & side guide tracks anchoring cleanly into North/South garage walls (`z = ±2.70`)
    for (const jz of [-2.70, 2.70]) {
      const sideSign = jz < 0 ? -1 : 1;
      addDecorBox(-5.5, 1.90, jz, 2.28, 3.80, 0.22, darkSteelMat, true);
      addDecorBox(-5.5, 1.82, jz - sideSign * 0.12, 0.26, 3.56, 0.10, gunmetalFrameMat, false);
      for (const fx of [-6.54, -4.46]) {
        const boltX = fx < -5.5 ? fx - 0.06 : fx + 0.06;
        addDecorBox(fx, 1.90, jz + sideSign * 0.26, 0.12, 3.72, 0.42, gunmetalFrameMat, true);
        for (const by of [0.55, 1.35, 2.15, 2.95, 3.58]) {
          addDecorBox(boltX, by, jz + sideSign * 0.28, 0.06, 0.07, 0.07, brushedChromeMat, false);
        }
      }
    }

    // Recessed ribbed roll-up door shutter hood box & partially raised corrugated slats underneath lintel
    addDecorBox(-5.5, 3.58, 0, 1.48, 0.22, 5.10, mats.reactorSteelMat, true);
    addDecorBox(-5.5, 3.58, -2.57, 1.52, 0.24, 0.06, darkSteelMat, false);
    addDecorBox(-5.5, 3.58, 2.57, 1.52, 0.24, 0.06, darkSteelMat, false);
    for (const sy of [3.45, 3.40, 3.35]) {
      addDecorBox(-5.5, sy, 0, 0.42, 0.034, 5.08, mats.galvanizedCladdingMat, true);
    }
    addDecorBox(-5.5, 3.31, 0, 0.50, 0.052, 5.12, darkSteelMat, true);

    // 2. Overhead Reactor Steam Pipe Bridge linking A-Site Twin Silos (`(10.5, y = 5.35, z = -6.5..6.5)`)
    addDecorCyl(10.5, 5.25, 0, 0.34, 13.0, mats.reactorSteelMat, 'z', true);
    addDecorCyl(10.5 - 0.72, 5.05, 0, 0.16, 12.6, brushedChromeMat, 'z', false);
    addDecorCyl(10.5 + 0.72, 5.05, 0, 0.16, 12.6, brushedChromeMat, 'z', false);
    for (const pz of [-2.4, 0, 2.4]) {
      addDecorBox(10.5, 5.15, pz, 1.85, 0.22, 0.22, darkSteelMat, false);
    }

    // 3. Heaven Catwalk Overhead Industrial Roof Truss Beams (`x = 26.5, z = -10..10, y = 6.3m`, headroom `>= 3.7m` above 2.4m Heaven deck!)
    for (const tz of [-9.0, -3.0, 3.0, 9.0]) {
      addDecorBox(26.5, 6.35, tz, 8.2, 0.34, 0.28, darkSteelMat, true);
    }
    addDecorBox(22.9, 6.35, 0, 0.32, 0.38, 22.0, gunmetalFrameMat, true);
    addDecorBox(30.1, 6.35, 0, 0.32, 0.38, 22.0, gunmetalFrameMat, true);

    // 4. 4 Outer Industrial Plant Corner Steel Watch-Structures seated outside playable corners
    // (`skyAtmosphere.js` owns the distant twin hyperbolic Cedar Creek cooling towers, stacks & turbine halls)
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const cx = sx * (halfSize + 1.5);
        const cz = sz * (halfSize + 1.5);
        addDecorBox(cx, 7.2, cz, 4.4, 14.4, 4.4, mats.galvanizedCladdingMat, false);
        addDecorBox(cx, 13.8, cz, 4.9, 0.72, 4.9, mats.reactorAccentBlueMat, false);
        addDecorBox(cx, 14.6, cz, 4.7, 0.36, 4.7, darkSteelMat, false);
      }
    }
  };

  return { buildWall, buildPlatform, buildPillar, buildCrate, buildStep, buildAccents };
}

// ============================================================================
// 4. FY_ICEWORLD — CRISP ARCTIC DAYLIGHT GLACIER MONOLITHS (`halfSize: 32`)
// ============================================================================

function createIceworldMaterials(game, plan, highDetail) {
  const frostDadoMat = makePlanMaterial(game, plan, 'fy_iceworld', 0xd2e4f2, 'dado', 0.84, 0.06, highDetail, 'dado');

  const snowCapMat = new THREE.MeshStandardMaterial({ color: 0xeff5fa, roughness: 0.90, metalness: 0.02 });
  const glacierReliefMat = new THREE.MeshStandardMaterial({
    map: typeof document !== 'undefined' ? createObstacleTexture(game, 0xd8e8f4, 'wall') : null,
    roughness: 0.78,
    metalness: 0.04
  });
  attachWorldMacroGrime(glacierReliefMat, { mapId: 'fy_iceworld', role: 'wall', enabled: highDetail });
  registerPbrSlot(game, glacierReliefMat, plan.wall || { set: 'concrete_block_wall', tile: 2.4 }, 0xd8e8f4);

  const alpineTimberMat = new THREE.MeshStandardMaterial({ color: 0x6d523c, roughness: 0.86, metalness: 0.03 });
  const alpineSteelMat = new THREE.MeshStandardMaterial({ color: 0x5b6c7c, roughness: 0.62, metalness: 0.34 });
  const alpineRailSteelMat = new THREE.MeshStandardMaterial({ color: 0x546676, roughness: 0.56, metalness: 0.38 });
  const alpineBracketMat = new THREE.MeshStandardMaterial({ color: 0x4b5c6c, roughness: 0.58, metalness: 0.42 });
  const alpineStepTrimMat = new THREE.MeshStandardMaterial({ color: 0x566878, roughness: 0.52, metalness: 0.40 });

  for (const m of [
    snowCapMat,
    glacierReliefMat,
    alpineTimberMat,
    alpineSteelMat,
    alpineRailSteelMat,
    alpineBracketMat,
    alpineStepTrimMat
  ]) {
    game.arenaMaterials.add(m);
  }

  return {
    frostDadoMat,
    snowCapMat,
    glacierReliefMat,
    alpineTimberMat,
    alpineSteelMat,
    alpineRailSteelMat,
    alpineBracketMat,
    alpineStepTrimMat
  };
}

function buildIceworldArchitecture(ctx) {
  const { game, mapCfg, halfSize, highDetail, plan, pushArchMesh, pushArchBox, pushArchFrustum, addDecorBox, addDecorCyl } = ctx;
  const mats = createIceworldMaterials(game, plan, highDetail);
  const clearance = createSpawnClearanceChecker(mapCfg);

  const buildWall = (obs, mainMat) => {
    const { x: cx, y: cy, z: cz, w: cw, h: ch, d: cd } = obs;
    const halfH = ch * 0.5;
    const topY = cy + halfH;
    const botY = cy - halfH;
    const isPerimeter = Math.max(cw, cd) > 80 || Math.max(cw, cd) >= halfSize * 1.8;

    if (isPerimeter) {
      const alongX = cw > cd;
      const upperH = highDetail ? 3.2 : 2.2;
      const upperY = topY + upperH * 0.5;
      const inward = alongX ? (cz > 0 ? -1 : 1) : cx > 0 ? -1 : 1;

      pushArchBox(mainMat, 'wall', cx, cy, cz, cw, ch, cd);
      pushArchBox(mats.frostDadoMat, 'dado', cx, upperY, cz, cw, upperH, cd);
      // Chamfered white snow cornice cap crowning perimeter wall
      pushArchFrustum(mats.snowCapMat, 'platform', cx, topY + upperH + 0.22, cz, cw + 0.34, 0.44, cd + 0.34, cw - 0.10, cd - 0.10);

      const wallSpan = alongX ? cw : cd;
      const step = highDetail ? 8.0 : 16.0;
      for (let off = -wallSpan * 0.5 + 6; off <= wallSpan * 0.5 - 6; off += step) {
        if (alongX) {
          addDecorBox(cx + off, (topY + upperH) * 0.5, cz + inward * 0.56, 0.52, topY + upperH, 0.46, mats.alpineSteelMat, true);
        } else {
          addDecorBox(cx + inward * 0.56, (topY + upperH) * 0.5, cz + off, 0.46, topY + upperH, 0.52, mats.alpineSteelMat, true);
        }
      }
      return;
    }

    // 4 Iconic Chamfered Snow-Capped Glacier-Concrete Monoliths (`8x4.4x8m` at `(±9, 2.2, ±9)`)
    if (cw >= 5.0 && cd >= 5.0 && ch >= 3.5) {
      const plinthH = 0.52;
      const snowCapH = 0.40;
      const coreH = Math.max(1.0, ch - plinthH - snowCapH);

      // Toned frosted glacier-concrete base plinth
      pushArchFrustum(mats.frostDadoMat, 'dado', cx, botY + plinthH * 0.5, cz, cw + 0.20, plinthH, cd + 0.20, cw + 0.02, cd + 0.02);
      // Unified weathered glacier-concrete monolith shaft (zero harsh horizontal stripes)
      pushArchBox(mainMat, 'wall', cx, botY + plinthH + coreH * 0.5, cz, cw, coreH, cd);
      // Subtle pale ice-stone relief cornice seam closely harmonized with wall albedo (`0xc4d6e4`)
      pushArchFrustum(mats.glacierReliefMat, 'wall', cx, topY - snowCapH - 0.07, cz, cw + 0.03, 0.14, cd + 0.03, cw + 0.10, cd + 0.10);
      // Soft two-tier beveled snowdrift cap crowning monolith
      pushArchFrustum(mats.snowCapMat, 'platform', cx, topY - snowCapH * 0.5 + 0.04, cz, cw + 0.22, snowCapH + 0.08, cd + 0.22, cw - 0.96, cd - 0.96);
      pushArchFrustum(mats.snowCapMat, 'platform', cx, topY + 0.11, cz, cw - 0.92, 0.14, cd - 0.92, cw - 2.4, cd - 2.4);

      // Matte muted slate-steel (`0x5b6c7c`) corner tie brackets at plinth & cornice shoulders
      for (const sx of [-1, 1]) {
        for (const sz of [-1, 1]) {
          addDecorBox(cx + sx * (cw * 0.5 - 0.06), botY + plinthH + 0.18, cz + sz * (cd * 0.5 - 0.06), 0.22, 0.34, 0.22, mats.alpineSteelMat, true);
          addDecorBox(cx + sx * (cw * 0.5 - 0.06), topY - snowCapH - 0.24, cz + sz * (cd * 0.5 - 0.06), 0.22, 0.30, 0.22, mats.alpineSteelMat, true);
        }
      }
      // Soft beveled base snowdrifts banked cleanly against plinth sides (highDetail)
      if (highDetail) {
        for (const sx of [-1, 1]) {
          pushArchFrustum(mats.snowCapMat, 'platform', cx + sx * (cw * 0.5 + 0.16), botY + 0.13, cz, 0.42, 0.26, cd - 0.55, 0.06, cd - 1.15);
        }
        for (const sz of [-1, 1]) {
          pushArchFrustum(mats.snowCapMat, 'platform', cx, botY + 0.13, cz + sz * (cd * 0.5 + 0.16), cw - 0.55, 0.26, 0.42, cw - 1.15, 0.06);
        }
      }
      return;
    }

    // Thin wallbangable frost dividers (`0.65m` thick)
    const capH = 0.20;
    pushArchBox(mats.frostDadoMat, 'dado', cx, botY + 0.24, cz, cw + 0.08, 0.48, cd + 0.08);
    pushArchBox(mainMat, 'wall', cx, botY + 0.48 + Math.max(0.2, ch - 0.48 - capH) * 0.5, cz, cw, Math.max(0.2, ch - 0.48 - capH), cd);
    pushArchFrustum(mats.snowCapMat, 'platform', cx, topY - capH * 0.5 + 0.04, cz, cw + 0.14, capH + 0.08, cd + 0.14, cw * 0.86, cd * 0.86);
    const alongX = cw >= cd;
    for (const s of [-1, 1]) {
      if (alongX) addDecorBox(cx + s * (cw * 0.5 - 0.04), cy, cz, 0.10, ch - 0.08, cd + 0.06, mats.alpineBracketMat, true);
      else addDecorBox(cx, cy, cz + s * (cd * 0.5 - 0.04), cw + 0.06, ch - 0.08, 0.10, mats.alpineBracketMat, true);
    }
  };

  const buildPillar = (obs, mainMat) => {
    // Frosted Central Obelisk (`(0, 1.8, 0, 2.2, 3.6, 2.2)` — zero spinning radar dishes!)
    const { x: cx, y: cy, z: cz, w: cw, h: ch, d: cd } = obs;
    const topY = cy + ch * 0.5;
    const botY = cy - ch * 0.5;

    pushArchFrustum(mats.frostDadoMat, 'dado', cx, botY + 0.32, cz, cw + 0.36, 0.64, cd + 0.36, cw + 0.08, cd + 0.08);
    pushArchBox(mainMat, 'pillar', cx, botY + 0.64 + Math.max(0.4, ch - 0.98) * 0.5, cz, cw - 0.06, Math.max(0.4, ch - 0.98), cd - 0.06);
    pushArchFrustum(mats.glacierReliefMat, 'pillar', cx, topY - 0.17, cz, cw + 0.06, 0.34, cd + 0.06, cw + 0.24, cd + 0.24);
    // Chamfered white snow obelisk pyramidion crown
    pushArchFrustum(mats.snowCapMat, 'platform', cx, topY + 0.36, cz, cw * 0.96, 0.72, cd * 0.96, cw * 0.22, cd * 0.22);

    addDecorBox(cx, cy + ch * 0.16, cz, cw + 0.10, 0.16, cd + 0.10, mats.alpineSteelMat, true);
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        addDecorBox(cx + sx * (cw * 0.5 - 0.06), cy, cz + sz * (cd * 0.5 - 0.06), 0.16, ch - 0.3, 0.16, mats.alpineSteelMat, true);
      }
    }
  };

  const buildPlatform = (obs, mainMat) => {
    const { x: cx, y: cy, z: cz, w: cw, h: ch, d: cd } = obs;
    const halfW = cw * 0.5;
    const halfD = cd * 0.5;
    const topY = cy + ch * 0.5;
    const botY = cy - ch * 0.5;

    const deckThick = 0.26;
    const bodyH = Math.max(0.3, ch - deckThick);
    pushArchBox(mats.frostDadoMat, 'dado', cx, botY + bodyH * 0.5, cz, cw - 0.12, bodyH, cd - 0.12);
    pushArchBox(mainMat, 'platform', cx, topY - deckThick * 0.5, cz, cw, deckThick, cd);

    // Crisp white snow cornice rim along elevated deck perimeter (trimmed at corners)
    addDecorBox(cx, topY - 0.08, cz - halfD, cw + 0.16, 0.18, 0.16, mats.snowCapMat, true);
    addDecorBox(cx, topY - 0.08, cz + halfD, cw + 0.16, 0.18, 0.16, mats.snowCapMat, true);
    addDecorBox(cx - halfW, topY - 0.08, cz, 0.16, 0.18, Math.max(0.2, cd - 0.16), mats.snowCapMat, true);
    addDecorBox(cx + halfW, topY - 0.08, cz, 0.16, 0.18, Math.max(0.2, cd - 0.16), mats.snowCapMat, true);

    // Alpine timber & steel deck railings along open faces (keeping BOTH stair ends open!)
    const inset = 0.16;
    const edges = [
      { key: 'north', x0: cx - halfW + inset, z0: cz - halfD + inset, x1: cx + halfW - inset, z1: cz - halfD + inset },
      { key: 'south', x0: cx - halfW + inset, z0: cz + halfD - inset, x1: cx + halfW - inset, z1: cz + halfD - inset },
      { key: 'west', x0: cx - halfW + inset, z0: cz - halfD + inset, x1: cx - halfW + inset, z1: cz + halfD - inset },
      { key: 'east', x0: cx + halfW - inset, z0: cz - halfD + inset, x1: cx + halfW - inset, z1: cz + halfD - inset }
    ];
    for (let e = 0; e < edges.length; e++) {
      const ed = edges[e];
      if (!clearance.hasAdjacentStairOrBlocker(obs, ed.key)) {
        addPlatformEdgeRailing(ctx, {
          ...ed,
          deckY: topY,
          height: 0.90,
          postMat: mats.alpineRailSteelMat,
          railMat: mats.alpineTimberMat,
          midRail: highDetail
        });
      }
    }
  };

  const buildCrate = (obs, mainMat) => {
    const { x: cx, y: cy, z: cz, w: cw, h: ch, d: cd } = obs;
    const topY = cy + ch * 0.5;
    const botY = cy - ch * 0.5;
    pushArchBox(mainMat, 'crate', cx, cy - 0.03, cz, cw - 0.06, ch - 0.08, cd - 0.06);
    pushArchFrustum(mats.snowCapMat, 'platform', cx, topY - 0.03, cz, cw + 0.06, 0.10, cd + 0.06, cw - 0.12, cd - 0.12);
    addCrateIronCornerLBrackets(ctx, cx, botY, topY - 0.06, cz, cw, cd, highDetail, mats.alpineBracketMat);
  };

  const buildStep = (obs, mainMat) => {
    const { x: cx, y: cy, z: cz, w: cw, h: ch, d: cd } = obs;
    const topY = cy + ch * 0.5;
    const treadH = Math.min(0.12, ch * 0.45);
    pushArchBox(mats.frostDadoMat, 'dado', cx, cy - treadH * 0.5, cz, cw - 0.04, Math.max(0.05, ch - treadH), cd - 0.04);
    pushArchBox(mainMat, 'step', cx, topY - treadH * 0.5, cz, cw, treadH, cd);
    addDecorBox(cx, topY - 0.02, cz, cw + 0.04, 0.04, cd + 0.04, mats.alpineStepTrimMat, false);
  };

  const buildAccents = () => {
    // Snow-capped perimeter corner glacier buttresses & close-in snow drifts
    // (`skyAtmosphere.js` owns the distant alpine mountain peaks & spruce forest ring)
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const bx = sx * (halfSize + 1.4);
        const bz = sz * (halfSize + 1.4);
        pushArchBox(mats.frostDadoMat, 'dado', bx, 5.4, bz, 4.2, 10.8, 4.2);
        pushArchFrustum(mats.snowCapMat, 'platform', bx, 11.15, bz, 4.6, 0.72, 4.6, 3.4, 3.4);
        if (highDetail) {
          // Subtle corner snowbank tucked right against perimeter wall corner (clear of ±27 corner spawns)
          const dx = sx * (halfSize - 1.15);
          const dz = sz * (halfSize - 1.15);
          pushArchFrustum(mats.snowCapMat, 'platform', dx, 0.14, dz, 2.2, 0.28, 2.2, 0.4, 0.4);
        }
      }
    }
  };

  return { buildWall, buildPlatform, buildPillar, buildCrate, buildStep, buildAccents };
}

// ============================================================================
// 5. AIM_MAP — CS2 DAYLIGHT RIFLE TRAINING YARD (`halfSize: 30`)
// ============================================================================

function createAimMapMaterials(game, plan, highDetail) {
  const redBrickMat = makePlanMaterial(game, plan, 'aim_map', 0xc8a48c, 'wall', 0.88, 0.03, highDetail, 'wall');
  const concreteDadoMat = makePlanMaterial(game, plan, 'aim_map', 0xd8d6d0, 'dado', 0.90, 0.03, highDetail, 'dado');

  const concreteCapTex = createWeatheredConcreteCapTexture(game, 0xa8a49c);
  const limestoneCopingMat = new THREE.MeshStandardMaterial({
    map: concreteCapTex,
    color: concreteCapTex ? 0xffffff : 0xa8a49c,
    roughness: 0.91,
    metalness: 0.02
  });
  const rangeSteelMat = new THREE.MeshStandardMaterial({ color: 0x2c343e, roughness: 0.44, metalness: 0.64 });
  const crateIronBracketMat = new THREE.MeshStandardMaterial({ color: 0x282420, roughness: 0.58, metalness: 0.56 });
  const cedarBeamMat = new THREE.MeshStandardMaterial({ color: 0x5c4028, roughness: 0.86, metalness: 0.03 });
  const rangeRedlineMat = new THREE.MeshStandardMaterial({ color: 0xa8322a, roughness: 0.62, metalness: 0.08 });
  const warehouseConcreteMat = new THREE.MeshStandardMaterial({ color: 0x9a9ea4, roughness: 0.88, metalness: 0.04 });

  for (const m of [
    limestoneCopingMat,
    rangeSteelMat,
    crateIronBracketMat,
    cedarBeamMat,
    rangeRedlineMat,
    warehouseConcreteMat
  ]) {
    game.arenaMaterials.add(m);
  }

  return {
    redBrickMat,
    concreteDadoMat,
    limestoneCopingMat,
    rangeSteelMat,
    crateIronBracketMat,
    cedarBeamMat,
    rangeRedlineMat,
    warehouseConcreteMat
  };
}

function buildAimMapArchitecture(ctx) {
  const { game, mapCfg, halfSize, highDetail, plan, gunmetalFrameMat, pushArchBox, pushArchFrustum, addDecorBox, addSteelHColumn, buildSculptedStairStep } = ctx;
  const mats = createAimMapMaterials(game, plan, highDetail);
  const crateCtx = { ...ctx, dustMats: mats };
  const clearance = createSpawnClearanceChecker(mapCfg);

  const buildWall = (obs, mainMat) => {
    const { x: cx, y: cy, z: cz, w: cw, h: ch, d: cd } = obs;
    const halfH = ch * 0.5;
    const topY = cy + halfH;
    const botY = cy - halfH;
    const isPerimeter = Math.max(cw, cd) > 80 || Math.max(cw, cd) >= halfSize * 1.8;

    if (isPerimeter) {
      const alongX = cw > cd;
      const upperH = highDetail ? 3.0 : 2.0;
      const upperY = topY + upperH * 0.5;
      const inward = alongX ? (cz > 0 ? -1 : 1) : cx > 0 ? -1 : 1;

      // Weathered concrete base + red-brick upper training yard perimeter wall + precast stone coping cap (flush-butted at corners)
      pushArchBox(mats.concreteDadoMat, 'dado', cx, cy, cz, cw, ch, cd);
      pushArchBox(mats.redBrickMat, 'wall', cx, upperY, cz, cw, upperH, cd);
      pushArchFrustum(
        mats.limestoneCopingMat,
        'pillar',
        cx,
        topY + upperH + 0.14,
        cz,
        alongX ? cw - 2.28 : cw + 0.28,
        0.28,
        alongX ? cd + 0.28 : cd,
        alongX ? cw - 2.28 : cw + 0.08,
        alongX ? cd + 0.08 : cd
      );

      // Subtle painted redline range stripe along inner perimeter (classic CS2 aim_redline accent)
      if (alongX) {
        addDecorBox(cx, 1.48, cz + inward * (cd * 0.5 + 0.025), cw - 1.6, 0.14, 0.04, mats.rangeRedlineMat, false);
      } else {
        addDecorBox(cx + inward * (cw * 0.5 + 0.025), 1.48, cz, 0.04, 0.14, cd - 1.6, mats.rangeRedlineMat, false);
      }

      const wallSpan = alongX ? cw : cd;
      const step = highDetail ? 7.5 : 15.0;
      for (let off = -wallSpan * 0.5 + 5; off <= wallSpan * 0.5 - 5; off += step) {
        if (alongX) {
          addSteelHColumn(cx + off, (topY + upperH) * 0.5, cz + inward * 0.55, 0.44, topY + upperH, 0.48, true);
        } else {
          addSteelHColumn(cx + inward * 0.55, (topY + upperH) * 0.5, cz + off, 0.48, topY + upperH, 0.44, false);
        }
      }
      return;
    }

    // Red-brick peek walls (`(±9.5, 1.7, ±11.5)`) and bridge screens (`(±3.2, 2.6, ±2.2)`)
    const plinthH = Math.min(0.42, ch * 0.22);
    const copingH = 0.16;
    const shaftH = Math.max(0.25, ch - plinthH - copingH);

    pushArchBox(mats.concreteDadoMat, 'dado', cx, botY + plinthH * 0.5, cz, cw + 0.08, plinthH, cd + 0.08);
    pushArchBox(mainMat, 'wall', cx, botY + plinthH + shaftH * 0.5, cz, cw, shaftH, cd);
    pushArchFrustum(mats.limestoneCopingMat, 'pillar', cx, topY - copingH * 0.5, cz, cw + 0.16, copingH, cd + 0.16, cw + 0.04, cd + 0.04);

    if (highDetail && ch >= 2.5) {
      const alongX = cw >= cd;
      for (const s of [-1, 1]) {
        if (alongX) addDecorBox(cx + s * (cw * 0.5 - 0.05), cy, cz, 0.12, ch - 0.18, cd + 0.06, mats.rangeSteelMat, true);
        else addDecorBox(cx, cy, cz + s * (cd * 0.5 - 0.05), cw + 0.06, ch - 0.18, 0.12, mats.rangeSteelMat, true);
      }
    }
  };

  const buildPillar = (obs, mainMat) => {
    const { x: cx, y: cy, z: cz, w: cw, h: ch, d: cd } = obs;
    const topY = cy + ch * 0.5;
    const botY = cy - ch * 0.5;
    pushArchFrustum(mats.concreteDadoMat, 'dado', cx, botY + 0.28, cz, cw + 0.28, 0.56, cd + 0.28, cw + 0.06, cd + 0.06);
    pushArchBox(mainMat, 'pillar', cx, botY + 0.56 + Math.max(0.4, ch - 0.84) * 0.5, cz, cw - 0.04, Math.max(0.4, ch - 0.84), cd - 0.04);
    pushArchFrustum(mats.limestoneCopingMat, 'pillar', cx, topY - 0.14, cz, cw + 0.18, 0.28, cd + 0.18, cw + 0.04, cd + 0.04);
    addDecorBox(cx, topY - 0.36, cz, cw + 0.06, 0.10, cd + 0.06, mats.rangeRedlineMat, false);
  };

  const buildPlatform = (obs, mainMat) => {
    // Central Duel Bridge `(0, 1.0, 0, 12, 2.0, 5.4)` & W/E AWP Decks `(±21.5, 1.0, 0, 5.2, 2.0, 10)`
    const { x: cx, y: cy, z: cz, w: cw, h: ch, d: cd } = obs;
    const halfW = cw * 0.5;
    const halfD = cd * 0.5;
    const topY = cy + ch * 0.5;
    const botY = cy - ch * 0.5;
    const deckThick = 0.26;
    const colH = Math.max(0.4, ch - deckThick);

    pushArchBox(mainMat, 'platform', cx, topY - deckThick * 0.5, cz, cw, deckThick, cd);
    // Steel bridge fascia girders (trimmed at corners)
    addDecorBox(cx, topY - 0.18, cz - halfD, cw + 0.12, 0.28, 0.16, mats.rangeSteelMat, true);
    addDecorBox(cx, topY - 0.18, cz + halfD, cw + 0.12, 0.28, 0.16, mats.rangeSteelMat, true);
    addDecorBox(cx - halfW, topY - 0.18, cz, 0.16, 0.28, Math.max(0.2, cd - 0.16), mats.rangeSteelMat, true);
    addDecorBox(cx + halfW, topY - 0.18, cz, 0.16, 0.28, Math.max(0.2, cd - 0.16), mats.rangeSteelMat, true);

    // Concrete/steel overpass support piers (leaves clean shadow under bridge!)
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const px = cx + sx * (halfW - 0.45);
        const pz = cz + sz * (halfD - 0.45);
        addSteelHColumn(px, botY + colH * 0.5, pz, 0.38, colH, 0.38, true);
        addDecorBox(px, botY + 0.10, pz, 0.68, 0.20, 0.68, mats.concreteDadoMat, false);
      }
    }

    // Industrial steel railing trim along central bridge & AWP decks (skipping stair ends & red-brick bridge screens!)
    const inset = 0.14;
    if (Math.abs(cx) < 1.0 && Math.abs(cz) < 1.0) {
      // Central Bridge has red-brick screens at (-3.2, -2.2) and (+3.2, +2.2); add steel railings along the opposite open half of each side!
      addPlatformEdgeRailing(ctx, { x0: 0.4, z0: cz - halfD + inset, x1: cx + halfW - inset, z1: cz - halfD + inset, deckY: topY, height: 0.90, postMat: mats.rangeSteelMat, railMat: gunmetalFrameMat, midRail: highDetail });
      addPlatformEdgeRailing(ctx, { x0: cx - halfW + inset, z0: cz + halfD - inset, x1: -0.4, z1: cz + halfD - inset, deckY: topY, height: 0.90, postMat: mats.rangeSteelMat, railMat: gunmetalFrameMat, midRail: highDetail });
    } else {
      const edges = [
        { key: 'north', x0: cx - halfW + inset, z0: cz - halfD + inset, x1: cx + halfW - inset, z1: cz - halfD + inset },
        { key: 'south', x0: cx - halfW + inset, z0: cz + halfD - inset, x1: cx + halfW - inset, z1: cz + halfD - inset },
        { key: 'west', x0: cx - halfW + inset, z0: cz - halfD + inset, x1: cx - halfW + inset, z1: cz + halfD - inset },
        { key: 'east', x0: cx + halfW - inset, z0: cz - halfD + inset, x1: cx + halfW - inset, z1: cz + halfD - inset }
      ];
      for (let e = 0; e < edges.length; e++) {
        const ed = edges[e];
        if (!clearance.hasAdjacentStairOrBlocker(obs, ed.key)) {
          addPlatformEdgeRailing(ctx, {
            ...ed,
            deckY: topY,
            height: 0.90,
            postMat: mats.rangeSteelMat,
            railMat: gunmetalFrameMat,
            midRail: highDetail
          });
        }
      }
    }
  };

  const buildCrate = (obs, mainMat) => {
    buildDustTimberCrate(crateCtx, obs, mainMat);
  };

  const buildStep = (obs, mainMat) => {
    buildSculptedStairStep(obs, mainMat);
  };

  const buildAccents = () => {
    // 4 Corner Steel Daylight Range Light Stanchions & Brick Corner Piers outside 30m perimeter
    // (`skyAtmosphere.js` owns distant training warehouses & rolling hills)
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const px = sx * (halfSize + 1.3);
        const pz = sz * (halfSize + 1.3);
        addDecorBox(px, 5.2, pz, 2.4, 10.4, 2.4, mats.warehouseConcreteMat, false);
        pushArchFrustum(mats.limestoneCopingMat, 'pillar', px, 10.6, pz, 2.76, 0.36, 2.76, 2.48, 2.48);
        if (highDetail) {
          addDecorBox(px, 12.2, pz, 0.36, 3.2, 0.36, mats.rangeSteelMat, false);
          addDecorBox(px - sx * 0.45, 13.6, pz - sz * 0.45, 1.6, 0.24, 0.36, gunmetalFrameMat, false);
        }
      }
    }
  };

  return { buildWall, buildPlatform, buildPillar, buildCrate, buildStep, buildAccents };
}

/**
 * Factory dispatching the active CS:GO map (`de_mirage`, `de_inferno`, `de_nuke`, `fy_iceworld`, `aim_map`)
 * to its bespoke CS2 architectural builder (`de_dust2` uses `dustArchitecture.js`).
 */
export function createCsgoMapBuilder(mapId, ctx) {
  switch (mapId) {
    case 'de_mirage':
      return buildMirageArchitecture(ctx);
    case 'de_inferno':
      return buildInfernoArchitecture(ctx);
    case 'de_nuke':
      return buildNukeArchitecture(ctx);
    case 'fy_iceworld':
      return buildIceworldArchitecture(ctx);
    case 'aim_map':
      return buildAimMapArchitecture(ctx);
    default:
      return null;
  }
}
