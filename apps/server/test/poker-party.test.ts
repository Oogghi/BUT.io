import assert from 'node:assert/strict';
import test from 'node:test';
import { defaultPokerSettings, type PokerRoomState } from '@but/poker-party';
import { useTestServer } from './lobbyClient.js';

const { create, join, waitFor, nextError } =
  useTestServer<PokerRoomState>('poker-party');

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
