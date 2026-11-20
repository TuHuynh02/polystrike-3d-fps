// ============================================================================
// MAP 3: DE_INFERNO (72x72m — CS2 / CS:GO Inferno B-Site & Banana Wingman)
// Tuscan Terracotta Stucco & Cobblestone: B-Site Fountain Basin, New Box,
// First & Second Oranges, Banana Car & Half-Wall, Sandbags, CT Coffins & Church Arch
// ============================================================================

import {
  createBoostPair,
  createDoubleDoors,
  createPerimeterWalls,
  createStairs
} from './helpers.js';

export const DE_INFERNO_OBSTACLES = [
  ...createPerimeterWalls(36, 0x7c2d12),

  // 1. B-SITE CENTRAL FOUNTAIN BASIN & STONE SPIRE (x = 0, z = -3.0)
  { x: 0, y: 0.475, z: -3.0, w: 6.2, h: 0.95, d: 6.2, color: 0x94a3b8, type: 'platform' },
  { x: 0, y: 2.25, z: -3.0, w: 2.0, h: 2.6, d: 2.0, color: 0x64748b, type: 'pillar' },

  // 2. NEW BOX & FIRST / SECOND ORANGES (B-Site Perimeter Cover)
  // New Box (West B-Site) + thin wood screen (0.66m <= 0.72m)
  { x: -11.5, y: 1.2, z: -7.5, w: 2.6, h: 2.4, d: 2.6, color: 0xd97706, type: 'crate' },
  { x: -9.8, y: 0.7, z: -9.5, w: 0.66, h: 1.4, d: 2.8, color: 0xea580c, type: 'crate' },
  // First Oranges & Second Oranges Boost Pair (East B-Site)
  { x: 12.0, y: 1.15, z: -7.5, w: 2.4, h: 2.3, d: 2.4, color: 0xea580c, type: 'crate' },
  ...createBoostPair(12.0, -1.5, 0, 2.0, 0xea580c, 0xf59e0b, 0),

  // 3. CT CONSTRUCTION / COFFINS DECK (NW, h = 2.2m, stepH = 0.44m)
  { x: -21.5, y: 1.1, z: -20.5, w: 10.0, h: 2.2, d: 9.0, color: 0x78716c, type: 'platform' },
  { x: -17.8, y: 2.8, z: -17.8, w: 2.4, h: 1.2, d: 1.4, color: 0xd97706, type: 'crate' },
  ...createStairs(-21.5, -11.5, 3.8, 1.0, 0, -1, 5, 0.44, 0xa8a29e),
  ...createStairs(-12.0, -20.5, 3.6, 1.0, -1, 0, 5, 0.44, 0xa8a29e),

  // 4. CHURCH ARCHWAY & GARDEN CLOISTER DECK (NE, h = 2.2m)
  { x: 21.5, y: 1.1, z: -20.5, w: 10.0, h: 2.2, d: 9.0, color: 0x78716c, type: 'platform' },
  { x: 17.5, y: 4.1, z: -16.8, w: 1.6, h: 3.8, d: 1.6, color: 0x9a3412, type: 'pillar' },
  { x: 25.5, y: 4.1, z: -16.8, w: 1.6, h: 3.8, d: 1.6, color: 0x9a3412, type: 'pillar' },
  ...createStairs(21.5, -11.5, 3.8, 1.0, 0, -1, 5, 0.44, 0xa8a29e),
  // Church Archway CT-to-B Gateway (4.8m central archway at z = -17.5)
  ...createDoubleDoors(0, -17.5, 6.4, 4.8, 1.8, 3.6, true, 0xb45309),

  // 5. BANANA CHOKE, HALF-WALL, CAR & SANDBAGS (South Half)
  { x: -12.5, y: 1.9, z: 7.5, w: 11.0, h: 3.8, d: 2.0, color: 0x9a3412, type: 'wall' },
  { x: 12.5, y: 1.9, z: 7.5, w: 11.0, h: 3.8, d: 2.0, color: 0x9a3412, type: 'wall' },
  // Iconic Banana Half-Wall (d = 0.68m <= 0.72m wallbangable brick/stucco)
  { x: 2.5, y: 0.75, z: 12.5, w: 4.4, h: 1.5, d: 0.68, color: 0xb45309, type: 'wall' },
  // Banana Car cover chassis
  { x: -4.5, y: 0.9, z: 14.5, w: 2.4, h: 1.8, d: 4.8, color: 0x475569, type: 'container' },
  // Sandbags corner boost pair
  ...createBoostPair(-10.5, 18.0, 2.0, 0, 0xd97706, 0xf59e0b, 0),

  // 6. BOTTOM BANANA LOG TERRACE (SW) & T-APARTMENTS BALCONY (SE, h = 2.2m)
  { x: -23.5, y: 1.1, z: 18.5, w: 9.0, h: 2.2, d: 9.0, color: 0x78716c, type: 'platform' },
  ...createStairs(-23.5, 9.5, 3.6, 1.0, 0, 1, 5, 0.44, 0xa8a29e),

  { x: 23.5, y: 1.1, z: 18.5, w: 9.0, h: 2.2, d: 9.0, color: 0x78716c, type: 'platform' },
  ...createStairs(23.5, 9.5, 3.6, 1.0, 0, 1, 5, 0.44, 0xa8a29e),
  { x: 19.4, y: 2.8, z: 18.5, w: 0.68, h: 1.2, d: 3.6, color: 0xd97706, type: 'crate' },

  // T-Ramp cover wall & wallbangable Banana Logs barricade
  { x: 0, y: 1.4, z: 23.5, w: 5.4, h: 2.8, d: 1.6, color: 0x9a3412, type: 'wall' },
  { x: 11.5, y: 0.68, z: 19.5, w: 3.2, h: 1.36, d: 0.68, color: 0xd97706, type: 'crate' }
];

