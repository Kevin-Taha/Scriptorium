import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { openShortcutsDialog, ShortcutsDialog } from './ShortcutsDialog';
import { useKeyboardShortcuts } from './useKeyboardShortcuts';

const originalShowModal = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, 'showModal');
const originalClose = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, 'close');

beforeAll(() => {
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
    configurable: true,
    value(this: HTMLDialogElement) {
      this.setAttribute('open', '');
      this.querySelector<HTMLElement>('[autofocus]')?.focus();
    },
  });
  Object.defineProperty(HTMLDialogElement.prototype, 'close', {
    configurable: true,
    value(this: HTMLDialogElement) {
      this.removeAttribute('open');
      this.dispatchEvent(new Event('close'));
    },
  });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
afterAll(() => {
  if (originalShowModal) Object.defineProperty(HTMLDialogElement.prototype, 'showModal', originalShowModal);
  else Reflect.deleteProperty(HTMLDialogElement.prototype, 'showModal');
  if (originalClose) Object.defineProperty(HTMLDialogElement.prototype, 'close', originalClose);
  else Reflect.deleteProperty(HTMLDialogElement.prototype, 'close');
});

function DialogHost() {
  useKeyboardShortcuts();
  return (
    <>
      <button type="button" onClick={openShortcutsDialog}>
        Open help
      </button>
      <input aria-label="Editing" />
      <ShortcutsDialog />
    </>
  );
}

describe('keyboard shortcuts dialog', () => {
  it('opens from the exported action and restores focus after closing', () => {
    render(<DialogHost />);
    const opener = screen.getByRole('button', { name: 'Open help' });
    opener.focus();
    fireEvent.click(opener);
    const dialog = screen.getByRole('dialog', { name: 'Keyboard shortcuts' });
    expect(dialog.hasAttribute('open')).toBe(true);
    expect(screen.getByRole('heading', { name: 'Navigate' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Read' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Annotate' })).toBeTruthy();
    expect(screen.getByText('Select text to include a quote')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Close keyboard shortcuts' }));
    expect(dialog.hasAttribute('open')).toBe(false);
    expect(document.activeElement).toBe(opener);
  });

  it('opens with question mark, but not from editable or modified key events', () => {
    render(<DialogHost />);
    const opener = screen.getByRole('button', { name: 'Open help' });
    const input = screen.getByRole('textbox', { name: 'Editing' });
    fireEvent.keyDown(input, { key: '?', shiftKey: true });
    fireEvent.keyDown(window, { key: '?', shiftKey: true, ctrlKey: true });
    expect(screen.queryByRole('dialog')).toBeNull();
    opener.focus();
    fireEvent.keyDown(opener, { key: '?', shiftKey: true });
    const dialog = screen.getByRole('dialog', { name: 'Keyboard shortcuts' }) as HTMLDialogElement;
    expect(dialog.open).toBe(true);
    act(() => dialog.close());
    expect(document.activeElement).toBe(opener);
  });

  it('resets the dialog state when the reader unmounts', () => {
    const { unmount } = render(<DialogHost />);
    act(() => openShortcutsDialog());
    expect(screen.getByRole('dialog')).toBeTruthy();
    unmount();
    render(<DialogHost />);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('can reopen immediately after Escape even if the close event arrives later', () => {
    render(<DialogHost />);
    const opener = screen.getByRole('button', { name: 'Open help' });
    opener.focus();
    fireEvent.click(opener);
    const dialog = screen.getByRole('dialog') as HTMLDialogElement;
    vi.spyOn(dialog, 'close').mockImplementation(() => dialog.removeAttribute('open'));
    fireEvent(dialog, new Event('cancel', { cancelable: true }));
    fireEvent.keyDown(opener, { key: '?', shiftKey: true });
    expect(dialog.open).toBe(true);
    fireEvent(dialog, new Event('close'));
    expect(dialog.open).toBe(true);
  });
});
