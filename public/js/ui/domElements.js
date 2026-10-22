// Centralized DOM Element References & Pure UI Formatters
// DOM Elements
export const canvasContainer = document.getElementById('canvas-container');
export const toastEl = document.getElementById('toast');

// Lobby Elements
export const lobbyScreen = document.getElementById('lobby-screen');
export const inviteBanner = document.getElementById('invite-banner');
export const inviteRoomCodeEl = document.getElementById('invite-room-code');
export const btnJoinInvited = document.getElementById('btn-join-invited');
export const playerNameInput = document.getElementById('player-name');
export const weaponGrid = document.getElementById('lobby-weapon-grid');
export const mapGrid = document.getElementById('lobby-map-grid');
export const lobbyGameModeGrid = document.getElementById('lobby-game-mode-grid');
export const lobbyError = document.getElementById('lobby-error');
export const btnQuickPlay = document.getElementById('btn-quick-play');
export const btnCreatePrivate = document.getElementById('btn-create-private');
export const lanRoomHint = document.getElementById('lan-room-hint');
export const lanP2pCheckbox = document.getElementById('lan-p2p-checkbox');
export const lanUrlInput = document.getElementById('lan-url-input');
export const btnSaveLanUrl = document.getElementById('btn-save-lan-url');
export const roomCodeInput = document.getElementById('room-code-input');
export const btnJoinCode = document.getElementById('btn-join-code');
export const btnRefreshRooms = document.getElementById('btn-refresh-rooms');
export const activeRoomsList = document.getElementById('active-rooms-list');

// HUD Elements
export const hudScreen = document.getElementById('hud-screen');
export const damageOverlay = document.getElementById('damage-overlay');
export const spawnShieldOverlay = document.getElementById('spawn-shield-overlay');
export const spawnShieldBadge = document.getElementById('spawn-shield-badge');
export const spawnShieldTimerEl = document.getElementById('spawn-shield-timer');
export const hudHpCard = document.getElementById('hud-hp-card');
export const hudHpAdrenalineTag = document.getElementById('hud-hp-adrenaline-tag');
export const damageDirIndicator = document.getElementById('damage-dir-indicator');
export const sniperScope = document.getElementById('sniper-scope');
export const opticScope = document.getElementById('optic-scope');
export const opticTelemetry = document.getElementById('optic-telemetry');
export const crosshair = document.getElementById('crosshair');
export const hitmarker = document.getElementById('hitmarker');
export const hudFloatingDmg = document.getElementById('hud-floating-dmg');
export const hudAdrenalinePop = document.getElementById('hud-adrenaline-pop');
export const multikillBanner = document.getElementById('multikill-banner');
export const multikillMedal = document.getElementById('multikill-medal');
export const multikillTitle = document.getElementById('multikill-title');
export const multikillSubtitle = document.getElementById('multikill-subtitle');
export const centerBanner = document.getElementById('center-banner');
export const hudRoomCode = document.getElementById('hud-room-code');
export const hudMapName = document.getElementById('hud-map-name');
export const btnCopyLinkHud = document.getElementById('btn-copy-link-hud');
export const hudTimer = document.getElementById('hud-timer');
export const hudKillLimit = document.getElementById('hud-kill-limit');
export const hudTeamScore = document.getElementById('hud-team-score');
export const hudScoreAlpha = document.getElementById('hud-score-alpha');
export const hudScoreBravo = document.getElementById('hud-score-bravo');
export const hudLeader = document.getElementById('hud-leader');
export const hudFps = document.getElementById('hud-fps');
export const hudPing = document.getElementById('hud-ping');
export const killFeed = document.getElementById('kill-feed');
export const hudKills = document.getElementById('hud-kills');
export const hudDeaths = document.getElementById('hud-deaths');
export const hudStreak = document.getElementById('hud-streak');
export const hudStance = document.getElementById('hud-stance');
export const hudSpeed = document.getElementById('hud-speed');
export const hudHpValue = document.getElementById('hud-hp-value');
export const hudArmorRow = document.getElementById('hud-armor-row');
export const hudArmorValue = document.getElementById('hud-armor-value');
export const hudArmorBar = document.getElementById('hud-armor-bar');
export const hudActiveBuffs = document.getElementById('hud-active-buffs');
export const hudHpBar = document.getElementById('hud-hp-bar');
export const reloadIndicator = document.getElementById('reload-indicator');
export const reloadText = document.getElementById('reload-text');
export const reloadBarFill = document.getElementById('reload-bar-fill');
export const weaponPickupPrompt = document.getElementById('weapon-pickup-prompt');
export const weaponPickupText = document.getElementById('weapon-pickup-text');
export const weaponPickupTimer = document.getElementById('weapon-pickup-timer');
export const grenadeCookHud = document.getElementById('grenade-cook-hud');
export const grenadeCookTimer = document.getElementById('grenade-cook-timer');
export const grenadeCookBar = document.getElementById('grenade-cook-bar');
export const hudWeaponName = document.getElementById('hud-weapon-name');
export const hudWeaponRole = document.getElementById('hud-weapon-role');
export const hudAmmoCurrent = document.getElementById('hud-ammo-current');
export const hudAmmoMag = document.getElementById('hud-ammo-mag');
export const hudWeaponHotbar = document.getElementById('hud-weapon-hotbar');
export const hotbarSlot1 = document.getElementById('hotbar-slot-1');
export const hotbarSlot2 = document.getElementById('hotbar-slot-2');
export const hotbarSlot3 = document.getElementById('hotbar-slot-3');
export const hotbarName1 = document.getElementById('hotbar-name-1');
export const hotbarName2 = document.getElementById('hotbar-name-2');
export const hotbarName3 = document.getElementById('hotbar-name-3');
export const hudGrenadeSlot = document.getElementById('hud-grenade-slot');
export const hudGrenadeStatus = document.getElementById('hud-grenade-status');
export const hudGrenadeCount = document.getElementById('hud-grenade-count');
export const hudGrenadeStateText = document.getElementById('hud-grenade-state-text');
export const btnHudLoadout = document.getElementById('btn-hud-loadout');

