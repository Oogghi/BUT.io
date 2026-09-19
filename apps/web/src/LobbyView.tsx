import { useEffect, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { bombParty } from '@but/bomb-party';
import { tankArena } from '@but/tank-arena';
import type { LobbySnapshot } from './lobbyConnection';
import { BombPartyPlay } from './BombPartyPlay';
import { BombPartySettings } from './BombPartySettings';
import { TankArenaPlay } from './TankArenaPlay';
import { TankLoadout } from './TankLoadout';
import { TankTeamPicker } from './TankTeamPicker';
import { MapVote } from './MapVote';
import { gameCards } from './gameCards';
import { PlayerAvatar } from './Avatar';
import { StatsPopover, useStatsTarget } from './StatsPopover';
import { Icon } from './Icon';
import { t } from './i18n';

interface Props {
  state: LobbySnapshot;
  sessionId: string;
  send: (type: string, payload?: unknown) => void;
  error: string;
  leave: () => void;
}

export function LobbyView({ state, sessionId, send, leave, error }: Props) {
  const host = state.hostId === sessionId;
  const game = state.gameId === tankArena.id ? tankArena : bombParty;
  const card = gameCards.find((entry) => entry.id === game.id)!;
  const capacity =
    state.gameId === bombParty.id
      ? state.settings.maxPlayers
      : tankArena.maxPlayers;
  const self = state.players.find((player) => player.id === sessionId);
  // Spectators don't play, so only the others count toward starting.
  const participants = state.players.filter((player) => !player.spectator);
  const canStart =
    participants.length >= game.minPlayers &&
    participants.every((player) => player.ready);
  const readyCount = participants.filter((player) => player.ready).length;
  const reducedMotion = useReducedMotion();
  const [copy, setCopy] = useState<'idle' | 'copied' | 'failed'>('idle');
  const stats = useStatsTarget<string>();
  // Closes on its own if that player leaves.
  const statsPlayer = state.players.find(
    (player) => player.id === stats.target?.id,
  );
  const openSeats =
    state.phase === 'lobby' ? capacity - state.players.length : 0;
  const inGame = state.phase === 'playing' || state.phase === 'results';
  const winner = state.players.find(
    (player) => player.id === state.game.winnerId,
  );
  const tankWinnerTeam =
    state.gameId === tankArena.id ? state.game.winnerTeam : '';
  const tankWinnerIndex = tankWinnerTeam.startsWith('team-')
    ? Number(tankWinnerTeam.slice(5)) - 1
    : -1;

  useEffect(() => {
    if (copy === 'idle') return;
    const timer = setTimeout(() => setCopy('idle'), 2500);
    return () => clearTimeout(timer);
  }, [copy]);

  async function copyInvite() {
    try {
      await navigator.clipboard.writeText(
        `${location.origin}/lobby/${state.code}?game=${state.gameId}`,
      );
      setCopy('copied');
    } catch {
      setCopy('failed');
    }
  }

  return (
    <section
      className={`lobby-page ${state.phase === 'playing' ? 'is-playing' : ''}`}
      data-game={state.gameId}
    >
      <div className="lobby-breadcrumb">
        <button className="text-link" type="button" onClick={leave}>
          <Icon name="back" /> {t.leaveLobby}
        </button>
      </div>
      <header className="lobby-heading">
        <div className="lobby-identity">
          <span className="session-art">
            <img src={card.image} alt="" />
          </span>
          <div>
            <h1>{game.name}</h1>
            {/* Announces phase changes; the session panel shows the phase visually. */}
            <p role="status" className="sr-only">
              {t.phases[state.phase]}
            </p>
          </div>
        </div>
        <button type="button" className="room-code" onClick={copyInvite}>
          <span className="code-label">{t.lobbyCode}</span>
          <strong data-testid="lobby-code">{state.code}</strong>
          <span className="copy-hint" aria-live="polite">
            <Icon name={copy === 'copied' ? 'check' : 'copy'} />
            {copy === 'copied'
              ? t.inviteCopied
              : copy === 'failed'
                ? t.copyFailed
                : t.copyInvite}
          </span>
        </button>
      </header>
      <div
        className={`lobby-layout ${state.phase === 'playing' ? 'is-playing' : ''}`}
      >
        {state.phase !== 'playing' && (
          <div className="players-panel panel">
            <div className="panel-heading">
              <h2>
                {t.players}{' '}
                <span className="player-count">
                  {state.players.length}
                  <span> / {capacity}</span>
                </span>
              </h2>
              <Icon name="users" />
            </div>
            <ul className="player-list" aria-label={t.connectedPlayers}>
              <AnimatePresence initial={false}>
                {state.players.map((player) => (
                  <motion.li
                    key={player.id}
                    layout={!reducedMotion}
                    initial={reducedMotion ? false : { opacity: 0, x: -16 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 16 }}
                  >
                    <button
                      type="button"
                      className="player-seat"
                      aria-expanded={player.id === stats.target?.id}
                      onClick={(event) =>
                        stats.toggle(player.id, event.currentTarget)
                      }
                    >
                      <span
                        className={`life-avatar ${state.gameId === bombParty.id && state.phase === 'results' && state.game.lastEvent === 'exploded' && state.game.lastPlayerId === player.id ? 'life-lost' : ''}`}
                      >
                        <PlayerAvatar avatar={player.avatar} />
                      </span>
                      <span className="player-identity">
                        <strong>
                          {player.displayName}{' '}
                          {player.id === sessionId && (
                            <span className="you-label">{t.you}</span>
                          )}
                        </strong>
                        {player.id === state.hostId && (
                          <span className="player-role">
                            <Icon name="crown" /> {t.host}
                          </span>
                        )}
                      </span>
                      {player.spectator ? (
                        <span className="ready-label is-spectating">
                          <Icon name="eye" />
                          {t.spectating}
                        </span>
                      ) : inGame && state.gameId === tankArena.id ? (
                        <span className="player-lives">
                          {state.game.players.get(player.id)?.alive
                            ? `${state.game.players.get(player.id)!.health} ♥`
                            : t.bp.eliminated}
                        </span>
                      ) : inGame && state.gameId === bombParty.id ? (
                        <span className="player-lives">
                          {state.game.players.get(player.id)?.lives
                            ? `${state.game.players.get(player.id)!.lives} ♥`
                            : t.bp.eliminated}
                          {state.phase === 'results' &&
                            state.game.lastEvent === 'exploded' &&
                            state.game.lastPlayerId === player.id && (
                              <span className="lost-heart" aria-hidden="true">
                                ♥
                              </span>
                            )}
                        </span>
                      ) : (
                        <motion.span
                          key={String(player.ready)}
                          initial={
                            reducedMotion ? false : { scale: 0.6, opacity: 0 }
                          }
                          animate={{ scale: 1, opacity: 1 }}
                          transition={{
                            type: 'spring',
                            visualDuration: 0.3,
                            bounce: 0.5,
                          }}
                          className={`ready-label ${player.ready ? 'is-ready' : ''}`}
                        >
                          {player.ready && <Icon name="check" />}
                          {player.ready ? t.ready : t.notReady}
                        </motion.span>
                      )}
                      {state.gameId === tankArena.id &&
                        state.phase === 'lobby' &&
                        state.teamMode !== 'free-for-all' && (
                          <span
                            className="player-team-dot"
                            title={
                              t.ta.teamNames[
                                Number(
                                  (state.teams.get(player.id) ?? '').replace(
                                    'team-',
                                    '',
                                  ),
                                ) - 1
                              ]
                            }
                          />
                        )}
                    </button>
                  </motion.li>
                ))}
              </AnimatePresence>
              {/* Empty seats show how many more can join; not part of the player list for screen readers. */}
              {Array.from({ length: openSeats }, (_, index) => (
                <motion.li
                  key={`open-${index}`}
                  layout={!reducedMotion}
                  className="open-seat"
                  aria-hidden="true"
                >
                  <span className="avatar" />
                  {t.openSeat}
                </motion.li>
              ))}
            </ul>
            {state.phase === 'lobby' && (
              <div className="players-footnote">
                {t.readyCount(readyCount, participants.length)}
              </div>
            )}
            {state.phase === 'lobby' && state.gameId === tankArena.id && (
              <TankTeamPicker
                mode={state.teamMode}
                teamCount={state.teamCount}
                teams={state.teams}
                players={state.players}
                sessionId={sessionId}
                host={host}
                send={send}
              />
            )}
          </div>
        )}

        <div className="session-panel panel">
          <motion.div
            key={state.phase}
            initial={reducedMotion ? false : { opacity: 0, y: 12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            className="phase-content"
          >
            {state.phase === 'lobby' && (
              <>
                <h2>{t.readyToPlay}</h2>
                <p>{t.requirement(game.minPlayers)}</p>
                {self?.spectator ? (
                  <p className="spectating-note">
                    <Icon name="eye" /> {t.spectatingNote}
                  </p>
                ) : (
                  <button
                    className={`button ready-button ${self?.ready ? 'selected' : ''}`}
                    type="button"
                    disabled={!self}
                    aria-pressed={self?.ready ?? false}
                    onClick={() => send('ready', !self?.ready)}
                  >
                    <Icon name="check" />
                    {self?.ready ? t.notReady : t.ready}
                  </button>
                )}
                <button
                  className="text-link spectate-toggle"
                  type="button"
                  disabled={!self}
                  aria-pressed={self?.spectator ?? false}
                  onClick={() => send('spectate', !self?.spectator)}
                >
                  <Icon name={self?.spectator ? 'play' : 'eye'} />
                  {self?.spectator ? t.playInstead : t.spectate}
                </button>
                {host ? (
                  <button
                    className="button primary"
                    type="button"
                    disabled={!canStart}
                    onClick={() => send('start')}
                  >
                    {t.startSession} <Icon name="arrow" />
                  </button>
                ) : (
                  <p className="waiting-note">{t.hostStarts}</p>
                )}
                {state.gameId === bombParty.id && (
                  <BombPartySettings
                    settings={state.settings}
                    host={host}
                    players={state.players.length}
                    send={send}
                  />
                )}
              </>
            )}
            {state.phase === 'starting' && (
              <div className="phase-message">
                <span className="phase-symbol">
                  <Icon name="play" />
                </span>
                <h3>{t.hereWeGo}</h3>
              </div>
            )}
            {state.phase === 'playing' && state.gameId === tankArena.id && (
              <TankArenaPlay
                state={state}
                sessionId={sessionId}
                send={send}
                error={error}
              />
            )}
            {state.phase === 'playing' && state.gameId === bombParty.id && (
              <BombPartyPlay
                state={state}
                sessionId={sessionId}
                send={send}
                error={error}
                onPlayerClick={stats.toggle}
              />
            )}
            {state.phase === 'results' && (
                <div className="results-content">
                  <span className="phase-symbol">
                    <Icon name="check" />
                  </span>
                  <h3>
                    {tankWinnerTeam && tankWinnerIndex >= 0
                      ? t.ta.teamWinner(t.ta.teamNames[tankWinnerIndex]!)
                      : winner
                        ? t.winner(winner.displayName)
                        : t.noWinner}
                  </h3>
                  {state.resultReason === 'departure' && (
                    <p>{t.winnerDeparture}</p>
                  )}
                  {host ? (
                    <button
                      className="button primary"
                      type="button"
                      onClick={() => send('return')}
                    >
                      {t.returnToLobby} <Icon name="arrow" />
                    </button>
                  ) : (
                    <p className="waiting-note">{t.waitingHost}</p>
                  )}
                </div>
              )}
          </motion.div>
        </div>

        {/* Tank Arena gets a full-width hangar: tank showcase and map board. */}
        {state.phase === 'lobby' &&
          state.gameId === tankArena.id &&
          self &&
          !self.spectator && (
            <div className="loadout-panel panel">
              <TankLoadout
                selected={state.loadouts.get(sessionId)}
                players={state.players}
                loadouts={state.loadouts}
                send={send}
              />
              <MapVote
                selected={state.mapVotes.get(sessionId)}
                votes={state.mapVotes}
                players={state.players}
                send={send}
              />
            </div>
          )}
      </div>
      <StatsPopover
        player={
          statsPlayer
            ? {
                displayName: statsPlayer.displayName,
                avatar: statsPlayer.avatar,
                host: statsPlayer.id === state.hostId,
                you: statsPlayer.id === sessionId,
              }
            : null
        }
        anchor={stats.target?.anchor ?? null}
        onClose={stats.close}
      />
    </section>
  );
}
