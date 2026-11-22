import { createHash } from 'node:crypto';
import { db } from '../db.js';
import { badRequest, notFound } from '../errors.js';
import { adapterFor, getSource } from '../sources/index.js';
import type { Book, BookProgress, Chapter, Collection, SourceType, Track } from '../types.js';

interface BookRow {
  id: string; source_id: string; external_id: string; title: string; author: string; narrator: string;
  series: string; description: string; cover_path: string; cover_url: string; duration: number;
  language: string; tags: string; added_at: number; updated_at: number; source_type: SourceType;
}

interface ProgressRow {
  book_id: string; position: number; duration: number; finished: number;
  updated_at: number; started_at: number | null; finished_at: number | null;
}

const SELECT_BOOKS = `SELECT b.*, s.type AS source_type FROM books b JOIN sources s ON s.id = b.source_id`;

function mapBooks(rows: BookRow[], userId: string | undefined): Book[] {
  if (!rows.length) return [];
  const ids = rows.map((row) => row.id);
  const placeholders = ids.map(() => '?').join(',');

  const chapterRows = db.prepare(`SELECT * FROM chapters WHERE book_id IN (${placeholders}) ORDER BY position`).all(...ids) as any[];
  const trackRows = db.prepare(`SELECT * FROM tracks WHERE book_id IN (${placeholders}) ORDER BY position`).all(...ids) as any[];
  const progressRows = userId
    ? db.prepare(`SELECT * FROM progress WHERE user_id = ? AND book_id IN (${placeholders})`).all(userId, ...ids) as ProgressRow[]
    : [];

  const chaptersByBook = new Map<string, Chapter[]>();
  const tracksByBook = new Map<string, Track[]>();
  const progressByBook = new Map<string, BookProgress>();

  for (const row of chapterRows) {
    if (!chaptersByBook.has(row.book_id)) chaptersByBook.set(row.book_id, []);
    chaptersByBook.get(row.book_id)!.push({
      id: row.id, title: row.title, start: row.start_offset,
      duration: row.duration, trackIndex: row.track_index,
      index: chaptersByBook.get(row.book_id)!.length
    });
  }
  for (const row of trackRows) {
    if (!tracksByBook.has(row.book_id)) tracksByBook.set(row.book_id, []);
    tracksByBook.get(row.book_id)!.push({
      id: row.id, title: row.title, filePath: row.file_path, remoteUrl: row.remote_url,
      mimeType: row.mime_type, duration: row.duration, size: row.size,
      index: tracksByBook.get(row.book_id)!.length
    });
  }
  for (const row of progressRows) {
    progressByBook.set(row.book_id, {
      position: row.position, duration: row.duration, finished: Boolean(row.finished),
      updatedAt: row.updated_at, startedAt: row.started_at, finishedAt: row.finished_at
    });
  }

  return rows.map((row) => ({
    id: row.id,
    sourceId: row.source_id,
    sourceType: row.source_type,
    title: row.title,
    author: row.author,
    narrator: row.narrator,
    series: row.series,
    description: row.description,
    coverUrl: row.cover_path ? `/api/assets/cover/${row.id}` : row.cover_url,
    duration: row.duration,
    language: row.language,
    tags: (() => { try { return JSON.parse(row.tags); } catch { return []; } })(),
    addedAt: row.added_at,
    chapters: chaptersByBook.get(row.id) ?? [],
    tracks: tracksByBook.get(row.id) ?? [],
    progress: progressByBook.get(row.id) ?? null
  }));
}

export interface ListBooksQuery {
  userId?: string;
  search?: string;
  filter?: 'all' | 'unfinished' | 'finished' | 'in-progress' | 'series';
  sort?: 'recent' | 'title' | 'author' | 'duration' | 'progress';
  page?: number;
  limit?: number;
  sourceId?: string;
}

export function listBooks(query: ListBooksQuery): { books: Book[]; total: number; page: number; limit: number } {
  const page = Math.max(1, query.page ?? 1);
  const limit = Math.min(100, Math.max(1, query.limit ?? 24));
  const clauses: string[] = [];
  const params: unknown[] = [];

  if (query.search) {
    clauses.push(`(b.title LIKE ? OR b.author LIKE ? OR b.series LIKE ? OR b.tags LIKE ?)`);
    const pattern = `%${query.search}%`;
    params.push(pattern, pattern, pattern, pattern);
  }
  if (query.sourceId) {
    clauses.push('b.source_id = ?');
    params.push(query.sourceId);
  }
  if (query.userId && query.filter) {
    if (query.filter === 'finished') {
      clauses.push('EXISTS (SELECT 1 FROM progress p WHERE p.book_id = b.id AND p.user_id = ? AND p.finished = 1)');
      params.push(query.userId);
    } else if (query.filter === 'unfinished') {
      clauses.push('NOT EXISTS (SELECT 1 FROM progress p WHERE p.book_id = b.id AND p.user_id = ? AND p.finished = 1)');
      params.push(query.userId);
    } else if (query.filter === 'in-progress') {
      clauses.push('EXISTS (SELECT 1 FROM progress p WHERE p.book_id = b.id AND p.user_id = ? AND p.position > 0 AND p.finished = 0)');
      params.push(query.userId);
    }
  }
  if (query.filter === 'series') clauses.push(`b.series != ''`);

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const orderBy = (() => {
    switch (query.sort) {
      case 'title': return 'b.title COLLATE NOCASE ASC';
      case 'author': return 'b.author COLLATE NOCASE ASC, b.title ASC';
      case 'duration': return 'b.duration DESC';
      case 'progress': return 'b.added_at DESC';
      default: return 'b.added_at DESC';
    }
  })();

  const total = (db.prepare(`SELECT COUNT(*) AS count FROM books b ${where}`).get(...params) as { count: number }).count;
  const rows = db.prepare(`${SELECT_BOOKS} ${where} ORDER BY ${orderBy} LIMIT ? OFFSET ?`)
    .all(...params, limit, (page - 1) * limit) as BookRow[];

  return { books: mapBooks(rows, query.userId), total, page, limit };
}

