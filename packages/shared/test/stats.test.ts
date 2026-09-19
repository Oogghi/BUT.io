import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  accuracy,
  aggregateBombPartyStats,
  aggregateBlackjackStats,
  aggregateTankArenaStats,
  combineGlobalStats,
  winRate,
  type BombPartyMatchResult,
  type BlackjackMatchResult,
  type TankArenaMatchResult,
} from '../src/stats.ts';

const blackjackMatches: readonly BlackjackMatchResult[] = [
  {
    gameId: 'blackjack-party',
    matchId: 'blackjack-1',
    playedAt: '2026-09-19T20:00:00.000Z',
    durationSeconds: 300,
    players: [
      {
        playerId: 'alice',
        outcome: 'win',
        stats: {
          roundsPlayed: 5,
          roundsWon: 3,
          blackjacks: 1,
          busts: 2,
          doubleDownWins: 1,
          splitWins: 1,
          perfectPairsWins: 1,
          twentyOnePlusThreeWins: 0,
          highestEndingChipBalance: 1400,
          rebuys: 1,
          globalCurrencySpentOnRebuys: 50,
        },
      },
    ],
  },
  {
    gameId: 'blackjack-party',
    matchId: 'blackjack-2',
    playedAt: '2026-09-19T21:00:00.000Z',
    durationSeconds: 240,
    players: [
      {
        playerId: 'alice',
        outcome: 'loss',
        stats: {
          roundsPlayed: 4,
          roundsWon: 1,
          blackjacks: 2,
          busts: 1,
          doubleDownWins: 0,
          splitWins: 0,
          perfectPairsWins: 0,
          twentyOnePlusThreeWins: 1,
          highestEndingChipBalance: 900,
          rebuys: 0,
          globalCurrencySpentOnRebuys: 0,
        },
      },
    ],
  },
];

const bombPartyMatches: readonly BombPartyMatchResult[] = [
  {
    gameId: 'bomb-party',
    matchId: 'bp-1',
    playedAt: '2026-09-18T20:00:00.000Z',
    durationSeconds: 120,
    players: [
      {
        playerId: 'alice',
        outcome: 'win',
        stats: { wordsPlayed: 8, wordsAccepted: 7, livesLost: 1 },
      },
    ],
  },
  {
    gameId: 'bomb-party',
    matchId: 'bp-2',
    playedAt: '2026-09-18T20:03:00.000Z',
    durationSeconds: 90,
    players: [
      {
        playerId: 'alice',
        outcome: 'loss',
        stats: { wordsPlayed: 5, wordsAccepted: 4, livesLost: 2 },
      },
      {
        playerId: 'bob',
        outcome: 'win',
        stats: { wordsPlayed: 6, wordsAccepted: 6, livesLost: 0 },
      },
    ],
  },
];

const tankArenaMatches: readonly TankArenaMatchResult[] = [
  {
    gameId: 'tank-arena',
    matchId: 'tank-1',
    playedAt: '2026-09-18T21:00:00.000Z',
    durationSeconds: 240,
    players: [
      {
        playerId: 'alice',
        outcome: 'win',
        stats: { shotsFired: 10, shotsHit: 7, damageDealt: 182 },
      },
    ],
  },
];

test('aggregates only the selected player and keeps raw counters', () => {
  assert.deepEqual(aggregateBombPartyStats(bombPartyMatches, 'alice'), {
    gamesPlayed: 2,
    wins: 1,
    losses: 1,
    playtimeSeconds: 210,
    wordsPlayed: 13,
    wordsAccepted: 11,
    livesLost: 3,
  });
  assert.deepEqual(aggregateBombPartyStats(bombPartyMatches, 'nobody'), {
    gamesPlayed: 0,
    wins: 0,
    losses: 0,
    playtimeSeconds: 0,
    wordsPlayed: 0,
    wordsAccepted: 0,
    livesLost: 0,
  });
});

test('supports per-game stat counters without sharing game state', () => {
  assert.deepEqual(aggregateTankArenaStats(tankArenaMatches, 'alice'), {
    gamesPlayed: 1,
    wins: 1,
    losses: 0,
    playtimeSeconds: 240,
    shotsFired: 10,
    shotsHit: 7,
    damageDealt: 182,
  });
});

test('Blackjack sums counters but keeps the highest ending chip balance', () => {
  assert.deepEqual(aggregateBlackjackStats(blackjackMatches, 'alice'), {
    gamesPlayed: 2,
    wins: 1,
    losses: 1,
    playtimeSeconds: 540,
    roundsPlayed: 9,
    roundsWon: 4,
    blackjacks: 3,
    busts: 3,
    doubleDownWins: 1,
    splitWins: 1,
    perfectPairsWins: 1,
    twentyOnePlusThreeWins: 1,
    highestEndingChipBalance: 1400,
    rebuys: 1,
    globalCurrencySpentOnRebuys: 50,
  });
});

test('derives percentages safely and combines global totals', () => {
  assert.equal(winRate({ gamesPlayed: 3, wins: 2 }), 2 / 3);
  assert.equal(winRate({ gamesPlayed: 0, wins: 0 }), 0);
  assert.equal(accuracy({ shotsFired: 10, shotsHit: 7 }), 0.7);
  assert.equal(accuracy({ shotsFired: 0, shotsHit: 0 }), 0);
  assert.deepEqual(
    combineGlobalStats(
      { gamesPlayed: 2, wins: 1, losses: 1, playtimeSeconds: 210 },
      { gamesPlayed: 1, wins: 1, losses: 0, playtimeSeconds: 240 },
    ),
    { gamesPlayed: 3, wins: 2, losses: 1, playtimeSeconds: 450 },
  );
});
