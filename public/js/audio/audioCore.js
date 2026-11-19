const SALTLINE_BUFFER_KEYS = [
  'rifle',
  'm4a1',
  'scar',
  'smg',
  'lmg',
  'shotgun',
  'sniper',
  'pistol',
  'glock',
  'deagle',
  'knife',
  'magout',
  'magin',
  'bolt_rack',
  'shell_clink'
];

let SHARED_TANH_CURVE = null;
function getSoftClipCurve() {
  if (!SHARED_TANH_CURVE) {
    const n = 1024;
    SHARED_TANH_CURVE = new Float32Array(n);
    const drive = 1.45;
    const norm = Math.tanh(drive);
    for (let i = 0; i < n; i++) {
      const x = (i * 2) / (n - 1) - 1;
      SHARED_TANH_CURVE[i] = Math.tanh(x * drive) / norm;
    }
  }
  return SHARED_TANH_CURVE;
}

function synthesizeSaltlinePcm(id, sampleRate = 44100) {
  let seed = 0x5a1719e ^ (id.length * 2654435761);
  for (let c = 0; c < id.length; c++) {
    seed = Math.imul(seed ^ id.charCodeAt(c), 1597334677);
  }
  const rand = () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 2147483648 - 1;
  };

  if (id === 'shell_clink') {
    const dur = 0.095;
    const len = Math.floor(sampleRate * dur);
    const out = new Float32Array(len);
    for (let i = 0; i < len; i++) {
      const t = i / sampleRate;
      const bounce1 = Math.exp(-t / 0.016);
      const bounce2 = t > 0.038 ? Math.exp(-(t - 0.038) / 0.013) * 0.62 : 0;
      const env = bounce1 + bounce2;
      const ring =
        Math.sin(6.283185 * 3340 * t) * 0.52 +
        Math.sin(6.283185 * 4980 * t) * 0.31 +
        Math.sin(6.283185 * 6410 * t) * 0.17;
      out[i] = ring * env * 0.68;
    }
    return out;
  }

  if (id === 'magout' || id === 'magin' || id === 'bolt_rack') {
    const dur = id === 'bolt_rack' ? 0.15 : 0.115;
    const len = Math.floor(sampleRate * dur);
    const out = new Float32Array(len);
    let lp = 0;
    for (let i = 0; i < len; i++) {
      const t = i / sampleRate;
      const wn = rand();
      lp += 0.24 * (wn - lp);
      const bp = wn - lp;
      if (id === 'magout') {
        const click = Math.exp(-t / 0.008) * Math.sin(6.283185 * 1420 * t) * 0.55;
        const slide = t > 0.015 ? Math.exp(-(t - 0.015) / 0.032) * bp * 0.34 : 0;
        out[i] = Math.tanh((click + slide) * 1.5);
      } else if (id === 'magin') {
        const seatThud = Math.exp(-t / 0.018) * Math.sin(6.283185 * (240 - t * 900) * t) * 0.62;
        const catchSnap = t > 0.042
          ? Math.exp(-(t - 0.042) / 0.011) * (Math.sin(6.283185 * 1890 * (t - 0.042)) * 0.55 + bp * 0.35)
          : 0;
        out[i] = Math.tanh((seatThud + catchSnap) * 1.6);
      } else {
        const pull = Math.exp(-t / 0.022) * (bp * 0.42 + Math.sin(6.283185 * 1180 * t) * 0.35);
        const slam = t > 0.068
          ? Math.exp(-(t - 0.068) / 0.016) *
            (Math.sin(6.283185 * 2240 * (t - 0.068)) * 0.52 +
             Math.sin(6.283185 * 3480 * (t - 0.068)) * 0.28 +
             bp * 0.45)
          : 0;
        out[i] = Math.tanh((pull + slam) * 1.65);
      }
    }
    return out;
  }

  if (id === 'knife') {
    const dur = 0.145;
    const len = Math.floor(sampleRate * dur);
    const out = new Float32Array(len);
    let lp = 0;
    for (let i = 0; i < len; i++) {
      const t = i / sampleRate;
      const wn = rand();
      const alpha = 0.14 + 0.22 * Math.exp(-t / 0.045);
      lp += alpha * (wn - lp);
      const whoosh = (wn - lp) * Math.sin(Math.min(1, t / 0.03) * 1.5708) * Math.exp(-t / 0.042) * 0.55;
      const steel = (Math.sin(6.283185 * 2960 * t) * 0.35 + Math.sin(6.283185 * 4420 * t) * 0.2) * Math.exp(-t / 0.028);
      out[i] = Math.tanh((whoosh + steel) * 1.35);
    }
    return out;
  }

  // Saltline physical-modeling firearm synthesis profiles
  const profiles = {
    rifle:   { dur: 0.28, f0: 215, f1: 42, subTau: 0.058, bodyTau: 0.068, lpA: 0.22, crack: 0.92, modes: [1490, 2380, 3560], slapAt: 0.018, slapAmt: 0.20 },
    m4a1:    { dur: 0.16, f0: 245, f1: 58, subTau: 0.036, bodyTau: 0.032, lpA: 0.36, crack: 0.48, modes: [1840, 2960, 4280], slapAt: 0.014, slapAmt: 0.06 },
    scar:    { dur: 0.33, f0: 182, f1: 34, subTau: 0.078, bodyTau: 0.088, lpA: 0.17, crack: 0.98, modes: [1220, 2040, 3180], slapAt: 0.020, slapAmt: 0.24 },
    deagle:  { dur: 0.34, f0: 175, f1: 32, subTau: 0.082, bodyTau: 0.092, lpA: 0.18, crack: 1.02, modes: [1160, 1980, 3120], slapAt: 0.021, slapAmt: 0.25 },
    lmg:     { dur: 0.31, f0: 188, f1: 36, subTau: 0.072, bodyTau: 0.082, lpA: 0.19, crack: 0.94, modes: [1280, 2160, 3320], slapAt: 0.019, slapAmt: 0.22 },
    shotgun: { dur: 0.40, f0: 150, f1: 27, subTau: 0.105, bodyTau: 0.125, lpA: 0.14, crack: 1.05, modes: [980, 1740, 2680],  slapAt: 0.024, slapAmt: 0.28 },
    sniper:  { dur: 0.52, f0: 228, f1: 24, subTau: 0.140, bodyTau: 0.175, lpA: 0.16, crack: 1.15, modes: [1320, 2460, 3890], slapAt: 0.026, slapAmt: 0.32 },
    smg:     { dur: 0.19, f0: 280, f1: 56, subTau: 0.042, bodyTau: 0.045, lpA: 0.30, crack: 0.72, modes: [2080, 3240, 4560], slapAt: 0.015, slapAmt: 0.14 },
    glock:   { dur: 0.18, f0: 292, f1: 60, subTau: 0.038, bodyTau: 0.042, lpA: 0.32, crack: 0.70, modes: [2160, 3380, 4680], slapAt: 0.015, slapAmt: 0.13 },
    pistol:  { dur: 0.20, f0: 268, f1: 52, subTau: 0.045, bodyTau: 0.048, lpA: 0.28, crack: 0.76, modes: [1960, 3120, 4420], slapAt: 0.016, slapAmt: 0.15 }
  };
  const p = profiles[id] || profiles.rifle;
  const len = Math.floor(sampleRate * p.dur);
  const out = new Float32Array(len);
  const slapSamples = Math.max(1, Math.floor(sampleRate * p.slapAt));

  let subPhase = 0;
  let lpFast = 0;
  let lpSlow = 0;
  for (let i = 0; i < len; i++) {
    const t = i / sampleRate;
    const wn = rand();

    // 1. 0-2.6ms Supersonic N-wave muzzle crack + 2.6kHz resonant transient
    const crackEnv = Math.exp(-t / 0.0023) * p.crack;
    const crack = (Math.tanh(wn * 3.4) * 0.72 + Math.sin(6.283185 * 2650 * t) * 0.48) * crackEnv;

    // 2. Phase-continuous chamber pressure sub punch
    const instFreq = p.f1 + (p.f0 - p.f1) * Math.exp(-t / (p.subTau * 0.58));
    subPhase += (6.283185 * instFreq) / sampleRate;
    const sub = Math.sin(subPhase) * Math.exp(-t / p.subTau) * 0.74;

    // 3. Band-limited propellant blast body
    lpFast += p.lpA * (wn - lpFast);
    lpSlow += (p.lpA * 0.22) * (lpFast - lpSlow);
    const bandNoise = (lpFast - lpSlow) * 2.15;
    const body = bandNoise * Math.exp(-t / p.bodyTau) * 0.82;

    // 4. Cold-forged steel receiver modal resonance
    const mechEnv = Math.exp(-t / 0.022) * 0.20;
    const mech =
      (Math.sin(6.283185 * p.modes[0] * t) * 0.50 +
       Math.sin(6.283185 * p.modes[1] * t) * 0.32 +
       Math.sin(6.283185 * p.modes[2] * t) * 0.18) * mechEnv;

    // 5. Outdoor tactical courtyard slapback reflection
    const earlyTap = i >= slapSamples ? out[i - slapSamples] * p.slapAmt : 0;

    out[i] = Math.tanh((crack + sub + body + mech + earlyTap) * 1.18) * 0.92;
  }
  return out;
}

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
    if (this.ctx && this._masterBusCtx !== this.ctx) {
      this._ensureMasterBus(this.ctx);
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

  _ensureMasterBus(ctx) {
    this._masterBusCtx = ctx;
    this._masterInput = null;
    this._reverbSend = null;
    if (!ctx || typeof ctx.createGain !== 'function' || !ctx.destination) return;

    try {
      const masterIn = ctx.createGain();
      if (masterIn.gain) {
        masterIn.gain.value = 0.94;
      }
      let tailNode = masterIn;

      if (typeof ctx.createDynamicsCompressor === 'function') {
        const comp = ctx.createDynamicsCompressor();
        if (comp) {
          if (comp.threshold) comp.threshold.value = -9;
          if (comp.knee) comp.knee.value = 8;
          if (comp.ratio) comp.ratio.value = 4.5;
          if (comp.attack) comp.attack.value = 0.002;
          if (comp.release) comp.release.value = 0.09;
          tailNode.connect(comp);
          tailNode = comp;
        }
      }

      if (typeof ctx.createWaveShaper === 'function') {
        const shaper = ctx.createWaveShaper();
        if (shaper) {
          try {
            shaper.curve = getSoftClipCurve();
            if ('oversample' in shaper) shaper.oversample = '2x';
          } catch {
            // Ignore read-only curve on minimal mocks
          }
          tailNode.connect(shaper);
          tailNode = shaper;
        }
      }

      tailNode.connect(ctx.destination);
      this._masterInput = masterIn;

      // Synthesize lightweight outdoor courtyard impulse response for crisp gunshot spatial tail
      if (typeof ctx.createConvolver === 'function' && typeof ctx.createBuffer === 'function') {
        const sr = ctx.sampleRate || 44100;
        const irLen = Math.floor(sr * 0.32);
        const irBuf = ctx.createBuffer(2, irLen, sr);
        if (irBuf && typeof irBuf.getChannelData === 'function') {
          for (let ch = 0; ch < 2; ch++) {
            const data = irBuf.getChannelData(ch);
            let lp = 0;
            let s = 0x13579bdf ^ (ch * 0x2468ace1);
            for (let i = 0; i < irLen; i++) {
              s = (s + 0x6d2b79f5) | 0;
              const wn = (((s ^ (s >>> 14)) >>> 0) / 2147483648) - 1;
              lp += 0.26 * (wn - lp);
              const t = i / sr;
              const early = (i === Math.floor(sr * (ch === 0 ? 0.016 : 0.021)) ? 0.55 : 0);
              data[i] = (lp * Math.exp(-t / 0.075) * 0.42 + early);
            }
          }
          const conv = ctx.createConvolver();
          conv.buffer = irBuf;
          const sendGain = ctx.createGain();
          if (sendGain.gain) sendGain.gain.value = 0.13;
          sendGain.connect(conv);
          conv.connect(masterIn);
          this._reverbSend = sendGain;
        }
      }
    } catch {
      this._masterInput = ctx.destination;
      this._reverbSend = null;
    }
  }

  getMasterInput(ctx = this.ctx) {
    if (ctx && ctx === this._masterBusCtx && this._masterInput) {
      return this._masterInput;
    }
    return ctx?.destination || null;
  }

  /**
   * Time-sliced Saltline procedural PCM pre-synthesis (<= 4ms slices) so Lobby stays 60 FPS interactive
   * and zero synthesis work happens on the first gunshot in match regardless of hardware AudioContext sampleRate.
   */
  async prewarmAudioBuffers(onProgress = null) {
    if (!this._pcmCache) this._pcmCache = new Map();
    const total = SALTLINE_BUFFER_KEYS.length;
    const pcmRate = 44100;
    let sliceStart = typeof performance !== 'undefined' ? performance.now() : Date.now();

    for (let i = 0; i < total; i++) {
      const key = SALTLINE_BUFFER_KEYS[i];
      if (!this._pcmCache.has(key)) {
        this._pcmCache.set(key, synthesizeSaltlinePcm(key, pcmRate));
      }
      onProgress?.((i + 1) / total);
      const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
      if (now - sliceStart >= 4 && i < total - 1) {
        await new Promise((r) => setTimeout(r, 6));
        sliceStart = typeof performance !== 'undefined' ? performance.now() : Date.now();
      }
    }
    onProgress?.(1);
    return this._pcmCache.size;
  }

  getSaltlineAudioBuffer(ctx, key) {
    if (!ctx || typeof ctx.createBuffer !== 'function') return null;
    if (!this._pcmCache) this._pcmCache = new Map();
    if (!this._audioBufferCache || this._audioBufferCacheCtx !== ctx) {
      this._audioBufferCache = new Map();
      this._audioBufferCacheCtx = ctx;
    }
    if (this._audioBufferCache.has(key)) {
      return this._audioBufferCache.get(key);
    }
    const pcmRate = 44100;
    let pcm = this._pcmCache.get(key);
    if (!pcm) {
      pcm = synthesizeSaltlinePcm(key, pcmRate);
      this._pcmCache.set(key, pcm);
    }
    const buf = ctx.createBuffer(1, pcm.length, pcmRate);
    if (!buf || typeof buf.getChannelData !== 'function') return null;
    buf.getChannelData(0).set(pcm);
    this._audioBufferCache.set(key, buf);
    return buf;
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

    const masterOut = this.getMasterInput(ctx) || ctx.destination;
    let panner = null;
    if (typeof ctx.createStereoPanner === 'function') {
      panner = ctx.createStereoPanner();
      if (panner?.pan) {
        panner.pan.value = pan;
        panner.pan.setValueAtTime?.(pan, now);
      }
      distGain.connect(panner);
      panner.connect(masterOut);
    } else if (typeof ctx.createPanner === 'function') {
      panner = ctx.createPanner();
      distGain.connect(panner);
      panner.connect(masterOut);
    } else {
      distGain.connect(masterOut);
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
