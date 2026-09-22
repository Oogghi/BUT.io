import {
  memo,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
} from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  BALL_RADIUS,
  CUP_RADIUS,
  HOLES,
  HOLE_SETS,
  STEP,
  ShotSim,
  WALL_WIDTH,
  scoreName,
  totalScore,
  type Hole,
  type MiniGolfPlayer,
  type MiniGolfSettings,
  type Point,
} from '@but/mini-golf';
import type { MiniGolfSnapshot } from './lobbyConnection';
import { PlayerAvatar } from './Avatar';
import { Icon } from './Icon';
import { Timer } from './BlackjackPlay';
import { t } from './i18n';
import { useAppReducedMotion } from './MotionPreferences';
import './mini-golf.css';

type Send = (type: string, payload?: unknown) => void;
type Vector = { dx: number; dy: number };

/** Ball colours by seat, matching the site's accent palette. */
const BALL_COLORS = [
  '#ff6b4a',
  '#6cc4ff',
  '#ffc43d',
  '#a78bfa',
  '#45dcae',
  '#ff5ba6',
] as const;
/** Dragging this far (world units) is a full-power putt. */
const PULL_FULL = 150;
const MIN_POWER = 0.04;
const EFFECT_MS = 1500;

const pathOf = (points: readonly Point[]) =>
  points
    .map((point, index) => `${index ? 'L' : 'M'}${point.x} ${point.y}`)
    .join('') + 'Z';

/** Strokes relative to par so far, the way golfers read a running score. */
function relativeLabel(player: MiniGolfPlayer, pars: readonly number[]) {
  const relative =
    totalScore(player) -
    pars.slice(0, player.scores.length).reduce((a, b) => a + b, 0);
  return relative === 0
    ? t.mg.even
    : relative > 0
      ? `+${relative}`
      : `${relative}`;
}

function courseHoles(holes: MiniGolfSettings['holes']) {
  return HOLE_SETS[holes].map((id) => HOLES[id]!);
}

