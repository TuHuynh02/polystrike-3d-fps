// Shared 3D Arena Map Definitions (Obstacles, Health Packs, Spawn Points)

function createStairs(startX, startZ, stepW, stepD, dirX, dirZ, steps = 6, stepH = 0.4, color = 0x475569) {
  const list = [];
  for (let i = 0; i < steps; i++) {
    const h = (i + 1) * stepH;
    const x = startX + dirX * i * stepD;
    const z = startZ + dirZ * i * stepD;
    list.push({
      x,
      y: h / 2,
      z,
      w: dirX !== 0 ? stepD : stepW,
      h,
      d: dirZ !== 0 ? stepD : stepW,
      color,
      type: 'step'
    });
  }
  return list;
}

function createPerimeterWalls(halfSize, wallColor = 0x1e293b) {
  const span = halfSize * 2 + 2;
  const pos = halfSize + 0.5;
  return [
    { x: 0, y: 4.5, z: -pos, w: span, h: 9, d: 1, color: wallColor, type: 'wall' },
    { x: 0, y: 4.5, z: pos, w: span, h: 9, d: 1, color: wallColor, type: 'wall' },
    { x: -pos, y: 4.5, z: 0, w: 1, h: 9, d: span, color: wallColor, type: 'wall' },
    { x: pos, y: 4.5, z: 0, w: 1, h: 9, d: span, color: wallColor, type: 'wall' }
  ];
}

