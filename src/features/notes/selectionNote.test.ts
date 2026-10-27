import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useReaderStore } from '../reader/readerStore';
import { useNotesStore } from './notesStore';
import { addNoteFromSelection, MAX_QUOTE_LENGTH, normalizeQuote, readPageSelection } from './selectionNote';

describe('normalizeQuote', () => {
  it('collapses whitespace and line breaks and trims', () => {
    expect(normalizeQuote('  The  scribe\n bent\tover\r\n the   vellum  ')).toBe(
      'The scribe bent over the vellum',
    );
  });

  it('returns an empty string for whitespace only', () => {
    expect(normalizeQuote(' \n\t ')).toBe('');
  });

  it('leaves text at the limit untouched', () => {
    const text = 'a'.repeat(MAX_QUOTE_LENGTH);
    expect(normalizeQuote(text)).toBe(text);
  });

  it('caps long text with an ellipsis within the limit', () => {
    const quote = normalizeQuote('word '.repeat(400));
    expect(quote.length).toBeLessThanOrEqual(MAX_QUOTE_LENGTH);
    expect(quote.endsWith('…')).toBe(true);
    expect(quote.endsWith(' …')).toBe(false);
  });
});

/** jsdom has no layout: give ranges deterministic line rectangles. */
function rect(top: number, left: number, width: number, height: number): DOMRect {
  return {
    top,
    left,
    width,
    height,
    right: left + width,
    bottom: top + height,
    x: left,
    y: top,
    toJSON: () => ({}),
  };
}

function mockRangeRects(rects: DOMRect[]) {
  Range.prototype.getClientRects = () => rects as unknown as DOMRectList;
  Range.prototype.getBoundingClientRect = () => rects[0] ?? rect(0, 0, 0, 0);
}

function buildPages() {
  document.body.innerHTML = `
    <div class="page-sheet" data-page="7"><div class="textLayer"><span id="a">Margins were not empty</span><span id="b">space but a second page</span></div></div>
    <div class="page-sheet" data-page="8"><div class="textLayer"><span id="c">Another page entirely</span></div></div>
    <div class="page-margin">margin text</div>`;
  const sheet = document.querySelector<HTMLElement>('.page-sheet[data-page="7"]')!;
  sheet.getBoundingClientRect = () => rect(100, 50, 600, 800);
  const text = (id: string) => document.getElementById(id)!.firstChild!;
  return { text };
}

function select(start: Node, startOffset: number, end: Node, endOffset: number) {
  const range = document.createRange();
  range.setStart(start, startOffset);
  range.setEnd(end, endOffset);
  const selection = window.getSelection()!;
  selection.removeAllRanges();
  selection.addRange(range);
}

describe('readPageSelection', () => {
  beforeEach(() => {
    window.getSelection()?.removeAllRanges();
  });

  it('is null without a selection', () => {
    buildPages();
    expect(readPageSelection()).toBeNull();
  });

  it('describes a selection inside one page sheet', () => {
    const { text } = buildPages();
    mockRangeRects([rect(300, 70, 120, 20), rect(322, 70, 90, 20)]);
    select(text('a'), 0, text('b'), 5);

    const result = readPageSelection()!;
    expect(result.page).toBe(7);
    expect(result.quote).toBe('Margins were not emptyspace');
    // Centre of the first line (310) relative to the sheet's top (100) and height (800).
    expect(result.y).toBeCloseTo((310 - 100) / 800);
    expect(result.endRect.top).toBe(322);
    expect(result.multiline).toBe(true);
  });

  it('reports single-line selections as such', () => {
    const { text } = buildPages();
    mockRangeRects([rect(300, 70, 120, 20)]);
    select(text('a'), 0, text('a'), 7);
    expect(readPageSelection()!.multiline).toBe(false);
  });

  it('returns merged highlight rectangles as fractions of the page, without container rects', () => {
    const { text } = buildPages();
    mockRangeRects([
      rect(300, 70, 100, 20),
      rect(301, 172, 100, 19),
      rect(322, 70, 90, 20),
      rect(100, 50, 600, 800), // end-of-content sentinel
    ]);
    select(text('a'), 0, text('b'), 5);

    expect(readPageSelection()!.rects).toEqual([
      { x: 0.03333, y: 0.25, w: 0.33667, h: 0.025 },
      { x: 0.03333, y: 0.2775, w: 0.15, h: 0.025 },
    ]);
  });

  it('keeps more of a long passage for a highlight than for a quote', () => {
    const { text } = buildPages();
    text('a').textContent = 'word '.repeat(300);
    mockRangeRects([rect(300, 70, 120, 20)]);
    const node = document.getElementById('a')!.firstChild!;
    select(node, 0, node, node.textContent!.length);

    const selection = readPageSelection()!;
    expect(selection.quote.length).toBeLessThanOrEqual(600);
    expect(selection.text.length).toBeGreaterThan(600);
    expect(selection.text.length).toBeLessThanOrEqual(2000);
  });

  it('ignores container-sized rectangles such as the pdf.js end-of-content sentinel', () => {
    const { text } = buildPages();
    mockRangeRects([rect(300, 70, 120, 20), rect(100, 50, 600, 800)]);
    select(text('a'), 0, text('a'), 7);
    const result = readPageSelection()!;
    expect(result.endRect.height).toBe(20);
    expect(result.multiline).toBe(false);
  });

  it('is null when the selection spans two pages', () => {
    const { text } = buildPages();
    mockRangeRects([rect(300, 70, 120, 20)]);
    select(text('a'), 0, text('c'), 4);
    expect(readPageSelection()).toBeNull();
  });

  it('is null for selections outside any page sheet', () => {
    buildPages();
    mockRangeRects([rect(300, 70, 120, 20)]);
    const margin = document.querySelector('.page-margin')!.firstChild!;
    select(margin, 0, margin, 6);
    expect(readPageSelection()).toBeNull();
  });

  it('is null for a collapsed selection', () => {
    const { text } = buildPages();
    select(text('a'), 3, text('a'), 3);
    expect(readPageSelection()).toBeNull();
  });
});

describe('addNoteFromSelection', () => {
  beforeEach(() => {
    window.getSelection()?.removeAllRanges();
    useReaderStore.setState({ docId: null, status: 'idle' });
    useNotesStore.setState({ docId: 'doc', notes: [], editingId: null });
  });

  afterEach(() => {
    useNotesStore.setState({ docId: null, notes: [], editingId: null });
  });

  it('returns false and creates nothing without a page selection', () => {
    buildPages();
    expect(addNoteFromSelection()).toBe(false);
    expect(useNotesStore.getState().notes).toHaveLength(0);
  });

  it('creates a quoted note on the selected page, clears the selection and starts editing', () => {
    const { text } = buildPages();
    mockRangeRects([rect(300, 70, 120, 20)]);
    select(text('b'), 0, text('b'), 11);

    expect(addNoteFromSelection()).toBe(true);
    const { notes, editingId } = useNotesStore.getState();
    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatchObject({ page: 7, quote: 'space but a' });
    expect(notes[0].y).toBeCloseTo(0.26);
    expect(editingId).toBe(notes[0].id);
    expect(window.getSelection()!.toString()).toBe('');
  });

  it('returns false when no document is open', () => {
    const { text } = buildPages();
    mockRangeRects([rect(300, 70, 120, 20)]);
    select(text('a'), 0, text('a'), 7);
    useNotesStore.setState({ docId: null });
    expect(addNoteFromSelection()).toBe(false);
  });
});
