import type { ServerGameModule, MatchContext, GameInstance } from '@arcade-battle/shared';

const SENTENCE_COUNT = 3;
const STUN_DURATION = 1500; // ms freeze on wrong input
const TICK_RATE = 1000 / 15;

const SENTENCES = [
  'the quick brown fox',
  'pack my box with jugs',
  'bright vixens jump fast',
  'sphinx of black quartz',
  'waltz bad nymph for jigs',
  'glib jocks quiz nymph',
  'two jocks help fax it',
  'quick zephyrs blow daft',
  'jump over the lazy dog',
  'judge my vow of silence',
  'five boxing wizards jump',
  'how vexingly quick zebras',
  'grumpy wizards make brew',
  'major roads on quiet nights',
  'ivory buckles for the prize',
  'love my big sphinx',
  'fix the cupboard hinges',
  'keep examining every bid',
  'black taxis drive up fast',
  'all experts amaze the judge',
  'the moon shines bright',
  'red foxes hunt at dawn',
  'stormy skies above us',
  'frozen lakes and pine trees',
  'run through the open field',
  'cobalt blue winter sky',
  'sharp wind from the north',
  'ancient ruins stand tall',
  'dust settles on the road',
  'waves crash on the shore',
  'hawks circle the valley',
  'swift boats cross the bay',
  'the old clock tower rings',
  'brave knights ride south',
  'silver coins on the table',
  'dark clouds roll in fast',
  'orange sun on the horizon',
  'crisp autumn morning air',
  'the forest hums softly',
  'blue jays sing at dawn',
];

interface PlayerState {
  currentSentence: number;
  inputIndex: number;
  completed: boolean;
  lastCorrect: boolean;
  stunUntil: number; // timestamp when stun ends
}

interface TypingRaceState {
  players: { [id: string]: PlayerState };
  sentences: string[];
  canvasWidth: number;
  canvasHeight: number;
  winner: string | null;
}

export const typingRaceGame: ServerGameModule = {
  info: {
    id: 'typing-race',
    name: 'Typing Race',
    description: 'Type the sentences as fast as you can! Wrong character resets the current sentence. First to finish all 5 wins. Just type!',
    maxDuration: 90,
  },

  create(ctx: MatchContext): GameInstance {
    const [p1, p2] = ctx.players;
    let running = true;

    // Pick random sentences
    const shuffled = [...SENTENCES].sort(() => Math.random() - 0.5);
    const sentences = shuffled.slice(0, SENTENCE_COUNT);

    const state: TypingRaceState = {
      players: {
        [p1]: { currentSentence: 0, inputIndex: 0, completed: false, lastCorrect: true, stunUntil: 0 },
        [p2]: { currentSentence: 0, inputIndex: 0, completed: false, lastCorrect: true, stunUntil: 0 },
      },
      sentences,
      canvasWidth: 800,
      canvasHeight: 500,
      winner: null,
    };

    const interval = setInterval(() => {
      if (!running) return;
      ctx.emit('game:state', state);
    }, TICK_RATE);

    return {
      onPlayerInput(playerId: string, data: unknown): void {
        if (!running) return;
        const input = data as { char?: string };
        if (!input.char || input.char.length !== 1) return;

        const p = state.players[playerId];
        if (!p || p.completed) return;

        // Stunned — ignore input
        if (Date.now() < p.stunUntil) return;

        const currentSentence = state.sentences[p.currentSentence];
        const expected = currentSentence[p.inputIndex];

        if (input.char === expected) {
          p.inputIndex++;
          p.lastCorrect = true;

          if (p.inputIndex >= currentSentence.length) {
            p.currentSentence++;
            p.inputIndex = 0;

            if (p.currentSentence >= SENTENCE_COUNT) {
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
          // Wrong — stun instead of reset
          p.lastCorrect = false;
          p.stunUntil = Date.now() + STUN_DURATION;
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
