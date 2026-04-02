import type { ServerGameModule, MatchContext, GameInstance } from '@arcade-battle/shared';

const W = 800, H = 500, HALF_W = 400;
const PW = 12, PH = 16;
const GRAVITY = 0.4;
const MOVE_SPEED = 3;
const JUMP_POWER = -8;
const CAVE_COLS = 10, CAVE_ROWS = 20;
const TILE = 30;
const CAVE_W = CAVE_COLS * TILE;
const CAVE_H = CAVE_ROWS * TILE;
const TICK_RATE = 1000 / 60;
const SPIKE_H = 8;

// Tile types: 0=air, 1=solid, 2=spike, 3=exit
type Tile = 0 | 1 | 2 | 3;

function generateCave(): Tile[][] {
  const grid: Tile[][] = [];
  for (let r = 0; r < CAVE_ROWS; r++) {
    const row: Tile[] = [];
    for (let c = 0; c < CAVE_COLS; c++) {
      // Borders
      if (c === 0 || c === CAVE_COLS - 1) { row.push(1); continue; }
      if (r === 0) { row.push(1); continue; }
      if (r === CAVE_ROWS - 1) { row.push(1); continue; }
      // Starting area (top rows) — clear
      if (r <= 2) { row.push(0); continue; }
      row.push(0);
    }
    grid.push(row);
  }

  // Carve a path from top to bottom using a random walk
  let pathCol = 2 + Math.floor(Math.random() * (CAVE_COLS - 4));
  for (let r = 3; r < CAVE_ROWS - 2; r++) {
    // Place platforms with gaps
    for (let c = 1; c < CAVE_COLS - 1; c++) {
      if (r % 3 === 0) {
        // Platform rows
        grid[r][c] = 1;
      }
    }
    // Carve gap in path column and neighbors
    if (r % 3 === 0) {
      grid[r][pathCol] = 0;
      if (pathCol > 1) grid[r][pathCol - 1] = 0;
      if (pathCol < CAVE_COLS - 2) grid[r][pathCol + 1] = 0;
    }

    // Randomly shift path
    if (r % 3 === 0) {
      pathCol += Math.floor(Math.random() * 3) - 1;
      pathCol = Math.max(1, Math.min(CAVE_COLS - 2, pathCol));
    }
  }

  // Add spikes on some platforms
  for (let r = 4; r < CAVE_ROWS - 2; r++) {
    for (let c = 2; c < CAVE_COLS - 2; c++) {
      if (grid[r][c] === 1 && grid[r - 1][c] === 0 && Math.random() < 0.15) {
        grid[r][c] = 2; // spike on top of platform
      }
    }
  }

  // Place exit at bottom
  const exitCol = 2 + Math.floor(Math.random() * (CAVE_COLS - 4));
  grid[CAVE_ROWS - 2][exitCol] = 3;
  // Clear above exit
  grid[CAVE_ROWS - 3][exitCol] = 0;
  grid[CAVE_ROWS - 2][exitCol] = 3;

  return grid;
}

interface PlayerState {
  x: number; y: number; vx: number; vy: number;
  grounded: boolean; alive: boolean; completed: boolean;
  cameraY: number;
}

