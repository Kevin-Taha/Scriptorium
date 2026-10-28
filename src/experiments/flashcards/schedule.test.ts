import { describe, expect, it } from 'vitest';
import type { Flashcard } from './cards';
import { dueCount, gradeCard, previewIntervals, sessionCards, type CardSchedule } from './schedule';

const minute = 60_000;
const day = 24 * 60 * minute;
const card = (id: string): Flashcard => ({
  id,
  kind: 'qa',
  front: 'Q',
  back: 'A',
  page: 1,
  y: 0,
  color: 'amber',
  source: 'note',
});

describe('flashcard scheduling', () => {
  it('shows and applies learning and graduation steps', () => {
    expect(previewIntervals(undefined)).toEqual({ 1: '1m', 2: '10m', 3: '1d', 4: '4d' });
    const again = gradeCard(undefined, 1, 100);
    expect(again).toMatchObject({ due: 100 + minute, interval: minute, learning: true });
    const hard = gradeCard(again, 2, 100);
    expect(hard).toMatchObject({ interval: 10 * minute, learning: true });
    const good = gradeCard(hard, 3, 100);
    expect(good).toMatchObject({ interval: day, learning: false });
    expect(gradeCard(undefined, 4, 100).interval).toBe(4 * day);
  });

  it('grows review intervals with ease and resets lapses', () => {
    const prior: CardSchedule = { due: 0, interval: 4 * day, ease: 2.5, learning: false };
    expect(gradeCard(prior, 2, 0).interval).toBe(5 * day);
    expect(gradeCard(prior, 3, 0).interval).toBe(10 * day);
    expect(gradeCard(prior, 4, 0).interval).toBe(14 * day);
    expect(gradeCard(prior, 1, 0)).toMatchObject({ interval: minute, learning: true, ease: 2.3 });
    expect(gradeCard({ ...prior, ease: 1.3 }, 1, 0).ease).toBe(1.3);
  });

  it('orders due reviews before at most ten new cards and excludes future cards', () => {
    const cards = Array.from({ length: 14 }, (_, i) => card(String(i)));
    const state = (due: number): CardSchedule => ({ due, interval: day, ease: 2.5, learning: false });
    const schedules = { '0': state(50), '1': state(10), '2': state(200) };
    expect(sessionCards(cards, schedules, 100).map((c) => c.id)).toEqual([
      '1',
      '0',
      '3',
      '4',
      '5',
      '6',
      '7',
      '8',
      '9',
      '10',
      '11',
      '12',
    ]);
    expect(dueCount(cards, schedules, 100)).toBe(13);
    expect(sessionCards([card('0')], schedules, 1)).toEqual([]);
  });
});
