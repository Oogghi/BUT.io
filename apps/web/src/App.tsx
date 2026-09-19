import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  Link,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useParams,
} from 'react-router';
import { MotionConfig, motion, useReducedMotion } from 'motion/react';
import { ErrorCode, MatchMakeError } from '@colyseus/sdk';
import type { JoinOptions } from '@but/shared';
import { EntryForm } from './EntryForm';
import { LobbyView } from './LobbyView';
import {
  lobbyClient,
  snapshotRoom,
  turnKey,
  type LobbyRoom,
  type LobbySnapshot,
} from './lobbyConnection';
import { spring } from './spring';
import type { Profile } from './profile';
import { lobbyError, planError, wordError, t } from './i18n';
import { CommunityView } from './CommunityView';

/** Join a lobby by invite code, or create a new one for a game. */
export type Destination = { code: string } | { gameId: string };

export default function App() {
  const navigate = useNavigate();
  const location = useLocation();
  const reducedMotion = useReducedMotion();
  const [room, setRoom] = useState<LobbyRoom | null>(null);
  const [snapshot, setSnapshot] = useState<LobbySnapshot | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const requestId = useRef(0);

  useLayoutEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [location.key]);

  // Navigation/unmount invalidates any unfinished create/join request.
  useEffect(() => {
    setPending(false);
    return () => {
      requestId.current++;
    };
  }, [location.key]);

  useEffect(() => {
    setRoom((current) =>
      current && location.pathname.toUpperCase() !== `/LOBBY/${current.roomId}`
        ? null
        : current,
    );
  }, [location.pathname]);

  useEffect(() => {
    setSnapshot(null);
    if (!room) return;
    let lastTurn = '';
    const update = () => {
      if (room.state?.players && room.state.game) {
        const next = snapshotRoom(room);
        if (turnKey(next) !== lastTurn) setError('');
        lastTurn = turnKey(next);
        setSnapshot(next);
      }
    };
    const reportError = () => setError(t.roomError);
    const disconnected = () => {
      setRoom(null);
      setError(t.disconnected);
    };
    room.onStateChange(update);
    const stopErrors = room.onMessage<string>('action-error', (code) =>
      setError(lobbyError(code)),
    );
    const stopWordErrors = room.onMessage<string>('word-error', (code) =>
      setError(wordError(code)),
    );
    const stopPlanErrors = room.onMessage<string>('plan-error', (code) =>
      setError(planError(code)),
    );
    room.onError(reportError);
    room.onLeave(disconnected);
    update();
    return () => {
      room.onStateChange.remove(update);
      room.onError.remove(reportError);
      room.onLeave.remove(disconnected);
      stopErrors();
      stopWordErrors();
      stopPlanErrors();
      if (room.connection.isOpen) void room.leave();
    };
  }, [room]);

  async function connect(profile: Profile, destination: Destination) {
    const options: JoinOptions = profile;
    const attempt = ++requestId.current;
    setPending(true);
    setError('');
    try {
      const joined: LobbyRoom =
        'code' in destination
          ? await lobbyClient.joinById(destination.code, options)
          : await lobbyClient.create(destination.gameId, options);
      joined.reconnection.enabled = false;
      // A canceled request must not leave an invisible player connected.
      if (attempt !== requestId.current) {
        if (joined.connection.isOpen) await joined.leave();
        return;
      }
      setRoom(joined);
      const path = `/lobby/${joined.roomId}`;
      navigate(path, {
        replace: location.pathname.toUpperCase() === path.toUpperCase(),
      });
    } catch (cause) {
      if (attempt === requestId.current) {
        setError(
          cause instanceof MatchMakeError &&
            cause.code === ErrorCode.MATCHMAKE_INVALID_ROOM_ID
            ? t.lobbyNotFound
            : lobbyError(
                cause instanceof Error ? cause.message : '',
                t.connectFailed,
              ),
        );
      }
    } finally {
      if (attempt === requestId.current) setPending(false);
    }
  }

  function leave() {
    setRoom(null);
    setError('');
    navigate('/');
  }

  function send(type: string, payload?: unknown) {
    setError('');
    room?.send(type, payload);
  }

  return (
    <MotionConfig reducedMotion="user" transition={spring}>
      <a className="skip-link" href="#main-content">
        {t.skipToContent}
      </a>
      <header className="site-header shell">
        <Link className="brand" to="/" aria-label={t.homeLabel}>
          <svg className="brand-mark" viewBox="0 0 40 40" aria-hidden="true">
            <g transform="rotate(-10 20 20)">
              <rect
                x="3"
                y="5"
                width="34"
                height="34"
                rx="10"
                className="die-edge"
              />
              <rect
                x="3"
                y="2"
                width="34"
                height="34"
                rx="10"
                className="die-face"
              />
              <circle cx="12" cy="11" r="3.5" className="die-pip" />
              <circle cx="20" cy="19" r="3.5" className="die-pip" />
              <circle cx="28" cy="27" r="3.5" className="die-pip" />
            </g>
          </svg>
          but<span className="brand-suffix">.io</span>
        </Link>
      </header>
      <main className="shell" id="main-content" tabIndex={-1}>
        {room && error && snapshot?.phase !== 'playing' && (
          <p className="notice global-notice" role="alert">
            {error}
          </p>
        )}
        <motion.div
          key={location.pathname}
          initial={reducedMotion ? false : { opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <Routes>
            <Route
              path="/"
              element={
                <EntryForm pending={pending} error={error} connect={connect} />
              }
            />
            <Route
              path="/lobby/:code"
              element={
                <LobbyRoute
                  room={room}
                  snapshot={snapshot}
                  pending={pending}
                  error={error}
                  connect={connect}
                  send={send}
                  leave={leave}
                />
              }
            />
            <Route
              path="/friends"
              element={<CommunityView feature="friends" />}
            />
            <Route path="/stats" element={<CommunityView feature="stats" />} />
            <Route
              path="/leaderboard"
              element={<CommunityView feature="leaderboard" />}
            />
            <Route
              path="*"
              element={
                <>
                  <h1>{t.pageNotFound}</h1>
                  <Link to="/">{t.backHome}</Link>
                </>
              }
            />
          </Routes>
        </motion.div>
      </main>
    </MotionConfig>
  );
}

function LobbyRoute({
  room,
  snapshot,
  pending,
  error,
  connect,
  send,
  leave,
}: {
  room: LobbyRoom | null;
  snapshot: LobbySnapshot | null;
  pending: boolean;
  error: string;
  connect: (profile: Profile, destination: Destination) => Promise<void>;
  send: (type: string, payload?: unknown) => void;
  leave: () => void;
}) {
  const code = useParams().code!.toUpperCase();
  if (!room || room.roomId !== code)
    return (
      <EntryForm
        key={code}
        code={code}
        pending={pending}
        error={error}
        connect={connect}
      />
    );
  if (!snapshot || snapshot.code !== code)
    return (
      <p className="loading-state" role="status">
        {t.loadingLobby}
      </p>
    );
  return (
    <LobbyView
      state={snapshot}
      sessionId={room.sessionId}
      send={send}
      leave={leave}
      error={error}
    />
  );
}
