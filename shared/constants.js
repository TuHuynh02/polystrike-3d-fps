// Shared configuration between Server (Node.js) and Client (Browser Three.js)

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
  MAX_HP: 100,
  PLAYER_HEIGHT: 1.75,
  PLAYER_CROUCH_HEIGHT: 1.1,
  PLAYER_SLIDE_HEIGHT: 0.9,
  PLAYER_RADIUS: 0.45,
  ARENA_HALF_SIZE: 60, // Default 120x120m arena (expanded from 80x80m)
  // Tuned tactical movement speeds (reduced from overly fast 9.4 / 12.5)
  WALK_SPEED: 6.2,
  SPRINT_SPEED: 8.5,
  CROUCH_SPEED: 3.4,
  ADS_SPEED: 4.0,
  SLIDE_INITIAL_SPEED: 10.4,
  SLIDE_MIN_SPEED: 7.0,
  SLIDE_DURATION_MS: 620,
  SLIDE_COOLDOWN_MS: 900,
  GROUND_ACCEL: 52.0,
  AIR_ACCEL: 16.0,
  GROUND_FRICTION: 11.0,
  SLIDE_FRICTION: 2.6,
  GRAVITY: 22.0,
  JUMP_FORCE: 8.0,
  COYOTE_TIME_MS: 120,
  JUMP_BUFFER_MS: 120,
  BOT_MOVE_SPEED: 4.8
};

