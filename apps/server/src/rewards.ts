import { createClient } from '@supabase/supabase-js';
import {
  calculateMatchReward,
  type AnyMatchResult,
  type MatchReward,
} from '@but/shared';

const url = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// This client is server-only. Never mirror the service-role key into apps/web.
const admin =
  url && serviceRoleKey
    ? createClient(url, serviceRoleKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      })
    : null;

export const rewardsConfigured = Boolean(admin);

/** Returns a real account id for a valid signed-in token; guests are ignored. */
export async function verifiedUserId(
  accessToken: unknown,
): Promise<string | null> {
  if (!admin || typeof accessToken !== 'string' || !accessToken) return null;
  const { data, error } = await admin.auth.getUser(accessToken);
  if (error || !data.user || data.user.is_anonymous) return null;
  return data.user.id;
}

interface RewardRow {
  user_id: string;
  coins_awarded: number;
}

/** Records one trusted match and returns the rewards actually granted. */
export async function recordAuthoritativeMatch(
  result: AnyMatchResult,
): Promise<Map<string, MatchReward>> {
  if (!admin || result.players.length === 0) return new Map();

  const endedAt = new Date(
    Date.parse(result.playedAt) + result.durationSeconds * 1000,
  ).toISOString();
  const winnerId =
    result.players.find((player) => player.outcome === 'win')?.playerId ?? null;
  const calculatedRewards = new Map<string, MatchReward>();
  const players = result.players.map((player) => {
    const reward = calculateMatchReward(result, player);
    calculatedRewards.set(player.playerId, reward);
    return { ...player, rewardCoins: reward.total };
  });
  const { data, error } = await admin.rpc('record_match_result', {
    p_match_id: result.matchId,
    p_game_id: result.gameId,
    p_winner_id: winnerId,
    p_started_at: result.playedAt,
    p_ended_at: endedAt,
    p_duration_seconds: Math.max(0, Math.round(result.durationSeconds)),
    p_players: players,
  });
  if (error) {
    console.error(
      'Unable to persist the authoritative match result:',
      error.message,
    );
    return new Map();
  }

  const rewards = new Map<string, MatchReward>();
  const rows = (data as { rewards?: RewardRow[] } | null)?.rewards ?? [];
  for (const row of rows) {
    if (
      typeof row?.user_id === 'string' &&
      typeof row.coins_awarded === 'number' &&
      Number.isFinite(row.coins_awarded) &&
      row.coins_awarded > 0
    ) {
      rewards.set(
        row.user_id,
        calculatedRewards.get(row.user_id) ?? {
          total: row.coins_awarded,
          breakdown: [],
        },
      );
    }
  }
  return rewards;
}
