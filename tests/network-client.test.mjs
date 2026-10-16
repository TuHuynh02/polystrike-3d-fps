/**
 * Regression: the Socket.IO wrapper in public/js/networkAdapter.js must really send `inputBatch`.
 * The old wrapper called `rawSocket.volatile.emit(...)`; `volatile` returns the same socket, so the wrapper re-entered
 * itself until the stack overflowed and movement-only batches were never sent (only batches carrying a shot got through,
 * which made the server move the player from a stale position -> "teleport back when shooting and moving").
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// Installs the ESM hooks needed to load public/js/*.js in Node (must come before the dynamic import below)
import './helpers/headless-game3d.mjs';

const { createNetworkClient } = await import('../public/js/networkAdapter.js');
const { BTN } = await import('../shared/netcode.js');

// createNetworkClient starts a 4-minute keep-alive timer; never let it hold the test process open
const realSetInterval = globalThis.setInterval;
globalThis.setInterval = (...args) => {
  const t = realSetInterval(...args);
  t.unref?.();
  return t;
};
globalThis.fetch = globalThis.fetch || (async () => ({ ok: true, json: async () => ({ rooms: [] }) }));

/** Minimal stand-in for a socket.io-client Socket: `volatile` sets a flag and returns the SAME object, like the real one. */
function makeFakeIo() {
  const sent = [];
  const socket = {
    flags: {},
    get volatile() {
      this.flags.volatile = true;
      return this;
    },
    emit(event, payload) {
      sent.push({ event, payload, volatile: Boolean(this.flags.volatile) });
      this.flags = {};
      return this;
    }
  };
  const io = () => socket;
  return { io, socket, sent };
}

describe('networkAdapter: inputBatch emit wrapper', () => {
  it('sends movement-only batches as volatile exactly once (no re-entrancy)', async () => {
    const fake = makeFakeIo();
    globalThis.window = { io: fake.io, location: { search: '' } };
    const client = await createNetworkClient();
    const batch = { e: 1, cmds: [{ seq: 1, btn: 0 }, { seq: 2, btn: 0 }] };
    client.socket.emit('inputBatch', batch);
    assert.equal(fake.sent.length, 1);
    assert.equal(fake.sent[0].event, 'inputBatch');
    assert.equal(fake.sent[0].volatile, true);
    assert.deepEqual(fake.sent[0].payload, batch);
  });

  it('sends batches that carry a shot reliably (not volatile)', async () => {
    const fake = makeFakeIo();
    globalThis.window = { io: fake.io, location: { search: '' } };
    const client = await createNetworkClient();
    client.socket.emit('inputBatch', { e: 1, cmds: [{ seq: 1, btn: BTN.FIRE, ss: 1 }] });
    assert.equal(fake.sent.length, 1);
    assert.equal(fake.sent[0].volatile, false);
  });

  it('does not leak the volatile flag into the next, unrelated event', async () => {
    const fake = makeFakeIo();
    globalThis.window = { io: fake.io, location: { search: '' } };
    const client = await createNetworkClient();
    client.socket.emit('inputBatch', { e: 1, cmds: [{ seq: 1, btn: 0 }] });
    client.socket.emit('reload', { weapon: 'rifle' });
    assert.equal(fake.sent[1].event, 'reload');
    assert.equal(fake.sent[1].volatile, false);
  });
});
