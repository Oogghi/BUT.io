export interface AppSettings {
  reduceMotion: boolean;
}

const storageKey = 'but.settings';

export function loadSettings(): AppSettings {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(storageKey) ?? '{}');
    return {
      reduceMotion: Boolean((saved as Partial<AppSettings> | null)?.reduceMotion),
    };
  } catch {
    return { reduceMotion: false };
  }
}

export function saveSettings(settings: AppSettings) {
  try {
    localStorage.setItem(storageKey, JSON.stringify(settings));
  } catch {
    // Storage can be unavailable; the setting still applies for this session.
  }
}
