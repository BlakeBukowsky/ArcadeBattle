import type { ServerGameModule, MatchContext, GameInstance } from '@arcade-battle/shared';

const W = 800, H = 500;
const PADDLE_W = 12, PADDLE_H = 80;
const BALL_SIZE = 10;
const BALL_SPEED = 7;
const PADDLE_SPEED = 8;
const ACCEL = 1.08;
const POINTS_TO_WIN = 3;
const TICK_RATE = 1000 / 60;
const SERVE_DELAY = 500;

interface PongState {
  ball: { x: number; y: number; vx: number; vy: number };
  paddles: { [id: string]: number };
  scores: { [id: string]: number };
  serving: boolean;
  canvasWidth: number;
  canvasHeight: number;
}

export const pongGame: ServerGameModule = {
  info: {
    id: 'pong',
    name: 'Pong',
    description: 'Classic 1v1 paddle game',
    controls: 'W/S or Arrow Keys to move. First to 3 points. Ball speeds up each hit.',
    maxDuration: 90,
  },

  create(ctx: MatchContext): GameInstance {
    const [p1, p2] = ctx.players;
    let running = true;
    const inputs: { [id: string]: { up: boolean; down: boolean } } = {
      [p1]: { up: false, down: false },
      [p2]: { up: false, down: false },
    };

    const state: PongState = {
      ball: { x: W / 2, y: H / 2, vx: 0, vy: 0 },
      paddles: {
        [p1]: H / 2 - PADDLE_H / 2,
        [p2]: H / 2 - PADDLE_H / 2,
      },
      scores: { [p1]: 0, [p2]: 0 },
      serving: true,
      canvasWidth: W,
      canvasHeight: H,
    };

    function serve(direction: number): void {
      state.ball.x = W / 2;
      state.ball.y = H / 2;
      state.ball.vx = 0;
      state.ball.vy = 0;
      state.serving = true;

      setTimeout(() => {
        if (!running) return;
        const angle = (Math.random() - 0.5) * Math.PI * 0.4;
        state.ball.vx = BALL_SPEED * direction * Math.cos(angle);
        state.ball.vy = BALL_SPEED * Math.sin(angle);
        state.serving = false;
      }, SERVE_DELAY);
    }

    // Initial serve
    serve(Math.random() < 0.5 ? 1 : -1);

    const interval = setInterval(() => {
      if (!running) return;

      // Move paddles
      for (const pid of ctx.players) {
        const inp = inputs[pid];
        if (inp.up) state.paddles[pid] = Math.max(0, state.paddles[pid] - PADDLE_SPEED);
        if (inp.down) state.paddles[pid] = Math.min(H - PADDLE_H, state.paddles[pid] + PADDLE_SPEED);
      }

      if (state.serving) {
        ctx.emit('game:state', state);
        return;
      }

      // Move ball
      const prevBallX = state.ball.x;
      state.ball.x += state.ball.vx;
      state.ball.y += state.ball.vy;

      // Top/bottom bounce
      if (state.ball.y <= 0) {
        state.ball.y = 0;
        state.ball.vy = Math.abs(state.ball.vy);
      }
      if (state.ball.y >= H - BALL_SIZE) {
        state.ball.y = H - BALL_SIZE;
        state.ball.vy = -Math.abs(state.ball.vy);
      }

      // Left paddle (p1) collision — sweep: ball crossed paddle face this frame
      const p1x = 10 + PADDLE_W;
      if (
        state.ball.vx < 0 &&
        prevBallX >= p1x && state.ball.x <= p1x &&
        state.ball.y + BALL_SIZE >= state.paddles[p1] &&
        state.ball.y <= state.paddles[p1] + PADDLE_H
      ) {
        const speed = Math.sqrt(state.ball.vx ** 2 + state.ball.vy ** 2) * ACCEL;
        const hit = (state.ball.y + BALL_SIZE / 2 - state.paddles[p1]) / PADDLE_H - 0.5;
        const angle = hit * Math.PI * 0.4;
        state.ball.vx = Math.cos(angle) * speed;
        state.ball.vy = Math.sin(angle) * speed;
        state.ball.x = p1x + 1;
      }

      // Right paddle (p2) collision — sweep: ball crossed paddle face this frame
      const p2x = W - 10 - PADDLE_W;
      if (
        state.ball.vx > 0 &&
        prevBallX + BALL_SIZE <= p2x && state.ball.x + BALL_SIZE >= p2x &&
        state.ball.y + BALL_SIZE >= state.paddles[p2] &&
        state.ball.y <= state.paddles[p2] + PADDLE_H
      ) {
        const speed = Math.sqrt(state.ball.vx ** 2 + state.ball.vy ** 2) * ACCEL;
        const hit = (state.ball.y + BALL_SIZE / 2 - state.paddles[p2]) / PADDLE_H - 0.5;
        const angle = hit * Math.PI * 0.4;
        state.ball.vx = -Math.cos(angle) * speed;
        state.ball.vy = Math.sin(angle) * speed;
        state.ball.x = p2x - BALL_SIZE - 1;
      }

      // Scoring
      if (state.ball.x < -BALL_SIZE) {
        state.scores[p2]++;
        if (state.scores[p2] >= POINTS_TO_WIN) {
          running = false;
          ctx.emit('game:state', state);
          ctx.endRound(p2);
          return;
        }
        serve(1);
      } else if (state.ball.x > W + BALL_SIZE) {
        state.scores[p1]++;
        if (state.scores[p1] >= POINTS_TO_WIN) {
          running = false;
          ctx.emit('game:state', state);
          ctx.endRound(p1);
          return;
        }
        serve(-1);
      }

      ctx.emit('game:state', state);
    }, TICK_RATE);

    return {
      onPlayerInput(playerId: string, data: unknown): void {
        const input = data as { up?: boolean; down?: boolean };
        const inp = inputs[playerId];
        if (!inp) return;
        if (input.up !== undefined) inp.up = input.up;
        if (input.down !== undefined) inp.down = input.down;
      },
      getState() { return state; },
      cleanup(): void {
        running = false;
        clearInterval(interval);
      },
    };
  },
};
