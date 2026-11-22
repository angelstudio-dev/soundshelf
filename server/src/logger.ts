import pino from 'pino';
import { config } from './config.js';

export const logger = pino({
  level: config.LOG_LEVEL,
  base: { service: 'soundshelf-api' },
  redact: {
    paths: ['password', '*.password', 'token', '*.token', 'authorization', 'req.headers.authorization', 'headers.authorization'],
    censor: '[redacted]'
  }
});

export function requestId(): string {
  return globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2);
}
