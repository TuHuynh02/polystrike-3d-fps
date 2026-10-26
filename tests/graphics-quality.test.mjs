// Graphics quality tiers, asset loader fallbacks, PBR/UV maths, arena budgets per tier and real static serving of the assets.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createTestGame3D, loadGame3D } from './helpers/headless-game3d.mjs';
import {
  COST_KNOBS,
  QUALITY,
  QUALITY_STORAGE_KEY,
  TIER_ORDER,
  detectTier,
  isPerfOverlayRequested,
  loadQualityChoice,
  presetUsesMap,
  resolveTier,
  saveQualityChoice
} from '../public/js/quality.js';
import { MAP_ORDER, getMapConfig } from '../shared/constants.js';

// Modules that import three.js must be loaded AFTER the headless helper registered its ESM resolve hook.
const { THREE } = await loadGame3D();
const { AssetManager, resetAssetWarnings, textureUrl } = await import('../public/js/assets.js');
const { fitBoxToAabb, fitContainUniform } = await import('../public/js/arenaProps.js');
const { SURFACE_PLANS, TEXTURE_SET_IDS, applyMetricBoxUV1, applyMetricPlaneUV1 } = await import(
  '../public/js/surfaceMaterials.js'
);
const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MAPS = Array.from(MAP_ORDER);

// ---------------------------------------------------------------- helpers
function obstacleHash(mapId) {
  const rows = getMapConfig(mapId).obstacles.map((o) => [o.x, o.y, o.z, o.w, o.h, o.d, o.type, o.color]);
  return crypto.createHash('sha256').update(JSON.stringify(rows)).digest('hex');
}

/** Draw-call proxy = visible Mesh/Points/InstancedMesh objects in the ARENA (camera subtree = viewmodels excluded). */
function sceneStats(game) {
  let drawCalls = 0;
  let triangles = 0;
  const walk = (obj) => {
    if (obj === game.camera || obj.visible === false) return;
    if (obj.isMesh || obj.isPoints) {
      drawCalls++;
      const geo = obj.geometry;
      const tris = geo.index ? geo.index.count / 3 : (geo.attributes.position?.count || 0) / 3;
      triangles += tris * (obj.isInstancedMesh ? obj.count : 1);
    }
    for (const c of obj.children) walk(c);
  };
  walk(game.scene);
  return { drawCalls, triangles: Math.round(triangles) };
}

function memStorage(initial = {}) {
  const data = { ...initial };
  return {
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => {
      data[k] = String(v);
    },
    data
  };
}

function parseGlbBounds(file) {
  const b = fs.readFileSync(file);
  const json = JSON.parse(b.slice(20, 20 + b.readUInt32LE(12)).toString());
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const n of json.nodes) {
    if (n.mesh == null) continue;
    const t = n.translation || [0, 0, 0];
    for (const p of json.meshes[n.mesh].primitives) {
      const a = json.accessors[p.attributes.POSITION];
      for (let i = 0; i < 3; i++) {
        min[i] = Math.min(min[i], a.min[i] + t[i]);
        max[i] = Math.max(max[i], a.max[i] + t[i]);
      }
    }
  }
  return { x: max[0] - min[0], y: max[1] - min[1], z: max[2] - min[2] };
}

function fakeCrateScene(x, y, z) {
  const root = new THREE.Group();
  root.add(new THREE.Mesh(new THREE.BoxGeometry(x, y, z), new THREE.MeshStandardMaterial()));
  return root;
}

