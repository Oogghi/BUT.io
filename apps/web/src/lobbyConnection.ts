import { Client, type Room } from '@colyseus/sdk';
import type { BombPartyRoomState } from '@but/bomb-party';
import {
  defaultBlackjackSettings,
  type BlackjackPlayerState,
  type BlackjackRoomState,
  type BlackjackSettings,
  type Card,
} from '@but/blackjack-party';
import {
  isTankId,
  tankArena,
  type Hazard,
  type Pickup,
  type Replay,
  type TankArenaRoomState,
} from '@but/tank-arena';

export type LobbyRoom = Room<
  unknown,
  BombPartyRoomState | TankArenaRoomState | BlackjackRoomState
>;

const serverUrl: string =
  import.meta.env.VITE_COLYSEUS_URL ||
  import.meta.env.VITE_SERVER_URL ||
  'http://127.0.0.1:2567';

export const lobbyClient = new Client(serverUrl);

/** The game server's HTTP origin, for health checks; the lobby URL may be ws(s)://. */
export const serverHttpUrl = serverUrl.replace(/^ws/, 'http');

/** Snapshot `stage`, `turn` or `turnId` changes that should clear a stale action error. */
export function turnKey(state: LobbySnapshot) {
  return state.gameId === 'blackjack-party'
    ? `${state.phase}:${state.game.round}:${state.game.stage}:${state.game.activePlayerId}:${state.game.activeHandIndex}`
    : state.gameId === tankArena.id
      ? `${state.phase}:${state.game.turn}:${state.game.stage}`
      : `${state.phase}:${state.game.turnId}`;
}

// The replay is up to a few KB of JSON; parse it once per turn, not on every patch.
let replayCache: { json: string; value: Replay | null } = {
  json: '',
  value: null,
};
function parseReplay(json: string) {
  if (json !== replayCache.json)
    replayCache = { json, value: json ? (JSON.parse(json) as Replay) : null };
  return replayCache.value;
}

// The client time at which the current `serverNow` arrived, so every client counts down
// from the same instant however late it renders.
let serverClock = { serverNow: -1, receivedAt: 0 };

function snapshotTankArena(state: TankArenaRoomState) {
  const { game } = state;
  if (game.serverNow !== serverClock.serverNow)
    serverClock = { serverNow: game.serverNow, receivedAt: performance.now() };
  return {
    gameId: 'tank-arena' as const,
    teamMode: state.teamMode,
    teamCount: state.teamCount,
    teams: new Map(state.teams),
    loadouts: new Map(state.loadouts),
    mapVotes: new Map(state.mapVotes),
    game: {
      stage: game.stage,
      turn: game.turn,
      /** `performance.now()` time the current stage ends on this client. */
      endsAt: serverClock.receivedAt + (game.deadline - game.serverNow),
      winnerId: game.winnerId,
      winnerTeam: game.winnerTeam,
      map: game.map,
      replay: parseReplay(game.replay),
      craters: JSON.parse(game.craters || '[]') as [number, number, number][],
      pickups: JSON.parse(game.pickups || '[]') as Pickup[],
      hazard: game.hazard ? (JSON.parse(game.hazard) as Hazard) : null,
      players: new Map(
        Array.from(game.players, ([id, player]) => [
          id,
          {
            team: player.team,
            tank: isTankId(player.tank) ? player.tank : 'howler',
            x: player.x,
            y: player.y,
            angle: player.angle,
            facing: player.facing,
            health: player.health,
            maxHealth: player.maxHealth,
            shield: player.shield,
            alive: player.alive,
            confirmed: player.confirmed,
            cooldowns: new Map(player.cooldowns),
            boost: player.boost,
            poisonTurns: player.poisonTurns,
            frozenTurns: player.frozenTurns,
          },
        ]),
      ),
    },
  };
}

function snapshotBombParty(state: BombPartyRoomState) {
  const { settings, game } = state;
  return {
    gameId: 'bomb-party' as const,
    settings: {
      dictionary: settings.dictionary,
      difficulty: settings.difficulty,
      minTurnSeconds: settings.minTurnSeconds,
      maxPromptAge: settings.maxPromptAge,
      startingLives: settings.startingLives,
      maxLives: settings.maxLives,
      maxPlayers: settings.maxPlayers,
      bonusAlphabet: settings.bonusAlphabet,
    },
    game: {
      activePlayerId: game.activePlayerId,
      prompt: game.prompt,
      promptAge: game.promptAge,
      turnId: game.turnId,
      winnerId: game.winnerId,
      lastWord: game.lastWord,
      lastPlayerId: game.lastPlayerId,
      lastEvent: game.lastEvent,
      usedWordCount: game.usedWordCount,
      players: new Map(
        Array.from(game.players, ([id, player]) => [
          id,
          {
            lives: player.lives,
            bonusLetters: player.bonusLetters,
            lastWord: player.lastWord,
          },
        ]),
      ),
    },
  };
}

function snapshotBlackjack(state: BlackjackRoomState) {
  const { game } = state;
  if (game.serverNow !== serverClock.serverNow)
    serverClock = { serverNow: game.serverNow, receivedAt: performance.now() };
  const settings = Object.fromEntries(
    Object.keys(defaultBlackjackSettings).map((key) => [
      key,
      state.settings[key as keyof BlackjackSettings],
    ]),
  ) as unknown as BlackjackSettings;
  return {
    gameId: 'blackjack-party' as const,
    settings,
    game: {
      stage: game.stage,
      round: game.round,
      endsAt: serverClock.receivedAt + (game.deadline - game.serverNow),
      activePlayerId: game.activePlayerId,
      activeHandIndex: game.activeHandIndex,
      dealerCards: JSON.parse(game.dealerCards || '[]') as Card[],
      dealerCardCount: game.dealerCardCount,
      dealerHoleHidden: game.dealerHoleHidden,
      shoeRemaining: game.shoeRemaining,
      shoeUsed: game.shoeUsed,
      dealerValue: game.dealerValue,
      winnerId: game.winnerId,
      rankings: JSON.parse(game.rankings || '[]') as string[],
      lastEvent: game.lastEvent,
      players: new Map(
        Array.from(game.players, ([id, player]) => [
          id,
          JSON.parse(player) as BlackjackPlayerState,
        ]),
      ),
    },
  };
}

/** Copy mutable Colyseus state into a React snapshot on each server patch. */
export function snapshotRoom(room: LobbyRoom) {
  const state = room.state;
  const base = {
    code: state.code,
    phase: state.phase,
    hostId: state.hostId,
    resultReason: state.resultReason,
    players: Array.from(state.players, ([id, player]) => ({
      id,
      displayName: player.displayName,
      avatar: player.avatar,
      ready: player.ready,
      spectator: player.spectator,
    })),
  };
  return state.gameId === 'blackjack-party'
    ? { ...base, ...snapshotBlackjack(state as BlackjackRoomState) }
    : state.gameId === tankArena.id
      ? { ...base, ...snapshotTankArena(state as TankArenaRoomState) }
      : { ...base, ...snapshotBombParty(state as BombPartyRoomState) };
}

export type LobbySnapshot = ReturnType<typeof snapshotRoom>;
export type BombPartySnapshot = Extract<
  LobbySnapshot,
  { gameId: 'bomb-party' }
>;
export type TankArenaSnapshot = Extract<
  LobbySnapshot,
  { gameId: 'tank-arena' }
>;
export type BlackjackSnapshot = Extract<
  LobbySnapshot,
  { gameId: 'blackjack-party' }
>;
