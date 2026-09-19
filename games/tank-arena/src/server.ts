import {
  PLANNING_SECONDS,
  actions,
  jungleMap,
  pickupKinds,
  tankActions,
  tanks,
  type ArenaMap,
  type Hazard,
  type Pickup,
  type PlanError,
  type Replay,
  type TankId,
  type TankStage,
} from './index.js';
import { TICK_RATE, Terrain } from './physics.js';
import { Simulation, type Intent, type Tank } from './sim.js';

export { Simulation, type Intent, type Tank } from './sim.js';

/** Pause after a replay before the next planning phase, so results can be read. */
const RESOLUTION_PAUSE_MS = 1200;
const MAX_PICKUPS = 2;

/**
 * Turn lifecycle: planning → (all confirmed or timeout) → resolving → planning … until one
 * tank remains. Pure: the caller supplies monotonic server time and schedules `update`
 * at `deadline`; only the room owns real timers.
 */
export class TankArenaGame {
  readonly players = new Map<string, Tank>();
  readonly terrain: Terrain;
  readonly craters: [number, number, number][] = [];
  readonly pickups: Pickup[] = [];
  private readonly intents = new Map<string, Intent>();
  private nextPickupId = 1;
  stage: TankStage = 'planning';
  turn = 0;
  deadline = 0;
  hazard: Hazard | null = null;
  replay: Replay | null = null;
  winnerId = '';
  ended = false;
  resultReason = '';

  constructor(
    entries: { id: string; tank: TankId }[],
    now: number,
    private readonly random: () => number = Math.random,
    readonly map: ArenaMap = jungleMap,
  ) {
    if (
      entries.length < 2 ||
      new Set(entries.map(({ id }) => id)).size !== entries.length
    )
      throw new Error('A match needs distinct players.');
    this.terrain = new Terrain(map);
    entries.forEach(({ id, tank }, seat) => {
      // Spread seats across the sorted spawn points so small matches start far apart.
      const spawn =
        map.spawns[
          Math.round(
            (seat * (map.spawns.length - 1)) / Math.max(1, entries.length - 1),
          )
        ]!;
      const x = spawn[0];
      this.players.set(id, {
        id,
        tank,
        x,
        y: this.terrain.surfaceBelow(x, spawn[1] - 20) ?? spawn[1],
        vx: 0,
        vy: 0,
        grounded: true,
        facing: x < map.width / 2 ? 1 : -1,
        health: tanks[tank].health,
        maxHealth: tanks[tank].health,
        shield: 0,
        alive: true,
        confirmed: false,
        cooldowns: new Map(),
        boost: '',
        poisonTurns: 0,
        frozenTurns: 0,
      });
    });
    this.beginPlanning(now);
  }

  /** Stores (or replaces) a player's hidden intent and marks them confirmed. */
  plan(id: string, value: unknown, now: number): PlanError | null {
    const player = this.players.get(id);
    if (this.ended || this.stage !== 'planning' || !player?.alive)
      return 'not-playing';
    if (!value || typeof value !== 'object' || Array.isArray(value))
      return 'invalid-action';
    const { action, angle, power, turn } = value as Record<string, unknown>;
    if (turn !== this.turn) return 'stale-turn';
    if (
      typeof action !== 'string' ||
      !(tankActions(player.tank) as string[]).includes(action) ||
      typeof angle !== 'number' ||
      !Number.isFinite(angle) ||
      angle < -180 ||
      angle > 180 ||
      typeof power !== 'number' ||
      !(power >= 0.1 && power <= 1)
    )
      return 'invalid-action';
    const info = actions[action as keyof typeof actions];
    if ((player.cooldowns.get(action as never) ?? 0) > 0) return 'cooldown';
    if (info.movement && player.frozenTurns > 0) return 'frozen';
    this.intents.set(id, { action: action as Intent['action'], angle, power });
    player.confirmed = true;
    this.update(now);
    return null;
  }

