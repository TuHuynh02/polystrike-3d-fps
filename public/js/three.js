// Barrel re-export of Three.js for client feature modules in subfolders (`public/js/<domain>/*.js`)
// Ensures a single shared Three.js module instance across browser importmap, top-level modules, and headless Node tests.
export * from '../vendor/three/three.module.js';
