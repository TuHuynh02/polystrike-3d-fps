/**
 * Multi-Map Configuration & Geometry Definitions
 * Shared between Server (physics/spawns/validation) and Client (Three.js Arena & Minimap).
 *
 * Tactical layouts inspired by CrossFire (Tàu Chở Hàng, Kim Tự Tháp),
 * CS:GO (Dust II, Mirage, Nuke), and Valorant (Ascent, Haven, Icebox, Split, Bind).
 */

import {
    createStairs,
    createPerimeterWalls,
    createDoubleDoors,
    createBoostPair,
    precomputeObstacleAABBs,
    getCalloutAt,
} from './maps/helpers.js';
import { CYBER_CITADEL_MAP } from './maps/cyberCitadel.js';
import { CARGO_DOCK_MAP } from './maps/cargoDock.js';
import { DESERT_OUTPOST_MAP } from './maps/desertOutpost.js';
import { NEON_LAB_MAP } from './maps/neonLab.js';
import { CROSSFIRE_PLUS_MAP } from './maps/crossfirePlus.js';
import { FY_ICEWORLD_MAP } from './maps/fyIceworld.js';
import { KILLHOUSE_CQB_MAP } from './maps/killhouseCqb.js';
import { ARENA_DUEL_MAP } from './maps/arenaDuel.js';

export const MAPS = {
    cyber_citadel: CYBER_CITADEL_MAP,
    cargo_dock: CARGO_DOCK_MAP,
    desert_outpost: DESERT_OUTPOST_MAP,
    neon_lab: NEON_LAB_MAP,
    crossfire_plus: CROSSFIRE_PLUS_MAP,
    fy_iceworld: FY_ICEWORLD_MAP,
    killhouse_cqb: KILLHOUSE_CQB_MAP,
    arena_duel: ARENA_DUEL_MAP,
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
    'cyber_citadel',
    'cargo_dock',
    'desert_outpost',
    'neon_lab',
    'crossfire_plus',
    'fy_iceworld',
    'killhouse_cqb',
    'arena_duel',
];
export const DEFAULT_MAP_ID = 'cyber_citadel';

export function getMapConfig(mapId) {
    if (typeof mapId === 'string' && Object.prototype.hasOwnProperty.call(MAPS, mapId)) {
        return MAPS[mapId];
    }
    return MAPS[DEFAULT_MAP_ID];
}

// Backward-compatible default exports (Cyber Citadel)
export const HEALTH_PACK_SPAWNS = MAPS[DEFAULT_MAP_ID].healthPacks;
export const SPAWN_POINTS = MAPS[DEFAULT_MAP_ID].spawnPoints;
export const MAP_OBSTACLES = MAPS[DEFAULT_MAP_ID].obstacles;

export {
    CYBER_CITADEL_MAP as CYBER_CITADEL,
    CARGO_DOCK_MAP as CARGO_DOCK,
    DESERT_OUTPOST_MAP as DESERT_OUTPOST,
    NEON_LAB_MAP as NEON_LAB,
    CROSSFIRE_PLUS_MAP as CROSSFIRE_PLUS,
    FY_ICEWORLD_MAP as FY_ICEWORLD,
    KILLHOUSE_CQB_MAP as KILLHOUSE_CQB,
    ARENA_DUEL_MAP as ARENA_DUEL,
    createStairs,
    createPerimeterWalls,
    createDoubleDoors,
    createBoostPair,
    precomputeObstacleAABBs,
    getCalloutAt,
};
