import type { SourceType } from '../types.js';

export interface SourceRow {
  id: string;
  type: SourceType;
  name: string;
  base_url: string;
  token: string;
  extra: string;
  enabled: number;
}

export interface RawChapter {
  externalId: string;
  title: string;
  start: number;
  duration: number;
  trackIndex: number;
}

export interface RawTrack {
  externalId: string;
  title: string;
  filePath: string;
  remoteUrl: string;
  mimeType: string;
  duration: number;
  size: number;
}

export interface RawBook {
  externalId: string;
  title: string;
  author: string;
  narrator: string;
  series: string;
  description: string;
  coverPath: string;
  coverUrl: string;
  duration: number;
  language: string;
  tags: string[];
  addedAt: number;
  chapters: RawChapter[];
  tracks: RawTrack[];
  progress?: { position: number; duration: number; finished: boolean; updatedAt: number } | null;
}

export interface RawCollection {
  externalId: string;
  title: string;
  description: string;
  bookExternalIds: string[];
}

export interface SourceLibrary {
  key: string;
  title: string;
  type: string;
  count?: number;
}

export interface SourceAdapter {
  readonly type: SourceType;
  listBooks(): Promise<RawBook[]>;
  listLibraries?(): Promise<SourceLibrary[]>;
  listCollections?(): Promise<RawCollection[]>;
  syncProgress?(externalId: string, position: number, duration: number, finished: boolean): Promise<void>;
  resolveTrack?(externalId: string, trackExternalId: string): Promise<{ url?: string; filePath?: string; headers?: Record<string, string> } | null>;
}
