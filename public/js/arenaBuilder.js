// Barrel re-export for 3D Arena Builder, Procedural PBR Textures & Sky/Atmosphere
export {
  createProceduralEnvironmentMap,
  buildSkyAndAtmosphere
} from './arena/skyAtmosphere.js';
export {
  createGridTexture,
  createFloorBumpTexture,
  createObstacleTexture,
  createObstacleBumpTexture,
  applyBoxWorldUVs
} from './arena/proceduralTextures.js';
export {
  buildMapLandmarks,
  mergeMeshGeometries,
  buildArena
} from './arena/arenaGeometry.js';
