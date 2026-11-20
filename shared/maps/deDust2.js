// ============================================================================
// MAP 1: DE_DUST2 (76x76m — CS2 / CS:GO Dust II Wingman & Retake)
// Sunlit Moroccan Limestone & Sandstone: Mid Double Doors, Xbox Boost -> Short A Catwalk,
// A-Site Goose/Ramp Platform, B-Site Platform, Long A Blue Container & B-Tunnel Archways
// ============================================================================

import {
  createDoubleDoors,
  createPerimeterWalls,
  createStairs
} from './helpers.js';

export const DE_DUST2_OBSTACLES = [
  ...createPerimeterWalls(38, 0x451a03),

  // 1. CENTRAL SHORT A CATWALK HUB (12x12m, h = 2.4m)
  { x: 0, y: 1.2, z: 0, w: 12, h: 2.4, d: 12, color: 0x78350f, type: 'platform' },
  { x: 0, y: 4.5, z: 0, w: 2.4, h: 4.2, d: 2.4, color: 0x451a03, type: 'pillar' },
  // 4 Corner Wallbangable Sandstone Parapets on Catwalk (d = 0.68m <= 0.72m)
  { x: -4.4, y: 3.0, z: -4.4, w: 2.6, h: 1.2, d: 0.68, color: 0xd97706, type: 'crate' },
  { x: 4.4, y: 3.0, z: 4.4, w: 2.6, h: 1.2, d: 0.68, color: 0xd97706, type: 'crate' },
  { x: -4.4, y: 3.0, z: 4.4, w: 2.6, h: 1.2, d: 0.68, color: 0xf59e0b, type: 'crate' },
  { x: 4.4, y: 3.0, z: -4.4, w: 2.6, h: 1.2, d: 0.68, color: 0xf59e0b, type: 'crate' },
  // North & South Short A Catwalk Stairs (5 steps x 0.48m = 2.4m)
  ...createStairs(0, -10.5, 4.2, 1.0, 0, 1, 5, 0.48, 0x92400e),
  ...createStairs(0, 10.5, 4.2, 1.0, 0, -1, 5, 0.48, 0x92400e),

  // Iconic Dust II XBOX Skill-Boost Stacks (Step 1.1m -> Xbox 2.0m -> Short A Catwalk 2.4m)
  { x: -7.1, y: 1.0, z: 2.5, w: 2.2, h: 2.0, d: 2.2, color: 0xd97706, type: 'crate' },
  { x: -7.1, y: 0.55, z: 4.5, w: 1.5, h: 1.1, d: 1.5, color: 0xf59e0b, type: 'crate' },
  { x: 7.1, y: 1.0, z: -2.5, w: 2.2, h: 2.0, d: 2.2, color: 0xd97706, type: 'crate' },
  { x: 7.1, y: 0.55, z: -4.5, w: 1.5, h: 1.1, d: 1.5, color: 0xf59e0b, type: 'crate' },

  // 2. MID DOUBLE DOORS (North CT Mid z = -17, South T Mid z = +17, 4.6m Sniper Peek Gap)
  ...createDoubleDoors(0, -17, 7.2, 4.6, 1.8, 3.4, true, 0xb45309),
  { x: 0, y: 1.4, z: -23.5, w: 5.4, h: 2.8, d: 1.6, color: 0x78350f, type: 'wall' },
  ...createDoubleDoors(0, 17, 7.2, 4.6, 1.8, 3.4, true, 0xb45309),
  { x: 0, y: 1.4, z: 23.5, w: 5.4, h: 2.8, d: 1.6, color: 0x78350f, type: 'wall' },

  // 3. WEST B-TUNNEL ARCHWAY WALLS & EAST SHORT-A GATEWAY WALLS (4.6m archway openings at z = 0)
  { x: -14.5, y: 1.8, z: -7.0, w: 2.0, h: 3.6, d: 9.4, color: 0x92400e, type: 'wall' },
  { x: -14.5, y: 1.8, z: 7.0, w: 2.0, h: 3.6, d: 9.4, color: 0x92400e, type: 'wall' },
  { x: 14.5, y: 1.8, z: -7.0, w: 2.0, h: 3.6, d: 9.4, color: 0x92400e, type: 'wall' },
  { x: 14.5, y: 1.8, z: 7.0, w: 2.0, h: 3.6, d: 9.4, color: 0x92400e, type: 'wall' },

  // 4. B-SITE, A-SITE GOOSE, B-WINDOW & A-RAMP PLATFORMS (h = 2.4m)
  // NW: B-Site Platform
  { x: -24.5, y: 1.2, z: -22.5, w: 9.0, h: 2.4, d: 9.0, color: 0x78350f, type: 'platform' },
  { x: -22.0, y: 3.05, z: -20.0, w: 2.4, h: 1.3, d: 1.4, color: 0xf59e0b, type: 'crate' },
  ...createStairs(-24.5, -13.5, 3.6, 1.0, 0, -1, 5, 0.48, 0xb45309),

  // NE: A-Site Goose Platform
  { x: 24.5, y: 1.2, z: -22.5, w: 9.0, h: 2.4, d: 9.0, color: 0x78350f, type: 'platform' },
  { x: 22.0, y: 3.05, z: -20.0, w: 2.4, h: 1.3, d: 1.4, color: 0xf59e0b, type: 'crate' },
  ...createStairs(24.5, -13.5, 3.6, 1.0, 0, -1, 5, 0.48, 0xb45309),

  // SW: B-Tunnel Car / Window Platform
  { x: -24.5, y: 1.2, z: 22.5, w: 9.0, h: 2.4, d: 9.0, color: 0x78350f, type: 'platform' },
  { x: -22.0, y: 3.05, z: 20.0, w: 2.4, h: 1.3, d: 1.4, color: 0xf59e0b, type: 'crate' },
  ...createStairs(-24.5, 13.5, 3.6, 1.0, 0, 1, 5, 0.48, 0xb45309),

  // SE: A-Ramp Platform
  { x: 24.5, y: 1.2, z: 22.5, w: 9.0, h: 2.4, d: 9.0, color: 0x78350f, type: 'platform' },
  { x: 22.0, y: 3.05, z: 20.0, w: 2.4, h: 1.3, d: 1.4, color: 0xf59e0b, type: 'crate' },
  ...createStairs(24.5, 13.5, 3.6, 1.0, 0, 1, 5, 0.48, 0xb45309),

  // 5. LONG A BLUE CONTAINER (0x0284c7) & B-TUNNEL SUPPLY CONTAINERS
  { x: 25.0, y: 1.6, z: -4.2, w: 3.2, h: 3.2, d: 7.2, color: 0x0284c7, type: 'container' },
  { x: 25.0, y: 1.6, z: 4.5, w: 3.2, h: 3.2, d: 6.4, color: 0xd97706, type: 'container' },
  { x: -25.0, y: 1.6, z: -4.2, w: 3.2, h: 3.2, d: 6.8, color: 0xd97706, type: 'container' },
  { x: -25.0, y: 1.6, z: 4.5, w: 3.2, h: 3.2, d: 6.4, color: 0x92400e, type: 'container' },

  // 6. COURTYARD SANDSTONE PILLARS
  { x: -13.5, y: 2.2, z: -24.5, w: 2.4, h: 4.4, d: 2.4, color: 0x78350f, type: 'pillar' },
  { x: 13.5, y: 2.2, z: -24.5, w: 2.4, h: 4.4, d: 2.4, color: 0x78350f, type: 'pillar' },
  { x: -13.5, y: 2.2, z: 24.5, w: 2.4, h: 4.4, d: 2.4, color: 0x78350f, type: 'pillar' },
  { x: 13.5, y: 2.2, z: 24.5, w: 2.4, h: 4.4, d: 2.4, color: 0x78350f, type: 'pillar' },

  // 7. MID ORDNANCE CRATES & THIN WALLBANGABLE HEAD-GLITCH BARRICADES (0.68m <= 0.72m)
  { x: -9.5, y: 1.0, z: -10.5, w: 2.0, h: 2.0, d: 2.0, color: 0xf59e0b, type: 'crate' },
  { x: 9.5, y: 1.0, z: -10.5, w: 2.0, h: 2.0, d: 2.0, color: 0xf59e0b, type: 'crate' },
  { x: -9.5, y: 1.0, z: 10.5, w: 2.0, h: 2.0, d: 2.0, color: 0xf59e0b, type: 'crate' },
  { x: 9.5, y: 1.0, z: 10.5, w: 2.0, h: 2.0, d: 2.0, color: 0xf59e0b, type: 'crate' },
  { x: 0, y: 0.65, z: -29.0, w: 3.4, h: 1.3, d: 0.68, color: 0xb45309, type: 'crate' },
  { x: 0, y: 0.65, z: 29.0, w: 3.4, h: 1.3, d: 0.68, color: 0xb45309, type: 'crate' },
  { x: -31.5, y: 0.65, z: 0, w: 0.68, h: 1.3, d: 3.4, color: 0xb45309, type: 'crate' },
  { x: 31.5, y: 0.65, z: 0, w: 0.68, h: 1.3, d: 3.4, color: 0xb45309, type: 'crate' }
];

