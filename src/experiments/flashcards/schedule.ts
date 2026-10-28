import type { Flashcard } from './cards';

export type Grade = 1 | 2 | 3 | 4;
export interface CardSchedule {
  due: number;
  interval: number;
  ease: number;
  learning: boolean;
}
export type Schedules = Record<string, CardSchedule>;

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

/** Intervals are in milliseconds; a missing schedule is a new card. */
export function gradeCard(state: CardSchedule | undefined, grade: Grade, now = Date.now()): CardSchedule {
  const ease = Math.max(
    1.3,
    Math.min(3.2, (state?.ease ?? 2.5) + (grade === 1 ? -0.2 : grade === 2 ? -0.15 : grade === 4 ? 0.15 : 0)),
  );
  let interval: number;
  let learning = false;
  if (grade === 1) {
    interval = MINUTE;
    learning = true;
  } else if (!state || state.learning) {
    interval = grade === 2 ? 10 * MINUTE : (grade === 3 ? 1 : 4) * DAY;
    learning = grade === 2;
  } else {
    const days = Math.max(1, state.interval / DAY);
    interval = Math.max(1, Math.round(days * (grade === 2 ? 1.2 : grade === 3 ? ease : ease * 1.3))) * DAY;
  }
  return { due: now + interval, interval, ease, learning };
}

export function formatInterval(milliseconds: number): string {
  if (milliseconds < MINUTE) return '<1m';
  if (milliseconds < 60 * MINUTE) return `${Math.round(milliseconds / MINUTE)}m`;
  if (milliseconds < DAY) return `${Math.round(milliseconds / (60 * MINUTE))}h`;
  return `${Math.round(milliseconds / DAY)}d`;
}

export function previewIntervals(state: CardSchedule | undefined): Record<Grade, string> {
  return {
    1: formatInterval(gradeCard(state, 1, 0).interval),
    2: formatInterval(gradeCard(state, 2, 0).interval),
    3: formatInterval(gradeCard(state, 3, 0).interval),
    4: formatInterval(gradeCard(state, 4, 0).interval),
  };
}

/** Due reviews first, followed by at most ten never-reviewed cards. */
export function sessionCards(
  cards: readonly Flashcard[],
  schedules: Schedules,
  now = Date.now(),
): Flashcard[] {
  const due = cards.filter((card) => schedules[card.id] && schedules[card.id].due <= now);
  due.sort((a, b) => schedules[a.id].due - schedules[b.id].due);
  const fresh = cards.filter((card) => !schedules[card.id]).slice(0, 10);
  return [...due, ...fresh];
}

export function dueCount(cards: readonly Flashcard[], schedules: Schedules, now = Date.now()): number {
  return cards.filter((card) => !schedules[card.id] || schedules[card.id].due <= now).length;
}
