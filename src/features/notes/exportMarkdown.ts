import { sectionForPage } from '@/lib/pdf/outline';
import type { MarginNote, OutlineItem } from '@/lib/types';
import { pageLabelFor } from '../navigation/pageLabels';
import { groupNotesByPage } from './notesStore';

export interface MarkdownExportInput {
  title: string;
  notes: MarginNote[];
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

/** "1 note on 1 page", "42 notes on 17 pages". */
export function describeNoteCount(noteCount: number, pageCount: number): string {
  return `${noteCount} ${noteCount === 1 ? 'note' : 'notes'} on ${pageCount} ${pageCount === 1 ? 'page' : 'pages'}`;
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
 * Keeps note text from creating headings or rules of its own, which would break
 * the page structure of the exported document.
 */
function neutralizeBlockMarkers(text: string): string {
  return text
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
  if (text) parts.push(neutralizeBlockMarkers(text));
  return parts.join('\n\n');
}

/**
 * Renders notes as a Markdown document: one section per page (ascending), with
 * each note's quote as a blockquote followed by its text. Notes with neither
 * text nor quote are skipped.
 */
export function notesToMarkdown({
  title,
  notes,
  outline = [],
  pageLabels = null,
  exportedAt,
}: MarkdownExportInput): string {
  const groups = groupNotesByPage(exportableNotes(notes));
  const noteCount = groups.reduce((sum, group) => sum + group.notes.length, 0);
  const heading = escapeMarkdownInline(title) || 'Untitled';

  const sections = groups.map(({ page, notes: pageNotes }) => {
    const section = sectionForPage(outline, page);
    const pageLabel = `Page ${escapeMarkdownInline(pageLabelFor(pageLabels, page))}`;
    const label = section ? `${pageLabel} · ${escapeMarkdownInline(section)}` : pageLabel;
    return [`## ${label}`, ...pageNotes.map(renderNote)].join('\n\n');
  });

  const intro = [
    `# Notes — ${heading}`,
    `_Exported from Scriptorium on ${formatExportDate(exportedAt)} · ${describeNoteCount(noteCount, groups.length)}_`,
  ].join('\n\n');

  const body = sections.join('\n\n---\n\n');
  return `${[intro, body].filter(Boolean).join('\n\n')}\n`;
}

/** Strips characters that are invalid in file names on common platforms. */
export function sanitizeFileName(name: string): string {
  // eslint-disable-next-line no-control-regex
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
