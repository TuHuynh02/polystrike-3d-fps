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
import { COLD_REFRESH_MS, COLD_REPEAT_MS } from '../../shared/playerDelta.js';
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

// Ticks between full-refresh stateUpdates (~COLD_REFRESH_MS: 25 at 25 Hz, 50 at 50 Hz).
const STATE_REFRESH_TICKS = Math.max(1, Math.round(COLD_REFRESH_MS / TICK_INTERVAL_MS));

// Debug switch: send stateUpdate / shotFired reliably instead of volatile (no `process` in the browser LAN host)
const SV_RELIABLE = typeof process !== 'undefined' && Boolean(process.env?.SV_RELIABLE);

export class MatchLifecycleMethods {
  getLeaderboard(room) {
    return Array.from(room.players.values())
      .map((p) => ({
        id: p.id,
        name: p.name,
        color: p.color,
        team: p.team || null,
        kills: p.kills,
        deaths: p.deaths,
        streak: p.streak
      }))
      .sort((a, b) => {
        if (b.kills !== a.kills) return b.kills - a.kills;
        return a.deaths - b.deaths;
      });
  }

  endMatch(room, explicitWinner = null, explicitWinningTeam = null) {
    if (room.state === 'ENDED') return;
    room.state = 'ENDED';
    const now = Date.now();
    room.nextMatchAt = now + MATCH_CONFIG.INTERMISSION_SEC * 1000;

    const leaderboard = this.getLeaderboard(room);
    const isTdm = room.gameMode === 'tdm';
    let winner;
    let winningTeam = null;

    if (isTdm) {
      const alphaKills = room.teamScores?.alpha || 0;
      const bravoKills = room.teamScores?.bravo || 0;
      winningTeam = explicitWinningTeam || (alphaKills > bravoKills ? 'alpha' : bravoKills > alphaKills ? 'bravo' : 'draw');
      if (winningTeam === 'alpha') {
        winner = {
          id: 'team_alpha',
          name: 'PHE XANH (ALPHA)',
          team: 'alpha',
          kills: alphaKills,
          deaths: bravoKills,
          color: 0x38bdf8
        };
      } else if (winningTeam === 'bravo') {
        winner = {
          id: 'team_bravo',
          name: 'PHE ĐỎ (BRAVO)',
          team: 'bravo',
          kills: bravoKills,
          deaths: alphaKills,
          color: 0xef4444
        };
      } else {
        winner = {
          id: 'team_draw',
          name: 'HÒA (DRAW)',
          team: 'draw',
          kills: alphaKills,
          deaths: bravoKills,
          color: 0x94a3b8
        };
      }
    } else {
      winner = explicitWinner
        ? {
            id: explicitWinner.id,
            name: explicitWinner.name,
            kills: explicitWinner.kills,
            deaths: explicitWinner.deaths,
            color: explicitWinner.color
          }
        : leaderboard[0] || { name: 'Draw', kills: 0, deaths: 0 };
    }

    this.io.to(room.code).emit('matchEnded', {
      winner,
      winningTeam,
      gameMode: room.gameMode || 'ffa',
      teamScores: isTdm ? { ...(room.teamScores || { alpha: 0, bravo: 0 }) } : undefined,
      leaderboard,
      nextMatchIn: MATCH_CONFIG.INTERMISSION_SEC
    });
  }

