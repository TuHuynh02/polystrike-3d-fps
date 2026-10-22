import {
    createStairs,
    createPerimeterWalls,
    createDoubleDoors,
    createBoostPair,
} from './helpers.js';

function buildNeonLabObstacles() {
    const obs = [
        ...createPerimeterWalls(60, 0x1e1b4b),

        // === CENTRAL REACTOR SILO (CS:GO Nuke Main Silo / Valorant Split Mailroom) ===
        { x: 0, y: 1.2, z: 0, w: 14, h: 2.4, d: 14, color: 0x312e81, type: 'platform' },
        { x: 0, y: 4.9, z: 0, w: 4.2, h: 5.0, d: 4.2, color: 0xd946ef, type: 'pillar' },
        // Corner head-glitch reactor shields on the upper deck (h: 1.35m above y=2.4)
        { x: -5.2, y: 3.075, z: -5.2, w: 2.6, h: 1.35, d: 1.2, color: 0x06b6d4, type: 'crate' },
        { x: 5.2, y: 3.075, z: -5.2, w: 2.6, h: 1.35, d: 1.2, color: 0x06b6d4, type: 'crate' },
        { x: -5.2, y: 3.075, z: 5.2, w: 2.6, h: 1.35, d: 1.2, color: 0x06b6d4, type: 'crate' },
        { x: 5.2, y: 3.075, z: 5.2, w: 2.6, h: 1.35, d: 1.2, color: 0x06b6d4, type: 'crate' },

        // 4-way 5-step smooth ramps (stepH = 0.48m <= PLAYER_STEP_UP)
        ...createStairs(0, -11.5, 4.4, 1.0, 0, 1, 5, 0.48, 0x4c1d95),
        ...createStairs(0, 11.5, 4.4, 1.0, 0, -1, 5, 0.48, 0x4c1d95),
        ...createStairs(-11.5, 0, 4.4, 1.0, 1, 0, 5, 0.48, 0x4c1d95),
        ...createStairs(11.5, 0, 4.4, 1.0, -1, 0, 5, 0.48, 0x4c1d95),
    ];

    // === 4 QUADRANT HOOKAH / SHOWERS SERVER ROOMS (Valorant Bind / Split inspired) ===
    for (const sx of [-1, 1]) {
        for (const sz of [-1, 1]) {
            obs.push(
                // Outer L-shaped containment walls
                { x: sx * 25, y: 2.25, z: sz * 32, w: 14, h: 4.5, d: 1.6, color: 0x1e1b4b, type: 'wall' },
                { x: sx * 32, y: 2.25, z: sz * 25, w: 1.6, h: 4.5, d: 14, color: 0x1e1b4b, type: 'wall' },
                // Inner corner window frame pillar
                { x: sx * 19, y: 2.25, z: sz * 19, w: 2.6, h: 4.5, d: 2.6, color: 0x06b6d4, type: 'pillar' },
                // Crouch-peek window sill facing Mid Reactor
                { x: sx * 19, y: 0.55, z: sz * 24.5, w: 1.3, h: 1.1, d: 4.2, color: 0x0891b2, type: 'wall' },
                // Interior Server Rack Container
                { x: sx * 25, y: 1.6, z: sz * 25, w: 3.4, h: 3.2, d: 6.5, color: 0x0891b2, type: 'container' },
                // 2-step Skill-Boost Cryo Pods inside Server Room
                ...createBoostPair(sx * 28.5, sz * 22, 0, -sz * 2.0, 0x6366f1, 0xec4899, 0),
                // Thin wallbangable composite divider screen (d = 0.65m <= 0.72m)
                { x: sx * 13.5, y: 1.1, z: sz * 21, w: 3.6, h: 2.2, d: 0.65, color: 0xa855f7, type: 'wall' },
                // Outer Spawn Bulkhead Screen & Bio-Crate (clear of teamSpawns at ±44, ±48, ±50)
                { x: sx * 38, y: 1.75, z: sz * 46, w: 6.0, h: 3.5, d: 1.6, color: 0x312e81, type: 'wall' },
                { x: sx * 46, y: 1.1, z: sz * 36, w: 2.2, h: 2.2, d: 2.2, color: 0xec4899, type: 'crate' }
            );
        }
    }

    // === NORTH & SOUTH HEAVEN OBSERVATION DECKS (Valorant Split Rafters / Nuke Heaven) ===
    for (const sz of [-1, 1]) {
        obs.push(
            { x: 0, y: 1.0, z: sz * 40, w: 22, h: 2.0, d: 8, color: 0x312e81, type: 'platform' },
            ...createStairs(-14.5, sz * 40, 4.0, 1.0, 1, 0, 4, 0.5, 0x4c1d95),
            ...createStairs(14.5, sz * 40, 4.0, 1.0, -1, 0, 4, 0.5, 0x4c1d95),
            // Front head-glitch energy shields with center drop-down gap (d = 0.68m wallbangable)
            { x: -6.5, y: 2.65, z: sz * 36.3, w: 6.0, h: 1.3, d: 0.68, color: 0xd946ef, type: 'wall' },
            { x: 6.5, y: 2.65, z: sz * 36.3, w: 6.0, h: 1.3, d: 0.68, color: 0xd946ef, type: 'wall' },
            // Lab Bulkhead Double Doors behind Heaven Deck
            ...createDoubleDoors(0, sz * 47.5, 6.5, 4.6, 1.5, 4.0, true, 0x1e1b4b)
        );
    }

    // === WEST & EAST CRYO-CORE TRENCHES (Valorant Bind Teleporter / Nuke Secret Lanes) ===
    for (const sx of [-1, 1]) {
        obs.push(
            { x: sx * 41, y: 2.5, z: 0, w: 4.2, h: 5.0, d: 4.2, color: 0x06b6d4, type: 'pillar' },
            { x: sx * 41, y: 1.1, z: -10, w: 2.4, h: 2.2, d: 2.4, color: 0x6366f1, type: 'crate' },
            { x: sx * 41, y: 1.1, z: 10, w: 2.4, h: 2.2, d: 2.4, color: 0x6366f1, type: 'crate' },
            { x: sx * 22, y: 1.75, z: 0, w: 2.0, h: 3.5, d: 8.0, color: 0x4c1d95, type: 'wall' }
        );
    }

    return obs;
}

