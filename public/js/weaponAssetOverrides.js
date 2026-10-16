// weaponAssetOverrides: lets a glTF model replace the VISUAL of a weapon body for world-space presentations only
// (dropped-weapon pickups + lobby showcase). First-person viewmodels and remote players keep the procedural weapons, because
// game3d.js / tests depend on their userData contracts (opticCenter, adsPosition, opticLens, opticReticle, magMesh, boltMesh,
// flashMesh, adsCulledMeshes, RMR optic parented to boltMesh).
//
// Evaluation of the shipped Kenney Blaster Kit: stylised toy/sci-fi blasters (300-900 triangles, one 4x4 colour atlas, no PBR
// maps). They are NOT photoreal, so the table below is OPT-IN (?glbWeapons=1 or localStorage polystrike.glbWeapons = '1').
// The default look stays the procedural weapons.

import * as THREE from '../vendor/three/three.module.js';

/** weaponId -> Kenney model (picked by silhouette length class). `flip` rotates 180 degrees about Y if a model faces backwards. */
export const WEAPON_ASSET_OVERRIDES = {
  rifle: { model: 'blaster-d' },
  m4a1: { model: 'blaster-p' },
  scar: { model: 'blaster-r' },
  smg: { model: 'blaster-i' },
  shotgun: { model: 'blaster-a' },
  sniper: { model: 'blaster-e' },
  lmg: { model: 'blaster-f' },
  pistol: { model: 'blaster-b' },
  deagle: { model: 'blaster-o' },
  glock: { model: 'blaster-c' }
  // knife: intentionally absent (procedural karambit stays)
};

export function isWeaponOverrideEnabled(search, storage) {
  try {
    const s = search ?? (typeof window !== 'undefined' ? window.location?.search : '') ?? '';
    const q = new URLSearchParams(s).get('glbWeapons');
    if (q !== null) return q !== '0' && q !== 'false';
  } catch {
    /* ignore */
  }
  try {
    const store = storage ?? (typeof localStorage !== 'undefined' ? localStorage : null);
    return store?.getItem('polystrike.glbWeapons') === '1';
  } catch {
    return false;
  }
}

/** Local-space bounding box of a freshly created (parentless) procedural weapon group. */
export function measureWeaponGroup(group) {
  group.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(group);
  const inv = new THREE.Matrix4().copy(group.matrixWorld).invert();
  box.applyMatrix4(inv);
  return box;
}

/**
 * Pure placement maths: uniform scale so the model length (z) matches the procedural body, centred on the same box.
 * Returns null when the model is degenerate.
 */
export function computeOverridePlacement(modelBox, targetBox, flip = false) {
  const mSize = modelBox.getSize(new THREE.Vector3());
  const tSize = targetBox.getSize(new THREE.Vector3());
  if (mSize.z <= 1e-6 || tSize.z <= 1e-6) return null;
  const scale = tSize.z / mSize.z;
  const mCenter = modelBox.getCenter(new THREE.Vector3());
  const tCenter = targetBox.getCenter(new THREE.Vector3());
  return { scale, mCenter, tCenter, rotY: flip ? Math.PI : 0 };
}

/**
 * Asynchronously swaps the body of `group` for the override model. Resolves to true when applied.
 * The procedural children are only hidden (never removed), so every userData contract on the group keeps working.
 * @param {THREE.Group} group weapon group from createWeaponMesh(id, false)
 * @param {THREE.Box3} procBox result of measureWeaponGroup(group) taken BEFORE the group was parented/transformed further
 */
export async function applyWeaponAssetOverride(group, weaponId, assets, procBox, { enabled = isWeaponOverrideEnabled() } = {}) {
  try {
    const entry = WEAPON_ASSET_OVERRIDES[weaponId];
    if (!enabled || !entry || !assets || !procBox) return false;
    const gltf = await assets.loadModel(entry.model);
    if (!gltf) return false;
    const clone = assets.cloneModel(entry.model);
    if (!clone) return false;
    clone.traverse((o) => {
      // geometry/material/texture are owned by the AssetManager cache: disposeObject3D() must skip them
      if (o.geometry) o.geometry.userData.shared = true;
      const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
      for (const m of mats) {
        m.userData.shared = true;
        if (m.map) m.map.userData.shared = true;
      }
    });
    clone.updateMatrixWorld(true);
    const modelBox = new THREE.Box3().setFromObject(clone);
    const place = computeOverridePlacement(modelBox, procBox, Boolean(entry.flip));
    if (!place) return false;

    const holder = new THREE.Group();
    holder.name = 'glbWeaponOverride';
    clone.position.copy(place.mCenter).multiplyScalar(-1);
    holder.add(clone);
    holder.scale.setScalar(place.scale);
    holder.rotation.y = place.rotY;
    holder.position.copy(place.tCenter);

    const keep = group.userData?.flashMesh;
    for (const child of group.children) {
      if (child !== keep) child.visible = false;
    }
    group.add(holder);
    group.userData.glbOverride = entry.model;
    return true;
  } catch (err) {
    console.warn('[weaponAssetOverrides] override skipped:', err?.message || err);
    return false;
  }
}
