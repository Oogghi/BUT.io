import type { GameMetadata, LobbyState } from '@but/shared';
import { HOLE_SETS } from './holes.ts';

export * from './holes.ts';
export * from './physics.ts';

export const miniGolf = {
  id: 'mini-golf',
  name: 'Mini Golf',
  minPlayers: 1,
  maxPlayers: 6,
} as const satisfies GameMetadata;

/** Strokes allowed on a hole; a ball still out after this many is picked up. */
export const MAX_STROKES = 8;
/** What a picked-up hole scores. */
export const PICKUP_SCORE = MAX_STROKES + 1;
/** How long the hole's scores stay up before the next tee. */
export const HOLE_BREAK_MS = 4500;

export type CourseLength = keyof typeof HOLE_SETS;

export interface MiniGolfSettings {
  holes: CourseLength;
  shotSeconds: 20 | 30 | 45;
}

export const defaultMiniGolfSettings: Readonly<MiniGolfSettings> = {
  holes: 6,
  shotSeconds: 30,
};

export function parseSettings(value: unknown): MiniGolfSettings | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const { holes, shotSeconds } = value as Record<string, unknown>;
  return [3, 6, 9].includes(holes as number) &&
    [20, 30, 45].includes(shotSeconds as number)
    ? {
        holes: holes as CourseLength,
        shotSeconds: shotSeconds as MiniGolfSettings['shotSeconds'],
      }
    : null;
}

export type MiniGolfStage = 'aiming' | 'rolling' | 'hole-over';

export interface MiniGolfPlayer {
  x: number;
  y: number;
  /** False until the player's first shot on this hole: the ball waits on the tee. */
  onCourse: boolean;
  sunk: boolean;
  /** Strokes on the current hole, penalties included. */
  strokes: number;
  /** Final score of each finished hole, in course order. */
  scores: number[];
  departed: boolean;
}

/** Everything a client needs to replay the latest shot exactly as the server ran it. */
export interface ShotRecord {
  seq: number;
  playerId: string;
  dx: number;
  dy: number;
  /** Every ball's position before the shot, in simulation order. */
  start: { id: string; x: number; y: number; onCourse: boolean }[];
}

export interface MiniGolfGameState {
  /** Position in this course's hole list. */
  hole: number;
  /** Index into `HOLES` of the hole being played. */
  holeId: number;
  holeCount: number;
  stage: MiniGolfStage;
  activePlayerId: string;
  deadline: number;
  serverNow: number;
  shotSeq: number;
  /** JSON `ShotRecord` of the latest shot. */
  shot: string;
  /** `kind:playerId`, bumped with `noticeSeq`, for moments the shot replay can't show. */
  notice: string;
  noticeSeq: number;
  winnerId: string;
  /** JSON `MiniGolfPlayer` per player. */
  players: ReadonlyMap<string, string>;
}

export interface MiniGolfRoomState extends LobbyState {
  settings: MiniGolfSettings;
  game: MiniGolfGameState;
}

export type MiniGolfError = 'not-your-turn' | 'not-aiming' | 'invalid-shot';

/** Sum of finished holes; lower wins. */
export function totalScore(player: Pick<MiniGolfPlayer, 'scores'>) {
  return player.scores.reduce((sum, score) => sum + score, 0);
}

/** Golf's name for a hole score, from the ball's point of view. */
export type ScoreName =
  | 'hole-in-one'
  | 'eagle'
  | 'birdie'
  | 'par'
  | 'bogey'
  | 'double-bogey'
  | 'worse'
  | 'picked-up';

export function scoreName(strokes: number, par: number): ScoreName {
  if (strokes >= PICKUP_SCORE) return 'picked-up';
  if (strokes === 1) return 'hole-in-one';
  const relative = strokes - par;
  return relative <= -2
    ? 'eagle'
    : relative === -1
      ? 'birdie'
      : relative === 0
        ? 'par'
        : relative === 1
          ? 'bogey'
          : relative === 2
            ? 'double-bogey'
            : 'worse';
}
