import {
  TRACK_STEP,
  actions,
  tanks,
  type ActionId,
  type EliminationCause,
  type Hazard,
  type Pickup,
  type ReplayEvent,
  type ReplayTrack,
  type ReplayTrackKind,
  type TankId,
} from './index.js';
import {
  SHELL_SPEED,
  TANK_H,
  TANK_W,
  TICK_RATE,
  clampJumpAngle,
  jumpSpeed,
  launchVelocity,
  muzzle,
  stepBallistic,
  centerOf,
  insideTank,
  nearestOnTank,
  spinFrom,
  stable,
  stepTank,
  wrapDelta,
  type Solid,
  type Terrain,
} from './physics.js';

/** Authoritative tank state, mutated in place by the simulation. */
export interface Tank {
  id: string;
  tank: TankId;
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Radians, clockwise on screen. */
  angle: number;
  /** Angular velocity, radians/s. */
  av: number;
  /** Resting: no longer simulated until it becomes unstable or is pushed. */
  grounded: boolean;
  /** Consecutive calm ticks in contact; the tank rests after `SETTLE_TICKS`. */
  calm: number;
  facing: number;
  health: number;
  maxHealth: number;
  shield: number;
  alive: boolean;
  confirmed: boolean;
  cooldowns: Map<ActionId, number>;
  boost: '' | 'damage' | 'poison' | 'freeze';
  poisonTurns: number;
  frozenTurns: number;
}

export interface Intent {
  action: ActionId;
  angle: number;
  power: number;
}

export interface ShellSpec {
  kind: ReplayTrackKind;
  damage: number;
  radius: number;
  /** Multiplier of the base knockback speed. */
  knockback: number;
  crater: number;
  effect?: 'poison' | 'freeze';
  /** Bomblets released on impact. */
  split?: { count: number; spec: ShellSpec };
}

interface Shell {
  spec: ShellSpec;
  owner: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  track: ReplayTrack;
}

const KNOCKBACK = 650;
/** Share of a blast's off-center push that becomes spin. */
const BLAST_SPIN = 0.35;
const SETTLE_TICKS = 8;
/** A tank resting past this tilt (on its side or roof) hops back upright. */
const RIGHTING_ANGLE = 1.1;
const POISON_DAMAGE = 8;
const MAX_TICKS = TICK_RATE * 20;
/** Shells ignore their own tank for this many ticks after leaving the barrel. */
const ARMING_TICKS = 6;

function baseShell(tank: Tank): ShellSpec {
  const damage = tanks[tank.tank].damage;
  return { kind: 'shell', damage, radius: 55, knockback: 1, crater: 40 };
}

function scaled(spec: ShellSpec, scale: number): ShellSpec {
  return {
    ...spec,
    damage: spec.damage * scale,
    radius: spec.radius * scale,
    crater: spec.crater * scale,
  };
}

type Behavior = (sim: Simulation, tank: Tank, intent: Intent) => void;