// ---------------------------------------------------------------- presets
describe('quality presets', () => {
  it('has well-formed low / medium / high presets with identical keys', () => {
    assert.deepEqual(TIER_ORDER, ['low', 'medium', 'high']);
    const keys = Object.keys(QUALITY.low).sort();
    for (const tier of TIER_ORDER) {
      assert.deepEqual(Object.keys(QUALITY[tier]).sort(), keys, `${tier} keys`);
      assert.equal(QUALITY[tier].id, tier);
      assert.ok(QUALITY[tier].label.length > 0);
      assert.ok(['basic', 'pcf', 'pcfsoft'].includes(QUALITY[tier].shadowType));
      assert.ok(QUALITY[tier].minPixelRatio <= QUALITY[tier].maxPixelRatio);
      assert.ok(QUALITY[tier].minPixelRatio > 0);
    }
    assert.deepEqual(TIER_ORDER.map((t) => QUALITY[t].label), ['Thấp', 'Vừa', 'Cao']);
  });

  it('every cost knob is monotonic non-decreasing from low to high', () => {
    assert.ok(COST_KNOBS.length >= 12);
    for (const knob of COST_KNOBS) {
      assert.ok(QUALITY.low[knob] <= QUALITY.medium[knob], `${knob} low<=medium`);
      assert.ok(QUALITY.medium[knob] <= QUALITY.high[knob], `${knob} medium<=high`);
    }
  });

  it('low is the cheap tier: diffuse-only PBR, no shadows, no env map, no glTF props', () => {
    const low = QUALITY.low;
    assert.equal(low.shadowMapSize, 0);
    assert.equal(low.envMapSize, 0);
    assert.equal(low.glbProps, 0);
    assert.equal(low.antialias, 0);
    assert.ok(presetUsesMap(low, 'diffuse') && !presetUsesMap(low, 'normal') && !presetUsesMap(low, 'arm'));
    assert.ok(presetUsesMap(QUALITY.medium, 'normal') && !presetUsesMap(QUALITY.medium, 'arm'));
    assert.ok(presetUsesMap(QUALITY.high, 'arm'));
  });
});

describe('GPU auto-detection', () => {
  const cases = [
    ['ANGLE (Intel, Intel(R) UHD Graphics 620 (0x00005917) Direct3D11 vs_5_0 ps_5_0, D3D11)', 8, 'low'],
    ['ANGLE (Intel, Intel(R) Iris(R) Xe Graphics Direct3D11)', 12, 'low'],
    ['Mesa Intel(R) UHD Graphics 630 (CFL GT2)', 8, 'low'],
    ['Google SwiftShader', 16, 'low'],
    ['llvmpipe (LLVM 15.0.7, 256 bits)', 16, 'low'],
    ['Microsoft Basic Render Driver', 8, 'low'],
    ['ANGLE (AMD, AMD Radeon(TM) Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)', 8, 'medium'],
    ['AMD Radeon Vega 8 Graphics', 8, 'medium'],
    ['ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11)', 12, 'high'],
    ['ANGLE (AMD, AMD Radeon RX 6700 XT Direct3D11)', 12, 'high'],
    ['ANGLE (Apple, ANGLE Metal Renderer: Apple M2, Unspecified Version)', 8, 'high'],
    ['Apple GPU', 6, 'high'],
    ['ANGLE (Intel, Intel(R) Arc(TM) A370M Graphics)', 12, 'medium'],
    ['', 0, 'medium'],
    ['Some Unknown Renderer', 8, 'medium']
  ];
  for (const [renderer, cores, expected] of cases) {
    it(`"${renderer || '(empty)'}" / ${cores} cores -> ${expected}`, () => {
      assert.equal(detectTier(renderer, cores), expected);
    });
  }

  it('drops exactly one tier on <= 4 logical cores and never below low', () => {
    assert.equal(detectTier('NVIDIA GeForce GTX 1650', 4), 'medium');
    assert.equal(detectTier('AMD Radeon(TM) Graphics', 4), 'low');
    assert.equal(detectTier('Intel(R) UHD Graphics', 2), 'low');
    assert.equal(detectTier('NVIDIA GeForce GTX 1650', 6), 'high');
  });

  it('resolveTier honours an explicit choice and falls back to the detected tier on auto', () => {
    assert.equal(resolveTier('high', 'low'), 'high');
    assert.equal(resolveTier('auto', 'low'), 'low');
    assert.equal(resolveTier('garbage', 'high'), 'high');
    assert.equal(resolveTier('auto', 'nonsense'), 'medium');
  });

  it('?perf=1 turns the overlay on', () => {
    assert.equal(isPerfOverlayRequested('?perf=1'), true);
    assert.equal(isPerfOverlayRequested('?room=AB&perf'), true);
    assert.equal(isPerfOverlayRequested('?perf=0'), false);
    assert.equal(isPerfOverlayRequested(''), false);
  });
});

describe('persisted choice tolerates storage failures', () => {
  it('round-trips through a working storage', () => {
    const store = memStorage();
    assert.equal(loadQualityChoice(store), 'auto');
    assert.equal(saveQualityChoice('low', store), true);
    assert.equal(store.data[QUALITY_STORAGE_KEY], 'low');
    assert.equal(loadQualityChoice(store), 'low');
  });

  it('never throws when storage throws, is missing, or holds junk', () => {
    const boom = {
      getItem() {
        throw new Error('SecurityError');
      },
      setItem() {
        throw new Error('QuotaExceeded');
      }
    };
    assert.equal(loadQualityChoice(boom), 'auto');
    assert.equal(saveQualityChoice('high', boom), false);
    assert.equal(loadQualityChoice(memStorage({ [QUALITY_STORAGE_KEY]: 'ultra' })), 'auto');
    assert.equal(saveQualityChoice('ultra', memStorage()), false);
    // no localStorage global in Node at all
    assert.equal(loadQualityChoice(), 'auto');
    assert.equal(saveQualityChoice('medium'), false);
  });
});

