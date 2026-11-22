import dotenv from 'dotenv';
import { resolve } from 'node:path';
import { z } from 'zod';

dotenv.config({ path: resolve(process.cwd(), '../.env') });
dotenv.config({ path: resolve(process.cwd(), '.env') });

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().default('0.0.0.0'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET 至少需要 32 个字符'),
  DATABASE_PATH: z.string().default('./data/soundshelf.sqlite'),
  CORS_ORIGINS: z.string().default('http://localhost:5173'),
  ADMIN_USERNAME: z.string().min(1).default('admin'),
  ADMIN_PASSWORD: z.string().min(8, 'ADMIN_PASSWORD 至少需要 8 个字符'),
  DEMO_MODE: z.enum(['true', 'false']).default('false'),
  ABS_BASE_URL: z.string().default(''),
  ABS_TOKEN: z.string().default(''),
  PLEX_BASE_URL: z.string().default(''),
  PLEX_TOKEN: z.string().default(''),
  PLEX_LIBRARY_TITLE: z.string().default('Audiobooks'),
  LOCAL_LIBRARY_PATHS: z.string().default(''),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  TRANSCRIPT_PROVIDER: z.string().default('none'),
  TRANSCRIPT_COMMAND: z.string().default('')
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const details = parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('\n');
  console.error(`配置校验失败，服务启动中止：\n${details}`);
  process.exit(1);
}

export const config = {
  ...parsed.data,
  isProd: parsed.data.NODE_ENV === 'production',
  demoMode: parsed.data.DEMO_MODE === 'true',
  corsOrigins: parsed.data.CORS_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean),
  localLibraryPaths: parsed.data.LOCAL_LIBRARY_PATHS.split(',')
    .map((s) => s.trim()).filter(Boolean)
};

export type Config = typeof config;
