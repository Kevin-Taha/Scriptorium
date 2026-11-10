/**
 * Dictionary lookups from Wiktionary (Wikimedia's REST API). The selected word is the only thing
 * sent; results are kept in memory so looking a word up again doesn't ask twice.
 */

const API = 'https://en.wiktionary.org/api/rest_v1/page/definition/';
const PAGE = 'https://en.wiktionary.org/wiki/';
/** Longest selection treated as a word or phrase to look up, in words and characters. */
const MAX_WORDS = 4;
const MAX_LENGTH = 50;
/** Parts of speech and senses shown per part of speech: a glance, not the whole entry. */
const MAX_PARTS = 3;
const MAX_SENSES = 3;
const CACHE_SIZE = 50;

export interface Sense {
  text: string;
  /** For "plural of vector" and the like: the word it is a form of. */
  formOf?: string;
}

export interface PartOfSpeech {
  partOfSpeech: string;
  senses: Sense[];
}

export interface DictionaryEntry {
  word: string;
  /** Set when the entries are for another language (no English entry exists). */
  language?: string;
  parts: PartOfSpeech[];
  /** The full entry on Wiktionary. */
  url: string;
}

/** Thrown when Wiktionary can't be reached (offline, blocked); `null` results mean "no entry". */
export class LookupUnavailableError extends Error {}

const EDGE_PUNCTUATION = /^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu;

/** The word or short phrase to look up for selected text, or null when the selection is a passage. */
export function termFromSelection(raw: string): string | null {
  const text = raw.replace(/\s+/g, ' ').trim().replace(EDGE_PUNCTUATION, '');
  if (text.length < 2 || text.length > MAX_LENGTH || !/\p{L}/u.test(text)) return null;
  return text.split(' ').length > MAX_WORDS ? null : text;
}

interface RawDefinition {
  definition?: string;
}
interface RawUsage {
  partOfSpeech?: string;
  language?: string;
  definitions?: RawDefinition[];
}
type RawResponse = Record<string, RawUsage[] | undefined>;

/** Plain text of a definition's HTML, and the base word when it is a "form of" another. */
function readSense(html: string): Sense | null {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const text = (doc.body.textContent ?? '').replace(/\s+/g, ' ').trim();
  if (!text) return null;
  const formOf = doc.querySelector('.form-of-definition-link')?.textContent?.trim();
  return formOf ? { text, formOf } : { text };
}

/** The entry shown for a response: its English senses, or another language's when there are none. */
export function parseEntry(word: string, response: RawResponse): DictionaryEntry | null {
  const language = response.en ? 'en' : Object.keys(response)[0];
  const usages = (language && response[language]) || [];
  const parts: PartOfSpeech[] = [];
  for (const usage of usages) {
    const senses = (usage.definitions ?? [])
      .map((definition) => readSense(definition.definition ?? ''))
      .filter((sense): sense is Sense => sense !== null)
      .slice(0, MAX_SENSES);
    if (senses.length > 0) parts.push({ partOfSpeech: usage.partOfSpeech ?? '', senses });
    if (parts.length === MAX_PARTS) break;
  }
  if (parts.length === 0) return null;
  const otherLanguage = language === 'en' ? undefined : usages[0]?.language;
  const anchor = otherLanguage ?? 'English';
  return {
    word,
    ...(otherLanguage ? { language: otherLanguage } : {}),
    parts,
    url: `${PAGE}${encodeURIComponent(word.replace(/ /g, '_'))}#${encodeURIComponent(anchor.replace(/ /g, '_'))}`,
  };
}

const cache = new Map<string, DictionaryEntry | null>();

async function fetchEntry(word: string, signal?: AbortSignal): Promise<DictionaryEntry | null> {
  if (cache.has(word)) return cache.get(word)!;
  let response: Response;
  try {
    response = await fetch(`${API}${encodeURIComponent(word.replace(/ /g, '_'))}?redirect=true`, {
      signal,
      headers: { Accept: 'application/json' },
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new LookupUnavailableError('Wiktionary could not be reached');
  }
  if (response.status === 404) return remember(word, null);
  if (!response.ok) throw new LookupUnavailableError(`Wiktionary answered ${response.status}`);
  return remember(word, parseEntry(word, (await response.json()) as RawResponse));
}

function remember(key: string, entry: DictionaryEntry | null): DictionaryEntry | null {
  cache.delete(key);
  cache.set(key, entry);
  for (const oldKey of cache.keys()) {
    if (cache.size <= CACHE_SIZE) break;
    cache.delete(oldKey);
  }
  return entry;
}

/**
 * Looks a word up as selected, then in lower case ("Impulse" at the start of a
 * sentence), preferring an English entry. Null when Wiktionary has none.
 */
export async function lookUpWord(word: string, signal?: AbortSignal): Promise<DictionaryEntry | null> {
  const lower = word.toLowerCase();
  const exact = await fetchEntry(word, signal);
  if (lower === word || (exact && !exact.language)) return exact;
  return (await fetchEntry(lower, signal)) ?? exact;
}

/** Forgets cached lookups (tests). */
export function clearDictionaryCache(): void {
  cache.clear();
}