/** What each action does when a turn resolves. Tanks reference these by id. */
const behaviors: Record<ActionId, Behavior> = {
  skip: () => {},
  jump: (sim, tank, intent) => sim.leap(tank, intent, actions.jump.speed),
  missile: (sim, tank, intent) => sim.fire(tank, intent, baseShell(tank), 1),
  'big-shell': (sim, tank, intent) => {
    const spec = baseShell(tank);
    sim.fire(
      tank,
      intent,
      {
        ...spec,
        damage: spec.damage * 1.6,
        radius: spec.radius * 1.5,
        crater: spec.crater * 1.5,
        knockback: 1.3,
      },
      actions['big-shell'].speed,
    );
  },
  'triple-shot': (sim, tank, intent) => {
    const spec = {
      ...scaled(baseShell(tank), 0.8),
      damage: tanks[tank.tank].damage * 0.5,
    };
    for (const offset of [-6, 0, 6])
      sim.fire(tank, { ...intent, angle: intent.angle + offset }, spec, 1);
  },
  'cluster-bomb': (sim, tank, intent) => {
    const spec = baseShell(tank);
    sim.fire(
      tank,
      intent,
      {
        ...spec,
        damage: spec.damage * 0.6,
        split: {
          count: 5,
          spec: {
            ...scaled(spec, 0.6),
            kind: 'bomblet',
            damage: spec.damage * 0.35,
          },
        },
      },
      actions['cluster-bomb'].speed,
    );
  },
  'toxic-shot': (sim, tank, intent) => {
    const spec = baseShell(tank);
    sim.fire(
      tank,
      intent,
      { ...spec, kind: 'toxic', damage: spec.damage * 0.6, effect: 'poison' },
      1,
    );
  },
  shockwave: (sim, tank) =>
    sim.explode(
      centerOf(tank).x,
      centerOf(tank).y,
      sim.boosted(tank, {
        kind: 'shell',
        damage: tanks[tank.tank].damage * 0.5,
        radius: 150,
        knockback: 2,
        crater: 0,
      }),
      tank.id,
      true,
    ),
  'rocket-jump': (sim, tank, intent) => {
    sim.explode(
      tank.x,
      tank.y,
      {
        kind: 'shell',
        damage: tanks[tank.tank].damage * 0.35,
        radius: 90,
        knockback: 1.3,
        crater: 0,
      },
      tank.id,
      true,
    );
    sim.leap(tank, intent, actions['rocket-jump'].speed);
  },
};

/**
 * Resolves one turn: every intent launches on tick 0, then bodies move until the arena is
 * still, the announced hazard strikes, and poison ticks. Pure and deterministic given
 * `random`; the recorded tracks and events are what clients replay.
 */
export class Simulation {
  tick = 0;
  readonly events: ReplayEvent[] = [];
  readonly tracks: ReplayTrack[] = [];
  private shells: Shell[] = [];
  private pending: { at: number; shell: Shell }[] = [];
  private tankTracks = new Map<string, ReplayTrack>();

  constructor(
    private readonly terrain: Terrain,
    private readonly tanks: Tank[],
    private readonly pickups: Pickup[],
    private readonly craters: [number, number, number][],
    private readonly random: () => number,
  ) {}

  /** Returns the replay length in ticks. */
  run(intents: ReadonlyMap<string, Intent>, hazard: Hazard | null): number {
    for (const tank of this.tanks) {
      const intent = intents.get(tank.id);
      if (!tank.alive || !intent || intent.action === 'skip') continue;
      const info = actions[intent.action];
      if (info.aim !== 'none')
        tank.facing = Math.cos((intent.angle * Math.PI) / 180) < 0 ? -1 : 1;
      this.events.push({
        t: 0,
        type: 'fire',
        id: tank.id,
        action: intent.action,
      });
      behaviors[intent.action](this, tank, intent);
      if (!info.movement) tank.boost = '';
    }
    this.settle();
    if (hazard) {
      this.airstrike(hazard);
      this.settle();
    }
    this.poison();
    return this.tick + TICK_RATE / 2;
  }

  leap(tank: Tank, intent: Intent, scale: number) {
    const velocity = launchVelocity(
      clampJumpAngle(intent.angle),
      intent.power,
      jumpSpeed(tanks[tank.tank].weight) * scale,
    );
    tank.vx = velocity.vx;
    tank.vy = velocity.vy;
    tank.av = 0;
    this.unground(tank);
  }

  fire(tank: Tank, intent: Intent, spec: ShellSpec, speed: number) {
    const spread = (1 - tanks[tank.tank].accuracy) * 6;
    const angle = intent.angle + (this.random() * 2 - 1) * spread;
    const from = muzzle(tank, angle);
    const velocity = launchVelocity(angle, intent.power, SHELL_SPEED * speed);
    this.launch(this.boosted(tank, spec), tank.id, from, velocity, 0);
  }

