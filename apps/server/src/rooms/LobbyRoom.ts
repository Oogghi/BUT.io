import { randomInt } from 'node:crypto';
import { Room, type Client } from '@colyseus/core';
import { schema, t } from '@colyseus/schema';
import {
  DISPLAY_NAME_MAX_LENGTH,
  isAvatar,
  type GameMetadata,
  type JoinOptions,
  type LobbyErrorCode,
  type LobbyPhase,
} from '@but/shared';

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const START_DELAY_MS = 1000;

// ponytail: this process-local reservation is enough for the single-process server; use a shared allocator when scaling out.
const reservedCodes = new Set<string>();

const LobbyPlayerSchema = schema(
  {
    displayName: t.string(),
    avatar: t.uint8(),
    ready: t.boolean(),
    spectator: t.boolean(),
  },
  'LobbyPlayer',
);

/** Fields every game lobby shares; games extend it with their own `game` state. */
export const LobbyStateSchema = schema(
  {
    code: t.string(),
    gameId: t.string(),
    phase: t.string<LobbyPhase>(),
    hostId: t.string(),
    players: t.map(LobbyPlayerSchema),
    resultReason: t.string(),
  },
  'LobbyState',
);
export type LobbyStateInstance = InstanceType<typeof LobbyStateSchema>;

function reserveCode(): string {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    let code = '';
    for (let index = 0; index < 6; index += 1) {
      code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
    }
    if (!reservedCodes.has(code)) {
      reservedCodes.add(code);
      return code;
    }
  }
  throw new Error('Unable to allocate a unique lobby code.');
}

function validDisplayName(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const displayName = value.trim();
  return (
    displayName.length >= 1 &&
    displayName.length <= DISPLAY_NAME_MAX_LENGTH &&
    !/[\u0000-\u001f\u007f-\u009f]/u.test(displayName)
  );
}

/**
 * Lobby lifecycle shared by every game: invite codes, joining, readiness, spectating,
 * host-only start/return and departures. Subclasses own the match itself.
 */
