import { describe, expect, it } from 'vitest';
import type { OutlineItem } from '@/lib/types';
import {
  contrastRatio,
  hslToRgb,
  INK_DARK,
  INK_LIGHT,
  legibleSpine,
  pickInk,
  representativeColour,
  rgbToHsl,
} from './colour';
import { buildMeta, chapterLevel, chapterSegments, sectionAt, segmentIndexAt } from './deskMeta';
import {
  describeDay,
  formatDuration,
  heatmapDayCount,
  intensityLevel,
  intensityThresholds,
  longestStreak,
  monthLabels,
  weekSummary,
} from './heatmap';
import { bookProgress, segmentFill } from './progress';
import { layoutShelves, spineHeight, spineWidth } from './shelf';

const item = (title: string, page: number | null, children: OutlineItem[] = []): OutlineItem => ({
  title,
  location: page === null ? null : { page, offset: 0 },
  children,
});

const OUTLINE = [
  item('Chapter 1: Kinematics', 3, [
    item('1.1 Position', 3),
    item('1.2 Velocity', 6),
    item('1.3 Acceleration', 9),
  ]),
  item("Chapter 2: Newton's Laws", 11, [item('2.1 Inertia', 11), item('2.2 The Second Law', 14)]),
  item('Chapter 3: Energy', 19),
  item('Appendix A', 35),
];

describe('colour', () => {
  it('round-trips HSL', () => {
    const rgb = { r: 150, g: 45, b: 34 };
    const back = hslToRgb(rgbToHsl(rgb));
    expect(Math.abs(back.r - rgb.r)).toBeLessThanOrEqual(1);
    expect(Math.abs(back.g - rgb.g)).toBeLessThanOrEqual(1);
    expect(Math.abs(back.b - rgb.b)).toBeLessThanOrEqual(1);
  });

  it('computes WCAG contrast', () => {
    expect(contrastRatio({ r: 0, g: 0, b: 0 }, { r: 255, g: 255, b: 255 })).toBeCloseTo(21, 0);
    expect(contrastRatio(INK_DARK, INK_DARK)).toBe(1);
  });

  it('picks the ink that contrasts more', () => {
    expect(pickInk({ r: 30, g: 40, b: 80 }).tone).toBe('light');
    expect(pickInk({ r: 235, g: 225, b: 200 }).tone).toBe('dark');
  });

  it('prefers the colourful pixels of a cover over its white page', () => {
    const pixels: number[] = [];
    for (let i = 0; i < 70; i++) pixels.push(255, 255, 255, 255);
    for (let i = 0; i < 30; i++) pixels.push(40, 80, 160, 255);
    const colour = representativeColour(pixels);
    expect(colour.b).toBeGreaterThan(colour.r + 60);
  });

  it('turns a plain white page into a warm parchment spine', () => {
    const pixels = Array.from({ length: 40 }, () => [252, 252, 250, 255]).flat();
    const spine = legibleSpine(representativeColour(pixels));
    const hsl = rgbToHsl(spine.background);
    expect(hsl.h).toBeGreaterThan(20);
    expect(hsl.h).toBeLessThan(50);
    expect(spine.tone).toBe('dark');
  });

  it('always yields legible spine ink', () => {
    const samples = [
      { r: 128, g: 128, b: 128 },
      { r: 210, g: 160, b: 80 },
      { r: 140, g: 40, b: 30 },
      { r: 20, g: 120, b: 90 },
      { r: 250, g: 240, b: 120 },
      { r: 0, g: 0, b: 0 },
    ];
    for (const sample of samples) {
      const spine = legibleSpine(sample);
      expect(spine.contrast).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(spine.background, spine.tone === 'light' ? INK_LIGHT : INK_DARK)).toBeCloseTo(
        spine.contrast,
        5,
      );
    }
  });
});

describe('desk metadata', () => {
  it('uses the top outline level as chapters', () => {
    expect(chapterLevel(OUTLINE).map((c) => c.page)).toEqual([3, 11, 19, 35]);
  });

  it('looks inside a single wrapper entry', () => {
    const wrapped = [item('The Book', 1, OUTLINE)];
    expect(chapterLevel(wrapped).map((c) => c.title)[0]).toBe('Chapter 1: Kinematics');
  });

  it('names the deepest section at a page', () => {
    const meta = buildMeta(OUTLINE, 36);
    expect(sectionAt(meta.sections, 15)?.title).toBe('2.2 The Second Law');
    expect(sectionAt(meta.sections, 3)?.title).toBe('1.1 Position');
    expect(sectionAt(meta.sections, 1)).toBeNull();
  });

  it('splits the book into chapter segments with front matter', () => {
    const segments = chapterSegments(chapterLevel(OUTLINE), 36);
    expect(segments.map((s) => [s.start, s.end])).toEqual([
      [1, 2],
      [3, 10],
      [11, 18],
      [19, 34],
      [35, 36],
    ]);
    expect(segments[0].front).toBe(true);
    expect(segmentIndexAt(segments, 14)).toBe(2);
    expect(segmentIndexAt(segments, 1)).toBe(0);
  });

  it('falls back to one segment without chapters', () => {
    expect(chapterSegments([], 100)).toEqual([{ title: '', start: 1, end: 100, front: false }]);
    expect(chapterSegments([], 0)).toEqual([]);
  });
});

