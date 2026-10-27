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

The MVP is a local-first web app built with Vite, React, TypeScript, and
pdf.js. PDFs and reader data are stored in the browser's IndexedDB. PWA
installation, desktop packaging, and cross-device sync are later milestones.

### 1. Library

- [ ] A reader can import a PDF using a file picker or by dropping it onto the library.
- [ ] An imported book appears in a grid with its title, cover thumbnail, progress percentage, and last-opened time.
- [ ] Opening a book from the library continues from its saved location and zoom, or starts at the beginning if it has no saved progress.
- [ ] The library offers one-click continuation of the most recently opened book.
- [ ] Removing a book requires confirmation; confirming removes its PDF and associated local progress, bookmarks, and notes.
- [ ] Canceling removal leaves the book and its data unchanged.
- [ ] Invalid files and storage failures are reported without claiming the import succeeded.

### 2. Reader

- [ ] Pages scroll continuously in vertical order, with only nearby pages rendered so long books remain usable.
- [ ] Fit width, zoom in, and zoom out update the page display without changing the current reading location.
- [ ] PDF text can be selected in the reader when the PDF contains selectable text.
- [ ] The current page and total page count are visible and update as the reader scrolls.
- [ ] Go-to-page accepts a valid page number and moves to that page; invalid input does not navigate.
- [ ] Clicking an internal PDF link navigates to its destination in the book.
- [ ] MVP page numbers refer to the PDF's one-based page order.

### 3. Seamless progress

- [ ] Reading position includes the current page and position within that page; zoom is saved alongside it.
- [ ] Position and zoom changes are saved automatically after a short debounce, without a manual save action.
- [ ] Pending progress is saved when the tab is hidden.
- [ ] Reopening a book restores its saved page, intra-page position, and zoom.
- [ ] Reloading while reading reopens the same book at its saved location and zoom.
- [ ] The library shows progress as a percentage of the book at the saved reading position.
- [ ] A storage error is surfaced rather than presented as a successful save.

### 4. Navigation history

- [ ] A link, outline item, bookmark, go-to-page, or notes-review jump records the location being left.
- [ ] Back and Forward return to the recorded page and intra-page position in the expected order.
- [ ] A new jump after going Back clears the forward branch; ordinary scrolling does not create history entries.
- [ ] After a jump, a floating “Return to p. N” control identifies and returns to the location just left.
- [ ] Back, Forward, and Return do not create duplicate jump entries; unavailable history actions are disabled.
- [ ] Navigation history belongs to the current reading session; persisted progress remains the resume point.
- [ ] Search-result jumps will follow the same history rules when search is introduced in M2.

### 5. Bookmarks

- [ ] A reader can toggle a bookmark on the current page with a control or the B shortcut.
- [ ] Bookmarked pages show a ribbon indicator in the reader and appear in the sidebar list.
- [ ] A new bookmark is labeled from its containing outline section, or with its page number if none is available.
- [ ] A reader can edit a bookmark's label and jump to its page from the list.
- [ ] Bookmark state and labels persist after closing and reopening the book.

### 6. Outline

- [ ] When a PDF contains an outline, the sidebar displays its sections and nesting.
- [ ] Selecting an outline entry jumps to its destination and participates in navigation history.
- [ ] A book without an outline shows an empty state instead of a broken sidebar.

### 7. Margin notes

- [ ] Each page has a margin column; clicking it creates a note anchored at that vertical position on that page.
- [ ] A reader can create a note on the current page with the N shortcut.
- [ ] Selecting PDF text offers “Add margin note”; the note is anchored at the selection and retains the quoted text.
- [ ] A reader can edit a note's text, choose its color, and delete it.
- [ ] Note edits save automatically and survive closing and reopening the book.
- [ ] Each note retains its document, page, vertical anchor from 0 to 1, text, color, and selected quote when present.
- [ ] Notes on the same page are laid out without overlapping while retaining their original anchors.
- [ ] Notes remain associated with the correct page and anchor after zooming or virtualized page re-rendering.

### 8. Collated notes review

