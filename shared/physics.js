// Shared 3D spatial collision & line-of-sight helpers used by both Server and Client

import { MATCH_CONFIG } from './config.js';
import { MAPS, MAP_OBSTACLES } from './maps.js';

/**
 * Checks whether a horizontal point (x, z) at footY is clear of any map obstacle by at least `radius`
 */
export function isPointClearOfObstacles(x, z, radius = 0.75, obstaclesOrMapId = null, footY = 0.1) {
  const obstacles = Array.isArray(obstaclesOrMapId)
    ? obstaclesOrMapId
    : typeof obstaclesOrMapId === 'string' && MAPS[obstaclesOrMapId]
      ? MAPS[obstaclesOrMapId].obstacles
      : MAP_OBSTACLES;

  const headY = footY + (MATCH_CONFIG.PLAYER_HEIGHT || 1.75);
  const radiusSq = radius * radius;

  for (let i = 0; i < obstacles.length; i++) {
    const box = obstacles[i];
    const topY = box.maxY !== undefined ? box.maxY : box.y + box.h * 0.5;
    const bottomY = box.minY !== undefined ? box.minY : box.y - box.h * 0.5;
    if (footY >= topY || headY <= bottomY) continue;

    const minX = box.minX !== undefined ? box.minX : box.x - box.w * 0.5;
    const maxX = box.maxX !== undefined ? box.maxX : box.x + box.w * 0.5;
    if (x + radius <= minX || x - radius >= maxX) continue;

    const minZ = box.minZ !== undefined ? box.minZ : box.z - box.d * 0.5;
    const maxZ = box.maxZ !== undefined ? box.maxZ : box.z + box.d * 0.5;
    if (z + radius <= minZ || z - radius >= maxZ) continue;

    const closestX = x < minX ? minX : x > maxX ? maxX : x;
    const closestZ = z < minZ ? minZ : z > maxZ ? maxZ : z;
    const dx = x - closestX;
    const dz = z - closestZ;
    if (dx * dx + dz * dz < radiusSq) {
      return false;
    }
  }
  return true;
}

/**
 * Ray-AABB intersection helper for server-side line-of-sight & hit validation
 */
export function rayIntersectsAABB(origin, dir, maxDist, box) {
  const minX = box.minX !== undefined ? box.minX : box.x - box.w * 0.5;
  const maxX = box.maxX !== undefined ? box.maxX : box.x + box.w * 0.5;
  const minY = box.minY !== undefined ? box.minY : box.y - box.h * 0.5;
  const maxY = box.maxY !== undefined ? box.maxY : box.y + box.h * 0.5;
  const minZ = box.minZ !== undefined ? box.minZ : box.z - box.d * 0.5;
  const maxZ = box.maxZ !== undefined ? box.maxZ : box.z + box.d * 0.5;

  let tmin = 0;
  let tmax = maxDist;

  // X slab
  if (Math.abs(dir.x) < 1e-6) {
    if (origin.x < minX || origin.x > maxX) return null;
  } else {
    const invD = 1 / dir.x;
    let t1 = (minX - origin.x) * invD;
    let t2 = (maxX - origin.x) * invD;
    if (t1 > t2) {
      const tmp = t1;
      t1 = t2;
      t2 = tmp;
    }
    if (t1 > tmin) tmin = t1;
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return null;
  }

  // Y slab
  if (Math.abs(dir.y) < 1e-6) {
    if (origin.y < minY || origin.y > maxY) return null;
  } else {
    const invD = 1 / dir.y;
    let t1 = (minY - origin.y) * invD;
    let t2 = (maxY - origin.y) * invD;
    if (t1 > t2) {
      const tmp = t1;
      t1 = t2;
      t2 = tmp;
    }
    if (t1 > tmin) tmin = t1;
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return null;
  }

  // Z slab
  if (Math.abs(dir.z) < 1e-6) {
    if (origin.z < minZ || origin.z > maxZ) return null;
  } else {
    const invD = 1 / dir.z;
    let t1 = (minZ - origin.z) * invD;
    let t2 = (maxZ - origin.z) * invD;
    if (t1 > t2) {
      const tmp = t1;
      t1 = t2;
      t2 = tmp;
    }
    if (t1 > tmin) tmin = t1;
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return null;
  }

  return tmin >= 0 && tmin <= maxDist ? tmin : null;
}

/**
 * Checks if a line segment between two 3D points is blocked by any obstacle on the active map.
 * Uses segment AABB broadphase culling + precomputed inverse ray directions for zero-allocation speed.
 */
