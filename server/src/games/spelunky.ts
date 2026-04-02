import type { ServerGameModule, MatchContext, GameInstance } from '@arcade-battle/shared';

const W = 800, H = 500, HALF_W = 400;
const PW = 12, PH = 16;
const GRAVITY = 0.4;
const MOVE_SPEED = 3;
const JUMP_POWER = -8;
const TILE = 24;
const CAVE_COLS = 30, CAVE_ROWS = 50;
const ENEMY_W = 10, ENEMY_H = 12, ENEMY_SPEED = 1;
const CAVE_W = CAVE_COLS * TILE;
const CAVE_H = CAVE_ROWS * TILE;
const TICK_RATE = 1000 / 60;

type Tile = 0 | 1 | 2 | 3; // air, solid, spike, exit

interface EnemyDef { x: number; y: number; patrolL: number; patrolR: number; }

function generateCave(): { grid: Tile[][]; exitR: number; exitC: number; enemies: EnemyDef[] } {
  // Start solid, then carve passable rooms connected by walkable tunnels
  const grid: Tile[][] = [];
  for (let r = 0; r < CAVE_ROWS; r++) grid.push(new Array(CAVE_COLS).fill(1) as Tile[]);

  // Carve starting room (top)
  for (let r = 0; r < 4; r++)
    for (let c = 1; c < CAVE_COLS - 1; c++) grid[r][c] = 0;

  // Generate floors — each floor is a horizontal layer with rooms and connecting corridors
  // A floor is ~6 rows tall, with a walkable corridor and a drop to the next
  const FLOOR_H = 6;
  const numFloors = Math.floor((CAVE_ROWS - 6) / FLOOR_H);
  let prevDropC = Math.floor(CAVE_COLS / 2); // where the drop from the previous floor is

  for (let f = 0; f < numFloors; f++) {
    const baseR = 4 + f * FLOOR_H;

    // Carve a 3-tall corridor across most of the width
    const corridorR = baseR + 1;
    for (let r = corridorR; r < Math.min(CAVE_ROWS, corridorR + 3); r++) {
      for (let c = 1; c < CAVE_COLS - 1; c++) grid[r][c] = 0;
    }

    // Add a floor (solid row) at the bottom of the corridor
    const floorR = Math.min(CAVE_ROWS - 1, corridorR + 3);
    if (floorR < CAVE_ROWS) {
      for (let c = 1; c < CAVE_COLS - 1; c++) grid[floorR][c] = 1;
    }

    // Carve a room somewhere on this floor
    const roomC = 2 + Math.floor(Math.random() * (CAVE_COLS - 8));
    const roomW = 4 + Math.floor(Math.random() * 4);
    for (let r = corridorR - 1; r < Math.min(CAVE_ROWS, corridorR + 3); r++) {
      for (let c = roomC; c < Math.min(CAVE_COLS - 1, roomC + roomW); c++) {
        grid[r][c] = 0;
      }
    }

    // Carve the drop from previous floor into this corridor
    // Make a 3-wide hole in the ceiling connecting to the previous floor
    for (let dc = -1; dc <= 1; dc++) {
      const c = Math.max(1, Math.min(CAVE_COLS - 2, prevDropC + dc));
      for (let r = Math.max(0, corridorR - 2); r <= corridorR; r++) {
        grid[r][c] = 0;
      }
    }

    // Choose where the drop to the NEXT floor will be
    const nextDropC = 2 + Math.floor(Math.random() * (CAVE_COLS - 4));
    // Carve the drop hole in the floor
    for (let dc = -1; dc <= 1; dc++) {
      const c = Math.max(1, Math.min(CAVE_COLS - 2, nextDropC + dc));
      if (floorR < CAVE_ROWS) grid[floorR][c] = 0;
      if (floorR + 1 < CAVE_ROWS) grid[floorR + 1][c] = 0;
    }

    // Add platforms inside the corridor for variety (small, jumpable)
    if (Math.random() < 0.4) {
      const platC = 3 + Math.floor(Math.random() * (CAVE_COLS - 6));
      const platR = corridorR;
      grid[platR][platC] = 1;
      if (platC + 1 < CAVE_COLS - 1) grid[platR][platC + 1] = 1;
    }

    prevDropC = nextDropC;
  }

  // Add spikes on some floor surfaces (not blocking the path)
  for (let r = 5; r < CAVE_ROWS - 2; r++) {
    for (let c = 2; c < CAVE_COLS - 2; c++) {
      if (grid[r][c] === 0 && r + 1 < CAVE_ROWS && grid[r + 1][c] === 1) {
        // Air above solid — candidate for spike
        if (Math.random() < 0.06) grid[r][c] = 2;
      }
    }
  }

  // Place exit on the last floor
  const lastFloorBase = 4 + (numFloors - 1) * FLOOR_H;
  const exitR = Math.min(CAVE_ROWS - 2, lastFloorBase + 2);
  const exitC = prevDropC;
  grid[exitR][exitC] = 3;
  // Clear around exit
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      const r = exitR + dr, c = exitC + dc;
      if (r >= 0 && r < CAVE_ROWS && c >= 0 && c < CAVE_COLS && grid[r][c] !== 3) {
        grid[r][c] = 0;
      }
    }
  }

  // Spawn enemies on corridor floors
  const enemies: EnemyDef[] = [];
  for (let f = 1; f < numFloors; f++) {
    const corridorR = 4 + f * FLOOR_H + 1;
    const floorR = Math.min(CAVE_ROWS - 1, corridorR + 3);
    if (Math.random() < 0.6) {
      // Find a walkable spot
      const ec = 3 + Math.floor(Math.random() * (CAVE_COLS - 6));
      if (grid[corridorR + 2]?.[ec] === 0 && grid[floorR]?.[ec] === 1) {
        // Find patrol bounds (leftmost and rightmost air on this floor)
        let patrolL = ec, patrolR = ec;
        while (patrolL > 1 && grid[corridorR + 2][patrolL - 1] === 0 && grid[floorR][patrolL - 1] === 1) patrolL--;
        while (patrolR < CAVE_COLS - 2 && grid[corridorR + 2][patrolR + 1] === 0 && grid[floorR][patrolR + 1] === 1) patrolR++;
        enemies.push({ x: ec * TILE + TILE / 2, y: (corridorR + 2) * TILE + TILE - ENEMY_H, patrolL: patrolL * TILE, patrolR: patrolR * TILE + TILE });
      }
    }
  }

  return { grid, exitR, exitC, enemies };
}

