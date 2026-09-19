import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { Client } from '@colyseus/sdk';

test('invalid PORT fails before listening', () => {
  const result = spawnSync(
    process.execPath,
    ['--import', 'tsx', 'src/index.ts'],
    {
      env: { ...process.env, PORT: 'invalid' },
      encoding: 'utf8',
      timeout: 10_000,
    },
  );
  assert.equal(result.status, 1);
  assert.match(result.stderr, /PORT must be an integer/);
});

// Run against the local development server; no product networking is involved.
test(
  'two clients can join and leave the foundation room',
  { timeout: 10_000 },
  async () => {
    const client = new Client(`http://127.0.0.1:${process.env.PORT ?? 2567}`);
    const first = await client.create('foundation');
    try {
      const second = await client.joinById(first.roomId);
      try {
        assert.equal(second.roomId, first.roomId);
        assert.notEqual(second.sessionId, first.sessionId);
      } finally {
        await second.leave();
      }
    } finally {
      await first.leave();
    }
  },
);
