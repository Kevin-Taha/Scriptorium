import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import {
  BookOpen,
  Bookmark,
  FileText,
  Highlighter,
  NotebookPen,
  Search,
  Sparkles,
  TextSearch,
  X,
} from 'lucide-react';
import { ariaKeyShortcuts, keyLabel, matches } from '@/features/commands/keys';
import { clearSearch, searchBook, useSearchStore, type SearchState } from '@/features/search/searchStore';
import {
  buildCandidates,
  pageRow,
  rankCandidates,
  readBook,
  TEXT_ROWS,
  textRows,
  type Row,
} from './candidates';
import { closeGoTo, useGoToStore } from './paletteStore';
import './palette.css';

const ICONS = {
  page: FileText,
  contents: BookOpen,
  bookmark: Bookmark,
  note: NotebookPen,
  highlight: Highlighter,
  action: Sparkles,
  text: TextSearch,
};
/** The book's text is searched from this many characters, once typing pauses. */
const MIN_TEXT_QUERY = 2;
const TEXT_DEBOUNCE_MS = 120;

function MarkedText({ text, marks }: { text: string; marks?: number[] }) {
  if (!marks?.length) return text;
  const marked = new Set(marks);
  const parts: ReactNode[] = [];
  let start = 0;
  let offset = 0;
  let inMark = marked.has(0);
  for (const char of text) {
    if (marked.has(offset) !== inMark) {
      const segment = text.slice(start, offset);
      parts.push(inMark ? <mark key={start}>{segment}</mark> : segment);
      start = offset;
      inMark = !inMark;
    }
    offset += char.length;
  }
  const segment = text.slice(start);
  parts.push(inMark ? <mark key={start}>{segment}</mark> : segment);
  return parts;
}

function textStatus({ searching, hits, capped, indexed, total, hasText }: SearchState): string {
  const count = (n: number) => n.toLocaleString('en-US');
  if (!hasText) return 'Scanned book — no text';
  if (searching) return `Searching… ${count(indexed)} of ${count(total)} pages`;
  if (hits === 0) return 'No matches';
  const found = `${count(hits)}${capped ? '+' : ''} ${hits === 1 ? 'match' : 'matches'}`;
  return hits > TEXT_ROWS ? `${found} — refine to narrow` : found;
}

export function GoToPalette() {
  const dialog = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const open = useGoToStore((s) => s.open);

  const dismiss = () => {
    if (dialog.current?.open) dialog.current.close();
    closeGoTo();
    if (opener.current?.isConnected) opener.current.focus({ preventScroll: true });
    opener.current = null;
  };

  useLayoutEffect(() => {
    const element = dialog.current;
    if (!open || !element || element.open) return;
    opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    element.showModal();
    const input = element.querySelector('input');
    input?.focus();
    input?.select();
  }, [open]);

  useEffect(() => closeGoTo, []);

  return (
    <dialog
      ref={dialog}
      className="go-to"
      aria-label="Go to"
      onCancel={(event) => {
        event.preventDefault();
        dismiss();
      }}
      // The browser may close it on its own; a late event from an earlier close is ignored.
      onClose={(event) => {
        if (!event.currentTarget.open) dismiss();
      }}
    >
      {open && <PaletteContent dismiss={dismiss} />}
    </dialog>
  );
}