export function hasLineOfSight(p1, p2, obstaclesOrMapId = null) {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const dz = p2.z - p1.z;
  const dist = Math.hypot(dx, dy, dz);
  const maxDist = dist - 0.2;
  if (maxDist <= 0.001) return true;

  const invDist = 1 / dist;
  const dirX = dx * invDist;
  const dirY = dy * invDist;
  const dirZ = dz * invDist;

  const xParallel = Math.abs(dirX) < 1e-6;
  const yParallel = Math.abs(dirY) < 1e-6;
  const zParallel = Math.abs(dirZ) < 1e-6;
  const invDx = xParallel ? 0 : 1 / dirX;
  const invDy = yParallel ? 0 : 1 / dirY;
  const invDz = zParallel ? 0 : 1 / dirZ;

  const segMinX = p1.x < p2.x ? p1.x : p2.x;
  const segMaxX = p1.x > p2.x ? p1.x : p2.x;
  const segMinY = p1.y < p2.y ? p1.y : p2.y;
  const segMaxY = p1.y > p2.y ? p1.y : p2.y;
  const segMinZ = p1.z < p2.z ? p1.z : p2.z;
  const segMaxZ = p1.z > p2.z ? p1.z : p2.z;

  const obstacles = Array.isArray(obstaclesOrMapId)
    ? obstaclesOrMapId
    : typeof obstaclesOrMapId === 'string' && MAPS[obstaclesOrMapId]
      ? MAPS[obstaclesOrMapId].obstacles
      : MAP_OBSTACLES;

  for (let i = 0; i < obstacles.length; i++) {
    const box = obstacles[i];
    const minX = box.minX !== undefined ? box.minX : box.x - box.w * 0.5;
    const maxX = box.maxX !== undefined ? box.maxX : box.x + box.w * 0.5;
    if (maxX < segMinX || minX > segMaxX) continue;

    const minZ = box.minZ !== undefined ? box.minZ : box.z - box.d * 0.5;
    const maxZ = box.maxZ !== undefined ? box.maxZ : box.z + box.d * 0.5;
    if (maxZ < segMinZ || minZ > segMaxZ) continue;

    const minY = box.minY !== undefined ? box.minY : box.y - box.h * 0.5;
    const maxY = box.maxY !== undefined ? box.maxY : box.y + box.h * 0.5;
    if (maxY < segMinY || minY > segMaxY) continue;

    let tmin = 0;
    let tmax = maxDist;

    if (xParallel) {
      if (p1.x < minX || p1.x > maxX) continue;
    } else {
      let t1 = (minX - p1.x) * invDx;
      let t2 = (maxX - p1.x) * invDx;
      if (t1 > t2) {
        const tmp = t1;
        t1 = t2;
        t2 = tmp;
      }
      if (t1 > tmin) tmin = t1;
      if (t2 < tmax) tmax = t2;
      if (tmin > tmax) continue;
    }

    if (yParallel) {
      if (p1.y < minY || p1.y > maxY) continue;
    } else {
      let t1 = (minY - p1.y) * invDy;
      let t2 = (maxY - p1.y) * invDy;
      if (t1 > t2) {
        const tmp = t1;
        t1 = t2;
        t2 = tmp;
      }
      if (t1 > tmin) tmin = t1;
      if (t2 < tmax) tmax = t2;
      if (tmin > tmax) continue;
    }

    if (zParallel) {
      if (p1.z < minZ || p1.z > maxZ) continue;
    } else {
      let t1 = (minZ - p1.z) * invDz;
      let t2 = (maxZ - p1.z) * invDz;
      if (t1 > t2) {
        const tmp = t1;
        t1 = t2;
        t2 = tmp;
      }
      if (t1 > tmin) tmin = t1;
      if (t2 < tmax) tmax = t2;
      if (tmin > tmax) continue;
    }

    if (tmin >= 0 && tmin <= maxDist) {
      return false;
    }
  }
  return true;
}

// ---------------------------------------------------------------------------------------------
// Deterministic collision primitives shared by the client (player + grenades), the server
// (grenades, throw start-position test). Pure functions: no DOM/Three/Node.
// ---------------------------------------------------------------------------------------------

