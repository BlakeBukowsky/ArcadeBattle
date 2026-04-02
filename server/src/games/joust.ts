import type { ServerGameModule, MatchContext, GameInstance } from '@arcade-battle/shared';

const W = 800, H = 500;
const PLAYER_W = 24, PLAYER_H = 28;
const GRAVITY = 0.4;
const FLAP_POWER = -7;
const MOVE_SPEED = 4;
const POINTS_TO_WIN = 3;
const TICK_RATE = 1000 / 60;
const RESPAWN_DELAY = 1000;
const IFRAME_DURATION = 1500; // ms of invincibility after respawn
const FLOOR_Y = H - 30;

interface Platform { x: number; y: number; w: number; }

const FLOOR: Platform = { x: 0, y: FLOOR_Y, w: W };

const JOUST_LAYOUTS: { platforms: Platform[]; spawn1: number; spawn2: number }[] = [
  // Layout 0: Classic
  { platforms: [FLOOR, { x: 80, y: 340, w: 160 }, { x: W - 240, y: 340, w: 160 }, { x: W / 2 - 80, y: 240, w: 160 }, { x: 30, y: 160, w: 120 }, { x: W - 150, y: 160, w: 120 }], spawn1: 1, spawn2: 2 },
  // Layout 1: Staircase
  { platforms: [FLOOR, { x: 50, y: 380, w: 120 }, { x: 200, y: 310, w: 120 }, { x: 350, y: 240, w: 100 }, { x: 500, y: 310, w: 120 }, { x: 650, y: 380, w: 120 }], spawn1: 1, spawn2: 5 },
  // Layout 2: Tower
  { platforms: [FLOOR, { x: W / 2 - 60, y: 350, w: 120 }, { x: W / 2 - 50, y: 250, w: 100 }, { x: W / 2 - 40, y: 150, w: 80 }, { x: 40, y: 280, w: 100 }, { x: W - 140, y: 280, w: 100 }], spawn1: 4, spawn2: 5 },
  // Layout 3: Floating Islands
  { platforms: [FLOOR, { x: 60, y: 360, w: 90 }, { x: 220, y: 280, w: 90 }, { x: 380, y: 200, w: 90 }, { x: 500, y: 320, w: 90 }, { x: 650, y: 240, w: 90 }, { x: 350, y: 380, w: 80 }], spawn1: 1, spawn2: 4 },
];

interface PlayerState {
  x: number; y: number; vx: number; vy: number;
  alive: boolean;
  iframeUntil: number; // timestamp when iframes expire
}

interface JoustState {
  players: { [id: string]: PlayerState };
  scores: { [id: string]: number };
  platforms: Platform[];
  canvasWidth: number;
  canvasHeight: number;
}

