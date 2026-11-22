import { useEffect, useMemo, useState } from 'react';
import { apiGet } from '../api/client.js';
import { ChevronLeft, SearchIcon } from '../components/Icons.js';
import { PageHeader } from '../components/Layout.js';
import type { Author, Book } from '../types.js';
import { groupByInitial, formatShortDuration } from '../utils.js';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

export function Authors({ onOpenAuthor }: { onOpenAuthor: (name: string) => void }) {
  const [authors, setAuthors] = useState<Author[]>([]);
  const [search, setSearch] = useState('');

  useEffect(() => {
    apiGet<{ authors: Author[] }>('/authors').then((data) => setAuthors(data.authors)).catch(() => setAuthors([]));
  }, []);

  const filtered = useMemo(
    () => authors.filter((author) => author.name.toLowerCase().includes(search.trim().toLowerCase())),
    [authors, search]
  );
  const groups = useMemo(() => groupByInitial(filtered, (author) => author.name), [filtered]);
  const availableLetters = new Set(groups.map((group) => group.letter));

  const jumpTo = (letter: string) => {
    document.getElementById(`author-group-${letter}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <>
      <PageHeader title="作者" subtitle={`${authors.length} 位作者`} />
      <div className="search-inline">
        <SearchIcon size={18} />
        <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索作者…" />
      </div>

      <div className="alphabet-list-wrap">
        <div className="alphabet-list">
          {groups.map((group) => (
            <section key={group.letter} id={`author-group-${group.letter}`} className="alpha-group">
              <h2 className="alpha-letter">{group.letter}</h2>
              {group.items.map((author) => (
                <button key={author.name} className="author-row" onClick={() => onOpenAuthor(author.name)}>
                  <img src={author.coverUrl} alt="" className="author-avatar" />
                  <span className="author-row-info">
                    <strong>{author.name}</strong>
                    <small>{author.bookCount} 本书籍{author.totalDuration ? ` · ${formatShortDuration(author.totalDuration)}` : ''}</small>
                  </span>
                  <span className="author-chevron">›</span>
                </button>
              ))}
            </section>
          ))}
          {!groups.length && <p className="empty-hint">没有匹配的作者</p>}
        </div>
        <nav className="alpha-index">
          {ALPHABET.map((letter) => (
            <button key={letter} disabled={!availableLetters.has(letter)} onClick={() => jumpTo(letter)}>{letter}</button>
          ))}
        </nav>
      </div>
    </>
  );
}

export function AuthorBooks({ name, onBack, onOpenBook }: {
  name: string;
  onBack: () => void;
  onOpenBook: (book: Book) => void;
}) {
  const [books, setBooks] = useState<Book[]>([]);

  useEffect(() => {
    apiGet<{ books: Book[] }>(`/authors/${encodeURIComponent(name)}/books`)
      .then((data) => setBooks(data.books)).catch(() => setBooks([]));
  }, [name]);

  return (
    <>
      <button className="back-button" onClick={onBack}><ChevronLeft size={20} /> 作者</button>
      <PageHeader title={name} subtitle={`${books.length} 本书籍`} />
      <div className="row-list">
        {books.map((book) => (
          <button key={book.id} className="book-row" onClick={() => onOpenBook(book)}>
            <span className="book-row-cover"><img src={book.coverUrl} alt="" /></span>
            <span className="book-row-info">
              <span className="book-row-title">{book.title}</span>
              <span className="book-row-author">{book.author}</span>
              <span className="book-row-progress">{formatShortDuration(book.duration)}</span>
            </span>
          </button>
        ))}
      </div>
      {!books.length && <p className="empty-hint">这位作者暂无书籍</p>}
    </>
  );
}
