import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import type {
  BlackjackSend,
  BlackjackSettings as Settings,
} from '@but/blackjack-party';
import { t } from './i18n';

export function BlackjackSettings({
  settings,
  host,
  send,
}: {
  settings: Settings;
  host: boolean;
  send: BlackjackSend;
}) {
  const [draft, setDraft] = useState(settings);
  const saved = JSON.stringify(settings);
  useEffect(() => setDraft(JSON.parse(saved) as Settings), [saved]);
  const changed = JSON.stringify(draft) !== saved;
  const number = (key: keyof Settings, value: number) =>
    setDraft((current) => ({ ...current, [key]: value }));
  const toggle = (key: keyof Settings, value: boolean) =>
    setDraft((current) => ({ ...current, [key]: value }));

  function save(event: FormEvent) {
    event.preventDefault();
    if (host && changed) send('settings', draft);
  }

  return (
    <section className="blackjack-settings-panel panel">
      <div className="blackjack-settings-heading">
        <div>
          <h2>{t.bj.settings}</h2>
          <p>{t.bj.settingsHint}</p>
        </div>
        {!host && <span className="blackjack-settings-readonly">{t.host}</span>}
      </div>
      <form onSubmit={save}>
        <fieldset disabled={!host}>
          <SettingsGroup title={t.bj.match} open>
            <NumberField
              label={t.bj.rounds}
              value={draft.rounds}
              min={1}
              max={20}
              onChange={(value) => number('rounds', value)}
            />
            <NumberField
              label={t.bj.startingChips}
              value={draft.startingChips}
              min={100}
              max={100000}
              onChange={(value) => number('startingChips', value)}
            />
            <NumberField
              label={t.bj.minBet}
              value={draft.minBet}
              min={1}
              max={draft.maxBet}
              onChange={(value) => number('minBet', value)}
            />
            <NumberField
              label={t.bj.maxBet}
              value={draft.maxBet}
              min={draft.minBet}
              max={draft.startingChips}
              onChange={(value) => number('maxBet', value)}
            />
            <NumberField
              label={t.bj.bettingTimer}
              value={draft.bettingSeconds}
              min={5}
              max={120}
              onChange={(value) => number('bettingSeconds', value)}
            />
            <NumberField
              label={t.bj.actionTimer}
              value={draft.actionSeconds}
              min={5}
              max={120}
              onChange={(value) => number('actionSeconds', value)}
            />
          </SettingsGroup>
          <SettingsGroup title={t.bj.tableRules}>
            <NumberField
              label={t.bj.decks}
              value={draft.decks}
              min={1}
              max={8}
              onChange={(value) => number('decks', value)}
            />
            <label>
              {t.bj.blackjackPayout}
              <select
                value={draft.blackjackPayout}
                onChange={(event) =>
                  number('blackjackPayout', Number(event.target.value))
                }
              >
                <option value={1.2}>6:5</option>
                <option value={1.5}>3:2</option>
                <option value={2}>2:1</option>
              </select>
            </label>
            <Toggle
              label={t.bj.soft17}
              checked={draft.dealerHitsSoft17}
              onChange={(value) => toggle('dealerHitsSoft17', value)}
            />
            <Toggle
              label={t.bj.allowDouble}
              checked={draft.allowDouble}
              onChange={(value) => toggle('allowDouble', value)}
            />
            <Toggle
              label={t.bj.allowSplit}
              checked={draft.allowSplit}
              onChange={(value) => toggle('allowSplit', value)}
            />
            <NumberField
              label={t.bj.maxSplits}
              value={draft.maxSplits}
              min={0}
              max={3}
              disabled={!draft.allowSplit}
              onChange={(value) => number('maxSplits', value)}
            />
            <Toggle
              label={t.bj.doubleAfterSplit}
              checked={draft.doubleAfterSplit}
              disabled={!draft.allowDouble || !draft.allowSplit}
              onChange={(value) => toggle('doubleAfterSplit', value)}
            />
          </SettingsGroup>
          <SettingsGroup title={t.bj.sideBets}>
            <Toggle
              label={t.bj.enabled}
              checked={draft.sideBetsEnabled}
              onChange={(value) => toggle('sideBetsEnabled', value)}
            />
            <Toggle
              label={t.bj.perfectPairs}
              checked={draft.perfectPairsEnabled}
              disabled={!draft.sideBetsEnabled}
              onChange={(value) => toggle('perfectPairsEnabled', value)}
            />
            <Toggle
              label={t.bj.twentyOnePlusThree}
              checked={draft.twentyOnePlusThreeEnabled}
              disabled={!draft.sideBetsEnabled}
              onChange={(value) => toggle('twentyOnePlusThreeEnabled', value)}
            />
            <NumberField
              label={t.bj.minSideBet}
              value={draft.minSideBet}
              min={1}
              max={draft.maxSideBet}
              disabled={!draft.sideBetsEnabled}
              onChange={(value) => number('minSideBet', value)}
            />
            <NumberField
              label={t.bj.maxSideBet}
              value={draft.maxSideBet}
              min={draft.minSideBet}
              max={draft.startingChips}
              disabled={!draft.sideBetsEnabled}
              onChange={(value) => number('maxSideBet', value)}
            />
            <details className="blackjack-payouts">
              <summary>{t.bj.payoutTable}</summary>
              <div className="blackjack-payout-grid">
                <PayoutFields draft={draft} number={number} />
              </div>
            </details>
          </SettingsGroup>
          <SettingsGroup title={t.bj.rebuys}>
            <Toggle
              label={t.bj.enabled}
              checked={draft.rebuysEnabled}
              onChange={(value) => toggle('rebuysEnabled', value)}
            />
            <NumberField
              label={t.bj.rebuyAmount}
              value={draft.rebuyChipAmount}
              min={1}
              max={100000}
              disabled={!draft.rebuysEnabled}
              onChange={(value) => number('rebuyChipAmount', value)}
            />
            <NumberField
              label={t.bj.rebuyCost}
              value={draft.rebuyCost}
              min={1}
              max={100000}
              disabled={!draft.rebuysEnabled}
              onChange={(value) => number('rebuyCost', value)}
            />
            <NumberField
              label={t.bj.maxRebuys}
              value={draft.maxRebuys}
              min={0}
              max={10}
              disabled={!draft.rebuysEnabled}
              onChange={(value) => number('maxRebuys', value)}
            />
            <p className="blackjack-currency-note">{t.bj.currencyNote}</p>
          </SettingsGroup>
          {host && (
            <button
              className="button secondary"
              type="submit"
              disabled={!changed}
            >
              {t.bj.save}
            </button>
          )}
        </fieldset>
      </form>
    </section>
  );
}

