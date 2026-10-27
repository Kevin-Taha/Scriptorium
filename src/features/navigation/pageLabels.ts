import { useReaderStore } from '../reader/readerStore';

export function pageLabelFor(labels: readonly string[] | null, page: number): string {
  return labels?.[page - 1] || String(page);
}

export function usePageLabel(page: number): string {
  return useReaderStore((state) => pageLabelFor(state.pageLabels, page));
}

export function formatPageRef(labels: readonly string[] | null, page: number): string {
  return `p. ${pageLabelFor(labels, page)}`;
}

export function resolvePageInput(
  labels: readonly string[] | null,
  input: string,
  pageCount: number,
): number | null {
  const value = input.trim();
  if (!value) return null;

  const forced = /^#(\d+)$/.exec(value);
  if (forced) {
    const page = Number(forced[1]);
    return Number.isSafeInteger(page) && page >= 1 && page <= pageCount ? page : null;
  }

  const normalized = value.toLowerCase();
  const index =
    labels?.findIndex((label, index) => index < pageCount && label.toLowerCase() === normalized) ?? -1;
  if (index >= 0) return index + 1;
  if (!/^\d+$/.test(value)) return null;
  const page = Number(value);
  return Number.isSafeInteger(page) && page >= 1 && page <= pageCount ? page : null;
}
