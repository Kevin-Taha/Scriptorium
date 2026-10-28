import { useEffect } from 'react';
import type { ExperimentModule } from '../types';

/** Fetches the renderer (and KaTeX) in the background, so notes render rich on first sight. */
function Preload() {
  useEffect(() => {
    void import('./RichText');
    void import('./katex').then((module) => module.loadKatex()).catch(() => {});
  }, []);
  return null;
}

/**
 * Experiment "rich-notes" — see ../registry.ts for what it does and how to try it.
 * The rendering itself lives in the notes components (MarginNoteCard, ReviewNote), which
 * use `RichNoteText` from ./RichNoteText while the experiment is on.
 */
const experiment: ExperimentModule = { App: Preload };

export default experiment;
