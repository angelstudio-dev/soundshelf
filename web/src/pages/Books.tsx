import { useEffect, useState } from 'react';
import { apiGet } from '../api/client.js';
import { BookCard } from '../components/BookCard.js';
import { GridIcon, ListIcon, SearchIcon } from '../components/Icons.js';
import { PageHeader } from '../components/Layout.js';
import type { Book } from '../types.js';

type Filter = 'all' | 'in-progress' | 'unfinished' | 'finished' | 'series';
type Sort = 'recent' | 'title' | 'author' | 'duration';

const filters: { key: Filter; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'in-progress', label: '收听中' },
  { key: 'unfinished', label: '未听完' },
  { key: 'finished', label: '已听完' },
  { key: 'series', label: '系列' }
];

export function Books({ onOpenBook }: { onOpenBook: (book: Book) => void }) {
  const [books, setBooks] = useState<Book[]>([]);
  const [filter, setFilter] = useState<Filter>('all');
  const [sort, setSort] = useState<Sort>('recent');
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const [search, setSearch] = useState('');

  useEffect(() => {
    const params = new URLSearchParams({ filter, sort, limit: '100' });
    if (search.trim()) params.set('search', search.trim());
    apiGet<{ books: Book[] }>(`/books?${params}`)
      .then((data) => setBooks(data.books))
      .catch(() => setBooks([]));
  }, [filter, sort, search]);

  return (
    <>
      <PageHeader title="书籍" subtitle={`${books.length} 本书`}
        action={
          <button className="icon-button" onClick={() => setView(view === 'grid' ? 'list' : 'grid')}>
            {view === 'grid' ? <ListIcon size={20} /> : <GridIcon size={20} />}
          </button>
        } />
      <div className="search-inline">
        <SearchIcon size={18} />
        <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="筛选书籍…" />
      </div>
      <div className="chip-row">
        {filters.map((item) => (
          <button key={item.key} className={`chip ${filter === item.key ? 'active' : ''}`} onClick={() => setFilter(item.key)}>
            {item.label}
          </button>
        ))}
      </div>
      <div className="sort-row">
        <label>排序
          <select value={sort} onChange={(event) => setSort(event.target.value as Sort)}>
            <option value="recent">最近添加</option>
            <option value="title">书名</option>
            <option value="author">作者</option>
            <option value="duration">时长</option>
          </select>
        </label>
      </div>
      {view === 'grid' ? (
        <div className="book-grid">
          {books.map((book) => <BookCard key={book.id} book={book} onClick={() => onOpenBook(book)} />)}
        </div>
      ) : (
        <div className="row-list">
          {books.map((book) => <BookCard key={book.id} book={book} variant="row" onClick={() => onOpenBook(book)} />)}
        </div>
      )}
      {!books.length && <p className="empty-hint">没有匹配的书籍</p>}
    </>
  );
}
