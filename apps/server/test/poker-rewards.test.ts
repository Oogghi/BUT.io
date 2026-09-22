import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { after, test } from 'node:test';
import { defaultPokerSettings, type PokerRoomState } from '@but/poker-party';
import type { PokerMatchResult } from '@but/shared';

const hostId = '00000000-0000-4000-8000-000000000001';
const guestId = '00000000-0000-4000-8000-000000000002';
type RecordedPlayer = PokerMatchResult['players'][number] & {
  rewardCoins: number;
};
const recorded: {
  p_game_id: string;
  p_match_id: string;
  p_players: RecordedPlayer[];
}[] = [];
// Exercise real auth/RPC HTTP requests, without using a live account or wallet.
const supabase = createServer(async (request, response) => {
  response.setHeader('Content-Type', 'application/json');
  const url = new URL(request.url ?? '/', 'http://localhost');
  if (url.pathname === '/rest/v1/profiles') {
    const id = url.searchParams.get('id')?.replace(/^eq\./, '');
    response.end(
      JSON.stringify([hostId, guestId].includes(id ?? '') ? [{ id }] : []),
    );
    return;
  }
  if (request.url === '/auth/v1/user') {
    const token = request.headers.authorization?.replace('Bearer ', '');
    response.end(
      JSON.stringify({
        id: token === 'test-host' ? hostId : guestId,
        is_anonymous: token === 'test-anonymous',
      }),
    );
    return;
  }
  if (request.url === '/rest/v1/rpc/record_match_result') {
    let body = '';
    for await (const chunk of request) body += chunk;
    const payload = JSON.parse(body) as (typeof recorded)[number];
    recorded.push(payload);
    response.end(
      JSON.stringify({
        rewards: payload.p_players.map((player) => ({
          user_id: player.playerId,
          coins_awarded: player.rewardCoins,
        })),
      }),
    );
    return;
  }
  response.statusCode = 404;
  response.end('{}');
});
await new Promise<void>((resolve) => supabase.listen(0, '127.0.0.1', resolve));
const address = supabase.address();
assert.ok(address && typeof address === 'object');
// Deliberately use only the VITE URL, matching the reported Render environment.
delete process.env.SUPABASE_URL;
process.env.VITE_SUPABASE_URL = `http://127.0.0.1:${address.port}`;
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-server-key';
const { useTestServer } = await import('./lobbyClient.js');
const { create, join, waitFor } = useTestServer<PokerRoomState>('poker-party');
after(
  () =>
    new Promise<void>((resolve, reject) =>
      supabase.close((error) => (error ? reject(error) : resolve())),
    ),
);

for (const mode of ['ultimate', 'holdem'] as const) {
  test(`${mode}: a completed Poker match sends signed-in rewards and excludes anonymous players`, async () => {
    const start = recorded.length;
    const host = await create('Host', { authToken: 'test-host' });
    const guest = await join(host.roomId, 'Guest', { authToken: 'test-guest' });
    const anonymous = await join(host.roomId, 'Anonymous', {
      authToken: 'test-anonymous',
    });
    const clients = [host, guest, anonymous];
    const notices: { sessionId: string; amount: number }[] = [];
    const received = [host, guest].map(
      (client) =>
        new Promise<void>((resolve) => {
          client.onMessage<{ amount: number }>('coins-earned', (payload) => {
            notices.push({
              sessionId: client.sessionId,
              amount: payload.amount,
            });
            resolve();
          });
        }),
    );
    anonymous.onMessage('coins-earned', () =>
      assert.fail('Anonymous player received coins'),
    );
    host.send('settings', {
      ...defaultPokerSettings,
      mode,
      rounds: 1,
      bettingSeconds: 5,
      showAllCards: true,
    });
    await waitFor(
      host,
      (s) => s.settings.mode === mode && s.settings.rounds === 1,
    );
    for (const client of clients) client.send('ready', true);
    await waitFor(host, (s) => [...s.players.values()].every((p) => p.ready));
    host.send('start');
    await waitFor(host, (s) => s.phase === 'playing', 2500);
    assert.equal(
      recorded.length,
      start,
      'No rewards before the match finishes',
    );
    if (mode === 'ultimate') {
      for (const client of clients) client.send('bet', { ante: 25 });
      await waitFor(host, (s) => s.game.stage === 'ultimate-preflop');
      for (const client of clients) client.send('action', 'raise4');
    } else {
      for (
        let turn = 0;
        turn < 3 && host.state.game.stage !== 'showdown';
        turn++
      ) {
        const active = host.state.game.activePlayerId;
        clients.find((c) => c.sessionId === active)!.send('action', 'fold');
        await waitFor(
          host,
          (s) =>
            s.game.activePlayerId !== active || s.game.stage === 'showdown',
        );
      }
    }
    await waitFor(host, (s) => s.phase === 'results', 15000);
    await Promise.all(received);
    assert.equal(recorded.length, start + 1);
    const result = recorded[start]!;
    assert.equal(result.p_game_id, 'poker-party');
    assert.ok(result.p_match_id);
    assert.deepEqual(result.p_players.map((p) => p.playerId).sort(), [
      hostId,
      guestId,
    ]);
    for (const [client, id] of [
      [host, hostId],
      [guest, guestId],
    ] as const) {
      const won = client.sessionId === host.state.game.winnerId;
      const player = result.p_players.find((p) => p.playerId === id)!;
      assert.equal(player.outcome, won ? 'win' : 'loss');
      assert.equal(player.rewardCoins, won ? 30 : 5);
      assert.equal(
        notices.find((n) => n.sessionId === client.sessionId)?.amount,
        player.rewardCoins,
      );
    }
    host.send('return');
    await waitFor(host, (s) => s.phase === 'lobby');
    assert.equal(
      recorded.length,
      start + 1,
      'Returning does not record the match twice',
    );
    assert.equal(notices.length, 2);
  });
}
