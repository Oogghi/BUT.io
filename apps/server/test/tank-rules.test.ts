import assert from 'node:assert/strict';
import test from 'node:test';
import {
  PLANNING_SECONDS,
  jungleMap,
  samplePath,
  type TankId,
} from '@but/tank-arena';
import {
  DT,
  GRAVITY,
  TANK_H,
  TANK_W,
  Terrain,
  insideTank,
  jumpPreview,
  restingTilt,
  shellPreview,
  stepBallistic,
  wrapDelta,
  wrapX,
} from '@but/tank-arena/physics';
import { Simulation, TankArenaGame, type Tank } from '@but/tank-arena/server';

function seeded(seed = 7) {
  return () => (seed = (seed * 16807) % 2147483647) / 2147483647;
}

function create(tanks: TankId[] = ['viper', 'howler'], random = seeded()) {
  return new TankArenaGame(
    tanks.map((tank, index) => ({ id: String.fromCharCode(97 + index), tank })),
    0,
    random,
  );
}

const hold = (turn: number) => ({ action: 'skip', angle: 0, power: 1, turn });

function tank(game: TankArenaGame, id: string): Tank {
  return game.players.get(id)!;
}

/** Moves a tank onto the floor at `x` (the floor top is y = 732). */
function place(game: TankArenaGame, id: string, x: number) {
  Object.assign(tank(game, id), { x, y: 732, grounded: true });
}

test('shells follow semi-implicit Euler ballistics exactly', () => {
  const body = { x: 100, y: 100, vx: 300, vy: -600 };
  for (let tick = 1; tick <= 30; tick++) {
    stepBallistic(body, () => false);
    assert.ok(Math.abs(body.x - (100 + 300 * DT * tick)) < 1e-9);
    const y =
      100 - 600 * DT * tick + (GRAVITY * DT * DT * tick * (tick + 1)) / 2;
    assert.ok(Math.abs(body.y - y) < 1e-6, `tick ${tick}`);
  }
});

test('shell previews stop on terrain and water', () => {
  const terrain = new Terrain(jungleMap);
  const down = shellPreview(terrain, { x: 100, y: 600 }, { vx: 0, vy: 10 });
  assert.ok(terrain.solid(down.at(-2)!, down.at(-1)!));
  assert.ok(Math.abs(down.at(-1)! - 733) < 3);
  terrain.carve(100, 760, 80);
  const sunk = shellPreview(terrain, { x: 100, y: 600 }, { vx: 0, vy: 10 });
  assert.ok(sunk.at(-1)! > jungleMap.waterY);
});

test('seats spread across spawns and stand on the terrain', () => {
  const game = create(['viper', 'howler']);
  assert.deepEqual(
    [...game.players.values()].map(({ x, y }) => [x, y]),
    [
      [100, 732],
      [1570, 732],
    ],
  );
  assert.equal(game.stage, 'planning');
  assert.equal(game.turn, 1);
  assert.equal(game.deadline, PLANNING_SECONDS * 1000);
});

test('explosion damage falls off with distance and shields absorb first', () => {
  const game = create(['viper', 'howler', 'neon']);
  place(game, 'a', 400);
  // The neighbor's box starts 30px from the blast, whatever the tank size.
  place(game, 'b', 400 + TANK_W / 2 + 30);
  place(game, 'c', 900);
  tank(game, 'b').shield = 10;
  const sim = new Simulation(
    game.terrain,
    [...game.players.values()],
    [],
    [],
    seeded(),
  );
  sim.explode(
    400,
    715,
    {
      kind: 'shell',
      damage: 40,
      radius: 60,
      knockback: 1,
      crater: 0,
    },
    'x',
  );
  // Direct hit: full damage. The neighbor takes 40 × (1 − 0.5 × 30/60) = 30.
  assert.equal(tank(game, 'a').health, 130 - 40);
  assert.equal(tank(game, 'b').shield, 0);
  assert.equal(tank(game, 'b').health, 150 - (30 - 10));
  assert.equal(tank(game, 'c').health, 110, 'out of range');
  const damage = sim.events.filter((event) => event.type === 'damage');
  assert.deepEqual(
    damage.map((event) => event.id),
    ['a', 'b'],
  );
});

