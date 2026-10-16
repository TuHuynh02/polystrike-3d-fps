// Server-Side Lag Compensation (Hitbox Rewind & Interpolation) Helper Module
// Maintains a compact ~550ms ring buffer of player position/posture snapshots
// and provides up to 450ms hitbox rewind + restoration during server shot validation.

import { INTERP_DELAY_MS, INTERP_DELAY_MAX_MS, MAX_LAG_COMP_REWIND_MS, MATCH_CONFIG } from './config.js';
import { PART_PADDING, raycastPlayerParts } from './hitboxes.js';

// History must cover the largest possible rewind (450 ms, shared/config.js) plus the 40 ms tick period and 60 ms of scheduling slack
export const LAG_COMP_HISTORY_MS = 550;
export const LAG_COMP_MAX_REWIND_MS = MAX_LAG_COMP_REWIND_MS;
// Client entity interpolation delay (added on top of one-way latency = rttMs / 2). Alias of the shared
// INTERP_DELAY_MS (shared/config.js) so the client render delay and the server rewind can never drift apart.
export const LAG_COMP_INTERP_ALLOWANCE_MS = INTERP_DELAY_MS;
export const LAG_COMP_MAX_SNAPSHOTS = 32;
// A client reports the interpolation delay it currently renders with (public/js/snapshotBuffer.js). The server only
// accepts 0..INTERP_DELAY_MAX_MS and follows it at most this fast (ms of delay per second of server time).
export const INTERP_REPORT_SLEW_PER_S = 300;
export const KILL_ADRENALINE_HEAL = 25;

/**
 * Records a player's current position and posture `(timestamp, x, y, z, crouch, prone)`
 * into a compact ring buffer (`player.positionHistory`), pruning snapshots older than LAG_COMP_HISTORY_MS (550 ms).
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

  // Prune snapshots older than LAG_COMP_HISTORY_MS (LAG_COMP_HISTORY_MS), keeping at most one anchor snapshot just before cutoff if needed
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
 * clamped to at most `LAG_COMP_MAX_REWIND_MS` (LAG_COMP_MAX_REWIND_MS) prior to the reference current time.
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
 * Sanitises a client-reported interpolation delay: finite number, rounded, clamped to 0..INTERP_DELAY_MAX_MS; null otherwise.
 */
export function sanitizeInterpDelayMs(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return Math.max(0, Math.min(INTERP_DELAY_MAX_MS, Math.round(value)));
}

/**
 * Records the interpolation delay a client says it is rendering with (`d` of its inputBatch) in `player.interpDelayMs`.
 * Not trusted blindly: sanitised (0..INTERP_DELAY_MAX_MS) and the accepted value only moves towards the report by at
 * most INTERP_REPORT_SLEW_PER_S per second of server time. The rewind that results is still clamped by
 * LAG_COMP_MAX_REWIND_MS in resolveShotRewindMs, so a cheating client can never rewind further than any honest client with
 * a bad connection could. Returns the accepted delay.
 */
export function applyReportedInterpDelay(player, reported, now = Date.now()) {
  if (!player || typeof player !== 'object') return INTERP_DELAY_MS;
  const prev = typeof player.interpDelayMs === 'number' && Number.isFinite(player.interpDelayMs)
    ? player.interpDelayMs
    : INTERP_DELAY_MS;
  const target = sanitizeInterpDelayMs(reported);
  const last = typeof player.interpDelayAt === 'number' ? player.interpDelayAt : null;
  player.interpDelayAt = now;
  if (target === null) {
    player.interpDelayMs = prev;
    return prev;
  }
  const dtS = last === null ? 0 : Math.max(0, Math.min(0.5, (now - last) / 1000));
  const step = INTERP_REPORT_SLEW_PER_S * dtS;
  player.interpDelayMs = prev + Math.max(-step, Math.min(step, target - prev));
  return player.interpDelayMs;
}

/**
 * Resolves the effective rewind duration (0..LAG_COMP_MAX_REWIND_MS) for a shooter.
 * Only the SERVER-measured `shooter.rttMs` is trusted for the network part: every client-supplied latency/timestamp field
 * in `payload` (rewindMs, latencyMs, pingMs, rttMs, shotTimestamp, clientTimestamp) is ignored.
 * rewind = clamp(rttMs / 2 + delay, 0, LAG_COMP_MAX_REWIND_MS), where `delay` is the interpolation delay the shooter's
 * client renders with: `shooter.interpDelayMs` (sanitised + slew-limited by applyReportedInterpDelay, 0..250) and
 * INTERP_DELAY_MS until the client has reported one.
 * The client draws remote players at (estimated TRUE server time - delay) (public/js/snapshotBuffer.js adds the
 * one-way latency back into its clock estimate), so a shot fired at local time L arrives at L + rtt/2 and is rewound to
 * L + rtt/2 - (rtt/2 + delay) = L - delay: exactly the pose the shooter saw on screen.
 */
export function resolveShotRewindMs(shooter, _payload = {}, _now = Date.now()) {
  if (!shooter) return 0;
  const rtt = typeof shooter.rttMs === 'number' && Number.isFinite(shooter.rttMs)
    ? Math.max(0, shooter.rttMs)
    : 0;
  const delay = typeof shooter.interpDelayMs === 'number' && Number.isFinite(shooter.interpDelayMs)
    ? Math.max(0, Math.min(INTERP_DELAY_MAX_MS, shooter.interpDelayMs))
    : INTERP_DELAY_MS;
  const rawMs = rtt * 0.5 + delay;
  return Math.max(0, Math.min(LAG_COMP_MAX_REWIND_MS, rawMs));
}

/**
 * Temporarily rewinds all alive enemy players in `room` by `rewindMs` (clamped to LAG_COMP_MAX_REWIND_MS)
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
 * Raycasts `(origin, dir)` against a single player's per-part hitboxes (shared/hitboxes.js: head, torso, pelvis,
 * thighs, shins - the same boxes the client's invisible proxy meshes use), nearest part wins.
 * `radiusPadding` is extra inflation of every part box in metres (default PART_PADDING, the only tolerance;
 * lag is handled by rewinding the target, wide values are only for shotgun spread).
 * Returns `{ distance, hitPoint, isHeadshot, isLegshot, zone, partId }` or `null`.
 */
export function raycastPlayerHitbox(origin, dir, player, maxRange = 200, radiusPadding = PART_PADDING) {
  if (!origin || !dir || !player || !player.alive) return null;

  const hit = raycastPlayerParts(origin, dir, player, maxRange, {
    padding: Math.max(0, Number.isFinite(radiusPadding) ? radiusPadding : PART_PADDING)
  });
  if (!hit) return null;

  return {
    distance: hit.distance,
    hitPoint: hit.point,
    isHeadshot: hit.zone === 'head',
    isLegshot: hit.zone === 'leg',
    zone: hit.zone,
    partId: hit.partId
  };
}
