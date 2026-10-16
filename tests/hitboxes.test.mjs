/**
 * Shared per-part hitboxes (shared/hitboxes.js): one definition used by the client's invisible proxy meshes
 * (public/js/humanoidRig.js) and by the server's shot verification (raycastPlayerHitbox / handleShoot).
 */

import './helpers/headless-game3d.mjs'; // installs the DOM / WebGL mocks + ESM hooks needed to import the rig headlessly
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { WEAPONS, getMapConfig, hasLineOfSight } from '../shared/constants.js';
import {
  HITBOX_PART_DEFS,
  HITBOX_PART_IDS,
  PART_PADDING,
  classifyPointZone,
  getBoxCorners,
  getBoxWorldAABB,
  getHitboxParts,
  getPostureOf,
  raycastPlayerParts
} from '../shared/hitboxes.js';
import {
  raycastPlayerHitbox,
  recordPlayerSnapshot,
  resolveShotRewindMs
} from '../shared/lagCompensation.js';
import { RoomManager } from '../server/roomManager.js';

const THREE = await import('three');
const { createRemotePlayerMesh, animateHumanoidRig } = await import('../public/js/humanoidRig.js');

const EPS = 1e-6;
const near = (a, b, tol = EPS, msg = '') => assert.ok(Math.abs(a - b) <= tol, `${msg} expected ${b}, got ${a}`);
const norm = (x, y, z) => {
  const l = Math.hypot(x, y, z);
  return { x: x / l, y: y / l, z: z / l };
};
const fwd = (yaw) => ({ x: -Math.sin(yaw), z: -Math.cos(yaw) });
const alive = (extra = {}) => ({ alive: true, x: 0, y: 0, z: 0, yaw: 0, pitch: 0, lean: 0, ...extra });
const part = (parts, id) => parts.find((p) => p.id === id);

/** Fires a horizontal ray along `dir` that passes through world point `p` from `dist` metres away. */
function rayThrough(p, dir, dist = 10) {
  const d = norm(dir.x, dir.y, dir.z);
  return { origin: { x: p.x - d.x * dist, y: p.y - d.y * dist, z: p.z - d.z * dist }, dir: d };
}

describe('Shared hitbox definition: part geometry', () => {
  it('defines head / torso / pelvis / two thighs / two shins with one damage zone each', () => {
    assert.deepEqual([...HITBOX_PART_IDS], ['head', 'torso', 'pelvis', 'thigh_l', 'thigh_r', 'shin_l', 'shin_r']);
    const zones = Object.fromEntries(HITBOX_PART_DEFS.map((d) => [d.id, d.zone]));
    assert.deepEqual(zones, {
      head: 'head', torso: 'body', pelvis: 'body', thigh_l: 'leg', thigh_r: 'leg', shin_l: 'leg', shin_r: 'leg'
    });
    assert.ok(PART_PADDING > 0 && PART_PADDING <= 0.06, 'PART_PADDING must stay a small tolerance');
    assert.ok(Object.isFrozen(HITBOX_PART_DEFS));
  });

  it('stands ~1.95 m tall (helmet) with the head box in the upper 0.48 m and legs below the pelvis', () => {
    const parts = getHitboxParts('stand', 0, 0, { x: 0, y: 0, z: 0 });
    const head = getBoxWorldAABB(part(parts, 'head'));
    near(head.min.y, 1.47, 0.005, 'head bottom');
    near(head.max.y, 1.95, 0.005, 'head top');
    const torso = getBoxWorldAABB(part(parts, 'torso'));
    near(torso.min.y, 0.88, 0.005, 'torso bottom');
    near(torso.max.y, 1.54, 0.005, 'torso top');
    const pelvis = getBoxWorldAABB(part(parts, 'pelvis'));
    near(pelvis.min.y, 0.67, 0.005, 'pelvis bottom');
    for (const id of ['thigh_l', 'thigh_r', 'shin_l', 'shin_r']) {
      assert.ok(getBoxWorldAABB(part(parts, id)).max.y <= 0.83, `${id} must sit below the hips`);
    }
    // Feet: the lowest box reaches the floor (the rig's boots end at y ~ 0)
    const lowest = Math.min(...parts.map((p) => getBoxWorldAABB(p).min.y));
    assert.ok(lowest > -0.05 && lowest < 0.02, `standing boxes should end at the floor, got ${lowest}`);
  });

  it('crouch is lower than stand, prone is lower than crouch, slide uses the crouch pose', () => {
    const top = (posture) =>
      Math.max(...getHitboxParts(posture, 0, 0, { x: 0, y: 0, z: 0 }).map((p) => getBoxWorldAABB(p).max.y));
    const stand = top('stand');
    const crouch = top('crouch');
    const prone = top('prone');
    assert.ok(stand > crouch + 0.2, `crouch top ${crouch} vs stand ${stand}`);
    assert.ok(crouch > prone + 0.4, `prone top ${prone} vs crouch ${crouch}`);
    near(crouch, 1.694, 0.01, 'crouch helmet top');
    assert.ok(prone < 1.15, `prone top ${prone}`);

    const a = getHitboxParts('crouch', 0.7, 0.3, { x: 1, y: 2, z: 3 });
    const b = getHitboxParts('slide', 0.7, 0.3, { x: 1, y: 2, z: 3 });
    assert.deepEqual(b, a);
    assert.equal(getPostureOf({ prone: true, crouching: true }), 'prone');
    assert.equal(getPostureOf({ crouching: true }), 'crouch');
    assert.equal(getPostureOf({ crouch: true }), 'crouch');
    assert.equal(getPostureOf({ crouching: true, sliding: true }), 'slide');
    assert.equal(getPostureOf({}), 'stand');
  });

  it('prone lies along the facing direction (long in Z at yaw 0) while standing is compact', () => {
    const extent = (posture, axis) => {
      const boxes = getHitboxParts(posture, 0, 0, { x: 0, y: 0, z: 0 }).map((p) => getBoxWorldAABB(p));
      return Math.max(...boxes.map((a) => a.max[axis])) - Math.min(...boxes.map((a) => a.min[axis]));
    };
    assert.ok(extent('prone', 'z') > 1.5, `prone length ${extent('prone', 'z')}`);
    assert.ok(extent('stand', 'z') < 0.8, `standing depth ${extent('stand', 'z')}`);
  });

  it('translates with the foot position and rotates with yaw (forward = -Z at yaw 0, -sin/-cos in general)', () => {
    const at0 = getHitboxParts('stand', 0, 0, { x: 0, y: 0, z: 0 });
    const moved = getHitboxParts('stand', 0, 0, { x: 5, y: 2, z: -7 });
    for (let i = 0; i < at0.length; i++) {
      near(moved[i].center.x, at0[i].center.x + 5, EPS);
      near(moved[i].center.y, at0[i].center.y + 2, EPS);
      near(moved[i].center.z, at0[i].center.z - 7, EPS);
    }
    // The torso box is shifted 0.10 m towards the front of the rig
    for (const yaw of [0, 0.6, Math.PI / 2, 2.4, -1.3, Math.PI]) {
      const torso = part(getHitboxParts('stand', yaw, 0, { x: 0, y: 0, z: 0 }), 'torso');
      const f = fwd(yaw);
      near(torso.center.x, f.x * 0.10, 1e-9, `yaw ${yaw}`);
      near(torso.center.z, f.z * 0.10, 1e-9, `yaw ${yaw}`);
      near(torso.center.y, 1.21, 1e-9);
    }
  });

  it('leans the upper body sideways (right = +X at yaw 0) and mirrors for negative lean; legs stay put', () => {
    const base = getHitboxParts('stand', 0, 0, { x: 0, y: 0, z: 0 });
    const right = getHitboxParts('stand', 0, 1, { x: 0, y: 0, z: 0 });
    const left = getHitboxParts('stand', 0, -1, { x: 0, y: 0, z: 0 });
    for (const id of ['torso', 'head']) {
      const dxR = part(right, id).center.x - part(base, id).center.x;
      const dxL = part(left, id).center.x - part(base, id).center.x;
      assert.ok(dxR > 0.15, `${id} lean right shift ${dxR}`);
      near(dxL, -dxR, 1e-9, `${id} mirrored`);
    }
    for (const id of ['pelvis', 'thigh_l', 'shin_r']) {
      near(part(right, id).center.x, part(base, id).center.x, EPS, `${id} unaffected by lean`);
    }
    // Yawed 90 degrees, "right" is world -Z
    const right90 = getHitboxParts('stand', Math.PI / 2, 1, { x: 0, y: 0, z: 0 });
    const base90 = getHitboxParts('stand', Math.PI / 2, 0, { x: 0, y: 0, z: 0 });
    assert.ok(part(right90, 'torso').center.z - part(base90, 'torso').center.z < -0.15);
  });

  it('aim pitch tilts the head box like the rig does (looking up moves the head back)', () => {
    const level = part(getHitboxParts('stand', 0, 0, { x: 0, y: 0, z: 0 }, 0), 'head');
    const up = part(getHitboxParts('stand', 0, 0, { x: 0, y: 0, z: 0 }, 1.0), 'head');
    assert.ok(up.center.z > level.center.z + 0.03, 'head must tilt back when looking up');
  });
});

