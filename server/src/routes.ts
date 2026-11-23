import { randomUUID } from 'node:crypto';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { Readable } from 'node:stream';
import { Router, type NextFunction, type Request, type RequestHandler, type Response } from 'express';
import { z } from 'zod';
import { issueTokenPair, revokeRefreshToken, requireAuth, rotateRefreshToken, verifyPassword, hashPassword } from './auth.js';
import { config } from './config.js';
import { db } from './db.js';
import { badRequest, notFound, unauthorized } from './errors.js';
import { logger } from './logger.js';
import { createSource, deleteSource, getSource, listSources, setSourceEnabled, syncSource, adapterFor } from './sources/index.js';
import {
  booksByAuthor, getAllHistory, getHistory, getMediaInfo, listAuthors
} from './services/discovery.js';
import {
  coverAuthHeaders, coverTarget, getBook, getCollection, getContinueListening, getFinished,
  getRecentlyAdded, listBooks, listCollections, resolveStreamTarget, searchBooks, verifyCoverSignature
} from './services/library.js';
import {
  deleteSetting, getSetting, listProgress, listSettings, markFinished, resetProgress, saveProgress, setSetting
} from './services/progress.js';
import { createBookmark, deleteBookmark, listBookmarks, updateBookmark } from './services/bookmarks.js';
import { getStats } from './services/stats.js';
import { getTranscript, requestTranscript } from './services/transcript.js';
import { checkPlexPin, createPlexPin } from './services/plex-oauth.js';
import type { AuthRequest } from './types.js';

export const api = Router();

const body = <T extends z.ZodTypeAny>(schema: T, value: unknown): z.infer<T> => {
  const result = schema.safeParse(value);
  if (!result.success) throw badRequest('请求参数不正确', result.error.flatten());
  return result.data;
};

// Express 4 不会捕获 async handler 返回的 rejected Promise；未处理的 rejection
// 在 Node 22 下会直接终止进程。统一把异步错误转交给错误处理中间件。
const asyncRoute = (
  handler: (req: Request, res: Response, next: NextFunction) => Promise<unknown>
): RequestHandler => (req, res, next) => {
  void Promise.resolve(handler(req, res, next)).catch(next);
};

const userId = (req: Request): string => {
  const id = (req as AuthRequest).userId;
  if (!id) throw unauthorized();
  return id;
};

const requireAdmin = (req: Request): void => {
  const actor = db.prepare('SELECT role FROM users WHERE id = ?').get(userId(req)) as { role: string } | undefined;
  if (actor?.role !== 'admin') throw unauthorized('仅管理员可以执行此操作');
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

// ---------- Plex 账户登录（PIN 授权） ----------
api.post('/plex/oauth/start', requireAuth, asyncRoute(async (req, res) => {
  requireAdmin(req);
  res.json(await createPlexPin(userId(req)));
}));

api.get('/plex/oauth/check', requireAuth, asyncRoute(async (req, res) => {
  requireAdmin(req);
  const pinId = String(req.query.pinId ?? '');
  if (!pinId) throw badRequest('缺少 pinId');
  res.json(await checkPlexPin(pinId, userId(req)));
}));

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
    libraryIds: z.array(z.string()).optional(),
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

api.post('/libraries/:id/sync', requireAuth, asyncRoute(async (req, res) => {
  const result = await syncSource(req.params.id);
  res.json(result);
}));

// 探测书源的资料库列表，用于添加向导中的「选择一个或多个库」
api.post('/libraries/probe', requireAuth, asyncRoute(async (req, res) => {
  const input = body(z.object({
    type: z.enum(['plex', 'audiobookshelf']),
    baseUrl: z.string().url(),
    token: z.string().min(1)
  }), req.body);
  const adapter = adapterFor({
    id: 'probe', type: input.type, name: 'probe', base_url: input.baseUrl,
    token: input.token, extra: '{}', enabled: 1
  });
  if (!adapter.listLibraries) throw badRequest('该书源不支持资料库探测');
  const libraries = await adapter.listLibraries();
  res.json({ libraries });
}));

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
    genre: z.string().optional(),
    bookIds: z.string().optional(),
    page: z.coerce.number().int().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional()
  }).parse(req.query);
  res.json(listBooks({
    ...query,
    userId: userId(req),
    bookIds: query.bookIds ? query.bookIds.split(',').filter(Boolean) : undefined
  }));
});

api.get('/books/:id', requireAuth, (req, res) => res.json(getBook(req.params.id, userId(req))));

api.get('/books/:id/chapters', requireAuth, (req, res) => res.json({ chapters: getBook(req.params.id, userId(req)).chapters }));

api.get('/search', requireAuth, (req, res) => {
  const query = String(req.query.q ?? '').slice(0, 100);
  res.json({ books: searchBooks(query, userId(req)) });
});

api.get('/collections', requireAuth, (req, res) => res.json({ collections: listCollections(userId(req)) }));
api.get('/collections/:id', requireAuth, (req, res) => res.json(getCollection(req.params.id, userId(req))));

