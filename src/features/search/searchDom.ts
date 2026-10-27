export const SEARCH_INPUT_ID = 'search-input';

/** Focuses and selects the search field, waiting for the panel to mount if it is not there yet. */
export function focusSearchInput(): void {
  const focus = (): boolean => {
    const input = document.getElementById(SEARCH_INPUT_ID);
    if (!(input instanceof HTMLInputElement)) return false;
    input.focus();
    input.select();
    return true;
  };
  if (focus()) return;
  let frames = 0;
  const retry = () => {
    if (!focus() && ++frames < 10) requestAnimationFrame(retry);
  };
  requestAnimationFrame(retry);
}

/** Moves keyboard focus back to the document so arrow keys and paging scroll the book again. */
export function focusViewport(): void {
  document.querySelector<HTMLElement>('.reader__viewport')?.focus({ preventScroll: true });
}

/** Height of the visible document area in CSS px, when the viewer is mounted. */
export function viewportHeight(): number | null {
  return document.querySelector<HTMLElement>('.reader__viewport')?.clientHeight || null;
}
