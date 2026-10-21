export function animateHumanoidRig(rp, dt, now, isMoving, moveSpeed = 0) {
  if (!rp || !rp.pelvisGroup) return;
  // 1. Smoothly blend standing <-> tactical crouch <-> slide <-> prone & Q/E lean posture
  const targetProne = rp.prone ? 1.0 : 0.0;
  rp.proneBlend = (rp.proneBlend || 0) + (targetProne - (rp.proneBlend || 0)) * Math.min(1, dt * 11);
  const pb = rp.proneBlend;

  const targetSlide = rp.sliding && !rp.prone ? 1.0 : 0.0;
  rp.slideBlend = (rp.slideBlend || 0) + (targetSlide - (rp.slideBlend || 0)) * Math.min(1, dt * 14);
  const sb = rp.slideBlend;

  const targetCrouch = (rp.crouching || rp.sliding) && !rp.prone ? 1.0 : 0.0;
  rp.crouchBlend = (rp.crouchBlend || 0) + (targetCrouch - (rp.crouchBlend || 0)) * Math.min(1, dt * 12);
  const cb = rp.crouchBlend;

  const targetLean = rp.lean || 0;
  rp.leanBlend = (rp.leanBlend || 0) + (targetLean - (rp.leanBlend || 0)) * Math.min(1, dt * 14);
  const lb = rp.leanBlend;

  // 2. Advance gait cycle & subtle idle breathing (suppressed during tactical slide or deterministic rest-pose tests with now === 0)
  const breath = now ? Math.sin(now * 0.0028 + (rp.id?.length || 0)) * 0.015 : 0;
  const gaitScale = 1 - sb;
  if (isMoving && sb < 0.5) {
    const rate = moveSpeed > 0.16 ? 13.5 : 10.8;
    rp.walkPhase += dt * rate;
  }

  const strideAmp = isMoving ? (pb > 0.4 ? 0.18 : cb > 0.4 ? 0.42 : 0.62) * gaitScale : 0;
  const strideSin = Math.sin(rp.walkPhase);
  const strideBob = isMoving ? Math.abs(Math.sin(rp.walkPhase)) * 0.032 * (1 - cb * 0.4 - pb * 0.75) * gaitScale : 0;

  // 3. Pelvis & Hip Socket vertical height (drops 0.25m in crouch, extra 0.12m during slide, 0.56m in prone)
  const hipY = 0.80 - cb * 0.25 - pb * 0.56 - sb * 0.12 + strideBob;
  if (rp.pelvisGroup) {
    rp.pelvisGroup.position.y = hipY;
    rp.pelvisGroup.rotation.y = sb > 0.05 ? -0.22 * sb : (isMoving ? -strideSin * 0.06 : 0);
  }
  rp.leftLeg.position.y = hipY;
  rp.rightLeg.position.y = hipY;

  // 4. Articulated Hip Swing + Real Knee Joint Flexion (or extended forward/tucked in Slide, or backward in Prone)
  const crouchHipFlex = cb * 0.56 - pb * 1.15;
  const crouchKneeFlex = cb * 0.96 + pb * 0.18;

  if (isMoving && sb < 0.25) {
    const leftHipSwing = strideSin * strideAmp;
    const rightHipSwing = -strideSin * strideAmp;
    rp.leftLeg.rotation.x = leftHipSwing + crouchHipFlex - sb * 0.35;
    rp.rightLeg.rotation.x = rightHipSwing + crouchHipFlex + sb * 0.48;

    if (rp.leftKneePivot && rp.rightKneePivot) {
      const leftKneeSwing = Math.max(0.06, Math.sin(rp.walkPhase - 0.65) * 0.78) * gaitScale;
      const rightKneeSwing = Math.max(0.06, Math.sin(rp.walkPhase + Math.PI - 0.65) * 0.78) * gaitScale;
      rp.leftKneePivot.rotation.x = -(leftKneeSwing * (1 - cb * 0.35 - pb * 0.65) + crouchKneeFlex + sb * 0.32);
      rp.rightKneePivot.rotation.x = -(rightKneeSwing * (1 - cb * 0.35 - pb * 0.65) + crouchKneeFlex - sb * 0.68);
    }
  } else {
    const targetLeftHip = crouchHipFlex + 0.04 - sb * 0.35;
    const targetRightHip = crouchHipFlex - 0.05 + sb * 0.48;
    rp.leftLeg.rotation.x += (targetLeftHip - rp.leftLeg.rotation.x) * Math.min(1, dt * 10);
    rp.rightLeg.rotation.x += (targetRightHip - rp.rightLeg.rotation.x) * Math.min(1, dt * 10);
    if (rp.leftKneePivot && rp.rightKneePivot) {
      const targetLeftKnee = -(crouchKneeFlex + 0.08 + sb * 0.32);
      const targetRightKnee = -(crouchKneeFlex + 0.06 - sb * 0.68);
      rp.leftKneePivot.rotation.x += (targetLeftKnee - rp.leftKneePivot.rotation.x) * Math.min(1, dt * 10);
      rp.rightKneePivot.rotation.x += (targetRightKnee - rp.rightKneePivot.rotation.x) * Math.min(1, dt * 10);
    }
  }

  // 5. Upper Body, Head, Lean Roll & Dual-Arm Aiming Articulation (matches RIG.LEAN_SHIFT = 0.30, RIG.LEAN_ROLL = 0.38)
  const aimPitch = rp.targetPitch || 0;
  if (rp.upperBodyGroup) {
    const targetTorsoPitch = -cb * 0.18 - pb * 1.05 + sb * 0.32 + aimPitch * 0.25 + breath * 0.5;
    rp.upperBodyGroup.rotation.x += (targetTorsoPitch - rp.upperBodyGroup.rotation.x) * 0.25;
    const targetTorsoTwist = sb > 0.05 ? 0.18 * sb : (isMoving ? strideSin * 0.09 : (now ? Math.sin(now * 0.0014) * 0.03 : 0));
    rp.upperBodyGroup.rotation.y += (targetTorsoTwist - rp.upperBodyGroup.rotation.y) * 0.2;
    rp.upperBodyGroup.rotation.z = -lb * 0.38;
    rp.upperBodyGroup.position.x = lb * 0.30;
  }
  if (rp.headGroup) {
    const targetHeadPitch = cb * 0.16 + pb * 0.92 - sb * 0.24 + aimPitch * 0.45;
    rp.headGroup.rotation.x += (targetHeadPitch - rp.headGroup.rotation.x) * 0.28;
  }
  if (rp.armPivot) {
    const targetArmPitch = pb * 0.95 - sb * 0.18 + aimPitch * 0.75 + breath + (isMoving ? Math.cos(rp.walkPhase * 2) * 0.035 * gaitScale : 0);
    rp.armPivot.rotation.x += (targetArmPitch - rp.armPivot.rotation.x) * 0.32;
  }

  // Hide third-person muzzle flash after 55ms
  if (rp.gunMesh?.userData?.flashMesh && now - rp.lastShotFlashAt > 55) {
    rp.gunMesh.userData.flashMesh.visible = false;
  }
}

export const updateHumanoidRigAnimation = animateHumanoidRig;

