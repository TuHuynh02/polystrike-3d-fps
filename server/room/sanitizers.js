import { randomBytes } from 'node:crypto';
import {
  DEFAULT_MAP_ID,
  MAPS,
  MATCH_CONFIG,
  SHOT_REJECT,
  WEAPONS
} from '../../shared/constants.js';
import { INTERP_DELAY_MIN_MS, INTERP_DELAY_MS } from '../../shared/config.js';

// Server simulation / state broadcast rate. Default 25 Hz (Internet / Render). LAN mode (`npm run lan`, `--lan` or LAN_MODE=1)
// runs 50 Hz because bandwidth is free on a LAN and every tick shaves latency off hit registration and remote-player motion.
// TICK_HZ overrides either default. Capped to [20, 50] Hz: the lag-compensation history ring (LAG_COMP_MAX_SNAPSHOTS = 32 over
// LAG_COMP_HISTORY_MS = 550) only holds 550 ms of history down to a 20 ms tick.
export const LAN_MODE = /^(1|true|yes|on)$/i.test(process.env.LAN_MODE || '') || process.argv.includes('--lan');
const requestedHz = Number(process.env.TICK_HZ);
export const TICK_HZ = Math.min(50, Math.max(20, Number.isFinite(requestedHz) && requestedHz > 0 ? requestedHz : (LAN_MODE ? 50 : 25)));
export const TICK_INTERVAL_MS = Math.round(1000 / TICK_HZ);

// Sent to every client in `roomJoined`: the client's snapshot jitter buffer cannot know the tick rate in advance, and its delay
// floor must follow it (a 70 ms floor would waste the 50 Hz gain). At the default 25 Hz this equals the shared config values
// (floor 70 ms, start 100 ms), so nothing changes there.
export const NET_CONFIG = Object.freeze({
  tickMs: TICK_INTERVAL_MS,
  interpMinMs: Math.min(INTERP_DELAY_MIN_MS, Math.round(TICK_INTERVAL_MS * 1.75)),
  interpInitialMs: Math.min(INTERP_DELAY_MS, Math.round(TICK_INTERVAL_MS * 2.5))
});

// ---- Input-command netcode (client-side prediction + server reconciliation) ----
// A command always costs exactly FIXED_DT of simulated player time. The server only simulates as much player time as
// real time has passed (time-credit bucket), so neither a burst of commands nor a fast client clock can speed-hack.
export const INPUT_QUEUE_MAX = 64; // queued, not yet simulated commands per player
export const INPUT_BATCH_MAX_CMDS = 32; // commands read from one `inputBatch`
export const INPUT_CREDIT_CAP_S = 0.25; // largest real-time credit a player may bank (= max catch-up burst)
export const INPUT_GAP_WAIT_MS = 45; // wait at most ~1 server tick for a missing seq before skipping it
export const INPUT_SEQ_AHEAD_MAX = 3600; // reject seqs further than this (1 minute) beyond the last processed one
export const STALE_EPOCH_ACK_INTERVAL_MS = 100; // throttle of the resync ack sent in reply to stale-epoch batches

function round1(val) {
  return Number.isFinite(val) ? (Math.round(val * 10) / 10) + 0 : 0;
}

function round2(val) {
  return Number.isFinite(val) ? (Math.round(val * 100) / 100) + 0 : 0;
}

