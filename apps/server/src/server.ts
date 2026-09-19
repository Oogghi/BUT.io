import { defineRoom, defineServer } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { FoundationRoom } from './rooms/FoundationRoom.js';
import { BombPartyLobbyRoom } from './rooms/BombPartyLobbyRoom.js';
import { TankArenaRoom } from './rooms/TankArenaRoom.js';

export function createServer() {
  return defineServer({
    transport: new WebSocketTransport(),
    rooms: {
      foundation: defineRoom(FoundationRoom),
      'bomb-party': defineRoom(BombPartyLobbyRoom),
      'tank-arena': defineRoom(TankArenaRoom),
    },
  });
}

export async function startServer(port: number) {
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT must be an integer between 1 and 65535.');
  }
  const server = createServer();
  await server.listen(port, '127.0.0.1');
  return server;
}
