import { MATCH_CONFIG, WEAPONS, getMapConfig } from '../shared.js';
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
import { appState } from './userPrefsAndKeys.js';

export function showToast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.remove('hidden');
  setTimeout(() => {
    toastEl.classList.add('hidden');
  }, 2600);
}

export function showCenterBanner(text) {
  centerBanner.textContent = text;
  centerBanner.classList.remove('hidden');
  if (appState.bannerTimer) clearTimeout(appState.bannerTimer);
  appState.bannerTimer = setTimeout(() => {
    centerBanner.classList.add('hidden');
  }, 2200);
}

let comboTargetId = null;
let comboTotalDamage = 0;
let comboHitCount = 0;
let comboLastHitAt = 0;

export function triggerHitmarkerFeedback({
  targetId = null,
  damage = 0,
  armorDamage = 0,
  armorBroken = false,
  isHeadshot = false,
  isWallbang = false,
  isKill = false
}) {
  const isArmorHit = !armorBroken && Number(armorDamage) > 0;
  if (hitmarker) {
    hitmarker.classList.remove('hidden', 'headshot', 'kill', 'armor-hit', 'armor-break');
    void hitmarker.offsetWidth;
    if (isHeadshot) {
      hitmarker.classList.add('headshot');
    } else if (armorBroken) {
      hitmarker.classList.add('armor-break');
    } else if (isArmorHit) {
      hitmarker.classList.add('armor-hit');
    }
    if (isKill) {
      hitmarker.classList.add('kill');
    }
    if (appState.hitmarkerTimer) clearTimeout(appState.hitmarkerTimer);
    const holdMs = isKill ? 280 : (isHeadshot || armorBroken) ? 220 : 150;
    appState.hitmarkerTimer = setTimeout(() => {
      hitmarker.classList.add('hidden');
      hitmarker.classList.remove('headshot', 'kill', 'armor-hit', 'armor-break');
    }, holdMs);
  }

  if (damage > 0 && hudFloatingDmg) {
    const now = performance.now();
    const cleanDmg = Math.max(1, Math.round(Number(damage) || 0));
    if (targetId && targetId === comboTargetId && (now - comboLastHitAt) <= 1150) {
      comboTotalDamage += cleanDmg;
      comboHitCount += 1;
    } else {
      comboTargetId = targetId || null;
      comboTotalDamage = cleanDmg;
      comboHitCount = 1;
    }
    comboLastHitAt = now;

    const comboSuffix = comboHitCount >= 2 ? ` (${comboHitCount}x • ${comboTotalDamage})` : '';
    const wbTag = isWallbang ? '🧱 ' : '';
    let label = `${wbTag}-${cleanDmg}${comboSuffix}`;
    if (armorBroken) {
      label = `${wbTag}🛡️ VỠ GIÁP -${cleanDmg}${comboSuffix}`;
    } else if (isHeadshot) {
      label = `${wbTag}🎯 -${cleanDmg} HS!${comboSuffix}`;
    } else if (isArmorHit) {
      label = `${wbTag}🛡️ -${cleanDmg}${comboSuffix}`;
    }

    hudFloatingDmg.textContent = label;
    hudFloatingDmg.classList.toggle('headshot', Boolean(isHeadshot));
    hudFloatingDmg.classList.toggle('armor-break', Boolean(armorBroken && !isHeadshot));
    hudFloatingDmg.classList.toggle('armor-hit', Boolean(isArmorHit && !isHeadshot));
    hudFloatingDmg.classList.remove('hidden');
    if (appState.floatingDmgTimer) clearTimeout(appState.floatingDmgTimer);
    appState.floatingDmgTimer = setTimeout(() => {
      hudFloatingDmg.classList.add('hidden');
    }, 640);
  }
}

export function clearAdrenalineHealHud() {
  if (appState.adrenalineTimer) {
    clearTimeout(appState.adrenalineTimer);
    appState.adrenalineTimer = null;
  }
  hudAdrenalinePop?.classList.add('hidden');
  hudHpAdrenalineTag?.classList.add('hidden');
  hudHpCard?.classList.remove('adrenaline-heal');
}

