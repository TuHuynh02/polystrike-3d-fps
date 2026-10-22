export class AudioCoreMethods {
  ensureContext() {
    if (!this.enabled) return null;
    const AudioCtx =
      (typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext)) ||
      globalThis.AudioContext ||
      globalThis.webkitAudioContext;
    if (
      !this.ctx ||
      this.ctx.state === 'closed' ||
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
    if (this.ctx.state && this.ctx.state !== 'running' && typeof this.ctx.resume === 'function') {
      try {
        const res = this.ctx.resume();
        if (res && typeof res.catch === 'function') {
          res.catch(() => {});
        }
      } catch {
        // Ignore resume errors before user gesture
      }
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
      const isLiveSuspendedCtx =
        entry.ctx &&
        typeof entry.ctx.state === 'string' &&
        entry.ctx.state !== 'running' &&
        entry.ctx.state !== 'closed';
      const perfExpired = forceAll || (!isLiveSuspendedCtx && nowPerf >= entry.expireAtPerf);
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

  _evictOverflowCleanups(maxEntries = 512) {
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
    const wakeGraceMs =
      ctx && typeof ctx.state === 'string' && ctx.state !== 'running' ? 350 : 0;
    const delayMs = Math.max(1, Math.ceil(dur * 1000) + wakeGraceMs);
    const expireAtPerf = nowPerf + dur * 1000 + wakeGraceMs;
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
    if (this._pendingCleanups.length > 512) {
      this.flushPendingCleanups();
      if (this._pendingCleanups.length > 512) {
        this._evictOverflowCleanups(512);
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
    const ctx =
      chain._ctx ||
      chain.gain?.context ||
      chain.distGain?.context ||
      chain.filter?.context ||
      chain.panner?.context ||
      this.ctx;
    const wakeGraceMs =
      ctx && typeof ctx.state === 'string' && ctx.state !== 'running' ? 350 : 0;
    const delayMs = Math.max(1, Math.ceil(dur * 1000) + wakeGraceMs);
    const expireAtPerf = nowPerf + dur * 1000 + wakeGraceMs;
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
      if (this._pendingCleanups.length > 512) {
        this._evictOverflowCleanups(512);
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
}
