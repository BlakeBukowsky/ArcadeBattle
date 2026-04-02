import type { ServerGameModule, MatchContext, GameInstance } from '@arcade-battle/shared';

const W = 800, H = 500;
const TANK_W = 20, TANK_H = 24;
const TURN_SPEED = 0.05;
const MOVE_SPEED = 2.5;
const BULLET_SPEED = 5;
const BULLET_R = 5;
const FIRE_COOLDOWN = 800;
const MAX_BOUNCES = 2;
const TICK_RATE = 1000 / 60;

interface Wall { x: number; y: number; w: number; h: number; }

const BORDERS: Wall[] = [
  { x: 0, y: 0, w: W, h: 8 },
  { x: 0, y: H - 8, w: W, h: 8 },
  { x: 0, y: 0, w: 8, h: H },
  { x: W - 8, y: 0, w: 8, h: H },
];

const TANK_LAYOUTS: Wall[][] = [
  // Layout 0: Pillars & Cover
  [...BORDERS,
    { x: W / 2 - 6, y: 140, w: 12, h: 90 },
    { x: W / 2 - 6, y: H - 230, w: 12, h: 90 },
    { x: 260, y: H / 2 - 6, w: 90, h: 12 },
    { x: W - 350, y: H / 2 - 6, w: 90, h: 12 },
    { x: 100, y: 100, w: 50, h: 35 },
    { x: W - 150, y: 100, w: 50, h: 35 },
    { x: 100, y: H - 135, w: 50, h: 35 },
    { x: W - 150, y: H - 135, w: 50, h: 35 },
    { x: 200, y: 190, w: 30, h: 30 },
    { x: W - 230, y: 190, w: 30, h: 30 },
    { x: 200, y: H - 220, w: 30, h: 30 },
    { x: W - 230, y: H - 220, w: 30, h: 30 },
  ],
  // Layout 1: Cross
  [...BORDERS,
    { x: W / 2 - 6, y: 80, w: 12, h: 340 },
    { x: 150, y: H / 2 - 6, w: 200, h: 12 },
    { x: W - 350, y: H / 2 - 6, w: 200, h: 12 },
    { x: 120, y: 120, w: 40, h: 40 },
    { x: W - 160, y: 120, w: 40, h: 40 },
    { x: 120, y: H - 160, w: 40, h: 40 },
    { x: W - 160, y: H - 160, w: 40, h: 40 },
  ],
  // Layout 2: Corridors
  [...BORDERS,
    { x: 150, y: 100, w: 500, h: 12 },
    { x: 150, y: H - 112, w: 500, h: 12 },
    { x: 100, y: 200, w: 250, h: 12 },
    { x: W - 350, y: 200, w: 250, h: 12 },
    { x: 100, y: H - 212, w: 250, h: 12 },
    { x: W - 350, y: H - 212, w: 250, h: 12 },
    { x: W / 2 - 6, y: 180, w: 12, h: 60 },
    { x: W / 2 - 6, y: H - 240, w: 12, h: 60 },
  ],
  // Layout 3: Arena
  [...BORDERS,
    { x: W / 2 - 40, y: H / 2 - 40, w: 80, h: 80 },
    { x: 140, y: 60, w: 12, h: 100 },
    { x: W - 152, y: 60, w: 12, h: 100 },
    { x: 140, y: H - 160, w: 12, h: 100 },
    { x: W - 152, y: H - 160, w: 12, h: 100 },
    { x: 250, y: 140, w: 40, h: 12 },
    { x: W - 290, y: 140, w: 40, h: 12 },
    { x: 250, y: H - 152, w: 40, h: 12 },
    { x: W - 290, y: H - 152, w: 40, h: 12 },
  ],
];

interface Bullet {
  x: number; y: number;
  vx: number; vy: number;
  owner: string;
  bounces: number;
}

interface TankState {
  x: number; y: number;
  angle: number; // radians
  alive: boolean;
  lastFire: number;
}

interface TanksGameState {
  players: { [id: string]: TankState };
  bullets: Bullet[];
  walls: Wall[];
  canvasWidth: number;
  canvasHeight: number;
  winner: string | null;
}

function rectContainsPoint(rx: number, ry: number, rw: number, rh: number, px: number, py: number): boolean {
  return px >= rx && px <= rx + rw && py >= ry && py <= ry + rh;
}

function tankCorners(t: TankState): { x: number; y: number }[] {
  const cos = Math.cos(t.angle);
  const sin = Math.sin(t.angle);
  const hw = TANK_W / 2, hh = TANK_H / 2;
  const cx = t.x, cy = t.y;
  return [
    { x: cx + cos * hh - sin * hw, y: cy + sin * hh + cos * hw },
    { x: cx + cos * hh + sin * hw, y: cy + sin * hh - cos * hw },
    { x: cx - cos * hh - sin * hw, y: cy - sin * hh + cos * hw },
    { x: cx - cos * hh + sin * hw, y: cy - sin * hh - cos * hw },
  ];
}

function tankCollidesWall(t: TankState, walls: Wall[]): boolean {
  const corners = tankCorners(t);
  for (const wall of walls) {
    for (const c of corners) {
      if (rectContainsPoint(wall.x, wall.y, wall.w, wall.h, c.x, c.y)) return true;
    }
  }
  return false;
}

