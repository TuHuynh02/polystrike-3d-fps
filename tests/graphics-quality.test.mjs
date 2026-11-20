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
    const hashBefore = obstacleHash('de_nuke');
    // 1) a model that cannot fit anything: every crate keeps its visible box
    game.assets.loadedModels.set('crate-wide', { scene: fakeCrateScene(0.79, 0.23, 1.2) });
    game.loadMap('de_nuke');
    const crates = getMapConfig('de_nuke').obstacles.filter((o) => o.type === 'crate');
    const crateMeshes = game.worldMeshes.slice(1).filter((m, i) => getMapConfig('de_nuke').obstacles[i].type === 'crate');
    assert.equal(crateMeshes.length, crates.length);
    // 2) a model that matches crate #0 exactly
    const c0 = crates[0];
    game.assets.loadedModels.set('crate-wide', { scene: fakeCrateScene(c0.w / 3, c0.h / 3, c0.d / 3) });
    game.loadMap('de_nuke');
    const idx0 = getMapConfig('de_nuke').obstacles.indexOf(c0);
    const mesh0 = game.worldMeshes[1 + idx0];
    assert.equal(mesh0.visible, false, 'fitting crate: box visual replaced');
    assert.equal(game.worldMeshes.length, 1 + getMapConfig('de_nuke').obstacles.length, 'raycast/collision meshes remain');
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
    game.loadMap('de_nuke');
    const toppers = game.propBatchers[1].fitted;
    assert.ok(toppers.length > 0, 'at least one tactical case topper uses the glTF crate');
    for (const t of toppers) {
      assert.equal(t.fit.scale.x, t.fit.scale.y);
      const [ex, ez] = t.fit.rotY ? [1.2, 0.55] : [0.55, 1.2];
      assert.ok(ex * t.fit.scale.x <= t.aabb.w + 1e-9 && ez * t.fit.scale.z <= t.aabb.d + 1e-9);
      assert.ok(0.37 * t.fit.scale.y <= t.aabb.h + 1e-9);
    }
    game.assets.loadedModels.delete('crate-wide');
    assert.equal(obstacleHash('de_nuke'), hashBefore, 'shared/maps obstacle data untouched');
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
      '/vendor/postprocessing/index.js',
      '/vendor/n8ao/N8AO.js',
      '/js/assets.js',
      '/js/quality.js'
    ]) {
      const { res, type } = await head(url);
      assert.equal(res.status, 200, url);
      assert.match(type, /javascript/, url);
    }
    for (const assetUrl of [
      '/assets/models/characters/bot_mask_cap.glb',
      '/assets/models/characters/bot_wrap_goggles.glb',
      '/assets/models/cs2/ak47.glb',
      '/assets/models/cs2/awp.glb',
      '/assets/models/cs2/knife.glb',
      '/assets/textures/decals/grime.png',
      '/assets/textures/decals/posters.png',
      '/assets/hdri/kloofendal_48d_partly_cloudy_puresky_1k.hdr',
      '/assets/textures/beige_wall_001/beige_wall_001_diff_1k.jpg',
      '/assets/models/polyhaven/covered_car/covered_car_1k.gltf'
    ]) {
      const { res } = await head(assetUrl);
      assert.equal(res.status, 200, assetUrl);
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
    assert.match(html, /"three\/examples\/jsm\/":\s*"\.\/vendor\/three-examples\/"/);
    assert.match(html, /"postprocessing":\s*"\.\/vendor\/postprocessing\/index\.js"/);
    assert.match(html, /"n8ao":\s*"\.\/vendor\/n8ao\/N8AO\.js"/);
    assert.match(html, /id="lobby-quality-select"/);
    assert.match(html, /id="pause-quality-select"/);
  });

  it('CREDITS.md and the Kenney licence are published next to the assets', async () => {
    assert.equal((await head('/assets/CREDITS.md')).res.status, 200);
    assert.equal((await head('/assets/models/kenney-blaster-kit/License.txt')).res.status, 200);
  });

  it('index.html includes the 4-stage Saltline boot preload bar and tactical HUD ammo elements', async () => {
    const { body } = await head('/');
    const html = body.toString('utf8');
    assert.match(html, /id="asset-loading-stage"/);
    assert.match(html, /id="asset-loading-pct"/);
    assert.match(html, /data-boot-step="1"/);
    assert.match(html, /data-boot-step="4"/);
    assert.match(html, /id="hud-ammo-alert"/);
    assert.match(html, /id="hud-ammo-block"/);
    assert.match(html, /id="hud-ammo-pips"/);
  });
});

