const MATH = /\$\$[\s\S]+?\$\$|\\\[[\s\S]+?\\\]|\\\([\s\S]+?\\\)|\$(?=\S)[^$\n]*?\S\$(?!\d)/g;
const MATH_DELIMITERS = /^(?:\$\$?|\\[[(])\s*|\s*(?:\$\$?|\\[\])])$/g;

function stripMarkup(text: string): string {
  return text
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^\s*(?:[-*+]|\d+[.)]|>)\s+/gm, '')
    .replace(/\*\*|__|~~|`/g, '')
    .replace(/(^|\W)[*_]+|[*_]+(?=\W|$)/g, '$1')
    .replace(/\\([$*_`~])/g, '$1');
}

/** One line of plain text for a note's compact preview: markup dropped, maths kept as its TeX source. */
export function plainPreview(text: string): string {
  let out = '';
  let last = 0;
  for (const match of text.matchAll(MATH)) {
    out += stripMarkup(text.slice(last, match.index));
    out += match[0].replace(MATH_DELIMITERS, '');
    last = match.index + match[0].length;
  }
  out += stripMarkup(text.slice(last));
  return out.replace(/\s+/g, ' ').trim();
}
