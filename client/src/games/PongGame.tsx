import { useEffect, useRef, useState } from 'react';
import { useSocket, useMyId } from '../context/SocketContext.tsx';

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
  const keysRef = useRef<{ up: boolean; down: boolean }>({ up: false, down: false });

  useEffect(() => {
    function handleState(state: PongState) {
      stateRef.current = state;
    }
    socket.on('game:state', handleState);
    return () => { socket.off('game:state', handleState); };
  }, [socket]);

  // Input handling
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'ArrowUp' || e.key === 'w') {
        keysRef.current.up = true;
        socket.emit('game:input', { up: true });
      }
      if (e.key === 'ArrowDown' || e.key === 's') {
        keysRef.current.down = true;
        socket.emit('game:input', { down: true });
      }
    }
    function handleKeyUp(e: KeyboardEvent) {
      if (e.key === 'ArrowUp' || e.key === 'w') {
        keysRef.current.up = false;
        socket.emit('game:input', { up: false });
      }
      if (e.key === 'ArrowDown' || e.key === 's') {
        keysRef.current.down = false;
        socket.emit('game:input', { down: false });
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [socket]);

  // Render loop
  useEffect(() => {
    let animId: number;
    function draw() {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      const state = stateRef.current;
      if (!canvas || !ctx || !state) {
        animId = requestAnimationFrame(draw);
        return;
      }

      canvas.width = state.canvasWidth;
      canvas.height = state.canvasHeight;

      // Background
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
      const playerIds = Object.keys(state.paddles);
      const colors = ['#00ff88', '#ff4488'];
      playerIds.forEach((pid, i) => {
        ctx.fillStyle = colors[i];
        const x = i === 0 ? 10 : canvas.width - PADDLE_WIDTH - 10;
        ctx.fillRect(x, state.paddles[pid], PADDLE_WIDTH, PADDLE_HEIGHT);
      });

      // Ball
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(state.ball.x, state.ball.y, BALL_SIZE, BALL_SIZE);

      // Scores
      ctx.fillStyle = '#ffffff';
      ctx.font = '32px monospace';
      ctx.textAlign = 'center';
      playerIds.forEach((pid, i) => {
        const label = pid === myId ? 'You' : 'Opp';
        const x = i === 0 ? canvas.width / 4 : (canvas.width * 3) / 4;
        ctx.fillText(`${label}: ${state.scores[pid]}`, x, 40);
      });

      animId = requestAnimationFrame(draw);
    }
    animId = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animId);
  }, [socket]);

  return (
    <div className="game-container">
      <canvas ref={canvasRef} className="game-canvas" />
      <p className="controls-hint">Use W/S or Arrow Keys to move</p>
    </div>
  );
}
