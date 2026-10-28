import { useRef, useState } from 'react';
import { MoreHorizontal } from 'lucide-react';
import type { LibraryDocument, ReadingState } from '@/lib/types';
import { formatOpened, progressPercent } from './libraryUtils';

export function BookCover({ doc, className = '' }: { doc: LibraryDocument; className?: string }) {
  return (
    <div className={`book-card__cover ${className}`}>
      {doc.coverDataUrl ? (
        <img src={doc.coverDataUrl} alt="" />
      ) : (
        <div className="book-card__placeholder">
          <span>{doc.title}</span>
        </div>
      )}
    </div>
  );
}

export function BookCard({
  doc,
  reading,
  onOpen,
  onRemove,
}: {
  doc: LibraryDocument;
  reading?: ReadingState;
  onOpen(): void;
  onRemove(opener: HTMLButtonElement | null): void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  const progress = progressPercent(doc.pageCount, reading?.location);
  return (
    <article className="book-card">
      <button
        type="button"
        className="book-card__main"
        onClick={onOpen}
        aria-label={`Open ${doc.title}, ${progress}% read`}
      >
        <BookCover doc={doc} />
        <span className="book-card__title">{doc.title}</span>
        <span className="book-card__meta">
          <span className="book-card__progress" aria-hidden="true">
            <span style={{ width: `${progress}%` }} />
          </span>
          <span>{progress}%</span>
        </span>
        <span className="book-card__opened">{formatOpened(doc.lastOpenedAt)}</span>
      </button>
      {/* biome-ignore lint/a11y/noStaticElementInteractions: closes the menu on Escape or blur; the controls inside are buttons */}
      <div
        className={`book-card__menu ${menuOpen ? 'is-open' : ''}`}
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setMenuOpen(false);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape' && menuOpen) {
            event.stopPropagation();
            setMenuOpen(false);
            menuButton.current?.focus();
          }
        }}
      >
        <button
          type="button"
          ref={menuButton}
          className="btn btn--icon btn--sm book-card__menu-button"
          aria-label={`More options for ${doc.title}`}
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen(!menuOpen)}
        >
          <MoreHorizontal aria-hidden="true" />
        </button>
        {menuOpen && (
          <div className="book-card__popover">
            <button
              type="button"
              onClick={() => {
                setMenuOpen(false);
                onRemove(menuButton.current);
              }}
            >
              Remove from library…
            </button>
          </div>
        )}
      </div>
    </article>
  );
}
