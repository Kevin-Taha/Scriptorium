import type { ExperimentModule } from '../types';
import { MinimapRail } from './MinimapRail';
import './minimap.css';

/** Experiment "minimap" — see ../registry.ts for what it does and how to try it. */
const experiment: ExperimentModule = {
  Reader: MinimapRail,
};

export default experiment;
