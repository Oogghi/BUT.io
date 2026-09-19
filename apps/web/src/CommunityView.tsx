import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { Icon } from './Icon';
import { GroupFeature } from './GroupFeature';
import { loadProfile } from './profile';
import { t } from './i18n';
import {
  acceptFriendRequest,
  completeProfile,
  currentAccount,
  DataLayerError,
  declineFriendRequest,
  formatStatPercent,
  gameAccuracy,
  gameWinRate,
  loadFriendState,
  loadLeaderboard,
  loadPlayerStats,
  metric,
  removeFriend,
  searchProfiles,
  sendFriendRequest,
  signIn,
  signInAnonymously,
  signOut,
  signUp,
  type Account,
  type FriendState,
  type GameId,
  type GameStatsView,
  type LeaderboardEntry,
  type LeaderboardMetric,
  type PlayerStatsView,
  type ProfileRecord,
} from './supabaseData';

export type CommunityFeature = 'friends' | 'group' | 'stats' | 'leaderboard';

const featureConfig: Record<
  CommunityFeature,
  { icon: 'users' | 'stats' | 'trophy'; title: string; description: string }
> = {
  friends: {
    icon: 'users',
    title: t.community.friendsTitle,
    description: t.community.friendsDescription,
  },
  group: {
    icon: 'users',
    title: t.community.groupTitle,
    description: t.community.groupDescription,
  },
  stats: {
    icon: 'stats',
    title: t.community.statsTitle,
    description: t.community.statsDescription,
  },
  leaderboard: {
    icon: 'trophy',
    title: t.community.leaderboardTitle,
    description: t.community.leaderboardDescription,
  },
};

export function CommunityView({ feature }: { feature: CommunityFeature }) {
  const [account, setAccount] = useState<Account | null | undefined>(undefined);
  const [error, setError] = useState('');
  const config = featureConfig[feature];

  useEffect(() => {
    let active = true;
    void currentAccount()
      .then((next) => {
        if (active) setAccount(next);
      })
      .catch((cause) => {
        if (active) {
          setError(errorMessage(cause));
          setAccount(null);
        }
      });
    return () => {
      active = false;
    };
  }, []);

  async function leaveAccount() {
    await signOut();
    setAccount(null);
  }

  return (
    <section className="community-view" aria-labelledby="community-title">
      <header className="community-heading">
        <Link to="/" className="text-link">
          <Icon name="back" /> {t.backHome}
        </Link>
        <div className="community-title-row">
          <span className="community-title-icon">
            <Icon name={config.icon} />
          </span>
          <div>
            <h1 id="community-title">{config.title}</h1>
            <p>{config.description}</p>
          </div>
        </div>
        <nav className="community-nav" aria-label={t.community.navigation}>
          <Link
            className={feature === 'friends' ? 'is-active' : ''}
            to="/friends"
          >
            {t.friends}
          </Link>
          <Link className={feature === 'group' ? 'is-active' : ''} to="/group">
            {t.group}
          </Link>
          <Link className={feature === 'stats' ? 'is-active' : ''} to="/stats">
            {t.stats}
          </Link>
          <Link
            className={feature === 'leaderboard' ? 'is-active' : ''}
            to="/leaderboard"
          >
            {t.leaderboard}
          </Link>
        </nav>
      </header>

      {account && (account.username || account.isAnonymous) && (
        <div className="community-account">
          <span>
            {account.isAnonymous
              ? t.community.guestAccount
              : `${t.community.signedInAs} ${account.username}`}
          </span>
          <button
            className="text-link"
            type="button"
            onClick={() => void leaveAccount()}
          >
            {t.community.signOut}
          </button>
        </div>
      )}

      {account === undefined ? (
        <LoadingState />
      ) : error ? (
        <ErrorState message={error} />
      ) : !account ? (
        <AuthPanel onAuthenticated={setAccount} />
      ) : !account.username && !account.isAnonymous ? (
        <ProfileSetup account={account} onComplete={setAccount} />
      ) : feature === 'group' ? (
        <GroupFeature account={account} />
      ) : feature === 'friends' ? (
        <FriendsFeature account={account} />
      ) : feature === 'stats' ? (
        <StatsFeature account={account} />
      ) : (
        <LeaderboardFeature account={account} />
      )}
    </section>
  );
}

