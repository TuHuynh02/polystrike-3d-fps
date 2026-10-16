import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { register } from 'node:module';
import {
  MATCH_CONFIG,
  WEAPONS,
  PRIMARY_WEAPONS,
  SECONDARY_WEAPONS,
  MELEE_WEAPONS,
  DEFAULT_LOADOUT,
  MAPS,
  BASE_HIPFIRE_FOV,
  ADS_OPTIC_ZOOM_MULT,
  ADS_OPTIC_ZOOM_FOV,
  computeDistanceFalloff,
  getEffectiveFireRateMs,
  INTERP_DELAY_MS
} from '../shared/constants.js';
import {
  LAG_COMP_HISTORY_MS,
  LAG_COMP_MAX_REWIND_MS,
  KILL_ADRENALINE_HEAL,
  resolveShotRewindMs,
  recordPlayerSnapshot,
  getRewoundPlayerPosition,
  rewindRoomPlayersForShot,
  restoreRewoundPlayers
} from '../shared/lagCompensation.js';
import { RoomManager } from '../server/roomManager.js';
import { SoundEffects } from '../public/js/audio.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

import fs from 'node:fs';

const filesToCheck = [
  'shared/constants.js',
  'shared/config.js',
  'shared/weapons.js',
  'shared/maps.js',
  'shared/physics.js',
  'shared/movement.js',
  'shared/netcode.js',
  'shared/spread.js',
  'shared/lagCompensation.js',
  'server/index.js',
  'server/roomManager.js',
  'public/js/main.js',
  'public/js/game3d.js',
  'public/js/prediction.js',
  'public/js/snapshotBuffer.js',
  'public/js/minimap.js',
  'public/js/weaponModels.js',
  'public/js/humanoidRig.js',
  'public/js/arenaBuilder.js',
  'public/js/audio.js',
  'public/js/networkAdapter.js',
  'public/js/quality.js',
  'public/js/assets.js',
  'public/js/surfaceMaterials.js',
  'public/js/arenaProps.js',
  'public/js/weaponAssetOverrides.js'
];

console.log('🔍 [CI] Checking JavaScript syntax across all modules...');
for (const rel of filesToCheck) {
  execFileSync(process.execPath, ['--check', path.join(ROOT_DIR, rel)], { stdio: 'inherit' });
}

console.log('🔫 [CI] Verifying 3-Slot Weapon Arsenal, Faster Fire Rates, Zero Camera Shake, TTK & Falloff...');
assert.equal(PRIMARY_WEAPONS.length, 7, 'Should have 7 primary weapons (3 ARs, SMG, Shotgun, Sniper, LMG)');
assert.equal(SECONDARY_WEAPONS.length, 3, 'Should have 3 secondary weapons');
assert.equal(MELEE_WEAPONS.length, 1, 'Should have 1 melee knife weapon');
assert.ok(WEAPONS[DEFAULT_LOADOUT.primary], 'Default primary weapon must exist');
assert.ok(WEAPONS[DEFAULT_LOADOUT.secondary], 'Default secondary weapon must exist');
assert.ok(WEAPONS[DEFAULT_LOADOUT.melee]?.isMelee, 'Default melee weapon must have isMelee=true');

// Faster fire rate checks
assert.ok(WEAPONS.rifle.fireRateMs <= 90, 'Rifle fire rate should be fast (<= 90ms)');
assert.ok(WEAPONS.m4a1.fireRateMs <= 75, 'M4A1 fire rate should be fast (<= 75ms)');
assert.ok(WEAPONS.smg.fireRateMs <= 58, 'SMG fire rate should be fast (<= 58ms)');
assert.ok(WEAPONS.pistol.fireRateMs <= 140, 'Pistol fire rate should be fast (<= 140ms)');

// Verify Distance Damage Falloff: SMG must lose heavily to ARs at medium/long range (e.g. 36m)
const smgDmg36m = Math.round(WEAPONS.smg.damage * computeDistanceFalloff(WEAPONS.smg, 36));
const akDmg36m = Math.round(WEAPONS.rifle.damage * computeDistanceFalloff(WEAPONS.rifle, 36));
const m4Dmg36m = Math.round(WEAPONS.m4a1.damage * computeDistanceFalloff(WEAPONS.m4a1, 36));
const smgShots36m = Math.ceil(100 / smgDmg36m);
const akShots36m = Math.ceil(100 / akDmg36m);
const m4Shots36m = Math.ceil(100 / m4Dmg36m);
const smgTtk36m = (smgShots36m - 1) * WEAPONS.smg.fireRateMs;
const akTtk36m = (akShots36m - 1) * WEAPONS.rifle.fireRateMs;
const m4Ttk36m = (m4Shots36m - 1) * WEAPONS.m4a1.fireRateMs;
assert.ok(smgDmg36m <= 11, `SMG damage at 36m (${smgDmg36m}) must drop to <= 11 DMG`);
assert.ok(akTtk36m < smgTtk36m * 0.5, `AK TTK at 36m (${akTtk36m}ms) must be more than 2x faster than SMG (${smgTtk36m}ms)`);
assert.ok(m4Ttk36m < smgTtk36m * 0.65, `M4 TTK at 36m (${m4Ttk36m}ms) must be much faster than SMG (${smgTtk36m}ms)`);

