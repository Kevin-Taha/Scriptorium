import { useEffect } from 'react';
import { useReaderStore } from '@/features/reader/readerStore';
import { isEditableTarget } from '@/lib/util';
import { EXPERIMENT_EVENTS, useExperimentEvent } from '../shared/events';
import type { ExperimentModule } from '../types';
import { useFollowAlong } from './follow';
import { MiniPlayer } from './MiniPlayer';
import { recoverSpeech, usePlayer } from './player';
import { ReadAloudButton } from './ReadAloudButton';
import { ReadAloudHighlight } from './ReadAloudHighlight';
import { useVoices } from './voices';

/** Shift+A toggles play/pause; Esc stops while reading. */
function useReadAloudKeys(): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (isEditableTarget(event.target) || document.querySelector('dialog:modal')) return;
      if (event.key === 'Escape') {
        // The reader's own Esc handler (dismissing the Return pill) always marks the event handled,
        // so "handled" cannot mean "someone else needs this Esc" here.
        if (usePlayer.getState().status !== 'idle') usePlayer.getState().stop();
        return;
      }
      if (event.shiftKey && event.key.toLowerCase() === 'a' && !event.defaultPrevented && !event.repeat) {
        event.preventDefault();
        usePlayer.getState().toggle();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
}

/** Mounted in the reader: shortcuts, follow-along, cleanup and the mini player. */
function ReadAloud() {
  const docId = useReaderStore((s) => s.docId);
  useVoices(); // browsers load their voice list lazily; asking early means it is ready on first play
  useExperimentEvent(EXPERIMENT_EVENTS.toggleReadAloud, () => usePlayer.getState().toggle());
  useReadAloudKeys();
  useFollowAlong();

  // Stops when the book changes or closes, and when the experiment is switched off (unmount).
  useEffect(() => {
    void docId;
    return () => usePlayer.getState().stop();
  }, [docId]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') recoverSpeech();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);

  return <MiniPlayer />;
}

/** Experiment "read-aloud" — see ../registry.ts for what it does and how to try it. */
const experiment: ExperimentModule = {
  Reader: ReadAloud,
  ReaderToolbar: ReadAloudButton,
  PageOverlay: ReadAloudHighlight,
};

export default experiment;
