// Shared per-part player hitboxes (pure ES module, no imports: loaded by the Node server AND the browser client).
//
// ONE definition of the invisible hitbox proxies of the humanoid rig (public/js/humanoidRig.js):
//   - the client builds its `rp.hitboxParts` proxy meshes from HITBOX_PART_DEFS (sizes + offsets in the bone frame)
//     and keeps them attached to the animated bones, exactly as before;
//   - the server rebuilds the same oriented boxes from (posture, yaw, lean, pitch, foot position) with
//     getHitboxParts() and ray-casts them with raycastPlayerParts().
//
// Rig frame: origin = player's feet, +Y up, forward = -Z at yaw 0, right = +X. World yaw uses the same convention as
// the rig (`group.rotation.y = yaw`, forward = (-sin yaw, 0, -cos yaw)).
//
// The server does not know the cosmetic animation phase (gait swing, breathing, torso twist), so the shared boxes use
// the rig's REST pose for the networked inputs (posture, lean, aim pitch). Everything else is the same bone chain and
// the same formulas as `animateHumanoidRig`, so for a standing / crouching / prone player at rest the shared boxes
// coincide with the visible proxies (tests/hitboxes.test.mjs checks this against the real rig).

/**
 * The ONLY geometric tolerance of a part box (metres, added to every half extent). Lag / interpolation error is
 * handled by rewinding the target (shared/lagCompensation.js), never by inflating the boxes.
 */
export const PART_PADDING = 0.04;

/** Tolerance (metres, beyond PART_PADDING) used when mapping a claimed hit POINT to a part (shotgun pellets). */
export const POINT_ZONE_TOLERANCE = 0.1;

export const POSTURE = Object.freeze({
  STAND: 'stand',
  CROUCH: 'crouch',
  SLIDE: 'slide',
  PRONE: 'prone'
});

/** Damage zones. The multiplier itself lives in the weapon config (`headshotMult`) / handleShoot (leg = 0.78). */
export const ZONE = Object.freeze({ HEAD: 'head', BODY: 'body', LEG: 'leg' });

/**
 * Part table. `bone` is the rig node the (invisible) proxy is attached to, `size` the full box size and `offset` the
 * box centre in that bone's local frame. The rig has no separate arm proxies: both arms hang inside the 0.72 m wide
 * `torso` box, so a ray through an arm reports the torso (zone `body`).
 */
export const HITBOX_PART_DEFS = Object.freeze([
  Object.freeze({ id: 'head',    zone: 'head', bone: 'head',    size: Object.freeze([0.42, 0.48, 0.42]), offset: Object.freeze([0, 0.17, -0.01]) }),
  Object.freeze({ id: 'torso',   zone: 'body', bone: 'chest',   size: Object.freeze([0.72, 0.66, 0.52]), offset: Object.freeze([0, 0.31, -0.10]) }),
  Object.freeze({ id: 'pelvis',  zone: 'body', bone: 'pelvis',  size: Object.freeze([0.50, 0.26, 0.38]), offset: Object.freeze([0, 0, 0]) }),
  Object.freeze({ id: 'thigh_l', zone: 'leg',  bone: 'hip_l',   size: Object.freeze([0.26, 0.42, 0.26]), offset: Object.freeze([0, -0.19, 0]) }),
  Object.freeze({ id: 'thigh_r', zone: 'leg',  bone: 'hip_r',   size: Object.freeze([0.26, 0.42, 0.26]), offset: Object.freeze([0, -0.19, 0]) }),
  Object.freeze({ id: 'shin_l',  zone: 'leg',  bone: 'knee_l',  size: Object.freeze([0.22, 0.44, 0.28]), offset: Object.freeze([0, -0.21, -0.02]) }),
  Object.freeze({ id: 'shin_r',  zone: 'leg',  bone: 'knee_r',  size: Object.freeze([0.22, 0.44, 0.28]), offset: Object.freeze([0, -0.21, -0.02]) })
]);

export const HITBOX_PART_IDS = Object.freeze(HITBOX_PART_DEFS.map((d) => d.id));

