import { useEffect, useMemo, useRef, useState } from 'react';
import {
  actions,
  tankActions,
  type ActionId,
  type TankPlan,
} from '@but/tank-arena';
import type { ArenaHud, ArenaView, mountArena } from '@but/tank-arena/client';
import type { TankArenaSnapshot } from './lobbyConnection';
import { t } from './i18n';

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
      you: id === sessionId,
      ...player,
    })),
  };
}

/**
 * Hosts the Phaser arena, which draws the game and its on-screen controls. This component
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
  const [action, setAction] = useState<ActionId>('missile');
  const [aim, setAim] = useState({
    angle: me && me.facing < 0 ? -135 : -45,
    power: 0.7,
  });
  const [ready, setReady] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  const arena = useRef<ReturnType<typeof mountArena> | null>(null);
  const view = useMemo(() => arenaView(state, sessionId), [state, sessionId]);

  const unavailable = (id: ActionId) =>
    !me ||
    (me.cooldowns.get(id) ?? 0) > 0 ||
    (actions[id].movement && me.frozenTurns > 0);

  function confirm() {
    if (!canPlan || unavailable(action)) return;
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
    choose: (id) => !unavailable(id) && setAction(id),
  };

  useEffect(() => {
    let disposed = false;
    import('@but/tank-arena/client')
      .then(({ mountArena }) => {
        if (disposed || !container.current) return;
        arena.current = mountArena(container.current, game.map, labels, {
          onReady: () => !disposed && setReady(true),
          onAim: (angle, power) => setAim({ angle, power }),
          onAction: (id) => handlers.current.choose(id),
          onConfirm: () => handlers.current.confirm(),
        });
      })
      .catch((cause: unknown) =>
        console.error('Tank Arena failed to load.', cause),
      );
    return () => {
      disposed = true;
      arena.current?.destroy();
      arena.current = null;
    };
    // The map is fixed for the match.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
              : info.aim === 'none'
                ? t.ta.noAimHint
                : t.ta.aimHint);
  const boost = me?.alive && me.boost ? ` · ${t.ta.boosts[me.boost]}` : '';

  const hud = useMemo((): ArenaHud => {
    const choices = canPlan && me ? tankActions(me.tank) : [];
    return {
      actions: choices.map((id, index) => ({
        id,
        key: String(index + 1),
        name: t.ta.actions[id][0],
        cooldown: me?.cooldowns.get(id) ?? 0,
        disabled: unavailable(id),
      })),
      selected: action,
      showPower: canPlan && info.aim !== 'none',
      confirm: !canPlan
        ? 'hidden'
        : unavailable(action)
          ? 'disabled'
          : me?.confirmed
            ? 'locked'
            : 'ready',
      endsAt: planning ? game.endsAt : 0,
      hint: hint ? `${t.ta.turn(game.turn)} · ${hint}${boost}` : '',
      error: Boolean(error),
      stageLabel: planning ? '' : t.ta.resolving,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    canPlan,
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
    if (ready) arena.current?.setAim(canPlan ? { action, ...aim } : null);
  }, [canPlan, action, aim, ready]);
  useEffect(() => {
    if (ready) arena.current?.setHud(hud);
  }, [hud, ready]);

  useEffect(() => {
    if (!canPlan || !me) return;
    const choices = tankActions(me.tank);
    const onKey = (event: KeyboardEvent) => {
      if (
        event.target instanceof HTMLInputElement ||
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
          angle: current.angle + turn,
          power: Math.min(1, Math.max(0.1, current.power + push)),
        }));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [canPlan, me]);

  return (
    <div className="tank-play">
      <div ref={container} className="tank-stage" data-aiming={hud.showPower} />
      <p className="sr-only" role="status">
        {t.ta.turn(game.turn)}. {planning ? t.ta.planning : t.ta.resolving}.{' '}
        {hint}
        {canPlan && ` ${t.ta.actions[action][0]}.`}
      </p>
    </div>
  );
}
