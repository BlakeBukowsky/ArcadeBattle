import type { ComponentType } from 'react';
import PongGame from './PongGame.tsx';
import AimTrainerGame from './AimTrainerGame.tsx';
import JoustGame from './JoustGame.tsx';
import AirHockeyGame from './AirHockeyGame.tsx';
import VolleyballGame from './VolleyballGame.tsx';
import AsteroidDodgeGame from './AsteroidDodgeGame.tsx';
import FlappyRaceGame from './FlappyRaceGame.tsx';
import SpaceInvadersGame from './SpaceInvadersGame.tsx';
import CowboyShootoutGame from './CowboyShootoutGame.tsx';
import ArrowSequenceGame from './ArrowSequenceGame.tsx';
import RhythmGame from './RhythmGame.tsx';
import TypingRaceGame from './TypingRaceGame.tsx';
import MemoryArrowsGame from './MemoryArrowsGame.tsx';
import TanksGame from './TanksGame.tsx';
import LaneRacerGame from './LaneRacerGame.tsx';
import AsteroidsGame from './AsteroidsGame.tsx';
import MountainClimberGame from './MountainClimberGame.tsx';
import NinjaGame from './NinjaGame.tsx';
import BossBattleGame from './BossBattleGame.tsx';

export const gameComponents: Record<string, ComponentType> = {
  'pong': PongGame,
  'aim-trainer': AimTrainerGame,
  'joust': JoustGame,
  'air-hockey': AirHockeyGame,
  'volleyball': VolleyballGame,
  'asteroid-dodge': AsteroidDodgeGame,
  'flappy-race': FlappyRaceGame,
  'space-invaders': SpaceInvadersGame,
  'cowboy-shootout': CowboyShootoutGame,
  'arrow-sequence': ArrowSequenceGame,
  'rhythm': RhythmGame,
  'typing-race': TypingRaceGame,
  'memory-arrows': MemoryArrowsGame,
  'tanks': TanksGame,
  'lane-racer': LaneRacerGame,
  'asteroids': AsteroidsGame,
  'mountain-climber': MountainClimberGame,
  'ninja': NinjaGame,
  'boss-battle': BossBattleGame,
};
