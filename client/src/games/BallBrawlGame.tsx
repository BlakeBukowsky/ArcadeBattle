import { useEffect, useRef } from 'react';
import { useSocket, useMyId } from '../context/SocketContext.tsx';

const PLAYER_W = 40, PLAYER_H = 50, BALL_R = 12, SWING_RANGE = 65;

interface PlayerState {
  x: number; y: number; vy: number; onGround: boolean;
  swinging: boolean; stunned: boolean;
}
interface BallBrawlState {
  players: Record<string, PlayerState>;
  ball: { x: number; y: number; vx: number; vy: number; owner: string | null; speed: number };
  scores: Record<string, number>;
  canvasWidth: number; canvasHeight: number;
}

export default function BallBrawlGame() {
  const socket = useSocket();
  const myId = useMyId();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef<BallBrawlState | null>(null);

  useEffect(() => {
    socket.on('game:state', (s: BallBrawlState) => { stateRef.current = s; });
    return () => { socket.off('game:state'); };
  }, [socket]);

  useEffect(() => {
    function kd(e: KeyboardEvent) {
      if (e.key === 'a' || e.key === 'ArrowLeft') socket.emit('game:input', { left: true });
      if (e.key === 'd' || e.key === 'ArrowRight') socket.emit('game:input', { right: true });
      if (e.key === 'w' || e.key === ' ' || e.key === 'ArrowUp') {
        e.preventDefault();
        socket.emit('game:input', { jump: true });
      }
      if (e.key === 'j' || e.key === 'k') socket.emit('game:input', { swing: true });
    }
    function ku(e: KeyboardEvent) {
      if (e.key === 'a' || e.key === 'ArrowLeft') socket.emit('game:input', { left: false });
      if (e.key === 'd' || e.key === 'ArrowRight') socket.emit('game:input', { right: false });
      if (e.key === 'w' || e.key === ' ' || e.key === 'ArrowUp') socket.emit('game:input', { jump: false });
    }
    window.addEventListener('keydown', kd);
    window.addEventListener('keyup', ku);
    return () => { window.removeEventListener('keydown', kd); window.removeEventListener('keyup', ku); };
  }, [socket]);

  useEffect(() => {
    let animId: number;
    function draw() {
      const canvas = canvasRef.current;
      const c = canvas?.getContext('2d');
      const state = stateRef.current;
      if (!canvas || !c || !state) { animId = requestAnimationFrame(draw); return; }

      const W = state.canvasWidth, H = state.canvasHeight;
      const FLOOR_Y = H - 30;
      canvas.width = W;
      canvas.height = H;

      c.fillStyle = '#1a1a2e';
      c.fillRect(0, 0, W, H);
      c.fillStyle = '#2a2a3e';
      c.fillRect(0, FLOOR_Y, W, H - FLOOR_Y);

      // Ball
      const ballColor = state.ball.owner
        ? (state.ball.owner === myId ? '#00ff88' : '#ff4488')
        : '#888888';
      c.beginPath();
      c.arc(state.ball.x, state.ball.y, BALL_R, 0, Math.PI * 2);
      c.fillStyle = ballColor;
      c.fill();
      // Speed indicator — glow
      if (state.ball.speed > 10) {
        c.beginPath();
        c.arc(state.ball.x, state.ball.y, BALL_R + 4, 0, Math.PI * 2);
        c.strokeStyle = ballColor + '66';
        c.lineWidth = 2;
        c.stroke();
      }

      // Players
      const pids = Object.keys(state.players);
      pids.forEach((pid) => {
        const p = state.players[pid];
        const isMe = pid === myId;
        const color = isMe ? '#00ff88' : '#ff4488';

        // Stun flash
        if (p.stunned) {
          c.globalAlpha = Math.sin(Date.now() * 0.02) * 0.3 + 0.7;
        }

        c.fillStyle = color;
        c.fillRect(p.x, p.y, PLAYER_W, PLAYER_H);

        // Hit range circle — always visible for local player, shows on swing for opponent
        if (isMe || p.swinging) {
          c.beginPath();
          c.arc(p.x + PLAYER_W / 2, p.y + PLAYER_H / 2, SWING_RANGE, 0, Math.PI * 2);
          c.strokeStyle = p.swinging ? color + '88' : color + '22';
          c.lineWidth = p.swinging ? 3 : 1;
          c.setLineDash(p.swinging ? [] : [4, 4]);
          c.stroke();
          c.setLineDash([]);
        }

        c.globalAlpha = 1;

        c.fillStyle = '#ffffff44';
        c.font = '10px monospace';
        c.textAlign = 'center';
        c.fillText(isMe ? 'YOU' : 'OPP', p.x + PLAYER_W / 2, p.y - 4);
      });

      // Scores
      c.fillStyle = '#ffffff';
      c.font = '24px monospace';
      c.textAlign = 'left';
      pids.forEach((pid, i) => {
        const label = pid === myId ? 'You' : 'Opponent';
        c.fillText(`${label}: ${state.scores[pid]}`, 20, 30 + i * 28);
      });

      // Speed display
      c.textAlign = 'right';
      c.font = '16px monospace';
      c.fillStyle = '#888';
      c.fillText(`Ball: ${state.ball.speed.toFixed(0)}`, W - 20, 30);

      animId = requestAnimationFrame(draw);
    }
    animId = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animId);
  }, [socket]);

  return (
    <div className="game-container">
      <canvas ref={canvasRef} className="game-canvas" />
      <p className="controls-hint">A/D to move, W/Space to jump, J or K to swing</p>
    </div>
  );
}
