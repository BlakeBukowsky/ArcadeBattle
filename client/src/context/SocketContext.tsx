import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { io, type Socket } from 'socket.io-client';
import { useAuth } from './AuthContext.tsx';
import type { AuthUser } from '@arcade-battle/shared';

const SERVER_URL = import.meta.env.VITE_SERVER_URL || window.location.origin;
const GUEST_ID_KEY = 'arcade-battle-guest-id';
const GUEST_NAME_KEY = 'arcade-battle-guest-name';

interface SocketContextValue {
  socket: Socket;
  myId: string;
}

const SocketContext = createContext<SocketContextValue | null>(null);

export function SocketProvider({ children }: { children: ReactNode }) {
  const { token, isLoading } = useAuth();
  const [socket, setSocket] = useState<Socket | null>(null);
  const [myId, setMyId] = useState<string | null>(null);
  const identityRef = useRef<{ id: string; name: string } | null>(null);

  useEffect(() => {
    if (isLoading) return;

    // For guests, send stored identity so we get the same ID back on reconnect
    const storedGuestId = localStorage.getItem(GUEST_ID_KEY);
    const storedGuestName = localStorage.getItem(GUEST_NAME_KEY);

    const s = io(SERVER_URL, {
      auth: token
        ? { token }
        : {
            guestId: storedGuestId ?? undefined,
            guestName: storedGuestName ?? undefined,
          },
    });

    s.on('auth:identity', (identity: AuthUser) => {
      setMyId(identity.id);
      identityRef.current = { id: identity.id, name: identity.displayName };

      // Store guest identity for reconnection
      if (identity.isGuest) {
        localStorage.setItem(GUEST_ID_KEY, identity.id);
        localStorage.setItem(GUEST_NAME_KEY, identity.displayName);
      }
    });

    setSocket(s);

    return () => {
      s.disconnect();
      setSocket(null);
      setMyId(null);
    };
  }, [token, isLoading]);

  if (!socket || !myId) return <div className="loading">Connecting...</div>;

  return (
    <SocketContext.Provider value={{ socket, myId }}>
      {children}
    </SocketContext.Provider>
  );
}

export function useSocket(): Socket {
  const ctx = useContext(SocketContext);
  if (!ctx) throw new Error('useSocket must be used within SocketProvider');
  return ctx.socket;
}

export function useMyId(): string {
  const ctx = useContext(SocketContext);
  if (!ctx) throw new Error('useMyId must be used within SocketProvider');
  return ctx.myId;
}
