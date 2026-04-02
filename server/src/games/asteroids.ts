import type { ServerGameModule, MatchContext, GameInstance } from '@arcade-battle/shared';

const W = 800, H = 500;
const SHIP_R = 12;
const TURN_SPEED = 0.06;
const THRUST = 0.15;
const MAX_SPEED = 5;
const FRICTION = 0.99;
const BULLET_SPEED = 7;
const BULLET_R = 3;
const BULLET_LIFE = 70;
const FIRE_COOLDOWN = 250;
const INITIAL_ASTEROIDS = 6;
const MAX_ASTEROIDS = 10;
const LIVES = 3;
const RESPAWN_DELAY = 1500;
const IFRAME_DURATION = 2000;
const TICK_RATE = 1000 / 60;

type AsteroidSize = 'large' | 'medium' | 'small';
const SIZE_RADIUS: Record<AsteroidSize, number> = { large: 30, medium: 18, small: 10 };

interface Ship {
  x: number; y: number; vx: number; vy: number; angle: number;
  alive: boolean; lives: number; iframeUntil: number; lastFire: number;
}
interface Bullet { x: number; y: number; vx: number; vy: number; owner: string; life: number; }
interface Asteroid { id: number; x: number; y: number; vx: number; vy: number; size: AsteroidSize; radius: number; }

interface AsteroidsState {
  players: { [id: string]: Ship };
  bullets: Bullet[];
  asteroids: Asteroid[];
  canvasWidth: number; canvasHeight: number;
  winner: string | null;
}

