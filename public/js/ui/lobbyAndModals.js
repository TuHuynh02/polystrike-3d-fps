import {
  DEFAULT_LOADOUT,
  DEFAULT_MAP_ID,
  MAPS,
  PRIMARY_WEAPONS,
  WEAPONS,
  buildLanCreateUrl,
  buildLanHostUrl,
  generateLanRoomCode,
  getMapConfig,
  normalizeLanUrl,
  parseCreateParams
} from '../shared.js';
import { SERVER_UNREACHABLE_MESSAGE } from '../networkAdapter.js';
import { lanErrorText } from '../lanHost/lanMode.js';
import {
  canvasContainer,
  toastEl,
  lobbyScreen,
  inviteBanner,
  inviteRoomCodeEl,
  btnJoinInvited,
  playerNameInput,
  weaponGrid,
  mapGrid,
  lobbyGameModeGrid,
  lobbyError,
  btnQuickPlay,
  btnCreatePrivate,
  lanRoomHint,
  lanP2pCheckbox,
  lanUrlInput,
  btnSaveLanUrl,
  roomCodeInput,
  btnJoinCode,
  btnRefreshRooms,
  activeRoomsList,
  hudScreen,
  damageOverlay,
  spawnShieldOverlay,
  spawnShieldBadge,
  spawnShieldTimerEl,
  hudHpCard,
  hudHpAdrenalineTag,
  damageDirIndicator,
  sniperScope,
  opticScope,
  opticTelemetry,
  crosshair,
  hitmarker,
  hudFloatingDmg,
  hudAdrenalinePop,
  multikillBanner,
  multikillMedal,
  multikillTitle,
  multikillSubtitle,
  centerBanner,
  hudRoomCode,
  hudMapName,
  btnCopyLinkHud,
  hudTimer,
  hudKillLimit,
  hudTeamScore,
  hudScoreAlpha,
  hudScoreBravo,
  hudLeader,
  hudFps,
  hudPing,
  killFeed,
  hudKills,
  hudDeaths,
  hudStreak,
  hudStance,
  hudSpeed,
  hudHpValue,
  hudArmorRow,
  hudArmorValue,
  hudArmorBar,
  hudActiveBuffs,
  hudHpBar,
  reloadIndicator,
  reloadText,
  reloadBarFill,
  weaponPickupPrompt,
  weaponPickupText,
  weaponPickupTimer,
  grenadeCookHud,
  grenadeCookTimer,
  grenadeCookBar,
  hudWeaponName,
  hudWeaponRole,
  hudAmmoCurrent,
  hudAmmoMag,
  hudWeaponHotbar,
  hotbarSlot1,
  hotbarSlot2,
  hotbarSlot3,
  hotbarName1,
  hotbarName2,
  hotbarName3,
  hudGrenadeSlot,
  hudGrenadeStatus,
  hudGrenadeCount,
  hudGrenadeStateText,
  btnHudLoadout,
  operatorDragZone,
  showcaseOperatorName,
  showcaseWeaponName,
  operatorColorSwatches,
  btnShowcaseWalk,
  btnShowcaseCrouch,
  btnShowcaseFire,
  btnShowcaseRotate,
  deathOverlay,
  deathKillerName,
  deathWeaponName,
  respawnTimerEl,
  btnOpenLoadoutDeath,
  loadoutModal,
  loadoutPrimaryGrid,
  loadoutSecondaryGrid,
  btnSaveLoadout,
  pauseModal,
  pauseInviteUrl,
  btnCopyLinkPause,
  pauseMapSelect,
  sensSlider,
  sensValue,
  soundCheckbox,
  btnResume,
  btnLeaveRoom,
  scoreboardModal,
  sbRoomCode,
  sbMapName,
  scoreboardBody,
  teamLobbyModal,
  teamLobbyRoomCode,
  teamLobbyMapName,
  teamLobbyKillLimit,
  btnCopyTeamLobbyLink,
  teamAlphaCount,
  teamBravoCount,
  teamAlphaRoster,
  teamBravoRoster,
  teamLobbyStatus,
  btnSwitchTeam,
  btnTeamReady,
  btnStartTeamMatch,
  btnLeaveTeamLobby,
  matchEndModal,
  victoryWinnerName,
  victoryWinnerStats,
  victoryLeaderboardBody,
  nextMatchCountdown,
  urlParams,
  invitedRoomParam,
  escapeHtml,
  formatTime,
  getShareableRoomUrl
} from './domElements.js';
import { appState, saveUserPrefs, unlockGameplayKeys, userPrefs } from './userPrefsAndKeys.js';
import {
  clearAdrenalineHealHud,
  clearSpawnProtectionHud,
  copyInviteLinkToClipboard,
  showToast,
  syncHotbarSlotsHud,
  updateMapHud
} from './hudController.js';

