import {
  MATCH_CONFIG,
  WEAPONS,
  PRIMARY_WEAPONS,
  SECONDARY_WEAPONS,
  DEFAULT_LOADOUT,
  DEFAULT_MAP_ID,
  getMapConfig
} from '../shared/constants.js';
import { SoundEffects } from './audio.js';
import { Game3D } from './game3d.js';
import { createNetworkClient, installRejoinOnReconnect, SERVER_UNREACHABLE_MESSAGE } from './networkAdapter.js';

let netClient;
let netInitFailed = false;
try {
  netClient = await createNetworkClient();
} catch {
  // Dedicated server unreachable (Socket.IO client missing): inert client so the lobby can show an error.
  netInitFailed = true;
  netClient = {
    mode: 'offline',
    socket: { connected: false, emit() {}, on() {}, volatile: { emit() {} } },
    fetchRooms: async () => {
      throw new Error(SERVER_UNREACHABLE_MESSAGE);
    }
  };
}
const socket = netClient.socket;
const sfx = new SoundEffects();
const hasDedicatedHeadshotDink = typeof SoundEffects.prototype.playHeadshotDink === 'function';
if (!hasDedicatedHeadshotDink) {
  sfx.playHeadshotDink = () => sfx.playHitmarker?.(true);
}
const hasDedicatedMultiKillTone = typeof SoundEffects.prototype.playMultiKillTone === 'function';
if (!hasDedicatedMultiKillTone) {
  sfx.playMultiKillTone = (multiKillCount = 1) => sfx.playKillConfirm?.(multiKillCount);
}

// DOM Elements
const canvasContainer = document.getElementById('canvas-container');
const toastEl = document.getElementById('toast');

// Lobby Elements
const lobbyScreen = document.getElementById('lobby-screen');
const inviteBanner = document.getElementById('invite-banner');
const inviteRoomCodeEl = document.getElementById('invite-room-code');
const btnJoinInvited = document.getElementById('btn-join-invited');
const playerNameInput = document.getElementById('player-name');
const weaponGrid = document.getElementById('lobby-weapon-grid');
const mapGrid = document.getElementById('lobby-map-grid');
const lobbyError = document.getElementById('lobby-error');
const btnQuickPlay = document.getElementById('btn-quick-play');
const btnCreatePrivate = document.getElementById('btn-create-private');
const roomCodeInput = document.getElementById('room-code-input');
const btnJoinCode = document.getElementById('btn-join-code');
const btnRefreshRooms = document.getElementById('btn-refresh-rooms');
const activeRoomsList = document.getElementById('active-rooms-list');

// HUD Elements
const hudScreen = document.getElementById('hud-screen');
const damageOverlay = document.getElementById('damage-overlay');
const spawnShieldOverlay = document.getElementById('spawn-shield-overlay');
const spawnShieldBadge = document.getElementById('spawn-shield-badge');
const spawnShieldTimerEl = document.getElementById('spawn-shield-timer');
const hudHpCard = document.getElementById('hud-hp-card');
const hudHpAdrenalineTag = document.getElementById('hud-hp-adrenaline-tag');
const damageDirIndicator = document.getElementById('damage-dir-indicator');
const sniperScope = document.getElementById('sniper-scope');
const opticScope = document.getElementById('optic-scope');
const opticTelemetry = document.getElementById('optic-telemetry');
const crosshair = document.getElementById('crosshair');
const hitmarker = document.getElementById('hitmarker');
const hudFloatingDmg = document.getElementById('hud-floating-dmg');
const hudAdrenalinePop = document.getElementById('hud-adrenaline-pop');
const multikillBanner = document.getElementById('multikill-banner');
const multikillMedal = document.getElementById('multikill-medal');
const multikillTitle = document.getElementById('multikill-title');
const multikillSubtitle = document.getElementById('multikill-subtitle');
const centerBanner = document.getElementById('center-banner');
const hudRoomCode = document.getElementById('hud-room-code');
const hudMapName = document.getElementById('hud-map-name');
const btnCopyLinkHud = document.getElementById('btn-copy-link-hud');
const hudTimer = document.getElementById('hud-timer');
const hudKillLimit = document.getElementById('hud-kill-limit');
const hudLeader = document.getElementById('hud-leader');
const hudFps = document.getElementById('hud-fps');
const hudPing = document.getElementById('hud-ping');
const killFeed = document.getElementById('kill-feed');
const hudKills = document.getElementById('hud-kills');
const hudDeaths = document.getElementById('hud-deaths');
const hudStreak = document.getElementById('hud-streak');
const hudStance = document.getElementById('hud-stance');
const hudSpeed = document.getElementById('hud-speed');
const hudHpValue = document.getElementById('hud-hp-value');
const hudHpBar = document.getElementById('hud-hp-bar');
const reloadIndicator = document.getElementById('reload-indicator');
const reloadText = document.getElementById('reload-text');
const reloadBarFill = document.getElementById('reload-bar-fill');
const weaponPickupPrompt = document.getElementById('weapon-pickup-prompt');
const weaponPickupText = document.getElementById('weapon-pickup-text');
const weaponPickupTimer = document.getElementById('weapon-pickup-timer');
const hudWeaponName = document.getElementById('hud-weapon-name');
const hudWeaponRole = document.getElementById('hud-weapon-role');
const hudAmmoCurrent = document.getElementById('hud-ammo-current');
const hudAmmoMag = document.getElementById('hud-ammo-mag');
const hudWeaponHotbar = document.getElementById('hud-weapon-hotbar');
const hotbarSlot1 = document.getElementById('hotbar-slot-1');
const hotbarSlot2 = document.getElementById('hotbar-slot-2');
const hotbarSlot3 = document.getElementById('hotbar-slot-3');
const hotbarName1 = document.getElementById('hotbar-name-1');
const hotbarName2 = document.getElementById('hotbar-name-2');
const hotbarName3 = document.getElementById('hotbar-name-3');
const hudGrenadeSlot = document.getElementById('hud-grenade-slot');
const hudGrenadeStatus = document.getElementById('hud-grenade-status');
const hudGrenadeCount = document.getElementById('hud-grenade-count');
const hudGrenadeStateText = document.getElementById('hud-grenade-state-text');
const btnHudLoadout = document.getElementById('btn-hud-loadout');

// Lobby 3D Operator Showcase Elements
const operatorDragZone = document.getElementById('operator-drag-zone');
const showcaseOperatorName = document.getElementById('showcase-operator-name');
const showcaseWeaponName = document.getElementById('showcase-weapon-name');
const operatorColorSwatches = document.getElementById('operator-color-swatches');
const btnShowcaseWalk = document.getElementById('btn-showcase-walk');
const btnShowcaseCrouch = document.getElementById('btn-showcase-crouch');
const btnShowcaseFire = document.getElementById('btn-showcase-fire');
const btnShowcaseRotate = document.getElementById('btn-showcase-rotate');

// Modals
const deathOverlay = document.getElementById('death-overlay');
const deathKillerName = document.getElementById('death-killer-name');
const deathWeaponName = document.getElementById('death-weapon-name');
const respawnTimerEl = document.getElementById('respawn-timer');
const btnOpenLoadoutDeath = document.getElementById('btn-open-loadout-death');

const loadoutModal = document.getElementById('loadout-modal');
const loadoutPrimaryGrid = document.getElementById('loadout-primary-grid');
const loadoutSecondaryGrid = document.getElementById('loadout-secondary-grid');
const btnSaveLoadout = document.getElementById('btn-save-loadout');

const pauseModal = document.getElementById('pause-modal');
const pauseInviteUrl = document.getElementById('pause-invite-url');
const btnCopyLinkPause = document.getElementById('btn-copy-link-pause');
const pauseMapSelect = document.getElementById('pause-map-select');
const sensSlider = document.getElementById('sens-slider');
const sensValue = document.getElementById('sens-value');
const soundCheckbox = document.getElementById('sound-checkbox');
const btnResume = document.getElementById('btn-resume');
const btnLeaveRoom = document.getElementById('btn-leave-room');

const scoreboardModal = document.getElementById('scoreboard-modal');
const sbRoomCode = document.getElementById('sb-room-code');
const sbMapName = document.getElementById('sb-map-name');
const scoreboardBody = document.getElementById('scoreboard-body');

const matchEndModal = document.getElementById('match-end-modal');
const victoryWinnerName = document.getElementById('victory-winner-name');
const victoryWinnerStats = document.getElementById('victory-winner-stats');
const victoryLeaderboardBody = document.getElementById('victory-leaderboard-body');
const nextMatchCountdown = document.getElementById('next-match-countdown');

