import { useEffect, useState } from 'react';
import { apiDelete, apiGet, apiPost, mediaUrl } from '../api/client.js';
import {
  BookmarkIcon, CheckIcon, ChevronLeft, DownloadIcon, ListIcon, PauseIcon, PlayIcon, TrashIcon
} from '../components/Icons.js';
import { usePlayer } from '../store.js';
import type { Book, Bookmark } from '../types.js';
import { formatDate, formatDuration, formatTime, progressPercent } from '../utils.js';

interface Props {
  book: Book;
  onBack: () => void;
  onPlay: (book: Book) => void;
}

export function BookDetail({ book, onBack, onPlay }: Props) {
  const [detail, setDetail] = useState<Book>(book);
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [tab, setTab] = useState<'chapters' | 'bookmarks' | 'notes'>('chapters');
  const player = usePlayer();

  useEffect(() => {
    apiGet<Book>(`/books/${book.id}`).then(setDetail).catch(() => undefined);
    apiGet<{ bookmarks: Bookmark[] }>(`/bookmarks?bookId=${book.id}`)
      .then((data) => setBookmarks(data.bookmarks)).catch(() => undefined);
  }, [book.id]);

  const progress = progressPercent(detail);
  const isCurrent = player.book?.id === detail.id;

  return (
    <div className="detail-page">
      <button className="back-button" onClick={onBack}><ChevronLeft size={20} /> 返回</button>

      <div className="detail-hero">
        <img src={detail.coverUrl} alt={detail.title} />
        <h1>{detail.title}</h1>
        <p className="detail-author">{detail.author || '未知作者'}</p>
        <p className="detail-narrator">由 {detail.narrator || '未知演播者'} 演播</p>
        {detail.progress && detail.progress.position > 0 && (
          <div className="detail-progress">
            <span style={{ width: `${progress}%` }} />
            <small>已收听 {progress}% · 上次播放于 {formatDate(detail.progress.updatedAt)}</small>
          </div>
        )}
        <button className="primary-button wide" onClick={() => onPlay(detail)}>
          {isCurrent && player.playing ? <PauseIcon size={18} /> : <PlayIcon size={18} />}
          {detail.progress?.finished ? '重新播放' : detail.progress?.position ? '继续播放' : '开始播放'}
        </button>
        <div className="detail-actions">
          <a className="secondary-button" href={mediaUrl(`/books/${detail.id}/stream?download=1`)} download={`${detail.title}.audio`}>
            <DownloadIcon size={16} /> 下载
          </a>
          <button className="secondary-button" onClick={() => void apiPost(`/progress/${detail.id}/finish`, { finished: !detail.progress?.finished })
            .then(() => apiGet<Book>(`/books/${detail.id}`)).then(setDetail)}>
            <CheckIcon size={16} /> {detail.progress?.finished ? '标记为未听完' : '标记已听完'}
          </button>
        </div>
      </div>

      <div className="detail-info-grid">
        <div><span>时长</span><strong>{formatDuration(detail.duration)}</strong></div>
        <div><span>章节</span><strong>{detail.chapters.length}</strong></div>
        <div><span>语言</span><strong>{detail.language || '中文'}</strong></div>
        <div><span>来源</span><strong>{detail.sourceType === 'local' ? '本地书库' : detail.sourceType}</strong></div>
      </div>

      {detail.description && <p className="detail-description">{detail.description}</p>}

      <div className="detail-tabs">
        <button className={tab === 'chapters' ? 'active' : ''} onClick={() => setTab('chapters')}><ListIcon size={15} /> 章节</button>
        <button className={tab === 'bookmarks' ? 'active' : ''} onClick={() => setTab('bookmarks')}><BookmarkIcon size={15} /> 书签</button>
        <button className={tab === 'notes' ? 'active' : ''} onClick={() => setTab('notes')}>笔记</button>
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
          {!bookmarks.length && <p className="empty-hint">还没有书签</p>}
        </div>
      )}

      {tab === 'notes' && <p className="empty-hint">笔记与书签关联。在播放器中创建带文字的书签即可记录笔记。</p>}
    </div>
  );
}
