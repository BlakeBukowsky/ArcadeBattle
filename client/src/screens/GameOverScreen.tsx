import { useSocket, useMyId } from '../context/SocketContext.tsx';
import { useGame } from '../context/GameContext.tsx';
import { useNavigate } from 'react-router-dom';

export default function GameOverScreen() {
  const socket = useSocket();
  const myId = useMyId();
  const game = useGame();
  const navigate = useNavigate();
  const data = game.matchEndData;

  if (!data) return null;

  const isWinner = data.winnerId === myId;
  const players = Object.keys(data.finalScore);

  const lobbyPlayers = game.lobbyState?.players ?? [];
  function getName(pid: string): string {
    const p = lobbyPlayers.find((lp) => lp.id === pid);
    return p ? p.displayName : (pid === myId ? 'You' : 'Opponent');
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
          </div>
        ))}
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
