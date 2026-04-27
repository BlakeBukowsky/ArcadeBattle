import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import type { AuthUser } from '@arcade-battle/shared';

const SERVER_URL = import.meta.env.VITE_SERVER_URL || window.location.origin;
const TOKEN_KEY = 'arcade-battle-token';

interface AuthContextValue {
  user: AuthUser | null;        // null = not yet identified (loading or pre-connect)
  token: string | null;
  isLoading: boolean;
  requestMagicLink: (email: string) => Promise<{ ok: true } | { ok: false; error: string }>;
  consumeAuthToken: (newToken: string) => Promise<void>;
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

  const consumeAuthToken = useCallback(async (newToken: string) => {
    localStorage.setItem(TOKEN_KEY, newToken);
    setToken(newToken);
    try {
      const res = await fetch(`${SERVER_URL}/auth/me`, {
        headers: { Authorization: `Bearer ${newToken}` },
      });
      if (!res.ok) throw new Error('Token rejected');
      const data = await res.json() as AuthUser;
      setUser(data);
    } catch (err) {
      console.error(err);
      localStorage.removeItem(TOKEN_KEY);
      setToken(null);
      setUser(null);
    }
  }, []);

  const requestMagicLink = useCallback(async (email: string): Promise<{ ok: true } | { ok: false; error: string }> => {
    try {
      const res = await fetch(`${SERVER_URL}/auth/magic-link`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { error?: string };
        return { ok: false, error: data.error || 'Failed to send sign-in email' };
      }
      return { ok: true };
    } catch {
      return { ok: false, error: 'Network error — please try again' };
    }
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
    <AuthContext.Provider value={{ user, token, isLoading, requestMagicLink, consumeAuthToken, logout, updateProfile, uploadAvatar }}>
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
