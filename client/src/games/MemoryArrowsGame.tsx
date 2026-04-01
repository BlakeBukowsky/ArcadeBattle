import { useEffect, useRef } from 'react';
import { useSocket, useMyId } from '../context/SocketContext.tsx';
import { drawLabel, drawBackground } from '../lib/sprites.js';
import { applyStateUpdate, StateBuffer } from '../lib/net.js';

type Direction = 'up' | 'down' | 'left' | 'right';

interface PlayerState { inputIndex: number; alive: boolean; failed: boolean; completedRound: boolean; }
interface MemoryState {
  phase: 'watch' | 'input' | 'result';
  sequence: Direction[];
  revealIndex: number;
  round: number;
  players: Record<string, PlayerState>;
  canvasWidth: number; canvasHeight: number;
  winner: string | null;
}

const ARROW_SIZE = 50;
const DIR_COLORS: Record<string, string> = {
  up: '#00ff88',
  down: '#4488ff',
  left: '#ff4444',
  right: '#ffcc00',
};

function drawArrow(c: CanvasRenderingContext2D, cx: number, cy: number, size: number, dir: Direction, color: string) {
  c.save(); c.translate(cx, cy);
  const angle = dir === 'up' ? -Math.PI / 2 : dir === 'down' ? Math.PI / 2 : dir === 'left' ? Math.PI : 0;
  c.rotate(angle);
  const s = size * 0.4;
  c.beginPath();
  c.moveTo(s, 0); c.lineTo(-s * 0.4, -s * 0.7); c.lineTo(-s * 0.4, -s * 0.25);
  c.lineTo(-s, -s * 0.25); c.lineTo(-s, s * 0.25); c.lineTo(-s * 0.4, s * 0.25);
  c.lineTo(-s * 0.4, s * 0.7); c.closePath();
  c.fillStyle = color; c.fill(); c.restore();
}

