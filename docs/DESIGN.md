# Scriptorium — Design Spec

A calm, warm reading room for long-form PDFs: paper-toned surfaces, one rubric accent, serif where you *read or write*, sans-serif where you *operate*.

Files: `src/styles/tokens.css` (all variables, 3 themes) · `src/styles/base.css` (reset + primitives). Components consume tokens only — **no raw hex values in component CSS.**

## 1. Principles

1. **The page is the hero.** Chrome recedes (flat, low-contrast borders); the white sheet carries the only strong shadow.
2. **Margins are for thinking.** Notes feel like paper slips tucked beside the text, never floating UI over it.
3. **Quiet until needed.** Actions appear on hover/focus; nothing animates unless it explains a change.
4. **One accent.** Rubric oxblood marks *what you can act on or where you are* (primary button, current section, bookmark ribbon, links). Note colors are content, not chrome.
5. **Never lose your place.** Jumps always leave a visible way back (return pill).
6. **Accessible by construction.** Every text pairing is AA in every theme; focus is always visible.

## 2. Setup

```ts
// main.tsx — fonts first, then tokens, then base
import "@fontsource-variable/inter";                          // family "Inter Variable"
import "@fontsource-variable/source-serif-4";                 // family "Source Serif 4 Variable"
import "@fontsource-variable/source-serif-4/wght-italic.css"; // italics for quotes
import "./styles/tokens.css";
import "./styles/base.css";
```

Install: `@fontsource-variable/inter`, `@fontsource-variable/source-serif-4`, `lucide-react`. Icons: 18px, `stroke-width` 1.75 (base.css also sets `.lucide { stroke-width: 1.75 }`); 16px inside `.btn--sm`/segmented items.

Theme: `document.documentElement.dataset.theme = "light" | "sepia" | "dark"`. Set it (and `.invert-pages` on `<html>`) in an inline script before first paint to avoid a flash. `.invert-pages` only takes effect under `data-theme="dark"`.

## 3. Palette

| Role | Light (paper) | Sepia | Dark (charcoal) |
| --- | --- | --- | --- |
| App bg / surface / raised / sunken | `#f4efe6` / `#faf7f1` / `#fffdf9` / `#ebe4d6` | `#e9dcc1` / `#f1e6cd` / `#f7eed9` / `#dfd0b1` | `#1d1c1a` / `#252321` / `#2e2c29` / `#171615` |
| Margin column | `#efe9dd` | `#e4d6b9` | `#262421` |
| Page sheet | `#fffdf8` | `#f8efd9` | `#e3ddd0` (dimmed); inverted `#242321` |
| Text / secondary / muted | `#2a2622` / `#575046` / `#6a6155` | `#33281b` / `#58472f` / `#665539` | `#ece6db` / `#bdb5a7` / `#a1998c` |
| Accent (+hover) | `#962d22` (`#7a2219`) | `#8a2a1c` (`#701f13`) | `#ee9884` (`#f7b3a2`) |

**Rationale.** Neutrals are warm (hue ≈ 35–40°), never grey-blue, so long reading sessions feel like paper rather than a dashboard. Sepia is a deeper parchment, not yellow. Dark is charcoal with a brown undertone; pages are *dimmed paper* by default (`multiply` blend over `--page-sheet-bg`) and optionally truly inverted (`filter: invert(.86) hue-rotate(180deg) sepia(.12)`, sheet `#242321`, slightly lighter than the app so the page edge stays legible). Accent is a rubric oxblood — in dark it lightens to a coral so it stays ≥ 4.5:1. Danger (`--color-danger`) is a brighter red and is always paired with a label/icon, so it is never confused with the accent. Focus ring is ink-blue (`--color-focus-ring`), deliberately a different hue from the accent.

**Note colors** (`data-note-color="amber|sage|sky|rose|lavender"` → `--note-bg/-border/-text/-dot`). Light/sepia: pale tint + deeper hue border + very dark hue text. Dark: deep tint + muted border + pale hue text. `-dot` is a single mid-tone per hue (L ≈ 0.17–0.20) with ≥ 3:1 against every sheet and margin background, so anchors read on any theme.

