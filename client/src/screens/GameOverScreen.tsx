import { useState } from 'react';
import { useSocket, useMyId } from '../context/SocketContext.tsx';
import { useAuth } from '../context/AuthContext.tsx';
import { useGame } from '../context/GameContext.tsx';
import { useNavigate } from 'react-router-dom';

const SERVER_URL = import.meta.env.VITE_SERVER_URL || window.location.origin;

export default function GameOverScreen() {
  const socket = useSocket();
  const myId = useMyId();
  const { token } = useAuth();
  const game = useGame();
  const navigate = useNavigate();
  const data = game.matchEndData;

  const [ratings, setRatings] = useState<Record<number, 1 | -1>>({});
  const [showBugReport, setShowBugReport] = useState(false);
  const [bugText, setBugText] = useState('');
  const [bugSubmitted, setBugSubmitted] = useState(false);

  if (!data) return null;

  const isWinner = data.winnerId === myId;
  const players = Object.keys(data.finalScore);

  const lobbyPlayers = game.lobbyState?.players ?? [];
  function getName(pid: string): string {
    const p = lobbyPlayers.find((lp) => lp.id === pid);
    return p ? p.displayName : (pid === myId ? 'You' : 'Opponent');
  }

  function feedbackHeaders(): HeadersInit {
    const h: HeadersInit = { 'Content-Type': 'application/json' };
    if (token) h['Authorization'] = `Bearer ${token}`;
    return h;
  }

  function feedbackBody(extra: Record<string, unknown>): string {
    const base: Record<string, unknown> = { ...extra };
    if (!token) base.guestId = myId;
    return JSON.stringify(base);
  }

  function submitRating(roundIndex: number, round: { gameId: string; gameName: string }, value: 1 | -1) {
    // Toggle if same rating clicked again
    if (ratings[roundIndex] === value) {
      setRatings((prev) => { const next = { ...prev }; delete next[roundIndex]; return next; });
      return;
    }
    setRatings((prev) => ({ ...prev, [roundIndex]: value }));
    fetch(`${SERVER_URL}/api/feedback/rating`, {
      method: 'POST',
      headers: feedbackHeaders(),
      body: feedbackBody({ gameId: round.gameId, gameName: round.gameName, roundNumber: roundIndex + 1, rating: value }),
    }).catch(() => {});
  }

  function submitBugReport() {
    if (!bugText.trim()) return;
    fetch(`${SERVER_URL}/api/feedback/bug`, {
      method: 'POST',
      headers: feedbackHeaders(),
      body: feedbackBody({ message: bugText.trim() }),
    }).catch(() => {});
    setShowBugReport(false);
    setBugText('');
    setBugSubmitted(true);
  }

  function handlePlayAgain() {
    socket.emit('match:playAgain');
    game.resetMatchState();
    game.setScreen('lobby');
  }

  function handleHome() {
    socket.emit('lobby:leave');
    game.resetMatchState();
    game.setLobbyState(null);
    game.setScreen('home');
    navigate('/');
  }

  return (
    <div className={`screen game-over-screen ${isWinner ? 'win' : 'lose'}`}>
      <h1>{isWinner ? 'VICTORY!' : 'DEFEAT'}</h1>

      <div className="final-score">
        {players.map((pid, i) => (
          <span key={pid}>
            {i > 0 && <span className="score-divider"> - </span>}
            <span className="score-player">{getName(pid)}: {data.finalScore[pid]}</span>
          </span>
        ))}
      </div>

      <div className="round-history">
        <h2>Rounds</h2>
        {data.rounds.map((round, i) => (
          <div key={i} className={`round-entry ${round.winnerId === myId ? 'won' : 'lost'}`}>
            <span className="round-number">Round {i + 1}</span>
            <span className="round-game">{round.gameName}</span>
            <span className="round-result">
              {round.winnerId === myId ? 'Won' : 'Lost'}
            </span>
            <span className="round-feedback">
              <button
                className={`feedback-btn ${ratings[i] === 1 ? 'active up' : ''}`}
                onClick={() => submitRating(i, round, 1)}
                title="Fun game!"
              >👍</button>
              <button
                className={`feedback-btn ${ratings[i] === -1 ? 'active down' : ''}`}
                onClick={() => submitRating(i, round, -1)}
                title="Not fun"
              >👎</button>
            </span>
          </div>
        ))}
      </div>

      <div className="feedback-section">
        {!showBugReport && !bugSubmitted && (
          <button className="btn btn-small bug-report-toggle" onClick={() => setShowBugReport(true)}>
            Report a Bug
          </button>
        )}
        {showBugReport && (
          <div className="bug-report-panel">
            <textarea
              className="bug-report-input"
              placeholder="Describe the issue..."
              value={bugText}
              onChange={(e) => setBugText(e.target.value)}
              maxLength={2000}
              rows={3}
            />
            <div className="bug-report-actions">
              <button className="btn btn-small" onClick={() => setShowBugReport(false)}>Cancel</button>
              <button className="btn btn-small btn-submit-bug" disabled={!bugText.trim()} onClick={submitBugReport}>Submit</button>
            </div>
          </div>
        )}
        {bugSubmitted && <span className="bug-report-thanks">Thanks for the report!</span>}
      </div>

      <div className="game-over-actions">
        <button className="btn btn-primary" onClick={handlePlayAgain}>
          Play Again
        </button>
        <button className="btn btn-secondary" onClick={handleHome}>
          Home
        </button>
      </div>
    </div>
  );
}
