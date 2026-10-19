// Shared weapon definitions & 3-slot loadout constants
// Tuned for:
// 1) Distinct tactical roles & balanced Time-To-Kill (TTK) by engagement distance
// 2) Distance Damage Falloff (SMGs & Shotguns drop damage sharply beyond CQB so ARs dominate mid/long range)
// 3) Crosshair-only recoil & easy stationary/crouch/prone accuracy (no camera shake)
// 4) Strong run-and-gun penalty (high moveSpread & airSpread)

export const BASE_HIPFIRE_FOV = 68;
export const ADS_OPTIC_ZOOM_MULT = 1.25; // +0.25x zoom (1.25x magnification -> 54.4 FOV)
export const ADS_OPTIC_ZOOM_FOV = 54.4;

export const WEAPONS = {
  // ==================== SLOT 1: PRIMARY WEAPONS ====================
  rifle: {
    id: 'rifle',
    slot: 1,
    category: 'AR',
    categoryLabel: 'ASSAULT RIFLE',
    name: 'VANDAL-AK',
    role: 'AK-47 Chuẩn Tầm Trung/Xa • 1-Tap Headshot (102 DMG), 3 Viên Ngực (TTK 180ms)',
    opticType: 'reddot',
    opticLabel: 'KOBRA RDS // 1.25X RED-DOT',
    zoomMult: 1.25,
    damage: 34,
    headshotMult: 3.0, // 102 headshot (1-Tap Headshot up to mid-long range!)
    magSize: 30,
    reserveAmmo: 90,
    fireRateMs: 90,         // ~667 RPM hipfire (3 body shots = 180ms TTK)
    adsFireRateMs: 106,     // ~566 RPM when ADS (+0.25x zoom, shoots ~15% slower for pinpoint control)
    adsFireRateMult: 1.18,
    reloadMs: 1750,
    tacticalReloadMs: 1350,
    equipMs: 220,
    pellets: 1,
    spread: 0.0026,         // Pinpoint stationary accuracy at range
    adsSpread: 0.0004,
    firstShotSpreadMult: 0.04,
    bloomPerShot: 0.0020,
    bloomMax: 0.015,
    bloomDecay: 0.22,
    moveSpread: 0.095,      // Heavy run-and-gun spread penalty!
    airSpread: 0.135,
    crouchSpreadMult: 0.52,
    proneSpreadMult: 0.32,
    moveSpeedMult: 0.96,
    automatic: true,
    range: 185,
    falloffStart: 35,       // Full 34 DMG up to 35m
    falloffEnd: 85,         // Holds 85% DMG (29 DMG) even at 85m+ (4-shot kill at extreme range)
    minFalloffMult: 0.85,
    zoomFov: 54.4,          // 1.25x (+0.25x) Red-Dot ADS zoom from base 68 FOV
    recoilPitch: 0.0115,    // Moderate CS2/Valorant vertical kick + smooth auto-recovery
    recoilYaw: 0.0038,
    recoilClimbMult: 0.14,
    recoilMaxPitch: 0.135,
    recoilRecovery: 14.0,
    recoilRecoveryDelayMs: 95,
    recoilPattern: [-0.25, 0.22, -0.35, 0.38, -0.48, 0.42, -0.55, 0.52],
    crosshairKick: 0.018,
    visualKick: 0.052,
    color: 0xf59e0b,
    stats: { damage: 86, fireRate: 78, recoilControl: 88, mobility: 76, range: 88 }
  },
  m4a1: {
    id: 'm4a1',
    slot: 1,
    category: 'AR',
    categoryLabel: 'ASSAULT RIFLE',
    name: 'PHANTOM-M4',
    role: 'M4A1-S Giảm Thanh • Tốc bắn 800 RPM, 4 Viên Ngực tầm trung (TTK 225ms)',
    opticType: 'holo',
    opticLabel: 'EOTECH EXPS3 // 1.25X HOLO',
    zoomMult: 1.25,
    damage: 29,
    headshotMult: 2.7,  // 78 headshot (1 HS + 1 Body Kill!)
    magSize: 30,
    reserveAmmo: 90,
    fireRateMs: 75,     // 800 RPM hipfire (4 body shots = 225ms TTK)
    adsFireRateMs: 89,  // ~674 RPM when ADS (+0.25x Holo zoom, shoots ~15% slower)
    adsFireRateMult: 1.18,
    reloadMs: 1580,
    tacticalReloadMs: 1180,
    equipMs: 200,
    pellets: 1,
    spread: 0.0022,
    adsSpread: 0.00035,
    firstShotSpreadMult: 0.04,
    bloomPerShot: 0.0015,
    bloomMax: 0.012,
    bloomDecay: 0.25,
    moveSpread: 0.082,
    airSpread: 0.120,
    crouchSpreadMult: 0.50,
    proneSpreadMult: 0.30,
    moveSpeedMult: 0.99,
    automatic: true,
    range: 175,
    falloffStart: 28,   // Full 29 DMG up to 28m
    falloffEnd: 75,     // Smoothly drops to 78% (23 DMG = 5-shot kill at 75m+)
    minFalloffMult: 0.78,
    zoomFov: 54.4,      // 1.25x (+0.25x) Holo ADS zoom from base 68 FOV
    recoilPitch: 0.0085,
    recoilYaw: 0.0028,
    recoilClimbMult: 0.11,
    recoilMaxPitch: 0.105,
    recoilRecovery: 15.0,
    recoilRecoveryDelayMs: 80,
    recoilPattern: [0.18, -0.20, 0.28, -0.32, 0.35, -0.38, 0.42, -0.40],
    crosshairKick: 0.014,
    visualKick: 0.042,
    color: 0x06b6d4,
    stats: { damage: 74, fireRate: 88, recoilControl: 95, mobility: 82, range: 82 }
  },
  scar: {
    id: 'scar',
    slot: 1,
    category: 'AR',
    categoryLabel: 'ASSAULT RIFLE',
    name: 'SCAR-H 7.62',
    role: 'Battle Rifle 7.62mm • Không sợ bắn xa, 1-Tap HS & 3 Viên Ngực mọi cự ly',
    opticType: 'holo',
    opticLabel: 'EOTECH HWS // 1.25X HOLO',
    zoomMult: 1.25,
    damage: 39,
    headshotMult: 2.65, // 103 headshot (1-Tap Headshot even at long range!)
    magSize: 20,
    reserveAmmo: 60,
    fireRateMs: 118,    // ~508 RPM hipfire
    adsFireRateMs: 138, // ~435 RPM when ADS (+0.25x Holo zoom)
    adsFireRateMult: 1.17,
    reloadMs: 1820,
    tacticalReloadMs: 1400,
    equipMs: 240,
    pellets: 1,
    spread: 0.0024,
    adsSpread: 0.0003,
    firstShotSpreadMult: 0.04,
    bloomPerShot: 0.0024,
    bloomMax: 0.017,
    bloomDecay: 0.21,
    moveSpread: 0.105,
    airSpread: 0.145,
    crouchSpreadMult: 0.48,
    proneSpreadMult: 0.28,
    moveSpeedMult: 0.93,
    automatic: true,
    range: 210,
    falloffStart: 48,   // Full 39 DMG up to 48m
    falloffEnd: 105,    // Retains 90% DMG (35 DMG = still 3-shot body kill at 100m!)
    minFalloffMult: 0.90,
    zoomFov: 54.4,      // 1.25x (+0.25x) Holo ADS zoom from base 68 FOV
    recoilPitch: 0.014,
    recoilYaw: 0.0044,
    recoilClimbMult: 0.15,
    recoilMaxPitch: 0.145,
    recoilRecovery: 13.5,
    recoilRecoveryDelayMs: 105,
    recoilPattern: [-0.28, 0.30, -0.42, 0.45, -0.52, 0.48],
    crosshairKick: 0.022,
    visualKick: 0.060,
    color: 0xeab308,
    stats: { damage: 92, fireRate: 70, recoilControl: 84, mobility: 70, range: 94 }
  },
  smg: {
    id: 'smg',
    slot: 1,
    category: 'SMG',
    categoryLabel: 'SMG',
    name: 'VECTOR-KRISS',
    role: 'Tiểu Liên CQB (<13m) • 1034 RPM mạnh áp sát, rớt sát thương nặng khi bắn xa',
    opticType: 'holo',
    opticLabel: 'UH-1 HOLO // 1.25X HOLO',
    zoomMult: 1.25,
    damage: 22,
    headshotMult: 1.85, // 41 headshot in CQB (no long-range beam)
    magSize: 32,
    reserveAmmo: 96,
    fireRateMs: 58,     // ~1034 RPM hipfire
    adsFireRateMs: 68,  // ~882 RPM when ADS (+0.25x Holo zoom)
    adsFireRateMult: 1.17,
    reloadMs: 1380,
    tacticalReloadMs: 1050,
    equipMs: 165,
    pellets: 1,
    spread: 0.0092,     // Wider CQB cone so SMG cannot snipe ARs across the map
    adsSpread: 0.0040,
    firstShotSpreadMult: 0.35,
    bloomPerShot: 0.0028,
    bloomMax: 0.024,
    bloomDecay: 0.24,
    moveSpread: 0.058,
    airSpread: 0.095,
    crouchSpreadMult: 0.65,
    proneSpreadMult: 0.48,
    moveSpeedMult: 1.05,
    automatic: true,
    range: 85,
    falloffStart: 12,   // Full 22 DMG only within 12m CQB!
    falloffEnd: 36,     // Drops sharply to 45% (10 DMG) by 36m (needs 10 hits vs AR's 3-4 hits!)
    minFalloffMult: 0.45,
    zoomFov: 54.4,      // 1.25x (+0.25x) Holo ADS zoom from base 68 FOV
    recoilPitch: 0.0068,
    recoilYaw: 0.0034,
    recoilClimbMult: 0.10,
    recoilMaxPitch: 0.095,
    recoilRecovery: 15.5,
    recoilRecoveryDelayMs: 75,
    recoilPattern: [0.22, -0.25, 0.34, -0.32, 0.40, -0.38, 0.45, -0.42],
    crosshairKick: 0.015,
    visualKick: 0.036,
    color: 0x10b981,
    stats: { damage: 56, fireRate: 96, recoilControl: 86, mobility: 95, range: 38 }
  },
  shotgun: {
    id: 'shotgun',
    slot: 1,
    category: 'SHOTGUN',
    categoryLabel: 'SHOTGUN',
    name: 'BUCKSHOT-8',
    role: 'Pump Shotgun Cận Chiến (<9m) • 8 viên đạn chùm 1-Shot áp sát, yếu hẳn khi xa',
    opticType: 'reddot',
    opticLabel: 'MICRO T-2 // 1.25X RED-DOT',
    zoomMult: 1.25,
    damage: 17,
    headshotMult: 1.55, // 26 per pellet headshot in CQB
    magSize: 6,
    reserveAmmo: 24,
    fireRateMs: 590,
    adsFireRateMs: 660,
    adsFireRateMult: 1.12,
    reloadMs: 2200,
    tacticalReloadMs: 1850,
    shellByShell: true,
    shellReloadStartMs: 210,
    shellReloadMs: 330,
    pumpActionMs: 340,
    equipMs: 230,
    pellets: 8,
    spread: 0.056,
    adsSpread: 0.034,
    firstShotSpreadMult: 0.85,
    bloomPerShot: 0.010,
    bloomMax: 0.025,
    bloomDecay: 0.16,
    moveSpread: 0.068,
    airSpread: 0.100,
    crouchSpreadMult: 0.72,
    proneSpreadMult: 0.56,
    moveSpeedMult: 0.97,
    automatic: false,
    range: 48,
    falloffStart: 8,    // Full 17 DMG/pellet only within 8m
    falloffEnd: 25,     // Drops to 25% (4 DMG/pellet) by 25m
    minFalloffMult: 0.25,
    zoomFov: 54.4,      // 1.25x (+0.25x) Red-Dot ADS zoom from base 68 FOV
    recoilPitch: 0.024,
    recoilYaw: 0.0055,
    recoilClimbMult: 0.10,
    recoilMaxPitch: 0.12,
    recoilRecovery: 11.0,
    recoilRecoveryDelayMs: 180,
    recoilPattern: [0.25, -0.25, 0.35, -0.35],
    crosshairKick: 0.032,
    visualKick: 0.085,
    color: 0xef4444,
    stats: { damage: 96, fireRate: 45, recoilControl: 76, mobility: 78, range: 24 }
  },
  sniper: {
    id: 'sniper',
    slot: 1,
    category: 'SNIPER',
    categoryLabel: 'SNIPER',
    name: 'AWP-PHANTOM',
    role: 'AWP Chuẩn CS:GO • 1-Shot Kill vào Ngực/Đầu (108 DMG) mọi cự ly',
    opticType: 'sniper',
    opticLabel: 'S&B PM-II // 8.0X MIL-DOT',
    zoomMult: 3.09,
    damage: 108,
    headshotMult: 2.5, // 270 headshot, 108 torso (1-shot kill!), 84 legshot!
    magSize: 5,
    reserveAmmo: 15,
    fireRateMs: 920,
    adsFireRateMs: 920,
    adsFireRateMult: 1.0,
    reloadMs: 2250,
    tacticalReloadMs: 1750,
    boltActionMs: 480,
    equipMs: 280,
    pellets: 1,
    spread: 0.028,
    adsSpread: 0.0001,
    firstShotSpreadMult: 0.04,
    bloomPerShot: 0.024,
    bloomMax: 0.036,
    bloomDecay: 0.16,
    moveSpread: 0.145,
    airSpread: 0.190,
    crouchSpreadMult: 0.48,
    proneSpreadMult: 0.22,
    moveSpeedMult: 0.88,
    automatic: false,
    range: 260,
    falloffStart: 140,
    falloffEnd: 260,
    minFalloffMult: 0.95,
    zoomFov: 22,
    recoilPitch: 0.028,
    recoilYaw: 0.0045,
    recoilClimbMult: 0.08,
    recoilMaxPitch: 0.13,
    recoilRecovery: 10.0,
    recoilRecoveryDelayMs: 220,
    recoilPattern: [0.20, -0.20],
    crosshairKick: 0.036,
    visualKick: 0.095,
    color: 0x38bdf8,
    stats: { damage: 100, fireRate: 34, recoilControl: 72, mobility: 62, range: 100 }
  },
  lmg: {
    id: 'lmg',
    slot: 1,
    category: 'LMG',
    categoryLabel: 'MACHINEGUN',
    name: 'ODIN-M249',
    role: 'Machinegun Hạng Nặng • Băng đạn 80 viên, nằm bắn chế áp tầm trung',
    opticType: 'holo',
    opticLabel: 'M249 HWS // 1.25X HOLO',
    zoomMult: 1.25,
    damage: 26,
    headshotMult: 2.0, // 52 headshot
    magSize: 80,
    reserveAmmo: 160,
    fireRateMs: 80,     // 750 RPM hipfire
    adsFireRateMs: 94,  // ~638 RPM when ADS (+0.25x Holo zoom)
    adsFireRateMult: 1.18,
    reloadMs: 2750,
    tacticalReloadMs: 2200,
    equipMs: 310,
    pellets: 1,
    spread: 0.0058,
    adsSpread: 0.0012,
    firstShotSpreadMult: 0.16,
    bloomPerShot: 0.0019,
    bloomMax: 0.018,
    bloomDecay: 0.20,
    moveSpread: 0.112,
    airSpread: 0.155,
    crouchSpreadMult: 0.45,
    proneSpreadMult: 0.22,
    moveSpeedMult: 0.85,
    automatic: true,
    range: 175,
    falloffStart: 25,
    falloffEnd: 70,
    minFalloffMult: 0.72,
    zoomFov: 54.4,      // 1.25x (+0.25x) Holo ADS zoom from base 68 FOV
    recoilPitch: 0.0102,
    recoilYaw: 0.0042,
    recoilClimbMult: 0.12,
    recoilMaxPitch: 0.145,
    recoilRecovery: 13.0,
    recoilRecoveryDelayMs: 110,
    recoilPattern: [-0.30, 0.28, -0.42, 0.44, -0.50, 0.48, -0.56, 0.54],
    crosshairKick: 0.017,
    visualKick: 0.050,
    color: 0xf97316,
    stats: { damage: 76, fireRate: 84, recoilControl: 85, mobility: 54, range: 78 }
  },

  // ==================== SLOT 2: SECONDARY WEAPONS (PISTOLS) ====================
  pistol: {
    id: 'pistol',
    slot: 2,
    category: 'PISTOL',
    categoryLabel: 'SECONDARY',
    name: 'PULSE-P9',
    role: 'USP-S / P250 Chiến Thuật • Bắn tap chuẩn xác, rớt sát thương ở tầm xa',
    opticType: 'reddot',
    opticLabel: 'RMR MICRO // 1.25X RED-DOT',
    zoomMult: 1.25,
    damage: 27,
    headshotMult: 2.5, // 68 headshot at close range
    magSize: 12,
    reserveAmmo: 36,
    fireRateMs: 140,
    adsFireRateMs: 162,
    adsFireRateMult: 1.16,
    reloadMs: 1100,
    tacticalReloadMs: 850,
    equipMs: 135,
    pellets: 1,
    spread: 0.0032,
    adsSpread: 0.0008,
    firstShotSpreadMult: 0.08,
    bloomPerShot: 0.0020,
    bloomMax: 0.015,
    bloomDecay: 0.24,
    moveSpread: 0.058,
    airSpread: 0.095,
    crouchSpreadMult: 0.56,
    proneSpreadMult: 0.36,
    moveSpeedMult: 1.05,
    automatic: false,
    range: 110,
    falloffStart: 16,
    falloffEnd: 48,
    minFalloffMult: 0.60,
    zoomFov: 54.4,      // 1.25x (+0.25x) Red-Dot ADS zoom from base 68 FOV
    recoilPitch: 0.0075,
    recoilYaw: 0.0022,
    recoilClimbMult: 0.09,
    recoilMaxPitch: 0.085,
    recoilRecovery: 15.0,
    recoilRecoveryDelayMs: 85,
    recoilPattern: [0.15, -0.15, 0.22, -0.22],
    crosshairKick: 0.015,
    visualKick: 0.042,
    color: 0xa855f7,
    stats: { damage: 60, fireRate: 78, recoilControl: 92, mobility: 95, range: 56 }
  },
  deagle: {
    id: 'deagle',
    slot: 2,
    category: 'PISTOL',
    categoryLabel: 'SECONDARY',
    name: 'SHERIFF .50',
    role: 'Desert Eagle .50 AE • "Juan Deag" 1-Tap Headshot (<38m)',
    opticType: 'reddot',
    opticLabel: 'DELTA-PRO // 1.25X RED-DOT',
    zoomMult: 1.25,
    damage: 52,
    headshotMult: 2.45, // 127 headshot (1-Tap Headshot up to 38m!)
    magSize: 7,
    reserveAmmo: 28,
    fireRateMs: 250,
    adsFireRateMs: 288,
    adsFireRateMult: 1.15,
    reloadMs: 1420,
    tacticalReloadMs: 1120,
    equipMs: 165,
    pellets: 1,
    spread: 0.0032,
    adsSpread: 0.0004,
    firstShotSpreadMult: 0.04,
    bloomPerShot: 0.008,
    bloomMax: 0.024,
    bloomDecay: 0.19,
    moveSpread: 0.098,
    airSpread: 0.140,
    crouchSpreadMult: 0.50,
    proneSpreadMult: 0.32,
    moveSpeedMult: 1.01,
    automatic: false,
    range: 140,
    falloffStart: 25,
    falloffEnd: 68,
    minFalloffMult: 0.68,
    zoomFov: 54.4,      // 1.25x (+0.25x) Red-Dot ADS zoom from base 68 FOV
    recoilPitch: 0.022,
    recoilYaw: 0.0048,
    recoilClimbMult: 0.14,
    recoilMaxPitch: 0.125,
    recoilRecovery: 12.0,
    recoilRecoveryDelayMs: 135,
    recoilPattern: [-0.30, 0.32, -0.45, 0.42],
    crosshairKick: 0.028,
    visualKick: 0.075,
    color: 0xf43f5e,
    stats: { damage: 90, fireRate: 54, recoilControl: 78, mobility: 88, range: 74 }
  },
  glock: {
    id: 'glock',
    slot: 2,
    category: 'PISTOL',
    categoryLabel: 'SECONDARY',
    name: 'FRENZY-G18',
    role: 'Súng Lục Liên Thanh • Xả đạn 857 RPM cứu nguy áp sát (<10m)',
    opticType: 'reddot',
    opticLabel: 'ACRO P-2 // 1.25X RED-DOT',
    zoomMult: 1.25,
    damage: 17,
    headshotMult: 1.65, // 28 headshot at point-blank
    magSize: 18,
    reserveAmmo: 54,
    fireRateMs: 70,     // ~857 RPM hipfire
    adsFireRateMs: 82,  // ~732 RPM when ADS (+0.25x Red-Dot zoom)
    adsFireRateMult: 1.17,
    reloadMs: 1280,
    tacticalReloadMs: 960,
    equipMs: 135,
    pellets: 1,
    spread: 0.0088,
    adsSpread: 0.0034,
    firstShotSpreadMult: 0.28,
    bloomPerShot: 0.0026,
    bloomMax: 0.022,
    bloomDecay: 0.22,
    moveSpread: 0.056,
    airSpread: 0.092,
    crouchSpreadMult: 0.64,
    moveSpeedMult: 1.06,
    automatic: true,
    range: 75,
    falloffStart: 10,   // Full 17 DMG only within 10m
    falloffEnd: 30,     // Drops to 42% (7 DMG) by 30m
    minFalloffMult: 0.42,
    zoomFov: 54.4,      // 1.25x (+0.25x) Red-Dot ADS zoom from base 68 FOV
    recoilPitch: 0.0072,
    recoilYaw: 0.0035,
    recoilClimbMult: 0.11,
    recoilMaxPitch: 0.095,
    recoilRecovery: 14.5,
    recoilRecoveryDelayMs: 80,
    recoilPattern: [0.22, -0.24, 0.32, -0.30, 0.38, -0.36],
    crosshairKick: 0.014,
    visualKick: 0.038,
    color: 0x84cc16,
    stats: { damage: 42, fireRate: 92, recoilControl: 84, mobility: 96, range: 32 }
  },

  // ==================== SLOT 3: MELEE WEAPON (KNIFE) ====================
  knife: {
    id: 'knife',
    slot: 3,
    category: 'MELEE',
    categoryLabel: 'MELEE',
    isMelee: true,
    infiniteAmmo: true,
    opticType: 'none',
    zoomMult: 1.0,
    name: 'KARAMBIT-X',
    role: 'Dao Cận Chiến • Chém nhanh, chạy cực lẹ (+12% Tốc chạy)',
    damage: 55,
    headshotMult: 1.65, // 91 upper-strike / backstab
    magSize: 1,
    reserveAmmo: 0,
    fireRateMs: 310,
    adsFireRateMs: 310,
    adsFireRateMult: 1.0,
    reloadMs: 0,
    tacticalReloadMs: 0,
    equipMs: 130,
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
    falloffStart: 3.3,
    falloffEnd: 5.0,
    minFalloffMult: 1.0,
    zoomFov: 68,
    recoilPitch: 0.0,
    recoilYaw: 0.0,
    recoilClimbMult: 0.0,
    recoilMaxPitch: 0.0,
    recoilRecovery: 16.0,
    recoilRecoveryDelayMs: 50,
    recoilPattern: [0.0],
    crosshairKick: 0.0,
    visualKick: 0.0,
    color: 0xec4899,
    stats: { damage: 85, fireRate: 82, recoilControl: 100, mobility: 100, range: 12 }
  }
};

