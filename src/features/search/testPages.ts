import { buildPageText, type PageBox, type PageText, type TextItemLike } from './pageText';

const BOX: PageBox = { view: [0, 0, 612, 792], rotation: 0 };

/** A page of 10-pt text with one text item per line, top to bottom, as pdf.js reports a typical page. */
export function makePage(page: number, ...lines: string[]): PageText {
  const items: TextItemLike[] = lines.map((str, i) => ({
    str,
    transform: [10, 0, 0, 10, 72, 740 - i * 14],
    width: str.length * 5,
    height: 10,
    hasEOL: true,
  }));
  return buildPageText(page, items, BOX);
}
