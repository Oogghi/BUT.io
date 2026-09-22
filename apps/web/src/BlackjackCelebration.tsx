import { useState, type CSSProperties } from 'react';
import { useAppReducedMotion } from './MotionPreferences';
import type { BlackjackCelebrationId } from './blackjackCelebrationRules';
import './blackjack-celebration.css';

/** Mount once per natural hand. Ordinary room updates never restart the sequence. */
export function BlackjackCelebration({
  id,
  delay = 0,
  preview = false,
}: {
  id: BlackjackCelebrationId;
  delay?: number;
  preview?: boolean;
}) {
  const reduced = useAppReducedMotion();
  const [finished, setFinished] = useState(false);
  if (finished && !preview) return null;
  return (
    <div
      className={`bj-celebration is-${id}${reduced ? ' is-reduced' : ''}${finished ? ' is-still' : ''}`}
      style={
        { '--celebration-delay': `${reduced ? 0 : delay}s` } as CSSProperties
      }
      aria-hidden="true"
      onAnimationEnd={(event) => {
        if (event.target === event.currentTarget) setFinished(true);
      }}
    >
      <svg viewBox="0 0 200 160" fill="none">
        {id === 'golden-blackjack' &&
          Array.from({ length: 10 }, (_, index) => {
            const angle = (index / 10) * Math.PI * 2;
            return (
              <g
                key={index}
                className="bj-celebration-coin"
                style={
                  {
                    '--coin-x': `${Math.cos(angle) * 78}px`,
                    '--coin-y': `${Math.sin(angle) * 58}px`,
                    '--coin-turn': `${index % 2 ? 150 : -150}deg`,
                  } as CSSProperties
                }
              >
                <ellipse
                  cx="100"
                  cy="80"
                  rx="7"
                  ry="10"
                  fill="#ffc43d"
                  stroke="#9b5613"
                  strokeWidth="2"
                />
                <path d="M100 74v12" stroke="#fff3b8" strokeWidth="2" />
              </g>
            );
          })}
        {id === 'royal-blackjack' && (
          <g className="bj-celebration-crown">
            <path
              d="m62 48 6 28h64l6-28-22 13-16-28-16 28Z"
              fill="#ffc43d"
              stroke="#9b5613"
              strokeWidth="3"
              strokeLinejoin="round"
            />
            <path
              d="M70 83h60"
              stroke="#fff3b8"
              strokeWidth="5"
              strokeLinecap="round"
            />
            <path d="m100 54 5 8-5 8-5-8Z" fill="#c85b65" />
          </g>
        )}
        {id === 'electric-blackjack' && (
          <g
            className="bj-celebration-bolts"
            stroke="#173c52"
            strokeWidth="2"
            strokeLinejoin="round"
          >
            <path d="M64 27 35 77h22l-11 41 37-57H60l17-34Z" fill="#75e9e0" />
            <path d="m136 27 29 50h-22l11 41-37-57h23l-17-34Z" fill="#75e9e0" />
          </g>
        )}
        <g className="bj-celebration-seal">
          <rect
            x="69"
            y="89"
            width="62"
            height="43"
            rx="12"
            fill="#183a33"
            stroke={id === 'electric-blackjack' ? '#75e9e0' : '#ffc43d'}
            strokeWidth="2"
          />
          <text
            x="100"
            y="120"
            textAnchor="middle"
            fill={id === 'electric-blackjack' ? '#a7fff6' : '#ffe397'}
          >
            21
          </text>
        </g>
      </svg>
    </div>
  );
}
