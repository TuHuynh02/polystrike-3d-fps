import * as THREE from '../three.js';

// Bevelled box for the procedural weapons: a sharp BoxGeometry edge never catches a specular highlight, so guns read as
// flat blocks; a small rounded edge does. Same vertex-pushing idea as three's RoundedBoxGeometry (examples/jsm), kept local
// so no `three/addons` import is needed (headless Node tests / CI hooks only resolve the vendored three build).
// segments = 1 -> 3x3 quads per face (108 triangles): cheap enough to keep on every tier.

const _pos = new THREE.Vector3();
const _normal = new THREE.Vector3();
const _box = new THREE.Vector3();

const MAX_RADIUS = 0.008;
const MIN_RADIUS = 0.0012;

/**
 * Box of `width x height x depth` with rounded edges. `radius` defaults to 30 % of the thinnest side (max 8 mm); parts too
 * thin to bevel (< ~4 mm: reticle bars, hood plates) fall back to a plain BoxGeometry.
 */
export function roundedBox(width, height, depth, radius = null, segments = 1) {
  const minDim = Math.min(width, height, depth);
  const r = Math.min(radius ?? Math.min(MAX_RADIUS, minDim * 0.3), minDim / 2);
  if (!(r >= MIN_RADIUS)) return new THREE.BoxGeometry(width, height, depth);

  const div = segments * 2 + 1;
  const base = new THREE.BoxGeometry(1, 1, 1, div, div, div);
  const geo = base.toNonIndexed();
  base.dispose();

  const positions = geo.attributes.position.array;
  const normals = geo.attributes.normal.array;
  const half = 0.5 / div;
  _box.set(width / 2 - r, height / 2 - r, depth / 2 - r);

  for (let i = 0; i < positions.length; i += 3) {
    _pos.fromArray(positions, i);
    _normal.set(
      _pos.x - Math.sign(_pos.x) * half,
      _pos.y - Math.sign(_pos.y) * half,
      _pos.z - Math.sign(_pos.z) * half
    ).normalize();
    positions[i] = _box.x * Math.sign(_pos.x) + _normal.x * r;
    positions[i + 1] = _box.y * Math.sign(_pos.y) + _normal.y * r;
    positions[i + 2] = _box.z * Math.sign(_pos.z) + _normal.z * r;
    normals[i] = _normal.x;
    normals[i + 1] = _normal.y;
    normals[i + 2] = _normal.z;
  }

  // Distinct type + parameters: the rig dedupes weapon geometry by `${type}_${JSON(parameters)}`
  geo.type = 'RoundedBoxGeometry';
  geo.parameters = { width, height, depth, radius: r, segments };
  geo.computeBoundingBox();
  geo.computeBoundingSphere();
  return geo;
}
