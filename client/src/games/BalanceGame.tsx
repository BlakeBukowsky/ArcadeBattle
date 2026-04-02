import { useEffect, useRef } from 'react';
import { useSocket, useMyId } from '../context/SocketContext.tsx';
import { drawSprite, drawLabel, drawBackground } from '../lib/sprites.js';
import { applyStateUpdate, StateBuffer } from '../lib/net.js';

const PW = 10, PH = 10;

interface PlayerState {
  x: number; y: number; alive: boolean; completed: boolean; fallTimer: number;
}
interface BalanceState {
  players: Record<string, PlayerState>;
  path: boolean[][];
  gridSize: number;
  canvasWidth: number; canvasHeight: number; winner: string | null;
}

export default function BalanceGame() {
  const socket = useSocket();
  const myId = useMyId();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const interpRef = useRef(new StateBuffer<BalanceState>()).current;

  useEffect(() => {
    socket.on('game:state', (data: unknown) => { interpRef.push(applyStateUpdate(interpRef.latest(), data)); });
    return () => { socket.off('game:state'); };
  }, [socket]);

  useEffect(() => {
    function kd(e: KeyboardEvent) {
      if (e.key === 'w' || e.key === 'ArrowUp') { e.preventDefault(); socket.emit('game:input', { up: true }); }
      if (e.key === 's' || e.key === 'ArrowDown') socket.emit('game:input', { down: true });
      if (e.key === 'a' || e.key === 'ArrowLeft') socket.emit('game:input', { left: true });
      if (e.key === 'd' || e.key === 'ArrowRight') socket.emit('game:input', { right: true });
    }
    function ku(e: KeyboardEvent) {
      if (e.key === 'w' || e.key === 'ArrowUp') socket.emit('game:input', { up: false });
      if (e.key === 's' || e.key === 'ArrowDown') socket.emit('game:input', { down: false });
      if (e.key === 'a' || e.key === 'ArrowLeft') socket.emit('game:input', { left: false });
      if (e.key === 'd' || e.key === 'ArrowRight') socket.emit('game:input', { right: false });
    }
    window.addEventListener('keydown', kd);
    window.addEventListener('keyup', ku);
    return () => { window.removeEventListener('keydown', kd); window.removeEventListener('keyup', ku); };
  }, [socket]);

  useEffect(() => {
    let animId: number;
    function draw() {
      const canvas = canvasRef.current;
      const c = canvas?.getContext('2d');
      const state = interpRef.interpolate();
      if (!canvas || !c || !state) { animId = requestAnimationFrame(draw); return; }

      const W = state.canvasWidth, H = state.canvasHeight, HALF = W / 2;
      const G = state.gridSize;
      const COLS = Math.floor(HALF / G);
      const ROWS = Math.floor(H / G);
      canvas.width = W; canvas.height = H;

      drawBackground(c, 'balance', W, H, { color: '#0a0a1a' });

      c.strokeStyle = '#333'; c.lineWidth = 2; c.setLineDash([6, 6]);
      c.beginPath(); c.moveTo(HALF, 0); c.lineTo(HALF, H); c.stroke(); c.setLineDash([]);

      const pids = Object.keys(state.players);

      pids.forEach((pid, idx) => {
        const ox = idx * HALF;
        const p = state.players[pid];
        const isMe = pid === myId;

        c.save();
        c.beginPath(); c.rect(ox, 0, HALF, H); c.clip();

        // Draw path grid
        for (let r = 0; r < ROWS && r < state.path.length; r++) {
          for (let col = 0; col < COLS && col < state.path[r].length; col++) {
            if (state.path[r][col]) {
              const tx = ox + col * G;
              const ty = r * G;
              drawSprite(c, 'platform', tx + 1, ty + 1, G - 2, G - 2, { color: '#334' });
              // Subtle edge highlight
              c.fillStyle = '#445';
              c.fillRect(tx + 1, ty + 1, G - 2, 1);
            }
          }
        }

        // End zone marker
        for (let r = 0; r < ROWS && r < state.path.length; r++) {
          if (state.path[r] && state.path[r][COLS - 2]) {
            c.fillStyle = '#00ff8833';
            c.fillRect(ox + (COLS - 2) * G, r * G, G, G);
            drawLabel(c, 'END', ox + (COLS - 2) * G + G / 2, r * G + G / 2 + 3, { color: '#00ff88', font: '8px monospace' });
            break;
          }
        }

        // Player
        if (p.alive) {
          drawSprite(c, isMe ? 'player' : 'opponent', ox + p.x - PW / 2, p.y - PH / 2, PW, PH, {
            color: isMe ? '#00ff88' : '#ff4488', skin: pid,
          });
        } else if (p.fallTimer > 0) {
          // Falling animation
          c.globalAlpha = 0.4;
          drawSprite(c, isMe ? 'player' : 'opponent', ox + p.x - PW / 2, p.y - PH / 2, PW * 0.6, PH * 0.6, {
            color: isMe ? '#00ff88' : '#ff4488',
          });
          c.globalAlpha = 1;
          drawLabel(c, `${Math.ceil(p.fallTimer / 60)}`, ox + p.x, p.y - 15, { color: '#ffaa00', font: '14px monospace' });
        }

        drawLabel(c, isMe ? 'YOU' : 'OPPONENT', ox + HALF / 2, 16, { color: '#ffffff88', font: '12px monospace' });

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
      <p className="controls-hint">WASD to navigate the path — don't fall off!</p>
    </div>
  );
}
