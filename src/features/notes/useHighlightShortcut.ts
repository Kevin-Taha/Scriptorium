import { useEffect } from 'react';
import { isEditableTarget } from '@/lib/util';
import { type KeyEvent, matches } from '../commands/keys';
import { highlightSelection } from './highlightActions';

/** True for the highlight key (`H`), unless auto-repeated. */
export function isHighlightShortcut(event: KeyEvent & Pick<KeyboardEvent, 'repeat'>): boolean {
  return matches(event, 'highlight') && !event.repeat;
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
