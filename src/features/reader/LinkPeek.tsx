import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { ArrowRight, Maximize2, Minimize2 } from 'lucide-react';
import { usePagesInverted } from '@/app/settingsStore';
import { pageCanvasContext } from '@/lib/pdf/canvas';
import { sectionForPage } from '@/lib/pdf/outline';
import type { PDFDocumentProxy } from '@/lib/pdf/pdfjs';
import type { ReadingLocation } from '@/lib/types';
import {
  PEEK_EXCERPT_HEIGHT,
  PEEK_PAGE_MAX_HEIGHT,
  PEEK_WIDTH,
  excerptFor,
  peekPageHeight,
  placePeek,
  wholePageSize,
  type Box,
  type PeekSide,
} from './linkPeekGeometry';
import { internalLinkTarget } from './pageRenderer';
import { useReaderStore } from './readerStore';
import type { Size } from './viewerLayout';
import './linkPeek.css';

/** Hover this long before a peek opens, so merely passing over links costs nothing. */
const DWELL_MS = 350;
/** Grace period for moving the pointer between a link and its card. */
const CLOSE_DELAY_MS = 200;
const LONG_PRESS_MS = 500;
const LONG_PRESS_SLOP_PX = 10;
/** Keeps the card this far inside the document area. */
const BOUNDS_INSET = 8;
const INTERNAL_LINK = 'a.page-sheet__link[data-link="internal"]';

interface Peek {
  link: HTMLAnchorElement;
  target: ReadingLocation;
  /** Keyboard peeks follow focus, pointer peeks follow the pointer, touch peeks stay until dismissed. */
  via: 'pointer' | 'keyboard' | 'touch';
  /** Width of the page image, and the tallest whole-page view that fits the viewport. */
  width: number;
  maxPageHeight: number;
}

type FocusAfterClose = 'link' | 'viewport' | 'none';

interface LinkPeekProps {
  pdf: PDFDocumentProxy;
  /** The viewer's scroll container; its internal links get peeks. */
  viewportRef: RefObject<HTMLElement | null>;
  /** Follows a link (the caller records history). */
  onNavigate(target: ReadingLocation): void;
}

/**
 * Glance at the destination of an internal link ("see Figure 3.2") without
 * leaving the page: hover a link, press Space / Shift+Enter on it, or
 * long-press it to see a crisp excerpt of the target, then go there or carry on.
 */
export function LinkPeek({ pdf, viewportRef, onNavigate }: LinkPeekProps) {
  const [peek, setPeek] = useState<Peek | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const interactionsRef = useRef<PeekInteractions | null>(null);
  const id = useId();
  const inverted = usePagesInverted();

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const interactions = new PeekInteractions(viewport, () => cardRef.current, setPeek);
    interactionsRef.current = interactions;
    const disconnect = interactions.connect();
    return () => {
      disconnect();
      interactionsRef.current = null;
    };
  }, [viewportRef]);

  useEffect(() => {
    if (!peek) return;
    const { link } = peek;
    link.setAttribute('aria-describedby', id);
    link.classList.add('is-peeking');
    return () => {
      link.removeAttribute('aria-describedby');
      link.classList.remove('is-peeking');
    };
  }, [peek, id]);

  if (!peek) return null;
  return createPortal(
    <PeekCard
      key={`${peek.target.page}:${peek.target.offset}`}
      pdf={pdf}
      peek={peek}
      id={id}
      cardRef={cardRef}
      viewportRef={viewportRef}
      inverted={inverted}
      onPointerEnter={() => interactionsRef.current?.cardEnter()}
      onPointerLeave={() => interactionsRef.current?.cardLeave()}
      onGo={() => {
        interactionsRef.current?.close('viewport');
        onNavigate(peek.target);
      }}
    />,
    document.body,
  );
}

interface PeekCardProps {
  pdf: PDFDocumentProxy;
  peek: Peek;
  id: string;
  cardRef: RefObject<HTMLDivElement | null>;
  viewportRef: RefObject<HTMLElement | null>;
  inverted: boolean;
  onPointerEnter(): void;
  onPointerLeave(): void;
  onGo(): void;
}

