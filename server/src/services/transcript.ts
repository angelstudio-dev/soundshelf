import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { config } from '../config.js';
import { db } from '../db.js';
import { badRequest, notFound } from '../errors.js';
import { logger } from '../logger.js';
import { getBook } from './library.js';

const transcriptDir = resolve(dirname(config.DATABASE_PATH), 'transcripts');

export interface TranscriptSegment { start: number; end: number; text: string }
export interface Transcript { bookId: string; language: string; segments: TranscriptSegment[]; status: 'ready' | 'pending' | 'unavailable'; note?: string }

export function getTranscript(bookId: string): Transcript {
  getBook(bookId);
  const file = join(transcriptDir, `${bookId.replace(/[^a-zA-Z0-9-]/g, '')}.json`);
  if (existsSync(file)) {
    try {
      return { ...JSON.parse(readFileSync(file, 'utf8')) as Transcript, bookId, status: 'ready' };
    } catch (error) {
      logger.warn({ bookId, error: String(error) }, 'invalid transcript file');
    }
  }
  const job = db.prepare(`SELECT status, last_error FROM jobs WHERE type = 'transcript' AND payload LIKE ? ORDER BY created_at DESC LIMIT 1`)
    .get(`%"bookId":"${bookId}"%`) as { status: string; last_error: string } | undefined;
  if (job?.status === 'pending' || job?.status === 'processing') return { bookId, language: '', segments: [], status: 'pending' };
  return { bookId, language: '', segments: [], status: 'unavailable', note: job?.last_error || '尚未生成转录' };
}

export function requestTranscript(bookId: string): { jobId: string; status: string } {
  getBook(bookId);
  if (config.TRANSCRIPT_PROVIDER === 'none' || !config.TRANSCRIPT_COMMAND) {
    throw badRequest('未配置转录服务。请在环境变量中设置 TRANSCRIPT_PROVIDER 与 TRANSCRIPT_COMMAND（例如本地 whisper.cpp）。');
  }
  const pending = db.prepare(`SELECT id FROM jobs WHERE type = 'transcript' AND status IN ('pending','processing') AND payload LIKE ?`)
    .get(`%"bookId":"${bookId}"%`) as { id: string } | undefined;
  if (pending) return { jobId: pending.id, status: 'pending' };
  const id = randomUUID();
  db.prepare(`INSERT INTO jobs (id, type, payload, status, next_run_at, created_at) VALUES (?, 'transcript', ?, 'pending', ?, ?)`)
    .run(id, JSON.stringify({ bookId }), Date.now(), Date.now());
  return { jobId: id, status: 'pending' };
}

export function saveTranscript(bookId: string, language: string, segments: TranscriptSegment[]): void {
  mkdirSync(transcriptDir, { recursive: true });
  writeFileSync(join(transcriptDir, `${bookId.replace(/[^a-zA-Z0-9-]/g, '')}.json`),
    JSON.stringify({ bookId, language, segments }, null, 2));
}
