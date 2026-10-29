import { describe, expect, it } from 'vitest';
import { type NoteRun, parseNote, plainNoteText, serializeNote } from './noteFormat';

const plain = (text: string): NoteRun => ({ text, bold: false, italic: false });
const bold = (text: string): NoteRun => ({ text, bold: true, italic: false });
const italic = (text: string): NoteRun => ({ text, bold: false, italic: true });
const both = (text: string): NoteRun => ({ text, bold: true, italic: true });

const roundTrip = (runs: NoteRun[]) => parseNote(serializeNote(runs));

type Format = Pick<NoteRun, 'bold' | 'italic'>;

describe('parseNote', () => {
  it('reads bold and italic markers', () => {
    expect(parseNote('a **bold** and *italic* word')).toEqual([
      plain('a '),
      bold('bold'),
      plain(' and '),
      italic('italic'),
      plain(' word'),
    ]);
  });

  it('reads bold italic, nested either way', () => {
    expect(parseNote('***both***')).toEqual([both('both')]);
    expect(parseNote('**bold *both* bold**')).toEqual([bold('bold '), both('both'), bold(' bold')]);
    expect(parseNote('*it **both** it*')).toEqual([italic('it '), both('both'), italic(' it')]);
    expect(parseNote('***both** it*')).toEqual([both('both'), italic(' it')]);
  });

  it('keeps everyday asterisks as text', () => {
    for (const text of [
      '2 * 3 * 4',
      'a*b',
      '5* rating',
      '* list item',
      '** not bold **',
      '* not italic *',
      'x ** y',
      'note*',
      '*',
      '**',
      '***',
      'a * b*',
      'Footnote* and another*',
      'rated 4/5 *',
    ]) {
      expect(parseNote(text)).toEqual([plain(text)]);
      expect(plainNoteText(text)).toBe(text);
    }
  });

  it('keeps asterisks inside words as text, so notes written before formatting keep their meaning', () => {
    for (const text of [
      '2*3*4 = 24',
      'p = m*v*t',
      'x**2 + y**2 = r**2',
      'a*b and c*d',
      'a*b*c',
      'x***y***z',
      'un*believ*able',
      '**un**believable',
      'Ω*é*7',
    ]) {
      expect(parseNote(text)).toEqual([plain(text)]);
      expect(plainNoteText(text)).toBe(text);
    }
    expect(parseNote('*Note:* 2*3*4 = 24')).toEqual([italic('Note:'), plain(' 2*3*4 = 24')]);
    expect(parseNote('*m*v*t*')).toEqual([italic('m*v*t')]);
    expect(parseNote('**x**2**')).toEqual([bold('x**2')]);
  });

  it('reads emphasis on whole words, also against punctuation', () => {
    expect(parseNote('*important*')).toEqual([italic('important')]);
    expect(parseNote('**key** term')).toEqual([bold('key'), plain(' term')]);
    expect(parseNote('(*aside*)')).toEqual([plain('('), italic('aside'), plain(')')]);
    expect(parseNote('*word*.')).toEqual([italic('word'), plain('.')]);
    expect(parseNote("**don**'t")).toEqual([bold('don'), plain("'t")]);
    expect(parseNote('**Note:** see *(aside)*.')).toEqual([
      bold('Note:'),
      plain(' see '),
      italic('(aside)'),
      plain('.'),
    ]);
  });

  it('leaves unbalanced markers as text', () => {
    expect(parseNote('**open only')).toEqual([plain('**open only')]);
    expect(parseNote('close only**')).toEqual([plain('close only**')]);
    expect(parseNote('**bold* tail')).toEqual([plain('*'), italic('bold'), plain(' tail')]);
    expect(parseNote('*italic** tail')).toEqual([italic('italic'), plain('* tail')]);
  });

  it('keeps emphasis within a line', () => {
    expect(parseNote('*one\ntwo*')).toEqual([plain('*one\ntwo*')]);
    expect(parseNote('**one**\n\n*two*')).toEqual([bold('one'), plain('\n\n'), italic('two')]);
  });

  it('reads escaped asterisks, and backslashes only before an asterisk', () => {
    expect(parseNote('\\*not italic\\*')).toEqual([plain('*not italic*')]);
    expect(parseNote('2 \\* 3')).toEqual([plain('2 * 3')]);
    expect(parseNote('C:\\docs\\notes and \\\\server')).toEqual([plain('C:\\docs\\notes and \\\\server')]);
    expect(parseNote('dir\\\\**bold**')).toEqual([plain('dir\\'), bold('bold')]);
    expect(parseNote('a\\\\\\*b')).toEqual([plain('a\\*b')]);
  });

  it('returns no runs for empty text and memoises parsed text', () => {
    expect(parseNote('')).toEqual([]);
    expect(parseNote('**same**')).toBe(parseNote('**same**'));
  });
});

