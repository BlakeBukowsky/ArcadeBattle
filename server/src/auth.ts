import express, { Router } from 'express';
import jwt from 'jsonwebtoken';
import multer from 'multer';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Resend } from 'resend';
import rateLimit from 'express-rate-limit';
import {
  findUserById,
  findUserByEmail,
  createUserWithEmail,
  updateUser,
  ensureUserExists,
  createMagicLink,
  consumeMagicLink,
} from './db.js';

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
  return jwt.sign({ sub: userId }, JWT_SECRET, { expiresIn: '30d' });
}

export function verifyToken(token: string): { sub: string } | null {
  try {
    return jwt.verify(token, JWT_SECRET) as { sub: string };
  } catch {
    return null;
  }
}

// ── Magic-link email ──

const MAGIC_LINK_TTL_MS = 15 * 60 * 1000;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

let resendClient: Resend | null = null;
function getResend(): Resend {
  if (!resendClient) {
    const key = process.env.RESEND_API_KEY;
    if (!key) throw new Error('RESEND_API_KEY is not set');
    resendClient = new Resend(key);
  }
  return resendClient;
}

function displayNameFromEmail(email: string): string {
  return email.split('@')[0].slice(0, 30) || 'Player';
}

async function sendMagicLinkEmail(email: string, link: string): Promise<void> {
  const from = process.env.RESEND_FROM || 'onboarding@resend.dev';
  await getResend().emails.send({
    from,
    to: email,
    subject: 'Sign in to Arcade Battle',
    text: `Click the link below to sign in to Arcade Battle. It expires in 15 minutes.\n\n${link}\n\nIf you didn't request this, you can ignore this email.`,
    html: `<div style="font-family:system-ui,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#222">
      <h2 style="margin:0 0 16px">Sign in to Arcade Battle</h2>
      <p>Click the button below to sign in. The link expires in 15 minutes.</p>
      <p style="margin:24px 0">
        <a href="${link}" style="display:inline-block;padding:12px 20px;background:#00ff88;color:#000;text-decoration:none;border-radius:6px;font-weight:600">Sign in</a>
      </p>
      <p style="font-size:12px;color:#666">Or paste this URL into your browser:<br><span style="word-break:break-all">${link}</span></p>
      <p style="font-size:12px;color:#666">If you didn't request this, you can ignore this email.</p>
    </div>`,
  });
}

// ── Router ──

const magicLinkLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many sign-in requests. Please wait a minute.' },
});

export function createAuthRouter(): Router {
  const router = Router();

  // ── Magic Link: Request ──

  router.post('/magic-link', magicLinkLimiter, express.json(), async (req, res) => {
    const { email } = req.body as { email?: string };
    const normalized = typeof email === 'string' ? email.trim().toLowerCase() : '';

    if (!EMAIL_RE.test(normalized) || normalized.length > 254) {
      res.status(400).json({ error: 'Please enter a valid email address' });
      return;
    }

    try {
      const token = crypto.randomBytes(32).toString('hex');
      const expiresAt = Date.now() + MAGIC_LINK_TTL_MS;
      createMagicLink(token, normalized, expiresAt);

      const link = `${SERVER_URL}/auth/verify?token=${token}`;
      await sendMagicLinkEmail(normalized, link);

      res.json({ ok: true });
    } catch (err) {
      console.error('Magic link send error:', err);
      res.status(500).json({ error: 'Failed to send sign-in email' });
    }
  });

  // ── Magic Link: Verify ──

  router.get('/verify', (req, res) => {
    const token = req.query.token as string | undefined;
    if (!token) { res.redirect(`${CLIENT_URL}/auth/callback#error=invalid`); return; }

    const email = consumeMagicLink(token);
    if (!email) { res.redirect(`${CLIENT_URL}/auth/callback#error=expired`); return; }

    const user = findUserByEmail(email) ?? createUserWithEmail(email, displayNameFromEmail(email));
    const jwtToken = signToken(user.id);

    // Fragment, not query, so the JWT isn't sent in Referer headers or server logs
    res.redirect(`${CLIENT_URL}/auth/callback#token=${jwtToken}`);
  });

  // ── Current User ──

  router.get('/me', (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      res.status(401).json({ error: 'No token' });
      return;
    }

    const rawToken = authHeader.slice(7);
    const payload = verifyToken(rawToken);
    if (!payload) { res.status(401).json({ error: 'Invalid token' }); return; }

    // If DB was wiped (e.g., Railway redeploy), re-create the user stub
    // so they don't get logged out. They'll just need to re-set their name/avatar.
    const user = findUserById(payload.sub) ?? ensureUserExists(payload.sub, 'Player');

    // Auto-refresh: if token was issued more than 7 days ago, send a fresh one
    const decoded = jwt.decode(rawToken) as { iat?: number } | null;
    const issuedAt = decoded?.iat ?? 0;
    const ageSeconds = Math.floor(Date.now() / 1000) - issuedAt;
    const refreshToken = ageSeconds > 7 * 24 * 60 * 60 ? signToken(user.id) : undefined;

    res.json({
      id: user.id,
      displayName: user.display_name,
      avatarUrl: user.avatar_url,
      isGuest: false,
      ...(refreshToken ? { refreshedToken: refreshToken } : {}),
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
