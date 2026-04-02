import type { ServerGameModule, MatchContext, GameInstance } from '@arcade-battle/shared';

const GAME_DURATION = 15000;
const CANVAS_WIDTH = 800;
const CANVAS_HEIGHT = 500;
const TARGET_RADIUS = 25;
const TARGET_COUNT = 2;
const TICK_RATE = 1000 / 30;

interface Target {
  id: number;
  x: number;
  y: number;
  radius: number;
}

interface AimState {
  targets: Target[];
  scores: { [playerId: string]: number };
  cursors: { [playerId: string]: { x: number; y: number } };
  timeRemaining: number;
  canvasWidth: number;
  canvasHeight: number;
}

export const aimTrainerGame: ServerGameModule = {
  info: {
    id: 'aim-trainer',
    name: 'Aim Trainer',
    description: 'Target clicking speed challenge',
    controls: 'Mouse to aim, Click to shoot. Most hits in 15 seconds wins. Opponent cursor visible.',
    maxDuration: 20,
  },

  create(ctx: MatchContext): GameInstance {
    const [p1, p2] = ctx.players;
    let running = true;
    let targetIdCounter = 0;
    const startTime = Date.now();

    const state: AimState = {
      targets: [],
      scores: { [p1]: 0, [p2]: 0 },
      cursors: {
        [p1]: { x: CANVAS_WIDTH / 2, y: CANVAS_HEIGHT / 2 },
        [p2]: { x: CANVAS_WIDTH / 2, y: CANVAS_HEIGHT / 2 },
      },
      timeRemaining: GAME_DURATION / 1000,
      canvasWidth: CANVAS_WIDTH,
      canvasHeight: CANVAS_HEIGHT,
    };

    function spawnTarget(): void {
      const padding = TARGET_RADIUS * 2;
      state.targets.push({
        id: targetIdCounter++,
        x: padding + Math.random() * (CANVAS_WIDTH - padding * 2),
        y: padding + Math.random() * (CANVAS_HEIGHT - padding * 2),
        radius: TARGET_RADIUS,
      });
    }

    // Spawn initial targets
    for (let i = 0; i < TARGET_COUNT; i++) spawnTarget();

    const tickInterval = setInterval(() => {
      if (!running) return;
      const elapsed = Date.now() - startTime;
      state.timeRemaining = Math.max(0, (GAME_DURATION - elapsed) / 1000);

      if (elapsed >= GAME_DURATION) {
        running = false;
        clearInterval(tickInterval);
        ctx.emit('game:state', state);

        if (state.scores[p1] === state.scores[p2]) {
          ctx.endRound(Math.random() < 0.5 ? p1 : p2);
        } else {
          ctx.endRound(state.scores[p1] > state.scores[p2] ? p1 : p2);
        }
        return;
      }

      ctx.emit('game:state', state);
    }, TICK_RATE);

    return {
      onPlayerInput(playerId: string, data: unknown): void {
        if (!running) return;
        const input = data as { action?: string; x?: number; y?: number };
        if (input.x !== undefined && input.y !== undefined) {
          state.cursors[playerId] = { x: input.x, y: input.y };
        }
        if (input.action !== 'click' || input.x === undefined || input.y === undefined) return;

        for (let i = state.targets.length - 1; i >= 0; i--) {
          const target = state.targets[i];
          const dx = input.x - target.x;
          const dy = input.y - target.y;
          if (dx * dx + dy * dy <= target.radius * target.radius) {
            state.scores[playerId]++;
            state.targets.splice(i, 1);
            // Maintain target count
            while (state.targets.length < TARGET_COUNT) spawnTarget();
            break;
          }
        }
      },
      getState(): AimState {
        return state;
      },
      cleanup(): void {
        running = false;
        clearInterval(tickInterval);
      },
    };
  },
};
