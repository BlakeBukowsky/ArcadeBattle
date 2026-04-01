import { useEffect, useRef } from 'react';
import { useSocket, useMyId } from '../context/SocketContext.tsx';

const WINDOW_W = 50, WINDOW_H = 55;
const WINDOW_Y_START = 50, WINDOW_ROW_GAP = 90;
const WINDOW_ROWS = 2, WINDOW_COLS = 4;
const WINDOW_MARGIN = 80;
const PLAYER_W = 30, PLAYER_H = 50;
const PLAYER_Y = 430;
const COVER_Y = 435, COVER_H = 55, COVER_W = 50;

interface Bandit { id: number; col: number; row: number; visible: boolean; windingUp: boolean; targetPlayer: string | null; }
interface Projectile { x: number; y: number; vx: number; vy: number; fromBandit: boolean; }
interface PlayerState { peeking: boolean; cursorX: number; cursorY: number; kills: number; stunned: boolean; baseX: number; }
interface CowboyState {
  players: Record<string, PlayerState>;
  bandits: Bandit[];
  projectiles: Projectile[];
  timeRemaining: number;
  canvasWidth: number; canvasHeight: number;
  winner: string | null;
}

function windowCenterX(col: number): number {
  return WINDOW_MARGIN + col * ((800 - WINDOW_MARGIN * 2) / (WINDOW_COLS - 1));
}

function windowCenterY(row: number): number {
  return WINDOW_Y_START + row * WINDOW_ROW_GAP + WINDOW_H / 2;
}

