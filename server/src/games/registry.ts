import type { ServerGameModule, GameSet } from '@arcade-battle/shared';
import { DEFAULT_GAME_SET_ID } from '@arcade-battle/shared';
import { pongGame } from './pong.js';
import { aimTrainerGame } from './aim-trainer.js';
import { joustGame } from './joust.js';
import { airHockeyGame } from './air-hockey.js';
import { volleyballGame } from './volleyball.js';
import { ballBrawlGame } from './ball-brawl.js';
import { fencingGame } from './fencing.js';
import { asteroidDodgeGame } from './asteroid-dodge.js';
import { flappyRaceGame } from './flappy-race.js';
import { spaceInvadersGame } from './space-invaders.js';
import { cowboyShootoutGame } from './cowboy-shootout.js';
import { arrowSequenceGame } from './arrow-sequence.js';

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
gameRegistry.register(ballBrawlGame);
gameRegistry.register(fencingGame);
gameRegistry.register(asteroidDodgeGame);
gameRegistry.register(flappyRaceGame);
gameRegistry.register(spaceInvadersGame);
gameRegistry.register(cowboyShootoutGame);
gameRegistry.register(arrowSequenceGame);

// Register game sets
gameRegistry.registerSet({
  id: DEFAULT_GAME_SET_ID,
  name: 'All Games',
  description: 'All available mini-games',
  gameIds: [],
});
