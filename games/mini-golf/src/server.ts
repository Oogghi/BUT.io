import {
  HOLES,
  HOLE_BREAK_MS,
  HOLE_SETS,
  MAX_STROKES,
  PICKUP_SCORE,
  STEP,
  ShotSim,
  totalScore,
  type Hole,
  type MiniGolfError,
  type MiniGolfPlayer,
  type MiniGolfSettings,
  type MiniGolfStage,
  type ShotRecord,
} from './index.ts';

/** Time after a shot finishes on screen before the next player may aim. */
const SETTLE_MS = 800;

/** Shot inputs are rounded to this so the server and clients start from identical numbers. */
const round = (value: number) => Math.round(value * 1000) / 1000;

/**
 * One round of mini golf. Players take turns in lobby order; each hole's opener
 * rotates. The server simulates every shot to rest immediately, then holds the
 * `rolling` stage for as long as the shot takes to play back on screen.
 */
export class MiniGolfGame {
  readonly players = new Map<string, MiniGolfPlayer>();
  readonly order: string[];
  readonly holes: readonly number[];
  hole = 0;
  stage: MiniGolfStage = 'aiming';
  activePlayerId = '';
  deadline = 0;
  shotSeq = 0;
  shot: ShotRecord | null = null;
  notice = '';
  noticeSeq = 0;
  winnerId = '';
  ended = false;
  resultReason = '';
  private readonly startedWith: number;

  constructor(
    ids: readonly string[],
    private readonly settings: MiniGolfSettings,
    now: number,
  ) {
    this.order = [...ids];
    this.startedWith = ids.length;
    this.holes = HOLE_SETS[settings.holes];
    for (const id of ids)
      this.players.set(id, {
        x: 0,
        y: 0,
        onCourse: false,
        sunk: false,
        strokes: 0,
        scores: [],
        departed: false,
      });
    this.startHole(now);
  }

  get holeId() {
    return this.holes[this.hole]!;
  }

  get course(): Hole {
    return HOLES[this.holeId]!;
  }

  shoot(id: string, payload: unknown, now: number): MiniGolfError | null {
    if (this.ended || this.stage !== 'aiming') return 'not-aiming';
    if (id !== this.activePlayerId) return 'not-your-turn';
    const { dx, dy } = (payload ?? {}) as { dx?: unknown; dy?: unknown };
    if (
      typeof dx !== 'number' ||
      typeof dy !== 'number' ||
      !Number.isFinite(dx) ||
      !Number.isFinite(dy)
    )
      return 'invalid-shot';
    const length = Math.sqrt(dx * dx + dy * dy);
    if (length < 0.02) return 'invalid-shot';
    // Anything longer than 1 is full power; keep the direction exactly.
    const scale = length > 1 ? 1 / length : 1;
    const shot = { dx: round(dx * scale), dy: round(dy * scale) };

    const start = this.order
      .filter((playerId) => {
        const player = this.players.get(playerId)!;
        return !player.departed && !player.sunk;
      })
      .map((playerId) => {
        const player = this.players.get(playerId)!;
        return {
          id: playerId,
          x: player.x,
          y: player.y,
          onCourse: player.onCourse,
        };
      });
    const sim = new ShotSim(this.course, start, id, shot.dx, shot.dy);
    const steps = sim.run();
    for (const ball of sim.balls) {
      const player = this.players.get(ball.id)!;
      Object.assign(player, {
        x: ball.x,
        y: ball.y,
        onCourse: ball.onCourse,
        sunk: ball.sunk,
      });
    }
    const shooter = this.players.get(id)!;
    shooter.strokes += 1;
    // Only the shooter pays for water: a ball knocked in just goes back.
    if (sim.events.some((event) => event.kind === 'splash' && event.id === id))
      shooter.strokes += 1;

    this.shotSeq += 1;
    this.shot = { seq: this.shotSeq, playerId: id, ...shot, start };
    this.stage = 'rolling';
    this.deadline = now + steps * STEP * 1000 + SETTLE_MS;
    return null;
  }

