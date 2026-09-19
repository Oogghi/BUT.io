export type IconName =
  | 'arrow'
  | 'play'
  | 'users'
  | 'check'
  | 'crown'
  | 'back'
  | 'trophy'
  | 'settings'
  | 'locker'
  | 'coin'
  | 'stats'
  | 'copy'
  | 'eye'
  | 'snowflake'
  | 'leaf'
  | 'slide'
  | 'blast'
  | 'shuffle';

export function Icon({
  name,
  className = '',
}: {
  name: IconName;
  className?: string;
}) {
  return (
    <svg
      className={className}
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {name === 'arrow' && <path d="M5 12h14m-6-6 6 6-6 6" />}
      {name === 'eye' && (
        <>
          <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
          <circle cx="12" cy="12" r="3" />
        </>
      )}
      {name === 'copy' && (
        <>
          <rect x="9" y="9" width="11" height="11" rx="2.5" />
          <path d="M5 15V6.5A1.5 1.5 0 0 1 6.5 5H15" />
        </>
      )}
      {name === 'back' && <path d="M19 12H5m6-6-6 6 6 6" />}
      {name === 'play' && (
        <path d="m9 5 11 7-11 7Z" fill="currentColor" stroke="none" />
      )}
      {name === 'check' && <path d="m5 12 4 4L19 6" />}
      {name === 'stats' && <path d="M4 20h16M7 16v-4m5 4V6m5 10V9" />}
      {name === 'trophy' && (
        <>
          <path d="M8 3h8v6a4 4 0 0 1-8 0V3Zm4 10v5m-4 3h8l-1-3H9Z" />
          <path d="M8 5H4v2a4 4 0 0 0 4 4m8-6h4v2a4 4 0 0 1-4 4" />
        </>
      )}
      {name === 'settings' && (
        <>
          <path
            d="m9 3-.5 3-2 1-3-.5-2 3 2.5 2v2L1.5 16l2 3 3-.5 2 1L9 22h4l.5-2.5 2-1 3 .5 2-3-2.5-2.5v-2l2.5-2-2-3-3 .5-2-1L13 3Z"
            transform="translate(1 -0.5) scale(.95)"
          />
          <circle cx="12" cy="12" r="3" />
        </>
      )}
      {name === 'locker' && (
        <>
          <rect x="5" y="4" width="14" height="17" rx="2" />
          <path d="M12 4v17M9 9h1m4 0h1M9 14h1m4 0h1" />
        </>
      )}
      {name === 'coin' && (
        <image
          href="/coin-reward.png"
          x="1"
          y="1"
          width="22"
          height="22"
          preserveAspectRatio="xMidYMid meet"
        />
      )}
      {name === 'crown' && <path d="m3 7 5 4 4-7 4 7 5-4-2 12H5Z" />}
      {name === 'users' && (
        <>
          <circle cx="9" cy="8" r="3" />
          <path d="M3 20v-2a6 6 0 0 1 12 0v2m1-15a3 3 0 0 1 0 6m3 9v-2a6 6 0 0 0-2-4" />
        </>
      )}
      {name === 'snowflake' && (
        <>
          <path d="M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9" />
          <path d="m12 3-2 2m2-2 2 2m0 14-2 2m2-2 2-2M4.2 7.5l2.8.2m-2.8-.2 1.2 2.5m14.4 6.5-2.8-.2m2.8.2-1.2-2.5M4.2 16.5l2.8-.2m-2.8.2 1.2-2.5m14.4-6.5-2.8.2m2.8-.2-1.2 2.5" />
        </>
      )}
      {name === 'leaf' && (
        <>
          <path d="M20 4C10 4 5 8 5 14c0 3.3 2.4 6 6 6 6 0 9-7 9-16Z" />
          <path d="M4 20c3-4 6-7 12-10" />
        </>
      )}
      {name === 'slide' && (
        <>
          <path d="M4 18h16M5 13h8l3-5" />
          <path d="m7 9 3 4m-5 1 3 4m8-10 3 3" />
        </>
      )}
      {name === 'blast' && (
        <>
          <path d="m13 2-2 8H5l6 4-2 8 6-6 5 2-3-6 3-4h-6Z" />
        </>
      )}
      {name === 'shuffle' && (
        <>
          <path d="M4 7h2c4 0 5 10 10 10h4m0 0-3-3m3 3-3 3M4 17h2c1.5 0 2.5-1 3.4-2.4M14.6 9.4C15.5 8 16.5 7 18 7h2m0 0-3-3m3 3-3 3" />
        </>
      )}
    </svg>
  );
}
