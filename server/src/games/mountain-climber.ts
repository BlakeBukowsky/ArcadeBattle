import type { ServerGameModule, MatchContext, GameInstance } from '@arcade-battle/shared';

const W = 800, H = 500, HALF_W = 400;
const PW = 14, PH = 18;
const GRAVITY = 0.45;
const MOVE_SPEED = 3;
const JUMP_POWER = -8.5;
const WALL_JUMP_VX = 5, WALL_JUMP_VY = -7.5;
const DASH_SPEED = 10;
const DASH_TICKS = 7;
const LEVEL_H = 600;
const TICK_RATE = 1000 / 60;
const LEVEL_TIMEOUT = 10000;

interface Plat { x: number; y: number; w: number; t: 'solid' | 'spike' | 'moving'; mx?: number; my?: number; ms?: number; }
interface Level { platforms: Plat[]; exitY: number; }

function makeLevels(): Level[] {
  const levels: Level[] = [];
  // Tier 1: Easy (3 levels) — simple jumps
  for (let i = 0; i < 3; i++) {
    const plats: Plat[] = [{ x: 0, y: LEVEL_H - 20, w: HALF_W, t: 'solid' }];
    for (let j = 1; j <= 6; j++) {
      plats.push({ x: 20 + ((j + i) % 3) * 120, y: LEVEL_H - 20 - j * 85, w: 80, t: 'solid' });
    }
    levels.push({ platforms: plats, exitY: LEVEL_H - 20 - 6 * 85 - 30 });
  }
  // Tier 2: Medium (3 levels) — gaps + one spike
  for (let i = 0; i < 3; i++) {
    const plats: Plat[] = [{ x: 0, y: LEVEL_H - 20, w: HALF_W, t: 'solid' }];
    for (let j = 1; j <= 7; j++) {
      const isSpike = j === 4 + i;
      plats.push({ x: 30 + ((j * 2 + i) % 3) * 110, y: LEVEL_H - 20 - j * 75, w: isSpike ? 60 : 70, t: isSpike ? 'spike' : 'solid' });
    }
    levels.push({ platforms: plats, exitY: LEVEL_H - 20 - 7 * 75 - 30 });
  }
  // Tier 3: Hard (3 levels) — wall jumps needed, more spikes
  for (let i = 0; i < 3; i++) {
    const plats: Plat[] = [{ x: 0, y: LEVEL_H - 20, w: HALF_W, t: 'solid' }];
    for (let j = 1; j <= 8; j++) {
      const x = j % 2 === 0 ? 10 : HALF_W - 80;
      plats.push({ x, y: LEVEL_H - 20 - j * 65, w: 60, t: j % 3 === 0 ? 'spike' : 'solid' });
    }
    levels.push({ platforms: plats, exitY: LEVEL_H - 20 - 8 * 65 - 30 });
  }
  // Tier 4: Very Hard (3 levels) — moving + spikes
  for (let i = 0; i < 3; i++) {
    const plats: Plat[] = [{ x: 0, y: LEVEL_H - 20, w: HALF_W, t: 'solid' }];
    for (let j = 1; j <= 8; j++) {
      if (j % 2 === 0) {
        plats.push({ x: 100, y: LEVEL_H - 20 - j * 65, w: 60, t: 'moving', mx: 80, my: 0, ms: 0.02 + i * 0.005 });
      } else {
        plats.push({ x: 20 + ((j + i) % 3) * 100, y: LEVEL_H - 20 - j * 65, w: 55, t: j === 5 ? 'spike' : 'solid' });
      }
    }
    levels.push({ platforms: plats, exitY: LEVEL_H - 20 - 8 * 65 - 30 });
  }
  // Tier 5: Expert (3 levels) — tight, many spikes, moving
  for (let i = 0; i < 3; i++) {
    const plats: Plat[] = [{ x: 0, y: LEVEL_H - 20, w: HALF_W, t: 'solid' }];
    for (let j = 1; j <= 9; j++) {
      const isSpike = j % 2 === 0;
      plats.push({
        x: 20 + ((j * 3 + i) % 4) * 80, y: LEVEL_H - 20 - j * 58, w: isSpike ? 50 : 45,
        t: isSpike ? 'spike' : (j % 3 === 0 ? 'moving' : 'solid'),
        ...(j % 3 === 0 ? { mx: 60, my: 0, ms: 0.025 } : {}),
      });
    }
    levels.push({ platforms: plats, exitY: LEVEL_H - 20 - 9 * 58 - 30 });
  }
  // Level 16: Final Race — long, no spikes, pure speed
  const finalPlats: Plat[] = [{ x: 0, y: LEVEL_H - 20, w: HALF_W, t: 'solid' }];
  for (let j = 1; j <= 10; j++) {
    finalPlats.push({ x: 20 + (j % 3) * 110, y: LEVEL_H - 20 - j * 55, w: 70, t: 'solid' });
  }
  levels.push({ platforms: finalPlats, exitY: LEVEL_H - 20 - 10 * 55 - 30 });
  return levels;
}

