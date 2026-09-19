import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  formatStatPercent,
  gameAccuracy,
  gameWinRate,
  metric,
  type GameStatsView,
} from '../src/supabaseData.ts';

test('derives JSONB-backed game metrics without persisting percentages', () => {
  const tank: GameStatsView = {
    userId: 'player-1',
    gameId: 'tank-arena',
    gamesPlayed: 5,
    wins: 3,
    losses: 2,
    playtimeSeconds: 600,
    metrics: { shots_fired: 10, shots_hit: 7, kills: 4 },
  };

  assert.equal(gameWinRate(tank), 0.6);
  assert.equal(gameAccuracy(tank), 0.7);
  assert.equal(metric(tank.metrics, 'missing', 'kills'), 4);
  assert.equal(formatStatPercent(gameAccuracy(tank)), '70%');
});

test('zero-game stats produce safe derived values', () => {
  const empty: GameStatsView = {
    userId: 'player-1',
    gameId: 'bomb-party',
    gamesPlayed: 0,
    wins: 0,
    losses: 0,
    playtimeSeconds: 0,
    metrics: {},
  };

  assert.equal(gameWinRate(empty), 0);
  assert.equal(gameAccuracy(empty), 0);
  assert.equal(formatStatPercent(0), '0%');
});
