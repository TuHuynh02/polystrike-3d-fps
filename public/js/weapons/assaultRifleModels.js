import * as THREE from '../three.js';
import { roundedBox } from './roundedBox.js';
import {
  buildCurvedMagazine,
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

export function buildAssaultRifleGeometry(weaponId, group, mats) {
  const {
    darkMetal,
    gunMetal,
    polymerMat,
    fdePolymerMat,
    fdeAnodizedMat,
    akWoodMat,
    chromeMetal,
    brassMat,
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

  if (weaponId === 'rifle') {
    // ==================== VANDAL-AK (SALTLINE AK-103 / ZENITCO MODERNIZED) ====================
    // Stamped steel chamfered receiver hull (width 0.068 -> x in [-0.034, +0.034])
    const lowerReceiver = new THREE.Mesh(
      createChamferedBlockGeometry(0.068, 0.066, 0.38, 0.008, 0.008, 0.008, 0.010),
      darkMetal
    );
    lowerReceiver.position.set(0, -0.015, 0.02);

    // Stamped receiver reinforcement dimples (kept forward at z = -0.135 clear of rollmark) & AK safety lever on right
    const akSelector = new THREE.Mesh(roundedBox(0.006, 0.020, 0.155, 0.0018, 1), gunMetal);
    akSelector.position.set(0.036, -0.006, 0.045);
    akSelector.rotation.x = -0.10;

    const sideMountBracket = new THREE.Mesh(
      createChamferedBlockGeometry(0.010, 0.072, 0.095, 0.002, 0.006, 0.002, 0.006),
      gunMetal
    );
    sideMountBracket.position.set(-0.038, 0.024, 0.065);

    // Ribbed stamped steel top dust cover (ribs stay below optic saddle y = 0.062)
    const dustCover = new THREE.Mesh(
      createChamferedBlockGeometry(0.064, 0.042, 0.34, 0.018, 0.018, 0.002, 0.002),
      gunMetal
    );
    dustCover.position.set(0, 0.026, 0.04);
    for (let dr = 0; dr < 3; dr++) {
      const dRib = new THREE.Mesh(roundedBox(0.056, 0.005, 0.012, 0.0012, 1), darkMetal);
      dRib.position.set(0, 0.045, 0.04 + dr * 0.048);
      group.add(dRib);
    }

    // Front trunnion & tangent rear sight bridge collar (seals z = -0.115 to -0.220 into receiver & handguard)
    const trunnionBlock = new THREE.Mesh(
      createChamferedBlockGeometry(0.068, 0.076, 0.105, 0.010, 0.010, 0.006, 0.006),
      darkMetal
    );
    trunnionBlock.position.set(0, 0.014, -0.1675);
    const trunnionLowerBridge = new THREE.Mesh(
      createChamferedBlockGeometry(0.068, 0.044, 0.105, 0.006, 0.006, 0.008, 0.008),
      darkMetal
    );
    trunnionLowerBridge.position.set(0, -0.025, -0.1675);
    group.add(trunnionLowerBridge);
    const tangentLeaf = new THREE.Mesh(roundedBox(0.030, 0.012, 0.088, 0.002, 1), chromeMetal);
    tangentLeaf.position.set(0, 0.055, -0.165);

    // Sculpted oiled matte walnut lower handguard with anatomical palm swells & contoured upper gas-tube wood cover
    const lowerHandguard = new THREE.Mesh(
      createLoftedTubeGeometry(
        [
          { x: 0, y: -0.010, z: -0.195, rx: 0.033, ry: 0.032 },
          { x: 0, y: -0.012, z: -0.285, rx: 0.038, ry: 0.035 },
          { x: 0, y: -0.012, z: -0.375, rx: 0.037, ry: 0.034 },
          { x: 0, y: -0.008, z: -0.455, rx: 0.031, ry: 0.028 }
        ],
        14,
        true
      ),
      akWoodMat
    );
    const handguardRetainer = new THREE.Mesh(roundedBox(0.068, 0.068, 0.022, 0.004, 1), darkMetal);
    handguardRetainer.position.set(0, 0.008, -0.460);

    const upperGasCover = new THREE.Mesh(
      createLoftedTubeGeometry(
        [
          { x: 0, y: 0.034, z: -0.212, rx: 0.024, ry: 0.017 },
          { x: 0, y: 0.036, z: -0.268, rx: 0.027, ry: 0.019 },
          { x: 0, y: 0.036, z: -0.358, rx: 0.026, ry: 0.018 },
          { x: 0, y: 0.034, z: -0.448, rx: 0.022, ry: 0.015 }
        ],
        14,
        true
      ),
      akWoodMat
    );

    // Exposed Parkerized Gas Tube + 90-deg AK-103 Gas Block + Lathe Stepped Cold-Hammer-Forged Barrel
    const gasTube = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.013, 0.29, 16), gunMetal);
    gasTube.rotation.x = Math.PI / 2;
    gasTube.position.set(0, 0.036, -0.365);

    const gasBlock = new THREE.Mesh(
      createChamferedBlockGeometry(0.038, 0.056, 0.052, 0.008, 0.010, 0.008, 0.008),
      darkMetal
    );
    gasBlock.position.set(0, 0.020, -0.50);

    const barrel = new THREE.Mesh(
      createSteppedBarrelGeometry(
        [
          [-0.20, 0.0185],
          [-0.48, 0.0175],
          [-0.53, 0.0155],
          [-0.77, 0.0150],
          [-0.785, 0.0215],
          [-0.865, 0.0215],
          [-0.870, 0.0185]
        ],
        20
      ),
      darkMetal
    );
    barrel.position.set(0, 0.005, 0);

    const brakeCollar = new THREE.Mesh(new THREE.CylinderGeometry(0.0225, 0.0225, 0.018, 18), gunMetal);
    brakeCollar.rotation.x = Math.PI / 2;
    brakeCollar.position.set(0, 0.005, -0.785);

    const cleaningRod = new THREE.Mesh(new THREE.CylinderGeometry(0.0042, 0.0042, 0.34, 12), chromeMetal);
    cleaningRod.rotation.x = Math.PI / 2;
    cleaningRod.position.set(0, -0.015, -0.60);

    // Front sight tower & protective ears kept strictly below y = 0.068 so ADS sightline (0.106) is 100% clear
    const frontSightTower = new THREE.Mesh(
      createChamferedBlockGeometry(0.022, 0.054, 0.036, 0.004, 0.008, 0.003, 0.004),
      darkMetal
    );
    frontSightTower.position.set(0, 0.026, -0.73);
    const sightHoodRing = new THREE.Mesh(new THREE.TorusGeometry(0.013, 0.0028, 8, 16, Math.PI), darkMetal);
    sightHoodRing.position.set(0, 0.050, -0.73);

    // AK-74M / AK-103 Dual-Chamber Expansion Brake Ports & Bore
    const brakePort = new THREE.Mesh(roundedBox(0.045, 0.013, 0.034, 0.002, 1), boreHoleMat);
    brakePort.position.set(0, 0.006, -0.825);
    const muzzleBore = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.013, 0.014, 16), boreHoleMat);
    muzzleBore.rotation.x = Math.PI / 2;
    muzzleBore.position.set(0, 0.005, -0.868);

    // Lofted Anatomical Walnut Buttstock with Comb Drop, Cheek Relief & Ribbed Steel Buttplate
    const walnutStock = new THREE.Mesh(
      createLoftedTubeGeometry(
        [
          { x: 0, y: -0.008, z: 0.205, rx: 0.024, ry: 0.030 },
          { x: 0, y: -0.016, z: 0.290, rx: 0.023, ry: 0.038 },
          { x: 0, y: -0.024, z: 0.395, rx: 0.024, ry: 0.048 },
          { x: 0, y: -0.028, z: 0.472, rx: 0.025, ry: 0.056 }
        ],
        14,
        true
      ),
      akWoodMat
    );
    const buttPlate = new THREE.Mesh(roundedBox(0.052, 0.114, 0.018, 0.005, 1), darkMetal);
    buttPlate.position.set(0, -0.028, 0.480);

    const gripAsm = buildErgonomicGripAndTrigger(-0.045, 0.135, polymerMat, darkMetal, chromeMetal);

    // 30-Round Ribbed Matte-Plum/Steel Polymer AK-103 Magazine
    magMesh = buildCurvedMagazine(5, 0.050, 0.094, 0.058, 0.12, polymerMat, darkMetal, gunMetal);
    magMesh.position.set(0, -0.072, -0.08);
    magMesh.userData.basePos = magMesh.position.clone();

    // Reciprocating Stainless Bolt Carrier & Knurled Charging Handle
    boltMesh = new THREE.Group();
    const carrierPlate = new THREE.Mesh(roundedBox(0.014, 0.030, 0.128, 0.002, 1), chromeMetal);
    carrierPlate.position.set(0.033, 0, 0);
    const handleKnob = new THREE.Mesh(new THREE.CylinderGeometry(0.0075, 0.0095, 0.036, 14), chromeMetal);
    handleKnob.rotation.z = Math.PI / 2;
    handleKnob.position.set(0.052, 0.004, -0.044);
    boltMesh.add(carrierPlate, handleKnob);
    boltMesh.position.set(0, 0.026, -0.02);
    boltMesh.userData.baseZ = -0.02;

    const topRail = buildPicatinnyRail(0.18, 0.062, 0.02, gunMetal, 7);
    const kobraSight = buildDetailedOptic('reflex', 0.068, 0.02, darkMetal, gunMetal, null, glassMat, redReticleMat);
    activeOptic = kobraSight;
    opticCenterY = 0.068 + 0.038;
    opticCenterZ = 0.02;

    const akWml = buildTacticalWeaponLight(0.044, 0.008, -0.38, darkMetal, gunMetal, chromeMetal);
    const akRollmark = new THREE.Mesh(new THREE.PlaneGeometry(0.068, 0.016), getSaltlineRollmarkMaterial());
    akRollmark.rotation.y = -Math.PI / 2;
    akRollmark.position.set(-0.0355, -0.030, -0.065);

    group.add(
      lowerReceiver,
      akSelector,
      sideMountBracket,
      dustCover,
      trunnionBlock,
      tangentLeaf,
      lowerHandguard,
      handguardRetainer,
      upperGasCover,
      gasTube,
      gasBlock,
      barrel,
      brakeCollar,
      cleaningRod,
      frontSightTower,
      sightHoodRing,
      brakePort,
      muzzleBore,
      walnutStock,
      buttPlate,
      gripAsm,
      magMesh,
      boltMesh,
      topRail,
      kobraSight,
      akWml,
      akRollmark
    );
    muzzleZ = -0.88;
  } else if (weaponId === 'm4a1') {
    // ==================== PHANTOM-M4 (SALTLINE URG-I / MK18 MOD 1 SUPPRESSED) ====================
    // Forged Billet Upper Receiver (chamfered octagonal crown) + Forged Lower Receiver (width 0.068 -> x in [-0.034, +0.034])
    const upperReceiver = new THREE.Mesh(
      createChamferedBlockGeometry(0.068, 0.062, 0.27, 0.016, 0.016, 0.006, 0.006),
      darkMetal
    );
    upperReceiver.position.set(0, 0.028, 0.015);

    const forwardAssist = new THREE.Mesh(new THREE.CylinderGeometry(0.0085, 0.010, 0.046, 14), gunMetal);
    forwardAssist.rotation.x = Math.PI / 2;
    forwardAssist.rotation.y = 0.22;
    forwardAssist.position.set(0.036, 0.024, 0.11);

    const brassDeflector = new THREE.Mesh(
      createChamferedBlockGeometry(0.016, 0.024, 0.030, 0.005, 0.005, 0.004, 0.004),
      darkMetal
    );
    brassDeflector.position.set(0.038, 0.028, 0.058);

    const ejectionPortCover = new THREE.Mesh(roundedBox(0.005, 0.020, 0.078, 0.001, 1), gunMetal);
    ejectionPortCover.position.set(0.035, 0.016, -0.012);

    const lowerReceiver = new THREE.Mesh(
      createChamferedBlockGeometry(0.068, 0.064, 0.26, 0.006, 0.006, 0.008, 0.008),
      gunMetal
    );
    lowerReceiver.position.set(0, -0.026, 0.02);

    const magwellFlare = new THREE.Mesh(
      createChamferedBlockGeometry(0.076, 0.026, 0.106, 0.004, 0.004, 0.008, 0.006),
      darkMetal
    );
    magwellFlare.position.set(0, -0.062, -0.058);

    // Open-Slot CNC Octagonal M-LOK Handguard in DDC Hardcoat Anodized Finish —
    // Inner Barrel, Low-Profile Gas Block & Stainless Gas Tube visibly nested inside!
    const octHandguard = buildPerforatedOctagonalHandguard(0.038, 0.36, 4, fdeAnodizedMat, darkMetal);
    octHandguard.position.set(0, 0.024, -0.305);

    const innerGasTube = new THREE.Mesh(new THREE.CylinderGeometry(0.0042, 0.0042, 0.26, 10), chromeMetal);
    innerGasTube.rotation.x = Math.PI / 2;
    innerGasTube.position.set(0, 0.044, -0.25);

    const lowProGasBlock = new THREE.Mesh(roundedBox(0.024, 0.038, 0.038, 0.004, 1), darkMetal);
    lowProGasBlock.position.set(0, 0.031, -0.39);

    // Full-Length Monolithic Top Picatinny Rail + Folded Front & Rear Backup Iron Sights
    const fullTopRail = buildPicatinnyRail(0.62, 0.066, -0.16, darkMetal, 18);
    const frontBuis = buildFoldingIronSight(0.074, -0.45, darkMetal, gunMetal);
    const rearBuis = buildFoldingIronSight(0.074, 0.115, darkMetal, gunMetal);

    // Side-Offset IR Laser Aiming Module (MAWL / NGAL style — offset right so center ADS sightline is 100% unobstructed)
    const ngalHousing = new THREE.Mesh(
      createChamferedBlockGeometry(0.040, 0.020, 0.088, 0.006, 0.004, 0.004, 0.003),
      fdePolymerMat
    );
    ngalHousing.position.set(0.026, 0.072, -0.38);
    const ngalBezel = new THREE.Mesh(new THREE.CylinderGeometry(0.0065, 0.0065, 0.012, 12), darkMetal);
    ngalBezel.rotation.x = Math.PI / 2;
    ngalBezel.position.set(0.032, 0.072, -0.428);

    //BCM KAG / Angled M-LOK Handstop under Handguard
    const handstop = new THREE.Mesh(
      createLoftedTubeGeometry(
        [
          { x: 0, y: -0.016, z: -0.28, rx: 0.014, ry: 0.010 },
          { x: 0, y: -0.032, z: -0.33, rx: 0.016, ry: 0.015 },
          { x: 0, y: -0.052, z: -0.355, rx: 0.014, ry: 0.014 }
        ],
        10,
        true
      ),
      polymerMat
    );

    // Lathe Full-Length Match Barrel (visible through octagonal M-LOK slots!) + SureFire SOCOM RC2 Suppressor
    const barrelAndSuppressor = new THREE.Mesh(
      createSteppedBarrelGeometry(
        [
          [-0.12, 0.0165],
          [-0.38, 0.0150],
          [-0.54, 0.0145],
          [-0.56, 0.0285],
          [-0.605, 0.0295],
          [-0.615, 0.0272],
          [-0.855, 0.0272],
          [-0.862, 0.0235]
        ],
        22
      ),
      darkMetal
    );
    barrelAndSuppressor.position.set(0, 0.024, 0);

    const suppressorLockCollar = new THREE.Mesh(new THREE.CylinderGeometry(0.0305, 0.0305, 0.040, 18), fdeAnodizedMat);
    suppressorLockCollar.rotation.x = Math.PI / 2;
    suppressorLockCollar.position.set(0, 0.024, -0.585);
    const suppressorEndCap = new THREE.Mesh(new THREE.CylinderGeometry(0.0235, 0.0265, 0.012, 18), gunMetal);
    suppressorEndCap.rotation.x = Math.PI / 2;
    suppressorEndCap.position.set(0, 0.024, -0.858);

    const suppressorBore = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.012, 16), boreHoleMat);
    suppressorBore.rotation.x = Math.PI / 2;
    suppressorBore.position.set(0, 0.024, -0.865);

    // Mil-Spec Receiver Extension Buffer Tube + Castle Nut + Sculpted B5 SOPMOD Buttstock
    const castleNut = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, 0.022, 16), gunMetal);
    castleNut.rotation.x = Math.PI / 2;
    castleNut.position.set(0, 0.024, 0.16);

    const bufferTube = new THREE.Mesh(new THREE.CylinderGeometry(0.020, 0.020, 0.26, 16), darkMetal);
    bufferTube.rotation.x = Math.PI / 2;
    bufferTube.position.set(0, 0.024, 0.28);

    const sopmodCheek = new THREE.Mesh(
      createLoftedTubeGeometry(
        [
          { x: 0, y: 0.020, z: 0.23, rx: 0.030, ry: 0.028 },
          { x: 0, y: 0.018, z: 0.33, rx: 0.038, ry: 0.034 },
          { x: 0, y: 0.008, z: 0.44, rx: 0.034, ry: 0.056 }
        ],
        14,
        true
      ),
      fdePolymerMat
    );
    const rubberButtPad = new THREE.Mesh(roundedBox(0.056, 0.118, 0.020, 0.005, 1), darkMetal);
    rubberButtPad.position.set(0, -0.008, 0.452);

    const gripAsm = buildErgonomicGripAndTrigger(-0.042, 0.115, polymerMat, darkMetal, chromeMetal);

    // Gen M3 Windowed PMAG 30-Round Polymer Magazine
    magMesh = buildCurvedMagazine(4, 0.048, 0.090, 0.058, 0.07, polymerMat, darkMetal, fdePolymerMat);
    const pmagWindow = new THREE.Mesh(roundedBox(0.051, 0.078, 0.020, 0.002, 1), brassMat);
    pmagWindow.position.set(0, -0.068, -0.015);
    pmagWindow.rotation.x = 0.14;
    magMesh.add(pmagWindow);
    magMesh.position.set(0, -0.072, -0.06);
    magMesh.userData.basePos = magMesh.position.clone();

    // Ejection Port BCG & Ambidextrous Radian Raptor Charging Handle
    boltMesh = new THREE.Group();
    const bcgCover = new THREE.Mesh(roundedBox(0.014, 0.026, 0.102, 0.002, 1), chromeMetal);
    bcgCover.position.set(0.034, 0, 0);
    const tHandle = new THREE.Mesh(roundedBox(0.064, 0.014, 0.026, 0.003, 1), fdeAnodizedMat);
    tHandle.position.set(0, 0.022, 0.16);
    boltMesh.add(bcgCover, tHandle);
    boltMesh.position.set(0, 0.028, -0.02);
    boltMesh.userData.baseZ = -0.02;

    const holoSight = buildDetailedOptic('holo', 0.074, 0.02, darkMetal, fdeAnodizedMat, null, glassMat, redReticleMat);
    activeOptic = holoSight;
    opticCenterY = 0.074 + 0.038;
    opticCenterZ = 0.02;

    // Bolt-catch & takedown pins positioned clear of the left-receiver rollmark patch [-0.074..-0.010, -0.036..-0.020]
    const boltCatch = new THREE.Mesh(roundedBox(0.005, 0.024, 0.016, 0.001, 1), darkMetal);
    boltCatch.position.set(-0.036, 0.010, 0.016);
    const frontPivotPin = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.070, 12), darkMetal);
    frontPivotPin.rotation.z = Math.PI / 2;
    frontPivotPin.position.set(0, -0.008, -0.105);
    const rearTakedownPin = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.070, 12), darkMetal);
    rearTakedownPin.rotation.z = Math.PI / 2;
    rearTakedownPin.position.set(0, -0.008, 0.115);

    const m4Wml = buildTacticalWeaponLight(0.046, 0.024, -0.36, darkMetal, fdeAnodizedMat, chromeMetal);
    const m4Rollmark = new THREE.Mesh(new THREE.PlaneGeometry(0.064, 0.016), getSaltlineRollmarkMaterial());
    m4Rollmark.rotation.y = -Math.PI / 2;
    m4Rollmark.position.set(-0.0355, -0.028, -0.042);

    group.add(
      upperReceiver,
      forwardAssist,
      brassDeflector,
      ejectionPortCover,
      lowerReceiver,
      magwellFlare,
      octHandguard,
      innerGasTube,
      lowProGasBlock,
      fullTopRail,
      frontBuis,
      rearBuis,
      ngalHousing,
      ngalBezel,
      handstop,
      barrelAndSuppressor,
      suppressorLockCollar,
      suppressorEndCap,
      suppressorBore,
      castleNut,
      bufferTube,
      sopmodCheek,
      rubberButtPad,
      gripAsm,
      magMesh,
      boltMesh,
      holoSight,
      boltCatch,
      frontPivotPin,
      rearTakedownPin,
      m4Wml,
      m4Rollmark
    );
    muzzleZ = -0.89;
  } else if (weaponId === 'scar') {
    // ==================== SCAR-H 7.62 (FN MK17 HEAVY BATTLE RIFLE) ====================
    // Extruded Monolithic FDE Aluminum Upper Receiver with Chamfered Crown (width 0.078 -> x in [-0.039, +0.039])
    const monoUpper = new THREE.Mesh(
      createChamferedBlockGeometry(0.078, 0.088, 0.62, 0.018, 0.022, 0.006, 0.006),
      fdeAnodizedMat
    );
    monoUpper.position.set(0, 0.032, -0.12);

    // Upper lightening fuller grooves at y = 0.052 (above rollmark y in [0.007, 0.025])
    for (const side of [-1, 1]) {
      const groove = new THREE.Mesh(roundedBox(0.004, 0.012, 0.44, 0.001, 1), darkMetal);
      groove.position.set(side * 0.0385, 0.052, -0.12);
      group.add(groove);
    }

    const lowerPolymer = new THREE.Mesh(
      createChamferedBlockGeometry(0.072, 0.066, 0.34, 0.006, 0.006, 0.008, 0.008),
      fdePolymerMat
    );
    lowerPolymer.position.set(0, -0.032, 0.01);

    const topRail = buildPicatinnyRail(0.60, 0.088, -0.12, darkMetal, 18);
    const frontBuis = buildFoldingIronSight(0.095, -0.40, darkMetal, gunMetal);
    const rearBuis = buildFoldingIronSight(0.095, 0.15, darkMetal, gunMetal);

    // Forward M1913 side accessory rails (z in [-0.41, -0.21], clear of rollmark at z = -0.06)
    const sideRailL = buildPicatinnyRail(0.20, 0.028, -0.31, darkMetal, 6);
    sideRailL.rotation.z = Math.PI / 2;
    sideRailL.position.set(-0.042, 0.028, 0);
    const sideRailR = buildPicatinnyRail(0.20, 0.028, -0.31, darkMetal, 6);
    sideRailR.rotation.z = -Math.PI / 2;
    sideRailR.position.set(0.042, 0.028, 0);

    // Lathe Heavy 7.62mm Free-Float Barrel + Gas Regulator + PWS/AAC 3-Prong Muzzle Brake
    const barrel = new THREE.Mesh(
      createSteppedBarrelGeometry(
        [
          [-0.41, 0.021],
          [-0.49, 0.021],
          [-0.50, 0.0185],
          [-0.735, 0.0180],
          [-0.745, 0.0235],
          [-0.820, 0.0225],
          [-0.826, 0.0190]
        ],
        20
      ),
      darkMetal
    );
    barrel.position.set(0, 0.022, 0);

    const gasRegulator = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.018, 0.065, 16), gunMetal);
    gasRegulator.rotation.x = Math.PI / 2;
    gasRegulator.position.set(0, 0.048, -0.455);

    const brakePort = new THREE.Mesh(roundedBox(0.049, 0.014, 0.036, 0.002, 1), boreHoleMat);
    brakePort.position.set(0, 0.022, -0.782);
    const muzzleBore = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.014, 16), boreHoleMat);
    muzzleBore.rotation.x = Math.PI / 2;
    muzzleBore.position.set(0, 0.022, -0.825);

    // Contoured Vertical Stubby Foregrip
    const vertGrip = new THREE.Mesh(
      createLoftedTubeGeometry(
        [
          { x: 0, y: -0.014, z: -0.33, rx: 0.020, ry: 0.022 },
          { x: 0, y: -0.056, z: -0.33, rx: 0.019, ry: 0.020 },
          { x: 0, y: -0.098, z: -0.33, rx: 0.021, ry: 0.022 }
        ],
        12,
        true
      ),
      polymerMat
    );

    // Sculpted FN SCAR Folding/Telescoping Ugg-Boot Buttstock with Adjustable Cheek Comb
    const stockHinge = new THREE.Mesh(roundedBox(0.056, 0.096, 0.046, 0.006, 1), darkMetal);
    stockHinge.position.set(0, 0.016, 0.21);
    const stockBody = new THREE.Mesh(
      createLoftedTubeGeometry(
        [
          { x: 0, y: 0.014, z: 0.23, rx: 0.031, ry: 0.048 },
          { x: 0, y: 0.008, z: 0.35, rx: 0.032, ry: 0.054 },
          { x: 0, y: -0.004, z: 0.48, rx: 0.033, ry: 0.064 }
        ],
        14,
        true
      ),
      fdePolymerMat
    );
    const cheekRiser = new THREE.Mesh(
      createChamferedBlockGeometry(0.064, 0.034, 0.21, 0.018, 0.016, 0.004, 0.004),
      fdePolymerMat
    );
    cheekRiser.position.set(0, 0.052, 0.34);
    const buttPad = new THREE.Mesh(roundedBox(0.062, 0.130, 0.022, 0.006, 1), darkMetal);
    buttPad.position.set(0, -0.006, 0.49);

    const gripAsm = buildErgonomicGripAndTrigger(-0.042, 0.125, polymerMat, darkMetal, chromeMetal);

    // Straight Heavy 20-Round 7.62x51mm NATO Steel Box Magazine with FDE Ranger Floorplate
    magMesh = new THREE.Group();
    const magBox = new THREE.Mesh(
      createChamferedBlockGeometry(0.052, 0.192, 0.114, 0.006, 0.006, 0.006, 0.006),
      fdeAnodizedMat
    );
    const magRib1 = new THREE.Mesh(roundedBox(0.056, 0.155, 0.016, 0.002, 1), gunMetal);
    magRib1.position.set(0, 0, -0.024);
    const magRib2 = new THREE.Mesh(roundedBox(0.056, 0.155, 0.016, 0.002, 1), gunMetal);
    magRib2.position.set(0, 0, 0.024);
    const magPullBase = new THREE.Mesh(roundedBox(0.060, 0.028, 0.122, 0.004, 1), darkMetal);
    magPullBase.position.set(0, -0.102, 0);
    const magLoop = new THREE.Mesh(new THREE.TorusGeometry(0.020, 0.0045, 8, 14, Math.PI), darkMetal);
    magLoop.rotation.y = Math.PI / 2;
    magLoop.rotation.z = Math.PI;
    magLoop.position.set(0, -0.116, 0);
    magMesh.add(magBox, magRib1, magRib2, magPullBase, magLoop);
    magMesh.position.set(0, -0.135, -0.085);
    magMesh.rotation.x = 0.03;
    magMesh.userData.basePos = magMesh.position.clone();

    // Forward Reciprocating Charging Handle (at z = -0.22, clear of rollmark at z = -0.06) & Bolt Carrier
    boltMesh = new THREE.Group();
    const bcgPlate = new THREE.Mesh(roundedBox(0.016, 0.032, 0.118, 0.002, 1), chromeMetal);
    bcgPlate.position.set(0.038, 0, 0.04);
    const chHandle = new THREE.Mesh(new THREE.CylinderGeometry(0.0085, 0.0085, 0.052, 14), chromeMetal);
    chHandle.rotation.z = Math.PI / 2;
    chHandle.position.set(-0.052, 0.016, -0.19);
    boltMesh.add(bcgPlate, chHandle);
    boltMesh.position.set(0, 0.038, -0.05);
    boltMesh.userData.baseZ = -0.05;

    const holoSight = buildDetailedOptic('holo', 0.094, 0.01, darkMetal, fdeAnodizedMat, null, glassMat, redReticleMat);
    activeOptic = holoSight;
    opticCenterY = 0.094 + 0.038;
    opticCenterZ = 0.01;

    const scarWml = buildTacticalWeaponLight(0.054, 0.028, -0.34, darkMetal, fdeAnodizedMat, chromeMetal);
    const scarRollmark = new THREE.Mesh(new THREE.PlaneGeometry(0.078, 0.018), getSaltlineRollmarkMaterial());
    scarRollmark.rotation.y = -Math.PI / 2;
    scarRollmark.position.set(-0.0405, 0.016, -0.06);

    group.add(
      monoUpper,
      lowerPolymer,
      topRail,
      frontBuis,
      rearBuis,
      sideRailL,
      sideRailR,
      barrel,
      gasRegulator,
      brakePort,
      muzzleBore,
      vertGrip,
      stockHinge,
      stockBody,
      cheekRiser,
      buttPad,
      gripAsm,
      magMesh,
      boltMesh,
      holoSight,
      scarWml,
      scarRollmark
    );
    muzzleZ = -0.84;
  }

  return { magMesh, boltMesh, activeOptic, opticCenterY, opticCenterZ, muzzleZ };
}
