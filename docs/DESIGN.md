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
| Margin column | `#efe9dd` | `#e4d6b9` | `#211f1d` |
| Page sheet | `#fffdf8` | `#f8efd9` | `#e3ddd0` (dimmed); inverted `#242321` |
| Text / secondary / muted | `#2a2622` / `#575046` / `#6a6155` | `#33281b` / `#58472f` / `#665539` | `#ece6db` / `#bdb5a7` / `#a1998c` |
| Accent (+hover) | `#962d22` (`#7a2219`) | `#8a2a1c` (`#701f13`) | `#ee9884` (`#f7b3a2`) |

**Rationale.** Neutrals are warm (hue ≈ 35–40°), never grey-blue, so long reading sessions feel like paper rather than a dashboard. Sepia is a deeper parchment, not yellow. Dark is charcoal with a brown undertone; pages are *dimmed paper* by default (`multiply` blend over `--page-sheet-bg`) and optionally truly inverted (`filter: invert(.86) hue-rotate(180deg) sepia(.12)`, sheet `#242321`, slightly lighter than the app so the page edge stays legible). Accent is a rubric oxblood — in dark it lightens to a coral so it stays ≥ 4.5:1. Danger (`--color-danger`) is a brighter red and is always paired with a label/icon, so it is never confused with the accent. Focus ring is ink-blue (`--color-focus-ring`), deliberately a different hue from the accent.

**Note colors** (`data-note-color="amber|sage|sky|rose|lavender"` → `--note-bg/-border/-text/-dot`). Light/sepia: pale tint + deeper hue border + very dark hue text. Dark: deep tint + muted border + pale hue text. `-dot` is a single mid-tone per hue (L ≈ 0.17–0.20) with ≥ 3:1 against every sheet and margin background, so anchors read on any theme.

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

Weights 400/500/600 only. Headings: serif 600, `letter-spacing: -0.011em`, `text-wrap: balance`. Numerals that change (page, %, zoom) use `font-variant-numeric: tabular-nums`.

## 5. Layout & surfaces

Constants: `--toolbar-height` 48 · `--sidebar-width` 300 · `--margin-column-width` 280 · `--page-gap` 24 · `--margin-note-width` 256 · `--book-card-width` 176 · `--review-thumb-width` 160.

### 5.1 Library (home)
- Container max-width 1120px, centered, padding 48px 32px. Header row: `h1` "Library" (serif 28) left, **Open PDF** (`.btn--primary`, `FilePlus`) right.
- **Continue strip** (if any book): `.card` with 72×96 cover, title, "Page 142 of 612 · 2 hours ago", `.btn--primary` "Continue reading".
- Grid: `repeat(auto-fill, minmax(176px, 1fr))`, gap 32px 24px.
- `.book-card`: cover `aspect-ratio 3/4`, radius 3px, `--shadow-sheet`, 7%-wide dark spine gradient on the left edge. Title serif 16/1.3 600, 2-line clamp, 12px below the cover. Meta row: 3px progress track (`--color-surface-sunken`, fill `--color-accent`, radius 2) + `%` (xs, secondary, tabular). Sub-line "Opened 2 hours ago" xs muted.
- Hover/focus-within: cover lifts `translateY(-3px)` + `--shadow-lg` (200ms, ease-out); overflow menu `.btn--icon.btn--sm` (`MoreHorizontal`) fades in at cover top-right. The card is one link/button; the menu is a *sibling*, never nested. Remove → confirm dialog.
- `.dropzone`: 2px dashed `--color-border-control`, radius 14, padding 32. `.is-dragover`: border `--color-accent`, bg `--color-accent-subtle` (140ms). First run: the dropzone *is* the empty state, centered.

### 5.2 Reader shell
- `.reader` = grid, rows `48px 1fr`. `.reader__toolbar`: bg `--color-surface`, bottom 1px `--color-border-subtle`, padding 0 12px, gap 8px, groups split by `.divider--vertical`.
  Left → right: sidebar toggle (`PanelLeft`, `.is-active` when open) · back/forward (`ArrowLeft`/`ArrowRight`, disabled when unavailable) · title (serif 15/600, chapter in muted) · spacer · page field (`.input--sm`, 52px) "/ 612" · zoom − / % / + / fit-width · bookmark toggle (`Bookmark`, filled when set) · Appearance popover (`Palette`: theme `.segmented` Light/Sepia/Dark with `Sun`/`Coffee`/`Moon`, plus "Invert page colors" switch, enabled only in dark) · **Review notes** (`.btn--sm` + `.kbd` ⇧R).
