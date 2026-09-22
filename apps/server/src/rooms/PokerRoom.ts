import type { Client } from '@colyseus/core';
import type { PokerMatchResult } from '@but/shared';
import { schema, t } from '@colyseus/schema';
import {
  defaultPokerSettings,
  pokerParty,
  type PokerAction,
  type PokerRoomState,
  type PokerSettings,
} from '@but/poker-party';
import { parsePokerSettings, PokerGame } from '@but/poker-party/server';
import { LobbyRoom, LobbyStateSchema } from './LobbyRoom.js';

const SettingsSchema = schema(
  {
    mode: t.string(),
    rounds: t.uint8(),
    startingChips: t.uint32(),
    ante: t.uint32(),
    smallBlind: t.uint32(),
    bigBlind: t.uint32(),
    minRaise: t.uint32(),
    bettingSeconds: t.uint8(),
    showAllCards: t.boolean(),
  },
  'PokerSettings',
);

const GameSchema = schema(
  {
    stage: t.string(),
    round: t.uint8(),
    deadline: t.float64(),
    serverNow: t.float64(),
    activePlayerId: t.string(),
    communityCards: t.string(),
    dealerCards: t.string(),
    dealerHoleHidden: t.boolean(),
    dealerHandLabel: t.string(),
    pot: t.uint32(),
    currentBet: t.uint32(),
    winnerId: t.string(),
    rankings: t.string(),
    lastEvent: t.string(),
    players: t.map('string'),
  },
  'PokerGame',
);

const PokerStateSchema = LobbyStateSchema.extend(
  { settings: SettingsSchema, game: GameSchema },
  'PokerLobbyState',
);

function emptyGame() {
  return new GameSchema({
    stage: '',
    round: 0,
    deadline: 0,
    serverNow: 0,
    activePlayerId: '',
    communityCards: '[]',
    dealerCards: '[]',
    dealerHoleHidden: true,
    dealerHandLabel: '',
    pot: 0,
    currentBet: 0,
    winnerId: '',
    rankings: '[]',
    lastEvent: '',
  });
}

export class PokerRoom extends LobbyRoom<
  InstanceType<typeof PokerStateSchema>
> {
  protected readonly game = pokerParty;
  private match: PokerGame | undefined;
  private timer: { clear(): void } | undefined;

  protected createState(code: string) {
    return new PokerStateSchema({
      ...this.lobbyFields(code),
      settings: new SettingsSchema(defaultPokerSettings),
      game: emptyGame(),
    });
  }

  protected capacity() {
    return pokerParty.maxPlayers;
  }

  protected allowsMidMatchJoin() {
    return true;
  }

  protected joinMatch(id: string) {
    this.match?.joinNextRound(id);
    this.sync();
  }

  protected minimumPlayers() {
    return this.state.settings.mode === 'holdem' ? 2 : 1;
  }

  protected validateStart() {
    return this.participants().length >= this.minimumPlayers()
      ? null
      : 'not-enough-players';
  }

  public onCreate() {
    super.onCreate();
    this.onMessage('settings', (client, payload: unknown) =>
      this.handleSettings(client, payload),
    );
    this.onMessage('bet', (client, payload: unknown) =>
      this.handleBet(client, payload),
    );
    this.onMessage('action', (client, payload: unknown) =>
      this.handleAction(client, payload),
    );
  }

  public onDispose() {
    super.onDispose();
    this.timer?.clear();
    this.timer = undefined;
  }

  protected startMatch(ids: string[]) {
    this.match = new PokerGame(
      ids,
      this.state.settings.toJSON() as PokerSettings,
      performance.now(),
    );
    this.sync();
  }

  protected endMatch() {
    this.match = undefined;
    this.timer?.clear();
    this.timer = undefined;
    this.state.game = emptyGame();
  }

  protected leaveMatch(id: string) {
    this.match?.leave(id, performance.now());
    this.sync();
  }

  protected buildMatchResult(
    matchId: string,
    playedAt: string,
    endedAt: string,
  ): PokerMatchResult | null {
    const match = this.match;
    if (!match || match.stage !== 'complete') return null;
    const players = [...match.players.keys()].flatMap((sessionId) => {
      const playerId = this.accountId(sessionId);
      if (!playerId) return [];
      return [
        {
          playerId,
          outcome:
            sessionId === match.winnerId ? ('win' as const) : ('loss' as const),
          stats: {},
        },
      ];
    });
    return players.length
      ? {
          gameId: 'poker-party',
          matchId,
          playedAt,
          durationSeconds: Math.max(
            0,
            (Date.parse(endedAt) - Date.parse(playedAt)) / 1000,
          ),
          players,
        }
      : null;
  }

  private handleSettings(client: Client, payload: unknown) {
    if (this.state.phase !== 'lobby')
      return this.sendError(client, 'wrong-phase');
    if (client.sessionId !== this.state.hostId)
      return this.sendError(client, 'host-only');
    const settings = parsePokerSettings(payload);
    if (!settings) return this.sendError(client, 'invalid-payload');
    Object.assign(this.state.settings, settings);
    this.resetReady();
  }

  private handleBet(client: Client, payload: unknown) {
    if (this.state.phase !== 'playing' || !this.match)
      return this.sendError(client, 'wrong-phase');
    const error = this.match.placeBet(
      client.sessionId,
      payload,
      performance.now(),
    );
    if (error) client.send('poker-error', error);
    this.sync();
  }

  private handleAction(client: Client, payload: unknown) {
    if (this.state.phase !== 'playing' || !this.match)
      return this.sendError(client, 'wrong-phase');
    const error = this.match.act(
      client.sessionId,
      payload as PokerAction,
      performance.now(),
    );
    if (error) client.send('poker-error', error);
    this.sync();
  }

  private sync() {
    const match = this.match;
    if (!match) return;
    this.seatWaitingPlayers(match.players.keys());
    const game = this.state.game;
    for (const id of match.order)
      game.players.set(id, JSON.stringify(match.publicPlayer(id)));
    Object.assign(game, {
      stage: match.stage,
      round: match.round,
      deadline: match.deadline,
      serverNow: performance.now(),
      activePlayerId: match.activePlayerId,
      communityCards: JSON.stringify(match.communityCards),
      dealerCards: JSON.stringify(match.dealerCards),
      dealerHoleHidden: match.dealerHoleHidden,
      dealerHandLabel: match.dealerHandLabel,
      pot: match.pot,
      currentBet: match.currentBet,
      winnerId: match.winnerId,
      rankings: JSON.stringify(match.rankings),
      lastEvent: match.lastEvent,
    });
    this.timer?.clear();
    this.timer = undefined;
    if (match.stage === 'showdown') {
      this.timer = this.clock.setTimeout(
        () => {
          match.expire(performance.now());
          this.sync();
        },
        Math.max(1, match.deadline - performance.now()),
      );
    } else if (match.stage === 'complete') {
      this.showResults(match.resultReason);
    } else {
      this.timer = this.clock.setTimeout(
        () => {
          match.expire(performance.now());
          this.sync();
        },
        Math.max(1, match.deadline - performance.now()),
      );
    }
  }
}

export type PokerRoomStateInstance = PokerRoomState;
