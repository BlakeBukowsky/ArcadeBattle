import express, { Router } from 'express';
import jwt from 'jsonwebtoken';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { findUserByOAuth, createUserWithOAuth, findUserById, updateUser } from './db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const AVATARS_DIR = path.join(__dirname, '..', 'data', 'avatars');
const MAX_AVATAR_SIZE = 2 * 1024 * 1024; // 2MB
const ALLOWED_MIMES = ['image/png', 'image/jpeg', 'image/webp'];

// Ensure avatars directory exists
fs.mkdirSync(AVATARS_DIR, { recursive: true });

const avatarUpload = multer({
  limits: { fileSize: MAX_AVATAR_SIZE },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIMES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only PNG, JPEG, and WebP images are allowed'));
    }
  },
  storage: multer.memoryStorage(),
});

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
const SERVER_URL = process.env.SERVER_URL
  || (process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : null)
  || 'http://localhost:3001';
const CLIENT_URL = process.env.CLIENT_URL || SERVER_URL;

// ── JWT Utilities ──

export function signToken(userId: string): string {
  return jwt.sign({ sub: userId }, JWT_SECRET, { expiresIn: '7d' });
}

export function verifyToken(token: string): { sub: string } | null {
  try {
    return jwt.verify(token, JWT_SECRET) as { sub: string };
  } catch {
    return null;
  }
}

// ── OAuth callback HTML ──

function callbackHtml(token: string): string {
  // Use opener's own origin as the postMessage target so it works regardless of domain config
  return `<!DOCTYPE html><html><body><script>
    try {
      var target = window.opener ? window.opener.location.origin : '*';
      window.opener.postMessage({ type: 'auth:token', token: '${token}' }, target);
    } catch(e) {
      // Cross-origin — fall back to '*' (safe here since token is only useful for our API)
      window.opener.postMessage({ type: 'auth:token', token: '${token}' }, '*');
    }
    window.close();
  </script><p>Signing in... you can close this window.</p></body></html>`;
}

function errorHtml(message: string): string {
  return `<!DOCTYPE html><html><body><script>
    window.opener.postMessage({ type: 'auth:error', message: '${message}' }, '${CLIENT_URL}');
    window.close();
  </script><p>Error: ${message}</p></body></html>`;
}

// ── Router ──

