import type { ServerGameModule, MatchContext, GameInstance } from '@arcade-battle/shared';

const W = 800, H = 500, HALF_W = 400;
const GRID = 20;
const COLS = Math.floor(HALF_W / GRID);
const ROWS = Math.floor(H / GRID);
const PW = 10, PH = 10;
const MOVE_SPEED = 2.5;
const FALL_DELAY = 60; // ticks before respawn
const TICK_RATE = 1000 / 60;

// Generate a thin winding path on a grid
function generatePath(): boolean[][] {
  const grid: boolean[][] = [];
  for (let r = 0; r < ROWS; r++) {
    grid.push(new Array(COLS).fill(false));
  }

  // Start from left side, wind to right side
  let col = 1;
  let row = Math.floor(ROWS / 2);
  grid[row][col] = true;

  while (col < COLS - 2) {
    // Decide direction: prefer right, sometimes up/down
    const roll = Math.random();
    if (roll < 0.5) {
      col++; // right
    } else if (roll < 0.7 && row > 2) {
      row--; // up
    } else if (roll < 0.9 && row < ROWS - 3) {
      row++; // down
    } else {
      col++; // right fallback
    }
    col = Math.min(col, COLS - 2);
    row = Math.max(1, Math.min(ROWS - 2, row));
    grid[row][col] = true;

    // Occasionally widen the path slightly
    if (Math.random() < 0.3 && row > 1) grid[row - 1][col] = true;
    if (Math.random() < 0.3 && row < ROWS - 2) grid[row + 1][col] = true;
  }

  // Mark start and end columns
  grid[row][COLS - 2] = true;

  return grid;
}

interface PlayerState {
  x: number; y: number;
  alive: boolean; completed: boolean;
  fallTimer: number; // ticks until respawn (0 = not falling)
  spawnX: number; spawnY: number; // last safe position
}

interface BalanceState {
  players: { [id: string]: PlayerState };
  path: boolean[][];
  gridSize: number;
  canvasWidth: number; canvasHeight: number;
  winner: string | null;
}

export const balanceGame: ServerGameModule = {
  info: {
    id: 'balance',
    name: 'Balance',
    description: 'Navigate the narrow path',
    controls: 'WASD to move. Fall off = respawn after 1 second. First to the end wins.',
    maxDuration: 60,
  },

  create(ctx: MatchContext): GameInstance {
    const [p1, p2] = ctx.players;
    let running = true;
    const path = generatePath();
    const inputs: { [id: string]: { up: boolean; down: boolean; left: boolean; right: boolean } } = {
      [p1]: { up: false, down: false, left: false, right: false },
      [p2]: { up: false, down: false, left: false, right: false },
    };

    // Find start position (leftmost path tile)
    let startX = GRID + GRID / 2, startY = H / 2;
    for (let r = 0; r < ROWS; r++) {
      if (path[r][1]) { startX = 1 * GRID + GRID / 2; startY = r * GRID + GRID / 2; break; }
    }

    // Find end position (rightmost path tile)
    let endCol = COLS - 2;
    let endRow = 0;
    for (let r = 0; r < ROWS; r++) {
      if (path[r][endCol]) { endRow = r; break; }
    }

    const state: BalanceState = {
      players: {
        [p1]: { x: startX, y: startY, alive: true, completed: false, fallTimer: 0, spawnX: startX, spawnY: startY },
        [p2]: { x: startX, y: startY, alive: true, completed: false, fallTimer: 0, spawnX: startX, spawnY: startY },
      },
      path,
      gridSize: GRID,
      canvasWidth: W, canvasHeight: H,
      winner: null,
    };

    const interval = setInterval(() => {
      if (!running) return;

      for (const pid of ctx.players) {
        const p = state.players[pid];
        if (p.completed) continue;

        // Respawning
        if (p.fallTimer > 0) {
          p.fallTimer--;
          if (p.fallTimer <= 0) {
            p.x = p.spawnX;
            p.y = p.spawnY;
            p.alive = true;
          }
          continue;
        }

        if (!p.alive) continue;

        const inp = inputs[pid];
        if (inp.up) p.y -= MOVE_SPEED;
        if (inp.down) p.y += MOVE_SPEED;
        if (inp.left) p.x -= MOVE_SPEED;
        if (inp.right) p.x += MOVE_SPEED;

        // Clamp to bounds
        p.x = Math.max(PW / 2, Math.min(HALF_W - PW / 2, p.x));
        p.y = Math.max(PH / 2, Math.min(H - PH / 2, p.y));

        // Check if on path
        const col = Math.floor(p.x / GRID);
        const row = Math.floor(p.y / GRID);
        const onPath = col >= 0 && col < COLS && row >= 0 && row < ROWS && path[row][col];

        if (!onPath) {
          // Fall off!
          p.alive = false;
          p.fallTimer = FALL_DELAY;
        } else {
          // Update spawn point (last known safe position)
          p.spawnX = p.x;
          p.spawnY = p.y;
        }

        // Check if reached end
        if (col >= endCol && Math.abs(row - endRow) <= 1) {
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
        const input = data as { up?: boolean; down?: boolean; left?: boolean; right?: boolean };
        const inp = inputs[playerId];
        if (!inp) return;
        if (input.up !== undefined) inp.up = input.up;
        if (input.down !== undefined) inp.down = input.down;
        if (input.left !== undefined) inp.left = input.left;
        if (input.right !== undefined) inp.right = input.right;
      },
      getState() { return state; },
      cleanup(): void { running = false; clearInterval(interval); },
    };
  },
};
