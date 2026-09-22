import assert from 'node:assert/strict';
import test from 'node:test';
import type { BlackjackHandState } from '@but/blackjack-party';
import { blackjackCelebrationFor } from '../src/blackjackCelebrationRules.ts';

const hand: BlackjackHandState = {
  cards: [
    { rank: 'A', suit: 'spades' },
    { rank: 'K', suit: 'hearts' },
  ],
  status: 'blackjack',
  outcome: '',
  value: 21,
  soft: true,
  bet: 50,
  payout: 0,
  doubled: false,
  fromSplit: false,
  canDouble: false,
  canSplit: false,
};
const loadout = { 'blackjack-celebration': 'golden-blackjack' } as const;

test('celebrate an equipped natural blackjack, including a dealer push', () => {
  assert.equal(blackjackCelebrationFor(hand, loadout), 'golden-blackjack');
  assert.equal(
    blackjackCelebrationFor({ ...hand, outcome: 'push' }, loadout),
    'golden-blackjack',
  );
});
test('ordinary wins, split 21s, hit 21s and unequipped players do not celebrate', () => {
  assert.equal(blackjackCelebrationFor(hand, {}), undefined);
  assert.equal(
    blackjackCelebrationFor(hand, { 'blackjack-celebration': 'velvet-deal' }),
    undefined,
  );
  for (const change of [
    { fromSplit: true },
    { status: 'stood' as const, outcome: 'win' as const },
    { cards: [...hand.cards, { rank: '2' as const, suit: 'clubs' as const }] },
    { cards: [] },
  ])
    assert.equal(
      blackjackCelebrationFor({ ...hand, ...change }, loadout),
      undefined,
    );
});
