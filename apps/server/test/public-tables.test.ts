import assert from 'node:assert/strict';
import test from 'node:test';
import type { PublicTable } from '@but/shared';
import type { BombPartyRoomState } from '@but/bomb-party';
import { useTestServer } from './lobbyClient.js';

const { create, join, waitFor, nextError, url } =
  useTestServer<BombPartyRoomState>('bomb-party');

async function tables(): Promise<PublicTable[]> {
  const response = await fetch(`${url()}/tables`);
  assert.equal(response.status, 200);
  return (await response.json()) as PublicTable[];
}

test('only the host can list a table publicly, and it leaves the list when closed', async () => {
  const host = await create('Host');
  const guest = await join(host.roomId, 'Guest');
  assert.deepEqual(await tables(), []);

  const refused = nextError(guest, 'action-error');
  guest.send('visibility', true);
  assert.equal(await refused, 'host-only');

  host.send('visibility', true);
  await waitFor(host, (state) => state.isPublic);
  assert.deepEqual(await tables(), [
    {
      code: host.roomId,
      gameId: 'bomb-party',
      hostName: 'Host',
      players: 2,
      capacity: host.state.settings.maxPlayers,
      phase: 'lobby',
    },
  ]);

  host.send('visibility', false);
  await waitFor(host, (state) => !state.isPublic);
  assert.deepEqual(await tables(), []);

  host.send('visibility', true);
  await waitFor(host, (state) => state.isPublic);
  await guest.leave();
  await host.leave();
  for (let attempt = 0; attempt < 20 && (await tables()).length; attempt += 1)
    await new Promise((resolve) => setTimeout(resolve, 50));
  assert.deepEqual(await tables(), []);
});