/** Rig constants mirrored from humanoidRig.js (build) and animateHumanoidRig (pose formulas). */
export const RIG = Object.freeze({
  HIP_Y: 0.80,                 // pelvis / hip socket height standing
  HIP_X: 0.145,                // lateral hip socket offset
  CROUCH_HIP_DROP: 0.25,
  PRONE_HIP_DROP: 0.56,
  SPINE_Y: 0.10,               // upperBodyGroup above the pelvis
  LEAN_SHIFT: 0.18,            // upperBodyGroup.position.x = lean * LEAN_SHIFT
  LEAN_ROLL: 0.28,             // upperBodyGroup.rotation.z = -lean * LEAN_ROLL
  HEAD_Y: 0.64,                // headGroup above the chest
  KNEE_Y: -0.38,               // knee pivot below the hip
  TORSO_PITCH_CROUCH: -0.18,
  TORSO_PITCH_PRONE: -1.05,
  TORSO_PITCH_AIM: 0.25,
  HEAD_PITCH_CROUCH: 0.16,
  HEAD_PITCH_PRONE: 0.92,
  HEAD_PITCH_AIM: 0.45,
  HIP_FLEX_CROUCH: 0.56,
  HIP_FLEX_PRONE: -1.15,
  KNEE_FLEX_CROUCH: 0.96,
  KNEE_FLEX_PRONE: 0.18,
  // Idle (non-moving) leg offsets of the rig's resting pose
  REST_HIP_L: 0.04,
  REST_HIP_R: -0.05,
  REST_KNEE_L: 0.08,
  REST_KNEE_R: 0.06
});

// ---------------------------------------------------------------------------------------------------------------
// Small rigid-transform maths: {r: [m00 m01 m02 m10 m11 m12 m20 m21 m22] (row-major), t: [x, y, z]}
// ---------------------------------------------------------------------------------------------------------------

const IDENTITY_R = [1, 0, 0, 0, 1, 0, 0, 0, 1];

function mulR(a, b) {
  return [
    a[0] * b[0] + a[1] * b[3] + a[2] * b[6], a[0] * b[1] + a[1] * b[4] + a[2] * b[7], a[0] * b[2] + a[1] * b[5] + a[2] * b[8],
    a[3] * b[0] + a[4] * b[3] + a[5] * b[6], a[3] * b[1] + a[4] * b[4] + a[5] * b[7], a[3] * b[2] + a[4] * b[5] + a[5] * b[8],
    a[6] * b[0] + a[7] * b[3] + a[8] * b[6], a[6] * b[1] + a[7] * b[4] + a[8] * b[7], a[6] * b[2] + a[7] * b[5] + a[8] * b[8]
  ];
}

function applyR(r, v) {
  return [
    r[0] * v[0] + r[1] * v[1] + r[2] * v[2],
    r[3] * v[0] + r[4] * v[1] + r[5] * v[2],
    r[6] * v[0] + r[7] * v[1] + r[8] * v[2]
  ];
}

function applyRT(r, v) {
  return [
    r[0] * v[0] + r[3] * v[1] + r[6] * v[2],
    r[1] * v[0] + r[4] * v[1] + r[7] * v[2],
    r[2] * v[0] + r[5] * v[1] + r[8] * v[2]
  ];
}

const rotX = (a) => { const c = Math.cos(a), s = Math.sin(a); return [1, 0, 0, 0, c, -s, 0, s, c]; };
const rotY = (a) => { const c = Math.cos(a), s = Math.sin(a); return [c, 0, s, 0, 1, 0, -s, 0, c]; };
const rotZ = (a) => { const c = Math.cos(a), s = Math.sin(a); return [c, -s, 0, s, c, 0, 0, 0, 1]; };

const tf = (r, t) => ({ r, t });
const translate = (x, y, z) => tf(IDENTITY_R, [x, y, z]);
const rotation = (r) => tf(r, [0, 0, 0]);

function compose(a, b) {
  const bt = applyR(a.r, b.t);
  return { r: mulR(a.r, b.r), t: [bt[0] + a.t[0], bt[1] + a.t[1], bt[2] + a.t[2]] };
}

