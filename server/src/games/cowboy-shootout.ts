import type { ServerGameModule, MatchContext, GameInstance } from '@arcade-battle/shared';

const W = 800, H = 500;
const WINDOW_ROWS = 3, WINDOW_COLS = 4;
const WINDOW_W = 50, WINDOW_H = 50;
const WINDOW_Y_START = 40;
const WINDOW_ROW_GAP = 70;
const WINDOW_MARGIN = 80;
const TOTAL_BANDITS = 7; // odd number
const BANDIT_HIDE_MIN = 1500, BANDIT_HIDE_MAX = 3000;
const BANDIT_PEEK_DURATION = 1200;
const BANDIT_SHOOT_DELAY = 800; // ms after peek before bandit shoots
const PLAYER_LIVES = 3;
const PLAYER_SHOOT_COOLDOWN = 600;
const BULLET_SPEED = 8;
const TICK_RATE = 1000 / 30;

// Players at bottom
const P1_X = W / 2 - 80, P2_X = W / 2 + 40;
const PLAYER_Y = H - 65;
const PLAYER_W = 28, PLAYER_H = 45;

interface Bandit {
  windowRow: number;
  windowCol: number;
  alive: boolean;
  peeking: boolean;
  peekStart: number;
  nextAction: number; // timestamp for next hide/peek
  shooting: boolean;
}

interface Projectile {
  x: number; y: number;
  vx: number; vy: number;
  fromBandit: boolean;
  owner?: string; // player who fired (for kill credit)
  targetPlayer?: string;
}

interface PlayerState {
  peeking: boolean;
  cursorX: number;
  cursorY: number;
  kills: number;
  lives: number;
  alive: boolean;
  lastShot: number;
  baseX: number;
}

interface CowboyState {
  players: { [id: string]: PlayerState };
  bandit: Bandit;
  banditsRemaining: number;
  projectiles: Projectile[];
  canvasWidth: number;
  canvasHeight: number;
  winner: string | null;
  windows: { row: number; col: number }[];
}

function windowCenterX(col: number): number {
  return WINDOW_MARGIN + col * ((W - WINDOW_MARGIN * 2) / (WINDOW_COLS - 1));
}

function windowCenterY(row: number): number {
  return WINDOW_Y_START + row * WINDOW_ROW_GAP + WINDOW_H / 2;
}