export default function MemoryArrowsGame() {
  const socket = useSocket();
  const myId = useMyId();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const interpRef = useRef(new StateBuffer<MemoryState>()).current;

  useEffect(() => {
    socket.on('game:state', (data: unknown) => { interpRef.push(applyStateUpdate(interpRef.latest(), data)); });
    return () => { socket.off('game:state'); };
  }, [socket]);

  useEffect(() => {
    function kd(e: KeyboardEvent) {
      let dir: string | null = null;
      if (e.key === 'ArrowUp' || e.key === 'w') dir = 'up';
      if (e.key === 'ArrowDown' || e.key === 's') dir = 'down';
      if (e.key === 'ArrowLeft' || e.key === 'a') dir = 'left';
      if (e.key === 'ArrowRight' || e.key === 'd') dir = 'right';
      if (dir) { e.preventDefault(); socket.emit('game:input', { direction: dir }); }
    }
    window.addEventListener('keydown', kd);
    return () => window.removeEventListener('keydown', kd);
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

      drawBackground(c, 'memory-arrows', W, H, { color: '#0a0a1a' });

      // Divider
      c.strokeStyle = '#333'; c.lineWidth = 2; c.setLineDash([6, 6]);
      c.beginPath(); c.moveTo(HALF, 0); c.lineTo(HALF, H); c.stroke(); c.setLineDash([]);

      const pids = Object.keys(state.players);

      // During watch phase — show the sequence being revealed in the CENTER (shared)
      if (state.phase === 'watch') {
        drawLabel(c, `Round ${state.round} — WATCH`, W / 2, 30, { color: '#ffcc00', font: '20px monospace' });
        drawLabel(c, `${state.revealIndex} / ${state.sequence.length}`, W / 2, 55, { color: '#ffffff88', font: '14px monospace' });

        // Show revealed arrows in a row
        const seqW = state.sequence.length * (ARROW_SIZE + 8) - 8;
        const seqX = (W - seqW) / 2;

        for (let i = 0; i < state.sequence.length; i++) {
          const ax = seqX + i * (ARROW_SIZE + 8) + ARROW_SIZE / 2;
          const ay = H / 2;

          if (i < state.revealIndex) {
            // Revealed
            const dir = state.sequence[i];
            const isCurrent = i === state.revealIndex - 1;
            drawArrow(c, ax, ay, isCurrent ? ARROW_SIZE * 1.2 : ARROW_SIZE, dir, DIR_COLORS[dir]);
          } else {
            // Not yet revealed
            c.fillStyle = '#222';
            c.fillRect(ax - ARROW_SIZE / 2 + 5, ay - ARROW_SIZE / 2 + 5, ARROW_SIZE - 10, ARROW_SIZE - 10);
            drawLabel(c, '?', ax, ay + 5, { color: '#444', font: '20px monospace' });
          }
        }
      }

      // During input/result phase — show per-player progress
      if (state.phase === 'input' || state.phase === 'result') {
        drawLabel(c, state.phase === 'input' ? `Round ${state.round} — INPUT` : `Round ${state.round} — RESULT`, W / 2, 30, {
          color: state.phase === 'input' ? '#00ff88' : '#ffcc00', font: '20px monospace',
        });

        pids.forEach((pid, idx) => {
          const ox = idx * HALF;
          const p = state.players[pid];
          const isMe = pid === myId;

          c.save();
          c.beginPath(); c.rect(ox, 0, HALF, H); c.clip();

          drawLabel(c, isMe ? 'YOU' : 'OPPONENT', ox + HALF / 2, 55, { color: '#ffffff88', font: '14px monospace' });

          // Status
          if (p.failed) {
            drawLabel(c, 'FAILED!', ox + HALF / 2, 80, { color: '#ff4444', font: '16px monospace' });
          } else if (p.completedRound) {
            drawLabel(c, 'CORRECT!', ox + HALF / 2, 80, { color: '#00ff88', font: '16px monospace' });
          } else if (!p.alive) {
            drawLabel(c, 'OUT', ox + HALF / 2, 80, { color: '#ff4444', font: '16px monospace' });
          }

          // Show sequence with progress
          const seqLen = state.sequence.length;
          const arrowS = Math.min(ARROW_SIZE, (HALF - 40) / seqLen - 4);
          const totalW = seqLen * (arrowS + 4) - 4;
          const startX = ox + (HALF - totalW) / 2;
          const y = H / 2 + 20;

          for (let i = 0; i < seqLen; i++) {
            const ax = startX + i * (arrowS + 4) + arrowS / 2;
            const dir = state.sequence[i];

            if (i < p.inputIndex) {
              // Correctly entered — show colored
              drawArrow(c, ax, y, arrowS, dir, DIR_COLORS[dir]);
            } else if (isMe) {
              // Not yet entered — for local player, hide the answer
              c.fillStyle = '#ffffff11';
              c.fillRect(ax - arrowS / 2 + 2, y - arrowS / 2 + 2, arrowS - 4, arrowS - 4);
              drawLabel(c, '?', ax, y + 5, { color: '#333', font: `${Math.max(10, arrowS * 0.4)}px monospace` });
            } else {
              // Opponent — also hide
              c.fillStyle = '#ffffff08';
              c.fillRect(ax - arrowS / 2 + 2, y - arrowS / 2 + 2, arrowS - 4, arrowS - 4);
            }
          }

          // Progress counter
          drawLabel(c, `${p.inputIndex} / ${seqLen}`, ox + HALF / 2, y + arrowS / 2 + 30, {
            color: '#ffffff88', font: '14px monospace',
          });

          c.restore();
        });
      }

      // Color legend at bottom
      const legendY = H - 25;
      const dirs: Direction[] = ['up', 'down', 'left', 'right'];
      const labels = ['↑ Up', '↓ Down', '← Left', '→ Right'];
      dirs.forEach((dir, i) => {
        const lx = W / 2 - 160 + i * 90;
        drawArrow(c, lx, legendY, 16, dir, DIR_COLORS[dir]);
        drawLabel(c, labels[i], lx + 18, legendY + 4, { color: '#666', font: '10px monospace', align: 'left' });
      });

      // Winner
      if (state.winner) {
        c.fillStyle = '#000000aa'; c.fillRect(0, H / 2 - 30, W, 60);
        drawLabel(c, state.winner === myId ? 'YOU WIN!' : 'OPPONENT WINS!', W / 2, H / 2 + 8, {
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
      <p className="controls-hint">Watch the sequence, then repeat it with Arrow Keys or WASD</p>
    </div>
  );
}