export const asteroidsGame: ServerGameModule = {
  info: {
    id: 'asteroids',
    name: 'Asteroids',
    description: 'Classic Asteroids PvP! Shoot asteroids and your opponent. 3 lives. A/D to rotate, W to thrust, Space to shoot.',
    maxDuration: 90,
  },

  create(ctx: MatchContext): GameInstance {
    const [p1, p2] = ctx.players;
    let running = true;
    let asteroidId = 0;
    const inputs: { [id: string]: { left: boolean; right: boolean; thrust: boolean; fire: boolean } } = {
      [p1]: { left: false, right: false, thrust: false, fire: false },
      [p2]: { left: false, right: false, thrust: false, fire: false },
    };

    const state: AsteroidsState = {
      players: {
        [p1]: { x: 150, y: H / 2, vx: 0, vy: 0, angle: 0, alive: true, lives: LIVES, iframeUntil: Date.now() + IFRAME_DURATION, lastFire: 0 },
        [p2]: { x: W - 150, y: H / 2, vx: 0, vy: 0, angle: Math.PI, alive: true, lives: LIVES, iframeUntil: Date.now() + IFRAME_DURATION, lastFire: 0 },
      },
      bullets: [],
      asteroids: [],
      canvasWidth: W, canvasHeight: H,
      winner: null,
    };

    function spawnAsteroid(x?: number, y?: number, size?: AsteroidSize): void {
      const s = size ?? 'large';
      const r = SIZE_RADIUS[s];
      const ax = x ?? (Math.random() < 0.5 ? -r : W + r);
      const ay = y ?? (Math.random() * H);
      const speed = s === 'large' ? 1 + Math.random() : s === 'medium' ? 1.5 + Math.random() : 2 + Math.random();
      const angle = Math.random() * Math.PI * 2;
      state.asteroids.push({ id: asteroidId++, x: ax, y: ay, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, size: s, radius: r });
    }

    function breakAsteroid(a: Asteroid): void {
      if (a.size === 'large') {
        spawnAsteroid(a.x, a.y, 'medium');
        spawnAsteroid(a.x, a.y, 'medium');
      } else if (a.size === 'medium') {
        spawnAsteroid(a.x, a.y, 'small');
        spawnAsteroid(a.x, a.y, 'small');
      }
    }

    function wrap(v: { x: number; y: number }, r: number): void {
      if (v.x < -r) v.x = W + r;
      if (v.x > W + r) v.x = -r;
      if (v.y < -r) v.y = H + r;
      if (v.y > H + r) v.y = -r;
    }

    function respawnShip(pid: string): void {
      const s = state.players[pid];
      s.x = pid === p1 ? 150 : W - 150;
      s.y = H / 2;
      s.vx = 0; s.vy = 0;
      s.alive = true;
      s.iframeUntil = Date.now() + IFRAME_DURATION;
    }

    // Spawn initial asteroids
    for (let i = 0; i < INITIAL_ASTEROIDS; i++) spawnAsteroid();

    const interval = setInterval(() => {
      if (!running) return;
      const now = Date.now();

      // Update ships
      for (const pid of ctx.players) {
        const s = state.players[pid];
        if (!s.alive) continue;
        const inp = inputs[pid];

        if (inp.left) s.angle -= TURN_SPEED;
        if (inp.right) s.angle += TURN_SPEED;
        if (inp.thrust) {
          s.vx += Math.cos(s.angle) * THRUST;
          s.vy += Math.sin(s.angle) * THRUST;
          const speed = Math.sqrt(s.vx * s.vx + s.vy * s.vy);
          if (speed > MAX_SPEED) { s.vx = (s.vx / speed) * MAX_SPEED; s.vy = (s.vy / speed) * MAX_SPEED; }
        }
        s.vx *= FRICTION; s.vy *= FRICTION;
        s.x += s.vx; s.y += s.vy;
        wrap(s, SHIP_R);

        if (inp.fire && now - s.lastFire >= FIRE_COOLDOWN) {
          inp.fire = false;
          s.lastFire = now;
          state.bullets.push({
            x: s.x + Math.cos(s.angle) * (SHIP_R + 4),
            y: s.y + Math.sin(s.angle) * (SHIP_R + 4),
            vx: Math.cos(s.angle) * BULLET_SPEED + s.vx * 0.3,
            vy: Math.sin(s.angle) * BULLET_SPEED + s.vy * 0.3,
            owner: pid, life: BULLET_LIFE,
          });
        }
      }

      // Update bullets
      state.bullets = state.bullets.filter((b) => {
        b.x += b.vx; b.y += b.vy;
        wrap(b, BULLET_R);
        b.life--;
        return b.life > 0;
      });

      // Update asteroids
      for (const a of state.asteroids) {
        a.x += a.vx; a.y += a.vy;
        wrap(a, a.radius);
      }

      // Bullet-asteroid collision
      const toBreak: Asteroid[] = [];
      state.bullets = state.bullets.filter((b) => {
        for (let i = state.asteroids.length - 1; i >= 0; i--) {
          const a = state.asteroids[i];
          const dx = b.x - a.x, dy = b.y - a.y;
          if (dx * dx + dy * dy < (BULLET_R + a.radius) ** 2) {
            toBreak.push(a);
            state.asteroids.splice(i, 1);
            return false;
          }
        }
        return true;
      });
      for (const a of toBreak) breakAsteroid(a);

      // Bullet-ship collision
      state.bullets = state.bullets.filter((b) => {
        for (const pid of ctx.players) {
          const s = state.players[pid];
          if (!s.alive || pid === b.owner || now < s.iframeUntil) continue;
          const dx = b.x - s.x, dy = b.y - s.y;
          if (dx * dx + dy * dy < (BULLET_R + SHIP_R) ** 2) {
            s.lives--;
            if (s.lives <= 0) {
              s.alive = false;
              running = false;
              const winner = pid === p1 ? p2 : p1;
              state.winner = winner;
              ctx.emit('game:state', state);
              ctx.endRound(winner);
              return false;
            }
            s.alive = false;
            setTimeout(() => { if (running) respawnShip(pid); }, RESPAWN_DELAY);
            return false;
          }
        }
        return true;
      });

      // Asteroid-ship collision
      for (const pid of ctx.players) {
        const s = state.players[pid];
        if (!s.alive || now < s.iframeUntil) continue;
        for (const a of state.asteroids) {
          const dx = s.x - a.x, dy = s.y - a.y;
          if (dx * dx + dy * dy < (SHIP_R + a.radius) ** 2) {
            s.lives--;
            if (s.lives <= 0) {
              s.alive = false;
              running = false;
              const winner = pid === p1 ? p2 : p1;
              state.winner = winner;
              ctx.emit('game:state', state);
              ctx.endRound(winner);
              return;
            }
            s.alive = false;
            setTimeout(() => { if (running) respawnShip(pid); }, RESPAWN_DELAY);
            break;
          }
        }
      }

      // Maintain asteroid count
      while (state.asteroids.length < MAX_ASTEROIDS) spawnAsteroid();

      ctx.emit('game:state', state);
    }, TICK_RATE);

    return {
      onPlayerInput(playerId: string, data: unknown): void {
        const input = data as { left?: boolean; right?: boolean; thrust?: boolean; fire?: boolean };
        const inp = inputs[playerId];
        if (!inp) return;
        if (input.left !== undefined) inp.left = input.left;
        if (input.right !== undefined) inp.right = input.right;
        if (input.thrust !== undefined) inp.thrust = input.thrust;
        if (input.fire) inp.fire = true;
      },
      getState() { return state; },
      cleanup(): void { running = false; clearInterval(interval); },
    };
  },
};
