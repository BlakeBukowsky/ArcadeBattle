import { useEffect, useRef } from 'react';
import { useSocket, useMyId } from '../context/SocketContext.tsx';
import { drawSprite, drawSpriteCircle, drawLabel, drawBackground } from '../lib/sprites.js';
import { applyStateUpdate, StateBuffer } from '../lib/net.js';

const WINDOW_W = 50, WINDOW_H = 50;
const WINDOW_Y_START = 40, WINDOW_ROW_GAP = 70;
const WINDOW_COLS = 4, WINDOW_MARGIN = 80;
const PLAYER_W = 28, PLAYER_H = 45, PLAYER_Y = 435;
const COVER_W = 45, COVER_H = 50;

interface Bandit { windowRow: number; windowCol: number; alive: boolean; peeking: boolean; shooting: boolean; }
interface Projectile { x: number; y: number; vx: number; vy: number; fromBandit: boolean; }
interface PlayerState { peeking: boolean; cursorX: number; cursorY: number; kills: number; lives: number; alive: boolean; baseX: number; }
interface CowboyState {
  players: Record<string, PlayerState>;
  bandit: Bandit;
  banditsRemaining: number;
  projectiles: Projectile[];
  canvasWidth: number; canvasHeight: number; winner: string | null;
  windows: { row: number; col: number }[];
}

function windowCenterX(col: number): number {
  return WINDOW_MARGIN + col * ((800 - WINDOW_MARGIN * 2) / (WINDOW_COLS - 1));
}

