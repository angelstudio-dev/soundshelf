import { ChevronLeft } from '../components/Icons.js';
import { formatShortDuration } from '../utils.js';
import type { Book } from '../types.js';

export type ListKind = 'recent' | 'continue' | 'finished';

const TITLES: Record<ListKind, string> = {
  recent: '最近添加',
  continue: '继续听',
  finished: '已完成'
};

export function ListPage({ kind, books, onBack, onOpenBook }: {
  kind: ListKind;
  books: Book[];
  onBack: () => void;
  onOpenBook: (book: Book) => void;
}) {
  return (
    <div className="detail-page list-page">
      <div className="detail-topbar">
        <button className="back-button" onClick={onBack}><ChevronLeft size={20} /> 返回</button>
      </div>
      <h1 className="list-page-title">{TITLES[kind]}</h1>
      <p className="list-page-count">{books.length} 本书籍</p>
      <div className="list-page-items">
        {books.map((book) => (
          <button key={book.id} className="list-book-row" onClick={() => onOpenBook(book)}>
            <span className="list-book-cover"><img src={book.coverUrl} alt="" loading="lazy" /></span>
            <span className="list-book-info">
              <span className="list-book-author">{book.narrator || book.author || '未知主播'}</span>
              <span className="list-book-title">{book.title}</span>
              <span className="duration-pill">
                <span className="pill-label">▶ {formatShortDuration(book.duration)}</span>
              </span>
            </span>
            <ChevronLeft size={16} className="list-book-arrow" />
          </button>
        ))}
        {!books.length && <p className="empty-hint bordered">暂无书籍</p>}
      </div>
    </div>
  );
}
