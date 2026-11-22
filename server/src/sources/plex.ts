import { XMLParser } from 'fast-xml-parser';
import { upstreamError } from '../errors.js';
import type { RawBook, RawChapter, RawCollection, RawTrack, SourceAdapter, SourceLibrary, SourceRow } from './types.js';

type XmlNode = Record<string, any>;

const asArray = <T>(value: T | T[] | undefined): T[] =>
  value === undefined ? [] : Array.isArray(value) ? value : [value];

/**
 * Plex 用 &#NNNN; 数字实体编码中文。关闭 processEntities 后需手动解码文本字段。
 */
const decodeEntities = (input: string): string => input.replace(
  /&#(x[0-9a-f]+|\d+);/gi,
  (_match, code: string) => {
    const point = code[0].toLowerCase() === 'x' ? parseInt(code.slice(1), 16) : parseInt(code, 10);
    return Number.isFinite(point) ? String.fromCodePoint(point) : _match;
  }
);
const str = (value: unknown) =>
  (value === undefined || value === null ? '' : decodeEntities(String(value)));
const num = (value: unknown) => (Number.isFinite(Number(value)) ? Number(value) : 0);

export class PlexAdapter implements SourceAdapter {
  readonly type = 'plex' as const;
  private readonly parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    // 跳过实体展开，避免单批 500 曲目触发默认 1000 实体上限
    processEntities: false
  });

  constructor(private readonly source: SourceRow) {}

  private get base(): string {
    return this.source.base_url.replace(/\/$/, '');
  }

  private async requestXml(path: string, extraHeaders: Record<string, string> = {}): Promise<XmlNode> {
    let response: Response;
    try {
      response = await fetch(`${this.base}${path}`, {
        headers: { 'X-Plex-Token': this.source.token, Accept: 'application/xml', ...extraHeaders },
        signal: AbortSignal.timeout(120000)
      });
    } catch (error) {
      throw upstreamError('无法连接 Plex 服务器', String(error));
    }
    if (!response.ok) throw upstreamError(`Plex 返回 ${response.status}`, await response.text());
    return this.parser.parse(await response.text()) as XmlNode;
  }

  /**
   * 分页拉取曲目。大库（本例单库 9603 曲目）一次性返回会触发反代 504，
   * 按 X-Plex-Container-Start/Size 分批请求，直到拿不满一批为止。
   */
  private async listAllTracks(sectionKey: string): Promise<XmlNode[]> {
    const pageSize = 500;
    const all: XmlNode[] = [];
    for (let start = 0; ; start += pageSize) {
      const container = this.requestXmlSafe(await this.requestXml(
        `/library/sections/${sectionKey}/all?type=10`,
        { 'X-Plex-Container-Start': String(start), 'X-Plex-Container-Size': String(pageSize) }
      ));
      const batch = asArray<XmlNode>(container.Track);
      all.push(...batch);
      if (batch.length < pageSize) break;
      // 极端情况下服务端忽略分页参数，避免死循环
      if (start > 200000) break;
    }
    return all;
  }

  async listLibraries(): Promise<SourceLibrary[]> {
    const container = this.requestXmlSafe(await this.requestXml('/library/sections'));
    return asArray<XmlNode>(container.Directory).map((section) => ({
      key: str(section['@_key']),
      title: str(section['@_title']),
      type: str(section['@_type']),
      count: num(section['@_count'])
    }));
  }

  async listBooks(): Promise<RawBook[]> {
    const sections = asArray<XmlNode>(this.requestXmlSafe(await this.requestXml('/library/sections')).Directory);
    let libraryIds: string[] = [];
    try { libraryIds = JSON.parse(this.source.extra || '{}').libraryIds ?? []; } catch { /* ignore */ }
    const musicSections = sections.filter((section) =>
      str(section['@_type']) === 'artist' && (!libraryIds.length || libraryIds.includes(str(section['@_key']))));
    const result: RawBook[] = [];

    for (const section of musicSections) {
      const sectionKey = str(section['@_key']);
      // 关键：Plex 音乐库的 /all 默认返回 artist 目录，必须显式 type=10 才返回全部 Track；
      // 且大库需分页拉取，否则反代会 504
      const tracks = await this.listAllTracks(sectionKey);
      const grouped = new Map<string, XmlNode[]>();

      for (const track of tracks) {
        const key = `${sectionKey}:${str(track['@_parentRatingKey'])}`;
        if (!grouped.has(key)) grouped.set(key, []);
        grouped.get(key)!.push(track);
      }

      for (const [key, group] of grouped) {
        const first = group[0];
        const albumRatingKey = str(first['@_parentRatingKey']);
        const sorted = [...group].sort((a, b) => num(a['@_index']) - num(b['@_index']));
        let cursor = 0;

        const tracksRaw: RawTrack[] = sorted.map((track, index) => {
          // Media/Part 在只有一条时会被解析成对象而非数组，必须用 asArray 包一层
          const media = asArray<XmlNode>(track.Media)[0] ?? {};
          const part = asArray<XmlNode>(media.Part)[0] ?? {};
          const duration = num(track['@_duration']) / 1000;
          const item = {
          externalId: str(part['@_id']) || `${albumRatingKey}-${index}`,
          title: str(track['@_title']) || `Track ${index + 1}`,
          filePath: '',
          // 必须用短格式 /library/parts/{id}/file；带时间戳的完整 key 在部分反代下会 404
          remoteUrl: `${this.base}/library/parts/${str(part['@_id'])}/file?X-Plex-Token=${encodeURIComponent(this.source.token)}`,
            mimeType: str(part['@_container']) === 'mp4' ? 'audio/mp4' : 'audio/mpeg',
            duration,
            size: num(part['@_size'])
          };
          return item;
        });

        const chapters: RawChapter[] = tracksRaw.map((track, index) => {
          const chapter = {
            externalId: `chapter-${track.externalId}`,
            title: track.title,
            start: cursor,
            duration: track.duration,
            trackIndex: index
          };
          cursor += track.duration;
          return chapter;
        });

        result.push({
          externalId: key,
          title: str(first['@_parentTitle']) || '未命名书籍',
          author: str(first['@_grandparentTitle']),
          narrator: '',
          series: '',
          description: str(first['@_summary']),
          coverPath: '',
          coverUrl: `${this.base}/library/metadata/${albumRatingKey}/thumb?X-Plex-Token=${encodeURIComponent(this.source.token)}`,
          duration: tracksRaw.reduce((sum, track) => sum + track.duration, 0),
          language: str(first['@_language']),
          tags: [],
          addedAt: num(first['@_addedAt']),
          chapters,
          tracks: tracksRaw,
          progress: null
        });
      }
    }
    return result;
  }

  async listCollections(): Promise<RawCollection[]> {
    const container = this.requestXmlSafe(await this.requestXml('/playlists'));
    const playlists = asArray<XmlNode>(container.Playlist).filter(
      (playlist) => str(playlist['@_playlistType']) === 'audio'
    );
    const result: RawCollection[] = [];

    for (const playlist of playlists) {
      const ratingKey = str(playlist['@_ratingKey']);
      if (!ratingKey) continue;
      // 曲目不在 /playlists 列表里，需要逐个取 items。
      // 个别超大智能列表（如 All Music）会超时，跳过它而不是让整个合集同步失败。
      let items: XmlNode;
      try {
        items = this.requestXmlSafe(await this.requestXml(`/playlists/${ratingKey}/items`));
      } catch {
        continue;
      }
      const tracks = asArray<XmlNode>(items.Track);
      if (!tracks.length) continue;
      // 书的 externalId 格式为 `${sectionKey}:${albumRatingKey}`，与 listBooks 保持一致
      const bookIds = new Set<string>();
      for (const track of tracks) {
        const section = str(track['@_librarySectionID']);
        const album = str(track['@_parentRatingKey']);
        if (section && album) bookIds.add(`${section}:${album}`);
      }
      result.push({
        externalId: `playlist-${ratingKey}`,
        title: str(playlist['@_title']),
        description: str(playlist['@_summary']),
        bookExternalIds: [...bookIds]
      });
    }
    return result;
  }

  async resolveTrack(_externalId: string, trackExternalId: string) {
    return {
      url: `${this.base}/library/parts/${trackExternalId}/file?X-Plex-Token=${encodeURIComponent(this.source.token)}`,
      headers: {}
    };
  }

  private requestXmlSafe(container: XmlNode): XmlNode {
    return container?.MediaContainer ?? {};
  }
}
