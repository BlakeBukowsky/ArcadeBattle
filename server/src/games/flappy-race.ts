import type { ServerGameModule, MatchContext, GameInstance } from '@arcade-battle/shared';

const W = 800, H = 500;
const HALF_W = W / 2;
const BIRD_X = 80, BIRD_R = 12;
const GRAVITY = 0.5;
const FLAP_POWER = -7;
const PIPE_W = 40;
const GAP_H_START = 180;
const GAP_H_MIN = 100;
const GAP_SHRINK = 0.015; // per pipe spawned
const BASE_SPEED = 3;
const SPEED_INCREASE = 0.001;
const PIPE_SPACING = 220;
const TICK_RATE = 1000 / 60;

interface Pipe {
  x: number;
  gapY: number; // center of gap
  gapH: number; // gap height (shrinks over time)
  passed: boolean;
}

interface PlayerState {
  y: number;
  vy: number;
  alive: boolean;
  score: number;
  deathTick: number;
}

interface FlappyState {
  players: { [id: string]: PlayerState };
  pipes: Pipe[];
  scrollOffset: number;
  speed: number;
  canvasWidth: number;
  canvasHeight: number;
  winner: string | null;
}

export const flappyRaceGame: ServerGameModule = {
  info: {
    id: 'flappy-race',
    name: 'Flappy Race',
    description: 'Flappy Bird race',
    controls: 'W/Space/Up to flap. Same pipes for both. Last alive wins.',
    maxDuration: 120,
  },

  create(ctx: MatchContext): GameInstance {
    const [p1, p2] = ctx.players;
    let running = true;
    let tickCount = 0;
    const inputs: { [id: string]: { flap: boolean } } = {
      [p1]: { flap: false },
      [p2]: { flap: false },
    };

    const state: FlappyState = {
      players: {
        [p1]: { y: H / 2, vy: 0, alive: true, score: 0, deathTick: 0 },
        [p2]: { y: H / 2, vy: 0, alive: true, score: 0, deathTick: 0 },
      },
      pipes: [],
      scrollOffset: 0,
      speed: BASE_SPEED,
      canvasWidth: W,
      canvasHeight: H,
      winner: null,
    };

    let pipeCount = 0;

    function makeGapH(): number {
      return Math.max(GAP_H_MIN, GAP_H_START - pipeCount * GAP_SHRINK * 60);
    }

    // Pre-generate initial pipes
    for (let i = 0; i < 6; i++) {
      const gapH = makeGapH();
      pipeCount++;
      state.pipes.push({
        x: HALF_W + 100 + i * PIPE_SPACING,
        gapY: gapH / 2 + 20 + Math.random() * (H - gapH - 40),
        gapH,
        passed: false,
      });
    }

    function spawnPipe(): void {
      const lastPipe = state.pipes[state.pipes.length - 1];
      const gapH = makeGapH();
      pipeCount++;
      state.pipes.push({
        x: lastPipe.x + PIPE_SPACING,
        gapY: gapH / 2 + 20 + Math.random() * (H - gapH - 40),
        gapH,
        passed: false,
      });
    }

    const interval = setInterval(() => {
      if (!running) return;
      tickCount++;

      state.speed = BASE_SPEED + tickCount * SPEED_INCREASE;
      state.scrollOffset += state.speed;

      // Update players
      for (const pid of ctx.players) {
        const p = state.players[pid];
        if (!p.alive) continue;

        if (inputs[pid].flap) {
          p.vy = FLAP_POWER;
          inputs[pid].flap = false;
        }

        p.vy += GRAVITY;
        p.y += p.vy;

        // Ceiling death
        if (p.y - BIRD_R < 0) {
          p.alive = false;
          p.deathTick = tickCount;
        }
        // Floor — bounce off instead of dying
        if (p.y + BIRD_R > H) {
          p.y = H - BIRD_R;
          p.vy = -Math.abs(p.vy) * 0.5;
        }

        // Pipe collision
        for (const pipe of state.pipes) {
          const pipeScreenX = pipe.x - state.scrollOffset;
          if (pipeScreenX > BIRD_X + BIRD_R || pipeScreenX + PIPE_W < BIRD_X - BIRD_R) continue;

          const inGap = p.y > pipe.gapY - pipe.gapH / 2 && p.y < pipe.gapY + pipe.gapH / 2;
          if (!inGap) {
            p.alive = false;
            p.deathTick = tickCount;
          }
        }

        // Score (passed pipes)
        for (const pipe of state.pipes) {
          if (!pipe.passed && pipe.x - state.scrollOffset + PIPE_W < BIRD_X) {
            pipe.passed = true;
            p.score++;
          }
        }
      }

      // Remove old pipes and spawn new ones
      state.pipes = state.pipes.filter((p) => p.x - state.scrollOffset > -PIPE_W - 10);
      const lastPipe = state.pipes[state.pipes.length - 1];
      if (lastPipe && lastPipe.x - state.scrollOffset < HALF_W + PIPE_SPACING) {
        spawnPipe();
      }

      // Check win
      const a1 = state.players[p1].alive;
      const a2 = state.players[p2].alive;

      if (!a1 && !a2) {
        running = false;
        const winner = state.players[p1].deathTick > state.players[p2].deathTick ? p1 :
                       state.players[p2].deathTick > state.players[p1].deathTick ? p2 :
                       Math.random() < 0.5 ? p1 : p2;
        state.winner = winner;
        ctx.emit('game:state', state);
        ctx.endRound(winner);
        return;
      }
      if (!a1) {
        running = false;
        state.winner = p2;
        ctx.emit('game:state', state);
        ctx.endRound(p2);
        return;
      }
      if (!a2) {
        running = false;
        state.winner = p1;
        ctx.emit('game:state', state);
        ctx.endRound(p1);
        return;
      }

      ctx.emit('game:state', state);
    }, TICK_RATE);

    return {
      onPlayerInput(playerId: string, data: unknown): void {
        const input = data as { flap?: boolean };
        if (input.flap) inputs[playerId].flap = true;
      },
      getState() { return state; },
      cleanup(): void {
        running = false;
        clearInterval(interval);
      },
    };
  },
};
