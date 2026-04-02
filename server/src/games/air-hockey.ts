import type { ServerGameModule, MatchContext, GameInstance } from '@arcade-battle/shared';

const W = 800, H = 500;
const PUCK_R = 12;
const MALLET_R = 20;
const GOAL_WIDTH = 200;
const GOAL_TOP = (H - GOAL_WIDTH) / 2;
const GOAL_BOTTOM = GOAL_TOP + GOAL_WIDTH;
const PUCK_FRICTION = 0.995;
const PUCK_MAX_SPEED = 18;
const POINTS_TO_WIN = 3;
const TICK_RATE = 1000 / 60;
const RESPAWN_DELAY = 800;

interface AirHockeyState {
  puck: { x: number; y: number; vx: number; vy: number };
  mallets: { [id: string]: { x: number; y: number } };
  scores: { [id: string]: number };
  canvasWidth: number;
  canvasHeight: number;
  goalWidth: number;
  paused: boolean;
}

export const airHockeyGame: ServerGameModule = {
  info: {
    id: 'air-hockey',
    name: 'Air Hockey',
    description: 'Smash the puck into your opponent\'s goal! First to 3. Move your mallet with the mouse.',
    maxDuration: 90,
  },

  create(ctx: MatchContext): GameInstance {
    const [p1, p2] = ctx.players;
    let running = true;
    const prevMallets: { [id: string]: { x: number; y: number } } = {
      [p1]: { x: 100, y: H / 2 },
      [p2]: { x: W - 100, y: H / 2 },
    };

    const state: AirHockeyState = {
      puck: { x: W / 2, y: H / 2, vx: 0, vy: 0 },
      mallets: {
        [p1]: { x: 100, y: H / 2 },
        [p2]: { x: W - 100, y: H / 2 },
      },
      scores: { [p1]: 0, [p2]: 0 },
      canvasWidth: W,
      canvasHeight: H,
      goalWidth: GOAL_WIDTH,
      paused: false,
    };

    function resetPuck(): void {
      state.puck.x = W / 2;
      state.puck.y = H / 2;
      state.puck.vx = 0;
      state.puck.vy = 0;
      state.paused = true;
      setTimeout(() => { if (running) state.paused = false; }, RESPAWN_DELAY);
    }

    function clampMallet(pid: string): void {
      const m = state.mallets[pid];
      // Restrict to own half
      if (pid === p1) {
        m.x = Math.max(MALLET_R, Math.min(W / 2 - MALLET_R, m.x));
      } else {
        m.x = Math.max(W / 2 + MALLET_R, Math.min(W - MALLET_R, m.x));
      }
      m.y = Math.max(MALLET_R, Math.min(H - MALLET_R, m.y));
    }

    const interval = setInterval(() => {
      if (!running) return;

      if (!state.paused) {
        // Move puck
        state.puck.x += state.puck.vx;
        state.puck.y += state.puck.vy;
        state.puck.vx *= PUCK_FRICTION;
        state.puck.vy *= PUCK_FRICTION;

        // Top/bottom wall bounce
        if (state.puck.y - PUCK_R <= 0) {
          state.puck.y = PUCK_R;
          state.puck.vy = Math.abs(state.puck.vy);
        }
        if (state.puck.y + PUCK_R >= H) {
          state.puck.y = H - PUCK_R;
          state.puck.vy = -Math.abs(state.puck.vy);
        }

        // Left wall / goal check
        if (state.puck.x - PUCK_R <= 0) {
          if (state.puck.y >= GOAL_TOP && state.puck.y <= GOAL_BOTTOM) {
            // GOAL for p2
            state.scores[p2]++;
            if (state.scores[p2] >= POINTS_TO_WIN) {
              running = false;
              ctx.emit('game:state', state);
              ctx.endRound(p2);
              return;
            }
            resetPuck();
          } else {
            state.puck.x = PUCK_R;
            state.puck.vx = Math.abs(state.puck.vx);
          }
        }

        // Right wall / goal check
        if (state.puck.x + PUCK_R >= W) {
          if (state.puck.y >= GOAL_TOP && state.puck.y <= GOAL_BOTTOM) {
            // GOAL for p1
            state.scores[p1]++;
            if (state.scores[p1] >= POINTS_TO_WIN) {
              running = false;
              ctx.emit('game:state', state);
              ctx.endRound(p1);
              return;
            }
            resetPuck();
          } else {
            state.puck.x = W - PUCK_R;
            state.puck.vx = -Math.abs(state.puck.vx);
          }
        }

        // Mallet-puck collision
        for (const pid of ctx.players) {
          const m = state.mallets[pid];
          const dx = state.puck.x - m.x;
          const dy = state.puck.y - m.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          const minDist = PUCK_R + MALLET_R;

          if (dist < minDist && dist > 0) {
            // Push puck out
            const nx = dx / dist;
            const ny = dy / dist;
            state.puck.x = m.x + nx * minDist;
            state.puck.y = m.y + ny * minDist;

            // Mallet velocity = position delta
            const mvx = m.x - prevMallets[pid].x;
            const mvy = m.y - prevMallets[pid].y;

            // Transfer velocity
            state.puck.vx = nx * 8 + mvx * 1.5;
            state.puck.vy = ny * 8 + mvy * 1.5;

            // Clamp speed
            const speed = Math.sqrt(state.puck.vx * state.puck.vx + state.puck.vy * state.puck.vy);
            if (speed > PUCK_MAX_SPEED) {
              state.puck.vx = (state.puck.vx / speed) * PUCK_MAX_SPEED;
              state.puck.vy = (state.puck.vy / speed) * PUCK_MAX_SPEED;
            }
          }
        }
      }

      // Save previous positions for velocity calc
      for (const pid of ctx.players) {
        prevMallets[pid] = { ...state.mallets[pid] };
      }

      ctx.emit('game:state', state);
    }, TICK_RATE);

    return {
      onPlayerInput(playerId: string, data: unknown): void {
        const input = data as { x?: number; y?: number };
        if (input.x !== undefined && input.y !== undefined) {
          state.mallets[playerId] = { x: input.x, y: input.y };
          clampMallet(playerId);
        }
      },
      getState() { return state; },
      cleanup(): void {
        running = false;
        clearInterval(interval);
      },
    };
  },
};
