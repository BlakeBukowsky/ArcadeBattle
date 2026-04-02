import { useEffect, useRef } from 'react';
import { useSocket, useMyId } from '../context/SocketContext.tsx';
import { drawSprite, drawSpriteCircle, drawLabel, drawBackground } from '../lib/sprites.js';
import { applyStateUpdate, StateBuffer } from '../lib/net.js';

const PW = 16, PH = 22, BULLET_R = 4;

interface Plat { x: number; y: number; w: number; }
interface Bullet { x: number; y: number; vx: number; vy: number; owner: string; bounces: number; }
interface PlayerState { x: number; y: number; facing: 1 | -1; alive: boolean; iframeUntil: number; }
interface RoundsState {
  players: Record<string, PlayerState>;
  bullets: Bullet[];
  platforms: Plat[];
  scores: Record<string, number>;
  roundsToWin: number; roundActive: boolean;
  canvasWidth: number; canvasHeight: number; winner: string | null;
}

export default function RoundsGame() {
  const socket = useSocket();
  const myId = useMyId();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const interpRef = useRef(new StateBuffer<RoundsState>()).current;

  useEffect(() => {
    socket.on('game:state', (data: unknown) => { interpRef.push(applyStateUpdate(interpRef.latest(), data)); });
    return () => { socket.off('game:state'); };
  }, [socket]);

  useEffect(() => {
    function kd(e: KeyboardEvent) {
      if (e.key === 'a' || e.key === 'ArrowLeft') socket.emit('game:input', { left: true });
      if (e.key === 'd' || e.key === 'ArrowRight') socket.emit('game:input', { right: true });
      if (e.key === 'w' || e.key === 'ArrowUp') { e.preventDefault(); socket.emit('game:input', { jump: true }); }
      if (e.key === ' ') { e.preventDefault(); socket.emit('game:input', { fire: true }); }
    }
    function ku(e: KeyboardEvent) {
      if (e.key === 'a' || e.key === 'ArrowLeft') socket.emit('game:input', { left: false });
      if (e.key === 'd' || e.key === 'ArrowRight') socket.emit('game:input', { right: false });
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
      const state = interpRef.interpolate();
      if (!canvas || !c || !state) { animId = requestAnimationFrame(draw); return; }

      const W = state.canvasWidth, H = state.canvasHeight;
      canvas.width = W; canvas.height = H;

      drawBackground(c, 'rounds', W, H, { color: '#12101a' });

      // Platforms
      for (const plat of state.platforms) {
        drawSprite(c, 'platform', plat.x, plat.y, plat.w, 10, { color: '#444' });
        c.fillStyle = '#555'; c.fillRect(plat.x, plat.y, plat.w, 2);
      }

      // Bullets
      for (const b of state.bullets) {
        const color = b.owner === myId ? '#88ffaa' : '#ff8888';
        drawSpriteCircle(c, 'bullet', b.x, b.y, BULLET_R, { color });
        // Trail
        c.beginPath(); c.moveTo(b.x, b.y); c.lineTo(b.x - b.vx * 2, b.y - b.vy * 2);
        c.strokeStyle = color + '44'; c.lineWidth = 2; c.stroke();
      }

      // Players
      const pids = Object.keys(state.players);
      pids.forEach((pid) => {
        const p = state.players[pid];
        if (!p.alive) return;
        const isMe = pid === myId;
        const color = isMe ? '#00ff88' : '#ff4488';
        const hasIframes = p.iframeUntil > Date.now();

        if (hasIframes) c.globalAlpha = Math.sin(Date.now() * 0.015) * 0.3 + 0.7;

        drawSprite(c, isMe ? 'player' : 'opponent', p.x, p.y, PW, PH, { color, skin: pid });

        // Gun
        const gunX = p.facing > 0 ? p.x + PW : p.x - 8;
        c.fillStyle = '#aaa';
        c.fillRect(gunX, p.y + PH / 2 - 2, 8, 4);

        c.globalAlpha = 1;
        drawLabel(c, isMe ? 'YOU' : 'OPP', p.x + PW / 2, p.y - 6, { color: '#ffffff44', font: '9px monospace' });
      });

      // Scores
      pids.forEach((pid) => {
        const isMe = pid === myId;
        const x = isMe ? 20 : W - 20;
        const align = isMe ? 'left' : 'right';
        const pips = [];
        for (let i = 0; i < state.roundsToWin; i++) {
          pips.push(i < state.scores[pid] ? '●' : '○');
        }
        drawLabel(c, `${isMe ? 'You' : 'Opp'} ${pips.join(' ')}`, x, 25, {
          color: isMe ? '#00ff88' : '#ff4488', font: '16px monospace', align: align as CanvasTextAlign,
        });
      });

      // Round transition
      if (!state.roundActive && !state.winner) {
        c.fillStyle = '#000000aa'; c.fillRect(0, H / 2 - 20, W, 40);
        drawLabel(c, 'ROUND!', W / 2, H / 2 + 6, { color: '#ffaa00', font: '20px monospace' });
      }

      if (state.winner) {
        c.fillStyle = '#000000aa'; c.fillRect(0, H / 2 - 30, W, 60);
        drawLabel(c, state.winner === myId ? 'YOU WIN!' : 'YOU LOSE!', W / 2, H / 2 + 8, {
          color: state.winner === myId ? '#00ff88' : '#ff4488', font: '28px monospace',
        });
      }

      animId = requestAnimationFrame(draw);
    }
    animId = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animId);
  }, [socket, myId, interpRef]);

  return (
    <div className="game-container">
      <canvas ref={canvasRef} className="game-canvas" />
      <p className="controls-hint">A/D to move, W to jump, Space to shoot — bullets bounce once!</p>
    </div>
  );
}
