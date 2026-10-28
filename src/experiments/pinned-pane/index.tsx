import type { ExperimentModule } from '../types';
import { PinnedPane } from './PinnedPane';

/** Experiment "pinned-pane" — see ../registry.ts for what it does and how to try it. */
const experiment: ExperimentModule = { Reader: PinnedPane };

export default experiment;
