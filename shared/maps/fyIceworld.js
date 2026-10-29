import {
    createStairs,
    createPerimeterWalls,
    createBoostPair,
} from './helpers.js';

function buildFyIceworldObstacles() {
    const obs = [
        ...createPerimeterWalls(36, 0x1e3a5f),

        // === 4 ICONIC SYMMETRIC CENTRAL ICE MONOLITHS (CS 1.6 fy_iceworld) ===
        { x: -10.5, y: 2.25, z: -10.5, w: 9.0, h: 4.5, d: 9.0, color: 0x38bdf8, type: 'wall' },
        { x: 10.5, y: 2.25, z: -10.5, w: 9.0, h: 4.5, d: 9.0, color: 0x38bdf8, type: 'wall' },
        { x: -10.5, y: 2.25, z: 10.5, w: 9.0, h: 4.5, d: 9.0, color: 0x38bdf8, type: 'wall' },
        { x: 10.5, y: 2.25, z: 10.5, w: 9.0, h: 4.5, d: 9.0, color: 0x38bdf8, type: 'wall' },

        // Central cross-alley low ice crystal pillar & wallbangable frost dividers (d = 0.65m <= 0.72m)
        { x: 0, y: 1.8, z: 0, w: 2.2, h: 3.6, d: 2.2, color: 0x7dd3fc, type: 'pillar' },
        { x: 0, y: 1.0, z: -16.5, w: 4.2, h: 2.0, d: 0.65, color: 0x0ea5e9, type: 'wall' },
        { x: 0, y: 1.0, z: 16.5, w: 4.2, h: 2.0, d: 0.65, color: 0x0ea5e9, type: 'wall' },
        { x: -16.5, y: 1.0, z: 0, w: 0.65, h: 2.0, d: 4.2, color: 0x0ea5e9, type: 'wall' },
        { x: 16.5, y: 1.0, z: 0, w: 0.65, h: 2.0, d: 4.2, color: 0x0ea5e9, type: 'wall' },

        // === NORTH, SOUTH, WEST & EAST ELEVATED SNOW PLATFORMS (h = 2.0m) ===
        { x: 0, y: 1.0, z: -25, w: 12, h: 2.0, d: 5.5, color: 0x0284c7, type: 'platform' },
        ...createStairs(-7.8, -25, 3.0, 1.0, 1, 0, 4, 0.5, 0x0369a1),
        ...createStairs(7.8, -25, 3.0, 1.0, -1, 0, 4, 0.5, 0x0369a1),

        { x: 0, y: 1.0, z: 25, w: 12, h: 2.0, d: 5.5, color: 0x0284c7, type: 'platform' },
        ...createStairs(-7.8, 25, 3.0, 1.0, 1, 0, 4, 0.5, 0x0369a1),
        ...createStairs(7.8, 25, 3.0, 1.0, -1, 0, 4, 0.5, 0x0369a1),

        { x: -25, y: 1.0, z: 0, w: 5.5, h: 2.0, d: 12, color: 0x0284c7, type: 'platform' },
        ...createStairs(-25, -7.8, 3.0, 1.0, 0, 1, 4, 0.5, 0x0369a1),
        ...createStairs(-25, 7.8, 3.0, 1.0, 0, -1, 4, 0.5, 0x0369a1),

        { x: 25, y: 1.0, z: 0, w: 5.5, h: 2.0, d: 12, color: 0x0284c7, type: 'platform' },
        ...createStairs(25, -7.8, 3.0, 1.0, 0, 1, 4, 0.5, 0x0369a1),
        ...createStairs(25, 7.8, 3.0, 1.0, 0, -1, 4, 0.5, 0x0369a1),

        // === CORNER SUPPLY CRATES & SKILL-BOOST PAIRS ===
        ...createBoostPair(-21, -21, 0, 2.0, 0x38bdf8, 0x0284c7, 0),
        ...createBoostPair(21, -21, 0, 2.0, 0x38bdf8, 0x0284c7, 0),
        ...createBoostPair(-21, 21, 0, -2.0, 0x38bdf8, 0x0284c7, 0),
        ...createBoostPair(21, 21, 0, -2.0, 0x38bdf8, 0x0284c7, 0),
    ];

    return obs;
}

export const FY_ICEWORLD_OBSTACLES = buildFyIceworldObstacles();

const FY_ICEWORLD_HEALTH_PACKS = [
    { id: 'hp_ice_n', x: 0, y: 2.0, z: -25 },
    { id: 'hp_ice_s', x: 0, y: 2.0, z: 25 },
    { id: 'hp_ice_w', x: -25, y: 2.0, z: 0 },
    { id: 'hp_ice_e', x: 25, y: 2.0, z: 0 },
];