// Zero camera recoil shake & heavy run-and-gun penalty checks
for (const [wId, wCfg] of Object.entries(WEAPONS)) {
  assert.equal(wCfg.recoilPitch, 0, `${wId} must have recoilPitch === 0 (zero camera shake)`);
  assert.equal(wCfg.recoilYaw, 0, `${wId} must have recoilYaw === 0 (zero camera shake)`);
  if (!wCfg.isMelee) {
    assert.ok(wCfg.crosshairKick > 0, `${wId} must define crosshairKick > 0 for crosshair-only recoil`);
    assert.ok(wCfg.moveSpread >= 0.055, `${wId} must enforce heavy moveSpread >= 0.055 when running`);
    assert.ok(wCfg.airSpread >= 0.09, `${wId} must enforce heavy airSpread >= 0.09 when airborne`);
  }
}

const indexHtml = fs.readFileSync(path.join(ROOT_DIR, 'public/index.html'), 'utf8');
assert.ok(indexHtml.includes('id="hud-minimap"'), 'HUD must include top-left #hud-minimap container');
assert.ok(indexHtml.includes('id="minimap-canvas"'), 'HUD must include #minimap-canvas');

console.log('🛡️ [CI] Verifying Deathmatch Spawn Optimization & 1.5s Spawn Protection...');
assert.equal(MATCH_CONFIG.SPAWN_PROTECTION_MS, 1500, 'Spawn protection must be 1500ms (1.5s)');
assert.ok(Object.keys(MAPS).length >= 4, 'Should have at least 4 maps');

// Functional check with mock IO
const emittedEvents = [];
const mockIo = {
  to() {
    return {
      emit(event, payload) {
        emittedEvents.push({ event, payload });
      }
    };
  }
};

const rm = new RoomManager(mockIo);
// Tests drive state explicitly; stop the real tick loop so the loop can't change state during an await.
clearInterval(rm.tickInterval);
const { room, player } = rm.addHumanPlayer({ id: 'socket_p1' }, {
  name: 'Tester1',
  weapon: 'm4a1',
  loadout: { primary: 'scar', secondary: 'deagle', melee: 'knife' },
  mapId: 'cyber_arena'
});

assert.ok(room.code, 'Room code should be created');
assert.equal(player.loadout.primary, 'scar', 'Initial primary loadout should be scar');
assert.equal(player.loadout.secondary, 'deagle', 'Initial secondary loadout should be deagle');
assert.equal(player.loadout.melee, 'knife', 'Initial melee loadout should be knife');
assert.ok(player.invulnerableUntil > Date.now(), 'Player should be invulnerable immediately after spawn');

// Verify non-overlapping spawn selection across multiple simultaneous spawns
const chosenSpawns = [];
for (let i = 0; i < 8; i++) {
  const sp = rm.pickSafeSpawnPoint(room, 'socket_p1');
  chosenSpawns.push(sp);
}
for (let i = 1; i < chosenSpawns.length; i++) {
  const prev = chosenSpawns[i - 1];
  const curr = chosenSpawns[i];
  const dist = Math.hypot(curr.x - prev.x, curr.z - prev.z);
  assert.ok(dist > 1.0, 'Consecutive spawns must not overlap on the exact same spot');
}

// Verify [B] Loadout update handler
const updatedLoadout = rm.handleUpdateLoadout(room, player, {
  primary: 'lmg',
  secondary: 'glock',
  melee: 'knife'
});
assert.equal(updatedLoadout.primary, 'lmg', 'Updated primary should be lmg');
assert.equal(updatedLoadout.secondary, 'glock', 'Updated secondary should be glock');

