import { useEffect, useRef } from 'react';
import { useSocket, useMyId } from '../context/SocketContext.tsx';
import { drawSprite, drawSpriteCircle, drawLabel, drawBackground } from '../lib/sprites.js';
import { drawSkyGradient } from '../lib/draw-helpers.js';
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

      drawSkyGradient(c, W, H, '#0a1628', '#1a2a40');

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
          // Top pipe body with 3D cylinder gradient
          const pipeGradTop = c.createLinearGradient(px, 0, px + PIPE_W, 0);
          pipeGradTop.addColorStop(0, '#1a6b2e');
          pipeGradTop.addColorStop(0.3, '#3aa55d');
          pipeGradTop.addColorStop(0.7, '#3aa55d');
          pipeGradTop.addColorStop(1, '#1a6b2e');
          c.fillStyle = pipeGradTop;
          c.fillRect(px, 0, PIPE_W, pipe.gapY - gh / 2);
          // Bottom pipe body with 3D cylinder gradient
          const pipeGradBot = c.createLinearGradient(px, 0, px + PIPE_W, 0);
          pipeGradBot.addColorStop(0, '#1a6b2e');
          pipeGradBot.addColorStop(0.3, '#3aa55d');
          pipeGradBot.addColorStop(0.7, '#3aa55d');
          pipeGradBot.addColorStop(1, '#1a6b2e');
          c.fillStyle = pipeGradBot;
          c.fillRect(px, pipe.gapY + gh / 2, PIPE_W, H - (pipe.gapY + gh / 2));
          // Caps with gradient
          const capGrad = c.createLinearGradient(px - 3, 0, px - 3 + PIPE_W + 6, 0);
          capGrad.addColorStop(0, '#1a8b3e');
          capGrad.addColorStop(0.3, '#4cc76d');
          capGrad.addColorStop(0.7, '#4cc76d');
          capGrad.addColorStop(1, '#1a8b3e');
          c.fillStyle = capGrad;
          c.fillRect(px - 3, pipe.gapY - gh / 2 - 8, PIPE_W + 6, 8);
          c.fillRect(px - 3, pipe.gapY + gh / 2, PIPE_W + 6, 8);
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
