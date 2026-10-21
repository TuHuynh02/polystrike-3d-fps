export class WeaponAndMovementSfxMethods {
  playShot(weaponId = 'rifle', volumeScale = 1.0, targetNode = null) {
    const ctx = this.ensureContext();
    if (!ctx || !this.noiseBuffer) return;

    const now = ctx.currentTime;
    const vol = Math.max(0.04, Math.min(1.0, volumeScale));
    const spatialChain =
      targetNode?._spatialChain ||
      (targetNode?.input && (targetNode?.distGain || targetNode?.gain) ? targetNode : null);
    const out =
      (targetNode?.input && typeof targetNode.connect !== 'function' ? targetNode.input : targetNode) ||
      ctx.destination;

    // 1. Gunpowder crack / blast (filtered noise)
    const noise = ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;
    const filter = ctx.createBiquadFilter();
    const noiseGain = ctx.createGain();

    // 2. Low-end chest thump (pitch-dropping sub oscillator)
    const subOsc = ctx.createOscillator();
    const subGain = ctx.createGain();

    // 3. Mechanical metallic transient (bolt/hammer snap)
    const mechOsc = ctx.createOscillator();
    const mechGain = ctx.createGain();
    mechOsc.type = 'square';

    if (weaponId === 'knife') {
      // Metallic Karambit slash whoosh
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(1950, now);
      filter.Q.setValueAtTime(1.8, now);
      noiseGain.gain.setValueAtTime(0.28 * vol, now);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);

      subOsc.type = 'sine';
      subOsc.frequency.setValueAtTime(420, now);
      subOsc.frequency.exponentialRampToValueAtTime(110, now + 0.12);
      subGain.gain.setValueAtTime(0.22 * vol, now);
      subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.13);

      mechOsc.type = 'triangle';
      mechOsc.frequency.setValueAtTime(3200, now);
      mechOsc.frequency.exponentialRampToValueAtTime(1200, now + 0.055);
      mechGain.gain.setValueAtTime(0.18 * vol, now);
      mechGain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
    } else if (weaponId === 'shotgun') {
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(620, now);
      filter.Q.setValueAtTime(0.8, now);
      noiseGain.gain.setValueAtTime(0.55 * vol, now);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.34);

      subOsc.type = 'sawtooth';
      subOsc.frequency.setValueAtTime(155, now);
      subOsc.frequency.exponentialRampToValueAtTime(28, now + 0.26);
      subGain.gain.setValueAtTime(0.52 * vol, now);
      subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);

      mechOsc.frequency.setValueAtTime(920, now);
      mechOsc.frequency.exponentialRampToValueAtTime(280, now + 0.045);
      mechGain.gain.setValueAtTime(0.22 * vol, now);
      mechGain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);

      // Pump-action chuk-chuk follow-up for local shooter only
      if (!targetNode && vol > 0.7) {
        this.schedulePumpCycle(ctx, now + 0.26, vol * 0.65);
      }
    } else if (weaponId === 'sniper') {
      filter.type = 'highpass';
      filter.frequency.setValueAtTime(360, now);
      noiseGain.gain.setValueAtTime(0.65 * vol, now);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.48);

      subOsc.type = 'triangle';
      subOsc.frequency.setValueAtTime(240, now);
      subOsc.frequency.exponentialRampToValueAtTime(24, now + 0.38);
      subGain.gain.setValueAtTime(0.6 * vol, now);
      subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.42);

      mechOsc.frequency.setValueAtTime(1850, now);
      mechOsc.frequency.exponentialRampToValueAtTime(420, now + 0.05);
      mechGain.gain.setValueAtTime(0.28 * vol, now);
      mechGain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);

      // Bolt cycle sound for local shooter only
      if (!targetNode && vol > 0.7) {
        this.schedulePumpCycle(ctx, now + 0.38, vol * 0.7);
      }
    } else if (weaponId === 'm4a1') {
      // Suppressed Phantom M4A1
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(1650, now);
      filter.Q.setValueAtTime(1.4, now);
      noiseGain.gain.setValueAtTime(0.26 * vol, now);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.095);

      subOsc.type = 'triangle';
      subOsc.frequency.setValueAtTime(240, now);
      subOsc.frequency.exponentialRampToValueAtTime(65, now + 0.085);
      subGain.gain.setValueAtTime(0.28 * vol, now);
      subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);

      mechOsc.frequency.setValueAtTime(2200, now);
      mechOsc.frequency.exponentialRampToValueAtTime(820, now + 0.025);
      mechGain.gain.setValueAtTime(0.18 * vol, now);
      mechGain.gain.exponentialRampToValueAtTime(0.001, now + 0.03);
    } else if (weaponId === 'scar' || weaponId === 'deagle' || weaponId === 'lmg') {
      // Heavy 7.62 / .50 AE / LMG thump
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(780, now);
      filter.Q.setValueAtTime(0.85, now);
      noiseGain.gain.setValueAtTime(0.48 * vol, now);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);

      subOsc.type = 'sawtooth';
      subOsc.frequency.setValueAtTime(185, now);
      subOsc.frequency.exponentialRampToValueAtTime(34, now + 0.19);
      subGain.gain.setValueAtTime(0.45 * vol, now);
      subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.21);

      mechOsc.frequency.setValueAtTime(1350, now);
      mechOsc.frequency.exponentialRampToValueAtTime(420, now + 0.04);
      mechGain.gain.setValueAtTime(0.24 * vol, now);
      mechGain.gain.exponentialRampToValueAtTime(0.001, now + 0.045);
    } else if (weaponId === 'smg' || weaponId === 'glock' || weaponId === 'pistol') {
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(1450, now);
      filter.Q.setValueAtTime(1.1, now);
      noiseGain.gain.setValueAtTime(0.32 * vol, now);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.11);

      subOsc.type = 'triangle';
      subOsc.frequency.setValueAtTime(290, now);
      subOsc.frequency.exponentialRampToValueAtTime(58, now + 0.09);
      subGain.gain.setValueAtTime(0.28 * vol, now);
      subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);

      mechOsc.frequency.setValueAtTime(2100, now);
      mechOsc.frequency.exponentialRampToValueAtTime(750, now + 0.025);
      mechGain.gain.setValueAtTime(0.18 * vol, now);
      mechGain.gain.exponentialRampToValueAtTime(0.001, now + 0.03);
    } else {
      // Rifle (VANDAL-AK)
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(1050, now);
      filter.Q.setValueAtTime(0.9, now);
      noiseGain.gain.setValueAtTime(0.38 * vol, now);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

      subOsc.type = 'sawtooth';
      subOsc.frequency.setValueAtTime(210, now);
      subOsc.frequency.exponentialRampToValueAtTime(45, now + 0.125);
      subGain.gain.setValueAtTime(0.36 * vol, now);
      subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);

      mechOsc.frequency.setValueAtTime(1550, now);
      mechOsc.frequency.exponentialRampToValueAtTime(520, now + 0.03);
      mechGain.gain.setValueAtTime(0.2 * vol, now);
      mechGain.gain.exponentialRampToValueAtTime(0.001, now + 0.035);
    }

    noise.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(out);

    subOsc.connect(subGain);
    subGain.connect(out);

    mechOsc.connect(mechGain);
    mechGain.connect(out);

    const cleanNoise = this._bindSourceCleanup(noise, [filter, noiseGain], spatialChain, 0.5);
    const cleanSub = this._bindSourceCleanup(subOsc, [subGain], spatialChain, 0.45);
    const cleanMech = this._bindSourceCleanup(mechOsc, [mechGain], spatialChain, 0.07);

    if (!targetNode && vol <= 0.62) {
      this._lastNonSpatialShot = {
        at: typeof performance !== 'undefined' ? performance.now() : Date.now(),
        gains: [noiseGain, subGain, mechGain],
        cleanups: [cleanNoise, cleanSub, cleanMech]
      };
    }

    noise.start(now);
    noise.stop(now + 0.5);
    subOsc.start(now);
    subOsc.stop(now + 0.45);
    mechOsc.start(now);
    mechOsc.stop(now + 0.07);

    if (spatialChain) {
      this.scheduleChainCleanup(spatialChain, 0.55);
    }

    // Subtle brass shell casing clink on floor for local shooter (except knife)
    if (!targetNode && vol > 0.75 && weaponId !== 'knife') {
      this.scheduleShellClink(ctx, now + 0.22 + Math.random() * 0.08, vol * 0.25);
    }
  }

  scheduleShellClink(ctx, startAt, vol) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    const baseFreq = 3100 + Math.random() * 650;
    osc.frequency.setValueAtTime(baseFreq, startAt);
    osc.frequency.exponentialRampToValueAtTime(baseFreq * 1.25, startAt + 0.035);
    gain.gain.setValueAtTime(vol, startAt);
    gain.gain.exponentialRampToValueAtTime(0.0005, startAt + 0.04);
    osc.connect(gain);
    gain.connect(ctx.destination);
    const relDur = Math.max(0.05, startAt - (ctx.currentTime || 0) + 0.05);
    this._bindSourceCleanup(osc, [gain], null, relDur);
    osc.start(startAt);
    osc.stop(startAt + 0.045);
  }

  schedulePumpCycle(ctx, startAt, vol) {
    [0, 0.11].forEach((offset, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(idx === 0 ? 440 : 620, startAt + offset);
      osc.frequency.exponentialRampToValueAtTime(idx === 0 ? 220 : 880, startAt + offset + 0.055);
      gain.gain.setValueAtTime(0.18 * vol, startAt + offset);
      gain.gain.exponentialRampToValueAtTime(0.001, startAt + offset + 0.065);
      osc.connect(gain);
      gain.connect(ctx.destination);
      const relDur = Math.max(0.08, startAt + offset - (ctx.currentTime || 0) + 0.08);
      this._bindSourceCleanup(osc, [gain], null, relDur);
      osc.start(startAt + offset);
      osc.stop(startAt + offset + 0.07);
    });
  }

  playHitmarker(isHeadshot = false) {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    // 1. Crisp Kevlar / Flesh Impact Thump
    const thud = ctx.createOscillator();
    const thudGain = ctx.createGain();
    thud.type = 'triangle';
    thud.frequency.setValueAtTime(isHeadshot ? 320 : 210, now);
    thud.frequency.exponentialRampToValueAtTime(52, now + 0.065);
    thudGain.gain.setValueAtTime(isHeadshot ? 0.34 : 0.28, now);
    thudGain.gain.exponentialRampToValueAtTime(0.001, now + 0.07);
    thud.connect(thudGain);
    thudGain.connect(ctx.destination);
    this._bindSourceCleanup(thud, [thudGain], null, 0.08);
    thud.start(now);
    thud.stop(now + 0.075);

    // 2. Crisp High-Frequency Hit Tick
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = isHeadshot ? 'sine' : 'triangle';
    osc.frequency.setValueAtTime(isHeadshot ? 2150 : 1180, now);
    osc.frequency.exponentialRampToValueAtTime(isHeadshot ? 2980 : 540, now + 0.07);

    gain.gain.setValueAtTime(isHeadshot ? 0.36 : 0.24, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

    osc.connect(gain);
    gain.connect(ctx.destination);
    this._bindSourceCleanup(osc, [gain], null, 0.09);
    osc.start(now);
    osc.stop(now + 0.085);

    if (isHeadshot) {
      // 3. Signature CS:GO Metallic Helmet "DINK!" dual-harmonic ring
      const dinkGains = [];
      const dinkCleanups = [];
      [2880, 4120].forEach((freq, idx) => {
        const dink = ctx.createOscillator();
        const dinkGain = ctx.createGain();
        dink.type = 'sine';
        dink.frequency.setValueAtTime(freq, now + 0.012);
        dink.frequency.exponentialRampToValueAtTime(freq * 1.08, now + 0.14);
        dinkGain.gain.setValueAtTime(idx === 0 ? 0.28 : 0.18, now + 0.012);
        dinkGain.gain.exponentialRampToValueAtTime(0.0008, now + 0.15);
        dink.connect(dinkGain);
        dinkGain.connect(ctx.destination);
        const cleanDink = this._bindSourceCleanup(dink, [dinkGain], null, 0.17);
        dink.start(now + 0.012);
        dink.stop(now + 0.16);
        dinkGains.push(dinkGain);
        dinkCleanups.push(cleanDink);
      });
      this._lastHeadshotDinkGains = {
        at: typeof performance !== 'undefined' ? performance.now() : Date.now(),
        gains: dinkGains,
        cleanups: dinkCleanups
      };
    }
  }

  playArmorHit(armorBroken = false) {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    // 1. Kevlar plate impact thump
    const plate = ctx.createOscillator();
    const plateGain = ctx.createGain();
    plate.type = 'triangle';
    plate.frequency.setValueAtTime(armorBroken ? 640 : 480, now);
    plate.frequency.exponentialRampToValueAtTime(armorBroken ? 110 : 140, now + 0.09);
    plateGain.gain.setValueAtTime(armorBroken ? 0.34 : 0.25, now);
    plateGain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
    plate.connect(plateGain);
    plateGain.connect(ctx.destination);
    this._bindSourceCleanup(plate, [plateGain], null, 0.11);
    plate.start(now);
    plate.stop(now + 0.105);

    // 2. Ceramic/Shield high-tech harmonic ping (or shatter chord on break)
    const freqs = armorBroken ? [1960, 2640, 1320] : [1640, 2180];
    freqs.forEach((f, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = armorBroken ? 'sawtooth' : 'sine';
      const t0 = now + idx * (armorBroken ? 0.018 : 0.01);
      osc.frequency.setValueAtTime(f, t0);
      osc.frequency.exponentialRampToValueAtTime(armorBroken ? f * 0.62 : f * 0.85, t0 + 0.12);
      gain.gain.setValueAtTime(armorBroken ? 0.22 : 0.16, t0);
      gain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.13);
      osc.connect(gain);
      gain.connect(ctx.destination);
      this._bindSourceCleanup(osc, [gain], null, idx * 0.02 + 0.15);
      osc.start(t0);
      osc.stop(t0 + 0.14);
    });
  }

  playKillConfirm(streak = 1) {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const confirmGains = [];
    const confirmCleanups = [];

    // Deep sub-bass kill impact drop
    const sub = ctx.createOscillator();
    const subGain = ctx.createGain();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(155, now);
    sub.frequency.exponentialRampToValueAtTime(36, now + 0.22);
    subGain.gain.setValueAtTime(0.36, now);
    subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.24);
    sub.connect(subGain);
    subGain.connect(ctx.destination);
    confirmCleanups.push(this._bindSourceCleanup(sub, [subGain], null, 0.26));
    sub.start(now);
    sub.stop(now + 0.25);
    confirmGains.push(subGain);

    // Rising tactical kill chime (pitch scales up slightly on multi-kill streaks)
    const pitchBoost = 1 + Math.min(4, Math.max(0, streak - 1)) * 0.06;
    const notes = [587.33 * pitchBoost, 880 * pitchBoost, 1174.66 * pitchBoost];
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + i * 0.05);
      gain.gain.setValueAtTime(0.24, now + i * 0.05);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.05 + 0.2);
      osc.connect(gain);
      gain.connect(ctx.destination);
      confirmCleanups.push(this._bindSourceCleanup(osc, [gain], null, i * 0.05 + 0.23));
      osc.start(now + i * 0.05);
      osc.stop(now + i * 0.05 + 0.22);
      confirmGains.push(gain);
    });

    this._lastKillConfirm = {
      at: typeof performance !== 'undefined' ? performance.now() : Date.now(),
      gains: confirmGains,
      cleanups: confirmCleanups
    };
  }

  playReload(reloadMs = 1600, mode = 'empty') {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    if (mode === 'shell') {
      // Initial shotgun shell carrier latch click
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(340, now);
      osc.frequency.exponentialRampToValueAtTime(520, now + 0.045);
      gain.gain.setValueAtTime(0.14, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.055);
      osc.connect(gain);
      gain.connect(ctx.destination);
      this._bindSourceCleanup(osc, [gain], null, 0.07);
      osc.start(now);
      osc.stop(now + 0.06);
      return;
    }

    const durSec = Math.max(0.7, reloadMs / 1000);

    // Tactical reload: 2 stages (Mag release + Mag lock-in)
    // Dry/Empty reload: 3 stages (Mag release + Mag lock-in + Metallic Bolt rack at 80%)
    const stages = mode === 'tactical'
      ? [
          { t: durSec * 0.10, f1: 390, f2: 195, gain: 0.15 },
          { t: durSec * 0.65, f1: 490, f2: 860, gain: 0.19 }
        ]
      : [
          { t: durSec * 0.08, f1: 380, f2: 190, gain: 0.15 },
          { t: durSec * 0.50, f1: 480, f2: 820, gain: 0.18 },
          { t: durSec * 0.80, f1: 680, f2: 1080, gain: 0.18 }
        ];

    stages.forEach((st) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'square';
      osc.frequency.setValueAtTime(st.f1, now + st.t);
      osc.frequency.exponentialRampToValueAtTime(st.f2, now + st.t + 0.065);
      gain.gain.setValueAtTime(st.gain, now + st.t);
      gain.gain.exponentialRampToValueAtTime(0.001, now + st.t + 0.075);
      osc.connect(gain);
      gain.connect(ctx.destination);
      this._bindSourceCleanup(osc, [gain], null, st.t + 0.09);
      osc.start(now + st.t);
      osc.stop(now + st.t + 0.085);
    });
  }

  playShellInsert(isFinalPump = false) {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    // Brass shell sliding into tube + spring catch click
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(420, now);
    osc.frequency.exponentialRampToValueAtTime(790, now + 0.055);
    gain.gain.setValueAtTime(0.18, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.065);
    osc.connect(gain);
    gain.connect(ctx.destination);
    this._bindSourceCleanup(osc, [gain], null, 0.08);
    osc.start(now);
    osc.stop(now + 0.07);

    if (isFinalPump) {
      this.schedulePumpCycle(ctx, now + 0.08, 0.7);
    }
  }

  playDryFire() {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(980, now);
    osc.frequency.exponentialRampToValueAtTime(320, now + 0.025);
    gain.gain.setValueAtTime(0.14, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.03);
    osc.connect(gain);
    gain.connect(ctx.destination);
    this._bindSourceCleanup(osc, [gain], null, 0.04);
    osc.start(now);
    osc.stop(now + 0.035);
  }

  playWeaponSwitch() {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(520, now);
    osc.frequency.exponentialRampToValueAtTime(840, now + 0.045);
    gain.gain.setValueAtTime(0.11, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.055);
    osc.connect(gain);
    gain.connect(ctx.destination);
    this._bindSourceCleanup(osc, [gain], null, 0.07);
    osc.start(now);
    osc.stop(now + 0.06);
  }

  playFootstep(isSprint = false, isCrouch = false) {
    const ctx = this.ensureContext();
    if (!ctx || !this.noiseBuffer) return;
    const now = ctx.currentTime;

    const noise = ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(isSprint ? 380 : isCrouch ? 175 : 250, now);

    const gain = ctx.createGain();
    const vol = isSprint ? 0.115 : isCrouch ? 0.032 : 0.065;
    gain.gain.setValueAtTime(vol, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.065);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    this._bindSourceCleanup(noise, [filter, gain], null, 0.08);
    noise.start(now);
    noise.stop(now + 0.075);
  }

  playSlide() {
    const ctx = this.ensureContext();
    if (!ctx || !this.noiseBuffer) return;
    const now = ctx.currentTime;

    const noise = ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(780, now);
    filter.frequency.exponentialRampToValueAtTime(240, now + 0.38);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.18, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    this._bindSourceCleanup(noise, [filter, gain], null, 0.43);
    noise.start(now);
    noise.stop(now + 0.42);
  }

  playLand(intensity = 1.0) {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const scale = Math.max(0.3, Math.min(1.5, intensity));

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(115, now);
    osc.frequency.exponentialRampToValueAtTime(38, now + 0.09);
    gain.gain.setValueAtTime(0.15 * scale, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.11);
    osc.connect(gain);
    gain.connect(ctx.destination);
    this._bindSourceCleanup(osc, [gain], null, 0.13);
    osc.start(now);
    osc.stop(now + 0.12);
  }

  playPickup() {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    [523.25, 659.25, 783.99, 1046.5].forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + idx * 0.045);
      gain.gain.setValueAtTime(0.18, now + idx * 0.045);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.045 + 0.14);
      osc.connect(gain);
      gain.connect(ctx.destination);
      this._bindSourceCleanup(osc, [gain], null, idx * 0.045 + 0.16);
      osc.start(now + idx * 0.045);
      osc.stop(now + idx * 0.045 + 0.15);
    });
  }

  playJump() {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(135, now);
    osc.frequency.exponentialRampToValueAtTime(255, now + 0.085);
    gain.gain.setValueAtTime(0.13, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
    osc.connect(gain);
    gain.connect(ctx.destination);
    this._bindSourceCleanup(osc, [gain], null, 0.12);
    osc.start(now);
    osc.stop(now + 0.11);
  }

  playJumpPad() {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(160, now);
    osc.frequency.exponentialRampToValueAtTime(680, now + 0.22);
    gain.gain.setValueAtTime(0.2, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
    osc.connect(gain);
    gain.connect(ctx.destination);
    this._bindSourceCleanup(osc, [gain], null, 0.27);
    osc.start(now);
    osc.stop(now + 0.26);
  }

  playPowerupPickup(type = 'armor') {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const chord = type === 'damage'
      ? [440, 554.37, 659.25, 880]
      : type === 'speed'
        ? [587.33, 739.99, 880, 1174.66]
        : [392.0, 493.88, 587.33, 783.99];
    chord.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type === 'damage' ? 'sawtooth' : 'triangle';
      osc.frequency.setValueAtTime(freq, now + idx * 0.04);
      gain.gain.setValueAtTime(0.18, now + idx * 0.04);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.04 + 0.16);
      osc.connect(gain);
      gain.connect(ctx.destination);
      this._bindSourceCleanup(osc, [gain], null, idx * 0.04 + 0.18);
      osc.start(now + idx * 0.04);
      osc.stop(now + idx * 0.04 + 0.17);
    });
  }

  playWeaponDrop() {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(460, now);
    osc.frequency.exponentialRampToValueAtTime(760, now + 0.055);
    gain.gain.setValueAtTime(0.15, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.065);
    osc.connect(gain);
    gain.connect(ctx.destination);
    this._bindSourceCleanup(osc, [gain], null, 0.08);
    osc.start(now);
    osc.stop(now + 0.07);
  }
}