// ---------------------------------------------------------------- Saltline A1-A4 optimizations
describe('Saltline graphics, 30Hz high-tier shadows, viewmodel springs, audio synthesis & HUD dirty-check', () => {
  it('applies AgX tone mapping and tier-scaled wet floor shader hooks while preserving desert floor restraint', async () => {
    assert.equal(QUALITY.low.wetFloorStrength, 0);
    assert.ok(QUALITY.medium.wetFloorStrength > 0);
    assert.ok(QUALITY.high.wetFloorStrength > QUALITY.medium.wetFloorStrength);

    const game = await createTestGame3D({ qualityChoice: 'high' });
    game.loadMap('de_nuke');
    assert.equal(game.renderer.toneMapping, THREE.AgXToneMapping ?? THREE.ACESFilmicToneMapping);
    assert.equal(game.renderer.toneMappingExposure, 1.08);
    assert.ok(game.floorMat, 'arena exposes floorMat');
    assert.equal(game.floorMat.userData.wetFloorStrength, QUALITY.high.wetFloorStrength);
    assert.equal(typeof game.floorMat.onBeforeCompile, 'function');

    // Verify shader injection compiles expected world-space puddle uniforms & chunks in valid GLSL declaration order
    const fakeShader = {
      uniforms: {},
      vertexShader: '#include <common>\nvoid main() {\n#include <worldpos_vertex>\n}',
      fragmentShader: '#include <common>\nvoid main() {\n#include <roughnessmap_fragment>\n#include <color_fragment>\n}'
    };
    const highProgramKey = game.floorMat.customProgramCacheKey();
    game.floorMat.onBeforeCompile(fakeShader);
    assert.equal(fakeShader.uniforms.uSaltlineWetStrength.value, QUALITY.high.wetFloorStrength);
    assert.match(fakeShader.vertexShader, /vSaltlineWorldPos/);
    assert.match(fakeShader.fragmentShader, /slWetMask/);
    assert.match(fakeShader.fragmentShader, /mix\(1\.0,\s*0\.86,\s*slWetMask\)/);
    assert.ok(
      fakeShader.fragmentShader.indexOf('float slWetMask') < fakeShader.fragmentShader.indexOf('slWetMask * 0.88'),
      'declares slWetMask before first use regardless of chunk order'
    );

    // Changing wet strength mid-match updates uniform in-place with identical program cache key (zero shader recompile)
    game.inMatch = true;
    game.applyQuality('medium', { persist: false });
    assert.equal(game.floorMat.customProgramCacheKey(), highProgramKey, 'reuses stable wet-floor shader cache key across medium/high');
    assert.equal(fakeShader.uniforms.uSaltlineWetStrength.value, QUALITY.medium.wetFloorStrength);
    game.inMatch = false;
    game.applyQuality('high', { persist: false });

    // Desert map (de_dust2) scales wet floor strength down so sand stays natural
    game.loadMap('de_dust2');
    assert.ok(
      game.floorMat.userData.wetFloorStrength > 0 &&
        game.floorMat.userData.wetFloorStrength < QUALITY.high.wetFloorStrength,
      'desert floor scales down wet puddle strength'
    );

    // Switching down to low in-match removes wet floor shader hook on live floorMat cleanly, and in lobby rebuilds cleanly
    const liveFloorMat = game.floorMat;
    game.inMatch = true;
    game.applyQuality('low', { persist: false });
    assert.equal(liveFloorMat.userData.wetFloorStrength, 0);
    assert.equal(liveFloorMat.userData._hasSaltlineWetHook, false);
    game.inMatch = false;
    game.applyQuality('low', { persist: false });
    assert.equal(game.floorMat.userData.wetFloorStrength, 0);
    assert.equal(game.floorMat.userData._hasSaltlineWetHook, false);
  });

  it('throttles dynamic remote-player shadows to 30Hz exclusively on high tier and keeps medium/low at 0Hz', async () => {
    assert.equal(QUALITY.low.dynamicShadowHz, 0);
    assert.equal(QUALITY.medium.dynamicShadowHz, 0);
    assert.equal(QUALITY.high.dynamicShadowHz, 30);

    const game = await createTestGame3D({ qualityChoice: 'high' });
    game.localId = 'me';
    game.inMatch = true;

    // Lobby showcase operator never casts arena shadows
    let showcaseCasters = 0;
    game.lobbyOperator?.group?.traverse((c) => {
      if (c.isMesh && c.castShadow) showcaseCasters++;
    });
    assert.equal(showcaseCasters, 0, 'lobby showcase operator does not cast arena shadows');

    // Spawn a live visible remote player on high tier
    game.syncPlayersState([
      { id: 'enemy-1', name: 'Bot1', x: 4, y: 0, z: -6, yaw: 0, pitch: 0, hp: 100, alive: true, weapon: 'rifle' }
    ]);
    const rp = game.remotePlayers.get('enemy-1');
    assert.ok(rp, 'remote player created');
    let remoteCastersHigh = 0;
    rp.group.traverse((c) => {
      if (c.isMesh && c.castShadow) remoteCastersHigh++;
    });
    assert.ok(remoteCastersHigh > 0, 'remote player meshes cast shadows on high tier');

    // Remote weapon swap preserves shadow casting on high tier
    game.syncPlayersState([
      { id: 'enemy-1', name: 'Bot1', x: 4, y: 0, z: -6, yaw: 0, pitch: 0, hp: 100, alive: true, weapon: 'sniper' }
    ]);
    let sniperGunCasters = 0;
    rp.gunMesh.traverse((c) => {
      if (c.isMesh && c.castShadow) sniperGunCasters++;
    });
    assert.ok(sniperGunCasters > 0, 'swapped remote weapon mesh preserves shadow casting on high tier');

    // Frame at t=1000ms triggers shadow update
    game.renderer.shadowMap.needsUpdate = false;
    game._lastDynamicShadowAt = 0;
    game.animate(1000);
    assert.equal(game.renderer.shadowMap.needsUpdate, true, 'initial frame updates shadow map');

    // Frame 16ms later (60 FPS cadence) is throttled (< 33.3ms)
    game.renderer.shadowMap.needsUpdate = false;
    game.animate(1016);
    assert.equal(game.renderer.shadowMap.needsUpdate, false, '60Hz intermediate frame skips shadow pass');

    // Frame at t=1035ms (>= 33.3ms, ~30Hz cadence) triggers shadow update
    game.animate(1035);
    assert.equal(game.renderer.shadowMap.needsUpdate, true, '30Hz frame updates shadow map');

    // When remote player dies/hides, one final shadow update clears the stale shadow, then stops updating
    game.renderer.shadowMap.needsUpdate = false;
    game.syncPlayersState([
      { id: 'enemy-1', name: 'Bot1', x: 4, y: 0, z: -6, yaw: 0, pitch: 0, hp: 0, alive: false, weapon: 'rifle' }
    ]);
    game.animate(1080);
    assert.equal(game.renderer.shadowMap.needsUpdate, true, 'clears stale caster shadow once on hide');
    game.renderer.shadowMap.needsUpdate = false;
    game.animate(1130);
    assert.equal(game.renderer.shadowMap.needsUpdate, false, 'no shadow pass when zero remote casters are visible');

    // Revive enemy, switch quality to medium -> castShadow becomes false and 0Hz dynamic updates
    game.syncPlayersState([
      { id: 'enemy-1', name: 'Bot1', x: 4, y: 0, z: -6, yaw: 0, pitch: 0, hp: 100, alive: true, weapon: 'rifle' }
    ]);
    game.applyQuality('medium', { persist: false });
    let remoteCastersMed = 0;
    rp.group.traverse((c) => {
      if (c.isMesh && c.castShadow) remoteCastersMed++;
    });
    assert.equal(remoteCastersMed, 0, 'medium tier disables remote player shadow casting');
    game.renderer.shadowMap.needsUpdate = false;
    game.animate(1200);
    game.animate(1260);
    assert.equal(game.renderer.shadowMap.needsUpdate, false, 'medium tier never schedules dynamic shadow passes');
  });

  it('drives second-order viewmodel springs stably, cools barrel heat, and bounces ejected brass shells', async () => {
    const game = await createTestGame3D({ qualityChoice: 'high' });
    game.inMatch = true;
    game.alive = true;
    game.isPointerLocked = true;
    game.switchWeapon('rifle');
    game.equipUntil = 0;

    game.vmSpringImpulse('kZ', 1.2);
    game.stepVmSprings(0.016);
    assert.ok(game.vmSprings.kZ.x > 0, 'spring impulse displaces viewmodel kick');

    // Remains finite and converges smoothly even across a 100ms frame hitch
    game.stepVmSprings(0.1);
    assert.ok(Number.isFinite(game.vmSprings.kZ.x));
    for (let i = 0; i < 60; i++) game.stepVmSprings(0.016);
    assert.ok(Math.abs(game.vmSprings.kZ.x) < 1e-3, 'spring settles back to rest');

    // Barrel heat rises on shots, drives glow opacity, and resets on weapon switch
    for (let i = 0; i < 6; i++) {
      game.pendingFire = null;
      game.lastShotAt = -1000;
      game.attemptShoot();
    }
    assert.ok(game.barrelHeat > 0.3, 'sustained fire builds barrel heat');
    game.updateLocalPhysics(0.016, 2000);
    const rifleVm = game.viewmodelMeshes.rifle;
    assert.ok(rifleVm.userData.barrelHeatMat.opacity > 0, 'hot barrel glows subtly');
    game.switchWeapon('pistol');
    assert.equal(game.barrelHeat, 0, 'switching weapon resets active barrel heat');
    assert.equal(rifleVm.userData.barrelHeatMesh.visible, false, 'switching weapon hides previous hot barrel mesh');

    // Respawning with the same weapon resets barrel heat and spring state
    game.equipUntil = 0;
    game.barrelHeat = 0.75;
    game.vmSpringImpulse('kZ', 1.1);
    game.spawnLocalPlayer({ x: 0, y: 0.1, z: 0, yaw: 0, weapon: 'pistol', hp: 100 });
    assert.equal(game.barrelHeat, 0, 'respawn resets barrel heat even on identical weapon');
    assert.equal(game.vmSprings.kZ.v, 0, 'respawn zeroes viewmodel spring velocity');

    // Ejected 3D brass shell bounces when hitting arena floor and never teleports upward when player jumps
    game.position.set(0, 0, 0);
    game.spawnShellCasing?.('rifle') || game.ejectShellCasing?.('rifle');
    const shell = game.activeShells.at(-1);
    shell.mesh.position.y = 0.01;
    shell.vx = 1.0;
    shell.vy = -2.5;
    shell.vz = 0.5;
    shell.createdAt = 2900;
    game.lastFrameTime = 2984;
    game.animate(3000);
    assert.ok(shell.vy > 0, 'shell rebounds upward on floor impact');
    assert.ok(shell.vx < 1.0, 'shell horizontal speed dampens on floor bounce');

    shell.mesh.position.y = 0.025;
    shell.vy = -0.2;
    game.position.y = 1.25; // Player jumps high above floor
    game.lastFrameTime = 3000;
    game.animate(3016);
    assert.ok(shell.mesh.position.y < 0.1, 'floor shell stays on world floor when player jumps');
  });

  it('prewarms Saltline physical-modeling WebAudio buffers (including 48kHz hardware hit) and Three.js shaders race-free', async () => {
    const { installAudioMock, removeAudioMock } = await import('./helpers/perf-probe.mjs');
    const { sfx } = await import('../public/js/audio.js');
    installAudioMock();
    try {
      sfx.ctx = null;
      sfx._pcmCache?.clear?.();
      const audioProgress = [];
      const count = await sfx.prewarmAudioBuffers((ratio) => audioProgress.push(ratio));
      assert.equal(count, 15, `expected 15 canonical Saltline buffers, got ${count}`);
      assert.equal(audioProgress.at(-1), 1);
      for (let i = 1; i < audioProgress.length; i++) {
        assert.ok(audioProgress[i] >= audioProgress[i - 1], 'audio prewarm progress is monotonic');
      }
      // Simulate 48kHz hardware AudioContext created after user gesture: must hit prewarmed PCM cache with 0 new syntheses
      sfx.ensureContext();
      sfx.ctx.sampleRate = 48000;
      sfx._audioBufferCache?.clear?.();
      sfx.playShot('rifle');
      sfx.playShot('sniper');
      sfx.playReload(1800, 'mag');
      assert.equal(sfx._pcmCache.size, 15, '48kHz AudioContext reuses prewarmed canonical PCM cache without re-synthesizing');
    } finally {
      sfx.flushPendingCleanups(true);
      sfx.ctx = null;
      sfx.noiseBuffer = null;
      removeAudioMock();
    }

    const game = await createTestGame3D({ qualityChoice: 'high' });
    game.switchWeapon('m4a1');
    let allVmVisibleDuringSyncCompile = false;
    let resolveAsyncCompile;
    game.renderer.isWebGLRenderer = true;
    game.renderer.compileAsync = () => {
      allVmVisibleDuringSyncCompile = Object.values(game.viewmodelMeshes).every((vm) => vm.visible === true);
      return new Promise((r) => {
        resolveAsyncCompile = r;
      });
    };
    const shaderProgress = [];
    const warmPromise = game.prewarmShaders((ratio) => shaderProgress.push(ratio));
    await new Promise((r) => setTimeout(r, 20));
    assert.equal(allVmVisibleDuringSyncCompile, true, 'all viewmodels temporarily visible during synchronous compile kickoff');
    // While async parallel compilation is still pending, hidden viewmodels are already restored and live weapon switches survive!
    assert.equal(
      Object.values(game.viewmodelMeshes).filter((vm) => vm.visible).length,
      1,
      'never leaves all 11 viewmodels stacked across async frames'
    );
    game.switchWeapon('deagle');
    resolveAsyncCompile();
    await warmPromise;
    assert.equal(shaderProgress.at(-1), 1);
    for (const [wId, vm] of Object.entries(game.viewmodelMeshes)) {
      assert.equal(vm.visible, wId === 'deagle', `viewmodel ${wId} preserves mid-prewarm weapon switch to deagle`);
    }
  });

  it('dirty-checks HUD updates, reuses fixed ammo pip DOM nodes, and toggles tactical low/empty alerts', async () => {
    function decorateDomMock(el) {
      if (!el || el._slDecorated) return el;
      el._slDecorated = true;
      const classes = new Set();
      el.dataset = el.dataset || {};
      el.style = el.style || {};
      el.children = el.children || [];
      el.classList = {
        add: (...names) => names.forEach((n) => classes.add(n)),
        remove: (...names) => names.forEach((n) => classes.delete(n)),
        toggle: (n, force) => {
          const on = force === undefined ? !classes.has(n) : Boolean(force);
          if (on) classes.add(n);
          else classes.delete(n);
          return on;
        },
        contains: (n) => classes.has(n)
      };
      el.closest = () => document.getElementById('hud-ammo-block');
      el.querySelectorAll = () => [];
      const origAppend = el.appendChild?.bind(el);
      el.appendChild = (child) => {
        decorateDomMock(child);
        child.parentNode = el;
        return origAppend ? origAppend(child) : (el.children.push(child), child);
      };
      return el;
    }

    const origGetById = document.getElementById.bind(document);
    const origCreateEl = document.createElement.bind(document);
    document.getElementById = (id) => decorateDomMock(origGetById(id));
    document.createElement = (tag) => decorateDomMock(origCreateEl(tag));
    if (!window.location.href) window.location.href = 'http://127.0.0.1:3000/';

    try {
      const { updateWeaponHud, updateHpHud } = await import('../public/js/ui/hudController.js');
      const { appState } = await import('../public/js/ui/userPrefsAndKeys.js');
      const pipsEl = document.getElementById('hud-ammo-pips');
      const alertEl = document.getElementById('hud-ammo-alert');
      const hpCardEl = document.getElementById('hud-hp-card');
      const weaponNameEl = document.getElementById('hud-weapon-name');

      updateWeaponHud('rifle', 30, 90);
      assert.equal(pipsEl.children.length, 20, 'allocates fixed 20-pip pool once');
      const firstPoolNodes = [...pipsEl.children];
      assert.equal(alertEl.classList.contains('hidden'), true, 'full mag hides tactical alert');

      // Dirty-check: mutating weaponNameEl manually and calling with identical args must early-return
      weaponNameEl.textContent = 'DIRTY_SENTINEL';
      updateWeaponHud('rifle', 30, 90);
      assert.equal(weaponNameEl.textContent, 'DIRTY_SENTINEL', 'identical HUD state skips DOM writes');

      // Low ammo triggers SẮP HẾT ĐẠN and reuses exact same pip nodes (zero DOM allocations)
      updateWeaponHud('rifle', 5, 90);
      assert.notEqual(weaponNameEl.textContent, 'DIRTY_SENTINEL');
      assert.equal(alertEl.classList.contains('hidden'), false);
      assert.equal(alertEl.textContent, 'SẮP HẾT ĐẠN');
      assert.deepEqual(pipsEl.children, firstPoolNodes, 'pip DOM nodes reused without reallocation');

      // Empty mag with reserve triggers [R] NẠP ĐẠN; total empty triggers HẾT ĐẠN; knife hides pips & alert
      updateWeaponHud('rifle', 0, 60);
      assert.equal(alertEl.textContent, '[R] NẠP ĐẠN');
      updateWeaponHud('rifle', 0, 0);
      assert.equal(alertEl.textContent, 'HẾT ĐẠN');
      updateWeaponHud('knife', 0, 0);
      assert.equal(pipsEl.classList.contains('hidden'), true);
      assert.equal(alertEl.classList.contains('hidden'), true);
      assert.ok(appState.hudCache.weaponHudSig.includes('knife'));

      // Critical HP class toggles at <= 25 HP and clears above 25 HP
      updateHpHud(20);
      assert.equal(hpCardEl.classList.contains('critical-hp'), true);
      updateHpHud(80);
      assert.equal(hpCardEl.classList.contains('critical-hp'), false);
    } finally {
      document.getElementById = origGetById;
      document.createElement = origCreateEl;
    }
  });
});