export const tanksGame: ServerGameModule = {
  info: {
    id: 'tanks',
    name: 'Tanks',
    description: 'Top-down tank arena',
    controls: 'W/S to move, A/D to turn, Space to fire. Bullets bounce off walls. First hit wins.',
    maxDuration: 60,
  },

  create(ctx: MatchContext): GameInstance {
    const [p1, p2] = ctx.players;
    let running = true;
    const inputs: { [id: string]: { forward: boolean; back: boolean; left: boolean; right: boolean; fire: boolean } } = {
      [p1]: { forward: false, back: false, left: false, right: false, fire: false },
      [p2]: { forward: false, back: false, left: false, right: false, fire: false },
    };

    const walls = TANK_LAYOUTS[Math.floor(Math.random() * TANK_LAYOUTS.length)];

    const state: TanksGameState = {
      players: {
        [p1]: { x: 60, y: H / 2, angle: 0, alive: true, lastFire: 0 },
        [p2]: { x: W - 60, y: H / 2, angle: Math.PI, alive: true, lastFire: 0 },
      },
      bullets: [],
      walls,
      canvasWidth: W,
      canvasHeight: H,
      winner: null,
    };

    const interval = setInterval(() => {
      if (!running) return;
      const now = Date.now();

      // Update tanks
      for (const pid of ctx.players) {
        const t = state.players[pid];
        if (!t.alive) continue;
        const inp = inputs[pid];

        // Turn
        if (inp.left) t.angle -= TURN_SPEED;
        if (inp.right) t.angle += TURN_SPEED;

        // Move
        if (inp.forward || inp.back) {
          const dir = inp.forward ? 1 : -0.6;
          const nx = t.x + Math.cos(t.angle) * MOVE_SPEED * dir;
          const ny = t.y + Math.sin(t.angle) * MOVE_SPEED * dir;

          // Try move, revert if collision
          const oldX = t.x, oldY = t.y;
          t.x = nx; t.y = ny;
          if (tankCollidesWall(t, walls)) {
            // Try sliding on each axis separately
            t.x = nx; t.y = oldY;
            if (tankCollidesWall(t, walls)) {
              t.x = oldX; t.y = ny;
              if (tankCollidesWall(t, walls)) {
                t.x = oldX; t.y = oldY;
              }
            }
          }
        }

        // Fire
        if (inp.fire) {
          inp.fire = false;
          if (now - t.lastFire >= FIRE_COOLDOWN) {
            t.lastFire = now;
            const tipDist = TANK_H / 2 + BULLET_R + 2;
            state.bullets.push({
              x: t.x + Math.cos(t.angle) * tipDist,
              y: t.y + Math.sin(t.angle) * tipDist,
              vx: Math.cos(t.angle) * BULLET_SPEED,
              vy: Math.sin(t.angle) * BULLET_SPEED,
              owner: pid,
              bounces: 0,
            });
          }
        }
      }

      // Update bullets
      state.bullets = state.bullets.filter((b) => {
        b.x += b.vx;
        b.y += b.vy;

        // Wall bounce
        for (const wall of walls) {
          if (rectContainsPoint(wall.x, wall.y, wall.w, wall.h, b.x, b.y)) {
            // Determine bounce axis — push out and reflect
            const fromLeft = b.x - wall.x;
            const fromRight = (wall.x + wall.w) - b.x;
            const fromTop = b.y - wall.y;
            const fromBottom = (wall.y + wall.h) - b.y;
            const minH = Math.min(fromLeft, fromRight);
            const minV = Math.min(fromTop, fromBottom);

            if (minH < minV) {
              b.vx = -b.vx;
              b.x += b.vx * 2;
            } else {
              b.vy = -b.vy;
              b.y += b.vy * 2;
            }

            b.bounces++;
            if (b.bounces > MAX_BOUNCES) return false;
            break;
          }
        }

        // Hit tank check
        for (const pid of ctx.players) {
          if (pid === b.owner && b.bounces === 0) continue; // can't hit yourself with a fresh bullet
          const t = state.players[pid];
          if (!t.alive) continue;

          const dx = b.x - t.x;
          const dy = b.y - t.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < TANK_W / 2 + BULLET_R) {
            // Hit!
            t.alive = false;
            running = false;
            const winner = pid === p1 ? p2 : p1;
            // If bullet bounced, owner could be the winner hitting themselves
            if (pid === b.owner) {
              // Shot yourself — opponent wins
              state.winner = pid === p1 ? p2 : p1;
            } else {
              state.winner = b.owner;
            }
            ctx.emit('game:state', state);
            ctx.endRound(state.winner);
            return false;
          }
        }

        return true;
      });

      ctx.emit('game:state', state);
    }, TICK_RATE);

    return {
      onPlayerInput(playerId: string, data: unknown): void {
        const input = data as { forward?: boolean; back?: boolean; left?: boolean; right?: boolean; fire?: boolean };
        const inp = inputs[playerId];
        if (!inp) return;
        if (input.forward !== undefined) inp.forward = input.forward;
        if (input.back !== undefined) inp.back = input.back;
        if (input.left !== undefined) inp.left = input.left;
        if (input.right !== undefined) inp.right = input.right;
        if (input.fire) inp.fire = true;
      },
      getState() { return state; },
      cleanup(): void {
        running = false;
        clearInterval(interval);
      },
    };
  },
};
