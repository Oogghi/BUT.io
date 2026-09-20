import assert from 'node:assert/strict';
import test from 'node:test';
import {
  defaultBlackjackSettings,
  type BlackjackRoomState,
} from '@but/blackjack-party';
import { useTestServer } from './lobbyClient.js';

const { create, join, waitFor } =
  useTestServer<BlackjackRoomState>('blackjack-party');

test('two real clients finish a complete authoritative Blackjack match', async () => {
  const host = await create('Host');
  const guest = await join(host.roomId, 'Guest');
  host.send('settings', {
    ...defaultBlackjackSettings,
    rounds: 1,
    startingChips: 100,
    minBet: 10,
    maxBet: 50,
    bettingSeconds: 5,
    actionSeconds: 5,
    sideBetsEnabled: false,
    perfectPairsEnabled: false,
    twentyOnePlusThreeEnabled: false,
  });
  await waitFor(guest, (state) => state.settings.rounds === 1);
  host.send('ready', true);
  guest.send('ready', true);
  await waitFor(host, (state) =>
    [...state.players.values()].every((player) => player.ready),
  );
  host.send('start');
  await waitFor(host, (state) => state.phase === 'playing', 2500);
  host.send('bet', { main: 10, perfectPairs: 0, twentyOnePlusThree: 0 });
  guest.send('bet', { main: 10, perfectPairs: 0, twentyOnePlusThree: 0 });
  await waitFor(host, (state) => state.game.stage !== 'betting');

  for (
    let safety = 0;
    safety < 8 && host.state.phase === 'playing';
    safety += 1
  ) {
    if (host.state.game.stage === 'playing') {
      const active = host.state.game.activePlayerId;
      (active === host.sessionId ? host : guest).send('action', 'stand');
      await waitFor(
        host,
        (state) =>
          state.phase === 'results' ||
          state.game.stage !== 'playing' ||
          state.game.activePlayerId !== active,
        3000,
      );
    } else {
      const stage = host.state.game.stage;
      await waitFor(
        host,
        (state) => state.phase === 'results' || state.game.stage !== stage,
        5000,
      );
    }
  }
  await waitFor(host, (state) => state.phase === 'results', 8000);
  await waitFor(guest, (state) => state.phase === 'results');
  assert.equal(JSON.parse(host.state.game.rankings).length, 2);
  assert.ok(host.state.game.winnerId);
  assert.equal(host.state.game.dealerHoleHidden, false);
  for (const value of host.state.game.players.values()) {
    const player = JSON.parse(value) as { rank: number; roundsPlayed: number };
    assert.ok(player.rank >= 1);
    assert.equal(player.roundsPlayed, 1);
  }
});