const finite = (v, fallback = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// ---------------------------------------------------------------------------------------------------------------
// Posture handling
// ---------------------------------------------------------------------------------------------------------------

/** Normalises a posture name; unknown values mean standing. Sliding uses the crouch pose (the rig has no slide pose). */
export function normalizePosture(posture) {
  if (posture === POSTURE.PRONE || posture === POSTURE.CROUCH || posture === POSTURE.SLIDE) return posture;
  return POSTURE.STAND;
}

/** Posture of a server / client player object (prone wins over slide wins over crouch). */
export function getPostureOf(player) {
  if (!player) return POSTURE.STAND;
  if (player.prone) return POSTURE.PRONE;
  if (player.sliding || player.isSliding) return POSTURE.SLIDE;
  if (player.crouching ?? player.crouch) return POSTURE.CROUCH;
  return POSTURE.STAND;
}

/**
 * Bone transforms (rig frame, yaw 0, origin at the feet) for the rest pose of a posture + lean + aim pitch.
 * Mirrors `animateHumanoidRig` with fully blended posture and idle legs.
 */
function computeBones(posture, lean, pitch) {
  const p = normalizePosture(posture);
  const pb = p === POSTURE.PRONE ? 1 : 0;
  const cb = p === POSTURE.CROUCH || p === POSTURE.SLIDE ? 1 : 0;
  const lb = clamp(finite(lean), -1, 1);
  const aim = clamp(finite(pitch), -Math.PI / 2, Math.PI / 2);

  const hipY = RIG.HIP_Y - cb * RIG.CROUCH_HIP_DROP - pb * RIG.PRONE_HIP_DROP;
  const pelvis = translate(0, hipY, 0);

  const torsoPitch = cb * RIG.TORSO_PITCH_CROUCH + pb * RIG.TORSO_PITCH_PRONE + aim * RIG.TORSO_PITCH_AIM;
  const torsoRoll = -lb * RIG.LEAN_ROLL;
  // three.js Euler 'XYZ' -> R = Rx * Ry * Rz (Ry = 0 here)
  const spine = compose(
    pelvis,
    compose(translate(lb * RIG.LEAN_SHIFT, RIG.SPINE_Y, 0), rotation(mulR(rotX(torsoPitch), rotZ(torsoRoll))))
  );
  const chest = spine;

  const headPitch = cb * RIG.HEAD_PITCH_CROUCH + pb * RIG.HEAD_PITCH_PRONE + aim * RIG.HEAD_PITCH_AIM;
  const head = compose(chest, compose(translate(0, RIG.HEAD_Y, 0), rotation(rotX(headPitch))));

  const hipFlex = cb * RIG.HIP_FLEX_CROUCH + pb * RIG.HIP_FLEX_PRONE;
  const kneeFlex = cb * RIG.KNEE_FLEX_CROUCH + pb * RIG.KNEE_FLEX_PRONE;
  const hipL = compose(translate(-RIG.HIP_X, hipY, 0), rotation(rotX(hipFlex + RIG.REST_HIP_L)));
  const hipR = compose(translate(RIG.HIP_X, hipY, 0), rotation(rotX(hipFlex + RIG.REST_HIP_R)));
  const kneeL = compose(hipL, compose(translate(0, RIG.KNEE_Y, 0), rotation(rotX(-(kneeFlex + RIG.REST_KNEE_L)))));
  const kneeR = compose(hipR, compose(translate(0, RIG.KNEE_Y, 0), rotation(rotX(-(kneeFlex + RIG.REST_KNEE_R)))));

  return { pelvis, chest, head, hip_l: hipL, hip_r: hipR, knee_l: kneeL, knee_r: kneeR };
}

/**
 * Part boxes in the player's local (feet) frame at yaw 0.
 * Returns [{ id, zone, size:[w,h,d], center:[x,y,z], rot:[9] }] in HITBOX_PART_DEFS order.
 */
export function getLocalHitboxParts(posture = POSTURE.STAND, lean = 0, pitch = 0) {
  const bones = computeBones(posture, lean, pitch);
  return HITBOX_PART_DEFS.map((def) => {
    const m = compose(bones[def.bone], translate(def.offset[0], def.offset[1], def.offset[2]));
    return { id: def.id, zone: def.zone, size: [def.size[0], def.size[1], def.size[2]], center: m.t, rot: m.r };
  });
}

/**
 * World-space oriented boxes of a player.
 * @param {string} posture 'stand' | 'crouch' | 'slide' | 'prone'
 * @param {number} yaw     view yaw (rig `group.rotation.y`)
 * @param {number} lean    -1..1 (Q/E)
 * @param {{x:number,y:number,z:number}} foot feet position (default origin)
 * @param {number} pitch   aim pitch in radians (tilts torso + head like the rig; default 0)
 * @returns {Array<{id:string, zone:string, size:number[], half:number[], center:{x:number,y:number,z:number}, rot:number[]}>}
 *   `rot` is the row-major world-from-local rotation of the box (columns = its world axes).
 */
export function getHitboxParts(posture = POSTURE.STAND, yaw = 0, lean = 0, foot = { x: 0, y: 0, z: 0 }, pitch = 0) {
  const fx = finite(foot?.x);
  const fy = finite(foot?.y);
  const fz = finite(foot?.z);
  const ry = rotY(finite(yaw));
  return getLocalHitboxParts(posture, lean, pitch).map((part) => {
    const c = applyR(ry, part.center);
    return {
      id: part.id,
      zone: part.zone,
      size: part.size,
      half: [part.size[0] * 0.5, part.size[1] * 0.5, part.size[2] * 0.5],
      center: { x: c[0] + fx, y: c[1] + fy, z: c[2] + fz },
      rot: mulR(ry, part.rot)
    };
  });
}

/** The 8 world-space corners of a box returned by getHitboxParts (optionally inflated by `pad`). */
export function getBoxCorners(box, pad = 0) {
  const hx = box.half[0] + pad;
  const hy = box.half[1] + pad;
  const hz = box.half[2] + pad;
  const corners = [];
  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const v = applyR(box.rot, [sx * hx, sy * hy, sz * hz]);
        corners.push({ x: v[0] + box.center.x, y: v[1] + box.center.y, z: v[2] + box.center.z });
      }
    }
  }
  return corners;
}

