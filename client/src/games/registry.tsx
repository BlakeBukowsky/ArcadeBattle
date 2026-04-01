import type { ComponentType } from 'react';
import PongGame from './PongGame.tsx';
import AimTrainerGame from './AimTrainerGame.tsx';
import JoustGame from './JoustGame.tsx';
import AirHockeyGame from './AirHockeyGame.tsx';
import VolleyballGame from './VolleyballGame.tsx';
import BallBrawlGame from './BallBrawlGame.tsx';
import FencingGame from './FencingGame.tsx';
import AsteroidDodgeGame from './AsteroidDodgeGame.tsx';
import FlappyRaceGame from './FlappyRaceGame.tsx';
import SpaceInvadersGame from './SpaceInvadersGame.tsx';
import CowboyShootoutGame from './CowboyShootoutGame.tsx';
import ArrowSequenceGame from './ArrowSequenceGame.tsx';

export const gameComponents: Record<string, ComponentType> = {
  'pong': PongGame,
  'aim-trainer': AimTrainerGame,
  'joust': JoustGame,
  'air-hockey': AirHockeyGame,
  'volleyball': VolleyballGame,
  'ball-brawl': BallBrawlGame,
  'fencing': FencingGame,
  'asteroid-dodge': AsteroidDodgeGame,
  'flappy-race': FlappyRaceGame,
  'space-invaders': SpaceInvadersGame,
  'cowboy-shootout': CowboyShootoutGame,
  'arrow-sequence': ArrowSequenceGame,
};
