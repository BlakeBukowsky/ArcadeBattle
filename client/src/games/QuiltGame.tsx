import { useEffect, useRef, useState } from 'react';
import { useSocket, useMyId } from '../context/SocketContext.tsx';
import { drawLabel, drawBackground } from '../lib/sprites.js';
import { applyStateUpdate, StateBuffer } from '../lib/net.js';

type Shape = [number, number][];

interface Quilt { gridW: number; gridH: number; pieces: { shape: Shape; color: string }[]; }
interface PlayerState { currentQuilt: number; grid: (string | null)[][]; currentPiece: number; completed: boolean; quiltsCompleted: number; }
interface QuiltState {
  players: Record<string, PlayerState>;
  quilts: Quilt[];
  canvasWidth: number; canvasHeight: number; winner: string | null;
}

const CELL = 40;

function rotatePiece(shape: Shape, times: number): Shape {
  let s = shape;
  for (let i = 0; i < (times % 4); i++) {
    s = s.map(([c, r]) => [-r, c]) as Shape;
  }
  const minC = Math.min(...s.map(([c]) => c));
  const minR = Math.min(...s.map(([, r]) => r));
  return s.map(([c, r]) => [c - minC, r - minR]) as Shape;
}

export default function QuiltGame() {
  const socket = useSocket();
  const myId = useMyId();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const interpRef = useRef(new StateBuffer<QuiltState>()).current;
  const [rotation, setRotation] = useState(0);

  useEffect(() => {
    socket.on('game:state', (data: unknown) => { interpRef.push(applyStateUpdate(interpRef.latest(), data)); });
    return () => { socket.off('game:state'); };
  }, [socket]);

  useEffect(() => {
    function kd(e: KeyboardEvent) {
      if (e.key === 'r') { socket.emit('game:input', { action: 'rotate' }); setRotation((r) => (r + 1) % 4); }
      if (e.key === 'e' || e.key === 'ArrowRight') socket.emit('game:input', { action: 'next' });
      if (e.key === 'q' || e.key === 'ArrowLeft') socket.emit('game:input', { action: 'prev' });
    }
    window.addEventListener('keydown', kd);
    return () => window.removeEventListener('keydown', kd);
  }, [socket]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    function onClick(e: MouseEvent) {
      const rect = canvas!.getBoundingClientRect();
      const state = interpRef.latest();
      if (!state) return;
      const W = state.canvasWidth, HALF = W / 2;
      const mx = (e.clientX - rect.left) * (W / rect.width);
      const my = (e.clientY - rect.top) * (state.canvasHeight / rect.height);

      // Only handle clicks on own half (left side for player index 0)
      const pids = Object.keys(state.players);
      const myIdx = pids.indexOf(myId);
      const ox = myIdx * HALF;
      if (mx < ox || mx > ox + HALF) return;

      const p = state.players[myId];
      if (!p) return;
      const quilt = state.quilts[p.currentQuilt];
      if (!quilt) return;

      const gridOx = ox + (HALF - quilt.gridW * CELL) / 2;
      const gridOy = 60;

      const col = Math.floor((mx - gridOx) / CELL);
      const row = Math.floor((my - gridOy) / CELL);
      if (col >= 0 && col < quilt.gridW && row >= 0 && row < quilt.gridH) {
        socket.emit('game:input', { action: 'place', col, row });
      }
    }
    canvas.addEventListener('click', onClick);
    return () => canvas.removeEventListener('click', onClick);
  }, [socket, myId, interpRef]);

  useEffect(() => {
    let animId: number;
    function draw() {
      const canvas = canvasRef.current;
      const c = canvas?.getContext('2d');
      const state = interpRef.interpolate();
      if (!canvas || !c || !state) { animId = requestAnimationFrame(draw); return; }

      const W = state.canvasWidth, H = state.canvasHeight, HALF = W / 2;
      canvas.width = W; canvas.height = H;

      drawBackground(c, 'quilt', W, H, { color: '#12100a' });

      c.strokeStyle = '#333'; c.lineWidth = 2; c.setLineDash([6, 6]);
      c.beginPath(); c.moveTo(HALF, 0); c.lineTo(HALF, H); c.stroke(); c.setLineDash([]);

      const pids = Object.keys(state.players);
      pids.forEach((pid, idx) => {
        const ox = idx * HALF;
        const p = state.players[pid];
        const isMe = pid === myId;
        const quilt = state.quilts[p.currentQuilt];
        if (!quilt) return;

        c.save();
        c.beginPath(); c.rect(ox, 0, HALF, H); c.clip();

        drawLabel(c, isMe ? 'YOU' : 'OPPONENT', ox + HALF / 2, 18, { color: '#ffffff88', font: '12px monospace' });
        drawLabel(c, `Quilt ${p.quiltsCompleted + 1} / ${state.quilts.length}`, ox + HALF / 2, 38, { color: '#ffffff', font: '14px monospace' });

        // Grid
        const gridOx = ox + (HALF - quilt.gridW * CELL) / 2;
        const gridOy = 60;

        for (let r = 0; r < quilt.gridH; r++) {
          for (let col = 0; col < quilt.gridW; col++) {
            const cellColor = p.grid[r]?.[col];
            const cx = gridOx + col * CELL, cy = gridOy + r * CELL;
            c.fillStyle = cellColor ?? '#1a1a1a';
            c.fillRect(cx + 1, cy + 1, CELL - 2, CELL - 2);
            c.strokeStyle = '#333'; c.lineWidth = 1;
            c.strokeRect(cx, cy, CELL, CELL);
          }
        }

        // Current piece preview (only for own side)
        if (isMe && !p.completed) {
          const piece = quilt.pieces[p.currentPiece];
          if (piece) {
            const shape = rotatePiece(piece.shape, rotation);
            const previewY = gridOy + quilt.gridH * CELL + 20;
            drawLabel(c, `Piece ${p.currentPiece + 1} — Q/E to browse, R to rotate, Click to place`, ox + HALF / 2, previewY, { color: '#888', font: '10px monospace' });
            const previewOx = ox + HALF / 2 - 20;
            for (const [dc, dr] of shape) {
              c.fillStyle = piece.color;
              c.fillRect(previewOx + dc * 20, previewY + 10 + dr * 20, 18, 18);
            }
          }
        } else if (!isMe) {
          // Opponent: just show progress
          const filled = p.grid.flat().filter((v) => v !== null).length;
          const total = quilt.gridW * quilt.gridH;
          drawLabel(c, `${filled}/${total} filled`, ox + HALF / 2, gridOy + quilt.gridH * CELL + 20, { color: '#888', font: '12px monospace' });
        }

        c.restore();
      });

      if (state.winner) {
        c.fillStyle = '#000000aa'; c.fillRect(0, H / 2 - 30, W, 60);
        drawLabel(c, state.winner === myId ? 'YOU WIN!' : 'YOU LOSE!', W / 2, H / 2 + 8, {
          color: state.winner === myId ? '#00ff88' : '#ff4488', font: '28px monospace',
        });
      }

      animId = requestAnimationFrame(draw);
    }
    animId = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animId);
  }, [socket, myId, interpRef, rotation]);

  return (
    <div className="game-container">
      <canvas ref={canvasRef} className="game-canvas" />
      <p className="controls-hint">Click grid to place, R to rotate, Q/E to browse pieces</p>
    </div>
  );
}
