import { useEffect, useState } from 'react';
import { apiGet, apiPatch } from '../api/client.js';
import { BookCard } from '../components/BookCard.js';
import {
  ChevronRight, ClockIcon, DownloadIcon, FlameIcon, HeadphonesIcon, PlayIcon, SortIcon
} from '../components/Icons.js';
import { PageHeader, type Page } from '../components/Layout.js';
import { usePlayer } from '../store.js';
import type { Book, Stats } from '../types.js';
import { formatShortDuration } from '../utils.js';

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

export function Home({ onNavigate, onOpenBook, onPlay }: {
  onNavigate: (page: Page) => void;
  onOpenBook: (book: Book) => void;
  onPlay: (book: Book) => void;
}) {
  const [data, setData] = useState<HomeData | null>(null);
  const [configOpen, setConfigOpen] = useState(false);
  const [modules, setModules] = useState<Record<ModuleKey, boolean>>(DEFAULT_MODULES);
  const [statItems, setStatItems] = useState<Record<StatKey, boolean>>(DEFAULT_STATS);
  const player = usePlayer();

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

  return (
    <>
      <div className="top-pills">
        <button className="library-pill"><span className="green-dot" /> 有声小说</button>
        <div className="top-pill-actions">
          <button className="icon-button" onClick={() => onNavigate('books')}><DownloadIcon size={19} /></button>
          <button className="icon-button" onClick={() => setConfigOpen(true)}><SortIcon size={19} /></button>
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
            <div className="stat-card"><FlameIcon size={18} /><span>正在监听串口</span>
              <strong>{data?.stats.streak ?? 0} 天</strong></div>
          )}
          {statItems.finishedBooks && (
            <div className="stat-card"><HeadphonesIcon size={18} /><span>已听完书籍</span>
              <strong>{data?.stats.finishedBooks ?? 0} 本</strong></div>
          )}
        </section>
      )}

      {modules.continue && <Section title="继续听" onMore={() => onNavigate('books')}>
        {data?.continueListening.length ? (
          <div className="row-list">
            {data.continueListening.map((book) => (
              <BookCard key={book.id} book={book} variant="row" onClick={() => onOpenBook(book)} />
            ))}
          </div>
        ) : <p className="empty-hint bordered">当前正在听的书籍，将会出现在这里。</p>}
      </Section>}

      {modules.recent && <Section title="最近添加" onMore={() => onNavigate('books')}>
        <div className="horizontal-scroll">
          {data?.recentlyAdded.map((book) => (
            <div key={book.id} className="recent-item">
              <BookCard book={book} variant="compact" onClick={() => onOpenBook(book)} />
              <small>{new Date(book.addedAt * 1000).toLocaleDateString('zh-CN', { month: 'long' })}</small>
            </div>
          ))}
        </div>
      </Section>}

      {modules.finished && <Section title="已完成" onMore={() => onNavigate('books')}>
        <div className="horizontal-scroll">
          {data?.finished.map((book) => <BookCard key={book.id} book={book} variant="compact" onClick={() => onOpenBook(book)} />)}
          {!data?.finished.length && <p className="empty-hint">尚未听完任何书籍</p>}
        </div>
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
