import assert from 'node:assert/strict';
import test from 'node:test';
import {
  defaultBlackjackSettings,
  type BlackjackSettings,
  type Card,
} from '@but/blackjack-party';
import {
  BlackjackGame,
  handValue,
  parseBlackjackSettings,
  perfectPairs,
  twentyOnePlusThree,
} from '@but/blackjack-party/server';

const card = (rank: Card['rank'], suit: Card['suit']): Card => ({
  rank,
  suit,
});
const settings = (
  changes: Partial<BlackjackSettings> = {},
): BlackjackSettings => ({
  ...defaultBlackjackSettings,
  rounds: 1,
  startingChips: 100,
  minBet: 10,
  maxBet: 50,
  minSideBet: 5,
  maxSideBet: 10,
  ...changes,
});

test('aces count as 1 or 11 and soft hands are identified', () => {
  assert.deepEqual(handValue([card('A', 'spades'), card('6', 'clubs')]), {
    value: 17,
    soft: true,
  });
  assert.deepEqual(
    handValue([card('A', 'spades'), card('A', 'hearts'), card('9', 'clubs')]),
    { value: 21, soft: true },
  );
  assert.deepEqual(
    handValue([
      card('A', 'spades'),
      card('A', 'hearts'),
      card('9', 'clubs'),
      card('K', 'diamonds'),
    ]),
    { value: 21, soft: false },
  );
});

test('Perfect Pairs and 21+3 categories use the strongest matching hand', () => {
  assert.equal(
    perfectPairs([card('8', 'hearts'), card('8', 'hearts')]),
    'perfect',
  );
  assert.equal(
    perfectPairs([card('8', 'hearts'), card('8', 'diamonds')]),
    'colored',
  );
  assert.equal(
    perfectPairs([card('8', 'hearts'), card('8', 'clubs')]),
    'mixed',
  );
  assert.equal(
    twentyOnePlusThree([
      card('5', 'hearts'),
      card('5', 'hearts'),
      card('5', 'hearts'),
    ]),
    'suited-trips',
  );
  assert.equal(
    twentyOnePlusThree([
      card('Q', 'spades'),
      card('K', 'spades'),
      card('A', 'spades'),
    ]),
    'straight-flush',
  );
  assert.equal(
    twentyOnePlusThree([
      card('A', 'hearts'),
      card('2', 'clubs'),
      card('3', 'spades'),
    ]),
    'straight',
  );
  assert.equal(
    twentyOnePlusThree([
      card('2', 'clubs'),
      card('7', 'clubs'),
      card('K', 'clubs'),
    ]),
    'flush',
  );
});

test('dealer hole card is private until reveal and Blackjack uses configured payout', () => {
  const game = new BlackjackGame(
    ['a', 'b'],
    settings({ blackjackPayout: 1.5 }),
    0,
    () => 0,
    [
      card('10', 'hearts'),
      card('A', 'spades'),
      card('6', 'clubs'),
      card('8', 'diamonds'),
      card('K', 'diamonds'),
      card('10', 'hearts'),
      card('5', 'clubs'),
    ],
  );
  game.placeBet('a', { main: 10, perfectPairs: 0, twentyOnePlusThree: 0 }, 1);
  game.placeBet('b', { main: 10, perfectPairs: 0, twentyOnePlusThree: 0 }, 1);
  assert.equal(game.stage, 'playing');
  assert.equal(game.dealerCardCount, 2);
  assert.deepEqual(game.dealerCards, [card('6', 'clubs')]);
  assert.equal(game.publicPlayer('b').hands[0]!.status, 'blackjack');
  assert.equal(game.act('a', 'stand', 2), null);
  assert.equal(game.stage, 'dealer');
  assert.equal(game.dealerHoleHidden, false);
  assert.equal(game.dealerCards.length, 2);
  game.expire(game.deadline);
  assert.equal(game.dealerCards.length, 3);
  game.expire(game.deadline);
  assert.equal(game.stage, 'round-results');
  assert.equal(game.players.get('a')!.chips, 90);
  assert.equal(game.players.get('b')!.chips, 115);
  assert.equal(game.players.get('b')!.blackjacks, 1);
  game.expire(game.deadline);
  assert.equal(game.stage, 'complete');
  assert.equal(game.winnerId, 'b');
});