function PeekCard({
  pdf,
  peek,
  id,
  cardRef,
  viewportRef,
  inverted,
  onPointerEnter,
  onPointerLeave,
  onGo,
}: PeekCardProps) {
  const { target, width, maxPageHeight } = peek;
  const pageNumber = target.page;
  const label = useReaderStore((s) => s.pageLabels?.[pageNumber - 1]) || String(pageNumber);
  const outline = useReaderStore((s) => s.outline);
  const section = useMemo(() => sectionForPage(outline, pageNumber), [outline, pageNumber]);
  const [expanded, setExpanded] = useState(false);
  const [preview, setPreview] = useState<PagePreview>(() => cachedPreview(pdf, pageNumber, width));
  const bodyRef = useRef<HTMLDivElement>(null);
  const bitmapRef = useRef<HTMLDivElement>(null);
  const sideRef = useRef<PeekSide>('below');

  useEffect(() => {
    if (preview.canvas) return;
    const abort = new AbortController();
    renderPreview(pdf, pageNumber, width, abort.signal, (size) => setPreview((p) => ({ ...p, size })))
      .then(setPreview)
      .catch(() => {
        // Cancelled (the peek closed) or unreadable: the blank sheet stays.
      });
    return () => abort.abort();
  }, [pdf, pageNumber, width, preview.canvas]);

  useLayoutEffect(() => {
    const host = bitmapRef.current;
    if (!host || !preview.canvas) return;
    host.replaceChildren(preview.canvas);
    return () => host.replaceChildren();
  }, [preview.canvas]);

  const size = preview.size;
  const excerpt = size ? excerptFor(size, target.offset, width) : null;
  const whole = size ? wholePageSize(size, width, maxPageHeight) : null;
  const frame =
    excerpt && whole
      ? expanded
        ? whole
        : { width, height: excerpt.height }
      : { width, height: PEEK_EXCERPT_HEIGHT };
  const bitmap =
    excerpt && whole
      ? expanded
        ? { ...whole, top: 0 }
        : { width, height: excerpt.pageHeight, top: excerpt.top }
      : null;
  const edges =
    excerpt && !expanded
      ? `${excerpt.top > 0 ? ' is-cut-top' : ''}${excerpt.truncated ? ' is-cut-bottom' : ''}`
      : '';

  // Position against the card's final size (its frame may still be animating).
  useLayoutEffect(() => {
    const card = cardRef.current;
    const body = bodyRef.current;
    const viewport = viewportRef.current;
    if (!card || !body || !viewport) return;
    const chrome = card.offsetHeight - body.offsetHeight;
    const placement = placePeek(
      peek.link.getBoundingClientRect(),
      { width: card.offsetWidth, height: chrome + frame.height },
      inset(viewport.getBoundingClientRect(), BOUNDS_INSET),
      { prefer: sideRef.current },
    );
    sideRef.current = placement.side;
    card.style.top = `${placement.top}px`;
    card.style.left = `${placement.left}px`;
    card.dataset.side = placement.side;
  }, [peek, frame.height, cardRef, viewportRef]);

  return (
    <div
      ref={cardRef}
      id={id}
      role="dialog"
      aria-label={`Preview of page ${label}`}
      className={`link-peek${inverted ? ' invert-pages' : ''}`}
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
    >
      <div className="link-peek__header">
        <p className="link-peek__title">
          <span className="link-peek__page-number">p. {label}</span>
          {section && <span className="link-peek__section"> · {section}</span>}
        </p>
        <button
          type="button"
          className="btn btn--ghost btn--icon btn--sm"
          aria-label={expanded ? 'Show excerpt' : 'Show whole page'}
          aria-pressed={expanded}
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded ? <Minimize2 /> : <Maximize2 />}
        </button>
        <button
          type="button"
          className="btn btn--sm link-peek__go"
          aria-label={`Go to page ${label}`}
          onClick={onGo}
        >
          Go to
          <ArrowRight aria-hidden="true" />
        </button>
      </div>
      <div ref={bodyRef} className="link-peek__body" style={{ width }}>
        <div
          className={`link-peek__frame page-thumb${edges}`}
          style={{ width: frame.width, height: frame.height }}
        >
          <div
            ref={bitmapRef}
            className="link-peek__bitmap"
            style={bitmap ? { width: bitmap.width, height: bitmap.height, top: -bitmap.top } : undefined}
          />
        </div>
      </div>
    </div>
  );
}