export default function CowboyShootoutGame() {
  const socket = useSocket();
  const myId = useMyId();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const interpRef = useRef(new StateBuffer<CowboyState>()).current;

  useEffect(() => {
    socket.on('game:state', (data: unknown) => { interpRef.push(applyStateUpdate(interpRef.latest(), data)); });
    return () => { socket.off('game:state'); };
  }, [socket]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let last = 0;
    function onMove(e: MouseEvent) {
      const now = Date.now(); if (now - last < 33) return; last = now;
      const rect = canvas!.getBoundingClientRect();
      const state = interpRef.latest(); if (!state) return;
      socket.emit('game:input', {
        x: (e.clientX - rect.left) * (state.canvasWidth / rect.width),
        y: (e.clientY - rect.top) * (state.canvasHeight / rect.height),
      });
    }
    function onDown(e: MouseEvent) {
      e.preventDefault();
      if (e.button === 2) socket.emit('game:input', { peek: true });
      else if (e.button === 0) socket.emit('game:input', { shoot: true });
    }
    function onUp(e: MouseEvent) { if (e.button === 2) socket.emit('game:input', { peek: false }); }
    function noctx(e: Event) { e.preventDefault(); }
    canvas.addEventListener('mousemove', onMove);
    canvas.addEventListener('mousedown', onDown);
    canvas.addEventListener('mouseup', onUp);
    canvas.addEventListener('contextmenu', noctx);
    return () => { canvas.removeEventListener('mousemove', onMove); canvas.removeEventListener('mousedown', onDown); canvas.removeEventListener('mouseup', onUp); canvas.removeEventListener('contextmenu', noctx); };
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

      // Building
      drawBackground(c, 'cowboy-shootout', W, H, { color: '#3a2a1a' });

      // Desert sky glow
      const skyGlow = c.createLinearGradient(0, 0, 0, H * 0.3);
      skyGlow.addColorStop(0, '#4a2a1a15');
      skyGlow.addColorStop(1, '#00000000');
      c.fillStyle = skyGlow;
      c.fillRect(0, 0, W, H);

      drawSprite(c, 'cover', 0, 0, W, 35, { color: '#1a1a3e' }); // sky

      // All windows
      for (const w of state.windows) {
        const wx = windowCenterX(w.col) - WINDOW_W / 2;
        const wy = WINDOW_Y_START + w.row * WINDOW_ROW_GAP;
        drawSprite(c, 'cover', wx - 4, wy - 4, WINDOW_W + 8, WINDOW_H + 8, { color: '#222' });
        drawSprite(c, 'cover', wx, wy, WINDOW_W, WINDOW_H, { color: '#0a0a1a' });
      }

      // Bandit
      const b = state.bandit;
      if (b.alive && b.peeking) {
        const bwx = windowCenterX(b.windowCol) - WINDOW_W / 2;
        const bwy = WINDOW_Y_START + b.windowRow * WINDOW_ROW_GAP;
        drawSprite(c, 'bandit', bwx + 10, bwy + 10, WINDOW_W - 20, WINDOW_H - 15, {
          color: b.shooting ? '#ff4444' : '#cc8844',
        });
        drawSprite(c, 'bandit', bwx + 6, bwy + 5, WINDOW_W - 12, 10, { color: '#442200' }); // hat
        if (b.shooting) {
          c.strokeStyle = '#ff0000'; c.lineWidth = 2;
          c.strokeRect(bwx - 2, bwy - 2, WINDOW_W + 4, WINDOW_H + 4);
        }
      }

      // Ground
      drawSprite(c, 'platform', 0, PLAYER_Y - 10, W, H - PLAYER_Y + 10, { color: '#5a4a2a' });

      // Players + cover
      const pids = Object.keys(state.players);
      pids.forEach((pid) => {
        const p = state.players[pid];
        const isMe = pid === myId;
        const color = isMe ? '#00ff88' : '#ff4488';

        // Cover block
        drawSprite(c, 'cover', p.baseX - 5, PLAYER_Y, COVER_W, COVER_H, { color: '#6a5a3a' });
        drawSprite(c, 'cover', p.baseX - 5, PLAYER_Y, COVER_W, 4, { color: '#7a6a4a' });

        if (p.peeking && p.alive) {
          drawSprite(c, isMe ? 'player' : 'opponent', p.baseX + COVER_W - 10, PLAYER_Y - 10, 20, PLAYER_H, { color, skin: pid });
          drawSprite(c, 'bullet', p.baseX + COVER_W + 5, PLAYER_Y, 15, 4, { color: '#aaa' });
        }

        if (!p.alive) {
          drawLabel(c, 'DEAD', p.baseX + PLAYER_W / 2, PLAYER_Y - 20, { color: '#ff4444', font: '12px monospace' });
        }

        // Lives
        let livesStr = '';
        for (let i = 0; i < 3; i++) livesStr += i < p.lives ? '\u2665 ' : 'X ';
        drawLabel(c, livesStr.trim(), p.baseX + PLAYER_W / 2, H - 8, { color: p.lives <= 1 ? '#ff4444' : '#ff8888', font: '14px monospace' });

        // Kills
        drawLabel(c, `${isMe ? 'You' : 'Opp'}: ${p.kills}`, p.baseX + PLAYER_W / 2, H - 24, { color, font: '12px monospace' });
      });

      // Projectiles
      for (const proj of state.projectiles) {
        drawSpriteCircle(c, 'bullet', proj.x, proj.y, 3, { color: proj.fromBandit ? '#ff6644' : '#ffff00' });
        c.beginPath(); c.moveTo(proj.x, proj.y); c.lineTo(proj.x - proj.vx * 3, proj.y - proj.vy * 3);
        c.strokeStyle = proj.fromBandit ? '#ff664444' : '#ffff0044'; c.lineWidth = 2; c.stroke();
      }

      // Both players' crosshairs
      pids.forEach((pid) => {
        const p = state.players[pid];
        if (!p.peeking || !p.alive) return;
        const isMe = pid === myId;
        const sz = isMe ? 12 : 8;
        c.strokeStyle = isMe ? '#ff000088' : '#ff448866'; c.lineWidth = 1;
        c.beginPath();
        c.moveTo(p.cursorX - sz, p.cursorY); c.lineTo(p.cursorX + sz, p.cursorY);
        c.moveTo(p.cursorX, p.cursorY - sz); c.lineTo(p.cursorX, p.cursorY + sz);
        c.stroke();
        c.beginPath(); c.arc(p.cursorX, p.cursorY, isMe ? 7 : 5, 0, Math.PI * 2); c.stroke();
      });

      // HUD
      drawLabel(c, `Bandits: ${state.banditsRemaining}`, W / 2, 25, { color: '#ffaa00', font: '16px monospace' });

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
      <canvas ref={canvasRef} className="game-canvas" style={{ cursor: 'crosshair' }} />
      <p className="controls-hint">Right-click to peek, Left-click to shoot — kill all 7 bandits!</p>
    </div>
  );
}
