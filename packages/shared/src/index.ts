/** Engine-independent metadata, safe to import in browsers and on the server. */
export interface GameMetadata {
  readonly id: string;
  readonly name: string;
  readonly minPlayers: number;
  readonly maxPlayers: number;
}

export type LobbyPhase = 'lobby' | 'starting' | 'playing' | 'results';

export interface LobbyPlayer {
  displayName: string;
  avatar: number;
  ready: boolean;
  /** Watches the next rounds instead of playing; never needs to be ready. */
  spectator: boolean;
}

/** What a client sends when creating or joining a lobby. */
export interface JoinOptions {
  displayName: string;
  avatar?: number;
}

/** Number of avatar looks. Clients draw them; the server only stores the index. */
export const AVATAR_COUNT = 6;

export function isAvatar(value: unknown): value is number {
  return (
    Number.isInteger(value) &&
    (value as number) >= 0 &&
    (value as number) < AVATAR_COUNT
  );
}

export interface LobbyState {
  code: string;
  /** `GameMetadata.id` of the game this lobby plays. */
  gameId: string;
  phase: LobbyPhase;
  hostId: string;
  players: ReadonlyMap<string, LobbyPlayer>;
  resultReason: string;
}

/**
 * Why the lobby rejected a join (thrown as the error message) or an action
 * (sent as the `action-error` payload). Clients localize these codes.
 */
export type LobbyErrorCode =
  | 'invalid-name'
  | 'lobby-closed'
  | 'lobby-full'
  | 'not-in-lobby'
  | 'invalid-payload'
  | 'wrong-phase'
  | 'host-only'
  | 'not-enough-players'
  | 'players-not-ready';

export const DISPLAY_NAME_MAX_LENGTH = 24;
export const LOBBY_CODE_PATTERN = /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/;

export * from './stats.ts';
