// Server-Side Lag Compensation (Hitbox Rewind & Interpolation) Helper Module
// Maintains a compact ~350ms ring buffer of player position/posture snapshots
// and provides up to 250ms hitbox rewind + restoration during server shot validation.

import { MATCH_CONFIG } from './config.js';
import { rayIntersectsAABB } from './physics.js';

export const LAG_COMP_HISTORY_MS = 350;
export const LAG_COMP_MAX_REWIND_MS = 250;
export const LAG_COMP_MAX_SNAPSHOTS = 32;
export const KILL_ADRENALINE_HEAL = 25;

/**
 * Records a player's current position and posture `(timestamp, x, y, z, crouch, prone)`
 * into a compact ring buffer (`player.positionHistory`), pruning snapshots older than ~350ms.
 */
export function recordPlayerSnapshot(player, timestamp = Date.now()) {
  if (!player || typeof player !== 'object') return null;

  const ts = typeof timestamp === 'number' && Number.isFinite(timestamp) ? timestamp : Date.now();
  if (!Array.isArray(player.positionHistory)) {
    player.positionHistory = [];
  }
  player.lagHistory = player.positionHistory;
  const history = player.positionHistory;

  const x = Number(player.x) || 0;
  const y = Number(player.y) || 0;
  const z = Number(player.z) || 0;
  const crouch = Boolean(player.crouching ?? player.crouch);
  const prone = Boolean(player.prone);

  // If timestamps jumped backward (e.g., synthetic timestamps in unit tests after creation), reset stale future entries
  if (history.length > 0 && ts < history[history.length - 1].timestamp) {
    while (history.length > 0 && history[history.length - 1].timestamp > ts) {
      history.pop();
    }
  }

  // Update in place if recorded at the exact same millisecond
  if (history.length > 0 && history[history.length - 1].timestamp === ts) {
    const last = history[history.length - 1];
    last.x = x;
    last.y = y;
    last.z = z;
    last.crouch = crouch;
    last.crouching = crouch;
    last.prone = prone;
    return last;
  }

  // Prune snapshots older than LAG_COMP_HISTORY_MS (350ms), keeping at most one anchor snapshot just before cutoff if needed
  const cutoff = ts - LAG_COMP_HISTORY_MS;
  while (history.length > 0 && history[0].timestamp < cutoff) {
    history.shift();
  }

  let snap;
  if (history.length >= LAG_COMP_MAX_SNAPSHOTS) {
    snap = history.shift();
    snap.timestamp = ts;
    snap.x = x;
    snap.y = y;
    snap.z = z;
    snap.crouch = crouch;
    snap.crouching = crouch;
    snap.prone = prone;
  } else {
    snap = {
      timestamp: ts,
      x,
      y,
      z,
      crouch,
      crouching: crouch,
      prone
    };
  }

  history.push(snap);
  return snap;
}

/**
 * Records position snapshots for all alive players in a room at `timestamp`.
 */
export function recordRoomSnapshots(room, timestamp = Date.now()) {
  if (!room || !room.players) return;
  for (const player of room.players.values()) {
    if (player && player.alive) {
      recordPlayerSnapshot(player, timestamp);
    }
  }
}

/**
 * Interpolates a player's historical `(x, y, z, crouch, prone)` at `targetTimestamp`,
 * clamped to at most `LAG_COMP_MAX_REWIND_MS` (250ms) prior to the reference current time.
 */
