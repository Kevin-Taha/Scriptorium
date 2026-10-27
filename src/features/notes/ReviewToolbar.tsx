import type { RefObject } from 'react';
import { ArrowLeft, Download, Search, X } from 'lucide-react';
import { ThemeMenu } from '@/app/ThemeMenu';
import { NOTE_COLORS, type NoteColor } from '@/lib/types';
import { NOTE_COLOR_LABELS } from './noteColors';
import type { ReviewDensity } from './reviewDensity';
import { toggleColor, type ReviewFilters } from './reviewFilter';

interface ReviewToolbarProps {
  title: string;
  /** e.g. "42 notes on 17 pages", or "7 of 42 notes on 4 pages" while filtering. */
  countText: string;
  /** Whether the book has any notes; filters and export only make sense when it does. */
  hasNotes: boolean;
  exportCount: number;
  colorCounts: Record<NoteColor, number>;
  filters: ReviewFilters;
  density: ReviewDensity;
  searchRef: RefObject<HTMLInputElement | null>;
  onFiltersChange(filters: ReviewFilters): void;
  onDensityChange(density: ReviewDensity): void;
  onBack(): void;
  onExport(): void;
}

const DENSITIES: { id: ReviewDensity; label: string }[] = [
  { id: 'comfortable', label: 'Comfortable' },
  { id: 'dense', label: 'Dense' },
];

export function ReviewToolbar(props: ReviewToolbarProps) {
  const { title, countText, hasNotes, exportCount, colorCounts, filters, density, searchRef } = props;
  const { onFiltersChange, onDensityChange, onBack, onExport } = props;

  return (
    <header className="review__toolbar" role="toolbar" aria-label="Notes review">
      <button type="button" className="btn btn--ghost review__back" onClick={onBack}>
        <ArrowLeft /> Back to book
      </button>
      <span className="divider divider--vertical" aria-hidden="true" />
      <div className="review__heading">
        <h1 className="review__title" title={title}>
          Notes · {title}
        </h1>
        {hasNotes && (
          <p className="review__count" role="status">
            {countText}
          </p>
        )}
      </div>

      <span className="review__spacer" />

      {hasNotes && (
        <>
          <div className="review-search">
            <Search className="review-search__icon" aria-hidden="true" />
            <input
              ref={searchRef}
              className="input input--sm review-search__input"
              type="search"
              placeholder="Filter notes"
              aria-label="Filter notes"
              aria-keyshortcuts="/"
              autoComplete="off"
              spellCheck={false}
              value={filters.query}
              onChange={(event) => onFiltersChange({ ...filters, query: event.target.value })}
              onKeyDown={(event) => {
                if (event.key !== 'Escape') return;
                event.preventDefault();
                event.stopPropagation();
                if (filters.query) onFiltersChange({ ...filters, query: '' });
                else event.currentTarget.blur();
              }}
            />
            {filters.query ? (
              <button
                type="button"
                className="review-search__clear"
                aria-label="Clear text filter"
                onClick={() => {
                  onFiltersChange({ ...filters, query: '' });
                  searchRef.current?.focus();
                }}
              >
                <X />
              </button>
            ) : (
              <kbd className="kbd review-search__hint" aria-hidden="true">
                /
              </kbd>
            )}
          </div>

          <div className="review-colors" role="group" aria-label="Filter by colour">
            {NOTE_COLORS.map((color) => {
              const active = filters.colors.includes(color);
              const count = colorCounts[color];
              return (
                <button
                  key={color}
                  type="button"
                  className={`chip review-chip tooltip tooltip--below${active ? ' is-active' : ''}`}
                  data-note-color={color}
                  data-tooltip={`${NOTE_COLOR_LABELS[color]} · ${count}`}
                  aria-label={`${NOTE_COLOR_LABELS[color]} notes (${count})`}
                  aria-pressed={active}
                  onClick={() => onFiltersChange({ ...filters, colors: toggleColor(filters.colors, color) })}
                >
                  <span className="review-chip__dot" aria-hidden="true" />
                </button>
              );
            })}
          </div>

          <div className="segmented" role="radiogroup" aria-label="Density">
            {DENSITIES.map(({ id, label }) => (
              <button
                key={id}
                type="button"
                role="radio"
                className="segmented__item"
                aria-checked={density === id}
                onClick={() => onDensityChange(id)}
              >
                {label}
              </button>
            ))}
          </div>
        </>
      )}

      <ThemeMenu />

      {hasNotes && (
        <button
          type="button"
          className="btn review__export review-tooltip-end tooltip tooltip--below"
          aria-label="Export Markdown"
          data-tooltip={`Exports all ${exportCount} ${exportCount === 1 ? 'note' : 'notes'}, ignoring filters`}
          disabled={exportCount === 0}
          onClick={onExport}
        >
          <Download /> <span className="review__export-label">Export Markdown</span>
        </button>
      )}
    </header>
  );
}
