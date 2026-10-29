/**
 * In-browser LAN host, protocol and server side (no WebRTC here: peers are in-memory links to the REAL game server).
 *
 *  1. lanProtocol: frame encode/decode, validation, size caps.
 *  2. LanHub + hostCore: the unchanged RoomManager / socket handlers serve LanClientSocket peers (join, broadcast, acks, volatile
 *     routing, disconnect cleanup, hostile input).
 */

import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import { CH_REL, CH_UNREL, MAX_FRAME_CHARS, decodeFrame, encodeAck, encodeEmit } from '../shared/lanProtocol.js';
import { BTN } from '../shared/netcode.js';
import { createLanHarness, waitForEvent } from './helpers/lan-harness.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

describe('lanProtocol frames', () => {
  it('round-trips emits (with and without ack) and acks', () => {
    assert.deepEqual(decodeFrame(encodeEmit('joinRoom', [{ name: 'A' }])), { kind: 'emit', event: 'joinRoom', args: [{ name: 'A' }], ackId: 0 });
    assert.deepEqual(decodeFrame(encodeEmit('pingCheck', [123], 7)), { kind: 'emit', event: 'pingCheck', args: [123], ackId: 7 });
    assert.deepEqual(decodeFrame(encodeAck(7, [123])), { kind: 'ack', ackId: 7, args: [123] });
  });

  it('rejects malformed, oversized and over-long frames without throwing', () => {
    for (const bad of [null, undefined, 42, '', 'not json', '[]', '{}', '{"e":"x"}', '{"e":"x","p":{}}', '{"e":"","p":[]}',
      JSON.stringify({ e: 'x'.repeat(65), p: [] }), JSON.stringify({ e: 'x', p: [1, 2, 3, 4, 5] }), JSON.stringify({ r: 0, p: [] }),
      JSON.stringify({ e: 'x', p: ['y'.repeat(MAX_FRAME_CHARS)] })]) {
      assert.equal(decodeFrame(bad), null, `rejects ${String(bad).slice(0, 30)}`);
    }
    assert.equal(decodeFrame('{"e":"x","p":[],"a":-3}').ackId, 0, 'bad ack ids are ignored, not trusted');
  });
});

