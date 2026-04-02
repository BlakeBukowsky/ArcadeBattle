import { useEffect, useRef } from 'react';
import { useSocket, useMyId } from '../context/SocketContext.tsx';
import { drawLabel, drawBackground } from '../lib/sprites.js';
import { applyStateUpdate, StateBuffer } from '../lib/net.js';

const CAR_W = 12, CAR_H = 20;

interface Point { x: number; y: number; }
interface CarState { x: number; y: number; angle: number; speed: number; drifting: boolean; checkpoint: number; lap: number; }
interface RacingState {
  players: Record<string, CarState>;
  track: Point[]; trackWidth: number; lapsToWin: number;
  canvasWidth: number; canvasHeight: number; winner: string | null;
}

export default function RacingGame() {
  const socket = useSocket();
  const myId = useMyId();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const interpRef = useRef(new StateBuffer<RacingState>()).current;

  useEffect(() => {
    socket.on('game:state', (data: unknown) => { interpRef.push(applyStateUpdate(interpRef.latest(), data)); });
    return () => { socket.off('game:state'); };
  }, [socket]);

  useEffect(() => {
    function kd(e: KeyboardEvent) {
      if (e.key === 'w' || e.key === 'ArrowUp') { e.preventDefault(); socket.emit('game:input', { accel: true }); }
      if (e.key === 's' || e.key === 'ArrowDown') socket.emit('game:input', { brake: true });
      if (e.key === 'a' || e.key === 'ArrowLeft') socket.emit('game:input', { left: true });
      if (e.key === 'd' || e.key === 'ArrowRight') socket.emit('game:input', { right: true });
      if (e.key === 'Shift') socket.emit('game:input', { drift: true });
    }
    function ku(e: KeyboardEvent) {
      if (e.key === 'w' || e.key === 'ArrowUp') socket.emit('game:input', { accel: false });
      if (e.key === 's' || e.key === 'ArrowDown') socket.emit('game:input', { brake: false });
      if (e.key === 'a' || e.key === 'ArrowLeft') socket.emit('game:input', { left: false });
      if (e.key === 'd' || e.key === 'ArrowRight') socket.emit('game:input', { right: false });
      if (e.key === 'Shift') socket.emit('game:input', { drift: false });
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

      const W = state.canvasWidth, H = state.canvasHeight;
      canvas.width = W; canvas.height = H;

      drawBackground(c, 'racing', W, H, { color: '#1a3a1a' });

      // Draw track
      const track = state.track;
      const tw = state.trackWidth;

      // Track surface
      c.lineWidth = tw * 2;
      c.lineCap = 'round'; c.lineJoin = 'round';
      c.strokeStyle = '#444';
      c.beginPath();
      c.moveTo(track[0].x, track[0].y);
      for (let i = 1; i <= track.length; i++) {
        const p = track[i % track.length];
        c.lineTo(p.x, p.y);
      }
      c.closePath();
      c.stroke();

      // Track center line
      c.lineWidth = 2;
      c.strokeStyle = '#ffffff22';
      c.setLineDash([10, 10]);
      c.beginPath();
      c.moveTo(track[0].x, track[0].y);
      for (let i = 1; i <= track.length; i++) {
        const p = track[i % track.length];
        c.lineTo(p.x, p.y);
      }
      c.closePath();
      c.stroke();
      c.setLineDash([]);

      // Start/finish line
      c.strokeStyle = '#ffffff66'; c.lineWidth = 4;
      const s = track[0];
      const sn = track[1];
      const sa = Math.atan2(sn.y - s.y, sn.x - s.x) + Math.PI / 2;
      c.beginPath();
      c.moveTo(s.x + Math.cos(sa) * tw, s.y + Math.sin(sa) * tw);
      c.lineTo(s.x - Math.cos(sa) * tw, s.y - Math.sin(sa) * tw);
      c.stroke();

      // Checkpoint markers (subtle)
      for (let i = 0; i < track.length; i++) {
        c.beginPath();
        c.arc(track[i].x, track[i].y, 4, 0, Math.PI * 2);
        c.fillStyle = '#ffffff11';
        c.fill();
      }

      // Cars
      const pids = Object.keys(state.players);
      pids.forEach((pid) => {
        const car = state.players[pid];
        const isMe = pid === myId;
        const color = isMe ? '#00ff88' : '#ff4488';

        c.save();
        c.translate(car.x, car.y);
        c.rotate(car.angle);

        // Car body — long axis (CAR_H) points in movement direction (positive X after rotation)
        c.fillStyle = color;
        c.fillRect(-CAR_H / 2, -CAR_W / 2, CAR_H, CAR_W);
        // Windshield (at front = positive X)
        c.fillStyle = '#ffffff33';
        c.fillRect(CAR_H / 2 - 7, -CAR_W / 2 + 2, 5, CAR_W - 4);
        // Rear (at back = negative X)
        c.fillStyle = '#00000033';
        c.fillRect(-CAR_H / 2 + 1, -CAR_W / 2 + 1, 3, CAR_W - 2);

        // Drift sparks (at rear corners)
        if (car.drifting) {
          c.fillStyle = '#ffaa0066';
          c.fillRect(-CAR_H / 2 - 3, -CAR_W / 2 - 2, 4, 3);
          c.fillRect(-CAR_H / 2 - 3, CAR_W / 2 - 1, 4, 3);
        }

        c.restore();

        // Label
        drawLabel(c, isMe ? 'YOU' : 'OPP', car.x, car.y - CAR_H / 2 - 8, { color: '#ffffff66', font: '9px monospace' });
      });

      // HUD — laps
      pids.forEach((pid) => {
        const car = state.players[pid];
        const isMe = pid === myId;
        const x = isMe ? 15 : W - 15;
        const align = isMe ? 'left' : 'right';
        drawLabel(c, `${isMe ? 'You' : 'Opp'}: Lap ${car.lap + 1}/${state.lapsToWin}`, x, 25, {
          color: isMe ? '#00ff88' : '#ff4488', font: '14px monospace', align: align as CanvasTextAlign,
        });
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
      <p className="controls-hint">W to accelerate, S to brake, A/D to turn, Shift to drift</p>
    </div>
  );
}
