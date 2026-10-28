import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowUpRight, GraduationCap, RotateCcw, X } from 'lucide-react';
import { navigate, useRoute } from '@/app/router';
import { usePagesInverted } from '@/app/settingsStore';
import { useHistoryStore } from '@/features/navigation/historyStore';
import { formatPageRef } from '@/features/navigation/pageLabels';
import { useHighlightsStore } from '@/features/notes/highlightsStore';
import { useNotesStore } from '@/features/notes/notesStore';
import { useReaderStore } from '@/features/reader/readerStore';
import { sectionForPage } from '@/lib/pdf/outline';
import { isEditableTarget } from '@/lib/util';
import { EXPERIMENT_EVENTS, emitExperimentEvent, useExperimentEvent } from '../shared/events';
import type { ExperimentModule } from '../types';
import { generateCards, type Flashcard } from './cards';
import { dueCount, formatInterval, gradeCard, previewIntervals, sessionCards, type Grade } from './schedule';
import { useFlashcardStore } from './store';
import './flashcards.css';

const GRADES: { value: Grade; label: string }[] = [
  { value: 1, label: 'Again' },
  { value: 2, label: 'Hard' },
  { value: 3, label: 'Good' },
  { value: 4, label: 'Easy' },
];

function useDeck() {
  const docId = useReaderStore((s) => s.docId);
  const notesId = useNotesStore((s) => s.docId);
  const notes = useNotesStore((s) => s.notes);
  const highlightsId = useHighlightsStore((s) => s.docId);
  const highlights = useHighlightsStore((s) => s.highlights);
  const storedId = useFlashcardStore((s) => s.docId);
  const schedules = useFlashcardStore((s) => s.schedules);
  const cards = useMemo(
    () => generateCards(notesId === docId ? notes : [], highlightsId === docId ? highlights : []),
    [docId, notesId, notes, highlightsId, highlights],
  );
  return { docId, cards, schedules: storedId === docId ? schedules : {} };
}

function useDueCount() {
  const { cards, schedules } = useDeck();
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 15_000);
    return () => window.clearInterval(timer);
  }, []);
  return dueCount(cards, schedules, now);
}

function openStudy() {
  emitExperimentEvent(EXPERIMENT_EVENTS.studyFlashcards);
}

function ReaderButton() {
  const count = useDueCount();
  const label = `Study flashcards (${count} due)`;
  return (
    <button
      type="button"
      className="btn btn--ghost btn--icon tooltip tooltip--below flashcards-toolbar-button"
      data-tooltip={label}
      aria-label={label}
      onClick={openStudy}
    >
      <GraduationCap />
      {count > 0 && (
        <span className="flashcards-toolbar-badge" aria-hidden="true">
          {count}
        </span>
      )}
    </button>
  );
}

function ReviewButton() {
  const count = useDueCount();
  return (
    <button
      type="button"
      className="btn flashcards-review-button"
      aria-label={`Study (${count} due)`}
      onClick={openStudy}
    >
      <GraduationCap /> Study{' '}
      <span className="flashcards-review-badge" aria-hidden="true">
        {count}
      </span>
    </button>
  );
}

interface Session {
  docId: string;
  queue: Flashcard[];
  index: number;
  flipped: boolean;
  good: number;
}

function nextDueText(
  cards: Flashcard[],
  schedules: ReturnType<typeof useFlashcardStore.getState>['schedules'],
  now: number,
) {
  const dates = cards
    .map((card) => schedules[card.id]?.due)
    .filter((due): due is number => due !== undefined);
  if (cards.some((card) => !schedules[card.id] || schedules[card.id].due <= now)) return 'more cards due now';
  if (!dates.length) return 'no cards scheduled';
  const next = dates.reduce((earliest, due) => Math.min(earliest, due), Number.POSITIVE_INFINITY);
  const diff = next - now;
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (new Date(next).toDateString() === tomorrow.toDateString()) return 'next due tomorrow';
  return `next due in ${formatInterval(diff)}`;
}

