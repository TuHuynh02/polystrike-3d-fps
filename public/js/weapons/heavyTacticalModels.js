import * as THREE from '../three.js';
import { roundedBox } from './roundedBox.js';
import {
  WEAPON_MAT_CACHE,
  buildDetailedOptic,
  buildErgonomicGripAndTrigger,
  buildFoldingIronSight,
  buildPerforatedOctagonalHandguard,
  buildPicatinnyRail,
  buildTacticalWeaponLight,
  createChamferedBlockGeometry,
  createLoftedTubeGeometry,
  createSteppedBarrelGeometry,
  getSaltlineRollmarkMaterial
} from './weaponMaterials.js';

export function buildHeavyTacticalGeometry(weaponId, group, mats) {
  const {
    darkMetal,
    gunMetal,
    polymerMat,
    fdePolymerMat,
    fdeAnodizedMat,
    oliveChassisMat,
    chromeMetal,
    brassMat,
    copperMat,
    boreHoleMat,
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
    // ==================== VECTOR-KRISS GEN II (.45 ACP DELAYED-BLOWBACK SMG) ====================
    // Chamfered Billet Upper Receiver Housing (width 0.070 -> x in [-0.035, +0.035])
    const upperRailReceiver = new THREE.Mesh(
      createChamferedBlockGeometry(0.070, 0.062, 0.43, 0.014, 0.014, 0.006, 0.006),
      darkMetal
    );
    upperRailReceiver.position.set(0, 0.042, -0.05);

    const topRail = buildPicatinnyRail(0.40, 0.078, -0.05, gunMetal, 13);
    const frontBuis = buildFoldingIronSight(0.085, -0.23, darkMetal, gunMetal);
    const rearBuis = buildFoldingIronSight(0.085, 0.13, darkMetal, gunMetal);

    // Iconic Angled Kriss Super-V Delayed-Blowback Lower Chassis in Military FDE Polymer
    const superVHousing = new THREE.Mesh(
      createChamferedBlockGeometry(0.068, 0.172, 0.132, 0.010, 0.012, 0.010, 0.012),
      fdePolymerMat
    );
    superVHousing.position.set(0, -0.048, -0.18);
    superVHousing.rotation.x = 0.22;

    // Recessed molded grip-panel inserts on Super-V magwell housing
    const superVInsertL = new THREE.Mesh(roundedBox(0.004, 0.098, 0.058, 0.001, 1), polymerMat);
    superVInsertL.position.set(-0.0335, -0.046, -0.18);
    superVInsertL.rotation.x = 0.22;
    const superVInsertR = new THREE.Mesh(roundedBox(0.004, 0.098, 0.058, 0.001, 1), polymerMat);
    superVInsertR.position.set(0.0335, -0.046, -0.18);
    superVInsertR.rotation.x = 0.22;

    // Integrated Vector Trigger-Guard Bridge & Lofted Ergonomic Pistol Grip
    const handBridge = new THREE.Mesh(
      createChamferedBlockGeometry(0.052, 0.024, 0.175, 0.008, 0.005, 0.008, 0.005),
      polymerMat
    );
    handBridge.position.set(0, -0.106, -0.052);
    handBridge.rotation.x = 0.14;

    const gripAsm = buildErgonomicGripAndTrigger(-0.022, 0.046, polymerMat, darkMetal, chromeMetal);

    // Octagonal Ventilated M-LOK Forend Shroud + Lathe Fluted Linear Compensator & .45 Bore
    const noseShroud = buildPerforatedOctagonalHandguard(0.031, 0.15, 2, gunMetal, darkMetal);
    noseShroud.position.set(0, 0.022, -0.325);

    const barrelComp = new THREE.Mesh(
      createSteppedBarrelGeometry(
        [
          [-0.24, 0.016],
          [-0.39, 0.016],
          [-0.40, 0.023],
          [-0.455, 0.023],
          [-0.462, 0.019]
        ],
        18
      ),
      darkMetal
    );
    barrelComp.position.set(0, 0.022, 0);

    const muzzleBore = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.012, 16), boreHoleMat);
    muzzleBore.rotation.x = Math.PI / 2;
    muzzleBore.position.set(0, 0.022, -0.460);

    // Side-Folding Skeletal Polymer/Aluminum Buttstock
    const stockHinge = new THREE.Mesh(
      createChamferedBlockGeometry(0.048, 0.068, 0.042, 0.008, 0.008, 0.008, 0.008),
      darkMetal
    );
    stockHinge.position.set(0, 0.028, 0.18);

    const stockStrutTop = new THREE.Mesh(
      createLoftedTubeGeometry(
        [
          { x: 0, y: 0.048, z: 0.195, rx: 0.014, ry: 0.013 },
          { x: 0, y: 0.044, z: 0.300, rx: 0.013, ry: 0.012 },
          { x: 0, y: 0.038, z: 0.395, rx: 0.014, ry: 0.014 }
        ],
        10,
        true
      ),
      polymerMat
    );
    const stockStrutBot = new THREE.Mesh(
      createLoftedTubeGeometry(
        [
          { x: 0, y: 0.004, z: 0.195, rx: 0.011, ry: 0.010 },
          { x: 0, y: -0.012, z: 0.300, rx: 0.010, ry: 0.010 },
          { x: 0, y: -0.022, z: 0.395, rx: 0.012, ry: 0.012 }
        ],
        10,
        true
      ),
      polymerMat
    );
    const stockButt = new THREE.Mesh(roundedBox(0.048, 0.112, 0.022, 0.006, 1), darkMetal);
    stockButt.position.set(0, 0.008, 0.405);

    // Extended 33-Round Angled .45 ACP Kriss MagEx2
    magMesh = new THREE.Group();
    const magStick = new THREE.Mesh(
      createChamferedBlockGeometry(0.042, 0.25, 0.058, 0.005, 0.005, 0.005, 0.005),
      polymerMat
    );
    const magExtension = new THREE.Mesh(
      createChamferedBlockGeometry(0.050, 0.076, 0.068, 0.006, 0.006, 0.006, 0.006),
      fdePolymerMat
    );
    magExtension.position.set(0, -0.10, 0);
    const magBasePad = new THREE.Mesh(roundedBox(0.054, 0.016, 0.074, 0.003, 1), darkMetal);
    magBasePad.position.set(0, -0.142, 0);
    magMesh.add(magStick, magExtension, magBasePad);
    magMesh.position.set(0, -0.175, -0.205);
    magMesh.rotation.x = 0.22;
    magMesh.userData.basePos = magMesh.position.clone();

    // Right-Side Ejection Bolt Block & Forward Folding Charging Handle (kept at z = -0.22 clear of rollmark!)
    boltMesh = new THREE.Group();
    const ejectionBlock = new THREE.Mesh(roundedBox(0.016, 0.026, 0.086, 0.002, 1), chromeMetal);
    ejectionBlock.position.set(0.028, 0, 0);
    const chargeLatch = new THREE.Mesh(roundedBox(0.028, 0.012, 0.020, 0.002, 1), chromeMetal);
    chargeLatch.position.set(-0.040, 0.004, -0.12);
    boltMesh.add(ejectionBlock, chargeLatch);
    boltMesh.position.set(0, 0.042, -0.10);
    boltMesh.userData.baseZ = -0.10;

    const holoSight = buildDetailedOptic('holo', 0.086, -0.02, darkMetal, gunMetal, null, glassMat, redReticleMat);
    activeOptic = holoSight;
    opticCenterY = 0.086 + 0.038;
    opticCenterZ = -0.02;

    const smgWml = buildTacticalWeaponLight(0.046, 0.038, -0.22, darkMetal, gunMetal, chromeMetal);
    const smgRollmark = new THREE.Mesh(new THREE.PlaneGeometry(0.070, 0.018), getSaltlineRollmarkMaterial());
    smgRollmark.rotation.y = -Math.PI / 2;
    smgRollmark.position.set(-0.0365, 0.040, -0.05);

    group.add(
      upperRailReceiver,
      topRail,
      frontBuis,
      rearBuis,
      superVHousing,
      superVInsertL,
      superVInsertR,
      handBridge,
      gripAsm,
      noseShroud,
      barrelComp,
      muzzleBore,
      stockHinge,
      stockStrutTop,
      stockStrutBot,
      stockButt,
      magMesh,
      boltMesh,
      holoSight,
      smgWml,
      smgRollmark
    );
    muzzleZ = -0.47;
  } else if (weaponId === 'lmg') {
    // ==================== ODIN-M249 (FN MK48 / M249 SAW PARA SQUAD AUTOMATIC WEAPON) ====================
    // Stamped & Welded Steel Receiver Hull (width 0.098 -> x in [-0.049, +0.049])
    const receiverBox = new THREE.Mesh(
      createChamferedBlockGeometry(0.098, 0.108, 0.52, 0.012, 0.012, 0.010, 0.012),
      darkMetal
    );
    receiverBox.position.set(0, 0.016, -0.04);

    // Lower stamped receiver reinforcement rails positioned at y = -0.012 (strictly below rollmark y in [0.035..0.057])
    for (const side of [-1, 1]) {
      const rib = new THREE.Mesh(roundedBox(0.006, 0.020, 0.44, 0.002, 1), gunMetal);
      rib.position.set(side * 0.050, -0.012, -0.04);
      group.add(rib);
    }

    // Chamfered Top Feed-Tray Cover + Integral M1913 Optic Rail
    const feedCover = new THREE.Mesh(
      createChamferedBlockGeometry(0.088, 0.038, 0.34, 0.022, 0.018, 0.004, 0.004),
      gunMetal
    );
    feedCover.position.set(0, 0.084, 0.01);
    const feedRail = buildPicatinnyRail(0.30, 0.108, 0.01, darkMetal, 10);

    // Ventilated Open-Slot Barrel Heatshield & Railed Polymer Lower Handguard
    const heatshield = buildPerforatedOctagonalHandguard(0.042, 0.34, 4, gunMetal, darkMetal);
    heatshield.position.set(0, 0.034, -0.46);

    const lowerForend = new THREE.Mesh(
      createChamferedBlockGeometry(0.084, 0.054, 0.36, 0.008, 0.008, 0.016, 0.016),
      polymerMat
    );
    lowerForend.position.set(0, -0.016, -0.45);

    // Lathe Heavy Quick-Change Barrel + Gas Regulator Cylinder + Compensator + Bore
    const heavyBarrel = new THREE.Mesh(
      createSteppedBarrelGeometry(
        [
          [-0.28, 0.022],
          [-0.64, 0.020],
          [-0.86, 0.0185],
          [-0.875, 0.025],
          [-0.955, 0.024],
          [-0.962, 0.020]
        ],
        20
      ),
      darkMetal
    );
    heavyBarrel.position.set(0, 0.034, 0);

    const gasCylinder = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.017, 0.44, 16), gunMetal);
    gasCylinder.rotation.x = Math.PI / 2;
    gasCylinder.position.set(0, -0.010, -0.60);

    // Side-Offset Quick-Change Barrel Carry Handle (clear of center ADS sightline)
    const carryStem = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.042, 10), gunMetal);
    carryStem.rotation.z = -0.65;
    carryStem.position.set(0.044, 0.072, -0.28);
    const carryGrip = new THREE.Mesh(
      createLoftedTubeGeometry(
        [
          { x: 0.056, y: 0.088, z: -0.24, rx: 0.013, ry: 0.013 },
          { x: 0.062, y: 0.090, z: -0.29, rx: 0.015, ry: 0.015 },
          { x: 0.056, y: 0.088, z: -0.34, rx: 0.013, ry: 0.013 }
        ],
        10,
        true
      ),
      polymerMat
    );

    const muzzleBore = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.014, 16), boreHoleMat);
    muzzleBore.rotation.x = Math.PI / 2;
    muzzleBore.position.set(0, 0.034, -0.960);

    // Folded Titanium Bipod Legs with Perforated Feet
    for (const side of [-1, 1]) {
      const bipodLeg = new THREE.Mesh(new THREE.CylinderGeometry(0.0085, 0.0095, 0.34, 14), chromeMetal);
      bipodLeg.rotation.x = Math.PI / 2;
      bipodLeg.position.set(side * 0.046, -0.046, -0.52);
      const bipodFoot = new THREE.Mesh(roundedBox(0.022, 0.026, 0.014, 0.003, 1), darkMetal);
      bipodFoot.position.set(side * 0.046, -0.046, -0.35);
      group.add(bipodLeg, bipodFoot);
    }

    // Para Dual-Rail Telescoping Buttstock + Rotating Shoulder Rest
    const rodTop = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.28, 14), gunMetal);
    rodTop.rotation.x = Math.PI / 2;
    rodTop.position.set(0, 0.038, 0.34);
    const rodBot = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.28, 14), gunMetal);
    rodBot.rotation.x = Math.PI / 2;
    rodBot.position.set(0, -0.028, 0.34);
    const stockBlock = new THREE.Mesh(
      createChamferedBlockGeometry(0.056, 0.122, 0.046, 0.010, 0.014, 0.010, 0.014),
      polymerMat
    );
    stockBlock.position.set(0, 0.004, 0.475);

    const gripAsm = buildErgonomicGripAndTrigger(-0.048, 0.12, polymerMat, darkMetal, chromeMetal);

    // 100-Round Olive Cordura Assault Box Drum + Disintegrating 5.56mm Linked Brass Belt
    magMesh = new THREE.Group();
    const drumBox = new THREE.Mesh(
      createChamferedBlockGeometry(0.148, 0.184, 0.148, 0.018, 0.016, 0.028, 0.028),
      oliveChassisMat
    );
    const drumStrap = new THREE.Mesh(roundedBox(0.152, 0.032, 0.152, 0.004, 1), darkMetal);
    drumStrap.position.set(0, 0.042, 0);
    magMesh.add(drumBox, drumStrap);

    for (let c = 0; c < 6; c++) {
      const cx = -0.072 + c * 0.011;
      const cy = 0.104 + c * 0.017;
      const cart = new THREE.Mesh(new THREE.CylinderGeometry(0.0072, 0.0082, 0.048, 12), brassMat);
      cart.rotation.x = Math.PI / 2;
      cart.position.set(cx, cy, 0.016);
      const bulletTip = new THREE.Mesh(new THREE.ConeGeometry(0.0070, 0.022, 10), copperMat);
      bulletTip.rotation.x = -Math.PI / 2;
      bulletTip.position.set(cx, cy, -0.018);
      const link = new THREE.Mesh(new THREE.CylinderGeometry(0.0090, 0.0090, 0.020, 12), darkMetal);
      link.rotation.x = Math.PI / 2;
      link.position.set(cx, cy, 0.014);
      magMesh.add(cart, bulletTip, link);
    }
    magMesh.position.set(0, -0.145, -0.13);
    magMesh.userData.basePos = magMesh.position.clone();

    // Right-Side Non-Reciprocating Charging Slide & Bolt Carrier (on +X so -X rollmark is 100% clear)
    boltMesh = new THREE.Group();
    const boltPlate = new THREE.Mesh(roundedBox(0.018, 0.032, 0.118, 0.002, 1), chromeMetal);
    boltPlate.position.set(0.044, 0, 0);
    const chargeKnob = new THREE.Mesh(roundedBox(0.026, 0.022, 0.032, 0.004, 1), darkMetal);
    chargeKnob.position.set(0.058, -0.004, -0.03);
    boltMesh.add(boltPlate, chargeKnob);
    boltMesh.position.set(0, 0.038, -0.06);
    boltMesh.userData.baseZ = -0.06;

    const lmgHoloSight = buildDetailedOptic('holo', 0.114, 0.01, darkMetal, gunMetal, null, glassMat, redReticleMat);
    activeOptic = lmgHoloSight;
    opticCenterY = 0.114 + 0.038;
    opticCenterZ = 0.01;

    const lmgWml = buildTacticalWeaponLight(0.056, 0.026, -0.44, darkMetal, gunMetal, chromeMetal);
    const lmgRollmark = new THREE.Mesh(new THREE.PlaneGeometry(0.090, 0.022), getSaltlineRollmarkMaterial());
    lmgRollmark.rotation.y = -Math.PI / 2;
    lmgRollmark.position.set(-0.0505, 0.046, -0.05);

    group.add(
      receiverBox,
      feedCover,
      feedRail,
      heatshield,
      lowerForend,
      heavyBarrel,
      gasCylinder,
      carryStem,
      carryGrip,
      muzzleBore,
      rodTop,
      rodBot,
      stockBlock,
      gripAsm,
      magMesh,
      boltMesh,
      lmgHoloSight,
      lmgWml,
      lmgRollmark
    );
    muzzleZ = -0.98;
  } else if (weaponId === 'shotgun') {
    // ==================== BUCKSHOT-8 (BENELLI M4 / M1014 JOINT SERVICE COMBAT SHOTGUN) ====================
    // CNC Chamfered Billet Shotgun Receiver (width 0.076 -> x in [-0.038, +0.038])
    const receiverBody = new THREE.Mesh(
      createChamferedBlockGeometry(0.076, 0.092, 0.44, 0.018, 0.022, 0.008, 0.008),
      darkMetal
    );
    receiverBody.position.set(0, 0.018, -0.02);

    const topRail = buildPicatinnyRail(0.28, 0.070, -0.01, gunMetal, 9);

    // Lathe 18.5" Heavy Combat Barrel + Stand-Off Breacher Choke + 7-Round Titanium Mag Tube + ARGO Pistons
    const barrelTop = new THREE.Mesh(
      createSteppedBarrelGeometry(
        [
          [-0.22, 0.0215],
          [-0.48, 0.0195],
          [-0.78, 0.0190],
          [-0.79, 0.0245],
          [-0.855, 0.0245],
          [-0.862, 0.0205]
        ],
        20
      ),
      gunMetal
    );
    barrelTop.position.set(0, 0.042, 0);

    const magTube = new THREE.Mesh(new THREE.CylinderGeometry(0.0185, 0.0185, 0.58, 20), darkMetal);
    magTube.rotation.x = Math.PI / 2;
    magTube.position.set(0, -0.006, -0.49);

    const magCap = new THREE.Mesh(new THREE.CylinderGeometry(0.021, 0.021, 0.034, 18), chromeMetal);
    magCap.rotation.x = Math.PI / 2;
    magCap.position.set(0, -0.006, -0.79);

    // Twin Benelli ARGO Dual Auto-Regulating Gas Cylinders
    for (const side of [-1, 1]) {
      const argoCyl = new THREE.Mesh(new THREE.CylinderGeometry(0.0085, 0.0085, 0.11, 12), chromeMetal);
      argoCyl.rotation.x = Math.PI / 2;
      argoCyl.position.set(side * 0.016, 0.018, -0.34);
      group.add(argoCyl);
    }

    const barrelClamp = new THREE.Mesh(
      createChamferedBlockGeometry(0.046, 0.080, 0.036, 0.008, 0.008, 0.008, 0.008),
      darkMetal
    );
    barrelClamp.position.set(0, 0.018, -0.68);

    const muzzleBore = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.014, 18), boreHoleMat);
    muzzleBore.rotation.x = Math.PI / 2;
    muzzleBore.position.set(0, 0.042, -0.860);

    // Low-Profile Winged Ghost-Ring Front Sight Tower (kept strictly below y = 0.078 clear of ADS 0.120)
    const frontSightPost = new THREE.Mesh(
      createChamferedBlockGeometry(0.020, 0.022, 0.026, 0.004, 0.005, 0.003, 0.003),
      darkMetal
    );
    frontSightPost.position.set(0, 0.064, -0.76);

    const shotgunReflex = buildDetailedOptic('reflex', 0.082, 0.01, darkMetal, gunMetal, null, glassMat, redReticleMat);
    activeOptic = shotgunReflex;
    opticCenterY = 0.082 + 0.038;
    opticCenterZ = 0.01;

    const sgWml = buildTacticalWeaponLight(0.040, 0.018, -0.63, darkMetal, gunMetal, chromeMetal);
    const sgRollmark = new THREE.Mesh(new THREE.PlaneGeometry(0.076, 0.018), getSaltlineRollmarkMaterial());
    sgRollmark.rotation.y = -Math.PI / 2;
    sgRollmark.position.set(-0.0395, 0.014, -0.02);

    // Contoured Two-Piece M1014 Ribbed Polymer Forend & Action Bars (`boltMesh`)
    boltMesh = new THREE.Group();
    const pumpCore = new THREE.Mesh(
      createLoftedTubeGeometry(
        [
          { x: 0, y: 0.002, z: 0.12, rx: 0.031, ry: 0.028 },
          { x: 0, y: -0.002, z: 0.02, rx: 0.036, ry: 0.032 },
          { x: 0, y: -0.002, z: -0.07, rx: 0.035, ry: 0.031 },
          { x: 0, y: 0.002, z: -0.13, rx: 0.029, ry: 0.026 }
        ],
        14,
        true
      ),
      polymerMat
    );
    boltMesh.add(pumpCore);
    for (let r = 0; r < 5; r++) {
      const ribRing = new THREE.Mesh(roundedBox(0.073, 0.044, 0.012, 0.003, 1), darkMetal);
      ribRing.position.set(0, -0.004, -0.08 + r * 0.04);
      boltMesh.add(ribRing);
    }
    const actionBar = new THREE.Mesh(roundedBox(0.054, 0.014, 0.30, 0.002, 1), chromeMetal);
    actionBar.position.set(0, 0.020, 0.14);
    boltMesh.add(actionBar);
    boltMesh.position.set(0, -0.010, -0.38);
    boltMesh.userData.baseZ = -0.38;

    // Right-Side 5-Shell Aluminum Carrier (`magMesh`) with Matte Burgundy 12-Gauge Hulls + High Brass
    magMesh = new THREE.Group();
    const saddlePlate = new THREE.Mesh(roundedBox(0.014, 0.068, 0.23, 0.003, 1), darkMetal);
    saddlePlate.position.set(0.044, 0.014, -0.02);
    magMesh.add(saddlePlate);

    let shellHullMat = WEAPON_MAT_CACHE.get('shared_shellHull');
    if (!shellHullMat) {
      shellHullMat = new THREE.MeshStandardMaterial({ color: 0x7f1d1d, roughness: 0.48, metalness: 0.12 });
      shellHullMat.userData = { shared: true };
      WEAPON_MAT_CACHE.set('shared_shellHull', shellHullMat);
    }
    for (let s = 0; s < 5; s++) {
      const sz = -0.10 + s * 0.042;
      const shellHull = new THREE.Mesh(new THREE.CylinderGeometry(0.0102, 0.0102, 0.056, 14), shellHullMat);
      shellHull.position.set(0.054, 0.008, sz);
      const shellBrass = new THREE.Mesh(new THREE.CylinderGeometry(0.0108, 0.0108, 0.020, 14), brassMat);
      shellBrass.position.set(0.054, 0.034, sz);
      magMesh.add(shellHull, shellBrass);
    }
    magMesh.position.set(0, -0.004, 0.01);
    magMesh.userData.basePos = magMesh.position.clone();

    // M1014 Collapsible Telescoping Recoil Tube + Molded Cheek Riser + Thick Rubber Recoil Pad
    const stockTube = new THREE.Mesh(new THREE.CylinderGeometry(0.019, 0.019, 0.28, 16), gunMetal);
    stockTube.rotation.x = Math.PI / 2 - 0.10;
    stockTube.position.set(0, 0.004, 0.32);

    const stockComb = new THREE.Mesh(
      createLoftedTubeGeometry(
        [
          { x: 0, y: 0.006, z: 0.26, rx: 0.026, ry: 0.032 },
          { x: 0, y: -0.006, z: 0.36, rx: 0.028, ry: 0.042 },
          { x: 0, y: -0.018, z: 0.45, rx: 0.029, ry: 0.054 }
        ],
        12,
        true
      ),
      polymerMat
    );
    const recoilPad = new THREE.Mesh(roundedBox(0.054, 0.116, 0.022, 0.006, 1), darkMetal);
    recoilPad.position.set(0, -0.020, 0.465);

    const gripAsm = buildErgonomicGripAndTrigger(-0.038, 0.16, polymerMat, darkMetal, chromeMetal);

    group.add(
      receiverBody,
      topRail,
      barrelTop,
      magTube,
      magCap,
      barrelClamp,
      muzzleBore,
      frontSightPost,
      shotgunReflex,
      sgWml,
      sgRollmark,
      boltMesh,
      magMesh,
      stockTube,
      stockComb,
      recoilPad,
      gripAsm
    );
    muzzleZ = -0.88;
  } else if (weaponId === 'sniper') {
    // ==================== AWP-PHANTOM (ACCURACY INTERNATIONAL AXMC / AWSM .338 LAPUA) ====================
    // Bonded Aluminum & OD-Green Polymer Chassis Receiver (width 0.078 -> x in [-0.039, +0.039])
    const chassisForend = new THREE.Mesh(
      createChamferedBlockGeometry(0.078, 0.086, 0.62, 0.010, 0.010, 0.016, 0.020),
      oliveChassisMat
    );
    chassisForend.position.set(0, -0.008, -0.06);

    // Open-Slot Octagonal KeySlot / M-LOK Sniper Forend Tube Revealing Free-Floated Heavy Barrel
    const octForendTube = buildPerforatedOctagonalHandguard(0.038, 0.30, 4, oliveChassisMat, darkMetal);
    octForendTube.position.set(0, 0.038, -0.50);

    // Flat-Sided CNC Machined Steel Action Receiver
    const steelAction = new THREE.Mesh(
      createChamferedBlockGeometry(0.068, 0.058, 0.34, 0.016, 0.018, 0.006, 0.006),
      darkMetal
    );
    steelAction.position.set(0, 0.044, 0.02);

    // Skeletal AI Thumbhole/Folding Buttstock + Adjustable Cheekpiece + Rear Elevation Monopod
    const stockRear = new THREE.Mesh(
      createChamferedBlockGeometry(0.072, 0.114, 0.31, 0.012, 0.014, 0.014, 0.018),
      oliveChassisMat
    );
    stockRear.position.set(0, -0.012, 0.42);
    const thumbholeBridge = new THREE.Mesh(roundedBox(0.064, 0.028, 0.14, 0.006, 1), oliveChassisMat);
    thumbholeBridge.position.set(0, -0.084, 0.25);

    const cheekRest = new THREE.Mesh(
      createChamferedBlockGeometry(0.066, 0.036, 0.20, 0.018, 0.018, 0.004, 0.004),
      polymerMat
    );
    cheekRest.position.set(0, 0.054, 0.39);
    const buttSpacer = new THREE.Mesh(roundedBox(0.064, 0.126, 0.026, 0.006, 1), darkMetal);
    buttSpacer.position.set(0, -0.014, 0.585);

    const rearMonopod = new THREE.Mesh(new THREE.CylinderGeometry(0.010, 0.012, 0.092, 14), gunMetal);
    rearMonopod.position.set(0, -0.090, 0.51);
    const monopodFoot = new THREE.Mesh(new THREE.CylinderGeometry(0.017, 0.019, 0.016, 14), darkMetal);
    monopodFoot.position.set(0, -0.140, 0.51);

    const gripAsm = buildErgonomicGripAndTrigger(-0.044, 0.18, oliveChassisMat, darkMetal, chromeMetal);

    // Lathe Free-Floating Heavy Fluted .338 Match Barrel + Dual-Chamber Tactical Muzzle Brake
    const heavyBarrel = new THREE.Mesh(
      createSteppedBarrelGeometry(
        [
          [-0.16, 0.025],
          [-0.42, 0.023],
          [-0.78, 0.021],
          [-1.10, 0.0195]
        ],
        20
      ),
      gunMetal
    );
    heavyBarrel.position.set(0, 0.042, 0);

    const fluteL = new THREE.Mesh(roundedBox(0.004, 0.006, 0.64, 0.001, 1), darkMetal);
    fluteL.position.set(-0.020, 0.042, -0.72);
    const fluteR = new THREE.Mesh(roundedBox(0.004, 0.006, 0.64, 0.001, 1), darkMetal);
    fluteR.position.set(0.020, 0.042, -0.72);
    const fluteTop = new THREE.Mesh(roundedBox(0.006, 0.004, 0.64, 0.001, 1), darkMetal);
    fluteTop.position.set(0, 0.062, -0.72);

    const muzzleBrake = new THREE.Mesh(
      createChamferedBlockGeometry(0.066, 0.046, 0.115, 0.010, 0.010, 0.010, 0.010),
      darkMetal
    );
    muzzleBrake.position.set(0, 0.042, -1.16);
    const brakeBaffle1 = new THREE.Mesh(roundedBox(0.070, 0.026, 0.022, 0.002, 1), boreHoleMat);
    brakeBaffle1.position.set(0, 0.042, -1.14);
    const brakeBaffle2 = new THREE.Mesh(roundedBox(0.070, 0.026, 0.022, 0.002, 1), boreHoleMat);
    brakeBaffle2.position.set(0, 0.042, -1.18);
    const muzzleBore = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.013, 0.016, 16), boreHoleMat);
    muzzleBore.rotation.x = Math.PI / 2;
    muzzleBore.position.set(0, 0.042, -1.218);

    // Folding Spigot Tactical Bipod
    const bipodMount = new THREE.Mesh(roundedBox(0.060, 0.034, 0.054, 0.004, 1), darkMetal);
    bipodMount.position.set(0, -0.048, -0.40);
    for (const side of [-1, 1]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.0095, 0.0095, 0.29, 14), gunMetal);
      leg.rotation.x = Math.PI / 2;
      leg.position.set(side * 0.044, -0.056, -0.52);
      const spring = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.013, 0.088, 14), chromeMetal);
      spring.rotation.x = Math.PI / 2;
      spring.position.set(side * 0.044, -0.056, -0.46);
      group.add(leg, spring);
    }

    // Schmidt & Bender PM II 5-25x56 Scope on Spuhr One-Piece ISMS Mount (Lathe Profile + Zero Neon Accents)
    const scopeRail = buildPicatinnyRail(0.28, 0.078, -0.04, darkMetal, 9);
    const mountBridge = new THREE.Mesh(
      createChamferedBlockGeometry(0.044, 0.038, 0.22, 0.008, 0.006, 0.006, 0.006),
      fdeAnodizedMat
    );
    mountBridge.position.set(0, 0.098, -0.055);
    const ringFront = new THREE.Mesh(new THREE.TorusGeometry(0.029, 0.0075, 8, 18), fdeAnodizedMat);
    ringFront.position.set(0, 0.135, -0.14);
    const ringRear = new THREE.Mesh(new THREE.TorusGeometry(0.029, 0.0075, 8, 18), fdeAnodizedMat);
    ringRear.position.set(0, 0.135, 0.03);

    const scopeHousing = new THREE.Mesh(
      createSteppedBarrelGeometry(
        [
          [0.195, 0.035],
          [0.145, 0.035],
          [0.085, 0.026],
          [-0.215, 0.026],
          [-0.295, 0.043],
          [-0.415, 0.044]
        ],
        22
      ),
      darkMetal
    );
    scopeHousing.position.set(0, 0.135, 0);

    let coatedScopeLensMat = WEAPON_MAT_CACHE.get('shared_coatedScopeLens');
    if (!coatedScopeLensMat) {
      coatedScopeLensMat = new THREE.MeshStandardMaterial({
        color: 0x0e7490,
        emissive: 0x0c4a6e,
        emissiveIntensity: 0.28,
        roughness: 0.08,
        metalness: 0.30,
        envMapIntensity: 1.85,
        side: THREE.DoubleSide
      });
      coatedScopeLensMat.userData = { shared: true };
      WEAPON_MAT_CACHE.set('shared_coatedScopeLens', coatedScopeLensMat);
    }
    const lensFront = new THREE.Mesh(new THREE.CircleGeometry(0.040, 20), coatedScopeLensMat);
    lensFront.rotation.y = Math.PI;
    lensFront.position.set(0, 0.135, -0.412);
    const lensRear = new THREE.Mesh(new THREE.CircleGeometry(0.032, 20), coatedScopeLensMat);
    lensRear.position.set(0, 0.135, 0.196);

    const elevTurret = new THREE.Mesh(new THREE.CylinderGeometry(0.017, 0.017, 0.034, 16), gunMetal);
    elevTurret.position.set(0, 0.172, -0.05);
    const windTurret = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.030, 16), gunMetal);
    windTurret.rotation.z = Math.PI / 2;
    windTurret.position.set(0.036, 0.135, -0.05);
    const parallaxTurret = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.028, 16), gunMetal);
    parallaxTurret.rotation.z = Math.PI / 2;
    parallaxTurret.position.set(-0.035, 0.135, -0.05);
    const throwLever = new THREE.Mesh(roundedBox(0.006, 0.026, 0.008, 0.0015, 1), gunMetal);
    throwLever.position.set(-0.028, 0.156, 0.09);
    throwLever.rotation.z = 0.55;

    const sniperRollmark = new THREE.Mesh(new THREE.PlaneGeometry(0.088, 0.020), getSaltlineRollmarkMaterial());
    sniperRollmark.rotation.y = -Math.PI / 2;
    sniperRollmark.position.set(-0.0405, -0.006, -0.06);

    opticCenterY = 0.135;
    opticCenterZ = 0.04;

    // 10-Round .338 Detachable Steel Box Magazine (`magMesh`)
    magMesh = new THREE.Group();
    const sMagBody = new THREE.Mesh(
      createChamferedBlockGeometry(0.056, 0.154, 0.144, 0.006, 0.006, 0.006, 0.006),
      gunMetal
    );
    const sMagBase = new THREE.Mesh(roundedBox(0.064, 0.024, 0.152, 0.004, 1), darkMetal);
    sMagBase.position.set(0, -0.082, 0);
    magMesh.add(sMagBody, sMagBase);
    magMesh.position.set(0, -0.105, -0.06);
    magMesh.userData.basePos = magMesh.position.clone();

    // Fluted Bolt Carrier & Bent Tactical Bolt Handle (`boltMesh`)
    boltMesh = new THREE.Group();
    const boltBody = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.16, 16), chromeMetal);
    boltBody.rotation.x = Math.PI / 2;
    boltBody.position.set(0.018, 0, 0);
    const boltStem = new THREE.Mesh(new THREE.CylinderGeometry(0.0065, 0.0065, 0.058, 14), gunMetal);
    boltStem.rotation.z = Math.PI / 2 + 0.35;
    boltStem.position.set(0.044, -0.01, 0.04);
    const boltKnob = new THREE.Mesh(new THREE.SphereGeometry(0.016, 12, 10), darkMetal);
    boltKnob.position.set(0.068, -0.022, 0.04);
    boltMesh.add(boltBody, boltStem, boltKnob);
    boltMesh.position.set(0, 0.044, 0.04);
    boltMesh.userData.baseZ = 0.04;

    group.add(
      chassisForend,
      octForendTube,
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
      mountBridge,
      ringFront,
      ringRear,
      scopeHousing,
      lensFront,
      lensRear,
      elevTurret,
      windTurret,
      parallaxTurret,
      throwLever,
      sniperRollmark,
      magMesh,
      boltMesh
    );
    muzzleZ = -1.24;
  }

  return { magMesh, boltMesh, activeOptic, opticCenterY, opticCenterZ, muzzleZ };
}
