import { useEffect, useRef } from 'react';
import { useSocket, useMyId } from '../context/SocketContext.tsx';
import { drawSprite, drawLabel, drawBackground } from '../lib/sprites.js';
import { applyStateUpdate, StateBuffer } from '../lib/net.js';

const PW = 14, PH = 18, ENEMY_W = 12, ENEMY_H = 14;

interface Building { x: number; w: number; h: number; }
interface EnemyState { x: number; baseX: number; }
interface PlayerState { x: number; y: number; stunTimer: number; completed: boolean; cameraX: number; }
interface CityscapeState {
  players: Record<string, PlayerState>;
  buildings: Building[];
  enemies: Record<string, EnemyState[]>;
  totalWidth: number;
  canvasWidth: number; canvasHeight: number; winner: string | null;
}

export default function CityscapeGame() {
  const socket = useSocket();
  const myId = useMyId();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const interpRef = useRef(new StateBuffer<CityscapeState>()).current;

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
      canvas.width = W; canvas.height = H;

      drawBackground(c, 'cityscape', W, H, { color: '#1a1028' });

      c.strokeStyle = '#333'; c.lineWidth = 2; c.setLineDash([6, 6]);
      c.beginPath(); c.moveTo(HALF, 0); c.lineTo(HALF, H); c.stroke(); c.setLineDash([]);

      const pids = Object.keys(state.players);
      pids.forEach((pid, idx) => {
        const ox = idx * HALF;
        const p = state.players[pid];
        const isMe = pid === myId;
        const myEnemies = state.enemies[pid] ?? [];

        c.save();
        c.beginPath(); c.rect(ox, 0, HALF, H); c.clip();
        c.save();
        c.translate(ox - p.cameraX, 0);

        // Sky gradient
        const grad = c.createLinearGradient(0, 0, 0, H);
        grad.addColorStop(0, '#0a0818');
        grad.addColorStop(1, '#1a1028');
        c.fillStyle = grad;
        c.fillRect(p.cameraX, 0, HALF, H);

        // Buildings
        for (const b of state.buildings) {
          if (b.x + b.w < p.cameraX - 20 || b.x > p.cameraX + HALF + 20) continue;
          const topY = H - b.h;
          drawSprite(c, 'platform', b.x, topY, b.w, b.h, { color: '#2a2a3a' });
          c.fillStyle = '#3a3a4a'; c.fillRect(b.x, topY, b.w, 3);
          // Windows
          for (let wy = topY + 15; wy < H - 10; wy += 20) {
            for (let wx = b.x + 8; wx < b.x + b.w - 8; wx += 15) {
              c.fillStyle = Math.random() > 0.3 ? '#ffcc4422' : '#00000022';
              c.fillRect(wx, wy, 8, 10);
            }
          }
        }

        // Finish line
        c.fillStyle = '#00ff8844';
        c.fillRect(state.totalWidth - 40, 0, 40, H);
        drawLabel(c, 'FINISH', state.totalWidth - 20, H / 2, { color: '#00ff88', font: '10px monospace' });

        // Enemies
        for (const e of myEnemies) {
          for (const b of state.buildings) {
            if (e.baseX >= b.x && e.baseX <= b.x + b.w) {
              drawSprite(c, 'opponent', e.x - ENEMY_W / 2, H - b.h - ENEMY_H, ENEMY_W, ENEMY_H, { color: '#ff6644' });
              break;
            }
          }
        }

        // Player
        if (p.stunTimer > 0) c.globalAlpha = Math.sin(Date.now() * 0.02) * 0.3 + 0.7;
        drawSprite(c, isMe ? 'player' : 'opponent', p.x, p.y, PW, PH, { color: isMe ? '#00ff88' : '#ff4488', skin: pid });
        c.globalAlpha = 1;

        c.restore(); // camera

        // Progress bar
        const pct = p.x / state.totalWidth;
        c.fillStyle = '#222'; c.fillRect(ox + 10, H - 12, HALF - 20, 4);
        c.fillStyle = isMe ? '#00ff88' : '#ff4488';
        c.fillRect(ox + 10, H - 12, (HALF - 20) * pct, 4);

        drawLabel(c, isMe ? 'YOU' : 'OPPONENT', ox + HALF / 2, 16, { color: '#ffffff88', font: '12px monospace' });
        if (p.stunTimer > 0) drawLabel(c, 'STUNNED', ox + HALF / 2, 34, { color: '#ff4444', font: '12px monospace' });

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
      <p className="controls-hint">A/D to move, W/Space to jump — race to the finish!</p>
    </div>
  );
}
