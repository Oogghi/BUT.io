import { useAppReducedMotion as useReducedMotion } from './MotionPreferences';
import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';

import type { mountGame } from '@but/bomb-party/client';
import type { BombPartySnapshot } from './lobbyConnection';
import { PlayerAvatar } from './Avatar';
import { t } from './i18n';

/** Stable seats for the round; eliminated and disconnected players keep their place. */
export function BombArena({
  state,
  sessionId,
  onPlayerClick,
  wordEntry,
}: {
  state: BombPartySnapshot;
  sessionId: string;
  onPlayerClick: (id: string, anchor: HTMLElement) => void;
  wordEntry: ReactNode;
}) {
  const [seats] = useState(() =>
    state.players.filter((player) => state.game.players.has(player.id)),
  );
  const activeIndex = seats.findIndex(
    (player) => player.id === state.game.activePlayerId,
  );
  const targetAngle = (activeIndex * 360) / seats.length - 90;
  const [angle, setAngle] = useState(targetAngle);
  const [ready, setReady] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  const renderer = useRef<ReturnType<typeof mountGame> | null>(null);
  const arena = useRef<HTMLDivElement>(null);
  const bomb = useRef<HTMLDivElement>(null);
  const reducedMotion = useReducedMotion();
  const { turnId, lastEvent, lastPlayerId } = state.game;
  const exploded = lastEvent === 'exploded';

  // Each new turn reacts to how the last one ended: the bomb hops when a word passes it
  // on, and the whole arena shakes when it explodes. Skipped on the first render.
  const seenTurn = useRef(turnId);
  useEffect(() => {
    if (seenTurn.current === turnId) return;
    seenTurn.current = turnId;
    if (reducedMotion) return;
    if (exploded) {
      arena.current?.animate(
        [0, -9, 8, -5, 3, 0].map((x) => ({ transform: `translateX(${x}px)` })),
        { duration: 420, easing: 'ease-out' },
      );
    } else if (lastEvent === 'accepted') {
      const at = 'translate(-50%, -50%)';
      bomb.current?.animate(
        [
          { transform: `${at} scale(1)` },
          { transform: `${at} scale(1.14) rotate(-6deg)`, offset: 0.35 },
          { transform: `${at} scale(1)` },
        ],
        { duration: 380, easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)' },
      );
    }
  }, [turnId, exploded, lastEvent, reducedMotion]);

  useEffect(() => {
    // Take the short path across the 0/360 boundary instead of spinning backwards.
    setAngle(
      (previous) =>
        previous + ((((targetAngle - previous) % 360) + 540) % 360) - 180,
    );
  }, [targetAngle]);
  useEffect(() => {
    let disposed = false;
    import('@but/bomb-party/client')
      .then(({ mountGame }) => {
        if (!disposed && container.current) {
          renderer.current = mountGame(container.current, () => {
            if (!disposed) setReady(true);
          });
        }
      })
      .catch((error: unknown) => {
        // The DOM bomb, prompt and players remain usable if the renderer cannot start.
        if (!disposed)
          console.warn('Bomb Party is using its DOM renderer.', error);
      });
    return () => {
      disposed = true;
      renderer.current?.destroy();
      renderer.current = null;
    };
  }, []);

  return (
    <div
      ref={arena}
      className="bomb-arena"
      data-crowded={seats.length > 4}
      data-duel={seats.length === 2}
    >
      <svg
        className="turn-arrow"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        aria-hidden="true"
        style={{ opacity: activeIndex < 0 ? 0 : 1 }}
      >
        <g className="turn-arrow-layout">
          <g style={{ transform: `rotate(${angle}deg)` }}>
            <path
              d="M50 50H61"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
            />
            <path
              d="M59.5 47.2 65 50 59.5 52.8Z"
              fill="currentColor"
              stroke="currentColor"
              strokeWidth="0.6"
              strokeLinejoin="round"
            />
          </g>
        </g>
      </svg>
      <div ref={bomb} className="arena-bomb">
        <span className="bomb-glow" aria-hidden="true" />
        {/* Breathes while the fuse burns; the renderer, spark and prompt move together. */}
        <div className="bomb-body">
          {!ready && (
            <div className="bomb-fallback" aria-hidden="true">
              <img src="/images/bomb.png" alt="" />
            </div>
          )}
          <div
            ref={container}
            className={`bomb-canvas ${ready ? 'is-ready' : ''}`}
            aria-hidden="true"
          />
          <span className="bomb-spark" aria-hidden="true" />
          <strong
            key={state.game.prompt}
            className="arena-prompt"
            aria-label={`${t.bp.prompt}: ${state.game.prompt.toUpperCase()}`}
          >
            {state.game.prompt.toUpperCase()}
          </strong>
        </div>
        {exploded && (
          <span key={turnId} className="bomb-burst" aria-hidden="true" />
        )}
      </div>
      <ul className="arena-players" aria-label={t.connectedPlayers}>
        {seats.map((player, index) => {
          const radians = (((index * 360) / seats.length - 90) * Math.PI) / 180;
          const lives = state.game.players.get(player.id)?.lives ?? 0;
          const lostLife =
            state.game.lastEvent === 'exploded' &&
            state.game.lastPlayerId === player.id;
          const connected = state.players.some(
            (current) => current.id === player.id,
          );
          return (
            <li
              key={player.id}
              className={`arena-seat ${player.id === state.game.activePlayerId ? 'is-active' : ''} ${lives === 0 ? 'is-eliminated' : ''}`}
              style={
                {
                  '--seat-x': `${50 + 36 * Math.cos(radians)}%`,
                  '--seat-y': `${50 + 34 * Math.sin(radians)}%`,
                } as CSSProperties
              }
            >
              <button
                type="button"
                className="arena-player"
                disabled={!connected}
                onClick={(event) =>
                  onPlayerClick(player.id, event.currentTarget)
                }
                aria-current={
                  player.id === state.game.activePlayerId ? 'true' : undefined
                }
              >
                <span
                  key={lives}
                  className={`life-avatar ${lostLife ? 'life-lost' : ''}`}
                >
                  <PlayerAvatar avatar={player.avatar} />
                </span>
                <strong title={player.displayName}>{player.displayName}</strong>
                {player.id === sessionId && (
                  <span className="sr-only">{t.you}</span>
                )}
                <span
                  className="arena-lives"
                  aria-label={
                    lives ? `${lives} ${t.bp.lives}` : t.bp.eliminated
                  }
                >
                  <span aria-hidden="true">
                    {lives
                      ? lives <= 5
                        ? '♥'.repeat(lives)
                        : `${lives} ♥`
                      : '×'}
                  </span>
                  {lostLife && (
                    <span
                      key={state.game.turnId}
                      className="lost-heart"
                      aria-hidden="true"
                    >
                      ♥
                    </span>
                  )}
                </span>
              </button>
              <div className="arena-word">
                {player.id === state.game.activePlayerId &&
                player.id === sessionId ? (
                  wordEntry
                ) : (
                  <span
                    // Re-mounts per turn so the word that just passed the bomb pops in.
                    key={
                      lastEvent === 'accepted' && player.id === lastPlayerId
                        ? turnId
                        : 'word'
                    }
                    className={
                      lastEvent === 'accepted' && player.id === lastPlayerId
                        ? 'just-played'
                        : undefined
                    }
                    title={state.game.players.get(player.id)?.lastWord}
                  >
                    {player.id === state.game.activePlayerId
                      ? '…'
                      : state.game.players.get(player.id)?.lastWord || '\u00a0'}
                  </span>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
