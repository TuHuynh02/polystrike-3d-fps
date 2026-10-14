// 3D Weapon Mesh Builder (First-Person Viewmodels with Arms/Gloves & Third-Person World Models)

import * as THREE from '../vendor/three/three.module.js';
import { WEAPONS } from '../shared/constants.js';

export function createWeaponMesh(weaponId, isFirstPerson = false) {
  const group = new THREE.Group();
  const darkMetal = new THREE.MeshStandardMaterial({
    color: 0x0f172a,
    roughness: 0.32,
    metalness: 0.78
  });
  const gunMetal = new THREE.MeshStandardMaterial({
    color: 0x334155,
    roughness: 0.28,
    metalness: 0.85
  });
  const polymerMat = new THREE.MeshStandardMaterial({
    color: 0x1e293b,
    roughness: 0.58,
    metalness: 0.32
  });
  const chromeMetal = new THREE.MeshStandardMaterial({
    color: 0xcbd5e1,
    roughness: 0.18,
    metalness: 0.92
  });
  const brassMat = new THREE.MeshStandardMaterial({
    color: 0xfacc15,
    roughness: 0.25,
    metalness: 0.88
  });
  const accentColor = WEAPONS[weaponId]?.color || 0xf59e0b;
  const accentMat = new THREE.MeshStandardMaterial({
    color: accentColor,
    emissive: accentColor,
    emissiveIntensity: 0.42,
    roughness: 0.22,
    metalness: 0.5
  });
  const reticleMat = new THREE.MeshBasicMaterial({ color: 0x22c55e });
  const glassMat = new THREE.MeshBasicMaterial({
    color: 0x38bdf8,
    transparent: true,
    opacity: 0.36,
    side: THREE.DoubleSide
  });

  let magMesh = null;
  let boltMesh = null;
  let muzzleZ = -0.75;

  if (weaponId === 'rifle' || weaponId === 'm4a1' || weaponId === 'scar') {
    // ASSAULT RIFLES: VANDAL-AK / PHANTOM-M4 (Suppressed) / SCAR-H 7.62 (Battle Rifle)
    const isM4 = weaponId === 'm4a1';
    const isScar = weaponId === 'scar';
    const upperReceiver = new THREE.Mesh(
      new THREE.BoxGeometry(0.092, isScar ? 0.105 : 0.088, isScar ? 0.52 : 0.48),
      isScar ? accentMat : darkMetal
    );
    upperReceiver.position.set(0, 0.025, 0);
    const lowerReceiver = new THREE.Mesh(new THREE.BoxGeometry(0.084, 0.068, 0.38), polymerMat);
    lowerReceiver.position.set(0, -0.038, 0.02);

    // Side Accent Trim Strips
    const trimStrip = new THREE.Mesh(new THREE.BoxGeometry(0.098, 0.016, 0.38), accentMat);
    trimStrip.position.set(0, 0.032, -0.02);

    // Ventilated M-LOK Handguard + Gas Block
    const handguard = new THREE.Mesh(new THREE.BoxGeometry(0.078, 0.098, 0.35), gunMetal);
    handguard.position.set(0, 0.015, -0.37);
    const gasBlock = new THREE.Mesh(new THREE.BoxGeometry(0.052, 0.065, 0.06), darkMetal);
    gasBlock.position.set(0, 0.038, -0.55);
    const gasTube = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.34, 8), chromeMetal);
    gasTube.rotation.x = Math.PI / 2;
    gasTube.position.set(0, 0.056, -0.37);

    // Top Picatinny Rail Teeth
    const railBase = new THREE.Mesh(new THREE.BoxGeometry(0.048, 0.014, 0.68), gunMetal);
    railBase.position.set(0, 0.074, -0.14);

    // Precision Barrel & Muzzle / Suppressor
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.42, 10), chromeMetal);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.018, -0.58);
    const brake = isM4
      ? new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.24, 12), darkMetal)
      : new THREE.Mesh(new THREE.BoxGeometry(0.046, 0.046, 0.085), accentMat);
    if (isM4) brake.rotation.x = Math.PI / 2;
    brake.position.set(0, 0.018, isM4 ? -0.82 : -0.79);

    // Angled Tactical Foregrip under Handguard
    const foregrip = new THREE.Mesh(new THREE.BoxGeometry(0.048, 0.11, 0.068), polymerMat);
    foregrip.position.set(0, -0.072, -0.35);
    foregrip.rotation.x = isM4 ? 0.05 : 0.28;

    // Buttstock, Cheek Riser & Rubber Pad
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.074, 0.118, 0.26), isScar ? accentMat : polymerMat);
    stock.position.set(0, -0.008, 0.33);
    const buttPad = new THREE.Mesh(new THREE.BoxGeometry(0.078, 0.132, 0.035), darkMetal);
    buttPad.position.set(0, -0.012, 0.47);
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.058, 0.16, 0.085), polymerMat);
    grip.position.set(0, -0.115, 0.13);
    grip.rotation.x = -0.26;
    const triggerGuard = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.016, 0.09), darkMetal);
    triggerGuard.position.set(0, -0.082, 0.04);

    // Detachable Magazine (Straight heavy 7.62 mag for SCAR, curved mag for AK/M4)
    magMesh = new THREE.Group();
    const magBody = new THREE.Mesh(
      new THREE.BoxGeometry(0.058, isScar ? 0.21 : 0.24, isScar ? 0.115 : 0.102),
      isScar ? gunMetal : accentMat
    );
    const magPlate = new THREE.Mesh(new THREE.BoxGeometry(0.066, 0.032, 0.115), darkMetal);
    magPlate.position.set(0, -0.12, 0);
    magMesh.add(magBody, magPlate);
    magMesh.position.set(0, -0.15, -0.09);
    magMesh.rotation.x = isScar ? 0.04 : 0.24;
    magMesh.userData.basePos = magMesh.position.clone();

    // Reciprocating Charging Handle / Bolt Carrier
    boltMesh = new THREE.Mesh(new THREE.BoxGeometry(0.115, 0.034, 0.12), chromeMetal);
    boltMesh.position.set(0.018, 0.042, -0.04);
    boltMesh.userData.baseZ = -0.04;

    // Optic Sight (ACOG tube for SCAR, EOTech Holo for AK/M4)
    const sightHood = isScar
      ? new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.028, 0.18, 12), darkMetal)
      : new THREE.Mesh(new THREE.BoxGeometry(0.068, 0.065, 0.12), darkMetal);
    if (isScar) sightHood.rotation.x = Math.PI / 2;
    sightHood.position.set(0, 0.112, -0.02);
    const sightLens = new THREE.Mesh(new THREE.PlaneGeometry(0.052, 0.046), glassMat);
    sightLens.position.set(0, 0.11, -0.02);
    const sightDot = new THREE.Mesh(new THREE.SphereGeometry(0.0075, 8, 8), reticleMat);
    sightDot.position.set(0, 0.11, -0.025);

    group.add(
      upperReceiver,
      lowerReceiver,
      trimStrip,
      handguard,
      gasBlock,
      gasTube,
      railBase,
      barrel,
      brake,
      foregrip,
      stock,
      buttPad,
      grip,
      triggerGuard,
      magMesh,
      boltMesh,
      sightHood,
      sightLens,
      sightDot
    );
    muzzleZ = isM4 ? -0.95 : -0.86;
  } else if (weaponId === 'smg') {
    // VECTOR-KRISS SMG: Futuristic CQB Submachine Gun with Angled Super-V Recoil Frame
    const upperBody = new THREE.Mesh(new THREE.BoxGeometry(0.088, 0.092, 0.42), darkMetal);
    upperBody.position.set(0, 0.028, -0.05);
    const vectorHousing = new THREE.Mesh(new THREE.BoxGeometry(0.082, 0.15, 0.14), accentMat);
    vectorHousing.position.set(0, -0.055, -0.18);
    vectorHousing.rotation.x = 0.18;
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.28, 10), gunMetal);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.015, -0.34);
    const holoSight = new THREE.Mesh(new THREE.BoxGeometry(0.058, 0.055, 0.09), gunMetal);
    holoSight.position.set(0, 0.095, -0.04);
    const sightDot = new THREE.Mesh(new THREE.SphereGeometry(0.007, 8, 8), reticleMat);
    sightDot.position.set(0, 0.098, -0.04);
    const foldingStock = new THREE.Mesh(new THREE.BoxGeometry(0.058, 0.085, 0.24), polymerMat);
    foldingStock.position.set(0, 0.01, 0.26);
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.056, 0.15, 0.08), polymerMat);
    grip.position.set(0, -0.095, 0.06);
    grip.rotation.x = -0.2;

    magMesh = new THREE.Mesh(new THREE.BoxGeometry(0.048, 0.26, 0.068), gunMetal);
    magMesh.position.set(0, -0.17, -0.19);
    magMesh.rotation.x = 0.22;
    magMesh.userData.basePos = magMesh.position.clone();

    boltMesh = new THREE.Mesh(new THREE.BoxGeometry(0.105, 0.028, 0.09), chromeMetal);
    boltMesh.position.set(0.015, 0.04, -0.1);
    boltMesh.userData.baseZ = -0.1;

    group.add(upperBody, vectorHousing, barrel, holoSight, sightDot, foldingStock, grip, magMesh, boltMesh);
    muzzleZ = -0.52;
  } else if (weaponId === 'lmg') {
    // ODIN-M249: Heavy Squad Automatic Machinegun with 80-Round Drum Box & Dual Barrel Shroud
    const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.125, 0.135, 0.56), darkMetal);
    receiver.position.set(0, 0.02, -0.04);
    const topCover = new THREE.Mesh(new THREE.BoxGeometry(0.115, 0.036, 0.34), accentMat);
    topCover.position.set(0, 0.095, -0.02);
    const shroud = new THREE.Mesh(new THREE.BoxGeometry(0.105, 0.11, 0.42), gunMetal);
    shroud.position.set(0, 0.015, -0.48);
    const heavyBarrel = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.48, 12), chromeMetal);
    heavyBarrel.rotation.x = Math.PI / 2;
    heavyBarrel.position.set(0, 0.028, -0.68);
    const muzzleBrake = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.032, 0.09, 10), accentMat);
    muzzleBrake.rotation.x = Math.PI / 2;
    muzzleBrake.position.set(0, 0.028, -0.92);
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.135, 0.28), polymerMat);
    stock.position.set(0, -0.01, 0.36);
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.064, 0.16, 0.09), polymerMat);
    grip.position.set(0, -0.115, 0.14);
    grip.rotation.x = -0.22;

    // 80-Round Box Drum Magazine
    magMesh = new THREE.Group();
    const boxDrum = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.22, 0.18), accentMat);
    const ammoBelt = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.09, 0.09), brassMat);
    ammoBelt.position.set(0, 0.12, 0);
    magMesh.add(boxDrum, ammoBelt);
    magMesh.position.set(0, -0.16, -0.14);
    magMesh.userData.basePos = magMesh.position.clone();

    boltMesh = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.036, 0.13), chromeMetal);
    boltMesh.position.set(0.025, 0.04, -0.06);
    boltMesh.userData.baseZ = -0.06;

    group.add(receiver, topCover, shroud, heavyBarrel, muzzleBrake, stock, grip, magMesh, boltMesh);
    muzzleZ = -0.96;
  } else if (weaponId === 'shotgun') {
    // BUCKSHOT-8: Heavy Tactical Combat Pump Shotgun with Heatshield & Side Shell Saddle
    const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.112, 0.142, 0.52), darkMetal);
    const barrelTop = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.62, 12), gunMetal);
    barrelTop.rotation.x = Math.PI / 2;
    barrelTop.position.set(0, 0.038, -0.48);

    // Ventilated Top Barrel Heatshield
    const heatshield = new THREE.Mesh(new THREE.BoxGeometry(0.062, 0.028, 0.44), darkMetal);
    heatshield.position.set(0, 0.056, -0.42);
    const magTube = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.56, 10), chromeMetal);
    magTube.rotation.x = Math.PI / 2;
    magTube.position.set(0, -0.012, -0.45);
    const barrelClamp = new THREE.Mesh(new THREE.BoxGeometry(0.058, 0.095, 0.045), accentMat);
    barrelClamp.position.set(0, 0.012, -0.66);
    const breacherChoke = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.028, 0.07, 10), accentMat);
    breacherChoke.rotation.x = Math.PI / 2;
    breacherChoke.position.set(0, 0.038, -0.8);

    // Sliding Ribbed Pump Forend (Acts as boltMesh so it pumps on each shot!)
    boltMesh = new THREE.Group();
    const pumpBody = new THREE.Mesh(new THREE.BoxGeometry(0.098, 0.082, 0.27), accentMat);
    const pumpRail = new THREE.Mesh(new THREE.BoxGeometry(0.072, 0.022, 0.36), chromeMetal);
    pumpRail.position.set(0, 0.02, 0.08);
    boltMesh.add(pumpBody, pumpRail);
    boltMesh.position.set(0, -0.022, -0.37);
    boltMesh.userData.baseZ = -0.37;

    // Side Shell Saddle with 4 Visible 12-Gauge Shells (Acts as magMesh)
    magMesh = new THREE.Group();
    const saddlePlate = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.085, 0.22), gunMetal);
    saddlePlate.position.set(0.058, 0.01, -0.02);
    magMesh.add(saddlePlate);
    for (let s = 0; s < 4; s++) {
      const shellHull = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.068, 8), accentMat);
      shellHull.position.set(0.068, 0.01, -0.09 + s * 0.045);
      const shellBrass = new THREE.Mesh(new THREE.CylinderGeometry(0.0115, 0.0115, 0.022, 8), brassMat);
      shellBrass.position.set(0.068, 0.036, -0.09 + s * 0.045);
      magMesh.add(shellHull, shellBrass);
    }
    magMesh.position.set(0, -0.01, 0.02);
    magMesh.userData.basePos = magMesh.position.clone();

    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.082, 0.125, 0.28), polymerMat);
    stock.position.set(0, -0.015, 0.35);
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.064, 0.16, 0.09), polymerMat);
    grip.position.set(0, -0.115, 0.17);
    grip.rotation.x = -0.28;

    const rearSight = new THREE.Mesh(new THREE.BoxGeometry(0.072, 0.04, 0.065), accentMat);
    rearSight.position.set(0, 0.09, 0.06);
    const frontPost = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.032, 0.025), reticleMat);
    frontPost.position.set(0, 0.075, -0.74);

    group.add(
      receiver,
      barrelTop,
      heatshield,
      magTube,
      barrelClamp,
      breacherChoke,
      boltMesh,
      magMesh,
      stock,
      grip,
      rearSight,
      frontPost
    );
    muzzleZ = -0.84;
  } else if (weaponId === 'sniper') {
    // AWP-PHANTOM: Anti-Materiel Long-Range Sniper Chassis with Dual-Bell Scope & Folded Bipod
    const chassis = new THREE.Mesh(new THREE.BoxGeometry(0.098, 0.138, 0.72), darkMetal);
    const cheekRest = new THREE.Mesh(new THREE.BoxGeometry(0.084, 0.055, 0.22), accentMat);
    cheekRest.position.set(0, 0.065, 0.38);

    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.025, 0.84, 12), gunMetal);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.028, -0.7);
    const muzzleBrake = new THREE.Mesh(new THREE.BoxGeometry(0.064, 0.052, 0.11), accentMat);
    muzzleBrake.position.set(0, 0.028, -1.12);

    // Folded Tactical Bipod Legs under Forend
    const bipodLeft = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.28, 6), chromeMetal);
    bipodLeft.rotation.x = Math.PI / 2;
    bipodLeft.position.set(-0.042, -0.055, -0.46);
    const bipodRight = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.28, 6), chromeMetal);
    bipodRight.rotation.x = Math.PI / 2;
    bipodRight.position.set(0.042, -0.055, -0.46);

    // High-Power Dual-Bell Telescopic Scope with Turrets & Glowing Objective Lens
    const scopeTube = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, 0.42, 14), darkMetal);
    scopeTube.rotation.x = Math.PI / 2;
    scopeTube.position.set(0, 0.135, -0.09);
    const frontBell = new THREE.Mesh(new THREE.CylinderGeometry(0.048, 0.034, 0.14, 14), accentMat);
    frontBell.rotation.x = Math.PI / 2;
    frontBell.position.set(0, 0.135, -0.28);
    const rearBell = new THREE.Mesh(new THREE.CylinderGeometry(0.034, 0.042, 0.1, 14), accentMat);
    rearBell.rotation.x = Math.PI / 2;
    rearBell.position.set(0, 0.135, 0.11);
    const lensGlass = new THREE.Mesh(new THREE.CircleGeometry(0.038, 12), glassMat);
    lensGlass.position.set(0, 0.135, 0.162);
    const turretTop = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.035, 8), chromeMetal);
    turretTop.position.set(0, 0.172, -0.07);
    const scopeMount = new THREE.Mesh(new THREE.BoxGeometry(0.056, 0.055, 0.22), gunMetal);
    scopeMount.position.set(0, 0.085, -0.09);

    // Detachable Heavy Box Magazine & Bolt Handle
    magMesh = new THREE.Mesh(new THREE.BoxGeometry(0.066, 0.175, 0.145), gunMetal);
    magMesh.position.set(0, -0.12, -0.08);
    magMesh.userData.basePos = magMesh.position.clone();

    boltMesh = new THREE.Group();
    const boltCarrier = new THREE.Mesh(new THREE.BoxGeometry(0.105, 0.032, 0.14), chromeMetal);
    const boltKnob = new THREE.Mesh(new THREE.SphereGeometry(0.022, 8, 8), darkMetal);
    boltKnob.position.set(0.068, -0.01, 0.02);
    boltMesh.add(boltCarrier, boltKnob);
    boltMesh.position.set(0.02, 0.038, 0.06);
    boltMesh.userData.baseZ = 0.06;

    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.13, 0.3), polymerMat);
    stock.position.set(0, -0.01, 0.44);
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.058, 0.155, 0.085), polymerMat);
    grip.position.set(0, -0.115, 0.16);
    grip.rotation.x = -0.24;

    group.add(
      chassis,
      cheekRest,
      barrel,
      muzzleBrake,
      bipodLeft,
      bipodRight,
      scopeTube,
      frontBell,
      rearBell,
      lensGlass,
      turretTop,
      scopeMount,
      magMesh,
      boltMesh,
      stock,
      grip
    );
    muzzleZ = -1.18;
  } else if (weaponId === 'knife') {
    // KARAMBIT-X: Curved Cyber Plasma-Edged Tactical Combat Knife with Finger Ring
    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.042, 0.16, 0.065), darkMetal);
    handle.position.set(0, -0.04, -0.08);
    handle.rotation.x = 0.25;
    const fingerRing = new THREE.Mesh(new THREE.TorusGeometry(0.028, 0.008, 8, 16), accentMat);
    fingerRing.rotation.y = Math.PI / 2;
    fingerRing.position.set(0, -0.13, -0.05);
    const guard = new THREE.Mesh(new THREE.BoxGeometry(0.052, 0.028, 0.095), gunMetal);
    guard.position.set(0, 0.04, -0.1);
    const bladeSpine = new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.065, 0.24), chromeMetal);
    bladeSpine.position.set(0, 0.09, -0.22);
    bladeSpine.rotation.x = -0.35;
    const plasmaEdge = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.018, 0.25), accentMat);
    plasmaEdge.position.set(0, 0.065, -0.23);
    plasmaEdge.rotation.x = -0.35;
    group.add(handle, fingerRing, guard, bladeSpine, plasmaEdge);
    muzzleZ = -0.35;
  } else {
    // SECONDARY PISTOLS: PULSE-P9 / SHERIFF .50 (Deagle) / FRENZY-G18 (Auto Glock)
    const isDeagle = weaponId === 'deagle';
    const isGlock = weaponId === 'glock';
    const slideLen = isDeagle ? 0.39 : 0.33;
    const frame = new THREE.Mesh(new THREE.BoxGeometry(0.072, 0.058, slideLen - 0.02), polymerMat);
    frame.position.set(0, -0.02, -0.03);

    // Underbarrel Tactical Flashlight / Laser Sight Module
    const laserBox = new THREE.Mesh(new THREE.BoxGeometry(0.058, 0.042, 0.11), gunMetal);
    laserBox.position.set(0, -0.052, -0.12);
    const laserLens = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.02, 8), reticleMat);
    laserLens.rotation.x = Math.PI / 2;
    laserLens.position.set(0, -0.052, -0.178);

    // Reciprocating Two-Tone Top Slide with Front/Rear Sight Posts
    boltMesh = new THREE.Group();
    const slideBody = new THREE.Mesh(
      new THREE.BoxGeometry(isDeagle ? 0.088 : 0.078, isDeagle ? 0.086 : 0.072, slideLen),
      isDeagle ? chromeMetal : accentMat
    );
    const ejectionPort = new THREE.Mesh(new THREE.BoxGeometry(0.082, 0.035, 0.075), chromeMetal);
    ejectionPort.position.set(0.002, 0.015, 0.01);
    const rearDot = new THREE.Mesh(new THREE.BoxGeometry(0.048, 0.024, 0.022), reticleMat);
    rearDot.position.set(0, 0.045, 0.13);
    const frontDot = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.022, 0.02), reticleMat);
    frontDot.position.set(0, 0.045, -0.14);
    boltMesh.add(slideBody, ejectionPort, rearDot, frontDot);
    boltMesh.position.set(0, 0.028, -0.03);
    boltMesh.userData.baseZ = -0.03;

    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.15, 10), chromeMetal);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.028, -0.22);

    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.066, 0.175, 0.092), darkMetal);
    grip.position.set(0, -0.105, 0.08);
    grip.rotation.x = -0.22;
    const triggerGuard = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.014, 0.08), polymerMat);
    triggerGuard.position.set(0, -0.068, 0.01);

    magMesh = new THREE.Group();
    const pMagBody = new THREE.Mesh(
      new THREE.BoxGeometry(0.054, isGlock ? 0.25 : 0.17, 0.076),
      gunMetal
    );
    const pMagBase = new THREE.Mesh(new THREE.BoxGeometry(0.068, 0.026, 0.092), accentMat);
    pMagBase.position.set(0, isGlock ? -0.13 : -0.088, 0);
    magMesh.add(pMagBody, pMagBase);
    magMesh.position.set(0, -0.115, 0.08);
    magMesh.rotation.x = -0.22;
    magMesh.userData.basePos = magMesh.position.clone();

    group.add(frame, laserBox, laserLens, boltMesh, barrel, grip, triggerGuard, magMesh);
    muzzleZ = isDeagle ? -0.35 : -0.31;
  }

  if (isFirstPerson) {
    // Scale first-person viewmodel by 1.14x so weapons feel weighty, closer, and detailed
    group.scale.setScalar(1.14);

    // First-Person Sculpted Human Forearms, Tactical Gloves, Articulated Fingers & Wrist Chrono-Watch
    const sleeveMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.5,
      metalness: 0.32
    });
    const gloveMat = new THREE.MeshStandardMaterial({
      color: 0x0f172a,
      roughness: 0.34,
      metalness: 0.55
    });
    const skinGuardMat = new THREE.MeshStandardMaterial({
      color: 0x334155,
      roughness: 0.3,
      metalness: 0.72
    });
    const cuffMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8 });

    // Right Trigger Hand (Sculpted Palm, Knuckle Bridge, Thumb & Curled Trigger Fingers) + Tapered Forearm
    const rightHandGroup = new THREE.Group();
    rightHandGroup.position.set(0.012, -0.105, 0.115);

    const rightPalm = new THREE.Mesh(new THREE.CapsuleGeometry(0.034, 0.048, 8, 12), gloveMat);
    rightPalm.rotation.x = Math.PI / 2.2;
    const rightKnuckle = new THREE.Mesh(new THREE.CapsuleGeometry(0.016, 0.056, 6, 10), skinGuardMat);
    rightKnuckle.rotation.z = Math.PI / 2;
    rightKnuckle.position.set(0.004, 0.025, -0.012);

    // Thumb wrapping around pistol grip
    const rightThumb = new THREE.Mesh(new THREE.CapsuleGeometry(0.012, 0.042, 6, 8), gloveMat);
    rightThumb.position.set(-0.032, 0.01, -0.018);
    rightThumb.rotation.set(0.45, 0.35, 0.55);

    // 4 Curled fingers around grip & trigger guard
    for (let f = 0; f < 4; f++) {
      const finger = new THREE.Mesh(new THREE.CapsuleGeometry(0.01, 0.044, 6, 8), gloveMat);
      finger.position.set(-0.014, -0.008 - f * 0.018, -0.036 + (f === 0 ? -0.018 : 0));
      finger.rotation.z = Math.PI / 2;
      finger.rotation.y = f === 0 ? -0.35 : 0.1;
      rightHandGroup.add(finger);
    }
    rightHandGroup.add(rightPalm, rightKnuckle, rightThumb);

    // Tapered Right Forearm & Vambrace
    const rightForearm = new THREE.Mesh(new THREE.CapsuleGeometry(0.044, 0.30, 8, 14), sleeveMat);
    rightForearm.rotation.x = Math.PI / 2 + 0.22;
    rightForearm.rotation.z = 0.16;
    rightForearm.position.set(0.062, -0.172, 0.31);
    const rightVambrace = new THREE.Mesh(new THREE.CylinderGeometry(0.046, 0.052, 0.18, 12), skinGuardMat);
    rightVambrace.rotation.x = Math.PI / 2 + 0.22;
    rightVambrace.rotation.z = 0.16;
    rightVambrace.position.set(0.048, -0.15, 0.24);
    const rightWristRing = new THREE.Mesh(new THREE.TorusGeometry(0.044, 0.006, 8, 16), cuffMat);
    rightWristRing.position.set(0.025, -0.122, 0.16);
    rightWristRing.rotation.y = -0.15;
    group.add(rightHandGroup, rightForearm, rightVambrace, rightWristRing);

    // Left Support Hand (C-Clamp Foreguard Grip), Holographic Wrist Chrono-Watch & Forearm
    const isOneHanded = WEAPONS[weaponId]?.slot === 2 || WEAPONS[weaponId]?.slot === 3;
    if (!isOneHanded) {
      const leftHandGroup = new THREE.Group();
      leftHandGroup.position.set(-0.022, -0.055, -0.33);

      const leftPalm = new THREE.Mesh(new THREE.CapsuleGeometry(0.034, 0.052, 8, 12), gloveMat);
      leftPalm.rotation.x = Math.PI / 2;
      const leftKnuckle = new THREE.Mesh(new THREE.CapsuleGeometry(0.015, 0.058, 6, 10), skinGuardMat);
      leftKnuckle.rotation.z = Math.PI / 2;
      leftKnuckle.position.set(-0.005, 0.022, 0);

      const leftThumb = new THREE.Mesh(new THREE.CapsuleGeometry(0.012, 0.045, 6, 8), gloveMat);
      leftThumb.position.set(-0.018, 0.032, -0.02);
      leftThumb.rotation.set(0.2, -0.4, -0.8);

      for (let f = 0; f < 4; f++) {
        const finger = new THREE.Mesh(new THREE.CapsuleGeometry(0.01, 0.046, 6, 8), gloveMat);
        finger.position.set(0.016, -0.018, -0.042 + f * 0.022);
        finger.rotation.z = Math.PI / 2.3;
        leftHandGroup.add(finger);
      }
      leftHandGroup.add(leftPalm, leftKnuckle, leftThumb);

      // Tactical Wrist Chrono-Watch with Glowing Cyan Dial
      const watchCase = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, 0.014, 14), darkMetal);
      watchCase.position.set(-0.054, -0.048, -0.22);
      watchCase.rotation.z = 0.35;
      const watchFace = new THREE.Mesh(new THREE.CylinderGeometry(0.019, 0.019, 0.016, 14), cuffMat);
      watchFace.position.copy(watchCase.position);
      watchFace.rotation.copy(watchCase.rotation);
      const leftWristStrap = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.008, 8, 16), darkMetal);
      leftWristStrap.position.set(-0.064, -0.078, -0.22);
      leftWristStrap.rotation.y = 0.42;

      // Tapered Left Forearm & Vambrace
      const leftForearm = new THREE.Mesh(new THREE.CapsuleGeometry(0.044, 0.34, 8, 14), sleeveMat);
      leftForearm.rotation.x = Math.PI / 2 + 0.25;
      leftForearm.rotation.z = -0.42;
      leftForearm.position.set(-0.16, -0.162, -0.055);
      const leftVambrace = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.05, 0.20, 12), skinGuardMat);
      leftVambrace.rotation.x = Math.PI / 2 + 0.25;
      leftVambrace.rotation.z = -0.42;
      leftVambrace.position.set(-0.115, -0.125, -0.135);

      group.add(leftHandGroup, watchCase, watchFace, leftWristStrap, leftForearm, leftVambrace);
    }

    // Multi-fin 3D Muzzle Flash at barrel tip
    const flashGroup = new THREE.Group();
    const flashMat = new THREE.MeshBasicMaterial({
      color: 0xfef08a,
      transparent: true,
      opacity: 0.94,
      side: THREE.DoubleSide
    });
    const coreCone = new THREE.Mesh(new THREE.ConeGeometry(0.082, 0.28, 6), flashMat);
    coreCone.rotation.x = -Math.PI / 2;
    const crossPlaneA = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.3), flashMat);
    const crossPlaneB = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.3), flashMat);
    crossPlaneA.rotation.y = Math.PI / 4;
    crossPlaneB.rotation.y = -Math.PI / 4;
    flashGroup.add(coreCone, crossPlaneA, crossPlaneB);
    flashGroup.position.set(0, 0.025, muzzleZ);
    flashGroup.visible = false;
    group.add(flashGroup);

    group.userData.flashMesh = flashGroup;
    group.userData.magMesh = magMesh;
    group.userData.boltMesh = boltMesh;
  } else {
    // Slightly larger third-person weapon scale so enemies' held weapons are clearly identifiable
    group.scale.setScalar(1.12);
    const tpFlash = new THREE.Mesh(
      new THREE.SphereGeometry(0.14, 6, 6),
      new THREE.MeshBasicMaterial({ color: 0xfef08a })
    );
    tpFlash.position.set(0, 0.02, muzzleZ);
    tpFlash.visible = false;
    group.add(tpFlash);
    group.userData.flashMesh = tpFlash;
  }

  return group;
}
