import { useAppReducedMotion as useReducedMotion } from './MotionPreferences';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { BombPartySend } from '@but/bomb-party';

import { BombArena } from './BombArena';
import type { BombPartySnapshot } from './lobbyConnection';
import { Icon } from './Icon';
import { t } from './i18n';

export function BombPartyPlay({
  state,
  sessionId,
  send,
  error,
  onPlayerClick,
}: {
  state: BombPartySnapshot;
  sessionId: string;
  send: BombPartySend;
  error: string;
  onPlayerClick: (id: string, anchor: HTMLElement) => void;
}) {
  const { game, settings } = state;
  const active = game.activePlayerId === sessionId;
  const activeName =
    state.players.find((player) => player.id === game.activePlayerId)
      ?.displayName ?? '';
  const self = game.players.get(sessionId);
  const [word, setWord] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const form = useRef<HTMLFormElement>(null);
  const reducedMotion = useReducedMotion();
  useEffect(() => {
    setWord('');
    if (active) input.current?.focus({ preventScroll: true });
  }, [game.turnId, active]);
  useEffect(() => {
    if (error && active) {
      setWord('');
      input.current?.focus({ preventScroll: true });
      // A rejected word shakes the entry, like a head shake.
      if (!reducedMotion)
        form.current?.animate(
          [0, -8, 7, -5, 3, 0].map((x) => ({
            transform: `translateX(${x}px)`,
          })),
          { duration: 360, easing: 'ease-out' },
        );
    }
  }, [error, active, reducedMotion]);
  useEffect(() => {
    if (!active) return;
    const focus = () => {
      if (!document.querySelector(':popover-open, dialog[open]'))
        input.current?.focus({ preventScroll: true });
    };
    const type = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        event.isComposing
      )
        return;
      const target = event.target;
      if (
        target instanceof Element &&
        target.closest(
          'input, textarea, select, [contenteditable="true"], [role="dialog"]',
        )
      )
        return;
      if (document.querySelector(':popover-open, dialog[open]')) return;
      if (
        event.key === ' ' &&
        target instanceof Element &&
        target.closest('button, a, [role="button"]')
      )
        return;
      if (event.key.length === 1) {
        event.preventDefault();
        focus();
        setWord((previous) => (previous + event.key).slice(0, 80));
      } else if (event.key === 'Backspace') {
        event.preventDefault();
        focus();
        setWord((previous) => previous.slice(0, -1));
      } else if (event.key === 'Dead') focus();
    };
    window.addEventListener('keydown', type);
    window.addEventListener('focus', focus);
    return () => {
      window.removeEventListener('keydown', type);
      window.removeEventListener('focus', focus);
    };
  }, [active]);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (active && word.trim()) send('word', { word, turnId: game.turnId });
  }
  return (
    <div className="bomb-play" data-your-turn={active}>
      <h2 role="status">{active ? t.bp.yourTurn : t.bp.turn(activeName)}</h2>
      <BombArena
        state={state}
        sessionId={sessionId}
        onPlayerClick={onPlayerClick}
        wordEntry={
          <form ref={form} onSubmit={submit}>
            <input
              ref={input}
              aria-label={t.bp.word}
              placeholder={t.bp.typeWord}
              value={word}
              onChange={(event) => setWord(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && event.nativeEvent.isComposing)
                  event.preventDefault();
              }}
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              enterKeyHint="send"
              maxLength={80}
              aria-invalid={Boolean(error)}
              aria-describedby={error ? 'word-error word-hint' : 'word-hint'}
            />
          </form>
        }
      />
      <p id="word-hint" className="word-entry-hint">
        {t.polish.wordHint}
      </p>
      <div className="bomb-turn-meta" data-error={Boolean(error)}>
        <p role="status" className="word-feedback">
          {error ||
            (game.lastEvent === 'exploded'
              ? t.bp.exploded
              : game.lastEvent === 'accepted'
                ? t.bp.accepted(game.lastWord)
                : '\u00a0')}
        </p>
        <span>
          {t.bp.used}: {game.usedWordCount}
        </span>
      </div>
      {error && (
        <p id="word-error" className="sr-only" role="alert">
          {error}
        </p>
      )}
      {self?.lives === 0 && <p>{t.bp.eliminated}</p>}
      {!self && (
        <p className="spectating-note">
          <Icon name="eye" /> {t.spectatingNote}
        </p>
      )}
      {settings.bonusAlphabet && (
        <div className="bonus-alphabet" aria-label={t.bp.bonus}>
          {[...settings.bonusAlphabet].map((letter) => (
            <span
              key={letter}
              className={self?.bonusLetters.includes(letter) ? 'covered' : ''}
              aria-label={`${letter.toUpperCase()}${self?.bonusLetters.includes(letter) ? ' ✓' : ''}`}
            >
              {letter.toUpperCase()}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
