import { useEffect, useRef } from 'react';
import { useSocket, useMyId } from '../context/SocketContext.tsx';
import { drawSprite, drawLabel } from '../lib/sprites.js';

interface PongState {
  ball: { x: number; y: number; vx: number; vy: number };
  paddles: Record<string, number>;
  scores: Record<string, number>;
  canvasWidth: number;
  canvasHeight: number;
}

const PADDLE_WIDTH = 12;
const PADDLE_HEIGHT = 80;
const BALL_SIZE = 10;

export default function PongGame() {
  const socket = useSocket();
  const myId = useMyId();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef<PongState | null>(null);

  useEffect(() => {
    socket.on('game:state', (s: PongState) => { stateRef.current = s; });
    return () => { socket.off('game:state'); };
  }, [socket]);

  useEffect(() => {
    function kd(e: KeyboardEvent) {
      if (e.key === 'ArrowUp' || e.key === 'w') socket.emit('game:input', { up: true });
      if (e.key === 'ArrowDown' || e.key === 's') socket.emit('game:input', { down: true });
    }
    function ku(e: KeyboardEvent) {
      if (e.key === 'ArrowUp' || e.key === 'w') socket.emit('game:input', { up: false });
      if (e.key === 'ArrowDown' || e.key === 's') socket.emit('game:input', { down: false });
    }
    window.addEventListener('keydown', kd);
    window.addEventListener('keyup', ku);
    return () => { window.removeEventListener('keydown', kd); window.removeEventListener('keyup', ku); };
  }, [socket]);

  useEffect(() => {
    let animId: number;
    function draw() {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      const state = stateRef.current;
      if (!canvas || !ctx || !state) { animId = requestAnimationFrame(draw); return; }

      canvas.width = state.canvasWidth;
      canvas.height = state.canvasHeight;

      ctx.fillStyle = '#1a1a2e';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Center line
      ctx.setLineDash([8, 8]);
      ctx.strokeStyle = '#333';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(canvas.width / 2, 0);
      ctx.lineTo(canvas.width / 2, canvas.height);
      ctx.stroke();
      ctx.setLineDash([]);

      // Paddles
      const pids = Object.keys(state.paddles);
      pids.forEach((pid, i) => {
        const x = i === 0 ? 10 : canvas.width - PADDLE_WIDTH - 10;
        drawSprite(ctx, 'paddle', x, state.paddles[pid], PADDLE_WIDTH, PADDLE_HEIGHT, {
          color: pid === myId ? '#00ff88' : '#ff4488',
          skin: pid,
        });
      });

      // Ball
      drawSprite(ctx, 'ball', state.ball.x, state.ball.y, BALL_SIZE, BALL_SIZE, { color: '#ffffff' });

      // Scores
      pids.forEach((pid, i) => {
        const label = pid === myId ? 'You' : 'Opp';
        const x = i === 0 ? canvas.width / 4 : (canvas.width * 3) / 4;
        drawLabel(ctx, `${label}: ${state.scores[pid]}`, x, 40, { color: '#ffffff', font: '32px monospace' });
      });

      animId = requestAnimationFrame(draw);
    }
    animId = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animId);
  }, [socket, myId]);

  return (
    <div className="game-container">
      <canvas ref={canvasRef} className="game-canvas" />
      <p className="controls-hint">Use W/S or Arrow Keys to move</p>
    </div>
  );
}