function AuthPanel({
  onAuthenticated,
}: {
  onAuthenticated: (account: Account) => void;
}) {
  const [mode, setMode] = useState<'sign-in' | 'sign-up'>('sign-in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState(loadProfile().displayName);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setNotice('');
    try {
      if (mode === 'sign-in') {
        onAuthenticated(await signIn(email, password));
      } else {
        const result = await signUp(email, password, username);
        if (result.account) onAuthenticated(result.account);
        else setNotice(t.community.confirmationSent);
      }
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="community-auth panel" onSubmit={submit}>
      <div className="panel-heading">
        <h2>
          {mode === 'sign-in' ? t.community.signIn : t.community.createAccount}
        </h2>
        <Icon name="users" />
      </div>
      <p>{t.community.authDescription}</p>
      {mode === 'sign-up' && (
        <div className="field">
          <label htmlFor="community-username">{t.community.username}</label>
          <input
            id="community-username"
            required
            maxLength={24}
            autoComplete="username"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
          />
        </div>
      )}
      <div className="field">
        <label htmlFor="community-email">{t.community.email}</label>
        <input
          id="community-email"
          required
          type="email"
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
      </div>
      <div className="field">
        <label htmlFor="community-password">{t.community.password}</label>
        <input
          id="community-password"
          required
          minLength={6}
          type="password"
          autoComplete={
            mode === 'sign-in' ? 'current-password' : 'new-password'
          }
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
      </div>
      {notice && (
        <p className="notice" role="status">
          {notice}
        </p>
      )}
      {error && (
        <p className="notice" role="alert">
          {error}
        </p>
      )}
      <button className="button primary" type="submit" disabled={busy}>
        {busy
          ? t.community.working
          : mode === 'sign-in'
            ? t.community.signIn
            : t.community.createAccount}
        <Icon name="arrow" />
      </button>
      <button
        className="text-link community-auth-switch"
        type="button"
        onClick={() => {
          setMode(mode === 'sign-in' ? 'sign-up' : 'sign-in');
          setError('');
          setNotice('');
        }}
      >
        {mode === 'sign-in' ? t.community.needAccount : t.community.haveAccount}
      </button>
      {mode === 'sign-in' && (
        <>
          <div className="community-auth-divider">{t.community.or}</div>
          <button
            className="button secondary"
            type="button"
            disabled={busy}
            onClick={() => {
              setBusy(true);
              setError('');
              void signInAnonymously()
                .then(onAuthenticated)
                .catch((cause) => setError(errorMessage(cause)))
                .finally(() => setBusy(false));
            }}
          >
            {busy ? t.community.working : t.community.continueAsGuest}
          </button>
          <p className="community-muted">{t.community.guestDescription}</p>
        </>
      )}
    </form>
  );
}

function ProfileSetup({
  account,
  onComplete,
}: {
  account: Account;
  onComplete: (account: Account) => void;
}) {
  const [username, setUsername] = useState(loadProfile().displayName);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      onComplete(
        await completeProfile(account.userId, username, account.isAnonymous),
      );
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="community-auth panel" onSubmit={submit}>
      <div className="panel-heading">
        <h2>{t.community.chooseUsername}</h2>
        <Icon name="users" />
      </div>
      <p>{t.community.usernameDescription}</p>
      <div className="field">
        <label htmlFor="community-profile-username">
          {t.community.username}
        </label>
        <input
          id="community-profile-username"
          required
          maxLength={24}
          autoComplete="username"
          value={username}
          onChange={(event) => setUsername(event.target.value)}
        />
      </div>
      {error && (
        <p className="notice" role="alert">
          {error}
        </p>
      )}
      <button className="button primary" type="submit" disabled={busy}>
        {busy ? t.community.working : t.community.saveUsername}
        <Icon name="arrow" />
      </button>
    </form>
  );
}

