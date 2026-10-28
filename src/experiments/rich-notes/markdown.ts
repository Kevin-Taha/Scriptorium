import type { Block, Inline } from './ast';
import { findClose, parseInline } from './inline';

const MAX_DEPTH = 3;
const LIST_MARKER = /^( *)([-+*]|(\d{1,9})[.)])( +)(\S.*)$/;
const QUOTE = /^ {0,3}>[ ]?(.*)$/;

interface Marker {
  indent: number;
  ordered: boolean;
  number: number;
  /** Column where the item's content starts. */
  offset: number;
  content: string;
}

function matchMarker(line: string): Marker | null {
  const match = LIST_MARKER.exec(line);
  if (!match) return null;
  const [, indent, marker, digits, spaces, content] = match;
  return {
    indent: indent.length,
    ordered: digits !== undefined,
    number: digits === undefined ? 1 : Number.parseInt(digits, 10),
    offset: indent.length + marker.length + Math.min(spaces.length, 4),
    content,
  };
}

const indentOf = (line: string) => line.length - line.trimStart().length;

interface DisplayMath {
  value: string;
  /** Text after the closing delimiter on its last line. */
  rest: string;
  next: number;
}

/** A `$$…$$` or `\[…\]` block starting at `lines[start]`, on one line or several (never across a blank line). */
function matchDisplayMath(lines: string[], start: number): DisplayMath | null {
  const first = lines[start].trimStart();
  const close = first.startsWith('$$') ? '$$' : first.startsWith('\\[') ? '\\]' : null;
  if (!close) return null;

  const parts: string[] = [];
  let text = first.slice(2);
  for (let i = start; i < lines.length; i++) {
    if (i > start) {
      text = lines[i];
      if (!text.trim()) return null;
    }
    const end = findClose(text, 0, close);
    if (end >= 0) {
      parts.push(text.slice(0, end));
      const value = parts.join('\n').trim();
      return value ? { value, rest: text.slice(end + 2).trim(), next: i + 1 } : null;
    }
    parts.push(text);
  }
  return null;
}

function startsBlock(line: string): boolean {
  const marker = matchMarker(line);
  return (
    (marker !== null && marker.indent <= 3) ||
    QUOTE.test(line) ||
    line.trimStart().startsWith('$$') ||
    line.trimStart().startsWith('\\[')
  );
}

function parseList(lines: string[], start: number, depth: number): { block: Block; next: number } {
  const first = matchMarker(lines[start]) as Marker;
  const items: string[][] = [];
  let current: string[] = [];
  let offset = first.offset;
  let afterBlank = false;
  let i = start;

  while (i < lines.length) {
    const line = lines[i];

    if (!line.trim()) {
      let ahead = i + 1;
      while (ahead < lines.length && !lines[ahead].trim()) ahead++;
      if (ahead >= lines.length) break;
      const marker = matchMarker(lines[ahead]);
      const sibling =
        marker !== null && marker.ordered === first.ordered && marker.indent <= first.indent + 1;
      if (!sibling && indentOf(lines[ahead]) < first.indent + 2) break;
      afterBlank = true;
      i++;
      continue;
    }

    const marker = matchMarker(line);
    const indent = indentOf(line);
    if (marker && indent <= first.indent + 1) {
      if (marker.ordered !== first.ordered) break;
      current = [marker.content];
      items.push(current);
      offset = marker.offset;
    } else if (indent >= first.indent + 2) {
      if (afterBlank) current.push('');
      current.push(line.slice(Math.min(indent, offset)));
    } else if (!afterBlank && !startsBlock(line)) {
      current.push(line.trim());
    } else {
      break;
    }
    afterBlank = false;
    i++;
  }

  return {
    block: {
      type: 'list',
      ordered: first.ordered,
      start: first.number,
      items: items.map((item) => parseBlocks(item, depth + 1)),
    },
    next: i,
  };
}

function parseBlocks(lines: string[], depth: number): Block[] {
  const blocks: Block[] = [];
  let paragraph: string[] = [];
  const flush = () => {
    if (paragraph.length === 0) return;
    blocks.push({
      type: 'paragraph',
      children: parseInline(paragraph.map((line) => line.trim()).join('\n')),
    });
    paragraph = [];
  };

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      flush();
      i++;
      continue;
    }

    const math = matchDisplayMath(lines, i);
    if (math) {
      flush();
      blocks.push({ type: 'math', value: math.value });
      if (math.rest) paragraph.push(math.rest);
      i = math.next;
      continue;
    }

    if (depth < MAX_DEPTH) {
      const quote = QUOTE.exec(line);
      if (quote) {
        flush();
        const inner: string[] = [];
        let match: RegExpExecArray | null = quote;
        while (match) {
          inner.push(match[1]);
          i++;
          match = i < lines.length ? QUOTE.exec(lines[i]) : null;
        }
        blocks.push({ type: 'quote', children: parseBlocks(inner, depth + 1) });
        continue;
      }

      const marker = matchMarker(line);
      if (
        marker &&
        marker.indent <= 3 &&
        (paragraph.length === 0 || !marker.ordered || marker.number === 1)
      ) {
        flush();
        const list = parseList(lines, i, depth);
        blocks.push(list.block);
        i = list.next;
        continue;
      }
    }

    paragraph.push(line);
    i++;
  }
  flush();
  return blocks;
}

/** Parses note text into blocks. Never throws; text that is not markup comes back as paragraphs. */
export function parseMarkdown(text: string): Block[] {
  return parseBlocks(text.replace(/\r\n?/g, '\n').replace(/\t/g, '    ').split('\n'), 0);
}

function inlineHasMath(nodes: Inline[]): boolean {
  return nodes.some(
    (node) =>
      node.type === 'math' ||
      ((node.type === 'strong' || node.type === 'em' || node.type === 'del' || node.type === 'link') &&
        inlineHasMath(node.children)),
  );
}

/** Whether any maths survives parsing (so `$5 and $10` does not count). */
export function hasMath(blocks: Block[]): boolean {
  return blocks.some((block) => {
    switch (block.type) {
      case 'math':
        return true;
      case 'paragraph':
        return inlineHasMath(block.children);
      case 'quote':
        return hasMath(block.children);
      default:
        return block.items.some(hasMath);
    }
  });
}