test('split hands, double down, normal wins, and split wins pay correctly', () => {
  const game = new BlackjackGame(
    ['a', 'b'],
    settings({ maxSplits: 1 }),
    0,
    () => 0,
    [
      card('8', 'hearts'),
      card('10', 'clubs'),
      card('6', 'clubs'),
      card('8', 'diamonds'),
      card('7', 'diamonds'),
      card('10', 'hearts'),
      card('3', 'spades'),
      card('2', 'clubs'),
      card('10', 'diamonds'),
      card('10', 'spades'),
      card('3', 'hearts'),
    ],
  );
  game.placeBet('a', { main: 10, perfectPairs: 0, twentyOnePlusThree: 0 }, 1);
  game.placeBet('b', { main: 10, perfectPairs: 0, twentyOnePlusThree: 0 }, 1);
  assert.equal(game.act('a', 'split', 2), null);
  assert.equal(game.publicPlayer('a').hands.length, 2);
  assert.equal(game.act('a', 'double', 3), null);
  assert.equal(game.activeHandIndex, 1);
  assert.equal(game.act('a', 'hit', 4), null);
  assert.equal(game.publicPlayer('a').hands[1]!.value, 20);
  assert.equal(game.act('a', 'stand', 5), null);
  assert.equal(game.act('b', 'stand', 6), null);
  game.expire(game.deadline);
  game.expire(game.deadline);
  const player = game.players.get('a')!;
  assert.equal(player.chips, 130);
  assert.equal(player.doubleDownWins, 1);
  assert.equal(player.splitWins, 2);
  assert.deepEqual(
    player.hands.map((hand) => hand.outcome),
    ['win', 'win'],
  );
});

test('configurable side-bet tables credit stake plus odds once', () => {
  const game = new BlackjackGame(
    ['a', 'b'],
    settings({
      perfectPairPayout: 20,
      twentyOnePlusThreeSuitedTripsPayout: 50,
    }),
    0,
    () => 0,
    [
      card('5', 'hearts'),
      card('10', 'clubs'),
      card('5', 'hearts'),
      card('5', 'hearts'),
      card('7', 'diamonds'),
      card('9', 'spades'),
    ],
  );
  game.placeBet('a', { main: 10, perfectPairs: 5, twentyOnePlusThree: 5 }, 1);
  game.placeBet('b', { main: 10, perfectPairs: 0, twentyOnePlusThree: 0 }, 1);
  const player = game.players.get('a')!;
  assert.equal(player.perfectPairsResult, 'perfect');
  assert.equal(player.twentyOnePlusThreeResult, 'suited-trips');
  assert.equal(player.perfectPairsPayout, 105);
  assert.equal(player.twentyOnePlusThreePayout, 255);
  assert.equal(player.chips, 440);
  assert.equal(player.perfectPairsWins, 1);
  assert.equal(player.twentyOnePlusThreeWins, 1);
});

test('bet, action, settings, and rebuy boundaries are enforced', () => {
  assert.deepEqual(
    parseBlackjackSettings(defaultBlackjackSettings),
    defaultBlackjackSettings,
  );
  assert.equal(
    parseBlackjackSettings({ ...defaultBlackjackSettings, minBet: 500 }),
    null,
  );
  assert.equal(
    parseBlackjackSettings({ ...defaultBlackjackSettings, rounds: 0 }),
    null,
  );
  assert.equal(
    parseBlackjackSettings({ ...defaultBlackjackSettings, unknown: true }),
    null,
  );
  const game = new BlackjackGame(['a', 'b'], settings(), 0, () => 0);
  assert.equal(
    game.placeBet('a', { main: 9, perfectPairs: 0, twentyOnePlusThree: 0 }, 1),
    'invalid-bet',
  );
  game.players.get('a')!.chips = 0;
  assert.equal(game.canRebuy('a'), null);
  assert.equal(game.grantRebuy('a'), null);
  assert.equal(game.players.get('a')!.chips, settings().rebuyChipAmount);
  assert.equal(game.players.get('a')!.rebuys, 1);
  assert.equal(
    game.players.get('a')!.globalCurrencySpentOnRebuys,
    settings().rebuyCost,
  );
});
