import type { GameMetadata, LobbyState } from '@but/shared';

export const tankArena = {
  id: 'tank-arena',
  name: 'Tank Arena',
  minPlayers: 2,
  maxPlayers: 8,
} as const satisfies GameMetadata;

/** Seconds players get to pick an action; unconfirmed tanks skip the turn. */
export const PLANNING_SECONDS = 20;

export type ActionId =
  | 'skip'
  | 'jump'
  | 'missile'
  | 'shockwave'
  | 'big-shell'
  | 'triple-shot'
  | 'rocket-jump'
  | 'cluster-bomb'
  | 'toxic-shot';

export interface ActionInfo {
  /** Turns the action stays unavailable after use. */
  cooldown: number;
  /** `jump` aims a leap, `shell` aims a projectile, `none` needs no aim. */
  aim: 'jump' | 'shell' | 'none';
  /** Launch speed multiplier at full power (for jumps: of the tank's jump speed). */
  speed: number;
  /** Frozen tanks cannot use movement actions. */
  movement: boolean;
}

/** Rules data shared by the UI and validation. The behavior of each action lives in the simulation. */
export const actions: Record<ActionId, ActionInfo> = {
  skip: {
    cooldown: 0,
    aim: 'none',
    speed: 0,
    movement: false,
  },
  jump: {
    cooldown: 0,
    aim: 'jump',
    speed: 1,
    movement: true,
  },
  missile: {
    cooldown: 0,
    aim: 'shell',
    speed: 1,
    movement: false,
  },
  shockwave: {
    cooldown: 3,
    aim: 'none',
    speed: 0,
    movement: false,
  },
  'big-shell': {
    cooldown: 2,
    aim: 'shell',
    speed: 0.85,
    movement: false,
  },
  'triple-shot': {
    cooldown: 2,
    aim: 'shell',
    speed: 1,
    movement: false,
  },
  'rocket-jump': {
    cooldown: 3,
    aim: 'jump',
    // Neon's jumps are already high; more would leave the screen.
    speed: 1.1,
    movement: true,
  },
  'cluster-bomb': {
    cooldown: 3,
    aim: 'shell',
    speed: 0.95,
    movement: false,
  },
  'toxic-shot': {
    cooldown: 2,
    aim: 'shell',
    speed: 1,
    movement: false,
  },
};

export type TankId = 'howler' | 'neon' | 'viper';

export interface TankInfo {
  name: string;
  sprite: string;
  health: number;
  /** Heavier tanks are knocked back less and jump a little lower. */
  weight: number;
  /** Damage of a direct missile hit; abilities scale from it. */
  damage: number;
  /** 1 is perfectly accurate; lower values add random spread to shots. */
  accuracy: number;
  abilities: readonly [ActionId, ActionId];
}

export const tanks: Record<TankId, TankInfo> = {
  howler: {
    name: 'Howler',
    sprite: '/tank-arena/howler.png',
    health: 150,
    weight: 80,
    damage: 26,
    accuracy: 0.85,
    abilities: ['shockwave', 'big-shell'],
  },
  neon: {
    name: 'Neon',
    sprite: '/tank-arena/neon.png',
    health: 110,
    weight: 30,
    damage: 32,
    accuracy: 0.8,
    abilities: ['triple-shot', 'rocket-jump'],
  },
  viper: {
    name: 'Viper',
    sprite: '/tank-arena/viper.png',
    health: 130,
    weight: 55,
    damage: 29,
    accuracy: 0.95,
    abilities: ['cluster-bomb', 'toxic-shot'],
  },
};

export const tankIds = Object.keys(tanks) as TankId[];

export function isTankId(value: unknown): value is TankId {
  return typeof value === 'string' && Object.hasOwn(tanks, value);
}

/** Every tank can hold, jump and fire a missile, plus its two abilities. */
export function tankActions(tank: TankId): ActionId[] {
  return ['missile', 'jump', ...tanks[tank].abilities, 'skip'];
}

export type PickupKind =
  'heal' | 'damage' | 'cooldown' | 'shield' | 'poison' | 'freeze';

export const pickupKinds: readonly PickupKind[] = [
  'heal',
  'damage',
  'cooldown',
  'shield',
  'poison',
  'freeze',
];

export interface ArenaMap {
  id: string;
  width: number;
  height: number;
  background: string;
  /** Destructible foreground art drawn over `solids`; craters erase it. */
  terrain: string;
  /** Tanks that sink below this line are eliminated. */
  waterY: number;
  /** Solid rectangles `[x, y, width, height]` of the collision mask. */
  solids: readonly (readonly [number, number, number, number])[];
  /** Standing points `[x, y]` sorted by x; y is the surface under the tank. */
  spawns: readonly (readonly [number, number])[];
}

export const jungleMap: ArenaMap = {
  id: 'jungle',
  width: 1672,
  height: 941,
  background: '/tank-arena/jungle-background.jpg',
  terrain: '/tank-arena/jungle-terrain.png',
  waterY: 850,
  solids: [
    [218, 399, 317, 41],
    [710, 397, 297, 42],
    [1179, 396, 293, 40],
    [0, 733, 1672, 90],
  ],
  spawns: [
    [100, 733],
    [376, 399],
    [620, 733],
    [858, 397],
    [858, 733],
    [1090, 733],
    [1325, 396],
    [1570, 733],
  ],
};

export const maps: Record<string, ArenaMap> = { [jungleMap.id]: jungleMap };

export type ReplayTrackKind = 'tank' | 'shell' | 'bomblet' | 'toxic' | 'strike';

