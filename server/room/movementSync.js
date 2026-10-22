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

export class MovementSyncMethods {
  /**
   * Feeds one server-measured round-trip sample into `player.rttMs` (exponential moving average,
   * clamped to 0..MAX_RTT_MS). Client-reported ping/latency values are never used for lag compensation.
   */
  recordRtt(player, rttMs) {
    if (!player || typeof rttMs !== 'number' || !Number.isFinite(rttMs)) return null;
    const maxRtt = MATCH_CONFIG.MAX_RTT_MS || 1000;
    const sample = Math.max(0, Math.min(maxRtt, rttMs));
    const alpha = MATCH_CONFIG.LATENCY_EMA_ALPHA || 0.3;
    const prev = player.rttMs;
    player.rttMs = (typeof prev === 'number' && Number.isFinite(prev) && player.rttSamples > 0)
      ? Math.max(0, Math.min(maxRtt, prev + (sample - prev) * alpha))
      : sample;
    player.rttSamples = (player.rttSamples || 0) + 1;
    return player.rttMs;
  }

  /**
   * Records the interpolation delay (ms) the client currently renders remote players with (`d` of its inputBatch). Used
   * by lag compensation: rewind = server-measured rtt / 2 + this delay (sanitised, slew-limited, capped; see
   * shared/lagCompensation.js applyReportedInterpDelay).
   */
  noteInterpDelay(player, reportedMs, now = Date.now()) {
    return applyReportedInterpDelay(player, reportedMs, now);
  }

  /**
   * Starts (or restarts) the periodic server -> client latency probe for a human player.
   * Emits `latencyProbe(serverTime, ack)`; the client replies by calling the ack, and the RTT is measured
   * with the server's own monotonic clock. The timer is cleared by `stopLatencyProbe` / `removePlayer`.
   */
  startLatencyProbe(socket, player) {
    if (!socket || !player || typeof socket.emit !== 'function') return null;
    this.stopLatencyProbe(socket.id);

    const intervalMs = MATCH_CONFIG.LATENCY_PROBE_INTERVAL_MS || 2000;
    const sendProbe = () => {
      if (socket.disconnected) {
        this.stopLatencyProbe(socket.id);
        return;
      }
      const sentAt = performance.now();
      socket.emit('latencyProbe', Date.now(), () => {
        this.recordRtt(player, performance.now() - sentAt);
      });
    };

    const timer = setInterval(sendProbe, intervalMs);
    if (typeof timer.unref === 'function') timer.unref();
    this.latencyProbes.set(socket.id, timer);
    sendProbe();
    return timer;
  }

  stopLatencyProbe(socketId) {
    const timer = this.latencyProbes.get(socketId);
    if (timer) {
      clearInterval(timer);
      this.latencyProbes.delete(socketId);
    }
  }

