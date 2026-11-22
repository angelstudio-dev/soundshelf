import { useEffect, useState } from 'react';
import { apiGet } from '../api/client.js';
import { BookCard } from '../components/BookCard.js';
import { PageHeader } from '../components/Layout.js';
import { SearchIcon } from '../components/Icons.js';
import type { Book } from '../types.js';

export function Search({ onOpenBook }: { onOpenBook: (book: Book) => void }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Book[]>([]);

  useEffect(() => {
    if (!query.trim()) { setResults([]); return; }
    const timer = setTimeout(() => {
      apiGet<{ books: Book[] }>(`/search?q=${encodeURIComponent(query.trim())}`)
        .then((data) => setResults(data.books)).catch(() => setResults([]));
    }, 250);
    return () => clearTimeout(timer);
  }, [query]);

  return (
    <>
      <PageHeader title="搜索" subtitle="在书名、作者、系列和标签中查找" />
      <div className="search-inline large">
        <SearchIcon size={20} />
        <input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="输入书名或作者…" />
      </div>
      <div className="row-list">
        {results.map((book) => <BookCard key={book.id} book={book} variant="row" onClick={() => onOpenBook(book)} />)}
      </div>
      {query && !results.length && <p className="empty-hint">没有找到相关书籍</p>}
    </>
  );
}
