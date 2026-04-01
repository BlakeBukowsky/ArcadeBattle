import type { ServerGameModule, MatchContext, GameInstance } from '@arcade-battle/shared';

const ARENA_W = 1600, ARENA_H = 400;
const VIEW_W = 800, VIEW_H = 400;
const FLOOR_Y = ARENA_H - 30;
const PLAYER_W = 20, PLAYER_H = 44;
const SWORD_LEN = 35, SWORD_W = 3;
const MOVE_SPEED = 4.5;
const JUMP_POWER = -10;
const GRAVITY = 0.45;
const ATTACK_DURATION = 200;
const ATTACK_COOLDOWN = 350;
const RESPAWN_DELAY = 600;
const TICK_RATE = 1000 / 60;

type Guard = 'high' | 'mid' | 'low';
const GUARDS: Guard[] = ['high', 'mid', 'low'];

interface PlayerState {
  x: number; y: number; vy: number; onGround: boolean;
  facing: 1 | -1;
  guard: Guard;
  attacking: boolean; attackEnd: number;
  cooldown: number;
  alive: boolean;
}

interface FencingState {
  players: { [id: string]: PlayerState };
  cameraX: number;
  arenaWidth: number;
  viewWidth: number;
  viewHeight: number;
  floorY: number;
  endZones: { [id: string]: number }; // x position of each player's end zone
  winner: string | null;
}

