import type { ServerGameModule, MatchContext, GameInstance } from '@arcade-battle/shared';

const SEQUENCE_COUNT = 5;
const SEQUENCE_LENGTH_START = 4;
const SEQUENCE_LENGTH_GROWTH = 1; // each sequence gets 1 longer
const DIRECTIONS = ['up', 'down', 'left', 'right'] as const;
type Direction = typeof DIRECTIONS[number];
const TICK_RATE = 1000 / 15;

interface PlayerState {
  currentSequence: number;  // which sequence they're on (0-4)
  inputIndex: number;       // how far into the current sequence
  completed: boolean;
}

interface ArrowSequenceState {
  players: { [id: string]: PlayerState };
  sequences: Direction[][];  // shared sequences for both players
  canvasWidth: number;
  canvasHeight: number;
  winner: string | null;
}

export const arrowSequenceGame: ServerGameModule = {
  info: {
    id: 'arrow-sequence',
    name: 'Arrow Sequence',
    description: 'Arrow pattern matching race',
    controls: 'Arrow Keys or WASD. Match the sequence — arrows light up as you go. Wrong input resets. First to clear all 5 wins.',
    maxDuration: 60,
  },

  create(ctx: MatchContext): GameInstance {
    const [p1, p2] = ctx.players;
    let running = true;

    // Generate shared sequences — each one gets longer
    const sequences: Direction[][] = [];
    for (let i = 0; i < SEQUENCE_COUNT; i++) {
      const len = SEQUENCE_LENGTH_START + i * SEQUENCE_LENGTH_GROWTH;
      const seq: Direction[] = [];
      for (let j = 0; j < len; j++) {
        seq.push(DIRECTIONS[Math.floor(Math.random() * DIRECTIONS.length)]);
      }
      sequences.push(seq);
    }

    const state: ArrowSequenceState = {
      players: {
        [p1]: { currentSequence: 0, inputIndex: 0, completed: false },
        [p2]: { currentSequence: 0, inputIndex: 0, completed: false },
      },
      sequences,
      canvasWidth: 800,
      canvasHeight: 500,
      winner: null,
    };

    // Periodic state broadcast so clients stay in sync
    const interval = setInterval(() => {
      if (!running) return;
      ctx.emit('game:state', state);
    }, TICK_RATE);

    return {
      onPlayerInput(playerId: string, data: unknown): void {
        if (!running) return;
        const input = data as { direction?: string };
        if (!input.direction) return;

        const p = state.players[playerId];
        if (!p || p.completed) return;

        const currentSeq = state.sequences[p.currentSequence];
        const expected = currentSeq[p.inputIndex];

        if (input.direction === expected) {
          // Correct input
          p.inputIndex++;

          if (p.inputIndex >= currentSeq.length) {
            // Sequence complete — move to next
            p.currentSequence++;
            p.inputIndex = 0;

            if (p.currentSequence >= SEQUENCE_COUNT) {
              // All sequences cleared — winner!
              p.completed = true;
              running = false;
              state.winner = playerId;
              clearInterval(interval);
              ctx.emit('game:state', state);
              ctx.endRound(playerId);
              return;
            }
          }
        } else {
          // Wrong input — reset current sequence
          p.inputIndex = 0;
        }

        ctx.emit('game:state', state);
      },
      getState() { return state; },
      cleanup(): void {
        running = false;
        clearInterval(interval);
      },
    };
  },
};
