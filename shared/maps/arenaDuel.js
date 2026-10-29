import {
    createStairs,
    createPerimeterWalls,
    createBoostPair,
} from './helpers.js';

function buildArenaDuelObstacles() {
    const obs = [
        ...createPerimeterWalls(38, 0x31102f),

        // === CENTRAL DUEL BRIDGE (CS aim_redline / Wingman 2v2 Overpass) ===
        { x: 0, y: 1.1, z: 0, w: 16, h: 2.2, d: 6.0, color: 0x4c1d95, type: 'platform' },
        ...createStairs(-10.5, 0, 3.4, 1.0, 1, 0, 5, 0.44, 0x6d28d9),
        ...createStairs(10.5, 0, 3.4, 1.0, -1, 0, 5, 0.44, 0x6d28d9),

        // Thin wallbangable duel screens on the central bridge (d = 0.66m <= 0.72m)
        { x: -4.2, y: 2.8, z: -2.6, w: 3.6, h: 1.2, d: 0.66, color: 0xf43f5e, type: 'wall' },
        { x: 4.2, y: 2.8, z: 2.6, w: 3.6, h: 1.2, d: 0.66, color: 0xf43f5e, type: 'wall' },

        // === WEST & EAST ELEVATED WINGMAN BALCONIES (h = 2.2m) ===
        { x: -26, y: 1.1, z: 0, w: 6.0, h: 2.2, d: 14, color: 0x831843, type: 'platform' },
        ...createStairs(-26, -9.5, 3.2, 1.0, 0, 1, 5, 0.44, 0x9d174d),
        ...createStairs(-26, 9.5, 3.2, 1.0, 0, -1, 5, 0.44, 0x9d174d),

        { x: 26, y: 1.1, z: 0, w: 6.0, h: 2.2, d: 14, color: 0x831843, type: 'platform' },
        ...createStairs(26, -9.5, 3.2, 1.0, 0, 1, 5, 0.44, 0x9d174d),
        ...createStairs(26, 9.5, 3.2, 1.0, 0, -1, 5, 0.44, 0x9d174d),
    ];

    for (const sz of [-1, 1]) {
        obs.push(
            // Mid-lane rifle peek bunkers
            { x: -12, y: 1.8, z: sz * 13, w: 6.0, h: 3.6, d: 2.0, color: 0x3b0764, type: 'wall' },
            { x: 12, y: 1.8, z: sz * 13, w: 6.0, h: 3.6, d: 2.0, color: 0x3b0764, type: 'wall' },
            // Center-line duel pillar
            { x: 0, y: 2.0, z: sz * 16, w: 2.8, h: 4.0, d: 2.8, color: 0xf43f5e, type: 'pillar' },
            // Head-glitch aim crates
            { x: -5.5, y: 0.7, z: sz * 21, w: 2.4, h: 1.4, d: 1.6, color: 0xe11d48, type: 'crate' },
            { x: 5.5, y: 0.7, z: sz * 21, w: 2.4, h: 1.4, d: 1.6, color: 0xe11d48, type: 'crate' },
            // Flank cargo containers
            { x: -19, y: 1.6, z: sz * 23, w: 3.6, h: 3.2, d: 6.0, color: 0xbe123c, type: 'container' },
            { x: 19, y: 1.6, z: sz * 23, w: 3.6, h: 3.2, d: 6.0, color: 0x6d28d9, type: 'container' },
            // Skill-boost crate pairs
            ...createBoostPair(-15, sz * 10, 0, -sz * 2.0, 0xf43f5e, 0x8b5cf6, 0),
            ...createBoostPair(15, sz * 10, 0, -sz * 2.0, 0xf43f5e, 0x8b5cf6, 0)
        );
    }

    return obs;
}

export const ARENA_DUEL_OBSTACLES = buildArenaDuelObstacles();

const ARENA_DUEL_HEALTH_PACKS = [
    { id: 'hp_bridge', x: 0, y: 2.2, z: 0 },
    { id: 'hp_w_balcony', x: -26, y: 2.2, z: 0 },
    { id: 'hp_e_balcony', x: 26, y: 2.2, z: 0 },
    { id: 'hp_n_court', x: 0, y: 0, z: -24 },
    { id: 'hp_s_court', x: 0, y: 0, z: 24 },
];

