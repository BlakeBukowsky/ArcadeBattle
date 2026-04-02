import { useEffect, useRef } from 'react';
import { useSocket, useMyId } from '../context/SocketContext.tsx';
import { drawSprite, drawLabel, drawBackground, drawSpriteCircle } from '../lib/sprites.js';
import { applyStateUpdate, StateBuffer } from '../lib/net.js';

const TANK_W = 20, TANK_H = 24, BULLET_R = 5;

interface Wall { x: number; y: number; w: number; h: number; }
interface Bullet { x: number; y: number; vx: number; vy: number; owner: string; bounces: number; }
interface TankState { x: number; y: number; angle: number; alive: boolean; }
interface TanksGameState {
  players: Record<string, TankState>;
  bullets: Bullet[];
  walls: Wall[];
  canvasWidth: number; canvasHeight: number;
  winner: string | null;
}

export default function TanksGame() {
  const socket = useSocket();
  const myId = useMyId();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const interpRef = useRef(new StateBuffer<TanksGameState>()).current;

  useEffect(() => {
    socket.on('game:state', (data: unknown) => { interpRef.push(applyStateUpdate(interpRef.latest(), data)); });
    return () => { socket.off('game:state'); };
  }, [socket]);

  useEffect(() => {
    function kd(e: KeyboardEvent) {
      if (e.key === 'w' || e.key === 'ArrowUp') { e.preventDefault(); socket.emit('game:input', { forward: true }); }
      if (e.key === 's' || e.key === 'ArrowDown') { e.preventDefault(); socket.emit('game:input', { back: true }); }
      if (e.key === 'a' || e.key === 'ArrowLeft') socket.emit('game:input', { left: true });
      if (e.key === 'd' || e.key === 'ArrowRight') socket.emit('game:input', { right: true });
      if (e.key === ' ') { e.preventDefault(); socket.emit('game:input', { fire: true }); }
    }
    function ku(e: KeyboardEvent) {
      if (e.key === 'w' || e.key === 'ArrowUp') socket.emit('game:input', { forward: false });
      if (e.key === 's' || e.key === 'ArrowDown') socket.emit('game:input', { back: false });
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

      const W = state.canvasWidth, H = state.canvasHeight;
      canvas.width = W; canvas.height = H;

      drawBackground(c, 'tanks', W, H, { color: '#1a1a1a' });

      // Walls
      for (const wall of state.walls) {
        drawSprite(c, 'platform', wall.x, wall.y, wall.w, wall.h, { color: '#555' });
        // Top edge highlight
        if (wall.h > 10) {
          c.fillStyle = '#666';
          c.fillRect(wall.x, wall.y, wall.w, 2);
        }
      }

      // Tanks
      const pids = Object.keys(state.players);
      pids.forEach((pid) => {
        const t = state.players[pid];
        if (!t.alive) return;
        const isMe = pid === myId;
        const color = isMe ? '#00ff88' : '#ff4488';

        c.save();
        c.translate(t.x, t.y);
        c.rotate(t.angle);

        // Tank body
        c.fillStyle = color;
        c.fillRect(-TANK_W / 2, -TANK_H / 2, TANK_W, TANK_H);

        // Barrel
        c.fillStyle = '#ffffff';
        c.fillRect(TANK_H / 2 - 2, -2, 10, 4);

        // Turret dot
        c.beginPath();
        c.arc(0, 0, 4, 0, Math.PI * 2);
        c.fillStyle = '#00000044';
        c.fill();

        // Direction indicator (lighter front)
        c.fillStyle = '#ffffff22';
        c.fillRect(TANK_H / 4, -TANK_W / 2, TANK_H / 4, TANK_W);

        c.restore();

        // Label
        drawLabel(c, isMe ? 'YOU' : 'OPP', t.x, t.y - TANK_H / 2 - 8, { color: '#ffffff66', font: '10px monospace' });
      });

      // Bullets
      for (const b of state.bullets) {
        const color = b.owner === myId ? '#88ffaa' : '#ff8888';
        drawSpriteCircle(c, 'bullet', b.x, b.y, BULLET_R, { color });

        // Trail
        c.beginPath();
        c.moveTo(b.x, b.y);
        c.lineTo(b.x - b.vx * 3, b.y - b.vy * 3);
        c.strokeStyle = color + '44';
        c.lineWidth = 2;
        c.stroke();
      }

      // Winner overlay
      if (state.winner) {
        c.fillStyle = '#000000aa';
        c.fillRect(0, H / 2 - 30, W, 60);
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
      <p className="controls-hint">W/S to move, A/D to turn, Space to fire — bullets bounce off walls!</p>
    </div>
  );
}
