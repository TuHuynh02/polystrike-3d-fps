import * as THREE from '../three.js';
import { mergeTransformedGeometries } from '../weaponModels.js';

const PROCEDURAL_TEX_CACHE = new Map();
export const RIG_GEO_CACHE = new Map();

export function getCachedGeo(key, factoryFn) {
  let geo = RIG_GEO_CACHE.get(key);
  if (!geo) {
    geo = factoryFn();
    geo.userData = geo.userData || {};
    geo.userData.shared = true;
    if (!geo.boundingSphere) geo.computeBoundingSphere();
    RIG_GEO_CACHE.set(key, geo);
  }
  return geo;
}

const _identMat4 = new THREE.Matrix4();

export const ENEMY_OUTLINE_MAT = new THREE.MeshBasicMaterial({
  color: 0xff2a3a,
  side: THREE.BackSide,
  depthTest: true,
  depthWrite: true,
  transparent: false,
  toneMapped: false,
  polygonOffset: true,
  polygonOffsetFactor: 1,
  polygonOffsetUnits: 1
});
ENEMY_OUTLINE_MAT.userData = { shared: true, matSlotKey: 'enemyOutline' };

export const TEAMMATE_OUTLINE_MAT = new THREE.MeshBasicMaterial({
  color: 0x38bdf8,
  side: THREE.BackSide,
  depthTest: true,
  depthWrite: true,
  transparent: false,
  toneMapped: false,
  polygonOffset: true,
  polygonOffsetFactor: 1,
  polygonOffsetUnits: 1
});
TEAMMATE_OUTLINE_MAT.userData = { shared: true, matSlotKey: 'teammateOutline' };

function createInflatedOutlineGeo(entries, inflate = 0.011) {
  const merged = mergeTransformedGeometries(entries);
  const pos = merged.attributes?.position;
  if (!pos) return merged;
  merged.computeVertexNormals();
  const norm = merged.attributes?.normal;
  if (pos && norm) {
    const pArr = pos.array;
    const nArr = norm.array;
    // Average vertex normals by quantized spatial position so cylinder caps,
    // box edges, and sphere UV seams expand as a watertight thin silhouette hull.
    const smoothNormals = new Map();
    for (let i = 0; i < pArr.length; i += 3) {
      const kx = Math.round(pArr[i] * 2000);
      const ky = Math.round(pArr[i + 1] * 2000);
      const kz = Math.round(pArr[i + 2] * 2000);
      const key = `${kx}_${ky}_${kz}`;
      let acc = smoothNormals.get(key);
      if (!acc) {
        acc = [0, 0, 0];
        smoothNormals.set(key, acc);
      }
      acc[0] += nArr[i];
      acc[1] += nArr[i + 1];
      acc[2] += nArr[i + 2];
    }
    for (let i = 0; i < pArr.length; i += 3) {
      const kx = Math.round(pArr[i] * 2000);
      const ky = Math.round(pArr[i + 1] * 2000);
      const kz = Math.round(pArr[i + 2] * 2000);
      const acc = smoothNormals.get(`${kx}_${ky}_${kz}`);
      let nx = acc ? acc[0] : nArr[i];
      let ny = acc ? acc[1] : nArr[i + 1];
      let nz = acc ? acc[2] : nArr[i + 2];
      const len = Math.hypot(nx, ny, nz);
      if (len > 1e-6) {
        nx /= len;
        ny /= len;
        nz /= len;
      } else {
        nx = nArr[i];
        ny = nArr[i + 1];
        nz = nArr[i + 2];
      }
      pArr[i] += nx * inflate;
      pArr[i + 1] += ny * inflate;
      pArr[i + 2] += nz * inflate;
    }
    pos.needsUpdate = true;
  }
  merged.computeBoundingBox();
  merged.computeBoundingSphere();
  return merged;
}


export function getStaticRigVColorMaterial() {
  return getCachedMat('rig_static_vcolor', () => {
    const bdu = RIG_MAT_CACHE.get('bdu_0x262e36') || RIG_MAT_CACHE.get('rig_bdu');
    const mat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      vertexColors: true,
      roughness: 0.58,
      metalness: 0.16,
      bumpMap: bdu?.bumpMap || null,
      bumpScale: 0.015
    });
    mat.userData = { shared: true, matSlotKey: 'rig_static_vcolor' };
    return mat;
  });
}

