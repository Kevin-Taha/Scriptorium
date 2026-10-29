import { sectionForPage } from '@/lib/pdf/outline';
import type { Highlight, MarginNote, OutlineItem } from '@/lib/types';
import { pageLabelFor } from '../navigation/pageLabels';
import { buildAnnotations, groupAnnotationsByPage, type AnnotationItem } from './annotations';
import { NOTE_COLOR_LABELS } from './noteColors';
import { markdownNoteText } from './noteFormat';

export interface MarkdownExportInput {
  title: string;
  notes: MarginNote[];
  highlights?: Highlight[];
  outline?: OutlineItem[];
  /** Printed page labels (index = page - 1); page numbers are used when absent. */
  pageLabels?: readonly string[] | null;
  exportedAt: Date | number;
}

const MAX_FILE_STEM_LENGTH = 100;

/** A note is worth exporting when it carries either a comment or a captured quote. */
export function isExportable(note: MarginNote): boolean {
  return note.text.trim() !== '' || (note.quote?.trim() ?? '') !== '';
}

export function exportableNotes(notes: MarginNote[]): MarginNote[] {
  return notes.filter(isExportable);
}

export function exportableHighlights(highlights: Highlight[]): Highlight[] {
  return highlights.filter((highlight) => highlight.text.trim() !== '');
}

/** "1 note", "3 notes and 1 highlight", "2 highlights". */
export function describeAnnotations(noteCount: number, highlightCount: number): string {
  const parts: string[] = [];
  if (noteCount > 0 || highlightCount === 0) parts.push(`${noteCount} ${noteCount === 1 ? 'note' : 'notes'}`);
  if (highlightCount > 0)
    parts.push(`${highlightCount} ${highlightCount === 1 ? 'highlight' : 'highlights'}`);
  return parts.join(' and ');
}

/** "1 note on 1 page", "3 notes and 2 highlights on 4 pages", "2 highlights on 1 page". */
export function describeAnnotationCount(
  noteCount: number,
  highlightCount: number,
  pageCount: number,
): string {
  return `${describeAnnotations(noteCount, highlightCount)} on ${pageCount} ${pageCount === 1 ? 'page' : 'pages'}`;
}

/** "1 note on 1 page", "42 notes on 17 pages". */
export function describeNoteCount(noteCount: number, pageCount: number): string {
  return describeAnnotationCount(noteCount, 0, pageCount);
}

/** Escapes characters that would change how a one-line title renders as Markdown. */
export function escapeMarkdownInline(text: string): string {
  return text
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[\\`*_[\]<>~]/g, '\\$&')
    .replace(/(\s)(#+)$/, '$1\\$2');
}

const BLOCK_MARKER = /^( {0,3})(#{1,6}(?=\s|$)|[-*_=]{3,}\s*$)/;

/**
 * Note text as Markdown, kept from creating headings or rules of its own, which would
 * break the page structure of the exported document.
 */
function noteMarkdown(text: string): string {
  return markdownNoteText(text)
    .split('\n')
    .map((line) => line.replace(BLOCK_MARKER, '$1\\$2'))
    .join('\n');
}

function normalizeLineEndings(text: string): string {
  return text.replace(/\r\n?/g, '\n');
}

function toBlockquote(quote: string): string {
  return normalizeLineEndings(quote)
    .trim()
    .split('\n')
    .map((line) => (line.trim() === '' ? '>' : `> ${line.trimEnd()}`))
    .join('\n');
}

function formatExportDate(value: Date | number): string {
  return new Date(value).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

function renderNote(note: MarginNote): string {
  const parts: string[] = [];
  if (note.quote?.trim()) parts.push(toBlockquote(note.quote));
  const text = normalizeLineEndings(note.text).trim();
  if (text) parts.push(noteMarkdown(text));
  return parts.join('\n\n');
}

/** The passage as a blockquote, then its colour (Markdown has no standard highlight syntax). */
function renderHighlight(highlight: Highlight): string {
  const label = `_(highlight, ${NOTE_COLOR_LABELS[highlight.color].toLowerCase()})_`;
  return [toBlockquote(highlight.text), label].join('\n\n');
}

function renderItem(item: AnnotationItem): string {
  if (item.kind === 'highlight') return renderHighlight(item.highlight);
  if (!item.highlight) return renderNote(item.note);
  // The note's own quote is the highlight's text: show the passage once, then the note under it.
  const text = normalizeLineEndings(item.note.text).trim();
  return [renderHighlight(item.highlight), text ? noteMarkdown(text) : ''].filter(Boolean).join('\n\n');
}

/**
 * Renders notes and highlights as a Markdown document: one section per page
 * (ascending), top to bottom. A note's quote becomes a blockquote followed by
 * its text; a highlight is a blockquote followed by `_(highlight, colour)_`,
 * with the note written for it underneath. Notes with neither text nor quote
 * are skipped.
 */
export function notesToMarkdown({
  title,
  notes,
  highlights = [],
  outline = [],
  pageLabels = null,
  exportedAt,
}: MarkdownExportInput): string {
  const keptNotes = exportableNotes(notes);
  const keptHighlights = exportableHighlights(highlights);
  const groups = groupAnnotationsByPage(buildAnnotations(keptNotes, keptHighlights));
  const heading = escapeMarkdownInline(title) || 'Untitled';

  const sections = groups.map(({ page, items }) => {
    const section = sectionForPage(outline, page);
    const pageLabel = `Page ${escapeMarkdownInline(pageLabelFor(pageLabels, page))}`;
    const label = section ? `${pageLabel} · ${escapeMarkdownInline(section)}` : pageLabel;
    return [`## ${label}`, ...items.map(renderItem)].join('\n\n');
  });

  const counts = describeAnnotationCount(keptNotes.length, keptHighlights.length, groups.length);
  const intro = [
    `# Notes — ${heading}`,
    `_Exported from Scriptorium on ${formatExportDate(exportedAt)} · ${counts}_`,
  ].join('\n\n');

  const body = sections.join('\n\n---\n\n');
  return `${[intro, body].filter(Boolean).join('\n\n')}\n`;
}

/** Strips characters that are invalid in file names on common platforms. */
export function sanitizeFileName(name: string): string {
  // biome-ignore lint/suspicious/noControlCharactersInRegex: control characters are invalid in file names
  const invalid = /[<>:"/\\|?*\u0000-\u001f]/g;
  const cleaned = name.replace(invalid, ' ').replace(/\s+/g, ' ').trim();
  return Array.from(cleaned)
    .slice(0, MAX_FILE_STEM_LENGTH)
    .join('')
    .replace(/^\.+|[. ]+$/g, '');
}

/** "{safe title} — Notes.md" */
export function exportFileName(title: string): string {
  return `${sanitizeFileName(title) || 'Untitled'} — Notes.md`;
}
