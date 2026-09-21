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

test('the dealer shows one card until everyone has acted, then draws', () => {
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
  // One card, face up, and no second one waiting face down behind it.
  assert.equal(game.dealerCardCount, 1);
  assert.deepEqual(game.dealerCards, [card('6', 'clubs')]);
  assert.equal(game.publicPlayer('b').hands[0]!.status, 'blackjack');
  assert.equal(game.act('a', 'stand', 2), null);
  // Everyone has acted, so the dealer takes their second card now.
  assert.equal(game.stage, 'dealer');
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
      card('9', 'diamonds'),
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

test('a lone player holds the table against the dealer', () => {
  const game = new BlackjackGame(['a'], settings(), 0, () => 0, [
    card('10', 'hearts'),
    card('6', 'clubs'),
    card('9', 'diamonds'),
    card('10', 'spades'),
    card('K', 'diamonds'),
  ]);
  // The only locked bet is the whole table, so the deal starts straight away.
  assert.equal(
    game.placeBet('a', { main: 10, perfectPairs: 0, twentyOnePlusThree: 0 }, 1),
    null,
  );
  assert.equal(game.stage, 'playing');
  assert.equal(game.activePlayerId, 'a');
  assert.equal(game.publicPlayer('a').hands[0]!.value, 19);

  assert.equal(game.act('a', 'stand', 2), null);
  assert.equal(game.stage, 'dealer');
  game.expire(game.deadline); // 16, so the dealer draws and busts on 26
  game.expire(game.deadline);
  assert.equal(game.stage, 'round-results');
  assert.equal(game.players.get('a')!.chips, 110);

  game.expire(game.deadline);
  assert.equal(game.stage, 'complete');
  assert.equal(game.winnerId, 'a');
});

test('shuffling every round returns played cards; off, the shoe wears down', () => {
  const play = (shuffle: boolean) => {
    const game = new BlackjackGame(
      ['a'],
      settings({ rounds: 3, shuffle, decks: 1 }),
      0,
      () => 0,
    );
    const bet = { main: 10, perfectPairs: 0, twentyOnePlusThree: 0 };
    game.placeBet('a', bet, 1);
    const afterFirstDeal = game.shoeUsed;
    while (game.stage !== 'round-results') game.expire(game.deadline);
    game.expire(game.deadline);
    return { afterFirstDeal, atNextRound: game.shoeUsed };
  };

  // Shuffling on rebuilds the shoe, so the next round starts from a full one.
  const shuffled = play(true);
  assert.ok(shuffled.afterFirstDeal > 0);
  assert.equal(shuffled.atNextRound, 0);

  // Off, the cards stay spent and the next round deals deeper into the same shoe.
  const shoe = play(false);
  assert.ok(shoe.atNextRound >= shoe.afterFirstDeal);
});

test('the shoe reports its depth so the table can show a discard tray', () => {
  const dealt = (shuffle: boolean) => {
    const game = new BlackjackGame(
      ['a'],
      settings({ shuffle, decks: 1 }),
      0,
      () => 0,
    );
    game.placeBet('a', { main: 10, perfectPairs: 0, twentyOnePlusThree: 0 }, 1);
    return game;
  };

  // Shuffling on rebuilds the shoe each round, so nothing is ever left spent.
  const shuffled = dealt(true);
  assert.equal(shuffled.shoeUsed + shuffled.shoeRemaining, 52);

  const shoe = dealt(false);
  assert.ok(shoe.shoeUsed > 0);
  assert.equal(shoe.shoeRemaining, 52 - shoe.shoeUsed);
});

test('any two ten-value cards split, but Perfect Pairs still needs a real pair', () => {
  const game = new BlackjackGame(
    ['a'],
    settings({ maxSplits: 1, perfectPairPayout: 20 }),
    0,
    () => 0,
    [
      card('Q', 'spades'),
      card('7', 'clubs'),
      card('J', 'clubs'),
      card('9', 'diamonds'),
      card('4', 'hearts'),
      card('5', 'hearts'),
    ],
  );
  game.placeBet('a', { main: 10, perfectPairs: 5, twentyOnePlusThree: 0 }, 1);

  // Queen and jack are both worth ten, so the table treats them as a pair to split.
  const hand = game.publicPlayer('a').hands[0]!;
  assert.equal(hand.value, 20);
  assert.equal(hand.canSplit, true);
  assert.equal(game.act('a', 'split', 2), null);
  assert.equal(game.publicPlayer('a').hands.length, 2);

  // Perfect Pairs pays on matching ranks only, so a queen with a jack wins nothing.
  assert.equal(game.players.get('a')!.perfectPairsPayout, 0);
});

test('a player can keep splitting up to the table limit', () => {
  const game = new BlackjackGame(
    ['a'],
    settings({ startingChips: 1000, maxSplits: 4 }),
    0,
    () => 0,
    [
      card('Q', 'spades'),
      card('6', 'clubs'),
      card('J', 'clubs'),
      // Every split deals the two new hands a card; a ten keeps the first splittable.
      card('K', 'diamonds'),
      card('9', 'hearts'),
      card('10', 'spades'),
      card('8', 'clubs'),
      card('10', 'hearts'),
      card('7', 'clubs'),
      card('4', 'diamonds'),
      card('3', 'spades'),
      card('5', 'clubs'),
      card('2', 'hearts'),
    ],
  );
  game.placeBet('a', { main: 10, perfectPairs: 0, twentyOnePlusThree: 0 }, 1);

  for (let split = 1; split <= 4; split += 1) {
    assert.equal(game.act('a', 'split', 2), null, `split ${split}`);
    assert.equal(game.publicPlayer('a').hands.length, split + 1);
  }
  // Four splits is the limit, so a fifth is refused even on another pair.
  assert.equal(game.act('a', 'split', 2), 'split-not-allowed');
});
