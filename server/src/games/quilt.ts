import type { ServerGameModule, MatchContext, GameInstance } from '@arcade-battle/shared';

const TICK_RATE = 1000 / 15;
const NUM_QUILTS = 3;

type Shape = [number, number][];

const SHAPES: Shape[] = [
  [[0,0],[1,0]],
  [[0,0],[0,1]],
  [[0,0],[1,0],[2,0]],
  [[0,0],[0,1],[0,2]],
  [[0,0],[1,0],[0,1]],
  [[0,0],[1,0],[1,1]],
  [[0,0],[0,1],[1,1]],
  [[0,0],[1,0],[0,1],[1,1]],
  [[0,0]],
];

const COLORS = ['#ff4444','#44bb44','#4488ff','#ffaa00','#ff44ff','#44ffff','#ff8844','#88ff44','#aa44ff','#ff4488'];

interface Quilt {
  gridW: number; gridH: number;
  pieces: { shape: Shape; color: string }[];
}

function generateQuilt(difficulty: number): Quilt {
  const gridW = 3 + difficulty;
  const gridH = 3 + difficulty;
  const grid: boolean[][] = [];
  for (let r = 0; r < gridH; r++) grid.push(new Array(gridW).fill(false));

  const pieces: { shape: Shape; color: string }[] = [];
  let ci = 0;

  for (let r = 0; r < gridH; r++) {
    for (let c = 0; c < gridW; c++) {
      if (grid[r][c]) continue;
      const shuffled = [...SHAPES].sort(() => Math.random() - 0.5);
      let placed = false;
      for (const shape of shuffled) {
        const ok = shape.every(([dc, dr]) => {
          const nc = c + dc, nr = r + dr;
          return nc >= 0 && nc < gridW && nr >= 0 && nr < gridH && !grid[nr][nc];
        });
        if (ok) {
          shape.forEach(([dc, dr]) => { grid[r + dr][c + dc] = true; });
          pieces.push({ shape: shape.map(([dc, dr]) => [dc, dr]) as Shape, color: COLORS[ci % COLORS.length] });
          ci++;
          placed = true;
          break;
        }
      }
      if (!placed) {
        grid[r][c] = true;
        pieces.push({ shape: [[0, 0]], color: COLORS[ci % COLORS.length] });
        ci++;
      }
    }
  }

  pieces.sort(() => Math.random() - 0.5);
  return { gridW, gridH, pieces };
}

function rotatePiece(shape: Shape, times: number): Shape {
  let s = shape;
  for (let i = 0; i < (times % 4); i++) s = s.map(([c, r]) => [-r, c]) as Shape;
  const minC = Math.min(...s.map(([c]) => c));
  const minR = Math.min(...s.map(([, r]) => r));
  return s.map(([c, r]) => [c - minC, r - minR]) as Shape;
}

interface PlayerState {
  currentQuilt: number;
  grid: (string | null)[][];
  selectedPiece: number;
  rotation: number;
  placedPieces: boolean[];
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
    controls: 'Click grid to place piece. Click piece tray to select. R to rotate. X to remove placed piece. First to finish 3 quilts wins.',
    maxDuration: 120,
  },

  create(ctx: MatchContext): GameInstance {
    const [p1, p2] = ctx.players;
    let running = true;
    const quilts = [generateQuilt(0), generateQuilt(1), generateQuilt(2)];

    function makePlayer(q: Quilt): PlayerState {
      const grid: (string | null)[][] = [];
      for (let r = 0; r < q.gridH; r++) grid.push(new Array(q.gridW).fill(null));
      return { currentQuilt: 0, grid, selectedPiece: 0, rotation: 0, placedPieces: new Array(q.pieces.length).fill(false), completed: false, quiltsCompleted: 0 };
    }

    const state: QuiltState = {
      players: { [p1]: makePlayer(quilts[0]), [p2]: makePlayer(quilts[0]) },
      quilts,
      canvasWidth: 800, canvasHeight: 500,
      winner: null,
    };

    const interval = setInterval(() => {
      if (!running) return;
      ctx.emit('game:state', state);
    }, TICK_RATE);

    function advanceQuilt(playerId: string): void {
      const p = state.players[playerId];
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
      const q = quilts[p.currentQuilt];
      p.grid = [];
      for (let r = 0; r < q.gridH; r++) p.grid.push(new Array(q.gridW).fill(null));
      p.selectedPiece = 0;
      p.rotation = 0;
      p.placedPieces = new Array(q.pieces.length).fill(false);
    }

    return {
      onPlayerInput(playerId: string, data: unknown): void {
        if (!running) return;
        const input = data as { action?: string; col?: number; row?: number; pieceIndex?: number };
        const p = state.players[playerId];
        if (!p || p.completed) return;
        const quilt = quilts[p.currentQuilt];

        if (input.action === 'rotate') {
          p.rotation = (p.rotation + 1) % 4;
        } else if (input.action === 'select' && input.pieceIndex !== undefined) {
          if (input.pieceIndex >= 0 && input.pieceIndex < quilt.pieces.length && !p.placedPieces[input.pieceIndex]) {
            p.selectedPiece = input.pieceIndex;
            p.rotation = 0;
          }
        } else if (input.action === 'place' && input.col !== undefined && input.row !== undefined) {
          if (p.placedPieces[p.selectedPiece]) return;
          const piece = quilt.pieces[p.selectedPiece];
          const shape = rotatePiece(piece.shape, p.rotation);
          const ok = shape.every(([dc, dr]) => {
            const nc = input.col! + dc, nr = input.row! + dr;
            return nc >= 0 && nc < quilt.gridW && nr >= 0 && nr < quilt.gridH && p.grid[nr][nc] === null;
          });
          if (!ok) return;
          shape.forEach(([dc, dr]) => { p.grid[input.row! + dr][input.col! + dc] = piece.color; });
          p.placedPieces[p.selectedPiece] = true;

          // Select next unplaced
          for (let i = 0; i < quilt.pieces.length; i++) {
            if (!p.placedPieces[i]) { p.selectedPiece = i; p.rotation = 0; break; }
          }

          if (p.placedPieces.every((v) => v)) advanceQuilt(playerId);
        } else if (input.action === 'remove' && input.col !== undefined && input.row !== undefined) {
          // Remove a placed piece by clicking on it
          const color = p.grid[input.row]?.[input.col];
          if (!color) return;
          // Find which piece has this color and remove all its cells
          for (let pi = 0; pi < quilt.pieces.length; pi++) {
            if (quilt.pieces[pi].color === color && p.placedPieces[pi]) {
              // Clear all cells of this color
              for (let r = 0; r < quilt.gridH; r++) {
                for (let c = 0; c < quilt.gridW; c++) {
                  if (p.grid[r][c] === color) p.grid[r][c] = null;
                }
              }
              p.placedPieces[pi] = false;
              p.selectedPiece = pi;
              p.rotation = 0;
              break;
            }
          }
        }

        ctx.emit('game:state', state);
      },
      getState() { return state; },
      cleanup(): void { running = false; clearInterval(interval); },
    };
  },
};