describe('book progress', () => {
  const meta = buildMeta(OUTLINE, 36);

  it('describes the current chapter and section', () => {
    const progress = bookProgress(
      { pageCount: 36, lastOpenedAt: 2, addedAt: 1 },
      { location: { page: 15, offset: 0 } },
      meta,
    );
    expect(progress.chapterTitle).toBe("Chapter 2: Newton's Laws");
    expect(progress.chapterNumber).toBe(2);
    expect(progress.chapterCount).toBe(4);
    expect(progress.sectionTitle).toBe('2.2 The Second Law');
    expect(progress.chapterPagesLeft).toBe(4);
    expect(progress.opened).toBe(true);
    expect(progress.finished).toBe(false);
  });

  it('fills chapters before the current one', () => {
    const progress = bookProgress(
      { pageCount: 36, lastOpenedAt: 2, addedAt: 1 },
      { location: { page: 15, offset: 0 } },
      meta,
    );
    const fills = progress.segments.map((s) => segmentFill(s, progress.position));
    expect(fills[0]).toBe(1);
    expect(fills[1]).toBe(1);
    expect(fills[2]).toBeCloseTo(4 / 8);
    expect(fills[3]).toBe(0);
  });

  it('works without metadata', () => {
    const progress = bookProgress({ pageCount: 200, lastOpenedAt: 1, addedAt: 1 }, undefined, null);
    expect(progress.hasChapters).toBe(false);
    expect(progress.chapterTitle).toBeNull();
    expect(progress.segments).toHaveLength(1);
    expect(progress.opened).toBe(false);
  });
});

describe('heatmap', () => {
  it('ends on today with whole Monday-first weeks', () => {
    const wednesday = new Date(2026, 9, 28);
    expect(heatmapDayCount(wednesday, 26)).toBe(25 * 7 + 3);
    const monday = new Date(2026, 9, 26);
    expect(heatmapDayCount(monday, 2)).toBe(8);
  });

  it('buckets reading into five intensity steps', () => {
    const thresholds = intensityThresholds([0, 60, 120, 180, 240, 300, 360, 420, 480]);
    expect(intensityLevel(0, thresholds)).toBe(0);
    expect(intensityLevel(60, thresholds)).toBe(1);
    expect(intensityLevel(480, thresholds)).toBe(4);
    const levels = [60, 120, 180, 240, 300, 360, 420, 480].map((s) => intensityLevel(s, thresholds));
    expect(new Set(levels)).toEqual(new Set([1, 2, 3, 4]));
  });

  it('uses a fixed scale with little data', () => {
    const thresholds = intensityThresholds([0, 300]);
    expect(intensityLevel(5 * 60, thresholds)).toBe(1);
    expect(intensityLevel(20 * 60, thresholds)).toBe(2);
    expect(intensityLevel(90 * 60, thresholds)).toBe(4);
  });

  it('labels months at their first week', () => {
    const days = Array.from({ length: 70 }, (_, i) => {
      const d = new Date(2026, 8, 7 + i);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      return { date: key, seconds: 0, pages: 0 };
    });
    const labels = monthLabels(days);
    expect(labels.length).toBeGreaterThanOrEqual(2);
    expect(labels[0].column).toBeLessThan(labels[1].column);
  });

  it('describes a day for the tooltip', () => {
    expect(describeDay({ date: '2026-10-14', seconds: 23 * 60, pages: 12 })).toBe(
      'Wed 14 Oct · 23 min · 12 pages',
    );
    expect(describeDay({ date: '2026-10-14', seconds: 0, pages: 0 })).toBe('Wed 14 Oct · No reading');
  });

  it('formats durations', () => {
    expect(formatDuration(18 * 60)).toBe('18 min');
    expect(formatDuration(134 * 60)).toBe('2 h 14 min');
    expect(formatDuration(120 * 60)).toBe('2 h');
  });

  it('sums this week from Monday', () => {
    const log = {
      days: {
        '2026-10-26': { a: { seconds: 600, pages: [1, 2, 3] } },
        '2026-10-28': { a: { seconds: 300, pages: [4] }, b: { seconds: 60, pages: [9] } },
        '2026-10-25': { a: { seconds: 999, pages: [7] } },
      },
    };
    const week = weekSummary(log, new Date(2026, 9, 28));
    expect(week.seconds).toBe(960);
    expect(week.pages).toBe(5);
    expect(week.days[2].today).toBe(true);
    expect(week.days[3].future).toBe(true);
  });

  it('finds the longest streak', () => {
    const s = (seconds: number) => ({ date: '', seconds, pages: 0 });
    expect(longestStreak([s(1), s(1), s(0), s(5), s(5), s(5), s(0)])).toBe(3);
  });
});

describe('shelf', () => {
  it('scales spine width with page count, clamped', () => {
    expect(spineWidth(10)).toBe(26);
    expect(spineWidth(400)).toBeGreaterThan(spineWidth(100));
    expect(spineWidth(5000)).toBe(64);
  });

  it('gives each book a stable height', () => {
    expect(spineHeight('abc')).toBe(spineHeight('abc'));
    expect(spineHeight('abc')).toBeGreaterThanOrEqual(188);
    expect(spineHeight('abc')).toBeLessThanOrEqual(232);
  });

  it('wraps spines onto shelves', () => {
    expect(layoutShelves([30, 30, 30, 30], 100, 4)).toEqual([[0, 1, 2], [3]]);
    expect(layoutShelves([200], 100, 4)).toEqual([[0]]);
  });
});
