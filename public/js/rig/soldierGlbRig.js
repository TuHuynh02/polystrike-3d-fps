// Adapted from StarKnightt/counter-strike-in-browser (MIT License, Copyright (c) 2026 StarKnightt)
// Loads and animates CC-BY 4.0 realistic CS2 tactical operator (`tactical_operator.glb`) with basis-conjugated
// Mixamo Idle/Walk/Run animation retargeting from `Soldier.glb` (also retained as automatic fallback), exact
// pre-procedural bone snapshot restore, two-anchor shoulder/handguard 2-bone IK (`aimBone`/`ik2`), bladed CS2
// torso stance, universal rest-pose measured hand/palm weapon mount, and 10-finger grip curling onto real CS2 GLBs.

import * as THREE from '../three.js';
import { getAssetManager } from '../assets.js';
import { applyMetalnessCap } from '../quality.js';

export const TACTICAL_OPERATOR_GLB_PATH = 'models/characters/tactical_operator.glb';
export const SOLDIER_ANIM_DONOR_PATH = 'models/characters/Soldier.glb';

export const CS2_BOT_MODELS = Object.freeze({
  tactical_operator: TACTICAL_OPERATOR_GLB_PATH,
  soldier: SOLDIER_ANIM_DONOR_PATH,
  mask_cap: TACTICAL_OPERATOR_GLB_PATH,
  wrap_goggles: TACTICAL_OPERATOR_GLB_PATH,
  mask: TACTICAL_OPERATOR_GLB_PATH,
  wrap: TACTICAL_OPERATOR_GLB_PATH
});

export const CS2_BOT_ROSTER = Object.freeze([CS2_BOT_MODELS.tactical_operator]);

export const CS2_ENEMY_ROSTER = Object.freeze([CS2_BOT_MODELS.tactical_operator]);

export const CS2_TEAMMATE_ROSTER = Object.freeze([CS2_BOT_MODELS.tactical_operator]);

export const SOLDIER_GLB_PATH = CS2_BOT_MODELS.tactical_operator;

// Grounded matte military uniform palettes for Soldier.glb fallback (authentic desert/SAS/GIGN/SWAT drab)
export const SOLDIER_TINT_DEFAULT = 0xa89b82; // Desert Ranger Khaki
export const SOLDIER_TINT_CT = 0x566b80;      // Urban SWAT / GIGN Navy Slate
export const SOLDIER_TINT_T = 0x8e7264;       // Dust Marauder Terracotta-Drab
export const SOLDIER_TINT_SLATE = 0x626b75;   // Black-Ops Charcoal Slate
export const SOLDIER_TINT_OLIVE = 0x6d775b;   // Forest SAS Olive Drab

// Subtle authentic PBR color multipliers for tactical_operator.glb (preserves untinted realistic skin/eyes & pads)
const TACTICAL_OPERATOR_PALETTES = Object.freeze({
  default: Object.freeze({
    suit: 0xf4ebe0,
    plate: 0xede2d4,
    pouch: 0xeae0d0,
    cap: 0xe6dbc6,
    pads: 0xf2f2f2
  }),
  ct: Object.freeze({
    suit: 0xb6cce4,
    plate: 0xa2b7ce,
    pouch: 0x9fb4ca,
    cap: 0x94aac4,
    pads: 0xe8edf2
  }),
  t: Object.freeze({
    suit: 0xe8cabd,
    plate: 0xdab6a6,
    pouch: 0xd6b3a3,
    cap: 0xcfa797,
    pads: 0xeee6e2
  }),
  slate: Object.freeze({
    suit: 0xb2bac6,
    plate: 0xa0a8b4,
    pouch: 0x9ca4b0,
    cap: 0x969eaa,
    pads: 0xe6eaef
  }),
  olive: Object.freeze({
    suit: 0xdce4ca,
    plate: 0xd0d8bc,
    pouch: 0xcdd5b8,
    cap: 0xc8d2b0,
    pads: 0xedf0e8
  })
});

// Detached floating headset authored ~20cm above tactical_operator.glb's cap — hidden cleanly for accurate head silhouette & bounds
const HIDDEN_OPERATOR_MESHES = new Set(['Object_111']);
const HIDDEN_OPERATOR_MATS = new Set(['HeadphonesT']);
const RIGID_EYE_MESHES = new Set(['0']);

const DEG = Math.PI / 180;

// Exact measured Mixamo RightHand weapon anchors & rifle-space grip geometry
// Universal hand mount frame: hX = -palmOut (back of right hand), hY = thumb/index top, hZ = -fdir (wrist)
// Rifle model (`ak47.glb` / `awp.glb`): origin at pistol grip, barrel along -Z, +Y up.
export const CS2_HAND_ANCHORS = Object.freeze({
  rifle: Object.freeze({
    pos: [-0.036, 0.108, 0.072],
    rot: [Math.PI * 0.5, 0, 0],
    extraRot: [0, 0, 0],
    scale: 0.96,
    buttLocal: [0, -0.03, 0.32],
    gripLocal: [0.036, -0.072, 0.108],
    handguard: [-0.006, -0.043, -0.255],
    handguardCarry: -0.220
  }),
  sniper: Object.freeze({
    pos: [-0.036, 0.108, 0.072],
    rot: [Math.PI * 0.5, 0, 0],
    extraRot: [0, 0, 0],
    scale: 0.86,
    buttLocal: [0, -0.03, 0.32],
    gripLocal: [0.036, -0.072, 0.108],
    handguard: [-0.006, -0.046, -0.285],
    handguardCarry: -0.235
  }),
  smg: Object.freeze({
    pos: [-0.036, 0.108, 0.072],
    rot: [Math.PI * 0.5, 0, 0],
    extraRot: [0, 0, 0],
    scale: 0.90,
    buttLocal: [0, -0.03, 0.27],
    gripLocal: [0.036, -0.072, 0.108],
    handguard: [-0.006, -0.043, -0.220],
    handguardCarry: -0.185
  }),
  knife: Object.freeze({
    pos: [-0.026, 0.095, 0.014],
    rot: [Math.PI * 0.5 - 0.14, 0, -0.08],
    extraRot: [-0.14, 0, -0.08],
    scale: 1.0,
    buttLocal: null,
    gripLocal: null,
    handguard: null,
    handguardCarry: null
  })
});

const CS2_RIG = Object.freeze({
  height: 1.80,
  crouchDrop: 0.34,
  crouchLegs: [62, -105, 43],
  hold: {
    aim: { butt: [-0.03, -0.04, 0.02], rot: [0, 0, -6] },
    low: { butt: [-0.02, -0.06, 0.01], guard: [0.0, -0.34, 0.25], cant: 4 },
    run: { butt: [0.06, -0.09, 0.06], guard: [0.0, -0.25, 0.22], cant: 9 }
  },
  sway: { pitch: 1.1, roll: 0.85, hips: 0.01, tPitch: 4.6, tRoll: 6.8, tHips: 5.3 },
  leftWrist: [-0.047, -0.004, 0.013],
  leftPalm: [0.15, 0.99, 0],
  leftFingers: [0.99, -0.15, -0.15],
  grip: {
    right: {
      fingers: [70, 10, 40],
      index: [40, 5, 5],
      ring: [70, -15, 20],
      pinky: [66, 20],
      thumb: [58, -85, -20]
    },
    left: {
      fingers: [96, 15, 10],
      middle: [92, -5, 10],
      ring: [78, -30, -20],
      pinky: [72, -25],
      thumb: [0, 15, 10],
      thumbSpread: 90
    }
  },
  blade: -18,
  rightPole: [0.7, -1, -0.3],
  leftPole: [-0.6, -1, -0.2],
  aimYawSplit: [0.25, 0.30, 0.25, 0.20],
  aimPitchSplit: [0.15, 0.30, 0.30, 0.25]
});

const CANONICAL_BONES = [
  'Hips',
  'Spine',
  'Spine1',
  'Spine2',
  'Neck',
  'Head',
  'HeadTop_End',
  'LeftShoulder',
  'LeftArm',
  'LeftForeArm',
  'LeftHand',
  'RightShoulder',
  'RightArm',
  'RightForeArm',
  'RightHand',
  'LeftUpLeg',
  'LeftLeg',
  'LeftFoot',
  'LeftToeBase',
  'RightUpLeg',
  'RightLeg',
  'RightFoot',
  'RightToeBase'
];

const FINGERS = ['Index', 'Middle', 'Ring', 'Pinky'];
const FINGER_KEYS = ['index', 'middle', 'ring', 'pinky'];
const STRIPPED_VIEWMODEL_NODES = new Set(['HandR', 'ArmR', 'HandL', 'ArmL']);