// User Preferences Persistence & Keyboard Lock Constants
const USER_PREFS_STORAGE_KEY = 'polystrike_user_prefs_v1';
const LEGACY_NAME_STORAGE_KEY = 'polystrike_name';
const VALID_OPERATOR_COLORS = [0xe5a024, 0x4b5320, 0x38bdf8, 0xef4444, 0x94a3b8];
const DEFAULT_OPERATOR_COLOR = 0xe5a024;
const KEYBOARD_LOCK_CODES = [
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
const PROTECTED_GAMEPLAY_KEY_CODES = new Set([
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

function loadUserPrefs() {
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

  const secondaryWeapon = SECONDARY_WEAPONS.includes(raw.secondaryWeapon)
    ? raw.secondaryWeapon
    : (DEFAULT_LOADOUT.secondary || 'pistol');

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

const userPrefs = loadUserPrefs();

function saveUserPrefs(partial = {}) {
  Object.assign(userPrefs, partial);
  try {
    localStorage.setItem(USER_PREFS_STORAGE_KEY, JSON.stringify(userPrefs));
    if (userPrefs.playerName) {
      localStorage.setItem(LEGACY_NAME_STORAGE_KEY, userPrefs.playerName);
    }
  } catch {
    // Ignore storage quota or private browsing restrictions
  }
}

function lockGameplayKeys() {
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

function unlockGameplayKeys() {
  if (typeof navigator !== 'undefined' && navigator.keyboard && typeof navigator.keyboard.unlock === 'function') {
    try {
      navigator.keyboard.unlock();
    } catch {
      // Ignore keyboard unlock errors
    }
  }
}

// Client Application State
let isRestoringPrefs = false;
let selectedStartingWeapon = userPrefs.primaryWeapon;
let selectedLoadout = {
  primary: userPrefs.primaryWeapon,
  secondary: userPrefs.secondaryWeapon,
  melee: DEFAULT_LOADOUT.melee || 'knife'
};
let selectedMapId = userPrefs.selectedMap;
let selectedOperatorColor = userPrefs.operatorColor;
let activeRoomCode = '';
let latestPlayers = [];
let hitmarkerTimer = null;
let floatingDmgTimer = null;
let adrenalineTimer = null;
let multikillBannerTimer = null;
let damageDirTimer = null;
let bannerTimer = null;
let respawnInterval = null;
let nextMatchInterval = null;
let spawnShieldInterval = null;
let spawnShieldTimeout = null;
let localMultiKillCount = 0;
let lastLocalKillAt = 0;
const MULTI_KILL_WINDOW_MS = 6500;
let localGrenades = 1;
let lastGrenadeThrowAt = 0;
let currentPingMs = 0;

const hudCache = {
  hp: -1,
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
  chRecoiling: null
};

// Initialize 3D Engine
const game = new Game3D(canvasContainer, {
  // Client-side prediction: input commands (never positions) go to the server; it answers with `moveAck`
  onInputBatch: (batch) => {
    // `d` = interpolation delay (ms) remote players are drawn with right now: the server rewinds exactly this much (plus
    // half the RTT it measures itself) when it resolves a shot in this batch (lag compensation parity)
    batch.d = game.getInterpDelayMs();
    socket.emit('inputBatch', batch);
  },
  // The shot itself travels inside the input commands (FIRE bit + shot sequence, see Game3D.advanceFixedPhysics): there is no
  // `shoot` socket event. This callback only plays the local gunshot sound.
  onLocalShot: (shot) => {
    sfx.playShot(shot.weapon, 0.92);
  },
  onDryFire: () => {
    sfx.playDryFire();
  },
  onReloadStart: (weaponId, reloadMs = 1600, mode = 'empty', currentAmmo = 0, reserveAmmo = 0) => {
    const cfg = WEAPONS[weaponId] || WEAPONS.rifle;
    reloadIndicator.classList.remove('hidden');
    if (reloadText) {
      if (mode === 'shell') {
        reloadText.textContent = `NẠP ĐẠN (${ currentAmmo }/${ cfg.magSize })`;
      } else {
        reloadText.textContent = 'ĐANG NẠP ĐẠN...';
      }
    }
    if (reloadBarFill) {
      reloadBarFill.style.transition = 'none';
      const startPct = mode === 'shell' ? Math.round((currentAmmo / Math.max(1, cfg.magSize)) * 100) : 0;
      reloadBarFill.style.width = `${ startPct }%`;
      void reloadBarFill.offsetWidth;
      reloadBarFill.style.transition = `width ${ reloadMs }ms linear`;
      reloadBarFill.style.width = '100%';
    }
    sfx.playReload(reloadMs, mode);
    socket.emit('reload', { weapon: weaponId, mode });
  },
  onShellInserted: (weaponId, currentAmmo, reserveAmmo, isFull) => {
    const cfg = WEAPONS[weaponId] || WEAPONS.shotgun;
    sfx.playShellInsert(isFull);
    updateWeaponHud(weaponId, currentAmmo, reserveAmmo);
    if (reloadText && !isFull) {
      reloadText.textContent = `NẠP ĐẠN (${ currentAmmo }/${ cfg.magSize })`;
    }
  },
  onReloadCancel: (weaponId, currentAmmo, reserveAmmo) => {
    reloadIndicator.classList.add('hidden');
    updateWeaponHud(weaponId, currentAmmo, reserveAmmo);
  },
  onReloadComplete: (weaponId, currentAmmo, reserveAmmo) => {
    reloadIndicator.classList.add('hidden');
    updateWeaponHud(weaponId, currentAmmo, reserveAmmo);
  },
  onWeaponChanged: (weaponId, currentAmmo, reserveAmmo) => {
    if (!game.reloadingUntil || game.reloadingUntil <= performance.now()) {
      reloadIndicator.classList.add('hidden');
    }
    updateWeaponHud(weaponId, currentAmmo, reserveAmmo);
  },
  onSelfState: (state) => {
    if (!game.inMatch || !state) return;
    if (typeof state.hp === 'number') {
      updateHpHud(state.hp);
    }
    if (typeof state.grenades === 'number') {
      const isThrowInFlight = state.grenades > localGrenades && (performance.now() - lastGrenadeThrowAt) < 350;
      if (!isThrowInFlight) {
        updateGrenadeHud(state.grenades);
      }
    }
    if (!state.reloading && (!game.reloadingUntil || game.reloadingUntil <= performance.now())) {
      reloadIndicator.classList.add('hidden');
    }
  },
  onNearbyWeaponChange: (dropItem, remSec) => {
    if (!weaponPickupPrompt) return;
    if (!dropItem || !game.inMatch || !game.alive) {
      weaponPickupPrompt.classList.add('hidden');
      return;
    }
    const wCfg = WEAPONS[dropItem.weapon];
    const wName = wCfg ? wCfg.name : dropItem.weapon.toUpperCase();
    if (weaponPickupText) {
      weaponPickupText.textContent = `Nhặt ${ wName } (${ dropItem.ammo }/${ dropItem.reserveAmmo })`;
    }
    if (weaponPickupTimer) {
      weaponPickupTimer.textContent = `${ remSec.toFixed(1) }s`;
    }
    weaponPickupPrompt.classList.remove('hidden');
  },
  onPickupWeapon: (dropId) => {
    if (!dropId) return;
    socket.emit('pickupWeapon', { dropId });
  },
  onWeaponSwitchSound: () => {
    if (!isRestoringPrefs) {
      sfx.playWeaponSwitch();
    }
  },
  onAimChange: (isAiming, weaponId) => {
    const wCfg = WEAPONS[weaponId] || WEAPONS.rifle;
    if (isAiming && weaponId === 'sniper') {
      sniperScope.classList.remove('hidden');
      opticScope?.classList.add('hidden');
      opticScope?.classList.remove('optic-holo', 'optic-reddot');
      crosshair.classList.add('hidden');
      hudCache.chAiming = true;
    } else if (isAiming && !wCfg?.isMelee && wCfg?.opticType !== 'none') {
      sniperScope.classList.add('hidden');
      const isHolo = wCfg?.opticType === 'holo';
      if (opticScope) {
        opticScope.classList.remove('hidden');
        opticScope.classList.toggle('optic-holo', isHolo);
        opticScope.classList.toggle('optic-reddot', !isHolo);
      }
      if (opticTelemetry) {
        opticTelemetry.textContent = wCfg?.opticLabel || (isHolo ? 'EOTECH HOLO // 1.25X' : 'REFLEX RED-DOT // 1.25X');
      }
      crosshair.classList.remove('hidden');
      crosshair.classList.toggle('aiming', true);
      hudCache.chAiming = true;
    } else {
      sniperScope.classList.add('hidden');
      opticScope?.classList.add('hidden');
      opticScope?.classList.remove('optic-holo', 'optic-reddot');
      crosshair.classList.remove('hidden');
      crosshair.classList.toggle('aiming', false);
      hudCache.chAiming = false;
    }
  },
  onSpreadUpdate: (effectiveSpread, isAiming, isMoving = false, crosshairKick = 0) => {
    // Convert angular spread + crosshair recoil kick into pixel gap (2px stationary up to 44px when running/firing)
    const moveBonusPx = isMoving ? 10 : 0;
    const kickPx = Math.round((crosshairKick || 0) * 280);
    const gapPx = Math.max(2, Math.min(44, Math.round(effectiveSpread * 340) + moveBonusPx + kickPx));
    const aimingBool = Boolean(isAiming);
    const movingBool = Boolean(isMoving);
    const recoilingBool = kickPx >= 3;

    if (hudCache.chGap !== gapPx) {
      hudCache.chGap = gapPx;
      crosshair.style.setProperty('--ch-gap', `${gapPx}px`);
    }
    if (hudCache.chAiming !== aimingBool) {
      hudCache.chAiming = aimingBool;
      crosshair.classList.toggle('aiming', aimingBool);
    }
    if (hudCache.chMoving !== movingBool) {
      hudCache.chMoving = movingBool;
      crosshair.classList.toggle('moving', movingBool);
    }
    if (hudCache.chRecoiling !== recoilingBool) {
      hudCache.chRecoiling = recoilingBool;
      crosshair.classList.toggle('recoiling', recoilingBool);
    }
  },
  onMovementHudUpdate: (stance, speed) => {
    const speedStr = speed.toFixed(1);
    if (hudSpeed && hudCache.speed !== speedStr) {
      hudCache.speed = speedStr;
      hudSpeed.textContent = speedStr;
    }
    if (hudStance && hudCache.stance !== stance) {
      hudCache.stance = stance;
      const labels = {
        WALK: '🏃 WALK',
        SPRINT: '⚡ SPRINT',
        SLIDE: '💨 SLIDE',
        CROUCH: '🔉 CROUCH',
        PRONE: '🐍 PRONE',
        PEEK: '📐 PEEK',
        AIR: '🚀 AIR'
      };
      hudStance.textContent = labels[stance] || stance;
      hudStance.classList.toggle('slide', stance === 'SLIDE');
      hudStance.classList.toggle('sprint', stance === 'SPRINT');
    }
  },
  onJump: () => {
    sfx.playJump();
  },
  onFootstep: (isSprint) => {
    sfx.playFootstep(isSprint);
  },
  onSlide: () => {
    sfx.playSlide();
  },
  onLand: (intensity) => {
    sfx.playLand(intensity);
  },
  onPointerLockChange: (locked) => {
    if (locked) {
      lockGameplayKeys();
    }
    if (!game.inMatch) return;
    const isLoadoutOpen = loadoutModal && !loadoutModal.classList.contains('hidden');
    if (!locked && matchEndModal.classList.contains('hidden') && deathOverlay.classList.contains('hidden') && !isLoadoutOpen) {
      pauseModal.classList.remove('hidden');
    } else if (locked) {
      pauseModal.classList.add('hidden');
      if (loadoutModal) loadoutModal.classList.add('hidden');
    }
  },
  onLoadoutToggle: () => {
    toggleLoadoutModal();
  },
  onThrowGrenade: (payload) => {
    handleThrowGrenadeRequest(payload);
  },
  onGrenadeChanged: (count) => {
    updateGrenadeHud(count);
  },
  onCopyLinkShortcut: () => {
    copyInviteLinkToClipboard();
  },
  onScoreboardToggle: (show) => {
    if (!game.inMatch) return;
    if (show) {
      renderScoreboard(latestPlayers);
      scoreboardModal.classList.remove('hidden');
    } else {
      scoreboardModal.classList.add('hidden');
    }
  },
  onFpsUpdate: (fps) => {
    hudFps.textContent = String(fps);
  }
});

// Keep game.mouseSensitivity and game.sensitivity bidirectionally synchronized
if (!Object.getOwnPropertyDescriptor(game, 'mouseSensitivity')) {
  Object.defineProperty(game, 'mouseSensitivity', {
    get() {
      return this.sensitivity;
    },
    set(val) {
      const clean = Number(val);
      if (Number.isFinite(clean)) {
        this.sensitivity = clean;
      }
    },
    configurable: true,
    enumerable: true
  });
}

// Wrap game.requestPointerLock so Keyboard Lock API is engaged automatically whenever entering pointer lock
const origRequestPointerLock = game.requestPointerLock.bind(game);
game.requestPointerLock = () => {
  origRequestPointerLock();
  lockGameplayKeys();
};

// Prevent accidental tab closure (Ctrl+W, Ctrl+R, F5, etc.) during an active match or room session
window.addEventListener('beforeunload', (e) => {
  if (game.inMatch || activeRoomCode) {
    e.preventDefault();
    e.returnValue = '';
    return '';
  }
});

document.addEventListener('pointerlockchange', () => {
  if (document.pointerLockElement === game.renderer?.domElement || (game.inMatch && game.isPointerLocked)) {
    lockGameplayKeys();
  }
});

document.addEventListener('fullscreenchange', () => {
  if (document.fullscreenElement && (game.inMatch || game.isPointerLocked)) {
    lockGameplayKeys();
  }
});

// Capture-phase keydown protection to intercept browser shortcuts (Ctrl+W, Ctrl+R, Ctrl+Q, Ctrl+T, Ctrl+N, Ctrl+S, Ctrl+D, F5, etc.)
// while keeping movement and crouching keys (W/A/S/D, Ctrl, Shift, Space) responsive in-game
window.addEventListener('keydown', (e) => {
  if (!game.inMatch && !game.isPointerLocked) return;

  const activeTag = document.activeElement?.tagName;
  const isTypingInField =
    !game.isPointerLocked &&
    (activeTag === 'INPUT' || activeTag === 'TEXTAREA' || activeTag === 'SELECT');

  if (e.code === 'F5') {
    e.preventDefault();
    e.stopPropagation();
    return;
  }

  const hasModifier = Boolean(e.ctrlKey || e.metaKey || e.altKey);
  if (!hasModifier) return;

  if (isTypingInField) {
    if (
      e.code === 'KeyW' ||
      e.code === 'KeyR' ||
      e.code === 'KeyQ' ||
      e.code === 'KeyT' ||
      e.code === 'KeyN'
    ) {
      e.preventDefault();
      e.stopPropagation();
    }
    return;
  }

  if (PROTECTED_GAMEPLAY_KEY_CODES.has(e.code)) {
    e.preventDefault();
    e.stopPropagation();

    // Ensure movement & crouch keys still register smoothly when stopPropagation() is used
    if (e.code in game.keys) {
      game.keys[e.code] = true;
    } else if (e.code === 'ControlRight') {
      game.keys.ControlLeft = true;
    }
  }
}, { capture: true });

window.addEventListener('keyup', (e) => {
  if (e.code in game.keys) {
    game.keys[e.code] = false;
  } else if (e.code === 'ControlRight') {
    game.keys.ControlLeft = false;
  }
}, { capture: true });

window.addEventListener('blur', () => {
  for (const k of Object.keys(game.keys)) {
    game.keys[k] = false;
  }
  game.isMouseDown = false;
});

// Detect ?room=CODE in URL
const urlParams = new URLSearchParams(window.location.search);
const invitedRoomParam = (urlParams.get('room') || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
if (invitedRoomParam) {
  inviteBanner.classList.remove('hidden');
  inviteRoomCodeEl.textContent = `#${ invitedRoomParam }`;
  roomCodeInput.value = invitedRoomParam;
}

// Helper: Show Toast
function showToast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.remove('hidden');
  setTimeout(() => {
    toastEl.classList.add('hidden');
  }, 2600);
}

// Helper: Show Center Tactical Banner
function showCenterBanner(text) {
  centerBanner.textContent = text;
  centerBanner.classList.remove('hidden');
  if (bannerTimer) clearTimeout(bannerTimer);
  bannerTimer = setTimeout(() => {
    centerBanner.classList.add('hidden');
  }, 2200);
}

// Helper: Distinct Body / Headshot / Kill Hitmarker & Floating HUD Damage
function triggerHitmarkerFeedback({ damage = 0, isHeadshot = false, isKill = false }) {
  if (hitmarker) {
    hitmarker.classList.remove('hidden', 'headshot', 'kill');
    void hitmarker.offsetWidth;
    if (isHeadshot) {
      hitmarker.classList.add('headshot');
    }
    if (isKill) {
      hitmarker.classList.add('kill');
    }
    if (hitmarkerTimer) clearTimeout(hitmarkerTimer);
    const holdMs = isKill ? 280 : isHeadshot ? 210 : 140;
    hitmarkerTimer = setTimeout(() => {
      hitmarker.classList.add('hidden');
      hitmarker.classList.remove('headshot', 'kill');
    }, holdMs);
  }

  if (damage > 0 && hudFloatingDmg) {
    const cleanDmg = Math.max(1, Math.round(Number(damage) || 0));
    hudFloatingDmg.textContent = isHeadshot ? `🎯 -${ cleanDmg } HS!` : `-${ cleanDmg }`;
    hudFloatingDmg.classList.toggle('headshot', Boolean(isHeadshot));
    hudFloatingDmg.classList.remove('hidden');
    if (floatingDmgTimer) clearTimeout(floatingDmgTimer);
    floatingDmgTimer = setTimeout(() => {
      hudFloatingDmg.classList.add('hidden');
    }, 520);
  }
}

// Helper: +25 HP Adrenaline Kill Heal Indicator
function clearAdrenalineHealHud() {
  if (adrenalineTimer) {
    clearTimeout(adrenalineTimer);
    adrenalineTimer = null;
  }
  hudAdrenalinePop?.classList.add('hidden');
  hudHpAdrenalineTag?.classList.add('hidden');
  hudHpCard?.classList.remove('adrenaline-heal');
}

function triggerAdrenalineHealFeedback(healAmount = 25, serverHp = null) {
  if (!game.alive) return;
  const cleanHeal = Math.max(1, Math.round(Number(healAmount) || 25));
  const nextHp = typeof serverHp === 'number' && serverHp > 0
    ? Math.min(100, Math.round(serverHp))
    : Math.min(100, (hudCache.hp > 0 ? hudCache.hp : 100) + cleanHeal);
  updateHpHud(nextHp);

  const label = `+${ cleanHeal } HP`;
  if (hudAdrenalinePop) {
    hudAdrenalinePop.textContent = `⚡ ${ label }`;
    hudAdrenalinePop.classList.remove('hidden');
  }
  if (hudHpAdrenalineTag) {
    hudHpAdrenalineTag.textContent = label;
    hudHpAdrenalineTag.classList.remove('hidden');
  }
  hudHpCard?.classList.add('adrenaline-heal');

  if (adrenalineTimer) clearTimeout(adrenalineTimer);
  adrenalineTimer = setTimeout(() => {
    clearAdrenalineHealHud();
  }, 1650);
}

// Helper: Multi-Kill Streak Banner & Audio Announcer (FIRST BLOOD -> ACE / RAMPAGE)
const MULTI_KILL_TIERS = {
  1: { title: 'FIRST BLOOD', medal: '🩸', tierClass: 'mk-tier-1' },
  2: { title: 'DOUBLE KILL', medal: '⚡', tierClass: 'mk-tier-2' },
  3: { title: 'TRIPLE KILL', medal: '🔥', tierClass: 'mk-tier-3' },
  4: { title: 'QUADRA KILL', medal: '💀', tierClass: 'mk-tier-4' },
  5: { title: 'ACE / RAMPAGE', medal: '👑', tierClass: 'mk-tier-5' }
};

function showMultiKillBanner(multiKillCount = 1, victimName = 'Enemy', isHeadshot = false, healAmount = 25) {
  const clampedTier = Math.max(1, Math.min(5, Math.floor(Number(multiKillCount) || 1)));
  const tier = MULTI_KILL_TIERS[clampedTier] || MULTI_KILL_TIERS[1];
  const cleanVictim = (victimName || 'ENEMY').toUpperCase();
  const hsPrefix = isHeadshot ? '🎯 HS • ' : '';

  if (multikillBanner) {
    multikillBanner.classList.remove('hidden', 'mk-tier-1', 'mk-tier-2', 'mk-tier-3', 'mk-tier-4', 'mk-tier-5');
    void multikillBanner.offsetWidth;
    multikillBanner.classList.add(tier.tierClass);
    if (multikillMedal) multikillMedal.textContent = tier.medal;
    if (multikillTitle) multikillTitle.textContent = tier.title;
    if (multikillSubtitle) {
      multikillSubtitle.textContent = `${ hsPrefix }${ cleanVictim } • +${ healAmount } HP`;
    }
    if (multikillBannerTimer) clearTimeout(multikillBannerTimer);
    multikillBannerTimer = setTimeout(() => {
      multikillBanner.classList.add('hidden');
    }, 2400);
  }
}

// Helper: [G] Frag Grenade HUD & KeyG Throw Action
function updateGrenadeHud(count) {
  const cleanCount = Math.max(0, Math.floor(Number(count ?? 0)));
  localGrenades = cleanCount;
  if (game) {
    game.grenades = cleanCount;
  }
  if (hudCache.grenades === cleanCount) return;
  hudCache.grenades = cleanCount;

  const isReady = cleanCount > 0;
  if (hudGrenadeCount) {
    hudGrenadeCount.textContent = String(cleanCount);
  }
  if (hudGrenadeStateText) {
    hudGrenadeStateText.textContent = isReady ? 'READY' : 'EMPTY';
  }
  if (hudGrenadeSlot) {
    hudGrenadeSlot.dataset.grenadeCount = String(cleanCount);
    hudGrenadeSlot.classList.toggle('ready', isReady);
    hudGrenadeSlot.classList.toggle('empty', !isReady);
  }
}

function handleThrowGrenadeRequest(customPayload = null) {
  if (!game.inMatch || !game.alive) return;
  const isModalOpen =
    !pauseModal.classList.contains('hidden') ||
    (loadoutModal && !loadoutModal.classList.contains('hidden')) ||
    !deathOverlay.classList.contains('hidden') ||
    !matchEndModal.classList.contains('hidden');
  if (isModalOpen) return;

  const now = performance.now();
  if (now - lastGrenadeThrowAt < 250) return;

  if (localGrenades <= 0) {
    lastGrenadeThrowAt = now;
    sfx.playDryFire?.();
    showCenterBanner('💣 HẾT LỰU ĐẠN');
    return;
  }

  lastGrenadeThrowAt = now;
  updateGrenadeHud(localGrenades - 1);

  const yaw = typeof customPayload?.yaw === 'number' ? customPayload.yaw : Number(game.yaw || 0);
  const pitch = typeof customPayload?.pitch === 'number' ? customPayload.pitch : Number(game.pitch || 0);
  const dir = customPayload?.dir || {
    x: -Math.sin(yaw) * Math.cos(pitch),
    y: Math.sin(pitch),
    z: -Math.cos(yaw) * Math.cos(pitch)
  };
  const origin = customPayload?.origin || {
    x: game.camera?.position?.x ?? game.position.x,
    y: game.camera?.position?.y ?? (game.position.y + 1.5),
    z: game.camera?.position?.z ?? game.position.z
  };

  sfx.playGrenadeThrow?.();
  if (!game.grenadeThrowUntil || game.grenadeThrowUntil <= now) {
    game.triggerLocalGrenadeThrow?.({ yaw, pitch, origin, dir });
  }
  socket.emit('throwGrenade', {
    yaw,
    pitch,
    origin,
    dir
  });
}

// Helper: Copy Shareable Room Link
function getShareableRoomUrl(code) {
  const url = new URL(window.location.href);
  url.searchParams.set('room', code);
  return url.toString();
}

async function copyInviteLinkToClipboard() {
  if (!activeRoomCode) return;
  const shareUrl = getShareableRoomUrl(activeRoomCode);
  try {
    await navigator.clipboard.writeText(shareUrl);
    showToast(`🔗 Đã copy link #${ activeRoomCode }`);
  } catch {
    pauseInviteUrl.select();
    document.execCommand('copy');
    showToast(`🔗 Đã copy link #${ activeRoomCode }`);
  }
}

// Helper: Update HUD Health (diff-cached to avoid redundant style recalculations)
function updateHpHud(hp) {
  const cleanHp = Math.max(0, Math.min(100, Math.round(hp)));
  if (hudCache.hp === cleanHp) return;
  hudCache.hp = cleanHp;

  hudHpValue.textContent = String(cleanHp);
  hudHpBar.style.width = `${ cleanHp }%`;

  if (cleanHp > 55) {
    hudHpValue.style.color = '#22c55e';
    hudHpBar.style.background = 'linear-gradient(90deg, #22c55e, #4ade80)';
  } else if (cleanHp > 25) {
    hudHpValue.style.color = '#f59e0b';
    hudHpBar.style.background = 'linear-gradient(90deg, #f59e0b, #fbbf24)';
  } else {
    hudHpValue.style.color = '#ef4444';
    hudHpBar.style.background = 'linear-gradient(90deg, #ef4444, #f87171)';
  }
}

// Helper: 1.5s Spawn Protection HUD Shield Indicator
function clearSpawnProtectionHud() {
  if (spawnShieldInterval) {
    clearInterval(spawnShieldInterval);
    spawnShieldInterval = null;
  }
  if (spawnShieldTimeout) {
    clearTimeout(spawnShieldTimeout);
    spawnShieldTimeout = null;
  }
  if (spawnShieldOverlay) spawnShieldOverlay.classList.add('hidden');
  if (spawnShieldBadge) spawnShieldBadge.classList.add('hidden');
  if (hudHpCard) hudHpCard.classList.remove('spawn-protected');
}

function triggerSpawnProtectionHud(durationMs = MATCH_CONFIG.SPAWN_PROTECTION_MS || 1500) {
  clearSpawnProtectionHud();
  const cleanDuration = Math.max(100, Number(durationMs) || 1500);
  const expiresAt = performance.now() + cleanDuration;

  if (spawnShieldOverlay) spawnShieldOverlay.classList.remove('hidden');
  if (spawnShieldBadge) spawnShieldBadge.classList.remove('hidden');
  if (hudHpCard) hudHpCard.classList.add('spawn-protected');
  if (spawnShieldTimerEl) {
    spawnShieldTimerEl.textContent = `${ (cleanDuration / 1000).toFixed(1) }s`;
  }

  spawnShieldInterval = setInterval(() => {
    const remMs = Math.max(0, expiresAt - performance.now());
    if (spawnShieldTimerEl) {
      spawnShieldTimerEl.textContent = `${ (remMs / 1000).toFixed(1) }s`;
    }
    if (remMs <= 0) {
      clearSpawnProtectionHud();
    }
  }, 80);

  spawnShieldTimeout = setTimeout(() => {
    clearSpawnProtectionHud();
  }, cleanDuration + 30);
}

// Helper: Update 3-Slot Hotbar Labels & Active Weapon HUD
function syncHotbarSlotsHud() {
  const pCfg = WEAPONS[selectedLoadout.primary] || WEAPONS.rifle;
  const sCfg = WEAPONS[selectedLoadout.secondary] || WEAPONS.pistol;
  const mCfg = WEAPONS[selectedLoadout.melee] || WEAPONS.knife;

  if (hotbarSlot1) hotbarSlot1.dataset.slot = pCfg.id;
  if (hotbarSlot2) hotbarSlot2.dataset.slot = sCfg.id;
  if (hotbarSlot3) hotbarSlot3.dataset.slot = mCfg.id;
  if (hotbarName1) hotbarName1.textContent = pCfg.name;
  if (hotbarName2) hotbarName2.textContent = sCfg.name;
  if (hotbarName3) hotbarName3.textContent = mCfg.name;
}

function updateWeaponHud(weaponId, currentAmmo, reserveAmmo) {
  const cfg = WEAPONS[weaponId] || WEAPONS.rifle;
  hudWeaponName.textContent = cfg.name;
  hudWeaponRole.textContent = cfg.category || cfg.categoryLabel || '';

  const ammoBlock = hudAmmoCurrent.closest('.weapon-ammo-block');
  if (cfg.isMelee || cfg.infiniteAmmo) {
    hudAmmoCurrent.textContent = '∞';
    hudAmmoMag.textContent = '∞';
    hudAmmoCurrent.classList.remove('low-ammo', 'ammo-empty');
    hudAmmoMag.classList.remove('ammo-empty');
    ammoBlock?.classList.remove('ammo-empty-box');
  } else {
    const cleanCur = Math.max(0, Number(currentAmmo ?? cfg.magSize));
    const cleanRes = Math.max(0, Number(reserveAmmo ?? cfg.reserveAmmo ?? cfg.magSize));
    const isTotalEmpty = cleanCur === 0 && cleanRes === 0;
    hudAmmoCurrent.textContent = String(cleanCur);
    hudAmmoMag.textContent = String(cleanRes);
    hudAmmoCurrent.classList.toggle('low-ammo', !isTotalEmpty && cleanCur <= Math.max(1, Math.ceil(cfg.magSize * 0.25)));
    hudAmmoCurrent.classList.toggle('ammo-empty', isTotalEmpty);
    hudAmmoMag.classList.toggle('ammo-empty', isTotalEmpty);
    ammoBlock?.classList.toggle('ammo-empty-box', isTotalEmpty);
  }

  syncHotbarSlotsHud();
  const slots = hudWeaponHotbar.querySelectorAll('.hotbar-slot[data-slot-num]');
  slots.forEach((slot) => {
    slot.classList.toggle('active', slot.dataset.slot === weaponId);
  });
}

// Render [B] Loadout Selection Modal Cards with Compact Spec Bars
function renderLoadoutModal() {
  if (!loadoutPrimaryGrid || !loadoutSecondaryGrid) return;

  const buildWeaponCardHtml = (wId, isSelected, slotTag) => {
    const w = WEAPONS[wId];
    if (!w) return '';
    const st = w.stats || { damage: 70, fireRate: 70, recoilControl: 70, mobility: 70 };
    const ammoTag = w.magSize > 1 ? `${ w.magSize }/${ w.reserveAmmo ?? w.magSize * 3 }` : 'MELEE';
    return `
      <button type="button" class="weapon-option ${ isSelected ? 'active' : '' }" data-loadout-weapon="${ w.id }" data-loadout-slot="${ w.slot }">
        <div class="weapon-opt-top">
          <span class="weapon-key">${ slotTag || w.category }</span>
          <span class="weapon-dmg-pill">${ w.damage } DMG • ${ ammoTag }</span>
        </div>
        <span class="weapon-name">${ w.name }</span>
        <div class="weapon-spec-bars" aria-hidden="true">
          <span class="spec-chip"><i>DMG</i><b style="--pct:${ st.damage }%"></b></span>
          <span class="spec-chip"><i>ROF</i><b style="--pct:${ st.fireRate }%"></b></span>
          <span class="spec-chip"><i>CTL</i><b style="--pct:${ st.recoilControl }%"></b></span>
        </div>
      </button>
    `;
  };

  loadoutPrimaryGrid.innerHTML = PRIMARY_WEAPONS.map((wId) =>
    buildWeaponCardHtml(wId, selectedLoadout.primary === wId, WEAPONS[wId]?.category)
  ).join('');

  const secondaryHtml = SECONDARY_WEAPONS.map((wId) =>
    buildWeaponCardHtml(wId, selectedLoadout.secondary === wId, 'PHỤ [2]')
  ).join('');
  const meleeHtml = buildWeaponCardHtml('knife', true, 'DAO [3]');
  loadoutSecondaryGrid.innerHTML = secondaryHtml + meleeHtml;
}

function toggleLoadoutModal(forceOpen = null) {
  if (!game.inMatch || !loadoutModal) return;
  const isCurrentlyHidden = loadoutModal.classList.contains('hidden');
  const shouldOpen = forceOpen !== null ? forceOpen : isCurrentlyHidden;

  if (shouldOpen) {
    renderLoadoutModal();
    pauseModal.classList.add('hidden');
    loadoutModal.classList.remove('hidden');
    game.exitPointerLock();
  } else {
    loadoutModal.classList.add('hidden');
    if (deathOverlay.classList.contains('hidden') && matchEndModal.classList.contains('hidden')) {
      game.requestPointerLock();
    }
  }
}

function syncLobbyWeaponSelectionUi(weaponId) {
  if (!WEAPONS[weaponId]) return;
  if (weaponGrid) {
    weaponGrid.querySelectorAll('.weapon-option').forEach((el) => {
      el.classList.toggle('active', el.dataset.weapon === weaponId);
    });
  }
  if (showcaseWeaponName) {
    showcaseWeaponName.textContent = WEAPONS[weaponId].name;
  }
}

function syncLobbyMapSelectionUi(mapId) {
  if (mapGrid) {
    mapGrid.querySelectorAll('.map-option').forEach((el) => {
      el.classList.toggle('active', el.dataset.map === mapId);
    });
  }
  if (pauseMapSelect) {
    pauseMapSelect.value = mapId;
  }
}

function applySelectedLoadoutAndNotify() {
  game.setLoadout(selectedLoadout);
  syncHotbarSlotsHud();
  syncLobbyWeaponSelectionUi(selectedLoadout.primary);
  saveUserPrefs({
    primaryWeapon: selectedLoadout.primary,
    secondaryWeapon: selectedLoadout.secondary
  });
  socket.emit('updateLoadout', selectedLoadout);
  renderLoadoutModal();
}

if (loadoutPrimaryGrid) {
  loadoutPrimaryGrid.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-loadout-weapon]');
    if (!btn) return;
    const wId = btn.dataset.loadoutWeapon;
    if (WEAPONS[wId]?.slot === 1) {
      selectedLoadout.primary = wId;
      selectedStartingWeapon = wId;
      game.setLobbyWeapon(wId);
      applySelectedLoadoutAndNotify();
    }
  });
}

if (loadoutSecondaryGrid) {
  loadoutSecondaryGrid.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-loadout-weapon]');
    if (!btn) return;
    const wId = btn.dataset.loadoutWeapon;
    if (WEAPONS[wId]?.slot === 2) {
      selectedLoadout.secondary = wId;
      applySelectedLoadoutAndNotify();
    }
  });
}

