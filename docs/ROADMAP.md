# Scriptorium product roadmap

## Vision

Make reading a textbook on a screen feel as natural as reading a well-marked
book: easy to settle into, easy to navigate, and easy to return to.

## Product principles

- **Never lose your place.** Progress should follow the reader without a save ritual.
- **Notes live where you think.** Capture ideas beside the passage, then review them together.
- **References are a round trip.** Exploring a citation should not cost your place.
- **Local-first and private.** Books and reading data stay on the device unless the reader chooses otherwise.
- **Calm and attractive.** Reading comes first; controls should be clear without competing for attention.
- **Keyboard-friendly by design.** Frequent actions should be reachable without a mouse.

## Readers and jobs to be done

- **Students:** work through chapters, annotate explanations, and revisit notes before an exam.
- **Researchers and self-directed learners:** follow references without losing their argument or place.
- **Professionals:** return to a long technical book and quickly find prior notes and bookmarks.

## Milestone 1 — A dependable reading loop

**Status: delivered.** Every criterion below is covered by the Playwright suite in `e2e/`.

The MVP is a local-first web app built with Vite, React, TypeScript, and
pdf.js. PDFs and reader data are stored in the browser's IndexedDB. PWA
installation, desktop packaging, and cross-device sync are later milestones.

### 1. Library

- [x] A reader can import a PDF using a file picker or by dropping it onto the library.
- [x] An imported book appears in a grid with its title, cover thumbnail, progress percentage, and last-opened time.
- [x] Opening a book from the library continues from its saved location and zoom, or starts at the beginning if it has no saved progress.
- [x] The library offers one-click continuation of the most recently opened book.
- [x] Removing a book requires confirmation; confirming removes its PDF and associated local progress, bookmarks, and notes.
- [x] Canceling removal leaves the book and its data unchanged.
- [x] Invalid files and storage failures are reported without claiming the import succeeded.

### 2. Reader

- [x] Pages scroll continuously in vertical order, with only nearby pages rendered so long books remain usable.
- [x] Fit width, zoom in, and zoom out update the page display without changing the current reading location.
- [x] PDF text can be selected in the reader when the PDF contains selectable text.
- [x] The current page and total page count are visible and update as the reader scrolls.
- [x] Go-to-page accepts a valid page number and moves to that page; invalid input does not navigate.
- [x] Clicking an internal PDF link navigates to its destination in the book.
- [x] MVP page numbers refer to the PDF's one-based page order.

### 3. Seamless progress

- [x] Reading position includes the current page and position within that page; zoom is saved alongside it.
- [x] Position and zoom changes are saved automatically after a short debounce, without a manual save action.
- [x] Pending progress is saved when the tab is hidden.
- [x] Reopening a book restores its saved page, intra-page position, and zoom.
- [x] Reloading while reading reopens the same book at its saved location and zoom.
- [x] The library shows progress as a percentage of the book at the saved reading position.
- [x] A storage error is surfaced rather than presented as a successful save.

### 4. Navigation history

- [x] A link, outline item, bookmark, go-to-page, or notes-review jump records the location being left.
- [x] Back and Forward return to the recorded page and intra-page position in the expected order.
- [x] A new jump after going Back clears the forward branch; ordinary scrolling does not create history entries.
- [x] After a jump, a floating “Return to p. N” control identifies and returns to the location just left.
- [x] Back, Forward, and Return do not create duplicate jump entries; unavailable history actions are disabled.
- [x] Navigation history belongs to the current reading session; persisted progress remains the resume point.
- [x] Search-result jumps will follow the same history rules when search is introduced in M2.

### 5. Bookmarks

- [x] A reader can toggle a bookmark on the current page with a control or the B shortcut.
- [x] Bookmarked pages show a ribbon indicator in the reader and appear in the sidebar list.
- [x] A new bookmark is labeled from its containing outline section, or with its page number if none is available.
- [x] A reader can edit a bookmark's label and jump to its page from the list.
- [x] Bookmark state and labels persist after closing and reopening the book.

### 6. Outline

- [x] When a PDF contains an outline, the sidebar displays its sections and nesting.
- [x] Selecting an outline entry jumps to its destination and participates in navigation history.
- [x] A book without an outline shows an empty state instead of a broken sidebar.

### 7. Margin notes

- [x] Each page has a margin column; clicking it creates a note anchored at that vertical position on that page.
- [x] A reader can create a note on the current page with the N shortcut.
- [x] Selecting PDF text offers “Add margin note”; the note is anchored at the selection and retains the quoted text.
- [x] A reader can edit a note's text, choose its color, and delete it.
- [x] Note edits save automatically and survive closing and reopening the book.
- [x] Each note retains its document, page, vertical anchor from 0 to 1, text, color, and selected quote when present.
- [x] Notes on the same page are laid out without overlapping while retaining their original anchors.
- [x] Notes remain associated with the correct page and anchor after zooming or virtualized page re-rendering.

### 8. Collated notes review

- [x] A dedicated review view lists only pages with notes, in page order.
- [x] Each listed page has a compact thumbnail with note markers and its notes in vertical order.
- [x] Dense mode shows the notes as text without page thumbnails.
- [x] A page or note's jump control opens that page in the reader and records the location being left.
- [x] Notes can be edited inline in review; edits appear in the margin and persist after reopening.
- [x] Export produces Markdown containing the book title, page references, notes, and any captured quotes.
- [x] A book with no notes shows an empty review state.

