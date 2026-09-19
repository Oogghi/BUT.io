import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
} from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import {
  actions,
  isTankId,
  tankIds,
  tanks,
  type TankId,
  type TankInfo,
} from '@but/tank-arena';
import { PlayerAvatar } from './Avatar';
import { Icon } from './Icon';
import { t } from './i18n';
import { actionIconStyle, tankAccents, tankIconStyle } from './tankIcons';

interface LobbyMember {
  id: string;
  displayName: string;
  avatar: number;
}

const STATS: readonly {
  label: () => string;
  value: (tank: TankInfo) => number;
  format?: (value: number) => string;
}[] = [
  { label: () => t.ta.health, value: (tank) => tank.health },
  { label: () => t.ta.weight, value: (tank) => tank.weight },
  { label: () => t.ta.damage, value: (tank) => tank.damage },
  {
    label: () => t.ta.accuracy,
    value: (tank) => Math.round(tank.accuracy * 100),
    format: (value) => `${value}%`,
  },
];
const MAX = STATS.map((stat) =>
  Math.max(...tankIds.map((id) => stat.value(tanks[id]))),
);

/**
 * Lobby hangar: a big showcase of the chosen tank (stats, abilities) with arrows and a
 * crest strip to switch. The server stores the choice and uses it when the host starts.
 */
export function TankLoadout({
  selected,
  players,
  loadouts,
  send,
}: {
  selected: string | undefined;
  players: readonly LobbyMember[];
  loadouts: ReadonlyMap<string, string>;
  send: (type: string, payload?: unknown) => void;
}) {
  const current: TankId = isTankId(selected) ? selected : tankIds[0]!;
  const index = tankIds.indexOf(current);
  const info = tanks[current];
  const reducedMotion = useReducedMotion();
  // Which way the showcase slides: toward the tank you moved to.
  const [direction, setDirection] = useState(1);
  // Arrow keys move the choice; focus follows once the server confirms it.
  const roster = useRef<HTMLDivElement>(null);
  const keyboardMove = useRef(false);
  useEffect(() => {
    if (!keyboardMove.current) return;
    keyboardMove.current = false;
    roster.current
      ?.querySelector<HTMLButtonElement>('[aria-checked="true"]')
      ?.focus();
  }, [current]);

  function choose(id: TankId, towards: number) {
    if (id === current) return;
    setDirection(towards);
    send('tank', id);
  }
  function step(delta: number) {
    choose(tankIds[(index + delta + tankIds.length) % tankIds.length]!, delta);
  }
  function onKeyDown(event: KeyboardEvent) {
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      keyboardMove.current = true;
      step(event.key === 'ArrowLeft' ? -1 : 1);
    }
  }

  return (
    <section
      className="tank-hangar"
      aria-labelledby="hangar-title"
      style={{ '--tank-accent': tankAccents[current] } as CSSProperties}
    >
      <h3 id="hangar-title">{t.ta.chooseTank}</h3>

      <div className="hangar-stage">
        <button
          type="button"
          className="hangar-arrow"
          aria-label={t.ta.previousTank}
          onClick={() => step(-1)}
        >
          <Icon name="back" />
        </button>
        <div className="hangar-showcase" aria-hidden="true">
          <span className="hangar-glow" />
          <span className="hangar-platform" />
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.img
              key={current}
              src={info.sprite}
              alt=""
              className="hangar-tank"
              initial={
                reducedMotion
                  ? false
                  : { x: direction * 140, opacity: 0, scale: 0.8 }
              }
              animate={{ x: 0, opacity: 1, scale: 1 }}
              exit={
                reducedMotion
                  ? { opacity: 0 }
                  : { x: direction * -140, opacity: 0, scale: 0.8 }
              }
              transition={{ type: 'spring', visualDuration: 0.35, bounce: 0.3 }}
            />
          </AnimatePresence>
        </div>
        <button
          type="button"
          className="hangar-arrow"
          aria-label={t.ta.nextTank}
          onClick={() => step(1)}
        >
          <Icon name="arrow" />
        </button>
      </div>

      <div className="hangar-details" aria-live="polite">
        <div className="hangar-name">
          <span
            className="hangar-crest"
            style={tankIconStyle(current)}
            aria-hidden="true"
          />
          <span>
            <strong>{info.name}</strong>
            <small>{t.ta.tankRoles[current]}</small>
          </span>
        </div>
        <dl className="hangar-stats">
          {STATS.map((stat, statIndex) => {
            const value = stat.value(info);
            return (
              <div key={statIndex}>
                <dt>{stat.label()}</dt>
                <dd>
                  <span className="hangar-bar" aria-hidden="true">
                    <span
                      style={{ width: `${(value / MAX[statIndex]!) * 100}%` }}
                    />
                  </span>
                  <span>{stat.format ? stat.format(value) : value}</span>
                </dd>
              </div>
            );
          })}
        </dl>
        <ul className="hangar-abilities">
          {info.abilities.map((ability) => {
            const [name, description] = t.ta.actions[ability];
            return (
              <li key={ability}>
                <span
                  className="hangar-ability-icon"
                  style={actionIconStyle(ability)}
                  aria-hidden="true"
                />
                <span>
                  <strong>{name}</strong>
                  <span>{description}</span>
                  <small>{t.ta.cooldownTurns(actions[ability].cooldown)}</small>
                </span>
              </li>
            );
          })}
        </ul>
      </div>

      <div
        ref={roster}
        className="hangar-roster"
        role="radiogroup"
        aria-label={t.ta.chooseTank}
        onKeyDown={onKeyDown}
      >
        {tankIds.map((id, tankIndex) => {
          const pickers = players.filter(
            (player) => loadouts.get(player.id) === id,
          );
          const checked = id === current;
          return (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={checked}
              tabIndex={checked ? 0 : -1}
              className="hangar-pick"
              style={{ '--tank-accent': tankAccents[id] } as CSSProperties}
              onClick={() => choose(id, tankIndex > index ? 1 : -1)}
              title={
                pickers.length
                  ? t.ta.pickedBy(
                      pickers.map((player) => player.displayName).join(', '),
                    )
                  : undefined
              }
            >
              <span
                className="hangar-pick-crest"
                style={tankIconStyle(id)}
                aria-hidden="true"
              />
              <span className="hangar-pick-name">{tanks[id].name}</span>
              <span className="hangar-pick-players" aria-hidden="true">
                {pickers.slice(0, 4).map((player) => (
                  <PlayerAvatar key={player.id} avatar={player.avatar} />
                ))}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
