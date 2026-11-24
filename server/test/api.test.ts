/**
 * SoundShelf 服务端集成测试（项目首套自动化测试）。
 *
 * 方案：Node 内置 test runner + 项目已有的 tsx，零新增依赖。
 * 每个测试进程拉起一个独立的服务端子进程：临时 SQLite 数据库、随机端口、
 * DEMO_MODE=true、显式注入全部必需环境变量，不依赖开发者本地 .env，
 * 结束后杀掉子进程并删除临时目录。
 */
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const PORT = 20000 + (process.pid % 25000);
const BASE = `http://127.0.0.1:${PORT}`;
const ADMIN = { username: 'admin', password: 'test-password-123' };

let child: ChildProcess | undefined;
let tmpDir = '';
let token = '';
let bookId = '';

async function waitForHealth(timeoutMs = 30000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${BASE}/api/health`);
      if (res.ok) return;
    } catch { /* 服务尚未起来 */ }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`服务端在 ${timeoutMs}ms 内未通过健康检查（端口 ${PORT}）`);
}

async function req(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${BASE}${path}`, init);
}

function authed(path: string, init: RequestInit = {}): Promise<Response> {
  return req(path, {
    ...init,
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', ...(init.headers ?? {}) }
  });
}

async function login(): Promise<string> {
  const res = await req('/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(ADMIN)
  });
  assert.equal(res.status, 200);
  const body = await res.json() as { accessToken?: string };
  assert.ok(body.accessToken, '登录响应应包含 accessToken');
  return body.accessToken;
}

before(async () => {
  tmpDir = mkdtempSync(join(tmpdir(), 'soundshelf-test-'));
  const serverDir = fileURLToPath(new URL('..', import.meta.url));
  const tsxCli = join(serverDir, 'node_modules', 'tsx', 'dist', 'cli.mjs');
  child = spawn(process.execPath, [tsxCli, 'src/server.ts'], {
    cwd: serverDir,
    env: {
      ...process.env,
      NODE_ENV: 'test',
      HOST: '127.0.0.1',
      PORT: String(PORT),
      JWT_SECRET: 'test-secret-at-least-32-characters-long',
      ADMIN_USERNAME: ADMIN.username,
      ADMIN_PASSWORD: ADMIN.password,
      DATABASE_PATH: join(tmpDir, 'test.sqlite'),
      DEMO_MODE: 'true',
      SKIP_STARTUP_SYNC: 'true',
      LOG_LEVEL: 'error'
    },
    stdio: 'ignore'
  });
  await waitForHealth();
  token = await login();
  const booksRes = await authed('/api/books');
  const books = await booksRes.json() as { books: Array<{ id: string }> };
  assert.ok(books.books.length > 0, '演示模式应生成演示书库');
  bookId = books.books[0].id;
}, { timeout: 60000 });

after(async () => {
  if (child && !child.killed) {
    child.kill('SIGTERM');
    await Promise.race([
      new Promise((r) => child!.once('exit', r)),
      new Promise((r) => setTimeout(r, 3000))
    ]);
    if (!child.killed) child.kill('SIGKILL');
  }
  if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
});

describe('健康检查', () => {
  it('GET /api/health 返回 ok', async () => {
    const res = await req('/api/health');
    assert.equal(res.status, 200);
    const body = await res.json() as { status?: string };
    assert.equal(body.status, 'ok');
  });
});

describe('认证', () => {
  it('演示管理员可以登录并拿到令牌', async () => {
    const t = await login();
    assert.equal(typeof t, 'string');
    assert.ok(t.length > 20);
  });

  it('密码错误返回 401', async () => {
    const res = await req('/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: ADMIN.username, password: 'wrong-password' })
    });
    assert.equal(res.status, 401);
  });

  it('未登录访问受保护接口返回 401', async () => {
    assert.equal((await req('/api/books')).status, 401);
    assert.equal((await req('/api/backup')).status, 401);
    assert.equal((await req('/api/progress')).status, 401);
  });
});

