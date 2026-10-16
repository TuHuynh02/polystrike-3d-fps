// Input-command netcode primitives shared by the client (prediction / reconciliation) and the server (authoritative
// simulation). Pure ES module: no DOM / Three.js / Node imports and no wall-clock reads.
//
// Model: every fixed physics step (FIXED_DT) the client produces ONE input command with a strictly increasing `seq`.
// The simulation clock of a command is derived from its seq alone (`commandTimeMs`), so the client, the server and a
// client-side replay all feed identical `nowMs` values to stepPlayerMovement and therefore compute identical results.
// A command carries input only (never a position): the server integrates it, the owner gets a `moveAck` back.

import { WEAPONS } from './weapons.js';
import { FIXED_DT, createMovementState, stepPlayerMovement } from './movement.js';

/** Simulated time one command represents (ms). */
export const COMMAND_STEP_MS = FIXED_DT * 1000;

/** Simulation clock (ms) of the command with this seq. Shared by client, server and replay. */
export function commandTimeMs(seq) {
  return seq * COMMAND_STEP_MS;
}

/** Bit layout of `cmd.btn`. */
export const BTN = Object.freeze({
  CROUCH: 1,
  PRONE: 2, // prone *intent*: the client's current prone state; the movement module may still clear it (crouch / sprint / jump)
  SPRINT: 4,
  JUMP: 8,
  AIM: 16,
  ADS_HELD: 32,
  FIRE: 64 // the weapon fires on this step; the command then carries the shot sequence `ss`
});
export const BTN_MASK = 127;

// ---- Shots inside the command stream (server-resolved, see shared/spread.js + RoomManager.processFireCommand) ----
/** A shot is accepted when the SIM time since the previous accepted shot is at least this fraction of the fire interval. */
export const FIRE_RATE_TOLERANCE = 0.9;
/** Largest jump of `ss` between two fire commands (lost fire commands leave holes; a larger hole cannot be grinded for a lucky spread). */
export const MAX_SHOT_SEQ_GAP = 8;
/** Largest accepted `ss` (keeps the 32-bit spread hash well defined). */
export const MAX_SHOT_SEQ = 0x7fffffff;

/**
 * Fire-rate rule in command SIM time (never wall time: a catch-up burst of buffered commands is spaced by their seq).
 * Used verbatim by the client (to decide on which step a pending shot may go out) and by the server (to validate it).
 */
export function isFireIntervalOk(cmdTimeMs, lastFireCmdTimeMs, fireRateMs) {
  return cmdTimeMs - lastFireCmdTimeMs >= fireRateMs * FIRE_RATE_TOLERANCE - 1e-6;
}

/** Bit layout of `ack.f`. */
export const ACK_FLAG = Object.freeze({
  ON_GROUND: 1,
  SLIDING: 2,
  CROUCHING: 4,
  PRONE: 8
});

/** Largest |yaw| (rad) accepted from a client; far more than any legitimate accumulated turning. */
export const MAX_ABS_YAW = 1e5;
/** Largest |pitch| (rad) on the wire: just below PI/2 so the 1e-3 quantisation can never exceed it. */
export const MAX_PITCH = 1.57;

function q3(v) {
  return Math.round(v * 1000) / 1000 + 0; // "+ 0" turns -0 into 0 so JSON round-trips are bit-identical
}

function q2(v) {
  return Math.round(v * 100) / 100 + 0;
}

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

/**
 * Builds the wire command for one fixed step (client side). Everything is quantised here, and the SAME object is used
 * for the local prediction step, so the client simulates exactly the values the server will receive.
 *
 * Wire format: { seq, mf, mr, yaw, pitch, lean, btn, w }  (+ `ss` only on a firing command)
 *   mf/mr  move forward / right axis, -1..1 (0.01 steps)
 *   yaw/pitch  radians, 1e-3 steps
 *   lean   -1..1 (0.01 steps)
 *   btn    BTN bit mask (crouch, prone-intent, sprint, jump, aim, ads-held, FIRE)
 *   w      weapon id
 *   ss     shot sequence (positive integer, strictly increasing per player); present iff btn has BTN.FIRE.
 *          A firing command is the WHOLE shot: aim = (yaw, pitch) of the command, everything else is computed by the server.
 */