  /** Applies (without consuming) the tank's pickup boost to an attack. */
  boosted(tank: Tank, spec: ShellSpec): ShellSpec {
    if (tank.boost === 'damage') return { ...spec, damage: spec.damage * 1.5 };
    if (tank.boost === 'poison' || tank.boost === 'freeze')
      return { ...spec, effect: tank.boost };
    return spec;
  }

  /** Shells hurt their own tank too; self-centered blasts pass `spareOwner`. */
  explode(
    x: number,
    y: number,
    spec: ShellSpec,
    owner: string,
    spareOwner = false,
  ) {
    const t = this.tick;
    this.events.push({
      t,
      type: 'explode',
      x: Math.round(x),
      y: Math.round(y),
      r: Math.round(spec.radius),
      crater: Math.round(spec.crater),
    });
    if (spec.crater > 0) {
      const crater: [number, number, number] = [
        Math.round(x),
        Math.round(y),
        Math.round(spec.crater),
      ];
      this.terrain.carve(...crater);
      this.craters.push(crater);
    }
    for (const tank of this.tanks) {
      if (!tank.alive || (spareOwner && tank.id === owner)) continue;
      // Distance to the nearest point of the tank's box, so big tanks are easy to hit.
      const width = this.terrain.map.width;
      const near = nearestOnTank(tank, x, y, width);
      const distance = near.distance;
      if (distance > spec.radius) continue;
      const falloff = 1 - (0.5 * distance) / spec.radius;
      this.damage(tank, Math.round(spec.damage * falloff));
      if (!tank.alive) continue;
      if (spec.effect === 'poison') {
        tank.poisonTurns = 3;
        this.events.push({
          t,
          type: 'status',
          id: tank.id,
          status: 'poisoned',
        });
      } else if (spec.effect === 'freeze') {
        tank.frozenTurns = 2;
        this.events.push({ t, type: 'status', id: tank.id, status: 'frozen' });
      }
      const center = centerOf(tank);
      let ux = wrapDelta(center.x - x, width);
      let uy = center.y - y;
      const length = Math.hypot(ux, uy);
      [ux, uy] = length < 1 ? [0, -1] : [ux / length, uy / length];
      // Blasts always lift a little, so knockback reads as a hop rather than a slide.
      uy = Math.min(uy, -0.4);
      const norm = Math.hypot(ux, uy);
      const speed =
        (KNOCKBACK * spec.knockback * falloff * 55) /
        (tanks[tank.tank].weight + 25);
      const jx = (ux / norm) * speed;
      const jy = (uy / norm) * speed;
      tank.vx += jx;
      tank.vy = Math.min(tank.vy, 0) + jy;
      // Hit off-center, the tank spins.
      tank.av += spinFrom(near.rx, near.ry, jx, jy) * BLAST_SPIN;
      this.unground(tank);
    }
    if (spec.split)
      for (let index = 0; index < spec.split.count; index++) {
        const angle = -150 + (index * 120) / Math.max(1, spec.split.count - 1);
        this.launch(
          spec.split.spec,
          owner,
          { x, y: y - 6 },
          launchVelocity(angle, 1, 420),
          ARMING_TICKS,
        );
      }
  }

  private launch(
    spec: ShellSpec,
    owner: string,
    from: { x: number; y: number },
    velocity: { vx: number; vy: number },
    age: number,
    at = this.tick,
  ) {
    const shell: Shell = {
      spec,
      owner,
      ...from,
      ...velocity,
      age,
      track: { kind: spec.kind, id: owner, t0: at, t1: at, pts: [] },
    };
    if (at > this.tick) this.pending.push({ at, shell });
    else this.start(shell);
  }

  private start(shell: Shell) {
    shell.track.pts.push(Math.round(shell.x), Math.round(shell.y));
    this.tracks.push(shell.track);
    this.shells.push(shell);
  }

