import { useEffect, useRef } from 'react';
import { useSocket } from './context/SocketContext.tsx';
import { GameProvider, useGame } from './context/GameContext.tsx';
import { Routes, Route, useParams } from 'react-router-dom';
import type { LobbyState, TransitionData, MatchEndData } from '@arcade-battle/shared';
import HomeScreen from './screens/HomeScreen.tsx';
import LobbyScreen from './screens/LobbyScreen.tsx';
import LobbyNotFoundScreen from './screens/LobbyNotFoundScreen.tsx';
import TransitionScreen from './screens/TransitionScreen.tsx';
import PlayingScreen from './screens/PlayingScreen.tsx';
import GameOverScreen from './screens/GameOverScreen.tsx';
import ProfileScreen from './screens/ProfileScreen.tsx';
import AuthCallbackScreen from './screens/AuthCallbackScreen.tsx';
import './App.css';

function AppRoutes() {
  const socket = useSocket();
  const game = useGame();

  useEffect(() => {
    socket.on('lobby:state', (state: LobbyState) => {
      game.setLobbyState(state);
    });

    socket.on('match:transition', (data: TransitionData) => {
      game.setTransitionData(data);
      game.setScreen('transition');
    });

    socket.on('match:roundStart', ({ gameId }: { gameId: string }) => {
      game.setCurrentGameId(gameId);
      game.setScreen('playing');
    });

    socket.on('match:end', (data: MatchEndData) => {
      game.setMatchEndData(data);
      game.setScreen('gameOver');
    });

    socket.on('lobby:error', ({ message }: { message: string }) => {
      game.setLobbyError(message);
      game.setScreen('lobbyNotFound');
    });

    return () => {
      socket.off('lobby:state');
      socket.off('match:transition');
      socket.off('match:roundStart');
      socket.off('match:end');
      socket.off('lobby:error');
    };
  }, [socket]);

  return (
    <div className="app">
      {game.screen === 'home' && <HomeScreen />}
      {game.screen === 'lobby' && <LobbyScreen />}
      {game.screen === 'lobbyNotFound' && <LobbyNotFoundScreen />}
      {game.screen === 'transition' && <TransitionScreen />}
      {game.screen === 'playing' && <PlayingScreen />}
      {game.screen === 'gameOver' && <GameOverScreen />}
      {game.screen === 'profile' && <ProfileScreen />}
    </div>
  );
}

function LobbyJoinHandler() {
  const socket = useSocket();
  const game = useGame();
  const { lobbyId } = useParams();
  const joinedRef = useRef(false);

  useEffect(() => {
    if (lobbyId && !joinedRef.current) {
      joinedRef.current = true;
      socket.emit('lobby:join', { lobbyId });
      game.setScreen('lobby');
    }
  }, [lobbyId]);

  return <AppRoutes />;
}

function App() {
  return (
    <GameProvider>
      <Routes>
        <Route path="/lobby/:lobbyId" element={<LobbyJoinHandler />} />
        <Route path="/auth/callback" element={<AuthCallbackScreen />} />
        <Route path="*" element={<AppRoutes />} />
      </Routes>
    </GameProvider>
  );
}

export default App;
