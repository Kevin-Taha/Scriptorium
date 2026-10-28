import { useEffect, useState } from 'react';

type Katex = typeof import('katex').default;

const CACHE_LIMIT = 300;

let loaded: Katex | null = null;
let loading: Promise<Katex> | null = null;
const rendered = new Map<string, string>();

/** KaTeX and its stylesheet are fetched on first use, so the main bundle never carries them. */
export function loadKatex(): Promise<Katex> {
  if (!loading) {
    loading = Promise.all([import('katex'), import('katex/dist/katex.min.css')]).then(([module]) => {
      loaded = module.default;
      return module.default;
    });
    loading.catch(() => {
      loading = null;
    });
  }
  return loading;
}

/** KaTeX once it has loaded, `null` until then (and for good if the chunk cannot be fetched). */
export function useKatex(): Katex | null {
  const [katex, setKatex] = useState<Katex | null>(loaded);
  useEffect(() => {
    if (katex) return;
    let live = true;
    loadKatex().then(
      (module) => live && setKatex(module),
      () => {},
    );
    return () => {
      live = false;
    };
  }, [katex]);
  return katex;
}

/** KaTeX's HTML for `src`, or `null` if it cannot be rendered at all. Invalid TeX comes back as KaTeX's error span. */
export function renderTex(katex: Katex, src: string, display: boolean): string | null {
  const key = `${display ? 'D' : 'I'}${src}`;
  const cached = rendered.get(key);
  if (cached !== undefined) return cached;
  let html: string;
  try {
    html = katex.renderToString(src, {
      throwOnError: false,
      displayMode: display,
      output: 'htmlAndMathml',
      trust: false,
      strict: 'ignore',
      errorColor: 'var(--color-danger)',
      maxSize: 50,
    });
  } catch {
    return null;
  }
  if (rendered.size >= CACHE_LIMIT) rendered.delete(rendered.keys().next().value as string);
  rendered.set(key, html);
  return html;
}
