import { describe, expect, it } from 'vitest';
import type { MarginNote, OutlineItem } from '@/lib/types';
import {
  describeNoteCount,
  escapeMarkdownInline,
  exportFileName,
  exportableNotes,
  notesToMarkdown,
  sanitizeFileName,
} from './exportMarkdown';

let sequence = 0;
function note(overrides: Partial<MarginNote> = {}): MarginNote {
  sequence += 1;
  return {
    id: `n${sequence}`,
    docId: 'doc',
    page: 1,
    y: 0.5,
    text: 'A note',
    color: 'amber',
    createdAt: sequence,
    updatedAt: sequence,
    ...overrides,
  };
}

const outline: OutlineItem[] = [
  {
    title: 'Chapter 3: Kinematics',
    location: { page: 30, offset: 0 },
    children: [{ title: '3.2 Velocity', location: { page: 37, offset: 0 }, children: [] }],
  },
];

const exportedAt = new Date(2026, 9, 26, 12, 0, 0);

describe('notesToMarkdown', () => {
  it('renders the title, export line and one section per page', () => {
    const markdown = notesToMarkdown({
      title: 'Physics',
      exportedAt,
      notes: [note({ page: 4, text: 'First' }), note({ page: 9, text: 'Second' })],
    });

    expect(markdown).toBe(
      [
        '# Notes — Physics',
        '',
        '_Exported from Scriptorium on October 26, 2026 · 2 notes on 2 pages_',
        '',
        '## Page 4',
        '',
        'First',
        '',
        '---',
        '',
        '## Page 9',
        '',
        'Second',
        '',
      ].join('\n'),
    );
  });

  it('orders pages ascending and notes by anchor, then creation time', () => {
    const markdown = notesToMarkdown({
      title: 'Book',
      exportedAt,
      notes: [
        note({ page: 12, y: 0.8, text: 'late on 12' }),
        note({ page: 3, y: 0.9, text: 'low on 3' }),
        note({ page: 12, y: 0.1, text: 'early on 12' }),
        note({ page: 3, y: 0.2, text: 'high on 3' }),
        note({ page: 3, y: 0.2, text: 'tie, created later', createdAt: 999 }),
      ],
    });

    const order = ['high on 3', 'tie, created later', 'low on 3', 'early on 12', 'late on 12'];
    const positions = order.map((text) => markdown.indexOf(text));
    expect(positions.every((p) => p > 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
    expect(markdown.indexOf('## Page 3')).toBeLessThan(markdown.indexOf('## Page 12'));
  });

  it('adds the outline section to page headings', () => {
    const markdown = notesToMarkdown({
      title: 'Physics',
      outline,
      exportedAt,
      notes: [note({ page: 2 }), note({ page: 37 }), note({ page: 33 })],
    });

    expect(markdown).toContain('## Page 2\n');
    expect(markdown).toContain('## Page 33 · Chapter 3: Kinematics\n');
    expect(markdown).toContain('## Page 37 · 3.2 Velocity\n');
  });

  it('prefixes every line of a quote, including blank ones, with a blockquote marker', () => {
    const markdown = notesToMarkdown({
      title: 'Book',
      exportedAt,
      notes: [note({ quote: 'Line one\nLine two\r\n\r\nAfter a gap', text: 'My take' })],
    });

    expect(markdown).toContain('> Line one\n> Line two\n>\n> After a gap\n\nMy take\n');
  });

  it('renders a quote-only note and a text-only note', () => {
    const markdown = notesToMarkdown({
      title: 'Book',
      exportedAt,
      notes: [note({ y: 0.1, quote: 'Just a quote', text: '' }), note({ y: 0.2, text: 'Just text' })],
    });

    expect(markdown).toContain('## Page 1\n\n> Just a quote\n\nJust text\n');
  });

  it('skips notes with neither text nor quote and omits pages left empty', () => {
    const markdown = notesToMarkdown({
      title: 'Book',
      exportedAt,
      notes: [
        note({ page: 1, text: '   \n ' }),
        note({ page: 2, text: '', quote: '  ' }),
        note({ page: 3, text: 'Kept' }),
      ],
    });

    expect(markdown).toContain('1 note on 1 page');
    expect(markdown).toContain('## Page 3');
    expect(markdown).not.toContain('## Page 1');
    expect(markdown).not.toContain('## Page 2');
  });

  it('preserves paragraphs in note text', () => {
    const markdown = notesToMarkdown({
      title: 'Book',
      exportedAt,
      notes: [note({ text: '\n  First paragraph.\r\n\r\nSecond paragraph.\nSame paragraph.  \n' })],
    });

    expect(markdown).toContain('First paragraph.\n\nSecond paragraph.\nSame paragraph.\n');
  });

  it('keeps note text from introducing headings or rules', () => {
    const markdown = notesToMarkdown({
      title: 'Book',
      exportedAt,
      notes: [note({ text: '# Heading\nCaption\n---\n===\nhash #tag and ## inline' })],
    });

    expect(markdown).toContain('\\# Heading\nCaption\n\\---\n\\===\nhash #tag and ## inline\n');
  });

  it('escapes Markdown characters in titles and section names', () => {
    const markdown = notesToMarkdown({
      title: '*C# & [Rust]*: <Systems> `Programming` _2nd_ ed.  \n#',
      outline: [{ title: 'Part_1 *intro*', location: { page: 1, offset: 0 }, children: [] }],
      exportedAt,
      notes: [note({ page: 1 })],
    });

    expect(markdown.split('\n')[0]).toBe(
      '# Notes — \\*C# & \\[Rust\\]\\*: \\<Systems\\> \\`Programming\\` \\_2nd\\_ ed. \\#',
    );
    expect(markdown).toContain('## Page 1 · Part\\_1 \\*intro\\*\n');
  });

  it('falls back to "Untitled" and handles an empty export', () => {
    const markdown = notesToMarkdown({ title: '   ', notes: [], exportedAt });

    expect(markdown).toBe(
      '# Notes — Untitled\n\n_Exported from Scriptorium on October 26, 2026 · 0 notes on 0 pages_\n',
    );
  });

  it('accepts a timestamp for the export date', () => {
    const markdown = notesToMarkdown({ title: 'Book', notes: [], exportedAt: exportedAt.getTime() });
    expect(markdown).toContain('on October 26, 2026');
  });

  it('counts exported notes and pages in the summary line', () => {
    const markdown = notesToMarkdown({
      title: 'Book',
      exportedAt,
      notes: [note({ page: 1 }), note({ page: 1 }), note({ page: 8 })],
    });
    expect(markdown).toContain('· 3 notes on 2 pages_');
  });
});

describe('exportableNotes', () => {
  it('keeps notes with text or a quote', () => {
    const notes = [note({ text: '' }), note({ text: 'x' }), note({ text: ' ', quote: 'q' })];
    expect(exportableNotes(notes).map((n) => n.id)).toEqual([notes[1].id, notes[2].id]);
  });
});

describe('describeNoteCount', () => {
  it('pluralizes notes and pages independently', () => {
    expect(describeNoteCount(1, 1)).toBe('1 note on 1 page');
    expect(describeNoteCount(42, 17)).toBe('42 notes on 17 pages');
    expect(describeNoteCount(2, 1)).toBe('2 notes on 1 page');
  });
});

describe('escapeMarkdownInline', () => {
  it('collapses whitespace and leaves plain text alone', () => {
    expect(escapeMarkdownInline('  Chapter 3:\n Kinematics ')).toBe('Chapter 3: Kinematics');
    expect(escapeMarkdownInline('C# in Depth')).toBe('C# in Depth');
  });
});

describe('sanitizeFileName', () => {
  it('replaces characters that are invalid in file names', () => {
    expect(sanitizeFileName('Physics: Forces/Motion? <2nd> "ed" | a*b\\c')).toBe(
      'Physics Forces Motion 2nd ed a b c',
    );
  });

  it('removes control characters, leading dots and trailing dots or spaces', () => {
    expect(sanitizeFileName('\u0007..hidden book. . ')).toBe('hidden book');
  });

  it('truncates long names without splitting characters', () => {
    const name = sanitizeFileName('📚'.repeat(300));
    expect(Array.from(name)).toHaveLength(100);
  });

  it('returns an empty string for names with no usable characters', () => {
    expect(sanitizeFileName(' ?*: ')).toBe('');
  });
});

describe('exportFileName', () => {
  it('uses "{title} — Notes.md"', () => {
    expect(exportFileName('Physics: Forces')).toBe('Physics Forces — Notes.md');
  });

  it('falls back when the title is unusable', () => {
    expect(exportFileName('???')).toBe('Untitled — Notes.md');
  });
});
