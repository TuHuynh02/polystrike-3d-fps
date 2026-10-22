// ============================================================================
// MAP 2: CARGO DOCKYARD (128x128m — CrossFire Tàu Chở Hàng & Valorant Icebox)
// Symmetric Container Ship Deck: Central Overwatch Bridge (Mid Nest),
// 3-Lane Container Weave, Skill-Jump Boost Crates & West/East Gantry Crane Decks
// ============================================================================

import {
  createBoostPair,
  createDoubleDoors,
  createPerimeterWalls,
  createStairs
} from './helpers.js';

export const CARGO_DOCK_OBSTACLES = [
  ...createPerimeterWalls(64, 0x1e293b),

  // 1. CENTRAL ELEVATED CARGO BRIDGE / MID NEST (CF Transport Ship Bridge & Icebox Boiler — 22x12m, h: 2.4m)
  { x: 0, y: 1.2, z: 0, w: 22, h: 2.4, d: 12, color: 0x334155, type: 'platform' },
  { x: -6, y: 3.6, z: 0, w: 3.2, h: 2.4, d: 6.5, color: 0xe11d48, type: 'container' },
  { x: 6, y: 3.6, z: 0, w: 3.2, h: 2.4, d: 6.5, color: 0x0284c7, type: 'container' },
  // Head-glitch sniper parapet crates overlooking North & South container yards
  { x: 0, y: 3.05, z: -4.8, w: 4.2, h: 1.3, d: 1.2, color: 0xf59e0b, type: 'crate' },
  { x: 0, y: 3.05, z: 4.8, w: 4.2, h: 1.3, d: 1.2, color: 0xf59e0b, type: 'crate' },
  ...createStairs(-15.5, 0, 4.5, 1.0, 1, 0, 5, 0.48, 0x475569),
  ...createStairs(15.5, 0, 4.5, 1.0, -1, 0, 5, 0.48, 0x475569),

  // 2. NORTH & SOUTH CONTAINER YARDS (CF Tàu Chở Hàng Iconic 3-Corridor Container Weave & Boosts)
  { x: -16, y: 1.8, z: -18, w: 3.6, h: 3.6, d: 9.5, color: 0xe11d48, type: 'container' },
  { x: 0, y: 1.8, z: -19, w: 9.5, h: 3.6, d: 3.6, color: 0xd97706, type: 'container' },
  { x: 16, y: 1.8, z: -18, w: 3.6, h: 3.6, d: 9.5, color: 0x0284c7, type: 'container' },
  ...createBoostPair(-8, -14, 0, 1.9, 0xf59e0b, 0xd97706, 0),
  ...createBoostPair(8, -14, 0, 1.9, 0x10b981, 0x38bdf8, 0),

  { x: -16, y: 1.8, z: 18, w: 3.6, h: 3.6, d: 9.5, color: 0x0284c7, type: 'container' },
  { x: 0, y: 1.8, z: 19, w: 9.5, h: 3.6, d: 3.6, color: 0x10b981, type: 'container' },
  { x: 16, y: 1.8, z: 18, w: 3.6, h: 3.6, d: 9.5, color: 0xe11d48, type: 'container' },
  ...createBoostPair(-8, 14, 0, -1.9, 0x10b981, 0x38bdf8, 0),
  ...createBoostPair(8, 14, 0, -1.9, 0xf59e0b, 0xd97706, 0),

  // 3. WEST & EAST GANTRY CRANE PLATFORMS (Valorant Icebox B-Yellow & A-Belt Decks — y=2.0m)
  { x: -38, y: 1.0, z: 0, w: 12, h: 2.0, d: 16, color: 0x334155, type: 'platform' },
  { x: -38, y: 4.2, z: 0, w: 2.8, h: 4.4, d: 2.8, color: 0x0f172a, type: 'pillar' },
  { x: -33, y: 2.65, z: -5, w: 1.6, h: 1.3, d: 3.2, color: 0xf59e0b, type: 'crate' },
  { x: -33, y: 2.65, z: 5, w: 1.6, h: 1.3, d: 3.2, color: 0xf59e0b, type: 'crate' },
  ...createStairs(-38, -11.5, 4.2, 1.0, 0, 1, 4, 0.5, 0x64748b),
  ...createStairs(-38, 11.5, 4.2, 1.0, 0, -1, 4, 0.5, 0x64748b),

  { x: 38, y: 1.0, z: 0, w: 12, h: 2.0, d: 16, color: 0x334155, type: 'platform' },
  { x: 38, y: 4.2, z: 0, w: 2.8, h: 4.4, d: 2.8, color: 0x0f172a, type: 'pillar' },
  { x: 33, y: 2.65, z: -5, w: 1.6, h: 1.3, d: 3.2, color: 0x38bdf8, type: 'crate' },
  { x: 33, y: 2.65, z: 5, w: 1.6, h: 1.3, d: 3.2, color: 0x38bdf8, type: 'crate' },
  ...createStairs(38, -11.5, 4.2, 1.0, 0, 1, 4, 0.5, 0x64748b),
  ...createStairs(38, 11.5, 4.2, 1.0, 0, -1, 4, 0.5, 0x64748b),

  // 4. 4 QUADRANT CONTAINER CHICANES & SIDE SNIPER ALLEYS (NW, NE, SW, SE)
  { x: -34, y: 1.8, z: -32, w: 10, h: 3.6, d: 3.6, color: 0xd97706, type: 'container' },
  { x: -24, y: 1.8, z: -38, w: 3.6, h: 3.6, d: 10, color: 0x0284c7, type: 'container' },
  { x: -44, y: 1.8, z: -42, w: 3.6, h: 3.6, d: 9, color: 0xe11d48, type: 'container' },
  { x: -32, y: 1.0, z: -44, w: 2.6, h: 2.0, d: 2.6, color: 0xf59e0b, type: 'crate' },

  { x: 34, y: 1.8, z: -32, w: 10, h: 3.6, d: 3.6, color: 0x0284c7, type: 'container' },
  { x: 24, y: 1.8, z: -38, w: 3.6, h: 3.6, d: 10, color: 0x10b981, type: 'container' },
  { x: 44, y: 1.8, z: -42, w: 3.6, h: 3.6, d: 9, color: 0xd97706, type: 'container' },
  { x: 32, y: 1.0, z: -44, w: 2.6, h: 2.0, d: 2.6, color: 0xf59e0b, type: 'crate' },

  { x: -34, y: 1.8, z: 32, w: 10, h: 3.6, d: 3.6, color: 0x10b981, type: 'container' },
  { x: -24, y: 1.8, z: 38, w: 3.6, h: 3.6, d: 10, color: 0xe11d48, type: 'container' },
  { x: -44, y: 1.8, z: 42, w: 3.6, h: 3.6, d: 9, color: 0x0284c7, type: 'container' },
  { x: -32, y: 1.0, z: 44, w: 2.6, h: 2.0, d: 2.6, color: 0xf59e0b, type: 'crate' },

  { x: 34, y: 1.8, z: 32, w: 10, h: 3.6, d: 3.6, color: 0xe11d48, type: 'container' },
  { x: 24, y: 1.8, z: 38, w: 3.6, h: 3.6, d: 10, color: 0xd97706, type: 'container' },
  { x: 44, y: 1.8, z: 42, w: 3.6, h: 3.6, d: 9, color: 0x10b981, type: 'container' },
  { x: 32, y: 1.0, z: 44, w: 2.6, h: 2.0, d: 2.6, color: 0xf59e0b, type: 'crate' },

  // 5. NORTH (ALPHA) & SOUTH (BRAVO) SPAWN WAREHOUSE HANGARS (CF Transport Ship Spawn Exit Bays)
  ...createDoubleDoors(0, -46, 8.5, 11.5, 1.6, 3.2, true, 0x475569),
  { x: 0, y: 1.2, z: -36, w: 4.8, h: 2.4, d: 2.4, color: 0xd97706, type: 'crate' },
  { x: -4.8, y: 0.65, z: -41, w: 2.2, h: 1.3, d: 0.68, color: 0x64748b, type: 'crate' },
  { x: 4.8, y: 0.65, z: -41, w: 2.2, h: 1.3, d: 0.68, color: 0x64748b, type: 'crate' },

  ...createDoubleDoors(0, 46, 8.5, 11.5, 1.6, 3.2, true, 0x475569),
  { x: 0, y: 1.2, z: 36, w: 4.8, h: 2.4, d: 2.4, color: 0xd97706, type: 'crate' },
  { x: -4.8, y: 0.65, z: 41, w: 2.2, h: 1.3, d: 0.68, color: 0x64748b, type: 'crate' },
  { x: 4.8, y: 0.65, z: 41, w: 2.2, h: 1.3, d: 0.68, color: 0x64748b, type: 'crate' },

  // 6. SIDE SNIPER ALLEY SHIELD WALLS & CQB PALLET STACKS
  { x: -24, y: 1.0, z: -8, w: 2.4, h: 2.0, d: 3.2, color: 0xf59e0b, type: 'crate' },
  { x: -24, y: 1.0, z: 8, w: 2.4, h: 2.0, d: 3.2, color: 0x38bdf8, type: 'crate' },
  { x: 24, y: 1.0, z: -8, w: 2.4, h: 2.0, d: 3.2, color: 0x38bdf8, type: 'crate' },
  { x: 24, y: 1.0, z: 8, w: 2.4, h: 2.0, d: 3.2, color: 0xf59e0b, type: 'crate' },
  { x: -50, y: 1.6, z: -20, w: 1.6, h: 3.2, d: 7.5, color: 0x475569, type: 'wall' },
  { x: 50, y: 1.6, z: -20, w: 1.6, h: 3.2, d: 7.5, color: 0x475569, type: 'wall' },
  { x: -50, y: 1.6, z: 20, w: 1.6, h: 3.2, d: 7.5, color: 0x475569, type: 'wall' },
  { x: 50, y: 1.6, z: 20, w: 1.6, h: 3.2, d: 7.5, color: 0x475569, type: 'wall' },
  { x: -14, y: 0.9, z: -30, w: 2.2, h: 1.8, d: 2.2, color: 0x10b981, type: 'crate' },
  { x: 14, y: 0.9, z: -30, w: 2.2, h: 1.8, d: 2.2, color: 0xe11d48, type: 'crate' },
  { x: -14, y: 0.9, z: 30, w: 2.2, h: 1.8, d: 2.2, color: 0xe11d48, type: 'crate' },
  { x: 14, y: 0.9, z: 30, w: 2.2, h: 1.8, d: 2.2, color: 0x10b981, type: 'crate' }
];

