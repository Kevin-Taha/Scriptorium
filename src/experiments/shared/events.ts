import { useEffect, useRef } from 'react';
import type { ReadingLocation } from '@/lib/types';

/**
 * Window events experiments use to trigger each other (e.g. the command
 * palette starting a flashcard session) without importing each other.
 */
export const EXPERIMENT_EVENTS = {
  /** Open the flashcard study session for the open book. */
  studyFlashcards: 'scriptorium:study-flashcards',
  /** Enter or leave focus mode. */
  toggleFocus: 'scriptorium:toggle-focus',
  /** Pin a page in the reference pane; detail: `PinPageDetail` (defaults to the current location). */
  pinPage: 'scriptorium:pin-page',
  /** Start, pause or resume reading aloud. */
  toggleReadAloud: 'scriptorium:toggle-read-aloud',
  /** Download the annotated PDF for the open book. */
  exportAnnotatedPdf: 'scriptorium:export-annotated-pdf',
} as const;

export type ExperimentEventName = (typeof EXPERIMENT_EVENTS)[keyof typeof EXPERIMENT_EVENTS];

export interface PinPageDetail {
  location?: ReadingLocation;
  /** Optional label, e.g. the link text "Figure 2.1". */
  title?: string;
}

export function emitExperimentEvent(name: ExperimentEventName, detail?: unknown): void {
  window.dispatchEvent(new CustomEvent(name, { detail }));
}

/** Subscribes to an experiment event while the calling component is mounted. */
export function useExperimentEvent<T = unknown>(
  name: ExperimentEventName,
  handler: (detail: T) => void,
): void {
  const latest = useRef(handler);
  useEffect(() => {
    latest.current = handler;
  });
  useEffect(() => {
    const listener = (event: Event) => latest.current((event as CustomEvent<T>).detail);
    window.addEventListener(name, listener);
    return () => window.removeEventListener(name, listener);
  }, [name]);
}
