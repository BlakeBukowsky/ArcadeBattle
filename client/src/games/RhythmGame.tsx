import { useEffect, useRef } from 'react';
import { useSocket, useMyId } from '../context/SocketContext.tsx';

type Direction = 'up' | 'down' | 'left' | 'right';

interface Arrow { id: number; direction: Direction; y: number; }
interface PlayerState {
  misses: number; hits: number; alive: boolean;
  lastHitResult: 'perfect' | 'good' | 'miss' | null;
  lastHitTime: number;
}
interface RhythmState {
  players: Record<string, PlayerState>;
  arrows: Arrow[];
  speed: number;
  canvasWidth: number; canvasHeight: number;
  hitZoneY: number;
  winner: string | null;
  playerArrowState: Record<string, Record<number, 'hit' | 'missed'>>;
}

const ARROW_SIZE = 36;
const LANE_WIDTH = 50;
const LANE_DIRS: Direction[] = ['left', 'down', 'up', 'right'];

function dirToLane(dir: Direction): number {
  return LANE_DIRS.indexOf(dir);
}

function drawArrowShape(
  c: CanvasRenderingContext2D,
  cx: number, cy: number, size: number,
  dir: Direction, color: string,
) {
  c.save();
  c.translate(cx, cy);
  const angle = dir === 'up' ? -Math.PI / 2
    : dir === 'down' ? Math.PI / 2
    : dir === 'left' ? Math.PI
    : 0;
  c.rotate(angle);
  const s = size * 0.38;
  c.beginPath();
  c.moveTo(s, 0);
  c.lineTo(-s * 0.4, -s * 0.7);
  c.lineTo(-s * 0.4, -s * 0.25);
  c.lineTo(-s, -s * 0.25);
  c.lineTo(-s, s * 0.25);
  c.lineTo(-s * 0.4, s * 0.25);
  c.lineTo(-s * 0.4, s * 0.7);
  c.closePath();
  c.fillStyle = color;
  c.fill();
  c.restore();
}

