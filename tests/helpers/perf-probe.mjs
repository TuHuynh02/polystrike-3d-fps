// Headless performance probe for the shot / firefight path (client Game3D + server RoomManager).
// Shared by scripts/perf-shots.mjs (prints the baseline table) and tests/shot-performance.test.mjs (regression guards).
//
// What it can measure WITHOUT a GPU: counts of THREE objects constructed / disposed, Web Audio nodes created, scene graph
// size and the number of lights the renderer would see, JS heap bytes allocated by the client per frame, CPU ms of the
// client code paths, server tick / resolveShot ms, emitted socket events and their JSON byte size.
// What it cannot measure: GPU time, shader compile time, texture upload, real GC pauses, DOM layout (see the final report).

import { performance as realPerf } from 'node:perf_hooks';
import v8 from 'node:v8';
import './headless-game3d.mjs';
import { createTestGame3D, loadGame3D } from './headless-game3d.mjs';
import { WEAPONS, getEffectiveFireRateMs } from '../../shared/constants.js';
import { FIXED_DT } from '../../shared/movement.js';
import { buildInputCommand } from '../../shared/netcode.js';
import { createFakeGL, installFakeWebGL2Class } from './fake-gl.mjs';
import { recordPlayerSnapshot } from '../../shared/lagCompensation.js';
import { RoomManager } from '../../server/roomManager.js';

export const MAP_ID = 'cyber_citadel';
export const FRAME_MS = 1000 / 60;
export const TICK_MS = 40;

// ---------------------------------------------------------------- virtual clock (game time) vs real clock (CPU timing)
const clock = { now: 1_000_000, installed: false, origPerfNow: null, origDateNow: null };

export function installVirtualClock(start = 1_000_000) {
  clock.now = start;
  if (clock.installed) return;
  clock.origPerfNow = globalThis.performance.now.bind(globalThis.performance);
  clock.origDateNow = Date.now;
  globalThis.performance.now = () => clock.now;
  Date.now = () => clock.now;
  clock.installed = true;
}

export function uninstallVirtualClock() {
  if (!clock.installed) return;
  globalThis.performance.now = clock.origPerfNow;
  Date.now = clock.origDateNow;
  clock.installed = false;
}

export function advanceClock(ms) {
  clock.now += ms;
  return clock.now;
}

export const virtualNow = () => clock.now;

const hr = () => Number(process.hrtime.bigint()) / 1e6; // real ms

// ---------------------------------------------------------------- THREE object counters
let countersInstalled = false;
const disposeCounts = { geometry: 0, material: 0, texture: 0 };

/** Wraps the dispose() prototypes once (counting only; behaviour unchanged). */
export function installDisposeCounters(THREE) {
  if (countersInstalled) return;
  countersInstalled = true;
  const wrap = (proto, key) => {
    const orig = proto.dispose;
    proto.dispose = function patchedDispose(...args) {
      disposeCounts[key]++;
      return orig.apply(this, args);
    };
  };
  wrap(THREE.BufferGeometry.prototype, 'geometry');
  wrap(THREE.Material.prototype, 'material');
  wrap(THREE.Texture.prototype, 'texture');
}

/**
 * Constructor counts, derived from THREE's global id counters (every Object3D / Material / BufferGeometry / Texture takes the
 * next id on construction), so no constructor has to be wrapped. The throw-away probe instance consumes one id (subtracted).
 */
export function counterSnapshot(THREE) {
  return {
    objects: new THREE.Object3D().id,
    materials: new THREE.MeshBasicMaterial().id,
    geometries: new THREE.BufferGeometry().id,
    textures: new THREE.Texture().id,
    disposeGeometry: disposeCounts.geometry,
    disposeMaterial: disposeCounts.material,
    disposeTexture: disposeCounts.texture
  };
}

export function counterDiff(a, b) {
  return {
    objects: b.objects - a.objects - 1,
    materials: b.materials - a.materials - 1,
    geometries: b.geometries - a.geometries - 1,
    textures: b.textures - a.textures - 1,
    disposeGeometry: b.disposeGeometry - a.disposeGeometry,
    disposeMaterial: b.disposeMaterial - a.disposeMaterial,
    disposeTexture: b.disposeTexture - a.disposeTexture
  };
}

