import { useEffect, useState, type ReactNode } from 'react';
import { apiGet } from '../api/client.js';
import { BookCard } from '../components/BookCard.js';
import { PageHeader, type Page } from '../components/Layout.js';
import { ChevronRight, ClockIcon, FlameIcon, PlayIcon } from '../components/Icons.js';
import { usePlayer } from '../store.js';
import type { Book, Stats } from '../types.js';
import { formatShortDuration } from '../utils.js';

interface HomeData {
  continueListening: Book[];
  recentlyAdded: Book[];
  finished: Book[];
  stats: Stats;
}

export function Home({ onNavigate, onOpenBook, onPlay }: {
  onNavigate: (page: Page) => void;
  onOpenBook: (book: Book) => void;
  onPlay: (book: Book) => void;
}) {
  const [data, setData] = useState<HomeData | null>(null);
  const player = usePlayer();

  useEffect(() => {
    apiGet<HomeData>('/home').then(setData).catch(() => setData(null));
  }, []);

  return (
    <>
      <PageHeader title="首页" subtitle="继续你的聆听旅程" />
      <section className="stats-grid">
        <div className="stat-card">
          <ClockIcon size={18} />
          <span>本周收听</span>
          <strong>{formatShortDuration(data?.stats.weekSeconds ?? 0)}</strong>
        </div>
        <div className="stat-card">
          <FlameIcon size={18} />
          <span>连续收听</span>
          <strong>{data?.stats.streak ?? 0} 天</strong>
        </div>
      </section>

      <Section title="继续收听" onMore={() => onNavigate('books')}>
        {data?.continueListening.length ? (
          <div className="row-list">
            {data.continueListening.map((book) => (
              <BookCard key={book.id} book={book} variant="row" onClick={() => onOpenBook(book)} />
            ))}
          </div>
        ) : <p className="empty-hint">开始播放一本书后，这里会显示进度</p>}
      </Section>

      <Section title="最近添加" onMore={() => onNavigate('books')}>
        <div className="horizontal-scroll">
          {data?.recentlyAdded.map((book) => (
            <BookCard key={book.id} book={book} variant="compact" onClick={() => onOpenBook(book)} />
          ))}
        </div>
      </Section>

      <Section title="已听完" onMore={() => onNavigate('books')}>
        <div className="horizontal-scroll">
          {data?.finished.map((book) => (
            <BookCard key={book.id} book={book} variant="compact" onClick={() => onOpenBook(book)} />
          ))}
          {!data?.finished.length && <p className="empty-hint">尚未听完任何书籍</p>}
        </div>
      </Section>

      {data?.continueListening[0] && (
        <button className="primary-button wide" onClick={() => onPlay(data.continueListening[0])}>
          <PlayIcon size={17} /> 继续听《{data.continueListening[0].title}》
        </button>
      )}
    </>
  );
}

function Section({ title, onMore, children }: { title: string; onMore: () => void; children: ReactNode }) {
  return (
    <section className="home-section">
      <div className="section-head">
        <h2>{title}</h2>
        <button className="section-more" onClick={onMore}>查看全部 <ChevronRight size={15} /></button>
      </div>
      {children}
    </section>
  );
}
