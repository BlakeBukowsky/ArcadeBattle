import { useEffect, useRef } from 'react';
import { useSocket, useMyId } from '../context/SocketContext.tsx';
import { drawSprite, drawLabel, drawBackground } from '../lib/sprites.js';
import { PositionPredictor } from '../lib/prediction.js';
import { applyStateUpdate, StateBuffer } from '../lib/net.js';

interface PongState {
  ball: { x: number; y: number; vx: number; vy: number };
  paddles: Record<string, number>;
  scores: Record<string, number>;
  canvasWidth: number;
  canvasHeight: number;
}

const PADDLE_WIDTH = 12;
const PADDLE_HEIGHT = 80;
const PADDLE_SPEED = 9;
const BALL_SIZE = 10;

export default function PongGame() {
  const socket = useSocket();
  const myId = useMyId();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const interpRef = useRef(new StateBuffer<PongState>()).current;
  const keysRef = useRef({ up: false, down: false });
  const paddlePredictor = useRef(new PositionPredictor(0.25)).current;

  useEffect(() => {
    socket.on('game:state', (data: unknown) => {
      const updated = applyStateUpdate(interpRef.latest(), data);
      interpRef.push(updated);
      // Feed server position to predictor
      if (updated.paddles[myId] !== undefined) {
        paddlePredictor.setServerPosition(0, updated.paddles[myId]);
      }
    });
    return () => { socket.off('game:state'); };
  }, [socket, myId, paddlePredictor]);

  useEffect(() => {
    function kd(e: KeyboardEvent) {
      if (e.key === 'ArrowUp' || e.key === 'w') { keysRef.current.up = true; socket.emit('game:input', { up: true }); }
      if (e.key === 'ArrowDown' || e.key === 's') { keysRef.current.down = true; socket.emit('game:input', { down: true }); }
    }
    function ku(e: KeyboardEvent) {
      if (e.key === 'ArrowUp' || e.key === 'w') { keysRef.current.up = false; socket.emit('game:input', { up: false }); }
      if (e.key === 'ArrowDown' || e.key === 's') { keysRef.current.down = false; socket.emit('game:input', { down: false }); }
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
      const state = interpRef.interpolate();
      if (!canvas || !ctx || !state) { animId = requestAnimationFrame(draw); return; }

      const W = state.canvasWidth, H = state.canvasHeight;
      canvas.width = W;
      canvas.height = H;

      // Apply local prediction for own paddle
      const keys = keysRef.current;
      if (keys.up) paddlePredictor.applyInput(0, -PADDLE_SPEED);
      if (keys.down) paddlePredictor.applyInput(0, PADDLE_SPEED);
      const predicted = paddlePredictor.getPosition();
      // Clamp
      predicted.y = Math.max(0, Math.min(H - PADDLE_HEIGHT, predicted.y));

      drawBackground(ctx, 'pong', W, H, { color: '#1a1a2e' });

      // Center line
      ctx.setLineDash([8, 8]);
      ctx.strokeStyle = '#333';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(W / 2, 0);
      ctx.lineTo(W / 2, H);
      ctx.stroke();
      ctx.setLineDash([]);

      // Paddles
      const pids = Object.keys(state.paddles);
      pids.forEach((pid, i) => {
        const x = i === 0 ? 10 : W - PADDLE_WIDTH - 10;
        const y = pid === myId ? predicted.y : state.paddles[pid];
        drawSprite(ctx, 'paddle', x, y, PADDLE_WIDTH, PADDLE_HEIGHT, {
          color: pid === myId ? '#00ff88' : '#ff4488',
          skin: pid,
        });
      });

      // Ball
      drawSprite(ctx, 'ball', state.ball.x, state.ball.y, BALL_SIZE, BALL_SIZE, { color: '#ffffff' });

      // Scores
      pids.forEach((pid, i) => {
        const label = pid === myId ? 'You' : 'Opp';
        const x = i === 0 ? W / 4 : (W * 3) / 4;
        drawLabel(ctx, `${label}: ${state.scores[pid]}`, x, 40, { color: '#ffffff', font: '32px monospace' });
      });

      animId = requestAnimationFrame(draw);
    }
    animId = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animId);
  }, [socket, myId, paddlePredictor]);

  return (
    <div className="game-container">
      <canvas ref={canvasRef} className="game-canvas" />
      <p className="controls-hint">Use W/S or Arrow Keys to move</p>
    </div>
  );
}
