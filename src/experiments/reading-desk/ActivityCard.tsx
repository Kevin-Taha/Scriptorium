import { type KeyboardEvent, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { CalendarDays } from 'lucide-react';
import type { DocId } from '@/lib/types';
import {
  clearReadingLog,
  currentStreak,
  dailyTotals,
  seedSampleActivity,
  useReadingLogStore,
} from '../shared/readingLog';
import {
  describeDay,
  formatDayLabel,
  formatDuration,
  hasAnyActivity,
  heatmapDayCount,
  intensityLevel,
  intensityThresholds,
  longestStreak,
  monthLabels,
  parseDateKey,
  weekSummary,
} from './heatmap';

const WEEKS = 26;
/** Below this many reading days the calendar still offers sample activity, for demos. */
const SPARSE_DAYS = 4;
const SEEDED_KEY = 'scriptorium.exp.reading-desk.sampleSeeded';
const WEEKDAYS = ['Mon', '', 'Wed', '', 'Fri', '', ''];
const WEEK_INITIALS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

function readSeeded(): boolean {
  try {
    return localStorage.getItem(SEEDED_KEY) === '1';
  } catch {
    return false;
  }
}

function writeSeeded(on: boolean): void {
  try {
    if (on) localStorage.setItem(SEEDED_KEY, '1');
    else localStorage.removeItem(SEEDED_KEY);
  } catch {
    // Private mode: the flag only lasts this session.
  }
}

function streakNote(streak: number, readToday: boolean): string {
  if (streak === 0) return 'A few pages today starts a new streak.';
  if (!readToday) return 'Read a little today to keep it going.';
  if (streak === 1) return 'You’ve read today. A good start.';
  return 'You’ve read today. Nicely kept.';
}

/** Reading streak, a 26-week calendar of reading days, and this week at a glance. */
export function ActivityCard({ books }: { books: { id: DocId; pageCount: number }[] }) {
  const log = useReadingLogStore((s) => s.log);
  const [seeded, setSeeded] = useState(readSeeded);
  const [active, setActive] = useState<number | null>(null);
  const grid = useRef<HTMLDivElement>(null);
  const calendar = useRef<HTMLDivElement>(null);

  // On narrow screens the calendar scrolls sideways; start at today, not six months ago.
  useLayoutEffect(() => {
    const el = calendar.current;
    if (el && el.scrollWidth > el.clientWidth) el.scrollLeft = el.scrollWidth;
  }, []);

  const today = new Date();
  const todayKey = today.toDateString();
  const data = useMemo(() => {
    const now = new Date();
    const totals = dailyTotals(log, heatmapDayCount(now, WEEKS), now);
    const thresholds = intensityThresholds(totals.map((d) => d.seconds));
    return {
      totals,
      levels: totals.map((d) => intensityLevel(d.seconds, thresholds)),
      months: monthLabels(totals),
      streak: currentStreak(log, now),
      longest: longestStreak(dailyTotals(log, 400, now)),
      week: weekSummary(log, now),
      readingDays: totals.filter((d) => d.seconds > 0).length,
      any: hasAnyActivity(log),
    };
  }, [log, todayKey]);

  const { totals, levels, months, streak, longest, week, readingDays, any } = data;
  const readToday = totals[totals.length - 1]?.seconds > 0;
  const weekMax = Math.max(30 * 60, ...week.days.map((d) => d.seconds));

  const fill = () => {
    seedSampleActivity(books);
    writeSeeded(true);
    setSeeded(true);
  };
  const clear = () => {
    clearReadingLog();
    writeSeeded(false);
    setSeeded(false);
    setActive(null);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const steps: Record<string, number> = { ArrowLeft: -7, ArrowRight: 7, ArrowUp: -1, ArrowDown: 1 };
    const last = totals.length - 1;
    if (event.key in steps) {
      event.preventDefault();
      setActive((current) => Math.min(last, Math.max(0, (current ?? last) + steps[event.key])));
    } else if (event.key === 'Home') {
      event.preventDefault();
      setActive(0);
    } else if (event.key === 'End') {
      event.preventDefault();
      setActive(last);
    } else if (event.key === 'Escape' && active !== null) {
      setActive(null);
    }
  };

  const activeCell =
    active !== null ? (grid.current?.children[active] as HTMLElement | undefined) : undefined;
  const firstDate = totals.length ? parseDateKey(totals[0].date) : today;

  return (
    <section className="rd-activity" aria-labelledby="rd-activity-heading">
      <div className="library__section-heading">
        <h2 id="rd-activity-heading">Your reading</h2>
        <span>LAST 6 MONTHS</span>
      </div>
      <div className="card rd-activity__card">
        <div className="rd-streak">
          <p className="rd-stat-label">
            <CalendarDays aria-hidden="true" />
            Reading streak
          </p>
          <p className="rd-streak__value">
            <span className="rd-streak__number">{streak}</span>
            <span className="rd-streak__unit">{streak === 1 ? 'day' : 'days'}</span>
          </p>
          <p className="rd-streak__note">{streakNote(streak, readToday)}</p>
          {longest > 1 && (
            <p className="rd-streak__best">
              {longest === streak ? 'Your longest run yet' : `Longest run: ${longest} days`}
            </p>
          )}
        </div>

        <div className={`rd-heatmap ${any ? '' : 'is-empty'}`} ref={calendar}>
          <div className="rd-heatmap__months" aria-hidden="true">
            {months.map((month) => (
              <span key={`${month.column}-${month.label}`} style={{ gridColumnStart: month.column + 1 }}>
                {month.label}
              </span>
            ))}
          </div>
          <div className="rd-heatmap__weekdays" aria-hidden="true">
            {WEEKDAYS.map((day, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: fixed weekday rows
              <span key={i}>{day}</span>
            ))}
          </div>
          <div
            ref={grid}
            className="rd-heatmap__grid"
            role="group"
            // biome-ignore lint/a11y/noNoninteractiveTabindex: arrow keys move through the days; each is described in the live region
            tabIndex={0}
            aria-label={`Reading calendar since ${firstDate.toLocaleDateString(undefined, { day: 'numeric', month: 'long' })}: ${readingDays} reading days. Use the arrow keys to read each day.`}
            onKeyDown={onKeyDown}
            onBlur={() => setActive(null)}
            onPointerMove={(event) => {
              const index = (event.target as HTMLElement).dataset?.index;
              if (index !== undefined) setActive(Number(index));
            }}
            onPointerLeave={() => setActive(null)}
          >
            {totals.map((day, i) => (
              <span
                key={day.date}
                className={`rd-heatmap__cell ${i === active ? 'is-active' : ''}`}
                data-level={levels[i]}
                data-index={i}
              />
            ))}
          </div>
          {activeCell && active !== null && (
            <span
              className="rd-heatmap__tooltip"
              aria-hidden="true"
              style={{
                left: activeCell.offsetLeft + activeCell.offsetWidth / 2,
                top: activeCell.offsetTop,
              }}
            >
              {describeDay(totals[active])}
            </span>
          )}
          <span className="visually-hidden" aria-live="polite">
            {active !== null ? describeDay(totals[active]) : ''}
          </span>
          <div className="rd-heatmap__footer">
            <span className="rd-heatmap__summary">
              {any ? `${readingDays} reading ${readingDays === 1 ? 'day' : 'days'}` : ''}
              {seeded && any && (
                <>
                  <span aria-hidden="true"> · </span>
                  <span>sample activity</span>
                  <button type="button" className="rd-text-button rd-text-button--quiet" onClick={clear}>
                    Clear
                  </button>
                </>
              )}
              {!seeded && any && readingDays < SPARSE_DAYS && (
                <>
                  <span aria-hidden="true"> · </span>
                  <button type="button" className="rd-text-button rd-text-button--quiet" onClick={fill}>
                    Fill with sample activity
                  </button>
                </>
              )}
            </span>
            <span className="rd-heatmap__legend" aria-hidden="true">
              Less
              {[0, 1, 2, 3, 4].map((level) => (
                <span key={level} className="rd-heatmap__cell" data-level={level} />
              ))}
              More
            </span>
          </div>
          {!any && (
            <div className="rd-heatmap__empty">
              <p>Your calendar fills in as you read — a square for every day you open a book.</p>
              <button type="button" className="rd-text-button" onClick={fill}>
                Fill with sample activity
              </button>
            </div>
          )}
        </div>

        <div className="rd-week">
          <p className="rd-stat-label">This week</p>
          <div className="rd-week__stats">
            <p>
              <strong>{formatDuration(week.seconds)}</strong>
              <span>reading</span>
            </p>
            <p>
              <strong>{week.pages}</strong>
              <span>{week.pages === 1 ? 'page' : 'pages'}</span>
            </p>
          </div>
          <ol className="rd-week__bars" aria-label="Minutes read each day this week">
            {week.days.map((day, i) => (
              <li
                key={day.date}
                className={`rd-week__day ${day.today ? 'is-today' : ''} ${day.future ? 'is-future' : ''}`}
                aria-label={`${formatDayLabel(day.date)}: ${day.future ? 'still to come' : day.seconds > 0 ? formatDuration(day.seconds) : 'no reading'}`}
              >
                <span className="rd-week__track">
                  <span
                    className="rd-week__fill"
                    style={{ height: `${day.seconds > 0 ? Math.max(8, (day.seconds / weekMax) * 100) : 0}%` }}
                  />
                </span>
                <span className="rd-week__initial" aria-hidden="true">
                  {WEEK_INITIALS[i]}
                </span>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}
