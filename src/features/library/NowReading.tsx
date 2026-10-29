import { useMemo } from 'react';
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
  const progress = useMemo(() => bookProgress(doc, reading?.location), [doc, reading]);
  const { chapter, section } = progress;
  return (
    <div className="now-reading card">
      <button
        type="button"
        className="now-reading__cover"
        tabIndex={-1}
        aria-hidden="true"
        onClick={onContinue}
      >
        <BookCover doc={doc} />
      </button>
      <div className="now-reading__head">
        <p className="now-reading__eyebrow">
          <span>NOW READING</span>
          <span aria-hidden="true">·</span>
          <span className="now-reading__when">{formatOpened(doc.lastOpenedAt)}</span>
        </p>
        <h3 className="now-reading__title">{doc.title}</h3>
        {chapter && (
          <p className="now-reading__where">
            {chapter.title}
            {section && (
              <>
                {' '}
                <span className="now-reading__divider" aria-hidden="true">
                  /
                </span>{' '}
                <span className="now-reading__section">{section}</span>
              </>
            )}
          </p>
        )}
      </div>
      <div className="now-reading__progress">
        <div className="now-reading__bar" aria-hidden="true">
          {progress.segments.map((segment, index) => (
            <span
              key={segment.start}
              className={`now-reading__segment ${index === progress.current ? 'is-current' : ''}`}
              style={{ flexGrow: segment.end - segment.start + 1 }}
            >
              <span style={{ width: `${segment.fill * 100}%` }} />
            </span>
          ))}
        </div>
        <p className="now-reading__stats">
          {chapter?.number != null && (
            <span>
              Chapter {chapter.number} of {chapter.count}
            </span>
          )}
          <span>
            {doc.pageCount > 0 ? `Page ${progress.page} of ${doc.pageCount}` : `Page ${progress.page}`}
          </span>
          <span>
            {progress.percent}%<span className="visually-hidden"> read</span>
          </span>
        </p>
      </div>
      <button type="button" className="btn btn--primary now-reading__continue" onClick={onContinue}>
        Continue reading
      </button>
    </div>
  );
}