if (btnSaveLoadout) {
  btnSaveLoadout.addEventListener('click', () => {
    applySelectedLoadoutAndNotify();
    toggleLoadoutModal(false);
    showToast(`🎒 ${ WEAPONS[selectedLoadout.primary].name } + ${ WEAPONS[selectedLoadout.secondary].name }`);
  });
}

if (btnOpenLoadoutDeath) {
  btnOpenLoadoutDeath.addEventListener('click', () => {
    toggleLoadoutModal(true);
  });
}

if (btnHudLoadout) {
  btnHudLoadout.addEventListener('click', () => {
    toggleLoadoutModal(true);
  });
}

// Helper: Update HUD Map Name & Selectors
function updateMapHud(mapId) {
  const mapCfg = getMapConfig(mapId);
  if (hudMapName) hudMapName.textContent = mapCfg.name;
  if (sbMapName) sbMapName.textContent = mapCfg.name;
  if (pauseMapSelect) pauseMapSelect.value = mapCfg.id;
}

function applyRestoredUserPrefs() {
  isRestoringPrefs = true;
  try {
    // 1. Player Name & Showcase Callsign
    if (playerNameInput) {
      playerNameInput.value = userPrefs.playerName;
    }
    if (showcaseOperatorName) {
      showcaseOperatorName.textContent = (userPrefs.playerName.trim() || 'STRIKER').toUpperCase();
    }

    // 2. Primary & Secondary Weapons (Lobby Grid, 3D Showcase, Hotbar & Loadout Modal)
    selectedStartingWeapon = userPrefs.primaryWeapon;
    selectedLoadout.primary = userPrefs.primaryWeapon;
    selectedLoadout.secondary = userPrefs.secondaryWeapon;
    syncLobbyWeaponSelectionUi(selectedStartingWeapon);
    game.setLoadout(selectedLoadout, selectedStartingWeapon);
    game.setLobbyWeapon(selectedStartingWeapon);
    syncHotbarSlotsHud();
    renderLoadoutModal();

    // 3. Operator Camo / Rig Trim Swatch & 3D Showcase Operator Color
    selectedOperatorColor = userPrefs.operatorColor;
    game.setLobbyOperatorColor(selectedOperatorColor);
    if (operatorColorSwatches) {
      operatorColorSwatches.querySelectorAll('.color-swatch').forEach((el) => {
        el.classList.toggle('active', Number(el.dataset.color) === selectedOperatorColor);
      });
    }

    // 4. Selected Combat Sector Map
    selectedMapId = userPrefs.selectedMap;
    syncLobbyMapSelectionUi(selectedMapId);
    if (selectedMapId !== DEFAULT_MAP_ID) {
      game.loadMap(selectedMapId);
    }
    updateMapHud(selectedMapId);

    // 5. Mouse Sensitivity
    if (sensSlider) {
      sensSlider.value = String(userPrefs.sensitivity);
    }
    if (sensValue) {
      sensValue.textContent = userPrefs.sensitivity.toFixed(1);
    }
    game.sensitivity = userPrefs.sensitivity;
    game.mouseSensitivity = userPrefs.sensitivity;

    // 7. Sound Effects Enabled
    if (soundCheckbox) {
      soundCheckbox.checked = Boolean(userPrefs.soundEnabled);
    }
    sfx.enabled = Boolean(userPrefs.soundEnabled);

    saveUserPrefs();
  } finally {
    isRestoringPrefs = false;
  }
}

