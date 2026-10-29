import { type NoteRun, parseNote, serializeNote } from './noteFormat';

/**
 * The editor's content for note text: text in `<b>`/`<i>` (what the browser's own bold and
 * italic commands produce), then the `<br>` browsers use to give an empty last line its
 * height. Built from nodes, never from markup.
 */
export function noteContent(text: string): DocumentFragment {
  const fragment = document.createDocumentFragment();
  const wrap = (node: Node, tag: string) => {
    const element = document.createElement(tag);
    element.append(node);
    return element;
  };
  for (const run of parseNote(text)) {
    let node: Node = document.createTextNode(run.text);
    if (run.italic) node = wrap(node, 'i');
    if (run.bold) node = wrap(node, 'b');
    fragment.append(node);
  }
  fragment.append(document.createElement('br'));
  return fragment;
}

function isBold(element: HTMLElement, inherited: boolean): boolean {
  const weight = element.style.fontWeight;
  if (weight) return weight.startsWith('bold') || Number(weight) >= 600;
  return inherited || element.tagName === 'B' || element.tagName === 'STRONG';
}

function isItalic(element: HTMLElement, inherited: boolean): boolean {
  const style = element.style.fontStyle;
  if (style) return style !== 'normal';
  return inherited || element.tagName === 'I' || element.tagName === 'EM';
}

/**
 * Reads the editor's content back as note text. Bold and italic come from tags or inline
 * styles (browsers use either); `<br>`s and the `<div>`s or `<p>`s browsers may wrap lines
 * in are line breaks.
 */
export function readNoteContent(root: HTMLElement): string {
  const runs: NoteRun[] = [];
  let breakPending = false;
  const add = (text: string, bold: boolean, italic: boolean) => {
    if (breakPending && runs.length > 0 && !runs[runs.length - 1].text.endsWith('\n')) {
      runs.push({ text: '\n', bold: false, italic: false });
    }
    breakPending = false;
    runs.push({ text, bold, italic });
  };
  const walk = (parent: Node, bold: boolean, italic: boolean) => {
    for (const node of parent.childNodes) {
      if (node instanceof Text) {
        if (node.data) add(node.data, bold, italic);
      } else if (node instanceof HTMLElement) {
        if (node.tagName === 'BR') {
          add('\n', false, false);
          continue;
        }
        const block = node.tagName === 'DIV' || node.tagName === 'P';
        if (block) breakPending = true;
        walk(node, isBold(node, bold), isItalic(node, italic));
        if (block) breakPending = true;
      }
    }
  };
  walk(root, false, false);
  // A final line break draws no line of its own; the browser keeps one as a placeholder.
  return serializeNote(runs).replace(/\n$/, '');
}
