import { motion } from 'motion/react';
import type { BlackjackSnapshot } from './lobbyConnection';
import { PlayerAvatar } from './Avatar';
import { Icon } from './Icon';
import { t } from './i18n';

export function BlackjackResults({
  state,
  sessionId,
  host,
  send,
}: {
  state: BlackjackSnapshot;
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
    <div className="blackjack-results">
      <span className="blackjack-results-mark">♠</span>
      <h2>{t.bj.finalStandings}</h2>
      <p>{t.bj.finalHint}</p>
      <ol>
        {ranked.map(({ lobby, game }, index) => (
          <motion.li
            key={lobby.id}
            initial={{ opacity: 0, x: -16 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: index * 0.08 }}
            className={`${lobby.id === sessionId ? 'is-you' : ''}${index === 0 ? ' is-winner' : ''}`}
          >
            <span className="blackjack-rank">{index + 1}</span>
            <PlayerAvatar avatar={lobby.avatar} />
            <span className="blackjack-result-player">
              <strong>{lobby.displayName}</strong>
              <small>
                {t.bj.blackjacks(game.blackjacks)} ·{' '}
                {t.bj.roundsWon(game.roundsWon)}
              </small>
            </span>
            <strong className="blackjack-final-chips">
              {t.bj.chips(game.chips)}
            </strong>
          </motion.li>
        ))}
      </ol>
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
  );
}
