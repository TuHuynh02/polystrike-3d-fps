// 3D Articulated Tactical Operator Rig Builder & Kinematic Gait Animator
// Styled after CS2 / Call of Duty Modern Warfare / Ready or Not Special Forces Operators

import * as THREE from '../vendor/three/three.module.js';
import { createWeaponMesh } from './weaponModels.js';
import { HITBOX_PART_DEFS } from '../shared/hitboxes.js';

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
 * Generates cached 256x256 procedural diffuse & bump textures for tactical fabrics, Cordura MOLLE, Kevlar, and leather.
 */
export function createProceduralMaterial(type = 'bdu', baseHex = 0x334155, extraParams = {}) {
  const cacheKey = `${type}_${baseHex}`;
  let texPair = PROCEDURAL_TEX_CACHE.get(cacheKey);

  if (!texPair && typeof document !== 'undefined') {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');

    const bumpCanvas = document.createElement('canvas');
    bumpCanvas.width = 256;
    bumpCanvas.height = 256;
    const bCtx = bumpCanvas.getContext('2d');

    const baseColor = new THREE.Color(baseHex);
    ctx.fillStyle = `#${baseColor.getHexString()}`;
    ctx.fillRect(0, 0, 256, 256);

    bCtx.fillStyle = '#808080';
    bCtx.fillRect(0, 0, 256, 256);

    if (type === 'bdu' || type === 'camo') {
      // Ripstop BDU tactical combat uniform micro-grid, multi-tone mottling & cloth folds
      const darkTone = baseColor.clone().multiplyScalar(0.76);
      const midTone = baseColor.clone().multiplyScalar(0.90);
      const lightTone = baseColor.clone().multiplyScalar(1.15);

      ctx.fillStyle = `#${darkTone.getHexString()}`;
      for (let i = 0; i < 28; i++) {
        const rx = (i * 53 + 11) % 220;
        const ry = (i * 79 + 17) % 220;
        ctx.beginPath();
        ctx.ellipse(rx + 20, ry + 16, 18 + (i % 4) * 6, 10 + (i % 3) * 5, (i % 5) * 0.4, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = `#${midTone.getHexString()}`;
      for (let i = 0; i < 20; i++) {
        const rx = (i * 67 + 23) % 230;
        const ry = (i * 41 + 31) % 230;
        ctx.fillRect(rx, ry, 24, 14);
      }
      ctx.fillStyle = `#${lightTone.getHexString()}`;
      for (let i = 0; i < 18; i++) {
        const rx = (i * 83 + 19) % 228;
        const ry = (i * 59 + 11) % 228;
        ctx.beginPath();
        ctx.ellipse(rx + 12, ry + 10, 12 + (i % 3) * 4, 7 + (i % 2) * 4, 0.25, 0, Math.PI * 2);
        ctx.fill();
      }

      // Ripstop crosshatch weave lines in diffuse & bump
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.16)';
      ctx.lineWidth = 1;
      bCtx.strokeStyle = '#969696';
      bCtx.lineWidth = 1;
      for (let p = 0; p < 256; p += 8) {
        ctx.beginPath();
        ctx.moveTo(p, 0);
        ctx.lineTo(p, 256);
        ctx.moveTo(0, p);
        ctx.lineTo(256, p);
        ctx.stroke();

        bCtx.beginPath();
        bCtx.moveTo(p, 0);
        bCtx.lineTo(p, 256);
        bCtx.moveTo(0, p);
        bCtx.lineTo(256, p);
        bCtx.stroke();
      }
    } else if (type === 'cordura' || type === 'vest') {
      // 1000D Cordura ballistic nylon weave + PALS/MOLLE stitched webbing rows
      for (let y = 0; y < 256; y += 4) {
        for (let x = y % 8 === 0 ? 0 : 2; x < 256; x += 4) {
          ctx.fillStyle = 'rgba(255, 255, 255, 0.045)';
          ctx.fillRect(x, y, 2, 2);
          bCtx.fillStyle = '#989898';
          bCtx.fillRect(x, y, 2, 2);
        }
      }
      for (let y = 0; y < 256; y += 24) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.28)';
        ctx.fillRect(0, y, 256, 4);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.06)';
        ctx.fillRect(0, y + 4, 256, 2);

        bCtx.fillStyle = '#404040';
        bCtx.fillRect(0, y, 256, 4);
        bCtx.fillStyle = '#b0b0b0';
        bCtx.fillRect(0, y + 4, 256, 12);

        // Bar-tack vertical MOLLE stitch lines every 32px
        for (let x = 16; x < 256; x += 32) {
          ctx.fillStyle = 'rgba(0, 0, 0, 0.32)';
          ctx.fillRect(x, y + 4, 3, 16);
          bCtx.fillStyle = '#505050';
          bCtx.fillRect(x, y + 4, 3, 16);
        }
      }
    } else if (type === 'kevlar' || type === 'helmet') {
      // Matte pebbled ballistic aramid / carbon helmet shell finish
      for (let y = 0; y < 256; y += 3) {
        for (let x = 0; x < 256; x += 3) {
          const v = ((x * 17 + y * 31) % 24) - 12;
          ctx.fillStyle = v > 0 ? 'rgba(255,255,255,0.038)' : 'rgba(0,0,0,0.055)';
          ctx.fillRect(x, y, 2, 2);
          bCtx.fillStyle = v > 0 ? '#989898' : '#686868';
          bCtx.fillRect(x, y, 2, 2);
        }
      }
    } else if (type === 'leather') {
      // Full-grain combat boot leather micro-pebble & stitch grain
      for (let i = 0; i < 1600; i++) {
        const rx = (i * 47 + 13) % 256;
        const ry = (i * 89 + 7) % 256;
        ctx.fillStyle = i % 2 === 0 ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.05)';
        ctx.fillRect(rx, ry, 2, 2);
        bCtx.fillStyle = i % 2 === 0 ? '#929292' : '#6e6e6e';
        bCtx.fillRect(rx, ry, 2, 2);
      }
    }

    const map = new THREE.CanvasTexture(canvas);
    map.wrapS = THREE.RepeatWrapping;
    map.wrapT = THREE.RepeatWrapping;
    map.repeat.set(2, 2);
    map.userData = { shared: true };

    const bumpMap = new THREE.CanvasTexture(bumpCanvas);
    bumpMap.wrapS = THREE.RepeatWrapping;
    bumpMap.wrapT = THREE.RepeatWrapping;
    bumpMap.repeat.set(2, 2);
    bumpMap.userData = { shared: true };

    texPair = { map, bumpMap };
    PROCEDURAL_TEX_CACHE.set(cacheKey, texPair);
  }

  const defaults = {
    bdu: { roughness: 0.78, metalness: 0.06, bumpScale: 0.016 },
    camo: { roughness: 0.76, metalness: 0.06, bumpScale: 0.016 },
    cordura: { roughness: 0.68, metalness: 0.12, bumpScale: 0.022 },
    vest: { roughness: 0.66, metalness: 0.14, bumpScale: 0.022 },
    kevlar: { roughness: 0.44, metalness: 0.24, bumpScale: 0.016 },
    helmet: { roughness: 0.42, metalness: 0.26, bumpScale: 0.016 },
    leather: { roughness: 0.48, metalness: 0.18, bumpScale: 0.014 },
    metal: { roughness: 0.26, metalness: 0.84, bumpScale: 0.010 }
  }[type] || { roughness: 0.55, metalness: 0.2, bumpScale: 0.014 };

  return new THREE.MeshStandardMaterial({
    color: baseHex,
    map: texPair ? texPair.map : null,
    bumpMap: texPair ? texPair.bumpMap : null,
    bumpScale: extraParams.bumpScale ?? defaults.bumpScale,
    roughness: extraParams.roughness ?? defaults.roughness,
    metalness: extraParams.metalness ?? defaults.metalness,
    ...extraParams
  });
}

