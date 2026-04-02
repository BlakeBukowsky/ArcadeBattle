import type { ServerGameModule, MatchContext, GameInstance } from '@arcade-battle/shared';

const W = 800, H = 500;
const HALF_W = W / 2;
const PLAYER_W = 24, PLAYER_H = 16;
const PLAYER_Y = H - 40;
const MOVE_SPEED = 4;
const BULLET_SPEED = 7;
const BULLET_W = 3, BULLET_H = 10;
const INVADER_W = 22, INVADER_H = 16;
const INVADER_COLS = 8, INVADER_ROWS = 4;
const INVADER_SPACING_X = 36, INVADER_SPACING_Y = 28;
const INVADER_MOVE_SPEED = 0.8;
const INVADER_DROP = 12;
const INVADER_SHOOT_CHANCE = 0.0008;
const INVADER_BULLET_SPEED = 3;
const FIRE_COOLDOWN = 300;
const TICK_RATE = 1000 / 60;

interface Invader { col: number; row: number; alive: boolean; }
interface Bullet { x: number; y: number; vy: number; }

interface PlayerState {
  x: number;
  alive: boolean;
  bullets: Bullet[];
  invaders: Invader[];
  invaderX: number;
  invaderDir: 1 | -1;
  invaderBullets: Bullet[];
  killCount: number;
  lastFire: number;
}

interface SpaceInvadersState {
  players: { [id: string]: PlayerState };
  canvasWidth: number;
  canvasHeight: number;
  winner: string | null;
  totalInvaders: number;
}

