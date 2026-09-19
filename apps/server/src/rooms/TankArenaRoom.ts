import type { Client } from '@colyseus/core';
import { schema, t } from '@colyseus/schema';
import {
  isTankTeamMode,
  isMapVoteId,
  isTankId,
  maps,
  tankArena,
  tankIds,
  tankTeamCounts,
  tankTeamIds,
  validTankTeams,
  type ActionId,
  type TankTeamMode,
  type TankStage,
} from '@but/tank-arena';
import { selectMapId, TankArenaGame } from '@but/tank-arena/server';
import type {
  JoinOptions,
  LobbyErrorCode,
  TankArenaMatchResult,
} from '@but/shared';
import { LobbyRoom, LobbyStateSchema } from './LobbyRoom.js';

const TankPlayerSchema = schema(
  {
    team: t.string(),
    tank: t.string(),
    x: t.float32(),
    y: t.float32(),
    angle: t.float32(),
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
    winnerTeam: t.string(),
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
  {
    loadouts: t.map('string'),
    mapVotes: t.map('string'),
    teamMode: t.string<TankTeamMode>(),
    teamCount: t.uint8(),
    teams: t.map('string'),
    game: TankGameSchema,
  },
  'TankArenaLobbyState',
);

function emptyGame() {
  return new TankGameSchema({
    stage: '',
    turn: 0,
    deadline: 0,
    serverNow: 0,
    winnerId: '',
    winnerTeam: '',
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
      teamMode: 'free-for-all',
      teamCount: 2,
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
    this.onMessage('team-mode', (client, value: unknown) => {
      if (this.state.phase !== 'lobby')
        return this.sendError(client, 'wrong-phase');
      if (client.sessionId !== this.state.hostId)
        return this.sendError(client, 'host-only');
      if (!isTankTeamMode(value))
        return this.sendError(client, 'invalid-team-mode');
      this.state.teamMode = value;
      if (
        value === 'teams' &&
        !tankTeamCounts.includes(this.state.teamCount as 2 | 3 | 4)
      )
        this.state.teamCount = 2;
      this.resetTeams();
      this.resetReady();
    });
    this.onMessage('team-count', (client, value: unknown) => {
      const count = typeof value === 'number' ? value : 0;
      if (this.state.phase !== 'lobby')
        return this.sendError(client, 'wrong-phase');
      if (client.sessionId !== this.state.hostId)
        return this.sendError(client, 'host-only');
      if (
        this.state.teamMode !== 'teams' ||
        !Number.isInteger(count) ||
        !tankTeamCounts.includes(count as 2 | 3 | 4) ||
        this.state.players.size < count
      )
        return this.sendError(client, 'invalid-team-mode');
      this.state.teamCount = count;
      this.resetTeams();
      this.resetReady();
    });
    this.onMessage('team-join', (client, value: unknown) => {
      if (this.state.phase !== 'lobby')
        return this.sendError(client, 'wrong-phase');
      if (!this.state.players.has(client.sessionId))
        return this.sendError(client, 'not-in-lobby');
      if (
        this.state.teamMode === 'free-for-all' ||
        typeof value !== 'string' ||
        !tankTeamIds(this.state.teamMode, this.state.teamCount).includes(value)
      )
        return this.sendError(client, 'invalid-team');
      if (this.state.teams.get(client.sessionId) === value) return;
      this.state.teams.set(client.sessionId, value);
      this.resetReady();
    });
    this.onMessage('map-vote', (client, mapId: unknown) => {
      if (this.state.phase !== 'lobby')
        return this.sendError(client, 'wrong-phase');
      if (!isMapVoteId(mapId)) return this.sendError(client, 'invalid-payload');
      if (!this.state.players.has(client.sessionId))
        return this.sendError(client, 'not-in-lobby');
      this.state.mapVotes.set(client.sessionId, mapId);
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
    this.assignTeam(client.sessionId);
    // Spread the roster so a fresh lobby already shows different tanks.
    this.state.loadouts.set(
      client.sessionId,
      tankIds[(this.state.players.size - 1) % tankIds.length]!,
    );
  }

  public onLeave(client: Client) {
    super.onLeave(client);
    this.state.loadouts.delete(client.sessionId);
    this.state.mapVotes.delete(client.sessionId);
    this.state.teams.delete(client.sessionId);
  }

  public onDrop(client: Client) {
    super.onDrop(client);
    this.state.loadouts.delete(client.sessionId);
    this.state.mapVotes.delete(client.sessionId);
    this.state.teams.delete(client.sessionId);
  }

  public onDispose() {
    super.onDispose();
    this.timer?.clear();
    this.timer = undefined;
  }

  protected startMatch(ids: string[]) {
    const mapId = selectMapId(
      ids.map((id) => this.state.mapVotes.get(id) ?? ''),
    );
    this.match = new TankArenaGame(
      ids.map((id) => {
        const tank = this.state.loadouts.get(id);
        return {
          id,
          team: this.state.teams.get(id) ?? id,
          tank: isTankId(tank) ? tank : 'howler',
        };
      }),
      performance.now(),
      Math.random,
      maps[mapId],
    );
    this.state.mapVotes.clear();
    this.sync();
  }

  protected endMatch() {
    this.match = undefined;
    this.timer?.clear();
    this.timer = undefined;
    this.state.game = emptyGame();
    this.state.mapVotes.clear();
  }

  protected leaveMatch(id: string) {
    this.match?.leave(id, performance.now());
    this.sync();
  }

  protected buildMatchResult(
    matchId: string,
    playedAt: string,
    endedAt: string,
  ): TankArenaMatchResult | null {
    const match = this.match;
    if (!match) return null;
    const players = [...match.players].flatMap(([sessionId, player]) => {
      const playerId = this.accountId(sessionId);
      if (!playerId) return [];
      return [
        {
          playerId,
          outcome: match.winnerTeam
            ? player.team === match.winnerTeam
              ? ('win' as const)
              : ('loss' as const)
            : ('draw' as const),
          stats: {
            shotsFired: player.shotsFired ?? 0,
            shotsHit: player.shotsHit ?? 0,
            damageDealt: player.damageDealt ?? 0,
            kills: player.kills ?? 0,
            deaths: player.deaths ?? 0,
          },
        },
      ];
    });
    return players.length
      ? {
          gameId: 'tank-arena',
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
        team: player.team,
        tank: player.tank,
        x: player.x,
        y: player.y,
        angle: player.angle,
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
      winnerTeam: game.winnerTeam,
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

  protected validateStart(): LobbyErrorCode | null {
    const ids = this.participants().map(([id]) => id);
    return validTankTeams(
      this.state.teamMode,
      ids,
      this.state.teams,
      this.state.teamCount,
    )
      ? null
      : 'team-setup';
  }

  private assignTeam(id: string) {
    if (this.state.teamMode === 'free-for-all') {
      this.state.teams.set(id, `player:${id}`);
      return;
    }
    const candidates = tankTeamIds(this.state.teamMode, this.state.teamCount);
    const teamId = candidates.sort(
      (left, right) =>
        [...this.state.teams.values()].filter((team) => team === left).length -
        [...this.state.teams.values()].filter((team) => team === right).length,
    )[0];
    if (teamId) this.state.teams.set(id, teamId);
  }

  private resetTeams() {
    this.state.teams.clear();
    for (const id of this.state.players.keys()) this.assignTeam(id);
  }
}
