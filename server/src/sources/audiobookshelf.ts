import { createHash } from 'node:crypto';
import { upstreamError } from '../errors.js';
import type { RawBook, RawChapter, RawCollection, RawTrack, SourceAdapter, SourceLibrary, SourceRow } from './types.js';

type Json = Record<string, any>;

const hashId = (value: string) => createHash('sha1').update(value).digest('hex').slice(0, 20);
const num = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : 0);
const str = (value: unknown) => (typeof value === 'string' ? value : '');

export class AudiobookshelfAdapter implements SourceAdapter {
  readonly type = 'audiobookshelf' as const;

  constructor(private readonly source: SourceRow) {}

  private get base(): string {
    return this.source.base_url.replace(/\/$/, '');
  }

  private async request<T extends Json>(path: string): Promise<T> {
    let response: Response;
    try {
      response = await fetch(`${this.base}${path}`, {
        headers: { Authorization: `Bearer ${this.source.token}`, Accept: 'application/json' },
        signal: AbortSignal.timeout(20000)
      });
    } catch (error) {
      throw upstreamError('无法连接 Audiobookshelf 服务器', String(error));
    }
    if (!response.ok) throw upstreamError(`Audiobookshelf 返回 ${response.status}`, await response.text());
    return response.json() as Promise<T>;
  }

  async listLibraries(): Promise<SourceLibrary[]> {
    const data = await this.request<{ libraries: Json[] }>('/api/libraries');
    return (data.libraries ?? []).map((library) => ({
      key: String(library.id),
      title: str(library.name) || '未命名资料库',
      type: str(library.mediaType) || 'book'
    }));
  }

  private selectedLibraryIds(): string[] {
    try { return JSON.parse(this.source.extra || '{}').libraryIds ?? []; } catch { return []; }
  }

  async listBooks(): Promise<RawBook[]> {
    const libraries = await this.request<{ libraries: Json[] }>('/api/libraries');
    const results: RawBook[] = [];
    const libraryIds = this.selectedLibraryIds();

    for (const library of libraries.libraries ?? []) {
      if (library.mediaType && library.mediaType !== 'book') continue;
      if (libraryIds.length && !libraryIds.includes(String(library.id))) continue;
      let page = 1;
      while (page <= 200) {
        const data = await this.request<{ results: Json[]; total: number }>(
          `/api/libraries/${library.id}/items?limit=100&page=${page}&include=progress`
        );
        for (const item of data.results ?? []) results.push(this.mapItem(item));
        if (!data.results?.length || results.length >= num(data.total)) break;
        page += 1;
      }
    }
    return results;
  }

  async listCollections(): Promise<RawCollection[]> {
    const libraries = await this.request<{ libraries: Json[] }>('/api/libraries');
    const collections: RawCollection[] = [];
    for (const library of libraries.libraries ?? []) {
      const data = await this.request<{ collections: Json[] }>(`/api/libraries/${library.id}/collections`);
      for (const item of data.collections ?? []) {
        collections.push({
          externalId: String(item.id),
          title: str(item.name),
          description: str(item.description),
          bookExternalIds: (item.books ?? []).map((book: Json) => String(book.id ?? book.libraryItemId ?? ''))
        });
      }
    }
    return collections;
  }

  async syncProgress(externalId: string, position: number, duration: number, finished: boolean): Promise<void> {
    await fetch(`${this.base}/api/me/progress/${encodeURIComponent(externalId)}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.source.token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ currentTime: Math.floor(position), duration: Math.floor(duration), isFinished: finished }),
      signal: AbortSignal.timeout(10000)
    }).catch(() => undefined);
  }

  async resolveTrack(externalId: string, trackExternalId: string): Promise<{ url: string; headers: Record<string, string> } | null> {
    const item = await this.request<Json>(`/api/items/${encodeURIComponent(externalId)}`);
    const file = (item.media?.audioFiles ?? []).find((f: Json) => String(f.ino) === trackExternalId);
    if (!file) return null;
    const filename = str(file.metadata?.filename) || str(file.filename);
    const path = str(file.contentUrl) || `/s/item/${encodeURIComponent(externalId)}/${encodeURIComponent(filename)}`;
    return { url: `${this.base}${path}`, headers: {} };
  }

  private mapItem(item: Json): RawBook {
    const metadata = item.media?.metadata ?? {};
    const audioFiles: Json[] = item.media?.audioFiles ?? [];
    const tracks: RawTrack[] = audioFiles.map((file, index) => {
      const filename = str(file.metadata?.filename) || str(file.filename) || `track-${index + 1}`;
      return {
        externalId: String(file.ino ?? index),
        title: str(file.metadata?.title) || filename,
        filePath: '',
        remoteUrl: str(file.contentUrl) || `/s/item/${encodeURIComponent(String(item.id))}/${encodeURIComponent(filename)}`,
        mimeType: str(file.mimeType) || 'audio/mpeg',
        duration: num(file.duration),
        size: num(file.metadata?.size)
      };
    });

    let chapters: RawChapter[] = (item.media?.chapters ?? []).map((chapter: Json, index: number) => ({
      externalId: String(chapter.id ?? index),
      title: str(chapter.title) || `第 ${index + 1} 章`,
      start: num(chapter.start),
      duration: num(chapter.duration),
      trackIndex: Math.max(0, num(chapter.trackIndex ?? index))
    }));

    if (!chapters.length) {
      let cursor = 0;
      chapters = tracks.map((track, index) => {
        const chapter = {
          externalId: `auto-${track.externalId}`,
          title: track.title.replace(/\.[^.]+$/, ''),
          start: cursor,
          duration: track.duration,
          trackIndex: index
        };
        cursor += track.duration;
        return chapter;
      });
    }

    const userProgress = item.userProgress ?? {};
    const tags = Array.isArray(metadata.tags) ? metadata.tags.map((t: Json | string) => str(typeof t === 'string' ? t : t.name)) : [];

    return {
      externalId: String(item.id),
      title: str(metadata.title) || '未命名书籍',
      author: str(metadata.authorName) || (Array.isArray(metadata.authors) ? metadata.authors.map((a: Json) => str(a.name)).join('、') : ''),
      narrator: Array.isArray(metadata.narratorNames) ? metadata.narratorNames.join('、') : str(metadata.narratorName),
      series: str(metadata.seriesName),
      description: str(metadata.description),
      coverPath: '',
      coverUrl: `${this.base}/api/items/${encodeURIComponent(String(item.id))}/cover?width=600`,
      duration: num(item.media?.duration) || tracks.reduce((sum, track) => sum + track.duration, 0),
      language: str(metadata.language),
      tags,
      addedAt: Math.floor(num(item.addedAt) / 1000),
      chapters,
      tracks,
      progress: userProgress && userProgress.currentTime !== undefined
        ? {
            position: num(userProgress.currentTime),
            duration: num(userProgress.duration),
            finished: Boolean(userProgress.isFinished),
            updatedAt: Math.floor(num(userProgress.lastUpdate) / 1000)
          }
        : null
    };
  }
}
