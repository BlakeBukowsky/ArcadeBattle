import type { ServerGameModule, MatchContext, GameInstance } from '@arcade-battle/shared';

const W = 800, H = 500, HALF_W = 400;
const PW = 12, PH = 16;
const GRAVITY = 0.4;
const MOVE_SPEED = 3;
const JUMP_POWER = -8;
const CAVE_COLS = 20, CAVE_ROWS = 40;
const TILE = 24;
const CAVE_W = CAVE_COLS * TILE;
const CAVE_H = CAVE_ROWS * TILE;
const TICK_RATE = 1000 / 60;

type Tile = 0 | 1 | 2 | 3; // air, solid, spike, exit

function generateCave(): { grid: Tile[][]; exitR: number; exitC: number } {
  const grid: Tile[][] = [];
  for (let r = 0; r < CAVE_ROWS; r++) {
    const row: Tile[] = [];
    for (let c = 0; c < CAVE_COLS; c++) {
      // Fill everything solid initially
      row.push(1);
    }
    grid.push(row);
  }

  // Carve the cave using a room+tunnel approach
  // Divide into sections of ~8 rows each
  const SECTION_H = 8;
  const numSections = Math.floor(CAVE_ROWS / SECTION_H);
  let pathCol = 2 + Math.floor(Math.random() * (CAVE_COLS - 6));

  // Starting room at top
  for (let r = 0; r < 3; r++) {
    for (let c = 1; c < CAVE_COLS - 1; c++) grid[r][c] = 0;
  }

  for (let s = 0; s < numSections; s++) {
    const baseR = s * SECTION_H + 3;

    // Carve a room at the current path column
    const roomW = 4 + Math.floor(Math.random() * 4);
    const roomH = 3 + Math.floor(Math.random() * 2);
    const roomC = Math.max(1, Math.min(CAVE_COLS - roomW - 1, pathCol - roomW / 2));
    const roomR = Math.min(CAVE_ROWS - 2, baseR);

    for (let r = roomR; r < Math.min(CAVE_ROWS - 1, roomR + roomH); r++) {
      for (let c = roomC; c < Math.min(CAVE_COLS - 1, roomC + roomW); c++) {
        grid[r][c] = 0;
      }
    }

    // Decide next path direction: sometimes go left, sometimes right, always eventually down
    const nextPathCol = Math.max(2, Math.min(CAVE_COLS - 3, pathCol + Math.floor(Math.random() * 9) - 4));

    // Carve horizontal tunnel from current room to next column
    const tunnelR = Math.min(CAVE_ROWS - 2, roomR + roomH);
    const startC = Math.min(pathCol, nextPathCol);
    const endC = Math.max(pathCol, nextPathCol);
    for (let c = Math.max(1, startC - 1); c <= Math.min(CAVE_COLS - 2, endC + 1); c++) {
      grid[tunnelR][c] = 0;
      if (tunnelR > 0) grid[tunnelR - 1][c] = 0; // 2-tall tunnel
      if (tunnelR + 1 < CAVE_ROWS) grid[tunnelR + 1][c] = 0; // 3-tall for comfort
    }

    // Carve vertical shaft down to next section
    const shaftC = nextPathCol;
    const shaftEnd = Math.min(CAVE_ROWS - 1, tunnelR + SECTION_H - roomH);
    for (let r = tunnelR; r <= shaftEnd; r++) {
      grid[r][shaftC] = 0;
      if (shaftC > 0) grid[r][shaftC - 1] = 0; // wide shaft
      if (shaftC < CAVE_COLS - 1) grid[r][shaftC + 1] = 0;
    }

    pathCol = nextPathCol;
  }

  // Add platforms inside large open areas (so player can climb)
  for (let r = 5; r < CAVE_ROWS - 3; r += 3) {
    for (let c = 2; c < CAVE_COLS - 2; c++) {
      if (grid[r][c] === 0 && grid[r + 1][c] === 0 && grid[r - 1][c] === 0) {
        // Open space — maybe add a platform
        if (Math.random() < 0.15) {
          grid[r][c] = 1;
          if (c + 1 < CAVE_COLS - 1 && grid[r][c + 1] === 0) grid[r][c + 1] = 1;
        }
      }
    }
  }

  // Add spikes on some surfaces
  for (let r = 3; r < CAVE_ROWS - 2; r++) {
    for (let c = 2; c < CAVE_COLS - 2; c++) {
      if (grid[r][c] === 0 && grid[r + 1][c] === 1 && Math.random() < 0.08) {
        // Spike on floor
        grid[r][c] = 2;
      }
    }
  }

  // Place exit at bottom — find an air tile near pathCol
  let exitR = CAVE_ROWS - 3, exitC = pathCol;
  for (let r = CAVE_ROWS - 3; r > CAVE_ROWS - 8; r--) {
    if (grid[r][pathCol] === 0) { exitR = r; break; }
  }
  grid[exitR][exitC] = 3;
  // Ensure air around exit
  if (exitR > 0) grid[exitR - 1][exitC] = 0;
  if (exitR + 1 < CAVE_ROWS) grid[exitR + 1][exitC] = 0;

  return { grid, exitR, exitC };
}

