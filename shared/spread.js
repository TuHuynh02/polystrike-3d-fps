// Deterministic weapon spread + bloom, shared by the client (local tracer / prediction) and the server (the ONLY place that
// decides where a bullet really goes). Pure ES module: no DOM / Three.js / Node imports, no Math.random(), no wall clock.
//
// A shot is described by the server-owned inputs {spreadSeed, shotSeq (`ss` of the command), pellet index, draw index}
// and by the authoritative state at the command (speed, ground contact, stance, ADS, bloom). Client and server evaluate the
// exact same functions on the same inputs, so they get bit-identical pellet directions (in the same JS engine; across
// engines Math.sin/cos may differ in the last ulp, which only matters for the cosmetic client tracer, never for damage).
//
// Bloom is a function of SHOT EVENTS and COMMAND SIM TIME (cmd.seq * FIXED_DT * 1000), never of frame rate:
//   bloom at a later time t   = max(0, bloom0 - bloomDecay * (t - t0) / 1000)
//   bloom right after a shot  = min(bloomMax * moveMult, bloomBefore + bloomPerShot * (ads ? 0.5 : 1) * moveMult)
// where moveMult = MOVE_BLOOM_MULT (1.85) while moving / airborne, else 1.

import { MATCH_CONFIG } from './config.js';

/** Eye height above the feet per stance (m). Identical to the client camera's target eye heights. */
export const EYE_HEIGHT = Object.freeze({ STAND: 1.62, CROUCH: 1.04, SLIDE: 0.78, PRONE: 0.52 });

/** horizSpeed below this (and grounded) counts as stationary: first-shot accuracy bonus. */
export const STATIONARY_SPEED = 1.15;
/** horizSpeed above this (or airborne) counts as "moving while shooting": radial spread pattern + bigger bloom. */
export const MOVING_SPEED = 0.95;
/** Bloom gain / cap multiplier while moving. */
export const MOVE_BLOOM_MULT = 1.85;
/** The first-shot bonus needs the bloom to be below this. */
export const FIRST_SHOT_BLOOM_LIMIT = 0.0028;
/** Spray index (shots in the current burst) that decays after `recoilRecoveryDelayMs` of silence. */
export const SHOT_INDEX_MAX = 30;
export const SHOT_INDEX_DECAY_PER_S = 32;
export const SHOT_INDEX_ZERO_BELOW = 0.2;

const TWO_PI = Math.PI * 2;
const finiteOr = (v, fallback = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);

// ---------------------------------------------------------------------------------------------------------------
// Pose helpers
// ---------------------------------------------------------------------------------------------------------------

/** Eye height for a pose { prone, isSliding|sliding, crouching|crouch }: prone > slide > crouch > stand. */
export function eyeHeightOf(pose) {
  if (pose.prone) return EYE_HEIGHT.PRONE;
  if (pose.isSliding || pose.sliding) return EYE_HEIGHT.SLIDE;
  if (pose.crouching ?? pose.crouch) return EYE_HEIGHT.CROUCH;
  return EYE_HEIGHT.STAND;
}

/**
 * Where the bullets start: feet position + stance eye height + lean peek along the view's right axis.
 * pose: { x, y, z, yaw, lean (-1..1), prone, isSliding, crouching }.
 */
export function computeShotOrigin(pose, out = { x: 0, y: 0, z: 0 }) {
  const yaw = finiteOr(pose.yaw);
  const lean = Math.max(-1, Math.min(1, finiteOr(pose.lean))) * (MATCH_CONFIG.LEAN_OFFSET || 0.42);
  out.x = finiteOr(pose.x) + Math.cos(yaw) * lean;
  out.y = finiteOr(pose.y) + eyeHeightOf(pose);
  out.z = finiteOr(pose.z) - Math.sin(yaw) * lean;
  return out;
}

/** View direction for yaw / pitch (rig convention: forward = -Z at yaw 0). The damage ray is exactly this plus spread. */
export function aimDirection(yaw, pitch, out = { x: 0, y: 0, z: 0 }) {
  const cp = Math.cos(pitch);
  out.x = -Math.sin(yaw) * cp;
  out.y = Math.sin(pitch);
  out.z = -Math.cos(yaw) * cp;
  return out;
}

/** True when the shooter counts as moving (radial spread pattern, 1.85x bloom). */
export function isMovingWhileShooting(horizSpeed, onGround) {
  return horizSpeed > MOVING_SPEED || !onGround;
}

