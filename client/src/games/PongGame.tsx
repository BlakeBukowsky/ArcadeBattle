import { useEffect, useRef } from 'react';
import { useSocket, useMyId } from '../context/SocketContext.tsx';
import { drawSprite, drawLabel, drawBackground } from '../lib/sprites.js';
import { drawVignette, drawShinySphere } from '../lib/draw-helpers.js';
import { applyStateUpdate, StateBuffer } from '../lib/net.js';
import { PositionPredictor } from '../lib/prediction.js';

const PADDLE_W = 12, PADDLE_H = 80, BALL_SIZE = 10;
// Server runs at 60fps with PADDLE_SPEED=8. Client render is also 60fps.
// Prediction applies input per-frame, matching the server tick rate.
const PADDLE_SPEED = 8;

interface PongState {
  ball: { x: number; y: number; vx: number; vy: number };
  paddles: Record<string, number>;
  scores: Record<string, number>;
  serving: boolean;
  canvasWidth: number;
  canvasHeight: number;
}

export default function PongGame() {
  const socket = useSocket();
  const myId = useMyId();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const interpRef = useRef(new StateBuffer<PongState>()).current;
  const keysRef = useRef({ up: false, down: false });
  const paddlePredictor = useRef(new PositionPredictor(0.4)).current;

  // Track raw (non-interpolated) state for own paddle prediction
  const rawStateRef = useRef<PongState | null>(null);

  useEffect(() => {
    socket.on('game:state', (data: unknown) => {
      const updated = applyStateUpdate(interpRef.latest(), data);
      interpRef.push(updated);
      rawStateRef.current = updated;
      if (updated.paddles[myId] !== undefined) {
        paddlePredictor.setServerPosition(0, updated.paddles[myId]);
      }
    });
    return () => { socket.off('game:state'); };
  }, [socket, myId, interpRef, paddlePredictor]);

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
      canvas.width = W; canvas.height = H;

      // Local prediction for own paddle
      const keys = keysRef.current;
      if (keys.up) paddlePredictor.applyInput(0, -PADDLE_SPEED);
      if (keys.down) paddlePredictor.applyInput(0, PADDLE_SPEED);
      const predicted = paddlePredictor.getPosition();
      predicted.y = Math.max(0, Math.min(H - PADDLE_H, predicted.y));

      drawBackground(ctx, 'pong', W, H, { color: '#1a1a2e' });

      // Faint center glow
      const centerGlow = ctx.createRadialGradient(W/2, H/2, 0, W/2, H/2, H*0.6);
      centerGlow.addColorStop(0, '#4444ff08');
      centerGlow.addColorStop(1, '#00000000');
      ctx.fillStyle = centerGlow;
      ctx.fillRect(0, 0, W, H);
      drawVignette(ctx, W, H, 0.25);

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
        const x = i === 0 ? 10 : W - PADDLE_W - 10;
        const y = pid === myId ? predicted.y : state.paddles[pid];
        drawSprite(ctx, 'paddle', x, y, PADDLE_W, PADDLE_H, {
          color: pid === myId ? '#00ff88' : '#ff4488',
          skin: pid,
        });
      });

      // Ball
      if (!state.serving) {
        drawShinySphere(ctx, state.ball.x + BALL_SIZE/2, state.ball.y + BALL_SIZE/2, BALL_SIZE/2, '#ffffff');
      }

      // Scores
      pids.forEach((pid, i) => {
        const label = pid === myId ? 'You' : 'Opp';
        const x = i === 0 ? W / 4 : (W * 3) / 4;
        drawLabel(ctx, `${label}: ${state.scores[pid]}`, x, 40, { color: '#ffffff', font: '32px monospace' });
      });

      // Serving indicator
      if (state.serving) {
        drawLabel(ctx, 'READY...', W / 2, H / 2, { color: '#ffaa00', font: '20px monospace' });
      }

      animId = requestAnimationFrame(draw);
    }
    animId = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animId);
  }, [socket, myId, interpRef, paddlePredictor]);

  return (
    <div className="game-container">
      <canvas ref={canvasRef} className="game-canvas" />
      <p className="controls-hint">W/S or Arrow Keys to move</p>
    </div>
  );
}