export const cowboyShootoutGame: ServerGameModule = {
  info: {
    id: 'cowboy-shootout',
    name: 'Cowboy Shootout',
    description: 'Western shootout — take down bandits!',
    controls: 'Right Click to peek from cover. Left Click to shoot (cooldown). Mouse to aim. 3 lives. Kill all bandits first!',
    maxDuration: 90,
  },

  create(ctx: MatchContext): GameInstance {
    const [p1, p2] = ctx.players;
    let running = true;
    let banditsKilledTotal = 0;

    // Generate all window positions
    const windows: { row: number; col: number }[] = [];
    for (let r = 0; r < WINDOW_ROWS; r++) {
      for (let c = 0; c < WINDOW_COLS; c++) {
        windows.push({ row: r, col: c });
      }
    }

    function randomWindow(): { row: number; col: number } {
      return windows[Math.floor(Math.random() * windows.length)];
    }

    const startWindow = randomWindow();
    const now = Date.now();

    const state: CowboyState = {
      players: {
        [p1]: { peeking: false, cursorX: W / 2, cursorY: H / 2, kills: 0, lives: PLAYER_LIVES, alive: true, lastShot: 0, baseX: P1_X },
        [p2]: { peeking: false, cursorX: W / 2, cursorY: H / 2, kills: 0, lives: PLAYER_LIVES, alive: true, lastShot: 0, baseX: P2_X },
      },
      bandit: {
        windowRow: startWindow.row, windowCol: startWindow.col,
        alive: true, peeking: false, peekStart: 0, shooting: false,
        nextAction: now + 1000 + Math.random() * 1000,
      },
      banditsRemaining: TOTAL_BANDITS,
      projectiles: [],
      canvasWidth: W, canvasHeight: H,
      winner: null,
      windows,
    };

    function spawnNextBandit(): void {
      if (banditsKilledTotal >= TOTAL_BANDITS) return;
      const w = randomWindow();
      state.bandit = {
        windowRow: w.row, windowCol: w.col,
        alive: true, peeking: false, peekStart: 0, shooting: false,
        nextAction: Date.now() + BANDIT_HIDE_MIN + Math.random() * (BANDIT_HIDE_MAX - BANDIT_HIDE_MIN),
      };
      state.banditsRemaining = TOTAL_BANDITS - banditsKilledTotal;
    }

    function checkWin(): boolean {
      // All bandits killed — player with most kills wins
      if (banditsKilledTotal >= TOTAL_BANDITS) {
        running = false;
        const k1 = state.players[p1].kills, k2 = state.players[p2].kills;
        const winner = k1 > k2 ? p1 : k2 > k1 ? p2 : Math.random() < 0.5 ? p1 : p2;
        state.winner = winner;
        ctx.emit('game:state', state);
        ctx.endRound(winner);
        return true;
      }

      // Check if a player lost all lives
      if (!state.players[p1].alive && !state.players[p2].alive) {
        running = false;
        const k1 = state.players[p1].kills, k2 = state.players[p2].kills;
        const winner = k1 > k2 ? p1 : k2 > k1 ? p2 : Math.random() < 0.5 ? p1 : p2;
        state.winner = winner;
        ctx.emit('game:state', state);
        ctx.endRound(winner);
        return true;
      }
      if (!state.players[p1].alive) {
        running = false; state.winner = p2;
        ctx.emit('game:state', state); ctx.endRound(p2); return true;
      }
      if (!state.players[p2].alive) {
        running = false; state.winner = p1;
        ctx.emit('game:state', state); ctx.endRound(p1); return true;
      }

      return false;
    }

    const interval = setInterval(() => {
      if (!running) return;
      const now = Date.now();

      // Bandit AI
      const b = state.bandit;
      if (b.alive) {
        if (!b.peeking && now >= b.nextAction) {
          // Peek out
          b.peeking = true;
          b.peekStart = now;
          b.shooting = false;
        }

        if (b.peeking) {
          const peekElapsed = now - b.peekStart;

          // Shoot at a random peeking player after delay
          if (!b.shooting && peekElapsed >= BANDIT_SHOOT_DELAY) {
            b.shooting = true;
            const peekingPlayers = ctx.players.filter((pid) => state.players[pid].peeking && state.players[pid].alive);
            if (peekingPlayers.length > 0) {
              const target = peekingPlayers[Math.floor(Math.random() * peekingPlayers.length)];
              const tp = state.players[target];
              const bx = windowCenterX(b.windowCol);
              const by = windowCenterY(b.windowRow);
              const tx = tp.baseX + PLAYER_W / 2;
              const ty = PLAYER_Y + PLAYER_H / 4;
              const dx = tx - bx, dy = ty - by;
              const dist = Math.sqrt(dx * dx + dy * dy) || 1;
              state.projectiles.push({
                x: bx, y: by,
                vx: (dx / dist) * BULLET_SPEED * 0.7,
                vy: (dy / dist) * BULLET_SPEED * 0.7,
                fromBandit: true, targetPlayer: target,
              });
            }
          }

          // Hide after peek duration
          if (peekElapsed >= BANDIT_PEEK_DURATION) {
            b.peeking = false;
            b.shooting = false;
            // Move to new window
            const w = randomWindow();
            b.windowRow = w.row;
            b.windowCol = w.col;
            b.nextAction = now + BANDIT_HIDE_MIN + Math.random() * (BANDIT_HIDE_MAX - BANDIT_HIDE_MIN);
          }
        }
      }

      // Move projectiles
      state.projectiles = state.projectiles.filter((proj) => {
        proj.x += proj.vx;
        proj.y += proj.vy;
        if (proj.x < -20 || proj.x > W + 20 || proj.y < -20 || proj.y > H + 20) return false;

        // Bandit bullet hitting players
        if (proj.fromBandit) {
          for (const pid of ctx.players) {
            const p = state.players[pid];
            if (!p.peeking || !p.alive) continue;
            const dx = proj.x - (p.baseX + PLAYER_W / 2);
            const dy = proj.y - (PLAYER_Y + PLAYER_H / 2);
            if (Math.abs(dx) < PLAYER_W && Math.abs(dy) < PLAYER_H / 2) {
              p.lives--;
              p.peeking = false;
              if (p.lives <= 0) p.alive = false;
              if (checkWin()) return false;
              return false;
            }
          }
        } else {
          // Player bullet hitting bandit
          if (b.alive && b.peeking) {
            const bx = windowCenterX(b.windowCol);
            const by = windowCenterY(b.windowRow);
            if (Math.abs(proj.x - bx) < WINDOW_W / 2 + 5 && Math.abs(proj.y - by) < WINDOW_H / 2 + 5) {
              b.alive = false;
              banditsKilledTotal++;
              if (proj.owner && state.players[proj.owner]) {
                state.players[proj.owner].kills++;
              }
              state.banditsRemaining = TOTAL_BANDITS - banditsKilledTotal;
              if (checkWin()) return false;
              // Spawn next bandit after delay
              setTimeout(() => { if (running) spawnNextBandit(); }, 500);
              return false;
            }
          }
        }

        return true;
      });

      ctx.emit('game:state', state);
    }, TICK_RATE);

    return {
      onPlayerInput(playerId: string, data: unknown): void {
        if (!running) return;
        const input = data as { peek?: boolean; shoot?: boolean; x?: number; y?: number };
        const p = state.players[playerId];
        if (!p || !p.alive) return;

        if (input.x !== undefined && input.y !== undefined) {
          p.cursorX = input.x;
          p.cursorY = input.y;
        }

        if (input.peek !== undefined) p.peeking = input.peek;

        if (input.shoot && p.peeking) {
          const now = Date.now();
          if (now - p.lastShot < PLAYER_SHOOT_COOLDOWN) return;
          p.lastShot = now;

          // Fire projectile toward cursor
          const sx = p.baseX + PLAYER_W / 2 + 15;
          const sy = PLAYER_Y;
          const dx = p.cursorX - sx, dy = p.cursorY - sy;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          state.projectiles.push({
            x: sx, y: sy,
            vx: (dx / dist) * BULLET_SPEED,
            vy: (dy / dist) * BULLET_SPEED,
            fromBandit: false,
            owner: playerId,
          });

          // Check if bullet would hit bandit (also handled in tick, but for responsiveness)
        }
      },
      getState() { return state; },
      cleanup(): void { running = false; clearInterval(interval); },
    };
  },
};
