import * as THREE from '../three.js';
import { roundedBox } from './roundedBox.js';
import {
  buildDetailedOptic,
  buildErgonomicGripAndTrigger,
  createChamferedBlockGeometry,
  createLoftedTubeGeometry,
  createSteppedBarrelGeometry,
  getCachedExtrudeGeometry
} from './weaponMaterials.js';

export function buildSidearmMeleeGeometry(weaponId, group, mats) {
  const {
    darkMetal,
    gunMetal,
    polymerMat,
    fdeAnodizedMat,
    chromeMetal,
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

  if (weaponId === 'knife') {
    // ==================== KARAMBIT-X (SALTLINE MARITIME BOARDING KARAMBIT) ====================
    // Sculpted Multi-Station G10 Grip Scales with Ergonomic Finger Swells (Zero Neon Accents)
    const handleCore = new THREE.Mesh(
      createLoftedTubeGeometry(
        [
          { x: 0, y: 0.028, z: -0.096, rx: 0.013, ry: 0.024 },
          { x: 0, y: -0.010, z: -0.086, rx: 0.015, ry: 0.027 },
          { x: 0, y: -0.052, z: -0.074, rx: 0.015, ry: 0.026 },
          { x: 0, y: -0.096, z: -0.060, rx: 0.013, ry: 0.022 }
        ],
        12,
        true
      ),
      polymerMat
    );

    for (let g = 0; g < 3; g++) {
      const yg = 0.002 - g * 0.034;
      const zg = -0.088 + g * 0.010;
      const groove = new THREE.Mesh(new THREE.TorusGeometry(0.019, 0.0032, 6, 12), darkMetal);
      groove.position.set(0, yg, zg);
      groove.rotation.x = Math.PI / 2 + 0.26;
      const torxScrew = new THREE.Mesh(new THREE.CylinderGeometry(0.0038, 0.0038, 0.032, 12), chromeMetal);
      torxScrew.rotation.z = Math.PI / 2;
      torxScrew.position.set(0, yg, zg);
      group.add(groove, torxScrew);
    }

    // Bead-Blasted Titanium Retention Finger Ring + Dark-Nitride Chamfered Pommel Collar
    const fingerRing = new THREE.Mesh(new THREE.TorusGeometry(0.027, 0.0068, 12, 24), chromeMetal);
    fingerRing.rotation.y = Math.PI / 2;
    fingerRing.position.set(0, -0.126, -0.050);

    const ringBridge = new THREE.Mesh(roundedBox(0.016, 0.026, 0.026, 0.003, 1), gunMetal);
    ringBridge.position.set(0, -0.102, -0.056);
    ringBridge.rotation.x = 0.28;

    const bolsterGuard = new THREE.Mesh(
      createChamferedBlockGeometry(0.028, 0.046, 0.040, 0.006, 0.008, 0.006, 0.008),
      gunMetal
    );
    bolsterGuard.position.set(0, 0.038, -0.100);
    bolsterGuard.rotation.x = -0.18;

    // Continuous Curved DLC Hawkbill Talon Blade via THREE.ExtrudeGeometry (zero gaps, overlapping bolster >= 0.020m)
    const bladeBodyGeo = getCachedExtrudeGeometry('karambit_blade_body_v2', () => {
      const spinePts = [
        [0.094, 0.056],
        [0.128, 0.070],
        [0.168, 0.090],
        [0.208, 0.112],
        [0.248, 0.130],
        [0.286, 0.141],
        [0.314, 0.141],
        [0.324, 0.134]
      ];
      const edgePts = [
        [0.296, 0.120],
        [0.262, 0.098],
        [0.224, 0.076],
        [0.184, 0.055],
        [0.146, 0.036],
        [0.114, 0.022],
        [0.094, 0.022]
      ];
      const shape = new THREE.Shape();
      spinePts.forEach(([sx, sy], idx) => (idx === 0 ? shape.moveTo(sx, sy) : shape.lineTo(sx, sy)));
      for (const [ex, ey] of edgePts) shape.lineTo(ex, ey);
      shape.closePath();

      const depth = 0.0052;
      const geo = new THREE.ExtrudeGeometry(shape, {
        depth,
        bevelEnabled: true,
        bevelThickness: 0.0018,
        bevelSize: 0.0022,
        bevelSegments: 2,
        curveSegments: 1
      });
      geo.translate(0, 0, -depth * 0.5);
      geo.rotateY(Math.PI * 0.5);
      geo.computeVertexNormals();
      return geo;
    });
    const bladeBodyMesh = new THREE.Mesh(bladeBodyGeo, darkMetal);

    // Gleaming Honed Titanium Concave Cutting Bevel Strip hugging the blade edge
    const bladeBevelGeo = getCachedExtrudeGeometry('karambit_blade_bevel_v2', () => {
      const innerEdgePts = [
        [0.112, 0.025],
        [0.146, 0.041],
        [0.184, 0.060],
        [0.224, 0.081],
        [0.262, 0.103],
        [0.296, 0.123],
        [0.325, 0.134],
        [0.298, 0.116],
        [0.265, 0.094],
        [0.227, 0.072],
        [0.187, 0.051],
        [0.149, 0.032],
        [0.114, 0.018]
      ];
      const shape = new THREE.Shape();
      innerEdgePts.forEach(([sx, sy], idx) => (idx === 0 ? shape.moveTo(sx, sy) : shape.lineTo(sx, sy)));
      shape.closePath();

      const depth = 0.0024;
      const geo = new THREE.ExtrudeGeometry(shape, {
        depth,
        bevelEnabled: true,
        bevelThickness: 0.0010,
        bevelSize: 0.0010,
        bevelSegments: 1,
        curveSegments: 1
      });
      geo.translate(0, 0, -depth * 0.5);
      geo.rotateY(Math.PI * 0.5);
      geo.computeVertexNormals();
      return geo;
    });
    const bladeBevelMesh = new THREE.Mesh(bladeBevelGeo, chromeMetal);

    // Continuous Brushed Spine Fuller Highlight along upper curve
    const bladeFullerGeo = getCachedExtrudeGeometry('karambit_blade_fuller_v2', () => {
      const pts = [
        [0.126, 0.063],
        [0.168, 0.083],
        [0.208, 0.104],
        [0.248, 0.121],
        [0.276, 0.130],
        [0.270, 0.122],
        [0.244, 0.113],
        [0.204, 0.096],
        [0.164, 0.075],
        [0.124, 0.056]
      ];
      const shape = new THREE.Shape();
      pts.forEach(([sx, sy], idx) => (idx === 0 ? shape.moveTo(sx, sy) : shape.lineTo(sx, sy)));
      shape.closePath();

      const depth = 0.0064;
      const geo = new THREE.ExtrudeGeometry(shape, {
        depth,
        bevelEnabled: false,
        curveSegments: 1
      });
      geo.translate(0, 0, -depth * 0.5);
      geo.rotateY(Math.PI * 0.5);
      geo.computeVertexNormals();
      return geo;
    });
    const bladeFullerMesh = new THREE.Mesh(bladeFullerGeo, gunMetal);

    group.add(handleCore, fingerRing, ringBridge, bolsterGuard, bladeBodyMesh, bladeBevelMesh, bladeFullerMesh);
    muzzleZ = -0.34;
  } else {
    // ==================== SIDEARMS: PULSE-P9 (HK USP-T) / SHERIFF .50 (DEAGLE XIX) / FRENZY-G18C ====================
    const isDeagle = weaponId === 'deagle';
    const isGlock = weaponId === 'glock';
    const slideLen = isDeagle ? 0.38 : 0.31;

    // CNC Chamfered Lower Dust-Cover Frame with Accessory Rail Grooves
    const frame = new THREE.Mesh(
      createChamferedBlockGeometry(
        isDeagle ? 0.064 : 0.056,
        0.044,
        slideLen - 0.02,
        0.004,
        0.004,
        0.008,
        0.010
      ),
      isDeagle ? darkMetal : polymerMat
    );
    frame.position.set(0, -0.016, -0.03);

    const gripAsm = buildErgonomicGripAndTrigger(
      -0.036,
      0.075,
      polymerMat,
      darkMetal,
      chromeMetal
    );

    // Underbarrel SureFire X300U-B Weapon Light (Chamfered Twin-Battery Housing + Lathe Bezel + Titanium Reflector)
    const lightBody = new THREE.Mesh(
      createChamferedBlockGeometry(0.042, 0.028, 0.092, 0.006, 0.005, 0.008, 0.006),
      darkMetal
    );
    lightBody.position.set(0, -0.046, -0.114);

    const lightBezel = new THREE.Mesh(
      createSteppedBarrelGeometry(
        [
          [-0.155, 0.0145],
          [-0.165, 0.0165],
          [-0.186, 0.0165],
          [-0.189, 0.0140]
        ],
        16
      ),
      isDeagle ? gunMetal : fdeAnodizedMat
    );
    lightBezel.position.set(0, -0.046, 0);

    const lightLens = new THREE.Mesh(new THREE.CircleGeometry(0.0132, 14), chromeMetal);
    lightLens.rotation.y = Math.PI;
    lightLens.position.set(0, -0.046, -0.1895);

    // Lathe Match Barrel + Threaded Protector (USP-T) / Heavy Polygonal Barrel (Deagle) + Bore
    const barrelEndZ = isDeagle ? -0.258 : (isGlock ? -0.242 : -0.256);
    const barrel = new THREE.Mesh(
      createSteppedBarrelGeometry(
        [
          [-0.02, isDeagle ? 0.0165 : 0.0125],
          [barrelEndZ + 0.018, isDeagle ? 0.0165 : 0.0125],
          [barrelEndZ + 0.015, isDeagle ? 0.0165 : 0.0142],
          [barrelEndZ, isDeagle ? 0.0160 : 0.0142]
        ],
        16
      ),
      isDeagle ? chromeMetal : (isGlock ? gunMetal : darkMetal)
    );
    barrel.position.set(0, 0.026, 0);

    const muzzleBore = new THREE.Mesh(
      new THREE.CylinderGeometry(isDeagle ? 0.0115 : 0.0085, isDeagle ? 0.0115 : 0.0085, 0.012, 16),
      boreHoleMat
    );
    muzzleBore.rotation.x = Math.PI / 2;
    muzzleBore.position.set(0, 0.026, barrelEndZ);

    // Reciprocating CNC Octagonal Slide (`boltMesh`) with 45-Deg Chamfered Top Flats & Cocking Serrations
    boltMesh = new THREE.Group();
    const slideMat = isDeagle ? chromeMetal : (isGlock ? fdeAnodizedMat : gunMetal);
    const slideW = isDeagle ? 0.072 : 0.060;
    const slideH = isDeagle ? 0.056 : 0.048;

    const slideHull = new THREE.Mesh(
      createChamferedBlockGeometry(
        slideW,
        slideH,
        slideLen,
        slideW * 0.24,
        slideH * 0.30,
        0.003,
        0.003
      ),
      slideMat
    );
    slideHull.position.set(0, 0.004, 0);

    const ejectionPort = new THREE.Mesh(
      roundedBox(slideW * 0.92, 0.024, 0.068, 0.002, 1),
      isDeagle ? darkMetal : chromeMetal
    );
    ejectionPort.position.set(0.004, 0.014, 0.010);

    // Angled Rear & Front Slide Cocking Serrations + External Extractor
    for (let s = 0; s < 5; s++) {
      const rib = new THREE.Mesh(
        roundedBox(slideW + 0.003, 0.032, 0.005, 0.001, 1),
        darkMetal
      );
      rib.position.set(0, 0.002, 0.074 + s * 0.013);
      rib.rotation.x = -0.14;
      boltMesh.add(rib);
    }
    for (let fs = 0; fs < 3; fs++) {
      const frib = new THREE.Mesh(
        roundedBox(slideW + 0.002, 0.028, 0.0045, 0.001, 1),
        darkMetal
      );
      frib.position.set(0, 0.001, -slideLen * 0.29 + fs * 0.013);
      frib.rotation.x = -0.14;
      boltMesh.add(frib);
    }

    const extractorClaw = new THREE.Mesh(roundedBox(0.005, 0.008, 0.034, 0.001, 1), darkMetal);
    extractorClaw.position.set(slideW * 0.50, 0.006, 0.050);
    boltMesh.add(extractorClaw);

    // Glock 18C Compensator Top Port & Matte Hardcoat Rear Slide Fire-Selector Switch (Zero Neon!)
    if (isGlock) {
      const selector = new THREE.Mesh(new THREE.CylinderGeometry(0.010, 0.010, 0.010, 14), darkMetal);
      selector.rotation.z = Math.PI / 2;
      selector.position.set(-0.032, 0.008, 0.112);
      const selectorLever = new THREE.Mesh(roundedBox(0.006, 0.006, 0.022, 0.001, 1), chromeMetal);
      selectorLever.position.set(-0.036, 0.006, 0.106);
      selectorLever.rotation.x = 0.35;
      const topCompCut = new THREE.Mesh(roundedBox(0.022, 0.006, 0.044, 0.001, 1), boreHoleMat);
      topCompCut.position.set(0, 0.031, -0.095);
      boltMesh.add(selector, selectorLever, topCompCut);
    }

    // Co-witness front sight blade kept strictly below RMR sightline
    const frontSight = new THREE.Mesh(
      createChamferedBlockGeometry(0.010, 0.014, 0.018, 0.002, 0.003, 0.001, 0.001),
      darkMetal
    );
    frontSight.position.set(0, isDeagle ? 0.036 : 0.031, -slideLen * 0.43);

    boltMesh.add(slideHull, ejectionPort, frontSight);
    boltMesh.position.set(0, 0.024, -0.03);
    boltMesh.userData.baseZ = -0.03;

    // Slide-Mounted Micro Reflex Sight (RMR / SRO) parented directly to `boltMesh`
    const pistolOpticBaseY = isDeagle ? 0.070 : 0.062;
    const pistolRmr = buildDetailedOptic(
      'reflex',
      pistolOpticBaseY - 0.024,
      0.07,
      darkMetal,
      gunMetal,
      null,
      glassMat,
      redReticleMat
    );
    pistolRmr.scale.setScalar(0.86);
    boltMesh.add(pistolRmr);
    activeOptic = pistolRmr;
    opticCenterY = pistolOpticBaseY + 0.038 * 0.86;
    opticCenterZ = 0.04;

    // Detachable Steel Magazine (`magMesh` — Extended 33-Round Stick on G18C, Flared Baseplate on USP-T/Deagle)
    magMesh = new THREE.Group();
    const pMagH = isGlock ? 0.25 : 0.16;
    const pMagBody = new THREE.Mesh(
      createChamferedBlockGeometry(0.044, pMagH, 0.064, 0.005, 0.005, 0.005, 0.005),
      gunMetal
    );
    const pMagBase = new THREE.Mesh(
      createChamferedBlockGeometry(0.056, 0.022, 0.078, 0.006, 0.004, 0.006, 0.004),
      darkMetal
    );
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
