import {
  memo,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type RefObject,
} from 'react';
import { CaseSensitive, ChevronDown, ChevronUp, Search, SearchX, WholeWord, X } from 'lucide-react';
import { sectionForPage } from '@/lib/pdf/outline';
import { useReaderStore } from '../reader/readerStore';
import type { Snippet } from './matcher';
import { focusViewport, SEARCH_INPUT_ID } from './searchDom';
import {
  centredWindow,
  formatStatus,
  windowResults,
  type HitRef,
  type HitWindow,
  type PageResult,
} from './searchResults';
import { useSearchStore } from './searchStore';
import './search.css';

/** Matches mounted at a time, and added by each "Show more" / "Show earlier". Keeps thousands of hits cheap. */
const PAGE_SIZE = 200;
const ITEM_SELECTOR = '.search-result, .search__more';

/** Sidebar tab: full-text search with results grouped by page. */
export function SearchPanel() {
  const inputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  const query = useSearchStore((s) => s.query);
  const options = useSearchStore((s) => s.options);
  const phase = useSearchStore((s) => s.phase);
  const hitCount = useSearchStore((s) => s.hitCount);
  const hasText = useSearchStore((s) => s.hasText);
  const runId = useSearchStore((s) => s.runId);
  const setQuery = useSearchStore((s) => s.setQuery);
  const setOptions = useSearchStore((s) => s.setOptions);
  const clear = useSearchStore((s) => s.clear);
  const next = useSearchStore((s) => s.next);
  const prev = useSearchStore((s) => s.prev);

  useEffect(() => {
    const { prepare, endSession } = useSearchStore.getState();
    prepare();
    if (!useSearchStore.getState().query) inputRef.current?.focus();
    return endSession;
  }, []);

  useEffect(() => {
    resultsRef.current?.scrollTo?.({ top: 0 });
  }, [runId]);

  const onInputKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.nativeEvent.isComposing) return;
    switch (event.key) {
      case 'Enter':
        event.preventDefault();
        if (event.shiftKey) prev();
        else next();
        break;
      case 'ArrowDown': {
        const results = resultsRef.current;
        const target =
          results?.querySelector<HTMLElement>('.search-result.is-active') ??
          results?.querySelector<HTMLElement>('.search-result');
        if (!target) return;
        event.preventDefault();
        target.focus();
        break;
      }
      case 'Escape':
        event.preventDefault();
        event.stopPropagation();
        if (query) clear();
        else focusViewport();
        break;
      default:
    }
  };

  const onResultsKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const target = event.target;
    if (!(target instanceof HTMLElement) || !target.matches(ITEM_SELECTOR)) return;
    const items = [...(resultsRef.current?.querySelectorAll<HTMLElement>(ITEM_SELECTOR) ?? [])];
    const at = items.indexOf(target);
    switch (event.key) {
      case 'ArrowDown':
        items[at + 1]?.focus();
        break;
      case 'ArrowUp':
        (at > 0 ? items[at - 1] : inputRef.current)?.focus();
        break;
      case 'Home':
        items[0]?.focus();
        break;
      case 'End':
        items.at(-1)?.focus();
        break;
      case 'Escape':
        focusViewport();
        break;
      default:
        return;
    }
    event.preventDefault();
    event.stopPropagation();
  };

  const showHint = phase === 'idle';
  const done = phase === 'done' && hitCount === 0;

  return (
    <div className="search">
      <div className="search__header">
        <div className={`search__field${query ? ' has-query' : ''}`}>
          <Search className="search__icon" aria-hidden="true" />
          <input
            id={SEARCH_INPUT_ID}
            ref={inputRef}
            className="input search__input"
            type="text"
            role="searchbox"
            aria-label="Search in book"
            placeholder="Search this book"
            value={query}
            autoComplete="off"
            spellCheck={false}
            enterKeyHint="search"
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={onInputKeyDown}
          />
          <div className="search__actions">
            {query && (
              <button
                type="button"
                className="btn btn--ghost btn--icon btn--sm"
                aria-label="Clear search"
                title="Clear (Esc)"
                onClick={() => {
                  clear();
                  inputRef.current?.focus();
                }}
              >
                <X />
              </button>
            )}
            <button
              type="button"
              className="btn btn--ghost btn--icon btn--sm"
              aria-label="Match case"
              aria-pressed={options.matchCase}
              title="Match case"
              onClick={() => setOptions({ matchCase: !options.matchCase })}
            >
              <CaseSensitive />
            </button>
            <button
              type="button"
              className="btn btn--ghost btn--icon btn--sm"
              aria-label="Whole word"
              aria-pressed={options.wholeWord}
              title="Whole word"
              onClick={() => setOptions({ wholeWord: !options.wholeWord })}
            >
              <WholeWord />
            </button>
          </div>
        </div>
        {!showHint && <SearchSummary onPrev={prev} onNext={next} />}
      </div>

      {/* biome-ignore lint/a11y/noStaticElementInteractions: delegates arrow-key navigation from the result buttons inside */}
      <div ref={resultsRef} className="search__results" onKeyDown={onResultsKeyDown}>
        {showHint && <SearchHint />}
        {done && hasText && <NoResultsHelp />}
        {done && !hasText && <NoTextNotice />}
        {hitCount > 0 && <ResultList key={runId} containerRef={resultsRef} />}
      </div>
    </div>
  );
}

