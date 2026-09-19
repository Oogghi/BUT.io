import assert from 'node:assert/strict';
import test from 'node:test';
import {
  defaultSettings,
  type BombPartyRoomState as LobbyState,
} from '@but/bomb-party';
import { frenchDictionary } from '@but/bomb-party/server';
import { useTestServer } from './lobbyClient.js';

const { create, join, waitFor, nextError } =
  useTestServer<LobbyState>('bomb-party');

test(
  'validates names, exposes six-character codes, and keeps codes distinct',
  { concurrency: false },
  async () => {
    const first = await create(' Alice ');
    assert.equal(first.state.settings.difficulty, 'easy');
    assert.match(first.roomId, /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/);
    assert.equal(
      first.state.players.get(first.sessionId)?.displayName,
      'Alice',
    );

    const invalidName = { message: 'invalid-name' };
    await assert.rejects(() => join(first.roomId, '   '), invalidName);
    await assert.rejects(
      () => join(first.roomId, `x${'a'.repeat(24)}`),
      invalidName,
    );
    await assert.rejects(() => join(first.roomId, `ok\nname`), invalidName);

    const second = await create('Second');
    assert.notEqual(first.roomId, second.roomId);
  },
);

test(
  'stores each player avatar and falls back to the first look when invalid',
  { concurrency: false },
  async () => {
    const host = await create('Host');
    assert.equal(host.state.players.get(host.sessionId)?.avatar, 0);
    const picked = await join(host.roomId, 'Picked', { avatar: 3 });
    assert.equal(picked.state.players.get(picked.sessionId)?.avatar, 3);
    const invalid = await join(host.roomId, 'Invalid', { avatar: 99 });
    assert.equal(invalid.state.players.get(invalid.sessionId)?.avatar, 0);
  },
);

test(
  'enforces host, phase, readiness, countdown, results, and repeated rounds',
  { concurrency: false },
  async () => {
    const host = await create('Host');
    const minPlayers = nextError(host);
    host.send('start');
    assert.equal(await minPlayers, 'not-enough-players');
    let guest = await join(host.roomId, 'Guest');

    const notReady = nextError(host);
    host.send('start');
    assert.equal(await notReady, 'players-not-ready');
    const earlyWord = nextError(host);
    host.send('word', { word: 'bonjour', turnId: 0 });
    assert.equal(await earlyWord, 'wrong-phase');
    const earlyReturn = nextError(host);
    host.send('return');
    assert.equal(await earlyReturn, 'wrong-phase');

    const unauthorizedStart = nextError(guest);
    guest.send('start');
    assert.equal(await unauthorizedStart, 'host-only');
    const invalidReady = nextError(host);
    host.send('ready', 'yes');
    assert.equal(await invalidReady, 'invalid-payload');
    host.send('ready', true);
    const guestStart = nextError(guest);
    guest.send('start');
    assert.equal(await guestStart, 'host-only');
    guest.send('ready', true);
    await waitFor(host, (state) =>
      [...state.players.values()].every((player) => player.ready),
    );
    host.send('start');
    await waitFor(host, (state) => state.phase === 'starting');
    await assert.rejects(() => join(host.roomId, 'Late player'));
    await waitFor(host, (state) => state.phase === 'playing', 2500);
    await waitFor(guest, (state) => state.phase === 'playing');

    const lateReady = nextError(guest);
    guest.send('ready', true);
    assert.equal(await lateReady, 'wrong-phase');
    const unauthorizedReturn = nextError(guest);
    guest.send('return');
    assert.equal(await unauthorizedReturn, 'wrong-phase');
    await guest.leave();
    await waitFor(host, (state) => state.phase === 'results');
    assert.equal(host.state.game.winnerId, host.sessionId);
    assert.equal(host.state.resultReason, 'departure');
    host.send('return');
    await waitFor(host, (state) => state.phase === 'lobby');
    assert.equal(host.state.game.usedWordCount, 0);
    assert.equal(host.state.game.players.size, 0);
    assert.equal(host.state.players.get(host.sessionId)?.ready, false);
    guest = await join(host.roomId, 'Guest again');

    host.send('ready', true);
    guest.send('ready', true);
    await waitFor(host, (state) =>
      [...state.players.values()].every((player) => player.ready),
    );
    host.send('start');
    await waitFor(host, (state) => state.phase === 'playing', 2500);
    await guest.leave();
    await waitFor(host, (state) => state.phase === 'results');
    host.send('return');
    await waitFor(host, (state) => state.phase === 'lobby');
  },
);

