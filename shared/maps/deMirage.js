// ============================================================================
// MAP 2: DE_MIRAGE (76x76m — CS2 / CS:GO Mirage A-Site & Mid Retake)
// Moroccan Palace Sandstone & Ochre Stucco: A-Site Triple Box & Firebox,
// Tetris & A-Ramp, Palace Balcony, Stairs & Jungle, Connector, Mid Window & Ticket Booth
// ============================================================================

import {
  createBoostPair,
  createPerimeterWalls,
  createStairs
} from './helpers.js';

export const DE_MIRAGE_OBSTACLES = [
  ...createPerimeterWalls(38, 0x8c5a32),

  // 1. A-SITE CORE: TRIPLE BOX, FIREBOX / NINJA & DEFAULT PLANT BOX (East-Center)
  // Iconic Triple Box stack (tall 2.7m + side 1.5m)
  { x: 14.5, y: 1.35, z: -4.5, w: 2.2, h: 2.7, d: 2.2, color: 0xd97706, type: 'crate' },
  { x: 16.7, y: 0.75, z: -4.5, w: 2.0, h: 1.5, d: 2.0, color: 0xf59e0b, type: 'crate' },
  // Firebox & thin Ninja wood screen (d = 0.68m <= 0.72m)
  { x: 22.0, y: 1.1, z: -11.5, w: 2.4, h: 2.2, d: 2.4, color: 0xc27834, type: 'crate' },
  { x: 24.5, y: 1.0, z: -13.2, w: 2.6, h: 2.0, d: 0.68, color: 0xb45309, type: 'crate' },
  // Default plant box
  { x: 17.5, y: 0.9, z: 2.5, w: 2.2, h: 1.8, d: 2.2, color: 0xd97706, type: 'crate' },

  // 2. PALACE BALCONY PLATFORM (SE, h = 2.4m)
  { x: 26.5, y: 1.2, z: 14.5, w: 11.0, h: 2.4, d: 11.0, color: 0xa17648, type: 'platform' },
  { x: 21.8, y: 4.4, z: 9.8, w: 1.4, h: 4.0, d: 1.4, color: 0x7c5330, type: 'pillar' },
  { x: 21.8, y: 4.4, z: 19.2, w: 1.4, h: 4.0, d: 1.4, color: 0x7c5330, type: 'pillar' },
  { x: 21.4, y: 3.0, z: 14.5, w: 0.68, h: 1.2, d: 4.0, color: 0xc27834, type: 'crate' },
  ...createStairs(26.5, 24.5, 4.0, 1.0, 0, -1, 5, 0.48, 0x8c6239),

  // 3. TETRIS BOOST & A-RAMP WALLS (South-East)
  ...createBoostPair(12.5, 13.0, 0, 2.0, 0xd97706, 0xf59e0b, 0),
  { x: 18.0, y: 1.8, z: 22.0, w: 2.0, h: 3.6, d: 9.0, color: 0xb5804b, type: 'wall' },
  { x: 6.5, y: 1.8, z: 21.0, w: 2.0, h: 3.6, d: 8.5, color: 0xb5804b, type: 'wall' },

  // 4. A-STAIRS & JUNGLE OVERWATCH PLATFORM (Center-North, h = 2.4m)
  { x: 0.0, y: 1.2, z: -4.0, w: 10.0, h: 2.4, d: 9.0, color: 0xa17648, type: 'platform' },
  ...createStairs(9.5, -4.0, 4.2, 1.0, -1, 0, 5, 0.48, 0x8c6239),
  ...createStairs(0.0, -13.0, 4.0, 1.0, 0, 1, 5, 0.48, 0x8c6239),
  { x: 4.5, y: 3.0, z: -1.5, w: 0.68, h: 1.2, d: 3.2, color: 0xb5804b, type: 'crate' },

  // 5. CONNECTOR CORRIDOR & JUNGLE ARCH WALLS
  { x: -4.5, y: 1.9, z: 10.5, w: 2.0, h: 3.8, d: 8.5, color: 0xb5804b, type: 'wall' },
  { x: 3.5, y: 1.9, z: 10.5, w: 2.0, h: 3.8, d: 8.5, color: 0xb5804b, type: 'wall' },
  { x: -8.5, y: 1.9, z: -13.5, w: 2.0, h: 3.8, d: 8.5, color: 0xb5804b, type: 'wall' },

  // 6. MID WINDOW (SNIPERS' NEST) PLATFORM (NW, h = 2.4m)
  { x: -23.5, y: 1.2, z: -15.5, w: 10.0, h: 2.4, d: 9.0, color: 0xa17648, type: 'platform' },
  { x: -26.8, y: 3.5, z: -11.4, w: 3.0, h: 2.2, d: 0.7, color: 0xc49562, type: 'wall' },
  { x: -20.2, y: 3.5, z: -11.4, w: 3.0, h: 2.2, d: 0.7, color: 0xc49562, type: 'wall' },
  { x: -23.5, y: 2.9, z: -11.4, w: 3.6, h: 1.0, d: 0.68, color: 0x8c6239, type: 'crate' },
  ...createStairs(-23.5, -24.5, 4.0, 1.0, 0, 1, 5, 0.48, 0x8c6239),

  // 7. MID BOXES, TOP-MID BOOST & SHORT CATWALK DECK (West-South)
  { x: -16.5, y: 1.1, z: 3.5, w: 2.6, h: 2.2, d: 2.6, color: 0xd97706, type: 'crate' },
  ...createBoostPair(-19.5, 14.5, 0, 2.0, 0xd97706, 0xf59e0b, 0),
  { x: -26.5, y: 1.2, z: 14.0, w: 9.0, h: 2.4, d: 10.0, color: 0xa17648, type: 'platform' },
  ...createStairs(-26.5, 23.5, 3.8, 1.0, 0, -1, 5, 0.48, 0x8c6239),
  { x: -22.4, y: 3.0, z: 12.5, w: 0.68, h: 1.2, d: 3.0, color: 0xc49562, type: 'crate' },

  // 8. TICKET BOOTH, CT ARCH PILLAR & SPAWN COVER WALLS
  { x: 14.0, y: 1.5, z: -22.5, w: 3.6, h: 3.0, d: 5.2, color: 0x334155, type: 'container' },
  { x: 11.4, y: 0.55, z: -22.5, w: 1.5, h: 1.1, d: 1.5, color: 0xf59e0b, type: 'crate' },
  { x: 26.5, y: 2.2, z: -22.5, w: 2.6, h: 4.4, d: 2.6, color: 0x7c5330, type: 'pillar' },
  { x: -3.5, y: 1.6, z: -23.5, w: 6.0, h: 3.2, d: 1.8, color: 0xb5804b, type: 'wall' },
  { x: -12.0, y: 1.8, z: 24.5, w: 6.5, h: 3.6, d: 1.8, color: 0xb5804b, type: 'wall' }
];