export default function RhythmGame() {
  const socket = useSocket();
  const myId = useMyId();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef<RhythmState | null>(null);

  useEffect(() => {
    socket.on('game:state', (s: RhythmState) => { stateRef.current = s; });
    return () => { socket.off('game:state'); };
  }, [socket]);

  useEffect(() => {
    function kd(e: KeyboardEvent) {
      let dir: string | null = null;
      if (e.key === 'ArrowUp' || e.key === 'w') dir = 'up';
      if (e.key === 'ArrowDown' || e.key === 's') dir = 'down';
      if (e.key === 'ArrowLeft' || e.key === 'a') dir = 'left';
      if (e.key === 'ArrowRight' || e.key === 'd') dir = 'right';
      if (dir) {
        e.preventDefault();
        socket.emit('game:input', { direction: dir });
      }
    }
    window.addEventListener('keydown', kd);
    return () => window.removeEventListener('keydown', kd);
  }, [socket]);

  useEffect(() => {
    let animId: number;
    function draw() {
      const canvas = canvasRef.current;
      const c = canvas?.getContext('2d');
      const state = stateRef.current;
      if (!canvas || !c || !state) { animId = requestAnimationFrame(draw); return; }

      const W = state.canvasWidth, H = state.canvasHeight;
      const HALF = W / 2;
      canvas.width = W;
      canvas.height = H;

      c.fillStyle = '#0a0a1a';
      c.fillRect(0, 0, W, H);

      // Divider
      c.strokeStyle = '#333';
      c.lineWidth = 2;
      c.setLineDash([6, 6]);
      c.beginPath(); c.moveTo(HALF, 0); c.lineTo(HALF, H); c.stroke();
      c.setLineDash([]);

      const pids = Object.keys(state.players);
      const LANE_TOTAL = LANE_DIRS.length * LANE_WIDTH;

      pids.forEach((pid, idx) => {
        const ox = idx * HALF;
        const p = state.players[pid];
        const isMe = pid === myId;
        const pas = state.playerArrowState[pid] ?? {};
        const lanesX = ox + (HALF - LANE_TOTAL) / 2;

        c.save();
        c.beginPath(); c.rect(ox, 0, HALF, H); c.clip();

        // Lane lines
        for (let i = 0; i <= LANE_DIRS.length; i++) {
          c.strokeStyle = '#1a1a2e';
          c.lineWidth = 1;
          c.beginPath();
          c.moveTo(lanesX + i * LANE_WIDTH, 0);
          c.lineTo(lanesX + i * LANE_WIDTH, H);
          c.stroke();
        }

        // Hit zone line
        c.strokeStyle = '#ffffff44';
        c.lineWidth = 2;
        c.beginPath();
        c.moveTo(lanesX, state.hitZoneY);
        c.lineTo(lanesX + LANE_TOTAL, state.hitZoneY);
        c.stroke();

        // Hit zone target outlines
        for (let i = 0; i < LANE_DIRS.length; i++) {
          const tx = lanesX + i * LANE_WIDTH + LANE_WIDTH / 2;
          drawArrowShape(c, tx, state.hitZoneY, ARROW_SIZE, LANE_DIRS[i], '#ffffff18');
        }

        // Arrows
        for (const arrow of state.arrows) {
          const arrowState = pas[arrow.id];
          if (arrowState === 'hit') continue; // don't draw hit arrows

          const lane = dirToLane(arrow.direction);
          const ax = lanesX + lane * LANE_WIDTH + LANE_WIDTH / 2;

          let color: string;
          if (arrowState === 'missed') {
            color = '#ff444444'; // faded red
          } else {
            // Color based on distance to hit zone
            const dist = Math.abs(arrow.y - state.hitZoneY);
            if (dist < 16) color = '#00ff88'; // close — green
            else if (dist < 40) color = '#ffff00'; // medium — yellow
            else color = '#ffffff'; // far — white
          }

          drawArrowShape(c, ax, arrow.y, ARROW_SIZE, arrow.direction, color);
        }

        // Hit result flash
        const resultAge = Date.now() - (p.lastHitTime * (1000 / 60));
        if (p.lastHitResult && resultAge < 500) {
          const alpha = Math.max(0, 1 - resultAge / 500);
          c.globalAlpha = alpha;
          c.font = '16px monospace';
          c.textAlign = 'center';
          if (p.lastHitResult === 'perfect') {
            c.fillStyle = '#00ff88';
            c.fillText('PERFECT', ox + HALF / 2, state.hitZoneY + 40);
          } else if (p.lastHitResult === 'good') {
            c.fillStyle = '#ffff00';
            c.fillText('GOOD', ox + HALF / 2, state.hitZoneY + 40);
          } else {
            c.fillStyle = '#ff4444';
            c.fillText('MISS', ox + HALF / 2, state.hitZoneY + 40);
          }
          c.globalAlpha = 1;
        }

        // Label
        c.fillStyle = '#ffffff88';
        c.font = '14px monospace';
        c.textAlign = 'center';
        c.fillText(isMe ? 'YOU' : 'OPPONENT', ox + HALF / 2, 20);

        // Stats
        c.fillStyle = '#ffffff';
        c.font = '14px monospace';
        c.textAlign = 'left';
        c.fillText(`Hits: ${p.hits}`, ox + 10, 44);

        // Misses as hearts/X's
        c.textAlign = 'right';
        const maxMisses = 3;
        let missDisplay = '';
        for (let i = 0; i < maxMisses; i++) {
          missDisplay += i < p.misses ? 'X ' : '♥ ';
        }
        c.fillStyle = p.misses >= 2 ? '#ff4444' : '#ff8888';
        c.fillText(missDisplay.trim(), ox + HALF - 10, 44);

        // Dead overlay
        if (!p.alive) {
          c.fillStyle = '#00000088';
          c.fillRect(ox, 0, HALF, H);
          c.fillStyle = '#ff4444';
          c.font = '24px monospace';
          c.textAlign = 'center';
          c.fillText('OUT!', ox + HALF / 2, H / 2);
        }

        c.restore();
      });

      // Speed indicator
      c.fillStyle = '#ffaa00';
      c.font = '12px monospace';
      c.textAlign = 'center';
      c.fillText(`Speed: ${state.speed.toFixed(1)}`, W / 2, H - 8);

      animId = requestAnimationFrame(draw);
    }
    animId = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animId);
  }, [socket, myId]);

  return (
    <div className="game-container">
      <canvas ref={canvasRef} className="game-canvas" />
      <p className="controls-hint">Arrow Keys or WASD — hit arrows as they reach the line</p>
    </div>
  );
}