applyRestoredUserPrefs();

function formatTime(sec) {
  const s = Math.max(0, Math.floor(sec));
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${ String(m).padStart(2, '0') }:${ String(rem).padStart(2, '0') }`;
}

// Join Room Action
function requestJoinRoom({ mode = 'public', roomCode = '' }) {
  lobbyError.classList.add('hidden');
  if (!socket.connected) {
    lobbyError.textContent = `${ SERVER_UNREACHABLE_MESSAGE }. Vui lòng đợi hoặc tải lại trang.`;
    lobbyError.classList.remove('hidden');
    return;
  }
  const rawName = playerNameInput.value.trim();
  const name = (rawName.replace(/[<>&"'`]/g, '').trim().slice(0, 16)) || userPrefs.playerName || 'Striker';

  selectedLoadout.primary = selectedStartingWeapon;
  saveUserPrefs({
    playerName: name,
    primaryWeapon: selectedStartingWeapon,
    secondaryWeapon: selectedLoadout.secondary,
    operatorColor: selectedOperatorColor,
    selectedMap: selectedMapId
  });

  sfx.ensureContext();

  lastJoinPayload = {
    name,
    roomCode,
    mode,
    color: selectedOperatorColor,
    weapon: selectedStartingWeapon,
    loadout: selectedLoadout,
    mapId: selectedMapId
  };
  socket.emit('joinRoom', lastJoinPayload);
}

