import { useState } from 'react';
import { useSocket } from '../context/SocketContext.tsx';
import { useAuth } from '../context/AuthContext.tsx';
import { useGame } from '../context/GameContext.tsx';
import { useNavigate } from 'react-router-dom';

export default function HomeScreen() {
  const socket = useSocket();
  const { user, requestMagicLink, logout } = useAuth();
  const game = useGame();
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [error, setError] = useState<string | null>(null);

  function handleCreateLobby() {
    socket.emit('lobby:create', (lobbyId: string) => {
      game.setScreen('lobby');
      navigate(`/lobby/${lobbyId}`);
    });
  }

  async function handleSendLink(e: React.FormEvent) {
    e.preventDefault();
    if (status === 'sending') return;
    setStatus('sending');
    setError(null);
    const result = await requestMagicLink(email);
    if (result.ok) {
      setStatus('sent');
    } else {
      setStatus('idle');
      setError(result.error);
    }
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
            <button className="btn btn-small" onClick={() => game.setScreen('profile')}>Profile</button>
            <button className="btn btn-small" onClick={logout}>Sign Out</button>
          </div>
        ) : status === 'sent' ? (
          <div className="sign-in-options">
            <p className="sign-in-label">Check your inbox for a sign-in link.</p>
            <button
              className="btn btn-small"
              onClick={() => { setStatus('idle'); setEmail(''); }}
            >
              Use a different email
            </button>
          </div>
        ) : (
          <form className="sign-in-options" onSubmit={handleSendLink}>
            <p className="sign-in-label">Sign in for a persistent identity</p>
            <div className="sign-in-buttons">
              <input
                type="email"
                className="email-input"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={status === 'sending'}
              />
              <button className="btn btn-magic" type="submit" disabled={status === 'sending' || !email}>
                {status === 'sending' ? 'Sending…' : 'Send Sign-In Link'}
              </button>
            </div>
            {error && <p className="sign-in-error">{error}</p>}
          </form>
        )}
      </div>
    </div>
  );
}
