import type { Client } from '@colyseus/core';
import { schema, t } from '@colyseus/schema';
import {
  blackjackParty,
  defaultBlackjackSettings,
  type BlackjackAction,
  type BlackjackActionError,
  type BlackjackSettings,
} from '@but/blackjack-party';
import {
  BlackjackGame,
  parseBlackjackSettings,
} from '@but/blackjack-party/server';
import type { BlackjackMatchResult, BlackjackMatchStats } from '@but/shared';
import { spendBlackjackRebuy } from '../rewards.js';
import { LobbyRoom, LobbyStateSchema } from './LobbyRoom.js';

const SettingsSchema = schema(
  {
    rounds: t.uint8(),
    startingChips: t.uint32(),
    minBet: t.uint32(),
    maxBet: t.uint32(),
    decks: t.uint8(),
    shuffle: t.boolean(),
    blackjackPayout: t.float32(),
    dealerHitsSoft17: t.boolean(),
    allowDouble: t.boolean(),
    allowSplit: t.boolean(),
    maxSplits: t.uint8(),
    doubleAfterSplit: t.boolean(),
    sideBetsEnabled: t.boolean(),
    perfectPairsEnabled: t.boolean(),
    twentyOnePlusThreeEnabled: t.boolean(),
    minSideBet: t.uint32(),
    maxSideBet: t.uint32(),
    perfectPairMixedPayout: t.uint16(),
    perfectPairColoredPayout: t.uint16(),
    perfectPairPayout: t.uint16(),
    twentyOnePlusThreeFlushPayout: t.uint16(),
    twentyOnePlusThreeStraightPayout: t.uint16(),
    twentyOnePlusThreeTripsPayout: t.uint16(),
    twentyOnePlusThreeStraightFlushPayout: t.uint16(),
    twentyOnePlusThreeSuitedTripsPayout: t.uint16(),
    bettingSeconds: t.uint8(),
    actionSeconds: t.uint8(),
    rebuysEnabled: t.boolean(),
    rebuyChipAmount: t.uint32(),
    rebuyCost: t.uint32(),
    maxRebuys: t.uint8(),
  },
  'BlackjackSettings',
);

const GameSchema = schema(
  {
    stage: t.string(),
    round: t.uint8(),
    deadline: t.float64(),
    serverNow: t.float64(),
    activePlayerId: t.string(),
    activeHandIndex: t.uint8(),
    dealerCards: t.string(),
    dealerCardCount: t.uint8(),
    shoeRemaining: t.uint16(),
    shoeUsed: t.uint16(),
    dealerHoleHidden: t.boolean(),
    dealerValue: t.uint8(),
    winnerId: t.string(),
    rankings: t.string(),
    lastEvent: t.string(),
    players: t.map('string'),
  },
  'BlackjackGame',
);

const BlackjackStateSchema = LobbyStateSchema.extend(
  { settings: SettingsSchema, game: GameSchema },
  'BlackjackLobbyState',
);

function emptyGame() {
  return new GameSchema({
    stage: '',
    round: 0,
    deadline: 0,
    serverNow: 0,
    activePlayerId: '',
    activeHandIndex: 0,
    dealerCards: '[]',
    dealerCardCount: 0,
    shoeRemaining: 0,
    shoeUsed: 0,
    dealerHoleHidden: true,
    dealerValue: 0,
    winnerId: '',
    rankings: '[]',
    lastEvent: '',
  });
}

export class BlackjackRoom extends LobbyRoom<
  InstanceType<typeof BlackjackStateSchema>
