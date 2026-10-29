import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { COMMANDS, GROUPS } from '../commands/commands';
import { openShortcutsDialog, ShortcutsDialog, useHelpShortcut } from './ShortcutsDialog';
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

function LibraryHost({ enabled }: { enabled: boolean }) {
  useHelpShortcut(enabled);
  return (
    <>
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
    for (const group of GROUPS) expect(screen.getByRole('heading', { name: group })).toBeTruthy();
    expect(screen.getByText('Select text to include a quote')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Close keyboard shortcuts' }));
    expect(dialog.hasAttribute('open')).toBe(false);
    expect(document.activeElement).toBe(opener);
  });

  it('lists every command in the registry with its keys, then the pointer ways', () => {
    render(<DialogHost />);
    act(() => openShortcutsDialog());
    for (const command of Object.values(COMMANDS)) {
      const row = screen.getByText(command.label).closest('.shortcuts-dialog__row') as HTMLElement;
      expect(row.closest('section')?.getAttribute('aria-label')).toBe(command.group);
      expect(row.querySelectorAll('kbd').length).toBeGreaterThan(0);
    }
    const zoom = screen.getByText('Zoom in').closest('.shortcuts-dialog__row') as HTMLElement;
    expect(zoom.querySelector('dd')?.textContent).toBe('+or=');
    const back = screen.getByText('Go back').closest('.shortcuts-dialog__row') as HTMLElement;
    expect(within(back).getByText('Left').className).toBe('visually-hidden');
    const pointer = screen.getByRole('region', { name: 'Without the keyboard' });
    expect(within(pointer).getByText('Click the margin beside a page')).toBeTruthy();
  });

  it('opens with ? on screens that use the shell shortcut, unless switched off or typing', () => {
    const { rerender } = render(<LibraryHost enabled={false} />);
    fireEvent.keyDown(window, { key: '?', shiftKey: true });
    expect(screen.queryByRole('dialog')).toBeNull();
    rerender(<LibraryHost enabled />);
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Editing' }), { key: '?', shiftKey: true });
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.keyDown(window, { key: '?', shiftKey: true });
    expect(screen.getByRole('dialog', { name: 'Keyboard shortcuts' })).toBeTruthy();
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

  it('resets the dialog state when the app shell unmounts', () => {
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
