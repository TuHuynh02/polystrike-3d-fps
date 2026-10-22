// ============================================================================
// MAP 3: SOLAR OUTPOST (124x124m — CS:GO Dust II & CrossFire Kim Tự Tháp)
// Desert Sandstone Fortress: Mid Double Doors, Xbox Boost to Catwalk,
// Long A & Goose Platform, B-Tunnels, Sandstone Obelisks & 4 Watchtowers
// ============================================================================

import {
  createDoubleDoors,
  createPerimeterWalls,
  createStairs
} from './helpers.js';

export const DESERT_OUTPOST_OBSTACLES = [
  ...createPerimeterWalls(62, 0x451a03),

  // 1. CENTRAL CATWALK & COMMAND COMPOUND (Dust II Short A / CF Pyramid Hub — 16x16m, h: 2.4m)
  { x: 0, y: 1.2, z: 0, w: 16, h: 2.4, d: 16, color: 0x78350f, type: 'platform' },
  { x: 0, y: 4.6, z: 0, w: 3.2, h: 4.4, d: 3.2, color: 0x451a03, type: 'pillar' },
  // 4 Corner Head-Glitch Sandstone Parapets (h: 1.3m above platform deck)
  { x: -6, y: 3.05, z: -6, w: 3.0, h: 1.3, d: 1.4, color: 0xd97706, type: 'crate' },
  { x: 6, y: 3.05, z: 6, w: 3.0, h: 1.3, d: 1.4, color: 0xd97706, type: 'crate' },
  { x: -6, y: 3.05, z: 6, w: 3.0, h: 1.3, d: 1.4, color: 0xf59e0b, type: 'crate' },
  { x: 6, y: 3.05, z: -6, w: 3.0, h: 1.3, d: 1.4, color: 0xf59e0b, type: 'crate' },
  ...createStairs(0, -12.5, 4.6, 1.0, 0, 1, 5, 0.48, 0x92400e),
  ...createStairs(0, 12.5, 4.6, 1.0, 0, -1, 5, 0.48, 0x92400e),

  // Dust II Iconic "XBOX" Skill-Boost Stacks (Jump from Lower Box -> Xbox -> Central Catwalk!)
  { x: -9.4, y: 0.95, z: 4.2, w: 2.4, h: 1.9, d: 2.4, color: 0xd97706, type: 'crate' },
  { x: -9.4, y: 0.52, z: 6.4, w: 1.8, h: 1.04, d: 1.8, color: 0xf59e0b, type: 'crate' },
  { x: 9.4, y: 0.95, z: -4.2, w: 2.4, h: 1.9, d: 2.4, color: 0xd97706, type: 'crate' },
  { x: 9.4, y: 0.52, z: -6.4, w: 1.8, h: 1.04, d: 1.8, color: 0xf59e0b, type: 'crate' },

  // 2. WEST B-TUNNEL WALLS & EAST SHORT-A SANDSTONE GATEWAYS
  { x: -18, y: 1.8, z: -9, w: 2.2, h: 3.6, d: 10, color: 0x92400e, type: 'wall' },
  { x: -18, y: 1.8, z: 9, w: 2.2, h: 3.6, d: 10, color: 0x92400e, type: 'wall' },
  { x: 18, y: 1.8, z: -9, w: 2.2, h: 3.6, d: 10, color: 0x92400e, type: 'wall' },
  { x: 18, y: 1.8, z: 9, w: 2.2, h: 3.6, d: 10, color: 0x92400e, type: 'wall' },

  // 3. NORTH & SOUTH DUST II MID DOUBLE DOORS (4.5m Sniper Peek Gap + Back Sniper Shield)
  ...createDoubleDoors(0, -22, 9.5, 4.5, 1.8, 3.2, true, 0xb45309),
  { x: 0, y: 1.5, z: -28, w: 6.5, h: 3.0, d: 2.0, color: 0x78350f, type: 'wall' },
  ...createDoubleDoors(0, 22, 9.5, 4.5, 1.8, 3.2, true, 0xb45309),
  { x: 0, y: 1.5, z: 28, w: 6.5, h: 3.0, d: 2.0, color: 0x78350f, type: 'wall' },

  // 4. 4 QUADRANT WATCHTOWERS / A-GOOSE & B-SITE PLATFORMS (y=2.4m, aligned with canopy landmarks)
  { x: -36, y: 1.2, z: -34, w: 11, h: 2.4, d: 11, color: 0x78350f, type: 'platform' },
  { x: -32, y: 3.05, z: -30, w: 2.8, h: 1.3, d: 1.4, color: 0xf59e0b, type: 'crate' },
  ...createStairs(-36, -24, 4.0, 1.0, 0, -1, 5, 0.48, 0xb45309),

  { x: 36, y: 1.2, z: -34, w: 11, h: 2.4, d: 11, color: 0x78350f, type: 'platform' },
  { x: 32, y: 3.05, z: -30, w: 2.8, h: 1.3, d: 1.4, color: 0xf59e0b, type: 'crate' },
  ...createStairs(36, -24, 4.0, 1.0, 0, -1, 5, 0.48, 0xb45309),

  { x: -36, y: 1.2, z: 34, w: 11, h: 2.4, d: 11, color: 0x78350f, type: 'platform' },
  { x: -32, y: 3.05, z: 30, w: 2.8, h: 1.3, d: 1.4, color: 0xf59e0b, type: 'crate' },
  ...createStairs(-36, 24, 4.0, 1.0, 0, 1, 5, 0.48, 0xb45309),

  { x: 36, y: 1.2, z: 34, w: 11, h: 2.4, d: 11, color: 0x78350f, type: 'platform' },
  { x: 32, y: 3.05, z: 30, w: 2.8, h: 1.3, d: 1.4, color: 0xf59e0b, type: 'crate' },
  ...createStairs(36, 24, 4.0, 1.0, 0, 1, 5, 0.48, 0xb45309),

  // 5. LONG-A BLUE CONTAINERS & B-TUNNEL SUPPLY CONTAINERS
  { x: -32, y: 1.6, z: -6, w: 3.4, h: 3.2, d: 8.0, color: 0xd97706, type: 'container' },
  { x: -32, y: 1.6, z: 6, w: 3.4, h: 3.2, d: 8.0, color: 0x92400e, type: 'container' },
  { x: 32, y: 1.6, z: -6, w: 3.4, h: 3.2, d: 8.0, color: 0x0284c7, type: 'container' },
  { x: 32, y: 1.6, z: 6, w: 3.4, h: 3.2, d: 8.0, color: 0xd97706, type: 'container' },

  // 6. CF PYRAMID SANDSTONE OBELISK PILLARS
  { x: -22, y: 2.4, z: -36, w: 3.0, h: 4.8, d: 3.0, color: 0x78350f, type: 'pillar' },
  { x: 22, y: 2.4, z: -36, w: 3.0, h: 4.8, d: 3.0, color: 0x78350f, type: 'pillar' },
  { x: -22, y: 2.4, z: 36, w: 3.0, h: 4.8, d: 3.0, color: 0x78350f, type: 'pillar' },
  { x: 22, y: 2.4, z: 36, w: 3.0, h: 4.8, d: 3.0, color: 0x78350f, type: 'pillar' },

  // 7. LONG-A PIT, A-DOORS & B-SITE CAR / CLOSET BUNKERS
  { x: -46, y: 1.6, z: -14, w: 7.5, h: 3.2, d: 1.8, color: 0x92400e, type: 'wall' },
  { x: -46, y: 1.6, z: 14, w: 7.5, h: 3.2, d: 1.8, color: 0x92400e, type: 'wall' },
  { x: 46, y: 1.6, z: -14, w: 7.5, h: 3.2, d: 1.8, color: 0x92400e, type: 'wall' },
  { x: 46, y: 1.6, z: 14, w: 7.5, h: 3.2, d: 1.8, color: 0x92400e, type: 'wall' },
  { x: -14, y: 1.6, z: -46, w: 1.8, h: 3.2, d: 7.5, color: 0x92400e, type: 'wall' },
  { x: 14, y: 1.6, z: -46, w: 1.8, h: 3.2, d: 7.5, color: 0x92400e, type: 'wall' },
  { x: -14, y: 1.6, z: 46, w: 1.8, h: 3.2, d: 7.5, color: 0x92400e, type: 'wall' },
  { x: 14, y: 1.6, z: 46, w: 1.8, h: 3.2, d: 7.5, color: 0x92400e, type: 'wall' },

  // 8. TACTICAL HEAD-GLITCH & WALLBANGABLE ORDNANCE CRATES
  { x: -12, y: 1.0, z: -14, w: 2.2, h: 2.0, d: 2.2, color: 0xf59e0b, type: 'crate' },
  { x: 12, y: 1.0, z: -14, w: 2.2, h: 2.0, d: 2.2, color: 0xf59e0b, type: 'crate' },
  { x: -12, y: 1.0, z: 14, w: 2.2, h: 2.0, d: 2.2, color: 0xf59e0b, type: 'crate' },
  { x: 12, y: 1.0, z: 14, w: 2.2, h: 2.0, d: 2.2, color: 0xf59e0b, type: 'crate' },
  { x: -25, y: 1.0, z: -20, w: 2.5, h: 2.0, d: 2.5, color: 0xd97706, type: 'crate' },
  { x: 25, y: 1.0, z: -20, w: 2.5, h: 2.0, d: 2.5, color: 0xd97706, type: 'crate' },
  { x: -25, y: 1.0, z: 20, w: 2.5, h: 2.0, d: 2.5, color: 0xd97706, type: 'crate' },
  { x: 25, y: 1.0, z: 20, w: 2.5, h: 2.0, d: 2.5, color: 0xd97706, type: 'crate' },
  // North/South & Pit/Closet head-glitch crouch barricades (h: 1.3m, 0.68m thin wallbangable cover)
  { x: 0, y: 0.65, z: -42, w: 3.6, h: 1.3, d: 0.68, color: 0xb45309, type: 'crate' },
  { x: 0, y: 0.65, z: 42, w: 3.6, h: 1.3, d: 0.68, color: 0xb45309, type: 'crate' },
  { x: -44, y: 0.65, z: 0, w: 0.68, h: 1.3, d: 3.6, color: 0xb45309, type: 'crate' },
  { x: 44, y: 0.65, z: 0, w: 0.68, h: 1.3, d: 3.6, color: 0xb45309, type: 'crate' }
];