// ---------------------------------------------------------------- asset loader
describe('AssetManager fallbacks', () => {
  const failingLoaderFactory = async () => {
    throw new Error('GLTFLoader unavailable');
  };

  it('resolves missing models to null, never throws and warns only once per asset', async () => {
    resetAssetWarnings();
    const warnings = [];
    const origWarn = console.warn;
    console.warn = (...a) => warnings.push(a.join(' '));
    try {
      const mgr = new AssetManager({ importGltfLoader: failingLoaderFactory });
      assert.equal(await mgr.loadModel('crate-wide'), null);
      assert.equal(await mgr.loadModel('crate-wide'), null);
      assert.equal(mgr.cloneModel('crate-wide'), null);
      assert.equal(warnings.filter((w) => w.includes('crate-wide')).length, 1);
      // a second manager (e.g. after a hot reload) must not repeat the warning either
      const mgr2 = new AssetManager({ importGltfLoader: failingLoaderFactory });
      assert.equal(await mgr2.loadModel('crate-wide'), null);
      assert.equal(warnings.filter((w) => w.includes('crate-wide')).length, 1);
    } finally {
      console.warn = origWarn;
    }
  });

  it('a loader that rejects on load (404) also resolves to null', async () => {
    resetAssetWarnings();
    const origWarn = console.warn;
    console.warn = () => {};
    try {
      const mgr = new AssetManager({
        importGltfLoader: async () =>
          class {
            loadAsync() {
              return Promise.reject(new Error('404'));
            }
          }
      });
      assert.equal(await mgr.loadModel('blaster-z'), null);
    } finally {
      console.warn = origWarn;
    }
  });

  it('texture sets fall back to null when images fail; preload reports progress and failures', async () => {
    resetAssetWarnings();
    const origWarn = console.warn;
    let warned = 0;
    console.warn = () => warned++;
    try {
      const mgr = new AssetManager({
        loadImage: async () => {
          throw new Error('missing');
        },
        importGltfLoader: failingLoaderFactory
      });
      assert.equal(await mgr.loadTextureSet('metal_plate', QUALITY.high), null);
      const events = [];
      const failures = await mgr.preload({
        models: ['crate-wide'],
        textureSets: ['metal_plate', 'red_brick'],
        tier: QUALITY.low,
        onProgress: (p) => events.push(p)
      });
      assert.equal(failures, 3);
      assert.equal(events.at(-1).loaded, 3);
      assert.equal(events.at(-1).total, 3);
      assert.ok(warned > 0);
    } finally {
      console.warn = origWarn;
    }
  });

  it('requests only the maps a tier needs (diffuse / +normal / +ARM) with correct colour spaces and downscales', async () => {
    resetAssetWarnings();
    const requested = [];
    const mgr = new AssetManager({
      loadImage: async (url) => {
        requested.push(url);
        return { width: 1024, height: 1024, naturalWidth: 1024, naturalHeight: 1024 };
      }
    });
    mgr.setMaxAnisotropy(4);
    const low = await mgr.loadTextureSet('metal_plate', QUALITY.low);
    assert.deepEqual(requested.map((u) => u.split('/').pop()), ['metal_plate_diff_1k.jpg']);
    assert.equal(low.diffuse.colorSpace, THREE.SRGBColorSpace);
    assert.equal(low.normal, null);
    assert.equal(low.arm, null);
    const high = await mgr.loadTextureSet('red_brick', QUALITY.high);
    assert.equal(high.diffuse.colorSpace, THREE.SRGBColorSpace);
    assert.equal(high.normal.colorSpace, THREE.NoColorSpace);
    assert.equal(high.arm.colorSpace, THREE.NoColorSpace);
    assert.equal(high.diffuse.anisotropy, 4, 'anisotropy is clamped to the GPU maximum');
    assert.equal(textureUrl('red_brick', 'arm').endsWith('/textures/red_brick/red_brick_arm_1k.jpg'), true);
  });
});