/**
 * Cylinder ("capsule") vs AABB-list collision for a standing body: resolves wall push-out, ceiling bumps and
 * returns the highest walkable floor top under the body.
 *
 * `body` is mutated in place: { x, y (feet), z, vy? }. Only x/z (push-out), y and vy (head bump) are written.
 *  - A box whose top is at most `stepUp` above the feet (and the body is not rising faster than 2.2 m/s)
 *    is treated as walkable floor (step-up) and reported through the return value, never as a wall.
 *  - Otherwise a box overlapping the body's vertical span pushes the body out horizontally; if the body is
 *    rising into the underside of a box the head is bumped (y snapped below it, vy = 0).
 *
 * @returns {number} highest floor top reachable from the current feet height (0 = ground plane).
 */
export function collideCapsuleVsBoxes(body, obstacles, radius, height, stepUp = 0.52, dt = 0) {
  const radiusSq = radius * radius;
  let highestFloor = 0;

  for (let i = 0; i < obstacles.length; i++) {
    const box = obstacles[i];
    const minX = box.minX !== undefined ? box.minX : box.x - box.w * 0.5;
    const maxX = box.maxX !== undefined ? box.maxX : box.x + box.w * 0.5;
    if (body.x + radius <= minX || body.x - radius >= maxX) continue;

    const minZ = box.minZ !== undefined ? box.minZ : box.z - box.d * 0.5;
    const maxZ = box.maxZ !== undefined ? box.maxZ : box.z + box.d * 0.5;
    if (body.z + radius <= minZ || body.z - radius >= maxZ) continue;

    const topY = box.maxY !== undefined ? box.maxY : box.y + box.h * 0.5;
    const bottomY = box.minY !== undefined ? box.minY : box.y - box.h * 0.5;

    const closestX = body.x < minX ? minX : body.x > maxX ? maxX : body.x;
    const closestZ = body.z < minZ ? minZ : body.z > maxZ ? maxZ : body.z;
    const dx = body.x - closestX;
    const dz = body.z - closestZ;
    const distSq = dx * dx + dz * dz;

    if (distSq < radiusSq) {
      const vy = body.vy || 0;
      if (body.y + stepUp >= topY && vy <= 2.2) {
        if (topY > highestFloor) {
          highestFloor = topY;
        }
      } else if (body.y < topY && body.y + height > bottomY) {
        if (vy > 0 && body.y + height - vy * dt <= bottomY + 0.15) {
          body.y = bottomY - height;
          body.vy = 0;
        } else {
          const dist = Math.sqrt(distSq);
          if (dist > 0.0001) {
            const overlap = radius - dist;
            body.x += (dx / dist) * overlap;
            body.z += (dz / dist) * overlap;
          } else {
            const penLeft = Math.abs(body.x - minX);
            const penRight = Math.abs(maxX - body.x);
            const penFront = Math.abs(body.z - minZ);
            const penBack = Math.abs(maxZ - body.z);
            const minPen = Math.min(penLeft, penRight, penFront, penBack);
            if (minPen === penLeft) body.x = minX - radius;
            else if (minPen === penRight) body.x = maxX + radius;
            else if (minPen === penFront) body.z = minZ - radius;
            else body.z = maxZ + radius;
          }
        }
      }
    }
  }

  return highestFloor;
}

/**
 * Read-only floor query: the highest box top under the circle (x, z, radius) that a body with its feet at `y`
 * can step onto (top <= y + stepUp). Returns 0 (ground plane) when nothing qualifies.
 */
export function findGroundY(x, y, z, radius, obstacles, stepUp = 0.52) {
  const radiusSq = radius * radius;
  let ground = 0;
  for (let i = 0; i < obstacles.length; i++) {
    const box = obstacles[i];
    const minX = box.minX !== undefined ? box.minX : box.x - box.w * 0.5;
    const maxX = box.maxX !== undefined ? box.maxX : box.x + box.w * 0.5;
    if (x + radius <= minX || x - radius >= maxX) continue;
    const minZ = box.minZ !== undefined ? box.minZ : box.z - box.d * 0.5;
    const maxZ = box.maxZ !== undefined ? box.maxZ : box.z + box.d * 0.5;
    if (z + radius <= minZ || z - radius >= maxZ) continue;
    const topY = box.maxY !== undefined ? box.maxY : box.y + box.h * 0.5;
    if (y + stepUp < topY || topY <= ground) continue;
    const closestX = x < minX ? minX : x > maxX ? maxX : x;
    const closestZ = z < minZ ? minZ : z > maxZ ? maxZ : z;
    const dx = x - closestX;
    const dz = z - closestZ;
    if (dx * dx + dz * dz < radiusSq) ground = topY;
  }
  return ground;
}

