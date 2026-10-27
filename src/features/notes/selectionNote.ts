import { useNotesStore } from './notesStore';

export const MAX_QUOTE_LENGTH = 600;

/** Collapses whitespace and caps the length of text captured from the page. */
export function normalizeQuote(raw: string, maxLength = MAX_QUOTE_LENGTH): string {
  const text = raw.replace(/\s+/g, ' ').trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1).trimEnd()}…`;
}

export interface PageSelection {
  page: number;
  /** Vertical anchor as a fraction (0..1) of the page height: the middle of the first selected line. */
  y: number;
  quote: string;
  /** Viewport rectangle of the last selected line. */
  endRect: DOMRect;
  /** True when the selection spans more than one line of text. */
  multiline: boolean;
}

function sheetOf(node: Node | null): HTMLElement | null {
  const element = node instanceof Element ? node : (node?.parentElement ?? null);
  return element?.closest<HTMLElement>('.page-sheet') ?? null;
}

/**
 * Describes the current text selection if it lies within one page sheet,
 * otherwise returns null (collapsed, empty, or spanning pages).
 */
export function readPageSelection(selection: Selection | null = window.getSelection()): PageSelection | null {
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) return null;
  const range = selection.getRangeAt(0);
  const sheet = sheetOf(range.startContainer);
  if (!sheet || sheet !== sheetOf(range.endContainer)) return null;

  const page = Number(sheet.dataset.page);
  const quote = normalizeQuote(selection.toString());
  const sheetRect = sheet.getBoundingClientRect();
  if (!Number.isInteger(page) || !quote || sheetRect.height <= 0) return null;

  // Ignore container-sized rects (e.g. pdf.js's end-of-content sentinel) so only text lines count.
  const lines = Array.from(range.getClientRects()).filter(
    (rect) => rect.width > 1 && rect.height > 1 && rect.height < sheetRect.height * 0.25,
  );
  const first = lines[0] ?? range.getBoundingClientRect();
  const last = lines.at(-1) ?? first;

  return {
    page,
    y: (first.top + first.height / 2 - sheetRect.top) / sheetRect.height,
    quote,
    endRect: last,
    multiline: last.top - first.top > first.height / 2,
  };
}

/**
 * Creates a note quoting the current page selection and clears the selection.
 * Returns false (creating nothing) when there is no usable selection, so the
 * `N` shortcut can fall back to a plain note.
 */
export function addNoteFromSelection(): boolean {
  const { docId, addNote } = useNotesStore.getState();
  if (!docId) return false;
  const selection = readPageSelection();
  if (!selection) return false;
  addNote({ page: selection.page, y: selection.y, quote: selection.quote });
  window.getSelection()?.removeAllRanges();
  return true;
}
