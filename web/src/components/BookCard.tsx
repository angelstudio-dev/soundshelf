import type { Book } from '../types.js';
import { formatShortDuration, progressPercent } from '../utils.js';
import { CheckIcon } from './Icons.js';

interface Props {
  book: Book;
  onClick: () => void;
  variant?: 'grid' | 'row' | 'compact';
}

export function BookCard({ book, onClick, variant = 'grid' }: Props) {
  const progress = progressPercent(book);
  const finished = book.progress?.finished;

  if (variant === 'row') {
    return (
      <button className="book-row" onClick={onClick}>
        <div className="book-row-cover">
          <img src={book.coverUrl} alt="" loading="lazy" />
        </div>
        <div className="book-row-info">
          <span className="book-row-title">{book.title}</span>
          <span className="book-row-author">{book.author || '未知作者'}</span>
          {book.progress && !finished && <span className="book-row-progress">已听 {progress}% · 剩余 {formatShortDuration(book.duration * (1 - progress / 100))}</span>}
          {finished && <span className="book-row-progress finished"><CheckIcon size={12} /> 已听完</span>}
        </div>
      </button>
    );
  }

  return (
    <button className={`book-card ${variant === 'compact' ? 'compact' : ''}`} onClick={onClick}>
      <div className="book-cover-wrap">
        <img className="book-cover" src={book.coverUrl} alt={book.title} loading="lazy" />
        {finished && <span className="cover-badge"><CheckIcon size={12} /></span>}
        {progress > 0 && !finished && <span className="cover-progress-track"><span style={{ width: `${progress}%` }} /></span>}
      </div>
      <span className="book-card-title">{book.title}</span>
      <span className="book-card-author">{book.author || '未知作者'}</span>
    </button>
  );
}
