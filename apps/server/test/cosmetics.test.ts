import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { after, test } from 'node:test';
import type { TankArenaRoomState } from '@but/tank-arena';

const accountId = '00000000-0000-4000-8000-000000000001';
let equipped: unknown = { frame: 'coral-frame' };
const legacyFrame = 'mint-frame';
const owned = [
  'coral-frame',
  'mint-frame',
  'velvet-deal',
  'lightning-decal',
  'midnight-cards',
  'royal-avatar',
];
let failedTable = '';
const reads: { table: string; userId: string | null }[] = [];

// Use the real Supabase client against local responses, then verify the state
// actually delivered by Colyseus to another participant.
const supabase = createServer((request, response) => {
  response.setHeader('Content-Type', 'application/json');
  const url = new URL(request.url ?? '/', 'http://localhost');
  if (url.pathname === '/auth/v1/user') {
    response.end(
      JSON.stringify({
        id: accountId,
        is_anonymous: request.headers.authorization === 'Bearer anonymous',
      }),
    );
    return;
  }
  const table = url.pathname.split('/').at(-1) ?? '';
  reads.push({ table, userId: url.searchParams.get('user_id') });
  if (table === failedTable) {
    response.statusCode = 400;
    response.end(JSON.stringify({ message: 'Unavailable test table' }));
  } else if (table === 'player_wallets') {
    response.end(
      JSON.stringify({
        equipped_cosmetics: equipped,
        equipped_cosmetic: legacyFrame,
      }),
    );
  } else if (table === 'player_cosmetics') {
    response.end(JSON.stringify(owned.map((cosmetic_id) => ({ cosmetic_id }))));
  } else {
    response.statusCode = 404;
    response.end('{}');
  }
});
await new Promise<void>((resolve) => supabase.listen(0, '127.0.0.1', resolve));
const address = supabase.address();
assert.ok(address && typeof address === 'object');
process.env.SUPABASE_URL = `http://127.0.0.1:${address.port}`;
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-server-key';
const { useTestServer } = await import('./lobbyClient.js');
const { equippedCosmetics } = await import('../src/rewards.js');
const { create, join, waitFor } =
  useTestServer<TankArenaRoomState>('tank-arena');
after(
  () =>
    new Promise<void>((resolve, reject) =>
      supabase.close((error) => (error ? reject(error) : resolve())),
    ),
);

test('owned equipped cosmetics sync to other players and ignore join payloads', async () => {
  equipped = {
    frame: 'coral-frame',
    'card-back': 'midnight-cards',
    'card-animation': 'velvet-deal',
    'tank-decal': 'lightning-decal',
  };
  const spoofedOptions = {
    authToken: 'signed-in',
    cosmetics: JSON.stringify({ frame: 'sky-frame' }),
  };
  const host = await create('Host', spoofedOptions);
  const readCount = reads.length;
  const guest = await join(host.roomId, 'Guest', {
    ...spoofedOptions,
    authToken: '',
  });
  const anonymous = await join(host.roomId, 'Anonymous', {
    ...spoofedOptions,
    authToken: 'anonymous',
  });
  await waitFor(host, (state) => state.players.size === 3);
  assert.deepEqual(
    JSON.parse(guest.state.players.get(host.sessionId)!.cosmetics!),
    equipped,
  );
  assert.equal(host.state.players.get(guest.sessionId)!.cosmetics, '{}');
  assert.equal(host.state.players.get(anonymous.sessionId)!.cosmetics, '{}');
  assert.equal(reads.length, readCount, 'Guests do not read private wallets');
  assert.ok(reads.every((read) => read.userId === `eq.${accountId}`));
});

test('loadout validation rejects unowned, unknown and wrong-slot cosmetics', async () => {
  equipped = {
    frame: 'sky-frame',
    'card-back': 'coral-frame',
    'tank-decal': 'made-up',
    arbitrary: 'coral-frame',
  };
  assert.deepEqual(await equippedCosmetics(accountId), {});
});

test('legacy frame fallback does not override an explicitly empty loadout', async () => {
  equipped = null;
  assert.deepEqual(await equippedCosmetics(accountId), { frame: 'mint-frame' });
  equipped = {};
  assert.deepEqual(await equippedCosmetics(accountId), {});
});

test('database and ownership failures allow joining with default cosmetics', async () => {
  equipped = { frame: 'coral-frame' };
  for (const table of ['player_wallets', 'player_cosmetics']) {
    failedTable = table;
    const client = await create('Unavailable', { authToken: 'signed-in' });
    assert.equal(client.state.players.get(client.sessionId)!.cosmetics, '{}');
  }
  failedTable = '';
});

test('owned paid avatars broadcast to other players and guests cannot forge them', async () => {
  equipped = { avatar: 'royal-avatar' };
  const host = await create('Royal', { authToken: 'signed-in', avatar: 11 });
  const spoofedOptions = {
    avatar: 12,
    cosmetics: JSON.stringify({ avatar: 'royal-avatar' }),
  };
  const guest = await join(host.roomId, 'Guest', spoofedOptions);
  const anonymous = await join(host.roomId, 'Anonymous', {
    ...spoofedOptions,
    authToken: 'anonymous',
  });
  await waitFor(host, (state) => state.players.size === 3);
  assert.equal(guest.state.players.get(host.sessionId)!.avatar, 12);
  assert.deepEqual(
    JSON.parse(guest.state.players.get(host.sessionId)!.cosmetics!),
    { avatar: 'royal-avatar' },
  );
  assert.equal(host.state.players.get(guest.sessionId)!.avatar, 0);
  assert.equal(host.state.players.get(anonymous.sessionId)!.avatar, 0);
});

test('unowned paid avatars cannot bypass the free avatar validation', async () => {
  equipped = { avatar: 'astronaut-avatar' };
  const client = await create('Unowned', {
    authToken: 'signed-in',
    avatar: 13,
  });
  assert.equal(client.state.players.get(client.sessionId)!.avatar, 0);
  assert.equal(client.state.players.get(client.sessionId)!.cosmetics, '{}');
  const free = await join(client.roomId, 'Free', {
    authToken: 'signed-in',
    avatar: 11,
  });
  assert.equal(free.state.players.get(free.sessionId)!.avatar, 11);
});

test('removing a paid avatar restores the selected free avatar on the next join', async () => {
  equipped = { avatar: 'royal-avatar' };
  const host = await create('Royal', { authToken: 'signed-in', avatar: 10 });
  equipped = {};
  const rejoined = await join(host.roomId, 'Free again', {
    authToken: 'signed-in',
    avatar: 10,
  });
  await waitFor(host, (state) => state.players.size === 2);
  assert.equal(host.state.players.get(rejoined.sessionId)!.avatar, 10);
  assert.equal(host.state.players.get(rejoined.sessionId)!.cosmetics, '{}');
  assert.equal(rejoined.state.players.get(host.sessionId)!.avatar, 12);
});
