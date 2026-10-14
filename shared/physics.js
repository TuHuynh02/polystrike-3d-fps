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