describe('播放进度与每本书偏好', () => {
  it('保存进度与倍速/片头/片尾偏好后能读回', async () => {
    const put = await authed(`/api/progress/${bookId}`, {
      method: 'PUT',
      body: JSON.stringify({ position: 123, playbackSpeed: 1.5, introSkipSeconds: 30, outroSkipSeconds: 45 })
    });
    assert.equal(put.status, 200);

    const list = await (await authed('/api/progress')).json() as { progress: Array<{ book_id: string; position: number }> };
    const row = list.progress.find((p) => p.book_id === bookId);
    assert.ok(row, '进度列表应包含刚保存的书');
    assert.equal(row.position, 123);

    const settings = await (await authed('/api/settings')).json() as Record<string, unknown>;
    const bag = (settings.settings ?? settings) as Record<string, { speed?: number; introSkipSeconds?: number; outroSkipSeconds?: number }>;
    const prefs = bag[`playback:${bookId}`];
    assert.ok(prefs, '设置中应包含该书的播放偏好');
    assert.equal(prefs.speed, 1.5);
    assert.equal(prefs.introSkipSeconds, 30);
    assert.equal(prefs.outroSkipSeconds, 45);
  });

  it('非法进度值返回 400', async () => {
    const neg = await authed(`/api/progress/${bookId}`, { method: 'PUT', body: JSON.stringify({ position: -1 }) });
    assert.equal(neg.status, 400);
    const badIntro = await authed(`/api/progress/${bookId}`, {
      method: 'PUT',
      body: JSON.stringify({ position: 0, introSkipSeconds: 601 })
    });
    assert.equal(badIntro.status, 400);
  });
});

describe('书签', () => {
  it('创建、列出、删除书签', async () => {
    const created = await authed('/api/bookmarks', {
      method: 'POST',
      body: JSON.stringify({ bookId, position: 42, title: '测试书签', note: '自动化测试' })
    });
    assert.equal(created.status, 201);
    const bookmark = await created.json() as { id: string; title?: string };
    assert.ok(bookmark.id);

    const list = await (await authed(`/api/bookmarks?bookId=${bookId}`)).json() as { bookmarks: Array<{ id: string }> };
    assert.ok(list.bookmarks.some((b) => b.id === bookmark.id), '书签列表应包含新建书签');

    const del = await authed(`/api/bookmarks/${bookmark.id}`, { method: 'DELETE' });
    assert.equal(del.status, 200);
    const after = await (await authed(`/api/bookmarks?bookId=${bookId}`)).json() as { bookmarks: Array<{ id: string }> };
    assert.ok(!after.bookmarks.some((b) => b.id === bookmark.id), '删除后书签不应再出现');
  });
});

describe('一键备份与恢复', () => {
  it('导出包含数据，删除后恢复能找回，坏文件被拒绝且不伤现有数据', async () => {
    // 准备数据：进度（前面的用例已保存 position=123）+ 一个新书签
    const created = await authed('/api/bookmarks', {
      method: 'POST',
      body: JSON.stringify({ bookId, position: 77, title: '备份测试书签' })
    });
    assert.equal(created.status, 201);
    const bookmark = await created.json() as { id: string };

    // 导出
    const exportRes = await authed('/api/backup');
    assert.equal(exportRes.status, 200);
    const backup = await exportRes.json() as {
      app: string; formatVersion: number;
      data: { progress: Array<{ bookId: string; position: number }>; bookmarks: Array<{ id: string }> };
    };
    assert.equal(backup.app, 'soundshelf');
    assert.equal(backup.formatVersion, 1);
    assert.ok(backup.data.bookmarks.some((b) => b.id === bookmark.id), '备份应包含书签');
    assert.ok(backup.data.progress.some((p) => p.bookId === bookId && p.position === 123), '备份应包含进度');

    // 删除数据
    assert.equal((await authed(`/api/bookmarks/${bookmark.id}`, { method: 'DELETE' })).status, 200);
    assert.equal((await authed(`/api/progress/${bookId}`, { method: 'DELETE' })).status, 200);
    const empty = await (await authed(`/api/bookmarks?bookId=${bookId}`)).json() as { bookmarks: unknown[] };
    assert.equal(empty.bookmarks.length, 0);

    // 恢复
    const restore = await authed('/api/backup/restore', { method: 'POST', body: JSON.stringify(backup) });
    assert.equal(restore.status, 200);
    const restored = await (await authed(`/api/bookmarks?bookId=${bookId}`)).json() as { bookmarks: Array<{ id: string }> };
    assert.ok(restored.bookmarks.some((b) => b.id === bookmark.id), '恢复后书签应回来');
    const progress = await (await authed('/api/progress')).json() as { progress: Array<{ book_id: string; position: number }> };
    assert.equal(progress.progress.find((p) => p.book_id === bookId)?.position, 123, '恢复后进度应回来');

    // 坏文件：400 且现有数据不变
    const corrupt = await authed('/api/backup/restore', {
      method: 'POST',
      body: JSON.stringify({ app: 'soundshelf', formatVersion: 99, exportedAt: 'x', user: { id: 'x', username: 'x' }, data: { progress: [], bookmarks: [], sessions: [], settings: {} } })
    });
    assert.equal(corrupt.status, 400);
    const stillThere = await (await authed(`/api/bookmarks?bookId=${bookId}`)).json() as { bookmarks: Array<{ id: string }> };
    assert.ok(stillThere.bookmarks.some((b) => b.id === bookmark.id), '坏文件恢复失败后现有数据应保持不变');
  });
});