interface PlayerState {
  x: number; y: number; vx: number; vy: number;
  grounded: boolean; alive: boolean; completed: boolean;
  cameraX: number; cameraY: number;
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
    description: 'Spelunky-style cave race',
    controls: 'A/D to move, W/Space to jump. Navigate the cave, avoid spikes, reach the exit first.',
    maxDuration: 120,
  },

  create(ctx: MatchContext): GameInstance {
    const [p1, p2] = ctx.players;
    let running = true;
    const { grid, exitR, exitC } = generateCave();
    const inputs: { [id: string]: { left: boolean; right: boolean; jump: boolean } } = {
      [p1]: { left: false, right: false, jump: false },
      [p2]: { left: false, right: false, jump: false },
    };

    const state: SpelunkyState = {
      players: {
        [p1]: { x: CAVE_W / 2 - PW / 2, y: TILE + 4, vx: 0, vy: 0, grounded: false, alive: true, completed: false, cameraX: 0, cameraY: 0 },
        [p2]: { x: CAVE_W / 2 - PW / 2, y: TILE + 4, vx: 0, vy: 0, grounded: false, alive: true, completed: false, cameraX: 0, cameraY: 0 },
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

    function resolveCollisions(p: PlayerState): void {
      p.grounded = false;

      // Vertical
      if (p.vy > 0) {
        const footRow = Math.floor((p.y + PH) / TILE);
        const left = Math.floor(p.x / TILE);
        const right = Math.floor((p.x + PW - 1) / TILE);
        for (let c = left; c <= right; c++) {
          const t = getTile(footRow, c);
          if (t === 1) {
            p.y = footRow * TILE - PH;
            p.vy = 0;
            p.grounded = true;
            break;
          }
        }
      } else if (p.vy < 0) {
        const headRow = Math.floor(p.y / TILE);
        const left = Math.floor(p.x / TILE);
        const right = Math.floor((p.x + PW - 1) / TILE);
        for (let c = left; c <= right; c++) {
          if (getTile(headRow, c) === 1) {
            p.y = (headRow + 1) * TILE;
            p.vy = 0;
            break;
          }
        }
      }

      // Horizontal
      const top = Math.floor(p.y / TILE);
      const bottom = Math.floor((p.y + PH - 1) / TILE);
      if (p.vx < 0) {
        const leftCol = Math.floor(p.x / TILE);
        for (let r = top; r <= bottom; r++) {
          if (getTile(r, leftCol) === 1) { p.x = (leftCol + 1) * TILE; p.vx = 0; break; }
        }
      } else if (p.vx > 0) {
        const rightCol = Math.floor((p.x + PW - 1) / TILE);
        for (let r = top; r <= bottom; r++) {
          if (getTile(r, rightCol) === 1) { p.x = rightCol * TILE - PW; p.vx = 0; break; }
        }
      }
    }

    function checkHazards(p: PlayerState, pid: string): boolean {
      const left = Math.floor(p.x / TILE);
      const right = Math.floor((p.x + PW - 1) / TILE);
      const top = Math.floor(p.y / TILE);
      const bottom = Math.floor((p.y + PH - 1) / TILE);

      for (let r = top; r <= bottom; r++) {
        for (let c = left; c <= right; c++) {
          const t = getTile(r, c);
          if (t === 2) {
            p.alive = false;
            const opponent = pid === p1 ? p2 : p1;
            running = false;
            state.winner = opponent;
            ctx.emit('game:state', state);
            ctx.endRound(opponent);
            return true;
          }
          if (t === 3) {
            p.completed = true;
            running = false;
            state.winner = pid;
            ctx.emit('game:state', state);
            ctx.endRound(pid);
            return true;
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

        if (inp.jump && p.grounded) { p.vy = JUMP_POWER; p.grounded = false; inp.jump = false; }
        p.vy += GRAVITY;
        p.x += p.vx; p.y += p.vy;

        p.x = Math.max(TILE, Math.min(CAVE_W - TILE - PW, p.x));

        resolveCollisions(p);
        if (checkHazards(p, pid)) return;

        // Camera — follow player, centered
        const targetCamX = p.x - HALF_W / 2;
        const targetCamY = p.y - H * 0.4;
        p.cameraX += (Math.max(0, Math.min(CAVE_W - HALF_W, targetCamX)) - p.cameraX) * 0.1;
        p.cameraY += (Math.max(0, Math.min(CAVE_H - H, targetCamY)) - p.cameraY) * 0.1;
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
