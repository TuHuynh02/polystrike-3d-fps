// Lightweight server health metrics for /api/netstats: tick duration, tick scheduling lateness and snapshot size.
// Counts and timings only - no player ids, names, addresses or positions.

/** Fixed-size ring of numbers with percentile / max helpers (allocation-free on the hot path). */
export class RollingStats {
  constructor(capacity = 256) {
    this.capacity = capacity;
    this.values = new Float64Array(capacity);
    this.count = 0;
    this.head = 0;
    this.maxEver = 0;
    this.total = 0;
  }

  push(v) {
    if (!Number.isFinite(v)) return;
    this.values[this.head] = v;
    this.head = (this.head + 1) % this.capacity;
    if (this.count < this.capacity) this.count++;
    if (v > this.maxEver) this.maxEver = v;
    this.total++;
  }

  /** p in 0..1 over the retained window; 0 when empty. */
  percentile(p) {
    if (this.count === 0) return 0;
    const s = Array.from(this.values.subarray(0, this.count)).sort((a, b) => a - b);
    return s[Math.min(s.length - 1, Math.max(0, Math.floor(p * (s.length - 1))))];
  }

  mean() {
    if (this.count === 0) return 0;
    let sum = 0;
    for (let i = 0; i < this.count; i++) sum += this.values[i];
    return sum / this.count;
  }

  max() {
    let m = 0;
    for (let i = 0; i < this.count; i++) if (this.values[i] > m) m = this.values[i];
    return m;
  }

  summary(digits = 2) {
    const f = (v) => Number(v.toFixed(digits));
    return {
      samples: this.count,
      mean: f(this.mean()),
      p95: f(this.percentile(0.95)),
      max: f(this.max()),
      maxEver: f(this.maxEver)
    };
  }
}

export class ServerNetStats {
  constructor() {
    this.tickMs = new RollingStats(256);       // time spent inside RoomManager.tick()
    this.tickLateMs = new RollingStats(256);   // how late the tick slot started (event-loop stall / timer slack)
    this.snapshotBytes = new RollingStats(32); // JSON size of one stateUpdate (sampled about once per second)
    this.skippedSlots = 0;                     // 40 ms slots lost to a long tick / stall
    this.startedAt = Date.now();
  }

  recordTick(durationMs, lateMs) {
    this.tickMs.push(durationMs);
    if (lateMs !== undefined) this.tickLateMs.push(Math.max(0, lateMs));
  }

  recordSnapshotBytes(bytes) {
    this.snapshotBytes.push(bytes);
  }

  /** `info` = { tickIntervalMs, rooms, players } (plain counts). */
  report(info = {}) {
    const tickHz = info.tickIntervalMs > 0 ? 1000 / info.tickIntervalMs : 0;
    const snap = this.snapshotBytes.summary(0);
    return {
      uptimeSec: Math.floor((Date.now() - this.startedAt) / 1000),
      tickIntervalMs: info.tickIntervalMs ?? null,
      rooms: info.rooms ?? 0,
      players: info.players ?? 0,
      tickDurationMs: this.tickMs.summary(3),
      tickLatenessMs: this.tickLateMs.summary(2),
      skippedSlots: this.skippedSlots,
      snapshotBytes: snap,
      // downstream snapshot traffic of one client (stateUpdate only), bytes per second
      snapshotBytesPerSecPerClient: Math.round(snap.mean * tickHz)
    };
  }
}