export const WEAPONS = {
  // ==================== SLOT 1: PRIMARY WEAPONS ====================
  rifle: {
    id: 'rifle',
    slot: 1,
    category: 'AR',
    categoryLabel: 'ASSAULT RIFLE',
    name: 'VANDAL-AK',
    role: 'AR Hạng Nặng • Sát thương cao, giật dọc mạnh',
    damage: 27,
    headshotMult: 1.65, // 45 headshot
    magSize: 30,
    fireRateMs: 115,
    reloadMs: 1850,         // Empty / dry reload (with bolt rack)
    tacticalReloadMs: 1420, // Tactical reload (rounds left in chamber)
    equipMs: 240,
    pellets: 1,
    spread: 0.0085,
    adsSpread: 0.0018,
    firstShotSpreadMult: 0.22,
    bloomPerShot: 0.0046,
    bloomMax: 0.04,
    bloomDecay: 0.11,
    moveSpread: 0.022,
    airSpread: 0.045,
    crouchSpreadMult: 0.62,
    moveSpeedMult: 0.96,
    automatic: true,
    range: 170,
    zoomFov: 55,
    recoilPitch: 0.021,
    recoilYaw: 0.0072,
    recoilClimbMult: 0.15,
    recoilMaxPitch: 0.17,
    recoilRecovery: 8.2,
    recoilRecoveryDelayMs: 155,
    // Deterministic horizontal spray curve (pulls up, then sways right -> left -> right)
    recoilPattern: [
      0.0, 0.08, 0.18, 0.32, 0.48, 0.65, 0.75, 0.62, 0.35, 0.0,
      -0.38, -0.68, -0.85, -0.92, -0.78, -0.52, -0.18, 0.22, 0.58, 0.82,
      0.9, 0.72, 0.38, -0.1, -0.48, -0.75, -0.65, -0.35, 0.0, 0.25
    ],
    visualKick: 0.085,
    color: 0xf59e0b,
    stats: { damage: 78, fireRate: 68, recoilControl: 54, mobility: 76, range: 80 }
  },
  m4a1: {
    id: 'm4a1',
    slot: 1,
    category: 'AR',
    categoryLabel: 'ASSAULT RIFLE',
    name: 'PHANTOM-M4',
    role: 'AR Giảm Thanh • Tốc bắn nhanh, độ giật cực êm',
    damage: 22,
    headshotMult: 1.6, // 35 headshot
    magSize: 30,
    fireRateMs: 90,
    reloadMs: 1680,
    tacticalReloadMs: 1260,
    equipMs: 220,
    pellets: 1,
    spread: 0.0062,
    adsSpread: 0.0011,
    firstShotSpreadMult: 0.18,
    bloomPerShot: 0.0032,
    bloomMax: 0.028,
    bloomDecay: 0.13,
    moveSpread: 0.017,
    airSpread: 0.038,
    crouchSpreadMult: 0.58,
    moveSpeedMult: 0.99,
    automatic: true,
    range: 165,
    zoomFov: 56,
    recoilPitch: 0.013,
    recoilYaw: 0.0042,
    recoilClimbMult: 0.1,
    recoilMaxPitch: 0.11,
    recoilRecovery: 9.8,
    recoilRecoveryDelayMs: 135,
    recoilPattern: [
      0.0, 0.04, 0.1, 0.18, 0.26, 0.34, 0.38, 0.3, 0.15, 0.0,
      -0.18, -0.32, -0.42, -0.46, -0.38, -0.24, -0.08, 0.12, 0.28, 0.4,
      0.44, 0.35, 0.18, -0.05, -0.22, -0.36, -0.3, -0.15, 0.0, 0.1
    ],
    visualKick: 0.064,
    color: 0x06b6d4,
    stats: { damage: 64, fireRate: 84, recoilControl: 88, mobility: 82, range: 76 }
  },
  scar: {
    id: 'scar',
    slot: 1,
    category: 'AR',
    categoryLabel: 'ASSAULT RIFLE',
    name: 'SCAR-H 7.62',
    role: 'Battle Rifle • Đạn 7.62mm cực mạnh, ngắm ACOG tầm xa',
    damage: 34,
    headshotMult: 1.65, // 56 headshot (2-tap)
    magSize: 20,
    fireRateMs: 148,
    reloadMs: 1950,
    tacticalReloadMs: 1500,
    equipMs: 265,
    pellets: 1,
    spread: 0.0072,
    adsSpread: 0.001,
    firstShotSpreadMult: 0.15,
    bloomPerShot: 0.0055,
    bloomMax: 0.044,
    bloomDecay: 0.105,
    moveSpread: 0.025,
    airSpread: 0.05,
    crouchSpreadMult: 0.56,
    moveSpeedMult: 0.93,
    automatic: true,
    range: 195,
    zoomFov: 48,
    recoilPitch: 0.028,
    recoilYaw: 0.0055,
    recoilClimbMult: 0.17,
    recoilMaxPitch: 0.2,
    recoilRecovery: 7.5,
    recoilRecoveryDelayMs: 185,
    recoilPattern: [
      0.0, 0.12, 0.25, 0.42, 0.58, 0.45, 0.18, -0.15, -0.45, -0.68,
      -0.75, -0.55, -0.25, 0.15, 0.48, 0.65, 0.5, 0.2, -0.15, 0.0
    ],
    visualKick: 0.105,
    color: 0xeab308,
    stats: { damage: 88, fireRate: 54, recoilControl: 46, mobility: 70, range: 88 }
  },
  smg: {
    id: 'smg',
    slot: 1,
    category: 'SMG',
    categoryLabel: 'SMG',
    name: 'VECTOR-KRISS',
    role: 'Tiểu Liên CQB • Xả đạn siêu tốc 880 RPM, cơ động cao',
    damage: 16,
    headshotMult: 1.55, // 25 headshot
    magSize: 32,
    fireRateMs: 68,
    reloadMs: 1480,
    tacticalReloadMs: 1120,
    equipMs: 180,
    pellets: 1,
    spread: 0.011,
    adsSpread: 0.0032,
    firstShotSpreadMult: 0.35,
    bloomPerShot: 0.003,
    bloomMax: 0.032,
    bloomDecay: 0.14,
    moveSpread: 0.01,
    airSpread: 0.028,
    crouchSpreadMult: 0.68,
    moveSpeedMult: 1.05,
    automatic: true,
    range: 110,
    zoomFov: 62,
    recoilPitch: 0.011,
    recoilYaw: 0.0062,
    recoilClimbMult: 0.09,
    recoilMaxPitch: 0.115,
    recoilRecovery: 10.5,
    recoilRecoveryDelayMs: 110,
    recoilPattern: [
      0.0, 0.06, 0.15, 0.28, 0.42, 0.52, 0.45, 0.25, 0.0, -0.28,
      -0.5, -0.62, -0.52, -0.3, 0.0, 0.32, 0.55, 0.65, 0.48, 0.2,
      -0.12, -0.4, -0.58, -0.45, -0.2, 0.1, 0.35, 0.45, 0.25, 0.0, -0.15, 0.0
    ],
    visualKick: 0.055,
    color: 0x10b981,
    stats: { damage: 48, fireRate: 96, recoilControl: 80, mobility: 94, range: 52 }
  },
  shotgun: {
    id: 'shotgun',
    slot: 1,
    category: 'SHOTGUN',
    categoryLabel: 'SHOTGUN',
    name: 'BUCKSHOT-8',
    role: 'Pump Shotgun • 8 viên đạn chùm, nạp từng viên',
    damage: 14,
    headshotMult: 1.5, // 21 per pellet headshot
    magSize: 6,
    fireRateMs: 760,
    reloadMs: 2400,
    tacticalReloadMs: 2000,
    shellByShell: true,
    shellReloadStartMs: 240,
    shellReloadMs: 380,
    pumpActionMs: 450,
    equipMs: 260,
    pellets: 8,
    spread: 0.066,
    adsSpread: 0.042,
    firstShotSpreadMult: 0.85,
    bloomPerShot: 0.016,
    bloomMax: 0.038,
    bloomDecay: 0.09,
    moveSpread: 0.012,
    airSpread: 0.025,
    crouchSpreadMult: 0.78,
    moveSpeedMult: 0.96,
    automatic: false,
    range: 65,
    zoomFov: 63,
    recoilPitch: 0.064,
    recoilYaw: 0.014,
    recoilClimbMult: 0.08,
    recoilMaxPitch: 0.18,
    recoilRecovery: 6.8,
    recoilRecoveryDelayMs: 280,
    recoilPattern: [0.0, 0.35, -0.35, 0.5, -0.45, 0.25],
    visualKick: 0.145,
    color: 0xef4444,
    stats: { damage: 95, fireRate: 28, recoilControl: 42, mobility: 78, range: 30 }
  },
  sniper: {
    id: 'sniper',
    slot: 1,
    category: 'SNIPER',
    categoryLabel: 'SNIPER',
    name: 'AWP-PHANTOM',
    role: 'Bolt Sniper • Ngắm Scope 3.5x, 1-Shot Headshot',
    damage: 90,
    headshotMult: 1.65, // 149 headshot (instant kill)
    magSize: 5,
    fireRateMs: 1150,
    reloadMs: 2450,
    tacticalReloadMs: 1900,
    boltActionMs: 650,
    equipMs: 320,
    pellets: 1,
    spread: 0.034,
    adsSpread: 0.0002,
    firstShotSpreadMult: 0.1,
    bloomPerShot: 0.036,
    bloomMax: 0.05,
    bloomDecay: 0.08,
    moveSpread: 0.042,
    airSpread: 0.072,
    crouchSpreadMult: 0.58,
    moveSpeedMult: 0.88,
    automatic: false,
    range: 260,
    zoomFov: 22,
    recoilPitch: 0.085,
    recoilYaw: 0.012,
    recoilClimbMult: 0.05,
    recoilMaxPitch: 0.2,
    recoilRecovery: 5.8,
    recoilRecoveryDelayMs: 360,
    recoilPattern: [0.0, 0.25, -0.25, 0.35, -0.3],
    visualKick: 0.168,
    color: 0x38bdf8,
    stats: { damage: 100, fireRate: 18, recoilControl: 36, mobility: 62, range: 100 }
  },
  lmg: {
    id: 'lmg',
    slot: 1,
    category: 'LMG',
    categoryLabel: 'MACHINEGUN',
    name: 'ODIN-M249',
    role: 'Machinegun Hạng Nặng • Băng đạn 80 viên áp chế liên tục',
    damage: 23,
    headshotMult: 1.55, // 36 headshot
    magSize: 80,
    fireRateMs: 95,
    reloadMs: 2950,
    tacticalReloadMs: 2400,
    equipMs: 350,
    pellets: 1,
    spread: 0.0125,
    adsSpread: 0.0026,
    firstShotSpreadMult: 0.42,
    bloomPerShot: 0.003,
    bloomMax: 0.035,
    bloomDecay: 0.095,
    moveSpread: 0.028,
    airSpread: 0.055,
    crouchSpreadMult: 0.5, // Very stable when crouched!
    moveSpeedMult: 0.85,
    automatic: true,
    range: 185,
    zoomFov: 56,
    recoilPitch: 0.016,
    recoilYaw: 0.0078,
    recoilClimbMult: 0.11,
    recoilMaxPitch: 0.155,
    recoilRecovery: 7.4,
    recoilRecoveryDelayMs: 175,
    recoilPattern: [
      0.0, 0.1, 0.22, 0.38, 0.55, 0.7, 0.6, 0.35, 0.0, -0.35,
      -0.65, -0.8, -0.65, -0.35, 0.0, 0.38, 0.68, 0.82, 0.62, 0.28,
      -0.15, -0.52, -0.75, -0.58, -0.22, 0.18, 0.5, 0.65, 0.4, 0.0
    ],
    visualKick: 0.082,
    color: 0xf97316,
    stats: { damage: 72, fireRate: 78, recoilControl: 58, mobility: 54, range: 82 }
  },

  // ==================== SLOT 2: SECONDARY WEAPONS (PISTOLS) ====================
  pistol: {
    id: 'pistol',
    slot: 2,
    category: 'PISTOL',
    categoryLabel: 'SECONDARY',
    name: 'PULSE-P9',
    role: 'Súng Lục Chiến Thuật • Cân bằng, thay đạn cực nhanh',
    damage: 26,
    headshotMult: 1.65, // 43 headshot
    magSize: 12,
    fireRateMs: 185,
    reloadMs: 1200,
    tacticalReloadMs: 920,
    equipMs: 150,
    pellets: 1,
    spread: 0.0068,
    adsSpread: 0.0018,
    firstShotSpreadMult: 0.28,
    bloomPerShot: 0.0036,
    bloomMax: 0.024,
    bloomDecay: 0.14,
    moveSpread: 0.009,
    airSpread: 0.022,
    crouchSpreadMult: 0.65,
    moveSpeedMult: 1.05,
    automatic: false,
    range: 120,
    zoomFov: 64,
    recoilPitch: 0.021,
    recoilYaw: 0.0046,
    recoilClimbMult: 0.1,
    recoilMaxPitch: 0.11,
    recoilRecovery: 10.8,
    recoilRecoveryDelayMs: 125,
    recoilPattern: [0.0, 0.15, -0.15, 0.28, -0.22, 0.35, -0.3, 0.2, -0.18, 0.12, -0.1, 0.0],
    visualKick: 0.065,
    color: 0xa855f7,
    stats: { damage: 56, fireRate: 64, recoilControl: 84, mobility: 95, range: 60 }
  },
  deagle: {
    id: 'deagle',
    slot: 2,
    category: 'PISTOL',
    categoryLabel: 'SECONDARY',
    name: 'SHERIFF .50',
    role: 'Desert Eagle .50 • Đại bác cầm tay, 1-2 viên hạ gục',
    damage: 48,
    headshotMult: 1.9, // 91 headshot
    magSize: 7,
    fireRateMs: 310,
    reloadMs: 1520,
    tacticalReloadMs: 1200,
    equipMs: 185,
    pellets: 1,
    spread: 0.0085,
    adsSpread: 0.0012,
    firstShotSpreadMult: 0.15,
    bloomPerShot: 0.012,
    bloomMax: 0.038,
    bloomDecay: 0.11,
    moveSpread: 0.018,
    airSpread: 0.038,
    crouchSpreadMult: 0.6,
    moveSpeedMult: 1.01,
    automatic: false,
    range: 145,
    zoomFov: 60,
    recoilPitch: 0.052,
    recoilYaw: 0.0085,
    recoilClimbMult: 0.12,
    recoilMaxPitch: 0.16,
    recoilRecovery: 7.8,
    recoilRecoveryDelayMs: 210,
    recoilPattern: [0.0, 0.28, -0.28, 0.42, -0.38, 0.25, -0.2],
    visualKick: 0.125,
    color: 0xf43f5e,
    stats: { damage: 86, fireRate: 38, recoilControl: 48, mobility: 88, range: 75 }
  },
  glock: {
    id: 'glock',
    slot: 2,
    category: 'PISTOL',
    categoryLabel: 'SECONDARY',
    name: 'FRENZY-G18',
    role: 'Súng Lục Liên Thanh • Bắn tự động tốc độ cao tầm gần',
    damage: 16,
    headshotMult: 1.55, // 25 headshot
    magSize: 18,
    fireRateMs: 82,
    reloadMs: 1350,
    tacticalReloadMs: 1020,
    equipMs: 145,
    pellets: 1,
    spread: 0.012,
    adsSpread: 0.0038,
    firstShotSpreadMult: 0.35,
    bloomPerShot: 0.0035,
    bloomMax: 0.032,
    bloomDecay: 0.135,
    moveSpread: 0.009,
    airSpread: 0.024,
    crouchSpreadMult: 0.68,
    moveSpeedMult: 1.06,
    automatic: true,
    range: 95,
    zoomFov: 65,
    recoilPitch: 0.014,
    recoilYaw: 0.0072,
    recoilClimbMult: 0.1,
    recoilMaxPitch: 0.12,
    recoilRecovery: 10.2,
    recoilRecoveryDelayMs: 115,
    recoilPattern: [
      0.0, 0.1, 0.22, 0.36, 0.25, 0.0, -0.25, -0.42, -0.3, -0.1,
      0.18, 0.38, 0.3, 0.1, -0.18, -0.32, -0.15, 0.0
    ],
    visualKick: 0.058,
    color: 0x84cc16,
    stats: { damage: 42, fireRate: 90, recoilControl: 68, mobility: 96, range: 45 }
  },

  // ==================== SLOT 3: MELEE WEAPON (KNIFE) ====================
  knife: {
    id: 'knife',
    slot: 3,
    category: 'MELEE',
    categoryLabel: 'MELEE',
    isMelee: true,
    infiniteAmmo: true,
    name: 'KARAMBIT-X',
    role: 'Dao Cận Chiến • Chém nhanh, chạy cực lẹ (+12% Tốc chạy)',
    damage: 55,
    headshotMult: 1.65, // 91 upper-strike / backstab
    magSize: 1,
    fireRateMs: 420,
    reloadMs: 0,
    tacticalReloadMs: 0,
    equipMs: 140,
    pellets: 1,
    spread: 0.0,
    adsSpread: 0.0,
    firstShotSpreadMult: 0.0,
    bloomPerShot: 0.0,
    bloomMax: 0.0,
    bloomDecay: 1.0,
    moveSpread: 0.0,
    airSpread: 0.0,
    crouchSpreadMult: 1.0,
    moveSpeedMult: 1.12,
    automatic: true,
    range: 3.3,
    zoomFov: 72,
    recoilPitch: 0.0,
    recoilYaw: 0.0,
    recoilClimbMult: 0.0,
    recoilMaxPitch: 0.0,
    recoilRecovery: 16.0,
    recoilRecoveryDelayMs: 50,
    recoilPattern: [0.0],
    visualKick: 0.0,
    color: 0xec4899,
    stats: { damage: 85, fireRate: 70, recoilControl: 100, mobility: 100, range: 12 }
  }
};

