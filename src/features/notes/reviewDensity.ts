import { useCallback, useState } from 'react';

export type ReviewDensity = 'comfortable' | 'dense';

export const DENSITY_STORAGE_KEY = 'scriptorium.reviewDensity';

export function parseDensity(value: string | null): ReviewDensity {
  return value === 'dense' ? 'dense' : 'comfortable';
}

export function readDensity(): ReviewDensity {
  try {
    return parseDensity(localStorage.getItem(DENSITY_STORAGE_KEY));
  } catch {
    return 'comfortable';
  }
}

export function writeDensity(density: ReviewDensity): void {
  try {
    localStorage.setItem(DENSITY_STORAGE_KEY, density);
  } catch {
    // The choice still applies for this session when storage is unavailable.
  }
}

/** The review's density, remembered across visits. */
export function useReviewDensity(): [ReviewDensity, (density: ReviewDensity) => void] {
  const [density, setDensity] = useState(readDensity);
  const update = useCallback((next: ReviewDensity) => {
    setDensity(next);
    writeDensity(next);
  }, []);
  return [density, update];
}
