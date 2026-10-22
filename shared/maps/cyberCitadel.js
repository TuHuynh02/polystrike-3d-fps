// ============================================================================
// MAP 1: CYBER CITADEL (120x120m — Valorant Ascent / Haven & CS:GO Mirage)
// Classic 3-Lane Tactical Courtyard: Mid Citadel, Top/Bottom Mid Archways,
// B-Main Container & Market Window, A-Catwalk, A-Heaven Rafters & B-Boathouse
// ============================================================================

import {
  createBoostPair,
  createDoubleDoors,
  createPerimeterWalls,
  createStairs
} from './helpers.js';

export const CYBER_CITADEL_OBSTACLES = [
  ...createPerimeterWalls(60, 0x1e293b),

  // 1. MID COURTYARD CITADEL (Ascent Mid Courtyard / Mirage Top-Mid Hub — 18x16m, h: 2.4m)
  { x: 0, y: 1.2, z: 0, w: 18, h: 2.4, d: 16, color: 0x334155, type: 'platform' },
  { x: 0, y: 4.6, z: 0, w: 3.0, h: 4.4, d: 3.0, color: 0x0f172a, type: 'pillar' },
  // 4 Corner Head-Glitch Parapet Crates (h: 1.35m above platform deck -> chest-high standing cover, full crouch cover)
  { x: -6.8, y: 3.075, z: -5.8, w: 3.2, h: 1.35, d: 1.4, color: 0xf59e0b, type: 'crate' },
  { x: 6.8, y: 3.075, z: 5.8, w: 3.2, h: 1.35, d: 1.4, color: 0xf59e0b, type: 'crate' },
  { x: -6.8, y: 3.075, z: 5.8, w: 3.2, h: 1.35, d: 1.4, color: 0x38bdf8, type: 'crate' },
  { x: 6.8, y: 3.075, z: -5.8, w: 3.2, h: 1.35, d: 1.4, color: 0x38bdf8, type: 'crate' },

  // 4-Way Walkable Stepped Ramps up to Mid Courtyard (5 steps x 0.48m = 2.40m)
  ...createStairs(0, -12.5, 4.8, 1.0, 0, 1, 5, 0.48, 0x475569),
  ...createStairs(0, 12.5, 4.8, 1.0, 0, -1, 5, 0.48, 0x475569),
  ...createStairs(-13.5, 0, 4.8, 1.0, 1, 0, 5, 0.48, 0x475569),
  ...createStairs(13.5, 0, 4.8, 1.0, -1, 0, 5, 0.48, 0x475569),

  // 2. B-MAIN & MARKET WINDOW (West Connector) + A-CATWALK & SHORT WINDOW (East Connector)
  // B-Main North Container at (-22, 1.6, -10) & B-Link South Container at (-22, 1.6, 10)
  { x: -22, y: 1.6, z: -10, w: 2.4, h: 3.2, d: 8.5, color: 0xe11d48, type: 'container' },
  { x: -22, y: 1.6, z: 10, w: 2.4, h: 3.2, d: 8.5, color: 0x0284c7, type: 'container' },
  // Mirage Market Window / Ascent Pizza Crouch-Peek Sill between West Containers
  { x: -22, y: 0.65, z: 0, w: 1.4, h: 1.3, d: 3.6, color: 0x475569, type: 'wall' },

  // A-Catwalk Containers on East Wing + A-Short Window Sill
  { x: 22, y: 1.6, z: -10, w: 2.4, h: 3.2, d: 8.5, color: 0x0284c7, type: 'container' },
  { x: 22, y: 1.6, z: 10, w: 2.4, h: 3.2, d: 8.5, color: 0xe11d48, type: 'container' },
  { x: 22, y: 0.65, z: 0, w: 1.4, h: 1.3, d: 3.6, color: 0x475569, type: 'wall' },

  // Top-Mid (North z=-24) & Bottom-Mid (South z=24) Double-Door Archway Wing Walls (12m central plaza gate)
  ...createDoubleDoors(0, -24, 8.0, 12.0, 1.5, 3.2, true, 0x475569),
  ...createDoubleDoors(0, 24, 8.0, 12.0, 1.5, 3.2, true, 0x475569),

  // 3. MID CUBBY SKILL-BOOST BOXES (CS:GO Mirage Short / Valorant Ascent Mid Boost)
  ...createBoostPair(-15, -16, 2.0, 1.8, 0xd97706, 0xf59e0b, 0),
  ...createBoostPair(15, 16, -2.0, -1.8, 0xd97706, 0xf59e0b, 0),
  { x: 15, y: 1.0, z: -16, w: 2.2, h: 2.0, d: 2.2, color: 0x10b981, type: 'crate' },
  { x: -15, y: 1.0, z: 16, w: 2.2, h: 2.0, d: 2.2, color: 0x10b981, type: 'crate' },

  // 4. NW B-BOATHOUSE SITE & OVERWATCH DECK (y=2.0m) + Radianite Generator + 4-Step Ramp
  { x: -42, y: 1.0, z: -40, w: 14, h: 2.0, d: 10, color: 0x334155, type: 'platform' },
  { x: -37, y: 2.65, z: -36.5, w: 3.2, h: 1.3, d: 1.2, color: 0xf59e0b, type: 'crate' },
  { x: -45, y: 3.0, z: -40.5, w: 2.4, h: 2.0, d: 2.2, color: 0x38bdf8, type: 'crate' },
  ...createStairs(-42, -31.5, 4.2, 1.0, 0, -1, 4, 0.5, 0x64748b),

  // 5. SE A-HEAVEN SNIPER RAFTERS (y=2.0m) + Heaven Window Cover + 4-Step Ramp
  { x: 42, y: 1.0, z: 40, w: 14, h: 2.0, d: 10, color: 0x334155, type: 'platform' },
  { x: 37, y: 2.65, z: 36.5, w: 3.2, h: 1.3, d: 1.2, color: 0xf59e0b, type: 'crate' },
  { x: 45, y: 3.0, z: 40.5, w: 2.4, h: 2.0, d: 2.2, color: 0x38bdf8, type: 'crate' },
  ...createStairs(42, 31.5, 4.2, 1.0, 0, 1, 4, 0.5, 0x64748b),

  // 6. NE A-SITE GENERATOR DECK (y=2.0m) + Default Plant Box + 4-Step Ramp
  { x: 42, y: 1.0, z: -40, w: 14, h: 2.0, d: 10, color: 0x334155, type: 'platform' },
  { x: 37, y: 2.65, z: -36.5, w: 3.2, h: 1.3, d: 1.2, color: 0x38bdf8, type: 'crate' },
  { x: 44.5, y: 3.0, z: -40.5, w: 2.2, h: 2.0, d: 2.2, color: 0x10b981, type: 'crate' },
  ...createStairs(42, -31.5, 4.2, 1.0, 0, -1, 4, 0.5, 0x64748b),

  // 7. SW B-SITE SANCTUARY DECK (y=2.0m) + Default Plant Box + 4-Step Ramp
  { x: -42, y: 1.0, z: 40, w: 14, h: 2.0, d: 10, color: 0x334155, type: 'platform' },
  { x: -37, y: 2.65, z: 36.5, w: 3.2, h: 1.3, d: 1.2, color: 0x38bdf8, type: 'crate' },
  { x: -44.5, y: 3.0, z: 40.5, w: 2.2, h: 2.0, d: 2.2, color: 0x10b981, type: 'crate' },
  ...createStairs(-42, 31.5, 4.2, 1.0, 0, 1, 4, 0.5, 0x64748b),

  // 8. ALPHA / BRAVO SPAWN EXIT BUNKERS & WEST B-LONG / EAST A-LONG CHOKE BUNKERS
  { x: 0, y: 1.6, z: -42, w: 10, h: 3.2, d: 1.6, color: 0x475569, type: 'wall' },
  { x: -5.5, y: 1.6, z: -39, w: 1.6, h: 3.2, d: 5.5, color: 0x475569, type: 'wall' },
  { x: 5.5, y: 1.6, z: -39, w: 1.6, h: 3.2, d: 5.5, color: 0x475569, type: 'wall' },
  { x: 0, y: 1.0, z: -36, w: 2.6, h: 2.0, d: 2.0, color: 0xd97706, type: 'crate' },

  { x: 0, y: 1.6, z: 42, w: 10, h: 3.2, d: 1.6, color: 0x475569, type: 'wall' },
  { x: -5.5, y: 1.6, z: 39, w: 1.6, h: 3.2, d: 5.5, color: 0x475569, type: 'wall' },
  { x: 5.5, y: 1.6, z: 39, w: 1.6, h: 3.2, d: 5.5, color: 0x475569, type: 'wall' },
  { x: 0, y: 1.0, z: 36, w: 2.6, h: 2.0, d: 2.0, color: 0xd97706, type: 'crate' },

  { x: -42, y: 1.6, z: 0, w: 1.6, h: 3.2, d: 10, color: 0x475569, type: 'wall' },
  { x: -39, y: 1.6, z: -5.5, w: 5.5, h: 3.2, d: 1.6, color: 0x475569, type: 'wall' },
  { x: -39, y: 1.6, z: 5.5, w: 5.5, h: 3.2, d: 1.6, color: 0x475569, type: 'wall' },
  { x: -35, y: 1.0, z: 0, w: 2.0, h: 2.0, d: 2.6, color: 0x0284c7, type: 'crate' },

  { x: 42, y: 1.6, z: 0, w: 1.6, h: 3.2, d: 10, color: 0x475569, type: 'wall' },
  { x: 39, y: 1.6, z: -5.5, w: 5.5, h: 3.2, d: 1.6, color: 0x475569, type: 'wall' },
  { x: 39, y: 1.6, z: 5.5, w: 5.5, h: 3.2, d: 1.6, color: 0x475569, type: 'wall' },
  { x: 35, y: 1.0, z: 0, w: 2.0, h: 2.0, d: 2.6, color: 0x0284c7, type: 'crate' },

  // 9. QUADRANT CONNECTOR L-WALLS (Mirage Underpass / Ascent Tree & Wine Chokes)
  { x: -28, y: 1.6, z: -24, w: 6.5, h: 3.2, d: 1.5, color: 0x334155, type: 'wall' },
  { x: -25.5, y: 1.6, z: -21, w: 1.5, h: 3.2, d: 5.5, color: 0x334155, type: 'wall' },
  { x: 28, y: 1.6, z: -24, w: 6.5, h: 3.2, d: 1.5, color: 0x334155, type: 'wall' },
  { x: 25.5, y: 1.6, z: -21, w: 1.5, h: 3.2, d: 5.5, color: 0x334155, type: 'wall' },
  { x: -28, y: 1.6, z: 24, w: 6.5, h: 3.2, d: 1.5, color: 0x334155, type: 'wall' },
  { x: -25.5, y: 1.6, z: 21, w: 1.5, h: 3.2, d: 5.5, color: 0x334155, type: 'wall' },
  { x: 28, y: 1.6, z: 24, w: 6.5, h: 3.2, d: 1.5, color: 0x334155, type: 'wall' },
  { x: 25.5, y: 1.6, z: 21, w: 1.5, h: 3.2, d: 5.5, color: 0x334155, type: 'wall' },

  // 10. TACTICAL MONOLITH PILLARS (Jiggle-Peek Columns along A-Long & B-Long)
  { x: -20, y: 2.2, z: -38, w: 2.4, h: 4.4, d: 2.4, color: 0x0f172a, type: 'pillar' },
  { x: 20, y: 2.2, z: -38, w: 2.4, h: 4.4, d: 2.4, color: 0x0f172a, type: 'pillar' },
  { x: -20, y: 2.2, z: 38, w: 2.4, h: 4.4, d: 2.4, color: 0x0f172a, type: 'pillar' },
  { x: 20, y: 2.2, z: 38, w: 2.4, h: 4.4, d: 2.4, color: 0x0f172a, type: 'pillar' },
  { x: -38, y: 2.2, z: -18, w: 2.4, h: 4.4, d: 2.4, color: 0x0f172a, type: 'pillar' },
  { x: 38, y: 2.2, z: -18, w: 2.4, h: 4.4, d: 2.4, color: 0x0f172a, type: 'pillar' },
  { x: -38, y: 2.2, z: 18, w: 2.4, h: 4.4, d: 2.4, color: 0x0f172a, type: 'pillar' },
  { x: 38, y: 2.2, z: 18, w: 2.4, h: 4.4, d: 2.4, color: 0x0f172a, type: 'pillar' },

  // 11. OUTER LANE FLANK CRATES & THIN WALLBANGABLE HEAD-GLITCH BARRICADES
  { x: -18, y: 1.0, z: -48, w: 3.5, h: 2.0, d: 2.0, color: 0xd97706, type: 'crate' },
  { x: 18, y: 1.0, z: -48, w: 3.5, h: 2.0, d: 2.0, color: 0x0284c7, type: 'crate' },
  { x: -18, y: 1.0, z: 48, w: 3.5, h: 2.0, d: 2.0, color: 0x0284c7, type: 'crate' },
  { x: 18, y: 1.0, z: 48, w: 3.5, h: 2.0, d: 2.0, color: 0xd97706, type: 'crate' },
  { x: -48, y: 1.0, z: -18, w: 2.0, h: 2.0, d: 3.5, color: 0x10b981, type: 'crate' },
  { x: 48, y: 1.0, z: -18, w: 2.0, h: 2.0, d: 3.5, color: 0xe11d48, type: 'crate' },
  { x: -48, y: 1.0, z: 18, w: 2.0, h: 2.0, d: 3.5, color: 0xe11d48, type: 'crate' },
  { x: 48, y: 1.0, z: 18, w: 2.0, h: 2.0, d: 3.5, color: 0x10b981, type: 'crate' },

  // Head-glitch crouch barricades (h: 1.3m) with thin wallbangable edges
  { x: -6, y: 0.65, z: -31, w: 3.2, h: 1.3, d: 0.68, color: 0x64748b, type: 'crate' },
  { x: 6, y: 0.65, z: 31, w: 3.2, h: 1.3, d: 0.68, color: 0x64748b, type: 'crate' },
  { x: -31, y: 0.65, z: 6, w: 0.68, h: 1.3, d: 3.2, color: 0x64748b, type: 'crate' },
  { x: 31, y: 0.65, z: -6, w: 0.68, h: 1.3, d: 3.2, color: 0x64748b, type: 'crate' }
];