export function getRewoundPlayerPosition(player, targetTimestamp, now = Date.now()) {
  if (!player || typeof player !== 'object') return null;

  const liveX = Number(player.x) || 0;
  const liveY = Number(player.y) || 0;
  const liveZ = Number(player.z) || 0;
  const liveCrouch = Boolean(player.crouching ?? player.crouch);
  const liveProne = Boolean(player.prone);

  const history = Array.isArray(player.positionHistory) ? player.positionHistory : [];
  if (history.length === 0) {
    const fallbackTs = typeof targetTimestamp === 'number' && Number.isFinite(targetTimestamp)
      ? targetTimestamp
      : now;
    return {
      timestamp: fallbackTs,
      x: liveX,
      y: liveY,
      z: liveZ,
      crouch: liveCrouch,
      crouching: liveCrouch,
      prone: liveProne
    };
  }

  const lastSnap = history[history.length - 1];
  const hasRealClock = typeof now === 'number' && Number.isFinite(now) && Math.abs(now - lastSnap.timestamp) <= 5000;
  const refNow = hasRealClock ? Math.max(now, lastSnap.timestamp) : lastSnap.timestamp;

  let requestedTs = typeof targetTimestamp === 'number' && Number.isFinite(targetTimestamp)
    ? targetTimestamp
    : refNow;

  // If caller passed a small positive rewind duration (e.g. 100ms) while timestamps are epoch ms (> 1e9)
  if (refNow > 1e9 && requestedTs >= 0 && requestedTs <= 5000) {
    requestedTs = refNow - requestedTs;
  }

  const minAllowedTs = refNow - LAG_COMP_MAX_REWIND_MS;
  const clampedTs = Math.max(minAllowedTs, Math.min(refNow, requestedTs));

  const firstSnap = history[0];
  if (clampedTs <= firstSnap.timestamp) {
    return {
      timestamp: clampedTs,
      x: firstSnap.x,
      y: firstSnap.y,
      z: firstSnap.z,
      crouch: Boolean(firstSnap.crouch),
      crouching: Boolean(firstSnap.crouch),
      prone: Boolean(firstSnap.prone)
    };
  }

  if (clampedTs >= lastSnap.timestamp) {
    if (
      refNow > lastSnap.timestamp &&
      (
        liveX !== lastSnap.x ||
        liveY !== lastSnap.y ||
        liveZ !== lastSnap.z ||
        liveCrouch !== Boolean(lastSnap.crouch) ||
        liveProne !== Boolean(lastSnap.prone)
      )
    ) {
      const span = refNow - lastSnap.timestamp;
      const alpha = span > 0 ? Math.max(0, Math.min(1, (clampedTs - lastSnap.timestamp) / span)) : 1;
      const crouch = alpha < 0.5 ? Boolean(lastSnap.crouch) : liveCrouch;
      const prone = alpha < 0.5 ? Boolean(lastSnap.prone) : liveProne;
      return {
        timestamp: clampedTs,
        x: lastSnap.x + (liveX - lastSnap.x) * alpha,
        y: lastSnap.y + (liveY - lastSnap.y) * alpha,
        z: lastSnap.z + (liveZ - lastSnap.z) * alpha,
        crouch,
        crouching: crouch,
        prone
      };
    }

    return {
      timestamp: clampedTs,
      x: lastSnap.x,
      y: lastSnap.y,
      z: lastSnap.z,
      crouch: Boolean(lastSnap.crouch),
      crouching: Boolean(lastSnap.crouch),
      prone: Boolean(lastSnap.prone)
    };
  }

  for (let i = history.length - 1; i >= 1; i--) {
    const b = history[i];
    const a = history[i - 1];
    if (clampedTs >= a.timestamp && clampedTs <= b.timestamp) {
      const span = b.timestamp - a.timestamp;
      const alpha = span > 0 ? (clampedTs - a.timestamp) / span : 0;
      const crouch = alpha < 0.5 ? Boolean(a.crouch) : Boolean(b.crouch);
      const prone = alpha < 0.5 ? Boolean(a.prone) : Boolean(b.prone);
      return {
        timestamp: clampedTs,
        x: a.x + (b.x - a.x) * alpha,
        y: a.y + (b.y - a.y) * alpha,
        z: a.z + (b.z - a.z) * alpha,
        crouch,
        crouching: crouch,
        prone
      };
    }
  }

  return {
    timestamp: clampedTs,
    x: liveX,
    y: liveY,
    z: liveZ,
    crouch: liveCrouch,
    crouching: liveCrouch,
    prone: liveProne
  };
}

/**
 * Resolves the effective rewind duration (0..250ms) for a shot payload and shooter.
 */
export function resolveShotRewindMs(shooter, payload = {}, now = Date.now()) {
  let rawMs = 0;

  if (typeof payload?.rewindMs === 'number' && Number.isFinite(payload.rewindMs)) {
    rawMs = payload.rewindMs;
  } else if (typeof payload?.latencyMs === 'number' && Number.isFinite(payload.latencyMs)) {
    rawMs = payload.latencyMs;
  } else if (typeof payload?.shotTimestamp === 'number' && Number.isFinite(payload.shotTimestamp)) {
    rawMs = now - payload.shotTimestamp;
  } else if (typeof payload?.clientTimestamp === 'number' && Number.isFinite(payload.clientTimestamp)) {
    rawMs = now - payload.clientTimestamp;
  } else if (typeof payload?.pingMs === 'number' && Number.isFinite(payload.pingMs)) {
    rawMs = payload.pingMs * 0.5;
  } else if (typeof payload?.rttMs === 'number' && Number.isFinite(payload.rttMs)) {
    rawMs = payload.rttMs * 0.5;
  } else if (typeof shooter?.latencyMs === 'number' && Number.isFinite(shooter.latencyMs)) {
    rawMs = shooter.latencyMs;
  } else if (typeof shooter?.pingMs === 'number' && Number.isFinite(shooter.pingMs)) {
    rawMs = shooter.pingMs * 0.5;
  } else if (typeof shooter?.rttMs === 'number' && Number.isFinite(shooter.rttMs)) {
    rawMs = shooter.rttMs * 0.5;
  }

  return Math.max(0, Math.min(LAG_COMP_MAX_REWIND_MS, rawMs));
}

