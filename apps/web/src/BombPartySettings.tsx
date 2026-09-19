import { useEffect, useState, type FormEvent } from 'react';
import type {
  BombPartySettings as Settings,
  BombPartySend,
} from '@but/bomb-party';
import { t } from './i18n';

export function BombPartySettings({
  settings,
  host,
  players,
  send,
}: {
  settings: Settings;
  host: boolean;
  players: number;
  send: BombPartySend;
}) {
  const [draft, setDraft] = useState(settings);
  const saved = JSON.stringify(settings);
  useEffect(() => setDraft(JSON.parse(saved) as Settings), [saved]);
  const changed = JSON.stringify(draft) !== saved;
  function save(event: FormEvent) {
    event.preventDefault();
    if (host && changed) send('settings', draft);
  }
  return (
    <details className="game-settings">
      <summary>{t.bp.settings}</summary>
      <form onSubmit={save}>
        <fieldset disabled={!host}>
          <div className="settings-grid">
            <label>
              {t.bp.dictionary}
              <select value={draft.dictionary} onChange={() => {}}>
                <option value="fr">{t.bp.french}</option>
              </select>
            </label>
            <label>
              {t.bp.difficulty}
              <select
                value={draft.difficulty}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    difficulty: event.target.value as Settings['difficulty'],
                  })
                }
              >
                {(['easy', 'normal', 'hard'] as const).map((level) => (
                  <option value={level} key={level}>
                    {t.bp[level]}
                  </option>
                ))}
              </select>
            </label>
            {(
              [
                ['minTurnSeconds', t.bp.minimum, 1, 30],
                ['maxPromptAge', t.bp.age, 1, 20],
                ['startingLives', t.bp.startLives, 1, draft.maxLives],
                ['maxLives', t.bp.maxLives, draft.startingLives, 10],
                ['maxPlayers', t.bp.maxPlayers, Math.max(2, players), 8],
              ] as const
            ).map(([key, label, min, max]) => (
              <label key={key}>
                {label}
                <input
                  type="number"
                  required
                  min={min}
                  max={max}
                  step="1"
                  value={draft[key]}
                  onChange={(event) =>
                    setDraft({ ...draft, [key]: Number(event.target.value) })
                  }
                />
              </label>
            ))}
            <label>
              {t.bp.alphabet}
              <input
                value={draft.bonusAlphabet}
                maxLength={26}
                pattern="[a-zA-Z]*"
                onChange={(event) =>
                  setDraft({ ...draft, bonusAlphabet: event.target.value })
                }
              />
            </label>
          </div>
          {host && (
            <button
              type="submit"
              className="button secondary"
              disabled={!changed}
            >
              {t.bp.save}
            </button>
          )}
        </fieldset>
      </form>
    </details>
  );
}