export const spaceInvadersGame: ServerGameModule = {
  info: {
    id: 'space-invaders',
    name: 'Space Invaders',
    description: 'Race to clear the alien wave first! Getting hit by an alien bullet means you lose. A/D to move, Space to shoot.',
    maxDuration: 90,
  },

  create(ctx: MatchContext): GameInstance {
    const [p1, p2] = ctx.players;
    let running = true;
    const totalInvaders = INVADER_COLS * INVADER_ROWS;
    const inputs: { [id: string]: { left: boolean; right: boolean; fire: boolean } } = {
      [p1]: { left: false, right: false, fire: false },
      [p2]: { left: false, right: false, fire: false },
    };

    function makeInvaders(): Invader[] {
      const invaders: Invader[] = [];
      for (let r = 0; r < INVADER_ROWS; r++) {
        for (let c = 0; c < INVADER_COLS; c++) {
          invaders.push({ col: c, row: r, alive: true });
        }
      }
      return invaders;
    }

    const startX = (HALF_W - INVADER_COLS * INVADER_SPACING_X) / 2;

    const state: SpaceInvadersState = {
      players: {
        [p1]: { x: HALF_W / 2, alive: true, bullets: [], invaders: makeInvaders(), invaderX: startX, invaderDir: 1, invaderBullets: [], killCount: 0, lastFire: 0 },
        [p2]: { x: HALF_W / 2, alive: true, bullets: [], invaders: makeInvaders(), invaderX: startX, invaderDir: 1, invaderBullets: [], killCount: 0, lastFire: 0 },
      },
      canvasWidth: W,
      canvasHeight: H,
      winner: null,
      totalInvaders,
    };

    const interval = setInterval(() => {
      if (!running) return;
      const now = Date.now();

      for (const pid of ctx.players) {
        const p = state.players[pid];
        if (!p.alive) continue;
        const inp = inputs[pid];

        // Move player
        if (inp.left) p.x = Math.max(0, p.x - MOVE_SPEED);
        if (inp.right) p.x = Math.min(HALF_W - PLAYER_W, p.x + MOVE_SPEED);

        // Fire
        if (inp.fire && now - p.lastFire >= FIRE_COOLDOWN) {
          p.bullets.push({ x: p.x + PLAYER_W / 2 - BULLET_W / 2, y: PLAYER_Y - BULLET_H, vy: -BULLET_SPEED });
          p.lastFire = now;
          inp.fire = false;
        }

        // Move bullets
        p.bullets = p.bullets.filter((b) => {
          b.y += b.vy;
          return b.y > -BULLET_H;
        });

        // Move invaders
        const aliveInvaders = p.invaders.filter((inv) => inv.alive);
        if (aliveInvaders.length > 0) {
          p.invaderX += INVADER_MOVE_SPEED * p.invaderDir;

          // Check boundaries
          let needDrop = false;
          for (const inv of aliveInvaders) {
            const ix = p.invaderX + inv.col * INVADER_SPACING_X;
            if (ix < 0 || ix + INVADER_W > HALF_W) {
              needDrop = true;
              break;
            }
          }
          if (needDrop) {
            p.invaderDir *= -1;
            p.invaderX += INVADER_MOVE_SPEED * p.invaderDir * 2;
            for (const inv of p.invaders) {
              inv.row += INVADER_DROP / INVADER_SPACING_Y;
            }
          }

          // Invader shooting
          for (const inv of aliveInvaders) {
            if (Math.random() < INVADER_SHOOT_CHANCE) {
              const ix = p.invaderX + inv.col * INVADER_SPACING_X + INVADER_W / 2;
              const iy = 40 + inv.row * INVADER_SPACING_Y + INVADER_H;
              p.invaderBullets.push({ x: ix, y: iy, vy: INVADER_BULLET_SPEED });
            }
          }
        }

        // Move invader bullets
        p.invaderBullets = p.invaderBullets.filter((b) => {
          b.y += b.vy;
          return b.y < H;
        });

        // Bullet-invader collision
        for (const bullet of p.bullets) {
          for (const inv of p.invaders) {
            if (!inv.alive) continue;
            const ix = p.invaderX + inv.col * INVADER_SPACING_X;
            const iy = 40 + inv.row * INVADER_SPACING_Y;
            if (bullet.x + BULLET_W > ix && bullet.x < ix + INVADER_W &&
                bullet.y < iy + INVADER_H && bullet.y + BULLET_H > iy) {
              inv.alive = false;
              bullet.y = -100;
              p.killCount++;
              break;
            }
          }
        }

        // Invader bullet hitting player
        for (const b of p.invaderBullets) {
          if (b.x + BULLET_W > p.x && b.x < p.x + PLAYER_W &&
              b.y + BULLET_H > PLAYER_Y && b.y < PLAYER_Y + PLAYER_H) {
            p.alive = false;
            break;
          }
        }
      }

      // Check win
      const cleared1 = state.players[p1].killCount >= totalInvaders;
      const cleared2 = state.players[p2].killCount >= totalInvaders;
      const alive1 = state.players[p1].alive;
      const alive2 = state.players[p2].alive;

      if (cleared1 && !cleared2) {
        running = false; state.winner = p1;
        ctx.emit('game:state', state); ctx.endRound(p1); return;
      }
      if (cleared2 && !cleared1) {
        running = false; state.winner = p2;
        ctx.emit('game:state', state); ctx.endRound(p2); return;
      }
      if (cleared1 && cleared2) {
        // Both cleared same frame — whoever killed more overall (shouldn't happen, but)
        running = false; const w = Math.random() < 0.5 ? p1 : p2;
        state.winner = w; ctx.emit('game:state', state); ctx.endRound(w); return;
      }
      if (!alive1 && alive2) {
        running = false; state.winner = p2;
        ctx.emit('game:state', state); ctx.endRound(p2); return;
      }
      if (alive1 && !alive2) {
        running = false; state.winner = p1;
        ctx.emit('game:state', state); ctx.endRound(p1); return;
      }
      if (!alive1 && !alive2) {
        // Both dead — whoever had more kills
        running = false;
        const w = state.players[p1].killCount >= state.players[p2].killCount ? p1 : p2;
        state.winner = w; ctx.emit('game:state', state); ctx.endRound(w); return;
      }

      ctx.emit('game:state', state);
    }, TICK_RATE);

    return {
      onPlayerInput(playerId: string, data: unknown): void {
        const input = data as { left?: boolean; right?: boolean; fire?: boolean };
        const inp = inputs[playerId];
        if (!inp) return;
        if (input.left !== undefined) inp.left = input.left;
        if (input.right !== undefined) inp.right = input.right;
        if (input.fire) inp.fire = true;
      },
      getState() { return state; },
      cleanup(): void { running = false; clearInterval(interval); },
    };
  },
};
