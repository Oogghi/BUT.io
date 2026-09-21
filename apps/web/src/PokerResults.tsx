import type { PokerSnapshot } from './lobbyConnection';
import { PlayerAvatar } from './Avatar';
import { Icon } from './Icon';

export function PokerResults({
  state,
  sessionId,
  host,
  send,
}: {
  state: PokerSnapshot;
  sessionId: string;
  host: boolean;
  send: (type: string, payload?: unknown) => void;
}) {
  const ranked = state.game.rankings
    .map((id) => ({
      lobby: state.players.find((player) => player.id === id),
      game: state.game.players.get(id),
    }))
    .filter(
      (
        entry,
      ): entry is {
        lobby: NonNullable<typeof entry.lobby>;
        game: NonNullable<typeof entry.game>;
      } => Boolean(entry.lobby && entry.game),
    );
  return (
    <div className="poker-results">
      <span className="poker-results-mark">♠</span>
      <h2>Fin de la table</h2>
      <p>
        {state.settings.mode === 'ultimate'
          ? 'Les mains ont été comparées au dealer.'
          : 'Le meilleur jeu remporte le pot.'}
      </p>
      <ol>
        {ranked.map(({ lobby, game }, index) => (
          <li
            key={lobby.id}
            className={`${lobby.id === sessionId ? 'is-you' : ''}${index === 0 ? ' is-winner' : ''}`}
          >
            <span className="poker-result-rank">{index + 1}</span>
            <PlayerAvatar avatar={lobby.avatar} />
            <span className="poker-result-player">
              <strong>{lobby.displayName}</strong>
              <small>{game.handLabel || game.outcome}</small>
            </span>
            <strong className="poker-result-chips">{game.chips} ◉</strong>
          </li>
        ))}
      </ol>
      {host ? (
        <button
          className="button primary"
          type="button"
          onClick={() => send('return')}
        >
          Retour au lobby <Icon name="arrow" />
        </button>
      ) : (
        <p className="waiting-note">En attente de l’hôte</p>
      )}
    </div>
  );
}
