import type { PokerMode, PokerSettings } from '@but/poker-party';

export function PokerSettingsPanel({
  settings,
  host,
  send,
}: {
  settings: PokerSettings;
  host: boolean;
  send: (type: string, payload?: unknown) => void;
}) {
  function update(changes: Partial<PokerSettings>) {
    send('settings', { ...settings, ...changes });
  }

  return (
    <section
      className="poker-settings-panel"
      aria-labelledby="poker-settings-title"
    >
      <div className="poker-settings-heading">
        <div>
          <span className="poker-settings-kicker">Poker Party</span>
          <h2 id="poker-settings-title">Choisis ta table</h2>
          <p>Deux façons de jouer, une seule table jaune.</p>
        </div>
        <span className="poker-settings-mark" aria-hidden="true">
          ♠
        </span>
      </div>
      <div
        className="poker-mode-switch"
        role="group"
        aria-label="Mode de Poker"
      >
        {(
          [
            ['ultimate', 'Ultimate Poker', 'Contre le dealer · 1 à 6 joueurs'],
            ['holdem', 'Poker classique', 'Texas Hold’em · 2 à 6 joueurs'],
          ] as const
        ).map(([mode, label, hint]) => (
          <button
            key={mode}
            type="button"
            className={settings.mode === mode ? 'is-selected' : ''}
            disabled={!host}
            aria-pressed={settings.mode === mode}
            onClick={() => update({ mode: mode as PokerMode })}
          >
            <strong>{label}</strong>
            <small>{hint}</small>
          </button>
        ))}
      </div>
      <div className="poker-settings-fields">
        <label>
          <span>Manches</span>
          <input
            type="number"
            min="1"
            max="20"
            value={settings.rounds}
            disabled={!host}
            onChange={(event) => update({ rounds: Number(event.target.value) })}
          />
        </label>
        <label>
          <span>Jetons de départ</span>
          <input
            type="number"
            min="100"
            value={settings.startingChips}
            disabled={!host}
            onChange={(event) =>
              update({ startingChips: Number(event.target.value) })
            }
          />
        </label>
        <label>
          <span>
            {settings.mode === 'ultimate' ? 'Ante minimum' : 'Petite blind'}
          </span>
          <input
            type="number"
            min="1"
            value={
              settings.mode === 'ultimate' ? settings.ante : settings.smallBlind
            }
            disabled={!host}
            onChange={(event) =>
              update(
                settings.mode === 'ultimate'
                  ? { ante: Number(event.target.value) }
                  : { smallBlind: Number(event.target.value) },
              )
            }
          />
        </label>
        {settings.mode === 'holdem' && (
          <>
            <label>
              <span>Grosse blind</span>
              <input
                type="number"
                min="1"
                value={settings.bigBlind}
                disabled={!host}
                onChange={(event) =>
                  update({ bigBlind: Number(event.target.value) })
                }
              />
            </label>
            <label>
              <span>Relance minimum</span>
              <input
                type="number"
                min="1"
                value={settings.minRaise}
                disabled={!host}
                onChange={(event) =>
                  update({ minRaise: Number(event.target.value) })
                }
              />
            </label>
          </>
        )}
        <label className="poker-toggle-field">
          <span>Cartes visibles</span>
          <input
            type="checkbox"
            checked={settings.showAllCards}
            disabled={!host}
            onChange={(event) => update({ showAllCards: event.target.checked })}
          />
        </label>
      </div>
      {!host && (
        <p className="poker-settings-readonly">
          Seul l’hôte peut modifier la table.
        </p>
      )}
    </section>
  );
}
