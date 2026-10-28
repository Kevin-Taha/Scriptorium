import { create } from 'zustand';
import type { DocId } from '@/lib/types';
import { debounce } from '@/lib/util';
import { pageRuns } from './geometry';

/**
 * Pages the reader has actually spent time on, per book — the rail shades
 * them like the darkened fore-edge of a well-thumbed book. Kept separately
 * from the shared reading log because that one also records every page a
 * scrub or a fast scroll passes over.
 *
 * Stored as compact runs ("1-4,7,9-12") under `scriptorium.exp.minimap.read`.
 */
const STORAGE_KEY = 'scriptorium.exp.minimap.read';

type Trails = Record<DocId, string>;

export function encodeRuns(pages: Iterable<number>): string {
  const sorted = [...new Set(pages)].filter((p) => Number.isInteger(p) && p > 0).sort((a, b) => a - b);
  return pageRuns(sorted)
    .map(([first, last]) => (first === last ? `${first}` : `${first}-${last}`))
    .join(',');
}

export function decodeRuns(value: string | undefined): [number, number][] {
  if (!value) return [];
  const runs: [number, number][] = [];
  for (const part of value.split(',')) {
    const match = /^(\d+)(?:-(\d+))?$/.exec(part.trim());
    if (!match) continue;
    const first = Number(match[1]);
    const last = match[2] ? Number(match[2]) : first;
    if (first > 0 && last >= first) runs.push([first, last]);
  }
  return runs;
}

/** Adds pages to an encoded trail; returns the same string when nothing changed. */
export function addToTrail(trail: string | undefined, pages: readonly number[]): string {
  const known = new Set<number>();
  for (const [first, last] of decodeRuns(trail)) for (let p = first; p <= last; p++) known.add(p);
  const before = known.size;
  for (const page of pages) if (Number.isInteger(page) && page > 0) known.add(page);
  if (known.size === before && trail !== undefined) return trail;
  return encodeRuns(known);
}

function load(): Trails {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as Trails) : null;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export const useReadTrailStore = create<{ trails: Trails }>()(() => ({ trails: load() }));

const save = debounce(() => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(useReadTrailStore.getState().trails));
  } catch {
    // Best-effort prototype data.
  }
}, 1000);

export function markPagesRead(docId: DocId, pages: readonly number[]): void {
  const { trails } = useReadTrailStore.getState();
  const next = addToTrail(trails[docId], pages);
  if (next === trails[docId]) return;
  useReadTrailStore.setState({ trails: { ...trails, [docId]: next } });
  save();
}

export function flushReadTrail(): void {
  save.flush();
}