  syncPlayerReloadState(player, now = Date.now(), emitIfChanged = true) {
    if (!player || !player.reloadingUntil) return;

    const wId = player.reloadWeapon || player.weapon;
    const cfg = WEAPONS[wId] || WEAPONS.rifle;
    const prevAmmo = player.ammoByWeapon?.[wId] ?? player.ammo ?? 0;
    const prevReloading = player.reloadingUntil;

    if (cfg.shellByShell) {
      // Advance shell-by-shell insertion for shotgun, consuming from reserveAmmo
      const shellMs = cfg.shellReloadMs || 390;
      while (player.nextShellAt > 0 && now >= player.nextShellAt - 45) {
        const cur = player.ammoByWeapon?.[wId] ?? player.ammo ?? 0;
        const curRes = player.reserveAmmoByWeapon?.[wId] ?? (player.weapon === wId ? player.reserveAmmo : cfg.reserveAmmo) ?? 0;
        if (curRes <= 0 || cur >= cfg.magSize) {
          player.reloadingUntil = 0;
          player.reloadWeapon = null;
          player.nextShellAt = 0;
          break;
        }
        const nextAmmo = Math.min(cfg.magSize, cur + 1);
        const nextRes = Math.max(0, curRes - (nextAmmo - cur));
        if (player.ammoByWeapon) {
          player.ammoByWeapon[wId] = nextAmmo;
        }
        if (player.reserveAmmoByWeapon) {
          player.reserveAmmoByWeapon[wId] = nextRes;
        }
        if (player.weapon === wId) {
          player.ammo = nextAmmo;
          player.reserveAmmo = nextRes;
        }
        if (nextAmmo >= cfg.magSize || nextRes <= 0) {
          player.reloadingUntil = 0;
          player.reloadWeapon = null;
          player.nextShellAt = 0;
          break;
        }
        player.nextShellAt += shellMs;
      }

      if (player.reloadingUntil && now >= player.reloadingUntil) {
        player.reloadingUntil = 0;
        player.reloadWeapon = null;
        player.nextShellAt = 0;
      }
    } else {
      // Magazine reload completes when timer finishes (with 120ms network jitter tolerance), consuming from reserveAmmo
      if (now >= player.reloadingUntil - 120) {
        player.reloadingUntil = 0;
        player.reloadWeapon = null;
        const curAmmo = player.ammoByWeapon?.[wId] ?? player.ammo ?? 0;
        const curRes = player.reserveAmmoByWeapon?.[wId] ?? (player.weapon === wId ? player.reserveAmmo : cfg.reserveAmmo) ?? 0;
        const needed = Math.max(0, cfg.magSize - curAmmo);
        const added = Math.min(needed, Math.max(0, curRes));
        const nextAmmo = curAmmo + added;
        const nextRes = Math.max(0, curRes - added);
        if (player.ammoByWeapon) {
          player.ammoByWeapon[wId] = nextAmmo;
        }
        if (player.reserveAmmoByWeapon) {
          player.reserveAmmoByWeapon[wId] = nextRes;
        }
        if (player.weapon === wId) {
          player.ammo = nextAmmo;
          player.reserveAmmo = nextRes;
        }
      }
    }

    const postAmmo = player.ammoByWeapon?.[wId] ?? player.ammo ?? 0;
    if (emitIfChanged && (postAmmo !== prevAmmo || player.reloadingUntil !== prevReloading)) {
      this.sendSelfState(player, now, true);
    }
  }

  /**
   * LEGACY (internal compatibility API, no longer wired to any socket event): the client-authoritative position path
   * of the old `playerMove` packet. Live movement now goes through input commands (`handleInputBatch` +
   * `processPlayerInputs`); this and `handlePlayerMove` are kept only because the unit tests drive them directly.
   *
   * Validates the position claimed by a move packet against per-player distance budgets that refill
   * with server time (horizontal MOVE_MAX_SPEED, upward MOVE_UP_SPEED, downward MOVE_DOWN_SPEED).
   * Accepted: position is applied (clamped to arena/map ceiling). Rejected: position is kept and the
   * client is told to snap back via `positionCorrection` (rate limited).
   * Returns true when the claimed position (if any) was accepted.
   */
  applyMovePosition(room, player, payload, mapCfg, now) {
    const hasX = typeof payload.x === 'number' && Number.isFinite(payload.x);
    const hasY = typeof payload.y === 'number' && Number.isFinite(payload.y);
    const hasZ = typeof payload.z === 'number' && Number.isFinite(payload.z);
    if (!hasX && !hasY && !hasZ) return true;

    const limit = (mapCfg.arenaHalfSize || MATCH_CONFIG.ARENA_HALF_SIZE) - 0.4;
    const ceiling = getMapCeilingY(mapCfg);
    const nx = hasX ? Math.max(-limit, Math.min(limit, payload.x)) : player.x;
    const ny = hasY ? Math.max(-2, Math.min(ceiling, payload.y)) : player.y;
    const nz = hasZ ? Math.max(-limit, Math.min(limit, payload.z)) : player.z;

    const elapsed = player.lastPosAt === undefined
      ? 0
      : Math.max(0, Math.min(1.5, (now - player.lastPosAt) / 1000));
    player.lastPosAt = now;
    player.moveBudgetXZ = Math.min(MOVE_BUDGET_CAP_XZ, (player.moveBudgetXZ ?? MOVE_BUDGET_CAP_XZ) + MOVE_MAX_SPEED * elapsed);
    player.moveBudgetUp = Math.min(MOVE_BUDGET_CAP_UP, (player.moveBudgetUp ?? MOVE_BUDGET_CAP_UP) + MOVE_UP_SPEED * elapsed);
    player.moveBudgetDown = Math.min(MOVE_BUDGET_CAP_DOWN, (player.moveBudgetDown ?? MOVE_BUDGET_CAP_DOWN) + MOVE_DOWN_SPEED * elapsed);

    const distXZ = Math.hypot(nx - player.x, nz - player.z);
    const dy = ny - player.y;
    const withinXZ = distXZ <= player.moveBudgetXZ;
    const withinY = dy >= 0 ? dy <= player.moveBudgetUp : -dy <= player.moveBudgetDown;

    if (withinXZ && withinY) {
      player.moveBudgetXZ -= distXZ;
      if (dy >= 0) player.moveBudgetUp -= dy;
      else player.moveBudgetDown += dy;
      player.x = nx;
      player.y = ny;
      player.z = nz;
      return true;
    }

    if (now - (player.lastCorrectionAt || 0) >= MOVE_CORRECTION_INTERVAL_MS) {
      player.lastCorrectionAt = now;
      this.io.to(room.code).emit('positionCorrection', {
        playerId: player.id,
        x: round2(player.x),
        y: round2(player.y),
        z: round2(player.z)
      });
    }
    return false;
  }

