/**
 * Multi-Map Configuration & Geometry Definitions
 * Shared between Server (physics/spawns/validation) and Client (Three.js Arena & Minimap).
 *
 * Pure CS:GO / CS2 Wingman & Retake Map Roster:
 * - de_dust2 (Default)
 * - de_mirage
 * - de_inferno
 * - de_nuke
 * - fy_iceworld
 * - aim_map
 */

import {
  createStairs,
  createPerimeterWalls,
  createDoubleDoors,
  createBoostPair,
  precomputeObstacleAABBs,
  getCalloutAt
} from './maps/helpers.js';
import { DE_DUST2_MAP } from './maps/deDust2.js';
import { DE_MIRAGE_MAP } from './maps/deMirage.js';
import { DE_INFERNO_MAP } from './maps/deInferno.js';
import { DE_NUKE_MAP } from './maps/deNuke.js';
import { FY_ICEWORLD_MAP } from './maps/fyIceworld.js';
import { AIM_MAP_MAP } from './maps/aimMap.js';

export const MAPS = {
  de_dust2: DE_DUST2_MAP,
  de_mirage: DE_MIRAGE_MAP,
  de_inferno: DE_INFERNO_MAP,
  de_nuke: DE_NUKE_MAP,
  fy_iceworld: FY_ICEWORLD_MAP,
  aim_map: AIM_MAP_MAP
};

// Precompute AABB bounds (`minX`, `maxX`, `minY`, `maxY`, `minZ`, `maxZ`) on every obstacle
// at module load time so server/client physics & raycasting run with zero per-tick allocations.
for (const map of Object.values(MAPS)) {
  precomputeObstacleAABBs(map.obstacles);
  if (!map.healthPackSpawns) {
    map.healthPackSpawns = map.healthPacks;
  }
}

export const MAP_ORDER = [
  'de_dust2',
  'de_mirage',
  'de_inferno',
  'de_nuke',
  'fy_iceworld',
  'aim_map'
];

export const DEFAULT_MAP_ID = 'de_dust2';

export const LEGACY_MAP_ALIASES = Object.freeze({
  desert_outpost: 'de_dust2',
  arena_duel: 'aim_map'
});

/**
 * Resolves a raw map identifier into a canonical CS:GO map ID in `MAPS`.
 * Maps legacy aliases (`desert_outpost` -> `de_dust2`, `arena_duel` -> `aim_map`)
 * and safely falls back to `DEFAULT_MAP_ID` (`de_dust2`) for removed/unknown/invalid values.
 */
export function resolveMapId(raw) {
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (Object.prototype.hasOwnProperty.call(MAPS, trimmed)) {
      return trimmed;
    }
    if (Object.prototype.hasOwnProperty.call(LEGACY_MAP_ALIASES, trimmed)) {
      return LEGACY_MAP_ALIASES[trimmed];
    }
  }
  return DEFAULT_MAP_ID;
}

export function getMapConfig(mapId) {
  return MAPS[resolveMapId(mapId)];
}

// Backward-compatible default exports (Dust II)
export const HEALTH_PACK_SPAWNS = MAPS[DEFAULT_MAP_ID].healthPacks;
export const SPAWN_POINTS = MAPS[DEFAULT_MAP_ID].spawnPoints;
export const MAP_OBSTACLES = MAPS[DEFAULT_MAP_ID].obstacles;

export {
  DE_DUST2_MAP as DE_DUST2,
  DE_MIRAGE_MAP as DE_MIRAGE,
  DE_INFERNO_MAP as DE_INFERNO,
  DE_NUKE_MAP as DE_NUKE,
  FY_ICEWORLD_MAP as FY_ICEWORLD,
  AIM_MAP_MAP as AIM_MAP,
  createStairs,
  createPerimeterWalls,
  createDoubleDoors,
  createBoostPair,
  precomputeObstacleAABBs,
  getCalloutAt
};