const WEAPON_SILHOUETTE_SVGS = {
  rifle: `<svg class="weapon-silhouette-svg" viewBox="0 0 240 84" xmlns="http://www.w3.org/2000/svg" focusable="false" aria-hidden="true">
    <path fill="currentColor" opacity="0.88" d="M14,34 L54,30 L54,43 L20,54 L12,50 Z" />
    <path fill="currentColor" d="M54,26 L124,26 L128,31 L126,44 L54,44 Z" />
    <path fill="currentColor" opacity="0.9" d="M74,16 L98,16 L100,26 L72,26 Z" />
    <path fill="currentColor" d="M58,44 L69,44 L61,67 L49,65 Z" />
    <path fill="currentColor" opacity="0.75" d="M69,44 L82,44 L80,52 L67,52 Z" />
    <path fill="currentColor" d="M84,43 L102,43 C106,56 114,68 123,75 L108,79 C97,70 88,57 84,43 Z" />
    <path fill="currentColor" opacity="0.92" d="M126,25 L164,25 L164,30 L126,30 Z M126,31 L168,31 L166,41 L126,42 Z" />
    <path fill="currentColor" d="M164,25 L173,31 L168,35 L162,30 Z M168,31.5 L216,31.5 L216,35.5 L168,35.5 Z M168,37 L212,37 L212,38.8 L168,38.8 Z M198,19 L205,19 L209,32 L196,32 Z M216,30 L229,30 L229,37 L216,37 Z" />
  </svg>`,
  m4a1: `<svg class="weapon-silhouette-svg" viewBox="0 0 240 84" xmlns="http://www.w3.org/2000/svg" focusable="false" aria-hidden="true">
    <path fill="currentColor" opacity="0.9" d="M14,27 L48,27 L48,40 L26,53 L14,51 Z M48,29 L60,29 L60,36 L48,36 Z" />
    <path fill="currentColor" d="M60,25 L118,25 L118,44 L94,46 L88,43 L60,43 Z" />
    <path fill="currentColor" opacity="0.92" d="M76,14 L102,14 L104,25 L74,25 Z M148,19 L168,19 L168,26 L148,26 Z" />
    <path fill="currentColor" d="M64,43 L74,43 L67,66 L56,64 Z" />
    <path fill="currentColor" opacity="0.75" d="M74,43 L88,43 L86,50 L73,50 Z" />
    <path fill="currentColor" d="M92,45 L109,45 C111,56 115,66 120,73 L105,76 C99,68 94,57 92,45 Z" />
    <path fill="currentColor" d="M118,26 L174,26 L174,39 L118,39 Z M136,39 L160,39 L152,47 L132,44 Z" />
    <path fill="currentColor" opacity="0.95" d="M174,27.5 L180,27.5 L180,37.5 L174,37.5 Z M180,28.5 L228,28.5 L228,36.5 L180,36.5 Z" />
  </svg>`,
  scar: `<svg class="weapon-silhouette-svg" viewBox="0 0 240 84" xmlns="http://www.w3.org/2000/svg" focusable="false" aria-hidden="true">
    <path fill="currentColor" opacity="0.9" d="M12,24 L30,21 L56,24 L56,44 L22,52 L12,48 Z M56,25 L62,25 L62,42 L56,42 Z" />
    <path fill="currentColor" d="M62,21 L172,21 L172,38 L62,38 Z M66,38 L116,38 L114,43 L66,43 Z" />
    <path fill="currentColor" opacity="0.92" d="M82,11 L108,11 L110,21 L80,21 Z" />
    <path fill="currentColor" d="M66,41 L77,41 L70,63 L59,61 Z" />
    <path fill="currentColor" d="M94,41 L114,41 L114,70 L94,70 Z M99,70 L109,70 L107,75 L101,75 Z" />
    <path fill="currentColor" opacity="0.9" d="M142,38 L152,38 L151,58 L143,58 Z" />
    <path fill="currentColor" d="M172,28 L214,28 L214,33 L172,33 Z M174,20 L182,20 L182,28 L174,28 Z M214,26.5 L228,26.5 L228,34.5 L214,34.5 Z" />
  </svg>`,
  smg: `<svg class="weapon-silhouette-svg" viewBox="0 0 240 84" xmlns="http://www.w3.org/2000/svg" focusable="false" aria-hidden="true">
    <path fill="currentColor" opacity="0.88" d="M24,25 L70,26 L70,31 L33,31 L31,44 L70,36 L70,41 L24,50 Z" />
    <path fill="currentColor" d="M70,22 L158,22 L158,34 L70,34 Z" />
    <path fill="currentColor" opacity="0.92" d="M90,12 L116,12 L118,22 L88,22 Z" />
    <path fill="currentColor" d="M76,34 L86,34 L84,56 L112,56 L112,61 L74,61 L72,34 Z" />
    <path fill="currentColor" d="M112,34 L150,34 L142,62 L108,62 Z" />
    <path fill="currentColor" opacity="0.95" d="M124,58 L138,58 L126,81 L111,79 Z" />
    <path fill="currentColor" d="M158,26 L196,26 L196,32 L158,32 Z M196,25 L208,25 L208,33 L196,33 Z" />
  </svg>`,
  shotgun: `<svg class="weapon-silhouette-svg" viewBox="0 0 240 84" xmlns="http://www.w3.org/2000/svg" focusable="false" aria-hidden="true">
    <path fill="currentColor" opacity="0.9" d="M12,36 L56,29 L56,41 L20,56 L12,52 Z" />
    <path fill="currentColor" d="M54,39 L64,39 L58,60 L48,58 Z" />
    <path fill="currentColor" d="M56,25 L122,25 L122,40 L56,40 Z" />
    <path fill="currentColor" opacity="0.9" d="M78,16 L96,16 L98,25 L76,25 Z" />
    <path fill="currentColor" d="M122,26 L218,26 L218,31 L122,31 Z M122,33 L212,33 L212,38 L122,38 Z M196,25 L202,25 L202,39 L196,39 Z" />
    <path fill="currentColor" opacity="0.95" d="M134,32 L178,32 L178,43 L134,43 Z" />
    <path fill="currentColor" d="M206,20 L212,20 L214,26 L204,26 Z M218,25 L228,25 L228,32 L218,32 Z" />
  </svg>`,
  sniper: `<svg class="weapon-silhouette-svg" viewBox="0 0 240 84" xmlns="http://www.w3.org/2000/svg" focusable="false" aria-hidden="true">
    <path fill="currentColor" opacity="0.9" d="M10,27 L66,27 L66,46 L52,58 L24,58 L24,48 L10,48 Z M24,21 L52,21 L54,27 L22,27 Z M18,48 L24,48 L24,62 L16,62 Z" />
    <path fill="currentColor" d="M66,27 L148,27 L144,41 L66,43 Z" />
    <path fill="currentColor" opacity="0.95" d="M68,12 L84,14 L126,14 L144,9 L156,9 L156,22 L144,22 L126,18 L84,18 L68,20 Z M101,9 L109,9 L109,14 L101,14 Z M86,18 L92,18 L92,27 L86,27 Z M118,18 L124,18 L124,27 L118,27 Z" />
    <path fill="currentColor" d="M86,43 L110,43 L108,58 L86,58 Z" />
    <path fill="currentColor" opacity="0.88" d="M138,41 L176,45 L176,49 L136,44 Z" />
    <path fill="currentColor" d="M148,29 L218,29 L218,34 L148,34 Z M218,26 L232,26 L232,37 L218,37 Z" />
  </svg>`,
  lmg: `<svg class="weapon-silhouette-svg" viewBox="0 0 240 84" xmlns="http://www.w3.org/2000/svg" focusable="false" aria-hidden="true">
    <path fill="currentColor" opacity="0.9" d="M14,24 L24,24 L24,48 L14,48 Z M24,27 L58,27 L58,31 L24,31 Z M24,40 L58,40 L58,44 L24,44 Z" />
    <path fill="currentColor" d="M58,20 L132,20 L132,44 L58,44 Z" />
    <path fill="currentColor" opacity="0.92" d="M76,10 L102,10 L104,20 L74,20 Z M128,13 L144,13 L144,20 L138,20 L138,16 L128,16 Z" />
    <path fill="currentColor" d="M64,44 L75,44 L68,66 L57,64 Z" />
    <path fill="currentColor" opacity="0.95" d="M88,44 L128,44 L128,74 L88,74 Z" />
    <path fill="currentColor" d="M132,22 L182,22 L182,41 L132,41 Z M146,41 L190,46 L190,50 L146,45 Z" />
    <path fill="currentColor" d="M182,25 L218,25 L218,31 L182,31 Z M182,33 L208,33 L208,37 L182,37 Z M218,23.5 L229,23.5 L229,32.5 L218,32.5 Z" />
  </svg>`
};

