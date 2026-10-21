import { ServerNetStats } from './netStats.js';
import { installSmartVolatile } from './socketGuard.js';
import {
  DEFAULT_MAP_ID,
  MAPS,
  MATCH_CONFIG,
  PLAYER_COLORS,
  WEAPONS
} from '../shared/constants.js';
import { recordPlayerSnapshot, recordRoomSnapshots } from '../shared/lagCompensation.js';
import { createShotState } from '../shared/spread.js';
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
  applyClassMixins,
  createInitialAmmoMap,
  createInitialReserveAmmoMap,
  generateRoomCode,
  sanitizeGameMode,
  sanitizeLoadout,
  sanitizeMapId,
  sanitizeName,
  sanitizeRoomCode,
  sanitizeTeam
} from './room/sanitizers.js';
import { SpawningMethods } from './room/spawning.js';
import { TeamLobbyMethods } from './room/teamLobby.js';
import { MovementSyncMethods } from './room/movementSync.js';
import { CombatSystemMethods } from './room/combatSystem.js';
import { WorldEntitiesMethods } from './room/worldEntities.js';
import { MatchLifecycleMethods } from './room/matchLifecycle.js';

export {
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
  createInitialAmmoMap,
  createInitialReserveAmmoMap,
  generateRoomCode,
  sanitizeGameMode,
  sanitizeLoadout,
  sanitizeMapId,
  sanitizeName,
  sanitizeRoomCode,
  sanitizeTeam
};

export class RoomManager {
  constructor(io) {
    this.io = io;
    this.rooms = new Map();
    this.lastTickAt = Date.now();
    this.latencyProbes = new Map(); // socketId -> interval timer of the server-side RTT probe
    this.netStats = new ServerNetStats(); // tick duration / lateness / snapshot size for /api/netstats

    // 25Hz simulation and state broadcast loop: drift-corrected self-scheduling timer (see startTickLoop)
    this._tickTimer = null;
    this._tickStopped = true;
    this.startTickLoop();
  }

  /**
   * `tickInterval` is the handle of the pending tick timer. It is always a real (unref'd) Timeout, so
   * `clearInterval(rm.tickInterval)` / `clearTimeout(rm.tickInterval)` stop the loop (the next slot is only scheduled
   * from inside the timer callback), and assigning `null` stops it too. `rm.stop()` is the explicit API.
   */
  get tickInterval() {
    return this._tickTimer;
  }

  set tickInterval(timer) {
    if (timer === null || timer === undefined) {
      this.stopTickLoop();
      return;
    }
    this._tickTimer = timer;
  }

  /**
   * Starts the drift-corrected simulation loop. Instead of `setInterval` (which accumulates drift and bursts
   * catch-up ticks after a stall), every run targets the next absolute slot `slotAt0 + n * TICK_INTERVAL_MS`
   * measured with performance.now(); slots that were already missed during a long tick/GC pause are skipped.
   * The timer is unref'd so it never keeps the process alive.
   */
  startTickLoop() {
    this.stopTickLoop();
    this._tickStopped = false;
    this._nextTickSlotAt = performance.now() + TICK_INTERVAL_MS;
    this._scheduleNextTick();
    return this._tickTimer;
  }

  stopTickLoop() {
    this._tickStopped = true;
    if (this._tickTimer) {
      clearTimeout(this._tickTimer);
      this._tickTimer = null;
    }
  }

  stop() {
    this.stopTickLoop();
  }

  _scheduleNextTick() {
    if (this._tickStopped) return;
    const nowPerf = performance.now();
    const delay = Math.max(0, this._nextTickSlotAt - nowPerf);
    const timer = setTimeout(() => this._onTickSlot(), delay);
    if (typeof timer.unref === 'function') timer.unref();
    this._tickTimer = timer;
  }

  _onTickSlot() {
    this._tickTimer = null;
    if (this._tickStopped) return;
    const slotStart = performance.now();
    try {
      this.tick();
      this.netStats.recordTick(performance.now() - slotStart, slotStart - this._nextTickSlotAt);
    } catch (err) {
      console.error('[tickLoop] uncaught error in tick():', err);
    } finally {
      // Advance to the next absolute slot strictly in the future, skipping any slots missed while ticking
      const afterPerf = performance.now();
      let nextSlot = this._nextTickSlotAt + TICK_INTERVAL_MS;
      if (nextSlot <= afterPerf) {
        const missed = Math.floor((afterPerf - nextSlot) / TICK_INTERVAL_MS) + 1;
        nextSlot += missed * TICK_INTERVAL_MS;
        this.netStats.skippedSlots += missed;
      }
      this._nextTickSlotAt = nextSlot;
      this._scheduleNextTick();
    }
  }