  private unground(tank: Tank) {
    tank.grounded = false;
    tank.calm = 0;
    if (this.tankTracks.has(tank.id)) return;
    const track: ReplayTrack = {
      kind: 'tank',
      id: tank.id,
      t0: this.tick,
      t1: this.tick,
      pts: [Math.round(tank.x), Math.round(tank.y)],
      angles: [roundAngle(tank.angle)],
    };
    this.tankTracks.set(tank.id, track);
    this.tracks.push(track);
  }

  private endTrack(tank: Tank) {
    const track = this.tankTracks.get(tank.id);
    if (!track) return;
    this.tankTracks.delete(tank.id);
    finish(track, tank.x, tank.y, this.tick, tank.angle);
  }

  /** A calm tank either comes to rest or, if it ended up on its side, hops back upright. */
  private rest(tank: Tank) {
    tank.calm = 0;
    if (Math.abs(tank.angle) > RIGHTING_ANGLE) {
      tank.vx = 0;
      tank.vy = -450;
      // Turn back to level over the hop's ~0.7s flight.
      tank.av = -tank.angle / 0.7;
      return;
    }
    tank.grounded = true;
    tank.vx = 0;
    tank.vy = 0;
    tank.av = 0;
    this.endTrack(tank);
  }

  private quiet() {
    return (
      !this.shells.length &&
      !this.pending.length &&
      this.tanks.every(
        (tank) =>
          !tank.alive || (tank.grounded && stable(this.solidFor(tank), tank)),
      )
    );
  }

  /** Terrain plus every other living tank: tanks collide and can stand on each other. */
  private solidFor(tank: Tank): Solid {
    const width = this.terrain.map.width;
    return (x, y) =>
      this.terrain.solid(x, y) ||
      this.tanks.some(
        (other) =>
          other !== tank && other.alive && insideTank(other, x, y, width),
      );
  }

  private settle() {
    while (!this.quiet() && this.tick < MAX_TICKS) this.step();
  }

  private step() {
    this.tick += 1;
    const t = this.tick;
    for (const entry of this.pending.filter((entry) => entry.at <= t))
      this.start(entry.shell);
    this.pending = this.pending.filter((entry) => entry.at > t);

    for (const shell of [...this.shells]) {
      shell.age += 1;
      const hitTank = (x: number, y: number) =>
        this.tanks.some(
          (tank) =>
            tank.alive &&
            (tank.id !== shell.owner || shell.age > ARMING_TICKS) &&
            insideTank(tank, x, y, width),
        );
      const { waterY: water, width } = this.terrain.map;
      const hit = stepBallistic(
        shell,
        (x, y) => this.terrain.solid(x, y) || y > water || hitTank(x, y),
        width,
      );
      record(shell.track, shell.x, shell.y, t);
      if (!hit) continue;
      this.shells.splice(this.shells.indexOf(shell), 1);
      finish(shell.track, shell.x, shell.y, t);
      if (shell.y > water)
        this.events.push({ t, type: 'splash', x: Math.round(shell.x) });
      else if (hit) this.explode(shell.x, shell.y, shell.spec, shell.owner);
    }

    for (const tank of this.tanks) {
      if (!tank.alive) continue;
      const solid = this.solidFor(tank);
      // Resting tanks wake when what holds them changes (craters, a tank moving away).
      if (tank.grounded && !stable(solid, tank)) this.unground(tank);
      if (!tank.grounded) {
        const touched = stepTank(solid, this.terrain.map.width, tank);
        const track = this.tankTracks.get(tank.id);
        if (track) record(track, tank.x, tank.y, t, tank.angle);
        if (centerOf(tank).y > this.terrain.map.waterY) {
          this.events.push({ t, type: 'splash', x: Math.round(tank.x) });
          this.eliminate(tank, 'water');
          continue;
        }
        // Slow and in contact (a frame hovering after a contact still counts).
        const calm =
          (touched || tank.calm > 0) &&
          Math.hypot(tank.vx, tank.vy) < 45 &&
          Math.abs(tank.av) < 0.6;
        tank.calm = calm ? tank.calm + 1 : 0;
        if (tank.calm >= SETTLE_TICKS) this.rest(tank);
      }
      this.collect(tank);
    }
  }

