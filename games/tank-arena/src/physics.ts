import type { ArenaMap } from './index.js';

/** Fixed simulation step: every resolved turn is 60 ticks per second of replay. */
export const TICK_RATE = 60;
export const DT = 1 / TICK_RATE;
export const GRAVITY = 1250;
export const SHELL_SPEED = 1450;
/** Jump launch speed of a weightless tank; each unit of weight takes `JUMP_WEIGHT_COST` off. */
export const JUMP_SPEED = 1455;
export const JUMP_WEIGHT_COST = 6;
export const TANK_W = 120;
export const TANK_H = 64;
const CELL = 4;

/** The arena wraps horizontally: leaving one side re-enters from the other. */
export function wrapX(x: number, width: number) {
  return ((x % width) + width) % width;
}

/** Shortest horizontal offset across the wrapped arena. */
export function wrapDelta(dx: number, width: number) {
  return wrapX(dx + width / 2, width) - width / 2;
}

/** Destructible collision grid built from the map's solid rectangles. */
export class Terrain {
  readonly cols: number;
  readonly rows: number;
  readonly cells: Uint8Array;

  constructor(readonly map: ArenaMap) {
    this.cols = Math.ceil(map.width / CELL);
    this.rows = Math.ceil(map.height / CELL);
    this.cells = new Uint8Array(this.cols * this.rows);
    for (const [x, y, w, h] of map.solids)
      for (let row = Math.floor(y / CELL); row < (y + h) / CELL; row++)
        for (let col = Math.floor(x / CELL); col < (x + w) / CELL; col++)
          this.cells[row * this.cols + col] = 1;
  }

  solid(x: number, y: number): boolean {
    const col = Math.floor(wrapX(x, this.map.width) / CELL);
    const row = Math.floor(y / CELL);
    return (
      row >= 0 && row < this.rows && this.cells[row * this.cols + col] === 1
    );
  }

  /** Clears every cell whose center lies inside the circle (wrapping across the edges). */
  carve(x: number, y: number, r: number) {
    for (
      let row = Math.max(0, Math.floor((y - r) / CELL));
      row <= Math.min(this.rows - 1, Math.floor((y + r) / CELL));
      row++
    )
      for (
        let col = Math.floor((x - r) / CELL);
        col <= Math.floor((x + r) / CELL);
        col++
      ) {
        const dx = col * CELL + CELL / 2 - x;
        const dy = row * CELL + CELL / 2 - y;
        if (dx * dx + dy * dy <= r * r)
          this.cells[
            row * this.cols + (((col % this.cols) + this.cols) % this.cols)
          ] = 0;
      }
  }

  /** Top of the first solid cell at or below `fromY`, or null over a hole. */
  surfaceBelow(x: number, fromY: number): number | null {
    for (
      let row = Math.max(0, Math.floor(fromY / CELL));
      row < this.rows;
      row++
    )
      if (this.solid(x, row * CELL)) return row * CELL;
    return null;
  }
}

/**
 * Light tanks leap much higher: at full power, Neon (30) rises ~650px, Viper (55) ~500px
 * and Howler (80) ~380px, just enough to reach the floating platforms.
 */
export function jumpSpeed(weight: number) {
  return JUMP_SPEED - JUMP_WEIGHT_COST * weight;
}

export function toRadians(degrees: number) {
  return (degrees * Math.PI) / 180;
}

/** Jumps always leave the ground: the aim is kept in the upper half-plane. */
export function clampJumpAngle(angle: number) {
  if (angle > -10 && angle <= 90) return -10;
  if (angle > 90 || angle < -170) return -170;
  return angle;
}

export function launchVelocity(angle: number, power: number, speed: number) {
  const radians = toRadians(angle);
  return {
    vx: Math.cos(radians) * power * speed,
    vy: Math.sin(radians) * power * speed,
  };
}

/** Where shells leave the barrel: a turret-length from the tank's center, whatever its tilt. */
export function muzzle(tank: TankPose, angle: number) {
  const center = centerOf(tank);
  const radians = toRadians(angle);
  return {
    x: center.x + Math.cos(radians) * 60,
    y: center.y + Math.sin(radians) * 60,
  };
}