function FriendsFeature({ account }: { account: Account }) {
  const [state, setState] = useState<FriendState | null>(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ProfileRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [action, setAction] = useState('');
  const [error, setError] = useState('');

  async function refresh() {
    setLoading(true);
    setError('');
    try {
      setState(await loadFriendState(account.userId));
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, [account.userId]);

  async function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (query.trim().length < 2) {
      setError(t.community.searchTooShort);
      return;
    }
    setSearching(true);
    setError('');
    try {
      setResults(await searchProfiles(query, account.userId));
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setSearching(false);
    }
  }

  async function runAction(key: string, callback: () => Promise<void>) {
    setAction(key);
    setError('');
    try {
      await callback();
      await refresh();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setAction('');
    }
  }

  const relationships = useMemo(() => {
    const map = new Map<string, 'friend' | 'incoming' | 'outgoing'>();
    for (const item of state?.friends ?? []) map.set(item.userId, 'friend');
    for (const item of state?.incoming ?? []) map.set(item.userId, 'incoming');
    for (const item of state?.outgoing ?? []) map.set(item.userId, 'outgoing');
    return map;
  }, [state]);

  if (loading && !state) return <LoadingState />;
  return (
    <div className="community-content">
      <form className="community-search panel" onSubmit={search}>
        <label htmlFor="player-search">{t.community.searchPlayers}</label>
        <div>
          <input
            id="player-search"
            placeholder={t.community.searchPlaceholder}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <button className="button primary" type="submit" disabled={searching}>
            {searching ? t.community.working : t.community.search}
          </button>
        </div>
        {results.length === 0 && query.trim().length >= 2 && !searching && (
          <p className="community-muted">{t.community.noPlayersFound}</p>
        )}
        {results.length > 0 && (
          <ul className="community-list community-search-results">
            {results.map((profile) => {
              const relationship = relationships.get(profile.id);
              return (
                <li key={profile.id}>
                  <strong>{profile.username}</strong>
                  {relationship ? (
                    <span className="community-status">
                      {relationship === 'friend'
                        ? t.community.friend
                        : relationship === 'incoming'
                          ? t.community.incoming
                          : t.community.pending}
                    </span>
                  ) : (
                    <button
                      className="text-link"
                      type="button"
                      disabled={action === `add:${profile.id}`}
                      onClick={() =>
                        void runAction(`add:${profile.id}`, () =>
                          sendFriendRequest(account.userId, profile.id),
                        )
                      }
                    >
                      {t.community.addFriend}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </form>

      {error && (
        <p className="notice" role="alert">
          {error}
        </p>
      )}
      <FriendSection
        title={t.community.yourFriends}
        items={state?.friends ?? []}
        empty={t.community.noFriends}
        actionLabel={t.community.remove}
        action={(item) =>
          void runAction(`remove:${item.userId}`, () =>
            removeFriend(account.userId, item.userId),
          )
        }
        actionKey={action}
      />
      <FriendSection
        title={t.community.incomingRequests}
        items={state?.incoming ?? []}
        empty={t.community.noIncoming}
        actionLabel={t.community.accept}
        action={(item) =>
          void runAction(`accept:${item.userId}`, () =>
            acceptFriendRequest(account.userId, item.userId),
          )
        }
        secondaryActionLabel={t.community.decline}
        secondaryAction={(item) =>
          void runAction(`decline:${item.userId}`, () =>
            declineFriendRequest(account.userId, item.userId),
          )
        }
        actionKey={action}
      />
      <FriendSection
        title={t.community.outgoingRequests}
        items={state?.outgoing ?? []}
        empty={t.community.noOutgoing}
        actionLabel={t.community.pending}
        action={() => undefined}
        actionKey={action}
        disabled
      />
    </div>
  );
}

function FriendSection({
  title,
  items,
  empty,
  actionLabel,
  action,
  actionKey,
  secondaryActionLabel,
  secondaryAction,
  disabled = false,
}: {
  title: string;
  items: { userId: string; username: string }[];
  empty: string;
  actionLabel: string;
  action: (item: { userId: string; username: string }) => void;
  actionKey: string;
  secondaryActionLabel?: string;
  secondaryAction?: (item: { userId: string; username: string }) => void;
  disabled?: boolean;
}) {
  return (
    <section className="community-section">
      <div className="section-heading">
        <h2>{title}</h2>
        <span className="community-count">{items.length}</span>
      </div>
      {items.length === 0 ? (
        <p className="community-empty">{empty}</p>
      ) : (
        <ul className="community-list panel">
          {items.map((item) => (
            <li key={item.userId}>
              <strong>{item.username}</strong>
              <span className="community-actions">
                <button
                  className="text-link"
                  type="button"
                  disabled={disabled || actionKey.endsWith(item.userId)}
                  onClick={() => action(item)}
                >
                  {actionLabel}
                </button>
                {secondaryAction && secondaryActionLabel && (
                  <button
                    className="text-link is-muted"
                    type="button"
                    disabled={actionKey.endsWith(item.userId)}
                    onClick={() => secondaryAction(item)}
                  >
                    {secondaryActionLabel}
                  </button>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function StatsFeature({ account }: { account: Account }) {
  const [stats, setStats] = useState<PlayerStatsView | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    void loadPlayerStats(account.userId)
      .then((next) => {
        if (active) setStats(next);
      })
      .catch((cause) => {
        if (active) setError(errorMessage(cause));
      });
    return () => {
      active = false;
    };
  }, [account.userId]);

  if (error) return <ErrorState message={error} />;
  if (!stats) return <LoadingState />;
  return (
    <div className="community-content">
      <dl className="community-summary panel">
        <SummaryStat
          label={t.statGamesPlayed}
          value={stats.global.gamesPlayed}
        />
        <SummaryStat label={t.statWins} value={stats.global.wins} />
        <SummaryStat label={t.community.losses} value={stats.global.losses} />
        <SummaryStat
          label={t.statWinRate}
          value={formatStatPercent(gameWinRate(stats.global))}
        />
        <SummaryStat
          label={t.statPlaytime}
          value={formatDuration(stats.global.playtimeSeconds)}
        />
      </dl>
      <div className="community-game-grid">
        <GameStatsCard game={stats.games['bomb-party']} />
        <GameStatsCard game={stats.games['tank-arena']} />
      </div>
      <RecentGames matches={stats.recentMatches} />
    </div>
  );
}

function SummaryStat({
  label,
  value,
}: {
  label: string;
  value: number | string;
}) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function GameStatsCard({ game }: { game: GameStatsView }) {
  const bombParty = game.gameId === 'bomb-party';
  const values = bombParty
    ? [
        [t.statGamesPlayed, game.gamesPlayed],
        [t.statWins, game.wins],
        [
          t.community.wordsAccepted,
          metric(game.metrics, 'words_accepted', 'wordsAccepted'),
        ],
        [
          t.community.bestStreak,
          metric(game.metrics, 'best_streak', 'bestStreak'),
        ],
        [
          t.community.livesRecovered,
          metric(game.metrics, 'lives_recovered', 'livesRecovered'),
        ],
      ]
    : [
        [t.statGamesPlayed, game.gamesPlayed],
        [t.statWins, game.wins],
        [t.community.kills, metric(game.metrics, 'kills')],
        [t.community.deaths, metric(game.metrics, 'deaths')],
        [
          t.statDamageDealt,
          metric(game.metrics, 'damage_dealt', 'damageDealt'),
        ],
        [
          t.community.shotsFired,
          metric(game.metrics, 'shots_fired', 'shotsFired'),
        ],
        [t.community.shotsHit, metric(game.metrics, 'shots_hit', 'shotsHit')],
        [t.statAccuracy, formatStatPercent(gameAccuracy(game))],
      ];
  return (
    <section className="community-game-card panel">
      <h2>{bombParty ? 'Bomb Party' : 'Tank Arena'}</h2>
      <dl className="community-stat-grid">
        {values.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function RecentGames({
  matches,
}: {
  matches: PlayerStatsView['recentMatches'];
}) {
  return (
    <section className="community-section">
      <div className="section-heading">
        <h2>{t.community.recentGames}</h2>
      </div>
      {matches.length === 0 ? (
        <p className="community-empty">{t.community.noRecentGames}</p>
      ) : (
        <ol className="community-history panel">
          {matches.map((match) => (
            <li key={match.id}>
              <span className={`history-result is-${match.result}`}>
                {match.result === 'win'
                  ? t.community.win
                  : match.result === 'loss'
                    ? t.community.loss
                    : t.community.draw}
              </span>
              <strong>
                {match.gameId === 'bomb-party' ? 'Bomb Party' : 'Tank Arena'}
              </strong>
              <time dateTime={match.playedAt}>
                {formatDate(match.playedAt)}
              </time>
              <span>{formatDuration(match.durationSeconds)}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function LeaderboardFeature({ account }: { account: Account }) {
  const [gameId, setGameId] = useState<GameId>('bomb-party');
  const [selected, setSelected] = useState<LeaderboardMetric>('wins');
  const [rows, setRows] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const options: { value: LeaderboardMetric; label: string }[] = [
    { value: 'wins', label: t.community.winsRanking },
    { value: 'winRate', label: t.community.winRateRanking },
    ...(gameId === 'bomb-party'
      ? [{ value: 'bestStreak' as const, label: t.community.bestStreakRanking }]
      : [{ value: 'kills' as const, label: t.community.killsRanking }]),
  ];

  useEffect(() => {
    if (!options.some((option) => option.value === selected))
      setSelected('wins');
  }, [gameId]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    void loadLeaderboard(gameId, selected)
      .then((next) => {
        if (active) setRows(next);
      })
      .catch((cause) => {
        if (active) setError(errorMessage(cause));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [account.userId, gameId, selected]);

  return (
    <div className="community-content">
      <div className="leaderboard-controls panel">
        <label>
          {t.community.game}
          <select
            value={gameId}
            onChange={(event) => setGameId(event.target.value as GameId)}
          >
            <option value="bomb-party">Bomb Party</option>
            <option value="tank-arena">Tank Arena</option>
          </select>
        </label>
        <label>
          {t.community.rankBy}
          <select
            value={selected}
            onChange={(event) =>
              setSelected(event.target.value as LeaderboardMetric)
            }
          >
            {options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        {selected === 'winRate' && (
          <p className="community-muted">{t.community.minimumGames}</p>
        )}
      </div>
      {error ? (
        <ErrorState message={error} />
      ) : loading ? (
        <LoadingState />
      ) : rows.length === 0 ? (
        <p className="community-empty">{t.community.noLeaderboard}</p>
      ) : (
        <ol className="leaderboard-list panel">
          {rows.map((row) => (
            <li
              key={row.userId}
              className={row.userId === account.userId ? 'is-you' : ''}
            >
              <span className="leaderboard-rank">{row.rank}</span>
              <strong>{row.username}</strong>
              <span>{formatLeaderboardValue(row.value, selected)}</span>
              <small>
                {row.gamesPlayed} {t.statGamesPlayed.toLowerCase()} · {row.wins}{' '}
                {t.statWins.toLowerCase()}
              </small>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function formatLeaderboardValue(value: number, selected: LeaderboardMetric) {
  return selected === 'winRate' ? formatStatPercent(value) : String(value);
}

function LoadingState() {
  return (
    <p className="loading-state" role="status">
      {t.community.loading}
    </p>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <p className="notice" role="alert">
      {message}
    </p>
  );
}

function errorMessage(cause: unknown) {
  if (cause instanceof DataLayerError) {
    if (cause.code === 'not-configured') return t.community.notConfigured;
    if (cause.code === 'username-taken') return t.community.usernameTaken;
    if (cause.code === 'self-request') return t.community.selfRequest;
    if (cause.code === 'already-friends') return t.community.alreadyFriends;
    if (cause.code === 'request-pending') return t.community.requestPending;
    if (cause.code === 'incoming-request') return t.community.incomingRequest;
  }
  return t.community.genericError;
}

function formatDuration(seconds: number) {
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder ? `${hours}h ${remainder}m` : `${hours}h`;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
  }).format(new Date(value));
}
