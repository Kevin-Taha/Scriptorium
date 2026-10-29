import type { LibraryDocument, ReadingState } from '@/lib/types';
import { BookCover } from './BookCard';
import { bookProgress } from './bookProgress';
import { formatOpened } from './libraryUtils';

/** The book you were last reading: where you are in it, and one button to carry on. */
export function NowReading({
  doc,
  reading,
  onContinue,
}: {
  doc: LibraryDocument;
  reading?: ReadingState;
  onContinue(): void;
}) {
  const { chapter, section, segments, page, percent } = bookProgress(doc, reading?.location);
  const stats = [
    chapter?.number != null && `Chapter ${chapter.number} of ${chapter.count}`,
    doc.pageCount > 0 ? `Page ${page} of ${doc.pageCount}` : `Page ${page}`,
    `${percent}%`,
  ];
  return (
    <div className="now-reading card">
      <BookCover doc={doc} className="now-reading__cover" />
      <div className="now-reading__body">
        <p className="now-reading__eyebrow">
          NOW READING <span>· {formatOpened(doc.lastOpenedAt)}</span>
        </p>
        <h3 className="now-reading__title">{doc.title}</h3>
        {chapter && (
          <p className="now-reading__where">{section ? `${chapter.title} / ${section}` : chapter.title}</p>
        )}
        <div className="now-reading__bar" aria-hidden="true">
          {segments.map(({ start, end, fill }) => (
            <span
              key={start}
              className={start <= page && page <= end ? 'is-current' : undefined}
              style={{ flexGrow: end - start + 1 }}
            >
              <span style={{ width: `${fill * 100}%` }} />
            </span>
          ))}
        </div>
        <p className="now-reading__stats">{stats.filter(Boolean).join(' · ')}</p>
      </div>
      <button type="button" className="btn btn--primary" onClick={onContinue}>
        Continue reading
      </button>
    </div>
  );
}
