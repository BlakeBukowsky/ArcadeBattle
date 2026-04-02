import type { ServerGameModule, MatchContext, GameInstance } from '@arcade-battle/shared';

const TICK_RATE = 1000 / 15;
const NUM_QUILTS = 3;

// Piece shapes as relative cell coords
type Shape = [number, number][];
const ALL_SHAPES: Shape[] = [
  [[0,0],[1,0]], // 2-horiz
  [[0,0],[0,1]], // 2-vert
  [[0,0],[1,0],[2,0]], // 3-horiz
  [[0,0],[0,1],[0,2]], // 3-vert
  [[0,0],[1,0],[0,1]], // L
  [[0,0],[1,0],[1,1]], // L reverse
  [[0,0],[0,1],[1,1]], // S
  [[0,0],[1,0],[1,-1]], // Z
  [[0,0],[1,0],[0,1],[1,1]], // square
  [[0,0]], // single
];

interface Quilt {
  gridW: number;
  gridH: number;
  pieces: { shape: Shape; color: string }[];
}

function generateQuilt(difficulty: number): Quilt {
  // difficulty 0=easy, 1=medium, 2=hard
  const gridW = 3 + difficulty;
  const gridH = 3 + difficulty;
  const grid: boolean[][] = [];
  for (let r = 0; r < gridH; r++) grid.push(new Array(gridW).fill(false));

  const pieces: { shape: Shape; color: string }[] = [];
  const colors = ['#ff4444', '#44ff44', '#4444ff', '#ffaa00', '#ff44ff', '#44ffff', '#ff8844', '#88ff44'];
  let colorIdx = 0;

  // Fill the grid by placing shapes
  for (let r = 0; r < gridH; r++) {
    for (let c = 0; c < gridW; c++) {
      if (grid[r][c]) continue;

      // Try shapes in random order
      const shuffled = [...ALL_SHAPES].sort(() => Math.random() - 0.5);
      let placed = false;
      for (const shape of shuffled) {
        const canPlace = shape.every(([dc, dr]) => {
          const nc = c + dc, nr = r + dr;
          return nc >= 0 && nc < gridW && nr >= 0 && nr < gridH && !grid[nr][nc];
        });
        if (canPlace) {
          shape.forEach(([dc, dr]) => { grid[r + dr][c + dc] = true; });
          pieces.push({ shape: shape.map(([dc, dr]) => [dc, dr]) as Shape, color: colors[colorIdx % colors.length] });
          colorIdx++;
          placed = true;
          break;
        }
      }
      if (!placed) {
        // Single cell fallback
        grid[r][c] = true;
        pieces.push({ shape: [[0, 0]], color: colors[colorIdx % colors.length] });
        colorIdx++;
      }
    }
  }

  // Shuffle pieces (player needs to figure out placement)
  pieces.sort(() => Math.random() - 0.5);

  return { gridW, gridH, pieces };
}

interface PlayerState {
  currentQuilt: number;
  grid: (string | null)[][]; // placed colors or null
  currentPiece: number;
  completed: boolean;
  quiltsCompleted: number;
}

interface QuiltState {
  players: { [id: string]: PlayerState };
  quilts: Quilt[];
  canvasWidth: number; canvasHeight: number;
  winner: string | null;
}

