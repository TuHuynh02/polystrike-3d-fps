import {
    createStairs,
    createPerimeterWalls,
    createBoostPair,
} from './helpers.js';

function buildCrossfirePlusObstacles() {
    const obs = [
        ...createPerimeterWalls(38, 0x334155),

        // === CENTRAL CROSSROADS BUNKER & RADAR PILLAR (Half-Life Crossfire / CF Ngã Tư Tử Thần) ===
        { x: 0, y: 2.2, z: 0, w: 3.4, h: 4.4, d: 3.4, color: 0xf97316, type: 'pillar' },
        { x: -6.5, y: 0.9, z: -6.5, w: 2.2, h: 1.8, d: 2.2, color: 0xd97706, type: 'crate' },
        { x: 6.5, y: 0.9, z: -6.5, w: 2.2, h: 1.8, d: 2.2, color: 0xd97706, type: 'crate' },
        { x: -6.5, y: 0.9, z: 6.5, w: 2.2, h: 1.8, d: 2.2, color: 0xd97706, type: 'crate' },
        { x: 6.5, y: 0.9, z: 6.5, w: 2.2, h: 1.8, d: 2.2, color: 0xd97706, type: 'crate' },

        // Thin wallbangable steel-wood shields around the central intersection (min(w,d) = 0.66m <= 0.72m)
        { x: 0, y: 1.0, z: -9.5, w: 4.2, h: 2.0, d: 0.66, color: 0xb45309, type: 'wall' },
        { x: 0, y: 1.0, z: 9.5, w: 4.2, h: 2.0, d: 0.66, color: 0xb45309, type: 'wall' },
        { x: -9.5, y: 1.0, z: 0, w: 0.66, h: 2.0, d: 4.2, color: 0xb45309, type: 'wall' },
        { x: 9.5, y: 1.0, z: 0, w: 0.66, h: 2.0, d: 4.2, color: 0xb45309, type: 'wall' },

        // === NORTH & SOUTH SNIPER DECKS (Elevated 2.0m platforms at ends of N/S arms) ===
        { x: 0, y: 1.0, z: -26, w: 12, h: 2.0, d: 6, color: 0x475569, type: 'platform' },
        ...createStairs(-8.0, -26, 3.2, 1.0, 1, 0, 4, 0.5, 0x64748b),
        ...createStairs(8.0, -26, 3.2, 1.0, -1, 0, 4, 0.5, 0x64748b),
        { x: -3.2, y: 2.6, z: -23.3, w: 3.2, h: 1.2, d: 0.68, color: 0xf97316, type: 'wall' },
        { x: 3.2, y: 2.6, z: -23.3, w: 3.2, h: 1.2, d: 0.68, color: 0xf97316, type: 'wall' },

        { x: 0, y: 1.0, z: 26, w: 12, h: 2.0, d: 6, color: 0x475569, type: 'platform' },
        ...createStairs(-8.0, 26, 3.2, 1.0, 1, 0, 4, 0.5, 0x64748b),
        ...createStairs(8.0, 26, 3.2, 1.0, -1, 0, 4, 0.5, 0x64748b),
        { x: -3.2, y: 2.6, z: 23.3, w: 3.2, h: 1.2, d: 0.68, color: 0xf97316, type: 'wall' },
        { x: 3.2, y: 2.6, z: 23.3, w: 3.2, h: 1.2, d: 0.68, color: 0xf97316, type: 'wall' },

        // === WEST & EAST BUNKER PLATFORMS (Elevated 2.0m platforms in W/E arms) ===
        { x: -26, y: 1.0, z: 0, w: 6, h: 2.0, d: 12, color: 0x475569, type: 'platform' },
        ...createStairs(-26, -8.0, 3.2, 1.0, 0, 1, 4, 0.5, 0x64748b),
        ...createStairs(-26, 8.0, 3.2, 1.0, 0, -1, 4, 0.5, 0x64748b),

        { x: 26, y: 1.0, z: 0, w: 6, h: 2.0, d: 12, color: 0x475569, type: 'platform' },
        ...createStairs(26, -8.0, 3.2, 1.0, 0, 1, 4, 0.5, 0x64748b),
        ...createStairs(26, 8.0, 3.2, 1.0, 0, -1, 4, 0.5, 0x64748b),
    ];

    // === 4 CORNER BLOCKERS FORMING THE '+' CROSS-SHAPED ARENA & FLANK COVERS ===
    for (const sx of [-1, 1]) {
        for (const sz of [-1, 1]) {
            obs.push(
                // Corner bastion walls carving out the classic '+' Crossfire silhouette
                { x: sx * 22, y: 2.25, z: sz * 15, w: 14, h: 4.5, d: 1.8, color: 0x1e293b, type: 'wall' },
                { x: sx * 15, y: 2.25, z: sz * 22, w: 1.8, h: 4.5, d: 14, color: 0x1e293b, type: 'wall' },
                // Corner shipping container inside bastion pocket
                { x: sx * 24, y: 1.6, z: sz * 24, w: 4.0, h: 3.2, d: 6.0, color: 0x0284c7, type: 'container' },
                // Skill-boost crate pair at each cross corner (h=1.1m and h=2.2m)
                ...createBoostPair(sx * 12.5, sz * 12.5, 0, -sz * 2.0, 0xf59e0b, 0xea580c, 0)
            );
        }
    }

    return obs;
}

export const CROSSFIRE_PLUS_OBSTACLES = buildCrossfirePlusObstacles();

const CROSSFIRE_PLUS_HEALTH_PACKS = [
    { id: 'hp_n_deck', x: 0, y: 2.0, z: -26 },
    { id: 'hp_s_deck', x: 0, y: 2.0, z: 26 },
    { id: 'hp_w_deck', x: -26, y: 2.0, z: 0 },
    { id: 'hp_e_deck', x: 26, y: 2.0, z: 0 },
];

