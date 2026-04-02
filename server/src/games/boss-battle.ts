import type { ServerGameModule, MatchContext, GameInstance } from '@arcade-battle/shared';

const W = 800, H = 500, HALF_W = 400;
const PW = 14, PH = 20;
const GRAVITY = 0.4;
const MOVE_SPEED = 3.5;
const JUMP_POWER = -9;
const PLAYER_BULLET_SPEED = 8;
const FIRE_COOLDOWN = 200;
const BOSS_W = 70, BOSS_H = 50;
const BOSS_MAX_HP = 80;
const PLAYER_LIVES = 3;
const IFRAME_DURATION = 1500;
const FLOOR_Y = H - 30;
const TICK_RATE = 1000 / 60;
const PROJ_R = 4;

type Phase = 'idle' | 'telegraph' | 'radial' | 'aimed' | 'sweep' | 'slam';

const PATTERN: { phase: Phase; duration: number }[] = [
  { phase: 'idle', duration: 60 },
  { phase: 'telegraph', duration: 40 },
  { phase: 'radial', duration: 90 },
  { phase: 'idle', duration: 50 },
  { phase: 'telegraph', duration: 40 },
  { phase: 'aimed', duration: 80 },
  { phase: 'idle', duration: 50 },
  { phase: 'telegraph', duration: 40 },
  { phase: 'sweep', duration: 100 },
  { phase: 'idle', duration: 50 },
  { phase: 'telegraph', duration: 40 },
  { phase: 'slam', duration: 70 },
];

interface BossProj { x: number; y: number; vx: number; vy: number; }
interface PlayerBullet { x: number; y: number; vy: number; }

interface PlayerState {
  x: number; y: number; vx: number; vy: number;
  grounded: boolean; alive: boolean;
  lives: number; iframeUntil: number; lastFire: number;
  bossHp: number; bossDefeated: boolean;
}

interface BossState {
  x: number; y: number;
  patternIndex: number; phaseTimer: number;
  phase: Phase;
}

interface BossBattleState {
  players: { [id: string]: PlayerState };
  boss: BossState;
  playerBullets: { [id: string]: PlayerBullet[] };
  bossProjectiles: { [id: string]: BossProj[] };
  platforms: { x: number; y: number; w: number }[];
  canvasWidth: number; canvasHeight: number;
  winner: string | null;
}

