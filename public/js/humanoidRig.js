// 3D Articulated Humanoid Character Rig Builder & Kinematic Gait Animator

import * as THREE from '../vendor/three/three.module.js';
import { createWeaponMesh } from './weaponModels.js';

export function createPlayerNameSprite(name) {
  const canvas = document.createElement('canvas');
  canvas.width = 280;
  canvas.height = 80;
  const ctx = canvas.getContext('2d');

  const texture = new THREE.CanvasTexture(canvas);
  const material = new THREE.SpriteMaterial({ map: texture, depthTest: false });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(2.35, 0.67, 1);
  sprite.position.set(0, 2.38, 0);
  sprite.renderOrder = 10;

  const updateLabel = (hp) => {
    ctx.clearRect(0, 0, 280, 80);

    // Chamfered tactical obsidian nameplate
    ctx.fillStyle = 'rgba(6, 10, 19, 0.88)';
    ctx.beginPath();
    ctx.moveTo(28, 8);
    ctx.lineTo(256, 8);
    ctx.lineTo(264, 16);
    ctx.lineTo(264, 64);
    ctx.lineTo(20, 64);
    ctx.lineTo(20, 16);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = 'rgba(56, 189, 248, 0.65)';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Corner tactical accent brackets
    ctx.fillStyle = '#38bdf8';
    ctx.fillRect(20, 14, 4, 18);
    ctx.fillRect(260, 46, 4, 18);

    // Callsign text
    ctx.font = '800 20px "Chakra Petch", "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#f8fafc';
    ctx.fillText(name.slice(0, 15).toUpperCase(), 142, 33);

    // HP Bar Track
    ctx.fillStyle = 'rgba(15, 23, 42, 0.95)';
    ctx.fillRect(36, 44, 212, 11);

    // HP Bar Fill
    const pct = Math.max(0, Math.min(1, hp / 100));
    ctx.fillStyle = pct > 0.55 ? '#10b981' : pct > 0.25 ? '#f59e0b' : '#ef4444';
    ctx.fillRect(36, 44, Math.round(212 * pct), 11);

    // Subtle 25% HP segment ticks
    ctx.fillStyle = 'rgba(6, 10, 19, 0.65)';
    for (let t = 1; t < 4; t++) {
      ctx.fillRect(36 + t * 53, 44, 2, 11);
    }

    texture.needsUpdate = true;
  };

  updateLabel(100);
  return { sprite, canvas, texture, material, updateLabel };
}