export function buildInputCommand(seq, f) {
  let btn = 0;
  if (f.wantsCrouch) btn |= BTN.CROUCH;
  if (f.wantsProne) btn |= BTN.PRONE;
  if (f.wantsSprint) btn |= BTN.SPRINT;
  if (f.wantsJump) btn |= BTN.JUMP;
  if (f.isAiming) btn |= BTN.AIM;
  if (f.isAdsHeld) btn |= BTN.ADS_HELD;
  const fire = Boolean(f.fire) && Number.isSafeInteger(f.shotSeq) && f.shotSeq > 0 && f.shotSeq <= MAX_SHOT_SEQ;
  if (fire) btn |= BTN.FIRE;
  const cmd = {
    seq,
    mf: q2(clamp(Number(f.moveForward) || 0, -1, 1)),
    mr: q2(clamp(Number(f.moveRight) || 0, -1, 1)),
    yaw: q3(clamp(Number(f.yaw) || 0, -MAX_ABS_YAW, MAX_ABS_YAW)),
    pitch: q3(clamp(Number(f.pitch) || 0, -MAX_PITCH, MAX_PITCH)),
    lean: q2(clamp(Number(f.lean) || 0, -1, 1)),
    btn,
    w: typeof f.weapon === 'string' ? f.weapon : ''
  };
  if (fire) cmd.ss = f.shotSeq;
  return cmd;
}

/**
 * Server-side validation of one untrusted wire command. Returns a fresh canonical command or null when it must be
 * rejected (non-object, non-integer / non-positive seq, non-finite numbers). Values are clamped, unknown fields
 * (e.g. a smuggled `x/y/z`) are dropped by construction.
 */
export function sanitizeInputCommand(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const { seq, mf, mr, yaw, pitch, lean, btn, w, ss } = raw;
  if (!Number.isSafeInteger(seq) || seq <= 0) return null;
  if (!Number.isFinite(mf) || !Number.isFinite(mr) || !Number.isFinite(yaw) ||
      !Number.isFinite(pitch) || !Number.isFinite(lean)) return null;
  if (!Number.isInteger(btn)) return null;
  const cmd = {
    seq,
    mf: q2(clamp(mf, -1, 1)),
    mr: q2(clamp(mr, -1, 1)),
    yaw: q3(clamp(yaw, -MAX_ABS_YAW, MAX_ABS_YAW)),
    pitch: q3(clamp(pitch, -MAX_PITCH, MAX_PITCH)),
    lean: q2(clamp(lean, -1, 1)),
    btn: btn & BTN_MASK,
    w: typeof w === 'string' && w.length <= 24 ? w : ''
  };
  if ((cmd.btn & BTN.FIRE) !== 0) {
    if (Number.isSafeInteger(ss) && ss > 0 && ss <= MAX_SHOT_SEQ) {
      cmd.ss = ss;
    } else {
      cmd.btn &= ~BTN.FIRE; // a FIRE bit without a valid shot sequence is just movement input
    }
  }
  return cmd;
}

/** Decodes a command into the input object of stepPlayerMovement (reuses `out` when given). */
export function commandToMovementInput(cmd, out = {}) {
  const btn = cmd.btn | 0;
  out.moveForward = cmd.mf;
  out.moveRight = cmd.mr;
  out.yaw = cmd.yaw;
  out.wantsCrouch = (btn & BTN.CROUCH) !== 0;
  out.wantsSprint = (btn & BTN.SPRINT) !== 0;
  out.wantsJump = (btn & BTN.JUMP) !== 0;
  out.inputEnabled = true; // commands are only produced while the client accepts input (jump is gated by the client)
  out.isAiming = (btn & BTN.AIM) !== 0;
  out.isAdsHeld = (btn & BTN.ADS_HELD) !== 0;
  out.weaponMoveMult = WEAPONS[cmd.w]?.moveSpeedMult || 1;
  return out;
}

