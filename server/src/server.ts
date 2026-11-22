import { randomUUID } from 'node:crypto';
import { createApp } from './app.js';
import { hashPassword } from './auth.js';
import { config } from './config.js';
import { db } from './db.js';
import { logger } from './logger.js';
import { seedDemoData } from './seed.js';
import { ensureConfiguredSources, syncAllSources } from './sources/index.js';
import { startWorker } from './worker.js';

function bootstrapAdmin(): void {
  const existing = db.prepare('SELECT COUNT(*) AS count FROM users').get() as { count: number };
  if (existing.count > 0) return;
  db.prepare('INSERT INTO users (id, username, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(randomUUID(), config.ADMIN_USERNAME, hashPassword(config.ADMIN_PASSWORD), 'admin', new Date().toISOString());
  logger.info({ username: config.ADMIN_USERNAME }, 'initial administrator created');
}

bootstrapAdmin();
ensureConfiguredSources();
if (config.demoMode) seedDemoData();

const app = createApp();
const server = app.listen(config.PORT, config.HOST, () => {
  logger.info({ host: config.HOST, port: config.PORT, env: config.NODE_ENV }, 'SoundShelf API started');
});

if (!config.demoMode) void syncAllSources();
startWorker();

function shutdown(signal: string): void {
  logger.info({ signal }, 'shutting down');
  server.close(() => {
    db.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// 最后一道防线：单个请求/定时任务的异常不应让整个服务进程退出。
// 路由层的 asyncRoute 与各处的 try/catch 已覆盖已知路径，这里记录任何漏网之鱼。
process.on('unhandledRejection', (reason) => {
  logger.error({ reason: reason instanceof Error ? reason.stack ?? reason.message : String(reason) }, 'unhandled promise rejection');
});
process.on('uncaughtException', (error) => {
  logger.error({ error: error.stack ?? error.message }, 'uncaught exception');
});
