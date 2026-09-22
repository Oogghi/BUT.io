import assert from 'node:assert/strict';
import { after, before } from 'node:test';
import { Client, type Room } from '@colyseus/sdk';
import type { JoinOptions, LobbyState } from '@but/shared';
import { createServer } from '../src/server.js';

/**
 * Starts a real server for the test file and returns real-client helpers for one room type.
 * Every room it opens is left and the server shut down after the file's tests.
 */
export function useTestServer<State extends LobbyState>(roomName: string) {
  type LobbyRoom = Room<unknown, State>;
  let endpoint = '';
  let server: ReturnType<typeof createServer>;
  const openRooms: LobbyRoom[] = [];

  before(async () => {
    server = createServer();
    await server.listen(0, '127.0.0.1');
    const address = server.transport.server?.address();
    assert.equal(typeof address, 'object');
    assert.ok(address);
    endpoint = `http://127.0.0.1:${(address as { port: number }).port}`;
  });

  after(async () => {
    await Promise.all(
      openRooms
        .splice(0)
        .filter((room) => room.connection.isOpen)
        .map((room) => room.leave().catch(() => 0)),
    );
    await server.gracefullyShutdown(false);
  });

  async function opened(room: LobbyRoom) {
    room.reconnection.enabled = false;
    openRooms.push(room);
    await waitFor(room, (state) => Boolean(state.players?.get(room.sessionId)));
    return room;
  }

  async function create(
    name: string,
    extra: Partial<JoinOptions> = {},
  ): Promise<LobbyRoom> {
    return opened(
      await new Client(endpoint).create<State>(roomName, {
        displayName: name,
        ...extra,
      }),
    );
  }

  async function join(
    roomId: string,
    name: string,
    extra: Partial<JoinOptions> = {},
  ): Promise<LobbyRoom> {
    return opened(
      await new Client(endpoint).joinById<State>(roomId, {
        displayName: name,
        ...extra,
      }),
    );
  }

  async function waitFor(
    room: LobbyRoom,
    predicate: (state: State) => boolean,
    timeout = 3000,
  ) {
    if (room.state && predicate(room.state)) return;
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        room.onStateChange.remove(onState);
        reject(
          new Error(
            `Timed out waiting for state: ${JSON.stringify(room.state)}`,
          ),
        );
      }, timeout);
      const onState = (state: State) => {
        if (!predicate(state)) return;
        clearTimeout(timer);
        room.onStateChange.remove(onState);
        resolve();
      };
      room.onStateChange(onState);
    });
  }

  function nextError(room: LobbyRoom, channel = 'action-error') {
    return new Promise<string>((resolve, reject) => {
      let off = () => {};
      const timer = setTimeout(() => {
        off();
        reject(new Error(`Timed out waiting for ${channel}.`));
      }, 3000);
      off = room.onMessage(channel, (message) => {
        clearTimeout(timer);
        off();
        resolve(message);
      });
    });
  }

  // The server's HTTP origin, for testing plain routes such as `/tables`.
  const url = () => endpoint;
  return { create, join, waitFor, nextError, url };
}
