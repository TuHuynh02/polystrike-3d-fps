// ============================================================================
// MAP 6: AIM_MAP (60x60m — CS2 Daylight 1v1 / 2v2 Rifle Duel Yard)
// Concrete & Red-Brick Training Yard (Replaces neon-purple arena_duel):
// Central Tactical Bridge (h = 2.0m), Wooden Crate Head-Glitch Cover & AWP Outer Lanes
// ============================================================================

import {
  createBoostPair,
  createPerimeterWalls,
  createStairs
} from './helpers.js';

function buildAimMapObstacles() {
  const obs = [
    ...createPerimeterWalls(30, 0x64748b),

    // === CENTRAL TACTICAL BRIDGE (h = 2.0m, stepH = 0.40m <= 0.48m) ===
    { x: 0, y: 1.0, z: 0, w: 12.0, h: 2.0, d: 5.4, color: 0x64748b, type: 'platform' },
    ...createStairs(-10.5, 0, 3.2, 1.0, 1, 0, 5, 0.4, 0x475569),
    ...createStairs(10.5, 0, 3.2, 1.0, -1, 0, 5, 0.4, 0x475569),

    // Thin wallbangable red-brick duel screens on central bridge (d = 0.66m <= 0.72m)
    { x: -3.2, y: 2.6, z: -2.2, w: 3.2, h: 1.2, d: 0.66, color: 0xb91c1c, type: 'wall' },
    { x: 3.2, y: 2.6, z: 2.2, w: 3.2, h: 1.2, d: 0.66, color: 0xb91c1c, type: 'wall' },

    // === WEST & EAST AWP OUTER LANE ELEVATED DECKS (h = 2.0m) ===
    { x: -21.5, y: 1.0, z: 0, w: 5.2, h: 2.0, d: 10.0, color: 0x64748b, type: 'platform' },
    ...createStairs(-21.5, -9.5, 3.0, 1.0, 0, 1, 5, 0.4, 0x475569),
    ...createStairs(-21.5, 9.5, 3.0, 1.0, 0, -1, 5, 0.4, 0x475569),

    { x: 21.5, y: 1.0, z: 0, w: 5.2, h: 2.0, d: 10.0, color: 0x64748b, type: 'platform' },
    ...createStairs(21.5, -9.5, 3.0, 1.0, 0, 1, 5, 0.4, 0x475569),
    ...createStairs(21.5, 9.5, 3.0, 1.0, 0, -1, 5, 0.4, 0x475569)
  ];

  for (const sz of [-1, 1]) {
    obs.push(
      // Classic aim_map red-brick rifle peek walls
      { x: -9.5, y: 1.7, z: sz * 11.5, w: 5.2, h: 3.4, d: 1.6, color: 0x991b1b, type: 'wall' },
      { x: 9.5, y: 1.7, z: sz * 11.5, w: 5.2, h: 3.4, d: 1.6, color: 0x991b1b, type: 'wall' },
      // Center-line concrete duel pillar
      { x: 0, y: 1.9, z: sz * 12.5, w: 2.4, h: 3.8, d: 2.4, color: 0x475569, type: 'pillar' },
      // Wooden crate head-glitch rifle cover
      { x: -5.0, y: 0.66, z: sz * 17.5, w: 2.2, h: 1.32, d: 1.4, color: 0xd97706, type: 'crate' },
      { x: 5.0, y: 0.66, z: sz * 17.5, w: 2.2, h: 1.32, d: 1.4, color: 0xd97706, type: 'crate' },
      // AWP outer lane flank containers
      { x: -17.5, y: 1.5, z: sz * 18.0, w: 3.0, h: 3.0, d: 5.2, color: 0x334155, type: 'container' },
      { x: 17.5, y: 1.5, z: sz * 18.0, w: 3.0, h: 3.0, d: 5.2, color: 0x991b1b, type: 'container' },
      // Wooden skill-boost crate pairs
      ...createBoostPair(-13.5, sz * 8.0, 0, -sz * 2.0, 0xb45309, 0xd97706, 0),
      ...createBoostPair(13.5, sz * 8.0, 0, -sz * 2.0, 0xb45309, 0xd97706, 0),
      // Spawn thin wallbangable timber head-glitch screen (d = 0.66m <= 0.72m)
      { x: 0, y: 0.68, z: sz * 20.5, w: 3.4, h: 1.36, d: 0.66, color: 0xb45309, type: 'crate' }
    );
  }

  return obs;
}

export const AIM_MAP_OBSTACLES = buildAimMapObstacles();

const AIM_MAP_HEALTH_PACKS = [
  { id: 'hp_bridge', x: 0, y: 2.0, z: 0 },
  { id: 'hp_w_awp', x: -21.5, y: 2.0, z: 0 },
  { id: 'hp_e_awp', x: 21.5, y: 2.0, z: 0 },
  { id: 'hp_n_yard', x: 0, y: 0, z: -17.5 },
  { id: 'hp_s_yard', x: 0, y: 0, z: 17.5 }
];

