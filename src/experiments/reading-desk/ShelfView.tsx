import { type CSSProperties, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { FileX } from 'lucide-react';
import { BookCover, isMissingFromFolder } from '@/features/library/BookCard';
import type { LibraryDocument } from '@/lib/types';
import { BookMenu } from './BookMenu';
import { toCss } from './colour';
import { ChapterBar, type DeskEntry, useBookProgress } from './DeskCards';
import { isOpened } from './progress';
import { layoutShelves, pileNudge, spineHeight, spineWidth } from './shelf';
import { useSpineStyle } from './useSpineStyle';

const GAP = 4;
const BOOKEND = 30;
const SHELF_PADDING = 28;
/** Unread books lie flat in a pile; it takes the width of its longest book. */
const PILE_SCALE = 0.86;
const PILE_SPACE = 24;

type Align = 'start' | 'center' | 'end';

function Spine({
  entry,
  lying = false,
  onOpen,
  onRemove,
}: {
  entry: DeskEntry;
  lying?: boolean;
  onOpen(): void;
  onRemove(opener: HTMLButtonElement | null): void;
}) {
  const { doc } = entry;
  const style = useSpineStyle(doc);
  const progress = useBookProgress(entry);
  const missing = isMissingFromFolder(doc);
  const [align, setAlign] = useState<Align>('center');
  const slot = useRef<HTMLDivElement>(null);
  const inProgress = progress.opened && !progress.finished;
  const thickness = spineWidth(doc.pageCount);
  const length = spineHeight(doc.id);

  const place = () => {
    const el = slot.current;
    const shelf = el?.closest('.rd-shelves');
    if (!el || !shelf) return;
    const box = el.getBoundingClientRect();
    const bounds = shelf.getBoundingClientRect();
    const center = box.left + box.width / 2;
    const half = 150;
    setAlign(center - half < bounds.left ? 'start' : center + half > bounds.right ? 'end' : 'center');
  };

  const spineStyle = {
    width: lying ? Math.round(length * PILE_SCALE) : thickness,
    height: lying ? thickness : length,
    '--rd-spine-bg': style ? toCss(style.background) : undefined,
    '--rd-spine-ink': style ? toCss(style.ink) : undefined,
  } as CSSProperties;

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: positions the hover card; the spine itself is a button
    <div
      ref={slot}
      className={`rd-spine-slot ${lying ? 'is-lying' : ''} ${missing ? 'is-missing' : ''}`}
      data-align={align}
      style={lying ? { marginLeft: pileNudge(doc.id) + 8 } : undefined}
      onPointerEnter={place}
      onFocus={place}
    >
      <button
        type="button"
        className={`rd-spine ${style ? `is-ink-${style.tone}` : 'is-loading'}`}
        style={spineStyle}
        onClick={onOpen}
        aria-disabled={missing || undefined}
        aria-label={`Open ${doc.title}, ${progress.opened ? `${progress.percent}% read` : 'not started'}${missing ? ', file missing from folder' : ''}`}
      >
        <span className="rd-spine__band rd-spine__band--start" aria-hidden="true" />
        <span className="rd-spine__title">{doc.title}</span>
        <span className="rd-spine__band rd-spine__band--end" aria-hidden="true" />
        {inProgress && !missing && <span className="rd-spine__ribbon" aria-hidden="true" />}
        {progress.opened && !lying && (
          <span
            className="rd-spine__notch"
            aria-hidden="true"
            style={{ top: `${12 + progress.percent * 0.76}%` }}
          />
        )}
      </button>
      <div className="rd-spine-card">
        <BookCover doc={doc} className="rd-spine-card__cover" />
        <div className="rd-spine-card__body">
          <p className="rd-spine-card__title">{doc.title}</p>
          {missing ? (
            <p className="rd-spine-card__where rd-row__missing">
              <FileX aria-hidden="true" />
              File missing from folder
            </p>
          ) : (
            <p className="rd-spine-card__where">
              {progress.sectionTitle ??
                progress.chapterTitle ??
                (progress.opened
                  ? `Page ${progress.page} of ${progress.pageCount}`
                  : 'Up next — not started')}
            </p>
          )}
          <ChapterBar progress={progress} size="sm" />
          <p className="rd-spine-card__meta">
            {progress.opened
              ? `${progress.percent}% · p. ${progress.page} of ${progress.pageCount}`
              : `${progress.pageCount} pages`}
          </p>
          <div className="rd-spine-card__actions">
            <button
              type="button"
              className="btn btn--primary btn--sm"
              tabIndex={-1}
              onClick={onOpen}
              aria-disabled={missing || undefined}
            >
              {progress.opened ? 'Open' : 'Start'}
            </button>
            <BookMenu doc={doc} onRemove={onRemove} />
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Books as spines standing on shelves: as thick as the book, coloured like its
 * cover, with a ribbon in the ones you're reading. Unread books wait in a pile.
 */
export function ShelfView({
  entries,
  onOpen,
  onRemove,
}: {
  entries: DeskEntry[];
  onOpen(doc: LibraryDocument): void;
  onRemove(doc: LibraryDocument, opener: HTMLButtonElement | null): void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const [available, setAvailable] = useState(0);
  const { standing, pile } = useMemo(
    () => ({
      standing: entries.filter((e) => isOpened(e.doc, e.reading)),
      pile: entries.filter((e) => !isOpened(e.doc, e.reading)),
    }),
    [entries],
  );
  const widths = useMemo(() => {
    const spines = standing.map((e) => spineWidth(e.doc.pageCount));
    if (!pile.length) return spines;
    const longest = Math.max(...pile.map((e) => spineHeight(e.doc.id)));
    return [...spines, Math.round(longest * PILE_SCALE) + PILE_SPACE];
  }, [standing, pile]);

  useLayoutEffect(() => {
    const el = container.current;
    if (!el) return;
    const measure = () => setAvailable(el.clientWidth - SHELF_PADDING * 2 - BOOKEND - GAP);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const rows = available > 0 ? layoutShelves(widths, available, GAP) : [widths.map((_, i) => i)];
  const spine = (entry: DeskEntry, lying = false) => (
    <Spine
      key={entry.doc.id}
      entry={entry}
      lying={lying}
      onOpen={() => onOpen(entry.doc)}
      onRemove={(opener) => onRemove(entry.doc, opener)}
    />
  );

  return (
    <div className="rd-shelves" ref={container}>
      {rows.map((row) => (
        <div className="rd-shelf" key={row.join('-')}>
          <div className="rd-shelf__books">
            {row.map((i) =>
              i < standing.length ? (
                spine(standing[i])
              ) : (
                <div className="rd-pile" key="pile" role="group" aria-label="Up next">
                  {[...pile].reverse().map((entry) => spine(entry, true))}
                </div>
              ),
            )}
            <span className="rd-shelf__bookend" aria-hidden="true" />
          </div>
          <div className="rd-shelf__board" aria-hidden="true" />
        </div>
      ))}
    </div>
  );
}