const DE_DUST2_HEALTH_PACKS = [
  { id: 'hp_ct_mid', x: 0, y: 0, z: -13.5 },
  { id: 'hp_t_mid', x: 0, y: 0, z: 13.5 },
  { id: 'hp_b_tunnel', x: -19.5, y: 0, z: 0 },
  { id: 'hp_long_a', x: 19.5, y: 0, z: 0 },
  { id: 'hp_b_site', x: -26.0, y: 2.4, z: -24.0 },
  { id: 'hp_a_goose', x: 26.0, y: 2.4, z: -24.0 }
];

export const DE_DUST2_MAP = {
  id: 'de_dust2',
  name: 'DUST II // MOROCCO',
  subtitle: '76x76m • CS2 Dust II Retake: Mid Double Doors, Xbox Boost Catwalk, A-Site Goose, Long A Blue & B-Tunnel',
  badge: '76x76m • CS2 Dust II Retake',
  inspiration: 'Counter-Strike 2 / CS:GO de_dust2',
  layoutType: 'Mid Double Doors, Xbox Boost -> Short A Catwalk, A-Site Goose/Ramp & B-Tunnel',
  arenaHalfSize: 38,
  theme: {
    skyTop: '#2d6ea3',
    skyMid: '#7cb5dc',
    skyHorizon: '#e5d5b7',
    fogColor: 0xd9cbb0,
    fogDensity: 0.0036,
    floorBase: '#c6b08c',
    floorAlt: '#b89f78',
    gridStroke: 'rgba(180, 128, 64, 0.28)',
    accentHex: 0xd97706,
    secondaryHex: 0x0284c7
  },
  callouts: [
    { id: 'catwalk_xbox', name: 'SHORT A & XBOX', shortName: 'XBOX', x: 0, z: 0, radius: 10 },
    { id: 'ct_doors', name: 'CT MID DOUBLE DOORS', shortName: 'CT-DOORS', x: 0, z: -17, radius: 9 },
    { id: 't_doors', name: 'T MID DOUBLE DOORS', shortName: 'T-DOORS', x: 0, z: 17, radius: 9 },
    { id: 'b_tunnels', name: 'UPPER B-TUNNELS', shortName: 'B-TUNNEL', x: -19.5, z: 0, radius: 10 },
    { id: 'long_a', name: 'LONG A BLUE CONTAINER', shortName: 'LONG A', x: 25, z: -2, radius: 10 },
    { id: 'b_site', name: 'B-SITE PLATFORM', shortName: 'B-SITE', x: -24.5, z: -22.5, radius: 10 },
    { id: 'a_goose', name: 'A-SITE GOOSE', shortName: 'A-GOOSE', x: 24.5, z: -22.5, radius: 10 },
    { id: 'b_car', name: 'B-CAR & WINDOW', shortName: 'B-CAR', x: -24.5, z: 22.5, radius: 10 },
    { id: 'a_ramp', name: 'A-RAMP & CAR', shortName: 'A-RAMP', x: 24.5, z: 22.5, radius: 10 },
    { id: 'long_pit', name: 'LONG A PIT', shortName: 'A-PIT', x: 33, z: 0, radius: 8 }
  ],
  obstacles: DE_DUST2_OBSTACLES,
  healthPacks: DE_DUST2_HEALTH_PACKS,
  healthPackSpawns: DE_DUST2_HEALTH_PACKS,
  powerups: [
    { id: 'pu_armor_nw', type: 'armor', x: -17.0, y: 0, z: -17.0 },
    { id: 'pu_armor_se', type: 'armor', x: 17.0, y: 0, z: 17.0 },
    { id: 'pu_speed_w', type: 'speed', x: -19.5, y: 0, z: 9.0 },
    { id: 'pu_damage_cat', type: 'damage', x: 0, y: 2.4, z: 3.5 }
  ],
  jumpPads: [
    { id: 'jp_nw', x: -11.0, y: 0, z: -19.5, radius: 1.35, jumpForce: 14.2 },
    { id: 'jp_ne', x: 11.0, y: 0, z: -19.5, radius: 1.35, jumpForce: 14.2 },
    { id: 'jp_sw', x: -11.0, y: 0, z: 19.5, radius: 1.35, jumpForce: 14.2 },
    { id: 'jp_se', x: 11.0, y: 0, z: 19.5, radius: 1.35, jumpForce: 14.2 }
  ],
  barrels: [
    { id: 'brl_1', x: -11.5, y: 0, z: -14.0 },
    { id: 'brl_2', x: 11.5, y: 0, z: -14.0 },
    { id: 'brl_3', x: -11.5, y: 0, z: 14.0 },
    { id: 'brl_4', x: 11.5, y: 0, z: 14.0 },
    { id: 'brl_5', x: -20.5, y: 0, z: -4.2 },
    { id: 'brl_6', x: 20.5, y: 0, z: 4.5 }
  ],
  spawnPoints: [
    { x: -33.5, y: 0.1, z: -33.5, yaw: -Math.PI * 0.75 },
    { x: 33.5, y: 0.1, z: -33.5, yaw: Math.PI * 0.75 },
    { x: -33.5, y: 0.1, z: 33.5, yaw: -Math.PI * 0.25 },
    { x: 33.5, y: 0.1, z: 33.5, yaw: Math.PI * 0.25 },
    { x: 0, y: 0.1, z: -33.5, yaw: Math.PI },
    { x: 0, y: 0.1, z: 33.5, yaw: 0 },
    { x: -34.5, y: 0.1, z: 0, yaw: -Math.PI * 0.5 },
    { x: 34.5, y: 0.1, z: 0, yaw: Math.PI * 0.5 },
    { x: -16.0, y: 0.1, z: -33.5, yaw: Math.PI },
    { x: 16.0, y: 0.1, z: -33.5, yaw: Math.PI },
    { x: -16.0, y: 0.1, z: 33.5, yaw: 0 },
    { x: 16.0, y: 0.1, z: 33.5, yaw: 0 },
    { x: -33.5, y: 0.1, z: -14.0, yaw: -Math.PI * 0.5 },
    { x: 33.5, y: 0.1, z: -14.0, yaw: Math.PI * 0.5 },
    { x: -33.5, y: 0.1, z: 14.0, yaw: -Math.PI * 0.5 },
    { x: 33.5, y: 0.1, z: 14.0, yaw: Math.PI * 0.5 }
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

export { DE_DUST2_MAP as DE_DUST2 };