/** A moving body sampled every `TRACK_STEP` ticks from `t0`, plus its exact end at `t1`. */
export interface ReplayTrack {
  kind: ReplayTrackKind;
  /** Tank tracks carry the player id. */
  id: string;
  t0: number;
  t1: number;
  /** Flattened `[x, y, x, y, …]`. */
  pts: number[];
  /** Tank tracks: the tank's angle (radians) at each point of `pts`. */
  angles?: number[];
}

export type EliminationCause = 'health' | 'water' | 'poison' | 'left';

export type ReplayEvent =
  | { t: number; type: 'fire'; id: string; action: ActionId }
  | {
      t: number;
      type: 'explode';
      x: number;
      y: number;
      r: number;
      crater: number;
    }
  | {
      t: number;
      type: 'damage';
      id: string;
      amount: number;
      health: number;
      shield: number;
    }
  | { t: number; type: 'status'; id: string; status: 'poisoned' | 'frozen' }
  | { t: number; type: 'eliminated'; id: string; cause: EliminationCause }
  | { t: number; type: 'splash'; x: number }
  | { t: number; type: 'pickup'; id: string; pickup: number; kind: PickupKind }
  | { t: number; type: 'airstrike'; x: number };

/** Everything clients need to animate one resolved turn identically. */
export interface Replay {
  turn: number;
  ticks: number;
  start: {
    id: string;
    x: number;
    y: number;
    angle: number;
    health: number;
    shield: number;
  }[];
  tracks: ReplayTrack[];
  events: ReplayEvent[];
}

export interface Pickup {
  id: number;
  kind: PickupKind;
  x: number;
  y: number;
}

export interface Hazard {
  kind: 'airstrike';
  x: number;
  /** Half-width of the strike zone. */
  spread: number;
}

export type TankStage = 'planning' | 'resolving' | '';

export interface TankPlayerState {
  tank: TankId;
  x: number;
  y: number;
  /** Radians, clockwise; tanks tumble and rest on slopes. */
  angle: number;
  facing: number;
  health: number;
  maxHealth: number;
  shield: number;
  alive: boolean;
  confirmed: boolean;
  /** Remaining turns per action; missing or 0 means ready. */
  cooldowns: ReadonlyMap<string, number>;
  /** Pickup applied to the next attack: `damage`, `poison`, `freeze` or empty. */
  boost: string;
  poisonTurns: number;
  frozenTurns: number;
}

export interface TankArenaState {
  stage: TankStage;
  turn: number;
  deadline: number;
  serverNow: number;
  winnerId: string;
  map: string;
  /** JSON-encoded `Replay` of the last resolved turn. */
  replay: string;
  /** JSON-encoded `[x, y, r][]` craters carved so far. */
  craters: string;
  /** JSON-encoded `Pickup[]`. */
  pickups: string;
  /** JSON-encoded `Hazard` announced for this turn, or empty. */
  hazard: string;
  players: ReadonlyMap<string, TankPlayerState>;
}

export interface TankArenaRoomState extends LobbyState {
  /** Tank chosen by each lobby member. */
  loadouts: ReadonlyMap<string, string>;
  game: TankArenaState;
}

/** Degrees in screen space: 0 is right, -90 straight up. Power is 0.1–1. */
export interface TankPlan {
  action: ActionId;
  angle: number;
  power: number;
  turn: number;
}

export type TankArenaSend = (
  ...message:
    | ['ready' | 'spectate', boolean]
    | ['start' | 'return']
    | ['tank', TankId]
    | ['plan', TankPlan]
) => void;

export type PlanError =
  'not-playing' | 'stale-turn' | 'invalid-action' | 'cooldown' | 'frozen';

export const TRACK_STEP = 2;

/** Fractional point index of a track at tick `t` (clamped to its ends). */
function sampleIndex(track: ReplayTrack, t: number) {
  const last = track.pts.length / 2 - 1;
  const lastSampleTick = track.t0 + (last - 1) * TRACK_STEP;
  let index: number;
  if (t <= track.t0 || last <= 0) index = 0;
  else if (t >= track.t1) index = last;
  else if (t >= lastSampleTick)
    index =
      last - 1 + (t - lastSampleTick) / Math.max(1, track.t1 - lastSampleTick);
  else index = (t - track.t0) / TRACK_STEP;
  const from = Math.floor(index);
  return { from, to: Math.min(last, from + 1), f: index - from };
}

/** Position of a track at tick `t` (clamped to its ends), linearly interpolated. */
export function samplePath(track: ReplayTrack, t: number): [number, number] {
  const { from, to, f: fraction } = sampleIndex(track, t);
  // A jump this big between samples is a wrap across the arena edge: snap, don't streak.
  const f =
    Math.abs(track.pts[to * 2]! - track.pts[from * 2]!) > 400
      ? Math.round(fraction)
      : fraction;
  return [
    track.pts[from * 2]! + (track.pts[to * 2]! - track.pts[from * 2]!) * f,
    track.pts[from * 2 + 1]! +
      (track.pts[to * 2 + 1]! - track.pts[from * 2 + 1]!) * f,
  ];
}

/** Angle of a tank track at tick `t`, turning the short way between samples. */
export function sampleAngle(track: ReplayTrack, t: number): number {
  const angles = track.angles ?? [];
  const { from, to, f } = sampleIndex(track, t);
  const a = angles[from] ?? 0;
  const b = angles[to] ?? a;
  const turn = Math.atan2(Math.sin(b - a), Math.cos(b - a));
  return a + turn * f;
}
