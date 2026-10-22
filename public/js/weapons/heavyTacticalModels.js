import * as THREE from '../three.js';
import { roundedBox } from './roundedBox.js';
import {
  buildCurvedMagazine,
  buildDetailedOptic,
  buildErgonomicGripAndTrigger,
  buildPicatinnyRail
} from './weaponMaterials.js';

export function buildHeavyTacticalGeometry(weaponId, group, mats) {
  const {
    darkMetal,
    gunMetal,
    polymerMat,
    fdePolymerMat,
    fdeAnodizedMat,
    akWoodMat,
    oliveChassisMat,
    chromeMetal,
    brassMat,
    copperMat,
    boreHoleMat,
    accentMat,
    reticleMat,
    redReticleMat,
    glassMat
  } = mats;
  let magMesh = null;
  let boltMesh = null;
  let activeOptic = null;
  let opticCenterY = 0.106;
  let opticCenterZ = 0.02;
  let muzzleZ = -0.78;

  if (weaponId === 'smg') {
    // ==================== VECTOR-KRISS .45 ACP CQB SUBMACHINE GUN ====================
    const upperRailReceiver = new THREE.Mesh(roundedBox(0.076, 0.068, 0.42), darkMetal);
    upperRailReceiver.position.set(0, 0.042, -0.05);
    const topRail = buildPicatinnyRail(0.40, 0.080, -0.05, gunMetal, 12);

    // Iconic Angled Kriss Super-V Delayed-Blowback Lower Housing + Side Relief Channels + Knuckle Guard
    const superVHousing = new THREE.Mesh(roundedBox(0.072, 0.175, 0.135), fdePolymerMat);
    superVHousing.position.set(0, -0.048, -0.18);
    superVHousing.rotation.x = 0.22;

    const superVRecess = new THREE.Mesh(roundedBox(0.078, 0.095, 0.052), polymerMat);
    superVRecess.position.set(0, -0.045, -0.18);
    superVRecess.rotation.x = 0.22;

    const handBridge = new THREE.Mesh(roundedBox(0.056, 0.028, 0.18), polymerMat);
    handBridge.position.set(0, -0.105, -0.05);
    handBridge.rotation.x = 0.14;

    const gripCore = new THREE.Mesh(new THREE.CapsuleGeometry(0.026, 0.12, 10, 18), polymerMat);
    gripCore.scale.set(0.95, 1, 1.35);
    gripCore.position.set(0, -0.048, 0.055);
    gripCore.rotation.x = -0.18;

    // Short Shrouded Barrel + Fluted Linear Compensator + Bore
    const barrelShroud = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.22, 22), gunMetal);
    barrelShroud.rotation.x = Math.PI / 2;
    barrelShroud.position.set(0, 0.022, -0.32);
    const muzzleBore = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.013, 0.012, 16), boreHoleMat);
    muzzleBore.rotation.x = Math.PI / 2;
    muzzleBore.position.set(0, 0.022, -0.43);

    // Skeletal Side-Folding Buttstock (Hinge Knuckle + Top/Bottom Struts + Contoured Buttpad)
    const stockHinge = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.068, 16), darkMetal);
    stockHinge.position.set(0, 0.028, 0.16);
    const stockStrutTop = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.24, 16), polymerMat);
    stockStrutTop.rotation.x = Math.PI / 2;
    stockStrutTop.position.set(0, 0.042, 0.27);
    const stockStrutBot = new THREE.Mesh(new THREE.CylinderGeometry(0.010, 0.010, 0.25, 16), polymerMat);
    stockStrutBot.rotation.x = Math.PI / 2 + 0.18;
    stockStrutBot.position.set(0, 0.012, 0.27);
    const stockButt = new THREE.Mesh(new THREE.CapsuleGeometry(0.024, 0.068, 10, 18), darkMetal);
    stockButt.scale.set(1.0, 1, 0.45);
    stockButt.position.set(0, 0.016, 0.39);

    // Extended 33-Round Angled .45 ACP Kriss ExMag2
    magMesh = new THREE.Group();
    const magStick = new THREE.Mesh(roundedBox(0.044, 0.26, 0.062), polymerMat);
    const magExtension = new THREE.Mesh(roundedBox(0.052, 0.075, 0.072), fdePolymerMat);
    magExtension.position.set(0, -0.10, 0);
    magMesh.add(magStick, magExtension);
    magMesh.position.set(0, -0.175, -0.205);
    magMesh.rotation.x = 0.22;
    magMesh.userData.basePos = magMesh.position.clone();

    boltMesh = new THREE.Mesh(roundedBox(0.095, 0.026, 0.085), chromeMetal);
    boltMesh.position.set(0.012, 0.042, -0.10);
    boltMesh.userData.baseZ = -0.10;

    const holoSight = buildDetailedOptic('holo', 0.086, -0.02, darkMetal, gunMetal, accentMat, glassMat, redReticleMat);
    activeOptic = holoSight;
    opticCenterY = 0.086 + 0.038;
    opticCenterZ = -0.02;

    group.add(
      upperRailReceiver,
      topRail,
      superVHousing,
      superVRecess,
      handBridge,
      gripCore,
      barrelShroud,
      muzzleBore,
      stockHinge,
      stockStrutTop,
      stockStrutBot,
      stockButt,
      magMesh,
      boltMesh,
      holoSight
    );
    muzzleZ = -0.46;
  } else if (weaponId === 'lmg') {
    // ==================== ODIN-M249 (M249 SAW PARA SQUAD AUTOMATIC WEAPON) ====================
    const receiverBox = new THREE.Mesh(roundedBox(0.110, 0.116, 0.52), darkMetal);
    receiverBox.position.set(0, 0.015, -0.04);

    // Stamped receiver side reinforcement ribs
    for (const side of [-1, 1]) {
      const rib = new THREE.Mesh(roundedBox(0.008, 0.028, 0.44), gunMetal);
      rib.position.set(side * 0.056, 0.015, -0.04);
      group.add(rib);
    }

    // Rounded Top Feed Tray Cover with Integral Picatinny Rail
    const feedCover = new THREE.Mesh(
      new THREE.CylinderGeometry(0.054, 0.054, 0.34, 20, 1, false, -Math.PI * 0.5, Math.PI),
      gunMetal
    );
    feedCover.rotation.x = Math.PI / 2;
    feedCover.scale.set(1, 1, 0.65);
    feedCover.position.set(0, 0.074, 0.01);
    const feedRail = buildPicatinnyRail(0.30, 0.110, 0.01, darkMetal, 9);

    // Perforated Upper Barrel Heatshield & Contoured Lower Gas Cylinder Handguard
    const heatshield = new THREE.Mesh(
      new THREE.CylinderGeometry(0.046, 0.046, 0.36, 20, 1, false, -Math.PI * 0.55, Math.PI * 1.1),
      gunMetal
    );
    heatshield.rotation.x = Math.PI / 2;
    heatshield.position.set(0, 0.032, -0.46);

    const lowerForend = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.046, 0.38, 18), polymerMat);
    lowerForend.rotation.x = Math.PI / 2;
    lowerForend.scale.set(1.05, 0.82, 1);
    lowerForend.position.set(0, -0.018, -0.45);

    // Heavy Quick-Change Barrel + Carry Handle + Folded Bipod Legs + Birdcage Compensator
    const heavyBarrel = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.025, 0.52, 24), darkMetal);
    heavyBarrel.rotation.x = Math.PI / 2;
    heavyBarrel.position.set(0, 0.032, -0.66);

    const carryHandle = new THREE.Mesh(new THREE.CapsuleGeometry(0.014, 0.085, 8, 14), polymerMat);
    carryHandle.rotation.z = Math.PI / 2;
    carryHandle.position.set(0.065, 0.095, -0.28);

    const gasCylinder = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.44, 18), gunMetal);
    gasCylinder.rotation.x = Math.PI / 2;
    gasCylinder.position.set(0, -0.012, -0.62);

    const muzzleComp = new THREE.Mesh(new THREE.CylinderGeometry(0.030, 0.026, 0.085, 22), gunMetal);
    muzzleComp.rotation.x = Math.PI / 2;
    muzzleComp.position.set(0, 0.032, -0.92);
    const muzzleBore = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.015, 16), boreHoleMat);
    muzzleBore.rotation.x = Math.PI / 2;
    muzzleBore.position.set(0, 0.032, -0.96);

    const bipodL = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.34, 16), chromeMetal);
    bipodL.rotation.x = Math.PI / 2;
    bipodL.position.set(-0.048, -0.048, -0.52);
    const bipodR = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.34, 16), chromeMetal);
    bipodR.rotation.x = Math.PI / 2;
    bipodR.position.set(0.048, -0.048, -0.52);

    // Para Dual-Rod Collapsible Buttstock + Contoured Shoulder Rest
    const rodTop = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.28, 16), gunMetal);
    rodTop.rotation.x = Math.PI / 2;
    rodTop.position.set(0, 0.038, 0.34);
    const rodBot = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.28, 16), gunMetal);
    rodBot.rotation.x = Math.PI / 2;
    rodBot.position.set(0, -0.028, 0.34);
    const stockBlock = new THREE.Mesh(new THREE.CapsuleGeometry(0.032, 0.075, 10, 18), polymerMat);
    stockBlock.scale.set(1.05, 1, 0.65);
    stockBlock.position.set(0, 0.004, 0.47);

    const gripAsm = buildErgonomicGripAndTrigger(-0.052, 0.12, polymerMat, darkMetal, chromeMetal);

    // 100-Round Olive Box Drum Magazine + Visible Brass 5.56mm Linked Cartridge Belt with Copper Bullet Tips!
    magMesh = new THREE.Group();
    const drumBox = new THREE.Mesh(roundedBox(0.152, 0.185, 0.152), oliveChassisMat);
    const drumBevel = new THREE.Mesh(new THREE.CylinderGeometry(0.076, 0.076, 0.152, 20), oliveChassisMat);
    drumBevel.rotation.x = Math.PI / 2;
    drumBevel.position.set(0, -0.065, 0);
    magMesh.add(drumBox, drumBevel);

    // Individual Brass Cartridges + Copper FMJ Bullet Tips on Disintegrating Link Belt
    for (let c = 0; c < 6; c++) {
      const cx = -0.075 + c * 0.012;
      const cy = 0.105 + c * 0.018;
      const cart = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.009, 0.052, 16), brassMat);
      cart.rotation.x = Math.PI / 2;
      cart.position.set(cx, cy, 0.018);
      const bulletTip = new THREE.Mesh(new THREE.ConeGeometry(0.0078, 0.024, 12), copperMat);
      bulletTip.rotation.x = -Math.PI / 2;
      bulletTip.position.set(cx, cy, -0.018);
      const link = new THREE.Mesh(new THREE.CylinderGeometry(0.0098, 0.0098, 0.022, 16), darkMetal);
      link.rotation.x = Math.PI / 2;
      link.position.set(cx, cy, 0.016);
      magMesh.add(cart, bulletTip, link);
    }
    magMesh.position.set(0, -0.145, -0.13);
    magMesh.userData.basePos = magMesh.position.clone();

    boltMesh = new THREE.Mesh(roundedBox(0.125, 0.032, 0.12), chromeMetal);
    boltMesh.position.set(0.022, 0.036, -0.06);
    boltMesh.userData.baseZ = -0.06;

    const lmgHoloSight = buildDetailedOptic('holo', 0.114, 0.01, darkMetal, gunMetal, accentMat, glassMat, redReticleMat);
    activeOptic = lmgHoloSight;
    opticCenterY = 0.114 + 0.038;
    opticCenterZ = 0.01;

    group.add(
      receiverBox,
      feedCover,
      feedRail,
      heatshield,
      lowerForend,
      heavyBarrel,
      carryHandle,
      gasCylinder,
      muzzleComp,
      muzzleBore,
      bipodL,
      bipodR,
      rodTop,
      rodBot,
      stockBlock,
      gripAsm,
      magMesh,
      boltMesh,
      lmgHoloSight
    );
    muzzleZ = -0.98;
  } else if (weaponId === 'shotgun') {
    // ==================== BUCKSHOT-8 (BENELLI M4 / MOSSBERG 590 TACTICAL COMBAT SHOTGUN) ====================
    // Contoured Shotgun Receiver with Rounded Top Crown & Top Picatinny Rail
    const receiverLow = new THREE.Mesh(roundedBox(0.080, 0.086, 0.44), darkMetal);
    receiverLow.position.set(0, 0.005, -0.02);
    const receiverCrown = new THREE.Mesh(
      new THREE.CylinderGeometry(0.041, 0.041, 0.44, 20, 1, false, -Math.PI * 0.5, Math.PI),
      darkMetal
    );
    receiverCrown.rotation.x = Math.PI / 2;
    receiverCrown.scale.set(1, 1, 0.65);
    receiverCrown.position.set(0, 0.048, -0.02);

    const topRail = buildPicatinnyRail(0.26, 0.078, -0.01, gunMetal, 8);

    // Heavy 18.5" Cylindrical Barrel + Perforated Steel Heatshield + Full-Length Underbarrel Mag Tube
    const barrelTop = new THREE.Mesh(new THREE.CylinderGeometry(0.021, 0.022, 0.62, 24), gunMetal);
    barrelTop.rotation.x = Math.PI / 2;
    barrelTop.position.set(0, 0.042, -0.50);

    const heatshield = new THREE.Mesh(
      new THREE.CylinderGeometry(0.026, 0.026, 0.42, 20, 1, false, -Math.PI * 0.6, Math.PI * 1.2),
      darkMetal
    );
    heatshield.rotation.x = Math.PI / 2;
    heatshield.position.set(0, 0.046, -0.42);

    const magTube = new THREE.Mesh(new THREE.CylinderGeometry(0.019, 0.019, 0.58, 22), gunMetal);
    magTube.rotation.x = Math.PI / 2;
    magTube.position.set(0, -0.008, -0.48);

    const magCap = new THREE.Mesh(new THREE.CylinderGeometry(0.021, 0.021, 0.032, 20), darkMetal);
    magCap.rotation.x = Math.PI / 2;
    magCap.position.set(0, -0.008, -0.78);

    const barrelClamp = new THREE.Mesh(roundedBox(0.046, 0.082, 0.038), darkMetal);
    barrelClamp.position.set(0, 0.016, -0.68);

    // Breacher Standoff Muzzle Choke with Bore Hole
    const breacherChoke = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.023, 0.068, 22), gunMetal);
    breacherChoke.rotation.x = Math.PI / 2;
    breacherChoke.position.set(0, 0.042, -0.82);
    const muzzleBore = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.015, 18), boreHoleMat);
    muzzleBore.rotation.x = Math.PI / 2;
    muzzleBore.position.set(0, 0.042, -0.852);

    // Low-Profile Winged Front Sight Post + Top-Rail Red-Dot Reflex Sight
    const frontSightPost = new THREE.Mesh(roundedBox(0.018, 0.032, 0.024), darkMetal);
    frontSightPost.position.set(0, 0.068, -0.76);
    const frontFiberDot = new THREE.Mesh(new THREE.SphereGeometry(0.0045, 12, 12), reticleMat);
    frontFiberDot.position.set(0, 0.080, -0.75);

    const shotgunReflex = buildDetailedOptic('reflex', 0.082, 0.01, darkMetal, gunMetal, accentMat, glassMat, redReticleMat);
    activeOptic = shotgunReflex;
    opticCenterY = 0.082 + 0.038;
    opticCenterZ = 0.01;

    // Sliding Cylindrical Ribbed Corncob Pump Forend (`boltMesh` so it pumps on each shot!)
    boltMesh = new THREE.Group();
    const pumpCore = new THREE.Mesh(new THREE.CylinderGeometry(0.034, 0.034, 0.25, 22), polymerMat);
    pumpCore.rotation.x = Math.PI / 2;
    boltMesh.add(pumpCore);
    for (let r = 0; r < 6; r++) {
      const ribRing = new THREE.Mesh(new THREE.TorusGeometry(0.035, 0.004, 8, 22), darkMetal);
      ribRing.position.set(0, 0, -0.10 + r * 0.04);
      boltMesh.add(ribRing);
    }
    const actionBar = new THREE.Mesh(roundedBox(0.056, 0.016, 0.34), chromeMetal);
    actionBar.position.set(0, 0.018, 0.10);
    boltMesh.add(actionBar);
    boltMesh.position.set(0, -0.012, -0.37);
    boltMesh.userData.baseZ = -0.37;

    // Side Saddle Shell Holder (`magMesh`) with 5 Detailed 12-Gauge Buckshot Shells (Crimson Hull + High Brass)
    magMesh = new THREE.Group();
    const saddlePlate = new THREE.Mesh(roundedBox(0.016, 0.074, 0.24), darkMetal);
    saddlePlate.position.set(0.046, 0.012, -0.02);
    magMesh.add(saddlePlate);
    const shellHullMat = new THREE.MeshStandardMaterial({ color: 0xb91c1c, roughness: 0.38, metalness: 0.15 });
    for (let s = 0; s < 5; s++) {
      const sz = -0.10 + s * 0.042;
      const shellHull = new THREE.Mesh(new THREE.CylinderGeometry(0.0105, 0.0105, 0.058, 16), shellHullMat);
      shellHull.position.set(0.056, 0.006, sz);
      const shellBrass = new THREE.Mesh(new THREE.CylinderGeometry(0.0112, 0.0112, 0.022, 16), brassMat);
      shellBrass.position.set(0.056, 0.034, sz);
      magMesh.add(shellHull, shellBrass);
    }
    magMesh.position.set(0, -0.005, 0.01);
    magMesh.userData.basePos = magMesh.position.clone();

    // Tactical Collapsible Pistol-Grip Shotgun Stock
    const stockTube = new THREE.Mesh(new THREE.CylinderGeometry(0.020, 0.020, 0.28, 18), darkMetal);
    stockTube.rotation.x = Math.PI / 2 - 0.10;
    stockTube.position.set(0, 0.002, 0.32);
    const stockComb = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.036, 0.22, 18), polymerMat);
    stockComb.rotation.x = Math.PI / 2 - 0.08;
    stockComb.scale.set(0.85, 1.35, 1);
    stockComb.position.set(0, -0.015, 0.36);
    const recoilPad = new THREE.Mesh(new THREE.CapsuleGeometry(0.028, 0.078, 10, 18), darkMetal);
    recoilPad.scale.set(1.0, 1, 0.48);
    recoilPad.position.set(0, -0.022, 0.47);

    const gripAsm = buildErgonomicGripAndTrigger(-0.042, 0.16, polymerMat, darkMetal, chromeMetal);

    group.add(
      receiverLow,
      receiverCrown,
      topRail,
      barrelTop,
      heatshield,
      magTube,
      magCap,
      barrelClamp,
      breacherChoke,
      muzzleBore,
      frontSightPost,
      frontFiberDot,
      shotgunReflex,
      boltMesh,
      magMesh,
      stockTube,
      stockComb,
      recoilPad,
      gripAsm
    );
    muzzleZ = -0.88;
  } else if (weaponId === 'sniper') {
    // ==================== AWP-PHANTOM (ACCURACY INTERNATIONAL AWSM .338 LAPUA MAGNUM) ====================
    // Iconic Olive-Drab Polymer Thumbhole Chassis + Machined Steel Action Receiver
    const chassisForend = new THREE.Mesh(roundedBox(0.080, 0.090, 0.68), oliveChassisMat);
    chassisForend.position.set(0, -0.008, -0.08);
    const chassisBevel = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.042, 0.68, 18), oliveChassisMat);
    chassisBevel.rotation.x = Math.PI / 2;
    chassisBevel.scale.set(0.98, 1, 0.55);
    chassisBevel.position.set(0, -0.048, -0.08);

    const steelAction = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.036, 0.34, 20), darkMetal);
    steelAction.rotation.x = Math.PI / 2;
    steelAction.position.set(0, 0.042, 0.02);

    // Thumbhole Buttstock + Adjustable Cheekpiece + Monopod Rear Spike
    const stockRear = new THREE.Mesh(roundedBox(0.074, 0.116, 0.32), oliveChassisMat);
    stockRear.position.set(0, -0.012, 0.42);
    const thumbholeBridge = new THREE.Mesh(roundedBox(0.068, 0.032, 0.14), oliveChassisMat);
    thumbholeBridge.position.set(0, -0.086, 0.25);
    const cheekRest = new THREE.Mesh(
      new THREE.CylinderGeometry(0.038, 0.038, 0.21, 20, 1, false, -Math.PI * 0.5, Math.PI),
      polymerMat
    );
    cheekRest.rotation.x = Math.PI / 2;
    cheekRest.position.set(0, 0.056, 0.39);
    const buttSpacer = new THREE.Mesh(new THREE.CapsuleGeometry(0.032, 0.082, 10, 18), darkMetal);
    buttSpacer.scale.set(1.05, 1, 0.52);
    buttSpacer.position.set(0, -0.015, 0.59);
    const rearMonopod = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.013, 0.095, 16), gunMetal);
    rearMonopod.position.set(0, -0.092, 0.51);
    const monopodFoot = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.020, 0.018, 16), darkMetal);
    monopodFoot.position.set(0, -0.142, 0.51);

    const gripAsm = buildErgonomicGripAndTrigger(-0.046, 0.18, oliveChassisMat, darkMetal, chromeMetal);

    // Free-Floating Heavy Fluted .338 Match Barrel + Dual-Chamber Arrowhead Muzzle Brake + Bore
    const heavyBarrel = new THREE.Mesh(new THREE.CylinderGeometry(0.019, 0.026, 0.86, 18), gunMetal);
    heavyBarrel.rotation.x = Math.PI / 2;
    heavyBarrel.position.set(0, 0.042, -0.72);

    const fluteL = new THREE.Mesh(roundedBox(0.005, 0.007, 0.66), darkMetal);
    fluteL.position.set(-0.021, 0.042, -0.70);
    const fluteR = new THREE.Mesh(roundedBox(0.005, 0.007, 0.66), darkMetal);
    fluteR.position.set(0.021, 0.042, -0.70);
    const fluteTop = new THREE.Mesh(roundedBox(0.007, 0.005, 0.66), darkMetal);
    fluteTop.position.set(0, 0.063, -0.70);

    const muzzleBrake = new THREE.Mesh(roundedBox(0.068, 0.048, 0.115), darkMetal);
    muzzleBrake.position.set(0, 0.042, -1.16);
    const brakeBaffle1 = new THREE.Mesh(roundedBox(0.072, 0.028, 0.022), boreHoleMat);
    brakeBaffle1.position.set(0, 0.042, -1.14);
    const brakeBaffle2 = new THREE.Mesh(roundedBox(0.072, 0.028, 0.022), boreHoleMat);
    brakeBaffle2.position.set(0, 0.042, -1.18);
    const muzzleBore = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.018, 16), boreHoleMat);
    muzzleBore.rotation.x = Math.PI / 2;
    muzzleBore.position.set(0, 0.042, -1.218);

    // Folding Parker-Hale Tactical Bipod under Forend
    const bipodMount = new THREE.Mesh(roundedBox(0.062, 0.038, 0.055), darkMetal);
    bipodMount.position.set(0, -0.052, -0.40);
    for (const side of [-1, 1]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.010, 0.010, 0.29, 16), gunMetal);
      leg.rotation.x = Math.PI / 2;
      leg.position.set(side * 0.044, -0.058, -0.52);
      const spring = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.09, 16), chromeMetal);
      spring.rotation.x = Math.PI / 2;
      spring.position.set(side * 0.044, -0.058, -0.46);
      group.add(leg, spring);
    }

    // Schmidt & Bender PM II 5-25x56 High-Power Telescopic Scope with Dual Rings, Sunshade & 3 Knurled Turrets
    const scopeRail = buildPicatinnyRail(0.28, 0.080, -0.04, darkMetal, 9);
    const ringFront = new THREE.Mesh(new THREE.TorusGeometry(0.030, 0.008, 8, 18), darkMetal);
    ringFront.position.set(0, 0.135, -0.14);
    const ringRear = new THREE.Mesh(new THREE.TorusGeometry(0.030, 0.008, 8, 18), darkMetal);
    ringRear.position.set(0, 0.135, 0.03);
    const mountBridge = new THREE.Mesh(roundedBox(0.042, 0.042, 0.22), darkMetal);
    mountBridge.position.set(0, 0.098, -0.055);

    const scopeTube = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.38, 18), darkMetal);
    scopeTube.rotation.x = Math.PI / 2;
    scopeTube.position.set(0, 0.135, -0.06);

    const objectiveBell = new THREE.Mesh(new THREE.CylinderGeometry(0.044, 0.026, 0.15, 20), darkMetal);
    objectiveBell.rotation.x = Math.PI / 2;
    objectiveBell.position.set(0, 0.135, -0.29);

    const objSunshade = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.065, 20, 1, true), gunMetal);
    objSunshade.rotation.x = Math.PI / 2;
    objSunshade.position.set(0, 0.135, -0.38);

    const ocularBell = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.036, 0.11, 18), darkMetal);
    ocularBell.rotation.x = Math.PI / 2;
    ocularBell.position.set(0, 0.135, 0.14);

    const coatedScopeLensMat = new THREE.MeshStandardMaterial({
      color: 0x0ea5e9,
      emissive: 0x0284c7,
      emissiveIntensity: 0.22,
      roughness: 0.08,
      metalness: 0.92,
      side: THREE.DoubleSide
    });
    const lensFront = new THREE.Mesh(new THREE.CircleGeometry(0.041, 18), coatedScopeLensMat);
    lensFront.position.set(0, 0.135, -0.36);
    const lensRear = new THREE.Mesh(new THREE.CircleGeometry(0.033, 18), coatedScopeLensMat);
    lensRear.position.set(0, 0.135, 0.196);

    const elevTurret = new THREE.Mesh(new THREE.CylinderGeometry(0.017, 0.017, 0.034, 16), gunMetal);
    elevTurret.position.set(0, 0.172, -0.05);
    const windTurret = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.030, 16), gunMetal);
    windTurret.rotation.z = Math.PI / 2;
    windTurret.position.set(0.036, 0.135, -0.05);
    const parallaxTurret = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.028, 16), gunMetal);
    parallaxTurret.rotation.z = Math.PI / 2;
    parallaxTurret.position.set(-0.035, 0.135, -0.05);

    opticCenterY = 0.135;
    opticCenterZ = 0.04;

    // 5-Round Detachable Steel Box Magazine (`magMesh`)
    magMesh = new THREE.Group();
    const sMagBody = new THREE.Mesh(roundedBox(0.058, 0.155, 0.145), gunMetal);
    const sMagBase = new THREE.Mesh(roundedBox(0.064, 0.024, 0.152), darkMetal);
    sMagBase.position.set(0, -0.082, 0);
    magMesh.add(sMagBody, sMagBase);
    magMesh.position.set(0, -0.105, -0.06);
    magMesh.userData.basePos = magMesh.position.clone();

    // Fluted Bolt Carrier & Bent Tactical Bolt Handle (`boltMesh`)
    boltMesh = new THREE.Group();
    const boltBody = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.16, 16), chromeMetal);
    boltBody.rotation.x = Math.PI / 2;
    boltBody.position.set(0.018, 0, 0);
    const boltStem = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.058, 16), gunMetal);
    boltStem.rotation.z = Math.PI / 2 + 0.35;
    boltStem.position.set(0.044, -0.01, 0.04);
    const boltKnob = new THREE.Mesh(new THREE.SphereGeometry(0.018, 12, 10), darkMetal);
    boltKnob.position.set(0.068, -0.022, 0.04);
    boltMesh.add(boltBody, boltStem, boltKnob);
    boltMesh.position.set(0, 0.042, 0.04);
    boltMesh.userData.baseZ = 0.04;

    group.add(
      chassisForend,
      chassisBevel,
      steelAction,
      stockRear,
      thumbholeBridge,
      cheekRest,
      buttSpacer,
      rearMonopod,
      monopodFoot,
      gripAsm,
      heavyBarrel,
      fluteL,
      fluteR,
      fluteTop,
      muzzleBrake,
      brakeBaffle1,
      brakeBaffle2,
      muzzleBore,
      bipodMount,
      scopeRail,
      ringFront,
      ringRear,
      mountBridge,
      scopeTube,
      objectiveBell,
      objSunshade,
      ocularBell,
      lensFront,
      lensRear,
      elevTurret,
      windTurret,
      parallaxTurret,
      magMesh,
      boltMesh
    );
    muzzleZ = -1.24;
  }

  return { magMesh, boltMesh, activeOptic, opticCenterY, opticCenterZ, muzzleZ };
}
