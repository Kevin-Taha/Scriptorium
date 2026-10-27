import { useRef, useState } from 'react';
import { Bookmark, Pencil, Trash2 } from 'lucide-react';
import { showToast } from '@/components/Toast';
import type { Bookmark as BookmarkRecord } from '@/lib/types';
import { useReaderStore } from '../reader/readerStore';
import { useBookmarksStore, useIsBookmarked } from './bookmarksStore';
import { useHistoryStore } from './historyStore';

export function BookmarksPanel() {
  const page = useReaderStore((s) => s.location.page);
  const bookmarks = useBookmarksStore((s) => s.bookmarks);
  const toggle = useBookmarksStore((s) => s.toggle);
  const bookmarked = useIsBookmarked(page);

  return (
    <div className="bookmark-list">
      <button className="btn btn--ghost bookmark-list__toggle" onClick={() => toggle(page)}>
        <Bookmark fill={bookmarked ? 'currentColor' : 'none'} aria-hidden="true" />
        <span>{bookmarked ? 'Remove bookmark' : 'Bookmark this page'}</span>
        <kbd className="kbd">B</kbd>
      </button>
      {bookmarks.length ? (
        <ul>
          {bookmarks.map((bookmark) => (
            <BookmarkItem key={bookmark.id} bookmark={bookmark} current={bookmark.page === page} />
          ))}
        </ul>
      ) : (
        <div className="empty-state bookmark-list__empty">
          <span className="empty-state__icon">
            <Bookmark aria-hidden="true" />
          </span>
          <h2 className="empty-state__title">No bookmarks yet</h2>
          <p className="empty-state__body">
            Press <kbd className="kbd">B</kbd> to mark the current page.
          </p>
        </div>
      )}
    </div>
  );
}

function BookmarkItem({ bookmark, current }: { bookmark: BookmarkRecord; current: boolean }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(bookmark.label);
  const cancelled = useRef(false);
  const rename = useBookmarksStore((s) => s.rename);
  const remove = useBookmarksStore((s) => s.remove);
  const jumpTo = useHistoryStore((s) => s.jumpTo);
  const startEditing = () => {
    cancelled.current = false;
    setDraft(bookmark.label);
    setEditing(true);
  };
  const save = () => {
    if (!cancelled.current) rename(bookmark.id, draft);
    setEditing(false);
  };
  const deleteWithUndo = () => {
    remove(bookmark.id);
    showToast('Bookmark removed', {
      action: {
        label: 'Undo',
        onAction: () => {
          const store = useBookmarksStore.getState();
          if (store.docId !== bookmark.docId || store.bookmarks.some((item) => item.page === bookmark.page))
            return;
          store.toggle(bookmark.page);
          const restored = useBookmarksStore.getState().bookmarks.find((item) => item.page === bookmark.page);
          if (restored) store.rename(restored.id, bookmark.label);
        },
      },
    });
  };

  return (
    <li className={`bookmark-list__item${current ? ' is-current' : ''}`}>
      {editing ? (
        <input
          className="input bookmark-list__input"
          aria-label={`Rename bookmark on page ${bookmark.page}`}
          value={draft}
          autoFocus
          onChange={(event) => setDraft(event.currentTarget.value)}
          onBlur={save}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              event.currentTarget.blur();
            }
            if (event.key === 'Escape') {
              event.preventDefault();
              cancelled.current = true;
              event.currentTarget.blur();
            }
          }}
        />
      ) : (
        <button className="bookmark-list__link" onClick={() => jumpTo({ page: bookmark.page, offset: 0 })}>
          <span className="bookmark-list__label">{bookmark.label}</span>
          <span className="bookmark-list__page">{bookmark.page}</span>
        </button>
      )}
      <button
        className="btn btn--ghost btn--icon btn--sm bookmark-list__action"
        aria-label={`Rename bookmark on page ${bookmark.page}`}
        onClick={startEditing}
      >
        <Pencil />
      </button>
      <button
        className="btn btn--ghost btn--icon btn--sm bookmark-list__action"
        aria-label={`Delete bookmark on page ${bookmark.page}`}
        onClick={deleteWithUndo}
      >
        <Trash2 />
      </button>
    </li>
  );
}