console.log('⏪ [CI] Verifying Server-Side Lag Compensation (Hitbox Rewind) & +25 HP Kill Adrenaline...');
assert.equal(LAG_COMP_HISTORY_MS, 350, 'Lag compensation history window should be 350ms');
assert.equal(LAG_COMP_MAX_REWIND_MS, 200, 'Lag compensation max rewind clamp should be 200ms');
assert.equal(KILL_ADRENALINE_HEAL, 25, 'Kill adrenaline heal should be +25 HP');
assert.equal(INTERP_DELAY_MS, 100, 'Snapshot interpolation delay should be 100ms');
assert.equal(resolveShotRewindMs({ id: 'ci', rttMs: 60 }, {}), 60 / 2 + INTERP_DELAY_MS, 'Rewind = rtt/2 + INTERP_DELAY_MS');
assert.ok(LAG_COMP_HISTORY_MS >= LAG_COMP_MAX_REWIND_MS + 40, 'Lag-comp history must cover the max rewind plus one tick');

const { player: player2 } = rm.addHumanPlayer({ id: 'socket_p2' }, {
  name: 'Target2',
  roomCode: room.code,
  mode: 'public',
  weapon: 'rifle'
});

// Clear spawn protection for combat verification
player.invulnerableUntil = 0;
player2.invulnerableUntil = 0;
player.x = 0;
player.y = 0;
player.z = 0;
player.yaw = 0;
player.pitch = 0;
player.weapon = 'sniper';
player.ammo = 5;
player.ammoByWeapon.sniper = 5;

const baseNow = Date.now();
player2.positionHistory = [];
// At t = baseNow - 200ms, player2 was at x = 0, z = -10 (crouching = true)
player2.x = 0;
player2.y = 0;
player2.z = -10;
player2.crouching = true;
player2.prone = false;
recordPlayerSnapshot(player2, baseNow - 200);

// At t = baseNow, player2 moved to x = 20, z = -10 (standing)
player2.x = 20;
player2.y = 0;
player2.z = -10;
player2.crouching = false;
player2.prone = false;
recordPlayerSnapshot(player2, baseNow);

// 1) Interpolate midpoint at baseNow - 100ms -> should be x = 10, z = -10
const midRewind = getRewoundPlayerPosition(player2, baseNow - 100, baseNow);
assert.ok(Math.abs(midRewind.x - 10) < 0.05, `Expected rewound x ~ 10 at -100ms, got ${midRewind.x}`);
assert.equal(midRewind.z, -10, 'Rewound z should remain -10');

// 2) Clamp check: requesting 400ms rewind (baseNow - 400) clamps to max LAG_COMP_MAX_REWIND_MS rewind
const clampedRewind = getRewoundPlayerPosition(player2, baseNow - 400, baseNow);
assert.equal(clampedRewind.timestamp, baseNow - LAG_COMP_MAX_REWIND_MS, 'Rewind timestamp must clamp at LAG_COMP_MAX_REWIND_MS');
assert.ok(Math.abs(clampedRewind.x - 0) < 0.05, 'Clamped rewind should stop at earliest snapshot x=0');

// 3) Verify rewindRoomPlayersForShot & restoreRewoundPlayers (including posture restoration)
const savedStates = rewindRoomPlayersForShot(room, player.id, 200, baseNow);
assert.ok(Math.abs(player2.x - 0) < 0.5, `player2.x should be rewound near 0 during shot check, got ${player2.x}`);
assert.equal(player2.crouching, true, 'player2.crouching should be rewound to true at -200ms');
restoreRewoundPlayers(savedStates);
assert.equal(player2.x, 20, 'restoreRewoundPlayers must immediately restore live player2.x = 20');
assert.equal(player2.crouching, false, 'restoreRewoundPlayers must immediately restore live player2.crouching = false');

// 4) Full RoomManager.handleShoot lag compensation + Kill Adrenaline (+25 HP capped at 100)
const shootNow = Date.now();
player.x = 0;
player.y = 0;
player.z = -16;
player2.positionHistory = [];
player2.x = 0;
player2.y = 0;
player2.z = -28;
player2.crouching = true;
recordPlayerSnapshot(player2, shootNow - 120);
// Live position moved far off-ray to x = 18 (standing)
player2.x = 18;
player2.y = 0;
player2.z = -28;
player2.crouching = false;
recordPlayerSnapshot(player2, shootNow);

player.hp = 40; // Wounded shooter (40 HP)
player.lastShotAt = 0;
player2.hp = 100;

// Un-rewound shot (rewindMs = 0) along -Z must miss because live player2 is at x = 18
rm.handleShoot(room, player, {
  weapon: 'sniper',
  origin: { x: 0, y: 1.5, z: -16 },
  dir: { x: 0, y: 0, z: -1 },
  targetId: player2.id,
  isHeadshot: true,
  rewindMs: 0
});
assert.equal(player2.hp, 100, 'Un-rewound shot (rewindMs=0) must miss target that moved to x=18');
assert.equal(player.hp, 40, 'Shooter HP must remain 40 when shot misses');

