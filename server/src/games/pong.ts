import type { ServerGameModule, MatchContext, GameInstance } from '@arcade-battle/shared';

const CANVAS_WIDTH = 800;
const CANVAS_HEIGHT = 500;
const PADDLE_WIDTH = 12;
const PADDLE_HEIGHT = 80;
const BALL_SIZE = 10;
const BALL_SPEED = 8;
const PADDLE_SPEED = 9;
const POINTS_TO_WIN = 3;
const ACCEL_PER_HIT = 1.10;
const TICK_RATE = 1000 / 60;

interface PongState {
  ball: { x: number; y: number; vx: number; vy: number };
  paddles: { [playerId: string]: number };
  scores: { [playerId: string]: number };
  canvasWidth: number;
  canvasHeight: number;
}

export const pongGame: ServerGameModule = {
  info: {
    id: 'pong',
    name: 'Pong',
    description: 'Classic paddle game. First to 3 points wins! Use W/S or Arrow Keys to move your paddle.',
    maxDuration: 90,
  },

  create(ctx: MatchContext): GameInstance {
    const [p1, p2] = ctx.players;
    const playerInputs: { [id: string]: { up: boolean; down: boolean } } = {
      [p1]: { up: false, down: false },
      [p2]: { up: false, down: false },
    };

    const state: PongState = {
      ball: { x: CANVAS_WIDTH / 2, y: CANVAS_HEIGHT / 2, vx: BALL_SPEED, vy: BALL_SPEED * 0.3 },
      paddles: {
        [p1]: CANVAS_HEIGHT / 2 - PADDLE_HEIGHT / 2,
        [p2]: CANVAS_HEIGHT / 2 - PADDLE_HEIGHT / 2,
      },
      scores: { [p1]: 0, [p2]: 0 },
      canvasWidth: CANVAS_WIDTH,
      canvasHeight: CANVAS_HEIGHT,
    };

    function resetBall(direction: number): void {
      state.ball.x = CANVAS_WIDTH / 2;
      state.ball.y = CANVAS_HEIGHT / 2;
      const angle = (Math.random() - 0.5) * Math.PI * 0.5;
      state.ball.vx = BALL_SPEED * direction * Math.cos(angle);
      state.ball.vy = BALL_SPEED * Math.sin(angle);
    }

    let running = true;
    const interval = setInterval(() => {
      if (!running) return;

      // Move paddles
      for (const pid of ctx.players) {
        const input = playerInputs[pid];
        if (input.up) state.paddles[pid] = Math.max(0, state.paddles[pid] - PADDLE_SPEED);
        if (input.down) state.paddles[pid] = Math.min(CANVAS_HEIGHT - PADDLE_HEIGHT, state.paddles[pid] + PADDLE_SPEED);
      }

      // Move ball
      state.ball.x += state.ball.vx;
      state.ball.y += state.ball.vy;

      // Top/bottom bounce
      if (state.ball.y <= 0 || state.ball.y >= CANVAS_HEIGHT - BALL_SIZE) {
        state.ball.vy *= -1;
        state.ball.y = Math.max(0, Math.min(CANVAS_HEIGHT - BALL_SIZE, state.ball.y));
      }

      // Left paddle collision (p1)
      if (
        state.ball.x <= PADDLE_WIDTH + 10 &&
        state.ball.y + BALL_SIZE >= state.paddles[p1] &&
        state.ball.y <= state.paddles[p1] + PADDLE_HEIGHT &&
        state.ball.vx < 0
      ) {
        const speed = Math.sqrt(state.ball.vx * state.ball.vx + state.ball.vy * state.ball.vy);
        const newSpeed = speed * ACCEL_PER_HIT;
        const hitPos = (state.ball.y + BALL_SIZE / 2 - state.paddles[p1]) / PADDLE_HEIGHT - 0.5;
        const angle = hitPos * Math.PI * 0.4;
        state.ball.vx = Math.cos(angle) * newSpeed;
        state.ball.vy = Math.sin(angle) * newSpeed;
        state.ball.x = PADDLE_WIDTH + 10 + 1;
      }

      // Right paddle collision (p2)
      if (
        state.ball.x + BALL_SIZE >= CANVAS_WIDTH - PADDLE_WIDTH - 10 &&
        state.ball.y + BALL_SIZE >= state.paddles[p2] &&
        state.ball.y <= state.paddles[p2] + PADDLE_HEIGHT &&
        state.ball.vx > 0
      ) {
        const speed = Math.sqrt(state.ball.vx * state.ball.vx + state.ball.vy * state.ball.vy);
        const newSpeed = speed * ACCEL_PER_HIT;
        const hitPos = (state.ball.y + BALL_SIZE / 2 - state.paddles[p2]) / PADDLE_HEIGHT - 0.5;
        const angle = hitPos * Math.PI * 0.4;
        state.ball.vx = -Math.cos(angle) * newSpeed;
        state.ball.vy = Math.sin(angle) * newSpeed;
        state.ball.x = CANVAS_WIDTH - PADDLE_WIDTH - 10 - BALL_SIZE - 1;
      }

      // Scoring
      if (state.ball.x < 0) {
        state.scores[p2]++;
        if (state.scores[p2] >= POINTS_TO_WIN) {
          running = false;
          ctx.emit('game:state', state);
          ctx.endRound(p2);
          return;
        }
        resetBall(1);
      } else if (state.ball.x > CANVAS_WIDTH) {
        state.scores[p1]++;
        if (state.scores[p1] >= POINTS_TO_WIN) {
          running = false;
          ctx.emit('game:state', state);
          ctx.endRound(p1);
          return;
        }
        resetBall(-1);
      }

      ctx.emit('game:state', state);
    }, TICK_RATE);

    return {
      onPlayerInput(playerId: string, data: unknown): void {
        const input = data as { up?: boolean; down?: boolean };
        if (playerInputs[playerId]) {
          if (input.up !== undefined) playerInputs[playerId].up = input.up;
          if (input.down !== undefined) playerInputs[playerId].down = input.down;
        }
      },
      getState(): PongState {
        return state;
      },
      cleanup(): void {
        running = false;
        clearInterval(interval);
      },
    };
  },
};
