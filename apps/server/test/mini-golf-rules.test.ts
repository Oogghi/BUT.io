import assert from 'node:assert/strict';
import test from 'node:test';
import {
  BALL_RADIUS,
  CUP_RADIUS,
  HOLES,
  MAX_STROKES,
  PICKUP_SCORE,
  ShotSim,
  inside,
  scoreName,
  totalScore,
  type Hole,
} from '@but/mini-golf';
import { MiniGolfGame } from '@but/mini-golf/server';

const tee = (hole: Hole, id = 'a') => [
  { id, x: hole.tee.x, y: hole.tee.y, onCourse: false },
];

/** Direction and power that roll a lone ball from the tee straight at the cup. */
function aimAtCup(hole: Hole, power: number) {
  const dx = hole.cup.x - hole.tee.x;
  const dy = hole.cup.y - hole.tee.y;
  const length = Math.sqrt(dx * dx + dy * dy);
  return { dx: (dx / length) * power, dy: (dy / length) * power };
}

test('every hole keeps full-power shots on the course in every direction', () => {
  for (const hole of HOLES) {
    for (let index = 0; index < 24; index++) {
      const angle = (index / 24) * Math.PI * 2;
      const sim = new ShotSim(
        hole,
        tee(hole),
        'a',
        Math.cos(angle),
        Math.sin(angle),
      );
      sim.run();
      const ball = sim.balls[0]!;
      assert.ok(
        ball.sunk || inside(ball, hole.outline),
        `${hole.name}: ball escaped at ${Math.round(ball.x)},${Math.round(ball.y)}`,
      );
      assert.ok(sim.done && ball.vx === 0 && ball.vy === 0);
    }
  }
});

test('the same shot replays to the same resting place', () => {
  const hole = HOLES[2]!;
  const run = () => {
    const sim = new ShotSim(hole, tee(hole), 'a', 0.31, -0.87);
    sim.run();
    return [sim.step, sim.balls[0]!.x, sim.balls[0]!.y];
  };
  assert.deepEqual(run(), run());
});

test('a well-judged straight putt drops, and a slam skips over the cup', () => {
  const hole = HOLES[0]!;
  const sinks = [0.4, 0.5, 0.6, 0.7].some((power) => {
    const { dx, dy } = aimAtCup(hole, power);
    const sim = new ShotSim(hole, tee(hole), 'a', dx, dy);
    sim.run();
    return sim.balls[0]!.sunk;
  });
  assert.ok(sinks, 'no straight putt sank on the first hole');
  // Full power rolls straight over the cup (it may drop on the rebound).
  const { dx, dy } = aimAtCup(hole, 1);
  const slam = new ShotSim(hole, tee(hole), 'a', dx, dy);
  let passed = false;
  while (!slam.done && !slam.balls[0]!.sunk) {
    slam.advance();
    if (slam.balls[0]!.y < hole.cup.y - CUP_RADIUS) passed = true;
  }
  assert.ok(passed, 'a full-power putt was captured on the way in');
});

test('water sends the ball back to where it was hit from', () => {
  const hole = HOLES.find((entry) => entry.name === 'The Moat')!;
  const start = { id: 'a', x: 100, y: 450, onCourse: true };
  const sim = new ShotSim(hole, [start], 'a', 0, -0.45);
  sim.run();
  assert.equal(sim.events[0]?.kind, 'splash');
  assert.deepEqual([sim.balls[0]!.x, sim.balls[0]!.y], [100, 450]);
});

test('a moving ball knocks a resting one', () => {
  const hole = HOLES[0]!;
  const sim = new ShotSim(
    hole,
    [
      { id: 'a', x: 180, y: 500, onCourse: true },
      { id: 'b', x: 180, y: 400, onCourse: true },
    ],
    'a',
    0,
    -0.4,
  );
  sim.run();
  const [a, b] = sim.balls;
  assert.ok(b!.y < 400 - BALL_RADIUS, 'the resting ball did not move');
  assert.ok(a!.y > b!.y);
});

test('score names follow golf', () => {
  assert.equal(scoreName(1, 3), 'hole-in-one');
  assert.equal(scoreName(2, 3), 'birdie');
  assert.equal(scoreName(3, 3), 'par');
  assert.equal(scoreName(5, 3), 'double-bogey');
  assert.equal(scoreName(PICKUP_SCORE, 3), 'picked-up');
});

test('turns alternate, sunk balls sit out, and the course ends with the lowest total', () => {
  const game = new MiniGolfGame(['a', 'b'], { holes: 3, shotSeconds: 20 }, 0);
  let now = 0;
  const hole = () => HOLES[game.holeId]!;
  assert.equal(game.activePlayerId, 'a');
  assert.equal(game.shoot('b', { dx: 0, dy: -0.5 }, now), 'not-your-turn');
  assert.equal(game.shoot('a', { dx: 0, dy: 0 }, now), 'invalid-shot');

  // a sinks the first hole in one; b then putts alone until done.
  const sank = [0.4, 0.45, 0.5, 0.55, 0.6, 0.65].find((power) => {
    const { dx, dy } = aimAtCup(hole(), power);
    const sim = new ShotSim(hole(), tee(hole()), 'a', dx, dy);
    sim.run();
    return sim.balls[0]!.sunk;
  })!;
  assert.equal(game.shoot('a', aimAtCup(hole(), sank), now), null);
  assert.equal(game.stage, 'rolling');
  assert.equal(game.players.get('a')!.sunk, true);
  now = game.deadline;
  game.advance(now);
  assert.equal(game.activePlayerId, 'b');

  // b lets the clock run out every turn: a stroke each, until picked up.
  for (let turn = 0; turn < MAX_STROKES; turn++) {
    assert.equal(game.activePlayerId, 'b');
    now = game.deadline;
    game.advance(now);
  }
  assert.equal(game.stage, 'hole-over');
  assert.deepEqual(game.players.get('a')!.scores, [1]);
  assert.deepEqual(game.players.get('b')!.scores, [PICKUP_SCORE]);

  // The next hole opens with the other player, on the next hole of the set.
  now = game.deadline;
  game.advance(now);
  assert.equal(game.hole, 1);
  assert.equal(game.activePlayerId, 'b');

  // b leaves; a two-player match ends with a as the winner.
  game.leave('b', now);
  assert.equal(game.ended, true);
  assert.equal(game.winnerId, 'a');
  assert.equal(totalScore(game.players.get('a')!), 1);
});

test('a solo course runs every hole and finishes', () => {
  const game = new MiniGolfGame(['a'], { holes: 3, shotSeconds: 20 }, 0);
  let now = 0;
  for (let guard = 0; guard < 100 && !game.ended; guard++) {
    now = game.deadline;
    game.advance(now);
  }
  assert.equal(game.ended, true);
  assert.equal(game.resultReason, 'finished');
  assert.deepEqual(game.players.get('a')!.scores, [
    PICKUP_SCORE,
    PICKUP_SCORE,
    PICKUP_SCORE,
  ]);
});