describe('Shared hitbox ray casting', () => {
  const foot = { x: 3, y: 1, z: -4 };
  const shooterSides = [0, Math.PI / 2, Math.PI, -Math.PI / 2]; // directions the shot travels, relative to the target

  it('hits the head, torso, pelvis, thigh and shin from several angles and distances', () => {
    const cases = [
      { id: 'head', zone: 'head' },
      { id: 'torso', zone: 'body' },
      { id: 'pelvis', zone: 'body' },
      { id: 'thigh_l', zone: 'leg' },
      { id: 'thigh_r', zone: 'leg' },
      { id: 'shin_l', zone: 'leg' },
      { id: 'shin_r', zone: 'leg' }
    ];
    const player = alive({ ...foot, yaw: 0.4 });
    const boxes = getHitboxParts('stand', 0.4, 0, foot);
    for (const c of cases) {
      for (const side of shooterSides) {
        for (const dist of [2, 15, 60]) {
          // Horizontal shot through the part's centre; the part is hit first when nothing sits in front of it
          const center = part(boxes, c.id).center;
          const dir = { x: Math.sin(side + 0.4), y: 0, z: Math.cos(side + 0.4) };
          const { origin, dir: nd } = rayThrough(center, dir, dist);
          const hit = raycastPlayerParts(origin, nd, player, 200);
          assert.ok(hit, `${c.id} side ${side} dist ${dist}: no hit`);
          // An outer part (e.g. the other leg) may legitimately be nearer from the side, but the zone family must match
          // for torso/head and the hit must be in front of the aimed centre.
          assert.ok(hit.distance <= dist + 1e-6, `${c.id}: hit behind the aim point`);
          if (c.id === 'head' || c.id === 'torso') {
            assert.equal(hit.partId === 'head' || hit.partId === 'torso', true);
          }
        }
      }
    }
  });

  it('reports the exact part and zone for unobstructed shots', () => {
    const player = alive({ x: 0, y: 0, z: 0, yaw: 0 });
    const shoot = (y, from = { x: 0, z: 20 }, dirX = 0, dirZ = -1) =>
      raycastPlayerParts({ x: from.x, y, z: from.z }, { x: dirX, y: 0, z: dirZ }, player, 100);

    // From the front (shooter at +Z? no: the rig faces -Z, so a shooter in FRONT stands at z < 0 and shoots +Z)
    const front = (y) => raycastPlayerParts({ x: 0, y, z: -20 }, { x: 0, y: 0, z: 1 }, player, 100);
    assert.deepEqual([front(1.80).partId, front(1.80).zone], ['head', 'head']);
    assert.deepEqual([front(1.20).partId, front(1.20).zone], ['torso', 'body']);
    assert.deepEqual([front(0.80).partId, front(0.80).zone], ['pelvis', 'body']);
    // The leg gap (x ~ 0) lets a centred front shot pass the legs; aim at the left/right leg instead
    const frontLeg = (x, y) => raycastPlayerParts({ x, y, z: -20 }, { x: 0, y: 0, z: 1 }, player, 100);
    assert.equal(frontLeg(-0.15, 0.60).zone, 'leg');
    assert.equal(frontLeg(0.15, 0.60).partId, 'thigh_r');
    assert.equal(frontLeg(0.15, 0.20).partId, 'shin_r');
    assert.equal(frontLeg(-0.15, 0.20).partId, 'shin_l');
    // From behind
    assert.equal(shoot(1.80).partId, 'head');
    assert.equal(shoot(1.20).partId, 'torso');
    assert.equal(shoot(0.30, { x: 0.15, z: 20 }).zone, 'leg');

    const hit = front(1.80);
    near(hit.point.z, -0.22 - PART_PADDING, 1e-9, 'entry point on the padded head front face');
    near(hit.distance, 20 - 0.22 - PART_PADDING, 1e-9);
  });

  it('misses just outside a box by more than PART_PADDING and hits just inside it', () => {
    const player = alive();
    const m = 0.005;
    // Head (y = 1.80 is above the torso), shot travelling along +Z: lateral extent is half-width 0.21 + padding
    const lateral = (x) => raycastPlayerParts({ x, y: 1.8, z: -10 }, { x: 0, y: 0, z: 1 }, player, 100);
    assert.ok(lateral(0.21 + PART_PADDING - m), 'just inside the padded head width must hit');
    assert.equal(lateral(0.21 + PART_PADDING + m), null, 'just outside the padded head width must miss');
    assert.ok(lateral(-(0.21 + PART_PADDING - m)));
    assert.equal(lateral(-(0.21 + PART_PADDING + m)), null);

    // Top of the helmet (1.95 m)
    const vertical = (y) => raycastPlayerParts({ x: 0, y, z: -10 }, { x: 0, y: 0, z: 1 }, player, 100);
    assert.ok(vertical(1.95 + PART_PADDING - m));
    assert.equal(vertical(1.95 + PART_PADDING + m), null);

    // Thigh side at x = 0.28 (hip 0.145 + half-width 0.13)
    const thighSide = (x) => raycastPlayerParts({ x, y: 0.62, z: -10 }, { x: 0, y: 0, z: 1 }, player, 100);
    assert.ok(thighSide(0.28 + PART_PADDING - m));
    assert.equal(thighSide(0.28 + PART_PADDING + m), null);

    // No padding at all -> the bare box
    const bare = (x) => raycastPlayerParts({ x, y: 1.8, z: -10 }, { x: 0, y: 0, z: 1 }, player, 100, { padding: 0 });
    assert.ok(bare(0.21 - m));
    assert.equal(bare(0.21 + m), null);
  });

  it('nearest part wins: a shot through the arm is a torso hit, head only wins when it is really hit first', () => {
    const player = alive();
    // Through the arm (x = +-0.3 is inside the 0.72 m wide torso box, no separate arm box exists)
    const arm = raycastPlayerParts({ x: 6, y: 1.25, z: -0.1 }, { x: -1, y: 0, z: 0 }, player, 100);
    assert.deepEqual([arm.partId, arm.zone], ['torso', 'body']);
    near(arm.distance, 6 - 0.36 - PART_PADDING, 1e-9);

    // y = 1.50 lies in both the head box (1.47..1.95) and the torso box (..1.54):
    // from the front the torso's front face (z=-0.36) is nearer than the head's (z=-0.22) -> body
    const fromFront = raycastPlayerParts({ x: 0, y: 1.5, z: -10 }, { x: 0, y: 0, z: 1 }, player, 100);
    assert.deepEqual([fromFront.partId, fromFront.zone], ['torso', 'body']);
    // from behind the head's back face (z=+0.20) is nearer than the torso's (z=+0.16) -> head
    const fromBehind = raycastPlayerParts({ x: 0, y: 1.5, z: 10 }, { x: 0, y: 0, z: -1 }, player, 100);
    assert.deepEqual([fromBehind.partId, fromBehind.zone], ['head', 'head']);

    // A steep downward shot at the shoulders from above/behind hits the head first, the same shot from below the chin does not
    const high = raycastPlayerParts({ x: 0, y: 3, z: 3 }, norm(0, -1.5, -3), player, 100);
    assert.equal(high.zone, 'head');
  });

  it('is yaw correct: a shooter in front of / beside the target hits the matching face of the head box', () => {
    for (const yaw of [0, 0.5, 1.2, Math.PI / 2, 2.6, Math.PI, -0.8, -2.2]) {
      const player = alive({ x: 4, y: 0.5, z: -3, yaw });
      const f = fwd(yaw);
      const headY = 0.5 + 1.71;
      // Shooter 6 m in front of the face, shooting back at the target
      const front = raycastPlayerParts(
        { x: 4 + f.x * 6, y: headY, z: -3 + f.z * 6 }, { x: -f.x, y: 0, z: -f.z }, player, 100
      );
      assert.equal(front.partId, 'head', `yaw ${yaw}`);
      near(front.distance, 6 - (0.22 + PART_PADDING), 1e-9, `front face at yaw ${yaw}`);

      // Shooter behind the head: the back face is at +0.20 (+ padding) towards the rear
      const back = raycastPlayerParts(
        { x: 4 - f.x * 6, y: headY, z: -3 - f.z * 6 }, { x: f.x, y: 0, z: f.z }, player, 100
      );
      assert.equal(back.partId, 'head');
      near(back.distance, 6 - (0.20 + PART_PADDING), 1e-9, `back face at yaw ${yaw}`);

      // Shooter on the target's right (rig +X = (cos yaw, -sin yaw)): the side face is at 0.21 + padding
      const rx = Math.cos(yaw);
      const rz = -Math.sin(yaw);
      const side = raycastPlayerParts(
        { x: 4 + rx * 6, y: headY, z: -3 + rz * 6 }, { x: -rx, y: 0, z: -rz }, player, 100
      );
      assert.equal(side.partId, 'head');
      near(side.distance, 6 - (0.21 + PART_PADDING), 1e-9, `right face at yaw ${yaw}`);
    }
  });

  it('uses the right height / footprint for crouching and prone targets', () => {
    const crouched = alive({ crouching: true });
    const prone = alive({ prone: true });
    const standing = alive();
    const shot = (player, y, z = -10) => raycastPlayerParts({ x: 0, y, z }, { x: 0, y: 0, z: 1 }, player, 100);

    assert.ok(shot(standing, 1.85), 'standing helmet reaches 1.85 m');
    assert.equal(shot(crouched, 1.85), null, 'crouching target is lower than 1.85 m');
    assert.ok(shot(crouched, 1.55), 'crouching head is around 1.2 .. 1.7 m');
    assert.equal(shot(prone, 1.45), null, 'prone target is below 1.2 m');
    assert.ok(shot(prone, 0.4), 'prone body is around 0.0 .. 0.8 m');
    assert.equal(shot(standing, 0.4)?.zone === 'body', false, 'standing: 0.4 m is a leg (or miss), not a torso hit');

    // Prone is long: a shot from the side hits the stretched body ~0.7 m in front of the origin
    const proneSide = raycastPlayerParts({ x: 10, y: 0.5, z: -0.6 }, { x: -1, y: 0, z: 0 }, prone, 100);
    assert.ok(proneSide, 'prone torso extends forwards along -Z');
    // The same line (0.6 m in front of a standing player, at knee height) passes the narrow standing legs
    assert.equal(raycastPlayerParts({ x: 10, y: 0.5, z: -0.6 }, { x: -1, y: 0, z: 0 }, standing, 100), null);
  });

  it('ignores invalid input, honours maxRange and origin inside a box', () => {
    const player = alive();
    assert.equal(raycastPlayerParts(null, { x: 0, y: 0, z: 1 }, player), null);
    assert.equal(raycastPlayerParts({ x: 0, y: 1, z: -5 }, { x: 0, y: 0, z: 0 }, player), null);
    assert.equal(raycastPlayerParts({ x: 0, y: 1, z: -5 }, { x: NaN, y: 0, z: 1 }, player), null);
    assert.equal(raycastPlayerParts({ x: 0, y: 1.8, z: -5 }, { x: 0, y: 0, z: 1 }, player, 4), null, 'beyond maxRange');
    const inside = raycastPlayerParts({ x: 0, y: 1.8, z: 0 }, { x: 0, y: 0, z: 1 }, player, 100);
    assert.equal(inside.distance, 0);
    assert.equal(inside.zone, 'head');
    // Non-normalised direction is accepted
    const scaled = raycastPlayerParts({ x: 0, y: 1.8, z: -10 }, { x: 0, y: 0, z: 25 }, player, 100);
    near(scaled.distance, 10 - 0.22 - PART_PADDING, 1e-9);
  });

  it('classifyPointZone maps a claimed point to the part it lies in or next to, within a tolerance', () => {
    const player = alive({ x: 2, y: 0, z: 2, yaw: 0.9 });
    const boxes = getHitboxParts('stand', 0.9, 0, { x: 2, y: 0, z: 2 });
    assert.equal(classifyPointZone(part(boxes, 'head').center, player).zone, 'head');
    assert.equal(classifyPointZone(part(boxes, 'torso').center, player).zone, 'body');
    assert.equal(classifyPointZone(part(boxes, 'thigh_l').center, player).zone, 'leg');
    assert.equal(classifyPointZone(part(boxes, 'shin_r').center, player).partId, 'shin_r');
    // 5 cm above the helmet is within the tolerance (still head), a metre away is nothing
    const top = { ...part(boxes, 'head').center, y: 1.95 + PART_PADDING + 0.05 };
    assert.equal(classifyPointZone(top, player).zone, 'head');
    assert.equal(classifyPointZone({ x: 10, y: 1, z: 10 }, player), null);
    assert.equal(classifyPointZone({ x: NaN, y: 1, z: 1 }, player), null);
  });
});