export function getBook(id: string, userId?: string): Book {
  const row = db.prepare(`${SELECT_BOOKS} WHERE b.id = ?`).get(id) as BookRow | undefined;
  if (!row) throw notFound('书籍不存在');
  return mapBooks([row], userId)[0];
}

export function getContinueListening(userId: string, limit = 6): Book[] {
  const rows = db.prepare(`${SELECT_BOOKS}
    JOIN progress p ON p.book_id = b.id AND p.user_id = ?
    WHERE p.position > 0 AND p.finished = 0
    ORDER BY p.updated_at DESC LIMIT ?`).all(userId, limit) as BookRow[];
  return mapBooks(rows, userId);
}

export function getRecentlyAdded(limit = 8): Book[] {
  const rows = db.prepare(`${SELECT_BOOKS} ORDER BY b.added_at DESC LIMIT ?`).all(limit) as BookRow[];
  return mapBooks(rows, undefined);
}

export function getFinished(userId: string, limit = 8): Book[] {
  const rows = db.prepare(`${SELECT_BOOKS}
    JOIN progress p ON p.book_id = b.id AND p.user_id = ? AND p.finished = 1
    ORDER BY p.finished_at DESC LIMIT ?`).all(userId, limit) as BookRow[];
  return mapBooks(rows, userId);
}

export function listCollections(userId?: string): Collection[] {
  const rows = db.prepare(`SELECT * FROM collections ORDER BY title COLLATE NOCASE`).all() as any[];
  return rows.map((row) => {
    let ids: string[] = [];
    try { ids = JSON.parse(row.book_ids); } catch { ids = []; }
    const books = ids.length
      ? mapBooks(db.prepare(`${SELECT_BOOKS} WHERE b.id IN (${ids.map(() => '?').join(',')})`).all(...ids) as BookRow[], userId)
      : [];
    return {
      id: row.id, title: row.title, description: row.description,
      books, sourceType: (db.prepare('SELECT type FROM sources WHERE id = ?').get(row.source_id) as { type: SourceType } | undefined)?.type ?? 'local'
    };
  });
}

export function getCollection(id: string, userId?: string): Collection {
  const collection = listCollections(userId).find((item) => item.id === id);
  if (!collection) throw notFound('合集不存在');
  return collection;
}

export function searchBooks(query: string, userId?: string, limit = 20): Book[] {
  if (!query?.trim()) return [];
  return listBooks({ userId, search: query.trim(), limit }).books;
}

export async function resolveStreamTarget(bookId: string, trackId?: string): Promise<{
  filePath?: string; url?: string; headers?: Record<string, string>; mimeType: string; size: number;
}> {
  const book = getBook(bookId);
  const track = trackId
    ? db.prepare('SELECT * FROM tracks WHERE id = ? AND book_id = ?').get(trackId, bookId) as any
    : db.prepare('SELECT * FROM tracks WHERE book_id = ? ORDER BY position LIMIT 1').get(bookId) as any;
  if (!track) throw notFound('音频文件不存在');

  if (track.file_path) return { filePath: track.file_path, mimeType: track.mime_type || 'audio/mpeg', size: track.size || 0 };

  const source = getSource(book.sourceId);
  const adapter = adapterFor(source);
  if (adapter.resolveTrack) {
    const bookExternalId = (db.prepare('SELECT external_id FROM books WHERE id = ?').get(bookId) as { external_id: string }).external_id;
    const trackExternalId = track.id.startsWith(`${book.id}-`) ? track.id.slice(book.id.length + 1) : track.id;
    const resolved = await adapter.resolveTrack(bookExternalId, trackExternalId);
    if (resolved) {
      return { ...resolved, mimeType: track.mime_type || 'audio/mpeg', size: track.size || 0 };
    }
  }
  const remoteUrl = track.remote_url.startsWith('http')
    ? track.remote_url
    : `${source.base_url.replace(/\/$/, '')}${track.remote_url}`;
  return { url: remoteUrl, mimeType: track.mime_type || 'audio/mpeg', size: track.size || 0 };
}

export function coverTarget(bookId: string): { filePath?: string; url?: string; sourceId: string } {
  const row = db.prepare('SELECT cover_path, cover_url, source_id FROM books WHERE id = ?').get(bookId) as
    | { cover_path: string; cover_url: string; source_id: string } | undefined;
  if (!row) throw notFound('书籍不存在');
  if (row.cover_path) return { filePath: row.cover_path, sourceId: row.source_id };
  if (row.cover_url) {
    if (row.cover_url.startsWith('data:')) return { url: row.cover_url, sourceId: row.source_id };
    const source = getSource(row.source_id);
    const url = row.cover_url.startsWith('http') ? row.cover_url : `${source.base_url.replace(/\/$/, '')}${row.cover_url}`;
    return { url, sourceId: row.source_id };
  }
  throw notFound('封面不存在');
}

export function coverAuthHeaders(sourceId: string): Record<string, string> {
  const source = getSource(sourceId);
  if (source.type === 'audiobookshelf') return { Authorization: `Bearer ${source.token}` };
  if (source.type === 'plex') return { 'X-Plex-Token': source.token };
  return {};
}

export function stableAssetToken(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 16);
}
