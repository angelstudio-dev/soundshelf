export type SourceType = 'audiobookshelf' | 'plex' | 'local' | 'demo';

export interface Chapter {
  id: string;
  title: string;
  start: number;
  duration: number;
  trackIndex: number;
  index: number;
}

export interface Track {
  id: string;
  title: string;
  filePath: string;
  remoteUrl: string;
  mimeType: string;
  duration: number;
  size: number;
  index: number;
}

export interface BookProgress {
  position: number;
  duration: number;
  finished: boolean;
  updatedAt: number;
  startedAt: number | null;
  finishedAt: number | null;
}

export interface Book {
  id: string;
  sourceId: string;
  sourceType: SourceType;
  title: string;
  author: string;
  narrator: string;
  series: string;
  description: string;
  coverUrl: string;
  duration: number;
  language: string;
  tags: string[];
  addedAt: number;
  chapters: Chapter[];
  tracks: Track[];
  progress: BookProgress | null;
}

export interface Collection {
  id: string;
  title: string;
  description: string;
  books: Book[];
  sourceType: SourceType;
}

export interface Bookmark {
  id: string;
  bookId: string;
  chapterId: string;
  position: number;
  title: string;
  note: string;
  createdAt: number;
  updatedAt: number;
}

export interface Author {
  name: string;
  initial: string;
  bookCount: number;
  coverUrl: string;
  totalDuration: number;
}

export interface ListeningEvent {
  id: string;
  bookId: string;
  bookTitle: string;
  coverUrl: string;
  startedAt: number;
  seconds: number;
  kind: 'session' | 'added';
  position: number;
}

export interface SourceLibrary {
  key: string;
  title: string;
  type: string;
  count?: number;
}

export interface PlexOAuthSession {
  pinId: string;
  code: string;
  authUrl: string;
  linkUrl: string;
  expiresAt: number;
  clientIdentifier: string;
}

export interface PlexServer {
  name: string;
  machineIdentifier: string;
  version: string;
  owned: boolean;
  baseUrl: string;
  reachable: boolean;
  candidates: string[];
}

export type PlexOAuthStatus =
  | { status: 'pending' | 'expired'; expiresAt: number }
  | { status: 'complete'; token: string; servers: PlexServer[] };

export interface MediaInfo {
  size: number;
  bitrate: number;
  format: string;
  codec: string;
}

export interface Playlist {
  name: string;
  bookIds: string[];
}

export interface Stats {
  totalSeconds: number;
  weekSeconds: number;
  listeningDays: number;
  streak: number;
  finishedBooks: number;
  daily: { date: string; seconds: number }[];
}

export interface User {
  id: string;
  username: string;
  role: string;
}

export interface Source {
  id: string;
  type: SourceType;
  name: string;
  base_url: string;
  enabled: number;
  last_synced_at: number | null;
  book_count: number;
}

export interface Transcript {
  bookId: string;
  language: string;
  segments: { start: number; end: number; text: string }[];
  status: 'ready' | 'pending' | 'unavailable';
  note?: string;
}