export function disposeObject3D(root) {
  if (!root) return;
  root.traverse((obj) => {
    if (obj.isMesh || obj.isSprite) {
      if (obj.geometry && !obj.geometry.userData?.shared) {
        obj.geometry.dispose();
      }
      if (Array.isArray(obj.material)) {
        obj.material.forEach((m) => {
          if (m && !m.userData?.shared) {
            if (m.map && !m.map.userData?.shared) m.map.dispose();
            m.dispose();
          }
        });
      } else if (obj.material && !obj.material.userData?.shared) {
        if (obj.material.map && !obj.material.map.userData?.shared) obj.material.map.dispose();
        obj.material.dispose();
      }
    }
  });
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

const RIG_MAT_CACHE = new Map();
function getCachedMat(key, factoryFn) {
  let mat = RIG_MAT_CACHE.get(key);
  if (!mat) {
    mat = factoryFn();
    mat.userData = { ...(mat.userData || {}), shared: true };
    RIG_MAT_CACHE.set(key, mat);
  }
  return mat;
}

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

  // 9. Tinted Ballistic Combat Goggles Lens (Iridium Polarized Sheen)
  const visorMat = new THREE.MeshStandardMaterial({
    color: 0x111827,
    emissive: pColor,
    emissiveIntensity: 0.18,
    roughness: 0.10,
    metalness: 0.88
  });

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
    getCachedGeo('pelvisCore', () => new THREE.CylinderGeometry(0.168, 0.154, 0.19, 18)),
    bduMat
  );
  pelvisCore.scale.set(1.20, 1, 0.84);
  pelvisCore.castShadow = true;
  tagBodyHitbox(pelvisCore);
  pelvisGroup.add(pelvisCore);

  // Contoured Gluteal & Groin Anatomical Volumes
  const groinGuard = new THREE.Mesh(
    getCachedGeo('groinGuard', () => new THREE.CapsuleGeometry(0.074, 0.075, 8, 12)),
    bduMat
  );
  groinGuard.position.set(0, -0.035, -0.062);
  groinGuard.castShadow = false;

  // Ronin Padded MOLLE Battle Belt + Inner Velcro Belt + AustriAlpin Cobra Buckle
  const beltRing = new THREE.Mesh(
    getCachedGeo('beltRing', () => new THREE.CylinderGeometry(0.185, 0.185, 0.068, 20)),
    vestMat
  );
  beltRing.scale.set(1.22, 1, 0.86);
  beltRing.position.set(0, 0.065, 0);
  beltRing.castShadow = false;

  const beltInnerStrap = new THREE.Mesh(
    getCachedGeo('beltInnerStrap', () => new THREE.CylinderGeometry(0.188, 0.188, 0.030, 20)),
    webbingMat
  );
  beltInnerStrap.scale.set(1.22, 1, 0.86);
  beltInnerStrap.position.set(0, 0.065, 0);
  beltInnerStrap.castShadow = false;

  const cobraBuckle = new THREE.Mesh(
    getCachedGeo('cobraBuckle', () => new THREE.CylinderGeometry(0.026, 0.026, 0.052, 8)),
    chromeMat
  );
  cobraBuckle.rotation.z = Math.PI / 2;
  cobraBuckle.scale.set(1, 1, 0.52);
  cobraBuckle.position.set(0, 0.065, -0.162);
  cobraBuckle.castShadow = false;

  // Two M67 Fragmentation Grenades clipped on front-side belt (Spherical Body + Fuze + Safety Lever + Pull Ring)
  const gBodyGeo = getCachedGeo('beltGrenadeBody', () => new THREE.SphereGeometry(0.034, 12, 10));
  const gFuzeGeo = getCachedGeo('beltGrenadeFuze', () => new THREE.CylinderGeometry(0.011, 0.015, 0.028, 8));
  const gSpoonGeo = getCachedGeo('beltGrenadeSpoon', () => new THREE.CapsuleGeometry(0.006, 0.042, 4, 6));
  const gRingGeo = getCachedGeo('beltGrenadeRing', () => new THREE.TorusGeometry(0.011, 0.0025, 6, 10));
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
  const sidePouchGeo = getCachedGeo('sidePouchContoured', () => new THREE.CapsuleGeometry(0.024, 0.055, 6, 10));
  const sidePouchL1 = new THREE.Mesh(sidePouchGeo, vestMat);
  sidePouchL1.position.set(-0.225, 0.058, -0.032);
  const sidePouchL2 = new THREE.Mesh(sidePouchGeo, vestMat);
  sidePouchL2.position.set(-0.225, 0.058, 0.022);

  const dumpPouchRear = new THREE.Mesh(
    getCachedGeo('dumpPouchRear', () => new THREE.CapsuleGeometry(0.046, 0.078, 8, 12)),
    webbingMat
  );
  dumpPouchRear.position.set(-0.125, 0.028, 0.162);

  const ifakRollRear = new THREE.Mesh(
    getCachedGeo('ifakRollRear', () => {
      const g = new THREE.CapsuleGeometry(0.038, 0.075, 8, 12);
      g.rotateZ(Math.PI / 2);
      return g;
    }),
    vestMat
  );
  ifakRollRear.position.set(0.062, 0.062, 0.168);

  const ifakCross = new THREE.Mesh(
    getCachedGeo('ifakCross', () => new THREE.CylinderGeometry(0.018, 0.018, 0.012, 8)),
    mainMat
  );
  ifakCross.rotation.x = Math.PI / 2;
  ifakCross.position.set(0.062, 0.062, 0.204);

  pelvisGroup.add(
    groinGuard,
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
  const torsoGeo = getCachedGeo('torsoGeo', () => new THREE.CylinderGeometry(0.238, 0.176, 0.58, 20));
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

  // Upper Chest / Latissimus Dorsi Muscular V-Taper Contour
  const upperChestBroad = new THREE.Mesh(
    getCachedGeo('upperChestBroad', () => new THREE.CapsuleGeometry(0.156, 0.22, 10, 16)),
    bduMat
  );
  upperChestBroad.rotation.z = Math.PI / 2;
  upperChestBroad.scale.set(1, 1, 0.76);
  upperChestBroad.position.set(0, 0.40, 0);
  upperChestBroad.castShadow = true;
  tagBodyHitbox(upperChestBroad);
  chestGroup.add(upperChestBroad);

  // Sculpted Contoured Front SAPI Plate Carrier Bag (Rounded Beveled Edges instead of a flat Box)
  const frontPlateCore = new THREE.Mesh(
    getCachedGeo('frontPlateCore', () => new THREE.CylinderGeometry(0.175, 0.195, 0.34, 8)),
    vestMat
  );
  frontPlateCore.rotation.y = Math.PI / 8;
  frontPlateCore.scale.set(0.92, 1, 0.24);
  frontPlateCore.position.set(0, 0.31, -0.158);
  frontPlateCore.castShadow = true;

  const frontUpperBevel = new THREE.Mesh(
    getCachedGeo('frontUpperBevel', () => new THREE.CylinderGeometry(0.118, 0.155, 0.085, 6)),
    vestMat
  );
  frontUpperBevel.scale.set(1.18, 1, 0.28);
  frontUpperBevel.position.set(0, 0.485, -0.156);

  // Rear Ballistic SAPI Plate Bag + Contoured Haley Strategic FlatPack Assault Pack
  const rearPlateCore = new THREE.Mesh(
    getCachedGeo('rearPlateCore', () => new THREE.CylinderGeometry(0.172, 0.190, 0.35, 8)),
    vestMat
  );
  rearPlateCore.rotation.y = Math.PI / 8;
  rearPlateCore.scale.set(0.90, 1, 0.24);
  rearPlateCore.position.set(0, 0.32, 0.158);
  rearPlateCore.castShadow = true;

  const assaultPackMain = new THREE.Mesh(
    getCachedGeo('assaultPackMain', () => new THREE.CapsuleGeometry(0.095, 0.14, 10, 14)),
    vestMat
  );
  assaultPackMain.scale.set(1.22, 1, 0.56);
  assaultPackMain.position.set(0, 0.34, 0.212);
  assaultPackMain.castShadow = true;

  const assaultPackLower = new THREE.Mesh(
    getCachedGeo('assaultPackLower', () => {
      const g = new THREE.CapsuleGeometry(0.048, 0.13, 8, 12);
      g.rotateZ(Math.PI / 2);
      return g;
    }),
    webbingMat
  );
  assaultPackLower.position.set(0, 0.23, 0.245);

  const packTopRoll = new THREE.Mesh(
    getCachedGeo('packTopRoll', () => {
      const g = new THREE.CylinderGeometry(0.038, 0.038, 0.21, 12);
      g.rotateZ(Math.PI / 2);
      return g;
    }),
    webbingMat
  );
  packTopRoll.position.set(0, 0.475, 0.215);

  // Contoured Skeletal Cummerbund Side Bands + Side Trauma Plate Pouches
  const cummerbundGeo = getCachedGeo('cummerbundCurved', () => new THREE.CapsuleGeometry(0.026, 0.22, 6, 10));
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
    const g = new THREE.CapsuleGeometry(0.032, 0.22, 8, 10);
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
  const magPouchGeo = getCachedGeo('magPouchContoured', () => new THREE.CapsuleGeometry(0.034, 0.088, 8, 12));
  const magBodyGeo = getCachedGeo('magBodyContoured', () => new THREE.CapsuleGeometry(0.026, 0.065, 6, 10));
  const magPlateGeo = getCachedGeo('magPlateContoured', () => new THREE.CylinderGeometry(0.028, 0.032, 0.018, 8));
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
      const g = new THREE.CapsuleGeometry(0.042, 0.11, 8, 12);
      g.rotateZ(Math.PI / 2);
      return g;
    }),
    webbingMat
  );
  adminPouch.scale.set(1, 1, 0.45);
  adminPouch.position.set(0, 0.398, -0.195);

  const squadPatch = new THREE.Mesh(
    getCachedGeo('squadPatchPlate', () => new THREE.BoxGeometry(0.115, 0.048, 0.010)),
    mainMat
  );
  squadPatch.position.set(0, 0.40, -0.214);

  const pttBox = new THREE.Mesh(
    getCachedGeo('pttBox', () => new THREE.CylinderGeometry(0.024, 0.024, 0.022, 12)),
    chromeMat
  );
  pttBox.rotation.x = Math.PI / 2;
  pttBox.position.set(-0.115, 0.455, -0.188);

  const chemlight = new THREE.Mesh(
    getCachedGeo('vestChemlight', () => new THREE.CapsuleGeometry(0.006, 0.095, 6, 8)),
    mainMat
  );
  chemlight.rotation.z = 0.22;
  chemlight.position.set(0.125, 0.38, -0.192);

  // Tactical AN/PRC-152 Harris Radio on Left Cummerbund + Whip Antenna
  const radioBody = new THREE.Mesh(
    getCachedGeo('radioBodyContoured', () => new THREE.CapsuleGeometry(0.032, 0.11, 8, 10)),
    armorMat
  );
  radioBody.position.set(-0.165, 0.36, 0.195);
  const whipAntenna = new THREE.Mesh(
    getCachedGeo('whipAntenna', () => new THREE.CylinderGeometry(0.0035, 0.0065, 0.44, 6)),
    webbingMat
  );
  whipAntenna.position.set(-0.172, 0.65, 0.195);
  whipAntenna.rotation.z = 0.08;

  // BDU Zipped Collar & Sculpted Human Neck with Folded Shemagh Neck Gaiter
  const bduCollar = new THREE.Mesh(
    getCachedGeo('bduCollar', () => new THREE.CylinderGeometry(0.120, 0.142, 0.088, 18)),
    bduMat
  );
  bduCollar.position.set(0, 0.555, -0.005);

  const shemaghRing = new THREE.Mesh(
    getCachedGeo('shemaghRing', () => new THREE.TorusGeometry(0.105, 0.028, 10, 18)),
    vestMat
  );
  shemaghRing.rotation.x = Math.PI / 2 + 0.08;
  shemaghRing.position.set(0, 0.582, -0.006);

  const neckGaiter = new THREE.Mesh(
    getCachedGeo('neckGaiter', () => new THREE.CylinderGeometry(0.088, 0.104, 0.14, 18)),
    webbingMat
  );
  neckGaiter.position.set(0, 0.615, -0.008);

  chestGroup.add(
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
  const headGeo = getCachedGeo('headGeo', () => new THREE.CapsuleGeometry(0.136, 0.11, 14, 18));
  const headMesh = new THREE.Mesh(headGeo, webbingMat);
  headMesh.position.set(0, 0.20, -0.01); // World y = 1.74
  headMesh.castShadow = true;
  tagHeadHitbox(headMesh);
  headGroup.add(headMesh);

  // Exposed Upper Face Skin Band (Forehead/Brow/Cheekbones around eyes)
  const faceSkinBand = new THREE.Mesh(
    getCachedGeo(
      'faceSkinBand',
      () => new THREE.CylinderGeometry(0.133, 0.129, 0.068, 18, 1, false, Math.PI * 0.62, Math.PI * 0.76)
    ),
    skinMat
  );
  faceSkinBand.position.set(0, 0.215, -0.012);

  // Contoured Brow Ridge & Smooth Anatomical Nose Bridge (replaces raw ConeGeometry)
  const browRidge = new THREE.Mesh(
    getCachedGeo('browRidge', () => {
      const g = new THREE.CapsuleGeometry(0.018, 0.11, 6, 10);
      g.rotateZ(Math.PI / 2);
      return g;
    }),
    skinMat
  );
  browRidge.position.set(0, 0.236, -0.128);

  const noseBridge = new THREE.Mesh(
    getCachedGeo('noseBridgeSmooth', () => new THREE.CapsuleGeometry(0.014, 0.036, 6, 10)),
    skinMat
  );
  noseBridge.rotation.x = 0.32;
  noseBridge.position.set(0, 0.202, -0.138);

  // Contoured Lower-Face Ribbed Tactical Balaclava Mask (Jaw, Chin & Nose Cover)
  const balaclavaJaw = new THREE.Mesh(
    getCachedGeo('balaclavaJawSmooth', () => new THREE.CapsuleGeometry(0.112, 0.065, 12, 16)),
    webbingMat
  );
  balaclavaJaw.scale.set(0.98, 1.0, 1.12);
  balaclavaJaw.position.set(0, 0.145, -0.024);

  // Ops-Core FAST SF High-Cut Ballistic Helmet Shell (also tagged as headshot collider)
  const helmetDome = new THREE.Mesh(
    getCachedGeo(
      'helmetDome',
      () => new THREE.SphereGeometry(0.164, 20, 16, 0, Math.PI * 2, 0, Math.PI * 0.58)
    ),
    armorMat
  );
  helmetDome.scale.set(0.97, 1.02, 1.09);
  helmetDome.position.set(0, 0.236, 0.005);
  helmetDome.castShadow = true;
  tagHeadHitbox(helmetDome);

  const helmetRearNape = new THREE.Mesh(
    getCachedGeo(
      'helmetRearNape',
      () => new THREE.CylinderGeometry(0.154, 0.140, 0.092, 16, 1, false, -Math.PI * 0.42, Math.PI * 0.84)
    ),
    armorMat
  );
  helmetRearNape.position.set(0, 0.20, 0.015);

  const helmetRimTrim = new THREE.Mesh(
    getCachedGeo('helmetRimTrim', () => new THREE.TorusGeometry(0.163, 0.008, 8, 24)),
    bootMat
  );
  helmetRimTrim.rotation.x = Math.PI / 2 - 0.14;
  helmetRimTrim.scale.set(0.98, 1.09, 1.0);
  helmetRimTrim.position.set(0, 0.232, 0.005);

  // Wilcox L4 G24 NVG Shroud, Articulated Mount Arm & Stowed Dual-Tube PVS-31 Night Vision Binoculars
  const nvgShroud = new THREE.Mesh(
    getCachedGeo('nvgShroud', () => new THREE.BoxGeometry(0.062, 0.056, 0.020)),
    chromeMat
  );
  nvgShroud.position.set(0, 0.305, -0.158);
  nvgShroud.rotation.x = -0.18;

  const nvgArm = new THREE.Mesh(
    getCachedGeo('nvgArm', () => new THREE.BoxGeometry(0.028, 0.052, 0.042)),
    chromeMat
  );
  nvgArm.position.set(0, 0.322, -0.178);
  nvgArm.rotation.x = -0.35;

  const nvgBridge = new THREE.Mesh(
    getCachedGeo('nvgBridge', () => {
      const g = new THREE.CylinderGeometry(0.012, 0.012, 0.105, 8);
      g.rotateZ(Math.PI / 2);
      return g;
    }),
    armorMat
  );
  nvgBridge.position.set(0, 0.348, -0.192);

  const nvgTubeGeo = getCachedGeo('nvgTubeGeo', () => new THREE.CylinderGeometry(0.020, 0.022, 0.078, 12));
  const nvgLensGeo = getCachedGeo('nvgLensGeo', () => new THREE.CircleGeometry(0.018, 12));
  for (const side of [-1, 1]) {
    const tube = new THREE.Mesh(nvgTubeGeo, armorMat);
    tube.rotation.x = -0.32;
    tube.position.set(side * 0.038, 0.355, -0.198);
    const lens = new THREE.Mesh(nvgLensGeo, nvgLensMat);
    lens.rotation.x = -Math.PI / 2 - 0.32;
    lens.position.set(side * 0.038, 0.392, -0.210);
    headGroup.add(tube, lens);
  }

  // Helmet ARC Side Rails, SureFire Helmet Light, Velcro Callsign Panels & Rear Mohawk Counterweight Pack
  const arcRailGeo = getCachedGeo('arcRailCurved', () => {
    const g = new THREE.CapsuleGeometry(0.011, 0.125, 6, 8);
    g.rotateX(Math.PI / 2);
    return g;
  });
  const arcRailL = new THREE.Mesh(arcRailGeo, vestMat);
  arcRailL.position.set(-0.155, 0.258, -0.01);
  const arcRailR = new THREE.Mesh(arcRailGeo, vestMat);
  arcRailR.position.set(0.155, 0.258, -0.01);

  const helmetLight = new THREE.Mesh(
    getCachedGeo('helmetFlashlight', () => {
      const g = new THREE.CylinderGeometry(0.010, 0.012, 0.068, 8);
      g.rotateX(Math.PI / 2);
      return g;
    }),
    chromeMat
  );
  helmetLight.position.set(0.165, 0.268, -0.045);

  const velcroPatchGeo = getCachedGeo('velcroPatch', () => new THREE.BoxGeometry(0.008, 0.036, 0.075));
  const velcroPatchL = new THREE.Mesh(velcroPatchGeo, mainMat);
  velcroPatchL.position.set(-0.156, 0.296, 0.012);
  const velcroPatchR = new THREE.Mesh(velcroPatchGeo, mainMat);
  velcroPatchR.position.set(0.156, 0.296, 0.012);

  const counterweightPouch = new THREE.Mesh(
    getCachedGeo('counterweightPouchContoured', () => {
      const g = new THREE.CapsuleGeometry(0.026, 0.055, 6, 10);
      g.rotateZ(Math.PI / 2);
      return g;
    }),
    vestMat
  );
  counterweightPouch.position.set(0, 0.242, 0.168);

  // Tactical Ballistic Goggles (ESS / Oakley Wraparound Frame + Iridium Curved Lens + Elastic Strap)
  const goggleFrame = new THREE.Mesh(
    getCachedGeo(
      'goggleFrame',
      () => new THREE.CylinderGeometry(0.147, 0.145, 0.068, 20, 1, false, Math.PI * 0.61, Math.PI * 0.78)
    ),
    bootMat
  );
  goggleFrame.position.set(0, 0.218, -0.018);

  const goggleLens = new THREE.Mesh(
    getCachedGeo(
      'goggleLens',
      () => new THREE.CylinderGeometry(0.150, 0.148, 0.052, 20, 1, false, Math.PI * 0.63, Math.PI * 0.74)
    ),
    visorMat
  );
  goggleLens.position.set(0, 0.218, -0.018);

  const goggleStrap = new THREE.Mesh(
    getCachedGeo('goggleStrap', () => new THREE.CylinderGeometry(0.155, 0.155, 0.028, 18)),
    webbingMat
  );
  goggleStrap.scale.set(0.97, 1, 1.07);
  goggleStrap.position.set(0, 0.218, 0.005);

  // Peltor ComTac V Tactical Headset (Contoured Oval Shells + Gel Cushions + Wire Rail Mounts + Boom Mic)
  const earCupGeo = getCachedGeo('earCupContoured', () => {
    const g = new THREE.CapsuleGeometry(0.036, 0.026, 8, 12);
    g.scale(0.62, 1.15, 0.92);
    return g;
  });
  const earCushionGeo = getCachedGeo('earCushionGeo', () => {
    const g = new THREE.TorusGeometry(0.036, 0.012, 8, 14);
    g.rotateY(Math.PI / 2);
    g.scale(1, 1.18, 0.92);
    return g;
  });
  const earCupL = new THREE.Mesh(earCupGeo, armorMat);
  earCupL.position.set(-0.158, 0.195, 0.008);
  const earCushionL = new THREE.Mesh(earCushionGeo, bootMat);
  earCushionL.position.set(-0.142, 0.195, 0.008);

  const earCupR = new THREE.Mesh(earCupGeo, armorMat);
  earCupR.position.set(0.158, 0.195, 0.008);
  const earCushionR = new THREE.Mesh(earCushionGeo, bootMat);
  earCushionR.position.set(0.142, 0.195, 0.008);

  const boomMic = new THREE.Mesh(
    getCachedGeo('boomMic', () => new THREE.CylinderGeometry(0.0045, 0.0045, 0.135, 6)),
    chromeMat
  );
  boomMic.rotation.x = Math.PI / 2.3;
  boomMic.rotation.z = -0.35;
  boomMic.position.set(-0.11, 0.145, -0.085);
  const micWindscreen = new THREE.Mesh(
    getCachedGeo('micWindscreen', () => new THREE.CapsuleGeometry(0.009, 0.012, 6, 8)),
    bootMat
  );
  micWindscreen.rotation.z = Math.PI / 2;
  micWindscreen.position.set(-0.045, 0.125, -0.148);

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

  const deltoidCapGeo = getCachedGeo('deltoidCap', () => new THREE.SphereGeometry(0.094, 14, 12));
  const armPocketGeo = getCachedGeo('armPocketContoured', () => new THREE.CapsuleGeometry(0.022, 0.068, 6, 10));
  const unitPatchGeo = getCachedGeo('unitPatch', () => new THREE.BoxGeometry(0.010, 0.064, 0.064));

  const buildTacticalShoulder = (sideSign) => {
    const sGroup = new THREE.Group();

    const deltoidCap = new THREE.Mesh(deltoidCapGeo, bduMat);
    deltoidCap.scale.set(0.96, 1.14, 0.98);

    // Contoured BDU Zippered Upper-Arm Pocket + Unit Identification Velcro Patch
    const armPocket = new THREE.Mesh(armPocketGeo, bduMat);
    armPocket.scale.set(0.75, 1, 1.85);
    armPocket.position.set(sideSign * 0.072, -0.036, 0);
    armPocket.rotation.z = -sideSign * 0.12;

    const unitPatch = new THREE.Mesh(unitPatchGeo, mainMat);
    unitPatch.position.set(sideSign * 0.091, -0.034, 0);
    unitPatch.rotation.z = -sideSign * 0.12;

    sGroup.add(deltoidCap, armPocket, unitPatch);
    return sGroup;
  };

  const handKnuckleGeo = getCachedGeo('handKnuckleContoured', () => {
    const g = new THREE.CapsuleGeometry(0.011, 0.044, 6, 8);
    g.rotateX(Math.PI / 2);
    return g;
  });
  const handThumbGeo = getCachedGeo('handThumb', () => new THREE.CapsuleGeometry(0.010, 0.034, 6, 8));
  const handFingerGeo = getCachedGeo('handFinger', () => new THREE.CapsuleGeometry(0.0085, 0.036, 6, 8));

  // Hierarchical Right Arm: rightArm (shoulder pivot) -> rightForearm (elbow pivot) -> rightHand (5-finger grip)
  const rightArm = new THREE.Group();
  rightArm.position.set(0.305, 0.01, 0);
  const rightShoulder = buildTacticalShoulder(1);

  const rightBicep = new THREE.Mesh(
    getCachedGeo('rightBicep', () => new THREE.CapsuleGeometry(0.065, 0.19, 10, 14)),
    bduMat
  );
  rightBicep.position.set(0.015, -0.11, -0.07);
  rightBicep.rotation.set(0.58, 0, -0.06);
  rightBicep.castShadow = true;
  tagBodyHitbox(rightBicep);

  const rightElbow = new THREE.Mesh(
    getCachedGeo('rightElbow', () => new THREE.SphereGeometry(0.056, 12, 10)),
    armorMat
  );
  rightElbow.position.set(0.030, -0.20, -0.17);

  const rightForearm = new THREE.Group();
  rightForearm.position.set(0.030, -0.20, -0.17);

  const rightForearmMesh = new THREE.Mesh(
    getCachedGeo('rightForearmMesh', () => new THREE.CylinderGeometry(0.056, 0.042, 0.25, 16)),
    bduMat
  );
  rightForearmMesh.position.set(-0.030, 0.04, -0.12);
  rightForearmMesh.rotation.set(1.34, -0.20, 0);
  rightForearmMesh.castShadow = true;
  tagBodyHitbox(rightForearmMesh);

  const rightCuff = new THREE.Mesh(
    getCachedGeo('rightCuff', () => new THREE.CylinderGeometry(0.046, 0.044, 0.055, 14)),
    webbingMat
  );
  rightCuff.position.set(-0.045, 0.065, -0.195);
  rightCuff.rotation.set(1.34, -0.20, 0);

  const rightHand = new THREE.Group();
  rightHand.position.set(-0.055, 0.08, -0.235);
  const rPalm = new THREE.Mesh(
    getCachedGeo('rPalm', () => new THREE.CapsuleGeometry(0.024, 0.038, 8, 10)),
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
  leftArm.position.set(-0.305, 0.01, 0);
  const leftShoulder = buildTacticalShoulder(-1);

  const leftBicep = new THREE.Mesh(
    getCachedGeo('leftBicep', () => new THREE.CapsuleGeometry(0.063, 0.20, 10, 14)),
    bduMat
  );
  leftBicep.position.set(0.035, -0.10, -0.10);
  leftBicep.rotation.set(0.75, -0.42, 0.30);
  leftBicep.castShadow = true;
  tagBodyHitbox(leftBicep);

  const leftElbow = new THREE.Mesh(
    getCachedGeo('leftElbow', () => new THREE.SphereGeometry(0.055, 12, 10)),
    armorMat
  );
  leftElbow.position.set(0.125, -0.18, -0.23);

  const leftForearm = new THREE.Group();
  leftForearm.position.set(0.125, -0.18, -0.23);

  const leftForearmMesh = new THREE.Mesh(
    getCachedGeo('leftForearmMesh', () => new THREE.CylinderGeometry(0.055, 0.041, 0.31, 16)),
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
  const leftWatchDial = new THREE.Mesh(
    getCachedGeo('leftWatchDial', () => new THREE.CylinderGeometry(0.018, 0.018, 0.010, 12)),
    mainMat
  );
  leftWatchDial.position.set(0.312, 0.092, -0.25);
  leftWatchDial.rotation.set(0.24, 0, 0.32);

  const leftHand = new THREE.Group();
  leftHand.position.set(0.40, 0.09, -0.31);
  const lPalm = new THREE.Mesh(
    getCachedGeo('lPalm', () => new THREE.CapsuleGeometry(0.024, 0.040, 8, 10)),
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
    const g = new THREE.CylinderGeometry(0.108, 0.082, 0.38, 18);
    g.translate(0, -0.19, 0); // Pivot at hip socket (y = 0)
    return g;
  });

  const shinGeo = getCachedGeo('shinGeo', () => {
    const g = new THREE.CylinderGeometry(0.080, 0.056, 0.34, 18);
    g.translate(0, -0.17, 0); // Pivot at knee joint (y = 0)
    return g;
  });

  const hipBallGeo = getCachedGeo('hipBall', () => new THREE.SphereGeometry(0.095, 14, 12));
  const cargoPocketGeo = getCachedGeo('cargoPocketContoured', () => {
    const g = new THREE.CapsuleGeometry(0.026, 0.105, 6, 10);
    g.scale(0.82, 1, 2.2);
    return g;
  });
  const pocketFlapGeo = getCachedGeo('pocketFlapContoured', () => {
    const g = new THREE.CylinderGeometry(0.026, 0.028, 0.13, 8);
    g.rotateX(Math.PI / 2);
    g.scale(0.85, 0.72, 1);
    return g;
  });
  const holsterPlateGeo = getCachedGeo(
    'holsterPlateCurved',
    () => new THREE.CylinderGeometry(0.098, 0.092, 0.18, 12, 1, false, Math.PI * 0.28, Math.PI * 0.48)
  );
  const kydexShellGeo = getCachedGeo('kydexShellContoured', () => new THREE.CapsuleGeometry(0.032, 0.10, 8, 10));
  const holsterGripGeo = getCachedGeo('holsterGripContoured', () => new THREE.CapsuleGeometry(0.020, 0.055, 6, 8));
  const thighStrapRGeo = getCachedGeo('thighStrapR', () => new THREE.TorusGeometry(0.095, 0.013, 8, 18));
  const thighStrapLGeo = getCachedGeo('thighStrapL', () => new THREE.TorusGeometry(0.093, 0.012, 8, 18));
  const tqPouchGeo = getCachedGeo('tqPouchContoured', () => new THREE.CapsuleGeometry(0.022, 0.072, 6, 10));
  const kneeSphereGeo = getCachedGeo('kneeSphere', () => new THREE.SphereGeometry(0.072, 12, 10));
  const kneePadBaseGeo = getCachedGeo('kneePadBase', () => new THREE.CapsuleGeometry(0.056, 0.068, 8, 12));
  // Contoured Curved Hard Knee Cap (replaces flat BoxGeometry)
  const kneeHardCapGeo = getCachedGeo('kneeHardCapCurved', () => {
    const g = new THREE.CylinderGeometry(0.066, 0.062, 0.088, 12, 1, false, Math.PI * 0.68, Math.PI * 0.64);
    return g;
  });
  const kneeStrapGeo = getCachedGeo('kneeStrap', () => new THREE.TorusGeometry(0.075, 0.011, 6, 16));
  const calfMuscleGeo = getCachedGeo('calfMuscle', () => new THREE.SphereGeometry(0.069, 12, 10));
  const bootCollarGeo = getCachedGeo('bootCollar', () => new THREE.CylinderGeometry(0.063, 0.069, 0.095, 16));
  const bootUpperGeo = getCachedGeo('bootUpper', () => new THREE.CapsuleGeometry(0.058, 0.135, 10, 14));
  const bootHeelGeo = getCachedGeo('bootHeel', () => new THREE.CylinderGeometry(0.057, 0.062, 0.078, 14));
  const bootToeCapGeo = getCachedGeo('bootToeCap', () => new THREE.SphereGeometry(0.059, 12, 10));
  const bootSoleGeo = getCachedGeo('bootSoleContoured', () => {
    const g = new THREE.CapsuleGeometry(0.058, 0.145, 8, 12);
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

    // Contoured BDU Thigh Cargo Pocket + Beveled Flap
    const cargoPocket = new THREE.Mesh(cargoPocketGeo, bduMat);
    cargoPocket.position.set(sideSign * 0.082, -0.185, -0.005);
    const pocketFlap = new THREE.Mesh(pocketFlapGeo, vestMat);
    pocketFlap.position.set(sideSign * 0.086, -0.115, -0.005);
    hipLegMesh.add(hipBall, cargoPocket, pocketFlap);

    // Right-Side Safariland Drop-Leg Tactical Kydex Pistol Holster + Holstered Sidearm + Thigh Straps
    if (sideSign > 0) {
      const holsterPlate = new THREE.Mesh(holsterPlateGeo, armorMat);
      holsterPlate.position.set(0.012, -0.18, -0.005);
      const kydexShell = new THREE.Mesh(kydexShellGeo, bootMat);
      kydexShell.scale.set(0.82, 1, 1.25);
      kydexShell.position.set(0.116, -0.175, -0.015);
      kydexShell.rotation.x = -0.15;
      const holsterGrip = new THREE.Mesh(holsterGripGeo, chromeMat);
      holsterGrip.scale.set(0.75, 1, 1.25);
      holsterGrip.position.set(0.116, -0.095, 0.015);
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
      tqPouch.position.set(-0.088, -0.19, -0.04);
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

  // Hide third-person muzzle flash after 55ms
  if (rp.gunMesh?.userData?.flashMesh && now - rp.lastShotFlashAt > 55) {
    rp.gunMesh.userData.flashMesh.visible = false;
  }
}

export const updateHumanoidRigAnimation = animateHumanoidRig;
