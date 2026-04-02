import type { ServerGameModule, MatchContext, GameInstance } from '@arcade-battle/shared';

const DIRECTIONS = ['up', 'down', 'left', 'right'] as const;
type Direction = typeof DIRECTIONS[number];
const START_LENGTH = 3;
const GROWTH = 1;
const REVEAL_INTERVAL = 600; // ms per arrow during watch phase
const PAUSE_BEFORE_INPUT = 500;
const PAUSE_BETWEEN_ROUNDS = 1000;
const INPUT_TIMEOUT = 10000; // 10s after first player finishes
const TICK_RATE = 1000 / 15;

interface PlayerState {
  inputIndex: number;
  alive: boolean;
  failed: boolean;
  completedRound: boolean;
}

interface MemoryState {
  phase: 'watch' | 'input' | 'result';
  sequence: Direction[];
  revealIndex: number;
  round: number;
  players: { [id: string]: PlayerState };
  canvasWidth: number;
  canvasHeight: number;
  winner: string | null;
  timeoutRemaining: number | null; // seconds remaining after first player finishes
}

export const memoryArrowsGame: ServerGameModule = {
  info: {
    id: 'memory-arrows',
    name: 'Memory Arrows',
    description: 'Simon-style memory game with arrows',
    controls: 'Arrow Keys or WASD. Watch the sequence, then repeat from memory. Wrong = eliminated.',
    maxDuration: 120,
  },

  create(ctx: MatchContext): GameInstance {
    const [p1, p2] = ctx.players;
    let running = true;
    let revealTimer: ReturnType<typeof setTimeout> | null = null;
    let inputTimeoutTimer: ReturnType<typeof setTimeout> | null = null;
    let inputTimeoutStart: number | null = null;

    const state: MemoryState = {
      phase: 'watch',
      sequence: [],
      revealIndex: 0,
      round: 0,
      players: {
        [p1]: { inputIndex: 0, alive: true, failed: false, completedRound: false },
        [p2]: { inputIndex: 0, alive: true, failed: false, completedRound: false },
      },
      canvasWidth: 800,
      canvasHeight: 500,
      winner: null,
      timeoutRemaining: null,
    };

    function generateSequence(length: number): Direction[] {
      const seq: Direction[] = [];
      for (let i = 0; i < length; i++) {
        seq.push(DIRECTIONS[Math.floor(Math.random() * DIRECTIONS.length)]);
      }
      return seq;
    }

    function startRound(): void {
      if (!running) return;
      state.round++;
      const length = START_LENGTH + (state.round - 1) * GROWTH;
      state.sequence = generateSequence(length);
      state.revealIndex = 0;
      state.phase = 'watch';

      for (const pid of ctx.players) {
        const p = state.players[pid];
        if (p.alive) {
          p.inputIndex = 0;
          p.failed = false;
          p.completedRound = false;
        }
      }

      ctx.emit('game:state', state);
      revealNext();
    }

    function revealNext(): void {
      if (!running) return;
      revealTimer = setTimeout(() => {
        if (!running) return;
        state.revealIndex++;
        ctx.emit('game:state', state);

        if (state.revealIndex < state.sequence.length) {
          revealNext();
        } else {
          // Done revealing — pause then switch to input
          revealTimer = setTimeout(() => {
            if (!running) return;
            state.phase = 'input';
            ctx.emit('game:state', state);
          }, PAUSE_BEFORE_INPUT);
        }
      }, REVEAL_INTERVAL);
    }

    function startInputTimeout(): void {
      if (inputTimeoutTimer) return; // already running
      inputTimeoutStart = Date.now();
      state.timeoutRemaining = INPUT_TIMEOUT / 1000;
      inputTimeoutTimer = setTimeout(() => {
        if (!running) return;
        // Time's up — any player who hasn't finished fails
        const alive = ctx.players.filter((pid) => state.players[pid].alive);
        for (const pid of alive) {
          const p = state.players[pid];
          if (!p.completedRound && !p.failed) {
            p.failed = true;
          }
        }
        inputTimeoutTimer = null;
        inputTimeoutStart = null;
        state.timeoutRemaining = null;
        resolveRound();
      }, INPUT_TIMEOUT);
    }

    function clearInputTimeout(): void {
      if (inputTimeoutTimer) { clearTimeout(inputTimeoutTimer); inputTimeoutTimer = null; }
      inputTimeoutStart = null;
      state.timeoutRemaining = null;
    }

    function checkRoundEnd(): void {
      const alive = ctx.players.filter((pid) => state.players[pid].alive);

      // Check if all alive players have either completed or failed
      const allDone = alive.every((pid) => {
        const p = state.players[pid];
        return p.completedRound || p.failed;
      });

      if (!allDone) {
        // If one player finished, start timeout for the other
        const anyDone = alive.some((pid) => state.players[pid].completedRound || state.players[pid].failed);
        if (anyDone && !inputTimeoutTimer) startInputTimeout();
        return;
      }

      clearInputTimeout();
      resolveRound();
    }

    function resolveRound(): void {
      // Eliminate failed players
      const alive = ctx.players.filter((pid) => state.players[pid].alive);
      for (const pid of alive) {
        if (state.players[pid].failed) {
          state.players[pid].alive = false;
        }
      }

      const remaining = ctx.players.filter((pid) => state.players[pid].alive);

      if (remaining.length === 0) {
        running = false;
        const p1Progress = state.players[p1].inputIndex;
        const p2Progress = state.players[p2].inputIndex;
        const winner = p1Progress > p2Progress ? p1 : p2Progress > p1Progress ? p2 : Math.random() < 0.5 ? p1 : p2;
        state.winner = winner;
        state.phase = 'result';
        ctx.emit('game:state', state);
        ctx.endRound(winner);
        return;
      }

      if (remaining.length === 1) {
        running = false;
        state.winner = remaining[0];
        state.phase = 'result';
        ctx.emit('game:state', state);
        ctx.endRound(remaining[0]);
        return;
      }

      // Both survived — next round
      state.phase = 'result';
      ctx.emit('game:state', state);
      setTimeout(() => {
        if (running) startRound();
      }, PAUSE_BETWEEN_ROUNDS);
    }

    // Periodic state broadcast
    const interval = setInterval(() => {
      if (!running) return;
      // Update timeout countdown
      if (inputTimeoutStart) {
        state.timeoutRemaining = Math.max(0, (INPUT_TIMEOUT - (Date.now() - inputTimeoutStart)) / 1000);
      }
      ctx.emit('game:state', state);
    }, TICK_RATE);

    // Start first round
    setTimeout(() => startRound(), 500);

    return {
      onPlayerInput(playerId: string, data: unknown): void {
        if (!running || state.phase !== 'input') return;
        const input = data as { direction?: string };
        if (!input.direction) return;

        const p = state.players[playerId];
        if (!p || !p.alive || p.failed || p.completedRound) return;

        const expected = state.sequence[p.inputIndex];

        if (input.direction === expected) {
          p.inputIndex++;
          if (p.inputIndex >= state.sequence.length) {
            p.completedRound = true;
            checkRoundEnd();
          }
        } else {
          // Wrong — failed this round
          p.failed = true;
          checkRoundEnd();
        }

        ctx.emit('game:state', state);
      },
      getState() { return state; },
      cleanup(): void {
        running = false;
        clearInterval(interval);
        if (revealTimer) clearTimeout(revealTimer);
        clearInputTimeout();
      },
    };
  },
};
