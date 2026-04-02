import { useEffect, useRef } from 'react';
import { useSocket, useMyId } from '../context/SocketContext.tsx';
import { drawSprite, drawSpriteCircle, drawLabel, drawBackground } from '../lib/sprites.js';
import { applyStateUpdate, StateBuffer } from '../lib/net.js';

const WINDOW_W = 45, WINDOW_H = 45;
const WINDOW_Y_START = 35, WINDOW_ROW_GAP = 70;
const WINDOW_COLS = 4, WINDOW_MARGIN = 80;
const PLAYER_W = 30, PLAYER_H = 50, PLAYER_Y = 430;
const COVER_W = 50, COVER_H = 55, COVER_Y = 435;

interface Bandit { id: number; col: number; row: number; visible: boolean; windingUp: boolean; }
interface Projectile { x: number; y: number; vx: number; vy: number; fromBandit: boolean; }
interface PlayerState { peeking: boolean; cursorX: number; cursorY: number; kills: number; stunned: boolean; baseX: number; }
interface CowboyState {
  players: Record<string, PlayerState>;
  bandits: Bandit[]; projectiles: Projectile[];
  timeRemaining: number; canvasWidth: number; canvasHeight: number; winner: string | null;
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
      const state = interpRef.interpolate(); if (!state) return;
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

      drawBackground(c, 'cowboy-shootout', W, H, { color: '#3a2a1a' });
      // Sky
      drawSprite(c, 'cover', 0, 0, W, 35, { color: '#1a1a3e' });

      // Windows
      for (const bandit of state.bandits) {
        const wx = windowCenterX(bandit.col) - WINDOW_W / 2;
        const wy = WINDOW_Y_START + bandit.row * WINDOW_ROW_GAP;

        drawSprite(c, 'cover', wx - 4, wy - 4, WINDOW_W + 8, WINDOW_H + 8, { color: '#222' });
        drawSprite(c, 'cover', wx, wy, WINDOW_W, WINDOW_H, { color: '#0a0a1a' });

        if (bandit.visible) {
          drawSprite(c, 'bandit', wx + 10, wy + 12, WINDOW_W - 20, WINDOW_H - 18, {
            color: bandit.windingUp ? '#ff4444' : '#cc8844',
          });
          drawSprite(c, 'bandit', wx + 6, wy + 6, WINDOW_W - 12, 10, { color: '#442200' }); // hat
          if (bandit.windingUp) {
            c.strokeStyle = '#ff0000'; c.lineWidth = 2;
            c.strokeRect(wx - 2, wy - 2, WINDOW_W + 4, WINDOW_H + 4);
          }
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

        drawSprite(c, 'cover', p.baseX - 5, COVER_Y, COVER_W, COVER_H, { color: '#6a5a3a' });
        drawSprite(c, 'cover', p.baseX - 5, COVER_Y, COVER_W, 4, { color: '#7a6a4a' });

        if (p.peeking) {
          drawSprite(c, isMe ? 'player' : 'opponent', p.baseX + COVER_W - 10, PLAYER_Y - 10, 20, PLAYER_H, { color, skin: pid });
          drawSprite(c, 'bullet', p.baseX + COVER_W + 5, PLAYER_Y, 15, 4, { color: '#aaa' }); // gun
        }

        if (p.stunned) {
          c.fillStyle = '#ff000033';
          c.beginPath(); c.arc(p.baseX + PLAYER_W / 2, PLAYER_Y + PLAYER_H / 2, 30, 0, Math.PI * 2); c.fill();
          drawLabel(c, 'STUNNED', p.baseX + PLAYER_W / 2, PLAYER_Y - 20, { color: '#ff4444', font: '12px monospace' });
        }

        drawLabel(c, `${isMe ? 'You' : 'Opp'}: ${p.kills}`, p.baseX + PLAYER_W / 2, H - 8, { color, font: '14px monospace' });
      });

      // Projectiles
      for (const proj of state.projectiles) {
        drawSpriteCircle(c, 'bullet', proj.x, proj.y, 3, { color: proj.fromBandit ? '#ff6644' : '#ffff00' });
        c.beginPath(); c.moveTo(proj.x, proj.y); c.lineTo(proj.x - proj.vx * 3, proj.y - proj.vy * 3);
        c.strokeStyle = proj.fromBandit ? '#ff664444' : '#ffff0044'; c.lineWidth = 2; c.stroke();
      }

      // Crosshairs — both players
      const allPids = Object.keys(state.players);
      for (const pid of allPids) {
        const p = state.players[pid];
        if (!p.peeking || p.stunned) continue;
        const isMe = pid === myId;
        const cursorColor = isMe ? '#ff000088' : '#ff448866';
        const size = isMe ? 12 : 8;
        c.strokeStyle = cursorColor; c.lineWidth = isMe ? 1 : 1;
        c.beginPath();
        c.moveTo(p.cursorX - size, p.cursorY); c.lineTo(p.cursorX + size, p.cursorY);
        c.moveTo(p.cursorX, p.cursorY - size); c.lineTo(p.cursorX, p.cursorY + size);
        c.stroke();
        c.beginPath(); c.arc(p.cursorX, p.cursorY, isMe ? 7 : 5, 0, Math.PI * 2); c.stroke();
      }

      // Timer
      drawLabel(c, `${state.timeRemaining.toFixed(0)}s`, W / 2, 25, {
        color: state.timeRemaining < 10 ? '#ff4444' : '#ffffff', font: '24px monospace',
      });

      // Divider
      c.strokeStyle = '#555'; c.lineWidth = 2;
      c.beginPath(); c.moveTo(W / 2, PLAYER_Y - 10); c.lineTo(W / 2, H); c.stroke();

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
