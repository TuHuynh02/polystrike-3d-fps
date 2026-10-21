import {
  DEFAULT_MAP_ID,
  MAPS,
  MATCH_CONFIG,
  PLAYER_COLORS,
  WEAPONS,
  computeDistanceFalloff,
  getEffectiveFireRateMs,
  getMapConfig,
  hasLineOfSight,
  isPointClearOfObstacles,
  isPointInsideInflatedBoxes,
  rayIntersectsAABB,
  raySegmentAABB,
  stepGrenade
} from '../../shared/constants.js';
import {
  KILL_ADRENALINE_HEAL,
  LAG_COMP_MAX_REWIND_MS,
  raycastPlayerHitbox,
  recordPlayerSnapshot,
  recordRoomSnapshots,
  resolveShotRewindMs,
  applyReportedInterpDelay,
  restoreRewoundPlayers,
  rewindRoomPlayersForShot
} from '../../shared/lagCompensation.js';
import { PART_PADDING } from '../../shared/hitboxes.js';
import { FIXED_DT, createMovementState } from '../../shared/movement.js';
import {
  BTN,
  MAX_SHOT_SEQ_GAP,
  commandTimeMs,
  createMoveAck,
  isFireIntervalOk,
  movementStateFromAck,
  sanitizeInputCommand,
  stepCommand
} from '../../shared/netcode.js';
import { computeShotOrigin, createShotState, planShot, resetShotState } from '../../shared/spread.js';
import {
  INPUT_BATCH_MAX_CMDS,
  INPUT_CREDIT_CAP_S,
  INPUT_GAP_WAIT_MS,
  INPUT_QUEUE_MAX,
  INPUT_SEQ_AHEAD_MAX,
  MOVE_BUDGET_CAP_DOWN,
  MOVE_BUDGET_CAP_UP,
  MOVE_BUDGET_CAP_XZ,
  MOVE_CORRECTION_INTERVAL_MS,
  MOVE_DOWN_SPEED,
  MOVE_MAX_SPEED,
  MOVE_UP_SPEED,
  SELF_STATE_INTERVAL_MS,
  SHOT_REJECT,
  STALE_EPOCH_ACK_INTERVAL_MS,
  TICK_INTERVAL_MS,
  createInitialAmmoMap,
  createInitialReserveAmmoMap,
  generateRoomCode,
  getMapCeilingY,
  isFiniteVec,
  normalizeDir,
  randomSpreadSeed,
  round1,
  round2,
  roundTo,
  sanitizeGameMode,
  sanitizeLoadout,
  sanitizeMapId,
  sanitizeName,
  sanitizeRoomCode,
  sanitizeTeam
} from './sanitizers.js';

export class TeamLobbyMethods {
  getHumanCount(room) {
    return room.players.size;
  }

  getTeamCounts(room) {
    let alpha = 0;
    let bravo = 0;
    if (room?.players) {
      for (const p of room.players.values()) {
        if (p.team === 'bravo') bravo++;
        else if (p.team === 'alpha') alpha++;
      }
    }
    return { alpha, bravo };
  }

  assignBalancedTeam(room, preferredTeam = null) {
    const { alpha, bravo } = this.getTeamCounts(room);
    const maxPerTeam = Math.ceil((MATCH_CONFIG.MAX_PLAYERS || 12) / 2);
    const cleanPref = sanitizeTeam(preferredTeam);
    if (cleanPref === 'alpha' && alpha < maxPerTeam) return 'alpha';
    if (cleanPref === 'bravo' && bravo < maxPerTeam) return 'bravo';
    return alpha <= bravo ? 'alpha' : 'bravo';
  }

  /**
   * Keeps `room.hostId` pointing at a live human (the earliest one still in the room).
   * Returns true when the host changed.
   */
  ensureRoomHost(room) {
    if (!room) return false;
    const current = room.hostId ? room.players.get(room.hostId) : null;
    if (current) return false;
    let next = null;
    for (const p of room.players.values()) {
      next = p.id;
      break;
    }
    const changed = next !== room.hostId;
    room.hostId = next;
    return changed && next !== null;
  }

  isRoomHost(room, playerId) {
    return Boolean(room && playerId && room.hostId === playerId);
  }

  canStartTeamMatch(room) {
    if (!room || room.gameMode !== 'tdm' || room.state !== 'WAITING') return false;
    const total = room.players.size;
    if (total === 0) return false;
    if (total === 1) return true; // Allow host to test solo if alone in room
    const { alpha, bravo } = this.getTeamCounts(room);
    return alpha >= 1 && bravo >= 1;
  }

  shouldAutoStartTeamMatch(room) {
    if (!room || room.gameMode !== 'tdm' || room.state !== 'WAITING') return false;
    if (room.players.size < 2) return false;
    const { alpha, bravo } = this.getTeamCounts(room);
    if (alpha < 1 || bravo < 1) return false;
    for (const p of room.players.values()) {
      if (!p.ready) return false;
    }
    return true;
  }

