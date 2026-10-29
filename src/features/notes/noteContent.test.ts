import { describe, expect, it } from 'vitest';
import { noteContent, readNoteContent } from './noteContent';

function field(html = ''): HTMLDivElement {
  const element = document.createElement('div');
  element.innerHTML = html;
  return element;
}

function built(text: string): HTMLDivElement {
  const element = field();
  element.append(noteContent(text));
  return element;
}

describe('noteContent', () => {
  it('builds bold and italic as <b> and <i>, ending with a placeholder <br>', () => {
    expect(built('A **bold** and *italic* ***both***\nnext').innerHTML).toBe(
      'A <b>bold</b> and <i>italic</i> <b><i>both</i></b>\nnext<br>',
    );
    expect(built('').innerHTML).toBe('<br>');
  });

  it('never treats note text as markup', () => {
    const element = built('<img src=x onerror=alert(1)> **<b>**');
    expect(element.querySelector('img')).toBeNull();
    expect(element.textContent).toBe('<img src=x onerror=alert(1)> <b>');
  });
});

describe('readNoteContent', () => {
  it('reads back what was built', () => {
    for (const text of [
      '',
      'A **bold** and *italic* or ***both***',
      '**bold *both* bold**',
      'Line one\n\nline *three*',
      'Ends with a break\n',
      '2*3*4 = 24 and 5* rating',
      'a \\*b\\* c',
    ]) {
      expect(readNoteContent(built(text))).toBe(text);
    }
  });

  it('reads what the browser writes while editing', () => {
    // Bold toggled on and off within words: whole words keep it; on part of a word it can't be written.
    expect(readNoteContent(field('<b>hello</b> w<b>or</b>ld <b>a</b><b>gain</b><br>'))).toBe(
      '**hello** world **again**',
    );
    expect(readNoteContent(field('<strong>a <em>b</em></strong> c'))).toBe('**a *b*** c');
    expect(
      readNoteContent(
        field('<span style="font-weight: 700">a</span> <span style="font-style: italic">b</span>'),
      ),
    ).toBe('**a** *b*');
    expect(readNoteContent(field('<b>a <span style="font-weight: normal">b</span></b>'))).toBe('**a** b');
    expect(readNoteContent(field('*not italic*'))).toBe('\\*not italic\\*');
  });

  it('reads <br>s and blocks as line breaks, without the placeholder', () => {
    expect(readNoteContent(field('abc\n<br>'))).toBe('abc\n');
    expect(readNoteContent(field('abc<br>def<br>'))).toBe('abc\ndef');
    expect(readNoteContent(field('<br>'))).toBe('');
    expect(readNoteContent(field('abc<div>def</div>'))).toBe('abc\ndef');
    expect(readNoteContent(field('<div>abc</div><div><br></div>'))).toBe('abc\n');
    expect(readNoteContent(field('<p>one</p><p><b>two</b></p>three'))).toBe('one\n**two**\nthree');
  });
});