// ---------------------------------------------------------------- UV maths & crate fitting
describe('world-space UVs (metres)', () => {
  it('box faces get uv1 = metres / tile on every face, independent of box size', () => {
    const tile = 2;
    for (const [w, h, d] of [[1.5, 1.5, 1.5], [130, 9, 1], [4.2, 1.4, 1.2]]) {
      const geo = new THREE.BoxGeometry(w, h, d);
      assert.equal(applyMetricBoxUV1(geo, w, h, d, tile), true);
      const uv1 = geo.attributes.uv1;
      assert.equal(uv1.count, geo.attributes.uv.count);
      const span = (face, axis) => {
        let lo = Infinity;
        let hi = -Infinity;
        for (let i = 0; i < 4; i++) {
          const v = axis === 0 ? uv1.getX(face * 4 + i) : uv1.getY(face * 4 + i);
          lo = Math.min(lo, v);
          hi = Math.max(hi, v);
        }
        return hi - lo;
      };
      const expected = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
      for (let f = 0; f < 6; f++) {
        assert.ok(Math.abs(span(f, 0) - expected[f][0] / tile) < 1e-5, `face ${f} u for ${w}x${h}x${d}`);
        assert.ok(Math.abs(span(f, 1) - expected[f][1] / tile) < 1e-5, `face ${f} v for ${w}x${h}x${d}`);
      }
    }
  });

  it('plane UVs cover width/tile x height/tile repeats', () => {
    const geo = new THREE.PlaneGeometry(120, 120);
    applyMetricPlaneUV1(geo, 120, 120, 4);
    const u = geo.attributes.uv1;
    let max = 0;
    for (let i = 0; i < u.count; i++) max = Math.max(max, u.getX(i), u.getY(i));
    assert.equal(max, 30);
  });

  it('every theme has a plan for each role and only references shipped Poly Haven sets', () => {
    for (const mapId of MAPS) {
      const plan = SURFACE_PLANS[mapId];
      assert.ok(plan, mapId);
      for (const role of ['floor', 'wall', 'platform', 'container', 'crate', 'pillar', 'step']) {
        assert.ok(TEXTURE_SET_IDS.includes(plan[role].set), `${mapId}.${role}`);
        assert.ok(plan[role].tile > 0.5 && plan[role].tile <= 6);
        for (const kind of ['diff', 'nor_gl', 'arm']) {
          const file = path.join(ROOT_DIR, 'public', 'assets', 'textures', plan[role].set, `${plan[role].set}_${kind}_1k.jpg`);
          assert.ok(fs.existsSync(file), file);
        }
      }
    }
  });
});

