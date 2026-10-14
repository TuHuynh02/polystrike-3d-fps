// 3D Articulated Tactical Operator Rig Builder & Kinematic Gait Animator
// Styled after CS2 / Call of Duty Modern Warfare / WarDogs Special Forces Operators

import * as THREE from '../vendor/three/three.module.js';
import { createWeaponMesh } from './weaponModels.js';

const PROCEDURAL_TEX_CACHE = new Map();
export const RIG_GEO_CACHE = new Map();

export function getCachedGeo(key, factoryFn) {
  let geo = RIG_GEO_CACHE.get(key);
  if (!geo) {
    geo = factoryFn();
    geo.userData = geo.userData || {};
    geo.userData.shared = true;
    RIG_GEO_CACHE.set(key, geo);
  }
  return geo;
}

/**
 * Generates cached procedural bump/diffuse textures for tactical fabrics, Cordura MOLLE, and matte Kevlar.
 */
export function createProceduralMaterial(type = 'bdu', baseHex = 0x334155, extraParams = {}) {
  const cacheKey = `${type}_${baseHex}`;
  let texPair = PROCEDURAL_TEX_CACHE.get(cacheKey);

  if (!texPair && typeof document !== 'undefined') {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');

    const baseColor = new THREE.Color(baseHex);
    ctx.fillStyle = `#${baseColor.getHexString()}`;
    ctx.fillRect(0, 0, 128, 128);

    if (type === 'bdu' || type === 'camo') {
      // Ripstop BDU tactical combat uniform micro-grid & subtle camo mottling
      const darkTone = baseColor.clone().multiplyScalar(0.76);
      const lightTone = baseColor.clone().multiplyScalar(1.16);
      ctx.fillStyle = `#${darkTone.getHexString()}`;
      for (let i = 0; i < 18; i++) {
        const rx = ((i * 37) % 110);
        const ry = ((i * 53) % 110);
        ctx.fillRect(rx, ry, 22 + (i % 3) * 8, 14 + (i % 2) * 8);
      }
      ctx.fillStyle = `#${lightTone.getHexString()}`;
      for (let i = 0; i < 12; i++) {
        const rx = ((i * 61 + 19) % 114);
        const ry = ((i * 29 + 11) % 114);
        ctx.fillRect(rx, ry, 16, 10);
      }
      // Ripstop crosshatch weave lines
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.18)';
      ctx.lineWidth = 1;
      for (let p = 0; p < 128; p += 8) {
        ctx.beginPath();
        ctx.moveTo(p, 0);
        ctx.lineTo(p, 128);
        ctx.moveTo(0, p);
        ctx.lineTo(128, p);
        ctx.stroke();
      }
    } else if (type === 'cordura' || type === 'vest') {
      // 1000D Cordura ballistic nylon weave + horizontal MOLLE webbing shadow lines
      ctx.fillStyle = 'rgba(0, 0, 0, 0.22)';
      for (let y = 0; y < 128; y += 16) {
        ctx.fillRect(0, y, 128, 3);
      }
      ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
      for (let y = 4; y < 128; y += 4) {
        for (let x = (y % 8 === 0 ? 0 : 2); x < 128; x += 4) {
          ctx.fillRect(x, y, 2, 2);
        }
      }
    } else if (type === 'kevlar' || type === 'helmet') {
      // Matte pebbled ballistic aramid helmet shell finish
      for (let y = 0; y < 128; y += 4) {
        for (let x = 0; x < 128; x += 4) {
          const v = ((x * 17 + y * 31) % 24) - 12;
          ctx.fillStyle = v > 0 ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.06)';
          ctx.fillRect(x, y, 3, 3);
        }
      }
    }

    const map = new THREE.CanvasTexture(canvas);
    map.wrapS = THREE.RepeatWrapping;
    map.wrapT = THREE.RepeatWrapping;
    map.repeat.set(2, 2);
    texPair = { map };
    PROCEDURAL_TEX_CACHE.set(cacheKey, texPair);
  }

  const defaults = {
    bdu: { roughness: 0.78, metalness: 0.08 },
    camo: { roughness: 0.76, metalness: 0.08 },
    cordura: { roughness: 0.68, metalness: 0.14 },
    vest: { roughness: 0.66, metalness: 0.16 },
    kevlar: { roughness: 0.48, metalness: 0.24 },
    helmet: { roughness: 0.45, metalness: 0.26 },
    leather: { roughness: 0.52, metalness: 0.18 },
    metal: { roughness: 0.28, metalness: 0.82 }
  }[type] || { roughness: 0.55, metalness: 0.2 };

  return new THREE.MeshStandardMaterial({
    color: baseHex,
    map: texPair ? texPair.map : null,
    roughness: extraParams.roughness ?? defaults.roughness,
    metalness: extraParams.metalness ?? defaults.metalness,
    ...extraParams
  });
}

export function disposeObject3D(root) {
  if (!root) return;
  root.traverse((obj) => {
    if (obj.isMesh) {
      if (obj.geometry && !obj.geometry.userData?.shared) {
        obj.geometry.dispose();
      }
      if (Array.isArray(obj.material)) {
        obj.material.forEach((m) => {
          if (m && !m.userData?.shared) m.dispose();
        });
      } else if (obj.material && !obj.material.userData?.shared) {
        obj.material.dispose();
      }
    }
  });
}

export function createPlayerNameSprite(name) {
  const canvas = document.createElement('canvas');
  canvas.width = 280;
  canvas.height = 80;
  const ctx = canvas.getContext('2d');

  const texture = new THREE.CanvasTexture(canvas);
  const material = new THREE.SpriteMaterial({ map: texture, depthTest: false });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(2.3, 0.65, 1);
  sprite.position.set(0, 2.36, 0);
  sprite.renderOrder = 10;

  const updateLabel = (hp) => {
    ctx.clearRect(0, 0, 280, 80);

    // Chamfered military gunmetal HUD plate
    ctx.fillStyle = 'rgba(11, 14, 18, 0.92)';
    ctx.beginPath();
    ctx.moveTo(26, 8);
    ctx.lineTo(254, 8);
    ctx.lineTo(264, 18);
    ctx.lineTo(264, 64);
    ctx.lineTo(24, 64);
    ctx.lineTo(16, 56);
    ctx.lineTo(16, 18);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = 'rgba(229, 160, 36, 0.72)';
    ctx.lineWidth = 1.8;
    ctx.stroke();

    // Tactical amber corner ticks
    ctx.fillStyle = '#e5a024';
    ctx.fillRect(16, 16, 4, 16);
    ctx.fillRect(260, 46, 4, 16);

    // Operator callsign stencil
    ctx.font = '800 19px "Chakra Petch", "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#f1f5f9';
    ctx.fillText(String(name || 'OPERATOR').slice(0, 15).toUpperCase(), 140, 33);

    // HP Bar Track
    ctx.fillStyle = 'rgba(5, 7, 10, 0.96)';
    ctx.fillRect(34, 44, 212, 10);

    // HP Bar Fill
    const pct = Math.max(0, Math.min(1, hp / 100));
    ctx.fillStyle = pct > 0.55 ? '#22c55e' : pct > 0.25 ? '#e5a024' : '#ef4444';
    ctx.fillRect(34, 44, Math.round(212 * pct), 10);

    // 25% Military Trauma Plate Segment Dividers
    ctx.fillStyle = 'rgba(11, 14, 18, 0.85)';
    for (let t = 1; t < 4; t++) {
      ctx.fillRect(34 + t * 53, 44, 2, 10);
    }

    texture.needsUpdate = true;
  };

  updateLabel(100);
  return { sprite, canvas, texture, material, updateLabel };
}