/** Axis-aligned world bounds {min:{x,y,z}, max:{x,y,z}} of a box. */
export function getBoxWorldAABB(box, pad = 0) {
  const min = { x: Infinity, y: Infinity, z: Infinity };
  const max = { x: -Infinity, y: -Infinity, z: -Infinity };
  for (const c of getBoxCorners(box, pad)) {
    min.x = Math.min(min.x, c.x); min.y = Math.min(min.y, c.y); min.z = Math.min(min.z, c.z);
    max.x = Math.max(max.x, c.x); max.y = Math.max(max.y, c.y); max.z = Math.max(max.z, c.z);
  }
  return { min, max };
}

function playerParts(player, opts) {
  const posture = opts?.posture ?? getPostureOf(player);
  const pitch = opts?.pitch ?? player.pitch ?? 0;
  const lean = opts?.lean ?? player.lean ?? 0;
  return getHitboxParts(posture, player.yaw ?? 0, lean, { x: player.x, y: player.y, z: player.z }, pitch);
}

const ZONE_PRIORITY = { head: 0, body: 1, leg: 2 };
const TIE_EPS = 1e-5;

/** Slab test of a ray against one oriented box. Returns the entry distance (0 if the origin is inside) or null. */
function rayVsBox(origin, dir, box, pad, maxRange) {
  const o = applyRT(box.rot, [origin.x - box.center.x, origin.y - box.center.y, origin.z - box.center.z]);
  const d = applyRT(box.rot, [dir.x, dir.y, dir.z]);
  let tMin = 0;
  let tMax = maxRange;
  for (let i = 0; i < 3; i++) {
    const h = box.half[i] + pad;
    if (Math.abs(d[i]) < 1e-9) {
      if (o[i] < -h || o[i] > h) return null;
    } else {
      const inv = 1 / d[i];
      let t1 = (-h - o[i]) * inv;
      let t2 = (h - o[i]) * inv;
      if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
      if (t1 > tMin) tMin = t1;
      if (t2 < tMax) tMax = t2;
      if (tMin > tMax) return null;
    }
  }
  return tMin;
}

