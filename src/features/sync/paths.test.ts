import { describe, expect, it } from 'vitest';
import {
  baseName,
  bookFileName,
  bookIdFromFileName,
  isDeviceDirectoryName,
  isPdfFileName,
  joinPath,
  shouldScanDirectory,
  titleFromFileName,
} from './paths';

const ID = 'ab'.repeat(32);

describe('folder paths', () => {
  it('scans ordinary folders but skips hidden, system and tooling folders', () => {
    for (const name of ['Physics', 'Year 2', 'notes_2024']) expect(shouldScanDirectory(name)).toBe(true);
    for (const name of [
      '.scriptorium',
      '.git',
      'node_modules',
      '__MACOSX',
      '$RECYCLE.BIN',
      '~tmp',
      '@eaDir',
    ]) {
      expect(shouldScanDirectory(name)).toBe(false);
    }
  });

  it('recognises PDFs in any case, but not hidden or temporary files', () => {
    expect(isPdfFileName('Mechanics.pdf')).toBe(true);
    expect(isPdfFileName('SCAN.PDF')).toBe(true);
    expect(isPdfFileName('Notes.Pdf')).toBe(true);
    expect(isPdfFileName('._Mechanics.pdf')).toBe(false);
    expect(isPdfFileName('~$draft.pdf')).toBe(false);
    expect(isPdfFileName('Mechanics.pdf.crswap')).toBe(false);
    expect(isPdfFileName('pdf')).toBe(false);
  });

  it('joins and splits relative paths', () => {
    expect(joinPath('', 'Book.pdf')).toBe('Book.pdf');
    expect(joinPath('Physics/Year 1', 'Book.pdf')).toBe('Physics/Year 1/Book.pdf');
    expect(baseName('Physics/Year 1/Book.pdf')).toBe('Book.pdf');
    expect(baseName('Book.pdf')).toBe('Book.pdf');
  });

  it('derives a provisional title from the file name', () => {
    expect(titleFromFileName('classical_mechanics-3rd-ed.PDF')).toBe('classical mechanics 3rd ed');
    expect(titleFromFileName('.pdf')).toBe('Untitled');
  });

  it('names book files after the book id and reads only well-formed names back', () => {
    expect(bookFileName(ID)).toBe(`${ID}.json`);
    expect(bookIdFromFileName(`${ID}.json`)).toBe(ID);
    expect(bookIdFromFileName(`${ID}.json.crswap`)).toBeNull();
    expect(bookIdFromFileName('README.txt')).toBeNull();
    expect(bookIdFromFileName(`${ID.toUpperCase()}.json`)).toBeNull();
    expect(bookIdFromFileName('abc.json')).toBeNull();
  });

  it('accepts device folder names that look like ids', () => {
    expect(isDeviceDirectoryName('6f1c2a7e-3b9d-4c1e-9a55-0d6b8f1e2c3a')).toBe(true);
    expect(isDeviceDirectoryName('.DS_Store')).toBe(false);
    expect(isDeviceDirectoryName('')).toBe(false);
    expect(isDeviceDirectoryName('a/b')).toBe(false);
  });
});
