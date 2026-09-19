import assert from 'node:assert/strict';
import test from 'node:test';
import {
  PLANNING_SECONDS,
  RANDOM_MAP_ID,
  iceMap,
  jungleMap,
  lavaMap,
  samplePath,
  validTankTeams,
  type TankId,
} from '@but/tank-arena';
import {
  BUBBLE_RADIUS,
  DT,
  GRAVITY,
  TANK_H,
  TANK_W,
  Terrain,
  insideTank,
  jumpPreview,
  shellPreview,
  stepBallistic,
  stepBubble,
  wrapDelta,
  wrapX,
} from '@but/tank-arena/physics';
import {
  selectMapId,
  Simulation,
  TankArenaGame,
  type Tank,
} from '@but/tank-arena/server';

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

test('map votes resolve a winner and tune map physics', () => {
  assert.equal(selectMapId(['ice', '']), 'ice');
  assert.equal(
    selectMapId(['ice', 'jungle'], () => 0),
    'ice',
  );
  assert.equal(
    selectMapId([RANDOM_MAP_ID], () => 0),
    'jungle',
  );
  assert.ok(iceMap.friction < jungleMap.friction);
  assert.ok(iceMap.craterMultiplier > jungleMap.craterMultiplier);
  assert.ok(lavaMap.gravity > jungleMap.gravity);
  assert.ok(lavaMap.friction > jungleMap.friction);
  assert.ok(lavaMap.craterMultiplier > 0);
  assert.ok(lavaMap.craterMultiplier < jungleMap.craterMultiplier);
});

