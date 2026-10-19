// Headless shot-cost report: drives the REAL Game3D + RoomManager through 2- and 12-player firefights and prints a table.
//   npm run perf:shots            (= node --expose-gc --min-semi-space-size=64 scripts/perf-shots.mjs)
//   node --expose-gc scripts/perf-shots.mjs --json     machine readable
// Environment variables: PERF_WEAPONS=rifle,shotgun,sniper  PERF_TIERS=low,medium,high  PERF_PLAYERS=2,12  PERF_SECONDS=4
// Numbers are CPU / allocation / count based: GPU time and shader compiles cannot be measured here (use ?perf=1 in a browser).

import { runFirefight } from '../tests/helpers/perf-probe.mjs';

const list = (name, def) => (process.env[name] ? process.env[name].split(',').map((s) => s.trim()) : def);
const weapons = list('PERF_WEAPONS', ['rifle', 'shotgun', 'sniper']);
const tiers = list('PERF_TIERS', ['low', 'medium', 'high']);
const playerCounts = list('PERF_PLAYERS', ['2', '12']).map(Number);
const baseSeconds = Number(process.env.PERF_SECONDS || 4);
// slow weapons need a longer window to get a comparable number of shots
const SECONDS_BY_WEAPON = { rifle: 1, shotgun: 2.5, sniper: 3 };
const asJson = process.argv.includes('--json');

const f1 = (n) => (Number.isFinite(n) ? n.toFixed(1) : '-');
const f2 = (n) => (Number.isFinite(n) ? n.toFixed(2) : '-');
const kb = (n) => (Number.isFinite(n) ? (n / 1024).toFixed(1) : '-');

const rows = [];
for (const playerCount of playerCounts) {
  for (const weapon of weapons) {
    for (const tier of tiers) {
      const seconds = baseSeconds * (SECONDS_BY_WEAPON[weapon] || 1);
      const r = await runFirefight({ playerCount, weapon, tier, seconds });
      const audio = await runFirefight({ playerCount, weapon, tier, seconds: Math.min(seconds, 3), audio: true });
      const gpu = await runFirefight({ playerCount, weapon, tier, seconds: Math.min(seconds, 3), realRenderer: true });
      const gp = gpu.gpuProxy;
      const c = r.constructPerShot;
      const t = r.client.timers;
      rows.push({
        players: playerCount,
        weapon,
        tier,
        shots: r.shots.total,
        serverShots: r.shots.serverResolved,
        geoPerShot: c.geometries,
        matPerShot: c.materials,
        objPerShot: c.objects,
        texPerShot: c.textures,
        disposePerShot: (r.construct.disposeGeometry + r.construct.disposeMaterial) / Math.max(1, r.shots.total),
        audioNodesPerShot: audio.audioPerShot,
        lights: r.scene.lightMax,
        lightsMin: r.scene.lightMin,
        pointLights: r.scene.end.pointLights,
        childrenGrowth: r.scene.childrenGrowth,
        childrenMax: r.scene.childrenMax,
        frameMs: r.client.animateMsPerFrame,
        frameMsMax: r.client.animateMsMax,
        idleFrameMs: r.client.idleAnimateMsPerFrame,
        frameAllocKB: r.client.animateAllocPerFrame / 1024,
        idleAllocKB: r.client.idleAnimateAllocPerFrame / 1024,
        predictMs: t['game.predictFireCommand']?.msPerCall,
        attemptMs: t['game.attemptShoot']?.msPerCall,
        tracerMs: t['game.spawnTracerEffect']?.msPerCall,
        tracerAllocKB: (t['game.spawnTracerEffect']?.allocPerCall || 0) / 1024,
        remoteShotMs: t.shotFiredHandler?.msPerCall,
        remoteShotAllocKB: (t.shotFiredHandler?.allocPerCall || 0) / 1024,
        tickMs: r.server.tickMsAvg,
        tickMsMax: r.server.tickMsMax,
        resolveMs: r.server.resolveShotMs,
        emitsPerShot: r.server.emitsPerShot,
        msgsPerShot: r.server.messagesPerShot,
        bytesPerShot: r.server.bytesPerShot,
        wireKBs: r.server.wireBytesPerSecond / 1024,
        reliablePerSec: r.server.reliableMessagesPerSecond,
        volatilePerSec: r.server.volatileMessagesPerSecond,
        selfStatePerSec: r.server.selfStatePerSecondPerPlayerMax,
        callsFire: gp.drawCallsPerFrame,
        callsIdle: gp.idleDrawCallsPerFrame,
        trisFire: gp.trianglesPerFrame,
        trisIdle: gp.idleTrianglesPerFrame,
        programsAdded: gp.programsAddedInWindow,
        programsTotal: gp.programsTotal,
        buffersCreated: gp.buffersCreatedInWindow,
        bufferUploads: gp.bufferUploadsInWindow,
        gpuShots: gpu.shots.total,
        realFrameMs: gpu.client.animateMsPerFrame,
        realIdleFrameMs: gpu.client.idleAnimateMsPerFrame,
        gpuLights: gpu.scene.lightMax,
        events: r.server.emitsByEvent
      });
      r.game.renderer?.dispose?.();
    }
  }
}

