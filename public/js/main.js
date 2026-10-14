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
import { createNetworkClient } from './networkAdapter.js';

const netClient = await createNetworkClient();
const socket = netClient.socket;
const sfx = new SoundEffects();

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
const lobbyBotCount = document.getElementById('lobby-bot-count');
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
const damageDirIndicator = document.getElementById('damage-dir-indicator');
const sniperScope = document.getElementById('sniper-scope');
const crosshair = document.getElementById('crosshair');
const hitmarker = document.getElementById('hitmarker');
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
const pauseBotSelect = document.getElementById('pause-bot-select');
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

// Client Application State
let selectedStartingWeapon = 'rifle';
let selectedLoadout = {
  primary: DEFAULT_LOADOUT.primary || 'rifle',
  secondary: DEFAULT_LOADOUT.secondary || 'pistol',
  melee: DEFAULT_LOADOUT.melee || 'knife'
};
let selectedMapId = DEFAULT_MAP_ID || 'cyber_citadel';
let activeRoomCode = '';
let latestPlayers = [];
let hitmarkerTimer = null;
let damageDirTimer = null;
let bannerTimer = null;
let respawnInterval = null;
let nextMatchInterval = null;
let spawnShieldInterval = null;
let spawnShieldTimeout = null;

// Restore saved player name if available
const savedName = localStorage.getItem('polystrike_name');
if (savedName) {
  playerNameInput.value = savedName;
} else {
  playerNameInput.value = `Striker_${ Math.floor(100 + Math.random() * 899) }`;
}
if (showcaseOperatorName) {
  showcaseOperatorName.textContent = (playerNameInput.value.trim() || 'STRIKER').toUpperCase();
}

