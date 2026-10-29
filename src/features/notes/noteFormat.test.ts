import { describe, expect, it } from 'vitest';
import { type NoteRun, parseNote, plainNoteText, serializeNote } from './noteFormat';

const plain = (text: string): NoteRun => ({ text, bold: false, italic: false });
const bold = (text: string): NoteRun => ({ text, bold: true, italic: false });
const italic = (text: string): NoteRun => ({ text, bold: false, italic: true });
const both = (text: string): NoteRun => ({ text, bold: true, italic: true });

const roundTrip = (runs: NoteRun[]) => parseNote(serializeNote(runs));

describe('parseNote', () => {
  it('reads bold, italic and both, nested either way', () => {
    expect(parseNote('a **bold** and *italic* word')).toEqual([
      plain('a '),
      bold('bold'),
      plain(' and '),
      italic('italic'),
      plain(' word'),
    ]);
    expect(parseNote('***both***')).toEqual([both('both')]);
    expect(parseNote('**bold *both* bold**')).toEqual([bold('bold '), both('both'), bold(' bold')]);
    expect(parseNote('***both** it*')).toEqual([both('both'), italic(' it')]);
    expect(parseNote('')).toEqual([]);
  });

  it('keeps everyday asterisks and asterisks inside words as text, so older notes read as before', () => {
    for (const text of [
      '2 * 3 * 4',
      '5* rating',
      '* list item',
      '** not bold **',
      'Footnote* and another*',
      '***',
      '2*3*4 = 24',
      'p = m*v*t',
      'x**2 + y**2 = r**2',
      'a*b and c*d',
      '**un**believable',
    ]) {
      expect(parseNote(text)).toEqual([plain(text)]);
    }
    expect(parseNote('*Note:* 2*3*4 = 24')).toEqual([italic('Note:'), plain(' 2*3*4 = 24')]);
    expect(parseNote('*m*v*t*')).toEqual([italic('m*v*t')]);
  });

  it('reads emphasis on whole words, also against punctuation', () => {
    expect(parseNote('(*aside*)')).toEqual([plain('('), italic('aside'), plain(')')]);
    expect(parseNote('*word*.')).toEqual([italic('word'), plain('.')]);
    expect(parseNote("**don**'t")).toEqual([bold('don'), plain("'t")]);
    expect(parseNote('**Note:** see')).toEqual([bold('Note:'), plain(' see')]);
  });

  it('leaves unbalanced markers as text, and keeps emphasis within a line', () => {
    expect(parseNote('**open only')).toEqual([plain('**open only')]);
    expect(parseNote('**bold* tail')).toEqual([plain('*'), italic('bold'), plain(' tail')]);
    expect(parseNote('*one\ntwo*')).toEqual([plain('*one\ntwo*')]);
    expect(parseNote('**one**\n\n*two*')).toEqual([bold('one'), plain('\n\n'), italic('two')]);
  });

  it('reads escaped asterisks, and backslashes only before an asterisk', () => {
    expect(parseNote('\\*not italic\\*')).toEqual([plain('*not italic*')]);
    expect(parseNote('C:\\docs\\notes and \\\\server')).toEqual([plain('C:\\docs\\notes and \\\\server')]);
    expect(parseNote('dir\\\\**bold**')).toEqual([plain('dir\\'), bold('bold')]);
    expect(plainNoteText('A **bold** and *italic* \\*idea\\*')).toBe('A bold and italic *idea*');
  });
});

