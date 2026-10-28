import { describe, expect, it } from 'vitest';
import type { Block, Inline } from './ast';
import { parseInline, safeHref } from './inline';
import { hasMath, parseMarkdown } from './markdown';

const text = (value: string): Inline => ({ type: 'text', value });
const math = (value: string, display = false): Inline => ({ type: 'math', value, display });

describe('parseInline: emphasis', () => {
  it('parses bold, italic and strike', () => {
    expect(parseInline('a **b** *c* _d_ ~~e~~')).toEqual([
      text('a '),
      { type: 'strong', children: [text('b')] },
      text(' '),
      { type: 'em', children: [text('c')] },
      text(' '),
      { type: 'em', children: [text('d')] },
      text(' '),
      { type: 'del', children: [text('e')] },
    ]);
  });

  it('nests emphasis and combines bold italic', () => {
    expect(parseInline('**a *b* c**')).toEqual([
      { type: 'strong', children: [text('a '), { type: 'em', children: [text('b')] }, text(' c')] },
    ]);
    expect(parseInline('***x***')).toEqual([
      { type: 'em', children: [{ type: 'strong', children: [text('x')] }] },
    ]);
  });

  it('leaves unmatched delimiters, spaced asterisks and snake_case alone', () => {
    expect(parseInline('2 * 3 * 4')).toEqual([text('2 * 3 * 4')]);
    expect(parseInline('snake_case_name')).toEqual([text('snake_case_name')]);
    expect(parseInline('**oops')).toEqual([text('**oops')]);
    expect(parseInline('a ~ b ~~ c')).toEqual([text('a ~ b ~~ c')]);
  });

  it('formats inside bold maths and code without touching their source', () => {
    expect(parseInline('**$a*b*c$**')).toEqual([{ type: 'strong', children: [math('a*b*c')] }]);
    expect(parseInline('`*x*`')).toEqual([{ type: 'code', value: '*x*' }]);
  });

  it('turns single newlines into line breaks and trims the spaces around them', () => {
    expect(parseInline('a  \n  b')).toEqual([text('a'), { type: 'br' }, text('b')]);
  });
});

describe('parseInline: code and escapes', () => {
  it('parses code spans, including double-backtick spans', () => {
    expect(parseInline('use `x` and ``a`b``')).toEqual([
      text('use '),
      { type: 'code', value: 'x' },
      text(' and '),
      { type: 'code', value: 'a`b' },
    ]);
  });

  it('keeps an unmatched backtick literal', () => {
    expect(parseInline('a ` b')).toEqual([text('a ` b')]);
  });

  it('lets a backslash escape markup characters', () => {
    expect(parseInline('\\*not italic\\* and \\$5')).toEqual([text('*not italic* and $5')]);
    expect(parseInline('C:\\Users')).toEqual([text('C:\\Users')]);
  });
});

describe('parseInline: maths', () => {
  it('parses $…$ and \\(…\\) as inline maths', () => {
    expect(parseInline('so $F = ma$ and \\(a = F/m\\).')).toEqual([
      text('so '),
      math('F = ma'),
      text(' and '),
      math('a = F/m'),
      text('.'),
    ]);
  });

  it('parses $$…$$ and \\[…\\] as display maths', () => {
    expect(parseInline('$$x^2$$ or \\[y\\]')).toEqual([math('x^2', true), text(' or '), math('y', true)]);
  });

  it('does not treat prices as maths (Pandoc rules)', () => {
    expect(parseInline('Costs $5 and $10')).toEqual([text('Costs $5 and $10')]);
    expect(parseInline('$20,000 for $x')).toEqual([text('$20,000 for $x')]);
    expect(parseInline('between $ 5 $ and')).toEqual([text('between $ 5 $ and')]);
  });

  it('allows maths right after a price and ignores a digit after the closing dollar', () => {
    expect(parseInline('costs $5 and $x$')).toEqual([text('costs $5 and '), math('x')]);
    expect(parseInline('$x$5')).toEqual([text('$x$5')]);
  });

  it('keeps escaped dollars out of maths, and inside it', () => {
    expect(parseInline('\\$a$ and $b$')).toEqual([text('$a$ and '), math('b')]);
    expect(parseInline('\\$5 or \\$6')).toEqual([text('$5 or $6')]);
    expect(parseInline('$a \\$ b$')).toEqual([math('a \\$ b')]);
  });

  it('keeps an unmatched dollar or delimiter literal', () => {
    expect(parseInline('a $b')).toEqual([text('a $b')]);
    expect(parseInline('a $$ b')).toEqual([text('a $$ b')]);
    expect(parseInline('a \\(b')).toEqual([text('a \\(b')]);
  });
});

