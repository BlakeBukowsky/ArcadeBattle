import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import type { AuthUser } from '@arcade-battle/shared';

const SERVER_URL = import.meta.env.VITE_SERVER_URL || window.location.origin;
const TOKEN_KEY = 'arcade-battle-token';

interface AuthContextValue {
  user: AuthUser | null;        // null = not yet identified (loading or pre-connect)
  token: string | null;
  isLoading: boolean;
  login: (provider: 'google' | 'discord') => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_KEY));
  const [isLoading, setIsLoading] = useState(!!localStorage.getItem(TOKEN_KEY));

  // Validate stored token on mount
  useEffect(() => {
    if (!token) {
      setIsLoading(false);
      return;
    }

    fetch(`${SERVER_URL}/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => {
        if (!res.ok) throw new Error('Invalid token');
        return res.json();
      })
      .then((data: AuthUser) => {
        setUser(data);
      })
      .catch(() => {
        // Token expired or invalid
        localStorage.removeItem(TOKEN_KEY);
        setToken(null);
      })
      .finally(() => setIsLoading(false));
  }, []);

  // Listen for OAuth popup postMessage
  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      if (event.data?.type !== 'auth:token') return;
      // In production, client and server share an origin. In dev, accept from the dev server.
      const allowedOrigins = [window.location.origin, SERVER_URL];
      if (!allowedOrigins.includes(event.origin) && event.origin !== '') return;
      {
        const newToken = event.data.token as string;
        localStorage.setItem(TOKEN_KEY, newToken);
        setToken(newToken);

        // Fetch user profile
        fetch(`${SERVER_URL}/auth/me`, {
          headers: { Authorization: `Bearer ${newToken}` },
        })
          .then((res) => res.json())
          .then((data: AuthUser) => setUser(data))
          .catch(console.error);
      }
    }

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const login = useCallback((provider: 'google' | 'discord') => {
    const width = 500, height = 600;
    const left = window.screenX + (window.outerWidth - width) / 2;
    const top = window.screenY + (window.outerHeight - height) / 2;
    window.open(
      `${SERVER_URL}/auth/${provider}`,
      'oauth-popup',
      `width=${width},height=${height},left=${left},top=${top}`,
    );
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    setToken(null);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, token, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
