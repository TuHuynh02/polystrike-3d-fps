import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  MAPS,
  MAP_ORDER,
  DEFAULT_MAP_ID,
  LEGACY_MAP_ALIASES,
  resolveMapId,
  getMapConfig,
  getCalloutAt,
  isPointClearOfObstacles
} from '../shared/constants.js';
import { sanitizeMapId } from '../server/room/sanitizers.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');

const CANONICAL_CSGO_MAPS = [
  'de_dust2',
  'de_mirage',
  'de_inferno',
  'de_nuke',
  'fy_iceworld',
  'aim_map'
];

const DELETED_LEGACY_IDS = [
  'cargo_dock',
  'cyber_citadel',
  'neon_lab',
  'crossfire_plus',
  'killhouse_cqb'
];

const DELETED_LEGACY_FILES = [
  'shared/maps/cargoDock.js',
  'shared/maps/cyberCitadel.js',
  'shared/maps/neonLab.js',
  'shared/maps/crossfirePlus.js',
  'shared/maps/killhouseCqb.js',
  'shared/maps/desertOutpost.js',
  'shared/maps/arenaDuel.js'
];

describe('CS:GO 6-Map Wingman/Retake Overhaul & Legacy Removal (SPEC-csgo-maps-overhaul)', () => {
  it('AC-01 / AC-02: exposes strictly the 6 canonical CS:GO maps and deletes all legacy map files', () => {
    assert.deepEqual(MAP_ORDER, CANONICAL_CSGO_MAPS);
    assert.deepEqual(Object.keys(MAPS), CANONICAL_CSGO_MAPS);
    assert.equal(DEFAULT_MAP_ID, 'de_dust2');

    for (const removedId of [...DELETED_LEGACY_IDS, 'desert_outpost', 'arena_duel']) {
      assert.equal(Object.prototype.hasOwnProperty.call(MAPS, removedId), false, `${removedId} must not exist in MAPS`);
      assert.equal(MAP_ORDER.includes(removedId), false, `${removedId} must not exist in MAP_ORDER`);
    }

    for (const relPath of DELETED_LEGACY_FILES) {
      assert.equal(
        fs.existsSync(path.join(ROOT_DIR, relPath)),
        false,
        `Deleted legacy map file ${relPath} must not exist on disk`
      );
    }
  });

  it('AC-03: resolves legacy aliases and safely falls back removed/unknown/prototype map IDs to de_dust2', () => {
    assert.deepEqual(LEGACY_MAP_ALIASES, {
      desert_outpost: 'de_dust2',
      arena_duel: 'aim_map'
    });

    for (const id of CANONICAL_CSGO_MAPS) {
      assert.equal(resolveMapId(id), id);
      assert.equal(sanitizeMapId(id), id);
      assert.equal(getMapConfig(id).id, id);
    }

    // Legacy aliases
    assert.equal(resolveMapId('desert_outpost'), 'de_dust2');
    assert.equal(sanitizeMapId('desert_outpost'), 'de_dust2');
    assert.equal(getMapConfig('desert_outpost').id, 'de_dust2');

    assert.equal(resolveMapId('arena_duel'), 'aim_map');
    assert.equal(sanitizeMapId('arena_duel'), 'aim_map');
    assert.equal(getMapConfig('arena_duel').id, 'aim_map');

    // Removed legacy maps, unknown IDs, non-strings, and prototype keys -> de_dust2
    for (const bad of [...DELETED_LEGACY_IDS, '', 'unknown_map', null, undefined, 123, 'constructor', '__proto__', 'toString']) {
      assert.equal(resolveMapId(bad), 'de_dust2', `resolveMapId(${String(bad)}) must fall back to de_dust2`);
      assert.equal(sanitizeMapId(bad), 'de_dust2', `sanitizeMapId(${String(bad)}) must fall back to de_dust2`);
      assert.equal(getMapConfig(bad).id, 'de_dust2', `getMapConfig(${String(bad)}) must fall back to de_dust2`);
    }
  });

  for (const mapId of CANONICAL_CSGO_MAPS) {
    it(`AC-04 [${mapId}]: meets Wingman/Retake bounds, spawn clearance (>= 0.85m), stairs (stepH <= 0.48m), cover & entity bounds`, () => {
      const cfg = getMapConfig(mapId);
      const hs = cfg.arenaHalfSize;

      // Metadata & compact Wingman/Retake bounds [30..38]
      assert.equal(cfg.id, mapId);
      assert.ok(typeof cfg.name === 'string' && cfg.name.length > 0);
      assert.ok(typeof cfg.subtitle === 'string' && cfg.subtitle.length > 0);
      assert.ok(typeof cfg.badge === 'string' && cfg.badge.length > 0);
      assert.ok(typeof cfg.inspiration === 'string' && cfg.inspiration.length > 0);
      assert.ok(typeof cfg.layoutType === 'string' && cfg.layoutType.length > 0);
      assert.ok(hs >= 30 && hs <= 38, `${mapId} arenaHalfSize ${hs} must be within [30, 38]`);

      // Callouts >= 8 (>= 6 spec minimum) and resolvable via getCalloutAt
      assert.ok(Array.isArray(cfg.callouts) && cfg.callouts.length >= 8, `${mapId} must define >= 8 CS:GO callouts`);
      for (const c of cfg.callouts) {
        const hit = getCalloutAt(cfg, c.x, c.z);
        assert.ok(hit && typeof hit.name === 'string', `${mapId} callout ${c.id} must resolve at (${c.x}, ${c.z})`);
      }

      // Precomputed AABBs valid + zero unintentional interior overlaps
      for (const obs of cfg.obstacles) {
        assert.ok(obs.minX < obs.maxX && obs.minY < obs.maxY && obs.minZ < obs.maxZ, `${mapId} obstacle AABB invalid`);
      }
      const interior = cfg.obstacles.slice(4);
      for (let i = 0; i < interior.length; i++) {
        for (let j = i + 1; j < interior.length; j++) {
          const a = interior[i];
          const b = interior[j];
          const ox = Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX);
          const oy = Math.min(a.maxY, b.maxY) - Math.max(a.minY, b.minY);
          const oz = Math.min(a.maxZ, b.maxZ) - Math.max(a.minZ, b.minZ);
          assert.ok(
            !(ox > 0.05 && oy > 0.05 && oz > 0.05),
            `${mapId} interior obstacle overlap between #${i} (${a.type}@${a.x},${a.z}) and #${j} (${b.type}@${b.x},${b.z})`
          );
        }
      }

      // Tactical geometry invariants: platforms, stairs (stepH <= 0.48), wallbangable cover, boost crates
      assert.ok(cfg.obstacles.filter((o) => o.type === 'platform' && o.h >= 2.0).length >= 3, `${mapId} needs >= 3 elevated platforms`);
      assert.ok(cfg.obstacles.filter((o) => o.type === 'crate' && o.h >= 1.0 && o.h <= 1.25).length >= 2, `${mapId} needs >= 2 skill-jump boost crates`);
      assert.ok(cfg.obstacles.filter((o) => Math.min(o.w, o.d) <= 0.72).length >= 2, `${mapId} needs >= 2 thin wallbangable cover pieces`);

      const steps = cfg.obstacles.filter((o) => o.type === 'step');
      assert.ok(steps.length >= 16, `${mapId} needs >= 16 stepped ramp boxes`);
      let prevStepH = 0;
      for (const obs of cfg.obstacles) {
        if (obs.type !== 'step') {
          prevStepH = 0;
          continue;
        }
        const deltaH = obs.h < prevStepH || prevStepH === 0 ? obs.h : obs.h - prevStepH;
        assert.ok(
          deltaH > 0 && deltaH <= 0.4801,
          `${mapId} stair stepH ${deltaH.toFixed(3)}m exceeds 0.48m at (${obs.x}, ${obs.z})`
        );
        prevStepH = obs.h;
      }

      // Spawns: >= 12 FFA, >= 6 Alpha (-Z) and >= 6 Bravo (+Z), clear >= 0.85m & pairwise non-overlapping
      assert.ok(cfg.spawnPoints.length >= 12, `${mapId} must have >= 12 FFA spawns`);
      assert.ok((cfg.teamSpawns?.alpha?.length || 0) >= 6, `${mapId} must have >= 6 Alpha spawns`);
      assert.ok((cfg.teamSpawns?.bravo?.length || 0) >= 6, `${mapId} must have >= 6 Bravo spawns`);

      const spawnGroups = [
        ['FFA', cfg.spawnPoints],
        ['Alpha', cfg.teamSpawns.alpha],
        ['Bravo', cfg.teamSpawns.bravo]
      ];
      for (const [label, list] of spawnGroups) {
        for (let i = 0; i < list.length; i++) {
          const sp = list[i];
          assert.ok(
            Math.abs(sp.x) <= hs - 1.5 && Math.abs(sp.z) <= hs - 1.5,
            `${mapId} ${label} spawn #${i} (${sp.x}, ${sp.z}) outside bounds ±${hs - 1.5}`
          );
          assert.equal(
            isPointClearOfObstacles(sp.x, sp.z, 0.85, cfg.obstacles, sp.y || 0.1),
            true,
            `${mapId} ${label} spawn #${i} (${sp.x}, ${sp.z}) violates 0.85m obstacle clearance`
          );
          for (let j = i + 1; j < list.length; j++) {
            const dist = Math.hypot(sp.x - list[j].x, sp.z - list[j].z);
            assert.ok(dist >= 2.0, `${mapId} ${label} spawns #${i} and #${j} overlap (${dist.toFixed(2)}m < 2.0m)`);
          }
        }
      }
      for (const sp of cfg.teamSpawns.alpha) assert.ok(sp.z < 0, `${mapId} Alpha spawn must be on -Z side`);
      for (const sp of cfg.teamSpawns.bravo) assert.ok(sp.z > 0, `${mapId} Bravo spawn must be on +Z side`);

      // Health packs, powerups, jumpPads & barrels inside ±(arenaHalfSize - 2) and unobstructed
      const entityGroups = [
        ['healthPacks', cfg.healthPacks, 0.45],
        ['powerups', cfg.powerups, 0.45],
        ['jumpPads', cfg.jumpPads, 0.75],
        ['barrels', cfg.barrels, 0.55]
      ];
      assert.ok(cfg.healthPacks.length >= 4, `${mapId} needs >= 4 health packs`);
      assert.ok(cfg.powerups.length >= 2, `${mapId} needs >= 2 powerups`);
      assert.ok(cfg.jumpPads.length >= 2, `${mapId} needs >= 2 jumpPads`);
      assert.ok(cfg.barrels.length >= 4, `${mapId} needs >= 4 explosive barrels`);

      for (const [label, list, clearance] of entityGroups) {
        for (const item of list) {
          assert.ok(
            Math.abs(item.x) <= hs - 2 && Math.abs(item.z) <= hs - 2,
            `${mapId} ${label} ${item.id} (${item.x}, ${item.z}) outside ±${hs - 2}`
          );
          assert.equal(
            isPointClearOfObstacles(item.x, item.z, clearance, cfg.obstacles, (item.y || 0) + 0.15),
            true,
            `${mapId} ${label} ${item.id} (${item.x}, ${item.y || 0}, ${item.z}) is obstructed`
          );
          if ((item.y || 0) > 0.2) {
            const restingOnPlatform = cfg.obstacles.some(
              (o) =>
                o.type === 'platform' &&
                Math.abs(o.maxY - item.y) < 0.05 &&
                item.x >= o.minX + 0.3 &&
                item.x <= o.maxX - 0.3 &&
                item.z >= o.minZ + 0.3 &&
                item.z <= o.maxZ - 0.3
            );
            assert.equal(restingOnPlatform, true, `${mapId} elevated ${label} ${item.id} at y=${item.y} must rest on a platform`);
          }
        }
      }
    });
  }

  it('verifies iconic CS:GO signature landmarks on all 6 maps', () => {
    const dust2 = getMapConfig('de_dust2');
    assert.equal(dust2.arenaHalfSize, 38);
    assert.ok(dust2.obstacles.some((o) => o.type === 'container' && o.color === 0x0284c7), 'de_dust2 has Long A Blue Container (0x0284c7)');

    const mirage = getMapConfig('de_mirage');
    assert.equal(mirage.arenaHalfSize, 38);
    assert.ok(mirage.callouts.some((c) => c.id === 'palace') && mirage.callouts.some((c) => c.id === 'window'), 'de_mirage has Palace & Mid Window callouts');

    const inferno = getMapConfig('de_inferno');
    assert.equal(inferno.arenaHalfSize, 36);
    assert.ok(inferno.obstacles.some((o) => o.type === 'platform' && o.x === 0 && o.h < 1.2), 'de_inferno has B-Site central Fountain basin');

    const nuke = getMapConfig('de_nuke');
    assert.equal(nuke.arenaHalfSize, 38);
    assert.ok(nuke.obstacles.some((o) => o.type === 'container' && o.color === 0xdc2626), 'de_nuke has Outside Red Container (0xdc2626)');
    assert.ok(nuke.obstacles.some((o) => o.type === 'container' && o.color === 0x0284c7), 'de_nuke has Outside Blue Box (0x0284c7)');
    assert.ok(nuke.obstacles.filter((o) => o.type === 'pillar' && o.w >= 4.0).length >= 2, 'de_nuke has Twin Reactor Silos');

    const ice = getMapConfig('fy_iceworld');
    assert.equal(ice.arenaHalfSize, 32);
    assert.equal(ice.obstacles.filter((o) => o.type === 'wall' && o.w === 8 && o.d === 8).length, 4, 'fy_iceworld has 4 symmetric glacier monoliths');

    const aim = getMapConfig('aim_map');
    assert.equal(aim.arenaHalfSize, 30);
    assert.ok(aim.obstacles.some((o) => o.type === 'platform' && o.x === 0 && o.z === 0 && o.h === 2.0), 'aim_map has central 2.0m tactical bridge');
    assert.ok(aim.obstacles.some((o) => o.type === 'wall' && o.color === 0x991b1b), 'aim_map has red-brick peek walls');
  });
});
