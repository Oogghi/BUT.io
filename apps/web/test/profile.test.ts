import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { AVATAR_COUNT, DISPLAY_NAME_MAX_LENGTH } from '@but/shared';
import { loadProfile, saveProfile } from '../src/profile.ts';

function storage(t: TestContext, value: string | null) {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  let saved = value;
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: () => saved,
      setItem: (_key: string, next: string) => {
        saved = next;
      },
    },
  });
  t.after(() => {
    if (original) Object.defineProperty(globalThis, 'localStorage', original);
    else Reflect.deleteProperty(globalThis, 'localStorage');
  });
  return (value: string | null) => {
    saved = value;
  };
}

test('missing, malformed and unexpected saved profiles fall back safely', (t) => {
  const seed = storage(t, null);
  for (const value of [
    null,
    '{bad json',
    'null',
    'false',
    '[]',
    '42',
    '"text"',
  ]) {
    seed(value);
    assert.deepEqual(loadProfile(), { displayName: '', avatar: 0 });
  }
});

test('stored fields are bounded before being used in the UI', (t) => {
  const seed = storage(
    t,
    JSON.stringify({ displayName: 'x'.repeat(100), avatar: AVATAR_COUNT }),
  );
  assert.deepEqual(loadProfile(), {
    displayName: 'x'.repeat(DISPLAY_NAME_MAX_LENGTH),
    avatar: 0,
  });
  for (const avatar of [-1, 1.5, '2', null]) {
    seed(JSON.stringify({ displayName: {}, avatar }));
    assert.deepEqual(loadProfile(), { displayName: '', avatar: 0 });
  }
});

test('name and avatar survive saving and reloading', (t) => {
  storage(t, null);
  const profile = { displayName: 'Alice', avatar: AVATAR_COUNT - 1 };
  assert.equal(saveProfile(profile), true);
  assert.deepEqual(loadProfile(), profile);
});

test('unavailable browser storage does not prevent playing', (t) => {
  storage(t, null);
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    get() {
      throw new Error('Storage access denied');
    },
  });
  assert.deepEqual(loadProfile(), { displayName: '', avatar: 0 });
  assert.equal(saveProfile({ displayName: 'Alice', avatar: 0 }), false);
});