export function batchBoneScope(scopeRoot, boneScopeId, stopNodes, primaryMesh = null, withOutline = false, outlineMat = ENEMY_OUTLINE_MAT) {
  const byMat = new Map();
  const meshesToRemove = [];
  const groupsToCheck = [];
  const baseScopeId = boneScopeId.replace(/_(v[1234]_[a-z]+)$/, '');
  const sharesBaseOutline =
    baseScopeId !== 'chest' &&
    (baseScopeId !== 'head' || boneScopeId.endsWith('_v4_recon'));
  const outlineKey = `outline_rig_v2_${sharesBaseOutline ? baseScopeId : boneScopeId}`;
  const needOutlineGeo = withOutline || !RIG_GEO_CACHE.has(outlineKey);
  const allOutlineEntries = needOutlineGeo ? [] : null;
  const staticBatchMat = getStaticRigVColorMaterial();

  const isDynamicSlot = (mat) => {
    const slot = mat?.userData?.matSlotKey;
    return slot === 'main' || slot === 'visor';
  };

  const isOutlineEligible = (mesh) => {
    if (!mesh || !mesh.geometry || mesh.userData?.noOutline) return false;
    const g = mesh.geometry;
    if (g.type === 'CircleGeometry' || g.type === 'RingGeometry' || g.type === 'PlaneGeometry') return false;
    const params = g.parameters;
    if (params && typeof params.thetaLength === 'number' && params.thetaLength < Math.PI * 2 - 0.01) {
      return false;
    }
    return true;
  };

  const addEntry = (mesh, relMatrix) => {
    const rawMat = mesh.material;
    if (!rawMat || !mesh.geometry) return;
    const dynamic = isDynamicSlot(rawMat);
    const targetMat = dynamic ? rawMat : staticBatchMat;
    let bucket = byMat.get(targetMat);
    if (!bucket) {
      bucket = {
        matSlotKey: targetMat.userData?.matSlotKey || targetMat.uuid,
        entries: [],
        castShadow: false
      };
      byMat.set(targetMat, bucket);
    }
    if (mesh.castShadow) bucket.castShadow = true;
    const clonedMat = relMatrix.clone();
    bucket.entries.push({
      geometry: mesh.geometry,
      matrix: clonedMat,
      color: dynamic ? null : (rawMat.color || null)
    });
    if (allOutlineEntries && isOutlineEligible(mesh)) {
      allOutlineEntries.push({ geometry: mesh.geometry, matrix: clonedMat });
    }
  };

  if (scopeRoot.isMesh && primaryMesh === scopeRoot) {
    addEntry(scopeRoot, _identMat4);
  }

  const walkChildren = (parentObj, parentRelMatrix) => {
    for (let i = 0; i < parentObj.children.length; i++) {
      const child = parentObj.children[i];
      if (stopNodes && stopNodes.has(child)) continue;
      child.updateMatrix();
      const childRelMatrix = parentRelMatrix.clone().multiply(child.matrix);
      if (child.isMesh) {
        addEntry(child, childRelMatrix);
        if (child !== primaryMesh) {
          meshesToRemove.push(child);
        }
      }
      if (child.children && child.children.length > 0) {
        walkChildren(child, childRelMatrix);
        if (!child.isMesh && child !== primaryMesh) {
          groupsToCheck.push(child);
        }
      }
    }
  };

  walkChildren(scopeRoot, _identMat4);

  for (let i = 0; i < meshesToRemove.length; i++) {
    const m = meshesToRemove[i];
    if (m.parent) m.parent.remove(m);
  }
  for (let i = groupsToCheck.length - 1; i >= 0; i--) {
    const g = groupsToCheck[i];
    if (g.children.length === 0 && g.parent) {
      g.parent.remove(g);
    }
  }

  const primaryTargetMat = primaryMesh?.material
    ? (isDynamicSlot(primaryMesh.material) ? primaryMesh.material : staticBatchMat)
    : null;

  for (const [mat, bucket] of byMat.entries()) {
    const cacheKey = `merged_rig_${boneScopeId}_${bucket.matSlotKey}`;
    const mergedGeo = getCachedGeo(cacheKey, () => mergeTransformedGeometries(bucket.entries));
    if (primaryMesh && primaryTargetMat === mat) {
      primaryMesh.geometry = mergedGeo;
      primaryMesh.material = mat;
      if (primaryMesh !== scopeRoot) {
        primaryMesh.position.set(0, 0, 0);
        primaryMesh.rotation.set(0, 0, 0);
        primaryMesh.scale.set(1, 1, 1);
      }
      primaryMesh.castShadow = bucket.castShadow;
      primaryMesh.frustumCulled = true;
    } else {
      const mergedMesh = new THREE.Mesh(mergedGeo, mat);
      mergedMesh.castShadow = bucket.castShadow;
      mergedMesh.frustumCulled = true;
      scopeRoot.add(mergedMesh);
    }
  }

  if (needOutlineGeo && allOutlineEntries && allOutlineEntries.length > 0) {
    const outlineGeo = getCachedGeo(outlineKey, () =>
      createInflatedOutlineGeo(allOutlineEntries, 0.011)
    );
    if (withOutline) {
      const outlineMesh = new THREE.Mesh(outlineGeo, outlineMat);
      outlineMesh.name = `outline_${boneScopeId}`;
      outlineMesh.userData = { isOutlineHull: true, boneScopeId };
      outlineMesh.renderOrder = 1;
      outlineMesh.castShadow = false;
      outlineMesh.receiveShadow = false;
      outlineMesh.frustumCulled = true;
      scopeRoot.add(outlineMesh);
      return outlineMesh;
    }
  }
  return null;
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
  visible: false,
  transparent: false,
  opacity: 0,
  depthWrite: false,
  depthTest: false,
  colorWrite: false
});
HITBOX_PROXY_MAT.userData = { shared: true };

export const RIG_MAT_CACHE = new Map();
export function getCachedMat(key, factoryFn) {
  let mat = RIG_MAT_CACHE.get(key);
  if (!mat) {
    mat = factoryFn();
    mat.userData = { ...(mat.userData || {}), shared: true, matSlotKey: mat.userData?.matSlotKey || key };
    RIG_MAT_CACHE.set(key, mat);
  }
  return mat;
}
