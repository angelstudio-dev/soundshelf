import { useEffect, useState } from 'react';
import { apiGet } from './api/client.js';
import { Layout, type Page } from './components/Layout.js';
import { Player } from './components/Player.js';
import { AuthorBooks, Authors } from './pages/Authors.js';
import { BookDetail } from './pages/BookDetail.js';
import { Books } from './pages/Books.js';
import { Collections } from './pages/Collections.js';
import { Home } from './pages/Home.js';
import { ListPage, type ListKind } from './pages/ListPage.js';
import { Login } from './pages/Login.js';
import { Servers } from './pages/Servers.js';
import { Settings } from './pages/Settings.js';
import { StatsPage } from './pages/Stats.js';
import { useAuth, usePlayer } from './store.js';
import { applyPreferences, applyTheme } from './theme.js';
import type { Book } from './types.js';

export function App() {
  const { user, ready, logout } = useAuth();
  const player = usePlayer();
  const [page, setPage] = useState<Page>('home');
  const [selected, setSelected] = useState<Book | null>(null);
  const [authorName, setAuthorName] = useState('');
  const [listKind, setListKind] = useState<ListKind>('recent');
  const [listBooks, setListBooks] = useState<Book[]>([]);
  const [playerOpen, setPlayerOpen] = useState(false);

  useEffect(() => {
    if (!user) return;
    apiGet<Record<string, unknown>>('/settings')
      .then((prefs) => applyPreferences(prefs))
      .catch(() => applyTheme('dark'));
  }, [user]);

  if (!ready) return <div className="boot-screen"><div className="boot-spinner" /><p>正在连接书库…</p></div>;
  if (!user) return <Login />;

  const navigate = (next: Page) => { setPage(next); window.scrollTo({ top: 0 }); };
  const openBook = (book: Book) => { setSelected(book); navigate('book'); };
  const playBook = (book: Book) => { void player.open(book).then(() => setPlayerOpen(true)); };
  const openAuthor = (name: string) => { setAuthorName(name); navigate('author'); };
  const openList = (kind: ListKind, books: Book[]) => { setListKind(kind); setListBooks(books); navigate('list'); };

  return (
    <>
      <Layout page={page} onNavigate={navigate} onOpenPlayer={() => setPlayerOpen(true)}>
        {page === 'home' && <Home onNavigate={navigate} onOpenBook={openBook} onPlay={playBook} onOpenList={openList} />}
        {page === 'books' && <Books onOpenBook={openBook} />}
        {page === 'authors' && <Authors onOpenAuthor={openAuthor} />}
        {page === 'author' && <AuthorBooks name={authorName} onBack={() => navigate('authors')} onOpenBook={openBook} />}
        {page === 'collections' && <Collections onOpenBook={openBook} />}
        {page === 'servers' && <Servers onBack={() => navigate('settings')} />}
        {page === 'settings' && <Settings onNavigate={navigate} onLogout={logout} />}
        {page === 'stats' && <StatsPage />}
        {page === 'list' && <ListPage kind={listKind} books={listBooks} onBack={() => navigate('home')} onOpenBook={openBook} />}
        {page === 'book' && selected && (
          <BookDetail book={selected} onBack={() => navigate('books')} onPlay={playBook} onOpenAuthor={openAuthor} />
        )}
      </Layout>
      {playerOpen && <Player onClose={() => setPlayerOpen(false)} />}
    </>
  );
}
