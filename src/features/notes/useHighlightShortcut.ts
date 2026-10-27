import { useEffect } from 'react';
import { isEditableTarget } from '@/lib/util';
import { highlightSelection } from './highlightActions';

/** True for a bare `H` press (no modifiers, not auto-repeat). */
export function isHighlightShortcut(
  event: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey' | 'repeat'>,
): boolean {
  const { key, ctrlKey, metaKey, altKey, shiftKey, repeat } = event;
  return key.toLowerCase() === 'h' && !ctrlKey && !metaKey && !altKey && !shiftKey && !repeat;
}

/**
 * `H` highlights the selected text in the colour used last. It does nothing
 * (and swallows nothing) without a selection on a page, or while typing.
 */
export function useHighlightShortcut(): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || !isHighlightShortcut(event) || isEditableTarget(event.target)) return;
      if (document.querySelector('dialog:modal')) return;
      if (highlightSelection()) event.preventDefault();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
}