// ---------------------------------------------------------------------------------------------------------------
// Seeded PRNG: a 32-bit hash of (spreadSeed, shotSeq, pellet, draw#) feeds one mulberry32 step. Stateless on purpose:
// any draw can be recomputed on its own, so client and server never have to agree on a draw ORDER.
// ---------------------------------------------------------------------------------------------------------------

/** Mixes the four integers into a well-distributed uint32. */
export function hashSpread(seed, shotSeq, pellet, draw) {
  let h = Math.imul((seed | 0) ^ 0x9e3779b9, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h ^ (shotSeq | 0), 0xc2b2ae35);
  h ^= h >>> 16;
  h = Math.imul(h ^ Math.imul((pellet | 0) + 1, 0x27d4eb2f), 0x165667b1);
  h ^= h >>> 15;
  h = Math.imul(h ^ Math.imul((draw | 0) + 1, 0x9e3779b1), 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

/** One mulberry32 step from a uint32 state -> float in [0, 1). */
export function mulberry32(state) {
  let t = (state + 0x6d2b79f5) | 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** The deterministic replacement of Math.random() for one spread draw. */
export function spreadRandom(seed, shotSeq, pellet, draw) {
  return mulberry32(hashSpread(seed, shotSeq, pellet, draw));
}

// ---------------------------------------------------------------------------------------------------------------
// Spread amount (reproduces Game3D.computeEffectiveSpread as a pure function)
// ---------------------------------------------------------------------------------------------------------------

/**
 * Cone size (tangent units) of a shot.
 * ctx: { horizSpeed (m/s), onGround, crouching, sliding, prone, aiming, bloom, shotIndex }
 *   shotIndex 0 = first shot of a burst (needs a stationary grounded shooter and bloom < FIRST_SHOT_BLOOM_LIMIT for the
 *   weapon's firstShotSpreadMult bonus). Melee weapons have no spread (0); every ranged weapon returns > 0.
 */
export function computeSpreadAmount(cfg, ctx) {
  if (!cfg || cfg.isMelee || cfg.infiniteAmmo) return 0;
  const horizSpeed = Math.max(0, finiteOr(ctx.horizSpeed));
  const onGround = Boolean(ctx.onGround);
  const aiming = Boolean(ctx.aiming);
  const bloom = Math.max(0, finiteOr(ctx.bloom));
  const isCrouchSteady = Boolean(ctx.crouching && !ctx.sliding && onGround);
  const isProneSteady = Boolean(ctx.prone && onGround);
  const isStationary = horizSpeed < STATIONARY_SPEED && onGround;

  // Laser-tight accuracy when stationary / crouched / prone on the first shot of a burst
  const firstShotMult = finiteOr(ctx.shotIndex) === 0 && bloom < FIRST_SHOT_BLOOM_LIMIT && isStationary
    ? (cfg.firstShotSpreadMult || 0.15)
    : 1.0;
  const base = (aiming ? (cfg.adsSpread ?? cfg.spread) : cfg.spread) * firstShotMult;
  const stanceMult = ctx.prone
    ? (cfg.proneSpreadMult || 0.35)
    : (ctx.crouching && !ctx.sliding)
      ? (cfg.crouchSpreadMult || 0.55)
      : ctx.sliding
        ? 0.72
        : 1.0;

  // Tactical FPS movement penalty:
  // - Prone crawl / Crouch-peek stay controlled and accurate
  // - CoD Tac-Stance / Valorant Neon slide keeps weapon braced for accurate corner slide-peeks
  // - ADS walking tightens spread by ~32% compared to hipfire
  // - Standing / Sprinting hipfire run-and-gun incurs a heavy spread penalty
  const speedRatio = Math.min(1.65, horizSpeed / MATCH_CONFIG.WALK_SPEED);
  const moveStanceMult = isProneSteady
    ? 0.22
    : isCrouchSteady
      ? 0.38
      : ctx.sliding
        ? (aiming ? 0.34 : 0.52)
        : (aiming ? 0.58 : 1.15);
  const movePenalty = speedRatio > 0.12
    ? Math.pow(speedRatio, 1.15) * (cfg.moveSpread || 0.095) * moveStanceMult
    : 0;
  const airPenalty = !onGround ? (cfg.airSpread || 0.135) : 0;

  return (base + bloom) * stanceMult + movePenalty + airPenalty;
}

// ---------------------------------------------------------------------------------------------------------------
// Bloom / spray state: advanced ONLY by fire commands, in command sim time
// ---------------------------------------------------------------------------------------------------------------

/** Per-player shot state { weapon, bloom, shotIndex, atMs, lastShotMs }. bloom is the value at `atMs`. */
export function createShotState() {
  return { weapon: '', bloom: 0, shotIndex: 0, atMs: 0, lastShotMs: -Infinity };
}

export function resetShotState(state) {
  state.weapon = '';
  state.bloom = 0;
  state.shotIndex = 0;
  state.atMs = 0;
  state.lastShotMs = -Infinity;
  return state;
}

/**
 * Bloom and spray index at sim time `timeMs` (pure; the state is not modified). Switching weapons starts from zero:
 * bloom caps and decay rates are per weapon.
 */
export function evaluateShotState(state, weaponId, cfg, timeMs, out = { bloom: 0, shotIndex: 0 }) {
  if (state.weapon !== weaponId) {
    out.bloom = 0;
    out.shotIndex = 0;
    return out;
  }
  const dtMs = Math.max(0, timeMs - state.atMs);
  out.bloom = Math.max(0, state.bloom - (cfg.bloomDecay || 0.14) * (dtMs / 1000));

  const recoveryDelayMs = cfg.recoilRecoveryDelayMs || ((cfg.fireRateMs || 100) + 35);
  const extraMs = Math.max(0, (timeMs - state.lastShotMs) - recoveryDelayMs);
  let idx = state.shotIndex - SHOT_INDEX_DECAY_PER_S * (extraMs / 1000);
  if (!(idx >= SHOT_INDEX_ZERO_BELOW)) idx = 0;
  out.shotIndex = idx;
  return out;
}

/**
 * Registers one shot at sim time `timeMs`: returns { spreadAmount, moving } computed from the state BEFORE the shot and then
 * advances the state (bloom += bloomPerShot..., spray index + 1). Melee shots do not touch the state.
 * pose: { horizSpeed, onGround, crouching, sliding, prone, aiming }
 */
export function consumeShot(state, weaponId, cfg, timeMs, pose, scratch = { bloom: 0, shotIndex: 0 }) {
  const horizSpeed = Math.max(0, finiteOr(pose.horizSpeed));
  const onGround = Boolean(pose.onGround);
  const aiming = Boolean(pose.aiming);
  const moving = isMovingWhileShooting(horizSpeed, onGround);

  if (!cfg || cfg.isMelee || cfg.infiniteAmmo) return { spreadAmount: 0, moving };

  const pre = evaluateShotState(state, weaponId, cfg, timeMs, scratch);
  const spreadAmount = computeSpreadAmount(cfg, {
    horizSpeed,
    onGround,
    crouching: pose.crouching,
    sliding: pose.sliding,
    prone: pose.prone,
    aiming,
    bloom: pre.bloom,
    shotIndex: pre.shotIndex
  });

  const isLowPosture = Boolean(onGround && (pose.prone || pose.crouching || pose.sliding));
  const moveBloomMult = moving ? (pose.sliding ? 1.12 : isLowPosture ? 1.15 : MOVE_BLOOM_MULT) : 1.0;
  const stanceBloomMult = pose.prone ? 0.55 : pose.sliding ? 0.68 : pose.crouching ? 0.75 : 1.0;
  state.weapon = weaponId;
  state.bloom = Math.min(
    (cfg.bloomMax || 0.018) * moveBloomMult,
    pre.bloom + (cfg.bloomPerShot || 0.002) * (aiming ? 0.5 : 1.0) * stanceBloomMult * moveBloomMult
  );
  state.shotIndex = Math.min(SHOT_INDEX_MAX, pre.shotIndex + 1);
  state.atMs = timeMs;
  state.lastShotMs = timeMs;
  return { spreadAmount, moving };
}

// ---------------------------------------------------------------------------------------------------------------
// Pellet directions
// ---------------------------------------------------------------------------------------------------------------

/**
 * Direction of ONE pellet: `baseDir` (the exact view direction of the command) plus a seeded offset in the view's local
 * right / up basis, renormalised. Same distribution families as before, with PRNG draws instead of Math.random():
 *  - single ray, stationary: uniform square jitter, +-0.55 * spread on both axes
 *  - single ray, moving / airborne: radial, angle uniform, radius = spread * 0.45 * U (centre-inclusive)
 *  - shotgun centre pellet (pellet 0): uniform +-0.11 * spread on both axes
 *  - other shotgun pellets: ring, angle = pellet / pellets * 2PI +- 0.175 rad, radius = spread * (0.35 + 0.55 U)
 * Geometry change vs the old client code: offsets are applied along the camera-local right/up axes (the old code added them
 * to raw world x/y/z, which tilted the pattern with the view direction) and the along-the-ray (z) jitter is dropped
 * (it only changes the vector's length, i.e. nothing after normalisation).
 */
export function spreadDirection(baseDir, cfg, spreadAmount, seed, shotSeq, pellet, moving, out = { x: 0, y: 0, z: 0 }) {
  const len = Math.hypot(baseDir.x, baseDir.y, baseDir.z) || 1;
  const fx = baseDir.x / len;
  const fy = baseDir.y / len;
  const fz = baseDir.z / len;

  if (!(spreadAmount > 0) || !cfg || cfg.isMelee) {
    out.x = fx;
    out.y = fy;
    out.z = fz;
    return out;
  }

  // right = normalize(forward x worldUp), up = right x forward
  const hLen = Math.hypot(fx, fz);
  const rx = hLen > 1e-6 ? -fz / hLen : 1;
  const rz = hLen > 1e-6 ? fx / hLen : 0;
  const ux = -rz * fy; // right x forward with right.y = 0
  const uy = rz * fx - rx * fz;
  const uz = rx * fy;

  const rnd = (draw) => spreadRandom(seed, shotSeq, pellet, draw);
  let dr;
  let du;
  if ((cfg.pellets || 1) > 1) {
    if (pellet === 0) {
      dr = (rnd(0) - 0.5) * spreadAmount * 0.22;
      du = (rnd(1) - 0.5) * spreadAmount * 0.22;
    } else {
      const angle = (pellet / cfg.pellets) * TWO_PI + (rnd(0) - 0.5) * 0.35;
      const radius = spreadAmount * (0.35 + rnd(1) * 0.55);
      dr = Math.cos(angle) * radius;
      du = Math.sin(angle) * radius;
    }
  } else if (moving) {
    const angle = rnd(0) * TWO_PI;
    const radius = spreadAmount * (rnd(1) * 0.45);
    dr = Math.cos(angle) * radius;
    du = Math.sin(angle) * radius;
  } else {
    dr = (rnd(0) - 0.5) * spreadAmount * 1.1;
    du = (rnd(1) - 0.5) * spreadAmount * 1.1;
  }

  const x = fx + rx * dr + ux * du;
  const y = fy + uy * du;
  const z = fz + rz * dr + uz * du;
  const n = Math.hypot(x, y, z) || 1;
  out.x = x / n;
  out.y = y / n;
  out.z = z / n;
  return out;
}

/** All pellet directions of a shot (melee / single-ray weapons: one entry). */
export function computeShotDirections(cfg, yaw, pitch, spreadAmount, moving, seed, shotSeq) {
  const base = aimDirection(yaw, pitch);
  const count = Math.max(1, Math.floor(cfg?.pellets || 1));
  const dirs = new Array(count);
  for (let p = 0; p < count; p++) {
    dirs[p] = spreadDirection(base, cfg, spreadAmount, seed, shotSeq, p, moving);
  }
  return dirs;
}

/**
 * The whole deterministic shot in one call - the SAME function runs on the server (authoritative) and on the client
 * (prediction): advances `state`, returns { origin, dirs, spreadAmount, moving }.
 * pose: { x, y, z (feet), vx, vz, onGround, crouching, isSliding, prone, lean, aiming }
 */
export function planShot(state, weaponId, cfg, cmdTimeMs, pose, yaw, pitch, seed, shotSeq) {
  const horizSpeed = Math.hypot(finiteOr(pose.vx), finiteOr(pose.vz));
  const { spreadAmount, moving } = consumeShot(state, weaponId, cfg, cmdTimeMs, {
    horizSpeed,
    onGround: pose.onGround,
    crouching: pose.crouching,
    sliding: pose.isSliding,
    prone: pose.prone,
    aiming: pose.aiming
  });
  const origin = computeShotOrigin({
    x: pose.x,
    y: pose.y,
    z: pose.z,
    yaw,
    lean: pose.lean,
    prone: pose.prone,
    isSliding: pose.isSliding,
    crouching: pose.crouching
  });
  return { origin, dirs: computeShotDirections(cfg, yaw, pitch, spreadAmount, moving, seed, shotSeq), spreadAmount, moving };
}
