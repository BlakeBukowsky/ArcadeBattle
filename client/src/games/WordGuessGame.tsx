import { useEffect, useRef } from 'react';
import { useSocket, useMyId } from '../context/SocketContext.tsx';
import { drawLabel, drawBackground } from '../lib/sprites.js';
import { applyStateUpdate, StateBuffer } from '../lib/net.js';

type LetterResult = 'correct' | 'present' | 'absent';
interface Guess { word: string; results: LetterResult[]; }
interface PlayerState { guesses: Guess[]; currentInput: string; solved: boolean; }
interface WordGuessState {
  players: Record<string, PlayerState>;
  wordLength: number;
  canvasWidth: number; canvasHeight: number; winner: string | null;
}

const CELL = 42, GAP = 4;
const RESULT_COLORS: Record<string, string> = { correct: '#538d4e', present: '#b59f3b', absent: '#3a3a3c' };

export default function WordGuessGame() {
  const socket = useSocket();
  const myId = useMyId();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const interpRef = useRef(new StateBuffer<WordGuessState>()).current;

  useEffect(() => {
    socket.on('game:state', (data: unknown) => { interpRef.push(applyStateUpdate(interpRef.latest(), data)); });
    return () => { socket.off('game:state'); };
  }, [socket]);

  useEffect(() => {
    function kd(e: KeyboardEvent) {
      if (e.key === 'Backspace') { e.preventDefault(); socket.emit('game:input', { backspace: true }); }
      else if (e.key === 'Enter') { e.preventDefault(); socket.emit('game:input', { submit: true }); }
      else if (e.key.length === 1 && e.key.match(/[a-zA-Z]/)) { socket.emit('game:input', { char: e.key }); }
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
      const WL = state.wordLength;
      canvas.width = W; canvas.height = H;

      drawBackground(c, 'word-guess', W, H, { color: '#121213' });

      c.strokeStyle = '#333'; c.lineWidth = 2; c.setLineDash([6, 6]);
      c.beginPath(); c.moveTo(HALF, 0); c.lineTo(HALF, H); c.stroke(); c.setLineDash([]);

      const pids = Object.keys(state.players);
      pids.forEach((pid, idx) => {
        const ox = idx * HALF;
        const p = state.players[pid];
        const isMe = pid === myId;
        const rowW = WL * (CELL + GAP) - GAP;
        const startX = ox + (HALF - rowW) / 2;
        let y = 50;

        c.save();
        c.beginPath(); c.rect(ox, 0, HALF, H); c.clip();

        drawLabel(c, isMe ? 'YOU' : 'OPPONENT', ox + HALF / 2, 18, { color: '#ffffff88', font: '12px monospace' });
        drawLabel(c, `${p.guesses.length} guesses`, ox + HALF / 2, 35, { color: '#888', font: '11px monospace' });

        // Show last 8 guesses (scroll if more)
        const visibleGuesses = p.guesses.slice(-8);
        for (const guess of visibleGuesses) {
          for (let i = 0; i < WL; i++) {
            const cx = startX + i * (CELL + GAP);
            c.fillStyle = RESULT_COLORS[guess.results[i]];
            c.fillRect(cx, y, CELL, CELL);

            // Show letters only for own guesses
            if (isMe) {
              c.fillStyle = '#ffffff';
              c.font = '20px monospace';
              c.textAlign = 'center';
              c.fillText(guess.word[i], cx + CELL / 2, y + CELL / 2 + 7);
            }
          }
          y += CELL + GAP;
        }

        // Current input row (own side only)
        if (isMe && !p.solved) {
          for (let i = 0; i < WL; i++) {
            const cx = startX + i * (CELL + GAP);
            c.strokeStyle = i < p.currentInput.length ? '#888' : '#3a3a3c';
            c.lineWidth = 2;
            c.strokeRect(cx, y, CELL, CELL);

            if (i < p.currentInput.length) {
              c.fillStyle = '#ffffff';
              c.font = '20px monospace';
              c.textAlign = 'center';
              c.fillText(p.currentInput[i], cx + CELL / 2, y + CELL / 2 + 7);
            }
          }
        }

        if (p.solved) {
          drawLabel(c, 'SOLVED!', ox + HALF / 2, H - 30, { color: '#538d4e', font: '18px monospace' });
        }

        c.restore();
      });

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
      <p className="controls-hint">Type letters, Enter to submit, Backspace to delete</p>
    </div>
  );
}
