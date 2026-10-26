import { WEAPONS } from '../shared/constants.js';
import { SoundEffects } from './audio.js';
import { Game3D } from './game3d.js';
import { createNetworkClient, SERVER_UNREACHABLE_MESSAGE } from './networkAdapter.js';
import { setupLanMode, shouldWarnLanHostBeforeUnload } from './lanHost/lanMode.js';
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
} from './ui/domElements.js';
import {
  PROTECTED_GAMEPLAY_KEY_CODES,
  appState,
  lockGameplayKeys
} from './ui/userPrefsAndKeys.js';
import {
  copyInviteLinkToClipboard,
  handleThrowGrenadeRequest,
  renderScoreboard,
  showCenterBanner,
  updateActiveBuffsHud,
  updateArmorHud,
  updateGrenadeHud,
  updateHpHud,
  updateWeaponHud
} from './ui/hudController.js';
import {
  applyRestoredUserPrefs,
  initLanServerRoom,
  initLobbyAndModalListeners,
  toggleLoadoutModal
} from './ui/lobbyAndModals.js';
import { handleTeamLobbyState, initSocketEvents } from './ui/socketEvents.js';

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
// In-browser LAN room (?lanhost=CODE or ?room=CODE&lan=1): the game socket becomes a WebRTC/LAN socket, Render only does signaling.
const lanInfo = netInitFailed ? null : await setupLanMode(netClient);
lanState.active = Boolean(lanInfo && !lanInfo.error);
const socket = netClient.socket;
const sfx = new SoundEffects();
if (typeof SoundEffects.prototype.playHeadshotDink !== 'function') {
  sfx.playHeadshotDink = () => sfx.playHitmarker?.(true);
}
if (typeof SoundEffects.prototype.playMultiKillTone !== 'function') {
  sfx.playMultiKillTone = (multiKillCount = 1) => sfx.playKillConfirm?.(multiKillCount);
}

appState.netClient = netClient;
appState.lanInfo = lanInfo;
appState.netInitFailed = netInitFailed;
appState.socket = socket;
appState.sfx = sfx;