  startNewMatch(room) {
    const now = Date.now();
    const isTdm = room.gameMode === 'tdm';
    room.state = 'PLAYING';
    room.matchStartedAt = now;
    room.matchEndsAt = now + MATCH_CONFIG.MATCH_DURATION_SEC * 1000;
    room.nextMatchAt = 0;
    room.killLimit = isTdm ? (MATCH_CONFIG.TDM_KILL_LIMIT || 30) : (MATCH_CONFIG.KILL_LIMIT || 20);
    room.teamScores = { alpha: 0, bravo: 0 };
    room.droppedWeapons = [];
    room.grenades = [];
    room.recentSpawns = [];

    // Reset all pickups & explosive barrels
    for (const pack of room.pickups) {
      pack.active = true;
      pack.respawnAt = 0;
    }
    if (Array.isArray(room.barrels)) {
      const maxBrlHp = MATCH_CONFIG.BARREL_MAX_HP || 60;
      for (const barrel of room.barrels) {
        barrel.active = true;
        barrel.hp = barrel.maxHp || maxBrlHp;
        barrel.respawnAt = 0;
      }
    }

    // Mark all players not yet placed so sequential respawn assigns non-overlapping points
    for (const p of room.players.values()) {
      p.alive = false;
      p.ready = true;
      p.lastDeathX = null;
      p.lastDeathZ = null;
    }

    // Reset all player scores and respawn
    for (const p of room.players.values()) {
      p.kills = 0;
      p.deaths = 0;
      p.streak = 0;
      this.respawnPlayer(room, p);
    }

    this.io.to(room.code).emit('matchStarted', {
      mapId: room.mapId,
      gameMode: room.gameMode || 'ffa',
      state: room.state,
      timeRemaining: MATCH_CONFIG.MATCH_DURATION_SEC,
      killLimit: room.killLimit,
      teamScores: isTdm ? { ...room.teamScores } : undefined,
      pickups: room.pickups,
      barrels: room.barrels,
      droppedWeapons: room.droppedWeapons,
      activeGrenades: this.serializeGrenades(room),
      players: this.serializePlayers(room)
    });
  }

  serializeGrenades(room) {
    const grenades = room?.grenades;
    if (!Array.isArray(grenades) || grenades.length === 0) return [];
    const list = new Array(grenades.length);
    let idx = 0;
    for (let i = 0; i < grenades.length; i++) {
      const g = grenades[i];
      if (!g) continue;
      list[idx++] = {
        id: g.id,
        ownerId: g.ownerId,
        x: round2(g.x),
        y: round2(g.y),
        z: round2(g.z),
        vx: round2(g.vx),
        vy: round2(g.vy),
        vz: round2(g.vz),
        fuseRemaining: round2(g.fuseRemaining)
      };
    }
    if (idx < list.length) {
      list.length = idx;
    }
    return list;
  }