**Margin column.** It is the page's "desk": a quiet step off the app background in every theme. In dark this is deliberate, not incidental — the column is `#262421` against the app's `#1d1c1a` (a lift of one surface step), so the margin reads as a band beside the page and notes sit on a visibly distinct ground, while staying clearly darker than the note cards on it.

**Verified contrast** (worst case across all surfaces): text 9.4–14.8 · secondary ≥ 5.9 · muted ≥ 4.7 · accent ≥ 5.7 · on-accent ≥ 7.5 · danger ≥ 4.7 · note text on note bg ≥ 8.0 · return pill text ≥ 9.2 · focus ring ≥ 4.7 (3:1 required) · input border ≥ 3.1 (3:1 required). Rules: `--color-text-muted` is for static captions only (not on hover/pressed fills); interactive text uses `secondary`/`text`/`accent`.

## 4. Typography

| Token | Size | Family | Use |
| --- | --- | --- | --- |
| `--font-size-xs` | 12px | UI | kbd, chips, captions, quote text in notes (12.5px) |
| `--font-size-sm` | 13px | UI | toolbar, buttons, tabs, metadata |
| `--font-size-note` | **13.5px**/1.5 | **Serif** | margin notes (review notes use `base`, 15px/1.55) |
| `--font-size-base` | 15px/1.5 | UI | body, outline, inputs |
| `--font-size-md` | 16px | Serif | book-card titles (600), h4 |
| `--font-size-lg` / `xl` | 18 / 22px | Serif (h1–h2) | section headings, empty-state titles |
| `--font-size-2xl` / `3xl` | 28 / 36px | Serif | "Library" heading / display |

Weights 400/500/600. Headings: serif 600, `letter-spacing: -0.011em`, `text-wrap: balance`. Numerals that change (page, %, zoom) use `font-variant-numeric: tabular-nums`. Light-on-dark text looks heavier than dark-on-light, so dark eases the UI body weight (`--font-weight-regular` 380) and the serif note body (`--font-weight-note` 340, vs 400 elsewhere); both are variable-font values, so there is no extra download.

## 5. Layout & surfaces

Constants: `--toolbar-height` 48 · `--sidebar-width` 300 · `--margin-column-width` 280 · `--page-gap` 24 · `--margin-note-width` 256 · `--book-card-width` 176 · `--review-thumb-width` 160.

### 5.1 Library (home)
- Container max-width 1184px, centered, padding 38px 32px 48px. Top line: brand mark ("Scriptorium", serif 19, accent book icon) left, quiet theme switcher right, hairline below. Header row: eyebrow "YOUR READING ROOM" (xs, tracked caps, muted), `h1` "Library" (serif 28) left, **Open PDF** (`.btn--primary`, `FilePlus`) right.
- **Continue strip** (if any book): `.card` with 72×96 cover, title, "Page 142 of 612 · 2 hours ago", `.btn--primary` "Continue reading".
- Grid: `repeat(auto-fill, minmax(176px, 1fr))`, gap 32px 24px.
- `.book-card`: cover `aspect-ratio 3/4`, radius 3px, `--shadow-sheet`, 7%-wide dark spine gradient on the left edge. Title serif 16/1.3 600, 2-line clamp, 12px below the cover, with a two-line minimum height so progress rows align across a grid row. In dark, cover images are dimmed to 90% brightness so white pages don't glare. Meta row: 3px progress track (`--color-surface-sunken`, fill `--color-accent`, radius 2) + `%` (xs, secondary, tabular). Sub-line "Opened 2 hours ago" xs muted.
- Hover/focus-within: cover lifts `translateY(-3px)` + `--shadow-lg` (200ms, ease-out); overflow menu `.btn--icon.btn--sm` (`MoreHorizontal`) fades in at cover top-right. The card is one link/button; the menu is a *sibling*, never nested. Remove → confirm dialog.
- `.dropzone`: 2px dashed `--color-border-control`, radius 14, padding 32. `.is-dragover`: border `--color-accent`, bg `--color-accent-subtle` (140ms). First run: the dropzone *is* the empty state, centered.