describe('raycastPlayerHitbox (server entry point) keeps its contract on top of the part boxes', () => {
  it('returns { distance, hitPoint, isHeadshot, isLegshot, zone, partId } and ignores dead players', () => {
    const player = alive({ x: 0, y: 0, z: 0 });
    const head = raycastPlayerHitbox({ x: 0, y: 1.8, z: -10 }, { x: 0, y: 0, z: 1 }, player, 100);
    assert.deepEqual(
      { h: head.isHeadshot, l: head.isLegshot, zone: head.zone, partId: head.partId },
      { h: true, l: false, zone: 'head', partId: 'head' }
    );
    near(head.hitPoint.z, -0.22 - PART_PADDING, 1e-9);
    assert.ok(Math.abs(head.distance - (10 - 0.22 - PART_PADDING)) < 1e-9);

    const leg = raycastPlayerHitbox({ x: 0.15, y: 0.3, z: -10 }, { x: 0, y: 0, z: 1 }, player, 100);
    assert.deepEqual({ h: leg.isHeadshot, l: leg.isLegshot, zone: leg.zone }, { h: false, l: true, zone: 'leg' });
    const body = raycastPlayerHitbox({ x: 0, y: 1.2, z: -10 }, { x: 0, y: 0, z: 1 }, player, 100);
    assert.deepEqual({ h: body.isHeadshot, l: body.isLegshot, zone: body.zone }, { h: false, l: false, zone: 'body' });

    assert.equal(raycastPlayerHitbox({ x: 0, y: 1.8, z: -10 }, { x: 0, y: 0, z: 1 }, { ...player, alive: false }), null);
    assert.equal(raycastPlayerHitbox({ x: 0, y: 1.8, z: -10 }, { x: 0, y: 0, z: 0 }, player), null);
  });

  it('radiusPadding is extra box inflation (shotgun spread), default is PART_PADDING', () => {
    const player = alive();
    const o = { x: 0.7, y: 1.8, z: -10 }; // 0.7 m beside the head
    const d = { x: 0, y: 0, z: 1 };
    assert.equal(raycastPlayerHitbox(o, d, player, 100), null);
    assert.equal(raycastPlayerHitbox(o, d, player, 100, 0.3), null);
    assert.ok(raycastPlayerHitbox(o, d, player, 100, 0.5));
  });
});

