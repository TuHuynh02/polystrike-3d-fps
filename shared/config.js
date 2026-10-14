// Shared match & movement configuration between Server (Node.js) and Client (Browser Three.js)

export const MATCH_CONFIG = {
  MAX_PLAYERS: 12,
  MAX_BOTS: 8,
  DEFAULT_BOTS: 4,
  KILL_LIMIT: 20,
  MATCH_DURATION_SEC: 300, // 5 minutes
  RESPAWN_DELAY_MS: 3000,  // 3 seconds
  SPAWN_PROTECTION_MS: 1500, // 1.5 seconds of invincibility after spawn/respawn
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
  WALK_SPEED: 6.2,
  SPRINT_SPEED: 8.6,
  CROUCH_SPEED: 3.4,
  PRONE_SPEED: 2.0,
  ADS_SPEED: 4.0,
  SLIDE_INITIAL_SPEED: 11.2,
  SLIDE_MIN_SPEED: 4.5,
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
  BOT_MOVE_SPEED: 4.8
};

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