- `.sidebar`: 300px, bg surface, right border subtle. Header: `.segmented--full` tabs Contents · Bookmarks · Notes (padding 12px). Rows min-height 32px (wrap to ≤ 2 lines), indent 16px per level; current section `--color-accent-subtle` bg + `--color-accent` text; page number right-aligned xs muted tabular. Collapse: `translateX(-100%)` + width → 0 over `--duration-slow` (ease-out); collapsed content is `inert`.
- `.reader__viewport`: scroll container (bg `--color-bg-app`, padding 32px 0), thin scrollbar. Each `.reader__page` is `.page-sheet` + `.page-margin` **flush**, centered as one unit (the page sits left of center by half the margin), `--page-gap` between pages. Sheet: `.page-sheet` (white, radius 2, `--shadow-sheet`, 1px hairline). Margin: `.page-margin` 280px, same height as sheet, bg `--color-margin-bg`, radius `0 6px 6px 0`; the sheet's shadow falls softly onto it. Never nest the margin inside `.page-sheet` (its `::selection` is transparent).
- Under 960px the margin collapses to a 44px rail of anchor dots; activating a dot opens the note in a popover.

### 5.3 Margin notes
- **Geometry.** Column 280 = 16px gutter + **256px card** + 8px right padding. Anchor y = `anchor (0–1) × sheet height`.
- **`.margin-note`**: padding 10px 12px 12px; 1px `--note-border` + **3px left border `--note-dot`**; radius 6; `--shadow-sm`; serif 13.5/1.5 in `--note-text`; bg `--note-bg`. Focusable (`tabindex="0"`, `role="group"`, `aria-label="Note on page 142"`).
- **`.margin-note__quote`**: italic serif 12.5/1.45, `--note-text`, 2px left rule `--note-border`, padding-left 8, margin-bottom 6, 3-line clamp. Optional, above the body.
- **`.margin-note__body`**: collapsed to 6 lines (≈ 121px); when clamped, `.margin-note__more` ("Show more", xs 600 underlined) expands it (200ms ease-out max-height). Expanded state resets on blur.
- **States.** Hover: `--shadow-md` + `.margin-note__actions` (swatch, delete `Trash2`, jump) fade in 140ms (always visible on focus-within/touch). Focus-visible: global 2px focus ring. **Editing** (`.is-editing`): 2px `--color-focus-ring` ring + `--shadow-md`, body becomes a borderless auto-growing textarea with identical metrics (min 2 lines), a 5-swatch row (18px circles, `aria-label` = color name, selected has a check). Autosave on input (debounced); `Esc`/blur commits; an empty new note is discarded on blur. Jump target: 1.2s accent outline pulse.
- **Stacking.** Sort by anchor. For each card: `top = max(anchorY − 16, previousBottom + 8)` (8px gap; 16px = attach point below card top). Re-measure with `ResizeObserver`. If the stack would pass the page bottom, trailing cards fall back to a compact 32px one-line preview (click to expand in place). Never reorder; anchors are unchanged.
- **Anchor + leader.** `.margin-note__anchor`: 8px dot in `--note-dot`, centered on the sheet's right edge, 2px ring in `--page-sheet-bg`. `.margin-note__leader`: 1px line, `--note-dot` at 70%, from the dot to the card gutter at the attach y. When displaced, `.margin-note__tether` (1px vertical, x = 8px) joins anchor y to attach y. Hover/focus: leader 2px, dot scales 1.25 (140ms).
- **Add-note ghost** `.margin-note-ghost`: appears over empty margin only, 256×32, 1px dashed `--color-border-control`, radius 6, `Plus` 16 + "Add note" (sm 500, secondary), centered on the pointer y snapped to 4px, plus a faint dot on the page edge; fade 120ms, follows y without easing. Click → note in last-used color (default amber), editor focused. `N` does the same at mid-viewport.
- **Selection:** `.selection-popover` — float chrome (`--color-float-*`), 32px high, radius 8, `--shadow-lg`, 8px above the selection end, "Add margin note"; creates a note with `__quote` pre-filled.
- **Bookmark ribbon** `.page-sheet__ribbon`: 22×38px, top 0, right 24px, `--color-bookmark`, `clip-path: polygon(0 0,100% 0,100% 100%,50% 78%,0 100%)`; enters `translateY(-100%)→0`, 320ms spring. `aria-hidden` — state is also in toolbar and sidebar.