export const CARGO_DOCK_MAP = {
  id: 'cargo_dock',
  name: 'CARGO DOCKYARD',
  subtitle: '128x128m • Tàu Chở Hàng CF & Icebox: Mê cung Container, Cầu vượt Mid & Cần cẩu',
  badge: '128x128m • Tàu Chở Hàng / Icebox (CF & Valorant)',
  inspiration: 'CrossFire Tàu Chở Hàng (Transport Ship) / Valorant Icebox',
  layoutType: 'Symmetric Container Ship Deck, Mid Bridge & Crane Rafters',
  arenaHalfSize: 64,
  theme: {
    skyTop: '#040d1a',
    skyMid: '#0f2942',
    skyHorizon: '#155e75',
    fogColor: 0x081c2b,
    fogDensity: 0.005,
    floorBase: '#0f172a',
    floorAlt: '#162235',
    gridStroke: 'rgba(245, 158, 11, 0.25)',
    accentHex: 0xf59e0b,
    secondaryHex: 0x38bdf8
  },
  callouts: [
    { id: 'bridge_nest', name: 'CENTRAL BRIDGE NEST', shortName: 'BRIDGE', x: 0, z: 0, radius: 15 },
    { id: 'n_containers', name: 'NORTH CONTAINER MAZE', shortName: 'N-CARGO', x: 0, z: -19, radius: 16 },
    { id: 's_containers', name: 'SOUTH CONTAINER MAZE', shortName: 'S-CARGO', x: 0, z: 19, radius: 16 },
    { id: 'w_crane', name: 'WEST CRANE DECK (YELLOW)', shortName: 'W-CRANE', x: -38, z: 0, radius: 14 },
    { id: 'e_crane', name: 'EAST CRANE DECK (A-BELT)', shortName: 'E-CRANE', x: 38, z: 0, radius: 14 },
    { id: 'nw_alley', name: 'NW SNIPER ALLEY', shortName: 'NW-ALLEY', x: -34, z: -36, radius: 14 },
    { id: 'ne_alley', name: 'NE CONTAINER YARD', shortName: 'NE-YARD', x: 34, z: -36, radius: 14 },
    { id: 'sw_alley', name: 'SW CONTAINER YARD', shortName: 'SW-YARD', x: -34, z: 36, radius: 14 },
    { id: 'se_alley', name: 'SE SNIPER ALLEY', shortName: 'SE-ALLEY', x: 34, z: 36, radius: 14 },
    { id: 'alpha_hangar', name: 'ALPHA SPAWN HANGAR', shortName: 'N-HANGAR', x: 0, z: -50, radius: 14 },
    { id: 'bravo_hangar', name: 'BRAVO SPAWN HANGAR', shortName: 'S-HANGAR', x: 0, z: 50, radius: 14 }
  ],
  obstacles: CARGO_DOCK_OBSTACLES,
  healthPacks: [
    { id: 'hp_north', x: 0, y: 0, z: -28 },
    { id: 'hp_south', x: 0, y: 0, z: 28 },
    { id: 'hp_west', x: -28, y: 0, z: 0 },
    { id: 'hp_east', x: 28, y: 0, z: 0 },
    { id: 'hp_nw', x: -36, y: 0, z: -22 },
    { id: 'hp_se', x: 36, y: 0, z: 22 }
  ],
  powerups: [
    { id: 'pu_armor_n', type: 'armor', x: -16, y: 0, z: -28 },
    { id: 'pu_armor_s', type: 'armor', x: 16, y: 0, z: 28 },
    { id: 'pu_speed_w', type: 'speed', x: -28, y: 0, z: 16 },
    { id: 'pu_damage_center', type: 'damage', x: 0, y: 2.4, z: 0 }
  ],
  jumpPads: [
    { id: 'jp_nw', x: -22, y: 0, z: -18, radius: 1.35, jumpForce: 14.2 },
    { id: 'jp_ne', x: 22, y: 0, z: -18, radius: 1.35, jumpForce: 14.2 },
    { id: 'jp_sw', x: -22, y: 0, z: 18, radius: 1.35, jumpForce: 14.2 },
    { id: 'jp_se', x: 22, y: 0, z: 18, radius: 1.35, jumpForce: 14.2 }
  ],
  barrels: [
    { id: 'brl_1', x: -12, y: 0, z: -14 },
    { id: 'brl_2', x: 12, y: 0, z: -14 },
    { id: 'brl_3', x: -12, y: 0, z: 14 },
    { id: 'brl_4', x: 12, y: 0, z: 14 },
    { id: 'brl_5', x: -26, y: 0, z: 0 },
    { id: 'brl_6', x: 26, y: 0, z: 0 }
  ],
  spawnPoints: [
    { x: -56, y: 0.1, z: -56, yaw: -Math.PI * 0.75 },
    { x: 56, y: 0.1, z: -56, yaw: Math.PI * 0.75 },
    { x: -56, y: 0.1, z: 56, yaw: -Math.PI * 0.25 },
    { x: 56, y: 0.1, z: 56, yaw: Math.PI * 0.25 },
    { x: 0, y: 0.1, z: -56, yaw: Math.PI },
    { x: 0, y: 0.1, z: 56, yaw: 0 },
    { x: -56, y: 0.1, z: 0, yaw: -Math.PI * 0.5 },
    { x: 56, y: 0.1, z: 0, yaw: Math.PI * 0.5 },
    { x: -30, y: 0.1, z: -24, yaw: Math.PI },
    { x: 30, y: 0.1, z: 24, yaw: 0 },
    { x: -30, y: 0.1, z: 24, yaw: 0 },
    { x: 30, y: 0.1, z: -24, yaw: Math.PI },
    { x: -20, y: 0.1, z: -54, yaw: Math.PI },
    { x: 20, y: 0.1, z: -54, yaw: Math.PI },
    { x: -20, y: 0.1, z: 54, yaw: 0 },
    { x: 20, y: 0.1, z: 54, yaw: 0 },
    { x: -54, y: 0.1, z: -30, yaw: -Math.PI * 0.5 },
    { x: 54, y: 0.1, z: -30, yaw: Math.PI * 0.5 },
    { x: -54, y: 0.1, z: 30, yaw: -Math.PI * 0.5 },
    { x: 54, y: 0.1, z: 30, yaw: Math.PI * 0.5 }
  ],
  teamSpawns: {
    alpha: [
      { x: 0, y: 0.1, z: -56, yaw: Math.PI },
      { x: -7, y: 0.1, z: -56, yaw: Math.PI },
      { x: 7, y: 0.1, z: -56, yaw: Math.PI },
      { x: -14, y: 0.1, z: -56, yaw: Math.PI },
      { x: 14, y: 0.1, z: -56, yaw: Math.PI },
      { x: -20, y: 0.1, z: -54, yaw: Math.PI },
      { x: 20, y: 0.1, z: -54, yaw: Math.PI }
    ],
    bravo: [
      { x: 0, y: 0.1, z: 56, yaw: 0 },
      { x: -7, y: 0.1, z: 56, yaw: 0 },
      { x: 7, y: 0.1, z: 56, yaw: 0 },
      { x: -14, y: 0.1, z: 56, yaw: 0 },
      { x: 14, y: 0.1, z: 56, yaw: 0 },
      { x: -20, y: 0.1, z: 54, yaw: 0 },
      { x: 20, y: 0.1, z: 54, yaw: 0 }
    ]
  }
};
