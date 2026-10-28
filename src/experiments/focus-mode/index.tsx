import type { ExperimentModule } from '../types';
import { FocusReader } from './FocusReader';
import { FocusToolbarButton } from './FocusToolbarButton';

/** Experiment "focus-mode" — see ../registry.ts for what it does and how to try it. */
const experiment: ExperimentModule = {
  Reader: FocusReader,
  ReaderToolbar: FocusToolbarButton,
};

export default experiment;
