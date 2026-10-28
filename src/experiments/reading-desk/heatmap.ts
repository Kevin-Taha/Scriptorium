import type { DayTotal, ReadingLog } from '../shared/readingLog';

/** `YYYY-MM-DD` in local time (same keys as the shared reading log). */
export function localDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Monday-first weekday index (Mon 0 … Sun 6). */
export function weekdayIndex(date: Date): number {
  return (date.getDay() + 6) % 7;
}

/** Days to show so the calendar has `weeks` Monday-first columns, the last ending today. */
export function heatmapDayCount(today: Date, weeks = 26): number {
  return (weeks - 1) * 7 + weekdayIndex(today) + 1;
}

export function parseDateKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/**
 * Upper bounds (in seconds) for intensity levels 1–3; anything above the last is
 * level 4. Quartiles of the reading days so the scale fits the reader, with a
 * fixed scale until there are enough days to say anything.
 */
export function intensityThresholds(seconds: number[]): [number, number, number] {
  const active = seconds.filter((s) => s > 0).sort((a, b) => a - b);
  if (active.length < 6) return [10 * 60, 25 * 60, 45 * 60];
  const q = (p: number) => active[Math.min(active.length - 1, Math.floor(p * active.length))];
  const t1 = q(0.25);
  const t2 = Math.max(t1 + 1, q(0.5));
  const t3 = Math.max(t2 + 1, q(0.75));
  return [t1, t2, t3];
}

/** 0 = no reading, 1…4 = more reading. */
export function intensityLevel(seconds: number, thresholds: [number, number, number]): 0 | 1 | 2 | 3 | 4 {
  if (seconds <= 0) return 0;
  if (seconds <= thresholds[0]) return 1;
  if (seconds <= thresholds[1]) return 2;
  if (seconds <= thresholds[2]) return 3;
  return 4;
}

export interface MonthLabel {
  column: number;
  label: string;
}

/** A label for each month at the first week column that starts in it. */
export function monthLabels(totals: DayTotal[]): MonthLabel[] {
  const out: MonthLabel[] = [];
  let lastMonth = -1;
  if (!totals.length) return out;
  const first = parseDateKey(totals[0].date);
  const offset = weekdayIndex(first);
  totals.forEach((day, i) => {
    const date = parseDateKey(day.date);
    const column = Math.floor((i + offset) / 7);
    if (date.getMonth() !== lastMonth && date.getDate() <= 7) {
      // Skip a label squeezed into the first column when the next month starts right after it.
      if (!(out.length && out[out.length - 1].column === column)) {
        out.push({ column, label: date.toLocaleDateString(undefined, { month: 'short' }) });
      }
      lastMonth = date.getMonth();
    }
  });
  return out.filter((m, i) => i === out.length - 1 || out[i + 1].column - m.column >= 2);
}

export function formatDuration(seconds: number): string {
  if (seconds > 0 && seconds < 60) return '< 1 min';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} h ${rest} min` : `${hours} h`;
}

/** "Tue 14 Oct" */
export function formatDayLabel(key: string): string {
  const date = parseDateKey(key);
  const weekday = date.toLocaleDateString('en-GB', { weekday: 'short' });
  const month = date.toLocaleDateString('en-GB', { month: 'short' });
  return `${weekday} ${date.getDate()} ${month}`;
}

export function describeDay(day: DayTotal): string {
  if (day.seconds <= 0 && day.pages <= 0) return `${formatDayLabel(day.date)} · No reading`;
  return `${formatDayLabel(day.date)} · ${formatDuration(day.seconds)} · ${day.pages} ${day.pages === 1 ? 'page' : 'pages'}`;
}

export interface WeekSummary {
  seconds: number;
  pages: number;
  /** Monday-first, seven entries; `future` days haven't happened yet. */
  days: { date: string; seconds: number; future: boolean; today: boolean }[];
}

/** This calendar week (Monday to Sunday) so far. */
export function weekSummary(log: ReadingLog, today = new Date()): WeekSummary {
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate() - weekdayIndex(today));
  const todayKey = localDateKey(today);
  let seconds = 0;
  let pages = 0;
  const days: WeekSummary['days'] = [];
  for (let i = 0; i < 7; i++) {
    const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    const key = localDateKey(date);
    let daySeconds = 0;
    for (const entry of Object.values(log.days[key] ?? {})) {
      daySeconds += entry.seconds;
      pages += entry.pages.length;
    }
    seconds += daySeconds;
    days.push({ date: key, seconds: daySeconds, future: key > todayKey, today: key === todayKey });
  }
  return { seconds, pages, days };
}

/** Longest run of consecutive reading days in `totals`. */
export function longestStreak(totals: DayTotal[]): number {
  let best = 0;
  let run = 0;
  for (const day of totals) {
    run = day.seconds > 0 ? run + 1 : 0;
    best = Math.max(best, run);
  }
  return best;
}

/** Seconds spent in one book today. */
export function secondsToday(log: ReadingLog, docId: string, today = new Date()): number {
  return log.days[localDateKey(today)]?.[docId]?.seconds ?? 0;
}

export function hasAnyActivity(log: ReadingLog): boolean {
  return Object.values(log.days).some((day) => Object.values(day).some((e) => e.seconds > 0));
}
