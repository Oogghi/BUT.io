import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { after, test } from 'node:test';
import type { TankArenaRoomState } from '@but/tank-arena';

const accountId = '00000000-0000-4000-8000-000000000001';
let equipped: unknown = 'coral-frame';
const owned = ['coral-frame', 'mint-frame'];
let failedTable = '';
let profileExists = true;
const reads: { table: string; userId: string | null; select: string | null }[] =
  [];

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
  const select = url.searchParams.get('select');
  reads.push({
    table,
    userId: url.searchParams.get(table === 'profiles' ? 'id' : 'user_id'),
    select,
  });
  if (table === 'player_wallets' && select !== 'equipped_cosmetic') {
    response.statusCode = 400;
    response.end(
      JSON.stringify({ code: '42703', message: 'Unknown wallet column' }),
    );
    return;
  }
  if (table === failedTable) {
    response.statusCode = 400;
    response.end(JSON.stringify({ message: 'Unavailable test table' }));
  } else if (table === 'profiles') {
    response.end(JSON.stringify(profileExists ? [{ id: accountId }] : []));
  } else if (table === 'player_wallets') {
    response.end(
      JSON.stringify({
        equipped_cosmetic: equipped,
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
const { equippedCosmetics, verifiedUserId } = await import('../src/rewards.js');
const { create, join, waitFor } =
  useTestServer<TankArenaRoomState>('tank-arena');
after(
  () =>
    new Promise<void>((resolve, reject) =>
      supabase.close((error) => (error ? reject(error) : resolve())),
    ),
);

test('authenticated users need a matching profile before entering reward results', async () => {
  profileExists = false;
  assert.equal(await verifiedUserId('signed-in'), null);
  profileExists = true;
  assert.equal(await verifiedUserId('signed-in'), accountId);
});

test('owned equipped cosmetics sync to other players and ignore join payloads', async () => {
  equipped = 'coral-frame';
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
    { frame: equipped },
  );
  assert.equal(host.state.players.get(guest.sessionId)!.cosmetics, '{}');
  assert.equal(host.state.players.get(anonymous.sessionId)!.cosmetics, '{}');
  assert.equal(reads.length, readCount, 'Guests do not read private wallets');
  assert.ok(reads.every((read) => read.userId === `eq.${accountId}`));
});

test('wallet validation rejects unowned, unknown and unsupported cosmetics', async () => {
  for (const value of [
    'sky-frame',
    'made-up',
    'royal-avatar',
    { frame: 'coral-frame' },
  ]) {
    equipped = value;
    assert.deepEqual(await equippedCosmetics(accountId), {});
  }
});

test('single equipped frame and null map to the room rendering loadout', async () => {
  equipped = 'mint-frame';
  assert.deepEqual(await equippedCosmetics(accountId), { frame: 'mint-frame' });
  equipped = null;
  assert.deepEqual(await equippedCosmetics(accountId), {});
});

test('database and ownership failures allow joining with default cosmetics', async () => {
  equipped = 'coral-frame';
  for (const table of ['player_wallets', 'player_cosmetics']) {
    failedTable = table;
    const client = await create('Unavailable', { authToken: 'signed-in' });
    assert.equal(client.state.players.get(client.sessionId)!.cosmetics, '{}');
  }
  failedTable = '';
});

test('paid avatars cannot be forged when only frames are persisted', async () => {
  equipped = 'coral-frame';
  const host = await create('Frame', { authToken: 'signed-in', avatar: 11 });
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
  assert.equal(guest.state.players.get(host.sessionId)!.avatar, 11);
  assert.deepEqual(
    JSON.parse(guest.state.players.get(host.sessionId)!.cosmetics!),
    { frame: 'coral-frame' },
  );
  assert.equal(host.state.players.get(guest.sessionId)!.avatar, 0);
  assert.equal(host.state.players.get(anonymous.sessionId)!.avatar, 0);
});

test('unowned paid avatars cannot bypass the free avatar validation', async () => {
  equipped = 'astronaut-avatar';
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

test('unequipping a frame applies on the next join and preserves the free avatar', async () => {
  equipped = 'mint-frame';
  const host = await create('Mint', { authToken: 'signed-in', avatar: 10 });
  equipped = null;
  const rejoined = await join(host.roomId, 'Free again', {
    authToken: 'signed-in',
    avatar: 10,
  });
  await waitFor(host, (state) => state.players.size === 2);
  assert.equal(host.state.players.get(rejoined.sessionId)!.avatar, 10);
  assert.equal(host.state.players.get(rejoined.sessionId)!.cosmetics, '{}');
  assert.equal(rejoined.state.players.get(host.sessionId)!.avatar, 10);
  assert.deepEqual(
    JSON.parse(rejoined.state.players.get(host.sessionId)!.cosmetics!),
    { frame: 'mint-frame' },
  );
});