function SearchSummary({ onPrev, onNext }: { onPrev(): void; onNext(): void }) {
  const phase = useSearchStore((s) => s.phase);
  const appliedQuery = useSearchStore((s) => s.appliedQuery);
  const hitCount = useSearchStore((s) => s.hitCount);
  const pageCount = useSearchStore((s) => s.results.length);
  const capped = useSearchStore((s) => s.capped);
  const indexed = useSearchStore((s) => s.indexed);
  const total = useSearchStore((s) => s.total);
  const activeIndex = useSearchStore((s) => s.activeIndex);
  const status = formatStatus({
    phase,
    query: appliedQuery,
    hits: hitCount,
    pages: pageCount,
    capped,
    indexed,
    total,
    position: phase === 'done' ? activeIndex + 1 : 0,
  });

  return (
    <>
      <div className="search__summary">
        <p className="search__status" title={status}>
          {status || '\u00a0'}
        </p>
        <div className="search__nav">
          <button
            type="button"
            className="btn btn--ghost btn--icon btn--sm"
            aria-label="Previous result"
            title="Previous result (Shift+Enter)"
            disabled={hitCount === 0}
            onClick={onPrev}
          >
            <ChevronUp />
          </button>
          <button
            type="button"
            className="btn btn--ghost btn--icon btn--sm"
            aria-label="Next result"
            title="Next result (Enter)"
            disabled={hitCount === 0}
            onClick={onNext}
          >
            <ChevronDown />
          </button>
        </div>
      </div>
      <p className="visually-hidden" role="status">
        {phase === 'done' ? status : ''}
      </p>
      {phase === 'searching' && (
        <div
          className="search__progress"
          role="progressbar"
          aria-label="Pages searched"
          aria-valuemin={0}
          aria-valuemax={total}
          aria-valuenow={indexed}
        >
          <span style={{ transform: `scaleX(${total ? indexed / total : 0})` }} />
        </div>
      )}
    </>
  );
}

function ResultList({ containerRef }: { containerRef: RefObject<HTMLDivElement | null> }) {
  const results = useSearchStore((s) => s.results);
  const hitCount = useSearchStore((s) => s.hitCount);
  const active = useSearchStore((s) => s.active);
  const activeIndex = useSearchStore((s) => s.activeIndex);
  const activate = useSearchStore((s) => s.activate);
  const [range, setRange] = useState<HitWindow>({ from: 0, to: PAGE_SIZE });
  const scrollBeforeEarlier = useRef<{ height: number; top: number } | null>(null);

  // Only a window of matches is mounted; stepping past its edge re-centres it on the active match.
  let current = range;
  if (activeIndex >= 0 && (activeIndex < range.from || activeIndex >= range.to)) {
    current = centredWindow(activeIndex, PAGE_SIZE, hitCount);
    setRange(current);
  }
  const from = Math.min(current.from, hitCount);
  const to = Math.min(current.to, hitCount);
  const groups = useMemo(() => windowResults(results, { from, to }), [results, from, to]);
  const tabStop: HitRef | null = active ?? (results[0] ? { page: results[0].page, index: 0 } : null);

  useEffect(() => {
    containerRef.current?.querySelector('.search-result.is-active')?.scrollIntoView?.({ block: 'nearest' });
  }, [containerRef, active]);

  // Rows added above the reader's place must not push it down the list.
  useLayoutEffect(() => {
    const container = containerRef.current;
    const before = scrollBeforeEarlier.current;
    if (!container || !before) return;
    scrollBeforeEarlier.current = null;
    container.scrollTop = before.top + container.scrollHeight - before.height;
  }, [containerRef, from]);

  const showEarlier = () => {
    const container = containerRef.current;
    if (container) {
      scrollBeforeEarlier.current = { height: container.scrollHeight, top: container.scrollTop };
    }
    setRange({ from: Math.max(0, from - PAGE_SIZE), to });
  };

  return (
    <>
      {from > 0 && (
        <button
          type="button"
          className="btn btn--sm search__more search__more--earlier"
          onClick={showEarlier}
        >
          Show earlier ({from.toLocaleString('en-US')} before)
        </button>
      )}
      <ul
        className="search__groups"
        // biome-ignore lint/a11y/noRedundantRoles: list-style: none drops list semantics in Safari and VoiceOver
        role="list"
      >
        {groups.map(({ result, start, end }) => (
          <PageGroup
            key={result.page}
            result={result}
            start={start}
            end={end}
            active={active?.page === result.page ? active.index : -1}
            tabStop={tabStop?.page === result.page ? tabStop.index : -1}
            onActivate={activate}
          />
        ))}
      </ul>
      {to < hitCount && (
        <button
          type="button"
          className="btn btn--sm search__more"
          onClick={() => setRange({ from, to: Math.min(hitCount, to + PAGE_SIZE) })}
        >
          Show more ({(hitCount - to).toLocaleString('en-US')} left)
        </button>
      )}
    </>
  );
}