describe('Client proxy meshes are built from the shared definition', () => {
  /** Settles the rig into the rest pose of the given networked state (blends/lerps converge with a large dt). */
  function settledRig({ crouching = false, prone = false, lean = 0, pitch = 0, yaw = 0, pos = { x: 1.5, y: 0.25, z: -2 } }) {
    const rp = createRemotePlayerMesh({ id: 'p1', name: 'Parity', x: pos.x, y: pos.y, z: pos.z });
    rp.group.position.set(pos.x, pos.y, pos.z);
    rp.group.rotation.y = yaw;
    rp.crouching = crouching;
    rp.prone = prone;
    rp.lean = lean;
    rp.targetPitch = pitch;
    for (let i = 0; i < 140; i++) animateHumanoidRig(rp, 0.1, 0, false, 0);
    rp.group.updateMatrixWorld(true);
    return rp;
  }

  function proxyCorners(mesh) {
    const { width, height, depth } = mesh.geometry.parameters;
    const out = [];
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
      const v = new THREE.Vector3(sx * width / 2, sy * height / 2, sz * depth / 2).applyMatrix4(mesh.matrixWorld);
      out.push({ x: v.x, y: v.y, z: v.z });
    }
    return out;
  }

  function maxDeviation(rp, posture, yaw, lean, pitch, pos) {
    const shared = getHitboxParts(posture, yaw, lean, pos, pitch);
    let worst = 0;
    for (const mesh of rp.hitboxParts) {
      const box = part(shared, mesh.userData.partId);
      assert.ok(box, `no shared box for ${mesh.userData.partId}`);
      assert.equal(box.zone, mesh.userData.zone);
      // 1) centre
      const c = new THREE.Vector3().setFromMatrixPosition(mesh.matrixWorld);
      worst = Math.max(worst, Math.hypot(c.x - box.center.x, c.y - box.center.y, c.z - box.center.z));
      // 2) every proxy corner coincides with some shared corner
      const sharedCorners = getBoxCorners(box);
      for (const pc of proxyCorners(mesh)) {
        const d = Math.min(...sharedCorners.map((sc) => Math.hypot(pc.x - sc.x, pc.y - sc.y, pc.z - sc.z)));
        worst = Math.max(worst, d);
      }
      // 3) world AABBs
      const aabb = getBoxWorldAABB(box);
      const pcs = proxyCorners(mesh);
      for (const axis of ['x', 'y', 'z']) {
        worst = Math.max(
          worst,
          Math.abs(Math.min(...pcs.map((p) => p[axis])) - aabb.min[axis]),
          Math.abs(Math.max(...pcs.map((p) => p[axis])) - aabb.max[axis])
        );
      }
    }
    return worst;
  }

  it('keeps the proxy contract (hitboxParts, userData.playerId / isHeadshot / zone, bone attachment)', () => {
    const rp = createRemotePlayerMesh({ id: 'p_contract', name: 'C' });
    assert.equal(rp.hitboxParts.length, HITBOX_PART_DEFS.length);
    assert.deepEqual(rp.hitboxParts.map((m) => m.userData.partId), [...HITBOX_PART_IDS]);
    for (const mesh of rp.hitboxParts) {
      assert.equal(mesh.userData.playerId, 'p_contract');
      assert.equal(mesh.userData.isHitboxProxy, true);
      assert.equal(mesh.userData.isHeadshot, mesh.userData.zone === 'head');
      assert.ok(['head', 'body', 'leg'].includes(mesh.userData.zone));
      assert.ok(mesh.geometry.boundingBox && mesh.geometry.boundingSphere);
    }
    assert.equal(rp.headHitboxProxy.parent, rp.headGroup);
    assert.equal(rp.torsoHitboxProxy.parent, rp.chest);
    assert.equal(rp.pelvisHitboxProxy.parent, rp.pelvisGroup);
    assert.equal(rp.leftLegHitboxProxy.parent, rp.leftLeg);
    assert.equal(rp.rightLegHitboxProxy.parent, rp.rightLeg);
    assert.equal(rp.leftShinHitboxProxy.parent, rp.leftShin);
    assert.equal(rp.rightShinHitboxProxy.parent, rp.rightShin);
    // sizes come from the shared table
    for (const def of HITBOX_PART_DEFS) {
      const mesh = rp.hitboxParts.find((m) => m.userData.partId === def.id);
      assert.deepEqual(
        [mesh.geometry.parameters.width, mesh.geometry.parameters.height, mesh.geometry.parameters.depth],
        [...def.size]
      );
      assert.deepEqual(mesh.position.toArray(), [...def.offset]);
    }
  });

  for (const [label, state, posture] of [
    ['standing', {}, 'stand'],
    ['crouching', { crouching: true }, 'crouch'],
    ['prone', { prone: true }, 'prone'],
    ['crouching + prone flag (prone wins)', { crouching: true, prone: true }, 'prone']
  ]) {
    for (const yaw of [0, 1.1, -2.4]) {
      it(`proxy world boxes equal the shared boxes within 2 cm: ${label}, yaw ${yaw}`, () => {
        const pos = { x: 1.5, y: 0.25, z: -2 };
        const rp = settledRig({ ...state, yaw, pos });
        const dev = maxDeviation(rp, posture, yaw, 0, 0, pos);
        assert.ok(dev < 0.02, `max deviation ${(dev * 100).toFixed(2)} cm`);
      });
    }
  }

  it('also matches while leaning and looking up / down', () => {
    const pos = { x: -3, y: 0, z: 4 };
    for (const [state, posture] of [[{}, 'stand'], [{ crouching: true }, 'crouch'], [{ prone: true }, 'prone']]) {
      for (const lean of [-1, 0.6]) {
        for (const pitch of [-0.8, 0.5]) {
          const rp = settledRig({ ...state, lean, pitch, yaw: 0.7, pos });
          const dev = maxDeviation(rp, posture, 0.7, lean, pitch, pos);
          assert.ok(dev < 0.02, `${posture} lean ${lean} pitch ${pitch}: ${(dev * 100).toFixed(2)} cm`);
        }
      }
    }
  });

  it('a three.js ray against the proxies and the shared ray cast agree (same part, same distance)', () => {
    const pos = { x: 0, y: 0, z: 0 };
    for (const [state, posture] of [[{}, 'stand'], [{ crouching: true }, 'crouch'], [{ prone: true }, 'prone']]) {
      const rp = settledRig({ ...state, yaw: 0.3, pos });
      const player = alive({ ...pos, yaw: 0.3, crouching: Boolean(state.crouching), prone: Boolean(state.prone) });
      const raycaster = new THREE.Raycaster();
      let compared = 0;
      let ambiguous = 0;
      for (let ix = -4; ix <= 4; ix++) {
        for (let iy = 0; iy <= 12; iy++) {
          const origin = { x: 6, y: 0.113 + iy * 0.157, z: ix * 0.173 };
          const dir = norm(-1, 0.02 * ix, 0.01);
          raycaster.set(new THREE.Vector3(origin.x, origin.y, origin.z), new THREE.Vector3(dir.x, dir.y, dir.z));
          raycaster.far = 100;
          const hits = raycaster.intersectObjects(rp.hitboxParts, false);
          const mine = raycastPlayerParts(origin, dir, player, 100, { padding: 0 });
          if (!hits.length) {
            assert.equal(mine, null, `${posture} (${origin.y.toFixed(2)}, ${origin.z.toFixed(2)}): shared hit but client miss`);
            continue;
          }
          assert.ok(mine, `${posture}: client hit but shared miss`);
          near(mine.distance, hits[0].distance, 0.04, `${posture} distance (grazing rays amplify cm-level pose noise)`);
          // Where two boxes overlap (e.g. pelvis / thigh when crouched) cm-level pose noise may flip which one is
          // entered first; the entry distances then agree within that noise, which the check above already covers.
          if (mine.partId !== hits[0].object.userData.partId) {
            ambiguous++;
          }
          compared++;
        }
      }
      assert.ok(compared > 20, `${posture}: expected a meaningful number of hits, got ${compared}`);
      assert.ok(ambiguous <= compared * 0.1, `${posture}: ${ambiguous}/${compared} rays entered a different overlapping part`);
    }
  });
});

