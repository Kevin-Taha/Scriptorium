/**
 * Every keyboard shortcut in the app, as data. Key handlers match against it (`matches` in
 * `keys.ts`), and the shortcuts dialog, tooltips, `aria-keyshortcuts` and Go to's hints are
 * generated from it, so each key is written down once. Making shortcuts configurable would
 * mean overriding `keys` here.
 */

export interface Binding {
  /** `KeyboardEvent.key`; letters are lower case and match either case. */
  key: string;
  /** Ctrl, or ⌘ on macOS (either is accepted everywhere). */
  mod?: true;
  alt?: true;
  /** Whether Shift is held (default: not). `'any'` for characters some layouts type with Shift. */
  shift?: true | 'any';
  /** Handled by the focused control itself (Esc in a note): listed, never matched. */
  local?: true;
  /** Accepted but not listed: a layout quirk or a browser habit. */
  alias?: true;
}

/** Where a command's keys are live. `app` keys work on every screen. */
export type Scope = 'app' | 'reader' | 'review' | 'note';

export const GROUPS = ['Navigate', 'Search', 'Read', 'Annotate', 'Writing a note', 'Notes review'] as const;
export type Group = (typeof GROUPS)[number];

export interface Command {
  label: string;
  detail?: string;
  group: Group;
  scope: Scope;
  /** In order of preference: the first listed binding is the one tooltips show. */
  keys: Binding[];
}

export const COMMANDS = {
  'go-to': {
    label: 'Go to a page, chapter or note',
    detail: 'A page number, a chapter, a note, or any words in the book',
    group: 'Navigate',
    scope: 'reader',
    keys: [{ key: 'g' }],
  },
  back: { label: 'Go back', group: 'Navigate', scope: 'reader', keys: [{ key: 'ArrowLeft', alt: true }] },
  forward: {
    label: 'Go forward',
    group: 'Navigate',
    scope: 'reader',
    keys: [{ key: 'ArrowRight', alt: true }],
  },
  dismiss: {
    label: 'Dismiss',
    detail: 'Leave focus mode, the Return pill or a menu',
    group: 'Navigate',
    scope: 'reader',
    keys: [{ key: 'Escape' }],
  },
  help: {
    label: 'Show keyboard shortcuts',
    group: 'Navigate',
    scope: 'app',
    keys: [
      { key: '?', shift: 'any' },
      { key: '/', shift: true, alias: true },
    ],
  },

  search: {
    label: 'Find in the book',
    detail: 'Go to lists matches from the text; Esc clears their highlights',
    group: 'Search',
    scope: 'reader',
    keys: [{ key: 'f', mod: true, shift: 'any' }, { key: '/' }],
  },
  'next-result': {
    label: 'Next match',
    group: 'Search',
    scope: 'reader',
    keys: [{ key: 'F3' }, { key: 'g', mod: true, alias: true }],
  },
  'previous-result': {
    label: 'Previous match',
    group: 'Search',
    scope: 'reader',
    keys: [
      { key: 'F3', shift: true },
      { key: 'g', mod: true, shift: true, alias: true },
    ],
  },

  focus: {
    label: 'Focus mode',
    detail: 'Esc also leaves it',
    group: 'Read',
    scope: 'reader',
    keys: [{ key: 'f' }],
  },
  ruler: { label: 'Reading ruler', group: 'Read', scope: 'reader', keys: [{ key: 'r' }] },
  'zoom-in': {
    label: 'Zoom in',
    group: 'Read',
    scope: 'reader',
    keys: [{ key: '+', shift: 'any' }, { key: '=' }],
  },
  'zoom-out': { label: 'Zoom out', group: 'Read', scope: 'reader', keys: [{ key: '-' }] },
  'fit-width': { label: 'Fit page width', group: 'Read', scope: 'reader', keys: [{ key: '0' }] },
  sidebar: { label: 'Show or hide the sidebar', group: 'Read', scope: 'reader', keys: [{ key: '[' }] },

  bookmark: { label: 'Bookmark the page', group: 'Annotate', scope: 'reader', keys: [{ key: 'b' }] },
  note: {
    label: 'New margin note',
    detail: 'Select text to include a quote',
    group: 'Annotate',
    scope: 'reader',
    keys: [{ key: 'n' }],
  },
  highlight: {
    label: 'Highlight selected text',
    detail: 'In the colour used last',
    group: 'Annotate',
    scope: 'reader',
    keys: [{ key: 'h' }],
  },
  review: { label: 'Review notes', group: 'Annotate', scope: 'reader', keys: [{ key: 'r', shift: true }] },

  bold: { label: 'Bold', group: 'Writing a note', scope: 'note', keys: [{ key: 'b', mod: true }] },
  italic: { label: 'Italic', group: 'Writing a note', scope: 'note', keys: [{ key: 'i', mod: true }] },
  'finish-note': {
    label: 'Finish writing',
    detail: 'Notes save as you type',
    group: 'Writing a note',
    scope: 'note',
    keys: [
      { key: 'Escape', local: true },
      { key: 'Enter', mod: true, local: true },
    ],
  },

  'next-note': { label: 'Next note', group: 'Notes review', scope: 'review', keys: [{ key: 'j' }] },
  'previous-note': { label: 'Previous note', group: 'Notes review', scope: 'review', keys: [{ key: 'k' }] },
  'filter-notes': {
    label: 'Filter notes',
    detail: 'Esc clears the filter',
    group: 'Notes review',
    scope: 'review',
    keys: [{ key: '/', shift: 'any' }],
  },
  'close-review': {
    label: 'Back to the book',
    group: 'Notes review',
    scope: 'review',
    keys: [
      { key: 'Escape', shift: 'any' },
      { key: 'r', shift: true },
    ],
  },
} satisfies Record<string, Command>;

export type CommandId = keyof typeof COMMANDS;
