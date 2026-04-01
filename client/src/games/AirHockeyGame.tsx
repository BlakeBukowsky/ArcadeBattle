import { useEffect, useRef } from 'react';
import { useSocket, useMyId } from '../context/SocketContext.tsx';

const PUCK_R = 12, MALLET_R = 20;

interface AirHockeyState {
  puck: { x: number; y: number; vx: number; vy: number };
  mallets: Record<string, { x: number; y: number }>;
  scores: Record<string, number>;
  canvasWidth: number;
  canvasHeight: number;
  goalWidth: number;
  paused: boolean;
}

export default function AirHockeyGame() {
  const socket = useSocket();
  const myId = useMyId();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef<AirHockeyState | null>(null);

  useEffect(() => {
    socket.on('game:state', (s: AirHockeyState) => { stateRef.current = s; });
    return () => { socket.off('game:state'); };
  }, [socket]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let lastSend = 0;
    function handleMove(e: MouseEvent) {
      const now = Date.now();
      if (now - lastSend < 16) return;
      lastSend = now;
      const rect = canvas!.getBoundingClientRect();
      const state = stateRef.current;
      if (!state) return;
      const x = (e.clientX - rect.left) * (state.canvasWidth / rect.width);
      const y = (e.clientY - rect.top) * (state.canvasHeight / rect.height);
      socket.emit('game:input', { x, y });
    }

    canvas.addEventListener('mousemove', handleMove);
    return () => canvas.removeEventListener('mousemove', handleMove);
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
      const W = state.canvasWidth, H = state.canvasHeight;
      const goalTop = (H - state.goalWidth) / 2;

      // Table
      c.fillStyle = '#1a3a2e';
      c.fillRect(0, 0, W, H);

      // Center line
      c.setLineDash([6, 6]);
      c.strokeStyle = '#ffffff22';
      c.lineWidth = 2;
      c.beginPath();
      c.moveTo(W / 2, 0);
      c.lineTo(W / 2, H);
      c.stroke();
      c.setLineDash([]);

      // Center circle
      c.beginPath();
      c.arc(W / 2, H / 2, 50, 0, Math.PI * 2);
      c.strokeStyle = '#ffffff22';
      c.stroke();

      // Goals
      c.fillStyle = '#ff444466';
      c.fillRect(0, goalTop, 6, state.goalWidth);
      c.fillRect(W - 6, goalTop, 6, state.goalWidth);

      // Puck
      c.beginPath();
      c.arc(state.puck.x, state.puck.y, PUCK_R, 0, Math.PI * 2);
      c.fillStyle = '#ffffff';
      c.fill();

      // Mallets
      const pids = Object.keys(state.mallets);
      pids.forEach((pid) => {
        const m = state.mallets[pid];
        c.beginPath();
        c.arc(m.x, m.y, MALLET_R, 0, Math.PI * 2);
        c.fillStyle = pid === myId ? '#00ff88' : '#ff4488';
        c.fill();
        c.beginPath();
        c.arc(m.x, m.y, MALLET_R * 0.4, 0, Math.PI * 2);
        c.fillStyle = '#ffffff44';
        c.fill();
      });

      // Scores
      c.fillStyle = '#ffffff';
      c.font = '28px monospace';
      c.textAlign = 'center';
      pids.forEach((pid, i) => {
        const label = pid === myId ? 'You' : 'Opp';
        const x = i === 0 ? W / 4 : (W * 3) / 4;
        c.fillText(`${label}: ${state.scores[pid]}`, x, 35);
      });

      animId = requestAnimationFrame(draw);
    }
    animId = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animId);
  }, [socket]);

  return (
    <div className="game-container">
      <canvas ref={canvasRef} className="game-canvas" style={{ cursor: 'none' }} />
      <p className="controls-hint">Move your mouse to control the mallet</p>
    </div>
  );
}
