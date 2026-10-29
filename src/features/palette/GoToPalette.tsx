import { useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { BookOpen, Bookmark, FileText, Highlighter, NotebookPen, Search, Sparkles, X } from 'lucide-react';
import { ariaKeyShortcuts, keyLabel } from '@/features/commands/keys';
import { useHistoryStore } from '@/features/navigation/historyStore';
import { formatPageRef } from '@/features/navigation/pageLabels';
import { useReaderStore } from '@/features/reader/readerStore';
import { sectionForPage } from '@/lib/pdf/outline';
import { buildCandidates, openBookSearch } from './candidates';
import { closeGoTo, useGoToStore } from './paletteStore';
import { candidate, pageQuery, rankCandidates, type Group, type Ranked } from './results';
import './palette.css';

const ICONS = {
  contents: BookOpen,
  bookmark: Bookmark,
  note: NotebookPen,
  highlight: Highlighter,
  action: Sparkles,
};
const GROUPS: Group[] = ['Contents', 'Bookmarks', 'Notes & highlights', 'Actions'];
type DisplayGroup = Group | 'Page' | 'Search';

function MarkedText({ text, indices }: { text: string; indices?: number[] }) {
  if (!indices?.length) return text;
  const matched = new Set(indices);
  const parts: ReactNode[] = [];
  let start = 0;
  let offset = 0;
  let marked = matched.has(0);
  for (const char of text) {
    const next = matched.has(offset);
    if (next !== marked) {
      const segment = text.slice(start, offset);
      parts.push(marked ? <mark key={start}>{segment}</mark> : segment);
      start = offset;
      marked = next;
    }
    offset += char.length;
  }
  const segment = text.slice(start);
  parts.push(marked ? <mark key={start}>{segment}</mark> : segment);
  return parts;
}

export function GoToPalette() {
  const dialog = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const pendingClose = useRef(0);
  const open = useGoToStore((s) => s.open);

  const dismiss = () => {
    if (dialog.current?.open) {
      pendingClose.current++;
      dialog.current.close();
    }
    closeGoTo();
    if (opener.current?.isConnected) opener.current.focus({ preventScroll: true });
    opener.current = null;
  };

  useLayoutEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (open && !element.open) {
      opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      element.showModal();
      element.querySelector<HTMLInputElement>('input')?.focus();
    } else if (!open && element.open) {
      pendingClose.current++;
      element.close();
      if (opener.current?.isConnected) opener.current.focus({ preventScroll: true });
      opener.current = null;
    }
  }, [open]);

  useLayoutEffect(() => {
    const element = dialog.current;
    return () => {
      if (element?.open) element.close();
      closeGoTo();
    };
  }, []);

  return (
    <dialog
      ref={dialog}
      className="go-to"
      aria-label="Go to"
      onCancel={(event) => {
        event.preventDefault();
        dismiss();
      }}
      onClose={() => {
        if (pendingClose.current) {
          pendingClose.current--;
          return;
        }
        closeGoTo();
        if (opener.current?.isConnected) opener.current.focus({ preventScroll: true });
        opener.current = null;
      }}
    >
      {open && <PaletteContent dismiss={dismiss} />}
    </dialog>
  );
}

