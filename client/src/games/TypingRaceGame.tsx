import { useEffect, useRef } from 'react';
import { useSocket, useMyId } from '../context/SocketContext.tsx';
import { drawLabel, drawBackground } from '../lib/sprites.js';
import { applyStateUpdate, StateBuffer } from '../lib/net.js';

interface PlayerState { currentSentence: number; inputIndex: number; completed: boolean; lastCorrect: boolean; }
interface TypingRaceState {
  players: Record<string, PlayerState>;
  sentences: string[];
  canvasWidth: number; canvasHeight: number;
  winner: string | null;
}

const CHAR_W = 11;
const SENTENCE_GAP = 60;

export default function TypingRaceGame() {
  const socket = useSocket();
  const myId = useMyId();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const interpRef = useRef(new StateBuffer<TypingRaceState>()).current;
  const flashRef = useRef<{ time: number; correct: boolean }>({ time: 0, correct: true });

  useEffect(() => {
    socket.on('game:state', (data: unknown) => { interpRef.push(applyStateUpdate(interpRef.latest(), data)); });
    return () => { socket.off('game:state'); };
  }, [socket]);

  useEffect(() => {
    function kd(e: KeyboardEvent) {
      if (e.key.length === 1) {
        e.preventDefault();
        const state = interpRef.latest();
        if (state) {
          const p = state.players[myId];
          if (p && !p.completed) {
            const expected = state.sentences[p.currentSentence]?.[p.inputIndex];
            flashRef.current = { time: Date.now(), correct: e.key === expected };
          }
        }
        socket.emit('game:input', { char: e.key });
      }
    }
    window.addEventListener('keydown', kd);
    return () => window.removeEventListener('keydown', kd);
  }, [socket, myId, interpRef]);

  useEffect(() => {
    let animId: number;
    function draw() {
      const canvas = canvasRef.current;
      const c = canvas?.getContext('2d');
      const state = interpRef.interpolate();
      if (!canvas || !c || !state) { animId = requestAnimationFrame(draw); return; }

      const W = state.canvasWidth, H = state.canvasHeight, HALF = W / 2;
      canvas.width = W; canvas.height = H;

      drawBackground(c, 'typing-race', W, H, { color: '#0a0a1a' });

      // Divider
      c.strokeStyle = '#333'; c.lineWidth = 2; c.setLineDash([6, 6]);
      c.beginPath(); c.moveTo(HALF, 0); c.lineTo(HALF, H); c.stroke(); c.setLineDash([]);

      const flashAge = Date.now() - flashRef.current.time;
      const showFlash = flashAge < 150;

      const pids = Object.keys(state.players);
      pids.forEach((pid, idx) => {
        const ox = idx * HALF;
        const p = state.players[pid];
        const isMe = pid === myId;

        c.save();
        c.beginPath(); c.rect(ox, 0, HALF, H); c.clip();

        // Opponent side tint
        if (!isMe) {
          c.fillStyle = '#ff448808';
          c.fillRect(ox, 0, HALF, H);
        }

        // Flash background
        if (isMe && showFlash) {
          c.fillStyle = flashRef.current.correct ? '#00ff8810' : '#ff448825';
          c.fillRect(ox, 0, HALF, H);
        }

        drawLabel(c, isMe ? 'YOU' : 'OPPONENT', ox + HALF / 2, 22, { color: '#ffffff88', font: '14px monospace' });
        drawLabel(c, p.completed ? 'DONE!' : `Sentence ${p.currentSentence + 1} / ${state.sentences.length}`, ox + HALF / 2, 46, { color: '#ffffff', font: '16px monospace' });

        // Draw sentences
        const startY = 70;
        for (let si = 0; si < state.sentences.length; si++) {
          const sentence = state.sentences[si];
          const isCurrent = si === p.currentSentence;
          const isDone = si < p.currentSentence;
          const isFuture = si > p.currentSentence;
          const y = startY + si * SENTENCE_GAP;

          // Sentence number
          drawLabel(c, `${si + 1}`, ox + 12, y + 14, {
            color: isDone || p.completed ? '#00ff8888' : isCurrent ? '#ffffff88' : '#33333388',
            font: '10px monospace', align: 'right',
          });

          if (isFuture && !p.completed) {
            drawLabel(c, '???', ox + 24, y + 14, { color: '#333', font: '14px monospace', align: 'left' });
            continue;
          }

          // Draw each character
          const maxCharsPerLine = Math.floor((HALF - 30) / CHAR_W);
          for (let ci = 0; ci < sentence.length; ci++) {
            const row = Math.floor(ci / maxCharsPerLine);
            const col = ci % maxCharsPerLine;
            const cx = ox + 24 + col * CHAR_W;
            const cy = y + 14 + row * 18;

            const doneColor = isMe ? '#00ff88' : '#ff4488';
            let color: string;
            if (isDone || p.completed) {
              color = doneColor;
            } else if (isCurrent) {
              if (ci < p.inputIndex) color = doneColor;
              else if (ci === p.inputIndex) color = '#ffffff';
              else color = '#555555';
            } else {
              color = '#333333';
            }

            // Highlight current char
            if (isCurrent && ci === p.inputIndex) {
              c.fillStyle = '#ffffff22';
              c.fillRect(cx - 1, cy - 12, CHAR_W, 16);
            }

            c.fillStyle = color;
            c.font = '14px monospace';
            c.textAlign = 'left';
            c.fillText(sentence[ci], cx, cy);
          }
        }

        c.restore();
      });

      // Winner banner
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
      <p className="controls-hint">Type the sentences — wrong character resets the current one</p>
    </div>
  );
}