// ---------------------------------------------------------------- Saltline Round 2: unified environment, props, arsenal & operator
describe('Saltline Round 2: harbor water, wall weathering, merged decals, 3D backdrops, arsenal & unified operator model', () => {
  it('builds wall weathering shaders & merged CS:GO decals on medium/high, omits legacy harbor water & low decals, and disposes 100% cleanly', async () => {
    const { getSaltlineDecalUVRect } = await import('../public/js/arena/proceduralTextures.js');

    // Boundary & negative index wrapping for 4-quadrant decal atlas UV rects
    const q0 = getSaltlineDecalUVRect(0);
    const q3 = getSaltlineDecalUVRect(-1);
    const q1 = getSaltlineDecalUVRect(5);
    assert.deepEqual(q3, getSaltlineDecalUVRect(3), 'negative quadrant wraps cleanly to Q3');
    assert.deepEqual(q1, getSaltlineDecalUVRect(1), 'overflow quadrant wraps cleanly to Q1');
    assert.ok(q0[0] < q0[2] && q0[1] < q0[3] && q0[2] < 0.5 && q0[1] > 0.5, 'Q0 sits in top-left UV quadrant with padding');

    const game = await createTestGame3D({ qualityChoice: 'high' });
    game.loadMap('de_nuke');

    // Legacy harbor water is removed across all 6 CS:GO maps
    assert.equal(
      game.skyObjects.some((o) => o.name === 'saltlineHarborWater'),
      false,
      'CS:GO maps omit obsolete harbor ocean water plane'
    );
    assert.equal(game.harborWaterUniform, null);

    // Verify wall weathering shader injects cleanly against REAL Three.js ShaderLib.standard
    const stdLib = THREE.ShaderLib.standard;
    assert.ok(Array.isArray(game.wallWeatherMats) && game.wallWeatherMats.length > 0, 'registers vertical obstacle wallWeatherMats');
    const wallMat = game.wallWeatherMats[0];
    const wallKeyHigh = wallMat.customProgramCacheKey();
    const wallShader = {
      uniforms: {},
      vertexShader: stdLib.vertexShader,
      fragmentShader: stdLib.fragmentShader
    };
    wallMat.onBeforeCompile(wallShader);
    assert.ok(
      Math.abs(wallShader.uniforms.uSaltlineWallWeather.value - Math.min(1, QUALITY.high.wetFloorStrength * 1.15)) < 1e-6
    );
    assert.match(wallShader.vertexShader, /vSlWallWorldPos/);
    assert.match(wallShader.fragmentShader, /slRainDrip/);
    assert.match(wallShader.fragmentShader, /slSplashRough/);

    // Merged world decals exist as a single BufferGeometry mesh on high
    const decalMeshesHigh = game.arenaDecorMeshes.filter((m) => m.name === 'saltlineArenaDecals');
    assert.equal(decalMeshesHigh.length, 1, 'merges all arena stencils into 1 draw call on high');
    assert.equal(decalMeshesHigh[0].renderOrder, 1);

    // Mid-match tier switch updates wallWeatherMats uniform in-place without shader key churn
    game.inMatch = true;
    game.applyQuality('medium', { persist: false });
    assert.equal(wallMat.customProgramCacheKey(), wallKeyHigh);
    assert.ok(
      Math.abs(wallShader.uniforms.uSaltlineWallWeather.value - Math.min(1, QUALITY.medium.wetFloorStrength * 1.15)) < 1e-6
    );
    game.applyQuality('low', { persist: false });
    assert.equal(wallMat.userData._hasSaltlineWallHook, false);
    game.inMatch = false;

    // Dust II also omits coastal harbor water on high tier
    game.applyQuality('high', { persist: false });
    game.loadMap('de_dust2');
    assert.equal(
      game.skyObjects.some((o) => o.name === 'saltlineHarborWater'),
      false,
      'de_dust2 omits coastal harbor water'
    );
    assert.equal(game.harborWaterUniform, null);

    // Low tier omits merged world decals
    game.applyQuality('low', { persist: false });
    game.loadMap('de_nuke');
    assert.equal(
      game.arenaDecorMeshes.some((m) => m.name === 'saltlineArenaDecals'),
      false,
      'low tier omits world decal pass'
    );

    // Full disposal leaves zero leaked arena geometries, materials, or textures
    game.applyQuality('high', { persist: false });
    game.loadMap('de_nuke');
    assert.ok(game.arenaGeometries.size > 0 && game.arenaMaterials.size > 0 && game.arenaTextures.size > 0);
    game.disposeMapResources();
    assert.equal(game.arenaGeometries.size, 0, 'disposeMapResources clears all arenaGeometries');
    assert.equal(game.arenaMaterials.size, 0, 'disposeMapResources clears all arenaMaterials');
    assert.equal(game.arenaTextures.size, 0, 'disposeMapResources clears all arenaTextures');
    assert.equal(game.wallWeatherMats.length, 0, 'disposeMapResources clears wallWeatherMats');
    assert.equal(game.harborWaterUniform, null, 'disposeMapResources clears harborWaterUniform');
  });

  it('unifies all 4 operator variants with per-vertex PBR surface attributes, RIG.HIP_X alignment, zero bare skin, and strict shadow hygiene', async () => {
    const { RIG_MAT_CACHE, createRemotePlayerMesh, disposeObject3D } = await import('../public/js/humanoidRig.js');
    const { RIG } = await import('../shared/hitboxes.js');

    const variantColors = [
      { color: 0xe5a024, expected: 'v1_hero' },
      { color: 0xef4444, expected: 'v2_goggles' },
      { color: 0x94a3b8, expected: 'v3_ghost' },
      { color: 0x4b5320, expected: 'v4_recon' }
    ];

    for (const { color, expected } of variantColors) {
      const op = createRemotePlayerMesh({ id: `op_${expected}`, color, weapon: 'm4a1' }, { isShowcase: false });
      assert.equal(Math.abs(op.leftLeg.position.x - -RIG.HIP_X) < 1e-6, true, `${expected} leftLeg aligns with -RIG.HIP_X`);
      assert.equal(Math.abs(op.rightLeg.position.x - RIG.HIP_X) < 1e-6, true, `${expected} rightLeg aligns with +RIG.HIP_X`);

      let hasFabricVerts = false;
      let hasArmorVerts = false;
      let hasMetalVerts = false;
      let outlineCount = 0;

      op.group.traverse((obj) => {
        if (!obj.isMesh) return;
        if (obj.userData?.isOutlineHull) {
          outlineCount++;
          assert.equal(obj.userData.isOutline, true, 'outline hull is tagged isOutline=true for shadow exclusion');
          assert.equal(obj.castShadow, false);
        }
        if (obj.userData?.isHitboxProxy) {
          assert.equal(obj.userData.isHitbox, true, 'hitbox proxy is tagged isHitbox=true for shadow exclusion');
          assert.equal(obj.castShadow, false);
        }
        if (obj.material?.userData?.matSlotKey === 'rig_static_vcolor') {
          const surf = obj.geometry?.attributes?.aRigSurface;
          assert.ok(surf && surf.itemSize === 2, `${expected} batched static mesh carries vec2 aRigSurface PBR attribute`);
          for (let i = 0; i < surf.count; i++) {
            const r = surf.getX(i);
            const m = surf.getY(i);
            if (r >= 0.75 && m <= 0.12) hasFabricVerts = true;
            if (r >= 0.34 && r <= 0.56 && m >= 0.15 && m <= 0.40) hasArmorVerts = true;
            if (r <= 0.30 && m >= 0.70) hasMetalVerts = true;
          }
        }
      });

      assert.equal(outlineCount, 13, `${expected} builds all 13 bone-scope outline hulls`);
      assert.equal(hasFabricVerts, true, `${expected} encodes matte ripstop fabric PBR vertices`);
      assert.equal(hasArmorVerts, true, `${expected} encodes composite armor/leather PBR vertices`);
      assert.equal(hasMetalVerts, true, `${expected} encodes brushed gunmetal/titanium PBR vertices`);
      disposeObject3D(op.group);
    }

    // Verify rig_static_vcolor shader injects cleanly against REAL Three.js ShaderLib.standard
    const rigVColorMat = RIG_MAT_CACHE.get('rig_static_vcolor');
    const rigShader = {
      uniforms: {},
      vertexShader: THREE.ShaderLib.standard.vertexShader,
      fragmentShader: THREE.ShaderLib.standard.fragmentShader
    };
    rigVColorMat.onBeforeCompile(rigShader);
    assert.match(rigShader.vertexShader, /attribute vec2 aRigSurface;/);
    assert.match(rigShader.fragmentShader, /slSurfRough/);
    assert.match(rigShader.fragmentShader, /metalnessFactor = min\(slSurfMetal, metalness\);/);

    // Verify High-tier remote player dynamic shadow traversal never enables castShadow on outlines or hitboxes
    const game = await createTestGame3D({ qualityChoice: 'high' });
    game.localId = 'me';
    game.inMatch = true;
    game.syncPlayersState([
      { id: 'enemy-shadow-check', name: 'Bravo', color: 0xef4444, x: 3, y: 0, z: -7, hp: 100, alive: true, weapon: 'scar' }
    ]);
    const rp = game.remotePlayers.get('enemy-shadow-check');
    let bodyShadowCasters = 0;
    rp.group.traverse((obj) => {
      if (!obj.isMesh) return;
      if (obj.userData?.isOutline || obj.userData?.isHitbox) {
        assert.equal(obj.castShadow, false, `${obj.name || 'helper'} must never cast dynamic shadows on high tier`);
      } else if (obj !== rp.muzzleFlash && !obj.userData?.isMuzzleFlash) {
        if (obj.castShadow) bodyShadowCasters++;
      }
    });
    assert.ok(bodyShadowCasters >= 15, `expected >= 15 real operator/weapon meshes casting shadows on high, got ${bodyShadowCasters}`);
  });

  it('caches all 1P softshell/glove/arsenal materials in WEAPON_MAT_CACHE and equips WML lights, rollmarks & 6-fin muzzle flash', async () => {
    const { WEAPON_ORDER } = await import('../shared/constants.js');
    const { WEAPON_MAT_CACHE, createWeaponMesh } = await import('../public/js/weaponModels.js');
    const { disposeObject3D } = await import('../public/js/humanoidRig.js');

    // Warm once across all 11 first-person viewmodels, then verify zero material cache growth on subsequent builds
    for (const wId of WEAPON_ORDER) {
      const vm = createWeaponMesh(wId, true);
      disposeObject3D(vm);
    }
    const cacheSizeAfterWarm = WEAPON_MAT_CACHE.size;
    assert.equal(WEAPON_MAT_CACHE.has('shared_vm_cuff_amber'), true);
    assert.equal(WEAPON_MAT_CACHE.has('shared_vm_watch_dial'), true);
    assert.equal(WEAPON_MAT_CACHE.has('shared_saltline_rollmark'), true);

    for (const wId of WEAPON_ORDER) {
      const vm = createWeaponMesh(wId, true);
      assert.ok(vm.userData.rightHandGroup && vm.userData.leftHandGroup, `${wId} exposes 1P gloved hand groups`);
      assert.ok(vm.userData.flashMesh?.userData?.isMuzzleFlash, `${wId} exposes muzzle flash group`);
      if (wId !== 'knife') {
        assert.ok(vm.userData.flashMesh.children.length >= 6, `${wId} builds multi-fin starburst muzzle flash`);
      }
      disposeObject3D(vm);
    }
    assert.equal(WEAPON_MAT_CACHE.size, cacheSizeAfterWarm, 'rebuilding all 11 1P viewmodels allocates 0 duplicate materials');
  });

  it('includes SphereGeometry helmet crown in operator outline hulls, keeps armPivot.y=0.456 across animations, and prevents antenna head clipping', async () => {
    const {
      createRemotePlayerMesh,
      animateHumanoidRig,
      poseOperatorCryzenPoster,
      disposeObject3D
    } = await import('../public/js/humanoidRig.js');

    for (const variant of ['v1_hero', 'v2_goggles', 'v3_ghost', 'v4_recon']) {
      const rig = createRemotePlayerMesh({ id: `rig_${variant}`, color: '#38bdf8' }, { variant });
      rig.group.updateMatrixWorld(true);

      assert.equal(rig.armPivot.position.y, 0.456, `${variant} initial armPivot.y`);
      animateHumanoidRig(rig, 0.016, 1200, true, 0.2);
      assert.equal(rig.armPivot.position.y, 0.456, `${variant} animated armPivot.y matches 0.456 socket`);
      poseOperatorCryzenPoster(rig, 'rifle');
      assert.equal(rig.armPivot.position.y, 0.456, `${variant} poster armPivot.y matches 0.456 socket`);

      rig.headGroup.rotation.set(0, 0, 0);
      rig.group.updateMatrixWorld(true);
      let visMaxY = -Infinity;
      let outMaxY = -Infinity;
      rig.headGroup.traverse((c) => {
        if (!c.isMesh) return;
        const b = new THREE.Box3().setFromObject(c);
        if (c.userData?.isOutline) outMaxY = Math.max(outMaxY, b.max.y);
        else if (!c.userData?.isHitbox && !c.material?.transparent) visMaxY = Math.max(visMaxY, b.max.y);
      });
      assert.ok(outMaxY >= visMaxY + 0.005, `${variant} helmet SphereGeometry crown is covered by outline hull (${outMaxY} vs ${visMaxY})`);

      rig.headGroup.rotation.set(0.4, 0.55, 0);
      rig.group.updateMatrixWorld(true);
      const headBox = new THREE.Box3();
      rig.headGroup.traverse((c) => {
        if (c.isMesh && !c.userData?.isOutline && !c.userData?.isHitbox) headBox.expandByObject(c);
      });
      const headWorldPos = rig.headGroup.getWorldPosition(new THREE.Vector3());
      const v3 = new THREE.Vector3();
      let frontHeadClipVerts = 0;
      for (const child of rig.torsoVisualGroup.children) {
        if (child.isMesh && !child.userData?.isOutline && !child.userData?.isHitbox) {
          const pos = child.geometry.attributes.position;
          for (let i = 0; i < pos.count; i++) {
            v3.fromBufferAttribute(pos, i).applyMatrix4(child.matrixWorld);
            if (v3.y > headWorldPos.y + 0.045 && v3.z < 0.05 && headBox.containsPoint(v3)) {
              frontHeadClipVerts++;
            }
          }
        }
      }
      assert.equal(frontHeadClipVerts, 0, `${variant} front VHF antenna does not impale headGroup on pitch/yaw`);
      disposeObject3D(rig.group);
    }
  });

  it('keeps receiver rollmarks clear of solid weapon geometry with polygonOffset and batches 1P viewmodel static scopes', async () => {
    const { WEAPONS } = await import('../shared/weapons.js');
    const { createWeaponMesh, buildDetailedWeaponModel, setWeaponAdsCulling } = await import('../public/js/weaponModels.js');
    const { getSaltlineRollmarkMaterial } = await import('../public/js/weapons/weaponMaterials.js');
    const { disposeObject3D } = await import('../public/js/humanoidRig.js');

    const rollMat = getSaltlineRollmarkMaterial();
    assert.equal(rollMat.polygonOffset, true, 'rollmark decal material enables polygonOffset');

    for (const wId of ['rifle', 'm4a1', 'scar', 'smg', 'shotgun', 'sniper', 'lmg']) {
      const { group } = buildDetailedWeaponModel(wId, false);
      group.updateMatrixWorld(true);
      const rollMeshes = [];
      const solidMeshes = [];
      group.traverse((c) => {
        if (!c.isMesh) return;
        if (c.material === rollMat) rollMeshes.push(c);
        else if (!c.material?.transparent) solidMeshes.push(c);
      });
      assert.equal(rollMeshes.length, 1, `${wId} carries receiver rollmark quad`);
      const rBox = new THREE.Box3().setFromObject(rollMeshes[0]);
      let minClearance = Infinity;
      for (const sm of solidMeshes) {
        const sBox = new THREE.Box3().setFromObject(sm);
        if (
          rBox.min.y < sBox.max.y - 0.0005 &&
          rBox.max.y > sBox.min.y + 0.0005 &&
          rBox.min.z < sBox.max.z - 0.0005 &&
          rBox.max.z > sBox.min.z + 0.0005 &&
          rBox.min.x < 0
        ) {
          minClearance = Math.min(minClearance, sBox.min.x - rBox.max.x);
        }
      }
      assert.ok(minClearance >= 0.0008, `${wId} rollmark is unobstructed in front of receiver (clearance=${minClearance})`);
      disposeObject3D(group);
    }

    const raycaster = new THREE.Raycaster();
    for (const wId of Object.keys(WEAPONS)) {
      const vm = createWeaponMesh(wId, true);
      let totalMeshes = 0;
      let hipfireVisible = 0;
      vm.traverse((c) => {
        if (!c.isMesh) return;
        totalMeshes++;
        if (c.visible && (!c.parent || c.parent.visible)) hipfireVisible++;
      });
      assert.ok(totalMeshes <= 52, `${wId} static-batched 1P viewmodel keeps total meshes <= 52 (got ${totalMeshes})`);
      assert.ok(hipfireVisible <= 45, `${wId} hipfire visible 1P meshes <= 45 (got ${hipfireVisible})`);

      if (vm.userData.opticLens) {
        const adsPos = vm.userData.adsPosition || { x: 0, y: 0, z: -0.2 };
        vm.position.set(adsPos.x, adsPos.y, adsPos.z);
        setWeaponAdsCulling(vm, true);
        vm.updateMatrixWorld(true);
        const opaqueAds = [];
        vm.traverse((c) => {
          if (
            c.isMesh &&
            c.visible &&
            c !== vm.userData.opticLens &&
            c !== vm.userData.opticReticle &&
            !c.userData?.isMuzzleFlash &&
            !c.material?.transparent
          ) {
            opaqueAds.push(c);
          }
        });
        raycaster.set(new THREE.Vector3(0, 0, 0.2), new THREE.Vector3(0, 0, -1));
        assert.equal(raycaster.intersectObjects(opaqueAds, false).length, 0, `${wId} ADS sightline is unobstructed`);
      }
      disposeObject3D(vm);
    }
  });

  it('keeps world stencil decals clear of staircases/obstacles across all 6 CS:GO maps, layers bullet impacts on top, and caps Set arenaMaterials on Low', async () => {
    const { MAPS: MAP_DEFS, MAP_ORDER } = await import('../shared/maps.js');
    const { revertPbrSlots } = await import('../public/js/surfaceMaterials.js');
    const game = await createTestGame3D({ qualityChoice: 'high' });

    for (const mapId of MAP_ORDER) {
      game.loadMap(mapId);
      const decals = game.saltlineArenaDecals;
      assert.ok(decals?.geometry, `${mapId} builds merged world decal geometry on High`);
      game.spawnBulletDecal({ x: 0, y: 0, z: 0 }, { x: 0, y: 1, z: 0 });
      const bDecal = game.bulletDecals[game.bulletDecals.length - 1];
      assert.ok(
        bDecal.renderOrder > decals.renderOrder && bDecal.position.y > 0.01,
        `${mapId} bullet decals render above painted world stencils`
      );
      const pos = decals.geometry.attributes.position;
      const obsList = MAP_DEFS[mapId].obstacles;
      let buriedVerts = 0;
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i);
        const y = pos.getY(i);
        const z = pos.getZ(i);
        for (const ob of obsList) {
          if (ob.shape === 'cylinder') continue;
          const hw = ob.w * 0.5 - 0.02;
          const hd = ob.d * 0.5 - 0.02;
          const minY = ob.y - ob.h * 0.5 + 0.001;
          const maxY = ob.y + ob.h * 0.5 - 0.02;
          if (x > ob.x - hw && x < ob.x + hw && z > ob.z - hd && z < ob.z + hd && y > minY && y < maxY) {
            buriedVerts++;
            break;
          }
        }
      }
      assert.equal(buriedVerts, 0, `${mapId} has 0 world decal vertices buried inside obstacles or staircases`);
    }

    // Mid-match quality switch High -> Low -> Medium syncs environment, decal visibility, and Set arenaMaterials metalness
    game.inMatch = true;
    game.applyQuality('high', { persist: false });
    game.loadMap('de_nuke');
    assert.equal(Boolean(game.scene.environment), true);
    assert.equal(game.saltlineHarborWater, null);
    assert.equal(game.saltlineArenaDecals?.visible, true);

    game.applyQuality('low', { persist: false });
    assert.equal(game.scene.environment, null, 'mid-match Low switch clears scene.environment');
    assert.equal(game.saltlineArenaDecals?.visible, false, 'mid-match Low switch hides world decals');
    for (const m of game.arenaMaterials) {
      if (typeof m.metalness === 'number') {
        assert.ok(m.metalness <= 0.3501, `Low tier caps arenaMaterial metalness <= 0.35 (got ${m.metalness})`);
      }
    }
    revertPbrSlots(game);
    for (const s of game.pbrSlots) {
      if (typeof s.mat?.metalness === 'number') {
        assert.ok(s.mat.metalness <= 0.3501, `Low tier revertPbrSlots caps metalness <= 0.35 (got ${s.mat.metalness})`);
      }
    }

    game.applyQuality('medium', { persist: false });
    assert.equal(Boolean(game.scene.environment), true, 'mid-match Medium switch restores scene.environment');
    assert.equal(game.saltlineArenaDecals?.visible, true, 'mid-match Medium switch restores world decals');
    let restoredHighMetalCount = 0;
    for (const m of game.arenaMaterials) {
      if (typeof m.metalness === 'number' && m.metalness > 0.4) restoredHighMetalCount++;
    }
    assert.ok(restoredHighMetalCount >= 10, 'mid-match Medium switch restores full metallic PBR response on arenaMaterials');
  });
});