export const NEON_LAB_OBSTACLES = buildNeonLabObstacles();

const NEON_LAB_HEALTH_PACKS = [
    { id: 'hp_reactor', x: 0, y: 2.4, z: 4.5 },
    { id: 'hp_west_trench', x: -46, y: 0, z: 0 },
    { id: 'hp_east_trench', x: 46, y: 0, z: 0 },
    { id: 'hp_north_deck', x: 0, y: 2.0, z: -40 },
    { id: 'hp_south_deck', x: 0, y: 2.0, z: 40 },
];

export const NEON_LAB_MAP = {
    id: 'neon_lab',
    name: 'NEON BIOTECH LAB',
    subtitle: '120x120m • Split / Bind / Nuke: Lò phản ứng trung tâm, 4 Phòng Server & Đài quan sát Heaven',
    badge: '120x120m • Split / Bind / Nuke (Valorant & CS:GO)',
    inspiration: 'Valorant Split & Bind / CS:GO Nuke',
    layoutType: 'Central Reactor Silo, 4 Hookah/Showers Server Rooms & Heaven Rafters',
    arenaHalfSize: 60,
    theme: {
        skyTop: '#05020d',
        skyMid: '#120829',
        skyHorizon: '#2a0e54',
        fogColor: 0x120829,
        fogDensity: 0.0046,
        floorBase: '#0b0f1e',
        floorAlt: '#1e1b4b',
        gridStroke: 'rgba(217, 70, 239, 0.28)',
        accentHex: 0xd946ef,
        secondaryHex: 0x06b6d4,
    },
    callouts: [
        { id: 'reactor_silo', name: 'REACTOR SILO', shortName: 'REACTOR', x: 0, z: 0, radius: 11 },
        { id: 'n_heaven', name: 'NORTH HEAVEN DECK', shortName: 'N-HEAVEN', x: 0, z: -40, radius: 11 },
        { id: 's_heaven', name: 'SOUTH HEAVEN DECK', shortName: 'S-HEAVEN', x: 0, z: 40, radius: 11 },
        { id: 'nw_showers', name: 'NW SHOWERS LAB', shortName: 'SHOWERS', x: -25, z: -25, radius: 10 },
        { id: 'ne_hookah', name: 'NE HOOKAH SERVER', shortName: 'HOOKAH', x: 25, z: -25, radius: 10 },
        { id: 'sw_labs', name: 'SW CRYO LABS', shortName: 'SW-LAB', x: -25, z: 25, radius: 10 },
        { id: 'se_server', name: 'SE SERVER ROOM', shortName: 'SE-SERV', x: 25, z: 25, radius: 10 },
        { id: 'w_cryo', name: 'WEST CRYO LANE', shortName: 'W-CRYO', x: -42, z: 0, radius: 10 },
        { id: 'e_cryo', name: 'EAST CRYO LANE', shortName: 'E-CRYO', x: 42, z: 0, radius: 10 },
        { id: 'alpha_spawn', name: 'ALPHA SPAWN', shortName: 'ALPHA', x: -46, z: -46, radius: 9 },
        { id: 'bravo_spawn', name: 'BRAVO SPAWN', shortName: 'BRAVO', x: 46, z: 46, radius: 9 },
    ],
    obstacles: NEON_LAB_OBSTACLES,
    healthPacks: NEON_LAB_HEALTH_PACKS,
    healthPackSpawns: NEON_LAB_HEALTH_PACKS,
    powerups: [
        { id: 'pu_armor_n', type: 'armor', x: 0, y: 2.0, z: -42 },
        { id: 'pu_armor_s', type: 'armor', x: 0, y: 2.0, z: 42 },
        { id: 'pu_speed_w', type: 'speed', x: -16, y: 0, z: 0 },
        { id: 'pu_damage_center', type: 'damage', x: 0, y: 2.4, z: -4.5 },
    ],
    jumpPads: [
        { id: 'jp_nw', x: -15, y: 0, z: -15, radius: 1.35, jumpForce: 14.0 },
        { id: 'jp_ne', x: 15, y: 0, z: -15, radius: 1.35, jumpForce: 14.0 },
        { id: 'jp_sw', x: -15, y: 0, z: 15, radius: 1.35, jumpForce: 14.0 },
        { id: 'jp_se', x: 15, y: 0, z: 15, radius: 1.35, jumpForce: 14.0 },
    ],
    barrels: [
        { id: 'brl_1', x: -16, y: 0, z: -26 },
        { id: 'brl_2', x: 16, y: 0, z: -26 },
        { id: 'brl_3', x: -16, y: 0, z: 26 },
        { id: 'brl_4', x: 16, y: 0, z: 26 },
        { id: 'brl_5', x: -34, y: 0, z: 0 },
        { id: 'brl_6', x: 34, y: 0, z: 0 },
    ],
    spawnPoints: [
        { x: -50, y: 0.1, z: -50, yaw: -Math.PI * 0.75 },
        { x: 50, y: 0.1, z: -50, yaw: Math.PI * 0.75 },
        { x: -50, y: 0.1, z: 50, yaw: -Math.PI * 0.25 },
        { x: 50, y: 0.1, z: 50, yaw: Math.PI * 0.25 },
        { x: 0, y: 0.1, z: -52, yaw: Math.PI },
        { x: 0, y: 0.1, z: 52, yaw: 0 },
        { x: -52, y: 0.1, z: 0, yaw: -Math.PI * 0.5 },
        { x: 52, y: 0.1, z: 0, yaw: Math.PI * 0.5 },
        { x: -32, y: 0.1, z: -15, yaw: Math.PI },
        { x: 32, y: 0.1, z: -15, yaw: Math.PI },
        { x: -32, y: 0.1, z: 15, yaw: 0 },
        { x: 32, y: 0.1, z: 15, yaw: 0 },
        { x: -15, y: 0.1, z: -32, yaw: Math.PI },
        { x: 15, y: 0.1, z: -32, yaw: Math.PI },
        { x: -15, y: 0.1, z: 32, yaw: 0 },
        { x: 15, y: 0.1, z: 32, yaw: 0 },
    ],
    teamSpawns: {
        alpha: [
            { x: -48, y: 0.1, z: -48, yaw: Math.PI },
            { x: -42, y: 0.1, z: -50, yaw: Math.PI },
            { x: -50, y: 0.1, z: -42, yaw: Math.PI },
            { x: -44, y: 0.1, z: -44, yaw: Math.PI },
            { x: 0, y: 0.1, z: -53, yaw: Math.PI },
            { x: -7, y: 0.1, z: -53, yaw: Math.PI },
            { x: 7, y: 0.1, z: -53, yaw: Math.PI },
        ],
        bravo: [
            { x: 48, y: 0.1, z: 48, yaw: 0 },
            { x: 42, y: 0.1, z: 50, yaw: 0 },
            { x: 50, y: 0.1, z: 42, yaw: 0 },
            { x: 44, y: 0.1, z: 44, yaw: 0 },
            { x: 0, y: 0.1, z: 53, yaw: 0 },
            { x: -7, y: 0.1, z: 53, yaw: 0 },
            { x: 7, y: 0.1, z: 53, yaw: 0 },
        ],
    },
};

export { NEON_LAB_MAP as NEON_LAB };
