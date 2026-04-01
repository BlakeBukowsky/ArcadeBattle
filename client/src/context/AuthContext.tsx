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
  updateProfile: (displayName: string, avatarUrl?: string) => Promise<boolean>;
  uploadAvatar: (file: File) => Promise<string | null>;
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
      .then((data: AuthUser & { refreshedToken?: string }) => {
        setUser(data);
        // Auto-refresh: server sends a new token if the old one is aging
        if (data.refreshedToken) {
          localStorage.setItem(TOKEN_KEY, data.refreshedToken);
          setToken(data.refreshedToken);
        }
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

  const updateProfile = useCallback(async (displayName: string, avatarUrl?: string): Promise<boolean> => {
    if (!token) return false;
    try {
      const res = await fetch(`${SERVER_URL}/auth/profile`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ displayName, avatarUrl }),
      });
      if (!res.ok) return false;
      const updated = await res.json() as AuthUser;
      setUser(updated);
      return true;
    } catch {
      return false;
    }
  }, [token]);

  const uploadAvatar = useCallback(async (file: File): Promise<string | null> => {
    if (!token) return null;
    try {
      // Resize client-side to 256x256 before uploading
      const resized = await resizeImage(file, 256);
      const formData = new FormData();
      formData.append('avatar', resized, `avatar.${file.type === 'image/png' ? 'png' : 'jpg'}`);

      const res = await fetch(`${SERVER_URL}/auth/avatar`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      if (!res.ok) return null;
      const { avatarUrl } = await res.json() as { avatarUrl: string };

      // Update local user state with cache-busted URL
      setUser((prev) => prev ? { ...prev, avatarUrl: `${avatarUrl}?t=${Date.now()}` } : prev);
      return avatarUrl;
    } catch {
      return null;
    }
  }, [token]);

  return (
    <AuthContext.Provider value={{ user, token, isLoading, login, logout, updateProfile, uploadAvatar }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

/**
 * Resize an image file to a square of the given size using an offscreen canvas.
 * Crops to center square, then scales down. Returns a Blob.
 */
function resizeImage(file: File, size: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d')!;

      // Crop to center square
      const min = Math.min(img.width, img.height);
      const sx = (img.width - min) / 2;
      const sy = (img.height - min) / 2;

      ctx.drawImage(img, sx, sy, min, min, 0, 0, size, size);

      canvas.toBlob(
        (blob) => {
          if (blob) resolve(blob);
          else reject(new Error('Failed to create blob'));
        },
        file.type === 'image/png' ? 'image/png' : 'image/jpeg',
        0.85,
      );
    };
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = URL.createObjectURL(file);
  });
}