### 5.2 Reader shell
- `.reader` = grid, rows `48px 1fr`. `.reader__toolbar`: bg `--color-surface`, bottom 1px `--color-border-subtle`, padding 0 12px, gap 4px, two groups (`--start` flexes, `--end` hugs the right), separated inside by short 20px `.divider--vertical` hairlines (centered, not full height).
  Start → end: **Library** (`LibraryBig`) · sidebar toggle (`PanelLeft`, `aria-pressed`) · divider · back/forward (`ArrowLeft`/`ArrowRight`, disabled when unavailable) · title (serif 15/600) + current section (13px muted, after a `·`; the section truncates first) ‖ page field (`.input--sm`, 52px) "/ 612" · divider · zoom − / % menu / + · divider · bookmark toggle (`Bookmark`, accent when set) · Appearance popover (`Palette`: theme `.segmented` Light/Sepia/Dark, plus "Invert page colours" switch, enabled only in dark; a remembered-but-unavailable switch stays neutral) · **Review notes** (`.btn--sm`, `NotebookText`, count badge in accent). Pressed *panel* toggles (sidebar) use a quiet pressed fill, not the accent — accent is kept for bookmarks and "where you are". Below 1100px the section and the Review label collapse (count stays); below 960px the title does too.
- `.sidebar`: 300px, bg surface, right border subtle. Header: `.segmented--full` tabs Contents · Bookmarks · Notes (+ a Search icon tab), margin 12px. Rows min-height 32px (wrap to ≤ 2 lines), indent 16px per level; current section `--color-accent-subtle` bg + `--color-accent` text; page number right-aligned xs muted tabular. Bookmark rows reveal rename/delete on hover or focus-within (always visible on touch). Footer: "Keyboard shortcuts" button + `?` kbd. Collapse: `translateX(-100%)` + width → 0 over `--duration-slow` (ease-out); collapsed content is `inert`.
- `.reader__viewport`: scroll container (bg `--color-bg-app`), thin scrollbar; 32px above the first page and 96px below the last, so the final lines can scroll clear of the Return pill. When keyboard-focused it shows a 2px `--color-focus-ring` line along the top edge (a full-viewport ring is too heavy). Each `.reader__page` is `.page-sheet` + `.page-margin` **flush**, centered as one unit (the page sits left of center by half the margin), `--page-gap` between pages. Sheet: `.page-sheet` (white, radius 2, `--shadow-sheet`, 1px hairline). Margin: `.page-margin` 280px, same height as sheet, bg `--color-margin-bg`, radius `0 6px 6px 0`; the sheet's shadow falls softly onto it. Never nest the margin inside `.page-sheet` (its `::selection` is transparent).
- *Planned, not yet built:* under 960px the margin collapses to a 44px rail of anchor dots; activating a dot opens the note in a popover. (Today the margin keeps its width and the viewport scrolls horizontally.)