// ============================================================================
// MAP 1: CYBER CITADEL (120x120m — Multi-Level Cyber Fortress & Tactical Cover)
// ============================================================================
const CYBER_CITADEL_OBSTACLES = [
  ...createPerimeterWalls(60, 0x1e293b),

  // Central Citadel Platform (18x18m, height 2.4m) + 4 Corner Bastions + Monolith
  { x: 0, y: 1.2, z: 0, w: 18, h: 2.4, d: 18, color: 0x334155, type: 'platform' },
  { x: 0, y: 4.6, z: 0, w: 3.0, h: 4.4, d: 3.0, color: 0x0f172a, type: 'pillar' },
  { x: -6.8, y: 3.2, z: -6.8, w: 3.2, h: 1.6, d: 1.4, color: 0xf59e0b, type: 'crate' },
  { x: -6.8, y: 3.2, z: -5.4, w: 1.4, h: 1.6, d: 1.6, color: 0xf59e0b, type: 'crate' },
  { x: 6.8, y: 3.2, z: 6.8, w: 3.2, h: 1.6, d: 1.4, color: 0xf59e0b, type: 'crate' },
  { x: 6.8, y: 3.2, z: 5.4, w: 1.4, h: 1.6, d: 1.6, color: 0xf59e0b, type: 'crate' },
  { x: -6.8, y: 3.2, z: 6.8, w: 3.2, h: 1.6, d: 1.4, color: 0x38bdf8, type: 'crate' },
  { x: 6.8, y: 3.2, z: -6.8, w: 3.2, h: 1.6, d: 1.4, color: 0x38bdf8, type: 'crate' },

  // 4-Way Stairs up to Central Citadel (North, South, West, East)
  ...createStairs(0, -14.5, 4.8, 1.0, 0, 1, 6, 0.4, 0x475569),
  ...createStairs(0, 14.5, 4.8, 1.0, 0, -1, 6, 0.4, 0x475569),
  ...createStairs(-14.5, 0, 4.8, 1.0, 1, 0, 6, 0.4, 0x475569),
  ...createStairs(14.5, 0, 4.8, 1.0, -1, 0, 6, 0.4, 0x475569),

  // Inner Ring Tactical Cover Walls & Containers (r ~ 20-26m)
  { x: -22, y: 1.6, z: -10, w: 3.4, h: 3.2, d: 8.5, color: 0xe11d48, type: 'container' },
  { x: -22, y: 1.6, z: 10, w: 3.4, h: 3.2, d: 8.5, color: 0x0284c7, type: 'container' },
  { x: 22, y: 1.6, z: -10, w: 3.4, h: 3.2, d: 8.5, color: 0x0284c7, type: 'container' },
  { x: 22, y: 1.6, z: 10, w: 3.4, h: 3.2, d: 8.5, color: 0xe11d48, type: 'container' },
  { x: -10, y: 1.6, z: -24, w: 8.0, h: 3.2, d: 1.5, color: 0x475569, type: 'wall' },
  { x: 10, y: 1.6, z: -24, w: 8.0, h: 3.2, d: 1.5, color: 0x475569, type: 'wall' },
  { x: -10, y: 1.6, z: 24, w: 8.0, h: 3.2, d: 1.5, color: 0x475569, type: 'wall' },
  { x: 10, y: 1.6, z: 24, w: 8.0, h: 3.2, d: 1.5, color: 0x475569, type: 'wall' },

  // Inner Diagonal Peek Crates & Pillars
  { x: -15, y: 1.0, z: -16, w: 2.2, h: 2.0, d: 2.2, color: 0xd97706, type: 'crate' },
  { x: -13, y: 0.6, z: -14.2, w: 1.4, h: 1.2, d: 1.4, color: 0xf59e0b, type: 'crate' },
  { x: 15, y: 1.0, z: 16, w: 2.2, h: 2.0, d: 2.2, color: 0xd97706, type: 'crate' },
  { x: 13, y: 0.6, z: 14.2, w: 1.4, h: 1.2, d: 1.4, color: 0xf59e0b, type: 'crate' },
  { x: 15, y: 1.0, z: -16, w: 2.2, h: 2.0, d: 2.2, color: 0x10b981, type: 'crate' },
  { x: -15, y: 1.0, z: 16, w: 2.2, h: 2.0, d: 2.2, color: 0x10b981, type: 'crate' },

  // NW & SE Elevated Sniper Overwatches (y=2.0m) + Stairs + Top Cover
  { x: -42, y: 1.0, z: -40, w: 14, h: 2.0, d: 10, color: 0x334155, type: 'platform' },
  { x: -37, y: 2.7, z: -36.5, w: 3.2, h: 1.4, d: 1.2, color: 0xf59e0b, type: 'crate' },
  { x: -45, y: 2.7, z: -36.5, w: 2.4, h: 1.4, d: 1.2, color: 0x38bdf8, type: 'crate' },
  ...createStairs(-42, -30.5, 4.2, 1.0, 0, -1, 5, 0.4, 0x64748b),

  { x: 42, y: 1.0, z: 40, w: 14, h: 2.0, d: 10, color: 0x334155, type: 'platform' },
  { x: 37, y: 2.7, z: 36.5, w: 3.2, h: 1.4, d: 1.2, color: 0xf59e0b, type: 'crate' },
  { x: 45, y: 2.7, z: 36.5, w: 2.4, h: 1.4, d: 1.2, color: 0x38bdf8, type: 'crate' },
  ...createStairs(42, 30.5, 4.2, 1.0, 0, 1, 5, 0.4, 0x64748b),

  // NE & SW Fortified Combat Decks (y=2.0m) + Stairs + Top Cover
  { x: 42, y: 1.0, z: -40, w: 14, h: 2.0, d: 10, color: 0x334155, type: 'platform' },
  { x: 37, y: 2.7, z: -36.5, w: 3.2, h: 1.4, d: 1.2, color: 0x38bdf8, type: 'crate' },
  ...createStairs(42, -30.5, 4.2, 1.0, 0, -1, 5, 0.4, 0x64748b),

  { x: -42, y: 1.0, z: 40, w: 14, h: 2.0, d: 10, color: 0x334155, type: 'platform' },
  { x: -37, y: 2.7, z: 36.5, w: 3.2, h: 1.4, d: 1.2, color: 0x38bdf8, type: 'crate' },
  ...createStairs(-42, 30.5, 4.2, 1.0, 0, 1, 5, 0.4, 0x64748b),

  // Mid-Outer Lane Bunkers (North, South, West, East at ~38-46m)
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

  // Quadrant Tactical L-Walls, Pillars & Cover Clusters (Breaking long sightlines)
  { x: -28, y: 1.6, z: -24, w: 6.5, h: 3.2, d: 1.5, color: 0x334155, type: 'wall' },
  { x: -25.5, y: 1.6, z: -21, w: 1.5, h: 3.2, d: 5.5, color: 0x334155, type: 'wall' },
  { x: 28, y: 1.6, z: -24, w: 6.5, h: 3.2, d: 1.5, color: 0x334155, type: 'wall' },
  { x: 25.5, y: 1.6, z: -21, w: 1.5, h: 3.2, d: 5.5, color: 0x334155, type: 'wall' },
  { x: -28, y: 1.6, z: 24, w: 6.5, h: 3.2, d: 1.5, color: 0x334155, type: 'wall' },
  { x: -25.5, y: 1.6, z: 21, w: 1.5, h: 3.2, d: 5.5, color: 0x334155, type: 'wall' },
  { x: 28, y: 1.6, z: 24, w: 6.5, h: 3.2, d: 1.5, color: 0x334155, type: 'wall' },
  { x: 25.5, y: 1.6, z: 21, w: 1.5, h: 3.2, d: 5.5, color: 0x334155, type: 'wall' },

  // Cyber Monolith Pillars along outer avenues
  { x: -20, y: 2.2, z: -38, w: 2.4, h: 4.4, d: 2.4, color: 0x0f172a, type: 'pillar' },
  { x: 20, y: 2.2, z: -38, w: 2.4, h: 4.4, d: 2.4, color: 0x0f172a, type: 'pillar' },
  { x: -20, y: 2.2, z: 38, w: 2.4, h: 4.4, d: 2.4, color: 0x0f172a, type: 'pillar' },
  { x: 20, y: 2.2, z: 38, w: 2.4, h: 4.4, d: 2.4, color: 0x0f172a, type: 'pillar' },
  { x: -38, y: 2.2, z: -18, w: 2.4, h: 4.4, d: 2.4, color: 0x0f172a, type: 'pillar' },
  { x: 38, y: 2.2, z: -18, w: 2.4, h: 4.4, d: 2.4, color: 0x0f172a, type: 'pillar' },
  { x: -38, y: 2.2, z: 18, w: 2.4, h: 4.4, d: 2.4, color: 0x0f172a, type: 'pillar' },
  { x: 38, y: 2.2, z: 18, w: 2.4, h: 4.4, d: 2.4, color: 0x0f172a, type: 'pillar' },

  // Outer Perimeter Cover Crates & CQB Shields
  { x: -18, y: 1.0, z: -48, w: 3.5, h: 2.0, d: 2.0, color: 0xd97706, type: 'crate' },
  { x: 18, y: 1.0, z: -48, w: 3.5, h: 2.0, d: 2.0, color: 0x0284c7, type: 'crate' },
  { x: -18, y: 1.0, z: 48, w: 3.5, h: 2.0, d: 2.0, color: 0x0284c7, type: 'crate' },
  { x: 18, y: 1.0, z: 48, w: 3.5, h: 2.0, d: 2.0, color: 0xd97706, type: 'crate' },
  { x: -48, y: 1.0, z: -18, w: 2.0, h: 2.0, d: 3.5, color: 0x10b981, type: 'crate' },
  { x: 48, y: 1.0, z: -18, w: 2.0, h: 2.0, d: 3.5, color: 0xe11d48, type: 'crate' },
  { x: -48, y: 1.0, z: 18, w: 2.0, h: 2.0, d: 3.5, color: 0xe11d48, type: 'crate' },
  { x: 48, y: 1.0, z: 18, w: 2.0, h: 2.0, d: 3.5, color: 0x10b981, type: 'crate' },

  // Additional Mid-Range Crouch/Peek Cover Barricades
  { x: -6, y: 0.75, z: -31, w: 3.2, h: 1.5, d: 1.2, color: 0x64748b, type: 'crate' },
  { x: 6, y: 0.75, z: 31, w: 3.2, h: 1.5, d: 1.2, color: 0x64748b, type: 'crate' },
  { x: -31, y: 0.75, z: 6, w: 1.2, h: 1.5, d: 3.2, color: 0x64748b, type: 'crate' },
  { x: 31, y: 0.75, z: -6, w: 1.2, h: 1.5, d: 3.2, color: 0x64748b, type: 'crate' }
];