describe('plainNoteText', () => {
  it('drops markers and escapes', () => {
    expect(plainNoteText('A **bold** and *italic* \\*idea\\*')).toBe('A bold and italic *idea*');
    expect(plainNoteText('Plain text')).toBe('Plain text');
  });
});

describe('serializeNote', () => {
  it('writes markers for bold, italic and both', () => {
    expect(
      serializeNote([plain('a '), bold('b'), plain(' and '), italic('c'), plain(' or '), both('d')]),
    ).toBe('a **b** and *c* or ***d***');
  });

  it('writes plain text as is', () => {
    expect(serializeNote([plain('Plain, with C:\\paths\\ and\nnew lines')])).toBe(
      'Plain, with C:\\paths\\ and\nnew lines',
    );
    expect(serializeNote([])).toBe('');
  });

  it('keeps literal asterisks as typed unless they could read as markers', () => {
    for (const text of [
      '2 * 3 = 6*',
      '5* rating',
      'a*b',
      '* item',
      'C:\\docs\\notes',
      '2*3*4 = 24',
      'p = m*v*t',
      'x**2 + y**2 = r**2',
      'a*b and c*d',
    ]) {
      expect(serializeNote([plain(text)])).toBe(text);
    }
    expect(serializeNote([bold('p'), plain(' = '), italic('m*v')])).toBe('**p** = *m*v*');
  });

  it('escapes literal asterisks that could read as markers, and backslashes before them', () => {
    expect(serializeNote([plain('a*b and *c*')])).toBe('a*b and \\*c\\*');
    expect(serializeNote([plain('*not italic*')])).toBe('\\*not italic\\*');
    expect(serializeNote([plain('a\\*b')])).toBe('a\\\\\\*b');
    expect(serializeNote([plain('dir\\'), bold('bold')])).toBe('dir\\\\**bold**');
    expect(serializeNote([bold('a\\')])).toBe('**a\\\\**');
    expect(serializeNote([bold('*star*')])).toBe('**\\*star\\***');
    expect(serializeNote([bold('5*'), plain(' rating')])).toBe('**5\\*** rating');
    for (const runs of [
      [plain('a*b and *c*')],
      [bold('*star*')],
      [bold('5*'), plain(' rating')],
      [plain('a\\*b')],
    ]) {
      expect(roundTrip(runs)).toEqual(runs);
    }
  });

  it('moves spaces at the edges of emphasis outside its markers', () => {
    expect(serializeNote([plain('a'), bold(' b '), plain('c')])).toBe('a **b** c');
    expect(serializeNote([italic('  ')])).toBe('  ');
    expect(serializeNote([bold('one '), plain('two')])).toBe('**one** two');
  });

  it('closes emphasis at line breaks and reopens it on the next line', () => {
    expect(serializeNote([bold('one\ntwo')])).toBe('**one**\n**two**');
    expect(serializeNote([italic('end\n')])).toBe('*end*\n');
  });

  it('round-trips nested and overlapping formatting', () => {
    const cases: NoteRun[][] = [
      [bold('one '), both('two'), bold(' three')],
      [italic('one '), both('two')],
      [both('one'), bold(' two')],
      [bold('Note:'), plain(' see '), italic('(aside)'), plain('.')],
      [plain('('), bold('a'), plain(', '), italic('b'), plain(')')],
      [bold('don'), plain("'t")],
      [italic('m*v*t'), plain(' and 2*3')],
    ];
    for (const runs of cases) expect(roundTrip(runs)).toEqual(runs);
    // Formatting on a space between words is invisible; it follows the words around it.
    expect(roundTrip([italic('ab '), both('cd'), bold(' ef')])).toEqual([
      italic('ab '),
      both('cd'),
      plain(' '),
      bold('ef'),
    ]);
    expect(roundTrip([bold('a'), plain(' '), bold('b')])).toEqual([bold('a b')]);
  });

  it('drops formatting on part of a word, and always keeps the text', () => {
    expect(serializeNote([plain('un'), italic('believ'), plain('able')])).toBe('unbelievable');
    expect(roundTrip([bold('un'), plain('believable')])).toEqual([plain('unbelievable')]);
    expect(roundTrip([plain('x'), both('y'), plain('z')])).toEqual([plain('xyz')]);
    // Formatting that covers whole words as well keeps them.
    expect(roundTrip([bold('hello wor'), plain('ld')])).toEqual([bold('hello'), plain(' world')]);
    expect(roundTrip([plain('hel'), italic('lo big wor'), plain('ld')])).toEqual([
      plain('hello '),
      italic('big'),
      plain(' world'),
    ]);
    // Formats that overlap inside a word cannot both be written.
    expect(roundTrip([bold('ab'), both('cd')])).toEqual([bold('abcd')]);
    expect(roundTrip([bold('ab'), both('cd'), italic('ef')])).toEqual([plain('abcdef')]);
  });

  it('narrows emphasis crowded by punctuation to its words', () => {
    expect(roundTrip([plain('a'), italic('.b'), plain(' c')])).toEqual([
      plain('a.'),
      italic('b'),
      plain(' c'),
    ]);
    expect(roundTrip([plain('x'), bold('(y)'), plain('z')])).toEqual([plain('x('), bold('y'), plain(')z')]);
    expect(roundTrip([plain('x'), bold('!'), plain('z')])).toEqual([plain('x!z')]);
  });

  // A small deterministic generator (mulberry32).
  const generator = (seed: number) => () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const charFlags = (runs: readonly NoteRun[]) =>
    runs.flatMap((run) => Array.from(run.text, (char) => ({ char, bold: run.bold, italic: run.italic })));
  /** Letters in words formatted as a whole (`total`), and how many of them keep that formatting. */
  const wholeWords = (before: readonly NoteRun[], after: readonly NoteRun[]) => {
    const a = charFlags(before);
    const b = charFlags(after);
    const same = (x: Format, y: Format) => x.bold === y.bold && x.italic === y.italic;
    let kept = 0;
    let total = 0;
    let start = 0;
    while (start < a.length) {
      let end = start;
      while (end < a.length && /[\p{L}\p{N}]/u.test(a[end].char)) end++;
      const word = a.slice(start, end);
      if (word.every((c) => same(c, word[0]))) {
        total += word.length;
        kept += word.filter((c, i) => same(c, b[start + i])).length;
      }
      start = Math.max(end, start + 1);
    }
    return { kept, total };
  };

  it('keeps the formatting of every word formatted whole', () => {
    const random = generator(11);
    const pick = <T>(items: readonly T[]) => items[Math.floor(random() * items.length)];
    for (let n = 0; n < 1000; n++) {
      const runs: NoteRun[] = [];
      for (let w = 0; w < 1 + random() * 6; w++) {
        if (w > 0) runs.push(plain(pick([' ', ' ', '\n', ', ', ' (', ') ', '. ', ' — ', ': "'])));
        const word = Array.from({ length: 1 + random() * 6 }, () => pick(['a', 'z', 'é', 'Ω', '7'])).join('');
        runs.push({ text: word, bold: random() < 0.5, italic: random() < 0.4 });
      }
      const written = serializeNote(runs);
      const read = parseNote(written);
      expect(plainNoteText(written)).toBe(runs.map((run) => run.text).join(''));
      const { kept, total } = wholeWords(runs, read);
      expect({ written, kept }).toEqual({ written, kept: total });
      expect(serializeNote(read)).toBe(written);
    }
  }, 20_000);

  it('always keeps the text, and reads back stably, whatever is formatted', () => {
    const random = generator(7);
    const pick = <T>(items: readonly T[]) => items[Math.floor(random() * items.length)];
    const alphabet = ['a', 'b', ' ', '*', '*', '\\', '.', '(', ')', ',', '\n', '😀', '\t', '_'];
    let kept = 0;
    let total = 0;
    for (let n = 0; n < 1000; n++) {
      const runs: NoteRun[] = Array.from({ length: 1 + Math.floor(random() * 5) }, () => ({
        text: Array.from({ length: 1 + Math.floor(random() * 4) }, () => pick(alphabet)).join(''),
        bold: random() < 0.5,
        italic: random() < 0.4,
      }));
      const written = serializeNote(runs);
      const read = parseNote(written);
      expect(plainNoteText(written)).toBe(runs.map((run) => run.text).join(''));
      expect(serializeNote(read)).toBe(written);
      const words = wholeWords(runs, read);
      kept += words.kept;
      total += words.total;
    }
    // Formatting on part of a word is dropped, but every word formatted whole keeps its formatting.
    expect(kept).toBe(total);
  }, 20_000);
});