export abstract class LobbyRoom<State extends LobbyStateInstance> extends Room<{
  state: State;
  metadata: GameMetadata;
}> {
  private startTimer: { clear(): void } | undefined;

  protected abstract readonly game: GameMetadata;
  /** Builds the initial state, starting from `lobbyFields(code)`. */
  protected abstract createState(code: string): State;
  /** Current seat limit (games may make it a setting). */
  protected abstract capacity(): number;
  /** Starts a match with the non-spectating players, in lobby order. */
  protected abstract startMatch(ids: string[]): void;
  /** Clears the finished match before returning to the lobby. */
  protected abstract endMatch(): void;
  /** A player left mid-match. */
  protected abstract leaveMatch(id: string): void;

  public onCreate() {
    const code = reserveCode();
    this.roomId = code;
    this.setState(this.createState(code));
    this.metadata = this.game;
    this.maxClients = this.capacity();

    this.onMessage('ready', (client, ready: unknown) =>
      this.handleReady(client, ready),
    );
    this.onMessage('spectate', (client, spectator: unknown) =>
      this.handleSpectate(client, spectator),
    );
    this.onMessage('start', (client, payload: unknown) =>
      this.handleStart(client, payload),
    );
    this.onMessage('return', (client, payload: unknown) =>
      this.handleReturn(client, payload),
    );
  }

  /** The shared fields of a fresh lobby state. */
  protected lobbyFields(code: string) {
    return {
      code,
      gameId: this.game.id,
      phase: 'lobby' as LobbyPhase,
      hostId: '',
      resultReason: '',
    };
  }

  public onAuth(_client: unknown, options: unknown) {
    if (this.state.phase !== 'lobby')
      throw new Error('lobby-closed' satisfies LobbyErrorCode);
    if (!validDisplayName((options as JoinOptions | undefined)?.displayName))
      throw new Error('invalid-name' satisfies LobbyErrorCode);
    return true;
  }

  // Recheck the phase: a reserved seat may connect after the host starts.
  public onJoin(client: Client, options: JoinOptions) {
    if (this.state.phase !== 'lobby')
      throw new Error('lobby-closed' satisfies LobbyErrorCode);
    const displayName = options.displayName.trim();
    // The avatar is cosmetic: fall back to the first look instead of rejecting the join.
    const avatar = isAvatar(options.avatar) ? options.avatar : 0;
    if (this.state.players.size >= this.capacity())
      throw new Error('lobby-full' satisfies LobbyErrorCode);
    if (!this.state.hostId) this.state.hostId = client.sessionId;
    this.state.players.set(
      client.sessionId,
      new LobbyPlayerSchema({
        displayName,
        avatar,
        ready: false,
        spectator: false,
      }),
    );
    this.resetReady();
  }

  public onDrop(client: Client) {
    this.removePlayer(client.sessionId);
  }

  public onLeave(client: Client) {
    this.removePlayer(client.sessionId);
  }

  public onDispose() {
    this.startTimer?.clear();
    this.startTimer = undefined;
    reservedCodes.delete(this.state?.code ?? this.roomId);
  }

  protected sendError(client: Client, code: LobbyErrorCode) {
    client.send('action-error', code);
  }

  /** Lobby members who will play the next round (everyone but spectators). */
  protected participants() {
    return [...this.state.players].filter(([, player]) => !player.spectator);
  }

  /** Shows the results screen; the host then returns everyone to the lobby. */
  protected showResults(reason: string) {
    this.state.phase = 'results';
    this.state.resultReason = reason;
  }

  protected resetReady() {
    for (const player of this.state.players.values()) player.ready = false;
  }

  private handleReady(client: Client, value: unknown) {
    if (typeof value !== 'boolean') {
      this.sendError(client, 'invalid-payload');
      return;
    }
    if (this.state.phase !== 'lobby') {
      this.sendError(client, 'wrong-phase');
      return;
    }
    const player = this.state.players.get(client.sessionId);
    if (!player) {
      this.sendError(client, 'not-in-lobby');
      return;
    }
    // Spectators sit the round out, so there is nothing for them to be ready for.
    player.ready = value && !player.spectator;
  }

  private handleSpectate(client: Client, value: unknown) {
    if (typeof value !== 'boolean')
      return this.sendError(client, 'invalid-payload');
    if (this.state.phase !== 'lobby')
      return this.sendError(client, 'wrong-phase');
    const player = this.state.players.get(client.sessionId);
    if (!player) return this.sendError(client, 'not-in-lobby');
    if (player.spectator === value) return;
    player.spectator = value;
    // The line-up changed, so everyone confirms again (as when someone joins).
    this.resetReady();
  }

  private handleStart(client: Client, payload: unknown) {
    if (payload !== undefined) {
      this.sendError(client, 'invalid-payload');
      return;
    }
    if (this.state.phase !== 'lobby') {
      this.sendError(client, 'wrong-phase');
      return;
    }
    if (client.sessionId !== this.state.hostId) {
      this.sendError(client, 'host-only');
      return;
    }
    const participants = this.participants();
    if (participants.length < this.game.minPlayers) {
      this.sendError(client, 'not-enough-players');
      return;
    }
    if (!participants.every(([, player]) => player.ready)) {
      this.sendError(client, 'players-not-ready');
      return;
    }

    this.state.phase = 'starting';
    void this.lock();
    this.startTimer = this.clock.setTimeout(() => {
      this.startTimer = undefined;
      if (this.state.phase === 'starting') {
        this.state.phase = 'playing';
        // Spectators get no seat; they watch the synced state.
        this.startMatch(this.participants().map(([id]) => id));
      }
    }, START_DELAY_MS);
  }

  private handleReturn(client: Client, payload: unknown) {
    if (payload !== undefined) {
      this.sendError(client, 'invalid-payload');
      return;
    }
    if (this.state.phase !== 'results') {
      this.sendError(client, 'wrong-phase');
      return;
    }
    if (client.sessionId !== this.state.hostId) {
      this.sendError(client, 'host-only');
      return;
    }
    this.state.phase = 'lobby';
    this.state.resultReason = '';
    this.endMatch();
    this.resetReady();
    void this.unlock();
  }

  private removePlayer(sessionId: string) {
    if (!this.state?.players.delete(sessionId)) return;

    if (this.state.phase === 'starting') {
      this.startTimer?.clear();
      this.startTimer = undefined;
      this.state.phase = 'lobby';
      this.state.resultReason = '';
      void this.unlock();
    } else if (this.state.phase === 'playing') {
      this.leaveMatch(sessionId);
    }

    this.resetReady();

    if (this.state.hostId === sessionId) {
      this.state.hostId = this.state.players.keys().next().value ?? '';
    }
  }
}
