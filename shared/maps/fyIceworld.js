// ============================================================================
// MAP 5: FY_ICEWORLD (64x64m — CS Classic Snow-Stone Glacier Arena)
// Crisp Arctic Daylight (Zero Neon): 4 Snow-Stone Glacier Monoliths,
// Frost Crossroads Pillar & Thin Wallbang Dividers, 4 Elevated Snow-Stone Decks
// ============================================================================

import {
  createBoostPair,
  createPerimeterWalls,
  createStairs
} from './helpers.js';

function buildFyIceworldObstacles() {
  return [
    ...createPerimeterWalls(32, 0x475569),

    // === 4 ICONIC SYMMETRIC SNOW-STONE GLACIER MONOLITHS (8x8m, h = 4.4m) ===
    { x: -9.0, y: 2.2, z: -9.0, w: 8.0, h: 4.4, d: 8.0, color: 0x94a3b8, type: 'wall' },
    { x: 9.0, y: 2.2, z: -9.0, w: 8.0, h: 4.4, d: 8.0, color: 0x94a3b8, type: 'wall' },
    { x: -9.0, y: 2.2, z: 9.0, w: 8.0, h: 4.4, d: 8.0, color: 0x94a3b8, type: 'wall' },
    { x: 9.0, y: 2.2, z: 9.0, w: 8.0, h: 4.4, d: 8.0, color: 0x94a3b8, type: 'wall' },

    // Central frost crossroads granite pillar & wallbangable frost dividers (0.65m <= 0.72m)
    { x: 0, y: 1.8, z: 0, w: 2.2, h: 3.6, d: 2.2, color: 0xcbd5e1, type: 'pillar' },
    { x: 0, y: 0.95, z: -14.5, w: 3.8, h: 1.9, d: 0.65, color: 0x64748b, type: 'wall' },
    { x: 0, y: 0.95, z: 14.5, w: 3.8, h: 1.9, d: 0.65, color: 0x64748b, type: 'wall' },
    { x: -14.5, y: 0.95, z: 0, w: 0.65, h: 1.9, d: 3.8, color: 0x64748b, type: 'wall' },
    { x: 14.5, y: 0.95, z: 0, w: 0.65, h: 1.9, d: 3.8, color: 0x64748b, type: 'wall' },

    // === NORTH, SOUTH, WEST & EAST ELEVATED SNOW-STONE DECKS (h = 2.0m, stepH = 0.40m <= 0.48m) ===
    { x: 0, y: 1.0, z: -22.0, w: 10.0, h: 2.0, d: 5.0, color: 0x64748b, type: 'platform' },
    ...createStairs(-9.5, -22.0, 3.0, 1.0, 1, 0, 5, 0.4, 0x475569),
    ...createStairs(9.5, -22.0, 3.0, 1.0, -1, 0, 5, 0.4, 0x475569),

    { x: 0, y: 1.0, z: 22.0, w: 10.0, h: 2.0, d: 5.0, color: 0x64748b, type: 'platform' },
    ...createStairs(-9.5, 22.0, 3.0, 1.0, 1, 0, 5, 0.4, 0x475569),
    ...createStairs(9.5, 22.0, 3.0, 1.0, -1, 0, 5, 0.4, 0x475569),

    { x: -22.0, y: 1.0, z: 0, w: 5.0, h: 2.0, d: 10.0, color: 0x64748b, type: 'platform' },
    ...createStairs(-22.0, -9.5, 3.0, 1.0, 0, 1, 5, 0.4, 0x475569),
    ...createStairs(-22.0, 9.5, 3.0, 1.0, 0, -1, 5, 0.4, 0x475569),

    { x: 22.0, y: 1.0, z: 0, w: 5.0, h: 2.0, d: 10.0, color: 0x64748b, type: 'platform' },
    ...createStairs(22.0, -9.5, 3.0, 1.0, 0, 1, 5, 0.4, 0x475569),
    ...createStairs(22.0, 9.5, 3.0, 1.0, 0, -1, 5, 0.4, 0x475569),

    // === 4 CORNER ALPINE SUPPLY BOOST PAIRS ===
    ...createBoostPair(-18.5, -18.5, 0, 2.0, 0x78716c, 0x94a3b8, 0),
    ...createBoostPair(18.5, -18.5, 0, 2.0, 0x78716c, 0x94a3b8, 0),
    ...createBoostPair(-18.5, 18.5, 0, -2.0, 0x78716c, 0x94a3b8, 0),
    ...createBoostPair(18.5, 18.5, 0, -2.0, 0x78716c, 0x94a3b8, 0)
  ];
}

export const FY_ICEWORLD_OBSTACLES = buildFyIceworldObstacles();

const FY_ICEWORLD_HEALTH_PACKS = [
  { id: 'hp_ice_n', x: 0, y: 2.0, z: -22.0 },
  { id: 'hp_ice_s', x: 0, y: 2.0, z: 22.0 },
  { id: 'hp_ice_w', x: -22.0, y: 2.0, z: 0 },
  { id: 'hp_ice_e', x: 22.0, y: 2.0, z: 0 }
];