export function getWeaponSilhouetteSvg(weaponId) {
  return WEAPON_SILHOUETTE_SVGS[weaponId] || WEAPON_SILHOUETTE_SVGS.rifle;
}

export function renderLoadoutModal() {
  if (!loadoutPrimaryGrid) return;

  const activePrimary = PRIMARY_WEAPONS.includes(appState.selectedLoadout?.primary)
    ? appState.selectedLoadout.primary
    : (DEFAULT_LOADOUT?.primary || 'rifle');

  const buildPrimaryWeaponCardHtml = (wId, isSelected) => {
    const w = WEAPONS[wId];
    if (!w) return '';
    const categoryTag = escapeHtml(w.category || 'PRI');
    const safeName = escapeHtml(w.name);
    const silhouetteSvg = getWeaponSilhouetteSvg(w.id);
    return `
      <button type="button" class="weapon-option loadout-weapon-card ${ isSelected ? 'active' : '' }" data-loadout-weapon="${ w.id }" data-loadout-slot="${ w.slot }" aria-pressed="${ isSelected ? 'true' : 'false' }">
        <div class="weapon-opt-top">
          <span class="weapon-key">${ categoryTag }</span>
        </div>
        <div class="weapon-silhouette" data-weapon-silhouette="${ w.id }" aria-hidden="true">
          ${ silhouetteSvg }
        </div>
        <span class="weapon-name">${ safeName }</span>
      </button>
    `;
  };

  loadoutPrimaryGrid.innerHTML = PRIMARY_WEAPONS.map((wId) =>
    buildPrimaryWeaponCardHtml(wId, activePrimary === wId)
  ).join('');

  if (loadoutSecondaryGrid) {
    loadoutSecondaryGrid.innerHTML = '';
    loadoutSecondaryGrid.classList?.add('hidden');
  }
}

export function toggleLoadoutModal(forceOpen = null) {
  if (!appState.game?.inMatch || !loadoutModal) return;
  const isCurrentlyHidden = loadoutModal.classList.contains('hidden');
  const shouldOpen = forceOpen !== null ? forceOpen : isCurrentlyHidden;

  if (shouldOpen) {
    renderLoadoutModal();
    pauseModal?.classList?.add('hidden');
    loadoutModal.classList.remove('hidden');
    appState.game.exitPointerLock?.();
  } else {
    loadoutModal.classList.add('hidden');
    if (deathOverlay?.classList?.contains('hidden') && matchEndModal?.classList?.contains('hidden')) {
      appState.game.requestPointerLock?.();
    }
  }
}

export function syncLobbyWeaponSelectionUi(weaponId) {
  if (!WEAPONS[weaponId]) return;
  if (weaponGrid?.querySelectorAll) {
    weaponGrid.querySelectorAll('.weapon-option').forEach((el) => {
      el.classList?.toggle('active', el.dataset?.weapon === weaponId);
    });
  }
  if (showcaseWeaponName) {
    showcaseWeaponName.textContent = WEAPONS[weaponId].name;
  }
}

