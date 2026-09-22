import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { registerHooks } from 'node:module';
import { after, beforeEach, test } from 'node:test';

const userId = '00000000-0000-4000-8000-000000000001';
const otherId = '00000000-0000-4000-8000-000000000002';
const columns: Record<string, readonly string[]> = {
  player_wallets: ['user_id', 'coins', 'equipped_cosmetic', 'updated_at'],
  player_cosmetics: ['user_id', 'cosmetic_id', 'purchased_at'],
  friendships: ['user_id', 'friend_id', 'status', 'created_at', 'updated_at'],
  profiles: ['id', 'username', 'avatar_key', 'created_at', 'updated_at'],
  game_stats: [
    'user_id',
    'game_id',
    'games_played',
    'wins',
    'losses',
    'playtime_seconds',
    'metrics',
    'updated_at',
  ],
  match_history: [
    'id',
    'game_id',
    'winner_id',
    'metadata',
    'started_at',
    'ended_at',
    'created_at',
    'server_match_id',
  ],
  group_members: ['group_id', 'user_id', 'joined_at'],
  group_invites: [
    'id',
    'group_id',
    'inviter_id',
    'invitee_id',
    'status',
    'created_at',
    'updated_at',
  ],
};
type Row = Record<string, unknown>;
let rows: Record<string, Row[]>;
let forcedError: { code: string; message: string } | null = null;
const requests: { method: string; url: URL; body: Row | null }[] = [];

// Real supabase-js requests against a fixture constrained to the live schema.
const server = createServer(async (request, response) => {
  response.setHeader('Content-Type', 'application/json');
  const url = new URL(request.url ?? '/', 'http://localhost');
  let raw = '';
  for await (const chunk of request) raw += chunk;
  const body = raw ? (JSON.parse(raw) as Row) : null;
  requests.push({ method: request.method ?? '', url, body });
  const error = (code: string, message: string) => {
    response.statusCode = 400;
    response.end(JSON.stringify({ code, message }));
  };
  if (forcedError) return error(forcedError.code, forcedError.message);
  const name = url.pathname.split('/').at(-1)!;
  if (url.pathname.includes('/rpc/')) {
    if (!['purchase_cosmetic', 'set_equipped_cosmetic'].includes(name))
      return error('PGRST202', 'Unknown function');
    if (Object.keys(body ?? {}).join(',') !== 'p_cosmetic_id')
      return error('PGRST202', 'Unknown function arguments');
    const id = body?.p_cosmetic_id;
    if (
      id !== null &&
      !['coral-frame', 'mint-frame', 'sky-frame'].includes(String(id))
    )
      return error('P0001', 'cosmetic-not-found');
    response.end(JSON.stringify({ coins: 100, equipped_cosmetic: id }));
    return;
  }
  const allowed = columns[name];
  if (!allowed) return error('42P01', 'Unknown table');
  for (const column of (url.searchParams.get('select') ?? '')
    .split(',')
    .filter(Boolean)) {
    if (!allowed.includes(column))
      return error('42703', `Unknown column: ${column}`);
  }
  if (body && Object.keys(body).some((column) => !allowed.includes(column)))
    return error('42703', 'Unknown write column');
  if (
    name === 'friendships' &&
    body?.status &&
    !['pending', 'accepted', 'blocked'].includes(String(body.status))
  )
    return error('23514', 'Invalid friendship status');
  let data = rows[name] ?? [];
  for (const [key, value] of url.searchParams) {
    if (value.startsWith('eq.'))
      data = data.filter((row) => String(row[key]) === value.slice(3));
  }
  if (name === 'match_history') {
    const filter = url.searchParams.get('metadata');
    if (filter?.startsWith('cs.')) {
      const wanted = JSON.parse(filter.slice(3)).participants[0].playerId;
      data = data.filter((row) =>
        (row.metadata as { participants: Row[] }).participants.some(
          (player) => player.playerId === wanted,
        ),
      );
    }
  }
  if (request.method === 'DELETE') {
    rows[name] = (rows[name] ?? []).filter((row) => !data.includes(row));
    response.statusCode = 204;
    response.end();
  } else {
    const limit = url.searchParams.get('limit');
    response.end(JSON.stringify(limit ? data.slice(0, Number(limit)) : data));
  }
});
await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
const address = server.address();
assert.ok(address && typeof address === 'object');