export function MiniGolfSettingsPanel({
  settings,
  host,
  send,
}: {
  settings: MiniGolfSettings;
  host: boolean;
  send: Send;
}) {
  return (
    <section className="mg-setup" aria-label="Mini Golf">
      <p>{t.mg.rules}</p>
      <div className="mg-setup-fields">
        <label>
          {t.mg.holes}
          <select
            disabled={!host}
            value={settings.holes}
            onChange={(event) =>
              send('settings', {
                ...settings,
                holes: Number(event.target.value),
              })
            }
          >
            {([3, 6, 9] as const).map((count) => (
              <option key={count} value={count}>
                {t.mg.holesCount(count)}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t.mg.shotTimer}
          <select
            disabled={!host}
            value={settings.shotSeconds}
            onChange={(event) =>
              send('settings', {
                ...settings,
                shotSeconds: Number(event.target.value),
              })
            }
          >
            {([20, 30, 45] as const).map((seconds) => (
              <option key={seconds} value={seconds}>
                {t.mg.seconds(seconds)}
              </option>
            ))}
          </select>
        </label>
      </div>
      <ol className="mg-setup-holes">
        {courseHoles(settings.holes).map((hole, index) => (
          <li key={hole.name}>
            <b>{index + 1}</b>
            <span>{hole.name}</span>
            <small>{t.mg.par(hole.par)}</small>
          </li>
        ))}
      </ol>
    </section>
  );
}

/** The parts of a hole that never move, drawn once per hole. */
const CourseArt = memo(function CourseArt({
  hole,
  ids,
}: {
  hole: Hole;
  ids: Record<'mow' | 'sand' | 'water' | 'bumper' | 'clip' | 'cup', string>;
}) {
  const outline = pathOf(hole.outline);
  const { cup, tee } = hole;
  return (
    <>
      <defs>
        <pattern
          id={ids.mow}
          width="56"
          height="56"
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(-32)"
        >
          <rect width="56" height="56" fill="#4cc064" />
          <rect width="28" height="56" fill="#45b65c" />
        </pattern>
        <pattern
          id={ids.sand}
          width="12"
          height="12"
          patternUnits="userSpaceOnUse"
        >
          <rect width="12" height="12" fill="#f3d894" />
          <circle cx="3" cy="3" r="1.2" fill="#dcb865" />
          <circle cx="9" cy="8" r="1" fill="#e6c77e" />
        </pattern>
        <pattern
          id={ids.water}
          width="44"
          height="18"
          patternUnits="userSpaceOnUse"
        >
          <rect width="44" height="18" fill="#3aa6f2" />
          <path
            d="M0 9 q11 -6 22 0 t22 0"
            stroke="#9ad7ff"
            strokeWidth="2"
            fill="none"
            opacity="0.7"
          />
        </pattern>
        <radialGradient id={ids.bumper} cx="38%" cy="34%" r="70%">
          <stop offset="0" stopColor="#ffd0db" />
          <stop offset="0.45" stopColor="#ff6f93" />
          <stop offset="1" stopColor="#c93763" />
        </radialGradient>
        <radialGradient id={ids.cup} cx="50%" cy="40%" r="60%">
          <stop offset="0" stopColor="#020b05" />
          <stop offset="1" stopColor="#12351d" />
        </radialGradient>
        <clipPath id={ids.clip}>
          <path d={outline} />
        </clipPath>
      </defs>

      {/* The slab the green sits on, so the course reads as a raised object. */}
      <path d={outline} className="mg-slab" transform="translate(0 12)" />
      <path d={outline} fill={`url(#${ids.mow})`} />
      <g clipPath={`url(#${ids.clip})`}>
        <path d={outline} className="mg-vignette" />
        {hole.sand.map((zone, index) => (
          <path
            key={index}
            d={pathOf(zone)}
            fill={`url(#${ids.sand})`}
            className="mg-sand"
          />
        ))}
        {hole.water.map((zone, index) => (
          <g key={index}>
            <path
              d={pathOf(zone)}
              fill={`url(#${ids.water})`}
              className="mg-water"
            />
            <path d={pathOf(zone)} className="mg-water-shine" />
          </g>
        ))}
        {hole.boosts.map((boost, index) => {
          const angle = (Math.atan2(boost.dy, boost.dx) * 180) / Math.PI;
          const cx = boost.x + boost.w / 2;
          const cy = boost.y + boost.h / 2;
          return (
            <g key={index} className="mg-boost">
              <rect
                x={boost.x}
                y={boost.y}
                width={boost.w}
                height={boost.h}
                rx="10"
              />
              <g transform={`translate(${cx} ${cy}) rotate(${angle})`}>
                {[-16, 0, 16].map((offset, chevron) => (
                  <path
                    key={offset}
                    d={`M${offset - 6} -10 L${offset + 4} 0 L${offset - 6} 10`}
                    style={{ animationDelay: `${chevron * 0.15}s` }}
                  />
                ))}
              </g>
            </g>
          );
        })}
        <rect
          x={tee.x - 24}
          y={tee.y - 13}
          width="48"
          height="26"
          rx="8"
          className="mg-tee"
        />
      </g>

      {/* Walls: a dark lower edge, then the cream rail on top. */}
      <g className="mg-walls" strokeWidth={WALL_WIDTH}>
        <g transform="translate(0 4)" className="mg-wall-shadow">
          <path d={outline} />
          {hole.walls.map(([a, b], index) => (
            <line key={index} x1={a.x} y1={a.y} x2={b.x} y2={b.y} />
          ))}
        </g>
        <g className="mg-wall-top">
          <path d={outline} />
          {hole.walls.map(([a, b], index) => (
            <line key={index} x1={a.x} y1={a.y} x2={b.x} y2={b.y} />
          ))}
        </g>
      </g>

      {hole.bumpers.map((bumper, index) => (
        <g key={index} className="mg-bumper">
          <circle
            cx={bumper.x}
            cy={bumper.y + 4}
            r={bumper.r}
            className="mg-bumper-shadow"
          />
          <circle
            cx={bumper.x}
            cy={bumper.y}
            r={bumper.r}
            fill={`url(#${ids.bumper})`}
          />
          <circle
            cx={bumper.x}
            cy={bumper.y}
            r={bumper.r - 4}
            className="mg-bumper-ring"
          />
        </g>
      ))}

      <circle cx={cup.x} cy={cup.y} r={CUP_RADIUS + 3} className="mg-cup-rim" />
      <circle cx={cup.x} cy={cup.y} r={CUP_RADIUS} fill={`url(#${ids.cup})`} />
    </>
  );
});

/** The flag stands above the balls so it stays visible when one sits beside the cup. */
function Flag({ cup }: { cup: Point }) {
  return (
    <g className="mg-flag" transform={`translate(${cup.x} ${cup.y})`}>
      <line x1="0" y1="0" x2="0" y2="-64" className="mg-flag-pole" />
      <path
        d="M1.5 -64 C14 -62 20 -56 32 -57 C24 -50 16 -46 1.5 -45 Z"
        className="mg-flag-cloth"
      />
    </g>
  );
}

interface Effect {
  key: number;
  kind: 'sunk' | 'splash';
  x: number;
  y: number;
  holeInOne: boolean;
}

interface Playback {
  sim: ShotSim;
  started: number;
  shown: number;
}

export function MiniGolfPlay({
  state,
  sessionId,
  send,
}: {
  state: MiniGolfSnapshot;
  sessionId: string;
  send: Send;
}) {
  const { game, settings } = state;
  const hole = HOLES[game.holeId]!;
  const holes = courseHoles(settings.holes);
  const pars = holes.map((entry) => entry.par);
  const reduced = useAppReducedMotion();
  const uid = useId().replace(/:/g, '');
  const ids = useMemo(
    () => ({
      mow: `${uid}-mow`,
      sand: `${uid}-sand`,
      water: `${uid}-water`,
      bumper: `${uid}-bumper`,
      clip: `${uid}-clip`,
      cup: `${uid}-cup`,
    }),
    [uid],
  );
  const order = [...game.players.keys()];
  const color = (id: string) =>
    BALL_COLORS[Math.max(0, order.indexOf(id)) % BALL_COLORS.length]!;
  const name = (id: string) =>
    state.players.find((player) => player.id === id)?.displayName ?? t.mg.left;
  const me = game.players.get(sessionId);
  const myTurn = game.activePlayerId === sessionId && game.stage === 'aiming';

  // Replay each new shot locally with the same physics the server ran.
  const [playback, setPlayback] = useState<Playback | null>(null);
  const [effects, setEffects] = useState<Effect[]>([]);
  const [, setFrame] = useState(0);
  const seenShot = useRef(game.shotSeq);
  const effectKey = useRef(0);
  useEffect(() => {
    if (game.shotSeq === seenShot.current || !game.shot) return;
    seenShot.current = game.shotSeq;
    const shot = game.shot;
    const sim = new ShotSim(hole, shot.start, shot.playerId, shot.dx, shot.dy);
    if (reduced) {
      sim.run();
      setEffects(
        sim.events.map((event) => ({
          key: effectKey.current++,
          kind: event.kind,
          x: event.x,
          y: event.y,
          holeInOne:
            event.kind === 'sunk' && game.players.get(event.id)?.strokes === 1,
        })),
      );
      return;
    }
    setPlayback({ sim, started: performance.now(), shown: 0 });
    // The shot belongs to this hole; its record is replaced, never mutated.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game.shotSeq]);

  useEffect(() => {
    if (!playback) return;
    let frame = 0;
    const tick = () => {
      const due = Math.floor(
        (performance.now() - playback.started) / (STEP * 1000),
      );
      while (playback.sim.step < due && !playback.sim.done)
        playback.sim.advance();
      const fresh = playback.sim.events.slice(playback.shown);
      if (fresh.length) {
        playback.shown += fresh.length;
        setEffects((current) => [
          ...current,
          ...fresh.map((event) => ({
            key: effectKey.current++,
            kind: event.kind,
            x: event.x,
            y: event.y,
            holeInOne:
              event.kind === 'sunk' &&
              game.players.get(event.id)?.strokes === 1,
          })),
        ]);
      }
      setFrame((value) => value + 1);
      if (playback.sim.done) setPlayback(null);
      else frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
    // Game state is read only for labels; the playback itself drives this loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playback]);

  useEffect(() => {
    if (!effects.length) return;
    const timer = setTimeout(
      () => setEffects((current) => current.slice(1)),
      EFFECT_MS,
    );
    return () => clearTimeout(timer);
  }, [effects]);

  // A missed shot clock is the one moment playback can't show; say it in words.
  const [notice, setNotice] = useState('');
  const seenNotice = useRef(game.noticeSeq);
  useEffect(() => {
    if (game.noticeSeq === seenNotice.current) return;
    seenNotice.current = game.noticeSeq;
    const [kind, id = ''] = game.notice.split(':');
    if (kind === 'timeout') setNotice(t.mg.timeout(name(id)));
    const timer = setTimeout(() => setNotice(''), 2600);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game.noticeSeq]);

  const balls = playback
    ? playback.sim.balls
        .filter((ball) => ball.onCourse && !ball.sunk)
        .map((ball) => ({ id: ball.id, x: ball.x, y: ball.y }))
    : [...game.players]
        .filter(
          ([id, player]) =>
            !player.departed &&
            !player.sunk &&
            (player.onCourse ||
              (id === game.activePlayerId && game.stage === 'aiming')),
        )
        .map(([id, player]) => ({ id, x: player.x, y: player.y }));

  // Aiming: drag anywhere (pull back like a slingshot) or use the keyboard.
  const svg = useRef<SVGSVGElement>(null);
  const drag = useRef<Point | null>(null);
  const [aim, setAim] = useState<Vector | null>(null);
  const keyAim = useRef<{ angle: number; power: number } | null>(null);
  const canAim = myTurn && !playback && Boolean(me);
  useEffect(() => {
    setAim(null);
    keyAim.current = null;
    drag.current = null;
  }, [game.activePlayerId, game.shotSeq, game.holeId]);

  const toWorld = (event: PointerEvent) => {
    const element = svg.current!;
    const point = element.createSVGPoint();
    point.x = event.clientX;
    point.y = event.clientY;
    return point.matrixTransform(element.getScreenCTM()!.inverse());
  };
  const putt = (vector: Vector | null) => {
    setAim(null);
    keyAim.current = null;
    if (!vector) return;
    const power = Math.hypot(vector.dx, vector.dy);
    if (power >= MIN_POWER) send('shot', vector);
  };
  const onPointerDown = (event: PointerEvent<SVGSVGElement>) => {
    if (!canAim || event.button > 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = toWorld(event);
    setAim(null);
  };
  const onPointerMove = (event: PointerEvent<SVGSVGElement>) => {
    const start = drag.current;
    if (!start) return;
    const point = toWorld(event);
    const pullX = start.x - point.x;
    const pullY = start.y - point.y;
    const length = Math.hypot(pullX, pullY);
    if (length < 4) return setAim(null);
    const power = Math.min(1, length / PULL_FULL);
    setAim({ dx: (pullX / length) * power, dy: (pullY / length) * power });
  };
  const onPointerUp = () => {
    if (!drag.current) return;
    drag.current = null;
    putt(aim);
  };
  const onKeyDown = (event: KeyboardEvent<SVGSVGElement>) => {
    if (!canAim || !me) return;
    const current = keyAim.current ?? {
      angle: Math.atan2(hole.cup.y - me.y, hole.cup.x - me.x),
      power: 0.5,
    };
    const next = { ...current };
    if (event.key === 'ArrowLeft') next.angle -= Math.PI / 60;
    else if (event.key === 'ArrowRight') next.angle += Math.PI / 60;
    else if (event.key === 'ArrowUp')
      next.power = Math.min(1, next.power + 0.05);
    else if (event.key === 'ArrowDown')
      next.power = Math.max(0.05, next.power - 0.05);
    else if (event.key === ' ' || event.key === 'Enter') {
      event.preventDefault();
      putt(keyAim.current ? aim : null);
      return;
    } else return;
    event.preventDefault();
    keyAim.current = next;
    setAim({
      dx: Math.cos(next.angle) * next.power,
      dy: Math.sin(next.angle) * next.power,
    });
  };

  const minX = Math.min(...hole.outline.map((point) => point.x)) - 24;
  const maxX = Math.max(...hole.outline.map((point) => point.x)) + 24;
  const minY = Math.min(...hole.outline.map((point) => point.y)) - 80;
  const maxY = Math.max(...hole.outline.map((point) => point.y)) + 36;
  const power = aim ? Math.hypot(aim.dx, aim.dy) : 0;
  const aimColor =
    power < 0.45 ? '#45dcae' : power < 0.8 ? '#ffc43d' : '#ff6b4a';

  const status = !game.activePlayerId
    ? ''
    : playback || game.stage === 'rolling'
      ? t.mg.rolling
      : myTurn
        ? t.mg.yourShot
        : t.mg.putting(name(game.activePlayerId));

  return (
    <div className="mg-play" data-your-turn={myTurn}>
      <header className="mg-bar">
        <div className="mg-hole-title">
          <span className="mg-hole-number">{game.hole + 1}</span>
          <div>
            <strong>{hole.name}</strong>
            <span>
              {t.mg.hole(game.hole + 1, game.holeCount)} · {t.mg.par(hole.par)}
            </span>
          </div>
        </div>
        <p className="mg-status" aria-live="polite">
          {game.activePlayerId && (
            <span
              className="mg-status-ball"
              style={{ background: color(game.activePlayerId) }}
            />
          )}
          {status}
        </p>
        {game.stage === 'aiming' && (
          <Timer
            endsAt={game.endsAt}
            seconds={settings.shotSeconds}
            urgent={myTurn}
          />
        )}
      </header>

      <section className="mg-stage" aria-label={hole.name}>
        <AnimatePresence>
          <motion.div
            key={game.holeId}
            className="mg-hole-intro"
            initial={{ opacity: 0, y: 16, scale: 0.9 }}
            animate={{ opacity: [0, 1, 1, 0], y: 0, scale: 1 }}
            transition={{
              duration: reduced ? 0.01 : 2.2,
              times: [0, 0.15, 0.75, 1],
            }}
            aria-hidden="true"
          >
            <span>{t.mg.hole(game.hole + 1, game.holeCount)}</span>
            <strong>{hole.name}</strong>
            <em>{t.mg.par(hole.par)}</em>
          </motion.div>
        </AnimatePresence>

        <svg
          ref={svg}
          className={`mg-course${canAim ? ' can-aim' : ''}`}
          viewBox={`${minX} ${minY} ${maxX - minX} ${maxY - minY}`}
          role="img"
          aria-label={`${hole.name}, ${t.mg.par(hole.par)}`}
          tabIndex={canAim ? 0 : -1}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={() => {
            drag.current = null;
            setAim(null);
          }}
          onKeyDown={onKeyDown}
        >
          <CourseArt hole={hole} ids={ids} />

          {balls.map((ball) => (
            <g key={ball.id} transform={`translate(${ball.x} ${ball.y})`}>
              <ellipse
                cx="2"
                cy="5"
                rx={BALL_RADIUS}
                ry={BALL_RADIUS * 0.6}
                className="mg-ball-shadow"
              />
              {ball.id === game.activePlayerId &&
                game.stage === 'aiming' &&
                !playback && (
                  <circle
                    r={BALL_RADIUS + 7}
                    className="mg-ball-turn"
                    stroke={color(ball.id)}
                  />
                )}
              <circle
                r={BALL_RADIUS}
                fill={color(ball.id)}
                className="mg-ball"
              />
              <circle cx="-2.6" cy="-2.8" r="2.6" className="mg-ball-shine" />
            </g>
          ))}

          {aim && me && (
            <g className="mg-aim" style={{ color: aimColor }}>
              <line
                x1={me.x}
                y1={me.y}
                x2={me.x - (aim.dx / power) * (18 + power * 70)}
                y2={me.y - (aim.dy / power) * (18 + power * 70)}
                className="mg-aim-pull"
              />
              <line
                x1={me.x + (aim.dx / power) * (BALL_RADIUS + 4)}
                y1={me.y + (aim.dy / power) * (BALL_RADIUS + 4)}
                x2={me.x + (aim.dx / power) * (BALL_RADIUS + 26 + power * 150)}
                y2={me.y + (aim.dy / power) * (BALL_RADIUS + 26 + power * 150)}
                className="mg-aim-line"
              />
              <circle
                cx={me.x + (aim.dx / power) * (BALL_RADIUS + 26 + power * 150)}
                cy={me.y + (aim.dy / power) * (BALL_RADIUS + 26 + power * 150)}
                r="5"
                className="mg-aim-tip"
              />
              <text x={me.x} y={me.y + 30} className="mg-aim-power">
                {Math.round(power * 100)}%
              </text>
            </g>
          )}

          <Flag cup={hole.cup} />

          {effects.map((effect) => (
            <g
              key={effect.key}
              className={`mg-effect is-${effect.kind}`}
              transform={`translate(${effect.x} ${effect.y})`}
            >
              <circle r="10" className="mg-effect-ring" />
              <circle r="10" className="mg-effect-ring is-late" />
              <text y="-26">
                {effect.kind === 'splash'
                  ? t.mg.splash
                  : effect.holeInOne
                    ? t.mg.names['hole-in-one']
                    : t.mg.inTheHole}
              </text>
            </g>
          ))}
        </svg>

        <AnimatePresence>
          {notice && (
            <motion.p
              key={notice}
              className="mg-notice"
              role="status"
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
            >
              {notice}
            </motion.p>
          )}
        </AnimatePresence>

        {game.stage === 'hole-over' && (
          <HoleSummary
            state={state}
            hole={hole}
            color={color}
            name={name}
            last={game.hole + 1 >= game.holeCount}
          />
        )}

        {canAim && (
          <p className="mg-hint">
            <Icon name="arrow" /> {t.mg.aimHint}
            <span>{t.mg.keyHint}</span>
          </p>
        )}
      </section>

      <aside className="mg-board" aria-label={t.mg.scorecard}>
        <h2>{t.mg.scorecard}</h2>
        <ol>
          {order.map((id) => {
            const player = game.players.get(id)!;
            const lobby = state.players.find((entry) => entry.id === id);
            return (
              <li
                key={id}
                className={`${id === game.activePlayerId ? 'is-active' : ''}${player.departed ? ' is-departed' : ''}`}
                style={{ '--ball': color(id) } as CSSProperties}
              >
                <span className="mg-board-avatar">
                  <PlayerAvatar avatar={lobby?.avatar ?? 0} />
                  <i aria-hidden="true" />
                </span>
                <div>
                  <strong>
                    {lobby?.displayName ?? t.mg.left}
                    {id === sessionId && <small> · {t.mg.you}</small>}
                  </strong>
                  <span>
                    {player.sunk ? (
                      <b className="mg-board-in">
                        <Icon name="check" /> {t.mg.strokes(player.strokes)}
                      </b>
                    ) : player.onCourse || player.strokes ? (
                      t.mg.strokes(player.strokes)
                    ) : (
                      t.mg.waitingTee
                    )}
                  </span>
                </div>
                <span className="mg-board-total" title={t.mg.total}>
                  {totalScore(player)}
                  <small>{relativeLabel(player, pars)}</small>
                </span>
              </li>
            );
          })}
        </ol>
      </aside>
    </div>
  );
}

function HoleSummary({
  state,
  hole,
  color,
  name,
  last,
}: {
  state: MiniGolfSnapshot;
  hole: Hole;
  color: (id: string) => string;
  name: (id: string) => string;
  last: boolean;
}) {
  const rows = [...state.game.players]
    .filter(([, player]) => !player.departed)
    .map(([id, player]) => ({ id, score: player.scores.at(-1) ?? 0 }))
    .sort((a, b) => a.score - b.score);
  return (
    <motion.div
      className="mg-summary"
      initial={{ opacity: 0, scale: 0.92, y: 12 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      role="status"
    >
      <h3>{t.mg.holeComplete(state.game.hole + 1)}</h3>
      <ol>
        {rows.map(({ id, score }, index) => {
          const label = scoreName(score, hole.par);
          return (
            <motion.li
              key={id}
              initial={{ opacity: 0, x: -12 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.15 + index * 0.08 }}
            >
              <i style={{ background: color(id) }} aria-hidden="true" />
              <strong>{name(id)}</strong>
              <span className={`mg-score-name is-${label}`}>
                {t.mg.names[label]}
              </span>
              <b>{score}</b>
            </motion.li>
          );
        })}
      </ol>
      <p>{last ? t.mg.lastHole : t.mg.nextHole}</p>
      <span className="mg-summary-bar" aria-hidden="true" />
    </motion.div>
  );
}

export function MiniGolfResults({
  state,
  sessionId,
  host,
  send,
}: {
  state: MiniGolfSnapshot;
  sessionId: string;
  host: boolean;
  send: Send;
}) {
  const holes = courseHoles(state.settings.holes);
  const order = [...state.game.players.keys()];
  const rows = order
    .map((id) => ({ id, player: state.game.players.get(id)! }))
    .sort(
      (a, b) =>
        Number(a.player.departed) - Number(b.player.departed) ||
        totalScore(a.player) - totalScore(b.player),
    );
  const winner = state.players.find(
    (player) => player.id === state.game.winnerId,
  );
  const parTotal = holes.reduce((sum, hole) => sum + hole.par, 0);
  return (
    <section className="mg-results">
      <img src="/images/mini-golf.svg" alt="" width="160" height="160" />
      <h2>
        {state.resultReason === 'tie'
          ? t.mg.tie
          : winner?.id === sessionId && order.length === 1
            ? t.mg.finished
            : winner
              ? t.winner(winner.displayName)
              : t.mg.finished}
      </h2>
      {state.resultReason === 'departure' && <p>{t.winnerDeparture}</p>}
      <div className="mg-card-scroll">
        <table className="mg-card">
          <thead>
            <tr>
              <th scope="col">{t.mg.scorecard}</th>
              {holes.map((hole, index) => (
                <th key={hole.name} scope="col" title={hole.name}>
                  {index + 1}
                </th>
              ))}
              <th scope="col">{t.mg.total}</th>
            </tr>
            <tr className="mg-card-par">
              <th scope="row">Par</th>
              {holes.map((hole) => (
                <td key={hole.name}>{hole.par}</td>
              ))}
              <td>{parTotal}</td>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ id, player }) => (
              <tr
                key={id}
                className={`${id === state.game.winnerId ? 'is-winner' : ''}${id === sessionId ? ' is-you' : ''}`}
              >
                <th scope="row">
                  <i
                    style={{
                      background:
                        BALL_COLORS[order.indexOf(id) % BALL_COLORS.length],
                    }}
                    aria-hidden="true"
                  />
                  {state.players.find((entry) => entry.id === id)
                    ?.displayName ?? t.mg.left}
                </th>
                {holes.map((hole, index) => {
                  const score = player.scores[index];
                  return (
                    <td
                      key={hole.name}
                      className={
                        score === undefined
                          ? ''
                          : `is-${scoreName(score, hole.par)}`
                      }
                    >
                      {score ?? '–'}
                    </td>
                  );
                })}
                <td className="mg-card-total">{totalScore(player)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {host ? (
        <button
          className="button primary"
          type="button"
          onClick={() => send('return')}
        >
          {t.returnToLobby}
        </button>
      ) : (
        <p>{t.waitingHost}</p>
      )}
    </section>
  );
}
