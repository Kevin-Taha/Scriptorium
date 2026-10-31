import { useEffect, useMemo, useRef, useState } from 'react';
import { BookOpen, ChevronDown, ChevronRight } from 'lucide-react';
import type { OutlineItem } from '@/lib/types';
import { useReaderStore } from '../reader/readerStore';
import { useHistoryStore } from './historyStore';
import { ancestorKeys, currentOutlineEntry, outlineEntries, splitSectionNumber } from './outlineCurrent';
import { pageLabelFor } from './pageLabels';

export function OutlinePanel() {
  const outline = useReaderStore((s) => s.outline);
  const labels = useReaderStore((s) => s.pageLabels);
  const jumpTo = useHistoryStore((s) => s.jumpTo);
  const entries = useMemo(() => outlineEntries(outline), [outline]);
  const entryByKey = useMemo(() => new Map(entries.map((entry) => [entry.key, entry])), [entries]);
  // Select the derived key (not the location) so scrolling only re-renders when the section changes.
  const currentKey = useReaderStore((s) => currentOutlineEntry(entries, s.location)?.key ?? null);
  const ancestors = useMemo(() => new Set(currentKey ? ancestorKeys(currentKey) : []), [currentKey]);
  const [expansions, setExpansions] = useState<
    Record<string, { expanded: boolean; currentKey: string | null }>
  >({});
  const [focusedKey, setFocusedKey] = useState<string | null>(null);
  const refs = useRef(new Map<string, HTMLDivElement>());
  const isExpanded = (key: string, depth: number) => {
    const choice = expansions[key];
    if (choice && (!ancestors.has(key) || choice.currentKey === currentKey)) return choice.expanded;
    return depth === 1 || ancestors.has(key);
  };
  const visible = entries.filter((entry) =>
    ancestorKeys(entry.key).every((key) => {
      const ancestor = entryByKey.get(key);
      return ancestor && isExpanded(key, ancestor.depth);
    }),
  );
  const tabKey = visible.some((entry) => entry.key === focusedKey)
    ? focusedKey
    : (visible.find((entry) => entry.key === currentKey)?.key ?? visible[0]?.key);

  useEffect(() => {
    if (currentKey) refs.current.get(currentKey)?.scrollIntoView?.({ block: 'nearest' });
  }, [currentKey]);

  if (!outline.length) {
    return (
      <div className="empty-state outline__empty">
        <span className="empty-state__icon">
          <BookOpen aria-hidden="true" />
        </span>
        <h2 className="empty-state__title">No contents in this PDF</h2>
        <p className="empty-state__body">
          This book has no outline. Use the page field or bookmarks to find your way.
        </p>
      </div>
    );
  }

  const focus = (key: string) => {
    setFocusedKey(key);
    refs.current.get(key)?.focus();
  };
  const toggle = (key: string, depth: number) => {
    setExpansions((state) => ({ ...state, [key]: { expanded: !isExpanded(key, depth), currentKey } }));
  };
  const renderItems = (items: OutlineItem[], parentKey: string | null, depth: number): React.ReactNode =>
    items.map((item, index) => {
      const key = parentKey === null ? String(index) : `${parentKey}.${index}`;
      const expanded = item.children.length > 0 && isExpanded(key, depth);
      const numbered = splitSectionNumber(item.title);
      return (
        <div
          key={key}
          ref={(element) => {
            if (element) refs.current.set(key, element);
            else refs.current.delete(key);
          }}
          role="treeitem"
          aria-level={depth}
          aria-expanded={item.children.length ? expanded : undefined}
          aria-disabled={!item.location}
          aria-current={key === currentKey ? 'location' : undefined}
          tabIndex={key === tabKey ? 0 : -1}
          onFocus={(event) => {
            if (event.target === event.currentTarget) setFocusedKey(key);
          }}
          onKeyDown={(event) => {
            if (event.target !== event.currentTarget) return;
            const index = visible.findIndex((entry) => entry.key === key);
            let next: string | undefined;
            switch (event.key) {
              case 'ArrowDown':
                next = visible[index + 1]?.key;
                break;
              case 'ArrowUp':
                next = visible[index - 1]?.key;
                break;
              case 'Home':
                next = visible[0]?.key;
                break;
              case 'End':
                next = visible.at(-1)?.key;
                break;
              case 'ArrowRight':
                if (item.children.length && !expanded) toggle(key, depth);
                else if (expanded) next = visible[index + 1]?.key;
                break;
              case 'ArrowLeft':
                if (expanded) toggle(key, depth);
                else next = parentKey ?? undefined;
                break;
              case 'Enter':
              case ' ':
                if (item.location) jumpTo(item.location);
                break;
              default:
                return;
            }
            event.preventDefault();
            event.stopPropagation();
            if (next) focus(next);
          }}
        >
          {/* biome-ignore lint/a11y/noStaticElementInteractions: mouse target of the focusable treeitem, which handles the keys */}
          {/* biome-ignore lint/a11y/useKeyWithClickEvents: keyboard activation is handled by the parent treeitem */}
          <div
            className={`outline__item${key === currentKey ? ' is-current' : ''}${!item.location ? ' is-unresolved' : ''}`}
            data-depth={Math.min(depth, 3)}
            style={{ paddingLeft: `${(depth - 1) * 16}px` }}
            onClick={() => {
              focus(key);
              if (item.location) jumpTo(item.location);
            }}
          >
            {item.children.length > 0 ? (
              <button
                type="button"
                className="outline__chevron"
                tabIndex={-1}
                aria-label={`${expanded ? 'Collapse' : 'Expand'} ${item.title}`}
                onClick={(event) => {
                  event.stopPropagation();
                  focus(key);
                  toggle(key, depth);
                }}
              >
                {expanded ? <ChevronDown /> : <ChevronRight />}
              </button>
            ) : (
              <span className="outline__chevron" aria-hidden="true" />
            )}
            <span className="outline__label">
              {numbered && <span className="outline__number">{numbered.number}</span>}
              <span className="outline__title">{numbered ? numbered.text : item.title}</span>
            </span>
            {item.location && (
              <span className="outline__page">{pageLabelFor(labels, item.location.page)}</span>
            )}
          </div>
          {expanded && <div role="group">{renderItems(item.children, key, depth + 1)}</div>}
        </div>
      );
    });

  return (
    <div className="outline" role="tree" aria-label="Contents">
      {renderItems(outline, null, 1)}
    </div>
  );
}