/**
 * Pointer, keyboard and touch handling for peeks. Delegated listeners on the
 * viewport mean links need no wiring of their own, and nothing runs until a
 * link is actually dwelt on.
 */
class PeekInteractions {
  private current: Peek | null = null;
  private pending: HTMLAnchorElement | null = null;
  private dwellTimer = 0;
  private closeTimer = 0;
  private press: { link: HTMLAnchorElement; x: number; y: number; timer: number } | null = null;
  private suppressClick = false;
  private openToken = 0;

  constructor(
    private readonly viewport: HTMLElement,
    private readonly card: () => HTMLElement | null,
    private readonly onChange: (peek: Peek | null) => void,
  ) {}

  connect(): () => void {
    const listeners = new AbortController();
    const { signal } = listeners;
    this.viewport.addEventListener('pointermove', this.onPointerMove, { signal });
    this.viewport.addEventListener('pointerout', this.onPointerOut, { signal });
    this.viewport.addEventListener('click', this.onClick, { signal, capture: true });
    this.viewport.addEventListener('contextmenu', this.onContextMenu, { signal });
    this.viewport.addEventListener('scroll', this.onScroll, { signal, passive: true });
    document.addEventListener('pointerdown', this.onPointerDown, { signal, capture: true });
    document.addEventListener('pointerup', this.cancelPress, { signal, capture: true });
    document.addEventListener('pointercancel', this.cancelPress, { signal, capture: true });
    document.addEventListener('keydown', this.onKeyDown, { signal, capture: true });
    document.addEventListener('focusout', this.onFocusOut, { signal });
    window.addEventListener('resize', () => this.close('none'), { signal });
    return () => {
      listeners.abort();
      this.close('none');
    };
  }

  cardEnter(): void {
    this.cancelClose();
  }

  cardLeave(): void {
    if (this.current?.via === 'pointer') this.scheduleClose();
  }

  async open(link: HTMLAnchorElement, via: Peek['via']): Promise<void> {
    this.cancelDwell();
    this.cancelClose();
    const token = ++this.openToken;
    const target = await internalLinkTarget(link);
    if (token !== this.openToken || !target || !link.isConnected) return;
    const area = this.viewport.getBoundingClientRect();
    this.current = {
      link,
      target,
      via,
      width: Math.max(200, Math.min(PEEK_WIDTH, Math.floor(area.width) - 48)),
      maxPageHeight: Math.max(160, Math.min(PEEK_PAGE_MAX_HEIGHT, Math.floor(area.height) - 96)),
    };
    this.onChange(this.current);
  }

  close(focus: FocusAfterClose): void {
    this.openToken++;
    this.cancelDwell();
    this.cancelClose();
    this.cancelPress();
    const current = this.current;
    if (!current) return;
    this.current = null;
    this.onChange(null);
    if (focus === 'link' && current.link.isConnected) current.link.focus({ preventScroll: true });
    else if (focus === 'viewport') this.viewport.focus({ preventScroll: true, focusVisible: false });
  }

  private readonly onPointerMove = (event: PointerEvent) => {
    if (event.pointerType === 'touch') {
      const press = this.press;
      if (press && Math.hypot(event.clientX - press.x, event.clientY - press.y) > LONG_PRESS_SLOP_PX) {
        this.cancelPress();
      }
      return;
    }
    // Movement (not pointerover) starts the dwell, so content scrolling under a
    // resting pointer never pops a peek open.
    const link = this.linkAt(event.target);
    if (!link) return;
    if (link === this.current?.link) this.cancelClose();
    else if (link !== this.pending) this.startDwell(link);
  };

