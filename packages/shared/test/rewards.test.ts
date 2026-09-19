import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  calculateMatchReward,
  type BombPartyMatchResult,
  type BlackjackMatchResult,
  type TankArenaMatchResult,
} from '../src/index.ts';

const bombParty: BombPartyMatchResult = {
  gameId: 'bomb-party',
  matchId: 'bp-reward-1',
  playedAt: '2026-09-19T10:00:00.000Z',
  durationSeconds: 120,
  players: [],
};

const tankArena: TankArenaMatchResult = {
  gameId: 'tank-arena',
  matchId: 'tank-reward-1',
  playedAt: '2026-09-19T10:00:00.000Z',
  durationSeconds: 120,
  players: [],
};

const blackjack: BlackjackMatchResult = {
  gameId: 'blackjack-party',
  matchId: 'blackjack-reward-1',
  playedAt: '2026-09-19T10:00:00.000Z',
  durationSeconds: 120,
  players: [],
};

test('Bomb Party rewards participation, wins, words and streaks up to the cap', () => {
  const reward = calculateMatchReward(bombParty, {
    playerId: 'alice',
    outcome: 'win',
    stats: { wordsAccepted: 14, bestStreak: 12 },
  });

  assert.equal(reward.total, 50);
  assert.deepEqual(reward.breakdown, [
    { kind: 'participation', amount: 5 },
    { kind: 'win', amount: 25 },
    { kind: 'bomb-words', amount: 10 },
    { kind: 'bomb-streak', amount: 10 },
  ]);
});

test('Tank Arena rewards combat performance without requiring a win', () => {
  const reward = calculateMatchReward(tankArena, {
    playerId: 'alice',
    outcome: 'loss',
    stats: { kills: 3, damageDealt: 620, shotsFired: 10, shotsHit: 6 },
  });

  assert.equal(reward.total, 25);
  assert.deepEqual(reward.breakdown, [
    { kind: 'participation', amount: 5 },
    { kind: 'tank-kills', amount: 9 },
    { kind: 'tank-damage', amount: 6 },
    { kind: 'tank-accuracy', amount: 5 },
  ]);
});

test('Blackjack rewards the match result without treating card stats as tank combat', () => {
  const reward = calculateMatchReward(blackjack, {
    playerId: 'alice',
    outcome: 'win',
    stats: { blackjacks: 4, roundsWon: 5 },
  });
  assert.deepEqual(reward, {
    total: 30,
    breakdown: [
      { kind: 'participation', amount: 5 },
      { kind: 'win', amount: 25 },
    ],
  });
});
