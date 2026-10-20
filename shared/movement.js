// Deterministic, fixed-timestep player movement shared by the client (and usable by the server).
// Pure ES module: no DOM / Three.js / Node imports. All timers come from the `nowMs` argument, never from a clock.

import { MATCH_CONFIG } from './config.js';
import { collideCapsuleVsBoxes } from './physics.js';

/** Fixed simulation step in seconds (60 Hz). */
export const FIXED_DT = 1 / 60;

/** Maximum height (m) the feet may be below a box top for the box to be stepped onto. */
export const PLAYER_STEP_UP = 0.52;

/**
 * Creates a fresh movement state. `x/y/z` is the feet position, `vx/vy/vz` the velocity (m/s).
 * Timers (`slideUntil`, `slideCooldownUntil`, `jumpQueuedUntil`, `lastGroundedAt`) are in `nowMs` units.
 */
export function createMovementState(init = {}) {
  return {
    x: 0,
    y: 0,
    z: 0,
    vx: 0,
    vy: 0,
    vz: 0,
    onGround: false,
    wasOnGround: false,
    lastGroundedAt: -Infinity,
    jumpQueuedUntil: 0,
    isSliding: false,
    slideUntil: 0,
    slideCooldownUntil: 0,
    slideDirX: 0,
    slideDirZ: 0,
    crouching: false,
    prone: false,
    isSprinting: false,
    stepOffsetY: 0,
    ...init
  };
}

function tryTriggerSlide(s, nowMs, result) {
  if (!s.onGround || s.isSliding) return false;
  if (nowMs < s.slideCooldownUntil) return false;

  const horizSpeed = Math.hypot(s.vx, s.vz);
  const minSlideSpeed = MATCH_CONFIG.SLIDE_MIN_SPEED || MATCH_CONFIG.SPRINT_SPEED * 0.82;
  if (horizSpeed < minSlideSpeed) return false;

  s.isSliding = true;
  s.isSprinting = false;
  s.prone = false;
  s.slideUntil = nowMs + (MATCH_CONFIG.SLIDE_DURATION_MS || 620);
  s.slideCooldownUntil = nowMs + (MATCH_CONFIG.SLIDE_COOLDOWN_MS || 900);

  s.slideDirX = s.vx / horizSpeed;
  s.slideDirZ = s.vz / horizSpeed;
  const burstSpeed = MATCH_CONFIG.SLIDE_INITIAL_SPEED || 10.4;
  s.vx = s.slideDirX * burstSpeed;
  s.vz = s.slideDirZ * burstSpeed;

  result.slideStarted = true;
  return true;
}

/**
 * Advances the movement state by one step of `dt` seconds (call with FIXED_DT).
 *
 * input fields:
 *   moveForward, moveRight  -1..1 axes (already zeroed by the caller when input is disabled)
 *   yaw                     view yaw in radians
 *   wantsCrouch             crouch key held
 *   wantsSprint             sprint key held AND game rules allow it (not reloading / not just fired);
 *                           the step additionally requires forward movement, no crouch/slide/ADS
 *   wantsJump               jump key held
 *   inputEnabled            false while the pointer is unlocked (jumps are neither queued nor consumed)
 *   isAiming, isAdsHeld     ADS state; sprinting while ADS was toggled (not held) cancels ADS (see result)
 *   weaponMoveMult          weapon movement-speed multiplier (default 1)
 *
 * mapCfg: { obstacles, arenaHalfSize }
 * Returns { jumped, landed, impact, slideStarted, aimCancelled }.
 */
