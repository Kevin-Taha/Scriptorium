import { useLayoutEffect, useMemo, useRef } from 'react';
import { renderTex, useKatex } from './katex';

interface TexMathProps {
  src: string;
  display?: boolean;
  /** Shown instead of the raw `$…$` source while KaTeX is loading. */
  fallback?: string;
}

/** Marks which edges of a sideways-scrolling equation have more to see, so CSS can fade them. */
function useScrollFade(html: string | null, enabled: boolean) {
  const ref = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!enabled || !element || html === null) return;
    const update = () => {
      const room = element.scrollWidth - element.clientWidth;
      if (room <= 1) element.removeAttribute('data-fade');
      else if (element.scrollLeft <= 1) element.setAttribute('data-fade', 'end');
      else if (element.scrollLeft >= room - 1) element.setAttribute('data-fade', 'start');
      else element.setAttribute('data-fade', 'both');
    };
    update();
    // The equation can resize without the scroller doing so (fonts arriving).
    const observer = new ResizeObserver(update);
    observer.observe(element);
    const content = element.firstElementChild;
    if (content) observer.observe(content);
    element.addEventListener('scroll', update, { passive: true });
    return () => {
      observer.disconnect();
      element.removeEventListener('scroll', update);
    };
  }, [html, enabled]);
  return ref;
}

/** Maths via KaTeX. The raw source shows in a muted mono style until KaTeX has loaded. */
export function TexMath({ src, display = false, fallback }: TexMathProps) {
  const katex = useKatex();
  const html = useMemo(() => (katex ? renderTex(katex, src, display) : null), [katex, src, display]);
  const scroller = useScrollFade(html, display);
  const shape = display ? 'rich-math rich-math--display' : 'rich-math';

  if (html === null) {
    const raw = fallback ?? (display ? `$$${src}$$` : `$${src}$`);
    return <span className={`${shape} rich-math--raw`}>{raw}</span>;
  }
  // KaTeX output only: it escapes the TeX source, and `trust` is off.
  // biome-ignore lint/security/noDangerouslySetInnerHtml: the HTML is KaTeX's own escaped output
  return <span ref={scroller} className={shape} dangerouslySetInnerHTML={{ __html: html }} />;
}