describe('crate model fitting (visual only)', () => {
  it('fitBoxToAabb accepts a proportional fit (also rotated 90deg) and rejects a squashed one', () => {
    const model = { x: 0.79, y: 0.23, z: 1.2 };
    const ok = fitBoxToAabb(model, { w: 0.79 * 2, h: 0.23 * 2, d: 1.2 * 2 });
    assert.equal(ok.ok, true);
    assert.ok(Math.abs(ok.anisotropy - 1) < 1e-9);
    const rotated = fitBoxToAabb(model, { w: 1.2 * 1.5, h: 0.23 * 1.5, d: 0.79 * 1.5 });
    assert.equal(rotated.ok, true);
    assert.ok(Math.abs(rotated.rotY - Math.PI / 2) < 1e-9);
    assert.equal(fitBoxToAabb(model, { w: 2, h: 2, d: 2 }).ok, false);
  });

  it('fitContainUniform keeps proportions and rejects when the result would be tiny', () => {
    const model = { x: 0.55, y: 0.37, z: 1.2 };
    const fit = fitContainUniform(model, { w: 1.5, h: 0.5, d: 1.0 });
    assert.equal(fit.ok, true);
    assert.equal(fit.scale.x, fit.scale.y);
    assert.equal(fit.scale.y, fit.scale.z);
    assert.ok(model.z * fit.scale.z <= 1.5 + 1e-9 && model.y * fit.scale.y <= 0.5 + 1e-9);
    assert.equal(fitContainUniform(model, { w: 0.2, h: 0.1, d: 0.2 }).ok, false);
  });

  it('the real Kenney crate (small open ammo case) fits only the few elongated crate obstacles; the rest keep their boxes', () => {
    const size = parseGlbBounds(path.join(ROOT_DIR, 'public/assets/models/kenney-blaster-kit/crate-wide.glb'));
    assert.ok(size.y < 0.5 && size.z > 1.1 && size.x < 0.7, 'sanity: crate-wide is a small open ammo case, not a cube');
    let tested = 0;
    let fitting = 0;
    for (const mapId of MAPS) {
      for (const o of getMapConfig(mapId).obstacles.filter((ob) => ob.type === 'crate')) {
        tested++;
        const fit = fitBoxToAabb(size, { w: o.w, h: o.h, d: o.d });
        assert.equal(fit.ok, fit.anisotropy <= 1.6, `${mapId} crate ${o.w}x${o.h}x${o.d}`);
        if (fit.ok) fitting++;
      }
    }
    assert.ok(tested > 50);
    assert.ok(fitting < tested * 0.25, `only a minority of crates may use the model (${fitting}/${tested})`);
  });

  it('arena keeps procedural crates when the model does not fit, and replaces only fitting ones (collision untouched)', async () => {
    const game = await createTestGame3D({ qualityChoice: 'high' });
    const hashBefore = obstacleHash('cyber_citadel');
    // 1) a model that cannot fit anything: every crate keeps its visible box
    game.assets.loadedModels.set('crate-wide', { scene: fakeCrateScene(0.79, 0.23, 1.2) });
    game.loadMap('cyber_citadel');
    const crates = getMapConfig('cyber_citadel').obstacles.filter((o) => o.type === 'crate');
    const crateMeshes = game.worldMeshes.slice(1).filter((m, i) => getMapConfig('cyber_citadel').obstacles[i].type === 'crate');
    assert.equal(crateMeshes.length, crates.length);
    // 2) a model that matches crate #0 exactly
    const c0 = crates[0];
    game.assets.loadedModels.set('crate-wide', { scene: fakeCrateScene(c0.w / 3, c0.h / 3, c0.d / 3) });
    game.loadMap('cyber_citadel');
    const idx0 = getMapConfig('cyber_citadel').obstacles.indexOf(c0);
    const mesh0 = game.worldMeshes[1 + idx0];
    assert.equal(mesh0.visible, false, 'fitting crate: box visual replaced');
    assert.equal(game.worldMeshes.length, 1 + getMapConfig('cyber_citadel').obstacles.length, 'raycast/collision meshes remain');
    const batcher = game.propBatchers[0];
    const placement = batcher.fitted.find((f) => f.center.x === c0.x && f.center.z === c0.z);
    assert.ok(placement, 'crate 0 was fitted');
    assert.ok(placement.fit.anisotropy <= 1.0001);
    // scaled model bounds == AABB (within 1e-6 m)
    const sx = placement.fit.scale.x * (c0.w / 3);
    const sy = placement.fit.scale.y * (c0.h / 3);
    const sz = placement.fit.scale.z * (c0.d / 3);
    const [bx, bz] = placement.fit.rotY ? [sz, sx] : [sx, sz];
    assert.ok(Math.abs(bx - c0.w) < 1e-6 && Math.abs(sy - c0.h) < 1e-6 && Math.abs(bz - c0.d) < 1e-6);
    // instanced props share the cached geometry and are not disposed with the map
    const inst = game.arenaDecorMeshes.filter((m) => m.userData.sharedWithAssetCache);
    assert.ok(inst.length >= 1 && inst.every((m) => m.isInstancedMesh && m.frustumCulled === false && m.matrixAutoUpdate === false));
    // 3) the real crate proportions: toppers use the undistorted contain-fit and stay inside their footprint
    game.assets.loadedModels.set('crate-wide', { scene: fakeCrateScene(0.55, 0.37, 1.2) });
    game.loadMap('cyber_citadel');
    const toppers = game.propBatchers[1].fitted;
    assert.ok(toppers.length > 0, 'at least one tactical case topper uses the glTF crate');
    for (const t of toppers) {
      assert.equal(t.fit.scale.x, t.fit.scale.y);
      const [ex, ez] = t.fit.rotY ? [1.2, 0.55] : [0.55, 1.2];
      assert.ok(ex * t.fit.scale.x <= t.aabb.w + 1e-9 && ez * t.fit.scale.z <= t.aabb.d + 1e-9);
      assert.ok(0.37 * t.fit.scale.y <= t.aabb.h + 1e-9);
    }
    game.assets.loadedModels.delete('crate-wide');
    assert.equal(obstacleHash('cyber_citadel'), hashBefore, 'shared/maps obstacle data untouched');
  });
});