interface PlayerState {
  x: number; y: number; vx: number; vy: number;
  grounded: boolean; wallDir: number; canDash: boolean;
  dashTimer: number; dashDx: number; dashDy: number;
  alive: boolean; currentLevel: number; completed: boolean;
  cameraY: number;
}

interface ClimberState {
  players: { [id: string]: PlayerState };
  levels: Level[];
  tick: number;
  timeout: number | null;
  canvasWidth: number; canvasHeight: number;
  winner: string | null;
  isFinalLevel: boolean;
}

export const mountainClimberGame: ServerGameModule = {
  info: {
    id: 'mountain-climber',
    name: 'Mountain Climber',
    description: 'Celeste-style platformer race',
    controls: 'A/D to move, W/Space to jump, Shift to dash. Wall-jump off edges. 15 levels + final race.',
    maxDuration: 180,
  },

  create(ctx: MatchContext): GameInstance {
    const [p1, p2] = ctx.players;
    let running = true;
    const levels = makeLevels();
    let timeoutTimer: ReturnType<typeof setTimeout> | null = null;
    const inputs: { [id: string]: { left: boolean; right: boolean; jump: boolean; dash: boolean } } = {
      [p1]: { left: false, right: false, jump: false, dash: false },
      [p2]: { left: false, right: false, jump: false, dash: false },
    };

    function makePlayer(): PlayerState {
      return { x: HALF_W / 2, y: LEVEL_H - 40, vx: 0, vy: 0, grounded: false, wallDir: 0, canDash: true, dashTimer: 0, dashDx: 0, dashDy: 0, alive: true, currentLevel: 0, completed: false, cameraY: LEVEL_H - H };
    }

    const state: ClimberState = {
      players: { [p1]: makePlayer(), [p2]: makePlayer() },
      levels,
      tick: 0,
      timeout: null,
      canvasWidth: W, canvasHeight: H,
      winner: null,
      isFinalLevel: false,
    };

    function getPlatPos(plat: Plat, tick: number): { x: number; y: number } {
      if (plat.t === 'moving' && plat.mx) {
        return { x: plat.x + Math.sin(tick * (plat.ms ?? 0.02)) * plat.mx, y: plat.y };
      }
      return { x: plat.x, y: plat.y };
    }

    function startTimeout(firstFinisher: string): void {
      if (timeoutTimer) return;
      state.timeout = LEVEL_TIMEOUT / 1000;
      timeoutTimer = setTimeout(() => {
        if (!running) return;
        // Time's up — other player loses
        const loser = ctx.players.find((p) => p !== firstFinisher);
        if (loser) {
          state.players[loser].alive = false;
          running = false;
          state.winner = firstFinisher;
          ctx.emit('game:state', state);
          ctx.endRound(firstFinisher);
        }
        timeoutTimer = null;
      }, LEVEL_TIMEOUT);
    }

    function clearTimeoutTimer(): void {
      if (timeoutTimer) { clearTimeout(timeoutTimer); timeoutTimer = null; }
      state.timeout = null;
    }

    const interval = setInterval(() => {
      if (!running) return;
      state.tick++;

      // Update timeout display
      if (timeoutTimer && state.timeout !== null) {
        state.timeout = Math.max(0, state.timeout - 1 / 60);
      }

      for (const pid of ctx.players) {
        const p = state.players[pid];
        if (!p.alive || p.completed) continue;
        const inp = inputs[pid];
        const level = levels[p.currentLevel];

        // Dash
        if (inp.dash && p.canDash && p.dashTimer <= 0) {
          inp.dash = false;
          p.canDash = false;
          p.dashTimer = DASH_TICKS;
          p.dashDx = inp.left ? -1 : inp.right ? 1 : (p.vx >= 0 ? 1 : -1);
          p.dashDy = 0;
          p.vy = 0;
        }

        if (p.dashTimer > 0) {
          p.dashTimer--;
          p.vx = p.dashDx * DASH_SPEED;
          p.vy = p.dashDy * DASH_SPEED;
        } else {
          // Normal movement
          if (inp.left) p.vx = -MOVE_SPEED;
          else if (inp.right) p.vx = MOVE_SPEED;
          else p.vx *= 0.7;

          // Jump / wall-jump
          if (inp.jump) {
            if (p.grounded) {
              p.vy = JUMP_POWER;
              p.grounded = false;
            } else if (p.wallDir !== 0) {
              p.vx = -p.wallDir * WALL_JUMP_VX;
              p.vy = WALL_JUMP_VY;
              p.wallDir = 0;
            }
            inp.jump = false;
          }

          p.vy += GRAVITY;
        }

        p.x += p.vx;
        p.y += p.vy;

        // Wall detection
        p.wallDir = 0;
        if (p.x <= 0) { p.x = 0; p.wallDir = -1; if (p.vy > 0) p.vy *= 0.85; }
        if (p.x + PW >= HALF_W) { p.x = HALF_W - PW; p.wallDir = 1; if (p.vy > 0) p.vy *= 0.85; }

        // Platform collision
        p.grounded = false;
        for (const plat of level.platforms) {
          const pp = getPlatPos(plat, state.tick);
          if (p.vy >= 0 && p.x + PW > pp.x && p.x < pp.x + plat.w && p.y + PH >= pp.y && p.y + PH <= pp.y + 12) {
            if (plat.t === 'spike') {
              p.alive = false;
              const opponent = pid === p1 ? p2 : p1;
              running = false;
              state.winner = opponent;
              ctx.emit('game:state', state);
              ctx.endRound(opponent);
              return;
            }
            p.y = pp.y - PH;
            p.vy = 0;
            p.grounded = true;
            p.canDash = true;
          }
        }

        // Fall off bottom
        if (p.y > LEVEL_H + 50) {
          p.alive = false;
          const opponent = pid === p1 ? p2 : p1;
          running = false;
          state.winner = opponent;
          ctx.emit('game:state', state);
          ctx.endRound(opponent);
          return;
        }

        // Exit reached
        if (p.y <= level.exitY) {
          p.currentLevel++;
          if (p.currentLevel >= levels.length) {
            // Finished all levels — win (final race)
            p.completed = true;
            running = false;
            state.winner = pid;
            ctx.emit('game:state', state);
            ctx.endRound(pid);
            return;
          }
          // Reset position for next level
          p.x = HALF_W / 2;
          p.y = LEVEL_H - 40;
          p.vx = 0; p.vy = 0;
          p.cameraY = LEVEL_H - H;
          p.canDash = true;

          // Start timeout for opponent if they haven't finished this level
          const other = pid === p1 ? p2 : p1;
          const otherP = state.players[other];
          if (otherP.currentLevel < p.currentLevel && !timeoutTimer) {
            startTimeout(pid);
          }
          // Check if both finished same level — clear timeout
          if (otherP.currentLevel >= p.currentLevel) clearTimeoutTimer();

          // Check for final level
          if (p.currentLevel === levels.length - 1) state.isFinalLevel = true;
        }

        // Camera
        const targetCam = p.y - H * 0.6;
        p.cameraY += (Math.max(0, Math.min(LEVEL_H - H, targetCam)) - p.cameraY) * 0.1;
      }

      ctx.emit('game:state', state);
    }, TICK_RATE);

    return {
      onPlayerInput(playerId: string, data: unknown): void {
        const input = data as { left?: boolean; right?: boolean; jump?: boolean; dash?: boolean };
        const inp = inputs[playerId];
        if (!inp) return;
        if (input.left !== undefined) inp.left = input.left;
        if (input.right !== undefined) inp.right = input.right;
        if (input.jump) inp.jump = true;
        if (input.dash) inp.dash = true;
      },
      getState() { return state; },
      cleanup(): void { running = false; clearInterval(interval); clearTimeoutTimer(); },
    };
  },
};
