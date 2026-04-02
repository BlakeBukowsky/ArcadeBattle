import type { ServerGameModule, MatchContext, GameInstance } from '@arcade-battle/shared';

const W = 800, H = 500, HALF_W = 400;
const PW = 14, PH = 20;
const GRAVITY = 0.4;
const MOVE_SPEED = 4;
const JUMP_POWER = -9;
const DASH_SPEED = 16;
const DASH_TICKS = 5;
const DASH_COOLDOWN_TICKS = 20;
const SLASH_RANGE = 35;
const ENEMY_W = 14, ENEMY_H = 18;
const ENEMY_SPEED = 1;
const ROOM_W = 350;
const FLOOR_Y = H - 30;
const TICK_RATE = 1000 / 60;

interface Plat { x: number; y: number; w: number; }
interface EnemyDef { x: number; y: number; patrol: number; } // patrol = distance
interface Room { x: number; platforms: Plat[]; enemies: EnemyDef[]; }
interface Building { rooms: Room[]; totalWidth: number; totalEnemies: number; }

function makeBuilding(): Building {
  const rooms: Room[] = [];
  const numRooms = 3 + Math.floor(Math.random() * 2); // 3-4 rooms
  let totalEnemies = 0;

  for (let r = 0; r < numRooms; r++) {
    const rx = r * ROOM_W;
    const plats: Plat[] = [
      { x: rx, y: FLOOR_Y, w: ROOM_W }, // floor
    ];
    // Add some platforms
    if (r > 0) {
      plats.push({ x: rx + 40, y: FLOOR_Y - 100, w: 80 });
      plats.push({ x: rx + 180, y: FLOOR_Y - 170, w: 70 });
    }
    if (r % 2 === 0) {
      plats.push({ x: rx + 120, y: FLOOR_Y - 80, w: 90 });
    }

    // Enemies
    const enemies: EnemyDef[] = [];
    const numEnemies = 2 + Math.floor(Math.random() * 3);
    for (let e = 0; e < numEnemies; e++) {
      enemies.push({
        x: rx + 40 + Math.random() * (ROOM_W - 80),
        y: FLOOR_Y - ENEMY_H,
        patrol: 40 + Math.random() * 60,
      });
    }
    totalEnemies += numEnemies;

    rooms.push({ x: rx, platforms: plats, enemies });
  }

  return { rooms, totalWidth: numRooms * ROOM_W, totalEnemies };
}

interface EnemyState { x: number; y: number; baseX: number; patrol: number; dir: number; alive: boolean; }

interface PlayerState {
  x: number; y: number; vx: number; vy: number;
  grounded: boolean; facing: 1 | -1;
  dashTimer: number; dashCooldown: number; dashDir: number;
  slashing: number;
  killCount: number; completed: boolean;
  cameraX: number;
}

interface NinjaState {
  players: { [id: string]: PlayerState };
  building: { totalWidth: number; totalEnemies: number; rooms: { x: number; platforms: Plat[] }[] };
  enemies: { [playerId: string]: EnemyState[] };
  canvasWidth: number; canvasHeight: number;
  winner: string | null;
}

