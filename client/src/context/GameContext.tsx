import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import type { LobbyState, TransitionData, MatchEndData } from '@arcade-battle/shared';

type AppScreen = 'home' | 'lobby' | 'lobbyNotFound' | 'transition' | 'playing' | 'gameOver';

interface GameContextValue {
  screen: AppScreen;
  setScreen: (s: AppScreen) => void;
  lobbyState: LobbyState | null;
  setLobbyState: (s: LobbyState | null) => void;
  transitionData: TransitionData | null;
  setTransitionData: (d: TransitionData | null) => void;
  currentGameId: string | null;
  setCurrentGameId: (id: string | null) => void;
  matchEndData: MatchEndData | null;
  setMatchEndData: (d: MatchEndData | null) => void;
  lobbyError: string | null;
  setLobbyError: (e: string | null) => void;
  resetMatchState: () => void;
}

const GameContext = createContext<GameContextValue | null>(null);

export function GameProvider({ children }: { children: ReactNode }) {
  const [screen, setScreen] = useState<AppScreen>('home');
  const [lobbyState, setLobbyState] = useState<LobbyState | null>(null);
  const [transitionData, setTransitionData] = useState<TransitionData | null>(null);
  const [currentGameId, setCurrentGameId] = useState<string | null>(null);
  const [matchEndData, setMatchEndData] = useState<MatchEndData | null>(null);
  const [lobbyError, setLobbyError] = useState<string | null>(null);

  const resetMatchState = useCallback(() => {
    setTransitionData(null);
    setCurrentGameId(null);
    setMatchEndData(null);
  }, []);

  return (
    <GameContext.Provider
      value={{
        screen, setScreen,
        lobbyState, setLobbyState,
        transitionData, setTransitionData,
        currentGameId, setCurrentGameId,
        matchEndData, setMatchEndData,
        lobbyError, setLobbyError,
        resetMatchState,
      }}
    >
      {children}
    </GameContext.Provider>
  );
}

export function useGame(): GameContextValue {
  const ctx = useContext(GameContext);
  if (!ctx) throw new Error('useGame must be used within GameProvider');
  return ctx;
}
