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
  const [sentTo, setSentTo] = useState<string | null>(null);
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
      setSentTo(email);
      setStatus('sent');
    } else {
      setStatus('idle');
      setError(result.error);
    }
  }

  function resetSignIn() {
    setStatus('idle');
    setEmail('');
    setSentTo(null);
    setError(null);
  }

  return (
    <div className="screen home-screen">
      <h1 className="title">ARCADE BATTLE</h1>
      <p className="subtitle">1v1 Mini-Game Showdown</p>
      <button className="btn btn-primary" onClick={handleCreateLobby}>
        Create Lobby
      </button>

      <div className="auth-card">
        {user ? (
          <div className="user-info">
            {user.avatarUrl && <img src={user.avatarUrl} alt="" className="user-avatar" />}
            <span className="user-name">{user.displayName}</span>
            <button className="btn btn-small" onClick={() => game.setScreen('profile')}>Profile</button>
            <button className="btn btn-small" onClick={logout}>Sign Out</button>
          </div>
        ) : status === 'sent' ? (
          <div className="sign-in-sent">
            <svg
              className="sign-in-icon"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <rect x="2" y="4" width="20" height="16" rx="2" />
              <path d="m22 7-10 5L2 7" />
            </svg>
            <h2 className="sign-in-heading">Check your inbox</h2>
            <p className="sign-in-body">
              A sign-in link is on its way to <strong>{sentTo}</strong>. It expires in 15 minutes.
            </p>
            <button type="button" className="link-button" onClick={resetSignIn}>
              Use a different email
            </button>
          </div>
        ) : (
          <form className="sign-in-form" onSubmit={handleSendLink} noValidate>
            <h2 className="sign-in-heading">Sign in</h2>
            <p className="sign-in-body">
              Save your name, avatar, and match history. We'll email you a one-time link &mdash; no password.
            </p>
            <input
              type="email"
              className="email-input"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              disabled={status === 'sending'}
            />
            <button className="btn btn-magic" type="submit" disabled={status === 'sending' || !email}>
              {status === 'sending' ? 'Sending…' : 'Email me a sign-in link'}
            </button>
            {error && <p className="sign-in-error" role="alert">{error}</p>}
          </form>
        )}
      </div>
    </div>
  );
}
