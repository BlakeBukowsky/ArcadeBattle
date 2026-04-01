import type { ServerGameModule, MatchContext, GameInstance } from '@arcade-battle/shared';

const W = 800, H = 500;
const HALF_W = W / 2;
const PLAYER_W = 20, PLAYER_H = 20;
const PLAYER_Y = H - 50;
const MOVE_SPEED = 5;
const BASE_ASTEROID_SPEED = 2.5;
const SPEED_INCREASE = 0.005;
const SPAWN_INTERVAL_START = 400;
const SPAWN_INTERVAL_MIN = 120;
const ASTEROID_MIN_R = 8, ASTEROID_MAX_R = 22;
const TICK_RATE = 1000 / 60;

interface Asteroid {
  id: number;
  x: number;
  y: number;
  r: number;
}

interface PlayerState {
  x: number;
  alive: boolean;
  deathTime: number;
}

interface AsteroidDodgeState {
  players: { [id: string]: PlayerState };
  asteroids: Asteroid[];
  speed: number;
  canvasWidth: number;
  canvasHeight: number;
  winner: string | null;
}

export const asteroidDodgeGame: ServerGameModule = {
  info: {
    id: 'asteroid-dodge',
    name: 'Asteroid Dodge',
    description: 'Dodge the asteroids! Same pattern for both players. Whoever survives longest wins. A/D or Arrow Keys to move.',
    maxDuration: 120,
  },

  create(ctx: MatchContext): GameInstance {
    const [p1, p2] = ctx.players;
    let running = true;
    let asteroidId = 0;
    let tickCount = 0;
    let ticksSinceSpawn = 0;
    const inputs: { [id: string]: { left: boolean; right: boolean } } = {
      [p1]: { left: false, right: false },
      [p2]: { left: false, right: false },
    };

    const state: AsteroidDodgeState = {
      players: {
        [p1]: { x: HALF_W / 2, alive: true, deathTime: 0 },
        [p2]: { x: HALF_W / 2, alive: true, deathTime: 0 },
      },
      asteroids: [],
      speed: BASE_ASTEROID_SPEED,
      canvasWidth: W,
      canvasHeight: H,
      winner: null,
    };

    function spawnAsteroid(): void {
      const r = ASTEROID_MIN_R + Math.random() * (ASTEROID_MAX_R - ASTEROID_MIN_R);
      state.asteroids.push({
        id: asteroidId++,
        x: r + Math.random() * (HALF_W - r * 2),
        y: -r,
        r,
      });
    }

    function checkCollision(px: number, asteroid: Asteroid): boolean {
      const cx = px + PLAYER_W / 2;
      const cy = PLAYER_Y + PLAYER_H / 2;
      const dx = cx - asteroid.x;
      const dy = cy - asteroid.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      return dist < asteroid.r + Math.min(PLAYER_W, PLAYER_H) / 2;
    }

    const interval = setInterval(() => {
      if (!running) return;
      tickCount++;
      ticksSinceSpawn++;

      // All asteroids move at the same speed, which increases over time
      state.speed = BASE_ASTEROID_SPEED + tickCount * SPEED_INCREASE;

      // Spawn asteroids — interval decreases over time
      const spawnInterval = Math.max(SPAWN_INTERVAL_MIN, SPAWN_INTERVAL_START - tickCount * 0.5);
      const spawnTicks = spawnInterval / TICK_RATE;
      if (ticksSinceSpawn >= spawnTicks) {
        spawnAsteroid();
        ticksSinceSpawn = 0;
      }

      // Move ALL asteroids at the SAME speed
      for (const a of state.asteroids) {
        a.y += state.speed;
      }

      // Remove off-screen
      state.asteroids = state.asteroids.filter((a) => a.y - a.r < H + 10);

      // Move players
      for (const pid of ctx.players) {
        const p = state.players[pid];
        if (!p.alive) continue;
        const inp = inputs[pid];
        if (inp.left) p.x = Math.max(0, p.x - MOVE_SPEED);
        if (inp.right) p.x = Math.min(HALF_W - PLAYER_W, p.x + MOVE_SPEED);
      }

      // Check collisions
      const alive1 = state.players[p1].alive;
      const alive2 = state.players[p2].alive;

      for (const a of state.asteroids) {
        const hit1 = alive1 && checkCollision(state.players[p1].x, a);
        const hit2 = alive2 && checkCollision(state.players[p2].x, a);

        if (hit1 && hit2) {
          // Both hit same asteroid — asteroid breaks, neither dies
          a.y = H + 100;
          continue;
        }
        if (hit1) {
          state.players[p1].alive = false;
          state.players[p1].deathTime = tickCount;
        }
        if (hit2) {
          state.players[p2].alive = false;
          state.players[p2].deathTime = tickCount;
        }
      }

      // Check win
      const nowAlive1 = state.players[p1].alive;
      const nowAlive2 = state.players[p2].alive;

      if (!nowAlive1 && !nowAlive2) {
        running = false;
        const winner = state.players[p1].deathTime > state.players[p2].deathTime ? p1 :
                       state.players[p2].deathTime > state.players[p1].deathTime ? p2 :
                       Math.random() < 0.5 ? p1 : p2;
        state.winner = winner;
        ctx.emit('game:state', state);
        ctx.endRound(winner);
        return;
      }
      if (!nowAlive1 && nowAlive2) {
        running = false; state.winner = p2;
        ctx.emit('game:state', state); ctx.endRound(p2); return;
      }
      if (nowAlive1 && !nowAlive2) {
        running = false; state.winner = p1;
        ctx.emit('game:state', state); ctx.endRound(p1); return;
      }

      ctx.emit('game:state', state);
    }, TICK_RATE);

    return {
      onPlayerInput(playerId: string, data: unknown): void {
        const input = data as { left?: boolean; right?: boolean };
        const inp = inputs[playerId];
        if (!inp) return;
        if (input.left !== undefined) inp.left = input.left;
        if (input.right !== undefined) inp.right = input.right;
      },
      getState() { return state; },
      cleanup(): void {
        running = false;
        clearInterval(interval);
      },
    };
  },
};
