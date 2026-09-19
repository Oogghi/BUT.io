import type { Client } from '@colyseus/core';
import {
  bombParty,
  defaultSettings,
  type BombPartySettings,
} from '@but/bomb-party';
import {
  BombPartyGame,
  frenchDictionary,
  parseSettings,
} from '@but/bomb-party/server';
import {
  GamePlayerSchema,
  GameStateSchema,
  SettingsSchema,
  emptyGameState,
} from './bombPartySchema.js';
import { LobbyRoom, LobbyStateSchema } from './LobbyRoom.js';

const BombPartyStateSchema = LobbyStateSchema.extend(
  { settings: SettingsSchema, game: GameStateSchema },
  'BombPartyLobbyState',
);

export class BombPartyLobbyRoom extends LobbyRoom<
  InstanceType<typeof BombPartyStateSchema>
> {
  protected readonly game = bombParty;
  private bombTimer: { clear(): void } | undefined;
  private match: BombPartyGame | undefined;
  private dictionary = frenchDictionary();

  protected createState(code: string) {
    return new BombPartyStateSchema({
      ...this.lobbyFields(code),
      settings: new SettingsSchema(defaultSettings),
      game: emptyGameState(),
    });
  }

  protected capacity() {
    return this.state?.settings.maxPlayers ?? defaultSettings.maxPlayers;
  }

  public onCreate() {
    super.onCreate();
    this.onMessage('word', (client, payload: unknown) =>
      this.handleWord(client, payload),
    );
    this.onMessage('settings', (client, payload: unknown) =>
      this.handleSettings(client, payload),
    );
  }

  public onDispose() {
    super.onDispose();
    this.bombTimer?.clear();
    this.bombTimer = undefined;
  }

  protected startMatch(ids: string[]) {
    this.match = new BombPartyGame(
      ids,
      this.state.settings.toJSON() as BombPartySettings,
      this.dictionary,
      performance.now(),
    );
    this.syncGame();
  }

  protected endMatch() {
    this.match = undefined;
    this.bombTimer?.clear();
    this.bombTimer = undefined;
    this.state.game = emptyGameState();
  }

  protected leaveMatch(id: string) {
    this.match?.leave(id, performance.now());
    this.syncGame();
  }

  private handleWord(client: Client, payload: unknown) {
    if (
      !payload ||
      typeof payload !== 'object' ||
      Array.isArray(payload) ||
      typeof (payload as { word?: unknown }).word !== 'string' ||
      !Number.isInteger((payload as { turnId?: unknown }).turnId)
    ) {
      this.sendError(client, 'invalid-payload');
      return;
    }
    if (this.state.phase !== 'playing') {
      this.sendError(client, 'wrong-phase');
      return;
    }
    const { word, turnId } = payload as { word: string; turnId: number };
    const error = this.match!.submit(
      client.sessionId,
      word,
      turnId,
      performance.now(),
    );
    this.syncGame();
    if (error) client.send('word-error', error);
  }

  private handleSettings(client: Client, payload: unknown) {
    if (this.state.phase !== 'lobby')
      return this.sendError(client, 'wrong-phase');
    if (client.sessionId !== this.state.hostId)
      return this.sendError(client, 'host-only');
    const settings = parseSettings(payload, this.state.players.size);
    if (!settings) return this.sendError(client, 'invalid-payload');
    Object.assign(this.state.settings, settings);
    this.maxClients = settings.maxPlayers;
    this.resetReady();
  }

  private syncGame() {
    const game = this.match;
    if (!game) return;
    const state = this.state.game;
    for (const [id, player] of game.players) {
      let synced = state.players.get(id);
      if (!synced) {
        synced = new GamePlayerSchema();
        state.players.set(id, synced);
      }
      Object.assign(synced, player);
    }
    Object.assign(state, {
      activePlayerId: game.activePlayerId,
      prompt: game.prompt,
      promptAge: game.promptAge,
      turnId: game.turnId,
      turnStartedAt: game.turnStartedAt,
      deadline: game.deadline,
      serverNow: performance.now(),
      winnerId: game.winnerId,
      lastWord: game.lastWord,
      lastPlayerId: game.lastPlayerId,
      lastEvent: game.lastEvent,
      usedWordCount: game.usedWords.size,
    });
    this.bombTimer?.clear();
    this.bombTimer = undefined;
    if (game.ended) {
      this.showResults(game.resultReason);
    } else {
      this.bombTimer = this.clock.setTimeout(
        () => {
          game.expire(performance.now());
          this.syncGame();
        },
        Math.max(1, game.deadline - performance.now()),
      );
    }
  }
}