// ---------------------------------------------------------------- Saltline Full Overhaul (BR-01..BR-06)
describe('Saltline Full Overhaul (BR-01..BR-06, AC-01..AC-05)', () => {
  it('BR-01 / AC-01: defaults server, client boot & user prefs to Dust II (de_dust2) and migrates legacy prefs', async () => {
    const { DEFAULT_MAP_ID } = await import('../shared/maps.js');
    const { CLIENT_DEFAULT_MAP_ID, loadUserPrefs } = await import('../public/js/ui/userPrefsAndKeys.js');
    assert.equal(DEFAULT_MAP_ID, 'de_dust2', 'server fallback DEFAULT_MAP_ID is de_dust2');
    assert.equal(CLIENT_DEFAULT_MAP_ID, 'de_dust2', 'client default map ID is de_dust2');

    const prevLocalStorage = globalThis.localStorage;
    globalThis.localStorage = memStorage();
    try {
      const prefs = loadUserPrefs();
      assert.equal(prefs.selectedMap, 'de_dust2', 'fresh userPrefs defaults selectedMap to de_dust2');
    } finally {
      globalThis.localStorage = prevLocalStorage;
    }

    const { Game3D } = await loadGame3D();
    const container = { appendChild() {}, clientWidth: 1280, clientHeight: 720 };
    const prevStorage2 = globalThis.localStorage;
    globalThis.localStorage = memStorage();
    let bootGame;
    try {
      bootGame = new Game3D(container, { initialMapId: CLIENT_DEFAULT_MAP_ID });
      assert.equal(bootGame.currentMapId, 'de_dust2');
      assert.equal(bootGame.currentMapConfig?.id, 'de_dust2');
    } finally {
      globalThis.localStorage = prevStorage2;
    }

    const html = fs.readFileSync(path.join(ROOT_DIR, 'public/index.html'), 'utf8');
    const mapGridMatch = html.match(/id="lobby-map-grid"[\s\S]*?<\/div>/);
    assert.ok(mapGridMatch, '#lobby-map-grid exists in index.html');
    const firstMapBtn = mapGridMatch[0].match(/<button[^>]*class="([^"]*)"[^>]*data-map="([^"]+)"/);
    assert.ok(firstMapBtn, 'first map option found in #lobby-map-grid');
    assert.equal(firstMapBtn[2], 'de_dust2', 'de_dust2 is listed first in #lobby-map-grid');
    assert.match(firstMapBtn[1], /\bactive\b/, 'de_dust2 is marked .active on boot');
  });

  it('BR-02 / AC-02: gates Kenney cartoon .glb props behind explicit opt-in and loads 0 .glb models across Low/Medium/High by default', async () => {
    const { PROP_OVERRIDES_STORAGE_KEY, isPropOverrideEnabled } = await import('../public/js/arenaProps.js');
    assert.equal(PROP_OVERRIDES_STORAGE_KEY, 'polystrike.glbProps');
    assert.equal(isPropOverrideEnabled('', memStorage()), false);
    assert.equal(isPropOverrideEnabled('?glbProps=1', memStorage()), true);
    assert.equal(isPropOverrideEnabled('?glbProps=0', memStorage({ [PROP_OVERRIDES_STORAGE_KEY]: '1' })), false);
    assert.equal(isPropOverrideEnabled('', memStorage({ [PROP_OVERRIDES_STORAGE_KEY]: '1' })), true);

    for (const tier of TIER_ORDER) {
      const game = await createTestGame3D({ qualityChoice: tier });
      let loadModelCalls = 0;
      game.assets.loadPbrSet = async () => ({});
      game.assets.loadModel = async () => {
        loadModelCalls++;
        return null;
      };
      await game.preloadAssets();
      assert.equal(loadModelCalls, 0, `${tier}: preloadAssets loads 0 Kenney .glb models by default`);
      assert.equal(game.assets.loadedModels.size, 0, `${tier}: 0 .glb models cached in loadedModels`);
    }
  });

  it('BR-03 / BR-05: hides solid monolithic obstacle proxy boxes while keeping exact AABB raycast meshes and merged CS:GO architecture', async () => {
    const game = await createTestGame3D({ qualityChoice: 'high' });
    game.loadMap('de_nuke');
    const cfg = getMapConfig('de_nuke');
    assert.equal(game.worldMeshes.length, 1 + cfg.obstacles.length, 'floor + exact obstacle raycast proxy count');
    assert.equal(game.worldMeshes[0].visible, true, 'floor mesh remains visible');
    for (let i = 1; i < game.worldMeshes.length; i++) {
      assert.equal(
        game.worldMeshes[i].visible,
        false,
        `obstacle collision proxy [${i - 1}] (${cfg.obstacles[i - 1].type}) is hidden behind sculpted CS:GO architecture`
      );
    }
    assert.ok(game.mergedWorldMeshes.length >= 4, 'builds batched CS:GO architectural meshes & InstancedMeshes');

    // Verify clean disposal & rebuild on map switch across all 6 CS:GO maps (de_nuke -> de_dust2 -> de_nuke)
    const statsBefore = sceneStats(game);
    game.loadMap('de_dust2');
    assert.equal(game.currentMapConfig?.id, 'de_dust2');
    game.loadMap('de_nuke');
    const statsAfter = sceneStats(game);
    assert.equal(statsAfter.drawCalls, statsBefore.drawCalls, 'map switch disposes previous arena cleanly without draw-call leak');
    assert.equal(statsAfter.triangles, statsBefore.triangles, 'map switch disposes previous arena cleanly without triangle leak');
  });

  it('BR-04 / AC-04: eliminates 100% of neon weapon accent materials across all 11 weapons (1P & 3P) and preserves sculpted 4-variant operator rig', async () => {
    const { WEAPONS } = await import('../shared/weapons.js');
    const { createWeaponMesh } = await import('../public/js/weaponModels.js');
    const { createRemotePlayerMesh, disposeObject3D } = await import('../public/js/humanoidRig.js');

    const bannedNeonColors = new Set(Object.values(WEAPONS).map((w) => w.color));
    for (const wId of Object.keys(WEAPONS)) {
      for (const isFp of [true, false]) {
        const wGroup = createWeaponMesh(wId, isFp);
        wGroup.traverse((child) => {
          if (!child.isMesh || !child.material) return;
          if (child === wGroup.userData.opticLens || child === wGroup.userData.opticReticle || child.userData?.isMuzzleFlash) {
            return;
          }
          const mats = Array.isArray(child.material) ? child.material : [child.material];
          for (const mat of mats) {
            assert.equal(
              String(mat.name || '').startsWith('shared_accent_'),
              false,
              `${wId} (${isFp ? '1P' : '3P'}) contains zero shared_accent_ neon material`
            );
            if (mat.color && !mat.transparent) {
              assert.equal(
                bannedNeonColors.has(mat.color.getHex()),
                false,
                `${wId} (${isFp ? '1P' : '3P'}) mesh does not use arcade weapon color 0x${mat.color.getHex().toString(16)}`
              );
            }
          }
        });
        disposeObject3D(wGroup);
      }
    }

    for (const swatch of [0xe5a024, 0xef4444, 0x94a3b8, 0x4b5320]) {
      const rig = createRemotePlayerMesh({ id: `op_${swatch}`, color: swatch, weapon: 'rifle' }, { isShowcase: true });
      let bodyMeshes = 0;
      let vcolorMeshes = 0;
      let shadowCasters = 0;
      rig.group.traverse((c) => {
        if (!c.isMesh) return;
        if (c.castShadow) shadowCasters++;
        let p = c;
        let inGun = false;
        while (p) {
          if (p === rig.gunHolder) {
            inGun = true;
            break;
          }
          p = p.parent;
        }
        if (!inGun && !c.userData?.isOutlineHull && !c.userData?.isHitboxProxy) {
          bodyMeshes++;
          if (c.material?.userData?.matSlotKey === 'rig_static_vcolor') vcolorMeshes++;
        }
      });
      assert.equal(vcolorMeshes, 13, `swatch 0x${swatch.toString(16)} keeps 13 static vcolor body parts`);
      assert.ok(bodyMeshes <= 22, `swatch 0x${swatch.toString(16)} keeps bodyMeshes <= 22 (got ${bodyMeshes})`);
      assert.equal(shadowCasters, 0, `showcase rig has 0 shadow casters`);
      disposeObject3D(rig.group);
    }
  });

  it('BR-06 / AC-05: defaults lobby camera to unobstructed harbor vista, switches weapon/operator inspection stages cleanly, and purges all UI emojis', async () => {
    const game = await createTestGame3D({ qualityChoice: 'medium' });
    game.loadMap('de_dust2');
    assert.equal(game.lobbyCameraMode, 'harbor', 'defaults to cinematic harbor vista mode');
    assert.equal(game.lobbyShowcaseGroup.visible, false, 'harbor vista hides close-up showcase stage');

    game.animate(1000);
    assert.equal(game.lobbyShowcaseGroup.visible, false, 'animate() in harbor mode keeps showcase stage hidden');

    // Switch to gunsmith weapon inspection mode
    game.setLobbyCameraMode('weapon');
    game.animate(1050);
    assert.equal(game.lobbyShowcaseGroup.visible, true);
    assert.equal(game.lobbyWeaponInspectGroup.visible, true, 'weapon mode shows 3D gunsmith turntable');
    assert.equal(game.lobbyOperator.group.visible, false, 'weapon mode hides operator rig');
    assert.equal(game.lobbyPedestalGroup.visible, false, 'weapon mode hides operator pedestal');

    // Switch weapon while in weapon mode updates turntable cleanly with 0 shadow casters
    game.setLobbyWeapon('sniper');
    let inspectCasters = 0;
    game.lobbyWeaponInspectGroup.traverse((c) => {
      if (c.isMesh && c.castShadow) inspectCasters++;
    });
    assert.equal(inspectCasters, 0, 'lobby weapon inspect turntable casts 0 arena shadows');

    // Switch to 3D operator inspection mode
    game.setLobbyCameraMode('operator');
    game.animate(1100);
    assert.equal(game.lobbyShowcaseGroup.visible, true);
    assert.equal(game.lobbyOperator.group.visible, true, 'operator mode shows sculpted 3D operator');
    assert.equal(game.lobbyPedestalGroup.visible, true, 'operator mode shows industrial grate pedestal');
    assert.equal(game.lobbyWeaponInspectGroup.visible, false, 'operator mode hides gunsmith cradle');

    // Verify 0 Unicode decorative emojis across public/index.html, public/css/, and public/js/
    const emojiRegex = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;
    const filesToScan = [path.join(ROOT_DIR, 'public/index.html')];
    const walkDir = (dir) => {
      for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, ent.name);
        if (ent.isDirectory()) walkDir(full);
        else if (/\.(js|css|html)$/.test(ent.name)) filesToScan.push(full);
      }
    };
    walkDir(path.join(ROOT_DIR, 'public/css'));
    walkDir(path.join(ROOT_DIR, 'public/js'));
    for (const file of filesToScan) {
      const content = fs.readFileSync(file, 'utf8');
      assert.equal(
        emojiRegex.test(content),
        false,
        `${path.relative(ROOT_DIR, file)} contains zero decorative Unicode emojis`
      );
    }

    const html = fs.readFileSync(path.join(ROOT_DIR, 'public/index.html'), 'utf8');
    assert.match(html, /id="lobby-camera-modes"/);
    assert.match(html, /data-camera-mode="harbor"/);
    assert.match(html, /data-camera-mode="weapon"/);
    assert.match(html, /data-camera-mode="operator"/);
    assert.match(html, /id="lobby-tabs"/);
    assert.match(html, /id="btn-open-rooms-tab"/);
  });
});