  getTeamLobbyState(room) {
    if (!room) return null;
    const mapCfg = getMapConfig(room.mapId);
    const { alpha, bravo } = this.getTeamCounts(room);
    return {
      roomCode: room.code,
      gameMode: room.gameMode || 'ffa',
      state: room.state,
      mapId: room.mapId,
      mapName: mapCfg.name,
      hostId: room.hostId,
      killLimit: room.killLimit || (room.gameMode === 'tdm' ? (MATCH_CONFIG.TDM_KILL_LIMIT || 30) : (MATCH_CONFIG.KILL_LIMIT || 20)),
      teamScores: room.teamScores || { alpha: 0, bravo: 0 },
      teamCounts: { alpha, bravo },
      canStart: this.canStartTeamMatch(room),
      players: this.serializePlayers(room)
    };
  }

  broadcastTeamLobby(room) {
    if (!room || room.gameMode !== 'tdm') return null;
    const payload = this.getTeamLobbyState(room);
    this.io.to(room.code).emit('teamLobbyState', payload);
    return payload;
  }

  handleSwitchTeam(room, player, payload = {}) {
    if (!room || !player || room.gameMode !== 'tdm') {
      return { ok: false, error: 'invalid_mode', message: 'Chế độ chơi hiện tại không hỗ trợ đổi phe.' };
    }
    if (room.state !== 'WAITING') {
      return {
        ok: false,
        error: 'match_in_progress',
        message: 'Chỉ có thể đổi phe tại phòng chờ trước khi trận đấu bắt đầu!'
      };
    }
    const targetTeam = sanitizeTeam(payload?.team) || (player.team === 'alpha' ? 'bravo' : 'alpha');
    if (targetTeam === player.team) {
      return { ok: true, team: player.team };
    }

    const counts = this.getTeamCounts(room);
    const maxPerTeam = Math.ceil((MATCH_CONFIG.MAX_PLAYERS || 12) / 2);
    if ((counts[targetTeam] || 0) >= maxPerTeam) {
      return {
        ok: false,
        error: 'team_full',
        message: 'Phe này đã đầy (tối đa 6 người mỗi đội)!'
      };
    }

    player.team = targetTeam;
    player.color = targetTeam === 'bravo' ? 0xef4444 : 0x38bdf8;
    if (player._staticMeta) {
      player._staticMeta.color = player.color;
      player._staticMeta.team = targetTeam;
    }

    player.ready = false;
    const sp = this.pickSafeSpawnPoint(room, player.id, targetTeam);
    player.x = sp.x;
    player.y = sp.y || 0;
    player.z = sp.z;
    player.yaw = sp.yaw || 0;
    this.resetPlayerMovement(player, Date.now());
    this.broadcastTeamLobby(room);

    return { ok: true, team: player.team };
  }

  handleSetTeamReady(room, player, payload = {}) {
    if (!room || !player || room.gameMode !== 'tdm' || room.state !== 'WAITING') {
      return { ok: false, error: 'invalid_state', message: 'Không thể thay đổi trạng thái sẵn sàng lúc này.' };
    }
    player.ready = payload?.ready !== undefined ? Boolean(payload.ready) : !player.ready;
    this.broadcastTeamLobby(room);

    let started = false;
    if (this.shouldAutoStartTeamMatch(room)) {
      this.startNewMatch(room);
      started = true;
    }
    return { ok: true, ready: player.ready, started };
  }

  handleStartTeamMatch(room, player) {
    if (!room || !player || room.gameMode !== 'tdm') {
      return { ok: false, error: 'invalid_mode' };
    }
    if (room.state !== 'WAITING') {
      return { ok: false, error: 'already_started' };
    }
    if (!this.isRoomHost(room, player.id)) {
      return {
        ok: false,
        error: 'not_host',
        message: 'Chỉ chủ phòng mới được bắt đầu trận đấu!'
      };
    }
    if (!this.canStartTeamMatch(room)) {
      return {
        ok: false,
        error: 'unbalanced_teams',
        message: 'Cần ít nhất 1 người chơi ở mỗi phe (Alpha & Bravo) để bắt đầu!'
      };
    }
    this.startNewMatch(room);
    return { ok: true, started: true };
  }

  /** Host-only: switch the room's map (emits `mapChanged` itself). Returns { ok, error? }. */
  handleChangeMap(room, player, payload = {}) {
    if (!room || !player) return { ok: false, error: 'invalid' };
    if (!this.isRoomHost(room, player.id)) return { ok: false, error: 'not_host' };
    this.changeRoomMap(room, payload?.mapId);
    return { ok: true };
  }

