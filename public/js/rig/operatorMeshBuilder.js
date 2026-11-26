import * as THREE from '../three.js';
import { createWeaponMesh } from '../weaponModels.js';
import { roundedBox } from '../weapons/roundedBox.js';
import {
  createChamferedBlockGeometry,
  createLoftedTubeGeometry
} from '../weapons/weaponMaterials.js';
import { HITBOX_PART_DEFS } from '../shared.js';
import {
  ENEMY_OUTLINE_MAT,
  HITBOX_PROXY_MAT,
  TEAMMATE_OUTLINE_MAT,
  batchBoneScope,
  createProceduralMaterial,
  disposeObject3D,
  getCachedGeo,
  getCachedMat
} from './rigMaterialsAndBatching.js';
import { applyMetalnessCap } from '../quality.js';
import {
  attachSoldierGlbToRig,
  calibrateSoldierWeaponMount,
  disposeSoldierGlb,
  syncSoldierGlbVariant,
  updateSoldierGlbAnimation
} from './soldierGlbRig.js';

let CONTACT_SHADOW_TEX = null;
function getOperatorContactShadowTexture() {
  if (!CONTACT_SHADOW_TEX && typeof document !== 'undefined') {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    const grad = ctx.createRadialGradient(64, 64, 8, 64, 64, 62);
    grad.addColorStop(0.0, 'rgba(5, 8, 14, 0.58)');
    grad.addColorStop(0.48, 'rgba(5, 8, 14, 0.34)');
    grad.addColorStop(0.80, 'rgba(5, 8, 14, 0.10)');
    grad.addColorStop(1.0, 'rgba(5, 8, 14, 0.0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 128, 128);
    CONTACT_SHADOW_TEX = new THREE.CanvasTexture(canvas);
    CONTACT_SHADOW_TEX.userData = { shared: true };
  }
  return CONTACT_SHADOW_TEX;
}

export function resolveCryzenVariantFromColor(colorHex) {
  const hex = Number(colorHex);
  if (hex === 0xef4444) return 'v2_goggles';
  if (hex === 0x94a3b8) return 'v3_ghost';
  if (hex === 0x4b5320) return 'v4_recon';
  return 'v1_hero';
}

function withRigBatchClass(mat, rigBatchClass) {
  mat.userData = { ...(mat.userData || {}), rigBatchClass };
  return mat;
}

export function createRemotePlayerMesh(playerData = {}, options = {}) {
  const isShowcase = Boolean(options.isShowcase);
  const allowShadow = !isShowcase;
  const group = new THREE.Group();
  const pColor = playerData.color || options.defaultColor || 0xe5a024;

  const demoVariant = options.demoVariant || options.variant || playerData.variant || resolveCryzenVariantFromColor(pColor);

  // Authentic Saltline Maritime Port-Security / Boarding Unit Palettes (Berth 4 — Saltline Terminal)
  const variantPalettes = {
    v1_hero: {
      bdu: 0x243447,       // Tactical navy maritime ripstop softshell (Berth Breacher)
      cuff: 0x17202b,      // Charcoal Cordura abrasion reinforcement panels
      vest: 0x2c2924,      // Coyote-charcoal 1000D laser-cut SAPI plate carrier
      pouch: 0x9c7b54,     // Weathered coyote-tan Kydex-Cordura shingles
      pouchFlap: 0xb59164, // High-contrast tan retaining webbing
      helmet: 0x2a333f,    // Matte ballistic aramid FAST Maritime shell
      pack: 0x232d3b       // Compact dorsal hydration/breacher pack
    },
    v2_goggles: {
      bdu: 0x252830,       // Charcoal gunmetal heavy breacher softshell (Harbor Heavy)
      cuff: 0x16181e,
      vest: 0x1b1d24,
      pouch: 0x8c3030,     // Weathered crimson-oxide heavy ordnance pouches
      pouchFlap: 0xa83e3e,
      helmet: 0x22252d,
      pack: 0x1e2128
    },
    v3_ghost: {
      bdu: 0x171b22,       // Obsidian night-watch drysuit softshell (Night Watch)
      cuff: 0x0f1218,
      vest: 0x13171e,
      pouch: 0x485668,     // Titanium-slate night-ops pouches
      pouchFlap: 0x64748b,
      helmet: 0x1a1f28,
      pack: 0x151a22
    },
    v4_recon: {
      bdu: 0x3b4d38,       // Ranger-green recon softshell (Ordnance Recon)
      cuff: 0x273325,
      vest: 0x6b5a42,      // Earth-tan reconnaissance SAPI rig
      pouch: 0x9c8259,
      pouchFlap: 0xb59868,
      helmet: 0x32402f,
      pack: 0x384635
    }
  };
  const pal = variantPalettes[demoVariant] || variantPalettes.v1_hero;
  const isDefaultHero = demoVariant === 'v1_hero';

  // 1. Compact Military IFF Callsign Tabs ONLY (`main` slot — zero garish neon chest/thigh paint slabs!)
  let mainMat = getCachedMat(isShowcase ? `main_showcase_${demoVariant}` : `main_${pColor}`, () => {
    const m = new THREE.MeshStandardMaterial({
      color: pColor,
      roughness: 0.48,
      metalness: 0.22
    });
    m.userData = { matSlotKey: 'main' };
    return m;
  });
  if (isShowcase) {
    mainMat.color.setHex(pColor);
  }

  // 2. Matte Technical Ripstop Softshell & Cordura Fabrics (`rigBatchClass: 'fabric'`, r >= 0.75, m <= 0.12)
  const bduMat = getCachedMat(`sl_bdu_${demoVariant}_${pal.bdu}`, () =>
    withRigBatchClass(
      createProceduralMaterial('bdu', pal.bdu, { roughness: 0.86, metalness: 0.04, bumpScale: 0.008 }),
      'fabric'
    )
  );
  const cuffMat = getCachedMat(`sl_cuff_${demoVariant}_${pal.cuff}`, () =>
    withRigBatchClass(
      createProceduralMaterial('cordura', pal.cuff, { roughness: 0.82, metalness: 0.06, bumpScale: 0.008 }),
      'fabric'
    )
  );
  const vestMat = getCachedMat(`sl_vest_${demoVariant}_${pal.vest}`, () =>
    withRigBatchClass(
      createProceduralMaterial('cordura', pal.vest, { roughness: 0.78, metalness: 0.08, bumpScale: 0.010 }),
      'fabric'
    )
  );
  const packMat = getCachedMat(`sl_pack_${demoVariant}_${pal.pack}`, () =>
    withRigBatchClass(
      createProceduralMaterial('cordura', pal.pack, { roughness: 0.80, metalness: 0.06 }),
      'fabric'
    )
  );
  const pouchMat = getCachedMat(`sl_pouch_${demoVariant}_${pal.pouch}`, () =>
    withRigBatchClass(
      createProceduralMaterial('cordura', pal.pouch, { roughness: 0.76, metalness: 0.08 }),
      'fabric'
    )
  );
  const pouchFlapMat = getCachedMat(`sl_pouchFlap_${demoVariant}_${pal.pouchFlap}`, () =>
    withRigBatchClass(
      createProceduralMaterial('cordura', pal.pouchFlap, { roughness: 0.75, metalness: 0.08 }),
      'fabric'
    )
  );
  const webbingMat = getCachedMat('sl_webbing_0x13171e', () =>
    withRigBatchClass(
      createProceduralMaterial('bdu', 0x13171e, { roughness: 0.84, metalness: 0.05 }),
      'fabric'
    )
  );

  // 3. Ballistic Aramid Helmet, SAPI Trauma Plates, Hardshell Pads & Full-Grain Leather (`rigBatchClass: 'armor'`, r 0.34..0.56, m 0.15..0.40)
  const armorMat = getCachedMat(`sl_helmet_${demoVariant}_${pal.helmet}`, () =>
    withRigBatchClass(
      createProceduralMaterial('kevlar', pal.helmet, { roughness: 0.44, metalness: 0.24 }),
      'armor'
    )
  );
  const sapiPlateMat = getCachedMat('sl_sapi_0x252d38', () =>
    withRigBatchClass(
      new THREE.MeshStandardMaterial({ color: 0x252d38, roughness: 0.40, metalness: 0.28 }),
      'armor'
    )
  );
  const bootMat = getCachedMat('sl_leather_0x161a21', () =>
    withRigBatchClass(
      createProceduralMaterial('leather', 0x161a21, { roughness: 0.46, metalness: 0.20 }),
      'armor'
    )
  );

  // 4. Anodized Gunmetal Buckles, CNC NVG Shroud, ARC Rails & Coated Lenses (`rigBatchClass: 'metal'`, r <= 0.30, m >= 0.70)
  const chromeMat = getCachedMat('sl_chrome_0x647282', () =>
    withRigBatchClass(
      new THREE.MeshStandardMaterial({ color: 0x647282, roughness: 0.24, metalness: 0.86 }),
      'metal'
    )
  );
  const darkTitaniumMat = getCachedMat('sl_titanium_0x262f3b', () =>
    withRigBatchClass(
      new THREE.MeshStandardMaterial({ color: 0x262f3b, roughness: 0.25, metalness: 0.84 }),
      'metal'
    )
  );
  const brassTipMat = getCachedMat('sl_brass_0xb88c36', () =>
    withRigBatchClass(
      new THREE.MeshStandardMaterial({ color: 0xb88c36, roughness: 0.24, metalness: 0.88 }),
      'metal'
    )
  );
  const nvgLensMat = getCachedMat('sl_nvgLens_0x134e4a', () =>
    withRigBatchClass(
      new THREE.MeshStandardMaterial({
        color: 0x134e4a,
        roughness: 0.14,
        metalness: 0.90
      }),
      'metal'
    )
  );

  // 5. Reflective Iridium-Coated Ballistic Eye-Shield (`visor` dynamic slot — crisp amber-ruby / cobalt-cyan mirror sheen)
  const enemyVisorMat = getCachedMat('visor_enemy', () => {
    const m = new THREE.MeshStandardMaterial({
      color: 0x2a141c,
      emissive: 0x7f1d1d,
      emissiveIntensity: 0.24,
      roughness: 0.08,
      metalness: 0.94,
      envMapIntensity: 1.85
    });
    m.userData = { matSlotKey: 'visor' };
    return m;
  });
  const visorMat = isShowcase
    ? getCachedMat('visor_showcase', () => {
        const m = new THREE.MeshStandardMaterial({
          color: 0x162d47,
          emissive: 0x0e7490,
          emissiveIntensity: 0.22,
          roughness: 0.07,
          metalness: 0.95,
          envMapIntensity: 2.0
        });
        m.userData = { matSlotKey: 'visor' };
        return m;
      })
    : enemyVisorMat;

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

  // ==================== 1. ANATOMICAL PELVIS, MOLLE BATTLE BELT, COBRA BUCKLE & SUBDUED IFAK ====================
  const pelvisGroup = new THREE.Group();
  pelvisGroup.position.set(0, 0.80, 0);
  group.add(pelvisGroup);

  const pelvisVisualGroup = new THREE.Group();
  pelvisGroup.add(pelvisVisualGroup);

  // Multi-ring sculpted iliac/gluteal pelvic hull (replaces boxy roundedBox brick)
  const pelvisCore = new THREE.Mesh(
    getCachedGeo('slAnatPelvisHull', () =>
      createLoftedTubeGeometry(
        [
          { x: 0, y: -0.095, z: 0.004, rx: 0.136, ry: 0.088 },
          { x: 0, y: -0.045, z: 0.002, rx: 0.168, ry: 0.104 },
          { x: 0, y: 0.015, z: 0.000, rx: 0.174, ry: 0.108 },
          { x: 0, y: 0.068, z: 0.000, rx: 0.164, ry: 0.102 },
          { x: 0, y: 0.105, z: 0.000, rx: 0.154, ry: 0.096 }
        ],
        18,
        true
      )
    ),
    bduMat
  );
  pelvisCore.castShadow = allowShadow;
  tagBodyHitbox(pelvisCore);
  pelvisVisualGroup.add(pelvisCore);

  // Contoured sub-abdominal soft ballistic groin protector
  const groinProtector = new THREE.Mesh(
    getCachedGeo('slAnatGroinFlap', () =>
      createChamferedBlockGeometry(0.146, 0.094, 0.028, 0.028, 0.014, 0.038, 0.026)
    ),
    vestMat
  );
  groinProtector.position.set(0, 0.010, -0.102);

  // Contoured elliptical MOLLE Tactical War Belt + AustriAlpin Cobra Buckle
  const beltRing = new THREE.Mesh(
    getCachedGeo('slAnatWarBelt', () =>
      createLoftedTubeGeometry(
        [
          { x: 0, y: 0.034, z: 0, rx: 0.178, ry: 0.112 },
          { x: 0, y: 0.064, z: 0, rx: 0.181, ry: 0.114 },
          { x: 0, y: 0.092, z: 0, rx: 0.176, ry: 0.110 }
        ],
        18,
        true
      )
    ),
    vestMat
  );

  const cobraBuckleFrame = new THREE.Mesh(
    getCachedGeo('slAnatCobraBuckle', () =>
      createChamferedBlockGeometry(0.058, 0.058, 0.022, 0.008, 0.008, 0.008, 0.008)
    ),
    darkTitaniumMat
  );
  cobraBuckleFrame.position.set(0, 0.064, -0.114);

  const cobraBuckleTabs = new THREE.Mesh(
    getCachedGeo('slAnatCobraTabs', () => roundedBox(0.020, 0.064, 0.026, 0.003, 1)),
    brassTipMat
  );
  cobraBuckleTabs.position.set(0, 0.064, -0.116);

  // Left-hip Kydex pistol mag shingle + rolled Cordura dump pouch + subdued rear trauma IFAK (zero neon cross!)
  const hipMagPouch = new THREE.Mesh(
    getCachedGeo('slAnatHipMag', () =>
      createChamferedBlockGeometry(0.034, 0.086, 0.056, 0.006, 0.008, 0.006, 0.008)
    ),
    pouchMat
  );
  hipMagPouch.position.set(-0.180, 0.060, -0.026);

  const rolledDumpPouch = new THREE.Mesh(
    getCachedGeo('slAnatDumpPouch', () => {
      const g = new THREE.CylinderGeometry(0.026, 0.026, 0.104, 12);
      g.rotateZ(Math.PI * 0.5);
      return g;
    }),
    cuffMat
  );
  rolledDumpPouch.position.set(-0.115, 0.042, 0.106);
  rolledDumpPouch.rotation.y = 0.42;

  const rearIfakPouch = new THREE.Mesh(
    getCachedGeo('slAnatRearIfak', () =>
      createChamferedBlockGeometry(0.114, 0.078, 0.046, 0.014, 0.012, 0.014, 0.012)
    ),
    pouchMat
  );
  rearIfakPouch.position.set(0, 0.062, 0.122);

  const rearIfakStrap = new THREE.Mesh(
    getCachedGeo('slAnatRearIfakStrap', () => roundedBox(0.028, 0.084, 0.050, 0.004, 1)),
    webbingMat
  );
  rearIfakStrap.position.set(0, 0.062, 0.123);

  pelvisVisualGroup.add(
    groinProtector,
    beltRing,
    cobraBuckleFrame,
    cobraBuckleTabs,
    hipMagPouch,
    rolledDumpPouch,
    rearIfakPouch,
    rearIfakStrap
  );

  // ==================== 2. ANATOMICAL MARITIME STORM-SHELL TORSO, SLOPED SHOULDERS & SAPI PLATE CARRIER ====================
  const upperBodyGroup = new THREE.Group();
  upperBodyGroup.position.set(0, 0.10, 0); // World y = 0.90
  pelvisGroup.add(upperBodyGroup);

  const torsoVisualGroup = new THREE.Group();
  upperBodyGroup.add(torsoVisualGroup);

  const chestGroup = new THREE.Group();
  chestGroup.position.set(0, 0, 0);
  upperBodyGroup.add(chestGroup);

  // Continuous 7-station anatomical storm-shell torso (waist -> obliques -> ribcage -> broad chest -> sloped trapezius -> neck base)
  const torsoMesh = new THREE.Mesh(
    getCachedGeo('slAnatTorsoShell', () =>
      createLoftedTubeGeometry(
        [
          { x: 0, y: -0.015, z: 0.000, rx: 0.154, ry: 0.096 },
          { x: 0, y: 0.110, z: -0.002, rx: 0.164, ry: 0.104 },
          { x: 0, y: 0.245, z: -0.004, rx: 0.184, ry: 0.112 },
          { x: 0, y: 0.375, z: -0.006, rx: 0.204, ry: 0.118 },
          { x: 0, y: 0.465, z: -0.005, rx: 0.198, ry: 0.112 },
          { x: 0, y: 0.530, z: -0.002, rx: 0.152, ry: 0.096 },
          { x: 0, y: 0.572, z: 0.002, rx: 0.098, ry: 0.086 }
        ],
        20,
        true
      )
    ),
    bduMat
  );
  torsoMesh.castShadow = allowShadow;
  tagBodyHitbox(torsoMesh);
  torsoVisualGroup.add(torsoMesh);

  // Sculpted Raglan Shoulder / Trapezius Caps seamlessly bridging torso into ±0.174 arm sockets
  for (const side of [-1, 1]) {
    const raglanCap = new THREE.Mesh(
      getCachedGeo(`slAnatRaglan_${side > 0 ? 'R' : 'L'}`, () =>
        createLoftedTubeGeometry(
          [
            { x: side * 0.085, y: 0.535, z: -0.002, rx: 0.068, ry: 0.082 },
            { x: side * 0.145, y: 0.502, z: -0.005, rx: 0.072, ry: 0.084 },
            { x: side * 0.184, y: 0.456, z: -0.006, rx: 0.064, ry: 0.072 }
          ],
          14,
          true
        )
      ),
      cuffMat
    );
    torsoVisualGroup.add(raglanCap);
  }

  // Tailored Maritime Standing Storm Collar + Fitted Neoprene Neck Gaiter (strictly <= y=0.615 to prevent head-pitch clip)
  const collarShell = new THREE.Mesh(
    getCachedGeo('slAnatStormCollar', () =>
      createLoftedTubeGeometry(
        [
          { x: 0, y: 0.542, z: 0.004, rx: 0.112, ry: 0.098 },
          { x: 0, y: 0.578, z: 0.006, rx: 0.104, ry: 0.092 },
          { x: 0, y: 0.606, z: 0.010, rx: 0.098, ry: 0.088 }
        ],
        16,
        true
      )
    ),
    cuffMat
  );
  const neckGaiter = new THREE.Mesh(
    getCachedGeo('slAnatNeckGaiter', () => new THREE.CylinderGeometry(0.080, 0.090, 0.086, 18)),
    webbingMat
  );
  neckGaiter.position.set(0, 0.588, -0.004);

  // Swimmer-Cut Beveled SAPI Plate Carrier (Front & Rear Composite Ballistic Hulls)
  const frontSapiCarrier = new THREE.Mesh(
    getCachedGeo('slAnatFrontCarrier', () =>
      createChamferedBlockGeometry(0.286, 0.345, 0.048, 0.056, 0.115, 0.022, 0.026)
    ),
    vestMat
  );
  frontSapiCarrier.position.set(0, 0.305, -0.108);
  frontSapiCarrier.castShadow = allowShadow;

  const sapiStrikeBevel = new THREE.Mesh(
    getCachedGeo('slAnatSapiStrike', () =>
      createChamferedBlockGeometry(0.236, 0.285, 0.018, 0.048, 0.096, 0.018, 0.020)
    ),
    sapiPlateMat
  );
  sapiStrikeBevel.position.set(0, 0.312, -0.128);

  const rearSapiCarrier = new THREE.Mesh(
    getCachedGeo('slAnatRearCarrier', () =>
      createChamferedBlockGeometry(0.282, 0.355, 0.046, 0.048, 0.095, 0.022, 0.024)
    ),
    vestMat
  );
  rearSapiCarrier.position.set(0, 0.312, 0.104);
  rearSapiCarrier.castShadow = allowShadow;

  // Compact Dorsal Hydration / Breacher Pack + Routed Hydration Tube
  const packMain = new THREE.Mesh(
    getCachedGeo('slAnatDorsalPack', () =>
      createChamferedBlockGeometry(0.226, 0.288, 0.076, 0.032, 0.038, 0.024, 0.028)
    ),
    packMat
  );
  packMain.position.set(0, 0.315, 0.152);
  packMain.castShadow = allowShadow;

  const packLowerPocket = new THREE.Mesh(
    getCachedGeo('slAnatPackPocket', () =>
      createChamferedBlockGeometry(0.198, 0.112, 0.034, 0.018, 0.016, 0.016, 0.016)
    ),
    pouchMat
  );
  packLowerPocket.position.set(0, 0.232, 0.196);

  const packDragHandle = new THREE.Mesh(
    getCachedGeo('slAnatPackHandle', () => roundedBox(0.096, 0.014, 0.018, 0.004, 1)),
    webbingMat
  );
  packDragHandle.position.set(0, 0.456, 0.156);

  // Skeletal Cummerbunds + Quick-Release Tubes + Contoured Shoulder Harnesses
  const cummerbundGeo = getCachedGeo('slAnatCummerbund', () =>
    createChamferedBlockGeometry(0.036, 0.136, 0.220, 0.008, 0.012, 0.008, 0.012)
  );
  const qrTubeGeo = getCachedGeo('slAnatQrTube', () => new THREE.CylinderGeometry(0.0075, 0.0075, 0.122, 10));
  for (const side of [-1, 1]) {
    const cbund = new THREE.Mesh(cummerbundGeo, vestMat);
    cbund.position.set(side * 0.168, 0.215, 0);
    const qr = new THREE.Mesh(qrTubeGeo, darkTitaniumMat);
    qr.position.set(side * 0.152, 0.215, -0.106);

    const strap = new THREE.Mesh(
      getCachedGeo(`slAnatShoulderStrap_${side > 0 ? 'R' : 'L'}`, () =>
        createLoftedTubeGeometry(
          [
            { x: side * 0.082, y: 0.450, z: -0.112, rx: 0.032, ry: 0.014 },
            { x: side * 0.096, y: 0.542, z: -0.048, rx: 0.034, ry: 0.015 },
            { x: side * 0.098, y: 0.548, z: 0.038, rx: 0.034, ry: 0.015 },
            { x: side * 0.084, y: 0.462, z: 0.106, rx: 0.032, ry: 0.014 }
          ],
          10,
          true
        )
      ),
      vestMat
    );
    torsoVisualGroup.add(cbund, qr, strap);
  }

  // 3 Angled Kydex/Cordura Rifle Magazine Shingles + Exposed STANAG Magazines + CAT Tourniquet
  const shingleGeo = getCachedGeo('slAnatMagShingle', () =>
    createChamferedBlockGeometry(0.076, 0.114, 0.038, 0.008, 0.008, 0.008, 0.008)
  );
  const shingleBandGeo = getCachedGeo('slAnatShingleBand', () => roundedBox(0.080, 0.022, 0.042, 0.004, 1));
  const insertedMagGeo = getCachedGeo('slAnatInsertedMag', () =>
    createChamferedBlockGeometry(0.056, 0.054, 0.026, 0.005, 0.005, 0.005, 0.005)
  );
  for (let m = -1; m <= 1; m++) {
    const mx = m * 0.084;
    const shingle = new THREE.Mesh(shingleGeo, pouchMat);
    shingle.position.set(mx, 0.205, -0.142);
    shingle.castShadow = allowShadow;
    const band = new THREE.Mesh(shingleBandGeo, pouchFlapMat);
    band.position.set(mx, 0.216, -0.144);
    const magInsert = new THREE.Mesh(insertedMagGeo, darkTitaniumMat);
    magInsert.position.set(mx, 0.272, -0.140);
    magInsert.rotation.x = -0.06;
    magInsert.rotation.z = -0.04;
    torsoVisualGroup.add(shingle, band, magInsert);
  }

  // Subdued Admin Chest Pouch + Right-Side CAT Tourniquet + Left-Side Maritime VHF Radio (stubby antenna <= y=0.525)
  const adminPanel = new THREE.Mesh(
    getCachedGeo('slAnatAdminPouch', () =>
      createChamferedBlockGeometry(0.124, 0.068, 0.022, 0.010, 0.010, 0.010, 0.010)
    ),
    pouchMat
  );
  adminPanel.position.set(0, 0.392, -0.138);

  const catTourniquet = new THREE.Mesh(
    getCachedGeo('slAnatCatTq', () => roundedBox(0.028, 0.098, 0.028, 0.005, 1)),
    bootMat
  );
  catTourniquet.position.set(0.136, 0.232, -0.126);

  const radioBody = new THREE.Mesh(
    getCachedGeo('slAnatRadioBody', () =>
      createChamferedBlockGeometry(0.046, 0.084, 0.032, 0.006, 0.006, 0.006, 0.006)
    ),
    bootMat
  );
  radioBody.position.set(-0.096, 0.422, -0.132);
  radioBody.rotation.z = 0.12;

  const radioAntenna = new THREE.Mesh(
    getCachedGeo('slAnatRadioStubby', () => new THREE.CylinderGeometry(0.0030, 0.0048, 0.058, 8)),
    darkTitaniumMat
  );
  radioAntenna.position.set(-0.114, 0.488, -0.134);
  radioAntenna.rotation.z = 0.26;

  const pttPuck = new THREE.Mesh(
    getCachedGeo('slAnatPttPuck', () => new THREE.CylinderGeometry(0.015, 0.017, 0.012, 12)),
    chromeMat
  );
  pttPuck.rotation.x = Math.PI / 2;
  pttPuck.position.set(0.076, 0.436, -0.132);

  if (demoVariant === 'v2_goggles') {
    // Harbor Recon / Heavy Breacher twin 40mm / flashbang chest pouches
    const fbPouchGeo = getCachedGeo('slAnatFlashbangPouch', () =>
      createChamferedBlockGeometry(0.042, 0.082, 0.038, 0.008, 0.010, 0.008, 0.008)
    );
    for (const fx of [0.092, 0.136]) {
      const fb = new THREE.Mesh(fbPouchGeo, pouchFlapMat);
      fb.position.set(fx, 0.365, -0.132);
      torsoVisualGroup.add(fb);
    }
  } else if (demoVariant === 'v4_recon') {
    // Rear dorsal whip antenna (z = +0.15 > 0.05 so it never intersects front head rotation)
    const dorsalWhip = new THREE.Mesh(
      getCachedGeo('slAnatReconWhip', () => new THREE.CylinderGeometry(0.0022, 0.0044, 0.24, 8)),
      darkTitaniumMat
    );
    dorsalWhip.position.set(-0.114, 0.560, 0.150);
    dorsalWhip.rotation.z = 0.16;
    dorsalWhip.rotation.x = 0.14;
    torsoVisualGroup.add(dorsalWhip);
  }

  torsoVisualGroup.add(
    collarShell,
    neckGaiter,
    frontSapiCarrier,
    sapiStrikeBevel,
    rearSapiCarrier,
    packMain,
    packLowerPocket,
    packDragHandle,
    adminPanel,
    catTourniquet,
    radioBody,
    radioAntenna,
    pttPuck
  );

  // ==================== 3. SCULPTED CRANIUM, BALACLAVA, CONTOURED VISOR, COMTACS & FAST MARITIME HELMET ====================
  const headGroup = new THREE.Group();
  headGroup.position.set(0, 0.64, 0); // World y = 1.54
  chestGroup.add(headGroup);

  // Sculpted 6-station anatomical cranium & fitted balaclava hood (zero bare skin, zero blocky cube head!)
  const headMesh = new THREE.Mesh(
    getCachedGeo('slAnatCranium', () =>
      createLoftedTubeGeometry(
        [
          { x: 0, y: -0.058, z: -0.006, rx: 0.074, ry: 0.078 },
          { x: 0, y: -0.018, z: -0.014, rx: 0.082, ry: 0.094 },
          { x: 0, y: 0.026, z: -0.012, rx: 0.092, ry: 0.102 },
          { x: 0, y: 0.072, z: -0.008, rx: 0.096, ry: 0.105 },
          { x: 0, y: 0.116, z: -0.004, rx: 0.094, ry: 0.102 },
          { x: 0, y: 0.148, z: -0.002, rx: 0.072, ry: 0.078 }
        ],
        18,
        true
      )
    ),
    webbingMat
  );
  headMesh.castShadow = allowShadow;
  tagHeadHitbox(headMesh);
  headGroup.add(headMesh);

  // Contoured acoustic-mesh lower face respirator mask + nose bridge + titanium exhalation valve
  const maskGuard = new THREE.Mesh(
    getCachedGeo('slAnatRespiratorMask', () =>
      createLoftedTubeGeometry(
        [
          { x: 0, y: -0.022, z: -0.036, rx: 0.074, ry: 0.074 },
          { x: 0, y: 0.012, z: -0.044, rx: 0.084, ry: 0.078 },
          { x: 0, y: 0.042, z: -0.040, rx: 0.078, ry: 0.070 }
        ],
        14,
        true
      )
    ),
    cuffMat
  );
  const breatherValve = new THREE.Mesh(
    getCachedGeo('slAnatBreatherValve', () =>
      createChamferedBlockGeometry(0.048, 0.030, 0.018, 0.010, 0.008, 0.010, 0.008)
    ),
    darkTitaniumMat
  );
  breatherValve.position.set(0, 0.006, -0.116);

  // Contoured Wraparound Ballistic Goggles / Polarized Eye-Shield (curved multi-station frame & lens)
  const goggleGasket = new THREE.Mesh(
    getCachedGeo('slAnatGoggleFrame', () =>
      createLoftedTubeGeometry(
        [
          { x: -0.088, y: 0.066, z: -0.056, rx: 0.016, ry: 0.024 },
          { x: -0.048, y: 0.068, z: -0.096, rx: 0.018, ry: 0.026 },
          { x: 0.000, y: 0.068, z: -0.106, rx: 0.018, ry: 0.023 },
          { x: 0.048, y: 0.068, z: -0.096, rx: 0.018, ry: 0.026 },
          { x: 0.088, y: 0.066, z: -0.056, rx: 0.016, ry: 0.024 }
        ],
        12,
        true
      )
    ),
    bootMat
  );
  const goggleLens = new THREE.Mesh(
    getCachedGeo('slAnatGoggleLens', () =>
      createLoftedTubeGeometry(
        [
          { x: -0.078, y: 0.066, z: -0.068, rx: 0.012, ry: 0.019 },
          { x: -0.042, y: 0.068, z: -0.104, rx: 0.013, ry: 0.021 },
          { x: 0.000, y: 0.068, z: -0.113, rx: 0.013, ry: 0.018 },
          { x: 0.042, y: 0.068, z: -0.104, rx: 0.013, ry: 0.021 },
          { x: 0.078, y: 0.066, z: -0.068, rx: 0.012, ry: 0.019 }
        ],
        12,
        true
      )
    ),
    visorMat
  );

  // Ops-Core FAST Maritime High-Cut Ballistic Helmet Shell + Closed SphereGeometry Crown (outline-hull invariant!)
  const helmetSkirt = new THREE.Mesh(
    getCachedGeo('slAnatFastSkirt', () =>
      createLoftedTubeGeometry(
        [
          { x: 0, y: 0.096, z: -0.002, rx: 0.110, ry: 0.116 },
          { x: 0, y: 0.122, z: -0.004, rx: 0.113, ry: 0.118 },
          { x: 0, y: 0.144, z: -0.004, rx: 0.108, ry: 0.113 }
        ],
        24,
        true
      )
    ),
    armorMat
  );
  helmetSkirt.castShadow = allowShadow;
  tagHeadHitbox(helmetSkirt);

  const helmetCrown = new THREE.Mesh(
    getCachedGeo('slAnatFastCrownSphere', () => {
      const g = new THREE.SphereGeometry(0.112, 24, 16);
      g.scale(1.0, 0.74, 1.05);
      return g;
    }),
    armorMat
  );
  helmetCrown.position.set(0, 0.138, -0.004);
  helmetCrown.castShadow = allowShadow;

  const helmetRearNape = new THREE.Mesh(
    getCachedGeo('slAnatFastNape', () =>
      createChamferedBlockGeometry(0.184, 0.068, 0.048, 0.036, 0.018, 0.036, 0.022)
    ),
    armorMat
  );
  helmetRearNape.position.set(0, 0.076, 0.088);

  const nvgShroud = new THREE.Mesh(
    getCachedGeo('slAnatWilcoxShroud', () =>
      createChamferedBlockGeometry(0.050, 0.044, 0.016, 0.008, 0.008, 0.008, 0.008)
    ),
    chromeMat
  );
  nvgShroud.position.set(0, 0.128, -0.118);
  nvgShroud.rotation.x = -0.26;

  // Sculpted Oval Peltor Comtac V Earcups + ARC Rails + Wire Brackets + Compact Helmet IFF Callsign Tabs
  const comtacCupGeo = getCachedGeo('slAnatComtacCup', () =>
    createLoftedTubeGeometry(
      [
        { x: 0, y: -0.034, z: 0, rx: 0.016, ry: 0.026 },
        { x: 0, y: 0.000, z: 0, rx: 0.020, ry: 0.034 },
        { x: 0, y: 0.034, z: 0, rx: 0.016, ry: 0.026 }
      ],
      12,
      true
    )
  );
  const arcRailGeo = getCachedGeo('slAnatArcRail', () =>
    createChamferedBlockGeometry(0.014, 0.020, 0.108, 0.003, 0.004, 0.003, 0.004)
  );
  const wireArmGeo = getCachedGeo('slAnatComtacWire', () => new THREE.CylinderGeometry(0.0026, 0.0026, 0.046, 8));
  const helmetIffTabGeo = getCachedGeo('slAnatHelmetIffTab', () => roundedBox(0.008, 0.016, 0.042, 0.002, 1));

  for (const side of [-1, 1]) {
    const cup = new THREE.Mesh(comtacCupGeo, bootMat);
    cup.position.set(side * 0.102, 0.056, 0.004);
    cup.rotation.z = -side * 0.08;

    const rail = new THREE.Mesh(arcRailGeo, darkTitaniumMat);
    rail.position.set(side * 0.111, 0.112, -0.008);

    const wire = new THREE.Mesh(wireArmGeo, chromeMat);
    wire.position.set(side * 0.108, 0.086, 0.006);

    const iffTab = new THREE.Mesh(helmetIffTabGeo, mainMat);
    iffTab.position.set(side * 0.114, 0.132, 0.010);

    headGroup.add(cup, rail, wire, iffTab);
  }

  // Curved Flexible Boom Microphone from Left Comtac to Respirator
  const micBoom = new THREE.Mesh(
    getCachedGeo('slAnatBoomMic', () =>
      createLoftedTubeGeometry(
        [
          { x: -0.100, y: 0.042, z: -0.012, rx: 0.004, ry: 0.004 },
          { x: -0.086, y: 0.024, z: -0.068, rx: 0.0038, ry: 0.0038 },
          { x: -0.042, y: 0.012, z: -0.112, rx: 0.0055, ry: 0.0055 }
        ],
        8,
        true
      )
    ),
    darkTitaniumMat
  );

  // Variant-Specific Headgear Silhouette Details (kept strictly below helmetCrown max.y = 1.761m!)
  if (demoVariant === 'v2_goggles') {
    const stowedGoggles = new THREE.Mesh(
      getCachedGeo('slAnatStowedGoggles', () =>
        createChamferedBlockGeometry(0.184, 0.038, 0.030, 0.018, 0.008, 0.018, 0.008)
      ),
      sapiPlateMat
    );
    stowedGoggles.position.set(0, 0.134, -0.112);
    stowedGoggles.rotation.x = -0.22;

    const mandibleGeo = getCachedGeo('slAnatMandiblePlate', () =>
      createChamferedBlockGeometry(0.022, 0.052, 0.092, 0.005, 0.010, 0.005, 0.012)
    );
    for (const side of [-1, 1]) {
      const cheek = new THREE.Mesh(mandibleGeo, armorMat);
      cheek.position.set(side * 0.094, 0.020, -0.046);
      cheek.rotation.y = -side * 0.24;
      headGroup.add(cheek);
    }
    headGroup.add(stowedGoggles);
  } else if (demoVariant === 'v3_ghost') {
    const nvgBridge = new THREE.Mesh(
      getCachedGeo('slAnatPvs31Bridge', () =>
        createChamferedBlockGeometry(0.104, 0.022, 0.038, 0.006, 0.005, 0.006, 0.005)
      ),
      darkTitaniumMat
    );
    nvgBridge.position.set(0, 0.116, -0.128);
    const nvgTubeGeo = getCachedGeo('slAnatPvs31Tube', () => new THREE.CylinderGeometry(0.016, 0.018, 0.068, 14));
    const nvgGlassGeo = getCachedGeo('slAnatPvs31Lens', () => new THREE.CylinderGeometry(0.014, 0.014, 0.008, 14));
    for (const nx of [-0.032, 0.032]) {
      const tube = new THREE.Mesh(nvgTubeGeo, bootMat);
      tube.rotation.x = Math.PI / 2 + 0.08;
      tube.position.set(nx, 0.108, -0.154);
      const glass = new THREE.Mesh(nvgGlassGeo, nvgLensMat);
      glass.rotation.x = Math.PI / 2 + 0.08;
      glass.position.set(nx, 0.105, -0.186);
      headGroup.add(tube, glass);
    }
    const counterweight = new THREE.Mesh(
      getCachedGeo('slAnatCounterweight', () =>
        createChamferedBlockGeometry(0.074, 0.046, 0.026, 0.008, 0.008, 0.008, 0.008)
      ),
      bootMat
    );
    counterweight.position.set(0, 0.108, 0.116);
    headGroup.add(nvgBridge, counterweight);
  } else if (demoVariant === 'v4_recon') {
    const scrimBand = new THREE.Mesh(
      getCachedGeo('slAnatReconScrim', () =>
        createLoftedTubeGeometry(
          [
            { x: 0, y: 0.104, z: -0.004, rx: 0.115, ry: 0.120 },
            { x: 0, y: 0.130, z: -0.004, rx: 0.116, ry: 0.121 }
          ],
          20,
          true
        )
      ),
      pouchMat
    );
    headGroup.add(scrimBand);
  } else {
    // Low-profile rear Hel-Star strobe tucked below top of helmetCrown (y = 0.172 < crown top 0.221)
    const strobePod = new THREE.Mesh(
      getCachedGeo('slAnatStrobePod', () =>
        createChamferedBlockGeometry(0.042, 0.018, 0.062, 0.006, 0.005, 0.006, 0.005)
      ),
      bootMat
    );
    strobePod.position.set(0, 0.176, 0.048);
    strobePod.rotation.x = -0.34;
    headGroup.add(strobePod);
  }

  headGroup.add(
    maskGuard,
    breatherValve,
    goggleGasket,
    goggleLens,
    helmetSkirt,
    helmetCrown,
    helmetRearNape,
    nvgShroud,
    micBoom
  );

  // ==================== 4. ANATOMICAL TAPERED ARMS, ELBOW PADS, FIELD WATCH & ARTICULATED GLOVES ====================
  const armPivot = new THREE.Group();
  armPivot.position.set(0, 0.456, 0); // World y = 1.356 (strict animation & hitbox invariant!)
  chestGroup.add(armPivot);

  const ARM_UPPER_LEN = 0.295;
  const ARM_LOWER_LEN = 0.295;

  // 6-station anatomical upper-arm softshell sleeve (rounded deltoid cap -> bicep/tricep swell -> deep elbow cup overlap)
  const upperSleeveGeo = getCachedGeo('slAnatUpperSleeve', () =>
    createLoftedTubeGeometry(
      [
        { x: 0, y: 0.048, z: 0.000, rx: 0.056, ry: 0.060 },
        { x: 0, y: -0.025, z: -0.002, rx: 0.063, ry: 0.066 },
        { x: 0, y: -0.125, z: -0.002, rx: 0.059, ry: 0.062 },
        { x: 0, y: -0.225, z: 0.000, rx: 0.052, ry: 0.055 },
        { x: 0, y: -0.295, z: 0.002, rx: 0.048, ry: 0.050 },
        { x: 0, y: -0.324, z: 0.002, rx: 0.044, ry: 0.046 }
      ],
      14,
      true
    )
  );

  // 6-station anatomical forearm softshell sleeve with deep elbow socket overlap & sculpted wrist crease (zero gaps!)
  const forearmSleeveGeo = getCachedGeo('slAnatForearmSleeve', () =>
    createLoftedTubeGeometry(
      [
        { x: 0, y: 0.044, z: 0.002, rx: 0.045, ry: 0.047 },
        { x: 0, y: 0.006, z: 0.002, rx: 0.050, ry: 0.052 },
        { x: 0, y: -0.068, z: 0.000, rx: 0.054, ry: 0.056 },
        { x: 0, y: -0.165, z: -0.002, rx: 0.047, ry: 0.048 },
        { x: 0, y: -0.238, z: -0.002, rx: 0.045, ry: 0.045 },
        { x: 0, y: -0.282, z: -0.002, rx: 0.039, ry: 0.038 }
      ],
      14,
      true
    )
  );

  const stormCuffGeo = getCachedGeo('slAnatStormCuff', () =>
    createLoftedTubeGeometry(
      [
        { x: 0, y: -0.226, z: -0.002, rx: 0.048, ry: 0.047 },
        { x: 0, y: -0.258, z: -0.002, rx: 0.045, ry: 0.043 },
        { x: 0, y: -0.286, z: -0.002, rx: 0.041, ry: 0.039 },
        { x: 0, y: -0.308, z: -0.002, rx: 0.036, ry: 0.034 }
      ],
      12,
      true
    )
  );

  const elbowArmorCapGeo = getCachedGeo('slAnatElbowCap', () =>
    createChamferedBlockGeometry(0.078, 0.088, 0.028, 0.018, 0.020, 0.018, 0.020)
  );
  const armPocketGeo = getCachedGeo('slAnatArmPocket', () =>
    createChamferedBlockGeometry(0.016, 0.094, 0.068, 0.004, 0.008, 0.004, 0.008)
  );
  const armZipGeo = getCachedGeo('slAnatArmZip', () => new THREE.BoxGeometry(0.018, 0.072, 0.005));
  const unitIffTabGeo = getCachedGeo('slAnatShoulderIffTab', () => roundedBox(0.018, 0.018, 0.048, 0.003, 1));
  const wristWatchGeo = getCachedGeo('slAnatWristWatch', () => new THREE.CylinderGeometry(0.020, 0.021, 0.012, 14));

  const glovePalmGeo = getCachedGeo('slAnatGlovePalm', () =>
    createLoftedTubeGeometry(
      [
        { x: 0, y: 0.026, z: 0.006, rx: 0.034, ry: 0.030 },
        { x: 0, y: 0.008, z: 0.002, rx: 0.036, ry: 0.028 },
        { x: 0, y: -0.006, z: -0.018, rx: 0.037, ry: 0.024 },
        { x: 0, y: -0.010, z: -0.038, rx: 0.032, ry: 0.018 }
      ],
      12,
      true
    )
  );
  const handKnuckleGeo = getCachedGeo('slAnatGloveKnuckle', () =>
    createChamferedBlockGeometry(0.068, 0.014, 0.024, 0.010, 0.004, 0.008, 0.004)
  );
  const handThumbGeo = getCachedGeo('slAnatGloveThumb', () =>
    createLoftedTubeGeometry(
      [
        { x: 0, y: 0, z: 0, rx: 0.011, ry: 0.010 },
        { x: 0, y: -0.020, z: -0.012, rx: 0.0095, ry: 0.009 },
        { x: 0, y: -0.038, z: -0.020, rx: 0.008, ry: 0.0075 }
      ],
      8,
      true
    )
  );
  const handFingerGeo = getCachedGeo('slAnatGloveFinger', () =>
    createLoftedTubeGeometry(
      [
        { x: 0, y: 0, z: 0, rx: 0.0085, ry: 0.0085 },
        { x: -0.018, y: -0.002, z: -0.010, rx: 0.0078, ry: 0.0078 },
        { x: -0.032, y: 0.000, z: -0.004, rx: 0.0068, ry: 0.0068 }
      ],
      8,
      true
    )
  );

  const buildTacticalShoulder = (sideSign) => {
    const sGroup = new THREE.Group();
    const armPocket = new THREE.Mesh(armPocketGeo, cuffMat);
    armPocket.position.set(sideSign * 0.056, -ARM_UPPER_LEN * 0.36, 0);
    armPocket.rotation.z = -sideSign * 0.04;

    const pocketZip = new THREE.Mesh(armZipGeo, darkTitaniumMat);
    pocketZip.position.set(sideSign * 0.062, -ARM_UPPER_LEN * 0.36, -0.016);

    // Compact military IFF callsign tab on shoulder pocket
    const unitPatch = new THREE.Mesh(unitIffTabGeo, mainMat);
    unitPatch.position.set(sideSign * 0.060, -ARM_UPPER_LEN * 0.24, 0);
    unitPatch.rotation.z = -sideSign * 0.04;

    sGroup.add(armPocket, pocketZip, unitPatch);
    return sGroup;
  };

  // Right Arm Hierarchy
  const rightArm = new THREE.Group();
  rightArm.position.set(0.174, 0.0, -0.006);
  const rightShoulder = buildTacticalShoulder(1);

  const rightBicep = new THREE.Mesh(upperSleeveGeo, bduMat);
  rightBicep.castShadow = allowShadow;
  tagBodyHitbox(rightBicep);

  const rightForearm = new THREE.Group();
  rightForearm.position.set(0, -ARM_UPPER_LEN, 0);

  const rightElbowPad = new THREE.Mesh(elbowArmorCapGeo, sapiPlateMat);
  rightElbowPad.position.set(0, -0.026, 0.046);
  rightElbowPad.rotation.x = -0.14;

  const rightForearmMesh = new THREE.Mesh(forearmSleeveGeo, bduMat);
  rightForearmMesh.castShadow = allowShadow;
  tagBodyHitbox(rightForearmMesh);

  const rightCuff = new THREE.Mesh(stormCuffGeo, cuffMat);

  const rightHand = new THREE.Group();
  rightHand.position.set(0, -ARM_LOWER_LEN, 0);

  const rPalm = new THREE.Mesh(glovePalmGeo, bootMat);
  const rKnuckle = new THREE.Mesh(handKnuckleGeo, armorMat);
  rKnuckle.position.set(0.0, 0.014, -0.022);
  const rThumb = new THREE.Mesh(handThumbGeo, bootMat);
  rThumb.position.set(-0.024, 0.008, -0.016);
  rThumb.rotation.z = -0.45;
  rightHand.add(rPalm, rKnuckle, rThumb);
  for (let f = 0; f < 4; f++) {
    const rFinger = new THREE.Mesh(handFingerGeo, bootMat);
    rFinger.position.set(0.008, 0.006 - f * 0.012, -0.036);
    rightHand.add(rFinger);
  }

  rightForearm.add(rightElbowPad, rightForearmMesh, rightCuff, rightHand);
  rightArm.add(rightShoulder, rightBicep, rightForearm);

  // Left Arm Hierarchy (with Saltline Titanium Field Watch)
  const leftArm = new THREE.Group();
  leftArm.position.set(-0.174, 0.0, -0.008);
  const leftShoulder = buildTacticalShoulder(-1);

  const leftBicep = new THREE.Mesh(upperSleeveGeo, bduMat);
  leftBicep.castShadow = allowShadow;
  tagBodyHitbox(leftBicep);

  const leftForearm = new THREE.Group();
  leftForearm.position.set(0, -ARM_UPPER_LEN, 0);

  const leftElbowPad = new THREE.Mesh(elbowArmorCapGeo, sapiPlateMat);
  leftElbowPad.position.set(0, -0.026, 0.046);
  leftElbowPad.rotation.x = -0.14;

  const leftForearmMesh = new THREE.Mesh(forearmSleeveGeo, bduMat);
  leftForearmMesh.castShadow = allowShadow;
  tagBodyHitbox(leftForearmMesh);

  const leftCuff = new THREE.Mesh(stormCuffGeo, cuffMat);

  const leftWatch = new THREE.Mesh(wristWatchGeo, chromeMat);
  leftWatch.rotation.z = Math.PI / 2;
  leftWatch.position.set(-0.040, -0.256, -0.006);

  const leftHand = new THREE.Group();
  leftHand.position.set(0, -ARM_LOWER_LEN, 0);

  const lPalm = new THREE.Mesh(glovePalmGeo, bootMat);
  const lKnuckle = new THREE.Mesh(handKnuckleGeo, armorMat);
  lKnuckle.position.set(0.0, 0.014, -0.022);
  const lThumb = new THREE.Mesh(handThumbGeo, bootMat);
  lThumb.position.set(-0.020, 0.014, -0.016);
  lThumb.rotation.z = -0.35;
  leftHand.add(lPalm, lKnuckle, lThumb);
  for (let f = 0; f < 4; f++) {
    const lFinger = new THREE.Mesh(handFingerGeo, bootMat);
    lFinger.position.set(-0.008, 0.006 - f * 0.012, -0.036);
    lFinger.rotation.y = Math.PI;
    leftHand.add(lFinger);
  }

  leftForearm.add(leftElbowPad, leftForearmMesh, leftCuff, leftWatch, leftHand);
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

  // ==================== 5. ANATOMICAL TAPERED THIGHS, CALVES, AIRFLEX KNEE PADS & SCULPTED LUG-SOLE BOOTS ====================
  // 7-station anatomical quadriceps/hamstring cargo trouser leg with hip-socket & knee-socket overlaps
  const thighGeo = getCachedGeo('slAnatThigh', () =>
    createLoftedTubeGeometry(
      [
        { x: 0, y: 0.048, z: 0.004, rx: 0.088, ry: 0.094 },
        { x: 0, y: 0.015, z: 0.004, rx: 0.095, ry: 0.101 },
        { x: 0, y: -0.060, z: 0.002, rx: 0.097, ry: 0.103 },
        { x: 0, y: -0.170, z: -0.002, rx: 0.090, ry: 0.096 },
        { x: 0, y: -0.280, z: -0.002, rx: 0.081, ry: 0.087 },
        { x: 0, y: -0.365, z: 0.000, rx: 0.074, ry: 0.078 },
        { x: 0, y: -0.418, z: 0.002, rx: 0.067, ry: 0.071 }
      ],
      16,
      true
    )
  );

  // 6-station anatomical gastrocnemius calf trouser leg overlapping deep into knee-fold cuff & bloused ankle gaiter
  const shinGeo = getCachedGeo('slAnatShin', () =>
    createLoftedTubeGeometry(
      [
        { x: 0, y: 0.046, z: 0.002, rx: 0.066, ry: 0.070 },
        { x: 0, y: 0.008, z: 0.004, rx: 0.073, ry: 0.077 },
        { x: 0, y: -0.085, z: 0.008, rx: 0.077, ry: 0.083 },
        { x: 0, y: -0.195, z: 0.004, rx: 0.067, ry: 0.071 },
        { x: 0, y: -0.285, z: 0.000, rx: 0.059, ry: 0.063 },
        { x: 0, y: -0.345, z: 0.000, rx: 0.056, ry: 0.060 }
      ],
      16,
      true
    )
  );

  const kneeFoldCollarGeo = getCachedGeo('slAnatKneeFoldCollar', () =>
    createLoftedTubeGeometry(
      [
        { x: 0, y: 0.032, z: 0.000, rx: 0.076, ry: 0.080 },
        { x: 0, y: 0.004, z: 0.002, rx: 0.079, ry: 0.084 },
        { x: 0, y: -0.032, z: 0.002, rx: 0.076, ry: 0.080 }
      ],
      14,
      true
    )
  );

  const cargoPocketGeo = getCachedGeo('slAnatCargoPocket', () =>
    createChamferedBlockGeometry(0.032, 0.142, 0.112, 0.006, 0.010, 0.006, 0.010)
  );
  const pocketFlapGeo = getCachedGeo('slAnatCargoFlap', () =>
    createChamferedBlockGeometry(0.036, 0.034, 0.118, 0.006, 0.006, 0.006, 0.006)
  );
  const holsterShroudGeo = getCachedGeo('slAnatHolsterShroud', () =>
    createChamferedBlockGeometry(0.020, 0.162, 0.098, 0.005, 0.012, 0.005, 0.012)
  );
  const kydexShellGeo = getCachedGeo('slAnatKydexHolster', () =>
    createChamferedBlockGeometry(0.044, 0.132, 0.072, 0.008, 0.010, 0.008, 0.012)
  );
  const holsterGripGeo = getCachedGeo('slAnatHolsterGrip', () =>
    createChamferedBlockGeometry(0.030, 0.064, 0.042, 0.005, 0.006, 0.005, 0.006)
  );
  const thighStrapGeo = getCachedGeo('slAnatThighStrap', () =>
    createLoftedTubeGeometry(
      [
        { x: 0, y: -0.178, z: 0, rx: 0.093, ry: 0.099 },
        { x: 0, y: -0.200, z: 0, rx: 0.091, ry: 0.097 }
      ],
      16,
      true
    )
  );
  const thighUtilityGeo = getCachedGeo('slAnatThighUtility', () =>
    createChamferedBlockGeometry(0.034, 0.092, 0.052, 0.006, 0.008, 0.006, 0.008)
  );
  const kneePadBaseGeo = getCachedGeo('slAnatKneeFoam', () =>
    createChamferedBlockGeometry(0.112, 0.098, 0.028, 0.022, 0.020, 0.022, 0.020)
  );
  const kneeHardCapGeo = getCachedGeo('slAnatKneeHardCap', () =>
    createChamferedBlockGeometry(0.096, 0.078, 0.032, 0.020, 0.018, 0.020, 0.018)
  );
  const kneeStrapGeo = getCachedGeo('slAnatKneeStrap', () =>
    createLoftedTubeGeometry(
      [
        { x: 0, y: -0.010, z: 0.002, rx: 0.072, ry: 0.076 },
        { x: 0, y: -0.030, z: 0.002, rx: 0.074, ry: 0.078 }
      ],
      14,
      true
    )
  );

  // Sculpted Salomon/Lowa High-Cut Combat Boot (anatomical ankle shaft -> sloped instep vamp -> rounded toe box + Vibram lugged sole)
  const bootUpperGeo = getCachedGeo('slAnatBootUpper', () =>
    createLoftedTubeGeometry(
      [
        { x: 0, y: -0.310, z: -0.002, rx: 0.060, ry: 0.064 },
        { x: 0, y: -0.352, z: -0.012, rx: 0.058, ry: 0.074 },
        { x: 0, y: -0.382, z: -0.046, rx: 0.058, ry: 0.098 },
        { x: 0, y: -0.394, z: -0.092, rx: 0.054, ry: 0.068 }
      ],
      14,
      true
    )
  );
  const bootToeCapGeo = getCachedGeo('slAnatBootToeCap', () =>
    createChamferedBlockGeometry(0.112, 0.048, 0.088, 0.028, 0.018, 0.012, 0.008)
  );
  const bootHeelCounterGeo = getCachedGeo('slAnatBootHeel', () =>
    createChamferedBlockGeometry(0.114, 0.066, 0.082, 0.024, 0.014, 0.016, 0.010)
  );
  const bootOutsoleGeo = getCachedGeo('slAnatBootOutsole', () =>
    createChamferedBlockGeometry(0.120, 0.028, 0.236, 0.016, 0.006, 0.012, 0.006)
  );

  const buildArticulatedLeg = (sideSign) => {
    const hipLegMesh = new THREE.Mesh(thighGeo, bduMat);
    // Exact parity with RIG.HIP_X = 0.145 in shared/hitboxes.js & rigAnimator.js
    hipLegMesh.position.set(sideSign * 0.145, 0.80, 0);
    hipLegMesh.castShadow = allowShadow;
    tagBodyHitbox(hipLegMesh);

    const cargoPocket = new THREE.Mesh(cargoPocketGeo, cuffMat);
    cargoPocket.position.set(sideSign * 0.086, -0.195, -0.004);
    const pocketFlap = new THREE.Mesh(pocketFlapGeo, vestMat);
    pocketFlap.position.set(sideSign * 0.088, -0.126, -0.004);
    hipLegMesh.add(cargoPocket, pocketFlap);

    if (sideSign > 0) {
      const holsterPlate = new THREE.Mesh(holsterShroudGeo, armorMat);
      holsterPlate.position.set(0.088, -0.180, -0.004);
      const kydexShell = new THREE.Mesh(kydexShellGeo, bootMat);
      kydexShell.position.set(0.108, -0.175, -0.014);
      kydexShell.rotation.x = -0.12;
      const holsterGrip = new THREE.Mesh(holsterGripGeo, darkTitaniumMat);
      holsterGrip.position.set(0.108, -0.104, 0.012);
      holsterGrip.rotation.x = -0.34;
      const thighStrap = new THREE.Mesh(thighStrapGeo, webbingMat);
      hipLegMesh.add(holsterPlate, kydexShell, holsterGrip, thighStrap);
    } else {
      const thighStrapL = new THREE.Mesh(thighStrapGeo, webbingMat);
      const utilPouch = new THREE.Mesh(thighUtilityGeo, pouchMat);
      utilPouch.position.set(-0.092, -0.190, -0.032);
      hipLegMesh.add(thighStrapL, utilPouch);
    }

    const kneePivot = new THREE.Group();
    kneePivot.position.set(0, -0.38, 0);
    hipLegMesh.add(kneePivot);

    const kneePadBase = new THREE.Mesh(kneePadBaseGeo, cuffMat);
    kneePadBase.position.set(0, -0.018, -0.068);
    kneePadBase.rotation.x = -0.04;
    const kneeHardCap = new THREE.Mesh(kneeHardCapGeo, sapiPlateMat);
    kneeHardCap.position.set(0, -0.018, -0.078);
    kneeHardCap.rotation.x = -0.04;
    const kneeStrap = new THREE.Mesh(kneeStrapGeo, webbingMat);
    const kneeFoldCollar = new THREE.Mesh(kneeFoldCollarGeo, cuffMat);

    const shinMesh = new THREE.Mesh(shinGeo, bduMat);
    shinMesh.castShadow = allowShadow;
    tagBodyHitbox(shinMesh);

    const bootUpper = new THREE.Mesh(bootUpperGeo, bootMat);
    bootUpper.castShadow = allowShadow;
    const bootHeel = new THREE.Mesh(bootHeelCounterGeo, armorMat);
    bootHeel.position.set(0, -0.376, 0.022);
    const bootToeCap = new THREE.Mesh(bootToeCapGeo, sapiPlateMat);
    bootToeCap.position.set(0, -0.386, -0.108);
    const bootSole = new THREE.Mesh(bootOutsoleGeo, armorMat);
    bootSole.position.set(0, -0.405, -0.040);
    bootSole.castShadow = allowShadow;

    shinMesh.add(bootUpper, bootHeel, bootToeCap, bootSole);
    kneePivot.add(kneeFoldCollar, kneePadBase, kneeHardCap, kneeStrap, shinMesh);

    return { hipLegMesh, kneePivot, shinMesh };
  };

  const leftLegData = buildArticulatedLeg(-1);
  const rightLegData = buildArticulatedLeg(1);
  const leftLeg = leftLegData.hipLegMesh;
  const rightLeg = rightLegData.hipLegMesh;
  const leftKneePivot = leftLegData.kneePivot;
  const rightKneePivot = rightLegData.kneePivot;

  group.add(leftLeg, rightLeg);

  // Soft grounded contact-shadow disc beneath the operator's boots (never enters outline hulls or shadow casters)
  const contactShadowGeo = getCachedGeo('sl_operator_contact_shadow_geo', () => new THREE.CircleGeometry(0.42, 20));
  const contactShadowMat = getCachedMat('sl_operator_contact_shadow_mat', () =>
    new THREE.MeshBasicMaterial({
      map: getOperatorContactShadowTexture(),
      transparent: true,
      opacity: 0.90,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1
    })
  );
  const contactShadow = new THREE.Mesh(contactShadowGeo, contactShadowMat);
  contactShadow.name = 'operator_contact_shadow';
  contactShadow.rotation.x = -Math.PI / 2;
  contactShadow.position.set(0, 0.008, 0);
  contactShadow.renderOrder = 1;
  contactShadow.castShadow = false;
  contactShadow.receiveShadow = false;
  contactShadow.userData = {
    shared: true,
    noOutline: true,
    noShadow: true,
    isContactShadow: true,
    isOutline: false,
    isHitbox: false
  };
  group.add(contactShadow);

  // ==================== 6. LOW-POLY BOX HITBOX PROXIES (12 TRIANGLES PER VOLUME) ====================
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
      isHitbox: true,
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

  // Multi-material PBR static batching per animated bone scope (fabric + armor + metal + dynamic main/visor)
  const useEnemyOutline = !isShowcase;
  const initialOutlineMat = options.isTeammate ? TEAMMATE_OUTLINE_MAT : ENEMY_OUTLINE_MAT;
  const sKey = (name) => (isDefaultHero ? name : `${name}_${demoVariant}`);
  const outlineMeshes = [
    batchBoneScope(pelvisVisualGroup, sKey('pelvis'), new Set(), pelvisCore, useEnemyOutline, initialOutlineMat),
    batchBoneScope(torsoVisualGroup, sKey('chest'), new Set(), torsoMesh, useEnemyOutline, initialOutlineMat),
    batchBoneScope(headGroup, sKey('head'), new Set([headHitboxProxy]), headMesh, useEnemyOutline, initialOutlineMat),
    batchBoneScope(rightArm, sKey('arm_upper_r'), new Set([rightForearm]), rightBicep, useEnemyOutline, initialOutlineMat),
    batchBoneScope(rightForearm, sKey('arm_lower_r'), new Set([rightHand]), rightForearmMesh, useEnemyOutline, initialOutlineMat),
    batchBoneScope(rightHand, sKey('hand_r'), new Set(), null, false, initialOutlineMat),
    batchBoneScope(leftArm, sKey('arm_upper_l'), new Set([leftForearm]), leftBicep, useEnemyOutline, initialOutlineMat),
    batchBoneScope(leftForearm, sKey('arm_lower_l'), new Set([leftHand]), leftForearmMesh, useEnemyOutline, initialOutlineMat),
    batchBoneScope(leftHand, sKey('hand_l'), new Set(), null, false, initialOutlineMat),
    batchBoneScope(leftLeg, sKey('leg_l'), new Set([leftKneePivot, leftLegHitboxProxy]), leftLeg, useEnemyOutline, initialOutlineMat),
    batchBoneScope(rightLeg, sKey('leg_r'), new Set([rightKneePivot, rightLegHitboxProxy]), rightLeg, useEnemyOutline, initialOutlineMat),
    batchBoneScope(leftKneePivot, sKey('shin_l'), new Set([leftShinHitboxProxy]), leftLegData.shinMesh, useEnemyOutline, initialOutlineMat),
    batchBoneScope(rightKneePivot, sKey('shin_r'), new Set([rightShinHitboxProxy]), rightLegData.shinMesh, useEnemyOutline, initialOutlineMat)
  ].filter(Boolean);

  const disableHandShadows = (handObj) => {
    handObj?.traverse?.((obj) => {
      if (obj.isMesh) {
        obj.castShadow = false;
        obj.userData = { ...(obj.userData || {}), noShadow: true };
      }
    });
  };
  disableHandShadows(rightHand);
  disableHandShadows(leftHand);

  if (!isShowcase && options.scene) {
    options.scene.add(group);
  }

  const setOperatorColor = (newHex) => {
    rig._soldierColorHex = newHex;
    if (isShowcase) {
      rig.demoVariant = resolveCryzenVariantFromColor(newHex);
      syncSoldierGlbVariant(rig, { colorHex: newHex, demoVariant: rig.demoVariant });
      rig._updateSoldierTint?.();
      mainMat.color.setHex(newHex);
      return;
    }
    rig._updateSoldierTint?.();
    const nextMainMat = getCachedMat(`main_${newHex}`, () => {
      const m = new THREE.MeshStandardMaterial({
        color: newHex,
        roughness: 0.48,
        metalness: 0.22
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
    rig.isTeammate = Boolean(isTeammate);
    const targetMat = isTeammate ? TEAMMATE_OUTLINE_MAT : ENEMY_OUTLINE_MAT;
    for (let i = 0; i < outlineMeshes.length; i++) {
      outlineMeshes[i].material = targetMat;
    }
    if (!isShowcase && rig._soldierAttached) {
      syncSoldierGlbVariant(rig);
    } else {
      rig._updateSoldierTint?.();
    }
  };

  const rig = {
    id: playerData.id,
    name: playerData.name,
    demoVariant,
    team: playerData.team || null,
    isTeammate: Boolean(options.isTeammate),
    _isShowcase: isShowcase,
    _soldierColorHex: pColor,
    _soldierAssets: options.assets || null,
    _soldierScene: options.scene || null,
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
    contactShadow,
    hitboxParts,
    outlineMeshes,
    setOperatorColor,
    setTeamOutline,
    poseForWeapon: (wId) => poseOperatorForWeapon(rig, wId),
    setWeapon: (wId, nextGunMesh = null) => {
      const targetId = wId || rig.currentWeapon || 'rifle';
      if (rig.gunHolder) {
        if (nextGunMesh) {
          if (rig.gunMesh && rig.gunMesh !== nextGunMesh) {
            if (rig.gunMesh.parent === rig.gunHolder) rig.gunHolder.remove(rig.gunMesh);
            disposeObject3D(rig.gunMesh);
          }
          rig.gunMesh = nextGunMesh;
          if (nextGunMesh.parent !== rig.gunHolder) rig.gunHolder.add(nextGunMesh);
        } else if (rig.gunMesh?.userData?.weaponId !== targetId) {
          if (rig.gunMesh) {
            if (rig.gunMesh.parent === rig.gunHolder) rig.gunHolder.remove(rig.gunMesh);
            disposeObject3D(rig.gunMesh);
          }
          const created = createWeaponMesh(targetId, false);
          if (rig._metalnessCap !== undefined) {
            applyMetalnessCap(created, rig._metalnessCap);
          }
          const cast = Boolean(!rig._isShowcase && rig._castShadowApplied);
          created.traverse((o) => {
            if (o.isMesh && !o.userData?.isOutline && !o.userData?.isHitbox && !o.userData?.noShadow && !o.userData?.isMuzzleFlash) {
              if (o.geometry && !o.geometry.boundingSphere) o.geometry.computeBoundingSphere();
              o.frustumCulled = true;
              o.castShadow = cast;
            }
          });
          rig.gunMesh = created;
          rig.gunHolder.add(created);
        }
      }
      rig.currentWeapon = targetId;
      poseOperatorForWeapon(rig, targetId);
    },
    updateSoldierGlbAnimation: (dt, moving, speedNorm, isCrouching, isDead) =>
      updateSoldierGlbAnimation(rig, dt, moving, speedNorm, isCrouching, isDead),
    dispose: () => disposeSoldierGlb(rig),
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

  if (options.enableSoldierGlb !== false && playerData.id !== 'warmup_rig') {
    attachSoldierGlbToRig(rig, {
      isShowcase,
      demoVariant,
      playerId: playerData.id,
      colorHex: pColor,
      isTeammate: Boolean(options.isTeammate),
      team: playerData.team || null,
      weaponId: rig.currentWeapon,
      castShadow: allowShadow,
      assets: options.assets || null,
      scene: options.scene || null,
      requireParent: true,
      fromBuilder: true
    });
  }

  return rig;
}

const TP_WEAPON_SCALE = 1.12;
const IK_ARM_UPPER_LEN = 0.295;
const IK_ARM_LOWER_LEN = 0.295;

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

  const dotPole = poleDir.dot(_ikUnit);
  _ikPole.copy(poleDir).addScaledVector(_ikUnit, -dotPole);
  if (_ikPole.lengthSq() < 1e-6) {
    _ikPole.set(0, -1, 0);
  } else {
    _ikPole.normalize();
  }

  const x = (L1 * L1 - L2 * L2 + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, L1 * L1 - x * x));

  _ikD1.copy(_ikUnit).multiplyScalar(x / L1).addScaledVector(_ikPole, h / L1).normalize();
  _ikY1.copy(_ikD1).negate();
  _ikX1.crossVectors(_ikPole, _ikUnit).normalize();
  _ikZ1.crossVectors(_ikX1, _ikY1).normalize();

  _ikMat4.makeBasis(_ikX1, _ikY1, _ikZ1);
  armGroup.quaternion.setFromRotationMatrix(_ikMat4);

  const cosElbow = Math.max(-1, Math.min(1, (d * d - L1 * L1 - L2 * L2) / (2 * L1 * L2)));
  const elbowAngle = Math.acos(cosElbow);
  forearmGroup.rotation.set(elbowAngle, 0, 0);

  if (handGroup && targetHandQuat) {
    _ikParentQuat.copy(armGroup.quaternion).multiply(forearmGroup.quaternion).invert();
    handGroup.quaternion.copy(_ikParentQuat).multiply(targetHandQuat);
  }
}

export function poseOperatorForWeapon(rp, weaponId = 'rifle') {
  if (!rp || !rp.gunHolder || !rp.rightArm || !rp.leftArm || !rp.rightForearm || !rp.leftForearm) return;
  const pose = WEAPON_THIRD_PERSON_POSES[weaponId] || WEAPON_THIRD_PERSON_POSES.rifle;

  if (rp._soldierAttached && rp._soldierWeaponMount) {
    calibrateSoldierWeaponMount(rp, weaponId, pose, TP_WEAPON_SCALE);
    rp._posedWeapon = weaponId;
    return;
  }

  rp.gunHolder.position.set(pose.pos[0], pose.pos[1], pose.pos[2]);
  rp.gunHolder.rotation.set(pose.rot[0], pose.rot[1], pose.rot[2]);
  rp.gunHolder.scale.set(
    pose.effScale[0] / TP_WEAPON_SCALE,
    pose.effScale[1] / TP_WEAPON_SCALE,
    pose.effScale[2] / TP_WEAPON_SCALE
  );

  const qGun = rp.gunHolder.quaternion;

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

const _posterPoleR = new THREE.Vector3(0.55, -0.78, 0.38);
const _posterPoleL = new THREE.Vector3(-0.56, -0.78, 0.32);

export function poseOperatorCryzenPoster(rig, weaponId = 'rifle', now = 0) {
  if (!rig || !rig.gunHolder || !rig.rightArm || !rig.leftArm || !rig.rightForearm || !rig.leftForearm) return;
  const pose = WEAPON_THIRD_PERSON_POSES[weaponId] || WEAPON_THIRD_PERSON_POSES.rifle;
  rig._wasPosterPosed = true;
  if (rig._soldierAttached) {
    if (rig.currentWeapon !== weaponId || rig._posedWeapon !== weaponId) {
      rig.currentWeapon = weaponId;
      poseOperatorForWeapon(rig, weaponId);
    }
    const prevNow = rig._soldierLastPosterNow || 0;
    const dt = now > 0 && prevNow > 0 && now >= prevNow ? Math.min(0.05, (now - prevNow) / 1000) : 0.016;
    if (now > 0) rig._soldierLastPosterNow = now;
    if (rig.gunMesh?.userData?.flashMesh && now > 0 && now - (rig.lastShotFlashAt || 0) > 55) {
      rig.gunMesh.userData.flashMesh.visible = false;
    }
    updateSoldierGlbAnimation(rig, dt, false, 0, Boolean(rig.crouching), false);
    if (rig.contactShadow) {
      rig.contactShadow.scale.set(1.04, 1.08, 1);
    }
    return;
  }
  const breath = now ? Math.sin(now * 0.0022) * 0.006 : 0;
  const isPistol = weaponId === 'pistol' || weaponId === 'deagle' || weaponId === 'glock';
  const isKnife = weaponId === 'knife';

  // Athletic bladed CoD / CS2 Low-Ready Hero Stance
  rig.pelvisGroup.position.y = 0.792;
  rig.pelvisGroup.rotation.set(0.03, -0.22, 0);
  if (rig.pelvisVisualGroup) {
    rig.pelvisVisualGroup.position.set(0, 0, 0);
    rig.pelvisVisualGroup.rotation.set(0, 0, 0);
  }
  rig.upperBodyGroup.rotation.set(0.05 + breath * 0.4, 0.06, 0.01);
  if (rig.torsoVisualGroup) {
    rig.torsoVisualGroup.position.set(0, 0, 0);
    rig.torsoVisualGroup.rotation.set(0, 0, 0);
  }
  rig.headGroup.rotation.set(0.01 - breath * 0.25, 0.20, 0.02);
  rig.armPivot.rotation.set(0, 0, 0);
  rig.armPivot.position.set(0, 0.456, 0);

  if (isPistol) {
    rig.gunHolder.position.set(0.055, -0.120 + breath * 0.45, -0.340);
    rig.gunHolder.rotation.set(-0.5242, 0.3961, 0.0995);
  } else if (isKnife) {
    rig.gunHolder.position.set(0.115, -0.155 + breath * 0.45, -0.275);
    rig.gunHolder.rotation.set(-0.52, 0.68, -0.18);
  } else if (weaponId === 'sniper' || weaponId === 'shotgun') {
    rig.gunHolder.position.set(0.035, -0.145 + breath * 0.45, -0.255);
    rig.gunHolder.rotation.set(-0.7038, 0.8708, 0.3558);
  } else {
    // Diagonal ~25 deg barrel-down-left tactical low-ready across upper chest
    rig.gunHolder.position.set(0.065, -0.145 + breath * 0.45, -0.250);
    rig.gunHolder.rotation.set(-0.7038, 0.8708, 0.3558);
  }

  rig.gunHolder.scale.set(
    pose.effScale[0] / TP_WEAPON_SCALE,
    pose.effScale[1] / TP_WEAPON_SCALE,
    pose.effScale[2] / TP_WEAPON_SCALE
  );

  const qGun = rig.gunHolder.quaternion;

  // Snap right glove cleanly onto pistol grip / knife handle
  _ikTargetR.set(
    pose.rGrip[0] * pose.effScale[0],
    pose.rGrip[1] * pose.effScale[1],
    pose.rGrip[2] * pose.effScale[2]
  ).applyQuaternion(qGun).add(rig.gunHolder.position);
  _ikWristOffsetR.set(0.006, -0.006, 0.022).applyQuaternion(qGun);
  _ikTargetR.add(_ikWristOffsetR);

  // Snap left glove cleanly onto weapon handguard / support grip (or guard stance for knife)
  if (isKnife) {
    _ikTargetL.set(-0.135, -0.155 + breath * 0.35, -0.245);
  } else {
    _ikTargetL.set(
      pose.lGrip[0] * pose.effScale[0],
      pose.lGrip[1] * pose.effScale[1],
      pose.lGrip[2] * pose.effScale[2]
    ).applyQuaternion(qGun).add(rig.gunHolder.position);
    _ikWristOffsetL.set(-0.006, -0.006, 0.022).applyQuaternion(qGun);
    _ikTargetL.add(_ikWristOffsetL);
  }

  solveArmTwoBoneIK(rig.rightArm, rig.rightForearm, rig.rightHand, _ikTargetR, _posterPoleR, qGun);
  solveArmTwoBoneIK(rig.leftArm, rig.leftForearm, rig.leftHand, _ikTargetL, _posterPoleL, qGun);

  rig.leftLeg.position.set(-0.145, 0.792, 0);
  rig.rightLeg.position.set(0.145, 0.792, 0);
  rig.leftLeg.rotation.set(0.16, 0.08, -0.05);
  rig.rightLeg.rotation.set(-0.12, -0.10, 0.06);
  rig.leftKneePivot.rotation.set(-0.26, 0, 0);
  rig.rightKneePivot.rotation.set(-0.18, 0, 0);
  if (rig.contactShadow) {
    rig.contactShadow.scale.set(1.04, 1.08, 1);
  }
}

export const createHumanoidPlayerRig = createRemotePlayerMesh;