test(
  'cancels countdown on abrupt drop, migrates host, and reports playing departure',
  { concurrency: false },
  async () => {
    const host = await create('Host');
    const guest = await join(host.roomId, 'Guest');
    host.send('ready', true);
    guest.send('ready', true);
    await waitFor(host, (state) =>
      [...state.players.values()].every((player) => player.ready),
    );
    host.send('start');
    await waitFor(host, (state) => state.phase === 'starting');
    guest.connection.close();
    await waitFor(
      host,
      (state) => state.phase === 'lobby' && state.players.size === 1,
    );
    assert.equal(host.state.hostId, host.sessionId);
    await new Promise((resolve) => setTimeout(resolve, 1200));
    assert.equal(host.state.phase, 'lobby');

    const guestAgain = await join(host.roomId, 'Guest again');
    host.send('ready', true);
    await waitFor(
      host,
      (state) => state.players.get(host.sessionId)?.ready === true,
    );
    const third = await join(host.roomId, 'Third');
    await waitFor(
      host,
      (state) =>
        state.players.size === 3 && !state.players.get(host.sessionId)?.ready,
    );
    host.connection.close();
    await waitFor(guestAgain, (state) => state.hostId === guestAgain.sessionId);
    guestAgain.send('ready', true);
    third.send('ready', true);
    await waitFor(guestAgain, (state) =>
      [...state.players.values()].every((player) => player.ready),
    );
    guestAgain.send('start');
    await waitFor(guestAgain, (state) => state.phase === 'playing', 2500);
    third.connection.close();
    await waitFor(guestAgain, (state) => state.phase === 'results');
    assert.equal(guestAgain.state.resultReason, 'departure');
  },
);

test(
  'rejects late joins and the ninth player when full',
  { concurrency: false },
  async () => {
    const host = await create('P0');
    const players = [host];
    for (let index = 1; index < 8; index += 1)
      players.push(await join(host.roomId, `P${index}`));
    await waitFor(host, (state) => state.players.size === 8);
    await assert.rejects(() => join(host.roomId, 'P8'));
    for (const player of players) player.send('ready', true);
    await waitFor(host, (state) =>
      [...state.players.values()].every((player) => player.ready),
    );
    host.send('start');
    await waitFor(host, (state) => state.phase === 'starting');
    await assert.rejects(() => join(host.roomId, 'late'));
  },
);

test('settings are host-only, validated, reset readiness and enforce adjustable capacity', async () => {
  const host = await create('Host');
  const guest = await join(host.roomId, 'Guest');
  const unauthorized = nextError(guest);
  guest.send('settings', defaultSettings);
  assert.equal(await unauthorized, 'host-only');
  const invalid = nextError(host);
  host.send('settings', { ...defaultSettings, startingLives: 10 });
  assert.equal(await invalid, 'invalid-payload');
  assert.equal(
    host.state.settings.startingLives,
    defaultSettings.startingLives,
  );
  host.send('ready', true);
  await waitFor(
    host,
    (state) => state.players.get(host.sessionId)?.ready === true,
  );
  host.send('settings', {
    ...defaultSettings,
    maxPlayers: 2,
    bonusAlphabet: 'BAAB',
  });
  await waitFor(host, (state) => state.settings.maxPlayers === 2);
  await waitFor(guest, (state) => state.settings.bonusAlphabet === 'ab');
  assert.equal(host.state.players.get(host.sessionId)?.ready, false);
  await assert.rejects(() => join(host.roomId, 'Too many'));
  host.send('settings', { ...defaultSettings, maxPlayers: 3 });
  await waitFor(host, (state) => state.settings.maxPlayers === 3);
  await join(host.roomId, 'Third');
  await waitFor(host, (state) => state.players.size === 3);
});

