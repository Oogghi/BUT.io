import { useEffect, useMemo, useRef, useState } from 'react';
import {
  actions,
  tankActions,
  PLANNING_SECONDS,
  type ActionId,
  type TankPlan,
} from '@but/tank-arena';
import type { ArenaHud, ArenaView, mountArena } from '@but/tank-arena/client';
import type { TankArenaSnapshot } from './lobbyConnection';
import { t } from './i18n';
import { useAppReducedMotion } from './MotionPreferences';
import { actionIconStyle } from './tankIcons';
import { Timer } from './BlackjackPlay';

const labels = {
  turn: t.ta.turn,
  airstrike: t.ta.airstrike,
  pickups: t.ta.pickups,
  poisoned: t.ta.poisoned,
  frozen: t.ta.frozenStatus,
};

function arenaView(state: TankArenaSnapshot, sessionId: string): ArenaView {
  const { game } = state;
  return {
    stage: game.stage,
    turn: game.turn,
    craters: game.craters,
    pickups: game.pickups,
    hazard: game.hazard,
    replay: game.replay,
    players: Array.from(game.players, ([id, player]) => ({
      id,
      name:
        state.players.find((lobbyPlayer) => lobbyPlayer.id === id)
          ?.displayName ?? '—',
      decal:
        state.players.find((lobbyPlayer) => lobbyPlayer.id === id)?.cosmetics[
          'tank-decal'
        ] ?? '',
      you: id === sessionId,
      ...player,
    })),
  };
}

/**
 * Hosts the Phaser arena with responsive HTML controls. This component
 * owns the plan (action and aim), sends it to the server, and adds keyboard shortcuts and a
 * screen-reader status line.
 */
