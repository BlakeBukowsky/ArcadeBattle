import type { ServerGameModule, MatchContext, GameInstance } from '@arcade-battle/shared';

const W = 800, H = 500;
const CAR_W = 12, CAR_H = 20;
const ACCEL = 0.12;
const BRAKE = 0.06;
const MAX_SPEED = 5;
const TURN_SPEED = 0.04;
const FRICTION = 0.98;
const DRIFT_FRICTION = 0.92;
const LAPS_TO_WIN = 3;
const TICK_RATE = 1000 / 60;

// Track defined as a series of waypoints forming a loop
// Cars must pass through checkpoints in order
interface Point { x: number; y: number; }

const TRACK_POINTS: Point[] = [
  { x: 400, y: 430 }, // start/finish (bottom center)
  { x: 650, y: 400 },
  { x: 720, y: 300 },
  { x: 700, y: 180 },
  { x: 600, y: 100 },
  { x: 400, y: 70 },
  { x: 200, y: 100 },
  { x: 100, y: 180 },
  { x: 80, y: 300 },
  { x: 150, y: 400 },
];
const TRACK_WIDTH = 60;
const NUM_CHECKPOINTS = TRACK_POINTS.length;

interface CarState {
  x: number; y: number; angle: number;
  speed: number; drifting: boolean;
  checkpoint: number; lap: number;
}

interface RacingState {
  players: { [id: string]: CarState };
  track: Point[];
  trackWidth: number;
  lapsToWin: number;
  canvasWidth: number; canvasHeight: number;
  winner: string | null;
}

function distToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.sqrt((px - ax) ** 2 + (py - ay) ** 2);
  let t = ((px - ax) * dx + (py - ay) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const projX = ax + t * dx, projY = ay + t * dy;
  return Math.sqrt((px - projX) ** 2 + (py - projY) ** 2);
}

function isOnTrack(x: number, y: number): boolean {
  for (let i = 0; i < TRACK_POINTS.length; i++) {
    const a = TRACK_POINTS[i];
    const b = TRACK_POINTS[(i + 1) % TRACK_POINTS.length];
    if (distToSegment(x, y, a.x, a.y, b.x, b.y) < TRACK_WIDTH) return true;
  }
  return false;
}

export const racingGame: ServerGameModule = {
  info: {
    id: 'racing',
    name: 'Racing',
    description: 'Top-down circuit racing',
    controls: 'W accelerate, S brake, A/D turn, Shift drift. First to 3 laps wins.',
    maxDuration: 120,
  },

  create(ctx: MatchContext): GameInstance {
    const [p1, p2] = ctx.players;
    let running = true;
    const inputs: { [id: string]: { accel: boolean; brake: boolean; left: boolean; right: boolean; drift: boolean } } = {
      [p1]: { accel: false, brake: false, left: false, right: false, drift: false },
      [p2]: { accel: false, brake: false, left: false, right: false, drift: false },
    };

    const startAngle = Math.atan2(TRACK_POINTS[1].y - TRACK_POINTS[0].y, TRACK_POINTS[1].x - TRACK_POINTS[0].x);

    const state: RacingState = {
      players: {
        [p1]: { x: TRACK_POINTS[0].x - 15, y: TRACK_POINTS[0].y, angle: startAngle, speed: 0, drifting: false, checkpoint: 0, lap: 0 },
        [p2]: { x: TRACK_POINTS[0].x + 15, y: TRACK_POINTS[0].y, angle: startAngle, speed: 0, drifting: false, checkpoint: 0, lap: 0 },
      },
      track: TRACK_POINTS,
      trackWidth: TRACK_WIDTH,
      lapsToWin: LAPS_TO_WIN,
      canvasWidth: W, canvasHeight: H,
      winner: null,
    };

    const interval = setInterval(() => {
      if (!running) return;

      for (const pid of ctx.players) {
        const car = state.players[pid];
        const inp = inputs[pid];

        // Acceleration
        if (inp.accel) car.speed = Math.min(MAX_SPEED, car.speed + ACCEL);
        if (inp.brake) car.speed = Math.max(-MAX_SPEED * 0.4, car.speed - BRAKE);

        // Turning (scales with speed)
        const turnAmount = TURN_SPEED * Math.min(1, Math.abs(car.speed) / 2);
        if (inp.left) car.angle -= turnAmount;
        if (inp.right) car.angle += turnAmount;

        // Drift
        car.drifting = inp.drift && Math.abs(car.speed) > 1;
        const fric = car.drifting ? DRIFT_FRICTION : FRICTION;
        car.speed *= fric;

        // Move
        car.x += Math.cos(car.angle) * car.speed;
        car.y += Math.sin(car.angle) * car.speed;

        // Off-track penalty
        if (!isOnTrack(car.x, car.y)) {
          car.speed *= 0.9;
        }

        // Keep in bounds
        car.x = Math.max(10, Math.min(W - 10, car.x));
        car.y = Math.max(10, Math.min(H - 10, car.y));

        // Checkpoint detection
        const nextCp = (car.checkpoint + 1) % NUM_CHECKPOINTS;
        const cp = TRACK_POINTS[nextCp];
        const dist = Math.sqrt((car.x - cp.x) ** 2 + (car.y - cp.y) ** 2);
        if (dist < TRACK_WIDTH * 1.2) {
          car.checkpoint = nextCp;
          if (nextCp === 0) {
            car.lap++;
            if (car.lap >= LAPS_TO_WIN) {
              running = false;
              state.winner = pid;
              ctx.emit('game:state', state);
              ctx.endRound(pid);
              return;
            }
          }
        }
      }

      ctx.emit('game:state', state);
    }, TICK_RATE);

    return {
      onPlayerInput(playerId: string, data: unknown): void {
        const input = data as { accel?: boolean; brake?: boolean; left?: boolean; right?: boolean; drift?: boolean };
        const inp = inputs[playerId];
        if (!inp) return;
        if (input.accel !== undefined) inp.accel = input.accel;
        if (input.brake !== undefined) inp.brake = input.brake;
        if (input.left !== undefined) inp.left = input.left;
        if (input.right !== undefined) inp.right = input.right;
        if (input.drift !== undefined) inp.drift = input.drift;
      },
      getState() { return state; },
      cleanup(): void { running = false; clearInterval(interval); },
    };
  },
};
