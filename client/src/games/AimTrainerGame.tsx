import { useEffect, useRef } from 'react';
import { useSocket, useMyId } from '../context/SocketContext.tsx';
import { drawSpriteCircle, drawLabel, drawBackground } from '../lib/sprites.js';

interface Target { id: number; x: number; y: number; radius: number; }
interface AimState {
  targets: Target[];
  scores: Record<string, number>;
  cursors: Record<string, { x: number; y: number }>;
  timeRemaining: number;
  canvasWidth: number; canvasHeight: number;
}

export default function AimTrainerGame() {
  const socket = useSocket();
  const myId = useMyId();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef<AimState | null>(null);

  useEffect(() => {
    socket.on('game:state', (s: AimState) => { stateRef.current = s; });
    return () => { socket.off('game:state'); };
  }, [socket]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    function getCoords(e: MouseEvent) {
      const rect = canvas!.getBoundingClientRect();
      const state = stateRef.current;
      if (!state) return null;
      return { x: (e.clientX - rect.left) * (state.canvasWidth / rect.width), y: (e.clientY - rect.top) * (state.canvasHeight / rect.height) };
    }
    function onClick(e: MouseEvent) { const c = getCoords(e); if (c) socket.emit('game:input', { action: 'click', ...c }); }
    let last = 0;
    function onMove(e: MouseEvent) { const now = Date.now(); if (now - last < 50) return; last = now; const c = getCoords(e); if (c) socket.emit('game:input', { action: 'move', ...c }); }
    canvas.addEventListener('click', onClick);
    canvas.addEventListener('mousemove', onMove);
    return () => { canvas.removeEventListener('click', onClick); canvas.removeEventListener('mousemove', onMove); };
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

      drawBackground(ctx, 'aim-trainer', canvas.width, canvas.height, { color: '#1a1a2e' });

      // Targets — concentric rings via sprite API
      state.targets.forEach((t) => {
        drawSpriteCircle(ctx, 'target', t.x, t.y, t.radius, { color: '#ff4444' });
        drawSpriteCircle(ctx, 'target', t.x, t.y, t.radius * 0.5, { color: '#ffffff' });
        drawSpriteCircle(ctx, 'target', t.x, t.y, t.radius * 0.2, { color: '#ff4444' });
      });

      // Opponent cursor (procedural crosshair — not sprite-able)
      for (const pid of Object.keys(state.cursors)) {
        if (pid === myId) continue;
        const c = state.cursors[pid];
        ctx.strokeStyle = '#ff448888';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(c.x - 10, c.y); ctx.lineTo(c.x + 10, c.y);
        ctx.moveTo(c.x, c.y - 10); ctx.lineTo(c.x, c.y + 10);
        ctx.stroke();
        ctx.beginPath(); ctx.arc(c.x, c.y, 4, 0, Math.PI * 2); ctx.stroke();
      }

      // Scores
      Object.keys(state.scores).forEach((pid, i) => {
        drawLabel(ctx, `${pid === myId ? 'You' : 'Opponent'}: ${state.scores[pid]}`, 20, 30 + i * 30, { color: '#ffffff', font: '24px monospace', align: 'left' });
      });

      // Timer
      drawLabel(ctx, `${state.timeRemaining.toFixed(1)}s`, canvas.width - 20, 35, {
        color: state.timeRemaining < 5 ? '#ff4444' : '#ffffff', font: '28px monospace', align: 'right',
      });

      animId = requestAnimationFrame(draw);
    }
    animId = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animId);
  }, [socket, myId]);

  return (
    <div className="game-container">
      <canvas ref={canvasRef} className="game-canvas" style={{ cursor: 'crosshair' }} />
      <p className="controls-hint">Click the targets!</p>
    </div>
  );
}