describe('parseInline: links', () => {
  it('parses Markdown links and bare URLs with safe schemes', () => {
    expect(parseInline('see [wiki](https://en.wikipedia.org/wiki/Mass_(physics)) now')).toEqual([
      text('see '),
      { type: 'link', href: 'https://en.wikipedia.org/wiki/Mass_(physics)', children: [text('wiki')] },
      text(' now'),
    ]);
    expect(parseInline('[mail](mailto:a@b.co)')).toEqual([
      { type: 'link', href: 'mailto:a@b.co', children: [text('mail')] },
    ]);
    expect(parseInline('go to https://example.com/a_b_c.')).toEqual([
      text('go to '),
      { type: 'link', href: 'https://example.com/a_b_c', children: [text('https://example.com/a_b_c')] },
      text('.'),
    ]);
  });

  it('formats link labels', () => {
    expect(parseInline('[**hi**](http://x.org)')).toEqual([
      { type: 'link', href: 'http://x.org/', children: [{ type: 'strong', children: [text('hi')] }] },
    ]);
  });

  it('does not link unsafe or relative targets', () => {
    expect(parseInline('[x](javascript:alert(1))')).toEqual([text('[x](javascript:alert(1))')]);
    expect(parseInline('[x](data:text/html,hi)')).toEqual([text('[x](data:text/html,hi)')]);
    expect(parseInline('[x](/relative)')).toEqual([text('[x](/relative)')]);
    expect(parseInline('[x](java\nscript:alert(1))')).not.toContainEqual(
      expect.objectContaining({ type: 'link' }),
    );
  });

  it('does not nest links or link inside words', () => {
    const [link] = parseInline('[see https://a.com](https://b.com)');
    expect(link).toEqual({ type: 'link', href: 'https://b.com/', children: [text('see https://a.com')] });
    expect(parseInline('xhttps://a.com')).toEqual([text('xhttps://a.com')]);
  });

  it('keeps trailing punctuation and unbalanced parentheses out of bare URLs', () => {
    expect(parseInline('(https://a.com/x)')).toEqual([
      text('('),
      { type: 'link', href: 'https://a.com/x', children: [text('https://a.com/x')] },
      text(')'),
    ]);
  });
});

describe('safeHref', () => {
  it('accepts http, https and mailto only', () => {
    expect(safeHref('https://a.com')).toBe('https://a.com/');
    expect(safeHref('HTTP://a.com/x')).toBe('http://a.com/x');
    expect(safeHref('mailto:a@b.co')).toBe('mailto:a@b.co');
    for (const bad of [
      'javascript:alert(1)',
      'data:text/html,x',
      'ftp://a.com',
      'file:///x',
      '//a.com',
      'a.com',
      '',
    ]) {
      expect(safeHref(bad)).toBeNull();
    }
  });
});

