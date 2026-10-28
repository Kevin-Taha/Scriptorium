import { useEffect, useState } from 'react';
import type { LibraryDocument } from '@/lib/types';
import { hslToRgb, legibleSpine, representativeColour, type SpineStyle } from './colour';

const cache = new Map<string, SpineStyle>();
const pending = new Map<string, Promise<SpineStyle>>();

function fallbackStyle(id: string): SpineStyle {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  const hues = [12, 28, 42, 95, 160, 205, 225, 340];
  return legibleSpine(hslToRgb({ h: hues[h % hues.length], s: 0.4, l: 0.4 }));
}

function sampleCover(dataUrl: string): Promise<SpineStyle | null> {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = 24;
        canvas.height = 32;
        const context = canvas.getContext('2d', { willReadFrequently: true });
        if (!context) return resolve(null);
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
        resolve(legibleSpine(representativeColour(data)));
      } catch {
        resolve(null);
      }
    };
    image.onerror = () => resolve(null);
    image.src = dataUrl;
  });
}

function computeStyle(doc: LibraryDocument): Promise<SpineStyle> {
  const existing = pending.get(doc.id);
  if (existing) return existing;
  const promise = (doc.coverDataUrl ? sampleCover(doc.coverDataUrl) : Promise.resolve(null)).then((style) => {
    const result = style ?? fallbackStyle(doc.id);
    cache.set(doc.id, result);
    pending.delete(doc.id);
    return result;
  });
  pending.set(doc.id, promise);
  return promise;
}

/** Spine cloth and ink derived from a book's cover (cached per book). */
export function useSpineStyle(doc: LibraryDocument): SpineStyle | null {
  const [style, setStyle] = useState<SpineStyle | null>(() => cache.get(doc.id) ?? null);
  useEffect(() => {
    const cached = cache.get(doc.id);
    if (cached) {
      setStyle(cached);
      return;
    }
    let active = true;
    void computeStyle(doc).then((result) => {
      if (active) setStyle(result);
    });
    return () => {
      active = false;
    };
  }, [doc]);
  return style;
}
