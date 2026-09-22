import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  AVATAR_COUNT,
  isAvatar,
  premiumAvatars,
  resolvePlayerAvatar,
  normalizeCosmeticLoadout,
} from '../src/index.ts';

test('browser profiles accept all free looks but never premium numeric IDs', () => {
  assert.equal(AVATAR_COUNT, 12);
  for (let avatar = 0; avatar < AVATAR_COUNT; avatar++)
    assert.equal(isAvatar(avatar), true);
  for (const avatar of [
    -1,
    0.5,
    '6',
    null,
    undefined,
    ...premiumAvatars.map((item) => item.avatar),
  ]) {
    assert.equal(isAvatar(avatar), false);
    assert.equal(resolvePlayerAvatar(avatar, {}), 0);
  }
});

test('verified premium equipment overrides free look; clearing restores the fallback', () => {
  for (const item of premiumAvatars) {
    assert.equal(
      resolvePlayerAvatar(
        11,
        normalizeCosmeticLoadout({ avatar: item.id }, [item.id]),
      ),
      item.avatar,
    );
    assert.equal(
      resolvePlayerAvatar(
        11,
        normalizeCosmeticLoadout({ avatar: item.id }, []),
      ),
      11,
    );
  }
  assert.equal(resolvePlayerAvatar(9, { frame: 'mint-frame' }), 9);
});
