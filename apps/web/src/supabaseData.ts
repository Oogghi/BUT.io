import { createClient } from '@supabase/supabase-js';
import {
  combineGlobalStats,
  accuracy,
  winRate,
  type GlobalStats,
} from '@but/shared';

const url = import.meta.env?.VITE_SUPABASE_URL;
const publishableKey = import.meta.env?.VITE_SUPABASE_PUBLISHABLE_KEY;

/** Browser-safe client only. Never replace the publishable key with a service-role key. */
export const supabase =
  url && publishableKey
    ? createClient(url, publishableKey, {
        auth: {
          autoRefreshToken: true,
          persistSession: true,
          detectSessionInUrl: true,
        },
      })
    : null;

export type GameId = 'bomb-party' | 'tank-arena';
export type FriendshipStatus = 'pending' | 'accepted' | 'declined';
export type LeaderboardMetric = 'wins' | 'winRate' | 'bestStreak' | 'kills';

export class DataLayerError extends Error {
  readonly code:
    | 'not-configured'
    | 'not-authenticated'
    | 'username-taken'
    | 'self-request'
    | 'already-friends'
    | 'request-pending'
    | 'incoming-request'
    | 'request-failed';

  constructor(
    code:
      | 'not-configured'
      | 'not-authenticated'
      | 'username-taken'
      | 'self-request'
      | 'already-friends'
      | 'request-pending'
      | 'incoming-request'
      | 'request-failed',
    message: string,
  ) {
    super(message);
    this.code = code;
    this.name = 'DataLayerError';
  }
}

export interface ProfileRecord {
  id: string;
  username: string;
  created_at: string;
}

export interface Account {
  userId: string;
  email: string;
  username: string;
}

interface GameStatsRow {
  user_id: string;
  game_id: string;
  games_played: number | null;
  wins: number | null;
  losses: number | null;
  playtime_seconds: number | null;
  metrics: unknown;
  updated_at: string | null;
}

interface MatchHistoryRow {
  id: string;
  game_id: string;
  winner_id: string | null;
  metadata: unknown;
  started_at: string | null;
  ended_at: string | null;
  created_at: string;
}

interface FriendshipRow {
  user_id: string;
  friend_id: string;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface GameStatsView {
  userId: string;
  gameId: GameId;
  gamesPlayed: number;
  wins: number;
  losses: number;
  playtimeSeconds: number;
  metrics: Record<string, number>;
}

export interface RecentMatch {
  id: string;
  gameId: GameId;
  result: 'win' | 'loss' | 'draw';
  playedAt: string;
  durationSeconds: number;
}

export interface PlayerStatsView {
  global: GlobalStats;
  games: Record<GameId, GameStatsView>;
  recentMatches: RecentMatch[];
}

export interface FriendEntry {
  userId: string;
  username: string;
  createdAt: string;
}

export interface FriendState {
  friends: FriendEntry[];
  incoming: FriendEntry[];
  outgoing: FriendEntry[];
}

export interface LeaderboardEntry {
  rank: number;
  userId: string;
  username: string;
  gamesPlayed: number;
  wins: number;
  value: number;
}

function client() {
  if (!supabase)
    throw new DataLayerError(
      'not-configured',
      'Supabase is not configured for this build.',
    );
  return supabase;
}

function fail(error: { message: string } | null): never | void {
  if (!error) return;
  throw new DataLayerError('request-failed', error.message);
}

function number(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

export function metric(
  metrics: Record<string, number>,
  ...keys: string[]
): number {
  for (const key of keys) {
    if (key in metrics) return number(metrics[key]);
  }
  return 0;
}

function metrics(value: unknown): Record<string, number> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter(
      ([, entry]) => typeof entry === 'number' && Number.isFinite(entry),
    ),
  );
}

function gameId(value: string): GameId | null {
  return value === 'bomb-party' || value === 'tank-arena' ? value : null;
}

function emptyGameStats(gameId: GameId): GameStatsView {
  return {
    userId: '',
    gameId,
    gamesPlayed: 0,
    wins: 0,
    losses: 0,
    playtimeSeconds: 0,
    metrics: {},
  };
}

function normalizeGameStats(row: GameStatsRow): GameStatsView | null {
  const id = gameId(row.game_id);
  return id
    ? {
        userId: row.user_id,
        gameId: id,
        gamesPlayed: number(row.games_played),
        wins: number(row.wins),
        losses: number(row.losses),
        playtimeSeconds: number(row.playtime_seconds),
        metrics: metrics(row.metrics),
      }
    : null;
}

function duration(start: string | null, end: string | null): number {
  if (!start || !end) return 0;
  const seconds = (Date.parse(end) - Date.parse(start)) / 1000;
  return Number.isFinite(seconds) && seconds > 0 ? seconds : 0;
}

function normalizeMatch(
  row: MatchHistoryRow,
  userId: string,
): RecentMatch | null {
  const id = gameId(row.game_id);
  if (!id) return null;
  return {
    id: row.id,
    gameId: id,
    result:
      row.winner_id === null
        ? 'draw'
        : row.winner_id === userId
          ? 'win'
          : 'loss',
    playedAt: row.ended_at ?? row.started_at ?? row.created_at,
    durationSeconds: duration(row.started_at, row.ended_at),
  };
}

