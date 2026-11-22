import { randomUUID } from 'node:crypto';
import { db } from '../db.js';
import { badRequest, notFound } from '../errors.js';
import { logger } from '../logger.js';
import { adapterFor, getSource } from '../sources/index.js';
import { getBook } from './library.js';

export interface SaveProgressInput {
  position: number;
  duration?: number;
  finished?: boolean;
  sessionSeconds?: number;
  sessionStartedAt?: number;
  playbackSpeed?: number;
}

export function saveProgress(userId: string, bookId: string, input: SaveProgressInput) {
  const book = getBook(bookId, userId);
  if (!Number.isFinite(input.position) || input.position < 0) throw badRequest('播放位置无效');
  const now = Math.floor(Date.now() / 1000);
  const finished = Boolean(input.finished);
  const duration = input.duration ?? book.duration ?? input.position;

  db.transaction(() => {
    const existing = db.prepare('SELECT started_at, finished_at FROM progress WHERE user_id = ? AND book_id = ?')
      .get(userId, bookId) as { started_at: number | null; finished_at: number | null } | undefined;
    db.prepare(`INSERT INTO progress (user_id, book_id, position, duration, finished, started_at, finished_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id, book_id) DO UPDATE SET
        position=excluded.position, duration=excluded.duration, finished=excluded.finished,
        started_at=COALESCE(progress.started_at, excluded.started_at),
        finished_at=CASE WHEN excluded.finished = 1 THEN COALESCE(progress.finished_at, excluded.finished_at) ELSE NULL END,
        updated_at=excluded.updated_at`)
      .run(userId, bookId, input.position, duration, finished ? 1 : 0,
        existing?.started_at ?? now, finished ? existing?.finished_at ?? now : null, now);

    if (input.sessionSeconds && input.sessionSeconds > 0) {
      const startedAt = Math.min(input.sessionStartedAt ?? now - input.sessionSeconds, now);
      db.prepare(`INSERT INTO sessions (id, user_id, book_id, started_at, ended_at, seconds)
        VALUES (?, ?, ?, ?, ?, ?)`).run(randomUUID(), userId, bookId, startedAt, now, input.sessionSeconds);
    }
  })();

  if (input.playbackSpeed || book.chapters.length) {
    const key = `playback:${bookId}`;
    const current = getSetting(userId, key, {});
    if (input.playbackSpeed) setSetting(userId, key, { ...current, speed: input.playbackSpeed });
  }

  void syncUpstream(bookId, userId, input.position, duration, finished);
  return { ok: true, position: input.position, updatedAt: now };
}

async function syncUpstream(bookId: string, userId: string, position: number, duration: number, finished: boolean): Promise<void> {
  try {
    const book = getBook(bookId, userId);
    const source = getSource(book.sourceId);
    const adapter = adapterFor(source);
    await adapter.syncProgress?.((db.prepare('SELECT external_id FROM books WHERE id = ?').get(bookId) as { external_id: string }).external_id,
      position, duration, finished);
  } catch (error) {
    logger.warn({ bookId, error: String(error) }, 'upstream progress sync skipped');
  }
}

export function listProgress(userId: string) {
  return db.prepare(`SELECT p.*, b.title FROM progress p JOIN books b ON b.id = p.book_id
    WHERE p.user_id = ? ORDER BY p.updated_at DESC`).all(userId);
}

export function markFinished(userId: string, bookId: string, finished: boolean) {
  return saveProgress(userId, bookId, { position: finished ? getBook(bookId, userId).duration : 0, finished });
}

export function resetProgress(userId: string, bookId: string) {
  db.prepare('DELETE FROM progress WHERE user_id = ? AND book_id = ?').run(userId, bookId);
  return { ok: true };
}

export function getSetting<T>(userId: string, key: string, fallback: T): T {
  const row = db.prepare('SELECT value FROM settings WHERE user_id = ? AND key = ?').get(userId, key) as { value: string } | undefined;
  if (!row) return fallback;
  try { return JSON.parse(row.value) as T; } catch { return fallback; }
}

export function setSetting(userId: string, key: string, value: unknown): void {
  db.prepare(`INSERT INTO settings (user_id, key, value) VALUES (?, ?, ?)
    ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value`)
    .run(userId, key, JSON.stringify(value));
}

export function listSettings(userId: string): Record<string, unknown> {
  const rows = db.prepare('SELECT key, value FROM settings WHERE user_id = ?').all(userId) as { key: string; value: string }[];
  const result: Record<string, unknown> = {};
  for (const row of rows) {
    try { result[row.key] = JSON.parse(row.value); } catch { result[row.key] = row.value; }
  }
  return result;
}

export function deleteSetting(userId: string, key: string): void {
  db.prepare('DELETE FROM settings WHERE user_id = ? AND key = ?').run(userId, key);
}

/** 按 key 前缀列出所有设置值 */
export function listSettingValues(userId: string, prefix: string): unknown[] {
  const rows = db.prepare('SELECT key, value FROM settings WHERE user_id = ? AND key LIKE ?')
    .all(userId, `${prefix}%`) as { key: string; value: string }[];
  return rows.map((row) => {
    try { return JSON.parse(row.value); } catch { return row.value; }
  });
}
