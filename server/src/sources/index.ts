import { createHash, randomUUID } from 'node:crypto';
import { config } from '../config.js';
import { db } from '../db.js';
import { logger } from '../logger.js';
import { notFound, upstreamError } from '../errors.js';
import type { SourceType } from '../types.js';
import { AudiobookshelfAdapter } from './audiobookshelf.js';
import { LocalLibraryAdapter } from './local.js';
import { PlexAdapter } from './plex.js';
import type { RawBook, SourceAdapter, SourceRow } from './types.js';

export const internalBookId = (sourceId: string, externalId: string): string =>
  createHash('sha1').update(`${sourceId}::${externalId}`).digest('hex').slice(0, 24);

export function getSource(id: string): SourceRow {
  const source = db.prepare('SELECT * FROM sources WHERE id = ?').get(id) as SourceRow | undefined;
  if (!source) throw notFound('书源不存在');
  return source;
}

export function listSources(): (SourceRow & { book_count: number })[] {
  return db.prepare(`SELECT s.*, (SELECT COUNT(*) FROM books b WHERE b.source_id = s.id) AS book_count
    FROM sources s ORDER BY s.created_at`).all() as (SourceRow & { book_count: number })[];
}

export function adapterFor(source: SourceRow): SourceAdapter {
  switch (source.type) {
    case 'audiobookshelf': return new AudiobookshelfAdapter(source);
    case 'plex': return new PlexAdapter(source);
    case 'local': return new LocalLibraryAdapter(source);
    default: throw upstreamError(`不支持的书源类型: ${source.type}`);
  }
}

