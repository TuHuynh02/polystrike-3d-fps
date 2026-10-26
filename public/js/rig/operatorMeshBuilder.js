import * as THREE from '../three.js';
import { createWeaponMesh } from '../weaponModels.js';
import { HITBOX_PART_DEFS } from '../shared.js';
import {
  ENEMY_OUTLINE_MAT,
  HITBOX_PROXY_MAT,
  TEAMMATE_OUTLINE_MAT,
  batchBoneScope,
  createProceduralMaterial,
  getCachedGeo,
  getCachedMat
} from './rigMaterialsAndBatching.js';

export function createRemotePlayerMesh(playerData = {}, options = {}) {
  const isShowcase = Boolean(options.isShowcase);
  const group = new THREE.Group();
  const pColor = playerData.color || options.defaultColor || 0xe5a024;

  if (isShowcase && typeof document !== 'undefined') {
    const lobbyEl = document.getElementById('lobby-screen');
    if (lobbyEl && lobbyEl.style) {
      lobbyEl.style.backdropFilter = 'none';
      lobbyEl.style.webkitBackdropFilter = 'none';
      lobbyEl.style.background =
        'radial-gradient(circle at 50% 42%, rgba(30, 46, 68, 0.08) 0%, rgba(10, 16, 28, 0.56) 68%, rgba(5, 9, 18, 0.78) 100%)';
    }
  }

  // Authentic Special Forces PBR Material Palette (CS2 / MW / Ready or Not)
  // 1. Tactical Patch / Team Identification Trim (responds to suit color swatch)
  let mainMat = getCachedMat(isShowcase ? 'main_showcase' : `main_${pColor}`, () => {
    const m = new THREE.MeshStandardMaterial({
      color: pColor,
      roughness: 0.38,
      metalness: 0.28
    });
    m.userData = { matSlotKey: 'main' };
    return m;
  });
  if (isShowcase) {
    mainMat.color.setHex(pColor);
  }

  // 2. Ripstop BDU Combat Shirt & Cargo Pants (Dark Charcoal / Olive-Slate)
  const bduMat = getCachedMat('bdu_0x262e36', () =>
    createProceduralMaterial('bdu', 0x262e36, {
      roughness: 0.78,
      metalness: 0.06
    })
  );

  // 3. Crye JPC 2.0 Plate Carrier, MOLLE Pouches & Battle Belt (Coyote / Ranger Tan)
  const vestMat = getCachedMat('cordura_0x625748', () =>
    createProceduralMaterial('cordura', 0x625748, {
      roughness: 0.66,
      metalness: 0.12
    })
  );

  // 4. Secondary Webbing, Straps, Ribbed Balaclava & Shemagh Fabric
  const webbingMat = getCachedMat('bdu_0x1a1f25', () =>
    createProceduralMaterial('bdu', 0x1a1f25, {
      roughness: 0.74,
      metalness: 0.10,
      bumpScale: 0.012
    })
  );

  // 5. Matte Ballistic Kevlar Helmet, NVG Housing & Hard Polymer Armor Shells
  const armorMat = getCachedMat('kevlar_0x2c3430', () =>
    createProceduralMaterial('kevlar', 0x2c3430, {
      roughness: 0.42,
      metalness: 0.28
    })
  );

  // 6. Sculpted Human Skin (Brow, Nose Bridge, Cheekbones)
  const skinMat = getCachedMat('skin_0xf6c8a8', () =>
    new THREE.MeshStandardMaterial({
      color: 0xf6c8a8,
      roughness: 0.42,
      metalness: 0.02,
      emissive: 0x5c341e,
      emissiveIntensity: 0.22
    })
  );
  skinMat.userData = { shared: true, matSlotKey: 'skin' };

  // 7. Anodized Gunmetal Hardware, Wilcox NVG Mount, Radio Antenna & Buckle Trim
  const chromeMat = getCachedMat('chrome_0x64748b', () =>
    new THREE.MeshStandardMaterial({
      color: 0x64748b,
      roughness: 0.24,
      metalness: 0.86
    })
  );

  // 8. Full-Grain Dark Combat Leather Boots & Mechanix Gloves
  const bootMat = getCachedMat('leather_0x17191d', () =>
    createProceduralMaterial('leather', 0x17191d, {
      roughness: 0.48,
      metalness: 0.18
    })
  );

  // 9. Tinted Ballistic Combat Goggles Lens (Iridium Polarized Sheen + Enemy Red Highlight)
  const enemyVisorMat = getCachedMat('visor_enemy', () => {
    const m = new THREE.MeshStandardMaterial({
      color: 0x111827,
      emissive: 0xff2222,
      emissiveIntensity: 0.45,
      roughness: 0.10,
      metalness: 0.88
    });
    m.userData = { matSlotKey: 'visor' };
    return m;
  });
  const visorMat = isShowcase
    ? getCachedMat('visor_showcase', () => {
        const m = new THREE.MeshStandardMaterial({
          color: 0x111827,
          emissive: pColor,
          emissiveIntensity: 0.18,
          roughness: 0.10,
          metalness: 0.88
        });
        m.userData = { matSlotKey: 'visor' };
        return m;
      })
    : enemyVisorMat;
  if (isShowcase) {
    visorMat.emissive.setHex(pColor);
  }

  // 10. Coated NVG Objective Glass Lens (Subtle Phosphor Teal Reflection)
  const nvgLensMat = getCachedMat('nvgLens_0x064e3b', () =>
    new THREE.MeshStandardMaterial({
      color: 0x064e3b,
      emissive: 0x10b981,
      emissiveIntensity: 0.22,
      roughness: 0.08,
      metalness: 0.92
    })
  );

  const hitboxParts = [];
  const tagBodyHitbox = (mesh) => {
    mesh.userData = {
      ...mesh.userData,
      playerId: playerData.id,
      isHeadshot: false,
      isHead: false,
      zone: 'body',
      hitbox: { playerId: playerData.id, zone: 'body', isHeadshot: false, isHead: false }
    };
    return mesh;
  };
  const tagHeadHitbox = (mesh) => {
    mesh.userData = {
      ...mesh.userData,
      playerId: playerData.id,
      isHeadshot: true,
      isHead: true,
      zone: 'head',
      hitbox: { playerId: playerData.id, zone: 'head', isHeadshot: true, isHead: true }
    };
    return mesh;
  };

  // ==================== 1. PELVIS, HIPS & RONIN MOLLE TACTICAL BATTLE BELT ====================
  const pelvisGroup = new THREE.Group();
  pelvisGroup.position.set(0, 0.80, 0);
  group.add(pelvisGroup);

  // Separate visual pelvis container from pelvisGroup so lean animation can smoothly tilt/bridge the waist
  // while pelvisHitboxProxy on pelvisGroup remains at exact (0, hipY, 0) server parity.
  const pelvisVisualGroup = new THREE.Group();
  pelvisGroup.add(pelvisVisualGroup);

  // Anatomical Pelvis & Hip Block
  const pelvisCore = new THREE.Mesh(
    getCachedGeo('pelvisCore', () => new THREE.CylinderGeometry(0.168, 0.154, 0.19, 22)),
    bduMat
  );
  pelvisCore.scale.set(1.42, 1.10, 0.96);
  pelvisCore.castShadow = true;
  tagBodyHitbox(pelvisCore);
  pelvisVisualGroup.add(pelvisCore);

  // Upper Pelvis / Waist Socket Dome centered at the spine pivot (y = 0.096)
  const waistSocketDome = new THREE.Mesh(
    getCachedGeo('waistSocketDome', () => new THREE.SphereGeometry(0.172, 20, 14)),
    bduMat
  );
  waistSocketDome.scale.set(1.38, 0.92, 0.92);
  waistSocketDome.position.set(0, 0.092, 0);

  // Contoured Hip Socket Caps concentric with the left/right thigh hipBall joints at x = +-0.145, y = 0
  const hipSocketGeo = getCachedGeo('hipSocketCap', () => new THREE.SphereGeometry(0.126, 18, 14));
  const hipSocketL = new THREE.Mesh(hipSocketGeo, bduMat);
  hipSocketL.scale.set(1.04, 1.04, 1.02);
  hipSocketL.position.set(-0.145, 0, 0);
  const hipSocketR = new THREE.Mesh(hipSocketGeo, bduMat);
  hipSocketR.scale.set(1.04, 1.04, 1.02);
  hipSocketR.position.set(0.145, 0, 0);

  // Contoured Gluteal & Groin Anatomical Volumes
  const groinGuard = new THREE.Mesh(
    getCachedGeo('groinGuard', () => new THREE.CapsuleGeometry(0.082, 0.080, 10, 14)),
    bduMat
  );
  groinGuard.position.set(0, -0.032, -0.056);
  groinGuard.castShadow = false;

  const gluteGeo = getCachedGeo('gluteContour', () => new THREE.SphereGeometry(0.104, 14, 12));
  const gluteL = new THREE.Mesh(gluteGeo, bduMat);
  gluteL.scale.set(1.12, 1.14, 0.96);
  gluteL.position.set(-0.102, -0.016, 0.068);
  const gluteR = new THREE.Mesh(gluteGeo, bduMat);
  gluteR.scale.set(1.12, 1.14, 0.96);
  gluteR.position.set(0.102, -0.016, 0.068);

  // Ronin Padded MOLLE Battle Belt + Inner Velcro Belt + AustriAlpin Cobra Buckle
  const beltRing = new THREE.Mesh(
    getCachedGeo('beltRing', () => new THREE.CylinderGeometry(0.185, 0.185, 0.068, 22)),
    vestMat
  );
  beltRing.scale.set(1.42, 1.08, 0.98);
  beltRing.position.set(0, 0.065, 0);
  beltRing.castShadow = false;

  const beltInnerStrap = new THREE.Mesh(
    getCachedGeo('beltInnerStrap', () => new THREE.CylinderGeometry(0.188, 0.188, 0.030, 22)),
    webbingMat
  );
  beltInnerStrap.scale.set(1.42, 1.08, 0.98);
  beltInnerStrap.position.set(0, 0.065, 0);
  beltInnerStrap.castShadow = false;

  const cobraBuckle = new THREE.Mesh(
    getCachedGeo('cobraBuckle', () => new THREE.CylinderGeometry(0.026, 0.026, 0.052, 14)),
    chromeMat
  );
  cobraBuckle.rotation.z = Math.PI / 2;
  cobraBuckle.scale.set(1, 1, 0.52);
  cobraBuckle.position.set(0, 0.065, -0.166);
  cobraBuckle.castShadow = false;

  // Two M67 Fragmentation Grenades clipped on front-side belt (Spherical Body + Fuze + Safety Lever + Pull Ring)
  const gBodyGeo = getCachedGeo('beltGrenadeBody', () => new THREE.SphereGeometry(0.034, 14, 12));
  const gFuzeGeo = getCachedGeo('beltGrenadeFuze', () => new THREE.CylinderGeometry(0.011, 0.015, 0.028, 12));
  const gSpoonGeo = getCachedGeo('beltGrenadeSpoon', () => new THREE.CapsuleGeometry(0.006, 0.042, 6, 8));
  const gRingGeo = getCachedGeo('beltGrenadeRing', () => new THREE.TorusGeometry(0.011, 0.0025, 8, 12));
  const buildBeltGrenade = (xPos) => {
    const gGroup = new THREE.Group();
    const gBody = new THREE.Mesh(gBodyGeo, armorMat);
    gBody.scale.set(1, 1.16, 1);
    const gFuze = new THREE.Mesh(gFuzeGeo, chromeMat);
    gFuze.position.y = 0.038;
    const gSpoon = new THREE.Mesh(gSpoonGeo, chromeMat);
    gSpoon.position.set(0.015, 0.014, 0);
    gSpoon.rotation.z = 0.18;
    const gPin = new THREE.Mesh(gRingGeo, chromeMat);
    gPin.position.set(-0.012, 0.036, 0.008);
    gGroup.add(gBody, gFuze, gSpoon, gPin);
    gGroup.position.set(xPos, 0.052, -0.138);
    return gGroup;
  };
  const fragL = buildBeltGrenade(-0.158);
  const fragR = buildBeltGrenade(0.158);

  // Left Hip Contoured Double Pistol Mag Pouches & Rear Rolled Dump Pouch + Cylindrical IFAK Trauma Roll
  const sidePouchGeo = getCachedGeo('sidePouchContoured', () => new THREE.CapsuleGeometry(0.024, 0.055, 8, 12));
  const sidePouchL1 = new THREE.Mesh(sidePouchGeo, vestMat);
  sidePouchL1.position.set(-0.232, 0.058, -0.032);
  const sidePouchL2 = new THREE.Mesh(sidePouchGeo, vestMat);
  sidePouchL2.position.set(-0.232, 0.058, 0.022);

  const dumpPouchRear = new THREE.Mesh(
    getCachedGeo('dumpPouchRear', () => new THREE.CapsuleGeometry(0.046, 0.078, 10, 14)),
    webbingMat
  );
  dumpPouchRear.position.set(-0.125, 0.028, 0.165);

  const ifakRollRear = new THREE.Mesh(
    getCachedGeo('ifakRollRear', () => {
      const g = new THREE.CapsuleGeometry(0.038, 0.075, 10, 14);
      g.rotateZ(Math.PI / 2);
      return g;
    }),
    vestMat
  );
  ifakRollRear.position.set(0.062, 0.062, 0.172);

  const ifakCross = new THREE.Mesh(
    getCachedGeo('ifakCross', () => new THREE.CylinderGeometry(0.018, 0.018, 0.012, 14)),
    mainMat
  );
  ifakCross.rotation.x = Math.PI / 2;
  ifakCross.position.set(0.062, 0.062, 0.208);

  pelvisVisualGroup.add(
    waistSocketDome,
    hipSocketL,
    hipSocketR,
    groinGuard,
    gluteL,
    gluteR,
    beltRing,
    beltInnerStrap,
    cobraBuckle,
    fragL,
    fragR,
    sidePouchL1,
    sidePouchL2,
    dumpPouchRear,
    ifakRollRear,
    ifakCross
  );

  // ==================== 2. ANATOMICAL UPPER TORSO & CRYE JPC 2.0 PLATE CARRIER ====================
  const upperBodyGroup = new THREE.Group();
  upperBodyGroup.position.set(0, 0.10, 0); // World y = 0.90
  pelvisGroup.add(upperBodyGroup);

  // Separate visual torso container from chestGroup so lean/prone articulation keeps the waist connected
  // while chestGroup (parent of torsoHitboxProxy & headGroup) matches shared/hitboxes.js identically.
  const torsoVisualGroup = new THREE.Group();
  upperBodyGroup.add(torsoVisualGroup);

  // Primary Anatomical Torso Hitbox & BDU Combat Shirt Core (bottom cap at y = 0 pivot so prone pitch never protrudes)
  const torsoGeo = getCachedGeo('torsoGeo', () => new THREE.CylinderGeometry(0.238, 0.176, 0.56, 22));
  const torsoMesh = new THREE.Mesh(torsoGeo, bduMat);
  torsoMesh.scale.set(1.38, 1.06, 0.92);
  torsoMesh.position.set(0, 0.295, 0);
  torsoMesh.castShadow = true;
  tagBodyHitbox(torsoMesh);
  torsoVisualGroup.add(torsoMesh);

  // Concentric Lumbar Ball Joint centered right at the upperBodyGroup pivot (0, 0, 0)
  const lumbarBallJoint = new THREE.Mesh(
    getCachedGeo('lumbarBallJoint', () => new THREE.SphereGeometry(0.174, 20, 14)),
    bduMat
  );
  lumbarBallJoint.scale.set(1.38, 0.94, 0.92);
  lumbarBallJoint.position.set(0, 0.004, 0);
  torsoVisualGroup.add(lumbarBallJoint);

  // Nested Chest Group inside Spine (upperBodyGroup) for hierarchical rig compatibility
  const chestGroup = new THREE.Group();
  chestGroup.position.set(0, 0, 0);
  upperBodyGroup.add(chestGroup);

  // Upper Chest / Latissimus Dorsi Muscular V-Taper Contour
  const upperChestBroad = new THREE.Mesh(
    getCachedGeo('upperChestBroad', () => new THREE.CapsuleGeometry(0.156, 0.22, 12, 18)),
    bduMat
  );
  upperChestBroad.rotation.z = Math.PI / 2;
  upperChestBroad.scale.set(1.14, 1.16, 0.88);
  upperChestBroad.position.set(0, 0.40, 0);
  upperChestBroad.castShadow = true;
  tagBodyHitbox(upperChestBroad);
  torsoVisualGroup.add(upperChestBroad);

  // Shoulder / Armpit Socket Bridges (connect upper torso to deltoid pivots at x = +-0.255, y = 0.46)
  const shoulderSocketGeo = getCachedGeo('shoulderSocketBridge', () => new THREE.SphereGeometry(0.102, 14, 12));
  const shoulderSocketL = new THREE.Mesh(shoulderSocketGeo, bduMat);
  shoulderSocketL.scale.set(1.18, 1.14, 1.08);
  shoulderSocketL.position.set(-0.230, 0.450, -0.012);
  const shoulderSocketR = new THREE.Mesh(shoulderSocketGeo, bduMat);
  shoulderSocketR.scale.set(1.18, 1.14, 1.08);
  shoulderSocketR.position.set(0.232, 0.450, 0.005);
  torsoVisualGroup.add(shoulderSocketL, shoulderSocketR);

  // Anatomical Trapezius Shoulder Slopes (smooth organic transition from neck to deltoids)
  const trapGeo = getCachedGeo('trapeziusSlope', () => new THREE.CapsuleGeometry(0.058, 0.16, 8, 12));
  const trapeziusL = new THREE.Mesh(trapGeo, bduMat);
  trapeziusL.position.set(-0.135, 0.508, 0.006);
  trapeziusL.rotation.z = 0.52;
  trapeziusL.scale.set(1.0, 1.0, 0.94);
  const trapeziusR = new THREE.Mesh(trapGeo, bduMat);
  trapeziusR.position.set(0.135, 0.508, 0.006);
  trapeziusR.rotation.z = -0.52;
  trapeziusR.scale.set(1.0, 1.0, 0.94);

  // Sculpted Contoured Front SAPI Plate Carrier Bag (Smooth Rounded Capsule instead of faceted 8-sided prism)
  const frontPlateCore = new THREE.Mesh(
    getCachedGeo('frontPlateCoreSmooth', () => new THREE.CapsuleGeometry(0.162, 0.12, 10, 18)),
    vestMat
  );
  frontPlateCore.scale.set(1.12, 1.02, 0.32);
  frontPlateCore.position.set(0, 0.31, -0.158);
  frontPlateCore.castShadow = true;

  const frontUpperBevel = new THREE.Mesh(
    getCachedGeo('frontUpperBevelSmooth', () => {
      const g = new THREE.CapsuleGeometry(0.056, 0.11, 8, 14);
      g.rotateZ(Math.PI / 2);
      return g;
    }),
    vestMat
  );
  frontUpperBevel.scale.set(1.08, 0.85, 0.46);
  frontUpperBevel.position.set(0, 0.468, -0.156);

  // Rear Ballistic SAPI Plate Bag + Contoured Haley Strategic FlatPack Assault Pack
  const rearPlateCore = new THREE.Mesh(
    getCachedGeo('rearPlateCoreSmooth', () => new THREE.CapsuleGeometry(0.158, 0.13, 10, 18)),
    vestMat
  );
  rearPlateCore.scale.set(0.98, 1.0, 0.28);
  rearPlateCore.position.set(0, 0.32, 0.158);
  rearPlateCore.castShadow = true;

  const assaultPackMain = new THREE.Mesh(
    getCachedGeo('assaultPackMain', () => new THREE.CapsuleGeometry(0.095, 0.14, 12, 16)),
    vestMat
  );
  assaultPackMain.scale.set(1.22, 1, 0.56);
  assaultPackMain.position.set(0, 0.34, 0.212);
  assaultPackMain.castShadow = true;

  const assaultPackLower = new THREE.Mesh(
    getCachedGeo('assaultPackLower', () => {
      const g = new THREE.CapsuleGeometry(0.048, 0.13, 10, 14);
      g.rotateZ(Math.PI / 2);
      return g;
    }),
    webbingMat
  );
  assaultPackLower.position.set(0, 0.23, 0.245);

  const packTopRoll = new THREE.Mesh(
    getCachedGeo('packTopRoll', () => {
      const g = new THREE.CylinderGeometry(0.038, 0.038, 0.21, 16);
      g.rotateZ(Math.PI / 2);
      return g;
    }),
    webbingMat
  );
  packTopRoll.position.set(0, 0.475, 0.215);

  // Contoured Skeletal Cummerbund Side Bands + Side Trauma Plate Pouches
  const cummerbundGeo = getCachedGeo('cummerbundCurved', () => new THREE.CapsuleGeometry(0.026, 0.22, 8, 12));
  const cummerbundL = new THREE.Mesh(cummerbundGeo, vestMat);
  cummerbundL.rotation.x = Math.PI / 2;
  cummerbundL.scale.set(0.85, 1, 2.2);
  cummerbundL.position.set(-0.242, 0.235, 0);
  const cummerbundR = new THREE.Mesh(cummerbundGeo, vestMat);
  cummerbundR.rotation.x = Math.PI / 2;
  cummerbundR.scale.set(0.85, 1, 2.2);
  cummerbundR.position.set(0.242, 0.235, 0);

  // Padded Plate Carrier Shoulder Straps + Hydration Tube
  const pcStrapGeo = getCachedGeo('pcStrapCurved', () => {
    const g = new THREE.CapsuleGeometry(0.032, 0.22, 10, 14);
    g.rotateX(Math.PI / 2);
    return g;
  });
  const pcStrapL = new THREE.Mesh(pcStrapGeo, vestMat);
  pcStrapL.scale.set(1.05, 0.58, 1);
  pcStrapL.position.set(-0.135, 0.542, 0);
  const pcStrapR = new THREE.Mesh(pcStrapGeo, vestMat);
  pcStrapR.scale.set(1.05, 0.58, 1);
  pcStrapR.position.set(0.135, 0.542, 0);

  // 3 Contoured Esstac Kywi Front Rifle Magazine Pouches + Curved Polymer PMAGs & Ranger Pull Tabs
  const magPouchGeo = getCachedGeo('magPouchContoured', () => new THREE.CapsuleGeometry(0.034, 0.088, 10, 14));
  const magBodyGeo = getCachedGeo('magBodyContoured', () => new THREE.CapsuleGeometry(0.026, 0.065, 8, 12));
  const magPlateGeo = getCachedGeo('magPlateContoured', () => new THREE.CylinderGeometry(0.028, 0.032, 0.018, 14));
  for (let m = -1; m <= 1; m++) {
    const mx = m * 0.088;
    const pouch = new THREE.Mesh(magPouchGeo, vestMat);
    pouch.scale.set(1.08, 1, 0.68);
    pouch.position.set(mx, 0.215, -0.205);

    const magInsert = new THREE.Mesh(magBodyGeo, webbingMat);
    magInsert.scale.set(1.0, 1, 0.65);
    magInsert.position.set(mx, 0.285, -0.205);
    magInsert.rotation.z = -0.07;

    const rangerTab = new THREE.Mesh(magPlateGeo, mainMat);
    rangerTab.scale.set(1.1, 1, 0.72);
    rangerTab.position.set(mx - 0.003, 0.328, -0.205);
    rangerTab.rotation.z = -0.07;

    torsoVisualGroup.add(pouch, magInsert, rangerTab);
  }

  // Juggernaut Chest ATAK Tactical Mount + Operator Patch + U94 PTT Radio Switch + Glowstick
  const adminPouch = new THREE.Mesh(
    getCachedGeo('adminPouchContoured', () => {
      const g = new THREE.CapsuleGeometry(0.042, 0.11, 10, 14);
      g.rotateZ(Math.PI / 2);
      return g;
    }),
    webbingMat
  );
  adminPouch.scale.set(1, 1, 0.45);
  adminPouch.position.set(0, 0.398, -0.195);

  const squadPatch = new THREE.Mesh(
    getCachedGeo('squadPatchContoured', () => {
      const g = new THREE.CapsuleGeometry(0.023, 0.070, 6, 12);
      g.rotateZ(Math.PI / 2);
      return g;
    }),
    mainMat
  );
  squadPatch.scale.set(1, 1, 0.28);
  squadPatch.position.set(0, 0.40, -0.214);

  const pttBox = new THREE.Mesh(
    getCachedGeo('pttBox', () => new THREE.CylinderGeometry(0.024, 0.024, 0.022, 16)),
    chromeMat
  );
  pttBox.rotation.x = Math.PI / 2;
  pttBox.position.set(-0.115, 0.455, -0.188);

  const chemlight = new THREE.Mesh(
    getCachedGeo('vestChemlight', () => new THREE.CapsuleGeometry(0.006, 0.095, 6, 10)),
    mainMat
  );
  chemlight.rotation.z = 0.22;
  chemlight.position.set(0.125, 0.38, -0.192);

  // Tactical AN/PRC-152 Harris Radio on Left Cummerbund + Whip Antenna
  const radioBody = new THREE.Mesh(
    getCachedGeo('radioBodyContoured', () => new THREE.CapsuleGeometry(0.032, 0.11, 10, 12)),
    armorMat
  );
  radioBody.position.set(-0.165, 0.36, 0.195);
  const whipAntenna = new THREE.Mesh(
    getCachedGeo('whipAntenna', () => new THREE.CylinderGeometry(0.0035, 0.0065, 0.44, 10)),
    webbingMat
  );
  whipAntenna.position.set(-0.172, 0.65, 0.195);
  whipAntenna.rotation.z = 0.08;

  // BDU Zipped Collar & Sculpted Human Neck with Folded Shemagh Neck Gaiter
  const bduCollar = new THREE.Mesh(
    getCachedGeo('bduCollar', () => new THREE.CylinderGeometry(0.126, 0.148, 0.096, 20)),
    bduMat
  );
  bduCollar.position.set(0, 0.556, -0.005);

  const shemaghRing = new THREE.Mesh(
    getCachedGeo('shemaghRing', () => new THREE.TorusGeometry(0.108, 0.032, 12, 22)),
    vestMat
  );
  shemaghRing.rotation.x = Math.PI / 2 + 0.08;
  shemaghRing.position.set(0, 0.585, -0.006);

  const neckGaiter = new THREE.Mesh(
    getCachedGeo('neckGaiter', () => new THREE.CylinderGeometry(0.096, 0.110, 0.14, 20)),
    webbingMat
  );
  neckGaiter.position.set(0, 0.615, -0.008);

  torsoVisualGroup.add(
    trapeziusL,
    trapeziusR,
    frontPlateCore,
    frontUpperBevel,
    rearPlateCore,
    assaultPackMain,
    assaultPackLower,
    packTopRoll,
    cummerbundL,
    cummerbundR,
    pcStrapL,
    pcStrapR,
    adminPouch,
    squadPatch,
    pttBox,
    chemlight,
    radioBody,
    whipAntenna,
    bduCollar,
    shemaghRing,
    neckGaiter
  );

  // ==================== 3. SCULPTED HEAD, BALACLAVA, OAKLEY GOGGLES, OPS-CORE HELMET & STOWED NVGS ====================
  const headGroup = new THREE.Group();
  headGroup.position.set(0, 0.64, 0); // World y = 1.54
  chestGroup.add(headGroup);

  // Articulated Neck Ball Pivot & Upper Cervical Column:
  // Bottom hemisphere of upperNeckColumn is centered at y = 0 (exact headGroup pivot) so pitching up in prone
  // rotates the sphere in place inside neckGaiter without swinging a negative lever arm out the throat.
  const neckPivotBall = new THREE.Mesh(
    getCachedGeo('neckPivotBall', () => new THREE.SphereGeometry(0.098, 16, 14)),
    webbingMat
  );
  neckPivotBall.position.set(0, 0, -0.008);

  const upperNeckColumn = new THREE.Mesh(
    getCachedGeo('upperNeckColumn', () => new THREE.CapsuleGeometry(0.092, 0.095, 12, 16)),
    webbingMat
  );
  upperNeckColumn.scale.set(1.04, 1.0, 1.08);
  upperNeckColumn.position.set(0, 0.0475, -0.010);
  headGroup.add(neckPivotBall, upperNeckColumn);

  // Primary Headshot Collider & Sculpted Cranium Base
  const headGeo = getCachedGeo('headGeo', () => new THREE.CapsuleGeometry(0.136, 0.11, 16, 22));
  const headMesh = new THREE.Mesh(headGeo, webbingMat);
  headMesh.scale.set(1.16, 1.16, 1.16);
  headMesh.position.set(0, 0.20, -0.01); // World y = 1.74
  headMesh.castShadow = true;
  tagHeadHitbox(headMesh);
  headGroup.add(headMesh);

  // Exposed Upper Face Skin Band (Forehead/Brow/Cheekbones around eyes)
  const faceSkinBand = new THREE.Mesh(
    getCachedGeo(
      'faceSkinBand',
      () => new THREE.CylinderGeometry(0.133, 0.129, 0.068, 22, 1, false, Math.PI * 0.62, Math.PI * 0.76)
    ),
    skinMat
  );
  faceSkinBand.scale.set(1.14, 1.14, 1.14);
  faceSkinBand.position.set(0, 0.215, -0.012);

  // Contoured Brow Ridge & Smooth Anatomical Nose Bridge (replaces raw ConeGeometry)
  const browRidge = new THREE.Mesh(
    getCachedGeo('browRidge', () => {
      const g = new THREE.CapsuleGeometry(0.018, 0.11, 8, 12);
      g.rotateZ(Math.PI / 2);
      return g;
    }),
    skinMat
  );
  browRidge.position.set(0, 0.236, -0.142);

  const noseBridge = new THREE.Mesh(
    getCachedGeo('noseBridgeSmooth', () => new THREE.CapsuleGeometry(0.014, 0.036, 8, 12)),
    skinMat
  );
  noseBridge.rotation.x = 0.32;
  noseBridge.position.set(0, 0.202, -0.152);

  // Contoured Lower-Face Ribbed Tactical Balaclava Mask (Jaw, Chin & Nose Cover)
  const balaclavaJaw = new THREE.Mesh(
    getCachedGeo('balaclavaJawSmooth', () => new THREE.CapsuleGeometry(0.112, 0.065, 14, 18)),
    webbingMat
  );
  balaclavaJaw.scale.set(1.12, 1.14, 1.24);
  balaclavaJaw.position.set(0, 0.145, -0.024);

  // Ops-Core FAST SF High-Cut Ballistic Helmet Shell (also tagged as headshot collider)
  const helmetDome = new THREE.Mesh(
    getCachedGeo(
      'helmetDome',
      () => new THREE.SphereGeometry(0.164, 24, 18, 0, Math.PI * 2, 0, Math.PI * 0.58)
    ),
    armorMat
  );
  helmetDome.scale.set(1.12, 1.16, 1.22);
  helmetDome.position.set(0, 0.246, 0.005);
  helmetDome.castShadow = true;
  tagHeadHitbox(helmetDome);

  const helmetRearNape = new THREE.Mesh(
    getCachedGeo(
      'helmetRearNape',
      () => new THREE.CylinderGeometry(0.154, 0.140, 0.092, 20, 1, false, -Math.PI * 0.42, Math.PI * 0.84)
    ),
    armorMat
  );
  helmetRearNape.scale.set(1.14, 1.14, 1.14);
  helmetRearNape.position.set(0, 0.205, 0.015);

  const helmetRimTrim = new THREE.Mesh(
    getCachedGeo('helmetRimTrim', () => new THREE.TorusGeometry(0.163, 0.008, 10, 26)),
    bootMat
  );
  helmetRimTrim.rotation.x = Math.PI / 2 - 0.14;
  helmetRimTrim.scale.set(1.12, 1.22, 1.12);
  helmetRimTrim.position.set(0, 0.242, 0.005);

  // Wilcox L4 G24 NVG Shroud, Articulated Mount Arm & Stowed Dual-Tube PVS-31 Night Vision Binoculars
  const nvgShroud = new THREE.Mesh(
    getCachedGeo('nvgShroudContoured', () => new THREE.CylinderGeometry(0.032, 0.036, 0.054, 14)),
    chromeMat
  );
  nvgShroud.scale.set(1.0, 1.0, 0.36);
  nvgShroud.position.set(0, 0.325, -0.175);
  nvgShroud.rotation.x = -0.18;

  const nvgArm = new THREE.Mesh(
    getCachedGeo('nvgArmContoured', () => new THREE.CapsuleGeometry(0.014, 0.032, 6, 12)),
    chromeMat
  );
  nvgArm.position.set(0, 0.342, -0.195);
  nvgArm.rotation.x = -0.35;

  const nvgBridge = new THREE.Mesh(
    getCachedGeo('nvgBridge', () => {
      const g = new THREE.CylinderGeometry(0.012, 0.012, 0.105, 12);
      g.rotateZ(Math.PI / 2);
      return g;
    }),
    armorMat
  );
  nvgBridge.position.set(0, 0.368, -0.208);

  const nvgTubeGeo = getCachedGeo('nvgTubeGeo', () => new THREE.CylinderGeometry(0.020, 0.022, 0.078, 16));
  const nvgLensGeo = getCachedGeo('nvgLensGeo', () => new THREE.CircleGeometry(0.018, 16));
  for (const side of [-1, 1]) {
    const tube = new THREE.Mesh(nvgTubeGeo, armorMat);
    tube.rotation.x = -0.32;
    tube.position.set(side * 0.038, 0.375, -0.214);
    const lens = new THREE.Mesh(nvgLensGeo, nvgLensMat);
    lens.rotation.x = -Math.PI / 2 - 0.32;
    lens.position.set(side * 0.038, 0.412, -0.226);
    headGroup.add(tube, lens);
  }

  // Helmet ARC Side Rails, SureFire Helmet Light, Velcro Callsign Panels & Rear Mohawk Counterweight Pack
  const arcRailGeo = getCachedGeo('arcRailCurved', () => {
    const g = new THREE.CapsuleGeometry(0.011, 0.125, 8, 12);
    g.rotateX(Math.PI / 2);
    return g;
  });
  const arcRailL = new THREE.Mesh(arcRailGeo, vestMat);
  arcRailL.position.set(-0.175, 0.268, -0.01);
  const arcRailR = new THREE.Mesh(arcRailGeo, vestMat);
  arcRailR.position.set(0.175, 0.268, -0.01);

  const helmetLight = new THREE.Mesh(
    getCachedGeo('helmetFlashlight', () => {
      const g = new THREE.CylinderGeometry(0.010, 0.012, 0.068, 12);
      g.rotateX(Math.PI / 2);
      return g;
    }),
    chromeMat
  );
  helmetLight.position.set(0.185, 0.278, -0.045);

  const velcroPatchGeo = getCachedGeo('velcroPatchContoured', () => {
    const g = new THREE.CapsuleGeometry(0.018, 0.042, 6, 10);
    g.rotateX(Math.PI / 2);
    g.scale(0.28, 1, 1);
    return g;
  });
  const velcroPatchL = new THREE.Mesh(velcroPatchGeo, mainMat);
  velcroPatchL.position.set(-0.176, 0.306, 0.012);
  const velcroPatchR = new THREE.Mesh(velcroPatchGeo, mainMat);
  velcroPatchR.position.set(0.176, 0.306, 0.012);

  const counterweightPouch = new THREE.Mesh(
    getCachedGeo('counterweightPouchContoured', () => {
      const g = new THREE.CapsuleGeometry(0.026, 0.055, 8, 12);
      g.rotateZ(Math.PI / 2);
      return g;
    }),
    vestMat
  );
  counterweightPouch.position.set(0, 0.252, 0.188);

  // Tactical Ballistic Goggles (ESS / Oakley Wraparound Frame + Iridium Curved Lens + Elastic Strap)
  const goggleFrame = new THREE.Mesh(
    getCachedGeo(
      'goggleFrame',
      () => new THREE.CylinderGeometry(0.147, 0.145, 0.068, 24, 1, false, Math.PI * 0.61, Math.PI * 0.78)
    ),
    bootMat
  );
  goggleFrame.scale.set(1.14, 1.14, 1.14);
  goggleFrame.position.set(0, 0.218, -0.018);

  const goggleLens = new THREE.Mesh(
    getCachedGeo(
      'goggleLens',
      () => new THREE.CylinderGeometry(0.150, 0.148, 0.052, 24, 1, false, Math.PI * 0.63, Math.PI * 0.74)
    ),
    visorMat
  );
  goggleLens.scale.set(1.14, 1.14, 1.14);
  goggleLens.position.set(0, 0.218, -0.018);

  const goggleStrap = new THREE.Mesh(
    getCachedGeo('goggleStrap', () => new THREE.CylinderGeometry(0.155, 0.155, 0.028, 22)),
    webbingMat
  );
  goggleStrap.scale.set(1.11, 1.12, 1.22);
  goggleStrap.position.set(0, 0.218, 0.005);

  // Peltor ComTac V Tactical Headset (Contoured Oval Shells + Gel Cushions + Wire Rail Mounts + Boom Mic)
  const earCupGeo = getCachedGeo('earCupContoured', () => {
    const g = new THREE.CapsuleGeometry(0.036, 0.026, 10, 14);
    g.scale(0.62, 1.15, 0.92);
    return g;
  });
  const earCushionGeo = getCachedGeo('earCushionGeo', () => {
    const g = new THREE.TorusGeometry(0.036, 0.012, 10, 18);
    g.rotateY(Math.PI / 2);
    g.scale(1, 1.18, 0.92);
    return g;
  });
  const earCupL = new THREE.Mesh(earCupGeo, armorMat);
  earCupL.position.set(-0.178, 0.195, 0.008);
  const earCushionL = new THREE.Mesh(earCushionGeo, bootMat);
  earCushionL.position.set(-0.162, 0.195, 0.008);

  const earCupR = new THREE.Mesh(earCupGeo, armorMat);
  earCupR.position.set(0.178, 0.195, 0.008);
  const earCushionR = new THREE.Mesh(earCushionGeo, bootMat);
  earCushionR.position.set(0.162, 0.195, 0.008);

  const boomMic = new THREE.Mesh(
    getCachedGeo('boomMic', () => new THREE.CylinderGeometry(0.0045, 0.0045, 0.135, 10)),
    chromeMat
  );
  boomMic.rotation.x = Math.PI / 2.3;
  boomMic.rotation.z = -0.35;
  boomMic.position.set(-0.12, 0.145, -0.095);
  const micWindscreen = new THREE.Mesh(
    getCachedGeo('micWindscreen', () => new THREE.CapsuleGeometry(0.009, 0.012, 8, 10)),
    bootMat
  );
  micWindscreen.rotation.z = Math.PI / 2;
  micWindscreen.position.set(-0.045, 0.125, -0.158);

  headGroup.add(
    faceSkinBand,
    browRidge,
    noseBridge,
    balaclavaJaw,
    helmetDome,
    helmetRearNape,
    helmetRimTrim,
    nvgShroud,
    nvgArm,
    nvgBridge,
    arcRailL,
    arcRailR,
    helmetLight,
    velcroPatchL,
    velcroPatchR,
    counterweightPouch,
    goggleFrame,
    goggleLens,
    goggleStrap,
    earCupL,
    earCushionL,
    earCupR,
    earCushionR,
    boomMic,
    micWindscreen
  );

  // ==================== 4. ANATOMICAL ARMS, BDU SLEEVES, ELBOW PADS & MECHANIX GLOVES ====================
  // Canonical bone-space hierarchy along -Y:
  //   rightArm (shoulder pivot at (0,0,0)) -> rightForearm (elbow pivot at (0,-ARM_UPPER_LEN,0)) -> rightHand (wrist pivot at (0,-ARM_LOWER_LEN,0))
  //   leftArm  (shoulder pivot at (0,0,0)) -> leftForearm  (elbow pivot at (0,-ARM_UPPER_LEN,0)) -> leftHand  (wrist pivot at (0,-ARM_LOWER_LEN,0))
  // Analytical 2-bone Law-of-Cosines IK (poseOperatorForWeapon) rotates each shoulder, elbow, and wrist so both
  // hands grip the exact handle and foregrip of all 11 weapons without ever detaching or stretching joints.
  const armPivot = new THREE.Group();
  armPivot.position.set(0, 0.46, 0); // World y = 1.36
  chestGroup.add(armPivot);

  const ARM_UPPER_LEN = 0.295;
  const ARM_LOWER_LEN = 0.295;

  const deltoidCapGeo = getCachedGeo('deltoidCap', () => new THREE.SphereGeometry(0.098, 16, 14));
  const armPocketGeo = getCachedGeo('armPocketContoured', () => new THREE.CapsuleGeometry(0.022, 0.068, 8, 12));
  const unitPatchGeo = getCachedGeo('unitPatchContoured', () => {
    const g = new THREE.CapsuleGeometry(0.026, 0.018, 6, 12);
    g.scale(0.24, 1, 1.18);
    return g;
  });

  const buildTacticalShoulder = (sideSign) => {
    const sGroup = new THREE.Group();

    const deltoidCap = new THREE.Mesh(deltoidCapGeo, bduMat);
    deltoidCap.scale.set(1.14, 1.22, 1.14);

    const armPocket = new THREE.Mesh(armPocketGeo, bduMat);
    armPocket.scale.set(0.75, 1, 1.85);
    armPocket.position.set(sideSign * 0.072, -ARM_UPPER_LEN * 0.34, 0);

    const unitPatch = new THREE.Mesh(unitPatchGeo, mainMat);
    unitPatch.position.set(sideSign * 0.090, -ARM_UPPER_LEN * 0.34 + 0.002, 0);

    sGroup.add(deltoidCap, armPocket, unitPatch);
    return sGroup;
  };

  const handKnuckleGeo = getCachedGeo('handKnuckleContoured', () => {
    const g = new THREE.CapsuleGeometry(0.012, 0.046, 8, 10);
    g.rotateX(Math.PI / 2);
    return g;
  });
  const handThumbGeo = getCachedGeo('handThumb', () => new THREE.CapsuleGeometry(0.011, 0.036, 6, 10));
  const handFingerGeo = getCachedGeo('handFinger', () => new THREE.CapsuleGeometry(0.0095, 0.038, 6, 10));
  const wristBallGeo = getCachedGeo('wristBallJoint', () => new THREE.SphereGeometry(0.047, 12, 10));

  // Hierarchical Right Arm: rightArm (shoulder pivot) -> rightForearm (elbow pivot) -> rightHand (5-finger pistol grip)
  const rightArm = new THREE.Group();
  rightArm.position.set(0.250, 0.0, -0.010);
  const rightShoulder = buildTacticalShoulder(1);

  const rightBicep = new THREE.Mesh(
    getCachedGeo('rightBicep', () => new THREE.CapsuleGeometry(0.068, ARM_UPPER_LEN, 12, 16)),
    bduMat
  );
  rightBicep.scale.set(1.12, 1.0, 1.12);
  rightBicep.position.set(0, -ARM_UPPER_LEN * 0.5, 0);
  rightBicep.castShadow = true;
  tagBodyHitbox(rightBicep);

  const rightElbow = new THREE.Mesh(
    getCachedGeo('rightElbow', () => new THREE.SphereGeometry(0.064, 14, 12)),
    armorMat
  );
  rightElbow.position.set(0, -ARM_UPPER_LEN, 0.006);

  const rightForearm = new THREE.Group();
  rightForearm.position.set(0, -ARM_UPPER_LEN, 0);

  const rightForearmElbowCap = new THREE.Mesh(
    getCachedGeo('rightForearmElbowCap', () => new THREE.SphereGeometry(0.062, 14, 12)),
    bduMat
  );

  const rightForearmMesh = new THREE.Mesh(
    getCachedGeo('rightForearmMesh', () => new THREE.CylinderGeometry(0.060, 0.046, ARM_LOWER_LEN, 18)),
    bduMat
  );
  rightForearmMesh.position.set(0, -ARM_LOWER_LEN * 0.5, 0);
  rightForearmMesh.castShadow = true;
  tagBodyHitbox(rightForearmMesh);

  const rightCuff = new THREE.Mesh(
    getCachedGeo('rightCuff', () => new THREE.CylinderGeometry(0.049, 0.047, 0.056, 16)),
    webbingMat
  );
  rightCuff.position.set(0, -ARM_LOWER_LEN * 0.85, 0);

  const rightHand = new THREE.Group();
  rightHand.position.set(0, -ARM_LOWER_LEN, 0);

  const rightWristBall = new THREE.Mesh(wristBallGeo, bootMat);
  const rPalm = new THREE.Mesh(
    getCachedGeo('rPalm', () => new THREE.CapsuleGeometry(0.028, 0.044, 8, 12)),
    bootMat
  );
  rPalm.scale.set(1.08, 1.25, 1.10);
  rPalm.position.set(-0.006, 0.006, -0.022);
  rPalm.rotation.x = Math.PI / 2.2;
  const rKnuckle = new THREE.Mesh(handKnuckleGeo, armorMat);
  rKnuckle.position.set(0.004, 0.026, -0.022);
  const rThumb = new THREE.Mesh(handThumbGeo, bootMat);
  rThumb.position.set(-0.026, 0.018, -0.026);
  rThumb.rotation.set(0.42, 0.32, 0.52);
  rightHand.add(rightWristBall, rPalm, rKnuckle, rThumb);
  for (let f = 0; f < 4; f++) {
    const rFinger = new THREE.Mesh(handFingerGeo, bootMat);
    rFinger.position.set(-0.014, 0.010 - f * 0.012, -0.036 + (f === 0 ? -0.010 : 0));
    rFinger.rotation.z = Math.PI / 2;
    rFinger.rotation.y = f === 0 ? -0.28 : 0.08;
    rightHand.add(rFinger);
  }

  rightForearm.add(rightForearmElbowCap, rightForearmMesh, rightCuff, rightHand);
  rightArm.add(rightShoulder, rightBicep, rightElbow, rightForearm);

  // Hierarchical Left Arm: leftArm (shoulder pivot) -> leftForearm (elbow pivot) -> leftHand (5-finger C-clamp grip)
  const leftArm = new THREE.Group();
  leftArm.position.set(-0.245, 0.0, -0.020);
  const leftShoulder = buildTacticalShoulder(-1);

  const leftBicep = new THREE.Mesh(
    getCachedGeo('leftBicep', () => new THREE.CapsuleGeometry(0.066, ARM_UPPER_LEN, 12, 16)),
    bduMat
  );
  leftBicep.scale.set(1.12, 1.0, 1.12);
  leftBicep.position.set(0, -ARM_UPPER_LEN * 0.5, 0);
  leftBicep.castShadow = true;
  tagBodyHitbox(leftBicep);

  const leftElbow = new THREE.Mesh(
    getCachedGeo('leftElbow', () => new THREE.SphereGeometry(0.062, 14, 12)),
    armorMat
  );
  leftElbow.position.set(0, -ARM_UPPER_LEN, 0.006);

  const leftForearm = new THREE.Group();
  leftForearm.position.set(0, -ARM_UPPER_LEN, 0);

  const leftForearmElbowCap = new THREE.Mesh(
    getCachedGeo('leftForearmElbowCap', () => new THREE.SphereGeometry(0.060, 14, 12)),
    bduMat
  );

  const leftForearmMesh = new THREE.Mesh(
    getCachedGeo('leftForearmMesh', () => new THREE.CylinderGeometry(0.059, 0.045, ARM_LOWER_LEN, 18)),
    bduMat
  );
  leftForearmMesh.position.set(0, -ARM_LOWER_LEN * 0.5, 0);
  leftForearmMesh.castShadow = true;
  tagBodyHitbox(leftForearmMesh);

  const leftWristWatch = new THREE.Mesh(
    getCachedGeo('leftWristWatch', () => new THREE.CylinderGeometry(0.048, 0.047, 0.045, 16)),
    armorMat
  );
  leftWristWatch.position.set(0, -ARM_LOWER_LEN * 0.85, 0);

  const leftWatchDial = new THREE.Mesh(
    getCachedGeo('leftWatchDial', () => new THREE.CylinderGeometry(0.018, 0.018, 0.012, 16)),
    mainMat
  );
  leftWatchDial.position.set(0, -ARM_LOWER_LEN * 0.85, -0.044);
  leftWatchDial.rotation.x = Math.PI / 2;

  const leftHand = new THREE.Group();
  leftHand.position.set(0, -ARM_LOWER_LEN, 0);

  const leftWristBall = new THREE.Mesh(wristBallGeo, bootMat);
  const lPalm = new THREE.Mesh(
    getCachedGeo('lPalm', () => new THREE.CapsuleGeometry(0.028, 0.044, 8, 12)),
    bootMat
  );
  lPalm.scale.set(1.08, 1.25, 1.10);
  lPalm.position.set(0.006, 0.006, -0.022);
  lPalm.rotation.x = Math.PI / 2;
  const lKnuckle = new THREE.Mesh(handKnuckleGeo, armorMat);
  lKnuckle.position.set(-0.004, 0.026, -0.020);
  const lThumb = new THREE.Mesh(handThumbGeo, bootMat);
  lThumb.position.set(-0.014, 0.030, -0.024);
  lThumb.rotation.set(0.2, -0.38, -0.75);
  leftHand.add(leftWristBall, lPalm, lKnuckle, lThumb);
  for (let f = 0; f < 4; f++) {
    const lFinger = new THREE.Mesh(handFingerGeo, bootMat);
    lFinger.position.set(0.016, 0.002, -0.038 + f * 0.014);
    lFinger.rotation.z = Math.PI / 2.3;
    leftHand.add(lFinger);
  }

  leftForearm.add(leftForearmElbowCap, leftForearmMesh, leftWristWatch, leftWatchDial, leftHand);
  leftArm.add(leftShoulder, leftBicep, leftElbow, leftForearm);

  // Held 3D Weapon aligned with both hands (deduplicate weapon BufferGeometries via RIG_GEO_CACHE)
  const gunHolder = new THREE.Group();
  gunHolder.position.set(0.125, -0.065, -0.325);
  const gunMesh = createWeaponMesh(playerData.weapon || 'rifle', false);
  gunMesh.traverse((child) => {
    if (child.isMesh && child.geometry) {
      if (!child.geometry.userData?.shared) {
        const geo = child.geometry;
        const key = `wpn_${geo.type}_${JSON.stringify(geo.parameters || {})}`;
        const sharedGeo = getCachedGeo(key, () => geo);
        if (sharedGeo !== geo) {
          geo.dispose();
          child.geometry = sharedGeo;
        }
      }
      child.castShadow = false;
    }
  });
  gunHolder.add(gunMesh);

  armPivot.add(rightArm, leftArm, gunHolder);

  // ==================== 5. ANATOMICAL LEGS, CARGO PANTS, CONTOURED KNEE PADS & COMBAT BOOTS ====================
  const thighGeo = getCachedGeo('thighGeo', () => {
    const g = new THREE.CylinderGeometry(0.124, 0.096, 0.38, 20);
    g.translate(0, -0.19, 0); // Pivot at hip socket (y = 0)
    return g;
  });

  const shinGeo = getCachedGeo('shinGeo', () => {
    const g = new THREE.CylinderGeometry(0.094, 0.066, 0.34, 20);
    g.translate(0, -0.17, 0); // Pivot at knee joint (y = 0)
    return g;
  });

  // Full-radius hip ball & distal thigh condyle sphere so flat cylinder caps never protrude at hip or knee
  const hipBallGeo = getCachedGeo('hipBall', () => new THREE.SphereGeometry(0.125, 18, 14));
  const thighKneeCapGeo = getCachedGeo('thighKneeCap', () => new THREE.SphereGeometry(0.096, 16, 14));
  const quadMuscleGeo = getCachedGeo('quadMuscleContour', () => new THREE.CapsuleGeometry(0.076, 0.16, 8, 12));
  const cargoPocketGeo = getCachedGeo('cargoPocketContoured', () => {
    const g = new THREE.CapsuleGeometry(0.026, 0.105, 8, 12);
    g.scale(0.82, 1, 2.2);
    return g;
  });
  const pocketFlapGeo = getCachedGeo('pocketFlapContoured', () => {
    const g = new THREE.CylinderGeometry(0.026, 0.028, 0.13, 12);
    g.rotateX(Math.PI / 2);
    g.scale(0.85, 0.72, 1);
    return g;
  });
  const holsterPlateGeo = getCachedGeo(
    'holsterPlateCurved',
    () => new THREE.CylinderGeometry(0.098, 0.092, 0.18, 16, 1, false, Math.PI * 0.28, Math.PI * 0.48)
  );
  const kydexShellGeo = getCachedGeo('kydexShellContoured', () => new THREE.CapsuleGeometry(0.032, 0.10, 8, 12));
  const holsterGripGeo = getCachedGeo('holsterGripContoured', () => new THREE.CapsuleGeometry(0.020, 0.055, 8, 10));
  const thighStrapRGeo = getCachedGeo('thighStrapR', () => new THREE.TorusGeometry(0.106, 0.013, 10, 20));
  const thighStrapLGeo = getCachedGeo('thighStrapL', () => new THREE.TorusGeometry(0.104, 0.012, 10, 20));
  const tqPouchGeo = getCachedGeo('tqPouchContoured', () => new THREE.CapsuleGeometry(0.022, 0.072, 8, 12));
  const kneeSphereGeo = getCachedGeo('kneeSphere', () => new THREE.SphereGeometry(0.095, 16, 14));
  const kneePadBaseGeo = getCachedGeo('kneePadBase', () => new THREE.CapsuleGeometry(0.058, 0.072, 10, 14));
  // Contoured Curved Hard Knee Cap (replaces flat BoxGeometry)
  const kneeHardCapGeo = getCachedGeo('kneeHardCapCurved', () => {
    const g = new THREE.CylinderGeometry(0.072, 0.068, 0.094, 16, 1, false, Math.PI * 0.66, Math.PI * 0.68);
    return g;
  });
  const kneeStrapGeo = getCachedGeo('kneeStrap', () => new THREE.TorusGeometry(0.092, 0.012, 8, 18));
  const calfMuscleGeo = getCachedGeo('calfMuscle', () => new THREE.SphereGeometry(0.080, 14, 12));
  const ankleSphereGeo = getCachedGeo('ankleSphere', () => new THREE.SphereGeometry(0.068, 14, 12));
  const bootCollarGeo = getCachedGeo('bootCollar', () => new THREE.CylinderGeometry(0.072, 0.078, 0.095, 18));
  const bootUpperGeo = getCachedGeo('bootUpper', () => new THREE.CapsuleGeometry(0.058, 0.135, 12, 16));
  const bootHeelGeo = getCachedGeo('bootHeel', () => new THREE.CylinderGeometry(0.057, 0.062, 0.078, 16));
  const bootToeCapGeo = getCachedGeo('bootToeCap', () => new THREE.SphereGeometry(0.059, 14, 12));
  const bootSoleGeo = getCachedGeo('bootSoleContoured', () => {
    const g = new THREE.CapsuleGeometry(0.058, 0.145, 10, 14);
    g.rotateX(Math.PI / 2);
    g.scale(1.06, 0.34, 1);
    return g;
  });

  const buildArticulatedLeg = (sideSign) => {
    const hipLegMesh = new THREE.Mesh(thighGeo, bduMat);
    hipLegMesh.position.set(sideSign * 0.145, 0.80, 0);
    hipLegMesh.castShadow = true;
    tagBodyHitbox(hipLegMesh);

    const hipBall = new THREE.Mesh(hipBallGeo, bduMat);
    hipBall.scale.set(1.02, 1.08, 1.02);
    hipBall.position.set(0, 0.005, 0);

    const thighKneeCap = new THREE.Mesh(thighKneeCapGeo, bduMat);
    thighKneeCap.position.set(0, -0.38, 0);

    const quadMuscle = new THREE.Mesh(quadMuscleGeo, bduMat);
    quadMuscle.scale.set(1.04, 1.0, 0.94);
    quadMuscle.position.set(0, -0.175, -0.028);

    // Contoured BDU Thigh Cargo Pocket + Beveled Flap
    const cargoPocket = new THREE.Mesh(cargoPocketGeo, bduMat);
    cargoPocket.position.set(sideSign * 0.094, -0.185, -0.005);
    const pocketFlap = new THREE.Mesh(pocketFlapGeo, vestMat);
    pocketFlap.position.set(sideSign * 0.098, -0.115, -0.005);
    hipLegMesh.add(hipBall, thighKneeCap, quadMuscle, cargoPocket, pocketFlap);

    // Right-Side Safariland Drop-Leg Tactical Kydex Pistol Holster + Holstered Sidearm + Thigh Straps
    if (sideSign > 0) {
      const holsterPlate = new THREE.Mesh(holsterPlateGeo, armorMat);
      holsterPlate.position.set(0.022, -0.18, -0.005);
      const kydexShell = new THREE.Mesh(kydexShellGeo, bootMat);
      kydexShell.scale.set(0.82, 1, 1.25);
      kydexShell.position.set(0.126, -0.175, -0.015);
      kydexShell.rotation.x = -0.15;
      const holsterGrip = new THREE.Mesh(holsterGripGeo, chromeMat);
      holsterGrip.scale.set(0.75, 1, 1.25);
      holsterGrip.position.set(0.126, -0.095, 0.015);
      holsterGrip.rotation.x = -0.38;
      const thighStrap = new THREE.Mesh(thighStrapRGeo, webbingMat);
      thighStrap.rotation.x = Math.PI / 2;
      thighStrap.position.set(0, -0.19, 0);
      hipLegMesh.add(holsterPlate, kydexShell, holsterGrip, thighStrap);
    } else {
      // Left Thigh Tourniquet / Utility Strap
      const thighStrapL = new THREE.Mesh(thighStrapLGeo, webbingMat);
      thighStrapL.rotation.x = Math.PI / 2;
      thighStrapL.position.set(0, -0.20, 0);
      const tqPouch = new THREE.Mesh(tqPouchGeo, mainMat);
      tqPouch.position.set(-0.098, -0.19, -0.04);
      hipLegMesh.add(thighStrapL, tqPouch);
    }

    // Articulated Knee Joint Pivot at bottom of thigh (y = -0.38)
    const kneePivot = new THREE.Group();
    kneePivot.position.set(0, -0.38, 0);
    hipLegMesh.add(kneePivot);

    const kneeSphere = new THREE.Mesh(kneeSphereGeo, bduMat);
    const kneePadBase = new THREE.Mesh(kneePadBaseGeo, vestMat);
    kneePadBase.position.set(0, -0.018, -0.054);
    kneePadBase.rotation.x = -0.06;
    const kneeHardCap = new THREE.Mesh(kneeHardCapGeo, armorMat);
    kneeHardCap.position.set(0, -0.018, -0.056);
    kneeHardCap.rotation.x = -0.06;
    const kneeStrap = new THREE.Mesh(kneeStrapGeo, webbingMat);
    kneeStrap.rotation.x = Math.PI / 2;
    kneeStrap.position.set(0, -0.020, 0);

    // Lower Leg (Shin & Gastrocnemius Calf Muscle + Contoured Combat Boot)
    const shinMesh = new THREE.Mesh(shinGeo, bduMat);
    shinMesh.castShadow = true;
    tagBodyHitbox(shinMesh);

    const calfMuscle = new THREE.Mesh(calfMuscleGeo, bduMat);
    calfMuscle.scale.set(0.96, 1.44, 1.10);
    calfMuscle.position.set(0, -0.125, 0.028);

    const ankleSphere = new THREE.Mesh(ankleSphereGeo, bduMat);
    ankleSphere.position.set(0, -0.34, 0);

    // Salomon / Lowa Tactical Combat Boot (Ankle Collar, Contoured Upper, Heel Counter, Toe Cap & Lugged Outsole)
    const bootCollar = new THREE.Mesh(bootCollarGeo, vestMat);
    bootCollar.position.set(0, -0.32, 0);
    const bootUpper = new THREE.Mesh(bootUpperGeo, bootMat);
    bootUpper.rotation.x = Math.PI / 2;
    bootUpper.position.set(0, -0.368, -0.045);
    bootUpper.castShadow = true;
    const bootHeel = new THREE.Mesh(bootHeelGeo, armorMat);
    bootHeel.position.set(0, -0.368, 0.025);
    const bootToeCap = new THREE.Mesh(bootToeCapGeo, bootMat);
    bootToeCap.scale.set(1.04, 0.72, 1.16);
    bootToeCap.position.set(0, -0.376, -0.118);
    const bootSole = new THREE.Mesh(bootSoleGeo, armorMat);
    bootSole.position.set(0, -0.405, -0.045);
    bootSole.castShadow = true;

    shinMesh.add(
      calfMuscle,
      ankleSphere,
      bootCollar,
      bootUpper,
      bootHeel,
      bootToeCap,
      bootSole
    );

    kneePivot.add(
      kneeSphere,
      kneePadBase,
      kneeHardCap,
      kneeStrap,
      shinMesh
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

  // ==================== 6. LOW-POLY BOX HITBOX PROXIES (12 TRIANGLES PER VOLUME) ====================
  // Sizes, offsets and zones come from the SHARED definition (shared/hitboxes.js) that the server also uses to
  // verify shots; each proxy stays attached to its animated bone (head / chest / pelvis / hip / knee).
  const hitboxBones = {
    head: headGroup,
    chest: chestGroup,
    pelvis: pelvisGroup,
    hip_l: leftLeg,
    hip_r: rightLeg,
    knee_l: leftLegData.shinMesh,
    knee_r: rightLegData.shinMesh
  };
  const hitboxProxyById = {};
  for (const def of HITBOX_PART_DEFS) {
    const isHead = def.zone === 'head';
    const [w, h, d] = def.size;
    const proxyGeo = getCachedGeo(`hitbox_${w}_${h}_${d}_proxy`, () => {
      const g = new THREE.BoxGeometry(w, h, d);
      g.computeBoundingBox();
      g.computeBoundingSphere();
      return g;
    });
    const proxyMesh = new THREE.Mesh(proxyGeo, HITBOX_PROXY_MAT);
    proxyMesh.name = `hitbox_${def.id}_proxy`;
    proxyMesh.position.set(def.offset[0], def.offset[1], def.offset[2]);
    proxyMesh.visible = false;
    proxyMesh.castShadow = false;
    proxyMesh.receiveShadow = false;
    proxyMesh.userData = {
      playerId: playerData.id,
      isHeadshot: isHead,
      isHead,
      zone: def.zone,
      partId: def.id,
      isHitboxProxy: true,
      hitbox: { playerId: playerData.id, zone: def.zone, isHeadshot: isHead, isHead, partId: def.id }
    };
    hitboxParts.push(proxyMesh);
    hitboxBones[def.bone].add(proxyMesh);
    hitboxProxyById[def.id] = proxyMesh;
  }
  const headHitboxProxy = hitboxProxyById.head;
  const torsoHitboxProxy = hitboxProxyById.torso;
  const pelvisHitboxProxy = hitboxProxyById.pelvis;
  const leftLegHitboxProxy = hitboxProxyById.thigh_l;
  const rightLegHitboxProxy = hitboxProxyById.thigh_r;
  const leftShinHitboxProxy = hitboxProxyById.shin_l;
  const rightShinHitboxProxy = hitboxProxyById.shin_r;

  // Batch static sub-meshes per material within each animated bone scope to cut per-player draw calls
  // Each arm bone segment (upper arm, forearm, hand) is batched in its own canonical -Y bone frame BEFORE
  // poseOperatorForWeapon applies the 2-bone IK rotations, preserving live shoulder/elbow/wrist joints.
  const useEnemyOutline = !isShowcase;
  const initialOutlineMat = options.isTeammate ? TEAMMATE_OUTLINE_MAT : ENEMY_OUTLINE_MAT;
  const outlineMeshes = [
    batchBoneScope(pelvisVisualGroup, 'pelvis', new Set(), pelvisCore, useEnemyOutline, initialOutlineMat),
    batchBoneScope(torsoVisualGroup, 'chest', new Set(), torsoMesh, useEnemyOutline, initialOutlineMat),
    batchBoneScope(headGroup, 'head', new Set([headHitboxProxy]), headMesh, useEnemyOutline, initialOutlineMat),
    batchBoneScope(rightArm, 'arm_upper_r', new Set([rightForearm]), rightBicep, useEnemyOutline, initialOutlineMat),
    batchBoneScope(rightForearm, 'arm_lower_r', new Set([rightHand]), rightForearmMesh, useEnemyOutline, initialOutlineMat),
    batchBoneScope(rightHand, 'hand_r', new Set(), null, useEnemyOutline, initialOutlineMat),
    batchBoneScope(leftArm, 'arm_upper_l', new Set([leftForearm]), leftBicep, useEnemyOutline, initialOutlineMat),
    batchBoneScope(leftForearm, 'arm_lower_l', new Set([leftHand]), leftForearmMesh, useEnemyOutline, initialOutlineMat),
    batchBoneScope(leftHand, 'hand_l', new Set(), null, useEnemyOutline, initialOutlineMat),
    batchBoneScope(leftLeg, 'leg_l', new Set([leftKneePivot, leftLegHitboxProxy]), leftLeg, useEnemyOutline, initialOutlineMat),
    batchBoneScope(rightLeg, 'leg_r', new Set([rightKneePivot, rightLegHitboxProxy]), rightLeg, useEnemyOutline, initialOutlineMat),
    batchBoneScope(leftKneePivot, 'shin_l', new Set([leftShinHitboxProxy]), leftLegData.shinMesh, useEnemyOutline, initialOutlineMat),
    batchBoneScope(rightKneePivot, 'shin_r', new Set([rightShinHitboxProxy]), rightLegData.shinMesh, useEnemyOutline, initialOutlineMat)
  ].filter(Boolean);

  if (!isShowcase && options.scene) {
    options.scene.add(group);
  }

  const setOperatorColor = (newHex) => {
    if (isShowcase) {
      mainMat.color.setHex(newHex);
      visorMat.emissive.setHex(newHex);
      return;
    }
    const nextMainMat = getCachedMat(`main_${newHex}`, () => {
      const m = new THREE.MeshStandardMaterial({
        color: newHex,
        roughness: 0.38,
        metalness: 0.28
      });
      m.userData = { matSlotKey: 'main' };
      return m;
    });
    if (nextMainMat !== mainMat) {
      group.traverse((child) => {
        if (child.isMesh && child.material === mainMat) {
          child.material = nextMainMat;
        }
      });
      mainMat = nextMainMat;
    }
  };

  const setTeamOutline = (isTeammate) => {
    const targetMat = isTeammate ? TEAMMATE_OUTLINE_MAT : ENEMY_OUTLINE_MAT;
    for (let i = 0; i < outlineMeshes.length; i++) {
      outlineMeshes[i].material = targetMat;
    }
  };

  const rig = {
    id: playerData.id,
    name: playerData.name,
    team: playerData.team || null,
    isTeammate: Boolean(options.isTeammate),
    group,
    root: group,
    bodyGroup: pelvisGroup,
    pelvisGroup,
    pelvisVisualGroup,
    pelvisCore,
    hips: pelvisGroup,
    upperBodyGroup,
    torsoVisualGroup,
    spine: upperBodyGroup,
    chest: chestGroup,
    headGroup,
    torsoMesh,
    headMesh,
    headHitboxProxy,
    torsoHitboxProxy,
    pelvisHitboxProxy,
    leftLegHitboxProxy,
    rightLegHitboxProxy,
    leftShinHitboxProxy,
    rightShinHitboxProxy,
    leftLeg,
    rightLeg,
    leftKneePivot,
    rightKneePivot,
    leftShin: leftLegData.shinMesh,
    rightShin: rightLegData.shinMesh,
    armPivot,
    rightArm,
    leftArm,
    rightForearm,
    leftForearm,
    rightHand,
    leftHand,
    gunHolder,
    weaponMount: gunHolder,
    gunMesh,
    hitboxParts,
    outlineMeshes,
    setOperatorColor,
    setTeamOutline,
    poseForWeapon: (wId) => poseOperatorForWeapon(rig, wId),
    currentWeapon: playerData.weapon || 'rifle',
    _posedWeapon: null,
    targetPos: new THREE.Vector3(playerData.x || 0, playerData.y || 0, playerData.z || 0),
    targetYaw: playerData.yaw || 0,
    targetPitch: playerData.pitch || 0,
    crouching: Boolean(playerData.crouching),
    prone: Boolean(playerData.prone),
    sliding: Boolean(playerData.sliding || playerData.isSliding),
    lean: Number(playerData.lean || 0),
    crouchBlend: 0,
    proneBlend: 0,
    slideBlend: 0,
    leanBlend: 0,
    hp: playerData.hp ?? 100,
    alive: playerData.alive !== undefined ? Boolean(playerData.alive) : true,
    walkPhase: 0,
    lastShotFlashAt: 0
  };

  poseOperatorForWeapon(rig, rig.currentWeapon);
  return rig;
}

const TP_WEAPON_SCALE = 1.12;
const IK_ARM_UPPER_LEN = 0.295;
const IK_ARM_LOWER_LEN = 0.295;

// Third-person weapon mount poses & local grip coordinates (matching viewmodelRig.js weapon geometry):
// Buttpad rests cleanly against the front right shoulder pocket (z < -0.025 in armPivot) without piercing the chest/back,
// while rightHand and leftHand are solved via analytical 2-bone IK to grip the exact pistol grip & foregrip/support points.
const WEAPON_THIRD_PERSON_POSES = {
  rifle:   { pos: [0.125, -0.065, -0.325], rot: [0, 0.22, 0], effScale: [0.76, 0.76, 0.55], rGrip: [0.012, -0.105, 0.115], lGrip: [-0.022, -0.055, -0.330] },
  m4a1:    { pos: [0.125, -0.065, -0.325], rot: [0, 0.22, 0], effScale: [0.76, 0.76, 0.55], rGrip: [0.012, -0.102, 0.105], lGrip: [-0.022, -0.055, -0.330] },
  scar:    { pos: [0.125, -0.065, -0.325], rot: [0, 0.22, 0], effScale: [0.76, 0.76, 0.55], rGrip: [0.012, -0.102, 0.115], lGrip: [-0.020, -0.082, -0.335] },
  lmg:     { pos: [0.125, -0.072, -0.320], rot: [0, 0.23, 0], effScale: [0.76, 0.76, 0.54], rGrip: [0.012, -0.112, 0.115], lGrip: [-0.024, -0.055, -0.345] },
  shotgun: { pos: [0.125, -0.065, -0.335], rot: [0, 0.22, 0], effScale: [0.76, 0.76, 0.54], rGrip: [0.012, -0.095, 0.155], lGrip: [-0.020, -0.042, -0.330] },
  sniper:  { pos: [0.125, -0.065, -0.345], rot: [0, 0.22, 0], effScale: [0.76, 0.76, 0.53], rGrip: [0.012, -0.095, 0.195], lGrip: [-0.022, -0.048, -0.310] },
  smg:     { pos: [0.118, -0.065, -0.315], rot: [0, 0.20, 0], effScale: [0.78, 0.78, 0.62], rGrip: [0.012, -0.102, 0.068], lGrip: [-0.018, -0.105, -0.185] },
  pistol:  { pos: [0.045, -0.045, -0.410], rot: [0, 0.06, 0], effScale: [0.84, 0.84, 0.80], rGrip: [0.012, -0.088, 0.082], lGrip: [-0.018, -0.088,  0.055] },
  deagle:  { pos: [0.045, -0.045, -0.410], rot: [0, 0.06, 0], effScale: [0.84, 0.84, 0.80], rGrip: [0.012, -0.088, 0.082], lGrip: [-0.018, -0.088,  0.055] },
  glock:   { pos: [0.045, -0.045, -0.410], rot: [0, 0.06, 0], effScale: [0.84, 0.84, 0.80], rGrip: [0.012, -0.088, 0.082], lGrip: [-0.018, -0.088,  0.055] },
  knife:   { pos: [0.105, -0.085, -0.315], rot: [0.12, 0.26, -0.14], effScale: [0.88, 0.88, 0.85], rGrip: [0.012, -0.045, -0.068], lGrip: [-0.095, -0.082, -0.055] }
};

const _ikDir = new THREE.Vector3();
const _ikUnit = new THREE.Vector3();
const _ikPole = new THREE.Vector3();
const _ikD1 = new THREE.Vector3();
const _ikY1 = new THREE.Vector3();
const _ikX1 = new THREE.Vector3();
const _ikZ1 = new THREE.Vector3();
const _ikMat4 = new THREE.Matrix4();
const _ikParentQuat = new THREE.Quaternion();
const _ikTargetR = new THREE.Vector3();
const _ikTargetL = new THREE.Vector3();
const _ikWristOffsetR = new THREE.Vector3();
const _ikWristOffsetL = new THREE.Vector3();
const _ikPoleR = new THREE.Vector3(0.45, -0.82, 0.42);
const _ikPoleL = new THREE.Vector3(-0.48, -0.82, 0.38);

/**
 * Analytical 2-bone Law-of-Cosines IK solver for canonical -Y upper-arm (`armGroup`) and forearm (`forearmGroup`) bones.
 */
function solveArmTwoBoneIK(armGroup, forearmGroup, handGroup, targetWristPos, poleDir, targetHandQuat) {
  const L1 = IK_ARM_UPPER_LEN;
  const L2 = IK_ARM_LOWER_LEN;
  _ikDir.subVectors(targetWristPos, armGroup.position);
  const rawDist = _ikDir.length();
  const minReach = Math.abs(L1 - L2) + 0.01;
  const maxReach = L1 + L2 - 0.002;
  const d = Math.max(minReach, Math.min(maxReach, rawDist));

  if (rawDist > 1e-6) {
    _ikUnit.copy(_ikDir).divideScalar(rawDist);
  } else {
    _ikUnit.set(0, 0, -1);
  }

  // Project pole vector perpendicular to shoulder-to-wrist line
  const dotPole = poleDir.dot(_ikUnit);
  _ikPole.copy(poleDir).addScaledVector(_ikUnit, -dotPole);
  if (_ikPole.lengthSq() < 1e-6) {
    _ikPole.set(0, -1, 0);
  } else {
    _ikPole.normalize();
  }

  // Law of Cosines for shoulder-to-elbow projection x and perpendicular height h
  const x = (L1 * L1 - L2 * L2 + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, L1 * L1 - x * x));

  // Upper arm unit direction d1 from shoulder to elbow; local -Y points along d1, so local +Y = -d1
  _ikD1.copy(_ikUnit).multiplyScalar(x / L1).addScaledVector(_ikPole, h / L1).normalize();
  _ikY1.copy(_ikD1).negate();
  _ikX1.crossVectors(_ikPole, _ikUnit).normalize();
  _ikZ1.crossVectors(_ikX1, _ikY1).normalize();

  _ikMat4.makeBasis(_ikX1, _ikY1, _ikZ1);
  armGroup.quaternion.setFromRotationMatrix(_ikMat4);

  // Interior elbow flexion angle around local +X hinge axis
  const cosElbow = Math.max(-1, Math.min(1, (d * d - L1 * L1 - L2 * L2) / (2 * L1 * L2)));
  const elbowAngle = Math.acos(cosElbow);
  forearmGroup.rotation.set(elbowAngle, 0, 0);

  // Align hand orientation with weapon grip frame
  if (handGroup && targetHandQuat) {
    _ikParentQuat.copy(armGroup.quaternion).multiply(forearmGroup.quaternion).invert();
    handGroup.quaternion.copy(_ikParentQuat).multiply(targetHandQuat);
  }
}

/**
 * Poses the operator's gunHolder and solves analytical 2-bone IK for both arms/forearms/hands for the given weapon.
 */
export function poseOperatorForWeapon(rp, weaponId = 'rifle') {
  if (!rp || !rp.gunHolder || !rp.rightArm || !rp.leftArm || !rp.rightForearm || !rp.leftForearm) return;
  const pose = WEAPON_THIRD_PERSON_POSES[weaponId] || WEAPON_THIRD_PERSON_POSES.rifle;

  rp.gunHolder.position.set(pose.pos[0], pose.pos[1], pose.pos[2]);
  rp.gunHolder.rotation.set(pose.rot[0], pose.rot[1], pose.rot[2]);
  rp.gunHolder.scale.set(
    pose.effScale[0] / TP_WEAPON_SCALE,
    pose.effScale[1] / TP_WEAPON_SCALE,
    pose.effScale[2] / TP_WEAPON_SCALE
  );

  const qGun = rp.gunHolder.quaternion;

  // Compute exact 3D pistol-grip & foregrip coordinates in armPivot space, then offset to wrist ball center
  _ikTargetR.set(
    pose.rGrip[0] * pose.effScale[0],
    pose.rGrip[1] * pose.effScale[1],
    pose.rGrip[2] * pose.effScale[2]
  ).applyQuaternion(qGun).add(rp.gunHolder.position);
  _ikWristOffsetR.set(0.006, -0.006, 0.022).applyQuaternion(qGun);
  _ikTargetR.add(_ikWristOffsetR);

  _ikTargetL.set(
    pose.lGrip[0] * pose.effScale[0],
    pose.lGrip[1] * pose.effScale[1],
    pose.lGrip[2] * pose.effScale[2]
  ).applyQuaternion(qGun).add(rp.gunHolder.position);
  _ikWristOffsetL.set(-0.006, -0.006, 0.022).applyQuaternion(qGun);
  _ikTargetL.add(_ikWristOffsetL);

  solveArmTwoBoneIK(rp.rightArm, rp.rightForearm, rp.rightHand, _ikTargetR, _ikPoleR, qGun);
  solveArmTwoBoneIK(rp.leftArm, rp.leftForearm, rp.leftHand, _ikTargetL, _ikPoleL, qGun);

  rp._posedWeapon = weaponId;
}

export const createHumanoidPlayerRig = createRemotePlayerMesh;
