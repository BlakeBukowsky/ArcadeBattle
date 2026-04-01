import { useEffect, useState } from 'react';
import { useMyId } from '../context/SocketContext.tsx';
import { useGame } from '../context/GameContext.tsx';
import { TRANSITION_SECONDS } from '@arcade-battle/shared';

export default function TransitionScreen() {
  const myId = useMyId();
  const game = useGame();
  const data = game.transitionData;
  const [countdown, setCountdown] = useState(TRANSITION_SECONDS);

  useEffect(() => {
    setCountdown(TRANSITION_SECONDS);
    const interval = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) { clearInterval(interval); return 0; }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [data]);

  if (!data) return null;

  const players = Object.keys(data.score);
  const hasPrevResult = data.prevRoundWinner !== undefined;
  const prevWasMe = data.prevRoundWinner === myId;

  // Get display names from lobby state
  const lobbyPlayers = game.lobbyState?.players ?? [];
  function getName(pid: string): string {
    const p = lobbyPlayers.find((lp) => lp.id === pid);
    return p ? p.displayName : (pid === myId ? 'You' : 'Opponent');
  }

  return (
    <div className="screen transition-screen">
      {hasPrevResult && (
        <div className={`prev-result ${prevWasMe ? 'win' : 'lose'}`}>
          {prevWasMe ? 'You won that round!' : 'You lost that round!'}
        </div>
      )}

      <div className="score-display">
        {players.map((pid, i) => (
          <span key={pid}>
            {i > 0 && <span className="score-divider"> - </span>}
            <span className="score-player">{getName(pid)}: {data.score[pid]}</span>
          </span>
        ))}
      </div>

      <div className="round-info">Round {data.round}</div>
      <h1 className="game-title">{data.gameName}</h1>
      <p className="game-desc">{data.description}</p>
      <div className="countdown">Starting in {countdown}...</div>
    </div>
  );
}
