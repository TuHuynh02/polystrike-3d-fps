// Client-side prediction bookkeeping for the input-command netcode (no DOM / Three.js).
//
// The client simulates every fixed step locally (shared/netcode.js stepCommand), keeps the unacknowledged commands
// together with the state each one produced, and reconciles whenever the server's `moveAck` disagrees with what was
// predicted for that command: base state = server state, replay all still-unacked commands, adopt the result.

import {
  buildInputCommand,
  movementStateFromAck,
  overlayAckOnState,
  stepCommand
} from '../shared/netcode.js';

/** Unacked commands kept for replay (~3 s at 60 Hz). */
export const PREDICTION_HISTORY_MAX = 180;
/** Already-sent but still unacked commands repeated in every batch (packet-loss redundancy). */
export const INPUT_REDUNDANCY = 6;
/** Hard cap of commands in one batch. */
export const INPUT_BATCH_MAX_CMDS = 24;
/** Minimum interval between input batches (~30 Hz). */
export const INPUT_BATCH_INTERVAL_MS = 33;
/** Position error (m) below which a server ack is ignored. */
export const RECONCILE_EPSILON = 0.03;
/** Position error (m) above which the correction is not smoothed but applied instantly. */
export const RECONCILE_HARD_SNAP = 2.0;
/** Decay rate (1/s) of the visual correction offset: ~95% gone after 100 ms. */
export const CORRECTION_DECAY_RATE = 30;

export class ClientPrediction {
  constructor() {
    this.offset = { x: 0, y: 0, z: 0 };
    this.stats = { acks: 0, ignored: 0, replays: 0, hardSnaps: 0, epochSnaps: 0, lastError: 0 };
    this.reset(0);
  }

  /** Forgets all history (new room / new session). `epoch` is the server's current movement epoch if known. */
  reset(epoch = 0) {
    this.epoch = epoch;
    this.nextSeq = 0;
    this.lastAckedSeq = 0;
    this.pending = []; // [{ cmd, sent, post }]
    this.offset.x = this.offset.y = this.offset.z = 0;
  }

  /** Next command (seq allocated here) for the current fixed step. */
  buildCommand(fields) {
    this.nextSeq += 1;
    return buildInputCommand(this.nextSeq, fields);
  }

  /** Stores a simulated command with a copy of the state it produced. */
  record(cmd, stateAfter) {
    this.pending.push({ cmd, sent: false, post: { ...stateAfter } });
    if (this.pending.length > PREDICTION_HISTORY_MAX) {
      this.pending.splice(0, this.pending.length - PREDICTION_HISTORY_MAX);
    }
  }

  /**
   * Batch for `inputBatch`: every command not yet sent plus the last INPUT_REDUNDANCY sent-but-unacked ones.
   * Returns null when there is nothing new to say.
   */
  buildBatch() {
    const pending = this.pending;
    let firstUnsent = -1;
    for (let i = 0; i < pending.length; i++) {
      if (!pending[i].sent) {
        firstUnsent = i;
        break;
      }
    }
    if (firstUnsent < 0) return null;
    let start = Math.max(0, firstUnsent - INPUT_REDUNDANCY);
    if (pending.length - start > INPUT_BATCH_MAX_CMDS) start = pending.length - INPUT_BATCH_MAX_CMDS;
    const cmds = new Array(pending.length - start);
    for (let i = start; i < pending.length; i++) {
      cmds[i - start] = pending[i].cmd;
      pending[i].sent = true;
    }
    return { e: this.epoch, cmds };
  }

  /** Decays the visual correction offset by `dt` seconds. */
  decayOffset(dt) {
    const k = Math.exp(-CORRECTION_DECAY_RATE * Math.max(0, dt));
    this.offset.x *= k;
    this.offset.y *= k;
    this.offset.z *= k;
    if (Math.abs(this.offset.x) < 1e-4) this.offset.x = 0;
    if (Math.abs(this.offset.y) < 1e-4) this.offset.y = 0;
    if (Math.abs(this.offset.z) < 1e-4) this.offset.z = 0;
  }

  /**
   * Processes a `moveAck`. `headState` is the live (predicted) movement state, `mapCfg` the current obstacles.
   * Returns { kind, state?, delta? }:
   *   'ignored'  nothing to do (stale / duplicate ack, or error below RECONCILE_EPSILON)
   *   'epoch'    server teleported us (respawn, map change, ...): adopt `state`, history cleared
   *   'replay'   corrected: adopt `state` (head after replay); `delta` = new head - old head, the visual offset was
   *              updated so the camera does not jump
   *   'hardsnap' like 'replay' but the error was too large to smooth
   */
  onAck(ack, mapCfg, headState) {
    this.stats.acks += 1;

    if (ack.epoch < this.epoch) {
      this.stats.ignored += 1;
      return { kind: 'ignored' };
    }
    if (ack.epoch !== this.epoch) {
      this.epoch = ack.epoch;
      this.pending.length = 0;
      this.lastAckedSeq = ack.seq;
      this.offset.x = this.offset.y = this.offset.z = 0;
      this.stats.epochSnaps += 1;
      return { kind: 'epoch', state: movementStateFromAck(ack) };
    }

    if (ack.seq <= this.lastAckedSeq) {
      this.stats.ignored += 1;
      return { kind: 'ignored' };
    }
    this.lastAckedSeq = ack.seq;

    // Drop everything the server has processed, remembering the state we predicted for the acked command
    const pending = this.pending;
    let ackedIdx = -1;
    for (let i = 0; i < pending.length && pending[i].cmd.seq <= ack.seq; i++) {
      if (pending[i].cmd.seq === ack.seq) ackedIdx = i;
    }
    let dropCount = 0;
    while (dropCount < pending.length && pending[dropCount].cmd.seq <= ack.seq) dropCount++;
    const predicted = ackedIdx >= 0 ? pending[ackedIdx].post : null;
    pending.splice(0, dropCount);

    if (!predicted) {
      // The server skipped over the acked seq in a gap or we no longer hold its record: nothing to compare against
      this.stats.ignored += 1;
      return { kind: 'ignored' };
    }

    const err = Math.hypot(ack.x - predicted.x, ack.y - predicted.y, ack.z - predicted.z);
    this.stats.lastError = err;
    if (err < RECONCILE_EPSILON) {
      this.stats.ignored += 1;
      return { kind: 'ignored' };
    }

    // Misprediction: server state is the new base, replay the commands the server has not seen yet
    const base = overlayAckOnState({ ...predicted }, ack);
    for (let i = 0; i < pending.length; i++) {
      stepCommand(base, pending[i].cmd, mapCfg);
      pending[i].post = { ...base };
    }

    const delta = {
      x: base.x - headState.x,
      y: base.y - headState.y,
      z: base.z - headState.z
    };
    const hard = err > RECONCILE_HARD_SNAP;
    if (hard) {
      this.offset.x = this.offset.y = this.offset.z = 0;
      this.stats.hardSnaps += 1;
    } else {
      // Keep the camera where it was and let the offset bleed off
      this.offset.x -= delta.x;
      this.offset.y -= delta.y;
      this.offset.z -= delta.z;
    }
    this.stats.replays += 1;
    return { kind: hard ? 'hardsnap' : 'replay', state: base, delta };
  }
}