export function triggerAdrenalineHealFeedback(healAmount = 25, serverHp = null) {
  if (!appState.game.alive) return;
  const cleanHeal = Math.max(1, Math.round(Number(healAmount) || 25));
  const nextHp = typeof serverHp === 'number' && serverHp > 0
    ? Math.min(100, Math.round(serverHp))
    : Math.min(100, (appState.hudCache.hp > 0 ? appState.hudCache.hp : 100) + cleanHeal);
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

  if (appState.adrenalineTimer) clearTimeout(appState.adrenalineTimer);
  appState.adrenalineTimer = setTimeout(() => {
    clearAdrenalineHealHud();
  }, 1650);
}

const MULTI_KILL_TIERS = {
  1: { title: 'FIRST BLOOD', medal: '🩸', tierClass: 'mk-tier-1' },
  2: { title: 'DOUBLE KILL', medal: '⚡', tierClass: 'mk-tier-2' },
  3: { title: 'TRIPLE KILL', medal: '🔥', tierClass: 'mk-tier-3' },
  4: { title: 'QUADRA KILL', medal: '💀', tierClass: 'mk-tier-4' },
  5: { title: 'ACE / RAMPAGE', medal: '👑', tierClass: 'mk-tier-5' }
};

export function showMultiKillBanner(multiKillCount = 1, victimName = 'Enemy', isHeadshot = false, healAmount = 25) {
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
    if (appState.multikillBannerTimer) clearTimeout(appState.multikillBannerTimer);
    appState.multikillBannerTimer = setTimeout(() => {
      multikillBanner.classList.add('hidden');
    }, 2400);
  }
}