export function createSource(input: {
  type: SourceType; name: string; baseUrl?: string; token?: string; paths?: string[]; enabled?: boolean;
}): SourceRow {
  const id = randomUUID();
  const extra = input.type === 'local' ? JSON.stringify({ paths: input.paths ?? [] }) : '{}';
  db.prepare(`INSERT INTO sources (id, type, name, base_url, token, extra, enabled, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(
    id, input.type, input.name, input.baseUrl ?? '', input.token ?? '', extra,
    input.enabled === false ? 0 : 1, new Date().toISOString()
  );
  return getSource(id);
}

export function deleteSource(id: string): void {
  db.prepare('DELETE FROM sources WHERE id = ?').run(id);
}

export function setSourceEnabled(id: string, enabled: boolean): void {
  db.prepare('UPDATE sources SET enabled = ? WHERE id = ?').run(enabled ? 1 : 0, id);
}

export function ensureConfiguredSources(): void {
  const existing = db.prepare('SELECT id, type FROM sources').all() as { id: string; type: SourceType }[];
  const has = (type: SourceType) => existing.some((source) => source.type === type);
  if (config.ABS_BASE_URL && config.ABS_TOKEN && !has('audiobookshelf')) {
    createSource({ type: 'audiobookshelf', name: 'Audiobookshelf', baseUrl: config.ABS_BASE_URL, token: config.ABS_TOKEN });
  }
  if (config.PLEX_BASE_URL && config.PLEX_TOKEN && !has('plex')) {
    createSource({ type: 'plex', name: 'Plex', baseUrl: config.PLEX_BASE_URL, token: config.PLEX_TOKEN });
  }
  if (config.localLibraryPaths.length && !has('local')) {
    createSource({ type: 'local', name: '本地书库', paths: config.localLibraryPaths });
  }
}

const upsertBookStatement = db.prepare(`
  INSERT INTO books (id, source_id, external_id, title, author, narrator, series, description,
    cover_path, cover_url, duration, language, tags, added_at, updated_at)
  VALUES (@id, @sourceId, @externalId, @title, @author, @narrator, @series, @description,
    @coverPath, @coverUrl, @duration, @language, @tags, @addedAt, @updatedAt)
  ON CONFLICT(id) DO UPDATE SET
    title=excluded.title, author=excluded.author, narrator=excluded.narrator, series=excluded.series,
    description=excluded.description, cover_path=excluded.cover_path, cover_url=excluded.cover_url,
    duration=excluded.duration, language=excluded.language, tags=excluded.tags,
    added_at=excluded.added_at, updated_at=excluded.updated_at
`);

const insertChapter = db.prepare(`INSERT INTO chapters (id, book_id, title, start_offset, duration, track_index, position)
  VALUES (?, ?, ?, ?, ?, ?, ?)`);
const insertTrack = db.prepare(`INSERT INTO tracks (id, book_id, title, file_path, remote_url, mime_type, duration, size, position)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);

function persistBook(source: SourceRow, raw: RawBook, now: number): void {
  const id = internalBookId(source.id, raw.externalId);
  upsertBookStatement.run({
    id,
    sourceId: source.id,
    externalId: raw.externalId,
    title: raw.title,
    author: raw.author,
    narrator: raw.narrator,
    series: raw.series,
    description: raw.description,
    coverPath: raw.coverPath,
    coverUrl: raw.coverUrl,
    duration: raw.duration,
    language: raw.language,
    tags: JSON.stringify(raw.tags),
    addedAt: raw.addedAt || now,
    updatedAt: now
  });
  db.prepare('DELETE FROM chapters WHERE book_id = ?').run(id);
  db.prepare('DELETE FROM tracks WHERE book_id = ?').run(id);
  raw.chapters.forEach((chapter, index) => insertChapter.run(
    chapter.externalId.startsWith('chapter-') || chapter.externalId.startsWith('auto-')
      ? `${id}-${chapter.externalId}-${index}` : `${id}-${chapter.externalId}`,
    id, chapter.title, chapter.start, chapter.duration, chapter.trackIndex, index
  ));
  raw.tracks.forEach((track, index) => insertTrack.run(
    `${id}-${track.externalId}`, id, track.title, track.filePath,
    track.remoteUrl.startsWith('/') ? track.remoteUrl : track.remoteUrl,
    track.mimeType, track.duration, track.size, index
  ));

  if (raw.progress) {
    const owner = db.prepare("SELECT id FROM users WHERE role = 'admin' ORDER BY created_at LIMIT 1").get() as { id: string } | undefined;
    if (owner) {
      const existing = db.prepare('SELECT 1 FROM progress WHERE user_id = ? AND book_id = ?').get(owner.id, id);
      if (!existing) {
        db.prepare(`INSERT INTO progress (user_id, book_id, position, duration, finished, updated_at, started_at, finished_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(
          owner.id, id, raw.progress.position, raw.progress.duration, raw.progress.finished ? 1 : 0,
          raw.progress.updatedAt || now, now, raw.progress.finished ? now : null
        );
      }
    }
  }
}

export async function syncSource(id: string): Promise<{ books: number; collections: number; errors: string[] }> {
  const source = getSource(id);
  // 演示书库由 seedDemoData 直接写入数据库，没有上游适配器可同步。
  // 这里返回当前条目数而不是抛错，避免演示模式下点击「同步书源」把服务打挂。
  if (source.type === 'demo') {
    const books = (db.prepare('SELECT COUNT(*) AS count FROM books WHERE source_id = ?').get(id) as { count: number }).count;
    const collections = (db.prepare('SELECT COUNT(*) AS count FROM collections WHERE source_id = ?').get(id) as { count: number }).count;
    const now = Math.floor(Date.now() / 1000);
    db.prepare('UPDATE sources SET last_synced_at = ? WHERE id = ?').run(now, id);
    logger.info({ sourceId: id, books, collections }, 'demo source sync skipped (no upstream)');
    return { books, collections, errors: [] };
  }
  const adapter = adapterFor(source);
  const now = Math.floor(Date.now() / 1000);
  const errors: string[] = [];
  let books = 0;
  let collections = 0;

  let rawBooks: RawBook[] = [];
  try {
    rawBooks = await adapter.listBooks();
  } catch (error) {
    errors.push(String(error instanceof Error ? error.message : error));
  }

  if (rawBooks.length) {
    const persist = db.transaction(() => {
      for (const raw of rawBooks) persistBook(source, raw, now);
      const ids = rawBooks.map((raw) => internalBookId(source.id, raw.externalId));
      const placeholders = ids.map(() => '?').join(',');
      if (ids.length) db.prepare(`DELETE FROM books WHERE source_id = ? AND id NOT IN (${placeholders})`).run(source.id, ...ids);
      else db.prepare('DELETE FROM books WHERE source_id = ?').run(source.id);
    });
    persist();
    books = rawBooks.length;
  }

  if (adapter.listCollections) {
    try {
      const rawCollections = await adapter.listCollections();
      const persist = db.transaction(() => {
        for (const collection of rawCollections) {
          const bookIds = collection.bookExternalIds.map((externalId) => internalBookId(source.id, externalId));
          db.prepare(`INSERT INTO collections (id, source_id, external_id, title, description, book_ids, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(source_id, external_id) DO UPDATE SET
              title=excluded.title, description=excluded.description, book_ids=excluded.book_ids, updated_at=excluded.updated_at`)
            .run(`${source.id}-${collection.externalId}`, source.id, collection.externalId,
              collection.title, collection.description, JSON.stringify(bookIds), now);
        }
      });
      persist();
      collections = rawCollections.length;
    } catch (error) {
      errors.push(String(error instanceof Error ? error.message : error));
    }
  }

  db.prepare('UPDATE sources SET last_synced_at = ? WHERE id = ?').run(now, id);
  logger.info({ sourceId: id, books, collections, errors }, 'source synchronized');
  return { books, collections, errors };
}

export async function syncAllSources(): Promise<void> {
  const sources = db.prepare('SELECT id FROM sources WHERE enabled = 1').all() as { id: string }[];
  for (const source of sources) {
    try {
      await syncSource(source.id);
    } catch (error) {
      logger.error({ sourceId: source.id, error: String(error) }, 'source sync failed');
    }
  }
}
