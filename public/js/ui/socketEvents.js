import {
  DEFAULT_MAP_ID,
  MATCH_CONFIG,
  WEAPONS,
  getMapConfig
} from '../shared.js';
import { installRejoinOnReconnect, SERVER_UNREACHABLE_MESSAGE } from '../networkAdapter.js';
import { LAN_LOST_MESSAGE, lanErrorText, restoreOnlineSession } from '../lanHost/lanMode.js';
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
  lanState,
  escapeHtml,
  formatTime,
  getShareableRoomUrl
} from './domElements.js';
import { MULTI_KILL_WINDOW_MS, appState, saveUserPrefs } from './userPrefsAndKeys.js';
import {
  addKillFeedItem,
  clearAdrenalineHealHud,
  clearSpawnProtectionHud,
  renderScoreboard,
  showCenterBanner,
  showMultiKillBanner,
  showToast,
  syncHotbarSlotsHud,
  triggerAdrenalineHealFeedback,
  triggerHitmarkerFeedback,
  triggerSpawnProtectionHud,
  updateActiveBuffsHud,
  updateArmorHud,
  updateGrenadeHud,
  updateHpHud,
  updateMapHud,
  updateTeamScoreHud,
  updateWeaponHud
} from './hudController.js';
import {
  fetchActiveRooms,
  leaveActiveRoom,
  renderTeamWaitingLobby,
  resetDeathRespawnUi,
  startLanGuestInPlace,
  syncLobbyWeaponSelectionUi
} from './lobbyAndModals.js';

export const SHOT_REJECT_MESSAGES = {
  ammo: 'Hết đạn — đã đồng bộ lại băng đạn',
  reload: 'Đang nạp đạn — phát bắn bị huỷ',
  rate: 'Nhịp bắn chưa hồi — đã hoàn trả đạn',
  weapon: 'Lệch vũ khí — đã đồng bộ lại',
  seq: 'Lệch thứ tự phát bắn — đã đồng bộ lại',
  dead: 'Đã hạ gục — phát bắn không hợp lệ'
};

export function handleTeamLobbyState(data) {
  if (!appState.activeRoomCode || !data) return;
  if (Array.isArray(data.players)) {
    appState.latestPlayers = appState.playerStateCache.merge(data.players);
  }
  if (data.gameMode) {
    appState.currentRoomGameMode = data.gameMode === 'tdm' ? 'tdm' : 'ffa';
  }
  if (data.state) {
    appState.currentRoomState = data.state;
  }
  if (data.hostId) {
    appState.currentRoomHostId = data.hostId;
  }
  if (data.teamScores) {
    updateTeamScoreHud(data.teamScores);
  }
  renderTeamWaitingLobby(data);
  if (appState.currentRoomGameMode === 'tdm' && appState.currentRoomState === 'WAITING') {
    teamLobbyModal?.classList.remove('hidden');
  }
}

export function measurePing() {
  if (!appState.game.inMatch && !appState.activeRoomCode) return;
  if (!appState.socket?.connected) return;
  const now = performance.now();
  if (appState._pingInFlightAt && now - appState._pingInFlightAt < 4000) return;
  appState._pingInFlightAt = now;
  const start = now;
  appState.socket.emit('pingCheck', start, () => {
    appState._pingInFlightAt = 0;
    const rawRtt = Math.max(0, Math.round(performance.now() - start));
    if (!Array.isArray(appState._pingSamples)) {
      appState._pingSamples = [];
    }
    const samples = appState._pingSamples;
    samples.push(rawRtt);
    if (samples.length > 3) samples.shift();
    let filteredRtt = rawRtt;
    if (samples.length === 3) {
      const a = samples[0];
      const b = samples[1];
      const c = samples[2];
      filteredRtt = Math.max(Math.min(a, b), Math.min(Math.max(a, b), c));
    }
    const prevRtt = Number(appState.currentPingMs);
    const rtt = prevRtt > 0
      ? Math.round(prevRtt * 0.6 + filteredRtt * 0.4)
      : filteredRtt;
    appState.currentPingMs = rtt;
    const jitter = samples.length >= 2 ? Math.max(...samples) - Math.min(...samples) : 0;
    appState.currentJitterMs = jitter;
    const netQuality = (rtt > 100 || jitter > 40) ? 'bad' : (rtt > 45 || jitter > 18) ? 'warn' : 'good';
    if (hudPing?.style) {
      hudPing.style.color = netQuality === 'bad' ? '#f87171' : netQuality === 'warn' ? '#facc15' : '#4ade80';
    }
    if (hudPing?.setAttribute) {
      hudPing.setAttribute('title', `Ping: ${rtt}ms • Jitter: ±${jitter}ms`);
    }
    if (appState.hudCache.ping !== rtt) {
      appState.hudCache.ping = rtt;
      hudPing.textContent = String(rtt);
    }
    appState.game.setNetworkRtt?.(rtt); // render clock: adds the one-way latency back into the server-time estimate
  });
}

const boundSockets = new WeakSet();
let pingIntervalStarted = false;

function syncLanHostMeta(extra = {}) {
  if (appState.lanInfo?.role !== 'host') return;
  const sig = appState.netClient?.signalSocket;
  if (!sig || typeof sig.emit !== 'function') return;
  const peerGuests = Number(appState.lanInfo?.peerCount?.() ?? appState.lanInfo?.session?.peerCount?.()) || 0;
  const playerCount = Array.isArray(appState.latestPlayers) && appState.latestPlayers.length > 0 ? appState.latestPlayers.length : 1;
  sig.emit('lanHostUpdate', {
    mapId: appState.game?.currentMapConfig?.id || appState.selectedMapId || DEFAULT_MAP_ID,
    gameMode: appState.currentRoomGameMode || 'ffa',
    state: appState.currentRoomState || 'PLAYING',
    humans: Math.max(1, peerGuests + 1, playerCount),
    ...extra
  });
}

