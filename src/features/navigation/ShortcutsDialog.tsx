import { useEffect, useRef } from 'react';
import { Keyboard, X } from 'lucide-react';
import { create } from 'zustand';
import './navigation.css';

const useShortcutsDialogStore = create<{ open: boolean }>(() => ({ open: false }));
let opener: HTMLElement | null = null;

export function openShortcutsDialog(): void {
  if (useShortcutsDialogStore.getState().open) return;
  opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  useShortcutsDialogStore.setState({ open: true });
}

const groups = [
  {
    title: 'Navigate',
    shortcuts: [
      { label: 'Go to page', detail: 'Enter a printed label, or # for a PDF page number', keys: ['G'] },
      { label: 'Go back', keys: ['Alt', '←'] },
      { label: 'Go forward', keys: ['Alt', '→'] },
      { label: 'Dismiss a control', keys: ['Esc'] },
    ],
  },
  {
    title: 'Search',
    shortcuts: [
      { label: 'Search the book', detail: 'Or press / · ⌘F on macOS', keys: ['Ctrl', 'F'] },
      { label: 'Next result', detail: 'Also F3', keys: ['Enter'] },
      { label: 'Previous result', detail: 'Also Shift+F3', keys: ['Shift', 'Enter'] },
    ],
  },
  {
    title: 'Read',
    shortcuts: [
      { label: 'Zoom in', keys: ['+', '='], alternatives: true },
      { label: 'Zoom out', keys: ['−'] },
      { label: 'Fit page width', keys: ['0'] },
      { label: 'Toggle sidebar', keys: ['['] },
    ],
  },
  {
    title: 'Annotate',
    shortcuts: [
      { label: 'Toggle bookmark', keys: ['B'] },
      { label: 'New margin note', detail: 'Select text to include a quote', keys: ['N'] },
      { label: 'Highlight selected text', detail: 'In the colour used last', keys: ['H'] },
      { label: 'Review notes', keys: ['Shift', 'R'] },
    ],
  },
];

export function ShortcutsDialog() {
  const dialog = useRef<HTMLDialogElement>(null);
  const pendingCloseEvents = useRef(0);
  const open = useShortcutsDialogStore((s) => s.open);

  useEffect(() => {
    if (open && dialog.current && !dialog.current.open) dialog.current.showModal();
  }, [open]);

  useEffect(() => {
    const element = dialog.current;
    return () => {
      if (element?.open) element.close();
      useShortcutsDialogStore.setState({ open: false });
      opener = null;
    };
  }, []);

  const restoreFocus = () => {
    if (opener?.isConnected) opener.focus({ preventScroll: true });
    opener = null;
  };
  const dismiss = () => {
    if (!dialog.current?.open) return;
    pendingCloseEvents.current++;
    dialog.current.close();
    useShortcutsDialogStore.setState({ open: false });
    restoreFocus();
  };

  return (
    <dialog
      ref={dialog}
      className="shortcuts-dialog"
      aria-labelledby="shortcuts-dialog-title"
      onCancel={(event) => {
        event.preventDefault();
        dismiss();
      }}
      onClose={() => {
        if (pendingCloseEvents.current) {
          pendingCloseEvents.current--;
          return;
        }
        useShortcutsDialogStore.setState({ open: false });
        restoreFocus();
      }}
    >
      <header className="shortcuts-dialog__header">
        <span className="shortcuts-dialog__icon" aria-hidden="true">
          <Keyboard />
        </span>
        <div className="shortcuts-dialog__heading">
          <h2 id="shortcuts-dialog-title">Keyboard shortcuts</h2>
          <p>Find your way around the reader.</p>
        </div>
        <button
          className="btn btn--ghost btn--icon btn--sm"
          aria-label="Close keyboard shortcuts"
          autoFocus
          onClick={dismiss}
        >
          <X />
        </button>
      </header>
      <div className="shortcuts-dialog__groups">
        {groups.map((group) => (
          <section className="shortcuts-dialog__group" key={group.title} aria-label={group.title}>
            <h3>{group.title}</h3>
            <dl>
              {group.shortcuts.map((shortcut) => (
                <div className="shortcuts-dialog__row" key={shortcut.label}>
                  <dt>
                    {shortcut.label}
                    {'detail' in shortcut && (
                      <span className="shortcuts-dialog__detail">{shortcut.detail}</span>
                    )}
                  </dt>
                  <dd className="shortcuts-dialog__keys">
                    {shortcut.keys.map((key, index) => (
                      <span className="shortcuts-dialog__key" key={key}>
                        {index > 0 && (
                          <span aria-hidden="true">{'alternatives' in shortcut ? '/' : '+'}</span>
                        )}
                        <kbd
                          className="kbd"
                          aria-label={key === '←' ? 'Left arrow' : key === '→' ? 'Right arrow' : undefined}
                        >
                          {key}
                        </kbd>
                      </span>
                    ))}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
    </dialog>
  );
}