### 5.4 Return pill
`.return-pill` is absolutely positioned inside `.reader__viewport`: **bottom 24px, horizontally centered on the viewport** (not the window). Height 40, padding `0 6px 0 14px`, radius full, bg `--color-float-bg`, text `--color-float-text` sm/500, 1px `--color-float-border`, `--shadow-lg`. Content: `Undo2` 16 · "Return to p. **142**" (number in `--color-float-accent`, tabular) · `.return-pill__close` (28px circle, `X` 16, `aria-label="Dismiss"`). Tooltip on the main button: "Alt+←".
- Enter: 320ms spring from `opacity 0; translateY(16px) scale(.96)` plus one 900ms soft accent ring pulse (`box-shadow 0 0 0 0 → 0 0 0 10px` fading to transparent). Exit: 140ms ease-in, fade + 8px down. Hover: bg lightens 6%.
- Dismiss: ×, `Esc`, activating it, or after 12s without hover/focus. One pill at a time; a new jump cross-fades the label (120ms). `role="status"` live region; the action is a real `<button>`.

### 5.5 Collated notes review
- Replaces the reader body; toolbar stays: `ArrowLeft` "Back to book" · title "Notes · {Book}" (serif 18) · spacer · color filter chips (`.chip`, 5 swatch dots) · **Comfortable | Dense** (`.segmented`) · **Export Markdown** (`.btn`, `Download`; toast "Exported 42 notes"). Content column max-width 880, centered, padding 32px 24px.
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
| Import error | That file couldn’t be opened | Check that it’s a valid PDF and try again. Nothing was added. |

## 7. Accessibility

- Text ≥ 4.5:1, UI boundaries/focus ≥ 3:1 in all themes (see §3). Re-check if any token changes.
- `:focus-visible` shows a 2px ink-blue ring, 2px offset, on every interactive element; never remove it. Pointer clicks show none.
- Everything is keyboard reachable: toolbar → sidebar → pages → margin notes (tab order follows page order). Outline is `role="tree"` (arrow keys); sidebar tabs follow the tabs pattern; segmented items are `role="radio"` or `tab` with `aria-checked`/`aria-selected`. Note colors are named in `aria-label`s — color is never the only signal.
- Targets ≥ 28px (toolbar controls 34px). `data-tooltip` supplements, never replaces, `aria-label`.
- Return pill and exports announce via live regions. Honors `prefers-reduced-motion`. Focus uses `outline`, so it persists in forced-colors mode.

## 8. Class inventory

- **Primitives (base.css):** `.btn` `--primary` `--ghost` `--icon` `--sm` `.is-active` · `.input` `--sm` · `.kbd` · `.chip` `.is-active` · `.card` `--interactive` · `.divider` `--vertical` · `.visually-hidden` · `.tooltip` `--below` (`[data-tooltip]`) · `.segmented` `--full` `__item` · `.empty-state` `__icon` `__title` `__body` `__actions` · `.page-sheet` · `.page-thumb` · `.lucide`
- **App shell:** `.app` · `.library` `__header` `__grid` `__continue` · `.dropzone` · `.book-card` `__cover` `__title` `__meta` `__progress` `__menu`
- **Reader:** `.reader` `__toolbar` `__viewport` `__page` · `.toolbar-group` · `.page-field` · `.appearance-menu` · `.sidebar` `__tabs` `__panel` · `.outline` `__item` `.is-current` · `.bookmark-list` `__item`
- **Page + margin:** `.page-sheet` `__canvas` `__text-layer` `__ribbon` · `.page-margin` · `.margin-note` `__quote` `__body` `__more` `__actions` `__anchor` `__leader` `__tether` `.is-editing` `.is-compact` · `.margin-note-ghost` · `.selection-popover` · `.swatch` (`data-note-color`)
- **Return:** `.return-pill` `__label` `__close` · **Review:** `.review` `--dense` `__toolbar` · `.review-row` `__header` `__thumb` `__dot` · `.review-note` `__quote` · **Misc:** `.toast`, `.dialog`, `.popover`
- **State hooks:** `html[data-theme]`, `html.invert-pages`, `[data-note-color]`, `.is-active`, `.is-editing`, `.is-dragover`, `[hidden]`.
