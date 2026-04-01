import { useEffect, useRef } from 'react';
import { useSocket, useMyId } from '../context/SocketContext.tsx';
import { drawSpriteCircle, drawSprite, drawLabel, drawBackground } from '../lib/sprites.js';
import { applyStateUpdate } from '../lib/net.js';

const PUCK_R = 12, MALLET_R = 20;

interface AirHockeyState {
  puck: { x: number; y: number };
  mallets: Record<string, { x: number; y: number }>;
  scores: Record<string, number>;
  canvasWidth: number; canvasHeight: number;
  goalWidth: number; paused: boolean;
}

export default function AirHockeyGame() {
  const socket = useSocket();
  const myId = useMyId();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef<AirHockeyState | null>(null);

  useEffect(() => {
    socket.on('game:state', (data: unknown) => { stateRef.current = applyStateUpdate(stateRef.current, data); });
    return () => { socket.off('game:state'); };
  }, [socket]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let last = 0;
    function onMove(e: MouseEvent) {
      const now = Date.now(); if (now - last < 16) return; last = now;
      const rect = canvas!.getBoundingClientRect();
      const state = stateRef.current; if (!state) return;
      socket.emit('game:input', {
        x: (e.clientX - rect.left) * (state.canvasWidth / rect.width),
        y: (e.clientY - rect.top) * (state.canvasHeight / rect.height),
      });
    }
    canvas.addEventListener('mousemove', onMove);
    return () => canvas.removeEventListener('mousemove', onMove);
  }, [socket]);

  useEffect(() => {
    let animId: number;
    function draw() {
      const canvas = canvasRef.current;
      const c = canvas?.getContext('2d');
      const state = stateRef.current;
      if (!canvas || !c || !state) { animId = requestAnimationFrame(draw); return; }

      const W = state.canvasWidth, H = state.canvasHeight;
      canvas.width = W; canvas.height = H;
      const goalTop = (H - state.goalWidth) / 2;

      drawBackground(c, 'air-hockey', W, H, { color: '#1a3a2e' });

      // Center line + circle (procedural)
      c.setLineDash([6, 6]); c.strokeStyle = '#ffffff22'; c.lineWidth = 2;
      c.beginPath(); c.moveTo(W / 2, 0); c.lineTo(W / 2, H); c.stroke(); c.setLineDash([]);
      c.beginPath(); c.arc(W / 2, H / 2, 50, 0, Math.PI * 2); c.stroke();

      // Goals
      drawSprite(c, 'cover', 0, goalTop, 6, state.goalWidth, { color: '#ff444466' });
      drawSprite(c, 'cover', W - 6, goalTop, 6, state.goalWidth, { color: '#ff444466' });

      // Puck
      drawSpriteCircle(c, 'puck', state.puck.x, state.puck.y, PUCK_R, { color: '#ffffff' });

      // Mallets
      const pids = Object.keys(state.mallets);
      pids.forEach((pid) => {
        const m = state.mallets[pid];
        drawSpriteCircle(c, 'mallet', m.x, m.y, MALLET_R, {
          color: pid === myId ? '#00ff88' : '#ff4488',
          skin: pid,
        });
        // Inner ring highlight
        c.beginPath(); c.arc(m.x, m.y, MALLET_R * 0.4, 0, Math.PI * 2);
        c.fillStyle = '#ffffff44'; c.fill();
      });

      // Scores
      pids.forEach((pid, i) => {
        const x = i === 0 ? W / 4 : (W * 3) / 4;
        drawLabel(c, `${pid === myId ? 'You' : 'Opp'}: ${state.scores[pid]}`, x, 35, { color: '#ffffff', font: '28px monospace' });
      });

      animId = requestAnimationFrame(draw);
    }
    animId = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animId);
  }, [socket, myId]);

  return (
    <div className="game-container">
      <canvas ref={canvasRef} className="game-canvas" style={{ cursor: 'none' }} />
      <p className="controls-hint">Move your mouse to control the mallet</p>
    </div>
  );
}
