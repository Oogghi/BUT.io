import assert from 'node:assert/strict';
import test from 'node:test';
import { defaultPokerSettings, type PokerRoomState } from '@but/poker-party';
import { useTestServer } from './lobbyClient.js';

const { create, waitFor, nextError } =
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
  await waitFor(host, (state) => state.phase === 'results', 12000);
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
