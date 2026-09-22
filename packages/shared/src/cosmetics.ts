/** Visual-only equipment, shared by the shop and the game server. */
export const cosmeticSlots = [
  'avatar',
  'frame',
  'card-back',
  'card-animation',
  'tank-decal',
] as const;
export type CosmeticSlot = (typeof cosmeticSlots)[number];
export const cosmeticCatalog = [
  { id: 'coral-frame', slot: 'frame', price: 40 },
  { id: 'mint-frame', slot: 'frame', price: 60 },
  { id: 'sky-frame', slot: 'frame', price: 80 },
  { id: 'midnight-cards', slot: 'card-back', price: 70 },
  { id: 'sunset-cards', slot: 'card-back', price: 70 },
  { id: 'mint-cards', slot: 'card-back', price: 70 },
  { id: 'velvet-deal', slot: 'card-animation', price: 100 },
  { id: 'spiral-deal', slot: 'card-animation', price: 120 },
  { id: 'snap-deal', slot: 'card-animation', price: 100 },
  { id: 'lightning-decal', slot: 'tank-decal', price: 90 },
  { id: 'star-decal', slot: 'tank-decal', price: 90 },
  { id: 'stripes-decal', slot: 'tank-decal', price: 90 },
  { id: 'royal-avatar', slot: 'avatar', price: 120 },
  { id: 'astronaut-avatar', slot: 'avatar', price: 160 },
  { id: 'wizard-avatar', slot: 'avatar', price: 140 },
  { id: 'robot-avatar', slot: 'avatar', price: 160 },
] as const;
export type CosmeticId = (typeof cosmeticCatalog)[number]['id'];
export type CosmeticLoadout = Partial<Record<CosmeticSlot, CosmeticId>>;
export function isCosmeticId(value: unknown): value is CosmeticId {
  return cosmeticCatalog.some((item) => item.id === value);
}
/** Reject unknown items and wrong-slot assignments; optionally enforce ownership. */
export function normalizeCosmeticLoadout(
  value: unknown,
  owned?: readonly string[],
): CosmeticLoadout {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const row = value as Record<string, unknown>;
  const result: CosmeticLoadout = {};
  for (const slot of cosmeticSlots) {
    const item = cosmeticCatalog.find(
      (item) => item.slot === slot && item.id === row[slot],
    );
    if (item && (!owned || owned.includes(item.id))) result[slot] = item.id;
  }
  return result;
}
export function parseCosmeticLoadout(
  value: string | undefined,
): CosmeticLoadout {
  try {
    return normalizeCosmeticLoadout(JSON.parse(value || '{}'));
  } catch {
    return {};
  }
}
/** Normalized polygons shared by the SVG previews and both tank renderers. */
export function decalPolygons(
  id: string | undefined,
): readonly (readonly number[])[] {
  switch (id) {
    case 'lightning-decal':
      return [
        [0.1, -1, -0.8, 0.15, -0.1, 0.15, -0.35, 1, 0.85, -0.25, 0.15, -0.25],
      ];
    case 'star-decal':
      return [
        [
          0, -1, 0.24, -0.32, 0.95, -0.31, 0.38, 0.13, 0.59, 0.81, 0, 0.42,
          -0.59, 0.81, -0.38, 0.13, -0.95, -0.31, -0.24, -0.32,
        ],
      ];
    case 'stripes-decal':
      return [
        [-1, -0.65, -0.55, -0.9, 0.15, 0.7, -0.3, 0.9],
        [-0.2, -0.65, 0.25, -0.9, 0.95, 0.7, 0.5, 0.9],
      ];
    default:
      return [];
  }
}
