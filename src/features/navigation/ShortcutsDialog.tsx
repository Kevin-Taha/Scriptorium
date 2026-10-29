import { Fragment, useEffect, useRef } from 'react';
import { CircleHelp, Keyboard, X } from 'lucide-react';
import { create } from 'zustand';
import { isEditableTarget } from '@/lib/util';
import { COMMANDS, GROUPS, type Command, type CommandId } from '../commands/commands';
import { ariaKeyShortcuts, keyCaps, matches, withShortcut } from '../commands/keys';
import './navigation.css';

const useShortcutsDialogStore = create<{ open: boolean }>(() => ({ open: false }));
let opener: HTMLElement | null = null;

export function openShortcutsDialog(): void {
  if (useShortcutsDialogStore.getState().open) return;
  opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  useShortcutsDialogStore.setState({ open: true });
}

/** `?` for screens without key handling of their own (the library); the reader and review handle it. */
export function useHelpShortcut(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || isEditableTarget(event.target) || document.querySelector('dialog:modal'))
        return;
      if (!matches(event, 'help')) return;
      event.preventDefault();
      openShortcutsDialog();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [enabled]);
}

/** Toolbar icon button that opens the dialog. */
export function ShortcutsButton({ className = '' }: { className?: string }) {
  return (
    <button
      type="button"
      className={`btn btn--ghost btn--icon tooltip tooltip--below ${className}`.trim()}
      data-tooltip={withShortcut('Keyboard shortcuts', 'help')}
      aria-label="Keyboard shortcuts"
      aria-keyshortcuts={ariaKeyShortcuts('help')}
      onClick={openShortcutsDialog}
    >
      <CircleHelp />
    </button>
  );
}

const SECTIONS = GROUPS.map((group) => ({
  group,
  ids: (Object.keys(COMMANDS) as CommandId[]).filter((id) => COMMANDS[id].group === group),
}));

/** What the keys do, reached by pointer instead. */
const POINTER_WAYS = [
  ['Add a note', 'Click the margin beside a page'],
  ['Highlight or quote', 'Select text, then pick a colour or “Add margin note”'],
  ['Bookmark a page', 'Hover its top-right corner and click the ribbon'],
  ['Preview a reference', 'Hover a link'],
  ['Travel through the book', 'Hover or drag the book map on the right'],
  ['Go to a page or chapter', 'Click the section name in the toolbar'],
  ['Ruler, book map, chapter progress', 'Appearance → Reading'],
  ['Review all notes', 'Review notes, at the end of the toolbar'],
] as const;

function Keys({ id }: { id: CommandId }) {
  return (
    <dd className="shortcuts-dialog__keys">
      {keyCaps(id).map((combo, index) => (
        <Fragment key={combo.map((cap) => cap.text).join('+')}>
          {index > 0 && <span className="shortcuts-dialog__or">or</span>}
          <span className="shortcuts-dialog__combo">
            {combo.map((cap, capIndex) => (
              <Fragment key={cap.text}>
                {capIndex > 0 && <span aria-hidden="true">+</span>}
                <kbd className="kbd">
                  {cap.text === cap.spoken ? (
                    cap.text
                  ) : (
                    <>
                      <span aria-hidden="true">{cap.text}</span>
                      <span className="visually-hidden">{cap.spoken}</span>
                    </>
                  )}
                </kbd>
              </Fragment>
            ))}
          </span>
        </Fragment>
      ))}
    </dd>
  );
}

/** Every shortcut, from the command registry, and the pointer ways to the same features. Mounted once in the app shell. */
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
          <p>Every key in Scriptorium, and where to click instead.</p>
        </div>
        <button
          type="button"
          className="btn btn--ghost btn--icon btn--sm"
          aria-label="Close keyboard shortcuts"
          // biome-ignore lint/a11y/noAutofocus: focus moves into the modal when it opens
          autoFocus
          onClick={dismiss}
        >
          <X />
        </button>
      </header>
      <div className="shortcuts-dialog__groups">
        {SECTIONS.map(({ group, ids }) => (
          <section className="shortcuts-dialog__group" key={group} aria-label={group}>
            <h3>{group}</h3>
            <dl>
              {ids.map((id) => {
                const { label, detail }: Command = COMMANDS[id];
                return (
                  <div className="shortcuts-dialog__row" key={id}>
                    <dt>
                      {label}
                      {detail && <span className="shortcuts-dialog__detail">{detail}</span>}
                    </dt>
                    <Keys id={id} />
                  </div>
                );
              })}
            </dl>
          </section>
        ))}
      </div>
      <section className="shortcuts-dialog__pointer" aria-label="Without the keyboard">
        <h3>Without the keyboard</h3>
        <dl>
          {POINTER_WAYS.map(([what, how]) => (
            <div className="shortcuts-dialog__way" key={what}>
              <dt>{what}</dt>
              <dd>{how}</dd>
            </div>
          ))}
        </dl>
      </section>
    </dialog>
  );
}
