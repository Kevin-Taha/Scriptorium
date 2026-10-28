# Experiments lab — sprint review guide

This branch adds eleven proof-of-concept experiments to Scriptorium, each behind its own switch so
they can be tried one at a time and approved or rejected individually. **Everything is off by
default**: with no experiment switched on, Scriptorium behaves exactly as on `main`.

## Trying them

1. `bun run dev` and open the printed URL (or `bun run build && bun run preview`).
2. Click the **flask** button (top right of the library, or in the reader and review toolbars) to open
   the **Experiments lab**. Each card has a switch and numbered *How to try it* steps; changes apply
   instantly. *Turn all on* / *Turn all off* are at the top.
3. Or start with experiments already on from the address bar: `?exp=all`, `?exp=none`, or a list such as
   `?exp=minimap,focus-mode,rich-notes`.
4. Most steps use a book with an outline and internal links. The synthetic textbook used by the tests
   works well: `bun run fixture`, then open `e2e/.fixtures/sample-textbook.pdf`.

Prototype data (flashcard schedules, pins, reading activity, view choices) lives in `localStorage`
under `scriptorium.exp.*` and `scriptorium.experiments*`. It isn't synced or backed up, and the
IndexedDB schema is untouched.

## The experiments

| # | Experiment | Kind | What it is | How to try it |
| --- | --- | --- | --- | --- |
| 1 | **Command palette** (`command-palette`) | Feature | <kbd>Ctrl</kbd>/<kbd>⌘</kbd>+<kbd>K</kbd> opens one fuzzy box for chapters, pages (`p 30`, `xii`, `#12`), bookmarks, notes, highlights, library books and every action, including the other experiments' actions. | In a book press <kbd>Ctrl</kbd>+<kbd>K</kbd>; type “momentum”, “p 30”, a word from a note, or “dark”. ↑/↓ and <kbd>Enter</kbd>; jumps leave a *Return to p. N* pill. Also works in the library. |
| 2 | **Book minimap** (`minimap`) | Redesign | The book's fore-edge along the right of the reader: chapter thumb-index tabs, note dots, highlight bars, bookmark ribbons, a shaded trail of read pages, and an accent window for where you are. Hover previews a page; drag scrubs. | Add a few notes, a highlight and a bookmark. Hover the rail at the far right; click to jump; drag the window to scrub (<kbd>Esc</kbd> mid-drag goes back). <kbd>Tab</kbd> to it for ↑/↓, PageUp/PageDown, <kbd>Enter</kbd>. |
| 3 | **Focus mode** (`focus-mode`) | Redesign | Chrome slides away, the sidebar closes, neighbouring pages dim, margin notes recede until hovered, and an optional reading ruler follows your line. | Press <kbd>F</kbd> (or the focus button). Move to the top edge for the toolbar. <kbd>Shift</kbd>+<kbd>F</kbd> toggles the ruler. <kbd>F</kbd> or <kbd>Esc</kbd> leaves at the same place. |
| 4 | **Chapter progress & time left** (`chapter-progress`) | Improvement | A hairline under the toolbar split into chapters with your progress, and “≈ 7 min left in chapter” from your own reading pace. | Open the sample textbook; hover the strip under the toolbar for chapter details and click a segment to jump. Read a few pages and watch the estimate adapt. Hidden below ~1180 px wide. |
| 5 | **Welcome-back recap** (`welcome-back`) | Improvement | Reopening a book shows a card: the section you were in, page and time since you last read, chapter progress and your latest notes to jump to. | Read and add a note, go back to the library, reopen the book. (The prototype shows it on every reopen; the real rule would wait 12 hours.) |
| 6 | **Reading desk library** (`reading-desk`) | Redesign | A new home: a *Now reading* desk with chapter-aware progress and time today, a 26-week reading calendar with your streak, and *Desk / Grid / Shelf* views — the shelf shows spines coloured from each cover, sized by length, with unread books in a pile. | Open a book or two and turn a few pages, then return to the library. Use *Fill with sample activity* under the calendar, and switch Desk / Grid / Shelf; hover a spine. |
| 7 | **Pinned reference pane** (`pinned-pane`) | Feature | Keep a figure, table or appendix page beside your reading in a floating, draggable, resizable pane with tabs (up to 5 pins per book), or dock it as a side column. | Press <kbd>P</kbd> to pin the current page, then read elsewhere. On p. 15 hover “see Figure 1.1 on page 7” and choose **Pin** in the preview. Drag, resize, double-click to zoom, *Dock to side*. |
| 8 | **Markdown & math in notes** (`rich-notes`) | Feature | Notes render **bold**, *italic*, lists, quotes, links, `code` and KaTeX maths in the margin and the review; editing shows the source with a live maths preview. KaTeX loads lazily. | Press <kbd>N</kbd> and type `The **second law**: $F = ma$, so $a = \frac{F}{m}$.`, then <kbd>Esc</kbd>. Try `$$W = \int F\,dx$$` and a `- list`. Open Review notes (<kbd>Shift</kbd>+<kbd>R</kbd>). |
| 9 | **Flashcards from notes** (`flashcards`) | Feature | `Question :: Answer` notes and `{{cloze}}` terms become cards; highlights become cloze cards automatically. Short spaced-repetition sessions on an index card (SM-2-style, keys 1–4). | Add `What is inertia? :: Resistance to changes in motion` and highlight a sentence. Choose **Study** in Review notes (or the cap button in the reader, or <kbd>Ctrl</kbd>+<kbd>K</kbd> → *Study flashcards*). <kbd>Space</kbd> flips; 1–4 grades. |
| 10 | **Annotated PDF export** (`pdf-export`) | Feature | Downloads a copy of the PDF with highlights as real `/Highlight` annotations and margin notes as sticky notes, so they appear in Acrobat, Preview, Edge, etc. | Add a highlight and a note, open Review notes, choose **Export PDF**, and open the downloaded file in another PDF viewer. |
| 11 | **Read aloud** (`read-aloud`) | Feature | The system voice reads from where you are, highlighting the current sentence (and word), following along and turning pages; a mini player handles speed, voice and skipping. | Press <kbd>Shift</kbd>+<kbd>A</kbd> (or the speaker button); select text first to start there. Use the mini player (top right). <kbd>Shift</kbd>+<kbd>A</kbd> pauses, <kbd>Esc</kbd> stops. Without a system voice it simulates timing. |

