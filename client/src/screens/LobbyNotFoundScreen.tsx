import { useGame } from '../context/GameContext.tsx';
import { useNavigate } from 'react-router-dom';

export default function LobbyNotFoundScreen() {
  const game = useGame();
  const navigate = useNavigate();

  function handleGoHome() {
    game.setLobbyError(null);
    game.setScreen('home');
    navigate('/');
  }

  return (
    <div className="screen lobby-not-found-screen">
      <h1>Lobby Not Found</h1>
      <p className="error-message">
        {game.lobbyError === 'Lobby is full'
          ? 'This lobby is already full.'
          : 'This lobby doesn\'t exist or has expired.'}
      </p>
      <button className="btn btn-primary" onClick={handleGoHome}>
        Back to Home
      </button>
    </div>
  );
}
