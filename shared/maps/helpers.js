// Shared Map Geometry Builders, Tactical Cover Primitives & AABB Precomputation
// Pure ES module (isomorphic between Node.js server and browser Three.js client)

/**
 * Builds a walkable staircase of `steps` AABB step boxes along (dirX, dirZ).
 * Default stepH = 0.48m (< PLAYER_STEP_UP = 0.52m) so players smoothly walk/sprint up without jumping.
 */
export function createStairs(
  startX,
  startZ,
  stepW,
  stepD,
  dirX,
  dirZ,
  steps = 5,
  stepH = 0.48,
  color = 0x475569
) {
  const list = [];
  for (let i = 0; i < steps; i++) {
    const h = Math.round((i + 1) * stepH * 1000) / 1000;
    const x = Math.round((startX + dirX * i * stepD) * 1000) / 1000;
    const z = Math.round((startZ + dirZ * i * stepD) * 1000) / 1000;
    list.push({
      x,
      y: Math.round((h / 2) * 1000) / 1000,
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

/**
 * Builds the 4 outer arena perimeter containment walls at `±(halfSize + 0.5)`.
 */
export function createPerimeterWalls(halfSize, wallColor = 0x1e293b) {
  const span = halfSize * 2 + 2;
  const pos = halfSize + 0.5;
  return [
    { x: 0, y: 4.5, z: -pos, w: span, h: 9, d: 1, color: wallColor, type: 'wall' },
    { x: 0, y: 4.5, z: pos, w: span, h: 9, d: 1, color: wallColor, type: 'wall' },
    { x: -pos, y: 4.5, z: 0, w: 1, h: 9, d: span, color: wallColor, type: 'wall' },
    { x: pos, y: 4.5, z: 0, w: 1, h: 9, d: span, color: wallColor, type: 'wall' }
  ];
}

/**
 * Builds a CS:GO Dust II / Valorant Ascent style Double-Door Choke Gate:
 * Two fortified blast walls separated by a sniper peek gap (`gapWidth`).
 */
export function createDoubleDoors(
  centerX,
  centerZ,
  wingSpan = 8.5,
  gapWidth = 5.0,
  thickness = 1.6,
  height = 3.2,
  alongX = true,
  wallColor = 0x475569
) {
  const offset = gapWidth * 0.5 + wingSpan * 0.5;
  const cy = Math.round((height * 0.5) * 1000) / 1000;
  if (alongX) {
    return [
      { x: centerX - offset, y: cy, z: centerZ, w: wingSpan, h: height, d: thickness, color: wallColor, type: 'wall' },
      { x: centerX + offset, y: cy, z: centerZ, w: wingSpan, h: height, d: thickness, color: wallColor, type: 'wall' }
    ];
  }
  return [
    { x: centerX, y: cy, z: centerZ - offset, w: thickness, h: height, d: wingSpan, color: wallColor, type: 'wall' },
    { x: centerX, y: cy, z: centerZ + offset, w: thickness, h: height, d: wingSpan, color: wallColor, type: 'wall' }
  ];
}

/**
 * Builds a 2-step Skill-Jump Boost Box pair (CS:GO Xbox / Mirage Short / CF Transport Ship style):
 * A lower step-jump crate (`h = 1.1m`) adjacent to a high boost crate (`h = 2.0m`).
 */
export function createBoostPair(
  highX,
  highZ,
  stepOffsetX,
  stepOffsetZ,
  highColor = 0xd97706,
  lowColor = 0xf59e0b,
  baseY = 0
) {
  return [
    {
      x: highX,
      y: Math.round((baseY + 1.0) * 1000) / 1000,
      z: highZ,
      w: 2.2,
      h: 2.0,
      d: 2.2,
      color: highColor,
      type: 'crate'
    },
    {
      x: Math.round((highX + stepOffsetX) * 1000) / 1000,
      y: Math.round((baseY + 0.55) * 1000) / 1000,
      z: Math.round((highZ + stepOffsetZ) * 1000) / 1000,
      w: 1.4,
      h: 1.1,
      d: 1.4,
      color: lowColor,
      type: 'crate'
    }
  ];
}

/**
 * Precomputes static AABB bounds (`halfW/H/D`, `minX/Y/Z`, `maxX/Y/Z`) on each obstacle in place.
 */
export function precomputeObstacleAABBs(obstacles) {
  if (!Array.isArray(obstacles)) return obstacles;
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
  return obstacles;
}

/**
 * Resolves the nearest named tactical callout region (`MID COURTYARD`, `A-HEAVEN`, `DOUBLE DOORS`, `XBOX`, etc.)
 * for a world position `(x, z)` on a given map configuration.
 */
export function getCalloutAt(mapConfig, x, z) {
  const callouts = mapConfig?.callouts;
  if (!Array.isArray(callouts) || callouts.length === 0) return null;
  let best = null;
  let bestDistSq = Infinity;
  for (let i = 0; i < callouts.length; i++) {
    const c = callouts[i];
    const dx = x - c.x;
    const dz = z - c.z;
    const dSq = dx * dx + dz * dz;
    const r = c.radius || 16;
    if (dSq <= r * r && dSq < bestDistSq) {
      best = c;
      bestDistSq = dSq;
    }
  }
  return best;
}