function PaletteContent({ dismiss }: { dismiss(): void }) {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [candidates] = useState(buildCandidates);
  const [reader] = useState(() => {
    const state = useReaderStore.getState();
    return {
      labels: state.pageLabels,
      outline: state.outline,
      count: state.pdf?.numPages ?? state.doc?.pageCount ?? 0,
    };
  });
  const list = useRef<HTMLDivElement>(null);
  const groups = useMemo(() => {
    const matches = rankCandidates(candidates, query);
    const ordered: { name: DisplayGroup; rows: Ranked[] }[] = GROUPS.map((name) => ({
      name,
      rows: matches.get(name) ?? [],
    })).filter((group) => group.rows.length);
    if (query.trim()) ordered.sort((a, b) => b.rows[0].score - a.rows[0].score);
    let remaining = 31;
    for (const group of ordered) {
      group.rows = group.rows.slice(0, remaining);
      remaining -= group.rows.length;
    }
    const page = pageQuery(reader.labels, query, reader.count);
    if (page !== null) {
      const section = sectionForPage(reader.outline, page);
      ordered.unshift({
        name: 'Page',
        rows: [
          {
            item: candidate({
              id: 'page',
              group: 'Contents',
              icon: 'contents',
              title: `Go to ${formatPageRef(reader.labels, page)}${section ? ` · ${section}` : ''}`,
              run: () => useHistoryStore.getState().jumpTo({ page, offset: 0 }),
            }),
            score: Infinity,
          },
        ],
      });
    }
    if (query.trim()) {
      const text = query.trim();
      ordered.push({
        name: 'Search',
        rows: [
          {
            item: candidate({
              id: 'search-fallback',
              group: 'Actions',
              icon: 'action',
              title: `Search the book for “${text}”`,
              run: () => openBookSearch(text),
            }),
            score: -Infinity,
          },
        ],
      });
    }
    return ordered.filter((group) => group.rows.length);
  }, [candidates, query, reader]);
  const rows = groups.flatMap((group) => group.rows);
  const activeIndex = Math.min(active, Math.max(0, rows.length - 1));

  useLayoutEffect(() => {
    list.current
      ?.querySelector<HTMLElement>(`#go-to-option-${activeIndex}`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex, groups]);

  const run = (row: Ranked) => {
    dismiss();
    row.item.run();
  };
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.nativeEvent.isComposing) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const direction = event.key === 'ArrowDown' ? 1 : -1;
      setActive((activeIndex + direction + rows.length) % Math.max(rows.length, 1));
    } else if (event.key === 'Enter' && rows[activeIndex]) {
      event.preventDefault();
      run(rows[activeIndex]);
    }
  };

  let index = 0;
  return (
    <>
      <div className="go-to__search">
        <Search aria-hidden="true" />
        <input
          role="combobox"
          aria-label="Go to page, chapter, bookmark or note"
          aria-keyshortcuts={ariaKeyShortcuts('go-to')}
          aria-autocomplete="list"
          aria-expanded="true"
          aria-controls="go-to-list"
          aria-activedescendant={rows.length ? `go-to-option-${activeIndex}` : undefined}
          placeholder="Page, chapter, bookmark or note…"
          value={query}
          autoComplete="off"
          spellCheck={false}
          onChange={(event) => {
            setQuery(event.target.value);
            setActive(0);
          }}
          onKeyDown={onKeyDown}
        />
        <kbd className="kbd">Esc</kbd>
        <button type="button" className="go-to__close" aria-label="Close Go to" onClick={dismiss}>
          <X aria-hidden="true" />
        </button>
      </div>
      <div
        id="go-to-list"
        ref={list}
        className="go-to__list"
        role="listbox"
        aria-label="Destinations and actions"
      >
        {groups.map((group, groupIndex) => (
          <div role="group" aria-labelledby={`go-to-group-${groupIndex}`} key={group.name}>
            <div className="go-to__heading" id={`go-to-group-${groupIndex}`}>
              {group.name}
            </div>
            {group.rows.map((row) => {
              const rowIndex = index++;
              const Icon =
                row.item.id === 'page'
                  ? FileText
                  : row.item.id === 'search-fallback'
                    ? Search
                    : ICONS[row.item.icon];
              return (
                <div
                  id={`go-to-option-${rowIndex}`}
                  key={row.item.id}
                  role="option"
                  aria-selected={rowIndex === activeIndex}
                  tabIndex={-1}
                  className={`go-to__row${rowIndex === activeIndex ? ' is-active' : ''}`}
                  onMouseMove={() => setActive(rowIndex)}
                  onClick={() => run(row)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      run(row);
                    }
                  }}
                >
                  <Icon aria-hidden="true" />
                  <span className="go-to__row-text">
                    <span className="go-to__title">
                      <MarkedText text={row.item.title} indices={row.titleMatch?.indices} />
                    </span>
                    {row.item.detail && (
                      <span className="go-to__detail">
                        <MarkedText text={row.item.detail} indices={row.detailMatch?.indices} />
                      </span>
                    )}
                  </span>
                  {row.item.hint && <kbd className="kbd">{row.item.hint}</kbd>}
                </div>
              );
            })}
          </div>
        ))}
        {!rows.length && <p className="go-to__empty">No destinations yet. Type a page, chapter or note.</p>}
      </div>
      <footer className="go-to__footer">
        <span>
          <kbd>{keyLabel('go-to')}</kbd> opens Go to from anywhere in the book
        </span>
        <span>↑↓ move · Enter open · Esc close</span>
      </footer>
    </>
  );
}
