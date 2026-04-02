import { useGame } from '../context/GameContext.tsx';
import { gameComponents } from '../games/registry.tsx';

export default function PlayingScreen() {
  const game = useGame();
  const GameComponent = game.currentGameId ? gameComponents[game.currentGameId] : null;
  const controls = game.transitionData?.controls;

  if (!GameComponent) {
    return <div className="screen">Loading game...</div>;
  }

  return (
    <div className="screen playing-screen">
      <GameComponent />
      {controls && (
        <div className="controls-sidebar">
          {controls}
        </div>
      )}
    </div>
  );
}