### 5.3 Margin notes
- **Geometry.** Column 280 = 16px gutter + **256px card** + 8px right padding. Anchor y = `anchor (0–1) × sheet height`.
- **`.margin-note`**: padding 10px 12px 12px; 1px `--note-border` + **3px left border `--note-dot`**; radius 6; `--shadow-sm`; serif 13.5/1.5 (`--font-weight-note`) in `--note-text`; bg `--note-bg`. Focusable (`tabindex="0"`, `role="group"`, `aria-label="Note on page 142"`).
- **`.margin-note__quote`**: italic serif 12.5/1.45, `--note-text`, 2px left rule `--note-border`, padding-left 8, margin-bottom 6, 3-line clamp. Optional, above the body.
- **`.margin-note__body`**: collapsed to 6 lines (≈ 121px); when clamped, `.margin-note__more` ("Show more", xs 600 underlined) expands it (200ms ease-out max-height). Expanded state resets on blur.
- **States.** Hover: `--shadow-md` + `.margin-note__actions` (swatch, delete `Trash2`) fade in 140ms as a small chrome pill straddling the card's top-right edge (20px above, 12px inside — clear of the first line of text; it overlaps the gap and a sliver of the note above, which is why it only shows for the hovered card) (always visible on focus-within/touch). Focus-visible: global 2px focus ring. **Editing** (`.is-editing`): 2px `--color-focus-ring` ring + `--shadow-md`, body becomes a borderless auto-growing textarea with identical metrics (min 2 lines), a 5-swatch row (18px circles, `aria-label` = color name, selected has a check) and a delete button; text autosaves on input (debounced); `Esc`, `Ctrl/Cmd+Enter` or blur commits; an empty new note is discarded on blur. A focused card also responds to `Enter` (edit) and `Delete` (delete, with Undo). Jump target: 1.2s accent outline pulse.
- **Stacking.** Sort by anchor. For each card: `top = max(anchorY − 16, previousBottom + 8)` (8px gap; 16px = attach point below card top). Re-measure with `ResizeObserver`. If the stack would pass the page bottom, trailing cards fall back to a compact 32px one-line preview (click to expand in place). Cards being edited or expanded are never compacted — only cards after them are — and if the stack still does not fit it slides up to stay on the page. Never reorder; anchors are unchanged.
- **Anchor + leader.** `.margin-note__anchor`: 8px dot in `--note-dot`, centered on the sheet's right edge, 2px ring in `--page-sheet-bg`. `.margin-note__leader`: 1px line, `--note-dot` at 70%, from the dot to the card gutter at the attach y. When displaced, `.margin-note__tether` (1px vertical) joins anchor y to attach y. Each note's tether runs in its own 3-step lane (x = 7 / 10 / 13px, by order) so neighbouring tethers stay parallel and legible instead of overprinting at one x. Hover/focus: leader 2px, dot scales 1.25 (140ms).
- **Add-note ghost** `.margin-note-ghost`: appears over empty margin only, 256×32, 1px dashed `--color-border-control`, radius 6, `Plus` 16 + "Add note" (sm 500, secondary), centered on the pointer y snapped to 4px, plus a faint dot on the page edge; fade 120ms, follows y without easing. Click → note in last-used color (default amber), editor focused. `N` does the same at mid-viewport.
- **Selection:** `.selection-popover` — float chrome (`--color-float-*`), 32px high, radius 8, `--shadow-lg`, 8px above the end of a single-line selection (below the last line of a multi-line one, so it never covers selected text; it flips when there is no room), "Add margin note" + `N` hint; creates a note anchored at the middle of the first selected line with `__quote` pre-filled. It hides on scroll, `Esc`, a collapsed selection, or while a note is being edited.
- **Bookmark ribbon** `.page-sheet__ribbon`: 22×38px, top 0, right 24px, `--color-bookmark`, `clip-path: polygon(0 0,100% 0,100% 100%,50% 78%,0 100%)`; enters `translateY(-100%)→0`, 320ms spring. `aria-hidden` — state is also in toolbar and sidebar.

### 5.4 Return pill
`.return-pill` is absolutely positioned inside `.reader__viewport`: **bottom 24px, horizontally centered on the viewport** (not the window). Height 40, padding `0 6px 0 14px`, radius full, bg `--color-float-bg`, text `--color-float-text` sm/500, 1px `--color-float-border`, `--shadow-lg`. Content: `Undo2` 16 · "Return to p. **142**" (number in `--color-float-accent`, tabular) · `.return-pill__close` (28px circle, `X` 16, `aria-label="Dismiss"`). Tooltip on the main button: "Alt+←".
- Enter: 320ms spring from `opacity 0; translateY(16px) scale(.96)` plus one 900ms soft accent ring pulse (`box-shadow 0 0 0 0 → 0 0 0 10px` fading to transparent). Exit: 140ms ease-in, fade + 8px down. Hover: bg lightens 6%.
- Dismiss: ×, `Esc`, activating it, or after 12s without hover/focus. One pill at a time; a new jump cross-fades the label (120ms). `role="status"` live region; the action is a real `<button>`.
- **Toasts** (`.toast`, same float chrome, pill-shaped, 40px) stack **bottom-left** (24px inset) so they never meet the Return pill, which is centred over the document. In the reader they rise 56px higher so they clear the sidebar footer instead of covering it (`body:has(.sidebar)`). Optional accent action ("Undo"), × dismiss; error toasts add a danger dot. Enter 320ms spring.

