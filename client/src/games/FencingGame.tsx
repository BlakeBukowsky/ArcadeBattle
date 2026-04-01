import { useEffect, useRef } from 'react';
import { useSocket, useMyId } from '../context/SocketContext.tsx';

const PLAYER_W = 20, PLAYER_H = 44, SWORD_LEN = 35, SWORD_W = 3;

interface PlayerState {
  x: number; y: number; facing: 1 | -1;
  guard: 'high' | 'mid' | 'low';
  attacking: boolean; alive: boolean;
}
interface FencingState {
  players: Record<string, PlayerState>;
  cameraX: number;
  arenaWidth: number; viewWidth: number; viewHeight: number; floorY: number;
  endZones: Record<string, number>;
  winner: string | null;
}

function swordY(guard: string): number {
  switch (guard) {
    case 'high': return 8;
    case 'mid': return PLAYER_H / 2;
    case 'low': return PLAYER_H - 10;
    default: return PLAYER_H / 2;
  }
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

      // Background
      c.fillStyle = '#1a1a2e';
      c.fillRect(0, 0, state.viewWidth, state.viewHeight);

      // Floor
      c.fillStyle = '#333';
      c.fillRect(0, state.floorY - cam * 0 , state.viewWidth, state.viewHeight - state.floorY);

      // End zones
      const pids = Object.keys(state.players);
      // Left end zone (p1's base / p2's target)
      c.fillStyle = '#ff448833';
      c.fillRect(0 - cam, state.floorY - 60, 20, 60);
      // Right end zone
      c.fillStyle = '#00ff8833';
      c.fillRect(state.arenaWidth - 20 - cam, state.floorY - 60, 20, 60);

      // Progress bar at top showing position in arena
      const barY = 10, barH = 6;
      c.fillStyle = '#222';
      c.fillRect(50, barY, state.viewWidth - 100, barH);
      pids.forEach((pid) => {
        const p = state.players[pid];
        const pct = p.x / state.arenaWidth;
        const color = pid === myId ? '#00ff88' : '#ff4488';
        c.fillStyle = color;
        c.fillRect(50 + pct * (state.viewWidth - 100) - 3, barY - 2, 6, barH + 4);
      });

      // Players
      pids.forEach((pid) => {
        const p = state.players[pid];
        if (!p.alive) return;
        const sx = p.x - cam;
        const color = pid === myId ? '#00ff88' : '#ff4488';

        // Body
        c.fillStyle = color;
        c.fillRect(sx, p.y, PLAYER_W, PLAYER_H);

        // Sword
        const sy = p.y + swordY(p.guard);
        const swordX = p.facing > 0 ? sx + PLAYER_W : sx - SWORD_LEN;
        const sLen = p.attacking ? SWORD_LEN + 10 : SWORD_LEN;

        c.fillStyle = p.attacking ? '#ffffff' : '#cccccc';
        c.fillRect(
          p.facing > 0 ? sx + PLAYER_W : sx - sLen,
          sy - SWORD_W / 2,
          sLen,
          SWORD_W
        );

        // Guard indicator
        c.fillStyle = '#ffffff88';
        c.font = '9px monospace';
        c.textAlign = 'center';
        c.fillText(p.guard.toUpperCase(), sx + PLAYER_W / 2, p.y - 4);
      });

      animId = requestAnimationFrame(draw);
    }
    animId = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animId);
  }, [socket]);

  return (
    <div className="game-container">
      <canvas ref={canvasRef} className="game-canvas" />
      <p className="controls-hint">A/D move, W jump, Space attack, S cycle guard (high/mid/low)</p>
    </div>
  );
}
