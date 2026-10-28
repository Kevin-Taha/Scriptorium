import { type ReactNode, useMemo, useState } from 'react';
import { LampDesk, LayoutGrid, LibraryBig } from 'lucide-react';
import { isMissingFromFolder } from '@/features/library/BookCard';
import type { LibraryDocument } from '@/lib/types';
import { ActivityCard } from './ActivityCard';
import { BookRow, type DeskEntry, HeroCard } from './DeskCards';
import { loadMeta } from './deskMeta';
import { bookProgress } from './progress';
import { ShelfView } from './ShelfView';
import './readingDesk.css';

type View = 'desk' | 'grid' | 'shelf';

const VIEW_KEY = 'scriptorium.exp.reading-desk.view';
const VIEWS: { id: View; label: string; Icon: typeof LampDesk }[] = [
  { id: 'desk', label: 'Desk', Icon: LampDesk },
  { id: 'grid', label: 'Grid', Icon: LayoutGrid },
  { id: 'shelf', label: 'Shelf', Icon: LibraryBig },
];
const ON_DESK = 4;

function readView(): View {
  try {
    const value = localStorage.getItem(VIEW_KEY);
    return value === 'grid' || value === 'shelf' ? value : 'desk';
  } catch {
    return 'desk';
  }
}

interface Props {
  entries: DeskEntry[];
  /** Today's grid of book cards, shown in the Grid view. */
  grid: ReactNode;
  onOpen(doc: LibraryDocument): void;
  onRemove(doc: LibraryDocument, opener: HTMLButtonElement | null): void;
}

/** The reading-desk home: books in progress, reading activity, and the books as desk, grid or shelf. */
export function ReadingDesk({ entries, grid, onOpen, onRemove }: Props) {
  const [view, setView] = useState<View>(readView);
  const choose = (next: View) => {
    setView(next);
    try {
      localStorage.setItem(VIEW_KEY, next);
    } catch {
      // Private mode: the choice lasts this session.
    }
  };

  const groups = useMemo(() => {
    const withProgress = entries.map((entry) => ({
      entry,
      progress: bookProgress(entry.doc, entry.reading, loadMeta(entry.doc.id)),
    }));
    const byRecent = (a: DeskEntry, b: DeskEntry) => b.doc.lastOpenedAt - a.doc.lastOpenedAt;
    const reading = withProgress
      .filter((p) => p.progress.opened && !p.progress.finished)
      .map((p) => p.entry)
      .sort(byRecent);
    return {
      desk: reading.filter((e) => !isMissingFromFolder(e.doc)).slice(0, ON_DESK),
      reading,
      upNext: withProgress.filter((p) => !p.progress.opened).map((p) => p.entry),
      finished: withProgress
        .filter((p) => p.progress.opened && p.progress.finished)
        .map((p) => p.entry)
        .sort(byRecent),
    };
  }, [entries]);

  const [hero, ...stack] = groups.desk;
  const suggestions = groups.upNext
    .filter((e) => !isMissingFromFolder(e.doc))
    .slice(0, Math.max(0, ON_DESK - 1 - stack.length));
  const books = useMemo(() => entries.map((e) => ({ id: e.doc.id, pageCount: e.doc.pageCount })), [entries]);

  return (
    <div className="rd">
      <section className="rd-desk" aria-labelledby="rd-desk-heading">
        <div className="library__section-heading">
          <h2 id="rd-desk-heading">On your desk</h2>
          <span>{groups.reading.length ? `${groups.reading.length} IN PROGRESS` : 'NOTHING OPEN'}</span>
        </div>
        {hero ? (
          <div className={`rd-desk__surface ${stack.length + suggestions.length ? '' : 'is-single'}`}>
            <HeroCard entry={hero} onOpen={() => onOpen(hero.doc)} />
            {stack.length + suggestions.length > 0 && (
              <div className="rd-desk__stack">
                {stack.map((entry) => (
                  <BookRow key={entry.doc.id} entry={entry} onOpen={() => onOpen(entry.doc)} />
                ))}
                {suggestions.length > 0 && <p className="rd-desk__label">Up next</p>}
                {suggestions.map((entry) => (
                  <BookRow key={entry.doc.id} entry={entry} onOpen={() => onOpen(entry.doc)} />
                ))}
              </div>
            )}
          </div>
        ) : (
          <>
            <div className="card rd-desk__clear">
              <LampDesk aria-hidden="true" />
              <p>
                <strong>Your desk is clear.</strong>{' '}
                {groups.upNext.length
                  ? 'Start one of these and it will wait for you here, open at your page.'
                  : 'Open any book below and it will wait for you here, open at your page.'}
              </p>
            </div>
            {groups.upNext.length > 0 && (
              <div className="rd-desk__suggestions">
                {groups.upNext.slice(0, 3).map((entry) => (
                  <BookRow key={entry.doc.id} entry={entry} onOpen={() => onOpen(entry.doc)} />
                ))}
              </div>
            )}
          </>
        )}
      </section>

      <ActivityCard books={books} />

      <section aria-labelledby="books-heading" className="library__books rd-books">
        <div className="library__section-heading rd-books__heading">
          <h2 id="books-heading">Your books</h2>
          <div className="rd-books__tools">
            <span className="rd-books__count">
              {entries.length} {entries.length === 1 ? 'BOOK' : 'BOOKS'}
            </span>
            <div className="segmented rd-views" role="radiogroup" aria-label="Show books as">
              {VIEWS.map(({ id, label, Icon }) => (
                <button
                  type="button"
                  key={id}
                  role="radio"
                  className="segmented__item"
                  aria-checked={view === id}
                  onClick={() => choose(id)}
                >
                  <Icon aria-hidden="true" />
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>
        {view === 'grid' && grid}
        {view === 'shelf' && <ShelfView entries={entries} onOpen={onOpen} onRemove={onRemove} />}
        {view === 'desk' && (
          <div className="rd-ledger">
            {(
              [
                ['Reading', groups.reading],
                ['Up next', groups.upNext],
                ['Finished', groups.finished],
              ] as const
            ).map(([title, list]) =>
              list.length ? (
                <div className="rd-ledger__group" key={title}>
                  <h3 className="rd-ledger__title">
                    {title} <span>{list.length}</span>
                  </h3>
                  <div className="rd-ledger__rows">
                    {list.map((entry) => (
                      <BookRow
                        key={entry.doc.id}
                        entry={entry}
                        onOpen={() => onOpen(entry.doc)}
                        onRemove={(opener) => onRemove(entry.doc, opener)}
                      />
                    ))}
                  </div>
                </div>
              ) : null,
            )}
          </div>
        )}
      </section>
    </div>
  );
}