interface PageGroupProps {
  result: PageResult;
  /** The shown part of the page's matches. */
  start: number;
  end: number;
  /** Position of the active / keyboard-tabbable match within the page, or -1. */
  active: number;
  tabStop: number;
  onActivate(hit: HitRef): void;
}

const PageGroup = memo(function PageGroup({
  result,
  start,
  end,
  active,
  tabStop,
  onActivate,
}: PageGroupProps) {
  return (
    <li className="search-group">
      <GroupHeading page={result.page} hits={result.matches.length} />
      <ul
        className="search-group__hits"
        // biome-ignore lint/a11y/noRedundantRoles: list-style: none drops list semantics in Safari and VoiceOver
        role="list"
      >
        {result.matches.slice(start, end).map((match, i) => (
          <ResultRow
            key={match.start}
            page={result.page}
            index={start + i}
            snippet={match.snippet}
            active={start + i === active}
            tabStop={start + i === tabStop}
            onActivate={onActivate}
          />
        ))}
      </ul>
    </li>
  );
});

function GroupHeading({ page, hits }: { page: number; hits: number }) {
  const outline = useReaderStore((s) => s.outline);
  const label = useReaderStore((s) => s.pageLabels?.[page - 1]);
  const section = useMemo(() => sectionForPage(outline, page), [outline, page]);
  return (
    <h3 className="search-group__title">
      <span className="search-group__page">{label ? `p. ${label}` : `Page ${page}`}</span>
      {section && <span className="search-group__section">{section}</span>}
      <span
        className="search-group__count"
        role="img"
        aria-label={`${hits} ${hits === 1 ? 'result' : 'results'}`}
      >
        {hits}
      </span>
    </h3>
  );
}

interface ResultRowProps {
  page: number;
  index: number;
  snippet: Snippet;
  active: boolean;
  tabStop: boolean;
  onActivate(hit: HitRef): void;
}

const ResultRow = memo(function ResultRow({
  page,
  index,
  snippet,
  active,
  tabStop,
  onActivate,
}: ResultRowProps) {
  return (
    <li>
      <button
        type="button"
        className={`search-result${active ? ' is-active' : ''}`}
        aria-current={active ? 'true' : undefined}
        tabIndex={tabStop ? 0 : -1}
        onClick={() => onActivate({ page, index })}
      >
        <span className="search-result__snippet">
          {snippet.before}
          <mark>{snippet.match}</mark>
          {snippet.after}
        </span>
      </button>
    </li>
  );
});

function SearchHint() {
  const modifier = /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl';
  return (
    <div className="empty-state search__empty">
      <span className="empty-state__icon">
        <Search aria-hidden="true" />
      </span>
      <h2 className="empty-state__title">Search this book</h2>
      <p className="empty-state__body">
        Find a word or phrase on any page. Results stay here while you read, and Return takes you back.
      </p>
      <ul className="search__keys">
        <li>
          <span>Search</span>
          <span className="search__caps">
            <kbd className="kbd">{modifier}</kbd>
            <kbd className="kbd">F</kbd>
          </span>
        </li>
        <li>
          <span>Next result</span>
          <kbd className="kbd">Enter</kbd>
        </li>
        <li>
          <span>Previous result</span>
          <span className="search__caps">
            <kbd className="kbd">Shift</kbd>
            <kbd className="kbd">Enter</kbd>
          </span>
        </li>
      </ul>
    </div>
  );
}

function NoResultsHelp() {
  const strict = useSearchStore((s) => s.options.matchCase || s.options.wholeWord);
  return (
    <p className="search__note">
      {strict
        ? 'Match case or Whole word is on. Try turning it off, or use fewer words.'
        : 'Check the spelling, or try fewer words.'}
    </p>
  );
}

function NoTextNotice() {
  return (
    <div className="empty-state search__empty">
      <span className="empty-state__icon">
        <SearchX aria-hidden="true" />
      </span>
      <h2 className="empty-state__title">No searchable text</h2>
      <p className="empty-state__body">This PDF looks like scanned images, so there is no text to search.</p>
    </div>
  );
}
