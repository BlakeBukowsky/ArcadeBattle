import { useEffect, useRef } from 'react';
import { useSocket, useMyId } from '../context/SocketContext.tsx';
import { drawSprite, drawSpriteCircle, drawLabel, drawBackground } from '../lib/sprites.js';
import { applyStateUpdate } from '../lib/net.js';

const PLAYER_W = 30, PLAYER_H = 40, BALL_R = 12, NET_W = 6;

interface PlayerState { x: number; y: number; }
interface VolleyState {
  players: Record<string, PlayerState>;
  ball: { x: number; y: number };
  scores: Record<string, number>;
  canvasWidth: number; canvasHeight: number;
  paused: boolean;
}

export default function VolleyballGame() {
  const socket = useSocket();
  const myId = useMyId();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef<VolleyState | null>(null);

  useEffect(() => {
    socket.on('game:state', (data: unknown) => { stateRef.current = applyStateUpdate(stateRef.current, data); });
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
      if (e.key === 'w' || e.key === ' ' || e.key === 'ArrowUp') socket.emit('game:input', { jump: false });
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
      const FLOOR_Y = H - 30, NET_X = W / 2, NET_H = 140;
      canvas.width = W; canvas.height = H;

      drawBackground(c, 'volleyball', W, H, { color: '#1a1a2e' });

      // Floor
      drawSprite(c, 'platform', 0, FLOOR_Y, W, H - FLOOR_Y, { color: '#2a4a3e' });

      // Net
      drawSprite(c, 'platform', NET_X - NET_W / 2, FLOOR_Y - NET_H, NET_W, NET_H, { color: '#cccccc' });

      // Players
      const pids = Object.keys(state.players);
      pids.forEach((pid) => {
        const p = state.players[pid];
        const isMe = pid === myId;
        drawSprite(c, isMe ? 'player' : 'opponent', p.x, p.y, PLAYER_W, PLAYER_H, {
          color: isMe ? '#00ff88' : '#ff4488', skin: pid,
        });
        drawLabel(c, isMe ? 'YOU' : 'OPP', p.x + PLAYER_W / 2, p.y - 4);
      });

      // Ball
      drawSpriteCircle(c, 'ball', state.ball.x, state.ball.y, BALL_R, { color: '#ffff00' });
      c.strokeStyle = '#cccc00'; c.lineWidth = 2;
      c.beginPath(); c.arc(state.ball.x, state.ball.y, BALL_R, 0, Math.PI * 2); c.stroke();

      // Scores
      pids.forEach((pid, i) => {
        const x = i === 0 ? W / 4 : (3 * W) / 4;
        drawLabel(c, `${pid === myId ? 'You' : 'Opp'}: ${state.scores[pid]}`, x, 35, { color: '#ffffff', font: '28px monospace' });
      });

      animId = requestAnimationFrame(draw);
    }
    animId = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animId);
  }, [socket, myId]);

  return (
    <div className="game-container">
      <canvas ref={canvasRef} className="game-canvas" />
      <p className="controls-hint">A/D to move, W or Space to jump</p>
    </div>
  );
}
