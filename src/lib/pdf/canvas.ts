/**
 * Context to draw a page into. pdf.js defaults to an opaque context, which
 * makes browsers use subpixel (LCD) text antialiasing; its colour fringes show
 * once the bitmap is multiplied onto the sheet colour or inverted for night
 * reading. A context with alpha gets greyscale antialiasing instead.
 */
export function pageCanvasContext(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  return canvas.getContext('2d', { alpha: true, willReadFrequently: true })!;
}