export function syncLobbyMapSelectionUi(mapId) {
  if (mapGrid?.querySelectorAll) {
    mapGrid.querySelectorAll('.map-option').forEach((el) => {
      el.classList?.toggle('active', el.dataset?.map === mapId);
    });
  }
  if (pauseMapSelect) {
    pauseMapSelect.value = mapId;
  }
}

export function applySelectedLoadoutAndNotify() {
  const activePrimary = PRIMARY_WEAPONS.includes(appState.selectedLoadout?.primary)
    ? appState.selectedLoadout.primary
    : (DEFAULT_LOADOUT?.primary || 'rifle');
  const standardSecondary = DEFAULT_LOADOUT?.secondary || 'pistol';
  const standardMelee = DEFAULT_LOADOUT?.melee || 'knife';
  appState.selectedLoadout.primary = activePrimary;
  appState.selectedLoadout.secondary = standardSecondary;
  appState.selectedLoadout.melee = standardMelee;
  appState.selectedStartingWeapon = activePrimary;
  appState.game?.setLoadout?.(appState.selectedLoadout);
  syncHotbarSlotsHud();
  syncLobbyWeaponSelectionUi(activePrimary);
  saveUserPrefs({
    primaryWeapon: activePrimary,
    secondaryWeapon: standardSecondary
  });
  appState.socket?.emit?.('updateLoadout', appState.selectedLoadout);
  renderLoadoutModal();
}

export function applyRestoredUserPrefs() {
  appState.isRestoringPrefs = true;
  try {
    // 1. Player Name & Showcase Callsign
    if (playerNameInput) {
      playerNameInput.value = userPrefs.playerName;
    }
    if (showcaseOperatorName) {
      showcaseOperatorName.textContent = (userPrefs.playerName.trim() || 'STRIKER').toUpperCase();
    }

    // 2. Primary Weapon & Standardized Secondary/Melee Loadout (Lobby Grid, 3D Showcase, Hotbar & Loadout Modal)
    const standardSecondary = DEFAULT_LOADOUT?.secondary || 'pistol';
    const standardMelee = DEFAULT_LOADOUT?.melee || 'knife';
    appState.selectedStartingWeapon = userPrefs.primaryWeapon;
    appState.selectedLoadout.primary = userPrefs.primaryWeapon;
    appState.selectedLoadout.secondary = standardSecondary;
    appState.selectedLoadout.melee = standardMelee;
    userPrefs.secondaryWeapon = standardSecondary;
    syncLobbyWeaponSelectionUi(appState.selectedStartingWeapon);
    appState.game.setLoadout(appState.selectedLoadout, appState.selectedStartingWeapon);
    appState.game.setLobbyWeapon(appState.selectedStartingWeapon);
    syncHotbarSlotsHud();
    renderLoadoutModal();

    // 3. Operator Camo / Rig Trim Swatch & 3D Showcase Operator Color
    appState.selectedOperatorColor = userPrefs.operatorColor;
    appState.game.setLobbyOperatorColor(appState.selectedOperatorColor);
    if (operatorColorSwatches) {
      operatorColorSwatches.querySelectorAll('.color-swatch').forEach((el) => {
        el.classList.toggle('active', Number(el.dataset.color) === appState.selectedOperatorColor);
      });
    }

    // 4. Selected Combat Sector Map
    appState.selectedMapId = userPrefs.selectedMap;
    syncLobbyMapSelectionUi(appState.selectedMapId);
    if (appState.selectedMapId !== DEFAULT_MAP_ID) {
      appState.game.loadMap(appState.selectedMapId);
    }
    updateMapHud(appState.selectedMapId);

    // 5. Mouse Sensitivity
    if (sensSlider) {
      sensSlider.value = String(userPrefs.sensitivity);
    }
    if (sensValue) {
      sensValue.textContent = userPrefs.sensitivity.toFixed(1);
    }
    appState.game.sensitivity = userPrefs.sensitivity;
    appState.game.mouseSensitivity = userPrefs.sensitivity;

    // 7. Sound Effects Enabled
    if (soundCheckbox) {
      soundCheckbox.checked = Boolean(userPrefs.soundEnabled);
    }
    appState.sfx.enabled = Boolean(userPrefs.soundEnabled);

    saveUserPrefs();
  } finally {
    appState.isRestoringPrefs = false;
  }
}

