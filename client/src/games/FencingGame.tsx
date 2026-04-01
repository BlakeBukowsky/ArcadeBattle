import { useEffect, useRef } from 'react';
import { useSocket, useMyId } from '../context/SocketContext.tsx';
import { drawSprite, drawLabel, drawBackground } from '../lib/sprites.js';

const PLAYER_W = 20, PLAYER_H = 44, SWORD_LEN = 35, SWORD_W = 3;

interface PlayerState {
  x: number; y: number; facing: 1 | -1;
  guard: 'high' | 'mid' | 'low'; attacking: boolean; alive: boolean;
}
interface FencingState {
  players: Record<string, PlayerState>;
  cameraX: number; arenaWidth: number; viewWidth: number; viewHeight: number; floorY: number;
  endZones: Record<string, number>; winner: string | null;
}

function swordY(guard: string): number {
  return guard === 'high' ? 8 : guard === 'low' ? PLAYER_H - 10 : PLAYER_H / 2;
}

export default function FencingGame() {
  const socket = useSocket();
  const myId = useMyId();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef<FencingState | null>(null);

  useEffect(() => {
    socket.on('game:state', (s: FencingState) => { stateRef.current = s; });
    return () => { socket.off('game:state'); };
  }, [socket]);

  useEffect(() => {
    function kd(e: KeyboardEvent) {
      if (e.key === 'a' || e.key === 'ArrowLeft') socket.emit('game:input', { left: true });
      if (e.key === 'd' || e.key === 'ArrowRight') socket.emit('game:input', { right: true });
      if (e.key === 'w' || e.key === 'ArrowUp') { e.preventDefault(); socket.emit('game:input', { jump: true }); }
      if (e.key === ' ') { e.preventDefault(); socket.emit('game:input', { attack: true }); }
      if (e.key === 's' || e.key === 'ArrowDown') socket.emit('game:input', { cycleGuard: true });
    }
    function ku(e: KeyboardEvent) {
      if (e.key === 'a' || e.key === 'ArrowLeft') socket.emit('game:input', { left: false });
      if (e.key === 'd' || e.key === 'ArrowRight') socket.emit('game:input', { right: false });
      if (e.key === 'w' || e.key === 'ArrowUp') socket.emit('game:input', { jump: false });
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

      canvas.width = state.viewWidth;
      canvas.height = state.viewHeight;
      const cam = state.cameraX;

      drawBackground(c, 'fencing', state.viewWidth, state.viewHeight, { color: '#1a1a2e', scrollX: cam });

      // Floor
      drawSprite(c, 'platform', 0, state.floorY, state.viewWidth, state.viewHeight - state.floorY, { color: '#333' });

      // End zones
      drawSprite(c, 'cover', 0 - cam, state.floorY - 60, 20, 60, { color: '#ff448833' });
      drawSprite(c, 'cover', state.arenaWidth - 20 - cam, state.floorY - 60, 20, 60, { color: '#00ff8833' });

      // Progress bar
      const pids = Object.keys(state.players);
      c.fillStyle = '#222';
      c.fillRect(50, 10, state.viewWidth - 100, 6);
      pids.forEach((pid) => {
        const p = state.players[pid];
        const pct = p.x / state.arenaWidth;
        c.fillStyle = pid === myId ? '#00ff88' : '#ff4488';
        c.fillRect(50 + pct * (state.viewWidth - 100) - 3, 8, 6, 10);
      });

      // Players
      pids.forEach((pid) => {
        const p = state.players[pid];
        if (!p.alive) return;
        const sx = p.x - cam;
        const isMe = pid === myId;
        const color = isMe ? '#00ff88' : '#ff4488';

        drawSprite(c, isMe ? 'player' : 'opponent', sx, p.y, PLAYER_W, PLAYER_H, {
          color, facing: p.facing, skin: pid,
        });

        // Sword
        const sy = p.y + swordY(p.guard);
        const sLen = p.attacking ? SWORD_LEN + 10 : SWORD_LEN;
        drawSprite(c, 'sword', p.facing > 0 ? sx + PLAYER_W : sx - sLen, sy - SWORD_W / 2, sLen, SWORD_W, {
          color: p.attacking ? '#ffffff' : '#cccccc',
        });

        // Guard indicator
        drawLabel(c, p.guard.toUpperCase(), sx + PLAYER_W / 2, p.y - 4, { color: '#ffffff88', font: '9px monospace' });
      });

      animId = requestAnimationFrame(draw);
    }
    animId = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animId);
  }, [socket, myId]);

  return (
    <div className="game-container">
      <canvas ref={canvasRef} className="game-canvas" />
      <p className="controls-hint">A/D move, W jump, Space attack, S cycle guard (high/mid/low)</p>
    </div>
  );
}