// Shooting straight along -Z with rewindMs = 120 should hit rewound player2 at (0, 0, -28), kill them with sniper (108 DMG),
// restore player2's live x = 18 & crouching = false, and heal shooter from 40 HP -> 65 HP (+25 HP Kill Adrenaline)!
player.lastShotAt = 0;
player.ammo = 5;
player.ammoByWeapon.sniper = 5;
// Server-authoritative rewind = rttMs/2 + 50ms interpolation allowance -> rttMs 140 rewinds 120ms
player.rttMs = 140;
emittedEvents.length = 0;

rm.handleShoot(room, player, {
  weapon: 'sniper',
  origin: { x: 0, y: 1.5, z: -16 },
  dir: { x: 0, y: 0, z: -1 },
  targetId: player2.id,
  isHeadshot: true,
  rewindMs: 120
});

assert.equal(player2.alive, false, 'Rewound target should be killed by lag-compensated sniper shot');
assert.equal(player2.x, 18, 'Target live position (x = 18) must be restored after lag-compensated shot');
assert.equal(player2.crouching, false, 'Target live posture (crouching = false) must be restored after lag-compensated shot');
assert.equal(player.hp, 65, 'Shooter should receive +25 HP Kill Adrenaline (40 -> 65 HP)');

const killEvt = emittedEvents.find((e) => e.event === 'killEvent')?.payload;
assert.ok(killEvt, 'killEvent must be emitted on kill');
assert.equal(killEvt.adrenalineHeal, 25, 'killEvent.adrenalineHeal should be 25');
assert.equal(killEvt.killerHp, 65, 'killEvent.killerHp should be 65');

// Verify Kill Adrenaline caps at MATCH_CONFIG.MAX_HP (100)
rm.respawnPlayer(room, player2);
player2.invulnerableUntil = 0;
player2.x = 0;
player2.y = 0;
player2.z = -26;
recordPlayerSnapshot(player2, Date.now());
player.hp = 90;
player.lastShotAt = 0;
player.ammo = 5;
player.ammoByWeapon.sniper = 5;
rm.handleShoot(room, player, {
  weapon: 'sniper',
  origin: { x: 0, y: 1.5, z: -16 },
  dir: { x: 0, y: 0, z: -1 },
  targetId: player2.id,
  isHeadshot: true,
  rewindMs: 0
});
assert.equal(player.hp, 100, 'Kill Adrenaline must cap shooter HP at MATCH_CONFIG.MAX_HP = 100');

console.log('💣 [CI] Verifying Frag Grenade Physics, Detonation & 3D Spatial Audio...');
assert.equal(typeof rm.handleThrowGrenade, 'function', 'RoomManager.handleThrowGrenade must be defined');
rm.respawnPlayer(room, player2);
assert.equal(player2.grenades, 1, 'Respawned player must have 1 Frag Grenade replenished');
player2.invulnerableUntil = 0;
player2.x = 0;
player2.y = 0;
player2.z = -18;
player2.hp = 90;
player.grenades = 1;
player.lastGrenadeAt = 0;
emittedEvents.length = 0;
const nade = rm.handleThrowGrenade(room, player, {
  origin: { x: 0, y: 1.5, z: -16 },
  dir: { x: 0, y: 0.1, z: -1 }
});
assert.ok(nade && nade.id, 'handleThrowGrenade should spawn a grenade entity');
assert.equal(player.grenades, 0, 'Throwing a grenade should consume 1 grenade');
const thrownEvt = emittedEvents.find((e) => e.event === 'grenadeThrown')?.payload;
assert.ok(thrownEvt && thrownEvt.id === nade.id && thrownEvt.grenade?.id === nade.id, 'grenadeThrown event must expose top-level id/coords and nested grenade object');
assert.equal(thrownEvt.grenades, 0, 'grenadeThrown event must report remaining grenades count (0)');
assert.equal(rm.handleThrowGrenade(room, player, { origin: { x: 0, y: 1.5, z: -16 }, dir: { x: 0, y: 0.1, z: -1 } }), null, 'Cannot throw a second grenade while grenades === 0');

// Point-blank throw against an obstacle wall (container at x=-22, z=-10, w=2.4 -> west face at x=-23.2)
player.grenades = 1;
player.lastGrenadeAt = 0;
player.x = -23.45;
player.y = 0;
player.z = -10;
const wallNade = rm.handleThrowGrenade(room, player, {
  origin: { x: -23.45, y: 1.5, z: -10 },
  dir: { x: 1, y: 0, z: 0 }
});
assert.ok(wallNade.x <= -23.2, `Point-blank throw must not spawn inside obstacle (got x=${wallNade.x})`);
rm.updateGrenades(room, 0.04, Date.now());
assert.ok(wallNade.x <= -23.2 && wallNade.vx < 0, `Grenade thrown into obstacle face must bounce back (x=${wallNade.x}, vx=${wallNade.vx})`);
rm.detonateGrenade(room, wallNade, Date.now());
assert.ok(!room.grenades.includes(wallNade), 'detonateGrenade must remove detonated grenade from room.grenades');

