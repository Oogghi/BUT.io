import type { Hole, Point } from './holes.ts';

/**
 * Shot physics shared by the server (authoritative) and every client (playback).
 * Only +, -, *, / and Math.sqrt are used — all correctly rounded in every JS engine —
 * so a client replaying the server's shot from the same start lands on the same spot.
 */
export const STEP = 1 / 240;
export const BALL_RADIUS = 8;
export const CUP_RADIUS = 12;
/** Walls are drawn this thick, centred on their line; balls stop at the painted edge. */
export const WALL_WIDTH = 10;
export const MAX_SPEED = 820;
/** A shot that is somehow still rolling after 20 s stops where it is. */
export const MAX_STEPS = 240 * 20;

const GRASS_DECEL = 260;
const SAND_DECEL = 1100;
const BOOST_ACCEL = 1500;
const STOP_SPEED = 6;
/** Faster than this and the ball skips over the cup. */
const CAPTURE_SPEED = 430;
const FUNNEL_RADIUS = CUP_RADIUS * 2.2;
const FUNNEL_PULL = 600;
const WALL_BOUNCE = 0.72;
const BUMPER_BOUNCE = 1.08;
const BALL_BOUNCE = 0.92;

export interface BallStart {
  id: string;
  x: number;
  y: number;
  /** Balls still waiting to tee off are not on the course and touch nothing. */
  onCourse: boolean;
}

export interface SimBall {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  onCourse: boolean;
  sunk: boolean;
  /** Where the ball sat before this shot; water sends it back here. */
  startX: number;
  startY: number;
}

export interface SimEvent {
  step: number;
  id: string;
  kind: 'sunk' | 'splash';
  x: number;
  y: number;
}

type Segment = [Point, Point];
const segmentCache = new WeakMap<Hole, Segment[]>();
function segments(hole: Hole): Segment[] {
  let list = segmentCache.get(hole);
  if (!list) {
    list = hole.outline.map(
      (point, index) =>
        [point, hole.outline[(index + 1) % hole.outline.length]!] as Segment,
    );
    list.push(...hole.walls);
    segmentCache.set(hole, list);
  }
  return list;
}

/** Even-odd ray test; exact for the integer-cornered shapes courses use. */
export function inside(point: Point, polygon: readonly Point[]): boolean {
  let hit = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i]!;
    const b = polygon[j]!;
    if (
      a.y > point.y !== b.y > point.y &&
      point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x
    )
      hit = !hit;
  }
  return hit;
}

/**
 * The launch velocity for a shot input. `dx`/`dy` point where the ball goes and their
 * length (capped at 1) is the power; the server rounds them before anyone uses them.
 */
export function launch(dx: number, dy: number) {
  const length = Math.sqrt(dx * dx + dy * dy);
  if (!(length > 0)) return { vx: 0, vy: 0 };
  const speed = Math.min(1, length) * MAX_SPEED;
  return { vx: (dx / length) * speed, vy: (dy / length) * speed };
}

/** One shot, stepped at a fixed rate until every ball rests. */
export class ShotSim {
  readonly balls: SimBall[];
  readonly events: SimEvent[] = [];
  step = 0;
  done = false;

  constructor(
    readonly hole: Hole,
    starts: readonly BallStart[],
    shooterId: string,
    dx: number,
    dy: number,
  ) {
    const { vx, vy } = launch(dx, dy);
    this.balls = starts.map((start) => {
      const shooter = start.id === shooterId;
      return {
        id: start.id,
        x: start.x,
        y: start.y,
        vx: shooter ? vx : 0,
        vy: shooter ? vy : 0,
        onCourse: start.onCourse || shooter,
        sunk: false,
        startX: start.x,
        startY: start.y,
      };
    });
  }

  /** Runs the whole shot; returns the number of steps it took. */
  run() {
    while (!this.done) this.advance();
    return this.step;
  }

  advance() {
    if (this.done) return;
    this.step += 1;
    const live = this.balls.filter((ball) => ball.onCourse && !ball.sunk);
    for (const ball of live) this.move(ball);
    for (let i = 0; i < live.length; i++)
      for (let j = i + 1; j < live.length; j++)
        collideBalls(live[i]!, live[j]!);
    for (const ball of live) this.settle(ball);
    const moving = live.some(
      (ball) => !ball.sunk && (ball.vx !== 0 || ball.vy !== 0),
    );
    if (!moving || this.step >= MAX_STEPS) {
      for (const ball of this.balls) ball.vx = ball.vy = 0;
      this.done = true;
    }
  }

