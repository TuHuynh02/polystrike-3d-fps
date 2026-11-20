// ============================================================================
// MAP 4: DE_NUKE (76x76m — CS2 / CS:GO Nuke Cedar Creek Yard & A-Site Retake)
// Industrial Nuclear Plant: Outside Red Container & Blue Box, Silo/Marshmallow Boost,
// Main Garage, A-Site Twin Reactor Silos & Hut, Heaven Catwalk & Secret Stairs
// ============================================================================

import {
  createBoostPair,
  createDoubleDoors,
  createPerimeterWalls,
  createStairs
} from './helpers.js';

export const DE_NUKE_OBSTACLES = [
  ...createPerimeterWalls(38, 0x334155),

  // 1. OUTSIDE YARD: RED CONTAINER (0xdc2626), BLUE BOX (0x0284c7) & SILO BOOST DECK
  { x: -17.5, y: 1.6, z: 2.0, w: 3.4, h: 3.2, d: 8.4, color: 0xdc2626, type: 'container' },
  { x: -11.5, y: 1.2, z: 14.5, w: 3.2, h: 2.4, d: 3.2, color: 0x0284c7, type: 'container' },

  // Silo / Marshmallow Boost Deck (SW, h = 2.4m)
  { x: -26.5, y: 1.2, z: 14.5, w: 8.0, h: 2.4, d: 8.0, color: 0x64748b, type: 'platform' },
  ...createBoostPair(-21.4, 14.5, 0, 2.0, 0xeab308, 0xca8a04, 0),
  ...createStairs(-26.5, 23.0, 3.6, 1.0, 0, -1, 5, 0.48, 0x475569),
  { x: -22.9, y: 3.0, z: 12.2, w: 0.66, h: 1.2, d: 3.2, color: 0xeab308, type: 'crate' },

  // Secret Stairs & Garage Overlook Deck (NW, h = 2.4m)
  { x: -25.5, y: 1.2, z: -19.5, w: 9.0, h: 2.4, d: 9.0, color: 0x3b495c, type: 'platform' },
  ...createStairs(-25.5, -10.5, 3.8, 1.0, 0, -1, 5, 0.48, 0x475569),
  { x: -22.5, y: 3.0, z: -16.5, w: 2.4, h: 1.2, d: 1.4, color: 0xeab308, type: 'crate' },

  // 2. MAIN GARAGE WAREHOUSE DIVIDER & MINI DOORWAY (x = -5.5, 5.4m opening at z = 0)
  ...createDoubleDoors(-5.5, 0, 9.0, 5.4, 2.0, 3.8, false, 0x475569),
  { x: -9.5, y: 1.8, z: -20.5, w: 8.5, h: 3.6, d: 1.8, color: 0x475569, type: 'wall' },
  // Thin Garage booth wallbang divider (d = 0.68m <= 0.72m)
  { x: -12.5, y: 0.85, z: -10.5, w: 3.6, h: 1.7, d: 0.68, color: 0x64748b, type: 'wall' },

  // 3. A-SITE TWIN REACTOR SILOS (4.4x4.4x4.6m industrial reactor towers)
  { x: 10.5, y: 2.3, z: -6.5, w: 4.4, h: 4.6, d: 4.4, color: 0x64748b, type: 'pillar' },
  { x: 10.5, y: 2.3, z: 6.5, w: 4.4, h: 4.6, d: 4.4, color: 0x64748b, type: 'pillar' },

  // 4. A-SITE HUT DECK (SE, h = 2.4m)
  { x: 12.0, y: 1.2, z: 19.0, w: 9.0, h: 2.4, d: 8.0, color: 0x3b495c, type: 'platform' },
  ...createStairs(3.0, 19.0, 3.6, 1.0, 1, 0, 5, 0.48, 0x475569),
  { x: 12.0, y: 3.0, z: 15.4, w: 3.8, h: 1.2, d: 0.66, color: 0xeab308, type: 'crate' },

  // 5. HEAVEN CATWALK (East A-Site Overwatch, h = 2.4m)
  { x: 26.5, y: 1.2, z: 0, w: 7.5, h: 2.4, d: 22.0, color: 0x3b495c, type: 'platform' },
  ...createStairs(26.5, -15.5, 4.0, 1.0, 0, 1, 5, 0.48, 0x475569),
  ...createStairs(26.5, 15.5, 4.0, 1.0, 0, -1, 5, 0.48, 0x475569),
  // Heaven Catwalk thin steel gunshields (w = 0.66m <= 0.72m)
  { x: 23.1, y: 3.0, z: -5.5, w: 0.66, h: 1.2, d: 3.4, color: 0xeab308, type: 'wall' },
  { x: 23.1, y: 3.0, z: 5.5, w: 0.66, h: 1.2, d: 3.4, color: 0xeab308, type: 'wall' },

  // 6. A-SITE VENT BOOST PAIR & CT HELL / T-LOBBY BLAST WALLS
  ...createBoostPair(17.5, 0, 0, 2.0, 0xeab308, 0xca8a04, 0),
  { x: 9.5, y: 1.8, z: -22.0, w: 8.5, h: 3.6, d: 1.8, color: 0x475569, type: 'wall' },
  { x: -2.0, y: 1.6, z: 23.5, w: 6.5, h: 3.2, d: 1.8, color: 0x475569, type: 'wall' }
];

