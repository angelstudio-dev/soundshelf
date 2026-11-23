import { useEffect, useState } from 'react';
import { apiGet, apiPatch } from '../api/client.js';
import GlassyCarousel, { type GlassyCarouselItem } from '../components/GlassyCarousel.js';
import AccordionCarousel, { type AccordionItem } from '../components/AccordionCarousel.js';
import type { ListKind } from './ListPage.js';
import {
  ChevronRight, ClockIcon, DownloadIcon, FlameIcon, HeadphonesIcon, LockIcon, PlayIcon, SortIcon, UploadCloudIcon
} from '../components/Icons.js';
import { PageHeader, type Page } from '../components/Layout.js';
import type { Book, Stats } from '../types.js';
import { formatShortDuration, progressPercent } from '../utils.js';

interface HomeData {
  continueListening: Book[];
  recentlyAdded: Book[];
  finished: Book[];
  stats: Stats;
}

type ModuleKey = 'stats' | 'continue' | 'playlists' | 'recent' | 'series' | 'downloaded' | 'finished';
type StatKey = 'listening' | 'nowPlaying' | 'finishedBooks';

const DEFAULT_MODULES: Record<ModuleKey, boolean> = {
  stats: true, continue: true, playlists: true, recent: true, series: true, downloaded: true, finished: true
};
const DEFAULT_STATS: Record<StatKey, boolean> = { listening: true, nowPlaying: true, finishedBooks: true };
const MODULE_LABELS: Record<ModuleKey, string> = {
  stats: '统计', continue: '继续听', playlists: '播放列表', recent: '最近添加',
  series: '继续系列', downloaded: '已下载', finished: '已完成'
};
const STAT_LABELS: Record<StatKey, string> = {
  listening: '收听时间', nowPlaying: '正在监听串口', finishedBooks: '已听完书籍'
};