// Supply Vite's build-time env only while loading the actual data module.
const moduleUrl = new URL('../src/supabaseData.ts', import.meta.url).href;
const hooks = registerHooks({
  load(url, context, nextLoad) {
    const loaded = nextLoad(url, context);
    if (url !== moduleUrl) return loaded;
    return {
      ...loaded,
      source: String(loaded.source).replaceAll(
        'import.meta.env',
        `(${JSON.stringify({
          VITE_SUPABASE_URL: `http://127.0.0.1:${address.port}`,
          VITE_SUPABASE_PUBLISHABLE_KEY: 'test-publishable-key',
        })})`,
      ),
    };
  },
});
const api = await import('../src/supabaseData.ts');
hooks.deregister();
after(
  () =>
    new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    ),
);
beforeEach(() => {
  requests.length = 0;
  forcedError = null;
  rows = {
    player_wallets: [
      { user_id: userId, coins: 180, equipped_cosmetic: 'mint-frame' },
    ],
    player_cosmetics: [{ user_id: userId, cosmetic_id: 'mint-frame' }],
  };
});

test('wallet reads use the singular column and ownership is loaded separately', async () => {
  assert.deepEqual(await api.loadRewardState(userId), {
    coins: 180,
    ownedCosmetics: ['mint-frame'],
    equippedCosmetic: 'mint-frame',
    equippedCosmetics: { frame: 'mint-frame' },
  });
  assert.equal(requests.length, 2);
  assert.ok(
    requests.every(
      ({ url }) => url.searchParams.get('user_id') === `eq.${userId}`,
    ),
  );
  rows.player_cosmetics = [];
  const unowned = await api.loadRewardState(userId);
  assert.equal(unowned.equippedCosmetic, null);
  assert.deepEqual(unowned.equippedCosmetics, {});
  rows.player_wallets = [];
  assert.equal((await api.loadRewardState(userId)).coins, 0);
});

test('frame purchase, equip and reset use the live RPC signatures', async () => {
  assert.equal(
    (await api.purchaseCosmetic('coral-frame')).equippedCosmetic,
    'coral-frame',
  );
  assert.equal(
    (await api.setEquippedCosmetic('mint-frame')).equippedCosmetic,
    'mint-frame',
  );
  assert.equal((await api.setEquippedCosmetic(null)).equippedCosmetic, null);
  assert.deepEqual(
    requests.map(({ url }) => url.pathname.split('/').at(-1)),
    ['purchase_cosmetic', 'set_equipped_cosmetic', 'set_equipped_cosmetic'],
  );
});

test('unsupported purchases and equipment are rejected before any RPC', async () => {
  for (const call of [
    () => api.purchaseCosmetic('royal-avatar'),
    () => api.setEquippedCosmetic('midnight-cards', 'card-back'),
    () => api.setEquippedCosmetic(null, 'avatar'),
    () => api.setEquippedCosmetic('royal-avatar'),
  ])
    await assert.rejects(call, { code: 'cosmetic-not-found' });
  assert.equal(requests.length, 0);
});

test('declining deletes only the incoming pending request', async () => {
  const pending = { user_id: otherId, friend_id: userId, status: 'pending' };
  const accepted = { user_id: userId, friend_id: otherId, status: 'accepted' };
  const blocked = { user_id: 'third', friend_id: userId, status: 'blocked' };
  rows.friendships = [pending, accepted, blocked];
  await api.declineFriendRequest(userId, otherId);
  assert.equal(requests[0]!.method, 'DELETE');
  assert.deepEqual(rows.friendships, [accepted, blocked]);
});

test('schema and permission errors retain their distinct database codes', async () => {
  for (const [code, expected] of [
    ['42703', 'schema-mismatch'],
    ['42501', 'permission-denied'],
  ]) {
    forcedError = { code: code!, message: 'Fixture error' };
    await assert.rejects(() => api.loadRewardState(userId), {
      code: expected,
      databaseCode: code,
    });
  }
  forcedError = { code: 'PGRST202', message: 'Missing RPC' };
  await assert.rejects(() => api.setEquippedCosmetic(null), {
    code: 'schema-mismatch',
    databaseCode: 'PGRST202',
  });
  forcedError = { code: 'P0001', message: 'not-enough-coins' };
  await assert.rejects(() => api.purchaseCosmetic('sky-frame'), {
    code: 'not-enough-coins',
  });
});

test('recent matches are filtered before the limit and use participant outcomes', async () => {
  const match = (
    id: string,
    playerId: string,
    outcome: string,
    gameId = 'blackjack-party',
  ) => ({
    id,
    game_id: gameId,
    winner_id: otherId,
    metadata: { participants: [{ playerId, outcome }] },
    started_at: '2026-09-22T10:00:00Z',
    ended_at: '2026-09-22T10:01:00Z',
    created_at: '2026-09-22T10:01:00Z',
  });
  rows.match_history = [
    ...Array.from({ length: 8 }, (_, i) => match(`other-${i}`, otherId, 'win')),
    match('mine', userId, 'win'),
    match('poker', userId, 'draw', 'poker-party'),
  ];
  rows.game_stats = [
    {
      user_id: userId,
      game_id: 'poker-party',
      games_played: 2,
      wins: 1,
      losses: 0,
      playtime_seconds: 120,
      metrics: {},
    },
  ];
  const stats = await api.loadPlayerStats(userId);
  assert.deepEqual(
    stats.recentMatches.map(({ id, result }) => ({ id, result })),
    [
      { id: 'mine', result: 'win' },
      { id: 'poker', result: 'draw' },
    ],
  );
  assert.equal(stats.global.gamesPlayed, 2);
  assert.equal(stats.games['poker-party'].wins, 1);
  assert.equal(
    api.parseGameId('poker-party'),
    null,
    'Poker must not become a valid group invitation',
  );
});

test('duplicate usernames do not resolve to an arbitrary profile', async () => {
  rows.profiles = [
    { id: userId, username: 'Alex' },
    { id: otherId, username: 'Alex' },
  ];
  assert.equal(await api.loadPlayerStatsByUsername('Alex'), null);
  assert.equal(requests.length, 1);
  rows.profiles = [{ id: userId, username: 'Alex' }];
  assert.ok(await api.loadPlayerStatsByUsername('Alex'));
});

test('a missing unique membership returns no group and does not query group details', async () => {
  assert.deepEqual(await api.loadGroupState(userId), {
    group: null,
    invites: [],
    lobbyInvites: [],
  });
  assert.equal(requests.length, 2);
  const membership = requests.find(({ url }) =>
    url.pathname.endsWith('/group_members'),
  )!;
  assert.equal(membership.url.searchParams.get('user_id'), `eq.${userId}`);
});