/**
 * Ray vs the player's part boxes; the nearest part wins (a head box only wins when it is really hit first).
 * @param {{x:number,y:number,z:number}} origin
 * @param {{x:number,y:number,z:number}} dir  (normalised internally)
 * @param {object} player  { x, y, z (feet), yaw, pitch, lean, crouching/crouch, prone, sliding }
 * @param {number} maxRange
 * @param {{padding?:number, posture?:string, pitch?:number, lean?:number}} opts
 *        `padding` defaults to PART_PADDING (added to every half extent).
 * @returns {{distance:number, point:{x:number,y:number,z:number}, zone:'head'|'body'|'leg', partId:string}|null}
 */
export function raycastPlayerParts(origin, dir, player, maxRange = 200, opts = {}) {
  if (!origin || !dir || !player) return null;
  if (!Number.isFinite(dir.x) || !Number.isFinite(dir.y) || !Number.isFinite(dir.z)) return null;
  if (!Number.isFinite(origin.x) || !Number.isFinite(origin.y) || !Number.isFinite(origin.z)) return null;
  const len = Math.hypot(dir.x, dir.y, dir.z);
  if (!(len > 1e-9) || !Number.isFinite(len)) return null;
  const nd = { x: dir.x / len, y: dir.y / len, z: dir.z / len };
  const pad = Math.max(0, finite(opts?.padding, PART_PADDING));

  let best = null;
  for (const box of playerParts(player, opts)) {
    const t = rayVsBox(origin, nd, box, pad, maxRange);
    if (t === null || t < 0 || t > maxRange) continue;
    if (
      !best ||
      t < best.distance - TIE_EPS ||
      (Math.abs(t - best.distance) <= TIE_EPS && ZONE_PRIORITY[box.zone] < ZONE_PRIORITY[best.zone])
    ) {
      best = { distance: t, zone: box.zone, partId: box.id };
    }
  }
  if (!best) return null;
  best.point = {
    x: origin.x + nd.x * best.distance,
    y: origin.y + nd.y * best.distance,
    z: origin.z + nd.z * best.distance
  };
  return best;
}

/**
 * Maps a (claimed) world point to the part it belongs to: the part containing it (deepest first), otherwise the
 * nearest part within `tolerance` metres of its padded box. Used for shotgun pellets, whose individual ray directions
 * are unknown to the server.
 * @returns {{zone:string, partId:string, distance:number}|null}
 */
export function classifyPointZone(point, player, opts = {}) {
  if (!point || !player) return null;
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y) || !Number.isFinite(point.z)) return null;
  const pad = Math.max(0, finite(opts?.padding, PART_PADDING));
  const tolerance = Math.max(0, finite(opts?.tolerance, POINT_ZONE_TOLERANCE));

  let best = null;
  for (const box of playerParts(player, opts)) {
    const p = applyRT(box.rot, [point.x - box.center.x, point.y - box.center.y, point.z - box.center.z]);
    let outside = 0;
    let depth = Infinity;
    for (let i = 0; i < 3; i++) {
      const h = box.half[i] + pad;
      const over = Math.abs(p[i]) - h;
      if (over > 0) outside += over * over;
      depth = Math.min(depth, -over);
    }
    const dist = Math.sqrt(outside);
    if (dist > tolerance) continue;
    // Containing parts rank by penetration depth (larger = more inside); outside parts rank behind them by distance.
    const score = dist === 0 ? depth : -dist;
    if (!best || score > best.score) best = { zone: box.zone, partId: box.id, distance: dist, score };
  }
  if (!best) return null;
  return { zone: best.zone, partId: best.partId, distance: best.distance };
}
