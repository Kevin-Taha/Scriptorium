import { lazy, Suspense } from 'react';

// The parser, KaTeX glue and styles load as one chunk, the first time a note renders with
// the experiment on; with it off nothing here is ever fetched.
const RichText = lazy(() => import('./RichText'));
const RichEditAidsBody = lazy(() => import('./RichEditAids'));

export { plainPreview } from './plainPreview';

interface RichNoteTextProps {
  text: string;
  /** Folded search words to mark in the text (the review's filter). */
  terms?: string[];
}

/** A note's text rendered as Markdown and maths (plain text for the instant before the chunk arrives). */
export function RichNoteText({ text, terms }: RichNoteTextProps) {
  return (
    <Suspense fallback={text}>
      <RichText text={text} terms={terms} />
    </Suspense>
  );
}

/** The hint (and a live maths preview) shown under a note's editor. */
export function RichEditAids({ text }: { text: string }) {
  return (
    <Suspense fallback={null}>
      <RichEditAidsBody text={text} />
    </Suspense>
  );
}
