import { useEffect, useRef } from 'react';
import { useSocket, useMyId } from '../context/SocketContext.tsx';
import { drawSpriteCircle, drawSprite, drawLabel, drawBackground } from '../lib/sprites.js';
import { drawShinySphere } from '../lib/draw-helpers.js';
import { applyStateUpdate, StateBuffer } from '../lib/net.js';

const PUCK_R = 12, MALLET_R = 20;

interface AirHockeyState {
  puck: { x: number; y: number };
  mallets: Record<string, { x: number; y: number }>;
  scores: Record<string, number>;
  canvasWidth: number; canvasHeight: number;
  goalWidth: number; paused: boolean;
}

export default function AirHockeyGame() {
  const socket = useSocket();
  const myId = useMyId();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const interpRef = useRef(new StateBuffer<AirHockeyState>()).current;
  const mouseRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  useEffect(() => {
    socket.on('game:state', (data: unknown) => { interpRef.push(applyStateUpdate(interpRef.latest(), data)); });
    return () => { socket.off('game:state'); };
  }, [socket]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let last = 0;
    function onMove(e: MouseEvent) {
      const now = Date.now(); if (now - last < 16) return; last = now;
      const rect = canvas!.getBoundingClientRect();
      const state = interpRef.interpolate(); if (!state) return;
      const mx = (e.clientX - rect.left) * (state.canvasWidth / rect.width);
      const my = (e.clientY - rect.top) * (state.canvasHeight / rect.height);
      mouseRef.current = { x: mx, y: my };
      socket.emit('game:input', { x: mx, y: my });
    }
    canvas.addEventListener('mousemove', onMove);
    return () => canvas.removeEventListener('mousemove', onMove);
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
      const goalTop = (H - state.goalWidth) / 2;

      drawBackground(c, 'air-hockey', W, H, { color: '#1a3a2e' });

      // Table surface lines
      c.strokeStyle = '#ffffff06';
      c.lineWidth = 1;
      for (let lx = 40; lx < W; lx += 40) {
        c.beginPath(); c.moveTo(lx, 0); c.lineTo(lx, H); c.stroke();
      }
      for (let ly = 40; ly < H; ly += 40) {
        c.beginPath(); c.moveTo(0, ly); c.lineTo(W, ly); c.stroke();
      }

      // Center line + circle (procedural)
      c.setLineDash([6, 6]); c.strokeStyle = '#ffffff22'; c.lineWidth = 2;
      c.beginPath(); c.moveTo(W / 2, 0); c.lineTo(W / 2, H); c.stroke(); c.setLineDash([]);
      c.beginPath(); c.arc(W / 2, H / 2, 50, 0, Math.PI * 2); c.stroke();

      // Goals
      drawSprite(c, 'cover', 0, goalTop, 6, state.goalWidth, { color: '#ff444466' });
      drawSprite(c, 'cover', W - 6, goalTop, 6, state.goalWidth, { color: '#ff444466' });

      // Puck
      drawShinySphere(c, state.puck.x, state.puck.y, PUCK_R, '#ffffff');

      // Mallets
      const pids = Object.keys(state.mallets);
      pids.forEach((pid) => {
        const m = state.mallets[pid];
        drawSpriteCircle(c, 'mallet', m.x, m.y, MALLET_R, {
          color: pid === myId ? '#00ff88' : '#ff4488',
          skin: pid,
        });
        // Inner ring highlight
        c.beginPath(); c.arc(m.x, m.y, MALLET_R * 0.4, 0, Math.PI * 2);
        c.fillStyle = '#ffffff44'; c.fill();
      });

      // Show cursor position when mouse is on opponent's side
      const mouse = mouseRef.current;
      const myMallet = state.mallets[myId];
      if (myMallet) {
        const myIsLeft = Object.keys(state.mallets).indexOf(myId) === 0;
        const onMySide = myIsLeft ? mouse.x < W / 2 : mouse.x > W / 2;
        if (!onMySide) {
          // Draw a small crosshair to show where mouse is
          c.strokeStyle = '#00ff8844';
          c.lineWidth = 1;
          c.beginPath();
          c.moveTo(mouse.x - 8, mouse.y); c.lineTo(mouse.x + 8, mouse.y);
          c.moveTo(mouse.x, mouse.y - 8); c.lineTo(mouse.x, mouse.y + 8);
          c.stroke();
        }
      }

      // Scores
      pids.forEach((pid, i) => {
        const x = i === 0 ? W / 4 : (W * 3) / 4;
        drawLabel(c, `${pid === myId ? 'You' : 'Opp'}: ${state.scores[pid]}`, x, 35, { color: '#ffffff', font: '28px monospace' });
      });

      animId = requestAnimationFrame(draw);
    }
    animId = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animId);
  }, [socket, myId]);

  return (
    <div className="game-container">
      <canvas ref={canvasRef} className="game-canvas" style={{ cursor: 'none' }} />
      <p className="controls-hint">Move your mouse to control the mallet</p>
    </div>
  );
}