export const CYBER_CITADEL_MAP = {
  id: 'cyber_citadel',
  name: 'CYBER CITADEL',
  subtitle: '120x120m • 3-Lane Ascent/Mirage: Mid Courtyard, Catwalk, A-Heaven & B-Boathouse',
  badge: '120x120m • 3-Lane (Valorant Ascent / CS:GO Mirage)',
  inspiration: 'Valorant Ascent & Haven / CS:GO Mirage',
  layoutType: '3-Lane Tactical Courtyard & Elevated Sites',
  arenaHalfSize: 60,
  theme: {
    skyTop: '#020617',
    skyMid: '#0b1736',
    skyHorizon: '#1e3a8a',
    fogColor: 0x091224,
    fogDensity: 0.0052,
    floorBase: '#0f172a',
    floorAlt: '#131e36',
    gridStroke: 'rgba(56, 189, 248, 0.26)',
    accentHex: 0x38bdf8,
    secondaryHex: 0xf59e0b
  },
  callouts: [
    { id: 'mid_courtyard', name: 'MID COURTYARD', shortName: 'MID', x: 0, z: 0, radius: 14 },
    { id: 'top_mid', name: 'TOP MID ARCH', shortName: 'TOP MID', x: 0, z: -24, radius: 12 },
    { id: 'bottom_mid', name: 'BOTTOM MID ARCH', shortName: 'BOT MID', x: 0, z: 24, radius: 12 },
    { id: 'b_market', name: 'B-MAIN & MARKET WINDOW', shortName: 'MARKET', x: -22, z: 0, radius: 14 },
    { id: 'a_catwalk', name: 'A-CATWALK & SHORT', shortName: 'CATWALK', x: 22, z: 0, radius: 14 },
    { id: 'b_boathouse', name: 'B-BOATHOUSE OVERWATCH', shortName: 'B-BOAT', x: -42, z: -40, radius: 14 },
    { id: 'a_site', name: 'A-SITE GENERATOR', shortName: 'A-SITE', x: 42, z: -40, radius: 14 },
    { id: 'b_site', name: 'B-SITE SANCTUARY', shortName: 'B-SITE', x: -42, z: 40, radius: 14 },
    { id: 'a_heaven', name: 'A-HEAVEN RAFTERS', shortName: 'A-HEAVEN', x: 42, z: 40, radius: 14 },
    { id: 'b_long', name: 'B-LONG BUNKER', shortName: 'B-LONG', x: -42, z: 0, radius: 12 },
    { id: 'a_long', name: 'A-LONG BUNKER', shortName: 'A-LONG', x: 42, z: 0, radius: 12 },
    { id: 'alpha_spawn', name: 'ALPHA BASE (T-SPAWN)', shortName: 'T-SPAWN', x: 0, z: -50, radius: 14 },
    { id: 'bravo_spawn', name: 'BRAVO BASE (CT-SPAWN)', shortName: 'CT-SPAWN', x: 0, z: 50, radius: 14 }
  ],
  obstacles: CYBER_CITADEL_OBSTACLES,
  healthPacks: [
    { id: 'hp_north', x: 0, y: 0, z: -29 },
    { id: 'hp_south', x: 0, y: 0, z: 29 },
    { id: 'hp_west', x: -29, y: 0, z: 0 },
    { id: 'hp_east', x: 29, y: 0, z: 0 },
    { id: 'hp_nw', x: -32, y: 0, z: -15 },
    { id: 'hp_se', x: 32, y: 0, z: 15 }
  ],
  powerups: [
    { id: 'pu_armor_n', type: 'armor', x: -16, y: 0, z: -29 },
    { id: 'pu_armor_s', type: 'armor', x: 16, y: 0, z: 29 },
    { id: 'pu_speed_w', type: 'speed', x: -29, y: 0, z: 16 },
    { id: 'pu_damage_center', type: 'damage', x: 0, y: 2.4, z: 4.5 }
  ],
  jumpPads: [
    { id: 'jp_nw', x: -18, y: 0, z: -18, radius: 1.35, jumpForce: 14.2 },
    { id: 'jp_ne', x: 18, y: 0, z: -18, radius: 1.35, jumpForce: 14.2 },
    { id: 'jp_sw', x: -18, y: 0, z: 18, radius: 1.35, jumpForce: 14.2 },
    { id: 'jp_se', x: 18, y: 0, z: 18, radius: 1.35, jumpForce: 14.2 }
  ],
  barrels: [
    { id: 'brl_1', x: -12, y: 0, z: -20 },
    { id: 'brl_2', x: 12, y: 0, z: -20 },
    { id: 'brl_3', x: -12, y: 0, z: 20 },
    { id: 'brl_4', x: 12, y: 0, z: 20 },
    { id: 'brl_5', x: -26, y: 0, z: 0 },
    { id: 'brl_6', x: 26, y: 0, z: 0 }
  ],
  spawnPoints: [
    { x: -52, y: 0.1, z: -52, yaw: -Math.PI * 0.75 },
    { x: 52, y: 0.1, z: -52, yaw: Math.PI * 0.75 },
    { x: -52, y: 0.1, z: 52, yaw: -Math.PI * 0.25 },
    { x: 52, y: 0.1, z: 52, yaw: Math.PI * 0.25 },
    { x: 0, y: 0.1, z: -53, yaw: Math.PI },
    { x: 0, y: 0.1, z: 53, yaw: 0 },
    { x: -53, y: 0.1, z: 0, yaw: -Math.PI * 0.5 },
    { x: 53, y: 0.1, z: 0, yaw: Math.PI * 0.5 },
    { x: -32, y: 0.1, z: -28, yaw: Math.PI },
    { x: 32, y: 0.1, z: 28, yaw: 0 },
    { x: -32, y: 0.1, z: 28, yaw: 0 },
    { x: 32, y: 0.1, z: -28, yaw: Math.PI },
    { x: -26, y: 0.1, z: -50, yaw: Math.PI },
    { x: 26, y: 0.1, z: -50, yaw: Math.PI },
    { x: -26, y: 0.1, z: 50, yaw: 0 },
    { x: 26, y: 0.1, z: 50, yaw: 0 },
    { x: -50, y: 0.1, z: -26, yaw: -Math.PI * 0.5 },
    { x: 50, y: 0.1, z: -26, yaw: Math.PI * 0.5 },
    { x: -50, y: 0.1, z: 26, yaw: -Math.PI * 0.5 },
    { x: 50, y: 0.1, z: 26, yaw: Math.PI * 0.5 }
  ],
  teamSpawns: {
    alpha: [
      { x: 0, y: 0.1, z: -53, yaw: Math.PI },
      { x: -7, y: 0.1, z: -53, yaw: Math.PI },
      { x: 7, y: 0.1, z: -53, yaw: Math.PI },
      { x: -14, y: 0.1, z: -53, yaw: Math.PI },
      { x: 14, y: 0.1, z: -53, yaw: Math.PI },
      { x: -26, y: 0.1, z: -50, yaw: Math.PI },
      { x: 26, y: 0.1, z: -50, yaw: Math.PI }
    ],
    bravo: [
      { x: 0, y: 0.1, z: 53, yaw: 0 },
      { x: -7, y: 0.1, z: 53, yaw: 0 },
      { x: 7, y: 0.1, z: 53, yaw: 0 },
      { x: -14, y: 0.1, z: 53, yaw: 0 },
      { x: 14, y: 0.1, z: 53, yaw: 0 },
      { x: -26, y: 0.1, z: 50, yaw: 0 },
      { x: 26, y: 0.1, z: 50, yaw: 0 }
    ]
  }
};
