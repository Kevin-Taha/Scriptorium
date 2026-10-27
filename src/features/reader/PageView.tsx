import { memo, useLayoutEffect, useMemo, useRef, type CSSProperties, type ReactNode } from 'react';
import type { PageRenderer } from './pageRenderer';
import type { Size } from './viewerLayout';

interface PageViewProps {
  page: number;
  top: number;
  left: number;
  width: number;
  height: number;
  /** CSS px per unscaled page unit; drives the text layer's font scaling. */
  scale: number;
  renderer: PageRenderer;
  renderMargin?(page: number, size: Size): ReactNode;
  renderPageOverlay?(page: number, size: Size): ReactNode;
}

/**
 * One row of the continuous view: the page sheet and its margin column. The
 * sheet's canvas, text layer and links are filled in by the `PageRenderer`
 * while the page is near the viewport; margin and overlay content are always
 * rendered so notes can be positioned from the page size alone.
 */
export const PageView = memo(function PageView({
  page,
  top,
  left,
  width,
  height,
  scale,
  renderer,
  renderMargin,
  renderPageOverlay,
}: PageViewProps) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const textLayerRef = useRef<HTMLDivElement>(null);
  const linksRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    renderer.attach(page, {
      sheet: sheetRef.current!,
      textLayer: textLayerRef.current!,
      links: linksRef.current!,
    });
    return () => renderer.detach(page);
  }, [renderer, page]);

  const size = useMemo(() => ({ width, height }), [width, height]);

  return (
    <div
      className="reader__page"
      data-page={page}
      role="group"
      aria-label={`Page ${page}`}
      style={{ top, left }}
    >
      <div
        ref={sheetRef}
        className="page-sheet"
        data-page={page}
        style={{ width, height, '--scale-factor': scale } as CSSProperties}
      >
        <div ref={textLayerRef} className="textLayer page-sheet__text-layer" />
        <div ref={linksRef} className="page-sheet__links" />
        <div className="page-sheet__overlay">{renderPageOverlay?.(page, size)}</div>
      </div>
      <div className="page-margin" data-page={page} style={{ height }}>
        {renderMargin?.(page, size)}
      </div>
    </div>
  );
});
