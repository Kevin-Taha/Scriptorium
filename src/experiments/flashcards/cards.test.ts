import { describe, expect, it } from 'vitest';
import type { Highlight, MarginNote } from '@/lib/types';
import { generateCards } from './cards';

const note = (text: string, quote?: string): MarginNote => ({
  id: 'n1',
  docId: 'book',
  page: 4,
  y: 0.3,
  color: 'sage',
  text,
  quote,
  createdAt: 1,
  updatedAt: 1,
});
const highlight = (text: string): Highlight => ({
  id: 'h1',
  docId: 'book',
  page: 6,
  color: 'rose',
  text,
  rects: [{ x: 0.1, y: 0.2, w: 0.5, h: 0.04 }],
  createdAt: 1,
  updatedAt: 1,
});

describe('generateCards', () => {
  it('creates a Q/A at the first delimiter or from two labelled lines', () => {
    expect(generateCards([note(' What? :: the answer :: more ')], [])[0]).toMatchObject({
      front: 'What?',
      back: 'the answer :: more',
      page: 4,
      y: 0.3,
      color: 'sage',
      source: 'note',
      kind: 'qa',
    });
    expect(generateCards([note('Q: What moves?\nA: A body')], [])[0]).toMatchObject({
      front: 'What moves?',
      back: 'A body',
    });
  });

  it('recognises all clozes in note text or a quote, including numbered clozes', () => {
    const [card] = generateCards([note('The {{c1::newton}} measures {{force}}.')], []);
    expect(card).toMatchObject({
      kind: 'cloze',
      front: 'The [ … ] measures [ … ].',
      back: 'The newton measures force.',
    });
    expect(generateCards([note('My explanation', 'A {{vector}} has direction')], [])[0]).toMatchObject({
      front: 'A [ … ] has direction',
      back: 'A vector has direction',
    });
  });

  it('allows Q/A and cloze together without treating the cloze delimiter as Q/A', () => {
    expect(
      generateCards([note('{{c1::Force}} :: mass times acceleration')], [])
        .map((card) => card.kind)
        .sort(),
    ).toEqual(['cloze', 'qa']);
    expect(generateCards([note('A {{c1::vector}} has direction')], [])).toHaveLength(1);
  });

  it('uses quotes for explanation cards and ignores plain notes', () => {
    expect(generateCards([note('The reason', 'A passage')], [])[0]).toMatchObject({
      front: 'Explain in your own words:\nA passage',
      back: 'The reason',
      kind: 'explain',
    });
    expect(generateCards([note('A plain note'), note('', 'A passage')], [])).toEqual([]);
  });

  it('creates automatic highlight clozes, skips short or unhelpful passages and handles explicit syntax', () => {
    const [card] = generateCards([], [highlight('The acceleration of the body changes its motion.')]);
    expect(card).toMatchObject({
      source: 'highlight',
      kind: 'cloze',
      front: 'The [ … ] of the body changes its motion.',
      back: 'The acceleration of the body changes its motion.',
      page: 6,
      y: 0.22,
      color: 'rose',
    });
    expect(generateCards([], [highlight('A short phrase')])).toEqual([]);
    expect(generateCards([], [highlight('the cat sat down')])[0]).toMatchObject({
      front: 'the cat sat [ … ]',
      back: 'the cat sat down',
    });
    expect(generateCards([], [highlight('The {{c2::mass}} is constant.')])[0]).toMatchObject({
      front: 'The [ … ] is constant.',
      back: 'The mass is constant.',
    });
  });

  it('prefers repeated or capitalised candidates and remains stable until content changes', () => {
    const passage = 'Momentum changes, and momentum determines the longer acceleration.';
    expect(generateCards([], [highlight(passage)])[0].front).toContain('[ … ] changes');
    const original = generateCards([note('Q :: A')], [])[0];
    expect(generateCards([{ ...note('Q :: A'), y: 0.8, color: 'sky' }], [])[0].id).toBe(original.id);
    expect(generateCards([note('Q :: B')], [])[0].id).not.toBe(original.id);
    expect(original.id).toMatch(/^n1:qa:/);
  });
});
