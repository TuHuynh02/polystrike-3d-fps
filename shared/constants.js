// Barrel re-export for shared configuration, weapons, maps, and physics helpers
// Modularized into:
// - ./config.js   (MATCH_CONFIG, PLAYER_COLORS)
// - ./weapons.js  (WEAPONS, PRIMARY_WEAPONS, SECONDARY_WEAPONS, MELEE_WEAPONS, DEFAULT_LOADOUT, WEAPON_ORDER)
// - ./maps.js     (MAPS, MAP_ORDER, DEFAULT_MAP_ID, getMapConfig, HEALTH_PACK_SPAWNS, SPAWN_POINTS, MAP_OBSTACLES)
// - ./physics.js  (isPointClearOfObstacles, rayIntersectsAABB, hasLineOfSight)

export * from './config.js';
export * from './weapons.js';
export * from './maps.js';
export * from './physics.js';
