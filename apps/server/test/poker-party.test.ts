import assert from 'node:assert/strict';
import test from 'node:test';
import { defaultPokerSettings, type PokerRoomState } from '@but/poker-party';
import { useTestServer } from './lobbyClient.js';

const { create, join, waitFor, nextError } =
  useTestServer<PokerRoomState>('poker-party');

test('late Poker clients watch until the next round and final-round arrivals return as players', async () => {
  const host = await create('Host');
  const watcher = await join(host.roomId, 'Watcher');
  watcher.send('spectate', true);
  host.send('settings', {
    ...defaultPokerSettings,
    rounds: 2,
    bettingSeconds: 30,
  });
  await waitFor(
    host,
    (state) =>
      state.settings.rounds === 2 &&
      state.players.get(watcher.sessionId)?.spectator === true,
  );
  host.send('ready', true);
  await waitFor(
    host,
    (state) => state.players.get(host.sessionId)?.ready === true,
  );
  host.send('start');
  await waitFor(host, (state) => state.phase === 'playing');
  const late = await join(host.roomId, 'Late');
  assert.equal(late.state.players.get(late.sessionId)?.waitingForRound, true);
  assert.equal(late.state.game.players.has(late.sessionId), false);
  const rejected = nextError(late, 'poker-error');
  late.send('bet', { ante: 25 });
  assert.equal(await rejected, 'not-available');
  host.send('bet', { ante: 25 });
  await waitFor(host, (state) => state.game.stage === 'ultimate-preflop');
  host.send('action', 'raise4');
  await waitFor(late, (state) => state.game.round === 2, 15000);
  assert.equal(late.state.players.get(late.sessionId)?.spectator, false);
  assert.equal(late.state.players.get(late.sessionId)?.waitingForRound, false);
  assert.equal(late.state.players.get(watcher.sessionId)?.spectator, true);
  assert.equal(late.state.game.players.has(watcher.sessionId), false);
  assert.equal(
    JSON.parse(late.state.game.players.get(late.sessionId)!).chips,
    defaultPokerSettings.startingChips,
  );
  const final = await join(host.roomId, 'Final round');
  const gone = await join(host.roomId, 'Leaving');
  await gone.leave();
  await waitFor(host, (state) => !state.players.has(gone.sessionId));
  host.send('bet', { ante: 25 });
  late.send('bet', { ante: 25 });
  await waitFor(host, (state) => state.game.stage === 'ultimate-preflop');
  host.send('action', 'raise4');
  await waitFor(late, (state) => state.game.activePlayerId === late.sessionId);
  late.send('action', 'raise4');
  await waitFor(final, (state) => state.phase === 'results', 15000);
  assert.equal(final.state.game.players.has(final.sessionId), false);
  assert.equal(final.state.game.players.has(gone.sessionId), false);
  assert.ok(!JSON.parse(final.state.game.rankings).includes(final.sessionId));
  const after = await join(host.roomId, 'Results arrival');
  host.send('return');
  await waitFor(after, (state) => state.phase === 'lobby');
  assert.equal(after.state.players.get(after.sessionId)?.spectator, false);
  assert.equal(
    after.state.players.get(final.sessionId)?.waitingForRound,
    false,
  );
  assert.equal(after.state.players.get(final.sessionId)?.spectator, false);
  assert.equal(after.state.players.get(watcher.sessionId)?.spectator, true);
});

test('a solo Ultimate Poker room starts and accepts the full decision path', async () => {
  const host = await create('Solo');
  host.send('settings', {
    ...defaultPokerSettings,
    rounds: 1,
    bettingSeconds: 5,
  });
  await waitFor(host, (state) => state.settings.rounds === 1);
  host.send('ready', true);
  await waitFor(
    host,
    (state) => state.players.get(host.sessionId)?.ready === true,
  );
  host.send('start');
  await waitFor(host, (state) => state.phase === 'playing', 2500);
  host.send('bet', { ante: 25 });
  await waitFor(host, (state) => state.game.stage === 'ultimate-preflop');
  host.send('action', 'check');
  await waitFor(host, (state) => state.game.stage === 'ultimate-flop');
  host.send('action', 'check');
  await waitFor(host, (state) => state.game.stage === 'ultimate-river');
  host.send('action', 'raise1');
  await waitFor(host, (state) => state.phase === 'results', 15000);
  assert.equal(host.state.game.dealerHoleHidden, false);
});

test('Hold’em needs a second participant', async () => {
  const host = await create('Host');
  host.send('settings', { ...defaultPokerSettings, mode: 'holdem' });
  await waitFor(host, (state) => state.settings.mode === 'holdem');
  host.send('ready', true);
  await waitFor(
    host,
    (state) => state.players.get(host.sessionId)?.ready === true,
  );
  host.send('start');
  assert.equal(await nextError(host), 'not-enough-players');
});

test('the host can kick a player out of a running table', async () => {
  const host = await create('Host');
  const guest = await join(host.roomId, 'Guest');
  const kicked = nextError(guest, 'kicked');
  const closed = new Promise<number>((resolve) => guest.onLeave(resolve));
  guest.send('kick', host.sessionId);
  assert.equal(await nextError(guest), 'host-only');
  host.send('ready', true);
  guest.send('ready', true);
  await waitFor(
    host,
    (state) =>
      [...state.players.values()].filter((player) => player.ready).length === 2,
  );
  host.send('start');
  await waitFor(host, (state) => state.phase === 'playing', 2500);
  host.send('kick', guest.sessionId);
  await kicked;
  assert.equal(await closed, 4002);
  await waitFor(host, (state) => state.players.size === 1);
  // The match treats it as a departure: the seat stays, out of the hand.
  const seat = JSON.parse(host.state.game.players.get(guest.sessionId)!);
  assert.equal(seat.departed, true);
});
