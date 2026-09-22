import { t } from './i18n';
import {
  pokerSettingsLimits as limits,
  type PokerMode,
  type PokerSettings,
} from '@but/poker-party';

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
          <h2 id="poker-settings-title">{t.pk.chooseTable}</h2>
          <p>{t.pk.tableHint}</p>
        </div>
        <span className="poker-settings-mark" aria-hidden="true">
          ♠
        </span>
      </div>
      <div
        className="poker-mode-switch"
        role="group"
        aria-label={t.pk.chooseTable}
      >
        {(
          [
            ['ultimate', 'Ultimate Poker', t.pk.ultimateHint],
            ['holdem', t.pk.holdem, t.pk.holdemHint],
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
          <span>{t.bj.rounds}</span>
          <input
            type="number"
            {...limits.rounds}
            value={settings.rounds}
            disabled={!host}
            onChange={(event) => update({ rounds: Number(event.target.value) })}
          />
        </label>
        <label>
          <span>{t.bj.startingChips}</span>
          <input
            type="number"
            {...limits.startingChips}
            value={settings.startingChips}
            disabled={!host}
            onChange={(event) =>
              update({ startingChips: Number(event.target.value) })
            }
          />
        </label>
        <label>
          <span>
            {settings.mode === 'ultimate' ? t.pk.anteMin : t.pk.smallBlind}
          </span>
          <input
            type="number"
            min={1}
            max={
              settings.mode === 'ultimate'
                ? Math.floor(settings.startingChips / 4)
                : settings.bigBlind
            }
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
              <span>{t.pk.bigBlind}</span>
              <input
                type="number"
                min={settings.smallBlind}
                max={settings.startingChips}
                value={settings.bigBlind}
                disabled={!host}
                onChange={(event) =>
                  update({ bigBlind: Number(event.target.value) })
                }
              />
            </label>
            <label>
              <span>{t.pk.minRaise}</span>
              <input
                type="number"
                {...limits.minRaise}
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
          <span>{t.pk.showCards}</span>
          <input
            type="checkbox"
            checked={settings.showAllCards}
            disabled={!host}
            onChange={(event) => update({ showAllCards: event.target.checked })}
          />
        </label>
      </div>
      {!host && <p className="poker-settings-readonly">{t.pk.hostOnly}</p>}
    </section>
  );
}
