import type { ServerGameModule, MatchContext, GameInstance } from '@arcade-battle/shared';

const W = 800, H = 500, HALF_W = 400;
const SHIP_W = 14, SHIP_H = 18;
const MOVE_SPEED = 4;
const BULLET_SPEED = 9;
const FIRE_COOLDOWN = 120;
const BOSS_W = 80, BOSS_H = 40;
const BOSS_MAX_HP = 90;
const PLAYER_LIVES = 3;
const IFRAME_DURATION = 1500;
const PROJ_R = 3;
const TICK_RATE = 1000 / 60;

type Phase = 'idle' | 'telegraph' | 'spiral' | 'rain' | 'wave' | 'cross' | 'shotgun';

const PATTERN: { phase: Phase; duration: number }[] = [
  { phase: 'idle', duration: 55 },
  { phase: 'telegraph', duration: 35 },
  { phase: 'spiral', duration: 100 },
  { phase: 'idle', duration: 50 },
  { phase: 'telegraph', duration: 35 },
  { phase: 'rain', duration: 80 },
  { phase: 'idle', duration: 50 },
  { phase: 'telegraph', duration: 35 },
  { phase: 'wave', duration: 90 },
  { phase: 'idle', duration: 50 },
  { phase: 'telegraph', duration: 35 },
  { phase: 'cross', duration: 75 },
  { phase: 'idle', duration: 50 },
  { phase: 'telegraph', duration: 35 },
  { phase: 'shotgun', duration: 65 },
];

interface BossProj { x: number; y: number; vx: number; vy: number; }
interface PlayerBullet { x: number; y: number; vy: number; }

interface PlayerState {
  x: number; y: number;
  alive: boolean; lives: number; iframeUntil: number; lastFire: number;
  bossHp: number; bossDefeated: boolean;
}

interface BossState {
  x: number; y: number;
  patternIndex: number; phaseTimer: number; phase: Phase;
}

interface SpaceBossState {
  players: { [id: string]: PlayerState };
  boss: BossState;
  playerBullets: { [id: string]: PlayerBullet[] };
  bossProjectiles: { [id: string]: BossProj[] };
  canvasWidth: number; canvasHeight: number;
  winner: string | null;
}

