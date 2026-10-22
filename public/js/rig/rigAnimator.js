import { poseOperatorForWeapon } from './operatorMeshBuilder.js';

export function animateHumanoidRig(rp, dt, now, isMoving, moveSpeed = 0) {
  if (!rp || !rp.pelvisGroup) return;

  if (rp.currentWeapon && rp._posedWeapon !== rp.currentWeapon) {
    poseOperatorForWeapon(rp, rp.currentWeapon);
  }

  // 1. Smoothly blend standing <-> tactical crouch <-> slide <-> prone & Q/E lean posture
  const targetProne = rp.prone ? 1.0 : 0.0;
  rp.proneBlend = (rp.proneBlend || 0) + (targetProne - (rp.proneBlend || 0)) * Math.min(1, dt * 11);
  const pb = rp.proneBlend;

  const targetSlide = rp.sliding && !rp.prone ? 1.0 : 0.0;
  rp.slideBlend = (rp.slideBlend || 0) + (targetSlide - (rp.slideBlend || 0)) * Math.min(1, dt * 18);
  const sb = rp.slideBlend;

  const targetCrouch = (rp.crouching || rp.sliding) && !rp.prone ? 1.0 : 0.0;
  rp.crouchBlend = (rp.crouchBlend || 0) + (targetCrouch - (rp.crouchBlend || 0)) * Math.min(1, dt * 12);
  const cb = rp.crouchBlend;

  const targetLean = rp.lean || 0;
  rp.leanBlend = (rp.leanBlend || 0) + (targetLean - (rp.leanBlend || 0)) * Math.min(1, dt * 14);
  const lb = rp.leanBlend;

  // 2. Advance gait cycle & subtle idle breathing (suppressed during tactical slide or deterministic rest-pose tests with now === 0)
  const breath = now ? Math.sin(now * 0.0028 + (rp.id?.length || 0)) * 0.015 : 0;
  const activeSlide = (isMoving || Boolean(now)) ? sb : 0;
  const gaitScale = 1 - activeSlide;
  if (isMoving && activeSlide < 0.5) {
    const rate = moveSpeed > 0.16 ? 13.5 : 10.8;
    rp.walkPhase += dt * rate;
  }

  const strideAmp = isMoving ? (pb > 0.4 ? 0.18 : cb > 0.4 ? 0.42 : 0.62) * gaitScale : 0;
  const strideSin = Math.sin(rp.walkPhase);
  const strideBob = isMoving ? Math.abs(Math.sin(rp.walkPhase)) * 0.032 * (1 - cb * 0.4 - pb * 0.75) * gaitScale : 0;

  // 3. Pelvis & Hip Socket vertical height (keeps pelvisGroup at server hitbox parity while pelvisVisualGroup renders slide hip cant)
  const hipY = 0.80 - cb * 0.25 - pb * 0.56 + strideBob;
  const pelvisYaw = isMoving ? -strideSin * 0.06 * gaitScale : 0;
  if (rp.pelvisGroup) {
    rp.pelvisGroup.position.y = hipY;
    rp.pelvisGroup.rotation.y = pelvisYaw;
  }
  if (rp.pelvisVisualGroup) {
    rp.pelvisVisualGroup.position.x = lb * 0.06 - activeSlide * 0.035;
    rp.pelvisVisualGroup.position.y = -activeSlide * 0.06;
    rp.pelvisVisualGroup.rotation.y = -activeSlide * 0.24;
    rp.pelvisVisualGroup.rotation.z = -lb * 0.24 + activeSlide * 0.18;
  }
  const hipCos = Math.cos(pelvisYaw);
  const hipSin = Math.sin(pelvisYaw);
  rp.leftLeg.position.set(-0.145 * hipCos, hipY, 0.145 * hipSin);
  rp.rightLeg.position.set(0.145 * hipCos, hipY, -0.145 * hipSin);
  rp.leftLeg.rotation.y = 0;
  rp.rightLeg.rotation.y = 0;
  rp.leftLeg.rotation.z = -activeSlide * 0.16;
  rp.rightLeg.rotation.z = activeSlide * 0.08;

  // 4. Articulated Hip Swing + Real Knee Joint Flexion (+rotation.x = forward/upward thigh swing; -rotation.x on knee = backward shin bend)
  const crouchHipFlex = cb * 0.56 - pb * 1.15;
  const crouchKneeFlex = cb * 0.96 + pb * 0.18;

  if (isMoving && activeSlide < 0.25) {
    const gaitBlend = Math.min(1, dt * 18);
    const leftHipSwing = strideSin * strideAmp;
    const rightHipSwing = -strideSin * strideAmp;
    const targetMoveLeftHip = leftHipSwing + crouchHipFlex + activeSlide * 0.38;
    const targetMoveRightHip = rightHipSwing + crouchHipFlex - activeSlide * 0.16;
    rp.leftLeg.rotation.x += (targetMoveLeftHip - rp.leftLeg.rotation.x) * gaitBlend;
    rp.rightLeg.rotation.x += (targetMoveRightHip - rp.rightLeg.rotation.x) * gaitBlend;

    if (rp.leftKneePivot && rp.rightKneePivot) {
      const leftKneeSwing = Math.max(0.06, Math.sin(rp.walkPhase - 0.65) * 0.72) * gaitScale;
      const rightKneeSwing = Math.max(0.06, Math.sin(rp.walkPhase + Math.PI - 0.65) * 0.72) * gaitScale;
      const targetMoveLeftKnee = -(leftKneeSwing * (1 - cb * 0.35 - pb * 0.65) + crouchKneeFlex - activeSlide * 0.62);
      const targetMoveRightKnee = -(rightKneeSwing * (1 - cb * 0.35 - pb * 0.65) + crouchKneeFlex + activeSlide * 0.32);
      rp.leftKneePivot.rotation.x += (targetMoveLeftKnee - rp.leftKneePivot.rotation.x) * gaitBlend;
      rp.rightKneePivot.rotation.x += (targetMoveRightKnee - rp.rightKneePivot.rotation.x) * gaitBlend;
    }
  } else {
    const legBlend = Math.min(1, dt * (activeSlide > 0.1 ? 16 : 10));
    const targetLeftHip = crouchHipFlex + 0.04 + activeSlide * 0.38;
    const targetRightHip = crouchHipFlex - 0.05 - activeSlide * 0.16;
    rp.leftLeg.rotation.x += (targetLeftHip - rp.leftLeg.rotation.x) * legBlend;
    rp.rightLeg.rotation.x += (targetRightHip - rp.rightLeg.rotation.x) * legBlend;
    if (rp.leftKneePivot && rp.rightKneePivot) {
      const targetLeftKnee = -(crouchKneeFlex + 0.08 - activeSlide * 0.62);
      const targetRightKnee = -(crouchKneeFlex + 0.06 + activeSlide * 0.32);
      rp.leftKneePivot.rotation.x += (targetLeftKnee - rp.leftKneePivot.rotation.x) * legBlend;
      rp.rightKneePivot.rotation.x += (targetRightKnee - rp.rightKneePivot.rotation.x) * legBlend;
    }
  }

  // 5. Upper Body, Head, Lean Roll & Dual-Arm Aiming Articulation (matches RIG.LEAN_SHIFT = 0.30, RIG.LEAN_ROLL = 0.38)
  const aimPitch = rp.targetPitch || 0;
  if (rp.upperBodyGroup) {
    const targetTorsoPitch = -cb * 0.18 - pb * 1.05 + aimPitch * 0.25 + breath * 0.5;
    rp.upperBodyGroup.rotation.x += (targetTorsoPitch - rp.upperBodyGroup.rotation.x) * 0.25;
    const targetTorsoTwist = isMoving ? strideSin * 0.09 * gaitScale : (now ? Math.sin(now * 0.0014) * 0.03 * gaitScale : 0);
    rp.upperBodyGroup.rotation.y += (targetTorsoTwist - rp.upperBodyGroup.rotation.y) * 0.22;
    rp.upperBodyGroup.rotation.z = -lb * 0.38;
    rp.upperBodyGroup.position.x = lb * 0.30;
  }
  if (rp.torsoVisualGroup) {
    // Counter-bridge the lower waist toward pelvisVisualGroup while applying CoD/Neon low slide torso lean & twist visually
    rp.torsoVisualGroup.position.x = -lb * 0.13;
    rp.torsoVisualGroup.position.y = Math.abs(lb) * 0.015 - activeSlide * 0.04;
    rp.torsoVisualGroup.rotation.x = activeSlide * 0.22;
    rp.torsoVisualGroup.rotation.y = activeSlide * 0.22;
    rp.torsoVisualGroup.rotation.z = -lb * 0.25 + activeSlide * 0.14;
  }
  if (rp.headGroup) {
    const targetHeadPitch = cb * 0.16 + pb * 0.92 + aimPitch * 0.45;
    rp.headGroup.rotation.x += (targetHeadPitch - rp.headGroup.rotation.x) * 0.28;
    const targetHeadYaw = isMoving ? -strideSin * 0.05 * gaitScale : 0;
    rp.headGroup.rotation.y += (targetHeadYaw - rp.headGroup.rotation.y) * 0.25;
  }
  if (rp.armPivot) {
    // Include +cb * 0.18 crouch pitch & CoD Tac-Stance / Neon 40-degree inward canted weapon slide posture
    const targetArmPitch = cb * 0.18 + pb * 0.95 - activeSlide * 0.08 + aimPitch * 0.75 + breath + (isMoving ? Math.cos(rp.walkPhase * 2) * 0.035 * gaitScale : 0);
    rp.armPivot.rotation.x += (targetArmPitch - rp.armPivot.rotation.x) * 0.32;
    rp.armPivot.position.x = -lb * 0.015;
    rp.armPivot.position.y = 0.48 - activeSlide * 0.04;
    rp.armPivot.rotation.y = activeSlide * 0.12;
    rp.armPivot.rotation.z = -lb * 0.12 + activeSlide * 0.42;
  }

  // Hide third-person muzzle flash after 55ms
  if (rp.gunMesh?.userData?.flashMesh && now - rp.lastShotFlashAt > 55) {
    rp.gunMesh.userData.flashMesh.visible = false;
  }
}

export const updateHumanoidRigAnimation = animateHumanoidRig;

