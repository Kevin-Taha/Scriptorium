import {
  type ClipboardEvent,
  type DragEvent,
  type KeyboardEvent,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { ariaKeyShortcuts, matches } from '../commands/keys';
import { noteContent, readNoteContent } from './noteContent';
import './notes.css';

const FORMAT_KEYS = `${ariaKeyShortcuts('bold')} ${ariaKeyShortcuts('italic')}`;

interface NoteTextFieldProps {
  /** Text to start from. The field owns its content from then on. */
  text: string;
  /** Accessible name, e.g. "Note text, page 3". */
  label: string;
  className: string;
  onChange(text: string): void;
  /** Esc or Ctrl/⌘+Enter. */
  onCommit(): void;
}

/** Inserts text without formatting, line by line, so its line breaks never become blocks. */
function insertPlainText(text: string): void {
  text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .forEach((line, index) => {
      if (index > 0) document.execCommand('insertLineBreak');
      if (line) document.execCommand('insertText', false, line);
    });
}

function placeCaretAtEnd(field: HTMLElement): void {
  // The last run sits just before the trailing <br>; continue its text (and formatting).
  let node = field.lastChild?.previousSibling ?? null;
  while (node?.lastChild) node = node.lastChild;
  const selection = getSelection();
  if (node instanceof Text) selection?.collapse(node, node.length);
  else selection?.collapse(field, 0);
}

/**
 * The editable body of a note. Bold and italic show as you type (Ctrl/⌘+B, Ctrl/⌘+I, via
 * the browser's own commands, so undo works), and every change is written back as note
 * text with Markdown markers. Mounted when editing starts, it takes focus with the caret
 * at the end and then owns its DOM: React never re-renders the content, so the caret,
 * IME composition and undo history are left alone.
 */
export function NoteTextField({ text, label, className, onChange, onCommit }: NoteTextFieldProps) {
  const ref = useRef<HTMLDivElement>(null);
  const written = useRef(text);
  const draggingFrom = useRef(false);
  const [empty, setEmpty] = useState(text === '');

  useLayoutEffect(() => {
    const field = ref.current!;
    field.replaceChildren(noteContent(document, written.current));
    field.focus({ preventScroll: true });
    placeCaretAtEnd(field);

    const onBeforeInput = (event: InputEvent) => {
      if (event.inputType === 'insertParagraph') {
        // Enter adds a line break, not a new block.
        event.preventDefault();
        document.execCommand('insertLineBreak');
      } else if (/^format(?!Bold$|Italic$)/.test(event.inputType)) {
        event.preventDefault();
      }
    };
    field.addEventListener('beforeinput', onBeforeInput);
    return () => field.removeEventListener('beforeinput', onBeforeInput);
  }, []);

  const sync = () => {
    const next = readNoteContent(ref.current!);
    setEmpty(next === '');
    if (next === written.current) return;
    written.current = next;
    onChange(next);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.nativeEvent.isComposing) return;
    const mod = event.ctrlKey || event.metaKey;
    if (event.key === 'Escape' || (event.key === 'Enter' && mod)) {
      event.preventDefault();
      event.stopPropagation();
      onCommit();
      return;
    }
    const format = matches(event, 'bold') ? 'bold' : matches(event, 'italic') ? 'italic' : undefined;
    if (format) {
      event.preventDefault();
      document.execCommand(format);
    }
  };

  const onPaste = (event: ClipboardEvent<HTMLDivElement>) => {
    event.preventDefault();
    insertPlainText(event.clipboardData.getData('text/plain'));
  };

  // Text dragged in (say, from the page) arrives as plain text; moving text within the note is left to the browser.
  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    if (draggingFrom.current) return;
    event.preventDefault();
    const dropped = event.dataTransfer.getData('text/plain');
    if (!dropped) return;
    // Not in every browser yet; without it the text lands at the caret.
    const caret = document.caretPositionFromPoint?.(event.clientX, event.clientY);
    if (caret && event.currentTarget.contains(caret.offsetNode)) {
      getSelection()?.collapse(caret.offsetNode, caret.offset);
    }
    insertPlainText(dropped);
  };

  return (
    <div
      ref={ref}
      className={`note-field ${className}`}
      contentEditable
      tabIndex={0}
      role="textbox"
      aria-multiline="true"
      aria-label={label}
      aria-placeholder="Write a note…"
      aria-keyshortcuts={FORMAT_KEYS}
      data-empty={empty || undefined}
      spellCheck
      onInput={sync}
      onKeyDown={onKeyDown}
      onPaste={onPaste}
      onDragStart={() => {
        draggingFrom.current = true;
      }}
      onDragEnd={() => {
        draggingFrom.current = false;
      }}
      onDrop={onDrop}
    />
  );
}
