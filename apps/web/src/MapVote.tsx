import { useEffect, useState, type ReactNode } from 'react';
import {
  AnimatePresence,
  motion,
  useReducedMotion,
  type MotionStyle,
} from 'motion/react';
import {
  mapIds,
  maps,
  RANDOM_MAP_ID,
  type ArenaMap,
  type MapVoteId,
} from '@but/tank-arena';
import { PlayerAvatar } from './Avatar';
import { Icon, type IconName } from './Icon';
import { lang, t } from './i18n';

interface LobbyMember {
  id: string;
  displayName: string;
  avatar: number;
}

const statIcons = {
  slippery: 'slide',
  destruction: 'blast',
  cover: 'leaf',
} as const;

const statLabels = {
  slippery: () => t.ta.mapStats.slippery,
  destruction: () => t.ta.mapStats.destruction,
  cover: () => t.ta.mapStats.cover,
} as const;

/** The map as it looks in play: its background with the terrain layer on top. */
function MapArt({ map }: { map: ArenaMap }) {
  return (
    <>
      <img className="map-card-layer" src={map.background} alt="" />
      <img className="map-card-layer" src={map.terrain} alt="" />
    </>
  );
}

/** The Random card flips through every arena. */
function RandomArt() {
  const reducedMotion = useReducedMotion();
  const [shown, setShown] = useState(0);
  useEffect(() => {
    if (reducedMotion || mapIds.length < 2) return;
    const timer = setInterval(
      () => setShown((index) => (index + 1) % mapIds.length),
      1600,
    );
    return () => clearInterval(timer);
  }, [reducedMotion]);
  const map = maps[mapIds[shown]!]!;
  return (
    <AnimatePresence initial={false}>
      <motion.span
        key={map.id}
        className="map-card-layers"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.6 }}
      >
        <MapArt map={map} />
      </motion.span>
    </AnimatePresence>
  );
}

function MapCard({
  id,
  accent,
  art,
  icon,
  name,
  description,
  details,
  voters,
  selected,
  leading,
  send,
}: {
  id: MapVoteId;
  accent: string;
  art: ReactNode;
  icon: IconName;
  name: string;
  description: string;
  details?: ReactNode;
  voters: readonly LobbyMember[];
  selected: boolean;
  leading: boolean;
  send: (type: string, payload?: unknown) => void;
}) {
  return (
    <motion.button
      type="button"
      className="map-card"
      aria-pressed={selected}
      style={{ '--map-accent': accent } as MotionStyle}
      onClick={() => send('map-vote', id)}
      whileHover={{ y: -4 }}
      whileTap={{ scale: 0.98 }}
      title={
        voters.length
          ? t.ta.votedBy(voters.map((voter) => voter.displayName).join(', '))
          : undefined
      }
    >
      <span className="map-card-art" aria-hidden="true">
        {art}
        <span className="map-card-icon">
          <Icon name={icon} />
        </span>
        {leading && (
          <span className="map-card-badge">
            <Icon name="crown" /> {t.ta.leadingMap}
          </span>
        )}
        <AnimatePresence>
          {selected && (
            <motion.span
              className="map-card-check"
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0 }}
              transition={{ type: 'spring', bounce: 0.5, visualDuration: 0.3 }}
            >
              <Icon name="check" />
            </motion.span>
          )}
        </AnimatePresence>
      </span>
      <span className="map-card-body">
        <strong>{name}</strong>
        <span className="map-card-description">{description}</span>
        {details}
        <span className="map-card-votes">
          <span className="map-card-voters" aria-hidden="true">
            {voters.slice(0, 5).map((voter) => (
              <PlayerAvatar key={voter.id} avatar={voter.avatar} />
            ))}
          </span>
          <span>{t.ta.mapVoteCount(voters.length)}</span>
        </span>
      </span>
    </motion.button>
  );
}

/**
 * Map vote as a board of postcards built from each map's own art and data, so a new entry
 * in `maps` appears here with no picker changes. Voting is optional.
 */
export function MapVote({
  selected,
  votes,
  players,
  send,
}: {
  selected: string | undefined;
  votes: ReadonlyMap<string, string>;
  players: readonly LobbyMember[];
  send: (type: string, payload?: unknown) => void;
}) {
  const votersFor = (id: MapVoteId) =>
    players.filter((player) => votes.get(player.id) === id);
  const top = Math.max(
    0,
    ...[...mapIds, RANDOM_MAP_ID].map((id) => votersFor(id).length),
  );
  const common = (id: MapVoteId) => {
    const voters = votersFor(id);
    return {
      id,
      voters,
      selected: selected === id,
      leading: top > 0 && voters.length === top,
      send,
    };
  };

  return (
    <section className="map-board" aria-labelledby="map-board-title">
      <div className="map-board-heading">
        <h3 id="map-board-title">{t.ta.chooseMap}</h3>
        <p>{t.ta.mapVoteOptional}</p>
      </div>
      <div className="map-board-cards">
        {mapIds.map((id) => {
          const map = maps[id]!;
          return (
            <MapCard
              key={id}
              {...common(id)}
              accent={map.accent}
              art={<MapArt map={map} />}
              icon={map.icon as IconName}
              name={map.name}
              description={map.description[lang]}
              details={
                <span className="map-card-traits">
                  {(Object.keys(map.stats) as (keyof typeof map.stats)[]).map(
                    (stat) => (
                      <span
                        key={stat}
                        className="map-trait"
                        title={`${statLabels[stat]()} ${map.stats[stat]}/5`}
                      >
                        <Icon name={statIcons[stat]} />
                        <span>{statLabels[stat]()}</span>
                        <span className="sr-only">{map.stats[stat]}/5</span>
                        <span className="map-trait-dots" aria-hidden="true">
                          {Array.from({ length: 5 }, (_, index) => (
                            <i
                              key={index}
                              className={
                                index < map.stats[stat] ? 'is-filled' : ''
                              }
                            />
                          ))}
                        </span>
                      </span>
                    ),
                  )}
                </span>
              }
            />
          );
        })}
        <MapCard
          {...common(RANDOM_MAP_ID)}
          accent="#baa5ff"
          art={<RandomArt />}
          icon="shuffle"
          name={t.ta.randomMap}
          description={t.ta.randomMapDescription}
        />
      </div>
    </section>
  );
}
