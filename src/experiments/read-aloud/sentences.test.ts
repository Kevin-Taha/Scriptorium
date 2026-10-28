import { describe, expect, it } from 'vitest';
import { buildPageText, type PageBox, type PageText, type TextItemLike } from '@/features/search/pageText';
import {
  buildPageSentences,
  estimateDurationMs,
  firstSentenceAtOrAfter,
  sentenceAtOrAfterPoint,
  splitSentences,
  splitSentencesRegex,
  wordRangeAt,
} from './sentences';

const BOX: PageBox = { view: [0, 0, 612, 792], rotation: 0 };

function item(str: string, y: number, size = 11, x = 72): TextItemLike {
  return {
    str,
    transform: [size, 0, 0, size, x, y],
    width: str.length * size * 0.5,
    height: size,
    hasEOL: true,
  };
}

function page(...items: TextItemLike[]): PageText {
  return buildPageText(1, items, BOX);
}

const texts = (text: string) => splitSentences(text).map((r) => text.slice(r.start, r.end));

describe('splitSentences', () => {
  it('splits on sentence ends and trims', () => {
    expect(texts('  The ball falls. It speeds up!  Why does it? Because of gravity. ')).toEqual([
      'The ball falls.',
      'It speeds up!',
      'Why does it?',
      'Because of gravity.',
    ]);
  });

  it('keeps abbreviations, decimals and figure references inside their sentence', () => {
    expect(texts('Use g = 9.81 m/s2 here, e.g. on Earth. See Fig. 2 for more.')).toEqual([
      'Use g = 9.81 m/s2 here, e.g. on Earth.',
      'See Fig. 2 for more.',
    ]);
  });

  it('joins fragments with no words (bullets, numbering) to what follows', () => {
    expect(texts('1. The first law. 2. The second law.').length).toBeLessThanOrEqual(2);
    expect(texts('— Newton states the law.')).toEqual(['— Newton states the law.']);
  });

  it('cuts very long sentences at clause boundaries', () => {
    const clause = 'a body continues in uniform motion unless a force acts upon it';
    const long = `${Array.from({ length: 8 }, () => clause).join(', ')}.`;
    const parts = texts(long);
    expect(parts.length).toBeGreaterThan(1);
    for (const part of parts) expect(part.length).toBeLessThanOrEqual(260);
    expect(parts.join(' ').replace(/\s+/g, ' ')).toBe(long);
  });

  it('returns ranges as offsets into the original text, inside the given window', () => {
    const text = 'Skip this one. Read this. And this.';
    const ranges = splitSentences(text, 15);
    expect(ranges.map((r) => text.slice(r.start, r.end))).toEqual(['Read this.', 'And this.']);
  });

  it('has a regex fallback with the same behaviour on plain prose', () => {
    const text = 'It is 3.14 today. Is it? Yes!';
    const ranges = splitSentencesRegex(text).map((r) => text.slice(r.start, r.end).trim());
    expect(ranges).toEqual(['It is 3.14 today.', 'Is it?', 'Yes!']);
  });
});