// ---------------------------------------------------------------------------------------------------------------
// Server-side shot resolution on top of the shared boxes
// ---------------------------------------------------------------------------------------------------------------
const MAP_ID = 'cyber_citadel';

function createHarness() {
  const emitted = [];
  const io = {
    to: (code) => ({
      emit: (event, payload) => emitted.push({ code, event, payload }),
      volatile: { emit: (event, payload) => emitted.push({ code, event, payload }) }
    })
  };
  const rm = new RoomManager(io);
  clearInterval(rm.tickInterval);
  rm.tickInterval = null;
  return { rm, emitted };
}

function join(rm, id, roomCode = 'HBX01') {
  const res = rm.addHumanPlayer({ id }, { name: id, roomCode, mode: 'private', botCount: 0, mapId: MAP_ID });
  assert.ok(!res.error, `join failed: ${res.error}`);
  res.player.invulnerableUntil = 0;
  return res;
}

function place(player, x, y, z) {
  player.x = x;
  player.y = y;
  player.z = z;
  player.moveBudgetXZ = undefined;
  player.moveBudgetUp = undefined;
  player.moveBudgetDown = undefined;
  player.lastPosAt = undefined;
  player.positionHistory = [];
}

function findOpenPair(gap) {
  const obstacles = getMapConfig(MAP_ID).obstacles;
  for (let z = -40; z <= 40; z += 2) {
    for (let x = -50; x + gap <= 50; x += 2) {
      // Clear for a target that may be anywhere within +-2.5 m laterally and any stance
      const ok = [-2.5, 0, 2.5].every((dz) =>
        [1.76, 1.35, 0.78, 0.3].every((y) =>
          hasLineOfSight({ x, y: 1.62, z }, { x: x + gap, y, z: z + dz }, obstacles)));
      if (ok) return { a: { x, z }, b: { x: x + gap, z } };
    }
  }
  throw new Error('no open pair');
}

