import * as THREE from '../three.js';
import { createWeaponMesh } from '../weaponModels.js';
import { roundedBox } from '../weapons/roundedBox.js';
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

export function resolveCryzenVariantFromColor(colorHex) {
  const hex = Number(colorHex);
  if (hex === 0xef4444) return 'v2_goggles';
  if (hex === 0x94a3b8) return 'v3_ghost';
  if (hex === 0x4b5320) return 'v4_recon';
  return 'v1_hero';
}

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

  const demoVariant = options.demoVariant || playerData.variant || resolveCryzenVariantFromColor(pColor);
  const variantPalettes = {
    v1_hero: {
      bdu: 0xb07239,
      cuff: 0x945b27,
      vest: 0x1c1f24,
      pouch: 0x7d4b25,
      pouchFlap: 0x8f572d,
      helmet: 0x22262c
    },
    v2_goggles: {
      bdu: 0xa66830,
      cuff: 0x8a5222,
      vest: 0x1a1d22,
      pouch: 0x784722,
      pouchFlap: 0x8c542a,
      helmet: 0x20242a
    },
    v3_ghost: {
      bdu: 0x28303d,
      cuff: 0x1e242e,
      vest: 0x14171c,
      pouch: 0x3b4454,
      pouchFlap: 0x475263,
      helmet: 0x1a1e24
    },
    v4_recon: {
      bdu: 0x4e5e42,
      cuff: 0x3e4b34,
      vest: 0x5c3d22,
      pouch: 0x8c5c30,
      pouchFlap: 0x9e6938,
      helmet: 0x2f3829
    }
  };
  const pal = variantPalettes[demoVariant] || variantPalettes.v1_hero;
  const isDefaultHero = demoVariant === 'v1_hero';

  // Authentic Cryzen.io Tactical Soldier Material Palette (Coyote Tan Uniform + Matte Black Plate Carrier + Brown Mag Pouches + Exposed Eyes Balaclava)
  // 1. Tactical Patch / Team Identification Trim (responds to suit color swatch)
  let mainMat = getCachedMat(isShowcase ? `main_showcase_${demoVariant}` : `main_${pColor}`, () => {
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

  // 2. Cryzen Coyote Tan / Tactical Combat Shirt & Cargo Pants (matte woven cloth finish — no plastic sheen!)
  const bduMat = getCachedMat(isDefaultHero ? 'bdu_0x262e36' : `bdu_${demoVariant}_${pal.bdu}`, () =>
    createProceduralMaterial('bdu', pal.bdu, {
      roughness: 0.88,
      metalness: 0.02,
      bumpScale: 0.006
    })
  );

  // 2b. Rolled Sleeve Cuff & Shoulder Patch Trim
  const cuffMat = getCachedMat(`cuff_${demoVariant}_${pal.cuff}`, () =>
    createProceduralMaterial('bdu', pal.cuff, {
      roughness: 0.86,
      metalness: 0.02,
      bumpScale: 0.006
    })
  );

  // 3. Cryzen Matte Tactical Plate Carrier, Shoulder Straps & Battle Belt
  const vestMat = getCachedMat(isDefaultHero ? 'cordura_0x625748' : `vest_${demoVariant}_${pal.vest}`, () =>
    createProceduralMaterial('cordura', pal.vest, {
      roughness: 0.78,
      metalness: 0.06,
      bumpScale: 0.008
    })
  );

  // 3b. Cryzen Signature 3 Front Box Magazine Pouches & Chest Patch Panel
  const pouchMat = getCachedMat(`pouch_${demoVariant}_${pal.pouch}`, () =>
    createProceduralMaterial('cordura', pal.pouch, {
      roughness: 0.66,
      metalness: 0.08
    })
  );
  const pouchFlapMat = getCachedMat(`pouchFlap_${demoVariant}_${pal.pouchFlap}`, () =>
    createProceduralMaterial('cordura', pal.pouchFlap, {
      roughness: 0.62,
      metalness: 0.08
    })
  );
  const pouchStitchMat = getCachedMat('pouchStitch_0x2b190d', () =>
    new THREE.MeshStandardMaterial({
      color: 0x22140a,
      roughness: 0.75,
      metalness: 0.05
    })
  );

  // 4. Matte Black Balaclava Mask & Webbing (#15171c)
  const webbingMat = getCachedMat('bdu_0x1a1f25', () =>
    createProceduralMaterial('bdu', 0x15171c, {
      roughness: 0.82,
      metalness: 0.05,
      bumpScale: 0.008
    })
  );

  // 5. Matte Charcoal FAST High-Cut Ballistic Helmet & Hard Armor Shells
  const armorMat = getCachedMat(isDefaultHero ? 'kevlar_0x2c3430' : `helmet_${demoVariant}_${pal.helmet}`, () =>
    createProceduralMaterial('kevlar', pal.helmet, {
      roughness: 0.66,
      metalness: 0.14
    })
  );

  // 6. Exposed Human Skin (Eye Cutout Band & Exposed Wrists below Rolled Cuffs)
  const skinMat = getCachedMat('skin_0xf6c8a8', () =>
    new THREE.MeshStandardMaterial({
      color: 0xf4c29b,
      roughness: 0.45,
      metalness: 0.02,
      emissive: 0x4a2815,
      emissiveIntensity: 0.14
    })
  );
  skinMat.userData = { shared: true, matSlotKey: 'skin' };

  // 6b. Expressive Cryzen Eyes (Sclera White, Dark Espresso Iris/Pupil & Tactical Eyebrows)
  const eyeWhiteMat = getCachedMat('eyeWhite_0xfafcff', () =>
    new THREE.MeshStandardMaterial({
      color: 0xfafcff,
      roughness: 0.22,
      metalness: 0.02,
      emissive: 0xffffff,
      emissiveIntensity: 0.12
    })
  );
  const eyePupilMat = getCachedMat('eyePupil_0x18100c', () =>
    new THREE.MeshStandardMaterial({
      color: 0x18100c,
      roughness: 0.14,
      metalness: 0.12
    })
  );
  const eyebrowMat = getCachedMat('eyebrow_0x24160e', () =>
    new THREE.MeshStandardMaterial({
      color: 0x24160e,
      roughness: 0.68,
      metalness: 0.04
    })
  );

  // 7. Anodized Gunmetal Hardware & Buckle Trim
  const chromeMat = getCachedMat('chrome_0x64748b', () =>
    new THREE.MeshStandardMaterial({
      color: 0x525b66,
      roughness: 0.28,
      metalness: 0.82
    })
  );

  // 8. Matte Black Tactical Gloves & Combat Boots (#17191d)
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

  // ==================== 1. PELVIS, HIPS & CRYZEN MATTE-BLACK TACTICAL WAIST BELT ====================
  const pelvisGroup = new THREE.Group();
  pelvisGroup.position.set(0, 0.80, 0);
  group.add(pelvisGroup);

  const pelvisVisualGroup = new THREE.Group();
  pelvisGroup.add(pelvisVisualGroup);

  // Clean Beveled Pelvis & Hip Block (Coyote Tan Trousers)
  const pelvisCore = new THREE.Mesh(
    getCachedGeo('cryzenPelvisCore', () => roundedBox(0.33, 0.17, 0.20, 0.042, 3)),
    bduMat
  );
  pelvisCore.position.set(0, 0.005, 0);
  pelvisCore.castShadow = true;
  tagBodyHitbox(pelvisCore);
  pelvisVisualGroup.add(pelvisCore);

  // Matte-Black Tactical Waist Belt + Belt Loops + Center Gunmetal Buckle (matches wackysteps.webp)
  const beltRing = new THREE.Mesh(
    getCachedGeo('cryzenBeltRing', () => roundedBox(0.352, 0.056, 0.222, 0.022, 3)),
    vestMat
  );
  beltRing.position.set(0, 0.064, 0);

  const cobraBuckle = new THREE.Mesh(
    getCachedGeo('cryzenBeltBuckle', () => roundedBox(0.062, 0.064, 0.024, 0.005, 2)),
    armorMat
  );
  cobraBuckle.position.set(0, 0.064, -0.108);

  const beltLoopGeo = getCachedGeo('cryzenBeltLoop', () => roundedBox(0.018, 0.066, 0.016, 0.003, 1));
  for (const lx of [-0.11, -0.055, 0.055, 0.11]) {
    const loop = new THREE.Mesh(beltLoopGeo, webbingMat);
    loop.position.set(lx, 0.064, -0.108);
    pelvisVisualGroup.add(loop);
  }

  const ifakCross = new THREE.Mesh(
    getCachedGeo('ifakCross', () => roundedBox(0.036, 0.020, 0.012, 0.003, 1)),
    mainMat
  );
  ifakCross.position.set(0, 0.064, 0.112);

  pelvisVisualGroup.add(
    beltRing,
    cobraBuckle,
    ifakCross
  );

  // ==================== 2. CRYZEN COYOTE TAN JACKET TORSO & MATTE-BLACK PLATE CARRIER VEST ====================
  const upperBodyGroup = new THREE.Group();
  upperBodyGroup.position.set(0, 0.10, 0); // World y = 0.90
  pelvisGroup.add(upperBodyGroup);

  const torsoVisualGroup = new THREE.Group();
  upperBodyGroup.add(torsoVisualGroup);

  // Clean Beveled V-Tapered Coyote Tan Combat Jacket Torso & Broad Integrated Shoulder Yoke (zero armpit gap!)
  const torsoGeo = getCachedGeo('cryzenTorsoLower_v7', () => roundedBox(0.345, 0.50, 0.204, 0.036, 3));
  const torsoMesh = new THREE.Mesh(torsoGeo, bduMat);
  torsoMesh.position.set(0, 0.27, 0);
  torsoMesh.castShadow = true;
  tagBodyHitbox(torsoMesh);
  torsoVisualGroup.add(torsoMesh);

  // Nested Chest Group inside Spine (upperBodyGroup) for hierarchical rig compatibility
  const chestGroup = new THREE.Group();
  chestGroup.position.set(0, 0, 0);
  upperBodyGroup.add(chestGroup);

  const upperChestBroad = new THREE.Mesh(
    getCachedGeo('cryzenUpperChestBroad_v7', () => roundedBox(0.405, 0.26, 0.210, 0.028, 3)),
    bduMat
  );
  upperChestBroad.position.set(0, 0.422, -0.004);
  upperChestBroad.castShadow = true;
  tagBodyHitbox(upperChestBroad);
  torsoVisualGroup.add(upperChestBroad);

  const trapGeo = getCachedGeo('cryzenTrapSlope_v7', () => roundedBox(0.195, 0.105, 0.192, 0.022, 2));
  const trapeziusL = new THREE.Mesh(trapGeo, bduMat);
  trapeziusL.position.set(-0.132, 0.502, -0.004);
  trapeziusL.rotation.z = 0.24;
  const trapeziusR = new THREE.Mesh(trapGeo, bduMat);
  trapeziusR.position.set(0.132, 0.502, -0.004);
  trapeziusR.rotation.z = -0.24;
  torsoVisualGroup.add(trapeziusL, trapeziusR);

  // Stitched Cryzen Shoulder Seam Dashes & Tailored Armhole Gussets (zero armpit gap at any arm abduction angle!)
  const armholeGussetGeo = getCachedGeo('cryzenArmholeGusset_v7', () => roundedBox(0.118, 0.135, 0.155, 0.022, 2));
  const seamDashGeo = getCachedGeo('cryzenShoulderSeamDash', () => new THREE.BoxGeometry(0.005, 0.010, 0.015));
  for (const side of [-1, 1]) {
    const gusset = new THREE.Mesh(armholeGussetGeo, bduMat);
    gusset.position.set(side * 0.168, 0.435, -0.008);
    gusset.rotation.z = -side * 0.32;
    torsoVisualGroup.add(gusset);

    for (const sz of [-0.048, -0.020, 0.008, 0.036]) {
      const dash = new THREE.Mesh(seamDashGeo, pouchStitchMat);
      dash.position.set(side * 0.180, 0.490, sz);
      dash.rotation.z = -side * 0.26;
      torsoVisualGroup.add(dash);
    }
  }

  // Matte-Black Trapezoidal Ballistic Plate Carrier Vest sitting PROUDLY outside the Jacket (matching wackysteps.webp)
  const frontPlateCore = new THREE.Mesh(
    getCachedGeo('cryzenVestFrontLower', () => roundedBox(0.320, 0.255, 0.060, 0.020, 3)),
    vestMat
  );
  frontPlateCore.position.set(0, 0.218, -0.098);
  frontPlateCore.castShadow = true;

  const frontUpperBevel = new THREE.Mesh(
    getCachedGeo('cryzenVestFrontUpper', () => roundedBox(0.224, 0.175, 0.056, 0.018, 3)),
    vestMat
  );
  frontUpperBevel.position.set(0, 0.392, -0.096);
  frontUpperBevel.castShadow = true;

  // Trapezoidal Diagonal Side Wings tapering the Plate Carrier smoothly from lower waist to upper chest
  const vestSlopeGeo = getCachedGeo('cryzenVestSideSlope', () => roundedBox(0.068, 0.165, 0.054, 0.014, 2));
  const vestSlopeL = new THREE.Mesh(vestSlopeGeo, vestMat);
  vestSlopeL.position.set(-0.114, 0.355, -0.096);
  vestSlopeL.rotation.z = -0.32;
  const vestSlopeR = new THREE.Mesh(vestSlopeGeo, vestMat);
  vestSlopeR.position.set(0.114, 0.355, -0.096);
  vestSlopeR.rotation.z = 0.32;

  const rearPlateCore = new THREE.Mesh(
    getCachedGeo('cryzenVestRearPlate', () => roundedBox(0.312, 0.39, 0.056, 0.022, 3)),
    vestMat
  );
  rearPlateCore.position.set(0, 0.295, 0.096);
  rearPlateCore.castShadow = true;

  // Matte-Black Side Cummerbund Straps with Horizontal MOLLE Ribs wrapping around the waist
  const cummerbundGeo = getCachedGeo('cryzenCummerbundSide', () => roundedBox(0.044, 0.152, 0.232, 0.012, 2));
  const cummerbundL = new THREE.Mesh(cummerbundGeo, vestMat);
  cummerbundL.position.set(-0.162, 0.205, 0);
  const cummerbundR = new THREE.Mesh(cummerbundGeo, vestMat);
  cummerbundR.position.set(0.162, 0.205, 0);

  const molleSideStripGeo = getCachedGeo('cryzenMolleSideStrip', () => roundedBox(0.048, 0.022, 0.165, 0.004, 1));
  for (const sy of [0.162, 0.205, 0.248]) {
    const mL = new THREE.Mesh(molleSideStripGeo, webbingMat);
    mL.position.set(-0.163, sy, -0.015);
    const mR = new THREE.Mesh(molleSideStripGeo, webbingMat);
    mR.position.set(0.163, sy, -0.015);
    torsoVisualGroup.add(mL, mR);
  }

  // Angled Trapezoidal Vest Shoulder Straps lying flush against the upper chest & shoulders
  const pcStrapFrontGeo = getCachedGeo('cryzenPcStrapFront', () => roundedBox(0.066, 0.125, 0.038, 0.010, 2));
  const pcStrapTopGeo = getCachedGeo('cryzenPcStrapTop', () => roundedBox(0.070, 0.036, 0.210, 0.010, 2));
  for (const side of [-1, 1]) {
    const strapFront = new THREE.Mesh(pcStrapFrontGeo, vestMat);
    strapFront.position.set(side * 0.084, 0.468, -0.098);
    strapFront.rotation.z = -side * 0.16;
    strapFront.rotation.x = -0.32;

    const strapTop = new THREE.Mesh(pcStrapTopGeo, vestMat);
    strapTop.position.set(side * 0.098, 0.542, -0.004);
    strapTop.rotation.z = -side * 0.14;

    torsoVisualGroup.add(strapFront, strapTop);
  }

  // Optional Tactical PTT Radio on Left Vest Strap for Variant 2 (v2_goggles)
  if (demoVariant === 'v2_goggles') {
    const radioBody = new THREE.Mesh(
      getCachedGeo('cryzenRadioBody', () => roundedBox(0.044, 0.078, 0.032, 0.006, 2)),
      bootMat
    );
    radioBody.position.set(-0.088, 0.445, -0.122);
    radioBody.rotation.z = 0.14;
    const radioAntenna = new THREE.Mesh(
      getCachedGeo('cryzenRadioAntenna', () => new THREE.CylinderGeometry(0.003, 0.0045, 0.14, 8)),
      bootMat
    );
    radioAntenna.position.set(-0.102, 0.535, -0.118);
    torsoVisualGroup.add(radioBody, radioAntenna);
  }

  // 3 Crisp Rectangular Coyote-Brown Magazine Pouches + Beveled Flaps + Corner Snaps + Stitched [X] across lower Vest
  const magPouchBoxGeo = getCachedGeo('cryzenPouchBody', () => roundedBox(0.084, 0.142, 0.046, 0.008, 2));
  const magPouchPocketGeo = getCachedGeo('cryzenPouchPocket', () => roundedBox(0.070, 0.082, 0.012, 0.004, 1));
  const magPouchFlapGeo = getCachedGeo('cryzenPouchFlap', () => roundedBox(0.088, 0.052, 0.052, 0.008, 2));
  const magPouchStitchGeo = getCachedGeo('cryzenPouchXBar', () => new THREE.BoxGeometry(0.005, 0.066, 0.006));
  const magPouchSnapGeo = getCachedGeo('cryzenPouchSnap', () => new THREE.CylinderGeometry(0.0052, 0.0052, 0.008, 10));

  for (let m = -1; m <= 1; m++) {
    const mx = m * 0.092;
    const pouch = new THREE.Mesh(magPouchBoxGeo, pouchMat);
    pouch.position.set(mx, 0.205, -0.138);
    pouch.castShadow = true;

    const frontPocket = new THREE.Mesh(magPouchPocketGeo, pouchFlapMat);
    frontPocket.position.set(mx, 0.183, -0.160);

    const pouchFlap = new THREE.Mesh(magPouchFlapGeo, pouchFlapMat);
    pouchFlap.position.set(mx, 0.255, -0.141);

    // Two dark corner snap rivets on each pouch flap (just like wackysteps.webp)
    for (const sx of [-0.024, 0.024]) {
      const snap = new THREE.Mesh(magPouchSnapGeo, pouchStitchMat);
      snap.rotation.x = Math.PI / 2;
      snap.position.set(mx + sx, 0.239, -0.166);
      torsoVisualGroup.add(snap);
    }

    const stitchDiag1 = new THREE.Mesh(magPouchStitchGeo, pouchStitchMat);
    stitchDiag1.position.set(mx, 0.181, -0.166);
    stitchDiag1.rotation.z = 0.64;

    const stitchDiag2 = new THREE.Mesh(magPouchStitchGeo, pouchStitchMat);
    stitchDiag2.position.set(mx, 0.181, -0.166);
    stitchDiag2.rotation.z = -0.64;

    torsoVisualGroup.add(pouch, frontPocket, pouchFlap, stitchDiag1, stitchDiag2);
  }

  // Cryzen Chest Velcro Frame + Brown Morale Patch + Helmet-Skull Silhouette Icon (matches wackysteps.webp)
  const chestVelcroFrame = new THREE.Mesh(
    getCachedGeo('cryzenChestVelcroFrame', () => roundedBox(0.162, 0.106, 0.018, 0.005, 2)),
    webbingMat
  );
  chestVelcroFrame.position.set(0, 0.392, -0.125);

  const adminPouch = new THREE.Mesh(
    getCachedGeo('cryzenChestPatchPanel', () => roundedBox(0.122, 0.068, 0.020, 0.004, 2)),
    pouchMat
  );
  adminPouch.position.set(0, 0.396, -0.130);

  const chestEmblem = new THREE.Mesh(
    getCachedGeo('cryzenChestEmblemHelmet', () => new THREE.SphereGeometry(0.017, 12, 10)),
    pouchStitchMat
  );
  chestEmblem.scale.set(1.18, 0.90, 0.35);
  chestEmblem.position.set(0, 0.404, -0.140);

  const chestEmblemJaw = new THREE.Mesh(
    getCachedGeo('cryzenChestEmblemJaw', () => roundedBox(0.022, 0.014, 0.008, 0.002, 1)),
    pouchStitchMat
  );
  chestEmblemJaw.position.set(0, 0.386, -0.140);

  const squadPatch = new THREE.Mesh(
    getCachedGeo('cryzenSquadAccentStrip', () => roundedBox(0.114, 0.011, 0.018, 0.003, 1)),
    mainMat
  );
  squadPatch.position.set(0, 0.352, -0.130);

  // Coyote Tan Open V-Neck Shirt Collar + Snug Matte-Black Balaclava Neck
  const collarFlapGeo = getCachedGeo('cryzenCollarFlap', () => roundedBox(0.072, 0.082, 0.155, 0.016, 2));
  const collarL = new THREE.Mesh(collarFlapGeo, cuffMat);
  collarL.position.set(-0.064, 0.566, -0.008);
  collarL.rotation.z = -0.24;
  const collarR = new THREE.Mesh(collarFlapGeo, cuffMat);
  collarR.position.set(0.064, 0.566, -0.008);
  collarR.rotation.z = 0.24;

  const collarBack = new THREE.Mesh(
    getCachedGeo('cryzenCollarBack', () => roundedBox(0.165, 0.078, 0.048, 0.014, 2)),
    cuffMat
  );
  collarBack.position.set(0, 0.572, 0.054);

  const neckGaiter = new THREE.Mesh(
    getCachedGeo('cryzenNeckGaiter', () => new THREE.CylinderGeometry(0.082, 0.090, 0.105, 18)),
    webbingMat
  );
  neckGaiter.position.set(0, 0.590, -0.006);

  torsoVisualGroup.add(
    frontPlateCore,
    frontUpperBevel,
    vestSlopeL,
    vestSlopeR,
    rearPlateCore,
    cummerbundL,
    cummerbundR,
    chestVelcroFrame,
    adminPouch,
    chestEmblem,
    chestEmblemJaw,
    squadPatch,
    collarL,
    collarR,
    collarBack,
    neckGaiter
  );

  // ==================== 3. CRYZEN.IO HEAD: TAPERED BALACLAVA, V-BRIDGE NOSE, SHARP EYES & MATTE FAST HELMET ====================
  const headGroup = new THREE.Group();
  headGroup.position.set(0, 0.64, 0); // World y = 1.54
  chestGroup.add(headGroup);

  const neckPivotBall = new THREE.Mesh(
    getCachedGeo('cryzenNeckBall', () => new THREE.SphereGeometry(0.078, 14, 12)),
    webbingMat
  );
  neckPivotBall.position.set(0, -0.048, -0.006);

  const upperNeckColumn = new THREE.Mesh(
    getCachedGeo('cryzenUpperNeck', () => new THREE.CylinderGeometry(0.076, 0.082, 0.065, 16)),
    webbingMat
  );
  upperNeckColumn.position.set(0, -0.032, -0.006);
  headGroup.add(neckPivotBall, upperNeckColumn);

  // Sculpted Tapered Head Core (Matte-Black Balaclava Hood sitting naturally inside the open collar & helmet)
  const headGeo = getCachedGeo('cryzenHeadCore', () => roundedBox(0.192, 0.168, 0.198, 0.054, 4));
  const headMesh = new THREE.Mesh(headGeo, webbingMat);
  headMesh.position.set(0, 0.038, -0.006);
  headMesh.castShadow = true;
  tagHeadHitbox(headMesh);
  headGroup.add(headMesh);

  // Sculpted Warm Peach Face inside the Sleek Horizontal Balaclava Eye Cutout
  const faceSkinBand = new THREE.Mesh(
    getCachedGeo('cryzenFaceSculpt', () => roundedBox(0.168, 0.054, 0.132, 0.012, 3)),
    skinMat
  );
  faceSkinBand.position.set(0, 0.072, -0.048);

  // Balaclava Left & Right Temple Wraps (frame the rectangular eye window cleanly on both sides)
  const templeWrapGeo = getCachedGeo('cryzenTempleWrap', () => roundedBox(0.030, 0.078, 0.152, 0.010, 2));
  const templeWrapL = new THREE.Mesh(templeWrapGeo, webbingMat);
  templeWrapL.position.set(-0.084, 0.066, -0.040);
  const templeWrapR = new THREE.Mesh(templeWrapGeo, webbingMat);
  templeWrapR.position.set(0.084, 0.066, -0.040);

  // Skin-Tight Tapered Matte-Black Balaclava Lower Mask (Seamless Cheeks + Tapered Chin right below the eyes!)
  const balaclavaJaw = new THREE.Mesh(
    getCachedGeo('cryzenBalaclavaCheeks', () => roundedBox(0.186, 0.078, 0.184, 0.014, 3)),
    webbingMat
  );
  balaclavaJaw.position.set(0, 0.014, -0.028);

  const balaclavaChin = new THREE.Mesh(
    getCachedGeo('cryzenBalaclavaChinTaper', () => roundedBox(0.152, 0.068, 0.164, 0.032, 4)),
    webbingMat
  );
  balaclavaChin.position.set(0, -0.018, -0.026);

  // Expressive Cryzen.io Tactical Eyes, Upper Lash Line & Bold Angled Eyebrows (flush on face at z = -0.115)
  const eyeScleraGeo = getCachedGeo('cryzenEyeScleraPlate', () => roundedBox(0.045, 0.028, 0.008, 0.009, 3));
  const eyeIrisGeo = getCachedGeo('cryzenEyeIrisDisc', () => new THREE.CylinderGeometry(0.0136, 0.0136, 0.010, 20));
  const eyeCatchlightGeo = getCachedGeo('cryzenEyeGlintSphere', () => new THREE.SphereGeometry(0.0038, 8, 8));
  const eyeLashGeo = getCachedGeo('cryzenEyeUpperLash', () => roundedBox(0.047, 0.005, 0.009, 0.002, 1));
  const eyebrowGeo = getCachedGeo('cryzenArchedBrow', () => roundedBox(0.052, 0.0105, 0.010, 0.004, 2));

  for (const side of [-1, 1]) {
    const ex = side * 0.038;
    const sclera = new THREE.Mesh(eyeScleraGeo, eyeWhiteMat);
    sclera.position.set(ex, 0.066, -0.114);
    sclera.rotation.y = -side * 0.08;

    const iris = new THREE.Mesh(eyeIrisGeo, eyePupilMat);
    iris.rotation.x = Math.PI / 2;
    iris.position.set(ex - side * 0.003, 0.065, -0.1155);

    const catchlight = new THREE.Mesh(eyeCatchlightGeo, eyeWhiteMat);
    catchlight.position.set(ex - 0.005, 0.071, -0.119);

    const upperLash = new THREE.Mesh(eyeLashGeo, eyebrowMat);
    upperLash.position.set(ex, 0.079, -0.1155);
    upperLash.rotation.z = -side * 0.05;
    upperLash.rotation.y = -side * 0.08;

    const brow = new THREE.Mesh(eyebrowGeo, eyebrowMat);
    brow.position.set(ex, 0.088, -0.116);
    brow.rotation.z = -side * 0.11;
    brow.rotation.y = -side * 0.08;

    headGroup.add(sclera, iris, catchlight, upperLash, brow);
  }

  // Stylized Matte-Charcoal FAST Tactical Helmet Shell + Beveled Forehead Shroud + Ear Guards (matching wackysteps.webp)
  const helmetDome = new THREE.Mesh(
    getCachedGeo('cryzenFastHelmetBand', () => {
      const g = new THREE.CylinderGeometry(0.112, 0.114, 0.062, 24);
      g.scale(1.0, 1.0, 1.04);
      return g;
    }),
    armorMat
  );
  helmetDome.position.set(0, 0.116, -0.004);
  helmetDome.castShadow = true;
  tagHeadHitbox(helmetDome);

  const helmetTopPad = new THREE.Mesh(
    getCachedGeo('cryzenHelmetCrownDome', () => {
      const g = new THREE.SphereGeometry(0.112, 24, 16);
      g.scale(1.0, 0.74, 1.04);
      return g;
    }),
    armorMat
  );
  helmetTopPad.position.set(0, 0.136, -0.004);

  // Iconic Cryzen Beveled Front Forehead Plate on the FAST Helmet
  const helmetForeheadPlate = new THREE.Mesh(
    getCachedGeo('cryzenHelmetForeheadPlate', () => roundedBox(0.116, 0.044, 0.022, 0.007, 2)),
    bootMat
  );
  helmetForeheadPlate.position.set(0, 0.132, -0.106);
  helmetForeheadPlate.rotation.x = -0.34;

  const helmetFrontBrow = new THREE.Mesh(
    getCachedGeo('cryzenHelmetBrowRim', () => roundedBox(0.214, 0.026, 0.048, 0.011, 3)),
    bootMat
  );
  helmetFrontBrow.position.set(0, 0.103, -0.098);
  helmetFrontBrow.rotation.x = 0.05;

  const helmetRearNape = new THREE.Mesh(
    getCachedGeo('cryzenHelmetRearNape', () => roundedBox(0.210, 0.084, 0.062, 0.022, 3)),
    armorMat
  );
  helmetRearNape.position.set(0, 0.074, 0.082);

  // Contoured Side Ear Protectors & Tactical Rails hugging the head cleanly
  const earCupGeo = getCachedGeo('cryzenHelmetEarGuard', () => roundedBox(0.032, 0.082, 0.090, 0.014, 3));
  const earCupL = new THREE.Mesh(earCupGeo, armorMat);
  earCupL.position.set(-0.104, 0.068, 0.004);
  earCupL.rotation.z = 0.10;
  const earCupR = new THREE.Mesh(earCupGeo, armorMat);
  earCupR.position.set(0.104, 0.068, 0.004);
  earCupR.rotation.z = -0.10;

  const arcRailGeo = getCachedGeo('cryzenHelmetSideRail', () => roundedBox(0.016, 0.020, 0.108, 0.005, 2));
  const arcRailL = new THREE.Mesh(arcRailGeo, bootMat);
  arcRailL.position.set(-0.110, 0.110, -0.012);
  const arcRailR = new THREE.Mesh(arcRailGeo, bootMat);
  arcRailR.position.set(0.110, 0.110, -0.012);

  const velcroPatchGeo = getCachedGeo('cryzenHelmetSidePatch', () => roundedBox(0.010, 0.020, 0.044, 0.003, 1));
  const velcroPatchL = new THREE.Mesh(velcroPatchGeo, mainMat);
  velcroPatchL.position.set(-0.112, 0.134, 0.008);
  const velcroPatchR = new THREE.Mesh(velcroPatchGeo, mainMat);
  velcroPatchR.position.set(0.112, 0.134, 0.008);

  // Sleek Visor Slot Trim (on Rear Helmet Band for Hero/Recon, or Tactical Goggles on Brow/Eyes for v2_goggles / v3_ghost)
  const goggleLens = new THREE.Mesh(
    getCachedGeo(
      demoVariant === 'v2_goggles'
        ? 'cryzenBrowGogglesLens'
        : demoVariant === 'v3_ghost'
          ? 'cryzenEyeVisorShield'
          : 'cryzenHelmetRearVisorBadge',
      () =>
        demoVariant === 'v2_goggles'
          ? roundedBox(0.176, 0.042, 0.026, 0.010, 2)
          : demoVariant === 'v3_ghost'
            ? roundedBox(0.172, 0.046, 0.024, 0.010, 2)
            : new THREE.BoxGeometry(0.085, 0.014, 0.012)
    ),
    visorMat
  );
  if (demoVariant === 'v2_goggles') {
    goggleLens.position.set(0, 0.132, -0.108);
    goggleLens.rotation.x = -0.22;
    const goggleFrame = new THREE.Mesh(
      getCachedGeo('cryzenBrowGogglesFrame', () => roundedBox(0.188, 0.052, 0.028, 0.012, 2)),
      bootMat
    );
    goggleFrame.position.set(0, 0.132, -0.104);
    goggleFrame.rotation.x = -0.22;
    headGroup.add(goggleFrame);
  } else if (demoVariant === 'v3_ghost') {
    goggleLens.position.set(0, 0.068, -0.112);
    // Dual-tube Night Vision Goggles (NVG) mounted on the helmet brow
    const nvgMount = new THREE.Mesh(
      getCachedGeo('cryzenNvgBridge', () => roundedBox(0.112, 0.028, 0.042, 0.006, 2)),
      bootMat
    );
    nvgMount.position.set(0, 0.118, -0.122);
    const nvgTubeGeo = getCachedGeo('cryzenNvgTube', () => new THREE.CylinderGeometry(0.018, 0.020, 0.068, 14));
    const nvgGlassGeo = getCachedGeo('cryzenNvgGlass', () => new THREE.CylinderGeometry(0.015, 0.015, 0.008, 14));
    for (const nx of [-0.034, 0.034]) {
      const tube = new THREE.Mesh(nvgTubeGeo, bootMat);
      tube.rotation.x = Math.PI / 2 + 0.12;
      tube.position.set(nx, 0.112, -0.148);
      const glass = new THREE.Mesh(nvgGlassGeo, nvgLensMat);
      glass.rotation.x = Math.PI / 2 + 0.12;
      glass.position.set(nx, 0.108, -0.180);
      headGroup.add(tube, glass);
    }
    headGroup.add(nvgMount);
  } else if (demoVariant === 'v4_recon') {
    goggleLens.position.set(0, 0.106, 0.114);
    // Tactical Camo Scrim Band around the Recon Helmet
    const camoBand = new THREE.Mesh(
      getCachedGeo('cryzenReconCamoBand', () => roundedBox(0.224, 0.032, 0.232, 0.016, 3)),
      pouchMat
    );
    camoBand.position.set(0, 0.116, -0.004);
    headGroup.add(camoBand);
  } else {
    goggleLens.position.set(0, 0.106, 0.114);
  }

  headGroup.add(
    faceSkinBand,
    templeWrapL,
    templeWrapR,
    balaclavaJaw,
    balaclavaChin,
    helmetDome,
    helmetTopPad,
    helmetForeheadPlate,
    helmetFrontBrow,
    helmetRearNape,
    earCupL,
    earCupR,
    arcRailL,
    arcRailR,
    velcroPatchL,
    velcroPatchR,
    goggleLens
  );

  // ==================== 4. CRYZEN.IO ARMS: SEAMLESS LOFTED CLOTH SLEEVES, MITERED ELBOWS, ROLLED CUFFS & GLOVES ====================
  const armPivot = new THREE.Group();
  armPivot.position.set(0, 0.456, 0); // World y = 1.356
  chestGroup.add(armPivot);

  const ARM_UPPER_LEN = 0.295;
  const ARM_LOWER_LEN = 0.295;

  const armPatchBaseGeo = getCachedGeo('cryzenSleevePatch', () => roundedBox(0.014, 0.088, 0.062, 0.004, 2));
  const armPatchCrossGeo = getCachedGeo('cryzenSleevePatchX', () => new THREE.BoxGeometry(0.017, 0.064, 0.006));
  const unitPatchGeo = getCachedGeo('cryzenUnitTab', () => new THREE.BoxGeometry(0.016, 0.011, 0.052));

  const buildTacticalShoulder = (sideSign) => {
    const sGroup = new THREE.Group();

    // Flush Rectangular Tan-Brown Shoulder Velcro Patch + Stitched [X] hugging the continuous lofted cloth sleeve
    const armPocket = new THREE.Mesh(armPatchBaseGeo, cuffMat);
    armPocket.position.set(sideSign * 0.060, -ARM_UPPER_LEN * 0.37, 0);
    armPocket.rotation.z = -sideSign * 0.03;

    const cross1 = new THREE.Mesh(armPatchCrossGeo, pouchStitchMat);
    cross1.position.set(sideSign * 0.063, -ARM_UPPER_LEN * 0.37, 0);
    cross1.rotation.x = 0.56;
    cross1.rotation.z = -sideSign * 0.03;

    const cross2 = new THREE.Mesh(armPatchCrossGeo, pouchStitchMat);
    cross2.position.set(sideSign * 0.063, -ARM_UPPER_LEN * 0.37, 0);
    cross2.rotation.x = -0.56;
    cross2.rotation.z = -sideSign * 0.03;

    const unitPatch = new THREE.Mesh(unitPatchGeo, mainMat);
    unitPatch.position.set(sideSign * 0.061, -ARM_UPPER_LEN * 0.19, 0);
    unitPatch.rotation.z = -sideSign * 0.03;

    sGroup.add(armPocket, cross1, cross2, unitPatch);
    return sGroup;
  };

  // Single-Piece Tailored Low-Poly Cloth Upper Sleeve (extends from y = +0.038 inside shoulder yoke to y = -0.312 at elbow — NO ball joint!)
  const buildUpperSleeveGeo = () => {
    const g = roundedBox(0.118, 0.350, 0.120, 0.022, 2);
    g.translate(0, -0.137, 0);
    return g;
  };

  const upperSleeveGeoR = getCachedGeo('cryzenSingleUpperSleeve_R', () => buildUpperSleeveGeo());
  const upperSleeveGeoL = getCachedGeo('cryzenSingleUpperSleeve_L', () => buildUpperSleeveGeo());

  // Single-Piece Tailored Low-Poly Cloth Forearm Sleeve (extends from y = +0.026 elbow heel to y = -0.184 rolled cuff — seamless elbow bend!)
  const forearmSleeveGeo = getCachedGeo('cryzenSingleForearmSleeve', () => {
    const g = roundedBox(0.110, 0.210, 0.112, 0.020, 2);
    g.translate(0, -0.079, 0);
    return g;
  });

  // Subtle Inner Elbow Cloth Crease Fold (same fabric material bduMat, tucked cleanly inside the front elbow bend)
  const clothFoldCreaseGeo = getCachedGeo('cryzenInnerElbowFold', () => roundedBox(0.082, 0.014, 0.024, 0.004, 1));

  // Tailored Rolled Sleeve Cuff + Continuous Anatomical Lower Forearm / Flat Oval Wrist
  const rolledCuffGeo = getCachedGeo('cryzenSingleRolledCuff', () => {
    const g = roundedBox(0.118, 0.052, 0.120, 0.018, 2);
    g.translate(0, -0.172, 0);
    return g;
  });

  const exposedWristGeo = getCachedGeo('cryzenSingleAnatomicalWrist', () => {
    const g = roundedBox(0.076, 0.118, 0.064, 0.016, 2);
    g.translate(0, -0.242, 0);
    return g;
  });

  const gloveWristCuffGeo = getCachedGeo('cryzenSingleGloveCuff', () => {
    const g = roundedBox(0.080, 0.036, 0.068, 0.012, 2);
    g.translate(0, -0.002, -0.004);
    return g;
  });
  const glovePalmGeo = getCachedGeo('cryzenGlovePalmBlock', () => roundedBox(0.078, 0.054, 0.070, 0.012, 2));
  const handKnuckleGeo = getCachedGeo('cryzenGloveKnucklePlate', () => roundedBox(0.074, 0.015, 0.024, 0.004, 2));
  const handThumbGeo = getCachedGeo('cryzenGloveThumbBox', () => roundedBox(0.020, 0.042, 0.020, 0.005, 2));
  const handFingerGeo = getCachedGeo('cryzenGloveFingerBox', () => roundedBox(0.017, 0.044, 0.019, 0.005, 2));

  // Hierarchical Right Arm: rightArm -> rightForearm (Lofted Sleeve + Rolled Cuff + Wrist) -> rightHand (Tactical Glove)
  const rightArm = new THREE.Group();
  rightArm.position.set(0.174, 0.0, -0.006);
  const rightShoulder = buildTacticalShoulder(1);

  const rightBicep = new THREE.Mesh(upperSleeveGeoR, bduMat);
  rightBicep.position.set(0, 0, 0);
  rightBicep.castShadow = true;
  tagBodyHitbox(rightBicep);

  const rightForearm = new THREE.Group();
  rightForearm.position.set(0, -ARM_UPPER_LEN, 0);

  const rightForearmElbowCap = new THREE.Mesh(clothFoldCreaseGeo, bduMat);
  rightForearmElbowCap.position.set(0, -0.014, -0.032);
  rightForearmElbowCap.rotation.x = 0.24;

  const rightForearmMesh = new THREE.Mesh(forearmSleeveGeo, bduMat);
  rightForearmMesh.position.set(0, 0, 0);
  rightForearmMesh.castShadow = true;
  tagBodyHitbox(rightForearmMesh);

  // Rolled Tan Sleeve Cuff + Anatomical Forearm/Wrist Skin (or Full Tactical Sleeve for v3_ghost)
  const wristSleeveMat = demoVariant === 'v3_ghost' ? bduMat : skinMat;
  const rightCuff = new THREE.Mesh(rolledCuffGeo, cuffMat);
  rightCuff.position.set(0, 0, 0);

  const rightExposedWrist = new THREE.Mesh(exposedWristGeo, wristSleeveMat);
  rightExposedWrist.position.set(0, 0, 0);

  const rightHand = new THREE.Group();
  rightHand.position.set(0, -ARM_LOWER_LEN, 0);

  const rightWristBall = new THREE.Mesh(gloveWristCuffGeo, bootMat);
  rightWristBall.position.set(0, 0, 0);
  const rPalm = new THREE.Mesh(glovePalmGeo, bootMat);
  rPalm.position.set(-0.004, -0.008, -0.022);
  rPalm.rotation.x = 0.22;
  const rKnuckle = new THREE.Mesh(handKnuckleGeo, armorMat);
  rKnuckle.position.set(0.0, 0.016, -0.024);
  const rThumb = new THREE.Mesh(handThumbGeo, bootMat);
  rThumb.position.set(-0.028, 0.012, -0.026);
  rThumb.rotation.set(0.42, 0.32, 0.52);
  rightHand.add(rightWristBall, rPalm, rKnuckle, rThumb);
  for (let f = 0; f < 4; f++) {
    const rFinger = new THREE.Mesh(handFingerGeo, bootMat);
    rFinger.position.set(-0.016, 0.008 - f * 0.013, -0.042 + (f === 0 ? -0.008 : 0));
    rFinger.rotation.z = Math.PI / 2;
    rFinger.rotation.y = f === 0 ? -0.24 : 0.06;
    rightHand.add(rFinger);
  }

  rightForearm.add(rightForearmElbowCap, rightForearmMesh, rightCuff, rightExposedWrist, rightHand);
  rightArm.add(rightShoulder, rightBicep, rightForearm);

  // Hierarchical Left Arm: leftArm -> leftForearm (Lofted Sleeve + Rolled Cuff + Wrist) -> leftHand (Tactical Glove)
  const leftArm = new THREE.Group();
  leftArm.position.set(-0.174, 0.0, -0.008);
  const leftShoulder = buildTacticalShoulder(-1);

  const leftBicep = new THREE.Mesh(upperSleeveGeoL, bduMat);
  leftBicep.position.set(0, 0, 0);
  leftBicep.castShadow = true;
  tagBodyHitbox(leftBicep);

  const leftForearm = new THREE.Group();
  leftForearm.position.set(0, -ARM_UPPER_LEN, 0);

  const leftForearmElbowCap = new THREE.Mesh(clothFoldCreaseGeo, bduMat);
  leftForearmElbowCap.position.set(0, -0.014, -0.032);
  leftForearmElbowCap.rotation.x = 0.24;

  const leftForearmMesh = new THREE.Mesh(forearmSleeveGeo, bduMat);
  leftForearmMesh.position.set(0, 0, 0);
  leftForearmMesh.castShadow = true;
  tagBodyHitbox(leftForearmMesh);

  const leftCuff = new THREE.Mesh(rolledCuffGeo, cuffMat);
  leftCuff.position.set(0, 0, 0);

  const leftExposedWrist = new THREE.Mesh(exposedWristGeo, wristSleeveMat);
  leftExposedWrist.position.set(0, 0, 0);

  const leftHand = new THREE.Group();
  leftHand.position.set(0, -ARM_LOWER_LEN, 0);

  const leftWristBall = new THREE.Mesh(gloveWristCuffGeo, bootMat);
  leftWristBall.position.set(0, 0, 0);
  const lPalm = new THREE.Mesh(glovePalmGeo, bootMat);
  lPalm.position.set(0.004, -0.008, -0.022);
  lPalm.rotation.x = 0.22;
  const lKnuckle = new THREE.Mesh(handKnuckleGeo, armorMat);
  lKnuckle.position.set(0.0, 0.016, -0.024);
  const lThumb = new THREE.Mesh(handThumbGeo, bootMat);
  lThumb.position.set(-0.018, 0.022, -0.024);
  lThumb.rotation.set(0.2, -0.38, -0.75);
  leftHand.add(leftWristBall, lPalm, lKnuckle, lThumb);
  for (let f = 0; f < 4; f++) {
    const lFinger = new THREE.Mesh(handFingerGeo, bootMat);
    lFinger.position.set(0.016, 0.002, -0.040 + f * 0.014);
    lFinger.rotation.z = Math.PI / 2.3;
    leftHand.add(lFinger);
  }

  leftForearm.add(leftForearmElbowCap, leftForearmMesh, leftCuff, leftExposedWrist, leftHand);
  leftArm.add(leftShoulder, leftBicep, leftForearm);

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

  // ==================== 5. SINGLE-PIECE TAILORED BDU CARGO TROUSERS, BEVELED KNEE PADS & TACTICAL COMBAT BOOTS ====================
  const thighGeo = getCachedGeo('cryzenSingleThigh', () => {
    const g = roundedBox(0.182, 0.42, 0.186, 0.032, 3);
    g.translate(0, -0.19, 0);
    return g;
  });

  const shinGeo = getCachedGeo('cryzenSingleShin', () => {
    const g = roundedBox(0.148, 0.36, 0.154, 0.028, 3);
    g.translate(0, -0.165, 0);
    return g;
  });

  const cargoPocketGeo = getCachedGeo('cryzenCargoPocketBox', () => roundedBox(0.036, 0.142, 0.116, 0.008, 2));
  const pocketFlapGeo = getCachedGeo('cryzenCargoPocketFlap', () => roundedBox(0.040, 0.038, 0.122, 0.006, 2));
  const holsterPlateGeo = getCachedGeo('cryzenHolsterMountPlate', () => roundedBox(0.024, 0.165, 0.105, 0.006, 2));
  const kydexShellGeo = getCachedGeo('cryzenKydexHolsterBox', () => roundedBox(0.048, 0.135, 0.078, 0.010, 2));
  const holsterGripGeo = getCachedGeo('cryzenHolsterPistolGrip', () => roundedBox(0.032, 0.068, 0.046, 0.006, 2));
  const thighStrapRGeo = getCachedGeo('cryzenThighStrapBandR', () => roundedBox(0.190, 0.024, 0.192, 0.036, 3));
  const thighStrapLGeo = getCachedGeo('cryzenThighStrapBandL', () => roundedBox(0.188, 0.024, 0.190, 0.036, 3));
  const tqPouchGeo = getCachedGeo('cryzenTqPouchBox', () => roundedBox(0.038, 0.092, 0.048, 0.006, 2));
  const kneePadBaseGeo = getCachedGeo('cryzenKneePadBasePlate', () => roundedBox(0.116, 0.100, 0.030, 0.010, 2));
  const kneeHardCapGeo = getCachedGeo('cryzenKneeHardShell', () => roundedBox(0.102, 0.082, 0.034, 0.010, 2));
  const kneeStrapGeo = getCachedGeo('cryzenKneeStrapBand', () => roundedBox(0.154, 0.022, 0.160, 0.030, 3));
  const bootCollarGeo = getCachedGeo('cryzenBootCollarCuff', () => roundedBox(0.134, 0.086, 0.142, 0.022, 3));
  const bootUpperGeo = getCachedGeo('cryzenBootUpperVamp', () => roundedBox(0.122, 0.082, 0.215, 0.024, 3));
  const bootHeelGeo = getCachedGeo('cryzenBootHeelCounter', () => roundedBox(0.120, 0.076, 0.088, 0.018, 2));
  const bootToeCapGeo = getCachedGeo('cryzenBootToeBox', () => roundedBox(0.118, 0.064, 0.092, 0.020, 3));
  const bootSoleGeo = getCachedGeo('cryzenBootLugSole', () => roundedBox(0.128, 0.032, 0.236, 0.010, 2));

  const buildArticulatedLeg = (sideSign) => {
    const hipLegMesh = new THREE.Mesh(thighGeo, bduMat);
    hipLegMesh.position.set(sideSign * 0.142, 0.80, 0);
    hipLegMesh.castShadow = true;
    tagBodyHitbox(hipLegMesh);

    // Tailored Rectangular BDU Thigh Cargo Pocket + Beveled Flap
    const cargoPocket = new THREE.Mesh(cargoPocketGeo, cuffMat);
    cargoPocket.position.set(sideSign * 0.086, -0.195, -0.005);
    const pocketFlap = new THREE.Mesh(pocketFlapGeo, vestMat);
    pocketFlap.position.set(sideSign * 0.088, -0.128, -0.005);
    hipLegMesh.add(cargoPocket, pocketFlap);

    // Right-Side Safariland Drop-Leg Tactical Kydex Pistol Holster + Holstered Sidearm + Thigh Straps
    if (sideSign > 0) {
      const holsterPlate = new THREE.Mesh(holsterPlateGeo, armorMat);
      holsterPlate.position.set(0.086, -0.18, -0.005);
      const kydexShell = new THREE.Mesh(kydexShellGeo, bootMat);
      kydexShell.position.set(0.110, -0.175, -0.015);
      kydexShell.rotation.x = -0.12;
      const holsterGrip = new THREE.Mesh(holsterGripGeo, chromeMat);
      holsterGrip.position.set(0.110, -0.102, 0.012);
      holsterGrip.rotation.x = -0.34;
      const thighStrap = new THREE.Mesh(thighStrapRGeo, webbingMat);
      thighStrap.position.set(0, -0.19, 0);
      hipLegMesh.add(holsterPlate, kydexShell, holsterGrip, thighStrap);
    } else {
      // Left Thigh Tourniquet / Utility Strap
      const thighStrapL = new THREE.Mesh(thighStrapLGeo, webbingMat);
      thighStrapL.position.set(0, -0.20, 0);
      const tqPouch = new THREE.Mesh(tqPouchGeo, mainMat);
      tqPouch.position.set(-0.092, -0.19, -0.035);
      hipLegMesh.add(thighStrapL, tqPouch);
    }

    // Articulated Knee Joint Pivot at bottom of thigh (y = -0.38)
    const kneePivot = new THREE.Group();
    kneePivot.position.set(0, -0.38, 0);
    hipLegMesh.add(kneePivot);

    const kneePadBase = new THREE.Mesh(kneePadBaseGeo, vestMat);
    kneePadBase.position.set(0, -0.018, -0.070);
    kneePadBase.rotation.x = -0.04;
    const kneeHardCap = new THREE.Mesh(kneeHardCapGeo, armorMat);
    kneeHardCap.position.set(0, -0.018, -0.078);
    kneeHardCap.rotation.x = -0.04;
    const kneeStrap = new THREE.Mesh(kneeStrapGeo, webbingMat);
    kneeStrap.position.set(0, -0.020, 0);

    // Lower Leg (Continuous Lofted BDU Trouser Shin + Sculpted Combat Boot)
    const shinMesh = new THREE.Mesh(shinGeo, bduMat);
    shinMesh.castShadow = true;
    tagBodyHitbox(shinMesh);

    // Sculpted Tactical Combat Boot (Ankle Collar, Beveled Upper Vamp, Heel Counter, Toe Box & Lugged Outsole)
    const bootCollar = new THREE.Mesh(bootCollarGeo, vestMat);
    bootCollar.position.set(0, -0.325, 0);
    const bootUpper = new THREE.Mesh(bootUpperGeo, bootMat);
    bootUpper.position.set(0, -0.368, -0.038);
    bootUpper.castShadow = true;
    const bootHeel = new THREE.Mesh(bootHeelGeo, armorMat);
    bootHeel.position.set(0, -0.368, 0.024);
    const bootToeCap = new THREE.Mesh(bootToeCapGeo, bootMat);
    bootToeCap.position.set(0, -0.374, -0.106);
    const bootSole = new THREE.Mesh(bootSoleGeo, armorMat);
    bootSole.position.set(0, -0.402, -0.038);
    bootSole.castShadow = true;

    shinMesh.add(
      bootCollar,
      bootUpper,
      bootHeel,
      bootToeCap,
      bootSole
    );

    kneePivot.add(
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
  const sKey = (name) => (isDefaultHero ? name : `${name}_${demoVariant}`);
  const outlineMeshes = [
    batchBoneScope(pelvisVisualGroup, sKey('pelvis'), new Set(), pelvisCore, useEnemyOutline, initialOutlineMat),
    batchBoneScope(torsoVisualGroup, sKey('chest'), new Set(), torsoMesh, useEnemyOutline, initialOutlineMat),
    batchBoneScope(headGroup, sKey('head'), new Set([headHitboxProxy]), headMesh, useEnemyOutline, initialOutlineMat),
    batchBoneScope(rightArm, sKey('arm_upper_r'), new Set([rightForearm]), rightBicep, useEnemyOutline, initialOutlineMat),
    batchBoneScope(rightForearm, sKey('arm_lower_r'), new Set([rightHand]), rightForearmMesh, useEnemyOutline, initialOutlineMat),
    batchBoneScope(rightHand, sKey('hand_r'), new Set(), null, useEnemyOutline, initialOutlineMat),
    batchBoneScope(leftArm, sKey('arm_upper_l'), new Set([leftForearm]), leftBicep, useEnemyOutline, initialOutlineMat),
    batchBoneScope(leftForearm, sKey('arm_lower_l'), new Set([leftHand]), leftForearmMesh, useEnemyOutline, initialOutlineMat),
    batchBoneScope(leftHand, sKey('hand_l'), new Set(), null, useEnemyOutline, initialOutlineMat),
    batchBoneScope(leftLeg, sKey('leg_l'), new Set([leftKneePivot, leftLegHitboxProxy]), leftLeg, useEnemyOutline, initialOutlineMat),
    batchBoneScope(rightLeg, sKey('leg_r'), new Set([rightKneePivot, rightLegHitboxProxy]), rightLeg, useEnemyOutline, initialOutlineMat),
    batchBoneScope(leftKneePivot, sKey('shin_l'), new Set([leftShinHitboxProxy]), leftLegData.shinMesh, useEnemyOutline, initialOutlineMat),
    batchBoneScope(rightKneePivot, sKey('shin_r'), new Set([rightShinHitboxProxy]), rightLegData.shinMesh, useEnemyOutline, initialOutlineMat)
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
    demoVariant,
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

const _posterPoleR = new THREE.Vector3(0.68, -0.76, 0.08);
const _posterPoleL = new THREE.Vector3(-0.88, -0.16, 0.16);
const _posterHandEulerR = new THREE.Euler(0.10, -0.18, 0.08);
const _posterHandQuatR = new THREE.Quaternion().setFromEuler(_posterHandEulerR);
const _posterHandEulerL = new THREE.Euler(0.28, -0.45, -0.52);
const _posterHandQuatL = new THREE.Quaternion().setFromEuler(_posterHandEulerL);

/**
 * Applies the iconic Cryzen.io Hero Poster stance (matching wackysteps.webp) using analytical 2-bone IK
 * so both elbows bend purely around their natural 1-DOF hinge axis with zero joint distortion.
 */
export function poseOperatorCryzenPoster(rig, weaponId = 'rifle', now = 0) {
  if (!rig || !rig.rightArm || !rig.leftArm || !rig.rightForearm || !rig.leftForearm) return;
  const breath = Math.sin(now * 0.0022) * 0.006;

  rig.pelvisGroup.position.y = 0.80;
  rig.pelvisGroup.rotation.set(0, -0.18, 0);
  rig.upperBodyGroup.rotation.set(0.02 + breath * 0.4, -0.04, 0.01);
  rig.headGroup.rotation.set(0.02, 0.16, -0.01);
  rig.armPivot.rotation.set(0, 0, 0);
  rig.armPivot.position.set(0, 0.456, 0);

  // Position weapon vertically next to the right shoulder (stock on inner side x = 0.245, pistol grip & curved mag pointing outward +X)
  rig.gunHolder.position.set(0.245, 0.055 + breath * 0.5, -0.155);
  rig.gunHolder.rotation.set(Math.PI / 2 - 0.05, -0.08, Math.PI / 2 - 0.04);
  const s = weaponId === 'sniper' ? 0.58 : 0.70;
  rig.gunHolder.scale.set(s, s, s * 0.92);

  // Solve Right Arm 2-Bone IK: elbow angled outward/down in a crisp V-shape, forearm rising vertically on the outer left of the stock
  _ikTargetR.set(0.325, -0.005 + breath * 0.5, -0.135);
  solveArmTwoBoneIK(rig.rightArm, rig.rightForearm, rig.rightHand, _ikTargetR, _posterPoleR, _posterHandQuatR);

  // Solve Left Arm 2-Bone IK: elbow pointing outward to the right of frame, gloved hand resting cleanly on the left belt/hip
  _ikTargetL.set(-0.185, -0.345, -0.070);
  solveArmTwoBoneIK(rig.leftArm, rig.leftForearm, rig.leftHand, _ikTargetL, _posterPoleL, _posterHandQuatL);

  rig.leftLeg.position.set(-0.142, 0.80, 0);
  rig.rightLeg.position.set(0.142, 0.80, 0);
  rig.leftLeg.rotation.set(0.04, 0, -0.04);
  rig.rightLeg.rotation.set(-0.04, 0, 0.04);
  rig.leftKneePivot.rotation.set(-0.05, 0, 0);
  rig.rightKneePivot.rotation.set(-0.05, 0, 0);
}

export const createHumanoidPlayerRig = createRemotePlayerMesh;
