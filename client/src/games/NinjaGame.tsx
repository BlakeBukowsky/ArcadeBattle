import { useEffect, useRef } from 'react';
import { useSocket, useMyId } from '../context/SocketContext.tsx';
import { drawSprite, drawLabel, drawBackground } from '../lib/sprites.js';
import { drawPlatformBlock } from '../lib/draw-helpers.js';
import { applyStateUpdate, StateBuffer } from '../lib/net.js';

const PW = 14, PH = 20, ENEMY_W = 14, ENEMY_H = 18;

interface Plat { x: number; y: number; w: number; }
interface EnemyState { x: number; y: number; alive: boolean; }
interface PlayerState {
  x: number; y: number; facing: 1 | -1;
  slashing: number; killCount: number; completed: boolean; cameraX: number; dashTimer: number;
}
interface NinjaState {
  players: Record<string, PlayerState>;
  building: { totalWidth: number; totalEnemies: number; rooms: { x: number; platforms: Plat[] }[] };
  enemies: Record<string, EnemyState[]>;
  canvasWidth: number; canvasHeight: number; winner: string | null;
}

export default function NinjaGame() {
  const socket = useSocket();
  const myId = useMyId();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const interpRef = useRef(new StateBuffer<NinjaState>()).current;

  useEffect(() => {
    socket.on('game:state', (data: unknown) => { interpRef.push(applyStateUpdate(interpRef.latest(), data)); });
    return () => { socket.off('game:state'); };
  }, [socket]);

  useEffect(() => {
    function kd(e: KeyboardEvent) {
      if (e.key === 'a' || e.key === 'ArrowLeft') socket.emit('game:input', { left: true });
      if (e.key === 'd' || e.key === 'ArrowRight') socket.emit('game:input', { right: true });
      if (e.key === 'w' || e.key === 'ArrowUp') { e.preventDefault(); socket.emit('game:input', { jump: true }); }
      if (e.key === ' ') { e.preventDefault(); socket.emit('game:input', { dash: true }); }
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

      drawBackground(c, 'ninja', W, H, { color: '#0a0a0a' });

      // Torchlight ambiance
      const torch1 = c.createRadialGradient(100, 100, 0, 100, 100, 120);
      torch1.addColorStop(0, '#ff880008');
      torch1.addColorStop(1, '#00000000');
      c.fillStyle = torch1;
      c.fillRect(0, 0, W, H);
      const torch2 = c.createRadialGradient(W-100, H-100, 0, W-100, H-100, 120);
      torch2.addColorStop(0, '#ff880008');
      torch2.addColorStop(1, '#00000000');
      c.fillStyle = torch2;
      c.fillRect(0, 0, W, H);

      c.strokeStyle = '#333'; c.lineWidth = 2; c.setLineDash([6, 6]);
      c.beginPath(); c.moveTo(HALF, 0); c.lineTo(HALF, H); c.stroke(); c.setLineDash([]);

      const pids = Object.keys(state.players);
      pids.forEach((pid, idx) => {
        const ox = idx * HALF;
        const p = state.players[pid];
        const isMe = pid === myId;
        const myEnemies = state.enemies[pid] ?? [];

        c.save();
        c.beginPath(); c.rect(ox, 0, HALF, H); c.clip();

        c.save();
        c.translate(ox - p.cameraX, 0);

        // Room dividers
        for (const room of state.building.rooms) {
          c.strokeStyle = '#222'; c.lineWidth = 1;
          c.beginPath(); c.moveTo(room.x, 0); c.lineTo(room.x, H); c.stroke();
        }

        // Platforms
        for (const room of state.building.rooms) {
          for (const plat of room.platforms) {
            drawPlatformBlock(c, plat.x, plat.y, plat.w, 8, '#555');
          }
        }

        // Exit zone
        const exitX = state.building.totalWidth - 20;
        const allDead = p.killCount >= state.building.totalEnemies;
        c.fillStyle = allDead ? '#00ff8844' : '#ff444422';
        c.fillRect(exitX, H - 500, 20, 470);
        drawLabel(c, allDead ? 'EXIT' : 'LOCKED', exitX + 10, H / 2, { color: allDead ? '#00ff88' : '#ff4444', font: '10px monospace' });

        // Enemies
        for (const e of myEnemies) {
          if (!e.alive) continue;
          drawSprite(c, 'opponent', e.x, e.y, ENEMY_W, ENEMY_H, { color: '#ff6644' });
        }

        // Player
        const color = isMe ? '#00ff88' : '#ff4488';
        if (p.dashTimer > 0) {
          // Dash trail
          c.globalAlpha = 0.4;
          drawSprite(c, isMe ? 'player' : 'opponent', p.x - p.facing * 15, p.y, PW, PH, { color });
          c.globalAlpha = 1;
        }
        drawSprite(c, isMe ? 'player' : 'opponent', p.x, p.y, PW, PH, { color, skin: pid });

        // Slash arc
        if (p.slashing > 0) {
          c.beginPath();
          c.arc(p.x + PW / 2 + p.facing * 10, p.y + PH / 2, 35, p.facing > 0 ? -0.8 : Math.PI - 0.8, p.facing > 0 ? 0.8 : Math.PI + 0.8);
          c.strokeStyle = '#ffffff66'; c.lineWidth = 3; c.stroke();
        }

        c.restore(); // camera

        // HUD
        drawLabel(c, isMe ? 'YOU' : 'OPPONENT', ox + HALF / 2, 18, { color: '#ffffff88', font: '12px monospace' });
        drawLabel(c, `${p.killCount} / ${state.building.totalEnemies}`, ox + HALF / 2, 38, { color: allDead ? '#00ff88' : '#ffffff', font: '16px monospace' });

        c.restore(); // clip
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
      <p className="controls-hint">A/D to move, W to jump, Space to dash-attack</p>
    </div>
  );
}
