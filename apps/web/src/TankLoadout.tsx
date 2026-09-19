import { motion } from 'motion/react';
import { tankIds, tanks } from '@but/tank-arena';
import { t } from './i18n';

const STATS = ['health', 'weight', 'damage'] as const;
const MAX = Object.fromEntries(
  STATS.map((stat) => [
    stat,
    Math.max(...tankIds.map((id) => tanks[id][stat])),
  ]),
) as Record<(typeof STATS)[number], number>;

/** Lobby tank picker; the server stores the choice and uses it when the host starts. */
export function TankLoadout({
  selected,
  send,
}: {
  selected: string | undefined;
  send: (type: string, payload?: unknown) => void;
}) {
  return (
    <fieldset className="tank-loadout">
      <legend>{t.ta.chooseTank}</legend>
      <div className="tank-options">
        {tankIds.map((id) => {
          const info = tanks[id];
          return (
            <motion.button
              key={id}
              type="button"
              className="tank-option"
              aria-pressed={selected === id}
              onClick={() => send('tank', id)}
              whileHover={{ y: -3 }}
              whileTap={{ scale: 0.96 }}
            >
              <motion.img
                src={info.sprite}
                alt=""
                animate={selected === id ? { y: [0, -4, 0] } : { y: 0 }}
                {...(selected === id && {
                  transition: {
                    repeat: Infinity,
                    duration: 1.2,
                    ease: 'easeInOut',
                  },
                })}
              />
              <strong>{info.name}</strong>
              <dl className="tank-stats">
                {STATS.map((stat) => (
                  <div key={stat}>
                    <dt>{t.ta[stat]}</dt>
                    <dd>
                      <span
                        style={{ width: `${(info[stat] / MAX[stat]) * 100}%` }}
                      />
                    </dd>
                  </div>
                ))}
              </dl>
              <span className="tank-abilities">
                {info.abilities
                  .map((ability) => t.ta.actions[ability][0])
                  .join(' · ')}
              </span>
            </motion.button>
          );
        })}
      </div>
    </fieldset>
  );
}
