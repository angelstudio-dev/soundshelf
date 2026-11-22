import { XMLParser } from 'fast-xml-parser';
import { upstreamError } from '../errors.js';
import type { RawBook, RawChapter, RawCollection, RawTrack, SourceAdapter, SourceRow } from './types.js';

type XmlNode = Record<string, any>;

const asArray = <T>(value: T | T[] | undefined): T[] =>
  value === undefined ? [] : Array.isArray(value) ? value : [value];
const str = (value: unknown) => (value === undefined || value === null ? '' : String(value));
const num = (value: unknown) => (Number.isFinite(Number(value)) ? Number(value) : 0);

export class PlexAdapter implements SourceAdapter {
  readonly type = 'plex' as const;
  private readonly parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });

  constructor(private readonly source: SourceRow) {}

  private get base(): string {
    return this.source.base_url.replace(/\/$/, '');
  }

  private async requestXml(path: string): Promise<XmlNode> {
    let response: Response;
    try {
      response = await fetch(`${this.base}${path}`, {
        headers: { 'X-Plex-Token': this.source.token, Accept: 'application/xml' },
        signal: AbortSignal.timeout(20000)
      });
    } catch (error) {
      throw upstreamError('无法连接 Plex 服务器', String(error));
    }
    if (!response.ok) throw upstreamError(`Plex 返回 ${response.status}`, await response.text());
    return this.parser.parse(await response.text()) as XmlNode;
  }

  async listBooks(): Promise<RawBook[]> {
    const sections = asArray<XmlNode>(this.requestXmlSafe(await this.requestXml('/library/sections')).Directory);
    const musicSections = sections.filter((section) => str(section['@_type']) === 'artist');
    const result: RawBook[] = [];

    for (const section of musicSections) {
      const sectionKey = str(section['@_key']);
      const container = this.requestXmlSafe(await this.requestXml(`/library/sections/${sectionKey}/all`));
      const tracks = asArray<XmlNode>(container.Track);
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
          const part = asArray<XmlNode>(track.Media?.[0]?.Part)[0] ?? {};
          const duration = num(track['@_duration']) / 1000;
          const item = {
            externalId: str(part['@_id']) || `${albumRatingKey}-${index}`,
            title: str(track['@_title']) || `Track ${index + 1}`,
            filePath: '',
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
    return asArray<XmlNode>(container.Playlist).map((playlist) => ({
      externalId: `playlist-${str(playlist['@_ratingKey'])}`,
      title: str(playlist['@_title']),
      description: str(playlist['@_summary']),
      bookExternalIds: asArray<XmlNode>(playlist.Track).map((track) => {
        const section = str(track['@_parentRatingKey']);
        const album = str(track['@_grandparentRatingKey']) || str(track['@_parentRatingKey']);
        return `${section}:${album}`;
      })
    }));
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
