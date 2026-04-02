import { useState } from 'react';
import { useSocket, useMyId } from '../context/SocketContext.tsx';
import { useGame } from '../context/GameContext.tsx';
import { useNavigate } from 'react-router-dom';
import { MIN_POINTS_TO_WIN, MAX_POINTS_TO_WIN } from '@arcade-battle/shared';

export default function LobbyScreen() {
  const socket = useSocket();
  const myId = useMyId();
  const game = useGame();
  const navigate = useNavigate();
  const [copied, setCopied] = useState(false);
  const lobbyState = game.lobbyState;

  if (!lobbyState) return <div className="screen">Loading lobby...</div>;

  const inviteUrl = `${window.location.origin}/lobby/${lobbyState.lobbyId}`;
  const myPlayer = lobbyState.players.find((p) => p.id === myId);
  const myStatus = myPlayer?.status ?? 'notReady';
  const isHost = lobbyState.isHost;

  const everyoneInLobby = lobbyState.players.length === 2 &&
    lobbyState.players.every((p) => p.status !== 'endScreen');

  function handleReady() {
    if (myStatus === 'ready') {
      socket.emit('lobby:unready');
    } else {
      socket.emit('lobby:ready');
    }
  }

  function handleCopy() {
    navigator.clipboard.writeText(inviteUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handlePointsChange(e: React.ChangeEvent<HTMLInputElement>) {
    socket.emit('lobby:config', { pointsToWin: Number(e.target.value) });
  }

  function statusLabel(status: string): string {
    switch (status) {
      case 'ready': return 'READY';
      case 'endScreen': return 'End Screen';
      default: return 'Not Ready';
    }
  }

  function statusClass(status: string): string {
    switch (status) {
      case 'ready': return 'ready';
      case 'endScreen': return 'end-screen';
      default: return '';
    }
  }

  return (
    <div className="screen lobby-screen">
      <h1>Lobby</h1>

      <div className="invite-box">
        <p>Send this link to your opponent:</p>
        <div className="invite-link">
          <code>{inviteUrl}</code>
          <button className="btn btn-small" onClick={handleCopy}>
            {copied ? 'Copied!' : 'Copy'}
          </button>
        </div>
      </div>

      <div className="players">
        {lobbyState.players.map((player) => (
          <div key={player.id} className={`player-card ${statusClass(player.status)}`}>
            {player.avatarUrl && <img src={player.avatarUrl} alt="" className="player-avatar" />}
            <span className="player-label">{player.displayName}</span>
            <span className="player-status">{statusLabel(player.status)}</span>
            {player.id === myId && <span className="you-tag">(You)</span>}
          </div>
        ))}
        {lobbyState.players.length < 2 && (
          <div className="player-card empty">
            <span className="player-label">Waiting for opponent...</span>
          </div>
        )}
      </div>

      <div className="lobby-config">
        <div className="config-row">
          <label>Points to Win</label>
          <div className="slider-group">
            <input
              type="range"
              min={MIN_POINTS_TO_WIN}
              max={MAX_POINTS_TO_WIN}
              step={1}
              value={lobbyState.config.pointsToWin}
              onChange={handlePointsChange}
              disabled={!isHost}
              className="points-slider"
            />
            <span className="slider-value">{lobbyState.config.pointsToWin}</span>
          </div>
        </div>
        <div className="config-row config-row-vertical">
          <label>Game Set</label>
          <div className="game-set-options">
            {[
              { id: 'basic', name: 'Basic', desc: 'Simple, self-explanatory games — great for first-timers' },
              { id: 'all', name: 'All Games', desc: 'Every game including complex ones with unique controls' },
            ].map((set) => (
              <button
                key={set.id}
                className={`game-set-btn ${lobbyState.config.gameSetId === set.id ? 'active' : ''}`}
                onClick={() => socket.emit('lobby:config', { gameSetId: set.id })}
                disabled={!isHost}
              >
                <span className="game-set-name">{set.name}</span>
                <span className="game-set-desc">{set.desc}</span>
              </button>
            ))}
          </div>
        </div>
        {!isHost && <p className="config-note">Only the host can change settings</p>}
      </div>

      {lobbyState.status === 'countdown' && lobbyState.countdown !== undefined && (
        <div className="countdown">Starting in {lobbyState.countdown}...</div>
      )}

      {everyoneInLobby && lobbyState.status === 'waiting' && (
        <button className={`btn ${myStatus === 'ready' ? 'btn-secondary' : 'btn-primary'}`} onClick={handleReady}>
          {myStatus === 'ready' ? 'Cancel Ready' : 'Ready Up!'}
        </button>
      )}

      <button className="btn btn-secondary btn-small lobby-home-btn" onClick={() => {
        socket.emit('lobby:leave');
        game.setLobbyState(null);
        game.setScreen('home');
        navigate('/');
      }}>
        Home
      </button>
    </div>
  );
}