export const AIM_MAP_MAP = {
  id: 'aim_map',
  name: 'AIM_MAP // CS2 1V1',
  subtitle: '60x60m • CS2 aim_map: Sân đọ súng đối xứng tường gạch đỏ & bê tông, cầu trung tâm, thùng gỗ head-glitch & lane AWP',
  badge: '60x60m • CS2 aim_map / 1v1 Duel',
  inspiration: 'Counter-Strike 2 / CS:GO aim_map & aim_redline',
  layoutType: 'Symmetric CS2 Daylight Rifle Duel Yard, Central Bridge, Crate Head-Glitch Cover & AWP Outer Lanes',
  arenaHalfSize: 30,
  theme: {
    skyTop: '#2e6da8',
    skyMid: '#7cb5df',
    skyHorizon: '#dfe8ef',
    fogColor: 0xd0dce6,
    fogDensity: 0.0032,
    floorBase: '#9a9e9f',
    floorAlt: '#8b9092',
    gridStroke: 'rgba(185, 28, 28, 0.24)',
    accentHex: 0xb91c1c,
    secondaryHex: 0xd97706
  },
  callouts: [
    { id: 'center_bridge', name: 'CENTRAL DUEL BRIDGE', shortName: 'BRIDGE', x: 0, z: 0, radius: 8 },
    { id: 'west_awp', name: 'WEST AWP LANE', shortName: 'W-AWP', x: -21.5, z: 0, radius: 8 },
    { id: 'east_awp', name: 'EAST AWP LANE', shortName: 'E-AWP', x: 21.5, z: 0, radius: 8 },
    { id: 'ct_redline', name: 'NORTH BRICK LINE', shortName: 'N-BRICK', x: 0, z: -13.0, radius: 8 },
    { id: 't_redline', name: 'SOUTH BRICK LINE', shortName: 'S-BRICK', x: 0, z: 13.0, radius: 8 },
    { id: 'nw_flank', name: 'NW CONTAINER LANE', shortName: 'NW-LANE', x: -17.5, z: -18.0, radius: 7 },
    { id: 'ne_flank', name: 'NE CONTAINER LANE', shortName: 'NE-LANE', x: 17.5, z: -18.0, radius: 7 },
    { id: 'sw_flank', name: 'SW CONTAINER LANE', shortName: 'SW-LANE', x: -17.5, z: 18.0, radius: 7 },
    { id: 'se_flank', name: 'SE CONTAINER LANE', shortName: 'SE-LANE', x: 17.5, z: 18.0, radius: 7 }
  ],
  obstacles: AIM_MAP_OBSTACLES,
  healthPacks: AIM_MAP_HEALTH_PACKS,
  healthPackSpawns: AIM_MAP_HEALTH_PACKS,
  powerups: [
    { id: 'pu_damage_n', type: 'damage', x: 0, y: 0, z: -6.5 },
    { id: 'pu_damage_s', type: 'damage', x: 0, y: 0, z: 6.5 },
    { id: 'pu_armor_w', type: 'armor', x: -15.5, y: 0, z: 0 },
    { id: 'pu_speed_e', type: 'speed', x: 15.5, y: 0, z: 0 }
  ],
  jumpPads: [
    { id: 'jp_n', x: 0, y: 0, z: -9.0, radius: 1.25, jumpForce: 13.2 },
    { id: 'jp_s', x: 0, y: 0, z: 9.0, radius: 1.25, jumpForce: 13.2 }
  ],
  barrels: [
    { id: 'brl_1', x: -5.0, y: 0, z: -11.5 },
    { id: 'brl_2', x: 5.0, y: 0, z: -11.5 },
    { id: 'brl_3', x: -5.0, y: 0, z: 11.5 },
    { id: 'brl_4', x: 5.0, y: 0, z: 11.5 }
  ],
  spawnPoints: [
    { x: 0, y: 0.1, z: -26.0, yaw: Math.PI },
    { x: -8.5, y: 0.1, z: -26.0, yaw: Math.PI },
    { x: 8.5, y: 0.1, z: -26.0, yaw: Math.PI },
    { x: 0, y: 0.1, z: 26.0, yaw: 0 },
    { x: -8.5, y: 0.1, z: 26.0, yaw: 0 },
    { x: 8.5, y: 0.1, z: 26.0, yaw: 0 },
    { x: -26.5, y: 0.1, z: -12.0, yaw: -Math.PI * 0.5 },
    { x: -26.5, y: 0.1, z: 12.0, yaw: -Math.PI * 0.5 },
    { x: 26.5, y: 0.1, z: -12.0, yaw: Math.PI * 0.5 },
    { x: 26.5, y: 0.1, z: 12.0, yaw: Math.PI * 0.5 },
    { x: -25.5, y: 0.1, z: -25.5, yaw: -Math.PI * 0.75 },
    { x: 25.5, y: 0.1, z: -25.5, yaw: Math.PI * 0.75 },
    { x: -25.5, y: 0.1, z: 25.5, yaw: -Math.PI * 0.25 },
    { x: 25.5, y: 0.1, z: 25.5, yaw: Math.PI * 0.25 }
  ],
  teamSpawns: {
    alpha: [
      { x: 0, y: 0.1, z: -26.0, yaw: Math.PI },
      { x: -5.5, y: 0.1, z: -26.0, yaw: Math.PI },
      { x: 5.5, y: 0.1, z: -26.0, yaw: Math.PI },
      { x: -11.0, y: 0.1, z: -26.0, yaw: Math.PI },
      { x: 11.0, y: 0.1, z: -26.0, yaw: Math.PI },
      { x: -17.5, y: 0.1, z: -26.0, yaw: Math.PI },
      { x: 17.5, y: 0.1, z: -26.0, yaw: Math.PI }
    ],
    bravo: [
      { x: 0, y: 0.1, z: 26.0, yaw: 0 },
      { x: -5.5, y: 0.1, z: 26.0, yaw: 0 },
      { x: 5.5, y: 0.1, z: 26.0, yaw: 0 },
      { x: -11.0, y: 0.1, z: 26.0, yaw: 0 },
      { x: 11.0, y: 0.1, z: 26.0, yaw: 0 },
      { x: -17.5, y: 0.1, z: 26.0, yaw: 0 },
      { x: 17.5, y: 0.1, z: 26.0, yaw: 0 }
    ]
  }
};

export { AIM_MAP_MAP as AIM_MAP };