export function stepPlayerMovement(s, input, dt, mapCfg, nowMs) {
  const result = { jumped: false, landed: false, impact: 0, slideStarted: false, aimCancelled: false };

  const moveForward = input.moveForward || 0;
  const moveRight = input.moveRight || 0;
  const yaw = input.yaw || 0;
  const inputEnabled = input.inputEnabled !== false;
  let isAiming = Boolean(input.isAiming);

  if (s.isSliding && (nowMs >= s.slideUntil || !s.onGround)) {
    s.isSliding = false;
  }

  const wantsCrouch = Boolean(input.wantsCrouch);
  if (wantsCrouch && s.prone) {
    s.prone = false;
  }
  const wantsSprintInput = Boolean(input.wantsSprint) &&
    moveForward > 0 &&
    !wantsCrouch &&
    !s.isSliding;
  if (wantsSprintInput && isAiming && !input.isAdsHeld) {
    isAiming = false;
    result.aimCancelled = true;
  }
  const wantsSprint = wantsSprintInput && !isAiming;

  if (wantsSprint && s.prone) {
    s.prone = false;
  }

  if (wantsCrouch && !s.crouching && !s.isSliding && s.onGround) {
    tryTriggerSlide(s, nowMs, result);
  }
  const slideDur = MATCH_CONFIG.SLIDE_DURATION_MS || 620;
  if (!wantsCrouch && s.isSliding && nowMs - (s.slideUntil - slideDur) > 220) {
    s.isSliding = false;
  }

  s.crouching = (wantsCrouch || s.isSliding) && !s.prone;
  s.isSprinting = wantsSprint && !s.crouching && !s.prone;

  // Wish direction on the XZ plane
  const forwardX = -Math.sin(yaw);
  const forwardZ = -Math.cos(yaw);
  const rightX = Math.cos(yaw);
  const rightZ = -Math.sin(yaw);

  let wishDirX = forwardX * moveForward + rightX * moveRight;
  let wishDirZ = forwardZ * moveForward + rightZ * moveRight;
  const wishLen = Math.hypot(wishDirX, wishDirZ);
  if (wishLen > 0.001) {
    wishDirX /= wishLen;
    wishDirZ /= wishLen;
  }

  const weaponMoveMult = input.weaponMoveMult || 1.0;
  const baseTargetSpeed = s.isSliding
    ? MATCH_CONFIG.SLIDE_INITIAL_SPEED
    : s.prone
      ? (MATCH_CONFIG.PRONE_SPEED || 2.0)
      : s.crouching
        ? MATCH_CONFIG.CROUCH_SPEED
        : isAiming
          ? MATCH_CONFIG.ADS_SPEED
          : s.isSprinting
            ? MATCH_CONFIG.SPRINT_SPEED
            : MATCH_CONFIG.WALK_SPEED;
  const targetSpeed = baseTargetSpeed * (s.isSliding ? 1.0 : weaponMoveMult);

  if (s.isSliding) {
    const slideFriction = MATCH_CONFIG.SLIDE_FRICTION || 2.6;
    s.vx *= Math.max(0, 1 - slideFriction * dt);
    s.vz *= Math.max(0, 1 - slideFriction * dt);
    s.vx += wishDirX * 4.8 * dt;
    s.vz += wishDirZ * 4.8 * dt;
  } else if (s.onGround) {
    if (wishLen > 0.001) {
      const wishVx = wishDirX * targetSpeed;
      const wishVz = wishDirZ * targetSpeed;
      const dotVel = s.vx * wishDirX + s.vz * wishDirZ;
      const counterStrafeBoost = dotVel < -0.2 ? 2.35 : 1.0;
      const dvX = wishVx - s.vx;
      const dvZ = wishVz - s.vz;
      const dvLen = Math.hypot(dvX, dvZ);
      if (dvLen > 0.0001) {
        const maxStep = (MATCH_CONFIG.GROUND_ACCEL || 56.0) * counterStrafeBoost * dt;
        const scale = Math.min(1, maxStep / dvLen);
        s.vx += dvX * scale;
        s.vz += dvZ * scale;
      }
    } else {
      const friction = MATCH_CONFIG.GROUND_FRICTION || 13.5;
      const drop = Math.max(0, 1 - friction * dt);
      s.vx *= drop;
      s.vz *= drop;
      if (Math.hypot(s.vx, s.vz) < 0.08) {
        s.vx = 0;
        s.vz = 0;
      }
    }
  } else {
    const airDrag = Math.max(0, 1 - 0.35 * dt);
    s.vx *= airDrag;
    s.vz *= airDrag;

    if (wishLen > 0.001) {
      const currentProj = s.vx * wishDirX + s.vz * wishDirZ;
      const addSpeed = targetSpeed - currentProj;
      if (addSpeed > 0) {
        const accelStep = Math.min(addSpeed, (MATCH_CONFIG.AIR_ACCEL || 16.0) * dt);
        s.vx += wishDirX * accelStep;
        s.vz += wishDirZ * accelStep;
      }

      const maxAirSpeed = Math.max(MATCH_CONFIG.SLIDE_INITIAL_SPEED * 1.05, targetSpeed * 1.05);
      const curHoriz = Math.hypot(s.vx, s.vz);
      if (curHoriz > maxAirSpeed) {
        s.vx = (s.vx / curHoriz) * maxAirSpeed;
        s.vz = (s.vz / curHoriz) * maxAirSpeed;
      }
    }
  }

  // Jump with Coyote Time & Jump Buffering
  if (input.wantsJump && inputEnabled) {
    if (s.prone) {
      s.prone = false;
    } else {
      s.jumpQueuedUntil = nowMs + (MATCH_CONFIG.JUMP_BUFFER_MS || 120);
    }
  }

  const canCoyoteJump = s.onGround || (nowMs - s.lastGroundedAt <= (MATCH_CONFIG.COYOTE_TIME_MS || 120));
  if (nowMs <= s.jumpQueuedUntil && canCoyoteJump && s.vy <= 0.5 && inputEnabled) {
    s.vy = MATCH_CONFIG.JUMP_FORCE || 8.0;
    if (s.isSliding) {
      s.isSliding = false;
      s.vx *= 1.04;
      s.vz *= 1.04;
    }
    s.onGround = false;
    s.lastGroundedAt = -Infinity;
    s.jumpQueuedUntil = 0;
    result.jumped = true;
  }

  s.vy -= (MATCH_CONFIG.GRAVITY || 22.0) * dt;

  const preFallVy = s.vy;
  const prevFootY = s.y;
  s.wasOnGround = s.onGround;

  // Integrate horizontal & vertical, then resolve AABB collision against the map obstacles
  s.x += s.vx * dt;
  s.z += s.vz * dt;
  s.y += s.vy * dt;

  const playerHeight = s.prone
    ? (MATCH_CONFIG.PLAYER_PRONE_HEIGHT || 0.58)
    : s.isSliding
      ? (MATCH_CONFIG.PLAYER_SLIDE_HEIGHT || 0.9)
      : s.crouching
        ? MATCH_CONFIG.PLAYER_CROUCH_HEIGHT
        : MATCH_CONFIG.PLAYER_HEIGHT;
  const highestFloor = collideCapsuleVsBoxes(
    s,
    mapCfg.obstacles || [],
    MATCH_CONFIG.PLAYER_RADIUS,
    playerHeight,
    PLAYER_STEP_UP,
    dt
  );

  if (s.y <= highestFloor + 0.025 && s.vy <= 0) {
    if (s.wasOnGround && highestFloor > prevFootY + 0.03 && highestFloor - prevFootY <= 0.56) {
      s.stepOffsetY = Math.max(-0.48, (s.stepOffsetY || 0) + (prevFootY - highestFloor));
    }
    s.y = highestFloor;
    s.vy = 0;
    s.onGround = true;
    s.lastGroundedAt = nowMs;

    if (!s.wasOnGround && preFallVy < -3.2) {
      result.landed = true;
      result.impact = Math.min(1.5, Math.abs(preFallVy) / 10.5);
    }
  } else {
    s.onGround = false;
  }

  // Jump Pad launch pads (shared deterministic physics between client and server)
  const jumpPads = mapCfg && mapCfg.jumpPads;
  if (Array.isArray(jumpPads) && jumpPads.length > 0 && s.vy < (MATCH_CONFIG.JUMP_PAD_FORCE || 14.2) - 1.0) {
    const defRadius = MATCH_CONFIG.JUMP_PAD_RADIUS || 1.35;
    const defForce = MATCH_CONFIG.JUMP_PAD_FORCE || 14.2;
    for (let i = 0; i < jumpPads.length; i++) {
      const pad = jumpPads[i];
      const padY = pad.y || 0;
      if (Math.abs(s.y - padY) <= 0.45) {
        const dx = s.x - pad.x;
        const dz = s.z - pad.z;
        const r = pad.radius || defRadius;
        if (dx * dx + dz * dz <= r * r) {
          s.vy = pad.jumpForce || defForce;
          s.onGround = false;
          s.isSliding = false;
          s.lastGroundedAt = -Infinity;
          s.jumpQueuedUntil = 0;
          result.jumped = true;
          result.jumpPadTriggered = pad.id || true;
          break;
        }
      }
    }
  }

  s.stepOffsetY = (s.stepOffsetY || 0) * Math.exp(-18 * dt);
  if (Math.abs(s.stepOffsetY) < 0.002) s.stepOffsetY = 0;

  const limit = (mapCfg.arenaHalfSize || MATCH_CONFIG.ARENA_HALF_SIZE) - 0.6;
  s.x = Math.max(-limit, Math.min(limit, s.x));
  s.z = Math.max(-limit, Math.min(limit, s.z));

  return result;
}