### 5.5 Collated notes review
- Replaces the reader body; one 48px toolbar. Left → right: `ArrowLeft` "Back to book" · divider · **stacked heading** — title "Notes · {Book}" (serif 18, truncates; 16 below 1360px) over a count line (xs muted, tabular: "13 notes on 6 pages", or "2 of 13 notes on 2 pages" while filtering; `role="status"`) — · spacer · **text filter** (`.review-search`, `.input--sm` 176px, `Search` icon, `/` kbd hint that becomes a clear × once there is text) · **colour filter chips** (`.review-chip`, 26px, 12px dot; active = note tint + 1.5px dot ring; the others dim to 60%; tooltip "Amber · 4") · **Comfortable | Dense** (`.segmented`) · quiet theme switcher (icons only, no tray, after a hairline — it is rarely used here) · **Export Markdown** (`.btn`, `Download`; icon-only below 1120px; tooltip says it exports all notes, ignoring filters; toast "Exported 13 notes"). Filters and export are hidden when the book has no notes. Content column max-width 880, centered, padding 32px 24px.
- **Filtering.** The text filter matches note text and quotes (case-insensitive; every word must match); matches are highlighted with `.review-mark` (accent at 18%, 2px radius). Empty result: "No notes match your filters" with a **Clear filters** button.
- **Keyboard** (when not typing): `j` / `k` move focus to the next / previous note (scrolling it into view), `/` focuses the filter (`Esc` clears it, then blurs), `Enter` or click edits the focused note, `Esc` ends editing, then `Esc` or `Shift+R` returns to the book. A focused note shows the standard focus ring and its jump button.
- `.review-row` (comfortable): grid `160px 1fr`, gap 24, padding 20px 0, 1px `--color-border-subtle` divider. `.review-row__header` "**Page 37** · Chapter 3: Kinematics" (600 base + sm secondary, truncating), "Go to page" `.btn--ghost.btn--sm` (`ArrowUpRight`) revealed on hover/focus.
- Thumbnail `.page-thumb`, 160px wide; `.review-row__dot` 10px at the thumbnail's right edge (50% outside, 2px ring) at `anchor × height`. Each `.review-note` repeats its dot (8px) at the start of the line, ordered by anchor: serif 15/1.55, optional quote (italic 13 secondary, 2px rule), padding 8px 0, hover bg `--color-hover`; click edits inline; a jump button per note.
- **Dense** (`.review--dense`): no thumbnails, single column, row padding 12px 0, header inline, notes serif 13.5/1.5 padding 4px 0 — roughly 2× notes per screen. Switch 200ms (thumbnails fade, rows collapse); preference persists.

## 6. Interaction & motion

| Interaction | Duration · easing |
| --- | --- |
| Hover/press color changes | `--duration-fast` 140 · standard |
| Card lift, note expand, popovers, review Dense switch | `--duration-base` 200 · ease-out |
| Sidebar collapse | `--duration-slow` 320 · ease-out |
| Ribbon, return pill enter | 320 · `--ease-spring` |
| Jump scroll | ≤ 1 viewport: smooth 320; farther: instant (`--scroll-behavior`) |

`prefers-reduced-motion`: durations collapse to ~0, `--scroll-behavior: auto`, no translate/scale entrances; state changes (color, opacity) still apply.

**Empty-state copy** (`.empty-state` + `lucide` icon in `__icon`):

| Where | Title | Body · action |
| --- | --- | --- |
| Library (first run) | Begin your library | Drop a PDF here, or open one from your computer. Everything stays on this device. · **Open PDF** |
| Contents | No contents in this PDF | This book has no outline. Use the page field or bookmarks to find your way. |
| Bookmarks | No bookmarks yet | Press <kbd>B</kbd> to mark the current page. |
| Notes (sidebar) | No margin notes | Click the margin beside any page, or select text and choose “Add margin note”. |
| Review | Nothing to review yet | Notes you add while reading are collected here, page by page. · **Back to book** |
| Review (filtered) | No notes match your filters | Try a different search, or include more colours. · **Clear filters** |
| Import error | That file couldn’t be opened | Check that it’s a valid PDF and try again. Nothing was added. |

