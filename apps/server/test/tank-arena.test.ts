import assert from 'node:assert/strict';
import test from 'node:test';
import type { Replay, TankArenaRoomState } from '@but/tank-arena';
import { useTestServer } from './lobbyClient.js';

const { create, join, waitFor, nextError } =
  useTestServer<TankArenaRoomState>('tank-arena');

test(
  'real clients pick tanks, plan in secret, share one replay, and return to the lobby',
  { concurrency: false },
  async () => {
    const host = await create('Host');
    const guest = await join(host.roomId, 'Guest');
    assert.equal(host.state.gameId, 'tank-arena');
    // A fresh lobby spreads the roster.
    await waitFor(host, (state) => state.loadouts.size === 2);
    assert.notEqual(
      host.state.loadouts.get(host.sessionId),
      host.state.loadouts.get(guest.sessionId),
    );

    guest.send('map-vote', 'ice');
    await waitFor(
      host,
      (state) => state.mapVotes.get(guest.sessionId) === 'ice',
    );
    guest.send('map-vote', 'moon');
    assert.equal(await nextError(guest), 'invalid-payload');

    guest.send('tank', 'neon');
    await waitFor(
      host,
      (state) => state.loadouts.get(guest.sessionId) === 'neon',
    );
    guest.send('tank', 'bogus');
    assert.equal(await nextError(guest), 'invalid-payload');

    host.send('ready', true);
    guest.send('ready', true);
    await waitFor(host, (state) =>
      [...state.players.values()].every((player) => player.ready),
    );
    host.send('start');
    for (const room of [host, guest])
      await waitFor(room, (state) => state.game.stage === 'planning');
    assert.equal(host.state.game.map, 'ice');
    assert.equal(host.state.game.players.get(guest.sessionId)?.tank, 'neon');

    // A tank may only use its own actions.
    guest.send('plan', { action: 'shockwave', angle: 0, power: 1, turn: 1 });
    assert.equal(await nextError(guest, 'plan-error'), 'invalid-action');

    guest.send('plan', { action: 'missile', angle: -150, power: 0.9, turn: 1 });
    await waitFor(
      host,
      (state) => state.game.players.get(guest.sessionId)?.confirmed === true,
    );
    // Opponents see that the guest confirmed, never what they chose.
    assert.equal(host.state.game.stage, 'planning');
    assert.equal(host.state.game.replay, '');

    host.send('plan', { action: 'jump', angle: -70, power: 0.8, turn: 1 });
    for (const room of [host, guest])
      await waitFor(room, (state) => state.game.stage === 'resolving');
    assert.ok(host.state.game.replay);
    assert.equal(host.state.game.replay, guest.state.game.replay);
    const replay = JSON.parse(host.state.game.replay) as Replay;
    assert.equal(replay.turn, 1);
    assert.deepEqual(
      replay.events
        .filter((event) => event.type === 'fire')
        .map((event) => event.id)
        .sort(),
      [host.sessionId, guest.sessionId].sort(),
    );
    const final = replay.tracks.find(
      (track) => track.kind === 'tank' && track.id === host.sessionId,
    )!;
    const hostTank = host.state.game.players.get(host.sessionId)!;
    assert.deepEqual(final.pts.slice(-2), [
      Math.round(hostTank.x),
      Math.round(hostTank.y),
    ]);
    assert.equal(guest.state.game.players.get(host.sessionId)?.x, hostTank.x);

    // Late plans are rejected while the turn resolves.
    guest.send('plan', { action: 'jump', angle: -60, power: 1, turn: 1 });
    assert.equal(await nextError(guest, 'plan-error'), 'not-playing');

    // The replay finishes, then the next planning phase starts for everyone.
    for (const room of [host, guest])
      await waitFor(
        room,
        (state) => state.game.stage === 'planning' && state.game.turn === 2,
        10000,
      );

    await guest.leave();
    await waitFor(host, (state) => state.phase === 'results');
    assert.equal(host.state.game.winnerId, host.sessionId);
    assert.equal(host.state.resultReason, 'departure');

    host.send('return');
    await waitFor(host, (state) => state.phase === 'lobby');
    assert.equal(host.state.game.stage, '');
    assert.equal(host.state.game.players.size, 0);
  },
);

test(
  'tank lobbies support flexible team counts and carry assignments into the match',
  { concurrency: false },
  async () => {
    const host = await create('Host');
    const guests = await Promise.all(
      ['A', 'B', 'C', 'D'].map((name) => join(host.roomId, name)),
    );
    const clients = [host, ...guests];
    await waitFor(host, (state) => state.teams.size === 5);

    host.send('team-mode', 'teams');
    await waitFor(host, (state) => state.teamMode === 'teams');
    host.send('team-count', 3);
    await waitFor(host, (state) => state.teamCount === 3);

    assert.deepEqual([...host.state.teams.values()].sort(), [
      'team-1',
      'team-1',
      'team-2',
      'team-2',
      'team-3',
    ]);
    clients.forEach((client) => client.send('ready', true));
    await waitFor(host, (state) =>
      [...state.players.values()].every((player) => player.ready),
    );
    host.send('start');
    await waitFor(host, (state) => state.game.stage === 'planning');

    assert.deepEqual(
      [...host.state.game.players.values()].map((player) => player.team).sort(),
      ['team-1', 'team-1', 'team-2', 'team-2', 'team-3'],
    );
  },
);
