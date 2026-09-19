import { useState } from 'react';
import { Icon } from './Icon';
import { lang, setLanguage, t, type Language } from './i18n';
import { loadSettings, saveSettings, type AppSettings } from './settings';

export function SettingsPanel({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [settings, setSettings] = useState<AppSettings>(loadSettings);

  function updateSettings(next: AppSettings) {
    setSettings(next);
    saveSettings(next);
    window.dispatchEvent(
      new CustomEvent<AppSettings>('but-settings-change', { detail: next }),
    );
  }

  if (!open) return null;
  return (
    <div className="community-drawer-layer">
      <button
        className="community-drawer-backdrop"
        type="button"
        aria-label={t.community.closePanel}
        onClick={onClose}
      />
      <aside
        id="settings-drawer"
        className="community-drawer settings-drawer"
        role="dialog"
        aria-label={t.settings}
      >
        <header className="community-drawer-header">
          <div className="community-drawer-heading">
            <span className="community-drawer-icon settings-drawer-icon">
              <Icon name="settings" />
            </span>
            <div>
              <span className="eyebrow">{t.settings}</span>
              <h2>{t.community.settingsDescription}</h2>
            </div>
          </div>
          <button
            className="community-drawer-close"
            type="button"
            aria-label={t.community.closePanel}
            onClick={onClose}
          >
            ×
          </button>
        </header>
        <div className="community-drawer-body settings-drawer-body">
          <label className="settings-option">
            <span>
              <strong>{t.community.language}</strong>
              <small>
                {t.community.english} / {t.community.frenchLanguage}
              </small>
            </span>
            <select
              value={lang}
              aria-label={t.community.language}
              onChange={(event) =>
                setLanguage(event.target.value as Language)
              }
            >
              <option value="en">{t.community.english}</option>
              <option value="fr">{t.community.frenchLanguage}</option>
            </select>
          </label>
          <div className="settings-option settings-toggle">
            <span>
              <strong>{t.community.reduceMotion}</strong>
              <small>{t.community.reduceMotionDescription}</small>
            </span>
            <button
              className="settings-toggle-control"
              type="button"
              role="switch"
              aria-checked={settings.reduceMotion}
              aria-label={t.community.reduceMotion}
              onClick={() =>
                updateSettings({ reduceMotion: !settings.reduceMotion })
              }
            />
          </div>
        </div>
      </aside>
    </div>
  );
}
