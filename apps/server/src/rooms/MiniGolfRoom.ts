import { schema, t } from '@colyseus/schema';
import {
  defaultMiniGolfSettings,
  miniGolf,
  parseSettings,
  type MiniGolfSettings,
} from '@but/mini-golf';
import { MiniGolfGame } from '@but/mini-golf/server';
import { LobbyRoom, LobbyStateSchema } from './LobbyRoom.js';

const SettingsSchema = schema(
  { holes: t.uint8(), shotSeconds: t.uint8() },
  'MiniGolfSettings',
);
const GameSchema = schema(
  {
    hole: t.uint8(),
    holeId: t.uint8(),
    holeCount: t.uint8(),
    stage: t.string(),
    activePlayerId: t.string(),
    deadline: t.float64(),
    serverNow: t.float64(),
    shotSeq: t.uint32(),
    shot: t.string(),
    notice: t.string(),
    noticeSeq: t.uint32(),
    winnerId: t.string(),
    players: t.map('string'),
  },
  'MiniGolfGame',
);
const StateSchema = LobbyStateSchema.extend(
  { settings: SettingsSchema, game: GameSchema },
  'MiniGolfLobby',
);
const emptyGame = () =>
  new GameSchema({
    hole: 0,
    holeId: 0,
    holeCount: 0,
    stage: 'aiming',
    activePlayerId: '',
    deadline: 0,
    serverNow: 0,
    shotSeq: 0,
    shot: '',
    notice: '',
    noticeSeq: 0,
    winnerId: '',
  });

export class MiniGolfRoom extends LobbyRoom<InstanceType<typeof StateSchema>> {
  protected readonly game = miniGolf;
  private match: MiniGolfGame | undefined;
  private timer: { clear(): void } | undefined;

  protected capacity() {
    return miniGolf.maxPlayers;
  }

  protected createState(code: string) {
    return new StateSchema({
      ...this.lobbyFields(code),
      settings: new SettingsSchema(defaultMiniGolfSettings),
      game: emptyGame(),
    });
  }

  public onCreate() {
    super.onCreate();
    this.onMessage('settings', (client, payload: unknown) => {
      if (this.state.phase !== 'lobby')
        return this.sendError(client, 'wrong-phase');
      if (client.sessionId !== this.state.hostId)
        return this.sendError(client, 'host-only');
      const settings = parseSettings(payload);
      if (!settings) return this.sendError(client, 'invalid-payload');
      Object.assign(this.state.settings, settings);
      this.resetReady();
    });
    this.onMessage('shot', (client, payload: unknown) => {
      if (this.state.phase !== 'playing' || !this.match)
        return this.sendError(client, 'wrong-phase');
      const error = this.match.shoot(
        client.sessionId,
        payload,
        performance.now(),
      );
      if (error) client.send('mini-golf-error', error);
      this.sync();
    });
  }

  public onDispose() {
    super.onDispose();
    this.timer?.clear();
  }

  protected startMatch(ids: string[]) {
    this.match = new MiniGolfGame(
      ids,
      this.state.settings.toJSON() as MiniGolfSettings,
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

  // This game has no persistent reward/stat contract yet.
  protected buildMatchResult() {
    return null;
  }

  private sync() {
    const match = this.match;
    if (!match) return;
    const game = this.state.game;
    Object.assign(game, {
      hole: match.hole,
      holeId: match.holeId,
      holeCount: match.holes.length,
      stage: match.stage,
      activePlayerId: match.activePlayerId,
      deadline: match.deadline,
      serverNow: performance.now(),
      shotSeq: match.shotSeq,
      shot: match.shot ? JSON.stringify(match.shot) : '',
      notice: match.notice,
      noticeSeq: match.noticeSeq,
      winnerId: match.winnerId,
    });
    for (const [id, player] of match.players)
      game.players.set(id, JSON.stringify(player));

    this.timer?.clear();
    this.timer = undefined;
    if (match.ended) {
      this.showResults(match.resultReason);
      return;
    }
    this.timer = this.clock.setTimeout(
      () => {
        match.advance(performance.now());
        this.sync();
      },
      Math.max(1, match.deadline - performance.now()),
    );
  }
}