export function updateGrenadeHud(count) {
  const cleanCount = Math.max(0, Math.floor(Number(count ?? 0)));
  appState.localGrenades = cleanCount;
  if (appState.game) {
    appState.game.grenades = cleanCount;
  }
  if (appState.hudCache.grenades === cleanCount) return;
  appState.hudCache.grenades = cleanCount;

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

export function handleThrowGrenadeRequest(customPayload = null) {
  if (!appState.game.inMatch || !appState.game.alive) return;
  const isModalOpen =
    !pauseModal.classList.contains('hidden') ||
    (loadoutModal && !loadoutModal.classList.contains('hidden')) ||
    !deathOverlay.classList.contains('hidden') ||
    !matchEndModal.classList.contains('hidden');
  if (isModalOpen) return;

  const now = performance.now();
  if (customPayload?.empty || appState.localGrenades <= 0) {
    if (now - appState.lastGrenadeThrowAt < 250) return;
    appState.lastGrenadeThrowAt = now;
    appState.sfx.playDryFire?.();
    showCenterBanner('💣 HẾT LỰU ĐẠN');
    return;
  }

  if (now - appState.lastGrenadeThrowAt < 250) return;

  appState.lastGrenadeThrowAt = now;
  updateGrenadeHud(appState.localGrenades - 1);

  const yaw = typeof customPayload?.yaw === 'number' ? customPayload.yaw : Number(appState.game.yaw || 0);
  const pitch = typeof customPayload?.pitch === 'number' ? customPayload.pitch : Number(appState.game.pitch || 0);
  const dir = customPayload?.dir || {
    x: -Math.sin(yaw) * Math.cos(pitch),
    y: Math.sin(pitch),
    z: -Math.cos(yaw) * Math.cos(pitch)
  };
  const origin = customPayload?.origin || {
    x: appState.game.camera?.position?.x ?? appState.game.position.x,
    y: appState.game.camera?.position?.y ?? (appState.game.position.y + 1.5),
    z: appState.game.camera?.position?.z ?? appState.game.position.z
  };
  const fuseMs = typeof customPayload?.fuseMs === 'number'
    ? Math.max(80, Math.min(MATCH_CONFIG.GRENADE_FUSE_MS || 3000, Math.round(customPayload.fuseMs)))
    : (MATCH_CONFIG.GRENADE_DEFAULT_THROW_FUSE_MS || 2200);
  const overcooked = Boolean(customPayload?.overcooked);

  appState.sfx.playGrenadeThrow?.();
  if (!appState.game.grenadeThrowUntil || appState.game.grenadeThrowUntil <= now) {
    appState.game.triggerLocalGrenadeThrow?.({ yaw, pitch, origin, dir });
  }
  appState.socket.emit('throwGrenade', {
    yaw,
    pitch,
    origin,
    dir,
    fuseMs,
    overcooked
  });
}

export async function copyInviteLinkToClipboard() {
  if (!appState.activeRoomCode) return;
  const shareUrl = getShareableRoomUrl(appState.activeRoomCode);
  try {
    await navigator.clipboard.writeText(shareUrl);
    showToast(`🔗 Đã copy link #${ appState.activeRoomCode }`);
  } catch {
    pauseInviteUrl.select();
    document.execCommand('copy');
    showToast(`🔗 Đã copy link #${ appState.activeRoomCode }`);
  }
}

export function updateArmorHud(armor = 0) {
  const maxArmor = MATCH_CONFIG.MAX_ARMOR || 50;
  const cleanArmor = Math.max(0, Math.min(maxArmor, Math.round(Number(armor) || 0)));
  if (appState.game) appState.game.armor = cleanArmor;
  if (appState.hudCache.armor === cleanArmor) return;
  appState.hudCache.armor = cleanArmor;
  if (hudArmorRow) {
    hudArmorRow.classList.toggle('hidden', cleanArmor <= 0);
  }
  if (hudArmorValue) {
    hudArmorValue.textContent = String(cleanArmor);
  }
  if (hudArmorBar) {
    hudArmorBar.style.width = `${Math.round((cleanArmor / maxArmor) * 100)}%`;
  }
}

export function updateActiveBuffsHud() {
  if (!hudActiveBuffs || !appState.game) return;
  const now = performance.now();
  const speedRemSec = appState.game.speedBoostUntil > now ? Math.max(0, (appState.game.speedBoostUntil - now) / 1000) : 0;
  const dmgRemSec = appState.game.damageBoostUntil > now ? Math.max(0, (appState.game.damageBoostUntil - now) / 1000) : 0;
  if (speedRemSec <= 0 && dmgRemSec <= 0) {
    if (appState.hudCache.buffSig !== '') {
      appState.hudCache.buffSig = '';
      hudActiveBuffs.classList.add('hidden');
      hudActiveBuffs.innerHTML = '';
    }
    return;
  }
  const sig = `${speedRemSec.toFixed(1)}|${dmgRemSec.toFixed(1)}`;
  if (appState.hudCache.buffSig === sig) return;
  appState.hudCache.buffSig = sig;
  hudActiveBuffs.classList.remove('hidden');
  let html = '';
  if (speedRemSec > 0) {
    html += `<div class="buff-badge buff-speed"><span>⚡ TỐC ĐỘ X1.3</span><strong>${speedRemSec.toFixed(1)}s</strong></div>`;
  }
  if (dmgRemSec > 0) {
    html += `<div class="buff-badge buff-damage"><span>🔥 SÁT THƯƠNG X1.35</span><strong>${dmgRemSec.toFixed(1)}s</strong></div>`;
  }
  hudActiveBuffs.innerHTML = html;
}

export function updateHpHud(hp) {
  const cleanHp = Math.max(0, Math.min(100, Math.round(hp)));
  if (appState.hudCache.hp === cleanHp) return;
  appState.hudCache.hp = cleanHp;

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

export function clearSpawnProtectionHud() {
  if (appState.spawnShieldInterval) {
    clearInterval(appState.spawnShieldInterval);
    appState.spawnShieldInterval = null;
  }
  if (appState.spawnShieldTimeout) {
    clearTimeout(appState.spawnShieldTimeout);
    appState.spawnShieldTimeout = null;
  }
  if (spawnShieldOverlay) spawnShieldOverlay.classList.add('hidden');
  if (spawnShieldBadge) spawnShieldBadge.classList.add('hidden');
  if (hudHpCard) hudHpCard.classList.remove('spawn-protected');
}

export function triggerSpawnProtectionHud(durationMs = MATCH_CONFIG.SPAWN_PROTECTION_MS || 1500) {
  clearSpawnProtectionHud();
  const cleanDuration = Math.max(100, Number(durationMs) || 1500);
  const expiresAt = performance.now() + cleanDuration;

  if (spawnShieldOverlay) spawnShieldOverlay.classList.remove('hidden');
  if (spawnShieldBadge) spawnShieldBadge.classList.remove('hidden');
  if (hudHpCard) hudHpCard.classList.add('spawn-protected');
  if (spawnShieldTimerEl) {
    spawnShieldTimerEl.textContent = `${ (cleanDuration / 1000).toFixed(1) }s`;
  }

  appState.spawnShieldInterval = setInterval(() => {
    const remMs = Math.max(0, expiresAt - performance.now());
    if (spawnShieldTimerEl) {
      spawnShieldTimerEl.textContent = `${ (remMs / 1000).toFixed(1) }s`;
    }
    if (remMs <= 0) {
      clearSpawnProtectionHud();
    }
  }, 80);

  appState.spawnShieldTimeout = setTimeout(() => {
    clearSpawnProtectionHud();
  }, cleanDuration + 30);
}

export function syncHotbarSlotsHud() {
  const pCfg = WEAPONS[appState.selectedLoadout.primary] || WEAPONS.rifle;
  const sCfg = WEAPONS[appState.selectedLoadout.secondary] || WEAPONS.pistol;
  const mCfg = WEAPONS[appState.selectedLoadout.melee] || WEAPONS.knife;

  if (hotbarSlot1?.dataset) hotbarSlot1.dataset.slot = pCfg.id;
  if (hotbarSlot2?.dataset) hotbarSlot2.dataset.slot = sCfg.id;
  if (hotbarSlot3?.dataset) hotbarSlot3.dataset.slot = mCfg.id;
  if (hotbarName1) hotbarName1.textContent = pCfg.name;
  if (hotbarName2) hotbarName2.textContent = sCfg.name;
  if (hotbarName3) hotbarName3.textContent = mCfg.name;
}

export function updateWeaponHud(weaponId, currentAmmo, reserveAmmo) {
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

export function updateMapHud(mapId) {
  const mapCfg = getMapConfig(mapId);
  if (hudMapName) hudMapName.textContent = mapCfg.name;
  if (sbMapName) sbMapName.textContent = mapCfg.name;
  if (pauseMapSelect) pauseMapSelect.value = mapCfg.id;
}

export function updateTeamScoreHud(teamScores = appState.currentTeamScores) {
  const alphaKills = Math.max(0, Number(teamScores?.alpha) || 0);
  const bravoKills = Math.max(0, Number(teamScores?.bravo) || 0);
  if (!appState.currentTeamScores) {
    appState.currentTeamScores = { alpha: alphaKills, bravo: bravoKills };
  } else {
    appState.currentTeamScores.alpha = alphaKills;
    appState.currentTeamScores.bravo = bravoKills;
  }

  const cache = appState.hudCache;
  if (hudScoreAlpha && cache.scoreAlpha !== alphaKills) {
    cache.scoreAlpha = alphaKills;
    hudScoreAlpha.textContent = String(alphaKills);
  }
  if (hudScoreBravo && cache.scoreBravo !== bravoKills) {
    cache.scoreBravo = bravoKills;
    hudScoreBravo.textContent = String(bravoKills);
  }

  const isTdm = appState.currentRoomGameMode === 'tdm';
  if (hudTeamScore && cache.teamScoreVisible !== isTdm) {
    cache.teamScoreVisible = isTdm;
    hudTeamScore.classList.toggle('hidden', !isTdm);
  }

  if (isTdm && hudLeader) {
    const killLimitText = hudKillLimit ? hudKillLimit.textContent : '30';
    let nextLeaderText = `⚖️ HÒA: ${ alphaKills } - ${ bravoKills } (${ killLimitText })`;
    if (alphaKills > bravoKills) {
      nextLeaderText = `🔵 PHE XANH DẪN ĐẦU (${ alphaKills }/${ killLimitText })`;
    } else if (bravoKills > alphaKills) {
      nextLeaderText = `🔴 PHE ĐỎ DẪN ĐẦU (${ bravoKills }/${ killLimitText })`;
    }
    if (cache.leaderText !== nextLeaderText) {
      cache.leaderText = nextLeaderText;
      hudLeader.textContent = nextLeaderText;
    }
  }
}

export function renderScoreboard(players) {
  const sorted = [...players].sort((a, b) => {
    if (b.kills !== a.kills) return b.kills - a.kills;
    return a.deaths - b.deaths;
  });

  const sig = sorted
    .map((p) => `${p.id}:${p.name}:${p.team || ''}:${p.kills}:${p.deaths}:${p.streak}:${p.ping || (p.id === appState.game.localId ? appState.currentPingMs : 0) || 0}`)
    .join('|');
  if (sig === appState.lastScoreboardSig) return;
  appState.lastScoreboardSig = sig;

  scoreboardBody.innerHTML = sorted
    .map((p, i) => {
      const kills = Number(p.kills) || 0;
      const deaths = Number(p.deaths) || 0;
      const streak = Number(p.streak) || 0;
      const kd = deaths === 0 ? kills.toFixed(1) : (kills / deaths).toFixed(2);
      const isMe = p.id === appState.game.localId;
      const rawPing = isMe ? (Number(p.ping) || Number(appState.currentPingMs) || 0) : (Number(p.ping) || 0);
      const pingText = rawPing > 0 ? `${Math.round(rawPing)} ms` : 'LAN';
      const pingColor = rawPing > 100 ? '#f87171' : rawPing > 45 ? '#facc15' : '#4ade80';
      const teamTag = appState.currentRoomGameMode === 'tdm' && p.team
        ? `<span class="sb-team-tag ${ p.team === 'alpha' ? 'alpha' : 'bravo' }">${ p.team === 'alpha' ? 'ALPHA' : 'BRAVO' }</span>`
        : '';
      return `
        <tr class="${ isMe ? 'sb-row-me' : '' }">
          <td>${ i + 1 }</td>
          <td>${ teamTag }${ escapeHtml(p.name) } ${ isMe ? '(Bạn)' : '' }</td>
          <td>${ kills }</td>
          <td>${ deaths }</td>
          <td>${ kd }</td>
          <td>${ streak }🔥</td>
          <td style="color:${ pingColor };font-weight:600;">${ pingText }</td>
        </tr>
      `;
    })
    .join('');
}

export function addKillFeedItem({ killerId, killerName, victimId, victimName, weapon, weaponName, isHeadshot, isWallbang }) {
  const item = document.createElement('div');
  const involvesMe = killerId === appState.game.localId || victimId === appState.game.localId;
  item.className = `kill-item${ involvesMe ? ' kill-item-me' : '' }${ isHeadshot ? ' kill-item-hs' : '' }`;

  const killerSpan = document.createElement('span');
  killerSpan.className = 'kill-name killer-name';
  killerSpan.style.color = killerId === appState.game.localId ? '#facc15' : '#38bdf8';
  killerSpan.textContent = killerName;

  const weaponSpan = document.createElement('span');
  weaponSpan.className = 'kill-weapon-tag';
  const weaponLabel = weaponName || (weapon === 'grenade' ? '💣 FRAG GRENADE' : weapon === 'barrel' ? '🛢️ THÙNG NỔ' : weapon);
  weaponSpan.textContent = `[${ weaponLabel }]`;

  item.appendChild(killerSpan);
  item.appendChild(weaponSpan);
  if (isWallbang) {
    const wbSpan = document.createElement('span');
    wbSpan.className = 'kill-hs-tag';
    wbSpan.textContent = '🧱 WB';
    item.appendChild(wbSpan);
  }

  if (isHeadshot) {
    const hsSpan = document.createElement('span');
    hsSpan.className = 'kill-hs-tag';
    hsSpan.textContent = '🎯 HS';
    item.appendChild(hsSpan);
  }

  const victimSpan = document.createElement('span');
  victimSpan.className = 'kill-name victim-name';
  victimSpan.style.color = victimId === appState.game.localId ? '#f87171' : '#fca5a5';
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