  createRoom(code, isPublic = true, mapId = DEFAULT_MAP_ID, gameMode = 'ffa') {
    const roomCode = code || generateRoomCode(this.rooms);
    const cleanMapId = sanitizeMapId(mapId);
    const cleanGameMode = sanitizeGameMode(gameMode);
    const isTdm = cleanGameMode === 'tdm';
    const now = Date.now();

    const room = {
      code: roomCode,
      isPublic,
      mapId: cleanMapId,
      gameMode: cleanGameMode,
      state: isTdm ? 'WAITING' : 'PLAYING', // 'WAITING' | 'PLAYING' | 'ENDED'
      matchStartedAt: now,
      matchEndsAt: now + MATCH_CONFIG.MATCH_DURATION_SEC * 1000,
      nextMatchAt: 0,
      killLimit: isTdm ? (MATCH_CONFIG.TDM_KILL_LIMIT || 30) : (MATCH_CONFIG.KILL_LIMIT || 20),
      teamScores: { alpha: 0, bravo: 0 },
      players: new Map(),
      pickups: this.createPickupsForMap(cleanMapId),
      barrels: this.createBarrelsForMap(cleanMapId),
      droppedWeapons: [],
      grenades: [],
      recentSpawns: [],
      hostId: null // first player in the room; only the host may change the map or force-start TDM
    };

    this.rooms.set(roomCode, room);
    return room;
   }

  findOrCreatePublicRoom(preferredMapId = null, gameMode = 'ffa') {
    const cleanMapId = preferredMapId ? sanitizeMapId(preferredMapId) : null;
    const cleanGameMode = sanitizeGameMode(gameMode);

    // First look for an open public room matching the requested map & gameMode
    for (const room of this.rooms.values()) {
      if (!room.isPublic) continue;
      if ((room.gameMode || 'ffa') !== cleanGameMode) continue;
      if (cleanMapId && room.mapId !== cleanMapId) continue;
      const humanCount = this.getHumanCount(room);
      if (humanCount < MATCH_CONFIG.MAX_PLAYERS) {
        return room;
      }
    }

    // Create a public room for this map & gameMode
    const defaultCode = (cleanGameMode === 'ffa' && !this.rooms.has('PUB001'))
      ? 'PUB001'
      : generateRoomCode(this.rooms);
    return this.createRoom(defaultCode, true, cleanMapId || DEFAULT_MAP_ID, cleanGameMode);
  }

  getOrCreateRoomByCode(rawCode, isPublic = false, mapId = DEFAULT_MAP_ID, gameMode = 'ffa') {
    const code = sanitizeRoomCode(rawCode);
    if (code && this.rooms.has(code)) {
      return this.rooms.get(code);
    }
    return this.createRoom(code || generateRoomCode(this.rooms), isPublic, mapId, gameMode);
  }

