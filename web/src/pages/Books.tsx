import { useEffect, useMemo, useState } from 'react';
import { apiGet } from '../api/client.js';
import { BookCard } from '../components/BookCard.js';
import { GridIcon, ListIcon, SearchIcon, SortIcon } from '../components/Icons.js';
import { PageHeader } from '../components/Layout.js';
import type { Book } from '../types.js';
import { formatShortDuration, groupByInitial } from '../utils.js';

type Filter = 'all' | 'unfinished' | 'in-progress' | 'finished' | 'series' | 'downloaded';
type Sort = 'recent' | 'title' | 'author' | 'duration';

const filters: { key: Filter; label: string }[] = [
  { key: 'all', label: '所有' },
  { key: 'unfinished', label: '未完成' },
  { key: 'in-progress', label: '收听中' },
  { key: 'finished', label: '已完成' },
  { key: 'series', label: '系列' },
  { key: 'downloaded', label: '已下载' }
];

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

export function Books({ onOpenBook }: { onOpenBook: (book: Book) => void }) {
  const [books, setBooks] = useState<Book[]>([]);
  const [filter, setFilter] = useState<Filter>('all');
  const [sort, setSort] = useState<Sort>('title');
  const [view, setView] = useState<'grid' | 'list'>('list');
  const [search, setSearch] = useState('');
  const [showSort, setShowSort] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams({ filter, sort, limit: '100' });
    if (search.trim()) params.set('search', search.trim());
    apiGet<{ books: Book[] }>(`/books?${params}`)
      .then((data) => setBooks(data.books))
      .catch(() => setBooks([]));
  }, [filter, sort, search]);

  // 「已下载」由浏览器离线缓存标记决定，这里用 localStorage 过滤
  const visible = useMemo(() => {
    if (filter !== 'downloaded') return books;
    let saved: string[] = [];
    try { saved = JSON.parse(localStorage.getItem('ss-downloaded') || '[]'); } catch { /* ignore */ }
    return books.filter((book) => saved.includes(book.id));
  }, [books, filter]);

  const groups = useMemo(() => groupByInitial(visible, (book) => book.title), [visible]);
  const availableLetters = new Set(groups.map((group) => group.letter));
  const jumpTo = (letter: string) => document.getElementById(`book-group-${letter}`)?.scrollIntoView({ behavior: 'smooth' });

  return (
    <>
      <PageHeader title="书架" subtitle={`${visible.length} 本书`}
        action={
          <div className="header-actions">
            <button className="icon-button" onClick={() => setView(view === 'grid' ? 'list' : 'grid')}>
              {view === 'grid' ? <ListIcon size={20} /> : <GridIcon size={20} />}
            </button>
            <button className="icon-button" onClick={() => setShowSort(!showSort)}><SortIcon size={20} /></button>
          </div>
        } />
      <div className="search-inline">
        <SearchIcon size={18} />
        <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索书名、作者或章节" />
      </div>
      <div className="chip-row">
        {filters.map((item) => (
          <button key={item.key} className={`chip ${filter === item.key ? 'active' : ''}`} onClick={() => setFilter(item.key)}>
            {item.label}
          </button>
        ))}
      </div>
      {showSort && (
        <div className="sort-row">
          <label>排序
            <select value={sort} onChange={(event) => setSort(event.target.value as Sort)}>
              <option value="title">书名</option>
              <option value="author">作者</option>
              <option value="recent">最近添加</option>
              <option value="duration">时长</option>
            </select>
          </label>
        </div>
      )}

      {view === 'grid' ? (
        <div className="book-grid">
          {visible.map((book) => <BookCard key={book.id} book={book} onClick={() => onOpenBook(book)} />)}
        </div>
      ) : (
        <div className="alphabet-list-wrap">
          <div className="alphabet-list">
            {groups.map((group) => (
              <section key={group.letter} id={`book-group-${group.letter}`} className="alpha-group">
                <h2 className="alpha-letter">{group.letter}</h2>
                {group.items.map((book) => (
                  <button key={book.id} className="book-row" onClick={() => onOpenBook(book)}>
                    <span className="book-row-cover"><img src={book.coverUrl} alt="" /></span>
                    <span className="book-row-info">
                      <span className="book-row-author">{book.author || '未知作者'}</span>
                      <span className="book-row-title">{book.title}</span>
                      <span className="duration-pill">
                        {book.progress?.position ? <span className="pill-progress" style={{ width: `${Math.min(100, (book.progress.position / book.duration) * 100)}%` }} /> : null}
                        <span className="pill-label">▶ {formatShortDuration(book.duration)}</span>
                      </span>
                    </span>
                  </button>
                ))}
              </section>
            ))}
            {!groups.length && <p className="empty-hint">没有匹配的书籍</p>}
          </div>
          <nav className="alpha-index">
            {ALPHABET.map((letter) => (
              <button key={letter} disabled={!availableLetters.has(letter)} onClick={() => jumpTo(letter)}>{letter}</button>
            ))}
          </nav>
        </div>
      )}
    </>
  );
}