// ---------------------------------------------------------------- arena per tier / map
describe('arena builds on every tier and map within budget', () => {
  const baseline = Object.fromEntries(MAPS.map((id) => [id, obstacleHash(id)]));
  const results = {};

  for (const tier of TIER_ORDER) {
    it(`tier ${tier}: all maps build headlessly, collision data unchanged, bounded draw-call proxy`, async () => {
      const game = await createTestGame3D({ qualityChoice: tier });
      assert.equal(game.tier, tier);
      assert.equal(game.renderer.shadowMap.enabled, QUALITY[tier].shadowMapSize > 0);
      assert.equal(game.camera.far, QUALITY[tier].cameraFar);
      for (const mapId of MAPS) {
        game.loadMap(mapId);
        const cfg = getMapConfig(mapId);
        assert.equal(game.worldMeshes.length, 1 + cfg.obstacles.length, 'floor + one mesh per obstacle');
        assert.equal(obstacleHash(mapId), baseline[mapId], `${mapId} obstacles unchanged`);
        assert.equal(Boolean(game.scene.environment), QUALITY[tier].envMapSize > 0, `${mapId} env map presence`);
        assert.equal(game.ambientParticles ? game.ambientParticles.geometry.attributes.position.count : 0, QUALITY[tier].ambientParticles);
        const stats = sceneStats(game);
        results[`${tier}/${mapId}`] = stats;
        assert.ok(stats.drawCalls <= 180, `${tier}/${mapId} draw-call proxy ${stats.drawCalls}`);
        assert.ok(stats.triangles <= 400_000, `${tier}/${mapId} triangles ${stats.triangles}`);
        assert.equal(game.pbrSlots.length > 0, true);
        for (const slot of game.pbrSlots) {
          assert.ok(TEXTURE_SET_IDS.includes(slot.spec.set));
        }
      }
    });
  }

  it('low tier meets the stated budget on the biggest map (<= 150 draw calls, <= 250k triangles) and is cheaper than high', () => {
    const lowWorst = MAPS.map((m) => results[`low/${m}`]);
    for (const [i, s] of lowWorst.entries()) {
      assert.ok(s.drawCalls <= 150, `low/${MAPS[i]} drawCalls ${s.drawCalls}`);
      assert.ok(s.triangles <= 250_000, `low/${MAPS[i]} triangles ${s.triangles}`);
    }
    for (const m of MAPS) {
      assert.ok(results[`low/${m}`].triangles < results[`high/${m}`].triangles, `${m}: low has fewer triangles than high`);
    }
  });

  it('applyQuality switches tier at runtime (renderer, shadows, camera, decals) and rebuilds the idle lobby map', async () => {
    const game = await createTestGame3D({ qualityChoice: 'high' });
    let notified = null;
    game.callbacks.onQualityChanged = (info) => {
      notified = info;
    };
    const beforeTris = sceneStats(game).triangles;
    const info = game.applyQuality('low', { persist: false });
    assert.equal(info.tier, 'low');
    assert.equal(info.rebuilt, true);
    assert.equal(notified.tier, 'low');
    assert.equal(game.renderer.shadowMap.enabled, false);
    assert.equal(game.maxBulletDecals, QUALITY.low.maxBulletDecals);
    assert.equal(game.camera.far, QUALITY.low.cameraFar);
    assert.ok(sceneStats(game).triangles < beforeTris);
    // in a match the geometry rebuild is deferred and reported
    game.inMatch = true;
    const mid = game.applyQuality('medium', { persist: false });
    assert.equal(mid.pendingMapRebuild, true);
    assert.equal(game.renderer.shadowMap.enabled, true);
    game.inMatch = false;
    // auto falls back to the detected tier
    assert.equal(game.applyQuality('auto', { persist: false }).tier, game.detectedTier);
  });

  it('the adaptive pixel-ratio floor follows the tier with sustained-low-FPS hysteresis and cooldown (no mid-match oscillation)', async () => {
    const low = await createTestGame3D({ qualityChoice: 'low' });
    const high = await createTestGame3D({ qualityChoice: 'high' });
    assert.equal(low.quality.minPixelRatio, 0.6);
    assert.equal(high.quality.minPixelRatio, 0.85);
    low.inMatch = true;

    // 1-3 brief low-FPS samples (< 2s) must NOT step down pixel ratio
    const initialPr = low.currentPixelRatio;
    for (let i = 1; i <= 3; i++) {
      low.lastFpsUpdate = (i - 1) * 600;
      low.frameCount = 10; // ~16.7 FPS
      low.animate(i * 600);
    }
    assert.equal(low.currentPixelRatio, initialPr, 'brief 3-sample dip does not reallocate framebuffer');

    // 4th consecutive low-FPS sample steps down once, and cooldown prevents immediate consecutive drops
    for (let i = 4; i <= 40; i++) {
      low.lastFpsUpdate = (i - 1) * 600;
      low.frameCount = 5;
      low.animate(i * 600);
    }
    assert.ok(low.currentPixelRatio >= low.quality.minPixelRatio - 1e-9);
    assert.ok(low.currentPixelRatio < initialPr, 'sustained low FPS steps down pixel ratio');
    const steppedDownPr = low.currentPixelRatio;

    // High FPS during match must NEVER step pixel ratio back up mid-match
    for (let i = 41; i <= 50; i++) {
      low.lastFpsUpdate = (i - 1) * 600;
      low.frameCount = 60; // 100 FPS
      low.animate(i * 600);
    }
    assert.equal(low.currentPixelRatio, steppedDownPr, 'pixel ratio never oscillates back up mid-match');
  });

  it('sfx.playBulletWhizz seals and disconnects its spatial WebAudio chain after playback', async () => {
    const { installAudioMock, removeAudioMock } = await import('./helpers/perf-probe.mjs');
    const { sfx } = await import('../public/js/audio.js');
    installAudioMock();
    try {
      sfx.ensureContext();
      sfx.flushPendingCleanups(true);
      const listener = { x: 0, y: 1.6, z: 0, yaw: 0 };
      const resClose = sfx.playBulletWhizz(listener, { x: 0.8, y: 1.6, z: -1.0 }, 0.8);
      const resFar = sfx.playBulletWhizz(listener, { x: 1.6, y: 1.6, z: -1.0 }, 1.8);
      assert.ok(resClose && resFar);
      const chainEntries = sfx._pendingCleanups.filter((e) => e && e.chain);
      assert.equal(chainEntries.length, 2, 'both spatial chains scheduled for cleanup');
      for (const entry of chainEntries) {
        assert.equal(entry.chain._sealed, true, 'spatial chain is sealed immediately');
        assert.equal(entry.chain.disposed, false);
      }
      await new Promise((r) => setTimeout(r, 240));
      sfx.flushPendingCleanups();
      for (const entry of chainEntries) {
        assert.equal(entry.chain.disposed, true, 'spatial chain is disposed after playback');
      }
      assert.equal(
        sfx._pendingCleanups.filter((e) => e && !e.done).length,
        0,
        'all bullet whizz nodes and chains are cleaned up'
      );
    } finally {
      sfx.flushPendingCleanups(true);
      sfx.ctx = null;
      sfx.noiseBuffer = null;
      removeAudioMock();
    }
  });

  it('spawns a short travelling bullet tracer bolt that advances from gun muzzle to impact endpoint without overshooting', async () => {
    const game = await createTestGame3D({ qualityChoice: 'high' });
    const origin = { x: 0, y: 1.5, z: 0 };
    const hitPoint = { x: 0, y: 1.5, z: -20 };
    game.spawnTracerEffect(origin, hitPoint, 0xffdd77, false, true);
    assert.equal(game.activeEffects.length, 1);

    const fx = game.activeEffects[0];
    assert.equal(fx.type, 'tracer');
    assert.ok(fx.boltLen > 0.25 && fx.boltLen < 2.0, `short bolt length=${fx.boltLen}`);
    assert.ok(Math.abs(fx.totalDist - 20) < 1e-6);

    const posAttr = fx.line.geometry.getAttribute('position');
    const initialTailZ = posAttr.getZ(0);
    const initialHeadZ = posAttr.getZ(1);
    const initialSegLen = Math.hypot(
      posAttr.getX(1) - posAttr.getX(0),
      posAttr.getY(1) - posAttr.getY(0),
      posAttr.getZ(1) - posAttr.getZ(0)
    );
    assert.ok(Math.abs(initialTailZ - 0) < 1e-5, 'starts at muzzle');
    assert.ok(initialSegLen < 2.0, `initial bolt segment (${initialSegLen}) is much shorter than full 20m ray`);

    // Advance mid-flight
    game.animate(fx.createdAt + fx.travelMs * 0.5);
    const midTailZ = posAttr.getZ(0);
    const midHeadZ = posAttr.getZ(1);
    assert.ok(midHeadZ < initialHeadZ && midTailZ < initialTailZ, 'bolt advances toward target');
    assert.ok(midHeadZ >= -20 - 1e-5, 'bolt does not overshoot target mid-flight');

    // Advance to arrival at impact point
    game.animate(fx.createdAt + fx.travelMs + 5);
    const endHeadZ = posAttr.getZ(1);
    const endTailZ = posAttr.getZ(0);
    assert.ok(Math.abs(endHeadZ - -20) < 1e-4, `clamps head at impact z=-20 (got ${endHeadZ})`);
    assert.ok(endTailZ >= -20 - 1e-4, `clamps tail at or before impact z=-20 (got ${endTailZ})`);
  });
});