- [ ] A dedicated review view lists only pages with notes, in page order.
- [ ] Each listed page has a compact thumbnail with note markers and its notes in vertical order.
- [ ] Dense mode shows the notes as text without page thumbnails.
- [ ] A page or note's jump control opens that page in the reader and records the location being left.
- [ ] Notes can be edited inline in review; edits appear in the margin and persist after reopening.
- [ ] Export produces Markdown containing the book title, page references, notes, and any captured quotes.
- [ ] A book with no notes shows an empty review state.

### 9. Themes

- [ ] A reader can select Light (paper), Sepia, or Dark for the reading interface.
- [ ] Dark theme offers optional page-color inversion, independently switchable by the reader.
- [ ] The chosen theme and inversion setting persist after reload.

### 10. Keyboard-friendly reading

- [ ] The shortcuts below perform their named actions while the reader is active.
- [ ] Typing in a note, label, page field, or other editable control does not trigger reader letter shortcuts.
- [ ] Reader controls, note editing, and navigation are operable by keyboard with a visible focus indicator.
- [ ] Shortcuts are discoverable in the interface.

## MVP keyboard shortcuts

Shortcuts apply in the reader unless noted. Letter and punctuation shortcuts
are inactive in editable fields; normal editing shortcuts remain available.
Browser or operating-system shortcuts remain available except where an active
reader explicitly handles Alt+Left/Right for its own navigation history.

| Shortcut | Action |
| --- | --- |
| `B` | Toggle bookmark on the current page |
| `N` | Create a margin note at the middle of the visible part of the current page |
| `G` | Focus the go-to-page field |
| `[` | Toggle the sidebar |
| `Shift+R` | Open or close collated notes review |
| `Alt+Left` | Go back in reader navigation history |
| `Alt+Right` | Go forward in reader navigation history |
| `+` or `=` | Zoom in |
| `-` | Zoom out |
| `0` | Fit page width |
| `Esc` | Close an open dialog or dismiss a transient reader control |

`Ctrl+F` / `Cmd+F` is reserved for in-book search in M2; the MVP does not
intercept it. Browser zoom shortcuts are not repurposed in the MVP.

## Future milestones

Order reflects expected reader value, not a delivery commitment. Each milestone
builds on the dependable local reading and note-taking loop.

### M2 — Find and navigate

- **Full-text search:** search the book with a results list, page context, and history-aware jumps.
- **Page labels:** show and navigate printed page labels, including Roman numerals and offsets, alongside PDF page numbers.
- **Highlights:** add colored text highlights and link them to margin notes.
- **Link peek:** preview a figure, equation, or reference in a popover without leaving the current page.
- **Pinned reference pane:** keep a page, figure, or appendix visible beside the current reading location.
- **Accessibility:** strengthen screen-reader semantics, focus management, contrast, and keyboard navigation throughout.

### M3 — Study and review

- **Chapter progress:** show progress within outline sections as well as across the book.
- **Reading insights:** offer optional reading statistics and time-left estimates.
- **Focus mode:** reduce interface chrome while preserving essential navigation.
- **Rich notes:** support Markdown and LaTeX in note content.
- **Flashcards:** create spaced-repetition cards from notes for a later review session.
- **Ink notes:** support handwriting and drawing with pen devices.
- **Annotated PDF export:** export compatible notes and highlights into a copy of the PDF.

### M4 — Take the library further

- **Backup and restore:** move books, notes, bookmarks, and progress between browser installations.
- **Optional sync:** enable explicit, privacy-conscious cross-device synchronization without requiring an account for local use.
- **PWA:** make the app installable and support offline launch and reading of locally stored books.
- **Desktop app:** package with Tauri and support PDF file associations.
- **Multiple documents:** open books in tabs and move between them without losing each reading position.

## Non-goals

- A mandatory account, cloud upload, or network connection to read once the app has loaded.
- A general-purpose PDF editor or document authoring suite.
- Social feeds, public annotation sharing, or real-time collaboration.
- DRM circumvention or a replacement for a textbook marketplace.
- Guaranteed recovery of browser data after the reader clears site storage; backup is planned for M4.