export const HITBOX_PROXY_MAT = new THREE.MeshBasicMaterial({
  visible: true,
  transparent: true,
  opacity: 0,
  depthWrite: false,
  depthTest: false,
  colorWrite: false
});
HITBOX_PROXY_MAT.userData = { shared: true };

export function createRemotePlayerMesh(playerData = {}, options = {}) {
  const isShowcase = Boolean(options.isShowcase);
  const group = new THREE.Group();
  const pColor = playerData.color || options.defaultColor || 0xe5a024;

  // Authentic Special Forces PBR Material Palette (CS2 / MW / WarDogs)
  // 1. Tactical Patch / Team Identification Trim (responds to suit color swatch)
  const mainMat = new THREE.MeshStandardMaterial({
    color: pColor,
    roughness: 0.42,
    metalness: 0.25
  });

  // 2. Ripstop BDU Combat Shirt & Cargo Pants (Dark Charcoal / Olive-Slate)
  const bduMat = createProceduralMaterial('bdu', 0x262e36, {
    roughness: 0.78,
    metalness: 0.06
  });

  // 3. Crye JPC Plate Carrier, MOLLE Pouches & Battle Belt (Coyote / Ranger Earth)
  const vestMat = createProceduralMaterial('cordura', 0x5c5346, {
    roughness: 0.68,
    metalness: 0.12
  });

  // 4. Secondary Webbing, Straps, Pouches & Balaclava Fabric
  const webbingMat = new THREE.MeshStandardMaterial({
    color: 0x1c2127,
    roughness: 0.72,
    metalness: 0.12
  });

  // 5. Matte Ballistic Kevlar Helmet & Hard Polymer Knee/Holster Shells
  const armorMat = createProceduralMaterial('kevlar', 0x2d3532, {
    roughness: 0.44,
    metalness: 0.28
  });

  // 6. Sculpted Human Skin (Brow, Nose Bridge, Cheekbones)
  const skinMat = new THREE.MeshStandardMaterial({
    color: 0xd4a383,
    roughness: 0.62,
    metalness: 0.04
  });

  // 7. Gunmetal Hardware, NVG Mount, Radio Antenna & Boots Trim
  const chromeMat = new THREE.MeshStandardMaterial({
    color: 0x64748b,
    roughness: 0.28,
    metalness: 0.82
  });

  // 8. Dark Combat Leather Boots & Mechanix Gloves
  const bootMat = new THREE.MeshStandardMaterial({
    color: 0x17191c,
    roughness: 0.54,
    metalness: 0.18
  });

  // 9. Tinted Ballistic Combat Goggles Lens (subtle tactical sheen, not neon sci-fi)
  const visorMat = new THREE.MeshStandardMaterial({
    color: 0x1e293b,
    emissive: pColor,
    emissiveIntensity: 0.22,
    roughness: 0.14,
    metalness: 0.75
  });

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

  // ==================== 1. PELVIS, HIPS & MOLLE TACTICAL BATTLE BELT ====================
  const pelvisGroup = new THREE.Group();
  pelvisGroup.position.set(0, 0.80, 0);
  group.add(pelvisGroup);

  // Anatomical Pelvis & Hip Block
  const pelvisCore = new THREE.Mesh(
    getCachedGeo('pelvisCore', () => new THREE.CylinderGeometry(0.168, 0.152, 0.19, 16)),
    bduMat
  );
  pelvisCore.scale.set(1.20, 1, 0.84);
  pelvisCore.castShadow = true;
  tagBodyHitbox(pelvisCore);
  pelvisGroup.add(pelvisCore);

  // Contoured Groin / Lower Abdomen BDU Seam
  const groinGuard = new THREE.Mesh(
    getCachedGeo('groinGuard', () => new THREE.CapsuleGeometry(0.072, 0.075, 8, 12)),
    bduMat
  );
  groinGuard.position.set(0, -0.035, -0.065);
  groinGuard.castShadow = false;

  // Ronin MOLLE Battle Belt + Cobra Buckle
  const beltRing = new THREE.Mesh(
    getCachedGeo('beltRing', () => new THREE.CylinderGeometry(0.184, 0.184, 0.068, 18)),
    vestMat
  );
  beltRing.scale.set(1.22, 1, 0.86);
  beltRing.position.set(0, 0.065, 0);
  beltRing.castShadow = false;

  const beltInnerStrap = new THREE.Mesh(
    getCachedGeo('beltInnerStrap', () => new THREE.CylinderGeometry(0.187, 0.187, 0.032, 18)),
    webbingMat
  );
  beltInnerStrap.scale.set(1.22, 1, 0.86);
  beltInnerStrap.position.set(0, 0.065, 0);
  beltInnerStrap.castShadow = false;

  const cobraBuckle = new THREE.Mesh(
    getCachedGeo('cobraBuckle', () => new THREE.BoxGeometry(0.056, 0.048, 0.024)),
    chromeMat
  );
  cobraBuckle.position.set(0, 0.065, -0.162);
  cobraBuckle.castShadow = false;

  // Two M67 Fragmentation Grenades clipped on front-side belt
  const gBodyGeo = getCachedGeo('beltGrenadeBody', () => new THREE.SphereGeometry(0.034, 10, 10));
  const gFuzeGeo = getCachedGeo('beltGrenadeFuze', () => new THREE.CylinderGeometry(0.012, 0.016, 0.028, 8));
  const gSpoonGeo = getCachedGeo('beltGrenadeSpoon', () => new THREE.BoxGeometry(0.012, 0.052, 0.018));
  const buildBeltGrenade = (xPos) => {
    const gGroup = new THREE.Group();
    const gBody = new THREE.Mesh(gBodyGeo, armorMat);
    gBody.scale.set(1, 1.18, 1);
    gBody.castShadow = false;
    const gFuze = new THREE.Mesh(gFuzeGeo, chromeMat);
    gFuze.position.y = 0.038;
    gFuze.castShadow = false;
    const gSpoon = new THREE.Mesh(gSpoonGeo, chromeMat);
    gSpoon.position.set(0.014, 0.012, 0);
    gSpoon.castShadow = false;
    gGroup.add(gBody, gFuze, gSpoon);
    gGroup.position.set(xPos, 0.052, -0.135);
    return gGroup;
  };
  const fragL = buildBeltGrenade(-0.155);
  const fragR = buildBeltGrenade(0.155);

  // Left Hip Pistol Mag Pouches & Rear IFAK Medical + Dump Pouch
  const sidePouchL = new THREE.Mesh(
    getCachedGeo('sidePouchL', () => new THREE.BoxGeometry(0.052, 0.095, 0.085)),
    vestMat
  );
  sidePouchL.position.set(-0.228, 0.055, -0.01);
  sidePouchL.castShadow = false;
  const dumpPouchRear = new THREE.Mesh(
    getCachedGeo('dumpPouchRear', () => new THREE.CapsuleGeometry(0.048, 0.075, 8, 10)),
    webbingMat
  );
  dumpPouchRear.position.set(-0.12, 0.03, 0.16);
  dumpPouchRear.castShadow = false;
  const ifakPouchRear = new THREE.Mesh(
    getCachedGeo('ifakPouchRear', () => new THREE.BoxGeometry(0.11, 0.09, 0.068)),
    vestMat
  );
  ifakPouchRear.position.set(0.06, 0.06, 0.162);
  ifakPouchRear.castShadow = false;
  const ifakCross = new THREE.Mesh(
    getCachedGeo('ifakCross', () => new THREE.BoxGeometry(0.032, 0.032, 0.012)),
    mainMat
  );
  ifakCross.position.set(0.06, 0.06, 0.198);
  ifakCross.castShadow = false;

  pelvisGroup.add(
    groinGuard,
    beltRing,
    beltInnerStrap,
    cobraBuckle,
    fragL,
    fragR,
    sidePouchL,
    dumpPouchRear,
    ifakPouchRear,
    ifakCross
  );

  // ==================== 2. ANATOMICAL UPPER TORSO & CRYE JPC PLATE CARRIER ====================
  const upperBodyGroup = new THREE.Group();
  upperBodyGroup.position.set(0, 0.10, 0); // World y = 0.90
  pelvisGroup.add(upperBodyGroup);

  // Primary Anatomical Torso Hitbox & BDU Combat Shirt Core
  const torsoGeo = getCachedGeo('torsoGeo', () => new THREE.CylinderGeometry(0.238, 0.176, 0.58, 18));
  const torsoMesh = new THREE.Mesh(torsoGeo, bduMat);
  torsoMesh.scale.set(1.22, 1, 0.82);
  torsoMesh.position.set(0, 0.28, 0);
  torsoMesh.castShadow = true;
  tagBodyHitbox(torsoMesh);
  upperBodyGroup.add(torsoMesh);

  // Nested Chest Group inside Spine (upperBodyGroup) for hierarchical rig compatibility
  const chestGroup = new THREE.Group();
  chestGroup.position.set(0, 0, 0);
  upperBodyGroup.add(chestGroup);

  // Upper Chest / Latissimus Dorsi Muscular Contour
  const upperChestBroad = new THREE.Mesh(
    getCachedGeo('upperChestBroad', () => new THREE.CapsuleGeometry(0.155, 0.22, 10, 14)),
    bduMat
  );
  upperChestBroad.rotation.z = Math.PI / 2;
  upperChestBroad.scale.set(1, 1, 0.76);
  upperChestBroad.position.set(0, 0.40, 0);
  upperChestBroad.castShadow = true;
  tagBodyHitbox(upperChestBroad);
  chestGroup.add(upperChestBroad);

  // Front Ballistic SAPI Plate Bag (Crye JPC style)
  const frontPlateBag = new THREE.Mesh(
    getCachedGeo('frontPlateBag', () => new THREE.BoxGeometry(0.31, 0.34, 0.055)),
    vestMat
  );
  frontPlateBag.position.set(0, 0.31, -0.172);
  frontPlateBag.castShadow = true;
  const frontUpperBevel = new THREE.Mesh(
    getCachedGeo('frontUpperBevel', () => new THREE.CylinderGeometry(0.12, 0.155, 0.08, 4)),
    vestMat
  );
  frontUpperBevel.rotation.y = Math.PI / 4;
  frontUpperBevel.scale.set(1.35, 1, 0.32);
  frontUpperBevel.position.set(0, 0.49, -0.168);
  frontUpperBevel.castShadow = false;

  // Rear Ballistic SAPI Plate Bag + Hydration / Breacher Pack
  const rearPlateBag = new THREE.Mesh(
    getCachedGeo('rearPlateBag', () => new THREE.BoxGeometry(0.30, 0.35, 0.055)),
    vestMat
  );
  rearPlateBag.position.set(0, 0.32, 0.172);
  rearPlateBag.castShadow = true;
  const hydrationPack = new THREE.Mesh(
    getCachedGeo('hydrationPack', () => new THREE.BoxGeometry(0.23, 0.29, 0.085)),
    vestMat
  );
  hydrationPack.position.set(0, 0.33, 0.225);
  hydrationPack.castShadow = false;
  const packTopFlap = new THREE.Mesh(
    getCachedGeo('packTopFlap', () => new THREE.CylinderGeometry(0.042, 0.042, 0.22, 10)),
    webbingMat
  );
  packTopFlap.rotation.z = Math.PI / 2;
  packTopFlap.position.set(0, 0.47, 0.225);
  packTopFlap.castShadow = false;

  // Cummerbund Side Straps connecting Front & Rear Plate Bags
  const cummerbundGeo = getCachedGeo('cummerbund', () => new THREE.BoxGeometry(0.045, 0.15, 0.32));
  const cummerbundL = new THREE.Mesh(cummerbundGeo, vestMat);
  cummerbundL.position.set(-0.245, 0.23, 0);
  cummerbundL.castShadow = false;
  const cummerbundR = new THREE.Mesh(cummerbundGeo, vestMat);
  cummerbundR.position.set(0.245, 0.23, 0);
  cummerbundR.castShadow = false;

  // Plate Carrier Padded Shoulder Straps
  const pcStrapGeo = getCachedGeo('pcStrapGeo', () => new THREE.BoxGeometry(0.068, 0.042, 0.29));
  const pcStrapL = new THREE.Mesh(pcStrapGeo, vestMat);
  pcStrapL.position.set(-0.135, 0.545, 0);
  pcStrapL.castShadow = false;
  const pcStrapR = new THREE.Mesh(pcStrapGeo, vestMat);
  pcStrapR.position.set(0.135, 0.545, 0);
  pcStrapR.castShadow = false;

  // 3 Front STANAG / AK Rifle Magazine Pouches with Bungee Retention & Mag Tabs
  const magPouchGeo = getCachedGeo('magPouch', () => new THREE.BoxGeometry(0.078, 0.145, 0.052));
  const magTopGeo = getCachedGeo('magTop', () => new THREE.BoxGeometry(0.062, 0.048, 0.036));
  const bungeeTabGeo = getCachedGeo('bungeeTab', () => new THREE.BoxGeometry(0.022, 0.055, 0.058));
  for (let m = -1; m <= 1; m++) {
    const mx = m * 0.092;
    const pouch = new THREE.Mesh(magPouchGeo, vestMat);
    pouch.position.set(mx, 0.215, -0.215);
    pouch.castShadow = false;
    const magTop = new THREE.Mesh(magTopGeo, webbingMat);
    magTop.position.set(mx, 0.30, -0.215);
    magTop.rotation.z = -0.08;
    magTop.castShadow = false;
    const bungeeTab = new THREE.Mesh(bungeeTabGeo, mainMat);
    bungeeTab.position.set(mx, 0.255, -0.218);
    bungeeTab.castShadow = false;
    chestGroup.add(pouch, magTop, bungeeTab);
  }

  // Upper Chest Admin Pouch + Operator Callsign Patch + PTT Radio Switch
  const adminPouch = new THREE.Mesh(
    getCachedGeo('adminPouch', () => new THREE.BoxGeometry(0.19, 0.095, 0.032)),
    webbingMat
  );
  adminPouch.position.set(0, 0.395, -0.202);
  adminPouch.castShadow = false;
  const squadPatch = new THREE.Mesh(
    getCachedGeo('squadPatch', () => new THREE.BoxGeometry(0.13, 0.055, 0.012)),
    mainMat
  );
  squadPatch.position.set(0, 0.398, -0.218);
  squadPatch.castShadow = false;
  const pttBox = new THREE.Mesh(
    getCachedGeo('pttBox', () => new THREE.CylinderGeometry(0.022, 0.022, 0.024, 10)),
    chromeMat
  );
  pttBox.rotation.x = Math.PI / 2;
  pttBox.position.set(-0.115, 0.455, -0.195);
  pttBox.castShadow = false;

  // Tactical AN/PRC-152 Radio on Left Back + Flexible Whip Antenna
  const radioBody = new THREE.Mesh(
    getCachedGeo('radioBody', () => new THREE.BoxGeometry(0.072, 0.18, 0.048)),
    armorMat
  );
  radioBody.position.set(-0.155, 0.36, 0.21);
  radioBody.castShadow = false;
  const whipAntenna = new THREE.Mesh(
    getCachedGeo('whipAntenna', () => new THREE.CylinderGeometry(0.004, 0.007, 0.42, 6)),
    webbingMat
  );
  whipAntenna.position.set(-0.165, 0.64, 0.21);
  whipAntenna.rotation.z = 0.08;
  whipAntenna.castShadow = false;

  // BDU Zipped Collar & Sculpted Human Neck with Shemagh / Balaclava Neck Gaiter
  const bduCollar = new THREE.Mesh(
    getCachedGeo('bduCollar', () => new THREE.CylinderGeometry(0.118, 0.138, 0.085, 16)),
    bduMat
  );
  bduCollar.position.set(0, 0.555, -0.005);
  bduCollar.castShadow = false;
  const neckGaiter = new THREE.Mesh(
    getCachedGeo('neckGaiter', () => new THREE.CylinderGeometry(0.086, 0.102, 0.14, 16)),
    webbingMat
  );
  neckGaiter.position.set(0, 0.61, -0.008);
  neckGaiter.castShadow = false;

  chestGroup.add(
    frontPlateBag,
    frontUpperBevel,
    rearPlateBag,
    hydrationPack,
    packTopFlap,
    cummerbundL,
    cummerbundR,
    pcStrapL,
    pcStrapR,
    adminPouch,
    squadPatch,
    pttBox,
    radioBody,
    whipAntenna,
    bduCollar,
    neckGaiter
  );

  // ==================== 3. SCULPTED HUMAN HEAD, BALACLAVA, GOGGLES & OPS-CORE FAST HELMET ====================
  const headGroup = new THREE.Group();
  headGroup.position.set(0, 0.64, 0); // World y = 1.54
  chestGroup.add(headGroup);

  // Primary Headshot Collider & Cranium Base
  const headGeo = getCachedGeo('headGeo', () => new THREE.CapsuleGeometry(0.135, 0.11, 12, 16));
  const headMesh = new THREE.Mesh(headGeo, webbingMat);
  headMesh.position.set(0, 0.20, -0.01); // World y = 1.74
  headMesh.castShadow = true;
  tagHeadHitbox(headMesh);
  headGroup.add(headMesh);

  // Exposed Upper Face Skin Band (Forehead/Brow/Cheekbones around eyes)
  const faceSkinBand = new THREE.Mesh(
    getCachedGeo(
      'faceSkinBand',
      () => new THREE.CylinderGeometry(0.132, 0.128, 0.068, 16, 1, false, Math.PI * 0.62, Math.PI * 0.76)
    ),
    skinMat
  );
  faceSkinBand.position.set(0, 0.215, -0.012);
  faceSkinBand.castShadow = false;

  // Sculpted Nose Bridge & Eyebrows
  const noseBridge = new THREE.Mesh(
    getCachedGeo('noseBridge', () => new THREE.ConeGeometry(0.022, 0.052, 6)),
    skinMat
  );
  noseBridge.rotation.x = -Math.PI * 0.35;
  noseBridge.position.set(0, 0.20, -0.145);
  noseBridge.castShadow = false;

  // Contoured Lower-Face Ribbed Tactical Balaclava Mask (Covers nose tip, mouth, jaw, chin)
  const balaclavaJaw = new THREE.Mesh(
    getCachedGeo('balaclavaJaw', () => new THREE.CylinderGeometry(0.126, 0.098, 0.135, 16)),
    webbingMat
  );
  balaclavaJaw.scale.set(0.96, 1, 1.08);
  balaclavaJaw.position.set(0, 0.128, -0.022);
  balaclavaJaw.castShadow = false;

  // Ops-Core FAST High-Cut Ballistic Helmet Shell (also tagged as headshot collider)
  const helmetDome = new THREE.Mesh(
    getCachedGeo(
      'helmetDome',
      () => new THREE.SphereGeometry(0.162, 18, 14, 0, Math.PI * 2, 0, Math.PI * 0.58)
    ),
    armorMat
  );
  helmetDome.scale.set(0.96, 1.02, 1.08);
  helmetDome.position.set(0, 0.235, 0.005);
  helmetDome.castShadow = true;
  tagHeadHitbox(helmetDome);

  const helmetRearNape = new THREE.Mesh(
    getCachedGeo(
      'helmetRearNape',
      () => new THREE.CylinderGeometry(0.152, 0.138, 0.09, 14, 1, false, -Math.PI * 0.42, Math.PI * 0.84)
    ),
    armorMat
  );
  helmetRearNape.position.set(0, 0.20, 0.015);
  helmetRearNape.castShadow = false;

  // Wilcox Three-Hole NVG Shroud & Mount Plate on Helmet Forehead
  const nvgShroud = new THREE.Mesh(
    getCachedGeo('nvgShroud', () => new THREE.BoxGeometry(0.064, 0.058, 0.022)),
    chromeMat
  );
  nvgShroud.position.set(0, 0.305, -0.158);
  nvgShroud.rotation.x = -0.18;
  nvgShroud.castShadow = false;
  const nvgArm = new THREE.Mesh(
    getCachedGeo('nvgArm', () => new THREE.BoxGeometry(0.032, 0.045, 0.042)),
    armorMat
  );
  nvgArm.position.set(0, 0.312, -0.175);
  nvgArm.castShadow = false;

  // Helmet ARC Side Rails, Velcro Callsign Panels & Rear Battery Counterweight Pouch
  const arcRailGeo = getCachedGeo('arcRailGeo', () => new THREE.BoxGeometry(0.018, 0.024, 0.15));
  const arcRailL = new THREE.Mesh(arcRailGeo, vestMat);
  arcRailL.position.set(-0.154, 0.255, -0.01);
  arcRailL.castShadow = false;
  const arcRailR = new THREE.Mesh(arcRailGeo, vestMat);
  arcRailR.position.set(0.154, 0.255, -0.01);
  arcRailR.castShadow = false;

  const velcroPatchGeo = getCachedGeo('velcroPatch', () => new THREE.BoxGeometry(0.008, 0.036, 0.075));
  const velcroPatchL = new THREE.Mesh(velcroPatchGeo, mainMat);
  velcroPatchL.position.set(-0.156, 0.295, 0.01);
  velcroPatchL.castShadow = false;
  const velcroPatchR = new THREE.Mesh(velcroPatchGeo, mainMat);
  velcroPatchR.position.set(0.156, 0.295, 0.01);
  velcroPatchR.castShadow = false;

  const counterweightPouch = new THREE.Mesh(
    getCachedGeo('counterweightPouch', () => new THREE.BoxGeometry(0.088, 0.058, 0.038)),
    vestMat
  );
  counterweightPouch.position.set(0, 0.235, 0.168);
  counterweightPouch.castShadow = false;

  // Tactical Ballistic Goggles (ESS / Oakley Frame + Tinted Dual-Curve Lens + Elastic Strap)
  const goggleFrame = new THREE.Mesh(
    getCachedGeo(
      'goggleFrame',
      () => new THREE.CylinderGeometry(0.146, 0.144, 0.066, 16, 1, false, Math.PI * 0.62, Math.PI * 0.76)
    ),
    bootMat
  );
  goggleFrame.position.set(0, 0.218, -0.018);
  goggleFrame.castShadow = false;

  const goggleLens = new THREE.Mesh(
    getCachedGeo(
      'goggleLens',
      () => new THREE.CylinderGeometry(0.149, 0.147, 0.050, 16, 1, false, Math.PI * 0.64, Math.PI * 0.72)
    ),
    visorMat
  );
  goggleLens.position.set(0, 0.218, -0.018);
  goggleLens.castShadow = false;

  const goggleStrap = new THREE.Mesh(
    getCachedGeo('goggleStrap', () => new THREE.CylinderGeometry(0.154, 0.154, 0.028, 16)),
    webbingMat
  );
  goggleStrap.scale.set(0.97, 1, 1.07);
  goggleStrap.position.set(0, 0.218, 0.005);
  goggleStrap.castShadow = false;

  // Peltor ComTac Tactical Headset Ear Cups + Boom Mic
  const earCupGeo = getCachedGeo('earCupGeo', () => {
    const g = new THREE.CylinderGeometry(0.052, 0.046, 0.042, 12);
    g.rotateZ(Math.PI / 2);
    return g;
  });
  const earCupL = new THREE.Mesh(earCupGeo, armorMat);
  earCupL.position.set(-0.152, 0.195, 0.008);
  earCupL.castShadow = false;
  const earCupR = new THREE.Mesh(earCupGeo, armorMat);
  earCupR.position.set(0.152, 0.195, 0.008);
  earCupR.castShadow = false;

  const boomMic = new THREE.Mesh(
    getCachedGeo('boomMic', () => new THREE.CylinderGeometry(0.005, 0.005, 0.13, 6)),
    chromeMat
  );
  boomMic.rotation.x = Math.PI / 2.3;
  boomMic.rotation.z = -0.35;
  boomMic.position.set(-0.11, 0.145, -0.085);
  boomMic.castShadow = false;
  const micWindscreen = new THREE.Mesh(
    getCachedGeo('micWindscreen', () => new THREE.SphereGeometry(0.012, 8, 8)),
    bootMat
  );
  micWindscreen.position.set(-0.045, 0.125, -0.145);
  micWindscreen.castShadow = false;

  headGroup.add(
    faceSkinBand,
    noseBridge,
    balaclavaJaw,
    helmetDome,
    helmetRearNape,
    nvgShroud,
    nvgArm,
    arcRailL,
    arcRailR,
    velcroPatchL,
    velcroPatchR,
    counterweightPouch,
    goggleFrame,
    goggleLens,
    goggleStrap,
    earCupL,
    earCupR,
    boomMic,
    micWindscreen
  );

  // ==================== 4. ANATOMICAL ARMS, BDU SLEEVES, ELBOW PADS & MECHANIX GLOVES ====================
  const armPivot = new THREE.Group();
  armPivot.position.set(0, 0.46, 0); // World y = 1.36
  chestGroup.add(armPivot);

  const deltoidCapGeo = getCachedGeo('deltoidCap', () => new THREE.SphereGeometry(0.092, 14, 12));
  const armPocketGeo = getCachedGeo('armPocket', () => new THREE.BoxGeometry(0.036, 0.105, 0.088));
  const unitPatchGeo = getCachedGeo('unitPatch', () => new THREE.BoxGeometry(0.012, 0.068, 0.068));

  const buildTacticalShoulder = (sideSign) => {
    const sGroup = new THREE.Group();

    // Rounded Deltoid BDU Sleeve Cap
    const deltoidCap = new THREE.Mesh(deltoidCapGeo, bduMat);
    deltoidCap.scale.set(0.95, 1.12, 0.98);
    deltoidCap.castShadow = false;

    // Zippered BDU Upper-Arm Pocket + Unit Identification Velcro Patch
    const armPocket = new THREE.Mesh(armPocketGeo, bduMat);
    armPocket.position.set(sideSign * 0.072, -0.035, 0);
    armPocket.rotation.z = -sideSign * 0.12;
    armPocket.castShadow = false;

    const unitPatch = new THREE.Mesh(unitPatchGeo, mainMat);
    unitPatch.position.set(sideSign * 0.091, -0.032, 0);
    unitPatch.rotation.z = -sideSign * 0.12;
    unitPatch.castShadow = false;

    sGroup.add(deltoidCap, armPocket, unitPatch);
    return sGroup;
  };

  const handKnuckleGeo = getCachedGeo('handKnuckle', () => new THREE.BoxGeometry(0.046, 0.020, 0.062));
  const handThumbGeo = getCachedGeo('handThumb', () => new THREE.CapsuleGeometry(0.010, 0.034, 6, 8));
  const handFingerGeo = getCachedGeo('handFinger', () => new THREE.CapsuleGeometry(0.0085, 0.036, 6, 8));

  // Hierarchical Right Arm: rightArm (shoulder pivot) -> rightForearm (elbow pivot) -> rightHand (5-finger grip)
  const rightArm = new THREE.Group();
  rightArm.position.set(0.305, 0.01, 0);
  const rightShoulder = buildTacticalShoulder(1);

  const rightBicep = new THREE.Mesh(
    getCachedGeo('rightBicep', () => new THREE.CapsuleGeometry(0.064, 0.19, 10, 14)),
    bduMat
  );
  rightBicep.position.set(0.015, -0.11, -0.07);
  rightBicep.rotation.set(0.58, 0, -0.06);
  rightBicep.castShadow = true;
  tagBodyHitbox(rightBicep);

  const rightElbow = new THREE.Mesh(
    getCachedGeo('rightElbow', () => new THREE.SphereGeometry(0.056, 10, 10)),
    armorMat
  );
  rightElbow.position.set(0.030, -0.20, -0.17);
  rightElbow.castShadow = false;

  const rightForearm = new THREE.Group();
  rightForearm.position.set(0.030, -0.20, -0.17);

  const rightForearmMesh = new THREE.Mesh(
    getCachedGeo('rightForearmMesh', () => new THREE.CylinderGeometry(0.055, 0.042, 0.25, 14)),
    bduMat
  );
  rightForearmMesh.position.set(-0.030, 0.04, -0.12);
  rightForearmMesh.rotation.set(1.34, -0.20, 0);
  rightForearmMesh.castShadow = true;
  tagBodyHitbox(rightForearmMesh);

  const rightCuff = new THREE.Mesh(
    getCachedGeo('rightCuff', () => new THREE.CylinderGeometry(0.045, 0.043, 0.055, 12)),
    webbingMat
  );
  rightCuff.position.set(-0.045, 0.065, -0.195);
  rightCuff.rotation.set(1.34, -0.20, 0);
  rightCuff.castShadow = false;

  const rightHand = new THREE.Group();
  rightHand.position.set(-0.055, 0.08, -0.235);
  const rPalm = new THREE.Mesh(
    getCachedGeo('rPalm', () => new THREE.CapsuleGeometry(0.024, 0.038, 8, 10)),
    bootMat
  );
  rPalm.rotation.x = Math.PI / 2.2;
  rPalm.castShadow = false;
  const rKnuckle = new THREE.Mesh(handKnuckleGeo, armorMat);
  rKnuckle.position.set(0.004, 0.026, 0);
  rKnuckle.castShadow = false;
  const rThumb = new THREE.Mesh(handThumbGeo, bootMat);
  rThumb.position.set(-0.026, 0.012, -0.016);
  rThumb.rotation.set(0.42, 0.32, 0.52);
  rThumb.castShadow = false;
  rightHand.add(rPalm, rKnuckle, rThumb);
  for (let f = 0; f < 4; f++) {
    const rFinger = new THREE.Mesh(handFingerGeo, bootMat);
    rFinger.position.set(-0.014, -0.004 - f * 0.014, -0.030 + (f === 0 ? -0.012 : 0));
    rFinger.rotation.z = Math.PI / 2;
    rFinger.rotation.y = f === 0 ? -0.32 : 0.08;
    rFinger.castShadow = false;
    rightHand.add(rFinger);
  }

  rightForearm.add(rightForearmMesh, rightCuff, rightHand);
  rightArm.add(rightShoulder, rightBicep, rightElbow, rightForearm);

  // Hierarchical Left Arm: leftArm (shoulder pivot) -> leftForearm (elbow pivot) -> leftHand (5-finger C-clamp grip)
  const leftArm = new THREE.Group();
  leftArm.position.set(-0.305, 0.01, 0);
  const leftShoulder = buildTacticalShoulder(-1);

  const leftBicep = new THREE.Mesh(
    getCachedGeo('leftBicep', () => new THREE.CapsuleGeometry(0.062, 0.20, 10, 14)),
    bduMat
  );
  leftBicep.position.set(0.035, -0.10, -0.10);
  leftBicep.rotation.set(0.75, -0.42, 0.30);
  leftBicep.castShadow = true;
  tagBodyHitbox(leftBicep);

  const leftElbow = new THREE.Mesh(
    getCachedGeo('leftElbow', () => new THREE.SphereGeometry(0.055, 10, 10)),
    armorMat
  );
  leftElbow.position.set(0.125, -0.18, -0.23);
  leftElbow.castShadow = false;

  const leftForearm = new THREE.Group();
  leftForearm.position.set(0.125, -0.18, -0.23);

  const leftForearmMesh = new THREE.Mesh(
    getCachedGeo('leftForearmMesh', () => new THREE.CylinderGeometry(0.054, 0.041, 0.31, 14)),
    bduMat
  );
  leftForearmMesh.position.set(0.20, 0.05, -0.16);
  leftForearmMesh.rotation.set(1.38, 0, -0.82);
  leftForearmMesh.castShadow = true;
  tagBodyHitbox(leftForearmMesh);

  const leftWristWatch = new THREE.Mesh(
    getCachedGeo('leftWristWatch', () => new THREE.CylinderGeometry(0.044, 0.044, 0.045, 12)),
    armorMat
  );
  leftWristWatch.position.set(0.32, 0.072, -0.25);
  leftWristWatch.rotation.set(1.38, 0, -0.82);
  leftWristWatch.castShadow = false;
  const leftWatchDial = new THREE.Mesh(
    getCachedGeo('leftWatchDial', () => new THREE.CylinderGeometry(0.018, 0.018, 0.012, 10)),
    mainMat
  );
  leftWatchDial.position.set(0.31, 0.105, -0.25);
  leftWatchDial.castShadow = false;

  const leftHand = new THREE.Group();
  leftHand.position.set(0.40, 0.09, -0.31);
  const lPalm = new THREE.Mesh(
    getCachedGeo('lPalm', () => new THREE.CapsuleGeometry(0.024, 0.040, 8, 10)),
    bootMat
  );
  lPalm.rotation.x = Math.PI / 2;
  lPalm.castShadow = false;
  const lKnuckle = new THREE.Mesh(handKnuckleGeo, armorMat);
  lKnuckle.position.set(-0.004, 0.024, 0);
  lKnuckle.castShadow = false;
  const lThumb = new THREE.Mesh(handThumbGeo, bootMat);
  lThumb.position.set(-0.016, 0.026, -0.016);
  lThumb.rotation.set(0.2, -0.38, -0.75);
  lThumb.castShadow = false;
  leftHand.add(lPalm, lKnuckle, lThumb);
  for (let f = 0; f < 4; f++) {
    const lFinger = new THREE.Mesh(handFingerGeo, bootMat);
    lFinger.position.set(0.015, -0.014, -0.032 + f * 0.018);
    lFinger.rotation.z = Math.PI / 2.3;
    lFinger.castShadow = false;
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

  armPivot.add(
    rightArm,
    leftArm,
    gunHolder
  );

  // ==================== 5. ANATOMICAL LEGS, CARGO PANTS, CRYE KNEE PADS & COMBAT BOOTS ====================
  const thighGeo = getCachedGeo('thighGeo', () => {
    const g = new THREE.CylinderGeometry(0.106, 0.082, 0.38, 16);
    g.translate(0, -0.19, 0); // Pivot at hip socket (y = 0)
    return g;
  });

  const shinGeo = getCachedGeo('shinGeo', () => {
    const g = new THREE.CylinderGeometry(0.078, 0.056, 0.34, 16);
    g.translate(0, -0.17, 0); // Pivot at knee joint (y = 0)
    return g;
  });

  const hipBallGeo = getCachedGeo('hipBall', () => new THREE.SphereGeometry(0.094, 12, 10));
  const cargoPocketGeo = getCachedGeo('cargoPocket', () => new THREE.BoxGeometry(0.042, 0.16, 0.125));
  const pocketFlapGeo = getCachedGeo('pocketFlap', () => new THREE.BoxGeometry(0.048, 0.042, 0.13));
  const holsterPlateGeo = getCachedGeo('holsterPlate', () => new THREE.BoxGeometry(0.032, 0.19, 0.105));
  const kydexShellGeo = getCachedGeo('kydexShell', () => new THREE.BoxGeometry(0.056, 0.15, 0.085));
  const holsterGripGeo = getCachedGeo('holsterGrip', () => new THREE.BoxGeometry(0.038, 0.075, 0.048));
  const thighStrapRGeo = getCachedGeo('thighStrapR', () => new THREE.TorusGeometry(0.094, 0.014, 8, 16));
  const thighStrapLGeo = getCachedGeo('thighStrapL', () => new THREE.TorusGeometry(0.092, 0.012, 8, 16));
  const tqPouchGeo = getCachedGeo('tqPouch', () => new THREE.BoxGeometry(0.038, 0.11, 0.048));
  const kneeSphereGeo = getCachedGeo('kneeSphere', () => new THREE.SphereGeometry(0.072, 12, 10));
  const kneePadBaseGeo = getCachedGeo('kneePadBase', () => new THREE.CapsuleGeometry(0.054, 0.068, 8, 12));
  const kneeHardCapGeo = getCachedGeo('kneeHardCap', () => new THREE.BoxGeometry(0.088, 0.082, 0.032));
  const kneeStrapGeo = getCachedGeo('kneeStrap', () => new THREE.TorusGeometry(0.074, 0.011, 6, 14));
  const calfMuscleGeo = getCachedGeo('calfMuscle', () => new THREE.SphereGeometry(0.068, 12, 10));
  const bootCollarGeo = getCachedGeo('bootCollar', () => new THREE.CylinderGeometry(0.062, 0.068, 0.095, 14));
  const bootUpperGeo = getCachedGeo('bootUpper', () => new THREE.CapsuleGeometry(0.058, 0.135, 10, 14));
  const bootHeelGeo = getCachedGeo('bootHeel', () => new THREE.CylinderGeometry(0.056, 0.060, 0.075, 12));
  const bootToeCapGeo = getCachedGeo('bootToeCap', () => new THREE.SphereGeometry(0.058, 12, 10));
  const bootSoleGeo = getCachedGeo('bootSole', () => new THREE.BoxGeometry(0.126, 0.028, 0.265));

  const buildArticulatedLeg = (sideSign) => {
    const hipLegMesh = new THREE.Mesh(thighGeo, bduMat);
    hipLegMesh.position.set(sideSign * 0.145, 0.80, 0);
    hipLegMesh.castShadow = true;
    tagBodyHitbox(hipLegMesh);

    const hipBall = new THREE.Mesh(hipBallGeo, bduMat);
    hipBall.castShadow = false;

    // BDU Thigh Cargo Pocket
    const cargoPocket = new THREE.Mesh(cargoPocketGeo, bduMat);
    cargoPocket.position.set(sideSign * 0.082, -0.185, -0.005);
    cargoPocket.castShadow = false;
    const pocketFlap = new THREE.Mesh(pocketFlapGeo, vestMat);
    pocketFlap.position.set(sideSign * 0.084, -0.115, -0.005);
    pocketFlap.castShadow = false;
    hipLegMesh.add(hipBall, cargoPocket, pocketFlap);

    // Right-Side Drop-Leg Tactical Kydex Pistol Holster + Thigh Straps
    if (sideSign > 0) {
      const holsterPlate = new THREE.Mesh(holsterPlateGeo, armorMat);
      holsterPlate.position.set(0.095, -0.18, -0.01);
      holsterPlate.castShadow = false;
      const kydexShell = new THREE.Mesh(kydexShellGeo, bootMat);
      kydexShell.position.set(0.118, -0.175, -0.015);
      kydexShell.rotation.x = -0.15;
      kydexShell.castShadow = false;
      const holsterGrip = new THREE.Mesh(holsterGripGeo, chromeMat);
      holsterGrip.position.set(0.118, -0.095, 0.015);
      holsterGrip.rotation.x = -0.35;
      holsterGrip.castShadow = false;
      const thighStrap = new THREE.Mesh(thighStrapRGeo, webbingMat);
      thighStrap.rotation.x = Math.PI / 2;
      thighStrap.position.set(0, -0.19, 0);
      thighStrap.castShadow = false;
      hipLegMesh.add(holsterPlate, kydexShell, holsterGrip, thighStrap);
    } else {
      // Left Thigh Tourniquet / Utility Strap
      const thighStrapL = new THREE.Mesh(thighStrapLGeo, webbingMat);
      thighStrapL.rotation.x = Math.PI / 2;
      thighStrapL.position.set(0, -0.20, 0);
      thighStrapL.castShadow = false;
      const tqPouch = new THREE.Mesh(tqPouchGeo, mainMat);
      tqPouch.position.set(-0.088, -0.19, -0.04);
      tqPouch.castShadow = false;
      hipLegMesh.add(thighStrapL, tqPouch);
    }

    // Articulated Knee Joint Pivot at bottom of thigh (y = -0.38)
    const kneePivot = new THREE.Group();
    kneePivot.position.set(0, -0.38, 0);
    hipLegMesh.add(kneePivot);

    const kneeSphere = new THREE.Mesh(kneeSphereGeo, bduMat);
    kneeSphere.castShadow = false;
    // Crye AirFlex Contoured Combat Knee Pad
    const kneePadBase = new THREE.Mesh(kneePadBaseGeo, vestMat);
    kneePadBase.position.set(0, 0.005, -0.048);
    kneePadBase.castShadow = false;
    const kneeHardCap = new THREE.Mesh(kneeHardCapGeo, armorMat);
    kneeHardCap.position.set(0, 0.005, -0.082);
    kneeHardCap.castShadow = false;
    const kneeStrap = new THREE.Mesh(kneeStrapGeo, webbingMat);
    kneeStrap.rotation.x = Math.PI / 2;
    kneeStrap.position.set(0, 0.005, 0);
    kneeStrap.castShadow = false;

    // Lower Leg (Shin & Gastrocnemius Calf Muscle + Combat Boot nested under shinMesh)
    const shinMesh = new THREE.Mesh(shinGeo, bduMat);
    shinMesh.castShadow = true;
    tagBodyHitbox(shinMesh);

    const calfMuscle = new THREE.Mesh(calfMuscleGeo, bduMat);
    calfMuscle.scale.set(0.94, 1.42, 1.08);
    calfMuscle.position.set(0, -0.125, 0.028);
    calfMuscle.castShadow = false;

    // Salomon / Lowa Tactical Combat Boot (Ankle Collar, Lace Tongue, Contoured Upper, Heel & Lugged Sole)
    const bootCollar = new THREE.Mesh(bootCollarGeo, vestMat);
    bootCollar.position.set(0, -0.32, 0);
    bootCollar.castShadow = false;
    const bootUpper = new THREE.Mesh(bootUpperGeo, bootMat);
    bootUpper.rotation.x = Math.PI / 2;
    bootUpper.position.set(0, -0.368, -0.045);
    bootUpper.castShadow = true;
    const bootHeel = new THREE.Mesh(bootHeelGeo, armorMat);
    bootHeel.position.set(0, -0.368, 0.025);
    bootHeel.castShadow = false;
    const bootToeCap = new THREE.Mesh(bootToeCapGeo, bootMat);
    bootToeCap.scale.set(1.04, 0.72, 1.16);
    bootToeCap.position.set(0, -0.376, -0.118);
    bootToeCap.castShadow = false;
    const bootSole = new THREE.Mesh(bootSoleGeo, armorMat);
    bootSole.position.set(0, -0.406, -0.045);
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
  const createHitboxProxy = (geoKey, w, h, d, x, y, z, zone) => {
    const isHead = zone === 'head';
    const proxyGeo = getCachedGeo(geoKey, () => {
      const g = new THREE.BoxGeometry(w, h, d);
      g.computeBoundingBox();
      g.computeBoundingSphere();
      return g;
    });
    const proxyMesh = new THREE.Mesh(proxyGeo, HITBOX_PROXY_MAT);
    proxyMesh.position.set(x, y, z);
    proxyMesh.castShadow = false;
    proxyMesh.receiveShadow = false;
    proxyMesh.userData = {
      playerId: playerData.id,
      isHeadshot: isHead,
      isHead,
      zone,
      isHitboxProxy: true,
      hitbox: { playerId: playerData.id, zone, isHeadshot: isHead, isHead }
    };
    hitboxParts.push(proxyMesh);
    return proxyMesh;
  };

  // 1. Head + Ops-Core FAST Helmet Volume Proxy (spans headGroup y in [-0.06, 0.40] -> chestGroup y in [0.58, 1.04])
  const headHitboxProxy = createHitboxProxy('hitbox_head_proxy', 0.35, 0.46, 0.36, 0, 0.17, -0.01, 'head');
  headGroup.add(headHitboxProxy);

  // 2. Upper Chest + Abdomen + Dual Arms Volume Proxy (spans chestGroup y in [0.00, 0.62], z in [-0.28, 0.14])
  const torsoHitboxProxy = createHitboxProxy('hitbox_torso_proxy', 0.64, 0.62, 0.42, 0, 0.31, -0.07, 'body');
  chestGroup.add(torsoHitboxProxy);

  // 3. Pelvis + Battle Belt Volume Proxy
  const pelvisHitboxProxy = createHitboxProxy('hitbox_pelvis_proxy', 0.44, 0.22, 0.32, 0, 0, 0, 'body');
  pelvisGroup.add(pelvisHitboxProxy);

  // 4. Articulated Thigh & Shin Volume Proxies
  const leftLegHitboxProxy = createHitboxProxy('hitbox_thigh_proxy', 0.22, 0.38, 0.22, 0, -0.19, 0, 'body');
  const rightLegHitboxProxy = createHitboxProxy('hitbox_thigh_proxy', 0.22, 0.38, 0.22, 0, -0.19, 0, 'body');
  leftLeg.add(leftLegHitboxProxy);
  rightLeg.add(rightLegHitboxProxy);

  const leftShinHitboxProxy = createHitboxProxy('hitbox_shin_proxy', 0.18, 0.42, 0.24, 0, -0.21, -0.02, 'body');
  const rightShinHitboxProxy = createHitboxProxy('hitbox_shin_proxy', 0.18, 0.42, 0.24, 0, -0.21, -0.02, 'body');
  leftLegData.shinMesh.add(leftShinHitboxProxy);
  rightLegData.shinMesh.add(rightShinHitboxProxy);

  const labelInfo = null;
  if (!isShowcase && options.scene) {
    options.scene.add(group);
  }

  const setOperatorColor = (newHex) => {
    mainMat.color.setHex(newHex);
    visorMat.emissive.setHex(newHex);
  };

  return {
    id: playerData.id,
    name: playerData.name,
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
    setOperatorColor,
    currentWeapon: playerData.weapon || 'rifle',
    labelInfo,
    targetPos: new THREE.Vector3(playerData.x || 0, playerData.y || 0, playerData.z || 0),
    targetYaw: playerData.yaw || 0,
    targetPitch: playerData.pitch || 0,
    crouching: Boolean(playerData.crouching),
    prone: Boolean(playerData.prone),
    lean: Number(playerData.lean || 0),
    crouchBlend: 0,
    proneBlend: 0,
    leanBlend: 0,
    hp: playerData.hp ?? 100,
    alive: playerData.alive !== undefined ? Boolean(playerData.alive) : true,
    walkPhase: 0,
    lastShotFlashAt: 0
  };
}

export const createHumanoidPlayerRig = createRemotePlayerMesh;

export function animateHumanoidRig(rp, dt, now, isMoving, moveSpeed = 0) {
  if (!rp || !rp.pelvisGroup) return;
  // 1. Smoothly blend standing <-> tactical crouch <-> prone & Q/E lean posture
  const targetProne = rp.prone ? 1.0 : 0.0;
  rp.proneBlend = (rp.proneBlend || 0) + (targetProne - (rp.proneBlend || 0)) * Math.min(1, dt * 11);
  const pb = rp.proneBlend;

  const targetCrouch = rp.crouching && !rp.prone ? 1.0 : 0.0;
  rp.crouchBlend = (rp.crouchBlend || 0) + (targetCrouch - (rp.crouchBlend || 0)) * Math.min(1, dt * 12);
  const cb = rp.crouchBlend;

  const targetLean = rp.lean || 0;
  rp.leanBlend = (rp.leanBlend || 0) + (targetLean - (rp.leanBlend || 0)) * Math.min(1, dt * 14);
  const lb = rp.leanBlend;

  // 2. Advance gait cycle & subtle idle breathing
  const breath = Math.sin(now * 0.0028 + (rp.id?.length || 0)) * 0.015;
  if (isMoving) {
    const rate = moveSpeed > 0.16 ? 13.5 : 10.8;
    rp.walkPhase += dt * rate;
  }

  const strideAmp = isMoving ? (pb > 0.4 ? 0.18 : cb > 0.4 ? 0.42 : 0.62) : 0;
  const strideSin = Math.sin(rp.walkPhase);
  const strideBob = isMoving ? Math.abs(Math.sin(rp.walkPhase)) * 0.032 * (1 - cb * 0.4 - pb * 0.75) : 0;

  // 3. Pelvis & Hip Socket vertical height (drops 0.25m in crouch, 0.56m in prone)
  const hipY = 0.80 - cb * 0.25 - pb * 0.56 + strideBob;
  if (rp.pelvisGroup) {
    rp.pelvisGroup.position.y = hipY;
    rp.pelvisGroup.rotation.y = isMoving ? -strideSin * 0.06 : 0;
  }
  rp.leftLeg.position.y = hipY;
  rp.rightLeg.position.y = hipY;

  // 4. Articulated Hip Swing + Real Knee Joint Flexion (or extended backward in Prone)
  const crouchHipFlex = cb * 0.56 - pb * 1.15;
  const crouchKneeFlex = cb * 0.96 + pb * 0.18;

  if (isMoving) {
    const leftHipSwing = strideSin * strideAmp;
    const rightHipSwing = -strideSin * strideAmp;
    rp.leftLeg.rotation.x = leftHipSwing + crouchHipFlex;
    rp.rightLeg.rotation.x = rightHipSwing + crouchHipFlex;

    if (rp.leftKneePivot && rp.rightKneePivot) {
      const leftKneeSwing = Math.max(0.06, Math.sin(rp.walkPhase - 0.65) * 0.78);
      const rightKneeSwing = Math.max(0.06, Math.sin(rp.walkPhase + Math.PI - 0.65) * 0.78);
      rp.leftKneePivot.rotation.x = -(leftKneeSwing * (1 - cb * 0.35 - pb * 0.65) + crouchKneeFlex);
      rp.rightKneePivot.rotation.x = -(rightKneeSwing * (1 - cb * 0.35 - pb * 0.65) + crouchKneeFlex);
    }
  } else {
    rp.leftLeg.rotation.x += (crouchHipFlex + 0.04 - rp.leftLeg.rotation.x) * Math.min(1, dt * 10);
    rp.rightLeg.rotation.x += (crouchHipFlex - 0.05 - rp.rightLeg.rotation.x) * Math.min(1, dt * 10);
    if (rp.leftKneePivot && rp.rightKneePivot) {
      rp.leftKneePivot.rotation.x += (-(crouchKneeFlex + 0.08) - rp.leftKneePivot.rotation.x) * Math.min(1, dt * 10);
      rp.rightKneePivot.rotation.x += (-(crouchKneeFlex + 0.06) - rp.rightKneePivot.rotation.x) * Math.min(1, dt * 10);
    }
  }

  // 5. Upper Body, Head, Lean Roll & Dual-Arm Aiming Articulation
  const aimPitch = rp.targetPitch || 0;
  if (rp.upperBodyGroup) {
    const targetTorsoPitch = -cb * 0.18 - pb * 1.05 + aimPitch * 0.25 + breath * 0.5;
    rp.upperBodyGroup.rotation.x += (targetTorsoPitch - rp.upperBodyGroup.rotation.x) * 0.25;
    const targetTorsoTwist = isMoving ? strideSin * 0.09 : Math.sin(now * 0.0014) * 0.03;
    rp.upperBodyGroup.rotation.y += (targetTorsoTwist - rp.upperBodyGroup.rotation.y) * 0.2;
    rp.upperBodyGroup.rotation.z = -lb * 0.28;
    rp.upperBodyGroup.position.x = lb * 0.18;
  }
  if (rp.headGroup) {
    const targetHeadPitch = cb * 0.16 + pb * 0.92 + aimPitch * 0.45;
    rp.headGroup.rotation.x += (targetHeadPitch - rp.headGroup.rotation.x) * 0.28;
  }
  if (rp.armPivot) {
    const targetArmPitch = pb * 0.95 + aimPitch * 0.75 + breath + (isMoving ? Math.cos(rp.walkPhase * 2) * 0.035 : 0);
    rp.armPivot.rotation.x += (targetArmPitch - rp.armPivot.rotation.x) * 0.32;
  }

  // Keep overhead nameplate positioned cleanly above helmet
  if (rp.labelInfo?.sprite) {
    rp.labelInfo.sprite.position.y = 2.36 - cb * 0.26 - pb * 0.88;
  }

  // Hide third-person muzzle flash after 55ms
  if (rp.gunMesh?.userData?.flashMesh && now - rp.lastShotFlashAt > 55) {
    rp.gunMesh.userData.flashMesh.visible = false;
  }
}

export const updateHumanoidRigAnimation = animateHumanoidRig;
