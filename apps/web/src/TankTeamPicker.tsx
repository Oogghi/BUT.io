import { useState, type CSSProperties, type DragEvent } from 'react';
import {
  tankTeamCounts,
  tankTeamIds,
  tankTeamModes,
  type TankTeamMode,
} from '@but/tank-arena';
import { PlayerAvatar } from './Avatar';
import { Icon } from './Icon';
import { t } from './i18n';

interface LobbyPlayer {
  id: string;
  displayName: string;
  avatar: number;
  spectator: boolean;
}

const TEAM_ACCENTS = ['#ff6b4a', '#45dcae', '#6cc4ff', '#ffc43d'];

export function TankTeamPicker({
  mode,
  teamCount,
  teams,
  players,
  sessionId,
  host,
  send,
}: {
  mode: TankTeamMode;
  teamCount: number;
  teams: ReadonlyMap<string, string>;
  players: readonly LobbyPlayer[];
  sessionId: string;
  host: boolean;
  send: (type: string, payload?: unknown) => void;
}) {
  const [dragging, setDragging] = useState(false);
  const participants = players.filter((player) => !player.spectator);

  function join(teamId: string) {
    if (mode !== 'free-for-all') send('team-join', teamId);
  }

  function drop(event: DragEvent<HTMLDivElement>, teamId: string) {
    event.preventDefault();
    setDragging(false);
    join(teamId);
  }

  return (
    <section className="tank-team-picker" aria-labelledby="team-picker-title">
      <div className="tank-team-heading">
        <div>
          <h3 id="team-picker-title">{t.ta.teamSetup}</h3>
          <p>{t.ta.teamSetupHint}</p>
        </div>
        <span className="team-setup-count">
          {participants.length}/{tankTeamModes[mode].maxPlayers}
        </span>
      </div>

      <div className="team-mode-switch" role="group" aria-label={t.ta.teamMode}>
        {Object.keys(tankTeamModes).map((value) => {
          const teamMode = value as TankTeamMode;
          const info = tankTeamModes[teamMode];
          return (
            <button
              key={teamMode}
              type="button"
              className={mode === teamMode ? 'selected' : ''}
              aria-pressed={mode === teamMode}
              disabled={!host || participants.length > info.maxPlayers}
              onClick={() => send('team-mode', teamMode)}
            >
              {t.ta.teamModes[teamMode]}
            </button>
          );
        })}
      </div>

      {mode === 'teams' && (
        <div className="team-count-row">
          <span>{t.ta.numberOfTeams}</span>
          <div role="group" aria-label={t.ta.numberOfTeams}>
            {tankTeamCounts.map((count) => (
              <button
                key={count}
                type="button"
                className={teamCount === count ? 'selected' : ''}
                aria-pressed={teamCount === count}
                disabled={!host || participants.length < count}
                onClick={() => send('team-count', count)}
              >
                {count}
              </button>
            ))}
          </div>
        </div>
      )}

      {mode === 'free-for-all' ? (
        <div className="team-solo-roster" aria-label={t.ta.freeForAll}>
          {participants.map((player) => (
            <div className="team-solo-player" key={player.id}>
              <PlayerAvatar avatar={player.avatar} />
              <span>{player.displayName}</span>
              {player.id === sessionId && <strong>{t.you}</strong>}
            </div>
          ))}
          {!participants.length && (
            <p className="team-setup-empty">{t.ta.teamSetupEmpty}</p>
          )}
        </div>
      ) : (
        <div className="team-lanes">
          {tankTeamIds(mode, teamCount).map((teamId, index) => {
            const members = participants.filter(
              (player) => teams.get(player.id) === teamId,
            );
            const inTeam = members.some((player) => player.id === sessionId);
            return (
              <div
                key={teamId}
                className={`team-lane ${dragging ? 'is-drop-target' : ''} ${inTeam ? 'is-yours' : ''}`}
                style={
                  { '--team-accent': TEAM_ACCENTS[index] } as CSSProperties
                }
                onDragOver={(event) => {
                  if (!inTeam) event.preventDefault();
                }}
                onDrop={(event) => drop(event, teamId)}
              >
                <div className="team-lane-header">
                  <span className="team-lane-marker" />
                  <strong>{t.ta.teamNames[index]}</strong>
                  <span>{members.length}</span>
                </div>
                <div className="team-lane-members">
                  {members.map((player) => (
                    <div
                      key={player.id}
                      className="team-member-chip"
                      draggable={player.id === sessionId}
                      onDragStart={() => {
                        if (player.id === sessionId) setDragging(true);
                      }}
                      onDragEnd={() => setDragging(false)}
                      title={
                        player.id === sessionId ? t.ta.dragYourself : undefined
                      }
                    >
                      <PlayerAvatar avatar={player.avatar} />
                      <span>{player.displayName}</span>
                      {player.id === sessionId && (
                        <Icon name="check" className="team-member-check" />
                      )}
                    </div>
                  ))}
                  {!inTeam && (
                    <button
                      type="button"
                      className="team-join-button"
                      onClick={() => join(teamId)}
                    >
                      <Icon name="users" /> {t.ta.joinTeam}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <p className="team-setup-footnote">
        {host ? t.ta.hostCanChangeMode : t.ta.chooseTeamHint}
      </p>
    </section>
  );
}
