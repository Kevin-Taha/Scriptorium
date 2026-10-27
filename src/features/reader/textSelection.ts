/**
 * Smooth text selection across pdf.js text layers.
 *
 * Text layers are absolutely positioned spans with gaps between them. When the
 * pointer drags over a gap, browsers snap the selection to the end of the
 * container, which makes it jump. As in pdf.js's own viewer, each layer gets an
 * `.endOfContent` element that covers the layer while a selection is in
 * progress (`.selecting`), and on engines without native support it is moved
 * next to the selection's moving edge.
 */

const layers = new Map<HTMLElement, HTMLElement>();
let listeners: AbortController | null = null;
let nativeSupport: boolean | null = null;

/** Registers a rendered text layer and its end-of-content element. */
export function registerTextLayer(layer: HTMLElement, endOfContent: HTMLElement): void {
  layers.set(layer, endOfContent);
  ensureListeners();
}

export function unregisterTextLayer(layer: HTMLElement): void {
  const end = layers.get(layer);
  if (!end) return;
  reset(layer, end);
  layers.delete(layer);
  if (layers.size === 0) {
    listeners?.abort();
    listeners = null;
  }
}

function reset(layer: HTMLElement, end: HTMLElement): void {
  layer.append(end);
  end.style.width = '';
  end.style.height = '';
  end.style.userSelect = '';
  layer.classList.remove('selecting');
}

function resetAll(): void {
  layers.forEach((end, layer) => reset(layer, end));
}

function ensureListeners(): void {
  if (listeners) return;
  listeners = new AbortController();
  const { signal } = listeners;
  let pointerDown = false;
  let previousRange: Range | null = null;

  document.addEventListener(
    'pointerdown',
    (event) => {
      pointerDown = true;
      const layer = event.target instanceof Element ? event.target.closest<HTMLElement>('.textLayer') : null;
      if (layer && layers.has(layer)) layer.classList.add('selecting');
    },
    { signal },
  );
  document.addEventListener(
    'pointerup',
    () => {
      pointerDown = false;
      resetAll();
    },
    { signal },
  );
  window.addEventListener(
    'blur',
    () => {
      pointerDown = false;
      resetAll();
    },
    { signal },
  );
  document.addEventListener(
    'keyup',
    () => {
      if (!pointerDown) resetAll();
    },
    { signal },
  );
  document.addEventListener(
    'selectionchange',
    () => {
      const selection = document.getSelection();
      if (!selection || selection.rangeCount === 0) {
        resetAll();
        previousRange = null;
        return;
      }
      const active = new Set<HTMLElement>();
      for (let i = 0; i < selection.rangeCount; i++) {
        const range = selection.getRangeAt(i);
        for (const layer of layers.keys()) {
          if (!active.has(layer) && range.intersectsNode(layer)) active.add(layer);
        }
      }
      layers.forEach((end, layer) => {
        if (active.has(layer)) layer.classList.add('selecting');
        else reset(layer, end);
      });
      if (hasNativeSupport()) return;
      const range = selection.getRangeAt(0);
      placeEndOfContent(range, previousRange);
      previousRange = range.cloneRange();
    },
    { signal },
  );
}

/** Moves the end-of-content element beside the selection edge that is being extended. */
function placeEndOfContent(range: Range, previousRange: Range | null): void {
  const modifyStart =
    previousRange !== null &&
    (range.compareBoundaryPoints(Range.END_TO_END, previousRange) === 0 ||
      range.compareBoundaryPoints(Range.START_TO_END, previousRange) === 0);
  let anchor: Node | null = modifyStart ? range.startContainer : range.endContainer;
  if (anchor.nodeType === Node.TEXT_NODE) anchor = anchor.parentNode;
  if (!modifyStart && range.endOffset === 0) {
    do {
      while (anchor && !anchor.previousSibling) anchor = anchor.parentNode;
      anchor = anchor?.previousSibling ?? null;
    } while (anchor && !anchor.childNodes.length);
  }
  const parent = anchor?.parentElement;
  const layer = parent?.closest<HTMLElement>('.textLayer');
  const end = layer ? layers.get(layer) : undefined;
  if (!anchor || !parent || !layer || !end) return;
  end.style.width = layer.style.width;
  end.style.height = layer.style.height;
  end.style.userSelect = 'text';
  parent.insertBefore(end, modifyStart ? anchor : anchor.nextSibling);
}

/** Firefox and Chromium 148+ keep selections stable over gaps without help. */
function hasNativeSupport(): boolean {
  if (nativeSupport !== null) return nativeSupport;
  const firstEnd = layers.values().next().value;
  const isFirefox = !!firstEnd && getComputedStyle(firstEnd).getPropertyValue('-moz-user-select') === 'none';
  const nav = navigator as Navigator & { userAgentData?: { brands: { brand: string; version: string }[] } };
  const chromium =
    nav.userAgentData?.brands.find((b) => b.brand === 'Chromium')?.version ??
    /\bChrome\/(\d+)\b/.exec(navigator.userAgent)?.[1];
  nativeSupport = isFirefox || (!!chromium && parseInt(chromium, 10) >= 148);
  return nativeSupport;
}