function getLobbyPlayerName() {
  const rawName = playerNameInput.value.trim();
  return (rawName.replace(/[<>&"'`]/g, '').trim().slice(0, 16)) || userPrefs.playerName || 'Striker';
}

export function requestJoinRoom({ mode = 'public', roomCode = '' }) {
  lobbyError.classList.add('hidden');
  if (!appState.socket.connected) {
    lobbyError.textContent = appState.lanInfo && !appState.lanInfo.error
      ? '🔌 Đang kết nối LAN tới chủ phòng, vui lòng đợi vài giây...'
      : `${ SERVER_UNREACHABLE_MESSAGE }. Vui lòng đợi hoặc tải lại trang.`;
    lobbyError.classList.remove('hidden');
    return;
  }
  const name = getLobbyPlayerName();

  const standardSecondary = DEFAULT_LOADOUT?.secondary || 'pistol';
  const standardMelee = DEFAULT_LOADOUT?.melee || 'knife';
  appState.selectedLoadout.primary = appState.selectedStartingWeapon;
  appState.selectedLoadout.secondary = standardSecondary;
  appState.selectedLoadout.melee = standardMelee;
  saveUserPrefs({
    playerName: name,
    primaryWeapon: appState.selectedStartingWeapon,
    secondaryWeapon: standardSecondary,
    operatorColor: appState.selectedOperatorColor,
    selectedMap: appState.selectedMapId
  });

  appState.sfx.ensureContext();

  appState.lastJoinPayload = {
    name,
    roomCode,
    mode,
    gameMode: appState.selectedGameMode,
    color: appState.selectedOperatorColor,
    weapon: appState.selectedStartingWeapon,
    loadout: appState.selectedLoadout,
    mapId: appState.selectedMapId
  };
  appState.socket.emit('joinRoom', appState.lastJoinPayload);
}

export function leaveActiveRoom(opts = {}) {
  const shouldEmit = opts?.emitLeave !== false;
  if (shouldEmit && appState.activeRoomCode) {
    appState.socket.emit('leaveRoom');
  }
  appState.activeRoomCode = '';
  appState.currentRoomGameMode = 'ffa';
  appState.currentRoomState = 'PLAYING';
  appState.currentRoomHostId = null;
  appState.currentLocalTeam = null;
  appState.currentLocalReady = false;
  appState.currentTeamScores = { alpha: 0, bravo: 0 };
  appState.latestPlayers = [];
  appState.playerStateCache.clear();
  appState.lastScoreboardSig = '';
  appState.hudCache.leaderText = '';
  if (appState.respawnInterval) {
    clearInterval(appState.respawnInterval);
    appState.respawnInterval = null;
  }
  if (appState.nextMatchInterval) {
    clearInterval(appState.nextMatchInterval);
    appState.nextMatchInterval = null;
  }
  clearSpawnProtectionHud();
  clearAdrenalineHealHud();
  appState.game.setTeamState?.('ffa', null);
  appState.game.inMatch = false;
  appState.game.isAiming = false;
  unlockGameplayKeys();
  appState.game.exitPointerLock();
  appState.game.clearAllRemotePlayers();
  appState.game.clearDroppedWeapons();
  appState.game.clearGrenades?.();
  sniperScope.classList.add('hidden');
  opticScope?.classList.add('hidden');
  opticScope?.classList.remove('optic-holo', 'optic-reddot');
  crosshair.classList.remove('hidden', 'aiming');
  appState.hudCache.chAiming = false;
  if (damageOverlay) damageOverlay.style.opacity = '0';
  killFeed?.replaceChildren();
  scoreboardModal?.classList.add('hidden');
  reloadIndicator?.classList.add('hidden');
  grenadeCookHud?.classList.add('hidden');
  weaponPickupPrompt?.classList.add('hidden');
  damageDirIndicator?.classList.add('hidden');
  multikillBanner?.classList.add('hidden');
  centerBanner?.classList.add('hidden');
  hudTeamScore?.classList.add('hidden');
  pauseModal.classList.add('hidden');
  if (loadoutModal) loadoutModal.classList.add('hidden');
  teamLobbyModal?.classList.add('hidden');
  deathOverlay.classList.add('hidden');
  matchEndModal.classList.add('hidden');
  hudScreen.classList.add('hidden');
  lobbyScreen.classList.remove('hidden');
  try {
    window.history.replaceState(null, '', window.location.pathname || '/');
  } catch {
    // ignore history error in headless test environments
  }
  fetchActiveRooms();
}

export function renderTeamWaitingLobby(lobbyData = {}) {
  if (!teamLobbyModal) return;
  const players = Array.isArray(lobbyData.players) ? lobbyData.players : appState.latestPlayers;
  if (lobbyData.hostId) appState.currentRoomHostId = lobbyData.hostId;
  if (lobbyData.state) appState.currentRoomState = lobbyData.state;
  if (lobbyData.mapName && teamLobbyMapName) teamLobbyMapName.textContent = lobbyData.mapName;
  if (teamLobbyRoomCode && appState.activeRoomCode) teamLobbyRoomCode.textContent = `#${ appState.activeRoomCode }`;
  if (teamLobbyKillLimit) teamLobbyKillLimit.textContent = String(lobbyData.killLimit || hudKillLimit.textContent || 30);

  const alphaList = players.filter((p) => p.team === 'alpha');
  const bravoList = players.filter((p) => p.team === 'bravo');

  const me = players.find((p) => p.id === appState.game.localId);
  if (me) {
    appState.currentLocalTeam = me.team || 'alpha';
    appState.currentLocalReady = Boolean(me.ready);
    appState.game.setTeamState?.(appState.currentRoomGameMode, appState.currentLocalTeam);
  }

  if (teamAlphaCount) teamAlphaCount.textContent = `${ alphaList.length }/6`;
  if (teamBravoCount) teamBravoCount.textContent = `${ bravoList.length }/6`;

  const renderRosterColumn = (list) => {
    if (list.length === 0) {
      return `<div class="rooms-empty">Chưa có chiến binh ở phe này</div>`;
    }
    return list
      .map((p) => {
        const isMe = p.id === appState.game.localId;
        const isHost = p.id === appState.currentRoomHostId;
        const readyBool = Boolean(p.ready);
        return `
          <div class="team-roster-item ${ isMe ? 'is-me' : '' }">
            <span>
              ${ isHost ? '👑 ' : '' }<strong>${ escapeHtml(p.name) }</strong> ${ isMe ? '(Bạn)' : '' }
            </span>
            <span class="team-roster-status ${ readyBool ? 'ready' : 'waiting' }">
              ${ readyBool ? '✓ SẴN SÀNG' : 'ĐANG CHỜ' }
            </span>
          </div>
        `;
      })
      .join('');
  };

  if (teamAlphaRoster) teamAlphaRoster.innerHTML = renderRosterColumn(alphaList);
  if (teamBravoRoster) teamBravoRoster.innerHTML = renderRosterColumn(bravoList);

  if (btnTeamReady) {
    btnTeamReady.textContent = appState.currentLocalReady ? '✗ HỦY SẴN SÀNG' : '✓ SẴN SÀNG';
  }

  const isHost = Boolean(appState.game.localId && appState.currentRoomHostId === appState.game.localId);
  const canStart = lobbyData.canStart !== undefined
    ? Boolean(lobbyData.canStart)
    : ((alphaList.length >= 1 && bravoList.length >= 1) || players.length === 1);

  if (btnStartTeamMatch) {
    btnStartTeamMatch.classList.toggle('hidden', !isHost);
    btnStartTeamMatch.disabled = !canStart;
  }

  if (teamLobbyStatus) {
    if (players.length >= 2 && (alphaList.length === 0 || bravoList.length === 0)) {
      teamLobbyStatus.textContent = '⚠️ Cần ít nhất 1 người ở mỗi phe (Xanh và Đỏ) để bắt đầu trận đấu!';
    } else if (isHost) {
      teamLobbyStatus.textContent = '👑 Bạn là Chủ phòng: Có thể bấm BẮT ĐẦU TRẬN ngay hoặc chờ tất cả bấm SẴN SÀNG.';
    } else {
      teamLobbyStatus.textContent = 'Chọn phe và bấm Sẵn Sàng. Khi tất cả sẵn sàng, trận đấu sẽ tự động bắt đầu!';
    }
  }
}

export async function fetchActiveRooms() {
  try {
    const rooms = await appState.netClient.fetchRooms();

    if (rooms.length === 0) {
      activeRoomsList.innerHTML = `<div class="rooms-empty">Chưa có phòng đang mở.</div>`;
      return;
    }

    activeRoomsList.innerHTML = rooms
      .map(
        (r) => {
          const safeCode = escapeHtml(r.code);
          const safeMap = escapeHtml(r.mapName || 'CYBER CITADEL');
          const safeTotal = Number(r.total) || 0;
          const safeMax = Number(r.maxPlayers) || 16;
          const modeLabel = r.gameMode === 'tdm' ? '2 PHE' : 'FFA';
          return `
        <div class="room-item">
          <div>
            <span class="room-item-code">#${ safeCode }</span>
            <span> • [${ modeLabel }] ${ safeMap } (${ safeTotal }/${ safeMax })</span>
          </div>
          <button class="room-item-join" data-code="${ safeCode }" data-mode="${ r.gameMode === 'tdm' ? 'tdm' : 'ffa' }">VÀO</button>
        </div>
      `;
        }
      )
      .join('');
  } catch {
    activeRoomsList.innerHTML = `<div class="rooms-empty">Không thể tải danh sách phòng.</div>`;
  }
}

export function initLobbyAndModalListeners() {
if (loadoutPrimaryGrid) {
  loadoutPrimaryGrid.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-loadout-weapon]');
    if (!btn) return;
    const wId = btn.dataset.loadoutWeapon;
    if (WEAPONS[wId]?.slot === 1) {
      appState.selectedLoadout.primary = wId;
      appState.selectedStartingWeapon = wId;
      appState.game?.setLobbyWeapon?.(wId);
      applySelectedLoadoutAndNotify();
    }
  });
}

if (btnSaveLoadout) {
  btnSaveLoadout.addEventListener('click', () => {
    applySelectedLoadoutAndNotify();
    toggleLoadoutModal(false);
    showToast(`🎒 ${ WEAPONS[appState.selectedLoadout.primary]?.name || appState.selectedLoadout.primary }`);
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

if (lobbyGameModeGrid) {
  lobbyGameModeGrid.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-mode]');
    if (!btn) return;
    appState.selectedGameMode = btn.dataset.mode === 'tdm' ? 'tdm' : 'ffa';
    lobbyGameModeGrid.querySelectorAll('.game-mode-option').forEach((el) => {
      el.classList.toggle('active', el.dataset.mode === appState.selectedGameMode);
    });
  });
}

weaponGrid.addEventListener('click', (e) => {
  const btn = e.target.closest('.weapon-option');
  if (!btn) return;
  const wId = btn.dataset.weapon;
  if (!PRIMARY_WEAPONS.includes(wId)) return;
  const standardSecondary = DEFAULT_LOADOUT?.secondary || 'pistol';
  const standardMelee = DEFAULT_LOADOUT?.melee || 'knife';
  appState.selectedStartingWeapon = wId;
  appState.selectedLoadout.primary = wId;
  appState.selectedLoadout.secondary = standardSecondary;
  appState.selectedLoadout.melee = standardMelee;
  syncLobbyWeaponSelectionUi(appState.selectedStartingWeapon);
  appState.game?.setLoadout?.(appState.selectedLoadout);
  appState.game?.setLobbyWeapon?.(appState.selectedStartingWeapon);
  syncHotbarSlotsHud();
  renderLoadoutModal();
  saveUserPrefs({
    primaryWeapon: appState.selectedStartingWeapon,
    secondaryWeapon: standardSecondary
  });
});

// Interactive 3D Humanoid Showcase Turntable & Controls in Lobby
if (operatorDragZone) {
  let isDraggingShowcase = false;
  let lastDragX = 0;

  operatorDragZone.addEventListener('pointerdown', (e) => {
    isDraggingShowcase = true;
    lastDragX = e.clientX;
    appState.game.lobbyAutoRotate = false;
    btnShowcaseRotate?.classList.remove('active');
    operatorDragZone.setPointerCapture?.(e.pointerId);
  });

  operatorDragZone.addEventListener('pointermove', (e) => {
    if (!isDraggingShowcase) return;
    const dx = e.clientX - lastDragX;
    lastDragX = e.clientX;
    appState.game.rotateLobbyOperator(dx * 0.011);
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
      appState.selectedOperatorColor = hexVal;
      appState.game.setLobbyOperatorColor(hexVal);
      operatorColorSwatches.querySelectorAll('.color-swatch').forEach((el) => {
        el.classList.toggle('active', el === sw);
      });
      saveUserPrefs({ operatorColor: hexVal });
    }
  });
}