  private move(ball: SimBall) {
    const { hole } = this;
    let ax = 0;
    let ay = 0;
    for (const boost of hole.boosts) {
      if (
        ball.x >= boost.x &&
        ball.x <= boost.x + boost.w &&
        ball.y >= boost.y &&
        ball.y <= boost.y + boost.h
      ) {
        ax += boost.dx * BOOST_ACCEL;
        ay += boost.dy * BOOST_ACCEL;
      }
    }
    const cx = hole.cup.x - ball.x;
    const cy = hole.cup.y - ball.y;
    const toCup = Math.sqrt(cx * cx + cy * cy);
    let speed = Math.sqrt(ball.vx * ball.vx + ball.vy * ball.vy);
    // The green dips toward the cup, so slow balls close by curl in.
    if (toCup > 0 && toCup < FUNNEL_RADIUS && speed < CAPTURE_SPEED) {
      ax += (cx / toCup) * FUNNEL_PULL;
      ay += (cy / toCup) * FUNNEL_PULL;
    }
    if (ax !== 0 || ay !== 0 || speed !== 0) {
      ball.vx += ax * STEP;
      ball.vy += ay * STEP;
      speed = Math.sqrt(ball.vx * ball.vx + ball.vy * ball.vy);
      const decel = hole.sand.some((zone) => inside(ball, zone))
        ? SAND_DECEL
        : GRASS_DECEL;
      const slowed = Math.max(0, speed - decel * STEP);
      if (speed > 0) {
        ball.vx *= slowed / speed;
        ball.vy *= slowed / speed;
      }
      ball.x += ball.vx * STEP;
      ball.y += ball.vy * STEP;
    }

    // Walls and bumpers apply even at rest: another ball may have nudged this one in.
    const reach = BALL_RADIUS + WALL_WIDTH / 2;
    for (const [a, b] of segments(hole)) {
      const ex = b.x - a.x;
      const ey = b.y - a.y;
      const length = ex * ex + ey * ey;
      const t =
        length > 0
          ? Math.max(
              0,
              Math.min(1, ((ball.x - a.x) * ex + (ball.y - a.y) * ey) / length),
            )
          : 0;
      bounceOff(ball, a.x + ex * t, a.y + ey * t, reach, WALL_BOUNCE);
    }
    for (const bumper of hole.bumpers)
      bounceOff(
        ball,
        bumper.x,
        bumper.y,
        bumper.r + BALL_RADIUS,
        BUMPER_BOUNCE,
      );
  }

  /** Water and the cup act once the ball has moved and been pushed out of walls. */
  private settle(ball: SimBall) {
    const { hole } = this;
    if (hole.water.some((zone) => inside(ball, zone))) {
      this.events.push({
        step: this.step,
        id: ball.id,
        kind: 'splash',
        x: ball.x,
        y: ball.y,
      });
      ball.x = ball.startX;
      ball.y = ball.startY;
      ball.vx = ball.vy = 0;
      return;
    }
    const cx = hole.cup.x - ball.x;
    const cy = hole.cup.y - ball.y;
    const speed = Math.sqrt(ball.vx * ball.vx + ball.vy * ball.vy);
    if (cx * cx + cy * cy < CUP_RADIUS * CUP_RADIUS && speed < CAPTURE_SPEED) {
      ball.sunk = true;
      ball.x = hole.cup.x;
      ball.y = hole.cup.y;
      ball.vx = ball.vy = 0;
      this.events.push({
        step: this.step,
        id: ball.id,
        kind: 'sunk',
        x: ball.x,
        y: ball.y,
      });
      return;
    }
    const pushed = hole.boosts.some(
      (boost) =>
        ball.x >= boost.x &&
        ball.x <= boost.x + boost.w &&
        ball.y >= boost.y &&
        ball.y <= boost.y + boost.h,
    );
    const curling =
      cx * cx + cy * cy < FUNNEL_RADIUS * FUNNEL_RADIUS &&
      speed < CAPTURE_SPEED;
    if (speed < STOP_SPEED && !pushed && !curling) ball.vx = ball.vy = 0;
  }
}

/** Pushes the ball out to `reach` from (px, py) and reflects it if it was heading in. */
function bounceOff(
  ball: SimBall,
  px: number,
  py: number,
  reach: number,
  restitution: number,
) {
  const dx = ball.x - px;
  const dy = ball.y - py;
  const distance = Math.sqrt(dx * dx + dy * dy);
  if (distance >= reach || distance === 0) return;
  const nx = dx / distance;
  const ny = dy / distance;
  ball.x = px + nx * reach;
  ball.y = py + ny * reach;
  const along = ball.vx * nx + ball.vy * ny;
  if (along < 0) {
    ball.vx -= (1 + restitution) * along * nx;
    ball.vy -= (1 + restitution) * along * ny;
    // Bumpers add energy; never let that exceed a full-power shot.
    const speed = Math.sqrt(ball.vx * ball.vx + ball.vy * ball.vy);
    if (speed > MAX_SPEED) {
      ball.vx *= MAX_SPEED / speed;
      ball.vy *= MAX_SPEED / speed;
    }
  }
}

/** Equal-mass collision: separate the overlap, then trade momentum along the contact. */
function collideBalls(a: SimBall, b: SimBall) {
  if (a.sunk || b.sunk) return;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const distance = Math.sqrt(dx * dx + dy * dy);
  const reach = BALL_RADIUS * 2;
  if (distance >= reach) return;
  // Two balls on the exact same spot (both on the tee) separate sideways.
  const nx = distance > 0 ? dx / distance : 1;
  const ny = distance > 0 ? dy / distance : 0;
  const overlap = (reach - distance) / 2;
  a.x -= nx * overlap;
  a.y -= ny * overlap;
  b.x += nx * overlap;
  b.y += ny * overlap;
  const closing = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny;
  if (closing <= 0) return;
  const impulse = ((1 + BALL_BOUNCE) * closing) / 2;
  a.vx -= impulse * nx;
  a.vy -= impulse * ny;
  b.vx += impulse * nx;
  b.vy += impulse * ny;
}
