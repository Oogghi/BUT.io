import { forwardRef, useRef, type ReactNode } from 'react';
import {
  AnimatePresence,
  MotionConfig,
  motion,
  useIsPresent,
  useReducedMotion,
  type MotionStyle,
} from 'motion/react';
import { Icon } from './Icon';
import { t } from './i18n';

interface Props {
  game: {
    id: string;
    name: string;
    min: number;
    max: number;
    color: string;
    image: string;
  };
  open: boolean;
  pending: boolean;
  onToggle: () => void;
  children?: ReactNode;
}

/** One layout participant per tile; child projection keeps artwork and text undistorted. */
export function GameCard({ game, open, pending, onToggle, children }: Props) {
  const reducedMotion = useReducedMotion();
  const tile = useRef<HTMLButtonElement>(null);
  const transition = {
    type: 'tween' as const,
    duration: reducedMotion ? 0 : 0.36,
    ease: [0.22, 1, 0.36, 1] as const,
  };

  function close() {
    if (pending) return;
    onToggle();
    tile.current?.focus({ preventScroll: true });
  }

  return (
    <MotionConfig transition={transition}>
      <motion.article
        layout={!reducedMotion}
        className={`game-selection ${open ? 'is-open' : ''}`}
        style={
          {
            '--game-color': `var(--${game.color})`,
            '--game-shadow': `var(--${game.color}-shadow)`,
            borderRadius: 32,
            boxShadow: `0 8px 0 var(--${game.color}-shadow)`,
          } as MotionStyle
        }
        whileHover={{ y: reducedMotion || open ? 0 : -4 }}
        onClick={(event) => {
          // Form controls keep their own action; clicks on the rest of the surface close it.
          if (
            open &&
            !(event.target as Element).closest(
              'button, a, input, select, textarea, label',
            )
          ) {
            close();
          }
        }}
        onKeyDown={(event) => {
          if (open && event.key === 'Escape') {
            event.preventDefault();
            close();
          }
        }}
      >
        <motion.button
          layout={!reducedMotion}
          ref={tile}
          type="button"
          className="game-card"
          style={{ borderRadius: 32 }}
          onClick={open ? close : onToggle}
          disabled={pending}
          aria-label={t.chooseGame(game.name)}
          aria-expanded={open}
          aria-controls={open ? `${game.id}-options` : undefined}
          whileHover={reducedMotion ? {} : 'wiggle'}
          whileFocus={reducedMotion ? {} : 'wiggle'}
        >
          <motion.img
            layout={reducedMotion ? false : 'position'}
            src={game.image}
            decoding="async"
            alt=""
            draggable={false}
            variants={{
              wiggle: {
                rotate: [0, -5, 3, 0],
                transition: { type: 'tween', duration: 0.4, ease: 'easeInOut' },
              },
            }}
          />
          <motion.span
            layout={reducedMotion ? false : 'position'}
            className="card-bottom"
          >
            <span>
              <strong>{game.name}</strong>
              <span className="card-players">
                <Icon name="users" /> {t.playerRange(game.min, game.max)}
              </span>
            </span>
            <span className="card-arrow">
              <Icon name={open ? 'check' : 'arrow'} />
            </span>
          </motion.span>
        </motion.button>
        <AnimatePresence initial={false} mode="popLayout">
          {open && (
            <CardOptions
              key="options"
              id={`${game.id}-options`}
              name={game.name}
              reducedMotion={reducedMotion}
            >
              <button
                className="selection-close"
                type="button"
                aria-label={t.closeOptions}
                disabled={pending}
                onClick={close}
              >
                ×
              </button>
              {children}
            </CardOptions>
          )}
        </AnimatePresence>
      </motion.article>
    </MotionConfig>
  );
}

// Exiting content keeps its former dimensions without holding a grid cell open.
const CardOptions = forwardRef<
  HTMLElement,
  {
    id: string;
    name: string;
    reducedMotion: boolean | null;
    children: ReactNode;
  }
>(function CardOptions({ id, name, reducedMotion, children }, ref) {
  const present = useIsPresent();
  return (
    <motion.section
      ref={ref}
      layout={reducedMotion ? false : 'position'}
      id={id}
      aria-label={name}
      className="room-options"
      aria-hidden={!present}
      inert={!present}
      initial={reducedMotion ? false : { opacity: 0, y: 8 }}
      animate={{
        opacity: 1,
        y: 0,
        transition: {
          type: 'tween',
          duration: reducedMotion ? 0 : 0.2,
          delay: reducedMotion ? 0 : 0.12,
        },
      }}
      exit={{
        opacity: 0,
        y: reducedMotion ? 0 : 4,
        transition: { type: 'tween', duration: reducedMotion ? 0 : 0.1 },
      }}
    >
      {children}
    </motion.section>
  );
});