export function TankArenaPlay({
  state,
  sessionId,
  send,
  error,
}: {
  state: TankArenaSnapshot;
  sessionId: string;
  send: (type: string, payload?: unknown) => void;
  error: string;
}) {
  const { game } = state;
  const me = game.players.get(sessionId);
  const planning = game.stage === 'planning';
  const canPlan = planning && Boolean(me?.alive);
  // Ready is final for the turn: the plan can no longer change.
  const locked = Boolean(me?.confirmed);
  const canAct = canPlan && !locked;
  const [action, setAction] = useState<ActionId>('missile');
  const [aim, setAim] = useState({
    angle: me && me.facing < 0 ? -135 : -45,
    power: 0.7,
  });
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const reducedMotion = useAppReducedMotion();
  const motionPreference = useRef(reducedMotion);
  motionPreference.current = reducedMotion;
  const container = useRef<HTMLDivElement>(null);
  const arena = useRef<ReturnType<typeof mountArena> | null>(null);
  const view = useMemo(() => arenaView(state, sessionId), [state, sessionId]);

  const unavailable = (id: ActionId) =>
    !me ||
    (me.cooldowns.get(id) ?? 0) > 0 ||
    (actions[id].movement && me.frozenTurns > 0);

  function confirm() {
    if (!canAct || unavailable(action)) return;
    send('plan', {
      action,
      angle: aim.angle,
      power: aim.power,
      turn: game.turn,
    } satisfies TankPlan);
  }
  // The arena calls the latest handlers, not the ones captured when it mounted.
  const handlers = useRef({ confirm, choose: (_id: ActionId) => {} });
  handlers.current = {
    confirm,
    choose: (id) => canAct && !unavailable(id) && setAction(id),
  };

  useEffect(() => {
    let disposed = false;
    setReady(false);
    setLoadError(false);
    import('@but/tank-arena/client')
      .then(({ mountArena }) => {
        if (disposed || !container.current) return;
        arena.current = mountArena(
          container.current,
          game.map,
          labels,
          {
            onReady: () => !disposed && setReady(true),
            onAim: (angle, power) => setAim({ angle, power }),
            onAction: (id) => handlers.current.choose(id),
            onConfirm: () => handlers.current.confirm(),
          },
          { reducedMotion: motionPreference.current, externalControls: true },
        );
      })
      .catch(() => {
        if (!disposed) setLoadError(true);
      });
    return () => {
      disposed = true;
      arena.current?.destroy();
      arena.current = null;
    };
    // The map is fixed for the match.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadAttempt]);

  useEffect(() => {
    arena.current?.setReducedMotion(reducedMotion);
  }, [reducedMotion, ready]);

  // A new turn may put the chosen ability on cooldown; fall back to the missile.
  useEffect(() => {
    if (unavailable(action)) setAction('missile');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game.turn]);

  const info = actions[action];
  const hint =
    error ||
    (!me
      ? t.spectatingNote
      : !me.alive
        ? t.ta.eliminated
        : !planning
          ? ''
          : me.frozenTurns > 0
            ? t.ta.frozen
            : me.confirmed
              ? t.ta.lockedIn
              : // What the selected action does.
                t.ta.actionHint(...t.ta.actions[action]));
  const boost = me?.alive && me.boost ? ` · ${t.ta.boosts[me.boost]}` : '';

  const hud = useMemo((): ArenaHud => {
    const choices = me?.alive ? tankActions(me.tank) : [];
    return {
      actions: choices.map((id, index) => ({
        id,
        key: String(index + 1),
        name: t.ta.actions[id][0],
        cooldown: me?.cooldowns.get(id) ?? 0,
        disabled: unavailable(id),
      })),
      selected: action,
      showPower: canAct && info.aim !== 'none',
      confirm: !canPlan
        ? 'hidden'
        : locked
          ? 'locked'
          : unavailable(action)
            ? 'disabled'
            : 'ready',
      readyLabel: t.ready,
      endsAt: planning ? game.endsAt : 0,
      hint: hint ? `${t.ta.turn(game.turn)} · ${hint}${boost}` : '',
      error: Boolean(error),
      stageLabel: planning ? '' : t.ta.resolving,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    canPlan,
    canAct,
    locked,
    me,
    action,
    info,
    planning,
    game.endsAt,
    hint,
    boost,
    error,
    game.turn,
  ]);

  useEffect(() => {
    if (ready) arena.current?.update(view);
  }, [view, ready]);
  useEffect(() => {
    if (ready) arena.current?.setAim(canAct ? { action, ...aim } : null);
  }, [canAct, action, aim, ready]);
  useEffect(() => {
    if (ready) arena.current?.setHud(hud);
  }, [hud, ready]);

  useEffect(() => {
    if (!canAct || !me) return;
    const choices = tankActions(me.tank);
    const onKey = (event: KeyboardEvent) => {
      if (
        (event.target instanceof HTMLElement &&
          event.target.closest(
            'input, button, select, textarea, [contenteditable="true"]',
          )) ||
        event.ctrlKey ||
        event.metaKey
      )
        return;
      const choice = choices[Number(event.key) - 1];
      if (choice) {
        handlers.current.choose(choice);
      } else if (event.key === 'Enter') {
        event.preventDefault();
        handlers.current.confirm();
      } else if (event.key.startsWith('Arrow')) {
        // Keyboard aiming, for players without a mouse.
        event.preventDefault();
        const turn = { ArrowLeft: -2, ArrowRight: 2 }[event.key] ?? 0;
        const push = { ArrowUp: 0.05, ArrowDown: -0.05 }[event.key] ?? 0;
        setAim((current) => ({
          angle: Math.min(180, Math.max(-180, current.angle + turn)),
          power: Math.min(1, Math.max(0.1, current.power + push)),
        }));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [canAct, me]);

  return (
    <div className="tank-play">
      <header className="tank-turn-bar">
        <div>
          <strong>{t.ta.turn(game.turn)}</strong>
          <span>{planning ? t.ta.planning : t.ta.resolving}</span>
        </div>
        {planning && (
          <Timer
            endsAt={game.endsAt}
            seconds={PLANNING_SECONDS}
            urgent={canAct}
          />
        )}
      </header>
      <div
        ref={container}
        className="tank-stage"
        data-aiming={hud.showPower}
        aria-label="Tank Arena"
      />
      {!ready && (
        <div className="game-load-state" role={loadError ? 'alert' : 'status'}>
          <p>{loadError ? t.polish.tankLoadFailed : t.polish.tankLoading}</p>
          {loadError && (
            <button
              type="button"
              className="button secondary"
              onClick={() => setLoadAttempt((value) => value + 1)}
            >
              {t.polish.retry}
            </button>
          )}
        </div>
      )}
      <div className="tank-controls">
        <p className="tank-action-hint" role="status">
          {hint || t.ta.resolving}
          {boost}
        </p>
        {me?.alive && (
          <>
            <div
              className="tank-actions"
              role="group"
              aria-label={t.ta.planning}
            >
              {hud.actions.map((choice) => (
                <button
                  type="button"
                  key={choice.id}
                  aria-pressed={action === choice.id}
                  disabled={!ready || !canAct || choice.disabled}
                  onClick={() => setAction(choice.id)}
                >
                  <span
                    className="tank-action-icon"
                    aria-hidden="true"
                    style={actionIconStyle(choice.id)}
                  />
                  <span>
                    {choice.name}
                    {choice.cooldown > 0 && (
                      <small>{t.ta.cooldownTurns(choice.cooldown)}</small>
                    )}
                  </span>
                </button>
              ))}
            </div>
            <div className="tank-aim-controls">
              {info.aim !== 'none' && (
                <>
                  <label>
                    {t.polish.angle}
                    <output>{Math.round(aim.angle)}°</output>
                    <input
                      type="range"
                      aria-label={t.polish.angle}
                      min="-180"
                      max="180"
                      step="1"
                      value={aim.angle}
                      disabled={!ready || !canAct}
                      onChange={(event) =>
                        setAim((current) => ({
                          ...current,
                          angle: Number(event.target.value),
                        }))
                      }
                    />
                  </label>
                  <label>
                    {t.polish.power}
                    <output>{Math.round(aim.power * 100)}%</output>
                    <input
                      type="range"
                      aria-label={t.polish.power}
                      min="0.1"
                      max="1"
                      step="0.01"
                      value={aim.power}
                      disabled={!ready || !canAct}
                      onChange={(event) =>
                        setAim((current) => ({
                          ...current,
                          power: Number(event.target.value),
                        }))
                      }
                    />
                  </label>
                </>
              )}
              <button
                type="button"
                className="button primary tank-confirm"
                disabled={!ready || !canAct || unavailable(action)}
                onClick={confirm}
              >
                {locked ? t.ta.lockedIn : t.ready}
              </button>
            </div>
            {canAct && <p className="tank-input-hint">{t.polish.aimHint}</p>}
          </>
        )}
      </div>
    </div>
  );
}