// Lobby Event Listeners
const handlePlayerNamePersist = () => {
  const trimmed = playerNameInput.value.replace(/[<>&"'`]/g, '').trim().slice(0, 16);
  if (showcaseOperatorName) {
    showcaseOperatorName.textContent = (trimmed || 'STRIKER').toUpperCase();
  }
  if (trimmed) {
    saveUserPrefs({ playerName: trimmed });
  }
};
playerNameInput.addEventListener('input', handlePlayerNamePersist);
playerNameInput.addEventListener('change', handlePlayerNamePersist);

weaponGrid.addEventListener('click', (e) => {
  const btn = e.target.closest('.weapon-option');
  if (!btn) return;
  selectedStartingWeapon = btn.dataset.weapon;
  selectedLoadout.primary = selectedStartingWeapon;
  syncLobbyWeaponSelectionUi(selectedStartingWeapon);
  game.setLoadout(selectedLoadout);
  game.setLobbyWeapon(selectedStartingWeapon);
  syncHotbarSlotsHud();
  saveUserPrefs({ primaryWeapon: selectedStartingWeapon });
});

// Interactive 3D Humanoid Showcase Turntable & Controls in Lobby
if (operatorDragZone) {
  let isDraggingShowcase = false;
  let lastDragX = 0;

  operatorDragZone.addEventListener('pointerdown', (e) => {
    isDraggingShowcase = true;
    lastDragX = e.clientX;
    game.lobbyAutoRotate = false;
    btnShowcaseRotate?.classList.remove('active');
    operatorDragZone.setPointerCapture?.(e.pointerId);
  });

  operatorDragZone.addEventListener('pointermove', (e) => {
    if (!isDraggingShowcase) return;
    const dx = e.clientX - lastDragX;
    lastDragX = e.clientX;
    game.rotateLobbyOperator(dx * 0.011);
  });

  const endDrag = () => {
    isDraggingShowcase = false;
  };
  operatorDragZone.addEventListener('pointerup', endDrag);
  operatorDragZone.addEventListener('pointercancel', endDrag);
}

if (operatorColorSwatches) {
  operatorColorSwatches.addEventListener('click', (e) => {
    const sw = e.target.closest('.color-swatch');
    if (!sw) return;
    const hexVal = Number(sw.dataset.color);
    if (!Number.isNaN(hexVal)) {
      selectedOperatorColor = hexVal;
      game.setLobbyOperatorColor(hexVal);
      operatorColorSwatches.querySelectorAll('.color-swatch').forEach((el) => {
        el.classList.toggle('active', el === sw);
      });
      saveUserPrefs({ operatorColor: hexVal });
    }
  });
}

if (btnShowcaseWalk) {
  btnShowcaseWalk.addEventListener('click', () => {
    const walking = game.toggleLobbyWalk();
    btnShowcaseWalk.classList.toggle('active', walking);
  });
}

if (btnShowcaseCrouch) {
  btnShowcaseCrouch.addEventListener('click', () => {
    const crouching = game.toggleLobbyCrouch();
    btnShowcaseCrouch.classList.toggle('active', crouching);
  });
}

if (btnShowcaseFire) {
  btnShowcaseFire.addEventListener('click', () => {
    sfx.ensureContext();
    sfx.playShot(selectedStartingWeapon || 'rifle', 0.72);
    game.triggerLobbyTestFire();
  });
}

if (btnShowcaseRotate) {
  btnShowcaseRotate.addEventListener('click', () => {
    game.lobbyAutoRotate = !game.lobbyAutoRotate;
    btnShowcaseRotate.classList.toggle('active', game.lobbyAutoRotate);
  });
}

if (mapGrid) {
  mapGrid.addEventListener('click', (e) => {
    const btn = e.target.closest('.map-option');
    if (!btn) return;
    selectedMapId = btn.dataset.map;
    syncLobbyMapSelectionUi(selectedMapId);
    // Live 3D map preview in the lobby background
    game.loadMap(selectedMapId);
    updateMapHud(selectedMapId);
    saveUserPrefs({ selectedMap: selectedMapId });
  });
}

btnJoinInvited.addEventListener('click', () => {
  if (invitedRoomParam) {
    requestJoinRoom({ mode: 'private', roomCode: invitedRoomParam });
  }
});

btnQuickPlay.addEventListener('click', () => {
  requestJoinRoom({ mode: 'public', roomCode: '' });
});

btnCreatePrivate.addEventListener('click', () => {
  requestJoinRoom({ mode: 'private', roomCode: '' });
});

btnJoinCode.addEventListener('click', () => {
  const code = roomCodeInput.value.trim().toUpperCase();
  if (!code) {
    lobbyError.textContent = 'Nhập mã phòng 6 ký tự.';
    lobbyError.classList.remove('hidden');
    return;
  }
  requestJoinRoom({ mode: 'private', roomCode: code });
});

roomCodeInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') btnJoinCode.click();
});

btnCopyLinkHud.addEventListener('click', () => copyInviteLinkToClipboard());
btnCopyLinkPause.addEventListener('click', () => copyInviteLinkToClipboard());

btnResume.addEventListener('click', () => {
  pauseModal.classList.add('hidden');
  if (loadoutModal) loadoutModal.classList.add('hidden');
  game.requestPointerLock();
});

btnLeaveRoom.addEventListener('click', () => {
  socket.emit('leaveRoom');
  activeRoomCode = '';
  game.inMatch = false;
  game.isAiming = false;
  unlockGameplayKeys();
  game.exitPointerLock();
  game.clearAllRemotePlayers();
  game.clearDroppedWeapons();
  game.clearGrenades?.();
  sniperScope.classList.add('hidden');
  opticScope?.classList.add('hidden');
  opticScope?.classList.remove('optic-holo', 'optic-reddot');
  crosshair.classList.remove('hidden', 'aiming');
  hudCache.chAiming = false;
  pauseModal.classList.add('hidden');
  if (loadoutModal) loadoutModal.classList.add('hidden');
  deathOverlay.classList.add('hidden');
  matchEndModal.classList.add('hidden');
  hudScreen.classList.add('hidden');
  lobbyScreen.classList.remove('hidden');
  fetchActiveRooms();
});

if (pauseMapSelect) {
  pauseMapSelect.addEventListener('change', () => {
    selectedMapId = pauseMapSelect.value;
    syncLobbyMapSelectionUi(selectedMapId);
    saveUserPrefs({ selectedMap: selectedMapId });
    socket.emit('changeMap', { mapId: pauseMapSelect.value });
  });
}

const handleSensSliderChange = () => {
  const val = Math.max(0.3, Math.min(2.5, Math.round(Number(sensSlider.value) * 10) / 10));
  sensValue.textContent = val.toFixed(1);
  game.sensitivity = val;
  game.mouseSensitivity = val;
  saveUserPrefs({ sensitivity: val });
};
sensSlider.addEventListener('input', handleSensSliderChange);
sensSlider.addEventListener('change', handleSensSliderChange);

soundCheckbox.addEventListener('change', () => {
  sfx.enabled = soundCheckbox.checked;
  saveUserPrefs({ soundEnabled: soundCheckbox.checked });
});

// Graphics quality selector (lobby + pause menu, Tự động / Thấp / Vừa / Cao) -------------------------------------------
const QUALITY_LABELS = { low: 'Thấp', medium: 'Vừa', high: 'Cao' };
const qualitySelects = ['lobby-quality-select', 'pause-quality-select']
  .map((id) => document.getElementById(id))
  .filter(Boolean);
const qualityHints = ['lobby-quality-hint', 'pause-quality-hint']
  .map((id) => document.getElementById(id))
  .filter(Boolean);
