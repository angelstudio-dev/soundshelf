import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { db } from '../db.js';
import { badRequest } from '../errors.js';
import { logger } from '../logger.js';
import { listSettings } from './progress.js';

/**
 * 一键备份 / 恢复：以单个 JSON 文件导出当前用户的个人数据，再可恢复到同一账号。
 *
 * 覆盖范围（数据库中全部按 user_id 归属的数据）：
 * - progress：播放进度（含开始/完成时间）
 * - bookmarks：书签与笔记
 * - sessions：收听历史（统计与连续收听天数的数据来源）
 * - settings：全部设置，含每本书的播放偏好 playback:<bookId> 与播放清单 playlists
 *
 * 不包含书库本身（books/collections 属于书源而非用户）、账号密码与刷新令牌。
 * 恢复语义为「替换」：先清空当前账号的上述数据，再写入文件内容，全程一个事务，
 * 校验失败或写入失败都不会留下半成品。所有读写都以请求者 userId 为准，
 * 文件中记录的 user 只作来源标识，绝不用于定位写入目标。
 */

export const BACKUP_APP = 'soundshelf';
export const BACKUP_FORMAT_VERSION = 1;

const progressItemSchema = z.object({
  bookId: z.string().min(1),
  position: z.number().min(0),
  duration: z.number().min(0),
  finished: z.boolean(),
  startedAt: z.number().int().nullable(),
  finishedAt: z.number().int().nullable(),
  updatedAt: z.number().int()
});

const bookmarkItemSchema = z.object({
  id: z.string().min(1),
  bookId: z.string().min(1),
  chapterId: z.string(),
  position: z.number().min(0),
  title: z.string(),
  note: z.string(),
  createdAt: z.number().int(),
  updatedAt: z.number().int()
});

const sessionItemSchema = z.object({
  id: z.string().min(1),
  bookId: z.string().min(1),
  startedAt: z.number().int(),
  endedAt: z.number().int(),
  seconds: z.number().min(0)
});

export const backupFileSchema = z.object({
  app: z.literal(BACKUP_APP),
  formatVersion: z.literal(BACKUP_FORMAT_VERSION),
  exportedAt: z.string().min(1),
  user: z.object({ id: z.string().min(1), username: z.string() }),
  data: z.object({
    progress: z.array(progressItemSchema).max(100_000),
    bookmarks: z.array(bookmarkItemSchema).max(100_000),
    sessions: z.array(sessionItemSchema).max(200_000),
    settings: z.record(z.string(), z.unknown())
  })
});

export type BackupFile = z.infer<typeof backupFileSchema>;

export function buildBackup(userId: string): BackupFile {
  const user = db.prepare('SELECT id, username FROM users WHERE id = ?').get(userId) as
    { id: string; username: string } | undefined;
  if (!user) throw badRequest('当前用户不存在');

  const progress = (db.prepare(
    'SELECT book_id, position, duration, finished, started_at, finished_at, updated_at FROM progress WHERE user_id = ? ORDER BY updated_at'
  ).all(userId) as any[]).map((row) => ({
    bookId: row.book_id as string,
    position: row.position as number,
    duration: row.duration as number,
    finished: Boolean(row.finished),
    startedAt: (row.started_at ?? null) as number | null,
    finishedAt: (row.finished_at ?? null) as number | null,
    updatedAt: row.updated_at as number
  }));

  const bookmarks = (db.prepare(
    'SELECT id, book_id, chapter_id, position, title, note, created_at, updated_at FROM bookmarks WHERE user_id = ? ORDER BY created_at'
  ).all(userId) as any[]).map((row) => ({
    id: row.id as string,
    bookId: row.book_id as string,
    chapterId: row.chapter_id as string,
    position: row.position as number,
    title: row.title as string,
    note: row.note as string,
    createdAt: row.created_at as number,
    updatedAt: row.updated_at as number
  }));

  const sessions = (db.prepare(
    'SELECT id, book_id, started_at, ended_at, seconds FROM sessions WHERE user_id = ? ORDER BY started_at'
  ).all(userId) as any[]).map((row) => ({
    id: row.id as string,
    bookId: row.book_id as string,
    startedAt: row.started_at as number,
    endedAt: row.ended_at as number,
    seconds: row.seconds as number
  }));

  return {
    app: BACKUP_APP,
    formatVersion: BACKUP_FORMAT_VERSION,
    exportedAt: new Date().toISOString(),
    user: { id: user.id, username: user.username },
    data: { progress, bookmarks, sessions, settings: listSettings(userId) }
  };
}