export const spaceBossGame: ServerGameModule = {
  info: {
    id: 'space-boss',
    name: 'Space Boss',
    description: 'Top-down bullet hell boss fight',
    controls: 'WASD to move freely, Space to shoot up. Dodge dense bullet patterns. 3 lives.',
    maxDuration: 120,
  },

  create(ctx: MatchContext): GameInstance {
    const [p1, p2] = ctx.players;
    let running = true;
    let tick = 0;
    const inputs: { [id: string]: { up: boolean; down: boolean; left: boolean; right: boolean; fire: boolean } } = {
      [p1]: { up: false, down: false, left: false, right: false, fire: false },
      [p2]: { up: false, down: false, left: false, right: false, fire: false },
    };

    const state: SpaceBossState = {
      players: {
        [p1]: { x: HALF_W / 2, y: H - 40, alive: true, lives: PLAYER_LIVES, iframeUntil: 0, lastFire: 0, bossHp: BOSS_MAX_HP, bossDefeated: false },
        [p2]: { x: HALF_W / 2, y: H - 40, alive: true, lives: PLAYER_LIVES, iframeUntil: 0, lastFire: 0, bossHp: BOSS_MAX_HP, bossDefeated: false },
      },
      boss: { x: HALF_W / 2 - BOSS_W / 2, y: 20, patternIndex: 0, phaseTimer: 0, phase: 'idle' },
      playerBullets: { [p1]: [], [p2]: [] },
      bossProjectiles: { [p1]: [], [p2]: [] },
      canvasWidth: W, canvasHeight: H,
      winner: null,
    };

    const interval = setInterval(() => {
      if (!running) return;
      tick++;
      const now = Date.now();
      const boss = state.boss;

      // Boss pattern
      boss.phaseTimer++;
      const cp = PATTERN[boss.patternIndex];
      if (boss.phaseTimer >= cp.duration) {
        boss.patternIndex = (boss.patternIndex + 1) % PATTERN.length;
        boss.phaseTimer = 0;
        boss.phase = PATTERN[boss.patternIndex].phase;
      }

      // Boss drift
      boss.x = HALF_W / 2 - BOSS_W / 2 + Math.sin(tick * 0.012) * 100;
      boss.y = 20 + Math.sin(tick * 0.008) * 15;

      const bx = boss.x + BOSS_W / 2, by = boss.y + BOSS_H;

      // Spawn boss projectiles per player
      for (const pid of ctx.players) {
        const p = state.players[pid];
        if (!p.alive) continue;
        const projs = state.bossProjectiles[pid];

        if (boss.phase === 'spiral' && boss.phaseTimer % 5 === 0) {
          const arms = 3;
          for (let a = 0; a < arms; a++) {
            const angle = (tick * 0.08) + (a / arms) * Math.PI * 2;
            projs.push({ x: bx, y: by, vx: Math.cos(angle) * 2.5, vy: Math.sin(angle) * 2.5 });
          }
        }

        if (boss.phase === 'rain' && boss.phaseTimer % 4 === 0) {
          const rx = Math.random() * HALF_W;
          projs.push({ x: rx, y: -5, vx: (Math.random() - 0.5) * 0.5, vy: 3 + Math.random() * 2 });
          projs.push({ x: rx + 30, y: -5, vx: (Math.random() - 0.5) * 0.5, vy: 2.5 + Math.random() * 2 });
        }

        if (boss.phase === 'wave' && boss.phaseTimer % 10 === 0) {
          const numBullets = 16;
          for (let i = 0; i < numBullets; i++) {
            const angle = (i / numBullets) * Math.PI * 2;
            const speed = 2 + Math.sin(boss.phaseTimer * 0.1 + i) * 0.8;
            projs.push({ x: bx, y: by, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed });
          }
        }

        if (boss.phase === 'cross' && boss.phaseTimer % 7 === 0) {
          const offsets = [0, Math.PI / 2, Math.PI, Math.PI * 1.5];
          const rot = tick * 0.03;
          for (const off of offsets) {
            const angle = off + rot;
            projs.push({ x: bx, y: by, vx: Math.cos(angle) * 3, vy: Math.sin(angle) * 3 });
            projs.push({ x: bx, y: by, vx: Math.cos(angle) * 2, vy: Math.sin(angle) * 2 });
          }
        }

        if (boss.phase === 'shotgun' && boss.phaseTimer % 15 === 0) {
          const dx = p.x + SHIP_W / 2 - bx;
          const dy = p.y + SHIP_H / 2 - by;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          const baseAngle = Math.atan2(dy, dx);
          for (let i = -4; i <= 4; i++) {
            const a = baseAngle + i * 0.12;
            const speed = 3 + Math.abs(i) * 0.3;
            projs.push({ x: bx, y: by, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed });
          }
        }
      }

      // Update players
      for (const pid of ctx.players) {
        const p = state.players[pid];
        if (!p.alive) continue;
        const inp = inputs[pid];

        if (inp.left) p.x -= MOVE_SPEED;
        if (inp.right) p.x += MOVE_SPEED;
        if (inp.up) p.y -= MOVE_SPEED;
        if (inp.down) p.y += MOVE_SPEED;

        p.x = Math.max(0, Math.min(HALF_W - SHIP_W, p.x));
        p.y = Math.max(40, Math.min(H - SHIP_H, p.y));

        if (inp.fire && now - p.lastFire >= FIRE_COOLDOWN) {
          inp.fire = false;
          p.lastFire = now;
          state.playerBullets[pid].push({ x: p.x + SHIP_W / 2 - 1, y: p.y - 4, vy: -BULLET_SPEED });
        }
      }

      // Update player bullets
      for (const pid of ctx.players) {
        const p = state.players[pid];
        state.playerBullets[pid] = state.playerBullets[pid].filter((b) => {
          b.y += b.vy;
          if (b.y < -10) return false;
          if (b.x > boss.x && b.x < boss.x + BOSS_W && b.y < boss.y + BOSS_H && b.y > boss.y) {
            p.bossHp = Math.max(0, p.bossHp - 1);
            if (p.bossHp <= 0 && !p.bossDefeated) {
              p.bossDefeated = true;
              running = false;
              state.winner = pid;
              ctx.emit('game:state', state);
              ctx.endRound(pid);
            }
            return false;
          }
          return true;
        });
      }

      // Update boss projectiles
      for (const pid of ctx.players) {
        const p = state.players[pid];
        state.bossProjectiles[pid] = state.bossProjectiles[pid].filter((proj) => {
          proj.x += proj.vx; proj.y += proj.vy;
          if (proj.x < -20 || proj.x > HALF_W + 20 || proj.y < -20 || proj.y > H + 20) return false;

          if (p.alive && now >= p.iframeUntil) {
            const dx = proj.x - (p.x + SHIP_W / 2);
            const dy = proj.y - (p.y + SHIP_H / 2);
            if (dx * dx + dy * dy < (PROJ_R + SHIP_W / 2) ** 2) {
              p.lives--;
              p.iframeUntil = now + IFRAME_DURATION;
              if (p.lives <= 0) {
                p.alive = false;
                const opponent = pid === p1 ? p2 : p1;
                running = false;
                state.winner = opponent;
                ctx.emit('game:state', state);
                ctx.endRound(opponent);
              }
              return false;
            }
          }
          return true;
        });
      }

      ctx.emit('game:state', state);
    }, TICK_RATE);

    return {
      onPlayerInput(playerId: string, data: unknown): void {
        const input = data as { up?: boolean; down?: boolean; left?: boolean; right?: boolean; fire?: boolean };
        const inp = inputs[playerId];
        if (!inp) return;
        if (input.up !== undefined) inp.up = input.up;
        if (input.down !== undefined) inp.down = input.down;
        if (input.left !== undefined) inp.left = input.left;
        if (input.right !== undefined) inp.right = input.right;
        if (input.fire) inp.fire = true;
      },
      getState() { return state; },
      cleanup(): void { running = false; clearInterval(interval); },
    };
  },
};