// ---------------------------------------------------------------- Polish & 1P Knife Grip Regression Guards
describe('Visual polish, grounded props, soft ambient particles & 1P knife grip', () => {
  it('syncPickups() grounds all pickup types (crossGroup.position.y <= 0.25) with zero torus/octahedron sci-fi meshes', async () => {
    const game = await createTestGame3D({ qualityChoice: 'high' });
    const samplePickups = [
      { id: 'pk_hp', type: 'health', x: 2, y: 0, z: 2, active: true },
      { id: 'pk_ar', type: 'armor', x: -2, y: 0, z: 2, active: true },
      { id: 'pk_sp', type: 'speed', x: 2, y: 0, z: -2, active: true },
      { id: 'pk_dm', type: 'damage', x: -2, y: 0, z: -2, active: true }
    ];
    game.syncPickups(samplePickups);
    game.animate(2000);

    assert.equal(game.pickupMeshes.size, 4);
    for (const item of game.pickupMeshes.values()) {
      assert.ok(item.crossGroup.position.y <= 0.25, `${item.type} crossGroup.position.y=${item.crossGroup.position.y} must be grounded <= 0.25`);
      assert.equal(item.crossGroup.rotation.y, 0, `${item.type} pickup case does not spin`);
      assert.ok(item.holoRing.material.opacity <= 0.28, `${item.type} holoRing opacity <= 0.28`);
      assert.ok(item.holoRing.material.emissiveIntensity <= 0.25, `${item.type} holoRing emissiveIntensity <= 0.25`);
      item.group.traverse((obj) => {
        if (!obj.isMesh || !obj.geometry) return;
        assert.notEqual(obj.geometry.type, 'TorusGeometry', `${item.type} must not contain sci-fi TorusGeometry`);
        assert.notEqual(obj.geometry.type, 'OctahedronGeometry', `${item.type} must not contain sci-fi OctahedronGeometry`);
      });
    }
    game.clearPickups();
  });

  it('buildJumpPads() uses matte industrial emissive bounds (emissiveIntensity <= 0.25) across all 6 CS:GO maps', async () => {
    const game = await createTestGame3D({ qualityChoice: 'high' });
    for (const mapId of MAPS) {
      game.loadMap(mapId);
      assert.ok(game.jumpPadMeshes.length >= 2, `${mapId} builds jump pads`);
      game.animate(1500);
      for (const jp of game.jumpPadMeshes) {
        assert.ok(jp.ringMat1.opacity <= 0.15, `${mapId} jump pad mist ring opacity <= 0.15`);
        let checkedMatteEmissive = false;
        jp.group.traverse((obj) => {
          if (!obj.isMesh || !obj.material) return;
          const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
          for (const mat of mats) {
            const hasEmissiveColor = Boolean(mat.emissive && mat.emissive.getHex() !== 0);
            if (hasEmissiveColor) {
              checkedMatteEmissive = true;
              assert.ok(
                mat.emissiveIntensity <= 0.25,
                `${mapId} jump pad material emissiveIntensity ${mat.emissiveIntensity} exceeds 0.25`
              );
            }
          }
        });
        assert.equal(checkedMatteEmissive, true, `${mapId} jump pad has matte recessed emissive grate well`);
      }
    }
    game.disposeMapResources();
  });

  it('ambientParticles preserves QUALITY[tier].ambientParticles vertex count and uses soft alpha config (alphaTest > 0, depthWrite === false)', async () => {
    const { createSoftParticleTexture } = await import('../public/js/arena/skyAtmosphere.js');
    const origDoc = globalThis.document;
    try {
      globalThis.document = undefined;
      assert.equal(createSoftParticleTexture(null), null, 'createSoftParticleTexture is null-safe without document');
    } finally {
      globalThis.document = origDoc;
    }

    for (const tier of TIER_ORDER) {
      const game = await createTestGame3D({ qualityChoice: tier });
      for (const mapId of ['de_dust2', 'fy_iceworld', 'de_nuke']) {
        game.loadMap(mapId);
        const expected = QUALITY[tier].ambientParticles;
        if (expected === 0) {
          assert.equal(game.ambientParticles, null, `${tier}/${mapId} omits ambientParticles when budget is 0`);
        } else {
          assert.ok(game.ambientParticles?.isPoints, `${tier}/${mapId} builds THREE.Points ambientParticles`);
          assert.equal(game.ambientParticles.geometry.attributes.position.count, expected, `${tier}/${mapId} exact particle count`);
          assert.ok(game.ambientParticles.material.alphaTest > 0, `${tier}/${mapId} soft particle alphaTest > 0`);
          assert.equal(game.ambientParticles.material.depthWrite, false, `${tier}/${mapId} soft particle depthWrite === false`);
          assert.equal(game.ambientParticles.material.transparent, true, `${tier}/${mapId} soft particle transparent === true`);
          assert.ok(Boolean(game.ambientParticles.material.map), `${tier}/${mapId} binds soft radial particle texture`);
        }
      }
      game.disposeMapResources();
    }
  });

  it('FPS_ARMS_WEAPON_PRESETS.knife has useRiggedKnifeFist: true and non-vertical angled combat grip orientation', async () => {
    const { FPS_ARMS_WEAPON_PRESETS } = await import('../public/js/weapons/fpsArmsRig.js');
    const { CS2_WEAPON_SPECS } = await import('../public/js/weapons/cs2WeaponGlb.js');
    const knifePreset = FPS_ARMS_WEAPON_PRESETS.knife;
    const knifePose = CS2_WEAPON_SPECS.knife?.pose;

    assert.equal(knifePreset.useRiggedKnifeFist, true);
    assert.equal(knifePreset.anchorKind, 'rigged_knife');
    assert.equal(knifePreset.knifeLocalRot.length, 3);
    assert.ok(knifePose && Array.isArray(knifePose.hip?.rot), 'CS2_WEAPON_SPECS.knife defines hip pose rotation');

    // Transform the knife blade forward axis (0, 0, -1) by local grip + hip pose rotations and assert angled forward stance (non-vertical)
    const bladeDir = new THREE.Vector3(0, 0, -1)
      .applyEuler(new THREE.Euler(...knifePreset.knifeLocalRot, 'XYZ'))
      .applyEuler(new THREE.Euler(...knifePose.hip.rot, 'XYZ'))
      .normalize();

    assert.ok(bladeDir.y < 0.85, `knife blade must not point straight vertical (dir.y=${bladeDir.y.toFixed(3)})`);
    assert.ok(bladeDir.z < -0.35, `knife blade must angle forward toward target (dir.z=${bladeDir.z.toFixed(3)})`);
    assert.ok(Math.abs(bladeDir.x) > 0.15, `knife blade must angle inward/horizontally (dir.x=${bladeDir.x.toFixed(3)})`);
    assert.ok(Math.abs(knifePreset.knifeLocalRot[0] - Math.PI / 2) > 0.25, 'knifeLocalRot pitch is not straight vertical 90 deg');
    assert.ok(Math.abs(knifePreset.knifeLocalRot[2]) > 0.1, 'knifeLocalRot includes roll to expose blade bevel');
  });
});




