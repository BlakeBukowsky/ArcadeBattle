import type { ServerGameModule, MatchContext, GameInstance } from '@arcade-battle/shared';

const W = 800, H = 500;
const PW = 16, PH = 22;
const GRAVITY = 0.4;
const MOVE_SPEED = 3.5;
const JUMP_POWER = -10.5;
const BULLET_SPEED = 8;
const BULLET_R = 4;
const FIRE_COOLDOWN = 600;
const MAX_BOUNCES = 1;
const ROUNDS_TO_WIN = 3;
const IFRAME_DURATION = 1000;
const RESPAWN_DELAY = 800;
const TICK_RATE = 1000 / 60;

interface Plat { x: number; y: number; w: number; }
interface Bullet { x: number; y: number; vx: number; vy: number; owner: string; bounces: number; life: number; }

const FLOOR: Plat = { x: 0, y: H - 20, w: W };

const MAPS: Plat[][] = [
  // Map 0: Arena — open with high ground
  [FLOOR,
    { x: 180, y: 370, w: 100 },
    { x: W - 280, y: 370, w: 100 },
    { x: 320, y: 280, w: 160 },
    { x: 80, y: 200, w: 90 },
    { x: W - 170, y: 200, w: 90 },
    { x: 350, y: 140, w: 100 },
  ],
  // Map 1: Pillars — vertical play with gaps
  [FLOOR,
    { x: 130, y: 380, w: 70 },
    { x: 130, y: 260, w: 70 },
    { x: W - 200, y: 380, w: 70 },
    { x: W - 200, y: 260, w: 70 },
    { x: 350, y: 330, w: 100 },
    { x: 350, y: 180, w: 100 },
    { x: 250, y: 100, w: 60 },
    { x: W - 310, y: 100, w: 60 },
  ],
  // Map 2: Zigzag — ascending platforms
  [FLOOR,
    { x: 60, y: 390, w: 90 },
    { x: 220, y: 330, w: 90 },
    { x: 400, y: 270, w: 90 },
    { x: 560, y: 330, w: 90 },
    { x: 700, y: 390, w: 80 },
    { x: 300, y: 170, w: 80 },
    { x: 500, y: 170, w: 80 },
  ],
  // Map 3: Bunker — two shelves with ground cover
  [FLOOR,
    { x: 0, y: 340, w: 250 },
    { x: W - 250, y: 340, w: 250 },
    { x: 300, y: 220, w: 200 },
    { x: 100, y: 160, w: 80 },
    { x: W - 180, y: 160, w: 80 },
  ],
  // Map 4: Chaos — scattered small platforms
  [FLOOR,
    { x: 80, y: 400, w: 60 },
    { x: 200, y: 350, w: 60 },
    { x: 340, y: 300, w: 60 },
    { x: 480, y: 350, w: 60 },
    { x: 620, y: 400, w: 60 },
    { x: 140, y: 230, w: 70 },
    { x: 400, y: 180, w: 70 },
    { x: 600, y: 250, w: 70 },
    { x: 350, y: 100, w: 100 },
  ],
  // Map 5: Pit — no floor, just platforms
  [
    { x: 50, y: 420, w: 120 },
    { x: W - 170, y: 420, w: 120 },
    { x: 200, y: 340, w: 100 },
    { x: W - 300, y: 340, w: 100 },
    { x: 320, y: 250, w: 160 },
    { x: 100, y: 170, w: 80 },
    { x: W - 180, y: 170, w: 80 },
    { x: 350, y: 100, w: 100 },
  ],
];

interface PlayerState {
  x: number; y: number; vx: number; vy: number;
  grounded: boolean; facing: 1 | -1;
  aimAngle: number;
  alive: boolean; iframeUntil: number; lastFire: number;
}

interface RoundsState {
  players: { [id: string]: PlayerState };
  bullets: Bullet[];
  platforms: Plat[];
  scores: { [id: string]: number };
  roundsToWin: number;
  roundActive: boolean;
  canvasWidth: number; canvasHeight: number;
  winner: string | null;
}

