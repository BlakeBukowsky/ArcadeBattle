import { useEffect, useRef } from 'react';
import { useSocket, useMyId } from '../context/SocketContext.tsx';
import { drawSprite, drawSpriteCircle, drawLabel, drawBackground } from '../lib/sprites.js';
import { applyStateUpdate, StateBuffer } from '../lib/net.js';

const PW = 16, PH = 22, BULLET_R = 4;

interface Plat { x: number; y: number; w: number; }
interface Bullet { x: number; y: number; vx: number; vy: number; owner: string; bounces: number; }
interface PlayerState { x: number; y: number; facing: 1 | -1; aimAngle: number; alive: boolean; iframeUntil: number; }
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
    }
    function ku(e: KeyboardEvent) {
      if (e.key === 'a' || e.key === 'ArrowLeft') socket.emit('game:input', { left: false });
      if (e.key === 'd' || e.key === 'ArrowRight') socket.emit('game:input', { right: false });
    }
    window.addEventListener('keydown', kd);
    window.addEventListener('keyup', ku);
    return () => { window.removeEventListener('keydown', kd); window.removeEventListener('keyup', ku); };
  }, [socket]);

  // Mouse aim + click to fire
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let lastAim = 0;
    function onMove(e: MouseEvent) {
      const now = Date.now(); if (now - lastAim < 33) return; lastAim = now;
      const rect = canvas!.getBoundingClientRect();
      const state = interpRef.latest(); if (!state) return;
      const mx = (e.clientX - rect.left) * (state.canvasWidth / rect.width);
      const my = (e.clientY - rect.top) * (state.canvasHeight / rect.height);
      const p = state.players[myId]; if (!p) return;
      const angle = Math.atan2(my - (p.y + PH / 2), mx - (p.x + PW / 2));
      socket.emit('game:input', { aimAngle: angle });
    }
    function onClick() { socket.emit('game:input', { fire: true }); }
    canvas.addEventListener('mousemove', onMove);
    canvas.addEventListener('click', onClick);
    return () => { canvas.removeEventListener('mousemove', onMove); canvas.removeEventListener('click', onClick); };
  }, [socket, myId, interpRef]);

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

        // Aim line + gun barrel
        const cx = p.x + PW / 2, cy = p.y + PH / 2;
        const gunLen = 12;
        c.strokeStyle = isMe ? '#ffffff44' : '#ff448844';
        c.lineWidth = 1;
        c.beginPath();
        c.moveTo(cx, cy);
        c.lineTo(cx + Math.cos(p.aimAngle) * 40, cy + Math.sin(p.aimAngle) * 40);
        c.stroke();
        c.fillStyle = '#aaa';
        c.save();
        c.translate(cx, cy);
        c.rotate(p.aimAngle);
        c.fillRect(0, -2, gunLen, 4);
        c.restore();

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
