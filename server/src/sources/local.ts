import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readdir, stat } from 'node:fs/promises';
import { basename, dirname, extname, join, relative, sep } from 'node:path';
import { promisify } from 'node:util';
import { logger } from '../logger.js';
import type { RawBook, RawChapter, RawTrack, SourceAdapter, SourceRow } from './types.js';

const execFileAsync = promisify(execFile);
const AUDIO_EXTENSIONS = new Set(['.mp3', '.m4b', '.m4a', '.flac', '.ogg', '.opus', '.wav', '.aac']);
const COVER_NAMES = ['cover.jpg', 'cover.jpeg', 'cover.png', 'folder.jpg', 'folder.jpeg', 'folder.png'];

interface ProbeChapter { start: number; end: number; title: string }
interface ProbeResult { duration: number; chapters: ProbeChapter[]; tags: Record<string, string> }

async function probe(filePath: string): Promise<ProbeResult | null> {
  try {
    const { stdout } = await execFileAsync('ffprobe', [
      '-v', 'error', '-print_format', 'json', '-show_format', '-show_chapters', filePath
    ], { timeout: 20000, maxBuffer: 4 * 1024 * 1024 });
    const data = JSON.parse(stdout);
    return {
      duration: Number(data.format?.duration) || 0,
      chapters: (data.chapters ?? []).map((chapter: any) => ({
        start: Number(chapter.start_time) || 0,
        end: Number(chapter.end_time) || 0,
        title: String(chapter.tags?.title ?? '')
      })),
      tags: data.format?.tags ?? {}
    };
  } catch {
    return null;
  }
}

function splitTitle(fileName: string): { author: string; title: string } {
  const clean = fileName.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim();
  const parts = clean.split(/\s+[-–—]\s+/);
  if (parts.length >= 2) return { author: parts[0].trim(), title: parts.slice(1).join(' - ').trim() };
  return { author: '', title: clean };
}

function mimeFor(path: string): string {
  const map: Record<string, string> = {
    '.mp3': 'audio/mpeg', '.m4b': 'audio/mp4', '.m4a': 'audio/mp4',
    '.flac': 'audio/flac', '.ogg': 'audio/ogg', '.opus': 'audio/ogg', '.wav': 'audio/wav', '.aac': 'audio/aac'
  };
  return map[extname(path).toLowerCase()] ?? 'audio/mpeg';
}

export class LocalLibraryAdapter implements SourceAdapter {
  readonly type = 'local' as const;

  constructor(private readonly source: SourceRow) {}

  private get paths(): string[] {
    try {
      const extra = JSON.parse(this.source.extra || '{}');
      return Array.isArray(extra.paths) && extra.paths.length ? extra.paths : [this.source.base_url].filter(Boolean);
    } catch {
      return [this.source.base_url].filter(Boolean);
    }
  }

  async listBooks(): Promise<RawBook[]> {
    const files: string[] = [];
    for (const root of this.paths) await this.walk(root, root, files);
    const byDirectory = new Map<string, string[]>();
    for (const file of files) {
      const dir = dirname(file);
      if (!byDirectory.has(dir)) byDirectory.set(dir, []);
      byDirectory.get(dir)!.push(file);
    }

    const books: RawBook[] = [];
    for (const [dir, dirFiles] of byDirectory) {
      const sorted = dirFiles.sort((a, b) => a.localeCompare(b, 'zh-CN', { numeric: true }));
      const probeResults = await Promise.all(sorted.map(probe));
      const { author, title } = splitTitle(basename(dir));
      const fallback = splitTitle(basename(sorted[0]));
      const coverName = COVER_NAMES.find((name) => existsSync(join(dir, name)));
      const tags = await this.collectTags(dir);

      const tracks: RawTrack[] = sorted.map((file, index) => {
        const info = probeResults[index];
        const infoTags = info?.tags ?? {};
        return {
          externalId: relative(dir, file),
          title: infoTags.title || basename(file, extname(file)),
          filePath: file,
          remoteUrl: '',
          mimeType: mimeFor(file),
          duration: info?.duration ?? 0,
          size: 0
        };
      });

      const chapters: RawChapter[] = [];
      sorted.forEach((file, trackIndex) => {
        const info = probeResults[trackIndex];
        const offset = chapters.reduce((sum, chapter) => sum + chapter.duration, 0);
        if (info?.chapters?.length) {
          for (const [index, chapter] of info.chapters.entries()) {
            const start = (offset + chapter.start);
            chapters.push({
              externalId: `${relative(dir, file)}#${index}`,
              title: chapter.title || `第 ${chapters.length + 1} 章`,
              start,
              duration: Math.max(0, chapter.end - chapter.start),
              trackIndex
            });
          }
        } else {
          chapters.push({
            externalId: `${relative(dir, file)}#auto`,
            title: tracks[trackIndex].title,
            start: offset,
            duration: tracks[trackIndex].duration,
            trackIndex
          });
        }
      });

      const totalDuration = chapters.reduce((sum, chapter) => sum + chapter.duration, 0) ||
        tracks.reduce((sum, track) => sum + track.duration, 0);

      books.push({
        externalId: createHash('sha1').update(dir).digest('hex').slice(0, 24),
        title: title || fallback.title || basename(dir),
        author: author || fallback.author,
        narrator: '',
        series: '',
        description: '',
        coverPath: coverName ? join(dir, coverName) : '',
        coverUrl: '',
        duration: totalDuration,
        language: '',
        tags,
        addedAt: Math.floor(Date.now() / 1000),
        chapters,
        tracks,
        progress: null
      });
    }
    return books;
  }

  async resolveTrack(_externalId: string, trackExternalId: string) {
    const base = this.paths[0] ?? '';
    const filePath = join(base, trackExternalId);
    return existsSync(filePath) ? { filePath } : null;
  }

  private async walk(root: string, current: string, output: string[]): Promise<void> {
    try {
      const entries = await readdir(current, { withFileTypes: true });
      for (const entry of entries) {
        const full = join(current, entry.name);
        if (entry.isDirectory()) await this.walk(root, full, output);
        else if (AUDIO_EXTENSIONS.has(extname(entry.name).toLowerCase())) output.push(full);
      }
    } catch (error) {
      logger.warn({ root, current, error: String(error) }, 'skip unreadable library path');
    }
  }

  private async collectTags(dir: string): Promise<string[]> {
    try {
      const entries = await readdir(dir, { withFileTypes: true });
      return entries.filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
        .filter((name) => /^(series|作者|系列)/i.test(name))
        .slice(0, 5);
    } catch {
      return [];
    }
  }
}
