import type { ServerGameModule, MatchContext, GameInstance } from '@arcade-battle/shared';

const W = 800, H = 500;
const FLOOR_Y = H - 30;
const NET_X = W / 2, NET_W = 6, NET_H = 140;
const NET_TOP = FLOOR_Y - NET_H;
const PLAYER_W = 40, PLAYER_H = 52;
const BALL_R = 12;
const GRAVITY = 0.32;
const JUMP_POWER = -9;
const MOVE_SPEED = 5;
const BALL_BOUNCE = 0.75;
const PLAYER_BOUNCE = 3.5;
const BALL_ACCEL = 0.0002; // ball speeds up over time
const POINTS_TO_WIN = 5;
const TICK_RATE = 1000 / 60;
const SERVE_DELAY = 800;

interface PlayerState {
  x: number; y: number; vy: number; onGround: boolean;
}

interface VolleyState {
  players: { [id: string]: PlayerState };
  ball: { x: number; y: number; vx: number; vy: number };
  scores: { [id: string]: number };
  canvasWidth: number;
  canvasHeight: number;
  paused: boolean;
  serveCount: number;
}

export const volleyballGame: ServerGameModule = {
  info: {
    id: 'volleyball',
    name: 'Volleyball',
    description: '2D volleyball',
    controls: 'A/D to move, W/Space to jump. Keep the ball off your floor. First to 5.',
    maxDuration: 120,
  },

  create(ctx: MatchContext): GameInstance {
    const [p1, p2] = ctx.players;
    let running = true;
    const inputs: { [id: string]: { left: boolean; right: boolean; jump: boolean } } = {
      [p1]: { left: false, right: false, jump: false },
      [p2]: { left: false, right: false, jump: false },
    };

    const state: VolleyState = {
      players: {
        [p1]: { x: W / 4 - PLAYER_W / 2, y: FLOOR_Y - PLAYER_H, vy: 0, onGround: true },
        [p2]: { x: (3 * W) / 4 - PLAYER_W / 2, y: FLOOR_Y - PLAYER_H, vy: 0, onGround: true },
      },
      ball: { x: W / 4, y: 100, vx: 0.4, vy: 0 },
      scores: { [p1]: 0, [p2]: 0 },
      canvasWidth: W,
      canvasHeight: H,
      paused: false,
      serveCount: 0,
    };

    function serveBall(): void {
      // Alternate server each point
      const serveLeft = state.serveCount % 2 === 0;
      state.ball.x = serveLeft ? W / 4 : (3 * W) / 4;
      state.ball.y = 100;
      state.ball.vx = serveLeft ? 0.4 : -0.4;
      state.ball.vy = 0;
      state.serveCount++;
      rallyTicks = 0;
      state.paused = false;
    }

    let rallyTicks = 0;

    const interval = setInterval(() => {
      if (!running) {
        ctx.emit('game:state', state);
        return;
      }

      // Update players (always, even during pause)
      for (const pid of ctx.players) {
        const p = state.players[pid];
        const inp = inputs[pid];

        if (inp.left) p.x -= MOVE_SPEED;
        if (inp.right) p.x += MOVE_SPEED;

        if (inp.jump && p.onGround) {
          p.vy = JUMP_POWER;
          p.onGround = false;
        }

        p.vy += GRAVITY;
        p.y += p.vy;

        // Floor
        if (p.y + PLAYER_H >= FLOOR_Y) {
          p.y = FLOOR_Y - PLAYER_H;
          p.vy = 0;
          p.onGround = true;
        }

        // Keep on own side + walls
        if (pid === p1) {
          p.x = Math.max(0, Math.min(NET_X - NET_W / 2 - PLAYER_W, p.x));
        } else {
          p.x = Math.max(NET_X + NET_W / 2, Math.min(W - PLAYER_W, p.x));
        }
      }

      if (state.paused) { ctx.emit('game:state', state); return; }

      // Ball physics — accelerate over rally duration
      rallyTicks++;
      const speedMult = 1 + rallyTicks * BALL_ACCEL;
      state.ball.vy += GRAVITY;
      state.ball.x += state.ball.vx * speedMult;
      state.ball.y += state.ball.vy;

      // Wall bounces
      if (state.ball.x - BALL_R < 0) {
        state.ball.x = BALL_R;
        state.ball.vx = Math.abs(state.ball.vx) * BALL_BOUNCE;
      }
      if (state.ball.x + BALL_R > W) {
        state.ball.x = W - BALL_R;
        state.ball.vx = -Math.abs(state.ball.vx) * BALL_BOUNCE;
      }

      // Ceiling
      if (state.ball.y - BALL_R < 0) {
        state.ball.y = BALL_R;
        state.ball.vy = Math.abs(state.ball.vy) * BALL_BOUNCE;
      }

      // Net collision (ball)
      if (
        state.ball.y + BALL_R > NET_TOP &&
        state.ball.x + BALL_R > NET_X - NET_W / 2 &&
        state.ball.x - BALL_R < NET_X + NET_W / 2
      ) {
        if (state.ball.vx > 0) {
          state.ball.x = NET_X - NET_W / 2 - BALL_R;
        } else {
          state.ball.x = NET_X + NET_W / 2 + BALL_R;
        }
        state.ball.vx *= -BALL_BOUNCE;
      }

      // Player-ball collision
      for (const pid of ctx.players) {
        const p = state.players[pid];
        const cx = p.x + PLAYER_W / 2;
        const cy = p.y + PLAYER_H / 2;
        const dx = state.ball.x - cx;
        const dy = state.ball.y - cy;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const minDist = BALL_R + Math.max(PLAYER_W, PLAYER_H) / 2;

        if (dist < minDist && dist > 0) {
          const nx = dx / dist;
          const ny = dy / dist;
          state.ball.x = cx + nx * minDist;
          state.ball.y = cy + ny * minDist;
          // Bounce off player
          const dot = state.ball.vx * nx + state.ball.vy * ny;
          state.ball.vx = state.ball.vx - 2 * dot * nx + nx * PLAYER_BOUNCE;
          state.ball.vy = state.ball.vy - 2 * dot * ny + ny * PLAYER_BOUNCE - 2;
        }
      }

      // Floor — scoring
      if (state.ball.y + BALL_R >= FLOOR_Y) {
        const scorer = state.ball.x < NET_X ? p2 : p1;
        state.scores[scorer]++;

        if (state.scores[scorer] >= POINTS_TO_WIN) {
          running = false;
          ctx.emit('game:state', state);
          ctx.endRound(scorer);
          return;
        }

        state.paused = true;
        setTimeout(() => { if (running) serveBall(); }, SERVE_DELAY);
      }

      ctx.emit('game:state', state);
    }, TICK_RATE);

    return {
      onPlayerInput(playerId: string, data: unknown): void {
        const input = data as { left?: boolean; right?: boolean; jump?: boolean };
        const inp = inputs[playerId];
        if (!inp) return;
        if (input.left !== undefined) inp.left = input.left;
        if (input.right !== undefined) inp.right = input.right;
        if (input.jump !== undefined) inp.jump = input.jump;
      },
      getState() { return state; },
      cleanup(): void {
        running = false;
        clearInterval(interval);
      },
    };
  },
};
