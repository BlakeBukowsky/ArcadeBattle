import { useEffect, useRef } from 'react';
import { useSocket, useMyId } from '../context/SocketContext.tsx';

const BIRD_X = 80, BIRD_R = 12, PIPE_W = 40, GAP_H = 120;

interface Pipe { x: number; gapY: number; }
interface PlayerState { y: number; alive: boolean; score: number; }
interface FlappyState {
  players: Record<string, PlayerState>;
  pipes: Pipe[];
  scrollOffset: number;
  speed: number;
  canvasWidth: number; canvasHeight: number;
  winner: string | null;
}

export default function FlappyRaceGame() {
  const socket = useSocket();
  const myId = useMyId();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef<FlappyState | null>(null);

  useEffect(() => {
    socket.on('game:state', (s: FlappyState) => { stateRef.current = s; });
    return () => { socket.off('game:state'); };
  }, [socket]);

  useEffect(() => {
    function kd(e: KeyboardEvent) {
      if (e.key === 'w' || e.key === ' ' || e.key === 'ArrowUp') {
        e.preventDefault();
        socket.emit('game:input', { flap: true });
      }
    }
    window.addEventListener('keydown', kd);
    return () => window.removeEventListener('keydown', kd);
  }, [socket]);

  useEffect(() => {
    let animId: number;
    function draw() {
      const canvas = canvasRef.current;
      const c = canvas?.getContext('2d');
      const state = stateRef.current;
      if (!canvas || !c || !state) { animId = requestAnimationFrame(draw); return; }

      const W = state.canvasWidth, H = state.canvasHeight;
      const HALF = W / 2;
      canvas.width = W; canvas.height = H;

      c.fillStyle = '#0a1628';
      c.fillRect(0, 0, W, H);

      // Divider
      c.strokeStyle = '#333';
      c.lineWidth = 2;
      c.setLineDash([6, 6]);
      c.beginPath(); c.moveTo(HALF, 0); c.lineTo(HALF, H); c.stroke();
      c.setLineDash([]);

      const pids = Object.keys(state.players);

      pids.forEach((pid, idx) => {
        const offsetX = idx * HALF;
        const p = state.players[pid];
        const isMe = pid === myId;

        // Clip to half
        c.save();
        c.beginPath();
        c.rect(offsetX, 0, HALF, H);
        c.clip();

        // Pipes
        for (const pipe of state.pipes) {
          const px = offsetX + pipe.x - state.scrollOffset;
          if (px + PIPE_W < offsetX || px > offsetX + HALF) continue;

          c.fillStyle = '#2d8b4e';
          // Top pipe
          c.fillRect(px, 0, PIPE_W, pipe.gapY - GAP_H / 2);
          // Bottom pipe
          c.fillRect(px, pipe.gapY + GAP_H / 2, PIPE_W, H - (pipe.gapY + GAP_H / 2));
          // Caps
          c.fillStyle = '#3aa55d';
          c.fillRect(px - 3, pipe.gapY - GAP_H / 2 - 8, PIPE_W + 6, 8);
          c.fillRect(px - 3, pipe.gapY + GAP_H / 2, PIPE_W + 6, 8);
        }

        // Bird
        if (p.alive) {
          c.beginPath();
          c.arc(offsetX + BIRD_X, p.y, BIRD_R, 0, Math.PI * 2);
          c.fillStyle = isMe ? '#00ff88' : '#ff4488';
          c.fill();
          // Eye
          c.beginPath();
          c.arc(offsetX + BIRD_X + 4, p.y - 3, 3, 0, Math.PI * 2);
          c.fillStyle = '#fff';
          c.fill();
        } else {
          c.fillStyle = '#ff440066';
          c.font = '20px monospace';
          c.textAlign = 'center';
          c.fillText('DEAD', offsetX + HALF / 2, H / 2);
        }

        // Label
        c.fillStyle = '#ffffff66';
        c.font = '12px monospace';
        c.textAlign = 'center';
        c.fillText(isMe ? 'YOU' : 'OPPONENT', offsetX + HALF / 2, 18);

        // Score
        c.fillStyle = '#fff';
        c.font = '20px monospace';
        c.textAlign = 'center';
        c.fillText(`${p.score}`, offsetX + HALF / 2, 45);

        c.restore();
      });

      animId = requestAnimationFrame(draw);
    }
    animId = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animId);
  }, [socket, myId]);

  return (
    <div className="game-container">
      <canvas ref={canvasRef} className="game-canvas" />
      <p className="controls-hint">W, Space, or Up Arrow to flap</p>
    </div>
  );
}
