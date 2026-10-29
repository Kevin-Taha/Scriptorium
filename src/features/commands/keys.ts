import { COMMANDS, type Binding, type Command, type CommandId } from './commands';

export type KeyEvent = Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey'>;

const IS_MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

/** One key of a combination, as shown (`text`) and as read out (`spoken`). */
export interface KeyCap {
  text: string;
  spoken: string;
}

interface LabelOptions {
  /** Defaults to the platform the app runs on. */
  mac?: boolean;
  /** Words rather than symbols ("Alt+Left"), for accessible names. */
  spoken?: boolean;
}

const KEY_NAMES: Partial<Record<string, [text: string, spoken: string]>> = {
  ArrowLeft: ['←', 'Left'],
  ArrowRight: ['→', 'Right'],
  Escape: ['Esc', 'Esc'],
  '-': ['−', 'Minus'],
};

const command = (id: CommandId): Command => COMMANDS[id];

function bindingMatches(event: KeyEvent, binding: Binding): boolean {
  if (binding.local) return false;
  if (!!binding.mod !== (event.ctrlKey || event.metaKey) || !!binding.alt !== event.altKey) return false;
  if (binding.shift !== 'any' && !!binding.shift !== event.shiftKey) return false;
  return (event.key.length === 1 ? event.key.toLowerCase() : event.key) === binding.key;
}

/** Whether a key press triggers the command. Keys a focused control handles itself never do. */
export function matches(event: KeyEvent, id: CommandId): boolean {
  return command(id).keys.some((binding) => bindingMatches(event, binding));
}

/** The bindings worth telling people about (aliases left out). */
function listedBindings(id: CommandId): Binding[] {
  return command(id).keys.filter((binding) => !binding.alias);
}

function caps(binding: Binding, mac: boolean): KeyCap[] {
  const result: KeyCap[] = [];
  const add = (text: string, spoken = text) => result.push({ text, spoken });
  if (mac) {
    if (binding.alt) add('⌥', 'Option');
    if (binding.shift === true) add('⇧', 'Shift');
    if (binding.mod) add('⌘', 'Command');
  } else {
    if (binding.mod) add('Ctrl');
    if (binding.alt) add('Alt');
    if (binding.shift === true) add('Shift');
  }
  const [text, spoken] = KEY_NAMES[binding.key] ?? [
    binding.key.length === 1 ? binding.key.toUpperCase() : binding.key,
  ];
  add(text, spoken);
  return result;
}

/** Keycaps for each listed binding, e.g. `[['Ctrl', 'F'], ['/']]`. */
export function keyCaps(id: CommandId, mac = IS_MAC): KeyCap[][] {
  return listedBindings(id).map((binding) => caps(binding, mac));
}

/** The first listed binding as text: "Ctrl+F" or "⌘F", "Alt+←" or "⌥←" ("Alt+Left" when spoken). */
export function keyLabel(id: CommandId, { mac = IS_MAC, spoken = false }: LabelOptions = {}): string {
  return keyCaps(id, mac)[0]
    .map((cap) => (spoken ? cap.spoken : cap.text))
    .join(mac && !spoken ? '' : '+');
}

/** "Bookmark page (B)": a tooltip or accessible name that carries its shortcut. */
export function withShortcut(text: string, id: CommandId, options?: LabelOptions): string {
  return `${text} (${keyLabel(id, options)})`;
}

/** The command's keys in `aria-keyshortcuts` syntax; a Ctrl/⌘ shortcut is given both ways. */
export function ariaKeyShortcuts(id: CommandId): string {
  return listedBindings(id)
    .filter((binding) => !binding.local)
    .flatMap((binding) => {
      const key =
        binding.key === '+' ? 'Plus' : binding.key.length === 1 ? binding.key.toUpperCase() : binding.key;
      const combo = [binding.alt && 'Alt', binding.shift === true && 'Shift', key].filter(Boolean).join('+');
      return binding.mod ? [`Control+${combo}`, `Meta+${combo}`] : [combo];
    })
    .join(' ');
}
