import { useRef, useState } from 'react';
import { MoreHorizontal } from 'lucide-react';
import type { LibraryDocument } from '@/lib/types';

/** The book overflow menu (Remove…), as on the grid's book cards. */
export function BookMenu({
  doc,
  onRemove,
  className = '',
}: {
  doc: LibraryDocument;
  onRemove(opener: HTMLButtonElement | null): void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const folderPath = doc.source?.kind === 'folder' ? doc.source.path : null;
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: closes the menu on Escape or blur; the controls inside are buttons
    <div
      className={`rd-menu ${open ? 'is-open' : ''} ${className}`}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false);
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && open) {
          event.stopPropagation();
          setOpen(false);
          button.current?.focus();
        }
      }}
    >
      <button
        type="button"
        ref={button}
        className="btn btn--ghost btn--icon btn--sm rd-menu__button"
        aria-label={`More options for ${doc.title}`}
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <MoreHorizontal aria-hidden="true" />
      </button>
      {open && (
        <div className="book-card__popover rd-menu__popover">
          {folderPath !== null ? (
            <p className="book-card__popover-note">Remove the file from the folder to remove this book.</p>
          ) : (
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                onRemove(button.current);
              }}
            >
              Remove from library…
            </button>
          )}
        </div>
      )}
    </div>
  );
}
