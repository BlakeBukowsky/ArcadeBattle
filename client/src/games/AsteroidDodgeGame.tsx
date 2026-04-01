import { useEffect, useRef } from 'react';
import { useSocket, useMyId } from '../context/SocketContext.tsx';
import { drawSprite, drawSpriteCircle, drawLabel, drawBackground } from '../lib/sprites.js';

const PLAYER_W = 20, PLAYER_H = 20, PLAYER_Y = 450;

interface Asteroid { id: number; x: number; y: number; r: number; }
interface PlayerState { x: number; alive: boolean; }
interface AsteroidDodgeState {
  players: Record<string, PlayerState>;
  asteroids: Asteroid[];
  speed: number;
  canvasWidth: number; canvasHeight: number;
  winner: string | null;
}

export default function AsteroidDodgeGame() {
  const socket = useSocket();
  const myId = useMyId();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef<AsteroidDodgeState | null>(null);

  useEffect(() => {
    socket.on('game:state', (s: AsteroidDodgeState) => { stateRef.current = s; });
    return () => { socket.off('game:state'); };
  }, [socket]);

  useEffect(() => {
    function kd(e: KeyboardEvent) {
      if (e.key === 'a' || e.key === 'ArrowLeft') socket.emit('game:input', { left: true });
      if (e.key === 'd' || e.key === 'ArrowRight') socket.emit('game:input', { right: true });
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

      const W = state.canvasWidth, H = state.canvasHeight, HALF = W / 2;
      canvas.width = W; canvas.height = H;

      drawBackground(c, 'asteroid-dodge', W, H, { color: '#0a0a1a' });

      // Divider
      c.strokeStyle = '#333'; c.lineWidth = 2; c.setLineDash([6, 6]);
      c.beginPath(); c.moveTo(HALF, 0); c.lineTo(HALF, H); c.stroke(); c.setLineDash([]);

      const pids = Object.keys(state.players);
      pids.forEach((pid, idx) => {
        const ox = idx * HALF;
        const p = state.players[pid];
        const isMe = pid === myId;

        drawLabel(c, isMe ? 'YOU' : 'OPPONENT', ox + HALF / 2, 18, { color: '#ffffff66', font: '12px monospace' });

        // Asteroids
        for (const a of state.asteroids) {
          drawSpriteCircle(c, 'asteroid', ox + a.x, a.y, a.r, { color: '#888888' });
          c.strokeStyle = '#666666'; c.lineWidth = 1;
          c.beginPath(); c.arc(ox + a.x, a.y, a.r, 0, Math.PI * 2); c.stroke();
        }

        // Player
        if (p.alive) {
          drawSprite(c, isMe ? 'ship' : 'ship', ox + p.x, PLAYER_Y, PLAYER_W, PLAYER_H, {
            color: isMe ? '#00ff88' : '#ff4488', skin: pid,
          });
        } else {
          drawSpriteCircle(c, 'explosion', ox + p.x + PLAYER_W / 2, PLAYER_Y + PLAYER_H / 2, 20, { color: '#ff440066' });
        }
      });

      drawLabel(c, `Speed: ${state.speed.toFixed(1)}`, W - 10, H - 10, { color: '#ffaa00', font: '14px monospace', align: 'right' });

      animId = requestAnimationFrame(draw);
    }
    animId = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animId);
  }, [socket, myId]);

  return (
    <div className="game-container">
      <canvas ref={canvasRef} className="game-canvas" />
      <p className="controls-hint">A/D or Arrow Keys to dodge</p>
    </div>
  );
}
