import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  cosmeticCatalog,
  isPersistedCosmeticId,
  persistedCosmeticIds,
  normalizeCosmeticLoadout,
  parseCosmeticLoadout,
} from '../src/cosmetics.ts';

test('only known, owned items in matching slots survive loadout validation', () => {
  assert.deepEqual(
    normalizeCosmeticLoadout(
      {
        frame: 'mint-frame',
        'card-back': 'midnight-cards',
        'card-animation': 'lightning-decal',
        'tank-decal': 'star-decal',
        extra: 'sky-frame',
      },
      ['mint-frame', 'midnight-cards', 'lightning-decal'],
    ),
    {
      frame: 'mint-frame',
      'card-back': 'midnight-cards',
    },
  );
  for (const input of [null, false, 'sky-frame', [], 42]) {
    assert.deepEqual(normalizeCosmeticLoadout(input), {});
  }
  for (const input of [
    undefined,
    '',
    '{',
    'null',
    '[]',
    '{"frame":"unknown"}',
  ]) {
    assert.deepEqual(parseCosmeticLoadout(input), {});
  }
});

test('expanded artwork catalog matches the unapplied expansion migration', () => {
  const sql = readFileSync(
    new URL(
      '../../../supabase/migrations/20260921224407_premium_avatar_cosmetics.sql',
      import.meta.url,
    ),
    'utf8',
  );
  const rows = [
    ...sql.matchAll(/\('([^']+)', '([^']+)', (\d+)::bigint\)/g),
  ].map(([, id, slot, price]) => ({ id, slot, price: Number(price) }));
  assert.deepEqual(rows, cosmeticCatalog);
});

test('live purchasable items and prices match the deployed single-frame RPC', () => {
  const sql = readFileSync(
    new URL(
      '../../../supabase/migrations/20260919190000_rewards.sql',
      import.meta.url,
    ),
    'utf8',
  );
  const rows = [...sql.matchAll(/when '([^']+)' then (\d+)/g)].map(
    ([, id, price]) => ({ id, price: Number(price) }),
  );
  assert.deepEqual(
    rows,
    cosmeticCatalog
      .filter((item) => isPersistedCosmeticId(item.id))
      .map(({ id, price }) => ({ id, price })),
  );
  assert.deepEqual(
    rows.map(({ id }) => id),
    persistedCosmeticIds,
  );
  assert.equal(isPersistedCosmeticId('royal-avatar'), false);
});
