import chapterProgress from './chapter-progress';
import commandPalette from './command-palette';
import flashcards from './flashcards';
import focusMode from './focus-mode';
import minimap from './minimap';
import pdfExport from './pdf-export';
import pinnedPane from './pinned-pane';
import readAloud from './read-aloud';
import readingDesk from './reading-desk';
import type { ExperimentId } from './registry';
import richNotes from './rich-notes';
import type { ExperimentModule } from './types';
import welcomeBack from './welcome-back';

export const MODULES: Record<ExperimentId, ExperimentModule> = {
  'command-palette': commandPalette,
  minimap,
  'focus-mode': focusMode,
  'chapter-progress': chapterProgress,
  'welcome-back': welcomeBack,
  'reading-desk': readingDesk,
  'pinned-pane': pinnedPane,
  'rich-notes': richNotes,
  flashcards,
  'pdf-export': pdfExport,
  'read-aloud': readAloud,
};
