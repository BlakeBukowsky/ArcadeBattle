import Database from 'better-sqlite3';
import { nanoid } from 'nanoid';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_DIR = path.join(__dirname, '..', 'data');
const DB_PATH = path.join(DB_DIR, 'arcade-battle.db');

let db: Database.Database;

export function initDatabase(): Database.Database {
  fs.mkdirSync(DB_DIR, { recursive: true });
  db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      display_name TEXT NOT NULL,
      avatar_url TEXT,
      email TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS magic_links (
      token TEXT PRIMARY KEY,
      email TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      used INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_magic_links_email ON magic_links(email);

    CREATE TABLE IF NOT EXISTS feedback (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL CHECK(type IN ('rating', 'bug_report')),
      user_id TEXT NOT NULL,
      game_id TEXT,
      game_name TEXT,
      round_number INTEGER,
      rating INTEGER CHECK(rating IN (1, -1)),
      message TEXT,
      lobby_id TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_feedback_type ON feedback(type);
    CREATE INDEX IF NOT EXISTS idx_feedback_created ON feedback(created_at);

    CREATE TABLE IF NOT EXISTS match_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      lobby_id TEXT,
      player1_id TEXT NOT NULL,
      player1_name TEXT,
      player2_id TEXT NOT NULL,
      player2_name TEXT,
      winner_id TEXT NOT NULL,
      player1_score INTEGER NOT NULL,
      player2_score INTEGER NOT NULL,
      rounds TEXT NOT NULL,
      game_set TEXT,
      played_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_match_player1 ON match_history(player1_id);
    CREATE INDEX IF NOT EXISTS idx_match_player2 ON match_history(player2_id);
    CREATE INDEX IF NOT EXISTS idx_match_played ON match_history(played_at);
  `);

  // Migrate older databases: add email column to users if missing
  const userCols = db.prepare(`PRAGMA table_info(users)`).all() as { name: string }[];
  if (!userCols.some((c) => c.name === 'email')) {
    db.exec(`ALTER TABLE users ADD COLUMN email TEXT`);
  }

  // Drop legacy OAuth table if present
  db.exec(`DROP TABLE IF EXISTS oauth_accounts`);

  // Unique-when-present index on email
  db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email) WHERE email IS NOT NULL`);

  return db;
}

export function getDb(): Database.Database {
  if (!db) throw new Error('Database not initialized');
  return db;
}

export interface DbUser {
  id: string;
  display_name: string;
  avatar_url: string | null;
  email: string | null;
  created_at: string;
}

export function findUserByEmail(email: string): DbUser | undefined {
  return getDb().prepare(`SELECT * FROM users WHERE email = ?`).get(email) as DbUser | undefined;
}

export function createUserWithEmail(email: string, displayName: string): DbUser {
  const userId = nanoid(12);
  getDb().prepare(`
    INSERT INTO users (id, display_name, email) VALUES (?, ?, ?)
  `).run(userId, displayName, email);
  return findUserById(userId)!;
}

export function findUserById(userId: string): DbUser | undefined {
  return getDb().prepare('SELECT * FROM users WHERE id = ?').get(userId) as DbUser | undefined;
}

/**
 * Re-create a user with a known ID (e.g., after DB wipe).
 * Used when a valid JWT references a user that no longer exists in the DB.
 */
export function ensureUserExists(userId: string, displayName: string): DbUser {
  const existing = findUserById(userId);
  if (existing) return existing;

  getDb().prepare(`
    INSERT INTO users (id, display_name) VALUES (?, ?)
  `).run(userId, displayName);

  return findUserById(userId)!;
}

export function updateUser(userId: string, displayName: string, avatarUrl: string | null): DbUser | undefined {
  getDb().prepare(`
    UPDATE users SET display_name = ?, avatar_url = ? WHERE id = ?
  `).run(displayName, avatarUrl, userId);
  return findUserById(userId);
}

export interface MatchRecord {
  player1_id: string; player1_name: string;
  player2_id: string; player2_name: string;
  winner_id: string;
  player1_score: number; player2_score: number;
  rounds: string; // JSON string of RoundResult[]
  lobby_id?: string; game_set?: string;
}

export function saveMatch(m: MatchRecord): void {
  getDb().prepare(`
    INSERT INTO match_history (lobby_id, player1_id, player1_name, player2_id, player2_name, winner_id, player1_score, player2_score, rounds, game_set)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(m.lobby_id ?? null, m.player1_id, m.player1_name, m.player2_id, m.player2_name, m.winner_id, m.player1_score, m.player2_score, m.rounds, m.game_set ?? null);
}

export function getMatchesForUser(userId: string, limit = 20): unknown[] {
  return getDb().prepare(`
    SELECT * FROM match_history WHERE player1_id = ? OR player2_id = ?
    ORDER BY played_at DESC LIMIT ?
  `).all(userId, userId, limit);
}

export function createMagicLink(token: string, email: string, expiresAt: number): void {
  getDb().prepare(`
    INSERT INTO magic_links (token, email, expires_at) VALUES (?, ?, ?)
  `).run(token, email, expiresAt);
}

/**
 * Atomically consume a magic-link token. Returns the email if the token is valid,
 * unused, and unexpired; otherwise returns null. Marks the token as used on success.
 */
export function consumeMagicLink(token: string): string | null {
  const consume = getDb().transaction(() => {
    const row = getDb().prepare(`
      SELECT email, expires_at, used FROM magic_links WHERE token = ?
    `).get(token) as { email: string; expires_at: number; used: number } | undefined;

    if (!row) return null;
    if (row.used) return null;
    if (row.expires_at < Date.now()) return null;

    getDb().prepare(`UPDATE magic_links SET used = 1 WHERE token = ?`).run(token);
    return row.email;
  });
  return consume();
}
