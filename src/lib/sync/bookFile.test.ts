import { describe, expect, it } from 'vitest';
import { BOOK_FILE_FORMAT, BOOK_FILE_VERSION, createBookFile, parseBookFile } from './bookFile';

const ID = 'a'.repeat(64);
const book = { id: ID, title: 'Physics', fileName: 'physics.pdf', pageCount: 36 };
const device = { id: 'dev-1', name: 'Edge on Windows' };

describe('book files', () => {
  it('round-trips through JSON', () => {
    const file = createBookFile(
      book,
      device,
      {
        notes: [
          { id: 'n1', docId: ID, page: 3, y: 0.4, text: 'Hi', color: 'sage', createdAt: 1, updatedAt: 2 },
        ],
        highlights: [
          {
            id: 'h1',
            docId: ID,
            page: 3,
            rects: [{ x: 0.1, y: 0.2, w: 0.3, h: 0.02 }],
            text: 'Force',
            color: 'rose',
            createdAt: 1,
            updatedAt: 1,
          },
        ],
        bookmarks: [{ id: 'b1', docId: ID, page: 4, label: 'Intro', createdAt: 1 }],
        tombstones: [{ id: 'n0', kind: 'note', docId: ID, deletedAt: 5 }],
        progress: {
          docId: ID,
          location: { page: 4, offset: 0.25 },
          zoom: { mode: 'custom', scale: 1.25 },
          updatedAt: 6,
          deviceId: 'dev-1',
        },
      },
      100,
    );
    const parsed = parseBookFile(JSON.parse(JSON.stringify(file)));
    expect(parsed).toEqual(JSON.parse(JSON.stringify(file)));
  });

  it('forces every record onto the file’s book', () => {
    const parsed = parseBookFile({
      format: BOOK_FILE_FORMAT,
      version: 1,
      book,
      device,
      data: {
        notes: [
          { id: 'n', docId: 'other', page: 1, y: 0, text: '', color: 'amber', createdAt: 0, updatedAt: 0 },
        ],
      },
    });
    expect(parsed?.data.notes[0].docId).toBe(ID);
  });

  it('drops malformed records and keeps the rest', () => {
    const parsed = parseBookFile({
      format: BOOK_FILE_FORMAT,
      version: 1,
      book,
      device,
      data: {
        notes: [
          { id: 'ok', page: 1, y: 0, text: 'x', color: 'amber', createdAt: 0, updatedAt: 0 },
          { id: 'bad-colour', page: 1, y: 0, text: 'x', color: 'chartreuse', createdAt: 0, updatedAt: 0 },
          { id: 'no-time', page: 1, y: 0, text: 'x', color: 'amber' },
          'nonsense',
        ],
        highlights: [
          { id: 'no-rects', page: 1, rects: [], text: 'x', color: 'sky', createdAt: 0, updatedAt: 0 },
        ],
        tombstones: [{ id: 't', kind: 'chapter', deletedAt: 1 }],
        progress: { location: { page: 'two' }, zoom: {}, updatedAt: 1 },
      },
    });
    expect(parsed?.data.notes.map((n) => n.id)).toEqual(['ok']);
    expect(parsed?.data.highlights).toEqual([]);
    expect(parsed?.data.tombstones).toEqual([]);
    expect(parsed?.data.progress).toBeUndefined();
  });

  it('rejects other formats, newer versions and invalid book ids', () => {
    expect(parseBookFile(null)).toBeNull();
    expect(parseBookFile({ format: 'something-else', version: 1, book, device })).toBeNull();
    expect(
      parseBookFile({ format: BOOK_FILE_FORMAT, version: BOOK_FILE_VERSION + 1, book, device }),
    ).toBeNull();
    expect(
      parseBookFile({ format: BOOK_FILE_FORMAT, version: 1, book: { ...book, id: '../evil' }, device }),
    ).toBeNull();
    expect(parseBookFile({ format: BOOK_FILE_FORMAT, version: 1, book })).toBeNull();
  });

  it('accepts the fallback hash ids used on insecure origins, but not empty ones', () => {
    const id = 'fnv-0123456789abcdef-1f4';
    expect(
      parseBookFile({ format: BOOK_FILE_FORMAT, version: 1, book: { ...book, id }, device })?.book.id,
    ).toBe(id);
    expect(
      parseBookFile({ format: BOOK_FILE_FORMAT, version: 1, book: { ...book, id: '' }, device }),
    ).toBeNull();
  });
});