/**
 * True when point (x, y, z) lies inside any obstacle box inflated by `radius` on every axis (inclusive bounds).
 * Used by the grenade throw start-position test (a grenade must not spawn inside / through a wall).
 */
export function isPointInsideInflatedBoxes(x, y, z, radius, obstacles) {
  for (let j = 0; j < obstacles.length; j++) {
    const box = obstacles[j];
    const minX = (box.minX !== undefined ? box.minX : box.x - box.w * 0.5) - radius;
    const maxX = (box.maxX !== undefined ? box.maxX : box.x + box.w * 0.5) + radius;
    const minY = (box.minY !== undefined ? box.minY : box.y - box.h * 0.5) - radius;
    const maxY = (box.maxY !== undefined ? box.maxY : box.y + box.h * 0.5) + radius;
    const minZ = (box.minZ !== undefined ? box.minZ : box.z - box.d * 0.5) - radius;
    const maxZ = (box.maxZ !== undefined ? box.maxZ : box.z + box.d * 0.5) + radius;
    if (x >= minX && x <= maxX && y >= minY && y <= maxY && z >= minZ && z <= maxZ) return true;
  }
  return false;
}

export const GRENADE_RADIUS = 0.18;
export const GRENADE_RESTITUTION = 0.45;
export const GRENADE_FLOOR_Y = 0.18;
export const GRENADE_SUBSTEP_DT = 0.02;
export const GRENADE_MAX_STEP_DT = 3.0;
export const GRENADE_MAX_SUBSTEPS = 60;

/**
 * Integrates one grenade ({ x, y, z, vx, vy, vz }) forward by `dt` seconds with gravity, arena-wall bounce,
 * obstacle AABB bounce and floor bounce / rolling friction. The interval is sub-stepped in <= 20 ms slices
 * (max 60 slices, dt clamped to 3 s) so fast throws cannot tunnel through thin walls.
 * Mutates the grenade in place and returns the strongest bounce impact speed seen (0 = no bounce) so callers
 * can trigger a bounce sound.
 */
