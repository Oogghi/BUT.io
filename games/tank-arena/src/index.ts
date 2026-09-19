import type { GameMetadata, LobbyState } from '@but/shared';

export const tankArena = {
  id: 'tank-arena',
  name: 'Tank Arena',
  minPlayers: 2,
  maxPlayers: 8,
} as const satisfies GameMetadata;

export type TankTeamMode = 'free-for-all' | 'teams';

export const tankTeamModes = {
  'free-for-all': {
    label: 'Free for all',
    minPlayers: tankArena.minPlayers,
    maxPlayers: tankArena.maxPlayers,
    sizes: null,
  },
  teams: {
    label: 'Teams',
    minPlayers: tankArena.minPlayers,
    maxPlayers: tankArena.maxPlayers,
    sizes: null,
  },
} as const satisfies Record<
  TankTeamMode,
  {
    label: string;
    minPlayers: number;
    maxPlayers: number;
    sizes: readonly number[] | null;
  }
>;

export const tankTeamModeIds = Object.keys(tankTeamModes) as TankTeamMode[];
export const tankTeamCounts = [2, 3, 4] as const;

export function isTankTeamMode(value: unknown): value is TankTeamMode {
  return typeof value === 'string' && Object.hasOwn(tankTeamModes, value);
}

export function tankTeamIds(mode: TankTeamMode, teamCount = 2): string[] {
  return mode === 'teams'
    ? Array.from({ length: teamCount }, (_, index) => `team-${index + 1}`)
    : [];
}

export function validTankTeams(
  mode: TankTeamMode,
  playerIds: readonly string[],
  teams: ReadonlyMap<string, string>,
  teamCount = 2,
): boolean {
  const expected = tankTeamModes[mode];
  if (
    playerIds.length < expected.minPlayers ||
    playerIds.length > expected.maxPlayers
  )
    return false;
  if (mode === 'free-for-all')
    return (
      new Set(playerIds.map((id) => teams.get(id))).size === playerIds.length
    );
  const teamIds = tankTeamIds(mode, teamCount);
  return (
    teamIds.length >= 2 &&
    playerIds.length >= teamIds.length &&
    playerIds.every((id) => teamIds.includes(teams.get(id) ?? '')) &&
    teamIds.every((teamId) => playerIds.some((id) => teams.get(id) === teamId))
  );
}

/** Seconds players get to pick an action; unconfirmed tanks skip the turn. */
export const PLANNING_SECONDS = 20;

export type ActionId =
  | 'skip'
  | 'jump'
  | 'missile'
  | 'shockwave'
  | 'big-shell'
  | 'triple-shot'
  | 'spike-bubble'
  | 'cluster-bomb'
  | 'toxic-shot';