/**
 * Applies the prone intent of a command to the movement state before the step. Going prone needs ground contact (the
 * client's Z key has the same rule); leaving prone is always allowed. Crouch / sprint / jump cancel prone inside
 * stepPlayerMovement itself.
 */
export function applyStanceIntent(state, wantsProne) {
  if (wantsProne) {
    if (!state.prone && state.onGround) {
      state.prone = true;
      state.crouching = false;
      state.isSliding = false;
      state.isSprinting = false;
    }
  } else if (state.prone) {
    state.prone = false;
  }
}

/** One fixed step for one command. THE single code path used by the live client step, replay and the server. */
export function stepCommand(state, cmd, mapCfg, scratchInput) {
  applyStanceIntent(state, (cmd.btn & BTN.PRONE) !== 0);
  const input = commandToMovementInput(cmd, scratchInput || {});
  return stepPlayerMovement(state, input, FIXED_DT, mapCfg, commandTimeMs(cmd.seq));
}

function packFlags(state) {
  return (state.onGround ? ACK_FLAG.ON_GROUND : 0) |
    (state.isSliding ? ACK_FLAG.SLIDING : 0) |
    (state.crouching ? ACK_FLAG.CROUCHING : 0) |
    (state.prone ? ACK_FLAG.PRONE : 0);
}

/**
 * Wire ack sent to the owning client only:
 *   { seq, epoch, x, y, z, vx, vy, vz, f }   (f = ACK_FLAG bit mask; numbers rounded to 1e-3)
 */
export function createMoveAck(state, seq, epoch) {
  return {
    seq,
    epoch,
    x: q3(state.x),
    y: q3(state.y),
    z: q3(state.z),
    vx: q3(state.vx),
    vy: q3(state.vy),
    vz: q3(state.vz),
    f: packFlags(state)
  };
}

/**
 * Fresh movement state for a (re)synchronisation point described by an ack: used by the client after an epoch change and
 * by the server when it teleports a player, so both start from bit-identical states (timers are relative to `ack.seq`).
 */
export function movementStateFromAck(ack) {
  const onGround = (ack.f & ACK_FLAG.ON_GROUND) !== 0;
  return createMovementState({
    x: ack.x,
    y: ack.y,
    z: ack.z,
    vx: ack.vx,
    vy: ack.vy,
    vz: ack.vz,
    onGround,
    wasOnGround: onGround,
    lastGroundedAt: onGround ? commandTimeMs(ack.seq) : -Infinity,
    isSliding: (ack.f & ACK_FLAG.SLIDING) !== 0,
    crouching: (ack.f & ACK_FLAG.CROUCHING) !== 0,
    prone: (ack.f & ACK_FLAG.PRONE) !== 0
  });
}

/** Overwrites the server-authoritative part of a (locally recorded) state with an ack; timers stay local. */
export function overlayAckOnState(state, ack) {
  state.x = ack.x;
  state.y = ack.y;
  state.z = ack.z;
  state.vx = ack.vx;
  state.vy = ack.vy;
  state.vz = ack.vz;
  state.onGround = (ack.f & ACK_FLAG.ON_GROUND) !== 0;
  state.isSliding = (ack.f & ACK_FLAG.SLIDING) !== 0;
  state.crouching = (ack.f & ACK_FLAG.CROUCHING) !== 0;
  state.prone = (ack.f & ACK_FLAG.PRONE) !== 0;
  return state;
}

/** Structural validation of an ack received from the network (client side). */
export function isValidMoveAck(ack) {
  return Boolean(ack) && typeof ack === 'object' &&
    Number.isFinite(ack.seq) && Number.isFinite(ack.epoch) &&
    Number.isFinite(ack.x) && Number.isFinite(ack.y) && Number.isFinite(ack.z) &&
    Number.isFinite(ack.vx) && Number.isFinite(ack.vy) && Number.isFinite(ack.vz) &&
    Number.isInteger(ack.f);
}
