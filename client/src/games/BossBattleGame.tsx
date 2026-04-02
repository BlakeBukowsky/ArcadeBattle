import { useEffect, useRef } from 'react';
import { useSocket, useMyId } from '../context/SocketContext.tsx';
import { drawSprite, drawSpriteCircle, drawLabel, drawBackground } from '../lib/sprites.js';
import { applyStateUpdate, StateBuffer } from '../lib/net.js';

const PW = 14, PH = 20, BOSS_W = 70, BOSS_H = 50, PROJ_R = 4, HALF_W = 400;

interface BossProj { x: number; y: number; }
interface PlayerBullet { x: number; y: number; }
interface PlayerState {
  x: number; y: number; alive: boolean; lives: number; iframeUntil: number;
  bossHp: number; bossDefeated: boolean;
}
interface BossState { x: number; y: number; phase: string; }
interface BossBattleState {
  players: Record<string, PlayerState>;
  boss: BossState;
  playerBullets: Record<string, PlayerBullet[]>;
  bossProjectiles: Record<string, BossProj[]>;
  platforms: { x: number; y: number; w: number }[];
  canvasWidth: number; canvasHeight: number; winner: string | null;
}

export default function BossBattleGame() {
  const socket = useSocket();
  const myId = useMyId();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const interpRef = useRef(new StateBuffer<BossBattleState>()).current;

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

      const W = state.canvasWidth, H = state.canvasHeight, HALF = W / 2;
      canvas.width = W; canvas.height = H;

      drawBackground(c, 'boss-battle', W, H, { color: '#0a0008' });

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

        // Platforms
        for (const plat of state.platforms) {
          drawSprite(c, 'platform', ox + plat.x, plat.y, plat.w, 8, { color: '#444' });
        }

        // Boss
        const bossColor = boss.phase === 'telegraph' ? '#ffaa00' : boss.phase === 'idle' ? '#cc44cc' : '#ff2266';
        drawSprite(c, 'opponent', ox + boss.x, boss.y, BOSS_W, BOSS_H, { color: bossColor });
        // Boss HP bar
        const hpPct = p.bossHp / 80;
        c.fillStyle = '#333'; c.fillRect(ox + 10, 10, HALF_W - 20, 8);
        c.fillStyle = hpPct > 0.5 ? '#ff44cc' : hpPct > 0.25 ? '#ffaa00' : '#ff4444';
        c.fillRect(ox + 10, 10, (HALF_W - 20) * hpPct, 8);

        // Boss projectiles
        for (const proj of myProjs) {
          drawSpriteCircle(c, 'bullet', ox + proj.x, proj.y, PROJ_R, { color: '#ff4488' });
        }

        // Player bullets
        for (const b of myBullets) {
          drawSprite(c, 'bullet', ox + b.x, b.y, 4, 8, { color: '#88ffaa' });
        }

        // Player
        if (p.alive) {
          const hasIframes = p.iframeUntil > Date.now();
          if (hasIframes) c.globalAlpha = Math.sin(Date.now() * 0.015) * 0.3 + 0.7;
          drawSprite(c, isMe ? 'player' : 'opponent', ox + p.x, p.y, PW, PH, {
            color: isMe ? '#00ff88' : '#ff4488', skin: pid,
          });
          c.globalAlpha = 1;
        }

        // Lives
        drawLabel(c, '\u2665'.repeat(p.lives), ox + HALF_W / 2, H - 12, { color: '#ff4488', font: '18px monospace' });

        // Label
        drawLabel(c, isMe ? 'YOU' : 'OPPONENT', ox + HALF_W / 2, 30, { color: '#ffffff66', font: '11px monospace' });

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
      <p className="controls-hint">A/D to move, W to jump, Space to shoot — dodge the boss attacks!</p>
    </div>
  );
}