  /** Advances the phase when its condition is met; returns whether anything changed. */
  update(now: number): boolean {
    if (this.ended) return false;
    if (this.stage === 'planning') {
      const waiting = [...this.players.values()].some(
        (player) => player.alive && !player.confirmed,
      );
      if (waiting && now < this.deadline) return false;
      this.resolve(now);
      return true;
    }
    if (now < this.deadline) return false;
    if (!this.finishIfNeeded()) this.beginPlanning(now);
    return true;
  }

  leave(id: string, now: number) {
    const player = this.players.get(id);
    if (this.ended || !player?.alive) return;
    player.alive = false;
    this.intents.delete(id);
    // A departure mid-replay is settled when the replay ends; in planning it can end the
    // match now or let the remaining confirmed players resolve.
    if (this.stage === 'planning' && !this.finishIfNeeded('departure'))
      this.update(now);
  }

  private resolve(now: number) {
    const alive = [...this.players.values()].filter((player) => player.alive);
    const start = alive.map(({ id, x, y, health, shield }) => ({
      id,
      x,
      y,
      health,
      shield,
    }));
    for (const [id, intent] of this.intents) {
      const cooldown = actions[intent.action].cooldown;
      // +1 because every cooldown ticks down once at the end of this very turn.
      if (cooldown)
        this.players.get(id)!.cooldowns.set(intent.action, cooldown + 1);
    }
    const simulation = new Simulation(
      this.terrain,
      [...this.players.values()],
      this.pickups,
      this.craters,
      this.random,
    );
    const ticks = simulation.run(this.intents, this.hazard);
    this.replay = {
      turn: this.turn,
      ticks,
      start,
      tracks: simulation.tracks,
      events: simulation.events,
    };
    for (const player of this.players.values()) {
      player.confirmed = false;
      player.vx = 0;
      player.vy = 0;
      player.frozenTurns = Math.max(0, player.frozenTurns - 1);
      for (const [action, turns] of player.cooldowns)
        if (turns > 1) player.cooldowns.set(action, turns - 1);
        else player.cooldowns.delete(action);
    }
    this.settlePickups();
    this.intents.clear();
    this.hazard = null;
    this.stage = 'resolving';
    this.deadline = now + (ticks / TICK_RATE) * 1000 + RESOLUTION_PAUSE_MS;
  }

  private beginPlanning(now: number) {
    this.turn += 1;
    this.stage = 'planning';
    this.deadline = now + PLANNING_SECONDS * 1000;
    if (this.turn > 1) this.maybeSpawnPickup();
    // ponytail: flat 25% airstrike chance from turn 3; tune per map if it feels too random.
    if (this.turn >= 3 && this.random() < 0.25)
      this.hazard = {
        kind: 'airstrike',
        x: 150 + this.random() * (this.map.width - 300),
        spread: 150,
      };
  }

  private maybeSpawnPickup() {
    if (this.pickups.length >= MAX_PICKUPS || this.random() >= 0.6) return;
    for (let attempt = 0; attempt < 10; attempt++) {
      const x = 60 + this.random() * (this.map.width - 120);
      const y = this.terrain.surfaceBelow(x, 0);
      const crowded = [...this.players.values()].some(
        (player) => player.alive && Math.abs(player.x - x) < 70,
      );
      if (y === null || crowded) continue;
      this.pickups.push({
        id: this.nextPickupId++,
        kind: pickupKinds[Math.floor(this.random() * pickupKinds.length)]!,
        x: Math.round(x),
        y,
      });
      return;
    }
  }

  /** Pickups whose ground was blasted away drop to the next surface or sink. */
  private settlePickups() {
    for (const pickup of [...this.pickups]) {
      const y = this.terrain.surfaceBelow(pickup.x, pickup.y);
      if (y === null) this.pickups.splice(this.pickups.indexOf(pickup), 1);
      else pickup.y = y;
    }
  }

  private finishIfNeeded(reason = 'winner'): boolean {
    const alive = [...this.players.values()].filter((player) => player.alive);
    if (alive.length > 1) return false;
    this.ended = true;
    this.stage = '';
    this.winnerId = alive[0]?.id ?? '';
    this.resultReason = reason;
    this.deadline = 0;
    return true;
  }
}
