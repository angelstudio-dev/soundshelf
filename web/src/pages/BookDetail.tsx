import { useEffect, useState } from 'react';
import { apiDelete, apiGet, apiPost, mediaUrl } from '../api/client.js';
import {
  BookmarkIcon, CheckIcon, ChevronLeft, DownloadIcon, ListIcon, MoreIcon, PauseIcon, PlayIcon, TrashIcon
} from '../components/Icons.js';
import { usePlayer } from '../store.js';
import type { Book, Bookmark, ListeningEvent, MediaInfo } from '../types.js';
import { formatDate, formatLongDuration, formatSize, formatTime, progressPercent } from '../utils.js';

interface Props {
  book: Book;
  onBack: () => void;
  onPlay: (book: Book) => void;
  onOpenAuthor: (name: string) => void;
}

export function BookDetail({ book, onBack, onPlay, onOpenAuthor }: Props) {
  const [detail, setDetail] = useState<Book>(book);
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [history, setHistory] = useState<ListeningEvent[]>([]);
  const [media, setMedia] = useState<MediaInfo>({ size: 0, bitrate: 0 });
  const [tab, setTab] = useState<'chapters' | 'bookmarks' | 'history'>('chapters');
  const [menuOpen, setMenuOpen] = useState(false);
  const player = usePlayer();

  const reload = () => apiGet<Book>(`/books/${book.id}`).then(setDetail).catch(() => undefined);

  useEffect(() => {
    reload();
    apiGet<{ bookmarks: Bookmark[] }>(`/bookmarks?bookId=${book.id}`)
      .then((data) => setBookmarks(data.bookmarks)).catch(() => undefined);
    apiGet<{ events: ListeningEvent[] }>(`/books/${book.id}/history`)
      .then((data) => setHistory(data.events)).catch(() => undefined);
    apiGet<MediaInfo>(`/books/${book.id}/media`).then(setMedia).catch(() => undefined);
  }, [book.id]);

  const progress = progressPercent(detail);
  const isCurrent = player.book?.id === detail.id;
  const length = formatLongDuration(detail.duration);
  const historyByDay = history.reduce<Record<string, ListeningEvent[]>>((acc, event) => {
    const day = new Date(event.startedAt * 1000).toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' });
    (acc[day] ??= []).push(event);
    return acc;
  }, {});

  return (
    <div className="detail-page">
      <div className="detail-topbar">
        <button className="back-button" onClick={onBack}><ChevronLeft size={20} /> 返回</button>
        <div className="detail-top-actions">
          <a className="icon-button" href={mediaUrl(`/books/${detail.id}/stream?download=1`)} download={`${detail.title}.audio`}>
            <DownloadIcon size={20} />
          </a>
          <div className="menu-anchor">
            <button className="icon-button" onClick={() => setMenuOpen(!menuOpen)}><MoreIcon size={20} /></button>
            {menuOpen && (
              <div className="popup-menu" onMouseLeave={() => setMenuOpen(false)}>
                <button onClick={() => {
                  void apiPost(`/progress/${detail.id}/finish`, { finished: !detail.progress?.finished }).then(reload);
                  setMenuOpen(false);
                }}><CheckIcon size={16} /> {detail.progress?.finished ? '标记为未完成' : '标记为已完成'}</button>
                <button onClick={() => {
                  void apiPost('/playlists', { name: '播放清单', bookId: detail.id });
                  setMenuOpen(false);
                }}><ListIcon size={16} /> 添加到播放清单</button>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="detail-hero">
        <img src={detail.coverUrl} alt={detail.title} />
        <h1>{detail.title}</h1>
        <button className="detail-author-link" onClick={() => onOpenAuthor(detail.author)}>
          来自 {detail.author || '未知作者'} ›
        </button>
        {detail.progress && detail.progress.position > 0 && (
          <div className="detail-progress">
            <span style={{ width: `${progress}%` }} />
            <small>已收听 {progress}% · 上次播放于 {formatDate(detail.progress.updatedAt)}</small>
          </div>
        )}
        <button className="primary-button wide" onClick={() => onPlay(detail)}>
          {isCurrent && player.playing ? <PauseIcon size={18} /> : <PlayIcon size={18} />}
          {detail.progress?.finished ? '重新播放' : detail.progress?.position ? '继续聆听' : '开始聆听'}
        </button>
      </div>

      <div className="detail-info-grid three">
        <div><span>长度</span><strong>{length.hours} 小时</strong><small>{length.minutes} 分钟</small></div>
        <div><span>文件大小</span><strong>{media.size ? formatSize(media.size) : '—'}</strong><small>{media.size ? '' : '字节'}</small></div>
        <div><span>码率</span><strong>{media.bitrate || '—'}</strong><small>kbps</small></div>
      </div>

      <div className="detail-tabs">
        <button className={tab === 'chapters' ? 'active' : ''} onClick={() => setTab('chapters')}>章节</button>
        <button className={tab === 'bookmarks' ? 'active' : ''} onClick={() => setTab('bookmarks')}>书签</button>
        <button className={tab === 'history' ? 'active' : ''} onClick={() => setTab('history')}>历史记录</button>
      </div>

      {tab === 'chapters' && (
        <div className="chapter-list">
          {detail.chapters.map((chapter, index) => (
            <button key={chapter.id} className="chapter-item" onClick={() => void player.open(detail).then(() => player.seek(chapter.start))}>
              <span className="chapter-number">{String(index + 1).padStart(2, '0')}</span>
              <span className="chapter-title">{chapter.title}</span>
              <span className="chapter-duration">{formatTime(chapter.duration)}</span>
            </button>
          ))}
          {!detail.chapters.length && <p className="empty-hint">暂无章节信息</p>}
        </div>
      )}

      {tab === 'bookmarks' && (
        <div className="bookmark-list">
          {bookmarks.map((item) => (
            <div className="bookmark-item" key={item.id}>
              <button onClick={() => void player.open(detail).then(() => player.seek(item.position))}>
                <strong>{item.title || '书签'}</strong>
                <small>{formatTime(item.position)}</small>
                {item.note && <p>{item.note}</p>}
              </button>
              <button className="icon-button" onClick={() => void apiDelete(`/bookmarks/${item.id}`)
                .then(() => setBookmarks(bookmarks.filter((entry) => entry.id !== item.id)))}><TrashIcon size={16} /></button>
            </div>
          ))}
          {!bookmarks.length && <div className="empty-state"><BookmarkIcon size={38} /><p>没有书签</p></div>}
        </div>
      )}

      {tab === 'history' && (
        <div className="history-list">
          {Object.entries(historyByDay).map(([day, events]) => (
            <section key={day} className="history-day">
              <h3>{day}</h3>
              {events.map((event) => (
                <div key={event.id} className="history-row">
                  <span className="history-time">{new Date(event.startedAt * 1000).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}</span>
                  <span className="history-info">
                    <strong>{event.kind === 'added' ? '添加到库中' : `收听 ${Math.round(event.seconds / 60)} 分钟`}</strong>
                    <small>{event.bookTitle}</small>
                  </span>
                </div>
              ))}
            </section>
          ))}
          {!history.length && <p className="empty-hint">还没有收听记录</p>}
        </div>
      )}
    </div>
  );
}