/** Scene stats: what the renderer would put in its render list. */
export function sceneStats(scene) {
  const s = { children: scene.children.length, objects: 0, meshes: 0, lines: 0, sprites: 0, lights: 0, pointLights: 0, spotLights: 0, dirLights: 0 };
  scene.traverseVisible((o) => {
    s.objects++;
    if (o.isMesh) s.meshes++;
    else if (o.isLine) s.lines++;
    else if (o.isSprite) s.sprites++;
    if (o.isLight) {
      s.lights++;
      if (o.isPointLight) s.pointLights++;
      else if (o.isSpotLight) s.spotLights++;
      else if (o.isDirectionalLight) s.dirLights++;
    }
  });
  return s;
}

// ---------------------------------------------------------------- Web Audio mock (counts nodes)
export const audioCounts = { total: 0, byType: {}, voices: 0 };

function makeParam() {
  return {
    value: 0,
    setValueAtTime() { return this; },
    linearRampToValueAtTime() { return this; },
    exponentialRampToValueAtTime() { return this; },
    setTargetAtTime() { return this; },
    cancelScheduledValues() { return this; }
  };
}

function makeNode(type) {
  audioCounts.total++;
  audioCounts.byType[type] = (audioCounts.byType[type] || 0) + 1;
  return {
    type: 'sine',
    buffer: null,
    gain: makeParam(),
    frequency: makeParam(),
    detune: makeParam(),
    Q: makeParam(),
    pan: makeParam(),
    positionX: makeParam(),
    positionY: makeParam(),
    positionZ: makeParam(),
    connect(n) { return n || this; },
    disconnect() {},
    start() {},
    stop() {},
    addEventListener() {},
    removeEventListener() {},
    setPosition() {},
    setOrientation() {}
  };
}

export class MockAudioContext {
  constructor() {
    this.state = 'running';
    this.sampleRate = 44100;
    this.destination = { maxChannelCount: 2, connect() {}, disconnect() {} };
    this.listener = { positionX: makeParam(), positionY: makeParam(), positionZ: makeParam(), setPosition() {} };
  }
  get currentTime() { return clock.now / 1000; }
  resume() { return Promise.resolve(); }
  createBuffer(channels, length) {
    audioCounts.total++;
    audioCounts.byType.buffer = (audioCounts.byType.buffer || 0) + 1;
    const data = new Float32Array(length);
    return { length, getChannelData: () => data };
  }
  createBufferSource() { return makeNode('bufferSource'); }
  createOscillator() { return makeNode('oscillator'); }
  createGain() { return makeNode('gain'); }
  createBiquadFilter() { return makeNode('biquad'); }
  createStereoPanner() { return makeNode('stereoPanner'); }
  createPanner() { return makeNode('panner'); }
  createDynamicsCompressor() { return makeNode('compressor'); }
  createConvolver() { return makeNode('convolver'); }
  createWaveShaper() { return makeNode('waveShaper'); }
  createDelay() { return makeNode('delay'); }
}

export function installAudioMock() {
  globalThis.AudioContext = MockAudioContext;
  if (globalThis.window) globalThis.window.AudioContext = MockAudioContext;
}

export function removeAudioMock() {
  delete globalThis.AudioContext;
  if (globalThis.window) delete globalThis.window.AudioContext;
}

// ---------------------------------------------------------------- server harness with an emit recorder
export function createRecordingServer() {
  const log = [];
  const recipients = new Map(); // room code / socket id -> recipient count
  // Bytes are computed AFTER the timed server code (sizeLog), so JSON.stringify never pollutes the tick timings.
  const record = (to, event, payload, volatile) => {
    log.push({ to, event, volatile, payload, bytes: -1, fanout: recipients.get(to) || 1 });
  };
  const io = {
    to: (target) => ({
      emit: (event, payload) => record(target, event, payload, false),
      volatile: { emit: (event, payload) => record(target, event, payload, true) }
    })
  };
  const rm = new RoomManager(io);
  rm.stop();
  const sizeLog = (from = 0) => {
    for (let i = from; i < log.length; i++) {
      if (log[i].bytes < 0) log[i].bytes = JSON.stringify(log[i].payload ?? null).length;
    }
  };
  return { rm, io, log, recipients, sizeLog };
}