export const roundsGame: ServerGameModule = {
  info: {
    id: 'rounds',
    name: 'Rounds',
    description: '2D arena shooter with bouncing bullets',
    controls: 'A/D to move, W to jump, Space to shoot. Bullets bounce once. First to 3 round wins.',
    maxDuration: 120,
  },

  create(ctx: MatchContext): GameInstance {
    const [p1, p2] = ctx.players;
    let running = true;
    let currentMapIndex = Math.floor(Math.random() * MAPS.length);
    const inputs: { [id: string]: { left: boolean; right: boolean; jump: boolean; fire: boolean } } = {
      [p1]: { left: false, right: false, jump: false, fire: false },
      [p2]: { left: false, right: false, jump: false, fire: false },
    };

    const state: RoundsState = {
      players: {
        [p1]: { x: 100, y: H - 60, vx: 0, vy: 0, grounded: true, facing: 1, aimAngle: 0, alive: true, iframeUntil: Date.now() + IFRAME_DURATION, lastFire: 0 },
        [p2]: { x: W - 100 - PW, y: H - 60, vx: 0, vy: 0, grounded: true, facing: -1, aimAngle: Math.PI, alive: true, iframeUntil: Date.now() + IFRAME_DURATION, lastFire: 0 },
      },
      bullets: [],
      platforms: MAPS[currentMapIndex],
      scores: { [p1]: 0, [p2]: 0 },
      roundsToWin: ROUNDS_TO_WIN,
      roundActive: true,
      canvasWidth: W, canvasHeight: H,
      winner: null,
    };

    function startNewRound(loser: string): void {
      // Pick new map
      let newMap = Math.floor(Math.random() * MAPS.length);
      while (newMap === currentMapIndex && MAPS.length > 1) newMap = Math.floor(Math.random() * MAPS.length);
      currentMapIndex = newMap;
      state.platforms = MAPS[currentMapIndex];

      // Reset players
      state.players[p1].x = 100; state.players[p1].y = H - 60;
      state.players[p1].vx = 0; state.players[p1].vy = 0;
      state.players[p1].alive = true; state.players[p1].facing = 1;
      state.players[p1].aimAngle = 0;
      state.players[p1].iframeUntil = Date.now() + IFRAME_DURATION;

      state.players[p2].x = W - 100 - PW; state.players[p2].y = H - 60;
      state.players[p2].vx = 0; state.players[p2].vy = 0;
      state.players[p2].alive = true; state.players[p2].facing = -1;
      state.players[p2].aimAngle = Math.PI;
      state.players[p2].iframeUntil = Date.now() + IFRAME_DURATION;

      state.bullets = [];
      state.roundActive = true;
    }

    const interval = setInterval(() => {
      if (!running) return;
      const now = Date.now();

      if (!state.roundActive) {
        ctx.emit('game:state', state);
        return;
      }

      // Update players
      for (const pid of ctx.players) {
        const p = state.players[pid];
        if (!p.alive) continue;
        const inp = inputs[pid];

        if (inp.left) { p.vx = -MOVE_SPEED; p.facing = -1; }
        else if (inp.right) { p.vx = MOVE_SPEED; p.facing = 1; }
        else p.vx *= 0.75;

        if (inp.jump) { if (p.grounded) { p.vy = JUMP_POWER; p.grounded = false; } inp.jump = false; }
        p.vy += GRAVITY;
        p.x += p.vx; p.y += p.vy;

        // Walls
        if (p.x < 0) p.x = 0;
        if (p.x + PW > W) p.x = W - PW;

        // Platform collision
        p.grounded = false;
        for (const plat of state.platforms) {
          if (p.vy >= 0 && p.x + PW > plat.x && p.x < plat.x + plat.w && p.y + PH >= plat.y && p.y + PH <= plat.y + 12) {
            p.y = plat.y - PH; p.vy = 0; p.grounded = true;
          }
        }

        // Fall off bottom
        if (p.y > H + 50) {
          p.y = H - 60; p.x = W / 2; p.vy = 0; p.vx = 0;
        }

        // Fire
        if (inp.fire && now - p.lastFire >= FIRE_COOLDOWN) {
          inp.fire = false;
          p.lastFire = now;
          state.bullets.push({
            x: p.x + PW / 2 + Math.cos(p.aimAngle) * (PW / 2 + 2),
            y: p.y + PH / 2 + Math.sin(p.aimAngle) * (PH / 2 + 2),
            vx: Math.cos(p.aimAngle) * BULLET_SPEED,
            vy: Math.sin(p.aimAngle) * BULLET_SPEED,
            owner: pid,
            bounces: 0,
            life: 120,
          });
        }
      }

      // Update bullets
      state.bullets = state.bullets.filter((b) => {
        b.x += b.vx; b.y += b.vy;
        b.vy += GRAVITY * 0.15; // slight bullet drop
        b.life--;
        if (b.life <= 0) return false;

        // Wall bounce (sides)
        if (b.x < 0 || b.x > W) {
          if (b.bounces >= MAX_BOUNCES) return false;
          b.vx = -b.vx;
          b.x = Math.max(0, Math.min(W, b.x));
          b.bounces++;
        }

        // Platform bounce
        for (const plat of state.platforms) {
          if (b.x + BULLET_R > plat.x && b.x - BULLET_R < plat.x + plat.w) {
            // Top/bottom
            if (b.y + BULLET_R > plat.y && b.y - BULLET_R < plat.y + 10 && b.vy > 0) {
              if (b.bounces >= MAX_BOUNCES) return false;
              b.vy = -Math.abs(b.vy);
              b.y = plat.y - BULLET_R;
              b.bounces++;
            } else if (b.y - BULLET_R < plat.y + 10 && b.y + BULLET_R > plat.y && b.vy < 0) {
              if (b.bounces >= MAX_BOUNCES) return false;
              b.vy = Math.abs(b.vy);
              b.bounces++;
            }
          }
        }

        // Hit player
        for (const pid of ctx.players) {
          if (pid === b.owner) continue;
          const p = state.players[pid];
          if (!p.alive || now < p.iframeUntil) continue;
          const dx = b.x - (p.x + PW / 2), dy = b.y - (p.y + PH / 2);
          if (Math.abs(dx) < PW / 2 + BULLET_R && Math.abs(dy) < PH / 2 + BULLET_R) {
            // Hit!
            p.alive = false;
            const scorer = b.owner;
            state.scores[scorer]++;
            state.roundActive = false;

            if (state.scores[scorer] >= ROUNDS_TO_WIN) {
              running = false;
              state.winner = scorer;
              ctx.emit('game:state', state);
              ctx.endRound(scorer);
              return false;
            }

            // Start new round after delay
            setTimeout(() => {
              if (running) startNewRound(pid);
            }, RESPAWN_DELAY);

            return false;
          }
        }

        return true;
      });

      ctx.emit('game:state', state);
    }, TICK_RATE);

    return {
      onPlayerInput(playerId: string, data: unknown): void {
        const input = data as { left?: boolean; right?: boolean; jump?: boolean; fire?: boolean; aimAngle?: number };
        const inp = inputs[playerId];
        if (!inp) return;
        if (input.left !== undefined) inp.left = input.left;
        if (input.right !== undefined) inp.right = input.right;
        if (input.jump) inp.jump = true;
        if (input.fire) inp.fire = true;
        if (input.aimAngle !== undefined) {
          state.players[playerId].aimAngle = input.aimAngle;
          state.players[playerId].facing = Math.cos(input.aimAngle) >= 0 ? 1 : -1;
        }
      },
      getState() { return state; },
      cleanup(): void { running = false; clearInterval(interval); },
    };
  },
};
