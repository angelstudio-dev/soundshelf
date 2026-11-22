import { useState } from 'react';
import { Layout, type Page } from './components/Layout.js';
import { Player } from './components/Player.js';
import { BookDetail } from './pages/BookDetail.js';
import { Books } from './pages/Books.js';
import { Collections } from './pages/Collections.js';
import { Home } from './pages/Home.js';
import { Login } from './pages/Login.js';
import { Search } from './pages/Search.js';
import { Settings } from './pages/Settings.js';
import { StatsPage } from './pages/Stats.js';
import { useAuth, usePlayer } from './store.js';
import type { Book } from './types.js';

export function App() {
  const { user, ready, logout } = useAuth();
  const player = usePlayer();
  const [page, setPage] = useState<Page>('home');
  const [selected, setSelected] = useState<Book | null>(null);
  const [playerOpen, setPlayerOpen] = useState(false);

  if (!ready) return <div className="boot-screen"><div className="boot-spinner" /><p>正在连接书库…</p></div>;
  if (!user) return <Login />;

  const openBook = (book: Book) => { setSelected(book); setPage('book'); };
  const playBook = (book: Book) => { void player.open(book).then(() => setPlayerOpen(true)); };

  return (
    <>
      <Layout page={page} onNavigate={(next) => { setPage(next); window.scrollTo({ top: 0 }); }}
        onOpenPlayer={() => setPlayerOpen(true)}>
        {page === 'home' && <Home onNavigate={setPage} onOpenBook={openBook} onPlay={playBook} />}
        {page === 'books' && <Books onOpenBook={openBook} />}
        {page === 'collections' && <Collections onOpenBook={openBook} />}
        {page === 'search' && <Search onOpenBook={openBook} />}
        {page === 'settings' && <Settings onNavigate={setPage} onLogout={logout} />}
        {page === 'stats' && <StatsPage />}
        {page === 'book' && selected && <BookDetail book={selected} onBack={() => setPage('books')} onPlay={playBook} />}
      </Layout>
      {playerOpen && <Player onClose={() => setPlayerOpen(false)} />}
    </>
  );
}