  private readonly onPointerOut = (event: PointerEvent) => {
    const link = this.linkAt(event.target);
    if (!link || link.contains(event.relatedTarget as Node | null)) return;
    if (link === this.pending) this.cancelDwell();
    if (link === this.current?.link && this.current.via === 'pointer') this.scheduleClose();
  };

  private readonly onPointerDown = (event: PointerEvent) => {
    this.cancelDwell();
    this.suppressClick = false;
    if (this.card()?.contains(event.target as Node)) return;
    const link = this.linkAt(event.target);
    if (this.current && link !== this.current.link) this.close('none');
    if (event.pointerType === 'touch' && link) this.startPress(link, event);
  };

  private readonly onClick = (event: MouseEvent) => {
    if (!this.linkAt(event.target)) return;
    if (this.suppressClick) {
      // The long press that opened this peek must not also follow the link.
      event.preventDefault();
      event.stopImmediatePropagation();
      this.suppressClick = false;
      return;
    }
    this.close('none');
  };

  private readonly onContextMenu = (event: MouseEvent) => {
    const link = this.linkAt(event.target);
    if (!link || !(this.press || this.current?.via === 'touch')) return;
    event.preventDefault();
    if (this.press?.link === link) this.firePress();
  };

  private readonly onScroll = () => {
    this.cancelDwell();
    this.cancelPress();
    if (this.current) this.close(this.focusInCard() ? 'link' : 'none');
  };

  private readonly onKeyDown = (event: KeyboardEvent) => {
    const current = this.current;
    if (current && event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      this.close(this.focusInCard() || document.activeElement === current.link ? 'link' : 'none');
      return;
    }
    const link = this.linkAt(event.target);
    if (link && event.target === link && (event.key === ' ' || (event.key === 'Enter' && event.shiftKey))) {
      event.preventDefault();
      event.stopPropagation();
      if (current?.link === link) this.close('none');
      else void this.open(link, 'keyboard');
      return;
    }
    if (current && event.key === 'Tab') this.moveFocus(event, current);
  };

  /** Tab moves from the link into the card; leaving the card returns to the link. */
  private moveFocus(event: KeyboardEvent, current: Peek): void {
    const card = this.card();
    const controls = card ? Array.from(card.querySelectorAll<HTMLElement>('button:not(:disabled)')) : [];
    if (!card || controls.length === 0) return;
    if (event.target === current.link && !event.shiftKey) {
      event.preventDefault();
      controls[0].focus();
    } else if (event.shiftKey && event.target === controls[0]) {
      event.preventDefault();
      current.link.focus({ preventScroll: true });
    } else if (!event.shiftKey && event.target === controls.at(-1)) {
      event.preventDefault();
      this.close('link');
    }
  }

  private readonly onFocusOut = (event: FocusEvent) => {
    const current = this.current;
    if (!current || current.via !== 'keyboard') return;
    const next = event.relatedTarget as Node | null;
    if (next && (current.link.contains(next) || this.card()?.contains(next))) return;
    this.close('none');
  };

  private startDwell(link: HTMLAnchorElement): void {
    this.cancelDwell();
    this.pending = link;
    this.dwellTimer = window.setTimeout(() => {
      this.dwellTimer = 0;
      this.pending = null;
      void this.open(link, 'pointer');
    }, DWELL_MS);
  }

  private cancelDwell(): void {
    window.clearTimeout(this.dwellTimer);
    this.dwellTimer = 0;
    this.pending = null;
  }

  private scheduleClose(): void {
    if (this.closeTimer) return;
    this.closeTimer = window.setTimeout(() => {
      this.closeTimer = 0;
      this.close(this.focusInCard() ? 'link' : 'none');
    }, CLOSE_DELAY_MS);
  }

  private cancelClose(): void {
    window.clearTimeout(this.closeTimer);
    this.closeTimer = 0;
  }

  private startPress(link: HTMLAnchorElement, event: PointerEvent): void {
    this.cancelPress();
    const timer = window.setTimeout(() => this.firePress(), LONG_PRESS_MS);
    this.press = { link, x: event.clientX, y: event.clientY, timer };
  }

  private firePress(): void {
    const press = this.press;
    if (!press) return;
    this.cancelPress();
    this.suppressClick = true;
    void this.open(press.link, 'touch');
  }

