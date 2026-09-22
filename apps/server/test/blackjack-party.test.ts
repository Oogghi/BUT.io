import assert from 'node:assert/strict';
import test from 'node:test';
import {
  defaultBlackjackSettings,
  type BlackjackRoomState,
} from '@but/blackjack-party';
import { useTestServer } from './lobbyClient.js';

const { create, join, waitFor, nextError } =
  useTestServer<BlackjackRoomState>('blackjack-party');

test('extended settings reach Blackjack guests and new rooms use requested defaults', async () => {
  const host = await create('Host');
  assert.equal(host.state.settings.rounds, 20);
  assert.equal(host.state.settings.maxBet, 500);
  assert.equal(host.state.settings.maxSplits, 10);
  const guest = await join(host.roomId, 'Guest');
  host.send('settings', {
    ...defaultBlackjackSettings,
    rounds: 50,
    maxSplits: 15,
    decks: 32,
    bettingSeconds: 240,
    actionSeconds: 240,
    maxRebuys: 100,
    startingChips: 1000000,
    maxBet: 1000000,
    maxSideBet: 1000000,
  });
  await waitFor(guest, (state) => state.settings.rounds === 50);
  assert.equal(guest.state.settings.maxSplits, 15);
  assert.equal(guest.state.settings.decks, 32);
  assert.equal(guest.state.settings.bettingSeconds, 240);
  assert.equal(guest.state.settings.actionSeconds, 240);
  assert.equal(guest.state.settings.maxRebuys, 100);
  assert.equal(guest.state.settings.maxBet, 1000000);
  assert.equal(guest.state.settings.maxSideBet, 1000000);
});

test('late Blackjack client watches, then joins round two; voluntary spectators stay out', async () => {
  const host = await create('Host');
  const watcher = await join(host.roomId, 'Watcher');
  watcher.send('spectate', true);
  host.send('settings', {
    ...defaultBlackjackSettings,
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
  assert.equal(late.state.players.get(late.sessionId)?.spectator, true);
  assert.equal(late.state.game.players.has(late.sessionId), false);
  const rejected = nextError(late, 'blackjack-error');
  late.send('bet', { main: 25, perfectPairs: 0, twentyOnePlusThree: 0 });
  assert.equal(await rejected, 'not-betting');
  const gone = await join(host.roomId, 'Leaving');
  await gone.leave();
  await waitFor(host, (state) => !state.players.has(gone.sessionId));
  host.send('bet', { main: 0, perfectPairs: 0, twentyOnePlusThree: 0 });
  await waitFor(late, (state) => state.game.round === 2, 15000);
  assert.equal(late.state.players.get(late.sessionId)?.spectator, false);
  assert.equal(late.state.players.get(late.sessionId)?.waitingForRound, false);
  assert.equal(late.state.players.get(watcher.sessionId)?.spectator, true);
  assert.equal(late.state.game.players.has(watcher.sessionId), false);
  assert.equal(late.state.game.players.has(gone.sessionId), false);
  assert.equal(
    JSON.parse(late.state.game.players.get(late.sessionId)!).chips,
    defaultBlackjackSettings.startingChips,
  );
  late.send('bet', { main: 25, perfectPairs: 0, twentyOnePlusThree: 0 });
  await waitFor(
    late,
    (state) =>
      JSON.parse(state.game.players.get(late.sessionId)!).bet.main === 25,
  );
});

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