export const ARENA_DUEL_MAP = {
    id: 'arena_duel',
    name: 'AIM DUEL ARENA',
    subtitle: '76x76m • CS aim_redline / Wingman 2v2: Đấu trường đọ súng đối xứng 2 tầng, nhịp độ cực nhanh',
    badge: '76x76m • CS aim_map / Wingman Duel',
    inspiration: 'CS:GO aim_redline & Wingman 2v2 Arena',
    layoutType: 'Symmetric 2-Tier Rifle Duel Arena & Center Bridge',
    arenaHalfSize: 38,
    theme: {
        skyTop: '#16071c',
        skyMid: '#2e1035',
        skyHorizon: '#701a75',
        fogColor: 0x2e1035,
        fogDensity: 0.0040,
        floorBase: '#1b1026',
        floorAlt: '#2a183b',
        gridStroke: 'rgba(244, 63, 94, 0.26)',
        accentHex: 0xf43f5e,
        secondaryHex: 0xa855f7,
    },
    callouts: [
        { id: 'duel_bridge', name: 'CENTRAL DUEL BRIDGE', shortName: 'BRIDGE', x: 0, z: 0, radius: 9 },
        { id: 'w_balcony', name: 'WEST WINGMAN DECK', shortName: 'W-DECK', x: -26, z: 0, radius: 9 },
        { id: 'e_balcony', name: 'EAST WINGMAN DECK', shortName: 'E-DECK', x: 26, z: 0, radius: 9 },
        { id: 'n_redline', name: 'NORTH AIM LINE', shortName: 'N-AIM', x: 0, z: -18, radius: 9 },
        { id: 's_redline', name: 'SOUTH AIM LINE', shortName: 'S-AIM', x: 0, z: 18, radius: 9 },
        { id: 'nw_flank', name: 'NW CONTAINER WING', shortName: 'NW-WING', x: -19, z: -23, radius: 8 },
        { id: 'ne_flank', name: 'NE CONTAINER WING', shortName: 'NE-WING', x: 19, z: -23, radius: 8 },
        { id: 'sw_flank', name: 'SW CONTAINER WING', shortName: 'SW-WING', x: -19, z: 23, radius: 8 },
        { id: 'se_flank', name: 'SE CONTAINER WING', shortName: 'SE-WING', x: 19, z: 23, radius: 8 },
    ],
    obstacles: ARENA_DUEL_OBSTACLES,
    healthPacks: ARENA_DUEL_HEALTH_PACKS,
    healthPackSpawns: ARENA_DUEL_HEALTH_PACKS,
    powerups: [
        { id: 'pu_damage_n', type: 'damage', x: 0, y: 0, z: -9 },
        { id: 'pu_damage_s', type: 'damage', x: 0, y: 0, z: 9 },
        { id: 'pu_armor_w', type: 'armor', x: -17, y: 0, z: 0 },
        { id: 'pu_speed_e', type: 'speed', x: 17, y: 0, z: 0 },
    ],
    jumpPads: [
        { id: 'jp_n', x: 0, y: 0, z: -11, radius: 1.3, jumpForce: 13.5 },
        { id: 'jp_s', x: 0, y: 0, z: 11, radius: 1.3, jumpForce: 13.5 },
    ],
    barrels: [
        { id: 'brl_1', x: -8, y: 0, z: -13 },
        { id: 'brl_2', x: 8, y: 0, z: -13 },
        { id: 'brl_3', x: -8, y: 0, z: 13 },
        { id: 'brl_4', x: 8, y: 0, z: 13 },
    ],
    spawnPoints: [
        { x: 0, y: 0.1, z: -32, yaw: Math.PI },
        { x: -10, y: 0.1, z: -32, yaw: Math.PI },
        { x: 10, y: 0.1, z: -32, yaw: Math.PI },
        { x: 0, y: 0.1, z: 32, yaw: 0 },
        { x: -10, y: 0.1, z: 32, yaw: 0 },
        { x: 10, y: 0.1, z: 32, yaw: 0 },
        { x: -32, y: 0.1, z: -16, yaw: -Math.PI * 0.5 },
        { x: -32, y: 0.1, z: 16, yaw: -Math.PI * 0.5 },
        { x: 32, y: 0.1, z: -16, yaw: Math.PI * 0.5 },
        { x: 32, y: 0.1, z: 16, yaw: Math.PI * 0.5 },
        { x: -28, y: 0.1, z: -30, yaw: -Math.PI * 0.75 },
        { x: 28, y: 0.1, z: 30, yaw: Math.PI * 0.25 },
    ],
    teamSpawns: {
        alpha: [
            { x: 0, y: 0.1, z: -32, yaw: Math.PI },
            { x: -7, y: 0.1, z: -32, yaw: Math.PI },
            { x: 7, y: 0.1, z: -32, yaw: Math.PI },
            { x: -14, y: 0.1, z: -32, yaw: Math.PI },
            { x: 14, y: 0.1, z: -32, yaw: Math.PI },
        ],
        bravo: [
            { x: 0, y: 0.1, z: 32, yaw: 0 },
            { x: -7, y: 0.1, z: 32, yaw: 0 },
            { x: 7, y: 0.1, z: 32, yaw: 0 },
            { x: -14, y: 0.1, z: 32, yaw: 0 },
            { x: 14, y: 0.1, z: 32, yaw: 0 },
        ],
    },
};

export { ARENA_DUEL_MAP as ARENA_DUEL };
