import { useEffect, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { create } from 'zustand';
import { navigate } from '@/app/router';
import { useHistoryStore } from '@/features/navigation/historyStore';
import { formatPageRef } from '@/features/navigation/pageLabels';
import { buildAnnotations } from '@/features/notes/annotations';
import { jumpToHighlight } from '@/features/notes/highlightActions';
import { useHighlightsStore } from '@/features/notes/highlightsStore';
import { useNoteFocusStore } from '@/features/notes/noteFocus';
import { useNotesStore } from '@/features/notes/notesStore';
import { useReaderStore } from '@/features/reader/readerStore';
import { sectionForPage } from '@/lib/pdf/outline';
import { getReadingState } from '@/lib/storage/repository';
import type { ReadingState } from '@/lib/types';
import { formatRelativeTime, isEditableTarget } from '@/lib/util';
import { buildChapterSpans, chapterProgress, findCurrentChapter } from '../chapter-progress/chapters';
import type { ExperimentModule } from '../types';
import './welcome-back.css';

// Prototype: show on every reopen. The production rule would use 12 * 60 * 60 * 1000.
const MIN_GAP_MS = 0;
const DISMISS_AFTER_MS = 20_000;

interface WelcomeState {
  docId: string | null;
  openPdf: object | null;
  captured: boolean;
  saved: ReadingState | null;
  visible: boolean;
}

const useWelcomeState = create<WelcomeState>()(() => ({
  docId: null,
  openPdf: null,
  captured: false,
  saved: null,
  visible: false,
}));

/** Capture saved state while opening, before the viewer can save its restored position. */
function WelcomeTracker() {
  useEffect(() => {
    let active = true;
    let generation = 0;
    let trackedId: string | null = null;
    const sync = () => {
      const { docId, status, pdf } = useReaderStore.getState();
      if (!docId || status === 'idle' || status === 'error') {
        generation++;
        trackedId = null;
        useWelcomeState.setState({
          docId: null,
          openPdf: null,
          captured: false,
          saved: null,
          visible: false,
        });
        return;
      }
      if (docId === trackedId) {
        if (status === 'ready' && pdf && useWelcomeState.getState().openPdf !== pdf) {
          useWelcomeState.setState({ openPdf: pdf });
        }
        return;
      }
      trackedId = docId;
      const previous = useWelcomeState.getState();
      if (
        status === 'ready' &&
        pdf &&
        previous.docId === docId &&
        previous.openPdf === pdf &&
        previous.captured
      ) {
        return;
      }
      const token = ++generation;
      const openedAt = Date.now();
      useWelcomeState.setState({ docId, openPdf: pdf, captured: false, saved: null, visible: false });
      void getReadingState(docId)
        .then((saved) => {
          if (!active || token !== generation || useReaderStore.getState().docId !== docId) return;
          if (saved && openedAt - saved.updatedAt >= MIN_GAP_MS) {
            useWelcomeState.setState({ docId, saved, visible: true, captured: true });
          } else useWelcomeState.setState({ captured: true });
        })
        .catch(() => {
          // A recap is optional when storage is unavailable.
          if (active && token === generation) useWelcomeState.setState({ captured: true });
        });
    };
    const unsubscribe = useReaderStore.subscribe(sync);
    sync();
    return () => {
      active = false;
      generation++;
      unsubscribe();
    };
  }, []);
  return null;
}

function dismiss() {
  useWelcomeState.setState({ visible: false });
}

function WelcomeCard() {
  const { docId, openPdf, saved, visible } = useWelcomeState();
  const activeDocId = useReaderStore((s) => s.docId);
  const outline = useReaderStore((s) => s.outline);
  const pdf = useReaderStore((s) => s.pdf);
  const labels = useReaderStore((s) => s.pageLabels);
  const notes = useNotesStore((s) => s.notes);
  const notesDocId = useNotesStore((s) => s.docId);
  const highlights = useHighlightsStore((s) => s.highlights);
  const highlightsDocId = useHighlightsStore((s) => s.docId);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const latest = useMemo(
    () =>
      buildAnnotations(notesDocId === docId ? notes : [], highlightsDocId === docId ? highlights : [])
        .sort((a, b) => {
          const aTime =
            a.kind === 'note'
              ? Math.max(a.note.updatedAt, a.highlight?.updatedAt ?? 0)
              : a.highlight.updatedAt;
          const bTime =
            b.kind === 'note'
              ? Math.max(b.note.updatedAt, b.highlight?.updatedAt ?? 0)
              : b.highlight.updatedAt;
          return bTime - aTime;
        })
        .slice(0, 3),
    [notes, notesDocId, highlights, highlightsDocId, docId],
  );

  useEffect(() => {
    if (!visible || hovered || focused) return;
    const timer = window.setTimeout(dismiss, DISMISS_AFTER_MS);
    return () => window.clearTimeout(timer);
  }, [visible, hovered, focused]);

  useEffect(() => {
    if (!visible) return;
    const onKey = (event: KeyboardEvent) => {
      if (
        event.key !== 'Escape' ||
        event.defaultPrevented ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        isEditableTarget(event.target) ||
        document.querySelector('dialog:modal')
      )
        return;
      event.preventDefault();
      dismiss();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    const viewport = document.querySelector<HTMLElement>('.reader__viewport');
    if (!viewport) return;
    let origin: number | null = null;
    const ready = window.setTimeout(() => {
      if (origin === null) origin = viewport.scrollTop;
    }, 500);
    const markUserScroll = () => {
      if (origin === null) origin = viewport.scrollTop;
    };
    const markKeyboardScroll = (event: KeyboardEvent) => {
      if (['ArrowDown', 'ArrowUp', 'PageDown', 'PageUp', 'Home', 'End', ' '].includes(event.key)) {
        markUserScroll();
      }
    };
    const onScroll = () => {
      if (origin === null) return;
      const { controller, location } = useReaderStore.getState();
      const pageHeight = controller?.getPageSize(location.page)?.height ?? viewport.clientHeight;
      if (Math.abs(viewport.scrollTop - origin) > pageHeight / 2) dismiss();
    };
    viewport.addEventListener('wheel', markUserScroll, { passive: true });
    viewport.addEventListener('touchstart', markUserScroll, { passive: true });
    viewport.addEventListener('keydown', markKeyboardScroll);
    viewport.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.clearTimeout(ready);
      viewport.removeEventListener('wheel', markUserScroll);
      viewport.removeEventListener('touchstart', markUserScroll);
      viewport.removeEventListener('keydown', markKeyboardScroll);
      viewport.removeEventListener('scroll', onScroll);
    };
  }, [visible]);

  if (!visible || !saved || !docId || docId !== activeDocId || !pdf || openPdf !== pdf) return null;
  const section = sectionForPage(outline, saved.location.page) ?? 'the beginning';
  const chapters = buildChapterSpans(outline, pdf.numPages);
  const chapter = findCurrentChapter(chapters, saved.location);
  const progress = chapter ? Math.round(chapterProgress(chapter, saved.location) * 100) : 0;

  return (
    <aside
      className="welcome-card"
      role="status"
      aria-live="polite"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocusCapture={() => setFocused(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false);
      }}
    >
      <button
        type="button"
        className="welcome-card__close btn btn--ghost btn--icon"
        aria-label="Dismiss welcome back"
        onClick={dismiss}
      >
        <X aria-hidden="true" />
      </button>
      <p className="welcome-card__eyebrow">Welcome back</p>
      <h2 className="welcome-card__heading">
        You were in <strong>{section}</strong>
      </h2>
      <p className="welcome-card__meta">
        {formatPageRef(labels, saved.location.page)} of {pdf.numPages} · last read{' '}
        {formatRelativeTime(saved.updatedAt)}
      </p>
      {chapter && (
        <div className="welcome-card__progress">
          <div className="welcome-card__progress-label">
            <span>{chapter.title}</span>
            <span>{progress}% read</span>
          </div>
          <div
            className="welcome-card__track"
            role="progressbar"
            aria-label={`${chapter.title} progress`}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progress}
          >
            <div className="welcome-card__fill" style={{ width: `${progress}%` }} />
          </div>
        </div>
      )}
      <div className="welcome-card__notes">
        <h3>Your latest notes</h3>
        {latest.length === 0 ? (
          <p className="welcome-card__empty">No notes yet.</p>
        ) : (
          latest.map((item) => {
            const color = item.kind === 'note' ? item.note.color : item.highlight.color;
            const excerpt =
              item.kind === 'note'
                ? item.note.text || item.note.quote || 'Untitled note'
                : item.highlight.text;
            return (
              <button
                type="button"
                className="welcome-card__note"
                key={`${item.kind}-${item.id}`}
                onClick={() => {
                  dismiss();
                  if (item.kind === 'highlight') jumpToHighlight(item.highlight);
                  else {
                    useHistoryStore
                      .getState()
                      .jumpTo({ page: item.page, offset: Math.max(0, item.y - 0.15) });
                    useNoteFocusStore.getState().pulseNote(item.id);
                  }
                }}
              >
                <span className="welcome-card__dot" data-note-color={color} />
                <span className="welcome-card__excerpt">{excerpt}</span>
                <span className="welcome-card__page">{formatPageRef(labels, item.page)}</span>
              </button>
            );
          })
        )}
      </div>
      <div className="welcome-card__actions">
        <button
          type="button"
          className="btn btn--primary btn--sm"
          onClick={() => {
            dismiss();
            document.querySelector<HTMLElement>('.reader__viewport')?.focus();
          }}
        >
          Continue reading
        </button>
        <button
          type="button"
          className="btn btn--ghost btn--sm"
          onClick={() => {
            dismiss();
            navigate({ name: 'review', docId });
          }}
        >
          Review notes
        </button>
      </div>
    </aside>
  );
}

const experiment: ExperimentModule = { App: WelcomeTracker, Reader: WelcomeCard };
export default experiment;