// ---------------------------------------------------------------- the firefight scenario
function aimYaw(from, to) {
  return Math.atan2(-(to.x - from.x), -(to.z - from.z));
}

/** Handlers equal to the shot-related socket handlers of public/js/main.js, minus DOM work (which cannot run headless). */
function deliverToClient(game, sfx, ev, ctx) {
  switch (ev.event) {
    case 'shotFired': {
      const data = ev.payload;
      if (data.shooterId === game.localId) break;
      const dist = Math.hypot(data.origin.x - game.position.x, data.origin.y - game.position.y, data.origin.z - game.position.z);
      const vol = Math.max(0.06, 1 - dist / 85);
      ctx.measure('shotFiredHandler', () => {
        if (ctx.mainShotSound) sfx.playShot(data.weapon, vol * 0.58);
        const endPt = data.hitPoint || {
          x: data.origin.x + data.dir.x * 55,
          y: data.origin.y + data.dir.y * 55,
          z: data.origin.z + data.dir.z * 55
        };
        game.triggerRemoteShotEffect(data.shooterId, data.weapon, data.origin, endPt);
      });
      ctx.remoteShots++;
      break;
    }
    case 'damageDealt': {
      const data = ev.payload;
      if (data.targetId && data.targetId !== game.localId && typeof data.hp === 'number') {
        const rp = game.remotePlayers.get(data.targetId);
        if (rp) rp.hp = data.hp;
      }
      if (data.attackerId === game.localId && data.targetId !== game.localId) {
        ctx.measure('damageDealtHandler', () => game.spawnDamagePopup(data.targetId, data.damage, Boolean(data.isHeadshot)));
      }
      if (data.targetId === game.localId) game.applyDamageFlinch(data.damage);
      break;
    }
    case 'selfState':
      if (ev.to === game.localId) ctx.measure('selfStateHandler', () => game.applySelfState(ev.payload));
      break;
    case 'moveAck':
      if (ev.to === game.localId) ctx.measure('moveAckHandler', () => game.applyMoveAck(ev.payload));
      break;
    default:
      break;
  }
}

/**
 * Runs one firefight: `playerCount` players in one room, the first is the real Game3D client (local player), the others are
 * scripted shooters sending FIRE commands through RoomManager exactly like a client does. Everybody shoots `weapon`.
 * Returns a metrics object. The game uses the virtual clock; CPU timings use the real clock.
 */