// ============================================================================
// MAP 2: CARGO DOCKYARD (128x128m — Industrial Shipping Container Maze & Bridges)
// ============================================================================
const CARGO_DOCK_OBSTACLES = [
  ...createPerimeterWalls(64, 0x1e293b),

  // Central Elevated Cargo Loading Bridge (22x12m, height 2.4m) + Dual Stairs
  { x: 0, y: 1.2, z: 0, w: 22, h: 2.4, d: 12, color: 0x334155, type: 'platform' },
  { x: -6, y: 3.6, z: 0, w: 3.2, h: 2.4, d: 6.5, color: 0xe11d48, type: 'container' },
  { x: 6, y: 3.6, z: 0, w: 3.2, h: 2.4, d: 6.5, color: 0x0284c7, type: 'container' },
  { x: 0, y: 3.1, z: -4.8, w: 4.2, h: 1.4, d: 1.2, color: 0xf59e0b, type: 'crate' },
  { x: 0, y: 3.1, z: 4.8, w: 4.2, h: 1.4, d: 1.2, color: 0xf59e0b, type: 'crate' },
  ...createStairs(-16.5, 0, 4.5, 1.0, 1, 0, 6, 0.4, 0x475569),
  ...createStairs(16.5, 0, 4.5, 1.0, -1, 0, 6, 0.4, 0x475569),

  // North & South Container Yards (Dense CQB Corridors)
  { x: -16, y: 1.8, z: -18, w: 3.6, h: 3.6, d: 9.5, color: 0xe11d48, type: 'container' },
  { x: 0, y: 1.8, z: -19, w: 9.5, h: 3.6, d: 3.6, color: 0xd97706, type: 'container' },
  { x: 16, y: 1.8, z: -18, w: 3.6, h: 3.6, d: 9.5, color: 0x0284c7, type: 'container' },
  { x: -8, y: 1.0, z: -14, w: 2.2, h: 2.0, d: 2.2, color: 0xf59e0b, type: 'crate' },
  { x: 8, y: 1.0, z: -14, w: 2.2, h: 2.0, d: 2.2, color: 0x10b981, type: 'crate' },

  { x: -16, y: 1.8, z: 18, w: 3.6, h: 3.6, d: 9.5, color: 0x0284c7, type: 'container' },
  { x: 0, y: 1.8, z: 19, w: 9.5, h: 3.6, d: 3.6, color: 0x10b981, type: 'container' },
  { x: 16, y: 1.8, z: 18, w: 3.6, h: 3.6, d: 9.5, color: 0xe11d48, type: 'container' },
  { x: -8, y: 1.0, z: 14, w: 2.2, h: 2.0, d: 2.2, color: 0x10b981, type: 'crate' },
  { x: 8, y: 1.0, z: 14, w: 2.2, h: 2.0, d: 2.2, color: 0xf59e0b, type: 'crate' },

  // West & East Cargo Crane Platforms (y=2.0m) + Stairs
  { x: -38, y: 1.0, z: 0, w: 12, h: 2.0, d: 16, color: 0x334155, type: 'platform' },
  { x: -38, y: 4.2, z: 0, w: 2.8, h: 4.4, d: 2.8, color: 0x0f172a, type: 'pillar' },
  { x: -33, y: 2.7, z: -5, w: 1.6, h: 1.4, d: 3.2, color: 0xf59e0b, type: 'crate' },
  { x: -33, y: 2.7, z: 5, w: 1.6, h: 1.4, d: 3.2, color: 0xf59e0b, type: 'crate' },
  ...createStairs(-38, -12.5, 4.2, 1.0, 0, 1, 5, 0.4, 0x64748b),
  ...createStairs(-38, 12.5, 4.2, 1.0, 0, -1, 5, 0.4, 0x64748b),

  { x: 38, y: 1.0, z: 0, w: 12, h: 2.0, d: 16, color: 0x334155, type: 'platform' },
  { x: 38, y: 4.2, z: 0, w: 2.8, h: 4.4, d: 2.8, color: 0x0f172a, type: 'pillar' },
  { x: 33, y: 2.7, z: -5, w: 1.6, h: 1.4, d: 3.2, color: 0x38bdf8, type: 'crate' },
  { x: 33, y: 2.7, z: 5, w: 1.6, h: 1.4, d: 3.2, color: 0x38bdf8, type: 'crate' },
  ...createStairs(38, -12.5, 4.2, 1.0, 0, 1, 5, 0.4, 0x64748b),
  ...createStairs(38, 12.5, 4.2, 1.0, 0, -1, 5, 0.4, 0x64748b),

  // 4 Quadrant Container Mazes (NW, NE, SW, SE)
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

  // North & South Dock Warehouse Shelters
  { x: -10, y: 1.6, z: -46, w: 8, h: 3.2, d: 1.6, color: 0x475569, type: 'wall' },
  { x: 10, y: 1.6, z: -46, w: 8, h: 3.2, d: 1.6, color: 0x475569, type: 'wall' },
  { x: 0, y: 1.2, z: -36, w: 4.5, h: 2.4, d: 2.4, color: 0xd97706, type: 'crate' },
  { x: -10, y: 1.6, z: 46, w: 8, h: 3.2, d: 1.6, color: 0x475569, type: 'wall' },
  { x: 10, y: 1.6, z: 46, w: 8, h: 3.2, d: 1.6, color: 0x475569, type: 'wall' },
  { x: 0, y: 1.2, z: 36, w: 4.5, h: 2.4, d: 2.4, color: 0xd97706, type: 'crate' },

  // Scattered Pallet Stacks & Mid-Alley Cover
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

// ============================================================================
// MAP 3: SOLAR OUTPOST (124x124m — Desert Canyon Fortress, Bunkers & Watchtowers)
// ============================================================================
const DESERT_OUTPOST_OBSTACLES = [
  ...createPerimeterWalls(62, 0x451a03),

  // Central Solar Command Compound (16x16m elevated deck + central radar tower)
  { x: 0, y: 1.2, z: 0, w: 16, h: 2.4, d: 16, color: 0x78350f, type: 'platform' },
  { x: 0, y: 4.6, z: 0, w: 3.2, h: 4.4, d: 3.2, color: 0x451a03, type: 'pillar' },
  { x: -6, y: 3.1, z: -6, w: 3.0, h: 1.4, d: 1.4, color: 0xd97706, type: 'crate' },
  { x: 6, y: 3.1, z: 6, w: 3.0, h: 1.4, d: 1.4, color: 0xd97706, type: 'crate' },
  { x: -6, y: 3.1, z: 6, w: 3.0, h: 1.4, d: 1.4, color: 0xf59e0b, type: 'crate' },
  { x: 6, y: 3.1, z: -6, w: 3.0, h: 1.4, d: 1.4, color: 0xf59e0b, type: 'crate' },
  ...createStairs(0, -13.5, 4.6, 1.0, 0, 1, 6, 0.4, 0x92400e),
  ...createStairs(0, 13.5, 4.6, 1.0, 0, -1, 6, 0.4, 0x92400e),

  // East & West Sandstone Fortress Walls & Gateways
  { x: -18, y: 1.8, z: -9, w: 2.2, h: 3.6, d: 10, color: 0x92400e, type: 'wall' },
  { x: -18, y: 1.8, z: 9, w: 2.2, h: 3.6, d: 10, color: 0x92400e, type: 'wall' },
  { x: 18, y: 1.8, z: -9, w: 2.2, h: 3.6, d: 10, color: 0x92400e, type: 'wall' },
  { x: 18, y: 1.8, z: 9, w: 2.2, h: 3.6, d: 10, color: 0x92400e, type: 'wall' },

  // North & South Defensive Sandbag/Concrete Trenches
  { x: -11, y: 1.1, z: -22, w: 8.5, h: 2.2, d: 1.8, color: 0xb45309, type: 'wall' },
  { x: 11, y: 1.1, z: -22, w: 8.5, h: 2.2, d: 1.8, color: 0xb45309, type: 'wall' },
  { x: 0, y: 1.5, z: -28, w: 6.5, h: 3.0, d: 2.0, color: 0x78350f, type: 'wall' },
  { x: -11, y: 1.1, z: 22, w: 8.5, h: 2.2, d: 1.8, color: 0xb45309, type: 'wall' },
  { x: 11, y: 1.1, z: 22, w: 8.5, h: 2.2, d: 1.8, color: 0xb45309, type: 'wall' },
  { x: 0, y: 1.5, z: 28, w: 6.5, h: 3.0, d: 2.0, color: 0x78350f, type: 'wall' },

  // 4 Quadrant Watchtowers (y=2.4m) with Stairs & Sniper Parapets
  { x: -36, y: 1.2, z: -34, w: 11, h: 2.4, d: 11, color: 0x78350f, type: 'platform' },
  { x: -32, y: 3.1, z: -30, w: 2.6, h: 1.4, d: 1.4, color: 0xf59e0b, type: 'crate' },
  ...createStairs(-36, -23, 4.0, 1.0, 0, -1, 6, 0.4, 0xb45309),

  { x: 36, y: 1.2, z: -34, w: 11, h: 2.4, d: 11, color: 0x78350f, type: 'platform' },
  { x: 32, y: 3.1, z: -30, w: 2.6, h: 1.4, d: 1.4, color: 0xf59e0b, type: 'crate' },
  ...createStairs(36, -23, 4.0, 1.0, 0, -1, 6, 0.4, 0xb45309),

  { x: -36, y: 1.2, z: 34, w: 11, h: 2.4, d: 11, color: 0x78350f, type: 'platform' },
  { x: -32, y: 3.1, z: 30, w: 2.6, h: 1.4, d: 1.4, color: 0xf59e0b, type: 'crate' },
  ...createStairs(-36, 23, 4.0, 1.0, 0, 1, 6, 0.4, 0xb45309),

  { x: 36, y: 1.2, z: 34, w: 11, h: 2.4, d: 11, color: 0x78350f, type: 'platform' },
  { x: 32, y: 3.1, z: 30, w: 2.6, h: 1.4, d: 1.4, color: 0xf59e0b, type: 'crate' },
  ...createStairs(36, 23, 4.0, 1.0, 0, 1, 6, 0.4, 0xb45309),

  // Supply Depots & Fuel Containers in Mid/Outer Lanes
  { x: -32, y: 1.6, z: -6, w: 3.4, h: 3.2, d: 8.0, color: 0xd97706, type: 'container' },
  { x: -32, y: 1.6, z: 6, w: 3.4, h: 3.2, d: 8.0, color: 0x92400e, type: 'container' },
  { x: 32, y: 1.6, z: -6, w: 3.4, h: 3.2, d: 8.0, color: 0x92400e, type: 'container' },
  { x: 32, y: 1.6, z: 6, w: 3.4, h: 3.2, d: 8.0, color: 0xd97706, type: 'container' },

  // Canyon Rock Monoliths & Sandstone Pillars
  { x: -22, y: 2.4, z: -36, w: 3.0, h: 4.8, d: 3.0, color: 0x78350f, type: 'pillar' },
  { x: 22, y: 2.4, z: -36, w: 3.0, h: 4.8, d: 3.0, color: 0x78350f, type: 'pillar' },
  { x: -22, y: 2.4, z: 36, w: 3.0, h: 4.8, d: 3.0, color: 0x78350f, type: 'pillar' },
  { x: 22, y: 2.4, z: 36, w: 3.0, h: 4.8, d: 3.0, color: 0x78350f, type: 'pillar' },

  // Outer Bunkers & Barricades
  { x: -46, y: 1.6, z: -14, w: 7.5, h: 3.2, d: 1.8, color: 0x92400e, type: 'wall' },
  { x: -46, y: 1.6, z: 14, w: 7.5, h: 3.2, d: 1.8, color: 0x92400e, type: 'wall' },
  { x: 46, y: 1.6, z: -14, w: 7.5, h: 3.2, d: 1.8, color: 0x92400e, type: 'wall' },
  { x: 46, y: 1.6, z: 14, w: 7.5, h: 3.2, d: 1.8, color: 0x92400e, type: 'wall' },
  { x: -14, y: 1.6, z: -46, w: 1.8, h: 3.2, d: 7.5, color: 0x92400e, type: 'wall' },
  { x: 14, y: 1.6, z: -46, w: 1.8, h: 3.2, d: 7.5, color: 0x92400e, type: 'wall' },
  { x: -14, y: 1.6, z: 46, w: 1.8, h: 3.2, d: 7.5, color: 0x92400e, type: 'wall' },
  { x: 14, y: 1.6, z: 46, w: 1.8, h: 3.2, d: 7.5, color: 0x92400e, type: 'wall' },

  // Scattered Tactical Crates
  { x: -12, y: 1.0, z: -14, w: 2.2, h: 2.0, d: 2.2, color: 0xf59e0b, type: 'crate' },
  { x: 12, y: 1.0, z: -14, w: 2.2, h: 2.0, d: 2.2, color: 0xf59e0b, type: 'crate' },
  { x: -12, y: 1.0, z: 14, w: 2.2, h: 2.0, d: 2.2, color: 0xf59e0b, type: 'crate' },
  { x: 12, y: 1.0, z: 14, w: 2.2, h: 2.0, d: 2.2, color: 0xf59e0b, type: 'crate' },
  { x: -25, y: 1.0, z: -20, w: 2.5, h: 2.0, d: 2.5, color: 0xd97706, type: 'crate' },
  { x: 25, y: 1.0, z: -20, w: 2.5, h: 2.0, d: 2.5, color: 0xd97706, type: 'crate' },
  { x: -25, y: 1.0, z: 20, w: 2.5, h: 2.0, d: 2.5, color: 0xd97706, type: 'crate' },
  { x: 25, y: 1.0, z: 20, w: 2.5, h: 2.0, d: 2.5, color: 0xd97706, type: 'crate' },
  { x: 0, y: 1.0, z: -42, w: 4.2, h: 2.0, d: 2.0, color: 0xb45309, type: 'crate' },
  { x: 0, y: 1.0, z: 42, w: 4.2, h: 2.0, d: 2.0, color: 0xb45309, type: 'crate' },
  { x: -44, y: 1.0, z: 0, w: 2.0, h: 2.0, d: 4.2, color: 0xb45309, type: 'crate' },
  { x: 44, y: 1.0, z: 0, w: 2.0, h: 2.0, d: 4.2, color: 0xb45309, type: 'crate' }
];

// ============================================================================
// MAP 4: QUANTUM LAB (120x120m — High-Tech Research Complex & Server Corridors)
// ============================================================================
const NEON_LAB_OBSTACLES = [
  ...createPerimeterWalls(60, 0x0f172a),

  // Central Quantum Reactor Platform (16x16m, height 2.4m) + Reactor Core Pillar
  { x: 0, y: 1.2, z: 0, w: 16, h: 2.4, d: 16, color: 0x1e293b, type: 'platform' },
  { x: 0, y: 4.8, z: 0, w: 3.4, h: 4.8, d: 3.4, color: 0x090d16, type: 'pillar' },
  { x: -5.8, y: 3.1, z: 0, w: 1.4, h: 1.4, d: 5.2, color: 0x06b6d4, type: 'crate' },
  { x: 5.8, y: 3.1, z: 0, w: 1.4, h: 1.4, d: 5.2, color: 0x06b6d4, type: 'crate' },
  { x: 0, y: 3.1, z: -5.8, w: 5.2, h: 1.4, d: 1.4, color: 0xa855f7, type: 'crate' },
  { x: 0, y: 3.1, z: 5.8, w: 5.2, h: 1.4, d: 1.4, color: 0xa855f7, type: 'crate' },
  ...createStairs(-13.5, 0, 4.4, 1.0, 1, 0, 6, 0.4, 0x334155),
  ...createStairs(13.5, 0, 4.4, 1.0, -1, 0, 6, 0.4, 0x334155),
  ...createStairs(0, -13.5, 4.4, 1.0, 0, 1, 6, 0.4, 0x334155),
  ...createStairs(0, 13.5, 4.4, 1.0, 0, -1, 6, 0.4, 0x334155),

  // 4 Quadrant Server Rack Rooms & Containment Walls
  { x: -20, y: 1.8, z: -18, w: 9.0, h: 3.6, d: 1.6, color: 0x334155, type: 'wall' },
  { x: -16, y: 1.8, z: -23, w: 1.6, h: 3.6, d: 9.0, color: 0x334155, type: 'wall' },
  { x: -25, y: 1.8, z: -26, w: 2.6, h: 3.6, d: 6.5, color: 0x6366f1, type: 'container' },

  { x: 20, y: 1.8, z: -18, w: 9.0, h: 3.6, d: 1.6, color: 0x334155, type: 'wall' },
  { x: 16, y: 1.8, z: -23, w: 1.6, h: 3.6, d: 9.0, color: 0x334155, type: 'wall' },
  { x: 25, y: 1.8, z: -26, w: 2.6, h: 3.6, d: 6.5, color: 0x06b6d4, type: 'container' },

  { x: -20, y: 1.8, z: 18, w: 9.0, h: 3.6, d: 1.6, color: 0x334155, type: 'wall' },
  { x: -16, y: 1.8, z: 23, w: 1.6, h: 3.6, d: 9.0, color: 0x334155, type: 'wall' },
  { x: -25, y: 1.8, z: 26, w: 2.6, h: 3.6, d: 6.5, color: 0x06b6d4, type: 'container' },

  { x: 20, y: 1.8, z: 18, w: 9.0, h: 3.6, d: 1.6, color: 0x334155, type: 'wall' },
  { x: 16, y: 1.8, z: 23, w: 1.6, h: 3.6, d: 9.0, color: 0x334155, type: 'wall' },
  { x: 25, y: 1.8, z: 26, w: 2.6, h: 3.6, d: 6.5, color: 0x6366f1, type: 'container' },

  // North & South Elevated Observation Decks (y=2.0m) + Stairs
  { x: 0, y: 1.0, z: -40, w: 18, h: 2.0, d: 9, color: 0x1e293b, type: 'platform' },
  { x: -5, y: 2.7, z: -36.2, w: 3.2, h: 1.4, d: 1.2, color: 0x06b6d4, type: 'crate' },
  { x: 5, y: 2.7, z: -36.2, w: 3.2, h: 1.4, d: 1.2, color: 0xa855f7, type: 'crate' },
  ...createStairs(-13.5, -40, 4.0, 1.0, 1, 0, 5, 0.4, 0x475569),
  ...createStairs(13.5, -40, 4.0, 1.0, -1, 0, 5, 0.4, 0x475569),

  { x: 0, y: 1.0, z: 40, w: 18, h: 2.0, d: 9, color: 0x1e293b, type: 'platform' },
  { x: -5, y: 2.7, z: 36.2, w: 3.2, h: 1.4, d: 1.2, color: 0xa855f7, type: 'crate' },
  { x: 5, y: 2.7, z: 36.2, w: 3.2, h: 1.4, d: 1.2, color: 0x06b6d4, type: 'crate' },
  ...createStairs(-13.5, 40, 4.0, 1.0, 1, 0, 5, 0.4, 0x475569),
  ...createStairs(13.5, 40, 4.0, 1.0, -1, 0, 5, 0.4, 0x475569),

  // West & East Cryo-Core Towers & Cover Modules
  { x: -38, y: 2.4, z: -12, w: 2.8, h: 4.8, d: 2.8, color: 0x090d16, type: 'pillar' },
  { x: -38, y: 2.4, z: 12, w: 2.8, h: 4.8, d: 2.8, color: 0x090d16, type: 'pillar' },
  { x: 38, y: 2.4, z: -12, w: 2.8, h: 4.8, d: 2.8, color: 0x090d16, type: 'pillar' },
  { x: 38, y: 2.4, z: 12, w: 2.8, h: 4.8, d: 2.8, color: 0x090d16, type: 'pillar' },

  { x: -36, y: 1.6, z: 0, w: 3.2, h: 3.2, d: 8.5, color: 0xa855f7, type: 'container' },
  { x: 36, y: 1.6, z: 0, w: 3.2, h: 3.2, d: 8.5, color: 0xa855f7, type: 'container' },
  { x: -24, y: 1.0, z: -6, w: 2.2, h: 2.0, d: 2.2, color: 0x06b6d4, type: 'crate' },
  { x: -24, y: 1.0, z: 6, w: 2.2, h: 2.0, d: 2.2, color: 0x06b6d4, type: 'crate' },
  { x: 24, y: 1.0, z: -6, w: 2.2, h: 2.0, d: 2.2, color: 0x06b6d4, type: 'crate' },
  { x: 24, y: 1.0, z: 6, w: 2.2, h: 2.0, d: 2.2, color: 0x06b6d4, type: 'crate' },

  // Outer Corner Research Bunkers
  { x: -42, y: 1.6, z: -38, w: 8.0, h: 3.2, d: 1.6, color: 0x334155, type: 'wall' },
  { x: -38, y: 1.6, z: -42, w: 1.6, h: 3.2, d: 8.0, color: 0x334155, type: 'wall' },
  { x: 42, y: 1.6, z: -38, w: 8.0, h: 3.2, d: 1.6, color: 0x334155, type: 'wall' },
  { x: 38, y: 1.6, z: -42, w: 1.6, h: 3.2, d: 8.0, color: 0x334155, type: 'wall' },
  { x: -42, y: 1.6, z: 38, w: 8.0, h: 3.2, d: 1.6, color: 0x334155, type: 'wall' },
  { x: -38, y: 1.6, z: 42, w: 1.6, h: 3.2, d: 8.0, color: 0x334155, type: 'wall' },
  { x: 42, y: 1.6, z: 38, w: 8.0, h: 3.2, d: 1.6, color: 0x334155, type: 'wall' },
  { x: 38, y: 1.6, z: 42, w: 1.6, h: 3.2, d: 8.0, color: 0x334155, type: 'wall' },

  // Additional Lab Cover Pods
  { x: -6, y: 1.0, z: -26, w: 2.4, h: 2.0, d: 2.4, color: 0x10b981, type: 'crate' },
  { x: 6, y: 1.0, z: -26, w: 2.4, h: 2.0, d: 2.4, color: 0x10b981, type: 'crate' },
  { x: -6, y: 1.0, z: 26, w: 2.4, h: 2.0, d: 2.4, color: 0x10b981, type: 'crate' },
  { x: 6, y: 1.0, z: 26, w: 2.4, h: 2.0, d: 2.4, color: 0x10b981, type: 'crate' },
  { x: -48, y: 1.0, z: -24, w: 2.4, h: 2.0, d: 3.6, color: 0x6366f1, type: 'crate' },
  { x: 48, y: 1.0, z: -24, w: 2.4, h: 2.0, d: 3.6, color: 0x6366f1, type: 'crate' },
  { x: -48, y: 1.0, z: 24, w: 2.4, h: 2.0, d: 3.6, color: 0x6366f1, type: 'crate' },
  { x: 48, y: 1.0, z: 24, w: 2.4, h: 2.0, d: 3.6, color: 0x6366f1, type: 'crate' }
];

export const MAPS = {
  cyber_citadel: {
    id: 'cyber_citadel',
    name: 'CYBER CITADEL',
    subtitle: '120x120m • Thành cổ công nghệ & 4 đài ngắm bắn tỉa',
    badge: '120x120m • Cân bằng',
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
    },
  },

  cargo_dock: {
    id: 'cargo_dock',
    name: 'CARGO DOCKYARD',
    subtitle: '128x128m • Bến cảng container mê cung & cầu vượt trung tâm',
    badge: '128x128m • Nhiều vật cản',
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
    },
  },

  desert_outpost: {
    id: 'desert_outpost',
    name: 'SOLAR OUTPOST',
    subtitle: '124x124m • Pháo đài sa mạc, giao thông hào & 4 tháp canh',
    badge: '124x124m • Chiến thuật',
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
    },
  },

  neon_lab: {
    id: 'neon_lab',
    name: 'QUANTUM LAB',
    subtitle: '120x120m • Phòng thí nghiệm lượng tử & hành lang máy chủ CQB',
    badge: '120x120m • Cận chiến & Tầm trung',
    arenaHalfSize: 60,
    theme: {
      skyTop: '#060417',
      skyMid: '#1e1b4b',
      skyHorizon: '#3b0764',
      fogColor: 0x0f0a24,
      fogDensity: 0.0052,
      floorBase: '#0b0f1e',
      floorAlt: '#131830',
      gridStroke: 'rgba(168, 85, 247, 0.28)',
      accentHex: 0xa855f7,
      secondaryHex: 0x06b6d4
    },
    obstacles: NEON_LAB_OBSTACLES,
    healthPacks: [
      { id: 'hp_north', x: 0, y: 0, z: -22 },
      { id: 'hp_south', x: 0, y: 0, z: 22 },
      { id: 'hp_west', x: -22, y: 0, z: 0 },
      { id: 'hp_east', x: 22, y: 0, z: 0 },
      { id: 'hp_north_deck', x: 0, y: 2.0, z: -40 },
      { id: 'hp_south_deck', x: 0, y: 2.0, z: 40 }
    ],
    powerups: [
      { id: 'pu_armor_n', type: 'armor', x: -14, y: 0, z: -28 },
      { id: 'pu_armor_s', type: 'armor', x: 14, y: 0, z: 28 },
      { id: 'pu_speed_w', type: 'speed', x: -28, y: 0, z: 14 },
      { id: 'pu_damage_center', type: 'damage', x: 0, y: 2.4, z: 3.5 }
    ],
    jumpPads: [
      { id: 'jp_nw', x: -18, y: 0, z: -32, radius: 1.35, jumpForce: 14.2 },
      { id: 'jp_ne', x: 18, y: 0, z: -32, radius: 1.35, jumpForce: 14.2 },
      { id: 'jp_sw', x: -18, y: 0, z: 32, radius: 1.35, jumpForce: 14.2 },
      { id: 'jp_se', x: 18, y: 0, z: 32, radius: 1.35, jumpForce: 14.2 }
    ],
    barrels: [
      { id: 'brl_1', x: -12, y: 0, z: -20 },
      { id: 'brl_2', x: 12, y: 0, z: -20 },
      { id: 'brl_3', x: -12, y: 0, z: 20 },
      { id: 'brl_4', x: 12, y: 0, z: 20 },
      { id: 'brl_5', x: -28, y: 0, z: 0 },
      { id: 'brl_6', x: 28, y: 0, z: 0 }
    ],
    spawnPoints: [
      { x: -52, y: 0.1, z: -52, yaw: -Math.PI * 0.75 },
      { x: 52, y: 0.1, z: -52, yaw: Math.PI * 0.75 },
      { x: -52, y: 0.1, z: 52, yaw: -Math.PI * 0.25 },
      { x: 52, y: 0.1, z: 52, yaw: Math.PI * 0.25 },
      { x: -26, y: 0.1, z: -48, yaw: Math.PI },
      { x: 26, y: 0.1, z: 48, yaw: 0 },
      { x: -52, y: 0.1, z: 0, yaw: -Math.PI * 0.5 },
      { x: 52, y: 0.1, z: 0, yaw: Math.PI * 0.5 },
      { x: -30, y: 0.1, z: -16, yaw: Math.PI },
      { x: 30, y: 0.1, z: 16, yaw: 0 },
      { x: -30, y: 0.1, z: 16, yaw: 0 },
      { x: 30, y: 0.1, z: -16, yaw: Math.PI },
      { x: 26, y: 0.1, z: -48, yaw: Math.PI },
      { x: -26, y: 0.1, z: 48, yaw: 0 },
      { x: 0, y: 0.1, z: -52, yaw: Math.PI },
      { x: 0, y: 0.1, z: 52, yaw: 0 },
      { x: -52, y: 0.1, z: -30, yaw: -Math.PI * 0.5 },
      { x: 52, y: 0.1, z: -30, yaw: Math.PI * 0.5 },
      { x: -52, y: 0.1, z: 30, yaw: -Math.PI * 0.5 },
      { x: 52, y: 0.1, z: 30, yaw: Math.PI * 0.5 }
    ],
    teamSpawns: {
      alpha: [
        { x: 0, y: 0.1, z: -52, yaw: Math.PI },
        { x: -7, y: 0.1, z: -52, yaw: Math.PI },
        { x: 7, y: 0.1, z: -52, yaw: Math.PI },
        { x: -14, y: 0.1, z: -52, yaw: Math.PI },
        { x: 14, y: 0.1, z: -52, yaw: Math.PI },
        { x: -26, y: 0.1, z: -48, yaw: Math.PI },
        { x: 26, y: 0.1, z: -48, yaw: Math.PI }
      ],
      bravo: [
        { x: 0, y: 0.1, z: 52, yaw: 0 },
        { x: -7, y: 0.1, z: 52, yaw: 0 },
        { x: 7, y: 0.1, z: 52, yaw: 0 },
        { x: -14, y: 0.1, z: 52, yaw: 0 },
        { x: 14, y: 0.1, z: 52, yaw: 0 },
        { x: -26, y: 0.1, z: 48, yaw: 0 },
        { x: 26, y: 0.1, z: 48, yaw: 0 }
      ]
    }
  }
};

