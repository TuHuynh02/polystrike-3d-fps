// Hot/cold split of the per-player entries inside `stateUpdate`.
//
// Hot fields (position, velocity, aim, stance, weapon, hp, alive) change every tick and are sent in every snapshot.
// Cold fields (name, colour, team, ready, ammo, boosts, kills, ...) almost never change, so the server only includes them
//   - for ~COLD_REPEAT_MS after one of them changed (several repeats, because `stateUpdate` is a volatile event that may be
//     dropped), and
//   - in a full refresh snapshot about once per second (resync after any loss, covers late joiners).
// A full entry (as in `roomJoined`, lobby events) simply carries the cold fields too. PlayerStateCache rebuilds complete
// player objects on the client, so every consumer of `latestPlayers` keeps seeing full objects.

/** Cold fields every cold block carries. */
export const COLD_KEYS = ['name', 'color', 'team', 'ready', 'ammo', 'reserveAmmo', 'grenades', 'invulnerable', 'invulnerableUntil', 'kills', 'deaths', 'streak'];
/** Cold fields that are only present while they apply; a cold block without them means "none" (the cached value is dropped). */
export const COLD_OPTIONAL_KEYS = ['armor', 'speedBoostMs', 'damageBoostMs', 'ping'];

export const COLD_REPEAT_MS = 400;
export const COLD_REFRESH_MS = 1000;

/** True when the entry carries the cold block (`kills` is always part of it). */
export function isColdEntry(entry) {
  return entry !== null && typeof entry === 'object' && typeof entry.kills === 'number';
}

/**
 * Client side: merges (possibly hot-only) snapshot entries into complete player objects.
 * The returned array is a new array of cached objects that are updated in place; ids missing from the snapshot are dropped.
 */
export class PlayerStateCache {
  constructor() {
    this.byId = new Map();
    this._seen = new Map();
    this._tick = 0;
  }

  clear() {
    this.byId.clear();
    this._seen.clear();
  }

  merge(entries) {
    if (!Array.isArray(entries)) return [];
    const tick = ++this._tick;
    const out = new Array(entries.length);
    let n = 0;
    for (let i = 0; i < entries.length; i++) {
      const e = entries[i];
      if (!e || typeof e.id !== 'string') continue;
      let cached = this.byId.get(e.id);
      if (!cached) {
        cached = {};
        this.byId.set(e.id, cached);
      }
      if (isColdEntry(e)) {
        let needsRebuild = false;
        for (let k = 0; k < COLD_OPTIONAL_KEYS.length; k++) {
          const key = COLD_OPTIONAL_KEYS[k];
          if (!(key in e) && key in cached) {
            needsRebuild = true;
            break;
          }
        }
        if (needsRebuild) {
          const next = {};
          const keys = Object.keys(cached);
          for (let j = 0; j < keys.length; j++) {
            const kName = keys[j];
            if (COLD_OPTIONAL_KEYS.includes(kName) && !(kName in e)) continue;
            next[kName] = cached[kName];
          }
          cached = next;
          this.byId.set(e.id, cached);
        }
      }
      Object.assign(cached, e);
      this._seen.set(e.id, tick);
      out[n++] = cached;
    }
    out.length = n;
    if (this.byId.size > n) {
      for (const id of this.byId.keys()) {
        if (this._seen.get(id) !== tick) {
          this.byId.delete(id);
          this._seen.delete(id);
        }
      }
    }
    return out;
  }
}
