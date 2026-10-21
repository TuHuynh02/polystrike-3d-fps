import * as THREE from '../three.js';
import {
  buildCurvedMagazine,
  buildDetailedOptic,
  buildErgonomicGripAndTrigger,
  buildPicatinnyRail
} from './weaponMaterials.js';

export function buildSidearmMeleeGeometry(weaponId, group, mats) {
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

  if (weaponId === 'knife') {
    // ==================== KARAMBIT-X (CUSTOM CURVED TACTICAL COMBAT KARAMBIT) ====================
    // Ergonomic Contoured G10 Grip Scales with Finger Grooves & Torx Screws
    const handleCore = new THREE.Mesh(new THREE.CapsuleGeometry(0.019, 0.115, 8, 12), polymerMat);
    handleCore.scale.set(0.75, 1, 1.38);
    handleCore.position.set(0, -0.035, -0.08);
    handleCore.rotation.x = 0.24;

    for (let g = 0; g < 3; g++) {
      const groove = new THREE.Mesh(new THREE.TorusGeometry(0.021, 0.004, 6, 12), darkMetal);
      groove.position.set(0, -0.01 - g * 0.032, -0.075 + g * 0.008);
      groove.rotation.x = Math.PI / 2 + 0.24;
      const screw = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.032, 8), chromeMetal);
      screw.rotation.z = Math.PI / 2;
      screw.position.set(0, -0.01 - g * 0.032, -0.075 + g * 0.008);
      group.add(groove, screw);
    }

    // Chamfered Anodized Retention Finger Ring at Pommel
    const fingerRing = new THREE.Mesh(new THREE.TorusGeometry(0.028, 0.0075, 12, 24), accentMat);
    fingerRing.rotation.y = Math.PI / 2;
    fingerRing.position.set(0, -0.128, -0.052);

    const bolsterGuard = new THREE.Mesh(new THREE.CylinderGeometry(0.020, 0.022, 0.072, 10), gunMetal);
    bolsterGuard.rotation.x = Math.PI / 2;
    bolsterGuard.scale.set(0.88, 1, 0.58);
    bolsterGuard.position.set(0, 0.036, -0.098);

    // Multi-Segment Curved Hawkbill Claw Blade with Fuller Groove & Razor Bevel Edge
    const bladeSegs = 6;
    let by = 0.048;
    let bz = -0.115;
    let bAngle = -0.20;
    for (let b = 0; b < bladeSegs; b++) {
      const segW = 0.042 * (1 - b * 0.13);
      const segLen = 0.042;
      const spine = new THREE.Mesh(new THREE.BoxGeometry(0.009, segW, segLen), darkMetal);
      spine.position.set(0, by, bz);
      spine.rotation.x = bAngle;

      const bevelEdge = new THREE.Mesh(new THREE.BoxGeometry(0.005, segW * 0.48, segLen + 0.004), chromeMetal);
      bevelEdge.position.set(0, by - segW * 0.35, bz - 0.004);
      bevelEdge.rotation.x = bAngle;

      group.add(spine, bevelEdge);
      by += Math.sin(-bAngle) * segLen * 0.86;
      bz -= Math.cos(-bAngle) * segLen * 0.86;
      bAngle -= 0.15;
    }

    group.add(handleCore, fingerRing, bolsterGuard);
    muzzleZ = -0.34;
  } else {
    // ==================== SECONDARY PISTOLS: PULSE-P9 (USP-T) / SHERIFF .50 (DEAGLE) / FRENZY-G18 ====================
    const isDeagle = weaponId === 'deagle';
    const isGlock = weaponId === 'glock';
    const slideLen = isDeagle ? 0.38 : 0.31;

    // Polymer/Steel Lower Frame with Dust Cover & Picatinny Accessory Rail
    const frame = new THREE.Mesh(
      new THREE.BoxGeometry(isDeagle ? 0.068 : 0.060, 0.046, slideLen - 0.02),
      isDeagle ? darkMetal : polymerMat
    );
    frame.position.set(0, -0.016, -0.03);

    const gripAsm = buildErgonomicGripAndTrigger(-0.036, 0.075, polymerMat, darkMetal, chromeMetal);

    // Underbarrel SureFire X300 Weapon Light / Tactical Laser Module
    const lightBody = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.095, 10), darkMetal);
    lightBody.rotation.x = Math.PI / 2;
    lightBody.scale.set(1.05, 0.78, 1);
    lightBody.position.set(0, -0.046, -0.115);
    const lightBezel = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.018, 0.028, 14), gunMetal);
    lightBezel.rotation.x = Math.PI / 2;
    lightBezel.position.set(0, -0.046, -0.172);
    const lightLens = new THREE.Mesh(new THREE.CircleGeometry(0.014, 14), reticleMat);
    lightLens.position.set(0, -0.046, -0.187);

    // Precision Cylindrical Barrel + Threaded Tip + Dark Bore Hole
    const barrelLen = isDeagle ? 0.24 : 0.21;
    const barrel = new THREE.Mesh(
      new THREE.CylinderGeometry(isDeagle ? 0.017 : 0.013, isDeagle ? 0.017 : 0.013, barrelLen, 14),
      isDeagle ? chromeMetal : darkMetal
    );
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.028, -0.14);
    const muzzleBore = new THREE.Mesh(
      new THREE.CylinderGeometry(isDeagle ? 0.012 : 0.009, isDeagle ? 0.012 : 0.009, 0.012, 10),
      boreHoleMat
    );
    muzzleBore.rotation.x = Math.PI / 2;
    muzzleBore.position.set(0, 0.028, isDeagle ? -0.258 : -0.242);

    // Reciprocating Top Slide (`boltMesh`) with Beveled Crown, Cocking Serrations, Ejection Port & 3-Dot Night Sights
    boltMesh = new THREE.Group();
    const slideMat = isDeagle ? chromeMetal : gunMetal;
    const slideLower = new THREE.Mesh(
      new THREE.BoxGeometry(isDeagle ? 0.078 : 0.066, isDeagle ? 0.056 : 0.048, slideLen),
      slideMat
    );
    const slideCrown = new THREE.Mesh(
      new THREE.CylinderGeometry(isDeagle ? 0.039 : 0.033, isDeagle ? 0.039 : 0.033, slideLen, 12),
      slideMat
    );
    slideCrown.rotation.x = Math.PI / 2;
    slideCrown.scale.set(1, 1, 0.42);
    slideCrown.position.set(0, isDeagle ? 0.028 : 0.024, 0);

    const ejectionPort = new THREE.Mesh(new THREE.BoxGeometry(0.072, 0.026, 0.068), isDeagle ? darkMetal : chromeMetal);
    ejectionPort.position.set(0.005, 0.014, 0.01);

    // Rear Slide Cocking Serration Ribs
    for (let s = 0; s < 5; s++) {
      const rib = new THREE.Mesh(
        new THREE.BoxGeometry(isDeagle ? 0.081 : 0.069, 0.038, 0.006),
        darkMetal
      );
      rib.position.set(0, 0.004, 0.075 + s * 0.014);
      boltMesh.add(rib);
    }

    // Glock 18C Fire Selector Switch on Rear Left of Slide
    if (isGlock) {
      const selector = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.012, 10), accentMat);
      selector.rotation.z = Math.PI / 2;
      selector.position.set(-0.036, 0.008, 0.11);
      boltMesh.add(selector);
    }

    const frontSight = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.016, 0.020), darkMetal);
    frontSight.position.set(0, isDeagle ? 0.044 : 0.038, -slideLen * 0.43);
    const frontDot = new THREE.Mesh(new THREE.SphereGeometry(0.004, 8, 8), reticleMat);
    frontDot.position.set(0, isDeagle ? 0.048 : 0.042, -slideLen * 0.42);

    boltMesh.add(slideLower, slideCrown, ejectionPort, frontSight, frontDot);
    boltMesh.position.set(0, 0.024, -0.03);
    boltMesh.userData.baseZ = -0.03;

    // Compact Micro Red-Dot Reflex Sight (RMR / DeltaPoint) mounted directly onto Rear Slide (`boltMesh`)
    const pistolOpticBaseY = isDeagle ? 0.070 : 0.062;
    const pistolRmr = buildDetailedOptic(
      'reflex',
      pistolOpticBaseY - 0.024,
      0.07,
      darkMetal,
      gunMetal,
      accentMat,
      glassMat,
      redReticleMat
    );
    pistolRmr.scale.setScalar(0.86);
    boltMesh.add(pistolRmr);
    activeOptic = pistolRmr;
    opticCenterY = pistolOpticBaseY + 0.038 * 0.86;
    opticCenterZ = 0.04;

    // Detachable Magazine (`magMesh` — Extended 33-Round Mag for Glock 18, Heavy Mag for Deagle/P9)
    magMesh = new THREE.Group();
    const pMagH = isGlock ? 0.25 : 0.16;
    const pMagBody = new THREE.Mesh(new THREE.BoxGeometry(0.046, pMagH, 0.068), gunMetal);
    const pMagBase = new THREE.Mesh(new THREE.BoxGeometry(0.058, 0.024, 0.082), darkMetal);
    pMagBase.position.set(0, -pMagH * 0.52, 0);
    magMesh.add(pMagBody, pMagBase);
    magMesh.position.set(0, -0.11, 0.085);
    magMesh.rotation.x = -0.28;
    magMesh.userData.basePos = magMesh.position.clone();

    group.add(frame, gripAsm, lightBody, lightBezel, lightLens, barrel, muzzleBore, boltMesh, magMesh);
    muzzleZ = isDeagle ? -0.28 : -0.26;
  }

  return { magMesh, boltMesh, activeOptic, opticCenterY, opticCenterZ, muzzleZ };
}
