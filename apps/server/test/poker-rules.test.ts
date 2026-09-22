import assert from 'node:assert/strict';
import test from 'node:test';
import {
  PokerGame,
  evaluateBest,
  parsePokerSettings,
  ultimateReturns,
} from '@but/poker-party/server';
import {
  defaultPokerSettings,
  type Card,
  type PokerSettings,
} from '@but/poker-party';

const card = (rank: Card['rank'], suit: Card['suit']): Card => ({ rank, suit });
const settings = (changes: Partial<PokerSettings> = {}): PokerSettings => ({
  ...defaultPokerSettings,
  rounds: 1,
  bettingSeconds: 5,
  ...changes,
});

test('best hand evaluator ranks a royal flush above a full house', () => {
  const royal = evaluateBest([
    card('A', 'spades'),
    card('K', 'spades'),
    card('Q', 'spades'),
    card('J', 'spades'),
    card('10', 'spades'),
    card('2', 'clubs'),
    card('3', 'diamonds'),
  ]);
  const full = evaluateBest([
    card('A', 'clubs'),
    card('A', 'diamonds'),
    card('A', 'hearts'),
    card('K', 'clubs'),
    card('K', 'diamonds'),
  ]);
  assert.equal(royal.category, 8);
  assert.equal(full.category, 6);
});

test('Ultimate Poker checks to the river, where only play ×1 or fold remain', () => {
  const game = new PokerGame(['solo'], settings(), 0, () => 0.42);
  assert.equal(game.placeBet('solo', { ante: 25 }, 1), null);
  assert.deepEqual(game.publicPlayer('solo').bet, {
    ante: 25,
    blind: 25,
    play: 0,
  });
  assert.equal(game.stage, 'ultimate-preflop');
  assert.equal(game.act('solo', 'check', 2), null);
  assert.equal(game.stage, 'ultimate-flop');
  assert.equal(game.communityCards.length, 3);
  assert.equal(game.act('solo', 'check', 3), null);
  assert.equal(game.stage, 'ultimate-river');
  assert.equal(game.communityCards.length, 5);
  assert.equal(game.act('solo', 'check', 4), 'invalid-action');
  assert.equal(game.act('solo', 'raise1', 4), null);
  assert.equal(game.stage, 'showdown');
  assert.equal(game.publicPlayer('solo').totalBet, 75);
});

test('an Ultimate Poker play bet skips the remaining decisions', () => {
  const game = new PokerGame(['a', 'b'], settings(), 0, () => 0.42);
  game.placeBet('a', { ante: 25 }, 1);
  game.placeBet('b', { ante: 25 }, 1);
  assert.equal(game.act('a', 'raise4', 2), null);
  assert.equal(game.activePlayerId, 'b');
  assert.equal(game.act('b', 'check', 3), null);
  assert.equal(game.stage, 'ultimate-flop');
  assert.equal(game.activePlayerId, 'b');
  assert.equal(game.act('b', 'fold', 4), 'invalid-action');
  game.act('b', 'check', 4);
  game.act('b', 'fold', 5);
  assert.equal(game.stage, 'showdown');
  assert.equal(game.publicPlayer('b').payout, 0);
});

test('with every hand visible, Ultimate Poker players decide at the same time', () => {
  const game = new PokerGame(
    ['a', 'b'],
    settings({ showAllCards: true }),
    0,
    () => 0.42,
  );
  game.placeBet('a', { ante: 25 }, 1);
  game.placeBet('b', { ante: 25 }, 1);
  assert.equal(game.activePlayerId, '');
  // Either player may go first; the street waits for both.
  assert.equal(game.act('b', 'check', 2), null);
  assert.equal(game.stage, 'ultimate-preflop');
  assert.equal(game.act('b', 'check', 2), 'not-your-turn');
  assert.equal(game.act('a', 'raise4', 2), null);
  assert.equal(game.stage, 'ultimate-flop');
  assert.equal(game.act('a', 'check', 3), 'not-your-turn');
  // Whoever has not decided when time runs out checks.
  assert.equal(game.expire(game.deadline), true);
  assert.equal(game.stage, 'ultimate-river');
  assert.equal(game.publicPlayer('b').action, 'Check');
});