export function createRemotePlayerMesh(playerData, options = {}) {
  const isShowcase = Boolean(options.isShowcase);
  const group = new THREE.Group();
  const pColor = playerData.color || options.defaultColor || 0x38bdf8;

  const mainMat = new THREE.MeshStandardMaterial({
    color: pColor,
    roughness: 0.30,
    metalness: 0.48
  });
  const suitMat = new THREE.MeshStandardMaterial({
    color: 0x1e293b,
    roughness: 0.54,
    metalness: 0.28
  });
  const armorMat = new THREE.MeshStandardMaterial({
    color: 0x0f172a,
    roughness: 0.26,
    metalness: 0.74
  });
  const chromeMat = new THREE.MeshStandardMaterial({
    color: 0x94a3b8,
    roughness: 0.20,
    metalness: 0.88
  });
  const visorMat = new THREE.MeshStandardMaterial({
    color: pColor,
    emissive: pColor,
    emissiveIntensity: 0.95,
    roughness: 0.12,
    metalness: 0.2
  });

  const hitboxParts = [];
  const tagBodyHitbox = (mesh) => {
    mesh.userData = { playerId: playerData.id, isHeadshot: false };
    hitboxParts.push(mesh);
    return mesh;
  };
  const tagHeadHitbox = (mesh) => {
    mesh.userData = { playerId: playerData.id, isHeadshot: true };
    hitboxParts.push(mesh);
    return mesh;
  };

  // ==================== 1. PELVIS, HIPS & TACTICAL UTILITY BELT ====================
  const pelvisGroup = new THREE.Group();
  pelvisGroup.position.set(0, 0.80, 0);
  group.add(pelvisGroup);

  const pelvisCore = new THREE.Mesh(new THREE.CylinderGeometry(0.165, 0.145, 0.19, 14), armorMat);
  pelvisCore.scale.set(1.22, 1, 0.82);
  pelvisCore.castShadow = true;
  tagBodyHitbox(pelvisCore);
  pelvisGroup.add(pelvisCore);

  const groinGuard = new THREE.Mesh(new THREE.CapsuleGeometry(0.068, 0.08, 8, 12), armorMat);
  groinGuard.position.set(0, -0.03, -0.08);
  const beltRing = new THREE.Mesh(new THREE.CylinderGeometry(0.182, 0.182, 0.072, 16), suitMat);
  beltRing.scale.set(1.24, 1, 0.86);
  beltRing.position.set(0, 0.065, 0);
  const beltBuckle = new THREE.Mesh(new THREE.OctahedronGeometry(0.046, 0), visorMat);
  beltBuckle.position.set(0, 0.065, -0.16);

  // Cylindrical Tactical Grenade Canisters & Side Utility Pouches on Belt
  const canisterGeo = new THREE.CylinderGeometry(0.036, 0.036, 0.12, 10);
  const canisterL = new THREE.Mesh(canisterGeo, chromeMat);
  canisterL.position.set(-0.21, 0.05, -0.09);
  const canisterR = new THREE.Mesh(canisterGeo, chromeMat);
  canisterR.position.set(0.21, 0.05, -0.09);
  const hipPouchL = new THREE.Mesh(new THREE.CapsuleGeometry(0.044, 0.07, 6, 10), suitMat);
  hipPouchL.position.set(-0.23, 0.04, 0.04);
  const hipPouchR = new THREE.Mesh(new THREE.CapsuleGeometry(0.044, 0.07, 6, 10), suitMat);
  hipPouchR.position.set(0.23, 0.04, 0.04);
  pelvisGroup.add(groinGuard, beltRing, beltBuckle, canisterL, canisterR, hipPouchL, hipPouchR);

  // ==================== 2. ANATOMICAL V-TAPERED UPPER BODY & CHEST RIG ====================
  const upperBodyGroup = new THREE.Group();
  upperBodyGroup.position.set(0, 0.10, 0); // World y = 0.90
  pelvisGroup.add(upperBodyGroup);

  // Primary Body Hitbox Cylinder (covers waist to upper chest)
  const torsoGeo = new THREE.CylinderGeometry(0.245, 0.175, 0.60, 16);
  const torsoMesh = new THREE.Mesh(torsoGeo, suitMat);
  torsoMesh.scale.set(1.24, 1, 0.82);
  torsoMesh.position.set(0, 0.28, 0);
  torsoMesh.castShadow = true;
  tagBodyHitbox(torsoMesh);
  upperBodyGroup.add(torsoMesh);

  // Contoured 6-Pack Abdominal Weave Ribs
  for (let r = 0; r < 3; r++) {
    const abRib = new THREE.Mesh(new THREE.CapsuleGeometry(0.026, 0.19 - r * 0.015, 6, 10), armorMat);
    abRib.rotation.z = Math.PI / 2;
    abRib.position.set(0, 0.08 + r * 0.062, -0.138);
    upperBodyGroup.add(abRib);
  }

  // Sculpted Left & Right Pectoral Ballistic Plates + Sternum Arc Core
  const pecGeo = new THREE.SphereGeometry(0.145, 14, 12);
  const pecLeft = new THREE.Mesh(pecGeo, armorMat);
  pecLeft.scale.set(1.08, 0.84, 0.65);
  pecLeft.position.set(-0.105, 0.36, -0.105);
  const pecRight = new THREE.Mesh(pecGeo, armorMat);
  pecRight.scale.set(1.08, 0.84, 0.65);
  pecRight.position.set(0.105, 0.36, -0.105);

  const chestTrimL = new THREE.Mesh(new THREE.CapsuleGeometry(0.016, 0.15, 6, 8), mainMat);
  chestTrimL.rotation.z = 0.42;
  chestTrimL.position.set(-0.14, 0.35, -0.178);
  const chestTrimR = new THREE.Mesh(new THREE.CapsuleGeometry(0.016, 0.15, 6, 8), mainMat);
  chestTrimR.rotation.z = -0.42;
  chestTrimR.position.set(0.14, 0.35, -0.178);

  const coreHousing = new THREE.Mesh(new THREE.TorusGeometry(0.056, 0.014, 8, 16), chromeMat);
  coreHousing.position.set(0, 0.35, -0.182);
  const coreBadge = new THREE.Mesh(new THREE.OctahedronGeometry(0.048, 1), visorMat);
  coreBadge.position.set(0, 0.35, -0.188);

  // Muscular Trapezius / Upper Back & Aerodynamic Spine Thruster Pack
  const trapsSlope = new THREE.Mesh(new THREE.CapsuleGeometry(0.125, 0.26, 8, 12), armorMat);
  trapsSlope.rotation.z = Math.PI / 2;
  trapsSlope.position.set(0, 0.47, 0.02);

  const spineRidge = new THREE.Mesh(new THREE.CapsuleGeometry(0.065, 0.32, 8, 12), armorMat);
  spineRidge.position.set(0, 0.32, 0.17);
  const thrusterGeo = new THREE.CylinderGeometry(0.048, 0.064, 0.32, 12);
  const thrusterL = new THREE.Mesh(thrusterGeo, chromeMat);
  thrusterL.position.set(-0.125, 0.32, 0.195);
  thrusterL.rotation.z = 0.12;
  const thrusterR = new THREE.Mesh(thrusterGeo, chromeMat);
  thrusterR.position.set(0.125, 0.32, 0.195);
  thrusterR.rotation.z = -0.12;
  const nozzleGlowL = new THREE.Mesh(new THREE.CylinderGeometry(0.044, 0.044, 0.03, 10), visorMat);
  nozzleGlowL.position.set(-0.142, 0.155, 0.195);
  const nozzleGlowR = new THREE.Mesh(new THREE.CylinderGeometry(0.044, 0.044, 0.03, 10), visorMat);
  nozzleGlowR.position.set(0.142, 0.155, 0.195);

  // Sculpted Neck & Armored Clavicle Collar Ring
  const collarRing = new THREE.Mesh(new THREE.TorusGeometry(0.125, 0.028, 10, 18), armorMat);
  collarRing.rotation.x = Math.PI / 2 + 0.12;
  collarRing.position.set(0, 0.54, -0.01);
  const neckMuscle = new THREE.Mesh(new THREE.CylinderGeometry(0.078, 0.096, 0.16, 14), suitMat);
  neckMuscle.position.set(0, 0.60, -0.01);

  upperBodyGroup.add(
    pecLeft,
    pecRight,
    chestTrimL,
    chestTrimR,
    coreHousing,
    coreBadge,
    trapsSlope,
    spineRidge,
    thrusterL,
    thrusterR,
    nozzleGlowL,
    nozzleGlowR,
    collarRing,
    neckMuscle
  );

  // ==================== 3. SCULPTED HUMANOID HEAD, BALLISTIC HELMET & VISOR ====================
  const headGroup = new THREE.Group();
  headGroup.position.set(0, 0.64, 0); // World y = 1.54
  upperBodyGroup.add(headGroup);

  // Generous Headshot Collider Capsule enveloping the entire cranium & helmet
  const headGeo = new THREE.CapsuleGeometry(0.195, 0.15, 10, 14);
  const headMesh = new THREE.Mesh(headGeo, suitMat);
  headMesh.position.set(0, 0.22, 0); // World y = 1.76
  headMesh.castShadow = true;
  tagHeadHitbox(headMesh);
  headGroup.add(headMesh);

  // Smooth Contoured Ballistic Helmet Shell
  const helmetDome = new THREE.Mesh(new THREE.SphereGeometry(0.196, 16, 12), armorMat);
  helmetDome.scale.set(0.96, 1.04, 1.08);
  helmetDome.position.set(0, 0.24, 0.01);

  // Aerodynamic Crown Ridge & Forehead NVG Shroud
  const helmetCrest = new THREE.Mesh(new THREE.CapsuleGeometry(0.032, 0.22, 8, 12), mainMat);
  helmetCrest.rotation.x = Math.PI / 2 - 0.1;
  helmetCrest.position.set(0, 0.42, 0.01);
  const browVisorHood = new THREE.Mesh(
    new THREE.CylinderGeometry(0.192, 0.198, 0.055, 16, 1, false, Math.PI * 0.58, Math.PI * 0.84),
    mainMat
  );
  browVisorHood.position.set(0, 0.285, -0.02);

  // Wrap-Around Curved Panoramic Glowing Visor (Faces -Z forward)
  const visorMesh = new THREE.Mesh(
    new THREE.CylinderGeometry(0.186, 0.178, 0.092, 16, 1, false, Math.PI * 0.60, Math.PI * 0.80),
    visorMat
  );
  visorMesh.position.set(0, 0.23, -0.02);

  // Sculpted Jawline, Cheek Guards & Tactical Respirator Mask
  const jawMask = new THREE.Mesh(new THREE.CylinderGeometry(0.135, 0.102, 0.13, 14), armorMat);
  jawMask.position.set(0, 0.13, -0.045);
  const breatherFilter = new THREE.Mesh(new THREE.CylinderGeometry(0.044, 0.054, 0.08, 12), chromeMat);
  breatherFilter.rotation.x = Math.PI / 2.2;
  breatherFilter.position.set(0, 0.105, -0.155);
  const breatherGlow = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, 0.084, 10), visorMat);
  breatherGlow.rotation.x = Math.PI / 2.2;
  breatherGlow.position.set(0, 0.105, -0.157);

  // Side Comms Headset Pods & Antenna
  const earPodGeo = new THREE.CylinderGeometry(0.062, 0.062, 0.045, 12);
  earPodGeo.rotateZ(Math.PI / 2);
  const earPodL = new THREE.Mesh(earPodGeo, chromeMat);
  earPodL.position.set(-0.188, 0.22, 0.01);
  const earPodR = new THREE.Mesh(earPodGeo, chromeMat);
  earPodR.position.set(0.188, 0.22, 0.01);
  const commsAntenna = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.009, 0.22, 6), chromeMat);
  commsAntenna.position.set(-0.195, 0.35, 0.04);

  headGroup.add(
    helmetDome,
    helmetCrest,
    browVisorHood,
    visorMesh,
    jawMask,
    breatherFilter,
    breatherGlow,
    earPodL,
    earPodR,
    commsAntenna
  );

  // ==================== 4. ARTICULATED 2-SEGMENT ARMS, SHOULDERS & HANDS ====================
  const armPivot = new THREE.Group();
  armPivot.position.set(0, 0.46, 0); // World y = 1.36
  upperBodyGroup.add(armPivot);

  const buildShoulder = (sideSign) => {
    const sGroup = new THREE.Group();
    sGroup.position.set(sideSign * 0.32, 0.01, 0);

    const ballJoint = new THREE.Mesh(new THREE.SphereGeometry(0.095, 12, 10), suitMat);
    const pauldronDomed = new THREE.Mesh(
      new THREE.SphereGeometry(0.122, 14, 12, 0, Math.PI * 2, 0, Math.PI * 0.58),
      armorMat
    );
    pauldronDomed.position.set(sideSign * 0.02, 0.02, 0);
    pauldronDomed.rotation.z = -sideSign * 0.42;

    const pauldronTrim = new THREE.Mesh(new THREE.TorusGeometry(0.112, 0.015, 8, 16), mainMat);
    pauldronTrim.rotation.x = Math.PI / 2;
    pauldronTrim.rotation.y = -sideSign * 0.42;
    pauldronTrim.position.set(sideSign * 0.025, 0.01, 0);

    sGroup.add(ballJoint, pauldronDomed, pauldronTrim);
    return sGroup;
  };

  const rightShoulder = buildShoulder(1);
  const leftShoulder = buildShoulder(-1);

  // Right Trigger Arm: Bicep -> Elbow Joint -> Forearm -> Gauntlet -> Hand & Fingers
  const rightBicep = new THREE.Mesh(new THREE.CapsuleGeometry(0.062, 0.20, 8, 12), suitMat);
  rightBicep.position.set(0.33, -0.10, -0.07);
  rightBicep.rotation.set(0.58, 0, -0.06);

  const rightElbow = new THREE.Mesh(new THREE.SphereGeometry(0.058, 10, 10), armorMat);
  rightElbow.position.set(0.34, -0.19, -0.17);

  const rightForearm = new THREE.Mesh(new THREE.CylinderGeometry(0.056, 0.044, 0.25, 12), suitMat);
  rightForearm.position.set(0.31, -0.15, -0.29);
  rightForearm.rotation.set(1.34, -0.20, 0);

  const rightGauntlet = new THREE.Mesh(new THREE.CylinderGeometry(0.062, 0.050, 0.16, 10), armorMat);
  rightGauntlet.position.set(0.31, -0.15, -0.29);
  rightGauntlet.rotation.set(1.34, -0.20, 0);

  const rightHand = new THREE.Mesh(new THREE.SphereGeometry(0.048, 10, 8), armorMat);
  rightHand.scale.set(0.9, 1.1, 1.3);
  rightHand.position.set(0.28, -0.11, -0.40);

  // Left Support Arm: Bicep -> Elbow Joint -> Forearm -> Hand Gripping Handguard
  const leftBicep = new THREE.Mesh(new THREE.CapsuleGeometry(0.060, 0.21, 8, 12), suitMat);
  leftBicep.position.set(-0.27, -0.09, -0.10);
  leftBicep.rotation.set(0.75, -0.42, 0.30);

  const leftElbow = new THREE.Mesh(new THREE.SphereGeometry(0.056, 10, 10), armorMat);
  leftElbow.position.set(-0.18, -0.17, -0.23);

  const leftForearm = new THREE.Mesh(new THREE.CylinderGeometry(0.054, 0.042, 0.31, 12), suitMat);
  leftForearm.position.set(0.02, -0.12, -0.39);
  leftForearm.rotation.set(1.38, 0, -0.82);

  const leftGauntlet = new THREE.Mesh(new THREE.CylinderGeometry(0.058, 0.048, 0.18, 10), armorMat);
  leftGauntlet.position.set(-0.01, -0.13, -0.36);
  leftGauntlet.rotation.set(1.38, 0, -0.82);

  const leftHand = new THREE.Mesh(new THREE.SphereGeometry(0.046, 10, 8), armorMat);
  leftHand.scale.set(1.1, 0.9, 1.25);
  leftHand.position.set(0.22, -0.08, -0.54);

  // Held 3D Weapon aligned with both hands
  const gunHolder = new THREE.Group();
  gunHolder.position.set(0.27, -0.03, -0.42);
  const gunMesh = createWeaponMesh(playerData.weapon || 'rifle', false);
  gunHolder.add(gunMesh);

  armPivot.add(
    rightShoulder,
    leftShoulder,
    rightBicep,
    rightElbow,
    rightForearm,
    rightGauntlet,
    rightHand,
    leftBicep,
    leftElbow,
    leftForearm,
    leftGauntlet,
    leftHand,
    gunHolder
  );

  // ==================== 5. ARTICULATED 2-SEGMENT LEGS (HIP -> THIGH -> KNEE -> SHIN -> BOOT) ====================
  const thighGeo = new THREE.CylinderGeometry(0.102, 0.078, 0.38, 14);
  thighGeo.translate(0, -0.19, 0); // Pivot at hip socket (y = 0)

  const shinGeo = new THREE.CylinderGeometry(0.076, 0.054, 0.34, 14);
  shinGeo.translate(0, -0.17, 0); // Pivot at knee joint (y = 0)

  const buildArticulatedLeg = (sideSign) => {
    const hipLegMesh = new THREE.Mesh(thighGeo.clone(), suitMat);
    hipLegMesh.position.set(sideSign * 0.15, 0.80, 0);
    hipLegMesh.castShadow = true;
    tagBodyHitbox(hipLegMesh);

    const hipBall = new THREE.Mesh(new THREE.SphereGeometry(0.092, 10, 10), suitMat);
    const thighArmor = new THREE.Mesh(new THREE.CapsuleGeometry(0.054, 0.17, 6, 10), armorMat);
    thighArmor.position.set(sideSign * 0.038, -0.18, -0.025);
    const thighStripe = new THREE.Mesh(new THREE.CapsuleGeometry(0.022, 0.14, 6, 8), mainMat);
    thighStripe.position.set(sideSign * 0.068, -0.18, -0.03);
    const thighStrap = new THREE.Mesh(new THREE.TorusGeometry(0.092, 0.014, 6, 14), armorMat);
    thighStrap.rotation.x = Math.PI / 2;
    thighStrap.position.set(0, -0.19, 0);
    hipLegMesh.add(hipBall, thighArmor, thighStripe, thighStrap);

    // Articulated Knee Joint Pivot at bottom of thigh (y = -0.38)
    const kneePivot = new THREE.Group();
    kneePivot.position.set(0, -0.38, 0);
    hipLegMesh.add(kneePivot);

    const kneeSphere = new THREE.Mesh(new THREE.SphereGeometry(0.072, 10, 10), suitMat);
    const kneeCap = new THREE.Mesh(new THREE.CapsuleGeometry(0.052, 0.065, 8, 10), armorMat);
    kneeCap.position.set(0, 0.01, -0.052);
    const kneeGlow = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.026, 0.02), visorMat);
    kneeGlow.position.set(0, 0.01, -0.102);

    // Lower Leg (Shin & Gastrocnemius Calf Muscle)
    const shinMesh = new THREE.Mesh(shinGeo.clone(), suitMat);
    shinMesh.castShadow = true;
    tagBodyHitbox(shinMesh);

    const calfMuscle = new THREE.Mesh(new THREE.SphereGeometry(0.068, 10, 8), suitMat);
    calfMuscle.scale.set(0.92, 1.4, 1.05);
    calfMuscle.position.set(0, -0.13, 0.026);

    const shinGuard = new THREE.Mesh(
      new THREE.CylinderGeometry(0.066, 0.052, 0.25, 12, 1, false, Math.PI * 0.62, Math.PI * 0.76),
      armorMat
    );
    shinGuard.position.set(0, -0.18, -0.02);
    const shinTrim = new THREE.Mesh(new THREE.CapsuleGeometry(0.014, 0.16, 6, 8), mainMat);
    shinTrim.position.set(0, -0.18, -0.082);

    // Ankle Joint & Sculpted Combat Boot
    const ankleCollar = new THREE.Mesh(new THREE.CylinderGeometry(0.058, 0.066, 0.07, 12), armorMat);
    ankleCollar.position.set(0, -0.33, 0);
    const bootInstep = new THREE.Mesh(new THREE.CapsuleGeometry(0.058, 0.13, 8, 12), armorMat);
    bootInstep.rotation.x = Math.PI / 2;
    bootInstep.position.set(0, -0.368, -0.045);
    const bootToeCap = new THREE.Mesh(new THREE.SphereGeometry(0.058, 10, 8), chromeMat);
    bootToeCap.scale.set(1.02, 0.72, 1.15);
    bootToeCap.position.set(0, -0.375, -0.115);
    const bootSole = new THREE.Mesh(new THREE.BoxGeometry(0.126, 0.028, 0.26), armorMat);
    bootSole.position.set(0, -0.406, -0.045);

    kneePivot.add(
      kneeSphere,
      kneeCap,
      kneeGlow,
      shinMesh,
      calfMuscle,
      shinGuard,
      shinTrim,
      ankleCollar,
      bootInstep,
      bootToeCap,
      bootSole
    );

    return { hipLegMesh, kneePivot, shinMesh };
  };

  const leftLegData = buildArticulatedLeg(-1);
  const rightLegData = buildArticulatedLeg(1);
  const leftLeg = leftLegData.hipLegMesh;
  const rightLeg = rightLegData.hipLegMesh;
  const leftKneePivot = leftLegData.kneePivot;
  const rightKneePivot = rightLegData.kneePivot;

  group.add(leftLeg, rightLeg);

  const labelInfo = null;
  if (!isShowcase && options.scene) {
    options.scene.add(group);
  }

  const setOperatorColor = (newHex) => {
    mainMat.color.setHex(newHex);
    visorMat.color.setHex(newHex);
    visorMat.emissive.setHex(newHex);
  };

  return {
    id: playerData.id,
    name: playerData.name,
    group,
    pelvisGroup,
    upperBodyGroup,
    headGroup,
    torsoMesh,
    headMesh,
    leftLeg,
    rightLeg,
    leftKneePivot,
    rightKneePivot,
    armPivot,
    gunHolder,
    gunMesh,
    hitboxParts,
    setOperatorColor,
    currentWeapon: playerData.weapon || 'rifle',
    labelInfo,
    targetPos: new THREE.Vector3(playerData.x || 0, playerData.y || 0, playerData.z || 0),
    targetYaw: playerData.yaw || 0,
    targetPitch: playerData.pitch || 0,
    crouching: Boolean(playerData.crouching),
    prone: Boolean(playerData.prone),
    lean: Number(playerData.lean || 0),
    crouchBlend: 0,
    proneBlend: 0,
    leanBlend: 0,
    hp: playerData.hp ?? 100,
    alive: playerData.alive !== undefined ? Boolean(playerData.alive) : true,
    walkPhase: 0,
    lastShotFlashAt: 0
  };
}

