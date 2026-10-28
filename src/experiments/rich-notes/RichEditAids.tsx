import { useMemo } from 'react';
import { hasMath, parseMarkdown } from './markdown';
import RichText from './RichText';
import { TexMath } from './TexMath';

/** Under a note's editor: what is supported, and a live preview once the text contains maths. */
export default function RichEditAids({ text }: { text: string }) {
  const showPreview = useMemo(() => hasMath(parseMarkdown(text)), [text]);
  return (
    <>
      <div className="rich-hint">
        Markdown and <TexMath src="\LaTeX" fallback="LaTeX" /> supported
      </div>
      {showPreview && (
        <div className="rich-preview" role="group" aria-label="Preview">
          <RichText text={text} />
        </div>
      )}
    </>
  );
}