export const ninjaGame: ServerGameModule = {
  info: {
    id: 'ninja',
    name: 'Ninja',
    description: 'Dash and slash through enemies! Clear all rooms and exit. A/D to move, W to jump, Space to dash-attack.',
    maxDuration: 90,
  },

  create(ctx: MatchContext): GameInstance {
    const [p1, p2] = ctx.players;
    let running = true;
    const building = makeBuilding();
    const inputs: { [id: string]: { left: boolean; right: boolean; jump: boolean; dash: boolean } } = {
      [p1]: { left: false, right: false, jump: false, dash: false },
      [p2]: { left: false, right: false, jump: false, dash: false },
    };

    // Create independent enemy state per player
    function makeEnemies(): EnemyState[] {
      const enemies: EnemyState[] = [];
      for (const room of building.rooms) {
        for (const e of room.enemies) {
          enemies.push({ x: e.x, y: e.y, baseX: e.x, patrol: e.patrol, dir: 1, alive: true });
        }
      }
      return enemies;
    }

    const state: NinjaState = {
      players: {
        [p1]: { x: 30, y: FLOOR_Y - PH, vx: 0, vy: 0, grounded: true, facing: 1, dashTimer: 0, dashCooldown: 0, dashDir: 0, slashing: 0, killCount: 0, completed: false, cameraX: 0 },
        [p2]: { x: 30, y: FLOOR_Y - PH, vx: 0, vy: 0, grounded: true, facing: -1, dashTimer: 0, dashCooldown: 0, dashDir: 0, slashing: 0, killCount: 0, completed: false, cameraX: 0 },
      },
      building: { totalWidth: building.totalWidth, totalEnemies: building.totalEnemies, rooms: building.rooms.map((r) => ({ x: r.x, platforms: r.platforms })) },
      enemies: { [p1]: makeEnemies(), [p2]: makeEnemies() },
      canvasWidth: W, canvasHeight: H,
      winner: null,
    };

    // All platforms flat
    const allPlatforms: Plat[] = building.rooms.flatMap((r) => r.platforms);

    const interval = setInterval(() => {
      if (!running) return;

      for (const pid of ctx.players) {
        const p = state.players[pid];
        if (p.completed) continue;
        const inp = inputs[pid];
        const myEnemies = state.enemies[pid];

        // Dash cooldown
        if (p.dashCooldown > 0) p.dashCooldown--;
        if (p.slashing > 0) p.slashing--;

        // Dash attack
        if (inp.dash && p.dashTimer <= 0 && p.dashCooldown <= 0) {
          inp.dash = false;
          p.dashTimer = DASH_TICKS;
          p.dashCooldown = DASH_COOLDOWN_TICKS;
          p.dashDir = p.facing;
          p.slashing = DASH_TICKS + 2;
        }

        if (p.dashTimer > 0) {
          p.dashTimer--;
          p.vx = p.dashDir * DASH_SPEED;
          p.vy = 0;
        } else {
          if (inp.left) { p.vx = -MOVE_SPEED; p.facing = -1; }
          else if (inp.right) { p.vx = MOVE_SPEED; p.facing = 1; }
          else p.vx *= 0.7;

          if (inp.jump && p.grounded) {
            p.vy = JUMP_POWER;
            p.grounded = false;
            inp.jump = false;
          }
          p.vy += GRAVITY;
        }

        p.x += p.vx;
        p.y += p.vy;

        // Walls
        if (p.x < 0) p.x = 0;
        if (p.x + PW > building.totalWidth) p.x = building.totalWidth - PW;

        // Platform collision
        p.grounded = false;
        for (const plat of allPlatforms) {
          if (p.vy >= 0 && p.x + PW > plat.x && p.x < plat.x + plat.w && p.y + PH >= plat.y && p.y + PH <= plat.y + 12) {
            p.y = plat.y - PH;
            p.vy = 0;
            p.grounded = true;
          }
        }

        // Slash — kill enemies in range
        if (p.slashing > 0) {
          for (const e of myEnemies) {
            if (!e.alive) continue;
            const dx = e.x + ENEMY_W / 2 - (p.x + PW / 2);
            const dy = e.y + ENEMY_H / 2 - (p.y + PH / 2);
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < SLASH_RANGE && Math.sign(dx) === p.facing) {
              e.alive = false;
              p.killCount++;
            }
          }
        }

        // Update enemies
        for (const e of myEnemies) {
          if (!e.alive) continue;
          e.x += e.dir * ENEMY_SPEED;
          if (Math.abs(e.x - e.baseX) > e.patrol) e.dir *= -1;
        }

        // Camera
        const targetCam = p.x - HALF_W / 2;
        p.cameraX += (Math.max(0, Math.min(building.totalWidth - HALF_W, targetCam)) - p.cameraX) * 0.1;

        // Check completion — all enemies dead and reached end
        if (p.killCount >= building.totalEnemies && p.x + PW >= building.totalWidth - 20) {
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
        const input = data as { left?: boolean; right?: boolean; jump?: boolean; dash?: boolean };
        const inp = inputs[playerId];
        if (!inp) return;
        if (input.left !== undefined) inp.left = input.left;
        if (input.right !== undefined) inp.right = input.right;
        if (input.jump) inp.jump = true;
        if (input.dash) inp.dash = true;
      },
      getState() { return state; },
      cleanup(): void { running = false; clearInterval(interval); },
    };
  },
};