export function createAuthRouter(): Router {
  const router = Router();

  // ── Google OAuth ──

  router.get('/google', (_req, res) => {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    if (!clientId) { res.status(500).send('Google OAuth not configured'); return; }

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: `${SERVER_URL}/auth/google/callback`,
      response_type: 'code',
      scope: 'openid profile email',
      prompt: 'select_account',
    });
    res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
  });

  router.get('/google/callback', async (req, res) => {
    const code = req.query.code as string;
    if (!code) { res.send(errorHtml('No authorization code')); return; }

    try {
      // Exchange code for tokens
      const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          client_id: process.env.GOOGLE_CLIENT_ID!,
          client_secret: process.env.GOOGLE_CLIENT_SECRET!,
          redirect_uri: `${SERVER_URL}/auth/google/callback`,
          grant_type: 'authorization_code',
        }),
      });
      const tokens = await tokenRes.json() as { access_token: string };

      // Fetch profile
      const profileRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      });
      const profile = await profileRes.json() as { id: string; name: string; email: string; picture: string };

      // Find or create user
      let user = findUserByOAuth('google', profile.id);
      if (!user) {
        user = createUserWithOAuth('google', profile.id, profile.email, profile.name, profile.picture);
      }

      const token = signToken(user.id);
      res.send(callbackHtml(token));
    } catch (err) {
      console.error('Google OAuth error:', err);
      res.send(errorHtml('Authentication failed'));
    }
  });

  // ── Discord OAuth ──

  router.get('/discord', (_req, res) => {
    const clientId = process.env.DISCORD_CLIENT_ID;
    if (!clientId) { res.status(500).send('Discord OAuth not configured'); return; }

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: `${SERVER_URL}/auth/discord/callback`,
      response_type: 'code',
      scope: 'identify email',
    });
    res.redirect(`https://discord.com/api/oauth2/authorize?${params}`);
  });

  router.get('/discord/callback', async (req, res) => {
    const code = req.query.code as string;
    if (!code) { res.send(errorHtml('No authorization code')); return; }

    try {
      // Exchange code for tokens
      const tokenRes = await fetch('https://discord.com/api/oauth2/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          client_id: process.env.DISCORD_CLIENT_ID!,
          client_secret: process.env.DISCORD_CLIENT_SECRET!,
          redirect_uri: `${SERVER_URL}/auth/discord/callback`,
          grant_type: 'authorization_code',
        }),
      });
      const tokens = await tokenRes.json() as { access_token: string };

      // Fetch profile
      const profileRes = await fetch('https://discord.com/api/users/@me', {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      });
      const profile = await profileRes.json() as { id: string; username: string; email?: string; avatar?: string };

      const avatarUrl = profile.avatar
        ? `https://cdn.discordapp.com/avatars/${profile.id}/${profile.avatar}.png`
        : null;

      // Find or create user
      let user = findUserByOAuth('discord', profile.id);
      if (!user) {
        user = createUserWithOAuth('discord', profile.id, profile.email ?? null, profile.username, avatarUrl);
      }

      const token = signToken(user.id);
      res.send(callbackHtml(token));
    } catch (err) {
      console.error('Discord OAuth error:', err);
      res.send(errorHtml('Authentication failed'));
    }
  });

  // ── Current User ──

  router.get('/me', (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      res.status(401).json({ error: 'No token' });
      return;
    }

    const payload = verifyToken(authHeader.slice(7));
    if (!payload) { res.status(401).json({ error: 'Invalid token' }); return; }

    const user = findUserById(payload.sub);
    if (!user) { res.status(401).json({ error: 'User not found' }); return; }

    res.json({
      id: user.id,
      displayName: user.display_name,
      avatarUrl: user.avatar_url,
      isGuest: false,
    });
  });

  // ── Update Profile ──

  router.put('/profile', express.json(), (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      res.status(401).json({ error: 'No token' });
      return;
    }

    const payload = verifyToken(authHeader.slice(7));
    if (!payload) { res.status(401).json({ error: 'Invalid token' }); return; }

    const { displayName, avatarUrl } = req.body as { displayName?: string; avatarUrl?: string };

    if (!displayName || typeof displayName !== 'string' || displayName.trim().length === 0) {
      res.status(400).json({ error: 'Display name is required' });
      return;
    }

    if (displayName.trim().length > 30) {
      res.status(400).json({ error: 'Display name must be 30 characters or less' });
      return;
    }

    const user = updateUser(payload.sub, displayName.trim(), avatarUrl ?? null);
    if (!user) { res.status(404).json({ error: 'User not found' }); return; }

    res.json({
      id: user.id,
      displayName: user.display_name,
      avatarUrl: user.avatar_url,
      isGuest: false,
    });
  });

  // ── Avatar Upload ──

  router.post('/avatar', avatarUpload.single('avatar'), (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      res.status(401).json({ error: 'No token' });
      return;
    }

    const payload = verifyToken(authHeader.slice(7));
    if (!payload) { res.status(401).json({ error: 'Invalid token' }); return; }

    if (!req.file) {
      res.status(400).json({ error: 'No file uploaded' });
      return;
    }

    // Validate magic bytes as an extra safety check
    const header = req.file.buffer.slice(0, 4);
    const isPng = header[0] === 0x89 && header[1] === 0x50;
    const isJpeg = header[0] === 0xFF && header[1] === 0xD8;
    const isWebp = header[0] === 0x52 && header[1] === 0x49 && header[2] === 0x46 && header[3] === 0x46;

    if (!isPng && !isJpeg && !isWebp) {
      res.status(400).json({ error: 'Invalid image file' });
      return;
    }

    const ext = isPng ? 'png' : isJpeg ? 'jpg' : 'webp';
    const filename = `${payload.sub}.${ext}`;
    const filepath = path.join(AVATARS_DIR, filename);

    // Remove any existing avatar for this user (might have different extension)
    for (const oldExt of ['png', 'jpg', 'webp']) {
      const oldPath = path.join(AVATARS_DIR, `${payload.sub}.${oldExt}`);
      try { fs.unlinkSync(oldPath); } catch { /* doesn't exist, fine */ }
    }

    // Write new avatar
    fs.writeFileSync(filepath, req.file.buffer);

    // Update user's avatar URL in DB
    const avatarUrl = `/avatars/${filename}`;
    const currentUser = findUserById(payload.sub);
    if (!currentUser) { res.status(404).json({ error: 'User not found' }); return; }
    updateUser(payload.sub, currentUser.display_name, avatarUrl);

    res.json({ avatarUrl });
  });

  return router;
}
