import { useEffect, useRef } from 'react';
import { useSocket } from '../context/SocketContext.tsx';
import { useGame } from '../context/GameContext.tsx';
import { gameComponents } from '../games/registry.tsx';

export default function PlayingScreen() {
  const socket = useSocket();
  const game = useGame();
  const GameComponent = game.currentGameId ? gameComponents[game.currentGameId] : null;
  const controls = game.transitionData?.controls;
  const hasReceivedState = useRef(false);

  // Safety net: if no game:state received within 2s, request resync
  useEffect(() => {
    hasReceivedState.current = false;

    function onState() { hasReceivedState.current = true; }
    socket.on('game:state', onState);

    const timer = setTimeout(() => {
      if (!hasReceivedState.current) {
        console.log('No game state received — requesting resync');
        socket.emit('game:resync');
      }
    }, 2000);

    // Also request resync on socket reconnect
    function onReconnect() {
      console.log('Socket reconnected — requesting resync');
      socket.emit('game:resync');
    }
    socket.io.on('reconnect', onReconnect);

    return () => {
      clearTimeout(timer);
      socket.off('game:state', onState);
      socket.io.off('reconnect', onReconnect);
    };
  }, [socket, game.currentGameId]);

  if (!GameComponent) {
    return <div className="screen">Loading game...</div>;
  }

  return (
    <div className="screen playing-screen">
      <GameComponent />
      {controls && (
        <div className="controls-sidebar">
          {controls}
        </div>
      )}
    </div>
  );
}