  /** Runs whatever is due at `deadline`: a missed shot, the next turn, or the next hole. */
  advance(now: number) {
    if (this.ended || now < this.deadline) return;
    if (this.stage === 'aiming') {
      // Letting the clock run out costs a stroke; the ball stays where it is.
      const player = this.players.get(this.activePlayerId);
      if (player) player.strokes += 1;
      this.announce('timeout', this.activePlayerId);
      this.nextTurn(now);
    } else if (this.stage === 'rolling') {
      this.nextTurn(now);
    } else if (this.hole + 1 < this.holes.length) {
      this.hole += 1;
      this.startHole(now);
    } else {
      this.finish('finished');
    }
  }

  leave(id: string, now: number) {
    const player = this.players.get(id);
    if (!player || player.departed) return;
    player.departed = true;
    const remaining = this.order.filter(
      (playerId) => !this.players.get(playerId)!.departed,
    );
    if (!remaining.length || (this.startedWith > 1 && remaining.length === 1)) {
      this.winnerId = remaining[0] ?? '';
      this.ended = true;
      this.resultReason = 'departure';
      return;
    }
    if (this.activePlayerId === id && this.stage === 'aiming')
      this.nextTurn(now);
  }

  private startHole(now: number) {
    const { tee } = this.course;
    for (const player of this.players.values())
      Object.assign(player, {
        x: tee.x,
        y: tee.y,
        onCourse: false,
        sunk: false,
        strokes: 0,
      });
    this.shot = null;
    // The opener rotates each hole so nobody always tees off into a crowd.
    const opener = this.order.length
      ? this.order[this.hole % this.order.length]!
      : '';
    this.activePlayerId = '';
    this.beginTurn(this.playing(opener) ? opener : this.after(opener), now);
  }

  private nextTurn(now: number) {
    if (this.order.every((id) => !this.playing(id))) {
      this.endHole(now);
      return;
    }
    this.beginTurn(this.after(this.activePlayerId), now);
  }

  private beginTurn(id: string, now: number) {
    if (!id) return this.endHole(now);
    this.activePlayerId = id;
    this.stage = 'aiming';
    this.deadline = now + this.settings.shotSeconds * 1000;
  }

  /** The next player after `id` in lobby order who still has a ball to play. */
  private after(id: string) {
    const start = this.order.indexOf(id);
    for (let step = 1; step <= this.order.length; step++) {
      const candidate = this.order[(start + step) % this.order.length]!;
      if (this.playing(candidate)) return candidate;
    }
    return '';
  }

  private playing(id: string) {
    const player = this.players.get(id);
    return Boolean(
      player &&
      !player.departed &&
      !player.sunk &&
      player.strokes < MAX_STROKES,
    );
  }

  private endHole(now: number) {
    for (const player of this.players.values()) {
      if (player.departed) continue;
      player.scores.push(
        player.sunk ? Math.min(player.strokes, PICKUP_SCORE) : PICKUP_SCORE,
      );
    }
    this.activePlayerId = '';
    this.stage = 'hole-over';
    this.deadline = now + HOLE_BREAK_MS;
  }

  private finish(reason: string) {
    const standing = this.order
      .map((id) => ({ id, player: this.players.get(id)! }))
      .filter(({ player }) => !player.departed)
      .map(({ id, player }) => ({ id, total: totalScore(player) }))
      .sort((a, b) => a.total - b.total);
    const best = standing[0];
    const tied = standing.length > 1 && standing[1]!.total === best?.total;
    this.winnerId = best && !tied ? best.id : '';
    this.ended = true;
    this.resultReason = tied ? 'tie' : reason;
  }

  private announce(kind: string, id: string) {
    this.notice = `${kind}:${id}`;
    this.noticeSeq += 1;
  }
}
