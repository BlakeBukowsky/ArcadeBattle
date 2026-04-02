import { useEffect, useRef } from 'react';
import { useSocket, useMyId } from '../context/SocketContext.tsx';
import { drawSprite, drawLabel, drawBackground } from '../lib/sprites.js';
import { drawPlatformBlock } from '../lib/draw-helpers.js';
import { applyStateUpdate, StateBuffer } from '../lib/net.js';

const PW = 14, PH = 18, HALF_W = 400;

interface Plat { x: number; y: number; w: number; t: 'solid' | 'spike' | 'moving'; }
interface Level { platforms: Plat[]; exitY: number; }
interface PlayerState {
  x: number; y: number; alive: boolean; currentLevel: number;
  completed: boolean; cameraY: number; dashTimer: number;
}
interface ClimberState {
  players: Record<string, PlayerState>;
  levels: Level[];
  tick: number; timeout: number | null;
  canvasWidth: number; canvasHeight: number;
  winner: string | null; isFinalLevel: boolean;
}

export default function MountainClimberGame() {
  const socket = useSocket();
  const myId = useMyId();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const interpRef = useRef(new StateBuffer<ClimberState>()).current;

  useEffect(() => {
    socket.on('game:state', (data: unknown) => { interpRef.push(applyStateUpdate(interpRef.latest(), data)); });
    return () => { socket.off('game:state'); };
  }, [socket]);

  useEffect(() => {
    function kd(e: KeyboardEvent) {
      if (e.key === 'a' || e.key === 'ArrowLeft') socket.emit('game:input', { left: true });
      if (e.key === 'd' || e.key === 'ArrowRight') socket.emit('game:input', { right: true });
      if (e.key === 'w' || e.key === ' ' || e.key === 'ArrowUp') { e.preventDefault(); socket.emit('game:input', { jump: true }); }
      if (e.key === 'Shift') { e.preventDefault(); socket.emit('game:input', { dash: true }); }
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

      drawBackground(c, 'mountain-climber', W, H, { color: '#0a0a1a' });

      // Depth gradient — lighter sky at top, darker cave depths at bottom
      const caveGrad = c.createLinearGradient(0, 0, 0, H);
      caveGrad.addColorStop(0, '#1a1a2a08');
      caveGrad.addColorStop(1, '#00000000');
      c.fillStyle = caveGrad;
      c.fillRect(0, 0, W, H);

      c.strokeStyle = '#333'; c.lineWidth = 2; c.setLineDash([6, 6]);
      c.beginPath(); c.moveTo(HALF, 0); c.lineTo(HALF, H); c.stroke(); c.setLineDash([]);

      const pids = Object.keys(state.players);
      pids.forEach((pid, idx) => {
        const ox = idx * HALF;
        const p = state.players[pid];
        const isMe = pid === myId;

        c.save();
        c.beginPath(); c.rect(ox, 0, HALF, H); c.clip();

        if (!p.alive) {
          drawLabel(c, 'DEAD', ox + HALF / 2, H / 2, { color: '#ff4444', font: '24px monospace' });
          c.restore(); return;
        }

        const level = state.levels[p.currentLevel];
        if (!level) { c.restore(); return; }

        c.save();
        c.translate(ox, -p.cameraY);

        // Platforms
        for (const plat of level.platforms) {
          const color = plat.t === 'spike' ? '#ff4444' : plat.t === 'moving' ? '#4488ff' : '#666';
          if (plat.t === 'solid' || plat.t === 'moving') {
            drawPlatformBlock(c, plat.x, plat.y, plat.w, 8, color);
          } else {
            drawSprite(c, 'platform', plat.x, plat.y, plat.w, 8, { color });
          }
          if (plat.t === 'spike') {
            // Draw spikes as triangles
            for (let sx = plat.x; sx < plat.x + plat.w; sx += 10) {
              c.beginPath(); c.moveTo(sx, plat.y); c.lineTo(sx + 5, plat.y - 8); c.lineTo(sx + 10, plat.y); c.fillStyle = '#ff4444'; c.fill();
            }
          }
        }

        // Exit
        c.fillStyle = '#00ff8844';
        c.fillRect(HALF_W / 2 - 20, level.exitY - 20, 40, 20);
        drawLabel(c, 'EXIT', HALF_W / 2, level.exitY - 8, { color: '#00ff88', font: '10px monospace' });

        // Player
        const color = isMe ? '#00ff88' : '#ff4488';
        if (p.dashTimer > 0) {
          c.globalAlpha = 0.7;
          drawSprite(c, isMe ? 'player' : 'opponent', p.x, p.y, PW, PH, { color: '#ffffff' });
          c.globalAlpha = 1;
        } else {
          drawSprite(c, isMe ? 'player' : 'opponent', p.x, p.y, PW, PH, { color, skin: pid });
        }

        c.restore(); // camera

        // HUD
        drawLabel(c, isMe ? 'YOU' : 'OPPONENT', ox + HALF / 2, 18, { color: '#ffffff88', font: '12px monospace' });
        drawLabel(c, `Level ${p.currentLevel + 1} / ${state.levels.length}`, ox + HALF / 2, 38, { color: '#ffffff', font: '14px monospace' });

        if (state.isFinalLevel && p.currentLevel === state.levels.length - 1) {
          drawLabel(c, 'FINAL RACE!', ox + HALF / 2, 56, { color: '#ffaa00', font: '12px monospace' });
        }

        c.restore(); // clip
      });

      // Timeout
      if (state.timeout !== null) {
        drawLabel(c, `${Math.ceil(state.timeout)}s`, W / 2, H - 15, { color: state.timeout < 4 ? '#ff4444' : '#ffaa00', font: '18px monospace' });
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
      <p className="controls-hint">A/D to move, W/Space to jump, Shift to dash — wall-jump off edges!</p>
    </div>
  );
}
