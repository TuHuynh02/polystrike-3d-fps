// Barrel re-export for 3D Gunsmith Weapon Models & First-Person Viewmodel Rig
export {
  WEAPON_MAT_CACHE,
  createProceduralMaterial,
  buildPicatinnyRail,
  buildErgonomicGripAndTrigger,
  buildCurvedMagazine,
  buildDetailedOptic
} from './weapons/weaponMaterials.js';
export {
  TP_WEAPON_TEMPLATE_CACHE,
  getThirdPersonWeaponTemplate,
  buildDetailedWeaponModel,
  setWeaponAdsCulling,
  buildFirstPersonViewmodel,
  mergeTransformedGeometries,
  createWeaponMesh
} from './weapons/viewmodelRig.js';

