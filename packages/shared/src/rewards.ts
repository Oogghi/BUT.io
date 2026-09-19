import type { AnyMatchResult, MatchParticipant } from './stats.ts';

export type RewardKind =
  | 'participation'
  | 'win'
  | 'bomb-words'
  | 'bomb-streak'
  | 'tank-kills'
  | 'tank-damage'
  | 'tank-accuracy';

export interface RewardBreakdown {
  kind: RewardKind;
  amount: number;
}

export interface MatchReward {
  total: number;
  breakdown: readonly RewardBreakdown[];
}

export const MATCH_PARTICIPATION_COINS = 5;
export const MATCH_WIN_COINS = 25;
export const MATCH_REWARD_CAP = 50;

function counter(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(0, Math.floor(value))
    : 0;
}

function push(breakdown: RewardBreakdown[], kind: RewardKind, amount: number) {
  if (amount > 0) breakdown.push({ kind, amount });
}

/** Calculates the capped reward for a trusted completed match participant. */
export function calculateMatchReward(
  result: AnyMatchResult,
  participant: MatchParticipant<Record<string, number>>,
): MatchReward {
  const breakdown: RewardBreakdown[] = [];
  push(breakdown, 'participation', MATCH_PARTICIPATION_COINS);
  if (participant.outcome === 'win') push(breakdown, 'win', MATCH_WIN_COINS);

  if (result.gameId === 'bomb-party') {
    push(
      breakdown,
      'bomb-words',
      Math.min(10, counter(participant.stats.wordsAccepted)),
    );
    const streak = counter(participant.stats.bestStreak);
    push(
      breakdown,
      'bomb-streak',
      (streak >= 5 ? 5 : 0) + (streak >= 10 ? 5 : 0),
    );
  } else if (result.gameId === 'tank-arena') {
    push(
      breakdown,
      'tank-kills',
      Math.min(3, counter(participant.stats.kills)) * 3,
    );
    push(
      breakdown,
      'tank-damage',
      Math.min(6, Math.floor(counter(participant.stats.damageDealt) / 100)),
    );
    const shotsFired = counter(participant.stats.shotsFired);
    const shotsHit = Math.min(shotsFired, counter(participant.stats.shotsHit));
    push(
      breakdown,
      'tank-accuracy',
      shotsFired >= 5 && shotsHit / shotsFired >= 0.5 ? 5 : 0,
    );
  }

  const total = Math.min(
    MATCH_REWARD_CAP,
    breakdown.reduce((sum, reward) => sum + reward.amount, 0),
  );
  return { total, breakdown };
}