function duel(rm, gap = 20, weapon = 'rifle') {
  const { room, player: shooter } = join(rm, 'shooter');
  const { player: target } = join(rm, 'target');
  const pair = findOpenPair(gap);
  const reset = () => {
    place(shooter, pair.a.x, 0, pair.a.z);
    place(target, pair.b.x, 0, pair.b.z);
    Object.assign(target, { hp: 100, alive: true, invulnerableUntil: 0, yaw: 0, pitch: 0, lean: 0, crouching: false, crouch: false, prone: false });
    Object.assign(shooter, { invulnerableUntil: 0, lastShotAt: 0, lean: 0, crouching: false, prone: false, yaw: 0, rttMs: 0 });
    shooter.loadout = { ...shooter.loadout, primary: weapon };
    shooter.weapon = weapon;
    shooter.ammo = 30;
    shooter.ammoByWeapon[weapon] = 30;
    shooter.reloadingUntil = 0;
  };
  reset();
  const eye = () => ({ x: shooter.x, y: shooter.y + 1.62, z: shooter.z });
  const dirTo = (p) => {
    const e = eye();
    return norm(p.x - e.x, p.y - e.y, p.z - e.z);
  };
  const dmg = () => 100 - target.hp;
  return { room, shooter, target, reset, eye, dirTo, dmg, pair };
}

