import { create } from 'zustand';
import { readPageSelection } from '../notes/selectionNote';
import type { Box } from '../reader/linkPeekGeometry';
import { useReaderStore } from '../reader/readerStore';
import { type DictionaryEntry, LookupUnavailableError, lookUpWord, termFromSelection } from './dictionary';

export type Lookup =
  | { status: 'loading' }
  | { status: 'found'; entry: DictionaryEntry }
  | { status: 'not-found' }
  | { status: 'unavailable' };

export interface DefineState {
  /** The word being looked up; null when no lookup is showing. */
  term: string | null;
  /** Viewport rectangle of the selected text, for placing the card. */
  anchor: Box | null;
  lookup: Lookup;
}

const IDLE: DefineState = { term: null, anchor: null, lookup: { status: 'loading' } };

export const useDefineStore = create<DefineState>()(() => IDLE);

let pending: AbortController | null = null;

/** Looks up the selected text if it is a word or short phrase. False, doing nothing, otherwise. */
export function lookUpSelection(): boolean {
  const selection = readPageSelection();
  const term = selection && termFromSelection(selection.text);
  if (!selection || !term) return false;
  const { top, left, bottom, right } = selection.endRect;
  lookUp(term, { top, left, bottom, right });
  return true;
}

/** Shows the dictionary entry for `term` beside `anchor` (by default, where the card already is). */
export function lookUp(term: string, anchor: Box | null = useDefineStore.getState().anchor): void {
  pending?.abort();
  const abort = new AbortController();
  pending = abort;
  useDefineStore.setState({ term, anchor, lookup: { status: 'loading' } });
  lookUpWord(term, abort.signal).then(
    (entry) => {
      if (pending !== abort) return;
      useDefineStore.setState({ lookup: entry ? { status: 'found', entry } : { status: 'not-found' } });
    },
    (error: unknown) => {
      if (pending !== abort) return;
      if (!(error instanceof LookupUnavailableError)) console.error(error);
      useDefineStore.setState({ lookup: { status: 'unavailable' } });
    },
  );
}

export function closeDefinition(): void {
  pending?.abort();
  pending = null;
  useDefineStore.setState(IDLE);
}

useReaderStore.subscribe((state, previous) => {
  if (state.docId !== previous.docId) closeDefinition();
});
