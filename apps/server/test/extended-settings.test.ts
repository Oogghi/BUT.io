import assert from 'node:assert/strict';
import test from 'node:test';
import {
  blackjackSettingsLimits,
  defaultBlackjackSettings,
  type Card,
} from '@but/blackjack-party';
import {
  BlackjackGame,
  parseBlackjackSettings,
} from '@but/blackjack-party/server';
import { defaultPokerSettings, pokerSettingsLimits } from '@but/poker-party';
import { PokerGame, parsePokerSettings } from '@but/poker-party/server';
import { bombPartySettingsLimits, defaultSettings } from '@but/bomb-party';
import { parseSettings } from '@but/bomb-party/server';

test('requested table defaults are valid on the server', () => {
  assert.equal(defaultBlackjackSettings.rounds, 20);
  assert.equal(defaultBlackjackSettings.maxBet, 500);
  assert.equal(defaultBlackjackSettings.maxSplits, 10);
  assert.equal(defaultPokerSettings.rounds, 20);
  assert.deepEqual(
    parseBlackjackSettings(defaultBlackjackSettings),
    defaultBlackjackSettings,
  );
  assert.deepEqual(
    parsePokerSettings(defaultPokerSettings),
    defaultPokerSettings,
  );
});

const maximums = (limits: Record<string, { min: number; max: number }>) =>
  Object.fromEntries(
    Object.entries(limits).map(([key, { max }]) => [key, max]),
  );

for (const [name, defaults, limits, parse, overrides] of [
  [
    'Blackjack',
    defaultBlackjackSettings,
    blackjackSettingsLimits,
    parseBlackjackSettings,
    {},
  ],
  [
    'Poker',
    defaultPokerSettings,
    pokerSettingsLimits,
    parsePokerSettings,
    { ante: 250000 },
  ],
  [
    'Bomb Party',
    defaultSettings,
    bombPartySettingsLimits,
    (value: unknown) => parseSettings(value, 2),
    {},
  ],
] as const) {
  test(`${name} accepts extended bounds and rejects invalid numeric settings`, () => {
    const extended = { ...defaults, ...maximums(limits), ...overrides };
    assert.deepEqual(parse(extended), extended);
    for (const [key, { min, max }] of Object.entries(limits)) {
      for (const value of [
        min - 1,
        max + 1,
        max - 0.5,
        NaN,
        Infinity,
        String(max),
      ]) {
        assert.equal(
          parse({ ...extended, [key]: value }),
          null,
          `${key}=${value}`,
        );
      }
    }
  });
}

test('15 Blackjack splits produce 16 playable hands and still enforce the configured limit', () => {
  const ten: Card = { rank: '10', suit: 'hearts' };
  const game = new BlackjackGame(
    ['a'],
    {
      ...defaultBlackjackSettings,
      rounds: 50,
      maxSplits: 15,
    },
    0,
    () => 0,
    Array.from({ length: 80 }, () => ({ ...ten })),
  );
  assert.equal(
    game.placeBet('a', { main: 25, perfectPairs: 0, twentyOnePlusThree: 0 }, 1),
    null,
  );
  for (let split = 1; split <= 15; split++) {
    assert.equal(game.act('a', 'split', 2), null);
    assert.equal(game.publicPlayer('a').hands.length, split + 1);
  }
  assert.equal(game.players.get('a')!.chips, 600);
  assert.equal(game.act('a', 'split', 2), 'split-not-allowed');
  for (let hand = 0; hand < 16; hand++) {
    assert.equal(game.activeHandIndex, hand);
    assert.equal(game.act('a', 'stand', 3), null);
  }
  for (let step = 0; step < 20 && game.stage !== 'round-results'; step++)
    game.expire(game.deadline);
  assert.equal(game.stage, 'round-results');
  assert.equal(game.players.get('a')!.chips, 1000);
});

test('Blackjack completes all 50 configured rounds', () => {
  const game = new BlackjackGame(
    ['a'],
    {
      ...defaultBlackjackSettings,
      rounds: 50,
      startingChips: 1000000,
    },
    0,
    () => 0.37,
  );
  for (let step = 0; step < 2000 && game.stage !== 'complete'; step++) {
    if (game.stage === 'betting')
      game.placeBet(
        'a',
        { main: 25, perfectPairs: 0, twentyOnePlusThree: 0 },
        game.deadline - 1,
      );
    game.expire(game.deadline);
  }
  assert.equal(game.stage, 'complete');
  assert.equal(game.round, 50);
  assert.equal(game.players.get('a')!.roundsPlayed, 50);
});

for (const mode of ['ultimate', 'holdem'] as const) {
  test(`${mode} completes all 50 configured rounds`, () => {
    const game = new PokerGame(
      ['a', 'b'],
      {
        ...defaultPokerSettings,
        mode,
        rounds: 50,
        startingChips: 1000000,
      },
      0,
      () => 0.37,
    );
    for (let step = 0; step < 2000 && game.stage !== 'complete'; step++)
      game.expire(game.deadline);
    assert.equal(game.stage, 'complete');
    assert.equal(game.round, 50);
  });
}