const DE_INFERNO_HEALTH_PACKS = [
  { id: 'hp_fountain_n', x: 0, y: 0, z: -10.5 },
  { id: 'hp_banana_top', x: 0, y: 0, z: 7.5 },
  { id: 'hp_coffins', x: -21.5, y: 2.2, z: -20.5 },
  { id: 'hp_church', x: 21.5, y: 2.2, z: -20.5 },
  { id: 'hp_t_logs', x: -23.5, y: 2.2, z: 18.5 },
  { id: 'hp_t_apts', x: 23.5, y: 2.2, z: 18.5 }
];

export const DE_INFERNO_MAP = {
  id: 'de_inferno',
  name: 'INFERNO // ITALY BANANA',
  subtitle: '72x72m • CS2 Inferno Wingman: B-Site Fountain, New Box, Oranges, Banana Car/Sandbags, CT Coffins & Church Arch',
  badge: '72x72m • CS2 Inferno B-Site & Banana',
  inspiration: 'Counter-Strike 2 / CS:GO de_inferno',
  layoutType: 'B-Site Fountain, New Box/Oranges, Banana Car & Half-Wall, CT Construction/Coffins & Church Arch',
  arenaHalfSize: 36,
  theme: {
    skyTop: '#2c6fb3',
    skyMid: '#80b6dc',
    skyHorizon: '#eed8bc',
    fogColor: 0xe3cfb5,
    fogDensity: 0.0036,
    floorBase: '#a89a87',
    floorAlt: '#968775',
    gridStroke: 'rgba(180, 96, 52, 0.28)',
    accentHex: 0xea580c,
    secondaryHex: 0x0ea5e9
  },
  callouts: [
    { id: 'b_fountain', name: 'B-SITE FOUNTAIN', shortName: 'FOUNTAIN', x: 0, z: -3.0, radius: 9 },
    { id: 'new_box', name: 'NEW BOX', shortName: 'NEW BOX', x: -11.5, z: -7.5, radius: 8 },
    { id: 'oranges', name: 'FIRST & SECOND ORANGES', shortName: 'ORANGES', x: 12.0, z: -4.0, radius: 9 },
    { id: 'coffins', name: 'CT CONSTRUCTION & COFFINS', shortName: 'COFFINS', x: -21.5, z: -20.5, radius: 10 },
    { id: 'church', name: 'CHURCH ARCHWAY', shortName: 'CHURCH', x: 0, z: -17.5, radius: 9 },
    { id: 'garden', name: 'GARDEN CLOISTER', shortName: 'GARDEN', x: 21.5, z: -20.5, radius: 10 },
    { id: 'banana_car', name: 'BANANA CAR', shortName: 'CAR', x: -4.5, z: 14.5, radius: 8 },
    { id: 'half_wall', name: 'BANANA HALF-WALL', shortName: 'HALF-WALL', x: 2.5, z: 12.5, radius: 8 },
    { id: 'sandbags', name: 'BANANA SANDBAGS', shortName: 'SANDBAGS', x: -10.5, z: 18.0, radius: 8 },
    { id: 't_ramp', name: 'T-RAMP & LOGS', shortName: 'T-RAMP', x: 0, z: 26.0, radius: 9 }
  ],
  obstacles: DE_INFERNO_OBSTACLES,
  healthPacks: DE_INFERNO_HEALTH_PACKS,
  healthPackSpawns: DE_INFERNO_HEALTH_PACKS,
  powerups: [
    { id: 'pu_damage_b', type: 'damage', x: -6.5, y: 0, z: -3.0 },
    { id: 'pu_armor_b', type: 'armor', x: 6.5, y: 0, z: -3.0 },
    { id: 'pu_speed_ban', type: 'speed', x: 7.0, y: 0, z: 15.0 },
    { id: 'pu_armor_ct', type: 'armor', x: 0, y: 0, z: -24.0 }
  ],
  jumpPads: [
    { id: 'jp_w', x: -16.5, y: 0, z: 0.0, radius: 1.25, jumpForce: 13.5 },
    { id: 'jp_e', x: 16.5, y: 0, z: 0.0, radius: 1.25, jumpForce: 13.5 }
  ],
  barrels: [
    { id: 'brl_1', x: -6.0, y: 0, z: 3.5 },
    { id: 'brl_2', x: 6.0, y: 0, z: 3.5 },
    { id: 'brl_3', x: -15.0, y: 0, z: -12.0 },
    { id: 'brl_4', x: 15.0, y: 0, z: -12.0 },
    { id: 'brl_5', x: -4.0, y: 0, z: 21.0 }
  ],
  spawnPoints: [
    { x: -31.5, y: 0.1, z: -31.5, yaw: -Math.PI * 0.75 },
    { x: 31.5, y: 0.1, z: -31.5, yaw: Math.PI * 0.75 },
    { x: -31.5, y: 0.1, z: 31.5, yaw: -Math.PI * 0.25 },
    { x: 31.5, y: 0.1, z: 31.5, yaw: Math.PI * 0.25 },
    { x: 0, y: 0.1, z: -31.5, yaw: Math.PI },
    { x: 0, y: 0.1, z: 31.5, yaw: 0 },
    { x: -14.0, y: 0.1, z: -31.5, yaw: Math.PI },
    { x: 14.0, y: 0.1, z: -31.5, yaw: Math.PI },
    { x: -14.0, y: 0.1, z: 31.5, yaw: 0 },
    { x: 14.0, y: 0.1, z: 31.5, yaw: 0 },
    { x: -32.0, y: 0.1, z: -3.0, yaw: -Math.PI * 0.5 },
    { x: 32.0, y: 0.1, z: -3.0, yaw: Math.PI * 0.5 },
    { x: -32.0, y: 0.1, z: 12.0, yaw: -Math.PI * 0.5 },
    { x: 32.0, y: 0.1, z: 12.0, yaw: Math.PI * 0.5 }
  ],
  teamSpawns: {
    alpha: [
      { x: 0, y: 0.1, z: -31.5, yaw: Math.PI },
      { x: -7, y: 0.1, z: -31.5, yaw: Math.PI },
      { x: 7, y: 0.1, z: -31.5, yaw: Math.PI },
      { x: -14, y: 0.1, z: -31.5, yaw: Math.PI },
      { x: 14, y: 0.1, z: -31.5, yaw: Math.PI },
      { x: -22, y: 0.1, z: -31.5, yaw: Math.PI },
      { x: 22, y: 0.1, z: -31.5, yaw: Math.PI }
    ],
    bravo: [
      { x: 0, y: 0.1, z: 31.5, yaw: 0 },
      { x: -7, y: 0.1, z: 31.5, yaw: 0 },
      { x: 7, y: 0.1, z: 31.5, yaw: 0 },
      { x: -14, y: 0.1, z: 31.5, yaw: 0 },
      { x: 14, y: 0.1, z: 31.5, yaw: 0 },
      { x: -22, y: 0.1, z: 31.5, yaw: 0 },
      { x: 22, y: 0.1, z: 31.5, yaw: 0 }
    ]
  }
};

export { DE_INFERNO_MAP as DE_INFERNO };
