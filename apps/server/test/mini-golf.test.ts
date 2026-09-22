import assert from 'node:assert/strict';
import test from 'node:test';
import {
  defaultMiniGolfSettings,
  type MiniGolfPlayer,
  type MiniGolfRoomState,
  type ShotRecord,
} from '@but/mini-golf';
import { useTestServer } from './lobbyClient.js';

const { create, join, waitFor, nextError } =
  useTestServer<MiniGolfRoomState>('mini-golf');

const player = (state: MiniGolfRoomState, id: string) =>
  JSON.parse(state.game.players.get(id)!) as MiniGolfPlayer;

test('real clients take turns, shots replay from a shared record, strangers are refused', async () => {
  const host = await create('Host');
  const guest = await join(host.roomId, 'Guest');
  host.send('settings', { ...defaultMiniGolfSettings, holes: 3 });
  await waitFor(host, (state) => state.settings.holes === 3);
  host.send('ready', true);
  guest.send('ready', true);
  await waitFor(host, (state) =>
    [...state.players.values()].every((entry) => entry.ready),
  );
  host.send('start');
  await waitFor(host, (state) => state.phase === 'playing');
  assert.equal(host.state.game.holeCount, 3);
  assert.equal(host.state.game.activePlayerId, host.sessionId);

  const refused = nextError(guest, 'mini-golf-error');
  guest.send('shot', { dx: 0, dy: -0.5 });
  assert.equal(await refused, 'not-your-turn');

  host.send('shot', { dx: 0.1234567, dy: -0.4 });
  await waitFor(guest, (state) => state.game.shotSeq === 1);
  const shot = JSON.parse(guest.state.game.shot) as ShotRecord;
  assert.equal(shot.playerId, host.sessionId);
  assert.equal(shot.dx, 0.123);
  assert.equal(player(guest.state, host.sessionId).strokes, 1);
  assert.equal(player(guest.state, host.sessionId).onCourse, true);

  // Once the roll plays out, it's the guest's turn.
  await waitFor(
    guest,
    (state) => state.game.activePlayerId === guest.sessionId,
    15000,
  );
  assert.equal(guest.state.game.stage, 'aiming');
});

test('a player who leaves mid-course hands the win to the one who stays', async () => {
  const host = await create('Host');
  const guest = await join(host.roomId, 'Guest');
  host.send('ready', true);
  guest.send('ready', true);
  await waitFor(host, (state) =>
    [...state.players.values()].every((entry) => entry.ready),
  );
  host.send('start');
  await waitFor(host, (state) => state.phase === 'playing');
  await guest.leave();
  await waitFor(host, (state) => state.phase === 'results');
  assert.equal(host.state.resultReason, 'departure');
  assert.equal(host.state.game.winnerId, host.sessionId);
});
