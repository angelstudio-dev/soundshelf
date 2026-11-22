import { db } from '../db.js';
import type { Book } from '../types.js';
import { mapBooks } from './library.js';

export interface AuthorSummary {
  name: string;
  initial: string;
  bookCount: number;
  coverUrl: string;
  totalDuration: number;
}

export interface ListeningEvent {
  id: string;
  bookId: string;
  bookTitle: string;
  coverUrl: string;
  startedAt: number;
  seconds: number;
  kind: 'session' | 'added';
  position: number;
}

const SELECT_BOOKS = `SELECT b.*, s.type AS source_type FROM books b JOIN sources s ON s.id = b.source_id`;

/** 取姓氏首字母：英文取首字符，中文取拼音首字母（常用字映射 + Unicode 兜底） */
export function nameInitial(name: string): string {
  const clean = (name ?? '').trim();
  if (!clean) return '#';
  const first = clean[0];
  if (/[a-zA-Z]/.test(first)) return first.toUpperCase();
  if (/[0-9]/.test(first)) return '#';
  // 中文按 Unicode 拼音区间映射到首字母（覆盖 GB2312 一级汉字常用分区）
  const code = first.codePointAt(0) ?? 0;
  if (code >= 0x4e00 && code <= 0x9fa5) {
    const boundaries: [number, string][] = [
      [0x4e02, 'A'], [0x4ea5, 'B'], [0x4fa0, 'C'], [0x51cd, 'D'], [0x5490, 'E'],
      [0x54b1, 'F'], [0x59e4, 'G'], [0x63a5, 'H'], [0x67cf, 'J'], [0x6bb3, 'K'],
      [0x6d64, 'L'], [0x767c, 'M'], [0x77db, 'N'], [0x7a05, 'O'], [0x7b2e, 'P'],
      [0x7d31, 'Q'], [0x7f39, 'R'], [0x8161, 'S'], [0x84dd, 'T'], [0x855a, 'W'],
      [0x90a3, 'X'], [0x95e2, 'Y'], [0x9b27, 'Z']
    ];
    let letter = 'Z';
    for (const [boundary, value] of boundaries) {
      if (code < boundary) { letter = value; break; }
    }
    return letter;
  }
  return '#';
}

/** 按作者聚合书籍，用于「作者」标签页 */
export function listAuthors(): AuthorSummary[] {
  const books = db.prepare(`${SELECT_BOOKS} ORDER BY b.title`).all() as Book[];
  const rows = db.prepare(`SELECT id, author, cover_path, cover_url, duration FROM books`).all() as
    { id: string; author: string; cover_path: string; cover_url: string; duration: number }[];
  const coverById = new Map(rows.map((row) => [row.id, row]));
  const groups = new Map<string, { count: number; duration: number; cover: string }>();

  for (const book of books) {
    const author = (book.author || '未知作者').trim() || '未知作者';
    const group = groups.get(author) ?? { count: 0, duration: 0, cover: '' };
    group.count += 1;
    group.duration += book.duration || 0;
    if (!group.cover) {
      const row = coverById.get(book.id);
      group.cover = row?.cover_path ? `/api/assets/cover/${book.id}` : book.coverUrl;
    }
    groups.set(author, group);
  }

  return Array.from(groups, ([name, group]) => ({
    name,
    initial: nameInitial(name),
    bookCount: group.count,
    coverUrl: group.cover,
    totalDuration: Math.round(group.duration)
  })).sort((a, b) => a.initial.localeCompare(b.initial) || a.name.localeCompare(b.name, 'zh'));
}

/** 某作者的书籍 */
export function booksByAuthor(author: string, userId: string | undefined): Book[] {
  const rows = db.prepare(`${SELECT_BOOKS} WHERE b.author = ? ORDER BY b.title`).all(author) as any[];
  return mapBooks(rows, userId);
}

/** 收听历史：按 sessions + progress 起始时间聚合 */
export function getHistory(userId: string, bookId: string): ListeningEvent[] {
  const book = db.prepare('SELECT id, title FROM books WHERE id = ?').get(bookId) as { id: string; title: string } | undefined;
  if (!book) return [];
  const coverRow = db.prepare('SELECT cover_path, cover_url FROM books WHERE id = ?').get(bookId) as
    { cover_path: string; cover_url: string } | undefined;
  const coverUrl = coverRow?.cover_path ? `/api/assets/cover/${bookId}` : coverRow?.cover_url ?? '';
  const events: ListeningEvent[] = [];

  const sessions = db.prepare(`SELECT id, started_at, seconds FROM sessions
    WHERE user_id = ? AND book_id = ? ORDER BY started_at DESC`).all(userId, bookId) as
    { id: string; started_at: number; seconds: number }[];
  for (const session of sessions) {
    events.push({
      id: session.id, bookId, bookTitle: book.title, coverUrl,
      startedAt: session.started_at, seconds: Number(session.seconds) || 0,
      kind: 'session', position: 0
    });
  }

  const progress = db.prepare(`SELECT started_at, finished_at, position FROM progress
    WHERE user_id = ? AND book_id = ?`).get(userId, bookId) as
    { started_at: number | null; finished_at: number | null; position: number } | undefined;
  if (progress?.started_at) {
    events.push({
      id: `added-${bookId}`, bookId, bookTitle: book.title, coverUrl,
      startedAt: progress.started_at, seconds: 0, kind: 'added',
      position: Number(progress.position) || 0
    });
  }

  return events.sort((a, b) => b.startedAt - a.startedAt);
}

/** 所有收听历史（主页「历史记录」用） */
export function getAllHistory(userId: string, limit = 50): ListeningEvent[] {
  const sessions = db.prepare(`SELECT s.id, s.started_at, s.seconds, s.book_id, b.title,
    b.cover_path, b.cover_url FROM sessions s JOIN books b ON b.id = s.book_id
    WHERE s.user_id = ? ORDER BY s.started_at DESC LIMIT ?`).all(userId, limit) as
    { id: string; started_at: number; seconds: number; book_id: string; title: string; cover_path: string; cover_url: string }[];
  return sessions.map((row) => ({
    id: row.id, bookId: row.book_id, bookTitle: row.title,
    coverUrl: row.cover_path ? `/api/assets/cover/${row.book_id}` : row.cover_url,
    startedAt: row.started_at, seconds: Number(row.seconds) || 0,
    kind: 'session' as const, position: 0
  }));
}

/** 书籍的文件总大小与估算码率（kbps） */
export function getMediaInfo(bookId: string): { size: number; bitrate: number } {
  const row = db.prepare(`SELECT SUM(size) AS size, SUM(duration) AS duration FROM tracks WHERE book_id = ?`)
    .get(bookId) as { size: number | null; duration: number | null };
  const size = Number(row.size) || 0;
  const duration = Number(row.duration) || 0;
  return { size, bitrate: duration > 0 ? Math.round((size * 8) / duration / 1000) : 0 };
}
