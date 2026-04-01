import { useEffect, useRef } from 'react';
import { useSocket, useMyId } from '../context/SocketContext.tsx';
import { drawSprite, drawSpriteCircle, drawLabel, drawBackground } from '../lib/sprites.js';
import { applyStateUpdate, StateBuffer } from '../lib/net.js';

const BIRD_X = 80, BIRD_R = 12, PIPE_W = 40;

interface Pipe { x: number; gapY: number; gapH: number; }
interface PlayerState { y: number; alive: boolean; score: number; }
interface FlappyState {
  players: Record<string, PlayerState>;
  pipes: Pipe[]; scrollOffset: number; speed: number;
  canvasWidth: number; canvasHeight: number; winner: string | null;
}

export default function FlappyRaceGame() {
  const socket = useSocket();
  const myId = useMyId();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const interpRef = useRef(new StateBuffer<FlappyState>()).current;

  useEffect(() => {
    socket.on('game:state', (data: unknown) => { interpRef.push(applyStateUpdate(interpRef.latest(), data)); });
    return () => { socket.off('game:state'); };
  }, [socket]);

  useEffect(() => {
    function kd(e: KeyboardEvent) {
      if (e.key === 'w' || e.key === ' ' || e.key === 'ArrowUp') {
        e.preventDefault(); socket.emit('game:input', { flap: true });
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
      const state = interpRef.interpolate();
      if (!canvas || !c || !state) { animId = requestAnimationFrame(draw); return; }

      const W = state.canvasWidth, H = state.canvasHeight, HALF = W / 2;
      canvas.width = W; canvas.height = H;

      drawBackground(c, 'flappy-race', W, H, { color: '#0a1628' });

      // Divider
      c.strokeStyle = '#333'; c.lineWidth = 2; c.setLineDash([6, 6]);
      c.beginPath(); c.moveTo(HALF, 0); c.lineTo(HALF, H); c.stroke(); c.setLineDash([]);

      const pids = Object.keys(state.players);
      pids.forEach((pid, idx) => {
        const ox = idx * HALF;
        const p = state.players[pid];
        const isMe = pid === myId;

        c.save();
        c.beginPath(); c.rect(ox, 0, HALF, H); c.clip();

        // Pipes
        for (const pipe of state.pipes) {
          const px = ox + pipe.x - state.scrollOffset;
          if (px + PIPE_W < ox || px > ox + HALF) continue;
          const gh = pipe.gapH;
          drawSprite(c, 'pipe', px, 0, PIPE_W, pipe.gapY - gh / 2, { color: '#2d8b4e' });
          drawSprite(c, 'pipe', px, pipe.gapY + gh / 2, PIPE_W, H - (pipe.gapY + gh / 2), { color: '#2d8b4e' });
          // Caps
          drawSprite(c, 'pipe', px - 3, pipe.gapY - gh / 2 - 8, PIPE_W + 6, 8, { color: '#3aa55d' });
          drawSprite(c, 'pipe', px - 3, pipe.gapY + gh / 2, PIPE_W + 6, 8, { color: '#3aa55d' });
        }

        // Bird
        if (p.alive) {
          drawSpriteCircle(c, 'bird', ox + BIRD_X, p.y, BIRD_R, {
            color: isMe ? '#00ff88' : '#ff4488', skin: pid,
          });
          // Eye
          c.beginPath(); c.arc(ox + BIRD_X + 4, p.y - 3, 3, 0, Math.PI * 2);
          c.fillStyle = '#fff'; c.fill();
        } else {
          drawLabel(c, 'DEAD', ox + HALF / 2, H / 2, { color: '#ff440066', font: '20px monospace' });
        }

        drawLabel(c, isMe ? 'YOU' : 'OPPONENT', ox + HALF / 2, 18, { color: '#ffffff66', font: '12px monospace' });
        drawLabel(c, `${p.score}`, ox + HALF / 2, 45, { color: '#fff', font: '20px monospace' });

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