const ultimatePayout = (...args: Parameters<typeof ultimateReturns>) => {
  const returns = ultimateReturns(...args);
  return returns.ante + returns.blind + returns.play;
};

test('Ultimate Poker pays ante, blind and play by the book', () => {
  const bet = { ante: 10, blind: 10, play: 40 };
  const hand = (category: number, top = 10) => ({
    category,
    label: '',
    score: [top],
  });
  // Win with a flush against a qualified dealer: 60 back + 10 + 15 + 40.
  assert.equal(ultimatePayout(bet, hand(5), 1, true), 125);
  // Dealer does not qualify: the ante only pushes.
  assert.equal(ultimatePayout(bet, hand(5), 1, false), 115);
  // Win below a straight: the blind pushes.
  assert.equal(ultimatePayout(bet, hand(1), 1, true), 110);
  assert.equal(ultimatePayout(bet, hand(8, 14), 1, true), 60 + 10 + 5000 + 40);
  assert.equal(ultimatePayout(bet, hand(3), 0, true), 60);
  assert.equal(ultimatePayout(bet, hand(3), -1, true), 0);
  assert.equal(ultimatePayout(bet, hand(3), -1, false), 10);
  // Each wager resolves on its own: play 1:1, ante 1:1 (qualified), blind 3:2.
  assert.deepEqual(ultimateReturns(bet, hand(5), 1, true), {
    play: 80,
    ante: 20,
    blind: 25,
  });
});

test('Hold’em refuses invalid settings and completes a heads-up hand', () => {
  assert.equal(
    parsePokerSettings({ ...defaultPokerSettings, bigBlind: 0 }),
    null,
  );
  const game = new PokerGame(
    ['a', 'b'],
    settings({ mode: 'holdem' }),
    0,
    () => 0.37,
  );
  for (let safety = 0; safety < 40 && game.stage !== 'showdown'; safety += 1) {
    const player = game.players.get(game.activePlayerId)!;
    const action = game.currentBet > player.streetBet ? 'call' : 'check';
    assert.equal(game.act(game.activePlayerId, action, safety + 1), null);
  }
  assert.equal(game.stage, 'showdown');
  assert.ok(game.winnerId);
});

test('Ultimate Poker ante is a minimum, mirrored by the blind and scaling the play bet', () => {
  const game = new PokerGame(['solo'], settings(), 0, () => 0.42);
  assert.equal(game.placeBet('solo', { ante: 10 }, 1), 'invalid-bet');
  assert.equal(game.placeBet('solo', { ante: 600 }, 1), 'not-enough-chips');
  assert.equal(game.placeBet('solo', { ante: 100 }, 1), null);
  assert.equal(game.act('solo', 'raise3', 2), null);
  assert.deepEqual(game.publicPlayer('solo').bet, {
    ante: 100,
    blind: 100,
    play: 300,
  });
});

test('Hold’em gives every player a decision on each new street', () => {
  const game = new PokerGame(
    ['a', 'b'],
    settings({ mode: 'holdem' }),
    0,
    () => 0.37,
  );
  // Pre-flop: the small blind calls, the big blind checks.
  game.act(game.activePlayerId, 'call', 1);
  game.act(game.activePlayerId, 'check', 2);
  assert.equal(game.stage, 'holdem-flop');
  const first = game.activePlayerId;
  assert.equal(game.act(first, 'check', 3), null);
  assert.equal(game.stage, 'holdem-flop');
  assert.notEqual(game.activePlayerId, first);
  assert.equal(game.act(game.activePlayerId, 'check', 4), null);
  assert.equal(game.stage, 'holdem-turn');
});
