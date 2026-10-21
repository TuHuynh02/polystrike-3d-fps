import * as THREE from '../three.js';
import {
  buildCurvedMagazine,
  buildDetailedOptic,
  buildErgonomicGripAndTrigger,
  buildPicatinnyRail
} from './weaponMaterials.js';

export function buildAssaultRifleGeometry(weaponId, group, mats) {
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

  if (weaponId === 'rifle') {
    // ==================== VANDAL-AK (AKM / AK-103 CUSTOM TACTICAL) ====================
    // Stamped Steel Lower Receiver + Magwell Dimples + Ribbed Rounded Dust Cover
    const lowerReceiver = new THREE.Mesh(new THREE.BoxGeometry(0.074, 0.068, 0.38), darkMetal);
    lowerReceiver.position.set(0, -0.015, 0.02);

    // Stamped receiver side bevels & AK safety selector lever
    const akSelector = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.024, 0.15), gunMetal);
    akSelector.position.set(0.040, -0.006, 0.04);
    akSelector.rotation.x = -0.12;

    const sideMountBracket = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.078, 0.11), gunMetal);
    sideMountBracket.position.set(-0.041, 0.022, 0.02);

    const dustCover = new THREE.Mesh(
      new THREE.CylinderGeometry(0.039, 0.042, 0.34, 22, 1, false, -Math.PI * 0.5, Math.PI),
      gunMetal
    );
    dustCover.rotation.x = Math.PI / 2;
    dustCover.position.set(0, 0.018, 0.04);

    // Rear Sight Block & Tangent Leaf Sight
    const trunnionBlock = new THREE.Mesh(new THREE.BoxGeometry(0.072, 0.072, 0.09), darkMetal);
    trunnionBlock.position.set(0, 0.016, -0.16);
    const tangentLeaf = new THREE.Mesh(new THREE.BoxGeometry(0.036, 0.018, 0.085), chromeMetal);
    tangentLeaf.position.set(0, 0.056, -0.155);

    // Contoured Laminated Wood / Bakelite Lower Handguard with Palm Swells & Upper Gas Tube Cover
    const lowerHandguard = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.040, 0.25, 22), akWoodMat);
    lowerHandguard.rotation.x = Math.PI / 2;
    lowerHandguard.scale.set(0.96, 1.08, 1);
    lowerHandguard.position.set(0, -0.008, -0.33);

    const palmSwell = new THREE.Mesh(new THREE.SphereGeometry(0.042, 18, 14), akWoodMat);
    palmSwell.scale.set(1.06, 0.68, 2.2);
    palmSwell.position.set(0, -0.012, -0.32);

    const handguardRetainer = new THREE.Mesh(new THREE.CylinderGeometry(0.041, 0.041, 0.024, 18), darkMetal);
    handguardRetainer.rotation.x = Math.PI / 2;
    handguardRetainer.position.set(0, 0.006, -0.46);

    const upperGasCover = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.21, 18), akWoodMat);
    upperGasCover.rotation.x = Math.PI / 2;
    upperGasCover.position.set(0, 0.036, -0.32);

    // 45-Degree AK Gas Block & Exposed Steel Gas Tube
    const gasTube = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.28, 18), gunMetal);
    gasTube.rotation.x = Math.PI / 2;
    gasTube.position.set(0, 0.036, -0.36);

    const gasBlock = new THREE.Mesh(new THREE.CylinderGeometry(0.020, 0.022, 0.068, 18), darkMetal);
    gasBlock.rotation.x = 0.65;
    gasBlock.position.set(0, 0.022, -0.50);

    // Stepped Cold-Hammer-Forged Barrel + Underbarrel Cleaning Rod + Triangular Front Sight Tower
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.019, 0.48, 24), darkMetal);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.005, -0.56);

    const cleaningRod = new THREE.Mesh(new THREE.CylinderGeometry(0.0045, 0.0045, 0.34, 14), chromeMetal);
    cleaningRod.rotation.x = Math.PI / 2;
    cleaningRod.position.set(0, -0.015, -0.60);

    const frontSightTower = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.064, 0.038), darkMetal);
    frontSightTower.position.set(0, 0.028, -0.73);
    const sightHoodRing = new THREE.Mesh(new THREE.TorusGeometry(0.016, 0.0032, 10, 20, Math.PI), darkMetal);
    sightHoodRing.position.set(0, 0.054, -0.73);

    // AK-103 Multi-Port Muzzle Brake + Expansion Ports + Hollow Dark Bore
    const muzzleBrake = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.021, 0.088, 22), gunMetal);
    muzzleBrake.rotation.x = Math.PI / 2;
    muzzleBrake.position.set(0, 0.005, -0.82);
    const brakePort = new THREE.Mesh(new THREE.BoxGeometry(0.046, 0.014, 0.032), boreHoleMat);
    brakePort.position.set(0, 0.008, -0.82);
    const muzzleBore = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.015, 16), boreHoleMat);
    muzzleBore.rotation.x = Math.PI / 2;
    muzzleBore.position.set(0, 0.005, -0.862);

    // Contoured Wooden Buttstock with Cheek Slope & Ribbed Steel Buttplate
    const stockTopStrut = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.032, 0.28, 20), akWoodMat);
    stockTopStrut.rotation.x = Math.PI / 2 - 0.08;
    stockTopStrut.scale.set(0.85, 1.35, 1);
    stockTopStrut.position.set(0, -0.012, 0.34);

    const stockBelly = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.028, 0.27, 20), akWoodMat);
    stockBelly.rotation.x = Math.PI / 2 + 0.14;
    stockBelly.position.set(0, -0.042, 0.34);

    const buttPlate = new THREE.Mesh(new THREE.CapsuleGeometry(0.028, 0.076, 10, 18), darkMetal);
    buttPlate.scale.set(1.0, 1, 0.48);
    buttPlate.position.set(0, -0.024, 0.48);

    const gripAsm = buildErgonomicGripAndTrigger(-0.045, 0.13, akWoodMat, darkMetal, chromeMetal);

    // 30-Round Curved Bakelite/Steel Ribbed Banana Magazine
    magMesh = buildCurvedMagazine(5, 0.052, 0.096, 0.058, 0.12, akWoodMat, darkMetal, gunMetal);
    magMesh.position.set(0, -0.072, -0.08);
    magMesh.userData.basePos = magMesh.position.clone();

    // Reciprocating Polished Bolt Carrier & Curved Charging Handle Knob
    boltMesh = new THREE.Group();
    const carrierPlate = new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.032, 0.13), chromeMetal);
    carrierPlate.position.set(0.036, 0, 0);
    const handleKnob = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.010, 0.038, 16), darkMetal);
    handleKnob.rotation.z = Math.PI / 2;
    handleKnob.position.set(0.056, 0.004, -0.045);
    boltMesh.add(carrierPlate, handleKnob);
    boltMesh.position.set(0, 0.026, -0.02);
    boltMesh.userData.baseZ = -0.02;

    // Dovetail Side-Mount Picatinny Rail + Kobra Red-Dot Reflex Sight
    const topRail = buildPicatinnyRail(0.18, 0.062, 0.02, gunMetal, 7);
    const kobraSight = buildDetailedOptic('reflex', 0.068, 0.02, darkMetal, gunMetal, accentMat, glassMat, redReticleMat);
    activeOptic = kobraSight;
    opticCenterY = 0.068 + 0.038;
    opticCenterZ = 0.02;

    group.add(
      lowerReceiver,
      akSelector,
      sideMountBracket,
      dustCover,
      trunnionBlock,
      tangentLeaf,
      lowerHandguard,
      palmSwell,
      handguardRetainer,
      upperGasCover,
      gasTube,
      gasBlock,
      barrel,
      cleaningRod,
      frontSightTower,
      sightHoodRing,
      muzzleBrake,
      brakePort,
      muzzleBore,
      stockTopStrut,
      stockBelly,
      buttPlate,
      gripAsm,
      magMesh,
      boltMesh,
      topRail,
      kobraSight
    );
    muzzleZ = -0.88;
  } else if (weaponId === 'm4a1') {
    // ==================== PHANTOM-M4 (MK18 MOD 1 SUPPRESSED CARBINE) ====================
    // Forged AR-15 Upper & Lower Receivers with Forward Assist, Brass Deflector & Magwell Flare
    const upperReceiver = new THREE.Mesh(new THREE.CylinderGeometry(0.044, 0.046, 0.28, 20), darkMetal);
    upperReceiver.rotation.x = Math.PI / 2;
    upperReceiver.scale.set(0.95, 1.05, 1);
    upperReceiver.position.set(0, 0.028, 0.01);

    const forwardAssist = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.011, 0.048, 14), gunMetal);
    forwardAssist.rotation.x = Math.PI / 2;
    forwardAssist.rotation.y = 0.22;
    forwardAssist.position.set(0.038, 0.024, 0.11);

    const brassDeflector = new THREE.Mesh(new THREE.ConeGeometry(0.016, 0.028, 12), darkMetal);
    brassDeflector.rotation.z = -Math.PI / 2;
    brassDeflector.position.set(0.042, 0.028, 0.055);

    const lowerReceiver = new THREE.Mesh(new THREE.BoxGeometry(0.072, 0.068, 0.26), gunMetal);
    lowerReceiver.position.set(0, -0.028, 0.02);

    const magwellFlare = new THREE.Mesh(new THREE.BoxGeometry(0.082, 0.032, 0.115), darkMetal);
    magwellFlare.position.set(0, -0.058, -0.06);

    // Smooth M-LOK Free-Float Handguard with Barrel Nut Collar & Cooling Slots
    const barrelNut = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.052, 20), fdeAnodizedMat);
    barrelNut.rotation.x = Math.PI / 2;
    barrelNut.position.set(0, 0.024, -0.15);

    const handguardTube = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.042, 0.36, 16), gunMetal);
    handguardTube.rotation.x = Math.PI / 2;
    handguardTube.rotation.z = Math.PI / 8;
    handguardTube.position.set(0, 0.024, -0.31);

    for (let s = 0; s < 4; s++) {
      const slotZ = -0.18 - s * 0.075;
      const slotBar = new THREE.Mesh(new THREE.BoxGeometry(0.088, 0.014, 0.048), boreHoleMat);
      slotBar.position.set(0, 0.024, slotZ);
      group.add(slotBar);
    }

    const fullTopRail = buildPicatinnyRail(0.62, 0.068, -0.16, darkMetal, 18);

    // Side-Offset AN/PEQ-15 Tactical Laser Box near Front of Handguard (clear of Holo sightline)
    const peqBox = new THREE.Mesh(new THREE.BoxGeometry(0.046, 0.022, 0.092), fdePolymerMat);
    peqBox.position.set(0.024, 0.074, -0.39);
    const peqLens = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.014, 14), reticleMat);
    peqLens.rotation.x = Math.PI / 2;
    peqLens.position.set(0.028, 0.074, -0.44);

    // Angled Magpul AFG Foregrip under Handguard
    const afgGrip = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.026, 0.12, 16), polymerMat);
    afgGrip.rotation.x = Math.PI / 2 - 0.38;
    afgGrip.position.set(0, -0.032, -0.33);

    // Barrel Step + SureFire SOCOM Cylindrical Suppressor with Knurled Locking Collar, Welded Seam Rings & Bore Hole
    const barrelStub = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.14, 20), darkMetal);
    barrelStub.rotation.x = Math.PI / 2;
    barrelStub.position.set(0, 0.024, -0.53);

    const suppressorCollar = new THREE.Mesh(new THREE.CylinderGeometry(0.030, 0.030, 0.045, 22), fdeAnodizedMat);
    suppressorCollar.rotation.x = Math.PI / 2;
    suppressorCollar.position.set(0, 0.024, -0.60);

    const suppressorBody = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.24, 24), darkMetal);
    suppressorBody.rotation.x = Math.PI / 2;
    suppressorBody.position.set(0, 0.024, -0.74);

    for (const rZ of [-0.66, -0.74, -0.82]) {
      const seam = new THREE.Mesh(new THREE.TorusGeometry(0.0282, 0.0018, 8, 22), gunMetal);
      seam.position.set(0, 0.024, rZ);
      group.add(seam);
    }

    const suppressorBore = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.013, 0.012, 16), boreHoleMat);
    suppressorBore.rotation.x = Math.PI / 2;
    suppressorBore.position.set(0, 0.024, -0.86);

    // Buffer Tube + Castle Nut + SOPMOD Crane Adjustable Buttstock
    const castleNut = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.024, 18), gunMetal);
    castleNut.rotation.x = Math.PI / 2;
    castleNut.position.set(0, 0.024, 0.16);

    const bufferTube = new THREE.Mesh(new THREE.CylinderGeometry(0.021, 0.021, 0.26, 20), darkMetal);
    bufferTube.rotation.x = Math.PI / 2;
    bufferTube.position.set(0, 0.024, 0.28);

    const craneCheekWeld = new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.036, 0.21, 20), polymerMat);
    craneCheekWeld.rotation.x = Math.PI / 2;
    craneCheekWeld.scale.set(1.18, 0.92, 1);
    craneCheekWeld.position.set(0, 0.022, 0.34);

    const stockStrut = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.022, 0.20, 16), polymerMat);
    stockStrut.rotation.x = 0.58;
    stockStrut.position.set(0, -0.028, 0.35);

    const rubberButtPad = new THREE.Mesh(new THREE.CapsuleGeometry(0.030, 0.078, 10, 18), darkMetal);
    rubberButtPad.scale.set(1.05, 1, 0.45);
    rubberButtPad.position.set(0, -0.008, 0.45);

    const gripAsm = buildErgonomicGripAndTrigger(-0.042, 0.11, polymerMat, darkMetal, chromeMetal);

    // Windowed PMAG 30-Round Polymer Magazine
    magMesh = buildCurvedMagazine(4, 0.050, 0.092, 0.058, 0.07, polymerMat, gunMetal, fdePolymerMat);
    const pmagWindow = new THREE.Mesh(new THREE.BoxGeometry(0.054, 0.085, 0.024), brassMat);
    pmagWindow.position.set(0, -0.06, -0.01);
    magMesh.add(pmagWindow);
    magMesh.position.set(0, -0.072, -0.06);
    magMesh.userData.basePos = magMesh.position.clone();

    // Ejection Port Bolt Carrier & T-Charging Handle
    boltMesh = new THREE.Group();
    const bcgCover = new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.028, 0.105), chromeMetal);
    bcgCover.position.set(0.038, 0, 0);
    const tHandle = new THREE.Mesh(new THREE.BoxGeometry(0.066, 0.016, 0.028), darkMetal);
    tHandle.position.set(0, 0.022, 0.16);
    boltMesh.add(bcgCover, tHandle);
    boltMesh.position.set(0, 0.028, -0.02);
    boltMesh.userData.baseZ = -0.02;

    const holoSight = buildDetailedOptic('holo', 0.074, 0.02, darkMetal, fdeAnodizedMat, accentMat, glassMat, redReticleMat);
    activeOptic = holoSight;
    opticCenterY = 0.074 + 0.038;
    opticCenterZ = 0.02;

    group.add(
      upperReceiver,
      forwardAssist,
      brassDeflector,
      lowerReceiver,
      magwellFlare,
      barrelNut,
      handguardTube,
      fullTopRail,
      peqBox,
      peqLens,
      afgGrip,
      barrelStub,
      suppressorCollar,
      suppressorBody,
      suppressorBore,
      castleNut,
      bufferTube,
      craneCheekWeld,
      stockStrut,
      rubberButtPad,
      gripAsm,
      magMesh,
      boltMesh,
      holoSight
    );
    muzzleZ = -0.89;
  } else if (weaponId === 'scar') {
    // ==================== SCAR-H 7.62 (FN MK17 HEAVY BATTLE RIFLE) ====================
    // Iconic Monolithic Extruded FDE Aluminum Upper Receiver with Chamfered Crown & Side Scallops
    const monoUpper = new THREE.Mesh(new THREE.BoxGeometry(0.084, 0.094, 0.64), fdeAnodizedMat);
    monoUpper.position.set(0, 0.032, -0.12);
    const upperChamfer = new THREE.Mesh(new THREE.CylinderGeometry(0.044, 0.044, 0.64, 18), fdeAnodizedMat);
    upperChamfer.rotation.x = Math.PI / 2;
    upperChamfer.scale.set(0.96, 1, 0.42);
    upperChamfer.position.set(0, 0.068, -0.12);

    // Machined receiver lightening grooves
    for (const side of [-1, 1]) {
      const groove = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.018, 0.46), gunMetal);
      groove.position.set(side * 0.042, 0.042, -0.12);
      group.add(groove);
    }

    const lowerPolymer = new THREE.Mesh(new THREE.BoxGeometry(0.076, 0.068, 0.34), polymerMat);
    lowerPolymer.position.set(0, -0.032, 0.01);

    const topRail = buildPicatinnyRail(0.62, 0.092, -0.12, darkMetal, 18);
    const sideRailL = buildPicatinnyRail(0.22, 0.028, -0.32, darkMetal, 6);
    sideRailL.rotation.z = Math.PI / 2;
    sideRailL.position.set(-0.046, 0.028, 0);
    const sideRailR = buildPicatinnyRail(0.22, 0.028, -0.32, darkMetal, 6);
    sideRailR.rotation.z = -Math.PI / 2;
    sideRailR.position.set(0.046, 0.028, 0);

    // Heavy 7.62mm Free-Float Barrel + Folding Gas Block Sight + AAC 3-Prong Flash Hider
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.019, 0.021, 0.36, 24), darkMetal);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.022, -0.58);

    const gasBlockSight = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.026, 0.055, 18), gunMetal);
    gasBlockSight.rotation.x = Math.PI / 2;
    gasBlockSight.position.set(0, 0.032, -0.47);

    const flashHider = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.022, 0.088, 22), gunMetal);
    flashHider.rotation.x = Math.PI / 2;
    flashHider.position.set(0, 0.022, -0.78);
    const muzzleBore = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.015, 16), boreHoleMat);
    muzzleBore.rotation.x = Math.PI / 2;
    muzzleBore.position.set(0, 0.022, -0.822);

    // Vertical Stubby TangoDown Foregrip
    const vertGrip = new THREE.Mesh(new THREE.CapsuleGeometry(0.022, 0.085, 10, 18), fdePolymerMat);
    vertGrip.position.set(0, -0.068, -0.34);

    // Iconic FN Ugg-Boot Folding/Telescoping Buttstock with Contoured Cheekpiece & Rubber Pad
    const stockHinge = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.115, 18), darkMetal);
    stockHinge.position.set(0, 0.018, 0.21);
    const stockBody = new THREE.Mesh(new THREE.BoxGeometry(0.068, 0.116, 0.26), fdePolymerMat);
    stockBody.position.set(0, 0.005, 0.35);
    const cheekRiser = new THREE.Mesh(
      new THREE.CylinderGeometry(0.036, 0.036, 0.22, 20, 1, false, -Math.PI * 0.5, Math.PI),
      fdePolymerMat
    );
    cheekRiser.rotation.x = Math.PI / 2;
    cheekRiser.position.set(0, 0.048, 0.34);
    const buttPad = new THREE.Mesh(new THREE.CapsuleGeometry(0.032, 0.082, 10, 18), darkMetal);
    buttPad.scale.set(1.05, 1, 0.48);
    buttPad.position.set(0, -0.008, 0.49);

    const gripAsm = buildErgonomicGripAndTrigger(-0.042, 0.12, fdePolymerMat, darkMetal, chromeMetal);

    // Straight Heavy 20-Round 7.62x51mm NATO Steel Box Magazine with FDE Mag-Pull Floorplate
    magMesh = new THREE.Group();
    const magBox = new THREE.Mesh(new THREE.BoxGeometry(0.056, 0.195, 0.118), fdeAnodizedMat);
    const magRib1 = new THREE.Mesh(new THREE.BoxGeometry(0.060, 0.16, 0.018), gunMetal);
    magRib1.position.set(0, 0, -0.025);
    const magRib2 = new THREE.Mesh(new THREE.BoxGeometry(0.060, 0.16, 0.018), gunMetal);
    magRib2.position.set(0, 0, 0.025);
    const magPullBase = new THREE.Mesh(new THREE.BoxGeometry(0.064, 0.032, 0.124), darkMetal);
    magPullBase.position.set(0, -0.105, 0);
    const magLoop = new THREE.Mesh(new THREE.TorusGeometry(0.022, 0.005, 8, 16, Math.PI), darkMetal);
    magLoop.rotation.y = Math.PI / 2;
    magLoop.rotation.z = Math.PI;
    magLoop.position.set(0, -0.12, 0);
    magMesh.add(magBox, magRib1, magRib2, magPullBase, magLoop);
    magMesh.position.set(0, -0.135, -0.085);
    magMesh.rotation.x = 0.03;
    magMesh.userData.basePos = magMesh.position.clone();

    // Forward Reciprocating Charging Handle & Bolt Carrier
    boltMesh = new THREE.Group();
    const bcgPlate = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.034, 0.12), chromeMetal);
    bcgPlate.position.set(0.042, 0, 0.04);
    const chHandle = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.055, 16), darkMetal);
    chHandle.rotation.z = Math.PI / 2;
    chHandle.position.set(-0.056, 0.018, -0.18);
    boltMesh.add(bcgPlate, chHandle);
    boltMesh.position.set(0, 0.038, -0.05);
    boltMesh.userData.baseZ = -0.05;

    // EOTech Holographic Combat Sight on Monolithic Top Rail
    const acogSight = buildDetailedOptic('holo', 0.098, 0.01, darkMetal, fdeAnodizedMat, accentMat, glassMat, redReticleMat);
    activeOptic = acogSight;
    opticCenterY = 0.098 + 0.038;
    opticCenterZ = 0.01;

    group.add(
      monoUpper,
      upperChamfer,
      lowerPolymer,
      topRail,
      sideRailL,
      sideRailR,
      barrel,
      gasBlockSight,
      flashHider,
      muzzleBore,
      vertGrip,
      stockHinge,
      stockBody,
      cheekRiser,
      buttPad,
      gripAsm,
      magMesh,
      boltMesh,
      acogSight
    );
    muzzleZ = -0.84;
  }

  return { magMesh, boltMesh, activeOptic, opticCenterY, opticCenterZ, muzzleZ };
}
