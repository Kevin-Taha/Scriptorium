# Scriptorium

**A calm, local-first PDF reader designed for textbooks and long-form reading.**

Scriptorium treats a PDF the way you treat a well-used textbook: you write in the margins,
flip back to a figure and return to your place without thinking about it, and pick up exactly
where you left off — days later.

## Features

- **Margin notes, per page.** Every page has a margin column. Click beside a passage to jot a
  note anchored at that spot, or select text and choose *Add margin note* to keep the quote.
  Notes never overlap, come in five colours, and save as you type.
- **Highlights linked to notes.** Select text and pick a colour (or press <kbd>H</kbd>) to
  highlight it like a marker. Click a highlight to recolour it, delete it, or write a note
  that stays attached to the passage. Highlights appear in the review and the Markdown export.
- **Collated notes review.** A dense, page-by-page view of every page you've annotated — with
  page thumbnails, filters, inline editing, and Markdown export — for fast review before an exam.
- **Never lose your place.** Reading position (page, position on the page, and zoom) is saved
  continuously and restored when you reopen a book.
- **Flip to a reference and come back.** Following a link, an outline entry, a bookmark, or
  jumping to a page records where you were. A *Return to p. N* pill and Back/Forward
  (<kbd>Alt</kbd>+<kbd>←</kbd>/<kbd>→</kbd>) take you straight back.
- **Peek at references.** Hover a link like *"see Figure 3.2"* to preview the figure in a card
  without leaving the page; jump there only if you want to.
- **Search the whole book.** <kbd>Ctrl</kbd>+<kbd>F</kbd> searches every page with results grouped
  by section, highlights on the page, and a single *Return* back to where you started.
- **Bookmarks and contents.** Bookmark pages with <kbd>B</kbd>; labels default to the chapter
  they're in. The table of contents tracks the section you're reading.
- **Real page numbers.** Printed page labels (roman-numeral front matter, offset numbering) are
  shown and accepted everywhere, so "p. 142" means the book's page 142.
- **Built for long books.** Virtualized rendering keeps 1,000-page textbooks fast and smooth.
- **Easy on the eyes.** Light, sepia, and dark themes, with optional page inversion for night reading.
- **Your library, on every device.** Link a folder of PDFs — on your computer, or inside OneDrive,
  Google Drive or Dropbox — and Scriptorium reads books from it and keeps notes beside them, so every
  computer that links the folder shares books, notes and reading progress.
- **Hard to lose.** Notes are saved as you type, the library asks the browser for persistent storage,
  and you can export everything to a backup file and restore it anywhere.
- **Private by default.** No account and no server: books and notes stay on your devices and in folders
  you choose. See [`docs/DATA.md`](docs/DATA.md).

## Keyboard shortcuts

| Shortcut | Action |
| --- | --- |
| <kbd>B</kbd> | Toggle bookmark on the current page |
| <kbd>N</kbd> | New margin note on the current page (uses the selected text as a quote) |
| <kbd>H</kbd> | Highlight the selected text in the colour used last |
| <kbd>G</kbd> | Go to page (printed labels work; `#N` for a PDF page number) |
| <kbd>Ctrl</kbd>+<kbd>F</kbd> or <kbd>/</kbd> | Search the book; <kbd>Enter</kbd> / <kbd>Shift</kbd>+<kbd>Enter</kbd> step through results |
| <kbd>[</kbd> | Toggle the sidebar |
| <kbd>Shift</kbd>+<kbd>R</kbd> | Open or close the notes review |
| <kbd>Alt</kbd>+<kbd>←</kbd> / <kbd>Alt</kbd>+<kbd>→</kbd> | Back / forward through jumps |
| <kbd>+</kbd> / <kbd>-</kbd> / <kbd>0</kbd> | Zoom in / zoom out / fit width |
| <kbd>?</kbd> | Show all keyboard shortcuts |
| <kbd>Esc</kbd> | Dismiss the return pill or close a menu |

## Getting started

Scriptorium uses [Bun](https://bun.sh) — a single install that provides the runtime, package
manager and script runner. Install it once:

```sh
# Windows (PowerShell)
powershell -c "irm bun.sh/install.ps1 | iex"
# macOS / Linux
curl -fsSL https://bun.sh/install | bash
```

Then, from the repository:

```sh
bun install
bun run dev
```

Open the printed local URL and drop a PDF onto the library.

### Scripts

| Command | Description |
| --- | --- |
| `bun run dev` | Start the development server |
| `bun run build` | Type-check and build for production into `dist/` |
| `bun run preview` | Serve the production build locally |
| `bun run check` | Type-check, lint, check formatting, unit test, and build |
| `bun run lint` / `bun run format` | Lint / format the code (Biome) |
| `bun run test` | Run unit tests (Vitest) |
| `bun run e2e` | Run end-to-end tests (Playwright) against the production build |
| `bun run fixture` | Generate the synthetic textbook used by the end-to-end tests |

The first end-to-end run needs a browser: `bunx playwright install chromium`.
## Install

Install Scriptorium from your browser's address bar or the **Install app** button in the
library when available. Once installed and loaded, your library and previously imported books
work offline. On supported desktop browsers, you can also open PDFs with Scriptorium from your
operating system.

## Architecture

Scriptorium is a single-page React application built with Vite and TypeScript. PDFs are rendered
with [pdf.js](https://mozilla.github.io/pdf.js/) by a custom virtualized viewer that lays each page
out beside its margin column.

```
src/
  app/          App shell, hash router, settings and theming
  components/   Shared UI primitives (toasts)
  features/
    library/    Library screen and PDF import
    reader/     Reader shell, viewer engine, zoom, link peek
    navigation/ Jump history, return pill, bookmarks, outline, page labels, shortcuts
    notes/      Margin notes, collated review, Markdown export
    search/     Full-text index, search panel and in-page highlights
  lib/
    pdf/        pdf.js loading, destinations and outline, thumbnails
    storage/    IndexedDB schema and repository
  styles/       Design tokens and base styles
docs/           Product roadmap and design spec
e2e/            Playwright end-to-end tests
scripts/        Development scripts (test fixture generator)
```

All persistence goes through `src/lib/storage/repository.ts`, which keeps the door open for a
filesystem-backed store in a future desktop build. State lives in small
[Zustand](https://github.com/pmndrs/zustand) stores per feature.

See [`docs/ROADMAP.md`](docs/ROADMAP.md) for what's next, [`docs/DATA.md`](docs/DATA.md) for how data is stored and synced, and [`docs/DESIGN.md`](docs/DESIGN.md)
for the design system.