if (btnShowcaseWalk) {
  btnShowcaseWalk.addEventListener('click', () => {
    const walking = appState.game.toggleLobbyWalk();
    btnShowcaseWalk.classList.toggle('active', walking);
  });
}

if (btnShowcaseCrouch) {
  btnShowcaseCrouch.addEventListener('click', () => {
    const crouching = appState.game.toggleLobbyCrouch();
    btnShowcaseCrouch.classList.toggle('active', crouching);
  });
}

if (btnShowcaseFire) {
  btnShowcaseFire.addEventListener('click', () => {
    if (!appState.sfx.enabled) {
      appState.sfx.enabled = true;
      if (soundCheckbox) soundCheckbox.checked = true;
      saveUserPrefs({ soundEnabled: true });
    }
    appState.sfx.ensureContext();
    appState.sfx.playShot(appState.selectedStartingWeapon || 'rifle', 0.72);
    appState.game.triggerLobbyTestFire();
  });
}

if (btnShowcaseRotate) {
  btnShowcaseRotate.addEventListener('click', () => {
    appState.game.lobbyAutoRotate = !appState.game.lobbyAutoRotate;
    btnShowcaseRotate.classList.toggle('active', appState.game.lobbyAutoRotate);
  });
}

if (mapGrid) {
  mapGrid.addEventListener('click', (e) => {
    const btn = e.target.closest('.map-option');
    if (!btn) return;
    appState.selectedMapId = btn.dataset.map;
    syncLobbyMapSelectionUi(appState.selectedMapId);
    // Live 3D map preview in the lobby background
    appState.game.loadMap(appState.selectedMapId);
    updateMapHud(appState.selectedMapId);
    saveUserPrefs({ selectedMap: appState.selectedMapId });
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
  // "Chơi qua LAN": this browser becomes the game server of the room (page reload in host mode, see lanHost/lanMode.js)
  if (lanP2pCheckbox?.checked) {
    window.location.href = buildLanHostUrl(window.location.origin, {
      code: generateLanRoomCode(),
      name: getLobbyPlayerName(),
      mapId: appState.selectedMapId,
      gameMode: appState.selectedGameMode
    });
    return;
  }
  // On the public site with an office LAN server configured, the private room is created there (see "LAN server" below)
  if (lanServerUrl) {
    window.location.href = buildLanCreateUrl(lanServerUrl, {
      name: getLobbyPlayerName(),
      mapId: appState.selectedMapId,
      gameMode: appState.selectedGameMode
    });
    return;
  }
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
btnCopyTeamLobbyLink?.addEventListener('click', () => copyInviteLinkToClipboard());

btnResume.addEventListener('click', () => {
  pauseModal.classList.add('hidden');
  if (loadoutModal) loadoutModal.classList.add('hidden');
  appState.game.requestPointerLock();
});

btnLeaveRoom.addEventListener('click', () => leaveActiveRoom({ emitLeave: true }));
btnLeaveTeamLobby?.addEventListener('click', () => leaveActiveRoom({ emitLeave: true }));

btnSwitchTeam?.addEventListener('click', () => {
  appState.socket.emit('switchTeam', {});
});

btnTeamReady?.addEventListener('click', () => {
  appState.socket.emit('setTeamReady', { ready: !appState.currentLocalReady });
});

btnStartTeamMatch?.addEventListener('click', () => {
  appState.socket.emit('startTeamMatch');
});

if (pauseMapSelect) {
  pauseMapSelect.addEventListener('change', () => {
    appState.selectedMapId = pauseMapSelect.value;
    syncLobbyMapSelectionUi(appState.selectedMapId);
    saveUserPrefs({ selectedMap: appState.selectedMapId });
    appState.socket.emit('changeMap', { mapId: pauseMapSelect.value });
  });
}

const handleSensSliderChange = () => {
  const val = Math.max(0.3, Math.min(2.5, Math.round(Number(sensSlider.value) * 10) / 10));
  sensValue.textContent = val.toFixed(1);
  appState.game.sensitivity = val;
  appState.game.mouseSensitivity = val;
  saveUserPrefs({ sensitivity: val });
};
sensSlider.addEventListener('input', handleSensSliderChange);
sensSlider.addEventListener('change', handleSensSliderChange);

soundCheckbox.addEventListener('change', () => {
  appState.sfx.enabled = soundCheckbox.checked;
  if (appState.sfx.enabled) {
    appState.sfx.ensureContext();
  }
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
const bootAntialias = appState.game.quality.antialias;
appState.qualityNotice = '';

function renderQualityUi() {
  const tierLabel = QUALITY_LABELS[appState.game.tier] || appState.game.tier;
  let text =
    appState.game.qualityChoice === 'auto'
      ? `Tự động: máy được nhận diện ở mức ${tierLabel}.`
      : `Đang dùng mức ${tierLabel}.`;
  if (appState.qualityNotice) text += ` ${appState.qualityNotice}`;
  for (const sel of qualitySelects) sel.value = appState.game.qualityChoice;
  for (const el of qualityHints) el.textContent = text;
}

function handleQualityChange(choice) {
  const info = appState.game.applyQuality(choice);
  const notes = [];
  if (info.pendingMapRebuild) notes.push('Chi tiết mô hình áp dụng đầy đủ khi đổi bản đồ / ván sau.');
  if (Boolean(info.preset.antialias) !== Boolean(bootAntialias)) notes.push('Khử răng cưa cần tải lại trang.');
  appState.qualityNotice = notes.join(' ');
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
  appState.game
    .preloadAssets(onProgress)
    .catch(() => {})
    .finally(() => {
      finished = true;
      clearTimeout(showTimer);
      box?.classList.add('hidden');
    });
}

activeRoomsList.addEventListener('click', (e) => {
  const btn = e.target.closest('.room-item-join');
  if (!btn) return;
  if (btn.dataset.mode) {
    appState.selectedGameMode = btn.dataset.mode === 'tdm' ? 'tdm' : 'ffa';
  }
  requestJoinRoom({ mode: 'public', roomCode: btn.dataset.code });
});

btnRefreshRooms.addEventListener('click', fetchActiveRooms);
fetchActiveRooms();
}

// ---- LAN server for private rooms ----
// Quick play / public rooms stay on this server. "Create private room" navigates to the office LAN server instead (when one is
// configured via LAN_SERVER_URL on the public server or typed below), which creates the room at 50 Hz and hands out LAN links.
const LAN_URL_STORAGE_KEY = 'polystrike_lan_url';
let lanServerUrl = ''; // '' = create private rooms on this server

function readSavedLanUrl() {
  try {
    return localStorage.getItem(LAN_URL_STORAGE_KEY) || '';
  } catch {
    return '';
  }
}

async function refreshLanServerUrl() {
  let url = normalizeLanUrl(readSavedLanUrl());
  if (!url) {
    try {
      const res = await fetch('/api/config', { cache: 'no-store' });
      if (res.ok) url = normalizeLanUrl((await res.json()).lanUrl);
    } catch {
      // offline or an older server: private rooms are created here
    }
  }
  lanServerUrl = url && url !== window.location.origin ? url : '';
  if (lanRoomHint) {
    lanRoomHint.textContent = lanServerUrl ? `Phòng riêng sẽ mở trên server LAN ${ lanServerUrl } (máy host cần đang chạy npm run lan).` : '';
    lanRoomHint.classList.toggle('hidden', !lanServerUrl);
  }
}

/** Called from main.js once appState.socket exists. */
export function initLanServerRoom() {
  if (lanUrlInput) lanUrlInput.value = readSavedLanUrl();
  btnSaveLanUrl?.addEventListener('click', async () => {
    const raw = lanUrlInput.value.trim();
    const url = normalizeLanUrl(raw);
    if (raw && !url) {
      lobbyError.textContent = 'Địa chỉ server LAN không hợp lệ (ví dụ 192.168.2.161:3000).';
      lobbyError.classList.remove('hidden');
      return;
    }
    lobbyError.classList.add('hidden');
    try {
      if (url) localStorage.setItem(LAN_URL_STORAGE_KEY, url);
      else localStorage.removeItem(LAN_URL_STORAGE_KEY);
    } catch {
      // storage unavailable: the address only applies until reload
    }
    lanUrlInput.value = url;
    await refreshLanServerUrl();
    showToast(lanServerUrl ? '✅ Đã lưu server LAN' : 'Đã xóa server LAN: phòng riêng tạo trên server này');
  });
  refreshLanServerUrl();

  const applyLobbySelections = ({ name, mapId, gameMode }) => {
    if (name) playerNameInput.value = name;
    if (mapId && Object.hasOwn(MAPS, mapId)) {
      appState.selectedMapId = mapId;
      syncLobbyMapSelectionUi(mapId);
    }
    appState.selectedGameMode = gameMode === 'tdm' ? 'tdm' : 'ffa';
    lobbyGameModeGrid?.querySelectorAll('.game-mode-option').forEach((el) => {
      el.classList.toggle('active', el.dataset.mode === appState.selectedGameMode);
    });
  };

  // Landing on the LAN server from the public site (?create=private&name=&map=&mode=): create the private room right away.
  const lanCreate = parseCreateParams(window.location.search);
  if (lanCreate) {
    window.history.replaceState(null, '', window.location.pathname || '/'); // a reload must not create another room
    applyLobbySelections(lanCreate);
    const createNow = () => requestJoinRoom({ mode: 'private', roomCode: '' });
    if (appState.socket.connected) createNow();
    else appState.socket.once('connect', createNow);
  }

  // "Chơi qua LAN" (this browser hosts the room, guests join over WebRTC): see lanHost/lanMode.js
  const lanPref = 'polystrike_lan_p2p';
  if (lanP2pCheckbox) {
    try { lanP2pCheckbox.checked = localStorage.getItem(lanPref) === '1'; } catch { /* storage unavailable */ }
    lanP2pCheckbox.addEventListener('change', () => {
      try { localStorage.setItem(lanPref, lanP2pCheckbox.checked ? '1' : '0'); } catch { /* storage unavailable */ }
    });
  }
  const lan = appState.lanInfo;
  if (lan?.error) {
    applyLobbySelections(lan);
    lobbyError.textContent = lanErrorText(lan.error);
    lobbyError.classList.remove('hidden');
  } else if (lan?.role === 'host') {
    applyLobbySelections(lan);
    requestJoinRoom({ mode: 'private', roomCode: lan.code });
  } else if (lan?.role === 'guest' && !appState.socket.connected) {
    appState.serverErrorShown = true; // cleared (and the message hidden) by the socket's `connect`
    lobbyError.textContent = '🔌 Đang kết nối LAN tới chủ phòng...';
    lobbyError.classList.remove('hidden');
  }
}