export function stepGrenade(g, dt, mapCfg) {
  const obstacles = (mapCfg && mapCfg.obstacles) || [];
  const arenaLimit = ((mapCfg && mapCfg.arenaHalfSize) || MATCH_CONFIG.ARENA_HALF_SIZE) - 0.25;
  const gravity = MATCH_CONFIG.GRAVITY || 22.0;
  const restitution = GRENADE_RESTITUTION;
  const floorY = GRENADE_FLOOR_Y;
  const radius = GRENADE_RADIUS;

  const totalDt = Math.min(GRENADE_MAX_STEP_DT, Math.max(0, Number(dt) || 0));
  const steps = Math.max(1, Math.min(GRENADE_MAX_SUBSTEPS, Math.ceil(totalDt / GRENADE_SUBSTEP_DT)));
  const stepDt = totalDt / steps;
  let bounceImpact = 0;

  for (let s = 0; s < steps; s++) {
    const prevX = g.x;
    const prevY = g.y;
    const prevZ = g.z;
    g.vy -= gravity * stepDt;
    g.x += g.vx * stepDt;
    g.y += g.vy * stepDt;
    g.z += g.vz * stepDt;

    // Arena outer wall bounce
    if (g.x > arenaLimit) {
      bounceImpact = Math.max(bounceImpact, Math.abs(g.vx));
      g.x = arenaLimit;
      g.vx = -Math.abs(g.vx) * restitution;
      g.vz *= 0.85;
    } else if (g.x < -arenaLimit) {
      bounceImpact = Math.max(bounceImpact, Math.abs(g.vx));
      g.x = -arenaLimit;
      g.vx = Math.abs(g.vx) * restitution;
      g.vz *= 0.85;
    }

    if (g.z > arenaLimit) {
      bounceImpact = Math.max(bounceImpact, Math.abs(g.vz));
      g.z = arenaLimit;
      g.vz = -Math.abs(g.vz) * restitution;
      g.vx *= 0.85;
    } else if (g.z < -arenaLimit) {
      bounceImpact = Math.max(bounceImpact, Math.abs(g.vz));
      g.z = -arenaLimit;
      g.vz = Math.abs(g.vz) * restitution;
      g.vx *= 0.85;
    }

    // Obstacle AABB bounce with damping (restitution ~0.45)
    for (let j = 0; j < obstacles.length; j++) {
      const box = obstacles[j];
      const minX = (box.minX !== undefined ? box.minX : box.x - box.w * 0.5) - radius;
      const maxX = (box.maxX !== undefined ? box.maxX : box.x + box.w * 0.5) + radius;
      if (g.x < minX || g.x > maxX) continue;

      const minZ = (box.minZ !== undefined ? box.minZ : box.z - box.d * 0.5) - radius;
      const maxZ = (box.maxZ !== undefined ? box.maxZ : box.z + box.d * 0.5) + radius;
      if (g.z < minZ || g.z > maxZ) continue;

      const minY = (box.minY !== undefined ? box.minY : box.y - box.h * 0.5) - radius;
      const maxY = (box.maxY !== undefined ? box.maxY : box.y + box.h * 0.5) + radius;
      if (g.y < minY || g.y > maxY) continue;

      const wasHorizInside =
        prevX > minX + 0.02 && prevX < maxX - 0.02 &&
        prevZ > minZ + 0.02 && prevZ < maxZ - 0.02;

      if (wasHorizInside && prevY >= maxY - 0.06 && g.vy <= 0) {
        g.y = maxY;
        if (g.vy < -1.1) {
          bounceImpact = Math.max(bounceImpact, Math.abs(g.vy));
          g.vy = -g.vy * restitution;
          g.vx *= 0.78;
          g.vz *= 0.78;
        } else {
          g.vy = 0;
          const topFriction = Math.max(0, 1 - 5.5 * stepDt);
          g.vx *= topFriction;
          g.vz *= topFriction;
        }
      } else if (wasHorizInside && prevY <= minY + 0.06 && g.vy > 0) {
        bounceImpact = Math.max(bounceImpact, Math.abs(g.vy));
        g.y = minY;
        g.vy = -Math.abs(g.vy) * restitution;
      } else if (prevX <= minX + 0.03 && g.vx > 0) {
        bounceImpact = Math.max(bounceImpact, Math.abs(g.vx));
        g.x = minX;
        g.vx = -Math.abs(g.vx) * restitution;
        g.vz *= 0.82;
      } else if (prevX >= maxX - 0.03 && g.vx < 0) {
        bounceImpact = Math.max(bounceImpact, Math.abs(g.vx));
        g.x = maxX;
        g.vx = Math.abs(g.vx) * restitution;
        g.vz *= 0.82;
      } else if (prevZ <= minZ + 0.03 && g.vz > 0) {
        bounceImpact = Math.max(bounceImpact, Math.abs(g.vz));
        g.z = minZ;
        g.vz = -Math.abs(g.vz) * restitution;
        g.vx *= 0.82;
      } else if (prevZ >= maxZ - 0.03 && g.vz < 0) {
        bounceImpact = Math.max(bounceImpact, Math.abs(g.vz));
        g.z = maxZ;
        g.vz = Math.abs(g.vz) * restitution;
        g.vx *= 0.82;
      } else {
        const penLeft = Math.abs(g.x - minX);
        const penRight = Math.abs(maxX - g.x);
        const penFront = Math.abs(g.z - minZ);
        const penBack = Math.abs(maxZ - g.z);
        const minPen = Math.min(penLeft, penRight, penFront, penBack);

        if (minPen === penLeft) {
          g.x = minX;
          g.vx = -Math.abs(g.vx) * restitution;
          g.vz *= 0.82;
        } else if (minPen === penRight) {
          g.x = maxX;
          g.vx = Math.abs(g.vx) * restitution;
          g.vz *= 0.82;
        } else if (minPen === penFront) {
          g.z = minZ;
          g.vz = -Math.abs(g.vz) * restitution;
          g.vx *= 0.82;
        } else {
          g.z = maxZ;
          g.vz = Math.abs(g.vz) * restitution;
          g.vx *= 0.82;
        }
      }
    }

    // Floor bounce (y = 0.18) & rolling friction
    if (g.y <= floorY) {
      g.y = floorY;
      if (g.vy < -1.1) {
        bounceImpact = Math.max(bounceImpact, Math.abs(g.vy));
        g.vy = -g.vy * restitution;
        g.vx *= 0.78;
        g.vz *= 0.78;
      } else {
        g.vy = 0;
        const groundFriction = Math.max(0, 1 - 6.5 * stepDt);
        g.vx *= groundFriction;
        g.vz *= groundFriction;
        if (Math.hypot(g.vx, g.vz) < 0.08) {
          g.vx = 0;
          g.vz = 0;
        }
      }
    }
  }

  return bounceImpact;
}

