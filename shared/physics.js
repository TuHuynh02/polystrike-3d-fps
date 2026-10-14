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
  for (let i = 0; i < obstacles.length; i++) {
    const box = obstacles[i];
    const halfH = box.h / 2;
    const topY = box.y + halfH;
    const bottomY = box.y - halfH;
    if (footY >= topY || headY <= bottomY) continue;

    const halfW = box.w / 2;
    const halfD = box.d / 2;
    const closestX = Math.max(box.x - halfW, Math.min(x, box.x + halfW));
    const closestZ = Math.max(box.z - halfD, Math.min(z, box.z + halfD));
    const dx = x - closestX;
    const dz = z - closestZ;
    if (dx * dx + dz * dz < radius * radius) {
      return false;
    }
  }
  return true;
}

/**
 * Ray-AABB intersection helper for server-side line-of-sight & hit validation
 */
export function rayIntersectsAABB(origin, dir, maxDist, box) {
  const halfW = box.w / 2;
  const halfH = box.h / 2;
  const halfD = box.d / 2;
  const minX = box.x - halfW;
  const maxX = box.x + halfW;
  const minY = box.y - halfH;
  const maxY = box.y + halfH;
  const minZ = box.z - halfD;
  const maxZ = box.z + halfD;

  let tmin = 0;
  let tmax = maxDist;

  // X slab
  if (Math.abs(dir.x) < 1e-6) {
    if (origin.x < minX || origin.x > maxX) return null;
  } else {
    const invD = 1 / dir.x;
    let t1 = (minX - origin.x) * invD;
    let t2 = (maxX - origin.x) * invD;
    if (t1 > t2) [t1, t2] = [t2, t1];
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) return null;
  }

  // Y slab
  if (Math.abs(dir.y) < 1e-6) {
    if (origin.y < minY || origin.y > maxY) return null;
  } else {
    const invD = 1 / dir.y;
    let t1 = (minY - origin.y) * invD;
    let t2 = (maxY - origin.y) * invD;
    if (t1 > t2) [t1, t2] = [t2, t1];
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) return null;
  }

  // Z slab
  if (Math.abs(dir.z) < 1e-6) {
    if (origin.z < minZ || origin.z > maxZ) return null;
  } else {
    const invD = 1 / dir.z;
    let t1 = (minZ - origin.z) * invD;
    let t2 = (maxZ - origin.z) * invD;
    if (t1 > t2) [t1, t2] = [t2, t1];
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) return null;
  }

  return tmin >= 0 && tmin <= maxDist ? tmin : null;
}

/**
 * Checks if a line segment between two 3D points is blocked by any obstacle on the active map
 */
export function hasLineOfSight(p1, p2, obstaclesOrMapId = null) {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const dz = p2.z - p1.z;
  const dist = Math.hypot(dx, dy, dz);
  if (dist < 0.001) return true;
  const dir = { x: dx / dist, y: dy / dist, z: dz / dist };

  const obstacles = Array.isArray(obstaclesOrMapId)
    ? obstaclesOrMapId
    : typeof obstaclesOrMapId === 'string' && MAPS[obstaclesOrMapId]
      ? MAPS[obstaclesOrMapId].obstacles
      : MAP_OBSTACLES;

  for (let i = 0; i < obstacles.length; i++) {
    const hitT = rayIntersectsAABB(p1, dir, dist - 0.2, obstacles[i]);
    if (hitT !== null) return false;
  }
  return true;
}
