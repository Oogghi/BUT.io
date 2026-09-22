import type { CosmeticLoadout } from './cosmetics.ts';

/** Free looks accepted from a browser profile. Paid looks come only from equipment. */
export const AVATAR_COUNT = 12;
export const premiumAvatars = [
  { id: 'royal-avatar', avatar: 12 },
  { id: 'astronaut-avatar', avatar: 13 },
  { id: 'wizard-avatar', avatar: 14 },
  { id: 'robot-avatar', avatar: 15 },
] as const;

export function isAvatar(value: unknown): value is number {
  return (
    Number.isInteger(value) &&
    (value as number) >= 0 &&
    (value as number) < AVATAR_COUNT
  );
}

/** The loadout must already have been validated against account ownership. */
export function resolvePlayerAvatar(
  avatar: unknown,
  loadout: CosmeticLoadout,
): number {
  return (
    premiumAvatars.find((item) => item.id === loadout.avatar)?.avatar ??
    (isAvatar(avatar) ? avatar : 0)
  );
}