export function Home({ onNavigate, onOpenBook, onPlay, onOpenList }: {
  onNavigate: (page: Page) => void;
  onOpenBook: (book: Book) => void;
  onPlay: (book: Book) => void;
  onOpenList: (kind: ListKind, books: Book[]) => void;
}) {
  const [data, setData] = useState<HomeData | null>(null);
  const [configOpen, setConfigOpen] = useState(false);
  const [modules, setModules] = useState<Record<ModuleKey, boolean>>(DEFAULT_MODULES);
  const [statItems, setStatItems] = useState<Record<StatKey, boolean>>(DEFAULT_STATS);

  useEffect(() => {
    apiGet<HomeData>('/home').then(setData).catch(() => setData(null));
    apiGet<{ homeModules?: Record<ModuleKey, boolean>; homeStats?: Record<StatKey, boolean> }>('/settings')
      .then((settings) => {
        if (settings.homeModules) setModules({ ...DEFAULT_MODULES, ...settings.homeModules });
        if (settings.homeStats) setStatItems({ ...DEFAULT_STATS, ...settings.homeStats });
      }).catch(() => undefined);
  }, []);

  const persistModules = (next: Record<ModuleKey, boolean>) => {
    setModules(next);
    void apiPatchSettings('homeModules', next);
  };
  const persistStats = (next: Record<StatKey, boolean>) => {
    setStatItems(next);
    void apiPatchSettings('homeStats', next);
  };

  const toItems = (books: Book[], subtitle: (book: Book) => string): GlassyCarouselItem[] =>
    books.map((book) => ({
      id: book.id,
      title: book.title,
      subtitle: subtitle(book),
      image: book.coverUrl,
      description: book.description
    }));
  const openFromCarousel = (books: Book[]) => (item: GlassyCarouselItem) => {
    const book = books.find((candidate) => candidate.id === item.id);
    if (book) onOpenBook(book);
  };
  const continueSubtitle = (book: Book) => {
    const progress = progressPercent(book);
    if (book.progress?.finished) return `${book.author || '未知作者'} · 已听完`;
    return book.progress
      ? `${book.author || '未知作者'} · 已听 ${progress}% · 剩余 ${formatShortDuration(book.duration * (1 - progress / 100))}`
      : book.author || '未知作者';
  };
  const addedSubtitle = (book: Book) =>
    `${book.author || '未知作者'} · ${new Date(book.addedAt * 1000).toLocaleDateString('zh-CN', { month: 'long' })}`;

  return (
    <>
      <div className="top-pills">
        <button className="library-pill"><span className="green-dot" /> 有声小说</button>
        <div className="top-pill-actions">
          <button className="icon-button" title="导入" onClick={() => onNavigate('servers')}><UploadCloudIcon size={19} /></button>
          <button className="icon-button" title="下载" onClick={() => onNavigate('books')}><DownloadIcon size={19} /></button>
          <button className="icon-button" title="主页设置" onClick={() => setConfigOpen(true)}><SortIcon size={19} /></button>
        </div>
      </div>

      <PageHeader title="主页" />
      <div className="search-inline large" onClick={() => onNavigate('books')}>
        <span className="fake-search"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg> 搜索书名、作者或章节</span>
      </div>

      {modules.stats && (
        <section className="stats-grid">
          {statItems.listening && (
            <div className="stat-card"><ClockIcon size={18} /><span>收听时间</span>
              <strong>{formatShortDuration(data?.stats.totalSeconds ?? 0)}</strong></div>
          )}
          {statItems.nowPlaying && (
            <div className="stat-card"><FlameIcon size={18} /><span className="pro-label">正在监听串口<LockIcon size={12} className="pro-lock" /></span>
              <strong>{data?.stats.streak ?? 0} 天</strong></div>
          )}
          {statItems.finishedBooks && (
            <div className="stat-card accent"><HeadphonesIcon size={18} /><span className="pro-label">已听完书籍<LockIcon size={12} className="pro-lock" /></span>
              <strong>{data?.stats.finishedBooks ?? 0} 本</strong></div>
          )}
        </section>
      )}

      {modules.continue && <Section title="继续听" onMore={() => onOpenList('continue', data?.continueListening ?? [])}>
        {data?.continueListening.length ? (
          <AccordionCarousel
            items={toItems(data.continueListening, continueSubtitle) as AccordionItem[]}
            label="继续听" autoPlay
            onOpenItem={(item) => openFromCarousel(data.continueListening)(item as GlassyCarouselItem)}
          />
        ) : <p className="empty-hint bordered">当前正在听的书籍，将会出现在这里。</p>}
      </Section>}

      {modules.recent && <Section title="最近添加" onMore={() => onOpenList('recent', data?.recentlyAdded ?? [])}>
        {data?.recentlyAdded.length ? (
          <GlassyCarousel
            items={toItems(data.recentlyAdded, addedSubtitle)}
            layout="square" compact label="最近添加封面"
            onOpenItem={openFromCarousel(data.recentlyAdded)}
          />
        ) : <p className="empty-hint bordered">暂无最近添加的书籍</p>}
      </Section>}

      {modules.finished && <Section title="已完成" onMore={() => onOpenList('finished', data?.finished ?? [])}>
        {data?.finished.length ? (
          <GlassyCarousel
            items={toItems(data.finished, (book) => book.author || '未知作者')}
            layout="square" compact label="已完成封面"
            onOpenItem={openFromCarousel(data.finished)}
          />
        ) : <p className="empty-hint">尚未听完任何书籍</p>}
      </Section>}

      {data?.continueListening[0] && (
        <button className="primary-button wide" onClick={() => onPlay(data.continueListening[0])}>
          <PlayIcon size={17} /> 继续听《{data.continueListening[0].title}》
        </button>
      )}

      {configOpen && (
        <div className="sheet-backdrop" onClick={() => setConfigOpen(false)}>
          <div className="sheet" onClick={(event) => event.stopPropagation()}>
            <div className="sheet-header"><h2>主页</h2><button className="icon-button" onClick={() => setConfigOpen(false)}>✕</button></div>
            <div className="config-group">
              {(Object.keys(MODULE_LABELS) as ModuleKey[]).map((key) => (
                <label className="toggle-row" key={key}><span>{MODULE_LABELS[key]}</span>
                  <input type="checkbox" checked={modules[key]} onChange={(e) => persistModules({ ...modules, [key]: e.target.checked })} />
                </label>
              ))}
            </div>
            <h3 className="config-title">统计</h3>
            <div className="config-group">
              {(Object.keys(STAT_LABELS) as StatKey[]).map((key) => (
                <label className="toggle-row" key={key}><span>{STAT_LABELS[key]}</span>
                  <input type="checkbox" checked={statItems[key]} onChange={(e) => persistStats({ ...statItems, [key]: e.target.checked })} />
                </label>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function Section({ title, onMore, children }: { title: string; onMore: () => void; children: React.ReactNode }) {
  return (
    <section className="home-section">
      <div className="section-head"><h2>{title}</h2>
        <button className="section-more" onClick={onMore}>查看全部 <ChevronRight size={15} /></button></div>
      {children}
    </section>
  );
}

function apiPatchSettings(key: string, value: unknown) {
  return apiPatch('/settings', { key, value });
}