test('real clients validate words, synchronize turns and reach results through the server timer', async () => {
  const host = await create('Host');
  const guest = await join(host.roomId, 'Guest');
  host.send('settings', {
    ...defaultSettings,
    startingLives: 1,
    minTurnSeconds: 1,
    bonusAlphabet: '',
  });
  await waitFor(guest, (state) => state.settings.startingLives === 1);
  host.send('ready', true);
  guest.send('ready', true);
  await waitFor(host, (state) =>
    [...state.players.values()].every((player) => player.ready),
  );
  host.send('start');
  await waitFor(host, (state) => state.phase === 'playing');
  await waitFor(guest, (state) => state.phase === 'playing');
  const frozen = nextError(host);
  host.send('settings', defaultSettings);
  assert.equal(await frozen, 'wrong-phase');
  const invalid = nextError(host, 'word-error');
  host.send('word', { word: 'zzzzzzzzzzz', turnId: host.state.game.turnId });
  assert.equal(await invalid, 'invalid-word');
  const word = [...frenchDictionary().words].find((word) =>
    word.includes(host.state.game.prompt),
  );
  assert.ok(word);
  host.send('word', { word, turnId: host.state.game.turnId });
  await waitFor(guest, (state) => state.game.usedWordCount === 1);
  assert.equal(guest.state.game.activePlayerId, guest.sessionId);
  assert.equal(guest.state.game.lastWord, word);
  assert.equal(guest.state.game.players.get(host.sessionId)?.lastWord, word);
  const reused = nextError(guest, 'word-error');
  guest.send('word', { word, turnId: guest.state.game.turnId });
  assert.equal(await reused, 'word-used');
  await waitFor(host, (state) => state.phase === 'results', 18000);
  await waitFor(guest, (state) => state.phase === 'results');
  assert.equal(host.state.game.winnerId, host.sessionId);
  assert.equal(guest.state.game.players.get(guest.sessionId)?.lives, 0);
  const forbidden = nextError(guest);
  guest.send('return');
  assert.equal(await forbidden, 'host-only');
  host.send('return');
  await waitFor(guest, (state) => state.phase === 'lobby');
  assert.equal(guest.state.game.usedWordCount, 0);
  assert.equal(guest.state.game.players.size, 0);
});

test('spectators sit out: no ready, not counted to start, no seat in the game', async () => {
  const host = await create('Host');
  const watcher = await join(host.roomId, 'Watcher');
  watcher.send('spectate', true);
  await waitFor(host, (state) =>
    Boolean(state.players.get(watcher.sessionId)?.spectator),
  );

  // A spectator cannot be ready.
  watcher.send('ready', true);
  host.send('ready', true);
  await waitFor(host, (state) =>
    Boolean(state.players.get(host.sessionId)?.ready),
  );
  assert.equal(host.state.players.get(watcher.sessionId)?.ready, false);

  // Host plus a spectator is not enough players.
  const tooFew = nextError(host);
  host.send('start');
  assert.equal(await tooFew, 'not-enough-players');

  // With a second real player the round starts without the spectator's seat.
  const player = await join(host.roomId, 'Player');
  host.send('ready', true);
  player.send('ready', true);
  // Wait until the host sees all three members, not just an older snapshot.
  await waitFor(
    host,
    (state) =>
      state.players.size === 3 &&
      [...state.players.values()]
        .filter((member) => !member.spectator)
        .every((member) => member.ready),
  );
  host.send('start');
  await waitFor(host, (state) => state.phase === 'playing', 2500);
  assert.deepEqual(
    [...host.state.game.players.keys()].sort(),
    [host.sessionId, player.sessionId].sort(),
  );
});
