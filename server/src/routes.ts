import { randomUUID } from 'node:crypto';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { Readable } from 'node:stream';
import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { issueTokenPair, revokeRefreshToken, requireAuth, rotateRefreshToken, verifyPassword, hashPassword } from './auth.js';
import { config } from './config.js';
import { db } from './db.js';
import { badRequest, notFound, unauthorized } from './errors.js';
import { logger } from './logger.js';
import { createSource, deleteSource, listSources, setSourceEnabled, syncSource } from './sources/index.js';
import {
  coverAuthHeaders, coverTarget, getBook, getCollection, getContinueListening, getFinished,
  getRecentlyAdded, listBooks, listCollections, resolveStreamTarget, searchBooks
} from './services/library.js';
import {
  deleteSetting, listProgress, listSettings, markFinished, resetProgress, saveProgress, setSetting
} from './services/progress.js';
import { createBookmark, deleteBookmark, listBookmarks, updateBookmark } from './services/bookmarks.js';
import { getStats } from './services/stats.js';
import { getTranscript, requestTranscript } from './services/transcript.js';
import type { AuthRequest } from './types.js';

export const api = Router();

const body = <T extends z.ZodTypeAny>(schema: T, value: unknown): z.infer<T> => {
  const result = schema.safeParse(value);
  if (!result.success) throw badRequest('请求参数不正确', result.error.flatten());
  return result.data;
};

const userId = (req: Request): string => {
  const id = (req as AuthRequest).userId;
  if (!id) throw unauthorized();
  return id;
};

// ---------- 认证 ----------
api.post('/auth/login', (req, res) => {
  const input = body(z.object({ username: z.string().min(1), password: z.string().min(1) }), req.body);
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(input.username) as
    | { id: string; username: string; password_hash: string; role: string } | undefined;
  if (!user || !verifyPassword(input.password, user.password_hash)) throw unauthorized('用户名或密码错误');
  const tokens = issueTokenPair(user);
  setAuthCookies(res, tokens);
  res.json({ user: { id: user.id, username: user.username, role: user.role }, ...tokens });
});

function setAuthCookies(res: Response, tokens: { accessToken: string; refreshToken: string }): void {
  const base = { httpOnly: true, sameSite: 'lax' as const, secure: config.isProd, path: '/api' };
  res.cookie('ss_access', tokens.accessToken, { ...base, maxAge: 15 * 60 * 1000 });
  res.cookie('ss_refresh', tokens.refreshToken, { ...base, maxAge: 30 * 24 * 60 * 60 * 1000 });
}

api.post('/auth/refresh', (req, res) => {
  const fromCookie = (req.headers.cookie ?? '').split(';').map((part) => part.trim())
    .find((cookie) => cookie.startsWith('ss_refresh='));
  const refreshToken = fromCookie
    ? decodeURIComponent(fromCookie.slice('ss_refresh='.length))
    : body(z.object({ refreshToken: z.string().min(1) }), req.body).refreshToken;
  const tokens = rotateRefreshToken(refreshToken);
  setAuthCookies(res, tokens);
  res.json(tokens);
});

api.post('/auth/logout', requireAuth, (req, res) => {
  const input = body(z.object({ refreshToken: z.string().optional() }), req.body ?? {});
  if (input.refreshToken) revokeRefreshToken(input.refreshToken);
  res.clearCookie('ss_access', { path: '/api' });
  res.clearCookie('ss_refresh', { path: '/api' });
  res.json({ ok: true });
});

api.get('/auth/me', requireAuth, (req, res) => {
  const user = db.prepare('SELECT id, username, role, created_at FROM users WHERE id = ?').get(userId(req));
  res.json({ user });
});

