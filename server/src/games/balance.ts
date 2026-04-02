import type { ServerGameModule, MatchContext, GameInstance } from '@arcade-battle/shared';

const W = 800, H = 500, HALF_W = 400;
const GRID = 16;
const PATH_W = 1; // 1 tile wide
const COLS = 45, ROWS = 30;
const PW = 8, PH = 8;
const MOVE_SPEED = 1.8;
const FALL_DELAY = 60;
const VIEW_RADIUS = 5; // tiles visible around player (fog of war)
const TICK_RATE = 1000 / 60;

function generatePath(): { grid: boolean[][]; startR: number; endR: number; endC: number } {
  const grid: boolean[][] = [];
  for (let r = 0; r < ROWS; r++) grid.push(new Array(COLS).fill(false));

  // Generate a winding 1-tile-wide path from left to right
  let row = Math.floor(ROWS / 2);
  let col = 0;
  const startR = row;

  // Starting pad (small)
  grid[row][0] = true;
  grid[row][1] = true;
  col = 2;

  while (col < COLS - 2) {
    grid[row][col] = true;

    // Windier path: favor vertical movement, with mandatory right progress
    const roll = Math.random();
    if (roll < 0.35) {
      col++; // right
    } else if (roll < 0.55 && row > 2) {
      row--; // up (more likely than before)
    } else if (roll < 0.75 && row < ROWS - 3) {
      row++; // down
    } else if (roll < 0.85 && row > 2) {
      // Double up
      row--; grid[row][col] = true; row--;
    } else if (roll < 0.95 && row < ROWS - 3) {
      // Double down
      row++; grid[row][col] = true; row++;
    } else {
      col++; // right fallback
    }

    // Ensure we make rightward progress every few steps
    if (col < COLS - 3 && Math.random() < 0.15) col++;
  }

  // End tile
  grid[row][COLS - 2] = true;

  return { grid, startR, endR: row, endC: COLS - 2 };
}

interface PlayerState {
  x: number; y: number;
  alive: boolean; completed: boolean;
  fallTimer: number;
  spawnX: number; spawnY: number;
}

interface BalanceState {
  players: { [id: string]: PlayerState };
  grid: boolean[][];
  gridSize: number;
  cols: number; rows: number;
  viewRadius: number;
  endR: number; endC: number;
  canvasWidth: number; canvasHeight: number;
  winner: string | null;
}

export const balanceGame: ServerGameModule = {
  info: {
    id: 'balance',
    name: 'Balance',
    description: 'Navigate the hidden path',
    controls: 'WASD to move. Path reveals as you go. Fall off = respawn after 1s. First to the end wins.',
    maxDuration: 90,
  },

  create(ctx: MatchContext): GameInstance {
    const [p1, p2] = ctx.players;
    let running = true;
    const { grid, startR, endR, endC } = generatePath();
    const inputs: { [id: string]: { up: boolean; down: boolean; left: boolean; right: boolean } } = {
      [p1]: { up: false, down: false, left: false, right: false },
      [p2]: { up: false, down: false, left: false, right: false },
    };

    const startX = 1 * GRID + GRID / 2;
    const startY = startR * GRID + GRID / 2;

    // Track which tiles each player has revealed
    const revealed: { [id: string]: boolean[][] } = {
      [p1]: grid.map((r) => r.map(() => false)),
      [p2]: grid.map((r) => r.map(() => false)),
    };

    function revealAround(pid: string, px: number, py: number): void {
      const pc = Math.floor(px / GRID);
      const pr = Math.floor(py / GRID);
      for (let dr = -VIEW_RADIUS; dr <= VIEW_RADIUS; dr++) {
        for (let dc = -VIEW_RADIUS; dc <= VIEW_RADIUS; dc++) {
          const r = pr + dr, c = pc + dc;
          if (r >= 0 && r < ROWS && c >= 0 && c < COLS) {
            if (dr * dr + dc * dc <= VIEW_RADIUS * VIEW_RADIUS) {
              revealed[pid][r][c] = true;
            }
          }
        }
      }
    }

    // Reveal starting area
    revealAround(p1, startX, startY);
    revealAround(p2, startX, startY);

    const state: BalanceState = {
      players: {
        [p1]: { x: startX, y: startY, alive: true, completed: false, fallTimer: 0, spawnX: startX, spawnY: startY },
        [p2]: { x: startX, y: startY, alive: true, completed: false, fallTimer: 0, spawnX: startX, spawnY: startY },
      },
      grid, // full grid sent but client only renders revealed tiles
      gridSize: GRID,
      cols: COLS, rows: ROWS,
      viewRadius: VIEW_RADIUS,
      endR, endC,
      canvasWidth: W, canvasHeight: H,
      winner: null,
    };

    const interval = setInterval(() => {
      if (!running) return;

      for (const pid of ctx.players) {
        const p = state.players[pid];
        if (p.completed) continue;

        if (p.fallTimer > 0) {
          p.fallTimer--;
          if (p.fallTimer <= 0) { p.x = p.spawnX; p.y = p.spawnY; p.alive = true; }
          continue;
        }
        if (!p.alive) continue;

        const inp = inputs[pid];
        if (inp.up) p.y -= MOVE_SPEED;
        if (inp.down) p.y += MOVE_SPEED;
        if (inp.left) p.x -= MOVE_SPEED;
        if (inp.right) p.x += MOVE_SPEED;

        p.x = Math.max(PW / 2, Math.min(COLS * GRID - PW / 2, p.x));
        p.y = Math.max(PH / 2, Math.min(ROWS * GRID - PH / 2, p.y));

        // Reveal tiles
        revealAround(pid, p.x, p.y);

        // Check if on path
        const col = Math.floor(p.x / GRID);
        const row = Math.floor(p.y / GRID);
        const onPath = col >= 0 && col < COLS && row >= 0 && row < ROWS && grid[row][col];

        if (!onPath) {
          p.alive = false;
          p.fallTimer = FALL_DELAY;
        } else {
          p.spawnX = p.x;
          p.spawnY = p.y;
        }

        // Check win
        if (col >= endC && Math.abs(row - endR) <= 1) {
          p.completed = true;
          running = false;
          state.winner = pid;
          ctx.emit('game:state', state);
          ctx.endRound(pid);
          return;
        }
      }

      // Send per-player state with their revealed tiles
      for (const pid of ctx.players) {
        const socketId = ctx.players.indexOf(pid) === 0 ? ctx.players[0] : ctx.players[1];
        ctx.emitTo(pid, 'game:state', { ...state, revealed: revealed[pid] });
      }
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