describe('serializeNote', () => {
  it('writes markers around words, closing them at spaces and line breaks', () => {
    expect(
      serializeNote([plain('a '), bold('b'), plain(' and '), italic('c'), plain(' or '), both('d')]),
    ).toBe('a **b** and *c* or ***d***');
    expect(serializeNote([plain('a'), bold(' b '), plain('c')])).toBe('a **b** c');
    expect(serializeNote([bold('one\ntwo')])).toBe('**one**\n**two**');
    expect(serializeNote([plain('Plain, with C:\\paths\\ and\nnew lines')])).toBe(
      'Plain, with C:\\paths\\ and\nnew lines',
    );
  });

  it('keeps literal asterisks as typed unless they could read as markers', () => {
    for (const text of ['2 * 3 = 6*', '5* rating', '* item', '2*3*4 = 24', 'x**2 + y**2 = r**2']) {
      expect(serializeNote([plain(text)])).toBe(text);
    }
    expect(serializeNote([bold('p'), plain(' = '), italic('m*v')])).toBe('**p** = *m*v*');
    expect(serializeNote([plain('a*b and *c*')])).toBe('a*b and \\*c\\*');
    expect(serializeNote([plain('a\\*b')])).toBe('a\\\\\\*b');
    expect(serializeNote([plain('dir\\'), bold('bold')])).toBe('dir\\\\**bold**');
    expect(serializeNote([bold('5*'), plain(' rating')])).toBe('**5\\*** rating');
  });

  it('round-trips nested, overlapping and punctuation-adjacent formatting', () => {
    for (const runs of [
      [bold('one '), both('two'), bold(' three')],
      [both('one'), italic(' two')],
      [italic('ab '), both('cd'), plain(' '), bold('ef')],
      [plain('('), italic('aside'), plain(').')],
      [bold('Note:'), plain(' see')],
      [bold('don'), plain("'t")],
      [bold('*star*')],
    ]) {
      expect(roundTrip(runs)).toEqual(runs);
    }
  });

  it('drops formatting on part of a word, keeping the whole words and the text', () => {
    expect(serializeNote([plain('un'), italic('believ'), plain('able')])).toBe('unbelievable');
    expect(serializeNote([plain('m'), bold('*'), plain('v')])).toBe('m*v');
    expect(roundTrip([bold('hello wor'), plain('ld')])).toEqual([bold('hello'), plain(' world')]);
    expect(roundTrip([bold('ab'), both('cd')])).toEqual([bold('abcd')]);
    // Punctuation that can't carry a marker where it is loses the formatting; its words keep it.
    expect(roundTrip([plain('x'), bold('(y)'), plain('z')])).toEqual([plain('x('), bold('y'), plain(')z')]);
    expect(roundTrip([italic('(aside)'), plain('.')])).toEqual([plain('('), italic('aside'), plain(').')]);
  });

  it('always keeps the text and every word formatted whole, and reads back stably', () => {
    let seed = 7;
    const random = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    const alphabet = ['a', 'é', '7', ' ', '*', '*', '\\', '.', '(', ',', '\n', '😀', '_'];
    const cells = (runs: readonly NoteRun[]) =>
      runs.flatMap((run) => Array.from(run.text, (char) => ({ char, format: `${run.bold}${run.italic}` })));
    for (let n = 0; n < 2000; n++) {
      const runs: NoteRun[] = Array.from({ length: 1 + random() * 6 }, () => ({
        text: Array.from(
          { length: 1 + random() * 4 },
          () => alphabet[Math.floor(random() * alphabet.length)],
        ).join(''),
        bold: random() < 0.5,
        italic: random() < 0.4,
      }));
      const written = serializeNote(runs);
      const read = parseNote(written);
      expect(plainNoteText(written)).toBe(runs.map((run) => run.text).join(''));
      expect(serializeNote(read)).toBe(written);
      // Words: letters and digits, unless an asterisk joins them to the next.
      const before = cells(runs);
      const after = cells(read);
      let start = 0;
      for (let i = 0; i <= before.length; i++) {
        if (/[\p{L}\p{N}]/u.test(before[i]?.char ?? '')) continue;
        const word = before.slice(start, i);
        const joined = before[start - 1]?.char === '*' || before[i]?.char === '*';
        if (word.length > 0 && !joined && word.every((cell) => cell.format === word[0].format)) {
          expect(after.slice(start, i), written).toEqual(word);
        }
        start = i + 1;
      }
    }
  });
});