export function animateHumanoidRig(rp, dt, now, isMoving, moveSpeed = 0) {
  // 1. Smoothly blend standing <-> tactical crouch <-> prone & Q/E lean posture
  const targetProne = rp.prone ? 1.0 : 0.0;
  rp.proneBlend = (rp.proneBlend || 0) + (targetProne - (rp.proneBlend || 0)) * Math.min(1, dt * 11);
  const pb = rp.proneBlend;

  const targetCrouch = rp.crouching && !rp.prone ? 1.0 : 0.0;
  rp.crouchBlend = (rp.crouchBlend || 0) + (targetCrouch - (rp.crouchBlend || 0)) * Math.min(1, dt * 12);
  const cb = rp.crouchBlend;

  const targetLean = rp.lean || 0;
  rp.leanBlend = (rp.leanBlend || 0) + (targetLean - (rp.leanBlend || 0)) * Math.min(1, dt * 14);
  const lb = rp.leanBlend;

  // 2. Advance gait cycle & subtle idle breathing
  const breath = Math.sin(now * 0.0028 + (rp.id?.length || 0)) * 0.016;
  if (isMoving) {
    const rate = moveSpeed > 0.16 ? 13.5 : 10.8;
    rp.walkPhase += dt * rate;
  }

  const strideAmp = isMoving ? (pb > 0.4 ? 0.18 : cb > 0.4 ? 0.42 : 0.62) : 0;
  const strideSin = Math.sin(rp.walkPhase);
  const strideBob = isMoving ? Math.abs(Math.sin(rp.walkPhase)) * 0.032 * (1 - cb * 0.4 - pb * 0.75) : 0;

  // 3. Pelvis & Hip Socket vertical height (drops 0.25m in crouch, 0.56m in prone)
  const hipY = 0.80 - cb * 0.25 - pb * 0.56 + strideBob;
  if (rp.pelvisGroup) {
    rp.pelvisGroup.position.y = hipY;
    rp.pelvisGroup.rotation.y = isMoving ? -strideSin * 0.06 : 0;
  }
  rp.leftLeg.position.y = hipY;
  rp.rightLeg.position.y = hipY;

  // 4. Articulated Hip Swing + Real Knee Joint Flexion (or extended backward in Prone)
  const crouchHipFlex = cb * 0.56 - pb * 1.15;
  const crouchKneeFlex = cb * 0.96 + pb * 0.18;

  if (isMoving) {
    const leftHipSwing = strideSin * strideAmp;
    const rightHipSwing = -strideSin * strideAmp;
    rp.leftLeg.rotation.x = leftHipSwing + crouchHipFlex;
    rp.rightLeg.rotation.x = rightHipSwing + crouchHipFlex;

    if (rp.leftKneePivot && rp.rightKneePivot) {
      const leftKneeSwing = Math.max(0.06, Math.sin(rp.walkPhase - 0.65) * 0.78);
      const rightKneeSwing = Math.max(0.06, Math.sin(rp.walkPhase + Math.PI - 0.65) * 0.78);
      rp.leftKneePivot.rotation.x = -(leftKneeSwing * (1 - cb * 0.35 - pb * 0.65) + crouchKneeFlex);
      rp.rightKneePivot.rotation.x = -(rightKneeSwing * (1 - cb * 0.35 - pb * 0.65) + crouchKneeFlex);
    }
  } else {
    rp.leftLeg.rotation.x += (crouchHipFlex + 0.04 - rp.leftLeg.rotation.x) * Math.min(1, dt * 10);
    rp.rightLeg.rotation.x += (crouchHipFlex - 0.05 - rp.rightLeg.rotation.x) * Math.min(1, dt * 10);
    if (rp.leftKneePivot && rp.rightKneePivot) {
      rp.leftKneePivot.rotation.x += (-(crouchKneeFlex + 0.08) - rp.leftKneePivot.rotation.x) * Math.min(1, dt * 10);
      rp.rightKneePivot.rotation.x += (-(crouchKneeFlex + 0.06) - rp.rightKneePivot.rotation.x) * Math.min(1, dt * 10);
    }
  }

  // 5. Upper Body, Head, Lean Roll & Dual-Arm Aiming Articulation
  const aimPitch = rp.targetPitch || 0;
  if (rp.upperBodyGroup) {
    const targetTorsoPitch = -cb * 0.18 - pb * 1.05 + aimPitch * 0.25 + breath * 0.5;
    rp.upperBodyGroup.rotation.x += (targetTorsoPitch - rp.upperBodyGroup.rotation.x) * 0.25;
    const targetTorsoTwist = isMoving ? strideSin * 0.09 : Math.sin(now * 0.0014) * 0.03;
    rp.upperBodyGroup.rotation.y += (targetTorsoTwist - rp.upperBodyGroup.rotation.y) * 0.2;
    rp.upperBodyGroup.rotation.z = -lb * 0.28;
    rp.upperBodyGroup.position.x = lb * 0.18;
  }
  if (rp.headGroup) {
    const targetHeadPitch = cb * 0.16 + pb * 0.92 + aimPitch * 0.45;
    rp.headGroup.rotation.x += (targetHeadPitch - rp.headGroup.rotation.x) * 0.28;
  }
  if (rp.armPivot) {
    const targetArmPitch = pb * 0.95 + aimPitch * 0.75 + breath + (isMoving ? Math.cos(rp.walkPhase * 2) * 0.035 : 0);
    rp.armPivot.rotation.x += (targetArmPitch - rp.armPivot.rotation.x) * 0.32;
  }

  // Keep overhead nameplate positioned cleanly above helmet
  if (rp.labelInfo?.sprite) {
    rp.labelInfo.sprite.position.y = 2.38 - cb * 0.26 - pb * 0.88;
  }

  // Hide third-person muzzle flash after 55ms
  if (rp.gunMesh?.userData?.flashMesh && now - rp.lastShotFlashAt > 55) {
    rp.gunMesh.userData.flashMesh.visible = false;
  }
}