export const bossBattleGame: ServerGameModule = {
  info: {
    id: 'boss-battle',
    name: 'Boss Battle',
    description: 'Bullet hell boss fight',
    controls: 'A/D to move, W to jump, Space to shoot. Dodge boss attacks. 3 lives. First to kill boss wins.',
    maxDuration: 120,
  },

  create(ctx: MatchContext): GameInstance {
    const [p1, p2] = ctx.players;
    let running = true;
    const inputs: { [id: string]: { left: boolean; right: boolean; jump: boolean; fire: boolean } } = {
      [p1]: { left: false, right: false, jump: false, fire: false },
      [p2]: { left: false, right: false, jump: false, fire: false },
    };

    const platforms = [
      { x: 0, y: FLOOR_Y, w: HALF_W },
      { x: 60, y: FLOOR_Y - 100, w: 80 },
      { x: HALF_W - 140, y: FLOOR_Y - 100, w: 80 },
      { x: HALF_W / 2 - 40, y: FLOOR_Y - 180, w: 80 },
    ];

    const state: BossBattleState = {
      players: {
        [p1]: { x: HALF_W / 2, y: FLOOR_Y - PH, vx: 0, vy: 0, grounded: true, alive: true, lives: PLAYER_LIVES, iframeUntil: 0, lastFire: 0, bossHp: BOSS_MAX_HP, bossDefeated: false },
        [p2]: { x: HALF_W / 2, y: FLOOR_Y - PH, vx: 0, vy: 0, grounded: true, alive: true, lives: PLAYER_LIVES, iframeUntil: 0, lastFire: 0, bossHp: BOSS_MAX_HP, bossDefeated: false },
      },
      boss: { x: HALF_W / 2 - BOSS_W / 2, y: 30, patternIndex: 0, phaseTimer: 0, phase: 'idle' },
      playerBullets: { [p1]: [], [p2]: [] },
      bossProjectiles: { [p1]: [], [p2]: [] },
      platforms,
      canvasWidth: W, canvasHeight: H,
      winner: null,
    };

    let tick = 0;

    const interval = setInterval(() => {
      if (!running) return;
      tick++;
      const now = Date.now();
      const boss = state.boss;

      // Boss pattern
      boss.phaseTimer++;
      const currentPattern = PATTERN[boss.patternIndex];
      if (boss.phaseTimer >= currentPattern.duration) {
        boss.patternIndex = (boss.patternIndex + 1) % PATTERN.length;
        boss.phaseTimer = 0;
        boss.phase = PATTERN[boss.patternIndex].phase;
      }

      // Boss drift
      boss.x = HALF_W / 2 - BOSS_W / 2 + Math.sin(tick * 0.015) * 80;

      // Spawn boss projectiles per player
      for (const pid of ctx.players) {
        const p = state.players[pid];
        if (!p.alive) continue;
        const projs = state.bossProjectiles[pid];

        if (boss.phase === 'radial' && boss.phaseTimer % 12 === 0) {
          // Radial burst — circle of bullets
          const numBullets = 12;
          for (let i = 0; i < numBullets; i++) {
            const angle = (i / numBullets) * Math.PI * 2 + tick * 0.05;
            projs.push({ x: boss.x + BOSS_W / 2, y: boss.y + BOSS_H, vx: Math.cos(angle) * 2.5, vy: Math.sin(angle) * 2.5 });
          }
        }

        if (boss.phase === 'aimed' && boss.phaseTimer % 8 === 0) {
          // Aimed stream at player
          const dx = p.x + PW / 2 - (boss.x + BOSS_W / 2);
          const dy = p.y + PH / 2 - (boss.y + BOSS_H);
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          const speed = 3.5;
          projs.push({ x: boss.x + BOSS_W / 2, y: boss.y + BOSS_H, vx: (dx / dist) * speed, vy: (dy / dist) * speed });
          // Add spread
          const spread = 0.2;
          projs.push({ x: boss.x + BOSS_W / 2, y: boss.y + BOSS_H, vx: (dx / dist) * speed + spread, vy: (dy / dist) * speed + spread });
          projs.push({ x: boss.x + BOSS_W / 2, y: boss.y + BOSS_H, vx: (dx / dist) * speed - spread, vy: (dy / dist) * speed - spread });
        }

        if (boss.phase === 'sweep' && boss.phaseTimer % 6 === 0) {
          // Sweeping wave across the screen
          const angle = (boss.phaseTimer / 100) * Math.PI;
          projs.push({ x: boss.x + BOSS_W / 2, y: boss.y + BOSS_H, vx: Math.cos(angle) * 3, vy: 2 + Math.sin(angle) * 0.5 });
        }

        if (boss.phase === 'slam' && boss.phaseTimer === 1) {
          // Ground slam — pillars of bullets from the floor
          for (let sx = 20; sx < HALF_W; sx += 35) {
            projs.push({ x: sx, y: FLOOR_Y - 5, vx: 0, vy: -3 - Math.random() * 2 });
          }
        }
      }

      // Update players
      for (const pid of ctx.players) {
        const p = state.players[pid];
        if (!p.alive) continue;
        const inp = inputs[pid];

        if (inp.left) p.vx = -MOVE_SPEED;
        else if (inp.right) p.vx = MOVE_SPEED;
        else p.vx *= 0.7;

        if (inp.jump && p.grounded) { p.vy = JUMP_POWER; p.grounded = false; inp.jump = false; }
        p.vy += GRAVITY;
        p.x += p.vx; p.y += p.vy;

        if (p.x < 0) p.x = 0;
        if (p.x + PW > HALF_W) p.x = HALF_W - PW;

        p.grounded = false;
        for (const plat of platforms) {
          if (p.vy >= 0 && p.x + PW > plat.x && p.x < plat.x + plat.w && p.y + PH >= plat.y && p.y + PH <= plat.y + 12) {
            p.y = plat.y - PH; p.vy = 0; p.grounded = true;
          }
        }

        // Fire
        if (inp.fire && now - p.lastFire >= FIRE_COOLDOWN) {
          inp.fire = false; p.lastFire = now;
          state.playerBullets[pid].push({ x: p.x + PW / 2 - 2, y: p.y, vy: -PLAYER_BULLET_SPEED });
        }
      }

      // Update player bullets
      for (const pid of ctx.players) {
        const p = state.players[pid];
        state.playerBullets[pid] = state.playerBullets[pid].filter((b) => {
          b.y += b.vy;
          if (b.y < 0) return false;

          // Hit boss?
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

          // Hit player?
          if (p.alive && now >= p.iframeUntil) {
            const dx = proj.x - (p.x + PW / 2);
            const dy = proj.y - (p.y + PH / 2);
            if (dx * dx + dy * dy < (PROJ_R + PW / 2) ** 2) {
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
        const input = data as { left?: boolean; right?: boolean; jump?: boolean; fire?: boolean };
        const inp = inputs[playerId];
        if (!inp) return;
        if (input.left !== undefined) inp.left = input.left;
        if (input.right !== undefined) inp.right = input.right;
        if (input.jump) inp.jump = true;
        if (input.fire) inp.fire = true;
      },
      getState() { return state; },
      cleanup(): void { running = false; clearInterval(interval); },
    };
  },
};
