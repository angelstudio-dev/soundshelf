import { useEffect, useMemo, useState } from 'react';
import { apiGet } from '../api/client.js';
import { BookCard } from '../components/BookCard.js';
import {
  GridIcon, ListIcon, SearchIcon, SortIcon, UploadCloudIcon
} from '../components/Icons.js';
import { PageHeader } from '../components/Layout.js';
import type { Book, Playlist } from '../types.js';
import { formatShortDuration, groupByInitial } from '../utils.js';

type Filter = 'all' | 'unfinished' | 'playlist' | 'downloaded' | 'genre';
type Sort = 'recent' | 'title' | 'author' | 'duration';

const filters: { key: Filter; label: string }[] = [
  { key: 'unfinished', label: '未完成' },
  { key: 'playlist', label: '播放列表' },
  { key: 'downloaded', label: '已下载' },
  { key: 'genre', label: '流派' }
];

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

export function Books({ onOpenBook }: { onOpenBook: (book: Book) => void }) {
  const [books, setBooks] = useState<Book[]>([]);
  const [filter, setFilter] = useState<Filter>('unfinished');
  const [sort, setSort] = useState<Sort>('title');
  const [view, setView] = useState<'grid' | 'list'>('list');
  const [search, setSearch] = useState('');
  const [showSort, setShowSort] = useState(false);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [playlistName, setPlaylistName] = useState('');
  const [genre, setGenre] = useState('');
  const [genres, setGenres] = useState<string[]>([]);
  const [genreOpen, setGenreOpen] = useState(false);

  useEffect(() => {
    apiGet<{ playlists: Playlist[] }>('/playlists').then((data) => {
      setPlaylists(data.playlists || []);
      if (!playlistName && data.playlists?.length) setPlaylistName(data.playlists[0].name);
    }).catch(() => undefined);
  }, []);

  useEffect(() => {
    const params = new URLSearchParams({ sort, limit: '100' });
    if (search.trim()) params.set('search', search.trim());
    if (filter === 'unfinished') params.set('filter', 'unfinished');
    apiGet<{ books: Book[] }>(`/books?${params}`)
      .then((data) => setBooks(data.books))
      .catch(() => setBooks([]));
  }, [filter, sort, search]);

  useEffect(() => {
    const set = new Set<string>();
    for (const book of books) for (const tag of book.tags || []) if (tag.trim()) set.add(tag.trim());
    setGenres(Array.from(set).sort());
  }, [books]);

  const selectedPlaylist = useMemo(
    () => playlists.find((item) => item.name === playlistName),
    [playlists, playlistName]
  );

  const visible = useMemo(() => {
    let result = books;
    if (filter === 'playlist') {
      const ids = selectedPlaylist?.bookIds || [];
      result = result.filter((book) => ids.includes(book.id));
    } else if (filter === 'downloaded') {
      let saved: string[] = [];
      try { saved = JSON.parse(localStorage.getItem('ss-downloaded') || '[]'); } catch { /* ignore */ }
      result = result.filter((book) => saved.includes(book.id));
    } else if (filter === 'genre' && genre) {
      result = result.filter((book) => (book.tags || []).some((tag) => tag.includes(genre)));
    }
    return result;
  }, [books, filter, selectedPlaylist, genre]);

  const groups = useMemo(() => groupByInitial(visible, (book) => book.title), [visible]);
  const availableLetters = new Set(groups.map((group) => group.letter));
  const jumpTo = (letter: string) => document.getElementById(`book-group-${letter}`)?.scrollIntoView({ behavior: 'smooth' });

  const chooseFilter = (key: Filter) => {
    setFilter(key);
    if (key === 'genre') setGenreOpen(true);
    else setGenreOpen(false);
  };

  return (
    <>
      <div className="top-pills">
        <button className="library-pill"><span className="green-dot" /> 有声小说</button>
        <div className="top-pill-actions">
          <button className="icon-button" title="导入"><UploadCloudIcon size={19} /></button>
          <button className="icon-button" title="排序" onClick={() => setShowSort(!showSort)}><SortIcon size={19} /></button>
        </div>
      </div>
      <PageHeader title="书架" subtitle={`${visible.length} 本书`} />

      <div className="search-inline">
        <SearchIcon size={18} />
        <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索书名、作者或章节" />
      </div>
      <div className="chip-row">
        {filters.map((item) => (
          <button key={item.key} className={`chip ${filter === item.key ? 'active' : ''}`} onClick={() => chooseFilter(item.key)}>
            {item.label}{item.key === 'genre' && <span className="chip-caret">▾</span>}
          </button>
        ))}
        <button className="icon-button" onClick={() => setView(view === 'grid' ? 'list' : 'grid')}>
          {view === 'grid' ? <ListIcon size={18} /> : <GridIcon size={18} />}
        </button>
      </div>
      {filter === 'playlist' && (
        <div className="sub-filter-row">
          {playlists.length ? playlists.map((item) => (
            <button key={item.name} className={`chip small ${playlistName === item.name ? 'active' : ''}`}
              onClick={() => setPlaylistName(item.name)}>{item.name} ({item.bookIds.length})</button>
          )) : <span className="muted small-text">还没有播放清单，在书籍详情的「…」菜单里添加</span>}
        </div>
      )}
      {filter === 'genre' && genreOpen && (
        <div className="sub-filter-row">
          <button className={`chip small ${!genre ? 'active' : ''}`} onClick={() => setGenre('')}>全部流派</button>
          {genres.map((item) => (
            <button key={item} className={`chip small ${genre === item ? 'active' : ''}`} onClick={() => setGenre(item)}>{item}</button>
          ))}
          {!genres.length && <span className="muted small-text">书库中暂无流派标签</span>}
        </div>
      )}
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
