import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import cors from 'cors';
import express, { type NextFunction, type Request, type Response } from 'express';
import { z, ZodError } from 'zod';
import { config } from './config.js';
import { AppError } from './errors.js';
import { logger, requestId } from './logger.js';
import { api } from './routes.js';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');

  app.use((req, res, next) => {
    req.requestId = requestId();
    res.setHeader('X-Request-Id', req.requestId);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    next();
  });

  app.use(cors({
    origin: config.corsOrigins.includes('*') ? true : config.corsOrigins,
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization']
  }));
  // 恢复备份会一次性提交整个备份 JSON（收听历史可能较大），放宽到 10mb
  app.use(express.json({ limit: '10mb' }));

  app.use((req, res, next) => {
    const startedAt = Date.now();
    res.on('finish', () => {
      logger.info({
        reqId: req.requestId,
        method: req.method,
        path: req.path,
        status: res.statusCode,
        durationMs: Date.now() - startedAt
      }, 'http request');
    });
    next();
  });

  app.use('/api', api);

  const webDist = resolve(process.cwd(), '../web/dist');
  if (existsSync(webDist)) {
    app.use(express.static(webDist, { maxAge: '1h', index: false }));
    app.get('*', (_req: Request, res: Response) => res.sendFile(resolve(webDist, 'index.html')));
  } else {
    app.get('/', (_req, res) => res.json({
      name: 'SoundShelf API',
      health: '/api/health',
      note: 'Web 客户端尚未构建。运行 npm run build 后由服务端托管。'
    }));
  }

  app.use((error: unknown, req: Request, res: Response, _next: NextFunction) => {
    if (error instanceof ZodError) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: '请求参数不正确', details: z.flattenError(error), requestId: req.requestId } });
      return;
    }
    if (error instanceof AppError) {
      res.status(error.status).json({
        error: { code: error.code, message: error.message, details: error.details, requestId: req.requestId }
      });
      return;
    }
    logger.error({ reqId: req.requestId, error: String(error) }, 'unhandled request error');
    res.status(500).json({ error: { code: 'INTERNAL', message: '服务器内部错误', requestId: req.requestId } });
  });

  return app;
}
