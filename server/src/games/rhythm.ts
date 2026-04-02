import type { ServerGameModule, MatchContext, GameInstance } from '@arcade-battle/shared';

const W = 800, H = 500;
const HALF_W = W / 2;
const DIRECTIONS = ['up', 'down', 'left', 'right'] as const;
type Direction = typeof DIRECTIONS[number];
const HIT_ZONE_Y = H - 80;
const HIT_WINDOW = 40; // pixels above/below hit zone to count as a hit
const BASE_SPEED = 2.5;
const SPEED_INCREASE = 0.0005; // per tick — slow speed ramp
const SPAWN_INTERVAL_START = 60; // ticks between spawns
const SPAWN_INTERVAL_MIN = 14; // arrows get much denser
const SPAWN_INTERVAL_DECREASE = 0.04; // density ramps faster than speed
const MAX_MISSES = 3;
const TICK_RATE = 1000 / 60;

interface Arrow {
  id: number;
  direction: Direction;
  y: number;
  hit: boolean;
  missed: boolean;
}

interface PlayerState {
  misses: number;
  hits: number;
  alive: boolean;
  lastHitResult: 'perfect' | 'good' | 'miss' | null;
  lastHitTime: number;
}

interface RhythmState {
  players: { [id: string]: PlayerState };
  arrows: Arrow[]; // shared arrow pattern
  speed: number;
  canvasWidth: number;
  canvasHeight: number;
  hitZoneY: number;
  winner: string | null;
  // Track which arrows each player has dealt with
  playerArrowState: { [playerId: string]: { [arrowId: number]: 'hit' | 'missed' } };
}

export const rhythmGame: ServerGameModule = {
  info: {
    id: 'rhythm',
    name: 'Rhythm Rush',
    description: 'Hit the arrows as they reach the line! Arrows speed up over time. Miss 3 and you lose. Use Arrow Keys or WASD.',
    maxDuration: 120,
  },

  create(ctx: MatchContext): GameInstance {
    const [p1, p2] = ctx.players;
    let running = true;
    let tickCount = 0;
    let ticksSinceSpawn = 0;
    let arrowId = 0;

    const state: RhythmState = {
      players: {
        [p1]: { misses: 0, hits: 0, alive: true, lastHitResult: null, lastHitTime: 0 },
        [p2]: { misses: 0, hits: 0, alive: true, lastHitResult: null, lastHitTime: 0 },
      },
      arrows: [],
      speed: BASE_SPEED,
      canvasWidth: W,
      canvasHeight: H,
      hitZoneY: HIT_ZONE_Y,
      winner: null,
      playerArrowState: { [p1]: {}, [p2]: {} },
    };

    function spawnArrow(): void {
      state.arrows.push({
        id: arrowId++,
        direction: DIRECTIONS[Math.floor(Math.random() * DIRECTIONS.length)],
        y: -30,
        hit: false,
        missed: false,
      });
    }

    const interval = setInterval(() => {
      if (!running) return;
      tickCount++;
      ticksSinceSpawn++;

      state.speed = BASE_SPEED + tickCount * SPEED_INCREASE;

      // Spawn arrows
      const spawnInterval = Math.max(SPAWN_INTERVAL_MIN, SPAWN_INTERVAL_START - tickCount * SPAWN_INTERVAL_DECREASE);
      if (ticksSinceSpawn >= spawnInterval) {
        spawnArrow();
        ticksSinceSpawn = 0;
      }

      // Move arrows
      for (const arrow of state.arrows) {
        arrow.y += state.speed;

        // Check if arrow passed the hit zone without being hit (per player)
        if (arrow.y > HIT_ZONE_Y + HIT_WINDOW * 2) {
          for (const pid of ctx.players) {
            const pas = state.playerArrowState[pid];
            if (!pas[arrow.id] && state.players[pid].alive) {
              // Missed!
              pas[arrow.id] = 'missed';
              state.players[pid].misses++;
              state.players[pid].lastHitResult = 'miss';
              state.players[pid].lastHitTime = tickCount;

              if (state.players[pid].misses >= MAX_MISSES) {
                state.players[pid].alive = false;
              }
            }
          }
        }
      }

      // Remove arrows that are way off screen
      state.arrows = state.arrows.filter((a) => a.y < H + 60);

      // Check win condition
      const a1 = state.players[p1].alive;
      const a2 = state.players[p2].alive;

      if (!a1 && !a2) {
        running = false;
        // Whoever had more hits wins
        const winner = state.players[p1].hits >= state.players[p2].hits ? p1 : p2;
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
        if (!running) return;
        const input = data as { direction?: string };
        if (!input.direction) return;

        const p = state.players[playerId];
        if (!p || !p.alive) return;

        // Find the closest arrow in the hit zone matching the input direction
        let bestArrow: Arrow | null = null;
        let bestDist = Infinity;

        for (const arrow of state.arrows) {
          if (state.playerArrowState[playerId][arrow.id]) continue; // already dealt with
          if (arrow.direction !== input.direction) continue;

          const dist = Math.abs(arrow.y - HIT_ZONE_Y);
          if (dist < HIT_WINDOW * 2 && dist < bestDist) {
            bestArrow = arrow;
            bestDist = dist;
          }
        }

        if (bestArrow) {
          state.playerArrowState[playerId][bestArrow.id] = 'hit';
          p.hits++;

          if (bestDist < HIT_WINDOW * 0.4) {
            p.lastHitResult = 'perfect';
          } else {
            p.lastHitResult = 'good';
          }
          p.lastHitTime = tickCount;
        }
        // No matching arrow in range — just ignore (don't penalize random presses)
      },
      getState() { return state; },
      cleanup(): void {
        running = false;
        clearInterval(interval);
      },
    };
  },
};