rm.updateGrenades(room, 0.5, Date.now());
if (room.grenades.length > 0) {
  // Verify solid obstacle blocks grenade AOE blast (container at x = -22, z = -10)
  player2.x = -25;
  player2.y = 0;
  player2.z = -10;
  player2.hp = 100;
  room.grenades[0].x = -19;
  room.grenades[0].y = 0.2;
  room.grenades[0].z = -10;
  rm.detonateGrenade(room, room.grenades[0], Date.now());
  assert.equal(player2.hp, 100, 'Solid obstacle between grenade and target must block AOE splash damage via hasLineOfSight');
  assert.equal(room.grenades.length, 0, 'detonateGrenade must remove grenade from room.grenades');

  // Verify linear falloff at midpoint (~4.85m distance -> ~48 DMG) in unobstructed lane at z = -16
  player2.x = 4.85;
  player2.y = 0;
  player2.z = -16;
  player2.hp = 100;
  const gMid = { id: 'nade_mid_test', ownerId: player.id, ownerName: player.name, x: 0, y: 0.9, z: -16 };
  room.grenades.push(gMid);
  rm.detonateGrenade(room, gMid, Date.now());
  assert.ok(player2.hp >= 50 && player2.hp <= 55, `Expected ~48 falloff damage at 4.85m (HP 52), got HP=${player2.hp}`);

  // Verify core AOE splash damage (95 damage within 2.2m) & kill attribution
  player2.x = 0;
  player2.y = 0;
  player2.z = -18;
  player2.hp = 90;
  const gCore = { id: 'nade_core_test', ownerId: player.id, ownerName: player.name, x: 0, y: 0.2, z: -16.5 };
  room.grenades.push(gCore);
  emittedEvents.length = 0;
  rm.detonateGrenade(room, gCore, Date.now());
  assert.equal(player2.alive, false, 'Grenade detonation within 2.2m core radius (95 DMG) should kill 90 HP target');
  const nadeKillEvt = emittedEvents.find((e) => e.event === 'killEvent')?.payload;
  assert.equal(nadeKillEvt?.weapon, 'grenade', 'Grenade killEvent must report weapon === "grenade"');
  assert.equal(nadeKillEvt?.weaponName, 'FRAG GRENADE', 'Grenade killEvent must report weaponName === "FRAG GRENADE"');
}

const audioEngine = new SoundEffects();
assert.equal(typeof audioEngine.computeSpatialParams, 'function', 'SoundEffects.computeSpatialParams must be defined');
assert.equal(typeof audioEngine.playSpatialFootstep, 'function', 'SoundEffects.playSpatialFootstep must be defined');
assert.equal(typeof audioEngine.playSpatialGunshot, 'function', 'SoundEffects.playSpatialGunshot must be defined');
assert.equal(typeof audioEngine.playHeadshotDink, 'function', 'SoundEffects.playHeadshotDink must be defined');
assert.equal(typeof audioEngine.playGrenadeBounce, 'function', 'SoundEffects.playGrenadeBounce must be defined');
assert.equal(typeof audioEngine.playGrenadeExplosion, 'function', 'SoundEffects.playGrenadeExplosion must be defined');
assert.equal(typeof audioEngine.playMultiKillTone, 'function', 'SoundEffects.playMultiKillTone must be defined');

const listener = { x: 0, y: 0, z: 0, yaw: 0 }; // Facing -Z, right is +X, left is -X
const leftSource = audioEngine.computeSpatialParams(listener, { x: -8, y: 0, z: 0 }, 24);
const rightSource = audioEngine.computeSpatialParams(listener, { x: 8, y: 0, z: 0 }, 24);
const farSource = audioEngine.computeSpatialParams(listener, { x: 0, y: 0, z: -40 }, 24);
assert.ok(leftSource.pan < -0.5, `Source to left should pan negative, got ${leftSource.pan}`);
assert.ok(rightSource.pan > 0.5, `Source to right should pan positive, got ${rightSource.pan}`);
assert.equal(farSource.outOfRange, true, 'Source beyond maxDistance should be marked outOfRange');

