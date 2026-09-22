/** World units are roughly CSS pixels at phone width; +y points down the screen. */
export interface Point {
  x: number;
  y: number;
}

export interface Bumper extends Point {
  r: number;
}

/** A pad that keeps pushing a ball rolling over it in (dx, dy), a unit vector. */
export interface Boost {
  x: number;
  y: number;
  w: number;
  h: number;
  dx: number;
  dy: number;
}

export interface Hole {
  name: string;
  par: number;
  /** The playing surface, walled all the way round. */
  outline: Point[];
  /** Free-standing walls inside the outline. */
  walls: [Point, Point][];
  bumpers: Bumper[];
  sand: Point[][];
  water: Point[][];
  boosts: Boost[];
  tee: Point;
  cup: Point;
}

const rect = (x0: number, y0: number, x1: number, y1: number): Point[] => [
  { x: x0, y: y0 },
  { x: x1, y: y0 },
  { x: x1, y: y1 },
  { x: x0, y: y1 },
];
const p = (x: number, y: number): Point => ({ x, y });
const wall = (
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): [Point, Point] => [p(x0, y0), p(x1, y1)];

const empty = { walls: [], bumpers: [], sand: [], water: [], boosts: [] };

/** Every hole, easiest first. Courses pick from these with `HOLE_SETS`. */
export const HOLES: readonly Hole[] = [
  {
    ...empty,
    name: 'First Putt',
    par: 2,
    outline: rect(90, 40, 270, 620),
    tee: p(180, 560),
    cup: p(180, 110),
  },
  {
    ...empty,
    name: 'Dogleg',
    par: 3,
    outline: [
      p(50, 40),
      p(310, 40),
      p(310, 230),
      p(190, 230),
      p(190, 620),
      p(50, 620),
    ],
    tee: p(120, 560),
    cup: p(255, 135),
  },
  {
    ...empty,
    name: 'Bumper Garden',
    par: 3,
    outline: rect(50, 40, 310, 620),
    bumpers: [
      { x: 110, y: 440, r: 16 },
      { x: 250, y: 440, r: 16 },
      { x: 180, y: 360, r: 16 },
      { x: 110, y: 280, r: 16 },
      { x: 250, y: 280, r: 16 },
      { x: 180, y: 200, r: 16 },
    ],
    tee: p(180, 570),
    cup: p(180, 110),
  },
  {
    ...empty,
    name: 'Sand Trap',
    par: 3,
    outline: rect(50, 40, 310, 620),
    walls: [wall(120, 390, 240, 390)],
    sand: [
      [p(100, 180), p(260, 180), p(280, 215), p(180, 245), p(80, 215)],
      rect(250, 470, 310, 560),
    ],
    tee: p(180, 570),
    cup: p(180, 120),
  },
  {
    ...empty,
    name: 'The Moat',
    par: 3,
    outline: rect(50, 40, 310, 620),
    water: [rect(50, 300, 155, 370), rect(205, 300, 310, 370)],
    tee: p(180, 570),
    cup: p(180, 110),
  },
  {
    ...empty,
    name: 'Boost Lane',
    par: 3,
    outline: rect(50, 30, 310, 640),
    walls: [wall(50, 260, 210, 260)],
    boosts: [{ x: 210, y: 360, w: 80, h: 70, dx: 0, dy: -1 }],
    water: [rect(230, 40, 310, 130)],
    tee: p(130, 580),
    cup: p(130, 130),
  },
  {
    ...empty,
    name: 'Zig-Zag',
    par: 4,
    outline: rect(50, 30, 310, 640),
    walls: [
      wall(50, 500, 230, 500),
      wall(130, 350, 310, 350),
      wall(50, 200, 230, 200),
    ],
    bumpers: [{ x: 270, y: 110, r: 14 }],
    tee: p(140, 590),
    cup: p(110, 100),
  },
  {
    ...empty,
    name: 'Island Green',
    par: 3,
    outline: rect(40, 30, 320, 630),
    water: [
      rect(80, 80, 125, 280),
      rect(235, 80, 280, 280),
      rect(125, 80, 235, 125),
      rect(125, 235, 160, 280),
      rect(200, 235, 235, 280),
    ],
    bumpers: [
      { x: 100, y: 420, r: 16 },
      { x: 260, y: 420, r: 16 },
    ],
    tee: p(180, 575),
    cup: p(180, 180),
  },
  {
    ...empty,
    name: 'Grand Finale',
    par: 4,
    outline: rect(40, 30, 320, 640),
    walls: [wall(40, 440, 150, 380), wall(320, 440, 210, 380)],
    boosts: [{ x: 150, y: 300, w: 60, h: 60, dx: 0, dy: -1 }],
    bumpers: [
      { x: 120, y: 200, r: 14 },
      { x: 240, y: 200, r: 14 },
    ],
    sand: [rect(40, 30, 110, 110), rect(250, 30, 320, 110)],
    water: [rect(40, 250, 95, 330), rect(265, 250, 320, 330)],
    tee: p(180, 590),
    cup: p(180, 90),
  },
];

/** Hole indices played for each course length, spread across the difficulty range. */
export const HOLE_SETS: Readonly<Record<3 | 6 | 9, readonly number[]>> = {
  3: [0, 4, 8],
  6: [0, 1, 2, 4, 7, 8],
  9: [0, 1, 2, 3, 4, 5, 6, 7, 8],
};
