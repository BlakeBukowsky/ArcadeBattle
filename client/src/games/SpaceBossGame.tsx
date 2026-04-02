import { useEffect, useRef } from 'react';
import { useSocket, useMyId } from '../context/SocketContext.tsx';
import { drawSprite, drawSpriteCircle, drawLabel, drawBackground } from '../lib/sprites.js';
import { applyStateUpdate, StateBuffer } from '../lib/net.js';

const SHIP_W = 14, SHIP_H = 18, BOSS_W = 80, BOSS_H = 40, PROJ_R = 3;

interface BossProj { x: number; y: number; }
interface PlayerBullet { x: number; y: number; }
interface PlayerState { x: number; y: number; alive: boolean; lives: number; iframeUntil: number; bossHp: number; }
interface BossState { x: number; y: number; phase: string; }
interface SpaceBossState {
  players: Record<string, PlayerState>;
  boss: BossState;
  playerBullets: Record<string, PlayerBullet[]>;
  bossProjectiles: Record<string, BossProj[]>;
  canvasWidth: number; canvasHeight: number; winner: string | null;
}

export default function SpaceBossGame() {
  const socket = useSocket();
  const myId = useMyId();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const interpRef = useRef(new StateBuffer<SpaceBossState>()).current;

  useEffect(() => {
    socket.on('game:state', (data: unknown) => { interpRef.push(applyStateUpdate(interpRef.latest(), data)); });
    return () => { socket.off('game:state'); };
  }, [socket]);

  useEffect(() => {
    function kd(e: KeyboardEvent) {
      if (e.key === 'a' || e.key === 'ArrowLeft') socket.emit('game:input', { left: true });
      if (e.key === 'd' || e.key === 'ArrowRight') socket.emit('game:input', { right: true });
      if (e.key === 'w' || e.key === 'ArrowUp') { e.preventDefault(); socket.emit('game:input', { up: true }); }
      if (e.key === 's' || e.key === 'ArrowDown') socket.emit('game:input', { down: true });
      if (e.key === ' ') { e.preventDefault(); socket.emit('game:input', { fire: true }); }
    }
    function ku(e: KeyboardEvent) {
      if (e.key === 'a' || e.key === 'ArrowLeft') socket.emit('game:input', { left: false });
      if (e.key === 'd' || e.key === 'ArrowRight') socket.emit('game:input', { right: false });
      if (e.key === 'w' || e.key === 'ArrowUp') socket.emit('game:input', { up: false });
      if (e.key === 's' || e.key === 'ArrowDown') socket.emit('game:input', { down: false });
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

      const W = state.canvasWidth, H = state.canvasHeight, HALF = W / 2;
      canvas.width = W; canvas.height = H;

      drawBackground(c, 'space-boss', W, H, { color: '#020010' });

      // Star field effect
      for (let i = 0; i < 30; i++) {
        const sx = ((i * 137 + Date.now() * 0.001 * (i % 3 + 1)) % HALF);
        const sy = ((i * 251 + Date.now() * 0.02) % H);
        c.fillStyle = '#ffffff22';
        c.fillRect(sx, sy, 1, 1);
        c.fillRect(sx + HALF, sy, 1, 1);
      }

      c.strokeStyle = '#333'; c.lineWidth = 2; c.setLineDash([6, 6]);
      c.beginPath(); c.moveTo(HALF, 0); c.lineTo(HALF, H); c.stroke(); c.setLineDash([]);

      const pids = Object.keys(state.players);
      const boss = state.boss;

      pids.forEach((pid, idx) => {
        const ox = idx * HALF;
        const p = state.players[pid];
        const isMe = pid === myId;
        const myProjs = state.bossProjectiles[pid] ?? [];
        const myBullets = state.playerBullets[pid] ?? [];

        c.save();
        c.beginPath(); c.rect(ox, 0, HALF, H); c.clip();

        // Boss
        const bossColor = boss.phase === 'telegraph' ? '#ffaa00' : boss.phase === 'idle' ? '#6644cc' : '#ff2266';
        drawSprite(c, 'opponent', ox + boss.x, boss.y, BOSS_W, BOSS_H, { color: bossColor });
        // Boss details
        c.fillStyle = '#00000033';
        c.fillRect(ox + boss.x + 10, boss.y + 10, BOSS_W - 20, BOSS_H - 20);
        // Boss engine glow
        c.fillStyle = '#ff448844';
        c.fillRect(ox + boss.x + 15, boss.y + BOSS_H - 3, 15, 6);
        c.fillRect(ox + boss.x + BOSS_W - 30, boss.y + BOSS_H - 3, 15, 6);

        // Boss HP bar
        const BOSS_HP_MAX = 90;
        const hpPct = p.bossHp / BOSS_HP_MAX;
        c.fillStyle = '#222'; c.fillRect(ox + 10, 8, HALF - 20, 6);
        c.fillStyle = hpPct > 0.5 ? '#cc44ff' : hpPct > 0.25 ? '#ffaa00' : '#ff4444';
        c.fillRect(ox + 10, 8, (HALF - 20) * hpPct, 6);

        // Boss projectiles
        for (const proj of myProjs) {
          drawSpriteCircle(c, 'bullet', ox + proj.x, proj.y, PROJ_R, { color: '#ff44aa' });
        }

        // Player bullets
        for (const b of myBullets) {
          drawSprite(c, 'bullet', ox + b.x, b.y, 3, 8, { color: '#88ffaa' });
        }

        // Player ship
        if (p.alive) {
          const hasIframes = p.iframeUntil > Date.now();
          if (hasIframes) c.globalAlpha = Math.sin(Date.now() * 0.015) * 0.3 + 0.7;

          const sx = ox + p.x, sy = p.y;
          // Ship body
          c.beginPath();
          c.moveTo(sx + SHIP_W / 2, sy);
          c.lineTo(sx, sy + SHIP_H);
          c.lineTo(sx + SHIP_W / 2, sy + SHIP_H - 4);
          c.lineTo(sx + SHIP_W, sy + SHIP_H);
          c.closePath();
          c.fillStyle = isMe ? '#00ff88' : '#ff4488';
          c.fill();
          // Engine glow
          c.fillStyle = '#ffaa0088';
          c.fillRect(sx + SHIP_W / 2 - 2, sy + SHIP_H, 4, 4 + Math.sin(Date.now() * 0.02) * 2);

          c.globalAlpha = 1;
        }

        // Lives
        drawLabel(c, '\u2665'.repeat(p.lives), ox + HALF / 2, H - 10, { color: '#ff4488', font: '16px monospace' });
        drawLabel(c, isMe ? 'YOU' : 'OPPONENT', ox + HALF / 2, 24, { color: '#ffffff44', font: '10px monospace' });

        c.restore();
      });

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
      <p className="controls-hint">WASD to move, Space to shoot — dodge everything!</p>
    </div>
  );
}
