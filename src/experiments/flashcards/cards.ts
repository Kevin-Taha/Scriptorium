import type { Highlight, MarginNote, NoteColor } from '@/lib/types';

export interface Flashcard {
  id: string;
  kind: 'qa' | 'cloze' | 'explain';
  front: string;
  back: string;
  page: number;
  y: number;
  color: NoteColor;
  source: 'note' | 'highlight';
}

const CLOZE = /\{\{(?:c\d+::)?([^{}]+)\}\}/gi;
const STOP_WORDS = new Set(
  'about above after again against almost along among another around because before being between both could does during each either enough every first from have having into itself their there these those through under until using very which while would'.split(
    ' ',
  ),
);

function hash(text: string): string {
  let value = 2166136261;
  for (let i = 0; i < text.length; i++) {
    value = Math.imul(value ^ text.charCodeAt(i), 16777619);
  }
  return (value >>> 0).toString(36);
}

function qa(text: string): { front: string; back: string } | null {
  const lines = /^\s*Q:\s*(.+?)\s*\r?\n\s*A:\s*([\s\S]+?)\s*$/i.exec(text);
  if (lines?.[1] && lines[2]) return { front: lines[1].trim(), back: lines[2].trim() };
  // An Anki-style cloze delimiter is not a question/answer separator.
  const masked = text.replace(CLOZE, (match) => ' '.repeat(match.length));
  const separator = masked.indexOf('::');
  if (separator < 0) return null;
  const front = text.slice(0, separator).trim();
  const back = text.slice(separator + 2).trim();
  return front && back ? { front, back } : null;
}

function cloze(text: string): { front: string; back: string } | null {
  let found = false;
  const front = text.replace(CLOZE, () => {
    found = true;
    return '[ … ]';
  });
  if (!found) return null;
  const back = text.replace(CLOZE, (_match, term: string) => term.trim());
  return { front: front.trim(), back: back.trim() };
}

function automaticCloze(text: string): { front: string; back: string } | null {
  const words = [...text.matchAll(/\p{L}[\p{L}'’-]*/gu)];
  if (words.length < 4) return null;
  const nonStopWords = words.filter((word) => !STOP_WORDS.has(word[0].toLowerCase()));
  const longWords = nonStopWords.filter(
    (word) => word[0].replace(/[^\p{L}]/gu, '').length >= 6 && !STOP_WORDS.has(word[0].toLowerCase()),
  );
  const candidates = longWords.length ? longWords : nonStopWords.length ? nonStopWords : words;
  const frequencies = new Map<string, number>();
  for (const word of words) {
    const key = word[0].toLowerCase();
    frequencies.set(key, (frequencies.get(key) ?? 0) + 1);
  }
  candidates.sort((a, b) => {
    const score = (word: RegExpMatchArray) =>
      word[0].length +
      ((frequencies.get(word[0].toLowerCase()) ?? 0) > 1 ? 5 : 0) +
      (/^\p{Lu}/u.test(word[0]) && word.index !== 0 ? 3 : 0);
    return score(b) - score(a) || (a.index ?? 0) - (b.index ?? 0);
  });
  const chosen = candidates[0];
  if (!chosen || chosen.index === undefined) return null;
  return {
    front: `${text.slice(0, chosen.index)}[ … ]${text.slice(chosen.index + chosen[0].length)}`,
    back: text,
  };
}

export function generateCards(notes: readonly MarginNote[], highlights: readonly Highlight[]): Flashcard[] {
  const cards: Flashcard[] = [];
  for (const note of notes) {
    const content = JSON.stringify([note.text, note.quote ?? '']);
    const base = {
      page: note.page,
      y: note.y,
      color: note.color,
      source: 'note' as const,
    };
    const add = (kind: Flashcard['kind'], sides: { front: string; back: string }) =>
      cards.push({ ...base, ...sides, kind, id: `${note.id}:${kind}:${hash(content)}` });
    const question = qa(note.text);
    const masked = cloze(note.text) ?? (note.quote ? cloze(note.quote) : null);
    if (question) add('qa', question);
    if (masked) add('cloze', masked);
    if (!question && !masked && note.quote?.trim() && note.text.trim()) {
      add('explain', {
        front: `Explain in your own words:\n${note.quote.trim()}`,
        back: note.text.trim(),
      });
    }
  }
  for (const highlight of highlights) {
    const text = highlight.text.trim();
    const question = qa(text);
    const masked = cloze(text);
    const automatic = !question && !masked ? automaticCloze(text) : null;
    const base = {
      page: highlight.page,
      y: highlight.rects[0] ? highlight.rects[0].y + highlight.rects[0].h / 2 : 0,
      color: highlight.color,
      source: 'highlight' as const,
    };
    if (question) cards.push({ ...base, ...question, kind: 'qa', id: `${highlight.id}:qa:${hash(text)}` });
    if (masked ?? automatic) {
      cards.push({
        ...base,
        ...(masked ?? automatic)!,
        kind: 'cloze',
        id: `${highlight.id}:cloze:${hash(text)}`,
      });
    }
  }
  return cards.sort((a, b) => a.page - b.page || a.y - b.y || a.id.localeCompare(b.id));
}