describe('buildPageSentences', () => {
  it('returns sentences in reading order with rectangles that run top to bottom', () => {
    const sentences = buildPageSentences(
      page(
        item('The first sentence is here.', 700),
        item('The second sentence is here.', 686),
        item('The third sentence is here.', 672),
      ),
    );
    expect(sentences.map((s) => s.text)).toEqual([
      'The first sentence is here.',
      'The second sentence is here.',
      'The third sentence is here.',
    ]);
    const ys = sentences.map((s) => s.rects[0].y);
    expect(ys).toEqual([...ys].sort((a, b) => a - b));
    for (const s of sentences) {
      expect(s.rects).toHaveLength(1);
      expect(s.rects[0].width).toBeGreaterThan(0);
    }
  });

  it('gives a sentence that wraps over two lines one rectangle per line', () => {
    const sentences = buildPageSentences(
      page(item('A sentence that wraps over', 700), item('two lines of text.', 686)),
    );
    expect(sentences).toHaveLength(1);
    expect(sentences[0].text).toBe('A sentence that wraps over two lines of text.');
    expect(sentences[0].rects).toHaveLength(2);
  });

  it('drops the running header, footer and page number', () => {
    const sentences = buildPageSentences(
      page(
        item('Chapter 1: Kinematics', 751, 9),
        item('The velocity changes with time.', 700),
        item('So does the position.', 686),
        item('— 3 —', 38, 9, 290),
      ),
    );
    expect(sentences.map((s) => s.text)).toEqual([
      'The velocity changes with time.',
      'So does the position.',
    ]);
  });

  it('keeps real sentences that happen to sit near the page edge', () => {
    const sentences = buildPageSentences(
      page(item('A full sentence at the very top of the page.', 760), item('Another one follows.', 746)),
    );
    expect(sentences).toHaveLength(2);
  });

  it('separates an unpunctuated heading from the sentence below it', () => {
    const sentences = buildPageSentences(
      page(item('1.1 Position and velocity', 700, 17), item('Position is a vector.', 660)),
    );
    expect(sentences.map((s) => s.text)).toEqual(['1.1 Position and velocity', 'Position is a vector.']);
  });

  it('does not break a sentence for superscripts or paragraph-internal line changes', () => {
    const sentences = buildPageSentences(
      page(
        item('The energy is E = mc', 700),
        { ...item('2', 705, 7, 160), hasEOL: false },
        { ...item(' for any body at rest.', 700, 11, 168), hasEOL: true },
      ),
    );
    expect(sentences).toHaveLength(1);
  });

  it('returns nothing for a page without text', () => {
    expect(buildPageSentences(page())).toEqual([]);
  });
});

describe('locating a sentence', () => {
  const sentences = buildPageSentences(
    page(
      item('First sentence of the page.', 700),
      item('Second sentence of the page.', 650),
      item('Third sentence of the page.', 600),
    ),
  );

  it('finds the first sentence at or below a viewport offset', () => {
    expect(firstSentenceAtOrAfter(sentences, 0)).toBe(0);
    expect(firstSentenceAtOrAfter(sentences, sentences[1].rects[0].y)).toBe(1);
    expect(firstSentenceAtOrAfter(sentences, sentences[1].rects[0].y + 0.01)).toBe(2);
    expect(firstSentenceAtOrAfter(sentences, 0.99)).toBe(sentences.length);
  });

  it('finds the sentence containing a selection point, or the next one', () => {
    const second = sentences[1].rects[0];
    expect(sentenceAtOrAfterPoint(sentences, second.x + second.width / 2, second.y + second.height / 2)).toBe(
      1,
    );
    expect(sentenceAtOrAfterPoint(sentences, 0.5, second.y - 0.01)).toBe(1);
    expect(sentenceAtOrAfterPoint(sentences, 0.1, 0.99)).toBe(sentences.length);
  });
});

describe('word timing helpers', () => {
  it('estimates about 180 words per minute at 1× and scales with the rate', () => {
    const words = Array.from({ length: 18 }, () => 'word').join(' ');
    expect(estimateDurationMs(words, 1)).toBeCloseTo(6000, -2);
    expect(estimateDurationMs(words, 2)).toBeCloseTo(3000, -2);
    expect(estimateDurationMs('Hi.', 1)).toBe(700);
  });

  it('finds the word at a character index', () => {
    const text = 'Force equals mass, times acceleration.';
    expect(wordRangeAt(text, 0)).toEqual({ start: 0, end: 5 });
    expect(wordRangeAt(text, 13, 4)).toEqual({ start: 13, end: 17 });
    expect(wordRangeAt(text, 12)).toEqual({ start: 13, end: 17 });
    expect(wordRangeAt(text, 99)).toBeNull();
  });
});