export async function currentAccount(): Promise<Account | null> {
  const { data, error } = await client().auth.getSession();
  fail(error);
  const user = data.session?.user;
  if (!user) return null;
  const profile = await profileById(user.id);
  return {
    userId: user.id,
    email: user.email ?? '',
    username: profile?.username ?? '',
  };
}

async function profileById(userId: string): Promise<ProfileRecord | null> {
  const { data, error } = await client()
    .from('profiles')
    .select('id,username,created_at')
    .eq('id', userId)
    .maybeSingle();
  fail(error);
  return (data as ProfileRecord | null) ?? null;
}

async function saveProfile(
  userId: string,
  username: string,
): Promise<ProfileRecord> {
  const { data, error } = await client()
    .from('profiles')
    .upsert({ id: userId, username: username.trim() }, { onConflict: 'id' })
    .select('id,username,created_at')
    .single();
  if (error?.code === '23505')
    throw new DataLayerError(
      'username-taken',
      'That username is already taken.',
    );
  fail(error);
  return data as ProfileRecord;
}

export async function signIn(
  email: string,
  password: string,
): Promise<Account> {
  const { data, error } = await client().auth.signInWithPassword({
    email: email.trim(),
    password,
  });
  fail(error);
  if (!data.user)
    throw new DataLayerError('not-authenticated', 'Sign in failed.');
  const account = await currentAccount();
  if (!account)
    throw new DataLayerError('not-authenticated', 'Sign in failed.');
  return account;
}

export async function signUp(
  email: string,
  password: string,
  username: string,
): Promise<{ account: Account | null; confirmationRequired: boolean }> {
  const { data, error } = await client().auth.signUp({
    email: email.trim(),
    password,
    options: { data: { username: username.trim() } },
  });
  fail(error);
  if (!data.user || !data.session)
    return { account: null, confirmationRequired: true };
  await saveProfile(data.user.id, username);
  const account = await currentAccount();
  if (!account)
    throw new DataLayerError('not-authenticated', 'Account setup failed.');
  return { account, confirmationRequired: false };
}

export async function completeProfile(
  userId: string,
  username: string,
): Promise<Account> {
  await saveProfile(userId, username);
  return {
    userId,
    email: '',
    username: username.trim(),
  };
}

export async function signOut() {
  const { error } = await client().auth.signOut();
  fail(error);
}

export async function loadPlayerStats(
  userId: string,
): Promise<PlayerStatsView> {
  const db = client();
  const [statsResult, historyResult] = await Promise.all([
    db
      .from('game_stats')
      .select(
        'user_id,game_id,games_played,wins,losses,playtime_seconds,metrics,updated_at',
      )
      .eq('user_id', userId),
    db
      .from('match_history')
      .select('id,game_id,winner_id,metadata,started_at,ended_at,created_at')
      .order('created_at', { ascending: false })
      .limit(8),
  ]);
  fail(statsResult.error);
  fail(historyResult.error);

  const games: Record<GameId, GameStatsView> = {
    'bomb-party': emptyGameStats('bomb-party'),
    'tank-arena': emptyGameStats('tank-arena'),
  };
  for (const row of (statsResult.data ?? []) as GameStatsRow[]) {
    const game = normalizeGameStats(row);
    if (game) games[game.gameId] = game;
  }
  const global = combineGlobalStats(games['bomb-party'], games['tank-arena']);
  const recentMatches =
    (historyResult.data as MatchHistoryRow[] | null)
      ?.map((row) => normalizeMatch(row, userId))
      .filter((match): match is RecentMatch => Boolean(match)) ?? [];
  return { global, games, recentMatches };
}

export async function loadPlayerStatsByUsername(
  username: string,
): Promise<PlayerStatsView | null> {
  const { data, error } = await client()
    .from('profiles')
    .select('id')
    .eq('username', username)
    .maybeSingle();
  fail(error);
  return data?.id ? loadPlayerStats(data.id as string) : null;
}

export async function searchProfiles(
  query: string,
  currentUserId: string,
): Promise<ProfileRecord[]> {
  const { data, error } = await client()
    .from('profiles')
    .select('id,username,created_at')
    .ilike('username', `%${query.trim()}%`)
    .neq('id', currentUserId)
    .order('username', { ascending: true })
    .limit(20);
  fail(error);
  return (data as ProfileRecord[] | null) ?? [];
}

function pairFilter(first: string, second: string) {
  return `and(user_id.eq.${first},friend_id.eq.${second}),and(user_id.eq.${second},friend_id.eq.${first})`;
}

async function friendshipRows(
  userId: string,
  otherId?: string,
): Promise<FriendshipRow[]> {
  const builder = client()
    .from('friendships')
    .select('user_id,friend_id,status,created_at,updated_at');
  const query = otherId
    ? builder.or(pairFilter(userId, otherId))
    : builder.or(`user_id.eq.${userId},friend_id.eq.${userId}`);
  const { data, error } = await query;
  fail(error);
  return (data as FriendshipRow[] | null) ?? [];
}

