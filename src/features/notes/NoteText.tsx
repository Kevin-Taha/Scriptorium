import { Fragment, type ReactNode, useMemo } from 'react';
import { parseNote } from './noteFormat';
import { markRuns } from './reviewFilter';

const NO_TERMS: string[] = [];

/** A note's text with its bold and italic, and any folded search `terms` marked. */
export function NoteText({ text, terms = NO_TERMS }: { text: string; terms?: string[] }) {
  const runs = useMemo(() => markRuns(parseNote(text), terms), [text, terms]);
  return runs.map((run, i) => {
    let node: ReactNode = run.text;
    if (run.match) node = <mark className="review-mark">{node}</mark>;
    if (run.italic) node = <em>{node}</em>;
    if (run.bold) node = <strong>{node}</strong>;
    return typeof node === 'string' ? (
      node
    ) : (
      // biome-ignore lint/suspicious/noArrayIndexKey: runs have no identity and are rebuilt as a whole
      <Fragment key={i}>{node}</Fragment>
    );
  });
}
