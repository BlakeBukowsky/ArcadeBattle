import { useEffect, useRef } from 'react';
import { useSocket, useMyId } from '../context/SocketContext.tsx';
import { drawSprite, drawLabel } from '../lib/sprites.js';

const PLAYER_W = 24, PLAYER_H = 28;

interface Platform { x: number; y: number; w: number; }
interface PlayerState { x: number; y: number; vx: number; alive: boolean; }
interface JoustState {
  players: Record<string, PlayerState>;
  scores: Record<string, number>;
  platforms: Platform[];
  canvasWidth: number; canvasHeight: number;
}

export default function JoustGame() {
  const socket = useSocket();
  const myId = useMyId();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef<JoustState | null>(null);

  useEffect(() => {
    socket.on('game:state', (s: JoustState) => { stateRef.current = s; });
    return () => { socket.off('game:state'); };
  }, [socket]);

  useEffect(() => {
    function kd(e: KeyboardEvent) {
      if (e.key === 'a' || e.key === 'ArrowLeft') socket.emit('game:input', { left: true });
      if (e.key === 'd' || e.key === 'ArrowRight') socket.emit('game:input', { right: true });
      if (e.key === 'w' || e.key === ' ' || e.key === 'ArrowUp') {
        e.preventDefault();
        socket.emit('game:input', { flap: true });
      }
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

      canvas.width = state.canvasWidth;
      canvas.height = state.canvasHeight;

      c.fillStyle = '#1a1a2e';
      c.fillRect(0, 0, canvas.width, canvas.height);

      // Platforms
      for (const plat of state.platforms) {
        drawSprite(c, 'platform', plat.x, plat.y, plat.w, 8, { color: '#555' });
        // Edge highlights
        c.fillStyle = '#777';
        c.fillRect(plat.x, plat.y, plat.w, 2);
      }

      // Players
      const pids = Object.keys(state.players);
      pids.forEach((pid) => {
        const p = state.players[pid];
        if (!p.alive) return;
        const isMe = pid === myId;
        const color = isMe ? '#00ff88' : '#ff4488';

        drawSprite(c, isMe ? 'player' : 'opponent', p.x, p.y, PLAYER_W, PLAYER_H, {
          color,
          facing: p.vx >= 0 ? 1 : -1,
        });

        // Lance
        const dir = p.vx >= 0 ? 1 : -1;
        c.fillStyle = '#ffffff';
        c.fillRect(
          dir > 0 ? p.x + PLAYER_W : p.x - 10,
          p.y + PLAYER_H / 2 - 2,
          10, 4
        );

        drawLabel(c, isMe ? 'YOU' : 'OPP', p.x + PLAYER_W / 2, p.y - 4);
      });

      // Scores
      c.fillStyle = '#ffffff';
      c.font = '24px monospace';
      c.textAlign = 'left';
      pids.forEach((pid, i) => {
        const label = pid === myId ? 'You' : 'Opponent';
        c.fillText(`${label}: ${state.scores[pid]}`, 20, 30 + i * 28);
      });

      animId = requestAnimationFrame(draw);
    }
    animId = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animId);
  }, [socket, myId]);

  return (
    <div className="game-container">
      <canvas ref={canvasRef} className="game-canvas" />
      <p className="controls-hint">A/D to move, W or Space to flap</p>
    </div>
  );
}
