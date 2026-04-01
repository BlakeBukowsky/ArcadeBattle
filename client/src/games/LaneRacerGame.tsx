import { useEffect, useRef } from 'react';
import { useSocket, useMyId } from '../context/SocketContext.tsx';
import { drawSprite, drawLabel, drawBackground } from '../lib/sprites.js';
import { applyStateUpdate, StateBuffer } from '../lib/net.js';

const CAR_W = 30, CAR_H = 50, CAR_Y = 430;
const OBSTACLE_W = 40, OBSTACLE_H = 40;
const LANES = 3;

interface Obstacle { id: number; lane: number; y: number; }
interface PlayerState { lane: number; alive: boolean; distance: number; }
interface LaneRacerState {
  players: Record<string, PlayerState>;
  obstacles: Obstacle[];
  speed: number;
  canvasWidth: number; canvasHeight: number;
  winner: string | null;
}

export default function LaneRacerGame() {
  const socket = useSocket();
  const myId = useMyId();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const interpRef = useRef(new StateBuffer<LaneRacerState>()).current;

  useEffect(() => {
    socket.on('game:state', (data: unknown) => { interpRef.push(applyStateUpdate(interpRef.latest(), data)); });
    return () => { socket.off('game:state'); };
  }, [socket]);

  useEffect(() => {
    function kd(e: KeyboardEvent) {
      if (e.key === 'a' || e.key === 'ArrowLeft') { e.preventDefault(); socket.emit('game:input', { lane: 'left' }); }
      if (e.key === 'd' || e.key === 'ArrowRight') { e.preventDefault(); socket.emit('game:input', { lane: 'right' }); }
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

      drawBackground(c, 'lane-racer', W, H, { color: '#1a1a1a' });

      // Divider
      c.strokeStyle = '#444'; c.lineWidth = 2; c.setLineDash([6, 6]);
      c.beginPath(); c.moveTo(HALF, 0); c.lineTo(HALF, H); c.stroke(); c.setLineDash([]);

      const pids = Object.keys(state.players);
      const laneW = HALF / LANES;

      // Animated road lines (scroll effect based on distance)
      const scrollY = (state.players[pids[0]]?.distance ?? 0) * 0.3;

      pids.forEach((pid, idx) => {
        const ox = idx * HALF;
        const p = state.players[pid];
        const isMe = pid === myId;

        c.save();
        c.beginPath(); c.rect(ox, 0, HALF, H); c.clip();

        // Road surface
        c.fillStyle = '#2a2a2a';
        c.fillRect(ox, 0, HALF, H);

        // Lane dividers (scrolling dashes)
        c.strokeStyle = '#555'; c.lineWidth = 2; c.setLineDash([20, 20]);
        for (let i = 1; i < LANES; i++) {
          const lx = ox + i * laneW;
          c.beginPath();
          c.moveTo(lx, -(scrollY % 40));
          c.lineTo(lx, H + 40);
          c.stroke();
        }
        c.setLineDash([]);

        // Road edges
        c.fillStyle = '#ffaa00';
        c.fillRect(ox, 0, 3, H);
        c.fillRect(ox + HALF - 3, 0, 3, H);

        // Obstacles
        for (const obs of state.obstacles) {
          const obsX = ox + obs.lane * laneW + (laneW - OBSTACLE_W) / 2;
          drawSprite(c, 'asteroid', obsX, obs.y, OBSTACLE_W, OBSTACLE_H, { color: '#cc4444' });
          // Highlight top
          c.fillStyle = '#ff666633';
          c.fillRect(obsX, obs.y, OBSTACLE_W, 4);
        }

        // Car
        if (p.alive) {
          const carX = ox + p.lane * laneW + (laneW - CAR_W) / 2;
          drawSprite(c, isMe ? 'player' : 'opponent', carX, CAR_Y, CAR_W, CAR_H, {
            color: isMe ? '#00ff88' : '#ff4488', skin: pid,
          });
          // Windshield
          c.fillStyle = '#ffffff33';
          c.fillRect(carX + 4, CAR_Y + 6, CAR_W - 8, 12);
        } else {
          // Explosion
          const carX = ox + p.lane * laneW + (laneW - CAR_W) / 2;
          c.fillStyle = '#ff440066';
          c.beginPath();
          c.arc(carX + CAR_W / 2, CAR_Y + CAR_H / 2, 25, 0, Math.PI * 2);
          c.fill();
        }

        // Label
        drawLabel(c, isMe ? 'YOU' : 'OPPONENT', ox + HALF / 2, 20, { color: '#ffffff88', font: '12px monospace' });

        c.restore();
      });

      // Speed
      drawLabel(c, `Speed: ${state.speed.toFixed(1)}`, W / 2, H - 10, { color: '#ffaa00', font: '12px monospace' });

      // Winner
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
      <p className="controls-hint">A/D or Arrow Keys to switch lanes</p>
    </div>
  );
}
