import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearDictionaryCache,
  LookupUnavailableError,
  lookUpWord,
  parseEntry,
  termFromSelection,
} from './dictionary';

const link = (word: string) => `<a rel="mw:WikiLink" href="/wiki/${word}" title="${word}">${word}</a>`;

const IMPULSE = {
  en: [
    {
      partOfSpeech: 'Noun',
      language: 'English',
      definitions: [
        { definition: `A ${link('thrust')}; a ${link('push')}.` },
        { definition: '<span class="usage-label-sense"></span> ' },
        { definition: `The ${link('integral')} of force over time.` },
      ],
    },
    { partOfSpeech: 'Verb', language: 'English', definitions: [{ definition: `To ${link('impel')}.` }] },
  ],
  fr: [{ partOfSpeech: 'Noun', language: 'French', definitions: [{ definition: 'impulsion' }] }],
};

describe('termFromSelection', () => {
  it('trims punctuation around a word or short phrase', () => {
    expect(termFromSelection('  “impulse,” ')).toBe('impulse');
    expect(termFromSelection('(null space)')).toBe('null space');
  });

  it('rejects passages, numbers and single characters', () => {
    expect(termFromSelection('one two three four five')).toBeNull();
    expect(termFromSelection('2.3')).toBeNull();
    expect(termFromSelection('x')).toBeNull();
  });
});

describe('parseEntry', () => {
  it('keeps English senses as plain text, by part of speech, with a link to the entry', () => {
    expect(parseEntry('impulse', IMPULSE)).toEqual({
      word: 'impulse',
      parts: [
        {
          partOfSpeech: 'Noun',
          senses: [{ text: 'A thrust; a push.' }, { text: 'The integral of force over time.' }],
        },
        { partOfSpeech: 'Verb', senses: [{ text: 'To impel.' }] },
      ],
      url: 'https://en.wiktionary.org/wiki/impulse#English',
    });
  });

  it('notes the word a form refers to', () => {
    const plural = `<span class="form-of-definition">plural of <span class="form-of-definition-link"><i>${link('vector')}</i></span></span>`;
    const entry = parseEntry('vectors', {
      en: [{ partOfSpeech: 'Noun', definitions: [{ definition: plural }] }],
    });
    expect(entry?.parts[0].senses).toEqual([{ text: 'plural of vector', formOf: 'vector' }]);
  });

  it('falls back to another language, and to nothing', () => {
    expect(parseEntry('impulsion', { fr: IMPULSE.fr })).toMatchObject({
      language: 'French',
      url: 'https://en.wiktionary.org/wiki/impulsion#French',
    });
    expect(
      parseEntry('nothing', { en: [{ partOfSpeech: 'Noun', definitions: [{ definition: ' ' }] }] }),
    ).toBeNull();
  });
});

describe('lookUpWord', () => {
  const fetchMock = vi.fn<typeof fetch>();
  const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });

  beforeEach(() => {
    clearDictionaryCache();
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('asks Wiktionary once per word', async () => {
    fetchMock.mockResolvedValue(json(IMPULSE));
    expect((await lookUpWord('impulse'))?.parts).toHaveLength(2);
    await lookUpWord('impulse');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe(
      'https://en.wiktionary.org/api/rest_v1/page/definition/impulse?redirect=true',
    );
  });

  it('tries lower case when a capitalised word has no English entry', async () => {
    fetchMock.mockImplementation(async (url) =>
      String(url).includes('/Impulse') ? new Response('', { status: 404 }) : json(IMPULSE),
    );
    expect((await lookUpWord('Impulse'))?.word).toBe('impulse');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('returns null for an unknown word and throws when Wiktionary is unreachable', async () => {
    fetchMock.mockResolvedValueOnce(new Response('', { status: 404 }));
    expect(await lookUpWord('qwzx')).toBeNull();
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await expect(lookUpWord('offline')).rejects.toBeInstanceOf(LookupUnavailableError);
    fetchMock.mockResolvedValueOnce(new Response('', { status: 503 }));
    await expect(lookUpWord('busy')).rejects.toBeInstanceOf(LookupUnavailableError);
  });
});