/**
 * Resolves the effective shot cooldown interval (in ms) for a weapon,
 * applying the slower ADS fire-rate interval when aiming down sights (`isAiming === true`).
 */
export function getEffectiveFireRateMs(weaponCfg, isAiming = false) {
  if (!weaponCfg) return 100;
  const baseMs = Number(weaponCfg.fireRateMs) || 100;
  if (!isAiming || weaponCfg.isMelee) return baseMs;
  if (typeof weaponCfg.adsFireRateMs === 'number' && weaponCfg.adsFireRateMs > 0) {
    return weaponCfg.adsFireRateMs;
  }
  const mult = Number(weaponCfg.adsFireRateMult) || 1.0;
  return Math.round(baseMs * mult);
}

/**
 * Computes the distance-based damage falloff multiplier for a weapon at `dist` meters.
 * Guarantees SMGs and Shotguns lose damage rapidly outside CQB while ARs & Snipers hold power at range.
 */
export function computeDistanceFalloff(weaponCfg, dist) {
  if (!weaponCfg || weaponCfg.isMelee) return 1.0;
  const start = weaponCfg.falloffStart ?? 25;
  const end = weaponCfg.falloffEnd ?? 70;
  const minMult = weaponCfg.minFalloffMult ?? 0.7;

  if (dist <= start) return 1.0;
  if (dist >= end || end <= start) return minMult;
  const t = (dist - start) / (end - start);
  return 1.0 - t * (1.0 - minMult);
}

export const PRIMARY_WEAPONS = ['rifle', 'm4a1', 'scar', 'smg', 'shotgun', 'sniper', 'lmg'];
export const SECONDARY_WEAPONS = ['pistol', 'deagle', 'glock'];
export const MELEE_WEAPONS = ['knife'];
export const DEFAULT_LOADOUT = {
  primary: 'rifle',
  secondary: 'pistol',
  melee: 'knife'
};
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

