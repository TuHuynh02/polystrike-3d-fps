// Web Audio API Procedural Sound Synthesizer (Zero external asset dependencies)
// Upgraded with multi-layer gunshots, brass shell clinks, bolt action cycling,
// footsteps, tactical slide whoosh, landing thud, and multi-stage reload mechanics.

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

  ensureContext() {
    if (!this.enabled) return null;
    const AudioCtx =
      (typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext)) ||
      globalThis.AudioContext ||
      globalThis.webkitAudioContext;
    if (
      !this.ctx ||
      (this.ctx === this._autoCreatedCtx && this._ctxCtor && AudioCtx && this._ctxCtor !== AudioCtx)
    ) {
      if (!AudioCtx) return null;
      this._ctxCtor = AudioCtx;
      this.ctx = new AudioCtx();
      this._autoCreatedCtx = this.ctx;
      this.createNoiseBuffer();
    }
    if ((!this.noiseBuffer || this._noiseBufferCtx !== this.ctx) && this.ctx) {
      this.createNoiseBuffer();
    }
    if (this.ctx.state === 'suspended' && typeof this.ctx.resume === 'function') {
      this.ctx.resume().catch(() => {});
    }
    this.flushPendingCleanups();
    return this.ctx;
  }

  flushPendingCleanups(forceAll = false) {
    if (!this._pendingCleanups || this._pendingCleanups.length === 0) {
      if (this._cleanupTickTimer) {
        clearTimeout(this._cleanupTickTimer);
        this._cleanupTickTimer = null;
        this._cleanupTickDueAt = 0;
      }
      return;
    }
    const nowPerf = typeof performance !== 'undefined' ? performance.now() : Date.now();
    for (let i = this._pendingCleanups.length - 1; i >= 0; i--) {
      const entry = this._pendingCleanups[i];
      if (!entry || entry.done || entry.chain?.disposed) {
        this._pendingCleanups.splice(i, 1);
        continue;
      }
      const perfExpired = forceAll || nowPerf >= entry.expireAtPerf;
      const ctxExpired =
        entry.ctx &&
        typeof entry.ctx.currentTime === 'number' &&
        entry.expireAtCtx !== null &&
        entry.ctx.currentTime >= entry.expireAtCtx;
      if (perfExpired || ctxExpired) {
        this._pendingCleanups.splice(i, 1);
        entry.done = true;
        try {
          entry.cleanup();
        } catch {
          // Ignore cleanup errors
        }
      }
    }
    if (this._pendingCleanups.length === 0 && this._cleanupTickTimer) {
      clearTimeout(this._cleanupTickTimer);
      this._cleanupTickTimer = null;
      this._cleanupTickDueAt = 0;
    }
  }

  _scheduleQueueFlush(delayMs = 60) {
    const nowPerf = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const waitMs = Math.max(1, Math.min(250, Math.ceil(delayMs)));
    const dueAt = nowPerf + waitMs;
    if (this._cleanupTickTimer) {
      if (this._cleanupTickDueAt > 0 && dueAt + 2 < this._cleanupTickDueAt) {
        clearTimeout(this._cleanupTickTimer);
        this._cleanupTickTimer = null;
        this._cleanupTickDueAt = 0;
      } else {
        return;
      }
    }
    this._cleanupTickDueAt = dueAt;
    const timer = setTimeout(() => {
      this._cleanupTickTimer = null;
      this._cleanupTickDueAt = 0;
      this.flushPendingCleanups();
      if (this._pendingCleanups.length > 0) {
        const nextNow = typeof performance !== 'undefined' ? performance.now() : Date.now();
        let nextMs = 80;
        for (let i = 0; i < this._pendingCleanups.length; i++) {
          const rem = this._pendingCleanups[i].expireAtPerf - nextNow;
          if (rem < nextMs) nextMs = rem;
        }
        this._scheduleQueueFlush(Math.max(1, nextMs));
      }
    }, waitMs);
    if (timer && typeof timer.unref === 'function') {
      timer.unref();
    }
    this._cleanupTickTimer = timer;
  }

  _evictOverflowCleanups(maxEntries = 128) {
    while (this._pendingCleanups.length > maxEntries) {
      const oldest = this._pendingCleanups.shift();
      if (!oldest || oldest.done) continue;
      oldest.done = true;
      try {
        oldest.cleanup();
      } catch {
        // Ignore cleanup errors
      }
    }
  }

  _enqueueNodeCleanup(cleanup, durationSec = 0.25, ctx = this.ctx) {
    if (typeof cleanup !== 'function') return null;
    const dur = Number.isFinite(durationSec) ? Math.max(0, durationSec) : 0.25;
    const nowPerf = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const delayMs = Math.max(1, Math.ceil(dur * 1000));
    const expireAtPerf = nowPerf + dur * 1000;
    const expireAtCtx = ctx && typeof ctx.currentTime === 'number' ? ctx.currentTime + dur : null;
    const entry = {
      chain: null,
      cleanup,
      expireAtPerf,
      expireAtCtx,
      ctx,
      done: false
    };
    this._pendingCleanups.push(entry);
    if (this._pendingCleanups.length > 128) {
      this.flushPendingCleanups();
      if (this._pendingCleanups.length > 128) {
        this._evictOverflowCleanups(128);
      }
    }
    this._scheduleQueueFlush(delayMs);
    return entry;
  }

  _disposeChain(chain) {
    if (!chain || chain.disposed) return;
    chain.disposed = true;
    if (chain._cleanupTimer) {
      clearTimeout(chain._cleanupTimer);
      chain._cleanupTimer = null;
    }
    if (chain._cleanupEntry) {
      const entry = chain._cleanupEntry;
      chain._cleanupEntry = null;
      entry.done = true;
      const idx = this._pendingCleanups.indexOf(entry);
      if (idx !== -1) {
        this._pendingCleanups.splice(idx, 1);
      }
    }
    if (Array.isArray(chain._sourceCleanups)) {
      const cleanups = chain._sourceCleanups;
      chain._sourceCleanups = null;
      for (let i = 0; i < cleanups.length; i++) {
        try {
          cleanups[i]();
        } catch {
          // Ignore source cleanup errors
        }
      }
    }
    const chainNodes = [chain.input, chain.filter, chain.gain, chain.distGain, chain.panner];
    const seen = new Set();
    for (let i = 0; i < chainNodes.length; i++) {
      const node = chainNodes[i];
      if (!node || seen.has(node)) continue;
      seen.add(node);
      try {
        node.disconnect?.();
      } catch {
        // Ignore disconnect errors
      }
    }
  }

  scheduleChainCleanup(chain, durationSec = 0.25) {
    if (!chain || chain.disposed) return chain;
    this.flushPendingCleanups();

    chain._sealed = true;
    const dur = Number.isFinite(durationSec) ? Math.max(0, durationSec) : 0.25;

    if (dur <= 0 || (chain._hadSources && chain._pendingSources === 0)) {
      this._disposeChain(chain);
      return chain;
    }

    const nowPerf = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const delayMs = Math.max(1, Math.ceil(dur * 1000));
    const expireAtPerf = nowPerf + dur * 1000;
    const ctx =
      chain._ctx ||
      chain.gain?.context ||
      chain.distGain?.context ||
      chain.filter?.context ||
      chain.panner?.context ||
      this.ctx;
    const expireAtCtx = ctx && typeof ctx.currentTime === 'number' ? ctx.currentTime + dur : null;

    let entry = chain._cleanupEntry;
    if (entry && !entry.done) {
      entry.expireAtPerf = expireAtPerf;
      entry.expireAtCtx = expireAtCtx;
      entry.ctx = ctx;
    } else {
      entry = {
        chain,
        cleanup: () => this._disposeChain(chain),
        expireAtPerf,
        expireAtCtx,
        ctx,
        done: false
      };
      chain._cleanupEntry = entry;
      this._pendingCleanups.push(entry);
      if (this._pendingCleanups.length > 128) {
        this._evictOverflowCleanups(128);
      }
    }

    if (chain._cleanupTimer) {
      clearTimeout(chain._cleanupTimer);
    }
    const timer = setTimeout(() => {
      chain._cleanupTimer = null;
      this._disposeChain(chain);
    }, delayMs);
    if (timer && typeof timer.unref === 'function') {
      timer.unref();
    }
    chain._cleanupTimer = timer;
    this._scheduleQueueFlush(delayMs);

    return chain;
  }

  _bindSourceCleanup(source, nodes = [], chain = null, durationSec = 0.3) {
    if (!source) return null;
    const nodeList = Array.isArray(nodes) ? nodes : [nodes];
    if (chain) {
      chain._hadSources = true;
      chain._pendingSources = (chain._pendingSources || 0) + 1;
    }

    const ctx = source.context || chain?._ctx || this.ctx;
    let cleaned = false;
    let queueEntry = null;
    const cleanup = () => {
      if (cleaned) return;
      cleaned = true;
      if (queueEntry) {
        queueEntry.done = true;
        const idx = this._pendingCleanups.indexOf(queueEntry);
        if (idx !== -1) {
          this._pendingCleanups.splice(idx, 1);
        }
        queueEntry = null;
      }
      try {
        if (source.onended === cleanup) {
          source.onended = null;
        }
      } catch {
        // Ignore read-only onended property
      }
      try {
        source.disconnect?.();
      } catch {
        // Ignore disconnect errors
      }
      for (let i = 0; i < nodeList.length; i++) {
        try {
          nodeList[i]?.disconnect?.();
        } catch {
          // Ignore disconnect errors
        }
      }
      if (chain) {
        chain._pendingSources = Math.max(0, (chain._pendingSources || 1) - 1);
        if (chain._sealed && chain._pendingSources === 0) {
          this._disposeChain(chain);
        }
      }
    };

    if (chain) {
      if (!chain._sourceCleanups) {
        chain._sourceCleanups = [];
      }
      chain._sourceCleanups.push(cleanup);
    }
    queueEntry = this._enqueueNodeCleanup(cleanup, durationSec, ctx);

    try {
      source.onended = cleanup;
    } catch {
      // Ignore if mock does not allow setting onended
    }
    if (typeof source.addEventListener === 'function') {
      try {
        source.addEventListener('ended', cleanup, { once: true });
      } catch {
        // Ignore addEventListener errors
      }
    }

    return cleanup;
  }

  createNoiseBuffer() {
    if (!this.ctx) return;
    this._noiseBufferCtx = this.ctx;
    const sampleRate = this.ctx.sampleRate || 44100;
    const length = Math.floor(sampleRate * 1.2);
    if (typeof this.ctx.createBuffer === 'function') {
      const buffer = this.ctx.createBuffer(1, length, sampleRate);
      if (buffer && typeof buffer.getChannelData === 'function') {
        const data = buffer.getChannelData(0);
        for (let i = 0; i < length; i++) {
          data[i] = Math.random() * 2 - 1;
        }
      }
      this.noiseBuffer = buffer || { length, sampleRate };
    } else {
      this.noiseBuffer = { length, sampleRate };
    }
  }

  computeSpatialParams(listener, sourcePos, maxDistance = 24) {
    if (!listener || !sourcePos) {
      return { dist: 0, gain: 1, pan: 0, muffledFreq: 5200, outOfRange: false };
    }
    const lx = Number(listener.x ?? listener.position?.x) || 0;
    const ly = Number(listener.y ?? listener.position?.y) || 0;
    const lz = Number(listener.z ?? listener.position?.z) || 0;
    const yaw = Number(listener.yaw ?? listener.rotation?.y) || 0;

    const sx = Number(sourcePos.x ?? sourcePos.position?.x) || 0;
    const sy = Number(sourcePos.y ?? sourcePos.position?.y) || 0;
    const sz = Number(sourcePos.z ?? sourcePos.position?.z) || 0;

    const dx = sx - lx;
    const dy = sy - ly;
    const dz = sz - lz;
    const dist = Math.hypot(dx, dy, dz);

    if (dist >= maxDistance) {
      return { dist, gain: 0, pan: 0, muffledFreq: 380, outOfRange: true };
    }

    const horizDist = Math.hypot(dx, dz);
    let pan = 0;
    let rearFactor = 1.0;
    if (horizDist > 0.001) {
      // Listener forward = (-sin(yaw), -cos(yaw)), right = (cos(yaw), -sin(yaw))
      const forwardDot = dx * (-Math.sin(yaw)) + dz * (-Math.cos(yaw));
      const rightDot = dx * Math.cos(yaw) + dz * (-Math.sin(yaw));
      const relAngle = Math.atan2(rightDot, forwardDot);
      const nearScale = Math.min(1, horizDist / 0.35);
      pan = Math.max(-1, Math.min(1, Math.sin(relAngle) * nearScale));
      if (forwardDot < 0) {
        rearFactor = 0.86;
      }
    }

    const normDist = Math.max(0, Math.min(1, dist / maxDistance));
    const gain = Math.pow(1 - normDist, 1.4) * rearFactor;
    const muffledFreq = Math.max(380, (5400 - normDist * 4650) * (rearFactor < 1 ? 0.78 : 1.0));

    return {
      dist,
      gain,
      pan,
      muffledFreq,
      outOfRange: gain <= 0.001
    };
  }

  createSpatialChain(ctx, pan, gainValue, now, lowpassFreq = null) {
    this.flushPendingCleanups();
    if (ctx && typeof ctx === 'object' && typeof ctx.createGain !== 'function') {
      pan = ctx;
      ctx = this.ensureContext();
    }
    if (!ctx) {
      ctx = this.ensureContext();
    }
    if (!ctx) return null;

    if (pan && typeof pan === 'object') {
      const params = pan;
      pan = params.pan ?? 0;
      gainValue = params.gain ?? params.gainValue ?? 1;
      now = params.now ?? (ctx?.currentTime || 0);
      lowpassFreq = params.lowpassFreq ?? params.muffledFreq ?? params.cutoff ?? null;
    }
    if (typeof pan !== 'number') pan = 0;
    if (typeof gainValue !== 'number') gainValue = 1;
    if (typeof now !== 'number') now = ctx?.currentTime || 0;

    const distGain = ctx.createGain();
    if (distGain.gain) {
      distGain.gain.value = gainValue;
      distGain.gain.setValueAtTime?.(gainValue, now);
    }

    let panner = null;
    if (typeof ctx.createStereoPanner === 'function') {
      panner = ctx.createStereoPanner();
      if (panner?.pan) {
        panner.pan.value = pan;
        panner.pan.setValueAtTime?.(pan, now);
      }
      distGain.connect(panner);
      panner.connect(ctx.destination);
    } else if (typeof ctx.createPanner === 'function') {
      panner = ctx.createPanner();
      distGain.connect(panner);
      panner.connect(ctx.destination);
    } else {
      distGain.connect(ctx.destination);
    }

    const resolvedFreq =
      typeof lowpassFreq === 'number' && lowpassFreq > 0
        ? lowpassFreq
        : lowpassFreq === false || lowpassFreq === 0
          ? null
          : 5200;

    let lpFilter = null;
    if (resolvedFreq && typeof ctx.createBiquadFilter === 'function') {
      lpFilter = ctx.createBiquadFilter();
      lpFilter.type = 'lowpass';
      if (lpFilter.frequency) {
        lpFilter.frequency.value = resolvedFreq;
        lpFilter.frequency.setValueAtTime?.(resolvedFreq, now);
      }
      lpFilter.connect(distGain);
    }

    const inputNode = lpFilter || distGain;
    const chain = {
      input: inputNode,
      distGain,
      gain: distGain,
      panner,
      filter: lpFilter,
      disposed: false,
      _ctx: ctx,
      _hadSources: false,
      _pendingSources: 0,
      _sealed: false,
      _sourceCleanups: null,
      _cleanupTimer: null,
      _cleanupEntry: null,
      dispose: () => this._disposeChain(chain),
      disposeAfter: (durationSec) => this.scheduleChainCleanup(chain, durationSec)
    };
    if (lpFilter && typeof lpFilter === 'object') lpFilter._spatialChain = chain;
    if (distGain && typeof distGain === 'object') distGain._spatialChain = chain;
    if (panner && typeof panner === 'object') panner._spatialChain = chain;
    return chain;
  }

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

  playSpatialFootstep(listener, sourcePos, isSprinting = false) {
    const spatial = this.computeSpatialParams(listener, sourcePos, 24);
    if (spatial.outOfRange || spatial.gain <= 0.001) return null;

    const ctx = this.ensureContext();
    if (!ctx) return null;
    const now = ctx.currentTime;

    const baseVol = isSprinting ? 0.30 : 0.18;
    const stepGain = baseVol * spatial.gain;
    const chain = this.createSpatialChain(ctx, spatial.pan, stepGain, now, spatial.muffledFreq);

    // 1. Low-mid boot heel thud
    const thudOsc = ctx.createOscillator();
    const thudGain = ctx.createGain();
    thudOsc.type = 'sine';
    const startFreq = isSprinting ? 148 : 116;
    const dur = isSprinting ? 0.08 : 0.07;
    thudOsc.frequency.setValueAtTime(startFreq, now);
    thudOsc.frequency.exponentialRampToValueAtTime(38, now + dur);
    thudGain.gain.setValueAtTime(0.68, now);
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
      const cutoff = Math.min(spatial.muffledFreq, isSprinting ? 520 : 340);
      filter.frequency.value = cutoff;
      filter.frequency.setValueAtTime?.(cutoff, now);

      const noiseGain = ctx.createGain();
      noiseGain.gain.setValueAtTime(isSprinting ? 0.58 : 0.42, now);
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
}

export const sfx = new SoundEffects();

export function scheduleChainCleanup(chain, durationSec = 0.25) {
  return sfx.scheduleChainCleanup(chain, durationSec);
}