export interface RestoreResult {
  ok: true;
  restored: { progress: number; bookmarks: number; sessions: number; settings: number };
  skipped: { progress: number; bookmarks: number; sessions: number };
}

export function restoreBackup(userId: string, file: BackupFile): RestoreResult {
  const { data } = file;

  // 书籍属于书源：目标实例书库里不存在的书，其进度/书签/历史无法挂载，跳过并计数。
  const bookIds = new Set(
    (db.prepare('SELECT id FROM books').all() as { id: string }[]).map((row) => row.id)
  );
  const progress = data.progress.filter((item) => bookIds.has(item.bookId));
  const bookmarks = data.bookmarks.filter((item) => bookIds.has(item.bookId));
  const sessions = data.sessions.filter((item) => bookIds.has(item.bookId));

  // 书签/会话 id 是全局主键：与他人已有 id 冲突时换新 id，避免整笔事务失败。
  const foreignIds = new Set(
    (db.prepare('SELECT id FROM bookmarks WHERE user_id != ? UNION SELECT id FROM sessions WHERE user_id != ?')
      .all(userId, userId) as { id: string }[]).map((row) => row.id)
  );
  const safeId = (id: string) => (foreignIds.has(id) ? randomUUID() : id);

  const settingEntries = Object.entries(data.settings);

  db.transaction(() => {
    db.prepare('DELETE FROM progress WHERE user_id = ?').run(userId);
    db.prepare('DELETE FROM bookmarks WHERE user_id = ?').run(userId);
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
    db.prepare('DELETE FROM settings WHERE user_id = ?').run(userId);

    const insertProgress = db.prepare(`INSERT INTO progress
      (user_id, book_id, position, duration, finished, started_at, finished_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
    for (const item of progress) {
      insertProgress.run(userId, item.bookId, item.position, item.duration,
        item.finished ? 1 : 0, item.startedAt, item.finishedAt, item.updatedAt);
    }

    const insertBookmark = db.prepare(`INSERT INTO bookmarks
      (id, user_id, book_id, chapter_id, position, title, note, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    for (const item of bookmarks) {
      insertBookmark.run(safeId(item.id), userId, item.bookId, item.chapterId,
        item.position, item.title, item.note, item.createdAt, item.updatedAt);
    }

    const insertSession = db.prepare(`INSERT INTO sessions
      (id, user_id, book_id, started_at, ended_at, seconds) VALUES (?, ?, ?, ?, ?, ?)`);
    for (const item of sessions) {
      insertSession.run(safeId(item.id), userId, item.bookId, item.startedAt, item.endedAt, item.seconds);
    }

    const insertSetting = db.prepare('INSERT INTO settings (user_id, key, value) VALUES (?, ?, ?)');
    for (const [key, value] of settingEntries) {
      insertSetting.run(userId, key, JSON.stringify(value));
    }
  })();

  const result: RestoreResult = {
    ok: true,
    restored: {
      progress: progress.length,
      bookmarks: bookmarks.length,
      sessions: sessions.length,
      settings: settingEntries.length
    },
    skipped: {
      progress: data.progress.length - progress.length,
      bookmarks: data.bookmarks.length - bookmarks.length,
      sessions: data.sessions.length - sessions.length
    }
  };
  logger.info({ userId, ...result.restored, skipped: result.skipped }, 'backup restored');
  return result;
}
