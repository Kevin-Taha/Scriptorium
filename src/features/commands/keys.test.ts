import { describe, expect, it } from 'vitest';
import { COMMANDS, GROUPS, type Binding, type Command, type CommandId } from './commands';
import { ariaKeyShortcuts, keyCaps, keyLabel, matches, withShortcut } from './keys';

const entries = Object.entries(COMMANDS) as [CommandId, Command][];

const press = (
  key: string,
  modifiers: Partial<Pick<KeyboardEvent, 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey'>> = {},
) => ({
  key,
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  shiftKey: false,
  ...modifiers,
});

/** Whether one key press could trigger both bindings. */
function overlap(a: Binding, b: Binding): boolean {
  const shifts = a.shift === 'any' || b.shift === 'any' || !!a.shift === !!b.shift;
  return a.key === b.key && !!a.mod === !!b.mod && !!a.alt === !!b.alt && shifts;
}

const sharesScope = (a: Command, b: Command) => a.scope === b.scope || a.scope === 'app' || b.scope === 'app';

describe('command registry', () => {
  it('gives every command a unique label, a known group and at least one listed key', () => {
    const labels = entries.map(([, command]) => command.label);
    expect(new Set(labels).size).toBe(labels.length);
    for (const [id, command] of entries) {
      expect(GROUPS).toContain(command.group);
      expect(keyCaps(id).length).toBeGreaterThan(0);
    }
    expect(new Set(entries.map(([, command]) => command.group))).toEqual(new Set(GROUPS));
  });

  it('writes letters in lower case, so they match either case', () => {
    for (const [, command] of entries)
      for (const binding of command.keys) expect(binding.key).not.toMatch(/^[A-Z]$/);
  });

  it('never gives one key press to two commands where both are live', () => {
    const clashes: string[] = [];
    for (const [i, [idA, a]] of entries.entries()) {
      for (const [idB, b] of entries.slice(i + 1)) {
        if (!sharesScope(a, b)) continue;
        for (const x of a.keys.filter((binding) => !binding.alias))
          for (const y of b.keys.filter((binding) => !binding.alias))
            if (overlap(x, y)) clashes.push(`${idA} / ${idB}: ${x.key}`);
      }
    }
    expect(clashes).toEqual([]);
  });
});

describe('matches', () => {
  it('matches letters in either case but not with other modifiers', () => {
    expect(matches(press('b'), 'bookmark')).toBe(true);
    expect(matches(press('B'), 'bookmark')).toBe(true);
    expect(matches(press('B', { shiftKey: true }), 'bookmark')).toBe(false);
    expect(matches(press('b', { ctrlKey: true }), 'bookmark')).toBe(false);
    expect(matches(press('b', { altKey: true }), 'bookmark')).toBe(false);
  });

  it('accepts Ctrl or ⌘ for mod, and ignores Shift where a layout may need it', () => {
    expect(matches(press('b', { ctrlKey: true }), 'bold')).toBe(true);
    expect(matches(press('b', { metaKey: true }), 'bold')).toBe(true);
    expect(matches(press('+', { shiftKey: true }), 'zoom-in')).toBe(true);
    expect(matches(press('+'), 'zoom-in')).toBe(true);
    expect(matches(press('=', { shiftKey: true }), 'zoom-in')).toBe(false);
  });

  it('accepts aliases but never keys a focused control handles itself', () => {
    expect(matches(press('g', { ctrlKey: true }), 'next-result')).toBe(true);
    expect(matches(press('F3'), 'next-result')).toBe(true);
    expect(matches(press('Escape'), 'finish-note')).toBe(false);
  });
});

describe('key labels', () => {
  it('reads like the platform: Windows and Linux', () => {
    const mac = false;
    expect(keyLabel('search', { mac })).toBe('Ctrl+F');
    expect(keyLabel('back', { mac })).toBe('Alt+←');
    expect(keyLabel('review', { mac })).toBe('Shift+R');
    expect(keyLabel('zoom-out', { mac })).toBe('−');
    expect(keyLabel('dismiss', { mac })).toBe('Esc');
    expect(keyLabel('back', { mac, spoken: true })).toBe('Alt+Left');
  });

  it('reads like the platform: macOS', () => {
    const mac = true;
    expect(keyLabel('search', { mac })).toBe('⌘F');
    expect(keyLabel('back', { mac })).toBe('⌥←');
    expect(keyLabel('review', { mac })).toBe('⇧R');
    expect(keyLabel('previous-result', { mac })).toBe('⇧F3');
    expect(keyLabel('back', { mac, spoken: true })).toBe('Option+Left');
    expect(keyLabel('search', { mac, spoken: true })).toBe('Command+F');
  });

  it('lists alternatives but leaves aliases out', () => {
    expect(keyCaps('search', false).map((caps) => caps.map((cap) => cap.text))).toEqual([
      ['Ctrl', 'F'],
      ['/'],
    ]);
    expect(keyCaps('help', false).map((caps) => caps.map((cap) => cap.text))).toEqual([['?']]);
    expect(keyCaps('back', false)[0].map((cap) => cap.spoken)).toEqual(['Alt', 'Left']);
  });

  it('builds tooltips and aria-keyshortcuts', () => {
    expect(withShortcut('Bookmark page', 'bookmark')).toBe('Bookmark page (B)');
    expect(ariaKeyShortcuts('bookmark')).toBe('B');
    expect(ariaKeyShortcuts('zoom-in')).toBe('Plus =');
    expect(ariaKeyShortcuts('back')).toBe('Alt+ArrowLeft');
    expect(ariaKeyShortcuts('review')).toBe('Shift+R');
    expect(ariaKeyShortcuts('search')).toBe('Control+F Meta+F /');
    expect(ariaKeyShortcuts('next-result')).toBe('F3');
    expect(`${ariaKeyShortcuts('bold')} ${ariaKeyShortcuts('italic')}`).toBe(
      'Control+B Meta+B Control+I Meta+I',
    );
  });
});
