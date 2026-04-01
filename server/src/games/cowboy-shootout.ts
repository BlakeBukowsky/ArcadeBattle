import type { ServerGameModule, MatchContext, GameInstance } from '@arcade-battle/shared';

const W = 800, H = 500;
const GAME_DURATION = 30000;
const WINDOW_ROWS = 2, WINDOW_COLS = 4;
const WINDOW_W = 50, WINDOW_H = 55;
const WINDOW_Y_START = 50;
const WINDOW_ROW_GAP = 90;
const WINDOW_MARGIN = 80;
const BANDIT_PEEK_MIN = 1200, BANDIT_PEEK_MAX = 2500;
const BANDIT_VISIBLE_MIN = 1000, BANDIT_VISIBLE_MAX = 2200;
const BANDIT_SHOOT_WINDUP = 600;
const STUN_DURATION = 3000;
const SHOOT_COOLDOWN = 350;
const BULLET_SPEED = 6;
const TICK_RATE = 1000 / 30;

// Players stand at bottom, side by side
const P1_X = W / 2 - 80, P2_X = W / 2 + 40;
const PLAYER_Y = H - 70;
const PLAYER_W = 30, PLAYER_H = 50;
const COVER_Y = H - 65, COVER_H = 55;

interface Bandit {
  id: number;
  col: number;
  row: number;
  visible: boolean;
  nextToggle: number;
  windingUp: boolean;
  shootTime: number;
  targetPlayer: string | null;
}

interface Projectile {
  x: number; y: number;
  vx: number; vy: number;
  fromBandit: boolean;
  targetPlayer?: string;
}

interface PlayerState {
  peeking: boolean;
  cursorX: number;
  cursorY: number;
  kills: number;
  stunned: boolean;
  stunEnd: number;
  lastShot: number;
  baseX: number;
}

interface CowboyState {
  players: { [id: string]: PlayerState };
  bandits: Bandit[];
  projectiles: Projectile[];
  timeRemaining: number;
  canvasWidth: number;
  canvasHeight: number;
  winner: string | null;
}

