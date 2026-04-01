import Database from 'better-sqlite3';
import { nanoid } from 'nanoid';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, '..', 'data', 'arcade-battle.db');

let db: Database.Database;

export function initDatabase(): Database.Database {
  db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      display_name TEXT NOT NULL,
      avatar_url TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS oauth_accounts (
      provider TEXT NOT NULL,
      provider_id TEXT NOT NULL,
      user_id TEXT NOT NULL REFERENCES users(id),
      email TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (provider, provider_id)
    );

    CREATE INDEX IF NOT EXISTS idx_oauth_user ON oauth_accounts(user_id);
  `);

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
  created_at: string;
}

export function findUserByOAuth(provider: string, providerId: string): DbUser | undefined {
  const row = getDb().prepare(`
    SELECT u.* FROM users u
    JOIN oauth_accounts oa ON oa.user_id = u.id
    WHERE oa.provider = ? AND oa.provider_id = ?
  `).get(provider, providerId) as DbUser | undefined;
  return row;
}

export function createUserWithOAuth(
  provider: string,
  providerId: string,
  email: string | null,
  displayName: string,
  avatarUrl: string | null,
): DbUser {
  const userId = nanoid(12);
  const insert = getDb().transaction(() => {
    getDb().prepare(`
      INSERT INTO users (id, display_name, avatar_url) VALUES (?, ?, ?)
    `).run(userId, displayName, avatarUrl);

    getDb().prepare(`
      INSERT INTO oauth_accounts (provider, provider_id, user_id, email) VALUES (?, ?, ?, ?)
    `).run(provider, providerId, userId, email);
  });
  insert();

  return findUserById(userId)!;
}

export function findUserById(userId: string): DbUser | undefined {
  return getDb().prepare('SELECT * FROM users WHERE id = ?').get(userId) as DbUser | undefined;
}

export function linkOAuthAccount(
  userId: string,
  provider: string,
  providerId: string,
  email: string | null,
): void {
  getDb().prepare(`
    INSERT OR IGNORE INTO oauth_accounts (provider, provider_id, user_id, email) VALUES (?, ?, ?, ?)
  `).run(provider, providerId, userId, email);
}
