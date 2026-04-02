import { useEffect, useRef } from 'react';
import { useSocket, useMyId } from '../context/SocketContext.tsx';
import { drawSprite, drawLabel, drawBackground } from '../lib/sprites.js';
import { applyStateUpdate, StateBuffer } from '../lib/net.js';

const PW = 12, PH = 16;
type Tile = 0 | 1 | 2 | 3;

interface PlayerState {
  x: number; y: number; alive: boolean; completed: boolean; cameraY: number;
}
interface SpelunkyState {
  players: Record<string, PlayerState>;
  grid: Tile[][];
  tileSize: number; caveWidth: number; caveHeight: number;
  canvasWidth: number; canvasHeight: number; winner: string | null;
}

export default function SpelunkyGame() {
  const socket = useSocket();
  const myId = useMyId();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const interpRef = useRef(new StateBuffer<SpelunkyState>()).current;

  useEffect(() => {
    socket.on('game:state', (data: unknown) => { interpRef.push(applyStateUpdate(interpRef.latest(), data)); });
    return () => { socket.off('game:state'); };
  }, [socket]);

  useEffect(() => {
    function kd(e: KeyboardEvent) {
      if (e.key === 'a' || e.key === 'ArrowLeft') socket.emit('game:input', { left: true });
      if (e.key === 'd' || e.key === 'ArrowRight') socket.emit('game:input', { right: true });
      if (e.key === 'w' || e.key === ' ' || e.key === 'ArrowUp') { e.preventDefault(); socket.emit('game:input', { jump: true }); }
    }
    function ku(e: KeyboardEvent) {
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
      const T = state.tileSize;
      canvas.width = W; canvas.height = H;

      drawBackground(c, 'spelunky', W, H, { color: '#0a0808' });

      c.strokeStyle = '#333'; c.lineWidth = 2; c.setLineDash([6, 6]);
      c.beginPath(); c.moveTo(HALF, 0); c.lineTo(HALF, H); c.stroke(); c.setLineDash([]);

      const pids = Object.keys(state.players);

      pids.forEach((pid, idx) => {
        const ox = idx * HALF;
        const p = state.players[pid];
        const isMe = pid === myId;
        // Center the cave in the half
        const caveOx = ox + (HALF - state.caveWidth) / 2;

        c.save();
        c.beginPath(); c.rect(ox, 0, HALF, H); c.clip();

        if (!p.alive) {
          drawLabel(c, 'DEAD', ox + HALF / 2, H / 2, { color: '#ff4444', font: '24px monospace' });
          c.restore(); return;
        }

        c.save();
        c.translate(0, -p.cameraY);

        // Draw tiles
        const startRow = Math.max(0, Math.floor(p.cameraY / T));
        const endRow = Math.min(state.grid.length, Math.ceil((p.cameraY + H) / T) + 1);

        for (let r = startRow; r < endRow; r++) {
          for (let col = 0; col < state.grid[r].length; col++) {
            const tile = state.grid[r][col];
            const tx = caveOx + col * T;
            const ty = r * T;

            if (tile === 1) {
              drawSprite(c, 'platform', tx, ty, T, T, { color: '#5a4a3a' });
              // Rock texture
              c.fillStyle = '#4a3a2a';
              c.fillRect(tx + 2, ty + 2, T - 4, T - 4);
              c.fillStyle = '#6a5a4a';
              c.fillRect(tx + 4, ty + 4, 6, 4);
              c.fillRect(tx + T - 12, ty + T - 10, 8, 5);
            } else if (tile === 2) {
              // Spike
              drawSprite(c, 'platform', tx, ty + T - 6, T, 6, { color: '#5a4a3a' });
              for (let sx = 0; sx < T; sx += 8) {
                c.beginPath();
                c.moveTo(tx + sx, ty + T);
                c.lineTo(tx + sx + 4, ty + T - 12);
                c.lineTo(tx + sx + 8, ty + T);
                c.fillStyle = '#cc3333';
                c.fill();
              }
            } else if (tile === 3) {
              // Exit
              c.fillStyle = '#00ff8833';
              c.fillRect(tx, ty, T, T);
              drawLabel(c, 'EXIT', tx + T / 2, ty + T / 2 + 4, { color: '#00ff88', font: '9px monospace' });
              // Door frame
              c.strokeStyle = '#00ff8866'; c.lineWidth = 2;
              c.strokeRect(tx + 4, ty + 2, T - 8, T - 4);
            }
          }
        }

        // Player
        drawSprite(c, isMe ? 'player' : 'opponent', caveOx + p.x, p.y, PW, PH, {
          color: isMe ? '#00ff88' : '#ff4488', skin: pid,
        });

        c.restore(); // camera

        drawLabel(c, isMe ? 'YOU' : 'OPPONENT', ox + HALF / 2, 18, { color: '#ffffff88', font: '12px monospace' });

        // Depth indicator
        const depth = Math.floor(p.y / T);
        drawLabel(c, `Depth: ${depth}`, ox + HALF / 2, 38, { color: '#ffaa00', font: '12px monospace' });

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
      <p className="controls-hint">A/D to move, W/Space to jump — reach the exit, avoid spikes!</p>
    </div>
  );
}