describe('parseMarkdown: blocks', () => {
  it('splits paragraphs on blank lines and keeps single line breaks', () => {
    expect(parseMarkdown('a\nb\n\n\nc')).toEqual([
      { type: 'paragraph', children: [text('a'), { type: 'br' }, text('b')] },
      { type: 'paragraph', children: [text('c')] },
    ]);
  });

  it('returns nothing for blank text', () => {
    expect(parseMarkdown('')).toEqual([]);
    expect(parseMarkdown('  \n \n')).toEqual([]);
  });

  it('parses display maths on its own lines, on one line or several', () => {
    expect(parseMarkdown('Work–energy:\n$$W = \\int F\\,dx$$')).toEqual([
      { type: 'paragraph', children: [text('Work–energy:')] },
      { type: 'math', value: 'W = \\int F\\,dx' },
    ]);
    expect(parseMarkdown('$$\na = b\n$$\nafter')).toEqual([
      { type: 'math', value: 'a = b' },
      { type: 'paragraph', children: [text('after')] },
    ]);
    expect(parseMarkdown('\\[x\\]')).toEqual([{ type: 'math', value: 'x' }]);
  });

  it('leaves unclosed display maths as text and does not swallow later paragraphs', () => {
    expect(parseMarkdown('$$a\n\nnext')).toEqual([
      { type: 'paragraph', children: [text('$$a')] },
      { type: 'paragraph', children: [text('next')] },
    ]);
  });

  it('parses bullet lists with any of - * +', () => {
    expect(parseMarkdown('- inertia\n* *mass* vs weight\n+ see [wiki](https://w.org)')).toEqual([
      {
        type: 'list',
        ordered: false,
        start: 1,
        items: [
          [{ type: 'paragraph', children: [text('inertia')] }],
          [{ type: 'paragraph', children: [{ type: 'em', children: [text('mass')] }, text(' vs weight')] }],
          [
            {
              type: 'paragraph',
              children: [text('see '), { type: 'link', href: 'https://w.org/', children: [text('wiki')] }],
            },
          ],
        ],
      },
    ]);
  });

  it('parses numbered lists with their start, and lets a list starting at 1 interrupt a paragraph', () => {
    expect(parseMarkdown('3. a\n4. b')).toEqual([
      {
        type: 'list',
        ordered: true,
        start: 3,
        items: [
          [{ type: 'paragraph', children: [text('a')] }],
          [{ type: 'paragraph', children: [text('b')] }],
        ],
      },
    ]);
    expect(parseMarkdown('Steps:\n1. a')).toEqual([
      { type: 'paragraph', children: [text('Steps:')] },
      { type: 'list', ordered: true, start: 1, items: [[{ type: 'paragraph', children: [text('a')] }]] },
    ]);
    expect(parseMarkdown('text\n2. not a list')).toEqual([
      { type: 'paragraph', children: [text('text'), { type: 'br' }, text('2. not a list')] },
    ]);
  });

  it('parses a nested list and item continuation lines', () => {
    const [list] = parseMarkdown('- a\n  more\n  - b\n- c') as Extract<Block, { type: 'list' }>[];
    expect(list.items).toHaveLength(2);
    expect(list.items[0]).toEqual([
      { type: 'paragraph', children: [text('a'), { type: 'br' }, text('more')] },
      {
        type: 'list',
        ordered: false,
        start: 1,
        items: [[{ type: 'paragraph', children: [text('b')] }]],
      },
    ]);
  });

  it('parses quotes', () => {
    expect(parseMarkdown('> quoted *text*\n> more')).toEqual([
      {
        type: 'quote',
        children: [
          {
            type: 'paragraph',
            children: [
              text('quoted '),
              { type: 'em', children: [text('text')] },
              { type: 'br' },
              text('more'),
            ],
          },
        ],
      },
    ]);
  });

  it('does not mistake italics or prices for a list', () => {
    expect(parseMarkdown('*italic* text')).toEqual([
      { type: 'paragraph', children: [{ type: 'em', children: [text('italic')] }, text(' text')] },
    ]);
    expect(parseMarkdown('-5 degrees')).toEqual([{ type: 'paragraph', children: [text('-5 degrees')] }]);
  });

  it('handles CRLF and stops nesting at a safe depth', () => {
    expect(parseMarkdown('a\r\nb')).toEqual(parseMarkdown('a\nb'));
    const deep = '> > > > > > deep';
    expect(() => parseMarkdown(deep)).not.toThrow();
  });
});

describe('hasMath', () => {
  it('finds maths anywhere and ignores price-like text', () => {
    expect(hasMath(parseMarkdown('so $x$'))).toBe(true);
    expect(hasMath(parseMarkdown('- **$x$**'))).toBe(true);
    expect(hasMath(parseMarkdown('> $$y$$'))).toBe(true);
    expect(hasMath(parseMarkdown('Costs $5 and $10'))).toBe(false);
    expect(hasMath(parseMarkdown('plain'))).toBe(false);
  });
});