function SettingsGroup({
  title,
  children,
  open = false,
}: {
  title: string;
  children: ReactNode;
  open?: boolean;
}) {
  return (
    <details className="blackjack-settings-group" open={open}>
      <summary>{title}</summary>
      <div className="blackjack-settings-grid">{children}</div>
    </details>
  );
}

function NumberField({
  label,
  value,
  min,
  max,
  disabled = false,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  disabled?: boolean;
  onChange: (value: number) => void;
}) {
  return (
    <label>
      {label}
      <input
        type="number"
        required
        min={min}
        max={max}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}

function Toggle({
  label,
  checked,
  disabled = false,
  onChange,
}: {
  label: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="blackjack-toggle">
      <span>{label}</span>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
    </label>
  );
}

function PayoutFields({
  draft,
  number,
}: {
  draft: Settings;
  number: (key: keyof Settings, value: number) => void;
}) {
  const fields = [
    ['perfectPairMixedPayout', t.bj.mixedPair],
    ['perfectPairColoredPayout', t.bj.coloredPair],
    ['perfectPairPayout', t.bj.perfectPair],
    ['twentyOnePlusThreeFlushPayout', t.bj.flush],
    ['twentyOnePlusThreeStraightPayout', t.bj.straight],
    ['twentyOnePlusThreeTripsPayout', t.bj.trips],
    ['twentyOnePlusThreeStraightFlushPayout', t.bj.straightFlush],
    ['twentyOnePlusThreeSuitedTripsPayout', t.bj.suitedTrips],
  ] as const;
  return fields.map(([key, label]) => (
    <NumberField
      key={key}
      label={`${label} : 1`}
      value={draft[key]}
      min={1}
      max={500}
      onChange={(value) => number(key, value)}
    />
  ));
}