const rifleDamage = (mult) => Math.max(1, Math.round(WEAPONS.rifle.damage * mult));

describe('handleShoot decides head / leg from the server part hit, not from the claim', () => {
  it('pays a headshot for a ray that hits the head even when the client claims a body hit', () => {
    const { rm } = createHarness();
    const { room, shooter, target, reset, eye, dirTo, dmg } = duel(rm, 20);
    const headCenter = part(getHitboxParts('stand', 0, 0, target), 'head').center;
    rm.handleShoot(room, shooter, { weapon: 'rifle', origin: eye(), dir: dirTo(headCenter), targetId: target.id, isHeadshot: false });
    const headDamage = dmg();
    reset();
    const torso = part(getHitboxParts('stand', 0, 0, target), 'torso').center;
    rm.handleShoot(room, shooter, { weapon: 'rifle', origin: eye(), dir: dirTo(torso), targetId: target.id, isHeadshot: true });
    const bodyDamage = dmg();
    assert.ok(headDamage > bodyDamage * 1.3, `head ${headDamage} vs body ${bodyDamage}: head must be paid by the server`);
    assert.equal(bodyDamage, rifleDamage(1), 'a headshot claim on a torso ray is a plain body hit');
  });

  it('pays leg damage from the server leg hit and ignores a body claim; a leg claim on a torso ray gets nothing extra', () => {
    const { rm } = createHarness();
    const { room, shooter, target, reset, eye, dirTo, dmg } = duel(rm, 20);
    const shin = part(getHitboxParts('stand', 0, 0, target), 'shin_l').center;
    rm.handleShoot(room, shooter, { weapon: 'rifle', origin: eye(), dir: dirTo(shin), targetId: target.id, isLegshot: false });
    const legDamage = dmg();
    reset();
    const torso = part(getHitboxParts('stand', 0, 0, target), 'torso').center;
    rm.handleShoot(room, shooter, { weapon: 'rifle', origin: eye(), dir: dirTo(torso), targetId: target.id, isLegshot: true });
    const bodyDamage = dmg();
    assert.equal(legDamage, rifleDamage(0.78), 'leg ray is paid with the 0.78 leg multiplier');
    assert.equal(bodyDamage, rifleDamage(1), 'a leg claim on a torso ray must not reduce damage');
  });

  it('shotgun pellets: each pellet ray is resolved on the server pose, client hit claims are ignored', () => {
    const { rm } = createHarness();
    const { room, shooter, target, reset, eye, dirTo } = duel(rm, 4, 'shotgun');
    const boxes = getHitboxParts('stand', 0, 0, target);
    const headDir = dirTo(part(boxes, 'head').center);
    const torsoDir = dirTo(part(boxes, 'torso').center);
    const shinDir = dirTo(part(boxes, 'shin_l').center);
    const missDir = { x: 0, y: 1, z: 0 };
    const pellets = WEAPONS.shotgun.pellets;
    const per = (mult) => Math.max(1, Math.round(WEAPONS.shotgun.damage * mult));

    // 1. In handleShoot adapter, all pellets follow the server ray `dir`; client `hits` / `hitPoint` / `isHeadshot` are ignored
    const fireWithDir = (dir, bogusHitClaim) => {
      reset();
      target.hp = 100000;
      shooter.ammo = 6;
      shooter.ammoByWeapon.shotgun = 6;
      rm.handleShoot(room, shooter, {
        weapon: 'shotgun',
        origin: { x: target.x + 99, y: 99, z: target.z }, // spoofed origin ignored
        dir,
        targetId: target.id,
        isHeadshot: bogusHitClaim.isHeadshot,
        isLegshot: bogusHitClaim.isLegshot,
        hits: Array.from({ length: pellets }, () => ({ targetId: target.id, ...bogusHitClaim }))
      });
      return (100000 - target.hp) / pellets;
    };

    assert.equal(
      fireWithDir(headDir, { hitPoint: part(boxes, 'shin_l').center, isHeadshot: false, isLegshot: true }),
      per(WEAPONS.shotgun.headshotMult),
      'pellet rays hitting the head box are headshots even when the client claims leg hits'
    );
    assert.equal(
      fireWithDir(torsoDir, { hitPoint: part(boxes, 'head').center, isHeadshot: true }),
      per(1),
      'claimed headshot on a torso ray is a body hit'
    );
    assert.equal(
      fireWithDir(shinDir, { hitPoint: part(boxes, 'head').center, isHeadshot: true, isLegshot: false }),
      per(0.78),
      'ray through a shin is a leg hit despite a headshot claim'
    );

    // 2. In resolveShot (used by processFireCommand), each pellet has its own server-computed direction and hits its own part
    reset();
    target.hp = 100000;
    const mixedDirs = [headDir, headDir, torsoDir, torsoDir, torsoDir, shinDir, shinDir, missDir];
    const res = rm.resolveShot(room, shooter, {
      weaponId: 'shotgun',
      origin: eye(),
      dirs: mixedDirs,
      now: Date.now()
    });
    const expectedTotal = 2 * per(WEAPONS.shotgun.headshotMult) + 3 * per(1) + 2 * per(0.78);
    assert.equal(100000 - target.hp, expectedTotal, 'each pellet ray is scored by the part it actually hits');
    assert.equal(res.hits.length, 7, '7 pellets hit, 1 missed');
    assert.equal(res.damage.get(target.id).anyHeadshot, true);
  });
});