export function sanitizeName(raw) {
  if (typeof raw !== 'string') return 'Striker';
  const cleaned = raw
    .replace(/[<>&"'`]/g, '')
    .trim()
    .slice(0, 16);
  return cleaned || `Striker_${ Math.floor(100 + Math.random() * 900) }`;
}

export function sanitizeRoomCode(raw) {
  if (typeof raw !== 'string') return '';
  return raw
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 6);
}

export function sanitizeMapId(raw) {
  if (typeof raw === 'string' && Object.hasOwn(MAPS, raw)) {
    return raw;
  }
  return DEFAULT_MAP_ID;
}

export function sanitizeGameMode(raw) {
  return raw === 'tdm' ? 'tdm' : 'ffa';
}

export function sanitizeTeam(raw) {
  if (raw === 'alpha' || raw === 'bravo') return raw;
  return null;
}

export function createInitialAmmoMap() {
  const map = {};
  for (const [id, cfg] of Object.entries(WEAPONS)) {
    map[id] = cfg.magSize;
  }
  return map;
}

export function createInitialReserveAmmoMap() {
  const map = {};
  for (const [id, cfg] of Object.entries(WEAPONS)) {
    map[id] = cfg.infiniteAmmo ? 0 : (cfg.reserveAmmo ?? cfg.magSize * 3);
  }
  return map;
}

export function sanitizeLoadout(raw = {}, fallbackPrimary = 'rifle') {
  const reqPrimary = raw?.primary || fallbackPrimary;
  const reqSecondary = raw?.secondary || 'pistol';
  const primary = (typeof reqPrimary === 'string' && Object.hasOwn(WEAPONS, reqPrimary) && WEAPONS[reqPrimary]?.slot === 1)
    ? reqPrimary
    : 'rifle';
  const secondary = (typeof reqSecondary === 'string' && Object.hasOwn(WEAPONS, reqSecondary) && WEAPONS[reqSecondary]?.slot === 2)
    ? reqSecondary
    : 'pistol';
  return {
    primary,
    secondary,
    melee: 'knife'
  };
}

// ---- Server-side movement / shot validation limits (client is never trusted for these) ----
// Movement uses a "distance budget" that refills with server time, so neither one big teleport
// nor a flood of small packets can move a player faster than MOVE_MAX_SPEED on average.
export const MOVE_MAX_SPEED = Math.max(14.0, (MATCH_CONFIG.SLIDE_INITIAL_SPEED || 11.2) * 1.25); // m/s horizontal
export const MOVE_BUDGET_CAP_XZ = MOVE_MAX_SPEED * 1.2 + 1.5;
export const MOVE_UP_SPEED = (MATCH_CONFIG.JUMP_FORCE || 8) * 1.5; // m/s upward (jump, step-up)
export const MOVE_DOWN_SPEED = 35; // m/s downward (terminal fall speed is clamped to 30)
export const MOVE_BUDGET_CAP_UP = MOVE_UP_SPEED * 0.6 + 1.0; // ~8 m: jump apex is ~1.5 m, so a big climb needs real time
export const MOVE_BUDGET_CAP_DOWN = MOVE_DOWN_SPEED * 1.2 + 1.5;
export const MOVE_CORRECTION_INTERVAL_MS = 250;


export { SHOT_REJECT };

/** Interval (ms) of periodic owner-only `selfState` reconciliation (~8.3 Hz). */
export const SELF_STATE_INTERVAL_MS = 120;

export function randomSpreadSeed() {
  return randomBytes(4).readUInt32BE(0);
}

export const roundTo = (v, k) => Math.round(v * k) / k;

const mapCeilingCache = new WeakMap();

export function getMapCeilingY(mapCfg) {
  if (!mapCfg) return 4;
  let ceiling = mapCeilingCache.get(mapCfg);
  if (ceiling === undefined) {
    let top = 0;
    for (const box of mapCfg.obstacles || []) {
      const t = box.maxY !== undefined ? box.maxY : box.y + box.h * 0.5;
      if (t > top) top = t;
    }
    ceiling = top + 2.0; // standing on the tallest surface + jump apex headroom
    mapCeilingCache.set(mapCfg, ceiling);
  }
  return ceiling;
}

export function isFiniteVec(v) {
  return Boolean(v) && Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z);
}

export function normalizeDir(v) {
  if (!isFiniteVec(v)) return null;
  const len = Math.hypot(v.x, v.y, v.z);
  if (!(len > 1e-6)) return null;
  return { x: v.x / len, y: v.y / len, z: v.z / len };
}

export function generateRoomCode(existingRooms) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  for (let attempt = 0; attempt < 50; attempt++) {
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += chars[Math.floor(Math.random() * chars.length)];
    }
    if (!existingRooms.has(code)) return code;
  }
  return `RM${ Date.now().toString(36).toUpperCase().slice(-4) }`;
}

export { round1, round2 };

export function applyClassMixins(TargetClass, ...MixinClasses) {
  for (const Mixin of MixinClasses) {
    const descs = Object.getOwnPropertyDescriptors(Mixin.prototype);
    delete descs.constructor;
    Object.defineProperties(TargetClass.prototype, descs);
  }
}
