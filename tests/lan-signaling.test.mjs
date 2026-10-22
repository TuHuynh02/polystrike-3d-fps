/**
 * Signaling for in-browser LAN rooms (server/lanSignaling.js) and the URL helpers of "Chơi qua LAN".
 * The WebRTC handshake itself needs a browser; here the relay rules are checked with fake sockets.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { LanSignaling } from '../server/lanSignaling.js';
import { LanClientSocket } from '../shared/lanClientSocket.js';
import {
  buildLanHostUrl,
  generateLanRoomCode,
  parseLanGuestParams,
  parseLanHostParams
} from '../shared/lanUrl.js';

let nextId = 1;
function fakeSocket() {
  const handlers = new Map();
  const sent = [];
  const socket = {
    id: `s${ nextId++ }`,
    disconnected: false,
    sent,
    on: (event, fn) => handlers.set(event, fn),
    emit: (event, payload) => sent.push({ event, payload }),
    disconnect() { this.disconnected = true; },
    /** Simulates the client emitting `event`; returns the ack payload (if the handler acknowledged). */
    fire(event, payload) {
      let reply;
      handlers.get(event)?.(payload, (r) => { reply = r; });
      return reply;
    },
    close() { handlers.get('disconnect')?.(); }
  };
  return socket;
}

function setup() {
  const sig = new LanSignaling();
  const host = fakeSocket();
  const guest = fakeSocket();
  sig.attach(host);
  sig.attach(guest);
  return { sig, host, guest };
}

describe('LanSignaling', () => {
  it('host registers a code; guests find it and the host is told to start the handshake', () => {
    const { host, guest } = setup();
    assert.deepEqual(host.fire('lanHostOpen', { code: 'abc234' }), { ok: true }, 'codes are normalised');
    const reply = guest.fire('lanGuestJoin', { code: 'ABC234' });
    assert.equal(reply.ok, true);
    assert.match(reply.peerId, /^g/);
    assert.deepEqual(host.sent, [{ event: 'lanPeer', payload: { peerId: reply.peerId } }]);
  });

  it('rejects bad codes, duplicate hosts and unknown rooms', () => {
    const { sig, host, guest } = setup();
    assert.equal(host.fire('lanHostOpen', { code: 'x' }).error, 'bad_code');
    assert.equal(host.fire('lanHostOpen', { code: 'ABC234' }).ok, true);
    assert.equal(host.fire('lanHostOpen', { code: 'ZZZ999' }).error, 'already_registered');
    const other = fakeSocket();
    sig.attach(other);
    assert.equal(other.fire('lanHostOpen', { code: 'ABC234' }).error, 'code_in_use');
    assert.equal(guest.fire('lanGuestJoin', { code: 'NOPE22' }).error, 'no_host');
  });

  it('relays offer / answer / candidate only between a host and its own guests', () => {
    const { sig, host, guest } = setup();
    host.fire('lanHostOpen', { code: 'ABC234' });
    const { peerId } = guest.fire('lanGuestJoin', { code: 'ABC234' });
    host.fire('lanSignal', { to: peerId, data: { type: 'offer', sdp: 'v=0' } });
    assert.deepEqual(guest.sent.at(-1), { event: 'lanSignal', payload: { from: 'host', data: { type: 'offer', sdp: 'v=0' } } });
    guest.fire('lanSignal', { to: 'host', data: { type: 'answer', sdp: 'v=0' } });
    assert.deepEqual(host.sent.at(-1), { event: 'lanSignal', payload: { from: peerId, data: { type: 'answer', sdp: 'v=0' } } });

    // another host cannot reach this guest; junk and oversize payloads are dropped
    const rival = fakeSocket();
    sig.attach(rival);
    rival.fire('lanHostOpen', { code: 'RIV222' });
    const before = guest.sent.length;
    rival.fire('lanSignal', { to: peerId, data: { type: 'offer', sdp: 'evil' } });
    host.fire('lanSignal', { to: peerId, data: { type: 'script', sdp: 'x' } });
    host.fire('lanSignal', { to: peerId, data: { type: 'offer', sdp: 'x'.repeat(30_000) } });
    host.fire('lanSignal', { to: 42, data: { type: 'offer' } });
    assert.equal(guest.sent.length, before);
  });

  it('a guest leaving tells the host; a host leaving tells and releases its guests', () => {
    const { sig, host, guest } = setup();
    host.fire('lanHostOpen', { code: 'ABC234' });
    const { peerId } = guest.fire('lanGuestJoin', { code: 'ABC234' });
    guest.close();
    assert.deepEqual(host.sent.at(-1), { event: 'lanPeerGone', payload: { peerId } });

    const guest2 = fakeSocket();
    sig.attach(guest2);
    guest2.fire('lanGuestJoin', { code: 'ABC234' });
    host.close();
    assert.deepEqual(guest2.sent.at(-1), { event: 'lanHostGone', payload: {} });
    assert.equal(sig.hosts.size, 0);
    assert.equal(sig.guests.size, 0);
    assert.equal(guest2.fire('lanGuestJoin', { code: 'ABC234' }).error, 'no_host');
  });
});

describe('LAN room URLs and the client socket', () => {
  it('host / guest URLs round-trip and are sanitised', () => {
    const url = buildLanHostUrl('https://game.example.com', { code: 'ab-c234', name: '<Tu>', mapId: 'cyber_citadel', gameMode: 'tdm' });
    assert.ok(url.startsWith('https://game.example.com/?lanhost=ABC234'));
    assert.deepEqual(parseLanHostParams(new URL(url).search), { code: 'ABC234', name: 'Tu', mapId: 'cyber_citadel', gameMode: 'tdm' });
    assert.equal(parseLanHostParams('?lanhost=XY'), null);
    assert.equal(parseLanHostParams('?room=ABC234'), null);
    assert.deepEqual(parseLanGuestParams('?room=abc234&lan=1'), { code: 'ABC234' });
    assert.equal(parseLanGuestParams('?room=ABC234'), null, 'an ordinary invite is not a LAN room');
    assert.equal(parseLanGuestParams('?room=ABC&lan=1'), null);
  });

  it('generateLanRoomCode uses the server alphabet', () => {
    for (let i = 0; i < 50; i++) assert.match(generateLanRoomCode(), /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/);
  });

  it('LanClientSocket behaves like a Socket.IO client: events, once/off, acks, volatile flag, lifecycle', () => {
    const c = new LanClientSocket({ id: 'me' });
    const sent = [];
    c.attach((channel, text) => sent.push({ channel, text }));
    const seen = [];
    c.on('connect', () => seen.push('connect'));
    c.once('hello', (p) => seen.push(`hello:${ p.n }`));
    c.on('disconnect', (r) => seen.push(`disconnect:${ r }`));
    c.emit('early'); // not connected yet: dropped
    assert.equal(sent.length, 0);
    c.open();
    c.receive('{"e":"hello","p":[{"n":1}]}');
    c.receive('{"e":"hello","p":[{"n":2}]}');
    c.receive('not json');
    c.volatile.emit('x', { a: 1 });
    c.emit('y', { b: 2 });
    assert.deepEqual(sent.map((f) => f.channel), ['unrel', 'rel']);
    let acked;
    c.emit('pingCheck', 5, (v) => { acked = v; });
    const id = JSON.parse(sent.at(-1).text).a;
    c.receive(`{"r":${ id },"p":["pong"]}`);
    assert.equal(acked, 'pong');
    c.receive('{"e":"latencyProbe","p":[7],"a":9}');
    c.close('transport close');
    assert.deepEqual(seen, ['connect', 'hello:1', 'disconnect:transport close']);
  });
});