export const fencingGame: ServerGameModule = {
  info: {
    id: 'fencing',
    name: 'Fencing',
    description: 'Nidhogg-style sword duel! Stab your opponent and run to their end zone to win. A/D to move, W to jump, Space to attack, S to cycle guard (high/mid/low).',
    maxDuration: 90,
  },

  create(ctx: MatchContext): GameInstance {
    const [p1, p2] = ctx.players;
    let running = true;
    const inputs: { [id: string]: { left: boolean; right: boolean; jump: boolean; attack: boolean; cycleGuard: boolean } } = {
      [p1]: { left: false, right: false, jump: false, attack: false, cycleGuard: false },
      [p2]: { left: false, right: false, jump: false, attack: false, cycleGuard: false },
    };

    const state: FencingState = {
      players: {
        [p1]: { x: ARENA_W / 2 - 80, y: FLOOR_Y - PLAYER_H, vy: 0, onGround: true, facing: 1, guard: 'mid', attacking: false, attackEnd: 0, cooldown: 0, alive: true },
        [p2]: { x: ARENA_W / 2 + 60, y: FLOOR_Y - PLAYER_H, vy: 0, onGround: true, facing: -1, guard: 'mid', attacking: false, attackEnd: 0, cooldown: 0, alive: true },
      },
      cameraX: ARENA_W / 2 - VIEW_W / 2,
      arenaWidth: ARENA_W,
      viewWidth: VIEW_W,
      viewHeight: VIEW_H,
      floorY: FLOOR_Y,
      endZones: { [p1]: 0, [p2]: ARENA_W },
      winner: null,
    };

    function respawn(pid: string, behindKiller: boolean, killerX: number): void {
      const p = state.players[pid];
      // Respawn behind the killer
      if (pid === p1) {
        p.x = Math.max(50, killerX - 200);
      } else {
        p.x = Math.min(ARENA_W - 50 - PLAYER_W, killerX + 200);
      }
      p.y = FLOOR_Y - PLAYER_H;
      p.vy = 0;
      p.onGround = true;
      p.alive = true;
      p.attacking = false;
      p.guard = 'mid';
    }

    function swordY(guard: Guard): number {
      switch (guard) {
        case 'high': return 8;
        case 'mid': return PLAYER_H / 2;
        case 'low': return PLAYER_H - 10;
      }
    }

    const interval = setInterval(() => {
      if (!running) return;
      const now = Date.now();

      for (const pid of ctx.players) {
        const p = state.players[pid];
        if (!p.alive) continue;

        const inp = inputs[pid];
        const other = pid === p1 ? p2 : p1;

        // Face opponent
        p.facing = state.players[other].x > p.x ? 1 : -1;

        // Movement
        if (inp.left) p.x -= MOVE_SPEED;
        if (inp.right) p.x += MOVE_SPEED;
        if (inp.jump && p.onGround) {
          p.vy = JUMP_POWER;
          p.onGround = false;
        }

        // Guard cycle
        if (inp.cycleGuard) {
          inp.cycleGuard = false;
          const idx = GUARDS.indexOf(p.guard);
          p.guard = GUARDS[(idx + 1) % GUARDS.length];
        }

        // Attack
        if (inp.attack && !p.attacking && now >= p.cooldown) {
          p.attacking = true;
          p.attackEnd = now + ATTACK_DURATION;
          p.cooldown = now + ATTACK_COOLDOWN;
          inp.attack = false;
        }
        if (p.attacking && now >= p.attackEnd) {
          p.attacking = false;
        }

        // Physics
        p.vy += GRAVITY;
        p.y += p.vy;
        if (p.y + PLAYER_H >= FLOOR_Y) {
          p.y = FLOOR_Y - PLAYER_H;
          p.vy = 0;
          p.onGround = true;
        }
        p.x = Math.max(0, Math.min(ARENA_W - PLAYER_W, p.x));
      }

      // Attack collision
      for (const pid of ctx.players) {
        const attacker = state.players[pid];
        if (!attacker.alive || !attacker.attacking) continue;

        const otherId = pid === p1 ? p2 : p1;
        const defender = state.players[otherId];
        if (!defender.alive) continue;

        // Sword tip position
        const sy = attacker.y + swordY(attacker.guard);
        const sx = attacker.x + (attacker.facing > 0 ? PLAYER_W + SWORD_LEN : -SWORD_LEN);

        // Check if sword tip is inside defender
        if (
          sx >= defender.x && sx <= defender.x + PLAYER_W &&
          sy >= defender.y && sy <= defender.y + PLAYER_H
        ) {
          // Check if defender is blocking at same guard level
          if (defender.guard === attacker.guard && !defender.attacking) {
            // Blocked — bounce attacker back
            attacker.attacking = false;
            attacker.x += attacker.facing * -20;
          } else {
            // Hit!
            defender.alive = false;
            const killerX = attacker.x;
            setTimeout(() => {
              if (running) respawn(otherId, true, killerX);
            }, RESPAWN_DELAY);
          }
        }
      }

      // Camera follows midpoint
      const midX = (state.players[p1].x + state.players[p2].x) / 2;
      state.cameraX = Math.max(0, Math.min(ARENA_W - VIEW_W, midX - VIEW_W / 2));

      // Check end zone
      for (const pid of ctx.players) {
        const p = state.players[pid];
        if (!p.alive) continue;
        const otherEnd = state.endZones[pid === p1 ? p2 : p1];
        // p1 needs to reach p2's end (right), p2 needs to reach p1's end (left)
        if (pid === p1 && p.x + PLAYER_W >= ARENA_W - 10) {
          state.winner = p1;
          running = false;
          ctx.emit('game:state', state);
          ctx.endRound(p1);
          return;
        }
        if (pid === p2 && p.x <= 10) {
          state.winner = p2;
          running = false;
          ctx.emit('game:state', state);
          ctx.endRound(p2);
          return;
        }
      }

      ctx.emit('game:state', state);
    }, TICK_RATE);

    return {
      onPlayerInput(playerId: string, data: unknown): void {
        const input = data as { left?: boolean; right?: boolean; jump?: boolean; attack?: boolean; cycleGuard?: boolean };
        const inp = inputs[playerId];
        if (!inp) return;
        if (input.left !== undefined) inp.left = input.left;
        if (input.right !== undefined) inp.right = input.right;
        if (input.jump !== undefined) inp.jump = input.jump;
        if (input.attack) inp.attack = true;
        if (input.cycleGuard) inp.cycleGuard = true;
      },
      getState() { return state; },
      cleanup(): void {
        running = false;
        clearInterval(interval);
      },
    };
  },
};
