import { describe, expect, it } from 'vitest';
import { buildSnippet, createMatcher, findMatches } from './matcher';
import { makePage } from './testPages';

const page = (...lines: string[]) => makePage(1, ...lines);

function find(text: ReturnType<typeof page>, query: string) {
  const matcher = createMatcher(query)!;
  return findMatches(text, matcher).map(({ start, end }) => text.text.slice(start, end));
}

describe('createMatcher', () => {
  it('ignores empty queries and tidies the rest', () => {
    expect(createMatcher('   ')).toBeNull();
    expect(createMatcher('  kinetic \t energy ')?.query).toBe('kinetic energy');
  });
});

describe('findMatches', () => {
  const text = page('Inertia and inertial frames.', 'The INERTIA of a body; Inertia again.');

  it('ignores case', () => {
    expect(find(text, 'inertia')).toEqual(['Inertia', 'inertia', 'INERTIA', 'Inertia']);
  });

  it('finds phrases across a line break', () => {
    expect(find(text, 'frames. the')).toEqual(['frames. The']);
  });

  it('ignores diacritics in the text and in the query', () => {
    const accented = page('Schrödinger’s cat, the café and the Ångström unit.');
    expect(find(accented, 'schrodinger')).toEqual(['Schrödinger']);
    expect(find(accented, 'Schrödinger')).toEqual(['Schrödinger']);
    expect(find(accented, 'cafe')).toEqual(['café']);
    expect(find(accented, 'angstrom')).toEqual(['Ångström']);
    expect(find(accented, "schrodinger's")).toEqual(['Schrödinger’s']);
  });

  it('returns non-overlapping matches and honours the limit', () => {
    const repeated = page('aaaa aa');
    expect(find(repeated, 'aa')).toHaveLength(3);
    const matcher = createMatcher('aa')!;
    expect(findMatches(repeated, matcher, 2)).toHaveLength(2);
  });

  it('reports offsets into the readable text', () => {
    const [match] = findMatches(text, createMatcher('frames')!);
    expect(text.text.slice(match.start, match.end)).toBe('frames');
    expect(text.text.slice(match.start - 9, match.start)).toBe('inertial ');
  });
});

describe('buildSnippet', () => {
  const sentence =
    'Newton’s first law states that an object at rest stays at rest unless acted on by a net external force, and an object in motion continues in a straight line.';

  it('keeps the match with context on both sides, trimmed to whole words', () => {
    const start = sentence.indexOf('net external');
    const snippet = buildSnippet(sentence, start, start + 'net external'.length);
    expect(snippet.match).toBe('net external');
    expect(snippet.before.startsWith('…')).toBe(true);
    expect(snippet.after.endsWith('…')).toBe(true);
    expect(snippet.before.length).toBeLessThanOrEqual(42);
    expect(snippet.after.length).toBeLessThanOrEqual(42);
    expect(snippet.before).not.toMatch(/^…\S*[a-z]\S* ?$/);
    expect(`${snippet.before}${snippet.match}${snippet.after}`).toContain(
      ' acted on by a net external force, ',
    );
  });

  it('adds no ellipsis when the text is short', () => {
    const snippet = buildSnippet('Short line here.', 6, 10);
    expect(snippet).toEqual({ before: 'Short ', match: 'line', after: ' here.' });
  });

  it('starts the snippet at the beginning of the text when the match is near it', () => {
    const snippet = buildSnippet(sentence, 0, 6);
    expect(snippet.before).toBe('');
    expect(snippet.match).toBe('Newton');
  });
});
