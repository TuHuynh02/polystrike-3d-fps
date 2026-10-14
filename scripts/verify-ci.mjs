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
  MAPS
} from '../shared/constants.js';
import { RoomManager } from '../server/roomManager.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

const filesToCheck = [
  'shared/constants.js',
  'server/index.js',
  'server/roomManager.js',
  'server/botAI.js',
  'public/js/main.js',
  'public/js/game3d.js',
  'public/js/audio.js',
  'public/js/networkAdapter.js',
  'scripts/build-pages.mjs'
];

console.log('🔍 [CI] Checking JavaScript syntax across all modules...');
for (const rel of filesToCheck) {
  execFileSync(process.execPath, ['--check', path.join(ROOT_DIR, rel)], { stdio: 'inherit' });
}

console.log('🔫 [CI] Verifying 3-Slot Weapon Arsenal & Loadout Config...');
assert.equal(PRIMARY_WEAPONS.length, 7, 'Should have 7 primary weapons (3 ARs, SMG, Shotgun, Sniper, LMG)');
assert.equal(SECONDARY_WEAPONS.length, 3, 'Should have 3 secondary weapons');
assert.equal(MELEE_WEAPONS.length, 1, 'Should have 1 melee knife weapon');
assert.ok(WEAPONS[DEFAULT_LOADOUT.primary], 'Default primary weapon must exist');
assert.ok(WEAPONS[DEFAULT_LOADOUT.secondary], 'Default secondary weapon must exist');
assert.ok(WEAPONS[DEFAULT_LOADOUT.melee]?.isMelee, 'Default melee weapon must have isMelee=true');

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

rm.removePlayer('socket_p1');
if (rm.tickInterval) clearInterval(rm.tickInterval);

console.log('✅ [CI] All syntax & gameplay checks passed!');
process.exit(0);
