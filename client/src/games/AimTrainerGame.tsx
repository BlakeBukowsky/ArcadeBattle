import { useEffect, useRef } from 'react';
import { useSocket, useMyId } from '../context/SocketContext.tsx';

interface Target {
  id: number;
  x: number;
  y: number;
  radius: number;
}

interface AimState {
  targets: Target[];
  scores: Record<string, number>;
  cursors: Record<string, { x: number; y: number }>;
  timeRemaining: number;
  canvasWidth: number;
  canvasHeight: number;
}

export default function AimTrainerGame() {
  const socket = useSocket();
  const myId = useMyId();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef<AimState | null>(null);

  useEffect(() => {
    function handleState(s: AimState) {
      stateRef.current = s;
    }
    socket.on('game:state', handleState);
    return () => { socket.off('game:state', handleState); };
  }, [socket]);

  // Click + mousemove handling
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    function getCanvasCoords(e: MouseEvent): { x: number; y: number } | null {
      const rect = canvas!.getBoundingClientRect();
      const state = stateRef.current;
      if (!state) return null;
      const scaleX = state.canvasWidth / rect.width;
      const scaleY = state.canvasHeight / rect.height;
      return {
        x: (e.clientX - rect.left) * scaleX,
        y: (e.clientY - rect.top) * scaleY,
      };
    }

    function handleClick(e: MouseEvent) {
      const coords = getCanvasCoords(e);
      if (coords) socket.emit('game:input', { action: 'click', ...coords });
    }

    let lastSend = 0;
    function handleMove(e: MouseEvent) {
      const now = Date.now();
      if (now - lastSend < 50) return; // throttle to ~20fps
      lastSend = now;
      const coords = getCanvasCoords(e);
      if (coords) socket.emit('game:input', { action: 'move', ...coords });
    }

    canvas.addEventListener('click', handleClick);
    canvas.addEventListener('mousemove', handleMove);
    return () => {
      canvas.removeEventListener('click', handleClick);
      canvas.removeEventListener('mousemove', handleMove);
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

      ctx.fillStyle = '#1a1a2e';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Targets
      state.targets.forEach((target) => {
        ctx.beginPath();
        ctx.arc(target.x, target.y, target.radius, 0, Math.PI * 2);
        ctx.fillStyle = '#ff4444';
        ctx.fill();
        ctx.beginPath();
        ctx.arc(target.x, target.y, target.radius * 0.5, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
        ctx.beginPath();
        ctx.arc(target.x, target.y, target.radius * 0.2, 0, Math.PI * 2);
        ctx.fillStyle = '#ff4444';
        ctx.fill();
      });

      // Opponent cursor
      const players = Object.keys(state.cursors);
      for (const pid of players) {
        if (pid === myId) continue;
        const c = state.cursors[pid];
        const size = 10;
        ctx.strokeStyle = '#ff448888';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(c.x - size, c.y);
        ctx.lineTo(c.x + size, c.y);
        ctx.moveTo(c.x, c.y - size);
        ctx.lineTo(c.x, c.y + size);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(c.x, c.y, 4, 0, Math.PI * 2);
        ctx.strokeStyle = '#ff448888';
        ctx.stroke();
      }

      // Scores
      const scoreKeys = Object.keys(state.scores);
      ctx.fillStyle = '#ffffff';
      ctx.font = '24px monospace';
      ctx.textAlign = 'left';
      scoreKeys.forEach((pid, i) => {
        const label = pid === myId ? 'You' : 'Opponent';
        ctx.fillText(`${label}: ${state.scores[pid]}`, 20, 30 + i * 30);
      });

      // Timer
      ctx.textAlign = 'right';
      ctx.font = '28px monospace';
      ctx.fillStyle = state.timeRemaining < 5 ? '#ff4444' : '#ffffff';
      ctx.fillText(`${state.timeRemaining.toFixed(1)}s`, canvas.width - 20, 35);

      animId = requestAnimationFrame(draw);
    }
    animId = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animId);
  }, [socket]);

  return (
    <div className="game-container">
      <canvas ref={canvasRef} className="game-canvas" style={{ cursor: 'crosshair' }} />
      <p className="controls-hint">Click the targets!</p>
    </div>
  );
}
