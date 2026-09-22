import { randomInt, randomUUID } from 'node:crypto';
import { Room, type Client } from '@colyseus/core';
import { schema, t } from '@colyseus/schema';
import {
  DISPLAY_NAME_MAX_LENGTH,
  parseCosmeticLoadout,
  resolvePlayerAvatar,
  type GameMetadata,
  type AnyMatchResult,
  type JoinOptions,
  type LobbyErrorCode,
  type LobbyPhase,
} from '@but/shared';
import {
  equippedCosmetics,
  recordAuthoritativeMatch,
  verifiedUserId,
} from '../rewards.js';

/** Close code sent to a player the host removed. */
const KICKED_CODE = 4002;

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const START_DELAY_MS = 1000;

// ponytail: this process-local reservation is enough for the single-process server; use a shared allocator when scaling out.
const reservedCodes = new Set<string>();

const LobbyPlayerSchema = schema(
  {
    displayName: t.string(),
    avatar: t.uint8(),
    cosmetics: t.string(),
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
  private readonly accountIds = new Map<string, string>();
  private readonly cosmetics = new Map<string, string>();
  private activeMatchId = '';
  private matchStartedAt = 0;
  private matchRecorded = false;

  protected abstract readonly game: GameMetadata;
  /** Builds the initial state, starting from `lobbyFields(code)`. */
  protected abstract createState(code: string): State;
  /** Current seat limit (games may make it a setting). */
  protected abstract capacity(): number;
  /** Minimum participants may depend on lobby settings (for example Poker modes). */
  protected minimumPlayers(): number {
    return this.game.minPlayers;
  }
  /** Starts a match with the non-spectating players, in lobby order. */
  protected abstract startMatch(ids: string[]): void;
  /** Clears the finished match before returning to the lobby. */
  protected abstract endMatch(): void;
  /** A player left mid-match. */
  protected abstract leaveMatch(id: string): void;
  /** Builds the server-authoritative result while the finished match is still available. */
  protected abstract buildMatchResult(
    matchId: string,
    playedAt: string,
    endedAt: string,
  ): AnyMatchResult | null;
  /** Optional game-specific lobby validation before the shared start sequence. */
  protected validateStart(): LobbyErrorCode | null {
    return null;
  }

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
    this.onMessage('kick', (client, target: unknown) =>
      this.handleKick(client, target),
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

  public async onAuth(client: Client, options: unknown) {
    if (this.state.phase !== 'lobby')
      throw new Error('lobby-closed' satisfies LobbyErrorCode);
    if (!validDisplayName((options as JoinOptions | undefined)?.displayName))
      throw new Error('invalid-name' satisfies LobbyErrorCode);
    const accountId = await verifiedUserId(
      (options as JoinOptions | undefined)?.authToken,
    );
    if (accountId) {
      const loadout = await equippedCosmetics(accountId);
      this.accountIds.set(client.sessionId, accountId);
      this.cosmetics.set(client.sessionId, JSON.stringify(loadout));
    }
    return true;
  }

  // Recheck the phase: a reserved seat may connect after the host starts.
  public onJoin(client: Client, options: JoinOptions) {
    if (this.state.phase !== 'lobby') {
      this.accountIds.delete(client.sessionId);
      this.cosmetics.delete(client.sessionId);
      throw new Error('lobby-closed' satisfies LobbyErrorCode);
    }
    const displayName = options.displayName.trim();
    // Paid avatars come only from the ownership-checked account loadout.
    const avatar = resolvePlayerAvatar(
      options.avatar,
      parseCosmeticLoadout(this.cosmetics.get(client.sessionId)),
    );
    if (this.state.players.size >= this.capacity()) {
      this.accountIds.delete(client.sessionId);
      this.cosmetics.delete(client.sessionId);
      throw new Error('lobby-full' satisfies LobbyErrorCode);
    }
    if (!this.state.hostId) this.state.hostId = client.sessionId;
    this.state.players.set(
      client.sessionId,
      new LobbyPlayerSchema({
        displayName,
        avatar,
        cosmetics: this.cosmetics.get(client.sessionId) ?? '{}',
        ready: false,
        spectator: false,
      }),
    );
    this.resetReady();
  }

  public onDrop(client: Client) {
    this.removePlayer(client.sessionId);
    this.accountIds.delete(client.sessionId);
    this.cosmetics.delete(client.sessionId);
  }

  public onLeave(client: Client) {
    this.removePlayer(client.sessionId);
    this.accountIds.delete(client.sessionId);
    this.cosmetics.delete(client.sessionId);
  }

  public onDispose() {
    this.startTimer?.clear();
    this.startTimer = undefined;
    this.accountIds.clear();
    this.cosmetics.clear();
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
    void this.persistMatchResult();
  }

  /** Maps a Colyseus seat to a verified Supabase account, or null for guests. */
  protected accountId(sessionId: string): string | null {
    return this.accountIds.get(sessionId) ?? null;
  }

  /** Stable server match id for idempotent match-scoped operations such as rebuys. */
  protected matchId() {
    return this.activeMatchId;
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
    if (participants.length < this.minimumPlayers()) {
      this.sendError(client, 'not-enough-players');
      return;
    }
    if (!participants.every(([, player]) => player.ready)) {
      this.sendError(client, 'players-not-ready');
      return;
    }
    const setupError = this.validateStart();
    if (setupError) {
      this.sendError(client, setupError);
      return;
    }

    this.state.phase = 'starting';
    void this.lock();
    this.startTimer = this.clock.setTimeout(() => {
      this.startTimer = undefined;
      if (this.state.phase === 'starting') {
        this.state.phase = 'playing';
        this.activeMatchId = randomUUID();
        this.matchStartedAt = Date.now();
        this.matchRecorded = false;
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
    this.activeMatchId = '';
    this.matchStartedAt = 0;
    this.matchRecorded = false;
    this.resetReady();
    void this.unlock();
  }

  /**
   * The host removes another player, in any phase. They are told why before the
   * connection closes, and leave the match the same way a departure would.
   */
  private handleKick(client: Client, target: unknown) {
    if (client.sessionId !== this.state.hostId)
      return this.sendError(client, 'host-only');
    if (
      typeof target !== 'string' ||
      target === client.sessionId ||
      !this.state.players.has(target)
    )
      return this.sendError(client, 'invalid-payload');
    const kicked = this.clients.find((entry) => entry.sessionId === target);
    this.removePlayer(target);
    this.accountIds.delete(target);
    this.cosmetics.delete(target);
    kicked?.send('kicked');
    kicked?.leave(KICKED_CODE);
  }

  private async persistMatchResult() {
    if (this.matchRecorded || !this.activeMatchId || !this.matchStartedAt)
      return;
    this.matchRecorded = true;
    const playedAt = new Date(this.matchStartedAt).toISOString();
    const endedAt = new Date().toISOString();
    const result = this.buildMatchResult(this.activeMatchId, playedAt, endedAt);
    if (!result) return;
    const rewards = await recordAuthoritativeMatch(result);
    for (const client of this.clients) {
      const reward = rewards.get(this.accountId(client.sessionId) ?? '');
      if (reward?.total) {
        client.send('coins-earned', {
          amount: reward.total,
          breakdown: reward.breakdown,
        });
      }
    }
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