export const PRIMARY_WEAPONS = ['rifle', 'm4a1', 'scar', 'smg', 'shotgun', 'sniper', 'lmg'];
export const SECONDARY_WEAPONS = ['pistol', 'deagle', 'glock'];
export const MELEE_WEAPONS = ['knife'];
export const DEFAULT_LOADOUT = {
  primary: 'rifle',
  secondary: 'pistol',
  melee: 'knife'
};
export const BOT_WEAPON_POOL = ['rifle', 'm4a1', 'scar', 'smg', 'shotgun', 'sniper', 'lmg'];
export const WEAPON_ORDER = [
  'rifle',
  'm4a1',
  'scar',
  'smg',
  'shotgun',
  'sniper',
  'lmg',
  'pistol',
  'deagle',
  'glock',
  'knife'
];

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

/**
 * Helper to create staircase steps (walkable without jumping because each step is 0.4m high)
 */
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

/**
 * Helper to create outer perimeter walls for a square arena of given halfSize
 */
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
    botWaypoints: [
      { x: 0, y: 2.4, z: 4 },
      { x: 0, y: 0, z: -29 },
      { x: 0, y: 0, z: 29 },
      { x: -29, y: 0, z: 0 },
      { x: 29, y: 0, z: 0 },
      { x: -18, y: 0, z: -20 },
      { x: 18, y: 0, z: -20 },
      { x: -18, y: 0, z: 20 },
      { x: 18, y: 0, z: 20 },
      { x: -32, y: 0, z: -15 },
      { x: 32, y: 0, z: 15 },
      { x: -42, y: 2.0, z: -40 },
      { x: 42, y: 2.0, z: 40 },
      { x: -26, y: 0, z: 34 },
      { x: 26, y: 0, z: -34 }
    ]
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
    botWaypoints: [
      { x: 0, y: 2.4, z: 0 },
      { x: 0, y: 0, z: -28 },
      { x: 0, y: 0, z: 28 },
      { x: -28, y: 0, z: 0 },
      { x: 28, y: 0, z: 0 },
      { x: -10, y: 0, z: -24 },
      { x: 10, y: 0, z: -24 },
      { x: -10, y: 0, z: 24 },
      { x: 10, y: 0, z: 24 },
      { x: -36, y: 0, z: -22 },
      { x: 36, y: 0, z: 22 },
      { x: -38, y: 2.0, z: 4 },
      { x: 38, y: 2.0, z: -4 }
    ]
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
    botWaypoints: [
      { x: 0, y: 2.4, z: 4 },
      { x: 0, y: 0, z: -20 },
      { x: 0, y: 0, z: 20 },
      { x: -24, y: 0, z: 0 },
      { x: 24, y: 0, z: 0 },
      { x: -16, y: 0, z: -28 },
      { x: 16, y: 0, z: -28 },
      { x: -16, y: 0, z: 28 },
      { x: 16, y: 0, z: 28 },
      { x: -36, y: 2.4, z: -34 },
      { x: 36, y: 2.4, z: 34 },
      { x: -38, y: 0, z: 0 },
      { x: 38, y: 0, z: 0 }
    ]
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
    botWaypoints: [
      { x: 0, y: 2.4, z: 3 },
      { x: 0, y: 0, z: -22 },
      { x: 0, y: 0, z: 22 },
      { x: -22, y: 0, z: 0 },
      { x: 22, y: 0, z: 0 },
      { x: -12, y: 0, z: -32 },
      { x: 12, y: 0, z: -32 },
      { x: -12, y: 0, z: 32 },
      { x: 12, y: 0, z: 32 },
      { x: 0, y: 2.0, z: -40 },
      { x: 0, y: 2.0, z: 40 },
      { x: -32, y: 0, z: -20 },
      { x: 32, y: 0, z: 20 }
    ]
  }
};

export const MAP_ORDER = ['cyber_citadel', 'cargo_dock', 'desert_outpost', 'neon_lab'];
export const DEFAULT_MAP_ID = 'cyber_citadel';

export function getMapConfig(mapId) {
  return MAPS[mapId] || MAPS[DEFAULT_MAP_ID];
}

// Default exports for backward compatibility
export const HEALTH_PACK_SPAWNS = MAPS[DEFAULT_MAP_ID].healthPacks;
export const SPAWN_POINTS = MAPS[DEFAULT_MAP_ID].spawnPoints;
export const BOT_WAYPOINTS = MAPS[DEFAULT_MAP_ID].botWaypoints;
export const MAP_OBSTACLES = MAPS[DEFAULT_MAP_ID].obstacles;

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
