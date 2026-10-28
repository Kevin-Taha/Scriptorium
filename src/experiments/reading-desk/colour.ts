/** Colour helpers for shelf spines: a muted cloth colour from a cover, plus legible ink. */

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

export interface Hsl {
  h: number;
  s: number;
  l: number;
}

/** Spine ink, matching the app's light-theme text and inverse text tokens. */
export const INK_DARK: Rgb = { r: 42, g: 38, b: 34 };
export const INK_LIGHT: Rgb = { r: 251, g: 248, b: 242 };

export function rgbToHsl({ r, g, b }: Rgb): Hsl {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === rn) h = (gn - bn) / d + (gn < bn ? 6 : 0);
  else if (max === gn) h = (bn - rn) / d + 2;
  else h = (rn - gn) / d + 4;
  return { h: h * 60, s, l };
}

export function hslToRgb({ h, s, l }: Hsl): Rgb {
  const hue = (((h % 360) + 360) % 360) / 360;
  if (s === 0) {
    const v = Math.round(l * 255);
    return { r: v, g: v, b: v };
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const channel = (t0: number) => {
    let t = t0;
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return {
    r: Math.round(channel(hue + 1 / 3) * 255),
    g: Math.round(channel(hue) * 255),
    b: Math.round(channel(hue - 1 / 3) * 255),
  };
}

function chroma({ r, g, b }: Rgb): number {
  return (Math.max(r, g, b) - Math.min(r, g, b)) / 255;
}

/**
 * A representative colour for RGBA pixels: the average of the colourful pixels
 * when there are enough of them (so a dark title on a red cover still reads
 * as red), otherwise the plain average.
 */
export function representativeColour(data: ArrayLike<number>): Rgb {
  let r = 0;
  let g = 0;
  let b = 0;
  let n = 0;
  let cr = 0;
  let cg = 0;
  let cb = 0;
  let cw = 0;
  for (let i = 0; i + 3 < data.length; i += 4) {
    if (data[i + 3] < 128) continue;
    const px = { r: data[i], g: data[i + 1], b: data[i + 2] };
    r += px.r;
    g += px.g;
    b += px.b;
    n++;
    const weight = chroma(px);
    if (weight > 0.12) {
      cr += px.r * weight;
      cg += px.g * weight;
      cb += px.b * weight;
      cw += weight;
    }
  }
  if (!n) return { r: 200, g: 190, b: 175 };
  if (cw / n > 0.04) return { r: cr / cw, g: cg / cw, b: cb / cw };
  return { r: r / n, g: g / n, b: b / n };
}

const clampTo = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/**
 * Mutes and deepens a cover colour into something that reads as book cloth on a
 * shelf: saturation is capped, lightness kept within a band, and near-greys are
 * warmed so a plain white title page becomes a parchment spine rather than grey.
 */
export function spineColour(source: Rgb): Rgb {
  let { h, s, l } = rgbToHsl(source);
  if (chroma(source) < 0.08) {
    h = 36;
    s = 0.24;
    l = clampTo(l * 0.92, 0.3, 0.84);
  } else {
    s = clampTo(s * 0.72, 0.18, 0.5);
    l = clampTo(l * 0.88, 0.22, 0.7);
  }
  return hslToRgb({ h, s, l });
}

function channelLuminance(c: number): number {
  const v = c / 255;
  return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance({ r, g, b }: Rgb): number {
  return 0.2126 * channelLuminance(r) + 0.7152 * channelLuminance(g) + 0.0722 * channelLuminance(b);
}

export function contrastRatio(a: Rgb, b: Rgb): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Light or dark ink for text on `background`, whichever contrasts more. */
export function pickInk(background: Rgb): { ink: Rgb; tone: 'light' | 'dark'; contrast: number } {
  const light = contrastRatio(background, INK_LIGHT);
  const dark = contrastRatio(background, INK_DARK);
  return light >= dark
    ? { ink: INK_LIGHT, tone: 'light', contrast: light }
    : { ink: INK_DARK, tone: 'dark', contrast: dark };
}

export function toCss({ r, g, b }: Rgb): string {
  return `rgb(${Math.round(r)} ${Math.round(g)} ${Math.round(b)})`;
}

export interface SpineStyle {
  background: Rgb;
  ink: Rgb;
  tone: 'light' | 'dark';
  contrast: number;
}

/**
 * Spine cloth for a cover colour with ink that reaches 4.5:1: if the muted
 * colour sits in the murky middle, it is nudged darker (light ink) or lighter
 * (dark ink) until the title is comfortably legible.
 */
export function legibleSpine(cover: Rgb, minContrast = 4.5): SpineStyle {
  let background = spineColour(cover);
  let pick = pickInk(background);
  const hsl = rgbToHsl(background);
  for (let step = 0; step < 20 && pick.contrast < minContrast; step++) {
    hsl.l = clampTo(hsl.l + (pick.tone === 'light' ? -0.025 : 0.025), 0, 1);
    background = hslToRgb(hsl);
    pick = pickInk(background);
  }
  return { background, ink: pick.ink, tone: pick.tone, contrast: pick.contrast };
}
