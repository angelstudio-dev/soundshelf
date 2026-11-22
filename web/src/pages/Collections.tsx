import { useEffect, useState } from 'react';
import { apiGet } from '../api/client.js';
import { BookCard } from '../components/BookCard.js';
import { PageHeader } from '../components/Layout.js';
import type { Book, Collection } from '../types.js';

export function Collections({ onOpenBook }: { onOpenBook: (book: Book) => void }) {
  const [collections, setCollections] = useState<Collection[]>([]);
  useEffect(() => {
    apiGet<{ collections: Collection[] }>('/collections').then((data) => setCollections(data.collections)).catch(() => undefined);
  }, []);

  return (
    <>
      <PageHeader title="合集" subtitle={`${collections.length} 个合集 · ${collections.reduce((sum, item) => sum + item.books.length, 0)} 本书`} />
      {collections.map((collection) => (
        <section className="collection-section" key={collection.id}>
          <div className="collection-head">
            <h2>{collection.title}</h2>
            <span>{collection.books.length} 本书</span>
          </div>
          {collection.description && <p className="collection-desc">{collection.description}</p>}
          <div className="horizontal-scroll">
            {collection.books.map((book) => (
              <BookCard key={book.id} book={book} variant="compact" onClick={() => onOpenBook(book)} />
            ))}
          </div>
        </section>
      ))}
      {!collections.length && <p className="empty-hint">书源中没有合集。可以在 Audiobookshelf 或 Plex 中创建合集后同步。</p>}
    </>
  );
}