const bootAntialias = game.quality.antialias;
let qualityNotice = '';

function renderQualityUi() {
  const tierLabel = QUALITY_LABELS[game.tier] || game.tier;
  let text =
    game.qualityChoice === 'auto'
      ? `Tự động: máy được nhận diện ở mức ${tierLabel}.`
      : `Đang dùng mức ${tierLabel}.`;
  if (qualityNotice) text += ` ${qualityNotice}`;
  for (const sel of qualitySelects) sel.value = game.qualityChoice;
  for (const el of qualityHints) el.textContent = text;
}

function handleQualityChange(choice) {
  const info = game.applyQuality(choice);
  const notes = [];
  if (info.pendingMapRebuild) notes.push('Chi tiết mô hình áp dụng đầy đủ khi đổi bản đồ / ván sau.');
  if (Boolean(info.preset.antialias) !== Boolean(bootAntialias)) notes.push('Khử răng cưa cần tải lại trang.');
  qualityNotice = notes.join(' ');
  renderQualityUi();
}

for (const sel of qualitySelects) {
  sel.addEventListener('change', () => handleQualityChange(sel.value));
}
renderQualityUi();

// Asset loading progress: only visible when preloading glTF props + PBR textures takes a noticeable time
{
  const box = document.getElementById('asset-loading');
  const text = document.getElementById('asset-loading-text');
  const fill = document.getElementById('asset-loading-fill');
  let showTimer = null;
  let finished = false;
  const onProgress = ({ loaded, total }) => {
    if (text) text.textContent = `Đang tải đồ họa… ${loaded}/${total}`;
    if (fill) fill.style.width = total ? `${Math.round((loaded / total) * 100)}%` : '0%';
  };
  showTimer = setTimeout(() => {
    if (!finished) box?.classList.remove('hidden');
  }, 450);
  game
    .preloadAssets(onProgress)
    .catch(() => {})
    .finally(() => {
      finished = true;
      clearTimeout(showTimer);
      box?.classList.add('hidden');
    });
}

// Active Rooms Browser Fetcher
async function fetchActiveRooms() {
  try {
    const rooms = await netClient.fetchRooms();

    if (rooms.length === 0) {
      activeRoomsList.innerHTML = `<div class="rooms-empty">Chưa có phòng đang mở.</div>`;
      return;
    }

    activeRoomsList.innerHTML = rooms
      .map(
        (r) => `
        <div class="room-item">
          <div>
            <span class="room-item-code">#${ r.code }</span>
            <span> • ${ r.mapName || 'CYBER CITADEL' } (${ r.total }/${ r.maxPlayers })</span>
          </div>
          <button class="room-item-join" data-code="${ r.code }">VÀO</button>
        </div>
      `
      )
      .join('');
  } catch {
    activeRoomsList.innerHTML = `<div class="rooms-empty">Không thể tải danh sách phòng.</div>`;
  }
}

activeRoomsList.addEventListener('click', (e) => {
  const btn = e.target.closest('.room-item-join');
  if (!btn) return;
  requestJoinRoom({ mode: 'public', roomCode: btn.dataset.code });
});

btnRefreshRooms.addEventListener('click', fetchActiveRooms);
fetchActiveRooms();

// Render Scoreboard Table
function renderScoreboard(players) {
  const sorted = [...players].sort((a, b) => {
    if (b.kills !== a.kills) return b.kills - a.kills;
    return a.deaths - b.deaths;
  });

  scoreboardBody.innerHTML = sorted
    .map((p, i) => {
      const kd = p.deaths === 0 ? p.kills.toFixed(1) : (p.kills / p.deaths).toFixed(2);
      const isMe = p.id === game.localId;
      return `
        <tr class="${ isMe ? 'sb-row-me' : '' }">
          <td>${ i + 1 }</td>
          <td>${ p.name } ${ isMe ? '(Bạn)' : '' }</td>
          <td>${ p.kills }</td>
          <td>${ p.deaths }</td>
          <td>${ kd }</td>
          <td>${ p.streak }🔥</td>
        </tr>
      `;
    })
    .join('');
}

// Add CS:GO-style Top-Right Kill Feed Entry
function addKillFeedItem({ killerId, killerName, victimId, victimName, weapon, weaponName, isHeadshot }) {
  const item = document.createElement('div');
  const involvesMe = killerId === game.localId || victimId === game.localId;
  item.className = `kill-item${ involvesMe ? ' kill-item-me' : '' }${ isHeadshot ? ' kill-item-hs' : '' }`;

  const killerSpan = document.createElement('span');
  killerSpan.className = 'kill-name killer-name';
  killerSpan.style.color = killerId === game.localId ? '#facc15' : '#38bdf8';
  killerSpan.textContent = killerName;

  const weaponSpan = document.createElement('span');
  weaponSpan.className = 'kill-weapon-tag';
  const weaponLabel = weaponName || (weapon === 'grenade' ? '💣 FRAG GRENADE' : weapon);
  weaponSpan.textContent = `[${ weaponLabel }]`;

  item.appendChild(killerSpan);
  item.appendChild(weaponSpan);

  if (isHeadshot) {
    const hsSpan = document.createElement('span');
    hsSpan.className = 'kill-hs-tag';
    hsSpan.textContent = '🎯 HS';
    item.appendChild(hsSpan);
  }

  const victimSpan = document.createElement('span');
  victimSpan.className = 'kill-name victim-name';
  victimSpan.style.color = victimId === game.localId ? '#f87171' : '#fca5a5';
  victimSpan.textContent = victimName;
  item.appendChild(victimSpan);

  killFeed.prepend(item);
  while (killFeed.children.length > 6) {
    killFeed.lastElementChild.remove();
  }

  setTimeout(() => {
    item.remove();
  }, 6000);
}

// ======================== SOCKET.IO EVENT HANDLERS ========================

let serverErrorShown = false;
const showServerUnreachable = () => {
  serverErrorShown = true;
  lobbyError.textContent = `${ SERVER_UNREACHABLE_MESSAGE }. Đang thử kết nối lại...`;
  lobbyError.classList.remove('hidden');
};
if (netInitFailed) showServerUnreachable();
socket.on('connect_error', showServerUnreachable);
// A dropped connection in the middle of a match used to be silent (see installRejoinOnReconnect): the client now says so
// and joins the same room again as soon as the socket is back, instead of leaving every opponent frozen in place.
let lastJoinPayload = null;
installRejoinOnReconnect(socket, {
  isInMatch: () => game.inMatch,
  onLost: () => showToast('⚠️ Mất kết nối — đang kết nối lại...'),
  rejoin: () => {
    if (!lastJoinPayload) return;
    // The server removed the old socket's player: stale remote bodies must go, then re-enter the same room
    game.clearAllRemotePlayers();
    socket.emit('joinRoom', { ...lastJoinPayload, roomCode: activeRoomCode || lastJoinPayload.roomCode });
  },
  onReconnected: () => showToast('🔄 Đã kết nối lại — vào lại phòng')
});
socket.on('disconnect', () => {
  if (!game.inMatch) showServerUnreachable();
});
socket.on('connect', () => {
  if (serverErrorShown) {
    serverErrorShown = false;
    lobbyError.classList.add('hidden');
  }
  fetchActiveRooms();
});

socket.on('joinError', ({ message }) => {
  lobbyError.textContent = message;
  lobbyError.classList.remove('hidden');
});

socket.on('roomJoined', (data) => {
  activeRoomCode = data.roomCode;
  game.localId = data.playerId;
  game.inMatch = true;
  game.clearAllRemotePlayers();

  // Load room map geometry & update HUD map indicators
  const roomMapId = data.mapId || selectedMapId || DEFAULT_MAP_ID;
  game.loadMap(roomMapId);
  updateMapHud(roomMapId);

  // Update browser URL with ?room=CODE so copying URL directly from address bar works
  const shareUrl = getShareableRoomUrl(activeRoomCode);
  window.history.replaceState(null, '', `?room=${ activeRoomCode }`);

  hudRoomCode.textContent = `#${ activeRoomCode }`;
  sbRoomCode.textContent = `#${ activeRoomCode }`;
  pauseInviteUrl.value = shareUrl;
  hudKillLimit.textContent = String(data.killLimit || 20);
  hudTimer.textContent = formatTime(data.timeRemaining || 300);

  // Set starting 3-slot loadout & spawn position
  if (data.player.loadout) {
    selectedLoadout = {
      primary: data.player.loadout.primary || selectedLoadout.primary || selectedStartingWeapon,
      secondary: data.player.loadout.secondary || selectedLoadout.secondary || 'pistol',
      melee: data.player.loadout.melee || selectedLoadout.melee || 'knife'
    };
  } else {
    selectedLoadout.primary = data.player.weapon || selectedStartingWeapon;
  }
  game.setLoadout(selectedLoadout, selectedLoadout.primary);
  game.resetNetcode(data.player.moveEpoch); // fresh command sequence for the new server-side player
  game.spawnLocalPlayer(data.player);
  localMultiKillCount = 0;
  lastLocalKillAt = 0;
  clearAdrenalineHealHud();
  multikillBanner?.classList.add('hidden');
  updateHpHud(data.player.hp);
  updateGrenadeHud(data.player.grenades ?? data.player.grenadeCount ?? 1);
  triggerSpawnProtectionHud(data.player.spawnProtectionMs || MATCH_CONFIG.SPAWN_PROTECTION_MS || 1500);
  const wCfg = WEAPONS[game.currentWeapon] || WEAPONS.rifle;
  updateWeaponHud(
    game.currentWeapon,
    game.ammoByWeapon[game.currentWeapon] ?? wCfg.magSize,
    game.reserveAmmoByWeapon[game.currentWeapon] ?? wCfg.reserveAmmo ?? wCfg.magSize
  );

  game.syncPickups(data.pickups || []);
  game.syncDroppedWeapons(data.droppedWeapons || []);
  game.syncGrenades?.(data.activeGrenades || []);
  latestPlayers = data.players || [];
  game.syncPlayersState(latestPlayers);

  // Switch UI from Lobby to HUD & lock pointer
  lobbyScreen.classList.add('hidden');
  pauseModal.classList.add('hidden');
  loadoutModal?.classList.add('hidden');
  deathOverlay.classList.add('hidden');
  matchEndModal.classList.add('hidden');
  hudScreen.classList.remove('hidden');

  game.requestPointerLock();
  showToast(`🎯 Phòng #${ activeRoomCode } • ${ getMapConfig(roomMapId).name }`);
});

socket.on('loadoutUpdated', (data) => {
  if (!game.inMatch) return;
  if (data?.loadout?.pending) {
    // Mid-life loadout swaps are applied on the next respawn (prefs below keep the pending pick)
    showToast('🎒 Trang bị mới sẽ có hiệu lực khi hồi sinh');
  }
  if (data?.loadout) {
    selectedLoadout = {
      primary: data.loadout.primary || selectedLoadout.primary,
      secondary: data.loadout.secondary || selectedLoadout.secondary,
      melee: data.loadout.melee || selectedLoadout.melee
    };
    selectedStartingWeapon = selectedLoadout.primary;
    game.setLoadout(selectedLoadout);
    syncLobbyWeaponSelectionUi(selectedStartingWeapon);
    syncHotbarSlotsHud();
    saveUserPrefs({
      primaryWeapon: data.loadout.pending?.primary || selectedLoadout.primary,
      secondaryWeapon: data.loadout.pending?.secondary || selectedLoadout.secondary
    });
  }
});

