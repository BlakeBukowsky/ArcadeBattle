import type { ServerGameModule, MatchContext, GameInstance } from '@arcade-battle/shared';

const W = 800, H = 500;
const HALF_W = W / 2;
const LANES = 3;
const LANE_H = H / LANES;
const CAR_W = 30, CAR_H = 50;
const CAR_Y = H - CAR_H - 20;
const BASE_SPEED = 3;
const SPEED_INCREASE = 0.004;
const SPAWN_INTERVAL_START = 50; // ticks
const SPAWN_INTERVAL_MIN = 18;
const OBSTACLE_W = 40, OBSTACLE_H = 40;
const TICK_RATE = 1000 / 60;

interface Obstacle {
  id: number;
  lane: number;
  y: number;
}

interface PlayerState {
  lane: number; // 0, 1, or 2
  alive: boolean;
  deathTick: number;
  distance: number;
}

interface LaneRacerState {
  players: { [id: string]: PlayerState };
  obstacles: Obstacle[];
  speed: number;
  canvasWidth: number;
  canvasHeight: number;
  winner: string | null;
}

export const laneRacerGame: ServerGameModule = {
  info: {
    id: 'lane-racer',
    name: 'Lane Racer',
    description: 'Dodge traffic! Switch lanes to avoid obstacles. Speed increases over time. A/D or Arrow Keys to switch lanes.',
    maxDuration: 120,
  },

  create(ctx: MatchContext): GameInstance {
    const [p1, p2] = ctx.players;
    let running = true;
    let tickCount = 0;
    let ticksSinceSpawn = 0;
    let obstacleId = 0;

    const state: LaneRacerState = {
      players: {
        [p1]: { lane: 1, alive: true, deathTick: 0, distance: 0 },
        [p2]: { lane: 1, alive: true, deathTick: 0, distance: 0 },
      },
      obstacles: [],
      speed: BASE_SPEED,
      canvasWidth: W,
      canvasHeight: H,
      winner: null,
    };

    function spawnObstacle(): void {
      // Pick 1-2 lanes to block (always leave at least 1 open)
      const blocked = new Set<number>();
      blocked.add(Math.floor(Math.random() * LANES));
      if (Math.random() < 0.3) {
        // Sometimes block a second lane
        let second = Math.floor(Math.random() * LANES);
        while (second === [...blocked][0]) second = Math.floor(Math.random() * LANES);
        blocked.add(second);
      }

      for (const lane of blocked) {
        state.obstacles.push({
          id: obstacleId++,
          lane,
          y: -OBSTACLE_H,
        });
      }
    }

    function getLaneX(lane: number): number {
      // Within each player's half-width
      const laneW = HALF_W / LANES;
      return lane * laneW + (laneW - CAR_W) / 2;
    }

    function getObstacleLaneX(lane: number): number {
      const laneW = HALF_W / LANES;
      return lane * laneW + (laneW - OBSTACLE_W) / 2;
    }

    const interval = setInterval(() => {
      if (!running) return;
      tickCount++;
      ticksSinceSpawn++;

      state.speed = BASE_SPEED + tickCount * SPEED_INCREASE;

      // Spawn
      const spawnInterval = Math.max(SPAWN_INTERVAL_MIN, SPAWN_INTERVAL_START - tickCount * 0.03);
      if (ticksSinceSpawn >= spawnInterval) {
        spawnObstacle();
        ticksSinceSpawn = 0;
      }

      // Move obstacles
      for (const obs of state.obstacles) {
        obs.y += state.speed;
      }
      state.obstacles = state.obstacles.filter((o) => o.y < H + 50);

      // Track distance for alive players
      for (const pid of ctx.players) {
        const p = state.players[pid];
        if (p.alive) p.distance += state.speed;
      }

      // Collision check
      for (const pid of ctx.players) {
        const p = state.players[pid];
        if (!p.alive) continue;

        const carX = getLaneX(p.lane);
        for (const obs of state.obstacles) {
          if (obs.lane !== p.lane) continue;
          const obsX = getObstacleLaneX(obs.lane);
          // Simple AABB in lane space
          if (
            obs.y + OBSTACLE_H > CAR_Y &&
            obs.y < CAR_Y + CAR_H
          ) {
            p.alive = false;
            p.deathTick = tickCount;
          }
        }
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
        running = false; state.winner = p2;
        ctx.emit('game:state', state); ctx.endRound(p2); return;
      }
      if (!a2) {
        running = false; state.winner = p1;
        ctx.emit('game:state', state); ctx.endRound(p1); return;
      }

      ctx.emit('game:state', state);
    }, TICK_RATE);

    return {
      onPlayerInput(playerId: string, data: unknown): void {
        const input = data as { lane?: 'left' | 'right' };
        if (!input.lane) return;
        const p = state.players[playerId];
        if (!p || !p.alive) return;

        if (input.lane === 'left' && p.lane > 0) p.lane--;
        if (input.lane === 'right' && p.lane < LANES - 1) p.lane++;
      },
      getState() { return state; },
      cleanup(): void {
        running = false;
        clearInterval(interval);
      },
    };
  },
};
