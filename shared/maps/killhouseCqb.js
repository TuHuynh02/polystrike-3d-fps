import {
    createStairs,
    createPerimeterWalls,
    createBoostPair,
} from './helpers.js';

function buildKillhouseCqbObstacles() {
    const obs = [
        ...createPerimeterWalls(40, 0x3f3f46),

        // === CENTRAL LOOKOUT TOWER (CoD4 Killhouse Center Tower) ===
        { x: 0, y: 1.2, z: 0, w: 9.0, h: 2.4, d: 9.0, color: 0x78350f, type: 'platform' },
        { x: 0, y: 4.2, z: 0, w: 2.4, h: 3.6, d: 2.4, color: 0xf59e0b, type: 'pillar' },
        ...createStairs(0, -7.2, 3.4, 1.0, 0, 1, 5, 0.48, 0x92400e),
        ...createStairs(0, 7.2, 3.4, 1.0, 0, -1, 5, 0.48, 0x92400e),

        // Thin wallbangable plywood tower railings (d = 0.65m <= 0.72m)
        { x: -3.2, y: 3.0, z: -4.1, w: 2.4, h: 1.2, d: 0.65, color: 0xd97706, type: 'wall' },
        { x: 3.2, y: 3.0, z: 4.1, w: 2.4, h: 1.2, d: 0.65, color: 0xd97706, type: 'wall' },

        // === NORTH & SOUTH BREACH SHOOT-HOUSES (Elevated 2.0m CQB Decks) ===
        { x: 0, y: 1.0, z: -26, w: 14, h: 2.0, d: 6.0, color: 0x52525b, type: 'platform' },
        ...createStairs(-9.0, -26, 3.2, 1.0, 1, 0, 4, 0.5, 0x71717a),
        ...createStairs(9.0, -26, 3.2, 1.0, -1, 0, 4, 0.5, 0x71717a),

        { x: 0, y: 1.0, z: 26, w: 14, h: 2.0, d: 6.0, color: 0x52525b, type: 'platform' },
        ...createStairs(-9.0, 26, 3.2, 1.0, 1, 0, 4, 0.5, 0x71717a),
        ...createStairs(9.0, 26, 3.2, 1.0, -1, 0, 4, 0.5, 0x71717a),

        // === PLYWOOD CQB PARTITIONS & SHIPPING CONTAINERS ===
        { x: -18, y: 1.6, z: -12, w: 3.6, h: 3.2, d: 7.0, color: 0xb45309, type: 'container' },
        { x: 18, y: 1.6, z: -12, w: 3.6, h: 3.2, d: 7.0, color: 0x0369a1, type: 'container' },
        { x: -18, y: 1.6, z: 12, w: 3.6, h: 3.2, d: 7.0, color: 0x0369a1, type: 'container' },
        { x: 18, y: 1.6, z: 12, w: 3.6, h: 3.2, d: 7.0, color: 0xb45309, type: 'container' },

        // Thin wallbangable plywood killhouse partitions (d = 0.68m <= 0.72m)
        { x: -11, y: 1.25, z: -15, w: 5.5, h: 2.5, d: 0.68, color: 0xd97706, type: 'wall' },
        { x: 11, y: 1.25, z: -15, w: 5.5, h: 2.5, d: 0.68, color: 0xd97706, type: 'wall' },
        { x: -11, y: 1.25, z: 15, w: 5.5, h: 2.5, d: 0.68, color: 0xd97706, type: 'wall' },
        { x: 11, y: 1.25, z: 15, w: 5.5, h: 2.5, d: 0.68, color: 0xd97706, type: 'wall' },

        // West & East CQB Tire / Concrete Chicanes
        { x: -26, y: 1.75, z: 0, w: 2.0, h: 3.5, d: 9.0, color: 0x52525b, type: 'wall' },
        { x: 26, y: 1.75, z: 0, w: 2.0, h: 3.5, d: 9.0, color: 0x52525b, type: 'wall' },

        // Boost pairs next to containers
        ...createBoostPair(-13.5, 0, 0, 2.0, 0xf59e0b, 0xb45309, 0),
        ...createBoostPair(13.5, 0, 0, -2.0, 0xf59e0b, 0xb45309, 0),
    ];

    return obs;
}

export const KILLHOUSE_CQB_OBSTACLES = buildKillhouseCqbObstacles();

const KILLHOUSE_CQB_HEALTH_PACKS = [
    { id: 'hp_tower', x: 0, y: 2.4, z: 2.5 },
    { id: 'hp_n_breach', x: 0, y: 2.0, z: -26 },
    { id: 'hp_s_breach', x: 0, y: 2.0, z: 26 },
    { id: 'hp_w_lane', x: -32, y: 0, z: 0 },
    { id: 'hp_e_lane', x: 32, y: 0, z: 0 },
];

