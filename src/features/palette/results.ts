import { resolvePageInput } from '../navigation/pageLabels';
import { matchPrepared, normalizeQuery, prepareFuzzyText, type FuzzyMatch, type FuzzyText } from './fuzzy';

export type Group = 'Contents' | 'Bookmarks' | 'Notes & highlights' | 'Actions';

export interface Candidate {
  id: string;
  group: Group;
  title: string;
  detail?: string;
  hint?: string;
  icon: 'contents' | 'bookmark' | 'note' | 'highlight' | 'action';
  suggested?: boolean;
  current?: boolean;
  run(): void;
  titleText: FuzzyText;
  detailText?: FuzzyText;
}

export function candidate(input: Omit<Candidate, 'titleText' | 'detailText'>): Candidate {
  return {
    ...input,
    titleText: prepareFuzzyText(input.title),
    detailText: input.detail ? prepareFuzzyText(input.detail) : undefined,
  };
}

export interface Ranked {
  item: Candidate;
  score: number;
  titleMatch?: FuzzyMatch;
  detailMatch?: FuzzyMatch;
}

export function pageQuery(labels: readonly string[] | null, query: string, count: number): number | null {
  const trimmed = query.trim();
  const direct = resolvePageInput(labels, trimmed, count);
  if (direct !== null) return direct;
  const prefix = /^(?:p\.?|page)\s+(.+)$/i.exec(trimmed);
  return prefix ? resolvePageInput(labels, prefix[1], count) : null;
}

/** Keep matching bounded while preserving the original order for ties. */
export function rankCandidates(candidates: Candidate[], query: string): Map<Group, Ranked[]> {
  const needle = normalizeQuery(query);
  const groups = new Map<Group, Ranked[]>();
  for (const item of candidates) {
    if (!needle && !item.suggested) continue;
    const titleMatch = needle ? matchPrepared(needle, item.titleText) : null;
    const detailMatch = needle && item.detailText ? matchPrepared(needle, item.detailText) : null;
    if (needle && !titleMatch && !detailMatch) continue;
    const score = needle
      ? Math.max(titleMatch?.score ?? -Infinity, (detailMatch?.score ?? -Infinity) - 5)
      : item.current
        ? 1
        : 0;
    const row: Ranked = {
      item,
      score,
      titleMatch: titleMatch ?? undefined,
      detailMatch: detailMatch ?? undefined,
    };
    const rows = groups.get(item.group) ?? [];
    const index = rows.findIndex((other) => score > other.score);
    if (index < 0) rows.push(row);
    else rows.splice(index, 0, row);
    if (rows.length > 8) rows.pop();
    groups.set(item.group, rows);
  }
  return groups;
}
