import type { BlackjackHandState } from '@but/blackjack-party';
import type { CosmeticLoadout } from '@but/shared';

export const blackjackCelebrationIds = [
  'golden-blackjack',
  'royal-blackjack',
  'electric-blackjack',
] as const;
export type BlackjackCelebrationId = (typeof blackjackCelebrationIds)[number];

/** Use the authoritative natural-blackjack state, never just a hand total of 21. */
export function blackjackCelebrationFor(
  hand: BlackjackHandState,
  loadout: CosmeticLoadout,
): BlackjackCelebrationId | undefined {
  const id = loadout['blackjack-celebration'];
  if (hand.fromSplit || hand.cards.length !== 2 || hand.status !== 'blackjack')
    return undefined;
  return blackjackCelebrationIds.find((known) => known === id);
}
