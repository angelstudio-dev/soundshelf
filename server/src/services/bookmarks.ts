import { randomUUID } from 'node:crypto';
import { db } from '../db.js';
import { badRequest, notFound } from '../errors.js';
import { getBook } from './library.js';
import type { Bookmark } from '../types.js';

const mapRow = (row: any): Bookmark => ({
  id: row.id, bookId: row.book_id, chapterId: row.chapter_id, position: row.position,
  title: row.title, note: row.note, createdAt: row.created_at, updatedAt: row.updated_at
});

export function listBookmarks(userId: string, bookId?: string): Bookmark[] {
  const rows = bookId
    ? db.prepare('SELECT * FROM bookmarks WHERE user_id = ? AND book_id = ? ORDER BY position').all(userId, bookId)
    : db.prepare('SELECT * FROM bookmarks WHERE user_id = ? ORDER BY updated_at DESC').all(userId);
  return (rows as any[]).map(mapRow);
}

export function getBookmark(userId: string, id: string): Bookmark {
  const row = db.prepare('SELECT * FROM bookmarks WHERE id = ? AND user_id = ?').get(id, userId) as any;
  if (!row) throw notFound('书签不存在');
  return mapRow(row);
}

export function createBookmark(userId: string, input: {
  bookId: string; chapterId?: string; position?: number; title?: string; note?: string;
}): Bookmark {
  if (!input.bookId) throw badRequest('缺少 bookId');
  getBook(input.bookId, userId);
  const id = randomUUID();
  const now = Math.floor(Date.now() / 1000);
  db.prepare(`INSERT INTO bookmarks (id, user_id, book_id, chapter_id, position, title, note, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    id, userId, input.bookId, input.chapterId ?? '', input.position ?? 0,
    input.title ?? '', input.note ?? '', now, now
  );
  return getBookmark(userId, id);
}

export function updateBookmark(userId: string, id: string, input: { title?: string; note?: string; position?: number; chapterId?: string }): Bookmark {
  const existing = getBookmark(userId, id);
  db.prepare(`UPDATE bookmarks SET title = ?, note = ?, position = ?, chapter_id = ?, updated_at = ? WHERE id = ? AND user_id = ?`)
    .run(input.title ?? existing.title, input.note ?? existing.note, input.position ?? existing.position,
      input.chapterId ?? existing.chapterId, Math.floor(Date.now() / 1000), id, userId);
  return getBookmark(userId, id);
}

export function deleteBookmark(userId: string, id: string): void {
  getBookmark(userId, id);
  db.prepare('DELETE FROM bookmarks WHERE id = ? AND user_id = ?').run(id, userId);
}