  /**
   * Player list for the wire. Without `delta` every entry is complete (roomJoined, lobby events). With
   * `delta = { refresh }` (the periodic stateUpdate) the cold block (shared/playerDelta.js) is only included for a player
   * while it changed within COLD_REPEAT_MS, or in a `refresh` snapshot; other entries carry the hot fields only.
   */
  serializePlayers(room, now = Date.now(), delta = null) {
    if (!room || !room.players) return [];
    const list = new Array(room.players.size);
    let idx = 0;
    for (const p of room.players.values()) {
      if (!p.alive || (p.lastMoveAt && now - p.lastMoveAt > 120)) {
        p.vx = 0;
        p.vy = 0;
        p.vz = 0;
      }
      let meta = p._staticMeta;
      if (!meta || meta.id !== p.id || meta.name !== p.name || meta.color !== p.color || meta.team !== p.team) {
        meta = {
          id: p.id,
          name: p.name,
          color: p.color,
          team: p.team || null
        };
        p._staticMeta = meta;
      }
      const invulnerable = Boolean(p.alive && p.invulnerableUntil && now < p.invulnerableUntil);
      const grenades = Number.isFinite(p.grenades) ? p.grenades : 1;
      const armor = p.armor > 0 ? p.armor : 0;
      const speedBoosted = Boolean(p.alive && p.speedBoostUntil > now);
      const damageBoosted = Boolean(p.alive && p.damageBoostUntil > now);

      let includeCold = true;
      if (delta) {
        // Change detection over the cold fields that clients actually read from snapshots. ammo / reserveAmmo are left out on
        // purpose (they change with every shot and the owner gets them through `selfState`); they ride the periodic refresh.
        // Boost timers are compared by their absolute end, so a running countdown does not count as a change.
        const c = p._coldSent || (p._coldSent = {});
        const speedUntil = speedBoosted ? p.speedBoostUntil : 0;
        const damageUntil = damageBoosted ? p.damageBoostUntil : 0;
        if (
          c.name !== meta.name || c.color !== meta.color || c.team !== meta.team || c.ready !== Boolean(p.ready) ||
          c.grenades !== grenades || c.armor !== armor || c.speedUntil !== speedUntil || c.damageUntil !== damageUntil ||
          c.invulnerable !== invulnerable || c.kills !== (p.kills || 0) || c.deaths !== (p.deaths || 0) || c.streak !== (p.streak || 0)
        ) {
          c.name = meta.name;
          c.color = meta.color;
          c.team = meta.team;
          c.ready = Boolean(p.ready);
          c.grenades = grenades;
          c.armor = armor;
          c.speedUntil = speedUntil;
          c.damageUntil = damageUntil;
          c.invulnerable = invulnerable;
          c.kills = p.kills || 0;
          c.deaths = p.deaths || 0;
          c.streak = p.streak || 0;
          p._coldUntil = now + COLD_REPEAT_MS;
        }
        includeCold = delta.refresh || now < p._coldUntil;
      }

      const entry = {
        id: meta.id,
        x: round2(p.x),
        y: round2(p.y),
        z: round2(p.z),
        vx: round1(p.vx),
        vy: round1(p.vy),
        vz: round1(p.vz),
        yaw: round2(p.yaw),
        pitch: round2(p.pitch),
        crouching: Boolean(p.crouching),
        prone: Boolean(p.prone),
        sliding: Boolean(p.sliding || p.isSliding || p.moveState?.isSliding),
        lean: round2(p.lean),
        weapon: p.weapon,
        hp: Number.isFinite(p.hp) ? p.hp : 0,
        alive: Boolean(p.alive)
      };
      if (includeCold) {
        entry.name = meta.name;
        entry.color = meta.color;
        entry.team = meta.team;
        entry.ready = Boolean(p.ready);
        entry.ammo = Number.isFinite(p.ammo) ? p.ammo : 0;
        entry.reserveAmmo = Number.isFinite(p.reserveAmmo) ? p.reserveAmmo : 0;
        entry.grenades = grenades;
        if (armor > 0) entry.armor = armor;
        if (speedBoosted) entry.speedBoostMs = Math.round(p.speedBoostUntil - now);
        if (damageBoosted) entry.damageBoostMs = Math.round(p.damageBoostUntil - now);
        entry.invulnerable = invulnerable;
        entry.invulnerableUntil = invulnerable ? p.invulnerableUntil : 0;
        entry.kills = p.kills || 0;
        entry.deaths = p.deaths || 0;
        entry.streak = p.streak || 0;
      }
      list[idx++] = entry;
    }
    return list;
  }