export const quiltGame: ServerGameModule = {
  info: {
    id: 'quilt',
    name: 'Quilt',
    description: 'Piece-fitting puzzle race',
    controls: 'Click to place, R to rotate, Q/E to browse pieces. Complete 3 quilts first.',
    maxDuration: 120,
  },

  create(ctx: MatchContext): GameInstance {
    const [p1, p2] = ctx.players;
    let running = true;

    const quilts = [generateQuilt(0), generateQuilt(1), generateQuilt(2)];

    function makeEmptyGrid(q: Quilt): (string | null)[][] {
      const grid: (string | null)[][] = [];
      for (let r = 0; r < q.gridH; r++) grid.push(new Array(q.gridW).fill(null));
      return grid;
    }

    const state: QuiltState = {
      players: {
        [p1]: { currentQuilt: 0, grid: makeEmptyGrid(quilts[0]), currentPiece: 0, completed: false, quiltsCompleted: 0 },
        [p2]: { currentQuilt: 0, grid: makeEmptyGrid(quilts[0]), currentPiece: 0, completed: false, quiltsCompleted: 0 },
      },
      quilts,
      canvasWidth: 800, canvasHeight: 500,
      winner: null,
    };

    // Track which pieces each player has placed
    const placedPieces: { [id: string]: boolean[] } = {
      [p1]: new Array(quilts[0].pieces.length).fill(false),
      [p2]: new Array(quilts[0].pieces.length).fill(false),
    };

    // Track piece rotations per player
    const rotations: { [id: string]: number[] } = {
      [p1]: new Array(quilts[0].pieces.length).fill(0),
      [p2]: new Array(quilts[0].pieces.length).fill(0),
    };

    const interval = setInterval(() => {
      if (!running) return;
      ctx.emit('game:state', state);
    }, TICK_RATE);

    function rotatePiece(shape: Shape, times: number): Shape {
      let s = shape;
      for (let i = 0; i < (times % 4); i++) {
        s = s.map(([c, r]) => [-r, c]) as Shape;
      }
      // Normalize to positive coords
      const minC = Math.min(...s.map(([c]) => c));
      const minR = Math.min(...s.map(([, r]) => r));
      return s.map(([c, r]) => [c - minC, r - minR]) as Shape;
    }

    return {
      onPlayerInput(playerId: string, data: unknown): void {
        if (!running) return;
        const input = data as { action?: string; col?: number; row?: number };
        const p = state.players[playerId];
        if (!p || p.completed) return;

        const quilt = quilts[p.currentQuilt];
        const placed = placedPieces[playerId];
        const rots = rotations[playerId];

        if (input.action === 'rotate') {
          rots[p.currentPiece] = (rots[p.currentPiece] + 1) % 4;
          ctx.emit('game:state', state);
          return;
        }

        if (input.action === 'next') {
          // Find next unplaced piece
          for (let i = 1; i <= quilt.pieces.length; i++) {
            const idx = (p.currentPiece + i) % quilt.pieces.length;
            if (!placed[idx]) { p.currentPiece = idx; break; }
          }
          ctx.emit('game:state', state);
          return;
        }

        if (input.action === 'prev') {
          for (let i = quilt.pieces.length - 1; i >= 1; i--) {
            const idx = (p.currentPiece + i) % quilt.pieces.length;
            if (!placed[idx]) { p.currentPiece = idx; break; }
          }
          ctx.emit('game:state', state);
          return;
        }

        if (input.action === 'place' && input.col !== undefined && input.row !== undefined) {
          if (placed[p.currentPiece]) return;

          const piece = quilt.pieces[p.currentPiece];
          const shape = rotatePiece(piece.shape, rots[p.currentPiece]);

          // Check if placement is valid
          const canPlace = shape.every(([dc, dr]) => {
            const nc = input.col! + dc, nr = input.row! + dr;
            return nc >= 0 && nc < quilt.gridW && nr >= 0 && nr < quilt.gridH && p.grid[nr][nc] === null;
          });

          if (!canPlace) return;

          // Place it
          shape.forEach(([dc, dr]) => {
            p.grid[input.row! + dr][input.col! + dc] = piece.color;
          });
          placed[p.currentPiece] = true;

          // Check if quilt is complete
          const allPlaced = placed.every((v) => v);
          if (allPlaced) {
            p.quiltsCompleted++;
            p.currentQuilt++;

            if (p.currentQuilt >= NUM_QUILTS) {
              p.completed = true;
              running = false;
              state.winner = playerId;
              clearInterval(interval);
              ctx.emit('game:state', state);
              ctx.endRound(playerId);
              return;
            }

            // Setup next quilt
            const nextQuilt = quilts[p.currentQuilt];
            p.grid = makeEmptyGrid(nextQuilt);
            p.currentPiece = 0;
            placedPieces[playerId] = new Array(nextQuilt.pieces.length).fill(false);
            rotations[playerId] = new Array(nextQuilt.pieces.length).fill(0);
          } else {
            // Select next unplaced piece
            for (let i = 0; i < quilt.pieces.length; i++) {
              if (!placed[i]) { p.currentPiece = i; break; }
            }
          }

          ctx.emit('game:state', state);
        }
      },
      getState() { return state; },
      cleanup(): void { running = false; clearInterval(interval); },
    };
  },
};
