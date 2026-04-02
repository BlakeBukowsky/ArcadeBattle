import { useEffect, useRef } from 'react';
import { useSocket, useMyId } from '../context/SocketContext.tsx';
import { drawSpriteCircle, drawLabel, drawBackground } from '../lib/sprites.js';
import { drawStarfield } from '../lib/draw-helpers.js';
import { applyStateUpdate, StateBuffer } from '../lib/net.js';

const SHIP_R = 12, BULLET_R = 3;

interface Ship { x: number; y: number; vx: number; vy: number; angle: number; alive: boolean; lives: number; iframeUntil: number; }
interface Bullet { x: number; y: number; owner: string; }
interface Asteroid { id: number; x: number; y: number; size: string; radius: number; }
interface AsteroidsState {
  players: Record<string, Ship>;
  bullets: Bullet[];
  asteroids: Asteroid[];
  canvasWidth: number; canvasHeight: number;
  winner: string | null;
}

function drawShip(c: CanvasRenderingContext2D, x: number, y: number, angle: number, color: string, thrusting: boolean) {
  c.save();
  c.translate(x, y);
  c.rotate(angle);
  c.beginPath();
  c.moveTo(SHIP_R, 0);
  c.lineTo(-SHIP_R * 0.7, -SHIP_R * 0.6);
  c.lineTo(-SHIP_R * 0.3, 0);
  c.lineTo(-SHIP_R * 0.7, SHIP_R * 0.6);
  c.closePath();
  c.fillStyle = color;
  c.fill();
  if (thrusting) {
    c.beginPath();
    c.moveTo(-SHIP_R * 0.4, -SHIP_R * 0.25);
    c.lineTo(-SHIP_R * 1.1, 0);
    c.lineTo(-SHIP_R * 0.4, SHIP_R * 0.25);
    c.fillStyle = '#ffaa00';
    c.fill();
  }
  c.restore();
}

export default function AsteroidsGame() {
  const socket = useSocket();
  const myId = useMyId();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const interpRef = useRef(new StateBuffer<AsteroidsState>()).current;
  const keysRef = useRef({ thrust: false });

  useEffect(() => {
    socket.on('game:state', (data: unknown) => { interpRef.push(applyStateUpdate(interpRef.latest(), data)); });
    return () => { socket.off('game:state'); };
  }, [socket]);

  useEffect(() => {
    function kd(e: KeyboardEvent) {
      if (e.key === 'a' || e.key === 'ArrowLeft') socket.emit('game:input', { left: true });
      if (e.key === 'd' || e.key === 'ArrowRight') socket.emit('game:input', { right: true });
      if (e.key === 'w' || e.key === 'ArrowUp') { e.preventDefault(); keysRef.current.thrust = true; socket.emit('game:input', { thrust: true }); }
      if (e.key === ' ') { e.preventDefault(); socket.emit('game:input', { fire: true }); }
    }
    function ku(e: KeyboardEvent) {
      if (e.key === 'a' || e.key === 'ArrowLeft') socket.emit('game:input', { left: false });
      if (e.key === 'd' || e.key === 'ArrowRight') socket.emit('game:input', { right: false });
      if (e.key === 'w' || e.key === 'ArrowUp') { keysRef.current.thrust = false; socket.emit('game:input', { thrust: false }); }
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

      drawBackground(c, 'asteroids', W, H, { color: '#050510' });
      drawStarfield(c, W, H, { density: 120 });

      // Asteroids
      for (const a of state.asteroids) {
        drawSpriteCircle(c, 'asteroid', a.x, a.y, a.radius, { color: '#777' });
        c.strokeStyle = '#555'; c.lineWidth = 1;
        c.beginPath(); c.arc(a.x, a.y, a.radius, 0, Math.PI * 2); c.stroke();
      }

      // Bullets
      for (const b of state.bullets) {
        drawSpriteCircle(c, 'bullet', b.x, b.y, BULLET_R, { color: b.owner === myId ? '#88ffaa' : '#ff8888' });
      }

      // Ships
      const pids = Object.keys(state.players);
      pids.forEach((pid) => {
        const s = state.players[pid];
        if (!s.alive) return;
        const isMe = pid === myId;
        const hasIframes = s.iframeUntil > Date.now();
        if (hasIframes) c.globalAlpha = Math.sin(Date.now() * 0.015) * 0.3 + 0.7;
        drawShip(c, s.x, s.y, s.angle, isMe ? '#00ff88' : '#ff4488', isMe && keysRef.current.thrust);
        c.globalAlpha = 1;
      });

      // Lives display
      pids.forEach((pid) => {
        const s = state.players[pid];
        const isMe = pid === myId;
        const lx = isMe ? 15 : W - 15;
        const align = isMe ? 'left' : 'right';
        drawLabel(c, `${isMe ? 'You' : 'Opp'}: ${'♥'.repeat(s.lives)}`, lx, 25, {
          color: isMe ? '#00ff88' : '#ff4488', font: '16px monospace', align: align as CanvasTextAlign,
        });
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
      <p className="controls-hint">A/D to rotate, W to thrust, Space to shoot</p>
    </div>
  );
}
