import { type NoteRun, parseNote, serializeNote } from './noteFormat';

const BLOCKS = new Set([
  'DIV',
  'P',
  'LI',
  'UL',
  'OL',
  'BLOCKQUOTE',
  'H1',
  'H2',
  'H3',
  'H4',
  'H5',
  'H6',
  'PRE',
]);

/**
 * The editor's content for note text: text in `<b>`/`<i>` (what the browser's own bold
 * and italic commands produce), then the `<br>` browsers use to give an empty last line
 * its height. Built from nodes, never from markup.
 */
export function noteContent(doc: Document, text: string): DocumentFragment {
  const fragment = doc.createDocumentFragment();
  for (const run of parseNote(text)) {
    let node: Node = doc.createTextNode(run.text);
    for (const [on, tag] of [
      [run.italic, 'i'],
      [run.bold, 'b'],
    ] as const) {
      if (!on) continue;
      const wrapper = doc.createElement(tag);
      wrapper.append(node);
      node = wrapper;
    }
    fragment.append(node);
  }
  fragment.append(doc.createElement('br'));
  return fragment;
}

function isBold(element: HTMLElement, inherited: boolean): boolean {
  const weight = element.style.fontWeight;
  if (weight) return weight === 'bold' || weight === 'bolder' || Number(weight) >= 600;
  return inherited || element.tagName === 'B' || element.tagName === 'STRONG';
}

function isItalic(element: HTMLElement, inherited: boolean): boolean {
  const style = element.style.fontStyle;
  if (style) return style !== 'normal';
  return inherited || element.tagName === 'I' || element.tagName === 'EM';
}

/**
 * Reads the editor's content back as note text. Bold and italic come from tags or inline
 * styles (browsers use either); `<br>`s and blocks are line breaks; anything else is text.
 */
export function readNoteContent(root: HTMLElement): string {
  const runs: NoteRun[] = [];
  let ended = true;
  let breakPending = false;
  const push = (text: string, bold: boolean, italic: boolean) => {
    const last = runs.at(-1);
    if (last && last.bold === bold && last.italic === italic) last.text += text;
    else runs.push({ text, bold, italic });
    ended = text.endsWith('\n');
  };
  const append = (text: string, bold: boolean, italic: boolean) => {
    if (breakPending && !ended) push('\n', false, false);
    breakPending = false;
    push(text, bold, italic);
  };
  const walk = (parent: Node, bold: boolean, italic: boolean) => {
    for (const node of parent.childNodes) {
      if (node.nodeType === Node.TEXT_NODE) {
        const text = (node as Text).data;
        if (text) append(text, bold, italic);
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        const element = node as HTMLElement;
        if (element.tagName === 'BR') {
          append('\n', false, false);
          continue;
        }
        const block = BLOCKS.has(element.tagName);
        if (block && !ended) breakPending = true;
        walk(element, isBold(element, bold), isItalic(element, italic));
        if (block) breakPending = true;
      }
    }
  };
  walk(root, false, false);
  // A final line break draws no line of its own; the browser keeps one as a placeholder.
  const last = runs.at(-1);
  if (last?.text.endsWith('\n')) last.text = last.text.slice(0, -1);
  return serializeNote(runs);
}
