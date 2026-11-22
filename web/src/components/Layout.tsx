import type { ReactNode } from 'react';
import { usePlayer } from '../store.js';
import { formatTime } from '../utils.js';
import {
  AuthorIcon, BooksIcon, CollectionIcon, HeadphonesIcon, HomeIcon, PauseIcon, PlayIcon, SettingsIcon
} from './Icons.js';

export type Page = 'home' | 'books' | 'authors' | 'collections' | 'settings' | 'stats' | 'book' | 'author' | 'servers' | 'playlist';

interface Props {
  page: Page;
  onNavigate: (page: Page) => void;
  onOpenPlayer: () => void;
  children: ReactNode;
}

const tabs: { key: Page; label: string; icon: typeof HomeIcon }[] = [
  { key: 'home', label: '主页', icon: HomeIcon },
  { key: 'books', label: '书架', icon: BooksIcon },
  { key: 'authors', label: '作者', icon: AuthorIcon },
  { key: 'collections', label: '收藏集', icon: CollectionIcon },
  { key: 'settings', label: '设置', icon: SettingsIcon }
];

export function Layout({ page, onNavigate, onOpenPlayer, children }: Props) {
  const player = usePlayer();
  const activeTab = tabs.some((tab) => tab.key === page) ? page : 'home';

  return (
    <div className="app-shell">
      <main className="app-main">{children}</main>

      {player.book && (
        <button className="mini-player" onClick={onOpenPlayer}>
          <img src={player.book.coverUrl} alt="" />
          <span className="mini-player-text">
            <strong>{player.book.title}</strong>
            <small>{formatTime(player.position)} / {formatTime(player.duration)}</small>
          </span>
          <span className="mini-player-progress" style={{ width: `${player.duration ? (player.position / player.duration) * 100 : 0}%` }} />
          <span className="mini-player-actions" onClick={(event) => { event.stopPropagation(); player.toggle(); }}>
            {player.playing ? <PauseIcon size={22} /> : <PlayIcon size={22} />}
          </span>
        </button>
      )}

      <nav className="tab-bar">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <button key={tab.key} className={`tab-item ${activeTab === tab.key ? 'active' : ''}`}
              onClick={() => onNavigate(tab.key)}>
              <Icon size={21} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <header className="page-header">
      <div>
        <div className="brand-line"><HeadphonesIcon size={15} /> <span>SOUNDSHELF</span></div>
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {action}
    </header>
  );
}