export const FY_ICEWORLD_MAP = {
  id: 'fy_iceworld',
  name: 'FY_ICEWORLD // CS CLASSIC',
  subtitle: '64x64m • CS Classic fy_iceworld: 4 khối đá băng đối xứng, ngã tư trung tâm, sàn tuyết 2 tầng & ánh sáng Bắc Cực',
  badge: '64x64m • CS Classic fy_iceworld',
  inspiration: 'Counter-Strike 1.6 / CS2 fy_iceworld',
  layoutType: 'Symmetric 4-Monolith Glacier Arena, Frost Crossroads & 4 Elevated Snow-Stone Decks',
  arenaHalfSize: 32,
  theme: {
    skyTop: '#2b6cb0',
    skyMid: '#7ab8e8',
    skyHorizon: '#e2eff8',
    fogColor: 0xd8e8f5,
    fogDensity: 0.0032,
    floorBase: '#c8d6e2',
    floorAlt: '#b4c5d4',
    gridStroke: 'rgba(100, 116, 139, 0.25)',
    accentHex: 0x64748b,
    secondaryHex: 0x94a3b8
  },
  callouts: [
    { id: 'center_cross', name: 'FROST CROSSROADS', shortName: 'MID', x: 0, z: 0, radius: 7 },
    { id: 'nw_monolith', name: 'NW GLACIER BLOCK', shortName: 'NW-ICE', x: -9, z: -9, radius: 7 },
    { id: 'ne_monolith', name: 'NE GLACIER BLOCK', shortName: 'NE-ICE', x: 9, z: -9, radius: 7 },
    { id: 'sw_monolith', name: 'SW GLACIER BLOCK', shortName: 'SW-ICE', x: -9, z: 9, radius: 7 },
    { id: 'se_monolith', name: 'SE GLACIER BLOCK', shortName: 'SE-ICE', x: 9, z: 9, radius: 7 },
    { id: 'north_deck', name: 'NORTH SNOW DECK', shortName: 'N-DECK', x: 0, z: -22, radius: 7 },
    { id: 'south_deck', name: 'SOUTH SNOW DECK', shortName: 'S-DECK', x: 0, z: 22, radius: 7 },
    { id: 'west_deck', name: 'WEST SNOW DECK', shortName: 'W-DECK', x: -22, z: 0, radius: 7 },
    { id: 'east_deck', name: 'EAST SNOW DECK', shortName: 'E-DECK', x: 22, z: 0, radius: 7 }
  ],
  obstacles: FY_ICEWORLD_OBSTACLES,
  healthPacks: FY_ICEWORLD_HEALTH_PACKS,
  healthPackSpawns: FY_ICEWORLD_HEALTH_PACKS,
  powerups: [
    { id: 'pu_damage_mid', type: 'damage', x: 0, y: 0, z: -3.5 },
    { id: 'pu_armor_mid', type: 'armor', x: 0, y: 0, z: 3.5 },
    { id: 'pu_speed_w', type: 'speed', x: -3.5, y: 0, z: 0 },
    { id: 'pu_speed_e', type: 'speed', x: 3.5, y: 0, z: 0 }
  ],
  jumpPads: [
    { id: 'jp_nw', x: -16.0, y: 0, z: -9.0, radius: 1.25, jumpForce: 13.5 },
    { id: 'jp_se', x: 16.0, y: 0, z: 9.0, radius: 1.25, jumpForce: 13.5 }
  ],
  barrels: [
    { id: 'brl_1', x: -3.6, y: 0, z: -9.0 },
    { id: 'brl_2', x: 3.6, y: 0, z: -9.0 },
    { id: 'brl_3', x: -3.6, y: 0, z: 9.0 },
    { id: 'brl_4', x: 3.6, y: 0, z: 9.0 }
  ],
  spawnPoints: [
    { x: -12.0, y: 0.1, z: -28.0, yaw: Math.PI },
    { x: 12.0, y: 0.1, z: -28.0, yaw: Math.PI },
    { x: 0, y: 0.1, z: -28.0, yaw: Math.PI },
    { x: -12.0, y: 0.1, z: 28.0, yaw: 0 },
    { x: 12.0, y: 0.1, z: 28.0, yaw: 0 },
    { x: 0, y: 0.1, z: 28.0, yaw: 0 },
    { x: -28.0, y: 0.1, z: -12.0, yaw: -Math.PI * 0.5 },
    { x: -28.0, y: 0.1, z: 12.0, yaw: -Math.PI * 0.5 },
    { x: 28.0, y: 0.1, z: -12.0, yaw: Math.PI * 0.5 },
    { x: 28.0, y: 0.1, z: 12.0, yaw: Math.PI * 0.5 },
    { x: -27.0, y: 0.1, z: -27.0, yaw: -Math.PI * 0.75 },
    { x: 27.0, y: 0.1, z: -27.0, yaw: Math.PI * 0.75 },
    { x: -27.0, y: 0.1, z: 27.0, yaw: -Math.PI * 0.25 },
    { x: 27.0, y: 0.1, z: 27.0, yaw: Math.PI * 0.25 }
  ],
  teamSpawns: {
    alpha: [
      { x: 0, y: 0.1, z: -28.0, yaw: Math.PI },
      { x: -6.5, y: 0.1, z: -28.0, yaw: Math.PI },
      { x: 6.5, y: 0.1, z: -28.0, yaw: Math.PI },
      { x: -13.0, y: 0.1, z: -28.0, yaw: Math.PI },
      { x: 13.0, y: 0.1, z: -28.0, yaw: Math.PI },
      { x: -20.0, y: 0.1, z: -28.0, yaw: Math.PI },
      { x: 20.0, y: 0.1, z: -28.0, yaw: Math.PI }
    ],
    bravo: [
      { x: 0, y: 0.1, z: 28.0, yaw: 0 },
      { x: -6.5, y: 0.1, z: 28.0, yaw: 0 },
      { x: 6.5, y: 0.1, z: 28.0, yaw: 0 },
      { x: -13.0, y: 0.1, z: 28.0, yaw: 0 },
      { x: 13.0, y: 0.1, z: 28.0, yaw: 0 },
      { x: -20.0, y: 0.1, z: 28.0, yaw: 0 },
      { x: 20.0, y: 0.1, z: 28.0, yaw: 0 }
    ]
  }
};

export { FY_ICEWORLD_MAP as FY_ICEWORLD };
