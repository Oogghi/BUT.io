import type { CSSProperties, ReactNode } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { AVATAR_COUNT } from '@but/shared';
import { t } from './i18n';

const stroke = {
  stroke: 'currentColor',
  strokeWidth: 4,
  strokeLinecap: 'round',
  fill: 'none',
} as const;
const eyes = (
  <>
    <rect x="17" y="20" width="7" height="13" rx="3.5" fill="currentColor" />
    <rect x="40" y="20" width="7" height="13" rx="3.5" fill="currentColor" />
  </>
);
const smile = <path d="M24 42Q32 49 40 42" {...stroke} />;

/** Each look pairs a colour with a face drawn in a 64×64 box; keep AVATAR_COUNT in sync. */
const looks: { color: string; shadow: string; face: ReactNode }[] = [
  {
    color: 'var(--sun)',
    shadow: 'var(--sun-shadow)',
    face: (
      <>
        {eyes}
        {smile}
      </>
    ),
  },
  {
    color: 'var(--mint)',
    shadow: 'var(--mint-shadow)',
    face: (
      <>
        {eyes}
        <path d="M21 39h22a11 11 0 0 1-22 0Z" fill="currentColor" />
      </>
    ),
  },
  {
    color: 'var(--sky)',
    shadow: 'var(--sky-shadow)',
    face: (
      <>
        <rect
          x="17"
          y="20"
          width="7"
          height="13"
          rx="3.5"
          fill="currentColor"
        />
        <path d="M38 28q5-6 10 0" {...stroke} />
        {smile}
      </>
    ),
  },
  {
    color: 'var(--coral)',
    shadow: 'var(--coral-shadow)',
    face: (
      <>
        <circle cx="20.5" cy="26" r="4.5" fill="currentColor" />
        <circle cx="43.5" cy="26" r="4.5" fill="currentColor" />
        <ellipse cx="32" cy="44" rx="5" ry="6" fill="currentColor" />
      </>
    ),
  },
  {
    color: '#ff8fc4',
    shadow: '#a4436f',
    face: (
      <>
        <path d="M15 28q5-6 10 0M39 28q5-6 10 0" {...stroke} />
        <path d="M22 40q10 10 20 0" {...stroke} />
      </>
    ),
  },
  {
    color: '#b8a2ff',
    shadow: '#5f47b3',
    face: (
      <>
        <path
          d="M12 21h40v5a8 8 0 0 1-8 8h-4a8 8 0 0 1-8-7 8 8 0 0 1-8 7h-4a8 8 0 0 1-8-8Z"
          fill="currentColor"
        />
        <path d="M25 44q9 4 15-3" {...stroke} />
      </>
    ),
  },
];

const lookFor = (avatar: number) => looks[avatar] ?? looks[0]!;

function lookStyle(avatar: number) {
  const look = lookFor(avatar);
  return {
    '--avatar': look.color,
    '--avatar-shadow': look.shadow,
  } as CSSProperties;
}

/** The profile avatar button; each click moves to the next look. */
export function ProfileAvatar({
  avatar,
  onChange,
}: {
  avatar: number;
  onChange: (avatar: number) => void;
}) {
  const reducedMotion = useReducedMotion();
  return (
    <button
      type="button"
      className="profile-avatar"
      style={lookStyle(avatar)}
      aria-label={t.changeAvatar}
      onClick={() => onChange((avatar + 1) % AVATAR_COUNT)}
    >
      <motion.svg
        key={avatar}
        viewBox="0 0 64 64"
        aria-hidden="true"
        initial={reducedMotion ? false : { scale: 0.4, rotate: -25 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ type: 'spring', visualDuration: 0.35, bounce: 0.5 }}
      >
        {lookFor(avatar).face}
      </motion.svg>
    </button>
  );
}

/** A player's avatar tile (lobby list and stats card). */
export function PlayerAvatar({ avatar }: { avatar: number }) {
  return (
    <span className="avatar" style={lookStyle(avatar)} aria-hidden="true">
      <svg viewBox="0 0 64 64">{lookFor(avatar).face}</svg>
    </span>
  );
}