console.log('📦 [CI] Verifying Compact / Quantized 30Hz Network Serialization (serializePlayers & serializeGrenades)...');
player.alive = true;
player.lastMoveAt = Date.now();
player.x = 12.3456;
player.y = 1.239;
player.z = -8.7654;
player.vx = 4.567;
player.vy = -1.234;
player.vz = 7.891;
player.yaw = 1.23456;
player.pitch = -0.56789;
player.lean = 0.789;

const serializedPlayers = rm.serializePlayers(room);
assert.equal(serializedPlayers.length, room.players.size, 'serializePlayers must return pre-sized array matching room.players.size');
const sp1 = serializedPlayers.find((p) => p.id === player.id);
assert.ok(sp1, 'Serialized players must include player 1');
assert.equal(sp1.x, 12.35, 'Position x must be rounded to 2 decimal places');
assert.equal(sp1.y, 1.24, 'Position y must be rounded to 2 decimal places');
assert.equal(sp1.z, -8.77, 'Position z must be rounded to 2 decimal places');
assert.equal(sp1.vx, 4.6, 'Velocity vx must be rounded to 1 decimal place');
assert.equal(sp1.vy, -1.2, 'Velocity vy must be rounded to 1 decimal place');
assert.equal(sp1.vz, 7.9, 'Velocity vz must be rounded to 1 decimal place');
assert.equal(sp1.yaw, 1.23, 'Angle yaw must be rounded to 2 decimal places');
assert.equal(sp1.pitch, -0.57, 'Angle pitch must be rounded to 2 decimal places');
assert.equal(sp1.lean, 0.79, 'Lean must be rounded to 2 decimal places');
assert.ok(player._staticMeta && player._staticMeta.id === player.id, 'Static player metadata must be cached on player entity');

room.grenades = [{
  id: 'nade_quant_test',
  ownerId: player.id,
  ownerName: player.name,
  x: 3.141592653589793,
  y: 1.618033988749895,
  z: -9.876543210987654,
  vx: 11.22334455667788,
  vy: -4.5566778899,
  vz: 0.1299999999,
  createdAt: Date.now(),
  explodeAt: Date.now() + 2000,
  fuseRemaining: 1.87654321
}];
const serializedGrenades = rm.serializeGrenades(room);
assert.equal(serializedGrenades.length, 1, 'serializeGrenades must return 1 active grenade');
assert.deepEqual(
  Object.keys(serializedGrenades[0]).sort(),
  ['fuseRemaining', 'id', 'ownerId', 'vx', 'vy', 'vz', 'x', 'y', 'z'],
  'Serialized grenade snapshot must only include compact quantized fields'
);
assert.equal(serializedGrenades[0].x, 3.14, 'Grenade x must be rounded to 2 decimal places');
assert.equal(serializedGrenades[0].y, 1.62, 'Grenade y must be rounded to 2 decimal places');
assert.equal(serializedGrenades[0].z, -9.88, 'Grenade z must be rounded to 2 decimal places');
assert.equal(serializedGrenades[0].vx, 11.22, 'Grenade vx must be rounded to 2 decimal places');
assert.equal(serializedGrenades[0].vy, -4.56, 'Grenade vy must be rounded to 2 decimal places');
assert.equal(serializedGrenades[0].vz, 0.13, 'Grenade vz must be rounded to 2 decimal places');
assert.equal(serializedGrenades[0].fuseRemaining, 1.88, 'Grenade fuseRemaining must be rounded to 2 decimal places');
room.grenades = [{
  id: 'nade_nonfinite_test',
  ownerId: player.id,
  x: NaN,
  y: Infinity,
  z: -0.0001,
  vx: undefined,
  vy: -Infinity,
  vz: null,
  fuseRemaining: NaN
}];
const nonFiniteNade = rm.serializeGrenades(room)[0];
assert.equal(nonFiniteNade.x, 0, 'Non-finite grenade x (NaN) must sanitize to 0');
assert.equal(nonFiniteNade.y, 0, 'Non-finite grenade y (Infinity) must sanitize to 0');
assert.ok(Object.is(nonFiniteNade.z, 0), 'Negative zero grenade z must normalize to +0');
assert.equal(nonFiniteNade.vx, 0, 'Undefined grenade vx must sanitize to 0');
assert.equal(nonFiniteNade.vy, 0, 'Non-finite grenade vy (-Infinity) must sanitize to 0');
assert.equal(nonFiniteNade.fuseRemaining, 0, 'NaN grenade fuseRemaining must sanitize to 0');
room.grenades = [];

