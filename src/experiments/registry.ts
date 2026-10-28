/**
 * Proof-of-concept experiments, each behind its own switch in the Experiments
 * lab (flask button in the library and reader toolbars). Everything is off by
 * default so the shipped experience is unchanged until an experiment is turned on.
 */

export const EXPERIMENT_IDS = [
  'command-palette',
  'minimap',
  'focus-mode',
  'chapter-progress',
  'welcome-back',
  'reading-desk',
  'pinned-pane',
  'rich-notes',
  'flashcards',
  'pdf-export',
  'read-aloud',
] as const;

export type ExperimentId = (typeof EXPERIMENT_IDS)[number];

export type ExperimentKind = 'Feature' | 'Redesign' | 'Improvement';

export interface ExperimentMeta {
  id: ExperimentId;
  title: string;
  kind: ExperimentKind;
  /** One or two sentences: what it is and why a reader would want it. */
  summary: string;
  /** Short, concrete steps for trying it on the sample textbook. */
  tryIt: string[];
  /** Keyboard shortcut introduced by the experiment, if any. */
  shortcut?: string;
}

export const EXPERIMENTS: ExperimentMeta[] = [
  {
    id: 'command-palette',
    title: 'Command palette',
    kind: 'Feature',
    summary:
      'One keyboard-first box to jump anywhere: chapters, pages, bookmarks, notes and highlights, plus every reader action.',
    tryIt: [
      'Open a book and press Ctrl+K (⌘K on a Mac).',
      'Type “momentum”, “p 30”, a word from one of your notes, or “dark”.',
      'Use ↑/↓ and Enter; the jump is recorded so Return to p. N still works.',
    ],
    shortcut: 'Ctrl+K',
  },
  {
    id: 'minimap',
    title: 'Book minimap',
    kind: 'Redesign',
    summary:
      'A slim fore-edge on the right of the reader that maps the whole book: chapters as thumb-index tabs, your notes, highlights and bookmarks, and pages you’ve read shaded like a well-thumbed edge. Hover to preview a page, drag to scrub.',
    tryIt: [
      'Open a book and add a few notes (N), a highlight (select text, H) and a bookmark (B).',
      'Hover the rail at the right edge of the pages to preview any page.',
      'Click to jump, or drag the accent window to scrub (Esc mid-drag goes back).',
      'Tab to the rail: ↑/↓ by page, PageUp/PageDown by chapter, Enter to go.',
    ],
  },
  {
    id: 'focus-mode',
    title: 'Focus mode',
    kind: 'Redesign',
    summary:
      'Strips the reader down to the page: chrome fades away until you need it, margin notes recede, and an optional reading ruler follows your line.',
    tryIt: [
      'Open a book and press F (or the focus button in the toolbar).',
      'Move the pointer to the top edge to bring the toolbar back.',
      'Press Shift+F to toggle the reading ruler (it remembers your choice); F or Esc leaves.',
    ],
    shortcut: 'F',
  },
  {
    id: 'chapter-progress',
    title: 'Chapter progress & time left',
    kind: 'Improvement',
    summary:
      'A hairline under the toolbar shows the book divided into chapters with your position in the current one, and estimates the time left in the chapter from your own reading pace.',
    tryIt: [
      'Open a book with an outline (the sample textbook has one).',
      'Look at the thin segmented bar under the toolbar; hover it for chapter names.',
      'Read a few pages; the “~N min left in chapter” estimate adapts to your pace.',
    ],
  },
  {
    id: 'welcome-back',
    title: 'Welcome-back recap',
    kind: 'Improvement',
    summary:
      'Reopening a book after a break shows a short recap card: where you stopped, the section you were in and your latest notes, so you can settle back in.',
    tryIt: [
      'Open a book, read and add a note, then go back to the library.',
      'Reopen it. (In the prototype the card appears on every reopen; the real one would wait for a gap of 12 hours or more.)',
      'Choose Continue, or jump straight to one of your recent notes.',
    ],
  },
  {
    id: 'reading-desk',
    title: 'Reading desk library',
    kind: 'Redesign',
    summary:
      'A warmer home screen: books in progress on a desk with chapter-level progress, a reading-activity calendar with your streak, and a bookshelf view with spines, where unread books wait in a pile.',
    tryIt: [
      'Open a book or two and move a few pages in each (chapter details are recorded while you read).',
      'Back in the library, switch between Desk, Grid and Shelf above your books; hover or Tab to a spine.',
      'No reading history yet? Use “Fill with sample activity” under the calendar.',
    ],
  },
  {
    id: 'pinned-pane',
    title: 'Pinned reference pane',
    kind: 'Feature',
    summary:
      'Keep a figure, table or appendix page in view while you read elsewhere. Pinned pages sit in a floating, resizable pane you can page through.',
    tryIt: [
      'In a book, press P to pin the current page, then read elsewhere.',
      'Or, on p. 15, hover “see Figure 1.1 on page 7” and choose Pin in the preview card.',
      'Drag the pane, resize it from a corner, switch pins with its tabs, double-click to zoom, or Dock it to the side.',
    ],
    shortcut: 'P',
  },
  {
    id: 'rich-notes',
    title: 'Markdown & math in notes',
    kind: 'Feature',
    summary:
      'Notes render **bold**, _italic_, lists, quotes, links, `code` and LaTeX maths ($F = ma$, $$\\int_0^t v\\,dt$$) in the margin and the review, and stay plain source while you edit, with a live preview for maths.',
    tryIt: [
      'Add a margin note (N) and type: The **second law**: $F = m a$.',
      'Press Esc to finish editing and see it rendered; click it to edit the source again.',
      'Open Review notes (Shift+R) to see the same rendering there.',
    ],
  },
  {
    id: 'flashcards',
    title: 'Flashcards from notes',
    kind: 'Feature',
    summary:
      'Turns notes and highlights into spaced-repetition cards — “Question :: Answer” notes become Q/A cards, highlights become cloze cards — and runs short study sessions.',
    tryIt: [
      'Add a note like “What is inertia? :: Resistance to changes in motion” or “The SI unit of force is the {{newton}}”, and highlight a sentence.',
      'Open Review notes and choose Study (or the cap button in the reader toolbar, or Ctrl+K → “Study flashcards”).',
      'Reveal each card with Space and grade it 1–4; due cards come back later (up to 10 new cards per session).',
    ],
  },
  {
    id: 'pdf-export',
    title: 'Annotated PDF export',
    kind: 'Feature',
    summary:
      'Downloads a copy of the PDF with your highlights and margin notes written in as standard PDF annotations, readable in any other PDF app.',
    tryIt: [
      'Add a highlight and a note or two.',
      'Open Review notes and choose Export PDF (or Ctrl+K → “Export annotated PDF” in the reader).',
      'Open the downloaded file in your browser’s or OS’s PDF viewer.',
    ],
  },
  {
    id: 'read-aloud',
    title: 'Read aloud',
    kind: 'Feature',
    summary:
      'Listens through the page with the system voice, following along with a highlight on the sentence being read and turning pages by itself.',
    tryIt: [
      'Open a book and press Shift+A, or the speaker button in the toolbar. Select text first to read from there.',
      'Watch the current sentence highlight; change speed or voice in the mini player (top right).',
      'Pause with Shift+A again; Esc stops.',
    ],
    shortcut: 'Shift+A',
  },
];

export function experimentMeta(id: ExperimentId): ExperimentMeta {
  return EXPERIMENTS.find((e) => e.id === id)!;
}