export interface Ballistic {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

/**
 * Advances a point body by one tick in ≤2px sub-steps. Stops at the first sub-step where
 * `hit` is true and returns true; the body is left at that point.
 */
export function stepBallistic(
  body: Ballistic,
  hit: (x: number, y: number) => boolean,
  wrapWidth = 0,
  gravity = GRAVITY,
): boolean {
  body.vy += gravity * DT;
  const dx = body.vx * DT;
  const dy = body.vy * DT;
  const steps = Math.max(1, Math.ceil(Math.hypot(dx, dy) / 2));
  for (let step = 0; step < steps; step++) {
    body.x += dx / steps;
    if (wrapWidth) body.x = wrapX(body.x, wrapWidth);
    body.y += dy / steps;
    if (hit(body.x, body.y)) return true;
  }
  return false;
}

/** A tank's placement: feet (bottom-center of its box) at (x, y), rotated by `angle` radians. */
export interface TankPose {
  x: number;
  y: number;
  angle: number;
}

/** A tank as a rigid body; `av` is its angular velocity (radians/s, clockwise on screen). */
export interface TankBody extends Ballistic, TankPose {
  av: number;
}

/** Whether a point is solid for a moving tank: the terrain, plus other tanks in the simulation. */
export type Solid = (x: number, y: number) => boolean;

const HALF_W = TANK_W / 2;
const HALF_H = TANK_H / 2;
/** Moment of inertia of a unit-mass box. */
const INERTIA = (TANK_W ** 2 + TANK_H ** 2) / 12;
const RESTITUTION = 0.15;
/** Slower impacts do not bounce, so resting tanks settle instead of jittering. */
const BOUNCE_SPEED = 80;
const FRICTION = 0.9;
/** Collision samples around the box, relative to its center (y down, before rotation). */
const SAMPLES: (readonly [number, number])[] = [];
for (let index = 0; index <= 8; index++) {
  const x = -HALF_W + (index * TANK_W) / 8;
  SAMPLES.push([x, HALF_H], [x, -HALF_H]);
}
for (const y of [-HALF_H / 2, 0, HALF_H / 2])
  SAMPLES.push([-HALF_W, y], [HALF_W, y]);
const PROBES = Array.from(
  { length: 8 },
  (_, index) =>
    [
      Math.cos((index * Math.PI) / 4) * 6,
      Math.sin((index * Math.PI) / 4) * 6,
    ] as const,
);

/** Center of mass (the middle of the box). */
export function centerOf(tank: TankPose) {
  return {
    x: tank.x + HALF_H * Math.sin(tank.angle),
    y: tank.y - HALF_H * Math.cos(tank.angle),
  };
}

/** A point relative to the tank's center, in the tank's own (unrotated) frame. */
function local(tank: TankPose, x: number, y: number, width: number) {
  const center = centerOf(tank);
  const dx = wrapDelta(x - center.x, width);
  const dy = y - center.y;
  const cos = Math.cos(tank.angle);
  const sin = Math.sin(tank.angle);
  return { x: dx * cos + dy * sin, y: -dx * sin + dy * cos, cos, sin };
}

/** Whether (x, y) lies inside a tank's (rotated) box. */
export function insideTank(
  tank: TankPose,
  x: number,
  y: number,
  width: number,
) {
  const point = local(tank, x, y, width);
  return Math.abs(point.x) <= HALF_W && Math.abs(point.y) <= HALF_H;
}

/**
 * Distance from (x, y) to a tank's box, and the nearest point of the box as an offset from
 * its center in world axes (where a blast's push lands, for spin).
 */
export function nearestOnTank(
  tank: TankPose,
  x: number,
  y: number,
  width: number,
) {
  const point = local(tank, x, y, width);
  const nx = Math.max(-HALF_W, Math.min(HALF_W, point.x));
  const ny = Math.max(-HALF_H, Math.min(HALF_H, point.y));
  return {
    distance: Math.hypot(point.x - nx, point.y - ny),
    rx: nx * point.cos - ny * point.sin,
    ry: nx * point.sin + ny * point.cos,
  };
}

/** Spin (angular velocity change) from an impulse (jx, jy) applied at offset (rx, ry). */
export function spinFrom(rx: number, ry: number, jx: number, jy: number) {
  return (rx * jy - ry * jx) / INERTIA;
}

/** Direction toward open space around a solid point: the contact normal. */
function normalAt(solid: Solid, x: number, y: number) {
  let nx = 0;
  let ny = 0;
  for (const [dx, dy] of PROBES)
    if (!solid(x + dx, y + dy)) {
      nx += dx;
      ny += dy;
    }
  const length = Math.hypot(nx, ny);
  return length ? { x: nx / length, y: ny / length } : { x: 0, y: -1 };
}

function applyImpulse(
  body: TankBody,
  rx: number,
  ry: number,
  jx: number,
  jy: number,
) {
  body.vx += jx;
  body.vy += jy;
  body.av += spinFrom(rx, ry, jx, jy);
}

/**
 * Bounce and friction at one contact, sharing the response between simultaneous contacts.
 * Returns false when the point is already separating (e.g. a tank lifting off the ground).
 */
function respond(
  body: TankBody,
  rx: number,
  ry: number,
  nx: number,
  ny: number,
  share: number,
) {
  let vx = body.vx - body.av * ry;
  let vy = body.vy + body.av * rx;
  const approach = vx * nx + vy * ny;
  if (approach >= 0) return false;
  const rn = rx * ny - ry * nx;
  const bounce = -approach > BOUNCE_SPEED ? RESTITUTION : 0;
  const normal = (-(1 + bounce) * approach) / (1 + (rn * rn) / INERTIA) / share;
  applyImpulse(body, rx, ry, normal * nx, normal * ny);
  vx = body.vx - body.av * ry;
  vy = body.vy + body.av * rx;
  const tx = -ny;
  const ty = nx;
  const rt = rx * ty - ry * tx;
  const slide = -(vx * tx + vy * ty) / (1 + (rt * rt) / INERTIA) / share;
  const friction = Math.max(
    -FRICTION * normal,
    Math.min(FRICTION * normal, slide),
  );
  applyImpulse(body, rx, ry, friction * tx, friction * ty);
  return true;
}

/**
 * Pushes the box out of whatever it overlaps and answers each contact. Returns whether it
 * collided: pushed into something, not merely resting against a surface it is leaving.
 */
function collide(
  solid: Solid,
  center: { x: number; y: number },
  body: TankBody,
) {
  let touched = false;
  for (let pass = 0; pass < 4; pass++) {
    const cos = Math.cos(body.angle);
    const sin = Math.sin(body.angle);
    const contacts: [number, number, number, number][] = [];
    let px = 0;
    let py = 0;
    for (const [lx, ly] of SAMPLES) {
      const rx = lx * cos - ly * sin;
      const ry = lx * sin + ly * cos;
      if (!solid(center.x + rx, center.y + ry)) continue;
      const normal = normalAt(solid, center.x + rx, center.y + ry);
      contacts.push([rx, ry, normal.x, normal.y]);
      px += normal.x;
      py += normal.y;
    }
    if (!contacts.length) break;
    const length = Math.hypot(px, py) || 1;
    center.x += px / length;
    center.y += py / length;
    for (const [rx, ry, nx, ny] of contacts)
      if (respond(body, rx, ry, nx, ny, contacts.length)) touched = true;
  }
  return touched;
}

/**
 * One tick of a tank as a rigid box: gravity, then sub-steps (at most 2px of travel each)
 * that move and rotate it and resolve contacts against `solid` with a little bounce and
 * strong friction. Returns whether it touched anything during the tick.
 */
export function stepTank(solid: Solid, width: number, body: TankBody): boolean {
  const reach = Math.hypot(body.vx, body.vy) + Math.abs(body.av) * HALF_W;
  const steps = Math.max(1, Math.ceil((reach * DT) / 2));
  const h = DT / steps;
  const center = centerOf(body);
  let touched = false;
  for (let step = 0; step < steps; step++) {
    body.vy += GRAVITY * h;
    center.x += body.vx * h;
    center.y += body.vy * h;
    body.angle += body.av * h;
    if (collide(solid, center, body)) touched = true;
  }
  body.angle = Math.atan2(Math.sin(body.angle), Math.cos(body.angle));
  body.x = wrapX(center.x - HALF_H * Math.sin(body.angle), width);
  body.y = center.y + HALF_H * Math.cos(body.angle);
  return touched;
}

/**
 * Whether a resting tank stays put: its center of mass lies over the span of the points it
 * rests on. A tank held by one end over an edge is not, and tips off.
 */
export function stable(solid: Solid, tank: TankPose) {
  const center = centerOf(tank);
  const cos = Math.cos(tank.angle);
  const sin = Math.sin(tank.angle);
  let left = Infinity;
  let right = -Infinity;
  for (const [lx, ly] of SAMPLES) {
    const rx = lx * cos - ly * sin;
    const ry = lx * sin + ly * cos;
    if (!solid(center.x + rx, center.y + ry + 3)) continue;
    left = Math.min(left, rx);
    right = Math.max(right, rx);
  }
  return left <= 2 && right >= -2;
}

/**
 * Predicted feet path of a jump: the free arc up to its first contact (ground, wall, ceiling
 * or another tank), as flattened points. It stops there rather than showing the aftermath.
 */
export function jumpPreview(
  terrain: Terrain,
  from: TankPose,
  velocity: { vx: number; vy: number },
  solid: Solid = (x, y) => terrain.solid(x, y),
  maxTicks = TICK_RATE * 4,
): number[] {
  const body: TankBody = { ...from, ...velocity, av: 0 };
  const points = [body.x, body.y];
  for (let tick = 0; tick < maxTicks; tick++) {
    const touched = stepTank(solid, terrain.map.width, body);
    points.push(body.x, body.y);
    if (touched || body.y > terrain.map.waterY) break;
  }
  return points;
}

/** Predicted shell path until it meets something solid or water, as flattened points. */
export function shellPreview(
  terrain: Terrain,
  from: { x: number; y: number },
  velocity: { vx: number; vy: number },
  solid: Solid = (x, y) => terrain.solid(x, y),
  maxTicks = TICK_RATE * 4,
): number[] {
  const body = { ...from, ...velocity };
  const points = [body.x, body.y];
  for (let tick = 0; tick < maxTicks; tick++) {
    const done = stepBallistic(
      body,
      (x, y) => solid(x, y) || y > terrain.map.waterY,
      terrain.map.width,
    );
    points.push(body.x, body.y);
    if (done) break;
  }
  return points;
}
