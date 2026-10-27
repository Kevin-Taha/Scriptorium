import { describe, expect, it } from 'vitest';
import { resolveShortcut } from './useKeyboardShortcuts';

const event = (
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

describe('resolveShortcut', () => {
  it.each([
    ['b', 'bookmark'],
    ['B', 'bookmark'],
    ['n', 'note'],
    ['g', 'page'],
    ['[', 'sidebar'],
    ['+', 'zoom-in'],
    ['=', 'zoom-in'],
    ['-', 'zoom-out'],
    ['0', 'fit-width'],
    ['Escape', 'dismiss'],
    ['?', 'help'],
  ] as const)('maps %s', (key, action) => expect(resolveShortcut(event(key))).toBe(action));
  it('recognizes shifted review and browser-independent history shortcuts', () => {
    expect(resolveShortcut(event('R', { shiftKey: true }))).toBe('review');
    expect(resolveShortcut(event('ArrowLeft', { altKey: true }))).toBe('back');
    expect(resolveShortcut(event('ArrowRight', { altKey: true }))).toBe('forward');
    expect(resolveShortcut(event('+', { shiftKey: true }))).toBe('zoom-in');
    expect(resolveShortcut(event('?', { shiftKey: true }))).toBe('help');
    expect(resolveShortcut(event('/', { shiftKey: true }))).toBe('help');
  });
  it('does not capture browser shortcuts or unintended modifier combinations', () => {
    for (const modifiers of [{ ctrlKey: true }, { metaKey: true }, { altKey: true }, { shiftKey: true }]) {
      expect(resolveShortcut(event('b', modifiers))).toBeNull();
    }
    expect(resolveShortcut(event('r'))).toBeNull();
    expect(resolveShortcut(event('ArrowLeft'))).toBeNull();
    expect(resolveShortcut(event('ArrowLeft', { altKey: true, shiftKey: true }))).toBeNull();
    expect(resolveShortcut(event('+', { ctrlKey: true }))).toBeNull();
    expect(resolveShortcut(event('?', { ctrlKey: true, shiftKey: true }))).toBeNull();
    expect(resolveShortcut(event('?', { metaKey: true, shiftKey: true }))).toBeNull();
    expect(resolveShortcut(event('?', { altKey: true, shiftKey: true }))).toBeNull();
    expect(resolveShortcut(event('/'))).toBeNull();
    expect(resolveShortcut(event('x'))).toBeNull();
  });
});
