import { useEffect, useRef } from 'react';
import { useSocket, useMyId } from '../context/SocketContext.tsx';
import { drawLabel, drawBackground } from '../lib/sprites.js';
import { applyStateUpdate, StateBuffer } from '../lib/net.js';

type Shape = [number, number][];

interface Quilt { gridW: number; gridH: number; pieces: { shape: Shape; color: string }[]; }
interface PlayerState {
  currentQuilt: number; grid: (number | null)[][]; selectedPiece: number; rotation: number;
  placedPieces: boolean[]; completed: boolean; quiltsCompleted: number;
}
interface QuiltState {
  players: Record<string, PlayerState>;
  quilts: Quilt[];
  canvasWidth: number; canvasHeight: number; winner: string | null;
}

const CELL = 36;
const TRAY_CELL = 14;

function rotatePiece(shape: Shape, times: number): Shape {
  let s = shape;
  for (let i = 0; i < (times % 4); i++) s = s.map(([c, r]) => [-r, c]) as Shape;
  const minC = Math.min(...s.map(([c]) => c));
  const minR = Math.min(...s.map(([, r]) => r));
  return s.map(([c, r]) => [c - minC, r - minR]) as Shape;
}

export default function QuiltGame() {
  const socket = useSocket();
  const myId = useMyId();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const interpRef = useRef(new StateBuffer<QuiltState>()).current;
  const hoverRef = useRef<{ col: number; row: number } | null>(null);

  useEffect(() => {
    socket.on('game:state', (data: unknown) => { interpRef.push(applyStateUpdate(interpRef.latest(), data)); });
    return () => { socket.off('game:state'); };
  }, [socket]);

  useEffect(() => {
    function kd(e: KeyboardEvent) {
      if (e.key === 'r') socket.emit('game:input', { action: 'rotate' });
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

      const pids = Object.keys(state.players);
      const myIdx = pids.indexOf(myId);
      const ox = myIdx * HALF;
      if (mx < ox || mx > ox + HALF) return;

      const p = state.players[myId];
      if (!p) return;
      const quilt = state.quilts[p.currentQuilt];
      if (!quilt) return;

      // Grid area
      const gridOx = ox + 10;
      const gridOy = 50;
      const gridCol = Math.floor((mx - gridOx) / CELL);
      const gridRow = Math.floor((my - gridOy) / CELL);

      if (gridCol >= 0 && gridCol < quilt.gridW && gridRow >= 0 && gridRow < quilt.gridH) {
        if (e.button === 2 || e.shiftKey) {
          // Right click or shift+click to remove
          socket.emit('game:input', { action: 'remove', col: gridCol, row: gridRow });
        } else {
          socket.emit('game:input', { action: 'place', col: gridCol, row: gridRow });
        }
        return;
      }

      // Piece tray area (below grid)
      const trayY = gridOy + quilt.gridH * CELL + 15;
      if (my >= trayY && my < trayY + 80) {
        // Find which piece was clicked
        let px = ox + 10;
        for (let pi = 0; pi < quilt.pieces.length; pi++) {
          const piece = quilt.pieces[pi];
          const maxC = Math.max(...piece.shape.map(([c]) => c)) + 1;
          const pieceW = maxC * TRAY_CELL + 6;
          if (mx >= px && mx < px + pieceW) {
            socket.emit('game:input', { action: 'select', pieceIndex: pi });
            return;
          }
          px += pieceW + 4;
        }
      }
    }

    function onMove(e: MouseEvent) {
      const rect = canvas!.getBoundingClientRect();
      const state = interpRef.latest(); if (!state) return;
      const W = state.canvasWidth, HALF = W / 2;
      const mx = (e.clientX - rect.left) * (W / rect.width);
      const my = (e.clientY - rect.top) * (state.canvasHeight / rect.height);
      const pids = Object.keys(state.players);
      const myIdx = pids.indexOf(myId);
      const ox = myIdx * HALF;
      const gridOx = ox + 10, gridOy = 50;
      const p = state.players[myId]; if (!p) return;
      const quilt = state.quilts[p.currentQuilt]; if (!quilt) return;
      const col = Math.floor((mx - gridOx) / CELL);
      const row = Math.floor((my - gridOy) / CELL);
      if (col >= 0 && col < quilt.gridW && row >= 0 && row < quilt.gridH) {
        hoverRef.current = { col, row };
      } else {
        hoverRef.current = null;
      }
    }

    function onContext(e: Event) { e.preventDefault(); }
    canvas.addEventListener('click', onClick);
    canvas.addEventListener('mousemove', onMove);
    canvas.addEventListener('contextmenu', onContext);
    canvas.addEventListener('mousedown', (e) => { if (e.button === 2) onClick(e); });
    return () => { canvas.removeEventListener('click', onClick); canvas.removeEventListener('mousemove', onMove); canvas.removeEventListener('contextmenu', onContext); };
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

        drawLabel(c, isMe ? 'YOU' : 'OPPONENT', ox + HALF / 2, 16, { color: '#ffffff88', font: '12px monospace' });
        drawLabel(c, `Quilt ${p.quiltsCompleted + 1} / ${state.quilts.length}`, ox + HALF / 2, 34, { color: '#ffffff', font: '14px monospace' });

        // Grid
        const gridOx = ox + 10;
        const gridOy = 50;

        for (let r = 0; r < quilt.gridH; r++) {
          for (let col = 0; col < quilt.gridW; col++) {
            const cx = gridOx + col * CELL, cy = gridOy + r * CELL;
            const pieceIdx = p.grid[r]?.[col];
            const cellColor = pieceIdx !== null && pieceIdx !== undefined ? quilt.pieces[pieceIdx]?.color ?? '#888' : null;
            c.fillStyle = cellColor ?? '#1a1a1a';
            c.fillRect(cx + 1, cy + 1, CELL - 2, CELL - 2);
            c.strokeStyle = '#333'; c.lineWidth = 1;
            c.strokeRect(cx, cy, CELL, CELL);
          }
        }

        // Ghost preview on grid at hover position
        if (isMe && !p.placedPieces[p.selectedPiece] && hoverRef.current) {
          const piece = quilt.pieces[p.selectedPiece];
          const shape = rotatePiece(piece.shape, p.rotation);
          const hc = hoverRef.current.col, hr = hoverRef.current.row;
          const canPlace = shape.every(([dc, dr]) => {
            const nc = hc + dc, nr = hr + dr;
            return nc >= 0 && nc < quilt.gridW && nr >= 0 && nr < quilt.gridH && p.grid[nr]?.[nc] === null;
          });
          for (const [dc, dr] of shape) {
            const gc = hc + dc, gr = hr + dr;
            if (gc >= 0 && gc < quilt.gridW && gr >= 0 && gr < quilt.gridH) {
              c.fillStyle = canPlace ? piece.color + '55' : '#ff444433';
              c.fillRect(gridOx + gc * CELL + 2, gridOy + gr * CELL + 2, CELL - 4, CELL - 4);
            }
          }
        }

        // Selected piece shape hint at top-right of grid
        if (isMe && !p.placedPieces[p.selectedPiece]) {
          const piece = quilt.pieces[p.selectedPiece];
          const shape = rotatePiece(piece.shape, p.rotation);
          const previewX = gridOx + quilt.gridW * CELL + 10;
          drawLabel(c, 'Selected:', previewX + 20, gridOy + 5, { color: '#888', font: '9px monospace' });
          for (const [dc, dr] of shape) {
            c.fillStyle = piece.color + '88';
            c.fillRect(previewX + dc * 16, gridOy + 12 + dr * 16, 14, 14);
          }
        }

        // Piece tray — show ALL pieces
        const trayY = gridOy + quilt.gridH * CELL + 15;
        if (isMe) {
          drawLabel(c, 'Pieces (click to select, R to rotate, right-click grid to remove)', ox + HALF / 2, trayY - 4, { color: '#666', font: '8px monospace' });
        }

        let trayX = ox + 10;
        for (let pi = 0; pi < quilt.pieces.length; pi++) {
          const piece = quilt.pieces[pi];
          const shape = piece.shape;
          const maxC = Math.max(...shape.map(([cc]) => cc)) + 1;
          const maxR = Math.max(...shape.map(([, rr]) => rr)) + 1;
          const pieceW = maxC * TRAY_CELL + 4;

          // Background
          const isSelected = isMe && p.selectedPiece === pi;
          const isPlaced = p.placedPieces[pi];

          if (isSelected) {
            c.strokeStyle = '#ffffff';
            c.lineWidth = 2;
            c.strokeRect(trayX - 2, trayY - 2, pieceW + 2, maxR * TRAY_CELL + 6);
          }

          for (const [dc, dr] of shape) {
            c.fillStyle = isPlaced ? '#333' : piece.color;
            c.globalAlpha = isPlaced ? 0.3 : 1;
            c.fillRect(trayX + dc * TRAY_CELL + 1, trayY + 2 + dr * TRAY_CELL + 1, TRAY_CELL - 2, TRAY_CELL - 2);
          }
          c.globalAlpha = 1;

          trayX += pieceW + 4;
        }

        if (!isMe) {
          const filled = p.grid.flat().filter((v) => v !== null).length;
          const total = quilt.gridW * quilt.gridH;
          drawLabel(c, `${filled}/${total}`, ox + HALF / 2, trayY + 20, { color: '#888', font: '12px monospace' });
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
  }, [socket, myId, interpRef]);

  return (
    <div className="game-container">
      <canvas ref={canvasRef} className="game-canvas" />
      <p className="controls-hint">Click tray to select piece, R to rotate, click grid to place, right-click to remove</p>
    </div>
  );
}