describe('LAN host core (real RoomManager behind a LanHub)', () => {
  let harness;
  afterEach(() => harness?.stop());

  async function joinTwo() {
    harness = createLanHarness();
    const a = harness.addPeer('host');
    const b = harness.addPeer('guest1');
    const joinedA = waitForEvent(a, 'roomJoined');
    a.emit('joinRoom', { name: 'Hosty', mode: 'private', roomCode: 'LAN123', mapId: 'cyber_citadel' });
    const ra = await joinedA;
    const playerJoined = waitForEvent(a, 'playerJoined');
    const joinedB = waitForEvent(b, 'roomJoined');
    b.emit('joinRoom', { name: 'Guesty', mode: 'private', roomCode: 'LAN123' });
    const rb = await joinedB;
    return { a, b, ra, rb, playerJoined: await playerJoined };
  }

  it('two peers join the same room; the first is host; everyone is told', async () => {
    const { ra, rb, playerJoined } = await joinTwo();
    assert.equal(ra.roomCode, 'LAN123');
    assert.equal(rb.roomCode, 'LAN123');
    assert.equal(ra.hostId, 'host');
    assert.equal(rb.players.length, 2);
    assert.equal(playerJoined.name, 'Guesty');
    assert.ok(ra.net && ra.net.tickMs > 0, 'roomJoined carries NET_CONFIG');
  });

  it('streams stateUpdate on the unreliable channel and everything else reliably', async () => {
    const { b } = await joinTwo();
    const snap = await waitForEvent(b, 'stateUpdate', 2000);
    assert.equal(snap.players.length, 2);
    await sleep(60);
    const byEvent = (name) => harness.sent.filter((f) => f.text.startsWith(`{"e":"${ name }"`));
    assert.ok(byEvent('stateUpdate').length > 0);
    assert.ok(byEvent('stateUpdate').every((f) => f.channel === CH_UNREL), 'stateUpdate is volatile');
    assert.ok(byEvent('roomJoined').every((f) => f.channel === CH_REL), 'roomJoined is reliable');
  });

  it('acknowledgements work in both directions (pingCheck, server latencyProbe)', async () => {
    const { a } = await joinTwo();
    const echoed = await new Promise((resolve) => a.emit('pingCheck', 12345, resolve));
    assert.equal(echoed, 12345);
    const serverSocket = harness.core.hub.sockets.get('host');
    a.on('latencyProbe', (ts, ack) => ack(`pong:${ ts }`));
    const answer = await new Promise((resolve) => serverSocket.emit('latencyProbe', 99, resolve));
    assert.equal(answer, 'pong:99');
  });

  it('client picks the channel: shots reliably, plain input batches unreliably', async () => {
    const { a } = await joinTwo();
    const seen = [];
    const realSend = a._send;
    a.attach((channel, text) => { seen.push({ channel, text }); realSend(channel, text); });
    const idle = { seq: 1, btn: 0 };
    const shot = { seq: 2, btn: BTN.FIRE, ss: 1 };
    a.emit('inputBatch', { e: 0, cmds: [idle] });
    a.emit('inputBatch', { e: 0, cmds: [shot] });
    a.emit('reload', { weapon: 'rifle' });
    assert.deepEqual(seen.map((f) => f.channel), [CH_UNREL, CH_REL, CH_REL]);
  });

  it('a dropped peer is removed from the room; the last one leaving closes it', async () => {
    const { b } = await joinTwo();
    const room = harness.core.roomManager.rooms.get('LAN123');
    assert.equal(room.players.size, 2);
    b.dropLink();
    assert.equal(room.players.size, 1);
    assert.equal(harness.core.hub.sockets.has('guest1'), false);
    harness.addPeer('x'); // unrelated peer does not matter
  });

  it('ignores hostile frames and disconnects a flooding peer', async () => {
    harness = createLanHarness();
    const a = harness.addPeer('flood');
    for (const junk of ['not json', '{}', '{"e":"joinRoom","p":"oops"}', 'x'.repeat(MAX_FRAME_CHARS + 1)]) {
      harness.core.peerMessage('flood', junk);
    }
    assert.equal(harness.core.hub.sockets.has('flood'), true, 'junk alone does not kill the peer');
    for (let i = 0; i < 700; i++) a.emit('reload', { weapon: 'rifle' });
    await sleep(30);
    assert.equal(harness.core.hub.sockets.has('flood'), false, 'sustained flooding disconnects the socket (rate limiter)');
  });

  it('batches multi-peer room broadcasts via sendMany while using send for single-recipient emits', async () => {
    const { LanHub } = await import('../server/lan/hub.js');
    const singleCalls = [];
    const batchCalls = [];
    const hub = new LanHub({
      send: (peerId, channel, text) => singleCalls.push({ peerId, channel, text }),
      sendMany: (peerIds, channel, text) => batchCalls.push({ peerIds: [...peerIds], channel, text })
    });

    const s1 = hub.connect('p1');
    const s2 = hub.connect('p2');
    const s3 = hub.connect('p3');
    s1.join('ROOM1');

    // Only 1 member in ROOM1 -> uses send() without allocating a batch list
    hub.io.to('ROOM1').volatile.emit('stateUpdate', { t: 100 });
    assert.equal(singleCalls.length, 1);
    assert.equal(singleCalls[0].peerId, 'p1');
    assert.equal(batchCalls.length, 0);

    // 3 members in ROOM1 -> uses sendMany() once with all 3 peerIds
    s2.join('ROOM1');
    s3.join('ROOM1');
    hub.io.to('ROOM1').volatile.emit('stateUpdate', { t: 120 });
    assert.equal(batchCalls.length, 1);
    assert.deepEqual(batchCalls[0].peerIds, ['p1', 'p2', 'p3']);
    assert.equal(batchCalls[0].channel, CH_UNREL);

    // socket.to('ROOM1') excludes sender ('p1') and batches remaining 2 recipients ('p2', 'p3')
    s1.to('ROOM1').emit('playerDamaged', { victimId: 'p2', hp: 80 });
    assert.equal(batchCalls.length, 2);
    assert.deepEqual(batchCalls[1].peerIds, ['p2', 'p3']);
    assert.equal(batchCalls[1].channel, CH_REL);

    // Verify createHostCore forwards sendMany to its LanHub
    const { createHostCore } = await import('../server/lan/hostCore.js');
    const coreSingle = [];
    const coreBatch = [];
    const core = createHostCore({
      send: (peerId, channel, text) => coreSingle.push({ peerId, channel, text }),
      sendMany: (peerIds, channel, text) => coreBatch.push({ peerIds: [...peerIds], channel, text })
    });
    try {
      core.peerOpen('host');
      core.peerOpen('g1');
      core.peerMessage('host', encodeEmit('joinRoom', [{ name: 'H', mode: 'private', roomCode: 'LAN123', mapId: 'cyber_citadel' }]));
      core.peerMessage('g1', encodeEmit('joinRoom', [{ name: 'G', mode: 'private', roomCode: 'LAN123' }]));
      await sleep(60);
      assert.ok(coreBatch.length >= 1, 'createHostCore must use sendMany when broadcasting to 2+ peers in a room');
      assert.deepEqual(coreBatch[0].peerIds, ['host', 'g1']);
    } finally {
      core.stop();
    }
  });
});