player.x = Infinity;
player.vx = -Infinity;
player.yaw = NaN;
player.reserveAmmo = NaN;
player.grenades = NaN;
const nonFinitePlayer = rm.serializePlayers(room).find((p) => p.id === player.id);
assert.equal(nonFinitePlayer.x, 0, 'Non-finite player x (Infinity) must sanitize to 0');
assert.equal(nonFinitePlayer.vx, 0, 'Non-finite player vx (-Infinity) must sanitize to 0');
assert.equal(nonFinitePlayer.yaw, 0, 'Non-finite player yaw (NaN) must sanitize to 0');
assert.equal(nonFinitePlayer.reserveAmmo, 0, 'NaN player reserveAmmo must sanitize to 0');
assert.equal(nonFinitePlayer.grenades, 1, 'NaN player grenades must fallback to 1');
player.x = 12.3456;
player.vx = 4.567;
player.yaw = 1.23456;
player.reserveAmmo = 90;
player.grenades = 1;

const benchStart = performance.now();
for (let i = 0; i < 1000; i++) {
  rm.serializePlayers(room);
}
const benchElapsedMs = performance.now() - benchStart;
assert.ok(benchElapsedMs < 150, `1000x serializePlayers must remain fast (<150ms, took ${benchElapsedMs.toFixed(2)}ms)`);

console.log('🔭 [CI] Verifying Holo & Red-Dot 1.25x (+0.25x) ADS Scope Zoom, 3D Sight Center Alignment & Slower ADS Fire Rate...');
// Browser modules import '../vendor/three/three.module.js' (served by Express at /vendor/three);
// map it to node_modules/three and '../shared/*' to the repo's shared folder for Node.
register(
  'data:text/javascript,' + encodeURIComponent(`
    export async function resolve(specifier, context, nextResolve) {
      if (specifier === '../vendor/three/three.module.js') {
        return nextResolve(new URL('node_modules/three/build/three.module.js', ${JSON.stringify(pathToFileURL(ROOT_DIR + '/').href)}).href, context);
      }
      if (context.parentURL && context.parentURL.includes('/public/js/') && specifier.startsWith('../shared/')) {
        return nextResolve(new URL(specifier.slice(3), ${JSON.stringify(pathToFileURL(ROOT_DIR + '/').href)}).href, context);
      }
      return nextResolve(specifier, context);
    }
  `)
);
const THREE = await import('three');
const { createWeaponMesh, setWeaponAdsCulling } = await import('../public/js/weaponModels.js');

assert.equal(BASE_HIPFIRE_FOV, 68, 'Base hipfire FOV must be 68');
assert.equal(ADS_OPTIC_ZOOM_MULT, 1.25, 'Holo and Red-Dot ADS zoom multiplier must be 1.25x (+0.25x)');
assert.equal(ADS_OPTIC_ZOOM_FOV, 54.4, 'Holo and Red-Dot ADS zoom FOV must be 54.4 (68 / 1.25)');
assert.ok(indexHtml.includes('id="optic-scope"'), 'HUD must include #optic-scope overlay for Holo and Red-Dot sights');
assert.ok(indexHtml.includes('id="optic-telemetry"'), 'HUD must include #optic-telemetry label');