export const joustGame: ServerGameModule = {
  info: {
    id: 'joust',
    name: 'Joust',
    description: 'Jousting arena — stomp from above!',
    controls: 'A/D to move, W/Space to flap. Land on opponent from above to score. First to 3.',
    maxDuration: 60,
  },

  create(ctx: MatchContext): GameInstance {
    const [p1, p2] = ctx.players;
    let running = true;
    const inputs: { [id: string]: { left: boolean; right: boolean; flap: boolean } } = {
      [p1]: { left: false, right: false, flap: false },
      [p2]: { left: false, right: false, flap: false },
    };

    const layout = JOUST_LAYOUTS[Math.floor(Math.random() * JOUST_LAYOUTS.length)];
    const platforms = layout.platforms;
    const spawnPlat1 = platforms[layout.spawn1];
    const spawnPlat2 = platforms[layout.spawn2];

    const state: JoustState = {
      players: {
        [p1]: { x: spawnPlat1.x + spawnPlat1.w / 2 - PLAYER_W / 2, y: spawnPlat1.y - PLAYER_H, vx: 0, vy: 0, alive: true, iframeUntil: 0 },
        [p2]: { x: spawnPlat2.x + spawnPlat2.w / 2 - PLAYER_W / 2, y: spawnPlat2.y - PLAYER_H, vx: 0, vy: 0, alive: true, iframeUntil: 0 },
      },
      scores: { [p1]: 0, [p2]: 0 },
      platforms,
      canvasWidth: W,
      canvasHeight: H,
    };

    function respawn(pid: string): void {
      const p = state.players[pid];
      const plat = pid === p1 ? spawnPlat1 : spawnPlat2;
      p.x = plat.x + plat.w / 2 - PLAYER_W / 2;
      p.y = plat.y - PLAYER_H;
      p.vx = 0;
      p.vy = 0;
      p.alive = true;
      p.iframeUntil = Date.now() + IFRAME_DURATION;
    }

    function checkPlatformCollision(p: PlayerState, prevY: number): void {
      if (p.vy < 0) return; // only collide when falling
      for (const plat of platforms) {
        const prevBottom = prevY + PLAYER_H;
        const curBottom = p.y + PLAYER_H;
        // Collide if feet crossed the platform top this frame
        if (
          p.x + PLAYER_W > plat.x && p.x < plat.x + plat.w &&
          prevBottom <= plat.y && curBottom >= plat.y
        ) {
          p.y = plat.y - PLAYER_H;
          p.vy = 0;
        }
      }
    }

    const interval = setInterval(() => {
      if (!running) return;

      for (const pid of ctx.players) {
        const p = state.players[pid];
        if (!p.alive) continue;
        const inp = inputs[pid];

        if (inp.left) p.vx = -MOVE_SPEED;
        else if (inp.right) p.vx = MOVE_SPEED;
        else p.vx *= 0.85;

        if (inp.flap) {
          p.vy = FLAP_POWER;
          inp.flap = false;
        }

        p.vy += GRAVITY;
        p.x += p.vx;
        const prevY = p.y;
        p.y += p.vy;

        // Wrap horizontal
        if (p.x < -PLAYER_W) p.x = W;
        if (p.x > W) p.x = -PLAYER_W;

        // Platform collision
        checkPlatformCollision(p, prevY);

        // Vertical wrapping (prevents ceiling camping)
        if (p.y < -PLAYER_H) p.y = H;
        if (p.y > H) p.y = -PLAYER_H;

        // (vertical wrapping handles top/bottom)
      }

      // Player collision (skip if either has iframes)
      const now = Date.now();
      const a = state.players[p1];
      const b = state.players[p2];
      if (a.alive && b.alive && now >= a.iframeUntil && now >= b.iframeUntil) {
        const dx = (a.x + PLAYER_W / 2) - (b.x + PLAYER_W / 2);
        const dy = (a.y + PLAYER_H / 2) - (b.y + PLAYER_H / 2);
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < PLAYER_W) {
          const aCenterY = a.y + PLAYER_H / 2;
          const bCenterY = b.y + PLAYER_H / 2;

          if (aCenterY < bCenterY - 5) {
            b.alive = false;
            a.vy = -5;
            state.scores[p1]++;
            if (state.scores[p1] >= POINTS_TO_WIN) {
              running = false;
              ctx.emit('game:state', state);
              ctx.endRound(p1);
              return;
            }
            setTimeout(() => { if (running) respawn(p2); }, RESPAWN_DELAY);
          } else if (bCenterY < aCenterY - 5) {
            a.alive = false;
            b.vy = -5;
            state.scores[p2]++;
            if (state.scores[p2] >= POINTS_TO_WIN) {
              running = false;
              ctx.emit('game:state', state);
              ctx.endRound(p2);
              return;
            }
            setTimeout(() => { if (running) respawn(p1); }, RESPAWN_DELAY);
          } else {
            a.vx = dx > 0 ? 4 : -4;
            b.vx = dx > 0 ? -4 : 4;
            a.vy = -3;
            b.vy = -3;
          }
        }
      }

      ctx.emit('game:state', state);
    }, TICK_RATE);

    return {
      onPlayerInput(playerId: string, data: unknown): void {
        const input = data as { left?: boolean; right?: boolean; flap?: boolean };
        const inp = inputs[playerId];
        if (!inp) return;
        if (input.left !== undefined) inp.left = input.left;
        if (input.right !== undefined) inp.right = input.right;
        if (input.flap) inp.flap = true;
      },
      getState() { return state; },
      cleanup(): void {
        running = false;
        clearInterval(interval);
      },
    };
  },
};
