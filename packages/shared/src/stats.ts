/** Game ids that currently emit stats. Keep this contract independent of game state. */
export type StatsGameId = 'bomb-party' | 'tank-arena' | 'blackjack-party';

export type MatchOutcome = 'win' | 'loss' | 'draw';

/** Counters that can be summed across completed matches. */
export interface MatchStatCounters extends Readonly<Record<string, number>> {}

/** Counters shared by every game. Percentages are derived from these values. */
export interface GlobalStats {
  gamesPlayed: number;
  wins: number;
  losses: number;
  playtimeSeconds: number;
}

export interface BombPartyMatchStats extends MatchStatCounters {
  wordsPlayed: number;
  wordsAccepted: number;
  livesLost: number;
  bestStreak?: number;
  livesRecovered?: number;
}

export interface TankArenaMatchStats extends MatchStatCounters {
  shotsFired: number;
  shotsHit: number;
  damageDealt: number;
  kills?: number;
  deaths?: number;
}

export interface BlackjackMatchStats extends MatchStatCounters {
  roundsPlayed: number;
  roundsWon: number;
  blackjacks: number;
  busts: number;
  doubleDownWins: number;
  splitWins: number;
  perfectPairsWins: number;
  twentyOnePlusThreeWins: number;
  highestEndingChipBalance: number;
  rebuys: number;
  globalCurrencySpentOnRebuys: number;
}

export interface BombPartyStats extends GlobalStats, BombPartyMatchStats {}

export interface TankArenaStats extends GlobalStats, TankArenaMatchStats {}

export interface BlackjackStats extends GlobalStats, BlackjackMatchStats {}

export interface MatchParticipant<Stats extends MatchStatCounters> {
  playerId: string;
  outcome: MatchOutcome;
  stats: Stats;
}

/** A completed game can emit one result without knowing how stats are stored. */
export interface MatchResult<
  GameId extends StatsGameId,
  Stats extends MatchStatCounters,
> {
  gameId: GameId;
  matchId: string;
  playedAt: string;
  durationSeconds: number;
  players: readonly MatchParticipant<Stats>[];
}

export type BombPartyMatchResult = MatchResult<
  'bomb-party',
  BombPartyMatchStats
>;

export type TankArenaMatchResult = MatchResult<
  'tank-arena',
  TankArenaMatchStats
>;

export type BlackjackMatchResult = MatchResult<
  'blackjack-party',
  BlackjackMatchStats
>;

export type AnyMatchResult =
  BombPartyMatchResult | TankArenaMatchResult | BlackjackMatchResult;

export function emptyBombPartyMatchStats(): BombPartyMatchStats {
  return { wordsPlayed: 0, wordsAccepted: 0, livesLost: 0 };
}

export function emptyTankArenaMatchStats(): TankArenaMatchStats {
  return { shotsFired: 0, shotsHit: 0, damageDealt: 0 };
}

export function emptyBlackjackMatchStats(): BlackjackMatchStats {
  return {
    roundsPlayed: 0,
    roundsWon: 0,
    blackjacks: 0,
    busts: 0,
    doubleDownWins: 0,
    splitWins: 0,
    perfectPairsWins: 0,
    twentyOnePlusThreeWins: 0,
    highestEndingChipBalance: 0,
    rebuys: 0,
    globalCurrencySpentOnRebuys: 0,
  };
}

/** Aggregate one player's raw counters from completed matches. */
export function aggregateStats<
  GameId extends StatsGameId,
  Stats extends MatchStatCounters,
>(
  results: readonly MatchResult<GameId, Stats>[],
  playerId: string,
  emptyMatchStats: Stats,
): GlobalStats & Stats {
  const global: GlobalStats = {
    gamesPlayed: 0,
    wins: 0,
    losses: 0,
    playtimeSeconds: 0,
  };
  const totals: Record<string, number> = {
    ...emptyMatchStats,
  };

  for (const result of results) {
    const participant = result.players.find(
      (player) => player.playerId === playerId,
    );
    if (!participant) continue;

    global.gamesPlayed += 1;
    global.playtimeSeconds += result.durationSeconds;
    if (participant.outcome === 'win') global.wins += 1;
    if (participant.outcome === 'loss') global.losses += 1;

    for (const [key, value] of Object.entries(participant.stats)) {
      totals[key] = (totals[key] ?? 0) + value;
    }
  }

  return { ...totals, ...global } as GlobalStats & Stats;
}

export function aggregateBombPartyStats(
  results: readonly BombPartyMatchResult[],
  playerId: string,
): BombPartyStats {
  return aggregateStats(results, playerId, emptyBombPartyMatchStats());
}

export function aggregateTankArenaStats(
  results: readonly TankArenaMatchResult[],
  playerId: string,
): TankArenaStats {
  return aggregateStats(results, playerId, emptyTankArenaMatchStats());
}

export function aggregateBlackjackStats(
  results: readonly BlackjackMatchResult[],
  playerId: string,
): BlackjackStats {
  const totals = aggregateStats(results, playerId, emptyBlackjackMatchStats());
  totals.highestEndingChipBalance = Math.max(
    0,
    ...results.map(
      (result) =>
        result.players.find((player) => player.playerId === playerId)?.stats
          .highestEndingChipBalance ?? 0,
    ),
  );
  return totals;
}

export function combineGlobalStats(
  ...stats: readonly GlobalStats[]
): GlobalStats {
  return stats.reduce(
    (total, current) => ({
      gamesPlayed: total.gamesPlayed + current.gamesPlayed,
      wins: total.wins + current.wins,
      losses: total.losses + current.losses,
      playtimeSeconds: total.playtimeSeconds + current.playtimeSeconds,
    }),
    { gamesPlayed: 0, wins: 0, losses: 0, playtimeSeconds: 0 },
  );
}

export function winRate(
  stats: Pick<GlobalStats, 'gamesPlayed' | 'wins'>,
): number {
  return stats.gamesPlayed === 0 ? 0 : stats.wins / stats.gamesPlayed;
}

export function accuracy(
  stats: Pick<TankArenaStats, 'shotsFired' | 'shotsHit'>,
): number {
  return stats.shotsFired === 0 ? 0 : stats.shotsHit / stats.shotsFired;
}
