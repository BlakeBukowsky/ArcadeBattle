import { useEffect, useRef } from 'react';
import { useSocket, useMyId } from '../context/SocketContext.tsx';

const PLAYER_W = 24, PLAYER_H = 16, PLAYER_Y = 460;
const INVADER_W = 22, INVADER_H = 16, INVADER_SPACING_X = 36, INVADER_SPACING_Y = 28;
const BULLET_W = 3, BULLET_H = 10;

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
  const stateRef = useRef<SpaceInvadersState | null>(null);

  useEffect(() => {
    socket.on('game:state', (s: SpaceInvadersState) => { stateRef.current = s; });
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
      const state = stateRef.current;
      if (!canvas || !c || !state) { animId = requestAnimationFrame(draw); return; }

      const W = state.canvasWidth, H = state.canvasHeight;
      const HALF = W / 2;
      canvas.width = W; canvas.height = H;

      c.fillStyle = '#0a0a1a';
      c.fillRect(0, 0, W, H);

      c.strokeStyle = '#333'; c.lineWidth = 2; c.setLineDash([6, 6]);
      c.beginPath(); c.moveTo(HALF, 0); c.lineTo(HALF, H); c.stroke(); c.setLineDash([]);

      const pids = Object.keys(state.players);
      pids.forEach((pid, idx) => {
        const ox = idx * HALF;
        const p = state.players[pid];
        const isMe = pid === myId;

        c.save();
        c.beginPath(); c.rect(ox, 0, HALF, H); c.clip();

        // Label + kill count
        c.fillStyle = '#ffffff66'; c.font = '12px monospace'; c.textAlign = 'center';
        c.fillText(isMe ? 'YOU' : 'OPPONENT', ox + HALF / 2, 18);
        c.fillText(`${p.killCount}/${state.totalInvaders}`, ox + HALF / 2, 34);

        // Invaders
        for (const inv of p.invaders) {
          if (!inv.alive) continue;
          const ix = ox + p.invaderX + inv.col * INVADER_SPACING_X;
          const iy = 40 + inv.row * INVADER_SPACING_Y;
          c.fillStyle = inv.row < 1 ? '#ff4444' : inv.row < 2 ? '#ffaa00' : '#44ff44';
          c.fillRect(ix, iy, INVADER_W, INVADER_H);
          // Simple pixel pattern
          c.fillStyle = '#00000044';
          c.fillRect(ix + 3, iy + 3, 4, 4);
          c.fillRect(ix + INVADER_W - 7, iy + 3, 4, 4);
        }

        // Player
        if (p.alive) {
          c.fillStyle = isMe ? '#00ff88' : '#ff4488';
          c.fillRect(ox + p.x, PLAYER_Y, PLAYER_W, PLAYER_H);
          // Cannon
          c.fillRect(ox + p.x + PLAYER_W / 2 - 2, PLAYER_Y - 6, 4, 6);
        }

        // Bullets
        c.fillStyle = '#ffffff';
        for (const b of p.bullets) {
          c.fillRect(ox + b.x, b.y, BULLET_W, BULLET_H);
        }

        // Invader bullets
        c.fillStyle = '#ff6666';
        for (const b of p.invaderBullets) {
          c.fillRect(ox + b.x, b.y, BULLET_W, BULLET_H);
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