describe('handleShoot evaluates exactly two poses: rewound and live', () => {
  const setHistory = (target, now, startZ, vz, ms = 250, step = 25) => {
    target.positionHistory = [];
    for (let t = ms; t >= 0; t -= step) {
      target.z = startZ + vz * ((ms - t) / 1000);
      recordPlayerSnapshot(target, now - t);
    }
    return target.z; // live z
  };
  const zAt = (startZ, vz, msAgo, ms = 250) => startZ + vz * ((ms - msAgo) / 1000);

  it('a lagged shot aimed where the shooter saw a fast mover hits thanks to the rewind (no fat boxes needed)', () => {
    const { rm } = createHarness();
    const { room, shooter, target, eye, dirTo, dmg, pair } = duel(rm, 20);
    const now = Date.now();
    const vz = 8; // m/s across the line of fire, ~ sprint
    const startZ = pair.b.z - 1.2;
    shooter.rttMs = 140;
    const rewindMs = resolveShotRewindMs(shooter, {}, now);
    const liveZ = setHistory(target, now, startZ, vz);
    assert.ok(Math.abs(liveZ - startZ - 2) < 1e-9);

    const seenAt = { x: target.x, y: 1.71, z: zAt(startZ, vz, rewindMs) }; // head centre as the shooter saw it
    rm.handleShoot(room, shooter, { weapon: 'rifle', origin: eye(), dir: dirTo(seenAt), targetId: target.id }, now);
    assert.ok(dmg() > rifleDamage(1), `lag-compensated headshot expected, got ${dmg()}`);
  });

  it('the same aim point misses when the shooter is not that far behind (rewind is what makes it legitimate)', () => {
    const { rm } = createHarness();
    const { room, shooter, target, eye, dirTo, dmg, pair } = duel(rm, 20);
    const now = Date.now();
    const vz = 8;
    const startZ = pair.b.z - 1.2;
    shooter.rttMs = 140;
    const lagged = resolveShotRewindMs(shooter, {}, now);
    shooter.rttMs = 0;
    const fast = resolveShotRewindMs(shooter, {}, now);
    assert.ok(lagged - fast >= 60, 'test needs a real rewind difference');
    setHistory(target, now, startZ, vz);
    const seenAt = { x: target.x, y: 1.71, z: zAt(startZ, vz, lagged) };
    rm.handleShoot(room, shooter, { weapon: 'rifle', origin: eye(), dir: dirTo(seenAt), targetId: target.id }, now);
    assert.equal(dmg(), 0, 'no stack of fallback pads may rescue an aim point from 70 ms earlier');
  });

  it('layer (b): a shot at the live position of a moving target still lands', () => {
    const { rm } = createHarness();
    const { room, shooter, target, eye, dirTo, dmg, pair } = duel(rm, 20);
    const now = Date.now();
    shooter.rttMs = 140;
    const liveZ = setHistory(target, now, pair.b.z - 1.2, 8);
    const live = { x: target.x, y: 1.71, z: liveZ };
    rm.handleShoot(room, shooter, { weapon: 'rifle', origin: eye(), dir: dirTo(live), targetId: target.id }, now);
    assert.ok(dmg() > 0);
  });

  it('removed layers: a crouched target is no longer hit through its standing silhouette', () => {
    const { rm } = createHarness();
    const { room, shooter, target, eye, dirTo, dmg } = duel(rm, 20);
    target.crouching = true;
    target.crouch = true;
    // y = 1.85 is inside a standing helmet (<= 1.95) but above a crouching one (<= 1.69)
    rm.handleShoot(room, shooter, { weapon: 'rifle', origin: eye(), dir: dirTo({ x: target.x, y: 1.85, z: target.z }), targetId: target.id });
    assert.equal(dmg(), 0);
    // aiming at the crouched head still works
    shooter.lastShotAt = 0;
    rm.handleShoot(room, shooter, { weapon: 'rifle', origin: eye(), dir: dirTo({ x: target.x, y: 1.45, z: target.z }), targetId: target.id, });
    assert.ok(dmg() > 0);
  });

  it('removed layers: a bot is judged on the rewound / live pose, not on a 220 ms position-history window', () => {
    const { rm } = createHarness();
    const { room, shooter, target, eye, dirTo, dmg, pair } = duel(rm, 20);
    target.isBot = true;
    const now = Date.now();
    shooter.rttMs = 0;
    const rewindMs = resolveShotRewindMs(shooter, {}, now);
    const vz = 8;
    const startZ = pair.b.z - 1.2;
    setHistory(target, now, startZ, vz);
    // 200 ms ago: well outside rewind (<= ~100 ms) and 1.6 m away from the live pose
    const old = { x: target.x, y: 1.71, z: zAt(startZ, vz, 200) };
    assert.ok(rewindMs < 150);
    rm.handleShoot(room, shooter, { weapon: 'rifle', origin: eye(), dir: dirTo(old), targetId: target.id }, now);
    assert.equal(dmg(), 0);
  });
});