  private readonly cancelPress = () => {
    if (!this.press) return;
    window.clearTimeout(this.press.timer);
    this.press = null;
  };

  private focusInCard(): boolean {
    return !!this.card()?.contains(document.activeElement);
  }

  private linkAt(target: EventTarget | null): HTMLAnchorElement | null {
    const link = target instanceof Element ? target.closest<HTMLAnchorElement>(INTERNAL_LINK) : null;
    return link && this.viewport.contains(link) ? link : null;
  }
}

// ---------------------------------------------------------------- previews

interface PagePreview {
  /** Unscaled page size, known before the bitmap is ready. */
  size: Size | null;
  canvas: HTMLCanvasElement | null;
}

interface RenderedPreview {
  size: Size;
  canvas: HTMLCanvasElement;
}

const PREVIEW_CACHE_SIZE = 8;
const MAX_PREVIEW_PIXELS = 8_000_000;
const previewCaches = new WeakMap<PDFDocumentProxy, Map<string, RenderedPreview>>();

function previewKey(page: number, width: number): string {
  return `${page}:${width}@${window.devicePixelRatio || 1}`;
}

function cachedPreview(pdf: PDFDocumentProxy, page: number, width: number): PagePreview {
  const cache = previewCaches.get(pdf);
  const key = previewKey(page, width);
  const entry = cache?.get(key);
  if (!cache || !entry) return { size: null, canvas: null };
  cache.delete(key);
  cache.set(key, entry);
  return entry;
}

/**
 * Draws the whole page at the peek width (and device pixel ratio). One bitmap
 * serves both the excerpt (cropped by CSS) and the whole-page view.
 */
async function renderPreview(
  pdf: PDFDocumentProxy,
  pageNumber: number,
  width: number,
  signal: AbortSignal,
  onSize: (size: Size) => void,
): Promise<RenderedPreview> {
  const page = await pdf.getPage(pageNumber);
  signal.throwIfAborted();
  const base = page.getViewport({ scale: 1 });
  const size = { width: base.width, height: base.height };
  onSize(size);
  const height = peekPageHeight(size, width);
  const ratio = Math.min(window.devicePixelRatio || 1, Math.sqrt(MAX_PREVIEW_PIXELS / (width * height)));
  const viewport = page.getViewport({ scale: (width / base.width) * ratio });
  const canvas = document.createElement('canvas');
  canvas.className = 'link-peek__canvas';
  canvas.setAttribute('aria-hidden', 'true');
  canvas.width = Math.max(1, Math.floor(width * ratio));
  canvas.height = Math.max(1, Math.floor(height * ratio));
  const task = page.render({
    canvas: null,
    canvasContext: pageCanvasContext(canvas),
    viewport,
    transform: [canvas.width / viewport.width, 0, 0, canvas.height / viewport.height, 0, 0],
  });
  const cancel = () => task.cancel();
  signal.addEventListener('abort', cancel);
  try {
    await task.promise;
  } catch (error) {
    canvas.width = 0;
    canvas.height = 0;
    throw error;
  } finally {
    signal.removeEventListener('abort', cancel);
    // Peeked pages are usually far away; don't keep their parsed content around.
    page.cleanup();
  }
  const preview = { size, canvas };
  remember(pdf, previewKey(pageNumber, width), preview);
  return preview;
}

function remember(pdf: PDFDocumentProxy, key: string, preview: RenderedPreview): void {
  let cache = previewCaches.get(pdf);
  if (!cache) {
    cache = new Map();
    previewCaches.set(pdf, cache);
  }
  cache.delete(key);
  cache.set(key, preview);
  for (const [oldKey, old] of cache) {
    if (cache.size <= PREVIEW_CACHE_SIZE) break;
    cache.delete(oldKey);
    if (!old.canvas.isConnected) {
      old.canvas.width = 0;
      old.canvas.height = 0;
    }
  }
}

function inset(rect: DOMRect, by: number): Box {
  return { top: rect.top + by, left: rect.left + by, bottom: rect.bottom - by, right: rect.right - by };
}
