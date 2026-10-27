import type { ReactNode } from 'react';
import type { PDFDocumentProxy } from '@/lib/pdf/pdfjs';
import type { ReadingLocation } from '@/lib/types';

export interface PageSize {
  width: number;
  height: number;
}

export interface ViewerProps {
  pdf: PDFDocumentProxy;
  /** Called with the target of an internal PDF link; the caller records history. */
  onLinkClick(target: ReadingLocation): void;
  /** Content rendered in the margin column to the right of each page. */
  renderMargin?(page: number, size: PageSize): ReactNode;
  /** Content layered over each page sheet (ribbons, note markers). */
  renderPageOverlay?(page: number, size: PageSize): ReactNode;
}

/** Continuous, virtualized PDF page view. Owned by the viewer workstream. */
export function Viewer(_props: ViewerProps) {
  return null;
}