  /**
   * LEGACY (internal compatibility API): applies a client-claimed position packet. server/index.js no longer has a
   * `playerMove` socket handler, so nothing in production calls this; it only exists for the unit tests that exercise
   * the distance-budget validation directly. Real clients send `inputBatch` commands (see `handleInputBatch`).
   */
  handlePlayerMove(room, player, payload) {
    if (!room || !player || !player.alive || room.state !== 'PLAYING' || !payload) return;

    if (typeof payload.seq === 'number') {
      if (player.lastMoveSeq && payload.seq <= player.lastMoveSeq && (player.lastMoveSeq - payload.seq) < 1000) {
        return; // Drop out-of-order movement packet
      }
      player.lastMoveSeq = payload.seq;
    }

    const now = Date.now();
    player.lastMoveAt = now;
    this.syncPlayerReloadState(player, now);

    const mapCfg = getMapConfig(room.mapId);
    const positionAccepted = this.applyMovePosition(room, player, payload, mapCfg, now);
    const maxSpeed = (MATCH_CONFIG.SLIDE_INITIAL_SPEED || 11.2) * 1.35;
    if (positionAccepted && typeof payload.vx === 'number' && Number.isFinite(payload.vx)) {
      player.vx = Math.max(-maxSpeed, Math.min(maxSpeed, payload.vx));
    }
    if (positionAccepted && typeof payload.vy === 'number' && Number.isFinite(payload.vy)) {
      player.vy = Math.max(-30, Math.min(25, payload.vy));
    }
    if (positionAccepted && typeof payload.vz === 'number' && Number.isFinite(payload.vz)) {
      player.vz = Math.max(-maxSpeed, Math.min(maxSpeed, payload.vz));
    }
    if (typeof payload.yaw === 'number' && Number.isFinite(payload.yaw)) {
      player.yaw = payload.yaw;
    }
    if (typeof payload.pitch === 'number' && Number.isFinite(payload.pitch)) {
      player.pitch = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, payload.pitch));
    }
    if (typeof payload.crouching === 'boolean') {
      player.crouching = payload.crouching;
    }
    if (typeof payload.prone === 'boolean') {
      player.prone = payload.prone;
      if (player.prone) {
        player.crouching = false;
      }
    }
    if (typeof payload.isAiming === 'boolean') {
      player.isAiming = payload.isAiming;
    }
    if (typeof payload.lean === 'number' && Number.isFinite(payload.lean)) {
      player.lean = Math.max(-1, Math.min(1, payload.lean));
    }
    if (
      typeof payload.weapon === 'string' &&
      this.isWeaponAllowed(player, payload.weapon) &&
      payload.weapon !== player.weapon
    ) {
      this.switchPlayerWeapon(player, payload.weapon);
    }
    // Latency is measured by the server (see startLatencyProbe); client-reported pingMs is ignored.
    // History is stamped with the server clock: client clocks must never enter the lag-comp ring buffer.
    recordPlayerSnapshot(player, now);
    this.updateHealthPacks(room, now);
  }

  /** Equips an (already validated) weapon: cancels an incomplete reload without granting a free full magazine. */
  switchPlayerWeapon(player, weaponId) {
    player.weapon = weaponId;
    player.reloadingUntil = 0;
    player.reloadWeapon = null;
    player.nextShellAt = 0;
    player.ammo = player.ammoByWeapon?.[weaponId] ?? WEAPONS[weaponId].magSize;
    player.reserveAmmo = player.reserveAmmoByWeapon?.[weaponId] ?? (WEAPONS[weaponId].reserveAmmo ?? 0);
  }

  // ======================================================================================================
  // Input-command netcode: the server is authoritative for human movement. Clients send input commands (never
  // positions); the server simulates them with the shared movement module and acks the result to the owner.
  // ======================================================================================================

  /**
   * (Re)starts a human's movement timeline at their current `player.x/y/z` (spawn, respawn, map change, new match, or
   * any other server-side teleport): bumps `moveEpoch`, voids queued commands and rebuilds the authoritative
   * MovementState. The caller sends the resync ack (`sendMoveAck(player, true)`) when the owner's socket is ready.
   */
  resetPlayerMovement(player, now = Date.now()) {
    if (!player) return;
    player.moveEpoch = (player.moveEpoch || 0) + 1;
    player.lastProcessedSeq = player.lastProcessedSeq || 0;
    player.cmdQueue = [];
    player.cmdFresh = true; // first command of the new epoch defines the sequence start (the client skipped seqs)
    player.cmdGapSince = null;
    player.moveCredit = 0;
    player.lastCreditAt = now;
    // Round-trip through the ack encoding so the server and the client start from bit-identical states
    const raw = createMovementState({
      x: player.x, y: player.y, z: player.z, vx: 0, vy: 0, vz: 0, onGround: true
    });
    const ack = createMoveAck(raw, player.lastProcessedSeq, player.moveEpoch);
    player.moveState = movementStateFromAck(ack);
    player.x = ack.x;
    player.y = ack.y;
    player.z = ack.z;
    player.vx = 0;
    player.vy = 0;
    player.vz = 0;
    this._markMoveSynced(player);
  }

  _markMoveSynced(player) {
    player._mx = player.x;
    player._my = player.y;
    player._mz = player.z;
  }

  /** Sends the owner (and only the owner: every socket auto-joins a room named by its id) the authoritative state. */
  sendMoveAck(player, reliable = false) {
    if (!player || !player.moveState) return null;
    const ack = createMoveAck(player.moveState, player.lastProcessedSeq || 0, player.moveEpoch);
    const target = this.io.to(player.id);
    (reliable ? target : (target.volatile || target)).emit('moveAck', ack);
    return ack;
  }

  /** Emits an owner-only `shotRejected { ss, reason }` and records `player.lastShotReject`. */
  emitShotRejected(player, ss, reason) {
    if (!player) return null;
    const payload = { ss: Number.isSafeInteger(ss) ? ss : 0, reason };
    player.lastShotReject = payload;
    this.io.to(player.id).emit('shotRejected', payload);
    return payload;
  }

  /** Builds the owner-only `selfState` payload for a human player. */
  buildSelfState(player, now = Date.now()) {
    if (!player) return null;
    this.syncPlayerReloadState(player, now, false);
    const weapon = player.weapon;
    const wCfg = WEAPONS[weapon] || WEAPONS.rifle;
    const ammo = Number.isFinite(player.ammoByWeapon?.[weapon])
      ? player.ammoByWeapon[weapon]
      : (Number.isFinite(player.ammo) ? player.ammo : wCfg.magSize);
    const reserveAmmo = Number.isFinite(player.reserveAmmoByWeapon?.[weapon])
      ? player.reserveAmmoByWeapon[weapon]
      : (Number.isFinite(player.reserveAmmo) ? player.reserveAmmo : (wCfg.reserveAmmo ?? 0));
    const reloading = (player.alive && player.reloadingUntil && player.reloadingUntil > now)
      ? {
          weapon: player.reloadWeapon || weapon,
          remainingMs: Math.max(0, Math.round(player.reloadingUntil - now))
        }
      : null;
    return {
      seq: player.lastProcessedSeq || 0,
      lastShotSeq: player.lastShotSeq || 0,
      hp: Number.isFinite(player.hp) ? player.hp : 0,
      armor: Number.isFinite(player.armor) ? player.armor : 0,
      speedBoostMs: (player.alive && player.speedBoostUntil > now) ? Math.max(0, Math.round(player.speedBoostUntil - now)) : 0,
      damageBoostMs: (player.alive && player.damageBoostUntil > now) ? Math.max(0, Math.round(player.damageBoostUntil - now)) : 0,
      alive: Boolean(player.alive),
      weapon,
      ammo,
      reserveAmmo,
      ammoByWeapon: { ...(player.ammoByWeapon || {}) },
      reserveAmmoByWeapon: { ...(player.reserveAmmoByWeapon || {}) },
      reloading,
      grenades: Number.isFinite(player.grenades) ? player.grenades : 1
    };
  }

  _selfStateSignature(player) {
    if (!player) return '';
    const w = player.weapon;
    const ammo = player.ammoByWeapon?.[w] ?? player.ammo ?? 0;
    const res = player.reserveAmmoByWeapon?.[w] ?? player.reserveAmmo ?? 0;
    const rel = player.alive && player.reloadingUntil ? `${player.reloadWeapon || w}/${player.reloadingUntil | 0}` : '0';
    return `${player.hp}:${player.armor || 0}:${player.speedBoostUntil || 0}:${player.damageBoostUntil || 0}:${player.alive ? 1 : 0}:${w}:${ammo}:${res}:${rel}:${player.grenades ?? 1}`;
  }

  /** Sends the owner-only `selfState` snapshot to `player.id` (never broadcast to the room). */
  sendSelfState(player, now = Date.now(), reliable = false, precomputedSig = null) {
    if (!player) return null;
    if (this._deferSelfState) {
      player._selfStateDirty = true;
      if (reliable) player._selfStateReliable = true;
      return null;
    }
    const state = this.buildSelfState(player, now);
    if (!state) return null;
    player.lastSelfStateAt = now;
    player._selfStateSig = precomputedSig || this._selfStateSignature(player);
    player._selfStateDirty = false;
    player._selfStateReliable = false;
    const target = this.io.to(player.id);
    (reliable ? target : (target.volatile || target)).emit('selfState', state);
    return state;
  }

  sendSelfStateIfChanged(player, now = Date.now(), reliable = false) {
    if (!player) return null;
    this.syncPlayerReloadState(player, now, false);
    const sig = this._selfStateSignature(player);
    if (sig !== player._selfStateSig) {
      return this.sendSelfState(player, now, reliable, sig);
    }
    return null;
  }

  /**
   * Handles an `inputBatch` ({ e: epoch, cmds: [...] }). Commands are validated and queued; they are simulated by
   * `processPlayerInputs` on the next tick. Old / duplicate seqs, malformed numbers and absurd seq jumps are dropped, a
   * batch tagged with a stale epoch (teleport happened) is discarded and answered with a throttled resync ack.
   * Returns { accepted, stale }.
   */
  handleInputBatch(room, player, payload, now = Date.now()) {
    const result = { accepted: 0, stale: false };
    if (!room || !player || !player.moveState || !payload) return result;

    // Interpolation delay the client renders with (lag compensation); independent of the movement epoch
    if (payload.d !== undefined) this.noteInterpDelay(player, payload.d, now);

    if (payload.e !== player.moveEpoch) {
      result.stale = true;
      if (now - (player.lastStaleAckAt || 0) >= STALE_EPOCH_ACK_INTERVAL_MS) {
        player.lastStaleAckAt = now;
        this.sendMoveAck(player, true);
      }
      return result;
    }

    const cmds = payload.cmds;
    if (!Array.isArray(cmds)) return result;
    const queue = player.cmdQueue;
    const limit = Math.min(cmds.length, INPUT_BATCH_MAX_CMDS);
    for (let i = 0; i < limit; i++) {
      const cmd = sanitizeInputCommand(cmds[i]);
      if (!cmd) continue;
      // Server clock at arrival: a shot in this command is rewound relative to THIS moment, not to the (up to one tick later)
      // moment the tick processes it - otherwise every shot would be evaluated on average half a tick too late
      cmd.recvAt = now;
      if (cmd.seq <= player.lastProcessedSeq) continue; // already simulated (redundant resend)
      if (cmd.seq > player.lastProcessedSeq + INPUT_SEQ_AHEAD_MAX) continue;
      if (queue.length >= INPUT_QUEUE_MAX) break; // flood: surplus commands are dropped

      // Sorted insert (almost always an append); duplicates are ignored
      let at = queue.length;
      while (at > 0 && queue[at - 1].seq > cmd.seq) at--;
      if (at > 0 && queue[at - 1].seq === cmd.seq) continue;
      queue.splice(at, 0, cmd);
      result.accepted++;
    }
    return result;
  }

  /**
   * Simulates a human's queued commands in seq order. Every command costs exactly FIXED_DT of the player's time-credit
   * bucket, which refills with real elapsed seconds (capped at INPUT_CREDIT_CAP_S): a client cannot move faster than real
   * time however many commands it sends and whatever time it claims. Dead players only have their queue acknowledged.
   * Afterwards the owner gets a `moveAck`. Returns the number of commands simulated.
   */
  processPlayerInputs(room, player, now = Date.now()) {
    if (!room || !player || !player.moveState) return 0;

    // Anything other than this method moved the player (test setup, new server-side feature): that is a teleport
    if (player.x !== player._mx || player.y !== player._my || player.z !== player._mz) {
      this.resetPlayerMovement(player, now);
      this.sendMoveAck(player, true);
    }

    const credit = Math.max(0, Math.min(1, (now - player.lastCreditAt) / 1000));
    player.lastCreditAt = now;
    player.moveCredit = Math.min(INPUT_CREDIT_CAP_S, player.moveCredit + credit);

    const queue = player.cmdQueue;
    if (queue.length === 0) return 0;

    let simulated = 0;
    let drainedDead = false;
    let shotAccepted = false;
    const mapCfg = getMapConfig(room.mapId);
    this.syncPlayerReloadState(player, now);
    if (!player._selfStateSig) {
      player._selfStateSig = this._selfStateSignature(player);
    }

    while (queue.length > 0) {
      const cmd = queue[0];
      if (cmd.seq <= player.lastProcessedSeq) {
        queue.shift();
        continue;
      }
      if (!player.alive) {
        // Dead: ignore the input, reject any queued fire commands with DEAD, and ack so client pending buffer does not stall
        for (let i = 0; i < queue.length; i++) {
          const deadCmd = queue[i];
          if (deadCmd.seq > player.lastProcessedSeq && (deadCmd.btn & BTN.FIRE) !== 0) {
            if (
              Number.isSafeInteger(deadCmd.ss) &&
              deadCmd.ss > player.lastShotSeq &&
              deadCmd.ss - player.lastShotSeq <= MAX_SHOT_SEQ_GAP
            ) {
              player.lastShotSeq = deadCmd.ss;
            }
            this.emitShotRejected(player, deadCmd.ss, SHOT_REJECT.DEAD);
          }
        }
        player.lastProcessedSeq = queue[queue.length - 1].seq;
        queue.length = 0;
        drainedDead = true;
        break;
      }
      if (!player.cmdFresh && cmd.seq !== player.lastProcessedSeq + 1) {
        // Hole in the sequence: give a late / reordered command a moment to show up, then skip the hole
        if (player.cmdGapSince === null) player.cmdGapSince = now;
        if (now - player.cmdGapSince < INPUT_GAP_WAIT_MS) break;
      }
      if (player.moveCredit < FIXED_DT - 1e-9) break; // out of simulated time: the rest waits for more real time
      player.moveCredit -= FIXED_DT;
      queue.shift();
      this.applyInputCommand(player, cmd, mapCfg, now);
      player.lastProcessedSeq = cmd.seq;
      player.cmdFresh = false;
      player.cmdGapSince = null;
      simulated++;
      // A shot is part of the command: resolved right after the movement step, from the authoritative pose
      if ((cmd.btn & BTN.FIRE) !== 0) {
        const res = this.processFireCommand(room, player, cmd, now);
        if (res) shotAccepted = true;
      }
    }

    if (simulated > 0) {
      player.lastMoveAt = now;
      // History is stamped with the server clock: client clocks must never enter the lag-comp ring buffer.
      recordPlayerSnapshot(player, now);
    }
    if (simulated > 0 || drainedDead) {
      this.sendMoveAck(player);
    }
    if (shotAccepted) {
      this.sendSelfState(player, now, true);
    } else if (simulated > 0) {
      this.sendSelfStateIfChanged(player, now, true);
    }
    return simulated;
  }

  /** Simulates one validated command and mirrors the result into the fields the rest of the server reads. */
  applyInputCommand(player, cmd, mapCfg, nowWall = Date.now()) {
    const state = player.moveState;
    if (cmd.w && cmd.w !== player.weapon && this.isWeaponAllowed(player, cmd.w)) {
      this.switchPlayerWeapon(player, cmd.w);
    }
    // Movement speed follows the weapon the server knows about, and BTN.SPEED_BOOST is only allowed when speedBoostUntil is active
    const hasSpeedBuff = Boolean(player.speedBoostUntil && player.speedBoostUntil > nowWall - 250);
    const wantsBoostBtn = (cmd.btn & BTN.SPEED_BOOST) !== 0;
    const cleanBtn = (wantsBoostBtn && !hasSpeedBuff) ? (cmd.btn & ~BTN.SPEED_BOOST) : cmd.btn;
    const stepCmd = (cmd.w === player.weapon && cleanBtn === cmd.btn)
      ? cmd
      : { ...cmd, w: player.weapon, btn: cleanBtn };
    const result = stepCommand(state, stepCmd, mapCfg, this._cmdScratchInput || (this._cmdScratchInput = {}));

    player.x = state.x;
    player.y = state.y;
    player.z = state.z;
    player.vx = state.vx;
    player.vy = state.vy;
    player.vz = state.vz;
    player.crouching = state.crouching;
    player.prone = state.prone;
    player.sliding = Boolean(state.isSliding);
    player.isSliding = Boolean(state.isSliding);
    player.yaw = cmd.yaw;
    player.pitch = cmd.pitch;
    player.lean = cmd.lean;
    player.isAiming = (cmd.btn & BTN.AIM) !== 0 && !result.aimCancelled;
    this._markMoveSynced(player);
  }

  handleReload(room, player, weaponId, customNow = null, emitSelfState = true) {
    if (!room || !player || !player.alive || room.state !== 'PLAYING') return;
    const wId = this.isWeaponAllowed(player, weaponId) ? weaponId : player.weapon;
    const cfg = WEAPONS[wId];
    if (!cfg || cfg.isMelee || cfg.infiniteAmmo) return;
    const now = typeof customNow === 'number' && Number.isFinite(customNow) ? customNow : Date.now();

    this.syncPlayerReloadState(player, now, emitSelfState);
    if (player.reloadingUntil > now) return;

    const currentAmmo = player.ammoByWeapon?.[wId] ?? player.ammo ?? 0;
    const currentReserve = player.reserveAmmoByWeapon?.[wId] ?? (player.weapon === wId ? player.reserveAmmo : cfg.reserveAmmo) ?? 0;
    if (currentAmmo >= cfg.magSize || currentReserve <= 0) return;

    player.isAiming = false;
    player.reloadStartedAt = now;
    player.reloadWeapon = wId;

    if (cfg.shellByShell) {
      const missing = Math.max(1, Math.min(cfg.magSize - currentAmmo, currentReserve));
      const startDelay = cfg.shellReloadStartMs || 240;
      const shellMs = cfg.shellReloadMs || 390;
      player.nextShellAt = now + startDelay + shellMs;
      player.reloadingUntil = now + startDelay + missing * shellMs;
    } else {
      const reloadDuration = currentAmmo > 0 ? (cfg.tacticalReloadMs || cfg.reloadMs) : cfg.reloadMs;
      player.nextShellAt = 0;
      player.reloadingUntil = now + reloadDuration;
    }

    if (emitSelfState) {
      this.sendSelfState(player, now, true);
    }
  }
}