// ---------- 作者与历史 ----------
api.get('/authors', requireAuth, (_req, res) => res.json({ authors: listAuthors() }));
api.get('/authors/:name/books', requireAuth, (req, res) => {
  res.json({ books: booksByAuthor(req.params.name, userId(req)) });
});
api.get('/history', requireAuth, (req, res) => {
  const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 50));
  res.json({ events: getAllHistory(userId(req), limit) });
});
api.get('/books/:id/history', requireAuth, (req, res) => {
  res.json({ events: getHistory(userId(req), req.params.id) });
});
api.get('/books/:id/media', requireAuth, (req, res) => res.json(getMediaInfo(req.params.id)));

// 播放清单：以 settings 的 playlists 键保存，避免额外表结构
api.get('/playlists', requireAuth, (req, res) => {
  res.json({ playlists: getSetting<{ name: string; bookIds: string[] }[]>(userId(req), 'playlists', []) });
});
api.post('/playlists', requireAuth, (req, res) => {
  const input = body(z.object({ name: z.string().default('播放清单'), bookId: z.string().min(1) }), req.body);
  const uid = userId(req);
  const existing = getSetting<{ name: string; bookIds: string[] }[]>(uid, 'playlists', []);
  let playlist = existing.find((item) => item.name === input.name);
  if (!playlist) {
    playlist = { name: input.name, bookIds: [] };
    existing.push(playlist);
  }
  if (!playlist.bookIds.includes(input.bookId)) playlist.bookIds.push(input.bookId);
  setSetting(uid, 'playlists', existing);
  res.status(201).json({ playlist });
});
api.delete('/playlists/:name/books/:bookId', requireAuth, (req, res) => {
  const uid = userId(req);
  const existing = getSetting<{ name: string; bookIds: string[] }[]>(uid, 'playlists', []);
  const playlist = existing.find((item) => item.name === req.params.name);
  if (!playlist) throw notFound('播放清单不存在');
  playlist.bookIds = playlist.bookIds.filter((id) => id !== req.params.bookId);
  setSetting(uid, 'playlists', existing);
  res.json({ playlist });
});

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

api.get('/books/:id/stream', requireAuth, asyncRoute(async (req, res) => {
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
}));

/** 上游没有封面时返回的占位图，避免客户端出现裂图 */
const placeholderCover = (title: string): string => {
  const label = (title || '书').trim().slice(0, 1) || '书';
  let hash = 0;
  for (let i = 0; i < title.length; i += 1) hash = (hash * 31 + title.charCodeAt(i)) % 360;
  const from = `hsl(${hash}, 26%, 22%)`;
  const to = `hsl(${(hash + 38) % 360}, 34%, 34%)`;
  const safe = label.replace(/[<>&'"]/g, '');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 400 400">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
<stop offset="0%" stop-color="${from}"/><stop offset="100%" stop-color="${to}"/></linearGradient></defs>
<rect width="400" height="400" fill="url(#g)"/>
<text x="200" y="200" fill="rgba(255,255,255,.82)" font-family="Georgia,serif" font-size="150"
 font-weight="500" text-anchor="middle" dominant-baseline="central">${safe}</text></svg>`;
};

const sendPlaceholder = (res: Response, bookId: string): void => {
  const row = db.prepare('SELECT title FROM books WHERE id = ?').get(bookId) as { title: string } | undefined;
  res.setHeader('Cache-Control', 'private, max-age=600');
  res.type('image/svg+xml').send(placeholderCover(row?.title ?? ''));
};

/** 封面既可带长期签名（img/小程序），也接受常规登录态 */
const coverAccess = (req: Request, res: Response, next: NextFunction): void => {
  const signature = typeof req.query.t === 'string' ? req.query.t : '';
  if (signature && verifyCoverSignature(String(req.params.bookId), signature)) {
    next();
    return;
  }
  requireAuth(req as AuthRequest, res, next);
};

api.get('/assets/cover/:bookId', coverAccess, asyncRoute(async (req, res) => {
  let target: { filePath?: string; url?: string; sourceId: string };
  try {
    target = coverTarget(req.params.bookId);
  } catch {
    sendPlaceholder(res, req.params.bookId);
    return;
  }
  res.setHeader('Cache-Control', 'private, max-age=86400');
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
    let upstream: globalThis.Response | null = null;
    try {
      upstream = await fetch(target.url, {
        headers: coverAuthHeaders(target.sourceId),
        signal: AbortSignal.timeout(15000)
      });
    } catch {
      upstream = null;
    }
    if (!upstream || !upstream.ok) {
      sendPlaceholder(res, req.params.bookId);
      return;
    }
    res.setHeader('Cache-Control', 'private, max-age=86400');
    res.type(upstream.headers.get('content-type') ?? 'image/jpeg');
    if (upstream.body) Readable.fromWeb(upstream.body as never).pipe(res);
    return;
  }
  sendPlaceholder(res, req.params.bookId);
}));

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