  private collect(tank: Tank) {
    for (const pickup of [...this.pickups]) {
      const center = centerOf(tank);
      if (
        Math.abs(wrapDelta(pickup.x - center.x, this.terrain.map.width)) >
          TANK_W / 2 + 8 ||
        Math.abs(pickup.y - center.y) > TANK_H / 2 + 16
      )
        continue;
      this.pickups.splice(this.pickups.indexOf(pickup), 1);
      this.events.push({
        t: this.tick,
        type: 'pickup',
        id: tank.id,
        pickup: pickup.id,
        kind: pickup.kind,
      });
      if (pickup.kind === 'heal')
        tank.health = Math.min(tank.maxHealth, tank.health + 35);
      else if (pickup.kind === 'shield') tank.shield += 40;
      else if (pickup.kind === 'cooldown') tank.cooldowns.clear();
      else tank.boost = pickup.kind;
    }
  }

  private damage(
    tank: Tank,
    amount: number,
    cause: EliminationCause = 'health',
  ) {
    if (amount <= 0) return;
    const absorbed = Math.min(tank.shield, amount);
    tank.shield -= absorbed;
    tank.health = Math.max(0, tank.health - (amount - absorbed));
    this.events.push({
      t: this.tick,
      type: 'damage',
      id: tank.id,
      amount,
      health: tank.health,
      shield: tank.shield,
    });
    if (tank.health === 0) this.eliminate(tank, cause);
  }

  private eliminate(tank: Tank, cause: EliminationCause) {
    tank.alive = false;
    this.endTrack(tank);
    this.events.push({ t: this.tick, type: 'eliminated', id: tank.id, cause });
  }

  /** Five shells rain on the announced zone, left to right, after a short warning. */
  private airstrike(hazard: Hazard) {
    this.events.push({ t: this.tick, type: 'airstrike', x: hazard.x });
    for (let index = 0; index < 5; index++) {
      const x =
        hazard.x +
        ((index - 2) / 2) * hazard.spread +
        (this.random() * 2 - 1) * 20;
      this.launch(
        { kind: 'strike', damage: 22, radius: 60, knockback: 1.1, crater: 46 },
        '',
        { x, y: -60 },
        { vx: 0, vy: 450 },
        ARMING_TICKS,
        this.tick + 40 + index * 10,
      );
    }
  }

  private poison() {
    const poisoned = this.tanks.filter(
      (tank) => tank.alive && tank.poisonTurns > 0,
    );
    if (!poisoned.length) return;
    this.tick += TICK_RATE / 3;
    for (const tank of poisoned) {
      tank.poisonTurns -= 1;
      this.damage(tank, POISON_DAMAGE, 'poison');
    }
  }
}

function roundAngle(angle: number) {
  return Math.round(angle * 100) / 100;
}

function record(
  track: ReplayTrack,
  x: number,
  y: number,
  t: number,
  angle?: number,
) {
  if (t <= track.t0 || (t - track.t0) % TRACK_STEP !== 0) return;
  track.pts.push(Math.round(x), Math.round(y));
  if (angle !== undefined) track.angles?.push(roundAngle(angle));
}

/** Closes a track with its exact end point (see `samplePath`). */
function finish(
  track: ReplayTrack,
  x: number,
  y: number,
  t: number,
  angle?: number,
) {
  track.t1 = t;
  track.pts.push(Math.round(x), Math.round(y));
  if (angle !== undefined) track.angles?.push(roundAngle(angle));
}