// Initialize 3D Engine
const game = new Game3D(canvasContainer, {
  onMoveUpdate: (movePayload) => {
    socket.emit('playerMove', movePayload);
  },
  onShoot: (shootPayload) => {
    sfx.playShot(shootPayload.weapon, 0.92);
    socket.emit('shoot', shootPayload);
  },
  onDryFire: () => {
    sfx.playDryFire();
  },
  onReloadStart: (weaponId, reloadMs = 1600, mode = 'empty', currentAmmo = 0, reserveAmmo = 0) => {
    const cfg = WEAPONS[weaponId] || WEAPONS.rifle;
    reloadIndicator.classList.remove('hidden');
    if (reloadText) {
      if (mode === 'shell') {
        reloadText.textContent = `NẠP ĐẠN SHOTGUN (${ currentAmmo }/${ cfg.magSize } • DỰ TRỮ ${ reserveAmmo })...`;
      } else if (mode === 'tactical') {
        reloadText.textContent = 'NẠP ĐẠN CHIẾN THUẬT (NHANH)...';
      } else {
        reloadText.textContent = 'NẠP ĐẠN TOÀN BỘ (LÊN ĐẠN)...';
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
      reloadText.textContent = `NẠP ĐẠN SHOTGUN (${ currentAmmo }/${ cfg.magSize } • DỰ TRỮ ${ reserveAmmo })...`;
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
    reloadIndicator.classList.add('hidden');
    updateWeaponHud(weaponId, currentAmmo, reserveAmmo);
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
      weaponPickupText.textContent = `Vứt súng chính & nhặt ${ wName } (${ dropItem.ammo }/${ dropItem.reserveAmmo })`;
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
    sfx.playWeaponSwitch();
  },
  onAimChange: (isAiming, weaponId) => {
    if (isAiming && weaponId === 'sniper') {
      sniperScope.classList.remove('hidden');
      crosshair.classList.add('hidden');
    } else {
      sniperScope.classList.add('hidden');
      crosshair.classList.remove('hidden');
      crosshair.classList.toggle('aiming', Boolean(isAiming));
    }
  },
  onSpreadUpdate: (effectiveSpread, isAiming) => {
    // Convert angular spread (radians) into pixel gap (2px to 26px)
    const gapPx = Math.max(2, Math.min(26, Math.round(effectiveSpread * 380)));
    crosshair.style.setProperty('--ch-gap', `${ gapPx }px`);
    crosshair.classList.toggle('aiming', Boolean(isAiming));
  },
  onMovementHudUpdate: (stance, speed) => {
    if (hudSpeed) hudSpeed.textContent = speed.toFixed(1);
    if (hudStance) {
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
    showToast(`🔗 Đã sao chép link mời phòng #${ activeRoomCode }!`);
    showCenterBanner(`ĐÃ COPY LINK PHÒNG #${ activeRoomCode }`);
  } catch {
    pauseInviteUrl.select();
    document.execCommand('copy');
    showToast(`🔗 Đã sao chép link mời: ${ shareUrl }`);
  }
}

// Helper: Update HUD Health
function updateHpHud(hp) {
  const cleanHp = Math.max(0, Math.min(100, Math.round(hp)));
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
  hudWeaponRole.textContent = cfg.role;

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

// Render [B] Loadout Selection Modal Cards with Stat Bars
function renderLoadoutModal() {
  if (!loadoutPrimaryGrid || !loadoutSecondaryGrid) return;

  const buildWeaponCardHtml = (wId, isSelected, slotTag) => {
    const w = WEAPONS[wId];
    if (!w) return '';
    const st = w.stats || { damage: 70, fireRate: 70, recoilControl: 70, mobility: 70 };
    const ammoTag = w.magSize > 1 ? `${ w.magSize }/${ w.reserveAmmo ?? w.magSize * 3 } VIÊN` : 'CẬN CHIẾN';
    return `
      <button type="button" class="weapon-option ${ isSelected ? 'active' : '' }" data-loadout-weapon="${ w.id }" data-loadout-slot="${ w.slot }">
        <span class="weapon-key">[${ slotTag || w.category }] • ${ ammoTag }</span>
        <span class="weapon-name">${ w.name }</span>
        <span class="weapon-desc">${ w.role }</span>
        <div class="weapon-stat-bars">
          <div class="weapon-stat-line"><span>DMG ${ w.damage }</span><div class="weapon-stat-track"><div class="weapon-stat-fill" style="width:${ st.damage }%"></div></div></div>
          <div class="weapon-stat-line"><span>TỐC BẮN</span><div class="weapon-stat-track"><div class="weapon-stat-fill" style="width:${ st.fireRate }%"></div></div></div>
          <div class="weapon-stat-line"><span>ỔN ĐỊNH</span><div class="weapon-stat-track"><div class="weapon-stat-fill" style="width:${ st.recoilControl }%"></div></div></div>
          <div class="weapon-stat-line"><span>CƠ ĐỘNG</span><div class="weapon-stat-track"><div class="weapon-stat-fill" style="width:${ st.mobility }%"></div></div></div>
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

function applySelectedLoadoutAndNotify() {
  game.setLoadout(selectedLoadout);
  syncHotbarSlotsHud();
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
    showToast(`🎒 Đã lưu Loadout (áp dụng khi hồi sinh): [1] ${ WEAPONS[selectedLoadout.primary].name } • [2] ${ WEAPONS[selectedLoadout.secondary].name }`);
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

function formatTime(sec) {
  const s = Math.max(0, Math.floor(sec));
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${ String(m).padStart(2, '0') }:${ String(rem).padStart(2, '0') }`;
}

// Join Room Action
function requestJoinRoom({ mode = 'public', roomCode = '' }) {
  lobbyError.classList.add('hidden');
  const name = playerNameInput.value.trim() || 'Striker';
  localStorage.setItem('polystrike_name', name);

  const botCount = Number(lobbyBotCount.value);
  sfx.ensureContext();

  selectedLoadout.primary = selectedStartingWeapon;

  socket.emit('joinRoom', {
    name,
    roomCode,
    mode,
    botCount,
    weapon: selectedStartingWeapon,
    loadout: selectedLoadout,
    mapId: selectedMapId
  });
}

// Lobby Event Listeners
playerNameInput.addEventListener('input', () => {
  if (showcaseOperatorName) {
    showcaseOperatorName.textContent = (playerNameInput.value.trim() || 'STRIKER').toUpperCase();
  }
});

weaponGrid.addEventListener('click', (e) => {
  const btn = e.target.closest('.weapon-option');
  if (!btn) return;
  selectedStartingWeapon = btn.dataset.weapon;
  selectedLoadout.primary = selectedStartingWeapon;
  weaponGrid.querySelectorAll('.weapon-option').forEach((el) => {
    el.classList.toggle('active', el === btn);
  });
  game.setLobbyWeapon(selectedStartingWeapon);
  if (showcaseWeaponName && WEAPONS[selectedStartingWeapon]) {
    showcaseWeaponName.textContent = WEAPONS[selectedStartingWeapon].name;
  }
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
      game.setLobbyOperatorColor(hexVal);
      operatorColorSwatches.querySelectorAll('.color-swatch').forEach((el) => {
        el.classList.toggle('active', el === sw);
      });
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
    mapGrid.querySelectorAll('.map-option').forEach((el) => {
      el.classList.toggle('active', el === btn);
    });
    // Live 3D map preview in the lobby background
    game.loadMap(selectedMapId);
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
    lobbyError.textContent = 'Vui lòng nhập mã phòng gồm 6 ký tự (VD: A9F2K1).';
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
  game.inMatch = false;
  game.exitPointerLock();
  game.clearAllRemotePlayers();
  game.clearDroppedWeapons();
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
    socket.emit('changeMap', { mapId: pauseMapSelect.value });
  });
}

pauseBotSelect.addEventListener('change', () => {
  socket.emit('setBots', { botCount: Number(pauseBotSelect.value) });
});

sensSlider.addEventListener('input', () => {
  const val = Number(sensSlider.value);
  sensValue.textContent = val.toFixed(1);
  game.sensitivity = val;
});

soundCheckbox.addEventListener('change', () => {
  sfx.enabled = soundCheckbox.checked;
});

// Active Rooms Browser Fetcher
async function fetchActiveRooms() {
  try {
    const rooms = await netClient.fetchRooms();

    if (rooms.length === 0) {
      activeRoomsList.innerHTML = `<div class="rooms-empty">Chưa có phòng nào đang mở — Hãy bấm "Vào Nhanh" hoặc "Tạo Phòng Riêng"!</div>`;
      return;
    }

    activeRoomsList.innerHTML = rooms
      .map(
        (r) => `
        <div class="room-item">
          <div>
            <span class="room-item-code">#${ r.code }</span>
            <span> • ${ r.mapName || 'CYBER CITADEL' } • ${ r.humans } người + ${ r.bots } Bot (${ r.total }/${ r.maxPlayers })</span>
          </div>
          <button class="room-item-join" data-code="${ r.code }">Vào ngay</button>
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
          <td>${ p.isBot ? '🤖 Bot AI' : '👤 Người chơi' }</td>
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
function addKillFeedItem({ killerId, killerName, victimId, victimName, weapon, isHeadshot }) {
  const item = document.createElement('div');
  const involvesMe = killerId === game.localId || victimId === game.localId;
  item.className = `kill-item${ involvesMe ? ' kill-item-me' : '' }${ isHeadshot ? ' kill-item-hs' : '' }`;

  const killerSpan = document.createElement('span');
  killerSpan.className = 'kill-name killer-name';
  killerSpan.style.color = killerId === game.localId ? '#facc15' : '#38bdf8';
  killerSpan.textContent = killerName;

  const weaponSpan = document.createElement('span');
  weaponSpan.className = 'kill-weapon-tag';
  weaponSpan.textContent = `[${ weapon }]`;

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

  // Update browser URL with ?room=CODE so copying URL directly from address bar works (relative for GitHub Pages subpaths)
  const shareUrl = getShareableRoomUrl(activeRoomCode);
  window.history.replaceState(null, '', `?room=${ activeRoomCode }`);

  hudRoomCode.textContent = `#${ activeRoomCode }`;
  sbRoomCode.textContent = `#${ activeRoomCode }`;
  pauseInviteUrl.value = shareUrl;
  pauseBotSelect.value = String(data.botCount ?? 4);
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
  game.spawnLocalPlayer(data.player);
  updateHpHud(data.player.hp);
  triggerSpawnProtectionHud(data.player.spawnProtectionMs || MATCH_CONFIG.SPAWN_PROTECTION_MS || 1500);
  const wCfg = WEAPONS[game.currentWeapon] || WEAPONS.rifle;
  updateWeaponHud(
    game.currentWeapon,
    game.ammoByWeapon[game.currentWeapon] ?? wCfg.magSize,
    game.reserveAmmoByWeapon[game.currentWeapon] ?? wCfg.reserveAmmo ?? wCfg.magSize
  );

  game.syncPickups(data.pickups || []);
  game.syncDroppedWeapons(data.droppedWeapons || []);
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
  showToast(`🎯 Đã vào Phòng #${ activeRoomCode } (${ getMapConfig(roomMapId).name })! Bấm [B] đổi kho súng, [L] Copy Link.`);
});

socket.on('loadoutUpdated', (data) => {
  if (!game.inMatch) return;
  if (data?.loadout) {
    selectedLoadout = {
      primary: data.loadout.primary || selectedLoadout.primary,
      secondary: data.loadout.secondary || selectedLoadout.secondary,
      melee: data.loadout.melee || selectedLoadout.melee
    };
    selectedStartingWeapon = selectedLoadout.primary;
    game.setLoadout(selectedLoadout);
    syncHotbarSlotsHud();
  }
});

socket.on('playerJoined', (data) => {
  if (!game.inMatch || !data?.name) return;
  showToast(`👤 Chiến binh ${ data.name } đã tham gia phòng #${ activeRoomCode }!`);
});

socket.on('mapChanged', (data) => {
  if (!game.inMatch) return;
  const newMapId = data.mapId || DEFAULT_MAP_ID;
  game.loadMap(newMapId);
  updateMapHud(newMapId);
  game.syncPickups(data.pickups || []);
  game.syncDroppedWeapons(data.droppedWeapons || []);
  latestPlayers = data.players || [];
  game.syncPlayersState(latestPlayers);

  const me = latestPlayers.find((p) => p.id === game.localId);
  if (me) {
    if (respawnInterval) clearInterval(respawnInterval);
    deathOverlay.classList.add('hidden');
    damageOverlay.style.opacity = '0';
    game.spawnLocalPlayer(me);
    updateHpHud(me.hp);
    triggerSpawnProtectionHud(MATCH_CONFIG.SPAWN_PROTECTION_MS || 1500);
  }
  showToast(`🗺️ Đã chuyển sang bản đồ: ${ data.mapName || getMapConfig(newMapId).name }`);
  showCenterBanner(`🗺️ BẢN ĐỒ MỚI: ${ data.mapName || getMapConfig(newMapId).name }`);
});

socket.on('stateUpdate', (snapshot) => {
  if (!game.inMatch) return;
  hudTimer.textContent = formatTime(snapshot.timeRemaining);
  latestPlayers = snapshot.players || [];
  game.syncPlayersState(latestPlayers);
  if (Array.isArray(snapshot.droppedWeapons)) {
    game.syncDroppedWeapons(snapshot.droppedWeapons);
  }

  // Find leader and local stats
  let topPlayer = null;
  for (const p of latestPlayers) {
    if (!topPlayer || p.kills > topPlayer.kills) {
      topPlayer = p;
    }
    if (p.id === game.localId) {
      hudKills.textContent = String(p.kills);
      hudDeaths.textContent = String(p.deaths);
      hudStreak.textContent = String(p.streak);
      updateHpHud(p.hp);
    }
  }

  if (topPlayer) {
    hudLeader.textContent = `Dẫn đầu: ${ topPlayer.name } (${ topPlayer.kills }/${ hudKillLimit.textContent } Kills)`;
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

  // We hit someone -> Show Hitmarker + Floating 3D Damage Popup
  if (data.attackerId === game.localId) {
    hitmarker.classList.remove('hidden');
    hitmarker.classList.toggle('headshot', Boolean(data.isHeadshot));
    sfx.playHitmarker(Boolean(data.isHeadshot));
    game.spawnDamagePopup(data.targetId, data.damage, Boolean(data.isHeadshot));

    if (hitmarkerTimer) clearTimeout(hitmarkerTimer);
    hitmarkerTimer = setTimeout(() => {
      hitmarker.classList.add('hidden');
    }, 140);
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
    showCenterBanner('🛡️ MỤC TIÊU ĐANG BẤT TỬ HỒI SINH (1.5s)!');
  }
});

socket.on('killEvent', (data) => {
  if (!game.inMatch) return;
  addKillFeedItem(data);

  if (data.killerId === game.localId) {
    sfx.playKillConfirm();
    const bannerMsg = data.isHeadshot
      ? `🎯 HEADSHOT! HẠ GỤC ${ data.victimName.toUpperCase() }`
      : `⚡ ĐÃ HẠ GỤC ${ data.victimName.toUpperCase() } (${ data.killerStreak } STREAK)`;
    showCenterBanner(bannerMsg);
  }

  if (data.victimId === game.localId) {
    game.alive = false;
    clearSpawnProtectionHud();
    if (weaponPickupPrompt) weaponPickupPrompt.classList.add('hidden');
    sniperScope.classList.add('hidden');
    crosshair.classList.remove('hidden');
    deathKillerName.textContent = data.killerName;
    deathWeaponName.textContent = data.weapon;
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
  if (data.playerId === game.localId) {
    if (respawnInterval) clearInterval(respawnInterval);
    deathOverlay.classList.add('hidden');
    damageOverlay.style.opacity = '0';
    if (data.loadout) {
      selectedLoadout = {
        primary: data.loadout.primary || selectedLoadout.primary,
        secondary: data.loadout.secondary || selectedLoadout.secondary,
        melee: data.loadout.melee || selectedLoadout.melee
      };
    }
    game.spawnLocalPlayer(data);
    updateHpHud(data.hp);
    triggerSpawnProtectionHud(data.spawnProtectionMs || MATCH_CONFIG.SPAWN_PROTECTION_MS || 1500);
    showCenterBanner('🛡️ BẤT TỬ HỒI SINH (1.5s)');
  }
});

socket.on('pickupState', (data) => {
  if (!game.inMatch) return;
  game.updatePickupSingle(data.pickupId, data.active);

  if (data.pickerId === game.localId && !data.active) {
    sfx.playPickup();
    updateHpHud(data.newHp);
    showCenterBanner('💚 +50 HP ĐÃ HỒI MÁU!');
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
    showCenterBanner(`🔫 ĐÃ NHẶT ${ wCfg ? wCfg.name : data.weapon } (${ data.ammo }/${ data.reserveAmmo })`);
  }
});

socket.on('matchEnded', (data) => {
  if (!game.inMatch) return;
  clearSpawnProtectionHud();
  if (weaponPickupPrompt) weaponPickupPrompt.classList.add('hidden');
  game.exitPointerLock();
  pauseModal.classList.add('hidden');
  deathOverlay.classList.add('hidden');
  sniperScope.classList.add('hidden');

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
  if (data.mapId) {
    game.loadMap(data.mapId);
    updateMapHud(data.mapId);
  }
  game.syncPickups(data.pickups || []);
  game.syncDroppedWeapons(data.droppedWeapons || []);
  latestPlayers = data.players || [];
  game.syncPlayersState(latestPlayers);
  const me = latestPlayers.find((p) => p.id === game.localId);
  if (me) {
    game.spawnLocalPlayer(me);
    updateHpHud(me.hp);
    triggerSpawnProtectionHud(MATCH_CONFIG.SPAWN_PROTECTION_MS || 1500);
  }
  showCenterBanner('🔥 VÁN ĐẤU MỚI BẮT ĐẦU! (🛡️ 1.5s BẤT TỬ)');
  game.requestPointerLock();
});

// Periodic Ping Measurement
setInterval(() => {
  if (!game.inMatch) return;
  const start = performance.now();
  socket.emit('pingCheck', start, () => {
    const rtt = Math.round(performance.now() - start);
    hudPing.textContent = String(rtt);
  });
}, 2500);
