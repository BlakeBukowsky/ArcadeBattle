import { useEffect, useRef } from 'react';
import { useSocket, useMyId } from '../context/SocketContext.tsx';
import { drawSprite, drawLabel, drawBackground } from '../lib/sprites.js';
import { applyStateUpdate, StateBuffer } from '../lib/net.js';

const PW = 10, PH = 10;

interface PlayerState { x: number; y: number; alive: boolean; completed: boolean; fallTimer: number; }
interface BalanceState {
  players: Record<string, PlayerState>;
  grid: boolean[][];
  revealed: boolean[][]; // per-player revealed tiles
  gridSize: number; cols: number; rows: number;
  viewRadius: number; endR: number; endC: number;
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

        // Camera centered on player — zoomed in
        const zoom = 2.5;
        const camX = p.x * zoom - HALF / 2;
        const camY = p.y * zoom - H / 2;

        c.save();
        c.translate(ox - camX, -camY);

        // Draw revealed tiles only
        if (state.revealed && state.grid) {
          for (let r = 0; r < state.rows; r++) {
            for (let col = 0; col < state.cols; col++) {
              const isRevealed = isMe ? (state.revealed[r]?.[col] ?? false) : true; // opponent sees all their own revealed
              if (!isRevealed) continue;

              const tx = col * G * zoom;
              const ty = r * G * zoom;
              const tw = G * zoom;

              if (state.grid[r]?.[col]) {
                // Path tile
                drawSprite(c, 'platform', tx + 1, ty + 1, tw - 2, tw - 2, { color: '#334455' });
                c.fillStyle = '#3a4a5a';
                c.fillRect(tx + 1, ty + 1, tw - 2, 2);
              } else if (isMe) {
                // Void (only show for own side near revealed area)
                c.fillStyle = '#0a0a1a';
                c.fillRect(tx, ty, tw, tw);
              }
            }
          }
        }

        // End zone
        const endX = state.endC * G * zoom;
        const endY = state.endR * G * zoom;
        c.fillStyle = '#00ff8833';
        c.fillRect(endX, endY - G * zoom, G * zoom, G * zoom * 3);
        drawLabel(c, 'END', endX + G * zoom / 2, endY + G * zoom / 2, { color: '#00ff88', font: `${Math.floor(10 * zoom)}px monospace` });

        // Player
        if (p.alive) {
          const px = p.x * zoom - PW * zoom / 2;
          const py = p.y * zoom - PH * zoom / 2;
          drawSprite(c, isMe ? 'player' : 'opponent', px, py, PW * zoom, PH * zoom, {
            color: isMe ? '#00ff88' : '#ff4488', skin: pid,
          });
        } else if (p.fallTimer > 0) {
          c.globalAlpha = 0.3;
          const px = p.x * zoom - PW * zoom / 2;
          const py = p.y * zoom - PH * zoom / 2;
          drawSprite(c, isMe ? 'player' : 'opponent', px, py, PW * zoom * 0.6, PH * zoom * 0.6, {
            color: isMe ? '#00ff88' : '#ff4488',
          });
          c.globalAlpha = 1;
        }

        c.restore(); // camera

        // Fog of war overlay for own side — darken unrevealed areas
        if (isMe) {
          const fogGrad = c.createRadialGradient(
            ox + HALF / 2, H / 2, HALF * 0.3,
            ox + HALF / 2, H / 2, HALF * 0.6,
          );
          fogGrad.addColorStop(0, 'rgba(0,0,0,0)');
          fogGrad.addColorStop(1, 'rgba(0,0,0,0.7)');
          c.fillStyle = fogGrad;
          c.fillRect(ox, 0, HALF, H);
        }

        drawLabel(c, isMe ? 'YOU' : 'OPPONENT', ox + HALF / 2, 16, { color: '#ffffff88', font: '12px monospace' });

        if (p.fallTimer > 0) {
          drawLabel(c, 'FELL!', ox + HALF / 2, H / 2, { color: '#ff4444', font: '18px monospace' });
        }

        c.restore(); // clip
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
      <p className="controls-hint">WASD to navigate — path reveals as you move!</p>
    </div>
  );
}
