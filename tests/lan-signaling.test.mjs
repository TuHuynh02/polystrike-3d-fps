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

describe('LAN room discovery, auto-detection, hot-swap, STUN fallback, beforeunload & invite auto-join', async () => {
  await import('./helpers/headless-game3d.mjs');

  // Upgrade mock DOM elements with classList, dataset, value, click(), and event listeners for UI module tests
  const rawGetById = globalThis.document.getElementById.bind(globalThis.document);
  const enhancedElements = new Map();
  globalThis.document.getElementById = (id) => {
    if (!enhancedElements.has(id)) {
      const base = rawGetById(id) || {};
      const classes = new Set(id === 'lobby-error' || id === 'invite-banner' ? ['hidden'] : []);
      const listeners = new Map();
      const el = Object.assign(base, {
        id,
        textContent: base.textContent || '',
        innerHTML: '',
        value: '',
        checked: false,
        disabled: false,
        dataset: {},
        style: base.style || {},
        classList: {
          add: (...tokens) => tokens.forEach((t) => classes.add(t)),
          remove: (...tokens) => tokens.forEach((t) => classes.delete(t)),
          toggle: (token, force) => {
            const shouldHave = force !== undefined ? Boolean(force) : !classes.has(token);
            if (shouldHave) classes.add(token);
            else classes.delete(token);
            return shouldHave;
          },
          contains: (token) => classes.has(token)
        },
        addEventListener(type, fn) {
          if (!listeners.has(type)) listeners.set(type, []);
          listeners.get(type).push(fn);
        },
        removeEventListener(type, fn) {
          const arr = listeners.get(type);
          if (!arr) return;
          const idx = arr.indexOf(fn);
          if (idx !== -1) arr.splice(idx, 1);
        },
        dispatchEvent(evt) {
          const arr = listeners.get(evt.type) || [];
          for (const fn of [...arr]) fn(evt);
        },
        click() {
          this.dispatchEvent({ type: 'click', target: this });
        },
        querySelectorAll: () => [],
        replaceChildren() {
          this.children = [];
          this.innerHTML = '';
        },
        setAttribute: () => {}
      });
      enhancedElements.set(id, el);
    }
    return enhancedElements.get(id);
  };

  const store = new Map();
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k)
  };
  globalThis.window.location = {
    search: '',
    pathname: '/',
    origin: 'http://192.168.1.50:3000',
    href: 'http://192.168.1.50:3000/'
  };
  globalThis.window.history = { replaceState: () => {} };

  const { RTC_CONFIG, STUN_URLS } = await import('../public/js/lanHost/rtc.js');
  const { startLanHost } = await import('../public/js/lanHost/hostSession.js');
  const { startLanGuest } = await import('../public/js/lanHost/guestSession.js');
  const {
    activateLanGuestSession,
    activateLanHostSession,
    restoreOnlineSession,
    shouldWarnLanHostBeforeUnload
  } = await import('../public/js/lanHost/lanMode.js');
  const { RoomManager } = await import('../server/roomManager.js');
  const { attachGameSocketHandlers } = await import('../server/socketHandlers.js');
  const dom = await import('../public/js/ui/domElements.js');
  const { appState } = await import('../public/js/ui/userPrefsAndKeys.js');
  const { bindGameSocketListeners } = await import('../public/js/ui/socketEvents.js');
  const {
    checkIsLanRoom,
    fetchActiveRooms,
    initLanServerRoom,
    initLobbyAndModalListeners,
    joinRoomByCode,
    leaveActiveRoom,
    startLanGuestInPlace,
    startLanHostInPlace
  } = await import('../public/js/ui/lobbyAndModals.js');

  function createEventSocket(id = 'online_sock') {
    const handlers = new Map();
    const onceHandlers = new Map();
    const emitted = [];
    return {
      id,
      connected: true,
      emitted,
      on(event, fn) {
        if (!handlers.has(event)) handlers.set(event, []);
        handlers.get(event).push(fn);
      },
      once(event, fn) {
        if (!onceHandlers.has(event)) onceHandlers.set(event, []);
        onceHandlers.get(event).push(fn);
      },
      off(event, fn) {
        if (!fn) {
          handlers.delete(event);
          onceHandlers.delete(event);
          return;
        }
        const h = handlers.get(event);
        if (h) {
          const i = h.indexOf(fn);
          if (i !== -1) h.splice(i, 1);
        }
      },
      emit(event, payload, ack) {
        emitted.push({ event, payload });
        if (typeof this.onClientEmit === 'function') {
          this.onClientEmit(event, payload, ack);
        }
      },
      triggerServerEvent(event, payload) {
        for (const fn of [...(handlers.get(event) || [])]) fn(payload);
        const onceList = onceHandlers.get(event) || [];
        onceHandlers.delete(event);
        for (const fn of onceList) fn(payload);
      }
    };
  }

  function resetTestAppState(onlineSocket) {
    appState.socket = onlineSocket;
    appState.netClient = {
      socket: onlineSocket,
      signalSocket: onlineSocket,
      fetchRooms: async () => []
    };
    appState.lanInfo = null;
    appState.activeRoomCode = '';
    appState.knownLanCodes = new Set();
    appState.latestPlayers = [];
    appState.lastJoinPayload = null;
    appState.selectedMapId = 'cyber_citadel';
    appState.selectedGameMode = 'ffa';
    appState.selectedStartingWeapon = 'rifle';
    appState.selectedLoadout = { primary: 'rifle', secondary: 'pistol', melee: 'knife' };
    appState.selectedOperatorColor = 0x3b82f6;
    appState.sfx = { enabled: false, ensureContext: () => {}, playShot: () => {} };
    appState.game = {
      inMatch: false,
      isAiming: false,
      localId: 'p1',
      quality: { antialias: false },
      tier: 'medium',
      qualityChoice: 'auto',
      keys: {},
      preloadAssets: () => Promise.resolve(),
      setTeamState: () => {},
      exitPointerLock: () => {},
      requestPointerLock: () => {},
      clearAllRemotePlayers: () => {},
      clearDroppedWeapons: () => {},
      clearGrenades: () => {},
      loadMap: () => {},
      setLoadout: () => {},
      setLobbyWeapon: () => {},
      setLobbyOperatorColor: () => {}
    };
    dom.lanState.active = false;
    dom.lanP2pCheckbox.checked = false;
    dom.lobbyError.textContent = '';
    dom.lobbyError.classList.add('hidden');
    globalThis.window.location.search = '';
    globalThis.window.location.href = 'http://192.168.1.50:3000/';
  }

  it('1. configures lightweight fallback STUN servers in RTC_CONFIG for cross-subnet / mDNS-blocked LAN', () => {
    assert.ok(Array.isArray(STUN_URLS) && STUN_URLS.length >= 1, 'STUN_URLS must be non-empty');
    assert.ok(STUN_URLS.some((u) => u.startsWith('stun:')), 'STUN_URLS must contain stun: URLs');
    assert.ok(Array.isArray(RTC_CONFIG?.iceServers) && RTC_CONFIG.iceServers.length >= 1, 'RTC_CONFIG.iceServers must include fallback STUN');
    assert.deepEqual(RTC_CONFIG.iceServers[0].urls, STUN_URLS);
  });

  it('2. LanSignaling tracks LAN room metadata, updates player counts, answers lanCheck, and cleans up on lanLeave', () => {
    const { sig, host, guest } = setup();
    host.fire('lanHostOpen', { code: 'lan777', mapId: 'cargo_dock', gameMode: 'tdm' });

    assert.equal(sig.hasHost('lan777'), true);
    assert.equal(sig.hasHost('NOPE99'), false);
    assert.deepEqual(guest.fire('lanCheck', { code: 'lan777' }), {
      ok: true,
      isLan: true,
      code: 'LAN777',
      roomCode: 'LAN777',
      mapId: 'cargo_dock',
      gameMode: 'tdm'
    });
    assert.deepEqual(guest.fire('lanCheck', { code: 'NOPE99' }), { ok: true, isLan: false });

    let summary = sig.getLanRoomsSummary();
    assert.equal(summary.length, 1);
    assert.equal(summary[0].code, 'LAN777');
    assert.equal(summary[0].mapId, 'cargo_dock');
    assert.equal(summary[0].gameMode, 'tdm');
    assert.equal(summary[0].isLan, true);
    assert.equal(summary[0].humans, 1);
    assert.equal(summary[0].total, 1);

    // Guest joins -> player count increments to 2
    const joinReply = guest.fire('lanGuestJoin', { code: 'LAN777' });
    assert.equal(joinReply.ok, true);
    summary = sig.getLanRoomsSummary();
    assert.equal(summary[0].humans, 2);
    assert.equal(summary[0].total, 2);

    // Host updates map/mode/humans metadata via lanHostUpdate
    host.fire('lanHostUpdate', { mapId: 'cyber_citadel', gameMode: 'ffa', state: 'PLAYING', humans: 3 });
    summary = sig.getLanRoomsSummary();
    assert.equal(summary[0].mapId, 'cyber_citadel');
    assert.equal(summary[0].gameMode, 'ffa');
    assert.equal(summary[0].humans, 3);

    // Guest leaves in-place via lanLeave (without socket disconnect) -> host notified & count decremented
    guest.fire('lanLeave');
    assert.deepEqual(host.sent.at(-1), { event: 'lanPeerGone', payload: { peerId: joinReply.peerId } });
    assert.equal(sig.getLanRoomsSummary()[0].humans, 1);

    // Host leaves in-place via lanLeave -> room removed from LanSignaling
    host.fire('lanLeave');
    assert.equal(sig.hasHost('LAN777'), false);
    assert.equal(sig.getLanRoomsSummary().length, 0);
  });

  it('3. Server joinRoom redirects to lanRoomRedirect instead of creating a duplicate online room when code is in LanSignaling.hosts', () => {
    const sig = new LanSignaling();
    const hostSig = fakeSocket();
    sig.attach(hostSig);
    hostSig.fire('lanHostOpen', { code: 'LAN888' });

    const ioEvents = [];
    const rm = new RoomManager({
      to: (code) => ({ emit: (event, data) => ioEvents.push({ code, event, data }) })
    });
    rm.stop();

    const clientSock = fakeSocket();
    sig.attach(clientSock);
    attachGameSocketHandlers({ socket: clientSock, roomManager: rm, lanSignaling: sig });

    clientSock.fire('joinRoom', { name: 'GuestPlayer', mode: 'private', roomCode: 'lan888' });
    assert.equal(rm.rooms.has('LAN888'), false, 'Must NOT create a duplicate online room for an active LAN room code');
    assert.deepEqual(clientSock.sent.at(-1), {
      event: 'lanRoomRedirect',
      payload: { roomCode: 'LAN888' }
    });
  });

  it('4. Protects LAN Host with beforeunload warning when guests are connected and cleans up on stop()', async () => {
    const sig = new LanSignaling();
    const serverHostSock = fakeSocket();
    sig.attach(serverHostSock);

    const clientListeners = new Map();
    const clientSignalSocket = {
      on: (ev, fn) => clientListeners.set(ev, fn),
      off: (ev) => clientListeners.delete(ev),
      emit: (ev, payload, ack) => {
        const res = serverHostSock.fire(ev, payload);
        if (typeof ack === 'function') ack(res);
      }
    };

    const prevRTC = globalThis.RTCPeerConnection;
    globalThis.RTCPeerConnection = class MockRTCPeerConnection {
      constructor() {
        this.remoteDescription = null;
        this.connectionState = 'connected';
      }
      createDataChannel(label) {
        return { label, readyState: 'open', bufferedAmount: 0, send: () => {}, close: () => {} };
      }
      async createOffer() { return { type: 'offer', sdp: 'v=0' }; }
      async setLocalDescription() {}
      async setRemoteDescription(d) { this.remoteDescription = d; }
      async addIceCandidate() {}
      close() { this.connectionState = 'closed'; }
    };

    try {
      const hostSession = await startLanHost({
        code: 'HST123',
        signalSocket: clientSignalSocket,
        mapId: 'cyber_citadel',
        gameMode: 'ffa'
      });

      assert.equal(sig.hasHost('HST123'), true);
      assert.equal(hostSession.hasGuests(), false);

      // With 0 guests connected, beforeunload must NOT preventDefault
      let prevented0 = false;
      const evt0 = { type: 'beforeunload', preventDefault() { prevented0 = true; }, returnValue: undefined };
      globalThis.window.dispatchEvent(evt0);
      assert.equal(prevented0, false, 'beforeunload must not block when 0 guests are connected');

      // Connect a guest peer -> peers.size becomes 1 -> beforeunload MUST preventDefault
      await clientListeners.get('lanPeer')?.({ peerId: 'g_peer_1' });
      assert.equal(hostSession.peerCount(), 1);
      assert.equal(hostSession.hasGuests(), true);

      let prevented1 = false;
      const evt1 = { type: 'beforeunload', preventDefault() { prevented1 = true; }, returnValue: undefined };
      globalThis.window.dispatchEvent(evt1);
      assert.equal(prevented1, true, 'beforeunload must call preventDefault() when a guest peer is connected');
      assert.equal(evt1.returnValue, '');

      // Simulate shouldWarnLanHostBeforeUnload
      assert.equal(
        shouldWarnLanHostBeforeUnload({
          lanInfo: { role: 'host', hasGuests: () => true },
          latestPlayers: [{ id: 'p1' }]
        }),
        true
      );
      assert.equal(
        shouldWarnLanHostBeforeUnload({
          lanInfo: { role: 'host', hasGuests: () => false },
          latestPlayers: [{ id: 'p1' }, { id: 'p2' }]
        }),
        true
      );
      assert.equal(
        shouldWarnLanHostBeforeUnload({
          lanInfo: { role: 'host', hasGuests: () => false },
          latestPlayers: [{ id: 'p1' }]
        }),
        false
      );

      hostSession.stop();
      assert.equal(sig.hasHost('HST123'), false, 'Stopping LAN host must emit lanLeave and unregister host');

      // After stop(), beforeunload listener must be removed
      let preventedAfterStop = false;
      globalThis.window.dispatchEvent({ type: 'beforeunload', preventDefault() { preventedAfterStop = true; } });
      assert.equal(preventedAfterStop, false);
    } finally {
      globalThis.RTCPeerConnection = prevRTC;
    }
  });

  it('5. Hot-swaps appState.socket in-place when creating/joining/leaving LAN rooms without window.location.href reload', async () => {
    const onlineSocket = createEventSocket('online_main');
    resetTestAppState(onlineSocket);
    bindGameSocketListeners(onlineSocket);

    const initialHref = globalThis.window.location.href;
    let fakeHostStopped = false;
    const fakeHostSocket = createEventSocket('lan_host_local');

    const lanHost = await startLanHostInPlace({
      code: 'HOT111',
      name: 'HostUser',
      mapId: 'cargo_dock',
      gameMode: 'tdm',
      startHostFn: () => ({
        socket: fakeHostSocket,
        fetchRooms: async () => [{ code: 'HOT111', isLan: true, total: 1, maxPlayers: 16 }],
        hasGuests: () => true,
        stop: () => { fakeHostStopped = true; }
      })
    });

    assert.equal(lanHost.role, 'host');
    assert.equal(lanHost.code, 'HOT111');
    assert.equal(appState.socket, fakeHostSocket, 'appState.socket must hot-swap to the LAN host socket');
    assert.equal(dom.lanState.active, true, 'lanState.active must be true for ?lan=1 invite links');
    assert.equal(globalThis.window.location.href, initialHref, 'Must NOT reload the page via window.location.href');
    assert.equal(fakeHostSocket.emitted.some((e) => e.event === 'joinRoom' && e.payload.roomCode === 'HOT111'), true, 'Host must immediately emit joinRoom on the hot-swapped LAN host socket');

    // Leaving the LAN room must stop the LAN host and restore the online socket in-place
    appState.activeRoomCode = 'HOT111';
    leaveActiveRoom({ emitLeave: true });
    assert.equal(fakeHostStopped, true, 'Leaving LAN room must stop the LAN host session');
    assert.equal(appState.lanInfo, null);
    assert.equal(dom.lanState.active, false);
    assert.equal(appState.socket, onlineSocket, 'appState.socket must be restored to the online socket after leaving LAN room');
  });

  it('6. Renders [LAN] rooms in activeRoomsList and auto-detects LAN codes when clicking VÀO (btnJoinCode & room list)', async () => {
    const onlineSocket = createEventSocket('online_detect');
    onlineSocket.onClientEmit = (event, payload, ack) => {
      if (event === 'lanCheck' && typeof ack === 'function') {
        ack({ isLan: payload?.code === 'LAN654', roomCode: payload?.code });
      }
    };
    resetTestAppState(onlineSocket);
    appState.netClient.fetchRooms = async () => [
      { code: 'PUB111', mapName: 'CYBER CITADEL', gameMode: 'ffa', total: 3, maxPlayers: 16 },
      { code: 'LAN999', mapName: 'CARGO DOCK', gameMode: 'tdm', total: 2, maxPlayers: 16, isLan: true, lan: true }
    ];

    await fetchActiveRooms();
    assert.ok(dom.activeRoomsList.innerHTML.includes('#PUB111'), 'Public room must be rendered');
    assert.ok(dom.activeRoomsList.innerHTML.includes('#LAN999'), 'LAN room must be rendered');
    assert.ok(dom.activeRoomsList.innerHTML.includes('[LAN]'), 'LAN room must display [LAN] tag');
    assert.ok(dom.activeRoomsList.innerHTML.includes('data-lan="1"'), 'LAN room join button must carry data-lan="1"');
    assert.equal(appState.knownLanCodes.has('LAN999'), true, 'fetchActiveRooms must cache known LAN room codes');

    // Case A: Entering a 6-character code that is NOT in knownLanCodes yet, but LanSignaling reports isLan=true via lanCheck
    // (even when lanP2pCheckbox is unchecked!)
    dom.lanP2pCheckbox.checked = false;
    let guestStartedFor = null;
    const fakeGuestSocket = createEventSocket('lan_guest_sock');
    await joinRoomByCode('lan654', {
      mode: 'private',
      startGuestFn: ({ code }) => {
        guestStartedFor = code;
        return { socket: fakeGuestSocket, stop: () => {} };
      }
    });
    assert.equal(guestStartedFor, 'LAN654', 'joinRoomByCode must auto-detect LAN room via lanCheck and start LAN guest');
    assert.equal(appState.socket, fakeGuestSocket, 'appState.socket must switch to the LAN guest socket');
    assert.equal(
      onlineSocket.emitted.some((e) => e.event === 'joinRoom' && e.payload.roomCode === 'LAN654'),
      false,
      'Must NOT emit joinRoom to the online server for a LAN room code'
    );
    assert.equal(
      fakeGuestSocket.emitted.some((e) => e.event === 'joinRoom' && e.payload.roomCode === 'LAN654'),
      true,
      'Must emit joinRoom over the WebRTC LAN guest socket'
    );

    // Restore online session and test Case B: normal online 6-character code (lanCheck returns isLan=false)
    leaveActiveRoom({ emitLeave: false });
    await joinRoomByCode('ONL222', { mode: 'private' });
    assert.equal(
      onlineSocket.emitted.some((e) => e.event === 'joinRoom' && e.payload.roomCode === 'ONL222'),
      true,
      'Non-LAN 6-character code must emit joinRoom on the online socket as normal'
    );
  });

  it('7. Auto-joins immediately when opening an invite link (?room=CODE or ?room=CODE&lan=1) without clicking btnJoinInvited', () => {
    // Case A: Regular invite link ?room=INV555 when socket connects
    const onlineSocket = createEventSocket('online_invite');
    onlineSocket.connected = false;
    resetTestAppState(onlineSocket);
    globalThis.window.location.search = '?room=inv555';

    initLanServerRoom();
    assert.equal(onlineSocket.emitted.filter((e) => e.event === 'joinRoom').length, 0, 'Must wait until socket is connected');
    onlineSocket.connected = true;
    onlineSocket.triggerServerEvent('connect');
    assert.equal(
      onlineSocket.emitted.some((e) => e.event === 'joinRoom' && e.payload.roomCode === 'INV555' && e.payload.mode === 'private'),
      true,
      'Opening ?room=INV555 must auto-emit joinRoom as soon as socket connects'
    );

    // Case B: LAN invite link ?room=LAN555&lan=1 when guest WebRTC socket connects
    const guestSocket = createEventSocket('lan_invite_guest');
    guestSocket.connected = false;
    resetTestAppState(guestSocket);
    appState.lanInfo = { role: 'guest', code: 'LAN555', stop: () => {} };
    globalThis.window.location.search = '?room=LAN555&lan=1';

    initLanServerRoom();
    assert.equal(guestSocket.emitted.filter((e) => e.event === 'joinRoom').length, 0);
    guestSocket.connected = true;
    guestSocket.triggerServerEvent('connect');
    assert.equal(
      guestSocket.emitted.some((e) => e.event === 'joinRoom' && e.payload.roomCode === 'LAN555' && e.payload.mode === 'private'),
      true,
      'Opening ?room=LAN555&lan=1 must auto-emit joinRoom as soon as LAN guest socket connects'
    );
  });

  it('8. Handles server lanRoomRedirect event by switching to LAN guest mode in-place', async () => {
    const onlineSocket = createEventSocket('online_redirect');
    resetTestAppState(onlineSocket);
    bindGameSocketListeners(onlineSocket);

    const prevRTC = globalThis.RTCPeerConnection;
    globalThis.RTCPeerConnection = class MockRTCPeerConnection {
      createDataChannel(label) {
        return { label, readyState: 'connecting', bufferedAmount: 0, send: () => {}, close: () => {} };
      }
      async setRemoteDescription() {}
      async createAnswer() { return { type: 'answer', sdp: 'v=0' }; }
      async setLocalDescription() {}
      async addIceCandidate() {}
      close() {}
    };

    try {
      onlineSocket.triggerServerEvent('lanRoomRedirect', { roomCode: 'RDR777' });
      // Wait microtask for async startLanGuestInPlace
      await new Promise((r) => setTimeout(r, 10));
      assert.equal(appState.lanInfo?.role, 'guest');
      assert.equal(appState.lanInfo?.code, 'RDR777');
      assert.notEqual(appState.socket, onlineSocket, 'lanRoomRedirect must switch appState.socket to LAN guest socket');
      leaveActiveRoom({ emitLeave: false });
      assert.equal(appState.socket, onlineSocket);
    } finally {
      globalThis.RTCPeerConnection = prevRTC;
    }
  });

  it('9. Cancels stale in-flight startLanHostInPlace when leaveActiveRoom and startLanGuestInPlace run before lanHostOpen resolves', async () => {
    const onlineSocket = createEventSocket('online_race');
    resetTestAppState(onlineSocket);
    bindGameSocketListeners(onlineSocket);

    let resolveSlowHost;
    let slowHostStopped = false;
    const slowHostSocket = createEventSocket('slow_host_sock');
    const fastGuestSocket = createEventSocket('fast_guest_sock');

    // Start hosting 'SLW111', whose starter stays in flight
    const pendingHostPromise = startLanHostInPlace({
      code: 'SLW111',
      name: 'RaceHost',
      startHostFn: () =>
        new Promise((resolve) => {
          resolveSlowHost = () =>
            resolve({
              socket: slowHostSocket,
              stop: () => {
                slowHostStopped = true;
              }
            });
        })
    });

    // While 'SLW111' is still in flight, leave to lobby and immediately join 'FST222' as a guest
    leaveActiveRoom({ emitLeave: false });
    const guestInfo = await startLanGuestInPlace('FST222', {
      startGuestFn: () => ({
        socket: fastGuestSocket,
        stop: () => {}
      })
    });

    assert.equal(guestInfo?.role, 'guest');
    assert.equal(appState.lanInfo?.code, 'FST222');
    assert.equal(appState.socket, fastGuestSocket);

    // Now the stale host starter resolves late
    resolveSlowHost();
    const staleResult = await pendingHostPromise;

    assert.equal(staleResult, null, 'Superseded startLanHostInPlace must resolve to null');
    assert.equal(slowHostStopped, true, 'Superseded host session must be stopped immediately upon resolving');
    assert.equal(appState.lanInfo?.role, 'guest', 'Active guest session must NOT be overwritten by stale host resolution');
    assert.equal(appState.lanInfo?.code, 'FST222');
    assert.equal(appState.socket, fastGuestSocket, 'appState.socket must remain on the active guest socket');
    assert.equal(
      slowHostSocket.emitted.some((e) => e.event === 'joinRoom'),
      false,
      'Cancelled host session must NOT emit joinRoom'
    );
  });

  it('10. Scopes lanLeave by role/code/peerId and cleans up guest signaling on failure or in-flight stop', () => {
    const { sig, host, guest } = setup();
    host.fire('lanHostOpen', { code: 'LVE111' });
    const join1 = guest.fire('lanGuestJoin', { code: 'LVE111' });
    assert.equal(join1.ok, true);

    // A stale lanLeave with a mismatched code or role must NOT remove the active guest or host
    host.fire('lanLeave', { role: 'host', code: 'WRONG1' });
    assert.equal(sig.hasHost('LVE111'), true, 'Mismatched host code in lanLeave must not remove active host');
    guest.fire('lanLeave', { role: 'guest', peerId: 'g_stale_peer' });
    assert.equal(sig.guests.has(join1.peerId), true, 'Mismatched peerId in lanLeave must not remove active guest');

    // Now test startLanGuest in-flight stop() before lanGuestJoin ack returns
    let pendingJoinAck = null;
    const clientSig = {
      connected: true,
      emitted: [],
      on: () => {},
      once: () => {},
      off: () => {},
      emit(ev, payload, ack) {
        this.emitted.push({ ev, payload });
        if (ev === 'lanGuestJoin') pendingJoinAck = ack;
      }
    };
    const gSession = startLanGuest({ signalSocket: clientSig, code: 'LVE111' });
    gSession.stop(); // stopped before ack!
    assert.ok(clientSig.emitted.some((e) => e.ev === 'lanLeave'), 'stop() must emit lanLeave');
    // Late ack arrives after stop() -> must emit scoped lanLeave with the newly assigned peerId
    pendingJoinAck?.({ ok: true, peerId: 'g_late_99' });
    assert.ok(
      clientSig.emitted.some((e) => e.ev === 'lanLeave' && e.payload?.peerId === 'g_late_99'),
      'Late lanGuestJoin ack after stop() must emit lanLeave for that peerId'
    );
  });

  it('11. Fires handleTeamLobbyState on restored online socket after leaving LAN and cleans up online room before lanRoomRedirect', async () => {
    const onlineSocket = createEventSocket('online_tdm');
    resetTestAppState(onlineSocket);
    bindGameSocketListeners(onlineSocket);

    // Enter and leave a LAN room so appState.netClient.signalSocket === onlineSocket
    const fakeLanSock = createEventSocket('lan_temp');
    await startLanHostInPlace({
      code: 'TMP111',
      startHostFn: () => ({ socket: fakeLanSock, stop: () => {} })
    });
    leaveActiveRoom({ emitLeave: false });
    assert.equal(appState.socket, onlineSocket);
    assert.equal(appState.netClient.signalSocket, onlineSocket);

    // Join an online TDM room and verify teamLobbyState updates appState.latestPlayers & currentRoomState
    appState.activeRoomCode = 'TDM999';
    onlineSocket.triggerServerEvent('teamLobbyState', {
      gameMode: 'tdm',
      state: 'WAITING',
      hostId: 'p1',
      players: [{ id: 'p1', name: 'AlphaLeader', team: 'alpha', ready: true }]
    });
    assert.equal(appState.currentRoomGameMode, 'tdm');
    assert.equal(appState.currentRoomState, 'WAITING');
    assert.equal(appState.latestPlayers.length, 1);
    assert.equal(appState.latestPlayers[0].name, 'AlphaLeader');

    // Verify server/socketHandlers.js removes player from previous online room before emitting lanRoomRedirect
    const sig = new LanSignaling();
    const hostSig = fakeSocket();
    sig.attach(hostSig);
    hostSig.fire('lanHostOpen', { code: 'LAN444' });

    const rm = new RoomManager({ to: () => ({ emit: () => {} }) });
    rm.stop();
    const switchingClient = fakeSocket();
    switchingClient.join = () => {};
    switchingClient.leave = () => {};
    switchingClient.to = () => ({ emit: () => {} });
    sig.attach(switchingClient);
    attachGameSocketHandlers({ socket: switchingClient, roomManager: rm, lanSignaling: sig });

    switchingClient.fire('joinRoom', { name: 'Switcher', mode: 'private', roomCode: 'ONL444' });
    assert.equal(rm.rooms.has('ONL444'), true, 'Online room ONL444 should exist while player is inside');
    switchingClient.fire('joinRoom', { name: 'Switcher', mode: 'private', roomCode: 'LAN444' });
    assert.equal(switchingClient.sent.at(-1)?.event, 'lanRoomRedirect');
    assert.equal(rm.rooms.has('ONL444'), false, 'Previous online room ONL444 must be cleaned up when redirecting to LAN room');
  });
});


