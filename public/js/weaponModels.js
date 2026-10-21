// Barrel re-export for 3D Gunsmith Weapon Models & First-Person Viewmodel Rig
export {
  createProceduralMaterial,
  buildPicatinnyRail,
  buildErgonomicGripAndTrigger,
  buildCurvedMagazine,
  buildDetailedOptic
} from './weapons/weaponMaterials.js';
export {
  buildDetailedWeaponModel,
  setWeaponAdsCulling,
  buildFirstPersonViewmodel,
  mergeTransformedGeometries,
  createWeaponMesh
} from './weapons/viewmodelRig.js';
