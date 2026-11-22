import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { config } from './config.js';
import { db } from './db.js';
import { logger } from './logger.js';
import { syncSource } from './sources/index.js';
import { saveTranscript, type TranscriptSegment } from './services/transcript.js';

const execFileAsync = promisify(execFile);
let running = false;

interface JobRow {
  id: string; type: string; payload: string; attempts: number; max_attempts: number;
}

async function handleJob(job: JobRow): Promise<void> {
  const payload = JSON.parse(job.payload || '{}') as Record<string, any>;

  if (job.type === 'sync') {
    await syncSource(String(payload.sourceId));
    return;
  }

  if (job.type === 'transcript') {
    if (config.TRANSCRIPT_PROVIDER === 'none' || !config.TRANSCRIPT_COMMAND) {
      throw new Error('未配置转录命令');
    }
    const bookId = String(payload.bookId);
    const track = db.prepare('SELECT file_path FROM tracks WHERE book_id = ? ORDER BY position LIMIT 1').get(bookId) as
      | { file_path: string } | undefined;
    if (!track?.file_path) throw new Error('这本书没有可转录的本地音频');
    const command = config.TRANSCRIPT_COMMAND.replaceAll('{file}', JSON.stringify(track.file_path));
    const { stdout } = await execFileAsync('/bin/sh', ['-c', command], {
      timeout: 30 * 60 * 1000, maxBuffer: 32 * 1024 * 1024
    });
    const parsed = JSON.parse(stdout) as { segments?: TranscriptSegment[]; text?: string };
    const segments = parsed.segments ?? (parsed.text ? [{ start: 0, end: 0, text: parsed.text }] : []);
    saveTranscript(bookId, String(payload.language ?? 'auto'), segments);
    return;
  }

  throw new Error(`未知任务类型: ${job.type}`);
}

export async function processJobs(): Promise<void> {
  if (running) return;
  running = true;
  try {
    const jobs = db.prepare(`SELECT * FROM jobs
      WHERE status IN ('pending','failed') AND next_run_at <= ? AND attempts < max_attempts
      ORDER BY created_at LIMIT 5`).all(Date.now()) as JobRow[];
    for (const job of jobs) {
      db.prepare("UPDATE jobs SET status = 'processing' WHERE id = ?").run(job.id);
      try {
        await handleJob(job);
        db.prepare("UPDATE jobs SET status = 'done', last_error = '' WHERE id = ?").run(job.id);
      } catch (error) {
        const attempts = job.attempts + 1;
        const dead = attempts >= job.max_attempts;
        db.prepare(`UPDATE jobs SET status = ?, attempts = ?, next_run_at = ?, last_error = ? WHERE id = ?`)
          .run(dead ? 'dead' : 'failed', attempts, Date.now() + attempts * attempts * 60000, String(error), job.id);
        logger.warn({ jobId: job.id, type: job.type, attempts, error: String(error) }, 'job failed');
      }
    }
  } finally {
    running = false;
  }
}

export function startWorker(): void {
  const timer = setInterval(() => void processJobs(), 60_000);
  timer.unref();
  void processJobs();
}
