import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { animate, useReducedMotion } from 'motion/react';
import { winRate } from '@but/shared';
import { PlayerAvatar } from './Avatar';
import { Icon } from './Icon';
import { spring } from './spring';
import { t } from './i18n';
import {
  gameAccuracy,
  loadPlayerStatsByUsername,
  metric,
  type PlayerStatsView,
} from './supabaseData';

export interface StatsSubject {
  displayName: string;
  avatar: number;
  host?: boolean;
  you?: boolean;
}

/** Which stats card is open and the element it is anchored to; re-clicking a trigger closes it. */
export function useStatsTarget<T>() {
  const [target, setTarget] = useState<{ id: T; anchor: HTMLElement } | null>(
    null,
  );
  const close = useCallback(() => setTarget(null), []);
  return {
    target,
    toggle(id: T, anchor: HTMLElement) {
      setTarget((current) => (current?.id === id ? null : { id, anchor }));
    },
    close,
  };
}

/**
 * A small stats card next to `anchor`; closes on outside click or Escape.
 *
 * It is a *manual* popover (top-layer rendering only): closing is driven here so the exit
 * animation can finish before the card is hidden. Browser light dismiss would hide it
 * instantly, and CSS exit transitions for popovers don't work in Firefox.
 */
export function StatsPopover({
  player,
  anchor,
  onClose,
}: {
  player: StatsSubject | null;
  anchor: HTMLElement | null;
  onClose: () => void;
}) {
  const popover = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const animation = useRef<ReturnType<typeof animate> | null>(null);
  const reducedMotion = useReducedMotion();
  // Keep showing the last player while the card animates closed.
  const lastPlayer = useRef(player);
  if (player) lastPlayer.current = player;
  const shown = player ?? lastPlayer.current;
  // Only opening/closing and the anchor drive the animation, not every re-render.
  const open = Boolean(player && anchor);
  const [stats, setStats] = useState<PlayerStatsView | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const name = shown?.displayName ?? '';

  useEffect(() => {
    if (!open || !name) return;
    let active = true;
    setStats(null);
    setLoading(true);
    setFailed(false);
    void loadPlayerStatsByUsername(name)
      .then((next) => {
        if (active) setStats(next);
      })
      .catch(() => {
        if (active) setFailed(true);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [open, name]);

  const overall = stats?.global;
  const summary = [
    { label: t.statGamesPlayed, value: String(overall?.gamesPlayed ?? 0) },
    { label: t.statWins, value: String(overall?.wins ?? 0) },
    {
      label: t.statWinRate,
      value: formatPercent(overall ? winRate(overall) : 0),
    },
    {
      label: t.statPlaytime,
      value: formatPlaytime(overall?.playtimeSeconds ?? 0),
    },
  ];

  useLayoutEffect(
    () => () => {
      animation.current?.stop();
      animation.current = null;
    },
    [],
  );

  useLayoutEffect(() => {
    const element = popover.current;
    if (!element) return;
    animation.current?.stop();
    const hiddenPose = () => ({
      opacity: 0,
      scale: 0.94,
      y: element.dataset.side === 'above' ? 4 : -4,
    });

    if (!open || !anchor) {
      if (!element.matches(':popover-open')) return;
      const exit = animate(
        element,
        hiddenPose(),
        reducedMotion ? { duration: 0 } : { duration: 0.18, ease: 'easeIn' },
      );
      animation.current = exit;
      void exit.then(() => {
        if (animation.current === exit) element.hidePopover();
      });
      return;
    }

    // Below the anchor when it fits, otherwise above; always inside the viewport.
    // offsetWidth/Height ignore the in-flight scale, so placement doesn't wobble.
    const place = () => {
      const from = anchor.getBoundingClientRect();
      const width = element.offsetWidth;
      const height = element.offsetHeight;
      const below = from.bottom + 10 + height <= innerHeight - 8;
      element.style.top = `${below ? from.bottom + 10 : Math.max(8, from.top - 10 - height)}px`;
      element.style.left = `${Math.min(Math.max(8, from.left), innerWidth - width - 8)}px`;
      element.dataset.side = below ? 'below' : 'above';
    };
    const opening = !element.matches(':popover-open');
    if (opening) element.showPopover();
    place();
    // Opening starts from the hidden pose; reopening mid-exit continues from where it is.
    const visible = { opacity: 1, scale: 1, y: 0 };
    const from = hiddenPose();
    animation.current = animate(
      element,
      opening
        ? {
            opacity: [from.opacity, 1],
            scale: [from.scale, 1],
            y: [from.y, 0],
          }
        : visible,
      reducedMotion ? { duration: 0 } : spring,
    );

    const outside = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!element.contains(target) && !anchor.contains(target)) onClose();
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    addEventListener('scroll', place, true);
    addEventListener('resize', place);
    addEventListener('pointerdown', outside);
    addEventListener('keydown', escape);
    return () => {
      removeEventListener('scroll', place, true);
      removeEventListener('resize', place);
      removeEventListener('pointerdown', outside);
      removeEventListener('keydown', escape);
    };
  }, [open, anchor, reducedMotion, onClose]);

  return (
    <div
      ref={popover}
      popover="manual"
      role="dialog"
      aria-labelledby={titleId}
      aria-hidden={!open}
      inert={!open}
      className="stats-popover"
    >
      {shown && (
        <>
          <header className="stats-header">
            <PlayerAvatar avatar={shown.avatar} />
            <div>
              <h2 id={titleId}>{shown.displayName}</h2>
              <p className="stats-tags">
                {shown.you && <span>{t.you}</span>}
                {shown.host && (
                  <span className="stats-host">
                    <Icon name="crown" /> {t.host}
                  </span>
                )}
              </p>
            </div>
          </header>
          {loading ? (
            <p className="stats-empty">{t.community.loading}</p>
          ) : failed ? (
            <p className="stats-empty">{t.community.genericError}</p>
          ) : !stats || stats.global.gamesPlayed === 0 ? (
            <p className="stats-empty">{t.noStatsYet}</p>
          ) : (
            <>
              <dl className="stats-grid">
                {summary.map(({ label, value }) => (
                  <div className="stat" key={label}>
                    <dt>{label}</dt>
                    <dd>{value}</dd>
                  </div>
                ))}
              </dl>
              <div className="stats-game-list">
                <section className="stats-game">
                  <h3>Bomb Party</h3>
                  <dl className="stats-game-grid">
                    <div>
                      <dt>{t.statWordsAccepted}</dt>
                      <dd>
                        {metric(
                          stats.games['bomb-party'].metrics,
                          'words_accepted',
                          'wordsAccepted',
                        )}
                      </dd>
                    </div>
                    <div>
                      <dt>{t.statGamesPlayed}</dt>
                      <dd>{stats.games['bomb-party'].gamesPlayed}</dd>
                    </div>
                  </dl>
                </section>
                <section className="stats-game">
                  <h3>Tank Arena</h3>
                  <dl className="stats-game-grid">
                    <div>
                      <dt>{t.statAccuracy}</dt>
                      <dd>
                        {formatPercent(gameAccuracy(stats.games['tank-arena']))}
                      </dd>
                    </div>
                    <div>
                      <dt>{t.statDamageDealt}</dt>
                      <dd>
                        {metric(
                          stats.games['tank-arena'].metrics,
                          'damage_dealt',
                          'damageDealt',
                        )}
                      </dd>
                    </div>
                  </dl>
                </section>
              </div>
              <p className="stats-empty">{t.community.statsDescription}</p>
            </>
          )}
        </>
      )}
    </div>
  );
}

function formatPercent(value: number) {
  return `${Math.round((value || 0) * 100)}%`;
}

function formatPlaytime(seconds: number) {
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder ? `${hours}h ${remainder}m` : `${hours}h`;
}