async function profilesById(
  ids: string[],
): Promise<Map<string, ProfileRecord>> {
  if (!ids.length) return new Map();
  const { data, error } = await client()
    .from('profiles')
    .select('id,username,created_at')
    .in('id', ids);
  fail(error);
  return new Map(
    ((data as ProfileRecord[] | null) ?? []).map((profile) => [
      profile.id,
      profile,
    ]),
  );
}

export async function loadFriendState(userId: string): Promise<FriendState> {
  const rows = await friendshipRows(userId);
  const otherIds = rows.map((row) =>
    row.user_id === userId ? row.friend_id : row.user_id,
  );
  const profiles = await profilesById([...new Set(otherIds)]);
  const result: FriendState = { friends: [], incoming: [], outgoing: [] };
  for (const row of rows) {
    const otherId = row.user_id === userId ? row.friend_id : row.user_id;
    const profile = profiles.get(otherId);
    if (!profile || !['pending', 'accepted'].includes(row.status)) continue;
    const entry = {
      userId: otherId,
      username: profile.username,
      createdAt: row.created_at,
    };
    if (row.status === 'accepted') result.friends.push(entry);
    else if (row.user_id === userId) result.outgoing.push(entry);
    else result.incoming.push(entry);
  }
  return result;
}

export async function sendFriendRequest(userId: string, friendId: string) {
  if (userId === friendId)
    throw new DataLayerError('self-request', 'You cannot add yourself.');
  const existing = await friendshipRows(userId, friendId);
  if (existing.some((row) => row.status === 'accepted'))
    throw new DataLayerError('already-friends', 'You are already friends.');
  const pending = existing.find((row) => row.status === 'pending');
  if (pending) {
    throw new DataLayerError(
      pending.user_id === userId ? 'request-pending' : 'incoming-request',
      pending.user_id === userId
        ? 'A request is already pending.'
        : 'This player already sent you a request.',
    );
  }
  const { error } = await client().from('friendships').insert({
    user_id: userId,
    friend_id: friendId,
    status: 'pending',
  });
  fail(error);
}

export async function acceptFriendRequest(userId: string, requesterId: string) {
  const { error } = await client()
    .from('friendships')
    .update({ status: 'accepted' })
    .eq('user_id', requesterId)
    .eq('friend_id', userId)
    .eq('status', 'pending');
  fail(error);
}

export async function declineFriendRequest(
  userId: string,
  requesterId: string,
) {
  const { error } = await client()
    .from('friendships')
    .update({ status: 'declined' })
    .eq('user_id', requesterId)
    .eq('friend_id', userId)
    .eq('status', 'pending');
  fail(error);
}

export async function removeFriend(userId: string, friendId: string) {
  const { error } = await client()
    .from('friendships')
    .delete()
    .or(pairFilter(userId, friendId));
  fail(error);
}

function leaderboardValue(
  row: GameStatsView,
  selected: LeaderboardMetric,
): number {
  if (selected === 'wins') return row.wins;
  if (selected === 'winRate') return winRate(row);
  if (selected === 'bestStreak')
    return metric(row.metrics, 'best_streak', 'bestStreak');
  return metric(row.metrics, 'kills');
}

export async function loadLeaderboard(
  gameId: GameId,
  selected: LeaderboardMetric,
): Promise<LeaderboardEntry[]> {
  const { data, error } = await client()
    .from('game_stats')
    .select(
      'user_id,game_id,games_played,wins,losses,playtime_seconds,metrics,updated_at',
    )
    .eq('game_id', gameId)
    .limit(100);
  fail(error);
  const stats = ((data as GameStatsRow[] | null) ?? [])
    .map(normalizeGameStats)
    .filter((row): row is GameStatsView => Boolean(row))
    .filter((row) => selected !== 'winRate' || row.gamesPlayed >= 3)
    .sort((a, b) => {
      const value =
        leaderboardValue(b, selected) - leaderboardValue(a, selected);
      return value || b.gamesPlayed - a.gamesPlayed || b.wins - a.wins;
    });
  const ids = ((data as GameStatsRow[] | null) ?? []).map((row) => row.user_id);
  const names = await profilesById([...new Set(ids)]);
  return stats
    .map((row, index) => {
      const userId = row.userId;
      const profile = names.get(userId);
      return profile
        ? {
            rank: index + 1,
            userId,
            username: profile.username,
            gamesPlayed: row.gamesPlayed,
            wins: row.wins,
            value: leaderboardValue(row, selected),
          }
        : null;
    })
    .filter((entry): entry is LeaderboardEntry => Boolean(entry))
    .slice(0, 50);
}

export function formatStatPercent(value: number) {
  return `${Math.round(value * 100)}%`;
}

export function gameAccuracy(stats: GameStatsView) {
  return accuracy({
    shotsFired: metric(stats.metrics, 'shots_fired', 'shotsFired'),
    shotsHit: metric(stats.metrics, 'shots_hit', 'shotsHit'),
  });
}

export function gameWinRate(
  stats: Pick<GameStatsView, 'gamesPlayed' | 'wins'>,
) {
  return winRate(stats);
}