### 9. Themes

- [x] A reader can select Light (paper), Sepia, or Dark for the reading interface.
- [x] Dark theme offers optional page-color inversion, independently switchable by the reader.
- [x] The chosen theme and inversion setting persist after reload.

### 10. Keyboard-friendly reading

- [x] The shortcuts below perform their named actions while the reader is active.
- [x] Typing in a note, label, page field, or other editable control does not trigger reader letter shortcuts.
- [x] Reader controls, note editing, and navigation are operable by keyboard with a visible focus indicator.
- [x] Shortcuts are discoverable in the interface.

## Keyboard shortcuts

Shortcuts apply in the reader unless noted. Letter and punctuation shortcuts
are inactive in editable fields; normal editing shortcuts remain available.
Browser or operating-system shortcuts remain available except where an active
reader explicitly handles them (Alt+Left/Right for navigation history,
Ctrl/Cmd+F for in-book search). Press `?` in the reader to see them all.

| Shortcut | Action |
| --- | --- |
| `B` | Toggle bookmark on the current page |
| `N` | Create a margin note at the middle of the visible part of the current page (quoting selected text, if any) |
| `G` | Go to: a page (printed labels work; `#N` for a PDF page number), chapter, bookmark, note or action |
| `F` | Focus mode (`Esc` also leaves) |
| `R` | Reading ruler |
| `Ctrl+B` / `Cmd+B`, `Ctrl+I` / `Cmd+I` | Bold / italic while writing a note |
| `Ctrl+F` / `Cmd+F` or `/` | Find in the book (opens Go to) |
| `F3` / `Shift+F3` | Next / previous match |
| `[` | Toggle the sidebar |
| `Shift+R` | Open or close collated notes review |
| `Alt+Left` | Go back in reader navigation history |
| `Alt+Right` | Go forward in reader navigation history |
| `+` or `=` | Zoom in |
| `-` | Zoom out |
| `0` | Fit page width |
| `?` | Show keyboard shortcuts |
| `Esc` | Leave focus mode, close an open dialog or dismiss a transient reader control |

Browser zoom shortcuts are not repurposed.

## Future milestones

Order reflects expected reader value, not a delivery commitment. Each milestone
builds on the dependable local reading and note-taking loop.

### M2 — Find and navigate

- ✅ **Full-text search:** search the book from Go to, with page context, in-page highlights, and history-aware jumps.
- ✅ **Page labels:** show and navigate printed page labels, including Roman numerals and offsets, alongside PDF page numbers.
- ✅ **Link peek:** preview a figure, equation, or reference in a popover without leaving the current page.
- ✅ **Highlights:** add colored text highlights and link them to margin notes.
- ✅ **Go to:** one box (<kbd>G</kbd>) for pages, chapters, bookmarks, notes and reader actions.
- ✅ **Book map:** the whole book along the reader's edge — chapters, annotations, hover previews, snapping to notes and bookmarks.
- **Pinned reference pane:** keep a page, figure, or appendix visible beside the current reading location ([#8](https://github.com/Kevin-Taha/Scriptorium/issues/8)).
- **Narrow layouts:** collapse the margin column to a rail of note markers on small windows and tablets.
- **Accessibility:** strengthen screen-reader semantics, focus management, contrast, and keyboard navigation throughout.

### M3 — Study and review

- ✅ **Chapter progress:** show progress within outline sections as well as across the book (pages and percentages — no time estimates).
- **Reading insights:** offer optional reading statistics.
- ✅ **Focus mode:** reduce interface chrome while preserving essential navigation; with an optional reading ruler.
- **Rich notes:** ✅ bold and italic (<kbd>Ctrl</kbd>+<kbd>B</kbd> / <kbd>Ctrl</kbd>+<kbd>I</kbd>); Markdown and LaTeX if readers need more.
- **Flashcards:** create spaced-repetition cards from notes for a later review session ([#6](https://github.com/Kevin-Taha/Scriptorium/issues/6)).
- **Read aloud:** listen with a high-quality, local voice while the current sentence is highlighted ([#7](https://github.com/Kevin-Taha/Scriptorium/issues/7)).
- **Ink notes:** support handwriting and drawing with pen devices.
- **Annotated PDF export:** export compatible notes and highlights into a copy of the PDF.

### M4 — Take the library further

- ✅ **Backup and restore:** move notes, highlights, bookmarks, and progress between browser installations.
- ✅ **Folder sync:** link a folder of PDFs (local, OneDrive, Google Drive for desktop, Dropbox) and share books, notes, and progress across devices — no account. See [DATA.md](DATA.md).
- **Direct cloud sync:** ✅ Google Drive without its desktop app (tablets, phones), for accounts the site owner approves — see [DATA.md](DATA.md#google-drive-folders-approval-required). OneDrive through Microsoft Graph is still to come.
- ✅ **PWA:** make the app installable and support offline launch and reading of locally stored books.
- **Desktop app:** package with Tauri and support PDF file associations.
- **Multiple documents:** open books in tabs and move between them without losing each reading position.

## Non-goals

- A mandatory account, cloud upload, or network connection to read once the app has loaded.
- A general-purpose PDF editor or document authoring suite.
- Social feeds, public annotation sharing, or real-time collaboration.
- DRM circumvention or a replacement for a textbook marketplace.
- Guaranteed recovery of browser data after the reader clears site storage; backup is planned for M4.