export const DESERT_OUTPOST_MAP = {
  id: 'desert_outpost',
  name: 'SOLAR OUTPOST',
  subtitle: '124x124m • Dust II & Kim Tự Tháp: Cửa đôi Mid, Xbox Catwalk, Long A & Hầm B',
  badge: '124x124m • Dust II / Kim Tự Tháp (CS:GO & CF)',
  inspiration: 'CS:GO Dust II / CrossFire Kim Tự Tháp (Ancient Pyramid)',
  layoutType: 'Mid Double Doors, Xbox Boost, Long A Pit & B-Tunnels',
  arenaHalfSize: 62,
  theme: {
    skyTop: '#1c1917',
    skyMid: '#451a03',
    skyHorizon: '#9a3412',
    fogColor: 0x291509,
    fogDensity: 0.0048,
    floorBase: '#27170c',
    floorAlt: '#331e0f',
    gridStroke: 'rgba(245, 158, 11, 0.3)',
    accentHex: 0xf59e0b,
    secondaryHex: 0xef4444
  },
  callouts: [
    { id: 'catwalk_xbox', name: 'XBOX & CATWALK', shortName: 'XBOX', x: 0, z: 0, radius: 14 },
    { id: 'n_doors', name: 'NORTH MID DOUBLE DOORS', shortName: 'N-DOORS', x: 0, z: -22, radius: 12 },
    { id: 's_doors', name: 'SOUTH MID DOUBLE DOORS', shortName: 'S-DOORS', x: 0, z: 22, radius: 12 },
    { id: 'b_tunnels', name: 'UPPER & LOWER B-TUNNELS', shortName: 'B-TUNNEL', x: -26, z: 0, radius: 14 },
    { id: 'long_a', name: 'LONG A & BLUE CONTAINER', shortName: 'LONG A', x: 32, z: 0, radius: 14 },
    { id: 'b_site', name: 'B-SITE WATCHTOWER', shortName: 'B-SITE', x: -36, z: -34, radius: 14 },
    { id: 'a_goose', name: 'A-SITE GOOSE PLATFORM', shortName: 'A-GOOSE', x: 36, z: -34, radius: 14 },
    { id: 'b_window', name: 'B-WINDOW OVERWATCH', shortName: 'B-WIN', x: -36, z: 34, radius: 14 },
    { id: 'a_ramp', name: 'A-RAMP & CAR OVERWATCH', shortName: 'A-RAMP', x: 36, z: 34, radius: 14 },
    { id: 'b_car', name: 'B-CLOSET & CAR', shortName: 'B-CAR', x: -46, z: 0, radius: 12 },
    { id: 'a_pit', name: 'LONG A PIT', shortName: 'A-PIT', x: 46, z: 0, radius: 12 }
  ],
  obstacles: DESERT_OUTPOST_OBSTACLES,
  healthPacks: [
    { id: 'hp_north', x: 0, y: 0, z: -20 },
    { id: 'hp_south', x: 0, y: 0, z: 20 },
    { id: 'hp_west', x: -24, y: 0, z: 0 },
    { id: 'hp_east', x: 24, y: 0, z: 0 },
    { id: 'hp_nw', x: -36, y: 2.4, z: -34 },
    { id: 'hp_se', x: 36, y: 2.4, z: 34 }
  ],
  powerups: [
    { id: 'pu_armor_n', type: 'armor', x: -18, y: 0, z: -20 },
    { id: 'pu_armor_s', type: 'armor', x: 18, y: 0, z: 20 },
    { id: 'pu_speed_w', type: 'speed', x: -24, y: 0, z: 14 },
    { id: 'pu_damage_center', type: 'damage', x: 0, y: 2.4, z: 4.5 }
  ],
  jumpPads: [
    { id: 'jp_nw', x: -20, y: 0, z: -26, radius: 1.35, jumpForce: 14.2 },
    { id: 'jp_ne', x: 20, y: 0, z: -26, radius: 1.35, jumpForce: 14.2 },
    { id: 'jp_sw', x: -20, y: 0, z: 26, radius: 1.35, jumpForce: 14.2 },
    { id: 'jp_se', x: 20, y: 0, z: 26, radius: 1.35, jumpForce: 14.2 }
  ],
  barrels: [
    { id: 'brl_1', x: -15, y: 0, z: -18 },
    { id: 'brl_2', x: 15, y: 0, z: -18 },
    { id: 'brl_3', x: -15, y: 0, z: 18 },
    { id: 'brl_4', x: 15, y: 0, z: 18 },
    { id: 'brl_5', x: -28, y: 0, z: 0 },
    { id: 'brl_6', x: 28, y: 0, z: 0 }
  ],
  spawnPoints: [
    { x: -54, y: 0.1, z: -54, yaw: -Math.PI * 0.75 },
    { x: 54, y: 0.1, z: -54, yaw: Math.PI * 0.75 },
    { x: -54, y: 0.1, z: 54, yaw: -Math.PI * 0.25 },
    { x: 54, y: 0.1, z: 54, yaw: Math.PI * 0.25 },
    { x: 0, y: 0.1, z: -54, yaw: Math.PI },
    { x: 0, y: 0.1, z: 54, yaw: 0 },
    { x: -54, y: 0.1, z: 0, yaw: -Math.PI * 0.5 },
    { x: 54, y: 0.1, z: 0, yaw: Math.PI * 0.5 },
    { x: -28, y: 0.1, z: -26, yaw: Math.PI },
    { x: 28, y: 0.1, z: 26, yaw: 0 },
    { x: -28, y: 0.1, z: 26, yaw: 0 },
    { x: 28, y: 0.1, z: -26, yaw: Math.PI },
    { x: -24, y: 0.1, z: -52, yaw: Math.PI },
    { x: 24, y: 0.1, z: -52, yaw: Math.PI },
    { x: -24, y: 0.1, z: 52, yaw: 0 },
    { x: 24, y: 0.1, z: 52, yaw: 0 },
    { x: -52, y: 0.1, z: -24, yaw: -Math.PI * 0.5 },
    { x: 52, y: 0.1, z: -24, yaw: Math.PI * 0.5 },
    { x: -52, y: 0.1, z: 24, yaw: -Math.PI * 0.5 },
    { x: 52, y: 0.1, z: 24, yaw: Math.PI * 0.5 }
  ],
  teamSpawns: {
    alpha: [
      { x: 0, y: 0.1, z: -54, yaw: Math.PI },
      { x: -7, y: 0.1, z: -54, yaw: Math.PI },
      { x: 7, y: 0.1, z: -54, yaw: Math.PI },
      { x: -14, y: 0.1, z: -54, yaw: Math.PI },
      { x: 14, y: 0.1, z: -54, yaw: Math.PI },
      { x: -24, y: 0.1, z: -52, yaw: Math.PI },
      { x: 24, y: 0.1, z: -52, yaw: Math.PI }
    ],
    bravo: [
      { x: 0, y: 0.1, z: 54, yaw: 0 },
      { x: -7, y: 0.1, z: 54, yaw: 0 },
      { x: 7, y: 0.1, z: 54, yaw: 0 },
      { x: -14, y: 0.1, z: 54, yaw: 0 },
      { x: 14, y: 0.1, z: 54, yaw: 0 },
      { x: -24, y: 0.1, z: 52, yaw: 0 },
      { x: 24, y: 0.1, z: 52, yaw: 0 }
    ]
  }
};
