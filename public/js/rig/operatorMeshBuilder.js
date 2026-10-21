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

  // Authentic Special Forces PBR Material Palette (CS2 / MW / Ready or Not)
  // 1. Tactical Patch / Team Identification Trim (responds to suit color swatch)
  const mainMat = new THREE.MeshStandardMaterial({
    color: pColor,
    roughness: 0.38,
    metalness: 0.28
  });
  mainMat.userData = { matSlotKey: 'main' };

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
  const skinMat = getCachedMat('skin_0xd6a586', () =>
    new THREE.MeshStandardMaterial({
      color: 0xd6a586,
      roughness: 0.56,
      metalness: 0.04
    })
  );

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
  const visorMat = new THREE.MeshStandardMaterial({
    color: 0x111827,
    emissive: isShowcase ? pColor : 0xff2222,
    emissiveIntensity: isShowcase ? 0.18 : 0.45,
    roughness: 0.10,
    metalness: 0.88
  });
  visorMat.userData = { matSlotKey: 'visor' };

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

  // Anatomical Pelvis & Hip Block
  const pelvisCore = new THREE.Mesh(
    getCachedGeo('pelvisCore', () => new THREE.CylinderGeometry(0.168, 0.154, 0.19, 22)),
    bduMat
  );
  pelvisCore.scale.set(1.36, 1.08, 0.94);
  pelvisCore.castShadow = true;
  tagBodyHitbox(pelvisCore);
  pelvisGroup.add(pelvisCore);

  // Contoured Gluteal & Groin Anatomical Volumes
  const groinGuard = new THREE.Mesh(
    getCachedGeo('groinGuard', () => new THREE.CapsuleGeometry(0.074, 0.075, 10, 14)),
    bduMat
  );
  groinGuard.position.set(0, -0.035, -0.062);
  groinGuard.castShadow = false;

  const gluteGeo = getCachedGeo('gluteContour', () => new THREE.SphereGeometry(0.096, 14, 12));
  const gluteL = new THREE.Mesh(gluteGeo, bduMat);
  gluteL.scale.set(1.08, 1.12, 0.92);
  gluteL.position.set(-0.088, -0.018, 0.072);
  const gluteR = new THREE.Mesh(gluteGeo, bduMat);
  gluteR.scale.set(1.08, 1.12, 0.92);
  gluteR.position.set(0.088, -0.018, 0.072);

  // Ronin Padded MOLLE Battle Belt + Inner Velcro Belt + AustriAlpin Cobra Buckle
  const beltRing = new THREE.Mesh(
    getCachedGeo('beltRing', () => new THREE.CylinderGeometry(0.185, 0.185, 0.068, 22)),
    vestMat
  );
  beltRing.scale.set(1.38, 1.08, 0.96);
  beltRing.position.set(0, 0.065, 0);
  beltRing.castShadow = false;

  const beltInnerStrap = new THREE.Mesh(
    getCachedGeo('beltInnerStrap', () => new THREE.CylinderGeometry(0.188, 0.188, 0.030, 22)),
    webbingMat
  );
  beltInnerStrap.scale.set(1.38, 1.08, 0.96);
  beltInnerStrap.position.set(0, 0.065, 0);
  beltInnerStrap.castShadow = false;

  const cobraBuckle = new THREE.Mesh(
    getCachedGeo('cobraBuckle', () => new THREE.CylinderGeometry(0.026, 0.026, 0.052, 14)),
    chromeMat
  );
  cobraBuckle.rotation.z = Math.PI / 2;
  cobraBuckle.scale.set(1, 1, 0.52);
  cobraBuckle.position.set(0, 0.065, -0.162);
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
    gGroup.position.set(xPos, 0.052, -0.135);
    return gGroup;
  };
  const fragL = buildBeltGrenade(-0.155);
  const fragR = buildBeltGrenade(0.155);

  // Left Hip Contoured Double Pistol Mag Pouches & Rear Rolled Dump Pouch + Cylindrical IFAK Trauma Roll
  const sidePouchGeo = getCachedGeo('sidePouchContoured', () => new THREE.CapsuleGeometry(0.024, 0.055, 8, 12));
  const sidePouchL1 = new THREE.Mesh(sidePouchGeo, vestMat);
  sidePouchL1.position.set(-0.225, 0.058, -0.032);
  const sidePouchL2 = new THREE.Mesh(sidePouchGeo, vestMat);
  sidePouchL2.position.set(-0.225, 0.058, 0.022);

  const dumpPouchRear = new THREE.Mesh(
    getCachedGeo('dumpPouchRear', () => new THREE.CapsuleGeometry(0.046, 0.078, 10, 14)),
    webbingMat
  );
  dumpPouchRear.position.set(-0.125, 0.028, 0.162);

  const ifakRollRear = new THREE.Mesh(
    getCachedGeo('ifakRollRear', () => {
      const g = new THREE.CapsuleGeometry(0.038, 0.075, 10, 14);
      g.rotateZ(Math.PI / 2);
      return g;
    }),
    vestMat
  );
  ifakRollRear.position.set(0.062, 0.062, 0.168);

  const ifakCross = new THREE.Mesh(
    getCachedGeo('ifakCross', () => new THREE.CylinderGeometry(0.018, 0.018, 0.012, 14)),
    mainMat
  );
  ifakCross.rotation.x = Math.PI / 2;
  ifakCross.position.set(0.062, 0.062, 0.204);

  pelvisGroup.add(
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

  // Primary Anatomical Torso Hitbox & BDU Combat Shirt Core
  const torsoGeo = getCachedGeo('torsoGeo', () => new THREE.CylinderGeometry(0.238, 0.176, 0.58, 22));
  const torsoMesh = new THREE.Mesh(torsoGeo, bduMat);
  torsoMesh.scale.set(1.38, 1.08, 0.92);
  torsoMesh.position.set(0, 0.28, 0);
  torsoMesh.castShadow = true;
  tagBodyHitbox(torsoMesh);
  upperBodyGroup.add(torsoMesh);

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
  chestGroup.add(upperChestBroad);

  // Anatomical Trapezius Shoulder Slopes (smooth organic transition from neck to deltoids)
  const trapGeo = getCachedGeo('trapeziusSlope', () => new THREE.CapsuleGeometry(0.054, 0.145, 8, 12));
  const trapeziusL = new THREE.Mesh(trapGeo, bduMat);
  trapeziusL.position.set(-0.122, 0.512, 0.008);
  trapeziusL.rotation.z = 0.46;
  trapeziusL.scale.set(1.0, 1.0, 0.92);
  const trapeziusR = new THREE.Mesh(trapGeo, bduMat);
  trapeziusR.position.set(0.122, 0.512, 0.008);
  trapeziusR.rotation.z = -0.46;
  trapeziusR.scale.set(1.0, 1.0, 0.92);

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

    chestGroup.add(pouch, magInsert, rangerTab);
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
    getCachedGeo('bduCollar', () => new THREE.CylinderGeometry(0.120, 0.142, 0.088, 20)),
    bduMat
  );
  bduCollar.position.set(0, 0.555, -0.005);

  const shemaghRing = new THREE.Mesh(
    getCachedGeo('shemaghRing', () => new THREE.TorusGeometry(0.105, 0.028, 12, 22)),
    vestMat
  );
  shemaghRing.rotation.x = Math.PI / 2 + 0.08;
  shemaghRing.position.set(0, 0.582, -0.006);

  const neckGaiter = new THREE.Mesh(
    getCachedGeo('neckGaiter', () => new THREE.CylinderGeometry(0.088, 0.104, 0.14, 20)),
    webbingMat
  );
  neckGaiter.position.set(0, 0.615, -0.008);

  chestGroup.add(
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
  const armPivot = new THREE.Group();
  armPivot.position.set(0, 0.46, 0); // World y = 1.36
  chestGroup.add(armPivot);

  const deltoidCapGeo = getCachedGeo('deltoidCap', () => new THREE.SphereGeometry(0.094, 16, 14));
  const armPocketGeo = getCachedGeo('armPocketContoured', () => new THREE.CapsuleGeometry(0.022, 0.068, 8, 12));
  const unitPatchGeo = getCachedGeo('unitPatchContoured', () => {
    const g = new THREE.CapsuleGeometry(0.026, 0.018, 6, 12);
    g.scale(0.24, 1, 1.18);
    return g;
  });

  const buildTacticalShoulder = (sideSign) => {
    const sGroup = new THREE.Group();

    const deltoidCap = new THREE.Mesh(deltoidCapGeo, bduMat);
    deltoidCap.scale.set(1.12, 1.24, 1.12);

    // Contoured BDU Zippered Upper-Arm Pocket + Unit Identification Velcro Patch
    const armPocket = new THREE.Mesh(armPocketGeo, bduMat);
    armPocket.scale.set(0.75, 1, 1.85);
    armPocket.position.set(sideSign * 0.082, -0.036, 0);
    armPocket.rotation.z = -sideSign * 0.12;

    const unitPatch = new THREE.Mesh(unitPatchGeo, mainMat);
    unitPatch.position.set(sideSign * 0.101, -0.034, 0);
    unitPatch.rotation.z = -sideSign * 0.12;

    sGroup.add(deltoidCap, armPocket, unitPatch);
    return sGroup;
  };

  const handKnuckleGeo = getCachedGeo('handKnuckleContoured', () => {
    const g = new THREE.CapsuleGeometry(0.011, 0.044, 8, 10);
    g.rotateX(Math.PI / 2);
    return g;
  });
  const handThumbGeo = getCachedGeo('handThumb', () => new THREE.CapsuleGeometry(0.010, 0.034, 6, 10));
  const handFingerGeo = getCachedGeo('handFinger', () => new THREE.CapsuleGeometry(0.0085, 0.036, 6, 10));

  // Hierarchical Right Arm: rightArm (shoulder pivot) -> rightForearm (elbow pivot) -> rightHand (5-finger grip)
  const rightArm = new THREE.Group();
  rightArm.position.set(0.335, 0.01, 0);
  const rightShoulder = buildTacticalShoulder(1);

  const rightBicep = new THREE.Mesh(
    getCachedGeo('rightBicep', () => new THREE.CapsuleGeometry(0.065, 0.19, 12, 16)),
    bduMat
  );
  rightBicep.scale.set(1.15, 1.08, 1.15);
  rightBicep.position.set(0.015, -0.11, -0.07);
  rightBicep.rotation.set(0.58, 0, -0.06);
  rightBicep.castShadow = true;
  tagBodyHitbox(rightBicep);

  const rightElbow = new THREE.Mesh(
    getCachedGeo('rightElbow', () => new THREE.SphereGeometry(0.056, 14, 12)),
    armorMat
  );
  rightElbow.position.set(0.030, -0.20, -0.17);

  const rightForearm = new THREE.Group();
  rightForearm.position.set(0.030, -0.20, -0.17);

  const rightForearmMesh = new THREE.Mesh(
    getCachedGeo('rightForearmMesh', () => new THREE.CylinderGeometry(0.056, 0.042, 0.25, 18)),
    bduMat
  );
  rightForearmMesh.position.set(-0.030, 0.04, -0.12);
  rightForearmMesh.rotation.set(1.34, -0.20, 0);
  rightForearmMesh.castShadow = true;
  tagBodyHitbox(rightForearmMesh);

  const rightCuff = new THREE.Mesh(
    getCachedGeo('rightCuff', () => new THREE.CylinderGeometry(0.046, 0.044, 0.055, 16)),
    webbingMat
  );
  rightCuff.position.set(-0.045, 0.065, -0.195);
  rightCuff.rotation.set(1.34, -0.20, 0);

  const rightHand = new THREE.Group();
  rightHand.position.set(-0.055, 0.08, -0.235);
  const rPalm = new THREE.Mesh(
    getCachedGeo('rPalm', () => new THREE.CapsuleGeometry(0.024, 0.038, 8, 12)),
    bootMat
  );
  rPalm.rotation.x = Math.PI / 2.2;
  const rKnuckle = new THREE.Mesh(handKnuckleGeo, armorMat);
  rKnuckle.position.set(0.004, 0.025, 0);
  const rThumb = new THREE.Mesh(handThumbGeo, bootMat);
  rThumb.position.set(-0.026, 0.012, -0.016);
  rThumb.rotation.set(0.42, 0.32, 0.52);
  rightHand.add(rPalm, rKnuckle, rThumb);
  for (let f = 0; f < 4; f++) {
    const rFinger = new THREE.Mesh(handFingerGeo, bootMat);
    rFinger.position.set(-0.014, -0.004 - f * 0.014, -0.030 + (f === 0 ? -0.012 : 0));
    rFinger.rotation.z = Math.PI / 2;
    rFinger.rotation.y = f === 0 ? -0.32 : 0.08;
    rightHand.add(rFinger);
  }

  rightForearm.add(rightForearmMesh, rightCuff, rightHand);
  rightArm.add(rightShoulder, rightBicep, rightElbow, rightForearm);

  // Hierarchical Left Arm: leftArm (shoulder pivot) -> leftForearm (elbow pivot) -> leftHand (5-finger C-clamp grip)
  const leftArm = new THREE.Group();
  leftArm.position.set(-0.335, 0.01, 0);
  const leftShoulder = buildTacticalShoulder(-1);

  const leftBicep = new THREE.Mesh(
    getCachedGeo('leftBicep', () => new THREE.CapsuleGeometry(0.063, 0.20, 12, 16)),
    bduMat
  );
  leftBicep.scale.set(1.15, 1.08, 1.15);
  leftBicep.position.set(0.035, -0.10, -0.10);
  leftBicep.rotation.set(0.75, -0.42, 0.30);
  leftBicep.castShadow = true;
  tagBodyHitbox(leftBicep);

  const leftElbow = new THREE.Mesh(
    getCachedGeo('leftElbow', () => new THREE.SphereGeometry(0.055, 14, 12)),
    armorMat
  );
  leftElbow.position.set(0.125, -0.18, -0.23);

  const leftForearm = new THREE.Group();
  leftForearm.position.set(0.125, -0.18, -0.23);

  const leftForearmMesh = new THREE.Mesh(
    getCachedGeo('leftForearmMesh', () => new THREE.CylinderGeometry(0.055, 0.041, 0.31, 18)),
    bduMat
  );
  leftForearmMesh.position.set(0.20, 0.05, -0.16);
  leftForearmMesh.rotation.set(1.38, 0, -0.82);
  leftForearmMesh.castShadow = true;
  tagBodyHitbox(leftForearmMesh);

  const leftWristWatch = new THREE.Mesh(
    getCachedGeo('leftWristWatch', () => new THREE.CylinderGeometry(0.044, 0.044, 0.045, 16)),
    armorMat
  );
  leftWristWatch.position.set(0.32, 0.072, -0.25);
  leftWristWatch.rotation.set(1.38, 0, -0.82);
  const leftWatchDial = new THREE.Mesh(
    getCachedGeo('leftWatchDial', () => new THREE.CylinderGeometry(0.018, 0.018, 0.010, 16)),
    mainMat
  );
  leftWatchDial.position.set(0.312, 0.092, -0.25);
  leftWatchDial.rotation.set(0.24, 0, 0.32);

  const leftHand = new THREE.Group();
  leftHand.position.set(0.40, 0.09, -0.31);
  const lPalm = new THREE.Mesh(
    getCachedGeo('lPalm', () => new THREE.CapsuleGeometry(0.024, 0.040, 8, 12)),
    bootMat
  );
  lPalm.rotation.x = Math.PI / 2;
  const lKnuckle = new THREE.Mesh(handKnuckleGeo, armorMat);
  lKnuckle.position.set(-0.004, 0.024, 0);
  const lThumb = new THREE.Mesh(handThumbGeo, bootMat);
  lThumb.position.set(-0.016, 0.026, -0.016);
  lThumb.rotation.set(0.2, -0.38, -0.75);
  leftHand.add(lPalm, lKnuckle, lThumb);
  for (let f = 0; f < 4; f++) {
    const lFinger = new THREE.Mesh(handFingerGeo, bootMat);
    lFinger.position.set(0.015, -0.014, -0.032 + f * 0.018);
    lFinger.rotation.z = Math.PI / 2.3;
    leftHand.add(lFinger);
  }

  leftForearm.add(leftForearmMesh, leftWristWatch, leftWatchDial, leftHand);
  leftArm.add(leftShoulder, leftBicep, leftElbow, leftForearm);

  // Held 3D Weapon aligned with both hands (deduplicate weapon BufferGeometries via RIG_GEO_CACHE)
  const gunHolder = new THREE.Group();
  gunHolder.position.set(0.27, -0.03, -0.42);
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

  const hipBallGeo = getCachedGeo('hipBall', () => new THREE.SphereGeometry(0.105, 16, 14));
  const quadMuscleGeo = getCachedGeo('quadMuscleContour', () => new THREE.CapsuleGeometry(0.072, 0.14, 8, 12));
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
  const kneeSphereGeo = getCachedGeo('kneeSphere', () => new THREE.SphereGeometry(0.080, 14, 12));
  const kneePadBaseGeo = getCachedGeo('kneePadBase', () => new THREE.CapsuleGeometry(0.056, 0.068, 10, 14));
  // Contoured Curved Hard Knee Cap (replaces flat BoxGeometry)
  const kneeHardCapGeo = getCachedGeo('kneeHardCapCurved', () => {
    const g = new THREE.CylinderGeometry(0.066, 0.062, 0.088, 16, 1, false, Math.PI * 0.68, Math.PI * 0.64);
    return g;
  });
  const kneeStrapGeo = getCachedGeo('kneeStrap', () => new THREE.TorusGeometry(0.082, 0.011, 8, 18));
  const calfMuscleGeo = getCachedGeo('calfMuscle', () => new THREE.SphereGeometry(0.078, 14, 12));
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
    const quadMuscle = new THREE.Mesh(quadMuscleGeo, bduMat);
    quadMuscle.scale.set(1.04, 1.0, 0.92);
    quadMuscle.position.set(0, -0.175, -0.028);

    // Contoured BDU Thigh Cargo Pocket + Beveled Flap
    const cargoPocket = new THREE.Mesh(cargoPocketGeo, bduMat);
    cargoPocket.position.set(sideSign * 0.094, -0.185, -0.005);
    const pocketFlap = new THREE.Mesh(pocketFlapGeo, vestMat);
    pocketFlap.position.set(sideSign * 0.098, -0.115, -0.005);
    hipLegMesh.add(hipBall, quadMuscle, cargoPocket, pocketFlap);

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
    kneePadBase.position.set(0, 0.005, -0.046);
    const kneeHardCap = new THREE.Mesh(kneeHardCapGeo, armorMat);
    kneeHardCap.position.set(0, 0.005, -0.048);
    const kneeStrap = new THREE.Mesh(kneeStrapGeo, webbingMat);
    kneeStrap.rotation.x = Math.PI / 2;
    kneeStrap.position.set(0, 0.005, 0);

    // Lower Leg (Shin & Gastrocnemius Calf Muscle + Contoured Combat Boot)
    const shinMesh = new THREE.Mesh(shinGeo, bduMat);
    shinMesh.castShadow = true;
    tagBodyHitbox(shinMesh);

    const calfMuscle = new THREE.Mesh(calfMuscleGeo, bduMat);
    calfMuscle.scale.set(0.94, 1.42, 1.08);
    calfMuscle.position.set(0, -0.125, 0.028);

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
  // Also attach a cached inverted-hull outline per bone scope for remote operators (!isShowcase)
  const useEnemyOutline = !isShowcase;
  const initialOutlineMat = options.isTeammate ? TEAMMATE_OUTLINE_MAT : ENEMY_OUTLINE_MAT;
  const outlineMeshes = [
    batchBoneScope(pelvisGroup, 'pelvis', new Set([upperBodyGroup, pelvisHitboxProxy]), pelvisCore, useEnemyOutline, initialOutlineMat),
    batchBoneScope(upperBodyGroup, 'chest', new Set([headGroup, armPivot, torsoHitboxProxy]), torsoMesh, useEnemyOutline, initialOutlineMat),
    batchBoneScope(headGroup, 'head', new Set([headHitboxProxy]), headMesh, useEnemyOutline, initialOutlineMat),
    batchBoneScope(armPivot, 'arms', new Set([gunHolder]), null, useEnemyOutline, initialOutlineMat),
    batchBoneScope(leftLeg, 'leg_l', new Set([leftKneePivot, leftLegHitboxProxy]), leftLeg, useEnemyOutline, initialOutlineMat),
    batchBoneScope(rightLeg, 'leg_r', new Set([rightKneePivot, rightLegHitboxProxy]), rightLeg, useEnemyOutline, initialOutlineMat),
    batchBoneScope(leftKneePivot, 'shin_l', new Set([leftShinHitboxProxy]), leftLegData.shinMesh, useEnemyOutline, initialOutlineMat),
    batchBoneScope(rightKneePivot, 'shin_r', new Set([rightShinHitboxProxy]), rightLegData.shinMesh, useEnemyOutline, initialOutlineMat)
  ].filter(Boolean);

  if (!isShowcase && options.scene) {
    options.scene.add(group);
  }

  const setOperatorColor = (newHex) => {
    mainMat.color.setHex(newHex);
    if (isShowcase) {
      visorMat.emissive.setHex(newHex);
    }
  };

  const setTeamOutline = (isTeammate) => {
    const targetMat = isTeammate ? TEAMMATE_OUTLINE_MAT : ENEMY_OUTLINE_MAT;
    for (let i = 0; i < outlineMeshes.length; i++) {
      outlineMeshes[i].material = targetMat;
    }
  };

  return {
    id: playerData.id,
    name: playerData.name,
    team: playerData.team || null,
    isTeammate: Boolean(options.isTeammate),
    group,
    root: group,
    bodyGroup: pelvisGroup,
    pelvisGroup,
    pelvisCore,
    hips: pelvisGroup,
    upperBodyGroup,
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
    currentWeapon: playerData.weapon || 'rifle',
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
}

export const createHumanoidPlayerRig = createRemotePlayerMesh;
