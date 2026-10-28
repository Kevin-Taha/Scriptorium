import { Fragment, useMemo, type MouseEvent, type ReactNode } from 'react';
import { highlightSegments } from '@/features/notes/reviewFilter';
import type { Block, Inline } from './ast';
import { parseMarkdown } from './markdown';
import { TexMath } from './TexMath';
import './richNotes.css';

const NO_TERMS: string[] = [];

/** Nodes have no identity and the whole tree is rebuilt on every change, so position is the key. */
const at = (index: number) => `n${index}`;

/** Pressing a link opens it; it must not also start editing the note it sits in. */
const keepLinkPress = (event: MouseEvent<HTMLAnchorElement>) => event.stopPropagation();

function renderText(value: string, terms: string[]): ReactNode {
  if (terms.length === 0) return value;
  return highlightSegments(value, terms).map((segment, i) =>
    segment.match ? (
      <mark key={at(i)} className="review-mark">
        {segment.text}
      </mark>
    ) : (
      <Fragment key={at(i)}>{segment.text}</Fragment>
    ),
  );
}

function renderInline(nodes: Inline[], terms: string[]): ReactNode[] {
  return nodes.map((node, i) => {
    const key = at(i);
    switch (node.type) {
      case 'text':
        return <Fragment key={key}>{renderText(node.value, terms)}</Fragment>;
      case 'strong':
        return <strong key={key}>{renderInline(node.children, terms)}</strong>;
      case 'em':
        return <em key={key}>{renderInline(node.children, terms)}</em>;
      case 'del':
        return <del key={key}>{renderInline(node.children, terms)}</del>;
      case 'code':
        return <code key={key}>{renderText(node.value, terms)}</code>;
      case 'link':
        return (
          <a key={key} href={node.href} target="_blank" rel="noopener noreferrer" onClick={keepLinkPress}>
            {renderInline(node.children, terms)}
          </a>
        );
      case 'math':
        return <TexMath key={key} src={node.value} display={node.display} />;
      default:
        return <br key={key} />;
    }
  });
}

function renderBlocks(blocks: Block[], terms: string[]): ReactNode[] {
  return blocks.map((block, i) => {
    const key = at(i);
    switch (block.type) {
      case 'paragraph':
        return <p key={key}>{renderInline(block.children, terms)}</p>;
      case 'math':
        return <TexMath key={key} src={block.value} display />;
      case 'quote':
        return (
          <blockquote key={key} className="rich-quote">
            {renderBlocks(block.children, terms)}
          </blockquote>
        );
      default: {
        const items = block.items.map((item, j) => (
          <li key={at(j)}>
            {item.length === 1 && item[0].type === 'paragraph'
              ? renderInline(item[0].children, terms)
              : renderBlocks(item, terms)}
          </li>
        ));
        return block.ordered ? (
          <ol key={key} start={block.start === 1 ? undefined : block.start}>
            {items}
          </ol>
        ) : (
          <ul key={key}>{items}</ul>
        );
      }
    }
  });
}

interface RichTextProps {
  text: string;
  /** Folded search words to mark in the text (the review's filter). */
  terms?: string[];
}

/** A note's text as rendered Markdown and maths. */
export default function RichText({ text, terms = NO_TERMS }: RichTextProps) {
  const blocks = useMemo(() => parseMarkdown(text), [text]);
  return <div className="rich-note">{renderBlocks(blocks, terms)}</div>;
}
