export class SpatialAndCombatSfxMethods {
  playSpatialFootstep(listener, sourcePos, isSprinting = false, isCrouching = false) {
    const maxDist = isCrouching ? 7.5 : isSprinting ? 28 : 24;
    const spatial = this.computeSpatialParams(listener, sourcePos, maxDist);
    if (spatial.outOfRange || spatial.gain <= 0.001) return null;

    const ctx = this.ensureContext();
    if (!ctx) return null;
    const now = ctx.currentTime;

    const baseVol = isCrouching ? 0.068 : isSprinting ? 0.34 : 0.18;
    const stepGain = baseVol * spatial.gain;
    const chain = this.createSpatialChain(ctx, spatial.pan, stepGain, now, spatial.muffledFreq);

    // 1. Low-mid boot heel thud
    const thudOsc = ctx.createOscillator();
    const thudGain = ctx.createGain();
    thudOsc.type = 'sine';
    const startFreq = isCrouching ? 88 : isSprinting ? 152 : 116;
    const dur = isCrouching ? 0.055 : isSprinting ? 0.082 : 0.07;
    thudOsc.frequency.setValueAtTime(startFreq, now);
    thudOsc.frequency.exponentialRampToValueAtTime(36, now + dur);
    thudGain.gain.setValueAtTime(isCrouching ? 0.42 : 0.68, now);
    thudGain.gain.exponentialRampToValueAtTime(0.001, now + dur + 0.008);
    thudOsc.connect(thudGain);
    thudGain.connect(chain.input);
    this._bindSourceCleanup(thudOsc, [thudGain], chain, dur + 0.012);

    // 2. Filtered surface step scuff
    let noise = null;
    if (this.noiseBuffer) {
      noise = ctx.createBufferSource();
      noise.buffer = this.noiseBuffer;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      const cutoff = Math.min(spatial.muffledFreq, isCrouching ? 210 : isSprinting ? 540 : 340);
      filter.frequency.value = cutoff;
      filter.frequency.setValueAtTime?.(cutoff, now);

      const noiseGain = ctx.createGain();
      noiseGain.gain.setValueAtTime(isCrouching ? 0.28 : isSprinting ? 0.60 : 0.42, now);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, now + dur);

      noise.connect(filter);
      filter.connect(noiseGain);
      noiseGain.connect(chain.input);
      this._bindSourceCleanup(noise, [filter, noiseGain], chain, dur + 0.01);
    }

    thudOsc.start(now);
    thudOsc.stop(now + dur + 0.012);
    if (noise) {
      noise.start(now);
      noise.stop(now + dur + 0.01);
    }

    this.scheduleChainCleanup(chain, dur + 0.04);