api.post('/auth/register', requireAuth, (req, res) => {
  const actor = db.prepare('SELECT role FROM users WHERE id = ?').get(userId(req)) as { role: string } | undefined;
  if (actor?.role !== 'admin') throw unauthorized('仅管理员可以创建用户');
  const input = body(z.object({ username: z.string().min(2), password: z.string().min(8), role: z.enum(['admin', 'member']).default('member') }), req.body);
  if (db.prepare('SELECT 1 FROM users WHERE username = ?').get(input.username)) throw badRequest('用户名已存在');
  const id = randomUUID();
  db.prepare('INSERT INTO users (id, username, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(id, input.username, hashPassword(input.password), input.role, new Date().toISOString());
  res.status(201).json({ user: { id, username: input.username, role: input.role } });
});

// ---------- 书源 ----------
api.get('/libraries', requireAuth, (_req, res) => res.json({ sources: listSources() }));

api.post('/libraries', requireAuth, (req, res) => {
  const actor = db.prepare('SELECT role FROM users WHERE id = ?').get(userId(req)) as { role: string } | undefined;
  if (actor?.role !== 'admin') throw unauthorized('仅管理员可以添加书源');
  const input = body(z.object({
    type: z.enum(['audiobookshelf', 'plex', 'local']),
    name: z.string().min(1),
    baseUrl: z.string().default(''),
    token: z.string().default(''),
    paths: z.array(z.string()).optional(),
    enabled: z.boolean().optional()
  }), req.body);
  res.status(201).json({ source: createSource(input) });
});

api.patch('/libraries/:id', requireAuth, (req, res) => {
  const input = body(z.object({ enabled: z.boolean().optional(), name: z.string().optional() }), req.body);
  if (input.enabled !== undefined) setSourceEnabled(req.params.id, input.enabled);
  if (input.name) db.prepare('UPDATE sources SET name = ? WHERE id = ?').run(input.name, req.params.id);
  res.json({ source: listSources().find((source) => source.id === req.params.id) });
});

api.delete('/libraries/:id', requireAuth, (req, res) => {
  deleteSource(req.params.id);
  res.json({ ok: true });
});

api.post('/libraries/:id/sync', requireAuth, async (req, res) => {
  const result = await syncSource(req.params.id);
  res.json(result);
});

// ---------- 书库 ----------
api.get('/home', requireAuth, (req, res) => {
  const uid = userId(req);
  res.json({
    continueListening: getContinueListening(uid),
    recentlyAdded: getRecentlyAdded(),
    finished: getFinished(uid),
    stats: getStats(uid)
  });
});

api.get('/books', requireAuth, (req, res) => {
  const query = z.object({
    search: z.string().optional(),
    filter: z.enum(['all', 'unfinished', 'finished', 'in-progress', 'series']).optional(),
    sort: z.enum(['recent', 'title', 'author', 'duration', 'progress']).optional(),
    sourceId: z.string().optional(),
    page: z.coerce.number().int().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional()
  }).parse(req.query);
  res.json(listBooks({ ...query, userId: userId(req) }));
});

api.get('/books/:id', requireAuth, (req, res) => res.json(getBook(req.params.id, userId(req))));

api.get('/books/:id/chapters', requireAuth, (req, res) => res.json({ chapters: getBook(req.params.id, userId(req)).chapters }));

api.get('/search', requireAuth, (req, res) => {
  const query = String(req.query.q ?? '').slice(0, 100);
  res.json({ books: searchBooks(query, userId(req)) });
});

api.get('/collections', requireAuth, (req, res) => res.json({ collections: listCollections(userId(req)) }));
api.get('/collections/:id', requireAuth, (req, res) => res.json(getCollection(req.params.id, userId(req))));

// ---------- 音频与封面代理 ----------
function parseRange(header: string | undefined, size: number): { start: number; end: number } | null {
  if (!header || !header.startsWith('bytes=')) return null;
  const match = /bytes=(\d*)-(\d*)/.exec(header);
  if (!match) return null;
  const start = match[1] ? Number(match[1]) : 0;
  const end = match[2] ? Number(match[2]) : size - 1;
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return null;
  return { start, end: Math.min(end, size - 1) };
}

api.get('/books/:id/stream', requireAuth, async (req, res) => {
  const target = await resolveStreamTarget(req.params.id, req.query.track ? String(req.query.track) : undefined);
  res.setHeader('Accept-Ranges', 'bytes');

  if (target.filePath && existsSync(target.filePath)) {
    const size = statSync(target.filePath).size;
    const range = parseRange(req.headers.range, size);
    res.type(target.mimeType);
    if (range) {
      res.status(206);
      res.setHeader('Content-Range', `bytes ${range.start}-${range.end}/${size}`);
      res.setHeader('Content-Length', String(range.end - range.start + 1));
      createReadStream(target.filePath, { start: range.start, end: range.end }).pipe(res);
    } else {
      res.setHeader('Content-Length', String(size));
      createReadStream(target.filePath).pipe(res);
    }
    return;
  }

  if (target.url) {
    const headers: Record<string, string> = { ...target.headers };
    if (req.headers.range) headers.Range = req.headers.range;
    const upstream = await fetch(target.url, { headers, signal: AbortSignal.timeout(60000) });
    res.status(upstream.status);
    for (const key of ['content-type', 'content-length', 'content-range', 'accept-ranges']) {
      const value = upstream.headers.get(key);
      if (value) res.setHeader(key, value);
    }
    if (upstream.body) Readable.fromWeb(upstream.body as never).pipe(res);
    else res.end();
    return;
  }
  throw notFound('音频文件不可访问');
});

api.get('/assets/cover/:bookId', requireAuth, async (req, res) => {
  const target = coverTarget(req.params.bookId);
  if (target.filePath && existsSync(target.filePath)) {
    res.sendFile(target.filePath);
    return;
  }
  if (target.url?.startsWith('data:')) {
    const [meta, payload] = target.url.split(',');
    res.type(meta.includes('svg') ? 'image/svg+xml' : 'image/png').send(decodeURIComponent(payload ?? ''));
    return;
  }
  if (target.url) {
    const upstream = await fetch(target.url, {
      headers: coverAuthHeaders(target.sourceId),
      signal: AbortSignal.timeout(15000)
    });
    if (!upstream.ok) throw notFound('封面加载失败');
    res.type(upstream.headers.get('content-type') ?? 'image/jpeg');
    if (upstream.body) Readable.fromWeb(upstream.body as never).pipe(res);
    return;
  }
  throw notFound('封面不存在');
});

// ---------- 进度 ----------
api.get('/progress', requireAuth, (req, res) => res.json({ progress: listProgress(userId(req)) }));

api.put('/progress/:bookId', requireAuth, (req, res) => {
  const input = body(z.object({
    position: z.number().min(0),
    duration: z.number().min(0).optional(),
    finished: z.boolean().optional(),
    sessionSeconds: z.number().min(0).optional(),
    sessionStartedAt: z.number().optional(),
    playbackSpeed: z.number().min(0.25).max(5).optional()
  }), req.body);
  res.json(saveProgress(userId(req), req.params.bookId, input));
});

api.post('/progress/:bookId/finish', requireAuth, (req, res) => {
  const input = body(z.object({ finished: z.boolean().default(true) }), req.body ?? {});
  res.json(markFinished(userId(req), req.params.bookId, input.finished));
});

api.delete('/progress/:bookId', requireAuth, (req, res) => {
  res.json(resetProgress(userId(req), req.params.bookId));
});

// ---------- 书签 ----------
api.get('/bookmarks', requireAuth, (req, res) => {
  res.json({ bookmarks: listBookmarks(userId(req), req.query.bookId ? String(req.query.bookId) : undefined) });
});

api.post('/bookmarks', requireAuth, (req, res) => {
  const input = body(z.object({
    bookId: z.string().min(1), chapterId: z.string().optional(), position: z.number().optional(),
    title: z.string().optional(), note: z.string().optional()
  }), req.body);
  res.status(201).json(createBookmark(userId(req), input));
});

api.patch('/bookmarks/:id', requireAuth, (req, res) => {
  const input = body(z.object({
    title: z.string().optional(), note: z.string().optional(),
    position: z.number().optional(), chapterId: z.string().optional()
  }), req.body);
  res.json(updateBookmark(userId(req), req.params.id, input));
});

api.delete('/bookmarks/:id', requireAuth, (req, res) => {
  deleteBookmark(userId(req), req.params.id);
  res.json({ ok: true });
});

// ---------- 统计与设置 ----------
api.get('/stats', requireAuth, (req, res) => res.json(getStats(userId(req))));

api.get('/settings', requireAuth, (req, res) => res.json(listSettings(userId(req))));
api.patch('/settings', requireAuth, (req, res) => {
  const input = body(z.object({ key: z.string().min(1), value: z.unknown() }), req.body);
  setSetting(userId(req), input.key, input.value);
  res.json({ ok: true });
});
api.delete('/settings/:key', requireAuth, (req, res) => {
  deleteSetting(userId(req), req.params.key);
  res.json({ ok: true });
});

// ---------- 转录与队列 ----------
api.get('/transcript/:bookId', requireAuth, (req, res) => res.json(getTranscript(req.params.bookId)));
api.post('/transcript/:bookId', requireAuth, (req, res) => res.json(requestTranscript(req.params.bookId)));

api.get('/queue', requireAuth, (_req, res) => {
  const rows = db.prepare(`SELECT j.*, b.title AS book_title FROM jobs j
    LEFT JOIN books b ON b.id = json_extract(j.payload, '$.bookId')
    ORDER BY j.created_at DESC LIMIT 100`).all();
  res.json({ jobs: rows });
});
api.post('/queue', requireAuth, (req, res) => {
  const input = body(z.object({ type: z.enum(['transcript', 'sync']), payload: z.record(z.unknown()).default({}) }), req.body);
  const id = randomUUID();
  db.prepare(`INSERT INTO jobs (id, type, payload, status, next_run_at, created_at) VALUES (?, ?, ?, 'pending', ?, ?)`)
    .run(id, input.type, JSON.stringify(input.payload), Date.now(), Date.now());
  res.status(201).json({ id });
});
api.delete('/queue/:id', requireAuth, (req, res) => {
  db.prepare('DELETE FROM jobs WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ---------- 系统 ----------
api.get('/health', (_req, res) => res.json({ status: 'ok', uptime: process.uptime() }));
api.get('/ready', (_req, res) => {
  try {
    db.prepare('SELECT 1').get();
    res.json({ status: 'ready', demoMode: config.demoMode });
  } catch (error) {
    logger.error({ error: String(error) }, 'readiness check failed');
    res.status(503).json({ status: 'unavailable' });
  }
});