function StudyApp() {
  const { docId, cards, schedules } = useDeck();
  const title = useReaderStore((s) => s.doc?.title) ?? 'Untitled';
  const outline = useReaderStore((s) => s.outline);
  const pageLabels = useReaderStore((s) => s.pageLabels);
  const inverted = usePagesInverted();
  const route = useRoute();
  const [session, setSession] = useState<Session | null>(null);
  const [now, setNow] = useState(Date.now);
  const isOpen = session !== null;
  const dialogRef = useRef<HTMLDialogElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    useFlashcardStore.getState().load(docId);
  }, [docId]);
  useEffect(() => {
    if (session && session.docId !== docId) setSession(null);
  }, [docId, session]);
  useEffect(() => {
    if (!isOpen) return;
    const timer = window.setInterval(() => setNow(Date.now()), 15_000);
    return () => window.clearInterval(timer);
  }, [isOpen]);

  const start = useCallback(() => {
    if (!docId || route.name === 'library') return;
    useFlashcardStore.getState().load(docId);
    setNow(Date.now());
    openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setSession({
      docId,
      queue: sessionCards(cards, useFlashcardStore.getState().schedules),
      index: 0,
      flipped: false,
      good: 0,
    });
  }, [cards, docId, route.name]);
  useExperimentEvent(EXPERIMENT_EVENTS.studyFlashcards, start);

  const close = useCallback(() => {
    setSession(null);
  }, []);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (session && !dialog.open) {
      dialog.showModal();
      dialog.focus();
    } else if (!session && dialog.open) {
      dialog.close();
      if (openerRef.current?.isConnected) openerRef.current.focus();
    }
  }, [session]);

  const card = session?.queue[session.index];
  const grade = useCallback(
    (value: Grade) => {
      if (!session || !card || !session.flipped) return;
      const store = useFlashcardStore.getState();
      store.save(session.docId, card.id, gradeCard(store.schedules[card.id], value));
      setSession((current) =>
        current && current.docId === session.docId && current.index === session.index
          ? {
              ...current,
              index: current.index + 1,
              flipped: false,
              good: current.good + (value >= 3 ? 1 : 0),
            }
          : current,
      );
    },
    [card, session],
  );

  useEffect(() => {
    if (!session) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing || event.ctrlKey || event.metaKey || event.altKey)
        return;
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        close();
        return;
      }
      if (isEditableTarget(event.target)) return;
      const target = event.target as HTMLElement | null;
      const isOtherButton = target?.closest('button') && !target.closest('.flashcards-card');
      if (card && !session.flipped && !isOtherButton && (event.key === ' ' || event.key === 'Enter')) {
        event.preventDefault();
        setSession((current) => current && { ...current, flipped: true });
      } else if (card && session.flipped && /^[1-4]$/.test(event.key)) {
        event.preventDefault();
        grade(Number(event.key) as Grade);
      }
      // The review's global keyboard shortcuts don't check for an open dialog.
      event.stopPropagation();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [card, close, grade, session]);

  const jumpToSource = () => {
    if (!card || !docId || (route.name !== 'reader' && route.name !== 'review')) return;
    close();
    if (route.name === 'review') navigate({ name: 'reader', docId });
    useHistoryStore.getState().jumpTo({ page: card.page, offset: Math.max(0, card.y - 0.15) });
  };
  const section = card ? sectionForPage(outline, card.page) : null;
  const previews = card ? previewIntervals(schedules[card.id]) : null;
  const hasCards = cards.length > 0;
  const remaining = sessionCards(cards, schedules, now).length;
  const completed = !!session && session.index >= session.queue.length && session.queue.length > 0;

  return (
    <dialog
      ref={dialogRef}
      className={`flashcards-dialog${inverted ? ' invert-pages' : ''}`}
      aria-labelledby="flashcards-title"
      tabIndex={-1}
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
    >
      {session && (
        <div className="flashcards-shell">
          <header className="flashcards-header">
            <h1 id="flashcards-title">
              Flashcards <span>· {title}</span>
            </h1>
            {card && (
              <div className="flashcards-progress-label">
                {session.index + 1} / {session.queue.length}
              </div>
            )}
            <button
              type="button"
              className="btn btn--ghost btn--icon"
              aria-label="Close flashcards"
              onClick={close}
            >
              <X />
            </button>
          </header>
          <div className="flashcards-progress" aria-hidden="true">
            <div
              style={{ width: `${session.queue.length ? (session.index / session.queue.length) * 100 : 0}%` }}
            />
          </div>
          <main className="flashcards-main">
            {card ? (
              <div className="flashcards-study">
                <p className="flashcards-eyebrow">
                  {session.flipped ? 'ANSWER' : 'QUESTION'} ·{' '}
                  {card.source === 'note' ? 'FROM YOUR NOTES' : 'FROM A HIGHLIGHT'}
                </p>
                <p className="visually-hidden" aria-live="polite">
                  {session.flipped ? `Answer: ${card.back}` : `Question: ${card.front}`}
                </p>
                <button
                  type="button"
                  className={`flashcards-card${session.flipped ? ' is-flipped' : ''}`}
                  onClick={() =>
                    setSession((current) => current && { ...current, flipped: !current.flipped })
                  }
                  aria-label={
                    session.flipped
                      ? `Answer: ${card.back}. Show question`
                      : `Question: ${card.front}. Reveal answer`
                  }
                >
                  <span className="flashcards-card__inner">
                    <span
                      className="flashcards-card__face flashcards-card__front"
                      aria-hidden={session.flipped}
                    >
                      <span className="flashcards-card__content">{card.front}</span>
                      <span className="flashcards-card__hint">SPACE TO REVEAL</span>
                    </span>
                    <span
                      className="flashcards-card__face flashcards-card__back"
                      aria-hidden={!session.flipped}
                    >
                      <span className="flashcards-card__content">{card.back}</span>
                      <span className="flashcards-card__hint">ANSWER</span>
                    </span>
                  </span>
                </button>
                <button type="button" className="flashcards-source" onClick={jumpToSource}>
                  <span className="flashcards-source__dot" data-note-color={card.color} />
                  From {formatPageRef(pageLabels, card.page)}
                  {section ? ` · ${section}` : ''} <ArrowUpRight />
                </button>
                {session.flipped ? (
                  <div className="flashcards-grades" role="group" aria-label="How well did you remember?">
                    <p>How well did you remember?</p>
                    <div className="flashcards-grades__buttons">
                      {GRADES.map(({ value, label }) => (
                        <button
                          key={value}
                          type="button"
                          className="flashcards-grade"
                          onClick={() => grade(value)}
                        >
                          <span>
                            <kbd>{value}</kbd> {label}
                          </span>
                          <small>{previews?.[value]}</small>
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <p className="flashcards-instruction">Take a moment to think, then reveal the answer.</p>
                )}
              </div>
            ) : (
              <div className="flashcards-empty">
                <div className="flashcards-empty__icon">{completed ? <GraduationCap /> : <RotateCcw />}</div>
                <p className="flashcards-eyebrow">{completed ? 'SESSION COMPLETE' : 'YOUR STUDY DESK'}</p>
                <h2>
                  {completed
                    ? 'A little practice goes a long way.'
                    : hasCards
                      ? 'All caught up.'
                      : 'Make your notes memorable.'}
                </h2>
                {completed ? (
                  <p>
                    {session.index} {session.index === 1 ? 'card' : 'cards'} reviewed · {session.good} good or
                    easy · {nextDueText(cards, schedules, now)}
                  </p>
                ) : hasCards ? (
                  <p>No cards are due right now · {nextDueText(cards, schedules, now)}.</p>
                ) : (
                  <p>
                    Write a note like <strong>Question :: Answer</strong>, or hide a term with{' '}
                    <strong>{'{{cloze}}'}</strong> — for example, “Force is measured in {'{{newtons}}'}.”
                    Highlights become cards automatically.
                  </p>
                )}
                <div className="flashcards-empty__actions">
                  {remaining > 0 && (
                    <button type="button" className="btn btn--primary" onClick={start}>
                      Study again
                    </button>
                  )}
                  <button type="button" className={`btn${remaining ? '' : ' btn--primary'}`} onClick={close}>
                    Done
                  </button>
                </div>
              </div>
            )}
          </main>
        </div>
      )}
    </dialog>
  );
}

const experiment: ExperimentModule = {
  App: StudyApp,
  ReaderToolbar: ReaderButton,
  ReviewToolbar: ReviewButton,
};
export default experiment;