const game = appState.game = new Game3D(canvasContainer, {
  // Client-side prediction: input commands (never positions) go to the server; it answers with `moveAck`
  onInputBatch: (batch) => {
    // `d` = interpolation delay (ms) remote players are drawn with right now: the server rewinds exactly this much (plus
    // half the RTT it measures itself) when it resolves a shot in this batch (lag compensation parity)
    batch.d = appState.game.getInterpDelayMs();
    appState.socket.emit('inputBatch', batch);
  },
  // The shot itself travels inside the input commands (FIRE bit + shot sequence, see Game3D.advanceFixedPhysics): there is no
  // `shoot` appState.socket event. This callback only plays the local gunshot sound.
  onLocalShot: (shot) => {
    appState.sfx.playShot(shot.weapon, 0.92);
    if (Number.isFinite(shot.remainingAmmo) && shot.magSize >= 5 && shot.remainingAmmo <= Math.ceil(shot.magSize * 0.25)) {
      appState.sfx.playLowAmmoClick?.(shot.remainingAmmo / Math.max(1, shot.magSize));
    }
  },
  onDryFire: () => {
    appState.sfx.playDryFire();
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
    appState.sfx.playReload(reloadMs, mode);
    appState.socket.emit('reload', { weapon: weaponId, mode });
  },
  onShellInserted: (weaponId, currentAmmo, reserveAmmo, isFull) => {
    const cfg = WEAPONS[weaponId] || WEAPONS.shotgun;
    appState.sfx.playShellInsert(isFull);
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
    if (!appState.game.reloadingUntil || appState.game.reloadingUntil <= performance.now()) {
      reloadIndicator.classList.add('hidden');
    }
    updateWeaponHud(weaponId, currentAmmo, reserveAmmo);
  },
  onSelfState: (state) => {
    if (!appState.game.inMatch || !state) return;
    if (typeof state.armor === 'number') updateArmorHud(state.armor);
    updateActiveBuffsHud();
    if (!appState.game.inMatch || !state) return;
    if (typeof state.hp === 'number') {
      updateHpHud(state.hp);
    }
    if (typeof state.grenades === 'number') {
      const isThrowInFlight = state.grenades > appState.localGrenades && (performance.now() - appState.lastGrenadeThrowAt) < 350;
      if (!isThrowInFlight) {
        updateGrenadeHud(state.grenades);
      }
    }
    if (!state.reloading && (!appState.game.reloadingUntil || appState.game.reloadingUntil <= performance.now())) {
      reloadIndicator.classList.add('hidden');
    }
  },
  onNearbyWeaponChange: (dropItem, remSec) => {
    if (!weaponPickupPrompt) return;
    if (!dropItem || !appState.game.inMatch || !appState.game.alive) {
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
    appState.socket.emit('pickupWeapon', { dropId });
  },
  onWeaponSwitchSound: () => {
    if (!appState.isRestoringPrefs) {
      appState.sfx.playWeaponSwitch();
    }
  },
  onAimChange: (isAiming, weaponId) => {
    const wCfg = WEAPONS[weaponId] || WEAPONS.rifle;
    if (isAiming && weaponId === 'sniper') {
      sniperScope.classList.remove('hidden');
      opticScope?.classList.add('hidden');
      opticScope?.classList.remove('optic-holo', 'optic-reddot');
      crosshair.classList.add('hidden');
      appState.hudCache.chAiming = true;
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
      appState.hudCache.chAiming = true;
    } else {
      sniperScope.classList.add('hidden');
      opticScope?.classList.add('hidden');
      opticScope?.classList.remove('optic-holo', 'optic-reddot');
      crosshair.classList.remove('hidden');
      crosshair.classList.toggle('aiming', false);
      appState.hudCache.chAiming = false;
    }
  },
  onSpreadUpdate: (effectiveSpread, isAiming, isMoving = false, crosshairKick = 0, isStanceSteady = false) => {
    // Convert angular spread + crosshair recoil kick into pixel gap:
    // - Stationary crouch/prone tightens to 2px (tactical precision)
    // - Standing run-and-gun expands clearly (+12px) to discourage running fire
    const moveBonusPx = isMoving ? (isStanceSteady ? 3 : 12) : 0;
    const kickPx = Math.round((crosshairKick || 0) * 280);
    const baseGap = isStanceSteady && !isMoving
      ? Math.max(2, Math.round(effectiveSpread * 260))
      : Math.max(3, Math.round(effectiveSpread * 350));
    const gapPx = Math.max(2, Math.min(46, baseGap + moveBonusPx + kickPx));
    const aimingBool = Boolean(isAiming);
    const movingBool = Boolean(isMoving && !isStanceSteady);
    const steadyBool = Boolean(isStanceSteady && !isMoving);
    const recoilingBool = kickPx >= 3;

    if (appState.hudCache.chGap !== gapPx) {
      appState.hudCache.chGap = gapPx;
      crosshair.style.setProperty('--ch-gap', `${gapPx}px`);
    }
    if (appState.hudCache.chAiming !== aimingBool) {
      appState.hudCache.chAiming = aimingBool;
      crosshair.classList.toggle('aiming', aimingBool);
    }
    if (appState.hudCache.chMoving !== movingBool) {
      appState.hudCache.chMoving = movingBool;
      crosshair.classList.toggle('moving', movingBool);
    }
    if (appState.hudCache.chSteady !== steadyBool) {
      appState.hudCache.chSteady = steadyBool;
      crosshair.classList.toggle('steady', steadyBool);
    }
    if (appState.hudCache.chRecoiling !== recoilingBool) {
      appState.hudCache.chRecoiling = recoilingBool;
      crosshair.classList.toggle('recoiling', recoilingBool);
    }
  },
  onMovementHudUpdate: (stance, speed) => {
    updateActiveBuffsHud();
    const speedStr = speed.toFixed(1);
    if (hudSpeed && appState.hudCache.speed !== speedStr) {
      appState.hudCache.speed = speedStr;
      hudSpeed.textContent = speedStr;
    }
    if (hudStance && appState.hudCache.stance !== stance) {
      appState.hudCache.stance = stance;
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
      if (hudScreen) {
        hudScreen.classList.toggle('sliding-rush', stance === 'SLIDE');
      }
    }
  },
  onJumpPad: () => {
    appState.sfx.playJumpPad?.();
    showCenterBanner('🚀 ĐỆM NHẢY PHẢN LỰC');
  },
  onJump: () => {
    appState.sfx.playJump();
  },
  onFootstep: (isSprint, isCrouch = false) => {
    appState.sfx.playFootstep(isSprint, isCrouch);
  },
  onSlide: () => {
    appState.sfx.playSlide();
    if (hudScreen) {
      hudScreen.classList.add('sliding-rush');
    }
  },
  onLand: (intensity) => {
    appState.sfx.playLand(intensity);
  },
  onPointerLockChange: (locked) => {
    if (locked) {
      lockGameplayKeys();
    }
    if (!appState.game.inMatch) return;
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
  onGrenadeCookUpdate: (active, remSec = 0, maxSec = 3) => {
    if (!grenadeCookHud) return;
    if (!active) {
      grenadeCookHud.classList.add('hidden');
      grenadeCookHud.classList.remove('danger');
      return;
    }
    grenadeCookHud.classList.remove('hidden');
    const cleanRem = Math.max(0, Number(remSec) || 0);
    const cleanMax = Math.max(0.1, Number(maxSec) || 3);
    const pct = Math.max(0, Math.min(100, (cleanRem / cleanMax) * 100));
    if (grenadeCookTimer) {
      grenadeCookTimer.textContent = `${cleanRem.toFixed(1)}s`;
    }
    if (grenadeCookBar) {
      grenadeCookBar.style.width = `${pct.toFixed(1)}%`;
    }
    grenadeCookHud.classList.toggle('danger', cleanRem <= 1.0);
  },
  onGrenadeChanged: (count) => {
    updateGrenadeHud(count);
  },
  onCopyLinkShortcut: () => {
    copyInviteLinkToClipboard();
  },
  onScoreboardToggle: (show) => {
    if (!appState.game.inMatch) return;
    if (show) {
      renderScoreboard(appState.latestPlayers);
      scoreboardModal.classList.remove('hidden');
    } else {
      scoreboardModal.classList.add('hidden');
    }
  },
  onFpsUpdate: (fps) => {
    hudFps.textContent = String(fps);
  }
});

// Keep appState.game.mouseSensitivity and appState.game.sensitivity bidirectionally synchronized
if (!Object.getOwnPropertyDescriptor(appState.game, 'mouseSensitivity')) {
  Object.defineProperty(appState.game, 'mouseSensitivity', {
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

// Wrap appState.game.requestPointerLock so Keyboard Lock API is engaged automatically whenever entering pointer lock
const origRequestPointerLock = appState.game.requestPointerLock.bind(appState.game);
appState.game.requestPointerLock = () => {
  origRequestPointerLock();
  lockGameplayKeys();
};

// Prevent accidental tab closure (Ctrl+W, Ctrl+R, F5, etc.) during an active match, room session, or LAN host session with players
window.addEventListener('beforeunload', (e) => {
  if (shouldWarnLanHostBeforeUnload(appState) || appState.game.inMatch || appState.activeRoomCode) {
    e.preventDefault();
    e.returnValue = '';
    return '';
  }
});

document.addEventListener('pointerlockchange', () => {
  if (document.pointerLockElement === appState.game.renderer?.domElement || (appState.game.inMatch && appState.game.isPointerLocked)) {
    lockGameplayKeys();
  }
});

document.addEventListener('fullscreenchange', () => {
  if (document.fullscreenElement && (appState.game.inMatch || appState.game.isPointerLocked)) {
    lockGameplayKeys();
  }
});

// Capture-phase keydown protection to intercept browser shortcuts (Ctrl+W, Ctrl+R, Ctrl+Q, Ctrl+T, Ctrl+N, Ctrl+S, Ctrl+D, F5, etc.)
// while keeping movement and crouching keys (W/A/S/D, Ctrl, Shift, Space) responsive in-appState.game
window.addEventListener('keydown', (e) => {
  if (!appState.game.inMatch && !appState.game.isPointerLocked) return;

  const activeTag = document.activeElement?.tagName;
  const isTypingInField =
    !appState.game.isPointerLocked &&
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
    if (e.code in appState.game.keys) {
      appState.game.keys[e.code] = true;
    } else if (e.code === 'ControlRight') {
      appState.game.keys.ControlLeft = true;
    }
  }
}, { capture: true });

window.addEventListener('keyup', (e) => {
  if (e.code in appState.game.keys) {
    appState.game.keys[e.code] = false;
  } else if (e.code === 'ControlRight') {
    appState.game.keys.ControlLeft = false;
  }
}, { capture: true });

window.addEventListener('blur', () => {
  for (const k of Object.keys(appState.game.keys)) {
    appState.game.keys[k] = false;
  }
  appState.game.isMouseDown = false;
});


const unlockAudioOnGesture = () => {
  if (appState.sfx?.enabled && (!appState.sfx.ctx || appState.sfx.ctx.state !== 'running')) {
    appState.sfx.ensureContext();
  }
};
window.addEventListener('pointerdown', unlockAudioOnGesture, { capture: true, passive: true });
window.addEventListener('mousedown', unlockAudioOnGesture, { capture: true, passive: true });
window.addEventListener('mouseup', unlockAudioOnGesture, { capture: true, passive: true });
window.addEventListener('click', unlockAudioOnGesture, { capture: true, passive: true });
window.addEventListener('keydown', unlockAudioOnGesture, { capture: true, passive: true });
window.addEventListener('touchstart', unlockAudioOnGesture, { capture: true, passive: true });
window.addEventListener('touchend', unlockAudioOnGesture, { capture: true, passive: true });

applyRestoredUserPrefs();
initLobbyAndModalListeners();
initSocketEvents();
initLanServerRoom(); // private rooms on the office LAN server (settings + ?create=private landing)
if (!socket._gameListenersBound) {
  socket.on('teamLobbyState', (data) => handleTeamLobbyState(data));
}

