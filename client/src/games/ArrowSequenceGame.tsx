import { useEffect, useRef } from 'react';
import { useSocket, useMyId } from '../context/SocketContext.tsx';

type Direction = 'up' | 'down' | 'left' | 'right';

interface PlayerState {
  currentSequence: number;
  inputIndex: number;
  completed: boolean;
}

interface ArrowSequenceState {
  players: Record<string, PlayerState>;
  sequences: Direction[][];
  canvasWidth: number;
  canvasHeight: number;
  winner: string | null;
}

const ARROW_SIZE = 36;
const ARROW_GAP = 8;
const SEQ_GAP = 20;

// Draw an arrow symbol
function drawArrow(
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

  const s = size * 0.4;
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

export default function ArrowSequenceGame() {
  const socket = useSocket();
  const myId = useMyId();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef<ArrowSequenceState | null>(null);
  const flashRef = useRef<{ time: number; correct: boolean }>({ time: 0, correct: true });

  useEffect(() => {
    socket.on('game:state', (s: ArrowSequenceState) => { stateRef.current = s; });
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
        // Check locally if correct for flash feedback
        const state = stateRef.current;
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
      const state = stateRef.current;
      if (!canvas || !c || !state) { animId = requestAnimationFrame(draw); return; }

      const W = state.canvasWidth, H = state.canvasHeight;
      canvas.width = W;
      canvas.height = H;

      c.fillStyle = '#0a0a1a';
      c.fillRect(0, 0, W, H);

      const pids = Object.keys(state.players);
      const HALF = W / 2;

      // Flash feedback
      const flashAge = Date.now() - flashRef.current.time;
      const showFlash = flashAge < 200;

      // Divider
      c.strokeStyle = '#333';
      c.lineWidth = 2;
      c.setLineDash([6, 6]);
      c.beginPath();
      c.moveTo(HALF, 0);
      c.lineTo(HALF, H);
      c.stroke();
      c.setLineDash([]);

      pids.forEach((pid, idx) => {
        const ox = idx * HALF;
        const p = state.players[pid];
        const isMe = pid === myId;

        c.save();
        c.beginPath();
        c.rect(ox, 0, HALF, H);
        c.clip();

        // Flash background on input
        if (isMe && showFlash) {
          c.fillStyle = flashRef.current.correct ? '#00ff8810' : '#ff448820';
          c.fillRect(ox, 0, HALF, H);
        }

        // Label
        c.fillStyle = '#ffffff88';
        c.font = '14px monospace';
        c.textAlign = 'center';
        c.fillText(isMe ? 'YOU' : 'OPPONENT', ox + HALF / 2, 24);

        // Progress: "Sequence 3/5"
        c.fillStyle = '#ffffff';
        c.font = '16px monospace';
        c.fillText(
          p.completed ? 'DONE!' : `Sequence ${p.currentSequence + 1} / ${state.sequences.length}`,
          ox + HALF / 2, 50,
        );

        // Draw sequences
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
            if (isDone || p.completed) {
              // Completed sequence — all green
              color = '#00ff88';
            } else if (isCurrent) {
              if (arrowIdx < p.inputIndex) {
                // Correctly entered
                color = '#00ff88';
              } else if (arrowIdx === p.inputIndex) {
                // Current arrow to input
                color = '#ffffff';
              } else {
                // Not yet reached
                color = '#444444';
              }
            } else {
              // Future sequence — dimmed
              color = '#333333';
            }

            // Draw background box
            c.fillStyle = isCurrent && arrowIdx === p.inputIndex ? '#ffffff15' : '#ffffff08';
            c.fillRect(seqX + arrowIdx * (ARROW_SIZE + ARROW_GAP), seqY, ARROW_SIZE, ARROW_SIZE);

            // Only show arrows for current and completed sequences (hide future)
            if (!isFuture || p.completed) {
              drawArrow(c, ax, ay, ARROW_SIZE, seq[arrowIdx], color);
            } else {
              // Question mark for future
              c.fillStyle = '#333';
              c.font = '18px monospace';
              c.textAlign = 'center';
              c.fillText('?', ax, ay + 6);
            }
          }

          // Sequence label
          c.fillStyle = isDone || p.completed ? '#00ff8888' : isCurrent ? '#ffffff88' : '#33333388';
          c.font = '10px monospace';
          c.textAlign = 'right';
          c.fillText(`${seqIdx + 1}`, seqX - 8, seqY + ARROW_SIZE / 2 + 4);
        }

        c.restore();
      });

      // Winner banner
      if (state.winner) {
        c.fillStyle = '#000000aa';
        c.fillRect(0, H / 2 - 30, W, 60);
        c.fillStyle = state.winner === myId ? '#00ff88' : '#ff4488';
        c.font = '28px monospace';
        c.textAlign = 'center';
        c.fillText(
          state.winner === myId ? 'YOU WIN!' : 'OPPONENT WINS!',
          W / 2, H / 2 + 8,
        );
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