> {
  protected readonly game = blackjackParty;
  private match: BlackjackGame | undefined;
  private timer: { clear(): void } | undefined;
  private readonly pendingRebuys = new Set<string>();

  protected createState(code: string) {
    return new BlackjackStateSchema({
      ...this.lobbyFields(code),
      settings: new SettingsSchema(defaultBlackjackSettings),
      game: emptyGame(),
    });
  }

  protected capacity() {
    return blackjackParty.maxPlayers;
  }

  protected allowsMidMatchJoin() {
    return true;
  }

  protected joinMatch(id: string) {
    this.match?.joinNextRound(id);
    this.sync();
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
    this.onMessage(
      'rebuy',
      (client, payload: unknown) => void this.handleRebuy(client, payload),
    );
  }

  public onDispose() {
    super.onDispose();
    this.timer?.clear();
    this.timer = undefined;
  }

  protected startMatch(ids: string[]) {
    this.match = new BlackjackGame(
      ids,
      this.state.settings.toJSON() as BlackjackSettings,
      performance.now(),
    );
    this.sync();
  }

  protected endMatch() {
    this.match = undefined;
    this.pendingRebuys.clear();
    this.timer?.clear();
    this.timer = undefined;
    this.state.game = emptyGame();
  }

  protected leaveMatch(id: string) {
    this.pendingRebuys.delete(id);
    this.match?.leave(id, performance.now());
    this.sync();
  }

  protected buildMatchResult(
    matchId: string,
    playedAt: string,
    endedAt: string,
  ): BlackjackMatchResult | null {
    const match = this.match;
    if (!match) return null;
    const players = [...match.players].flatMap(([sessionId, player]) => {
      const playerId = this.accountId(sessionId);
      if (!playerId) return [];
      const stats: BlackjackMatchStats = {
        roundsPlayed: player.roundsPlayed,
        roundsWon: player.roundsWon,
        blackjacks: player.blackjacks,
        busts: player.busts,
        doubleDownWins: player.doubleDownWins,
        splitWins: player.splitWins,
        perfectPairsWins: player.perfectPairsWins,
        twentyOnePlusThreeWins: player.twentyOnePlusThreeWins,
        highestEndingChipBalance: player.chips,
        rebuys: player.rebuys,
        globalCurrencySpentOnRebuys: player.globalCurrencySpentOnRebuys,
      };
      return [
        {
          playerId,
          outcome: player.rank === 1 ? ('win' as const) : ('loss' as const),
          stats,
        },
      ];
    });
    return players.length
      ? {
          gameId: 'blackjack-party',
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
    const settings = parseBlackjackSettings(payload);
    if (!settings) return this.sendError(client, 'invalid-payload');
    Object.assign(this.state.settings, settings);
    this.resetReady();
  }

  private handleBet(client: Client, payload: unknown) {
    if (this.state.phase !== 'playing' || !this.match)
      return this.sendError(client, 'wrong-phase');
    if (this.pendingRebuys.has(client.sessionId))
      return client.send('blackjack-error', 'rebuy-unavailable');
    const error = this.match.placeBet(
      client.sessionId,
      payload,
      performance.now(),
    );
    if (error) client.send('blackjack-error', error);
    this.sync();
  }

  private handleAction(client: Client, payload: unknown) {
    if (this.state.phase !== 'playing' || !this.match)
      return this.sendError(client, 'wrong-phase');
    const error = this.match.act(
      client.sessionId,
      payload as BlackjackAction,
      performance.now(),
    );
    if (error) client.send('blackjack-error', error);
    this.sync();
  }

  private async handleRebuy(client: Client, payload: unknown) {
    if (payload !== undefined) return this.sendError(client, 'invalid-payload');
    const match = this.match;
    if (this.state.phase !== 'playing' || !match)
      return this.sendError(client, 'wrong-phase');
    const eligibility = match.canRebuy(client.sessionId);
    if (eligibility) return client.send('blackjack-error', eligibility);
    if (this.pendingRebuys.has(client.sessionId)) return;
    const accountId = this.accountId(client.sessionId);
    if (!accountId)
      return client.send(
        'blackjack-error',
        'rebuy-sign-in' satisfies BlackjackActionError,
      );
    const player = match.players.get(client.sessionId)!;
    this.pendingRebuys.add(client.sessionId);
    const spent = await spendBlackjackRebuy(
      accountId,
      this.matchId(),
      player.rebuys + 1,
      match.settings.rebuyCost,
    );
    this.pendingRebuys.delete(client.sessionId);
    if ('error' in spent) {
      client.send('blackjack-error', spent.error);
      this.sync();
      return;
    }
    if (this.match !== match || match.canRebuy(client.sessionId)) {
      client.send('blackjack-error', 'rebuy-unavailable');
      this.sync();
      return;
    }
    match.grantRebuy(client.sessionId);
    client.send('rebuy-complete', { coins: spent.coins });
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
      activeHandIndex: match.activeHandIndex,
      dealerCards: JSON.stringify(match.dealerCards),
      dealerCardCount: match.dealerCardCount,
      shoeRemaining: match.shoeRemaining,
      shoeUsed: match.shoeUsed,
      dealerHoleHidden: match.dealerHoleHidden,
      dealerValue: match.dealerValue,
      winnerId: match.winnerId,
      rankings: JSON.stringify(match.rankings),
      lastEvent: match.lastEvent,
    });
    this.timer?.clear();
    this.timer = undefined;
    if (match.stage === 'complete') {
      this.showResults(match.resultReason);
      return;
    }
    const schedule = (
      delay = Math.max(1, match.deadline - performance.now()),
    ) => {
      this.timer = this.clock.setTimeout(() => {
        if (match.stage === 'betting' && this.pendingRebuys.size) {
          schedule(250);
          return;
        }
        match.expire(performance.now());
        this.sync();
      }, delay);
    };
    schedule();
  }
}
