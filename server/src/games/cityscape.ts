import type { ServerGameModule, MatchContext, GameInstance } from '@arcade-battle/shared';

const W = 800, H = 500, HALF_W = 400;
const PW = 14, PH = 18;
const GRAVITY = 0.4;
const MOVE_SPEED = 4;
const JUMP_POWER = -9;
const ENEMY_W = 12, ENEMY_H = 14;
const ENEMY_SPEED = 1.2;
const STUN_DURATION = 45; // ticks
const TICK_RATE = 1000 / 60;
const BUILDING_MIN_W = 60, BUILDING_MAX_W = 100;
const BUILDING_GAP_MIN = 30, BUILDING_GAP_MAX = 60;
const TOTAL_WIDTH = 2400;

interface Building { x: number; w: number; h: number; }
interface EnemyDef { x: number; patrol: number; }
interface EnemyState { x: number; baseX: number; patrol: number; dir: number; }

interface PlayerState {
  x: number; y: number; vx: number; vy: number;
  grounded: boolean; stunTimer: number;
  completed: boolean; cameraX: number;
}

interface CityscapeState {
  players: { [id: string]: PlayerState };
  buildings: Building[];
  enemies: { [id: string]: EnemyState[] };
  totalWidth: number;
  canvasWidth: number; canvasHeight: number;
  winner: string | null;
}

function generateCityscape(): { buildings: Building[]; enemyDefs: EnemyDef[] } {
  const buildings: Building[] = [];
  const enemyDefs: EnemyDef[] = [];
  let x = 0;

  // Starting building
  buildings.push({ x: 0, w: 80, h: 120 + Math.random() * 80 });
  x = 80;

  while (x < TOTAL_WIDTH - 100) {
    const gap = BUILDING_GAP_MIN + Math.random() * (BUILDING_GAP_MAX - BUILDING_GAP_MIN);
    x += gap;
    const bw = BUILDING_MIN_W + Math.random() * (BUILDING_MAX_W - BUILDING_MIN_W);
    const bh = 80 + Math.random() * 150;
    buildings.push({ x, w: bw, h: bh });

    // Place enemy on some buildings
    if (Math.random() < 0.5 && buildings.length > 1) {
      enemyDefs.push({ x: x + bw / 2, patrol: bw * 0.3 });
    }

    x += bw;
  }

  return { buildings, enemyDefs };
}

export const cityscapeGame: ServerGameModule = {
  info: {
    id: 'cityscape',
    name: 'Cityscape Race',
    description: 'Race across rooftops! Jump between buildings, avoid enemies. Getting hit stuns you. First to the end wins! A/D to move, W/Space to jump.',
    maxDuration: 90,
  },

  create(ctx: MatchContext): GameInstance {
    const [p1, p2] = ctx.players;
    let running = true;
    const { buildings, enemyDefs } = generateCityscape();
    const inputs: { [id: string]: { left: boolean; right: boolean; jump: boolean } } = {
      [p1]: { left: false, right: false, jump: false },
      [p2]: { left: false, right: false, jump: false },
    };

    function makeEnemies(): EnemyState[] {
      return enemyDefs.map((e) => ({ x: e.x, baseX: e.x, patrol: e.patrol, dir: 1 }));
    }

    const startB = buildings[0];
    const startY = H - startB.h - PH;

    const state: CityscapeState = {
      players: {
        [p1]: { x: 20, y: startY, vx: 0, vy: 0, grounded: true, stunTimer: 0, completed: false, cameraX: 0 },
        [p2]: { x: 20, y: startY, vx: 0, vy: 0, grounded: true, stunTimer: 0, completed: false, cameraX: 0 },
      },
      buildings,
      enemies: { [p1]: makeEnemies(), [p2]: makeEnemies() },
      totalWidth: TOTAL_WIDTH,
      canvasWidth: W, canvasHeight: H,
      winner: null,
    };

    const interval = setInterval(() => {
      if (!running) return;

      for (const pid of ctx.players) {
        const p = state.players[pid];
        if (p.completed) continue;
        const inp = inputs[pid];

        if (p.stunTimer > 0) { p.stunTimer--; continue; }

        if (inp.left) p.vx = -MOVE_SPEED;
        else if (inp.right) p.vx = MOVE_SPEED;
        else p.vx *= 0.7;

        if (inp.jump && p.grounded) { p.vy = JUMP_POWER; p.grounded = false; inp.jump = false; }
        p.vy += GRAVITY;
        p.x += p.vx; p.y += p.vy;

        if (p.x < 0) p.x = 0;

        // Building collision (top only)
        p.grounded = false;
        for (const b of buildings) {
          const topY = H - b.h;
          if (p.vy >= 0 && p.x + PW > b.x && p.x < b.x + b.w && p.y + PH >= topY && p.y + PH <= topY + 12) {
            p.y = topY - PH; p.vy = 0; p.grounded = true;
          }
        }

        // Fall off bottom
        if (p.y > H + 50) {
          // Reset to nearest building
          let nearestB = buildings[0];
          for (const b of buildings) {
            if (b.x <= p.x + PW && b.x + b.w >= p.x) { nearestB = b; break; }
            if (b.x > p.x) { nearestB = b; break; }
          }
          p.x = nearestB.x + nearestB.w / 2;
          p.y = H - nearestB.h - PH;
          p.vx = 0; p.vy = 0;
          p.stunTimer = STUN_DURATION;
        }

        // Enemy collision
        const myEnemies = state.enemies[pid];
        for (const e of myEnemies) {
          e.x += e.dir * ENEMY_SPEED;
          if (Math.abs(e.x - e.baseX) > e.patrol) e.dir *= -1;

          const dx = (p.x + PW / 2) - e.x;
          const dy = (p.y + PH / 2) - (H - 200); // approximate enemy Y on rooftop
          // Check collision on the building the enemy is on
          for (const b of buildings) {
            if (e.baseX >= b.x && e.baseX <= b.x + b.w) {
              const ey = H - b.h - ENEMY_H;
              const edx = (p.x + PW / 2) - e.x;
              const edy = (p.y + PH / 2) - (ey + ENEMY_H / 2);
              if (Math.abs(edx) < (PW + ENEMY_W) / 2 && Math.abs(edy) < (PH + ENEMY_H) / 2 && p.stunTimer <= 0) {
                p.stunTimer = STUN_DURATION;
                p.vx = -p.vx * 0.5;
              }
              break;
            }
          }
        }

        // Camera
        const targetCam = p.x - HALF_W / 3;
        p.cameraX += (Math.max(0, Math.min(TOTAL_WIDTH - HALF_W, targetCam)) - p.cameraX) * 0.1;

        // Win check
        if (p.x >= TOTAL_WIDTH - 40) {
          p.completed = true;
          running = false;
          state.winner = pid;
          ctx.emit('game:state', state);
          ctx.endRound(pid);
          return;
        }
      }

      ctx.emit('game:state', state);
    }, TICK_RATE);

    return {
      onPlayerInput(playerId: string, data: unknown): void {
        const input = data as { left?: boolean; right?: boolean; jump?: boolean };
        const inp = inputs[playerId];
        if (!inp) return;
        if (input.left !== undefined) inp.left = input.left;
        if (input.right !== undefined) inp.right = input.right;
        if (input.jump) inp.jump = true;
      },
      getState() { return state; },
      cleanup(): void { running = false; clearInterval(interval); },
    };
  },
};