export const MAP_ORDER = ['cyber_citadel', 'cargo_dock', 'desert_outpost', 'neon_lab'];
export const DEFAULT_MAP_ID = 'cyber_citadel';

// Precompute static AABB bounds once at load time to avoid per-frame/per-raycast arithmetic
for (const mapId of MAP_ORDER) {
  const obstacles = MAPS[mapId]?.obstacles;
  if (!Array.isArray(obstacles)) continue;
  for (let i = 0; i < obstacles.length; i++) {
    const box = obstacles[i];
    const halfW = box.w * 0.5;
    const halfH = box.h * 0.5;
    const halfD = box.d * 0.5;
    box.halfW = halfW;
    box.halfH = halfH;
    box.halfD = halfD;
    box.minX = box.x - halfW;
    box.maxX = box.x + halfW;
    box.minY = box.y - halfH;
    box.maxY = box.y + halfH;
    box.minZ = box.z - halfD;
    box.maxZ = box.z + halfD;
  }
}

export function getMapConfig(mapId) {
  return (typeof mapId === 'string' && Object.hasOwn(MAPS, mapId)) ? MAPS[mapId] : MAPS[DEFAULT_MAP_ID];
}

// Default exports for backward compatibility
export const HEALTH_PACK_SPAWNS = MAPS[DEFAULT_MAP_ID].healthPacks;
export const SPAWN_POINTS = MAPS[DEFAULT_MAP_ID].spawnPoints;
export const MAP_OBSTACLES = MAPS[DEFAULT_MAP_ID].obstacles;

