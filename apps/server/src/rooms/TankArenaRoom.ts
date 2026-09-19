import type { Client } from '@colyseus/core';
import { schema, t } from '@colyseus/schema';
import {
  isTankId,
  tankArena,
  tankIds,
  type ActionId,
  type TankStage,
} from '@but/tank-arena';
import { TankArenaGame } from '@but/tank-arena/server';
import type { JoinOptions } from '@but/shared';
import { LobbyRoom, LobbyStateSchema } from './LobbyRoom.js';

const TankPlayerSchema = schema(
  {
    tank: t.string(),
    x: t.float32(),
    y: t.float32(),
    facing: t.int8(),
    health: t.int16(),
    maxHealth: t.uint16(),
    shield: t.uint16(),
    alive: t.boolean(),
    confirmed: t.boolean(),
    cooldowns: t.map('uint8'),
    boost: t.string(),
    poisonTurns: t.uint8(),
    frozenTurns: t.uint8(),
  },
  'TankPlayer',
);

const TankGameSchema = schema(
  {
    stage: t.string<TankStage>(),
    turn: t.uint16(),
    deadline: t.float64(),
    serverNow: t.float64(),
    winnerId: t.string(),
    map: t.string(),
    // JSON blobs: written once per turn and only read whole by clients.
    replay: t.string(),
    craters: t.string(),
    pickups: t.string(),
    hazard: t.string(),
    players: t.map(TankPlayerSchema),
  },
  'TankGame',
);

const TankArenaStateSchema = LobbyStateSchema.extend(
  { loadouts: t.map('string'), game: TankGameSchema },
  'TankArenaLobbyState',
);

function emptyGame() {
  return new TankGameSchema({
    stage: '',
    turn: 0,
    deadline: 0,
    serverNow: 0,
    winnerId: '',
    map: '',
    replay: '',
    craters: '[]',
    pickups: '[]',
    hazard: '',
  });
}

export class TankArenaRoom extends LobbyRoom<
  InstanceType<typeof TankArenaStateSchema>
> {
  protected readonly game = tankArena;
  private match: TankArenaGame | undefined;
  private timer: { clear(): void } | undefined;

  protected createState(code: string) {
    return new TankArenaStateSchema({
      ...this.lobbyFields(code),
      game: emptyGame(),
    });
  }

  protected capacity() {
    return tankArena.maxPlayers;
  }

  public onCreate() {
    super.onCreate();
    this.onMessage('tank', (client, tank: unknown) => {
      if (!isTankId(tank)) return this.sendError(client, 'invalid-payload');
      if (this.state.phase !== 'lobby')
        return this.sendError(client, 'wrong-phase');
      this.state.loadouts.set(client.sessionId, tank);
    });
    this.onMessage('plan', (client, payload: unknown) => {
      if (this.state.phase !== 'playing' || !this.match)
        return this.sendError(client, 'wrong-phase');
      const error = this.match.plan(
        client.sessionId,
        payload,
        performance.now(),
      );
      this.sync();
      if (error) client.send('plan-error', error);
    });
  }

  public onJoin(client: Client, options: JoinOptions) {
    super.onJoin(client, options);
    // Spread the roster so a fresh lobby already shows different tanks.
    this.state.loadouts.set(
      client.sessionId,
      tankIds[(this.state.players.size - 1) % tankIds.length]!,
    );
  }

  public onLeave(client: Client) {
    super.onLeave(client);
    this.state.loadouts.delete(client.sessionId);
  }

  public onDrop(client: Client) {
    super.onDrop(client);
    this.state.loadouts.delete(client.sessionId);
  }

  public onDispose() {
    super.onDispose();
    this.timer?.clear();
    this.timer = undefined;
  }

  protected startMatch(ids: string[]) {
    this.match = new TankArenaGame(
      ids.map((id) => {
        const tank = this.state.loadouts.get(id);
        return { id, tank: isTankId(tank) ? tank : 'howler' };
      }),
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

  private sync() {
    const game = this.match;
    if (!game) return;
    const state = this.state.game;
    for (const [id, player] of game.players) {
      let synced = state.players.get(id);
      if (!synced) {
        synced = new TankPlayerSchema();
        state.players.set(id, synced);
      }
      Object.assign(synced, {
        tank: player.tank,
        x: player.x,
        y: player.y,
        facing: player.facing,
        health: player.health,
        maxHealth: player.maxHealth,
        shield: player.shield,
        alive: player.alive,
        confirmed: player.confirmed,
        boost: player.boost,
        poisonTurns: player.poisonTurns,
        frozenTurns: player.frozenTurns,
      });
      for (const action of [...synced.cooldowns.keys()])
        if (!player.cooldowns.has(action as ActionId))
          synced.cooldowns.delete(action);
      for (const [action, turns] of player.cooldowns)
        synced.cooldowns.set(action, turns);
    }
    Object.assign(state, {
      stage: game.stage,
      turn: game.turn,
      deadline: game.deadline,
      serverNow: performance.now(),
      winnerId: game.winnerId,
      map: game.map.id,
      replay: game.replay ? JSON.stringify(game.replay) : '',
      craters: JSON.stringify(game.craters),
      pickups: JSON.stringify(game.pickups),
      hazard: game.hazard ? JSON.stringify(game.hazard) : '',
    });
    this.timer?.clear();
    this.timer = undefined;
    if (game.ended) {
      this.showResults(game.resultReason);
      return;
    }
    this.timer = this.clock.setTimeout(
      () => {
        game.update(performance.now());
        this.sync();
      },
      Math.max(1, game.deadline - performance.now()),
    );
  }
}
