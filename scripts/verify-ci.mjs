import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  MATCH_CONFIG,
  WEAPONS,
  PRIMARY_WEAPONS,
  SECONDARY_WEAPONS,
  MELEE_WEAPONS,
  DEFAULT_LOADOUT,
  MAPS,
  computeDistanceFalloff
} from '../shared/constants.js';
import {
  LAG_COMP_HISTORY_MS,
  LAG_COMP_MAX_REWIND_MS,
  KILL_ADRENALINE_HEAL,
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
  'shared/lagCompensation.js',
  'server/index.js',
  'server/roomManager.js',
  'server/botAI.js',
  'public/js/main.js',
  'public/js/game3d.js',
  'public/js/minimap.js',
  'public/js/weaponModels.js',
  'public/js/humanoidRig.js',
  'public/js/arenaBuilder.js',
  'public/js/audio.js',
  'public/js/networkAdapter.js',
  'scripts/build-pages.mjs'
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
const { room, player } = rm.addHumanPlayer({ id: 'socket_p1' }, {
  name: 'Tester1',
  botCount: 4,
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
assert.equal(LAG_COMP_MAX_REWIND_MS, 250, 'Lag compensation max rewind clamp should be 250ms');
assert.equal(KILL_ADRENALINE_HEAL, 25, 'Kill adrenaline heal should be +25 HP');

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

// 2) Clamp check: requesting 400ms rewind (baseNow - 400) clamps to max 250ms rewind
const clampedRewind = getRewoundPlayerPosition(player2, baseNow - 400, baseNow);
assert.equal(clampedRewind.timestamp, baseNow - 250, 'Rewind timestamp must clamp at max 250ms');
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
for (const p of room.players.values()) {
  if (p.isBot) {
    assert.equal(p.grenades, 1, 'Bot entities must initialize with 1 Frag Grenade');
  }
}
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

rm.removePlayer('socket_p2');
rm.removePlayer('socket_p1');
if (rm.tickInterval) clearInterval(rm.tickInterval);

console.log('✅ [CI] All syntax & gameplay checks passed!');
process.exit(0);

