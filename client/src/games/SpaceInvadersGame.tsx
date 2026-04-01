import { useEffect, useRef } from 'react';
import { useSocket, useMyId } from '../context/SocketContext.tsx';
import { drawSprite, drawLabel, drawBackground } from '../lib/sprites.js';
import { applyStateUpdate, StateBuffer } from '../lib/net.js';

const PLAYER_W = 24, PLAYER_H = 16;
const INVADER_W = 22, INVADER_H = 16, INVADER_SPACING_X = 36, INVADER_SPACING_Y = 28;
const BULLET_W = 3, BULLET_H = 10;
const PLAYER_Y = 460;

interface Invader { col: number; row: number; alive: boolean; }
interface Bullet { x: number; y: number; }
interface PlayerState {
  x: number; alive: boolean; bullets: Bullet[];
  invaders: Invader[]; invaderX: number;
  invaderBullets: Bullet[]; killCount: number;
}
interface SpaceInvadersState {
  players: Record<string, PlayerState>;
  canvasWidth: number; canvasHeight: number;
  winner: string | null; totalInvaders: number;
}

export default function SpaceInvadersGame() {
  const socket = useSocket();
  const myId = useMyId();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const interpRef = useRef(new StateBuffer<SpaceInvadersState>()).current;

  useEffect(() => {
    socket.on('game:state', (data: unknown) => { interpRef.push(applyStateUpdate(interpRef.latest(), data)); });
    return () => { socket.off('game:state'); };
  }, [socket]);

  useEffect(() => {
    function kd(e: KeyboardEvent) {
      if (e.key === 'a' || e.key === 'ArrowLeft') socket.emit('game:input', { left: true });
      if (e.key === 'd' || e.key === 'ArrowRight') socket.emit('game:input', { right: true });
      if (e.key === ' ') { e.preventDefault(); socket.emit('game:input', { fire: true }); }
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

      drawBackground(c, 'space-invaders', W, H, { color: '#0a0a1a' });

      // Divider
      c.strokeStyle = '#333'; c.lineWidth = 2; c.setLineDash([6, 6]);
      c.beginPath(); c.moveTo(HALF, 0); c.lineTo(HALF, H); c.stroke(); c.setLineDash([]);

      const pids = Object.keys(state.players);
      pids.forEach((pid, idx) => {
        const ox = idx * HALF;
        const p = state.players[pid];
        const isMe = pid === myId;

        c.save();
        c.beginPath(); c.rect(ox, 0, HALF, H); c.clip();

        drawLabel(c, isMe ? 'YOU' : 'OPPONENT', ox + HALF / 2, 18, { color: '#ffffff66', font: '12px monospace' });
        drawLabel(c, `${p.killCount}/${state.totalInvaders}`, ox + HALF / 2, 34, { color: '#ffffff66', font: '12px monospace' });

        // Invaders
        for (const inv of p.invaders) {
          if (!inv.alive) continue;
          const ix = ox + p.invaderX + inv.col * INVADER_SPACING_X;
          const iy = 40 + inv.row * INVADER_SPACING_Y;
          const invColor = inv.row < 1 ? '#ff4444' : inv.row < 2 ? '#ffaa00' : '#44ff44';
          drawSprite(c, 'invader', ix, iy, INVADER_W, INVADER_H, { color: invColor });
          // Eyes
          c.fillStyle = '#00000044';
          c.fillRect(ix + 3, iy + 3, 4, 4);
          c.fillRect(ix + INVADER_W - 7, iy + 3, 4, 4);
        }

        // Player
        if (p.alive) {
          drawSprite(c, 'ship', ox + p.x, PLAYER_Y, PLAYER_W, PLAYER_H, {
            color: isMe ? '#00ff88' : '#ff4488', skin: pid,
          });
          // Cannon
          drawSprite(c, 'ship', ox + p.x + PLAYER_W / 2 - 2, PLAYER_Y - 6, 4, 6, {
            color: isMe ? '#00ff88' : '#ff4488',
          });
        }

        // Player bullets
        for (const b of p.bullets) {
          drawSprite(c, 'bullet', ox + b.x, b.y, BULLET_W, BULLET_H, { color: '#ffffff' });
        }

        // Invader bullets
        for (const b of p.invaderBullets) {
          drawSprite(c, 'bullet', ox + b.x, b.y, BULLET_W, BULLET_H, { color: '#ff6666' });
        }

        c.restore();
      });

      animId = requestAnimationFrame(draw);
    }
    animId = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animId);
  }, [socket, myId]);

  return (
    <div className="game-container">
      <canvas ref={canvasRef} className="game-canvas" />
      <p className="controls-hint">A/D to move, Space to shoot</p>
    </div>
  );
}