## 7. Accessibility

- Text ≥ 4.5:1, UI boundaries/focus ≥ 3:1 in all themes (see §3). Re-check if any token changes.
- `:focus-visible` shows a 2px ink-blue ring, 2px offset, on every interactive element; never remove it. Pointer clicks show none.
- Everything is keyboard reachable: toolbar → sidebar → pages → margin notes (tab order follows page order). Outline is `role="tree"` (arrow keys); sidebar tabs follow the tabs pattern; segmented items are `role="radio"` or `tab` with `aria-checked`/`aria-selected`. Note colors are named in `aria-label`s — color is never the only signal.
- Targets ≥ 28px (toolbar controls 34px). `data-tooltip` supplements, never replaces, `aria-label`; a tooltip is hidden while its trigger's menu is open (`aria-expanded="true"`) so it never sits on top of the popover.
- Return pill and exports announce via live regions. Honors `prefers-reduced-motion`. Focus uses `outline`, so it persists in forced-colors mode.

## 8. Class inventory

- **Primitives (base.css):** `.btn` `--primary` `--ghost` `--icon` `--sm` `.is-active` · `.input` `--sm` · `.kbd` · `.chip` `.is-active` · `.card` `--interactive` · `.divider` `--vertical` · `.visually-hidden` · `.tooltip` `--below` (`[data-tooltip]`) · `.segmented` `--full` `__item` · `.empty-state` `__icon` `__title` `__body` `__actions` · `.page-sheet` · `.page-thumb` · `.lucide`
- **App shell:** `.app` · `.library` `__header` `__grid` `__continue` · `.dropzone` · `.book-card` `__cover` `__title` `__meta` `__progress` `__menu`
- **Reader:** `.reader` `__toolbar` `__viewport` `__page` · `.toolbar-group` · `.page-field` · `.appearance-menu` · `.sidebar` `__tabs` `__panel` · `.outline` `__item` `.is-current` · `.bookmark-list` `__item`
- **Page + margin:** `.page-sheet` `__canvas` `__text-layer` `__links` `__overlay` `__ribbon` · `.page-margin` · `.margin-column` · `.margin-note-slot` (anchor + leader + tether + card; carries `data-note-color`) · `.margin-note` `__quote` `__body` `__more` `__actions` `__anchor` `__leader` `__tether` `.is-editing` `.is-compact` `.is-pulsing` · `.margin-note-ghost` · `.selection-popover` · `.swatch` (`data-note-color`)
- **Return / feedback:** `.return-pill` `__label` `__close` · `.toast-host` `.toast` `--error` `__action` `__close`
- **Review:** `.review` `--dense` `__toolbar` `__heading` `__title` `__count` · `.review-search` `__input` `__hint` `__clear` · `.review-colors` `.review-chip` · `.review-row` `__header` `__thumb` `__dot` · `.review-note` `__quote` `__text` `__jump` `.is-editing` · `.review-mark`
- **Search:** `.search` `__header` `__field` `__input` `__icon` `__actions` `__nav` `__status` `__progress` `__results` `__more` `__empty` · `.search-group` `__title` `__page` `__section` `__count` · `.search-result` `__snippet` `.is-active` · `.search-highlights` · `.search-highlight` `.is-active` (page overlay; translucent accent wash, active match outlined)
- **Link peek:** `.page-sheet__link` (internal/external link hit areas, faint accent tint on hover) · `.link-peek` `__header` `__title` `__page-number` `__body` `__frame` `__canvas` `__bitmap` `__go` (floating raised card, `--z-popover`; the excerpt is drawn like a `.page-thumb` so night inversion applies)
- **Misc:** `.popover`, `.shortcuts-dialog`, `.library-dialog`, `.sidebar__footer`
- **State hooks:** `html[data-theme]`, `html.invert-pages`, `[data-note-color]`, `.is-active`, `.is-editing`, `.is-dragover`, `[hidden]`.