const DE_MIRAGE_HEALTH_PACKS = [
  { id: 'hp_a_site', x: 19.0, y: 0, z: -5.5 },
  { id: 'hp_palace', x: 26.5, y: 2.4, z: 14.5 },
  { id: 'hp_stairs', x: 0.0, y: 2.4, z: -4.0 },
  { id: 'hp_window', x: -23.5, y: 2.4, z: -15.5 },
  { id: 'hp_mid', x: -11.5, y: 0, z: 3.5 },
  { id: 'hp_ramp', x: 12.0, y: 0, z: 22.0 }
];

export const DE_MIRAGE_MAP = {
  id: 'de_mirage',
  name: 'MIRAGE // MOROCCO PALACE',
  subtitle: '76x76m • CS2 Mirage Retake: A-Site Triple/Firebox, Palace Balcony, Tetris, Stairs, Jungle, Connector & Mid Window',
  badge: '76x76m • CS2 Mirage A-Site & Mid',
  inspiration: 'Counter-Strike 2 / CS:GO de_mirage',
  layoutType: 'A-Site Triple/Firebox, Palace Balcony, A-Ramp/Tetris, Stairs/Jungle, Connector & Mid Window',
  arenaHalfSize: 38,
  theme: {
    skyTop: '#2663a6',
    skyMid: '#7cb8df',
    skyHorizon: '#edd9b3',
    fogColor: 0xe3cfa9,
    fogDensity: 0.0034,
    floorBase: '#d0bc98',
    floorAlt: '#c1aa84',
    gridStroke: 'rgba(186, 134, 68, 0.28)',
    accentHex: 0xd97706,
    secondaryHex: 0x0f766e
  },
  callouts: [
    { id: 'a_triple', name: 'A-SITE TRIPLE BOX', shortName: 'A-SITE', x: 16.0, z: -4.5, radius: 10 },
    { id: 'firebox', name: 'FIREBOX & NINJA', shortName: 'FIREBOX', x: 23.0, z: -12.0, radius: 8 },
    { id: 'palace', name: 'PALACE BALCONY', shortName: 'PALACE', x: 26.5, z: 14.5, radius: 10 },
    { id: 'tetris', name: 'TETRIS & A-RAMP', shortName: 'TETRIS', x: 12.5, z: 14.5, radius: 9 },
    { id: 'stairs', name: 'A-STAIRS', shortName: 'STAIRS', x: 0.0, z: -4.0, radius: 9 },
    { id: 'jungle', name: 'JUNGLE ARCH', shortName: 'JUNGLE', x: -6.0, z: -14.0, radius: 9 },
    { id: 'connector', name: 'CONNECTOR', shortName: 'CONN', x: -0.5, z: 10.5, radius: 8 },
    { id: 'window', name: 'MID WINDOW NEST', shortName: 'WINDOW', x: -23.5, z: -15.5, radius: 10 },
    { id: 'ticket', name: 'CT TICKET BOOTH', shortName: 'TICKET', x: 14.0, z: -22.5, radius: 9 },
    { id: 'catwalk', name: 'MID SHORT CATWALK', shortName: 'CATWALK', x: -26.5, z: 14.0, radius: 10 }
  ],
  obstacles: DE_MIRAGE_OBSTACLES,
  healthPacks: DE_MIRAGE_HEALTH_PACKS,
  healthPackSpawns: DE_MIRAGE_HEALTH_PACKS,
  powerups: [
    { id: 'pu_damage_conn', type: 'damage', x: -0.5, y: 0, z: 10.5 },
    { id: 'pu_armor_ticket', type: 'armor', x: 20.0, y: 0, z: -22.5 },
    { id: 'pu_speed_mid', type: 'speed', x: -16.5, y: 0, z: -4.0 },
    { id: 'pu_armor_cat', type: 'armor', x: -26.5, y: 2.4, z: 15.0 }
  ],
  jumpPads: [
    { id: 'jp_mid_w', x: -12.5, y: 0, z: -6.5, radius: 1.3, jumpForce: 13.8 },
    { id: 'jp_a_se', x: 14.0, y: 0, z: 7.5, radius: 1.3, jumpForce: 13.8 }
  ],
  barrels: [
    { id: 'brl_1', x: 9.0, y: 0, z: 6.0 },
    { id: 'brl_2', x: -11.5, y: 0, z: 10.5 },
    { id: 'brl_3', x: 22.0, y: 0, z: 2.5 },
    { id: 'brl_4', x: -15.5, y: 0, z: -16.5 },
    { id: 'brl_5', x: 5.5, y: 0, z: -21.0 }
  ],
  spawnPoints: [
    { x: -33.5, y: 0.1, z: -33.5, yaw: -Math.PI * 0.75 },
    { x: 33.5, y: 0.1, z: -33.5, yaw: Math.PI * 0.75 },
    { x: -33.5, y: 0.1, z: 33.5, yaw: -Math.PI * 0.25 },
    { x: 33.5, y: 0.1, z: 33.5, yaw: Math.PI * 0.25 },
    { x: 0, y: 0.1, z: -33.5, yaw: Math.PI },
    { x: 0, y: 0.1, z: 33.5, yaw: 0 },
    { x: -16.0, y: 0.1, z: -33.5, yaw: Math.PI },
    { x: 16.0, y: 0.1, z: -33.5, yaw: Math.PI },
    { x: -16.0, y: 0.1, z: 33.5, yaw: 0 },
    { x: 16.0, y: 0.1, z: 33.5, yaw: 0 },
    { x: -34.0, y: 0.1, z: -3.0, yaw: -Math.PI * 0.5 },
    { x: 34.0, y: 0.1, z: -3.0, yaw: Math.PI * 0.5 },
    { x: -34.0, y: 0.1, z: -24.0, yaw: -Math.PI * 0.5 },
    { x: 34.0, y: 0.1, z: -24.0, yaw: Math.PI * 0.5 },
    { x: -34.0, y: 0.1, z: 24.0, yaw: -Math.PI * 0.5 },
    { x: 34.0, y: 0.1, z: 24.0, yaw: Math.PI * 0.5 }
  ],
  teamSpawns: {
    alpha: [
      { x: 0, y: 0.1, z: -33.5, yaw: Math.PI },
      { x: -7, y: 0.1, z: -33.5, yaw: Math.PI },
      { x: 7, y: 0.1, z: -33.5, yaw: Math.PI },
      { x: -15, y: 0.1, z: -33.5, yaw: Math.PI },
      { x: 15, y: 0.1, z: -33.5, yaw: Math.PI },
      { x: -24, y: 0.1, z: -33.5, yaw: Math.PI },
      { x: 24, y: 0.1, z: -33.5, yaw: Math.PI }
    ],
    bravo: [
      { x: 0, y: 0.1, z: 33.5, yaw: 0 },
      { x: -7, y: 0.1, z: 33.5, yaw: 0 },
      { x: 7, y: 0.1, z: 33.5, yaw: 0 },
      { x: -15, y: 0.1, z: 33.5, yaw: 0 },
      { x: 15, y: 0.1, z: 33.5, yaw: 0 },
      { x: -24, y: 0.1, z: 33.5, yaw: 0 },
      { x: 24, y: 0.1, z: 33.5, yaw: 0 }
    ]
  }
};

export { DE_MIRAGE_MAP as DE_MIRAGE };