const opticWeapons = ['rifle', 'm4a1', 'scar', 'smg', 'shotgun', 'lmg', 'pistol', 'deagle', 'glock'];
const sightRaycaster = new THREE.Raycaster(
  new THREE.Vector3(0, 0, 0),
  new THREE.Vector3(0, 0, -1),
  0,
  2.0
);
for (const wId of opticWeapons) {
  const wCfg = WEAPONS[wId];
  assert.equal(wCfg.zoomMult, 1.25, `${wId} must have zoomMult === 1.25 (+0.25x ADS zoom)`);
  assert.equal(wCfg.zoomFov, 54.4, `${wId} must have zoomFov === 54.4 (68 / 1.25)`);
  assert.ok(
    wCfg.opticType === 'holo' || wCfg.opticType === 'reddot',
    `${wId} must specify opticType as 'holo' or 'reddot'`
  );
  const hipMs = getEffectiveFireRateMs(wCfg, false);
  const adsMs = getEffectiveFireRateMs(wCfg, true);
  assert.equal(hipMs, wCfg.fireRateMs, `${wId} hipfire rate must match fireRateMs`);
  assert.ok(adsMs > hipMs, `${wId} ADS fire rate (${adsMs}ms) must be slower than hipfire (${hipMs}ms)`);
  assert.ok(
    adsMs >= Math.round(hipMs * 1.1) && adsMs <= Math.round(hipMs * 1.2),
    `${wId} ADS fire rate (${adsMs}ms) must be ~10%-15% slower than hipfire (${hipMs}ms)`
  );

  const vm = createWeaponMesh(wId, true);
  assert.ok(vm.userData.opticCenter, `${wId} first-person viewmodel must expose userData.opticCenter`);
  assert.ok(vm.userData.adsPosition, `${wId} first-person viewmodel must expose userData.adsPosition`);
  assert.ok(vm.userData.opticLens, `${wId} first-person viewmodel must expose userData.opticLens`);
  assert.ok(vm.userData.opticReticle, `${wId} first-person viewmodel must expose userData.opticReticle`);
  assert.ok(Array.isArray(vm.userData.adsCulledMeshes) && vm.userData.adsCulledMeshes.length > 0, `${wId} viewmodel must expose adsCulledMeshes for through-scope ADS culling`);
  assert.equal(vm.userData.adsPosition.x, 0, `${wId} ADS viewmodel X must align to screen center 0`);
  assert.ok(
    Math.abs(vm.userData.adsPosition.y + vm.userData.opticCenter.y * 1.14) < 0.001,
    `${wId} ADS viewmodel Y (${vm.userData.adsPosition.y}) must center opticCenter.y (${vm.userData.opticCenter.y}) at camera Y=0`
  );
  if (wCfg.slot === 2) {
    assert.equal(
      vm.userData.opticGroup?.parent,
      vm.userData.boltMesh,
      `${wId} RMR optic must be parented to slide boltMesh so it moves with slide blowback`
    );
  }

  // Verify True 3D Through-Scope ADS culling hides rear/body meshes while keeping 3D optic & reticle visible
  setWeaponAdsCulling(vm, true);
  assert.equal(vm.userData.isAdsCulled, true, `${wId} ADS culling state must activate`);
  assert.equal(vm.userData.opticLens.visible, true, `${wId} 3D optic lens must stay visible during ADS culling`);
  assert.equal(vm.userData.opticReticle.visible, true, `${wId} 3D optic reticle must stay visible during ADS culling`);

  // Verify unobstructed 3D sightline from camera (0, 0, 0) along (0, 0, -1) through optic lens
  if (vm.userData.opticReticle) {
    vm.userData.opticReticle.visible = false;
  }
  if (vm.userData.flashMesh) {
    vm.userData.flashMesh.scale.set(0.4, 0.4, 0.4);
  }
  const rig = new THREE.Group();
  rig.position.set(
    vm.userData.adsPosition.x,
    vm.userData.adsPosition.y,
    vm.userData.adsPosition.z
  );
  rig.add(vm);
  rig.updateMatrixWorld(true);

  const hits = sightRaycaster.intersectObjects(rig.children, true);
  const hitLens = hits.some((h) => h.object.userData?.isOpticLens);
  const opaqueBlockers = hits.filter(
    (h) =>
      !h.object.userData?.isOpticLens &&
      !h.object.userData?.isOpticReticle &&
      (!h.object.material?.transparent || h.object.material.opacity > 0.5)
  );
  assert.ok(hitLens, `${wId} center sightline ray (0,0,0)->(0,0,-1) must pass through the 3D optic lens`);
  assert.equal(
    opaqueBlockers.length,
    0,
    `${wId} center sightline ray (0,0,0)->(0,0,-1) must have 0 opaque mesh obstructions (found ${opaqueBlockers.length})`
  );
  setWeaponAdsCulling(vm, false);
  assert.equal(vm.userData.isAdsCulled, false, `${wId} ADS culling state must restore when exiting ADS`);
}

// Verify server-side ADS fire rate enforcement & state reset in RoomManager
player.weapon = 'rifle';
player.ammo = 30;
player.ammoByWeapon.rifle = 30;
player.isAiming = false;
player.lastShotAt = Date.now() - Math.floor(WEAPONS.rifle.fireRateMs * 0.84);
rm.handleShoot(room, player, {
  weapon: 'rifle',
  isAiming: true,
  origin: { x: 0, y: 1.6, z: 0 },
  dir: { x: 0, y: 0, z: -1 },
  hits: []
});
assert.equal(
  player.ammo,
  30,
  'Server handleShoot must reject ADS shot fired faster than adsFireRateMs * 0.82 even if it exceeds hipfire interval'
);

rm.handlePlayerMove(room, player, {
  seq: 99,
  x: player.x,
  y: player.y,
  z: player.z,
  yaw: 0,
  pitch: 0,
  isAiming: true,
  weapon: 'rifle'
});
assert.equal(player.isAiming, true, 'handlePlayerMove must update player.isAiming = true');
player.ammo = 15;
player.ammoByWeapon.rifle = 15;
rm.handleReload(room, player, 'rifle');
assert.equal(player.isAiming, false, 'handleReload must reset player.isAiming = false');

rm.removePlayer('socket_p2');
rm.removePlayer('socket_p1');
if (rm.tickInterval) clearInterval(rm.tickInterval);

console.log('✅ [CI] All syntax & gameplay checks passed!');
process.exit(0);

