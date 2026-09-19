export type CosmeticId = 'coral-frame' | 'mint-frame' | 'sky-frame';

export interface Cosmetic {
  id: CosmeticId;
  name: string;
  description: string;
  price: number;
}

export const cosmetics: readonly Cosmetic[] = [
  {
    id: 'coral-frame',
    name: 'Coral frame',
    description: 'A warm edge for your profile.',
    price: 40,
  },
  {
    id: 'mint-frame',
    name: 'Mint frame',
    description: 'A bright, clean finish.',
    price: 60,
  },
  {
    id: 'sky-frame',
    name: 'Sky frame',
    description: 'A cool blue highlight.',
    price: 80,
  },
];

export function isCosmeticId(value: unknown): value is CosmeticId {
  return cosmetics.some((cosmetic) => cosmetic.id === value);
}