/**
 * Temporarily rewinds all alive enemy players in `room` by `rewindMs` (clamped to max 250ms)
 * and returns `savedStates` so `restoreRewoundPlayers(savedStates)` can restore live positions after hit detection.
 */
export function rewindRoomPlayersForShot(room, shooterId, rewindMs = undefined, now = Date.now()) {
  if (!room || !room.players) return [];

  let rawRewind = rewindMs;
  if ((rawRewind === undefined || rawRewind === null) && shooterId && typeof room.players.get === 'function') {
    const shooterObj = room.players.get(shooterId);
    if (shooterObj) {
      rawRewind = resolveShotRewindMs(shooterObj, {}, now);
    }
  }

  let effectiveRewindMs = Number(rawRewind) || 0;
  if (effectiveRewindMs > 1e9 && typeof now === 'number' && now >= effectiveRewindMs) {
    effectiveRewindMs = now - effectiveRewindMs;
  }
  effectiveRewindMs = Math.max(0, Math.min(LAG_COMP_MAX_REWIND_MS, effectiveRewindMs));
  if (effectiveRewindMs <= 0) return [];

  const savedStates = [];
  for (const player of room.players.values()) {
    if (!player || !player.alive || player.id === shooterId) continue;

    savedStates.push({
      player,
      id: player.id,
      x: player.x,
      y: player.y,
      z: player.z,
      crouch: Boolean(player.crouching ?? player.crouch),
      crouching: Boolean(player.crouching ?? player.crouch),
      prone: Boolean(player.prone)
    });

    const history = Array.isArray(player.positionHistory) ? player.positionHistory : [];
    const lastSnap = history.length > 0 ? history[history.length - 1] : null;
    const refNow = lastSnap && Math.abs(now - lastSnap.timestamp) > 5000
      ? lastSnap.timestamp
      : now;

    const targetTimestamp = refNow - effectiveRewindMs;
    const rewound = getRewoundPlayerPosition(player, targetTimestamp, refNow);
    if (rewound) {
      player.x = rewound.x;
      player.y = rewound.y;
      player.z = rewound.z;
      player.crouching = Boolean(rewound.crouch);
      player.crouch = Boolean(rewound.crouch);
      player.prone = Boolean(rewound.prone);
    }
  }

  return savedStates;
}

/**
 * Restores all players whose positions were temporarily rewound by `rewindRoomPlayersForShot`.
 */
export function restoreRewoundPlayers(savedStates) {
  if (!Array.isArray(savedStates) || savedStates.length === 0) return;

  for (let i = 0; i < savedStates.length; i++) {
    const s = savedStates[i];
    if (!s || !s.player) continue;
    s.player.x = s.x;
    s.player.y = s.y;
    s.player.z = s.z;
    const crouch = Boolean(s.crouching ?? s.crouch);
    s.player.crouching = crouch;
    s.player.crouch = crouch;
    s.player.prone = Boolean(s.prone);
  }
}

/**
 * Raycasts `(origin, dir)` against a single player's posture-aware 3D AABB hitbox.
 * Returns `{ distance, hitPoint, isHeadshot, isLegshot }` or `null`.
 */
export function raycastPlayerHitbox(origin, dir, player, maxRange = 200, radiusPadding = 0.2) {
  if (!origin || !dir || !player || !player.alive) return null;

  const baseRadius = (MATCH_CONFIG.PLAYER_RADIUS || 0.45) + radiusPadding;
  const isProne = Boolean(player.prone);
  const isCrouching = Boolean(player.crouching ?? player.crouch);
  const height = isProne
    ? (MATCH_CONFIG.PLAYER_PRONE_HEIGHT || 0.58)
    : isCrouching
      ? (MATCH_CONFIG.PLAYER_CROUCH_HEIGHT || 1.1)
      : (MATCH_CONFIG.PLAYER_HEIGHT || 1.75);

  const footY = Number(player.y) || 0;
  const box = {
    minX: player.x - baseRadius,
    maxX: player.x + baseRadius,
    minY: footY - 0.08,
    maxY: footY + height + 0.08,
    minZ: player.z - baseRadius,
    maxZ: player.z + baseRadius
  };

  const len = Math.hypot(dir.x || 0, dir.y || 0, dir.z || 0);
  if (len < 1e-6) return null;
  const normDir = {
    x: dir.x / len,
    y: dir.y / len,
    z: dir.z / len
  };

  const t = rayIntersectsAABB(origin, normDir, maxRange, box);
  if (t === null || t < 0 || t > maxRange) return null;

  const hitPoint = {
    x: origin.x + normDir.x * t,
    y: origin.y + normDir.y * t,
    z: origin.z + normDir.z * t
  };
  const relY = hitPoint.y - footY;
  const isHeadshot = relY >= height * 0.72;
  const isLegshot = !isHeadshot && relY <= height * 0.35;

  return {
    distance: t,
    hitPoint,
    isHeadshot,
    isLegshot
  };
}
