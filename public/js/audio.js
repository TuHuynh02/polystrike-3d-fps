// Web Audio API Procedural Sound Synthesizer (Zero external asset dependencies)
// Upgraded with multi-layer gunshots, brass shell clinks, bolt action cycling,
// footsteps, tactical slide whoosh, landing thud, and multi-stage reload mechanics.

export class SoundEffects {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.noiseBuffer = null;
  }

  ensureContext() {
    if (!this.enabled) return null;
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return null;
      this.ctx = new AudioCtx();
      this.createNoiseBuffer();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  createNoiseBuffer() {
    if (!this.ctx) return;
    const sampleRate = this.ctx.sampleRate;
    const length = sampleRate * 1.2;
    const buffer = this.ctx.createBuffer(1, length, sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    this.noiseBuffer = buffer;
  }

  playShot(weaponId = 'rifle', volumeScale = 1.0) {
    const ctx = this.ensureContext();
    if (!ctx || !this.noiseBuffer) return;

    const now = ctx.currentTime;
    const vol = Math.max(0.04, Math.min(1.0, volumeScale));

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

      // Pump-action chuk-chuk follow-up for local shooter
      if (vol > 0.7) {
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

      // Bolt cycle sound for local shooter
      if (vol > 0.7) {
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
    noiseGain.connect(ctx.destination);

    subOsc.connect(subGain);
    subGain.connect(ctx.destination);

    mechOsc.connect(mechGain);
    mechGain.connect(ctx.destination);

    noise.start(now);
    noise.stop(now + 0.5);
    subOsc.start(now);
    subOsc.stop(now + 0.45);
    mechOsc.start(now);
    mechOsc.stop(now + 0.07);

    // Subtle brass shell casing clink on floor for local shooter (except knife)
    if (vol > 0.75 && weaponId !== 'knife') {
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
      osc.start(startAt + offset);
      osc.stop(startAt + offset + 0.07);
    });
  }

  playHitmarker(isHeadshot = false) {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = isHeadshot ? 'sine' : 'triangle';
    osc.frequency.setValueAtTime(isHeadshot ? 1720 : 960, now);
    osc.frequency.exponentialRampToValueAtTime(isHeadshot ? 2550 : 460, now + 0.08);

    gain.gain.setValueAtTime(isHeadshot ? 0.32 : 0.22, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.095);

    if (isHeadshot) {
      // Extra crisp metallic dink for headshot
      const dink = ctx.createOscillator();
      const dinkGain = ctx.createGain();
      dink.type = 'sine';
      dink.frequency.setValueAtTime(2950, now + 0.02);
      dink.frequency.exponentialRampToValueAtTime(3400, now + 0.12);
      dinkGain.gain.setValueAtTime(0.24, now + 0.02);
      dinkGain.gain.exponentialRampToValueAtTime(0.001, now + 0.13);
      dink.connect(dinkGain);
      dinkGain.connect(ctx.destination);
      dink.start(now + 0.02);
      dink.stop(now + 0.135);
    }
  }

  playKillConfirm() {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    const notes = [587.33, 880, 1174.66]; // D5, A5, D6
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + i * 0.055);
      gain.gain.setValueAtTime(0.22, now + i * 0.055);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.055 + 0.19);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + i * 0.055);
      osc.stop(now + i * 0.055 + 0.21);
    });
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
    osc.start(now);
    osc.stop(now + 0.06);
  }

  playFootstep(isSprint = false) {
    const ctx = this.ensureContext();
    if (!ctx || !this.noiseBuffer) return;
    const now = ctx.currentTime;

    const noise = ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(isSprint ? 360 : 250, now);

    const gain = ctx.createGain();
    const vol = isSprint ? 0.11 : 0.065;
    gain.gain.setValueAtTime(vol, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.065);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
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
    osc.start(now);
    osc.stop(now + 0.11);
  }
}
