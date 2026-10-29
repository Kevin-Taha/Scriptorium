import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { LibraryDocument, ReadingState } from '@/lib/types';
import { NowReading } from './NowReading';

afterEach(cleanup);

const doc = (overrides: Partial<LibraryDocument> = {}): LibraryDocument => ({
  id: 'a'.repeat(64),
  title: 'Classical Mechanics',
  fileName: 'mechanics.pdf',
  fileSize: 1,
  pageCount: 36,
  addedAt: 0,
  lastOpenedAt: Date.now() - 28 * 60_000,
  contents: [
    { title: 'Chapter 1: Kinematics', page: 3, depth: 0 },
    { title: 'Chapter 2: Newton’s Laws', page: 11, depth: 0 },
    { title: '2.2 The Second Law', page: 14, depth: 1 },
    { title: 'Chapter 3: Energy', page: 19, depth: 0 },
  ],
  ...overrides,
});

const reading = (page: number): ReadingState => ({
  docId: 'a'.repeat(64),
  location: { page, offset: 0 },
  zoom: { mode: 'fit-width', scale: 1 },
  updatedAt: 1,
});

describe('NowReading', () => {
  it('says where you are in the book and carries on from there', () => {
    const onContinue = vi.fn();
    render(<NowReading doc={doc()} reading={reading(14)} onContinue={onContinue} />);
    expect(screen.getByText('NOW READING')).toBeTruthy();
    expect(screen.getByText('Opened 28 minutes ago')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Classical Mechanics' })).toBeTruthy();
    expect(screen.getByText(/^Chapter 2: Newton’s Laws/)).toBeTruthy();
    expect(screen.getByText('2.2 The Second Law')).toBeTruthy();
    expect(screen.getByText('Chapter 2 of 3')).toBeTruthy();
    expect(screen.getByText('Page 14 of 36')).toBeTruthy();
    expect(screen.getByText(/^36%/)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Continue reading' }));
    expect(onContinue).toHaveBeenCalledTimes(1);
  });

  it('lets the cover be clicked without adding a second button to the page', () => {
    const onContinue = vi.fn();
    const { container } = render(<NowReading doc={doc()} reading={reading(14)} onContinue={onContinue} />);
    expect(screen.getAllByRole('button')).toHaveLength(1);
    fireEvent.click(container.querySelector('.now-reading__cover') as HTMLElement);
    expect(onContinue).toHaveBeenCalledTimes(1);
  });

  it('shows just the page and a plain bar for a book without contents', () => {
    const { container } = render(
      <NowReading doc={doc({ contents: undefined })} reading={reading(14)} onContinue={vi.fn()} />,
    );
    expect(screen.getByText('Page 14 of 36')).toBeTruthy();
    expect(screen.queryByText(/Chapter/)).toBeNull();
    expect(container.querySelectorAll('.now-reading__segment')).toHaveLength(1);
  });

  it('starts at page 1 when no position was saved', () => {
    render(<NowReading doc={doc()} onContinue={vi.fn()} />);
    expect(screen.getByText('Front matter')).toBeTruthy();
    expect(screen.getByText('Page 1 of 36')).toBeTruthy();
    expect(screen.queryByText(/^Chapter \d+ of/)).toBeNull();
  });

  it('shows only the page while the page count is unknown', () => {
    render(<NowReading doc={doc({ pageCount: 0 })} reading={reading(14)} onContinue={vi.fn()} />);
    expect(screen.getByText('Page 14')).toBeTruthy();
  });
});