export const FY_ICEWORLD_MAP = {
    id: 'fy_iceworld',
    name: 'ICEWORLD ARENA',
    subtitle: '72x72m • CS 1.6 fy_iceworld: 4 khối băng đối xứng cổ điển, giao tranh tức thì cho 3-4 người',
    badge: '72x72m • CS 1.6 fy_iceworld Classic',
    inspiration: 'Counter-Strike 1.6 fy_iceworld',
    layoutType: 'Symmetric 4-Block Ice Arena & Cross Alleys',
    arenaHalfSize: 36,
    theme: {
        skyTop: '#081c38',
        skyMid: '#153e6c',
        skyHorizon: '#60a5fa',
        fogColor: 0x153e6c,
        fogDensity: 0.0038,
        floorBase: '#172b44',
        floorAlt: '#234266',
        gridStroke: 'rgba(125, 211, 252, 0.28)',
        accentHex: 0x38bdf8,
        secondaryHex: 0xe0f2fe,
    },
    callouts: [
        { id: 'center_cross', name: 'ICE CROSSROADS', shortName: 'MID', x: 0, z: 0, radius: 8 },
        { id: 'nw_monolith', name: 'NW ICE BLOCK', shortName: 'NW-ICE', x: -11, z: -11, radius: 8 },
        { id: 'ne_monolith', name: 'NE ICE BLOCK', shortName: 'NE-ICE', x: 11, z: -11, radius: 8 },
        { id: 'sw_monolith', name: 'SW ICE BLOCK', shortName: 'SW-ICE', x: -11, z: 11, radius: 8 },
        { id: 'se_monolith', name: 'SE ICE BLOCK', shortName: 'SE-ICE', x: 11, z: 11, radius: 8 },
        { id: 'north_ridge', name: 'NORTH SNOW DECK', shortName: 'N-DECK', x: 0, z: -25, radius: 8 },
        { id: 'south_ridge', name: 'SOUTH SNOW DECK', shortName: 'S-DECK', x: 0, z: 25, radius: 8 },
        { id: 'west_alley', name: 'WEST FROST ALLEY', shortName: 'W-ALLEY', x: -25, z: 0, radius: 8 },
        { id: 'east_alley', name: 'EAST FROST ALLEY', shortName: 'E-ALLEY', x: 25, z: 0, radius: 8 },
    ],
    obstacles: FY_ICEWORLD_OBSTACLES,
    healthPacks: FY_ICEWORLD_HEALTH_PACKS,
    healthPackSpawns: FY_ICEWORLD_HEALTH_PACKS,
    powerups: [
        { id: 'pu_damage_mid', type: 'damage', x: 0, y: 0, z: -3.8 },
        { id: 'pu_armor_mid', type: 'armor', x: 0, y: 0, z: 3.8 },
        { id: 'pu_speed_w', type: 'speed', x: -3.8, y: 0, z: 0 },
        { id: 'pu_speed_e', type: 'speed', x: 3.8, y: 0, z: 0 },
    ],
    jumpPads: [
        { id: 'jp_nw', x: -18, y: 0, z: -10.5, radius: 1.25, jumpForce: 13.5 },
        { id: 'jp_se', x: 18, y: 0, z: 10.5, radius: 1.25, jumpForce: 13.5 },
    ],
    barrels: [
        { id: 'brl_1', x: -4.2, y: 0, z: -10.5 },
        { id: 'brl_2', x: 4.2, y: 0, z: -10.5 },
        { id: 'brl_3', x: -4.2, y: 0, z: 10.5 },
        { id: 'brl_4', x: 4.2, y: 0, z: 10.5 },
    ],
    spawnPoints: [
        { x: -14, y: 0.1, z: -31, yaw: Math.PI },
        { x: 14, y: 0.1, z: -31, yaw: Math.PI },
        { x: 0, y: 0.1, z: -31, yaw: Math.PI },
        { x: -14, y: 0.1, z: 31, yaw: 0 },
        { x: 14, y: 0.1, z: 31, yaw: 0 },
        { x: 0, y: 0.1, z: 31, yaw: 0 },
        { x: -31, y: 0.1, z: -14, yaw: -Math.PI * 0.5 },
        { x: -31, y: 0.1, z: 14, yaw: -Math.PI * 0.5 },
        { x: 31, y: 0.1, z: -14, yaw: Math.PI * 0.5 },
        { x: 31, y: 0.1, z: 14, yaw: Math.PI * 0.5 },
        { x: -29, y: 0.1, z: -29, yaw: -Math.PI * 0.75 },
        { x: 29, y: 0.1, z: 29, yaw: Math.PI * 0.25 },
    ],
    teamSpawns: {
        alpha: [
            { x: 0, y: 0.1, z: -31, yaw: Math.PI },
            { x: -8, y: 0.1, z: -31, yaw: Math.PI },
            { x: 8, y: 0.1, z: -31, yaw: Math.PI },
            { x: -16, y: 0.1, z: -31, yaw: Math.PI },
            { x: 16, y: 0.1, z: -31, yaw: Math.PI },
        ],
        bravo: [
            { x: 0, y: 0.1, z: 31, yaw: 0 },
            { x: -8, y: 0.1, z: 31, yaw: 0 },
            { x: 8, y: 0.1, z: 31, yaw: 0 },
            { x: -16, y: 0.1, z: 31, yaw: 0 },
            { x: 16, y: 0.1, z: 31, yaw: 0 },
        ],
    },
};

export { FY_ICEWORLD_MAP as FY_ICEWORLD };