// ---------------------------------------------------------------- real server static serving
function getFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.once('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

describe('server/index.js serves the graphics assets with correct content types', () => {
  let child;
  let base;
  let exited = false;

  before(async () => {
    const port = await getFreePort();
    base = `http://127.0.0.1:${port}`;
    child = spawn(process.execPath, ['server/index.js'], {
      cwd: ROOT_DIR,
      env: { ...process.env, PORT: String(port) },
      stdio: ['ignore', 'pipe', 'pipe']
    });
    child.on('exit', () => {
      exited = true;
    });
    child.stdout.resume();
    child.stderr.resume();
    const deadline = Date.now() + 15_000;
    for (;;) {
      try {
        if ((await fetch(`${base}/healthz`)).ok) break;
      } catch {
        /* not up yet */
      }
      if (exited || Date.now() > deadline) throw new Error('server did not start');
      await new Promise((r) => setTimeout(r, 100));
    }
  });

  after(() => {
    if (child && !exited) child.kill();
  });

  async function head(url) {
    const res = await fetch(`${base}${url}`);
    const body = Buffer.from(await res.arrayBuffer());
    return { res, body, type: res.headers.get('content-type') || '' };
  }

  it('.glb -> model/gltf-binary with a valid glTF magic', async () => {
    const { res, body, type } = await head('/assets/models/kenney-blaster-kit/crate-wide.glb');
    assert.equal(res.status, 200);
    assert.match(type, /^model\/gltf-binary/);
    assert.equal(body.slice(0, 4).toString(), 'glTF');
  });

  it('.jpg -> image/jpeg (JPEG magic) for every texture of every set', async () => {
    for (const id of TEXTURE_SET_IDS) {
      for (const kind of ['diff', 'nor_gl', 'arm']) {
        const { res, body, type } = await head(`/assets/textures/${id}/${id}_${kind}_1k.jpg`);
        assert.equal(res.status, 200, id + kind);
        assert.match(type, /^image\/jpeg/);
        assert.equal(body[0], 0xff);
        assert.equal(body[1], 0xd8);
      }
    }
  });

  it('import-map targets are served as JavaScript: three.module.js, GLTFLoader and its relative imports', async () => {
    for (const url of [
      '/vendor/three/three.module.js',
      '/vendor/three-examples/loaders/GLTFLoader.js',
      '/vendor/three-examples/utils/BufferGeometryUtils.js',
      '/js/assets.js',
      '/js/quality.js'
    ]) {
      const { res, type } = await head(url);
      assert.equal(res.status, 200, url);
      assert.match(type, /javascript/, url);
    }
  });

  it('three.module.js has no sibling three.core.js import (single self-contained module -> one instance)', async () => {
    const { body } = await head('/vendor/three/three.module.js');
    assert.equal(/from\s+['"]\.\/three\.core(\.min)?\.js['"]/.test(body.toString('utf8')), false);
  });

  it('index.html declares the import map for three and three/addons/ before the module entry', async () => {
    const { body } = await head('/');
    const html = body.toString('utf8');
    const mapAt = html.indexOf('type="importmap"');
    const entryAt = html.indexOf('src="./js/main.js"');
    assert.ok(mapAt > 0 && entryAt > mapAt);
    assert.match(html, /"three":\s*"\.\/vendor\/three\/three\.module\.js"/);
    assert.match(html, /"three\/addons\/":\s*"\.\/vendor\/three-examples\/"/);
    assert.match(html, /id="lobby-quality-select"/);
    assert.match(html, /id="pause-quality-select"/);
  });

  it('CREDITS.md and the Kenney licence are published next to the assets', async () => {
    assert.equal((await head('/assets/CREDITS.md')).res.status, 200);
    assert.equal((await head('/assets/models/kenney-blaster-kit/License.txt')).res.status, 200);
  });
});
