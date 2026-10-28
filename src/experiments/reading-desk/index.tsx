import type { ExperimentModule } from '../types';
import { DeskRecorder } from './DeskRecorder';

/**
 * Experiment "reading-desk" — see ../registry.ts for what it does and how to try it.
 * The library renders `ReadingDesk` itself (gated in LibraryView); the reader slot
 * remembers each book's chapters so the library can show chapter-level progress.
 */
const experiment: ExperimentModule = {
  Reader: DeskRecorder,
};

export default experiment;