function windowX(col: number): number {
  const totalW = (WINDOW_COLS - 1) * ((W - WINDOW_MARGIN * 2) / (WINDOW_COLS - 1));
  return WINDOW_MARGIN + col * ((W - WINDOW_MARGIN * 2) / (WINDOW_COLS - 1)) - WINDOW_W / 2 + WINDOW_W / 2;
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
    description: 'Shoot bandits in the windows! Hold Right Click to peek from cover and aim. Getting shot stuns you for 3s. Most kills in 30s wins. Mouse aim, Left Click shoot, Right Click peek.',
    maxDuration: 35,
  },

  create(ctx: MatchContext): GameInstance {
    const [p1, p2] = ctx.players;
    let running = true;
    const startTime = Date.now();

    const bandits: Bandit[] = [];
    let banditId = 0;
    for (let row = 0; row < WINDOW_ROWS; row++) {
      for (let col = 0; col < WINDOW_COLS; col++) {
        bandits.push({
          id: banditId++,
          col, row,
          visible: false,
          nextToggle: Date.now() + 500 + Math.random() * BANDIT_PEEK_MAX,
          windingUp: false,
          shootTime: 0,
          targetPlayer: null,
        });
      }
    }

    const state: CowboyState = {
      players: {
        [p1]: { peeking: false, cursorX: W / 2, cursorY: H / 2, kills: 0, stunned: false, stunEnd: 0, lastShot: 0, baseX: P1_X },
        [p2]: { peeking: false, cursorX: W / 2, cursorY: H / 2, kills: 0, stunned: false, stunEnd: 0, lastShot: 0, baseX: P2_X },
      },
      bandits,
      projectiles: [],
      timeRemaining: GAME_DURATION / 1000,
      canvasWidth: W,
      canvasHeight: H,
      winner: null,
    };

    const interval = setInterval(() => {
      if (!running) return;
      const now = Date.now();
      const elapsed = now - startTime;
      state.timeRemaining = Math.max(0, (GAME_DURATION - elapsed) / 1000);

      if (elapsed >= GAME_DURATION) {
        running = false;
        const w = state.players[p1].kills > state.players[p2].kills ? p1 :
                  state.players[p2].kills > state.players[p1].kills ? p2 :
                  Math.random() < 0.5 ? p1 : p2;
        state.winner = w;
        ctx.emit('game:state', state);
        ctx.endRound(w);
        return;
      }

      // Clear stun
      for (const pid of ctx.players) {
        const p = state.players[pid];
        if (p.stunned && now >= p.stunEnd) {
          p.stunned = false;
        }
      }

      // Update bandits
      for (const bandit of state.bandits) {
        if (now >= bandit.nextToggle) {
          if (!bandit.visible) {
            // Peek out
            bandit.visible = true;
            bandit.windingUp = false;
            bandit.targetPlayer = null;
            bandit.nextToggle = now + BANDIT_VISIBLE_MIN + Math.random() * (BANDIT_VISIBLE_MAX - BANDIT_VISIBLE_MIN);
            // Will start winding up to shoot
            bandit.shootTime = now + BANDIT_SHOOT_WINDUP + Math.random() * 400;
          } else {
            // Hide
            bandit.visible = false;
            bandit.windingUp = false;
            bandit.targetPlayer = null;
            bandit.nextToggle = now + BANDIT_PEEK_MIN + Math.random() * (BANDIT_PEEK_MAX - BANDIT_PEEK_MIN);
          }
        }

        // Bandit shooting logic — bandits shoot at any non-stunned player
        if (bandit.visible && !bandit.windingUp && now >= bandit.shootTime) {
          const targetablePlayers = ctx.players.filter((pid) => !state.players[pid].stunned);
          if (targetablePlayers.length > 0) {
            bandit.windingUp = true;
            bandit.targetPlayer = targetablePlayers[Math.floor(Math.random() * targetablePlayers.length)];
            bandit.shootTime = now + BANDIT_SHOOT_WINDUP;
          }
        }

        // Fire projectile
        if (bandit.windingUp && now >= bandit.shootTime && bandit.targetPlayer) {
          const target = state.players[bandit.targetPlayer];
          const bx = windowCenterX(bandit.col);
          const by = windowCenterY(bandit.row);
          const tx = target.baseX + PLAYER_W / 2;
          const ty = PLAYER_Y + PLAYER_H / 4;
          const dx = tx - bx, dy = ty - by;
          const dist = Math.sqrt(dx * dx + dy * dy);

          state.projectiles.push({
            x: bx, y: by,
            vx: (dx / dist) * BULLET_SPEED,
            vy: (dy / dist) * BULLET_SPEED,
            fromBandit: true,
            targetPlayer: bandit.targetPlayer,
          });

          bandit.windingUp = false;
          bandit.targetPlayer = null;
          // Hide soon after shooting
          bandit.nextToggle = now + 300 + Math.random() * 500;
        }
      }

      // Move projectiles
      state.projectiles = state.projectiles.filter((proj) => {
        proj.x += proj.vx;
        proj.y += proj.vy;

        // Off screen?
        if (proj.x < -20 || proj.x > W + 20 || proj.y < -20 || proj.y > H + 20) return false;

        // Bandit bullet hitting players
        if (proj.fromBandit) {
          for (const pid of ctx.players) {
            const p = state.players[pid];
            if (!p.peeking || p.stunned) continue;
            const dx = proj.x - (p.baseX + PLAYER_W / 2);
            const dy = proj.y - (PLAYER_Y + PLAYER_H / 2);
            if (Math.abs(dx) < PLAYER_W && Math.abs(dy) < PLAYER_H / 2) {
              p.stunned = true;
              p.stunEnd = now + STUN_DURATION;
              p.peeking = false;
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
        if (!p) return;

        if (input.x !== undefined && input.y !== undefined) {
          p.cursorX = input.x;
          p.cursorY = input.y;
        }

        if (input.peek !== undefined && !p.stunned) {
          p.peeking = input.peek;
        }

        if (input.shoot && p.peeking && !p.stunned) {
          const now = Date.now();
          if (now - p.lastShot < SHOOT_COOLDOWN) return;
          p.lastShot = now;

          // Check hit on bandits
          for (const bandit of state.bandits) {
            if (!bandit.visible) continue;
            const bx = windowCenterX(bandit.col);
            const by = windowCenterY(bandit.row);
            if (Math.abs(p.cursorX - bx) < WINDOW_W / 2 + 5 && Math.abs(p.cursorY - by) < WINDOW_H / 2 + 5) {
              p.kills++;
              bandit.visible = false;
              bandit.windingUp = false;
              bandit.targetPlayer = null;
              bandit.nextToggle = Date.now() + BANDIT_PEEK_MIN + Math.random() * BANDIT_PEEK_MAX;
              break;
            }
          }
        }
      },
      getState() { return state; },
      cleanup(): void { running = false; clearInterval(interval); },
    };
  },
};