test('team setup accepts arbitrary compositions instead of fixed presets', () => {
  const players = ['a', 'b', 'c', 'd', 'e'];
  assert.equal(
    validTankTeams(
      'teams',
      players,
      new Map([
        ['a', 'team-1'],
        ['b', 'team-1'],
        ['c', 'team-2'],
        ['d', 'team-2'],
        ['e', 'team-3'],
      ]),
      3,
    ),
    true,
  );
  assert.equal(
    validTankTeams(
      'teams',
      players,
      new Map([
        ['a', 'team-1'],
        ['b', 'team-1'],
        ['c', 'team-2'],
        ['d', 'team-2'],
        ['e', 'team-2'],
      ]),
      3,
    ),
    false,
    'every selected team needs a player',
  );
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

test('authoritative combat counters credit the firing tank', () => {
  const game = create(['viper', 'howler']);
  place(game, 'a', 400);
  place(game, 'b', 400 + TANK_W / 2 + 30);
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
    { kind: 'shell', damage: 200, radius: 60, knockback: 1, crater: 0 },
    'a',
    true,
  );
  assert.equal(tank(game, 'a').shotsHit, 1);
  assert.equal(tank(game, 'a').damageDealt, 150);
  assert.equal(tank(game, 'a').kills, 1);
  assert.equal(tank(game, 'b').deaths, 1);
});

test('team shots do not damage teammates', () => {
  const game = new TankArenaGame(
    [
      { id: 'a', tank: 'viper', team: 'team-1' },
      { id: 'b', tank: 'howler', team: 'team-1' },
    ],
    0,
  );
  place(game, 'a', 400);
  place(game, 'b', 400 + TANK_W / 2 + 30);
  const before = tank(game, 'b').health;
  new Simulation(
    game.terrain,
    [...game.players.values()],
    [],
    [],
    seeded(),
  ).explode(
    400,
    715,
    { kind: 'shell', damage: 100, radius: 100, knockback: 0, crater: 0 },
    'a',
  );
  assert.equal(tank(game, 'b').health, before);
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
  assert.ok(Math.abs(flung.y - 732) < 3, `rests on the floor, y=${flung.y}`);
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
  // Wide enough for the whole 120px box to drop through.
  game.terrain.carve(100, 780, 90);
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
  game.terrain.carve(tank(game, 'b').x, 780, 90);
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
  // Ready is final: a second plan in the same turn is rejected.
  assert.equal(
    game.plan('a', { action: 'missile', angle: -45, power: 0.8, turn: 1 }, 1),
    'locked',
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
  assert.ok(
    Math.abs(tank(game, 'a').y - (732 - TANK_H)) < 3,
    'rests on the roof',
  );
  tank(game, 'b').alive = false;
  push().run(new Map(), null);
  assert.ok(
    Math.abs(tank(game, 'a').y - 732) < 3,
    'drops once the tank below is gone',
  );
});

test('jump previews trace the free arc and stop at the first contact', () => {
  const terrain = new Terrain(jungleMap);
  // Straight up under the left platform (its underside is at y = 440).
  const bonk = jumpPreview(
    terrain,
    { x: 376, y: 732, angle: 0 },
    { vx: 0, vy: -1000 },
  );
  assert.ok(bonk.at(-1)! - TANK_H <= 444 && bonk.at(-1)! - TANK_H > 430);
  for (let index = 3; index < bonk.length; index += 2)
    assert.ok(bonk[index]! < bonk[index - 2]!, 'still rising when it stops');
});

test('a tank held by only one end tips off the edge; bridging a small hole is fine', () => {
  const game = create(['viper', 'howler']);
  const sim = () =>
    new Simulation(game.terrain, [...game.players.values()], [], [], seeded());
  // Left platform starts at x = 218 (top y = 396): the center hangs past the edge.
  Object.assign(tank(game, 'a'), { x: 205, y: 396, grounded: true });
  sim().run(new Map(), null);
  // It tips over the edge, tumbles, rights itself and rests upright on the floor.
  assert.ok(Math.abs(tank(game, 'a').y - 732) < 3, 'fell to the floor');
  assert.ok(Math.abs(tank(game, 'a').angle) < 0.05, 'upright again');
  assert.ok(tank(game, 'a').x < 218, 'fell off the platform side');

  // A narrow crater under the middle: both ends still hold it up.
  place(game, 'a', 900);
  game.terrain.carve(900, 740, 14);
  sim().run(new Map(), null);
  assert.equal(tank(game, 'a').y, 732, 'did not move');
});

test('rigid tanks settle tilted on slopes and spin when hit off-center', () => {
  const game = create(['viper', 'howler']);
  const sim = () =>
    new Simulation(game.terrain, [...game.players.values()], [], [], seeded());
  // A crater under the right half: the tank rolls in and rests leaning into it.
  game.terrain.carve(860, 760, 45);
  Object.assign(tank(game, 'a'), { x: 820, y: 700, grounded: false });
  sim().run(new Map(), null);
  assert.equal(tank(game, 'a').grounded, true);
  assert.ok(
    tank(game, 'a').angle > 0.1,
    `leans right: ${tank(game, 'a').angle}`,
  );

  // A blast under one end lifts it more than the other: it spins.
  place(game, 'b', 1300);
  Object.assign(tank(game, 'b'), { angle: 0, av: 0 });
  const blast = sim();
  blast.explode(
    1345,
    740,
    {
      kind: 'shell',
      damage: 0,
      radius: 90,
      knockback: 1,
      crater: 0,
    },
    'x',
  );
  assert.ok(
    tank(game, 'b').av < -0.2,
    `spins counter-clockwise: ${tank(game, 'b').av}`,
  );
});

test('Pulse Bomb is launched like a shell and blasts nearby tanks away', () => {
  const game = create(['howler', 'neon']);
  place(game, 'a', 300);
  place(game, 'b', 700);
  const pulse = new Simulation(
    game.terrain,
    [...game.players.values()],
    [],
    [],
    () => 0.5,
  );
  // A flat, gentle lob that lands just short of the Neon.
  const angle = -40;
  pulse.run(
    new Map([['a', { action: 'shockwave' as const, angle, power: 0.55 }]]),
    null,
  );
  assert.ok(pulse.tracks.some((track) => track.kind === 'pulse'));
  const blast = pulse.events.find((event) => event.type === 'explode');
  assert.ok(blast && blast.type === 'explode' && blast.r === 150);
  assert.equal(blast.crater, 0, 'no crater');
  assert.ok(
    Math.abs(tank(game, 'b').x - 700) > 40,
    `Neon was pushed: x=${tank(game, 'b').x}`,
  );
});

test('Spike Bubble bounces around, spikes tanks for 10 per touch, then pops', () => {
  const game = create(['neon', 'howler']);
  place(game, 'a', 400);
  place(game, 'b', 900);
  const bubble = new Simulation(
    game.terrain,
    [...game.players.values()],
    [],
    [],
    () => 0.5,
  );
  bubble.run(
    new Map([
      ['a', { action: 'spike-bubble' as const, angle: -15, power: 0.9 }],
    ]),
    null,
  );
  const hits = bubble.events.filter(
    (event) => event.type === 'damage' && event.id === 'b',
  );
  assert.ok(hits.length >= 1, 'touched the Howler');
  for (const hit of hits) assert.ok(hit.type === 'damage' && hit.amount === 10);
  assert.equal(tank(game, 'b').health, 150 - 10 * hits.length);
  assert.equal(tank(game, 'a').damageDealt, 10 * hits.length, 'credited');
  assert.deepEqual(
    bubble.events
      .filter((event) => event.type === 'bubble')
      .map((event) => event.type === 'bubble' && event.active),
    [true, false],
  );
  // Back to a normal tank: upright and resting.
  assert.equal(tank(game, 'a').bubbleTicks, 0);
  assert.equal(tank(game, 'a').grounded, true);
  assert.ok(Math.abs(tank(game, 'a').angle) < 0.05);
});

test('Spike Bubble bounces off the floor instead of stopping', () => {
  const terrain = new Terrain(jungleMap);
  const body = { x: 800, y: 600, vx: 0, vy: 600 };
  let bounces = 0;
  let lowest = 0;
  for (let tick = 0; tick < 90; tick++) {
    if (stepBubble(terrain.solid.bind(terrain), jungleMap.width, body))
      bounces++;
    lowest = Math.max(lowest, body.y);
  }
  assert.ok(bounces >= 2, `bounced ${bounces} times`);
  assert.ok(lowest <= 733 - BUBBLE_RADIUS + 3, 'never sank into the floor');
});
