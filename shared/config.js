// Shared match & movement configuration between Server (Node.js) and Client (Browser Three.js)

export const MATCH_CONFIG = {
  MAX_PLAYERS: 12,
  KILL_LIMIT: 20,
  TDM_KILL_LIMIT: 30,
  MATCH_DURATION_SEC: 300, // 5 minutes
  RESPAWN_DELAY_MS: 3000,  // 3 seconds
  SPAWN_PROTECTION_MS: 1500, // 1.5 seconds of invincibility after spawn/respawn (ends early when the player fires/throws)
  LATENCY_PROBE_INTERVAL_MS: 2000, // Server -> client RTT probe period (server-measured latency for lag compensation)
  LATENCY_EMA_ALPHA: 0.3, // Weight of the newest RTT sample in the exponential moving average
  MAX_RTT_MS: 1000, // RTT samples are clamped to 0..MAX_RTT_MS
  SPAWN_MIN_CLEARANCE: 6.0,  // Minimum distance from other players to avoid overlapping spawns
  SPAWN_DENSITY_RADIUS: 36.0, // Radius used to evaluate low-player-density zones
  SPAWN_RECENT_COOLDOWN_MS: 4500, // Cooldown before reusing a recently used spawn point
  INTERMISSION_SEC: 10,    // 10 seconds between rounds
  HEALTH_PACK_HEAL: 50,
  HEALTH_PACK_RESPAWN_MS: 15000,
  DROPPED_WEAPON_DESPAWN_MS: 5000, // 5 seconds before dropped primary weapon disappears
  DROPPED_WEAPON_PICKUP_RADIUS: 2.8, // Distance (meters) to press [F] to swap primary weapon
  MAX_HP: 100,
  PLAYER_HEIGHT: 1.75,
  PLAYER_CROUCH_HEIGHT: 1.1,
  PLAYER_SLIDE_HEIGHT: 0.9,
  PLAYER_PRONE_HEIGHT: 0.58,
  PLAYER_RADIUS: 0.45,
  ARENA_HALF_SIZE: 60, // Default 120x120m arena (expanded from 80x80m)
  // Tuned tactical movement speeds (Walk, Sprint, Crouch, Prone, Slide & Q/E Lean)
  WALK_SPEED: 5.0,
  SPRINT_SPEED: 6.8,
  CROUCH_SPEED: 2.75,
  PRONE_SPEED: 1.6,
  ADS_SPEED: 3.2,
  SLIDE_INITIAL_SPEED: 9.0,
  SLIDE_MIN_SPEED: 3.6,
  SLIDE_DURATION_MS: 660,
  SLIDE_COOLDOWN_MS: 820,
  LEAN_OFFSET: 0.42,       // Lateral camera peek offset (meters) when pressing Q / E
  LEAN_ROLL_ANGLE: 0.145,  // Camera & weapon roll angle (radians) when leaning Q / E
  GROUND_ACCEL: 52.0,
  AIR_ACCEL: 16.0,
  GROUND_FRICTION: 11.0,
  SLIDE_FRICTION: 2.4,
  GRAVITY: 22.0,
  JUMP_FORCE: 8.0,
  COYOTE_TIME_MS: 120,
  JUMP_BUFFER_MS: 120,
  GRENADE_FUSE_MS: 3000,               // Total cooking fuse duration (3.0s) when holding [G]
  GRENADE_DEFAULT_THROW_FUSE_MS: 2200, // Default fuse duration (2.2s) for un-cooked throws
  GRENADE_THROW_SPEED: 19.5,
  GRENADE_UPWARD_ARC: 4.2
};

// Snapshot-interpolation render delay (ms). SINGLE source of truth shared by the client (remote players are drawn at
// "estimated server time - INTERP_DELAY_MS", public/js/snapshotBuffer.js) and the server (lag-compensation rewind
// = shooter one-way latency + INTERP_DELAY_MS, shared/lagCompensation.js). Must stay >= 2 stateUpdate periods (80 ms
// at 25 Hz) so a lost/late snapshot still leaves two to interpolate between.
export const INTERP_DELAY_MS = 100;

// Adaptive render delay (public/js/snapshotBuffer.js JitterBuffer). INTERP_DELAY_MS above is the START value (and the
// server's assumption until a client reports its own); the live value is clamped to [MIN, MAX] and never exceeds
// MAX_LAG_COMP_REWIND_MS - oneWayLatency, so the server can always rewind exactly what the shooter sees.
export const INTERP_DELAY_MIN_MS = 70;
export const INTERP_DELAY_MAX_MS = 250; // also the largest delay the server accepts from a client report
// Largest server-side lag-compensation rewind (ms) = rttMs / 2 + reported delay, clamped here. A client can only add
// INTERP_DELAY_MAX_MS (250) to its measured half-RTT, so raising this cap only matters for genuinely high-latency players:
// an RTT-200 office link needs 100 + ~190 ms, an RTT-360 link 180 + 250 ms (tests/network-impairment.test.mjs: with 350 the
// 360 ms-RTT profile still starves, with 450 it is smooth and its shots match what the shooter saw).
export const MAX_LAG_COMP_REWIND_MS = 450;

export const PLAYER_COLORS = [
  0x38bdf8, // Cyan
  0xf43f5e, // Rose
  0x22c55e, // Emerald
  0xf59e0b, // Amber
  0xa855f7, // Purple
  0xec4899, // Pink
  0x14b8a6, // Teal
  0xeab308, // Yellow
  0x6366f1, // Indigo
  0xf97316, // Orange
  0x06b6d4, // Sky
  0x84cc16  // Lime
];

export const GAME_MODES = {
  ffa: { id: 'ffa', name: 'ĐẤU ĐƠN (FFA)', shortName: 'FFA' },
  tdm: { id: 'tdm', name: 'ĐẤU ĐỘI 2 PHE (TDM)', shortName: '2 ĐỘI' }
};

export const TEAMS = {
  alpha: {
    id: 'alpha',
    name: 'PHE XANH (ALPHA)',
    shortName: 'ALPHA',
    color: 0x38bdf8,
    hex: '#38bdf8'
  },
  bravo: {
    id: 'bravo',
    name: 'PHE ĐỎ (BRAVO)',
    shortName: 'BRAVO',
    color: 0xef4444,
    hex: '#ef4444'
  }
};