interface PlayerState {
  x: number; y: number; vx: number; vy: number;
  grounded: boolean; alive: boolean; completed: boolean;
  cameraX: number; cameraY: number;
}

interface EnemyState { x: number; y: number; dir: number; patrolL: number; patrolR: number; }

interface SpelunkyState {
  players: { [id: string]: PlayerState };
  enemies: EnemyState[];
  grid: Tile[][];
  tileSize: number;
  caveWidth: number; caveHeight: number;
  canvasWidth: number; canvasHeight: number;
  winner: string | null;
}

export const spelunkyGame: ServerGameModule = {
  info: {
    id: 'spelunky',
    name: 'Cave Dive',
    description: 'Spelunky-style cave race',
    controls: 'A/D to move, W/Space to jump. Navigate rooms and corridors, avoid spikes, reach the exit first.',
    maxDuration: 120,
  },

  create(ctx: MatchContext): GameInstance {
    const [p1, p2] = ctx.players;
    let running = true;
    const { grid, exitR, exitC, enemies: enemyDefs } = generateCave();
    const inputs: { [id: string]: { left: boolean; right: boolean; jump: boolean } } = {
      [p1]: { left: false, right: false, jump: false },
      [p2]: { left: false, right: false, jump: false },
    };

    const state: SpelunkyState = {
      players: {
        [p1]: { x: CAVE_W / 2 - PW / 2, y: TILE + 4, vx: 0, vy: 0, grounded: false, alive: true, completed: false, cameraX: 0, cameraY: 0 },
        [p2]: { x: CAVE_W / 2 - PW / 2, y: TILE + 4, vx: 0, vy: 0, grounded: false, alive: true, completed: false, cameraX: 0, cameraY: 0 },
      },
      enemies: enemyDefs.map((e) => ({ x: e.x, y: e.y, dir: 1, patrolL: e.patrolL, patrolR: e.patrolR })),
      grid, tileSize: TILE,
      caveWidth: CAVE_W, caveHeight: CAVE_H,
      canvasWidth: W, canvasHeight: H,
      winner: null,
    };

    function getTile(r: number, c: number): Tile {
      if (r < 0 || r >= CAVE_ROWS || c < 0 || c >= CAVE_COLS) return 1;
      return grid[r][c];
    }

    function resolveCollisions(p: PlayerState): void {
      p.grounded = false;

      // Vertical — check feet/head
      if (p.vy > 0) {
        const footRow = Math.floor((p.y + PH) / TILE);
        for (let c = Math.floor(p.x / TILE); c <= Math.floor((p.x + PW - 1) / TILE); c++) {
          if (getTile(footRow, c) === 1) { p.y = footRow * TILE - PH; p.vy = 0; p.grounded = true; break; }
        }
      } else if (p.vy < 0) {
        const headRow = Math.floor(p.y / TILE);
        for (let c = Math.floor(p.x / TILE); c <= Math.floor((p.x + PW - 1) / TILE); c++) {
          if (getTile(headRow, c) === 1) { p.y = (headRow + 1) * TILE; p.vy = 0; break; }
        }
      }

      // Horizontal
      if (p.vx < 0) {
        const leftCol = Math.floor(p.x / TILE);
        for (let r = Math.floor(p.y / TILE); r <= Math.floor((p.y + PH - 1) / TILE); r++) {
          if (getTile(r, leftCol) === 1) { p.x = (leftCol + 1) * TILE; p.vx = 0; break; }
        }
      } else if (p.vx > 0) {
        const rightCol = Math.floor((p.x + PW - 1) / TILE);
        for (let r = Math.floor(p.y / TILE); r <= Math.floor((p.y + PH - 1) / TILE); r++) {
          if (getTile(r, rightCol) === 1) { p.x = rightCol * TILE - PW; p.vx = 0; break; }
        }
      }
    }

    function checkHazards(p: PlayerState, pid: string): boolean {
      for (let r = Math.floor(p.y / TILE); r <= Math.floor((p.y + PH - 1) / TILE); r++) {
        for (let c = Math.floor(p.x / TILE); c <= Math.floor((p.x + PW - 1) / TILE); c++) {
          const t = getTile(r, c);
          if (t === 2) {
            p.alive = false;
            running = false;
            state.winner = pid === p1 ? p2 : p1;
            ctx.emit('game:state', state); ctx.endRound(state.winner); return true;
          }
          if (t === 3) {
            p.completed = true;
            running = false;
            state.winner = pid;
            ctx.emit('game:state', state); ctx.endRound(pid); return true;
          }
        }
      }
      return false;
    }

    const interval = setInterval(() => {
      if (!running) return;

      for (const pid of ctx.players) {
        const p = state.players[pid];
        if (!p.alive || p.completed) continue;
        const inp = inputs[pid];

        if (inp.left) p.vx = -MOVE_SPEED;
        else if (inp.right) p.vx = MOVE_SPEED;
        else p.vx *= 0.7;

        if (inp.jump) { if (p.grounded) { p.vy = JUMP_POWER; p.grounded = false; } inp.jump = false; }
        p.vy += GRAVITY;
        p.x += p.vx; p.y += p.vy;
        p.x = Math.max(TILE, Math.min(CAVE_W - TILE - PW, p.x));

        resolveCollisions(p);
        if (checkHazards(p, pid)) return;

        // Enemy collision
        for (const e of state.enemies) {
          const dx = (p.x + PW / 2) - e.x;
          const dy = (p.y + PH / 2) - e.y;
          if (Math.abs(dx) < (PW + ENEMY_W) / 2 && Math.abs(dy) < (PH + ENEMY_H) / 2) {
            p.alive = false;
            running = false;
            state.winner = pid === p1 ? p2 : p1;
            ctx.emit('game:state', state);
            ctx.endRound(state.winner);
            return;
          }
        }

        // Camera
        const tcx = p.x - HALF_W / 2;
        const tcy = p.y - H * 0.4;
        p.cameraX += (Math.max(0, Math.min(CAVE_W - HALF_W, tcx)) - p.cameraX) * 0.1;
        p.cameraY += (Math.max(0, Math.min(CAVE_H - H, tcy)) - p.cameraY) * 0.1;
      }

      // Move enemies
      for (const e of state.enemies) {
        e.x += e.dir * ENEMY_SPEED;
        if (e.x <= e.patrolL || e.x >= e.patrolR) e.dir *= -1;
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