export const CROSSFIRE_PLUS_MAP = {
    id: 'crossfire_plus',
    name: 'CROSSFIRE PLUS (+)',
    subtitle: '76x76m • Ngã Tư Tử Thần / HL Crossfire: Đấu trường chữ thập (+) CQB tốc độ cao cho 3-4 người',
    badge: '76x76m • Compact CQB Cross (+)',
    inspiration: 'Half-Life Crossfire / CrossFire Ngã Tư Tử Thần',
    layoutType: 'Symmetric Plus (+) CQB Crossroads & 4 Sniper Decks',
    arenaHalfSize: 38,
    theme: {
        skyTop: '#0c1322',
        skyMid: '#1e293b',
        skyHorizon: '#475569',
        fogColor: 0x1e293b,
        fogDensity: 0.0042,
        floorBase: '#1e2430',
        floorAlt: '#2b3445',
        gridStroke: 'rgba(249, 115, 22, 0.25)',
        accentHex: 0xf97316,
        secondaryHex: 0x38bdf8,
    },
    callouts: [
        { id: 'center_cross', name: 'CENTRAL CROSSROADS', shortName: 'CROSS', x: 0, z: 0, radius: 9 },
        { id: 'north_arm', name: 'NORTH SNIPER DECK', shortName: 'N-DECK', x: 0, z: -26, radius: 9 },
        { id: 'south_arm', name: 'SOUTH SNIPER DECK', shortName: 'S-DECK', x: 0, z: 26, radius: 9 },
        { id: 'west_arm', name: 'WEST BUNKER ARM', shortName: 'W-ARM', x: -26, z: 0, radius: 9 },
        { id: 'east_arm', name: 'EAST BUNKER ARM', shortName: 'E-ARM', x: 26, z: 0, radius: 9 },
        { id: 'nw_pocket', name: 'NW BASTION POCKET', shortName: 'NW-PKT', x: -18, z: -18, radius: 8 },
        { id: 'ne_pocket', name: 'NE BASTION POCKET', shortName: 'NE-PKT', x: 18, z: -18, radius: 8 },
        { id: 'sw_pocket', name: 'SW BASTION POCKET', shortName: 'SW-PKT', x: -18, z: 18, radius: 8 },
        { id: 'se_pocket', name: 'SE BASTION POCKET', shortName: 'SE-PKT', x: 18, z: 18, radius: 8 },
    ],
    obstacles: CROSSFIRE_PLUS_OBSTACLES,
    healthPacks: CROSSFIRE_PLUS_HEALTH_PACKS,
    healthPackSpawns: CROSSFIRE_PLUS_HEALTH_PACKS,
    powerups: [
        { id: 'pu_damage_mid', type: 'damage', x: 0, y: 0, z: -4.2 },
        { id: 'pu_armor_mid', type: 'armor', x: 0, y: 0, z: 4.2 },
        { id: 'pu_speed_w', type: 'speed', x: -16, y: 0, z: 0 },
        { id: 'pu_speed_e', type: 'speed', x: 16, y: 0, z: 0 },
    ],
    jumpPads: [
        { id: 'jp_n', x: 0, y: 0, z: -15, radius: 1.3, jumpForce: 13.5 },
        { id: 'jp_s', x: 0, y: 0, z: 15, radius: 1.3, jumpForce: 13.5 },
    ],
    barrels: [
        { id: 'brl_1', x: -4.5, y: 0, z: 0 },
        { id: 'brl_2', x: 4.5, y: 0, z: 0 },
        { id: 'brl_3', x: 0, y: 0, z: -18 },
        { id: 'brl_4', x: 0, y: 0, z: 18 },
    ],
    spawnPoints: [
        { x: 0, y: 0.1, z: -33, yaw: Math.PI },
        { x: -6, y: 0.1, z: -33, yaw: Math.PI },
        { x: 6, y: 0.1, z: -33, yaw: Math.PI },
        { x: 0, y: 0.1, z: 33, yaw: 0 },
        { x: -6, y: 0.1, z: 33, yaw: 0 },
        { x: 6, y: 0.1, z: 33, yaw: 0 },
        { x: -33, y: 0.1, z: 0, yaw: -Math.PI * 0.5 },
        { x: -33, y: 0.1, z: -6, yaw: -Math.PI * 0.5 },
        { x: 33, y: 0.1, z: 0, yaw: Math.PI * 0.5 },
        { x: 33, y: 0.1, z: 6, yaw: Math.PI * 0.5 },
        { x: -11, y: 0.1, z: -20, yaw: Math.PI },
        { x: 11, y: 0.1, z: 20, yaw: 0 },
    ],
    teamSpawns: {
        alpha: [
            { x: 0, y: 0.1, z: -33, yaw: Math.PI },
            { x: -5, y: 0.1, z: -33, yaw: Math.PI },
            { x: 5, y: 0.1, z: -33, yaw: Math.PI },
            { x: -10, y: 0.1, z: -31, yaw: Math.PI },
            { x: 10, y: 0.1, z: -31, yaw: Math.PI },
        ],
        bravo: [
            { x: 0, y: 0.1, z: 33, yaw: 0 },
            { x: -5, y: 0.1, z: 33, yaw: 0 },
            { x: 5, y: 0.1, z: 33, yaw: 0 },
            { x: -10, y: 0.1, z: 31, yaw: 0 },
            { x: 10, y: 0.1, z: 31, yaw: 0 },
        ],
    },
};

export { CROSSFIRE_PLUS_MAP as CROSSFIRE_PLUS };