export const KILLHOUSE_CQB_MAP = {
    id: 'killhouse_cqb',
    name: 'KILLHOUSE CQB',
    subtitle: '80x80m • CoD4 Killhouse / Shoot House: Kho huấn luyện CQB, Tháp canh giữa & Vách gỗ đục xuyên',
    badge: '80x80m • CoD4 Killhouse Tactical CQB',
    inspiration: 'Call of Duty 4 Killhouse & MW Shoot House',
    layoutType: 'Central Watchtower, Plywood Partition Maze & 3-Lane CQB',
    arenaHalfSize: 40,
    theme: {
        skyTop: '#18181b',
        skyMid: '#27272a',
        skyHorizon: '#52525b',
        fogColor: 0x27272a,
        fogDensity: 0.0040,
        floorBase: '#222226',
        floorAlt: '#2e2e34',
        gridStroke: 'rgba(245, 158, 11, 0.24)',
        accentHex: 0xf59e0b,
        secondaryHex: 0x10b981,
    },
    callouts: [
        { id: 'watchtower', name: 'CENTRAL WATCHTOWER', shortName: 'TOWER', x: 0, z: 0, radius: 9 },
        { id: 'north_house', name: 'NORTH BREACH DECK', shortName: 'N-HOUSE', x: 0, z: -26, radius: 9 },
        { id: 'south_house', name: 'SOUTH BREACH DECK', shortName: 'S-HOUSE', x: 0, z: 26, radius: 9 },
        { id: 'nw_container', name: 'NW CONTAINER BAY', shortName: 'NW-BAY', x: -18, z: -12, radius: 8 },
        { id: 'ne_container', name: 'NE CONTAINER BAY', shortName: 'NE-BAY', x: 18, z: -12, radius: 8 },
        { id: 'sw_container', name: 'SW CONTAINER BAY', shortName: 'SW-BAY', x: -18, z: 12, radius: 8 },
        { id: 'se_container', name: 'SE CONTAINER BAY', shortName: 'SE-BAY', x: 18, z: 12, radius: 8 },
        { id: 'west_chicane', name: 'WEST TIRE LANE', shortName: 'W-LANE', x: -30, z: 0, radius: 8 },
        { id: 'east_chicane', name: 'EAST TIRE LANE', shortName: 'E-LANE', x: 30, z: 0, radius: 8 },
    ],
    obstacles: KILLHOUSE_CQB_OBSTACLES,
    healthPacks: KILLHOUSE_CQB_HEALTH_PACKS,
    healthPackSpawns: KILLHOUSE_CQB_HEALTH_PACKS,
    powerups: [
        { id: 'pu_damage_tower', type: 'damage', x: 0, y: 2.4, z: -2.5 },
        { id: 'pu_armor_w', type: 'armor', x: -20, y: 0, z: 0 },
        { id: 'pu_armor_e', type: 'armor', x: 20, y: 0, z: 0 },
        { id: 'pu_speed_mid', type: 'speed', x: -7.5, y: 0, z: 0 },
    ],
    jumpPads: [
        { id: 'jp_w', x: -9, y: 0, z: -9, radius: 1.3, jumpForce: 13.5 },
        { id: 'jp_e', x: 9, y: 0, z: 9, radius: 1.3, jumpForce: 13.5 },
    ],
    barrels: [
        { id: 'brl_1', x: -11, y: 0, z: -12 },
        { id: 'brl_2', x: 11, y: 0, z: -12 },
        { id: 'brl_3', x: -11, y: 0, z: 12 },
        { id: 'brl_4', x: 11, y: 0, z: 12 },
    ],
    spawnPoints: [
        { x: 0, y: 0.1, z: -34, yaw: Math.PI },
        { x: -12, y: 0.1, z: -34, yaw: Math.PI },
        { x: 12, y: 0.1, z: -34, yaw: Math.PI },
        { x: 0, y: 0.1, z: 34, yaw: 0 },
        { x: -12, y: 0.1, z: 34, yaw: 0 },
        { x: 12, y: 0.1, z: 34, yaw: 0 },
        { x: -33, y: 0.1, z: -22, yaw: -Math.PI * 0.5 },
        { x: -33, y: 0.1, z: 22, yaw: -Math.PI * 0.5 },
        { x: 33, y: 0.1, z: -22, yaw: Math.PI * 0.5 },
        { x: 33, y: 0.1, z: 22, yaw: Math.PI * 0.5 },
        { x: -28, y: 0.1, z: -32, yaw: -Math.PI * 0.75 },
        { x: 28, y: 0.1, z: 32, yaw: Math.PI * 0.25 },
    ],
    teamSpawns: {
        alpha: [
            { x: 0, y: 0.1, z: -34, yaw: Math.PI },
            { x: -8, y: 0.1, z: -34, yaw: Math.PI },
            { x: 8, y: 0.1, z: -34, yaw: Math.PI },
            { x: -18, y: 0.1, z: -33, yaw: Math.PI },
            { x: 18, y: 0.1, z: -33, yaw: Math.PI },
        ],
        bravo: [
            { x: 0, y: 0.1, z: 34, yaw: 0 },
            { x: -8, y: 0.1, z: 34, yaw: 0 },
            { x: 8, y: 0.1, z: 34, yaw: 0 },
            { x: -18, y: 0.1, z: 33, yaw: 0 },
            { x: 18, y: 0.1, z: 33, yaw: 0 },
        ],
    },
};

export { KILLHOUSE_CQB_MAP as KILLHOUSE_CQB };