function normBoneName(s) {
  return String(s || '')
    .replace(/^mixamorig:?/i, '')
    .replace(/_\d+$/, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

const CANONICAL_BONE_MAP = Object.fromEntries(CANONICAL_BONES.map((b) => [normBoneName(b), b]));

function findCanonicalBones(root) {
  const map = {};
  root.traverse((o) => {
    if (!o.isBone && !/mixamorig/i.test(String(o.name || ''))) return;
    const key = CANONICAL_BONE_MAP[normBoneName(o.name)];
    if (key && !map[key]) map[key] = o;
  });
  return map;
}

function isArmChainBoneKey(canonKey) {
  return (
    canonKey.includes('shoulder') ||
    canonKey.includes('arm') ||
    canonKey.includes('hand') ||
    canonKey.includes('thumb') ||
    canonKey.includes('index') ||
    canonKey.includes('middle') ||
    canonKey.includes('ring') ||
    canonKey.includes('pinky')
  );
}

const _RETARGET_CLIP_CACHE = new Map();
const _OPERATOR_PALETTE_MAT_CACHE = new Map();
const _SHARED_TEX_SLOTS = [
  'map',
  'normalMap',
  'roughnessMap',
  'metalnessMap',
  'aoMap',
  'emissiveMap',
  'specularIntensityMap',
  'specularColorMap'
];

/**
 * Measures per-hand finger flexion chains, flexion axis, palm normal, (fingers, palm) frame,
 * and universal right-hand rifle mount basis directly from REST pose BEFORE AnimationMixer runs.
 */
function findHandGripFrames(root) {
  const idx = {};
  root.traverse((o) => {
    if (o.isBone) idx[normBoneName(o.name)] = o;
  });
  root.updateMatrixWorld(true);
  const out = {};
  const tmpScale = new THREE.Vector3();
  for (const side of ['Left', 'Right']) {
    const hand = idx[normBoneName(side + 'Hand')];
    if (!hand) continue;
    const inv = new THREE.Matrix4().copy(hand.matrixWorld).invert();
    const at = (n) => {
      const b = idx[normBoneName(side + n)];
      return b ? new THREE.Vector3().setFromMatrixPosition(b.matrixWorld).applyMatrix4(inv) : null;
    };
    const m1 = at('HandMiddle1');
    const m3 = at('HandMiddle3') || at('HandMiddle2');
    const i1 = at('HandIndex1');
    const p1 = at('HandPinky1');
    const t1 = at('HandThumb1');
    const t3 = at('HandThumb3') || at('HandThumb2');
    if (!m1 || !i1 || !p1) continue;

    const fdir = m1.clone().normalize();
    const curl = i1.clone().sub(p1).normalize();
    if (m3) {
      const near = (sg) => m3.clone().sub(m1).applyAxisAngle(curl, sg * Math.PI * 0.5).add(m1).length();
      if (near(1) > near(-1)) curl.negate();
    }
    const palmOut = new THREE.Vector3().crossVectors(curl, fdir).normalize();
    const thumb =
      t1 && t3
        ? new THREE.Vector3().crossVectors(t3.clone().sub(t1).normalize(), palmOut).normalize()
        : curl.clone();

    const chain = (pre, n) => {
      const c = [];
      for (let j = 1; j <= n; j++) {
        const b = idx[normBoneName(side + pre + j)];
        if (b) c.push(b);
      }
      return c;
    };

    hand.getWorldScale(tmpScale);
    const wScale = (Math.abs(tmpScale.x) + Math.abs(tmpScale.y) + Math.abs(tmpScale.z)) / 3 || 1;
    const m1DistM = m1.length() * wScale;
    const handLenScale = THREE.MathUtils.clamp(m1DistM / 0.145, 0.72, 1.12);

    // Universal right-hand rifle mount basis in hand local space:
    // Rifle +X -> -palmOut (back of right hand), Rifle +Z -> -fdir (wrist, barrel along +fdir), Rifle +Y -> hZ x hX (thumb top)
    const hX = palmOut.clone().negate().normalize();
    const hZ = fdir.clone().negate().normalize();
    const hY = new THREE.Vector3().crossVectors(hZ, hX).normalize();
    hX.crossVectors(hY, hZ).normalize();
    const mountM4 = new THREE.Matrix4().makeBasis(hX, hY, hZ);
    const qMount = new THREE.Quaternion().setFromRotationMatrix(mountM4);
    const qMountInv = qMount.clone().invert();

    const gm = new THREE.Matrix4().makeBasis(fdir, palmOut, new THREE.Vector3().crossVectors(fdir, palmOut));
    out[side] = {
      hand,
      fdir,
      curl,
      palmOut,
      thumbAxis: thumb,
      hX,
      hY,
      hZ,
      qMount,
      qMountInv,
      m1DistM,
      handLenScale,
      qGrip: new THREE.Quaternion().setFromRotationMatrix(gm).invert(),
      chains: FINGERS.map((f) => chain('Hand' + f, 3)).filter((c) => c.length),
      thumb: chain('HandThumb', 3)
    };
  }
  return out;
}

/**
 * Retargets Mixamo Idle/Walk/Run AnimationClips from Soldier.glb onto a target Mixamo skeleton
 * (such as tactical_operator.glb with `_0xx` bone suffixes and +90deg-rolled arm bind frames),
 * caching the converted clips per model path so all bots share the same clip instances.
 */
function getRetargetedMixamoClips(cacheKey, donorGltf, targetRoot, targetGripFrames) {
  if (_RETARGET_CLIP_CACHE.has(cacheKey)) {
    return _RETARGET_CLIP_CACHE.get(cacheKey);
  }
  const donorClips = donorGltf?.animations || [];
  if (!donorClips.length || !targetRoot) return [];

  const targetBoneMap = {};
  targetRoot.traverse((o) => {
    if (!o.isBone) return;
    const k = normBoneName(o.name);
    if (k && !targetBoneMap[k]) targetBoneMap[k] = o;
  });

  // Detect arm local-axis roll offset relative to Soldier.glb (where RightHand palmOut ~ -X; tactical_operator palmOut ~ +Z)
  const rPalm = targetGripFrames?.Right?.palmOut;
  let armRollDeg = 0;
  if (rPalm && rPalm.z > 0.65) {
    armRollDeg = -90;
  } else if (rPalm && rPalm.z < -0.65) {
    armRollDeg = 90;
  }
  const qArm = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), armRollDeg * DEG);
  const qArmInv = qArm.clone().invert();
  const qIdent = new THREE.Quaternion();

  // Compute scale-normalized Hips vertical/lateral bob conversion while zeroing target Hips X offset (+0.176m)
  const targetHips = targetBoneMap.hips || null;
  let donorHipsScale = 0.01;
  let donorRestHips = new THREE.Vector3(-0.16, 1.11, 106.13);
  if (donorGltf?.scene) {
    donorGltf.scene.updateMatrixWorld(true);
    donorGltf.scene.traverse((o) => {
      if (o.isBone && normBoneName(o.name) === 'hips') {
        const s = new THREE.Vector3();
        o.getWorldScale(s);
        if (s.x > 1e-5) donorHipsScale = s.x;
        donorRestHips.copy(o.position);
      }
    });
  }
  const tposeClip = donorClips.find((c) => String(c.name || '').toLowerCase() === 'tpose');
  const tposeHipsTrack = tposeClip?.tracks?.find((t) => /\.position$/i.test(t.name) && normBoneName(t.name.slice(0, t.name.lastIndexOf('.'))) === 'hips');
  if (tposeHipsTrack && tposeHipsTrack.values.length >= 3) {
    donorRestHips.set(tposeHipsTrack.values[0], tposeHipsTrack.values[1], tposeHipsTrack.values[2]);
  }

  let targetHipsScale = 1;
  let targetRestHips = new THREE.Vector3(0, 0, 1);
  if (targetHips) {
    targetRoot.updateMatrixWorld(true);
    const s = new THREE.Vector3();
    targetHips.getWorldScale(s);
    if (s.x > 1e-5) targetHipsScale = s.x;
    // Zero horizontal X offset so Sketchfab +0.176m bind-frame shift never drags the operator off-center
    targetRestHips.set(0, targetHips.position.y, targetHips.position.z);
  }
  const hipsScaleRatio = donorHipsScale / Math.max(1e-5, targetHipsScale);

  const qTmp = new THREE.Quaternion();
  const converted = [];
  for (let ci = 0; ci < donorClips.length; ci++) {
    const clip = donorClips[ci];
    if (!clip || String(clip.name || '').toLowerCase() === 'tpose') continue;
    const outTracks = [];
    for (let ti = 0; ti < clip.tracks.length; ti++) {
      const tr = clip.tracks[ti];
      const dot = tr.name.lastIndexOf('.');
      if (dot < 0) continue;
      const srcBone = tr.name.slice(0, dot);
      const prop = tr.name.slice(dot + 1);
      const k = normBoneName(srcBone);
      const targetBone = targetBoneMap[k];
      if (!targetBone) continue;

      if (prop === 'quaternion') {
        const parentK = targetBone.parent?.isBone ? normBoneName(targetBone.parent.name) : '';
        const rB = isArmChainBoneKey(k) ? qArm : qIdent;
        const rPInv = isArmChainBoneKey(parentK) ? qArmInv : qIdent;
        const vals = new Float32Array(tr.values.length);
        for (let i = 0; i < tr.values.length; i += 4) {
          qTmp.set(tr.values[i], tr.values[i + 1], tr.values[i + 2], tr.values[i + 3]);
          if (armRollDeg !== 0) {
            qTmp.premultiply(rPInv).multiply(rB);
          }
          vals[i] = qTmp.x;
          vals[i + 1] = qTmp.y;
          vals[i + 2] = qTmp.z;
          vals[i + 3] = qTmp.w;
        }
        outTracks.push(new THREE.QuaternionKeyframeTrack(`${targetBone.name}.quaternion`, tr.times.slice(), vals));
      } else if (prop === 'position' && k === 'hips' && targetHips) {
        const vals = new Float32Array(tr.values.length);
        for (let i = 0; i < tr.values.length; i += 3) {
          vals[i] = targetRestHips.x + (tr.values[i] - donorRestHips.x) * hipsScaleRatio;
          vals[i + 1] = targetRestHips.y + (tr.values[i + 1] - donorRestHips.y) * hipsScaleRatio;
          vals[i + 2] = targetRestHips.z + (tr.values[i + 2] - donorRestHips.z) * hipsScaleRatio;
        }
        outTracks.push(new THREE.VectorKeyframeTrack(`${targetBone.name}.position`, tr.times.slice(), vals));
      }
    }
    if (outTracks.length) {
      converted.push(new THREE.AnimationClip(clip.name, clip.duration, outTracks));
    }
  }
  _RETARGET_CLIP_CACHE.set(cacheKey, converted);
  return converted;
}

export function canUseSoldierGlb() {
  return (
    typeof window !== 'undefined' &&
    typeof document !== 'undefined' &&
    typeof WebGL2RenderingContext !== 'undefined'
  );
}