socket.on('playerJoined', (data) => {
  if (!game.inMatch || !data?.name) return;
  showToast(`👤 ${ data.name } đã vào phòng`);
});

socket.on('mapChanged', (data) => {
  if (!game.inMatch) return;
  const newMapId = data.mapId || DEFAULT_MAP_ID;
  game.loadMap(newMapId);
  updateMapHud(newMapId);
  game.syncPickups(data.pickups || []);
  game.syncDroppedWeapons(data.droppedWeapons || []);
  game.syncGrenades?.(data.activeGrenades || []);
  latestPlayers = data.players || [];
  game.syncPlayersState(latestPlayers);

  localMultiKillCount = 0;
  lastLocalKillAt = 0;
  clearAdrenalineHealHud();
  multikillBanner?.classList.add('hidden');

  const me = latestPlayers.find((p) => p.id === game.localId);
  if (me) {
    if (respawnInterval) clearInterval(respawnInterval);
    deathOverlay.classList.add('hidden');
    damageOverlay.style.opacity = '0';
    game.spawnLocalPlayer(me);
    updateHpHud(me.hp);
    updateGrenadeHud(me.grenades ?? me.grenadeCount ?? 1);
    triggerSpawnProtectionHud(MATCH_CONFIG.SPAWN_PROTECTION_MS || 1500);
  }
  showToast(`🗺️ ${ data.mapName || getMapConfig(newMapId).name }`);
});

// Server RTT probe: echo straight back so the server can measure round-trip time itself
socket.on('latencyProbe', (t, cb) => cb?.(t));

// Server ended our spawn protection early (we fired / threw a grenade)
socket.on('spawnProtectionEnded', (data) => {
  if (data?.playerId && data.playerId === game.localId) clearSpawnProtectionHud();
});

// Server rejected a host-only action (map): tell the player and restore the controls
socket.on('actionDenied', (data) => {
  if (!game.inMatch) return;
  showToast(`⛔ ${ data?.message || 'Hành động không được phép.' }`);
  if (data?.action === 'changeMap') {
    updateMapHud(game.currentMapConfig?.id || selectedMapId);
  }
});

socket.on('hostChanged', (data) => {
  if (!game.inMatch || !data?.name) return;
  showToast(`👑 ${ data.name } là chủ phòng mới`);
});

// Authoritative movement state for the commands the server has simulated (sent to this player only):
// reconciles the client-side prediction (epoch change = server teleport/respawn => snap)
socket.on('moveAck', (ack) => {
  game.applyMoveAck(ack);
});

// Owner-only secret of the deterministic weapon spread for the new life (the server sends it right before the
// `playerRespawned` broadcast; the first one arrives inside `roomJoined.player.spreadSeed`)
socket.on('selfSeed', (data) => {
  game.setSpreadSeed(data?.spreadSeed);
});

let lastShotRejectToastAt = 0;
const SHOT_REJECT_MESSAGES = {
  ammo: 'Hết đạn — đã đồng bộ lại băng đạn',
  reload: 'Đang nạp đạn — phát bắn bị huỷ',
  rate: 'Nhịp bắn chưa hồi — đã hoàn trả đạn',
  weapon: 'Lệch vũ khí — đã đồng bộ lại',
  seq: 'Lệch thứ tự phát bắn — đã đồng bộ lại',
  dead: 'Đã hạ gục — phát bắn không hợp lệ'
};

// Owner-only shot rejection: refund predicted ammo for `ss`, cancel ghost tracer/recoil, and show a non-spammy warning
socket.on('shotRejected', (data) => {
  if (!game.inMatch || !data) return;
  game.applyShotRejected(data);
  const now = performance.now();
  if (now - lastShotRejectToastAt >= 1800) {
    lastShotRejectToastAt = now;
    const msg = SHOT_REJECT_MESSAGES[data.reason] || 'Phát bắn bị từ chối — đã đồng bộ lại đạn';
    showToast(`⚠️ ${ msg }`);
  }
});

// Owner-only combat/ammo/reload state reconciliation (~8Hz + on state change)
socket.on('selfState', (state) => {
  if (!game.inMatch || !state) return;
  game.applySelfState(state);
});

socket.on('playerLeft', (data) => {
  if (!game.inMatch || !data?.playerId) return;
  latestPlayers = latestPlayers.filter((p) => p.id !== data.playerId);
  game.syncPlayersState(latestPlayers);
});

socket.on('stateUpdate', (snapshot) => {
  if (!game.inMatch) return;
  const remSec = Math.max(0, Math.floor(snapshot.timeRemaining || 0));
  if (hudCache.timerSec !== remSec) {
    hudCache.timerSec = remSec;
    hudTimer.textContent = formatTime(remSec);
  }
  latestPlayers = snapshot.players || [];
  // `snapshot.t` = server timestamp (ms) of this tick: remote players are drawn by snapshot interpolation
  game.syncPlayersState(latestPlayers, snapshot.t);
  if (Array.isArray(snapshot.pickups)) {
    game.syncPickups(snapshot.pickups);
  }
  if (Array.isArray(snapshot.droppedWeapons)) {
    game.syncDroppedWeapons(snapshot.droppedWeapons);
  }
  if (Array.isArray(snapshot.activeGrenades)) {
    game.syncGrenades?.(snapshot.activeGrenades);
  }

  // Find leader and local stats
  let topPlayer = null;
  for (const p of latestPlayers) {
    if (!topPlayer || p.kills > topPlayer.kills) {
      topPlayer = p;
    }
    if (p.id === game.localId) {
      if (hudCache.kills !== p.kills) {
        hudCache.kills = p.kills;
        hudKills.textContent = String(p.kills);
      }
      if (hudCache.deaths !== p.deaths) {
        hudCache.deaths = p.deaths;
        hudDeaths.textContent = String(p.deaths);
      }
      if (hudCache.streak !== p.streak) {
        hudCache.streak = p.streak;
        hudStreak.textContent = String(p.streak);
      }
      const snapGrenades = p.grenades ?? p.grenadeCount;
      if (typeof snapGrenades === 'number') {
        const isThrowInFlight = snapGrenades > localGrenades && (performance.now() - lastGrenadeThrowAt) < 350;
        if (!isThrowInFlight) {
          updateGrenadeHud(snapGrenades);
        }
      }
      updateHpHud(p.hp);
    }
  }

  if (topPlayer) {
    const nextLeaderText = `👑 ${ topPlayer.name } (${ topPlayer.kills }/${ hudKillLimit.textContent })`;
    if (hudCache.leaderText !== nextLeaderText) {
      hudCache.leaderText = nextLeaderText;
      hudLeader.textContent = nextLeaderText;
    }
  }

  if (!scoreboardModal.classList.contains('hidden')) {
    renderScoreboard(latestPlayers);
  }
});

socket.on('shotFired', (data) => {
  if (!game.inMatch || data.shooterId === game.localId) return;

  // Compute distance attenuation for 3D sound
  const dist = Math.hypot(
    data.origin.x - game.position.x,
    data.origin.y - game.position.y,
    data.origin.z - game.position.z
  );
  const vol = Math.max(0.06, 1 - dist / 85);
  sfx.playShot(data.weapon, vol * 0.58);

  const endPt = data.hitPoint || {
    x: data.origin.x + data.dir.x * 55,
    y: data.origin.y + data.dir.y * 55,
    z: data.origin.z + data.dir.z * 55
  };
  game.triggerRemoteShotEffect(data.shooterId, data.weapon, data.origin, endPt);
});

socket.on('damageDealt', (data) => {
  if (!game.inMatch) return;

  if (data.targetId && data.targetId !== game.localId && typeof data.hp === 'number') {
    const rp = game.remotePlayers?.get(data.targetId);
    if (rp) {
      rp.hp = data.hp;
    }
  }

  // We hit an enemy -> Show Distinct Body/Headshot/Kill Hitmarker + Floating 3D/HUD Damage Popup
  if (data.attackerId === game.localId && data.targetId !== game.localId) {
    const isHs = Boolean(data.isHeadshot);
    const isKillHit = typeof data.hp === 'number' && data.hp <= 0;

    hitmarker.classList.remove('hidden');
    if (isHs) {
      hitmarker.classList.add('headshot');
    } else {
      hitmarker.classList.remove('headshot');
    }

    triggerHitmarkerFeedback({
      damage: data.damage,
      isHeadshot: isHs,
      isKill: isKillHit
    });

    if (isHs) {
      sfx.playHeadshotDink?.();
    } else {
      sfx.playHitmarker?.(false);
    }

    game.spawnDamagePopup(data.targetId, data.damage, isHs);
  }

  // Someone hit us -> Flash damage overlay, camera flinch, directional arc & update HP
  if (data.targetId === game.localId) {
    updateHpHud(data.hp);
    game.applyDamageFlinch(data.damage);
    damageOverlay.style.opacity = '0.88';
    setTimeout(() => {
      damageOverlay.style.opacity = data.hp < 30 ? '0.35' : '0';
    }, 180);

    if (data.attackerPos && damageDirIndicator) {
      const dx = data.attackerPos.x - game.position.x;
      const dz = data.attackerPos.z - game.position.z;
      const forwardDot = dx * (-Math.sin(game.yaw)) + dz * (-Math.cos(game.yaw));
      const rightDot = dx * Math.cos(game.yaw) + dz * (-Math.sin(game.yaw));
      const angleDeg = Math.atan2(rightDot, forwardDot) * (180 / Math.PI);

      damageDirIndicator.style.transform = `translate(-50%, -50%) rotate(${ angleDeg.toFixed(1) }deg)`;
      damageDirIndicator.classList.remove('hidden');
      if (damageDirTimer) clearTimeout(damageDirTimer);
      damageDirTimer = setTimeout(() => {
        damageDirIndicator.classList.add('hidden');
      }, 650);
    }
  }
});

socket.on('spawnProtectedHit', (data) => {
  if (!game.inMatch) return;
  if (data.attackerId === game.localId) {
    showCenterBanner('🛡️ MỤC TIÊU BẤT TỬ');
  }
});