const DE_NUKE_HEALTH_PACKS = [
  { id: 'hp_outside', x: -17.5, y: 0, z: -6.0 },
  { id: 'hp_silo', x: -26.5, y: 2.4, z: 14.5 },
  { id: 'hp_a_center', x: 10.5, y: 0, z: 0 },
  { id: 'hp_heaven', x: 26.5, y: 2.4, z: 0 },
  { id: 'hp_hut', x: 12.0, y: 2.4, z: 19.0 },
  { id: 'hp_secret', x: -25.5, y: 2.4, z: -19.5 }
];

export const DE_NUKE_MAP = {
  id: 'de_nuke',
  name: 'NUKE // CEDAR CREEK',
  subtitle: '76x76m • CS2 Nuke Retake: Outside Red Container & Blue Box, Silo Boost, Main Garage, Twin Reactor Silos, Hut & Heaven',
  badge: '76x76m • CS2 Nuke Yard & A-Site',
  inspiration: 'Counter-Strike 2 / CS:GO de_nuke',
  layoutType: 'Outside Red Container & Blue Box, Silo Boost, Main Garage, Twin Reactor Silos, Hut & Heaven Catwalk',
  arenaHalfSize: 38,
  theme: {
    skyTop: '#3e546b',
    skyMid: '#768ea6',
    skyHorizon: '#b9c6d2',
    fogColor: 0x9aaaba,
    fogDensity: 0.0038,
    floorBase: '#66717d',
    floorAlt: '#59636e',
    gridStroke: 'rgba(234, 179, 8, 0.28)',
    accentHex: 0xeab308,
    secondaryHex: 0x0284c7
  },
  callouts: [
    { id: 'outside_red', name: 'OUTSIDE RED CONTAINER', shortName: 'RED BOX', x: -17.5, z: 2.0, radius: 9 },
    { id: 'blue_box', name: 'OUTSIDE BLUE BOX', shortName: 'BLUE BOX', x: -11.5, z: 14.5, radius: 8 },
    { id: 'silo_boost', name: 'SILO / MARSHMALLOW', shortName: 'SILO', x: -26.5, z: 14.5, radius: 9 },
    { id: 'main_garage', name: 'MAIN GARAGE', shortName: 'MAIN', x: -5.5, z: 0, radius: 9 },
    { id: 'secret', name: 'SECRET STAIRS', shortName: 'SECRET', x: -25.5, z: -19.5, radius: 10 },
    { id: 'a_reactors', name: 'A-SITE REACTOR SILOS', shortName: 'A-SITE', x: 10.5, z: 0, radius: 10 },
    { id: 'a_hut', name: 'A-SITE HUT', shortName: 'HUT', x: 12.0, z: 19.0, radius: 9 },
    { id: 'heaven', name: 'HEAVEN CATWALK', shortName: 'HEAVEN', x: 26.5, z: 0, radius: 11 },
    { id: 'ct_hell', name: 'CT HELL & LOCKER', shortName: 'HELL', x: 10.0, z: -22.0, radius: 9 },
    { id: 't_lobby', name: 'T-LOBBY & SQUEAKY', shortName: 'LOBBY', x: -2.0, z: 26.0, radius: 9 }
  ],
  obstacles: DE_NUKE_OBSTACLES,
  healthPacks: DE_NUKE_HEALTH_PACKS,
  healthPackSpawns: DE_NUKE_HEALTH_PACKS,
  powerups: [
    { id: 'pu_damage_main', type: 'damage', x: 2.0, y: 0, z: 0 },
    { id: 'pu_armor_yard', type: 'armor', x: -25.5, y: 0, z: 2.0 },
    { id: 'pu_speed_hell', type: 'speed', x: 18.0, y: 0, z: -14.0 },
    { id: 'pu_armor_heaven', type: 'armor', x: 26.5, y: 2.4, z: -8.0 }
  ],
  jumpPads: [
    { id: 'jp_yard', x: -12.0, y: 0, z: -2.0, radius: 1.3, jumpForce: 13.8 },
    { id: 'jp_a_site', x: 17.5, y: 0, z: -8.5, radius: 1.3, jumpForce: 13.8 }
  ],
  barrels: [
    { id: 'brl_1', x: -12.5, y: 0, z: 6.5 },
    { id: 'brl_2', x: -23.0, y: 0, z: -4.0 },
    { id: 'brl_3', x: 4.5, y: 0, z: -10.0 },
    { id: 'brl_4', x: 4.5, y: 0, z: 10.0 },
    { id: 'brl_5', x: 18.0, y: 0, z: 10.0 }
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
    { x: -34.0, y: 0.1, z: 0, yaw: -Math.PI * 0.5 },
    { x: 34.0, y: 0.1, z: 0, yaw: Math.PI * 0.5 },
    { x: -34.0, y: 0.1, z: -14.0, yaw: -Math.PI * 0.5 },
    { x: 34.0, y: 0.1, z: -16.0, yaw: Math.PI * 0.5 },
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

export { DE_NUKE_MAP as DE_NUKE };