## Known limitations (prototype-level)

- **Command palette:** results are capped per group; the page-number parser follows the go-to-page field's rules.
- **Minimap:** every page gets an equal slice of the rail; a click lands at the top of the clicked page; it hides the native scrollbar (including the horizontal one when zoomed past the window).
- **Focus mode:** notes come back while the pointer is over the page being read; the ruler's dimming is subtle on inverted dark pages.
- **Chapter progress:** chapters come from top-level outline entries only; pace falls back to 90 s/page until there's enough reading history.
- **Reading desk:** chapter details appear only for books opened while the experiment is on; *Clear* wipes the whole local reading log.
- **Pinned pane:** pointer-only move/resize; stepping a pin with ‹ › resets its title and offset.
- **Rich notes:** no headings, tables, images or code blocks; very long inline maths clips rather than scrolls.
- **Flashcards:** the key term for a highlight's cloze is a heuristic; schedules live in `localStorage`.
- **PDF export:** encrypted PDFs are refused; bookmarks aren't written into the PDF outline.
- **Read aloud:** sentences that cross a page break are read as two pieces; table cells read as short sentences.

## How it's built

- `src/experiments/registry.ts` — ids, titles, summaries and the *How to try it* steps shown in the lab.
- `src/experiments/experimentsStore.ts` — on/off flags (`useExperiment`, `isExperimentOn`), persisted, with `?exp=` support.
- `src/experiments/slots.tsx` + `types.ts` — each experiment's `index.tsx` exports components for named
  slots (`App`, `Reader`, `ReaderToolbar`, `ReaderToolbarStrip`, `PageOverlay`, `Library`, `ReviewToolbar`).
  Only switched-on experiments are mounted, each inside its own error boundary.
- `src/experiments/shared/` — window events experiments use to trigger each other (the palette starts a
  study session, pins a page, …) and a local reading-activity log (used by chapter progress and the desk).
- A few existing components have small, flag-gated hooks: `LibraryView` (reading desk), `MarginNoteCard`
  and `ReviewNote` (rich notes), `LinkPeek` (the *Pin* button).

**Graduating an experiment:** move its code into the matching `src/features/*` folder, replace its slot
mounts with direct usage, delete its flag checks and registry entry, and move any `localStorage` data
into the repository if it should sync.
