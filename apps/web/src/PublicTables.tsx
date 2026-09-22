import { useEffect, useState } from 'react';
import { AnimatePresence, motion, type MotionStyle } from 'motion/react';
import type { PublicTable } from '@but/shared';
import { serverHttpUrl } from './lobbyConnection';
import { gameCards } from './gameCards';
import { Icon } from './Icon';
import { t } from './i18n';
import { spring } from './spring';
import { useAppReducedMotion } from './MotionPreferences';

const REFRESH_MS = 5000;

/** Tables hosts have made public, refreshed while the join panel stays open. */
export function PublicTables({
  disabled,
  onJoin,
}: {
  disabled: boolean;
  onJoin: (code: string) => void;
}) {
  const [tables, setTables] = useState<PublicTable[] | null>(null);
  const reduced = useAppReducedMotion();
  useEffect(() => {
    let active = true;
    const load = () =>
      fetch(`${serverHttpUrl.replace(/\/$/, '')}/tables`)
        .then((response) => (response.ok ? response.json() : []))
        // An unreachable server just shows no tables; joining by code still reports it.
        .catch(() => [])
        .then((list: PublicTable[]) => {
          if (active) setTables(list);
        });
    void load();
    const timer = setInterval(load, REFRESH_MS);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);

  if (!tables) return null;
  return (
    <section className="open-tables" aria-label={t.openTables}>
      {tables.length ? (
        <>
          <p className="open-tables-live">
            <span aria-hidden="true" />
            {t.tablesLive(tables.length)}
          </p>
          <ul>
            <AnimatePresence initial={!reduced}>
              {tables.map((table, index) => {
                const card = gameCards.find((game) => game.id === table.gameId);
                const color = card?.color ?? 'sky';
                const playing = table.phase !== 'lobby';
                return (
                  <motion.li
                    key={table.code}
                    layout={!reduced}
                    initial={{ opacity: 0, y: 14, scale: 0.97 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    transition={{
                      ...spring,
                      delay: reduced ? 0 : index * 0.05,
                    }}
                    style={
                      {
                        '--accent': `var(--${color})`,
                        '--accent-shadow': `var(--${color}-shadow)`,
                      } as MotionStyle
                    }
                  >
                    <button
                      type="button"
                      disabled={disabled}
                      aria-label={`${t.joinTable}: ${t.tableOf(table.hostName)}, ${card?.name ?? ''}, ${t.tableSeats(table.players, table.capacity)}`}
                      onClick={() => onJoin(table.code)}
                    >
                      <span className="open-tables-art" aria-hidden="true">
                        {card && <img src={card.image} alt="" />}
                      </span>
                      <span className="open-tables-info">
                        <strong>{t.tableOf(table.hostName)}</strong>
                        <span className="open-tables-game">
                          {card?.name}
                          <span
                            className={`open-tables-status${playing ? ' is-playing' : ''}`}
                          >
                            {playing ? t.tableInGame : t.tableOpen}
                          </span>
                        </span>
                        {/* One pip per seat, so how full the table is reads at a glance. */}
                        <span className="open-tables-seats" aria-hidden="true">
                          {Array.from({ length: table.capacity }, (_, seat) => (
                            <i
                              key={seat}
                              className={seat < table.players ? 'is-taken' : ''}
                            />
                          ))}
                          <small>
                            {table.players}/{table.capacity}
                          </small>
                        </span>
                      </span>
                      <span className="open-tables-join" aria-hidden="true">
                        {t.joinTable} <Icon name="arrow" />
                      </span>
                    </button>
                  </motion.li>
                );
              })}
            </AnimatePresence>
          </ul>
        </>
      ) : (
        <div className="open-tables-empty">
          <span aria-hidden="true">
            <Icon name="users" />
          </span>
          <p>{t.noOpenTables}</p>
        </div>
      )}
    </section>
  );
}
