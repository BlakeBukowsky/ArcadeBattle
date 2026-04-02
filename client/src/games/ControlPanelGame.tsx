import { useEffect, useRef } from 'react';
import { useSocket, useMyId } from '../context/SocketContext.tsx';
import { drawLabel, drawBackground } from '../lib/sprites.js';
import { applyStateUpdate, StateBuffer } from '../lib/net.js';

type ControlType = 'button' | 'lever' | 'slider' | 'knob';
interface Control { id: string; name: string; type: ControlType; row: number; col: number; sliderMax?: number; knobOptions?: string[]; }
interface Command { text: string; controlId: string; action: string; targetValue?: number; }
interface PlayerState { currentCommand: number; completed: boolean; lastWrong: boolean; controlValues: Record<string, number>; }
interface ControlPanelState {
  players: Record<string, PlayerState>;
  controls: Control[];
  commands: Command[];
  totalCommands: number;
  canvasWidth: number; canvasHeight: number; winner: string | null;
}

const CTRL_W = 80, CTRL_H = 60, CTRL_GAP = 8, COLS = 4;

export default function ControlPanelGame() {
  const socket = useSocket();
  const myId = useMyId();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const interpRef = useRef(new StateBuffer<ControlPanelState>()).current;
  const flashRef = useRef<{ time: number; correct: boolean }>({ time: 0, correct: true });

  useEffect(() => {
    socket.on('game:state', (data: unknown) => { interpRef.push(applyStateUpdate(interpRef.latest(), data)); });
    return () => { socket.off('game:state'); };
  }, [socket]);

  function getControlBounds(ctrl: Control, ox: number, HALF: number) {
    const panelOx = ox + (HALF - COLS * (CTRL_W + CTRL_GAP) + CTRL_GAP) / 2;
    const panelOy = 140;
    return {
      x: panelOx + ctrl.col * (CTRL_W + CTRL_GAP),
      y: panelOy + ctrl.row * (CTRL_H + CTRL_GAP),
      w: CTRL_W,
      h: CTRL_H,
    };
  }

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    function onClick(e: MouseEvent) {
      const rect = canvas!.getBoundingClientRect();
      const state = interpRef.latest();
      if (!state) return;
      const W = state.canvasWidth, HALF = W / 2;
      const mx = (e.clientX - rect.left) * (W / rect.width);
      const my = (e.clientY - rect.top) * (state.canvasHeight / rect.height);

      const pids = Object.keys(state.players);
      const myIdx = pids.indexOf(myId);
      const ox = myIdx * HALF;
      if (mx < ox || mx > ox + HALF) return;

      const p = state.players[myId];
      if (!p) return;

      for (const ctrl of state.controls) {
        const b = getControlBounds(ctrl, ox, HALF);
        if (mx >= b.x && mx <= b.x + b.w && my >= b.y && my <= b.y + b.h) {
          if (ctrl.type === 'button' || ctrl.type === 'lever') {
            const cmd = state.commands[p.currentCommand];
            flashRef.current = { time: Date.now(), correct: cmd?.controlId === ctrl.id && cmd?.action === 'press' };
            socket.emit('game:input', { controlId: ctrl.id });
          } else if (ctrl.type === 'slider') {
            // Click position maps to slider value
            const relX = (mx - b.x) / b.w;
            const val = Math.round(relX * (ctrl.sliderMax ?? 9));
            socket.emit('game:input', { controlId: ctrl.id, sliderValue: val });
            const cmd = state.commands[p.currentCommand];
            flashRef.current = { time: Date.now(), correct: cmd?.controlId === ctrl.id && cmd?.targetValue === val };
          } else if (ctrl.type === 'knob') {
            // Cycle to next option
            const current = p.controlValues[ctrl.id] ?? 0;
            const max = (ctrl.knobOptions?.length ?? 4) - 1;
            const next = (current + 1) % (max + 1);
            socket.emit('game:input', { controlId: ctrl.id, knobValue: next });
            const cmd = state.commands[p.currentCommand];
            flashRef.current = { time: Date.now(), correct: cmd?.controlId === ctrl.id && cmd?.targetValue === next };
          }
          break;
        }
      }
    }

    canvas.addEventListener('click', onClick);
    return () => canvas.removeEventListener('click', onClick);
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

      drawBackground(c, 'control-panel', W, H, { color: '#1a1a20' });

      c.strokeStyle = '#333'; c.lineWidth = 2; c.setLineDash([6, 6]);
      c.beginPath(); c.moveTo(HALF, 0); c.lineTo(HALF, H); c.stroke(); c.setLineDash([]);

      const flashAge = Date.now() - flashRef.current.time;
      const showFlash = flashAge < 200;

      const pids = Object.keys(state.players);
      pids.forEach((pid, idx) => {
        const ox = idx * HALF;
        const p = state.players[pid];
        const isMe = pid === myId;

        c.save();
        c.beginPath(); c.rect(ox, 0, HALF, H); c.clip();

        if (isMe && showFlash) {
          c.fillStyle = flashRef.current.correct ? '#00ff8815' : '#ff448825';
          c.fillRect(ox, 0, HALF, H);
        }

        drawLabel(c, isMe ? 'YOU' : 'OPPONENT', ox + HALF / 2, 18, { color: '#ffffff88', font: '12px monospace' });

        // Current command
        if (p.currentCommand < state.commands.length) {
          if (isMe) {
            drawLabel(c, state.commands[p.currentCommand].text, ox + HALF / 2, 55, { color: '#ffcc00', font: '18px monospace' });
          } else {
            drawLabel(c, `Command ${p.currentCommand + 1}/${state.totalCommands}`, ox + HALF / 2, 55, { color: '#888', font: '14px monospace' });
          }
        }

        // Progress bar
        drawLabel(c, `${p.currentCommand} / ${state.totalCommands}`, ox + HALF / 2, 80, { color: '#ffffff', font: '14px monospace' });
        const barW = HALF - 40;
        c.fillStyle = '#222'; c.fillRect(ox + 20, 90, barW, 8);
        c.fillStyle = isMe ? '#00ff88' : '#ff4488';
        c.fillRect(ox + 20, 90, barW * (p.currentCommand / state.totalCommands), 8);

        // Panel background
        const panelOx = ox + (HALF - COLS * (CTRL_W + CTRL_GAP) + CTRL_GAP) / 2;
        const panelOy = 140;
        const panelW = COLS * (CTRL_W + CTRL_GAP) + 12;
        const panelH = 3 * (CTRL_H + CTRL_GAP) + 12;
        c.fillStyle = '#2a2a30'; c.fillRect(panelOx - 10, panelOy - 10, panelW, panelH);
        c.strokeStyle = '#444'; c.lineWidth = 2; c.strokeRect(panelOx - 10, panelOy - 10, panelW, panelH);

        // Controls
        for (const ctrl of state.controls) {
          const bx = panelOx + ctrl.col * (CTRL_W + CTRL_GAP);
          const by = panelOy + ctrl.row * (CTRL_H + CTRL_GAP);
          const val = p.controlValues[ctrl.id] ?? 0;

          c.fillStyle = '#3a3a4a';
          c.fillRect(bx, by, CTRL_W, CTRL_H);

          if (ctrl.type === 'button') {
            c.beginPath(); c.arc(bx + CTRL_W / 2, by + 22, 14, 0, Math.PI * 2);
            c.fillStyle = '#cc4444'; c.fill();
            c.strokeStyle = '#aa3333'; c.lineWidth = 2; c.stroke();
          } else if (ctrl.type === 'lever') {
            c.fillStyle = '#666'; c.fillRect(bx + CTRL_W / 2 - 3, by + 8, 6, 30);
            c.beginPath(); c.arc(bx + CTRL_W / 2, by + 10, 6, 0, Math.PI * 2);
            c.fillStyle = '#888'; c.fill();
          } else if (ctrl.type === 'slider') {
            // Slider track
            const trackY = by + 22;
            c.fillStyle = '#222'; c.fillRect(bx + 8, trackY, CTRL_W - 16, 6);
            // Slider handle
            const max = ctrl.sliderMax ?? 9;
            const handleX = bx + 8 + (val / max) * (CTRL_W - 16);
            c.fillStyle = '#4488ff'; c.fillRect(handleX - 4, trackY - 4, 8, 14);
            // Value label
            drawLabel(c, `${val}`, bx + CTRL_W / 2, trackY + 22, { color: '#4488ff', font: '11px monospace' });
          } else if (ctrl.type === 'knob') {
            // Knob circle
            const kcx = bx + CTRL_W / 2, kcy = by + 20;
            c.beginPath(); c.arc(kcx, kcy, 12, 0, Math.PI * 2);
            c.fillStyle = '#555'; c.fill();
            c.strokeStyle = '#777'; c.lineWidth = 2; c.stroke();
            // Position dot
            const opts = ctrl.knobOptions ?? ['A', 'B', 'C', 'D'];
            const angle = -Math.PI / 2 + (val / (opts.length - 1)) * Math.PI;
            c.beginPath();
            c.arc(kcx + Math.cos(angle) * 8, kcy + Math.sin(angle) * 8, 3, 0, Math.PI * 2);
            c.fillStyle = '#ffcc00'; c.fill();
            // Current option label
            drawLabel(c, opts[val] ?? '?', kcx, kcy + 26, { color: '#ffcc00', font: '9px monospace' });
          }

          // Control name
          drawLabel(c, ctrl.name, bx + CTRL_W / 2, by + CTRL_H - 3, { color: '#ccc', font: '8px monospace' });
        }

        // Wrong flash
        if (isMe && p.lastWrong && flashAge < 500) {
          drawLabel(c, 'WRONG!', ox + HALF / 2, panelOy + panelH + 8, { color: '#ff4444', font: '16px monospace' });
        }

        if (p.completed) {
          drawLabel(c, 'DONE!', ox + HALF / 2, H - 20, { color: '#00ff88', font: '20px monospace' });
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
      <p className="controls-hint">Click buttons/levers, click slider to set value, click knob to cycle options</p>
    </div>
  );
}
