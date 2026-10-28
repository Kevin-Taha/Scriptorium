import { useEffect } from 'react';
import { create } from 'zustand';
import { useReaderStore } from '@/features/reader/readerStore';
import type { DocId } from '@/lib/types';
import { debounce } from '@/lib/util';

/**
 * Local reading-activity log shared by experiments (chapter time-left, the
 * reading desk). Kept in localStorage — prototype data, not synced or backed up.
 *
 * `days["2026-10-27"]["<docId>"] = { seconds, pages }`: active reading time and
 * the distinct pages seen that day.
 */
export interface DayActivity {
  seconds: number;
  pages: number[];
}

export interface ReadingLog {
  days: Record<string, Record<DocId, DayActivity>>;
}

export interface DayTotal {
  date: string;
  seconds: number;
  pages: number;
}

const STORAGE_KEY = 'scriptorium.experiments.readingLog';
/** Seconds of active reading credited per tick. */
const TICK_SECONDS = 5;
/** Reading stops counting after this long without scrolling, keys or pointer movement. */
const IDLE_AFTER_MS = 90_000;
/** Assumed pace before we've seen the reader read anything. */
export const DEFAULT_SECONDS_PER_PAGE = 90;

function load(): ReadingLog {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as ReadingLog) : null;
    return parsed?.days ? parsed : { days: {} };
  } catch {
    return { days: {} };
  }
}

export const useReadingLogStore = create<{ log: ReadingLog }>()(() => ({ log: load() }));

const save = debounce(() => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(useReadingLogStore.getState().log));
  } catch {
    // Storage full or unavailable: the log is best-effort.
  }
}, 1000);

/** `YYYY-MM-DD` in local time. */
export function localDateKey(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Credits `seconds` of reading on `page` of `docId` to today. */
export function recordActivity(docId: DocId, page: number, seconds: number, date = new Date()): void {
  const key = localDateKey(date);
  const { log } = useReadingLogStore.getState();
  const day = log.days[key] ?? {};
  const entry = day[docId] ?? { seconds: 0, pages: [] };
  const pages = entry.pages.includes(page) ? entry.pages : [...entry.pages, page];
  if (seconds === 0 && pages === entry.pages) return;
  const next: ReadingLog = {
    days: { ...log.days, [key]: { ...day, [docId]: { seconds: entry.seconds + seconds, pages } } },
  };
  useReadingLogStore.setState({ log: next });
  save();
}

/** Average active seconds per distinct page for a book (or across all books). */
export function secondsPerPage(log: ReadingLog, docId?: DocId): number {
  let seconds = 0;
  let pages = 0;
  for (const day of Object.values(log.days)) {
    for (const [id, entry] of Object.entries(day)) {
      if (docId && id !== docId) continue;
      seconds += entry.seconds;
      pages += entry.pages.length;
    }
  }
  // Needs a little evidence before it replaces the default pace.
  if (pages < 3 || seconds < 60) return DEFAULT_SECONDS_PER_PAGE;
  return Math.min(600, Math.max(15, seconds / pages));
}

/** One entry per day for the last `count` days, oldest first (zeros included). */
export function dailyTotals(log: ReadingLog, count = 7 * 26, today = new Date()): DayTotal[] {
  const out: DayTotal[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const date = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i);
    const key = localDateKey(date);
    const day = log.days[key] ?? {};
    let seconds = 0;
    let pages = 0;
    for (const entry of Object.values(day)) {
      seconds += entry.seconds;
      pages += entry.pages.length;
    }
    out.push({ date: key, seconds, pages });
  }
  return out;
}

/** Consecutive days with any reading, ending today (or yesterday, if today is still empty). */
export function currentStreak(log: ReadingLog, today = new Date()): number {
  const totals = dailyTotals(log, 400, today);
  let i = totals.length - 1;
  if (totals[i].seconds === 0) i--;
  let streak = 0;
  while (i >= 0 && totals[i].seconds > 0) {
    streak++;
    i--;
  }
  return streak;
}

/** Fills the last ~4 months with plausible reading so the visuals can be reviewed. */
export function seedSampleActivity(docs: { id: DocId; pageCount: number }[]): void {
  if (!docs.length) return;
  const today = new Date();
  const days: ReadingLog['days'] = { ...useReadingLogStore.getState().log.days };
  let seed = 7;
  const random = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  for (let i = 120; i >= 0; i--) {
    const recent = i < 9; // guarantee a streak ending today
    if (!recent && random() < 0.35) continue;
    const date = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i);
    const doc = docs[Math.floor(random() * docs.length)];
    const pageCount = Math.max(1, doc.pageCount);
    const count = 2 + Math.floor(random() * 14);
    const start = 1 + Math.floor(random() * Math.max(1, pageCount - count));
    const pages = Array.from({ length: Math.min(count, pageCount) }, (_, k) => start + k);
    days[localDateKey(date)] = {
      ...days[localDateKey(date)],
      [doc.id]: { seconds: pages.length * (45 + Math.floor(random() * 90)), pages },
    };
  }
  useReadingLogStore.setState({ log: { days } });
  save();
  save.flush();
}

export function clearReadingLog(): void {
  useReadingLogStore.setState({ log: { days: {} } });
  save();
  save.flush();
}

/**
 * Mounted in the reader while any book is open: credits active reading time to
 * the page at the top of the viewport. Pauses when the tab is hidden or the
 * reader has been idle for a while.
 */
export function ReadingActivityTracker() {
  useEffect(() => {
    let lastInput = Date.now();
    const onInput = () => {
      lastInput = Date.now();
    };
    const events = ['wheel', 'keydown', 'pointermove', 'pointerdown', 'scroll', 'touchstart'] as const;
    for (const type of events) window.addEventListener(type, onInput, { passive: true, capture: true });

    const stopPage = useReaderStore.subscribe((state, prev) => {
      if (state.status !== 'ready' || !state.docId) return;
      if (state.location.page !== prev.location.page) recordActivity(state.docId, state.location.page, 0);
    });

    const timer = window.setInterval(() => {
      const { docId, status, location } = useReaderStore.getState();
      if (!docId || status !== 'ready') return;
      if (document.visibilityState !== 'visible') return;
      if (Date.now() - lastInput > IDLE_AFTER_MS) return;
      recordActivity(docId, location.page, TICK_SECONDS);
    }, TICK_SECONDS * 1000);

    return () => {
      for (const type of events) window.removeEventListener(type, onInput, { capture: true });
      stopPage();
      window.clearInterval(timer);
      save.flush();
    };
  }, []);
  return null;
}
