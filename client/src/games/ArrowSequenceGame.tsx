import { useEffect, useRef } from 'react';
import { useSocket, useMyId } from '../context/SocketContext.tsx';
import { drawLabel, drawBackground } from '../lib/sprites.js';
import { applyStateUpdate, StateBuffer } from '../lib/net.js';

type Direction = 'up' | 'down' | 'left' | 'right';

interface PlayerState { currentSequence: number; inputIndex: number; completed: boolean; }
interface ArrowSequenceState {
  players: Record<string, PlayerState>;
  sequences: Direction[][];
  canvasWidth: number; canvasHeight: number; winner: string | null;
}

const ARROW_SIZE = 36, ARROW_GAP = 8, SEQ_GAP = 20;

function drawArrow(c: CanvasRenderingContext2D, cx: number, cy: number, size: number, dir: Direction, color: string) {
  c.save(); c.translate(cx, cy);
  const angle = dir === 'up' ? -Math.PI / 2 : dir === 'down' ? Math.PI / 2 : dir === 'left' ? Math.PI : 0;
  c.rotate(angle);
  const s = size * 0.4;
  c.beginPath();
  c.moveTo(s, 0); c.lineTo(-s * 0.4, -s * 0.7); c.lineTo(-s * 0.4, -s * 0.25);
  c.lineTo(-s, -s * 0.25); c.lineTo(-s, s * 0.25); c.lineTo(-s * 0.4, s * 0.25);
  c.lineTo(-s * 0.4, s * 0.7); c.closePath();
  c.fillStyle = color; c.fill();
  c.restore();
}

export default function ArrowSequenceGame() {
  const socket = useSocket();
  const myId = useMyId();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const interpRef = useRef(new StateBuffer<ArrowSequenceState>()).current;
  const flashRef = useRef<{ time: number; correct: boolean }>({ time: 0, correct: true });

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
      if (dir) {
        e.preventDefault();
        const state = interpRef.interpolate();
        if (state) {
          const p = state.players[myId];
          if (p && !p.completed) {
            const expected = state.sequences[p.currentSequence]?.[p.inputIndex];
            flashRef.current = { time: Date.now(), correct: dir === expected };
          }
        }
        socket.emit('game:input', { direction: dir });
      }
    }
    window.addEventListener('keydown', kd);
    return () => window.removeEventListener('keydown', kd);
  }, [socket, myId]);

  useEffect(() => {
    let animId: number;
    function draw() {
      const canvas = canvasRef.current;
      const c = canvas?.getContext('2d');
      const state = interpRef.interpolate();
      if (!canvas || !c || !state) { animId = requestAnimationFrame(draw); return; }

      const W = state.canvasWidth, H = state.canvasHeight, HALF = W / 2;
      canvas.width = W; canvas.height = H;

      drawBackground(c, 'arrow-sequence', W, H, { color: '#0a0a1a' });

      const flashAge = Date.now() - flashRef.current.time;
      const showFlash = flashAge < 200;

      // Divider
      c.strokeStyle = '#333'; c.lineWidth = 2; c.setLineDash([6, 6]);
      c.beginPath(); c.moveTo(HALF, 0); c.lineTo(HALF, H); c.stroke(); c.setLineDash([]);

      const pids = Object.keys(state.players);
      pids.forEach((pid, idx) => {
        const ox = idx * HALF;
        const p = state.players[pid];
        const isMe = pid === myId;

        c.save();
        c.beginPath(); c.rect(ox, 0, HALF, H); c.clip();

        if (isMe && showFlash) {
          c.fillStyle = flashRef.current.correct ? '#00ff8810' : '#ff448820';
          c.fillRect(ox, 0, HALF, H);
        }

        drawLabel(c, isMe ? 'YOU' : 'OPPONENT', ox + HALF / 2, 24, { color: '#ffffff88', font: '14px monospace' });
        drawLabel(c, p.completed ? 'DONE!' : `Sequence ${p.currentSequence + 1} / ${state.sequences.length}`, ox + HALF / 2, 50, { color: '#ffffff', font: '16px monospace' });

        const startY = 75;
        for (let seqIdx = 0; seqIdx < state.sequences.length; seqIdx++) {
          const seq = state.sequences[seqIdx];
          const seqW = seq.length * (ARROW_SIZE + ARROW_GAP) - ARROW_GAP;
          const seqX = ox + (HALF - seqW) / 2;
          const seqY = startY + seqIdx * (ARROW_SIZE + SEQ_GAP);
          const isCurrent = seqIdx === p.currentSequence;
          const isDone = seqIdx < p.currentSequence;
          const isFuture = seqIdx > p.currentSequence;

          for (let arrowIdx = 0; arrowIdx < seq.length; arrowIdx++) {
            const ax = seqX + arrowIdx * (ARROW_SIZE + ARROW_GAP) + ARROW_SIZE / 2;
            const ay = seqY + ARROW_SIZE / 2;

            let color: string;
            if (isDone || p.completed) color = '#00ff88';
            else if (isCurrent) {
              if (arrowIdx < p.inputIndex) color = '#00ff88';
              else if (arrowIdx === p.inputIndex) color = '#ffffff';
              else color = '#444444';
            } else color = '#333333';

            c.fillStyle = isCurrent && arrowIdx === p.inputIndex ? '#ffffff15' : '#ffffff08';
            c.fillRect(seqX + arrowIdx * (ARROW_SIZE + ARROW_GAP), seqY, ARROW_SIZE, ARROW_SIZE);

            if (!isFuture || p.completed) {
              drawArrow(c, ax, ay, ARROW_SIZE, seq[arrowIdx], color);
            } else {
              drawLabel(c, '?', ax, ay + 6, { color: '#333', font: '18px monospace' });
            }
          }

          drawLabel(c, `${seqIdx + 1}`, seqX - 8, seqY + ARROW_SIZE / 2 + 4, { color: isDone || p.completed ? '#00ff8888' : isCurrent ? '#ffffff88' : '#33333388', font: '10px monospace', align: 'right' });
        }

        c.restore();
      });

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
  }, [socket, myId]);

  return (
    <div className="game-container">
      <canvas ref={canvasRef} className="game-canvas" />
      <p className="controls-hint">Arrow Keys or WASD to input directions</p>
    </div>
  );
}