test('knockback pushes away from the blast and throws light tanks further', () => {
  const game = create(['howler', 'neon']);
  place(game, 'a', 700);
  place(game, 'b', 1100);
  const sim = new Simulation(
    game.terrain,
    [...game.players.values()],
    [],
    [],
    seeded(),
  );
  const spec = {
    kind: 'shell' as const,
    damage: 1,
    radius: 80,
    knockback: 1,
    crater: 0,
  };
  sim.explode(660, 725, spec, 'x');
  sim.explode(1060, 725, spec, 'x');
  const heavy = tank(game, 'a');
  const light = tank(game, 'b');
  for (const body of [heavy, light]) {
    assert.ok(body.vx > 0, 'pushed right, away from the blast');
    assert.ok(body.vy < 0, 'lifted');
    assert.equal(body.grounded, false);
  }
  assert.ok(
    Math.hypot(light.vx, light.vy) > Math.hypot(heavy.vx, heavy.vy) * 1.5,
  );
});

test('the arena wraps: knocked-off tanks re-enter and blasts reach across the edge', () => {
  const game = create(['viper', 'neon']);
  place(game, 'a', 1000);
  place(game, 'b', 40);
  const sim = new Simulation(
    game.terrain,
    [...game.players.values()],
    [],
    [],
    seeded(),
  );
  const spec = {
    kind: 'shell' as const,
    damage: 10,
    radius: 80,
    knockback: 2.5,
    crater: 0,
  };
  // Flung off the left edge, the light tank comes back in from the right and lands.
  sim.explode(110, 720, spec, 'a');
  sim.run(new Map(), null);
  const flung = tank(game, 'b');
  assert.equal(flung.alive, true);
  assert.equal(flung.y, 732);
  assert.ok(
    flung.x > 300 && flung.x < 1000,
    `landed after wrapping, x=${flung.x}`,
  );

  // A blast just inside the right edge hits a tank just inside the left edge.
  place(game, 'b', 20);
  const before = flung.health;
  sim.explode(1660, 715, { ...spec, damage: 40, knockback: 0 }, 'a');
  assert.ok(flung.health < before);
  assert.equal(wrapDelta(1600, 1672), -72);
  assert.equal(wrapX(-10, 1672), 1662);
});

test('craters drop tanks into the water; eliminated tanks cannot act; last one wins', () => {
  const game = create(['viper', 'howler', 'neon']);
  const hold = (id: string) =>
    game.plan(
      id,
      { action: 'skip', angle: 0, power: 1, turn: game.turn },
      game.deadline - 1,
    );
  game.terrain.carve(100, 760, 70);
  for (const id of ['a', 'b', 'c']) hold(id);
  assert.equal(game.stage, 'resolving');
  assert.equal(
    tank(game, 'a').alive,
    false,
    'fell through the hole into the water',
  );
  assert.ok(
    game.replay!.events.some(
      (event) =>
        event.type === 'eliminated' &&
        event.id === 'a' &&
        event.cause === 'water',
    ),
  );
  assert.ok(
    game.replay!.tracks.some(
      (track) => track.kind === 'tank' && track.id === 'a',
    ),
  );

  game.update(game.deadline);
  assert.equal(game.stage, 'planning');
  assert.equal(hold('a'), 'not-playing');
  // Only the survivors are waited for.
  game.terrain.carve(tank(game, 'b').x, 760, 70);
  assert.equal(hold('b'), null);
  assert.equal(hold('c'), null);
  assert.equal(game.stage, 'resolving');
  game.update(game.deadline);
  assert.equal(game.ended, true);
  assert.equal(game.winnerId, 'c');
});