    return { pan: spatial.pan, gain: stepGain, dist: spatial.dist };
  }

  _muteRecentGains(recordRefName, windowMs = 20) {
    const rec = this[recordRefName];
    if (!rec) return;
    const nowPerf = typeof performance !== 'undefined' ? performance.now() : Date.now();
    if (nowPerf - rec.at < windowMs) {
      if (Array.isArray(rec.gains)) {
        for (const g of rec.gains) {
          try {
            if (g?.gain && this.ctx) {
              g.gain.value = 0.0001;
              g.gain.setValueAtTime?.(0.0001, this.ctx.currentTime);
            }
            g?.disconnect?.();
          } catch {
            // Ignore disconnect errors
          }
        }
      }
      if (Array.isArray(rec.cleanups)) {
        for (const fn of rec.cleanups) {
          try {
            fn?.();
          } catch {
            // Ignore cleanup errors
          }
        }
      }
    }
    this[recordRefName] = null;
  }

  playSpatialGunshot(weaponId = 'rifle', listener = null, sourcePos = null) {
    if (weaponId && typeof weaponId === 'object') {
      const maybeWeapon = typeof sourcePos === 'string' ? sourcePos : (weaponId.weapon || 'rifle');
      sourcePos = listener;
      listener = weaponId;
      weaponId = maybeWeapon;
    }

    // Mute any synchronous non-spatial shot triggered right before this 3D spatial gunshot
    this._muteRecentGains('_lastNonSpatialShot', 20);

    if (!listener || !sourcePos) {
      this.playShot(weaponId, 0.55);
      return null;
    }

    const maxDist = weaponId === 'knife' ? 24 : 75;
    const spatial = this.computeSpatialParams(listener, sourcePos, maxDist);
    if (spatial.outOfRange || spatial.gain <= 0.001) return null;

    const ctx = this.ensureContext();
    if (!ctx || !this.noiseBuffer) return null;
    const now = ctx.currentTime;

    // Emphasize 24m tactical combat zone with muffled low-pass filter falloff for distant shots
    const dist24Ratio = Math.min(1, spatial.dist / 24);
    const farRatio = spatial.dist > 24 ? Math.min(1, (spatial.dist - 24) / Math.max(1, maxDist - 24)) : 0;
    const attenGain = spatial.dist <= 24
      ? (1 - dist24Ratio * 0.68) * spatial.gain
      : 0.32 * (1 - farRatio) * spatial.gain;
    const shotGain = Math.max(0.02, Math.min(0.85, attenGain * 0.85));

    // Distant shots sound muffled via low-pass filter cutoff drop
    const cutoff = Math.max(
      420,
      Math.round(5600 * Math.exp(-spatial.dist / 20))
    );

    // Voice limit concurrent distant spatial gunshots to prevent audio thread saturation in 12-player firefights
    const nowPerf = typeof performance !== 'undefined' ? performance.now() : Date.now();
    if (!this._activeSpatialShots) this._activeSpatialShots = [];
    for (let i = this._activeSpatialShots.length - 1; i >= 0; i--) {
      const s = this._activeSpatialShots[i];
      if (nowPerf >= s.expPerf || (now > s.startCtx && now >= s.expCtx)) {
        this._activeSpatialShots.splice(i, 1);
      }
    }
    if (this._activeSpatialShots.length >= 8 && spatial.dist > 16) {
      return { pan: spatial.pan, gain: shotGain, dist: spatial.dist, cutoff };
    }
    this._activeSpatialShots.push({ startCtx: now, expCtx: now + 0.09, expPerf: nowPerf + 90 });

    const chain = this.createSpatialChain(ctx, spatial.pan, shotGain, now, cutoff);
    this.playShot(weaponId, 0.72, chain.input);
    this.scheduleChainCleanup(chain, 0.55);

    return { pan: spatial.pan, gain: shotGain, dist: spatial.dist, cutoff };
  }

  playHeadshotDink(listener = null, sourcePos = null) {
    // Prevent duplicate [2880, 4120] Hz dink oscillators if playHitmarker(true) was called synchronously
    this._muteRecentGains('_lastHeadshotDinkGains', 20);

    const ctx = this.ensureContext();
    if (!ctx) return null;
    const now = ctx.currentTime;

    let out = ctx.destination;
    let chain = null;
    if (listener && sourcePos && typeof listener === 'object' && typeof sourcePos === 'object') {
      const spatial = this.computeSpatialParams(listener, sourcePos, 40);
      if (spatial.outOfRange || spatial.gain <= 0.001) return null;
      chain = this.createSpatialChain(ctx, spatial.pan, spatial.gain * 0.88, now, spatial.muffledFreq);
      out = chain.input;
    }

    // Crisp metallic helmet impact transient
    const impact = ctx.createOscillator();
    const impactGain = ctx.createGain();
    impact.type = 'triangle';
    impact.frequency.setValueAtTime(1980, now);
    impact.frequency.exponentialRampToValueAtTime(620, now + 0.045);
    impactGain.gain.setValueAtTime(0.32, now);
    impactGain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
    impact.connect(impactGain);
    impactGain.connect(out);
    this._bindSourceCleanup(impact, [impactGain], chain, 0.055);

    // Dual-harmonic CS-style metallic helmet "DINK!" ring
    const dinkOscs = [];
    [2880, 4120].forEach((freq, idx) => {
      const dink = ctx.createOscillator();
      const dinkGain = ctx.createGain();
      dink.type = 'sine';
      dink.frequency.setValueAtTime(freq, now + 0.008);
      dink.frequency.exponentialRampToValueAtTime(freq * 1.08, now + 0.15);
      dinkGain.gain.setValueAtTime(idx === 0 ? 0.32 : 0.22, now + 0.008);
      dinkGain.gain.exponentialRampToValueAtTime(0.0008, now + 0.165);
      dink.connect(dinkGain);
      dinkGain.connect(out);
      this._bindSourceCleanup(dink, [dinkGain], chain, 0.175);
      dinkOscs.push(dink);
    });

    impact.start(now);
    impact.stop(now + 0.055);
    for (let i = 0; i < dinkOscs.length; i++) {
      dinkOscs[i].start(now + 0.008);
      dinkOscs[i].stop(now + 0.175);
    }

    if (chain) {
      this.scheduleChainCleanup(chain, 0.22);
    }
  }

  playGrenadeThrow() {
    const ctx = this.ensureContext();
    if (!ctx) return null;
    const now = ctx.currentTime;

    // Metallic safety pin pull ring
    const pinOsc = ctx.createOscillator();
    const pinGain = ctx.createGain();
    pinOsc.type = 'sine';
    pinOsc.frequency.setValueAtTime(2450, now);
    pinOsc.frequency.exponentialRampToValueAtTime(3400, now + 0.045);
    pinGain.gain.setValueAtTime(0.16, now);
    pinGain.gain.exponentialRampToValueAtTime(0.001, now + 0.055);
    pinOsc.connect(pinGain);
    pinGain.connect(ctx.destination);
    this._bindSourceCleanup(pinOsc, [pinGain], null, 0.065);
    pinOsc.start(now);
    pinOsc.stop(now + 0.06);

    // Arm throw whoosh
    if (this.noiseBuffer) {
      const noise = ctx.createBufferSource();
      noise.buffer = this.noiseBuffer;
      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(620, now + 0.03);
      filter.frequency.exponentialRampToValueAtTime(280, now + 0.16);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.18, now + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.17);
      noise.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);
      this._bindSourceCleanup(noise, [filter, gain], null, 0.19);
      noise.start(now + 0.03);
      noise.stop(now + 0.18);
    }
  }

  playGrenadeBounce(listener = null, sourcePos = null) {
    const ctx = this.ensureContext();
    if (!ctx) return null;
    const now = ctx.currentTime;

    let out = ctx.destination;
    let volScale = 1.0;
    let chain = null;

    if (typeof listener === 'number') {
      volScale = Math.max(0.05, Math.min(1.2, listener));
    } else if (listener && sourcePos && typeof listener === 'object' && typeof sourcePos === 'object') {
      const spatial = this.computeSpatialParams(listener, sourcePos, 24);
      if (spatial.outOfRange || spatial.gain <= 0.001) return null;
      chain = this.createSpatialChain(ctx, spatial.pan, spatial.gain * 0.78, now, spatial.muffledFreq);
      out = chain.input;
    }

    // 1. Metallic canister clink
    const clink = ctx.createOscillator();
    const clinkGain = ctx.createGain();
    clink.type = 'triangle';
    clink.frequency.setValueAtTime(1420, now);
    clink.frequency.exponentialRampToValueAtTime(640, now + 0.055);
    clinkGain.gain.setValueAtTime(0.22 * volScale, now);
    clinkGain.gain.exponentialRampToValueAtTime(0.001, now + 0.065);
    clink.connect(clinkGain);
    clinkGain.connect(out);
    this._bindSourceCleanup(clink, [clinkGain], chain, 0.07);

    // 2. High metallic shell ring
    const ring = ctx.createOscillator();
    const ringGain = ctx.createGain();
    ring.type = 'sine';
    ring.frequency.setValueAtTime(2680, now);
    ring.frequency.exponentialRampToValueAtTime(1920, now + 0.045);
    ringGain.gain.setValueAtTime(0.14 * volScale, now);
    ringGain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
    ring.connect(ringGain);
    ringGain.connect(out);
    this._bindSourceCleanup(ring, [ringGain], chain, 0.055);

    clink.start(now);
    clink.stop(now + 0.07);
    ring.start(now);
    ring.stop(now + 0.055);

    if (chain) {
      this.scheduleChainCleanup(chain, 0.11);
    }
  }

  playGrenadeExplosion(listener = null, sourcePos = null) {
    const ctx = this.ensureContext();
    if (!ctx) return null;
    const now = ctx.currentTime;

    let out = ctx.destination;
    let volScale = 1.0;
    let isSpatial = false;
    let spatialInfo = { pan: 0, gain: 0.85, dist: 0 };
    let chain = null;

    if (typeof listener === 'number') {
      volScale = Math.max(0.05, Math.min(1.2, listener));
      spatialInfo = { pan: 0, gain: 0.85 * volScale, dist: 0 };
    } else if (listener && sourcePos && typeof listener === 'object' && typeof sourcePos === 'object') {
      this._muteRecentGains('_lastNonSpatialExplosion', 25);
      isSpatial = true;
      const spatial = this.computeSpatialParams(listener, sourcePos, 60);
      if (spatial.outOfRange || spatial.gain <= 0.001) return null;
      const blastGain = Math.min(1.0, spatial.gain * 0.95);
      const cutoff = Math.max(380, Math.round(5200 * Math.exp(-spatial.dist / 22)));
      chain = this.createSpatialChain(ctx, spatial.pan, blastGain, now, cutoff);
      out = chain.input;
      spatialInfo = { pan: spatial.pan, gain: blastGain, dist: spatial.dist };
    }

    const activeGains = [];
    const activeCleanups = [];

    // 1. Deep shockwave sub-bass drop
    const subOsc = ctx.createOscillator();
    const subGain = ctx.createGain();
    subOsc.type = 'sawtooth';
    subOsc.frequency.setValueAtTime(145, now);
    subOsc.frequency.exponentialRampToValueAtTime(22, now + 0.55);
    subGain.gain.setValueAtTime(0.72 * volScale, now);
    subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.62);
    subOsc.connect(subGain);
    subGain.connect(out);
    activeCleanups.push(this._bindSourceCleanup(subOsc, [subGain], chain, 0.65));
    activeGains.push(subGain);

    // 2. Concussive HE detonation rumble (filtered noise burst)
    let noise = null;
    if (this.noiseBuffer) {
      noise = ctx.createBufferSource();
      noise.buffer = this.noiseBuffer;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(920, now);
      filter.frequency.exponentialRampToValueAtTime(160, now + 0.65);

      const noiseGain = ctx.createGain();
      noiseGain.gain.setValueAtTime(0.78 * volScale, now);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.68);

      noise.connect(filter);
      filter.connect(noiseGain);
      noiseGain.connect(out);
      activeCleanups.push(this._bindSourceCleanup(noise, [filter, noiseGain], chain, 0.72));
      activeGains.push(noiseGain);
    }

    // 3. Sharp shrapnel crack transient
    const crackOsc = ctx.createOscillator();
    const crackGain = ctx.createGain();
    crackOsc.type = 'square';
    crackOsc.frequency.setValueAtTime(1650, now);
    crackOsc.frequency.exponentialRampToValueAtTime(180, now + 0.16);
    crackGain.gain.setValueAtTime(0.34 * volScale, now);
    crackGain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
    crackOsc.connect(crackGain);
    crackGain.connect(out);
    activeCleanups.push(this._bindSourceCleanup(crackOsc, [crackGain], chain, 0.19));
    activeGains.push(crackGain);

    subOsc.start(now);
    subOsc.stop(now + 0.65);
    if (noise) {
      noise.start(now);
      noise.stop(now + 0.72);
    }
    crackOsc.start(now);
    crackOsc.stop(now + 0.19);

    if (chain) {
      this.scheduleChainCleanup(chain, 0.78);
    }

    if (!isSpatial) {
      this._lastNonSpatialExplosion = {
        at: typeof performance !== 'undefined' ? performance.now() : Date.now(),
        gains: activeGains,
        cleanups: activeCleanups
      };
    }

    return spatialInfo;
  }

  playExplosion(listener = null, sourcePos = null) {
    if (this._lastNonSpatialExplosion) {
      const nowPerf = typeof performance !== 'undefined' ? performance.now() : Date.now();
      if (nowPerf - this._lastNonSpatialExplosion.at < 25) {
        return null;
      }
    }
    return this.playGrenadeExplosion(listener, sourcePos);
  }

  playMultiKillTone(streakCount = 2) {
    // Prevent clashing D5 triad from playKillConfirm if both were called synchronously
    this._muteRecentGains('_lastKillConfirm', 20);

    const ctx = this.ensureContext();
    if (!ctx) return null;
    const now = ctx.currentTime;

    const cleanStreak = Math.max(1, Math.min(8, Number(streakCount) || 2));

    // Sub-bass impact drop
    const sub = ctx.createOscillator();
    const subGain = ctx.createGain();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(170, now);
    sub.frequency.exponentialRampToValueAtTime(38, now + 0.26);
    subGain.gain.setValueAtTime(0.38, now);
    subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);
    sub.connect(subGain);
    subGain.connect(ctx.destination);
    this._bindSourceCleanup(sub, [subGain], null, 0.3);
    sub.start(now);
    sub.stop(now + 0.3);

    // Escalating tactical synth chord progression based on streak tier
    const baseScale = [523.25, 659.25, 783.99, 1046.5, 1318.5, 1567.98];
    const pitchMult = 1 + Math.min(5, cleanStreak - 2) * 0.08;
    const noteCount = Math.min(baseScale.length, Math.max(3, cleanStreak + 1));

    for (let i = 0; i < noteCount; i++) {
      const startAt = now + i * 0.052;
      const isFinalNote = i === noteCount - 1;
      const dur = isFinalNote ? 0.32 : 0.18;
      const freq = baseScale[i] * Math.max(0.92, pitchMult);

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = isFinalNote ? 'triangle' : 'sine';
      osc.frequency.setValueAtTime(freq, startAt);
      if (isFinalNote) {
        osc.frequency.exponentialRampToValueAtTime(freq * 1.03, startAt + dur);
      }
      gain.gain.setValueAtTime(isFinalNote ? 0.28 : 0.22, startAt);
      gain.gain.exponentialRampToValueAtTime(0.001, startAt + dur);
      osc.connect(gain);
      gain.connect(ctx.destination);
      this._bindSourceCleanup(osc, [gain], null, i * 0.052 + dur + 0.02);
      osc.start(startAt);
      osc.stop(startAt + dur + 0.02);
    }
  }

  /**
   * Plays a rising metallic striker/bolt click when magazine ammo drops into the final 25%,
   * giving tactile audio feedback before the magazine runs dry (CS2/Valorant/Apex style).
   */
  playLowAmmoClick(ratio = 0.2) {
    const ctx = this.ensureContext();
    if (!ctx) return null;
    const now = ctx.currentTime;
    const clampedRatio = Math.max(0, Math.min(1, Number(ratio) || 0));
    const urgency = 1 - clampedRatio; // 0 at 25% mag -> 1 at last round
    const baseFreq = 1650 + urgency * 950;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(baseFreq, now);
    osc.frequency.exponentialRampToValueAtTime(baseFreq * 1.32, now + 0.038);
    gain.gain.setValueAtTime(0.14 + urgency * 0.14, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.042);
    osc.connect(gain);
    gain.connect(ctx.destination);
    this._bindSourceCleanup(osc, [gain], null, 0.05);
    osc.start(now);
    osc.stop(now + 0.045);
    return { baseFreq, urgency };
  }

  /**
   * Plays a 3D spatial supersonic bullet snap/whizz when an enemy round passes close to the player's head.
   */
  playBulletWhizz(listener = null, sourcePos = null, closestDist = 1.2) {
    const ctx = this.ensureContext();
    if (!ctx) return null;
    const now = ctx.currentTime;

    const spatial = this.computeSpatialParams(listener, sourcePos, 6.0);
    if (spatial.outOfRange) return null;

    const proximity = Math.max(0.15, Math.min(1, 1 - (Number(closestDist) || 1.2) / 2.6));
    const chain = this.createSpatialChain(ctx, spatial.pan, 0.42 * proximity, now, 6500);

    // High-velocity Doppler air whizz (swept sine/triangle)
    const whizzOsc = ctx.createOscillator();
    const whizzGain = ctx.createGain();
    whizzOsc.type = 'sine';
    whizzOsc.frequency.setValueAtTime(2900, now);
    whizzOsc.frequency.exponentialRampToValueAtTime(620, now + 0.085);
    whizzGain.gain.setValueAtTime(0.55 * proximity, now);
    whizzGain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);
    whizzOsc.connect(whizzGain);
    whizzGain.connect(chain.input);
    this._bindSourceCleanup(whizzOsc, [whizzGain], chain, 0.11);
    whizzOsc.start(now);
    whizzOsc.stop(now + 0.095);

    // Supersonic N-wave crack if passing very close (<= 1.45m)
    if (closestDist <= 1.45) {
      const snapOsc = ctx.createOscillator();
      const snapGain = ctx.createGain();
      snapOsc.type = 'sawtooth';
      snapOsc.frequency.setValueAtTime(4200, now);
      snapOsc.frequency.exponentialRampToValueAtTime(980, now + 0.025);
      snapGain.gain.setValueAtTime(0.65 * proximity, now);
      snapGain.gain.exponentialRampToValueAtTime(0.001, now + 0.028);
      snapOsc.connect(snapGain);
      snapGain.connect(chain.input);
      this._bindSourceCleanup(snapOsc, [snapGain], null, 0.04);
      snapOsc.start(now);
      snapOsc.stop(now + 0.03);
    }

    return { pan: spatial.pan, proximity };
  }
}