socket.on('killEvent', (data) => {
  if (!game.inMatch) return;
  addKillFeedItem(data);

  if (data.victimId && data.victimId !== game.localId) {
    const victimRp = game.remotePlayers?.get(data.victimId);
    if (victimRp) {
      // Not shootable from now on (server rules) but the body stays drawn until the interpolated timeline reaches the
      // death snapshot (Game3D.updateRemotePlayers) instead of vanishing ~one render delay early
      game.markRemoteDead(data.victimId);
    }
  }

  if (data.killerId === game.localId && data.victimId !== game.localId) {
    const now = performance.now();
    if (lastLocalKillAt > 0 && now - lastLocalKillAt <= MULTI_KILL_WINDOW_MS) {
      localMultiKillCount += 1;
    } else {
      localMultiKillCount = 1;
    }
    lastLocalKillAt = now;

    const serverStreak = Number(data.multiKillCount || data.multiKill || data.killerStreak || 0);
    const multiKillCount = Math.max(localMultiKillCount, serverStreak, 1);
    const healAmount = Number(data.healAmount ?? MATCH_CONFIG.KILL_ADRENALINE_HEAL ?? 25) || 25;
    const killerHp = typeof data.killerHp === 'number'
      ? data.killerHp
      : typeof data.newKillerHp === 'number'
        ? data.newKillerHp
        : null;

    if (typeof data.killerStreak === 'number' && hudStreak && hudCache.streak !== data.killerStreak) {
      hudCache.streak = data.killerStreak;
      hudStreak.textContent = String(data.killerStreak);
    }

    const fallbackKillDmg = Number(data.damage) > 0
      ? Number(data.damage)
      : (hudFloatingDmg?.classList.contains('hidden') ? (data.isHeadshot ? 100 : 25) : 0);

    triggerHitmarkerFeedback({
      damage: fallbackKillDmg,
      isHeadshot: Boolean(data.isHeadshot),
      isKill: true
    });
    triggerAdrenalineHealFeedback(healAmount, killerHp);

    sfx.playMultiKillTone?.(multiKillCount);

    showMultiKillBanner(
      multiKillCount,
      data.victimName || 'Enemy',
      Boolean(data.isHeadshot),
      healAmount
    );
  }

  if (data.victimId === game.localId) {
    game.alive = false;
    game.isAiming = false;
    localMultiKillCount = 0;
    lastLocalKillAt = 0;
    lastGrenadeThrowAt = 0;
    clearSpawnProtectionHud();
    clearAdrenalineHealHud();
    multikillBanner?.classList.add('hidden');
    if (weaponPickupPrompt) weaponPickupPrompt.classList.add('hidden');
    sniperScope.classList.add('hidden');
    opticScope?.classList.add('hidden');
    opticScope?.classList.remove('optic-holo', 'optic-reddot');
    crosshair.classList.remove('hidden', 'aiming');
    hudCache.chAiming = false;
    deathKillerName.textContent = data.killerName;
    deathWeaponName.textContent = data.weaponName || (data.weapon === 'grenade' ? 'FRAG GRENADE' : data.weapon);
    deathOverlay.classList.remove('hidden');

    let rem = 3;
    respawnTimerEl.textContent = String(rem);
    if (respawnInterval) clearInterval(respawnInterval);
    respawnInterval = setInterval(() => {
      rem = Math.max(0, rem - 1);
      respawnTimerEl.textContent = String(rem);
    }, 1000);
  }
});

socket.on('playerRespawned', (data) => {
  if (!game.inMatch) return;
  if (data.playerId && data.playerId !== game.localId) {
    const rp = game.remotePlayers?.get(data.playerId);
    if (rp) {
      rp.alive = true;
      rp.hp = typeof data.hp === 'number' ? data.hp : 100;
      if (rp.group) {
        rp.group.position.set(data.x || 0, data.y || 0, data.z || 0);
        rp.group.rotation.y = data.yaw || 0;
        rp.group.visible = true;
      }
      // Respawn: drop the snapshot history of this entity (no interpolation streak from the death position)
      game.resetRemoteInterpolation?.(data.playerId, data.x || 0, data.y || 0, data.z || 0, data.yaw || 0);
      game.rebuildHitboxList?.();
    }
  }
  if (data.playerId === game.localId) {
    if (respawnInterval) clearInterval(respawnInterval);
    deathOverlay.classList.add('hidden');
    damageOverlay.style.opacity = '0';
    localMultiKillCount = 0;
    lastLocalKillAt = 0;
    lastGrenadeThrowAt = 0;
    clearAdrenalineHealHud();
    if (data.loadout) {
      selectedLoadout = {
        primary: data.loadout.primary || selectedLoadout.primary,
        secondary: data.loadout.secondary || selectedLoadout.secondary,
        melee: data.loadout.melee || selectedLoadout.melee
      };
    }
    game.spawnLocalPlayer(data);
    updateHpHud(data.hp);
    updateGrenadeHud(data.grenades ?? data.grenadeCount ?? 1);
    triggerSpawnProtectionHud(data.spawnProtectionMs || MATCH_CONFIG.SPAWN_PROTECTION_MS || 1500);
  }
});

socket.on('grenadeThrown', (data) => {
  if (!game.inMatch || !data) return;
  const payload = data.grenade || data;
  const ownerId = data.ownerId || data.throwerId || data.playerId || payload.ownerId;
  if (ownerId === game.localId && typeof (data.grenades ?? data.grenadesRemaining) === 'number') {
    updateGrenadeHud(data.grenades ?? data.grenadesRemaining);
  } else if (ownerId && ownerId !== game.localId) {
    const gx = Number(payload.x ?? data.x ?? 0);
    const gy = Number(payload.y ?? data.y ?? 0);
    const gz = Number(payload.z ?? data.z ?? 0);
    const dist = Math.hypot(gx - game.position.x, gy - game.position.y, gz - game.position.z);
    if (dist < 32) {
      sfx.playGrenadeThrow?.();
    }
  }
  game.spawnGrenadeProjectile?.(data);
});

socket.on('grenadeExploded', (data) => {
  if (!game.inMatch || !data) return;
  const gx = data.x ?? data.position?.x ?? 0;
  const gy = data.y ?? data.position?.y ?? 0;
  const gz = data.z ?? data.position?.z ?? 0;
  const listenerState = game.getAudioListenerState
    ? game.getAudioListenerState()
    : { x: game.position.x, y: game.position.y, z: game.position.z, yaw: game.yaw };
  const sourcePos = { x: gx, y: gy, z: gz };
  if (typeof sfx.playGrenadeExplosion === 'function') {
    sfx.playGrenadeExplosion(listenerState, sourcePos);
  } else {
    const dist = Math.hypot(gx - game.position.x, gy - game.position.y, gz - game.position.z);
    const vol = Math.max(0.08, 1 - dist / 75);
    sfx.playExplosion?.(vol);
  }
  game.spawnGrenadeExplosion?.(data);
});

socket.on('pickupState', (data) => {
  if (!game.inMatch) return;
  game.updatePickupSingle(data.pickupId, data.active);

  if (data.pickerId && data.pickerId !== game.localId && typeof data.newHp === 'number') {
    const rp = game.remotePlayers?.get(data.pickerId);
    if (rp) {
      rp.hp = data.newHp;
    }
  }

  if (data.pickerId === game.localId && !data.active) {
    sfx.playPickup();
    updateHpHud(data.newHp);
    showCenterBanner('💚 +50 HP');
  }
});

socket.on('weaponDropped', (drop) => {
  if (!game.inMatch || !drop) return;
  game.addDroppedWeapon(drop);
});

socket.on('weaponDropExpired', ({ dropId }) => {
  if (!game.inMatch || !dropId) return;
  game.removeDroppedWeapon(dropId);
});

socket.on('weaponSwapped', (data) => {
  if (!game.inMatch || !data) return;
  if (data.pickedDropId) {
    game.removeDroppedWeapon(data.pickedDropId);
  }
  if (data.playerId === game.localId) {
    selectedLoadout.primary = data.weapon;
    game.applySwappedWeapon(data);
    sfx.playWeaponDrop?.();
    const wCfg = WEAPONS[data.weapon];
    showCenterBanner(`🔫 ${ wCfg ? wCfg.name : data.weapon } (${ data.ammo }/${ data.reserveAmmo })`);
  }
});

socket.on('matchEnded', (data) => {
  if (!game.inMatch) return;
  game.isAiming = false;
  clearSpawnProtectionHud();
  clearAdrenalineHealHud();
  multikillBanner?.classList.add('hidden');
  if (weaponPickupPrompt) weaponPickupPrompt.classList.add('hidden');
  game.exitPointerLock();
  pauseModal.classList.add('hidden');
  deathOverlay.classList.add('hidden');
  sniperScope.classList.add('hidden');
  opticScope?.classList.add('hidden');
  opticScope?.classList.remove('optic-holo', 'optic-reddot');
  crosshair.classList.remove('hidden', 'aiming');
  hudCache.chAiming = false;

  victoryWinnerName.textContent = data.winner?.name || '---';
  victoryWinnerStats.textContent = `${ data.winner?.kills || 0 } Kills • ${ data.winner?.deaths || 0 } Deaths`;

  victoryLeaderboardBody.innerHTML = (data.leaderboard || [])
    .slice(0, 8)
    .map((p, idx) => {
      const kd = p.deaths === 0 ? p.kills.toFixed(1) : (p.kills / p.deaths).toFixed(2);
      return `
        <tr class="${ p.id === game.localId ? 'sb-row-me' : '' }">
          <td>#${ idx + 1 }</td>
          <td>${ p.name } ${ p.id === game.localId ? '(Bạn)' : '' }</td>
          <td>${ p.kills }</td>
          <td>${ p.deaths }</td>
          <td>${ kd }</td>
        </tr>
      `;
    })
    .join('');

  matchEndModal.classList.remove('hidden');

  let countdown = data.nextMatchIn || 10;
  nextMatchCountdown.textContent = String(countdown);
  if (nextMatchInterval) clearInterval(nextMatchInterval);
  nextMatchInterval = setInterval(() => {
    countdown = Math.max(0, countdown - 1);
    nextMatchCountdown.textContent = String(countdown);
  }, 1000);
});

socket.on('matchStarted', (data) => {
  if (!game.inMatch) return;
  if (nextMatchInterval) clearInterval(nextMatchInterval);
  matchEndModal.classList.add('hidden');
  deathOverlay.classList.add('hidden');
  localMultiKillCount = 0;
  lastLocalKillAt = 0;
  lastGrenadeThrowAt = 0;
  clearAdrenalineHealHud();
  multikillBanner?.classList.add('hidden');
  if (data.mapId) {
    game.loadMap(data.mapId);
    updateMapHud(data.mapId);
  }
  game.syncPickups(data.pickups || []);
  game.syncDroppedWeapons(data.droppedWeapons || []);
  game.syncGrenades?.(data.activeGrenades || []);
  latestPlayers = data.players || [];
  game.syncPlayersState(latestPlayers);
  const me = latestPlayers.find((p) => p.id === game.localId);
  if (me) {
    game.spawnLocalPlayer(me);
    updateHpHud(me.hp);
    updateGrenadeHud(me.grenades ?? me.grenadeCount ?? 1);
    triggerSpawnProtectionHud(MATCH_CONFIG.SPAWN_PROTECTION_MS || 1500);
  }
  showCenterBanner('🔥 BẮT ĐẦU');
  game.requestPointerLock();
});

// Periodic Ping Measurement
function measurePing() {
  if (!game.inMatch) return;
  const start = performance.now();
  socket.emit('pingCheck', start, () => {
    const rtt = Math.round(performance.now() - start);
    currentPingMs = rtt;
    hudPing.textContent = String(rtt);
    game.setNetworkRtt?.(rtt); // render clock: adds the one-way latency back into the server-time estimate
  });
}
setInterval(measurePing, 2500);
// The adaptive render delay needs the one-way latency: measure it right after joining instead of waiting 2.5 s
// (3 quick samples; the clock keeps the minimum of the last few)
socket.on('roomJoined', () => {
  for (const delay of [150, 450, 900]) setTimeout(measurePing, delay);
});