  /**
   * A player may only use weapons from their server-side loadout (primary / secondary / melee).
   */
  isWeaponAllowed(player, weaponId) {
    if (typeof weaponId !== 'string' || !Object.hasOwn(WEAPONS, weaponId)) return false;
    if (!player) return true;
    const lo = player.loadout;
    return weaponId === lo?.primary || weaponId === lo?.secondary || weaponId === (lo?.melee || 'knife');
  }

  handleUpdateLoadout(room, player, payload = {}) {
    if (!room || !player) return null;
    const nextLoadout = sanitizeLoadout(payload, player.loadout?.primary || 'rifle');

    // Changing loadout mid-life used to refill ammo and unlock any weapon for free. Now a live player
    // can only swap while dead or inside the spawn-protection window; otherwise it applies on respawn.
    const now = Date.now();
    const canApplyNow = !player.alive || (player.invulnerableUntil && now < player.invulnerableUntil);
    if (!canApplyNow) {
      player.pendingLoadout = nextLoadout;
      player.savedLoadoutPrimary = nextLoadout.primary;
      return { ...player.loadout, pending: nextLoadout };
    }

    player.pendingLoadout = null;
    player.loadout = nextLoadout;
    player.savedLoadoutPrimary = nextLoadout.primary;

    if (!player.ammoByWeapon) {
      player.ammoByWeapon = createInitialAmmoMap();
    } else {
      player.ammoByWeapon[nextLoadout.primary] = WEAPONS[nextLoadout.primary].magSize;
      player.ammoByWeapon[nextLoadout.secondary] = WEAPONS[nextLoadout.secondary].magSize;
      player.ammoByWeapon.knife = 1;
    }

    if (!player.reserveAmmoByWeapon) {
      player.reserveAmmoByWeapon = createInitialReserveAmmoMap();
    } else {
      player.reserveAmmoByWeapon[nextLoadout.primary] = WEAPONS[nextLoadout.primary].reserveAmmo ?? 90;
      player.reserveAmmoByWeapon[nextLoadout.secondary] = WEAPONS[nextLoadout.secondary].reserveAmmo ?? 36;
      player.reserveAmmoByWeapon.knife = 0;
    }

    if (!player.alive) {
      player.weapon = nextLoadout.primary;
      player.ammo = WEAPONS[nextLoadout.primary].magSize;
      player.reserveAmmo = WEAPONS[nextLoadout.primary].reserveAmmo ?? 90;
    } else {
      const curSlot = WEAPONS[player.weapon]?.slot || 1;
      if (curSlot === 1) {
        player.weapon = nextLoadout.primary;
      } else if (curSlot === 2) {
        player.weapon = nextLoadout.secondary;
      }
      player.reloadingUntil = 0;
      player.reloadWeapon = null;
      player.nextShellAt = 0;
      player.ammo = player.ammoByWeapon[player.weapon] ?? WEAPONS[player.weapon].magSize;
      player.reserveAmmo = player.reserveAmmoByWeapon[player.weapon] ?? (WEAPONS[player.weapon].reserveAmmo ?? 0);
    }

    return player.loadout;
  }

  changeRoomMap(room, rawMapId) {
    if (!room) return;
    const nextMapId = sanitizeMapId(rawMapId);
    if (room.mapId === nextMapId) return;

    const nextPickups = this.createPickupsForMap(nextMapId);
    room.mapId = nextMapId;
    room.pickups = nextPickups;
    room.barrels = this.createBarrelsForMap(nextMapId);
    room.droppedWeapons = [];
    room.grenades = [];
    room.recentSpawns = [];

    // Mark all players not yet placed so sequential respawn assigns distinct safe points
    for (const p of room.players.values()) {
      p.alive = false;
    }

    // Respawn all players on the new map's spawn points (or update preview spawn if WAITING)
    const mapCfg = getMapConfig(nextMapId);
    const isWaiting = room.gameMode === 'tdm' && room.state === 'WAITING';
    for (const p of room.players.values()) {
      if (isWaiting) {
        const sp = this.pickSafeSpawnPoint(room, p.id, p.team);
        p.x = sp.x;
        p.y = sp.y || 0;
        p.z = sp.z;
        p.yaw = sp.yaw || 0;
        p.alive = false;
        p.respawnAt = Infinity;
        this.resetPlayerMovement(p, Date.now());
      } else {
        this.respawnPlayer(room, p);
      }
    }

    this.io.to(room.code).emit('mapChanged', {
      mapId: room.mapId,
      mapName: mapCfg.name,
      pickups: room.pickups,
      barrels: room.barrels,
      droppedWeapons: room.droppedWeapons,
      activeGrenades: this.serializeGrenades(room),
      players: this.serializePlayers(room)
    });
    if (isWaiting) {
      this.broadcastTeamLobby(room);
    }
  }
}