if (asJson) {
  console.log(JSON.stringify(rows, null, 2));
} else {
  const cols = [
    ['pl', (r) => r.players], ['weapon', (r) => r.weapon], ['tier', (r) => r.tier], ['shots', (r) => r.shots],
    ['geo/shot', (r) => f2(r.geoPerShot)], ['mat/shot', (r) => f2(r.matPerShot)], ['obj/shot', (r) => f2(r.objPerShot)],
    ['disp/shot', (r) => f2(r.disposePerShot)], ['audio/shot', (r) => f1(r.audioNodesPerShot)],
    ['lights', (r) => r.lights], ['kids+', (r) => r.childrenGrowth],
    ['calls fire', (r) => Math.round(r.callsFire)], ['calls idle', (r) => Math.round(r.callsIdle)],
    ['progs+', (r) => r.programsAdded], ['bufs+/shot', (r) => f2(r.buffersCreated / Math.max(1, r.gpuShots))],
    ['real fr ms', (r) => f2(r.realFrameMs)], ['real idle', (r) => f2(r.realIdleFrameMs)],
    ['frame ms', (r) => f2(r.frameMs)], ['idle ms', (r) => f2(r.idleFrameMs)], ['max ms', (r) => f2(r.frameMsMax)],
    ['KB/frame', (r) => f1(r.frameAllocKB)], ['idle KB', (r) => f1(r.idleAllocKB)],
    ['predict ms', (r) => f2(r.predictMs)], ['rshot ms', (r) => f2(r.remoteShotMs)], ['rshot KB', (r) => f1(r.remoteShotAllocKB)],
    ['tick ms', (r) => f2(r.tickMs)], ['tickmax', (r) => f2(r.tickMsMax)], ['resolve ms', (r) => f2(r.resolveMs)],
    ['emit/shot', (r) => f1(r.emitsPerShot)], ['msg/shot', (r) => f1(r.msgsPerShot)], ['B/shot', (r) => Math.round(r.bytesPerShot)],
    ['wire KB/s', (r) => f1(r.wireKBs)], ['rel/s', (r) => Math.round(r.reliablePerSec)], ['vol/s', (r) => Math.round(r.volatilePerSec)],
    ['self/s', (r) => f1(r.selfStatePerSec)]
  ];
  const widths = cols.map(([h, fn]) => Math.max(h.length, ...rows.map((r) => String(fn(r)).length)));
  const line = (cells) => cells.map((c, i) => String(c).padStart(widths[i])).join(' ');
  console.log(line(cols.map(([h]) => h)));
  for (const r of rows) console.log(line(cols.map(([, fn]) => fn(r))));
}
process.exit(0);
