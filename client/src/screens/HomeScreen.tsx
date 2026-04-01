import { useSocket } from '../context/SocketContext.tsx';
import { useAuth } from '../context/AuthContext.tsx';
import { useGame } from '../context/GameContext.tsx';
import { useNavigate } from 'react-router-dom';

export default function HomeScreen() {
  const socket = useSocket();
  const { user, login, logout } = useAuth();
  const game = useGame();
  const navigate = useNavigate();

  function handleCreateLobby() {
    socket.emit('lobby:create', (lobbyId: string) => {
      game.setScreen('lobby');
      navigate(`/lobby/${lobbyId}`);
    });
  }

  return (
    <div className="screen home-screen">
      <h1 className="title">ARCADE BATTLE</h1>
      <p className="subtitle">1v1 Mini-Game Showdown</p>
      <button className="btn btn-primary" onClick={handleCreateLobby}>
        Create Lobby
      </button>

      <div className="auth-section">
        {user ? (
          <div className="user-info">
            {user.avatarUrl && <img src={user.avatarUrl} alt="" className="user-avatar" />}
            <span className="user-name">{user.displayName}</span>
            <button className="btn btn-small" onClick={logout}>Sign Out</button>
          </div>
        ) : (
          <div className="sign-in-options">
            <p className="sign-in-label">Sign in for a persistent identity</p>
            <div className="sign-in-buttons">
              <button className="btn btn-oauth" onClick={() => login('google')}>
                Sign in with Google
              </button>
              <button className="btn btn-oauth" onClick={() => login('discord')}>
                Sign in with Discord
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
