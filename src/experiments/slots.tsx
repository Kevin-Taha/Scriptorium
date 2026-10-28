import { Component, useMemo, type ReactNode } from 'react';
import { useExperimentsStore } from './experimentsStore';
import { MODULES } from './modules';
import { EXPERIMENT_IDS, type ExperimentId } from './registry';
import type { ExperimentModule, PageSlotProps } from './types';

type SimpleSlot = Exclude<keyof ExperimentModule, 'PageOverlay'>;

class ExperimentBoundary extends Component<{ id: ExperimentId; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.error(`Experiment “${this.props.id}” crashed and was hidden.`, error);
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}

function useEnabledIds(): ExperimentId[] {
  const enabled = useExperimentsStore((s) => s.enabled);
  return useMemo(() => EXPERIMENT_IDS.filter((id) => enabled[id]), [enabled]);
}

/** Renders the `name` component of every switched-on experiment that provides one. */
export function ExperimentSlot({ name }: { name: SimpleSlot }) {
  const ids = useEnabledIds();
  return (
    <>
      {ids.map((id) => {
        const Slot = MODULES[id][name];
        return Slot ? (
          <ExperimentBoundary key={id} id={id}>
            <Slot />
          </ExperimentBoundary>
        ) : null;
      })}
    </>
  );
}

/** Per-page overlays from switched-on experiments. */
export function PageOverlaySlot({ page, size }: PageSlotProps) {
  const ids = useEnabledIds();
  return (
    <>
      {ids.map((id) => {
        const Overlay = MODULES[id].PageOverlay;
        return Overlay ? (
          <ExperimentBoundary key={id} id={id}>
            <Overlay page={page} size={size} />
          </ExperimentBoundary>
        ) : null;
      })}
    </>
  );
}