  addHumanPlayer(socket, { name, roomCode, mode, weapon, loadout, mapId, gameMode, team } = {}) {
    installSmartVolatile(socket);
    const cleanName = sanitizeName(name);
    const requestedCode = sanitizeRoomCode(roomCode);
    const cleanLoadout = sanitizeLoadout(loadout, weapon);
    const initialWeapon = this.isWeaponAllowed({ loadout: cleanLoadout }, weapon) ? weapon : cleanLoadout.primary;
    const cleanMapId = sanitizeMapId(mapId);
    const cleanGameMode = sanitizeGameMode(gameMode);

    let room;
    if (requestedCode) {
      room = this.getOrCreateRoomByCode(requestedCode, mode === 'public', cleanMapId, cleanGameMode);
    } else if (mode === 'private') {
      room = this.createRoom(generateRoomCode(this.rooms), false, cleanMapId, cleanGameMode);
    } else {
      room = this.findOrCreatePublicRoom(cleanMapId, cleanGameMode);
    }

    // Check human capacity
    if (this.getHumanCount(room) >= MATCH_CONFIG.MAX_PLAYERS) {
      return { error: 'Phòng này đã đủ 12 người chơi thật! Vui lòng tạo phòng mới hoặc vào phòng chung.' };
    }

    // Update the map & gameMode if this player is the first human in the room
    if (this.getHumanCount(room) === 0) {
      if (mapId && typeof mapId === 'string' && Object.hasOwn(MAPS, mapId) && room.mapId !== mapId) {
        const nextPickups = this.createPickupsForMap(mapId);
        room.mapId = mapId;
        room.pickups = nextPickups;
        room.barrels = this.createBarrelsForMap(mapId);
      }
      if (gameMode !== undefined && room.gameMode !== cleanGameMode) {
        room.gameMode = cleanGameMode;
        room.killLimit = cleanGameMode === 'tdm' ? (MATCH_CONFIG.TDM_KILL_LIMIT || 30) : (MATCH_CONFIG.KILL_LIMIT || 20);
        room.teamScores = { alpha: 0, bravo: 0 };
        room.state = cleanGameMode === 'tdm' ? 'WAITING' : 'PLAYING';
      }
    }

    const now = Date.now();
    const protectionMs = MATCH_CONFIG.SPAWN_PROTECTION_MS || 1500;
    const isTdm = room.gameMode === 'tdm';
    const assignedTeam = isTdm ? this.assignBalancedTeam(room, team) : null;
    const isWaiting = isTdm && room.state === 'WAITING';
    const spawn = this.pickSafeSpawnPoint(room, socket.id, assignedTeam);
    const colorIdx = room.players.size % PLAYER_COLORS.length;
    const playerColor = isTdm
      ? (assignedTeam === 'bravo' ? 0xef4444 : 0x38bdf8)
      : PLAYER_COLORS[colorIdx];
    const weaponCfg = WEAPONS[initialWeapon];

    const player = {
      id: socket.id,
      name: cleanName,
      color: playerColor,
      team: assignedTeam,
      ready: isTdm ? !isWaiting : true,
      x: spawn.x,
      y: spawn.y || 0,
      z: spawn.z,
      vx: 0,
      vy: 0,
      vz: 0,
      lastMoveAt: now,
      lastMoveSeq: 0,
      yaw: spawn.yaw || 0,
      pitch: 0,
      crouching: false,
      prone: false,
      isAiming: false,
      lean: 0,
      loadout: cleanLoadout,
      savedLoadoutPrimary: cleanLoadout.primary,
      weapon: initialWeapon,
      ammoByWeapon: createInitialAmmoMap(),
      reserveAmmoByWeapon: createInitialReserveAmmoMap(),
      ammo: weaponCfg.magSize,
      reserveAmmo: weaponCfg.infiniteAmmo ? 0 : (weaponCfg.reserveAmmo ?? weaponCfg.magSize * 3),
      grenades: 1,
      hp: MATCH_CONFIG.MAX_HP,
      armor: 0,
      speedBoostUntil: 0,
      damageBoostUntil: 0,
      multiKillCount: 0,
      lastKillAt: 0,
      alive: !isWaiting,
      kills: 0,
      deaths: 0,
      streak: 0,
      lastShotAt: 0,
      lastGrenadeAt: 0,
      reloadingUntil: 0,
      reloadStartedAt: 0,
      reloadWeapon: null,
      nextShellAt: 0,
      respawnAt: isWaiting ? Infinity : 0,
      invulnerableUntil: isWaiting ? 0 : (now + protectionMs),
      lastDeathX: null,
      lastDeathZ: null,
      // Shots in the command stream (see processFireCommand): `ss` bookkeeping + the owner-only spread seed
      lastShotSeq: 0,
      lastFireCmdTimeMs: -Infinity,
      lastShotReject: null,
      spreadSeed: 0,
      shotState: createShotState(),
      _staticMeta: {
        id: socket.id,
        name: cleanName,
        color: playerColor,
        team: assignedTeam
      }
    };

    // Input-command netcode state (epoch 1 = the spawn); `moveEpoch` is sent to the client in `roomJoined`
    player.moveEpoch = 0;
    player.lastProcessedSeq = 0;
    this.resetPlayerMovement(player, now);
    this.resetShotSession(player);
    recordPlayerSnapshot(player, now);
    room.players.set(socket.id, player);
    this.ensureRoomHost(room);
    recordRoomSnapshots(room, now);

    return { room, player };
  }

  removePlayer(socketId) {
    this.stopLatencyProbe(socketId);
    for (const [code, room] of this.rooms.entries()) {
      if (room.players.has(socketId)) {
        const leaving = room.players.get(socketId);
        room.players.delete(socketId);
        this.io.to(code).emit('playerLeft', {
          playerId: socketId,
          name: leaving?.name || 'Player'
        });

        if (this.getHumanCount(room) === 0) {
          this.rooms.delete(code);
        } else {
          if (this.ensureRoomHost(room)) {
            const host = room.players.get(room.hostId);
            this.io.to(code).emit('hostChanged', { hostId: room.hostId, name: host?.name || 'Player' });
          }
          if (room.gameMode === 'tdm' && room.state === 'WAITING') {
            this.broadcastTeamLobby(room);
            if (this.shouldAutoStartTeamMatch(room)) {
              this.startNewMatch(room);
            }
          }
        }
        return;
      }
    }
  }
}

applyClassMixins(
  RoomManager,
  SpawningMethods,
  TeamLobbyMethods,
  MovementSyncMethods,
  CombatSystemMethods,
  WorldEntitiesMethods,
  MatchLifecycleMethods
);
