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
  excerptFor,
  peekPageHeight,
  placePeek,
  wholePageSize,
  type Box,
  type PeekSide,
} from './linkPeekGeometry';
import { PeekInteractions, type Peek } from './linkPeekInteractions';
import { internalLinkTarget } from './pageRenderer';
import { useReaderStore } from './readerStore';
import type { Size } from './viewerLayout';
import './linkPeek.css';

/** Keeps the card this far inside the document area. */
const BOUNDS_INSET = 8;
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
    const interactions = new PeekInteractions(viewport, () => cardRef.current, setPeek, internalLinkTarget);
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
