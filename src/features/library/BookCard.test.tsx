import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { LibraryDocument } from '@/lib/types';
import { BookCard, isMissingFromFolder } from './BookCard';

afterEach(cleanup);

const doc = (overrides: Partial<LibraryDocument> = {}): LibraryDocument => ({
  id: 'a'.repeat(64),
  title: 'Classical Mechanics',
  fileName: 'mechanics.pdf',
  fileSize: 1,
  pageCount: 100,
  addedAt: 0,
  lastOpenedAt: Date.now() - 2 * 3600_000,
  ...overrides,
});

const renderCard = (document: LibraryDocument, onOpen = vi.fn(), onRemove = vi.fn()) => {
  render(<BookCard doc={document} onOpen={onOpen} onRemove={onRemove} />);
  return { onOpen, onRemove };
};

describe('BookCard', () => {
  it('lets an imported book be removed from the library', () => {
    const { onRemove } = renderCard(doc());
    fireEvent.click(screen.getByRole('button', { name: 'More options for Classical Mechanics' }));
    fireEvent.click(screen.getByRole('button', { name: 'Remove from library…' }));
    expect(onRemove).toHaveBeenCalledTimes(1);
    expect(screen.queryByTitle(/\.pdf$/)).toBeNull();
  });

  it('marks a folder book with its relative path', () => {
    renderCard(doc({ source: { kind: 'folder', path: 'Physics/mechanics.pdf' } }));
    expect(screen.getByTitle('Physics/mechanics.pdf')).toBeTruthy();
    expect(screen.queryByText('File missing from folder')).toBeNull();
  });

  it('explains how to remove a folder book instead of offering to', () => {
    renderCard(doc({ source: { kind: 'folder', path: 'mechanics.pdf' } }));
    fireEvent.click(screen.getByRole('button', { name: 'More options for Classical Mechanics' }));
    expect(screen.getByText('Remove the file from the folder to remove this book.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Remove from library…' })).toBeNull();
  });

  it('dims a book whose file left the folder, and says so', () => {
    const { onOpen } = renderCard(doc({ source: { kind: 'folder', path: 'mechanics.pdf', missing: true } }));
    const card = screen.getByRole('article');
    expect(card.className).toContain('is-missing');
    expect(within(card).getByText('File missing from folder')).toBeTruthy();
    const open = screen.getByRole('button', { name: /Open Classical Mechanics.*file missing from folder/ });
    expect(open.getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(open);
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it('says a book from the folder has not been opened yet', () => {
    renderCard(doc({ lastOpenedAt: 0, source: { kind: 'folder', path: 'mechanics.pdf' } }));
    expect(screen.getByText('Not opened yet')).toBeTruthy();
  });

  it('only treats folder books flagged missing as missing', () => {
    expect(isMissingFromFolder(doc())).toBe(false);
    expect(isMissingFromFolder(doc({ source: { kind: 'imported' } }))).toBe(false);
    expect(isMissingFromFolder(doc({ source: { kind: 'folder', path: 'a.pdf' } }))).toBe(false);
    expect(isMissingFromFolder(doc({ source: { kind: 'folder', path: 'a.pdf', missing: true } }))).toBe(true);
  });
});