interface SpelunkyState {
  players: { [id: string]: PlayerState };
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
    description: 'Race through a dangerous cave! Avoid spikes, reach the exit first. A/D to move, W/Space to jump.',
    maxDuration: 90,
  },

  create(ctx: MatchContext): GameInstance {
    const [p1, p2] = ctx.players;
    let running = true;
    const grid = generateCave();
    const inputs: { [id: string]: { left: boolean; right: boolean; jump: boolean } } = {
      [p1]: { left: false, right: false, jump: false },
      [p2]: { left: false, right: false, jump: false },
    };

    const state: SpelunkyState = {
      players: {
        [p1]: { x: CAVE_W / 2 - PW / 2, y: TILE + 2, vx: 0, vy: 0, grounded: false, alive: true, completed: false, cameraY: 0 },
        [p2]: { x: CAVE_W / 2 - PW / 2, y: TILE + 2, vx: 0, vy: 0, grounded: false, alive: true, completed: false, cameraY: 0 },
      },
      grid,
      tileSize: TILE,
      caveWidth: CAVE_W,
      caveHeight: CAVE_H,
      canvasWidth: W,
      canvasHeight: H,
      winner: null,
    };

    function getTile(r: number, c: number): Tile {
      if (r < 0 || r >= CAVE_ROWS || c < 0 || c >= CAVE_COLS) return 1;
      return grid[r][c];
    }

    function tileCollision(p: PlayerState): void {
      // Check all tiles the player overlaps
      const left = Math.floor(p.x / TILE);
      const right = Math.floor((p.x + PW - 1) / TILE);
      const top = Math.floor(p.y / TILE);
      const bottom = Math.floor((p.y + PH - 1) / TILE);

      p.grounded = false;

      // Vertical resolution
      if (p.vy > 0) {
        const footRow = Math.floor((p.y + PH) / TILE);
        for (let c = left; c <= right; c++) {
          const t = getTile(footRow, c);
          if (t === 1 || t === 2 || t === 3) {
            p.y = footRow * TILE - PH;
            p.vy = 0;
            p.grounded = true;
            break;
          }
        }
      } else if (p.vy < 0) {
        const headRow = Math.floor(p.y / TILE);
        for (let c = left; c <= right; c++) {
          if (getTile(headRow, c) === 1) {
            p.y = (headRow + 1) * TILE;
            p.vy = 0;
            break;
          }
        }
      }

      // Horizontal resolution
      const newLeft = Math.floor(p.x / TILE);
      const newRight = Math.floor((p.x + PW - 1) / TILE);
      const newTop = Math.floor(p.y / TILE);
      const newBottom = Math.floor((p.y + PH - 1) / TILE);

      if (p.vx < 0) {
        for (let r = newTop; r <= newBottom; r++) {
          if (getTile(r, newLeft) === 1) {
            p.x = (newLeft + 1) * TILE;
            p.vx = 0;
            break;
          }
        }
      } else if (p.vx > 0) {
        for (let r = newTop; r <= newBottom; r++) {
          if (getTile(r, newRight) === 1) {
            p.x = newRight * TILE - PW;
            p.vx = 0;
            break;
          }
        }
      }
    }

    function checkHazards(p: PlayerState, pid: string): boolean {
      const left = Math.floor(p.x / TILE);
      const right = Math.floor((p.x + PW - 1) / TILE);
      const bottom = Math.floor((p.y + PH) / TILE);

      // Spike check — touching from above
      for (let c = left; c <= right; c++) {
        if (getTile(bottom, c) === 2 && p.y + PH >= bottom * TILE) {
          p.alive = false;
          const opponent = pid === p1 ? p2 : p1;
          running = false;
          state.winner = opponent;
          ctx.emit('game:state', state);
          ctx.endRound(opponent);
          return true;
        }
      }

      // Exit check
      const centerCol = Math.floor((p.x + PW / 2) / TILE);
      const centerRow = Math.floor((p.y + PH / 2) / TILE);
      if (getTile(centerRow, centerCol) === 3) {
        p.completed = true;
        running = false;
        state.winner = pid;
        ctx.emit('game:state', state);
        ctx.endRound(pid);
        return true;
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

        if (inp.jump && p.grounded) {
          p.vy = JUMP_POWER;
          p.grounded = false;
          inp.jump = false;
        }

        p.vy += GRAVITY;
        p.x += p.vx;
        p.y += p.vy;

        // Clamp to cave bounds
        p.x = Math.max(TILE, Math.min(CAVE_W - TILE - PW, p.x));

        tileCollision(p);
        if (checkHazards(p, pid)) return;

        // Camera
        const targetCam = p.y - H * 0.4;
        p.cameraY += (Math.max(0, Math.min(CAVE_H - H, targetCam)) - p.cameraY) * 0.1;
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
