// Barrel re-export for 3D Articulated Tactical Operator Rig Builder & Kinematic Gait Animator
export {
  RIG_GEO_CACHE,
  RIG_MAT_CACHE,
  getCachedGeo,
  ENEMY_OUTLINE_MAT,
  TEAMMATE_OUTLINE_MAT,
  batchBoneScope,
  createProceduralMaterial,
  disposeObject3D,
  HITBOX_PROXY_MAT,
  getCachedMat
} from './rig/rigMaterialsAndBatching.js';
export {
  createRemotePlayerMesh,
  createHumanoidPlayerRig,
  poseOperatorForWeapon,
  poseOperatorCryzenPoster,
  resolveCryzenVariantFromColor
} from './rig/operatorMeshBuilder.js';
export {
  animateHumanoidRig,
  updateHumanoidRigAnimation
} from './rig/rigAnimator.js';