export function bindGameSocketListeners(targetSocket = appState.socket) {
  if (!targetSocket || typeof targetSocket.on !== 'function' || boundSockets.has(targetSocket)) return;
  boundSockets.add(targetSocket);
  targetSocket._gameListenersBound = true;

  const onActiveSocket = (event, fn) => {
    targetSocket.on(event, (...args) => {
      if (appState.socket !== targetSocket) return;
      fn(...args);
    });
  };

  const showServerUnreachable = (err) => {
    appState.serverErrorShown = true;
    const isLan = Boolean(appState.lanInfo);
    // An in-browser LAN room does not reconnect by itself: say what went wrong instead of "retrying".
    lobbyError.textContent = isLan
      ? lanErrorText(err?.message)
      : `${ SERVER_UNREACHABLE_MESSAGE }. Đang thử kết nối lại...`;
    lobbyError.classList.remove('hidden');
    if (isLan) {
      const oldLan = appState.lanInfo;
      appState.lanInfo = null;
      lanState.active = false;
      const restored = restoreOnlineSession(appState.netClient, oldLan);
      if (restored) {
        appState.socket = restored;
        bindGameSocketListeners(restored);
      }
    }
  };
  if (appState.netInitFailed) showServerUnreachable();
  onActiveSocket('connect_error', showServerUnreachable);

  installRejoinOnReconnect({
    on(event, fn) {
      onActiveSocket(event, fn);
    }
  }, {
    isInMatch: () => Boolean(appState.game.inMatch || appState.activeRoomCode),
    onLost: () => showToast(appState.lanInfo ? '⚠️ Mất kết nối LAN với chủ phòng' : '⚠️ Mất kết nối — đang kết nối lại...'),
    rejoin: () => {
      if (!appState.lastJoinPayload) return;
      appState.game.clearAllRemotePlayers();
      appState.socket.emit('joinRoom', { ...appState.lastJoinPayload, roomCode: appState.activeRoomCode || appState.lastJoinPayload.roomCode });
    },
    onReconnected: () => showToast('🔄 Đã kết nối lại — vào lại phòng')
  });

onActiveSocket('disconnect', () => {
  appState._pingInFlightAt = 0;
  if (appState.lanInfo) {
    // LAN room: the host left or the link dropped; there is no automatic reconnect, so go back to the lobby with the reason.
    if (appState.game.inMatch || appState.activeRoomCode) {
      leaveActiveRoom({ emitLeave: false });
    } else {
      const oldLan = appState.lanInfo;
      appState.lanInfo = null;
      lanState.active = false;
      const restored = restoreOnlineSession(appState.netClient, oldLan);
      if (restored) {
        appState.socket = restored;
        bindGameSocketListeners(restored);
      }
    }
    appState.serverErrorShown = true;
    lobbyError.textContent = LAN_LOST_MESSAGE;
    lobbyError.classList.remove('hidden');
    return;
  }
  if (!appState.game.inMatch && !appState.activeRoomCode) showServerUnreachable();
});
onActiveSocket('connect', () => {
  if (appState.serverErrorShown) {
    appState.serverErrorShown = false;
    lobbyError.classList.add('hidden');
  }
  fetchActiveRooms();
});

onActiveSocket('lanRoomRedirect', (data) => {
  const code = data?.roomCode;
  if (code) {
    appState.knownLanCodes?.add(code);
    startLanGuestInPlace(code);
  }
});

onActiveSocket('joinError', ({ message }) => {
  if (appState.activeRoomCode || appState.game.inMatch) {
    leaveActiveRoom({ emitLeave: false });
  }
  lobbyError.textContent = message;
  lobbyError.classList.remove('hidden');
});

onActiveSocket('roomJoined', (data) => {
  appState._pingInFlightAt = 0;
  appState._pingSamples = [];
  appState.activeRoomCode = data.roomCode;
  appState.game.localId = data.playerId;
  appState.currentRoomGameMode = data.gameMode === 'tdm' ? 'tdm' : 'ffa';
  appState.currentRoomState = data.state || 'PLAYING';
  appState.currentRoomHostId = data.hostId || null;
  appState.currentLocalTeam = data.player?.team || null;
  appState.currentLocalReady = Boolean(data.player?.ready);
  const isWaitingTeamLobby = appState.currentRoomGameMode === 'tdm' && appState.currentRoomState === 'WAITING';
  appState.game.inMatch = !isWaitingTeamLobby;
  appState.game.setTeamState?.(appState.currentRoomGameMode, appState.currentLocalTeam);
  appState.game.clearAllRemotePlayers();
  appState.game.snapshots?.configure?.(data.net); // server tick rate -> interpolation delay floor

  // Load room map geometry & update HUD map indicators
  const roomMapId = data.mapId || appState.selectedMapId || DEFAULT_MAP_ID;
  appState.game.loadMap(roomMapId);
  updateMapHud(roomMapId);

  // Update browser URL with ?room=CODE so copying URL directly from address bar works
  const shareUrl = getShareableRoomUrl(appState.activeRoomCode);
  window.history.replaceState(null, '', new URL(shareUrl).search);

  hudRoomCode.textContent = `#${ appState.activeRoomCode }`;
  sbRoomCode.textContent = `#${ appState.activeRoomCode }`;
  pauseInviteUrl.value = shareUrl;
  hudKillLimit.textContent = String(data.killLimit || (appState.currentRoomGameMode === 'tdm' ? 30 : 20));
  appState.hudCache.leaderText = '';
  appState.hudCache.leaderId = null;
  hudTimer.textContent = formatTime(data.timeRemaining || 300);
  updateTeamScoreHud(data.teamScores || { alpha: 0, bravo: 0 });

  // Set starting 3-slot loadout & spawn position
  if (data.player.loadout) {
    appState.selectedLoadout = {
      primary: data.player.loadout.primary || appState.selectedLoadout.primary || appState.selectedStartingWeapon,
      secondary: data.player.loadout.secondary || appState.selectedLoadout.secondary || 'pistol',
      melee: data.player.loadout.melee || appState.selectedLoadout.melee || 'knife'
    };
  } else {
    appState.selectedLoadout.primary = data.player.weapon || appState.selectedStartingWeapon;
  }
  appState.game.setLoadout(appState.selectedLoadout, appState.selectedLoadout.primary);
  appState.game.resetNetcode(data.player.moveEpoch); // fresh command sequence for the new server-side player
  appState.game.spawnLocalPlayer(data.player);
  appState.localMultiKillCount = 0;
  appState.lastLocalKillAt = 0;
  clearAdrenalineHealHud();
  multikillBanner?.classList.add('hidden');
  updateHpHud(data.player.hp);
  updateGrenadeHud(data.player.grenades ?? data.player.grenadeCount ?? 1);
  if (!isWaitingTeamLobby) {
    triggerSpawnProtectionHud(data.player.spawnProtectionMs || MATCH_CONFIG.SPAWN_PROTECTION_MS || 1500);
  }
  const wCfg = WEAPONS[appState.game.currentWeapon] || WEAPONS.rifle;
  updateWeaponHud(
    appState.game.currentWeapon,
    appState.game.ammoByWeapon[appState.game.currentWeapon] ?? wCfg.magSize,
    appState.game.reserveAmmoByWeapon[appState.game.currentWeapon] ?? wCfg.reserveAmmo ?? wCfg.magSize
  );

  appState.game.syncPickups(data.pickups || []);
  appState.game.syncBarrels?.(data.barrels || []);
  appState.game.syncDroppedWeapons(data.droppedWeapons || []);
  appState.game.syncGrenades?.(data.activeGrenades || []);
  appState.latestPlayers = appState.playerStateCache.merge(data.players);
  appState.game.syncPlayersState(appState.latestPlayers);

  // Switch UI from Lobby to Team Waiting Lobby or In-Match HUD
  lobbyScreen.classList.add('hidden');
  pauseModal.classList.add('hidden');
  loadoutModal?.classList.add('hidden');
  resetDeathRespawnUi(false);
  deathOverlay.classList.add('hidden');
  matchEndModal.classList.add('hidden');

  if (isWaitingTeamLobby) {
    hudScreen.classList.add('hidden');
    teamLobbyModal?.classList.remove('hidden');
    renderTeamWaitingLobby({
      roomCode: appState.activeRoomCode,
      gameMode: appState.currentRoomGameMode,
      state: appState.currentRoomState,
      hostId: appState.currentRoomHostId,
      mapId: roomMapId,
      mapName: getMapConfig(roomMapId).name,
      killLimit: data.killLimit || 30,
      players: appState.latestPlayers
    });
    showToast(`🛡️ Phòng Đấu Đội #${ appState.activeRoomCode } • Chọn phe và Sẵn sàng!`);
  } else {
    teamLobbyModal?.classList.add('hidden');
    hudScreen.classList.remove('hidden');
    appState.game.requestPointerLock();
    showToast(`🎯 Phòng #${ appState.activeRoomCode } • ${ getMapConfig(roomMapId).name }`);
  }
  syncLanHostMeta({ mapId: roomMapId });
});

onActiveSocket('loadoutUpdated', (data) => {
  if (!appState.game.inMatch && !appState.activeRoomCode) return;
  if (data?.loadout?.pending) {
    // Mid-life loadout swaps are applied on the next respawn (prefs below keep the pending pick)
    showToast('🎒 Trang bị mới sẽ có hiệu lực khi hồi sinh');
  }
  if (data?.loadout) {
    appState.selectedLoadout = {
      primary: data.loadout.primary || appState.selectedLoadout.primary,
      secondary: data.loadout.secondary || appState.selectedLoadout.secondary,
      melee: data.loadout.melee || appState.selectedLoadout.melee
    };
    appState.selectedStartingWeapon = appState.selectedLoadout.primary;
    const activeSlot = WEAPONS[appState.game.currentWeapon]?.slot || 1;
    const nextActiveWep = (!data.loadout.pending && activeSlot === 1) ? appState.selectedLoadout.primary : null;
    if (nextActiveWep && WEAPONS[nextActiveWep] && appState.game.ammoByWeapon) {
      appState.game.ammoByWeapon[nextActiveWep] = WEAPONS[nextActiveWep].magSize;
      appState.game.reserveAmmoByWeapon[nextActiveWep] = WEAPONS[nextActiveWep].reserveAmmo ?? 90;
    }
    appState.game.setLoadout(appState.selectedLoadout, nextActiveWep);
    syncLobbyWeaponSelectionUi(appState.selectedStartingWeapon);
    syncHotbarSlotsHud();
    saveUserPrefs({
      primaryWeapon: data.loadout.pending?.primary || appState.selectedLoadout.primary,
      secondaryWeapon: data.loadout.pending?.secondary || appState.selectedLoadout.secondary
    });
  }
});

onActiveSocket('playerJoined', (data) => {
  if ((!appState.game.inMatch && !appState.activeRoomCode) || !data?.name) return;
  showToast(`👤 ${ data.name } đã vào phòng`);
  syncLanHostMeta({ humans: Math.max(1, (appState.latestPlayers?.length || 1) + 1) });
});

onActiveSocket('mapChanged', (data) => {
  if (!appState.game.inMatch && !appState.activeRoomCode) return;
  const newMapId = data.mapId || DEFAULT_MAP_ID;
  appState.game.loadMap(newMapId);
  updateMapHud(newMapId);
  appState.game.syncPickups(data.pickups || []);
  appState.game.syncBarrels?.(data.barrels || []);
  appState.game.syncDroppedWeapons(data.droppedWeapons || []);
  appState.game.syncGrenades?.(data.activeGrenades || []);
  appState.latestPlayers = appState.playerStateCache.merge(data.players);
  appState.game.syncPlayersState(appState.latestPlayers);

  appState.localMultiKillCount = 0;
  appState.lastLocalKillAt = 0;
  clearAdrenalineHealHud();
  multikillBanner?.classList.add('hidden');

  const me = appState.latestPlayers.find((p) => p.id === appState.game.localId);
  if (me && appState.game.inMatch) {
    if (appState.respawnInterval) clearInterval(appState.respawnInterval);
    resetDeathRespawnUi(false);
    deathOverlay.classList.add('hidden');
    damageOverlay.style.opacity = '0';
    appState.game.spawnLocalPlayer(me);
    updateHpHud(me.hp);
    updateGrenadeHud(me.grenades ?? me.grenadeCount ?? 1);
    triggerSpawnProtectionHud(MATCH_CONFIG.SPAWN_PROTECTION_MS || 1500);
  }
  showToast(`🗺️ ${ data.mapName || getMapConfig(newMapId).name }`);
  syncLanHostMeta({ mapId: newMapId });
});

// Server RTT probe: echo straight back so the server can measure round-trip time itself
onActiveSocket('latencyProbe', (t, cb) => cb?.(t));

// Server ended our spawn protection early (we fired / threw a grenade)
onActiveSocket('spawnProtectionEnded', (data) => {
  if (data?.playerId && data.playerId === appState.game.localId) clearSpawnProtectionHud();
});

// Server rejected a host-only or team-lobby action: tell the player and restore the controls
onActiveSocket('actionDenied', (data) => {
  if (!appState.game.inMatch && !appState.activeRoomCode) return;
  showToast(`⛔ ${ data?.message || 'Hành động không được phép.' }`);
  if (data?.action === 'changeMap') {
    updateMapHud(appState.game.currentMapConfig?.id || appState.selectedMapId);
  }
});

onActiveSocket('hostChanged', (data) => {
  if ((!appState.game.inMatch && !appState.activeRoomCode) || !data?.name) return;
  if (data.hostId) {
    appState.currentRoomHostId = data.hostId;
    if (appState.currentRoomGameMode === 'tdm' && appState.currentRoomState === 'WAITING') {
      renderTeamWaitingLobby({ hostId: data.hostId, players: appState.latestPlayers });
    }
  }
  showToast(`👑 ${ data.name } là chủ phòng mới`);
});

// Authoritative movement state for the commands the server has simulated (sent to this player only):
// reconciles the client-side prediction (epoch change = server teleport/respawn => snap)
onActiveSocket('moveAck', (ack) => {
  appState.game.applyMoveAck(ack);
});

// Owner-only secret of the deterministic weapon spread for the new life (the server sends it right before the
// `playerRespawned` broadcast; the first one arrives inside `roomJoined.player.spreadSeed`)
onActiveSocket('selfSeed', (data) => {
  appState.game.setSpreadSeed(data?.spreadSeed);
});

onActiveSocket('shotRejected', (data) => {
  if (!appState.game.inMatch || !data) return;
  appState.game.applyShotRejected(data);
  const now = performance.now();
  if (now - appState.lastShotRejectToastAt >= 1800) {
    appState.lastShotRejectToastAt = now;
    const msg = SHOT_REJECT_MESSAGES[data.reason] || 'Phát bắn bị từ chối — đã đồng bộ lại đạn';
    showToast(`⚠️ ${ msg }`);
  }
});

// Owner-only combat/ammo/reload state reconciliation (~8Hz + on state change)
onActiveSocket('selfState', (state) => {
  if (!appState.game.inMatch || !state) return;
  appState.game.applySelfState(state);
});

onActiveSocket('playerLeft', (data) => {
  if ((!appState.game.inMatch && !appState.activeRoomCode) || !data?.playerId) return;
  appState.latestPlayers = appState.latestPlayers.filter((p) => p.id !== data.playerId);
  appState.game.syncPlayersState(appState.latestPlayers);
  if (appState.currentRoomGameMode === 'tdm' && appState.currentRoomState === 'WAITING') {
    renderTeamWaitingLobby({ players: appState.latestPlayers });
  }
  syncLanHostMeta({ humans: Math.max(1, appState.latestPlayers.length) });
});

onActiveSocket('stateUpdate', (snapshot) => {
  if (!appState.game.inMatch || !snapshot) return;
  if (
    typeof snapshot.t === 'number' &&
    Number.isFinite(snapshot.t) &&
    appState.game.snapshots &&
    !appState.game.snapshots.acceptsEnvelope(snapshot.t)
  ) {
    return;
  }
  const remSec = Math.max(0, Math.floor(snapshot.timeRemaining || 0));
  if (appState.hudCache.timerSec !== remSec) {
    appState.hudCache.timerSec = remSec;
    hudTimer.textContent = formatTime(remSec);
  }
  if (snapshot.gameMode) {
    appState.currentRoomGameMode = snapshot.gameMode === 'tdm' ? 'tdm' : 'ffa';
  }
  if (snapshot.teamScores) {
    updateTeamScoreHud(snapshot.teamScores);
  }
  // Snapshot entries are hot-only between refreshes: rebuild complete player objects (shared/playerDelta.js)
  const latestPlayers = appState.playerStateCache.merge(snapshot.players);
  appState.latestPlayers = latestPlayers;
  // `snapshot.t` = server timestamp (ms) of this tick: remote players are drawn by snapshot interpolation
  appState.game.syncPlayersState(latestPlayers, snapshot.t);
  if (Array.isArray(snapshot.barrels)) {
    appState.game.syncBarrels?.(snapshot.barrels);
  }
  if (Array.isArray(snapshot.pickups)) {
    appState.game.syncPickups(snapshot.pickups);
  }
  if (Array.isArray(snapshot.droppedWeapons)) {
    appState.game.syncDroppedWeapons(snapshot.droppedWeapons);
  }
  if (
    Array.isArray(snapshot.activeGrenades) &&
    (snapshot.activeGrenades.length > 0 || appState.game.activeGrenadeMeshes?.size > 0)
  ) {
    appState.game.syncGrenades?.(snapshot.activeGrenades);
  }

  // Find leader and local stats
  let topPlayer = null;
  const localId = appState.game.localId;
  for (let i = 0; i < latestPlayers.length; i++) {
    const p = latestPlayers[i];
    if (!topPlayer || p.kills > topPlayer.kills) {
      topPlayer = p;
    }
    if (p.id === localId) {
      if (p.team && p.team !== appState.currentLocalTeam) {
        appState.currentLocalTeam = p.team;
        appState.game.setTeamState?.(appState.currentRoomGameMode, appState.currentLocalTeam);
      }
      if (appState.hudCache.kills !== p.kills) {
        appState.hudCache.kills = p.kills;
        hudKills.textContent = String(p.kills);
      }
      if (appState.hudCache.deaths !== p.deaths) {
        appState.hudCache.deaths = p.deaths;
        hudDeaths.textContent = String(p.deaths);
      }
      if (appState.hudCache.streak !== p.streak) {
        appState.hudCache.streak = p.streak;
        hudStreak.textContent = String(p.streak);
      }
      const snapGrenades = p.grenades ?? p.grenadeCount;
      if (typeof snapGrenades === 'number') {
        const isThrowInFlight = snapGrenades > appState.localGrenades && (performance.now() - appState.lastGrenadeThrowAt) < 350;
        if (!isThrowInFlight) {
          updateGrenadeHud(snapGrenades);
        }
      }
      updateArmorHud(p.armor || 0);
      updateHpHud(p.hp);
    }
  }

  if (appState.currentRoomGameMode !== 'tdm' && topPlayer) {
    const cache = appState.hudCache;
    if (
      !cache.leaderText ||
      cache.leaderId !== topPlayer.id ||
      cache.leaderKills !== topPlayer.kills ||
      cache.leaderName !== topPlayer.name
    ) {
      cache.leaderId = topPlayer.id;
      cache.leaderKills = topPlayer.kills;
      cache.leaderName = topPlayer.name;
      const nextLeaderText = `👑 ${ topPlayer.name } (${ topPlayer.kills }/${ hudKillLimit.textContent })`;
      if (cache.leaderText !== nextLeaderText) {
        cache.leaderText = nextLeaderText;
        hudLeader.textContent = nextLeaderText;
      }
    }
  }

  if (!scoreboardModal.classList.contains('hidden')) {
    const now = performance.now();
    if (now - (appState.lastScoreboardRenderAt || 0) >= 200) {
      appState.lastScoreboardRenderAt = now;
      renderScoreboard(latestPlayers);
    }
  }
});

onActiveSocket('shotFired', (data) => {
  if (!appState.game.inMatch || data.shooterId === appState.game.localId) return;

  const endPt = data.hitPoint || {
    x: data.origin.x + data.dir.x * 55,
    y: data.origin.y + data.dir.y * 55,
    z: data.origin.z + data.dir.z * 55
  };
  appState.game.triggerRemoteShotEffect(data.shooterId, data.weapon, data.origin, endPt, Boolean(data.isPlayerHit));
  if (appState.game.alive && !data.isPlayerHit && data.origin && endPt) {
    const headX = appState.game.position.x;
    const headY = (appState.game.position.y || 0) + 1.45;
    const headZ = appState.game.position.z;
    const vx = endPt.x - data.origin.x;
    const vy = endPt.y - data.origin.y;
    const vz = endPt.z - data.origin.z;
    const lenSq = vx * vx + vy * vy + vz * vz;
    if (lenSq > 0.25) {
      const t = Math.max(0, Math.min(1, ((headX - data.origin.x) * vx + (headY - data.origin.y) * vy + (headZ - data.origin.z) * vz) / lenSq));
      if (t > 0.04) {
        const cx = data.origin.x + vx * t;
        const cy = data.origin.y + vy * t;
        const cz = data.origin.z + vz * t;
        const dist = Math.hypot(headX - cx, headY - cy, headZ - cz);
        if (dist <= 2.4) {
          appState.sfx.playBulletWhizz?.({ x: headX, y: headY, z: headZ, yaw: appState.game.yaw }, { x: cx, y: cy, z: cz }, dist);
        }
      }
    }
  }
});

onActiveSocket('damageDealt', (data) => {
  if (!appState.game.inMatch) return;

  if (data.targetId && data.targetId !== appState.game.localId && typeof data.hp === 'number') {
    const rp = appState.game.remotePlayers?.get(data.targetId);
    if (rp) {
      rp.hp = data.hp;
    }
  }

  // We hit an enemy -> Show Distinct Body/Armor/Headshot/Kill Hitmarker + Floating 3D/HUD Damage Popup
  if (data.attackerId === appState.game.localId && data.targetId !== appState.game.localId) {
    const isHs = Boolean(data.isHeadshot);
    const isKillHit = typeof data.hp === 'number' && data.hp <= 0;
    const armorDamage = Number(data.armorDamage) || 0;
    const armorBroken = Boolean(data.armorBroken);

    triggerHitmarkerFeedback({
      targetId: data.targetId,
      damage: data.damage,
      armorDamage,
      armorBroken,
      isHeadshot: isHs,
      isWallbang: Boolean(data.isWallbang),
      isKill: isKillHit
    });

    if (isHs) {
      appState.sfx.playHeadshotDink?.();
    } else if (armorBroken || armorDamage > 0) {
      appState.sfx.playArmorHit?.(armorBroken);
    } else {
      appState.sfx.playHitmarker?.(false);
    }

    appState.game.spawnDamagePopup(data.targetId, data.damage, isHs, {
      armorDamage,
      armorBroken,
      isKill: isKillHit
    });
  }

  // Someone hit us -> Flash damage overlay, camera flinch, directional arc & update HP/Armor
  if (data.targetId === appState.game.localId) {
    if (typeof data.armor === 'number') updateArmorHud(data.armor);
    if (data.armorBroken) {
      appState.sfx.playArmorHit?.(true);
      showCenterBanner('🛡️ GIÁP KEVLAR ĐÃ VỠ!');
    } else if ((Number(data.armorDamage) || 0) > 0) {
      appState.sfx.playArmorHit?.(false);
    } else {
      appState.sfx.playHitmarker?.(false);
    }
    updateHpHud(data.hp);
    appState.game.applyDamageFlinch(data.damage);
    damageOverlay.style.opacity = '0.88';
    setTimeout(() => {
      damageOverlay.style.opacity = data.hp < 30 ? '0.35' : '0';
    }, 180);

    if (data.attackerPos && damageDirIndicator) {
      const dx = data.attackerPos.x - appState.game.position.x;
      const dz = data.attackerPos.z - appState.game.position.z;
      const forwardDot = dx * (-Math.sin(appState.game.yaw)) + dz * (-Math.cos(appState.game.yaw));
      const rightDot = dx * Math.cos(appState.game.yaw) + dz * (-Math.sin(appState.game.yaw));
      const angleDeg = Math.atan2(rightDot, forwardDot) * (180 / Math.PI);

      damageDirIndicator.style.transform = `translate(-50%, -50%) rotate(${ angleDeg.toFixed(1) }deg)`;
      damageDirIndicator.classList.remove('hidden');
      if (appState.damageDirTimer) clearTimeout(appState.damageDirTimer);
      appState.damageDirTimer = setTimeout(() => {
        damageDirIndicator.classList.add('hidden');
      }, 650);
    }
  }
});

onActiveSocket('spawnProtectedHit', (data) => {
  if (!appState.game.inMatch) return;
  if (data.attackerId === appState.game.localId) {
    showCenterBanner('🛡️ MỤC TIÊU BẤT TỬ');
  }
});

onActiveSocket('killEvent', (data) => {
  if (!appState.game.inMatch) return;
  addKillFeedItem(data);
  if (data.teamScores) {
    updateTeamScoreHud(data.teamScores);
  }

  if (data.victimId && data.victimId !== appState.game.localId) {
    const victimRp = appState.game.remotePlayers?.get(data.victimId);
    if (victimRp) {
      // Not shootable from now on (server rules) but the body stays drawn until the interpolated timeline reaches the
      // death snapshot (Game3D.updateRemotePlayers) instead of vanishing ~one render delay early
      appState.game.markRemoteDead(data.victimId);
    }
  }

  if (data.killerId === appState.game.localId && data.victimId !== appState.game.localId) {
    const now = performance.now();
    if (appState.lastLocalKillAt > 0 && now - appState.lastLocalKillAt <= MULTI_KILL_WINDOW_MS) {
      appState.localMultiKillCount += 1;
    } else {
      appState.localMultiKillCount = 1;
    }
    appState.lastLocalKillAt = now;

    const serverStreak = Number(data.multiKillCount || data.multiKill || data.killerStreak || 0);
    const multiKillCount = Math.max(appState.localMultiKillCount, serverStreak, 1);
    const healAmount = Number(data.healAmount ?? MATCH_CONFIG.KILL_ADRENALINE_HEAL ?? 25) || 25;
    const killerHp = typeof data.killerHp === 'number'
      ? data.killerHp
      : typeof data.newKillerHp === 'number'
        ? data.newKillerHp
        : null;

    if (typeof data.killerStreak === 'number' && hudStreak && appState.hudCache.streak !== data.killerStreak) {
      appState.hudCache.streak = data.killerStreak;
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

    appState.sfx.playMultiKillTone?.(multiKillCount);

    showMultiKillBanner(
      multiKillCount,
      data.victimName || 'Enemy',
      Boolean(data.isHeadshot),
      healAmount
    );
  }

  if (data.victimId === appState.game.localId) {
    appState.game.alive = false;
    appState.game.isAiming = false;
    appState.game.isMouseDown = false;
    appState.game.isRightMouseDown = false;
    appState.localMultiKillCount = 0;
    appState.lastLocalKillAt = 0;
    appState.lastGrenadeThrowAt = 0;
    clearSpawnProtectionHud();
    clearAdrenalineHealHud();
    multikillBanner?.classList.add('hidden');
    if (weaponPickupPrompt) weaponPickupPrompt.classList.add('hidden');
    sniperScope.classList.add('hidden');
    opticScope?.classList.add('hidden');
    opticScope?.classList.remove('optic-holo', 'optic-reddot');
    crosshair.classList.remove('hidden', 'aiming');
    appState.hudCache.chAiming = false;
    deathKillerName.textContent = data.killerName;
    deathWeaponName.textContent = data.weaponName || (data.weapon === 'grenade' ? 'FRAG GRENADE' : data.weapon);
    deathOverlay.classList.remove('hidden');
    appState.game.exitPointerLock?.();

    const delayMs = MATCH_CONFIG.RESPAWN_DELAY_MS || 3000;
    const readyAt = performance.now() + delayMs;
    resetDeathRespawnUi(false);
    respawnTimerEl.textContent = String(Math.ceil(delayMs / 1000));
    if (appState.respawnInterval) clearInterval(appState.respawnInterval);
    appState.respawnInterval = setInterval(() => {
      const remMs = Math.max(0, readyAt - performance.now());
      const remSec = Math.ceil(remMs / 1000);
      respawnTimerEl.textContent = String(remSec);
      if (remMs <= 0) {
        if (appState.respawnInterval) {
          clearInterval(appState.respawnInterval);
          appState.respawnInterval = null;
        }
        resetDeathRespawnUi(true);
      }
    }, 100);
  }
});

onActiveSocket('playerRespawned', (data) => {
  if (!appState.game.inMatch) return;
  if (data.playerId && data.playerId !== appState.game.localId) {
    const rp = appState.game.remotePlayers?.get(data.playerId);
    if (rp) {
      rp.alive = true;
      rp.hp = typeof data.hp === 'number' ? data.hp : 100;
      if (rp.group) {
        rp.group.position.set(data.x || 0, data.y || 0, data.z || 0);
        rp.group.rotation.y = data.yaw || 0;
        rp.group.visible = true;
      }
      // Respawn: drop the snapshot history of this entity (no interpolation streak from the death position)
      appState.game.resetRemoteInterpolation?.(data.playerId, data.x || 0, data.y || 0, data.z || 0, data.yaw || 0);
      appState.game.rebuildHitboxList?.();
    }
  }
  if (data.playerId === appState.game.localId) {
    if (appState.respawnInterval) {
      clearInterval(appState.respawnInterval);
      appState.respawnInterval = null;
    }
    resetDeathRespawnUi(false);
    deathOverlay.classList.add('hidden');
    loadoutModal?.classList.add('hidden');
    damageOverlay.style.opacity = '0';
    appState.localMultiKillCount = 0;
    appState.lastLocalKillAt = 0;
    appState.lastGrenadeThrowAt = 0;
    clearAdrenalineHealHud();
    if (data.loadout) {
      appState.selectedLoadout = {
        primary: data.loadout.primary || appState.selectedLoadout.primary,
        secondary: data.loadout.secondary || appState.selectedLoadout.secondary,
        melee: data.loadout.melee || appState.selectedLoadout.melee
      };
    }
    appState.game.spawnLocalPlayer(data);
    updateHpHud(data.hp);
    updateGrenadeHud(data.grenades ?? data.grenadeCount ?? 1);
    triggerSpawnProtectionHud(data.spawnProtectionMs || MATCH_CONFIG.SPAWN_PROTECTION_MS || 1500);
    if (pauseModal?.classList?.contains('hidden') && matchEndModal?.classList?.contains('hidden')) {
      appState.game.requestPointerLock?.();
    }
  }
});

onActiveSocket('grenadeThrown', (data) => {
  if (!appState.game.inMatch || !data) return;
  const payload = data.grenade || data;
  const ownerId = data.ownerId || data.throwerId || data.playerId || payload.ownerId;
  if (ownerId === appState.game.localId && typeof (data.grenades ?? data.grenadesRemaining) === 'number') {
    updateGrenadeHud(data.grenades ?? data.grenadesRemaining);
  } else if (ownerId && ownerId !== appState.game.localId) {
    const gx = Number(payload.x ?? data.x ?? 0);
    const gy = Number(payload.y ?? data.y ?? 0);
    const gz = Number(payload.z ?? data.z ?? 0);
    const dist = Math.hypot(gx - appState.game.position.x, gy - appState.game.position.y, gz - appState.game.position.z);
    if (dist < 32) {
      appState.sfx.playGrenadeThrow?.();
    }
  }
  appState.game.spawnGrenadeProjectile?.(data);
});

onActiveSocket('grenadeExploded', (data) => {
  if (!appState.game.inMatch || !data) return;
  const gx = data.x ?? data.position?.x ?? 0;
  const gy = data.y ?? data.position?.y ?? 0;
  const gz = data.z ?? data.position?.z ?? 0;
  const listenerState = appState.game.getAudioListenerState
    ? appState.game.getAudioListenerState()
    : { x: appState.game.position.x, y: appState.game.position.y, z: appState.game.position.z, yaw: appState.game.yaw };
  const sourcePos = { x: gx, y: gy, z: gz };
  if (typeof appState.sfx.playGrenadeExplosion === 'function') {
    appState.sfx.playGrenadeExplosion(listenerState, sourcePos);
  } else {
    const dist = Math.hypot(gx - appState.game.position.x, gy - appState.game.position.y, gz - appState.game.position.z);
    const vol = Math.max(0.08, 1 - dist / 75);
    appState.sfx.playExplosion?.(vol);
  }
  appState.game.spawnGrenadeExplosion?.(data);
});

onActiveSocket('pickupState', (data) => {
  if (!appState.game.inMatch) return;
  appState.game.updatePickupSingle(data.pickupId, data.active);

  if (data.pickerId && data.pickerId !== appState.game.localId && typeof data.newHp === 'number') {
    const rp = appState.game.remotePlayers?.get(data.pickerId);
    if (rp) {
      rp.hp = data.newHp;
    }
  }

  if (data.pickerId === appState.game.localId && !data.active) {
    const pType = data.type || 'health';
    if (pType === 'armor') {
      appState.sfx.playPowerupPickup?.('armor');
      updateArmorHud(data.newArmor ?? 50);
      showCenterBanner('🛡️ +50 GIÁP KEVLAR');
      return;
    }
    if (pType === 'speed') {
      appState.sfx.playPowerupPickup?.('speed');
      appState.game.speedBoostUntil = performance.now() + (data.speedBoostMs || 10000);
      updateActiveBuffsHud();
      showCenterBanner('⚡ TĂNG TỐC X1.3 (10S)');
      return;
    }
    if (pType === 'damage') {
      appState.sfx.playPowerupPickup?.('damage');
      appState.game.damageBoostUntil = performance.now() + (data.damageBoostMs || 10000);
      updateActiveBuffsHud();
      showCenterBanner('🔥 QUÁ TẢI SÁT THƯƠNG X1.35 (10S)');
      return;
    }
    appState.sfx.playPickup();
    updateHpHud(data.newHp);
    showCenterBanner('💚 +50 HP');
  }
});

onActiveSocket('barrelState', (data) => {
  if (!appState.game.inMatch || !data) return;
  appState.game.updateBarrelSingle?.(data);
});

onActiveSocket('barrelExploded', (data) => {
  if (!appState.game.inMatch || !data) return;
  const bx = data.x ?? 0;
  const by = data.y ?? 0;
  const bz = data.z ?? 0;
  const listenerState = appState.game.getAudioListenerState
    ? appState.game.getAudioListenerState()
    : { x: appState.game.position.x, y: appState.game.position.y, z: appState.game.position.z, yaw: appState.game.yaw };
  const sourcePos = { x: bx, y: by, z: bz };
  if (typeof appState.sfx.playGrenadeExplosion === 'function') {
    appState.sfx.playGrenadeExplosion(listenerState, sourcePos);
  }
  appState.game.onBarrelExploded?.(data);
});

onActiveSocket('streakEvent', (data) => {
  if (!appState.game.inMatch || !data) return;
  const isMe = data.playerId === appState.game.localId;
  if (data.type === 'shutdown') {
    if (isMe && typeof data.armor === 'number') {
      updateArmorHud(data.armor);
    }
    showToast(`🛑 SHUTDOWN! ${data.killerName} đã chấm dứt chuỗi ${data.endedStreak} mạng của ${data.victimName}!`);
    if (isMe) {
      showCenterBanner(`🛑 CHẤM DỨT CHUỖI (${data.rewardText || '+25 GIÁP'})`);
    }
    return;
  }
  if (isMe) {
    if (typeof data.armor === 'number') updateArmorHud(data.armor);
    if (typeof data.grenades === 'number') updateGrenadeHud(data.grenades);
    showCenterBanner(`🔥 ${data.label} (${data.streak} MẠNG) • ${data.rewardText || ''}`);
  } else {
    showToast(`🔥 ${data.playerName}: ${data.label} (${data.streak} mạng liên tiếp)!`);
  }
});

onActiveSocket('weaponDropped', (drop) => {
  if (!appState.game.inMatch || !drop) return;
  appState.game.addDroppedWeapon(drop);
});

onActiveSocket('weaponDropExpired', ({ dropId }) => {
  if (!appState.game.inMatch || !dropId) return;
  appState.game.removeDroppedWeapon(dropId);
});

onActiveSocket('weaponSwapped', (data) => {
  if (!appState.game.inMatch || !data) return;
  if (data.pickedDropId) {
    appState.game.removeDroppedWeapon(data.pickedDropId);
  }
  if (data.playerId === appState.game.localId) {
    appState.selectedLoadout.primary = data.weapon;
    appState.game.applySwappedWeapon(data);
    appState.sfx.playWeaponDrop?.();
    const wCfg = WEAPONS[data.weapon];
    showCenterBanner(`🔫 ${ wCfg ? wCfg.name : data.weapon } (${ data.ammo }/${ data.reserveAmmo })`);
  }
});

onActiveSocket('droppedWeaponsUpdate', ({ droppedWeapons }) => {
  if (!appState.game.inMatch || !Array.isArray(droppedWeapons)) return;
  appState.game.syncDroppedWeapons(droppedWeapons);
});

onActiveSocket('matchEnded', (data) => {
  if (!appState.game.inMatch) return;
  if (appState.respawnInterval) {
    clearInterval(appState.respawnInterval);
    appState.respawnInterval = null;
  }
  resetDeathRespawnUi(false);
  appState.game.isAiming = false;
  clearSpawnProtectionHud();
  clearAdrenalineHealHud();
  multikillBanner?.classList.add('hidden');
  if (weaponPickupPrompt) weaponPickupPrompt.classList.add('hidden');
  appState.game.exitPointerLock();
  pauseModal.classList.add('hidden');
  loadoutModal?.classList.add('hidden');
  deathOverlay.classList.add('hidden');
  sniperScope.classList.add('hidden');
  opticScope?.classList.add('hidden');
  opticScope?.classList.remove('optic-holo', 'optic-reddot');
  crosshair.classList.remove('hidden', 'aiming');
  appState.hudCache.chAiming = false;

  if (data.gameMode === 'tdm' || appState.currentRoomGameMode === 'tdm') {
    const alphaK = Number(data.teamScores?.alpha ?? appState.currentTeamScores.alpha ?? 0);
    const bravoK = Number(data.teamScores?.bravo ?? appState.currentTeamScores.bravo ?? 0);
    updateTeamScoreHud({ alpha: alphaK, bravo: bravoK });
    if (data.winningTeam === 'alpha') {
      victoryWinnerName.textContent = 'PHE XANH (ALPHA)';
    } else if (data.winningTeam === 'bravo') {
      victoryWinnerName.textContent = 'PHE ĐỎ (BRAVO)';
    } else {
      victoryWinnerName.textContent = 'HÒA (DRAW)';
    }
    const mvpText = data.winner?.name ? ` • MVP: ${ data.winner.name } (${ data.winner.kills || 0 } K)` : '';
    victoryWinnerStats.textContent = `ALPHA ${ alphaK } - ${ bravoK } BRAVO${ mvpText }`;
  } else {
    victoryWinnerName.textContent = data.winner?.name || '---';
    victoryWinnerStats.textContent = `${ data.winner?.kills || 0 } Kills • ${ data.winner?.deaths || 0 } Deaths`;
  }

  const isTdmEnd = data.gameMode === 'tdm' || appState.currentRoomGameMode === 'tdm';
  victoryLeaderboardBody.innerHTML = (data.leaderboard || [])
    .slice(0, 8)
    .map((p, idx) => {
      const kills = Number(p.kills) || 0;
      const deaths = Number(p.deaths) || 0;
      const kd = deaths === 0 ? kills.toFixed(1) : (kills / deaths).toFixed(2);
      const teamTag = isTdmEnd && p.team
        ? `<span class="sb-team-tag ${ p.team === 'alpha' ? 'alpha' : 'bravo' }">${ p.team === 'alpha' ? 'ALPHA' : 'BRAVO' }</span>`
        : '';
      return `
        <tr class="${ p.id === appState.game.localId ? 'sb-row-me' : '' }">
          <td>#${ idx + 1 }</td>
          <td>${ teamTag }${ escapeHtml(p.name) } ${ p.id === appState.game.localId ? '(Bạn)' : '' }</td>
          <td>${ kills }</td>
          <td>${ deaths }</td>
          <td>${ kd }</td>
        </tr>
      `;
    })
    .join('');

  matchEndModal.classList.remove('hidden');

  let countdown = data.nextMatchIn || 10;
  nextMatchCountdown.textContent = String(countdown);
  if (appState.nextMatchInterval) clearInterval(appState.nextMatchInterval);
  appState.nextMatchInterval = setInterval(() => {
    countdown = Math.max(0, countdown - 1);
    nextMatchCountdown.textContent = String(countdown);
  }, 1000);
  syncLanHostMeta({ state: 'ENDED' });
});

onActiveSocket('matchStarted', (data) => {
  if (!appState.game.inMatch && !appState.activeRoomCode) return;
  if (appState.respawnInterval) {
    clearInterval(appState.respawnInterval);
    appState.respawnInterval = null;
  }
  resetDeathRespawnUi(false);
  if (appState.nextMatchInterval) {
    clearInterval(appState.nextMatchInterval);
    appState.nextMatchInterval = null;
  }
  appState.currentRoomState = 'PLAYING';
  if (data.gameMode) {
    appState.currentRoomGameMode = data.gameMode === 'tdm' ? 'tdm' : 'ffa';
  }
  if (data.killLimit) {
    hudKillLimit.textContent = String(data.killLimit);
  }
  appState.hudCache.leaderText = '';
  appState.hudCache.leaderId = null;
  updateTeamScoreHud(data.teamScores || { alpha: 0, bravo: 0 });
  teamLobbyModal?.classList.add('hidden');
  loadoutModal?.classList.add('hidden');
  matchEndModal.classList.add('hidden');
  deathOverlay.classList.add('hidden');
  hudScreen.classList.remove('hidden');
  appState.game.inMatch = true;
  appState.localMultiKillCount = 0;
  appState.lastLocalKillAt = 0;
  appState.lastGrenadeThrowAt = 0;
  clearAdrenalineHealHud();
  multikillBanner?.classList.add('hidden');
  if (data.mapId) {
    if (appState.game.currentMapConfig?.id !== data.mapId) {
      appState.game.loadMap(data.mapId);
    }
    updateMapHud(data.mapId);
  }
  appState.game.syncPickups(data.pickups || []);
  appState.game.syncBarrels?.(data.barrels || []);
  appState.game.syncDroppedWeapons(data.droppedWeapons || []);
  appState.game.syncGrenades?.(data.activeGrenades || []);
  appState.latestPlayers = appState.playerStateCache.merge(data.players);
  const me = appState.latestPlayers.find((p) => p.id === appState.game.localId);
  if (me && me.team) {
    appState.currentLocalTeam = me.team;
  }
  appState.game.setTeamState?.(appState.currentRoomGameMode, appState.currentLocalTeam);
  appState.game.syncPlayersState(appState.latestPlayers);
  if (me) {
    appState.game.spawnLocalPlayer(me);
    updateHpHud(me.hp);
    updateGrenadeHud(me.grenades ?? me.grenadeCount ?? 1);
    triggerSpawnProtectionHud(MATCH_CONFIG.SPAWN_PROTECTION_MS || 1500);
  }
  showCenterBanner(appState.currentRoomGameMode === 'tdm' ? '⚔️ ĐẤU ĐỘI BẮT ĐẦU' : '🔥 BẮT ĐẦU');
  appState.game.requestPointerLock();
  syncLanHostMeta({ state: 'PLAYING' });
  for (const delay of [200, 600]) setTimeout(measurePing, delay);
});

  onActiveSocket('teamLobbyState', (data) => {
    handleTeamLobbyState(data);
  });

  onActiveSocket('roomJoined', () => {
    for (const delay of [150, 450, 900]) setTimeout(measurePing, delay);
  });
}

export function initSocketEvents() {
  if (appState.netInitFailed) {
    appState.serverErrorShown = true;
    const isLan = Boolean(appState.lanInfo);
    lobbyError.textContent = isLan
      ? lanErrorText()
      : `${ SERVER_UNREACHABLE_MESSAGE }. Đang thử kết nối lại...`;
    lobbyError.classList.remove('hidden');
  }
  bindGameSocketListeners(appState.socket);
  if (!pingIntervalStarted) {
    pingIntervalStarted = true;
    setInterval(measurePing, 1500);
  }
}


