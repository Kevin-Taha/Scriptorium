export interface FuzzyText {
  normalized: string;
  indices: number[];
  wordStarts: boolean[];
}

export interface FuzzyMatch {
  score: number;
  indices: number[];
}

/** Preserve UTF-16 offsets into the original text while removing accents. */
export function prepareFuzzyText(text: string): FuzzyText {
  let normalized = '';
  const indices: number[] = [];
  const wordStarts: boolean[] = [];
  let offset = 0;
  let previousWord = false;
  for (const char of text) {
    const word = /[\p{L}\p{N}]/u.test(char);
    const folded = char.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
    for (let i = 0; i < folded.length; i++) {
      normalized += folded[i];
      indices.push(offset);
      wordStarts.push(word && !previousWord && i === 0);
    }
    if (folded) previousWord = word;
    offset += char.length;
  }
  return { normalized, indices, wordStarts };
}

export function normalizeQuery(query: string): string {
  return query.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim();
}

/** Linear subsequence matching with bonuses for prefix, word starts and runs. */
export function matchPrepared(query: string, text: FuzzyText): FuzzyMatch | null {
  if (!query) return { score: 0, indices: [] };
  const positions: number[] = [];
  let cursor = 0;
  let score = 0;
  let previous = -2;
  for (let i = 0; i < query.length; i++) {
    const found = text.normalized.indexOf(query[i], cursor);
    if (found < 0) return null;
    positions.push(text.indices[found]);
    score += 1 + (text.wordStarts[found] ? 12 : 0) + (found === previous + 1 ? 16 : 0);
    if (i === 0 && found === 0) score += 24;
    previous = found;
    cursor = found + 1;
  }
  score -= Math.min(20, positions[0] * 0.1);
  score -= Math.min(10, (cursor - query.length) * 0.1);
  return { score, indices: positions };
}
