import {
  DEFAULT_LOADOUT,
  DEFAULT_MAP_ID,
  DEFAULT_OPERATOR_COLOR,
  PRIMARY_WEAPONS,
  SECONDARY_WEAPONS,
  VALID_OPERATOR_COLORS,
  PlayerStateCache,
  getMapConfig
} from '../shared.js';

export const USER_PREFS_STORAGE_KEY = 'polystrike_user_prefs_v1';
export const LEGACY_NAME_STORAGE_KEY = 'polystrike_name';
export { VALID_OPERATOR_COLORS, DEFAULT_OPERATOR_COLOR };
export const KEYBOARD_LOCK_CODES = [
  'KeyW',
  'KeyA',
  'KeyS',
  'KeyD',
  'KeyR',
  'KeyQ',
  'KeyE',
  'KeyF',
  'KeyG',
  'KeyC',
  'ControlLeft',
  'ShiftLeft',
  'Space',
  'Tab',
  'Escape'
];
export const PROTECTED_GAMEPLAY_KEY_CODES = new Set([
  'KeyW',
  'KeyA',
  'KeyS',
  'KeyD',
  'KeyR',
  'KeyF',
  'KeyG',
  'KeyQ',
  'KeyE',
  'KeyC',
  'KeyZ',
  'KeyX',
  'KeyB',
  'KeyL',
  'KeyT',
  'KeyN',
  'KeyP',
  'KeyO',
  'KeyU',
  'KeyH',
  'KeyJ',
  'Tab',
  'Space',
  'Digit1',
  'Digit2',
  'Digit3',
  'ShiftLeft',
  'ShiftRight',
  'ControlLeft',
  'ControlRight'
]);

export function loadUserPrefs() {
  let raw = {};
  try {
    const storedJson = localStorage.getItem(USER_PREFS_STORAGE_KEY);
    if (storedJson) {
      const parsed = JSON.parse(storedJson);
      if (parsed && typeof parsed === 'object') {
        raw = parsed;
      }
    }
  } catch {
    raw = {};
  }

  let legacyName = '';
  try {
    legacyName = localStorage.getItem(LEGACY_NAME_STORAGE_KEY) || '';
  } catch {
    legacyName = '';
  }

  const candidateName = typeof raw.playerName === 'string' && raw.playerName.trim()
    ? raw.playerName.trim()
    : legacyName.trim();
  const cleanName = candidateName.replace(/[<>&"'`]/g, '').trim().slice(0, 16) ||
    `Striker_${ Math.floor(100 + Math.random() * 899) }`;

  const primaryWeapon = PRIMARY_WEAPONS.includes(raw.primaryWeapon)
    ? raw.primaryWeapon
    : (DEFAULT_LOADOUT.primary || 'rifle');

  const secondaryWeapon = DEFAULT_LOADOUT.secondary || 'pistol';

  const parsedColor = Number(raw.operatorColor);
  const operatorColor = VALID_OPERATOR_COLORS.includes(parsedColor)
    ? parsedColor
    : DEFAULT_OPERATOR_COLOR;

  const candidateMap = typeof raw.selectedMap === 'string' ? raw.selectedMap : '';
  const resolvedMapCfg = candidateMap ? getMapConfig(candidateMap) : null;
  const selectedMap = candidateMap && resolvedMapCfg?.id === candidateMap
    ? candidateMap
    : (DEFAULT_MAP_ID || 'cyber_citadel');

  const parsedSens = Number(raw.sensitivity);
  const sensitivity = Number.isFinite(parsedSens)
    ? Math.max(0.3, Math.min(2.5, Math.round(parsedSens * 10) / 10))
    : 1.0;

  const soundEnabled = typeof raw.soundEnabled === 'boolean' ? raw.soundEnabled : true;

  return {
    playerName: cleanName,
    primaryWeapon,
    secondaryWeapon,
    operatorColor,
    selectedMap,
    sensitivity,
    soundEnabled
  };
}

export const userPrefs = loadUserPrefs();

export function saveUserPrefs(partial = {}) {
  Object.assign(userPrefs, partial);
  userPrefs.secondaryWeapon = DEFAULT_LOADOUT.secondary || 'pistol';
  try {
    localStorage.setItem(USER_PREFS_STORAGE_KEY, JSON.stringify(userPrefs));
    if (userPrefs.playerName) {
      localStorage.setItem(LEGACY_NAME_STORAGE_KEY, userPrefs.playerName);
    }
  } catch {
    // Ignore storage quota or private browsing restrictions
  }
}

export function lockGameplayKeys() {
  if (typeof navigator !== 'undefined' && navigator.keyboard && typeof navigator.keyboard.lock === 'function') {
    try {
      const lockResult = navigator.keyboard.lock(KEYBOARD_LOCK_CODES);
      if (lockResult && typeof lockResult.catch === 'function') {
        lockResult.catch(() => {});
      }
    } catch {
      // Ignore unsupported Keyboard Lock API errors
    }
  }
}

export function unlockGameplayKeys() {
  if (typeof navigator !== 'undefined' && navigator.keyboard && typeof navigator.keyboard.unlock === 'function') {
    try {
      navigator.keyboard.unlock();
    } catch {
      // Ignore keyboard unlock errors
    }
  }
}

export const MULTI_KILL_WINDOW_MS = 6500;

export const appState = {
  netClient: null,
  netInitFailed: false,
  socket: null,
  sfx: null,
  game: null,
  isRestoringPrefs: false,
  selectedStartingWeapon: userPrefs.primaryWeapon,
  selectedLoadout: {
    primary: userPrefs.primaryWeapon,
    secondary: userPrefs.secondaryWeapon,
    melee: DEFAULT_LOADOUT.melee || 'knife'
  },
  selectedMapId: userPrefs.selectedMap,
  selectedOperatorColor: userPrefs.operatorColor,
  selectedGameMode: 'ffa',
  currentRoomGameMode: 'ffa',
  currentRoomState: 'PLAYING',
  currentRoomHostId: null,
  currentLocalTeam: null,
  currentLocalReady: false,
  currentTeamScores: { alpha: 0, bravo: 0 },
  activeRoomCode: '',
  latestPlayers: [],
  lanInfo: null, // { role: 'host'|'guest', code, ... } when this page plays in an in-browser LAN room
  playerStateCache: new PlayerStateCache(), // rebuilds complete player objects from hot-only stateUpdate entries
  hitmarkerTimer: null,
  floatingDmgTimer: null,
  adrenalineTimer: null,
  multikillBannerTimer: null,
  damageDirTimer: null,
  bannerTimer: null,
  respawnInterval: null,
  nextMatchInterval: null,
  spawnShieldInterval: null,
  spawnShieldTimeout: null,
  localMultiKillCount: 0,
  lastLocalKillAt: 0,
  localGrenades: 1,
  lastGrenadeThrowAt: 0,
  currentPingMs: 0,
  qualityNotice: '',
  lastScoreboardSig: '',
  serverErrorShown: false,
  lastJoinPayload: null,
  lastShotRejectToastAt: 0,
  hudCache: {
    hp: -1,
    armor: -1,
    buffSig: '',
    grenades: -1,
    timerSec: -1,
    kills: -1,
    deaths: -1,
    streak: -1,
    leaderText: '',
    speed: '',
    stance: '',
    chGap: -1,
    chAiming: null,
    chMoving: null,
    chSteady: null,
    chRecoiling: null
  }
};