test('turn lifecycle: hidden plans, simultaneous resolution, timeout default, next turn', () => {
  const game = create(['viper', 'howler']);
  assert.equal(game.plan('a', { ...hold(2) }, 0), 'stale-turn');
  assert.equal(
    game.plan('a', { action: 'shockwave', angle: 0, power: 1, turn: 1 }, 0),
    'invalid-action',
    'not a Viper ability',
  );
  assert.equal(
    game.plan('a', { action: 'missile', angle: 0, power: 2, turn: 1 }, 0),
    'invalid-action',
  );
  assert.equal(
    game.plan('a', { action: 'jump', angle: -60, power: 0.8, turn: 1 }, 0),
    null,
  );
  assert.equal(tank(game, 'a').confirmed, true);
  assert.equal(game.stage, 'planning', 'waits for everyone');
  // Changing your mind before the turn locks is allowed.
  assert.equal(
    game.plan('a', { action: 'missile', angle: -45, power: 0.8, turn: 1 }, 1),
    null,
  );
  assert.equal(game.update(PLANNING_SECONDS * 1000 - 1), false);
  // Timeout: the unconfirmed tank skips; the confirmed one fires.
  assert.equal(game.update(PLANNING_SECONDS * 1000), true);
  assert.equal(game.stage, 'resolving');
  assert.deepEqual(
    game
      .replay!.events.filter((event) => event.type === 'fire')
      .map((event) => event.id),
    ['a'],
  );
  assert.equal(
    game.plan('b', hold(1), PLANNING_SECONDS * 1000),
    'not-playing',
    'locked while resolving',
  );
  const resolvedAt = PLANNING_SECONDS * 1000;
  assert.ok(game.deadline > resolvedAt + (game.replay!.ticks / 60) * 1000);
  game.update(game.deadline);
  assert.equal(game.stage, 'planning');
  assert.equal(game.turn, 2);
  assert.equal(tank(game, 'a').confirmed, false);
});

test('ability cooldowns and freeze restrict later plans', () => {
  const game = create(['viper', 'howler']);
  assert.equal(
    game.plan(
      'a',
      { action: 'toxic-shot', angle: -30, power: 0.5, turn: 1 },
      0,
    ),
    null,
  );
  assert.equal(game.plan('b', hold(1), 0), null);
  game.update(game.deadline);
  assert.equal(game.turn, 2);
  assert.equal(
    game.plan(
      'a',
      { action: 'toxic-shot', angle: -30, power: 0.5, turn: 2 },
      game.deadline - 1,
    ),
    'cooldown',
  );
  tank(game, 'b').frozenTurns = 1;
  assert.equal(
    game.plan(
      'b',
      { action: 'jump', angle: -80, power: 1, turn: 2 },
      game.deadline - 1,
    ),
    'frozen',
  );
  assert.equal(
    game.plan(
      'b',
      { action: 'missile', angle: -150, power: 1, turn: 2 },
      game.deadline - 1,
    ),
    null,
  );
});

test('identical inputs produce identical replays', () => {
  const run = () => {
    const game = create(['neon', 'viper', 'howler'], seeded(42));
    game.plan(
      'a',
      { action: 'triple-shot', angle: -40, power: 0.9, turn: 1 },
      0,
    );
    game.plan(
      'b',
      { action: 'cluster-bomb', angle: -140, power: 0.7, turn: 1 },
      0,
    );
    game.plan(
      'c',
      { action: 'big-shell', angle: -120, power: 0.85, turn: 1 },
      0,
    );
    return JSON.stringify([game.replay, [...game.players.values()]]);
  };
  assert.equal(run(), run());
});

test('replay tracks sample positions at their ticks and clamp to their ends', () => {
  const track = {
    kind: 'shell' as const,
    id: 'a',
    t0: 10,
    t1: 15,
    pts: [0, 0, 4, 2, 8, 4, 10, 5],
  };
  assert.deepEqual(samplePath(track, 0), [0, 0]);
  assert.deepEqual(samplePath(track, 11), [2, 1]);
  assert.deepEqual(samplePath(track, 14), [8, 4]);
  assert.deepEqual(samplePath(track, 15), [10, 5]);
  assert.deepEqual(samplePath(track, 99), [10, 5]);
});

