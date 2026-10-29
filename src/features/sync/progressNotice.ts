import { showToast } from '@/components/Toast';
import { getReadingState } from '@/lib/storage/repository';
import { onBookDataMerged } from '@/lib/sync/apply';
import { currentDeviceId } from '@/lib/sync/device';
import type { DocId, ReadingLocation, ReadingState } from '@/lib/types';
import { isAtStart } from '@/lib/util';
import { isSamePlace, useHistoryStore } from '../navigation/historyStore';
import { formatPageRef } from '../navigation/pageLabels';
import { useReaderStore } from '../reader/readerStore';
import { useSyncStore } from './syncStore';

const NOTICE_MS = 9_000;

/** The name another device gave itself in the folder, or a neutral fallback. */
export function deviceName(id: string): string {
  return useSyncStore.getState().devices.find((device) => device.id === id)?.name ?? 'another device';
}

/** True when the progress was saved by another device (older positions carry no device). */
export function isFromAnotherDevice(progress: ReadingState | undefined, ownId: string | undefined): boolean {
  return !!progress?.deviceId && progress.deviceId !== ownId;
}

function currentLocation(): ReadingLocation {
  const { controller, location } = useReaderStore.getState();
  return controller?.getLocation() ?? location;
}

function offerJump(progress: ReadingState): void {
  const { pageLabels } = useReaderStore.getState();
  showToast(
    `You were on ${formatPageRef(pageLabels, progress.location.page)} on ${deviceName(progress.deviceId!)}`,
    {
      action: { label: 'Go there', onAction: () => useHistoryStore.getState().jumpTo(progress.location) },
      durationMs: NOTICE_MS,
    },
  );
}

/**
 * Tells the reader about reading positions from their other devices, never
 * moving the page under them:
 *
 * - opening a book last read elsewhere: "Picked up where you left off on …";
 * - while reading, another device's newer position arrives: "You were on p. N
 *   on …" with a "Go there" action (recorded in history, so Return works).
 */
export function startProgressNotices(): () => void {
  let announced: string | null = null;
  const key = (progress: ReadingState) => `${progress.docId}:${progress.deviceId}:${progress.updatedAt}`;

  const announceOpened = async (docId: DocId) => {
    const saved = await getReadingState(docId);
    const reader = useReaderStore.getState();
    if (reader.docId !== docId || reader.status !== 'ready') return;
    if (!saved || !isFromAnotherDevice(saved, currentDeviceId()) || isAtStart(saved.location)) return;
    announced = key(saved);
    if (isSamePlace(reader.location, saved.location)) {
      showToast(
        `Picked up where you left off on ${deviceName(saved.deviceId!)} · ${formatPageRef(reader.pageLabels, saved.location.page)}`,
        { durationMs: NOTICE_MS },
      );
    } else {
      offerJump(saved);
    }
  };

  const offReader = useReaderStore.subscribe((state, prev) => {
    if (state.status === 'ready' && state.docId && (prev.status !== 'ready' || prev.docId !== state.docId)) {
      void announceOpened(state.docId);
    }
  });

  const offMerged = onBookDataMerged((docId, data) => {
    const reader = useReaderStore.getState();
    const progress = data.progress;
    if (reader.docId !== docId || reader.status !== 'ready' || !progress) return;
    if (!isFromAnotherDevice(progress, currentDeviceId()) || announced === key(progress)) return;
    announced = key(progress);
    if (!isSamePlace(currentLocation(), progress.location)) offerJump(progress);
  });

  return () => {
    offReader();
    offMerged();
  };
}
