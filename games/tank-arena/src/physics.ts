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
/** Half-width of the footprint that must rest on ground; tanks tip off edges beyond it. */
export const FOOT = 30;
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

/** Where shells leave the barrel of a tank standing with its feet at (x, y). */
export function muzzle(x: number, y: number, angle: number) {
  const radians = toRadians(angle);
  return {
    x: x + Math.cos(radians) * 60,
    y: y - TANK_H * 0.6 + Math.sin(radians) * 60,
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

export interface TankBody extends Ballistic {
  grounded: boolean;
}

/** Whether a point is solid for a moving tank: the terrain, plus other tanks in the simulation. */
export type Solid = (x: number, y: number) => boolean;

/** Whether (x, y) lies inside a tank's box; feet sit on its bottom edge at `tank.y`. */
export function insideTank(
  tank: { x: number; y: number },
  x: number,
  y: number,
  width: number,
) {
  return (
    Math.abs(wrapDelta(x - tank.x, width)) < TANK_W / 2 &&
    y >= tank.y - TANK_H &&
    y < tank.y
  );
}

/**
 * Whether a tank standing with its feet at `y` stays put: its middle (center of mass) is
 * held, or both ends of its footprint are (bridging a small hole). A tank held by only one
 * end hangs over an edge and tips off.
 */
export function supported(solid: Solid, x: number, y: number) {
  return (
    solid(x - 10, y) ||
    solid(x + 10, y) ||
    (solid(x - FOOT, y) && solid(x + FOOT, y))
  );
}

/** Horizontal speed a tank tipping off an edge falls away with (0 if none is held). */
export function tipSpeed(solid: Solid, x: number, y: number) {
  if (solid(x + FOOT, y)) return -150;
  if (solid(x - FOOT, y)) return 150;
  return 0;
}

/**
 * Angle (radians, positive = right end lower) a resting tank leans at: the slope between the
 * surfaces under the two ends of its tracks, searched a little above and below its feet.
 * Clamped to ±0.6 rad. Presentation only; collisions stay upright boxes.
 */
export function restingTilt(solid: Solid, x: number, y: number) {
  const surface = (px: number) => {
    for (let py = y - TANK_H / 2; py <= y + 48; py += 2)
      if (solid(px, py)) return py;
    return y + 48;
  };
  const half = TANK_W / 2 - 8;
  const tilt = Math.atan2(surface(x + half) - surface(x - half), half * 2);
  return Math.max(-0.6, Math.min(0.6, tilt));
}

function blockedSide(solid: Solid, x: number, y: number, dir: number) {
  const edge = x + (dir * TANK_W) / 2;
  return solid(edge, y - 8) || solid(edge, y - TANK_H + 6);
}

function blockedHead(solid: Solid, x: number, y: number) {
  return (
    solid(x - FOOT, y - TANK_H) ||
    solid(x, y - TANK_H) ||
    solid(x + FOOT, y - TANK_H)
  );
}

/**
 * One tick of an airborne tank (feet at y) in 1px sub-steps: walls and other tanks stop
 * horizontal motion, ceilings stop the rise, and touching ground (or a tank's roof) lands
 * it dead (Brawlbots tanks do not slide).
 */
export function stepTank(solid: Solid, width: number, body: TankBody) {
  body.vy += GRAVITY * DT;
  let dx = body.vx * DT;
  let dy = body.vy * DT;
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy))));
  dx /= steps;
  dy /= steps;
  for (let step = 0; step < steps; step++) {
    if (dx && blockedSide(solid, body.x + dx, body.y, Math.sign(dx))) {
      dx = 0;
      body.vx = 0;
    }
    body.x = wrapX(body.x + dx, width);
    if (dy > 0 && supported(solid, body.x, body.y + dy)) {
      // Surfaces sit on whole pixels and sub-steps move at most 1px: rest exactly on top.
      body.y = Math.floor(body.y + dy);
      body.vx = 0;
      body.vy = 0;
      body.grounded = true;
      return;
    }
    if (dy < 0 && blockedHead(solid, body.x, body.y + dy)) {
      dy = 0;
      body.vy = 0;
    }
    body.y += dy;
  }
}

/**
 * Predicted feet path of a jump: the free arc up to its first contact (ground, wall, ceiling
 * or another tank), as flattened points. It stops there rather than showing the aftermath.
 */
export function jumpPreview(
  terrain: Terrain,
  from: { x: number; y: number },
  velocity: { vx: number; vy: number },
  solid: Solid = (x, y) => terrain.solid(x, y),
  maxTicks = TICK_RATE * 4,
): number[] {
  const body = { ...from, ...velocity, grounded: false };
  const points = [body.x, body.y];
  for (let tick = 0; tick < maxTicks; tick++) {
    const vx = body.vx;
    const vy = body.vy + GRAVITY * DT;
    stepTank(solid, terrain.map.width, body);
    points.push(body.x, body.y);
    // Any change beyond gravity means the tank touched something.
    if (body.grounded || body.vx !== vx || body.vy !== vy) break;
    if (body.y > terrain.map.waterY) break;
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