function PaletteContent({ dismiss }: { dismiss(): void }) {
  // Reopening after choosing a match keeps its query, so the next one is an arrow away.
  const [query, setQuery] = useState(() => useSearchStore.getState().query);
  const [picked, setPicked] = useState<number | null>(null);
  const [candidates] = useState(buildCandidates);
  const [book] = useState(readBook);
  const search = useSearchStore();
  const list = useRef<HTMLDivElement>(null);
  const findText = query.trim().length >= MIN_TEXT_QUERY;

  useEffect(() => {
    const timer = setTimeout(() => (findText ? searchBook(query) : clearSearch()), TEXT_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query, findText]);

  // Closing without choosing a match ends the search (one chosen earlier stays).
  useEffect(
    () => () => {
      if (!useSearchStore.getState().active) clearSearch();
    },
    [],
  );

  const destinations = useMemo(() => {
    const page = pageRow(book, query);
    const groups: { name: string; rows: Row[]; status?: string }[] = rankCandidates(candidates, query);
    return page ? [{ name: 'Page', rows: [page] }, ...groups] : groups;
  }, [book, candidates, query]);
  const groups = useMemo(
    () =>
      findText && search.query
        ? [...destinations, { name: 'In the text', rows: textRows(search, book), status: textStatus(search) }]
        : destinations,
    [destinations, findText, search, book],
  );
  const rows = groups.flatMap((group) => group.rows);
  const selected = Math.min(
    picked ??
      Math.max(
        0,
        rows.findIndex((row) => row.current),
      ),
    rows.length - 1,
  );

  useLayoutEffect(() => {
    list.current?.querySelector(`#go-to-option-${selected}`)?.scrollIntoView({ block: 'nearest' });
  }, [selected, groups]);

  const choose = (row: Row) => {
    dismiss();
    row.item.run();
  };
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.nativeEvent.isComposing) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const step = event.key === 'ArrowDown' ? 1 : -1;
      if (rows.length) setPicked((selected + step + rows.length) % rows.length);
    } else if (event.key === 'Enter' && rows[selected]) {
      event.preventDefault();
      choose(rows[selected]);
    } else if ((event.ctrlKey || event.metaKey) && matches(event, 'search')) {
      event.preventDefault();
      event.currentTarget.select();
    }
  };

  let index = 0;
  return (
    <>
      <div className="go-to__search">
        <Search aria-hidden="true" />
        <input
          role="combobox"
          aria-label="Go to, or find in the book"
          aria-keyshortcuts={ariaKeyShortcuts('go-to')}
          aria-autocomplete="list"
          aria-expanded="true"
          aria-controls="go-to-list"
          aria-activedescendant={selected >= 0 ? `go-to-option-${selected}` : undefined}
          placeholder="Page, chapter, note, or words from the book…"
          value={query}
          autoComplete="off"
          spellCheck={false}
          onChange={(event) => {
            setQuery(event.target.value);
            setPicked(null);
          }}
          onKeyDown={onKeyDown}
        />
        <kbd className="kbd">Esc</kbd>
        <button
          type="button"
          className="btn btn--ghost btn--icon btn--sm"
          aria-label="Close Go to"
          onClick={dismiss}
        >
          <X aria-hidden="true" />
        </button>
      </div>
      <div
        id="go-to-list"
        ref={list}
        className="go-to__list"
        role="listbox"
        aria-label="Destinations and matches"
      >
        {groups.map((group, groupIndex) => (
          <div role="group" aria-labelledby={`go-to-group-${groupIndex}`} key={group.name}>
            <div className="go-to__heading" id={`go-to-group-${groupIndex}`}>
              {group.name}
              {group.status && <span className="go-to__status">{group.status}</span>}
            </div>
            {group.rows.map((row) => {
              const rowIndex = index++;
              const Icon = ICONS[row.item.icon];
              return (
                <div
                  id={`go-to-option-${rowIndex}`}
                  key={row.item.id}
                  role="option"
                  aria-selected={rowIndex === selected}
                  tabIndex={-1}
                  className={`go-to__row${rowIndex === selected ? ' is-active' : ''}${row.item.icon === 'text' ? ' is-text' : ''}`}
                  onMouseMove={() => setPicked(rowIndex)}
                  onClick={() => choose(row)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      choose(row);
                    }
                  }}
                >
                  <Icon aria-hidden="true" />
                  <span className="go-to__row-text">
                    <span className="go-to__title">
                      <MarkedText text={row.item.title} marks={row.titleMarks} />
                    </span>
                    {row.item.detail && (
                      <span className="go-to__detail">
                        <MarkedText text={row.item.detail} marks={row.detailMarks} />
                      </span>
                    )}
                  </span>
                  {row.item.hint && <kbd className="kbd">{row.item.hint}</kbd>}
                </div>
              );
            })}
          </div>
        ))}
        {!groups.length && <p className="go-to__empty">Nothing matches.</p>}
      </div>
      <footer className="go-to__footer">
        <span>
          <kbd>{keyLabel('go-to')}</kbd> opens Go to · <kbd>{keyLabel('next-result')}</kbd> next match
        </span>
        <span>↑↓ move · Enter open · Esc close</span>
      </footer>
    </>
  );
}