export function hashPlayerKey(key) {
  const s = String(key ?? '0');
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function resolveSoldierModelPath(rig, options = {}) {
  if (options.modelPath) return options.modelPath;
  const isShowcase = Boolean(options.isShowcase ?? rig?._isShowcase);
  const variant = options.demoVariant || options.variant || rig?.demoVariant || null;
  const colorHex = Number(options.colorHex ?? rig?._soldierColorHex);
  const isTeammate = Boolean(
    options.isTeammate ?? rig?.isTeammate ?? ((options.team ?? rig?.team) === 'alpha')
  );

  if (variant && CS2_BOT_MODELS[variant]) {
    return CS2_BOT_MODELS[variant];
  }

  if (isShowcase) {
    if (variant === 'v2_goggles' || colorHex === 0xef4444) return CS2_BOT_MODELS.wrap_goggles;
    if (variant === 'v3_ghost' || colorHex === 0x94a3b8) return CS2_BOT_MODELS.mask;
    if (variant === 'v4_recon' || colorHex === 0x4b5320) return CS2_BOT_MODELS.wrap;
    return CS2_BOT_MODELS.mask_cap;
  }

  const hashKey = options.playerId ?? rig?.id ?? rig?.name ?? variant ?? 'bot';
  const h = hashPlayerKey(hashKey);

  if (isTeammate) {
    return CS2_TEAMMATE_ROSTER[h % CS2_TEAMMATE_ROSTER.length];
  }

  return CS2_ENEMY_ROSTER[h % CS2_ENEMY_ROSTER.length];
}

export function resolveSoldierPaletteKey(rig) {
  if (!rig) return 'default';
  if (rig._isShowcase) {
    const hex = Number(rig._soldierColorHex);
    if (hex === 0x38bdf8) return 'ct';
    if (hex === 0xef4444 || rig.demoVariant === 'v2_goggles') return 't';
    if (hex === 0x94a3b8 || rig.demoVariant === 'v3_ghost') return 'slate';
    if (hex === 0x4b5320 || rig.demoVariant === 'v4_recon') return 'olive';
    return 'default';
  }
  if (rig.isTeammate || rig.team === 'alpha') {
    return 'ct';
  }
  if (rig.team === 'bravo') {
    return 't';
  }
  const h = hashPlayerKey(rig.id ?? rig.name ?? 'bot') % 3;
  if (h === 1) return 'default';
  if (h === 2) return 'olive';
  return 't';
}

export function resolveSoldierClothTintHex(rig) {
  const key = resolveSoldierPaletteKey(rig);
  if (key === 'ct') return SOLDIER_TINT_CT;
  if (key === 't') return SOLDIER_TINT_T;
  if (key === 'slate') return SOLDIER_TINT_SLATE;
  if (key === 'olive') return SOLDIER_TINT_OLIVE;
  return SOLDIER_TINT_DEFAULT;
}

let skeletonUtilsPromise = null;
async function loadSkeletonUtils() {
  if (!canUseSoldierGlb()) return null;
  if (!skeletonUtilsPromise) {
    skeletonUtilsPromise = import('three/addons/utils/SkeletonUtils.js').catch(() => null);
  }
  return skeletonUtilsPromise;
}

let cs2WeaponModulePromise = null;
async function loadCs2WeaponModule() {
  if (!canUseSoldierGlb()) return null;
  if (!cs2WeaponModulePromise) {
    cs2WeaponModulePromise = import('../weapons/cs2WeaponGlb.js').catch(() => null);
  }
  return cs2WeaponModulePromise;
}

let cachedFlashTex = null;
function getSoldierFlashTexture() {
  if (cachedFlashTex || typeof document === 'undefined') return cachedFlashTex;
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.clearRect(0, 0, 128, 128);
  const grad = ctx.createRadialGradient(64, 64, 4, 64, 64, 60);
  grad.addColorStop(0.0, 'rgba(255, 252, 232, 1.0)');
  grad.addColorStop(0.28, 'rgba(255, 214, 128, 0.92)');
  grad.addColorStop(0.62, 'rgba(255, 148, 48, 0.42)');
  grad.addColorStop(1.0, 'rgba(255, 110, 20, 0.0)');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(64, 64, 60, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255, 240, 190, 0.85)';
  ctx.lineWidth = 4;
  for (let i = 0; i < 6; i++) {
    const a = (i * Math.PI) / 3;
    ctx.beginPath();
    ctx.moveTo(64 + Math.cos(a) * 10, 64 + Math.sin(a) * 10);
    ctx.lineTo(64 + Math.cos(a) * 58, 64 + Math.sin(a) * 58);
    ctx.stroke();
  }
  cachedFlashTex = new THREE.CanvasTexture(canvas);
  cachedFlashTex.colorSpace = THREE.SRGBColorSpace;
  cachedFlashTex.userData = { shared: true };
  return cachedFlashTex;
}

// Preallocated scratch objects (zero per-frame heap allocations)
const _tmpScale = new THREE.Vector3();
const _tmpBox = new THREE.Box3();
const _bb = new THREE.Box3();
const _m4 = new THREE.Matrix4();
const _e = new THREE.Euler();
const _qa = new THREE.Quaternion();
const _qb = new THREE.Quaternion();
const _qc = new THREE.Quaternion();
const _qr = new THREE.Quaternion();
const _rootQ = new THREE.Quaternion();
const _ax = new THREE.Vector3();
const _p1 = new THREE.Vector3();
const _p2 = new THREE.Vector3();
const _p3 = new THREE.Vector3();
const _k1 = new THREE.Vector3();
const _k2 = new THREE.Vector3();
const _k3 = new THREE.Vector3();
const _k4 = new THREE.Vector3();
const _k5 = new THREE.Vector3();
const _h1 = new THREE.Vector3();
const _h2 = new THREE.Vector3();
const _h3 = new THREE.Vector3();
const _h4 = new THREE.Vector3();
const _h5 = new THREE.Vector3();
const _h6 = new THREE.Vector3();
const _h7 = new THREE.Vector3();
const _h8 = new THREE.Vector3();
const _h9 = new THREE.Vector3();
const _g1 = new THREE.Vector3();
const _g2 = new THREE.Vector3();
const _g3 = new THREE.Vector3();
const _upW = new THREE.Vector3();
const _fwdW = new THREE.Vector3();
const _rightW = new THREE.Vector3();
const _ZAXIS = new THREE.Vector3(0, 0, 1);

/** Rotate a bone about a WORLD axis through its origin (premultiplied in parent space). */
function rotW(bone, axis, ang) {
  if (!bone?.parent || Math.abs(ang) < 1e-5) return;
  bone.parent.getWorldQuaternion(_qa).invert();
  _ax.copy(axis).applyQuaternion(_qa).normalize();
  bone.quaternion.premultiply(_qb.setFromAxisAngle(_ax, ang));
  bone.updateWorldMatrix(false, false);
}

/** Point bone -> child at a world position via minimal shortest-arc rotation (zero axis assumptions). */
function aimBone(bone, child, target) {
  if (!bone?.parent || !child) return;
  bone.getWorldPosition(_p1);
  child.getWorldPosition(_p2);
  _p2.sub(_p1);
  _p3.copy(target).sub(_p1);
  if (_p2.lengthSq() < 1e-8 || _p3.lengthSq() < 1e-8) return;
  bone.parent.getWorldQuaternion(_qa).invert();
  _p2.applyQuaternion(_qa).normalize();
  _p3.applyQuaternion(_qa).normalize();
  bone.quaternion.premultiply(_qb.setFromUnitVectors(_p2, _p3));
  bone.updateWorldMatrix(false, false);
}

/** Analytical 2-bone IK in world space using actual joint-to-child vectors (`aimBone`). */
function ik2(upper, lower, end, targetWorld, poleWorld) {
  if (!upper?.parent || !lower || !end) return;
  upper.getWorldPosition(_k1);
  lower.getWorldPosition(_k2);
  end.getWorldPosition(_k3);
  const l1 = _k1.distanceTo(_k2);
  const l2 = _k2.distanceTo(_k3);
  if (l1 < 1e-4 || l2 < 1e-4) return;
  const d = _k4.copy(targetWorld).sub(_k1);
  let L = d.length();
  if (L < 1e-5) return;
  const minL = Math.abs(l1 - l2) + 0.015;
  const maxL = (l1 + l2) * 0.985;
  L = Math.max(minL, Math.min(L, maxL));
  d.normalize();
  const cosA = THREE.MathUtils.clamp((l1 * l1 + L * L - l2 * l2) / (2 * l1 * L), -1, 1);
  const a = Math.acos(cosA);
  const p = _k5.copy(poleWorld).addScaledVector(d, -poleWorld.dot(d));
  if (p.lengthSq() < 1e-6) {
    p.set(0, -1, 0).addScaledVector(d, d.y);
  }
  p.normalize();
  const elbow = _k2
    .copy(d)
    .multiplyScalar(Math.cos(a))
    .addScaledVector(p, Math.sin(a))
    .multiplyScalar(l1)
    .add(_k1);
  aimBone(upper, lower, elbow);
  const handTarget = _k5.copy(_k1).addScaledVector(d, L);
  aimBone(lower, end, handTarget);
}

function restoreMixedPose(rig) {
  const snap = rig?._soldierSnap;
  if (!snap) return;
  for (let i = 0; i < snap.length; i++) {
    const s = snap[i];
    if (s.on) {
      s.b.position.copy(s.p);
      s.b.quaternion.copy(s.q);
    }
  }
}

function saveMixedPose(rig) {
  const snap = rig?._soldierSnap;
  if (!snap) return;
  for (let i = 0; i < snap.length; i++) {
    const s = snap[i];
    s.p.copy(s.b.position);
    s.q.copy(s.b.quaternion);
    s.on = true;
  }
}

/** Curls Mixamo fingers & thumb cleanly around pistol grip (Right) or rifle handguard (Left). */
function applyFingerGripPose(rig, side, weight = 1) {
  const g = rig?._soldierGrip?.[side];
  const P = CS2_RIG.grip[side.toLowerCase()];
  if (!g || !P || weight < 0.01) return;

  for (let c = 0; c < g.chains.length; c++) {
    const chain = g.chains[c];
    const F = P[FINGER_KEYS[c]] || P.fingers;
    _g1.copy(g.curl);
    for (let j = 0; j < chain.length; j++) {
      const b = chain[j];
      const deg = F[j] ?? F[F.length - 1];
      b.quaternion.premultiply(_qa.setFromAxisAngle(_g1, deg * DEG * weight));
      _g1.applyQuaternion(_qb.copy(b.quaternion).invert());
    }
  }

  const T = P.thumb;
  const spread = (P.thumbSpread || 0) * DEG * weight;
  _g1.copy(g.thumbAxis);
  if (spread) _g1.applyQuaternion(_qc.setFromAxisAngle(g.palmOut, spread));
  for (let j = 0; j < g.thumb.length; j++) {
    const b = g.thumb[j];
    if (j === 0 && spread) b.quaternion.premultiply(_qc);
    const deg = T[j] ?? T[T.length - 1];
    b.quaternion.premultiply(_qa.setFromAxisAngle(_g1, deg * DEG * weight));
    _g1.applyQuaternion(_qb.copy(b.quaternion).invert());
  }
}

function isPistolWeapon(wId) {
  return wId === 'pistol' || wId === 'deagle' || wId === 'glock';
}

function isSniperWeapon(wId) {
  return wId === 'sniper' || wId === 'dmr';
}

function getCs2AnchorKey(wId) {
  if (wId === 'knife') return 'knife';
  if (isSniperWeapon(wId)) return 'sniper';
  if (wId === 'smg') return 'smg';
  return 'rifle';
}

function getFallbackCs2GlbPath(wId) {
  if (!wId || isPistolWeapon(wId)) return null;
  if (wId === 'knife') return 'models/cs2/knife.glb';
  if (isSniperWeapon(wId)) return 'models/cs2/awp.glb';
  return 'models/cs2/ak47.glb';
}

function markSharedTemplateResources(scene) {
  if (!scene || scene.userData?.__soldierSharedMarked) return;
  scene.traverse((obj) => {
    if (obj.geometry) {
      obj.geometry.userData = { ...(obj.geometry.userData || {}), shared: true };
      if (!obj.geometry.boundingSphere) obj.geometry.computeBoundingSphere();
    }
    const mats = Array.isArray(obj.material) ? obj.material : obj.material ? [obj.material] : [];
    for (const mat of mats) {
      if (!mat) continue;
      mat.userData = { ...(mat.userData || {}), shared: true };
      for (let ti = 0; ti < _SHARED_TEX_SLOTS.length; ti++) {
        const texKey = _SHARED_TEX_SLOTS[ti];
        if (mat[texKey]) {
          mat[texKey].userData = { ...(mat[texKey].userData || {}), shared: true };
        }
      }
    }
  });
  scene.userData = { ...(scene.userData || {}), __soldierSharedMarked: true };
}

function isHiddenOperatorMesh(obj) {
  if (!obj) return false;
  if (HIDDEN_OPERATOR_MESHES.has(obj.name)) return true;
  const mats = Array.isArray(obj.material) ? obj.material : obj.material ? [obj.material] : [];
  for (let i = 0; i < mats.length; i++) {
    if (mats[i] && HIDDEN_OPERATOR_MATS.has(mats[i].name)) return true;
  }
  return false;
}

/**
 * Returns a shared cached PBR material clone for `(modelPath, paletteKey, isShowcase, origMat)`.
 * All 19 WebP/JPEG textures remain shared references (ZERO texture cloning, ZERO per-bot material allocation,
 * ZERO shader recompiles across spawns, and 0.00 disposal leaks).
 */
function getSharedOperatorMaterial(modelPath, paletteKey, isShowcase, isTeammate, origMat, meshName = '') {
  if (!origMat) return origMat;
  const isTacticalOp = String(modelPath || '').includes('tactical_operator');
  const mNameLower = String(origMat.name || '').toLowerCase();
  const isUntintedHead = isTacticalOp && mNameLower.includes('head');
  const visorRole = !isTacticalOp && (
    String(meshName || '').toLowerCase().includes('visor') ||
    mNameLower.includes('visor')
  );
  const roleTag = visorRole ? (isShowcase ? 'show' : isTeammate ? 'ally' : 'foe') : (isShowcase ? 'show' : 'world');
  const effPalette = isUntintedHead ? 'shared_head' : paletteKey;
  const cacheKey = `${modelPath}::${effPalette}::${roleTag}::${origMat.uuid}`;
  const cached = _OPERATOR_PALETTE_MAT_CACHE.get(cacheKey);
  if (cached) return cached;

  const mat = origMat.clone();
  mat.userData = {
    ...(mat.userData || {}),
    shared: true,
    isSoldierCloneMat: true,
    isSharedOperatorMat: true
  };
  for (let ti = 0; ti < _SHARED_TEX_SLOTS.length; ti++) {
    const texKey = _SHARED_TEX_SLOTS[ti];
    if (mat[texKey]) {
      mat[texKey].userData = { ...(mat[texKey].userData || {}), shared: true };
    }
  }

  if (isTacticalOp) {
    const pal = TACTICAL_OPERATOR_PALETTES[paletteKey] || TACTICAL_OPERATOR_PALETTES.default;
    const mName = String(origMat.name || '').toLowerCase();
    if (mName.includes('head')) {
      // Preserve photorealistic skin, eyes, and dark woven balaclava completely untinted
      mat.color.setHex(0xffffff);
      mat.envMapIntensity = isShowcase ? 0.58 : 0.48;
    } else if (mName.includes('pad')) {
      mat.color.setHex(pal.pads);
      mat.envMapIntensity = isShowcase ? 0.62 : 0.50;
    } else if (mName.includes('cap')) {
      mat.color.setHex(pal.cap);
      mat.envMapIntensity = isShowcase ? 0.58 : 0.48;
    } else if (mName.includes('plate')) {
      mat.color.setHex(pal.plate);
      mat.envMapIntensity = isShowcase ? 0.68 : 0.56;
    } else if (mName.includes('puch') || mName.includes('pouch')) {
      mat.color.setHex(pal.pouch);
      mat.envMapIntensity = isShowcase ? 0.66 : 0.54;
    } else {
      mat.color.setHex(pal.suit);
      mat.envMapIntensity = isShowcase ? 0.64 : 0.52;
    }
  } else if (visorRole) {
    mat.roughness = 0.14;
    mat.metalness = 0.85;
    mat.envMapIntensity = 1.25;
    if (isShowcase) {
      mat.color.setHex(0x141d29);
      mat.emissive.setHex(0x050a10);
      mat.emissiveIntensity = 0.08;
    } else if (isTeammate) {
      mat.color.setHex(0x1e3a5f);
      mat.emissive.setHex(0x0c4a6e);
      mat.emissiveIntensity = 0.22;
    } else {
      mat.color.setHex(0x2a1414);
      mat.emissive.setHex(0x450a0a);
      mat.emissiveIntensity = 0.18;
    }
  } else {
    const tintHex =
      paletteKey === 'ct'
        ? SOLDIER_TINT_CT
        : paletteKey === 't'
          ? SOLDIER_TINT_T
          : paletteKey === 'slate'
            ? SOLDIER_TINT_SLATE
            : paletteKey === 'olive'
              ? SOLDIER_TINT_OLIVE
              : SOLDIER_TINT_DEFAULT;
    mat.color.setHex(tintHex);
    mat.roughness = mat.roughnessMap ? 0.84 : 0.80;
    mat.metalness = 0.12;
    mat.envMapIntensity = isShowcase ? 0.52 : 0.45;
  }

  _OPERATOR_PALETTE_MAT_CACHE.set(cacheKey, mat);
  return mat;
}

function disposeCs2WorldWeaponObj(obj) {
  if (!obj) return;
  obj.parent?.remove(obj);
  obj.traverse((child) => {
    if (child.geometry && !child.geometry.userData?.shared) {
      child.geometry.dispose?.();
    }
    const mats = Array.isArray(child.material) ? child.material : child.material ? [child.material] : [];
    for (let i = 0; i < mats.length; i++) {
      const m = mats[i];
      if (!m || m.userData?.shared) continue;
      m.dispose?.();
    }
  });
}

function dressFallbackCs2Weapon(root, weaponId, envMap) {
  const matMap = new Map();
  root.traverse((obj) => {
    if (STRIPPED_VIEWMODEL_NODES.has(obj.name)) {
      obj.visible = false;
      return;
    }
    if (!obj.isMesh) return;
    if (obj.geometry) {
      obj.geometry.userData = { ...(obj.geometry.userData || {}), shared: true };
    }
    const dressOne = (orig) => {
      if (!orig) return orig;
      if (matMap.has(orig)) return matMap.get(orig);
      const m = orig.clone();
      m.vertexColors = false;
      m.userData = { ...(m.userData || {}), shared: false, isCs2FallbackMat: true };
      const name = String(m.name || '').toLowerCase();
      if (name.startsWith('gun_wood')) {
        if (weaponId === 'm4a1' || weaponId === 'smg') {
          m.color.setHex(0x22252a);
          m.roughness = 0.72;
          m.metalness = 0.08;
        } else if (weaponId === 'scar') {
          m.color.setHex(0xa8926e);
          m.roughness = 0.74;
          m.metalness = 0.05;
        } else {
          m.color.setHex(0x6d3f22);
          m.roughness = 0.62;
          m.metalness = 0.04;
        }
      } else if (name.startsWith('gun_bakelite')) {
        m.color.setHex(weaponId === 'rifle' ? 0x5c2e1c : 0x202328);
        m.roughness = 0.45;
        m.metalness = 0.06;
      } else if (name.startsWith('awp_green')) {
        m.color.setHex(weaponId === 'dmr' ? 0x3b444e : 0x455236);
        m.roughness = 0.76;
        m.metalness = 0.04;
      } else if (name.startsWith('scope_glass')) {
        m.color.setHex(0x1e4c7a);
        m.roughness = 0.08;
        m.metalness = 0.90;
        if (envMap) {
          m.envMap = envMap;
          m.envMapIntensity = 2.0;
        }
      } else if (name.startsWith('gun_steel') || name.startsWith('gun_black')) {
        m.color.setHex(name.includes('light') ? 0x2f333a : 0x1d2026);
        m.roughness = 0.46;
        m.metalness = 0.85;
        if (envMap) {
          m.envMap = envMap;
          m.envMapIntensity = 0.95;
        }
      } else if (name.startsWith('knife_blade') || name.startsWith('knife_edge')) {
        m.color.setHex(name.includes('edge') ? 0xd2d6dc : 0x9aa0a8);
        m.roughness = name.includes('edge') ? 0.12 : 0.28;
        m.metalness = 0.95;
        if (envMap) {
          m.envMap = envMap;
          m.envMapIntensity = 1.2;
        }
      } else if (name.startsWith('gun_rubber') || name.startsWith('knife_handle')) {
        m.color.setHex(0x1b1d20);
        m.roughness = 0.85;
        m.metalness = 0.04;
      }
      m.needsUpdate = true;
      matMap.set(orig, m);
      return m;
    };
    obj.material = Array.isArray(obj.material) ? obj.material.map(dressOne) : dressOne(obj.material);
  });
}

async function buildCs2WorldWeaponMesh(weaponId, assetMgr, envMap, opts = {}) {
  if (!weaponId || isPistolWeapon(weaponId)) return null;

  const mod = await loadCs2WeaponModule();
  if (typeof mod?.createCs2WorldWeaponMesh === 'function') {
    try {
      const wep = await mod.createCs2WorldWeaponMesh(weaponId, assetMgr, envMap, opts);
      if (wep) return wep;
    } catch {
      // Fall through cleanly to direct GLB fallback
    }
  }

  const glbPath = getFallbackCs2GlbPath(weaponId);
  if (!glbPath || !assetMgr?.loadAssetGltf) return null;
  const gltf = await assetMgr.loadAssetGltf(glbPath);
  if (!gltf?.scene) return null;

  markSharedTemplateResources(gltf.scene);
  const clone = gltf.scene.clone(true);
  clone.name = `cs2WorldWeapon_${weaponId}`;
  dressFallbackCs2Weapon(clone, weaponId, envMap);
  if (weaponId === 'smg') {
    clone.scale.set(1, 1, 0.84);
  }
  return clone;
}

export function applySoldierTint(rig) {
  if (!rig || !rig._soldierAttached) return;
  const entries = rig._soldierMeshOrigMats;
  const modelPath = rig._soldierModelPath || TACTICAL_OPERATOR_GLB_PATH;
  const paletteKey = resolveSoldierPaletteKey(rig);
  const isShow = Boolean(rig._isShowcase);
  const isMate = Boolean(rig.isTeammate);

  if (Array.isArray(entries) && entries.length) {
    for (let i = 0; i < entries.length; i++) {
      const { mesh, orig } = entries[i];
      if (!mesh || !orig) continue;
      if (Array.isArray(orig)) {
        mesh.material = orig.map((m) =>
          getSharedOperatorMaterial(modelPath, paletteKey, isShow, isMate, m, mesh.name)
        );
      } else {
        mesh.material = getSharedOperatorMaterial(modelPath, paletteKey, isShow, isMate, orig, mesh.name);
      }
    }
  }

  if (rig._soldierRoot && rig._metalnessCap !== undefined && rig._metalnessCap !== null) {
    applyMetalnessCap(rig._soldierRoot, rig._metalnessCap);
  }
}

function applyRightHandMountTransform(rig, mount, posArr, extraRotArr, cs) {
  const gR = rig?._soldierGrip?.Right;
  if (gR?.hX && gR?.hY && gR?.hZ && gR?.qMount) {
    // Universal hand-basis mapping: posArr = [along(-palmOut), along(+fdir), along(+thumbTop)]
    mount.position
      .set(0, 0, 0)
      .addScaledVector(gR.hX, posArr[0] * cs)
      .addScaledVector(gR.hZ, -posArr[1] * cs)
      .addScaledVector(gR.hY, posArr[2] * cs);
    mount.quaternion.copy(gR.qMount);
    if (extraRotArr && (extraRotArr[0] || extraRotArr[1] || extraRotArr[2])) {
      _qc.setFromEuler(_e.set(extraRotArr[0], extraRotArr[1], extraRotArr[2]));
      mount.quaternion.multiply(_qc);
    }
  } else {
    mount.position.set(posArr[0] * cs, posArr[1] * cs, posArr[2] * cs);
    const rx = Math.PI * 0.5 + (extraRotArr ? extraRotArr[0] : 0);
    const ry = extraRotArr ? extraRotArr[1] : 0;
    const rz = extraRotArr ? extraRotArr[2] : 0;
    mount.rotation.set(rx, ry, rz);
  }
}

function setRightHandMountQuatInv(rig, extraRotArr, outQ) {
  const gR = rig?._soldierGrip?.Right;
  if (gR?.qMount) {
    outQ.copy(gR.qMount);
    if (extraRotArr && (extraRotArr[0] || extraRotArr[1] || extraRotArr[2])) {
      outQ.multiply(_qa.setFromEuler(_e.set(extraRotArr[0], extraRotArr[1], extraRotArr[2])));
    }
    return outQ.invert();
  }
  const rx = Math.PI * 0.5 + (extraRotArr ? extraRotArr[0] : 0);
  const ry = extraRotArr ? extraRotArr[1] : 0;
  const rz = extraRotArr ? extraRotArr[2] : 0;
  return outQ.setFromEuler(_e.set(rx, ry, rz)).invert();
}

export function calibrateSoldierWeaponMount(rig, weaponId, pose, tpWeaponScale = 1.12) {
  if (!rig || !rig._soldierAttached || !rig._soldierWeaponMount || !rig.gunHolder) return;
  const mount = rig._soldierWeaponMount;
  const wId = weaponId || rig.currentWeapon || 'rifle';
  const isKnife = wId === 'knife';
  const cs = rig._soldierHandCounterScale || 100;
  const hasCs2Weapon = Boolean(rig._soldierCs2Weapon && rig._soldierCs2WeaponId === wId);

  if (hasCs2Weapon) {
    const anchor = CS2_HAND_ANCHORS[getCs2AnchorKey(wId)] || CS2_HAND_ANCHORS.rifle;
    mount.scale.setScalar(cs);
    applyRightHandMountTransform(rig, mount, anchor.pos, anchor.extraRot, cs);
    if (rig._soldierCs2WeaponHolder) {
      rig._soldierCs2WeaponHolder.visible = true;
      rig._soldierCs2WeaponHolder.scale.setScalar(anchor.scale);
    }
    rig.gunHolder.visible = false;
  } else {
    mount.scale.setScalar(cs);
    if (isKnife) {
      applyRightHandMountTransform(rig, mount, CS2_HAND_ANCHORS.knife.pos, CS2_HAND_ANCHORS.knife.extraRot, cs);
    } else {
      applyRightHandMountTransform(rig, mount, [-0.038, 0.115, 0.08], null, cs);
    }
    if (rig._soldierCs2WeaponHolder) {
      rig._soldierCs2WeaponHolder.visible = false;
    }
    rig.gunHolder.visible = true;
  }

  if (pose) {
    rig.gunHolder.scale.set(
      pose.effScale[0] / tpWeaponScale,
      pose.effScale[1] / tpWeaponScale,
      pose.effScale[2] / tpWeaponScale
    );
    rig.gunHolder.rotation.set(0, 0, 0);
    rig.gunHolder.position.set(
      -pose.rGrip[0] * pose.effScale[0],
      -pose.rGrip[1] * pose.effScale[1],
      -pose.rGrip[2] * pose.effScale[2]
    );
  }

  if (rig._soldierCs2TargetWeaponId !== wId) {
    syncSoldierCs2Weapon(rig, wId);
  }
}

export async function syncSoldierCs2Weapon(rig, weaponId) {
  if (!rig || !rig._soldierAttached || rig._soldierDisposed || !rig._soldierCs2WeaponHolder) return false;
  const wId = weaponId || rig.currentWeapon || 'rifle';
  rig._soldierCs2TargetWeaponId = wId;
  const reqId = (rig._soldierWeaponReqId = (rig._soldierWeaponReqId || 0) + 1);

  if (isPistolWeapon(wId) || !canUseSoldierGlb()) {
    if (rig._soldierCs2Weapon) {
      disposeCs2WorldWeaponObj(rig._soldierCs2Weapon);
      rig._soldierCs2Weapon = null;
      rig._soldierCs2WeaponId = null;
      rig._soldierCs2FlashMesh = null;
      rig._soldierCs2FlashSprite = null;
      rig._soldierCs2WeaponEnv = null;
    }
    rig._soldierCs2WeaponHolder.visible = false;
    if (rig.gunHolder) rig.gunHolder.visible = true;
    calibrateSoldierWeaponMount(rig, wId, null);
    return false;
  }

  try {
    const assetMgr = rig._soldierAssets || getAssetManager();
    const envMap = rig._soldierScene?.environment || null;
    const effectiveCastShadow = Boolean(!rig._isShowcase && rig._castShadowApplied);
    const worldWep = await buildCs2WorldWeaponMesh(wId, assetMgr, envMap, {
      castShadow: effectiveCastShadow,
      receiveShadow: effectiveCastShadow
    });

    if (rig._soldierDisposed || !rig._soldierAttached || reqId !== rig._soldierWeaponReqId) {
      disposeCs2WorldWeaponObj(worldWep);
      return false;
    }

    if (!worldWep) {
      if (rig._soldierCs2Weapon) {
        disposeCs2WorldWeaponObj(rig._soldierCs2Weapon);
        rig._soldierCs2Weapon = null;
        rig._soldierCs2WeaponId = null;
        rig._soldierCs2FlashMesh = null;
        rig._soldierCs2FlashSprite = null;
        rig._soldierCs2WeaponEnv = null;
      }
      rig._soldierCs2WeaponHolder.visible = false;
      if (rig.gunHolder) rig.gunHolder.visible = true;
      calibrateSoldierWeaponMount(rig, wId, null);
      return false;
    }

    let muzzleNode = null;
    worldWep.traverse((obj) => {
      if (STRIPPED_VIEWMODEL_NODES.has(obj.name)) {
        obj.visible = false;
        return;
      }
      if (obj.name === 'Muzzle') {
        muzzleNode = obj;
      }
      if (obj.isMesh && !obj.userData?.isMuzzleFlash) {
        obj.frustumCulled = false;
        obj.castShadow = effectiveCastShadow;
        obj.receiveShadow = effectiveCastShadow;
        obj.userData = {
          ...(obj.userData || {}),
          isSoldierGlbMesh: true,
          isCs2WorldWeaponMesh: true,
          isOutline: false,
          isHitbox: false,
          isContactShadow: false
        };
      }
    });

    if (rig._metalnessCap !== undefined && rig._metalnessCap !== null) {
      applyMetalnessCap(worldWep, rig._metalnessCap);
    }

    let flashMesh = worldWep.userData?.flashMesh || null;
    let flashSprite = worldWep.userData?.flashSprite || (flashMesh?.isSprite ? flashMesh : null);
    if (!flashMesh && wId !== 'knife') {
      const flashTex = getSoldierFlashTexture();
      if (flashTex) {
        const flashMat = new THREE.SpriteMaterial({
          map: flashTex,
          color: 0xffe0a8,
          transparent: true,
          blending: THREE.AdditiveBlending,
          depthWrite: false
        });
        flashMat.userData = { shared: false };
        const sprite = new THREE.Sprite(flashMat);
        sprite.name = 'cs2SoldierMuzzleFlash';
        sprite.scale.setScalar(isSniperWeapon(wId) ? 0.34 : 0.24);
        sprite.visible = false;
        sprite.userData = { isMuzzleFlash: true, noShadow: true, isOutline: false, isHitbox: false };
        if (muzzleNode) {
          muzzleNode.add(sprite);
        } else {
          sprite.position.set(0, 0.01, -0.74);
          worldWep.add(sprite);
        }
        flashMesh = sprite;
        flashSprite = sprite;
      }
    } else if (flashMesh) {
      flashMesh.visible = false;
    }

    if (rig._soldierCs2Weapon) {
      disposeCs2WorldWeaponObj(rig._soldierCs2Weapon);
    }

    rig._soldierCs2Weapon = worldWep;
    rig._soldierCs2WeaponId = wId;
    rig._soldierCs2FlashMesh = flashMesh;
    rig._soldierCs2FlashSprite = flashSprite;
    rig._soldierCs2WeaponEnv = envMap;
    rig._soldierCs2WeaponHolder.add(worldWep);
    rig._soldierCs2WeaponHolder.visible = true;
    if (rig.gunHolder) rig.gunHolder.visible = false;

    calibrateSoldierWeaponMount(rig, wId, null);
    return true;
  } catch {
    return false;
  }
}

function hideProceduralBodyVisuals(rig) {
  if (rig.pelvisVisualGroup) rig.pelvisVisualGroup.visible = false;
  if (rig.torsoVisualGroup) rig.torsoVisualGroup.visible = false;
  if (rig.headGroup) {
    for (let i = 0; i < rig.headGroup.children.length; i++) {
      const child = rig.headGroup.children[i];
      if (!child.userData?.isHitbox && !child.userData?.isHitboxProxy) {
        child.visible = false;
      }
    }
  }
  if (rig.leftArm) rig.leftArm.visible = false;
  if (rig.rightArm) rig.rightArm.visible = false;
  if (rig.leftLeg) rig.leftLeg.visible = false;
  if (rig.rightLeg) rig.rightLeg.visible = false;
  if (Array.isArray(rig.outlineMeshes)) {
    for (let i = 0; i < rig.outlineMeshes.length; i++) {
      if (rig.outlineMeshes[i]) rig.outlineMeshes[i].visible = false;
    }
  }
}

function detachSoldierMeshOnly(rig) {
  if (!rig) return;
  if (rig.gunHolder && rig.armPivot && rig.gunHolder.parent !== rig.armPivot) {
    rig.armPivot.add(rig.gunHolder);
    rig.gunHolder.visible = true;
  }
  if (rig._soldierCs2Weapon) {
    disposeCs2WorldWeaponObj(rig._soldierCs2Weapon);
  }
  if (Array.isArray(rig._soldierMeshes)) {
    for (let i = 0; i < rig._soldierMeshes.length; i++) {
      const m = rig._soldierMeshes[i];
      if (m?.isSkinnedMesh) {
        m.skeleton?.dispose?.();
      }
    }
  }
  if (rig._soldierMixer) {
    try {
      rig._soldierMixer.stopAllAction();
      if (rig._soldierRoot) {
        rig._soldierMixer.uncacheRoot(rig._soldierRoot);
      }
    } catch {
      // Ignore mixer teardown errors
    }
  }
  if (rig._soldierRoot) {
    rig._soldierRoot.parent?.remove(rig._soldierRoot);
  }
  if (Array.isArray(rig._soldierBodyMats)) {
    for (let i = 0; i < rig._soldierBodyMats.length; i++) {
      const m = rig._soldierBodyMats[i];
      if (m && !m.userData?.shared) m.dispose?.();
    }
  }
  if (Array.isArray(rig._soldierVisorMats)) {
    for (let i = 0; i < rig._soldierVisorMats.length; i++) {
      const m = rig._soldierVisorMats[i];
      if (m && !m.userData?.shared) m.dispose?.();
    }
  }
  rig._soldierRoot = null;
  rig._soldierMeshes = null;
  rig._soldierMeshOrigMats = null;
  rig._soldierMixer = null;
  rig._soldierActions = null;
  rig._soldierBones = null;
  rig._soldierGrip = null;
  rig._soldierSnap = null;
  rig._soldierBodyMats = null;
  rig._soldierVisorMats = null;
  rig._soldierWeaponMount = null;
  rig._soldierCs2WeaponHolder = null;
  rig._soldierCs2Weapon = null;
  rig._soldierCs2WeaponId = null;
  rig._soldierCs2TargetWeaponId = null;
  rig._soldierCs2FlashMesh = null;
  rig._soldierCs2FlashSprite = null;
  rig._soldierCs2WeaponEnv = null;
  rig._soldierBaseX = 0;
  rig._soldierBaseZ = 0;
  rig._soldierAttached = false;
}

function measureSkinnedBounds(root, meshes, intoBox) {
  intoBox.makeEmpty();
  root.updateMatrixWorld(true);
  const visible = meshes.filter((m) => m && m.visible);
  const skinned = visible.filter((m) => m.isSkinnedMesh && typeof m.computeBoundingBox === 'function');
  const list = skinned.length ? skinned : visible;
  for (let i = 0; i < list.length; i++) {
    const m = list[i];
    if (m.isSkinnedMesh && typeof m.computeBoundingBox === 'function') {
      m.computeBoundingBox();
      if (m.boundingBox && !m.boundingBox.isEmpty()) {
        intoBox.union(_bb.copy(m.boundingBox).applyMatrix4(m.matrixWorld));
        continue;
      }
    }
    if (m.geometry) {
      if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
      if (m.geometry.boundingBox && !m.geometry.boundingBox.isEmpty()) {
        intoBox.union(_bb.copy(m.geometry.boundingBox).applyMatrix4(m.matrixWorld));
      }
    }
  }
  return intoBox;
}

export async function attachSoldierGlbToRig(rig, options = {}) {
  if (!rig || !rig.group || rig._soldierDisposed) return false;
  if (!canUseSoldierGlb() || options.enableSoldierGlb === false) return false;

  if (options.assets) rig._soldierAssets = options.assets;
  if (options.scene) rig._soldierScene = options.scene;

  const modelPath = resolveSoldierModelPath(rig, options);
  if (rig._soldierAttached && rig._soldierModelPath === modelPath && !options.forceReload) {
    applySoldierTint(rig);
    return true;
  }
  if (rig._soldierAttachPromise && rig._soldierLoadingModelPath === modelPath && !options.forceReload) {
    return rig._soldierAttachPromise;
  }

  const attachSeq = (rig._soldierAttachSeq = (rig._soldierAttachSeq || 0) + 1);
  rig._soldierLoadingModelPath = modelPath;
  const hadParentAtStart = Boolean(rig.group.parent);

  const promise = (async () => {
    try {
      const assetMgr = options.assets || rig._soldierAssets || getAssetManager();
      const needDonor = modelPath !== SOLDIER_ANIM_DONOR_PATH;
      const [primaryGltf, donorGltf, SkeletonUtils] = await Promise.all([
        assetMgr?.loadAssetGltf?.(modelPath).catch(() => null),
        needDonor ? assetMgr?.loadAssetGltf?.(SOLDIER_ANIM_DONOR_PATH).catch(() => null) : Promise.resolve(null),
        loadSkeletonUtils()
      ]);

      const gltf = primaryGltf?.scene ? primaryGltf : donorGltf?.scene ? donorGltf : null;
      const effectiveModelPath = primaryGltf?.scene ? modelPath : SOLDIER_ANIM_DONOR_PATH;

      if (!gltf?.scene || !SkeletonUtils?.clone) return false;
      if (
        rig._soldierDisposed ||
        attachSeq !== rig._soldierAttachSeq ||
        (hadParentAtStart && !rig.group.parent) ||
        (options.requireParent && !rig.group.parent)
      ) {
        return false;
      }

      if (rig._soldierAttached) {
        detachSoldierMeshOnly(rig);
      }

      markSharedTemplateResources(gltf.scene);
      const soldierRoot = SkeletonUtils.clone(gltf.scene);
      soldierRoot.name = 'soldierGlbRoot';
      soldierRoot.updateMatrixWorld(true);

      // Measure hand/finger frames strictly from REST pose BEFORE AnimationMixer touches any bones
      const bones = findCanonicalBones(soldierRoot);
      const gripFrames = findHandGripFrames(soldierRoot);
      const meshes = [];
      const meshOrigMats = [];
      const effectiveCastShadow = Boolean(
        !rig._isShowcase && !options.isShowcase && (rig._castShadowApplied ?? options.castShadow)
      );

      soldierRoot.traverse((obj) => {
        if (!obj.isMesh) return;
        if (obj.geometry) {
          obj.geometry.userData = { ...(obj.geometry.userData || {}), shared: true };
          if (!obj.geometry.boundingSphere) obj.geometry.computeBoundingSphere();
        }
        if (isHiddenOperatorMesh(obj)) {
          obj.visible = false;
          obj.castShadow = false;
          obj.receiveShadow = false;
          return;
        }
        meshes.push(obj);
        meshOrigMats.push({ mesh: obj, orig: obj.material });
        const isRigidEye = RIGID_EYE_MESHES.has(obj.name);
        obj.frustumCulled = false;
        obj.castShadow = isRigidEye ? false : effectiveCastShadow;
        obj.receiveShadow = isRigidEye ? false : effectiveCastShadow;
        obj.userData = {
          ...(obj.userData || {}),
          isSoldierGlbMesh: true,
          isOutline: false,
          isHitbox: false,
          isContactShadow: false
        };
      });

      const rightHand = bones.RightHand;
      if (!rightHand) {
        return false;
      }

      // Initial height normalization on visible skinned rest bounds
      measureSkinnedBounds(soldierRoot, meshes, _tmpBox);
      const rawH = _tmpBox.isEmpty() ? 1.84 : _tmpBox.max.y - _tmpBox.min.y;
      const initScale = rawH > 0.5 && rawH < 3.5 ? CS2_RIG.height / rawH : 1.0;
      soldierRoot.scale.multiplyScalar(initScale);
      soldierRoot.position.set(0, _tmpBox.isEmpty() ? 0 : -_tmpBox.min.y * initScale, 0);

      // Build clip actions: strictly real Mixamo Idle / Walk / Run (retargeting from Soldier.glb if needed, NEVER blending TPose!)
      const mixer = new THREE.AnimationMixer(soldierRoot);
      let clips = gltf.animations || [];
      if (!clips.length && donorGltf?.animations?.length) {
        clips = getRetargetedMixamoClips(
          `${effectiveModelPath}<-${SOLDIER_ANIM_DONOR_PATH}`,
          donorGltf,
          soldierRoot,
          gripFrames
        );
      }
      const findClip = (name) =>
        clips.find((c) => c.name === name) ||
        clips.find((c) => String(c.name || '').toLowerCase() === name.toLowerCase()) ||
        null;

      const idleClip = findClip('Idle') || clips[0] || null;
      const walkClip = findClip('Walk') || idleClip;
      const runClip = findClip('Run') || walkClip;

      const actions = {
        idle: idleClip ? mixer.clipAction(idleClip) : null,
        walk: walkClip ? mixer.clipAction(walkClip) : null,
        run: runClip ? mixer.clipAction(runClip) : null
      };

      const startAction = (act, weight) => {
        if (!act) return;
        act.enabled = true;
        act.setEffectiveTimeScale(1);
        act.setEffectiveWeight(weight);
        act.play();
      };

      startAction(actions.idle, 1);
      if (actions.walk && actions.walk !== actions.idle) startAction(actions.walk, 0);
      if (actions.run && actions.run !== actions.idle && actions.run !== actions.walk) startAction(actions.run, 0);

      // Snapshot every bone we touch procedurally (body + all fingers) so mixer edits never accumulate
      const posedBones = new Set(Object.values(bones));
      for (const g of Object.values(gripFrames)) {
        for (let i = 0; i < g.thumb.length; i++) posedBones.add(g.thumb[i]);
        for (let c = 0; c < g.chains.length; c++) {
          for (let j = 0; j < g.chains[c].length; j++) posedBones.add(g.chains[c][j]);
        }
      }
      const boneSnap = Array.from(posedBones).map((b) => ({
        b,
        p: b.position.clone(),
        q: b.quaternion.clone(),
        on: false
      }));

      rig.group.add(soldierRoot);
      mixer.update(0);
      soldierRoot.updateMatrixWorld(true);

      // Re-fit standing height, boot ground plane (y=0), and horizontal center on settled Idle silhouette
      const invGroup = _m4.copy(rig.group.matrixWorld).invert();
      measureSkinnedBounds(soldierRoot, meshes, _tmpBox);
      if (!_tmpBox.isEmpty()) {
        _tmpBox.applyMatrix4(invGroup);
        const posedH = _tmpBox.max.y - _tmpBox.min.y;
        if (posedH > 0.5 && posedH < 3.5) {
          const k = CS2_RIG.height / posedH;
          soldierRoot.scale.multiplyScalar(k);
          soldierRoot.position.y = (soldierRoot.position.y - _tmpBox.min.y) * k;
        }
      }
      soldierRoot.updateMatrixWorld(true);

      let baseX = 0;
      let baseZ = 0;
      if (bones.Hips) {
        bones.Hips.getWorldPosition(_p1).applyMatrix4(invGroup);
        baseX = -THREE.MathUtils.clamp(_p1.x, -0.35, 0.35);
        baseZ = -THREE.MathUtils.clamp(_p1.z, -0.35, 0.35);
        soldierRoot.position.x = baseX;
        soldierRoot.position.z = baseZ;
        soldierRoot.updateMatrixWorld(true);
      }

      const baseY = soldierRoot.position.y;
      const units = bones.Hips?.parent ? 1 / Math.max(1e-5, bones.Hips.parent.getWorldScale(_tmpScale).x) : 100;

      // Mount weapon onto RightHand with exact world-scale cancellation (1 / handWorldScale) & universal hand basis
      rightHand.getWorldScale(_tmpScale);
      const avgHandScale = (Math.abs(_tmpScale.x) + Math.abs(_tmpScale.y) + Math.abs(_tmpScale.z)) / 3;
      const counterScale = avgHandScale > 1e-5 ? 1 / avgHandScale : 100;

      const soldierWeaponMount = new THREE.Group();
      soldierWeaponMount.name = 'soldierWeaponMount';
      soldierWeaponMount.scale.setScalar(counterScale);
      rig._soldierGrip = gripFrames;
      applyRightHandMountTransform(rig, soldierWeaponMount, CS2_HAND_ANCHORS.rifle.pos, CS2_HAND_ANCHORS.rifle.extraRot, counterScale);
      rightHand.add(soldierWeaponMount);

      const cs2WeaponHolder = new THREE.Group();
      cs2WeaponHolder.name = 'soldierCs2WeaponHolder';
      cs2WeaponHolder.visible = false;
      soldierWeaponMount.add(cs2WeaponHolder);

      if (rig.gunHolder) {
        soldierWeaponMount.add(rig.gunHolder);
      }

      if (options.fromBuilder) {
        rig._isShowcase = Boolean(rig._isShowcase ?? options.isShowcase);
        if (rig._soldierColorHex === undefined && options.colorHex !== undefined) {
          rig._soldierColorHex = options.colorHex;
        }
        if (rig.isTeammate === undefined && options.isTeammate !== undefined) {
          rig.isTeammate = Boolean(options.isTeammate);
        }
        if (!rig.team && options.team !== undefined) {
          rig.team = options.team || null;
        }
      } else {
        if (options.isShowcase !== undefined) rig._isShowcase = Boolean(options.isShowcase);
        if (options.colorHex !== undefined) rig._soldierColorHex = options.colorHex;
        if (options.isTeammate !== undefined) rig.isTeammate = Boolean(options.isTeammate);
        if (options.team !== undefined) rig.team = options.team || null;
      }

      rig._soldierRoot = soldierRoot;
      rig._soldierMeshes = meshes;
      rig._soldierMeshOrigMats = meshOrigMats;
      rig._soldierModelPath = effectiveModelPath;
      rig._soldierBaseX = baseX;
      rig._soldierBaseY = baseY;
      rig._soldierBaseZ = baseZ;
      rig._soldierUnits = units;
      rig._soldierHandCounterScale = counterScale;
      rig._soldierMixer = mixer;
      rig._soldierActions = actions;
      rig._soldierBones = bones;
      rig._soldierGrip = gripFrames;
      rig._soldierSnap = boneSnap;
      rig._soldierBodyMats = null;
      rig._soldierVisorMats = null;
      rig._soldierWeaponMount = soldierWeaponMount;
      rig._soldierCs2WeaponHolder = cs2WeaponHolder;
      rig._soldierCs2Weapon = null;
      rig._soldierCs2WeaponId = null;
      rig._soldierCs2TargetWeaponId = null;
      rig._soldierCs2FlashMesh = null;
      rig._soldierCs2FlashSprite = null;
      rig._soldierCs2WeaponEnv = null;
      rig._soldierState = {
        idleW: 1,
        walkW: 0,
        runW: 0,
        moveBlend: 0,
        aimBlend: rig._isShowcase ? 0 : 0.72,
        crouchBlend: rig.crouchBlend || 0,
        proneBlend: rig.proneBlend || 0,
        slideBlend: rig.slideBlend || 0,
        leanBlend: rig.leanBlend || 0,
        deathBlend: rig.alive === false ? 1 : 0,
        animT: (hashPlayerKey(rig.id ?? 'bot') % 100) * 0.07
      };
      rig._soldierAttached = true;
      rig._updateSoldierTint = () => applySoldierTint(rig);

      hideProceduralBodyVisuals(rig);
      applySoldierTint(rig);

      const activeWeapon = rig.currentWeapon || options.weaponId || 'rifle';
      rig.poseForWeapon?.(activeWeapon);
      syncSoldierCs2Weapon(rig, activeWeapon);
      updateSoldierGlbAnimation(rig, 0, false, 0, Boolean(rig.crouching || rig.crouch), rig.alive === false);
      return true;
    } catch {
      return false;
    } finally {
      if (rig._soldierAttachPromise === promise) {
        rig._soldierAttachPromise = null;
      }
    }
  })();

  rig._soldierAttachPromise = promise;
  return promise;
}

export function syncSoldierGlbVariant(rig, options = {}) {
  if (!rig || rig._soldierDisposed) return false;
  if (!canUseSoldierGlb()) return false;
  const targetPath = resolveSoldierModelPath(rig, options);
  if (rig._soldierAttached && (rig._soldierModelPath === targetPath || rig._soldierModelPath === SOLDIER_ANIM_DONOR_PATH && targetPath === TACTICAL_OPERATOR_GLB_PATH)) {
    applySoldierTint(rig);
    return true;
  }
  return attachSoldierGlbToRig(rig, {
    ...options,
    isShowcase: rig._isShowcase,
    demoVariant: rig.demoVariant,
    colorHex: rig._soldierColorHex,
    isTeammate: rig.isTeammate,
    team: rig.team,
    weaponId: rig.currentWeapon,
    assets: rig._soldierAssets,
    scene: rig._soldierScene,
    requireParent: Boolean(rig.group?.parent)
  });
}

function solveTwoHandedRiflePose(rig, B, anchor, ab, runBlend, pitchTarget, recoilKick, weaponObj) {
  const H = CS2_RIG.hold;
  const cr = 1 - ab;
  const place = (out, from, a, b, k) =>
    out
      .copy(from)
      .addScaledVector(_rightW, a[0] + (b[0] - a[0]) * k)
      .addScaledVector(_upW, a[1] + (b[1] - a[1]) * k)
      .addScaledVector(_fwdW, a[2] + (b[2] - a[2]) * k);

  B.RightArm.getWorldPosition(_h7);
  if (B.LeftArm) {
    B.LeftArm.getWorldPosition(_g2);
  } else {
    _g2.copy(_h7).addScaledVector(_rightW, -0.38);
  }

  // Carry pose (low-ready <-> run carry) anchored between RightArm butt & LeftArm guard
  const butt = place(_h8, _h7, H.low.butt, H.run.butt, runBlend);
  const guard = place(_g3, _g2, H.low.guard, H.run.guard, runBlend);
  const barrel = _h3.copy(guard).sub(butt).normalize();
  let cant = (H.low.cant + (H.run.cant - H.low.cant) * runBlend) * DEG;

  // Blend smoothly into shouldered combat aim pose
  if (ab > 0.001) {
    const effPitch = H.aim.rot[0] * DEG + pitchTarget + recoilKick * 0.045;
    const yawOff = H.aim.rot[1] * DEG;
    const ba = _h5.copy(_fwdW).applyAxisAngle(_upW, yawOff).multiplyScalar(Math.cos(effPitch));
    ba.addScaledVector(_upW, Math.sin(effPitch));
    barrel.multiplyScalar(cr).addScaledVector(ba, ab).normalize();
    const aimButt = place(_h6, _h7, H.aim.butt, H.aim.butt, 0);
    butt.multiplyScalar(cr).addScaledVector(aimButt, ab);
    cant = cant * cr + H.aim.rot[2] * DEG * ab;
  }

  // Rifle world frame: Z = -barrel, X = barrel x up, Y = Z x X, then cant about barrel
  const X = _h4.crossVectors(barrel, _upW).normalize();
  const Z = _h5.copy(barrel).negate();
  const Y = _h6.crossVectors(Z, X);
  _m4.makeBasis(X, Y, Z);
  const qr = _qr.setFromRotationMatrix(_m4).multiply(_qc.setFromAxisAngle(_ZAXIS, cant));

  // Butt anchor -> rifle origin -> exact right wrist target
  const buttLoc = anchor.buttLocal || CS2_HAND_ANCHORS.rifle.buttLocal;
  const gripLoc = anchor.gripLocal || CS2_HAND_ANCHORS.rifle.gripLocal;
  const origin = butt.sub(_h3.fromArray(buttLoc).applyQuaternion(qr));
  const wrist = _h7.fromArray(gripLoc).applyQuaternion(qr).add(origin);

  const rp = CS2_RIG.rightPole;
  const rPole = _h9
    .copy(_rightW)
    .multiplyScalar(rp[0])
    .addScaledVector(_upW, rp[1])
    .addScaledVector(_fwdW, rp[2]);
  ik2(B.RightArm, B.RightForeArm, B.RightHand, wrist, rPole);

  // Orient RightHand via universal measured hand basis so mounted rifle lands directly on `qr`
  setRightHandMountQuatInv(rig, anchor.extraRot, _qc);
  B.RightHand.parent.getWorldQuaternion(_qa).invert();
  B.RightHand.quaternion.copy(_qa.multiply(_qb.copy(qr).multiply(_qc)));
  B.RightHand.updateWorldMatrix(false, false);

  // Solve support LeftArm IK + measured palm orientation onto underside of weapon handguard
  const G = rig._soldierGrip?.Left;
  if (B.LeftArm && B.LeftForeArm && B.LeftHand && weaponObj) {
    weaponObj.updateWorldMatrix(true, false);
    const hgArr = anchor.handguard || CS2_HAND_ANCHORS.rifle.handguard;
    const hgCarry = anchor.handguardCarry ?? CS2_HAND_ANCHORS.rifle.handguardCarry;
    const hg = _h3.set(hgArr[0], hgArr[1], THREE.MathUtils.lerp(hgCarry, hgArr[2], ab));
    const lwScale = G?.handLenScale ?? 1;
    _g1.set(CS2_RIG.leftWrist[0] * lwScale, CS2_RIG.leftWrist[1] * lwScale, CS2_RIG.leftWrist[2] * lwScale).applyQuaternion(qr);
    const leftTarget = hg.applyMatrix4(weaponObj.matrixWorld).add(_g1);

    const lp = CS2_RIG.leftPole;
    const lPole = _h9
      .copy(_rightW)
      .multiplyScalar(lp[0])
      .addScaledVector(_upW, lp[1])
      .addScaledVector(_fwdW, lp[2]);
    ik2(B.LeftArm, B.LeftForeArm, B.LeftHand, leftTarget, lPole);

    if (G) {
      const pw = _g2.fromArray(CS2_RIG.leftPalm).applyQuaternion(qr).normalize();
      const fw = _g3.fromArray(CS2_RIG.leftFingers).applyQuaternion(qr);
      fw.addScaledVector(pw, -pw.dot(fw)).normalize();
      _m4.makeBasis(fw, pw, _g1.crossVectors(fw, pw));
      B.LeftHand.parent.getWorldQuaternion(_qa).invert();
      B.LeftHand.quaternion.copy(_qa.multiply(_qb.setFromRotationMatrix(_m4).multiply(G.qGrip)));
      B.LeftHand.updateWorldMatrix(false, false);
    }
  }
}

export function updateSoldierGlbAnimation(
  rig,
  dt = 0,
  moving = false,
  speedNorm = 0,
  isCrouching = false,
  isDead = false
) {
  if (!rig || !rig._soldierAttached || !rig._soldierMixer || rig._soldierDisposed) return false;
  const st = rig._soldierState;
  const actions = rig._soldierActions;
  const B = rig._soldierBones;
  const soldierRoot = rig._soldierRoot;
  if (!st || !actions || !B || !soldierRoot) return false;

  const safeDt = Number.isFinite(dt) && dt > 0 ? Math.min(0.25, dt) : 0;
  st.animT = (st.animT || 0) + safeDt;

  const dead = Boolean(isDead || rig.alive === false);
  const prone = !dead && Boolean(rig.prone);
  const sliding = !dead && !prone && Boolean(rig.sliding || rig.isSliding);
  const crouching = !dead && !prone && Boolean(isCrouching || rig.crouching || rig.crouch || sliding);
  const leanTarget = dead ? 0 : Math.max(-1, Math.min(1, Number(rig.lean || 0)));
  const pitchTarget = dead ? 0 : Math.max(-1.05, Math.min(1.05, Number(rig.targetPitch || 0)));
  const isShow = Boolean(rig._isShowcase);

  const nowMs = rig._soldierLastPosterNow || (typeof performance !== 'undefined' ? performance.now() : 0);
  const shotAgeMs = rig.lastShotFlashAt > 0 && nowMs >= rig.lastShotFlashAt ? nowMs - rig.lastShotFlashAt : 9999;
  const flashActive = Boolean(rig.gunMesh?.userData?.flashMesh?.visible) || shotAgeMs <= 55;
  const testFiring = !dead && shotAgeMs <= 420;
  const recoilKick = !dead && shotAgeMs < 140 ? Math.sin((1 - shotAgeMs / 140) * Math.PI * 0.5) : 0;

  if (rig._soldierCs2FlashMesh) {
    rig._soldierCs2FlashMesh.visible = flashActive && !dead;
    const flashMat = rig._soldierCs2FlashSprite?.material || rig._soldierCs2FlashMesh.material;
    if (flashActive && flashMat) {
      flashMat.rotation = (nowMs * 0.17) % (Math.PI * 2);
    }
  }

  const blendRate = (rate, fallback) => (safeDt > 0 ? 1 - Math.exp(-rate * safeDt) : fallback);
  const postureAlpha = blendRate(10, 0.35);
  st.proneBlend += ((prone ? 1 : 0) - st.proneBlend) * postureAlpha;
  st.slideBlend += ((sliding ? 1 : 0) - st.slideBlend) * blendRate(14, 0.45);
  st.crouchBlend += ((crouching ? 1 : 0) - st.crouchBlend) * postureAlpha;
  st.leanBlend += (leanTarget - st.leanBlend) * blendRate(14, 0.4);
  const spd = Math.max(0, Math.min(1.2, Number(speedNorm) || 0));
  st.moveBlend += (((!dead && moving && spd > 0.02) ? 1 : 0) - (st.moveBlend || 0)) * blendRate(8, 0.5);

  // Showcase stands in natural CS2 low-ready (raises to aim during "BẮN THỬ"); combat bots hold shouldered aim
  const aimTarget = dead || prone ? 0 : isShow ? (testFiring ? 1.0 : 0.0) : spd > 0.72 ? 0.35 : 0.88;
  st.aimBlend = (st.aimBlend ?? aimTarget) + (aimTarget - (st.aimBlend ?? aimTarget)) * blendRate(7, 0.5);

  if (dead) {
    st.deathBlend = Math.min(1, st.deathBlend + blendRate(11, 0.35));
  } else {
    st.deathBlend = 0;
  }

  // Lazy envMap refresh when HDRI PMREM arrives asynchronously
  const curEnv = rig._soldierScene?.environment || null;
  if (curEnv && rig._soldierCs2Weapon && rig._soldierCs2WeaponEnv !== curEnv) {
    rig._soldierCs2WeaponEnv = curEnv;
    loadCs2WeaponModule().then((mod) => {
      if (rig._soldierDisposed || !rig._soldierCs2Weapon) return;
      mod?.refreshCs2WeaponEnvMap?.(rig._soldierCs2Weapon, curEnv);
    });
  }

  // Pure Idle / Walk / Run clip weights (NEVER mix TPose!)
  let tIdle = 1;
  let tWalk = 0;
  let tRun = 0;
  if (!dead && moving && spd > 0.02) {
    if (crouching || prone || spd < 0.70) {
      const wAmt = Math.min(1, Math.max(0.25, spd / 0.55));
      tWalk = wAmt;
      tIdle = 1 - wAmt;
    } else {
      const rAmt = Math.min(1, Math.max(0, (spd - 0.65) / 0.35));
      tRun = rAmt;
      tWalk = 1 - rAmt;
      tIdle = 0;
    }
  }

  const wAlpha = blendRate(10, 1);
  st.idleW += (tIdle - st.idleW) * wAlpha;
  st.walkW += (tWalk - st.walkW) * wAlpha;
  st.runW += (tRun - st.runW) * wAlpha;
  const wSum = st.idleW + st.walkW + st.runW;
  const invSum = wSum > 1e-5 ? 1 / wSum : 1;
  if (actions.idle) actions.idle.setEffectiveWeight(st.idleW * invSum);
  if (actions.walk && actions.walk !== actions.idle) {
    actions.walk.setEffectiveWeight(st.walkW * invSum);
    actions.walk.setEffectiveTimeScale(crouching ? 0.80 : 1.0);
  }
  if (actions.run && actions.run !== actions.walk && actions.run !== actions.idle) {
    actions.run.setEffectiveWeight(st.runW * invSum);
    actions.run.setEffectiveTimeScale(1.05);
  }

  // CRITICAL: Restore pre-procedural bone pose BEFORE mixer.update(), then save pure mixed pose
  restoreMixedPose(rig);
  rig._soldierMixer.update(dead ? 0 : safeDt);
  saveMixedPose(rig);

  const cb = st.crouchBlend;
  const pb = st.proneBlend;
  const sb = st.slideBlend;
  const lb = st.leanBlend;
  const db = st.deathBlend;
  const ab = st.aimBlend;
  const mb = st.moveBlend;

  // Root placement (centered on pedestal / hitbox with grounded boots at baseY)
  soldierRoot.position.set(
    (rig._soldierBaseX || 0) + lb * 0.16 * (1 - db),
    THREE.MathUtils.lerp(rig._soldierBaseY ?? 0, 0.20, Math.max(pb, db)) - sb * 0.06,
    (rig._soldierBaseZ || 0) + pb * 0.65 + db * 0.55
  );
  soldierRoot.rotation.set(
    -pb * 1.42 - db * 1.45,
    -sb * 0.28,
    -lb * 0.14 * (1 - db) + sb * 0.16
  );

  // Compute soldierRoot's exact world frame (works identically in lobby camera-space & arena world-space)
  soldierRoot.updateMatrixWorld(true);
  soldierRoot.getWorldQuaternion(_rootQ);
  _upW.set(0, 1, 0).applyQuaternion(_rootQ).normalize();
  _fwdW.set(0, 0, -1).applyQuaternion(_rootQ).normalize();
  _rightW.set(1, 0, 0).applyQuaternion(_rootQ).normalize();

  // Procedural crouch knee flexion + grounded hip drop (exact Bot.js _crouchPose)
  if (cb > 0.004 && B.Hips) {
    const [th, kn, ft] = CS2_RIG.crouchLegs;
    B.Hips.getWorldPosition(_p1);
    _p1.addScaledVector(_upW, -CS2_RIG.crouchDrop * cb);
    if (B.Hips.parent) {
      B.Hips.position.copy(B.Hips.parent.worldToLocal(_p1));
      B.Hips.updateWorldMatrix(false, false);
    }
    rotW(B.LeftUpLeg, _rightW, th * DEG * cb);
    rotW(B.RightUpLeg, _rightW, th * DEG * cb);
    rotW(B.LeftLeg, _rightW, kn * DEG * cb);
    rotW(B.RightLeg, _rightW, kn * DEG * cb);
    rotW(B.LeftFoot, _rightW, ft * DEG * cb);
    rotW(B.RightFoot, _rightW, ft * DEG * cb);
  }

  if (!dead && !prone) {
    // Subtle idle breathing / weight-shift sway
    const idleFactor = (1 - mb) * (1 - ab * 0.5) * (1 - cb);
    const S = CS2_RIG.sway;
    const t = st.animT;
    if (idleFactor > 0.01 && B.Hips) {
      B.Hips.position.x += Math.sin((t * 2 * Math.PI) / S.tHips) * S.hips * idleFactor * (rig._soldierUnits || 100);
      B.Hips.updateWorldMatrix(false, false);
    }
    const swPitch = Math.sin((t * 2 * Math.PI) / S.tPitch) * S.pitch * DEG * idleFactor;
    const swRoll = Math.sin((t * 2 * Math.PI) / S.tRoll + 1.3) * S.roll * DEG * idleFactor;

    // Bladed CS2 tactical torso stance (-18 deg off aim line so left shoulder leads cleanly, head looks straight ahead)
    const ys = CS2_RIG.aimYawSplit;
    const ps = CS2_RIG.aimPitchSplit;
    const blade = CS2_RIG.blade * DEG * (0.55 + 0.45 * ab);
    const sy3 = ys[0] + ys[1] + ys[2];
    const leanForward = -cb * 14 * DEG - mb * 4 * DEG;
    const effPitch = pitchTarget * (0.4 + 0.6 * ab);

    rotW(B.Spine, _upW, blade * ys[0]);
    rotW(B.Spine, _rightW, leanForward * 0.5 + effPitch * ps[0] + swPitch * 0.5);
    rotW(B.Spine, _fwdW, swRoll * 0.5 - lb * 0.16);

    rotW(B.Spine1, _upW, blade * ys[1]);
    rotW(B.Spine1, _rightW, leanForward * 0.5 + effPitch * ps[1] + swPitch * 0.5);
    rotW(B.Spine1, _fwdW, swRoll * 0.5 - lb * 0.18);

    rotW(B.Spine2, _upW, blade * ys[2]);
    rotW(B.Spine2, _rightW, effPitch * ps[2]);

    rotW(B.Head, _upW, -blade * sy3);
    rotW(B.Head, _rightW, effPitch * ps[3] - swPitch * 0.6);

    // Solve clean two-anchor weapon hold + IK + finger curl
    const wId = rig.currentWeapon || 'rifle';
    const isKnife = wId === 'knife';
    const isPistol = isPistolWeapon(wId);
    const anchor = CS2_HAND_ANCHORS[getCs2AnchorKey(wId)] || CS2_HAND_ANCHORS.rifle;
    const weaponObj = rig._soldierCs2Weapon || rig._soldierWeaponMount;

    if (B.RightArm && B.RightForeArm && B.RightHand) {
      if (isKnife) {
        // Relaxed tactical knife guard in RightHand (no shoulder distortion, left arm natural from clip)
        B.RightArm.getWorldPosition(_h7);
        const knifeWrist = _h8
          .copy(_h7)
          .addScaledVector(_rightW, 0.06)
          .addScaledVector(_upW, -0.34)
          .addScaledVector(_fwdW, 0.30);
        const rp = CS2_RIG.rightPole;
        const rPole = _h9
          .copy(_rightW)
          .multiplyScalar(rp[0])
          .addScaledVector(_upW, rp[1])
          .addScaledVector(_fwdW, rp[2]);
        ik2(B.RightArm, B.RightForeArm, B.RightHand, knifeWrist, rPole);
        applyFingerGripPose(rig, 'Right', 0.9);
      } else if (isPistol) {
        // Two-handed tactical pistol ready stance anchored off RightArm
        B.RightArm.getWorldPosition(_h7);
        const pistolWrist = _h8
          .copy(_h7)
          .addScaledVector(_rightW, -0.06)
          .addScaledVector(_upW, THREE.MathUtils.lerp(-0.22, -0.05, ab))
          .addScaledVector(_fwdW, THREE.MathUtils.lerp(0.36, 0.46, ab));
        const rp = CS2_RIG.rightPole;
        const rPole = _h9
          .copy(_rightW)
          .multiplyScalar(rp[0])
          .addScaledVector(_upW, rp[1])
          .addScaledVector(_fwdW, rp[2]);
        ik2(B.RightArm, B.RightForeArm, B.RightHand, pistolWrist, rPole);

        const pBarrel = _h3
          .copy(_fwdW)
          .addScaledVector(_upW, Math.sin(pitchTarget * 0.8 + recoilKick * 0.08 - (1 - ab) * 0.22))
          .normalize();
        const X = _h4.crossVectors(pBarrel, _upW).normalize();
        const Z = _h5.copy(pBarrel).negate();
        const Y = _h6.crossVectors(Z, X);
        _m4.makeBasis(X, Y, Z);
        const qr = _qr.setFromRotationMatrix(_m4);
        setRightHandMountQuatInv(rig, null, _qc);
        B.RightHand.parent.getWorldQuaternion(_qa).invert();
        B.RightHand.quaternion.copy(_qa.multiply(_qb.copy(qr).multiply(_qc)));
        B.RightHand.updateWorldMatrix(false, false);

        if (B.LeftArm && B.LeftForeArm && B.LeftHand) {
          B.RightHand.getWorldPosition(_h7);
          const support = _h8
            .copy(_h7)
            .addScaledVector(_rightW, -0.03)
            .addScaledVector(_upW, -0.025)
            .addScaledVector(_fwdW, 0.02);
          const lp = CS2_RIG.leftPole;
          const lPole = _h9
            .copy(_rightW)
            .multiplyScalar(lp[0])
            .addScaledVector(_upW, lp[1])
            .addScaledVector(_fwdW, lp[2]);
          ik2(B.LeftArm, B.LeftForeArm, B.LeftHand, support, lPole);
        }
        applyFingerGripPose(rig, 'Right', 1);
        applyFingerGripPose(rig, 'Left', 0.85);
      } else {
        const runCarry = mb * (1 - ab) * (spd > 0.70 ? 1.0 : 0.75);
        solveTwoHandedRiflePose(rig, B, anchor, ab, runCarry, pitchTarget, recoilKick, weaponObj);
        applyFingerGripPose(rig, 'Right', 1);
        applyFingerGripPose(rig, 'Left', 1);
      }
    }
  }

  // Final single subtree world-matrix update so rifle, hands, and muzzle are exact for rendering
  soldierRoot.updateWorldMatrix(false, true);
  return true;
}

export function disposeSoldierGlb(rig) {
  if (!rig) return;
  rig._soldierDisposed = true;
  rig._soldierAttachSeq = (rig._soldierAttachSeq || 0) + 1;
  rig._soldierWeaponReqId = (rig._soldierWeaponReqId || 0) + 1;
  detachSoldierMeshOnly(rig);
  rig._soldierAttachPromise = null;
  rig._soldierModelPath = null;
  rig._soldierLoadingModelPath = null;
  rig._soldierAssets = null;
  rig._soldierScene = null;
}
