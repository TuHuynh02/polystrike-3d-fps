// Web Audio API Procedural Sound Synthesizer (Zero external asset dependencies)
import { AudioCoreMethods } from './audio/audioCore.js';
import { WeaponAndMovementSfxMethods } from './audio/weaponAndMovementSfx.js';
import { SpatialAndCombatSfxMethods } from './audio/spatialAndCombatSfx.js';

export class SoundEffects {
  constructor() {
    if (SoundEffects._instance) {
      return SoundEffects._instance;
    }
    this.ctx = null;
    this._ctxCtor = null;
    this._autoCreatedCtx = null;
    this._noiseBufferCtx = null;
    this.enabled = true;
    this.noiseBuffer = null;
    this._lastNonSpatialShot = null;
    this._lastHeadshotDinkGains = null;
    this._lastKillConfirm = null;
    this._lastNonSpatialExplosion = null;
    this._pendingCleanups = [];
    this._cleanupTickTimer = null;
    this._cleanupTickDueAt = 0;
    SoundEffects._instance = this;
  }
}

for (const Mixin of [
  AudioCoreMethods,
  WeaponAndMovementSfxMethods,
  SpatialAndCombatSfxMethods
]) {
  const descs = Object.getOwnPropertyDescriptors(Mixin.prototype);
  delete descs.constructor;
  Object.defineProperties(SoundEffects.prototype, descs);
}

export const sfx = new SoundEffects();

export function scheduleChainCleanup(chain, durationSec = 0.25) {
  return sfx.scheduleChainCleanup(chain, durationSec);
}