// Lobby 3D Operator Showcase Elements
export const operatorDragZone = document.getElementById('operator-drag-zone');
export const showcaseOperatorName = document.getElementById('showcase-operator-name');
export const showcaseWeaponName = document.getElementById('showcase-weapon-name');
export const operatorColorSwatches = document.getElementById('operator-color-swatches');
export const btnShowcaseWalk = document.getElementById('btn-showcase-walk');
export const btnShowcaseCrouch = document.getElementById('btn-showcase-crouch');
export const btnShowcaseFire = document.getElementById('btn-showcase-fire');
export const btnShowcaseRotate = document.getElementById('btn-showcase-rotate');

// Modals
export const deathOverlay = document.getElementById('death-overlay');
export const deathKillerName = document.getElementById('death-killer-name');
export const deathWeaponName = document.getElementById('death-weapon-name');
export const respawnTimerEl = document.getElementById('respawn-timer');
export const btnOpenLoadoutDeath = document.getElementById('btn-open-loadout-death');

export const loadoutModal = document.getElementById('loadout-modal');
export const loadoutPrimaryGrid = document.getElementById('loadout-primary-grid');
export const loadoutSecondaryGrid = document.getElementById('loadout-secondary-grid');
export const btnSaveLoadout = document.getElementById('btn-save-loadout');

export const pauseModal = document.getElementById('pause-modal');
export const pauseInviteUrl = document.getElementById('pause-invite-url');
export const btnCopyLinkPause = document.getElementById('btn-copy-link-pause');
export const pauseMapSelect = document.getElementById('pause-map-select');
export const sensSlider = document.getElementById('sens-slider');
export const sensValue = document.getElementById('sens-value');
export const soundCheckbox = document.getElementById('sound-checkbox');
export const btnResume = document.getElementById('btn-resume');
export const btnLeaveRoom = document.getElementById('btn-leave-room');

export const scoreboardModal = document.getElementById('scoreboard-modal');
export const sbRoomCode = document.getElementById('sb-room-code');
export const sbMapName = document.getElementById('sb-map-name');
export const scoreboardBody = document.getElementById('scoreboard-body');

export const teamLobbyModal = document.getElementById('team-lobby-modal');
export const teamLobbyRoomCode = document.getElementById('team-lobby-room-code');
export const teamLobbyMapName = document.getElementById('team-lobby-map-name');
export const teamLobbyKillLimit = document.getElementById('team-lobby-kill-limit');
export const btnCopyTeamLobbyLink = document.getElementById('btn-copy-team-lobby-link');
export const teamAlphaCount = document.getElementById('team-alpha-count');
export const teamBravoCount = document.getElementById('team-bravo-count');
export const teamAlphaRoster = document.getElementById('team-alpha-roster');
export const teamBravoRoster = document.getElementById('team-bravo-roster');
export const teamLobbyStatus = document.getElementById('team-lobby-status');
export const btnSwitchTeam = document.getElementById('btn-switch-team');
export const btnTeamReady = document.getElementById('btn-team-ready');
export const btnStartTeamMatch = document.getElementById('btn-start-team-match');
export const btnLeaveTeamLobby = document.getElementById('btn-leave-team-lobby');

export const matchEndModal = document.getElementById('match-end-modal');
export const victoryWinnerName = document.getElementById('victory-winner-name');
export const victoryWinnerStats = document.getElementById('victory-winner-stats');
export const victoryLeaderboardBody = document.getElementById('victory-leaderboard-body');
export const nextMatchCountdown = document.getElementById('next-match-countdown');

// Detect ?room=CODE in URL
export const urlParams = new URLSearchParams(window.location.search);
export const invitedRoomParam = (urlParams.get('room') || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
if (invitedRoomParam) {
  inviteBanner.classList.remove('hidden');
  inviteRoomCodeEl.textContent = `#${ invitedRoomParam }`;
  roomCodeInput.value = invitedRoomParam;
}

// True on pages that play in an in-browser LAN room (set by main.js): their share links carry `lan=1` so guests join over WebRTC.
export const lanState = { active: false };

export function getShareableRoomUrl(code) {
  const url = new URL(window.location.href);
  for (const key of ['lanhost', 'name', 'map', 'mode', 'create', 'lan']) url.searchParams.delete(key);
  url.searchParams.set('room', code);
  if (lanState.active) url.searchParams.set('lan', '1');
  return url.toString();
}

export function formatTime(sec) {
  const s = Math.max(0, Math.floor(sec));
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${ String(m).padStart(2, '0') }:${ String(rem).padStart(2, '0') }`;
}

export function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
