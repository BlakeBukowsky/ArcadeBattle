import type { ServerGameModule, MatchContext, GameInstance } from '@arcade-battle/shared';

const W = 800, H = 500;
const FLOOR_Y = H - 30;
const PLAYER_W = 40, PLAYER_H = 50;
const BALL_R = 12;
const GRAVITY = 0.4;
const MOVE_SPEED = 5;
const JUMP_POWER = -9;
const BASE_BALL_SPEED = 6;
const ACCEL_PER_HIT = 1.25;
const MAX_BALL_SPEED = 25;
const SWING_RANGE = 65;
const SWING_COOLDOWN = 300;
const POINTS_TO_WIN = 3;
const TICK_RATE = 1000 / 60;
const HIT_STUN = 500;

interface PlayerState {
  x: number; y: number; vy: number; onGround: boolean;
  swinging: boolean; swingEnd: number;
  stunned: boolean; stunEnd: number;
}

interface BallBrawlState {
  players: { [id: string]: PlayerState };
  ball: { x: number; y: number; vx: number; vy: number; owner: string | null; speed: number };
  scores: { [id: string]: number };
  canvasWidth: number;
  canvasHeight: number;
}

export const ballBrawlGame: ServerGameModule = {
  info: {
    id: 'ball-brawl',
    name: 'Ball Brawl',
    description: 'Hit the ball to claim it — it damages your opponent on contact! Ball gets faster each hit. First to 3. A/D to move, W/Space to jump, J or K to swing.',
    maxDuration: 90,
  },

  create(ctx: MatchContext): GameInstance {
    const [p1, p2] = ctx.players;
    let running = true;
    const inputs: { [id: string]: { left: boolean; right: boolean; jump: boolean; swing: boolean } } = {
      [p1]: { left: false, right: false, jump: false, swing: false },
      [p2]: { left: false, right: false, jump: false, swing: false },
    };

    const state: BallBrawlState = {
      players: {
        [p1]: { x: 150, y: FLOOR_Y - PLAYER_H, vy: 0, onGround: true, swinging: false, swingEnd: 0, stunned: false, stunEnd: 0 },
        [p2]: { x: W - 150 - PLAYER_W, y: FLOOR_Y - PLAYER_H, vy: 0, onGround: true, swinging: false, swingEnd: 0, stunned: false, stunEnd: 0 },
      },
      ball: { x: W / 2, y: H / 3, vx: BASE_BALL_SPEED * (Math.random() > 0.5 ? 1 : -1), vy: 0, owner: null, speed: BASE_BALL_SPEED },
      scores: { [p1]: 0, [p2]: 0 },
      canvasWidth: W,
      canvasHeight: H,
    };

    function resetBall(): void {
      state.ball.x = W / 2;
      state.ball.y = H / 3;
      state.ball.speed = BASE_BALL_SPEED;
      const angle = (Math.random() - 0.5) * Math.PI * 0.5;
      state.ball.vx = Math.cos(angle) * BASE_BALL_SPEED * (Math.random() > 0.5 ? 1 : -1);
      state.ball.vy = Math.sin(angle) * BASE_BALL_SPEED;
      state.ball.owner = null;
    }

    const interval = setInterval(() => {
      if (!running) return;
      const now = Date.now();

      // Update players
      for (const pid of ctx.players) {
        const p = state.players[pid];

        // Clear stun
        if (p.stunned && now >= p.stunEnd) p.stunned = false;
        if (p.stunned) continue;

        // Clear swing
        if (p.swinging && now >= p.swingEnd) p.swinging = false;

        const inp = inputs[pid];
        if (inp.left) p.x -= MOVE_SPEED;
        if (inp.right) p.x += MOVE_SPEED;
        if (inp.jump && p.onGround) {
          p.vy = JUMP_POWER;
          p.onGround = false;
        }

        // Swing
        if (inp.swing && !p.swinging) {
          p.swinging = true;
          p.swingEnd = now + SWING_COOLDOWN;
          inp.swing = false;

          // Check if swing hits ball
          const pcx = p.x + PLAYER_W / 2;
          const pcy = p.y + PLAYER_H / 2;
          const dx = state.ball.x - pcx;
          const dy = state.ball.y - pcy;
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (dist < SWING_RANGE) {
            // Claim ball and accelerate
            state.ball.owner = pid;
            state.ball.speed = Math.min(state.ball.speed * ACCEL_PER_HIT, MAX_BALL_SPEED);

            // Launch ball away from player
            if (dist > 0) {
              state.ball.vx = (dx / dist) * state.ball.speed;
              state.ball.vy = (dy / dist) * state.ball.speed - 2;
            } else {
              state.ball.vx = state.ball.speed * (pid === p1 ? 1 : -1);
              state.ball.vy = -state.ball.speed * 0.3;
            }
          }
        }

        p.vy += GRAVITY;
        p.y += p.vy;

        // Floor
        if (p.y + PLAYER_H >= FLOOR_Y) {
          p.y = FLOOR_Y - PLAYER_H;
          p.vy = 0;
          p.onGround = true;
        }

        // Walls
        p.x = Math.max(0, Math.min(W - PLAYER_W, p.x));
      }

      // Ball physics
      state.ball.vy += GRAVITY * 0.5;
      state.ball.x += state.ball.vx;
      state.ball.y += state.ball.vy;

      // Wall bounce
      if (state.ball.x - BALL_R < 0) {
        state.ball.x = BALL_R;
        state.ball.vx = Math.abs(state.ball.vx);
      }
      if (state.ball.x + BALL_R > W) {
        state.ball.x = W - BALL_R;
        state.ball.vx = -Math.abs(state.ball.vx);
      }
      // Floor/ceiling bounce
      if (state.ball.y - BALL_R < 0) {
        state.ball.y = BALL_R;
        state.ball.vy = Math.abs(state.ball.vy);
      }
      if (state.ball.y + BALL_R > FLOOR_Y) {
        state.ball.y = FLOOR_Y - BALL_R;
        state.ball.vy = -Math.abs(state.ball.vy) * 0.8;
      }

      // Ball hitting a player
      if (state.ball.owner) {
        for (const pid of ctx.players) {
          if (pid === state.ball.owner) continue;
          const p = state.players[pid];
          if (p.stunned) continue;

          const dx = state.ball.x - (p.x + PLAYER_W / 2);
          const dy = state.ball.y - (p.y + PLAYER_H / 2);
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (dist < BALL_R + PLAYER_W / 2) {
            // Hit!
            state.scores[state.ball.owner]++;
            p.stunned = true;
            p.stunEnd = now + HIT_STUN;

            if (state.scores[state.ball.owner] >= POINTS_TO_WIN) {
              running = false;
              ctx.emit('game:state', state);
              ctx.endRound(state.ball.owner);
              return;
            }

            resetBall();
          }
        }
      }

      ctx.emit('game:state', state);
    }, TICK_RATE);

    return {
      onPlayerInput(playerId: string, data: unknown): void {
        const input = data as { left?: boolean; right?: boolean; jump?: boolean; swing?: boolean };
        const inp = inputs[playerId];
        if (!inp) return;
        if (input.left !== undefined) inp.left = input.left;
        if (input.right !== undefined) inp.right = input.right;
        if (input.jump !== undefined) inp.jump = input.jump;
        if (input.swing) inp.swing = true;
      },
      getState() { return state; },
      cleanup(): void {
        running = false;
        clearInterval(interval);
      },
    };
  },
};
