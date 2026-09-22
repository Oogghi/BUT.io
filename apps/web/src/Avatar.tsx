import { useAppReducedMotion as useReducedMotion } from './MotionPreferences';
import type { CSSProperties, ReactNode } from 'react';
import { motion } from 'motion/react';
import { AVATAR_COUNT, premiumAvatars } from '@but/shared';
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

// Free additions keep the same editable geometry as the original six faces.
looks.push(
  {
    color: '#ffb66c',
    shadow: '#ac632e',
    face: (
      <>
        <path
          d="m20 14 3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1Zm25 0 3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1Z"
          fill="currentColor"
        />
        {smile}
      </>
    ),
  },
  {
    color: '#91aaff',
    shadow: '#495d99',
    face: (
      <>
        <path d="M14 29q7 5 14 0m8 0q7 5 14 0M27 43h10" {...stroke} />
      </>
    ),
  },
  {
    color: '#ff9cc2',
    shadow: '#a34d73',
    face: (
      <>
        <path
          d="M12 21c0-7 8-8 11-2 3-6 11-5 11 2 0 6-11 13-11 13S12 27 12 21Zm23 0c0-7 8-8 11-2 3-6 11-5 11 2 0 6-11 13-11 13s-11-7-11-13Z"
          transform="translate(-3 0)"
          fill="currentColor"
        />
        <path d="M24 42q8 10 16 0" {...stroke} />
      </>
    ),
  },
  {
    color: '#b6dd76',
    shadow: '#66813e',
    face: (
      <>
        {eyes}
        <path d="m15 15 11 3m12 0 11-3M24 42q8 7 16 0" {...stroke} />
        <path d="M31 44h8v6a4 4 0 0 1-8 0Z" fill="#f47694" />
      </>
    ),
  },
  {
    color: '#f6d6a0',
    shadow: '#a58250',
    face: (
      <>
        {eyes}
        <path
          d="M32 39c-8-10-12 7-20 1 3 13 16 10 20 4 4 6 17 9 20-4-8 6-12-11-20-1Z"
          fill="currentColor"
        />
      </>
    ),
  },
  {
    color: '#78dbd4',
    shadow: '#388d90',
    face: (
      <>
        <path d="M11 21q21-7 42 0v12q-21-5-42 0Z" fill="currentColor" />
        <path
          d="M17 26h9m12 0h9"
          stroke="#78dbd4"
          strokeWidth="4"
          strokeLinecap="round"
        />
        {smile}
      </>
    ),
  },
);
const lookFor = (avatar: number) => looks[avatar] ?? looks[0]!;
const premiumFor = (avatar: number) =>
  premiumAvatars.find((item) => item.avatar === avatar);

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
  const premium = premiumFor(avatar);
  return (
    <button
      type="button"
      className={`profile-avatar${premium ? ' is-premium' : ''}`}
      style={lookStyle(avatar)}
      aria-label={t.changeAvatar}
      onClick={() => onChange(premium ? 0 : (avatar + 1) % AVATAR_COUNT)}
    >
      {premium ? (
        <img src={`/avatars/${premium.id}.webp`} alt="" draggable={false} />
      ) : (
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
      )}
    </button>
  );
}

/** A player's avatar tile (lobby list and stats card). */
export function PlayerAvatar({ avatar }: { avatar: number }) {
  const premium = premiumFor(avatar);
  return (
    <span
      className={`avatar${premium ? ' is-premium' : ''}`}
      style={lookStyle(avatar)}
      aria-hidden="true"
    >
      {premium ? (
        <img src={`/avatars/${premium.id}.webp`} alt="" draggable={false} />
      ) : (
        <svg viewBox="0 0 64 64">{lookFor(avatar).face}</svg>
      )}
    </span>
  );
}
