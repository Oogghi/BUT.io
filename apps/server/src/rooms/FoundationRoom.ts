import { Room } from '@colyseus/core';
import { bombParty } from '@but/bomb-party';
import type { GameMetadata } from '@but/shared';

const game: GameMetadata = bombParty;

/** Connectivity placeholder, not a Bomb Party implementation. */
export class FoundationRoom extends Room {
  maxClients = game.maxPlayers;
}
