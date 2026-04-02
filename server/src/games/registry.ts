import type { ServerGameModule, GameSet } from '@arcade-battle/shared';
import { DEFAULT_GAME_SET_ID } from '@arcade-battle/shared';
import { pongGame } from './pong.js';
import { aimTrainerGame } from './aim-trainer.js';
import { joustGame } from './joust.js';
import { airHockeyGame } from './air-hockey.js';
import { volleyballGame } from './volleyball.js';
import { asteroidDodgeGame } from './asteroid-dodge.js';
import { flappyRaceGame } from './flappy-race.js';
import { spaceInvadersGame } from './space-invaders.js';
import { cowboyShootoutGame } from './cowboy-shootout.js';
import { arrowSequenceGame } from './arrow-sequence.js';
import { rhythmGame } from './rhythm.js';
import { typingRaceGame } from './typing-race.js';
import { memoryArrowsGame } from './memory-arrows.js';
import { tanksGame } from './tanks.js';
import { laneRacerGame } from './lane-racer.js';
import { asteroidsGame } from './asteroids.js';
// mountain-climber removed
// import { mountainClimberGame } from './mountain-climber.js';
// ninja removed for rework
// import { ninjaGame } from './ninja.js';
import { bossBattleGame } from './boss-battle.js';
import { spaceBossGame } from './space-boss.js';
import { spelunkyGame } from './spelunky.js';
import { racingGame } from './racing.js';
import { balanceGame } from './balance.js';
// cityscape removed for rework
// import { cityscapeGame } from './cityscape.js';
import { quiltGame } from './quilt.js';
import { wordGuessGame } from './word-guess.js';
import { roundsGame } from './rounds.js';
import { controlPanelGame } from './control-panel.js';

class GameRegistry {
  private games = new Map<string, ServerGameModule>();
  private sets = new Map<string, GameSet>();

  register(game: ServerGameModule): void {
    this.games.set(game.info.id, game);
  }

  registerSet(set: GameSet): void {
    this.sets.set(set.id, set);
  }

  get(id: string): ServerGameModule | undefined {
    return this.games.get(id);
  }

  getAll(): ServerGameModule[] {
    return Array.from(this.games.values());
  }

  getGameSets(): GameSet[] {
    return Array.from(this.sets.values());
  }

  getGamesForSet(setId: string): ServerGameModule[] {
    const set = this.sets.get(setId);
    if (!set || set.gameIds.length === 0) {
      return this.getAll();
    }
    return set.gameIds
      .map((id) => this.games.get(id))
      .filter((g): g is ServerGameModule => g !== undefined);
  }
}

export const gameRegistry = new GameRegistry();

// Register all games
gameRegistry.register(pongGame);
gameRegistry.register(aimTrainerGame);
gameRegistry.register(joustGame);
gameRegistry.register(airHockeyGame);
gameRegistry.register(volleyballGame);
gameRegistry.register(asteroidDodgeGame);
gameRegistry.register(flappyRaceGame);
gameRegistry.register(spaceInvadersGame);
gameRegistry.register(cowboyShootoutGame);
gameRegistry.register(arrowSequenceGame);
gameRegistry.register(rhythmGame);
gameRegistry.register(typingRaceGame);
gameRegistry.register(memoryArrowsGame);
gameRegistry.register(tanksGame);
gameRegistry.register(laneRacerGame);
gameRegistry.register(asteroidsGame);
// gameRegistry.register(mountainClimberGame);
// gameRegistry.register(ninjaGame);
gameRegistry.register(bossBattleGame);
gameRegistry.register(spaceBossGame);
gameRegistry.register(spelunkyGame);
gameRegistry.register(racingGame);
gameRegistry.register(balanceGame);
// gameRegistry.register(cityscapeGame);
gameRegistry.register(quiltGame);
gameRegistry.register(wordGuessGame);
gameRegistry.register(roundsGame);
gameRegistry.register(controlPanelGame);

// Register game sets
gameRegistry.registerSet({
  id: DEFAULT_GAME_SET_ID,
  name: 'All Games',
  description: 'All available mini-games',
  gameIds: [],
});

gameRegistry.registerSet({
  id: 'basic',
  name: 'Basic',
  description: 'Simple, self-explanatory games with no learning curve',
  gameIds: [
    'pong',
    'aim-trainer',
    'volleyball',
    'asteroid-dodge',
    'flappy-race',
    'lane-racer',
    'arrow-sequence',
    'typing-race',
    'memory-arrows',
    'balance',
  ],
});

gameRegistry.registerSet({
  id: 'standard',
  name: 'Standard',
  description: 'All straightforward games — skips bullet hells, complex platformers, and puzzles',
  gameIds: [
    // Basic games
    'pong',
    'aim-trainer',
    'volleyball',
    'asteroid-dodge',
    'flappy-race',
    'lane-racer',
    'arrow-sequence',
    'typing-race',
    'memory-arrows',
    'balance',
    // Plus mid-complexity games
    'joust',
    'air-hockey',
    'space-invaders',
    'cowboy-shootout',
    'rhythm',
    'tanks',
    'rounds',
    'word-guess',
    'control-panel',
    'spelunky',
  ],
});

gameRegistry.registerSet({
  id: 'mouseless',
  name: 'Keyboard Only',
  description: 'No mouse needed — all games playable with keyboard alone',
  gameIds: [
    'pong',
    'volleyball',
    'joust',
    'asteroid-dodge',
    'flappy-race',
    'space-invaders',
    'arrow-sequence',
    'rhythm',
    'typing-race',
    'memory-arrows',
    'tanks',
    'lane-racer',
    'asteroids',
    'boss-battle',
    'space-boss',
    'spelunky',
    'racing',
    'balance',
    'word-guess',
    'rounds',
  ],
});