export interface ActionInfo {
  /** Turns the action stays unavailable after use. */
  cooldown: number;
  /**
   * `jump` aims a leap, `shell` a projectile, `bubble` the tank itself as a bouncing
   * bubble; `none` needs no aim.
   */
  aim: 'jump' | 'shell' | 'bubble' | 'none';
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
  // Shown as "Pulse Bomb": a lobbed charge that blasts tanks away where it lands.
  shockwave: {
    cooldown: 3,
    aim: 'shell',
    speed: 0.9,
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
  // The tank rolls up in a spiked bubble that bounces off everything it meets.
  'spike-bubble': {
    cooldown: 3,
    aim: 'bubble',
    speed: 1,
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
    abilities: ['triple-shot', 'spike-bubble'],
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

/** Column/row positions in the generated 4×3 tank-arena icon atlas. */
export const tankIconSlots = {
  howler: [0, 0],
  neon: [1, 0],
  viper: [2, 0],
} as const satisfies Record<TankId, readonly [number, number]>;

/** Column/row positions in the generated action icon atlas; Hold uses its own asset. */
export const actionIconSlots: Partial<
  Record<ActionId, readonly [number, number]>
> = {
  missile: [0, 1],
  jump: [1, 1],
  shockwave: [2, 1],
  'big-shell': [3, 1],
  'triple-shot': [0, 2],
  'cluster-bomb': [2, 2],
  'toxic-shot': [3, 2],
};

/** Actions whose icon is its own image rather than an atlas cell. */
export const actionIconFiles: Partial<Record<ActionId, string>> = {
  skip: '/tank-arena/tank-arena-hold.png',
  'spike-bubble': '/tank-arena/tank-arena-bubble-spike.png',
};

/** The Spike Bubble art, also drawn around the tank while the bubble is active. */
export const BUBBLE_SPRITE = '/tank-arena/tank-arena-bubble-spike.png';

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

/** Column/row positions in the generated 3x2 pickup icon atlas. */
export const pickupIconSlots: Record<PickupKind, readonly [number, number]> = {
  heal: [0, 0],
  damage: [1, 0],
  cooldown: [2, 0],
  shield: [0, 1],
  poison: [1, 1],
  freeze: [2, 1],
};

/**
 * An arena. Adding one = art in `apps/web/public/tank-arena/` plus an entry here and in
 * `maps`: the lobby picker builds its card from `name`, `description`, `icon`,
 * `accent`, `stats` and the layered `background` + `terrain` art.
 */
export interface ArenaMap {
  id: string;
  name: string;
  /** One line for the picker, per UI language. */
  description: Readonly<{ en: string; fr: string }>;
  /** Name of a web `Icon` shown on the map card. */
  icon: string;
  /** CSS color that tints the map card. */
  accent: string;
  width: number;
  height: number;
  background: string;
  /** Destructible foreground art drawn over `solids`; craters erase it. */
  terrain: string;
  /** Tanks that sink below this line are eliminated. */
  waterY: number;
  /** Downward acceleration in px/s²; maps can make jumps feel heavier. */
  gravity: number;
  /** Solid rectangles `[x, y, width, height]` of the collision mask. */
  solids: readonly (readonly [number, number, number, number])[];
  /** Standing points `[x, y]` sorted by x; y is the surface under the tank. */
  spawns: readonly (readonly [number, number])[];
  /** Contact friction. Lower values make tanks slide farther after impacts. */
  friction: number;
  /** Multiplier applied to every explosion crater on this map. */
  craterMultiplier: number;
  stats: Readonly<{
    slippery: 1 | 2 | 3 | 4 | 5;
    destruction: 1 | 2 | 3 | 4 | 5;
    cover: 1 | 2 | 3 | 4 | 5;
  }>;
}

export const jungleMap: ArenaMap = {
  id: 'jungle',
  name: 'Jungle',
  description: {
    en: 'Classic cover, steady footing, and familiar angles.',
    fr: 'Des abris classiques, un sol stable et des angles familiers.',
  },
  icon: 'leaf',
  accent: '#45dcae',
  width: 1672,
  height: 941,
  background: '/tank-arena/jungle-background.jpg',
  terrain: '/tank-arena/jungle-terrain.png',
  waterY: 850,
  gravity: 1250,
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
  friction: 0.9,
  craterMultiplier: 1,
  stats: { slippery: 1, destruction: 3, cover: 4 },
};

export const iceMap: ArenaMap = {
  id: 'ice',
  name: 'Frostbite',
  description: {
    en: 'Low-friction ice and fragile shelves turn every shot into a slide.',
    fr: 'Glace glissante et corniches fragiles : chaque tir devient une glissade.',
  },
  icon: 'snowflake',
  accent: '#6cc4ff',
  width: 1672,
  height: 941,
  background: '/tank-arena/ice-background.png',
  terrain: '/tank-arena/ice-destroy.png',
  waterY: 850,
  gravity: 1250,
  solids: [
    [664, 55, 55, 371],
    [959, 55, 53, 371],
    [345, 356, 269, 124],
    [1071, 350, 252, 84],
    [0, 713, 774, 125],
    [918, 713, 754, 125],
  ],
  spawns: [
    [100, 713],
    [470, 356],
    [620, 713],
    [760, 713],
    [920, 713],
    [1160, 350],
    [1400, 713],
    [1570, 713],
  ],
  friction: 0.22,
  craterMultiplier: 1.45,
  stats: { slippery: 4, destruction: 5, cover: 3 },
};

export const lavaMap: ArenaMap = {
  id: 'lava',
  name: 'Lava',
  description: {
    en: 'Heavy gravity and hard volcanic rock make every landing dangerous.',
    fr: 'Une forte gravité et une roche volcanique solide rendent chaque atterrissage dangereux.',
  },
  icon: 'blast',
  accent: '#ff6b4a',
  width: 1672,
  height: 941,
  background: '/tank-arena/lava-background.png',
  terrain: '/tank-arena/lava-destroy.png',
  waterY: 850,
  gravity: 1800,
  // Stepped rectangles follow the supplied collision mask's two rock shelves and towers.
  solids: [
    [0, 700, 744, 140],
    [934, 700, 738, 140],
    [9, 660, 349, 40],
    [1313, 660, 359, 40],
    [36, 600, 189, 60],
    [1465, 600, 207, 60],
    [52, 520, 102, 80],
    [1506, 520, 166, 80],
    [59, 440, 96, 80],
    [1551, 440, 83, 80],
    [65, 420, 22, 20],
    [1572, 420, 58, 20],
  ],
  spawns: [
    [100, 700],
    [300, 700],
    [520, 700],
    [700, 700],
    [970, 700],
    [1180, 700],
    [1400, 700],
    [1570, 700],
  ],
  friction: 1.15,
  craterMultiplier: 0.55,
  stats: { slippery: 1, destruction: 2, cover: 4 },
};

export const maps: Record<string, ArenaMap> = {
  [jungleMap.id]: jungleMap,
  [iceMap.id]: iceMap,
  [lavaMap.id]: lavaMap,
};

export const mapIds = Object.keys(maps) as Array<keyof typeof maps>;
export const RANDOM_MAP_ID = 'random' as const;
export type ArenaMapId = keyof typeof maps;
export type MapVoteId = ArenaMapId | typeof RANDOM_MAP_ID;

export function isMapVoteId(value: unknown): value is MapVoteId {
  return (
    value === RANDOM_MAP_ID ||
    (typeof value === 'string' && Object.hasOwn(maps, value))
  );
}

export type ReplayTrackKind =
  'tank' | 'shell' | 'bomblet' | 'toxic' | 'strike' | 'pulse';

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
  | { t: number; type: 'airstrike'; x: number }
  | { t: number; type: 'bubble'; id: string; active: boolean };

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
  team: string;
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
  winnerTeam: string;
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
  teamMode: TankTeamMode;
  teamCount: number;
  /** Lobby assignments; the server validates capacities before starting. */
  teams: ReadonlyMap<string, string>;
  /** Tank chosen by each lobby member. */
  loadouts: ReadonlyMap<string, string>;
  /** Optional map vote by each lobby member. */
  mapVotes: ReadonlyMap<string, string>;
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
  | 'not-playing'
  | 'stale-turn'
  | 'invalid-action'
  | 'cooldown'
  | 'frozen'
  | 'locked';

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