export default function CowboyShootoutGame() {
  const socket = useSocket();
  const myId = useMyId();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef<CowboyState | null>(null);

  useEffect(() => {
    socket.on('game:state', (s: CowboyState) => { stateRef.current = s; });
    return () => { socket.off('game:state'); };
  }, [socket]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let lastSend = 0;
    function handleMove(e: MouseEvent) {
      const now = Date.now();
      if (now - lastSend < 33) return;
      lastSend = now;
      const rect = canvas!.getBoundingClientRect();
      const state = stateRef.current;
      if (!state) return;
      const x = (e.clientX - rect.left) * (state.canvasWidth / rect.width);
      const y = (e.clientY - rect.top) * (state.canvasHeight / rect.height);
      socket.emit('game:input', { x, y });
    }
    function handleDown(e: MouseEvent) {
      e.preventDefault();
      if (e.button === 2) socket.emit('game:input', { peek: true });
      else if (e.button === 0) socket.emit('game:input', { shoot: true });
    }
    function handleUp(e: MouseEvent) {
      if (e.button === 2) socket.emit('game:input', { peek: false });
    }
    function noContext(e: Event) { e.preventDefault(); }

    canvas.addEventListener('mousemove', handleMove);
    canvas.addEventListener('mousedown', handleDown);
    canvas.addEventListener('mouseup', handleUp);
    canvas.addEventListener('contextmenu', noContext);
    return () => {
      canvas.removeEventListener('mousemove', handleMove);
      canvas.removeEventListener('mousedown', handleDown);
      canvas.removeEventListener('mouseup', handleUp);
      canvas.removeEventListener('contextmenu', noContext);
    };
  }, [socket]);

  useEffect(() => {
    let animId: number;
    function draw() {
      const canvas = canvasRef.current;
      const c = canvas?.getContext('2d');
      const state = stateRef.current;
      if (!canvas || !c || !state) { animId = requestAnimationFrame(draw); return; }

      const W = state.canvasWidth, H = state.canvasHeight;
      canvas.width = W; canvas.height = H;

      // Building
      c.fillStyle = '#3a2a1a';
      c.fillRect(0, 0, W, H);

      // Sky
      c.fillStyle = '#1a1a3e';
      c.fillRect(0, 0, W, 35);

      // Windows
      for (const bandit of state.bandits) {
        const wx = windowCenterX(bandit.col) - WINDOW_W / 2;
        const wy = WINDOW_Y_START + bandit.row * WINDOW_ROW_GAP;

        // Frame
        c.fillStyle = '#222';
        c.fillRect(wx - 4, wy - 4, WINDOW_W + 8, WINDOW_H + 8);
        c.fillStyle = '#0a0a1a';
        c.fillRect(wx, wy, WINDOW_W, WINDOW_H);

        if (bandit.visible) {
          // Bandit body
          c.fillStyle = bandit.windingUp ? '#ff4444' : '#cc8844';
          c.fillRect(wx + 10, wy + 12, WINDOW_W - 20, WINDOW_H - 18);
          // Hat
          c.fillStyle = '#442200';
          c.fillRect(wx + 6, wy + 6, WINDOW_W - 12, 10);

          // Winding up indicator — flash
          if (bandit.windingUp) {
            c.strokeStyle = '#ff0000';
            c.lineWidth = 2;
            c.strokeRect(wx - 2, wy - 2, WINDOW_W + 4, WINDOW_H + 4);
          }
        }
      }

      // Ground
      c.fillStyle = '#5a4a2a';
      c.fillRect(0, PLAYER_Y - 10, W, H - PLAYER_Y + 10);

      // Players and their cover
      const pids = Object.keys(state.players);
      pids.forEach((pid) => {
        const p = state.players[pid];
        const isMe = pid === myId;
        const color = isMe ? '#00ff88' : '#ff4488';

        // Cover block
        c.fillStyle = '#6a5a3a';
        c.fillRect(p.baseX - 5, COVER_Y, COVER_W, COVER_H);
        c.fillStyle = '#7a6a4a';
        c.fillRect(p.baseX - 5, COVER_Y, COVER_W, 4);

        // Player (only visible when peeking)
        if (p.peeking) {
          c.fillStyle = color;
          c.fillRect(p.baseX + COVER_W - 10, PLAYER_Y - 10, 20, PLAYER_H);
          // Gun
          c.fillStyle = '#aaa';
          c.fillRect(p.baseX + COVER_W + 5, PLAYER_Y, 15, 4);
        }

        // Stun effect
        if (p.stunned) {
          c.fillStyle = '#ff000033';
          c.beginPath();
          c.arc(p.baseX + PLAYER_W / 2, PLAYER_Y + PLAYER_H / 2, 30, 0, Math.PI * 2);
          c.fill();
          c.fillStyle = '#ff4444';
          c.font = '12px monospace';
          c.textAlign = 'center';
          c.fillText('STUNNED', p.baseX + PLAYER_W / 2, PLAYER_Y - 20);
        }

        // Label + kills
        c.fillStyle = color;
        c.font = '14px monospace';
        c.textAlign = 'center';
        c.fillText(`${isMe ? 'You' : 'Opp'}: ${p.kills}`, p.baseX + PLAYER_W / 2, H - 8);
      });

      // Projectiles
      for (const proj of state.projectiles) {
        c.beginPath();
        c.arc(proj.x, proj.y, 3, 0, Math.PI * 2);
        c.fillStyle = proj.fromBandit ? '#ff6644' : '#ffff00';
        c.fill();
        // Trail
        c.beginPath();
        c.moveTo(proj.x, proj.y);
        c.lineTo(proj.x - proj.vx * 3, proj.y - proj.vy * 3);
        c.strokeStyle = proj.fromBandit ? '#ff664444' : '#ffff0044';
        c.lineWidth = 2;
        c.stroke();
      }

      // Crosshair for local player
      const me = state.players[myId];
      if (me && me.peeking && !me.stunned) {
        const cx = me.cursorX, cy = me.cursorY;
        c.strokeStyle = '#ff000088';
        c.lineWidth = 1;
        c.beginPath();
        c.moveTo(cx - 12, cy); c.lineTo(cx + 12, cy);
        c.moveTo(cx, cy - 12); c.lineTo(cx, cy + 12);
        c.stroke();
        c.beginPath(); c.arc(cx, cy, 7, 0, Math.PI * 2); c.stroke();
      }

      // Timer
      c.fillStyle = state.timeRemaining < 10 ? '#ff4444' : '#ffffff';
      c.font = '24px monospace'; c.textAlign = 'center';
      c.fillText(`${state.timeRemaining.toFixed(0)}s`, W / 2, 25);

      animId = requestAnimationFrame(draw);
    }
    animId = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animId);
  }, [socket, myId]);

  return (
    <div className="game-container">
      <canvas ref={canvasRef} className="game-canvas" style={{ cursor: 'crosshair' }} />
      <p className="controls-hint">Right-click to peek from cover, Left-click to shoot</p>
    </div>
  );
}