test('departures can end the match', () => {
  const game = create(['viper', 'howler', 'neon']);
  game.plan('a', hold(1), 0);
  game.plan('b', hold(1), 0);
  game.leave('c', 1);
  assert.equal(
    game.stage,
    'resolving',
    'the remaining confirmed players resolve',
  );
  game.update(game.deadline);
  game.leave('b', game.deadline);
  assert.equal(game.ended, true);
  assert.equal(game.winnerId, 'a');
  assert.equal(game.resultReason, 'departure');
});

test('tanks collide: they stop against each other and can stand on a roof', () => {
  const game = create(['viper', 'howler']);
  const push = () =>
    new Simulation(game.terrain, [...game.players.values()], [], [], seeded());
  place(game, 'a', 400);
  place(game, 'b', 400 + TANK_W + 10);
  const shove = push();
  shove.explode(
    330,
    712,
    {
      kind: 'shell',
      damage: 0,
      radius: 90,
      knockback: 1,
      crater: 0,
    },
    'x',
  );
  shove.run(new Map(), null);
  assert.ok(
    tank(game, 'b').x - tank(game, 'a').x >= TANK_W - 1,
    `no overlap: ${tank(game, 'a').x} vs ${tank(game, 'b').x}`,
  );

  place(game, 'b', 800);
  Object.assign(tank(game, 'a'), {
    x: 800,
    y: 500,
    vx: 0,
    vy: 0,
    grounded: false,
  });
  push().run(new Map(), null);
  assert.equal(tank(game, 'a').y, 732 - TANK_H, 'rests on the roof');
  tank(game, 'b').alive = false;
  push().run(new Map(), null);
  assert.equal(tank(game, 'a').y, 732, 'drops once the tank below is gone');
});

test('jump previews trace the free arc and stop at the first contact', () => {
  const terrain = new Terrain(jungleMap);
  // Straight up under the left platform (its underside is at y = 440).
  const bonk = jumpPreview(terrain, { x: 376, y: 732 }, { vx: 0, vy: -1000 });
  assert.ok(bonk.at(-1)! - TANK_H <= 441 && bonk.at(-1)! - TANK_H > 430);
  for (let index = 3; index < bonk.length; index += 2)
    assert.ok(bonk[index]! < bonk[index - 2]!, 'still rising when it stops');
});

test('resting tanks lean on craters and on other tanks', () => {
  const terrain = new Terrain(jungleMap);
  const floor = (x: number, y: number) => terrain.solid(x, y);
  assert.equal(restingTilt(floor, 800, 732), 0, 'flat floor');
  // A crater under the right end of the tracks tips the tank to the right.
  terrain.carve(855, 745, 30);
  assert.ok(restingTilt(floor, 800, 732) > 0.1);
  // Half on another tank's roof: the free end hangs down.
  const roof = { x: 1200, y: 732 };
  const withTank = (x: number, y: number) =>
    terrain.solid(x, y) || insideTank(roof, x, y, jungleMap.width);
  assert.ok(restingTilt(withTank, 1200 + TANK_W / 2, 732 - TANK_H) > 0.2);
});

test('a tank held by only one end tips off the edge; bridging a small hole is fine', () => {
  const game = create(['viper', 'howler']);
  const sim = () =>
    new Simulation(game.terrain, [...game.players.values()], [], [], seeded());
  // Left platform starts at x = 218 (top y = 396): the center hangs past the edge.
  Object.assign(tank(game, 'a'), { x: 205, y: 396, grounded: true });
  sim().run(new Map(), null);
  assert.equal(tank(game, 'a').y, 732, 'fell to the floor');
  assert.ok(tank(game, 'a').x < 205, 'slid away from the edge');

  // A narrow crater under the middle: both ends still hold it up.
  place(game, 'a', 900);
  game.terrain.carve(900, 740, 14);
  sim().run(new Map(), null);
  assert.equal(tank(game, 'a').y, 732);
});
