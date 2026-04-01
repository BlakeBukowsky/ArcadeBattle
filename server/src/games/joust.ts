import type { ServerGameModule, MatchContext, GameInstance } from '@arcade-battle/shared';

const W = 800, H = 500;
const PLAYER_W = 24, PLAYER_H = 28;
const GRAVITY = 0.4;
const FLAP_POWER = -7;
const MOVE_SPEED = 4;
const POINTS_TO_WIN = 3;
const TICK_RATE = 1000 / 60;
const RESPAWN_DELAY = 1000;
const FLOOR_Y = H - 30;

interface Platform { x: number; y: number; w: number; }

const PLATFORMS: Platform[] = [
  // Floor
  { x: 0, y: FLOOR_Y, w: W },
  // Mid-level platforms
  { x: 80, y: 340, w: 160 },
  { x: W - 240, y: 340, w: 160 },
  // Upper platforms
  { x: W / 2 - 80, y: 240, w: 160 },
  // Top shelves
  { x: 30, y: 160, w: 120 },
  { x: W - 150, y: 160, w: 120 },
];

interface PlayerState {
  x: number; y: number; vx: number; vy: number;
  alive: boolean;
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
    description: 'Flap to fly, land on your opponent from above to score! First to 3. Use A/D to move, W or Space to flap.',
    maxDuration: 60,
  },

  create(ctx: MatchContext): GameInstance {
    const [p1, p2] = ctx.players;
    let running = true;
    const inputs: { [id: string]: { left: boolean; right: boolean; flap: boolean } } = {
      [p1]: { left: false, right: false, flap: false },
      [p2]: { left: false, right: false, flap: false },
    };

    const state: JoustState = {
      players: {
        [p1]: { x: 120, y: PLATFORMS[1].y - PLAYER_H, vx: 0, vy: 0, alive: true },
        [p2]: { x: W - 120 - PLAYER_W, y: PLATFORMS[2].y - PLAYER_H, vx: 0, vy: 0, alive: true },
      },
      scores: { [p1]: 0, [p2]: 0 },
      platforms: PLATFORMS,
      canvasWidth: W,
      canvasHeight: H,
    };

    function respawn(pid: string): void {
      const p = state.players[pid];
      const plat = pid === p1 ? PLATFORMS[1] : PLATFORMS[2];
      p.x = plat.x + plat.w / 2 - PLAYER_W / 2;
      p.y = plat.y - PLAYER_H;
      p.vx = 0;
      p.vy = 0;
      p.alive = true;
    }

    function checkPlatformCollision(p: PlayerState): void {
      if (p.vy < 0) return; // only collide when falling
      for (const plat of PLATFORMS) {
        if (
          p.x + PLAYER_W > plat.x && p.x < plat.x + plat.w &&
          p.y + PLAYER_H >= plat.y && p.y + PLAYER_H <= plat.y + 12
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
        p.y += p.vy;

        // Wrap horizontal
        if (p.x < -PLAYER_W) p.x = W;
        if (p.x > W) p.x = -PLAYER_W;

        // Platform collision
        checkPlatformCollision(p);

        // Ceiling
        if (p.y < 0) { p.y = 0; p.vy = 0; }

        // Death pit (below floor)
        if (p.y > H + 50) {
          respawn(pid);
        }
      }

      // Player collision
      const a = state.players[p1];
      const b = state.players[p2];
      if (a.alive && b.alive) {
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