  tick(customDt = null) {
    const now = Date.now();
    const dt = typeof customDt === 'number' && Number.isFinite(customDt) && customDt > 0
      ? customDt
      : Math.min(0.1, (now - this.lastTickAt) / 1000);
    this.lastTickAt = now;

    // Server timestamp (ms) stamped on every stateUpdate of this tick (same value for all rooms/players in it).
    // Clock choice: Date.now() captured ONCE at the start of the tick - the very same value used as the lag-compensation
    // history timestamp (recordRoomSnapshots(room, now)), so client interpolation time and server rewind time share one
    // epoch. Date.now() can step backwards (NTP), so the stamp is forced strictly increasing across ticks.
    const prevStamp = this._lastStateStampMs;
    const stateStampMs = (typeof prevStamp === 'number' && now <= prevStamp) ? prevStamp + 1 : now;
    this._lastStateStampMs = stateStampMs;

    for (const room of this.rooms.values()) {
      try {
        // Skip idle rooms with zero human players to save 100% CPU when no match is active
        if (this.getHumanCount(room) === 0) continue;

        if (room.state === 'WAITING') {
          continue;
        }

        if (room.state === 'ENDED') {
          if (now >= room.nextMatchAt) {
            this.startNewMatch(room);
          }
          continue;
        }

        // Check round time limit
        const timeRemaining = Math.max(0, Math.ceil((room.matchEndsAt - now) / 1000));
        if (timeRemaining <= 0) {
          this.endMatch(room);
          continue;
        }

        this._deferSelfState = true;
        try {
          // Respawn human players whose 3s respawn delay has elapsed & advance reloads
          for (const p of room.players.values()) {
            if (!p.alive && now >= p.respawnAt) {
              this.respawnPlayer(room, p);
            } else if (p.alive && p.reloadingUntil) {
              this.syncPlayerReloadState(p, now);
            }
            // Authoritative movement: simulate the player's queued input commands (time-credit limited) and ack them
            this.processPlayerInputs(room, p, now);
          }

          // Record lag compensation position snapshots for all alive players
          recordRoomSnapshots(room, now);

          // Update active Frag Grenades physics & 2.2s fuse detonation
          this.updateGrenades(room, dt, now);

          // Update Health Pack / Power-up pickups, Explosive Barrels & 5s Dropped Weapons expiration
          this.updateHealthPacks(room, now);
          this.updateBarrels(room, now);
          this.updateDroppedWeapons(room, now);
        } finally {
          this._deferSelfState = false;
        }

        // Owner-only `selfState` reconciliation: immediate on state change (coalesced to at most 1 per tick), or periodic (~8.3 Hz)
        for (const p of room.players.values()) {
          if (p._selfStateDirty || now - (p.lastSelfStateAt || 0) >= SELF_STATE_INTERVAL_MS) {
            this.sendSelfState(p, now, Boolean(p._selfStateReliable));
          } else {
            const sig = this._selfStateSignature(p);
            if (sig !== p._selfStateSig) {
              this.sendSelfState(p, now, Boolean(p._selfStateReliable), sig);
            }
          }
        }

        // Broadcast compact state snapshot (use volatile on Socket.IO to prevent TCP bufferbloat)
        room.stateSeq = ((room.stateSeq || 0) + 1) | 0;
        const roomTarget = this.io.to(room.code);
        const emitter = SV_RELIABLE ? roomTarget : (roomTarget.volatile || roomTarget);
        // Hot/cold split (shared/playerDelta.js): a periodic full-refresh snapshot (the first one of a room and then about once
        // per second) carries everything; the snapshots in between carry only what changes every tick. Pickups and dropped
        // weapons have their own reliable change events (`pickupState`, `weaponDropped`, `droppedWeaponsUpdate`), so in between
        // they are left out (the client only applies them when the field is an array).
        const refresh = (room.stateSeq - 1) % STATE_REFRESH_TICKS === 0;
        const statePayload = {
          seq: room.stateSeq,
          t: stateStampMs,
          gameMode: room.gameMode || 'ffa',
          state: room.state,
          teamScores: room.gameMode === 'tdm' ? room.teamScores : undefined,
          timeRemaining,
          pickups: refresh ? room.pickups : undefined,
          droppedWeapons: refresh ? room.droppedWeapons : undefined,
          activeGrenades: this.serializeGrenades(room),
          players: this.serializePlayers(room, now, { refresh })
        };
        emitter.emit('stateUpdate', statePayload);
        // size sample for /api/netstats (about once per second per room; the emit itself already encoded the packet)
        if (room.stateSeq % STATE_REFRESH_TICKS === 0) this.netStats.recordSnapshotBytes(JSON.stringify(statePayload).length);
      } catch (err) {
        this._deferSelfState = false;
        console.error(`[tick] error in room ${room?.code}:`, err);
      }
    }
  }

  /** Counts + timings for /api/netstats (no player-identifying data). */
  getNetStats() {
    let players = 0;
    for (const room of this.rooms.values()) players += this.getHumanCount(room);
    return this.netStats.report({ tickIntervalMs: TICK_INTERVAL_MS, rooms: this.rooms.size, players });
  }

  getPublicRoomsSummary() {
    const list = [];
    for (const room of this.rooms.values()) {
      if (!room.isPublic) continue;
      const humans = this.getHumanCount(room);
      const mapCfg = getMapConfig(room.mapId);
      list.push({
        code: room.code,
        isPublic: room.isPublic,
        mapId: room.mapId,
        mapName: mapCfg.name,
        gameMode: room.gameMode || 'ffa',
        teamScores: room.gameMode === 'tdm' ? room.teamScores : undefined,
        humans,
        total: humans,
        maxPlayers: MATCH_CONFIG.MAX_PLAYERS,
        state: room.state,
        timeRemaining: room.state === 'WAITING'
          ? MATCH_CONFIG.MATCH_DURATION_SEC
          : Math.max(0, Math.ceil((room.matchEndsAt - Date.now()) / 1000))
      });
    }
    return list;
  }
}