export async function runFirefight({
  playerCount = 2,
  weapon = 'rifle',
  tier = 'medium',
  seconds = 4,
  warmupSeconds = 1.5,
  audio = false,
  mainShotSound = false,
  realRenderer = false,
  gameHook = null
} = {}) {
  const { THREE } = await loadGame3D();
  installDisposeCounters(THREE);
  installVirtualClock(5_000_000);
  if (audio) installAudioMock();
  else removeAudioMock();
  if (realRenderer) {
    // the REAL three.js WebGLRenderer on a fake GL context: counts draw calls / triangles / programs, not GPU time
    installFakeWebGL2Class();
    globalThis.__headlessRendererFactory = (params, makeCanvas) => {
      const canvas = makeCanvas(1280, 720);
      const { gl, stats } = createFakeGL(canvas);
      const renderer = new globalThis.__RealWebGLRenderer({ ...params, canvas, context: gl });
      renderer.__fakeGL = stats;
      return renderer;
    };
  } else {
    delete globalThis.__headlessRendererFactory;
  }

  const { rm, log, recipients, sizeLog } = createRecordingServer();
  const roomCode = `PERF${playerCount}`;
  const ids = Array.from({ length: playerCount }, (_, i) => `p${i + 1}`);
  const players = [];
  let room = null;
  for (const id of ids) {
    const res = rm.addHumanPlayer(
      { id },
      { name: id, roomCode, mode: 'private', mapId: MAP_ID, weapon, loadout: { primary: weapon, secondary: 'pistol', melee: 'knife' } }
    );
    if (res.error) throw new Error(res.error);
    room = res.room;
    players.push(res.player);
  }
  recipients.set(roomCode, playerCount);

  // Open plaza line-up, everybody facing the local player (index 0) / the local player facing player 1
  const t0 = virtualNow();
  players.forEach((p, i) => {
    p.invulnerableUntil = 0;
    const row = i === 0 ? 0 : 1 + ((i - 1) % 2);
    const col = i === 0 ? 0 : Math.floor((i - 1) / 2);
    p.x = (col % 2 ? -1 : 1) * Math.ceil(col / 2) * 2.4;
    p.y = 0;
    p.z = -16 - row * 4;
    rm.resetPlayerMovement(p, t0);
  });
  players.forEach((p, i) => {
    const target = i === 0 ? players[1] : players[0];
    p.yaw = aimYaw(p, target);
    p.pitch = 0;
  });
  for (const p of players) recordPlayerSnapshot(p, t0);

  const cfg = WEAPONS[weapon];
  const game = await createTestGame3D({ qualityChoice: tier, detectedTier: tier });
  const sfx = game.sfx;
  const local = players[0];
  game.localId = local.id;
  game.inMatch = true;
  game.alive = true;
  game.isPointerLocked = true;
  game.resetNetcode(local.moveEpoch);
  game.setSpreadSeed(local.spreadSeed);
  game.spawnLocalPlayer({
    id: local.id, x: local.x, y: local.y, z: local.z, yaw: local.yaw, pitch: 0, weapon,
    spreadSeed: local.spreadSeed, loadout: local.loadout
  });
  game.physTracked.x = game.position.x;
  game.physTracked.y = game.position.y;
  game.physTracked.z = game.position.z;
  game.equipUntil = 0;
  game.yaw = local.yaw;
  game.pitch = 0;
  game.syncPlayersState(rm.serializePlayers(room), virtualNow());
  gameHook?.(game, { rm, room, players });

  // ---- measuring wrappers (instance level; behaviour untouched)
  const timers = {}; // name -> { calls, ms, alloc }
  const ctx = {
    remoteShots: 0,
    mainShotSound,
    measure(name, fn) {
      const t = (timers[name] ||= { calls: 0, ms: 0, alloc: 0 });
      const h0 = v8.getHeapStatistics().used_heap_size;
      const c0 = hr();
      const r = fn();
      t.ms += hr() - c0;
      const d = v8.getHeapStatistics().used_heap_size - h0;
      if (d > 0) t.alloc += d;
      t.calls++;
      return r;
    }
  };
  for (const name of ['attemptShoot', 'predictFireCommand', 'spawnTracerEffect', 'spawnShotVisual', 'spawnShellCasing', 'spawnDamagePopup', 'updateRemotePlayers']) {
    const orig = game[name].bind(game);
    game[name] = (...args) => ctx.measure(`game.${name}`, () => orig(...args));
  }
  const serverTimers = {};
  const wrapServer = (name) => {
    const orig = rm[name].bind(rm);
    rm[name] = (...args) => {
      const t = (serverTimers[name] ||= { calls: 0, ms: 0 });
      const c0 = hr();
      const r = orig(...args);
      t.ms += hr() - c0;
      t.calls++;
      return r;
    };
  };
  for (const name of ['tick', 'processFireCommand', 'resolveShot', 'processPlayerInputs', 'buildSelfState']) wrapServer(name);

  // ---- scripted shooters (everyone except the local player)
  const bots = players.slice(1).map((p) => ({
    p, seq: 0, ss: 0, lastFireMs: -1e9, cmdClockMs: 0, nextAt: 0
  }));
  const rateMs = getEffectiveFireRateMs(cfg, false);
  const botEpochSeqStart = () => bots.forEach((b) => { b.seq = b.p.lastProcessedSeq || 0; });
  botEpochSeqStart();
  bots.forEach((b) => { b.nextAt = virtualNow(); });

  const sendBotCommands = (upToMs) => {
    for (const b of bots) {
      const cmds = [];
      while (b.nextAt <= upToMs) {
        // one command per fixed step
        b.seq++;
        b.cmdClockMs += FIXED_DT * 1000;
        const fire = b.cmdClockMs - b.lastFireMs >= rateMs * 0.95;
        if (fire) {
          b.ss++;
          b.lastFireMs = b.cmdClockMs;
        }
        cmds.push(buildInputCommand(b.seq, {
          yaw: b.p.yaw, pitch: 0, weapon, fire, shotSeq: fire ? b.ss : 0
        }));
        b.nextAt += FIXED_DT * 1000;
      }
      if (cmds.length) {
        b.p.moveCredit = Math.max(b.p.moveCredit || 0, 1);
        rm.handleInputBatch(room, b.p, { e: b.p.moveEpoch, cmds }, virtualNow());
      }
    }
  };

  // First command of an epoch defines the sequence start for bots (cmdFresh), no extra work needed.

  // ---- frame loop
  const deliver = (events) => {
    for (const ev of events) deliverToClient(game, sfx, ev, ctx);
  };
  let tickAccum = 0;
  const frameStats = { frames: 0, animateMs: 0, animateAlloc: 0, animateMax: 0, calls: 0, callsMax: 0, tris: 0, trisMax: 0 };
  const info = () => game.renderer.info;
  let localBatches = [];
  game.callbacks.onInputBatch = (batch) => localBatches.push(batch);

  const serverMetrics = { ticks: 0, tickMsMax: 0, tickMs: 0 };
  const emitsByEvent = {};
  let measuring = false;

  const stepFrame = (firing) => {
    advanceClock(FRAME_MS);
    if (firing) {
      // endless magazines: the probe measures steady firing, not reload pauses
      game.ammoByWeapon[weapon] = cfg.magSize;
      game.reserveAmmoByWeapon[weapon] = cfg.reserveAmmo ?? cfg.magSize;
      game.attemptShoot();
    }
    // client frame (real animate(): physics + prediction + effect loop + render)
    const h0 = v8.getHeapStatistics().used_heap_size;
    const c0 = hr();
    game.animate(virtualNow());
    const dMs = hr() - c0;
    const dAlloc = v8.getHeapStatistics().used_heap_size - h0;
    if (measuring) {
      frameStats.frames++;
      frameStats.animateMs += dMs;
      frameStats.animateMax = Math.max(frameStats.animateMax, dMs);
      if (dAlloc > 0) frameStats.animateAlloc += dAlloc;
      if (realRenderer) {
        const ri = info().render;
        frameStats.calls += ri.calls;
        frameStats.callsMax = Math.max(frameStats.callsMax, ri.calls);
        frameStats.tris += ri.triangles;
        frameStats.trisMax = Math.max(frameStats.trisMax, ri.triangles);
      }
    }
    // network: client batches -> server
    if (localBatches.length) {
      for (const batch of localBatches) rm.handleInputBatch(room, local, batch, virtualNow());
      localBatches = [];
    }
    tickAccum += FRAME_MS;
    if (tickAccum >= TICK_MS) {
      tickAccum -= TICK_MS;
      if (firing) sendBotCommands(virtualNow());
      else bots.forEach((b) => { b.nextAt = virtualNow() + FIXED_DT * 1000; });
      for (const p of players) {
        if (p.alive) {
          p.hp = 10000;
          p.invulnerableUntil = 0;
          p.ammo = cfg.magSize;
          if (p.ammoByWeapon) p.ammoByWeapon[weapon] = cfg.magSize;
          if (p.reserveAmmoByWeapon) p.reserveAmmoByWeapon[weapon] = cfg.reserveAmmo ?? cfg.magSize;
        }
      }
      const startIdx = log.length;
      const c1 = hr();
      rm.tick();
      const tMs = hr() - c1;
      if (measuring) {
        serverMetrics.ticks++;
        serverMetrics.tickMs += tMs;
        serverMetrics.tickMsMax = Math.max(serverMetrics.tickMsMax, tMs);
      }
      tickEvents.push(...log.slice(startIdx));
    }
  };

  const tickEvents = [];
  const stepFull = (firing) => {
    stepFrame(firing);
    if (tickEvents.length) {
      const evs = tickEvents.splice(0);
      const mine = evs.filter((e) => e.to === roomCode || e.to === local.id);
      // stateUpdate first so remote rigs exist before shotFired handlers use them
      for (const e of mine) {
        if (e.event === 'stateUpdate') {
          ctx.measure('stateUpdateHandler', () => game.syncPlayersState(e.payload.players, e.payload.t));
        }
      }
      deliver(mine.filter((e) => e.event !== 'stateUpdate'));
    }
  };

  // ---- warm-up (not measured): shaders / pools / caches / JIT
  const warmFrames = Math.round((warmupSeconds * 1000) / FRAME_MS);
  for (let i = 0; i < warmFrames; i++) stepFull(true);
  // let the warm-up effects die out, then idle baseline
  for (let i = 0; i < 40; i++) stepFull(false);

  // ---- measured firefight
  if (typeof globalThis.gc === 'function') globalThis.gc();
  const logStart = log.length;
  for (const k of Object.keys(timers)) delete timers[k];
  for (const k of Object.keys(serverTimers)) delete serverTimers[k];
  ctx.remoteShots = 0;
  const audioStart = { total: audioCounts.total, byType: { ...audioCounts.byType } };
  const c0 = counterSnapshot(THREE);
  const gl0 = realRenderer ? { ...game.renderer.__fakeGL } : null;
  const programs0 = realRenderer ? info().programs.length : 0;
  const sceneStart = sceneStats(game.scene);
  let lightMin = Infinity;
  let lightMax = 0;
  let childrenMax = 0;
  measuring = true;
  const frames = Math.round((seconds * 1000) / FRAME_MS);
  for (let i = 0; i < frames; i++) {
    stepFull(true);
    const s = sceneStats(game.scene);
    lightMin = Math.min(lightMin, s.lights);
    lightMax = Math.max(lightMax, s.lights);
    childrenMax = Math.max(childrenMax, s.children);
  }
  measuring = false;
  const c1 = counterSnapshot(THREE);
  const gl1 = realRenderer ? { ...game.renderer.__fakeGL } : null;
  const sceneEnd = sceneStats(game.scene);
  const fireStats = { ...frameStats };

  // ---- idle baseline AFTER the firefight (same scene, decals kept, effects expired, nobody shooting)
  for (let i = 0; i < 60; i++) stepFull(false);
  Object.assign(frameStats, { frames: 0, animateMs: 0, animateAlloc: 0, animateMax: 0, calls: 0, callsMax: 0, tris: 0, trisMax: 0 });
  measuring = true;
  for (let i = 0; i < 120; i++) stepFull(false);
  measuring = false;
  const idleStats = { ...frameStats };

  // ---- derive
  const localShots = timers['game.predictFireCommand']?.calls || 0;
  const remoteShots = ctx.remoteShots;
  const totalShots = localShots + remoteShots;
  sizeLog(logStart);
  const emitted = log.slice(logStart);
  for (const e of emitted) {
    const m = (emitsByEvent[e.event] ||= { emits: 0, messages: 0, bytes: 0, wireBytes: 0, volatile: 0 });
    m.emits++;
    m.messages += e.fanout;
    m.bytes += e.bytes;
    m.wireBytes += e.bytes * e.fanout;
    if (e.volatile) m.volatile++;
  }
  const serverShots = serverTimers.processFireCommand?.calls || 0;
  const diff = counterDiff(c0, c1);
  const audioDiff = {
    total: audioCounts.total - audioStart.total,
    byType: Object.fromEntries(Object.entries(audioCounts.byType).map(([k, v]) => [k, v - (audioStart.byType[k] || 0)]))
  };
  const result = {
    config: { playerCount, weapon, tier, seconds },
    shots: { local: localShots, remote: remoteShots, total: totalShots, serverResolved: serverShots },
    construct: diff,
    constructPerShot: Object.fromEntries(Object.entries(diff).map(([k, v]) => [k, totalShots ? v / totalShots : 0])),
    audio: audioDiff,
    audioPerShot: remoteShots ? audioDiff.total / remoteShots : 0, // per REMOTE shot (local shot sounds are played by main.js, not driven here)
    gpuProxy: realRenderer
      ? {
          drawCallsPerFrame: fireStats.calls / Math.max(1, fireStats.frames),
          drawCallsMax: fireStats.callsMax,
          trianglesPerFrame: fireStats.tris / Math.max(1, fireStats.frames),
          idleDrawCallsPerFrame: idleStats.calls / Math.max(1, idleStats.frames),
          idleTrianglesPerFrame: idleStats.tris / Math.max(1, idleStats.frames),
          programsLinkedInWindow: gl1.programsLinked - gl0.programsLinked,
          programsTotal: info().programs.length,
          programsAddedInWindow: info().programs.length - programs0,
          buffersCreatedInWindow: gl1.buffersCreated - gl0.buffersCreated,
          buffersDeletedInWindow: gl1.buffersDeleted - gl0.buffersDeleted,
          bufferUploadsInWindow: gl1.bufferUploads - gl0.bufferUploads,
          glCallsPerFrame: (gl1.totalCalls - gl0.totalCalls) / Math.max(1, fireStats.frames),
          uniformCallsPerFrame: (gl1.uniformCalls - gl0.uniformCalls) / Math.max(1, fireStats.frames),
          geometriesAlive: info().memory.geometries,
          texturesAlive: info().memory.textures
        }
      : null,
    scene: { start: sceneStart, end: sceneEnd, lightMin, lightMax, childrenMax, childrenGrowth: sceneEnd.children - sceneStart.children },
    client: {
      animateMsPerFrame: fireStats.animateMs / Math.max(1, fireStats.frames),
      animateMsMax: fireStats.animateMax,
      animateAllocPerFrame: fireStats.animateAlloc / Math.max(1, fireStats.frames),
      idleAnimateMsPerFrame: idleStats.animateMs / Math.max(1, idleStats.frames),
      idleAnimateAllocPerFrame: idleStats.animateAlloc / Math.max(1, idleStats.frames),
      timers: Object.fromEntries(Object.entries(timers).map(([k, t]) => [k, { calls: t.calls, msPerCall: t.ms / Math.max(1, t.calls), allocPerCall: t.alloc / Math.max(1, t.calls) }]))
    },
    server: {
      ticks: serverMetrics.ticks,
      tickMsAvg: serverMetrics.tickMs / Math.max(1, serverMetrics.ticks),
      tickMsMax: serverMetrics.tickMsMax,
      resolveShotMs: serverTimers.resolveShot ? serverTimers.resolveShot.ms / Math.max(1, serverTimers.resolveShot.calls) : 0,
      processFireMs: serverTimers.processFireCommand ? serverTimers.processFireCommand.ms / Math.max(1, serverTimers.processFireCommand.calls) : 0,
      selfStatePerTickPerPlayerMax: 0,
      emitsByEvent,
      emitsPerShot: serverShots ? emitted.length / serverShots : 0,
      messagesPerShot: serverShots ? emitted.reduce((a, e) => a + e.fanout, 0) / serverShots : 0,
      bytesPerShot: serverShots ? emitted.reduce((a, e) => a + e.bytes * e.fanout, 0) / serverShots : 0,
      wireBytesPerSecond: emitted.reduce((a, e) => a + e.bytes * e.fanout, 0) / seconds
    },
    game,
    rm,
    room
  };
  // reliable (non-volatile) share of the traffic
  let reliableMsgs = 0;
  let volatileMsgs = 0;
  for (const e of emitted) {
    if (e.volatile) volatileMsgs += e.fanout;
    else reliableMsgs += e.fanout;
  }
  result.server.reliableMessagesPerSecond = reliableMsgs / seconds;
  result.server.volatileMessagesPerSecond = volatileMsgs / seconds;
  // selfState emits per tick per player
  const selfPerPlayer = new Map();
  for (const e of emitted) {
    if (e.event === 'selfState') selfPerPlayer.set(e.to, (selfPerPlayer.get(e.to) || 0) + 1);
  }
  result.server.selfStatePerSecondPerPlayerMax = Math.max(0, ...[...selfPerPlayer.values()].map((n) => n / seconds));
  return result;
}

export { realPerf };
