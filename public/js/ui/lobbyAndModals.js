import {
  DEFAULT_MAP_ID,
  PRIMARY_WEAPONS,
  SECONDARY_WEAPONS,
  WEAPONS,
  getMapConfig
} from '../shared.js';
import { SERVER_UNREACHABLE_MESSAGE } from '../networkAdapter.js';
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

export function renderLoadoutModal() {
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
    buildWeaponCardHtml(wId, appState.selectedLoadout.primary === wId, WEAPONS[wId]?.category)
  ).join('');

  const secondaryHtml = SECONDARY_WEAPONS.map((wId) =>
    buildWeaponCardHtml(wId, appState.selectedLoadout.secondary === wId, 'PHỤ [2]')
  ).join('');
  const meleeHtml = buildWeaponCardHtml('knife', true, 'DAO [3]');
  loadoutSecondaryGrid.innerHTML = secondaryHtml + meleeHtml;
}

export function toggleLoadoutModal(forceOpen = null) {
  if (!appState.game.inMatch || !loadoutModal) return;
  const isCurrentlyHidden = loadoutModal.classList.contains('hidden');
  const shouldOpen = forceOpen !== null ? forceOpen : isCurrentlyHidden;

  if (shouldOpen) {
    renderLoadoutModal();
    pauseModal.classList.add('hidden');
    loadoutModal.classList.remove('hidden');
    appState.game.exitPointerLock();
  } else {
    loadoutModal.classList.add('hidden');
    if (deathOverlay.classList.contains('hidden') && matchEndModal.classList.contains('hidden')) {
      appState.game.requestPointerLock();
    }
  }
}

export function syncLobbyWeaponSelectionUi(weaponId) {
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

export function syncLobbyMapSelectionUi(mapId) {
  if (mapGrid) {
    mapGrid.querySelectorAll('.map-option').forEach((el) => {
      el.classList.toggle('active', el.dataset.map === mapId);
    });
  }
  if (pauseMapSelect) {
    pauseMapSelect.value = mapId;
  }
}

export function applySelectedLoadoutAndNotify() {
  appState.game.setLoadout(appState.selectedLoadout);
  syncHotbarSlotsHud();
  syncLobbyWeaponSelectionUi(appState.selectedLoadout.primary);
  saveUserPrefs({
    primaryWeapon: appState.selectedLoadout.primary,
    secondaryWeapon: appState.selectedLoadout.secondary
  });
  appState.socket.emit('updateLoadout', appState.selectedLoadout);
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

    // 2. Primary & Secondary Weapons (Lobby Grid, 3D Showcase, Hotbar & Loadout Modal)
    appState.selectedStartingWeapon = userPrefs.primaryWeapon;
    appState.selectedLoadout.primary = userPrefs.primaryWeapon;
    appState.selectedLoadout.secondary = userPrefs.secondaryWeapon;
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

export function requestJoinRoom({ mode = 'public', roomCode = '' }) {
  lobbyError.classList.add('hidden');
  if (!appState.socket.connected) {
    lobbyError.textContent = `${ SERVER_UNREACHABLE_MESSAGE }. Vui lòng đợi hoặc tải lại trang.`;
    lobbyError.classList.remove('hidden');
    return;
  }
  const rawName = playerNameInput.value.trim();
  const name = (rawName.replace(/[<>&"'`]/g, '').trim().slice(0, 16)) || userPrefs.playerName || 'Striker';

  appState.selectedLoadout.primary = appState.selectedStartingWeapon;
  saveUserPrefs({
    playerName: name,
    primaryWeapon: appState.selectedStartingWeapon,
    secondaryWeapon: appState.selectedLoadout.secondary,
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
      appState.game.setLobbyWeapon(wId);
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
      appState.selectedLoadout.secondary = wId;
      applySelectedLoadoutAndNotify();
    }
  });
}

if (btnSaveLoadout) {
  btnSaveLoadout.addEventListener('click', () => {
    applySelectedLoadoutAndNotify();
    toggleLoadoutModal(false);
    showToast(`🎒 ${ WEAPONS[appState.selectedLoadout.primary].name } + ${ WEAPONS[appState.selectedLoadout.secondary].name }`);
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
  appState.selectedStartingWeapon = btn.dataset.weapon;
  appState.selectedLoadout.primary = appState.selectedStartingWeapon;
  syncLobbyWeaponSelectionUi(appState.selectedStartingWeapon);
  appState.game.setLoadout(appState.selectedLoadout);
  appState.game.setLobbyWeapon(appState.selectedStartingWeapon);
  syncHotbarSlotsHud();
  saveUserPrefs({ primaryWeapon: appState.selectedStartingWeapon });
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

