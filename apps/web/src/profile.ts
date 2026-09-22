import { DISPLAY_NAME_MAX_LENGTH, isAvatar } from '@but/shared';

/** The player's name and avatar, remembered in this browser. */
export interface Profile {
  displayName: string;
  avatar: number;
}

const storageKey = 'but.profile';

export function loadProfile(): Profile {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(storageKey) ?? '{}');
    const { displayName, avatar } = (saved ?? {}) as Partial<Profile>;
    return {
      displayName:
        typeof displayName === 'string'
          ? displayName.slice(0, DISPLAY_NAME_MAX_LENGTH)
          : '',
      avatar: isAvatar(avatar) ? avatar : 0,
    };
  } catch {
    return { displayName: '', avatar: 0 };
  }
}

export function saveProfile(profile: Profile) {
  try {
    localStorage.setItem(storageKey, JSON.stringify(profile));
    return true;
  } catch {
    // The caller can explain that this change will not survive a reload.
    return false;
  }
}
